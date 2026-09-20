import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..', '..')
const resultsPath = join(projectRoot, 'tests', '.tmp', 'real-fixture-results.json')
const reportDirectory = join(projectRoot, 'docs', 'reports')

const results = JSON.parse(await readFile(resultsPath, 'utf8'))
const generatedAt = new Date().toISOString()
const fixtures = results.fixtures
const unsupported = new Map()

for (const fixture of fixtures) {
  for (const diagnostic of fixture.diagnostics.unsupported) {
    if (!unsupported.has(diagnostic.type)) {
      unsupported.set(diagnostic.type, diagnostic.message)
    }
  }
}

const compatibilityRows = fixtures.map((fixture) => [
  fixture.id,
  fixture.category,
  formatBytes(fixture.sourceBytes),
  formatBytes(fixture.archiveBytes),
  `${fixture.document.width} x ${fixture.document.height}`,
  String(fixture.nodes.count),
  `${fixture.assets.count} / ${fixture.assets.placements}`,
  String(fixture.diagnostics.cliCount),
]).map((row) => `| ${row.join(' | ')} |`).join('\n')

const compatibility = [
  '# CLI Bundle Compatibility Report',
  '',
  `生成时间：${generatedAt}`,
  '',
  '## 输入契约',
  '',
  'psd_to_code.py pack <PSD_PATH> -o <OUTPUT_DIR> --scales 1',
  '',
  '所有样本均验证为 schemaVersion: "1.0.0" 与 kind: "psd-design-bundle"。真实 PSD 与生成 ZIP 位于本机忽略目录 artifacts/v3-real-fixtures/，不包含在仓库中。',
  '',
  '## Fixture Results',
  '',
  '| Fixture | 覆盖类别 | PSD 大小 | ZIP 大小 | 文档尺寸 | 节点 | 资源 / placement | CLI diagnostics |',
  '| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |',
  compatibilityRows,
  '',
  '## 对比结论',
  '',
  '- Web 校验 bundle.json schema 与 kind，并保留 archive 内原始内容不修改',
  '- Web 文档尺寸与 reference.png PNG 尺寸逐样本一致',
  '- Web 图层树逐节点保留 CLI 的节点 ID 与名称',
  '- Web 资源数量、逻辑尺寸、像素尺寸与全部 placement 图层逐条比对',
  '- CLI diagnostics 被保留并映射为可读状态，未投影的 CLI 字段额外显示 unsupported_* diagnostics',
  '- 真实 marker 样本验证到 -h- 资源；本机扫描的候选 PSD 未发现 -s- 或 -slice- 图层，因此这两类没有真实端到端样本',
  '',
  '## 已知边界',
  '',
  '- 本报告不意味着浏览器可直接解析 PSD，Web 仅消费 CLI 已生成的 bundle',
  '- CSS 投影仅覆盖基础几何和文本样式，完整效果、遮罩、路径、复杂变换、剪贴关系与文本 runs 见 [无法表达字段](./unsupported-cli-fields.md)',
].join('\n')

const unsupportedRows = [...unsupported.entries()]
  .map(([type, message]) => `| \`${type}\` | ${message} |`)
  .join('\n')

const unsupportedReport = [
  '# 无法表达的 CLI 字段',
  '',
  `生成时间：${generatedAt}`,
  '',
  '这些字段由 psd2code pack 正确保留在 design.json，但当前 V3 Vue Inspector 不创建推测值。发现后会显示 info 级 unsupported_* diagnostics，并可定位到首个受影响图层。',
  '',
  '| 诊断类型 | 当前处理 |',
  '| --- | --- |',
  unsupportedRows,
  '',
  '## 已表达字段',
  '',
  '- bundle schema、来源元数据、reference PNG、文档尺寸、节点 ID、名称、层级、logical/paint bounds',
  '- 基础文本内容与可用字体样式字段',
  '- 标记资源、全部 placement 图层、逻辑尺寸、实际像素、倍率和文件下载',
  '- CLI diagnostics 的 code、name、path、marker，以及导入时发现的 schema 与安全错误',
  '',
  '## 不做的推测',
  '',
  '不根据效果、遮罩、路径或变换猜测 CSS、图像合成结果或可编辑样式。原始 JSON 会保存于 OPFS，后续 Viewer 能力应从原始字段增加明确投影，而不是覆盖 bundle 真值。',
].join('\n')

await mkdir(reportDirectory, { recursive: true })
await writeFile(join(reportDirectory, 'cli-bundle-compatibility.md'), compatibility)
await writeFile(join(reportDirectory, 'unsupported-cli-fields.md'), unsupportedReport)

function formatBytes(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
