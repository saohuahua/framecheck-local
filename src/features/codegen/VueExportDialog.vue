<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertTriangle,
  Check,
  FileCode2,
  FolderOpen,
  LoaderCircle,
  X,
} from 'lucide-vue-next'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import AppCommandButton from '../../shared/ui/AppCommandButton.vue'
import AppScrollArea from '../../shared/ui/AppScrollArea.vue'
import { h5TemplateProfile } from './profile'
import { slugifyLayerName, toKebabClassName } from './naming'
import { buildRouterAppend } from './router-patch'
import { generateVuePage } from './vue-page-generator'
import type { VueExportPort, VueExportBundleAccess, VueExportWriteFile } from './vue-export-port'
import type { VueExportResult } from './types'
import VueExportPreviewCanvas from './VueExportPreviewCanvas.vue'

/**
 * 设计稿 → Vue 静态页导出对话框。
 *
 * 流程（与产品决策一致）：
 * 1. 配置：页面名 + 目标项目根目录（桌面端可弹出系统目录选择框）；
 * 2. 预览确认：展示生成器输出的结构化预览（可叠加设计稿比对）、
 *    还原统计、警告与「未还原图层」清单、路由注册状态、写入冲突清单；
 * 3. 写入：校验冲突（绝不覆盖已有文件）后把页面组件、切图与路由补丁
 *    写进目标项目，展示写入结果。
 *
 * 依赖全部通过 props 注入（writer/chooser/access），浏览器端不注入 port 时
 * 显示不可用提示——写文件是桌面端能力，与转换页同模式。
 */
const props = defineProps<{
  open: boolean
  /** 写入端口与目录选择器；浏览器端为 undefined */
  port?: VueExportPort
  /** 当前 Bundle 的设计事实与切图字节访问 */
  access: VueExportBundleAccess
  /** 设计稿参考图 URL（叠加比对用） */
  referenceUrl?: string
  /** 设计稿来源名，用于默认页面名建议 */
  sourceName?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

type Phase = 'config' | 'preview' | 'written'

/** 进度步骤状态：pending 未开始 / active 进行中 / done 完成 / failed 失败 */
type ProgressStepStatus = 'pending' | 'active' | 'done' | 'failed'

interface ProgressStep {
  key: string
  label: string
  status: ProgressStepStatus
}

const phase = ref<Phase>('config')
const pageName = ref('')
const projectRoot = ref('')
const isGenerating = ref(false)
const isWriting = ref(false)
const isChoosing = ref(false)
const error = ref<string | undefined>()
const result = ref<VueExportResult | undefined>()
const conflicts = ref<string[]>([])
const missingTemplateHint = ref(false)
const writtenPaths = ref<string[]>([])
const routerNote = ref<string | undefined>()

/** 分步进度：生成预览与写入项目时实时展示当前进行到哪一步 */
const progressSteps = ref<ProgressStep[]>([])
const progressDetail = ref<string | undefined>()

const normalizedPageName = computed(() => toKebabClassName(pageName.value.trim()))
const canGenerate = computed(() => Boolean(normalizedPageName.value && projectRoot.value.trim()) && !isGenerating.value)
const canWrite = computed(() => Boolean(result.value) && !conflicts.value.length && !isWriting.value)
const ignoredNodes = computed(() => result.value?.report.ignoredNodes ?? [])

/** 页面名默认取设计稿文件名（去扩展名后 slug 化） */
function suggestPageName(sourceName: string | undefined) {
  if (!sourceName) {
    return ''
  }
  const stem = sourceName.replace(/\.(psd|psb)$/i, '')
  return slugifyLayerName(stem)
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      reset()
    }
  },
  // 初始即打开（如测试挂载）时也要完成默认值建议
  { immediate: true },
)

function reset() {
  phase.value = 'config'
  pageName.value = suggestPageName(props.sourceName)
  projectRoot.value = ''
  isGenerating.value = false
  isWriting.value = false
  error.value = undefined
  result.value = undefined
  conflicts.value = []
  missingTemplateHint.value = false
  writtenPaths.value = []
  routerNote.value = undefined
  progressSteps.value = []
  progressDetail.value = undefined
}

/** 开始一组进度步骤：第一步置为进行中，其余待办 */
function beginProgress(labels: string[]) {
  progressSteps.value = labels.map((label, index) => ({
    key: `step-${index}`,
    label,
    status: index === 0 ? 'active' : 'pending',
  }))
  progressDetail.value = undefined
}

