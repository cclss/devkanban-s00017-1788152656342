/**
 * Core domain types for the PDF workspace.
 *
 * This layer is intentionally React-independent:
 * pure data + pure functions so the merge/split/load logic can be unit tested
 * in isolation from the UI.
 */

/**
 * A single PDF loaded into the workspace.
 *
 * `bytes` holds the *original* file data untouched, so later operations
 * (merge/split/rotate) always re-read from the source rather than a lossy
 * intermediate. Shape: `sourceFiles: {id, name, bytes, pageCount}`.
 */
export interface SourceFile {
  /** Stable identifier assigned at load time; used to link pages back to their origin. */
  id: string
  /** Original file name shown to the user and reused on export. */
  name: string
  /** Untouched original bytes of the PDF. */
  bytes: ArrayBuffer
  /** Number of pages in the document. */
  pageCount: number
}

/**
 * Why a file could not be loaded:
 * - `encrypted`: the PDF is password-protected and must be unlocked first.
 * - `corrupt`: the bytes are not a readable PDF (damaged or wrong format).
 */
export type LoadErrorKind = 'encrypted' | 'corrupt'

export interface LoadError {
  kind: LoadErrorKind
  /** Human-facing message suitable for inline display. */
  message: string
}

/**
 * Discriminated result of attempting to load one file. A failed load never
 * throws — callers keep their existing workspace state and surface `error`
 * against the offending file only.
 */
export type LoadResult =
  | { ok: true; file: SourceFile }
  | { ok: false; error: LoadError }

/**
 * One page as it currently sits in the workspace.
 *
 * The `pages` array is the single source of truth (SSoT) for order, rotation,
 * and deletion: reordering the array reorders the export, a page absent from
 * the array is deleted from the result, and `rotation` is the page's absolute
 * orientation. A `WorkspacePage` points back to its origin via
 * `sourceFileId` + `pageIndex` rather than owning bytes, so the original
 * {@link SourceFile} data is never mutated.
 */
export interface WorkspacePage {
  /** Stable identifier for this page instance (distinct from the source page). */
  id: string
  /** {@link SourceFile.id} this page was copied from. */
  sourceFileId: string
  /** Zero-based index of the page within its source document. */
  pageIndex: number
  /**
   * Absolute rotation to apply on export, in degrees. Expected to be a
   * multiple of 90 (0 / 90 / 180 / 270); this is the full orientation state,
   * not a delta over the source page's own rotation.
   */
  rotation: number
}
