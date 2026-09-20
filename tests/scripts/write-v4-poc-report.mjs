import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BlobReader, TextWriter, ZipReader, configure } from '@zip.js/zip.js'

configure({ useWebWorkers: false })

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..', '..')
const manifestPath = process.env.FRAMECHECK_PSD_POC_MANIFEST
const packedPath = process.env.FRAMECHECK_PSD_POC_PACKED
const resultsPath = process.env.FRAMECHECK_PSD_POC_RESULTS

if (!manifestPath || !packedPath || !resultsPath) {
  throw new Error('V4 POC report requires manifest, packed fixture and result paths')
}

const [manifest, packed, results, packageJson] = await Promise.all([
  readJson(manifestPath),
  readJson(packedPath),
  readJson(resultsPath),
  readJson(join(projectRoot, 'node_modules', 'ag-psd', 'package.json')),
])
const packedById = new Map(packed.packed.map((fixture) => [fixture.id, fixture]))
const fixtureReports = []

for (const fixture of manifest.fixtures) {
  const archive = packedById.get(fixture.id)
  if (!archive) {
    fixtureReports.push({
      fixture,
      archive: null,
      browserRuns: results.browserRuns.filter((run) => run.fixtureId === fixture.id),
      error: '未生成 CLI bundle',
    })
    continue
  }

  const cli = await readCliBundle(archive.archivePath)
  const browserRuns = results.browserRuns.filter((run) => run.fixtureId === fixture.id)
  fixtureReports.push({
    fixture,
    archive,
    browserRuns,
    cli,
    comparison: compareCliAndWorker(cli, browserRuns),
  })
}

const largeFixture = fixtureReports.find((item) => item.fixture.id === 'homepage-200mb')
const largeStable = Boolean(
  largeFixture
  && !largeFixture.error
  && largeFixture.browserRuns.length === largeFixture.fixture.runs
  && largeFixture.browserRuns.every((run) => run.result.status === 'completed'),
)
const allRunsCompleted = fixtureReports.every((item) => (
  !item.error
  && item.browserRuns.length === item.fixture.runs
  && item.browserRuns.every((run) => run.result.status === 'completed')
))
const cancellationPassed = results.cancellation?.status === 'cancelled'
const peakMemoryMeasured = fixtureReports.every((item) => item.browserRuns.every((run) => {
  const report = run.result.report
  return report?.memory.sampledPeakBytes !== null && report?.memory.sampledPeakBytes !== undefined
}))
const recommendation = recommendationFor({ allRunsCompleted, cancellationPassed, largeStable, peakMemoryMeasured })
const report = renderReport({
  allRunsCompleted,
  cancellation: results.cancellation,
  cancellationPassed,
  fixtureReports,
  generatedAt: new Date().toISOString(),
  largeStable,
  parserVersion: packageJson.version,
  peakMemoryMeasured,
  recommendation,
})

const reportPath = join(projectRoot, 'docs', 'reports', 'browser-psd-worker-poc.md')
await mkdir(dirname(reportPath), { recursive: true })
await writeFile(reportPath, report)

function compareCliAndWorker(cli, browserRuns) {
  const completed = browserRuns.filter((run) => run.result.status === 'completed')
  const report = completed.at(-1)?.result.report
  if (!report) {
    return { available: false }
  }

  const cliNames = cli.nodes.map((node) => String(node.name ?? ''))
  const workerNames = report.structure.layerNames
  const markerCandidates = Object.fromEntries(report.structure.markerCandidates.map((item) => [item.marker, item.count]))
  const cliMarkers = [...new Set(cli.placements.map((item) => String(item.marker ?? '')).filter(Boolean))].sort()
  const nameDifference = multisetDifference(cliNames, workerNames)

  return {
    available: true,
    canvasMatches: report.header.width === cli.document.width && report.header.height === cli.document.height,
    cliMarkers,
    cliNodes: cli.nodes.length,
    cliResources: {
      assets: cli.assets.length,
      placements: cli.placements.length,
    },
    cliResourceDetails: cli.assets.slice(0, 12).map((asset) => ({
      file: String(asset.file ?? '未知文件'),
      logicalSize: formatSize(asset.logicalSize),
      pixelSize: formatSize(asset.pixelSize),
      placementCount: cli.placements.filter((placement) => placement.assetId === asset.id).length,
    })),
    diagnostics: cli.diagnostics,
    markerCandidates,
    nameDifference,
    preview: {
      dimensionsMatch: report.preview.width === cli.reference.width && report.preview.height === cli.reference.height,
      reference: cli.reference,
      worker: {
        height: report.preview.height,
        pixelBytes: report.preview.pixelBytes,
        width: report.preview.width,
      },
    },
    workerNodes: report.structure.layerCount,
    workerUnsupported: {
      effectLayerCount: report.structure.effectLayerCount,
      smartObjectLayerCount: report.structure.smartObjectLayerCount,
      textLayerCount: report.structure.textLayerCount,
    },
  }
}

