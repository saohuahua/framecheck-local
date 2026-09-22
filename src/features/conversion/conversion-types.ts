export interface ConversionPathChooser {
  chooseSource(): Promise<string | undefined>
  chooseOutput(): Promise<string | undefined>
}

export interface ConversionOutputDirectoryOpener {
  openOutputDirectory(jobId: string): Promise<void>
}

export type GeneratedBundleImportState =
  | { jobId: string; status: 'idle' | 'opening' | 'opened' }
  | { jobId: string; status: 'failed'; code?: string; message: string }
