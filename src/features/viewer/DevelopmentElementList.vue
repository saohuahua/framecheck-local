<script setup lang="ts">
import { computed, ref } from 'vue'
import { Image, Layers2, Type } from 'lucide-vue-next'
import { activeViewerSession } from '../workspace/bundle-session'
import { getDevelopmentElements, type DevelopmentElementKind } from './development-elements'
import AppScrollArea from '../../shared/ui/AppScrollArea.vue'
import AppTextField from '../../shared/ui/AppTextField.vue'
import { useViewerStore } from './viewer-store'

type FilterKind = 'all' | DevelopmentElementKind

const viewer = useViewerStore()
const search = ref('')
const filter = ref<FilterKind>('all')
const searchField = ref<{ focus: () => void } | null>(null)

const filters: Array<{ value: FilterKind; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'asset', label: '切图' },
  { value: 'text', label: '文案' },
  { value: 'background', label: '背景' },
]

const elements = computed(() => getDevelopmentElements(
  activeViewerSession.value?.layers ?? [],
  activeViewerSession.value?.assets ?? [],
  activeViewerSession.value?.canvas ?? { width: 1, height: 1 },
))
const filteredElements = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return elements.value.filter((element) => {
    const matchesFilter = filter.value === 'all' || element.kind === filter.value
    const source = `${element.name} ${element.detail} ${element.text ?? ''}`.toLocaleLowerCase()
    return matchesFilter && (!keyword || source.includes(keyword))
  })
})
const sections = computed(() => [
  { kind: 'asset' as const, label: '切图资源', items: filteredElements.value.filter((item) => item.kind === 'asset') },
  { kind: 'text' as const, label: '文案', items: filteredElements.value.filter((item) => item.kind === 'text') },
  { kind: 'background' as const, label: '背景', items: filteredElements.value.filter((item) => item.kind === 'background') },
].filter((section) => section.items.length))

function iconFor(kind: DevelopmentElementKind) {
  return {
    asset: Image,
    text: Type,
    background: Layers2,
  }[kind]
}

function selectElement(kind: DevelopmentElementKind, layerId: string, assetId?: string) {
  if (kind === 'asset' && assetId) {
    viewer.selectAsset(assetId, layerId, true)
    return
  }
  viewer.inspectLayer(layerId, true)
}

function focusSearch() {
  searchField.value?.focus()
}

defineExpose({ focusSearch })
</script>

<template>
  <section class="development-list" aria-label="开发元素">
    <div class="development-list__controls">
      <AppTextField ref="searchField" v-model="search" label="搜索开发元素" placeholder="搜索切图 文案或背景" />
      <div class="development-list__filters" aria-label="开发元素筛选">
        <button
          v-for="item in filters"
          :key="item.value"
          class="development-list__filter"
          :class="{ 'is-active': filter === item.value }"
          type="button"
          @click="filter = item.value"
        >
          {{ item.label }}
          <span>{{ item.value === 'all' ? elements.length : elements.filter((element) => element.kind === item.value).length }}</span>
        </button>
      </div>
    </div>

    <AppScrollArea class="development-list__scroll">
      <div v-if="sections.length" class="development-list__content">
        <section v-for="section in sections" :key="section.kind" class="development-list__section">
          <header class="development-list__section-heading">
            <span>{{ section.label }}</span>
            <span class="fc-mono">{{ section.items.length }}</span>
          </header>
          <button
            v-for="element in section.items"
            :key="element.id"
            class="development-list__row"
            :class="{
              'is-selected': viewer.selectedLayerId === element.layerId,
              'is-hovered': viewer.hoveredLayerId === element.layerId,
            }"
            type="button"
            :data-development-id="element.id"
            @pointerenter="viewer.hoveredLayerId = element.layerId"
            @pointerleave="viewer.hoveredLayerId = null"
            @click="selectElement(element.kind, element.layerId, element.assetId)"
          >
            <span class="development-list__icon" :class="`is-${element.kind}`">
              <component :is="iconFor(element.kind)" :size="15" :stroke-width="1.8" aria-hidden="true" />
            </span>
            <span class="development-list__row-content">
              <strong>{{ element.name }}</strong>
              <small v-if="element.text" class="development-list__text">{{ element.text }}</small>
              <small class="development-list__meta"><span class="fc-mono">X {{ element.bounds.x }} Y {{ element.bounds.y }}</span>{{ element.detail }}</small>
            </span>
          </button>
        </section>
      </div>
      <div v-else class="development-list__empty">
        <Layers2 :size="20" :stroke-width="1.6" aria-hidden="true" />
        <strong>没有匹配的开发元素</strong>
        <span>仅显示 bundle 已声明的切图 文案和背景</span>
      </div>
    </AppScrollArea>
  </section>
