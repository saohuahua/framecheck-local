import { describe, expect, it } from 'vitest'
import {
  BrowserMockAdapter,
  DesktopBridgeUnavailableError,
  TauriDesktopJobAdapter,
  isTauriRuntime,
  type StartJobRequest,
} from '../../src/desktop-bridge'

function request(taskId: string): StartJobRequest {
  return {
    protocolVersion: '1',
    taskId,
    sourcePath: 'D:/design/home.psd',
    outputDir: 'D:/deliveries',
    deliverables: ['delivery'],
    bundleCompressed: true,
    scales: [1, 2],
    tokenTop: 30,
    cssStyle: 'compact',
    cssPrettyEnabled: true,
    smartMergeEnabled: true,
    imageLayerFlattenEnabled: false,
  }
}

describe('desktop bridge', () => {
  it('浏览器 mock 可驱动任务事件和已登记 Bundle', async () => {
    const adapter = new BrowserMockAdapter()
    const events: string[] = []
    const unlisten = await adapter.subscribe((event) => events.push(event.type))
    const started = await adapter.start(request('job-1'))

    await adapter.emit(started.jobId, {
      type: 'stage',
      key: 'delivery',
      label: '生成看稿交付',
      current: 1,
      total: 2,
    })
    await adapter.complete(started.jobId, new File(['bundle'], 'home.psd-bundle.zip', { type: 'application/zip' }))

    const job = await adapter.get(started.jobId)
    const bundle = await adapter.read(started.jobId)

    expect(job.status).toBe('succeeded')
    expect(job.artifacts).toEqual([{ artifactId: 'bundle', kind: 'bundle', label: 'home.psd-bundle.zip' }])
    expect(events).toEqual(['started', 'stage', 'artifact', 'completed'])
    expect(bundle.name).toBe('home.psd-bundle.zip')
    unlisten()
  })

  it('mock 只按已完成任务 ID 读取 Bundle', async () => {
    const adapter = new BrowserMockAdapter()
    const started = await adapter.start(request('job-2'))

    await expect(adapter.read(started.jobId)).rejects.toThrow('任务尚未生成可读取的 Bundle')
    await expect(adapter.read('missing')).rejects.toThrow('任务不存在')
  })

  it('未压缩 mock 仅登记目录而不开放看稿导入', async () => {
    const adapter = new BrowserMockAdapter()
    const started = await adapter.start({ ...request('job-3'), bundleCompressed: false })

    await adapter.complete(started.jobId, new File(['bundle'], 'home.psd-bundle.zip', { type: 'application/zip' }))

    await expect(adapter.read(started.jobId)).rejects.toThrow('未压缩 Bundle 无法直接导入看稿')
    expect((await adapter.get(started.jobId)).artifacts).toEqual([
      { artifactId: 'bundle', kind: 'bundle-directory', label: 'home.psd-bundle' },
    ])
  })

  it('浏览器环境不会调用 Tauri invoke', async () => {
    expect(isTauriRuntime()).toBe(false)

    await expect(new TauriDesktopJobAdapter().listRecent()).rejects.toBeInstanceOf(DesktopBridgeUnavailableError)
  })
})
