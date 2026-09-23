import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VueExportDialog from '../../../src/features/codegen/VueExportDialog.vue'
import { h5TemplateProfile } from '../../../src/features/codegen/profile'
import type {
  VueExportBundleAccess,
  VueExportPort,
  VueExportProjectWriter,
  VueExportWriteFile,
} from '../../../src/features/codegen/vue-export-port'
import {
  createVueExportFacts,
  templateRouterSource,
} from '../../helpers/vue-export-facts'

/**
 * 导出对话框组件测试：配置 → 预览确认 → 写入 的完整流程，
 * 以及冲突阻断、路由缺失、非模板目录提示、切图字节缺失、浏览器端不可用等分支。
 *
 * 端口与数据访问全部用内存假实现注入；reka-ui 的弹层组件打桩为透传节点，
 * 让断言可以留在组件树内完成。
 */

let objectId = 0

// jsdom 未实现 URL.createObjectURL / revokeObjectURL，预览组件依赖它们
beforeEach(() => {
  objectId = 0
  URL.createObjectURL = vi.fn(() => `blob:mock-${++objectId}`)
  URL.revokeObjectURL = vi.fn()
})

interface WriterOptions {
  /** 路由文件内容；null 表示文件不存在（默认模板路由） */
  routerSource?: string | null
  /** package.json 内容；null 表示不存在（触发非模板目录提示） */
  packageJson?: string | null
  /** 已存在的目标路径（冲突清单） */
  existingPaths?: string[]
  /** 写入前的阻塞点，用于测试写入过程中的进度展示 */
  beforeWrite?: () => Promise<void>
}

/**
 * 忠实于端口契约的内存假端口：
 * 用内存 Map 模拟目标项目文件，writeFiles 严格执行「新建不覆盖 / 追加不动既有内容」，
 * 避免测试环境与真实 Rust 行为不一致（此前正是这一差距漏掉了路由覆盖 bug）。
 */
function createFakePort(options: WriterOptions = {}) {
  const written: VueExportWriteFile[] = []
  const projectFiles = new Map<string, string>()
  if (options.routerSource !== null) {
    projectFiles.set(h5TemplateProfile.routerFilePath, options.routerSource ?? templateRouterSource)
  }
  if (options.packageJson !== null) {
    projectFiles.set('package.json', options.packageJson ?? '{"name":"h5-template"}')
  }
  for (const path of options.existingPaths ?? []) {
    projectFiles.set(path, 'existing')
  }

  const writer: VueExportProjectWriter = {
    async readTextFile(_projectRoot, path) {
      return projectFiles.get(path) ?? null
    },
    async filterExisting(_projectRoot, paths) {
      return paths.filter((path) => projectFiles.has(path))
    },
    async writeFiles(_projectRoot, files) {
      await options.beforeWrite?.()
      // 与 Rust 侧一致的预检：新建目标必须不存在
      for (const file of files) {
        if (file.appendText === undefined && projectFiles.has(file.path)) {
          throw new Error(`目标已存在，拒绝覆盖：${file.path}`)
        }
      }
      for (const file of files) {
        if (file.appendText !== undefined) {
          projectFiles.set(file.path, (projectFiles.get(file.path) ?? '') + file.appendText)
        } else {
          projectFiles.set(file.path, file.text ?? '')
        }
        written.push(file)
      }
    },
  }
  const port: VueExportPort = {
    writer,
    chooser: {
      async chooseProjectRoot() {
        return undefined
      },
    },
  }
  return { port, written, projectFiles }
}

function createFakeAccess(missingSourcePaths: string[] = []): VueExportBundleAccess {
  return {
    async loadFacts() {
      return createVueExportFacts()
    },
    async readAssetBytes(sourcePath) {
      if (missingSourcePaths.includes(sourcePath)) {
        return undefined
      }
      return new Uint8Array([1, 2, 3])
    },
  }
}

interface MountOptions {
  port?: VueExportPort
  access?: VueExportBundleAccess
  sourceName?: string
}

function mountDialog(options: MountOptions = {}): VueWrapper {
  return mount(VueExportDialog, {
    props: {
      open: true,
      port: options.port,
      access: options.access ?? createFakeAccess(),
      sourceName: options.sourceName ?? 'demo.psd',
    },
    global: {
      stubs: {
        DialogPortal: { template: '<div><slot /></div>' },
        DialogOverlay: { template: '<div />' },
        DialogContent: { template: '<div><slot /></div>' },
      },
    },
  })
}

/** 到达预览阶段：填写目标目录并点击生成 */
async function arriveAtPreview(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="vue-export-project-root"]').setValue('D:/proj')
  await wrapper.get('[data-testid="vue-export-generate"]').trigger('click')
  await flushPromises()
}

