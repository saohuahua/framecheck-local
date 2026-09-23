<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  Check,
  Clock3,
  FileOutput,
  FolderOpen,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
} from 'lucide-vue-next'
import AppCommandButton from '../../shared/ui/AppCommandButton.vue'
import AppIconButton from '../../shared/ui/AppIconButton.vue'
import AppScrollArea from '../../shared/ui/AppScrollArea.vue'
import AppTooltip from '../../shared/ui/AppTooltip.vue'
import type {
  ConversionOutputDirectoryOpener,
  ConversionPathChooser,
  GeneratedBundleImportState,
} from './conversion-types'
import type {
  DesktopJob,
  DesktopJobEvent,
  DesktopJobModule,
  DesktopJobStatus,
  StartJobRequest,
} from './desktop-job-port'

const props = withDefaults(defineProps<{
  jobModule: DesktopJobModule
  pathChooser?: ConversionPathChooser
  outputDirectoryOpener?: ConversionOutputDirectoryOpener
  generatedBundleImportState?: GeneratedBundleImportState
  createTaskId?: () => string
  canStart?: boolean
  unavailableMessage?: string
}>(), {
  canStart: true,
  unavailableMessage: '当前运行环境无法执行本机转换，请在桌面端打开',
})

const emit = defineEmits<{
  generatedBundle: [jobId: string]
}>()

const sourcePath = ref('')
const outputDir = ref('')
const preset = ref<'delivery' | 'complete'>('delivery')
const bundleCompressed = ref(true)
const scaleOne = ref(true)
const scaleTwo = ref(false)
const tokenTop = ref(30)
const cssStyle = ref<'compact' | 'expanded'>('compact')
const cssPrettyEnabled = ref(true)
const smartMergeEnabled = ref(true)
const imageLayerFlattenEnabled = ref(false)
const nestedSuppressionEnabled = ref(true)
const validationErrors = ref<Record<string, string>>({})
const localError = ref<string | undefined>()
const recentError = ref<string | undefined>()
const outputOpenError = ref<string | undefined>()
const isStarting = ref(false)
const isCancelling = ref(false)
const isOpeningOutput = ref(false)
const currentJob = ref<DesktopJob | null>(null)
const recentJobs = ref<DesktopJob[]>([])
const activeJobId = ref<string | undefined>()
const emittedGeneratedJobId = ref<string | undefined>()

let mounted = true
let pollTimer: number | undefined
let pollInFlight = false

const currentStage = computed(() => findLatestStage(currentJob.value?.events ?? []))
const visibleEvents = computed(() => currentJob.value?.events.slice(-120) ?? [])
const activeImportState = computed(() => {
  const state = props.generatedBundleImportState
  return state?.jobId === currentJob.value?.jobId ? state : undefined
})
const currentJobHasBundle = computed(() => currentJob.value ? hasBundleArtifact(currentJob.value) : false)
const currentJobHasBundleDirectory = computed(() => currentJob.value ? hasBundleDirectoryArtifact(currentJob.value) : false)
const currentJobStatusLabel = computed(() => currentJob.value ? statusLabel(currentJob.value.status) : '等待任务')
const isCurrentJobPending = computed(() => isPending(currentJob.value))

function baseName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || '未命名 PSD'
}

function formatTime(value: number | undefined) {
  if (!value) {
    return '刚刚'
  }
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function statusLabel(status: DesktopJobStatus) {
  const labels: Record<DesktopJobStatus, string> = {
    queued: '排队中',
    running: '转换中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return labels[status]
}

function isPending(job: DesktopJob | null): boolean {
  return job?.status === 'queued' || job?.status === 'running'
}

function hasBundleArtifact(job: DesktopJob): boolean {
  return job.artifacts.some((artifact) => artifact.kind === 'bundle')
}

function hasBundleDirectoryArtifact(job: DesktopJob): boolean {
  return job.artifacts.some((artifact) => artifact.kind === 'bundle-directory')
}

function findLatestStage(events: DesktopJobEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.type === 'stage') {
      return event
    }
  }
  return undefined
}