/** 标记某一步的结果；成功时顺带激活下一步 */
function markStep(index: number, status: Exclude<ProgressStepStatus, 'pending'>) {
  const steps = [...progressSteps.value]
  if (steps[index]) {
    steps[index] = { ...steps[index], status }
  }
  if (status === 'done' && steps[index + 1]?.status === 'pending') {
    steps[index + 1] = { ...steps[index + 1], status: 'active' }
  }
  progressSteps.value = steps
}

function close() {
  if (isWriting.value) {
    return
  }
  emit('update:open', false)
}

async function chooseProjectRoot() {
  if (!props.port || isChoosing.value) {
    return
  }
  isChoosing.value = true
  try {
    const selected = await props.port.chooser.chooseProjectRoot()
    if (selected) {
      projectRoot.value = selected
    }
  } catch {
    error.value = '无法打开目录选择器，请直接填写项目根目录'
  } finally {
    isChoosing.value = false
  }
}

/** 把端口/桥接抛出的错误转成可读文案（Tauri invoke 可能 reject 字符串或 {code,message} 对象） */
function describeBridgeError(caught: unknown): string {
  if (typeof caught === 'string' && caught) {
    return caught
  }
  if (caught instanceof Error) {
    return caught.message
  }
  if (typeof caught === 'object' && caught !== null && 'message' in caught) {
    const message = (caught as { message?: unknown }).message
    if (typeof message === 'string' && message) {
      return message
    }
  }
  return '未知错误'
}

/** 生成预览：加载设计事实 → 读路由源码 → 生成 → 冲突检测，全程分步展示进度 */
async function generatePreview() {
  if (!canGenerate.value || !props.port) {
    return
  }

  isGenerating.value = true
  error.value = undefined
  beginProgress(['加载设计事实', '读取目标项目路由', '生成页面代码', '检查写入冲突'])
  try {
    const facts = await props.access.loadFacts()
    markStep(0, 'done')

    let routerSource: string | undefined
    try {
      routerSource = await props.port.writer.readTextFile(
        projectRoot.value.trim(),
        h5TemplateProfile.routerFilePath,
      ) ?? undefined
    } catch (caught) {
      // 保留底层原因（如桌面端命令未注册、目录不可读），便于定位
      throw new Error(`读取目标项目路由失败：${describeBridgeError(caught)}`)
    }
    markStep(1, 'done')

    const generated = generateVuePage({
      design: facts.design,
      assets: facts.assets,
      routerSource,
      options: { pageName: normalizedPageName.value },
    })
    markStep(2, 'done')

    result.value = generated
    routerNote.value = generated.router.status === 'appended'
      ? `将在 ${h5TemplateProfile.routerFilePath} 末尾追加路由 /${generated.report.pageName}（不改动既有内容）`
      : `路由未注册：${generated.router.reason}`

    // 写入前检查：目标目录是否像 h5-template 项目 + 同名文件冲突清单
    const root = projectRoot.value.trim()
    const hasPackageJson = await props.port.writer.readTextFile(root, 'package.json') !== null
    missingTemplateHint.value = !hasPackageJson

    const targetPaths = [
      generated.view.path,
      ...generated.report.images.map((image) => image.targetPath),
    ]
    try {
      conflicts.value = await props.port.writer.filterExisting(root, targetPaths)
    } catch (caught) {
      throw new Error(`检查目标项目失败：${describeBridgeError(caught)}`)
    }
    markStep(3, 'done')
    // 生成成功即进入预览，清掉进度面板；预览内容本身就是生成结果
    progressSteps.value = []
    progressDetail.value = undefined

    phase.value = 'preview'
  } catch (caught) {
    markFailedStep()
    error.value = caught instanceof Error ? caught.message : '生成失败，请检查输入后重试'
  } finally {
    isGenerating.value = false
  }
}

/** 把当前进行中的步骤标记为失败（进度面板保留现场，方便定位卡在哪一步） */
function markFailedStep() {
  const index = progressSteps.value.findIndex((step) => step.status === 'active')
  if (index !== -1) {
    markStep(index, 'failed')
  }
}

/**
 * 切图字节 → base64（同步实现：分块拼二进制串后 btoa，
 * 避免 FileReader 的宏任务时序，也便于测试断言）。
 */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

/**
 * 预览图片解析：读取切图字节并转为 object URL。
 * 返回的 URL 生命周期归预览组件管理（卸载时统一回收）。
 */
