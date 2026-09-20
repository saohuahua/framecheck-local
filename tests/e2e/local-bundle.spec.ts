import { expect, test } from '@playwright/test'
import { createValidBundleFixture } from '../helpers/create-bundle'

test('导入后刷新仍能重新打开本地 Bundle', async ({ page }) => {
  const fixture = await createValidBundleFixture()
  await page.goto('/')
  await page.getByRole('button', { name: '导入' }).click()
  await page.locator('input[type=file]').setInputFiles(fixture)
  await expect(page.getByText('已导入本地 Bundle', { exact: true })).toBeVisible()
  await expect(page.getByText('fixture.psd-bundle.zip', { exact: true })).toBeVisible()

  await page.reload()

  await expect(page.getByText('fixture.psd-bundle.zip', { exact: true })).toBeVisible()
  await expect(page.getByLabel('设计稿画布')).toBeVisible()
})

test('重复导入命中本地缓存且删除后移除记录', async ({ page }) => {
  const fixture = await createValidBundleFixture()
  await page.goto('/')
  await page.getByRole('button', { name: '导入' }).click()
  await page.locator('input[type=file]').setInputFiles(fixture)
  await expect(page.getByText('已导入本地 Bundle', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()

  await page.getByRole('button', { name: '导入' }).click()
  await page.locator('input[type=file]').setInputFiles(fixture)
  await expect(page.getByRole('heading', { name: '已从本地缓存打开' })).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()

  await page.getByRole('tab', { name: /文件/ }).click()
  await page.getByLabel('文件操作').click()
  await page.getByRole('menuitem', { name: '删除本地缓存' }).click()
  await page.getByRole('button', { name: '删除' }).click()
  await expect(page.getByText('fixture.psd-bundle.zip', { exact: true })).toHaveCount(0)
})

test('空间不足时不写入本地记录', async ({ page }) => {
  const fixture = await createValidBundleFixture()
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'estimate', {
      configurable: true,
      value: async () => ({ quota: 1, usage: 1 }),
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '导入' }).click()
  await page.locator('input[type=file]').setInputFiles(fixture)
  await expect(page.getByText('本地空间不足', { exact: true })).toBeVisible()
  await expect(page.getByText('fixture.psd-bundle.zip', { exact: true })).toHaveCount(0)
})