function truncate(value: string, limit = 500) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value
}

function redactPath(value: string) {
  return value.replace(/[A-Za-z]:[\\/][^\s'"`]+/g, '[路径已隐藏]')
}

function eventLabel(event: DesktopJobEvent) {
  if (event.type === 'stage') {
    return `${event.label} ${event.current} / ${event.total}`
  }
  if (event.type === 'log') {
    return `[${event.stream}] ${truncate(redactPath(event.message))}`
  }
  if (event.type === 'warning') {
    return `[${event.code}] ${truncate(redactPath(event.message))}`
  }
  if (event.type === 'artifact') {
    return `已登记 ${event.label}`
  }
  if (event.type === 'failed') {
    return `[${event.code}] ${truncate(redactPath(event.message))}`
  }
  if (event.type === 'started') {
    return `已接收 ${event.sourceName}`
  }
  if (event.type === 'completed') {
    return '转换完成'
  }
  return '取消清理完成'
}

function createTaskId() {
  const taskId = props.createTaskId?.() ?? globalThis.crypto?.randomUUID?.()
  if (!taskId) {
    throw new Error('当前环境无法生成安全任务标识')
  }
  return taskId
}

function buildRequest(): StartJobRequest | undefined {
  const errors: Record<string, string> = {}
  const normalizedSource = sourcePath.value.trim()
  const normalizedOutput = outputDir.value.trim()
  const scales = [scaleOne.value ? 1 : undefined, scaleTwo.value ? 2 : undefined]
    .filter((scale): scale is number => scale !== undefined)
    .sort((left, right) => left - right)

  if (!normalizedSource) {
    errors.source = '请填写 PSD 或 PSB 文件路径'
  } else if (!/\.(psd|psb)$/i.test(normalizedSource)) {
    errors.source = '仅支持 PSD 或 PSB 文件'
  }
  if (!normalizedOutput) {
    errors.output = '请填写输出目录'
  }
  if (!scales.length) {
    errors.scales = '至少选择一个输出倍率'
  }
  if (!Number.isInteger(tokenTop.value) || tokenTop.value <= 0) {
    errors.tokenTop = 'Token 数量必须是正整数'
  }

  validationErrors.value = errors
  if (Object.keys(errors).length) {
    return undefined
  }

  return {
    protocolVersion: '1',
    taskId: createTaskId(),
    sourcePath: normalizedSource,
    outputDir: normalizedOutput,
    deliverables: preset.value === 'complete' ? ['delivery', 'html'] : ['delivery'],
    bundleCompressed: bundleCompressed.value,
    scales,
    tokenTop: tokenTop.value,
    cssStyle: cssStyle.value,
    cssPrettyEnabled: cssPrettyEnabled.value,
    smartMergeEnabled: smartMergeEnabled.value,
    imageLayerFlattenEnabled: imageLayerFlattenEnabled.value,
    nestedSuppressionEnabled: nestedSuppressionEnabled.value,
  }
}

function stopPolling() {
  if (pollTimer !== undefined) {
    window.clearTimeout(pollTimer)
    pollTimer = undefined
  }
}

function schedulePolling(jobId: string) {
  stopPolling()
  if (!mounted || activeJobId.value !== jobId || !isCurrentJobPending.value) {
    return
  }
  pollTimer = window.setTimeout(() => {
    pollTimer = undefined
    void pollJob(jobId)
  }, 700)
}

async function pollJob(jobId: string) {
  // 轮询避免并发快照请求
  if (pollInFlight || activeJobId.value !== jobId) {
    return
  }

  pollInFlight = true
  try {
    await refreshJob(jobId)
  } finally {
    pollInFlight = false
    schedulePolling(jobId)
  }
}

async function refreshRecent() {
  try {
    recentJobs.value = await props.jobModule.listRecent()
    recentError.value = undefined
  } catch {
    recentError.value = '最近任务暂时不可读取'
  }
}

function requestGeneratedBundle(retry = false) {
  const job = currentJob.value
  if (!job || job.status !== 'succeeded' || !hasBundleArtifact(job)) {
    return
  }
  if (!retry && emittedGeneratedJobId.value === job.jobId) {
    return
  }
  emittedGeneratedJobId.value = job.jobId
  emit('generatedBundle', job.jobId)
}

function projectJob(job: DesktopJob) {
  if (!isPending(job)) {
    stopPolling()
  }
  if (job.status === 'succeeded') {
    requestGeneratedBundle()
  }
}

async function refreshJob(jobId: string) {
  try {
    const job = await props.jobModule.get(jobId)
    if (!mounted || activeJobId.value !== jobId || job.jobId !== jobId) {
      return
    }
    currentJob.value = job
    localError.value = undefined
    projectJob(job)
    await refreshRecent()
  } catch {
    if (mounted && activeJobId.value === jobId) {
      localError.value = '任务状态不可读取，请重新打开转换工作区'
      stopPolling()
    }
  }
}

async function startConversion() {
  if (!props.canStart || isStarting.value || isCancelling.value) {
    return
  }

  localError.value = undefined
  const request = buildRequest()
  if (!request) {
    return
  }

  isStarting.value = true
  stopPolling()
  try {
    const { jobId } = await props.jobModule.start(request)
    activeJobId.value = jobId
    currentJob.value = null
    emittedGeneratedJobId.value = undefined
    await refreshJob(jobId)
    schedulePolling(jobId)
  } catch {
    localError.value = '任务无法启动，请检查桌面端状态和路径权限'
    await refreshRecent()
  } finally {
    isStarting.value = false
  }
}

async function cancelCurrentJob() {
  const jobId = currentJob.value?.jobId
  if (!jobId || isCancelling.value) {
    return
  }

  isCancelling.value = true
  stopPolling()
  try {
    await props.jobModule.cancel(jobId)
    await refreshJob(jobId)
    schedulePolling(jobId)
  } catch {
    localError.value = '取消请求未完成，请继续等待任务状态更新'
    schedulePolling(jobId)
  } finally {
    isCancelling.value = false
  }
}

async function chooseSource() {
  localError.value = undefined
  try {
    const selected = await props.pathChooser?.chooseSource()
    if (selected) {
      sourcePath.value = selected
    }
  } catch {
    localError.value = '无法打开系统文件选择器，请直接填写源文件路径'
  }
}

async function chooseOutput() {
  localError.value = undefined
  try {
    const selected = await props.pathChooser?.chooseOutput()
    if (selected) {
      outputDir.value = selected
    }
  } catch {
    localError.value = '无法打开系统目录选择器，请直接填写输出目录'
  }
}

async function openOutputDirectory() {
  const jobId = currentJob.value?.jobId
  if (!jobId || isOpeningOutput.value) {
    return
  }

  outputOpenError.value = undefined
  isOpeningOutput.value = true
  try {
    await props.outputDirectoryOpener?.openOutputDirectory(jobId)
  } catch {
    outputOpenError.value = '无法打开输出目录，请确认目录仍可访问后重试'
  } finally {
    isOpeningOutput.value = false
  }
}

function retryOpenGeneratedBundle() {
  requestGeneratedBundle(true)
}

watch(
  () => props.jobModule,
  () => {
    stopPolling()
    activeJobId.value = undefined
    currentJob.value = null
    emittedGeneratedJobId.value = undefined
    void refreshRecent()
  },
)

onMounted(() => {
  void refreshRecent()
})

onBeforeUnmount(() => {
  mounted = false
  stopPolling()
})
</script>

<template>
  <main class="conversion-workspace" aria-label="本地转换工作区">
    <section class="conversion-workspace__configuration" aria-labelledby="conversion-config-title">
      <header class="conversion-workspace__section-header">
        <span class="conversion-workspace__eyebrow">新建任务</span>
        <h1 id="conversion-config-title">PSD 转换</h1>
      </header>

      <form class="conversion-form" @submit.prevent="startConversion">
        <div class="conversion-form__group">
          <label for="conversion-source">源文件</label>
          <div class="conversion-form__path-row">
            <input
              id="conversion-source"
              v-model="sourcePath"
              data-testid="source-path"
              autocomplete="off"
              placeholder="D:\\design\\home.psd"
              :aria-describedby="validationErrors.source ? 'conversion-source-error' : undefined"
            />
            <AppTooltip v-if="pathChooser" label="选择源文件">
              <template #trigger>
                <AppIconButton data-testid="choose-source" label="选择源文件" @click="chooseSource">
                  <FolderOpen :size="15" aria-hidden="true" />
                </AppIconButton>
              </template>
            </AppTooltip>
          </div>
          <p v-if="validationErrors.source" id="conversion-source-error" class="conversion-form__error">{{ validationErrors.source }}</p>
        </div>

        <div class="conversion-form__group">
          <label for="conversion-output">输出目录</label>
          <div class="conversion-form__path-row">
            <input
              id="conversion-output"
              v-model="outputDir"
              data-testid="output-dir"
              autocomplete="off"
              placeholder="D:\\deliveries"
              :aria-describedby="validationErrors.output ? 'conversion-output-error' : undefined"
            />
            <AppTooltip v-if="pathChooser" label="选择输出目录">
              <template #trigger>
                <AppIconButton data-testid="choose-output" label="选择输出目录" @click="chooseOutput">
                  <FolderOpen :size="15" aria-hidden="true" />
                </AppIconButton>
              </template>
            </AppTooltip>
          </div>
          <p v-if="validationErrors.output" id="conversion-output-error" class="conversion-form__error">{{ validationErrors.output }}</p>
        </div>

        <fieldset class="conversion-form__group">
          <legend>交付预设</legend>
          <label class="conversion-form__radio">
            <input v-model="preset" data-testid="preset-delivery" type="radio" value="delivery" />
            <span>看稿交付</span>
            <small>设计事实与 Bundle</small>
          </label>
          <label class="conversion-form__radio">
            <input v-model="preset" data-testid="preset-complete" type="radio" value="complete" />
            <span>完整交付</span>
            <small>Bundle 与 HTML 工程</small>
          </label>
        </fieldset>

        <fieldset class="conversion-form__group">
          <legend>Bundle 格式</legend>
          <label class="conversion-form__radio">
            <input v-model="bundleCompressed" data-testid="bundle-compressed" :value="true" type="radio" />
            <span>压缩包</span>
            <small>默认输出 ZIP，可直接导入看稿</small>
          </label>
          <label class="conversion-form__radio">
            <input v-model="bundleCompressed" data-testid="bundle-uncompressed" :value="false" type="radio" />
            <span>未压缩文件夹</span>
            <small>输出可读文件夹，保留 ZIP 作为看稿备份</small>
          </label>
        </fieldset>

        <fieldset class="conversion-form__group">
          <legend>资产倍率</legend>
          <div class="conversion-form__checks">
            <label><input v-model="scaleOne" data-testid="scale-1" type="checkbox" /> 1x</label>
            <label><input v-model="scaleTwo" data-testid="scale-2" type="checkbox" /> 2x</label>
          </div>
          <p v-if="validationErrors.scales" class="conversion-form__error">{{ validationErrors.scales }}</p>
        </fieldset>

        <div class="conversion-form__group">
          <label for="conversion-token-top">转换器 Token 上限</label>
          <input id="conversion-token-top" v-model.number="tokenTop" data-testid="token-top" min="1" step="1" type="number" />
          <p class="conversion-form__hint">传给转换器的 tokenTop 参数，取值范围 1 到 100，不是 AI 用量或调用额度，细分规则由转换器定义</p>
          <p v-if="validationErrors.tokenTop" class="conversion-form__error">{{ validationErrors.tokenTop }}</p>
        </div>

        <div class="conversion-form__group">
          <label for="conversion-css-style">CSS 格式</label>
          <select id="conversion-css-style" v-model="cssStyle" data-testid="css-style">
            <option value="compact">紧凑</option>
            <option value="expanded">展开</option>
          </select>
        </div>

        <fieldset class="conversion-form__group">
          <legend>处理选项</legend>
          <div class="conversion-form__toggles">
            <label><input v-model="cssPrettyEnabled" data-testid="css-pretty" type="checkbox" /> 格式化 CSS</label>
            <label><input v-model="smartMergeEnabled" data-testid="smart-merge" type="checkbox" /> 智能合并</label>
            <label><input v-model="imageLayerFlattenEnabled" data-testid="image-flatten" type="checkbox" /> 图像图层扁平化</label>
            <label><input v-model="nestedSuppressionEnabled" data-testid="nested-suppression" type="checkbox" /> 嵌套挖洞</label>
          </div>
        </fieldset>

        <p v-if="!canStart" class="conversion-task__notice" role="status">{{ unavailableMessage }}</p>
        <p v-else-if="localError" class="conversion-form__error" role="alert">{{ localError }}</p>
        <AppCommandButton data-testid="start-conversion" variant="primary" :disabled="!canStart || isStarting || isCancelling" type="submit">
          <template #icon><LoaderCircle v-if="isStarting" class="conversion-workspace__spin" :size="15" aria-hidden="true" /><Play v-else :size="15" aria-hidden="true" /></template>
          {{ isStarting ? '正在提交' : '开始转换' }}
        </AppCommandButton>
      </form>
    </section>

    <section class="conversion-workspace__task" aria-labelledby="conversion-task-title">
      <header class="conversion-workspace__section-header conversion-workspace__section-header--row">
        <div>
          <span class="conversion-workspace__eyebrow">当前任务</span>
          <h2 id="conversion-task-title">{{ currentJob ? (currentJob.sourceName || baseName(currentJob.request.sourcePath)) : '等待转换' }}</h2>
        </div>
        <span class="conversion-workspace__status" :class="`is-${currentJob?.status || 'idle'}`" aria-live="polite">{{ currentJobStatusLabel }}</span>
      </header>

      <div v-if="currentJob" class="conversion-task">
        <div class="conversion-task__stage">
          <span>{{ currentStage?.label || (currentJob.status === 'queued' ? '等待桌面端接收任务' : '等待阶段信息') }}</span>
          <strong v-if="currentStage" class="fc-mono">{{ currentStage.current }} / {{ currentStage.total }}</strong>
        </div>
        <div class="conversion-task__progress" aria-hidden="true">
          <span :style="{ width: `${currentStage ? Math.min(100, Math.round((currentStage.current / Math.max(currentStage.total, 1)) * 100)) : 0}%` }" />
        </div>
        <p v-if="currentJob.failure" class="conversion-task__failure">{{ currentJob.failure.code }} {{ currentJob.failure.stage ? `${currentJob.failure.stage} 阶段失败，请检查输入后重试` : '任务失败，请检查输入后重试' }}</p>
        <p v-else-if="currentJob.status === 'succeeded' && !currentJobHasBundle && !currentJobHasBundleDirectory" class="conversion-task__failure">转换完成但未登记看稿 Bundle</p>
        <template v-else-if="currentJob.status === 'succeeded' && currentJobHasBundle">
          <p v-if="activeImportState?.status === 'opening'" class="conversion-task__notice">正在打开生成的看稿 Bundle</p>
          <p v-else-if="activeImportState?.status === 'opened'" class="conversion-task__notice">生成的看稿 Bundle 已打开</p>
          <div v-else-if="activeImportState?.status === 'failed'" class="conversion-task__import-failure" role="alert">
            <AlertTriangle :size="16" aria-hidden="true" />
            <p><strong>转换成功但看稿导入失败</strong><span>{{ activeImportState.code ? `${activeImportState.code} ` : '' }}{{ redactPath(activeImportState.message) }}</span></p>
            <AppCommandButton data-testid="retry-open-generated" @click="retryOpenGeneratedBundle">
              <template #icon><RotateCcw :size="14" aria-hidden="true" /></template>
              重新打开看稿
            </AppCommandButton>
          </div>
          <p v-else class="conversion-task__notice">已生成看稿 Bundle，等待打开</p>
        </template>
        <p v-else-if="currentJob.status === 'succeeded' && currentJobHasBundleDirectory" class="conversion-task__notice">已生成未压缩 Bundle 文件夹，可直接提供给 AI 读取，原 ZIP 作为备份保留</p>
        <p v-if="outputOpenError" class="conversion-task__failure" role="alert">{{ outputOpenError }}</p>
        <AppCommandButton v-if="currentJob.status === 'succeeded' && outputDirectoryOpener" data-testid="open-output-directory" :disabled="isOpeningOutput" @click="openOutputDirectory">
          <template #icon><LoaderCircle v-if="isOpeningOutput" class="conversion-workspace__spin" :size="14" aria-hidden="true" /><FolderOpen v-else :size="14" aria-hidden="true" /></template>
          {{ isOpeningOutput ? '正在打开' : '打开输出目录' }}
        </AppCommandButton>
        <AppCommandButton v-if="isCurrentJobPending" data-testid="cancel-conversion" variant="danger" :disabled="isCancelling" @click="cancelCurrentJob">
          <template #icon><LoaderCircle v-if="isCancelling" class="conversion-workspace__spin" :size="14" aria-hidden="true" /><Square v-else :size="14" aria-hidden="true" /></template>
          {{ isCancelling ? '正在取消' : '取消任务' }}
        </AppCommandButton>
      </div>
      <div v-else class="conversion-task__empty">
        <FileOutput :size="22" :stroke-width="1.6" aria-hidden="true" />
        <p>提交 PSD 或 PSB 后，阶段和日志会显示在这里</p>
      </div>

      <section class="conversion-log" aria-labelledby="conversion-log-title">
        <div class="conversion-log__header">
          <h3 id="conversion-log-title">任务日志</h3>
          <span>{{ visibleEvents.length }} 条</span>
        </div>
        <AppScrollArea class="conversion-log__scroll">
          <ol v-if="visibleEvents.length" class="conversion-log__list">
            <li v-for="(event, index) in visibleEvents" :key="`${event.type}-${index}`" :class="`is-${event.type}`">{{ eventLabel(event) }}</li>
          </ol>
          <p v-else class="conversion-log__empty">尚未收到任务事件</p>
        </AppScrollArea>
      </section>
    </section>

    <aside class="conversion-workspace__recent" aria-labelledby="conversion-recent-title">
      <header class="conversion-workspace__section-header conversion-workspace__section-header--row">
        <div>
          <span class="conversion-workspace__eyebrow">本地记录</span>
          <h2 id="conversion-recent-title">最近任务</h2>
        </div>
        <Clock3 :size="17" aria-hidden="true" />
      </header>
      <p v-if="recentError" class="conversion-form__error">{{ recentError }}</p>
      <AppScrollArea v-else class="conversion-recent__scroll">
        <ul v-if="recentJobs.length" class="conversion-recent__list">
          <li v-for="job in recentJobs" :key="job.jobId" :class="{ 'is-current': job.jobId === currentJob?.jobId }">
            <span class="conversion-recent__name">{{ job.sourceName || baseName(job.request.sourcePath) }}</span>
            <span class="conversion-recent__meta"><span>{{ statusLabel(job.status) }}</span><span>{{ formatTime(job.finishedAt || job.startedAt || job.createdAt) }}</span></span>
            <span v-if="job.failure" class="conversion-recent__failure">{{ job.failure.code }}</span>
            <span v-else-if="findLatestStage(job.events)" class="conversion-recent__stage">{{ findLatestStage(job.events)?.label }}</span>
          </li>
        </ul>
        <div v-else class="conversion-recent__empty">
          <Check :size="18" aria-hidden="true" />
          <p>还没有本地任务记录</p>
        </div>
      </AppScrollArea>
    </aside>
  </main>
</template>

<style scoped>
.conversion-workspace {
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(270px, 320px) minmax(420px, 1fr) minmax(240px, 300px);
  overflow: hidden;
  background: var(--fc-surface-root);
}

.conversion-workspace__configuration,
.conversion-workspace__task,
.conversion-workspace__recent {
  min-width: 0;
  min-height: 0;
  padding: var(--fc-space-4);
}

.conversion-workspace__configuration,
.conversion-workspace__task {
  border-right: 1px solid var(--fc-border);
}

.conversion-workspace__task {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: var(--fc-space-4);
}

.conversion-workspace__recent {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--fc-space-3);
}

.conversion-workspace__section-header {
  margin-bottom: var(--fc-space-4);
}

.conversion-workspace__section-header--row {
  display: flex;
  margin-bottom: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--fc-space-3);
}

