/**
 * Workspace toolbar. Hosts the export/split actions and the live selection
 * count.
 *
 * Actions:
 * - Export All (merge) — {@link onExportAll}.
 * - Export Selected Pages (extract) — {@link onExportSelected}.
 * - Split by N Pages / Split by Range — an
 *   input + run button each, calling {@link onSplitByCount} / {@link
 *   onSplitByRanges}. The actual split/zip/download is owned by {@link App}; the
 *   toolbar owns only the "when" (input state, validation, busy, inline error).
 *
 * Every action shares one pattern: the run button is enabled only when its
 * inputs are valid and no action is already running, shows an in-progress label
 * while its action runs, and surfaces a calm inline error if the pipeline
 * fails. A single in-flight guard
 * ({@link exporting}) blocks starting a second action mid-run. The range field
 * additionally validates its string with {@link parseRange} and shows the
 * classified inline message *before* running, blocking the run.
 */
import { useState } from 'react'
import type { SourceFile, WorkspacePage } from '../core/types'
import { parseRange } from '../core/range-parser'
import { strings } from '../strings'
import InfoTooltip from './InfoTooltip'

/**
 * Inline copy shown when a merge/split/download pipeline throws. Kept generic on
 * purpose: the core layers only throw on corrupt workspace state
 * and `download*` on a DOM failure — neither is a user-actionable detail, so
 * the message stays a calm "try again" rather than leaking internals
 * (error messages must not reveal system internals).
 */
const EXPORT_ERROR_MESSAGE = strings.errors.exportFailed

/** Which action is currently running (`null` = idle). Used as the in-flight guard. */
type ActionKind = 'all' | 'selected' | 'count' | 'ranges'

export interface ToolbarProps {
  /** Ordered SSoT pages to merge on Export All (order/rotation reflected). */
  pages: WorkspacePage[]
  /**
   * The checked pages in workspace order — the exact subset Export Selected
   * Pages extracts. Empty when nothing is checked, which disables that action.
   */
  selectedPages: WorkspacePage[]
  /** Source files the pages reference; their names drive the export filename. */
  sourceFiles: SourceFile[]
  /**
   * Runs the actual merge + download (owned by {@link App}). Rejects if the
   * merge or download fails, which the toolbar turns into the inline error.
   */
  onExportAll: (pages: WorkspacePage[], sourceFiles: SourceFile[]) => Promise<void>
  /**
   * Runs the actual extract + download of the checked pages (owned by
   * {@link App}). Rejects on failure, surfaced as the same inline error.
   */
  onExportSelected: (
    pages: WorkspacePage[],
    sourceFiles: SourceFile[],
  ) => Promise<void>
  /**
   * Splits every `count` pages into their own PDF, bundling multiple results as
   * a zip (owned by {@link App}). Optional so the toolbar renders (with the
   * control disabled) until the App wires the pipeline in.
   */
  onSplitByCount?: (
    count: number,
    pages: WorkspacePage[],
    sourceFiles: SourceFile[],
  ) => Promise<void>
  /**
   * Splits by a 1-based range string (e.g. `"1-3, 7, 10-12"`) into one PDF per
   * comma group, bundling multiple results as a zip (owned by {@link App}). The
   * toolbar validates the string with {@link parseRange} first and only calls
   * this with a string that parsed cleanly. Optional for the same reason as
   * {@link onSplitByCount}.
   */
  onSplitByRanges?: (
    rangeInput: string,
    pages: WorkspacePage[],
    sourceFiles: SourceFile[],
  ) => Promise<void>
  /** Number of pages currently checked in the grid (SSoT selection size). */
  selectedCount?: number
}

/** A positive-integer string ("1", "12"); rejects "", "0", "1.5", "-2", "2a". */
const POSITIVE_INT = /^\d+$/

