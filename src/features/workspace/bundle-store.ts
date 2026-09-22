import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { toLocalViewerPayload } from '../bundle/bundle-adapter'
import { bundleRepository, type BundleImportTask } from '../bundle/bundle-repository'
import type {
  BundleImportProgress,
  LocalBundlePreferences,
  LocalBundleRecord,
} from '../bundle/types'
import type { ViewerAsset } from '../viewer/types'
import { useViewerStore } from '../viewer/viewer-store'
import { activeViewerSession } from './bundle-session'

function initialProgress(): BundleImportProgress {
  return { status: 'idle' }
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export const useBundleStore = defineStore('bundle', () => {
  const records = ref<LocalBundleRecord[]>([])
  const importProgress = ref<BundleImportProgress>(initialProgress())
  const isInitialized = ref(false)
  const currentTask = ref<BundleImportTask | null>(null)
  const activeLocalBundleId = computed(() => activeViewerSession.value?.localBundleId)

  async function initialize() {
    if (isInitialized.value) {
      return
    }

    await bundleRepository.initialize()
    await refresh()
    isInitialized.value = true
    const lastOpened = records.value.find((record) => record.lastOpenedAt)
    if (lastOpened) {
      await open(lastOpened.localBundleId)
    }
  }

  async function refresh() {
    records.value = await bundleRepository.list()
  }

  async function importFile(file: File): Promise<LocalBundleRecord> {
    const task = bundleRepository.createImportTask(file, (progress) => {
      importProgress.value = progress
    })
    return runImportTask(task)
  }

  async function importGenerated(jobId: string): Promise<LocalBundleRecord> {
    const task = bundleRepository.createGeneratedImportTask(jobId, (progress) => {
      importProgress.value = progress
    })
    return runImportTask(task)
  }

  async function runImportTask(task: BundleImportTask): Promise<LocalBundleRecord> {
    currentTask.value = task

    try {
      const record = await task.promise
      await refresh()
      await open(record.localBundleId)
      return record
    } finally {
      currentTask.value = null
    }
  }

  function cancelImport() {
    currentTask.value?.cancel()
  }

  async function open(localBundleId: string) {
    const opened = await bundleRepository.open(localBundleId)
    const viewer = useViewerStore()
    viewer.openLocal(toLocalViewerPayload(opened))
    viewer.restorePreferences(opened.record.preferences)
    await refresh()
  }

  async function remove(localBundleId: string) {
    await bundleRepository.delete(localBundleId)
    if (activeLocalBundleId.value === localBundleId) {
      useViewerStore().closeViewer()
    }
    await refresh()
  }

  async function exportBundle(localBundleId: string) {
    const record = records.value.find((item) => item.localBundleId === localBundleId)
    if (!record) {
      return
    }

    const blob = await bundleRepository.export(localBundleId)
    triggerDownload(blob, record.archiveName)
  }

  async function readAsset(asset: ViewerAsset): Promise<Blob | undefined> {
    if (asset.previewUrl) {
      const response = await fetch(asset.previewUrl)
      if (response.ok) {
        return response.blob()
      }
    }

    const localBundleId = activeLocalBundleId.value
    if (!localBundleId || !asset.filePath) {
      return undefined
    }

    return bundleRepository.readArtifact(localBundleId, asset.filePath)
  }

  async function downloadAsset(asset: ViewerAsset) {
    const file = await readAsset(asset)
    if (!file) {
      return
    }

    triggerDownload(file, asset.name)
  }

  async function downloadAssets(assets: ViewerAsset[], archiveName: string) {
    const uniqueAssets = [...new Map(assets.map((asset) => [asset.id, asset])).values()]
    if (uniqueAssets.length === 1) {
      await downloadAsset(uniqueAssets[0])
      return
    }
    if (!uniqueAssets.length) {
      return
    }

    const { BlobReader, BlobWriter, ZipWriter } = await import('@zip.js/zip.js')
    const writer = new ZipWriter(new BlobWriter('application/zip'))
    let added = 0

    try {
      for (const asset of uniqueAssets) {
        const file = await readAsset(asset)
        if (!file) {
          continue
        }
        await writer.add(asset.name, new BlobReader(file))
        added += 1
      }
      const archive = await writer.close()
      if (added) {
        triggerDownload(archive, archiveName)
      }
    } catch (error) {
      await writer.close().catch(() => undefined)
      throw error
    }
  }

  async function loadAssetPreview(asset: ViewerAsset): Promise<string | undefined> {
    if (asset.previewUrl) {
      return asset.previewUrl
    }

    const localBundleId = activeLocalBundleId.value
    if (!localBundleId || !asset.filePath) {
      return undefined
    }

    const file = await bundleRepository.readArtifact(localBundleId, asset.filePath)
    return URL.createObjectURL(file)
  }

  async function persistPreferences(preferences: LocalBundlePreferences) {
    const localBundleId = activeLocalBundleId.value
    if (!localBundleId) {
      return
    }

    await bundleRepository.updatePreferences(localBundleId, preferences)
  }

  function clearImportProgress() {
    importProgress.value = initialProgress()
  }

  return {
    activeLocalBundleId,
    cancelImport,
    clearImportProgress,
    currentTask,
    downloadAsset,
    downloadAssets,
    exportBundle,
    importFile,
    importGenerated,
    importProgress,
    initialize,
    isInitialized,
    loadAssetPreview,
    open,
    persistPreferences,
    readAsset,
    records,
    refresh,
    remove,
  }
})
