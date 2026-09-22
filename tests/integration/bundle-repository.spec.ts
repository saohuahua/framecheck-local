import { describe, expect, it } from 'vitest'
import {
  BundleRepository,
  type BundleImporter,
  type BundleRepositoryDependencies,
} from '../../src/features/bundle/bundle-repository'
import type { GeneratedBundleReader } from '../../src/features/bundle/generated-bundle-reader'
import { BundleError, type LocalBundleRecord, type PortableBundleSummary } from '../../src/features/bundle/types'

const summary: PortableBundleSummary = {
  archiveName: 'screen.psd-bundle.zip',
  archiveSize: 512,
  sourceName: 'screen.psd',
  sourceSha256: 'b'.repeat(64),
  portableSchemaVersion: '1.0.0',
  status: 'ready',
  storageBytes: 2048,
  canvasWidth: 100,
  canvasHeight: 200,
  diagnosticsCount: 0,
  assetPaths: [],
}

class FakeImporter implements BundleImporter {
  prepareCalls = 0
  extractCalls = 0
  cancelled = false
  terminated = false
  prepareError?: Error
  receivedFile?: File

  async prepare(_jobId: string, file: File): Promise<PortableBundleSummary> {
    this.prepareCalls += 1
    this.receivedFile = file
    if (this.prepareError) {
      throw this.prepareError
    }
    return summary
  }

  async extract(): Promise<void> {
    this.extractCalls += 1
    if (this.cancelled) {
      throw new BundleError('cancelled', '导入已取消')
    }
  }

  cancel() {
    this.cancelled = true
  }

  terminate() {
    this.terminated = true
  }
}

class FakeGeneratedBundleReader implements GeneratedBundleReader {
  calls: string[] = []
  error?: Error

  constructor(private readonly file: File) {}

  async read(jobId: string): Promise<File> {
    this.calls.push(jobId)
    if (this.error) {
      throw this.error
    }
    return this.file
  }
}

function makeDependencies(importer: FakeImporter, overrides: Partial<BundleRepositoryDependencies> = {}) {
  const records = new Map<string, LocalBundleRecord>()
  const commits: Array<[string, string]> = []
  const deleted: string[] = []
  let id = 0
  const dependencies: BundleRepositoryDependencies = {
    index: {
      async delete(localBundleId) {
        records.delete(localBundleId)
      },
      async findCacheHit(sourceSha256, portableSchemaVersion) {
        return [...records.values()].find((record) => (
          record.sourceSha256 === sourceSha256 && record.portableSchemaVersion === portableSchemaVersion
        ))
      },
      async get(localBundleId) {
        return records.get(localBundleId)
      },
      async list() {
        return [...records.values()]
      },
      async put(record) {
        records.set(record.localBundleId, record)
      },
      async updateOpened() {},
      async updatePreferences() {},
    },
    storage: {
      async commitStaging(stagingPrefix, storagePrefix) {
        commits.push([stagingPrefix, storagePrefix])
      },
      async deletePrefix(prefix) {
        deleted.push(prefix)
      },
      async isSupported() {
        return true
      },
      async listFiles() {
        return []
      },
      async readFile() {
        return new File([], 'artifact')
      },
    },
    storageManager: {
      async ensureAvailable() {},
      async requestPersistence() {
        return true
      },
    },
    createImporter: () => importer,
    now: () => new Date('2026-09-16T00:00:00.000Z'),
    makeId: () => `local-${++id}`,
    ...overrides,
  }

  return { commits, deleted, dependencies, records }
}

