import type { AssetManifest, DesignSnapshot } from '../bundle/schema'
import { NameDeduplicator, slugifyLayerName, toKebabClassName, toPascalComponentName } from './naming'
import { h5TemplateProfile } from './profile'
import { buildRouterAppend } from './router-patch'
import type {
  VueExportIgnoredNode,
  VueExportImageFile,
  VueExportPreviewElement,
  VueExportPreviewModel,
  VueExportPreviewTextStyle,
  VueExportReport,
  VueExportRequest,
  VueExportResult,
} from './types'

/** 设计事实里的节点 / 资产 / 摆放记录视图类型（来自 bundle schema 的推断类型） */
type DesignNode = DesignSnapshot['nodes'][number]
type AssetEntry = AssetManifest['assets'][number]
type AssetPlacement = AssetManifest['placements'][number]

/** 生成到页面里的元素：标记切图（<img>，可点击时包 <button>）或真实文字（<p>） */
interface ImagePageElement {
  type: 'image'
  node: DesignNode
  /** 定位矩形：优先取 tight 裁剪后的摆放 frame，缺失时回退逻辑边界 */
  frame: { x: number; y: number; width: number; height: number }
  /** bundle 压缩包内的资产源路径（如 assets/bubble-c31af3a0.png），写入方据此取字节 */
  sourcePath: string
  /** 落到 public/static/images 的文件名（含扩展名，取自图层名） */
  fileName: string
  className: string
  /** 命中可点击命名启发式时生成 button 占位 */
  clickable: boolean
}

interface TextPageElement {
  type: 'text'
  node: DesignNode
  className: string
}

type PageElement = ImagePageElement | TextPageElement

/** 命名去重上下文：文件名按资产去重（同资产多处引用共用一个文件），类名按图层去重 */
interface NamingContext {
  fileNameByAssetId: Map<string, string>
  fileNameDeduplicator: NameDeduplicator
  classNameDeduplicator: NameDeduplicator
}

/**
 * 把一份已校验的设计事实（design.json + assets.json）还原成
 * h5-template 约定的静态 Vue 页面。
 *
 * 还原规则（与产品决策一致，改动前先同步约定）：
 * 1. 标记导出（-h-）的图层 → 一张 <img>，按摆放 frame 绝对定位；
 *    其后代已被烘焙进切图，不再单独展开。
 * 2. 未标记的文本图层 → 还原成可选中的真实文字（字号/颜色/对齐来自设计事实）。
 * 3. 未标记的可见图层 → 不进页面，登记到「未还原清单」；
 *    整组都无产出时只登记组本身，避免子图层刷屏。
 * 4. 图层名命中可点击启发式（entrance/btn/mute 等）→ button 包 img，点击处理留 TODO。
 * 5. 画布固定设计宽（750）绝对定位平铺，适配交给目标项目的 postcss-mobile-forever。
 *
 * 生成器是纯函数：只产出内存中的文件内容与路径映射，落盘由调用方负责，
 * 这样浏览器端可用于预览，桌面端可用于写入目标项目。
 */
