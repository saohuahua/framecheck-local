import type { ValidatedPortableBundle } from './schema'
import type { GeneratedBundleReader } from './generated-bundle-reader'
import {
  BundleError,
  type BundleImportProgress,
  type BundleProvenance,
  type LocalBundleRecord,
  type PortableBundleSummary,
  type StoredBundleArtifacts,
} from './types'
import { BundleImportEngine, type ImportEngineProgress } from '../importer/bundle-import-engine'
import { indexedDbBundleIndex, type IndexedDbBundleIndex } from '../storage/indexeddb-index'
import { opfsBundleStore, type OpfsBundleStore } from '../storage/opfs-bundle-store'
import { storageManager, type StorageManager } from '../storage/storage-manager'

export interface BundleImporter {
  prepare(
    jobId: string,
    file: File,
    onProgress: (progress: ImportEngineProgress) => void,
  ): Promise<PortableBundleSummary>
  extract(
    jobId: string,
    stagingPrefix: string,
    onProgress: (progress: ImportEngineProgress) => void,
  ): Promise<void>
  cancel(jobId: string): void
  terminate(): void
}

export interface BundleImportTask {
  promise: Promise<LocalBundleRecord>
  cancel: () => void
}

export interface OpenedBundle {
  record: LocalBundleRecord
  artifacts: StoredBundleArtifacts
  validated: ValidatedPortableBundle
}

export interface BundleModule {
  importBrowserFile(file: File): Promise<LocalBundleRecord>
  openGenerated(jobId: string): Promise<LocalBundleRecord>
  open(localBundleId: string): Promise<OpenedBundle>
}

export interface BundleRepositoryDependencies {
  index: Pick<IndexedDbBundleIndex, 'delete' | 'findCacheHit' | 'get' | 'list' | 'put' | 'updateOpened' | 'updatePreferences'>
  storage: Pick<OpfsBundleStore, 'commitStaging' | 'deletePrefix' | 'isSupported' | 'listFiles' | 'readFile'>
  storageManager: Pick<StorageManager, 'ensureAvailable' | 'requestPersistence'>
  createImporter: () => BundleImporter
  generatedBundleReader?: GeneratedBundleReader
  now: () => Date
  makeId: () => string
}

const defaultDependencies: BundleRepositoryDependencies = {
  index: indexedDbBundleIndex,
  storage: opfsBundleStore,
  storageManager,
  createImporter: () => new BundleImportEngine(),
  now: () => new Date(),
  makeId: () => crypto.randomUUID(),
}

function importState(
  status: BundleImportProgress['status'],
  patch: Omit<BundleImportProgress, 'status'>,
): BundleImportProgress {
  return { status, ...patch }
}

function formatRecord(
  summary: PortableBundleSummary,
  localBundleId: string,
  importedAt: string,
  provenance: BundleProvenance,
): LocalBundleRecord {
  return {
    localBundleId,
    importedAt,
    provenance,
    archiveName: summary.archiveName,
    archiveSize: summary.archiveSize,
    sourceSha256: summary.sourceSha256,
    portableSchemaVersion: summary.portableSchemaVersion,
    storagePrefix: `bundles/${localBundleId}`,
    status: summary.status,
    storageBytes: summary.storageBytes,
    canvasWidth: summary.canvasWidth,
    canvasHeight: summary.canvasHeight,
    diagnosticsCount: summary.diagnosticsCount,
    lastOpenedAt: importedAt,
    preferences: {
      lastScale: 0.54,
      leftTab: 'layers',
      rightTab: 'annotation',
    },
  }
}

function failureStatus(bundleError: BundleError): BundleImportProgress['status'] {
  if (bundleError.code === 'cancelled') {
    return 'cancelled'
  }

  if (bundleError.code === 'storage-full') {
    return 'storage-full'
  }

  return 'failed'
}

export class BundleRepository implements BundleModule {
  private readonly dependencies: BundleRepositoryDependencies
  private generatedBundleReader: GeneratedBundleReader | undefined

  constructor(dependencies: BundleRepositoryDependencies = defaultDependencies) {
    this.dependencies = dependencies
    this.generatedBundleReader = dependencies.generatedBundleReader
  }

  async initialize(): Promise<void> {
    await this.dependencies.storageManager.requestPersistence()
  }

  async list(): Promise<LocalBundleRecord[]> {
    return this.dependencies.index.list()
  }

  async importBrowserFile(file: File): Promise<LocalBundleRecord> {
    return this.createImportTask(file, () => {}).promise
  }

  setGeneratedBundleReader(reader: GeneratedBundleReader | undefined): void {
    this.generatedBundleReader = reader
  }

