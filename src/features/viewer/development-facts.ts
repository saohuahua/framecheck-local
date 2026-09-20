import type { Bounds, DesignLayer, ViewerAsset } from './types'

export interface DevelopmentCatalog {
  cutouts: ViewerAsset[]
  texts: DesignLayer[]
  backgrounds: ViewerAsset[]
  containers: DesignLayer[]
}

export function flattenDesignLayers(layers: DesignLayer[]): DesignLayer[] {
  return layers.flatMap((layer) => [layer, ...(layer.children ? flattenDesignLayers(layer.children) : [])])
}

export function primaryAssetBounds(asset: ViewerAsset): Bounds | undefined {
  return asset.placements[0]?.bounds
}

export function primaryAssetLayerId(asset: ViewerAsset): string | undefined {
  return asset.placements[0]?.nodeId ?? asset.layerId ?? asset.layerIds?.[0]
}

export function isBackgroundAsset(
  asset: ViewerAsset,
  canvas: { width: number; height: number },
): boolean {
  const bounds = primaryAssetBounds(asset)
  if (!bounds) {
    return false
  }

  const coversCanvas = bounds.width >= canvas.width * 0.9 && bounds.height >= canvas.height * 0.8
  const backgroundName = /背景|装饰|\bbg\b|background/i.test(asset.displayName)
  return coversCanvas || backgroundName && bounds.width >= canvas.width * 0.8
}

export function createDevelopmentCatalog(
  layers: DesignLayer[],
  assets: ViewerAsset[],
  canvas: { width: number; height: number },
): DevelopmentCatalog {
  const flatLayers = flattenDesignLayers(layers)
  const assetLayerIds = new Set(assets.flatMap((asset) => asset.layerIds ?? []))
  const backgrounds = assets.filter((asset) => isBackgroundAsset(asset, canvas))
  const backgroundIds = new Set(backgrounds.map((asset) => asset.id))

  return {
    cutouts: assets.filter((asset) => !backgroundIds.has(asset.id)),
    texts: flatLayers.filter((layer) => layer.visible && layer.type === 'text' && Boolean(layer.text?.trim())),
    backgrounds,
    containers: layers.filter((layer) => (
      layer.visible
      && layer.type === 'group'
      && !assetLayerIds.has(layer.id)
      && layer.bounds.width > 0
      && layer.bounds.height > 0
    )),
  }
}
