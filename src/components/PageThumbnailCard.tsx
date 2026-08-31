import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SourceColor } from '../core/source-color'
import type { ThumbnailRenderer } from '../core/thumbnail'
import { strings } from '../strings'
import InfoTooltip from './InfoTooltip'

/**
 * One page rendered as a thumbnail card (a single page tile in the grid).
 *
 * Two behaviours live here:
 *
 * - **Lazy render (keeps the UI responsive on large files).** The heavy pdf.js
 *   rasterise is deferred until the card actually approaches the viewport,
 *   observed via `IntersectionObserver`. A workspace with hundreds of pages
 *   therefore only rasterises what the user can (nearly) see, keeping scroll
 *   responsive.
 * - **Source colour tag (per-source colour coding).** Each card carries the
 *   categorical colour assigned to its origin file so the user can tell at a
 *   glance which PDF a page came from. The colour is a design-token reference
 *   ({@link SourceColor.cssVar}) — no raw hex reaches this component.
 *
 * Presentational + orchestration only: the actual raster is produced by the
 * shared {@link ThumbnailRenderer}, injected so the parent can share one
 * document cache across every card.
 */
export interface PageThumbnailCardProps {
  /** SSoT page id — the sortable item id dnd-kit reorders on ({@link WorkspacePage.id}). */
  id: string
  /** Origin file id — the renderer's document-cache key. */
  sourceId: string
  /** Original PDF bytes of the origin file (handed to the renderer). */
  bytes: ArrayBuffer
  /** Zero-based page index within the origin document. */
  pageIndex: number
  /** Human-facing name of the origin file, shown under the thumbnail. */
  sourceName: string
  /** 1-based page number within the origin file, shown as a badge. */
  pageLabel: number
  /** Categorical colour assigned to the origin file (token reference). */
  color: SourceColor
  /** Desired thumbnail width in device pixels. */
  targetWidth: number
  /** Shared pdf.js-backed rasteriser. */
  renderer: ThumbnailRenderer
  /**
   * Absolute orientation of this page in degrees (multiple of 90). Applied as a
   * CSS transform to the thumbnail image so the preview matches what export will
   * produce. The SSoT value lives on {@link WorkspacePage.rotation}.
   */
  rotation: number
  /** Whether this page is currently checked in the grid selection. */
  selected: boolean
  /** Rotate this page 90° clockwise (commits to the SSoT `pages` array). */
  onRotate: (id: string) => void
  /** Delete this page (commits to the SSoT `pages` array + prunes selection). */
  onDelete: (id: string) => void
  /** Toggle this page's membership in the grid selection. */
  onToggleSelect: (id: string) => void
}

/** Lazy render lifecycle of a single card. */
type RenderState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; dataUrl: string }
  | { status: 'error' }

/**
 * How far outside the viewport a card starts rendering, so a thumbnail is ready
 * by the time it scrolls into view. Implementation setting, not a design token.
 */
const PRELOAD_MARGIN = '300px'

/** Clockwise-rotate icon (rotate the page 90°). */
function RotateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12a9 9 0 1 1-3.4-7.05M21 4v4h-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Trash icon (delete the page). */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7m4 4v6m4-6v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Stops a pointer/keyboard event from bubbling to the card root, which carries
 * dnd-kit's drag listeners. Without this, pressing a control (rotate / delete /
 * checkbox) would be captured as the start of a drag gesture instead of a click.
 */
function stopDragGesture(event: PointerEvent | KeyboardEvent) {
  event.stopPropagation()
}