async function resolvePreviewImage(sourcePath: string): Promise<string | undefined> {
  const bytes = await props.access.readAssetBytes(sourcePath)
  // 拷贝成 ArrayBuffer 支撑的数组：BlobPart 在 TS 泛型化 Uint8Array 后要求 ArrayBuffer 视图
  return bytes ? URL.createObjectURL(new Blob([new Uint8Array(bytes)])) : undefined
}

/** 写入目标项目：复检冲突 → 读取切图字节 → 拼装并落盘，分步展示进度 */
async function writeProject() {
  const generated = result.value
  if (!generated || !props.port || !canWrite.value) {
    return
  }

  isWriting.value = true
  error.value = undefined
  beginProgress(['复检目标文件', '读取切图字节', '写入项目文件'])
  try {
    const root = projectRoot.value.trim()

    // 冲突复检：预览到写入之间目标项目可能发生变化
    const targetPaths = [
      generated.view.path,
      ...generated.report.images.map((image) => image.targetPath),
    ]
    const existing = await props.port.writer.filterExisting(root, targetPaths)
    if (existing.length) {
      conflicts.value = existing
      markFailedStep()
      return
    }
    markStep(0, 'done')

    const files: VueExportWriteFile[] = [
      { path: generated.view.path, text: generated.view.content },
    ]

    // 路由追加块在写入时基于最新源码重新构建：
    // 追加语义不改动既有内容，即使预览后路由文件被人工修改也能安全追加；
    // 若最新源码里已存在同名路由则放弃追加并在结果中说明
    if (generated.router.status === 'appended') {
      const currentRouter = await props.port.writer.readTextFile(root, h5TemplateProfile.routerFilePath)
      const latestPatch = buildRouterAppend(currentRouter ?? undefined, generated.report.pageName)
      if (latestPatch.status === 'appended') {
        files.push({ path: latestPatch.file.path, appendText: latestPatch.file.content })
      } else {
        routerNote.value = `路由未注册：${latestPatch.reason}`
      }
    }

    const images = generated.report.images
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]
      progressDetail.value = `${image.sourcePath}（${index + 1}/${images.length}）`
      const bytes = await props.access.readAssetBytes(image.sourcePath)
      if (!bytes) {
        throw new Error(`缺少切图字节：${image.sourcePath}，请重新导入 Bundle 后重试`)
      }
      files.push({ path: image.targetPath, base64: toBase64(bytes) })
    }
    markStep(1, 'done')

    progressDetail.value = `共 ${files.length} 个文件`
    await props.port.writer.writeFiles(root, files)
    markStep(2, 'done')

    writtenPaths.value = files.map((file) => file.path)
    phase.value = 'written'
  } catch (caught) {
    markFailedStep()
    error.value = caught instanceof Error ? caught.message : `写入失败：${describeBridgeError(caught)}`
  } finally {
    isWriting.value = false
  }
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="vue-export-dialog__overlay" />
      <DialogContent class="vue-export-dialog" @escape-key-down="close">
        <header class="vue-export-dialog__header">
          <span class="vue-export-dialog__icon"><FileCode2 :size="18" aria-hidden="true" /></span>
          <div class="vue-export-dialog__heading">
            <DialogTitle class="vue-export-dialog__title">导出 Vue 静态页</DialogTitle>
            <DialogDescription class="vue-export-dialog__description">
              按设计稿标记切图生成 h5-template 约定的静态页面，写入前可预览比对
            </DialogDescription>
          </div>
          <AppCommandButton :disabled="isWriting" @click="close">关闭</AppCommandButton>
        </header>

        <!-- 浏览器端：写入能力不可用 -->
        <div v-if="!props.port" class="vue-export-dialog__unavailable" role="status">
          <AlertTriangle :size="16" aria-hidden="true" />
          <p>写入目标项目需要桌面端打开（本地文件写入能力），当前环境仅支持看稿。</p>
        </div>

        <template v-else>
          <!-- 第一步：配置 -->
          <section v-if="phase === 'config'" class="vue-export-dialog__body" aria-label="导出配置">
            <div class="vue-export-form">
              <div class="vue-export-form__group">
                <label for="vue-export-page-name">页面名</label>
                <input
                  id="vue-export-page-name"
                  v-model="pageName"
                  data-testid="vue-export-page-name"
                  autocomplete="off"
                  placeholder="shooting-home"
                />
                <p v-if="normalizedPageName" class="vue-export-form__hint">
                  生成 {{ h5TemplateProfile.viewDirectory }}/{{ normalizedPageName }}/index.vue，路由 /{{ normalizedPageName }}
                </p>
              </div>

              <div class="vue-export-form__group">
                <label for="vue-export-project-root">目标项目根目录</label>
                <div class="vue-export-form__path-row">
                  <input
                    id="vue-export-project-root"
                    v-model="projectRoot"
                    data-testid="vue-export-project-root"
                    autocomplete="off"
                    placeholder="D:\project\my-h5"
                  />
                  <AppCommandButton data-testid="vue-export-choose-root" :disabled="isChoosing" @click="chooseProjectRoot">
                    <template #icon>
                      <LoaderCircle v-if="isChoosing" class="vue-export-dialog__spin" :size="14" aria-hidden="true" />
                      <FolderOpen v-else :size="14" aria-hidden="true" />
                    </template>
                    选择
                  </AppCommandButton>
                </div>
                <p class="vue-export-form__hint">h5-template 结构的项目根目录；图片将写入 {{ h5TemplateProfile.imageTargetDirectory }}</p>
              </div>
            </div>

            <div v-if="progressSteps.length" class="vue-export-progress" data-testid="vue-export-progress">
              <ol class="vue-export-progress__steps">
                <li v-for="step in progressSteps" :key="step.key" :class="`is-${step.status}`">
                  <LoaderCircle v-if="step.status === 'active'" class="vue-export-dialog__spin" :size="12" aria-hidden="true" />
                  <Check v-else-if="step.status === 'done'" :size="12" aria-hidden="true" />
                  <X v-else-if="step.status === 'failed'" :size="12" aria-hidden="true" />
                  <span v-else class="vue-export-progress__dot" aria-hidden="true" />
                  <span>{{ step.label }}</span>
                </li>
              </ol>
              <p v-if="progressDetail" class="vue-export-progress__detail fc-mono">{{ progressDetail }}</p>
            </div>

            <p v-if="error" class="vue-export-dialog__error" role="alert">{{ error }}</p>

            <footer class="vue-export-dialog__actions">
              <AppCommandButton
                data-testid="vue-export-generate"
                variant="primary"
                :disabled="!canGenerate"
                @click="generatePreview"
              >
                <template #icon>
                  <LoaderCircle v-if="isGenerating" class="vue-export-dialog__spin" :size="14" aria-hidden="true" />
                  <FileCode2 v-else :size="14" aria-hidden="true" />
                </template>
                {{ isGenerating ? '正在生成' : '生成预览' }}
              </AppCommandButton>
            </footer>
          </section>

          <!-- 第二步：预览确认 -->
          <section v-else-if="phase === 'preview' && result" class="vue-export-dialog__body" aria-label="导出预览">
            <div class="vue-export-summary">
              <span class="vue-export-summary__chip">{{ result.report.imageCount }} 张切图</span>
              <span class="vue-export-summary__chip">{{ result.report.textCount }} 段文字</span>
              <span class="vue-export-summary__chip">{{ result.report.buttonCount }} 个可点击占位</span>
              <span class="vue-export-summary__chip" :class="{ 'is-warning': ignoredNodes.length }">
                {{ ignoredNodes.length }} 个未还原图层
              </span>
            </div>

            <p v-if="missingTemplateHint" class="vue-export-dialog__warning" role="status">
              目标目录没有 package.json，可能不是 h5-template 项目，请确认路径
            </p>
            <ul v-if="result.report.warnings.length" class="vue-export-dialog__warnings">
              <li v-for="warning in result.report.warnings" :key="warning">{{ warning }}</li>
            </ul>

            <VueExportPreviewCanvas
              :model="result.preview"
              :reference-url="props.referenceUrl"
              :resolve-image="resolvePreviewImage"
            />

            <div class="vue-export-detail">
              <p class="vue-export-detail__router" data-testid="vue-export-router-note">{{ routerNote }}</p>
              <details v-if="ignoredNodes.length" class="vue-export-detail__ignored">
                <summary>未还原图层清单（未标记 -h- 导出，回 PSD 补标记后重新生成）</summary>
                <ul>
                  <li v-for="node in ignoredNodes" :key="node.id">
                    {{ node.path }}（{{ node.bounds.width }}×{{ node.bounds.height }} @{{ node.bounds.x }},{{ node.bounds.y }}）
                  </li>
                </ul>
              </details>
            </div>

            <div v-if="conflicts.length" class="vue-export-conflicts" role="alert" data-testid="vue-export-conflicts">
              <AlertTriangle :size="15" aria-hidden="true" />
              <div>
                <strong>目标项目存在同名文件，已阻止写入</strong>
                <ul>
                  <li v-for="path in conflicts" :key="path">{{ path }}</li>
                </ul>
                <p>换一个页面名，或手动处理这些文件后重试。</p>
              </div>
            </div>

            <div v-if="progressSteps.length" class="vue-export-progress" data-testid="vue-export-progress">
              <ol class="vue-export-progress__steps">
                <li v-for="step in progressSteps" :key="step.key" :class="`is-${step.status}`">
                  <LoaderCircle v-if="step.status === 'active'" class="vue-export-dialog__spin" :size="12" aria-hidden="true" />
                  <Check v-else-if="step.status === 'done'" :size="12" aria-hidden="true" />
                  <X v-else-if="step.status === 'failed'" :size="12" aria-hidden="true" />
                  <span v-else class="vue-export-progress__dot" aria-hidden="true" />
                  <span>{{ step.label }}</span>
                </li>
              </ol>
              <p v-if="progressDetail" class="vue-export-progress__detail fc-mono">{{ progressDetail }}</p>
            </div>

            <p v-if="error" class="vue-export-dialog__error" role="alert">{{ error }}</p>

            <footer class="vue-export-dialog__actions">
              <AppCommandButton :disabled="isWriting" @click="phase = 'config'">上一步</AppCommandButton>
              <AppCommandButton
                data-testid="vue-export-write"
                variant="primary"
                :disabled="!canWrite"
                @click="writeProject"
              >
                <template #icon>
                  <LoaderCircle v-if="isWriting" class="vue-export-dialog__spin" :size="14" aria-hidden="true" />
                  <Check v-else :size="14" aria-hidden="true" />
                </template>
                {{ isWriting ? '正在写入' : '写入项目' }}
              </AppCommandButton>
            </footer>
          </section>

          <!-- 第三步：写入结果 -->
          <section v-else-if="phase === 'written'" class="vue-export-dialog__body" aria-label="写入结果">
            <div class="vue-export-written">
              <Check :size="18" aria-hidden="true" />
              <p>已写入 {{ projectRoot.trim() }}</p>
            </div>
            <AppScrollArea class="vue-export-written__list">
              <ul>
                <li v-for="path in writtenPaths" :key="path" class="fc-mono">{{ path }}</li>
              </ul>
            </AppScrollArea>
            <p class="vue-export-written__hint">{{ routerNote }}。在目标项目执行 yarn serve 即可查看页面。</p>
          </section>
        </template>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.vue-export-dialog__overlay {
  position: fixed;
  z-index: var(--fc-z-modal);
  inset: 0;
  background: rgb(28 28 26 / 24%);
}

