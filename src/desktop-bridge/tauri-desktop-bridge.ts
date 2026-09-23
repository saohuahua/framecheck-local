import {
  DesktopBridgeUnavailableError,
  desktopJobEventName,
  type DesktopArtifact,
  type DesktopFailure,
  type DesktopJob,
  type DesktopJobEvent,
  type DesktopJobEventListener,
  type DesktopJobEventSource,
  type DesktopJobModule,
  type DesktopOutputDirectoryOpener,
  type DesktopJobStatus,
  type DesktopVueExportProjectWriter,
  type DesktopVueExportTargetChooser,
  type DesktopVueExportWriteFile,
  type GeneratedBundleReader,
  type StartJobRequest,
} from './types'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error(`${label} 必须是对象`)
  }
  return value
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} 必须是非空字符串`)
  }
  return value
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} 必须是非负整数`)
  }
  return value
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} 必须是布尔值`)
  }
  return value
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} 必须是数组`)
  }
  return value
}

function parseArtifact(value: unknown): DesktopArtifact {
  const raw = record(value, 'artifact')
  return {
    artifactId: string(raw.artifactId, 'artifactId'),
    kind: string(raw.kind, 'artifact.kind'),
    label: string(raw.label, 'artifact.label'),
  }
}

function parseFailure(value: unknown): DesktopFailure {
  const raw = record(value, 'failure')
  const stage = raw.stage === undefined ? undefined : string(raw.stage, 'failure.stage')
  return {
    code: string(raw.code, 'failure.code'),
    message: string(raw.message, 'failure.message'),
    ...(stage === undefined ? {} : { stage }),
  }
}

function parseRequest(value: unknown): StartJobRequest {
  const raw = record(value, 'request')
  const deliverables = array(raw.deliverables, 'request.deliverables').map((item) => {
    const deliverable = string(item, 'request.deliverable')
    if (deliverable !== 'delivery' && deliverable !== 'html') {
      throw new Error('request.deliverable 不受支持')
    }
    return deliverable
  })
  const scales = array(raw.scales, 'request.scales').map((item) => integer(item, 'request.scale'))
  const protocolVersion = string(raw.protocolVersion, 'request.protocolVersion')
  if (protocolVersion !== '1') {
    throw new Error('request.protocolVersion 不受支持')
  }
  return {
    protocolVersion,
    taskId: string(raw.taskId, 'request.taskId'),
    sourcePath: string(raw.sourcePath, 'request.sourcePath'),
    outputDir: string(raw.outputDir, 'request.outputDir'),
    deliverables,
    bundleCompressed: boolean(raw.bundleCompressed, 'request.bundleCompressed'),
    scales,
    tokenTop: integer(raw.tokenTop, 'request.tokenTop'),
    cssStyle: string(raw.cssStyle, 'request.cssStyle'),
    cssPrettyEnabled: boolean(raw.cssPrettyEnabled, 'request.cssPrettyEnabled'),
    smartMergeEnabled: boolean(raw.smartMergeEnabled, 'request.smartMergeEnabled'),
    imageLayerFlattenEnabled: boolean(raw.imageLayerFlattenEnabled, 'request.imageLayerFlattenEnabled'),
    nestedSuppressionEnabled: boolean(raw.nestedSuppressionEnabled, 'request.nestedSuppressionEnabled'),
  }
}

