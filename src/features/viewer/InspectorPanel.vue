<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  Code2,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Download,
  FileText,
  Image,
  Layers2,
  LocateFixed,
  TriangleAlert,
  Type,
} from 'lucide-vue-next'
import AppCommandButton from '../../shared/ui/AppCommandButton.vue'
import AppIconButton from '../../shared/ui/AppIconButton.vue'
import AppMenu, { type AppMenuItem } from '../../shared/ui/AppMenu.vue'
import AppScrollArea from '../../shared/ui/AppScrollArea.vue'
import AppTabs, { type AppTab } from '../../shared/ui/AppTabs.vue'
import AppTooltip from '../../shared/ui/AppTooltip.vue'
import { activeViewerSession } from '../workspace/bundle-session'
import { useBundleStore } from '../workspace/bundle-store'
import { measureBounds } from './measure'
import type { DesignLayer, ViewerAsset } from './types'
import AssetThumbnail from './AssetThumbnail.vue'
import { getDevelopmentDiagnostics } from './diagnostics'
import { useViewerStore } from './viewer-store'

type CopiedValue = 'assetData' | 'css' | 'name' | 'path' | 'text' | null
type AssetCopyFormat = 'base64' | 'dataUrl'
type CssValueKind = 'color' | 'keyword' | 'number' | 'string'
type PropertySection = 'assetInfo' | 'assetPreview' | 'code' | 'content' | 'layerInfo' | 'style'

interface CssProjectionLine {
  property: string
  value: string
  valueKind: CssValueKind
}

interface PropertyFact {
  label: string
  value: string
  color?: string
  mono?: boolean
}

function formatPixelValue(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

const viewer = useViewerStore()
const bundleStore = useBundleStore()
const copied = ref<CopiedValue>(null)
let copiedTimer: number | undefined

const session = computed(() => activeViewerSession.value)
const selectedLayer = computed(() => viewer.selectedLayer)
const selectedAsset = computed(() => viewer.selectedAsset)
const selectedAssetPlacement = computed(() => viewer.selectedAssetPlacement)
const selectedAssetBounds = computed(() => selectedAssetPlacement.value?.bounds)
const selectedBounds = computed(() => {
  const layer = selectedLayer.value
  if (!layer) {
    return undefined
  }
  return viewer.boundsMode === 'paint' && layer.paintBounds ? layer.paintBounds : layer.bounds
})
const propertyBounds = computed(() => selectedAssetBounds.value ?? selectedBounds.value)
const propertyKind = computed(() => {
  if (selectedAsset.value) {
    return '切图'
  }
  if (selectedLayer.value?.text) {
    return '文案'
  }
  return '图层'
})
const propertyTitle = computed(() => {
  if (selectedAsset.value) {
    return assetTitle(selectedAsset.value)
  }
  return selectedLayer.value?.name ?? ''
})
const propertyIcon = computed(() => {
  if (selectedAsset.value) {
    return Image
  }
  if (selectedLayer.value?.text) {
    return Type
  }
  return Layers2
})
const selectedLayerFacts = computed<PropertyFact[]>(() => {
  const layer = selectedLayer.value
  if (!layer) {
    return []
  }

  const facts: PropertyFact[] = []
  if (layer.path) {
    facts.push({ label: '图层路径', value: layer.path })
  }
  if (layer.sourceKind && layer.sourceKind !== layer.type) {
    facts.push({ label: '图层类型', value: layer.sourceKind })
  }
  return facts
})
const assetFacts = computed<PropertyFact[]>(() => {
  const asset = selectedAsset.value
  if (!asset) {
    return []
  }

  const facts: PropertyFact[] = [
    { label: '文件', value: asset.name, mono: true },
    { label: '格式', value: `${asset.format} · ${asset.scales}`, mono: true },
    { label: '逻辑尺寸', value: asset.logicalSize, mono: true },
    { label: '像素尺寸', value: asset.pixelSize, mono: true },
    { label: '宽高比', value: assetRatio(asset), mono: true },
    { label: '标记', value: `${asset.marker} · ${asset.placement}`, mono: true },
  ]
  if (selectedLayer.value?.name) {
    facts.push({ label: '来源图层', value: cleanExportMarker(selectedLayer.value.name) })
  }
  if (selectedLayer.value?.path) {
    facts.push({ label: '图层路径', value: selectedLayer.value.path })
  }
  return facts
})
const measurement = computed(() => {
  if (!viewer.measurementStart || !viewer.measurementTarget) {
    return undefined
  }
  const getBounds = (layer: DesignLayer) => (
    viewer.boundsMode === 'paint' && layer.paintBounds ? layer.paintBounds : layer.bounds
  )
  return measureBounds(
    viewer.measurementStartCanvasTarget?.bounds ?? getBounds(viewer.measurementStart),
    viewer.measurementTargetCanvasTarget?.bounds ?? getBounds(viewer.measurementTarget),
  )
})
const selectedAssets = computed(() => (
  (session.value?.assets ?? []).filter((asset) => viewer.selectedAssetIds.includes(asset.id))
))
const assetCopyItems: AppMenuItem[] = [
  { value: 'path', label: '复制路径' },
  { value: 'dataUrl', label: '复制 Data URL' },
  { value: 'base64', label: '复制 Base64' },
]
const developmentDiagnostics = computed(() => getDevelopmentDiagnostics(session.value?.diagnostics ?? []))
const tabs = computed<AppTab[]>(() => {
  const items: AppTab[] = [
    { value: 'annotation', label: '标注' },
    { value: 'assets', label: '切图', count: session.value?.assets.length ?? 0 },
    { value: 'properties', label: '属性' },
  ]
  if (developmentDiagnostics.value.length) {
    items.push({ value: 'diagnostics', label: '提示', count: developmentDiagnostics.value.length })
  }
  return items
})
const cssProjection = computed(() => {
  const layer = selectedLayer.value
  const bounds = propertyBounds.value
  if (!layer || !bounds) {
    return ''
  }

  const lines = [
    'position: absolute;',
    `left: ${formatPixelValue(bounds.x)}px;`,
    `top: ${formatPixelValue(bounds.y)}px;`,
    `width: ${formatPixelValue(bounds.width)}px;`,
    `height: ${formatPixelValue(bounds.height)}px;`,
  ]
  if (layer.style.color) {
    lines.push(`color: ${layer.style.color};`)
  }
  if (layer.style.fontFamily) {
    lines.push(`font-family: ${layer.style.fontFamily};`)
  }
  if (layer.style.fontSize !== undefined) {
    lines.push(`font-size: ${formatPixelValue(layer.style.fontSize)}px;`)
  }
  if (layer.style.fontWeight !== undefined) {
    lines.push(`font-weight: ${layer.style.fontWeight};`)
  }
  if (layer.style.lineHeight !== undefined) {
    lines.push(`line-height: ${formatPixelValue(layer.style.lineHeight)}px;`)
  }
  if (layer.style.letterSpacing !== undefined) {
    lines.push(`letter-spacing: ${formatPixelValue(layer.style.letterSpacing)}px;`)
  }
  if (layer.style.fill) {
    lines.push(`background: ${layer.style.fill};`)
  }
  if (layer.style.borderRadius !== undefined) {
    lines.push(`border-radius: ${formatPixelValue(layer.style.borderRadius)}px;`)
  }
  return lines.join('\n')
})
const cssProjectionLines = computed<CssProjectionLine[]>(() => cssProjection.value
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const separator = line.indexOf(':')
    const property = line.slice(0, separator)
    const value = line.slice(separator + 1).trim().replace(/;$/, '')
    const valueKind: CssValueKind = isCssColor(value)
      ? 'color'
      : /^-?[\d.]+(?:px|%|rem|em)?$/.test(value)
        ? 'number'
        : /^(absolute|fixed|inherit|initial|normal|relative|static|unset)$/.test(value)
          ? 'keyword'
          : 'string'
    return { property, value, valueKind }
  }))
