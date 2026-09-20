import type { Bounds, DistanceMeasurement, Measurement, MeasurementLine, MeasurementPoint, MeasurementSegment, RulerAxis } from './types'

function right(bounds: Bounds) {
  return bounds.x + bounds.width
}

function bottom(bounds: Bounds) {
  return bounds.y + bounds.height
}

function line(start: MeasurementPoint, end: MeasurementPoint): MeasurementLine {
  return { start, end }
}

function addSegment(
  segments: MeasurementSegment[],
  axis: MeasurementSegment['axis'],
  value: number,
  start: MeasurementPoint,
  end: MeasurementPoint,
  extensions: MeasurementLine[] = [],
) {
  if (value <= 0) {
    return
  }

  segments.push({
    axis,
    value,
    start,
    end,
    extensions,
    label: axis === 'horizontal'
      ? { x: (start.x + end.x) / 2, y: start.y - 18 }
      : { x: start.x + 18, y: (start.y + end.y) / 2 },
  })
}

function contains(outer: Bounds, inner: Bounds) {
  return outer.x <= inner.x
    && outer.y <= inner.y
    && right(outer) >= right(inner)
    && bottom(outer) >= bottom(inner)
}

export function measurePoints(start: MeasurementPoint, end: MeasurementPoint): DistanceMeasurement {
  const horizontal = Math.abs(end.x - start.x)
  const vertical = Math.abs(end.y - start.y)

  return {
    start,
    end,
    horizontal,
    vertical,
    distance: Math.hypot(horizontal, vertical),
    label: {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    },
  }
}

export function dominantRulerAxis(start: MeasurementPoint, end: MeasurementPoint): RulerAxis | undefined {
  const horizontal = Math.abs(end.x - start.x)
  const vertical = Math.abs(end.y - start.y)
  if (horizontal === 0 && vertical === 0) {
    return undefined
  }
  return horizontal >= vertical ? 'horizontal' : 'vertical'
}

export function constrainRulerPoint(start: MeasurementPoint, end: MeasurementPoint, axis: RulerAxis): MeasurementPoint {
  return axis === 'horizontal'
    ? { x: end.x, y: start.y }
    : { x: start.x, y: end.y }
}

export function measureBounds(a: Bounds, b: Bounds): Measurement {
  const aRight = right(a)
  const bRight = right(b)
  const aBottom = bottom(a)
  const bBottom = bottom(b)
  const horizontal = aRight < b.x ? b.x - aRight : bRight < a.x ? a.x - bRight : 0
  const vertical = aBottom < b.y ? b.y - aBottom : bBottom < a.y ? a.y - bBottom : 0
  const segments: MeasurementSegment[] = []

  if (contains(a, b) || contains(b, a)) {
    const outer = contains(a, b) ? a : b
    const inner = outer === a ? b : a
    const innerCenterX = inner.x + inner.width / 2
    const innerCenterY = inner.y + inner.height / 2

    addSegment(segments, 'horizontal', inner.x - outer.x, { x: outer.x, y: innerCenterY }, { x: inner.x, y: innerCenterY })
    addSegment(segments, 'horizontal', right(outer) - right(inner), { x: right(inner), y: innerCenterY }, { x: right(outer), y: innerCenterY })
    addSegment(segments, 'vertical', inner.y - outer.y, { x: innerCenterX, y: outer.y }, { x: innerCenterX, y: inner.y })
    addSegment(segments, 'vertical', bottom(outer) - bottom(inner), { x: innerCenterX, y: bottom(inner) }, { x: innerCenterX, y: bottom(outer) })

    return { horizontal, vertical, segments }
  }

  if (horizontal > 0) {
    const overlapTop = Math.max(a.y, b.y)
    const overlapBottom = Math.min(aBottom, bBottom)
    const hasVerticalOverlap = overlapBottom > overlapTop
    const bIsRight = b.x >= aRight
    const startX = bIsRight ? aRight : a.x
    const endX = bIsRight ? b.x : bRight
    const guideY = hasVerticalOverlap
      ? (overlapTop + overlapBottom) / 2
      : b.y >= aBottom ? aBottom : a.y
    const targetY = hasVerticalOverlap
      ? guideY
      : b.y >= aBottom ? b.y : bBottom
    const extensions = guideY === targetY
      ? []
      : [line({ x: endX, y: targetY }, { x: endX, y: guideY })]

    addSegment(segments, 'horizontal', horizontal, { x: startX, y: guideY }, { x: endX, y: guideY }, extensions)
  }

  if (vertical > 0) {
    const overlapLeft = Math.max(a.x, b.x)
    const overlapRight = Math.min(aRight, bRight)
    const hasHorizontalOverlap = overlapRight > overlapLeft
    const bIsBelow = b.y >= aBottom
    const startY = bIsBelow ? aBottom : a.y
    const endY = bIsBelow ? b.y : bBottom
    const guideX = hasHorizontalOverlap
      ? (overlapLeft + overlapRight) / 2
      : b.x >= aRight ? aRight : a.x
    const targetX = hasHorizontalOverlap
      ? guideX
      : b.x >= aRight ? b.x : bRight
    const extensions = guideX === targetX
      ? []
      : [line({ x: targetX, y: endY }, { x: guideX, y: endY })]

    addSegment(segments, 'vertical', vertical, { x: guideX, y: startY }, { x: guideX, y: endY }, extensions)
  }

  return {
    horizontal,
    vertical,
    segments,
  }
}
