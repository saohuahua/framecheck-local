import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConversionWorkspace from '../../src/features/conversion/ConversionWorkspace.vue'
import { MockDesktopJobModule } from '../../src/features/conversion/mock-desktop-job'
import type { DesktopJob } from '../../src/features/conversion/desktop-job-port'

const taskId = '00000000-0000-0000-0000-000000000010'
const wrappers: VueWrapper[] = []

function mountWorkspace(adapter = new MockDesktopJobModule()) {
  const wrapper = mount(ConversionWorkspace, {
    props: {
      jobModule: adapter,
      createTaskId: () => taskId,
    },
    global: {
      stubs: {
        AppScrollArea: { template: '<div><slot /></div>' },
      },
    },
  })
  wrappers.push(wrapper)
  return { adapter, wrapper }
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

async function submitValidForm(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="source-path"]').setValue('D:\\design\\home.psd')
  await wrapper.get('[data-testid="output-dir"]').setValue('D:\\deliveries')
  await wrapper.get('form').trigger('submit')
  await settle()
}

function runningJob(request: DesktopJob['request']): DesktopJob {
  return {
    jobId: taskId,
    status: 'running',
    request,
    createdAt: 10,
    startedAt: 11,
    sourceName: 'home.psd',
    artifacts: [],
    events: [
      { type: 'started', taskId, total: 6, sourceName: 'home.psd' },
      { type: 'stage', key: 'assets', label: '导出标记切图', current: 2, total: 6 },
      { type: 'log', stream: 'stdout', message: 'assets ready' },
      { type: 'log', stream: 'stderr', message: 'diagnostic line' },
      { type: 'warning', code: 'low-contrast', message: '需要人工确认' },
    ],
  }
}

