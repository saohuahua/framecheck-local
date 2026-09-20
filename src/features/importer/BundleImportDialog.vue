<script setup lang="ts">
import { computed, ref } from 'vue'
import { FileArchive, LoaderCircle, ShieldCheck, X } from 'lucide-vue-next'
import AppCommandButton from '../../shared/ui/AppCommandButton.vue'
import AppDialog from '../../shared/ui/AppDialog.vue'
import { useBundleStore } from '../workspace/bundle-store'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const bundleStore = useBundleStore()
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const isImporting = computed(() => bundleStore.importProgress.status === 'importing')
const progressPercent = computed(() => {
  const { completed, total } = bundleStore.importProgress
  if (!total) {
    return 0
  }
  return Math.round((completed ?? 0) / total * 100)
})
const dialogTitle = computed(() => {
  if (isImporting.value) {
    return '正在导入本地 Bundle'
  }
  if (bundleStore.importProgress.status === 'cache-hit') {
    return '已从本地缓存打开'
  }
  if (bundleStore.importProgress.status === 'storage-full') {
    return '本地空间不足'
  }
  if (bundleStore.importProgress.status === 'failed') {
    return 'Bundle 导入失败'
  }
  if (bundleStore.importProgress.status === 'cancelled') {
    return '导入已取消'
  }
  if (bundleStore.importProgress.status === 'ready' || bundleStore.importProgress.status === 'partial') {
    return bundleStore.importProgress.status === 'partial' ? '已导入部分可用 Bundle' : '已导入本地 Bundle'
  }
  return '导入 .psd-bundle.zip'
})

function requestFile() {
  fileInput.value?.click()
}

async function acceptFile(file: File | undefined) {
  if (!file || isImporting.value) {
    return
  }

  bundleStore.clearImportProgress()
  try {
    await bundleStore.importFile(file)
  } catch {
    return
  }
}

async function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  await acceptFile(input.files?.[0])
  input.value = ''
}

async function onDrop(event: DragEvent) {
  isDragging.value = false
  await acceptFile(event.dataTransfer?.files[0])
}

function close() {
  if (!isImporting.value) {
    emit('update:open', false)
  }
}
</script>

<template>
  <AppDialog
    :open="props.open"
    :title="dialogTitle"
    description="文件仅在当前浏览器本地读取，不会上传"
    @update:open="close"
  >
    <template #body>
      <div class="bundle-import">
        <input
          ref="fileInput"
          class="bundle-import__input"
          type="file"
          accept=".zip,.psd-bundle.zip,application/zip"
          @change="onInput"
        />
        <button
          class="bundle-import__dropzone"
          :class="{ 'is-dragging': isDragging, 'is-busy': isImporting }"
          type="button"
          :disabled="isImporting"
          @click="requestFile"
          @dragenter.prevent="isDragging = true"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="onDrop"
        >
          <LoaderCircle v-if="isImporting" class="bundle-import__spinner" :size="22" aria-hidden="true" />
          <FileArchive v-else :size="22" :stroke-width="1.6" aria-hidden="true" />
          <span v-if="isImporting">{{ bundleStore.importProgress.message ?? '正在处理本地文件' }}</span>
          <span v-else>选择或拖入 .psd-bundle.zip</span>
          <small v-if="isImporting && bundleStore.importProgress.total">
            {{ progressPercent }}%
          </small>
          <small v-else>支持 psd_to_code.py pack 输出</small>
        </button>
        <div v-if="isImporting" class="bundle-import__progress" aria-label="导入进度">
          <span :style="{ transform: `scaleX(${progressPercent / 100})` }" />
        </div>
        <p v-if="bundleStore.importProgress.status !== 'idle'" class="bundle-import__message">
          <ShieldCheck v-if="['ready', 'partial', 'cache-hit'].includes(bundleStore.importProgress.status)" :size="14" aria-hidden="true" />
          <X v-else-if="['failed', 'storage-full', 'cancelled'].includes(bundleStore.importProgress.status)" :size="14" aria-hidden="true" />
          {{ bundleStore.importProgress.message }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="bundle-import__actions">
        <AppCommandButton v-if="isImporting" variant="danger" @click="bundleStore.cancelImport()">取消导入</AppCommandButton>
        <AppCommandButton v-else @click="close">关闭</AppCommandButton>
      </div>
    </template>
  </AppDialog>
</template>

<style scoped>
.bundle-import__input {
  display: none;
}

.bundle-import__dropzone {
  display: grid;
  width: 100%;
  min-height: 148px;
  margin-top: var(--fc-space-4);
  padding: var(--fc-space-4);
  place-content: center;
  justify-items: center;
  gap: var(--fc-space-2);
  color: var(--fc-text-secondary);
  font-size: 13px;
  cursor: pointer;
  background: var(--fc-surface-subtle);
  border: 1px dashed var(--fc-border-strong);
  border-radius: var(--fc-radius-control);
  transition: border-color var(--fc-transition-fast), background var(--fc-transition-fast), color var(--fc-transition-fast);
}

.bundle-import__dropzone:hover:not(:disabled),
.bundle-import__dropzone.is-dragging {
  color: var(--fc-text);
  background: var(--fc-selected-subtle);
  border-color: var(--fc-selected);
}

.bundle-import__dropzone.is-busy {
  cursor: wait;
}

.bundle-import__dropzone small {
  color: var(--fc-text-muted);
  font-family: var(--fc-mono-font);
  font-size: var(--fc-font-caption);
}

.bundle-import__spinner {
  animation: bundle-import-spin 800ms linear infinite;
}

.bundle-import__progress {
  height: 3px;
  margin-top: var(--fc-space-2);
  overflow: hidden;
  background: var(--fc-border);
}

.bundle-import__progress span {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--fc-selected);
  transform-origin: left center;
  transition: transform var(--fc-transition-fast);
}

.bundle-import__message {
  display: flex;
  margin: var(--fc-space-3) 0 0;
  align-items: center;
  gap: 6px;
  color: var(--fc-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.bundle-import__actions {
  display: flex;
  margin-top: var(--fc-space-5);
  justify-content: flex-end;
}

@keyframes bundle-import-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bundle-import__spinner {
    animation: none;
  }
}
</style>
