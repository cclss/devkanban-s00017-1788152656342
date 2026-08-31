/**
 * Pure `sourceFiles` → `WorkspacePage[]` derivation, plus the page rotate,
 * delete, and drag-reorder mutations over that array.
 *
 * The page grid lists *every* page of *every* loaded file in one flat grid. This
 * module is the single place that flattens the loaded documents into the ordered
 * `pages` array that becomes the workspace SSoT, and it owns the pure operations
 * that edit that array:
 *
 * - **Reorder** — {@link reorderPages} drag-moves a page to a new slot.
 * - **Rotate** — {@link rotatePage} steps one page 90° clockwise.
 * - **Delete** — {@link deletePages} removes selected pages.
 *
 * It is intentionally React-, DOM- and pdf.js-free so the rules can be unit
 * tested in plain Node. Rendering (pdf.js) and colour assignment (`source-color`)
 * live in their own modules; every operation here returns a new array and never
 * mutates the source bytes.
 */
import type { SourceFile, WorkspacePage } from './types'

/**
 * Rotation a freshly-derived page starts at. Absolute orientation in degrees;
 * the rotate operation mutates the SSoT `pages` array, never the source bytes.
 */
export const DEFAULT_PAGE_ROTATION = 0

/**
 * Stable id for a derived page: `"{sourceFileId}:{pageIndex}"`.
 *
 * Deterministic so the same (source, page) always yields the same key — React
 * can keep a card mounted across re-derivations, which is what lets a lazily
 * rendered thumbnail survive an unrelated state change instead of re-rasterising.
 */
export function workspacePageId(sourceFileId: string, pageIndex: number): string {
  return `${sourceFileId}:${pageIndex}`
}

/**
 * Flattens loaded source files into the ordered workspace `pages` array.
 *
 * Files are visited in `sourceFiles` order (i.e. load order) and each file
 * contributes its pages `0 … pageCount-1` in ascending order, so the resulting
 * grid reads file-by-file, page-by-page. Every page points back to its origin
 * via `sourceFileId` + `pageIndex` and owns no bytes, keeping the original
 * {@link SourceFile} data untouched (SSoT).
 *
 * @param sourceFiles Loaded files in workspace order.
 * @returns One {@link WorkspacePage} per page across all files, in grid order.
 * @throws {RangeError} If a file reports a `pageCount` that is not a
 *   non-negative integer — that signals a corrupt load result, not user error,
 *   and is surfaced loudly rather than silently producing a truncated grid.
 */
export function deriveWorkspacePages(
  sourceFiles: readonly SourceFile[],
): WorkspacePage[] {
  const pages: WorkspacePage[] = []

  for (const file of sourceFiles) {
    if (!Number.isInteger(file.pageCount) || file.pageCount < 0) {
      throw new RangeError(
        `deriveWorkspacePages: source "${file.id}" has an invalid pageCount ` +
          `(${file.pageCount}); expected a non-negative integer`,
      )
    }

    for (let pageIndex = 0; pageIndex < file.pageCount; pageIndex += 1) {
      pages.push({
        id: workspacePageId(file.id, pageIndex),
        sourceFileId: file.id,
        pageIndex,
        rotation: DEFAULT_PAGE_ROTATION,
      })
    }
  }

  return pages
}

/**
 * Degrees added to a page's rotation on each clockwise 90° step. Rotation is an
 * absolute orientation kept as a non-negative multiple of 90 in `[0, 360)`.
 */
export const ROTATION_STEP = 90

/**
 * Moves the page identified by `fromId` to the slot currently held by `toId`,
 * returning a new array (the input is never mutated — SSoT stays immutable so
 * React can diff by identity).
 *
 * Uses dnd-kit's `arrayMove` semantics: the page is removed from its slot and
 * re-inserted at the target index, sliding the pages in between over by one. A
 * drag that resolves to the same page, or that references an id no longer in the
 * grid, is a no-op and yields an order-preserving copy.
 *
 * @param pages Current ordered SSoT pages.
 * @param fromId Id of the page being dragged.
 * @param toId Id of the page it is dropped onto.
 */
export function reorderPages(
  pages: readonly WorkspacePage[],
  fromId: string,
  toId: string,
): WorkspacePage[] {
  const fromIndex = pages.findIndex((page) => page.id === fromId)
  const toIndex = pages.findIndex((page) => page.id === toId)

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return pages.slice()
  }

  const next = pages.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

/**
 * Rotates one page 90° clockwise, normalising the result into `[0, 360)` so the
 * orientation cycles 0 → 90 → 180 → 270 → 0. Returns a new array; every other
 * page (and the source bytes) is left untouched. An unknown `id` is a no-op copy.
 *
 * @param pages Current ordered SSoT pages.
 * @param id Id of the page to rotate.
 */
export function rotatePage(
  pages: readonly WorkspacePage[],
  id: string,
): WorkspacePage[] {
  return pages.map((page) =>
    page.id === id
      ? { ...page, rotation: (((page.rotation + ROTATION_STEP) % 360) + 360) % 360 }
      : page,
  )
}

/**
 * Removes every page whose id is in `ids`, returning a new array in the same
 * relative order. Accepts any iterable of ids (array or `Set`). Ids that match
 * no page are ignored; an empty selection yields an order-preserving copy.
 *
 * @param pages Current ordered SSoT pages.
 * @param ids Ids of the pages to delete.
 */
export function deletePages(
  pages: readonly WorkspacePage[],
  ids: Iterable<string>,
): WorkspacePage[] {
  const toDelete = ids instanceof Set ? ids : new Set(ids)
  if (toDelete.size === 0) return pages.slice()
  return pages.filter((page) => !toDelete.has(page.id))
}

/**
 * Re-derives the SSoT `pages` array after `sourceFiles` changes while preserving
 * every edit the user already made (order, rotation, and per-page deletions).
 *
 * Rules:
 * - Pages from files that are **still loaded** keep their existing position and
 *   rotation from `prev`. Their per-page deletions survive too: a page the user
 *   removed is simply absent from `prev` and is *not* re-added.
 * - Pages whose source file was **removed** are dropped.
 * - Pages of a **newly loaded** file (a `sourceFileId` not represented anywhere
 *   in `prev`) are appended to the end in derived (file-by-file, page-by-page)
 *   order.
 *
 * Distinguishing a deleted page from a genuinely new one hinges on the file:
 * once a file is represented in `prev`, its missing pages are treated as
 * deliberate deletions; only files absent from `prev` contribute fresh pages.
 *
 * @param prev The current, user-edited pages array.
 * @param sourceFiles The loaded files after the change.
 * @returns The reconciled SSoT pages array (new array; inputs untouched).
 */
export function reconcilePages(
  prev: readonly WorkspacePage[],
  sourceFiles: readonly SourceFile[],
): WorkspacePage[] {
  const derived = deriveWorkspacePages(sourceFiles)
  const validPageIds = new Set(derived.map((page) => page.id))

  // Files already represented in prev: their missing pages are deletions, not
  // gaps to be back-filled.
  const knownFileIds = new Set(prev.map((page) => page.sourceFileId))

  // Keep prior pages that still point at a live source page (drops removed
  // files and stale indices) — order and rotation preserved.
  const kept = prev.filter((page) => validPageIds.has(page.id))

  // Append pages belonging only to newly loaded files.
  const appended = derived.filter((page) => !knownFileIds.has(page.sourceFileId))

  return [...kept, ...appended]
}
