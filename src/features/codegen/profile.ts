/**
 * h5-template 目标项目的生成约定（profile）。
 *
 * 约定来源：gitlab common-platform/template/frontend/h5-template 的实际写法
 * （本仓库 POC 阶段以 shoot-h5 实例项目为准逐条核对过）：
 *
 * - 页面画布固定 750px 设计宽，适配由目标项目的 postcss-mobile-forever
 *   （viewportWidth: 750, mobileUnit: "rem"）在构建期完成，生成器只写 px。
 * - 图片资源放 `public/static/images`，模板内以 `/static/images/...` 引用。
 * - 页面组件放 `src/views/<pageName>/index.vue`，路由注册在 `src/router/index.ts`。
 * - 元素用绝对定位平铺，scoped less；明显可点击的图层包 `<button>`。
 * - 模板 AGENTS.md 约定：页面标签不添加 aria / alt 属性，生成器同样遵守。
 */
export const h5TemplateProfile = {
  /** profile 标识，写入生成注释便于追溯 */
  id: 'h5-template',

  /** 图片在目标项目中的落盘目录（相对项目根，POSIX 风格） */
  imageTargetDirectory: 'public/static/images',

  /** 模板内引用图片的 URL 前缀 */
  imageUrlPrefix: '/static/images',

  /** 页面组件目录（相对项目根） */
  viewDirectory: 'src/views',

  /** 路由文件路径（相对项目根） */
  routerFilePath: 'src/router/index.ts',

  /** 设计稿宽度（与目标项目 postcss-mobile-forever 的 viewportWidth 对齐，仅用于校验提示） */
  designViewportWidth: 750,

  /**
   * 可点击图层命名启发式：图层名命中即生成 button 占位。
   * 覆盖常见入口/按钮/静音/信息/关闭/分享等命名，可按团队习惯增删。
   */
  clickableNamePattern: /(?:entrance|btn|button|按钮|mute|info|close|share|download|link|arrow)/i,

  /**
   * PSD 字体缺失时的降级字体栈。
   * 设计稿字体（如 FZY4K--GBK1）通常不会随页面分发，先保留原名再接降级栈。
   */
  fontFallbackStack: '"PingFang SC", "Microsoft YaHei", sans-serif',
} as const

export type H5TemplateProfile = typeof h5TemplateProfile
