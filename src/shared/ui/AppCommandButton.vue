<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger'
    disabled?: boolean
  }>(),
  {
    variant: 'ghost',
    disabled: false,
  },
)

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    class="fc-command-button"
    :class="`fc-command-button--${variant}`"
    type="button"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot name="icon" />
    <span><slot /></span>
  </button>
</template>

<style scoped>
.fc-command-button {
  display: inline-flex;
  min-width: 0;
  height: var(--fc-control-height);
  padding: 0 var(--fc-space-3);
  align-items: center;
  gap: 6px;
  color: var(--fc-text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--fc-radius-control);
  transition: background var(--fc-transition-fast), border-color var(--fc-transition-fast), color var(--fc-transition-fast);
}

.fc-command-button:hover:not(:disabled) {
  color: var(--fc-text);
  background: var(--fc-surface-hover);
}

.fc-command-button--primary {
  color: var(--fc-surface-root);
  background: var(--fc-accent);
  border-color: var(--fc-accent);
}

.fc-command-button--primary:hover:not(:disabled) {
  color: var(--fc-surface-root);
  background: var(--fc-accent-hover);
  border-color: var(--fc-accent-hover);
}

.fc-command-button--danger:hover:not(:disabled) {
  color: var(--fc-error);
  background: color-mix(in srgb, var(--fc-error) 8%, transparent);
}

.fc-command-button:disabled {
  color: var(--fc-text-muted);
  cursor: not-allowed;
  opacity: 0.58;
}
</style>
