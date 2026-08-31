import { PDFDocument, degrees } from 'pdf-lib'
import type { SourceFile, WorkspacePage } from './types'

/**
 * Merges workspace pages into a single PDF (the "export all" flow).
 *
 * React-independent pure function: given the ordered `pages` array (the SSoT
 * for order/rotation/deletion) and the `sourceFiles` they reference, it
 * assembles one PDF whose pages follow `pages` exactly:
 *
 * - **Order** — pages are added in array order.
 * - **Rotation** — each page's `rotation` is applied as its absolute
 *   orientation via {@link degrees}.
 * - **Deletion** — pages missing from the array simply aren't copied, so
 *   deletions are reflected implicitly.
 *
 * Each source document is parsed once and cached by `sourceFileId`, so a file
 * contributing many pages is never re-loaded. The original {@link SourceFile}
 * bytes are never mutated.
 *
 * @param pages Ordered workspace pages to include.
 * @param sourceFiles Source files the pages reference (looked up by `id`).
 * @returns The serialized merged PDF bytes.
 * @throws If a page references an unknown `sourceFileId`, or a `pageIndex`
 *         outside its source document's range — these indicate a corrupt
 *         workspace state rather than user error.
 */
export async function mergePages(
  pages: WorkspacePage[],
  sourceFiles: SourceFile[],
): Promise<Uint8Array> {
  const byId = new Map<string, SourceFile>()
  for (const file of sourceFiles) byId.set(file.id, file)

  const out = await PDFDocument.create()

  // Cache each source's parsed PDFDocument so a file is loaded only once
  // regardless of how many of its pages appear in `pages`.
  const loaded = new Map<string, PDFDocument>()
  const loadSource = async (sourceFileId: string): Promise<PDFDocument> => {
    const cached = loaded.get(sourceFileId)
    if (cached) return cached

    const source = byId.get(sourceFileId)
    if (!source) {
      throw new Error(`mergePages: unknown sourceFileId "${sourceFileId}"`)
    }
    const doc = await PDFDocument.load(source.bytes, { ignoreEncryption: true })
    loaded.set(sourceFileId, doc)
    return doc
  }

  for (const page of pages) {
    const srcDoc = await loadSource(page.sourceFileId)
    const count = srcDoc.getPageCount()
    if (page.pageIndex < 0 || page.pageIndex >= count) {
      throw new Error(
        `mergePages: pageIndex ${page.pageIndex} out of range for ` +
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
