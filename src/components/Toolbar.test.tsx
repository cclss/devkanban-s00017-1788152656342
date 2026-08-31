// @vitest-environment jsdom
/**
 * Smoke tests for the toolbar's Export Selected Pages (extract) wiring.
 *
 * These cover the toolbar's *contract*, not its internals: the button is
 * disabled with no selection, enabled with one, and on click hands the checked
 * pages plus source files to the App-owned `onExportSelected`. Rendering runs in
 * jsdom via testing-library (opted in per-file above so the React-free core
 * suite keeps its fast `node` environment).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Toolbar from './Toolbar'
import type { SourceFile, WorkspacePage } from '../core/types'
import { HELP_TEXT } from '../strings/helpText'

afterEach(cleanup)

const SOURCE_FILES: SourceFile[] = [
  { id: 'src-1', name: 'report.pdf', bytes: new ArrayBuffer(0), pageCount: 2 },
]

const page = (id: string): WorkspacePage => ({
  id,
  sourceFileId: 'src-1',
  pageIndex: 0,
  rotation: 0,
})

/** Renders the toolbar with sensible defaults; overrides win. */
function renderToolbar(overrides: Partial<React.ComponentProps<typeof Toolbar>> = {}) {
  const props = {
    pages: [page('p-1'), page('p-2')],
    selectedPages: [] as WorkspacePage[],
    sourceFiles: SOURCE_FILES,
    onExportAll: vi.fn().mockResolvedValue(undefined),
    onExportSelected: vi.fn().mockResolvedValue(undefined),
    onSplitByCount: vi.fn().mockResolvedValue(undefined),
    onSplitByRanges: vi.fn().mockResolvedValue(undefined),
    selectedCount: 0,
    ...overrides,
  }
  render(<Toolbar {...props} />)
  return props
}

const selectedExportButton = () =>
  screen.getByRole('button', { name: 'Export Selected Pages' }) as HTMLButtonElement

// Split controls use a stable aria-label so accessors survive the busy label swap.
const countField = () => screen.getByLabelText('Pages per split') as HTMLInputElement
const rangeField = () => screen.getByLabelText('Split range') as HTMLInputElement
const splitCountButton = () =>
  screen.getByRole('button', { name: 'Split by N pages' }) as HTMLButtonElement
const splitRangesButton = () =>
  screen.getByRole('button', { name: 'Split by range' }) as HTMLButtonElement

describe('Toolbar — Export Selected Pages', () => {
  it('is disabled when no pages are selected', () => {
    renderToolbar({ selectedPages: [], selectedCount: 0 })
    expect(selectedExportButton().disabled).toBe(true)
  })

  it('is enabled once at least one page is selected', () => {
    renderToolbar({ selectedPages: [page('p-2')], selectedCount: 1 })
    expect(selectedExportButton().disabled).toBe(false)
  })

  it('hands the checked pages and source files to onExportSelected on click', () => {
    const selectedPages = [page('p-2')]
    const { onExportSelected } = renderToolbar({ selectedPages, selectedCount: 1 })

    fireEvent.click(selectedExportButton())

    expect(onExportSelected).toHaveBeenCalledTimes(1)
    expect(onExportSelected).toHaveBeenCalledWith(selectedPages, SOURCE_FILES)
  })

  it('does not invoke onExportSelected when disabled (no selection)', () => {
    const { onExportSelected } = renderToolbar({ selectedPages: [], selectedCount: 0 })

    fireEvent.click(selectedExportButton())

    expect(onExportSelected).not.toHaveBeenCalled()
  })
})

describe('Toolbar — Split by N pages', () => {
  it('is disabled until a positive page count is entered', () => {
    renderToolbar()
    expect(splitCountButton().disabled).toBe(true)

    fireEvent.change(countField(), { target: { value: '2' } })
    expect(splitCountButton().disabled).toBe(false)
  })

  it('rejects non-positive or non-integer counts', () => {
    renderToolbar()
    for (const bad of ['0', '-1', '1.5', 'abc', '']) {
      fireEvent.change(countField(), { target: { value: bad } })
      expect(splitCountButton().disabled).toBe(true)
    }
  })

  it('hands the numeric count, pages and source files to onSplitByCount', () => {
    const pages = [page('p-1'), page('p-2')]
    const { onSplitByCount } = renderToolbar({ pages })

    fireEvent.change(countField(), { target: { value: '2' } })
    fireEvent.click(splitCountButton())

    expect(onSplitByCount).toHaveBeenCalledTimes(1)
    expect(onSplitByCount).toHaveBeenCalledWith(2, pages, SOURCE_FILES)
  })

  it('stays disabled with no handler wired', () => {
    renderToolbar({ onSplitByCount: undefined })
    fireEvent.change(countField(), { target: { value: '2' } })
    expect(splitCountButton().disabled).toBe(true)
  })
})

