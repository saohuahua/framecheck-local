import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppPanelResize from '../../src/shared/ui/AppPanelResize.vue'

describe('AppPanelResize', () => {
  it('使用键盘在允许范围内调整左栏宽度', async () => {
    const wrapper = mount(AppPanelResize, {
      props: {
        modelValue: 264,
        min: 220,
        max: 320,
        side: 'left',
        label: '调整左侧栏宽度',
      },
    })

    await wrapper.trigger('keydown', { key: 'ArrowRight' })

    expect(wrapper.emitted('update:modelValue')).toEqual([[272]])
  })
})
