<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FolderOpen, HardDrive } from 'lucide-vue-next'
import AppCommandButton from '../../shared/ui/AppCommandButton.vue'
import AppDialog from '../../shared/ui/AppDialog.vue'
import AppPanelResize from '../../shared/ui/AppPanelResize.vue'
import AppScrollArea from '../../shared/ui/AppScrollArea.vue'
import AppTabs, { type AppTab } from '../../shared/ui/AppTabs.vue'
import BundleImportDialog from '../importer/BundleImportDialog.vue'
import { bundleRepository } from '../bundle/bundle-repository'
import type { VueExportBundleAccess, VueExportPort } from '../codegen/vue-export-port'
import VueExportDialog from '../codegen/VueExportDialog.vue'
import type { LocalBundleRecord } from '../bundle/types'
import BundleList from '../workspace/BundleList.vue'
import { activeViewerSession } from '../workspace/bundle-session'
import { useBundleStore } from '../workspace/bundle-store'
import CanvasStage from './CanvasStage.vue'
import DevelopmentElementList from './DevelopmentElementList.vue'
import { getDevelopmentDiagnostics } from './diagnostics'
import InspectorPanel from './InspectorPanel.vue'
import LayerTree from './LayerTree.vue'
import WorkspaceToolbar from './WorkspaceToolbar.vue'
import { useViewerStore } from './viewer-store'

type DialogKind = 'keyboard' | 'local-data' | null

const props = defineProps<{
  /** Vue 静态页导出能力（桌面端注入；浏览器端按钮置灰） */
  vueExportPort?: VueExportPort
}>()

const emit = defineEmits<{
  openConversion: []
}>()

const viewer = useViewerStore()
const bundleStore = useBundleStore()
const leftWidth = ref(264)
const rightWidth = ref(344)
const dialog = ref<DialogKind>(null)
const importOpen = ref(false)
const vueExportOpen = ref(false)
const deleteTarget = ref<LocalBundleRecord | null>(null)
const developmentList = ref<{ focusSearch: () => void } | null>(null)
const session = computed(() => activeViewerSession.value)
const developmentDiagnostics = computed(() => getDevelopmentDiagnostics(session.value?.diagnostics ?? []))
let preferenceTimer: number | undefined

const leftTabs = computed<AppTab[]>(() => [
  { value: 'files', label: '文件', count: bundleStore.records.length },
  { value: 'development', label: '开发', disabled: !viewer.isOpen },
  { value: 'layers', label: '图层', disabled: !viewer.isOpen },
])
const activeDialog = computed(() => {
  const details = {
    keyboard: {
      title: '快捷键',
      description: 'V 选择  M 测量  B 全部边界  Shift+R 标尺  G 网格  Shift+1 适配  1 原始比例  加减号缩放',
    },
    'local-data': {
      title: '本地数据',
      description: 'Bundle、预览、资源和 JSON 只保存在当前浏览器的本地存储中，不会发送到网络。浏览器空间不足时可在文件列表删除缓存',
    },
  }

  return dialog.value ? details[dialog.value] : undefined
})

