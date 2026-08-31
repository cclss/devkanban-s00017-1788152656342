/**
 * Zip bundling for multi-file split results: several output PDFs are bundled
 * into a single downloadable zip archive.
 *
 * A split run (`splitEveryNPages` / `splitByRanges`) emits one `Uint8Array` per
 * output file. When there is more than one, the UI bundles them into a single
 * `.zip` so the user gets one download instead of many. That bundling is this
 * module's only job: it takes named byte payloads and returns a zip `Blob`.
 *
 * The heavy lifting is delegated to `client-zip`, a small
 * dependency that streams a standards-compliant zip entirely in the browser —
 * no bytes leave the client. This layer stays pure/data-only:
 * it produces a `Blob` and does not touch the DOM. Triggering the actual
 * download is `download.ts`'s `downloadBlob` (out of scope here).
 */

import { downloadZip } from 'client-zip'

/** One file to place inside the zip: a bare name and its raw bytes. */
export interface ZipEntry {
  /** Entry file name as it should appear inside the archive (e.g. `report-1.pdf`). */
  name: string
  /** The file's raw bytes (e.g. a split PDF payload from `split.ts`). */
  bytes: Uint8Array
}

/**
 * Bundles the given named byte payloads into a single zip `Blob`.
 *
 * Entry order in the archive follows the `entries` array. The result carries an
 * `application/zip` MIME type, so `downloadBlob` can hand it to the browser
 * directly. Callers that produce split filenames should use
 * `buildSplitFilenames` to name the entries.
 *
 * @param entries The files to include, in archive order. Must be non-empty —
 *   an empty zip is never a useful result, and the single-file case should be
 *   downloaded as a plain PDF rather than zipped.
 * @returns A `Blob` containing the finished zip archive.
 * @throws If `entries` is empty.
 */
export async function zipFiles(entries: ZipEntry[]): Promise<Blob> {
  if (entries.length === 0) {
    throw new Error('zipFiles: no entries to bundle')
  }

  // client-zip accepts `{ name, input }` records; `input` may be a Uint8Array.
  const files = entries.map((entry) => ({
    name: entry.name,
    // Cast around TS's ArrayBufferLike/ArrayBuffer generic mismatch: pdf-lib
    // returns `Uint8Array<ArrayBufferLike>`, a valid client-zip input at runtime.
    input: entry.bytes as Uint8Array,
  }))

  // `downloadZip` returns a Response streaming the archive; `.blob()` collects it.
  return downloadZip(files).blob()
}
