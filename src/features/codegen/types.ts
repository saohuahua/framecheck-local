import type { AssetManifest, DesignSnapshot } from '../bundle/schema'

/**
 * Vue 静态页导出（PSD bundle → h5-template 风格代码）的输入输出契约。
 *
 * 输入侧直接复用 `bundle/schema` 校验出的 `DesignSnapshot` / `AssetManifest`，
 * 生成器不做二次解析，只消费已经结构化的设计事实。
 */

/** 生成所需的设计事实：bundle 内 design.json 与 assets.json 的校验产物 */
export interface VueExportFactsInput {
  design: DesignSnapshot
  assets: AssetManifest
}

/** 导出选项 */
export interface VueExportOptions {
  /**
   * 目标项目里的页面名（kebab-case）。
   * 同时决定三处命名：
   * - 页面目录：src/views/<pageName>/index.vue
   * - 路由：path "/<pageName>"、name "<pageName>"
   * - 组件名：defineOptions name "<pageName>-view"、路由导入 PascalCase
   */
  pageName: string
}

/** 单张需要拷贝到目标项目的切图 */
export interface VueExportImageFile {
  /** bundle 压缩包内的源路径（如 assets/bubble-c31af3a0.png），由写入方负责读取字节 */
  sourcePath: string
  /** 目标项目内的相对路径（如 public/static/images/BG1_Bubble.png），POSIX 风格 */
  targetPath: string
}

/** 生成到目标项目的文本文件（页面组件或路由补丁） */
export interface VueExportTextFile {
  /** 目标项目内的相对路径，POSIX 风格 */
  path: string
  content: string
}

/** 未被还原的可见图层（用于提示用户回 PSD 补标记后重新导出） */
export interface VueExportIgnoredNode {
  id: string
  /** 设计稿里的图层名（已去掉 -h- 标记前缀） */
  name: string
  /** 图层完整路径，如 "BG2_Bg/Layer 71" */
  path: string
  bounds: { x: number; y: number; width: number; height: number }
}

/** 生成结果摘要，用于界面展示与写入前确认 */
export interface VueExportReport {
  pageName: string
  /** 设计稿文件名（来自 design.source.name），写入页面头部注释 */
  sourceName: string
  canvas: { width: number; height: number }
  /** 还原为 <img> 的标记切图数量 */
  imageCount: number
  /** 还原为真实文字的文本层数量 */
  textCount: number
  /** 生成 button 占位的可点击图层数量 */
  buttonCount: number
  images: VueExportImageFile[]
  ignoredNodes: VueExportIgnoredNode[]
  /** 数据异常等非致命问题（不阻断生成） */
  warnings: string[]
}

/**
 * 路由注册结果（末尾追加语义，不改动既有文件内容）：
 * - appended：返回追加块（file.content 只是追加内容），由写入方以 append 模式落盘
 * - skipped：命中冲突或无法识别 router 实例，不动路由文件
 */
export type VueExportRouterPatch =
  | { status: 'appended'; file: VueExportTextFile }
  | { status: 'skipped'; reason: string }

/** 一次导出的完整产物（全部为内存中的字符串/路径映射，不直接写盘） */
export interface VueExportResult {
  /** 页面组件文件（src/views/<pageName>/index.vue） */
  view: VueExportTextFile
  /** 路由补丁；未提供 routerSource 时为 skipped */
  router: VueExportRouterPatch
  /** 页面结构化投影，供平台内预览渲染（与 SFC 内容同源生成，保证所见即所得） */
  preview: VueExportPreviewModel
  report: VueExportReport
}

/** 生成请求：设计事实 + 可选的现有路由源码 + 选项 */
export interface VueExportRequest extends VueExportFactsInput {
  /** 目标项目现有 src/router/index.ts 的完整内容；缺省时不生成路由补丁 */
  routerSource?: string
  options: VueExportOptions
}

/**
 * 预览元素：页面渲染结果的结构化描述。
 * 图片元素带 bundle 内切图源路径（由预览方解析为 object URL），
 * 文本元素带设计事实解析后的最终样式（行高等已按 SFC 同样规则归一）。
 */
export type VueExportPreviewElement =
  | {
      type: 'image'
      className: string
      /** 定位矩形（设计坐标系，与 SFC 里的 top/left/width/height 一致） */
      frame: { x: number; y: number; width: number; height: number }
      /** bundle 压缩包内的切图源路径 */
      sourcePath: string
      /** 是否生成为 button 占位（预览时以可点击样式提示） */
      clickable: boolean
    }
  | {
      type: 'text'
      className: string
      bounds: { x: number; y: number; width: number; height: number }
      content: string
      style: VueExportPreviewTextStyle
    }

/** 文本预览样式：字段与 SFC 输出的 CSS 一一对应 */
export interface VueExportPreviewTextStyle {
  fontFamily?: string
  fontSize?: number
  lineHeight: number
  color?: string
  textAlign?: string
  letterSpacing?: number
  fontWeight?: number
}

/** 预览模型：画布尺寸 + 自下而上的元素序列 */
export interface VueExportPreviewModel {
  canvas: { width: number; height: number }
  elements: VueExportPreviewElement[]
}
