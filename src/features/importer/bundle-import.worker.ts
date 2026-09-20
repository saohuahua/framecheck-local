import { BlobReader, TextWriter, ZipReader, configure, type FileEntry } from '@zip.js/zip.js'
import {
  resolveBundleStatus,
  toArchiveEntryMeta,
  validateArchiveEntries,
  validateAssetReferences,
} from '../bundle/archive-validation'
import { parsePortableBundleArtifacts } from '../bundle/schema'
import { BundleError, type PortableBundleSummary } from '../bundle/types'
import { opfsBundleStore } from '../storage/opfs-bundle-store'
import type { ImportWorkerRequest, ImportWorkerResponse } from './import-protocol'

configure({ useWebWorkers: false })

interface PreparedJob {
  file: File
  artifactPaths: string[]
  summary: PortableBundleSummary
}

const preparedJobs = new Map<string, PreparedJob>()
const controllers = new Map<string, AbortController>()
const cancelledJobs = new Set<string>()

self.addEventListener('message', (event: MessageEvent<ImportWorkerRequest>) => {
  void handleMessage(event.data)
})

async function handleMessage(message: ImportWorkerRequest) {
  if (message.type === 'cancel') {
    controllers.get(message.jobId)?.abort()
    preparedJobs.delete(message.jobId)
    cancelledJobs.add(message.jobId)
    return
  }

  if (message.type === 'prepare') {
    await prepareArchive(message.jobId, message.file)
    return
  }

  await extractArchive(message.jobId, message.stagingPrefix)
}

function post(message: ImportWorkerResponse) {
  self.postMessage(message)
}

function postProgress(
  jobId: string,
  stage: 'checking' | 'validating' | 'extracting',
  completed: number,
  total: number,
  message: string,
) {
  post({ type: 'progress', jobId, stage, completed, total, message })
}

function asFileEntry(entry: Awaited<ReturnType<ZipReader<Blob>['getEntries']>>[number]): FileEntry {
  if (entry.directory) {
    throw new BundleError('invalid-archive', `预期文件条目却收到目录 ${entry.filename}`)
  }
  return entry
}

function asBundleError(error: unknown): BundleError {
  if (error instanceof BundleError) {
    return error
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new BundleError('cancelled', '导入已取消')
  }

  return new BundleError('invalid-archive', error instanceof Error ? error.message : '无法读取 Bundle 压缩包')
}

async function readJsonEntry(
  entries: Map<string, Awaited<ReturnType<ZipReader<Blob>['getEntries']>>[number]>,
  path: string,
  signal: AbortSignal,
): Promise<string> {
  const entry = entries.get(path)
  if (!entry) {
    throw new BundleError('missing-artifact', `Bundle 缺少必需工件 ${path}`)
  }

  return asFileEntry(entry).getData(new TextWriter(), { checkCrc32: true, signal })
}

