export type PsdPocFailureCode =
  | 'cancelled'
  | 'invalid-file'
  | 'invalid-header'
  | 'limits-exceeded'
  | 'parser-failed'
  | 'timed-out'
  | 'unsupported-bit-depth'
  | 'unsupported-color-mode'
  | 'unsupported-psb'
  | 'worker-failed'

export interface PsdPocLimits {
  maxCanvasPixels: number
  maxEstimatedMemoryBytes: number
  maxFileBytes: number
  maxLayerCount: number
  maxTaskDurationMs: number
}

export interface PsdHeaderSummary {
  bitsPerChannel: number
  channels: number
  colorMode: number
  height: number
  signature: string
  version: number
  width: number
}

export interface PsdPreflightSummary {
  estimatedMemoryBytes: number
  header: PsdHeaderSummary
}

export const psdPocLimits: PsdPocLimits = {
  maxCanvasPixels: 24_000_000,
  maxEstimatedMemoryBytes: 512 * 1024 * 1024,
  maxFileBytes: 256 * 1024 * 1024,
  maxLayerCount: 1_500,
  maxTaskDurationMs: 45_000,
}

export class PsdPocError extends Error {
  readonly code: PsdPocFailureCode

  constructor(
    code: PsdPocFailureCode,
    message: string,
  ) {
    super(message)
    this.code = code
    this.name = 'PsdPocError'
  }
}

export function assertPsdFileSize(fileName: string, fileSize: number, limits: PsdPocLimits): void {
  if (!fileName.toLowerCase().endsWith('.psd')) {
    throw new PsdPocError('invalid-file', 'POC 仅接受 .psd 文件')
  }

  if (fileSize <= 0) {
    throw new PsdPocError('invalid-file', 'PSD 文件为空')
  }

  if (fileSize > limits.maxFileBytes) {
    throw new PsdPocError('limits-exceeded', `PSD 文件超过 ${formatMiB(limits.maxFileBytes)} MB POC 上限`)
  }
}

export function inspectPsdHeader(bytes: ArrayBuffer): PsdHeaderSummary {
  if (bytes.byteLength < 26) {
    throw new PsdPocError('invalid-header', 'PSD 文件头不足 26 字节')
  }

  const view = new DataView(bytes)
  const signature = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  )

  if (signature !== '8BPS') {
    throw new PsdPocError('invalid-header', 'PSD 文件头签名不是 8BPS')
  }

  for (let index = 6; index < 12; index += 1) {
    if (view.getUint8(index) !== 0) {
      throw new PsdPocError('invalid-header', 'PSD 文件头保留字段不合法')
    }
  }

  return {
    signature,
    version: view.getUint16(4, false),
    channels: view.getUint16(12, false),
    height: view.getUint32(14, false),
    width: view.getUint32(18, false),
    bitsPerChannel: view.getUint16(22, false),
    colorMode: view.getUint16(24, false),
  }
}

export function assertPsdPreflight(
  header: PsdHeaderSummary,
  fileSize: number,
  limits: PsdPocLimits,
): PsdPreflightSummary {
  if (header.version === 2) {
    throw new PsdPocError('unsupported-psb', 'ag-psd POC 不支持 PSB 大型文档格式')
  }

  if (header.version !== 1) {
    throw new PsdPocError('invalid-header', `PSD 版本 ${header.version} 不受支持`)
  }

  if (header.channels < 1 || header.channels > 16 || header.width === 0 || header.height === 0) {
    throw new PsdPocError('invalid-header', 'PSD 图层通道或画布尺寸不合法')
  }

  if (header.bitsPerChannel !== 8) {
    throw new PsdPocError('unsupported-bit-depth', 'ag-psd POC 仅评估 8-bit PSD')
  }

  if (header.colorMode !== 3) {
    throw new PsdPocError('unsupported-color-mode', 'ag-psd POC 仅评估 RGB 色彩模式')
  }

  const canvasPixels = header.width * header.height
  if (canvasPixels > limits.maxCanvasPixels) {
    throw new PsdPocError('limits-exceeded', `PSD 画布超过 ${limits.maxCanvasPixels.toLocaleString()} 像素 POC 上限`)
  }

  // 输入缓冲与合成预览使用保守预算
  const estimatedMemoryBytes = fileSize * 2 + canvasPixels * 12
  if (estimatedMemoryBytes > limits.maxEstimatedMemoryBytes) {
    throw new PsdPocError('limits-exceeded', `PSD 预估内存超过 ${formatMiB(limits.maxEstimatedMemoryBytes)} MB POC 上限`)
  }

  return { header, estimatedMemoryBytes }
}

function formatMiB(bytes: number): string {
  return String(Math.round(bytes / 1024 / 1024))
}
