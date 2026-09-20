<script setup lang="ts">
import { computed, ref } from 'vue'
import { Box, ChevronDown, ChevronRight, EyeOff, Image, Layers3, Shapes, Type } from 'lucide-vue-next'
import { activeViewerSession } from '../workspace/bundle-session'
import type { DesignLayer, LayerType } from './types'
import { useViewerStore } from './viewer-store'
import AppIconButton from '../../shared/ui/AppIconButton.vue'
import AppScrollArea from '../../shared/ui/AppScrollArea.vue'
import AppTextField from '../../shared/ui/AppTextField.vue'
import AppTooltip from '../../shared/ui/AppTooltip.vue'

interface LayerRow {
  layer: DesignLayer
  depth: number
}

const viewer = useViewerStore()
const search = ref('')
const typeFilter = ref<'all' | LayerType>('all')
const searchField = ref<{ focus: () => void } | null>(null)

const filters: Array<{ value: 'all' | LayerType; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'group', label: '组' },
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' },
  { value: 'shape', label: '形状' },
  { value: 'smartobject', label: '智能' },
]

const rows = computed<LayerRow[]>(() => {
  const result: LayerRow[] = []
  const keyword = search.value.trim().toLowerCase()

  function matches(layer: DesignLayer) {
    const textMatch = !keyword || `${layer.name} ${layer.text ?? ''}`.toLowerCase().includes(keyword)
    const typeMatch = typeFilter.value === 'all' || layer.type === typeFilter.value
    return textMatch && typeMatch
  }

  function includesMatch(layer: DesignLayer): boolean {
    return matches(layer) || Boolean(layer.children?.some(includesMatch))
  }

  function visit(layer: DesignLayer, depth: number) {
    if (!includesMatch(layer)) {
      return
    }

    result.push({ layer, depth })
    const isExpanded = viewer.expandedLayerIds.includes(layer.id) || Boolean(keyword)
    if (layer.children && isExpanded) {
      layer.children.forEach((child) => visit(child, depth + 1))
    }
  }

  activeViewerSession.value?.layers.forEach((layer) => visit(layer, 0))
  return result
})

function iconFor(type: LayerType) {
  const icons = {
    group: Layers3,
    text: Type,
    shape: Shapes,
    image: Image,
    smartobject: Box,
  }
  return icons[type]
}

function focusSearch() {
  searchField.value?.focus()
}

defineExpose({ focusSearch })
</script>

<template>
  <section class="layer-tree" aria-label="图层树">
    <div class="layer-tree__controls">
      <AppTextField ref="searchField" v-model="search" label="搜索图层" placeholder="搜索图层或文本" />
      <div class="layer-tree__filters" aria-label="图层类型筛选">
        <button
          v-for="filter in filters"
          :key="filter.value"
          type="button"
          :class="{ 'is-active': typeFilter === filter.value }"
          @click="typeFilter = filter.value"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <AppScrollArea class="layer-tree__scroll">
      <div class="layer-tree__rows" role="tree" aria-label="演示设计稿图层">
        <div
          v-for="row in rows"
          :key="row.layer.id"
          class="layer-tree__row"
          :class="{
            'is-selected': viewer.selectedLayerId === row.layer.id,
            'is-hovered': viewer.hoveredLayerId === row.layer.id,
          }"
          :style="{ '--depth': row.depth }"
          role="treeitem"
          :aria-level="row.depth + 1"
          :aria-selected="viewer.selectedLayerId === row.layer.id"
          @pointerenter="viewer.hoveredLayerId = row.layer.id"
          @pointerleave="viewer.hoveredLayerId = null"
        >
          <button
            v-if="row.layer.children"
            class="layer-tree__expand"
            type="button"
            :aria-label="viewer.expandedLayerIds.includes(row.layer.id) ? '折叠分组' : '展开分组'"
            @click="viewer.toggleExpanded(row.layer.id)"
          >
            <ChevronDown v-if="viewer.expandedLayerIds.includes(row.layer.id) || search" :size="14" aria-hidden="true" />
            <ChevronRight v-else :size="14" aria-hidden="true" />
          </button>
          <span v-else class="layer-tree__expand-spacer" aria-hidden="true" />

          <button class="layer-tree__select" type="button" :data-layer-id="row.layer.id" @click="viewer.inspectLayer(row.layer.id)">
            <component :is="iconFor(row.layer.type)" :size="14" :stroke-width="1.7" aria-hidden="true" />
            <span class="layer-tree__name">{{ row.layer.name }}</span>
          </button>

          <span v-if="row.layer.assetId" class="layer-tree__marker" title="已声明资源">A</span>
          <span v-if="row.layer.diagnosticIds?.length" class="layer-tree__diagnostic" title="存在诊断">!</span>
          <AppTooltip label="局部隐藏预览将在后续图层会话中提供">
            <template #trigger>
              <span class="layer-tree__visibility-wrap">
                <AppIconButton label="图层显隐预览不可用" disabled>
                  <EyeOff :size="13" :stroke-width="1.7" aria-hidden="true" />
                </AppIconButton>
              </span>
            </template>
          </AppTooltip>
        </div>
      </div>
    </AppScrollArea>
  </section>