function parseDesktopJobEvent(value: unknown): DesktopJobEvent {
  const raw = record(value, 'event')
  switch (string(raw.type, 'event.type')) {
    case 'started':
      return {
        type: 'started',
        taskId: string(raw.taskId, 'event.taskId'),
        total: integer(raw.total, 'event.total'),
        sourceName: string(raw.sourceName, 'event.sourceName'),
      }
    case 'stage':
      return {
        type: 'stage',
        key: string(raw.key, 'event.key'),
        label: string(raw.label, 'event.label'),
        current: integer(raw.current, 'event.current'),
        total: integer(raw.total, 'event.total'),
      }
    case 'log': {
      const stream = string(raw.stream, 'event.stream')
      if (stream !== 'stdout' && stream !== 'stderr') {
        throw new Error('event.stream 不受支持')
      }
      return { type: 'log', stream, message: string(raw.message, 'event.message') }
    }
    case 'warning':
      return {
        type: 'warning',
        code: string(raw.code, 'event.code'),
        message: string(raw.message, 'event.message'),
      }
    case 'artifact':
      return { type: 'artifact', ...parseArtifact(raw) }
    case 'completed':
      return {
        type: 'completed',
        taskId: string(raw.taskId, 'event.taskId'),
        outputDir: string(raw.outputDir, 'event.outputDir'),
        artifacts: array(raw.artifacts, 'event.artifacts').map(parseArtifact),
      }
    case 'failed':
      return {
        type: 'failed',
        taskId: string(raw.taskId, 'event.taskId'),
        code: string(raw.code, 'event.code'),
        message: string(raw.message, 'event.message'),
        stage: string(raw.stage, 'event.stage'),
      }
    case 'cancelled':
      return { type: 'cancelled', taskId: string(raw.taskId, 'event.taskId') }
    default:
      throw new Error('event.type 不受支持')
  }
}

function parseDesktopJob(value: unknown): DesktopJob {
  const raw = record(value, 'job')
  const status = string(raw.status, 'job.status')
  if (!['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(status)) {
    throw new Error('job.status 不受支持')
  }
  const startedAt = raw.startedAt === undefined ? undefined : integer(raw.startedAt, 'job.startedAt')
  const finishedAt = raw.finishedAt === undefined ? undefined : integer(raw.finishedAt, 'job.finishedAt')
  const sourceName = raw.sourceName === undefined ? undefined : string(raw.sourceName, 'job.sourceName')
  const failure = raw.failure === undefined ? undefined : parseFailure(raw.failure)
  return {
    jobId: string(raw.jobId, 'job.jobId'),
    status: status as DesktopJobStatus,
    request: parseRequest(raw.request),
    createdAt: integer(raw.createdAt, 'job.createdAt'),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
    ...(sourceName === undefined ? {} : { sourceName }),
    events: array(raw.events, 'job.events').map(parseDesktopJobEvent),
    artifacts: array(raw.artifacts, 'job.artifacts').map(parseArtifact),
    ...(failure === undefined ? {} : { failure }),
  }
}

function cloneArtifact(artifact: DesktopArtifact): DesktopArtifact {
  return { ...artifact }
}

function cloneEvent(event: DesktopJobEvent): DesktopJobEvent {
  if (event.type === 'artifact') {
    return { ...event }
  }
  if (event.type === 'completed') {
    return { ...event, artifacts: event.artifacts.map(cloneArtifact) }
  }
  return { ...event }
}

function cloneRequest(request: StartJobRequest): StartJobRequest {
  return {
    ...request,
    deliverables: [...request.deliverables],
    scales: [...request.scales],
  }
}

function cloneJob(job: DesktopJob): DesktopJob {
  return {
    ...job,
    request: cloneRequest(job.request),
    events: job.events.map(cloneEvent),
    artifacts: job.artifacts.map(cloneArtifact),
    ...(job.failure === undefined ? {} : { failure: { ...job.failure } }),
  }
}

function sourceName(sourcePath: string): string {
  return sourcePath.split(/[\\/]/).filter(Boolean).at(-1) ?? '未命名 PSD'
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function requireTauriRuntime(): void {
  if (!isTauriRuntime()) {
    throw new DesktopBridgeUnavailableError()
  }
}

async function invokeNative<T>(command: string, arguments_: Record<string, unknown> = {}): Promise<T> {
  requireTauriRuntime()
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, arguments_)
}

export class TauriDesktopJobAdapter implements DesktopJobModule, DesktopJobEventSource {
  async start(request: StartJobRequest): Promise<{ jobId: string }> {
    const response = record(await invokeNative('start_job', { request }), 'start response')
    return { jobId: string(response.jobId, 'start response.jobId') }
  }

  async cancel(jobId: string): Promise<void> {
    await invokeNative('cancel_job', { jobId })
  }

  async get(jobId: string): Promise<DesktopJob> {
    return parseDesktopJob(await invokeNative('get_job', { jobId }))
  }

  async listRecent(): Promise<DesktopJob[]> {
    const response = array(await invokeNative('list_recent'), 'recent jobs')
    return response.map(parseDesktopJob)
  }

  async subscribe(listener: DesktopJobEventListener): Promise<() => void> {
    requireTauriRuntime()
    const { listen } = await import('@tauri-apps/api/event')
    return listen<unknown>(desktopJobEventName, (event) => {
      listener(parseDesktopJobEvent(event.payload))
    })
  }
}

export class TauriConversionPathChooser {
  async chooseSource(): Promise<string | undefined> {
    requireTauriRuntime()
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      title: '选择 PSD 或 PSB 文件',
      multiple: false,
      filters: [{ name: 'PSD 或 PSB', extensions: ['psd', 'psb'] }],
    })
    return typeof selected === 'string' ? selected : undefined
  }

  async chooseOutput(): Promise<string | undefined> {
    requireTauriRuntime()
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      title: '选择输出目录',
      directory: true,
      multiple: false,
    })
    return typeof selected === 'string' ? selected : undefined
  }
}

