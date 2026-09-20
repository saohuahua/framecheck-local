<script setup lang="ts">
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
</script>

<template>
  <ScrollAreaRoot class="fc-scroll-area" type="auto">
    <ScrollAreaViewport class="fc-scroll-area__viewport">
      <slot />
    </ScrollAreaViewport>
    <ScrollAreaScrollbar class="fc-scroll-area__scrollbar" orientation="vertical">
      <ScrollAreaThumb class="fc-scroll-area__thumb" />
    </ScrollAreaScrollbar>
  </ScrollAreaRoot>
</template>

<style scoped>
.fc-scroll-area {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.fc-scroll-area :deep(.fc-scroll-area__viewport) {
  position: absolute;
  inset: 0;
}

.fc-scroll-area :deep(.fc-scroll-area__scrollbar) {
  display: flex;
  width: 8px;
  padding: 2px;
  user-select: none;
  touch-action: none;
}

.fc-scroll-area :deep(.fc-scroll-area__thumb) {
  flex: 1;
  background: var(--fc-border-strong);
  border-radius: var(--fc-radius-control);
}
</style>