export function generateVuePage(request: VueExportRequest): VueExportResult {
  const { design, assets, routerSource, options } = request
  const pageName = toKebabClassName(options.pageName)
  if (!pageName) {
    throw new Error('页面名不能为空')
  }

  const warnings = collectPreflightWarnings(design)

  // —— 索引设计事实 ——
  const nodeById = new Map(design.nodes.map((node) => [node.id, node]))
  const assetById = new Map(assets.assets.map((asset) => [asset.id, asset]))
  const placementByNodeId = new Map(assets.placements.map((placement) => [placement.nodeId, placement]))

  for (const placement of assets.placements) {
    if (!assetById.has(placement.assetId)) {
      warnings.push(`切图记录引用了不存在的资产：${placement.assetId}`)
    }
    if (!nodeById.has(placement.nodeId)) {
      warnings.push(`切图记录挂载在未知图层上：${placement.nodeId}`)
    }
  }

  const naming: NamingContext = {
    fileNameByAssetId: new Map(),
    fileNameDeduplicator: new NameDeduplicator(),
    classNameDeduplicator: new NameDeduplicator(),
  }

  const elements: PageElement[] = []
  const ignoredNodes: VueExportIgnoredNode[] = []

  /** 递归收集一个图层子树的页面元素与未还原清单（自下而上 = DOM 顺序 = 层叠顺序） */
  function collectNode(node: DesignNode): void {
    // 1) 标记切图：img/button 定位到摆放 frame，后代不再展开
    const placement = placementByNodeId.get(node.id)
    if (placement) {
      const asset = assetById.get(placement.assetId)
      if (asset) {
        elements.push(createImageElement(node, placement, asset, naming))
        return
      }
      // placement 引用了缺失资产：上面已记 warning，这里按未标记继续兜底
    } else if (node.export?.marked) {
      warnings.push(`图层 "${node.path}" 已标记导出但缺少切图记录，按未标记图层处理`)
    }

    // 2) 真实文字：未标记导出的文本层还原为可选中文本；空文本直接跳过
    if (node.kind === 'text') {
      if (node.text?.content?.trim()) {
        elements.push(createTextElement(node, naming))
      }
      return
    }

    // 3) 组：递归子图层；整组无产出时只登记组本身
    const children = childNodesOf(node, nodeById)
    if (children.length === 0) {
      appendIgnoredLeaf(node, ignoredNodes)
      return
    }

    const elementCountBefore = elements.length
    const ignoredCountBefore = ignoredNodes.length
    for (const child of children) {
      collectNode(child)
    }
    if (elements.length === elementCountBefore && ignoredNodes.length > ignoredCountBefore) {
      // 组内没有任何可还原内容：丢弃子级清单条目，只登记这个组
      ignoredNodes.length = ignoredCountBefore
      appendIgnoredLeaf(node, ignoredNodes)
    }
  }

  const roots = design.rootIds
    .map((id) => nodeById.get(id))
    .filter((node): node is DesignNode => Boolean(node))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
  for (const root of roots) {
    collectNode(root)
  }

  const report: VueExportReport = {
    pageName,
    sourceName: design.source.name,
    canvas: { width: design.document.width, height: design.document.height },
    imageCount: elements.filter((element) => element.type === 'image').length,
    textCount: elements.filter((element) => element.type === 'text').length,
    buttonCount: elements.filter((element) => element.type === 'image' && element.clickable).length,
    images: collectImageFiles(elements),
    ignoredNodes,
    warnings,
  }

  return {
    view: {
      path: `${h5TemplateProfile.viewDirectory}/${pageName}/index.vue`,
      content: renderVueSfc({
        pageName,
        sourceName: design.source.name,
        canvas: { width: design.document.width, height: design.document.height },
        elements,
        ignoredNodes,
      }),
    },
    router: routerSource === undefined
      ? { status: 'skipped', reason: '未提供目标项目路由源码' }
      : buildRouterAppend(routerSource, pageName),
    preview: buildPreviewModel(
      { width: design.document.width, height: design.document.height },
      elements,
    ),
    report,
  }
}

// ---------------------------------------------------------------------------
// 元素构造
// ---------------------------------------------------------------------------

function createImageElement(
  node: DesignNode,
  placement: AssetPlacement,
  asset: AssetEntry,
  naming: NamingContext,
): ImagePageElement {
  // 文件名按资产去重：同一资产被多个图层引用时共用一个文件
  let fileName = naming.fileNameByAssetId.get(asset.id)
  if (!fileName) {
    const extension = asset.file.split('.').pop() || 'png'
    fileName = naming.fileNameDeduplicator.allocate(`${slugifyLayerName(node.name)}.${extension}`)
    naming.fileNameByAssetId.set(asset.id, fileName)
  }
  return {
    type: 'image',
    node,
    frame: placement.frame ?? placement.logicalBounds ?? node.logicalBounds,
    sourcePath: asset.file,
    fileName,
    className: naming.classNameDeduplicator.allocate(toKebabClassName(node.name)),
    clickable: h5TemplateProfile.clickableNamePattern.test(node.name),
  }
}

