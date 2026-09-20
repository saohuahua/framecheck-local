<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Crosshair,
  Grid2X2,
  Maximize2,
  Minus,
  MousePointer2,
  PanelTop,
  Plus,
  Ruler,
  ScanLine,
} from 'lucide-vue-next'
import AppIconButton from '../../shared/ui/AppIconButton.vue'
import AppTooltip from '../../shared/ui/AppTooltip.vue'
import { activeViewerSession, findSessionLayer } from '../workspace/bundle-session'
import { flattenLayers } from './demo-bundle'
import { findCanvasSelectionCandidates } from './hit-test'
import { constrainRulerPoint, dominantRulerAxis, measureBounds, measurePoints } from './measure'
import type {
  Bounds,
  CanvasSelectionTarget,
  DesignLayer,
  DistanceMeasurement,
  MeasurementPoint,
  RulerAxis,
} from './types'
import { useViewerStore } from './viewer-store'

const viewer = useViewerStore()
const viewport = ref<HTMLElement | null>(null)
const overlay = ref<SVGSVGElement | null>(null)
const spacePressed = ref(false)
const isPanning = ref(false)
const isPointerOverCanvas = ref(false)
const suppressSelection = ref(false)
const panStart = ref({ x: 0, y: 0, translateX: 0, translateY: 0 })
const rulerPointerStart = ref<MeasurementPoint | null>(null)
const rulerPreviewEnd = ref<MeasurementPoint | null>(null)
const rulerAxis = ref<RulerAxis | null>(null)

const session = computed(() => activeViewerSession.value)
const canvas = computed(() => session.value?.canvas ?? { width: 1, height: 1 })
const canvasBounds = computed<Bounds>(() => ({
  x: 0,
  y: 0,
  width: canvas.value.width,
  height: canvas.value.height,
}))
const canvasLayers = computed(() => flattenLayers(session.value?.layers ?? []))
const visualLayers = computed(() => canvasLayers.value.filter((layer) => layer.type !== 'group'))
const activeAssetPlacements = computed(() => {
  const selectedAssetIds = new Set(viewer.selectedAssetIds)
  return (session.value?.assets ?? [])
    .filter((asset) => selectedAssetIds.has(asset.id))
    .flatMap((asset) => asset.placements.map((placement) => ({
      id: `${asset.id}:${placement.id}`,
      bounds: placement.bounds,
    })))
})
const selectedLayer = computed(() => findSessionLayer(viewer.selectedLayerId))
const selectedAssetPlacement = computed(() => viewer.selectedAssetPlacement)
const selectedDisplayBounds = computed(() => {
  const target = viewer.selectedCanvasTarget
  if (target && target.layerId === selectedLayer.value?.id) {
    return target.bounds
  }
  const placement = selectedAssetPlacement.value
  if (placement?.bounds) {
    return placement.bounds
  }
  return selectedLayer.value ? currentBounds(selectedLayer.value) : undefined
})
const hoveredLayer = computed(() => findSessionLayer(viewer.hoveredLayerId))
const hoveredDisplayBounds = computed(() => {
  const target = viewer.hoveredCanvasTarget
  if (target && target.layerId === hoveredLayer.value?.id) {
    return target.bounds
  }
  return hoveredLayer.value ? currentBounds(hoveredLayer.value) : undefined
})
const activeMeasureStart = computed(() => viewer.measurementStart)
const activeMeasureTarget = computed(() => viewer.measurementTarget)
const activeMeasureTargetBounds = computed(() => targetBounds(activeMeasureTarget.value, viewer.measurementTargetCanvasTarget))
const activeMeasureStartBounds = computed(() => targetBounds(activeMeasureStart.value, viewer.measurementStartCanvasTarget))
const measurement = computed(() => {
  if (viewer.tool === 'ruler') {
    return undefined
  }
  if (!activeMeasureStartBounds.value) {
    return undefined
  }

  if (activeMeasureTargetBounds.value) {
    return measureBounds(activeMeasureStartBounds.value, activeMeasureTargetBounds.value)
  }

  return isPointerOverCanvas.value ? measureBounds(activeMeasureStartBounds.value, canvasBounds.value) : undefined
})
const measurementSource = computed(() => (
  activeMeasureTargetBounds.value ? 'layer' : measurement.value ? 'canvas' : undefined
))
const rulerMeasurement = computed<DistanceMeasurement | undefined>(() => {
  const start = rulerPointerStart.value ?? viewer.rulerStart
  const end = rulerPreviewEnd.value ?? viewer.rulerEnd
  if (!start || !end) {
    return undefined
  }
  return measurePoints(start, end)
})
const visibleMeasurement = computed(() => (
  viewer.tool === 'ruler' ? undefined : measurement.value
))
const rulerOverlayScale = computed(() => 1 / viewer.scale)
const rulerDistanceLabel = computed(() => {
  const measurement = rulerMeasurement.value
  if (!measurement) {
    return undefined
  }

  const axis = measurement.horizontal >= measurement.vertical ? '水平' : '垂直'
  const text = `${axis} ${formatPx(measurement.distance)} px`
  const overlayScale = rulerOverlayScale.value
  const width = Math.max(148, text.length * 7.2 + 16) * overlayScale
  return {
    text,
    width,
    x: clamp(measurement.label.x, width / 2, canvas.value.width - width / 2),
    y: clamp(measurement.label.y - 18 * overlayScale, 14 * overlayScale, canvas.value.height - 14 * overlayScale),
  }
})
const transformStyle = computed(() => ({
  transform: `translate(${viewer.translateX}px, ${viewer.translateY}px) scale(${viewer.scale})`,
  width: `${canvas.value.width}px`,
  height: `${canvas.value.height}px`,
}))
const selectionCycle = ref<{
  x: number
  y: number
  candidateIds: string[]
  index: number
} | null>(null)
const selectedSizeLabel = computed(() => {
  const bounds = selectedDisplayBounds.value
  if (!bounds) {
    return undefined
  }
  const text = `${Math.round(bounds.width)} x ${Math.round(bounds.height)} px`
  const width = Math.max(88, text.length * 8 + 16)
  const x = Math.max(0, Math.min(canvas.value.width - width, bounds.x + bounds.width / 2 - width / 2))
  const belowY = bounds.y + bounds.height + 8
  const y = belowY + 24 <= canvas.value.height ? belowY : Math.max(0, bounds.y - 30)
  return { text, width, x, y }
})

