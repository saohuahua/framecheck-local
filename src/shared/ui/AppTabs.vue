<script setup lang="ts">
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

export interface AppTab {
  value: string
  label: string
  count?: number
  disabled?: boolean
}

defineProps<{
  modelValue: string
  items: AppTab[]
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function updateValue(value: string | number) {
  emit('update:modelValue', String(value))
}
</script>

<template>
  <TabsRoot :model-value="modelValue" @update:model-value="updateValue">
    <TabsList class="fc-tabs" :aria-label="label">
      <TabsTrigger
        v-for="item in items"
        :key="item.value"
        class="fc-tab"
        :value="item.value"
        :disabled="item.disabled"
      >
        <span>{{ item.label }}</span>
        <span v-if="item.count !== undefined" class="fc-tab__count">{{ item.count }}</span>
      </TabsTrigger>
    </TabsList>
  </TabsRoot>
</template>

<style scoped>
.fc-tabs {
  display: flex;
  min-width: 0;
  height: var(--fc-tab-height);
  align-items: stretch;
  border-bottom: 1px solid var(--fc-border);
}

.fc-tab {
  position: relative;
  display: inline-flex;
  min-width: 0;
  height: var(--fc-tab-height);
  padding: 0 var(--fc-space-3);
  align-items: center;
  gap: 6px;
  color: var(--fc-text-secondary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.fc-tab:hover:not(:disabled) {
  color: var(--fc-text);
  background: var(--fc-surface-subtle);
}

.fc-tab[data-state='active'] {
  color: var(--fc-text);
  font-weight: 600;
}

.fc-tab[data-state='active']::after {
  position: absolute;
  right: var(--fc-space-2);
  bottom: -1px;
  left: var(--fc-space-2);
  height: 2px;
  content: '';
  background: var(--fc-selected);
}

.fc-tab:disabled {
  color: var(--fc-text-muted);
  cursor: not-allowed;
}

.fc-tab__count {
  color: var(--fc-text-muted);
  font-family: var(--fc-mono-font);
  font-size: var(--fc-font-caption);
  font-variant-numeric: tabular-nums;
}
</style>
