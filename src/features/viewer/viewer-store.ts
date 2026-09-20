import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  activeViewerSession,
  clearViewerSession,
  findSessionAsset,
  findSessionAssetForLayer,
  findSessionLayer,
  openDemoViewerSession,
  openLocalViewerSession,
} from '../workspace/bundle-session'
import type { BoundsMode, CanvasSelectionTarget, MeasurementPoint, ViewerLeftTab, ViewerRightTab, ViewerTool } from './types'
import type { LocalViewerPayload } from '../bundle/bundle-adapter'
import type { LocalBundlePreferences } from '../bundle/types'

export const useViewerStore = defineStore('viewer', () => {
  const leftTab = ref<ViewerLeftTab>('development')
  const rightTab = ref<ViewerRightTab>('annotation')
  const selectedLayerId = ref<string | null>('hero-title')
  const selectedAssetId = ref<string | null>(null)
  const selectedAssetIds = ref<string[]>([])
  const hoveredLayerId = ref<string | null>(null)
  const canvasSelectionResetVersion = ref(0)
  const selectedCanvasTarget = ref<CanvasSelectionTarget | null>(null)
  const hoveredCanvasTarget = ref<CanvasSelectionTarget | null>(null)
  const measureStartId = ref<string | null>(null)
  const measureTargetId = ref<string | null>(null)
  const measureStartCanvasTarget = ref<CanvasSelectionTarget | null>(null)
  const measureTargetCanvasTarget = ref<CanvasSelectionTarget | null>(null)
  const rulerStart = ref<MeasurementPoint | null>(null)
  const rulerEnd = ref<MeasurementPoint | null>(null)
  const expandedLayerIds = ref<string[]>(['navigation', 'hero', 'specification'])
  const tool = ref<ViewerTool>('select')
  const boundsMode = ref<BoundsMode>('logical')
  const showBounds = ref(false)
  const showGrid = ref(false)
  const showRulers = ref(false)
  const scale = ref(0.54)
  const translateX = ref(90)
  const translateY = ref(46)
  const revealTargetId = ref<string | null>(null)
  const revealVersion = ref(0)

  const isDemoOpen = computed(() => activeViewerSession.value?.kind === 'demo')
  const isOpen = computed(() => Boolean(activeViewerSession.value))
  const selectedLayer = computed(() => findSessionLayer(selectedLayerId.value))
  const selectedAsset = computed(() => {
    const target = selectedCanvasTarget.value
    if (target?.kind === 'text' || (!target && !selectedAssetId.value && selectedLayer.value?.type === 'text')) {
      return undefined
    }
    return findSessionAsset(target?.assetId ?? selectedAssetId.value) ?? findSessionAssetForLayer(selectedLayerId.value)
  })
  const selectedAssetPlacement = computed(() => {
    const asset = selectedAsset.value
    if (!asset) {
      return undefined
    }
    const target = selectedCanvasTarget.value
    if (target?.kind === 'asset' && target.assetId === asset.id && target.placementId) {
      return asset.placements.find((placement) => placement.id === target.placementId)
    }
    return asset.placements.find((placement) => placement.nodeId === selectedLayerId.value) ?? asset.placements[0]
  })
  const selectedAssetLayerIds = computed(() => {
    const layerIds = new Set<string>()
    for (const assetId of selectedAssetIds.value) {
      const asset = findSessionAsset(assetId)
      for (const layerId of asset?.layerIds ?? (asset?.layerId ? [asset.layerId] : [])) {
        layerIds.add(layerId)
      }
    }
    return [...layerIds]
  })
  const measureStart = computed(() => findSessionLayer(measureStartId.value))
  const measureTarget = computed(() => findSessionLayer(measureTargetId.value))
  const measurementStart = computed(() => {
    if (tool.value === 'ruler') {
      return undefined
    }
    return tool.value === 'measure' ? measureStart.value ?? selectedLayer.value : selectedLayer.value
  })
  const measurementTarget = computed(() => {
    const start = measurementStart.value
    if (!start) {
      return undefined
    }

    if (tool.value === 'measure' && measureTarget.value && measureTarget.value.id !== start.id) {
      return measureTarget.value
    }

    const hoveredLayer = findSessionLayer(hoveredLayerId.value)
    return hoveredLayer?.id === start.id ? undefined : hoveredLayer
  })
  const measurementStartCanvasTarget = computed(() => {
    const target = tool.value === 'measure' ? measureStartCanvasTarget.value : selectedCanvasTarget.value
    return target?.layerId === measurementStart.value?.id ? target : undefined
  })
  const measurementTargetCanvasTarget = computed(() => {
    const target = tool.value === 'measure' && measureTarget.value
      ? measureTargetCanvasTarget.value
      : hoveredCanvasTarget.value
    return target?.layerId === measurementTarget.value?.id ? target : undefined
  })

  function openDemo() {
    openDemoViewerSession()
    leftTab.value = 'development'
    selectedLayerId.value = 'hero-title'
    selectedAssetId.value = null
    selectedAssetIds.value = []
    selectedCanvasTarget.value = null
    hoveredCanvasTarget.value = null
    resetCanvasSelectionCycle()
    revealLayer('hero-title')
    resetMeasurement()
    resetRulerMeasurement()
  }

  function openLocal(payload: LocalViewerPayload) {
    openLocalViewerSession(payload)
    leftTab.value = 'development'
    selectedLayerId.value = null
    selectedAssetId.value = null
    selectedAssetIds.value = []
    hoveredLayerId.value = null
    selectedCanvasTarget.value = null
    hoveredCanvasTarget.value = null
    resetCanvasSelectionCycle()
    expandedLayerIds.value = payload.layers.map((layer) => layer.id)
    resetMeasurement()
    resetRulerMeasurement()
  }

  function closeViewer() {
    clearViewerSession()
    selectedLayerId.value = null
    selectedAssetId.value = null
    selectedAssetIds.value = []
    hoveredLayerId.value = null
    selectedCanvasTarget.value = null
    hoveredCanvasTarget.value = null
    resetCanvasSelectionCycle()
    leftTab.value = 'files'
    resetMeasurement()
    resetRulerMeasurement()
  }

  function selectLayer(id: string) {
    if (tool.value === 'measure') {
      if (!measureStartId.value || measureStartId.value === id) {
        measureStartId.value = id
        measureTargetId.value = null
        measureStartCanvasTarget.value = null
        measureTargetCanvasTarget.value = null
      } else {
        measureTargetId.value = id
        measureTargetCanvasTarget.value = null
      }
      return
    }

    selectedLayerId.value = id
    selectedAssetId.value = findSessionLayer(id)?.type === 'text' ? null : findSessionAssetForLayer(id)?.id ?? null
    selectedCanvasTarget.value = null
    resetCanvasSelectionCycle()
  }

  function inspectCanvasTarget(target: CanvasSelectionTarget) {
    if (tool.value === 'measure') {
      if (!measureStartId.value || measureStartId.value === target.layerId) {
        measureStartId.value = target.layerId
        measureTargetId.value = null
        measureStartCanvasTarget.value = target
        measureTargetCanvasTarget.value = null
      } else {
        measureTargetId.value = target.layerId
        measureTargetCanvasTarget.value = target
      }
      return
    }

    selectedLayerId.value = target.layerId
    selectedAssetId.value = target.assetId ?? null
    selectedCanvasTarget.value = target
    rightTab.value = 'properties'
  }

  function setHoveredCanvasTarget(target: CanvasSelectionTarget | null) {
    hoveredCanvasTarget.value = target
    hoveredLayerId.value = target?.layerId ?? null
  }

  function setMeasureTargetCanvasTarget(target: CanvasSelectionTarget) {
    measureTargetId.value = target.layerId
    measureTargetCanvasTarget.value = target
  }

  function setRulerEnd(point: MeasurementPoint) {
    rulerEnd.value = point
  }

  function setRulerStart(point: MeasurementPoint) {
    rulerStart.value = point
    rulerEnd.value = null
  }

  function resetCanvasSelectionCycle() {
    canvasSelectionResetVersion.value += 1
  }

  function inspectLayer(id: string, reveal = false) {
    if (tool.value === 'measure') {
      setTool('select')
    }
    selectLayer(id)
    rightTab.value = 'properties'
    if (reveal) {
      revealLayer(id)
    }
  }

  function selectAsset(assetId: string, layerId?: string, inspect = false) {
    const asset = findSessionAsset(assetId)
    const targetLayerId = layerId ?? asset?.layerIds?.[0] ?? asset?.layerId
    selectedAssetId.value = assetId
    if (!selectedAssetIds.value.includes(assetId)) {
      selectedAssetIds.value = [...selectedAssetIds.value, assetId]
    }
    if (targetLayerId) {
      if (tool.value === 'measure') {
        setTool('select')
      }
      selectLayer(targetLayerId)
      const placement = asset?.placements.find((item) => item.nodeId === targetLayerId) ?? asset?.placements[0]
      selectedCanvasTarget.value = placement
        ? {
            id: `asset:${assetId}:${placement.id}`,
            kind: 'asset',
            layerId: targetLayerId,
            assetId,
            placementId: placement.id,
            bounds: placement.bounds,
          }
        : null
      revealLayer(targetLayerId)
    }
    rightTab.value = inspect ? 'properties' : 'assets'
  }

  function toggleAsset(assetId: string) {
    selectedAssetIds.value = selectedAssetIds.value.includes(assetId)
      ? selectedAssetIds.value.filter((item) => item !== assetId)
      : [...selectedAssetIds.value, assetId]
    selectedAssetId.value = assetId
    rightTab.value = 'assets'
  }

  function setSelectedAssets(assetIds: string[]) {
    selectedAssetIds.value = [...new Set(assetIds)]
    selectedAssetId.value = selectedAssetIds.value.at(-1) ?? null
    rightTab.value = 'assets'
  }

  function setTool(nextTool: ViewerTool) {
    tool.value = nextTool
    if (nextTool === 'select') {
      resetMeasurement()
      resetRulerMeasurement()
      return
    }
    if (nextTool === 'ruler') {
      resetMeasurement()
      resetRulerMeasurement()
      setHoveredCanvasTarget(null)
      return
    }
    resetRulerMeasurement()
    if (selectedLayerId.value) {
      measureStartId.value = selectedLayerId.value
      measureTargetId.value = null
      measureStartCanvasTarget.value = selectedCanvasTarget.value
      measureTargetCanvasTarget.value = null
    }
  }

  function resetMeasurement() {
    measureStartId.value = null
    measureTargetId.value = null
    measureStartCanvasTarget.value = null
    measureTargetCanvasTarget.value = null
  }

  function resetRulerMeasurement() {
    rulerStart.value = null
    rulerEnd.value = null
  }

  function toggleExpanded(id: string) {
    expandedLayerIds.value = expandedLayerIds.value.includes(id)
      ? expandedLayerIds.value.filter((item) => item !== id)
      : [...expandedLayerIds.value, id]
  }

  function setTransform(nextScale: number, nextX: number, nextY: number) {
    scale.value = Math.min(2.4, Math.max(0.25, nextScale))
    translateX.value = nextX
    translateY.value = nextY
  }

  function revealLayer(id: string) {
    revealTargetId.value = id
    revealVersion.value += 1
  }

  function restorePreferences(preferences: LocalBundlePreferences | undefined) {
    if (!preferences) {
      return
    }

    if (preferences.lastScale) {
      scale.value = Math.min(2.4, Math.max(0.25, preferences.lastScale))
    }
    if (preferences.viewerLayoutVersion === 2 && preferences.leftTab) {
      leftTab.value = preferences.leftTab
    }
    if (preferences.rightTab) {
      rightTab.value = preferences.rightTab
    }
    selectedLayerId.value = preferences.lastSelectedLayerId ?? null
    selectedCanvasTarget.value = null
    resetCanvasSelectionCycle()
  }

  function preferences(): LocalBundlePreferences {
    return {
      viewerLayoutVersion: 2,
      lastScale: scale.value,
      lastSelectedLayerId: selectedLayerId.value ?? undefined,
      leftTab: leftTab.value,
      rightTab: rightTab.value,
    }
  }

  return {
    boundsMode,
    canvasSelectionResetVersion,
    closeViewer,
    expandedLayerIds,
    hoveredLayerId,
    hoveredCanvasTarget,
    isDemoOpen,
    isOpen,
    inspectLayer,
    inspectCanvasTarget,
    leftTab,
    measureStart,
    measureStartId,
    measureTarget,
    measureTargetId,
    measurementStartCanvasTarget,
    measurementStart,
    measurementTargetCanvasTarget,
    measurementTarget,
    openDemo,
    openLocal,
    preferences,
    resetMeasurement,
    resetRulerMeasurement,
    revealTargetId,
    revealVersion,
    revealLayer,
    restorePreferences,
    rightTab,
    rulerEnd,
    rulerStart,
    scale,
    selectedLayer,
    selectedLayerId,
    selectedAsset,
    selectedAssetId,
    selectedAssetIds,
    selectedAssetPlacement,
    selectedAssetLayerIds,
    selectedCanvasTarget,
    selectAsset,
    selectLayer,
    setSelectedAssets,
    setHoveredCanvasTarget,
    setMeasureTargetCanvasTarget,
    setRulerEnd,
    setRulerStart,
    setTool,
    setTransform,
    showBounds,
    showGrid,
    showRulers,
    tool,
    toggleExpanded,
    toggleAsset,
    translateX,
    translateY,
  }
})
