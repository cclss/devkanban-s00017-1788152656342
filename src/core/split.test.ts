import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { extractPages, splitEveryNPages, splitByRanges } from './split'
import type { SourceFile, WorkspacePage } from './types'
import { makeValidPdf } from './__fixtures__/pdf-fixtures'

/** Builds a SourceFile from freshly generated uniform PDF bytes. */
async function makeSource(id: string, pageCount: number): Promise<SourceFile> {
  const bytes = await makeValidPdf(pageCount)
  return { id, name: `${id}.pdf`, bytes, pageCount }
}

/**
 * Builds a SourceFile whose page N is `100*(N+1)` points wide, so a resulting
 * page's width identifies which source page (and thus which workspace position)
 * it came from — the technique `merge.test.ts` uses to observe order.
 */
async function makeIdentifiableSource(
  id: string,
  pageCount: number,
): Promise<SourceFile> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i += 1) doc.addPage([100 * (i + 1), 792])
  const bytes = (await doc.save()).slice().buffer
  return { id, name: `${id}.pdf`, bytes, pageCount }
}

/** The source-page index a result page's width encodes (see makeIdentifiableSource). */
function widthToIndex(width: number): number {
  return width / 100 - 1
}

function page(
  sourceFileId: string,
  pageIndex: number,
  rotation = 0,
  id = `${sourceFileId}-${pageIndex}-${rotation}`,
): WorkspacePage {
  return { id, sourceFileId, pageIndex, rotation }
}

/** Re-parses output so assertions read the real resulting document. */
async function parse(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes)
}

describe('extractPages', () => {
  it('produces a single PDF containing exactly the selected pages, in order', async () => {
    const src = await makeIdentifiableSource('a', 5)
    // Select a non-sequential subset to prove order/content follow the array.
    const pages = [page('a', 3), page('a', 0), page('a', 4)]

    const doc = await parse(await extractPages(pages, [src]))

    expect(doc.getPageCount()).toBe(3)
    expect(doc.getPages().map((p) => widthToIndex(p.getWidth()))).toEqual([3, 0, 4])
  })

  it('preserves per-page rotation as absolute orientation', async () => {
    const src = await makeSource('a', 3)
    const pages = [page('a', 0, 90), page('a', 1, 180), page('a', 2, 270)]

    const doc = await parse(await extractPages(pages, [src]))

    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 180, 270])
  })

  it('throws on an empty selection', async () => {
    const src = await makeSource('a', 3)

    await expect(extractPages([], [src])).rejects.toThrow(/no pages selected/)
  })

  it('throws when a page references an unknown source file', async () => {
    const src = await makeSource('a', 1)

    await expect(extractPages([page('missing', 0)], [src])).rejects.toThrow(
      /unknown sourceFileId/,
    )
  })

  it('throws when a pageIndex is out of range for its source', async () => {
    const src = await makeSource('a', 2)

    await expect(extractPages([page('a', 5)], [src])).rejects.toThrow(/out of range/)
  })
})

