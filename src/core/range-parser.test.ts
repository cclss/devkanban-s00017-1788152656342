import { describe, it, expect } from 'vitest'
import { parseRange } from './range-parser'
import type { ParseRangeResult, RangeErrorKind } from './range-parser'

/** Narrows a result to the success arm, failing loudly with the error kind. */
function expectOk(result: ParseRangeResult): Extract<ParseRangeResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`expected ok, got error kind "${result.error.kind}"`)
  }
  return result
}

/** Asserts the result is an error of the given kind and returns it. */
function expectError(result: ParseRangeResult, kind: RangeErrorKind) {
  if (result.ok) {
    throw new Error(`expected error "${kind}", got ok with [${result.indices}]`)
  }
  expect(result.error.kind).toBe(kind)
  expect(result.error.message.length).toBeGreaterThan(0)
  return result.error
}

describe('parseRange — valid input', () => {
  it('parses mixed singles and ranges to sorted 0-based indices', () => {
    // "1-3, 7, 10-12" over a 12-page doc → 1,2,3,7,10,11,12 (1-based)
    const r = expectOk(parseRange('1-3, 7, 10-12', 12))
    expect(r.indices).toEqual([0, 1, 2, 6, 9, 10, 11])
    expect(r.notices).toEqual([])
  })

  it('converts a single page to a single 0-based index', () => {
    const r = expectOk(parseRange('1', 5))
    expect(r.indices).toEqual([0])
  })

  it('handles a range covering the whole document', () => {
    const r = expectOk(parseRange('1-4', 4))
    expect(r.indices).toEqual([0, 1, 2, 3])
  })

  it('treats a single-page range (n-n) as that one page', () => {
    const r = expectOk(parseRange('3-3', 5))
    expect(r.indices).toEqual([2])
    expect(r.notices).toEqual([])
  })

  it('sorts out-of-order tokens ascending', () => {
    const r = expectOk(parseRange('7, 1-2', 10))
    expect(r.indices).toEqual([0, 1, 6])
  })

  it('accepts the last page exactly at the boundary', () => {
    const r = expectOk(parseRange('5', 5))
    expect(r.indices).toEqual([4])
  })
})

describe('parseRange — whitespace tolerance', () => {
  it('trims spaces around tokens and separators', () => {
    const r = expectOk(parseRange('  1 - 3 ,   7  ', 10))
    expect(r.indices).toEqual([0, 1, 2, 6])
  })
})

describe('parseRange — duplicate merging (not an error)', () => {
  it('merges an exact duplicate single and flags a duplicate notice', () => {
    const r = expectOk(parseRange('1, 1', 5))
    expect(r.indices).toEqual([0])
    expect(r.notices).toContain('duplicate')
  })

  it('merges overlapping ranges and flags a duplicate notice', () => {
    // 1-3 and 2-4 overlap on pages 2 and 3.
    const r = expectOk(parseRange('1-3, 2-4', 4))
    expect(r.indices).toEqual([0, 1, 2, 3])
    expect(r.notices).toContain('duplicate')
  })

  it('does not flag a duplicate when all pages are distinct', () => {
    const r = expectOk(parseRange('1, 3, 5', 5))
    expect(r.notices).not.toContain('duplicate')
  })
})

describe('parseRange — empty input', () => {
  it('rejects an empty string', () => {
    expectError(parseRange('', 5), 'empty')
  })

  it('rejects a whitespace-only string', () => {
    expectError(parseRange('   \t  ', 5), 'empty')
  })
})

describe('parseRange — reversed range', () => {
  it('rejects a descending range', () => {
    expectError(parseRange('5-3', 10), 'reversed-range')
  })

  it('reports reversed-range even when pages are within bounds', () => {
    expectError(parseRange('1-2, 4-3', 10), 'reversed-range')
  })
})

describe('parseRange — out of range', () => {
  it('rejects a single page beyond pageCount', () => {
    expectError(parseRange('6', 5), 'out-of-range')
  })

  it('rejects a range extending beyond pageCount', () => {
    expectError(parseRange('3-8', 5), 'out-of-range')
  })

  it('rejects any page when pageCount is zero', () => {
    expectError(parseRange('1', 0), 'out-of-range')
  })
})

describe('parseRange — invalid tokens', () => {
  it('rejects a non-numeric token', () => {
    expectError(parseRange('abc', 5), 'invalid-token')
  })

  it('rejects page zero (1-based domain)', () => {
    expectError(parseRange('0', 5), 'invalid-token')
  })

  it('rejects a range starting at zero', () => {
    expectError(parseRange('0-3', 5), 'invalid-token')
  })

  it('rejects a negative token', () => {
    expectError(parseRange('-3', 5), 'invalid-token')
  })

  it('rejects a decimal token', () => {
    expectError(parseRange('1.5', 5), 'invalid-token')
  })

  it('rejects a malformed range missing its end', () => {
    expectError(parseRange('1-', 5), 'invalid-token')
  })

  it('rejects a triple-dash range', () => {
    expectError(parseRange('1-2-3', 5), 'invalid-token')
  })

  it('rejects an empty segment from a trailing comma', () => {
    expectError(parseRange('1,', 5), 'invalid-token')
  })

  it('rejects an empty segment between commas', () => {
    expectError(parseRange('1,,3', 5), 'invalid-token')
  })
})

describe('parseRange — first offending token wins (deterministic kind)', () => {
  it('reports the earliest error when several problems exist', () => {
    // Reversed range comes before the out-of-range page → reversed-range wins.
    expectError(parseRange('5-3, 99', 10), 'reversed-range')
  })
})
