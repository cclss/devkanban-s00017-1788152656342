/**
 * `pages` + selection state layer for the PDF workspace: owns page order,
 * rotation, deletion, and drag-reorder along with the checked-page selection.
 *
 * The `pages` array is the single source of truth (SSoT) for order, rotation,
 * and deletion. This hook owns that array plus the set of checked page ids, and
 * exposes the four SSoT mutations (reorder / rotate / delete) and the two
 * selection mutations (toggle / clear). All ordering logic lives in the pure,
 * React-free {@link module:core/pages} functions; the selection logic lives in
 * the pure helpers below. The hook only holds state and wires those together,
 * and re-derives `pages` via {@link reconcilePages} whenever `sourceFiles`
 * changes so user edits survive files being added or removed.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  deletePages,
  reconcilePages,
  reorderPages,
  rotatePage,
} from '../core/pages'
import type { SourceFile, WorkspacePage } from '../core/types'

/**
 * Toggles `id`'s membership in the selection, returning a new set (the input is
 * never mutated so React state updates stay pure). Adds the id if absent,
 * removes it if present.
 */
export function toggleSelection(
  selected: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * Drops every id in `removed` from the selection, returning a new set. Used to
 * keep selection consistent when the underlying pages are deleted — a checked
 * page that no longer exists must not linger in the selection. Returns the
 * original set instance when nothing changed, so callers can skip re-renders.
 */
export function pruneSelection(
  selected: ReadonlySet<string>,
  removed: Iterable<string>,
): Set<string> {
  const toRemove = removed instanceof Set ? removed : new Set(removed)
  let changed = false
  const next = new Set<string>()
  for (const id of selected) {
    if (toRemove.has(id)) changed = true
    else next.add(id)
  }
  return changed ? next : (selected as Set<string>)
}

export interface UseWorkspacePages {
  /** Ordered SSoT pages across all loaded files. */
  pages: WorkspacePage[]
  /** Ids of pages currently checked in the grid. */
  selected: Set<string>
  /** Moves the page `fromId` to the slot held by `toId` (dnd-kit reorder). */
  reorder: (fromId: string, toId: string) => void
  /** Rotates one page 90° clockwise. */
  rotate: (id: string) => void
  /** Deletes the given pages and clears them from the selection. */
  delete: (ids: Iterable<string>) => void
  /** Adds/removes one page from the selection. */
  toggleSelect: (id: string) => void
  /** Clears the entire selection. */
  clearSelection: () => void
}

/**
 * React binding over the pure `core/pages` + selection helpers.
 *
 * Reconciles `pages` from `sourceFiles` on every change while preserving order,
 * rotation, and deletions (see {@link reconcilePages}). Each mutation returns a
 * fresh array/set so the SSoT stays immutable and React diffs by identity.
 *
 * @param sourceFiles Loaded files, owned by {@link module:state/useSourceFiles}.
 */
export function useWorkspacePages(
  sourceFiles: readonly SourceFile[],
): UseWorkspacePages {
  const [pages, setPages] = useState<WorkspacePage[]>([])
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setPages((prev) => reconcilePages(prev, sourceFiles))
  }, [sourceFiles])

  const reorder = useCallback((fromId: string, toId: string) => {
    setPages((prev) => reorderPages(prev, fromId, toId))
  }, [])

  const rotate = useCallback((id: string) => {
    setPages((prev) => rotatePage(prev, id))
  }, [])

  const remove = useCallback((ids: Iterable<string>) => {
    const idSet = ids instanceof Set ? ids : new Set(ids)
    setPages((prev) => deletePages(prev, idSet))
    setSelected((prev) => pruneSelection(prev, idSet))
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => toggleSelection(prev, id))
  }, [])

  const clearSelection = useCallback(() => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()))
  }, [])

  return {
    pages,
    selected,
    reorder,
    rotate,
    delete: remove,
    toggleSelect,
    clearSelection,
  }
}