</template>

<style scoped>
.development-list {
  display: grid;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
}

.development-list__controls {
  padding: var(--fc-space-2);
  border-bottom: 1px solid var(--fc-border);
}

.development-list__filters {
  display: flex;
  padding-top: var(--fc-space-2);
  gap: 3px;
  overflow-x: auto;
}

.development-list__filter {
  display: inline-flex;
  height: 24px;
  padding: 0 7px;
  align-items: center;
  gap: 4px;
  color: var(--fc-text-secondary);
  font-size: var(--fc-font-caption);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--fc-radius-compact);
}

.development-list__filter:hover,
.development-list__filter.is-active {
  color: var(--fc-accent);
  background: var(--fc-accent-subtle);
  border-color: color-mix(in srgb, var(--fc-accent) 18%, transparent);
}

.development-list__filter span {
  color: inherit;
  font-family: var(--fc-mono-font);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.development-list__scroll {
  min-height: 0;
}

.development-list__content {
  padding: var(--fc-space-2) 0 var(--fc-space-4);
}

.development-list__section + .development-list__section {
  margin-top: var(--fc-space-3);
}

.development-list__section-heading {
  display: flex;
  height: 26px;
  padding: 0 var(--fc-space-3);
  align-items: center;
  justify-content: space-between;
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
  font-weight: 700;
  letter-spacing: 0;
}

.development-list__row {
  display: grid;
  width: 100%;
  min-width: 0;
  min-height: 54px;
  padding: 7px var(--fc-space-3);
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  color: var(--fc-text-secondary);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-left: 2px solid transparent;
}

.development-list__row:hover,
.development-list__row.is-hovered {
  background: var(--fc-surface-hover);
}

.development-list__row.is-selected {
  color: var(--fc-text);
  background: var(--fc-selected-subtle);
  border-left-color: var(--fc-selected);
}

.development-list__icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: var(--fc-text-secondary);
  background: var(--fc-surface-subtle);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-compact);
}

.development-list__icon.is-asset {
  color: var(--fc-accent);
  background: var(--fc-accent-subtle);
}

.development-list__icon.is-text {
  color: var(--fc-measure);
  background: color-mix(in srgb, var(--fc-measure) 8%, transparent);
}

.development-list__row-content {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.development-list__row strong,
.development-list__row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.development-list__row strong {
  color: var(--fc-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
}

.development-list__text {
  color: var(--fc-text-secondary);
  font-size: var(--fc-font-caption);
  line-height: 15px;
}

.development-list__meta {
  display: flex;
  min-width: 0;
  gap: 6px;
  color: var(--fc-text-muted);
  font-size: 10px;
  line-height: 14px;
}

.development-list__meta span {
  flex: 0 0 auto;
}

.development-list__empty {
  display: grid;
  min-height: 220px;
  padding: var(--fc-space-5);
  place-content: center;
  justify-items: center;
  gap: var(--fc-space-2);
  color: var(--fc-text-muted);
  text-align: center;
}

.development-list__empty strong {
  color: var(--fc-text-secondary);
  font-size: 12px;
}

.development-list__empty span {
  max-width: 180px;
  font-size: var(--fc-font-caption);
  line-height: 17px;
}
</style>
