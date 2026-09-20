import { shallowRef } from 'vue'
import demoProduct from '../../assets/demo-product.png'
import demoReference from '../../assets/demo-reference.png'
import { demoAssets, demoBundle, demoCanvas, demoDiagnostics, demoLayers, flattenLayers } from '../viewer/demo-bundle'
import type { DesignLayer, ViewerAsset, ViewerDiagnostic } from '../viewer/types'
import type { LocalBundleRecord } from '../bundle/types'
import type { LocalViewerPayload } from '../bundle/bundle-adapter'

export interface ViewerBundleSession {
  kind: 'demo' | 'local'
  localBundleId?: string
  archiveName: string
  sourceName: string
  status: 'demo' | 'ready' | 'partial'
  storageBytes?: number
  importedAt?: string
  canvas: {
    width: number
    height: number
  }
  referenceUrl: string
  layers: DesignLayer[]
  assets: ViewerAsset[]
  diagnostics: ViewerDiagnostic[]
}

let activeObjectUrl: string | undefined

function demoSession(): ViewerBundleSession {
  return {
    kind: 'demo',
    archiveName: demoBundle.name,
    sourceName: demoBundle.sourceName,
    status: 'demo',
    importedAt: demoBundle.importedAt,
    canvas: demoCanvas,
    referenceUrl: demoReference,
    layers: demoLayers,
    assets: demoAssets.map((asset) => ({ ...asset, previewUrl: demoProduct })),
    diagnostics: demoDiagnostics,
  }
}

export const activeViewerSession = shallowRef<ViewerBundleSession | null>(demoSession())

function releaseReferenceUrl() {
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl)
    activeObjectUrl = undefined
  }
}

export function openDemoViewerSession() {
  releaseReferenceUrl()
  activeViewerSession.value = demoSession()
}

export function openLocalViewerSession(payload: LocalViewerPayload) {
  releaseReferenceUrl()
  const referenceUrl = URL.createObjectURL(payload.reference)
  activeObjectUrl = referenceUrl
  activeViewerSession.value = {
    kind: 'local',
    localBundleId: payload.record.localBundleId,
    archiveName: payload.record.archiveName,
    sourceName: payload.sourceName,
    status: payload.record.status,
    storageBytes: payload.record.storageBytes,
    importedAt: payload.record.importedAt,
    canvas: payload.canvas,
    referenceUrl,
    layers: payload.layers,
    assets: payload.assets,
    diagnostics: payload.diagnostics,
  }
}

export function clearViewerSession() {
  releaseReferenceUrl()
  activeViewerSession.value = null
}

export function findSessionLayer(id: string | null): DesignLayer | undefined {
  if (!id || !activeViewerSession.value) {
    return undefined
  }

  return flattenLayers(activeViewerSession.value.layers).find((layer) => layer.id === id)
}

export function findSessionAsset(id: string | null): ViewerAsset | undefined {
  if (!id || !activeViewerSession.value) {
    return undefined
  }

  return activeViewerSession.value.assets.find((asset) => asset.id === id)
}

export function findSessionAssetForLayer(layerId: string | null): ViewerAsset | undefined {
  if (!layerId || !activeViewerSession.value) {
    return undefined
  }

  return activeViewerSession.value.assets.find((asset) => (
    asset.layerId === layerId || asset.layerIds?.includes(layerId)
  ))
}

export function activeLocalRecord(): Pick<LocalBundleRecord, 'localBundleId' | 'status'> | undefined {
  const session = activeViewerSession.value
  if (!session || session.kind !== 'local' || !session.localBundleId) {
    return undefined
  }

  return {
    localBundleId: session.localBundleId,
    status: session.status === 'partial' ? 'partial' : 'ready',
  }
}