function createTextElement(node: DesignNode, naming: NamingContext): TextPageElement {
  return {
    type: 'text',
    node,
    className: naming.classNameDeduplicator.allocate(toKebabClassName(node.name)),
  }
}

/** 解析子图层：按 order 升序（自下而上 = DOM 顺序），引用缺失的子级跳过 */
function childNodesOf(node: DesignNode, nodeById: Map<string, DesignNode>): DesignNode[] {
  return (node.children ?? [])
    .map((id) => nodeById.get(id))
    .filter((child): child is DesignNode => Boolean(child))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
}

/** 有实际尺寸的视觉叶子登记为未还原；调整层等零尺寸结构层静默跳过 */
function appendIgnoredLeaf(node: DesignNode, ignoredNodes: VueExportIgnoredNode[]): void {
  const bounds = node.logicalBounds
  if (bounds.width <= 0 || bounds.height <= 0) {
    return
  }
  ignoredNodes.push({
    id: node.id,
    name: node.name,
    path: node.path,
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
  })
}

/** 生成前检查：v1 仅支持竖屏 750 设计稿，其它形态给出警告（由 UI 决定是否拦截） */
function collectPreflightWarnings(design: DesignSnapshot): string[] {
  const warnings: string[] = []
  const { width, height } = design.document
  if (width !== h5TemplateProfile.designViewportWidth) {
    warnings.push(`设计稿宽度为 ${width}px，与目标项目 750px 设计宽不一致，生成代码可能不适配`)
  }
  if (height <= width) {
    warnings.push('设计稿为横屏或方形，v1 仅针对竖屏页面验证过还原效果')
  }
  return warnings
}

/** 汇总需要拷贝的切图文件（bundle 源路径 → 目标项目路径），按元素出现顺序去重 */
function collectImageFiles(elements: PageElement[]): VueExportImageFile[] {
  const images: VueExportImageFile[] = []
  const seen = new Set<string>()
  for (const element of elements) {
    if (element.type !== 'image' || seen.has(element.sourcePath)) {
      continue
    }
    seen.add(element.sourcePath)
    images.push({
      sourcePath: element.sourcePath,
      targetPath: `${h5TemplateProfile.imageTargetDirectory}/${element.fileName}`,
    })
  }
  return images
}

/** 构建平台内预览模型：与 SFC 同源的元素序列（顺序即层叠顺序） */
function buildPreviewModel(
  canvas: { width: number; height: number },
  elements: PageElement[],
): VueExportPreviewModel {
  return {
    canvas,
    elements: elements.map((element): VueExportPreviewElement => {
      if (element.type === 'image') {
        return {
          type: 'image',
          className: element.className,
          frame: element.frame,
          sourcePath: element.sourcePath,
          clickable: element.clickable,
        }
      }
      return {
        type: 'text',
        className: element.className,
        bounds: { ...element.node.logicalBounds },
        content: element.node.text?.content ?? '',
        style: textStyleOf(element.node),
      }
    }),
  }
}

/**
 * 从设计事实解析文本的最终样式。
 * SFC 渲染与平台内预览共用这一份规则，保证两边行高/字号的归一口径一致：
 * 行高优先用 PSD 行距（leading），缺失时用文本框高度（单行文本正好贴合设计）。
 */
function textStyleOf(node: DesignNode): VueExportPreviewTextStyle {
  const bounds = node.logicalBounds
  const style = node.text?.style
  return {
    ...(style?.font_family !== undefined ? { fontFamily: style.font_family } : {}),
    ...(style?.font_size !== undefined ? { fontSize: style.font_size } : {}),
    lineHeight: style?.leading ?? bounds.height,
    ...(style?.color !== undefined ? { color: style.color } : {}),
    ...(style?.text_align !== undefined ? { textAlign: style.text_align } : {}),
    ...(style?.letter_spacing !== undefined ? { letterSpacing: style.letter_spacing } : {}),
    ...(style?.font_weight !== undefined ? { fontWeight: style.font_weight } : {}),
  }
}