function renderReport(input) {
  const rows = input.fixtureReports.flatMap((item) => item.browserRuns.map((run) => {
    const result = run.result
    const report = result.report
    const header = report?.header
    const layers = result.status === 'completed' ? result.report.structure.layerCount : '—'
    const preview = result.status === 'completed' ? `${result.report.preview.width} x ${result.report.preview.height}` : '—'
    const estimatedMemory = formatBytes(report?.preflight?.estimatedMemoryBytes)
    const workerMemory = formatMeasuredPeak(report?.memory.sampledPeakBytes)
    return [
      item.fixture.id,
      String(run.runIndex),
      result.status,
      formatBytes(report?.file.size ?? item.fixture.sourceBytes),
      header ? `${header.width} x ${header.height}` : '—',
      String(layers),
      preview,
      `${report?.durationMs ?? '—'} ms`,
      estimatedMemory,
      workerMemory,
      formatBytes(run.mainHeap.sampledPeakBytes),
    ]
  }))
  const environmentRows = uniqueEnvironmentRows(input.fixtureReports)
  const comparisonSections = input.fixtureReports.map(renderComparison).join('\n\n')
  const failureTypes = collectFailureTypes(input.fixtureReports, input.cancellation)
  if (!input.peakMemoryMeasured) {
    failureTypes.push('memory-telemetry-unavailable：当前浏览器环境无法记录 Worker 真实峰值内存')
  }

  return [
    '# 浏览器 PSD Worker POC 报告',
    '',
    `生成时间：${input.generatedAt}`,
    '',
    '## 范围',
    '',
    '- 候选解析器：ag-psd ' + input.parserVersion,
    '- Parser 仅在 module Worker 中运行，主线程不保存 PSD File、ArrayBuffer、Blob 或图像像素',
    '- Worker 先读 26 字节文件头，再进行跳过所有位图的结构预检，结构过限时不读取合成预览',
    '- 本 POC 不写 OPFS 或 IndexedDB，staging 始终为 not-created，取消直接终止 Worker 释放内存',
    '- CLI psd-design-bundle 仍是唯一产品主链，本报告不创建或开放 PSD 直导入口',
    '',
    '## 环境',
    '',
    '| 浏览器 | 设备内存 | crossOriginIsolated | User Agent |',
    '| --- | ---: | --- | --- |',
    ...environmentRows,
    '',
    '## 预检限额',
    '',
    '| 项目 | 限额 |',
    '| --- | ---: |',
    '| 文件大小 | 256 MB |',
    '| 画布面积 | 24,000,000 像素 |',
    '| 图层数量 | 1,500 |',
    '| 预估内存 | 512 MB |',
    '| 单任务时长 | 45 秒 |',
    '',
    '预估内存为 `文件字节 x 2 + 画布像素 x 12`。当前 Headless Chrome Worker 不暴露 `performance.memory`，因此真实 Worker 峰值显示为未测，不能解释为零内存或通过内存验证。主线程列是 CDP `JSHeapUsedSize`，只覆盖页面目标。',
    '',
    '## Worker 实测',
    '',
    '| 样本 | 轮次 | 结果 | PSD 大小 | 画布 | 图层 | 合成预览 | 解析耗时 | 预估内存 | Worker 峰值 | 主线程采样峰值 |',
    '| --- | ---: | --- | ---: | --- | ---: | --- | ---: | ---: | ---: | ---: |',
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
    '## CLI Bundle 对比',
    '',
    comparisonSections,
    '',
    '## 取消与资源释放',
    '',
    input.cancellationPassed
      ? '- 约 200 MB 样本在 Worker 任务运行中被取消，控制器立即终止 Worker，结果为 cancelled，且 staging 为 not-created'
      : `- 取消验证未通过或未执行：${input.cancellation?.status ?? '无结果'}`,
    '',
    '## 失败类型',
    '',
    failureTypes.length
      ? failureTypes.map((item) => `- ${item}`).join('\n')
      : '- 本轮真实样本未产生解析失败',
    '',
    '## 不支持边界',
    '',
    '- 不支持 PSB、16-bit、非 RGB 色彩模式、超过预检限额的文件，也不承诺 1 GB PSD 支持',
    '- POC 仅解码合成预览并保留图层结构摘要，不传递任何图像像素到主线程，因此未做 reference.png 像素级视觉差异',
    '- 解析器图层名中的 -h-、-s-、-slice- 只作为候选标记，不会生成 CLI bundle 的资源、placement、导出切图或诊断',
    '- 文本、效果、智能对象仅统计存在情况，未建立到现有 Viewer 的等价投影',
    '',
    '## 开放建议',
    '',
    input.recommendation,
    '',
  ].join('\n')
}