export default function PageThumbnailCard({
  id,
  sourceId,
  bytes,
  pageIndex,
  sourceName,
  pageLabel,
  color,
  targetWidth,
  renderer,
  rotation,
  selected,
  onRotate,
  onDelete,
  onToggleSelect,
}: PageThumbnailCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<RenderState>({ status: 'idle' })

  // Sortable wiring for drag-reorder. `useSortable` supplies the drag handle listeners,
  // the live transform that slides this card as siblings are reordered, and the
  // `isDragging` flag that drives the lifted drag-state styling. The reorder
  // itself is committed by the grid's `onDragEnd` against the SSoT `pages`
  // array — this component only renders the interaction.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  // One DOM node feeds two consumers: dnd-kit's sortable ref and the local
  // IntersectionObserver ref. A callback ref sets both so neither feature has
  // to give up its handle on the card element.
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node
      setNodeRef(node)
    },
    [setNodeRef],
  )

  const dragStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Observe viewport entry; flip `visible` once (then stop observing) so the
  // render fires a single time. Where IntersectionObserver is unavailable
  // (SSR / older engines) fall back to rendering eagerly rather than never.
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
            break
          }
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Rasterise once visible. `cancelled` guards against a state update after the
  // card unmounts or its inputs change mid-render.
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setState({ status: 'loading' })

    renderer
      .render({ sourceId, bytes, pageIndex, targetWidth })
      .then((thumbnail) => {
        if (!cancelled) setState({ status: 'ready', dataUrl: thumbnail.dataUrl })
      })
      .catch(() => {
        // A single page failing to render must not corrupt the workspace:
        // surface it on the card and leave every other page intact.
        if (!cancelled) setState({ status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [visible, renderer, sourceId, bytes, pageIndex, targetWidth])

  const className =
    'page-card' +
    (isDragging ? ' page-card--dragging' : '') +
    (selected ? ' page-card--selected' : '')

  return (
    <div
      className={className}
      ref={setRefs}
      style={dragStyle}
      {...attributes}
      {...listeners}
    >
      <div className="page-card__thumb">
        {state.status === 'ready' ? (
          <img
            className="page-card__image"
            style={{ transform: `rotate(${rotation}deg)` }}
            src={state.dataUrl}
            alt={strings.pageCard.previewAlt(sourceName, pageLabel)}
            loading="lazy"
          />
        ) : state.status === 'error' ? (
          <span className="page-card__status page-card__status--error" role="img" aria-label={strings.pageCard.previewFailed}>
            !
          </span>
        ) : (
          <span
            className="page-card__status"
            aria-label={strings.pageCard.previewLoading}
            role="status"
          >
            <span className="page-card__spinner" aria-hidden="true" />
          </span>
        )}
        <span className="page-card__badge" aria-hidden="true">
          {pageLabel}
        </span>

        {/* Selection checkbox. Pointer/keydown are stopped so ticking the box
            never starts a drag; onChange commits to the SSoT selection set. */}
        <label
          className="page-card__select"
          onPointerDown={stopDragGesture}
          onKeyDown={stopDragGesture}
        >
          <input
            type="checkbox"
            className="page-card__checkbox"
            checked={selected}
            onChange={() => onToggleSelect(id)}
            aria-label={strings.pageCard.selectPage(sourceName, pageLabel)}
          />
        </label>

        {/* Rotate / delete controls. Same drag-gesture guard so a click acts on
            the page instead of picking the card up. */}
        <div
          className="page-card__actions"
          onPointerDown={stopDragGesture}
          onKeyDown={stopDragGesture}
        >
          <button
            type="button"
            className="icon-btn"
            onClick={() => onRotate(id)}
            aria-label={strings.pageCard.rotatePage(sourceName, pageLabel)}
          >
            <RotateIcon />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            onClick={() => onDelete(id)}
            aria-label={strings.pageCard.deletePage(sourceName, pageLabel)}
          >
            <TrashIcon />
          </button>
          {/* One tooltip explains both rotate (cumulative 90°) and delete (workspace-only,
              cannot be undone) — it sits inside `.page-card__actions`, so the
              container's `stopDragGesture` guard already keeps the ⓘ from
              starting a drag (no separate handler needed). */}
          <InfoTooltip helpKey="delete" />
        </div>
      </div>

      <div className="page-card__meta">
        <span
          className="page-card__tag"
          style={{ backgroundColor: color.cssVar }}
          aria-hidden="true"
        />
        <span className="page-card__source" title={sourceName}>
          {sourceName}
        </span>
      </div>
    </div>
  )
}