// ---------------------------------------------------------------------------
// SFC 渲染
// ---------------------------------------------------------------------------

interface RenderContext {
  pageName: string
  sourceName: string
  canvas: { width: number; height: number }
  elements: PageElement[]
  ignoredNodes: VueExportIgnoredNode[]
}

function renderVueSfc(context: RenderContext): string {
  return [
    renderHeadComment(context),
    renderTemplate(context),
    renderScript(context),
    renderStyle(context),
  ].join('\n\n')
}

/** 文件头注释：生成来源、还原统计与未还原清单，方便人工接管时快速对账 */
function renderHeadComment(context: RenderContext): string {
  const { sourceName, canvas, elements, ignoredNodes } = context
  const imageCount = elements.filter((element) => element.type === 'image').length
  const textCount = elements.filter((element) => element.type === 'text').length
  const buttonCount = elements.filter(
    (element) => element.type === 'image' && element.clickable,
  ).length

  const lines = [
    '<!--',
    '  framecheck 生成的静态页面基线（h5-template 约定），生成后请人工接管维护。',
    '',
    `  设计稿：${sourceName}（${canvas.width} × ${canvas.height}）`,
    `  还原内容：${imageCount} 张标记切图、${textCount} 段真实文字、${buttonCount} 个可点击占位`,
  ]
  if (ignoredNodes.length) {
    lines.push('  未还原图层（未标记 -h- 导出；如需还原请回 PSD 补标记后重新生成）：')
    for (const node of ignoredNodes) {
      lines.push(`    - ${node.path}（${node.bounds.width}×${node.bounds.height} @${node.bounds.x},${node.bounds.y}）`)
    }
  } else {
    lines.push('  未还原图层：无')
  }
  lines.push('  模板约定：页面标签不添加 aria / alt 属性。')
  lines.push('-->')
  return lines.join('\n')
}

function renderTemplate(context: RenderContext): string {
  const { pageName, elements } = context
  const body = elements.flatMap((element) => renderTemplateElement(element))
  return [
    '<template>',
    `  <main class="${pageName}">`,
    ...body.map((line) => `    ${line}`),
    '  </main>',
    '</template>',
  ].join('\n')
}

function renderTemplateElement(element: PageElement): string[] {
  if (element.type === 'image') {
    const src = `${h5TemplateProfile.imageUrlPrefix}/${element.fileName}`
    if (element.clickable) {
      const handlerName = `onClick${toPascalComponentName(element.className)}`
      return [
        `<!-- ${element.node.path}（可点击占位） -->`,
        `<button class="${element.className}" type="button" @click="${handlerName}">`,
        `  <img src="${src}" />`,
        '</button>',
      ]
    }
    return [
      `<!-- ${element.node.path} -->`,
      `<img class="${element.className}" src="${src}" />`,
    ]
  }

  return [
    `<!-- ${element.node.path}（真实文字） -->`,
    `<p class="${element.className}">${escapeHtml(element.node.text?.content ?? '')}</p>`,
  ]
}

function renderScript(context: RenderContext): string {
  const { pageName, elements } = context
  const clickables = elements.filter(
    (element): element is ImagePageElement => element.type === 'image' && element.clickable,
  )

  const lines = [
    '<script setup lang="ts">',
    'defineOptions({',
    `  name: "${pageName}-view"`,
    '});',
  ]
  if (clickables.length) {
    lines.push('')
    lines.push('// TODO: 可点击图层的占位处理函数，接入业务时补齐跳转 / 埋点逻辑')
    for (const element of clickables) {
      lines.push(`const onClick${toPascalComponentName(element.className)} = () => {`)
      lines.push(`  // TODO: ${element.node.name} 点击行为`)
      lines.push('};')
    }
  }
  // </script> 拆开写，避免 SFC 解析器把这段字符串误当作本文件的结束标签
  lines.push('</' + 'script>')
  return lines.join('\n')
}

