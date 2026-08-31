import { useMemo } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { assignSourceColors } from '../core/source-color'
import type { ThumbnailRenderer } from '../core/thumbnail'
import type { SourceFile, WorkspacePage } from '../core/types'
import PageThumbnailCard from './PageThumbnailCard'
import { strings } from '../strings'
import InfoTooltip from './InfoTooltip'

/**
 * The unified page grid: every page of every loaded file laid
 * out as thumbnail cards in one grid, each tagged with its origin file's colour.
 *
 * The grid owns the cross-cutting concerns a single card cannot see:
 *
 * - **Colour assignment** — resolves each source id to its categorical colour
 *   once ({@link assignSourceColors}) so every card of the same file shares one
 *   colour and the palette stays stable as files are added.
 * - **Origin lookup** — links each {@link WorkspacePage} back to its
 *   {@link SourceFile} for the bytes/name a card needs.
 *
 * The lazy-render machinery itself lives per-card ({@link PageThumbnailCard}).
 */
export interface PageGridProps {
  /** Loaded files in workspace order — drives colour assignment order. */
  sourceFiles: SourceFile[]
  /** Flattened workspace pages (from `deriveWorkspacePages`). */
  pages: WorkspacePage[]
  /** Shared rasteriser so all cards reuse one parsed-document cache. */
  renderer: ThumbnailRenderer
  /**
   * Commits a drag: move the page dragged (`fromId`) onto the slot of the page
   * it was dropped over (`toId`). Wired to the SSoT `reorder` mutation so the
   * `pages` array — not local grid state — is the thing that reorders.
   */
  onReorder: (fromId: string, toId: string) => void
  /** Ids of pages currently checked — drives the per-card selection highlight. */
  selected: ReadonlySet<string>
  /** Rotate one page 90° clockwise (SSoT `rotate`). */
  onRotate: (id: string) => void
  /** Delete one page (SSoT `delete` for a single id). */
  onDelete: (id: string) => void
  /** Toggle one page's membership in the selection (SSoT `toggleSelect`). */
  onToggleSelect: (id: string) => void
  /** Thumbnail width in device pixels. Defaults to {@link DEFAULT_TARGET_WIDTH}. */
  targetWidth?: number
}

/** Device-pixel width each thumbnail is rasterised at. Implementation setting. */
const DEFAULT_TARGET_WIDTH = 240

/**
 * How far the pointer must travel before a drag starts (px). Keeps a plain
 * click/tap on the card from being swallowed as a drag — leaving room for the
 * per-card controls (rotate/delete/select). Implementation
 * setting, not a design token.
 */
const DRAG_ACTIVATION_DISTANCE = 5

export default function PageGrid({
  sourceFiles,
  pages,
  renderer,
  onReorder,
  selected,
  onRotate,
  onDelete,
  onToggleSelect,
  targetWidth = DEFAULT_TARGET_WIDTH,
}: PageGridProps) {
  // Pointer for mouse/touch, keyboard for accessibility (Tab to a card, Space to
  // pick up, arrows to move, Space to drop). The keyboard sensor uses the
  // sortable coordinate getter so arrow keys map to grid neighbours.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  // Colour per source id, assigned in load order (stable across re-renders).
  const colors = useMemo(
    () => assignSourceColors(sourceFiles.map((file) => file.id)),
    [sourceFiles],
  )
  // Origin file per id, for the bytes/name each card needs.
  const byId = useMemo(() => {
    const map = new Map<string, SourceFile>()
    for (const file of sourceFiles) map.set(file.id, file)
    return map
  }, [sourceFiles])

  // Sortable item ids, in current grid order — dnd-kit diffs order against this.
  const itemIds = useMemo(() => pages.map((page) => page.id), [pages])

  // Translate a finished drag into an SSoT reorder. `over` is null when dropped
  // outside any card; an unchanged target is a no-op we skip.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onReorder(String(active.id), String(over.id))
  }

  if (pages.length === 0) return null

  return (
    <section className="page-grid-section" aria-label={strings.pageGrid.regionLabel}>
      <h3 className="page-grid__title">
        {strings.pageGrid.title(pages.length)}
        {/* Grid-top help for drag reorder (spec §top of the page grid): dragging a
            thumbnail sets the final export order. Placed beside the grid title
            so it explains the grid as a whole, not any one card. */}
        <InfoTooltip helpKey="reorder" />
      </h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          <div className="page-grid">
            {pages.map((page) => {
              const source = byId.get(page.sourceFileId)
              const color = colors.get(page.sourceFileId)
              // A page whose source vanished is a corrupt derivation, not a
              // render error — skip it rather than crash the whole grid.
              if (!source || !color) return null

              return (
                <PageThumbnailCard
                  key={page.id}
                  id={page.id}
                  sourceId={source.id}
                  bytes={source.bytes}
                  pageIndex={page.pageIndex}
                  sourceName={source.name}
                  pageLabel={page.pageIndex + 1}
                  color={color}
                  targetWidth={targetWidth}
                  renderer={renderer}
                  rotation={page.rotation}
                  selected={selected.has(page.id)}
                  onRotate={onRotate}
                  onDelete={onDelete}
                  onToggleSelect={onToggleSelect}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  )
}