.vue-export-dialog {
  position: fixed;
  z-index: calc(var(--fc-z-modal) + 1);
  top: 50%;
  left: 50%;
  display: flex;
  width: min(760px, calc(100vw - 32px));
  max-height: min(86vh, 900px);
  flex-direction: column;
  padding: var(--fc-space-5);
  background: var(--fc-surface-root);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-control);
  box-shadow: var(--fc-shadow-float);
  transform: translate(-50%, -50%);
}

.vue-export-dialog__header {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: var(--fc-space-3);
  padding-bottom: var(--fc-space-4);
  border-bottom: 1px solid var(--fc-border);
}

.vue-export-dialog__icon {
  display: inline-flex;
  padding: 6px;
  color: var(--fc-selected);
  background: var(--fc-selected-subtle);
  border-radius: var(--fc-radius-compact);
}

.vue-export-dialog__heading {
  flex: 1;
  min-width: 0;
}

.vue-export-dialog__title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  line-height: 20px;
}

.vue-export-dialog__description {
  margin: 2px 0 0;
  color: var(--fc-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.vue-export-dialog__unavailable {
  display: flex;
  margin-top: var(--fc-space-4);
  padding: var(--fc-space-4);
  align-items: center;
  gap: var(--fc-space-3);
  color: var(--fc-text-secondary);
  font-size: 13px;
  background: var(--fc-surface-subtle);
  border-radius: var(--fc-radius-panel);
}

.vue-export-dialog__body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding-top: var(--fc-space-4);
  gap: var(--fc-space-3);
  overflow-y: auto;
}

.vue-export-form {
  display: grid;
  gap: var(--fc-space-4);
}

.vue-export-form__group {
  display: grid;
  gap: 6px;
}

.vue-export-form label {
  color: var(--fc-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.vue-export-form input {
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

.vue-export-form input:focus {
  border-color: var(--fc-selected);
  box-shadow: var(--fc-focus-ring);
}

.vue-export-form__path-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}

.vue-export-form__hint {
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
  line-height: 16px;
}

.vue-export-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.vue-export-summary__chip {
  display: inline-flex;
  height: 22px;
  padding: 0 8px;
  align-items: center;
  color: var(--fc-text-secondary);
  font-size: var(--fc-font-caption);
  background: var(--fc-surface-subtle);
  border-radius: var(--fc-radius-compact);
}

.vue-export-summary__chip.is-warning {
  color: var(--fc-warning);
  background: color-mix(in srgb, var(--fc-warning) 10%, transparent);
}

.vue-export-dialog__warning {
  margin: 0;
  color: var(--fc-warning);
  font-size: 12px;
  line-height: 18px;
}

.vue-export-dialog__warnings {
  display: grid;
  margin: 0;
  padding: 0 0 0 16px;
  color: var(--fc-warning);
  font-size: 12px;
  gap: 2px;
  list-style: disc;
}

.vue-export-detail {
  display: grid;
  gap: var(--fc-space-2);
}

.vue-export-detail__router {
  margin: 0;
  color: var(--fc-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.vue-export-detail__ignored summary {
  color: var(--fc-text-muted);
  font-size: 12px;
  cursor: pointer;
}

.vue-export-detail__ignored ul {
  display: grid;
  max-height: 120px;
  margin: 6px 0 0;
  padding: 0 0 0 16px;
  overflow-y: auto;
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
  gap: 2px;
  list-style: disc;
}

.vue-export-conflicts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  padding: var(--fc-space-3);
  align-items: start;
  gap: 8px;
  color: var(--fc-error);
  background: color-mix(in srgb, var(--fc-error) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--fc-error) 30%, transparent);
  border-radius: var(--fc-radius-panel);
}

.vue-export-conflicts strong {
  font-size: 12px;
}

.vue-export-conflicts ul {
  display: grid;
  margin: 4px 0;
  padding: 0 0 0 16px;
  font-size: var(--fc-font-caption);
  gap: 2px;
  list-style: disc;
}

.vue-export-conflicts p {
  margin: 0;
  color: var(--fc-text-secondary);
  font-size: var(--fc-font-caption);
}

.vue-export-dialog__error {
  margin: 0;
  color: var(--fc-error);
  font-size: 12px;
  line-height: 18px;
}

.vue-export-progress {
  display: grid;
  padding: var(--fc-space-3);
  background: var(--fc-surface-subtle);
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-panel);
  gap: var(--fc-space-2);
}

.vue-export-progress__steps {
  display: flex;
  flex-wrap: wrap;
  margin: 0;
  padding: 0;
  gap: 6px var(--fc-space-3);
  list-style: none;
}

.vue-export-progress__steps li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--fc-text-muted);
  font-size: 12px;
  line-height: 18px;
}

