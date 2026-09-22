import {
  BrowserMockAdapter,
  isTauriRuntime,
  TauriConversionPathChooser,
  TauriDesktopJobAdapter,
  TauriGeneratedBundleReader,
  TauriOutputDirectoryOpener,
  type DesktopJobModule,
  type GeneratedBundleReader,
} from '../desktop-bridge'
import { setGeneratedBundleReader } from '../features/bundle/bundle-repository'
import type {
  ConversionOutputDirectoryOpener,
  ConversionPathChooser,
} from '../features/conversion/conversion-types'

export interface DesktopComposition {
  isDesktop: boolean
  jobModule: DesktopJobModule
  generatedBundleReader: GeneratedBundleReader
  pathChooser?: ConversionPathChooser
  outputDirectoryOpener?: ConversionOutputDirectoryOpener
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

  composition = {
    isDesktop,
    jobModule,
    generatedBundleReader,
    pathChooser,
    outputDirectoryOpener,
  }
  setGeneratedBundleReader(generatedBundleReader)
  return composition
}
