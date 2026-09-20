import { expect, test, type Page } from '@playwright/test'
import { createSelectionBundleFixture } from '../helpers/create-bundle'

async function clickCanvasPoint(page: Page, x: number, y: number) {
  const transform = page.locator('.canvas-stage__transform')
  const box = await transform.boundingBox()
  const canvasWidth = Number(await page.locator('.canvas-stage__overlay').getAttribute('width'))
  if (!box || !canvasWidth) {
    throw new Error('画布没有可用于命中的变换边界')
  }
  const scale = box.width / canvasWidth
  await page.mouse.click(box.x + x * scale, box.y + y * scale)
}

async function hoverCanvasPoint(page: Page, x: number, y: number) {
  const transform = page.locator('.canvas-stage__transform')
  const box = await transform.boundingBox()
  const canvasWidth = Number(await page.locator('.canvas-stage__overlay').getAttribute('width'))
  if (!box || !canvasWidth) {
    throw new Error('画布没有可用于命中的变换边界')
  }
  const scale = box.width / canvasWidth
  await page.mouse.move(box.x + x * scale, box.y + y * scale)
}

async function dragCanvasPoint(page: Page, startX: number, startY: number, endX: number, endY: number) {
  const transform = page.locator('.canvas-stage__transform')
  const box = await transform.boundingBox()
  const canvasWidth = Number(await page.locator('.canvas-stage__overlay').getAttribute('width'))
  if (!box || !canvasWidth) {
    throw new Error('画布没有可用于拖拽的变换边界')
  }
  const scale = box.width / canvasWidth
  await page.mouse.move(box.x + startX * scale, box.y + startY * scale)
  await page.mouse.down()
  await page.mouse.move(box.x + endX * scale, box.y + endY * scale)
  await page.mouse.up()
}