</template>

<style scoped>
.layer-tree {
  display: grid;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
}

.layer-tree__controls {
  padding: var(--fc-space-2);
  border-bottom: 1px solid var(--fc-border);
}

.layer-tree__filters {
  display: flex;
  padding-top: var(--fc-space-2);
  gap: 2px;
  overflow-x: auto;
}

.layer-tree__filters button {
  height: 22px;
  padding: 0 6px;
  color: var(--fc-text-secondary);
  font-size: var(--fc-font-caption);
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--fc-radius-compact);
}

.layer-tree__filters button:hover,
.layer-tree__filters button.is-active {
  color: var(--fc-text);
  background: var(--fc-surface-hover);
}

.layer-tree__filters button.is-active {
  box-shadow: inset 0 -1px 0 var(--fc-selected);
}

.layer-tree__scroll {
  min-height: 0;
}

.layer-tree__rows {
  padding: var(--fc-space-1) 0;
}

.layer-tree__row {
  display: flex;
  min-width: 0;
  min-height: var(--fc-row-height);
  padding-right: var(--fc-space-1);
  padding-left: calc(var(--fc-space-1) + var(--depth) * 14px);
  align-items: center;
  color: var(--fc-text-secondary);
  border-left: 2px solid transparent;
}

.layer-tree__row.is-hovered {
  background: var(--fc-surface-hover);
}

.layer-tree__row.is-selected {
  color: var(--fc-text);
  background: var(--fc-selected-subtle);
  border-left-color: var(--fc-selected);
}

.layer-tree__expand,
.layer-tree__select {
  display: inline-flex;
  min-width: 0;
  height: var(--fc-row-height);
  padding: 0;
  align-items: center;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.layer-tree__expand {
  width: 18px;
  justify-content: center;
}

.layer-tree__expand-spacer {
  width: 18px;
  flex: 0 0 auto;
}

.layer-tree__select {
  flex: 1;
  gap: 7px;
  overflow: hidden;
  text-align: left;
}

.layer-tree__name {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-tree__marker,
.layer-tree__diagnostic {
  display: grid;
  width: 14px;
  height: 14px;
  margin-left: 3px;
  place-items: center;
  font-family: var(--fc-mono-font);
  font-size: var(--fc-font-tiny);
  line-height: 1;
  border-radius: var(--fc-radius-compact);
}

.layer-tree__marker {
  color: var(--fc-exact);
  background: color-mix(in srgb, var(--fc-exact) 10%, transparent);
}

.layer-tree__diagnostic {
  color: var(--fc-warning);
  background: color-mix(in srgb, var(--fc-warning) 10%, transparent);
}

.layer-tree__visibility-wrap {
  display: inline-flex;
  margin-left: 2px;
}

</style>
