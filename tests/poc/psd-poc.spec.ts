import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { PsdPocRunResult } from '../../src/features/psd-poc/psd-poc-controller'

interface PsdPocFixture {
  id: string
  outputDirectory: string
  runs: number
  sourceBytes: number
  sourcePath: string
}

interface PsdPocManifest {
  fixtures: PsdPocFixture[]
}

interface BrowserRun {
  browser: {
    crossOriginIsolated: boolean
    deviceMemoryGiB: number | null
    userAgent: string
    version: string
  }
  externalRequests: string[]
  fixtureId: string
  mainHeap: {
    method: string
    sampleCount: number
    sampledPeakBytes: number | null
  }
  result: PsdPocRunResult
  runIndex: number
  workerUrls: string[]
}

const manifestPath = process.env.FRAMECHECK_PSD_POC_MANIFEST
const resultsPath = process.env.FRAMECHECK_PSD_POC_RESULTS
const enabled = Boolean(manifestPath && resultsPath)
const pocTest = enabled ? test : test.skip
const manifest = enabled
  ? JSON.parse(await readFile(manifestPath!, 'utf8')) as PsdPocManifest
  : { fixtures: [] as PsdPocFixture[] }
const browserRuns: BrowserRun[] = []
let cancellation: PsdPocRunResult | undefined

test.describe.configure({ mode: 'serial' })

for (const fixture of manifest.fixtures) {
  for (let runIndex = 1; runIndex <= fixture.runs; runIndex += 1) {
    pocTest(`${fixture.id} Worker 解析第 ${runIndex} 次`, async ({ browser, page }) => {
      const externalRequests: string[] = []
      const workerUrls: string[] = []
      page.on('request', (request) => {
        const url = request.url()
        if (/^https?:\/\//.test(url) && !url.startsWith('http://127.0.0.1:4173')) {
          externalRequests.push(url)
        }
      })
      page.on('worker', (worker) => {
        workerUrls.push(worker.url())
      })

      await page.goto('/tests/poc/psd-poc.html')
      await expect(page).toHaveTitle('Framecheck PSD Worker POC')
      await page.waitForFunction(() => Boolean(window.__framecheckPsdPoc))
      const browserDetails = await page.evaluate(() => {
        const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number }
        return {
          crossOriginIsolated,
          deviceMemoryGiB: navigatorWithMemory.deviceMemory ?? null,
          userAgent: navigator.userAgent,
        }
      })
      const heapSampler = createMainHeapSampler(page)

      await page.locator('#psd-file').setInputFiles(fixture.sourcePath)
      await expect.poll(
        () => page.evaluate(() => window.__framecheckPsdPoc?.getLastResult()?.status),
        { timeout: 65_000 },
      ).not.toBeUndefined()
      const heap = await heapSampler.stop()
      const result = await page.evaluate(() => window.__framecheckPsdPoc?.getLastResult())
      expect(result).toBeDefined()
      expect(externalRequests).toEqual([])
      expect(workerUrls.some((url) => url.includes('psd-parser.worker'))).toBe(true)

      browserRuns.push({
        browser: { ...browserDetails, version: browser.version() },
        externalRequests,
        fixtureId: fixture.id,
        mainHeap: heap,
        result: result!,
        runIndex,
        workerUrls,
      })

      expect(result?.status).toBe('completed')
      if (result?.status === 'completed') {
        expect(result.report.file.size).toBe(fixture.sourceBytes)
        expect(result.report.preview).toMatchObject({
          status: 'decoded',
          width: result.report.header.width,
          height: result.report.header.height,
        })
        expect(result.report.storage.staging).toBe('not-created')
        expect(result.report.structure.layerCount).toBeGreaterThan(0)
      }
    })
  }
}

const cancellationFixture = manifest.fixtures.find((fixture) => fixture.id === 'homepage-200mb')

if (cancellationFixture) {
  pocTest('约 200 MB PSD 可取消且不创建 staging', async ({ page }) => {
    await page.goto('/tests/poc/psd-poc.html')
    await page.waitForFunction(() => Boolean(window.__framecheckPsdPoc))
    await page.locator('#psd-file').setInputFiles(cancellationFixture.sourcePath)
    await expect.poll(() => page.evaluate(() => window.__framecheckPsdPoc?.isRunning())).toBe(true)
    await page.getByRole('button', { name: '取消' }).click()
    await expect.poll(
      () => page.locator('#status').getAttribute('data-status'),
      { timeout: 10_000 },
    ).toBe('cancelled')

    cancellation = await page.evaluate(() => window.__framecheckPsdPoc?.getLastResult())
    expect(cancellation?.status).toBe('cancelled')
    expect(cancellation?.report?.storage.staging).toBe('not-created')
  })
}

test.afterAll(async () => {
  if (!enabled) {
    return
  }

  await mkdir(dirname(resultsPath!), { recursive: true })
  await writeFile(resultsPath!, JSON.stringify({ browserRuns, cancellation }, null, 2))
})

function createMainHeapSampler(page: Page) {
  let running = true
  const samples: number[] = []
  const sessionPromise = page.context().newCDPSession(page)
  const sampling = (async () => {
    const session = await sessionPromise
    await session.send('Performance.enable')
    while (running) {
      const metrics = await session.send('Performance.getMetrics') as {
        metrics: Array<{ name: string, value: number }>
      }
      const usedHeap = metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value
      if (usedHeap !== undefined) {
        samples.push(usedHeap)
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await session.detach()
  })()

  return {
    async stop() {
      running = false
      await sampling
      return {
        method: 'CDP Performance JSHeapUsedSize main target only',
        sampleCount: samples.length,
        sampledPeakBytes: samples.length ? Math.max(...samples) : null,
      }
    },
  }
}