  createImportTask(
    file: File,
    onProgress: (progress: BundleImportProgress) => void,
  ): BundleImportTask {
    return this.createFileImportTask(file, onProgress, { type: 'browser-file' })
  }

  async openGenerated(jobId: string): Promise<LocalBundleRecord> {
    return this.createGeneratedImportTask(jobId, () => {}).promise
  }

  createGeneratedImportTask(
    jobId: string,
    onProgress: (progress: BundleImportProgress) => void,
  ): BundleImportTask {
    let cancelled = false
    let importTask: BundleImportTask | undefined
    let cancelRead: ((error: BundleError) => void) | undefined
    const normalizedJobId = jobId.trim()

    const cancel = () => {
      cancelled = true
      importTask?.cancel()
      cancelRead?.(new BundleError('cancelled', '导入已取消'))
    }

    onProgress(importState('importing', { stage: 'checking', message: '读取桌面任务生成的 Bundle' }))
    const cancelledRead = new Promise<File>((_resolve, reject) => {
      cancelRead = reject
    })
    const promise = Promise.race([
      this.readGeneratedBundle(normalizedJobId),
      cancelledRead,
    ])
      .then((file) => {
        if (cancelled) {
          throw new BundleError('cancelled', '导入已取消')
        }

        importTask = this.createFileImportTask(file, onProgress, {
          type: 'generated',
          jobId: normalizedJobId,
        })
        if (cancelled) {
          importTask.cancel()
        }
        return importTask.promise
      })
      .catch((error: unknown) => {
        if (importTask) {
          throw error
        }

        const bundleError = error instanceof BundleError
          ? error
          : new BundleError(
              'generated-bundle-read-failed',
              error instanceof Error ? error.message : '无法读取桌面任务生成的 Bundle',
            )
        onProgress(importState(failureStatus(bundleError), { message: bundleError.message }))
        throw bundleError
      })

    return { promise, cancel }
  }

  private createFileImportTask(
    file: File,
    onProgress: (progress: BundleImportProgress) => void,
    provenance: BundleProvenance,
  ): BundleImportTask {
    const importer = this.dependencies.createImporter()
    const jobId = this.dependencies.makeId()
    const stagingPrefix = `staging/${jobId}`
    let cancelled = false

    const cancel = () => {
      cancelled = true
      importer.cancel(jobId)
    }

    const promise = this.import(file, importer, jobId, stagingPrefix, onProgress, () => cancelled, provenance)
    return { promise, cancel }
  }

  async open(localBundleId: string): Promise<OpenedBundle> {
    const record = await this.dependencies.index.get(localBundleId)
    if (!record) {
      throw new BundleError('invalid-archive', '本地 Bundle 记录不存在')
    }

    const [bundleFile, designFile, assetsFile, diagnosticsFile, reference] = await Promise.all([
      this.dependencies.storage.readFile(record.storagePrefix, 'bundle.json'),
      this.dependencies.storage.readFile(record.storagePrefix, 'design.json'),
      this.dependencies.storage.readFile(record.storagePrefix, 'assets.json'),
      this.dependencies.storage.readFile(record.storagePrefix, 'diagnostics.json'),
      this.dependencies.storage.readFile(record.storagePrefix, 'reference.png'),
    ])
    const { parsePortableBundleArtifacts } = await import('./schema')
    const validated = parsePortableBundleArtifacts({
      bundle: await bundleFile.text(),
      design: await designFile.text(),
      assets: await assetsFile.text(),
      diagnostics: await diagnosticsFile.text(),
    })
    const openedAt = this.dependencies.now().toISOString()
    await this.dependencies.index.updateOpened(localBundleId, openedAt)

    return {
      record: { ...record, lastOpenedAt: openedAt },
      validated,
      artifacts: {
        bundle: validated.bundle,
        design: validated.design,
        assets: validated.assets,
        diagnostics: validated.diagnostics,
        reference,
      },
    }
  }

  async export(localBundleId: string): Promise<Blob> {
    const record = await this.requireRecord(localBundleId)
    const paths = await this.dependencies.storage.listFiles(record.storagePrefix)
    const { BlobReader, BlobWriter, ZipWriter } = await import('@zip.js/zip.js')
    const writer = new ZipWriter(new BlobWriter('application/zip'))

    try {
      for (const path of paths) {
        const file = await this.dependencies.storage.readFile(record.storagePrefix, path)
        await writer.add(path, new BlobReader(file))
      }
      return await writer.close()
    } catch (error) {
      await writer.close().catch(() => undefined)
      throw error
    }
  }

  async readArtifact(localBundleId: string, path: string): Promise<File> {
    const record = await this.requireRecord(localBundleId)
    return this.dependencies.storage.readFile(record.storagePrefix, path)
  }