describe('VueExportDialog 导出对话框', () => {
  it('配置阶段建议默认页面名，并校验必填项', async () => {
    const { port } = createFakePort()
    const wrapper = mountDialog({ port })

    // 默认页面名来自设计稿文件名（去扩展名 slug 化）
    expect((wrapper.get('[data-testid="vue-export-page-name"]').element as HTMLInputElement).value).toBe('demo')
    expect(wrapper.text()).toContain('生成 src/views/demo/index.vue，路由 /demo')

    // 目标目录为空时不能生成
    expect((wrapper.get('[data-testid="vue-export-generate"]').element as HTMLButtonElement).disabled).toBe(true)
    await wrapper.get('[data-testid="vue-export-project-root"]').setValue('D:/proj')
    expect((wrapper.get('[data-testid="vue-export-generate"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('生成预览：展示统计、路由说明与预览画布', async () => {
    const { port } = createFakePort()
    const wrapper = mountDialog({ port })
    await arriveAtPreview(wrapper)

    expect(wrapper.text()).toContain('4 张切图')
    expect(wrapper.text()).toContain('1 段文字')
    expect(wrapper.text()).toContain('1 个可点击占位')
    expect(wrapper.text()).toContain('2 个未还原图层')
    expect(wrapper.get('[data-testid="vue-export-router-note"]').text()).toContain('追加路由 /demo')
    expect(wrapper.find('[data-testid="vue-export-preview"]').exists()).toBe(true)
    // 无冲突时可写入
    expect((wrapper.get('[data-testid="vue-export-write"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('写入：页面新建 + 路由末尾追加 + 切图（base64）一次性落盘', async () => {
    const { port, written, projectFiles } = createFakePort()
    const wrapper = mountDialog({ port })
    await arriveAtPreview(wrapper)

    await wrapper.get('[data-testid="vue-export-write"]').trigger('click')
    await flushPromises()

    // 写入结果阶段展示文件清单
    expect(wrapper.text()).toContain('已写入 D:/proj')
    expect(wrapper.text()).toContain('src/views/demo/index.vue')

    expect(written.map((file) => file.path)).toEqual([
      'src/views/demo/index.vue',
      'src/router/index.ts',
      'public/static/images/Hero.png',
      'public/static/images/CTA_Btn.png',
      'public/static/images/Badge.png',
    ])
    // 路由走追加模式（不覆盖既有内容），页面与切图走新建模式
    const routerFile = written.find((file) => file.path === 'src/router/index.ts')
    expect(routerFile?.text).toBeUndefined()
    expect(routerFile?.appendText).toContain('router.addRoute({')
    // 内存项目里：既有路由原样保留，追加块接在末尾
    const patchedRouter = projectFiles.get('src/router/index.ts')!
    expect(patchedRouter.startsWith(templateRouterSource)).toBe(true)
    expect(patchedRouter).toContain('path: "/demo"')
    // 切图字节 [1,2,3] 的 base64
    for (const image of written.filter((file) => file.path.startsWith('public/'))) {
      expect(image.base64).toBe('AQID')
    }
  })

  it('预览后路由文件被外部修改，写入仍安全追加（既有内容原样保留）', async () => {
    const { port, projectFiles } = createFakePort()
    const wrapper = mountDialog({ port })
    await arriveAtPreview(wrapper)

    // 模拟预览到写入之间路由文件被人工修改
    projectFiles.set(h5TemplateProfile.routerFilePath, `${templateRouterSource}\n// 手动改动\n`)

    await wrapper.get('[data-testid="vue-export-write"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('已写入 D:/proj')
    const patchedRouter = projectFiles.get(h5TemplateProfile.routerFilePath)!
    expect(patchedRouter).toContain('// 手动改动')
    expect(patchedRouter).toContain('router.addRoute({')
  })

  it('预览后路由已被外部注册同名路由，写入时跳过路由仅写其余文件', async () => {
    const { port, written, projectFiles } = createFakePort()
    const wrapper = mountDialog({ port })
    await arriveAtPreview(wrapper)

    // 模拟外部已注册同名路由（预览时的冲突检测看不到这次变化）
    projectFiles.set(h5TemplateProfile.routerFilePath, templateRouterSource.replace('name: "home"', 'name: "demo"'))

    await wrapper.get('[data-testid="vue-export-write"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('已写入 D:/proj')
    expect(wrapper.text()).toContain('路由未注册')
    expect(written.map((file) => file.path)).not.toContain('src/router/index.ts')
    expect(written.length).toBe(4)
  })

  it('目标项目存在同名文件时列出冲突并阻止写入', async () => {
    const { port, written } = createFakePort({
      existingPaths: ['src/views/demo/index.vue', 'public/static/images/Badge.png'],
    })
    const wrapper = mountDialog({ port })
    await arriveAtPreview(wrapper)

    const conflicts = wrapper.get('[data-testid="vue-export-conflicts"]')
    expect(conflicts.text()).toContain('src/views/demo/index.vue')
    expect(conflicts.text()).toContain('public/static/images/Badge.png')
    expect((wrapper.get('[data-testid="vue-export-write"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(written).toEqual([])
  })

  it('目标项目没有路由文件时跳过路由注册但仍可写入', async () => {
    const { port, written } = createFakePort({ routerSource: null })
    const wrapper = mountDialog({ port })
    await arriveAtPreview(wrapper)

    expect(wrapper.get('[data-testid="vue-export-router-note"]').text()).toContain('路由未注册')

    await wrapper.get('[data-testid="vue-export-write"]').trigger('click')
    await flushPromises()

    expect(written.map((file) => file.path)).not.toContain('src/router/index.ts')
    expect(written.length).toBe(4)
  })

  it('目标目录缺 package.json 时给出疑似非模板项目提示（不阻断）', async () => {
    const { port } = createFakePort({ packageJson: null })
    const wrapper = mountDialog({ port })
    await arriveAtPreview(wrapper)

    expect(wrapper.text()).toContain('可能不是 h5-template 项目')
    expect((wrapper.get('[data-testid="vue-export-write"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('切图字节缺失时报错且不写入', async () => {
    const { port, written } = createFakePort()
    const wrapper = mountDialog({ port, access: createFakeAccess(['assets/badge-7.png']) })
    await arriveAtPreview(wrapper)

    await wrapper.get('[data-testid="vue-export-write"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('缺少切图字节：assets/badge-7.png')
    expect(written).toEqual([])
  })

  it('设计事实加载失败时在配置阶段展示错误', async () => {
    const { port } = createFakePort()
    const wrapper = mountDialog({
      port,
      access: {
        loadFacts: () => Promise.reject(new Error('本地 Bundle 记录不存在')),
        readAssetBytes: () => Promise.resolve(new Uint8Array([1])),
      },
    })
    await wrapper.get('[data-testid="vue-export-project-root"]').setValue('D:/proj')
    await wrapper.get('[data-testid="vue-export-generate"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('本地 Bundle 记录不存在')
    // 进度面板保留失败现场：第一步被标记为失败
    expect(wrapper.get('[data-testid="vue-export-progress"] li').classes()).toContain('is-failed')
  })

  it('生成过程分步展示进度', async () => {
    const { port } = createFakePort()
    let resolveFacts!: () => void
    const wrapper = mountDialog({
      port,
      access: {
        loadFacts: () => new Promise((resolve) => {
          resolveFacts = () => resolve(createVueExportFacts())
        }),
        readAssetBytes: () => Promise.resolve(new Uint8Array([1])),
      },
    })
    await wrapper.get('[data-testid="vue-export-project-root"]').setValue('D:/proj')
    await wrapper.get('[data-testid="vue-export-generate"]').trigger('click')
    await flushPromises()

    // 卡在第一步时能看到当前步骤与后续待办
    const progress = wrapper.get('[data-testid="vue-export-progress"]')
    expect(progress.text()).toContain('加载设计事实')
    expect(progress.text()).toContain('检查写入冲突')

    resolveFacts()
    await flushPromises()

    // 完成后进入预览，进度面板清空
    expect(wrapper.text()).toContain('4 张切图')
    expect(wrapper.find('[data-testid="vue-export-progress"]').exists()).toBe(false)
  })

  it('写入过程展示切图读取计数与写入步骤', async () => {
    let resolveWrite!: () => void
    const { port, written } = createFakePort({
      beforeWrite: () => new Promise((resolve) => {
        resolveWrite = resolve
      }),
    })
    const wrapper = mountDialog({ port })
    await arriveAtPreview(wrapper)

    await wrapper.get('[data-testid="vue-export-write"]').trigger('click')
    await flushPromises()

    // 前两步完成、写入进行中，明细显示文件总数
    const progress = wrapper.get('[data-testid="vue-export-progress"]')
    expect(progress.text()).toContain('写入项目文件')
    expect(progress.text()).toContain('共 5 个文件')

    resolveWrite()
    await flushPromises()

    expect(wrapper.text()).toContain('已写入 D:/proj')
    expect(written.length).toBe(5)
  })

  it('浏览器端（未注入端口）显示不可用提示且不渲染表单', () => {
    const wrapper = mountDialog()

    expect(wrapper.text()).toContain('写入目标项目需要桌面端打开')
    expect(wrapper.find('[data-testid="vue-export-page-name"]').exists()).toBe(false)
  })
})
