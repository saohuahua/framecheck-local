import { initializeCanvas, readPsd, type Layer } from 'ag-psd'
import {
  assertPsdFileSize,
  assertPsdPreflight,
  inspectPsdHeader,
  PsdPocError,
  type PsdHeaderSummary,
} from './psd-preflight'
import type {
  PsdPocFailure,
  PsdPocFailureReport,
  PsdPocMarkerCandidate,
  PsdPocMemorySample,
  PsdPocReport,
  PsdPocStructureSummary,
  PsdPocWorkerRequest,
  PsdPocWorkerResponse,
} from './psd-poc-protocol'

interface WorkerTask {
  cancelled: boolean
}

interface MemoryState {
  method: 'performance.memory' | 'unavailable'
  samples: PsdPocMemorySample[]
}

interface PsdWorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<PsdPocWorkerRequest>) => void,
  ): void
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const tasks = new Map<string, WorkerTask>()
const workerScope = self as unknown as PsdWorkerScope

workerScope.addEventListener('message', (event: MessageEvent<PsdPocWorkerRequest>) => {
  void handleMessage(event.data)
})

async function handleMessage(message: PsdPocWorkerRequest): Promise<void> {
  if (message.type === 'cancel') {
    const task = tasks.get(message.jobId)
    if (task) {
      task.cancelled = true
    }
    return
  }

  await runPsdPoc(message)
}

async function runPsdPoc(message: Extract<PsdPocWorkerRequest, { type: 'start' }>): Promise<void> {
  const task: WorkerTask = { cancelled: false }
  const memory: MemoryState = { method: memoryMethod(), samples: [] }
  const startedAt = performance.now()
  let header: PsdHeaderSummary | undefined
  let preflight: PsdPocReport['preflight'] | undefined
  let stage: PsdPocFailure['stage'] = 'setup'
  tasks.set(message.jobId, task)

  try {
    if (typeof OffscreenCanvas === 'undefined') {
      throw new PsdPocError('worker-failed', '当前 Worker 不支持 OffscreenCanvas')
    }
    // 仅为 Worker 内 ImageData 解码提供画布工厂
    initializeCanvas((width, height) => (
      new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement
    ))
    assertPsdFileSize(message.file.name, message.file.size, message.limits)
    stage = 'header'
    postProgress(message.jobId, stage, '读取 PSD 文件头')
    const headerBytes = await message.file.slice(0, 26).arrayBuffer()
    assertNotCancelled(task)
    header = inspectPsdHeader(headerBytes)
    const validatedPreflight = assertPsdPreflight(header, message.file.size, message.limits)
    preflight = validatedPreflight
    sampleMemory(memory, 'after-header')

    // 用 transfer list 发送非像素文件头
    post({ type: 'preflight', jobId: message.jobId, preflight, headerBytes }, [headerBytes])
    assertNotCancelled(task)

    stage = 'structure'
    postProgress(message.jobId, stage, '读取 PSD 结构且跳过位图')
    const source = await message.file.arrayBuffer()
    assertNotCancelled(task)
    sampleMemory(memory, 'after-buffer')

    // 结构预检不解码图层或合成像素
    let structureDocument: ReturnType<typeof readPsd> | undefined = readPsd(source, {
      skipCompositeImageData: true,
      skipLayerImageData: true,
      skipLinkedFilesData: true,
      skipThumbnail: true,
    })
    assertParsedDimensions(structureDocument, validatedPreflight.header)
    const structure = summarizeStructure(structureDocument.children ?? [])
    if (structure.layerCount > message.limits.maxLayerCount) {
      throw new PsdPocError('limits-exceeded', `PSD 图层超过 ${message.limits.maxLayerCount} 层 POC 上限`)
    }
    sampleMemory(memory, 'after-structure')
    structureDocument = undefined
    assertNotCancelled(task)

    stage = 'preview'
    postProgress(message.jobId, stage, '解码合成预览且跳过图层像素')
    const previewDocument = readPsd(source, {
      skipLayerImageData: true,
      skipLinkedFilesData: true,
      skipThumbnail: true,
      totalMemoryLimit: message.limits.maxEstimatedMemoryBytes,
      useImageData: true,
    })
    assertParsedDimensions(previewDocument, validatedPreflight.header)
    const imageData = previewDocument.imageData
    if (!imageData) {
      throw new PsdPocError('parser-failed', 'ag-psd 未返回合成预览像素')
    }

    const preview = {
      status: 'decoded' as const,
      width: imageData.width,
      height: imageData.height,
      pixelBytes: imageData.data.byteLength,
      sampledChecksum: sampledChecksum(imageData.data),
    }
    sampleMemory(memory, 'after-preview')
    assertNotCancelled(task)

    if (!header || !preflight) {
      throw new PsdPocError('parser-failed', 'PSD POC 未生成完整预检结果')
    }

    const report: PsdPocReport = {
      durationMs: Math.round(performance.now() - startedAt),
      file: { name: message.file.name, size: message.file.size },
      header,
      limits: message.limits,
      memory: toMemoryReport(memory),
      preflight,
      preview,
      storage: { staging: 'not-created' },
      structure,
    }
    post({ type: 'complete', jobId: message.jobId, report })
  } catch (error) {
    const failure = toFailure(error, stage)
    const report = failureReport(message, startedAt, header, preflight, memory)
    post(failure.code === 'cancelled'
      ? { type: 'cancelled', jobId: message.jobId, report }
      : { type: 'failed', jobId: message.jobId, failure, report })
  } finally {
    tasks.delete(message.jobId)
  }
}