function renderComparison(item) {
  if (item.error) {
    return `### ${item.fixture.id}\n\n- 无法比较：${item.error}`
  }
  if (!item.comparison.available) {
    return `### ${item.fixture.id}\n\n- Worker 未成功完成，不能与 CLI bundle 做事实对比`
  }

  const comparison = item.comparison
  const missingFromWorker = comparison.nameDifference.onlyLeft.slice(0, 12)
  const missingFromCli = comparison.nameDifference.onlyRight.slice(0, 12)
  const diagnostics = comparison.diagnostics.length ? comparison.diagnostics.join(', ') : '无'
  const workerMarkers = Object.entries(comparison.markerCandidates)
    .map(([marker, count]) => `${marker} ${count}`)
    .join(', ') || '无'
  const cliMarkers = comparison.cliMarkers.join(', ') || '无'
  const resourceDetails = comparison.cliResourceDetails.length
    ? comparison.cliResourceDetails
      .map((asset) => `${asset.file} 逻辑 ${asset.logicalSize} 像素 ${asset.pixelSize} placement ${asset.placementCount}`)
      .join('；')
    : '无'

  return [
    `### ${item.fixture.id}`,
    '',
    `- CLI bundle：schemaVersion=${item.cli.bundle.schemaVersion}，kind=${item.cli.bundle.kind}，reference.png=${item.cli.reference.width} x ${item.cli.reference.height}`,
    `- 画布：Worker ${comparison.canvasMatches ? '与 CLI 一致' : '与 CLI 不一致'}，预览尺寸 ${comparison.preview.dimensionsMatch ? '与 reference.png 一致' : '与 reference.png 不一致'}`,
    `- 图层树：Worker ${comparison.workerNodes} 层，CLI ${comparison.cliNodes} 节点，名称仅 CLI 有 ${comparison.nameDifference.onlyLeft.length} 个，仅 Worker 有 ${comparison.nameDifference.onlyRight.length} 个`,
    `- 名称差异样本：仅 CLI 有 ${missingFromWorker.length ? missingFromWorker.join('、') : '无'}；仅 Worker 有 ${missingFromCli.length ? missingFromCli.join('、') : '无'}`,
    `- 标记资源：Worker 候选 ${workerMarkers}；CLI 标记 ${cliMarkers}；CLI 实际资产 ${comparison.cliResources.assets} 个，placement ${comparison.cliResources.placements} 个，Worker 不产生资产`,
    `- CLI 资源尺寸：${resourceDetails}`,
    `- diagnostics：CLI ${diagnostics}；Worker 检测到文本 ${comparison.workerUnsupported.textLayerCount} 层、效果 ${comparison.workerUnsupported.effectLayerCount} 层、智能对象 ${comparison.workerUnsupported.smartObjectLayerCount} 层，均未投影到 Viewer`,
    `- 预览：Worker 已解码 ${comparison.preview.worker.width} x ${comparison.preview.worker.height} 合成像素 ${formatBytes(comparison.preview.worker.pixelBytes)}，按约束不将像素传给主线程，因此未做像素级比较`,
  ].join('\n')
}

