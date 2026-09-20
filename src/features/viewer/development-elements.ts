import type { Bounds, DesignLayer, ViewerAsset } from './types'

export type DevelopmentElementKind = 'asset' | 'text' | 'background'

export interface DevelopmentElement {
  id: string
  kind: DevelopmentElementKind
  layerId: string
  assetId?: string
  name: string
  detail: string
  bounds: Bounds
  order: number
  text?: string
}

export interface DevelopmentElementCanvas {
  width: number
  height: number
}

export function flattenLayerTree(layers: DesignLayer[]): DesignLayer[] {
  return layers.flatMap((layer) => [layer, ...(layer.children ? flattenLayerTree(layer.children) : [])])
}

function formatSize(bounds: Bounds) {
  return `${bounds.width} x ${bounds.height} px`
}

function isBackgroundCandidate(layer: DesignLayer, canvas: DevelopmentElementCanvas) {
  const name = layer.name.toLowerCase()
  const namedBackground = /background|\bbg\b|背景|底图|底板/.test(name)
  const coversCanvas = layer.bounds.width >= canvas.width * 0.72 && layer.bounds.height >= canvas.height * 0.5
  return namedBackground || (layer.type !== 'group' && !layer.text && coversCanvas)
}

export function getDevelopmentElements(
  layers: DesignLayer[],
  assets: ViewerAsset[],
  canvas: DevelopmentElementCanvas,
): DevelopmentElement[] {
  const flattenedLayers = flattenLayerTree(layers)
  const layerById = new Map(flattenedLayers.map((layer) => [layer.id, layer]))
  const representedLayerIds = new Set<string>()
  const elements: DevelopmentElement[] = []

  for (const asset of assets) {
    const placements = asset.placements.length
      ? asset.placements
      : (asset.layerIds ?? (asset.layerId ? [asset.layerId] : [])).map((layerId) => ({
          id: layerId,
          nodeId: layerId,
          bounds: layerById.get(layerId)?.bounds ?? { x: 0, y: 0, width: 0, height: 0 },
          lineageNodeIds: [layerId],
        }))

    placements.forEach((placement, index) => {
      const layer = layerById.get(placement.nodeId)
      representedLayerIds.add(placement.nodeId)
      elements.push({
        id: `asset:${asset.id}:${placement.id}`,
        kind: 'asset',
        layerId: placement.nodeId,
        assetId: asset.id,
        name: placements.length > 1 ? `${asset.displayName} ${index + 1}` : asset.displayName,
        detail: `${asset.format} · ${formatSize(placement.bounds)}`,
        bounds: placement.bounds,
        order: layer?.order ?? index,
      })
    })
  }

  for (const layer of flattenedLayers) {
    if (!layer.text || representedLayerIds.has(layer.id)) {
      continue
    }
    representedLayerIds.add(layer.id)
    elements.push({
      id: `text:${layer.id}`,
      kind: 'text',
      layerId: layer.id,
      name: layer.name,
      detail: `文案 · ${formatSize(layer.bounds)}`,
      bounds: layer.bounds,
      order: layer.order ?? 0,
      text: layer.text,
    })
  }

  for (const layer of flattenedLayers) {
    if (representedLayerIds.has(layer.id) || !isBackgroundCandidate(layer, canvas)) {
      continue
    }
    elements.push({
      id: `background:${layer.id}`,
      kind: 'background',
      layerId: layer.id,
      name: layer.name,
      detail: `背景 · ${formatSize(layer.bounds)}`,
      bounds: layer.bounds,
      order: layer.order ?? 0,
    })
  }

  return elements.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'zh-CN'))
}

export function getDevelopmentLayerIds(
  layers: DesignLayer[],
  assets: ViewerAsset[],
  canvas: DevelopmentElementCanvas,
) {
  return new Set(getDevelopmentElements(layers, assets, canvas).map((element) => element.layerId))
}
