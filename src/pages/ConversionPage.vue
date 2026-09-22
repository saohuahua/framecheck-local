<script setup lang="ts">
import { ref } from 'vue'
import { Monitor } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { getDesktopComposition } from '../app/desktop-composition'
import { BundleError } from '../features/bundle/types'
import ConversionWorkspace from '../features/conversion/ConversionWorkspace.vue'
import type { GeneratedBundleImportState } from '../features/conversion/conversion-types'
import { useBundleStore } from '../features/workspace/bundle-store'
import AppCommandButton from '../shared/ui/AppCommandButton.vue'

const router = useRouter()
const bundleStore = useBundleStore()
const desktop = getDesktopComposition()
const generatedBundleImportState = ref<GeneratedBundleImportState | undefined>()

async function openGeneratedBundle(jobId: string) {
  generatedBundleImportState.value = { jobId, status: 'opening' }

  try {
    await bundleStore.initialize()
    await bundleStore.importGenerated(jobId)
    generatedBundleImportState.value = { jobId, status: 'opened' }
    await router.push('/')
  } catch (error) {
    if (error instanceof BundleError) {
      generatedBundleImportState.value = {
        jobId,
        status: 'failed',
        code: error.code,
        message: error.message,
      }
      return
    }

    generatedBundleImportState.value = {
      jobId,
      status: 'failed',
      message: '生成的 Bundle 无法导入，请确认任务仍可读取后重试',
    }
  }
}
</script>

<template>
  <div class="conversion-page">
    <header class="conversion-page__toolbar">
      <button class="conversion-page__brand" type="button" @click="router.push('/')">Framecheck Local</button>
      <span class="conversion-page__environment">{{ desktop.isDesktop ? '桌面转换' : '浏览器演示' }}</span>
      <span class="conversion-page__spacer" />
      <AppCommandButton @click="router.push('/')">
        <template #icon><Monitor :size="15" :stroke-width="1.8" aria-hidden="true" /></template>
        看稿
      </AppCommandButton>
    </header>
    <ConversionWorkspace
      :job-module="desktop.jobModule"
      :path-chooser="desktop.pathChooser"
      :output-directory-opener="desktop.outputDirectoryOpener"
      :generated-bundle-import-state="generatedBundleImportState"
      :can-start="desktop.isDesktop"
      @generated-bundle="openGeneratedBundle"
    />
  </div>
</template>

<style scoped>
.conversion-page {
  display: grid;
  height: 100dvh;
  min-height: 640px;
  grid-template-rows: var(--fc-header-height) minmax(0, 1fr);
  overflow: hidden;
  background: var(--fc-surface-root);
}

.conversion-page__toolbar {
  display: flex;
  min-width: 0;
  padding: 0 var(--fc-space-3);
  align-items: center;
  gap: var(--fc-space-2);
  border-bottom: 1px solid var(--fc-border);
}

.conversion-page__brand {
  padding: 0;
  color: var(--fc-text);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.conversion-page__environment {
  height: 22px;
  padding: 0 6px;
  align-content: center;
  color: var(--fc-text-secondary);
  font-size: var(--fc-font-caption);
  white-space: nowrap;
  background: var(--fc-surface-subtle);
  border-radius: var(--fc-radius-compact);
}

.conversion-page__spacer {
  flex: 1;
}
</style>
