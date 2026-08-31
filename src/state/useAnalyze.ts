/**
 * React binding that turns the grader flow into a *real* `/api/analyze` run.
 *
 * It composes the pure {@link useStage} state machine with the streaming
 * {@link postAnalyze} client and one extra piece of state — the stored terminal
 * report. Starting a run guards through the same stage machine (so the
 * in-progress conflict rule still holds), then streams the endpoint: every
 * `stage` event is fed to `transitionTo` to drive the progress stepper live, and
 * the single terminal `result` is stored as the report to render. A
 * `done`/`done-partial` result stores an {@link AnalysisReport}; an `error-load`
 * result stores a {@link LoadErrorReport} (the report view then hides the report
 * and shows only the error card).
 *
 * The stage stays the single source of truth for *what phase* the screen is in
 * (mirrored to `body[data-stage]` by {@link useStage}); the report is stored
 * alongside it because it arrives from the network rather than being derivable
 * from the stage. Both are cleared on a fresh start and on reset so a new run
 * never shows a stale report.
 *
 * The only external edge, `fetch`, is injected (defaulting to the global) so the
 * hook is unit-testable with a mocked streaming `Response` and no real network.
 *
 * Boundary: state-layer hook. It wires `useStage`, `analyze-client`, and the
 * report *type*; it holds no copy and renders nothing.
 */
import { useCallback, useState } from 'react'
import { useStage } from './useStage'
import { postAnalyze, type AnalyzeParams, type FetchLike } from './analyze-client'
import type { Stage, StartResult } from './stage'
import type { ReportResult } from '../core/report'

export interface UseAnalyze {
  /** Current flow stage — the single source of truth for the whole screen. */
  stage: Stage
  /**
   * The stored terminal report, or `null` when no real run has completed
   * (idle / in-progress, or after a reset). `done`/`done-partial` store an
   * analysis report; `error-load` stores the error report.
   */
  report: ReportResult | null
  /**
   * Requests "진단 시작" for `params`. Guards through the stage machine: refuses
   * with `conflict: true` while a run is in progress (no request is sent);
   * otherwise clears any prior report, transitions to `load`, and streams the
   * analysis, driving `transitionTo` per stage event and storing the result.
   */
  start: (params: AnalyzeParams) => StartResult
  /** Requests "새로 진단": resets a terminal stage to `idle` and drops the report. */
  reset: () => void
  /**
   * Drives the machine directly to `to` when the edge is legal (used by the
   * test-tools simulator). Returns whether it was applied.
   */
  transitionTo: (to: Stage) => boolean
  /** Drops the stored report without touching the stage (used by the simulator). */
  clearReport: () => void
}

/**
 * @param fetchImpl Injected `fetch` for the streaming POST. Defaults to global.
 */
export function useAnalyze(fetchImpl: FetchLike = fetch): UseAnalyze {
  const { stage, start: startStage, reset: resetStage, transitionTo } = useStage()
  const [report, setReport] = useState<ReportResult | null>(null)

  const start = useCallback(
    (params: AnalyzeParams): StartResult => {
      const result = startStage()
      // Conflict (a run already in progress): no transition, send nothing.
      if (!result.started) return result

      // Fresh run: drop any prior report and stream the endpoint. `postAnalyze`
      // never rejects (transport failures surface as an error-load result), so
      // the fire-and-forget promise needs no rejection handling here.
      setReport(null)
      void postAnalyze(
        params,
        {
          onStage: (next) => transitionTo(next),
          onResult: (next) => {
            setReport(next)
            // Land the machine on the report's terminal stage. For a normal run
            // the terminal `stage` event already moved us there (this is then a
            // no-op); for a synthesised transport error there was no such event,
            // so this is what actually reaches `error-load` from `load`.
            transitionTo(next.outcome)
          },
        },
        fetchImpl,
      )
      return result
    },
    [startStage, transitionTo, fetchImpl],
  )

  const reset = useCallback(() => {
    setReport(null)
    resetStage()
  }, [resetStage])

  const clearReport = useCallback(() => setReport(null), [])

  return { stage, report, start, reset, transitionTo, clearReport }
}
