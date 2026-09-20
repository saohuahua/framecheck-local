import { describe, expect, it } from 'vitest'
import { getDevelopmentElements } from '../../src/features/viewer/development-elements'
import type { DesignLayer, ViewerAsset } from '../../src/features/viewer/types'

const layers: DesignLayer[] = [
  {
    id: 'background',
    name: '页面背景',
    type: 'image',
    order: 1,
    bounds: { x: 0, y: 0, width: 750, height: 1200 },
    visible: true,
    style: { opacity: 100, blendMode: 'normal' },
  },
  {
    id: 'title',
    name: '主标题',
    type: 'text',
    order: 2,
    bounds: { x: 48, y: 96, width: 300, height: 72 },
    visible: true,
    text: '报名开启',
    style: { opacity: 100, blendMode: 'normal' },
  },
  {
    id: 'card',
    name: '报名卡片',
    type: 'image',
    order: 3,
    bounds: { x: 40, y: 220, width: 670, height: 360 },
    visible: true,
    style: { opacity: 100, blendMode: 'normal' },
  },
]

const assets: ViewerAsset[] = [
  {
    id: 'card-asset',
    displayName: '报名卡片',
    layerId: 'card',
    layerIds: ['card'],
    marker: '-h-',
    name: 'card.png',
    format: 'PNG',
    logicalSize: '670 x 360 px',
    pixelSize: '670 x 360 px',
    scales: '1x',
    placement: 'tight',
    files: [{ scale: 1, path: 'assets/card.png' }],
    placements: [{
      id: 'card-placement',
      nodeId: 'card',
      bounds: { x: 40, y: 220, width: 670, height: 360 },
      lineageNodeIds: ['card'],
    }],
  },
]

describe('development elements', () => {
  it('优先输出已声明切图 文案与背景 并排除重复的原始节点', () => {
    const elements = getDevelopmentElements(layers, assets, { width: 750, height: 1200 })

    expect(elements.map((element) => [element.kind, element.layerId])).toEqual([
      ['background', 'background'],
      ['text', 'title'],
      ['asset', 'card'],
    ])
  })
})
