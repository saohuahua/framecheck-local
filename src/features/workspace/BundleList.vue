<script setup lang="ts">
import { Archive, Database, MoreHorizontal, TriangleAlert } from 'lucide-vue-next'
import AppIconButton from '../../shared/ui/AppIconButton.vue'
import AppMenu, { type AppMenuItem } from '../../shared/ui/AppMenu.vue'
import type { LocalBundleRecord } from '../bundle/types'

const props = defineProps<{
  records: LocalBundleRecord[]
  activeLocalBundleId?: string
}>()

const emit = defineEmits<{
  delete: [localBundleId: string]
  export: [localBundleId: string]
  open: [localBundleId: string]
  openDemo: []
}>()

const menuItems: AppMenuItem[] = [
  { value: 'export', label: '导出 Bundle' },
  { value: 'delete', label: '删除本地缓存', destructive: true },
]

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function menuSelect(value: string, localBundleId: string) {
  if (value === 'export') {
    emit('export', localBundleId)
  }
  if (value === 'delete') {
    emit('delete', localBundleId)
  }
}
</script>

<template>
  <section class="bundle-list" aria-label="本地 Bundle 列表">
    <button class="bundle-list__demo" type="button" @click="emit('openDemo')">
      <span class="bundle-list__icon"><Archive :size="16" aria-hidden="true" /></span>
      <span>
        <strong>演示设计稿</strong>
        <small>仅当前会话 · 不写入缓存</small>
      </span>
    </button>

    <div v-if="records.length" class="bundle-list__heading">
      <span>本地缓存</span>
      <span class="fc-mono">{{ records.length }}</span>
    </div>

    <article
      v-for="record in records"
      :key="record.localBundleId"
      class="bundle-list__item"
      :class="{ 'is-active': activeLocalBundleId === record.localBundleId }"
    >
      <button class="bundle-list__open" type="button" @click="emit('open', record.localBundleId)">
        <span class="bundle-list__icon"><Database :size="16" aria-hidden="true" /></span>
        <span class="bundle-list__copy">
          <strong>{{ record.archiveName }}</strong>
          <small>{{ record.canvasWidth }} x {{ record.canvasHeight }} px · {{ formatBytes(record.storageBytes) }}</small>
          <small>{{ new Date(record.importedAt).toLocaleString() }}</small>
        </span>
        <TriangleAlert v-if="record.status === 'partial'" class="bundle-list__warning" :size="14" aria-label="部分可用" />
      </button>
      <AppMenu :items="menuItems" @select="menuSelect($event, record.localBundleId)">
        <template #trigger>
          <AppIconButton label="文件操作" title="文件操作">
            <MoreHorizontal :size="16" aria-hidden="true" />
          </AppIconButton>
        </template>
      </AppMenu>
    </article>

    <div v-if="!records.length" class="bundle-list__empty">
      <Database :size="18" :stroke-width="1.6" aria-hidden="true" />
      <span>尚无本地 Bundle</span>
    </div>
  </section>
</template>

<style scoped>
.bundle-list {
  min-height: 100%;
  padding: var(--fc-space-2) 0;
}

.bundle-list__demo,
.bundle-list__item {
  display: flex;
  width: 100%;
  min-width: 0;
  padding: var(--fc-space-2) var(--fc-space-2);
  align-items: center;
  gap: var(--fc-space-2);
  color: var(--fc-text-secondary);
  text-align: left;
  background: transparent;
  border: 0;
}

.bundle-list__demo {
  cursor: pointer;
}

.bundle-list__demo:hover,
.bundle-list__item:hover {
  background: var(--fc-surface-hover);
}

.bundle-list__heading {
  display: flex;
  padding: var(--fc-space-4) var(--fc-space-3) var(--fc-space-2);
  justify-content: space-between;
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
  font-weight: 600;
}

.bundle-list__item {
  padding-right: var(--fc-space-1);
  border-left: 2px solid transparent;
}

.bundle-list__item.is-active {
  background: var(--fc-selected-subtle);
  border-left-color: var(--fc-selected);
}

.bundle-list__open {
  display: flex;
  min-width: 0;
  flex: 1;
  padding: 0;
  align-items: center;
  gap: var(--fc-space-2);
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.bundle-list__icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--fc-selected);
  background: var(--fc-selected-subtle);
  border-radius: var(--fc-radius-compact);
}

.bundle-list__copy {
  display: grid;
  min-width: 0;
}

.bundle-list__copy strong,
.bundle-list__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bundle-list__copy strong {
  color: var(--fc-text);
  font-size: 12px;
  font-weight: 600;
}

.bundle-list__copy small {
  margin-top: 2px;
  color: var(--fc-text-muted);
  font-size: var(--fc-font-micro);
}

.bundle-list__warning {
  flex: 0 0 auto;
  color: var(--fc-warning);
}

.bundle-list__empty {
  display: grid;
  min-height: 130px;
  padding: var(--fc-space-4);
  place-content: center;
  justify-items: center;
  gap: var(--fc-space-2);
  color: var(--fc-text-muted);
  font-size: 12px;
  text-align: center;
}
</style>
