/**
 * Vue 静态页导出（PSD bundle → h5-template 风格代码）。
 *
 * 模块边界：`bundle` 负责 bundle 的导入/校验，`codegen` 只消费校验后的
 * 设计事实并产出文件内容与路径映射；落盘（写入目标项目）由桌面端桥接层负责。
 */
export { h5TemplateProfile } from './profile'
export { NameDeduplicator, slugifyLayerName, toKebabClassName, toPascalComponentName } from './naming'
export { buildRouterAppend } from './router-patch'
export { generateVuePage } from './vue-page-generator'
export type {
  VueExportBundleAccess,
  VueExportPort,
  VueExportProjectWriter,
  VueExportTargetChooser,
  VueExportWriteFile,
} from './vue-export-port'
export type {
  VueExportFactsInput,
  VueExportIgnoredNode,
  VueExportImageFile,
  VueExportOptions,
  VueExportPreviewElement,
  VueExportPreviewModel,
  VueExportPreviewTextStyle,
  VueExportReport,
  VueExportRequest,
  VueExportResult,
  VueExportRouterPatch,
  VueExportTextFile,
} from './types'