function currentBounds(layer: DesignLayer): Bounds {
  return viewer.boundsMode === 'paint' && layer.paintBounds ? layer.paintBounds : layer.bounds
}

function targetBounds(layer: DesignLayer | undefined, target: CanvasSelectionTarget | null | undefined): Bounds | undefined {
  if (!layer) {
    return undefined
  }
  return target?.layerId === layer.id ? target.bounds : currentBounds(layer)
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function snapToTenth(value: number) {
  return Math.round(value * 10) / 10
}

function formatPx(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
}

function measurementLabelWidth(value: number) {
  return Math.max(48, `${value}px`.length * 8 + 16)
}

function fitToViewport() {
  const element = viewport.value
  if (!element) {
    return
  }

  const availableWidth = Math.max(160, element.clientWidth - 64)
  const availableHeight = Math.max(120, element.clientHeight - 64)
  const nextScale = Math.min(availableWidth / canvas.value.width, availableHeight / canvas.value.height, 1)
  viewer.setTransform(
    nextScale,
    Math.max(20, (element.clientWidth - canvas.value.width * nextScale) / 2),
    Math.max(20, (element.clientHeight - canvas.value.height * nextScale) / 2),
  )
}

function revealLayer() {
  const element = viewport.value
  const layer = findSessionLayer(viewer.revealTargetId)
  if (!element || !layer) {
    return
  }

  const bounds = currentBounds(layer)
  const nextScale = Math.min(1.2, Math.max(0.4, viewer.scale))
  viewer.setTransform(
    nextScale,
    element.clientWidth / 2 - (bounds.x + bounds.width / 2) * nextScale,
    element.clientHeight / 2 - (bounds.y + bounds.height / 2) * nextScale,
  )
}

function zoomBy(delta: number) {
  const element = viewport.value
  if (!element) {
    return
  }

  const centerX = element.clientWidth / 2
  const centerY = element.clientHeight / 2
  const nextScale = viewer.scale * delta
  zoomAround(nextScale, centerX, centerY)
}

function setOriginalScale() {
  const element = viewport.value
  if (!element) {
    return
  }
  viewer.setTransform(1, Math.max(20, (element.clientWidth - canvas.value.width) / 2), 24)
}

function zoomAround(nextScale: number, localX: number, localY: number) {
  const logicalX = (localX - viewer.translateX) / viewer.scale
  const logicalY = (localY - viewer.translateY) / viewer.scale
  const clampedScale = Math.min(2.4, Math.max(0.25, nextScale))
  viewer.setTransform(clampedScale, localX - logicalX * clampedScale, localY - logicalY * clampedScale)
}

function onWheel(event: WheelEvent) {
  const element = viewport.value
  if (!element) {
    return
  }

  const bounds = element.getBoundingClientRect()
  const direction = event.deltaY > 0 ? 0.9 : 1.1
  zoomAround(viewer.scale * direction, event.clientX - bounds.left, event.clientY - bounds.top)
}

function onPointerDown(event: PointerEvent) {
  if (viewer.tool === 'ruler' && event.button === 0 && !spacePressed.value) {
    const point = rulerPointAtPointer(event)
    if (!point) {
      return
    }
    event.preventDefault()
    rulerPointerStart.value = point
    rulerPreviewEnd.value = point
    rulerAxis.value = null
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    return
  }

  if (event.button !== 1 && !(event.button === 0 && spacePressed.value)) {
    return
  }

  event.preventDefault()
  isPanning.value = true
  panStart.value = {
    x: event.clientX,
    y: event.clientY,
    translateX: viewer.translateX,
    translateY: viewer.translateY,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!isPanning.value) {
    return
  }

  viewer.setTransform(
    viewer.scale,
    panStart.value.translateX + event.clientX - panStart.value.x,
    panStart.value.translateY + event.clientY - panStart.value.y,
  )
}

function stopPanning() {
  if (isPanning.value) {
    suppressSelection.value = true
    window.setTimeout(() => {
      suppressSelection.value = false
    }, 0)
  }
  isPanning.value = false
}

function stopRulerInteraction() {
  rulerPointerStart.value = null
  rulerPreviewEnd.value = null
  rulerAxis.value = null
}

function suppressCanvasSelection() {
  suppressSelection.value = true
  window.setTimeout(() => {
    suppressSelection.value = false
  }, 0)
}

function canvasPointAtPointer(event: PointerEvent | MouseEvent) {
  const element = overlay.value
  const matrix = element?.getScreenCTM()
  if (!element || !matrix) {
    return undefined
  }
  const point = element.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  return point.matrixTransform(matrix.inverse())
}

function rulerPointAtPointer(event: PointerEvent | MouseEvent): MeasurementPoint | undefined {
  const point = canvasPointAtPointer(event)
  if (!point) {
    return undefined
  }
  return {
    x: snapToTenth(clamp(point.x, 0, canvas.value.width)),
    y: snapToTenth(clamp(point.y, 0, canvas.value.height)),
  }
}

function selectionAtPointer(event: PointerEvent | MouseEvent) {
  const canvasPoint = canvasPointAtPointer(event)
  if (!canvasPoint) {
    return undefined
  }
  return {
    x: canvasPoint.x,
    y: canvasPoint.y,
    candidates: findCanvasSelectionCandidates(
      canvasLayers.value,
      session.value?.assets ?? [],
      canvasPoint.x,
      canvasPoint.y,
      viewer.boundsMode,
    ),
  }
}

function updateRulerPreview(event: PointerEvent) {
  const point = rulerPointAtPointer(event)
  const start = rulerPointerStart.value
  if (!point || !start) {
    return
  }
  const distance = Math.max(Math.abs(point.x - start.x), Math.abs(point.y - start.y))
  if (!rulerAxis.value && distance >= 3 / viewer.scale) {
    rulerAxis.value = dominantRulerAxis(start, point) ?? null
  }
  rulerPreviewEnd.value = rulerAxis.value ? constrainRulerPoint(start, point, rulerAxis.value) : point
}

function completeRulerInteraction(event: PointerEvent) {
  const start = rulerPointerStart.value
  const point = rulerPreviewEnd.value ?? rulerPointAtPointer(event)
  const axis = rulerAxis.value ?? (start && point ? dominantRulerAxis(start, point) : undefined)
  const end = start && point && axis ? constrainRulerPoint(start, point, axis) : point
  stopRulerInteraction()
  suppressCanvasSelection()

  if (!start || !end) {
    return
  }
  viewer.setRulerStart(start)
  viewer.setRulerEnd(end)
}

function onViewportPointerMove(event: PointerEvent) {
  isPointerOverCanvas.value = true
  if (isPanning.value) {
    onPointerMove(event)
    return
  }
  if (viewer.tool === 'ruler') {
    updateRulerPreview(event)
    return
  }
  const selection = selectionAtPointer(event)
  const target = selection?.candidates.find((candidate) => candidate.layerId !== viewer.measurementStart?.id) ?? null
  viewer.setHoveredCanvasTarget(target)
  if (viewer.tool === 'measure' && target && target.layerId !== viewer.measureStartId) {
    viewer.setMeasureTargetCanvasTarget(target)
  }
}

function onViewportPointerLeave() {
  isPointerOverCanvas.value = false
  viewer.setHoveredCanvasTarget(null)
  if (!rulerPointerStart.value) {
    rulerPreviewEnd.value = null
  }
}

function onViewportPointerUp(event: PointerEvent) {
  if (viewer.tool === 'ruler' && rulerPointerStart.value) {
    completeRulerInteraction(event)
    return
  }
  stopPanning()
}

function onViewportPointerCancel() {
  stopRulerInteraction()
  stopPanning()
}

function onCanvasClick(event: MouseEvent) {
  if (suppressSelection.value || viewer.tool === 'ruler') {
    return
  }
  const selection = selectionAtPointer(event)
  if (!selection?.candidates.length) {
    selectionCycle.value = null
    return
  }
  const candidateIds = selection.candidates.map((candidate) => candidate.id)
  const cycleDistance = 4 / viewer.scale
  const previousCycle = selectionCycle.value
  const sameCycle = previousCycle
    && previousCycle.candidateIds.join('|') === candidateIds.join('|')
    && Math.hypot(selection.x - previousCycle.x, selection.y - previousCycle.y) <= cycleDistance
  const index = sameCycle && previousCycle ? (previousCycle.index + 1) % selection.candidates.length : 0
  selectionCycle.value = {
    x: selection.x,
    y: selection.y,
    candidateIds,
    index,
  }
  viewer.inspectCanvasTarget(selection.candidates[index])
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(target.closest('input, textarea, [contenteditable="true"], [role="menu"], [role="dialog"]'))
}

function onKeydown(event: KeyboardEvent) {
  if (isInteractiveTarget(event.target)) {
    return
  }

  if (event.code === 'Space') {
    spacePressed.value = true
    event.preventDefault()
    return
  }

  if (event.key === 'v' || event.key === 'V') {
    viewer.setTool('select')
  }

  if (event.key === 'M' && event.shiftKey) {
    viewer.setTool('ruler')
    return
  }

  if (event.key === 'm' || event.key === 'M') {
    viewer.setTool('measure')
  }

  if (event.key === 'b' || event.key === 'B') {
    viewer.showBounds = !viewer.showBounds
  }

  if (event.key === 'g' || event.key === 'G') {
    viewer.showGrid = !viewer.showGrid
  }

  if (event.key === 'R' && event.shiftKey) {
    viewer.showRulers = !viewer.showRulers
  }

  if (event.key === '1' && event.shiftKey) {
    fitToViewport()
  } else if (event.key === '1') {
    setOriginalScale()
  }

  if (event.key === '+') {
    zoomBy(1.1)
  }

  if (event.key === '-') {
    zoomBy(0.9)
  }

  if (event.key === 'Escape') {
    if (viewer.tool === 'ruler') {
      viewer.resetRulerMeasurement()
      rulerPreviewEnd.value = null
      return
    }
    viewer.selectedLayerId = null
    viewer.selectedAssetId = null
    viewer.resetMeasurement()
  }
}

function onKeyup(event: KeyboardEvent) {
  if (event.code === 'Space') {
    spacePressed.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
  window.addEventListener('resize', fitToViewport)
  void nextTick(fitToViewport)
})

watch(
  () => viewer.revealVersion,
  () => {
    void nextTick(revealLayer)
  },
)

watch(
  () => viewer.canvasSelectionResetVersion,
  () => {
    selectionCycle.value = null
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
  window.removeEventListener('resize', fitToViewport)
})
</script>

<template>
  <section class="canvas-stage" aria-label="设计稿画布">
    <div
      ref="viewport"
      class="canvas-stage__viewport"
      :class="{ 'is-grid': viewer.showGrid, 'is-panning': isPanning || spacePressed, 'is-ruler': viewer.tool === 'ruler' }"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onViewportPointerMove"
      @pointerup="onViewportPointerUp"
      @pointercancel="onViewportPointerCancel"
      @pointerleave="onViewportPointerLeave"
      @click="onCanvasClick"
    >
      <div v-if="viewer.showRulers" class="canvas-stage__ruler canvas-stage__ruler--top" aria-hidden="true" />
      <div v-if="viewer.showRulers" class="canvas-stage__ruler canvas-stage__ruler--left" aria-hidden="true" />
      <div class="canvas-stage__transform" :style="transformStyle">
        <img
          class="canvas-stage__reference"
          :src="session?.referenceUrl"
          :alt="`${session?.kind === 'demo' ? '演示' : '本地'}设计稿 reference 预览`"
          :style="{ width: `${canvas.width}px`, height: `${canvas.height}px` }"
          draggable="false"
        />
        <svg
          ref="overlay"
          class="canvas-stage__overlay"
          :width="canvas.width"
          :height="canvas.height"
          :viewBox="`0 0 ${canvas.width} ${canvas.height}`"
          :style="{ width: `${canvas.width}px`, height: `${canvas.height}px` }"
          aria-label="设计稿图层交互覆盖层"
        >
          <g pointer-events="none">
            <rect
              v-for="layer in visualLayers"
              v-show="viewer.showBounds"
              :key="`bounds-${layer.id}`"
              :x="currentBounds(layer).x"
              :y="currentBounds(layer).y"
              :width="currentBounds(layer).width"
              :height="currentBounds(layer).height"
              class="canvas-stage__all-bounds"
            />
            <rect
              v-for="placement in activeAssetPlacements"
              :key="`asset-${placement.id}`"
              :x="placement.bounds.x"
              :y="placement.bounds.y"
              :width="placement.bounds.width"
              :height="placement.bounds.height"
              class="canvas-stage__asset-bounds"
            />
            <rect
              v-if="hoveredLayer && hoveredLayer.id !== selectedLayer?.id"
              :x="hoveredDisplayBounds?.x"
              :y="hoveredDisplayBounds?.y"
              :width="hoveredDisplayBounds?.width"
              :height="hoveredDisplayBounds?.height"
              class="canvas-stage__hover-bounds"
            />
            <rect
              v-if="activeMeasureTarget && activeMeasureTarget.id !== selectedLayer?.id"
              :x="activeMeasureTargetBounds?.x"
              :y="activeMeasureTargetBounds?.y"
              :width="activeMeasureTargetBounds?.width"
              :height="activeMeasureTargetBounds?.height"
              class="canvas-stage__target-bounds"
            />
            <rect
              v-if="selectedDisplayBounds"
              :x="selectedDisplayBounds.x"
              :y="selectedDisplayBounds.y"
              :width="selectedDisplayBounds.width"
              :height="selectedDisplayBounds.height"
              class="canvas-stage__selected-bounds"
            />
            <g v-if="visibleMeasurement" class="canvas-stage__measurement" :data-measurement-source="measurementSource">
              <template v-for="(segment, index) in visibleMeasurement.segments" :key="`${segment.axis}-${index}`">
                <line
                  data-measure-segment="gap"
                  :data-measure-axis="segment.axis"
                  :x1="segment.start.x"
                  :y1="segment.start.y"
                  :x2="segment.end.x"
                  :y2="segment.end.y"
                  class="canvas-stage__measurement-line"
                />
                <line
                  v-for="(extension, extensionIndex) in segment.extensions"
                  :key="`${segment.axis}-${index}-extension-${extensionIndex}`"
                  data-measure-segment="extension"
                  :data-measure-axis="segment.axis"
                  :x1="extension.start.x"
                  :y1="extension.start.y"
                  :x2="extension.end.x"
                  :y2="extension.end.y"
                  class="canvas-stage__measurement-extension"
                />
                <rect
                  :x="segment.label.x - measurementLabelWidth(segment.value) / 2"
                  :y="segment.label.y - 13"
                  :width="measurementLabelWidth(segment.value)"
                  height="24"
                  rx="3"
                />
                <text :x="segment.label.x" :y="segment.label.y + 4" text-anchor="middle">
                  {{ segment.value }}px
                </text>
              </template>
            </g>
            <g
              v-if="rulerMeasurement && rulerDistanceLabel"
              class="canvas-stage__free-measurement"
              data-ruler-measurement="distance"
            >
              <line
                :x1="rulerMeasurement.start.x"
                :y1="rulerMeasurement.start.y"
                :x2="rulerMeasurement.end.x"
                :y2="rulerMeasurement.end.y"
                :style="{ strokeWidth: `${2 * rulerOverlayScale}px` }"
              />
              <circle
                :cx="rulerMeasurement.start.x"
                :cy="rulerMeasurement.start.y"
                :r="4 * rulerOverlayScale"
                :style="{ strokeWidth: `${1.5 * rulerOverlayScale}px` }"
              />
              <circle
                :cx="rulerMeasurement.end.x"
                :cy="rulerMeasurement.end.y"
                :r="4 * rulerOverlayScale"
                :style="{ strokeWidth: `${1.5 * rulerOverlayScale}px` }"
              />
              <rect
                :x="rulerDistanceLabel.x - rulerDistanceLabel.width / 2"
                :y="rulerDistanceLabel.y - 13 * rulerOverlayScale"
                :width="rulerDistanceLabel.width"
                :height="24 * rulerOverlayScale"
                rx="3"
              />
              <text
                :x="rulerDistanceLabel.x"
                :y="rulerDistanceLabel.y + 4 * rulerOverlayScale"
                text-anchor="middle"
                :style="{ fontSize: `${12 * rulerOverlayScale}px` }"
              >{{ rulerDistanceLabel.text }}</text>
            </g>
            <g v-if="selectedSizeLabel" class="canvas-stage__selected-size" data-selected-size>
              <rect :x="selectedSizeLabel.x" :y="selectedSizeLabel.y" :width="selectedSizeLabel.width" height="24" rx="3" />
              <text :x="selectedSizeLabel.x + selectedSizeLabel.width / 2" :y="selectedSizeLabel.y + 16" text-anchor="middle">
                {{ selectedSizeLabel.text }}
              </text>
            </g>
          </g>
          <rect x="0" y="0" :width="canvas.width" :height="canvas.height" class="canvas-stage__hit" />
        </svg>
      </div>

      <div class="canvas-stage__toolrail" role="toolbar" aria-label="画布工具" @pointerdown.stop @pointermove.stop @click.stop>
        <AppTooltip label="选择 V">
          <template #trigger>
            <AppIconButton label="选择工具" :pressed="viewer.tool === 'select'" @click="viewer.setTool('select')">
              <MousePointer2 :size="15" :stroke-width="1.8" aria-hidden="true" />
            </AppIconButton>
          </template>
        </AppTooltip>
        <AppTooltip label="测量 M">
          <template #trigger>
            <AppIconButton label="测量工具" :pressed="viewer.tool === 'measure'" @click="viewer.setTool('measure')">
              <Crosshair :size="15" :stroke-width="1.8" aria-hidden="true" />
            </AppIconButton>
          </template>
        </AppTooltip>
        <AppTooltip label="卷尺测量 Shift+M">
          <template #trigger>
            <AppIconButton label="卷尺工具" :pressed="viewer.tool === 'ruler'" @click="viewer.setTool('ruler')">
              <Ruler :size="15" :stroke-width="1.8" aria-hidden="true" />
            </AppIconButton>
          </template>
        </AppTooltip>
        <span class="canvas-stage__toolrail-divider" aria-hidden="true" />
        <AppTooltip label="全部边界 B">
          <template #trigger>
            <AppIconButton label="切换全部边界" :pressed="viewer.showBounds" @click="viewer.showBounds = !viewer.showBounds">
              <ScanLine :size="15" :stroke-width="1.8" aria-hidden="true" />
            </AppIconButton>
          </template>
        </AppTooltip>
        <AppTooltip label="显示坐标刻度 Shift+R">
          <template #trigger>
            <AppIconButton label="切换坐标刻度" :pressed="viewer.showRulers" @click="viewer.showRulers = !viewer.showRulers">
              <PanelTop :size="15" :stroke-width="1.8" aria-hidden="true" />
            </AppIconButton>
          </template>
        </AppTooltip>
        <AppTooltip label="网格 G">
          <template #trigger>
            <AppIconButton label="切换网格" :pressed="viewer.showGrid" @click="viewer.showGrid = !viewer.showGrid">
              <Grid2X2 :size="15" :stroke-width="1.8" aria-hidden="true" />
            </AppIconButton>
          </template>
        </AppTooltip>
      </div>

      <div class="canvas-stage__bottombar" aria-label="画布状态与缩放" @pointerdown.stop @pointermove.stop @click.stop>
        <span class="canvas-stage__dimensions fc-mono">{{ canvas.width }} x {{ canvas.height }}</span>
        <span class="canvas-stage__bottombar-divider" aria-hidden="true" />
        <AppTooltip label="适配画布 Shift+1">
          <template #trigger>
            <AppIconButton label="适配画布" @click="fitToViewport">
              <Maximize2 :size="15" :stroke-width="1.8" aria-hidden="true" />
            </AppIconButton>
          </template>
        </AppTooltip>
        <button class="canvas-stage__ratio" type="button" aria-label="原始比例 1:1" @click="setOriginalScale">1:1</button>
        <div class="canvas-stage__mode" aria-label="边界模式">
          <button :class="{ 'is-active': viewer.boundsMode === 'logical' }" type="button" @click="viewer.boundsMode = 'logical'">logical</button>
          <button :class="{ 'is-active': viewer.boundsMode === 'paint' }" type="button" @click="viewer.boundsMode = 'paint'">paint</button>
        </div>
        <span class="canvas-stage__bottombar-divider" aria-hidden="true" />
        <AppTooltip label="缩小 -">
          <template #trigger>
            <AppIconButton label="缩小画布" @click="zoomBy(0.9)">
              <Minus :size="15" :stroke-width="1.8" aria-hidden="true" />
            </AppIconButton>
          </template>
        </AppTooltip>
        <span class="canvas-stage__zoom fc-mono">{{ Math.round(viewer.scale * 100) }}%</span>
        <AppTooltip label="放大 +">
          <template #trigger>
            <AppIconButton label="放大画布" @click="zoomBy(1.1)">
              <Plus :size="15" :stroke-width="1.8" aria-hidden="true" />
            </AppIconButton>
          </template>
        </AppTooltip>
      </div>
    </div>
  </section>
</template>

<style scoped>
.canvas-stage {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: minmax(0, 1fr);
  background: var(--fc-canvas);
}

.canvas-stage__toolrail {
  position: absolute;
  top: var(--fc-space-4);
  right: var(--fc-space-4);
  z-index: var(--fc-z-overlay);
  display: grid;
  width: 36px;
  padding: 4px;
  justify-items: center;
  gap: 2px;
  background: var(--fc-surface-root);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-panel);
  box-shadow: var(--fc-shadow-panel);
}

