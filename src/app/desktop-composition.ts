import {
  BrowserMockAdapter,
  isTauriRuntime,
  TauriConversionPathChooser,
  TauriDesktopJobAdapter,
  TauriGeneratedBundleReader,
  TauriOutputDirectoryOpener,
  TauriVueExportProjectWriter,
  TauriVueExportTargetChooser,
  type DesktopJobModule,
  type GeneratedBundleReader,
} from '../desktop-bridge'
import { setGeneratedBundleReader } from '../features/bundle/bundle-repository'
import type {
  ConversionOutputDirectoryOpener,
  ConversionPathChooser,
} from '../features/conversion/conversion-types'
import type { VueExportPort } from '../features/codegen/vue-export-port'

export interface DesktopComposition {
  isDesktop: boolean
  jobModule: DesktopJobModule
  generatedBundleReader: GeneratedBundleReader
  pathChooser?: ConversionPathChooser
  outputDirectoryOpener?: ConversionOutputDirectoryOpener
  /** Vue 静态页导出能力（写入目标项目 + 目录选择）；仅桌面端可用 */
  vueExport?: VueExportPort
}

let composition: DesktopComposition | undefined

export function getDesktopComposition(): DesktopComposition {
  if (composition) {
    return composition
  }

  // 浏览器环境不触发原生调用
  const isDesktop = isTauriRuntime()
  const browserMock = new BrowserMockAdapter()
  const jobModule = isDesktop ? new TauriDesktopJobAdapter() : browserMock
  const generatedBundleReader = isDesktop ? new TauriGeneratedBundleReader() : browserMock
  const pathChooser = isDesktop ? new TauriConversionPathChooser() : undefined
  const outputDirectoryOpener = isDesktop ? new TauriOutputDirectoryOpener() : undefined
  // 写入目标项目是桌面端独有能力（浏览器端按钮置灰，与转换页同模式）
  const vueExport = isDesktop
    ? { writer: new TauriVueExportProjectWriter(), chooser: new TauriVueExportTargetChooser() }
    : undefined

  composition = {
    isDesktop,
    jobModule,
    generatedBundleReader,
    pathChooser,
    outputDirectoryOpener,
    vueExport,
  }
  setGeneratedBundleReader(generatedBundleReader)
  return composition
}