export default function Toolbar({
  pages,
  selectedPages,
  sourceFiles,
  onExportAll,
  onExportSelected,
  onSplitByCount,
  onSplitByRanges,
  selectedCount = 0,
}: ToolbarProps) {
  const [exporting, setExporting] = useState<ActionKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [countInput, setCountInput] = useState('')
  const [rangeInput, setRangeInput] = useState('')

  const hasPages = pages.length > 0
  const hasSelection = selectedPages.length > 0
  const isBusy = exporting !== null

  // ── Split by N Pages: a positive integer chunk size. ──────────────────────
  const countText = countInput.trim()
  const countValue = Number(countText)
  const countValid = POSITIVE_INT.test(countText) && countValue >= 1

  // ── Split by Range: validate the string up front. Skip while
  // empty or before any pages load — an out-of-range message against a 0-page
  // document would just be noise. The classified message shows inline and blocks
  // the run; a clean parse enables it.
  const rangeParse =
    hasPages && rangeInput.trim().length > 0
      ? parseRange(rangeInput, pages.length)
      : null
  const rangeError = rangeParse && !rangeParse.ok ? rangeParse.error.message : null

  // Each action needs its own valid inputs, its App-owned handler, and no other
  // action already running — a second click can't start an overlapping run.
  const canExportAll = hasPages && !isBusy
  const canExportSelected = hasSelection && !isBusy
  const canSplitCount = hasPages && countValid && !isBusy && !!onSplitByCount
  const canSplitRanges =
    hasPages && rangeParse?.ok === true && !isBusy && !!onSplitByRanges

  // Shared run wrapper for every action (inline-error pattern):
  // clear the prior error, mark this action busy, run it, and on failure show
  // the calm inline copy — the detail is not user-actionable.
  const runAction = async (
    kind: ActionKind,
    action: () => Promise<void>,
  ): Promise<void> => {
    setError(null)
    setExporting(kind)
    try {
      await action()
    } catch {
      setError(EXPORT_ERROR_MESSAGE)
    } finally {
      setExporting(null)
    }
  }

  const handleExportAll = () => {
    if (!canExportAll) return
    void runAction('all', () => onExportAll(pages, sourceFiles))
  }

  const handleExportSelected = () => {
    if (!canExportSelected) return
    void runAction('selected', () => onExportSelected(selectedPages, sourceFiles))
  }

  const handleSplitCount = () => {
    if (!canSplitCount || !onSplitByCount) return
    void runAction('count', () => onSplitByCount(countValue, pages, sourceFiles))
  }

  const handleSplitRanges = () => {
    if (!canSplitRanges || !onSplitByRanges) return
    void runAction('ranges', () => onSplitByRanges(rangeInput, pages, sourceFiles))
  }

  const inputsDisabled = !hasPages || isBusy

  return (
    <div className="toolbar" role="toolbar" aria-label={strings.toolbar.regionLabel}>
      <div className="toolbar__group">
        <button
          type="button"
          className={`btn ${canExportAll ? 'btn--primary' : 'btn--disabled'}`}
          disabled={!canExportAll}
          aria-busy={exporting === 'all'}
          onClick={handleExportAll}
        >
          {exporting === 'all' ? strings.toolbar.exporting : strings.toolbar.exportAll}
        </button>
        <button
          type="button"
          className={`btn ${canExportSelected ? 'btn--primary' : 'btn--disabled'}`}
          disabled={!canExportSelected}
          aria-busy={exporting === 'selected'}
          onClick={handleExportSelected}
        >
          {exporting === 'selected'
            ? strings.toolbar.exporting
            : strings.toolbar.exportSelected}
        </button>
        {/* Explains the export-all (merge) vs export-selected (extract) difference for this action group. */}
        <InfoTooltip helpKey="exportAll" />
      </div>

      <div className="toolbar__group toolbar__group--split">
        <div className="split-control">
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="field-input field-input--count"
            value={countInput}
            onChange={(event) => setCountInput(event.target.value)}
            placeholder={strings.toolbar.countPlaceholder}
            aria-label={strings.toolbar.countFieldLabel}
            disabled={inputsDisabled}
          />
          <button
            type="button"
            className={`btn ${canSplitCount ? 'btn--primary' : 'btn--disabled'}`}
            disabled={!canSplitCount}
            aria-busy={exporting === 'count'}
            aria-label={strings.toolbar.splitByCountAction}
            onClick={handleSplitCount}
          >
            {exporting === 'count' ? strings.toolbar.splitting : strings.toolbar.splitByCount}
          </button>
          {/* Explains the N-page chunk-split behaviour. */}
          <InfoTooltip helpKey="splitByCount" />
        </div>

        <div className="split-control">
          <input
            type="text"
            className={`field-input field-input--range${
              rangeError ? ' field-input--invalid' : ''
            }`}
            value={rangeInput}
            onChange={(event) => setRangeInput(event.target.value)}
            placeholder={strings.toolbar.rangePlaceholder}
            aria-label={strings.toolbar.rangeFieldLabel}
            aria-invalid={rangeError ? true : undefined}
            disabled={inputsDisabled}
          />
          <button
            type="button"
            className={`btn ${canSplitRanges ? 'btn--primary' : 'btn--disabled'}`}
            disabled={!canSplitRanges}
            aria-busy={exporting === 'ranges'}
            aria-label={strings.toolbar.splitByRangeAction}
            onClick={handleSplitRanges}
          >
            {exporting === 'ranges' ? strings.toolbar.splitting : strings.toolbar.splitByRange}
          </button>
          {/* Explains the "1-3, 7, 10-12" range notation and input format. */}
          <InfoTooltip helpKey="splitByRange" />
        </div>
      </div>

      {rangeError ? (
        <p className="toolbar__error" role="alert">
          {rangeError}
        </p>
      ) : null}

      {selectedCount > 0 ? (
        <p className="toolbar__selection" aria-live="polite">
          {strings.toolbar.selectionCount(selectedCount)}
        </p>
      ) : (
        <p className="toolbar__hint">
          {hasPages ? strings.toolbar.hintReady : strings.toolbar.hintEmpty}
        </p>
      )}
      {error ? (
        <p className="toolbar__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