export class TauriOutputDirectoryOpener implements DesktopOutputDirectoryOpener {
  async openOutputDirectory(jobId: string): Promise<void> {
    await invokeNative('open_output_directory', { jobId })
  }
}

export class TauriGeneratedBundleReader implements GeneratedBundleReader {
  async read(jobId: string): Promise<File> {
    const response = record(await invokeNative('read_generated_bundle', { jobId }), 'bundle response')
    const name = string(response.name, 'bundle response.name')
    const bytes = array(response.bytes, 'bundle response.bytes').map((value) => {
      const byte = integer(value, 'bundle response.byte')
      if (byte > 255) {
        throw new Error('bundle response.byte 超出范围')
      }
      return byte
    })
    return new File([new Uint8Array(bytes)], name, { type: 'application/zip' })
  }
}

/** 目标项目文本文件读取：null 表示文件不存在 */
function parseOptionalText(value: unknown, label: string): string | null {
  if (value === null) {
    return null
  }
  return string(value, label)
}

export class TauriVueExportProjectWriter implements DesktopVueExportProjectWriter {
  async readTextFile(projectRoot: string, path: string): Promise<string | null> {
    return parseOptionalText(
      await invokeNative('vue_export_read_text_file', { projectRoot, path }),
      'vue export read response',
    )
  }

  async filterExisting(projectRoot: string, paths: string[]): Promise<string[]> {
    const response = array(await invokeNative('vue_export_check_existing', { projectRoot, paths }), 'vue export existing')
    return response.map((value) => string(value, 'vue export existing.path'))
  }

  async writeFiles(projectRoot: string, files: DesktopVueExportWriteFile[]): Promise<void> {
    await invokeNative('vue_export_write_files', { projectRoot, files })
  }
}

export class TauriVueExportTargetChooser implements DesktopVueExportTargetChooser {
  async chooseProjectRoot(): Promise<string | undefined> {
    requireTauriRuntime()
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      title: '选择 h5-template 项目根目录',
      directory: true,
      multiple: false,
    })
    return typeof selected === 'string' ? selected : undefined
  }
}

export class BrowserMockAdapter implements DesktopJobModule, DesktopJobEventSource, GeneratedBundleReader {
  private readonly jobs = new Map<string, DesktopJob>()
  private readonly bundles = new Map<string, File>()
  private readonly listeners = new Set<DesktopJobEventListener>()