const textStyleFacts = computed<PropertyFact[]>(() => {
  const layer = selectedLayer.value
  if (!layer?.text) {
    return []
  }

  const facts: PropertyFact[] = []
  if (layer.style.fontFamily) {
    facts.push({ label: '字体', value: layer.style.fontFamily })
  } else if (layer.style.fontPostScriptName) {
    facts.push({ label: '字体', value: layer.style.fontPostScriptName })
  }
  if (layer.style.fontSize !== undefined) {
    facts.push({ label: '大小', value: `${formatPixelValue(layer.style.fontSize)}px`, mono: true })
  }
  if (layer.style.fontWeight !== undefined) {
    facts.push({ label: '字重', value: String(layer.style.fontWeight), mono: true })
  }
  if (layer.style.lineHeight !== undefined) {
    facts.push({ label: '行高', value: `${formatPixelValue(layer.style.lineHeight)}px`, mono: true })
  }
  if (layer.style.letterSpacing !== undefined) {
    facts.push({ label: '字距', value: `${formatPixelValue(layer.style.letterSpacing)}px`, mono: true })
  }
  if (layer.style.textAlign) {
    facts.push({ label: '对齐', value: layer.style.textAlign })
  }
  if (layer.style.color) {
    facts.push({ label: '颜色', value: layer.style.color, color: isCssColor(layer.style.color), mono: true })
  }
  return facts
})
const visualStyleFacts = computed<PropertyFact[]>(() => {
  const layer = selectedLayer.value
  if (!layer || layer.text || selectedAsset.value) {
    return []
  }

  const facts: PropertyFact[] = []
  if (layer.style.fill) {
    facts.push({ label: '填充', value: layer.style.fill, color: isCssColor(layer.style.fill), mono: true })
  }
  if (layer.style.borderRadius !== undefined) {
    facts.push({ label: '圆角', value: `${formatPixelValue(layer.style.borderRadius)}px`, mono: true })
  }
  if (layer.style.opacity !== 100) {
    facts.push({ label: '透明度', value: `${layer.style.opacity}%`, mono: true })
  }
  if (layer.style.blendMode !== 'normal') {
    facts.push({ label: '混合模式', value: layer.style.blendMode, mono: true })
  }
  return facts
})
const expandedSections = ref<Record<PropertySection, boolean>>({
  assetInfo: true,
  assetPreview: true,
  code: true,
  content: true,
  layerInfo: false,
  style: true,
})
const allAssetsSelected = computed(() => {
  const assets = session.value?.assets ?? []
  return assets.length > 0 && assets.every((asset) => viewer.selectedAssetIds.includes(asset.id))
})

watch(developmentDiagnostics, (diagnostics) => {
  if (!diagnostics.length && viewer.rightTab === 'diagnostics') {
    viewer.rightTab = 'annotation'
  }
}, { immediate: true })

watch(
  [() => viewer.selectedLayerId, () => viewer.selectedAssetId],
  () => {
    expandedSections.value = {
      assetInfo: true,
      assetPreview: true,
      code: true,
      content: true,
      layerInfo: false,
      style: true,
    }
  },
)

function assetTitle(asset: ViewerAsset) {
  return cleanExportMarker(asset.displayName) || asset.name.replace(/\.[^.]+$/, '')
}

function cleanExportMarker(name: string) {
  const withoutPrefix = name.trim().replace(/^-(?:h|m|e|s)-\s*/i, '')
  return withoutPrefix.replace(/\s*-(?:h|m|e|s)-$/i, '')
}

