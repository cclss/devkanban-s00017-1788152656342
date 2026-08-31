import { describe, it, expect } from 'vitest'
import {
  SOURCE_COLOR_COUNT,
  sourceColorForIndex,
  assignSourceColors,
} from './source-color'

describe('sourceColorForIndex', () => {
  it('maps the first slots one-to-one to sequential palette tokens', () => {
    expect(sourceColorForIndex(0)).toEqual({
      slot: 0,
      token: '--color-category-1',
      cssVar: 'var(--color-category-1)',
    })
    expect(sourceColorForIndex(2)).toEqual({
      slot: 2,
      token: '--color-category-3',
      cssVar: 'var(--color-category-3)',
    })
  })

  it('gives every slot in the palette a distinct token', () => {
    const tokens = Array.from({ length: SOURCE_COLOR_COUNT }, (_, i) =>
      sourceColorForIndex(i).token,
    )
    expect(new Set(tokens).size).toBe(SOURCE_COLOR_COUNT)
  })

  it('cycles back to the first slot once the palette is exhausted', () => {
    expect(sourceColorForIndex(SOURCE_COLOR_COUNT).slot).toBe(0)
    expect(sourceColorForIndex(SOURCE_COLOR_COUNT + 1).slot).toBe(1)
    // Same slot for indices that are congruent mod the palette size.
    expect(sourceColorForIndex(SOURCE_COLOR_COUNT * 3 + 4)).toEqual(
      sourceColorForIndex(4),
    )
  })

  it('is deterministic: the same index always yields the same colour', () => {
    expect(sourceColorForIndex(5)).toEqual(sourceColorForIndex(5))
  })

  it('always resolves to a slot within the palette range', () => {
    for (const index of [0, 1, 7, 8, 100, 999]) {
      const { slot } = sourceColorForIndex(index)
      expect(slot).toBeGreaterThanOrEqual(0)
      expect(slot).toBeLessThan(SOURCE_COLOR_COUNT)
    }
  })

  it('wraps negative ordinals symmetrically into range', () => {
    expect(sourceColorForIndex(-1).slot).toBe(SOURCE_COLOR_COUNT - 1)
    expect(sourceColorForIndex(-SOURCE_COLOR_COUNT).slot).toBe(0)
  })

  it('rejects non-integer and non-finite indices', () => {
    expect(() => sourceColorForIndex(1.5)).toThrow(RangeError)
    expect(() => sourceColorForIndex(NaN)).toThrow(RangeError)
    expect(() => sourceColorForIndex(Infinity)).toThrow(RangeError)
  })
})

describe('assignSourceColors', () => {
  it('assigns distinct palette colours to N files (N ≤ palette size)', () => {
    const ids = ['a', 'b', 'c']
    const colors = assignSourceColors(ids)
    expect(colors.get('a')!.slot).toBe(0)
    expect(colors.get('b')!.slot).toBe(1)
    expect(colors.get('c')!.slot).toBe(2)
    const slots = ids.map((id) => colors.get(id)!.slot)
    expect(new Set(slots).size).toBe(ids.length)
  })

  it('cycles the palette when more files than slots are loaded', () => {
    const ids = Array.from({ length: SOURCE_COLOR_COUNT + 2 }, (_, i) => `f${i}`)
    const colors = assignSourceColors(ids)
    // File N+1 (index SOURCE_COLOR_COUNT) wraps to the first colour.
    expect(colors.get(`f${SOURCE_COLOR_COUNT}`)!).toEqual(colors.get('f0')!)
    expect(colors.get(`f${SOURCE_COLOR_COUNT + 1}`)!).toEqual(colors.get('f1')!)
  })

  it('is stable: a repeated id keeps its colour and consumes no new slot', () => {
    const colors = assignSourceColors(['a', 'b', 'a', 'c'])
    expect(colors.get('a')!.slot).toBe(0)
    expect(colors.get('b')!.slot).toBe(1)
    // 'c' takes the third slot, not the fourth — the duplicate 'a' did not
    // advance the ordinal.
    expect(colors.get('c')!.slot).toBe(2)
  })

  it('is deterministic for a given ordering', () => {
    const ids = ['x', 'y', 'z']
    expect(assignSourceColors(ids)).toEqual(assignSourceColors(ids))
  })

  it('returns an empty map for no sources', () => {
    expect(assignSourceColors([]).size).toBe(0)
  })
})