.canvas-stage__toolrail-divider {
  width: 20px;
  height: 1px;
  margin: 3px 0;
  background: var(--fc-border);
}

.canvas-stage__bottombar {
  position: absolute;
  bottom: var(--fc-space-4);
  left: 50%;
  z-index: var(--fc-z-overlay);
  display: flex;
  height: 36px;
  padding: 3px 5px 3px 10px;
  align-items: center;
  gap: 2px;
  background: var(--fc-surface-root);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-panel);
  box-shadow: var(--fc-shadow-panel);
  transform: translateX(-50%);
}

.canvas-stage__mode {
  display: inline-flex;
  height: 24px;
  padding: 2px;
  background: var(--fc-surface-subtle);
  border-radius: var(--fc-radius-compact);
}

.canvas-stage__mode button {
  padding: 0 7px;
  color: var(--fc-text-secondary);
  font-family: var(--fc-mono-font);
  font-size: var(--fc-font-micro);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--fc-radius-compact);
}

.canvas-stage__mode button.is-active {
  color: var(--fc-text);
  background: var(--fc-surface-root);
  box-shadow: 0 1px 2px rgb(0 0 0 / 14%);
}

.canvas-stage__dimensions,
.canvas-stage__ratio,
.canvas-stage__zoom {
  display: inline-flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  color: var(--fc-text-secondary);
  font-size: var(--fc-font-caption);
  font-variant-numeric: tabular-nums;
}