test.describe('看稿对象选择', () => {
  test.use({ viewport: { width: 1440, height: 960 } })

  test('工具提示显示在画布浮层之上', async ({ page }) => {
    await page.goto('/')

    const trigger = page.getByRole('button', { name: '选择工具' })
    await trigger.hover()

    const tooltip = page.locator('.fc-tooltip')
    await expect(tooltip).toBeVisible()
    const metrics = await tooltip.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return {
        zIndex: getComputedStyle(element).zIndex,
        topmost: top === element || Boolean(top?.closest('.fc-tooltip')),
      }
    })

    expect(metrics.zIndex).toBe('20')
    expect(metrics.topmost).toBe(true)
  })

  test('画布忽略非开发图层但图层树仍可主动选择', async ({ page }) => {
    await page.goto('/')
    const inspector = page.getByRole('complementary', { name: '检查面板' })

    await page.locator('[data-development-id="text:hero-title"]').click()
    await clickCanvasPoint(page, 164, 517)

    await expect(inspector.getByRole('heading', { name: 'The Quiet Object' })).toBeVisible()

    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.locator('[data-layer-id="hero-button"]').click()
    await expect(inspector.getByRole('heading', { name: 'Explore object button' })).toBeVisible()
    await expect(inspector.getByText('外观参考', { exact: true })).toBeVisible()
  })

  test('开发元素和完整图层树都进入同一对象属性面板', async ({ page }) => {
    await page.goto('/')
    const inspector = page.getByRole('complementary', { name: '检查面板' })

    await page.locator('[data-development-id="text:hero-title"]').click()
    await expect(inspector.getByRole('heading', { name: 'The Quiet Object' })).toBeVisible()
    await expect(inspector.getByText('文本样式', { exact: true })).toBeVisible()
    await expect(inspector.locator('[data-object-geometry]')).toContainText(/X\s*84px\s*Y\s*208px\s*宽\s*550px\s*高\s*152px/)
    await expect(inspector.locator('.inspector__code')).toBeVisible()
    await expect(inspector.locator('.inspector__code-property')).toHaveCount(11)
    await expect(inspector.locator('.inspector__code-value.is-number')).toHaveCount(8)
    const propertyColor = await inspector.locator('.inspector__code-property').first().evaluate((element) => getComputedStyle(element).color)
    const numberColor = await inspector.locator('.inspector__code-value.is-number').first().evaluate((element) => getComputedStyle(element).color)
    const colorValue = await inspector.locator('.inspector__code-value.is-color').first().evaluate((element) => getComputedStyle(element).color)
    const keywordColor = await inspector.locator('.inspector__code-value.is-keyword').first().evaluate((element) => getComputedStyle(element).color)
    const codeBackground = await inspector.locator('.inspector__code').evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(new Set([propertyColor, numberColor, colorValue, keywordColor]).size).toBeGreaterThan(2)
    expect(codeBackground).toBe('rgb(241, 241, 241)')

    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.locator('[data-layer-id="speaker-render"]').click()
    await expect(inspector.getByRole('heading', { name: 'Speaker render' })).toBeVisible()
    await expect(inspector.getByText('nova-speaker.png', { exact: true })).toBeVisible()
    await expect(inspector.getByRole('button', { name: '下载切图' })).toBeVisible()
    await expect(inspector.locator('.asset-thumbnail--preview img')).toBeVisible()
  })

  test('切图 Tab 默认不高亮切图且支持按勾选下载', async ({ page }) => {
    await page.goto('/')
    const inspector = page.getByRole('complementary', { name: '检查面板' })

    await inspector.locator('.fc-tab').filter({ hasText: '切图' }).click()

    const assetCheckbox = page.getByRole('checkbox', { name: '高亮 Speaker render' })
    await expect(page.locator('.canvas-stage__asset-bounds')).toHaveCount(0)
    await expect(assetCheckbox).not.toBeChecked()
    await expect(inspector.getByRole('button', { name: '下载已选' })).toBeDisabled()
    await expect(inspector.getByRole('button', { name: '下载全部' })).toBeEnabled()

    await assetCheckbox.locator('..').click()
    await expect(page.locator('.canvas-stage__asset-bounds')).toHaveCount(1)
    await expect(assetCheckbox.locator('..').locator('.asset-catalog__checkbox svg')).toHaveCSS('opacity', '1')
    await expect(inspector.getByRole('button', { name: '下载已选' })).toBeEnabled()
    await expect(inspector.getByText('nova-speaker.png', { exact: true })).toBeVisible()
    await expect(inspector.locator('[data-asset-geometry]')).toContainText(/X\s*786px\s*Y\s*128px\s*宽\s*480px\s*高\s*486px/)
  })

  test('测量使用当前对象和悬浮对象计算距离', async ({ page }) => {
    await page.goto('/')
    const inspector = page.getByRole('complementary', { name: '检查面板' })

    await page.locator('[data-development-id="text:hero-title"]').click()
    await page.keyboard.press('m')
    await hoverCanvasPoint(page, 1026, 371)
    await inspector.locator('.fc-tab').filter({ hasText: '标注' }).click()

    await expect(inspector.getByText('水平距离', { exact: true })).toBeVisible()
    await expect(inspector.getByText('垂直距离', { exact: true })).toBeVisible()
  })

  test('默认选择模式以选中图层为基准显示红色正交边距', async ({ page }) => {
    await page.goto('/')

    await page.locator('[data-development-id="text:hero-title"]').click()
    await hoverCanvasPoint(page, 1026, 371)

    const measurement = page.locator('.canvas-stage__measurement')
    await expect(measurement).toBeVisible()
    await expect(measurement.locator('[data-measure-segment="gap"]')).toHaveCount(1)

    const segment = measurement.locator('[data-measure-segment="gap"]')
    await expect(segment).toHaveAttribute('data-measure-axis', 'horizontal')
    await expect(segment).toHaveAttribute('x1', '634')
    await expect(segment).toHaveAttribute('x2', '786')
    await expect(segment).toHaveAttribute('y1', '284')
    await expect(segment).toHaveAttribute('y2', '284')
    await expect(segment).toHaveCSS('stroke', 'rgb(217, 45, 32)')
    await expect(segment).toHaveCSS('stroke-dasharray', 'none')
  })

  test('悬浮画布空白处时展示背景边距和选框尺寸', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-development-id="text:hero-title"]').click()

    await hoverCanvasPoint(page, 700, 600)

    const measurement = page.locator('.canvas-stage__measurement')
    await expect(measurement).toHaveAttribute('data-measurement-source', 'canvas')
    await expect(measurement).toContainText('84px')
    await expect(measurement).toContainText('806px')
    await expect(measurement).toContainText('208px')
    await expect(measurement).toContainText('640px')
    await expect(page.locator('[data-selected-size]')).toContainText('550 x 152 px')
    await expect(page.locator('[data-selected-size] rect')).toHaveCSS('fill', 'rgb(17, 17, 17)')
  })

  test('测量点击第二对象会锁定距离目标', async ({ page }) => {
    await page.goto('/')
    const inspector = page.getByRole('complementary', { name: '检查面板' })

    await page.locator('[data-development-id="text:hero-title"]').click()
    await page.keyboard.press('m')
    await clickCanvasPoint(page, 1026, 371)
    await inspector.locator('.fc-tab').filter({ hasText: '标注' }).click()

    await expect(inspector.getByText('Speaker render -h-', { exact: true })).toBeVisible()
    await expect(inspector.getByText('水平距离', { exact: true })).toBeVisible()
  })

  test('卷尺测量按主导方向锁定为水平直线', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '卷尺工具' }).click()
    await dragCanvasPoint(page, 100, 100, 220, 150)

    const measurement = page.locator('[data-ruler-measurement="distance"]')
    await expect(measurement).toBeVisible()
    await expect(measurement).toContainText('水平 120 px')
    await expect(measurement.locator('line')).toHaveAttribute('x1', '100')
    await expect(measurement.locator('line')).toHaveAttribute('y1', '100')
    await expect(measurement.locator('line')).toHaveAttribute('x2', '220')
    await expect(measurement.locator('line')).toHaveAttribute('y2', '100')
    await hoverCanvasPoint(page, 1026, 371)
    await expect(measurement.locator('line')).toHaveAttribute('x1', '100')
    await expect(measurement.locator('line')).toHaveAttribute('y1', '100')
    await expect(measurement.locator('line')).toHaveAttribute('x2', '220')
    await expect(measurement.locator('line')).toHaveAttribute('y2', '100')
    await expect(page.locator('.canvas-stage__measurement')).toHaveCount(0)
  })

  test('选中文案不影响卷尺两点测量', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-development-id="text:hero-title"]').click()
    await page.getByRole('button', { name: '卷尺工具' }).click()
    await dragCanvasPoint(page, 700, 600, 820, 650)

    const measurement = page.locator('[data-ruler-measurement="distance"]')
    await expect(measurement).toBeVisible()
    await expect(measurement).toContainText('水平 120 px')
    await expect(measurement.locator('line')).toHaveAttribute('x1', '700')
    await expect(measurement.locator('line')).toHaveAttribute('y1', '600')
    await expect(measurement.locator('line')).toHaveAttribute('x2', '820')
    await expect(measurement.locator('line')).toHaveAttribute('y2', '600')
  })

  test('选中切图不影响卷尺两点测量', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-development-id="asset:asset-speaker:placement-speaker"]').click()
    await page.getByRole('button', { name: '卷尺工具' }).click()
    await dragCanvasPoint(page, 700, 600, 750, 720)

    const measurement = page.locator('[data-ruler-measurement="distance"]')
    await expect(measurement).toBeVisible()
    await expect(measurement).toContainText('垂直 120 px')
    await expect(measurement.locator('line')).toHaveAttribute('x1', '700')
    await expect(measurement.locator('line')).toHaveAttribute('y1', '600')
    await expect(measurement.locator('line')).toHaveAttribute('x2', '700')
    await expect(measurement.locator('line')).toHaveAttribute('y2', '720')
  })

  test('文案区域优先选文案并在同一点重复点击后穿透到完整切图', async ({ page }) => {
    const fixture = await createSelectionBundleFixture()
    await page.goto('/')
    await page.getByRole('button', { name: '导入' }).click()
    await page.locator('input[type=file]').setInputFiles(fixture)
    await expect(page.getByText('已导入本地 Bundle', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    const inspector = page.getByRole('complementary', { name: '检查面板' })
    await clickCanvasPoint(page, 100, 100)
    await expect(inspector.getByRole('heading', { name: 'Overlay copy' })).toBeVisible()

    await clickCanvasPoint(page, 100, 100)
    await expect(inspector.getByRole('heading', { name: 'Hero cutout' })).toBeVisible()
    await expect(inspector.getByText('hero-cutout.png', { exact: true })).toBeVisible()
    const selectedBounds = page.locator('.canvas-stage__selected-bounds')
    await expect(selectedBounds).toHaveAttribute('x', '20')
    await expect(selectedBounds).toHaveAttribute('y', '20')
    await expect(selectedBounds).toHaveAttribute('width', '280')
    await expect(selectedBounds).toHaveAttribute('height', '180')

    await inspector.locator('.fc-tab').filter({ hasText: '标注' }).click()
    await expect(inspector.locator('.geometry-grid')).toContainText(/X\s*20px\s*Y\s*20px\s*宽\s*280px\s*高\s*180px/)

    await hoverCanvasPoint(page, 100, 100)
    const measureTargetBounds = page.locator('.canvas-stage__target-bounds')
    await expect(measureTargetBounds).toHaveAttribute('x', '80')
    await expect(measureTargetBounds).toHaveAttribute('y', '80')
    await expect(page.locator('.canvas-stage__measurement')).toContainText('80px')

    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.locator('[data-layer-id="selection-mask"]').click()
    await expect(inspector.getByRole('heading', { name: 'Selection mask' })).toBeVisible()

    await clickCanvasPoint(page, 100, 100)
    await expect(inspector.getByRole('heading', { name: 'Overlay copy' })).toBeVisible()

    await clickCanvasPoint(page, 100, 100)
    await expect(inspector.getByRole('heading', { name: 'Hero cutout' })).toBeVisible()

    await clickCanvasPoint(page, 30, 30)
    await expect(inspector.getByRole('heading', { name: 'Hero cutout' })).toBeVisible()
    await expect(inspector.getByText('Selection mask', { exact: true })).toHaveCount(0)
  })

  test('同时导出为切图的文案仍先进入文案属性', async ({ page }) => {
    const fixture = await createSelectionBundleFixture()
    await page.goto('/')
    await page.getByRole('button', { name: '导入' }).click()
    await page.locator('input[type=file]').setInputFiles(fixture)
    await expect(page.getByText('已导入本地 Bundle', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    const inspector = page.getByRole('complementary', { name: '检查面板' })
    await clickCanvasPoint(page, 30, 220)
    await expect(inspector.getByRole('heading', { name: 'Exported label' })).toBeVisible()
    await expect(inspector.getByText('文案属性', { exact: true })).toBeVisible()
    await expect(inspector.locator('[data-object-geometry]')).toContainText(/X\s*20px\s*Y\s*210px\s*宽\s*120px\s*高\s*20px/)
    await expect(inspector.locator('.inspector__code')).toContainText(/left:\s*20px/)

    await clickCanvasPoint(page, 30, 220)
    await expect(inspector.getByText('exported-label.png', { exact: true })).toBeVisible()
    await expect(inspector.getByText('切图属性', { exact: true })).toBeVisible()
    await expect(inspector.locator('[data-object-geometry]')).toContainText(/X\s*10px\s*Y\s*205px\s*宽\s*140px\s*高\s*30px/)
    await expect(inspector.locator('.inspector__code')).toContainText(/left:\s*10px/)

    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.locator('[data-layer-id="exported-label"]').click()
    await expect(inspector.getByText('文案属性', { exact: true })).toBeVisible()
    await expect(inspector.locator('[data-object-geometry]')).toContainText(/X\s*20px\s*Y\s*210px\s*宽\s*120px\s*高\s*20px/)
  })

  test('切图预览操作在同一行等宽显示', async ({ page }) => {
    const fixture = await createSelectionBundleFixture()
    await page.goto('/')
    await page.getByRole('button', { name: '导入' }).click()
    await page.locator('input[type=file]').setInputFiles(fixture)
    await expect(page.getByText('已导入本地 Bundle', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    const inspector = page.getByRole('complementary', { name: '检查面板' })
    await clickCanvasPoint(page, 100, 100)
    await clickCanvasPoint(page, 100, 100)

    const actionMetrics = await inspector.locator('.property-actions--asset').evaluate((container) => {
      const containerRect = container.getBoundingClientRect()
      const buttons = [...container.querySelectorAll('button')].map((button) => button.getBoundingClientRect())
      return {
        containerWidth: containerRect.width,
        buttonWidths: buttons.map((rect) => rect.width),
        buttonTops: buttons.map((rect) => rect.top),
      }
    })
    expect(actionMetrics.buttonWidths).toHaveLength(2)
    expect(actionMetrics.buttonWidths[0]).toBeGreaterThan(actionMetrics.containerWidth * 0.45)
    expect(actionMetrics.buttonWidths[1]).toBeGreaterThan(actionMetrics.containerWidth * 0.45)
    expect(actionMetrics.buttonTops[0]).toBe(actionMetrics.buttonTops[1])
  })

  test('切图预览使用明确的区块名称', async ({ page }) => {
    const fixture = await createSelectionBundleFixture()
    await page.goto('/')
    await page.getByRole('button', { name: '导入' }).click()
    await page.locator('input[type=file]').setInputFiles(fixture)
    await expect(page.getByText('已导入本地 Bundle', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    const inspector = page.getByRole('complementary', { name: '检查面板' })
    await clickCanvasPoint(page, 100, 100)
    await clickCanvasPoint(page, 100, 100)

    await expect(inspector.getByText('切图预览', { exact: true })).toBeVisible()
    await expect(inspector.getByText('切图信息', { exact: true })).toBeVisible()
    await expect(inspector.getByText('资源预览', { exact: true })).toHaveCount(0)
  })

  test('参考 CSS 位于图层信息之前并默认展开', async ({ page }) => {
    const fixture = await createSelectionBundleFixture()
    await page.goto('/')
    await page.getByRole('button', { name: '导入' }).click()
    await page.locator('input[type=file]').setInputFiles(fixture)
    await expect(page.getByText('已导入本地 Bundle', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    const inspector = page.getByRole('complementary', { name: '检查面板' })
    await clickCanvasPoint(page, 100, 100)
    await clickCanvasPoint(page, 100, 100)

    await expect(inspector.locator('.inspector__code')).toBeVisible()
    const sectionLabels = await inspector.locator('.property-section__toggle').allTextContents()
    expect(sectionLabels.findIndex((label) => label.includes('参考 CSS'))).toBeLessThan(
      sectionLabels.findIndex((label) => label.includes('图层信息')),
    )
  })

  test('切图复制菜单支持路径 Data URL 和 Base64', async ({ page }) => {
    const fixture = await createSelectionBundleFixture()
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            document.documentElement.dataset.copiedText = value
          },
        },
      })
    })
    await page.goto('/')
    await page.getByRole('button', { name: '导入' }).click()
    await page.locator('input[type=file]').setInputFiles(fixture)
    await expect(page.getByText('已导入本地 Bundle', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    const inspector = page.getByRole('complementary', { name: '检查面板' })
    await clickCanvasPoint(page, 100, 100)
    await clickCanvasPoint(page, 100, 100)

    const copyMenu = inspector.locator('.property-actions--asset .fc-command-button').nth(1)
    await copyMenu.click()
    await page.getByRole('menuitem', { name: '复制路径' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-copied-text', 'assets/hero-cutout.png')

    await copyMenu.click()
    await page.getByRole('menuitem', { name: '复制 Data URL' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-copied-text', /^data:image\/png;base64,/)

    await copyMenu.click()
    await page.getByRole('menuitem', { name: '复制 Base64' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-copied-text', /^[A-Za-z0-9+/]+=*$/)
  })

  test('切图工具栏可下载全部切图', async ({ page }) => {
    const fixture = await createSelectionBundleFixture()
    await page.goto('/')
    await page.getByRole('button', { name: '导入' }).click()
    await page.locator('input[type=file]').setInputFiles(fixture)
    await expect(page.getByText('已导入本地 Bundle', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    const inspector = page.getByRole('complementary', { name: '检查面板' })
    await inspector.getByRole('tab', { name: '切图 2' }).click()
    const download = page.waitForEvent('download')
    await inspector.getByRole('button', { name: '下载全部' }).click()
    expect((await download).suggestedFilename()).toBe('全部切图.zip')
  })

  test('诊断只保留可行动的开发提示', async ({ page }) => {
    await page.goto('/')
    const inspector = page.getByRole('complementary', { name: '检查面板' })

    await expect(inspector.getByRole('tab', { name: '诊断 2' })).toHaveCount(0)
    const hints = inspector.getByRole('tab', { name: '提示 1' })
    await expect(hints).toBeVisible()
    await hints.click()
    await expect(inspector.getByText('effect_downgrade', { exact: true })).toBeVisible()
    await expect(inspector.getByText('missing_font', { exact: true })).toHaveCount(0)
  })

  test('文本样式和 CSS 数值最多保留一位小数', async ({ page }) => {
    const fixture = await createSelectionBundleFixture()
    await page.goto('/')
    await page.getByRole('button', { name: '导入' }).click()
    await page.locator('input[type=file]').setInputFiles(fixture)
    await expect(page.getByText('已导入本地 Bundle', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    const inspector = page.getByRole('complementary', { name: '检查面板' })
    await clickCanvasPoint(page, 100, 100)

    await expect(inspector.locator('.property-facts--style')).toContainText(/大小\s*30px[\s\S]*行高\s*31.5px[\s\S]*字距\s*2.4px/)
    await expect(inspector.locator('.inspector__code')).toContainText(/font-size:\s*30px[\s\S]*line-height:\s*31.5px[\s\S]*letter-spacing:\s*2.4px/)
  })

  test('文案内容悬浮提示并点击复制', async ({ page }) => {
    const fixture = await createSelectionBundleFixture()
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            document.documentElement.dataset.copiedText = value
          },
        },
      })
    })
    await page.goto('/')
    await page.getByRole('button', { name: '导入' }).click()
    await page.locator('input[type=file]').setInputFiles(fixture)
    await expect(page.getByText('已导入本地 Bundle', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    const inspector = page.getByRole('complementary', { name: '检查面板' })
    await clickCanvasPoint(page, 100, 100)

    const copyContent = inspector.getByRole('button', { name: '点击复制文案' })
    const copyRow = inspector.locator('.object-copy')
    const initialBackground = await copyRow.evaluate((element) => getComputedStyle(element).backgroundColor)
    await expect(copyContent).toBeVisible()
    await copyContent.hover()
    await expect(page.locator('.fc-tooltip')).toContainText('点击复制文案')
    const hoverMetrics = await copyRow.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      buttonCount: element.querySelectorAll('button').length,
      whiteSpace: getComputedStyle(element.querySelector('.object-copy__value')!).whiteSpace,
    }))
    expect(hoverMetrics.background).not.toBe(initialBackground)
    expect(hoverMetrics.buttonCount).toBe(2)
    expect(hoverMetrics.whiteSpace).toBe('nowrap')
    await copyContent.click()
    await expect(page.locator('html')).toHaveAttribute('data-copied-text', 'Overlay text')
  })
})
