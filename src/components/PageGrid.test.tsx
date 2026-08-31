// @vitest-environment jsdom
/**
 * Smoke tests for the InfoTooltip placements the grid owns (grain-3, spec:
 * per-feature help system).
 *
 * Two placements are covered through {@link PageGrid} because it supplies the
 * dnd-kit `DndContext`/`SortableContext` a card needs to mount:
 * - grid top — the reorder tooltip (`helpKey="reorder"`).
 * - page card actions — the rotate+delete tooltip (`helpKey="delete"`), which
 *   must live inside the drag-guarded `.page-card__actions` so it never starts a
 *   drag.
 *
 * These assert the tooltip *contract* (render + open + drag-safe placement), not
 * the card's rasterise/lazy-render internals. Rendering runs in jsdom via
 * testing-library.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PageGrid from './PageGrid'
import type { ThumbnailRenderer } from '../core/thumbnail'
import type { SourceFile, WorkspacePage } from '../core/types'
import { HELP_TEXT } from '../strings/helpText'

afterEach(cleanup)

const SOURCE_FILES: SourceFile[] = [
  { id: 'src-1', name: 'report.pdf', bytes: new ArrayBuffer(0), pageCount: 1 },
]

const PAGES: WorkspacePage[] = [
  { id: 'p-1', sourceFileId: 'src-1', pageIndex: 0, rotation: 0 },
]

/** A no-op renderer: the tooltip tests don't care about the rasterised image. */
function stubRenderer(): ThumbnailRenderer {
  return {
    render: vi.fn().mockResolvedValue({
      cacheKey: 'k',
      dataUrl: 'data:,',
      width: 1,
      height: 1,
    }),
  } as unknown as ThumbnailRenderer
}

function renderGrid(overrides: Partial<React.ComponentProps<typeof PageGrid>> = {}) {
  const props = {
    sourceFiles: SOURCE_FILES,
    pages: PAGES,
    renderer: stubRenderer(),
    onReorder: vi.fn(),
    selected: new Set<string>(),
    onRotate: vi.fn(),
    onDelete: vi.fn(),
    onToggleSelect: vi.fn(),
    ...overrides,
  }
  render(<PageGrid {...props} />)
  return props
}

const infoTrigger = (key: 'reorder' | 'delete') =>
  screen.getByRole('button', {
    name: `Help: ${HELP_TEXT[key].title}`,
  }) as HTMLButtonElement

describe('PageGrid — info icon (InfoTooltip)', () => {
  it('renders the grid-top reorder icon and the in-card delete icon', () => {
    renderGrid()
    expect(infoTrigger('reorder')).toBeTruthy()
    expect(infoTrigger('delete')).toBeTruthy()
  })

  it.each(['reorder', 'delete'] as const)(
    'reveals the %s help copy only after its icon is activated',
    (key) => {
      renderGrid()
      const { body } = HELP_TEXT[key]

      expect(screen.queryByText(body)).toBeNull()

      fireEvent.click(infoTrigger(key))

      expect(screen.getByText(body)).toBeTruthy()
      expect(infoTrigger(key).getAttribute('aria-expanded')).toBe('true')
    },
  )

  it('places the delete tooltip inside the drag-guarded card actions so it never starts a drag', () => {
    renderGrid()

    // The ⓘ lives within `.page-card__actions`, whose pointer/keydown handlers
    // stop the event before dnd-kit's sortable listeners see it — the same guard
    // the rotate/delete buttons already rely on.
    const trigger = infoTrigger('delete')
    expect(trigger.closest('.page-card__actions')).not.toBeNull()

    // Opening the tooltip must not lift the card into its dragging state.
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)
    expect(screen.getByText(HELP_TEXT.delete.body)).toBeTruthy()
    expect(trigger.closest('.page-card')?.classList.contains('page-card--dragging')).toBe(false)
  })
})
