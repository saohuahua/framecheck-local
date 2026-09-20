<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'

export interface AppMenuItem {
  value: string
  label: string
  disabled?: boolean
  destructive?: boolean
}

defineProps<{
  items: AppMenuItem[]
}>()

const emit = defineEmits<{
  select: [value: string]
}>()
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="fc-menu" :side-offset="6" align="end">
        <DropdownMenuItem
          v-for="item in items"
          :key="item.value"
          class="fc-menu__item"
          :class="{ 'fc-menu__item--destructive': item.destructive }"
          :disabled="item.disabled"
          @select="emit('select', item.value)"
        >
          {{ item.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style>
.fc-menu {
  z-index: var(--fc-z-floating);
  min-width: 164px;
  padding: var(--fc-space-1);
  background: var(--fc-surface-root);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-control);
  box-shadow: var(--fc-shadow-float);
}

.fc-menu__item {
  display: flex;
  min-height: 28px;
  padding: 0 var(--fc-space-2);
  align-items: center;
  color: var(--fc-text-secondary);
  font-size: 12px;
  border-radius: var(--fc-radius-compact);
  outline: none;
  cursor: pointer;
}

.fc-menu__item[data-highlighted] {
  color: var(--fc-text);
  background: var(--fc-surface-hover);
}

.fc-menu__item--destructive[data-highlighted] {
  color: var(--fc-error);
  background: color-mix(in srgb, var(--fc-error) 8%, transparent);
}

.fc-menu__item[data-disabled] {
  color: var(--fc-text-muted);
  cursor: not-allowed;
}
</style>
