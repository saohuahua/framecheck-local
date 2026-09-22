import type { DesktopJob, DesktopJobModule, StartJobRequest } from './desktop-job-port'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class MockDesktopJobModule implements DesktopJobModule {
  readonly requests: StartJobRequest[] = []

  private readonly jobs = new Map<string, DesktopJob>()

  private readonly order: string[] = []

  async start(request: StartJobRequest): Promise<{ jobId: string }> {
    if (this.jobs.has(request.taskId)) {
      throw new Error('任务 ID 已存在')
    }

    const job: DesktopJob = {
      jobId: request.taskId,
      status: 'queued',
      request: clone(request),
      createdAt: Date.now(),
      events: [],
      artifacts: [],
    }
    this.requests.push(clone(request))
    this.jobs.set(job.jobId, job)
    this.order.unshift(job.jobId)
    return { jobId: job.jobId }
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new Error('任务不存在')
    }
    job.status = 'cancelled'
    job.finishedAt = Date.now()
    job.events.push({ type: 'cancelled', taskId: jobId })
  }

  async get(jobId: string): Promise<DesktopJob> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new Error('任务不存在')
    }
    return clone(job)
  }

  async listRecent(): Promise<DesktopJob[]> {
    return this.order
      .map((jobId) => this.jobs.get(jobId))
      .filter((job): job is DesktopJob => Boolean(job))
      .map(clone)
  }

  setJob(job: DesktopJob): void {
    this.jobs.set(job.jobId, clone(job))
    if (!this.order.includes(job.jobId)) {
      this.order.unshift(job.jobId)
    }
  }
}
