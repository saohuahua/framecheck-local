import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WorkspaceToolbar from '../../src/features/viewer/WorkspaceToolbar.vue'
import type { ViewerBundleSession } from '../../src/features/workspace/bundle-session'

/** 工具栏「Vue」按钮的可用性与事件（写入目标项目 = 桌面端 + 本地 Bundle） */
function createSession(kind: 'demo' | 'local'): ViewerBundleSession {
  return {
    kind,
    ...(kind === 'local' ? { localBundleId: 'bundle-1' } : {}),
    archiveName: 'demo.psd-bundle.zip',
    sourceName: 'demo.psd',
    status: kind === 'demo' ? 'demo' : 'ready',
    canvas: { width: 750, height: 1592 },
    referenceUrl: '',
    layers: [],
    assets: [],
    diagnostics: [],
  }
}

function mountToolbar(session: ViewerBundleSession | null, canExportVue: boolean) {
  return mount(WorkspaceToolbar, {
    props: { session, canExportVue },
  })
}

describe('WorkspaceToolbar Vue 导出按钮', () => {
  it('演示设计稿下禁用', () => {
    const wrapper = mountToolbar(createSession('demo'), true)
    expect((wrapper.get('[data-testid="export-vue"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('浏览器端（canExportVue=false）禁用', () => {
    const wrapper = mountToolbar(createSession('local'), false)
    expect((wrapper.get('[data-testid="export-vue"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('桌面端打开本地 Bundle 时可用并触发 exportVue', async () => {
    const wrapper = mountToolbar(createSession('local'), true)
    const button = wrapper.get('[data-testid="export-vue"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)

    await button.trigger('click')
    expect(wrapper.emitted('exportVue')).toHaveLength(1)
  })
})
