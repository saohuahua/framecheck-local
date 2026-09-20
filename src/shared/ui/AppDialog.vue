<script setup lang="ts">
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import AppCommandButton from './AppCommandButton.vue'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    description: string
    confirmLabel?: string
    destructive?: boolean
    hideDefaultActions?: boolean
  }>(),
  {
    confirmLabel: '知道了',
    destructive: false,
    hideDefaultActions: false,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

function close() {
  emit('update:open', false)
}

function confirm() {
  emit('confirm')
  close()
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fc-dialog__overlay" />
      <DialogContent class="fc-dialog" @escape-key-down="close">
        <DialogTitle class="fc-dialog__title">{{ title }}</DialogTitle>
        <DialogDescription class="fc-dialog__description">{{ description }}</DialogDescription>
        <slot name="body" />
        <slot v-if="!hideDefaultActions" name="actions">
          <div class="fc-dialog__actions">
            <AppCommandButton @click="close">取消</AppCommandButton>
            <AppCommandButton :variant="destructive ? 'danger' : 'primary'" @click="confirm">
              {{ confirmLabel }}
            </AppCommandButton>
          </div>
        </slot>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.fc-dialog__overlay {
  position: fixed;
  z-index: var(--fc-z-modal);
  inset: 0;
  background: rgb(28 28 26 / 24%);
}

.fc-dialog {
  position: fixed;
  z-index: calc(var(--fc-z-modal) + 1);
  top: 50%;
  left: 50%;
  width: min(400px, calc(100vw - 32px));
  padding: var(--fc-space-5);
  background: var(--fc-surface-root);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-control);
  box-shadow: var(--fc-shadow-float);
  transform: translate(-50%, -50%);
}

.fc-dialog__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.fc-dialog__description {
  margin: var(--fc-space-2) 0 0;
  color: var(--fc-text-secondary);
  font-size: 13px;
  line-height: 20px;
}

.fc-dialog__actions {
  display: flex;
  margin-top: var(--fc-space-5);
  justify-content: flex-end;
  gap: var(--fc-space-2);
}
</style>
