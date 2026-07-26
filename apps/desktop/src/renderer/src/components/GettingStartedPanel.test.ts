import { describe, expect, it } from 'vitest'
import { positionCoachMark } from './GettingStartedPanel'

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  }
}

describe('positionCoachMark', () => {
  it('prefers the open space to the right of a sidebar target', () => {
    const result = positionCoachMark(rect(20, 160, 120, 44), 1200, 800)

    expect(result.placement).toBe('right')
    expect(result.left).toBe(152)
  })

  it('moves to the left when a target is near the right edge', () => {
    const result = positionCoachMark(rect(1050, 160, 120, 44), 1200, 800)

    expect(result.placement).toBe('left')
    expect(result.left).toBe(758)
  })

  it('keeps a bottom coach mark within the viewport gutter', () => {
    const result = positionCoachMark(rect(190, 20, 100, 44), 480, 800)

    expect(result.placement).toBe('bottom')
    expect(result.left).toBe(100)
  })

  it('stays below Chronicle’s fixed title bar', () => {
    const result = positionCoachMark(
      rect(10, 110, 200, 44),
      645,
      613,
      { top: 48, bottom: 613 },
      { width: 336, height: 257 },
    )

    expect(result.placement).toBe('right')
    expect(result.top).toBe(64)
    expect(result.arrowAngle).toBeLessThan(-135)
    expect(result.arrowAngle).toBeGreaterThan(-180)
  })
})
