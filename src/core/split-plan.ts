/**
 * Download planning for split results: a multi-file split is bundled into a
 * single zip download, while a single-file split downloads directly.
 *
 * A split run (`splitEveryNPages` / `splitByRanges`) emits one `Uint8Array` per
 * output file. Whether that becomes a single `.pdf` download or a bundled `.zip`
 * — and how each file is named — is a pure decision with no DOM or PDF work, so
 * it lives here as React-independent logic the App merely executes. Keeping it
 * pure lets the single-vs-zip branching and filename rules be
 * unit tested without a browser.
 *
 * This module decides; it does not perform. Producing the split bytes is
 * `split.ts`, building the zip `Blob` is `zip.ts`, and triggering the browser
 * download is `download.ts` — all out of scope here.
 */

import type { SourceFile } from './types'
import { buildExportFilename, buildSplitFilenames } from './download'
import type { ZipEntry } from './zip'
import { parseRange } from './range-parser'

/** Base name used for split parts / zip when no source name is usable. */
const SPLIT_FALLBACK = 'split'

/**
 * The concrete download to perform for a split result.
 * - `single`: exactly one part — download it as a plain `.pdf`.
 * - `zip`: several parts — bundle them (`entries`, in order) into one `.zip`.
 */
export type SplitPlan =
  | { kind: 'single'; filename: string; bytes: Uint8Array }
  | { kind: 'zip'; filename: string; entries: ZipEntry[] }

/**
 * The first source file with a non-blank name, used as the base for split part
 * names and the zip name. Empty when nothing usable exists; downstream naming
 * then applies the `split` fallback.
 */
function deriveSplitBase(sourceFiles: SourceFile[]): string {
  return sourceFiles.find((file) => file.name.trim().length > 0)?.name ?? ''
}

/**
 * Decides how a split result should be downloaded.
 *
 * One part → a single `<base>-1.pdf`. Several parts → a `<base>.zip` whose
 * entries are `<base>-<n>.pdf`, zero-padded to sort naturally (via
 * {@link buildSplitFilenames}). The base is derived from the first usable source
 * name and sanitized identically for both the parts and the zip, falling back to
 * `split` when no source name is usable.
 *
 * @param parts One `Uint8Array` per split output file, in order. Must be
 *   non-empty — a split with no results is never a useful download.
 * @param sourceFiles Source files the split drew from; the first usable name
 *   seeds the output names.
 * @returns A {@link SplitPlan} the caller executes (download vs. zip+download).
 * @throws If `parts` is empty.
 */
export function planSplitDownload(
  parts: Uint8Array[],
  sourceFiles: SourceFile[],
): SplitPlan {
  if (parts.length === 0) {
    throw new Error('planSplitDownload: no split results to download')
  }

  const base = deriveSplitBase(sourceFiles)
  const names = buildSplitFilenames(base, parts.length, {
    fallback: SPLIT_FALLBACK,
  })

  if (parts.length === 1) {
    return { kind: 'single', filename: names[0], bytes: parts[0] }
  }

  const entries: ZipEntry[] = parts.map((bytes, index) => ({
    name: names[index],
    bytes,
  }))
  // Reuse the same sanitized base for the archive name; `.pdf` → `.zip`.
  const filename = buildExportFilename([base], {
    fallback: SPLIT_FALLBACK,
  }).replace(/\.pdf$/i, '.zip')

  return { kind: 'zip', filename, entries }
}

/**
 * Reconstructs per-comma-group page positions from a validated range string
 * (the "split by page range" flow).
 *
 * `splitByRanges` emits one PDF per comma group, so — unlike `parseRange`, which
 * flattens the whole string into one sorted index list — each comma-separated
 * segment is parsed on its own into its own 0-based index group. `"1-3, 7,
 * 10-12"` therefore yields `[[0,1,2], [6], [9,10,11]]` (three files). The Toolbar
 * has already validated the full string, so a group failing to parse here is an
 * unexpected error and is rethrown for the caller's inline error handling.
 *
 * @param rangeInput The raw range string (e.g. `"1-3, 7, 10-12"`).
 * @param pageCount Total workspace pages; each page is validated against it.
 * @returns One group of 0-based page positions per comma segment.
 * @throws If a segment fails to parse or no non-empty segment exists.
 */
export function parseRangeGroups(
  rangeInput: string,
  pageCount: number,
): number[][] {
  const groups: number[][] = []
  for (const segment of rangeInput.split(',')) {
    // Blank segments cannot occur once the Toolbar has validated the string, but
    // guard anyway so a stray comma never produces an empty (thus empty-PDF) group.
    if (segment.trim().length === 0) continue
    const result = parseRange(segment, pageCount)
    if (!result.ok) {
      throw new Error(`parseRangeGroups: invalid range group (${result.error.kind})`)
    }
    groups.push(result.indices)
  }
  if (groups.length === 0) {
    throw new Error('parseRangeGroups: no valid range groups')
  }
  return groups
}
