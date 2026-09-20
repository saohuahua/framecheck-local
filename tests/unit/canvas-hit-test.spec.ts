import { describe, expect, it } from 'vitest'
import { findCanvasSelectionCandidates, findTopmostLayer } from '../../src/features/viewer/hit-test'
import type { DesignLayer, ViewerAsset } from '../../src/features/viewer/types'

const baseLayer: DesignLayer = {
  id: 'base',
  name: 'Base',
  type: 'shape',
  order: 0,
  visible: true,
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  style: { opacity: 100, blendMode: 'normal' },
}

describe('findTopmostLayer', () => {
  it('重叠时选择 stack order 更高的图层', () => {
    const topLayer: DesignLayer = {
      ...baseLayer,
      id: 'top',
      name: 'Top',
      order: 2,
    }

    expect(findTopmostLayer([baseLayer, topLayer], 50, 50, 'logical')?.id).toBe('top')
  })

  it('paint 模式使用绘制边界', () => {
    const paintedLayer: DesignLayer = {
      ...baseLayer,
      id: 'painted',
      paintBounds: { x: -20, y: -20, width: 140, height: 140 },
    }

    expect(findTopmostLayer([paintedLayer], -10, -10, 'logical')).toBeUndefined()
    expect(findTopmostLayer([paintedLayer], -10, -10, 'paint')?.id).toBe('painted')
  })

  it('文案优先于切图并排除叠放在最上层的原始装饰节点', () => {
    const assetLayer: DesignLayer = {
      ...baseLayer,
      id: 'asset-layer',
      type: 'group',
      order: 1,
    }
    const textLayer: DesignLayer = {
      ...baseLayer,
      id: 'text-layer',
      type: 'text',
      text: '开发文案',
      order: 2,
    }
    const decorationLayer: DesignLayer = {
      ...baseLayer,
      id: 'decoration-layer',
      name: 'Mask overlay',
      order: 3,
    }
    const assets: ViewerAsset[] = [{
      id: 'asset-card',
      displayName: '完整切图',
      layerId: 'asset-layer',
      marker: '-h-',
      name: 'card.png',
      format: 'PNG',
      logicalSize: '100 x 100 px',
      pixelSize: '100 x 100 px',
      scales: '1x',
      placement: 'tight',
      files: [],
      placements: [{
        id: 'placement-card',
        nodeId: 'asset-layer',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        logicalBounds: { x: 90, y: 90, width: 10, height: 10 },
        lineageNodeIds: ['asset-layer'],
      }],
    }]

    expect(findCanvasSelectionCandidates([assetLayer, textLayer, decorationLayer], assets, 50, 50, 'logical'))
      .toMatchObject([
        { id: 'text:text-layer', kind: 'text', layerId: 'text-layer' },
        { id: 'asset:asset-card:placement-card', kind: 'asset', layerId: 'asset-layer' },
      ])
  })

  it('同时导出为切图的文案仍保留文案候选', () => {
    const textLayer: DesignLayer = {
      ...baseLayer,
      id: 'exported-text',
      type: 'text',
      text: '可导出文案',
    }
    const assets: ViewerAsset[] = [{
      id: 'text-asset',
      displayName: '可导出文案',
      layerId: 'exported-text',
      marker: '-h-',
      name: 'text.png',
      format: 'PNG',
      logicalSize: '100 x 100 px',
      pixelSize: '100 x 100 px',
      scales: '1x',
      placement: 'tight',
      files: [],
      placements: [{
        id: 'placement-text',
        nodeId: 'exported-text',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        lineageNodeIds: ['exported-text'],
      }],
    }]

    expect(findCanvasSelectionCandidates([textLayer], assets, 50, 50, 'logical')).toMatchObject([
      { id: 'text:exported-text', kind: 'text', layerId: 'exported-text' },
      { id: 'asset:text-asset:placement-text', kind: 'asset', layerId: 'exported-text' },
    ])
  })
})
