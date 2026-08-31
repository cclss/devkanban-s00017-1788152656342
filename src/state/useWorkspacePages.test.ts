import { describe, expect, it } from 'vitest'
import { pruneSelection, toggleSelection } from './useWorkspacePages'

/**
 * `useWorkspacePages` keeps its ordering logic in the pure `core/pages`
 * functions (tested in `core/pages.test.ts`) and its selection logic in these
 * two pure helpers. Testing the helpers directly — the same convention as
 * `useSourceFiles` — verifies the selection (grid check-select) behaviour
 * without a DOM.
 */

describe('toggleSelection', () => {
  it('adds an id that is not yet selected', () => {
    const next = toggleSelection(new Set(['a']), 'b')
    expect([...next].sort()).toEqual(['a', 'b'])
  })

  it('removes an id that is already selected', () => {
    const next = toggleSelection(new Set(['a', 'b']), 'a')
    expect([...next]).toEqual(['b'])
  })

  it('toggling the same id twice returns to the original selection', () => {
    const start = new Set(['a'])
    const twice = toggleSelection(toggleSelection(start, 'b'), 'b')
    expect([...twice]).toEqual(['a'])
  })

  it('never mutates the input set', () => {
    const start = new Set(['a'])
    toggleSelection(start, 'b')
    expect([...start]).toEqual(['a'])
  })
})

describe('pruneSelection', () => {
  it('drops removed ids from the selection', () => {
    const next = pruneSelection(new Set(['a', 'b', 'c']), ['b'])
    expect([...next].sort()).toEqual(['a', 'c'])
  })

  it('drops several removed ids at once', () => {
    const next = pruneSelection(new Set(['a', 'b', 'c']), ['a', 'c'])
    expect([...next]).toEqual(['b'])
  })

  it('accepts a Set of removed ids', () => {
    const next = pruneSelection(new Set(['a', 'b']), new Set(['a']))
    expect([...next]).toEqual(['b'])
  })

  it('returns the same set instance when nothing was removed', () => {
    const start = new Set(['a', 'b'])
    expect(pruneSelection(start, ['ghost'])).toBe(start)
  })

  it('never mutates the input set', () => {
    const start = new Set(['a', 'b'])
    pruneSelection(start, ['a'])
    expect([...start].sort()).toEqual(['a', 'b'])
  })
})
