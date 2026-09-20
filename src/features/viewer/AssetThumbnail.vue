<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Image } from 'lucide-vue-next'
import { useBundleStore } from '../workspace/bundle-store'
import type { ViewerAsset } from './types'

const props = withDefaults(defineProps<{
  asset: ViewerAsset
  label: string
  variant?: 'catalog' | 'preview'
}>(), {
  variant: 'catalog',
})

const bundleStore = useBundleStore()
const previewUrl = ref<string>()
let ownedUrl: string | undefined
let requestVersion = 0

function releaseUrl() {
  if (ownedUrl) {
    URL.revokeObjectURL(ownedUrl)
    ownedUrl = undefined
  }
}

async function loadPreview(asset: ViewerAsset) {
  requestVersion += 1
  const request = requestVersion
  releaseUrl()
  previewUrl.value = undefined

  const url = await bundleStore.loadAssetPreview(asset)
  if (request !== requestVersion) {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
    return
  }

  previewUrl.value = url
  if (url?.startsWith('blob:')) {
    ownedUrl = url
  }
}

watch(() => props.asset, loadPreview, { immediate: true })

onBeforeUnmount(releaseUrl)
</script>

<template>
  <span class="asset-thumbnail" :class="`asset-thumbnail--${variant}`">
    <img v-if="previewUrl" :src="previewUrl" :alt="label" />
    <Image v-else :size="16" :stroke-width="1.6" aria-hidden="true" />
  </span>
</template>

<style scoped>
.asset-thumbnail {
  display: grid;
  place-items: center;
  color: var(--fc-text-muted);
  background-color: var(--fc-surface-subtle);
  background-image: linear-gradient(45deg, rgb(0 0 0 / 7%) 25%, transparent 25%), linear-gradient(-45deg, rgb(0 0 0 / 7%) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgb(0 0 0 / 7%) 75%), linear-gradient(-45deg, transparent 75%, rgb(0 0 0 / 7%) 75%);
  background-position: 0 0, 0 6px, 6px -6px, -6px 0;
  background-size: 12px 12px;
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-compact);
}

.asset-thumbnail--catalog {
  width: 40px;
  height: 40px;
  overflow: hidden;
}

.asset-thumbnail--preview {
  width: 100%;
  min-height: 132px;
  max-height: 296px;
  padding: 8px;
  overflow: hidden;
}

.asset-thumbnail img {
  display: block;
  width: auto;
  height: auto;
  max-width: calc(100% - 2px);
  max-height: calc(100% - 2px);
  object-fit: contain;
}

.asset-thumbnail--preview img {
  max-width: 100%;
  max-height: 280px;
}
</style>