function formatBytes(bytes: number | undefined) {
  if (!bytes) {
    return '未写入缓存'
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function focusLayerSearch() {
  if (!viewer.isOpen) {
    return
  }

  viewer.leftTab = 'development'
  void nextTick(() => developmentList.value?.focusSearch())
}

function openDemo() {
  viewer.openDemo()
}

function closeViewer() {
  viewer.closeViewer()
}

async function openBundle(localBundleId: string) {
  try {
    await bundleStore.open(localBundleId)
  } catch {
    dialog.value = 'local-data'
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) {
    return
  }
  const localBundleId = deleteTarget.value.localBundleId
  deleteTarget.value = null
  await bundleStore.remove(localBundleId)
}

async function exportCurrent() {
  const localBundleId = session.value?.localBundleId
  if (localBundleId) {
    await bundleStore.exportBundle(localBundleId)
  }
}

/**
 * Vue 导出对话框的数据访问：从当前打开的本地 Bundle 读取设计事实与切图字节。
 * 对话框通过 props 注入这份实现，测试时可替换为内存假实现。
 */
const vueExportAccess: VueExportBundleAccess = {
  async loadFacts() {
    const localBundleId = session.value?.localBundleId
    if (!localBundleId) {
      throw new Error('当前没有打开本地 Bundle，请先导入再导出 Vue 页面')
    }
    const opened = await bundleRepository.open(localBundleId)
    return { design: opened.validated.design, assets: opened.validated.assets }
  },
  async readAssetBytes(sourcePath) {
    const localBundleId = session.value?.localBundleId
    if (!localBundleId) {
      return undefined
    }
    try {
      const file = await bundleRepository.readArtifact(localBundleId, sourcePath)
      return new Uint8Array(await file.arrayBuffer())
    } catch {
      return undefined
    }
  },
}

function setDialogOpen(open: boolean) {
  if (!open) {
    dialog.value = null
  }
}

function schedulePreferenceSave() {
  if (!session.value?.localBundleId) {
    return
  }
  if (preferenceTimer) {
    window.clearTimeout(preferenceTimer)
  }
  preferenceTimer = window.setTimeout(() => {
    void bundleStore.persistPreferences(viewer.preferences())
  }, 180)
}

watch(
  [
    () => viewer.leftTab,
    () => viewer.rightTab,
    () => viewer.scale,
    () => viewer.selectedLayerId,
    () => session.value?.localBundleId,
  ],
  schedulePreferenceSave,
)

onMounted(() => {
  void bundleStore.initialize()
})

onBeforeUnmount(() => {
  if (preferenceTimer) {
    window.clearTimeout(preferenceTimer)
  }
})
</script>

<template>
  <div class="viewer-shell">
    <WorkspaceToolbar
      :session="session"
      :can-export-vue="Boolean(props.vueExportPort)"
      @close-viewer="closeViewer"
      @export-current="exportCurrent"
      @export-vue="vueExportOpen = true"
      @focus-search="focusLayerSearch"
      @open-demo="openDemo"
      @open-conversion="emit('openConversion')"
      @open-import="importOpen = true"
      @show-keyboard="dialog = 'keyboard'"
      @show-local-data="dialog = 'local-data'"
    />

    <main
      v-if="viewer.isOpen"
      class="viewer-shell__workbench"
      :style="{
        '--fc-left-width': `${leftWidth}px`,
        '--fc-right-width': `${rightWidth}px`,
      }"
    >
      <aside class="viewer-shell__left" aria-label="本地文件与图层">
        <AppTabs v-model="viewer.leftTab" label="左侧工作区标签" :items="leftTabs" />
        <AppScrollArea v-if="viewer.leftTab === 'files'" class="viewer-shell__file-scroll">
          <BundleList
            :records="bundleStore.records"
            :active-local-bundle-id="bundleStore.activeLocalBundleId"
            @delete="deleteTarget = bundleStore.records.find((record) => record.localBundleId === $event) ?? null"
            @export="bundleStore.exportBundle($event)"
            @open="openBundle"
            @open-demo="openDemo"
          />
        </AppScrollArea>
        <DevelopmentElementList v-else-if="viewer.leftTab === 'development'" ref="developmentList" />
        <LayerTree v-else />
      </aside>

      <AppPanelResize v-model="leftWidth" :min="220" :max="320" side="left" label="调整左侧栏宽度" />
      <CanvasStage />
      <AppPanelResize v-model="rightWidth" :min="300" :max="420" side="right" label="调整右侧检查面板宽度" />
      <InspectorPanel class="viewer-shell__right" />
    </main>

    <section v-else class="viewer-shell__empty" aria-label="本地文件空状态">
      <div class="viewer-shell__empty-content">
        <span class="viewer-shell__empty-icon"><HardDrive :size="24" :stroke-width="1.6" aria-hidden="true" /></span>
        <h1>还没有打开设计稿</h1>
        <p>导入的 Bundle 仅保存于当前浏览器，不会上传到网络。</p>
        <div class="viewer-shell__empty-actions">
          <AppCommandButton variant="primary" @click="importOpen = true">
            <template #icon><FolderOpen :size="15" aria-hidden="true" /></template>
            导入 Bundle
          </AppCommandButton>
          <AppCommandButton @click="openDemo">打开演示设计稿</AppCommandButton>
        </div>
      </div>
    </section>

    <footer class="viewer-shell__statusbar">
      <template v-if="session">
        <span>{{ session.status === 'demo' ? '演示设计稿' : session.status }}</span>
        <span class="viewer-shell__status-divider" />
        <span class="fc-mono">{{ Math.round(viewer.scale * 100) }}%</span>
        <span class="viewer-shell__status-divider" />
        <span class="fc-mono">{{ viewer.boundsMode }} bounds</span>
        <span class="viewer-shell__status-spacer" />
        <span>{{ formatBytes(session.storageBytes) }}</span>
        <template v-if="developmentDiagnostics.length">
          <span class="viewer-shell__status-divider" />
          <span>{{ developmentDiagnostics.length }} 项开发提示</span>
        </template>
      </template>
      <template v-else>
        <span>本地文件列表</span>
        <span class="viewer-shell__status-spacer" />
        <span>{{ bundleStore.records.length }} 个已缓存 Bundle</span>
      </template>
    </footer>

    <BundleImportDialog v-model:open="importOpen" />

    <VueExportDialog
      v-model:open="vueExportOpen"
      :port="props.vueExportPort"
      :access="vueExportAccess"
      :reference-url="session?.referenceUrl"
      :source-name="session?.sourceName"
    />

    <AppDialog
      v-if="activeDialog"
      :open="Boolean(activeDialog)"
      :title="activeDialog.title"
      :description="activeDialog.description"
      confirm-label="知道了"
      @update:open="setDialogOpen"
    />

    <AppDialog
      v-if="deleteTarget"
      :open="Boolean(deleteTarget)"
      title="删除本地 Bundle"
      :description="`将删除 ${deleteTarget.archiveName} 的本地工件和索引，此操作无法撤销`"
      confirm-label="删除"
      destructive
      @confirm="confirmDelete"
      @update:open="deleteTarget = null"
    />
  </div>
</template>

<style scoped>
.viewer-shell {
  display: grid;
  height: 100dvh;
  min-height: 640px;
  grid-template-rows: var(--fc-header-height) minmax(0, 1fr) var(--fc-status-height);
  overflow: hidden;
  background: var(--fc-surface-root);
}

.viewer-shell__workbench {
  position: relative;
  display: grid;
  min-width: 1280px;
  min-height: 0;
  grid-template-columns: var(--fc-left-width) 5px minmax(0, 1fr) 5px var(--fc-right-width);
}

.viewer-shell__left,
.viewer-shell__right {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--fc-surface-root);
}

