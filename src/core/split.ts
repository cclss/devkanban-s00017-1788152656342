import { PDFDocument, degrees } from 'pdf-lib'
import type { SourceFile, WorkspacePage } from './types'

/**
 * React-independent split/extract logic.
 *
 * Given the workspace `pages` array (the SSoT for order/rotation/deletion) and
 * the `sourceFiles` those pages reference, this module produces PDF bytes for
 * the three split/extract flows:
 *
 * 1. **Extract selected pages** — {@link extractPages} emits the given selection
 *    as a *single* PDF.
 * 2. **Split every N pages** — {@link splitEveryNPages} emits fixed-size chunks,
 *    one PDF per chunk.
 * 3. **Split by range** — {@link splitByRanges} emits caller-supplied index
 *    groups (e.g. the output of
 *    `parseRange`), one PDF per group.
 *
 * All three reuse the `merge.ts` conventions: each source document is parsed
 * once and cached, `rotation` is applied as the page's absolute orientation via
 * {@link degrees}, and the original {@link SourceFile} bytes are never mutated.
 * Out-of-scope concerns (zip bundling, filenames, download/Blob, range-string
 * parsing) live elsewhere — this layer only emits `Uint8Array` payloads.
 */

/**
 * Builds a reusable assembler bound to `sourceFiles`.
 *
 * The returned `assemble` copies a subset of workspace pages into a fresh PDF.
 * The parsed-source cache is shared across every `assemble` call, so when one
 * split run emits many files from the same sources each source is still loaded
 * only once (matching `mergePages`' single-load guarantee).
 */
function createAssembler(sourceFiles: SourceFile[]) {
  const byId = new Map<string, SourceFile>()
  for (const file of sourceFiles) byId.set(file.id, file)

  // Cache each source's parsed PDFDocument across all output files.
  const loaded = new Map<string, PDFDocument>()
  const loadSource = async (sourceFileId: string): Promise<PDFDocument> => {
    const cached = loaded.get(sourceFileId)
    if (cached) return cached

    const source = byId.get(sourceFileId)
    if (!source) {
      throw new Error(`split: unknown sourceFileId "${sourceFileId}"`)
    }
    const doc = await PDFDocument.load(source.bytes, { ignoreEncryption: true })
    loaded.set(sourceFileId, doc)
    return doc
  }

  return async function assemble(subset: WorkspacePage[]): Promise<Uint8Array> {
    const out = await PDFDocument.create()
    for (const page of subset) {
      const srcDoc = await loadSource(page.sourceFileId)
      const count = srcDoc.getPageCount()
      if (page.pageIndex < 0 || page.pageIndex >= count) {
        throw new Error(
          `split: pageIndex ${page.pageIndex} out of range for ` +
            `source "${page.sourceFileId}" (${count} pages)`,
        )
      }

      const [copied] = await out.copyPages(srcDoc, [page.pageIndex])
      // Absolute orientation from the SSoT, not a delta over the source page.
      copied.setRotation(degrees(page.rotation))
      out.addPage(copied)
    }
    return out.save()
  }
}

/**
 * Extracts the given selection into a single PDF (the "export selected pages" flow).
 *
 * The `pages` passed in are already the selected subset — order and rotation
 * follow the array exactly, just like {@link mergePages}. Unlike merge, an
 * empty selection is rejected: extracting zero pages would yield a meaningless
 * empty document, and the UI blocks the action when nothing is checked.
 *
 * @param pages The selected workspace pages, in output order.
 * @param sourceFiles Source files the pages reference (looked up by `id`).
 * @returns The serialized single PDF bytes.
 * @throws If `pages` is empty, references an unknown `sourceFileId`, or a
 *   `pageIndex` outside its source document's range.
 */
export async function extractPages(
  pages: WorkspacePage[],
  sourceFiles: SourceFile[],
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error('extractPages: no pages selected')
  }
  const assemble = createAssembler(sourceFiles)
  return assemble(pages)
}

/**
 * Splits the workspace into fixed-size chunks (the "split by N pages" flow).
 *
 * Pages are grouped in array order into consecutive chunks of `size`; the final
 * chunk holds the remainder when `pages.length` is not a multiple of `size`.
 * Each chunk becomes its own PDF. An empty workspace yields an empty array
 * (no files to emit) rather than a single empty PDF.
 *
 * @param pages The full workspace pages, in order.
 * @param sourceFiles Source files the pages reference.
 * @param size Pages per output file; must be a positive integer.
 * @returns One `Uint8Array` per chunk, in order.
 * @throws If `size` is not a positive integer, or a page is out of range /
 *   references an unknown source.
 */
export async function splitEveryNPages(
  pages: WorkspacePage[],
  sourceFiles: SourceFile[],
  size: number,
): Promise<Uint8Array[]> {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(
      `splitEveryNPages: size must be a positive integer (got ${size})`,
    )
  }
  const assemble = createAssembler(sourceFiles)
  const results: Uint8Array[] = []
  for (let start = 0; start < pages.length; start += size) {
    results.push(await assemble(pages.slice(start, start + size)))
  }
  return results
}

/**
 * Splits the workspace by caller-supplied index groups (the "split by page
 * range" flow).
 *
 * Each entry of `ranges` is a list of 0-based positions into the `pages` array
 * — typically derived from `range-parser.ts`. Every group becomes one PDF whose
 * pages follow the group's index order exactly (the caller decides ordering;
 * this function does not sort). One comma-separated range in the UI maps to one
 * group, so `"1-3, 7, 10-12"` (three groups) yields three files.
 *
 * @param pages The full workspace pages the indices point into.
 * @param sourceFiles Source files the pages reference.
 * @param ranges Groups of 0-based positions into `pages`; one PDF per group.
 * @returns One `Uint8Array` per group, in the order groups were given.
 * @throws If any index is not an integer within `[0, pages.length)`, or a page
 *   is out of range / references an unknown source.
 */
export async function splitByRanges(
  pages: WorkspacePage[],
  sourceFiles: SourceFile[],
  ranges: number[][],
): Promise<Uint8Array[]> {
  const assemble = createAssembler(sourceFiles)
  const results: Uint8Array[] = []
  for (const indices of ranges) {
    const subset = indices.map((index) => {
      if (!Number.isInteger(index) || index < 0 || index >= pages.length) {
        throw new Error(
          `splitByRanges: page position ${index} out of range ` +
            `(workspace has ${pages.length} pages)`,
        )
      }
      return pages[index]
    })
    results.push(await assemble(subset))
  }
  return results
}
