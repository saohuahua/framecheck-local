import {
  PsdPocError,
  psdPocLimits,
  type PsdHeaderSummary,
  type PsdPocLimits,
  type PsdPreflightSummary,
} from './psd-preflight'
import type {
  PsdPocFailure,
  PsdPocFailureReport,
  PsdPocReport,
  PsdPocStage,
  PsdPocWorkerRequest,
  PsdPocWorkerResponse,
} from './psd-poc-protocol'

export interface PsdPocProgress {
  message: string
  preflight?: PsdPreflightSummary
  stage: PsdPocStage
}

export type PsdPocRunResult =
  | {
      report: PsdPocReport
      status: 'completed'
    }
  | {
      failure: PsdPocFailure
      report?: PsdPocFailureReport
      status: 'cancelled' | 'failed' | 'timed-out'
    }

interface ActiveTask {
  file: {
    name: string
    size: number
  }
  header?: PsdHeaderSummary
  jobId: string
  onProgress?: (progress: PsdPocProgress) => void
  preflight?: PsdPreflightSummary
  resolve: (result: PsdPocRunResult) => void
  startedAt: number
  timer: number
  worker: Worker
}

export interface PsdPocControllerOptions {
  createWorker?: () => Worker
  limits?: PsdPocLimits
}

export class PsdPocController {
  private activeTask: ActiveTask | undefined
  private readonly createWorker: () => Worker
  private readonly limits: PsdPocLimits

  constructor(options: PsdPocControllerOptions = {}) {
    this.limits = options.limits ?? psdPocLimits
    this.createWorker = options.createWorker ?? (() => new Worker(
      new URL('./psd-parser.worker.ts', import.meta.url),
      { type: 'module' },
    ))
  }

  run(file: File, onProgress?: (progress: PsdPocProgress) => void): Promise<PsdPocRunResult> {
    if (this.activeTask) {
      throw new PsdPocError('worker-failed', '已有 PSD POC 任务正在运行')
    }

    const worker = this.createWorker()
    const jobId = crypto.randomUUID()

    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.finishTimedOut(jobId)
      }, this.limits.maxTaskDurationMs)
      const task: ActiveTask = {
        jobId,
        worker,
        timer,
        resolve,
        startedAt: performance.now(),
        file: { name: file.name, size: file.size },
        onProgress,
      }
      this.activeTask = task
      worker.addEventListener('message', (event: MessageEvent<PsdPocWorkerResponse>) => {
        this.handleWorkerMessage(event.data)
      })
      worker.addEventListener('error', (event) => {
        this.finishFailure(jobId, {
          code: 'worker-failed',
          message: event.message || 'PSD POC Worker 发生未知错误',
          stage: 'setup',
        })
      })

      const message: PsdPocWorkerRequest = { type: 'start', jobId, file, limits: this.limits }
      worker.postMessage(message)
    })
  }

  cancel(): void {
    const task = this.activeTask
    if (!task) {
      return
    }

    task.worker.postMessage({ type: 'cancel', jobId: task.jobId } satisfies PsdPocWorkerRequest)
    this.finish(task, {
      status: 'cancelled',
      failure: {
        code: 'cancelled',
        message: 'PSD POC 已取消并终止 Worker',
        stage: 'setup',
      },
      report: {
        durationMs: Math.round(performance.now() - task.startedAt),
        file: task.file,
        header: task.header,
        preflight: task.preflight,
        memory: { method: 'unavailable', samples: [], sampledPeakBytes: null },
        storage: { staging: 'not-created' },
      },
    })
  }

  dispose(): void {
    this.cancel()
  }

  private handleWorkerMessage(message: PsdPocWorkerResponse): void {
    const task = this.activeTask
    if (!task || task.jobId !== message.jobId) {
      return
    }

    if (message.type === 'preflight') {
      task.header = message.preflight.header
      task.preflight = message.preflight
      // 传输的头部字节不进入控制器状态
      task.onProgress?.({ stage: 'header', message: 'PSD 文件头预检通过', preflight: message.preflight })
      return
    }

    if (message.type === 'progress') {
      task.onProgress?.(message)
      return
    }

    if (message.type === 'complete') {
      this.finish(task, { status: 'completed', report: message.report })
      return
    }

    if (message.type === 'cancelled') {
      this.finish(task, {
        status: 'cancelled',
        failure: { code: 'cancelled', message: 'PSD POC 已取消', stage: 'setup' },
        report: message.report,
      })
      return
    }

    this.finish(task, { status: 'failed', failure: message.failure, report: message.report })
  }

  private finishTimedOut(jobId: string): void {
    this.finishFailure(jobId, {
      code: 'timed-out',
      message: `PSD POC 超过 ${this.limits.maxTaskDurationMs / 1000} 秒时限`,
      stage: 'setup',
    })
  }

  private finishFailure(jobId: string, failure: PsdPocFailure): void {
    const task = this.activeTask
    if (!task || task.jobId !== jobId) {
      return
    }

    this.finish(task, {
      status: failure.code === 'timed-out' ? 'timed-out' : 'failed',
      failure,
      report: {
        durationMs: Math.round(performance.now() - task.startedAt),
        file: task.file,
        header: task.header,
        preflight: task.preflight,
        memory: { method: 'unavailable', samples: [], sampledPeakBytes: null },
        storage: { staging: 'not-created' },
      },
    })
  }

  private finish(task: ActiveTask, result: PsdPocRunResult): void {
    if (this.activeTask?.jobId !== task.jobId) {
      return
    }

    window.clearTimeout(task.timer)
    task.worker.terminate()
    this.activeTask = undefined
    task.resolve(result)
  }
}