function assetRatio(asset: ViewerAsset) {
  const dimensions = asset.pixelSize.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i)
  if (!dimensions) {
    return '未提供'
  }
  const width = Number(dimensions[1])
  const height = Number(dimensions[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '未提供'
  }
  const ratio = width / height
  const format = (value: number) => value.toFixed(2).replace(/\.00$/, '').replace(/0$/, '')
  return ratio >= 1 ? `${format(ratio)} : 1` : `1 : ${format(1 / ratio)}`
}

function isCssColor(value: string) {
  return /^(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(value.trim()) ? value : undefined
}

function isSectionOpen(section: PropertySection) {
  return expandedSections.value[section]
}

function toggleSection(section: PropertySection) {
  expandedSections.value = {
    ...expandedSections.value,
    [section]: !expandedSections.value[section],
  }
}

function layerLabel(layer: DesignLayer) {
  if (selectedAsset.value?.layerIds?.includes(layer.id) || selectedAsset.value?.layerId === layer.id) {
    return '切图'
  }
  if (layer.text) {
    return '文案'
  }
  return '图层'
}

function layerIcon(layer: DesignLayer) {
  if (selectedAsset.value?.layerIds?.includes(layer.id) || selectedAsset.value?.layerId === layer.id) {
    return Image
  }
  if (layer.text) {
    return Type
  }
  return Layers2
}

function primaryLayerId(asset: ViewerAsset) {
  return asset.placements[0]?.nodeId ?? asset.layerIds?.[0] ?? asset.layerId
}

function isAssetSelected(asset: ViewerAsset) {
  return viewer.selectedAssetIds.includes(asset.id)
}

function selectAsset(asset: ViewerAsset) {
  viewer.selectAsset(asset.id, primaryLayerId(asset))
}

function toggleAllAssets() {
  const assets = session.value?.assets ?? []
  viewer.setSelectedAssets(allAssetsSelected.value ? [] : assets.map((asset) => asset.id))
}

async function downloadSelectedAssets() {
  await bundleStore.downloadAssets(selectedAssets.value, '已选切图.zip')
}

async function downloadAllAssets() {
  await bundleStore.downloadAssets(session.value?.assets ?? [], '全部切图.zip')
}

function assetMimeType(asset: ViewerAsset) {
  const format = asset.format.toLowerCase()
  if (format === 'jpg') {
    return 'image/jpeg'
  }
  if (format === 'svg') {
    return 'image/svg+xml'
  }
  return `image/${format}`
}

function readDataUrl(asset: ViewerAsset, file: Blob): Promise<string> {
  const type = file.type.startsWith('image/') ? file.type : assetMimeType(asset)
  const source = type === file.type ? file : new Blob([file], { type })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(source)
  })
}

async function copySelectedAssetData(format: AssetCopyFormat) {
  const asset = selectedAsset.value
  if (!asset) {
    return
  }

  try {
    const file = await bundleStore.readAsset(asset)
    if (!file) {
      return
    }
    const dataUrl = await readDataUrl(asset, file)
    const value = format === 'base64'
      ? dataUrl.slice(dataUrl.indexOf(',') + 1)
      : dataUrl
    await copyValue(value, 'assetData')
  } catch {
    return
  }
}

function copySelectedAssetValue(value: string) {
  if (value === 'path') {
    const asset = selectedAsset.value
    if (asset) {
      void copyValue(asset.filePath ?? asset.name, 'path')
    }
    return
  }
  if (value === 'dataUrl' || value === 'base64') {
    void copySelectedAssetData(value)
  }
}

async function copyValue(value: string, kind: Exclude<CopiedValue, null>) {
  if (!value) {
    return
  }
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    return
  }
  copied.value = kind
  if (copiedTimer) {
    window.clearTimeout(copiedTimer)
  }
  copiedTimer = window.setTimeout(() => {
    copied.value = null
  }, 1400)
}

