// @vitest-environment node

import { BlobReader, TextWriter, Uint8ArrayWriter, ZipReader, configure } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parsePortableBundleArtifacts } from '../../src/features/bundle/schema'
import { generateVuePage } from '../../src/features/codegen/vue-page-generator'
import { h5TemplateProfile } from '../../src/features/codegen/profile'

configure({ useWebWorkers: false })

/**
 * 真实 bundle → Vue 静态页 的端到端契约测试，兼作 POC 写入器。
 *
 * 通过环境变量开启（缺省时整组跳过，不影响常规 CI）：
 * - FRAMECHECK_VUE_EXPORT_BUNDLE：bundle 压缩包路径（必填开关）
 * - FRAMECHECK_VUE_EXPORT_TARGET：目标项目根目录；设置后把产物写入该项目
 *   （已有同名文件一律跳过，绝不覆盖），未设置时只做内存断言
 * - FRAMECHECK_VUE_EXPORT_PAGE：页面名，默认 design-export
 *
 * 数值断言针对「竖屏 - 丐版2.psd-bundle.zip」这份基准稿：
 * 13 张标记切图（9 个可点击占位）、0 段未标记文本、6 条未还原清单。
 * 换用其它 bundle 时请同步调整这组基准值。
 */
const bundlePath = process.env.FRAMECHECK_VUE_EXPORT_BUNDLE
const targetRoot = process.env.FRAMECHECK_VUE_EXPORT_TARGET
const pageName = process.env.FRAMECHECK_VUE_EXPORT_PAGE ?? 'design-export'
const realDescribe = bundlePath ? describe : describe.skip

interface ParsedArchive {
  artifacts: { bundle: string; design: string; assets: string; diagnostics: string }
  /** bundle 内路径 → 文件字节（切图等二进制资源） */
  binaryFiles: Map<string, Uint8Array>
}

async function readArchive(path: string): Promise<ParsedArchive> {
  const data = await readFile(path)
  const reader = new ZipReader(new BlobReader(new Blob([data])))
  try {
    const entries = await reader.getEntries()
    const artifacts: ParsedArchive['artifacts'] = {
      bundle: '',
      design: '',
      assets: '',
      diagnostics: '',
    }
    const binaryFiles = new Map<string, Uint8Array>()

    for (const entry of entries) {
      if (!entry.getData || entry.directory) {
        continue
      }
      if (entry.filename === 'bundle.json') {
        artifacts.bundle = await entry.getData(new TextWriter()).then((text) => text)
      } else if (entry.filename === 'design.json') {
        artifacts.design = await entry.getData(new TextWriter()).then((text) => text)
      } else if (entry.filename === 'assets.json') {
        artifacts.assets = await entry.getData(new TextWriter()).then((text) => text)
      } else if (entry.filename === 'diagnostics.json') {
        artifacts.diagnostics = await entry.getData(new TextWriter()).then((text) => text)
      } else {
        const bytes = await entry.getData(new Uint8ArrayWriter())
        binaryFiles.set(entry.filename, bytes)
      }
    }

    return { artifacts, binaryFiles }
  } finally {
    await reader.close()
  }
}

/** 目标项目内的 POSIX 相对路径 → 本机绝对路径 */
function resolveTargetPath(relativePath: string): string {
  return join(targetRoot!, ...relativePath.split('/'))
}

/** 只写不存在的文件；已存在时返回 false（冲突清单交给调用方提示） */
async function writeFileIfAbsent(absolutePath: string, content: string | Uint8Array): Promise<boolean> {
  if (await stat(absolutePath).then(() => true, () => false)) {
    return false
  }
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content)
  return true
}

realDescribe('真实 bundle → Vue 静态页导出', () => {
  it('生成符合 h5-template 约定的静态页面', async () => {
    const parsed = await readArchive(bundlePath!)
    const validated = parsePortableBundleArtifacts(parsed.artifacts)

    // 目标项目存在时读取现有路由源码，让生成器产出路由补丁
    let routerSource: string | undefined
    if (targetRoot) {
      routerSource = await readFile(resolveTargetPath(h5TemplateProfile.routerFilePath), 'utf8')
    }

    const result = generateVuePage({
      design: validated.design,
      assets: validated.assets,
      routerSource,
      options: { pageName },
    })

    // —— 基准稿的数值契约 ——
    expect(result.report.imageCount).toBe(13)
    expect(result.report.buttonCount).toBe(9)
    expect(result.report.textCount).toBe(0)
    expect(result.report.ignoredNodes.map((node) => node.path)).toEqual([
      'Color Fill 1',
      'BG2_Bg',
      'BG21_Bubble',
      'BG2_Txt2',
      'BG2_Txt1',
      'StudioName',
    ])
    expect(result.report.warnings).toEqual([])

    // —— 通用结构契约（任意 bundle 都成立） ——
    expect(result.view.path).toBe(`src/views/${pageName}/index.vue`)
    for (const image of result.report.images) {
      expect(image.targetPath.startsWith(`${h5TemplateProfile.imageTargetDirectory}/`)).toBe(true)
      expect(parsed.binaryFiles.has(image.sourcePath), `bundle 缺少切图 ${image.sourcePath}`).toBe(true)
    }
    // 页面里引用的每张图都在产物清单里
    for (const image of result.report.images) {
      const fileName = image.targetPath.split('/').pop()
      expect(result.view.content).toContain(`/${fileName}"`)
    }

    console.log(
      `[vue-export] ${result.report.sourceName} → ${result.view.path}：` +
      `${result.report.imageCount} 图 / ${result.report.textCount} 文字 / ` +
      `${result.report.buttonCount} 按钮 / ${result.report.ignoredNodes.length} 未还原`,
    )

    // —— 可选：写入目标项目（POC 模式） ——
    if (!targetRoot) {
      expect(result.router.status).toBe('skipped')
      return
    }

    const conflicts: string[] = []
    if (!(await writeFileIfAbsent(resolveTargetPath(result.view.path), result.view.content))) {
      conflicts.push(result.view.path)
    }
    for (const image of result.report.images) {
      const bytes = parsed.binaryFiles.get(image.sourcePath)!
      if (!(await writeFileIfAbsent(resolveTargetPath(image.targetPath), bytes))) {
        conflicts.push(image.targetPath)
      }
    }
    if (result.router.status === 'patched') {
      // 路由补丁 = 原内容 + 追加行，写回不属于破坏性覆盖
      await writeFile(resolveTargetPath(result.router.file.path), result.router.file.content)
    }

    console.log(`[vue-export] 写入 ${targetRoot}`)
    if (result.router.status === 'patched') {
      console.log(`[vue-export] 路由已注册：/${pageName}`)
    } else if (result.router.status === 'skipped') {
      console.log(`[vue-export] 路由未注册：${result.router.reason}`)
    }
    console.log(`[vue-export] 冲突跳过 ${conflicts.length} 个已存在文件`, conflicts)

    // POC 写入模式下不允许有冲突：目标项目应当是干净的模板克隆
    expect(conflicts).toEqual([])
  })
})
