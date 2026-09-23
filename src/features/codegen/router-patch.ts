import { toPascalComponentName } from './naming'
import { h5TemplateProfile } from './profile'
import type { VueExportRouterPatch } from './types'

/**
 * 为目标项目现有 `src/router/index.ts` 构建一段「末尾追加」的路由注册块。
 *
 * 与插入 children 数组的方案相比，追加语义对用户项目零侵入：
 * - 不改动既有文件的任何内容，只在末尾追加（import 声明有提升机制，写在末尾合法）；
 * - 用 `router.addRoute` 运行时注册路由，避免读-改-写整个文件的竞态；
 * - 写入方可基于最新源码重新构建追加块，天然免疫“预览后文件被修改”的问题。
 *
 * 命中以下任一情况时放弃追加（返回 skipped），由上层提示用户手工处理：
 * - 已存在相同的路由 path / name（含此前追加过的注册块）
 * - 目标组件已被引入（疑似重复导出）
 * - 未能识别 `const router = createRouter(...)` 形式的实例变量
 */
export function buildRouterAppend(source: string | undefined, pageName: string): VueExportRouterPatch {
  const routePath = `/${pageName}`
  const routeName = pageName
  const componentImportName = toPascalComponentName(pageName)
  // 落盘路径相对项目根（src/views/...），import 别名相对 src（@/views/...），两者前缀不同
  const viewImportPath = `@/${h5TemplateProfile.viewDirectory.replace(/^src\//, '')}/${pageName}/index.vue`

  if (source === undefined) {
    return { status: 'skipped', reason: '目标项目没有路由文件，请手工注册路由' }
  }

  // 冲突探测：path/name 均为字面量，字符串包含即可判定（也能识别历史追加块）
  if (source.includes(`path: "${routePath}"`) || source.includes(`path: '${routePath}'`)) {
    return { status: 'skipped', reason: `路由 path "${routePath}" 已存在` }
  }
  if (source.includes(`name: "${routeName}"`) || source.includes(`name: '${routeName}'`)) {
    return { status: 'skipped', reason: `路由 name "${routeName}" 已存在` }
  }
  if (source.includes(viewImportPath)) {
    return { status: 'skipped', reason: `组件 ${viewImportPath} 已被引入，疑似重复导出` }
  }

  // 识别 createRouter 的实例变量名，追加块要引用它注册路由
  const instanceMatch = source.match(/const\s+([A-Za-z_$][\w$]*)\s*=\s*createRouter\s*\(/)
  if (!instanceMatch) {
    return { status: 'skipped', reason: '未能识别 router 实例（const router = createRouter(...)），请手工注册路由' }
  }
  const routerVariable = instanceMatch[1]

  // 源文件末尾没有换行时补一个，避免追加块粘在最后一行
  const leadingNewline = source.endsWith('\n') ? '' : '\n'
  const content = [
    `${leadingNewline}// ---- framecheck 追加：${pageName} 静态页路由（如需整理可移入上方 routes） ----`,
    `import ${componentImportName} from "${viewImportPath}";`,
    '',
    `${routerVariable}.addRoute({`,
    `  path: "${routePath}",`,
    `  name: "${routeName}",`,
    `  component: ${componentImportName}`,
    '});',
    '',
  ].join('\n')

  return {
    status: 'appended',
    file: {
      path: h5TemplateProfile.routerFilePath,
      // content 只包含追加块；由写入方以 append 模式落到既有文件末尾
      content,
    },
  }
}
