import { describe, expect, it } from 'vitest'
import { constrainRulerPoint, dominantRulerAxis, measureBounds, measurePoints } from '../../src/features/viewer/measure'

describe('measureBounds', () => {
  it('计算任意两点的横纵坐标差和直线距离', () => {
    expect(measurePoints({ x: 10, y: 20 }, { x: 130, y: 70 })).toEqual({
      start: { x: 10, y: 20 },
      end: { x: 130, y: 70 },
      horizontal: 120,
      vertical: 50,
      distance: 130,
      label: { x: 70, y: 45 },
    })
  })

  it('斜向拖拽按主导方向锁定为直线', () => {
    const start = { x: 100, y: 120 }
    const end = { x: 280, y: 170 }
    const axis = dominantRulerAxis(start, end)

    expect(axis).toBe('horizontal')
    expect(constrainRulerPoint(start, end, axis!)).toEqual({ x: 280, y: 120 })
  })

  it('纵向拖拽锁定为垂直直线', () => {
    const start = { x: 100, y: 120 }
    const end = { x: 140, y: 360 }
    const axis = dominantRulerAxis(start, end)

    expect(axis).toBe('vertical')
    expect(constrainRulerPoint(start, end, axis!)).toEqual({ x: 100, y: 360 })
  })

  it('计算两个不重叠图层的水平和垂直间距', () => {
    expect(
      measureBounds(
        { x: 10, y: 20, width: 60, height: 40 },
        { x: 100, y: 90, width: 20, height: 30 },
      ),
    ).toMatchObject({ horizontal: 30, vertical: 30 })
  })

  it('重叠图层的轴向间距为零', () => {
    expect(
      measureBounds(
        { x: 10, y: 20, width: 100, height: 70 },
        { x: 80, y: 60, width: 80, height: 90 },
      ),
    ).toMatchObject({ horizontal: 0, vertical: 0 })
  })

  it('从相对边界绘制水平测量线而不是连接图层中心', () => {
    const measurement = measureBounds(
      { x: 10, y: 20, width: 60, height: 40 },
      { x: 100, y: 30, width: 20, height: 20 },
    )

    expect(measurement.segments).toContainEqual(expect.objectContaining({
      axis: 'horizontal',
      value: 30,
      start: { x: 70, y: 40 },
      end: { x: 100, y: 40 },
    }))
  })

  it('斜对角图层分别绘制水平和垂直的正交测量线', () => {
    const measurement = measureBounds(
      { x: 10, y: 20, width: 60, height: 40 },
      { x: 100, y: 90, width: 20, height: 30 },
    )

    expect(measurement.segments.map((segment) => segment.axis)).toEqual(['horizontal', 'vertical'])
    for (const line of measurement.segments.flatMap((segment) => [segment, ...segment.extensions])) {
      expect(line.start.x === line.end.x || line.start.y === line.end.y).toBe(true)
    }
  })

  it('图层包裹关系展示四边的边距', () => {
    const measurement = measureBounds(
      { x: 10, y: 20, width: 100, height: 80 },
      { x: 30, y: 35, width: 40, height: 20 },
    )

    expect(measurement.segments.map((segment) => segment.value)).toEqual([20, 40, 15, 45])
  })

  it('画布作为外层时展示选中图层到四边的距离', () => {
    const measurement = measureBounds(
      { x: 84, y: 208, width: 550, height: 152 },
      { x: 0, y: 0, width: 1440, height: 1000 },
    )

    expect(measurement.segments.map((segment) => segment.value)).toEqual([84, 806, 208, 640])
  })
})