.conversion-workspace__eyebrow {
  display: block;
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
  line-height: 16px;
}

.conversion-workspace h1,
.conversion-workspace h2,
.conversion-workspace h3,
.conversion-workspace p {
  margin: 0;
}

.conversion-workspace h1,
.conversion-workspace h2 {
  color: var(--fc-text);
  font-size: 15px;
  font-weight: 650;
  line-height: 22px;
}

.conversion-form {
  display: grid;
  gap: var(--fc-space-4);
}

.conversion-form__group {
  display: grid;
  min-width: 0;
  margin: 0;
  padding: 0;
  gap: 6px;
  border: 0;
}

.conversion-form label,
.conversion-form legend {
  padding: 0;
  color: var(--fc-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.conversion-form input:not([type='checkbox']):not([type='radio']),
.conversion-form select {
  width: 100%;
  min-width: 0;
  height: var(--fc-control-height);
  padding: 0 8px;
  color: var(--fc-text);
  font: inherit;
  font-size: 12px;
  background: var(--fc-surface-root);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-control);
  outline: none;
}

.conversion-form input:focus,
.conversion-form select:focus {
  border-color: var(--fc-selected);
  box-shadow: var(--fc-focus-ring);
}

.conversion-form__path-row {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}

.conversion-form__radio {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 8px;
  align-items: center;
  column-gap: 8px;
  cursor: pointer;
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-control);
}

