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
  /** 嵌套挖洞：true 时已标记后代从父级合成图挖出（交互元素独立成图） */
  nestedSuppressionEnabled: boolean
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
  | {
      type: 'started'
      taskId: string
      total: number
      sourceName: string
    }
  | {
      type: 'stage'
      key: string
      label: string
      current: number
      total: number
    }
  | {
      type: 'log'
      stream: 'stdout' | 'stderr'
      message: string
    }
  | {
      type: 'warning'
      code: string
      message: string
    }
  | {
      type: 'artifact'
      artifactId: string
      kind: string
      label: string
    }
  | {
      type: 'completed'
      taskId: string
      outputDir: string
      artifacts: DesktopArtifact[]
    }
  | {
      type: 'failed'
      taskId: string
      code: string
      message: string
      stage: string
    }
  | {
      type: 'cancelled'
      taskId: string
    }

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

export interface DesktopOutputDirectoryOpener {
  openOutputDirectory(jobId: string): Promise<void>
}

export type DesktopJobEventListener = (event: DesktopJobEvent) => void

export interface DesktopJobEventSource {
  subscribe(listener: DesktopJobEventListener): Promise<() => void>
}

export interface GeneratedBundleReader {
  read(jobId: string): Promise<File>
}

/** Vue 导出写入文件：text / base64 / appendText 三选一 */
export interface DesktopVueExportWriteFile {
  /** 目标项目内的相对路径（POSIX 风格；原生侧拒绝绝对路径与 ..） */
  path: string
  /** 新建文本文件内容（目标必须不存在） */
  text?: string
  /** 新建二进制文件内容，base64 编码（目标必须不存在） */
  base64?: string
  /** 追加到既有文件末尾（路由补丁；不改动既有内容） */
  appendText?: string
}

/** 目标项目写入端口：只新增文件、绝不覆盖已有文件 */
export interface DesktopVueExportProjectWriter {
  /** 读取项目内文本文件（相对路径）；文件不存在返回 null */
  readTextFile(projectRoot: string, path: string): Promise<string | null>
  /** 返回 paths 中已经存在的条目（写入前冲突清单） */
  filterExisting(projectRoot: string, paths: string[]): Promise<string[]>
  /** 写入文件（自动创建目录）；任一路径已存在则整体失败且不写入 */
  writeFiles(projectRoot: string, files: DesktopVueExportWriteFile[]): Promise<void>
}

/** 目标项目根目录选择器（系统目录选择框） */
export interface DesktopVueExportTargetChooser {
  chooseProjectRoot(): Promise<string | undefined>
}

export const desktopJobEventName = 'desktop-job-event'

export class DesktopBridgeUnavailableError extends Error {
  constructor() {
    super('当前运行环境不具备桌面原生能力')
    this.name = 'DesktopBridgeUnavailableError'
  }
}
