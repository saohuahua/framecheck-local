<script setup lang="ts">
import { computed } from 'vue'
import { Download, FolderOpen, HardDrive, Keyboard, MoreHorizontal, Search, Workflow } from 'lucide-vue-next'
import AppCommandButton from '../../shared/ui/AppCommandButton.vue'
import AppIconButton from '../../shared/ui/AppIconButton.vue'
import AppMenu, { type AppMenuItem } from '../../shared/ui/AppMenu.vue'
import AppTooltip from '../../shared/ui/AppTooltip.vue'
import type { ViewerBundleSession } from '../workspace/bundle-session'

const props = defineProps<{
  session: ViewerBundleSession | null
}>()

const emit = defineEmits<{
  closeViewer: []
  exportCurrent: []
  focusSearch: []
  openDemo: []
  openConversion: []
  openImport: []
  showKeyboard: []
  showLocalData: []
}>()

const menuItems = computed<AppMenuItem[]>(() => [
  { value: 'open-demo', label: '打开演示设计稿' },
  { value: 'close-viewer', label: '关闭当前稿', disabled: !props.session },
  { value: 'local-data', label: '关于本地数据' },
])

function onMenuSelect(value: string) {
  if (value === 'open-demo') {
    emit('openDemo')
  }

  if (value === 'close-viewer') {
    emit('closeViewer')
  }

  if (value === 'local-data') {
    emit('showLocalData')
  }
}
</script>

<template>
  <header class="workspace-toolbar">
    <button class="workspace-toolbar__brand" type="button" @click="emit('closeViewer')">Framecheck Local</button>
    <span class="workspace-toolbar__local">
      <HardDrive :size="13" :stroke-width="1.8" aria-hidden="true" />
      本地处理
    </span>
    <template v-if="session">
      <span class="workspace-toolbar__divider" aria-hidden="true" />
      <span class="workspace-toolbar__file" :title="session.archiveName">{{ session.archiveName }}</span>
      <span class="workspace-toolbar__status" :class="{ 'is-ready': session.status === 'ready', 'is-partial': session.status === 'partial' }">
        {{ session.status === 'demo' ? '演示设计稿' : session.status }}
      </span>
      <span class="workspace-toolbar__canvas fc-mono">{{ session.canvas.width }} x {{ session.canvas.height }} px</span>
    </template>
    <span class="workspace-toolbar__spacer" />
    <AppCommandButton @click="emit('openConversion')">
      <template #icon><Workflow :size="14" aria-hidden="true" /></template>
      转换
    </AppCommandButton>
    <AppCommandButton variant="primary" @click="emit('openImport')">
      <template #icon><FolderOpen :size="14" aria-hidden="true" /></template>
      导入
    </AppCommandButton>
    <AppTooltip :label="session?.kind === 'local' ? '导出当前 Bundle' : '打开本地 Bundle 后可导出'">
      <template #trigger>
        <span>
          <AppCommandButton :disabled="session?.kind !== 'local'" @click="emit('exportCurrent')">
            <template #icon><Download :size="14" aria-hidden="true" /></template>
            导出
          </AppCommandButton>
        </span>
      </template>
    </AppTooltip>
    <AppTooltip label="聚焦开发元素搜索">
      <template #trigger>
        <AppIconButton label="搜索开发元素" @click="emit('focusSearch')">
          <Search :size="16" :stroke-width="1.8" aria-hidden="true" />
        </AppIconButton>
      </template>
    </AppTooltip>
    <AppTooltip label="快捷键">
      <template #trigger>
        <AppIconButton label="打开快捷键帮助" @click="emit('showKeyboard')">
          <Keyboard :size="16" :stroke-width="1.8" aria-hidden="true" />
        </AppIconButton>
      </template>
    </AppTooltip>
    <AppMenu :items="menuItems" @select="onMenuSelect">
      <template #trigger>
        <AppIconButton label="更多操作">
          <MoreHorizontal :size="17" :stroke-width="1.8" aria-hidden="true" />
        </AppIconButton>
      </template>
    </AppMenu>
  </header>
</template>

<style scoped>
.workspace-toolbar {
  display: flex;
  min-width: 0;
  height: var(--fc-header-height);
  padding: 0 var(--fc-space-3);
  align-items: center;
  gap: var(--fc-space-2);
  background: var(--fc-surface-root);
  border-bottom: 1px solid var(--fc-border);
}

.workspace-toolbar__brand {
  padding: 0;
  color: var(--fc-text);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.workspace-toolbar__local,
.workspace-toolbar__status,
.workspace-toolbar__canvas {
  display: inline-flex;
  height: 22px;
  padding: 0 6px;
  align-items: center;
  gap: 4px;
  color: var(--fc-text-secondary);
  font-size: var(--fc-font-caption);
  white-space: nowrap;
  background: var(--fc-surface-subtle);
  border-radius: var(--fc-radius-compact);
}

.workspace-toolbar__status {
  color: var(--fc-warning);
  background: color-mix(in srgb, var(--fc-warning) 8%, transparent);
}

.workspace-toolbar__status.is-ready {
  color: var(--fc-exact);
  background: color-mix(in srgb, var(--fc-exact) 8%, transparent);
}

.workspace-toolbar__status.is-partial {
  color: var(--fc-warning);
  background: color-mix(in srgb, var(--fc-warning) 8%, transparent);
}

.workspace-toolbar__canvas {
  color: var(--fc-text-muted);
  background: transparent;
}

.workspace-toolbar__divider {
  width: 1px;
  height: 18px;
  background: var(--fc-border);
}

.workspace-toolbar__file {
  max-width: min(28vw, 300px);
  overflow: hidden;
  color: var(--fc-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-toolbar__spacer {
  flex: 1;
}

@media (max-width: 960px) {
  .workspace-toolbar__local,
  .workspace-toolbar__status,
  .workspace-toolbar__canvas {
    display: none;
  }
}
</style>
