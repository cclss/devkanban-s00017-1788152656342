// @vitest-environment jsdom
/**
 * Tests for the saved-URL history adapter ({@link module:components/url-history}).
 *
 * Two concerns, verified through the public helpers only:
 * - `addUrlToHistory` (pure): newest-first ordering, de-duplication, blank
 *   no-op, and the {@link MAX_SAVED_URLS} cap that makes "at most 5" true and drops
 *   the oldest entry once full.
 * - `readUrlHistory` / `writeUrlHistory`: a round-trip through `localStorage`,
 *   plus the guards that turn a missing / corrupt / oversized stored value into
 *   a safe empty (or capped) list instead of a crash.
 *
 * jsdom is opted into per-file so the rest of the core suite keeps its fast
 * `node` environment.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_SAVED_URLS,
  URL_HISTORY_STORAGE_KEY,
  addUrlToHistory,
  readUrlHistory,
  writeUrlHistory,
} from './url-history'

afterEach(() => {
  window.localStorage.clear()
})

describe('addUrlToHistory', () => {
  it('prepends a new URL as the most-recent entry', () => {
    expect(addUrlToHistory(['https://a.com'], 'https://b.com')).toEqual([
      'https://b.com',
      'https://a.com',
    ])
  })

  it('trims surrounding whitespace before storing', () => {
    expect(addUrlToHistory([], '  https://a.com  ')).toEqual(['https://a.com'])
  })

  it('is a no-op for a blank URL, returning the history unchanged', () => {
    expect(addUrlToHistory(['https://a.com'], '   ')).toEqual(['https://a.com'])
    expect(addUrlToHistory([], '')).toEqual([])
  })

  it('moves an existing URL to the front instead of duplicating it', () => {
    expect(
      addUrlToHistory(['https://a.com', 'https://b.com'], 'https://b.com'),
    ).toEqual(['https://b.com', 'https://a.com'])
  })

  it('caps the history at MAX_SAVED_URLS, dropping the oldest entry', () => {
    const full = ['u5', 'u4', 'u3', 'u2', 'u1'] // already at the cap (5)
    const next = addUrlToHistory(full, 'u6')

    expect(MAX_SAVED_URLS).toBe(5)
    expect(next).toHaveLength(MAX_SAVED_URLS)
    expect(next[0]).toBe('u6')
    expect(next).not.toContain('u1') // oldest fell off
  })

  it('does not mutate the input history', () => {
    const history = ['https://a.com']
    addUrlToHistory(history, 'https://b.com')
    expect(history).toEqual(['https://a.com'])
  })
})

describe('readUrlHistory / writeUrlHistory', () => {
  it('round-trips a list through localStorage', () => {
    writeUrlHistory(['https://a.com', 'https://b.com'])
    expect(readUrlHistory()).toEqual(['https://a.com', 'https://b.com'])
  })

  it('returns an empty list when nothing is stored', () => {
    expect(readUrlHistory()).toEqual([])
  })

  it('returns an empty list for a corrupt (non-JSON) stored value', () => {
    window.localStorage.setItem(URL_HISTORY_STORAGE_KEY, 'not json')
    expect(readUrlHistory()).toEqual([])
  })

  it('returns an empty list when the stored JSON is not an array', () => {
    window.localStorage.setItem(URL_HISTORY_STORAGE_KEY, '{"a":1}')
    expect(readUrlHistory()).toEqual([])
  })

  it('drops non-string members and caps an oversized stored list', () => {
    window.localStorage.setItem(
      URL_HISTORY_STORAGE_KEY,
      JSON.stringify(['u1', 2, 'u2', 'u3', 'u4', 'u5', 'u6']),
    )
    const result = readUrlHistory()
    expect(result).toHaveLength(MAX_SAVED_URLS)
    expect(result).toEqual(['u1', 'u2', 'u3', 'u4', 'u5'])
  })
})