async function prepareArchive(jobId: string, file: File) {
  if (cancelledJobs.delete(jobId)) {
    post({ type: 'cancelled', jobId })
    return
  }

  const controller = new AbortController()
  controllers.set(jobId, controller)
  const reader = new ZipReader(new BlobReader(file), { strictness: 'strict' })

  try {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      throw new BundleError('invalid-archive', '仅支持 .psd-bundle.zip 文件')
    }

    postProgress(jobId, 'checking', 0, 4, '读取压缩包目录')
    const entries = await reader.getEntries()
    if (controller.signal.aborted) {
      throw new BundleError('cancelled', '导入已取消')
    }
    const storageBytes = validateArchiveEntries(entries.map(toArchiveEntryMeta), file.size)
    const entryMap = new Map(entries.map((entry) => [entry.filename, entry]))

    postProgress(jobId, 'validating', 1, 4, '校验 bundle.json')
    const bundle = await readJsonEntry(entryMap, 'bundle.json', controller.signal)
    const design = await readJsonEntry(entryMap, 'design.json', controller.signal)
    postProgress(jobId, 'validating', 2, 4, '校验资源和诊断')
    const assets = await readJsonEntry(entryMap, 'assets.json', controller.signal)
    const diagnostics = await readJsonEntry(entryMap, 'diagnostics.json', controller.signal)
    const validated = parsePortableBundleArtifacts({ bundle, design, assets, diagnostics })
    const archivePaths = new Set(entries.filter((entry) => !entry.directory).map((entry) => entry.filename))
    const assetPaths = validateAssetReferences(validated.assets, archivePaths)
    const status = resolveBundleStatus(validated)
    const summary: PortableBundleSummary = {
      archiveName: file.name,
      archiveSize: file.size,
      sourceName: validated.bundle.source.name,
      sourceSha256: validated.bundle.source.sha256,
      portableSchemaVersion: validated.bundle.schemaVersion,
      status,
      storageBytes,
      canvasWidth: validated.design.document.width,
      canvasHeight: validated.design.document.height,
      diagnosticsCount: validated.diagnostics.design.length + validated.diagnostics.assets.length,
      assetPaths,
    }

    preparedJobs.set(jobId, {
      file,
      artifactPaths: ['bundle.json', 'design.json', 'reference.png', 'assets.json', 'diagnostics.json', ...assetPaths],
      summary,
    })
    post({ type: 'validated', jobId, summary })
  } catch (error) {
    const bundleError = asBundleError(error)
    post(bundleError.code === 'cancelled'
      ? { type: 'cancelled', jobId }
      : { type: 'failed', jobId, error: { code: bundleError.code, message: bundleError.message } })
  } finally {
    controllers.delete(jobId)
    await reader.close()
  }
}

async function extractArchive(jobId: string, stagingPrefix: string) {
  if (cancelledJobs.delete(jobId)) {
    post({ type: 'cancelled', jobId })
    return
  }

  const prepared = preparedJobs.get(jobId)
  if (!prepared) {
    post({
      type: 'failed',
      jobId,
      error: { code: 'invalid-archive', message: '导入任务已失效，请重新选择文件' },
    })
    return
  }

  const controller = new AbortController()
  controllers.set(jobId, controller)
  const reader = new ZipReader(new BlobReader(prepared.file), { strictness: 'strict' })

  try {
    await opfsBundleStore.deletePrefix(stagingPrefix)
    const entries = await reader.getEntries()
    if (controller.signal.aborted) {
      throw new BundleError('cancelled', '导入已取消')
    }
    const entryMap = new Map(entries.map((entry) => [entry.filename, entry]))
    const total = prepared.artifactPaths.length

    for (const [index, path] of prepared.artifactPaths.entries()) {
      if (controller.signal.aborted) {
        throw new BundleError('cancelled', '导入已取消')
      }

      const entry = entryMap.get(path)
      if (!entry) {
        throw new BundleError('missing-artifact', `导入时找不到工件 ${path}`)
      }

      postProgress(jobId, 'extracting', index, total, `写入 ${path}`)
      const writable = await opfsBundleStore.createWritable(stagingPrefix, path)
      try {
        await asFileEntry(entry).getData(writable, {
          checkCrc32: true,
          signal: controller.signal,
        })
      } catch (error) {
        await writable.abort()
        throw error
      }
    }

    postProgress(jobId, 'extracting', total, total, '完成本地 staging')
    post({ type: 'extracted', jobId })
  } catch (error) {
    await opfsBundleStore.deletePrefix(stagingPrefix)
    const bundleError = asBundleError(error)
    post(bundleError.code === 'cancelled'
      ? { type: 'cancelled', jobId }
      : { type: 'failed', jobId, error: { code: bundleError.code, message: bundleError.message } })
  } finally {
    controllers.delete(jobId)
    preparedJobs.delete(jobId)
    await reader.close()
  }
}
