import { describe, it, expect } from 'vitest'
import { planSplitDownload, parseRangeGroups } from './split-plan'
import type { SourceFile } from './types'

/** Minimal SourceFile stub — only `name` matters for naming decisions. */
function sourceFile(name: string, id = name): SourceFile {
  return { id, name, bytes: new ArrayBuffer(0), pageCount: 1 }
}

/** A distinct byte payload so single-part plans can assert identity. */
function part(marker: number): Uint8Array {
  return new Uint8Array([marker])
}

describe('planSplitDownload — single result', () => {
  it('downloads a lone part as one <base>-1.pdf, carrying its bytes', () => {
    const bytes = part(7)
    const plan = planSplitDownload([bytes], [sourceFile('report.pdf')])
    expect(plan).toEqual({
      kind: 'single',
      filename: 'report-1.pdf',
      bytes,
    })
  })

  it('falls back to the split base when no source name is usable', () => {
    const plan = planSplitDownload([part(1)], [sourceFile('   ')])
    expect(plan.kind).toBe('single')
    expect(plan.filename).toBe('split-1.pdf')
  })
})

describe('planSplitDownload — multiple results (zip)', () => {
  it('bundles parts as zero-padded entries under a <base>.zip', () => {
    const parts = [part(1), part(2), part(3)]
    const plan = planSplitDownload(parts, [sourceFile('report.pdf')])
    expect(plan.kind).toBe('zip')
    if (plan.kind !== 'zip') throw new Error('expected zip plan')
    expect(plan.filename).toBe('report.zip')
    expect(plan.entries.map((entry) => entry.name)).toEqual([
      'report-1.pdf',
      'report-2.pdf',
      'report-3.pdf',
    ])
    expect(plan.entries.map((entry) => entry.bytes)).toEqual(parts)
  })

  it('zero-pads the suffix to the part count width', () => {
    const parts = Array.from({ length: 10 }, (_unused, index) => part(index))
    const plan = planSplitDownload(parts, [sourceFile('doc.pdf')])
    if (plan.kind !== 'zip') throw new Error('expected zip plan')
    expect(plan.entries[0].name).toBe('doc-01.pdf')
    expect(plan.entries[9].name).toBe('doc-10.pdf')
  })

  it('names the archive with the split fallback when no source name is usable', () => {
    const plan = planSplitDownload([part(1), part(2)], [sourceFile('')])
    if (plan.kind !== 'zip') throw new Error('expected zip plan')
    expect(plan.filename).toBe('split.zip')
    expect(plan.entries.map((entry) => entry.name)).toEqual([
      'split-1.pdf',
      'split-2.pdf',
    ])
  })
})

describe('planSplitDownload — guards', () => {
  it('throws when there are no parts', () => {
    expect(() => planSplitDownload([], [sourceFile('a.pdf')])).toThrow()
  })
})

describe('parseRangeGroups', () => {
  it('parses each comma group into its own 0-based index group', () => {
    expect(parseRangeGroups('1-3, 7, 10-12', 12)).toEqual([
      [0, 1, 2],
      [6],
      [9, 10, 11],
    ])
  })

  it('handles a single group', () => {
    expect(parseRangeGroups('2-4', 10)).toEqual([[1, 2, 3]])
  })

  it('ignores whitespace around segments and the separator', () => {
    expect(parseRangeGroups(' 1 - 2 , 5 ', 5)).toEqual([[0, 1], [4]])
  })

  it('throws when a group is out of range', () => {
    expect(() => parseRangeGroups('1-3, 99', 12)).toThrow()
  })

  it('throws when a group is malformed', () => {
    expect(() => parseRangeGroups('1-3, abc', 12)).toThrow()
  })

  it('throws when no non-empty group exists', () => {
    expect(() => parseRangeGroups('   ', 12)).toThrow()
  })
})
