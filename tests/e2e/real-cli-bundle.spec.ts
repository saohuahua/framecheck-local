import { expect, test } from '@playwright/test'
import { basename } from 'node:path'

const archivePath = process.env.FRAMECHECK_REAL_BUNDLE
const assetLayerId = process.env.FRAMECHECK_REAL_ASSET_LAYER_ID
const realBundleTest = archivePath && assetLayerId ? test : test.skip

realBundleTest('真实 CLI bundle 可导入、刷新、下载资源与删除缓存', async ({ page }) => {
  const archiveName = basename(archivePath!)
  const consoleIssues: string[] = []
  const externalRequests: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleIssues.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('request', (request) => {
    const url = request.url()
    if (/^https?:\/\//.test(url) && !url.startsWith('http://127.0.0.1:4173')) {
      externalRequests.push(request.url())
    }
  })

  await page.goto('/')
  await page.getByRole('button', { name: '导入' }).click()
  await page.locator('input[type=file]').setInputFiles(archivePath!)
  await expect(page.getByRole('heading', { name: /已导入本地 Bundle|已导入部分可用 Bundle/ })).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByText(archiveName, { exact: true })).toBeVisible()
  await expect(page.getByLabel('设计稿画布')).toBeVisible()

  await page.reload()
  await expect(page.getByText(archiveName, { exact: true })).toBeVisible()
  await page.locator(`.layer-tree__select[data-layer-id="${assetLayerId}"]`).click()
  await page.getByRole('tab', { name: /切图/ }).click()
  await expect(page.locator('.asset-preview img')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载资源' }).click()
  expect((await download).suggestedFilename()).not.toBe('')

  await page.getByRole('tab', { name: /文件/ }).click()
  await page.getByLabel('文件操作').click()
  await page.getByRole('menuitem', { name: '删除本地缓存' }).click()
  await page.getByRole('button', { name: '删除' }).click()
  await expect(page.getByText(archiveName, { exact: true })).toHaveCount(0)
  expect(consoleIssues).toEqual([])
  expect(externalRequests).toEqual([])
})
