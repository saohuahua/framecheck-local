import { expect, test } from '@playwright/test'

test('画布工具提示在浮层之上完整可读', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: '测量工具' })
  await trigger.hover()

  const tooltip = page.locator('.fc-tooltip').filter({ hasText: '测量 M' })
  await expect(tooltip).toBeVisible()
  const state = await tooltip.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const topElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return {
      height: rect.height,
      topElementClass: topElement?.className ?? '',
      width: rect.width,
      zIndex: style.zIndex,
    }
  })

  expect(state.width).toBeGreaterThan(30)
  expect(state.height).toBeGreaterThan(20)
  expect(state.zIndex).toBe('20')
  expect(state.topElementClass).toContain('fc-tooltip')
})
