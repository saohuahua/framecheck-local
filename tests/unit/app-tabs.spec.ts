import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppTabs from '../../src/shared/ui/AppTabs.vue'

describe('AppTabs', () => {
  it('点击标签时发出新的受控值', async () => {
    const wrapper = mount(AppTabs, {
      props: {
        modelValue: 'files',
        label: '左栏标签',
        items: [
          { value: 'files', label: '文件' },
          { value: 'layers', label: '图层' },
        ],
      },
    })

    await wrapper.findAll('button')[1].trigger('mousedown', { button: 0, ctrlKey: false })

    expect(wrapper.emitted('update:modelValue')).toEqual([['layers']])
  })
})