describe('BundleRepository', () => {
  it('提交合法导入后才写入本地索引', async () => {
    const importer = new FakeImporter()
    const { commits, dependencies, records } = makeDependencies(importer)
    const repository = new BundleRepository(dependencies)
    const file = new File(['zip'], 'screen.psd-bundle.zip')

    const record = await repository.createImportTask(file, () => {}).promise

    expect(importer.prepareCalls).toBe(1)
    expect(importer.receivedFile).toBe(file)
    expect(importer.extractCalls).toBe(1)
    expect(commits).toEqual([['staging/local-1', 'bundles/local-2']])
    expect(records.get(record.localBundleId)?.storagePrefix).toBe('bundles/local-2')
    expect(importer.terminated).toBe(true)
  })

  it('命中缓存时不解压也不提交 staging', async () => {
    const importer = new FakeImporter()
    const { commits, dependencies, records } = makeDependencies(importer)
    const cached: LocalBundleRecord = {
      localBundleId: 'cached',
      importedAt: '2026-09-15T00:00:00.000Z',
      archiveName: summary.archiveName,
      archiveSize: summary.archiveSize,
      sourceSha256: summary.sourceSha256,
      portableSchemaVersion: summary.portableSchemaVersion,
      storagePrefix: 'bundles/cached',
      status: 'ready',
      storageBytes: summary.storageBytes,
      canvasWidth: summary.canvasWidth,
      canvasHeight: summary.canvasHeight,
      diagnosticsCount: 0,
    }
    records.set(cached.localBundleId, cached)
    const repository = new BundleRepository(dependencies)

    const record = await repository.createImportTask(new File(['zip'], 'screen.psd-bundle.zip'), () => {}).promise

    expect(record.localBundleId).toBe('cached')
    expect(importer.extractCalls).toBe(0)
    expect(commits).toEqual([])
  })

  it('取消导入后清理 staging 且不写入记录', async () => {
    const importer = new FakeImporter()
    importer.prepareError = new BundleError('cancelled', '导入已取消')
    const { deleted, dependencies, records } = makeDependencies(importer)
    const repository = new BundleRepository(dependencies)

    await expect(
      repository.createImportTask(new File(['zip'], 'screen.psd-bundle.zip'), () => {}).promise,
    ).rejects.toMatchObject({ code: 'cancelled' })

    expect(deleted).toContain('staging/local-1')
    expect(records.size).toBe(0)
  })

  it('本地空间不足时不解压且不写入记录', async () => {
    const importer = new FakeImporter()
    const { dependencies, records } = makeDependencies(importer, {
      storageManager: {
        async ensureAvailable() {
          throw new BundleError('storage-full', '本地可用空间不足')
        },
        async requestPersistence() {
          return true
        },
      },
    })
    const repository = new BundleRepository(dependencies)

    await expect(
      repository.createImportTask(new File(['zip'], 'screen.psd-bundle.zip'), () => {}).promise,
    ).rejects.toMatchObject({ code: 'storage-full' })

    expect(importer.extractCalls).toBe(0)
    expect(records.size).toBe(0)
  })

  it('删除 Bundle 时同时移除 OPFS 前缀和索引', async () => {
    const importer = new FakeImporter()
    const { deleted, dependencies, records } = makeDependencies(importer)
    const record: LocalBundleRecord = {
      localBundleId: 'to-delete',
      importedAt: '2026-09-15T00:00:00.000Z',
      archiveName: summary.archiveName,
      archiveSize: summary.archiveSize,
      sourceSha256: summary.sourceSha256,
      portableSchemaVersion: summary.portableSchemaVersion,
      storagePrefix: 'bundles/to-delete',
      status: 'ready',
      storageBytes: summary.storageBytes,
      canvasWidth: summary.canvasWidth,
      canvasHeight: summary.canvasHeight,
      diagnosticsCount: 0,
    }
    records.set(record.localBundleId, record)
    const repository = new BundleRepository(dependencies)

    await repository.delete(record.localBundleId)

    expect(deleted).toContain('bundles/to-delete')
    expect(records.has(record.localBundleId)).toBe(false)
  })

  it('生成 Bundle 与手动导入复用校验和本地存储链路', async () => {
    const file = new File(['zip'], 'screen.psd-bundle.zip')
    const browserImporter = new FakeImporter()
    const generatedImporter = new FakeImporter()
    const reader = new FakeGeneratedBundleReader(file)
    const browserDependencies = makeDependencies(browserImporter)
    const generatedDependencies = makeDependencies(generatedImporter, { generatedBundleReader: reader })
    const browserRepository = new BundleRepository(browserDependencies.dependencies)
    const generatedRepository = new BundleRepository(generatedDependencies.dependencies)

    const browserRecord = await browserRepository.importBrowserFile(file)
    const generatedRecord = await generatedRepository.openGenerated('desktop-job-42')

    expect(reader.calls).toEqual(['desktop-job-42'])
    expect(generatedImporter.receivedFile).toBe(file)
    expect(generatedImporter.prepareCalls).toBe(browserImporter.prepareCalls)
    expect(generatedImporter.extractCalls).toBe(browserImporter.extractCalls)
    expect(generatedDependencies.commits).toEqual(browserDependencies.commits)
    expect(browserRecord.provenance).toEqual({ type: 'browser-file' })
    expect(generatedRecord.provenance).toEqual({ type: 'generated', jobId: 'desktop-job-42' })
  })

  it('生成 Bundle 命中缓存时不重复解压或提交 staging', async () => {
    const importer = new FakeImporter()
    const reader = new FakeGeneratedBundleReader(new File(['zip'], 'screen.psd-bundle.zip'))
    const { commits, dependencies, records } = makeDependencies(importer, { generatedBundleReader: reader })
    const cached: LocalBundleRecord = {
      localBundleId: 'cached',
      importedAt: '2026-09-15T00:00:00.000Z',
      archiveName: summary.archiveName,
      archiveSize: summary.archiveSize,
      sourceSha256: summary.sourceSha256,
      portableSchemaVersion: summary.portableSchemaVersion,
      storagePrefix: 'bundles/cached',
      status: 'ready',
      storageBytes: summary.storageBytes,
      canvasWidth: summary.canvasWidth,
      canvasHeight: summary.canvasHeight,
      diagnosticsCount: 0,
      provenance: { type: 'browser-file' },
    }
    records.set(cached.localBundleId, cached)
    const repository = new BundleRepository(dependencies)

    const record = await repository.openGenerated('desktop-job-42')

    expect(reader.calls).toEqual(['desktop-job-42'])
    expect(record).toBe(cached)
    expect(importer.prepareCalls).toBe(1)
    expect(importer.extractCalls).toBe(0)
    expect(commits).toEqual([])
  })

  it('未配置 reader 和不存在的桌面任务返回稳定领域错误', async () => {
    const importer = new FakeImporter()
    const { dependencies } = makeDependencies(importer)
    const unavailableRepository = new BundleRepository(dependencies)

    await expect(unavailableRepository.openGenerated('desktop-job-42'))
      .rejects.toMatchObject({ code: 'generated-bundle-unavailable' })

    const reader = new FakeGeneratedBundleReader(new File(['zip'], 'screen.psd-bundle.zip'))
    reader.error = new BundleError('generated-bundle-not-found', '桌面任务不存在')
    const missingDependencies = makeDependencies(new FakeImporter(), { generatedBundleReader: reader })
    const missingRepository = new BundleRepository(missingDependencies.dependencies)

    await expect(missingRepository.openGenerated('desktop-job-42'))
      .rejects.toMatchObject({ code: 'generated-bundle-not-found' })
  })

  it('reader 失败和非法生成 Bundle 不会跳过领域校验', async () => {
    const reader = new FakeGeneratedBundleReader(new File(['zip'], 'screen.psd-bundle.zip'))
    reader.error = new Error('native read failed')
    const failedDependencies = makeDependencies(new FakeImporter(), { generatedBundleReader: reader })
    const failedRepository = new BundleRepository(failedDependencies.dependencies)

    await expect(failedRepository.openGenerated('desktop-job-42'))
      .rejects.toMatchObject({ code: 'generated-bundle-read-failed' })

    const invalidImporter = new FakeImporter()
    invalidImporter.prepareError = new BundleError('unsafe-path', 'ZIP 包含不安全路径')
    const invalidReader = new FakeGeneratedBundleReader(new File(['zip'], 'screen.psd-bundle.zip'))
    const invalidDependencies = makeDependencies(invalidImporter, { generatedBundleReader: invalidReader })
    const invalidRepository = new BundleRepository(invalidDependencies.dependencies)

    await expect(invalidRepository.openGenerated('desktop-job-42'))
      .rejects.toMatchObject({ code: 'unsafe-path' })
    expect(invalidImporter.extractCalls).toBe(0)
  })

  it('取消生成 Bundle 读取后不会启动导入', async () => {
    let resolveFile: ((file: File) => void) | undefined
    const reader: GeneratedBundleReader = {
      read() {
        return new Promise<File>((resolve) => {
          resolveFile = resolve
        })
      },
    }
    const importer = new FakeImporter()
    const { dependencies } = makeDependencies(importer, { generatedBundleReader: reader })
    const repository = new BundleRepository(dependencies)
    const progress: string[] = []
    const task = repository.createGeneratedImportTask('desktop-job-42', (state) => {
      progress.push(state.status)
    })

    task.cancel()
    await expect(task.promise).rejects.toMatchObject({ code: 'cancelled' })
    expect(importer.prepareCalls).toBe(0)
    expect(progress).toEqual(['importing', 'cancelled'])

    resolveFile?.(new File(['zip'], 'screen.psd-bundle.zip'))
    await Promise.resolve()
    expect(importer.prepareCalls).toBe(0)
  })

  it('生成 Bundle 的空间不足保持既有状态语义', async () => {
    const importer = new FakeImporter()
    const reader = new FakeGeneratedBundleReader(new File(['zip'], 'screen.psd-bundle.zip'))
    const { dependencies, records } = makeDependencies(importer, {
      generatedBundleReader: reader,
      storageManager: {
        async ensureAvailable() {
          throw new BundleError('storage-full', '本地可用空间不足')
        },
        async requestPersistence() {
          return true
        },
      },
    })
    const repository = new BundleRepository(dependencies)

    await expect(repository.openGenerated('desktop-job-42'))
      .rejects.toMatchObject({ code: 'storage-full' })

    expect(importer.extractCalls).toBe(0)
    expect(records.size).toBe(0)
  })
})