async function downloadSelectedAsset() {
  const asset = selectedAsset.value
  if (!asset) {
    return
  }
  if (!asset.previewUrl) {
    await bundleStore.downloadAsset(asset)
    return
  }
  const anchor = document.createElement('a')
  anchor.href = asset.previewUrl
  anchor.download = asset.name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

function inspectDiagnostic(layerId: string | undefined) {
  if (layerId) {
    viewer.inspectLayer(layerId, true)
  }
}

onBeforeUnmount(() => {
  if (copiedTimer) {
    window.clearTimeout(copiedTimer)
  }
})
</script>

<template>
  <aside class="inspector" aria-label="检查面板">
    <AppTabs v-model="viewer.rightTab" label="检查面板标签" :items="tabs" />
    <AppScrollArea class="inspector__scroll">
      <div class="inspector__content">
        <section v-if="viewer.rightTab === 'annotation' && selectedLayer && propertyBounds" class="inspector__section">
          <header class="object-header">
            <span class="object-header__icon"><component :is="layerIcon(selectedLayer)" :size="17" :stroke-width="1.8" aria-hidden="true" /></span>
            <span>
              <small>{{ layerLabel(selectedLayer) }}标注</small>
              <h2>{{ selectedLayer.name }}</h2>
            </span>
          </header>
          <section class="inspector__group">
            <h3>位置与尺寸</h3>
            <dl class="geometry-grid">
              <div><dt>X</dt><dd>{{ propertyBounds.x }}<small>px</small></dd></div>
              <div><dt>Y</dt><dd>{{ propertyBounds.y }}<small>px</small></dd></div>
              <div><dt>宽</dt><dd>{{ propertyBounds.width }}<small>px</small></dd></div>
              <div><dt>高</dt><dd>{{ propertyBounds.height }}<small>px</small></dd></div>
            </dl>
          </section>
          <section v-if="viewer.tool !== 'ruler'" class="inspector__group inspector__group--measure">
            <div class="inspector__group-heading">
              <h3>距离</h3>
              <span class="measure-mode"><LocateFixed :size="12" aria-hidden="true" /> {{ viewer.tool === 'measure' ? '持续测量中' : '悬浮测量' }}</span>
            </div>
            <dl v-if="measurement && viewer.measurementTarget" class="fact-list">
              <dt>目标</dt>
              <dd>{{ viewer.measurementTarget.name }}</dd>
              <dt>水平距离</dt>
              <dd class="fc-mono">{{ measurement.horizontal }} px</dd>
              <dt>垂直距离</dt>
              <dd class="fc-mono">{{ measurement.vertical }} px</dd>
            </dl>
            <p v-else class="inspector__empty-copy">悬浮另一个开发对象即可显示距离</p>
          </section>
        </section>

        <section v-else-if="viewer.rightTab === 'assets'" class="inspector__section">
          <header class="asset-catalog__header">
            <span>
              <small>已声明资源</small>
              <h2>切图列表</h2>
            </span>
          </header>
          <div class="asset-catalog__toolbar">
            <AppCommandButton variant="primary" :disabled="!selectedAssets.length" @click="downloadSelectedAssets"><template #icon><Download :size="14" aria-hidden="true" /></template>下载已选</AppCommandButton>
            <AppCommandButton :disabled="!session?.assets.length" @click="downloadAllAssets"><template #icon><Download :size="14" aria-hidden="true" /></template>下载全部</AppCommandButton>
            <label class="asset-catalog__all">
              <input type="checkbox" :checked="allAssetsSelected" @change="toggleAllAssets" />
              <span class="asset-catalog__checkbox" aria-hidden="true"><Check :size="11" :stroke-width="3" /></span>
              全选
            </label>
          </div>
          <div v-if="session?.assets.length" class="asset-catalog">
            <div v-for="asset in session.assets" :key="asset.id" class="asset-catalog__row" :class="{ 'is-active': selectedAsset?.id === asset.id }">
              <label class="asset-catalog__check">
                <input type="checkbox" :checked="isAssetSelected(asset)" :aria-label="`高亮 ${asset.displayName}`" @change="viewer.toggleAsset(asset.id)" />
                <span class="asset-catalog__checkbox" aria-hidden="true"><Check :size="11" :stroke-width="3" /></span>
              </label>
              <button type="button" @click="selectAsset(asset)">
                <AssetThumbnail :asset="asset" :label="asset.displayName" />
                <span>
                  <strong>{{ assetTitle(asset) }}</strong>
                  <small>{{ asset.format }} · {{ asset.logicalSize }}</small>
                  <small>{{ asset.placements.length }} 个位置 · {{ asset.marker }}</small>
                </span>
              </button>
            </div>
          </div>
          <div v-else class="inspector__empty-state">
            <Image :size="22" :stroke-width="1.6" aria-hidden="true" />
            <p>当前 Bundle 没有已声明切图</p>
            <span>只有 PSD 中标记并由 CLI 导出的资源会出现在这里</span>
          </div>
          <section v-if="selectedAsset" class="asset-detail">
            <div class="asset-detail__preview"><AssetThumbnail :asset="selectedAsset" :label="assetTitle(selectedAsset)" variant="preview" /></div>
            <div class="asset-detail__body">
              <strong>{{ assetTitle(selectedAsset) }}</strong>
              <small class="fc-mono">{{ selectedAsset.name }}</small>
              <span class="fc-mono">{{ selectedAsset.pixelSize }}</span>
            </div>
            <dl v-if="selectedAssetBounds" class="asset-detail__geometry" data-asset-geometry>
              <div><dt>X</dt><dd>{{ selectedAssetBounds.x }}<small>px</small></dd></div>
              <div><dt>Y</dt><dd>{{ selectedAssetBounds.y }}<small>px</small></dd></div>
              <div><dt>宽</dt><dd>{{ selectedAssetBounds.width }}<small>px</small></dd></div>
              <div><dt>高</dt><dd>{{ selectedAssetBounds.height }}<small>px</small></dd></div>
            </dl>
            <div class="asset-detail__actions">
              <AppCommandButton variant="primary" @click="downloadSelectedAsset"><template #icon><Download :size="14" aria-hidden="true" /></template>下载</AppCommandButton>
              <AppMenu :items="assetCopyItems" @select="copySelectedAssetValue">
                <template #trigger>
                  <AppCommandButton><template #icon><Check v-if="copied === 'path' || copied === 'assetData'" :size="13" aria-hidden="true" /><Copy v-else :size="13" aria-hidden="true" /></template>{{ copied === 'path' || copied === 'assetData' ? '已复制' : '复制路径' }}<ChevronDown :size="13" aria-hidden="true" /></AppCommandButton>
                </template>
              </AppMenu>
            </div>
          </section>
        </section>

        <section v-else-if="viewer.rightTab === 'properties' && selectedLayer && selectedBounds" class="inspector__section inspector__section--property">
          <header class="object-header">
            <span class="object-header__icon"><component :is="propertyIcon" :size="17" :stroke-width="1.8" aria-hidden="true" /></span>
            <span class="object-header__copy">
              <small>{{ propertyKind }}属性</small>
              <h2>{{ propertyTitle }}</h2>
            </span>
            <AppTooltip label="复制对象名称">
              <template #trigger>
                <AppIconButton :label="copied === 'name' ? '已复制对象名称' : '复制对象名称'" @click="copyValue(propertyTitle, 'name')">
                  <Check v-if="copied === 'name'" :size="14" aria-hidden="true" />
                  <Copy v-else :size="14" aria-hidden="true" />
                </AppIconButton>
              </template>
            </AppTooltip>
          </header>
          <section class="property-geometry">
            <dl class="geometry-grid" data-object-geometry>
              <div><dt>X</dt><dd>{{ propertyBounds?.x }}<small>px</small></dd></div>
              <div><dt>Y</dt><dd>{{ propertyBounds?.y }}<small>px</small></dd></div>
              <div><dt>宽</dt><dd>{{ propertyBounds?.width }}<small>px</small></dd></div>
              <div><dt>高</dt><dd>{{ propertyBounds?.height }}<small>px</small></dd></div>
            </dl>
          </section>
          <section v-if="selectedAsset" class="property-section property-section--asset">
            <button class="property-section__toggle" type="button" :aria-expanded="isSectionOpen('assetPreview')" @click="toggleSection('assetPreview')">
              <Image :size="15" aria-hidden="true" />切图预览<ChevronDown :size="15" :class="{ 'is-open': isSectionOpen('assetPreview') }" aria-hidden="true" />
            </button>
            <div v-if="isSectionOpen('assetPreview')" class="property-section__body">
              <AssetThumbnail :asset="selectedAsset" :label="assetTitle(selectedAsset)" variant="preview" />
              <div class="property-actions property-actions--asset">
                <AppCommandButton variant="primary" @click="downloadSelectedAsset"><template #icon><Download :size="14" aria-hidden="true" /></template>下载切图</AppCommandButton>
                <AppMenu :items="assetCopyItems" @select="copySelectedAssetValue">
                  <template #trigger>
                    <AppCommandButton><template #icon><Check v-if="copied === 'path' || copied === 'assetData'" :size="13" aria-hidden="true" /><Copy v-else :size="13" aria-hidden="true" /></template>{{ copied === 'path' || copied === 'assetData' ? '已复制' : '复制路径' }}<ChevronDown :size="13" aria-hidden="true" /></AppCommandButton>
                  </template>
                </AppMenu>
              </div>
            </div>
          </section>
          <section v-if="selectedLayer.text && !selectedAsset" class="property-section">
            <button class="property-section__toggle" type="button" :aria-expanded="isSectionOpen('content')" @click="toggleSection('content')">
              <FileText :size="15" aria-hidden="true" />内容<ChevronDown :size="15" :class="{ 'is-open': isSectionOpen('content') }" aria-hidden="true" />
            </button>
            <div v-if="isSectionOpen('content')" class="property-section__body">
              <div class="object-copy">
                <AppTooltip :label="copied === 'text' ? '已复制文案' : '点击复制文案'">
                  <template #trigger>
                    <button class="object-copy__value" type="button" aria-label="点击复制文案" @click="copyValue(selectedLayer.text ?? '', 'text')">{{ selectedLayer.text }}</button>
                  </template>
                </AppTooltip>
                <AppTooltip :label="copied === 'text' ? '已复制文案' : '点击复制文案'">
                  <template #trigger>
                    <AppIconButton :label="copied === 'text' ? '已复制文案' : '复制文案'" @click="copyValue(selectedLayer.text ?? '', 'text')">
                      <Check v-if="copied === 'text'" :size="14" aria-hidden="true" />
                      <Clipboard v-else :size="14" aria-hidden="true" />
                    </AppIconButton>
                  </template>
                </AppTooltip>
              </div>
            </div>
          </section>
          <section v-if="selectedAsset" class="property-section">
            <button class="property-section__toggle" type="button" :aria-expanded="isSectionOpen('assetInfo')" @click="toggleSection('assetInfo')">
              <FileText :size="15" aria-hidden="true" />切图信息<ChevronDown :size="15" :class="{ 'is-open': isSectionOpen('assetInfo') }" aria-hidden="true" />
            </button>
            <div v-if="isSectionOpen('assetInfo')" class="property-section__body">
              <dl class="property-facts">
                <div v-for="fact in assetFacts" :key="fact.label" class="property-fact"><dt>{{ fact.label }}</dt><dd :class="{ 'fc-mono': fact.mono }">{{ fact.value }}</dd></div>
              </dl>
            </div>
          </section>
          <section v-if="textStyleFacts.length || visualStyleFacts.length" class="property-section">
            <button class="property-section__toggle" type="button" :aria-expanded="isSectionOpen('style')" @click="toggleSection('style')">
              <Type v-if="selectedLayer.text" :size="15" aria-hidden="true" /><Layers2 v-else :size="15" aria-hidden="true" />{{ selectedLayer.text ? '文本样式' : '外观参考' }}<ChevronDown :size="15" :class="{ 'is-open': isSectionOpen('style') }" aria-hidden="true" />
            </button>
            <div v-if="isSectionOpen('style')" class="property-section__body">
              <p v-if="selectedLayer.text" class="property-section__caption">已提取文本样式</p>
              <dl class="property-facts property-facts--style">
                <div v-for="fact in selectedLayer.text ? textStyleFacts : visualStyleFacts" :key="fact.label" class="property-fact"><dt>{{ fact.label }}</dt><dd :class="{ 'fc-mono': fact.mono }"><span v-if="fact.color" class="property-fact__swatch" :style="{ backgroundColor: fact.color }" aria-hidden="true" />{{ fact.value }}</dd></div>
              </dl>
            </div>
          </section>
          <section class="property-section property-section--code">
            <div class="property-section__header">
              <button class="property-section__toggle" type="button" :aria-expanded="isSectionOpen('code')" @click="toggleSection('code')">
                <Code2 :size="15" aria-hidden="true" />参考 CSS<ChevronDown :size="15" :class="{ 'is-open': isSectionOpen('code') }" aria-hidden="true" />
              </button>
              <AppTooltip :label="copied === 'css' ? '已复制 CSS' : '复制 CSS'">
                <template #trigger>
                  <AppIconButton :label="copied === 'css' ? '已复制 CSS' : '复制 CSS'" @click="copyValue(cssProjection, 'css')">
                    <Check v-if="copied === 'css'" :size="14" aria-hidden="true" />
                    <Copy v-else :size="14" aria-hidden="true" />
                  </AppIconButton>
                </template>
              </AppTooltip>
            </div>
            <div v-if="isSectionOpen('code')" class="property-section__body property-section__body--code">
              <pre class="inspector__code"><code><span v-for="line in cssProjectionLines" :key="line.property" class="inspector__code-line"><span class="inspector__code-property">{{ line.property }}</span><span class="inspector__code-punctuation">: </span><span class="inspector__code-value" :class="`is-${line.valueKind}`">{{ line.value }}</span><span class="inspector__code-punctuation">;</span></span></code></pre>
            </div>
          </section>
          <section v-if="selectedLayerFacts.length" class="property-section">
            <button class="property-section__toggle" type="button" :aria-expanded="isSectionOpen('layerInfo')" @click="toggleSection('layerInfo')">
              <Layers2 :size="15" aria-hidden="true" />图层信息<ChevronDown :size="15" :class="{ 'is-open': isSectionOpen('layerInfo') }" aria-hidden="true" />
            </button>
            <div v-if="isSectionOpen('layerInfo')" class="property-section__body">
              <dl class="property-facts">
                <div v-for="fact in selectedLayerFacts" :key="fact.label" class="property-fact"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
              </dl>
            </div>
          </section>
        </section>

        <section v-else-if="viewer.rightTab === 'diagnostics'" class="inspector__section">
          <header class="asset-catalog__header"><span><small>需要处理的解析差异</small><h2>{{ developmentDiagnostics.length }} 项开发提示</h2></span></header>
          <button v-for="diagnostic in developmentDiagnostics" :key="diagnostic.id" class="diagnostic-row" :class="`diagnostic-row--${diagnostic.severity}`" type="button" @click="inspectDiagnostic(diagnostic.layerId)">
            <TriangleAlert v-if="diagnostic.severity === 'warning'" :size="16" aria-hidden="true" />
            <FileText v-else :size="16" aria-hidden="true" />
            <span><strong>{{ diagnostic.type }}</strong><small>{{ diagnostic.message }}</small></span>
          </button>
        </section>

        <section v-else class="inspector__empty-state inspector__empty-state--full">
          <Layers2 :size="22" :stroke-width="1.6" aria-hidden="true" />
          <p>尚未选择开发元素</p>
          <span>从左侧开发元素或画布中选择文案 切图或背景</span>
        </section>
      </div>
    </AppScrollArea>
  </aside>
</template>

<style scoped>
.inspector { display: grid; min-width: 0; min-height: 0; grid-template-rows: var(--fc-tab-height) minmax(0, 1fr); background: var(--fc-surface-root); }
.inspector__scroll { min-height: 0; }
.inspector__content { min-height: 100%; }
.inspector__section { padding-bottom: var(--fc-space-4); }
.inspector__section--property { padding-bottom: 0; }
.object-header, .asset-catalog__header { display: flex; min-width: 0; padding: var(--fc-space-3) var(--fc-space-4); align-items: center; gap: var(--fc-space-3); border-bottom: 1px solid var(--fc-border); }
.object-header__icon { display: grid; width: 32px; height: 32px; flex: 0 0 auto; place-items: center; color: var(--fc-accent); background: var(--fc-accent-subtle); border: 1px solid color-mix(in srgb, var(--fc-accent) 18%, transparent); border-radius: var(--fc-radius-control); }
.object-header__copy { min-width: 0; flex: 1; }
.object-header small, .asset-catalog__header small { display: block; color: var(--fc-text-muted); font-size: var(--fc-font-caption); font-weight: 600; }
.object-header h2, .asset-catalog__header h2 { max-width: 240px; margin: 2px 0 0; overflow: hidden; color: var(--fc-text); font-size: 14px; font-weight: 650; line-height: 19px; text-overflow: ellipsis; white-space: nowrap; }
.object-header :deep(.fc-icon-button) { margin-left: auto; }
.asset-catalog__header { justify-content: space-between; }
.asset-catalog__toolbar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; padding: var(--fc-space-2) var(--fc-space-3); align-items: center; gap: var(--fc-space-2); border-bottom: 1px solid var(--fc-border); }
.asset-catalog__toolbar :deep(.fc-command-button) { width: 100%; justify-content: center; }
.asset-catalog__all { position: relative; display: inline-flex; height: 26px; padding: 0 6px; align-items: center; gap: 5px; color: var(--fc-text-secondary); font-size: var(--fc-font-caption); font-weight: 600; cursor: pointer; background: var(--fc-surface-subtle); border-radius: var(--fc-radius-compact); }
.asset-catalog__all input, .asset-catalog__check input { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.asset-catalog__checkbox { display: grid; width: 14px; height: 14px; flex: 0 0 14px; place-items: center; color: var(--fc-accent); background: transparent; border: 1px solid var(--fc-border-strong); border-radius: var(--fc-radius-compact); }
.asset-catalog__checkbox svg { opacity: 0; transition: opacity var(--fc-transition-fast); }
.asset-catalog__all:hover .asset-catalog__checkbox, .asset-catalog__check:hover .asset-catalog__checkbox { border-color: var(--fc-accent); background: var(--fc-surface-hover); }
.asset-catalog__all input:checked + .asset-catalog__checkbox, .asset-catalog__check input:checked + .asset-catalog__checkbox { border-color: var(--fc-accent); }
.asset-catalog__all input:checked + .asset-catalog__checkbox svg, .asset-catalog__check input:checked + .asset-catalog__checkbox svg { opacity: 1; }
.asset-catalog__all input:focus-visible + .asset-catalog__checkbox, .asset-catalog__check input:focus-visible + .asset-catalog__checkbox { box-shadow: var(--fc-focus-ring); }
.inspector__group { padding: var(--fc-space-3) var(--fc-space-4); border-bottom: 1px solid var(--fc-border); }
.inspector__group h3 { margin: 0; color: var(--fc-text); font-size: 12px; font-weight: 650; }
.inspector__group--geometry { background: color-mix(in srgb, var(--fc-accent) 3%, transparent); }
.inspector__group-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--fc-space-2); }
.geometry-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin: var(--fc-space-3) 0 0; }
.geometry-grid div { display: grid; min-width: 0; min-height: 30px; padding: 0; grid-template-columns: 20px minmax(0, 1fr); align-items: center; gap: 4px; background: transparent; border: 0; }
.geometry-grid dt { color: var(--fc-text-muted); font-size: 10px; font-weight: 650; }
.geometry-grid dd { display: flex; min-width: 0; height: 30px; padding: 0 9px; margin: 0; align-items: center; color: var(--fc-text); font-family: var(--fc-mono-font); font-size: 12px; font-variant-numeric: tabular-nums; background: var(--fc-surface-subtle); border-radius: var(--fc-radius-compact); }
.geometry-grid dd small { margin-left: 3px; color: var(--fc-text-muted); font-family: var(--fc-ui-font); font-size: 10px; }
.property-geometry { padding: var(--fc-space-3) var(--fc-space-4); border-bottom: 1px solid var(--fc-border); }
.property-geometry .geometry-grid { margin: 0; }
.measure-mode { display: inline-flex; align-items: center; gap: 4px; color: var(--fc-text-muted); font-size: 10px; }
.inspector__group--measure { background: var(--fc-surface-subtle); }
.fact-list { display: grid; grid-template-columns: minmax(72px, .65fr) minmax(0, 1.35fr); gap: 8px var(--fc-space-2); margin: var(--fc-space-3) 0 0; }
.fact-list dt { color: var(--fc-text-muted); font-size: var(--fc-font-caption); }
.fact-list dd { min-width: 0; margin: 0; overflow-wrap: anywhere; color: var(--fc-text-secondary); font-size: 12px; line-height: 17px; }
.inspector__empty-copy { margin: var(--fc-space-2) 0 0; color: var(--fc-text-muted); font-size: var(--fc-font-caption); line-height: 17px; }
.property-section { border-bottom: 1px solid var(--fc-border); }
.property-section__header { display: flex; height: 42px; padding-right: var(--fc-space-2); align-items: center; }
.property-section__toggle { display: flex; width: 100%; min-width: 0; min-height: 42px; padding: 0 var(--fc-space-4); align-items: center; gap: var(--fc-space-2); color: var(--fc-text); font-size: 12px; font-weight: 650; text-align: left; cursor: pointer; background: transparent; border: 0; }
.property-section__toggle:hover { background: var(--fc-surface-hover); }
.property-section__toggle:focus-visible { outline: none; box-shadow: inset var(--fc-focus-ring); }
.property-section__toggle > svg:last-child { margin-left: auto; color: var(--fc-text-muted); transition: transform var(--fc-transition-fast); }
.property-section__toggle > svg.is-open { transform: rotate(180deg); }
.property-section__body { padding: 0 var(--fc-space-4) var(--fc-space-3); }
.property-section__body--code { padding-top: 0; }
.property-section__caption { margin: 0 0 var(--fc-space-2); color: var(--fc-text-muted); font-size: var(--fc-font-caption); }
.object-copy { display: flex; min-width: 0; height: 34px; align-items: center; overflow: hidden; color: var(--fc-text); background: var(--fc-surface-subtle); border: 1px solid transparent; border-radius: var(--fc-radius-compact); transition: background var(--fc-transition-fast), border-color var(--fc-transition-fast); }
.object-copy:hover, .object-copy:focus-within { background: color-mix(in srgb, var(--fc-warning) 18%, var(--fc-surface-root)); border-color: color-mix(in srgb, var(--fc-warning) 36%, var(--fc-border)); }
.object-copy__value { min-width: 0; height: 100%; padding: 0 var(--fc-space-2) 0 var(--fc-space-3); flex: 1; overflow: hidden; color: inherit; font: inherit; font-size: 13px; line-height: 20px; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; background: transparent; border: 0; }
.object-copy__value:focus-visible { outline: none; box-shadow: inset var(--fc-focus-ring); }
.object-copy :deep(.fc-icon-button) { flex: 0 0 var(--fc-icon-button-size); margin-right: 2px; }
.property-actions { display: flex; margin-top: var(--fc-space-2); flex-wrap: wrap; gap: var(--fc-space-2); }
.property-actions--asset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.property-actions--asset :deep(.fc-command-button) { width: 100%; justify-content: center; }
.property-facts { display: grid; gap: 7px; margin: 0; }
.property-fact { display: grid; min-width: 0; min-height: 29px; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: var(--fc-space-2); }
.property-fact dt { color: var(--fc-text-muted); font-size: var(--fc-font-caption); }
.property-fact dd { display: flex; min-width: 0; min-height: 29px; padding: 5px 9px; align-items: center; margin: 0; overflow-wrap: anywhere; color: var(--fc-text-secondary); font-size: 11px; line-height: 16px; background: var(--fc-surface-subtle); border-radius: var(--fc-radius-compact); }
.property-fact__swatch { width: 13px; height: 13px; margin-right: 7px; flex: 0 0 auto; border: 1px solid color-mix(in srgb, var(--fc-text) 12%, transparent); border-radius: 50%; }
.property-section--asset :deep(.asset-thumbnail--preview) { width: 100%; }
.inspector__code { margin: 0; padding: var(--fc-space-3); overflow-x: auto; color: var(--fc-code-text); font-family: var(--fc-mono-font); font-size: var(--fc-font-caption); line-height: 19px; background: var(--fc-code-background); border: 1px solid var(--fc-code-border); border-radius: var(--fc-radius-compact); }
.inspector__code code { display: block; min-width: max-content; }
.inspector__code-line { display: block; white-space: pre; }
.inspector__code-property { color: var(--fc-code-property); font-weight: 600; }
.inspector__code-punctuation { color: var(--fc-code-punctuation); }
.inspector__code-value.is-color { color: var(--fc-code-string); }
.inspector__code-value.is-keyword { color: var(--fc-code-keyword); }
.inspector__code-value.is-number { color: var(--fc-code-number); }
.inspector__code-value.is-string { color: var(--fc-code-string); }
.asset-catalog { padding: var(--fc-space-2) 0; }
.asset-catalog__row { display: grid; min-width: 0; padding: 4px var(--fc-space-3); grid-template-columns: 20px minmax(0, 1fr); align-items: center; gap: 5px; border-left: 2px solid transparent; }
.asset-catalog__row.is-active { background: var(--fc-accent-subtle); border-left-color: var(--fc-accent); }
.asset-catalog__check { position: relative; display: grid; width: 20px; height: 40px; place-items: center; cursor: pointer; }
.asset-catalog__row button { display: grid; width: 100%; min-width: 0; padding: 4px; grid-template-columns: 40px minmax(0, 1fr); align-items: center; gap: 9px; color: inherit; text-align: left; cursor: pointer; background: transparent; border: 0; border-radius: var(--fc-radius-compact); }
.asset-catalog__row button:hover { background: color-mix(in srgb, var(--fc-accent) 6%, transparent); }
.asset-catalog__row button > span { display: grid; min-width: 0; gap: 2px; }
.asset-catalog__row strong, .asset-catalog__row small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-catalog__row strong { color: var(--fc-text); font-size: 12px; font-weight: 600; }
.asset-catalog__row small { color: var(--fc-text-muted); font-size: 10px; line-height: 13px; }
.asset-detail { margin: var(--fc-space-3) var(--fc-space-3) 0; border: 1px solid var(--fc-border); border-radius: var(--fc-radius-panel); }
.asset-detail__preview { padding: var(--fc-space-3) var(--fc-space-3) 0; }
.asset-detail__preview :deep(.asset-thumbnail--preview) { width: 100%; }
.asset-detail__body { padding: var(--fc-space-3) var(--fc-space-3) 0; text-align: left; }
.asset-detail__body strong, .asset-detail__body small, .asset-detail__body span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-detail__body strong { color: var(--fc-text); font-size: 12px; }
.asset-detail__body small, .asset-detail__body span { margin-top: 3px; color: var(--fc-text-muted); font-size: 10px; }
.asset-detail__geometry { display: grid; padding: 0 var(--fc-space-3); grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: var(--fc-space-3) 0 0; }
.asset-detail__geometry div { display: grid; min-width: 0; min-height: 28px; grid-template-columns: 17px minmax(0, 1fr); align-items: center; gap: 3px; }
.asset-detail__geometry dt { color: var(--fc-text-muted); font-size: var(--fc-font-tiny); font-weight: 600; }
.asset-detail__geometry dd { display: flex; min-width: 0; min-height: 28px; padding: 0 7px; align-items: center; margin: 0; color: var(--fc-text); font-family: var(--fc-mono-font); font-size: 11px; font-variant-numeric: tabular-nums; background: var(--fc-surface-subtle); border-radius: var(--fc-radius-compact); }
.asset-detail__geometry dd small { margin-left: 2px; color: var(--fc-text-muted); font-family: var(--fc-ui-font); font-size: var(--fc-font-tiny); }
.asset-detail__actions { display: flex; padding: var(--fc-space-3); flex-wrap: wrap; gap: var(--fc-space-2); }
.inspector__empty-state { display: grid; min-height: 230px; padding: var(--fc-space-5); place-content: center; justify-items: center; gap: var(--fc-space-2); color: var(--fc-text-muted); text-align: center; }
.inspector__empty-state--full { min-height: 100%; }
.inspector__empty-state p { margin: 0; color: var(--fc-text-secondary); font-size: 13px; font-weight: 600; }
.inspector__empty-state span { max-width: 210px; font-size: 12px; line-height: 18px; }
.diagnostic-row { display: grid; width: 100%; min-width: 0; padding: var(--fc-space-3) var(--fc-space-4); grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: var(--fc-space-2); color: var(--fc-text-secondary); text-align: left; cursor: pointer; background: transparent; border: 0; border-bottom: 1px solid var(--fc-border); }
.diagnostic-row:hover { background: var(--fc-surface-hover); }
.diagnostic-row strong, .diagnostic-row small { display: block; }
.diagnostic-row strong { color: var(--fc-text); font-family: var(--fc-mono-font); font-size: var(--fc-font-caption); font-weight: 600; }
.diagnostic-row small { margin-top: 3px; color: var(--fc-text-secondary); font-size: var(--fc-font-caption); line-height: 16px; }
.diagnostic-row--warning > svg { color: var(--fc-warning); }
.diagnostic-row--error > svg { color: var(--fc-error); }
</style>