.canvas-stage__dimensions {
  padding: 0 4px;
  color: var(--fc-text-muted);
}

.canvas-stage__ratio {
  min-width: 30px;
  padding: 0 5px;
  font-family: var(--fc-mono-font);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--fc-radius-compact);
}

.canvas-stage__ratio:hover {
  color: var(--fc-text);
  background: var(--fc-surface-hover);
}

.canvas-stage__bottombar-divider {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--fc-border);
}

.canvas-stage__zoom {
  width: 38px;
}

.canvas-stage__viewport {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--fc-canvas);
  touch-action: none;
}

.canvas-stage__viewport.is-grid {
  background-image: radial-gradient(circle, var(--fc-grid-dot) 1px, transparent 1px);
  background-size: 20px 20px;
}

.canvas-stage__viewport.is-panning {
  cursor: grabbing;
}

.canvas-stage__viewport.is-ruler {
  cursor: crosshair;
}

.canvas-stage__transform {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.canvas-stage__reference,
.canvas-stage__overlay {
  position: absolute;
  inset: 0;
  display: block;
}

.canvas-stage__reference {
  user-select: none;
  box-shadow: 0 10px 22px rgb(28 28 26 / 12%);
}

.canvas-stage__overlay {
  overflow: visible;
}

.canvas-stage__all-bounds {
  fill: none;
  stroke: var(--fc-bounds);
  stroke-width: 1;
  stroke-opacity: 0.42;
}

.canvas-stage__hover-bounds {
  fill: none;
  stroke: var(--fc-hover);
  stroke-width: 1;
}

.canvas-stage__asset-bounds {
  fill: color-mix(in srgb, var(--fc-accent) 8%, transparent);
  stroke: var(--fc-asset-outline);
  stroke-width: 2;
  stroke-dasharray: 6 4;
}

.canvas-stage__target-bounds {
  fill: none;
  stroke: var(--fc-target);
  stroke-width: 1;
}

.canvas-stage__selected-bounds {
  fill: none;
  stroke: var(--fc-layer-selected);
  stroke-width: 2;
  stroke-dasharray: 6 3;
}

.canvas-stage__measurement-line,
.canvas-stage__measurement-extension {
  stroke: var(--fc-layer-selected);
  stroke-width: 2;
  stroke-dasharray: none;
}

.canvas-stage__measurement rect {
  fill: var(--fc-layer-selected);
}

.canvas-stage__measurement text {
  fill: var(--fc-surface-root);
  font-family: var(--fc-mono-font);
  font-size: 12px;
  font-weight: 600;
}

.canvas-stage__free-measurement line {
  stroke: var(--fc-layer-selected);
  stroke-width: 2;
}

.canvas-stage__free-measurement circle {
  fill: var(--fc-layer-selected);
  stroke: var(--fc-surface-root);
  stroke-width: 1.5;
}

.canvas-stage__free-measurement rect {
  fill: var(--fc-layer-selected);
}

.canvas-stage__free-measurement text {
  fill: var(--fc-surface-root);
  font-family: var(--fc-mono-font);
  font-size: 12px;
  font-weight: 600;
}

.canvas-stage__selected-size rect {
  fill: var(--fc-measure);
}

.canvas-stage__selected-size text {
  fill: var(--fc-surface-root);
  font-family: var(--fc-mono-font);
  font-size: 12px;
  font-weight: 600;
}

.canvas-stage__hit {
  fill: transparent;
  pointer-events: all;
  cursor: default;
}

.canvas-stage__ruler {
  position: absolute;
  z-index: var(--fc-z-overlay);
  pointer-events: none;
  opacity: 0.8;
}

.canvas-stage__ruler--top {
  top: 0;
  right: 0;
  left: 18px;
  height: 18px;
  border-bottom: 1px solid var(--fc-border-strong);
  background-image: repeating-linear-gradient(90deg, transparent 0 19px, var(--fc-border-strong) 19px 20px);
}

.canvas-stage__ruler--left {
  top: 18px;
  bottom: 0;
  left: 0;
  width: 18px;
  border-right: 1px solid var(--fc-border-strong);
  background-image: repeating-linear-gradient(0deg, transparent 0 19px, var(--fc-border-strong) 19px 20px);
}
</style>