.conversion-form__radio + .conversion-form__radio {
  margin-top: 6px;
}

.conversion-form__radio small {
  grid-column: 2;
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
  font-weight: 400;
  line-height: 16px;
}

.conversion-form__checks,
.conversion-form__toggles {
  display: grid;
  gap: 7px;
}

.conversion-form__checks {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.conversion-form__checks label,
.conversion-form__toggles label {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  font-weight: 400;
}

.conversion-form__error {
  color: var(--fc-error);
  font-size: var(--fc-font-caption);
  line-height: 16px;
}

.conversion-form__hint {
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
  font-weight: 400;
  line-height: 16px;
}

.conversion-workspace__status {
  display: inline-flex;
  height: 22px;
  padding: 0 6px;
  align-items: center;
  color: var(--fc-text-secondary);
  font-size: var(--fc-font-caption);
  white-space: nowrap;
  background: var(--fc-surface-subtle);
  border-radius: var(--fc-radius-compact);
}

.conversion-workspace__status.is-running,
.conversion-workspace__status.is-queued {
  color: var(--fc-warning);
}

.conversion-workspace__status.is-succeeded {
  color: var(--fc-exact);
}

.conversion-workspace__status.is-failed {
  color: var(--fc-error);
}

.conversion-task {
  display: grid;
  padding: var(--fc-space-3);
  gap: var(--fc-space-3);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-panel);
}

