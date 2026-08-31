import { describe, it, expect } from 'vitest'
import { buildExportFilename, buildSplitFilenames } from './download'

describe('buildExportFilename — default fallback', () => {
  it('uses the default merged name for an empty list', () => {
    expect(buildExportFilename([])).toBe('merged.pdf')
  })

  it('falls back when every name is blank', () => {
    expect(buildExportFilename(['', '   ', '\t'])).toBe('merged.pdf')
  })

  it('falls back when a name is only an extension', () => {
    expect(buildExportFilename(['.pdf'])).toBe('merged.pdf')
  })

  it('honors a custom fallback base', () => {
    expect(buildExportFilename([], { fallback: 'export' })).toBe('export.pdf')
  })

  it('reverts to the default when the custom fallback sanitizes to empty', () => {
    expect(buildExportFilename([], { fallback: '   ' })).toBe('merged.pdf')
  })
})

describe('buildExportFilename — single source', () => {
  it('keeps a plain .pdf name unchanged', () => {
    expect(buildExportFilename(['report.pdf'])).toBe('report.pdf')
  })

  it('normalizes an uppercase extension to lowercase .pdf', () => {
    expect(buildExportFilename(['report.PDF'])).toBe('report.pdf')
  })

  it('appends .pdf when the source has no extension', () => {
    expect(buildExportFilename(['report'])).toBe('report.pdf')
  })

  it('strips only the trailing .pdf, leaving inner dots intact', () => {
    expect(buildExportFilename(['2026.q3.report.pdf'])).toBe('2026.q3.report.pdf')
  })

  it('preserves spaces and hyphens in the base name', () => {
    expect(buildExportFilename(['my - report.pdf'])).toBe('my - report.pdf')
  })
})

describe('buildExportFilename — multiple sources', () => {
  it('marks two sources with "+1 more" after the first name', () => {
    expect(buildExportFilename(['a.pdf', 'b.pdf'])).toBe('a-+1 more.pdf')
  })

  it('counts all but the first for the "+N more" marker', () => {
    expect(buildExportFilename(['a.pdf', 'b.pdf', 'c.pdf'])).toBe('a-+2 more.pdf')
  })

  it('ignores blank entries when counting usable sources', () => {
    // Two usable names (a, b) despite the blank → single "+1 more" marker.
    expect(buildExportFilename(['a.pdf', '', 'b.pdf'])).toBe('a-+1 more.pdf')
  })

  it('degrades to a single name when only one entry is usable', () => {
    expect(buildExportFilename(['', 'only.pdf', '   '])).toBe('only.pdf')
  })
})

describe('buildExportFilename — path and unsafe-character handling', () => {
  it('drops a POSIX directory prefix', () => {
    expect(buildExportFilename(['docs/sub/report.pdf'])).toBe('report.pdf')
  })

  it('drops a Windows directory prefix', () => {
    expect(buildExportFilename(['C:\\docs\\report.pdf'])).toBe('report.pdf')
  })

  it('replaces reserved characters with an underscore', () => {
    expect(buildExportFilename(['a<b>c:d.pdf'])).toBe('a_b_c_d.pdf')
  })
})

describe('buildExportFilename — determinism', () => {
  it('returns the same name for the same inputs', () => {
    const input = ['first.pdf', 'second.pdf', 'third.pdf']
    expect(buildExportFilename(input)).toBe(buildExportFilename(input))
  })

  it('always ends in .pdf', () => {
    for (const names of [[], ['x'], ['x.pdf', 'y.pdf'], ['.pdf']]) {
      expect(buildExportFilename(names).endsWith('.pdf')).toBe(true)
    }
  })
})

describe('buildSplitFilenames — numbering', () => {
  it('numbers parts from 1 with a hyphen suffix', () => {
    expect(buildSplitFilenames('report.pdf', 3)).toEqual([
      'report-1.pdf',
      'report-2.pdf',
      'report-3.pdf',
    ])
  })

  it('returns a single name for count 1', () => {
    expect(buildSplitFilenames('report.pdf', 1)).toEqual(['report-1.pdf'])
  })

  it('returns an empty array for count 0', () => {
    expect(buildSplitFilenames('report.pdf', 0)).toEqual([])
  })

  it('zero-pads the suffix to the width of count', () => {
    const names = buildSplitFilenames('report.pdf', 12)
    expect(names[0]).toBe('report-01.pdf')
    expect(names[8]).toBe('report-09.pdf')
    expect(names[9]).toBe('report-10.pdf')
    expect(names[11]).toBe('report-12.pdf')
  })

  it('sorts lexically in numeric order thanks to padding', () => {
    const names = buildSplitFilenames('doc.pdf', 10)
    expect([...names].sort()).toEqual(names)
  })
})

describe('buildSplitFilenames — base sanitization', () => {
  it('strips the trailing .pdf before numbering', () => {
    expect(buildSplitFilenames('report.PDF', 2)).toEqual([
      'report-1.pdf',
      'report-2.pdf',
    ])
  })

  it('appends numbering when the base has no extension', () => {
    expect(buildSplitFilenames('report', 2)).toEqual([
      'report-1.pdf',
      'report-2.pdf',
    ])
  })

  it('drops a directory prefix', () => {
    expect(buildSplitFilenames('docs/sub/report.pdf', 1)).toEqual([
      'report-1.pdf',
    ])
  })

  it('replaces reserved characters in the base', () => {
    expect(buildSplitFilenames('a<b>c.pdf', 1)).toEqual(['a_b_c-1.pdf'])
  })

  it('falls back to the default split base when unusable', () => {
    expect(buildSplitFilenames('   ', 2)).toEqual(['split-1.pdf', 'split-2.pdf'])
  })

  it('honors a custom fallback base', () => {
    expect(buildSplitFilenames('.pdf', 2, { fallback: 'part' })).toEqual([
      'part-1.pdf',
      'part-2.pdf',
    ])
  })

  it('reverts to the default when the custom fallback sanitizes to empty', () => {
    expect(buildSplitFilenames('', 1, { fallback: '   ' })).toEqual([
      'split-1.pdf',
    ])
  })
})

describe('buildSplitFilenames — guards', () => {
  it('rejects a negative count', () => {
    expect(() => buildSplitFilenames('report.pdf', -1)).toThrow(
      /non-negative integer/,
    )
  })

  it('rejects a non-integer count', () => {
    expect(() => buildSplitFilenames('report.pdf', 2.5)).toThrow(
      /non-negative integer/,
    )
  })

  it('always ends every name in .pdf', () => {
    for (const name of buildSplitFilenames('report.pdf', 5)) {
      expect(name.endsWith('.pdf')).toBe(true)
    }
  })
})
