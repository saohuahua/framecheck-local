<script setup lang="ts">
import { ref } from 'vue'
import { Search, X } from 'lucide-vue-next'

const modelValue = defineModel<string>({ default: '' })
const input = ref<HTMLInputElement | null>(null)

withDefaults(
  defineProps<{
    placeholder: string
    label: string
  }>(),
  {
    label: '输入框',
  },
)

function focus() {
  input.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <label class="fc-text-field">
    <span class="fc-sr-only">{{ label }}</span>
    <Search :size="14" :stroke-width="1.8" aria-hidden="true" />
    <input ref="input" v-model="modelValue" :placeholder="placeholder" :aria-label="label" />
    <button v-if="modelValue" type="button" aria-label="清除输入" @click="modelValue = ''">
      <X :size="13" :stroke-width="1.8" aria-hidden="true" />
    </button>
  </label>
</template>

<style scoped>
.fc-text-field {
  display: flex;
  width: 100%;
  height: var(--fc-control-height);
  padding: 0 6px;
  align-items: center;
  gap: 6px;
  color: var(--fc-text-muted);
  background: var(--fc-surface-root);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-control);
  transition: border-color var(--fc-transition-fast), box-shadow var(--fc-transition-fast);
}

.fc-text-field:focus-within {
  border-color: var(--fc-selected);
  box-shadow: var(--fc-focus-ring);
}

.fc-text-field input {
  width: 100%;
  min-width: 0;
  padding: 0;
  color: var(--fc-text);
  font-size: 12px;
  background: transparent;
  border: 0;
  outline: none;
}

.fc-text-field input::placeholder {
  color: var(--fc-text-muted);
}

.fc-text-field button {
  display: grid;
  width: 18px;
  height: 18px;
  padding: 0;
  place-items: center;
  color: var(--fc-text-muted);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--fc-radius-compact);
}

.fc-text-field button:hover {
  color: var(--fc-text);
  background: var(--fc-surface-hover);
}
</style>
