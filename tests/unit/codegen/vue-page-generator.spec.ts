import { describe, expect, it } from 'vitest'
import { generateVuePage } from '../../../src/features/codegen/vue-page-generator'
import {
  createVueExportFacts,
  createVueExportRequest,
  templateRouterSource,
} from '../../helpers/vue-export-facts'

/**
 * 生成器核心规则测试（夹具见 tests/helpers/vue-export-facts.ts）：
 * 标记组烘焙 / frame 优先定位 / 可点击 button / 真实文字 /
 * 未标记清单 / 同名与同资产去重 / 预览模型与 SFC 同源。
 */
describe('generateVuePage 静态页生成', () => {
  it('产出 h5-template 约定的页面文件路径与头部对账注释', () => {
    const result = generateVuePage(createVueExportRequest())

    expect(result.view.path).toBe('src/views/demo-page/index.vue')
    expect(result.view.content).toContain('设计稿：demo.psd（750 × 1200）')
    expect(result.view.content).toContain('4 张标记切图、1 段真实文字、1 个可点击占位')
    expect(result.view.content).toContain('未还原图层（未标记 -h- 导出')
  })

  it('标记组还原为单张 img，内部子层不再展开', () => {
    const result = generateVuePage(createVueExportRequest())

    expect(result.view.content).toContain('<img class="hero" src="/static/images/Hero.png" />')
    expect(result.view.content).not.toContain('hero-inner')
    expect(result.view.content).not.toContain('Hero Inner')
  })

  it('定位取 tight frame 而非逻辑边界，半透明图层带 opacity', () => {
    const result = generateVuePage(createVueExportRequest())
    const style = result.view.content

    expect(style).toContain('top: 900px;')
    expect(style).toContain('left: 100px;')
    expect(style).toContain('width: 80px;')
    expect(style).toContain('height: 40px;')
    expect(style).not.toContain('top: 910px;')
    expect(style).toContain('opacity: 0.8;')
  })

  it('命中可点击命名的图层生成 button 占位与 TODO 处理函数', () => {
    const result = generateVuePage(createVueExportRequest())

    expect(result.view.content).toContain(
      '<button class="cta-btn" type="button" @click="onClickCtaBtn">',
    )
    expect(result.view.content).toContain('<img src="/static/images/CTA_Btn.png" />')
    expect(result.view.content).toContain('const onClickCtaBtn = () => {')
    expect(result.view.content).toContain('// TODO: CTA_Btn 点击行为')
  })

  it('未标记文本还原为真实文字：内容转义、样式来自设计事实', () => {
    const result = generateVuePage(createVueExportRequest())

    expect(result.view.content).toContain('<p class="footer-note">A &amp; B &lt;tag&gt; 联系我们</p>')
    expect(result.view.content).toContain('font-family: "FixtureFont", "PingFang SC", "Microsoft YaHei", sans-serif;')
    expect(result.view.content).toContain('font-size: 24px;')
    expect(result.view.content).toContain('line-height: 30px;')
    expect(result.view.content).toContain('color: rgba(255, 255, 255, 1);')
    expect(result.view.content).toContain('text-align: center;')
    expect(result.view.content).toContain('letter-spacing: 2px;')
    expect(result.view.content).toContain('font-weight: 600;')
    expect(result.view.content).toContain('margin: 0;')
  })

  it('未标记视觉层进清单，未标记组只登记组本身', () => {
    const result = generateVuePage(createVueExportRequest())

    const ignoredPaths = result.report.ignoredNodes.map((node) => node.path)
    expect(ignoredPaths).toEqual(['Root/Decor', 'Root/Old Page'])
    expect(result.view.content).toContain('- Root/Decor（750×100 @0,1100）')
  })

  it('同名图层共用同资产的文件名，类名追加序号去重', () => {
    const result = generateVuePage(createVueExportRequest())

    // 两个 Badge 元素共用 Badge.png（按资产去重）
    expect(result.view.content).toContain('<img class="badge" src="/static/images/Badge.png" />')
    expect(result.view.content).toContain('<img class="badge-2" src="/static/images/Badge.png" />')
    // images 清单里同一资产只出现一次
    const badgeImages = result.report.images.filter((image) => image.targetPath === 'public/static/images/Badge.png')
    expect(badgeImages).toHaveLength(1)
    expect(badgeImages[0]).toEqual({
      sourcePath: 'assets/badge-7.png',
      targetPath: 'public/static/images/Badge.png',
    })
  })

  it('页面根规则固定设计宽并兜底视口高度', () => {
    const result = generateVuePage(createVueExportRequest())

    expect(result.view.content).toContain('width: 750px;')
    expect(result.view.content).toContain('height: max(1200px, 100vh);')
    expect(result.view.content).toContain('margin: 0 auto;')
  })

  it('遵守模板 AGENTS 约定：不输出 aria / alt 属性', () => {
    const result = generateVuePage(createVueExportRequest())

    expect(result.view.content).not.toMatch(/\balt=|\baria-/)
  })

  it('报告统计与产物清单一致', () => {
    const result = generateVuePage(createVueExportRequest())

    expect(result.report).toMatchObject({
      pageName: 'demo-page',
      sourceName: 'demo.psd',
      canvas: { width: 750, height: 1200 },
      imageCount: 4,
      textCount: 1,
      buttonCount: 1,
    })
    expect(result.report.images.map((image) => image.targetPath)).toEqual([
      'public/static/images/Hero.png',
      'public/static/images/CTA_Btn.png',
      'public/static/images/Badge.png',
    ])
    expect(result.report.warnings).toEqual([])
  })

  it('预览模型与 SFC 同源：画布、元素数量、顺序与关键定位一致', () => {
    const result = generateVuePage(createVueExportRequest())

    expect(result.preview.canvas).toEqual({ width: 750, height: 1200 })
    // 元素顺序 = 自下而上的层叠顺序：hero → cta → footer → badge → badge-2
    expect(result.preview.elements.map((element) => element.className)).toEqual([
      'hero',
      'cta-btn',
      'footer-note',
      'badge',
      'badge-2',
    ])

    const hero = result.preview.elements[0]
    expect(hero).toMatchObject({
      type: 'image',
      sourcePath: 'assets/hero-9.png',
      clickable: false,
      frame: { x: 0, y: 0, width: 750, height: 800 },
    })

    // frame 优先于逻辑边界（与 SFC 的定位口径一致）
    const cta = result.preview.elements[1]
    expect(cta).toMatchObject({
      type: 'image',
      clickable: true,
      frame: { x: 100, y: 900, width: 80, height: 40 },
    })

    // 文本元素带归一后的样式（leading 优先于文本框高度）
    const footer = result.preview.elements[2]
    expect(footer).toMatchObject({
      type: 'text',
      content: 'A & B <tag> 联系我们',
      bounds: { x: 75, y: 1000, width: 600, height: 30 },
    })
    if (footer.type === 'text') {
      expect(footer.style).toEqual({
        fontFamily: 'FixtureFont',
        fontSize: 24,
        lineHeight: 30,
        color: 'rgba(255, 255, 255, 1)',
        textAlign: 'center',
        letterSpacing: 2,
        fontWeight: 600,
      })
    }
  })

  it('页面名会被规范成 kebab-case', () => {
    const result = generateVuePage(createVueExportRequest({ options: { pageName: 'Demo Page' } }))

    expect(result.report.pageName).toBe('demo-page')
    expect(result.view.path).toBe('src/views/demo-page/index.vue')
  })

  it('非 750 宽或横屏设计稿给出警告', () => {
    const { design, assets } = createVueExportFacts()
    design.document = { ...design.document, width: 800, height: 600 }
    const result = generateVuePage({ design, assets, options: { pageName: 'demo-page' } })

    expect(result.report.warnings).toEqual([
      '设计稿宽度为 800px，与目标项目 750px 设计宽不一致，生成代码可能不适配',
      '设计稿为横屏或方形，v1 仅针对竖屏页面验证过还原效果',
    ])
  })

  it('已标记但缺切图记录的图层记警告并按未标记处理', () => {
    const { design, assets } = createVueExportFacts()
    // 撤掉 hero 的 placement，模拟导出记录缺失
    assets.placements = assets.placements.filter((placement) => placement.nodeId !== 'hero')

    const result = generateVuePage({ design, assets, options: { pageName: 'demo-page' } })

    expect(result.report.warnings).toContain('图层 "Root/Hero" 已标记导出但缺少切图记录，按未标记图层处理')
    // hero 组递归后无产出，进入未还原清单
    expect(result.report.ignoredNodes.map((node) => node.path)).toContain('Root/Hero')
  })

  it('提供路由源码时生成追加块，否则跳过', () => {
    const appended = generateVuePage(createVueExportRequest({ routerSource: templateRouterSource }))
    expect(appended.router.status).toBe('appended')
    if (appended.router.status === 'appended') {
      expect(appended.router.file.path).toBe('src/router/index.ts')
      // content 只是追加块，不含既有内容
      expect(appended.router.file.content).toContain('router.addRoute({')
      expect(appended.router.file.content).toContain('path: "/demo-page"')
      expect(appended.router.file.content).not.toContain('export default router')
    }

    const skipped = generateVuePage(createVueExportRequest())
    expect(skipped.router.status).toBe('skipped')
  })
})
