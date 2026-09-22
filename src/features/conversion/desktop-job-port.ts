export type DesktopDeliverable = 'delivery' | 'html'

export type DesktopJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface StartJobRequest {
  protocolVersion: '1'
  taskId: string
  sourcePath: string
  outputDir: string
  deliverables: DesktopDeliverable[]
  bundleCompressed: boolean
  scales: number[]
  tokenTop: number
  cssStyle: string
  cssPrettyEnabled: boolean
  smartMergeEnabled: boolean
  imageLayerFlattenEnabled: boolean
}

export interface DesktopArtifact {
  artifactId: string
  kind: string
  label: string
}

export interface DesktopFailure {
  code: string
  message: string
  stage?: string
}

export type DesktopJobEvent =
  | { type: 'started'; taskId: string; total: number; sourceName: string }
  | { type: 'stage'; key: string; label: string; current: number; total: number }
  | { type: 'log'; stream: 'stdout' | 'stderr'; message: string }
  | { type: 'warning'; code: string; message: string }
  | { type: 'artifact'; artifactId: string; kind: string; label: string }
  | { type: 'completed'; taskId: string; outputDir: string; artifacts: DesktopArtifact[] }
  | { type: 'failed'; taskId: string; code: string; message: string; stage: string }
  | { type: 'cancelled'; taskId: string }

export interface DesktopJob {
  jobId: string
  status: DesktopJobStatus
  request: StartJobRequest
  createdAt: number
  startedAt?: number
  finishedAt?: number
  sourceName?: string
  events: DesktopJobEvent[]
  artifacts: DesktopArtifact[]
  failure?: DesktopFailure
}

export interface DesktopJobModule {
  start(request: StartJobRequest): Promise<{ jobId: string }>
  cancel(jobId: string): Promise<void>
  get(jobId: string): Promise<DesktopJob>
  listRecent(): Promise<DesktopJob[]>
}