.vue-export-progress__steps li.is-active {
  color: var(--fc-text);
}

.vue-export-progress__steps li.is-done {
  color: var(--fc-exact);
}

.vue-export-progress__steps li.is-failed {
  color: var(--fc-error);
}

.vue-export-progress__dot {
  width: 6px;
  height: 6px;
  background: var(--fc-border-strong);
  border-radius: 50%;
}

.vue-export-progress__detail {
  margin: 0;
  overflow: hidden;
  color: var(--fc-text-muted);
  font-size: var(--fc-font-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vue-export-dialog__actions {
  display: flex;
  flex: none;
  justify-content: flex-end;
  gap: var(--fc-space-2);
}

.vue-export-written {
  display: flex;
  align-items: center;
  gap: var(--fc-space-2);
  color: var(--fc-exact);
  font-size: 13px;
}

.vue-export-written__list {
  max-height: 260px;
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-panel);
}

.vue-export-written__list ul {
  display: grid;
  margin: 0;
  padding: var(--fc-space-3);
  gap: 4px;
  list-style: none;
}

.vue-export-written__list li {
  overflow-wrap: anywhere;
  color: var(--fc-text-secondary);
  font-size: var(--fc-font-caption);
}

.vue-export-written__hint {
  margin: 0;
  color: var(--fc-text-muted);
  font-size: 12px;
  line-height: 18px;
}

.vue-export-dialog__spin {
  animation: vue-export-spin 800ms linear infinite;
}

@keyframes vue-export-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .vue-export-dialog__spin {
    animation: none;
  }
}
</style>