describe('splitEveryNPages', () => {
  it('splits an exact multiple into equal chunks (N boundary)', async () => {
    const src = await makeSource('a', 6)
    const pages = Array.from({ length: 6 }, (_, i) => page('a', i))

    const parts = await splitEveryNPages(pages, [src], 3)

    expect(parts).toHaveLength(2)
    for (const bytes of parts) {
      expect((await parse(bytes)).getPageCount()).toBe(3)
    }
  })

  it('puts the remainder in a smaller final chunk', async () => {
    const src = await makeSource('a', 5)
    const pages = Array.from({ length: 5 }, (_, i) => page('a', i))

    const parts = await splitEveryNPages(pages, [src], 2)

    const counts = await Promise.all(
      parts.map(async (b) => (await parse(b)).getPageCount()),
    )
    expect(counts).toEqual([2, 2, 1])
  })

  it('yields one page per file when size is 1', async () => {
    const src = await makeSource('a', 3)
    const pages = Array.from({ length: 3 }, (_, i) => page('a', i))

    const parts = await splitEveryNPages(pages, [src], 1)

    expect(parts).toHaveLength(3)
  })

  it('yields a single file when size meets or exceeds the page count', async () => {
    const src = await makeSource('a', 3)
    const pages = Array.from({ length: 3 }, (_, i) => page('a', i))

    const parts = await splitEveryNPages(pages, [src], 10)

    expect(parts).toHaveLength(1)
    expect((await parse(parts[0])).getPageCount()).toBe(3)
  })

  it('preserves page order and rotation across chunk boundaries', async () => {
    const src = await makeIdentifiableSource('a', 4)
    const pages = [
      page('a', 0, 0),
      page('a', 1, 90),
      page('a', 2, 180),
      page('a', 3, 270),
    ]

    const parts = await splitEveryNPages(pages, [src], 2)
    const first = await parse(parts[0])
    const second = await parse(parts[1])

    expect(first.getPages().map((p) => widthToIndex(p.getWidth()))).toEqual([0, 1])
    expect(first.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90])
    expect(second.getPages().map((p) => widthToIndex(p.getWidth()))).toEqual([2, 3])
    expect(second.getPages().map((p) => p.getRotation().angle)).toEqual([180, 270])
  })

  it('returns an empty array for an empty workspace', async () => {
    const src = await makeSource('a', 3)

    expect(await splitEveryNPages([], [src], 2)).toEqual([])
  })

  it('throws when size is not a positive integer', async () => {
    const src = await makeSource('a', 3)
    const pages = [page('a', 0)]

    await expect(splitEveryNPages(pages, [src], 0)).rejects.toThrow(
      /positive integer/,
    )
    await expect(splitEveryNPages(pages, [src], -1)).rejects.toThrow(
      /positive integer/,
    )
    await expect(splitEveryNPages(pages, [src], 1.5)).rejects.toThrow(
      /positive integer/,
    )
  })
})

describe('splitByRanges', () => {
  it('maps each index group to the correct pages, one file per group', async () => {
    const src = await makeIdentifiableSource('a', 6)
    const pages = Array.from({ length: 6 }, (_, i) => page('a', i))
    // Groups mirror "1-3, 5, 6" over the workspace positions (0-based).
    const ranges = [[0, 1, 2], [4], [5]]

    const parts = await splitByRanges(pages, [src], ranges)

    expect(parts).toHaveLength(3)
    const g0 = await parse(parts[0])
    const g1 = await parse(parts[1])
    const g2 = await parse(parts[2])
    expect(g0.getPages().map((p) => widthToIndex(p.getWidth()))).toEqual([0, 1, 2])
    expect(g1.getPages().map((p) => widthToIndex(p.getWidth()))).toEqual([4])
    expect(g2.getPages().map((p) => widthToIndex(p.getWidth()))).toEqual([5])
  })

  it('follows the given index order within a group (does not re-sort)', async () => {
    const src = await makeIdentifiableSource('a', 4)
    const pages = Array.from({ length: 4 }, (_, i) => page('a', i))

    const parts = await splitByRanges(pages, [src], [[2, 0, 3]])
    const doc = await parse(parts[0])

    expect(doc.getPages().map((p) => widthToIndex(p.getWidth()))).toEqual([2, 0, 3])
  })

  it('preserves rotation of the referenced workspace pages', async () => {
    const src = await makeSource('a', 4)
    const pages = [
      page('a', 0, 0),
      page('a', 1, 90),
      page('a', 2, 180),
      page('a', 3, 270),
    ]

    const parts = await splitByRanges(pages, [src], [[1, 3]])
    const doc = await parse(parts[0])

    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 270])
  })

  it('returns an empty array when no ranges are given', async () => {
    const src = await makeSource('a', 3)
    const pages = Array.from({ length: 3 }, (_, i) => page('a', i))

    expect(await splitByRanges(pages, [src], [])).toEqual([])
  })

  it('throws when an index falls outside the workspace', async () => {
    const src = await makeSource('a', 3)
    const pages = Array.from({ length: 3 }, (_, i) => page('a', i))

    await expect(splitByRanges(pages, [src], [[0, 3]])).rejects.toThrow(
      /out of range/,
    )
    await expect(splitByRanges(pages, [src], [[-1]])).rejects.toThrow(
      /out of range/,
    )
  })
})
