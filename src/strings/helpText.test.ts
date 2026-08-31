import { describe, it, expect } from 'vitest'
import {
  HELP_TEXT,
  HELP_FEATURE_KEYS,
  LOCAL_PROCESSING_KEY,
  type HelpKey,
} from './helpText'

/** Every key the help system must cover: the 9 features + the privacy notice. */
const EXPECTED_KEYS: readonly HelpKey[] = [
  'exportAll',
  'exportSelected',
  'splitByCount',
  'splitByRange',
  'dropzone',
  'rotate',
  'delete',
  'reorder',
  'thumbnailPreview',
  'localProcessing',
]

describe('HELP_TEXT — coverage', () => {
  it('defines an entry for every expected key and nothing extra', () => {
    expect(Object.keys(HELP_TEXT).sort()).toEqual([...EXPECTED_KEYS].sort())
  })

  it('covers all 9 features plus the local-processing notice', () => {
    expect(HELP_FEATURE_KEYS).toHaveLength(9)
    expect(HELP_FEATURE_KEYS).not.toContain(LOCAL_PROCESSING_KEY)
    // Feature keys + the notice key == the full expected set.
    expect([...HELP_FEATURE_KEYS, LOCAL_PROCESSING_KEY].sort()).toEqual(
      [...EXPECTED_KEYS].sort(),
    )
  })

  it.each(EXPECTED_KEYS)('has non-empty title and body for "%s"', (key) => {
    const entry = HELP_TEXT[key]
    expect(entry).toBeDefined()
    expect(entry.title.trim().length).toBeGreaterThan(0)
    expect(entry.body.trim().length).toBeGreaterThan(0)
  })
})

describe('HELP_TEXT — feature-specific requirements', () => {
  it('describes range-split with the documented "1-3, 7, 10-12" format', () => {
    expect(HELP_TEXT.splitByRange.body).toContain('1-3, 7, 10-12')
  })

  it('describes rotation as cumulative 90° steps', () => {
    expect(HELP_TEXT.rotate.body).toContain('90 degrees')
    expect(HELP_TEXT.rotate.body).toContain('cumulative')
  })

  it('describes the dropzone multi-file ordering and local-only processing', () => {
    expect(HELP_TEXT.dropzone.body).toContain('order')
    expect(HELP_TEXT.dropzone.body).toContain('never sent to a server')
  })

  it('states page delete cannot be undone in the workspace but the source is restorable', () => {
    // Matches analysed deletePages/reconcilePages behaviour: no in-workspace undo,
    // source file untouched, re-loading the file restores removed pages.
    expect(HELP_TEXT.delete.body).toContain('cannot be undone')
    expect(HELP_TEXT.delete.body).toContain('re-loading')
  })

  it('states the local-processing notice: files are never sent to a server', () => {
    expect(HELP_TEXT.localProcessing.body).toContain('never sends files to a server')
    expect(HELP_TEXT.localProcessing.body).toContain('browser')
  })
})