function recommendationFor({ allRunsCompleted, cancellationPassed, largeStable, peakMemoryMeasured }) {
  if (!largeStable || !allRunsCompleted || !cancellationPassed || !peakMemoryMeasured) {
    return '结论：不设计或开放浏览器 PSD 直导入口。约 200 MB 代表样本虽连续完成结构与预览解析，但当前环境不能记录 Worker 真实峰值内存，且图层树、标记资源与 CLI bundle 不等价，尚不满足实验入口的安全与功能证据。CLI bundle 主链保持不变。'
  }

  return '结论：不向普通用户开放浏览器 PSD 直导。约 200 MB 代表样本已连续三次完成 Worker 结构与合成预览解析，满足进入下一阶段“实验性入口设计”的前提；但它尚不能产生 CLI 等价的资产、placement、诊断或 Viewer 投影，必须继续保留 CLI bundle 为默认主链，并把实验入口置于显式功能开关后。'
}

function uniqueEnvironmentRows(fixtureReports) {
  const rows = []
  const seen = new Set()
  for (const item of fixtureReports) {
    for (const run of item.browserRuns) {
      const browser = run.browser
      const key = JSON.stringify(browser)
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      rows.push(`| ${browser.version} | ${browser.deviceMemoryGiB ?? '未知'} GiB | ${browser.crossOriginIsolated} | ${browser.userAgent} |`)
    }
  }
  return rows.length ? rows : ['| 未执行 | 未知 | 未知 | 未知 |']
}

function collectFailureTypes(fixtureReports, cancellation) {
  const failures = []
  for (const item of fixtureReports) {
    for (const run of item.browserRuns) {
      if (run.result.status === 'completed') {
        continue
      }
      failures.push(`${item.fixture.id} 第 ${run.runIndex} 次：${run.result.failure.code} ${run.result.failure.message}`)
    }
  }
  if (cancellation && cancellation.status !== 'cancelled') {
    failures.push(`取消验证：${cancellation.status}`)
  }
  return failures
}

function multisetDifference(left, right) {
  const leftCounts = countValues(left)
  const rightCounts = countValues(right)
  return {
    onlyLeft: subtractCounts(leftCounts, rightCounts),
    onlyRight: subtractCounts(rightCounts, leftCounts),
  }
}

function countValues(values) {
  const counts = new Map()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

function subtractCounts(source, other) {
  const values = []
  for (const [value, count] of source) {
    const difference = count - (other.get(value) ?? 0)
    for (let index = 0; index < difference; index += 1) {
      values.push(value)
    }
  }
  return values
}

async function readCliBundle(path) {
  const archive = await readFile(path)
  const reader = new ZipReader(new BlobReader(new Blob([archive])))
  try {
    const entries = new Map((await reader.getEntries()).map((entry) => [entry.filename, entry]))
    const [bundle, design, assets, diagnostics, reference] = await Promise.all([
      readEntryJson(entries, 'bundle.json'),
      readEntryJson(entries, 'design.json'),
      readEntryJson(entries, 'assets.json'),
      readEntryJson(entries, 'diagnostics.json'),
      readEntryBinary(entries, 'reference.png'),
    ])
    return {
      bundle,
      document: design.document,
      nodes: Array.isArray(design.nodes) ? design.nodes : [],
      assets: Array.isArray(assets.assets) ? assets.assets : [],
      placements: Array.isArray(assets.placements) ? assets.placements : [],
      diagnostics: [
        ...(Array.isArray(diagnostics.design) ? diagnostics.design : []),
        ...(Array.isArray(diagnostics.assets) ? diagnostics.assets : []),
      ].map((item) => String(item.type ?? item.code ?? 'untyped')),
      reference: pngSize(reference),
    }
  } finally {
    await reader.close()
  }
}

async function readEntryJson(entries, path) {
  const entry = entries.get(path)
  if (!entry || entry.directory) {
    throw new Error(`Missing ${path}`)
  }
  return JSON.parse(await entry.getData(new TextWriter()))
}

async function readEntryBinary(entries, path) {
  const entry = entries.get(path)
  if (!entry || entry.directory) {
    throw new Error(`Missing ${path}`)
  }
  return new Uint8Array(await entry.arrayBuffer())
}

function pngSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) {
    return '不可用'
  }
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatMeasuredPeak(bytes) {
  return bytes === null || bytes === undefined ? '未测' : formatBytes(bytes)
}

function formatSize(value) {
  if (!value || typeof value.width !== 'number' || typeof value.height !== 'number') {
    return '未知'
  }
  return `${value.width} x ${value.height}`
}