function renderStyle(context: RenderContext): string {
  const { pageName, canvas, elements } = context
  const rules = [
    renderPageRootRule(pageName, canvas),
    ...elements.map((element) => renderElementRule(element)),
  ]
  // 规则之间空一行，对齐 shoot-h5 的样式排版习惯
  return ['<style scoped lang="less">', rules.join('\n\n'), '</style>'].join('\n')
}

/** 页面根节点：固定设计宽画布，高度兜底视口，居中并裁掉越界内容 */
function renderPageRootRule(pageName: string, canvas: { width: number; height: number }): string {
  return [
    `.${pageName} {`,
    '  position: relative;',
    `  width: ${formatPx(canvas.width)};`,
    `  height: max(${formatPx(canvas.height)}, 100vh);`,
    '  margin: 0 auto;',
    '  overflow: hidden;',
    '}',
  ].join('\n')
}

function renderElementRule(element: PageElement): string {
  if (element.type === 'text') {
    return renderTextRule(element)
  }

  const { className, frame, node } = element
  const declarations = [
    'position: absolute;',
    `top: ${formatPx(frame.y)};`,
    `left: ${formatPx(frame.x)};`,
    `width: ${formatPx(frame.width)};`,
    `height: ${formatPx(frame.height)};`,
  ]
  if (typeof node.opacity === 'number' && node.opacity < 1) {
    declarations.push(`opacity: ${formatNumber(node.opacity)};`)
  }

  if (!element.clickable) {
    return [`.${className} {`, ...declarations.map(indent), '}'].join('\n')
  }

  // button 占位：与 shoot-h5 的按钮写法一致（去默认样式 + img 铺满）
  return [
    `.${className} {`,
    ...declarations.map(indent),
    '  padding: 0;',
    '  border: 0;',
    '  background: transparent;',
    '  cursor: pointer;',
    '',
    '  img {',
    '    display: block;',
    '    width: 100%;',
    '    height: 100%;',
    '  }',
    '}',
  ].join('\n')
}

/** 文本规则：字号 / 行高 / 颜色 / 对齐 / 字距 / 字重均来自设计事实，字体接降级栈 */
function renderTextRule(element: TextPageElement): string {
  const { className } = element
  const bounds = element.node.logicalBounds
  const style = textStyleOf(element.node)

  const declarations = [
    'position: absolute;',
    `top: ${formatPx(bounds.y)};`,
    `left: ${formatPx(bounds.x)};`,
    `width: ${formatPx(bounds.width)};`,
    'margin: 0;',
    style.fontFamily
      ? `font-family: "${style.fontFamily}", ${h5TemplateProfile.fontFallbackStack};`
      : `font-family: ${h5TemplateProfile.fontFallbackStack};`,
  ]
  if (style.fontSize !== undefined) {
    declarations.push(`font-size: ${formatPx(style.fontSize)};`)
  }
  declarations.push(`line-height: ${formatPx(style.lineHeight)};`)
  if (style.color) {
    declarations.push(`color: ${style.color};`)
  }
  if (style.textAlign) {
    declarations.push(`text-align: ${style.textAlign};`)
  }
  if (style.letterSpacing !== undefined) {
    declarations.push(`letter-spacing: ${formatPx(style.letterSpacing)};`)
  }
  if (style.fontWeight !== undefined) {
    declarations.push(`font-weight: ${style.fontWeight};`)
  }

  return [`.${className} {`, ...declarations.map(indent), '}'].join('\n')
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 数值格式化：最多两位小数并去掉尾零（PSD 事实常带浮点噪声） */
function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/** px 值：保留单位，交给 postcss-mobile-forever 统一转换 */
function formatPx(value: number): string {
  return `${formatNumber(value)}px`
}

function indent(declaration: string): string {
  return `  ${declaration}`
}
