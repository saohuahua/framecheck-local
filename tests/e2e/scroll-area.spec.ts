import { expect, test, type Locator, type Page } from '@playwright/test'
import { createScrollableBundleFixture } from '../helpers/create-bundle'

async function scrollWithWheel(page: Page, locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) {
    throw new Error('滚动容器不可见')
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 640)
}

test('超长本地 Bundle 的左右栏都能滚动', async ({ page }) => {
  const fixture = await createScrollableBundleFixture()
  await page.goto('/')
  await page.getByRole('button', { name: '导入' }).click()
  await page.locator('input[type=file]').setInputFiles(fixture)
  await expect(page.getByRole('heading', { name: '已导入本地 Bundle' })).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()

  const inspector = page.getByRole('complementary', { name: '检查面板' })
  await inspector.locator('.fc-tab').filter({ hasText: '切图' }).click()

  const leftViewport = page.locator('.development-list__scroll [data-reka-scroll-area-viewport]')
  const rightViewport = page.locator('.inspector__scroll [data-reka-scroll-area-viewport]')
  await expect(leftViewport).toBeVisible()
  await expect(rightViewport).toBeVisible()

  await scrollWithWheel(page, leftViewport)
  await scrollWithWheel(page, rightViewport)

  await expect.poll(() => leftViewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect.poll(() => rightViewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
})
