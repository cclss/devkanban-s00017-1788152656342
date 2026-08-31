import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { mergePages } from './merge'
import type { SourceFile, WorkspacePage } from './types'
import { makeValidPdf } from './__fixtures__/pdf-fixtures'

/** Builds a SourceFile from freshly generated PDF bytes. */
async function makeSource(id: string, pageCount: number): Promise<SourceFile> {
  const bytes = await makeValidPdf(pageCount)
  return { id, name: `${id}.pdf`, bytes, pageCount }
}

function page(
  sourceFileId: string,
  pageIndex: number,
  rotation = 0,
  id = `${sourceFileId}-${pageIndex}`,
): WorkspacePage {
  return { id, sourceFileId, pageIndex, rotation }
}

/** Re-parses merged output so assertions read the real resulting document. */
async function parse(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes)
}

describe('mergePages', () => {
  it('produces a PDF with one page per workspace page, in array order', async () => {
    const src = await makeSource('a', 3)
    // Deliberately non-sequential order to prove order follows the array.
    const pages = [page('a', 2), page('a', 0), page('a', 1)]

    const result = await mergePages(pages, [src])
    const doc = await parse(result)

    expect(doc.getPageCount()).toBe(3)
  })

  it('reflects the array order via distinguishable page sizes', async () => {
    // Two sources with different MediaBox sizes so order is observable.
    const small = await PDFDocument.create()
    small.addPage([200, 400])
    const smallSrc: SourceFile = {
      id: 's',
      name: 's.pdf',
      bytes: (await small.save()).slice().buffer,
      pageCount: 1,
    }
    const large = await PDFDocument.create()
    large.addPage([800, 600])
    const largeSrc: SourceFile = {
      id: 'l',
      name: 'l.pdf',
      bytes: (await large.save()).slice().buffer,
      pageCount: 1,
    }

    const doc = await parse(
      await mergePages([page('l', 0), page('s', 0)], [smallSrc, largeSrc]),
    )

    expect(doc.getPageCount()).toBe(2)
    // First page came from the large source, second from the small one.
    expect(doc.getPage(0).getWidth()).toBe(800)
    expect(doc.getPage(0).getHeight()).toBe(600)
    expect(doc.getPage(1).getWidth()).toBe(200)
    expect(doc.getPage(1).getHeight()).toBe(400)
  })

  it('applies 90 / 180 / 270 rotation to the result pages', async () => {
    const src = await makeSource('a', 4)
    const pages = [
      page('a', 0, 0),
      page('a', 1, 90),
      page('a', 2, 180),
      page('a', 3, 270),
    ]

    const doc = await parse(await mergePages(pages, [src]))

    expect(doc.getPage(0).getRotation().angle).toBe(0)
    expect(doc.getPage(1).getRotation().angle).toBe(90)
    expect(doc.getPage(2).getRotation().angle).toBe(180)
    expect(doc.getPage(3).getRotation().angle).toBe(270)
  })

  it('excludes pages absent from the array (deletion via SSoT)', async () => {
    const src = await makeSource('a', 5)
    // Page index 2 is intentionally omitted → it must not appear.
    const pages = [page('a', 0), page('a', 1), page('a', 3), page('a', 4)]

    const doc = await parse(await mergePages(pages, [src]))

    expect(doc.getPageCount()).toBe(4)
  })

  it('merges pages interleaved from multiple sources', async () => {
    const a = await makeSource('a', 2)
    const b = await makeSource('b', 2)
    const pages = [page('a', 0), page('b', 1), page('a', 1), page('b', 0)]

    const doc = await parse(await mergePages(pages, [a, b]))

    expect(doc.getPageCount()).toBe(4)
  })

  it('returns valid PDF bytes (does not throw) for an empty pages array', async () => {
    const src = await makeSource('a', 3)

    const result = await mergePages([], [src])

    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.byteLength).toBeGreaterThan(0)
  })

  it('throws when a page references an unknown source file', async () => {
    const src = await makeSource('a', 1)

    await expect(mergePages([page('missing', 0)], [src])).rejects.toThrow(
      /unknown sourceFileId/,
    )
  })

  it('throws when a pageIndex is out of range for its source', async () => {
    const src = await makeSource('a', 2)

    await expect(mergePages([page('a', 5)], [src])).rejects.toThrow(
      /out of range/,
    )
  })
})