describe('Toolbar — Split by range', () => {
  it('is disabled while the range field is empty', () => {
    renderToolbar()
    expect(splitRangesButton().disabled).toBe(true)
  })

  it('shows an inline error and blocks the run for an invalid range', () => {
    // Only 2 pages exist, so "3" is out of range → parseRange fails inline.
    const { onSplitByRanges } = renderToolbar()

    fireEvent.change(rangeField(), { target: { value: '3' } })

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(splitRangesButton().disabled).toBe(true)

    fireEvent.click(splitRangesButton())
    expect(onSplitByRanges).not.toHaveBeenCalled()
    expect(rangeField().getAttribute('aria-invalid')).toBe('true')
  })

  it('enables and passes the raw range string to onSplitByRanges when valid', () => {
    const pages = [page('p-1'), page('p-2')]
    const { onSplitByRanges } = renderToolbar({ pages })

    fireEvent.change(rangeField(), { target: { value: '1-2' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(splitRangesButton().disabled).toBe(false)

    fireEvent.click(splitRangesButton())
    expect(onSplitByRanges).toHaveBeenCalledTimes(1)
    expect(onSplitByRanges).toHaveBeenCalledWith('1-2', pages, SOURCE_FILES)
  })

  // Each classified parseRange failure must surface *its own* inline message,
  // disable the range-split action, and block the export (each invalid-range
  // case shows an inline message and disables the button).
  // pages.length is 2 here, so the fixtures below map to each RangeErrorKind.
  const INVALID_RANGE_CASES: ReadonlyArray<{
    kind: string
    input: string
    expectedFragment: string
  }> = [
    // 'empty' shows no alert (a blank field is not yet a mistake); covered by
    // the dedicated "disabled while the range field is empty" test above.
    { kind: 'invalid-token', input: 'abc', expectedFragment: 'is not a valid range' },
    { kind: 'reversed-range', input: '2-1', expectedFragment: 'ends before it begins' },
    { kind: 'out-of-range', input: '3', expectedFragment: 'is outside the document' },
  ]

  it.each(INVALID_RANGE_CASES)(
    'shows the $kind inline message, disables the button and blocks export',
    ({ input, expectedFragment }) => {
      const { onSplitByRanges } = renderToolbar()

      fireEvent.change(rangeField(), { target: { value: input } })

      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain(expectedFragment)
      expect(splitRangesButton().disabled).toBe(true)
      expect(rangeField().getAttribute('aria-invalid')).toBe('true')

      fireEvent.click(splitRangesButton())
      expect(onSplitByRanges).not.toHaveBeenCalled()
    },
  )

  it('clears the inline error and re-enables the button once corrected', () => {
    renderToolbar()

    fireEvent.change(rangeField(), { target: { value: '9' } })
    expect(screen.queryByRole('alert')).not.toBeNull()
    expect(splitRangesButton().disabled).toBe(true)

    fireEvent.change(rangeField(), { target: { value: '1-2' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(splitRangesButton().disabled).toBe(false)
    expect(rangeField().getAttribute('aria-invalid')).toBeNull()
  })
})

describe('Toolbar — info icon (InfoTooltip) placement', () => {
  // Each toolbar feature carries a per-feature ⓘ whose accessible name is the
  // grain-1 default `Help: {title}`. Activation must reveal that key's HELP_TEXT
  // body (grain-2 DoneWhen: exportAll/splitByCount/splitByRange render + open).
  const TOOLBAR_HELP_KEYS = ['exportAll', 'splitByCount', 'splitByRange'] as const

  const infoTrigger = (key: (typeof TOOLBAR_HELP_KEYS)[number]) =>
    screen.getByRole('button', {
      name: `Help: ${HELP_TEXT[key].title}`,
    }) as HTMLButtonElement

  it('renders exactly the three toolbar info icons', () => {
    renderToolbar()
    for (const key of TOOLBAR_HELP_KEYS) {
      expect(infoTrigger(key)).toBeTruthy()
    }
  })

  it.each(TOOLBAR_HELP_KEYS)(
    'reveals the %s help copy only after its icon is activated',
    (key) => {
      renderToolbar()
      const { body } = HELP_TEXT[key]

      // Closed by default — no help body on screen.
      expect(screen.queryByText(body)).toBeNull()

      fireEvent.click(infoTrigger(key))

      expect(screen.getByText(body)).toBeTruthy()
      expect(infoTrigger(key).getAttribute('aria-expanded')).toBe('true')
    },
  )

  it('opens each toolbar tooltip independently of the others', () => {
    renderToolbar()

    // Opening one does not open the siblings.
    fireEvent.click(infoTrigger('splitByCount'))
    expect(screen.getByText(HELP_TEXT.splitByCount.body)).toBeTruthy()
    expect(screen.queryByText(HELP_TEXT.exportAll.body)).toBeNull()
    expect(screen.queryByText(HELP_TEXT.splitByRange.body)).toBeNull()
  })
})

describe('Toolbar — in-flight guard', () => {
  it('disables the other actions while a split is running', () => {
    // A never-resolving handler keeps the toolbar in its busy state.
    const onSplitByCount = vi.fn(() => new Promise<void>(() => {}))
    renderToolbar({ onSplitByCount, selectedPages: [page('p-1')], selectedCount: 1 })

    fireEvent.change(countField(), { target: { value: '2' } })
    fireEvent.click(splitCountButton())

    expect(splitCountButton().getAttribute('aria-busy')).toBe('true')
    expect(splitRangesButton().disabled).toBe(true)
    expect(selectedExportButton().disabled).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Export All' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    // Inputs lock too, so the running split can't be re-parameterised mid-run.
    expect(countField().disabled).toBe(true)
    expect(rangeField().disabled).toBe(true)
  })
})
