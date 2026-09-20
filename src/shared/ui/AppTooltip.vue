<script setup lang="ts">
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui'

withDefaults(
  defineProps<{
    label: string
    side?: 'top' | 'right' | 'bottom' | 'left'
  }>(),
  {
    side: 'bottom',
  },
)
</script>

<template>
  <TooltipProvider :delay-duration="250">
    <TooltipRoot :delay-duration="250">
      <TooltipTrigger as-child>
        <slot name="trigger" />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent class="fc-tooltip" :side="side" :side-offset="6">
          {{ label }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<style>
.fc-tooltip {
  z-index: var(--fc-z-floating);
  max-width: 240px;
  padding: 4px 8px;
  color: var(--fc-surface-root);
  font-size: var(--fc-font-caption);
  line-height: 16px;
  background: var(--fc-text);
  border-radius: var(--fc-radius-compact);
  box-shadow: var(--fc-shadow-float);
}
</style>
