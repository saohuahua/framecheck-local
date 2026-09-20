<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    disabled?: boolean
    pressed?: boolean
  }>(),
  {
    disabled: false,
    pressed: undefined,
  },
)

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    class="fc-icon-button"
    type="button"
    :aria-label="label"
    :aria-pressed="pressed"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.fc-icon-button {
  display: inline-grid;
  width: var(--fc-icon-button-size);
  height: var(--fc-icon-button-size);
  padding: 0;
  place-items: center;
  color: var(--fc-text-secondary);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--fc-radius-compact);
  transition: background var(--fc-transition-fast), color var(--fc-transition-fast);
}

.fc-icon-button:hover:not(:disabled),
.fc-icon-button[aria-pressed='true'] {
  color: var(--fc-text);
  background: var(--fc-surface-hover);
}

.fc-icon-button:disabled {
  color: var(--fc-text-muted);
  cursor: not-allowed;
  opacity: 0.54;
}
</style>
