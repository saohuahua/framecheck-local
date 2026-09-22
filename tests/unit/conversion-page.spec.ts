import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BundleError } from '../../src/features/bundle/types'

const dependencies = vi.hoisted(() => ({
  importGenerated: vi.fn(),
  initialize: vi.fn(),
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: dependencies.push }),
}))

vi.mock('../../src/app/desktop-composition', () => ({
  getDesktopComposition: () => ({
    isDesktop: true,
    jobModule: {},
    generatedBundleReader: {},
  }),
}))

vi.mock('../../src/features/workspace/bundle-store', () => ({
  useBundleStore: () => ({
    importGenerated: dependencies.importGenerated,
    initialize: dependencies.initialize,
  }),
}))

import ConversionPage from '../../src/pages/ConversionPage.vue'

function mountPage() {
  return mount(ConversionPage, {
    global: {
      stubs: {
        ConversionWorkspace: {
          props: ['generatedBundleImportState', 'jobModule'],
          emits: ['generatedBundle'],
          template: '<button data-testid="open-generated" @click="$emit(\'generatedBundle\', \'job-1\')">{{ generatedBundleImportState && generatedBundleImportState.status }}</button>',
        },
      },
    },
  })
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('ConversionPage', () => {
  afterEach(() => {
    dependencies.importGenerated.mockReset()
    dependencies.initialize.mockReset()
    dependencies.push.mockReset()
  })

  it('自动导入已登记的生成 Bundle 并切换到看稿', async () => {
    dependencies.initialize.mockResolvedValue(undefined)
    dependencies.importGenerated.mockResolvedValue({})
    const wrapper = mountPage()

    await wrapper.get('[data-testid="open-generated"]').trigger('click')
    await settle()

    expect(dependencies.initialize).toHaveBeenCalledOnce()
    expect(dependencies.importGenerated).toHaveBeenCalledWith('job-1')
    expect(dependencies.push).toHaveBeenCalledWith('/')
  })

  it('导入失败时把状态回写给转换工作区而不改写转换成功', async () => {
    dependencies.initialize.mockResolvedValue(undefined)
    dependencies.importGenerated.mockRejectedValue(new BundleError('invalid-archive', 'Bundle 校验失败'))
    const wrapper = mountPage()

    await wrapper.get('[data-testid="open-generated"]').trigger('click')
    await settle()

    expect(wrapper.get('[data-testid="open-generated"]').text()).toBe('failed')
    expect(dependencies.push).not.toHaveBeenCalled()
  })
})