  async start(request: StartJobRequest): Promise<{ jobId: string }> {
    if (this.jobs.has(request.taskId)) {
      throw new Error('任务 ID 已存在')
    }
    const job: DesktopJob = {
      jobId: request.taskId,
      status: 'queued',
      request: cloneRequest(request),
      createdAt: Date.now(),
      events: [],
      artifacts: [],
    }
    this.jobs.set(job.jobId, job)
    await this.emit(job.jobId, {
      type: 'started',
      taskId: job.jobId,
      total: 1,
      sourceName: sourceName(request.sourcePath),
    })
    return { jobId: job.jobId }
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.job(jobId)
    if (this.isTerminal(job)) {
      throw new Error('任务已结束')
    }
    await this.emit(jobId, { type: 'cancelled', taskId: jobId })
  }

  async get(jobId: string): Promise<DesktopJob> {
    return cloneJob(this.job(jobId))
  }

  async listRecent(): Promise<DesktopJob[]> {
    return [...this.jobs.values()]
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(cloneJob)
  }

  async read(jobId: string): Promise<File> {
    const job = this.job(jobId)
    if (job.status !== 'succeeded') {
      throw new Error('任务尚未生成可读取的 Bundle')
    }
    if (!job.request.bundleCompressed) {
      throw new Error('未压缩 Bundle 无法直接导入看稿')
    }
    const bundle = this.bundles.get(jobId)
    if (!bundle) {
      throw new Error('任务没有登记 Bundle')
    }
    return new File([await bundle.arrayBuffer()], bundle.name, { type: bundle.type || 'application/zip' })
  }

  async subscribe(listener: DesktopJobEventListener): Promise<() => void> {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async emit(jobId: string, event: DesktopJobEvent): Promise<void> {
    const job = this.job(jobId)
    this.assertEventJobId(jobId, event)
    if (this.isTerminal(job)) {
      throw new Error('任务已结束')
    }
    switch (event.type) {
      case 'started':
        job.status = 'running'
        job.startedAt = Date.now()
        job.sourceName = event.sourceName
        break
      case 'artifact':
        if (!job.artifacts.some((artifact) => artifact.artifactId === event.artifactId)) {
          job.artifacts.push(parseArtifact(event))
        }
        break
      case 'completed':
        job.status = 'succeeded'
        job.finishedAt = Date.now()
        job.artifacts = event.artifacts.map(cloneArtifact)
        break
      case 'failed':
        job.status = 'failed'
        job.finishedAt = Date.now()
        job.failure = { code: event.code, message: event.message, stage: event.stage }
        break
      case 'cancelled':
        job.status = 'cancelled'
        job.finishedAt = Date.now()
        break
      default:
        break
    }
    const emitted = cloneEvent(event)
    job.events.push(emitted)
    for (const listener of this.listeners) {
      listener(cloneEvent(emitted))
    }
  }

  async complete(jobId: string, bundle: File, artifactId = 'bundle'): Promise<void> {
    const job = this.job(jobId)
    const bundleCompressed = job.request.bundleCompressed
    const artifact: DesktopArtifact = {
      artifactId,
      kind: bundleCompressed ? 'bundle' : 'bundle-directory',
      label: bundleCompressed ? bundle.name : bundle.name.replace(/\.zip$/i, ''),
    }
    await this.emit(jobId, { type: 'artifact', ...artifact })
    if (bundleCompressed) {
      this.bundles.set(jobId, bundle)
    }
    await this.emit(jobId, {
      type: 'completed',
      taskId: jobId,
      outputDir: job.request.outputDir,
      artifacts: [artifact],
    })
  }

  private job(jobId: string): DesktopJob {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new Error('任务不存在')
    }
    return job
  }

  private isTerminal(job: DesktopJob): boolean {
    return ['succeeded', 'failed', 'cancelled'].includes(job.status)
  }

  private assertEventJobId(jobId: string, event: DesktopJobEvent): void {
    if ('taskId' in event && event.taskId !== jobId) {
      throw new Error('事件任务 ID 不匹配')
    }
  }
}
