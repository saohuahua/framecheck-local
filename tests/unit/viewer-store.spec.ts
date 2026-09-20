import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { activeViewerSession } from '../../src/features/workspace/bundle-session'
import type { ViewerAsset } from '../../src/features/viewer/types'
import { useViewerStore } from '../../src/features/viewer/viewer-store'

describe('viewer store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useViewerStore().openDemo()
  })

  it('将旧缓存迁移到开发视图', () => {
    const viewer = useViewerStore()

    viewer.restorePreferences({ leftTab: 'layers' })

    expect(viewer.leftTab).toBe('development')
  })

  it('保留当前布局版本保存的图层视图偏好', () => {
    const viewer = useViewerStore()

    viewer.restorePreferences({ viewerLayoutVersion: 2, leftTab: 'layers' })

    expect(viewer.leftTab).toBe('layers')
  })

  it('选择切图时同步对象 资源高亮和属性面板', () => {
    const viewer = useViewerStore()

    viewer.selectAsset('asset-speaker', 'speaker-render', true)

    expect(viewer.selectedLayerId).toBe('speaker-render')
    expect(viewer.selectedAssetId).toBe('asset-speaker')
    expect(viewer.selectedAssetIds).toEqual(['asset-speaker'])
    expect(viewer.rightTab).toBe('properties')
  })

  it('测量模式使用悬浮对象作为距离目标', () => {
    const viewer = useViewerStore()

    viewer.inspectLayer('hero-title')
    viewer.setTool('measure')
    viewer.hoveredLayerId = 'speaker-render'

    expect(viewer.measureStartId).toBe('hero-title')
    expect(viewer.measurementTarget?.id).toBe('speaker-render')
  })

  it('自由测量始终使用画布两点作为起终点', () => {
    const viewer = useViewerStore()

    viewer.inspectLayer('hero-title')
    viewer.setTool('ruler')
    viewer.setRulerStart({ x: 100, y: 120 })
    viewer.setRulerEnd({ x: 240, y: 320 })

    expect(viewer.rulerStart).toEqual({ x: 100, y: 120 })
    expect(viewer.rulerEnd).toEqual({ x: 240, y: 320 })
    expect(viewer.selectedLayerId).toBe('hero-title')
    expect(viewer.measureStartId).toBeNull()
  })

  it('默认选择模式使用选中对象作为距离基准', () => {
    const viewer = useViewerStore()

    viewer.inspectLayer('hero-title')
    viewer.hoveredLayerId = 'speaker-render'

    expect(viewer.measurementStart?.id).toBe('hero-title')
    expect(viewer.measurementTarget?.id).toBe('speaker-render')
  })

  it('画布文案目标不会回退为同节点的切图', () => {
    const viewer = useViewerStore()
    const session = activeViewerSession.value
    if (!session) {
      throw new Error('演示会话不可用')
    }
    const asset: ViewerAsset = {
      id: 'hero-title-asset',
      displayName: 'Hero title asset',
      layerId: 'hero-title',
      marker: '-h-',
      name: 'hero-title.png',
      format: 'PNG',
      logicalSize: '550 x 152 px',
      pixelSize: '550 x 152 px',
      scales: '1x',
      placement: 'tight',
      files: [],
      placements: [{
        id: 'hero-title-placement',
        nodeId: 'hero-title',
        bounds: { x: 84, y: 208, width: 550, height: 152 },
        lineageNodeIds: ['hero-title'],
      }],
    }
    activeViewerSession.value = { ...session, assets: [...session.assets, asset] }

    viewer.inspectCanvasTarget({
      id: 'text:hero-title',
      kind: 'text',
      layerId: 'hero-title',
      bounds: { x: 84, y: 208, width: 550, height: 152 },
    })

    expect(viewer.selectedAsset).toBeUndefined()
    expect(viewer.selectedAssetPlacement).toBeUndefined()
  })

  it('图层树主动选择已导出文案时仍展示文案', () => {
    const viewer = useViewerStore()
    const session = activeViewerSession.value
    if (!session) {
      throw new Error('演示会话不可用')
    }
    const asset: ViewerAsset = {
      id: 'hero-title-asset',
      displayName: 'Hero title asset',
      layerId: 'hero-title',
      marker: '-h-',
      name: 'hero-title.png',
      format: 'PNG',
      logicalSize: '550 x 152 px',
      pixelSize: '550 x 152 px',
      scales: '1x',
      placement: 'tight',
      files: [],
      placements: [{
        id: 'hero-title-placement',
        nodeId: 'hero-title',
        bounds: { x: 84, y: 208, width: 550, height: 152 },
        lineageNodeIds: ['hero-title'],
      }],
    }
    activeViewerSession.value = { ...session, assets: [...session.assets, asset] }

    viewer.inspectLayer('hero-title')

    expect(viewer.selectedAsset).toBeUndefined()
    expect(viewer.selectedAssetPlacement).toBeUndefined()
  })
})
