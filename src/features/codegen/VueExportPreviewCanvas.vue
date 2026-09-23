<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { h5TemplateProfile } from './profile'
import type { VueExportPreviewElement, VueExportPreviewModel } from './types'

/**
 * 生成页面的平台内预览画布。
 *
 * 直接消费生成器的 `preview` 结构化投影（与 SFC 同源生成），
 * 按 750 设计坐标绝对定位渲染；支持叠加设计稿参考图比对，写入前即可发现偏差。
 * 图片通过 `resolveImage` 注入的解析器取得 object URL（宿主从 Bundle 存储读取）。
 */
const props = defineProps<{
  model: VueExportPreviewModel
  /** 设计稿参考图 URL（叠加比对用）；缺省时不显示叠加层 */
  referenceUrl?: string
  /** 把 bundle 内切图源路径解析为可展示 URL */
  resolveImage: (sourcePath: string) => Promise<string | undefined>
  /** 预览可用宽度（px）；缺省时实测容器宽度，实测不可用时回退 360 */
  fitWidth?: number
}>()

const overlayEnabled = ref(true)
const overlayOpacity = ref(35)
const containerWidth = ref(0)
const imageUrls = ref<Record<string, string>>({})
const container = ref<HTMLElement | null>(null)
const createdUrls: string[] = []
let resizeObserver: ResizeObserver | undefined

const scale = computed(() => {
  const width = props.fitWidth ?? (containerWidth.value || 360)
  return Math.min(1, width / props.model.canvas.width)
})

const stageHeight = computed(() => `${Math.round(props.model.canvas.height * scale.value)}px`)

watch(
  () => props.model,
  (model) => {
    void loadImages(model)
  },
  { immediate: true },
)

/** 按需解析图片 URL；同一 sourcePath 只解析一次，卸载时统一回收 */
async function loadImages(model: VueExportPreviewModel) {
  for (const element of model.elements) {
    if (element.type !== 'image' || imageUrls.value[element.sourcePath]) {
      continue
    }
    const url = await props.resolveImage(element.sourcePath)
    if (url) {
      createdUrls.push(url)
      imageUrls.value = { ...imageUrls.value, [element.sourcePath]: url }
    }
  }
}

function frameStyle(frame: { x: number; y: number; width: number; height: number }) {
  return {
    position: 'absolute',
    top: `${frame.y}px`,
    left: `${frame.x}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
  }
}

function textStyle(element: Extract<VueExportPreviewElement, { type: 'text' }>) {
  return {
    position: 'absolute',
    top: `${element.bounds.y}px`,
    left: `${element.bounds.x}px`,
    width: `${element.bounds.width}px`,
    margin: '0',
    fontFamily: element.style.fontFamily
      ? `"${element.style.fontFamily}", ${h5TemplateProfile.fontFallbackStack}`
      : h5TemplateProfile.fontFallbackStack,
    fontSize: element.style.fontSize !== undefined ? `${element.style.fontSize}px` : undefined,
    lineHeight: `${element.style.lineHeight}px`,
    color: element.style.color,
    textAlign: element.style.textAlign as 'left' | 'center' | 'right' | undefined,
    letterSpacing: element.style.letterSpacing !== undefined ? `${element.style.letterSpacing}px` : undefined,
    fontWeight: element.style.fontWeight,
  }
}

onMounted(() => {
  if (typeof ResizeObserver === 'undefined') {
    return
  }
  const element = container.value
  if (!element) {
    return
  }
  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width
    if (width) {
      containerWidth.value = width
    }
  })
  resizeObserver.observe(element)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  for (const url of createdUrls) {
    URL.revokeObjectURL(url)
  }
})
</script>

<template>
  <div ref="container" class="vue-export-preview" data-testid="vue-export-preview">
    <div class="vue-export-preview__controls">
      <label v-if="referenceUrl" class="vue-export-preview__control">
        <input v-model="overlayEnabled" data-testid="vue-export-overlay-toggle" type="checkbox" />
        叠加设计稿
      </label>
      <label v-if="referenceUrl && overlayEnabled" class="vue-export-preview__control vue-export-preview__control--range">
        透明度
        <input v-model.number="overlayOpacity" max="100" min="0" type="range" />
      </label>
    </div>

    <div class="vue-export-preview__viewport" :style="{ height: stageHeight }">
      <div
        class="vue-export-preview__stage"
        :style="{
          width: `${model.canvas.width}px`,
          height: `${model.canvas.height}px`,
          transform: `scale(${scale})`,
        }"
      >
        <img
          v-if="referenceUrl && overlayEnabled"
          class="vue-export-preview__reference"
          :src="referenceUrl"
          :style="{ opacity: overlayOpacity / 100 }"
        />
        <template v-for="element in model.elements" :key="element.className">
          <img
            v-if="element.type === 'image'"
            class="vue-export-preview__image"
            :class="{ 'is-clickable': element.clickable }"
            :src="imageUrls[element.sourcePath]"
            :style="frameStyle(element.frame)"
          />
          <p v-else class="vue-export-preview__text" :style="textStyle(element)">{{ element.content }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vue-export-preview {
  min-width: 0;
}

.vue-export-preview__controls {
  display: flex;
  padding-bottom: var(--fc-space-2);
  align-items: center;
  gap: var(--fc-space-3);
}

.vue-export-preview__control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--fc-text-secondary);
  font-size: 12px;
}

.vue-export-preview__viewport {
  position: relative;
  overflow: hidden;
  background: var(--fc-surface-subtle);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-panel);
}

.vue-export-preview__stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}

.vue-export-preview__reference {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.vue-export-preview__image {
  display: block;
  background: color-mix(in srgb, var(--fc-selected) 8%, transparent);
}

.vue-export-preview__image.is-clickable {
  outline: 1px dashed color-mix(in srgb, var(--fc-accent) 60%, transparent);
  outline-offset: -1px;
}

.vue-export-preview__text {
  overflow: hidden;
  white-space: pre-wrap;
}
</style>