function post(message: PsdPocWorkerResponse, transfer: Transferable[] = []): void {
  workerScope.postMessage(message, transfer)
}

function postProgress(
  jobId: string,
  stage: Extract<PsdPocFailure['stage'], 'header' | 'structure' | 'preview'>,
  message: string,
): void {
  post({ type: 'progress', jobId, stage, message })
}

function assertNotCancelled(task: WorkerTask): void {
  if (task.cancelled) {
    throw new PsdPocError('cancelled', 'PSD POC 已取消')
  }
}

function assertParsedDimensions(
  document: Pick<ReturnType<typeof readPsd>, 'height' | 'width'>,
  header: PsdHeaderSummary,
): void {
  if (document.width !== header.width || document.height !== header.height) {
    throw new PsdPocError('parser-failed', 'ag-psd 解析尺寸与 PSD 文件头不一致')
  }
}

function summarizeStructure(layers: Layer[]): PsdPocStructureSummary {
  const names: string[] = []
  const markerNames = new Map<PsdPocMarkerCandidate['marker'], string[]>([
    ['-h-', []],
    ['-s-', []],
    ['-slice-', []],
  ])
  let effectLayerCount = 0
  let groupCount = 0
  let layerCount = 0
  let smartObjectLayerCount = 0
  let textLayerCount = 0

  const visit = (items: Layer[]): void => {
    for (const layer of items) {
      layerCount += 1
      const name = layer.name ?? ''
      names.push(name)
      if (layer.children?.length) {
        groupCount += 1
        visit(layer.children)
      }
      if (layer.text) {
        textLayerCount += 1
      }
      if (layer.effects) {
        effectLayerCount += 1
      }
      if (layer.placedLayer) {
        smartObjectLayerCount += 1
      }
      for (const marker of markerNames.keys()) {
        if (name.toLowerCase().includes(marker)) {
          markerNames.get(marker)?.push(name)
        }
      }
    }
  }

  visit(layers)
  return {
    effectLayerCount,
    groupCount,
    layerCount,
    layerNames: names,
    markerCandidates: [...markerNames.entries()]
      .filter(([, namesForMarker]) => namesForMarker.length > 0)
      .map(([marker, namesForMarker]) => ({
        marker,
        count: namesForMarker.length,
        names: namesForMarker,
      })),
    smartObjectLayerCount,
    textLayerCount,
  }
}

function sampledChecksum(bytes: ArrayLike<number>): string {
  const stride = Math.max(1, Math.floor(bytes.length / 4_096))
  let hash = 2_166_136_261
  for (let index = 0; index < bytes.length; index += stride) {
    hash ^= bytes[index]
    hash = Math.imul(hash, 16_777_619)
  }
  return `${hash >>> 0}`
}

function toFailure(error: unknown, stage: PsdPocFailure['stage']): PsdPocFailure {
  if (error instanceof PsdPocError) {
    return { code: error.code, message: error.message, stage }
  }

  return {
    code: 'parser-failed',
    message: error instanceof Error ? error.message : 'ag-psd 解析失败',
    stage,
  }
}

function failureReport(
  message: Extract<PsdPocWorkerRequest, { type: 'start' }>,
  startedAt: number,
  header: PsdHeaderSummary | undefined,
  preflight: PsdPocReport['preflight'] | undefined,
  memory: MemoryState,
): PsdPocFailureReport {
  return {
    durationMs: Math.round(performance.now() - startedAt),
    file: { name: message.file.name, size: message.file.size },
    header,
    preflight,
    memory: toMemoryReport(memory),
    storage: { staging: 'not-created' },
  }
}

function memoryMethod(): MemoryState['method'] {
  return readHeapBytes() === null ? 'unavailable' : 'performance.memory'
}

function sampleMemory(memory: MemoryState, label: PsdPocMemorySample['label']): void {
  memory.samples.push({ label, bytes: readHeapBytes() })
}

function toMemoryReport(memory: MemoryState): PsdPocReport['memory'] {
  const values = memory.samples
    .map((sample) => sample.bytes)
    .filter((value): value is number => value !== null)
  return {
    method: memory.method,
    samples: memory.samples,
    sampledPeakBytes: values.length ? Math.max(...values) : null,
  }
}

function readHeapBytes(): number | null {
  const performanceWithMemory = performance as Performance & {
    memory?: { usedJSHeapSize?: number }
  }
  return performanceWithMemory.memory?.usedJSHeapSize ?? null
}