  async delete(localBundleId: string): Promise<void> {
    const record = await this.requireRecord(localBundleId)
    await this.dependencies.storage.deletePrefix(record.storagePrefix)
    await this.dependencies.index.delete(localBundleId)
  }

  async updatePreferences(localBundleId: string, preferences: LocalBundleRecord['preferences']): Promise<void> {
    if (!preferences) {
      return
    }

    await this.dependencies.index.updatePreferences(localBundleId, preferences)
  }

  private async import(
    file: File,
    importer: BundleImporter,
    jobId: string,
    stagingPrefix: string,
    onProgress: (progress: BundleImportProgress) => void,
    isCancelled: () => boolean,
    provenance: BundleProvenance,
  ): Promise<LocalBundleRecord> {
    let storagePrefix: string | undefined
    try {
      if (!(await this.dependencies.storage.isSupported())) {
        throw new BundleError('unsupported-browser', '当前浏览器不支持本地 OPFS 缓存')
      }
      onProgress(importState('importing', { stage: 'checking', message: '准备读取本地 Bundle' }))
      const summary = await importer.prepare(jobId, file, (progress) => {
        onProgress(importState('importing', progress))
      })

      if (isCancelled()) {
        throw new BundleError('cancelled', '导入已取消')
      }

      const cacheHit = await this.dependencies.index.findCacheHit(
        summary.sourceSha256,
        summary.portableSchemaVersion,
      )
      if (cacheHit && await this.isCacheUsable(cacheHit)) {
        onProgress(importState('cache-hit', { record: cacheHit, message: '已从本地缓存打开' }))
        return cacheHit
      }

      await this.dependencies.storageManager.ensureAvailable(summary.storageBytes * 2)
      if (isCancelled()) {
        throw new BundleError('cancelled', '导入已取消')
      }

      const localBundleId = this.dependencies.makeId()
      const record = formatRecord(summary, localBundleId, this.dependencies.now().toISOString(), provenance)
      storagePrefix = record.storagePrefix
      await importer.extract(jobId, stagingPrefix, (progress) => {
        onProgress(importState('importing', progress))
      })

      if (isCancelled()) {
        throw new BundleError('cancelled', '导入已取消')
      }

      onProgress(importState('importing', { stage: 'committing', message: '提交本地缓存' }))
      await this.dependencies.storage.commitStaging(stagingPrefix, storagePrefix)
      try {
        await this.dependencies.index.put(record)
      } catch (error) {
        await this.dependencies.storage.deletePrefix(storagePrefix)
        throw error
      }

      onProgress(importState(record.status, { record, message: '已保存到本地缓存' }))
      return record
    } catch (error) {
      await this.dependencies.storage.deletePrefix(stagingPrefix)
      if (storagePrefix) {
        await this.dependencies.storage.deletePrefix(storagePrefix)
      }

      const bundleError = error instanceof BundleError
        ? error
        : new BundleError('storage-failed', error instanceof Error ? error.message : '本地导入失败')
      onProgress(importState(failureStatus(bundleError), { message: bundleError.message }))
      throw bundleError
    } finally {
      importer.terminate()
    }
  }

  private async requireRecord(localBundleId: string): Promise<LocalBundleRecord> {
    const record = await this.dependencies.index.get(localBundleId)
    if (!record) {
      throw new BundleError('invalid-archive', '本地 Bundle 记录不存在')
    }

    return record
  }

  private async readGeneratedBundle(jobId: string): Promise<File> {
    if (!jobId) {
      throw new BundleError('generated-bundle-not-found', '桌面任务不存在')
    }

    const reader = this.generatedBundleReader
    if (!reader) {
      throw new BundleError('generated-bundle-unavailable', '当前运行环境不能读取桌面任务生成的 Bundle')
    }

    try {
      return await reader.read(jobId)
    } catch (error) {
      if (error instanceof BundleError) {
        throw error
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new BundleError('cancelled', '导入已取消')
      }

      throw new BundleError(
        'generated-bundle-read-failed',
        error instanceof Error ? error.message : '无法读取桌面任务生成的 Bundle',
      )
    }
  }

  private async isCacheUsable(record: LocalBundleRecord): Promise<boolean> {
    try {
      await this.dependencies.storage.readFile(record.storagePrefix, 'bundle.json')
      return true
    } catch {
      await this.dependencies.storage.deletePrefix(record.storagePrefix)
      await this.dependencies.index.delete(record.localBundleId)
      return false
    }
  }
}

export const bundleRepository = new BundleRepository()

export function setGeneratedBundleReader(reader: GeneratedBundleReader | undefined): void {
  bundleRepository.setGeneratedBundleReader(reader)
}
