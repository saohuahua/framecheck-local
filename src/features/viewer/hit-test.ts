import type { Bounds, BoundsMode, CanvasSelectionTarget, DesignLayer, ViewerAsset, ViewerAssetPlacement } from './types'

function boundsFor(layer: DesignLayer, mode: BoundsMode) {
  return mode === 'paint' && layer.paintBounds ? layer.paintBounds : layer.bounds
}

function placementBoundsFor(placement: ViewerAssetPlacement): Bounds {
  return placement.bounds
}

function contains(bounds: Bounds, x: number, y: number) {
  return x >= bounds.x
    && x <= bounds.x + bounds.width
    && y >= bounds.y
    && y <= bounds.y + bounds.height
}

export function findTopmostLayer(
  layers: DesignLayer[],
  x: number,
  y: number,
  mode: BoundsMode,
): DesignLayer | undefined {
  return layers
    .map((layer, index) => ({ index, layer }))
    .filter(({ layer }) => {
      const bounds = boundsFor(layer, mode)
      return layer.visible && contains(bounds, x, y)
    })
    .sort((left, right) => (right.layer.order ?? right.index) - (left.layer.order ?? left.index))[0]
    ?.layer
}

interface RankedSelectionTarget {
  target: CanvasSelectionTarget
  order: number
  index: number
}

function sortByStackOrder(left: RankedSelectionTarget, right: RankedSelectionTarget) {
  return right.order - left.order || right.index - left.index
}

export function findCanvasSelectionCandidates(
  layers: DesignLayer[],
  assets: ViewerAsset[],
  x: number,
  y: number,
  mode: BoundsMode,
): CanvasSelectionTarget[] {
  const indexedLayers = layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => layer.visible)
  const layerById = new Map(indexedLayers.map(({ layer, index }) => [layer.id, { layer, index }]))
  const assetTargets: RankedSelectionTarget[] = []

  for (const asset of assets) {
    for (const placement of asset.placements) {
      const indexedLayer = layerById.get(placement.nodeId)
      const bounds = placementBoundsFor(placement)
      if (!indexedLayer || !contains(bounds, x, y)) {
        continue
      }
      assetTargets.push({
        target: {
          id: `asset:${asset.id}:${placement.id}`,
          kind: 'asset',
          layerId: placement.nodeId,
          assetId: asset.id,
          placementId: placement.id,
          bounds,
        },
        order: indexedLayer.layer.order ?? indexedLayer.index,
        index: indexedLayer.index,
      })
    }
  }

  const textTargets = indexedLayers
    .filter(({ layer }) => layer.type === 'text' && Boolean(layer.text))
    .filter(({ layer }) => contains(boundsFor(layer, mode), x, y))
    .map(({ layer, index }) => ({
      target: {
        id: `text:${layer.id}`,
        kind: 'text' as const,
        layerId: layer.id,
        bounds: boundsFor(layer, mode),
      },
      order: layer.order ?? index,
      index,
    }))

  return [
    ...textTargets.sort(sortByStackOrder),
    ...assetTargets.sort(sortByStackOrder),
  ].map(({ target }) => target)
}
