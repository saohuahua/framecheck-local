import type { ValidatedPortableBundle } from './schema'
import {
  BundleError,
  type BundleImportProgress,
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

export interface BundleRepositoryDependencies {
  index: Pick<IndexedDbBundleIndex, 'delete' | 'findCacheHit' | 'get' | 'list' | 'put' | 'updateOpened' | 'updatePreferences'>
  storage: Pick<OpfsBundleStore, 'commitStaging' | 'deletePrefix' | 'isSupported' | 'listFiles' | 'readFile'>
  storageManager: Pick<StorageManager, 'ensureAvailable' | 'requestPersistence'>
  createImporter: () => BundleImporter
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
): LocalBundleRecord {
  return {
    localBundleId,
    importedAt,
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

export class BundleRepository {
  private readonly dependencies: BundleRepositoryDependencies

  constructor(dependencies: BundleRepositoryDependencies = defaultDependencies) {
    this.dependencies = dependencies
  }

  async initialize(): Promise<void> {
    await this.dependencies.storageManager.requestPersistence()
  }

  async list(): Promise<LocalBundleRecord[]> {
    return this.dependencies.index.list()
  }

  createImportTask(
    file: File,
    onProgress: (progress: BundleImportProgress) => void,
  ): BundleImportTask {
    const importer = this.dependencies.createImporter()
    const jobId = this.dependencies.makeId()
    const stagingPrefix = `staging/${jobId}`
    let cancelled = false

    const cancel = () => {
      cancelled = true
      importer.cancel(jobId)
    }

    const promise = this.import(file, importer, jobId, stagingPrefix, onProgress, () => cancelled)
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
      const record = formatRecord(summary, localBundleId, this.dependencies.now().toISOString())
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
      const status = bundleError.code === 'cancelled'
        ? 'cancelled'
        : bundleError.code === 'storage-full'
          ? 'storage-full'
          : 'failed'
      onProgress(importState(status, { message: bundleError.message }))
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
