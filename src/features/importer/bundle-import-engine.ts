import { BundleError, type PortableBundleSummary } from '../bundle/types'
import type { ImportWorkerRequest, ImportWorkerResponse } from './import-protocol'

export interface ImportEngineProgress {
  stage: 'checking' | 'validating' | 'extracting'
  completed: number
  total: number
  message: string
}

export class BundleImportEngine {
  private readonly worker = new Worker(
    new URL('./bundle-import.worker.ts', import.meta.url),
    { type: 'module' },
  )
  private readonly listeners = new Map<string, (message: ImportWorkerResponse) => void>()

  constructor() {
    this.worker.addEventListener('message', (event: MessageEvent<ImportWorkerResponse>) => {
      this.listeners.get(event.data.jobId)?.(event.data)
    })
  }

  async prepare(
    jobId: string,
    file: File,
    onProgress: (progress: ImportEngineProgress) => void,
  ): Promise<PortableBundleSummary> {
    const pending = this.waitFor(jobId, onProgress, 'validated')
    this.post({ type: 'prepare', jobId, file })
    return pending
  }

  async extract(
    jobId: string,
    stagingPrefix: string,
    onProgress: (progress: ImportEngineProgress) => void,
  ): Promise<void> {
    const pending = this.waitForExtract(jobId, onProgress)
    this.post({ type: 'extract', jobId, stagingPrefix })
    return pending
  }

  cancel(jobId: string) {
    this.post({ type: 'cancel', jobId })
  }

  terminate() {
    this.worker.terminate()
    this.listeners.clear()
  }

  private post(message: ImportWorkerRequest) {
    this.worker.postMessage(message)
  }

  private waitFor(
    jobId: string,
    onProgress: (progress: ImportEngineProgress) => void,
    successType: 'validated' | 'extracted',
  ): Promise<PortableBundleSummary> {
    return new Promise((resolve, reject) => {
      this.listeners.set(jobId, (message) => {
        if (message.type === 'progress') {
          onProgress(message)
          return
        }

        this.listeners.delete(jobId)
        if (message.type === successType && message.type === 'validated') {
          resolve(message.summary)
          return
        }

        if (message.type === 'cancelled') {
          reject(new BundleError('cancelled', '导入已取消'))
          return
        }

        if (message.type === 'failed') {
          reject(new BundleError(message.error.code, message.error.message))
        }
      })
    })
  }

  private waitForExtract(
    jobId: string,
    onProgress: (progress: ImportEngineProgress) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.listeners.set(jobId, (message) => {
        if (message.type === 'progress') {
          onProgress(message)
          return
        }

        this.listeners.delete(jobId)
        if (message.type === 'extracted') {
          resolve()
          return
        }

        if (message.type === 'cancelled') {
          reject(new BundleError('cancelled', '导入已取消'))
          return
        }

        if (message.type === 'failed') {
          reject(new BundleError(message.error.code, message.error.message))
        }
      })
    })
  }
}
