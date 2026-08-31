import { describe, it, expect } from 'vitest'
import {
  computeRenderScale,
  thumbnailPixelSize,
  thumbnailCacheKey,
  MIN_RENDER_SCALE,
  MAX_RENDER_SCALE,
} from './thumbnail-scale'

describe('computeRenderScale', () => {
  it('scales a page down to the target width', () => {
    // Natural 600pt wide, want 150px → 0.25×.
    expect(computeRenderScale(600, 150)).toBeCloseTo(0.25, 10)
  })

  it('scales a page up when the target exceeds its natural width', () => {
    expect(computeRenderScale(100, 300)).toBeCloseTo(3, 10)
  })

  it('returns 1 when target equals natural width', () => {
    expect(computeRenderScale(612, 612)).toBe(1)
  })

  it('clamps an extreme upscale to MAX_RENDER_SCALE', () => {
    // A 1pt-wide page asked for a 10000px thumbnail would be 10000× — capped.
    expect(computeRenderScale(1, 10000)).toBe(MAX_RENDER_SCALE)
  })

  it('clamps a vanishing downscale to MIN_RENDER_SCALE', () => {
    // A gigantic page asked for a 1px thumbnail floors at the minimum scale.
    expect(computeRenderScale(1e9, 1)).toBe(MIN_RENDER_SCALE)
  })

  it.each([
    ['zero naturalWidth', 0, 150],
    ['negative naturalWidth', -10, 150],
    ['zero targetWidth', 600, 0],
    ['negative targetWidth', 600, -5],
    ['NaN naturalWidth', NaN, 150],
    ['Infinity targetWidth', 600, Infinity],
  ])('throws on %s', (_label, natural, target) => {
    expect(() => computeRenderScale(natural, target)).toThrow(RangeError)
  })
})

describe('thumbnailPixelSize', () => {
  it('multiplies both dimensions by the scale', () => {
    expect(thumbnailPixelSize(200, 400, 0.5)).toEqual({ width: 100, height: 200 })
  })

  it('rounds fractional dimensions up so no page edge is clipped', () => {
    // 100 * 0.333 = 33.3 → 34 ; 200 * 0.333 = 66.6 → 67
    expect(thumbnailPixelSize(100, 200, 0.333)).toEqual({ width: 34, height: 67 })
  })

  it('never collapses below one pixel per axis', () => {
    expect(thumbnailPixelSize(1, 1, MIN_RENDER_SCALE)).toEqual({ width: 1, height: 1 })
  })

  it('preserves the source aspect ratio (portrait)', () => {
    const { width, height } = thumbnailPixelSize(612, 792, 0.25)
    expect(width).toBe(153)
    expect(height).toBe(198)
    expect(height).toBeGreaterThan(width)
  })

  it.each([
    ['zero width', 0, 100, 1],
    ['negative height', 100, -1, 1],
    ['zero scale', 100, 100, 0],
    ['NaN scale', 100, 100, NaN],
  ])('throws on %s', (_label, w, h, s) => {
    expect(() => thumbnailPixelSize(w, h, s)).toThrow(RangeError)
  })
})

describe('thumbnailCacheKey', () => {
  it('is deterministic for identical inputs', () => {
    expect(thumbnailCacheKey('src-1', 3, 150)).toBe(thumbnailCacheKey('src-1', 3, 150))
  })

  it('differs when the source id differs', () => {
    expect(thumbnailCacheKey('a', 0, 150)).not.toBe(thumbnailCacheKey('b', 0, 150))
  })

  it('differs when the page index differs', () => {
    expect(thumbnailCacheKey('a', 0, 150)).not.toBe(thumbnailCacheKey('a', 1, 150))
  })

  it('differs when the target width differs (a resize is a new raster)', () => {
    expect(thumbnailCacheKey('a', 0, 150)).not.toBe(thumbnailCacheKey('a', 0, 300))
  })

  it('does not let adjacent fields collide across the boundary', () => {
    // "a"+page 1 must not equal "a1"+page ... — the delimiter prevents it.
    expect(thumbnailCacheKey('a', 1, 150)).not.toBe(thumbnailCacheKey('a1', 5, 0 + 150))
  })

  it('accepts page index zero', () => {
    expect(thumbnailCacheKey('a', 0, 150)).toBe('a|0|150')
  })

  it.each([
    ['negative page index', 'a', -1, 150],
    ['fractional page index', 'a', 1.5, 150],
    ['zero target width', 'a', 0, 0],
    ['negative target width', 'a', 0, -1],
  ])('throws on %s', (_label, id, page, width) => {
    expect(() => thumbnailCacheKey(id, page, width)).toThrow(RangeError)
  })
})

describe('scale bounds are sane', () => {
  it('keeps MIN below MAX', () => {
    expect(MIN_RENDER_SCALE).toBeLessThan(MAX_RENDER_SCALE)
  })
})