describe('ConversionWorkspace', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    vi.useRealTimers()
  })

  it('构造冻结的完整交付 request 并且不创建文件输入', async () => {
    const { adapter, wrapper } = mountWorkspace()

    await wrapper.get('[data-testid="source-path"]').setValue('D:\\design\\home.psd')
    await wrapper.get('[data-testid="output-dir"]').setValue('D:\\deliveries')
    await wrapper.get('[data-testid="preset-complete"]').setValue()
    await wrapper.get('[data-testid="scale-2"]').setValue(false)
    await wrapper.get('[data-testid="token-top"]').setValue('42')
    await wrapper.get('[data-testid="css-style"]').setValue('expanded')
    await wrapper.get('[data-testid="css-pretty"]').setValue(false)
    await wrapper.get('[data-testid="smart-merge"]').setValue(false)
    await wrapper.get('[data-testid="image-flatten"]').setValue(true)
    await wrapper.get('[data-testid="nested-suppression"]').setValue(false)
    await wrapper.get('form').trigger('submit')
    await settle()

    expect(adapter.requests).toEqual([{
      protocolVersion: '1',
      taskId,
      sourcePath: 'D:\\design\\home.psd',
      outputDir: 'D:\\deliveries',
      deliverables: ['delivery', 'html'],
      bundleCompressed: true,
      scales: [1],
      tokenTop: 42,
      cssStyle: 'expanded',
      cssPrettyEnabled: false,
      smartMergeEnabled: false,
      imageLayerFlattenEnabled: true,
      nestedSuppressionEnabled: false,
    }])
    expect(Object.keys(adapter.requests[0]).sort()).toEqual([
      'bundleCompressed',
      'cssPrettyEnabled',
      'cssStyle',
      'deliverables',
      'imageLayerFlattenEnabled',
      'nestedSuppressionEnabled',
      'outputDir',
      'protocolVersion',
      'scales',
      'smartMergeEnabled',
      'sourcePath',
      'taskId',
      'tokenTop',
    ])
    expect((wrapper.get('[data-testid="scale-1"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.get('[data-testid="scale-2"]').element as HTMLInputElement).checked).toBe(false)
    expect((wrapper.get('[data-testid="bundle-compressed"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
  })

  it('通过原生路径选择器更新源文件和输出目录', async () => {
    const chooseSource = vi.fn().mockResolvedValue('D:\\design\\selected.psd')
    const chooseOutput = vi.fn().mockResolvedValue('D:\\deliveries\\selected')
    const { wrapper } = mountWorkspace()

    await wrapper.setProps({ pathChooser: { chooseSource, chooseOutput } })
    await wrapper.get('[data-testid="choose-source"]').trigger('click')
    await wrapper.get('[data-testid="choose-output"]').trigger('click')
    await settle()

    expect(chooseSource).toHaveBeenCalledOnce()
    expect(chooseOutput).toHaveBeenCalledOnce()
    expect((wrapper.get('[data-testid="source-path"]').element as HTMLInputElement).value).toBe('D:\\design\\selected.psd')
    expect((wrapper.get('[data-testid="output-dir"]').element as HTMLInputElement).value).toBe('D:\\deliveries\\selected')
  })

  it('校验路径和倍率后才创建任务', async () => {
    const { adapter, wrapper } = mountWorkspace()

    await wrapper.get('[data-testid="scale-1"]').setValue(false)
    await wrapper.get('[data-testid="scale-2"]').setValue(false)
    await wrapper.get('form').trigger('submit')
    await settle()

    expect(adapter.requests).toHaveLength(0)
    expect(wrapper.text()).toContain('请填写 PSD 或 PSB 文件路径')
    expect(wrapper.text()).toContain('请填写输出目录')
    expect(wrapper.text()).toContain('至少选择一个输出倍率')
  })

  it('桌面能力不可用时禁用提交并显示事实性提示', () => {
    const wrapper = mount(ConversionWorkspace, {
      props: {
        jobModule: new MockDesktopJobModule(),
        canStart: false,
        unavailableMessage: '浏览器版不执行本机转换',
      },
      global: {
        stubs: {
          AppScrollArea: { template: '<div><slot /></div>' },
        },
      },
    })
    wrappers.push(wrapper)

    expect(wrapper.get('[data-testid="start-conversion"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('浏览器版不执行本机转换')
  })

  it('轮询投影阶段日志并在登记 Bundle 后仅请求打开一次', async () => {
    const { adapter, wrapper } = mountWorkspace()

    await submitValidForm(wrapper)
    const request = adapter.requests[0]
    adapter.setJob(runningJob(request))
    await vi.advanceTimersByTimeAsync(700)
    await settle()

    expect(wrapper.text()).toContain('转换中')
    expect(wrapper.text()).toContain('导出标记切图 2 / 6')
    expect(wrapper.text()).toContain('[stdout] assets ready')
    expect(wrapper.text()).toContain('[stderr] diagnostic line')
    expect(wrapper.text()).toContain('[low-contrast] 需要人工确认')

    adapter.setJob({
      ...runningJob(request),
      status: 'succeeded',
      finishedAt: 20,
      artifacts: [{ artifactId: 'bundle', kind: 'bundle', label: 'home.psd-bundle.zip' }],
      events: [
        ...runningJob(request).events,
        { type: 'artifact', artifactId: 'bundle', kind: 'bundle', label: 'home.psd-bundle.zip' },
        {
          type: 'completed',
          taskId,
          outputDir: request.outputDir,
          artifacts: [{ artifactId: 'bundle', kind: 'bundle', label: 'home.psd-bundle.zip' }],
        },
      ],
    })
    await vi.advanceTimersByTimeAsync(700)
    await settle()

    expect(wrapper.emitted('generatedBundle')).toEqual([[taskId]])
    expect(wrapper.text()).toContain('已生成看稿 Bundle，等待打开')
  })

  it('取消当前任务并保留路径字段', async () => {
    const { adapter, wrapper } = mountWorkspace()

    await submitValidForm(wrapper)
    await wrapper.get('[data-testid="cancel-conversion"]').trigger('click')
    await settle()

    expect(wrapper.text()).toContain('已取消')
    expect(wrapper.get('[data-testid="source-path"]').element.value).toBe('D:\\design\\home.psd')
    expect(wrapper.get('[data-testid="output-dir"]').element.value).toBe('D:\\deliveries')
  })

  it('保留成功任务并允许重试看稿导入', async () => {
    const { adapter, wrapper } = mountWorkspace()

    await submitValidForm(wrapper)
    const request = adapter.requests[0]
    adapter.setJob({
      ...runningJob(request),
      status: 'succeeded',
      finishedAt: 20,
      artifacts: [{ artifactId: 'bundle', kind: 'bundle', label: 'home.psd-bundle.zip' }],
      events: [{
        type: 'completed',
        taskId,
        outputDir: request.outputDir,
        artifacts: [{ artifactId: 'bundle', kind: 'bundle', label: 'home.psd-bundle.zip' }],
      }],
    })
    await vi.advanceTimersByTimeAsync(700)
    await settle()

    await wrapper.setProps({
      generatedBundleImportState: {
        jobId: taskId,
        status: 'failed',
        code: 'invalid-archive',
        message: 'Bundle 校验失败',
      },
    })

    expect(wrapper.text()).toContain('转换成功但看稿导入失败')
    expect(wrapper.text()).toContain('Bundle 校验失败')
    expect(wrapper.text()).toContain('已完成')
    await wrapper.get('[data-testid="retry-open-generated"]').trigger('click')

    expect(wrapper.emitted('generatedBundle')).toEqual([[taskId], [taskId]])
  })

  it('未压缩输出不自动导入看稿并可打开输出目录', async () => {
    const openOutputDirectory = vi.fn().mockResolvedValue(undefined)
    const { adapter, wrapper } = mountWorkspace()

    await wrapper.setProps({ outputDirectoryOpener: { openOutputDirectory } })
    await wrapper.get('[data-testid="source-path"]').setValue('D:\\design\\home.psd')
    await wrapper.get('[data-testid="output-dir"]').setValue('D:\\deliveries')
    await wrapper.get('[data-testid="bundle-uncompressed"]').setValue()
    await wrapper.get('form').trigger('submit')
    await settle()

    const request = adapter.requests[0]
    expect(request.bundleCompressed).toBe(false)
    adapter.setJob({
      ...runningJob(request),
      status: 'succeeded',
      finishedAt: 20,
      artifacts: [{ artifactId: 'bundle', kind: 'bundle-directory', label: 'home.psd-bundle' }],
      events: [{
        type: 'completed',
        taskId,
        outputDir: request.outputDir,
        artifacts: [{ artifactId: 'bundle', kind: 'bundle-directory', label: 'home.psd-bundle' }],
      }],
    })
    await vi.advanceTimersByTimeAsync(700)
    await settle()

    expect(wrapper.emitted('generatedBundle')).toBeUndefined()
    expect(wrapper.text()).toContain('已生成未压缩 Bundle 文件夹')
    await wrapper.get('[data-testid="open-output-directory"]').trigger('click')
    await settle()
    expect(openOutputDirectory).toHaveBeenCalledWith(taskId)
  })
})
