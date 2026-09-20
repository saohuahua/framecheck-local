<script setup lang="ts">
const props = defineProps<{
  modelValue: number
  min: number
  max: number
  side: 'left' | 'right'
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

function clamp(value: number) {
  return Math.min(props.max, Math.max(props.min, value))
}

function changeBy(delta: number) {
  emit('update:modelValue', clamp(props.modelValue + delta))
}

function startResize(event: PointerEvent) {
  const startX = event.clientX
  const startWidth = props.modelValue
  const direction = props.side === 'left' ? 1 : -1
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)

  function move(moveEvent: PointerEvent) {
    emit('update:modelValue', clamp(startWidth + (moveEvent.clientX - startX) * direction))
  }

  function end() {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
    event.preventDefault()
    changeBy(props.side === 'left' ? 8 : -8)
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
    event.preventDefault()
    changeBy(props.side === 'left' ? -8 : 8)
  }
}
</script>

<template>
  <div
    class="fc-panel-resize"
    role="separator"
    tabindex="0"
    :aria-label="label"
    aria-orientation="vertical"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="modelValue"
    @pointerdown="startResize"
    @keydown="onKeydown"
  />
</template>

<style scoped>
.fc-panel-resize {
  position: relative;
  width: 5px;
  cursor: col-resize;
  background: var(--fc-border);
  transition: background var(--fc-transition-fast);
}

.fc-panel-resize:hover,
.fc-panel-resize:focus-visible {
  background: var(--fc-border-strong);
}
</style>
