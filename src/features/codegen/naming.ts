/**
 * 图层名 → 文件名 / CSS 类名 / 组件名的命名工具。
 *
 * 约定（对齐 h5-template 与 shoot-h5 的既有命名）：
 * - 图片文件名沿用 PSD 图层名原文大小写与下划线（如 `BG1_Bg.png`、`Entrance_BiliBili.png`），
 *   仅把空格等不安全字符压成连字符；中日韩文字允许保留（如 `组 7` → `组-7`）。
 * - CSS 类名用 kebab-case（如 `entrance-bilibili`），下划线视为分隔符。
 * - 路由导入的组件名用 PascalCase（如 `shooting-home` → `ShootingHome`）。
 */

/** CJK 基本区 + 扩展 A 区（保留在文件名与类名里的表意文字范围） */
const cjkRange = '\\u3400-\\u4DBF\\u4E00-\\u9FFF'

/** 文件名中允许保留的字符：ASCII 字母数字、下划线、连字符、CJK；其余压成连字符 */
const fileNameAllowedPattern = new RegExp(`[^\\w${cjkRange}-]+`, 'g')

/** 类名分隔符：ASCII 字母数字与 CJK 之外的任何字符（含下划线、空格、符号） */
const classNameSeparatorPattern = new RegExp(`[^A-Za-z0-9${cjkRange}]+`, 'g')

/** 把任意图层名压成安全的文件名片段：空格/特殊字符 → 单个连字符，保留大小写与 CJK */
export function slugifyLayerName(name: string): string {
  const slug = name
    .replace(fileNameAllowedPattern, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'layer'
}

/** 把图层名压成 kebab-case 类名：ASCII 转小写，分隔符统一为连字符 */
export function toKebabClassName(name: string): string {
  const kebab = name
    .replace(classNameSeparatorPattern, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return kebab || 'layer'
}

/** 把 kebab-case 页面名转成 PascalCase 组件名（`shooting-home` → `ShootingHome`） */
export function toPascalComponentName(pageName: string): string {
  const pascal = pageName
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return pascal || 'GeneratedPage'
}

/**
 * 同名去重器：第一次出现用原名，之后追加 `-2`、`-3`…
 * PSD 允许同名图层，文件名与类名都必须防碰撞。
 */
export class NameDeduplicator {
  private readonly used = new Map<string, number>()

  /** 登记一个基础名，返回去重后的最终名 */
  allocate(base: string): string {
    const count = this.used.get(base) ?? 0
    this.used.set(base, count + 1)
    return count === 0 ? base : `${base}-${count + 1}`
  }
}
