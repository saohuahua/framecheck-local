import { describe, expect, it } from 'vitest'
import { buildRouterAppend } from '../../../src/features/codegen/router-patch'
import { templateRouterSource } from '../../helpers/vue-export-facts'

describe('buildRouterAppend 路由末尾追加', () => {
  it('生成包含 import 与 addRoute 的追加块，不包含既有内容', () => {
    const patch = buildRouterAppend(templateRouterSource, 'shooting-home')

    expect(patch.status).toBe('appended')
    if (patch.status !== 'appended') {
      return
    }

    expect(patch.file.path).toBe('src/router/index.ts')
    // 追加块引用模板里的 router 实例变量
    expect(patch.file.content).toContain('router.addRoute({')
    expect(patch.file.content).toContain('path: "/shooting-home"')
    expect(patch.file.content).toContain('name: "shooting-home"')
    expect(patch.file.content).toContain('component: ShootingHome')
    expect(patch.file.content).toContain('import ShootingHome from "@/views/shooting-home/index.vue";')
    expect(patch.file.content).toContain('framecheck 追加')
    // 追加块不回写既有内容（落盘走 append 模式）
    expect(patch.file.content).not.toContain('export default router')
  })

  it('路由 path 已存在时跳过（含历史追加块）', () => {
    const source = templateRouterSource.replace(
      'path: "/",\n          name: "home"',
      'path: "/shooting-home",\n          name: "home"',
    )
    const patch = buildRouterAppend(source, 'shooting-home')
    expect(patch.status).toBe('skipped')
  })

  it('路由 name 已存在时跳过', () => {
    const source = templateRouterSource.replace('name: "home"', 'name: "shooting-home"')
    const patch = buildRouterAppend(source, 'shooting-home')
    expect(patch.status).toBe('skipped')
  })

  it('目标组件已被引入时跳过（防重复导出）', () => {
    const source = templateRouterSource.replace(
      'import HomeView from "@/views/home-view/index.vue";',
      'import HomeView from "@/views/home-view/index.vue";\nimport ShootingHome from "@/views/shooting-home/index.vue";',
    )
    const patch = buildRouterAppend(source, 'shooting-home')
    expect(patch.status).toBe('skipped')
  })

  it('源文件没有 createRouter 实例变量时跳过', () => {
    const source = 'const routes = [];\nexport default routes;'
    const patch = buildRouterAppend(source, 'shooting-home')
    expect(patch.status).toBe('skipped')
    if (patch.status === 'skipped') {
      expect(patch.reason).toContain('router 实例')
    }
  })

  it('未提供源码时跳过', () => {
    const patch = buildRouterAppend(undefined, 'shooting-home')
    expect(patch.status).toBe('skipped')
  })

  it('识别非默认命名的 router 实例变量', () => {
    const source = templateRouterSource
      .replace('const router = createRouter', 'const appRouter = createRouter')
      .replace('export default router;', 'export default appRouter;')
    const patch = buildRouterAppend(source, 'shooting-home')

    expect(patch.status).toBe('appended')
    if (patch.status === 'appended') {
      expect(patch.file.content).toContain('appRouter.addRoute({')
      expect(patch.file.content).not.toContain('\nrouter.addRoute')
    }
  })

  it('源文件末尾无换行时追加块先补一个换行', () => {
    const source = templateRouterSource.trimEnd()
    const patch = buildRouterAppend(source, 'shooting-home')

    expect(patch.status).toBe('appended')
    if (patch.status === 'appended') {
      expect(patch.file.content.startsWith('\n// ---- framecheck 追加')).toBe(true)
    }
  })
})
