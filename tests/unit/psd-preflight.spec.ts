import { describe, expect, it } from 'vitest'
import {
  assertPsdFileSize,
  assertPsdPreflight,
  inspectPsdHeader,
  PsdPocError,
  psdPocLimits,
} from '../../src/features/psd-poc/psd-preflight'

function headerBuffer({
  version = 1,
  channels = 4,
  height = 1_128,
  width = 1_624,
  bitsPerChannel = 8,
  colorMode = 3,
}: Partial<{
  bitsPerChannel: number
  channels: number
  colorMode: number
  height: number
  version: number
  width: number
}> = {}): ArrayBuffer {
  const bytes = new ArrayBuffer(26)
  const view = new DataView(bytes)
  for (const [index, value] of [...'8BPS'].entries()) {
    view.setUint8(index, value.charCodeAt(0))
  }
  view.setUint16(4, version, false)
  view.setUint16(12, channels, false)
  view.setUint32(14, height, false)
  view.setUint32(18, width, false)
  view.setUint16(22, bitsPerChannel, false)
  view.setUint16(24, colorMode, false)
  return bytes
}

describe('PSD POC 文件头预检', () => {
  it('只从 26 字节文件头提取 PSD 尺寸与格式', () => {
    expect(inspectPsdHeader(headerBuffer())).toEqual({
      signature: '8BPS',
      version: 1,
      channels: 4,
      height: 1_128,
      width: 1_624,
      bitsPerChannel: 8,
      colorMode: 3,
    })
  })

  it('在读取完整文件前拒绝 PSB 和超限输入', () => {
    expectPocError(() => assertPsdPreflight(
      inspectPsdHeader(headerBuffer({ version: 2 })),
      1,
      psdPocLimits,
    ), 'unsupported-psb')
    expectPocError(() => assertPsdFileSize('large.psd', psdPocLimits.maxFileBytes + 1, psdPocLimits), 'limits-exceeded')
  })

  it('拒绝未受 POC 评估的色深和色彩模式', () => {
    expectPocError(() => assertPsdPreflight(
      inspectPsdHeader(headerBuffer({ bitsPerChannel: 16 })),
      1,
      psdPocLimits,
    ), 'unsupported-bit-depth')
    expectPocError(() => assertPsdPreflight(
      inspectPsdHeader(headerBuffer({ colorMode: 4 })),
      1,
      psdPocLimits,
    ), 'unsupported-color-mode')
  })

  it('限制画布面积和保守内存预算', () => {
    expectPocError(() => assertPsdPreflight(
      inspectPsdHeader(headerBuffer({ width: 10_000, height: 10_000 })),
      1,
      psdPocLimits,
    ), 'limits-exceeded')
    expectPocError(() => assertPsdPreflight(
      inspectPsdHeader(headerBuffer()),
      psdPocLimits.maxEstimatedMemoryBytes,
      psdPocLimits,
    ), 'limits-exceeded')
  })
})

function expectPocError(action: () => void, code: PsdPocError['code']): void {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(PsdPocError)
    expect((error as PsdPocError).code).toBe(code)
    return
  }

  throw new Error(`Expected PsdPocError ${code}`)
}