.viewer-shell__left {
  display: grid;
  grid-template-rows: var(--fc-tab-height) minmax(0, 1fr);
}

.viewer-shell__file-scroll {
  min-height: 0;
}

.viewer-shell__empty {
  display: grid;
  padding: var(--fc-space-6);
  place-items: center;
  background: var(--fc-canvas);
}

.viewer-shell__empty-content {
  width: min(360px, 100%);
  text-align: center;
}

.viewer-shell__empty-icon {
  display: inline-grid;
  width: 48px;
  height: 48px;
  margin-bottom: var(--fc-space-4);
  place-items: center;
  color: var(--fc-text-secondary);
  background: var(--fc-surface-root);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-control);
}

.viewer-shell__empty h1 {
  margin: 0;
  font-size: var(--fc-font-empty-title);
  font-weight: 600;
  line-height: 24px;
}

.viewer-shell__empty p {
  margin: var(--fc-space-2) 0 0;
  color: var(--fc-text-secondary);
  font-size: 13px;
  line-height: 20px;
}

.viewer-shell__empty-actions {
  display: flex;
  margin-top: var(--fc-space-4);
  justify-content: center;
  gap: var(--fc-space-2);
}

.viewer-shell__statusbar {
  display: flex;
  min-width: 0;
  height: var(--fc-status-height);
  padding: 0 var(--fc-space-3);
  align-items: center;
  gap: var(--fc-space-2);
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
  background: var(--fc-surface-root);
  border-top: 1px solid var(--fc-border);
}

.viewer-shell__status-divider {
  width: 1px;
  height: 12px;
  background: var(--fc-border);
}

.viewer-shell__status-spacer {
  flex: 1;
}

@media (max-width: 1279px) {
  .viewer-shell__workbench {
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  .viewer-shell__left,
  .viewer-shell__right,
  .viewer-shell__workbench > :deep(.fc-panel-resize) {
    display: none;
  }
}
</style>