.conversion-task__stage,
.conversion-log__header,
.conversion-recent__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--fc-space-2);
}

.conversion-task__stage {
  color: var(--fc-text-secondary);
  font-size: 12px;
}

.conversion-task__stage span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversion-task__stage strong {
  flex: none;
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
  font-weight: 400;
}

.conversion-task__progress {
  height: 4px;
  overflow: hidden;
  background: var(--fc-surface-subtle);
  border-radius: var(--fc-radius-compact);
}

.conversion-task__progress span {
  display: block;
  height: 100%;
  background: var(--fc-accent);
  transition: width var(--fc-transition-fast);
}

.conversion-task__failure,
.conversion-task__notice {
  color: var(--fc-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.conversion-task__failure {
  color: var(--fc-error);
}

.conversion-task__import-failure {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  color: var(--fc-error);
}

.conversion-task__import-failure p {
  display: grid;
  gap: 3px;
  color: var(--fc-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.conversion-task__import-failure strong {
  color: var(--fc-error);
}

.conversion-task__import-failure :deep(.fc-command-button) {
  grid-column: 2;
  justify-self: start;
}

.conversion-task__empty,
.conversion-recent__empty {
  display: grid;
  min-height: 150px;
  align-content: center;
  justify-items: center;
  gap: var(--fc-space-2);
  color: var(--fc-text-muted);
  font-size: 12px;
  text-align: center;
}

.conversion-log {
  display: grid;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-panel);
}

.conversion-log__header {
  min-height: 34px;
  padding: 0 var(--fc-space-3);
  border-bottom: 1px solid var(--fc-border);
}

.conversion-log__header h3 {
  color: var(--fc-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.conversion-log__header span {
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
}

.conversion-log__scroll,
.conversion-recent__scroll {
  min-height: 0;
}

.conversion-log__list,
.conversion-recent__list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.conversion-log__list li {
  padding: 6px var(--fc-space-3);
  overflow-wrap: anywhere;
  color: var(--fc-text-secondary);
  font-family: var(--fc-mono-font);
  font-size: var(--fc-font-caption);
  line-height: 17px;
  border-bottom: 1px solid var(--fc-surface-subtle);
}

.conversion-log__list li.is-warning,
.conversion-log__list li.is-failed {
  color: var(--fc-error);
}

.conversion-log__empty {
  padding: var(--fc-space-3);
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
}

.conversion-recent__list li {
  display: grid;
  padding: var(--fc-space-3);
  gap: 6px;
  border-bottom: 1px solid var(--fc-border);
}

.conversion-recent__list li.is-current {
  background: var(--fc-selected-subtle);
}

.conversion-recent__name {
  overflow: hidden;
  color: var(--fc-text-secondary);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversion-recent__meta,
.conversion-recent__stage,
.conversion-recent__failure {
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
}

.conversion-recent__failure {
  color: var(--fc-error);
}

.conversion-workspace__spin {
  animation: conversion-spin 800ms linear infinite;
}

@keyframes conversion-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1120px) {
  .conversion-workspace {
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  }

  .conversion-workspace__recent {
    display: none;
  }
}

@media (max-width: 760px) {
  .conversion-workspace {
    display: block;
    min-width: 0;
    overflow-y: auto;
  }

  .conversion-workspace__configuration,
  .conversion-workspace__task {
    border-right: 0;
    border-bottom: 1px solid var(--fc-border);
  }

  .conversion-workspace__task {
    min-height: 520px;
  }
}
</style>
