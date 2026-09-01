/**
 * React binding over the pure {@link module:state/stage} machine.
 *
 * The grader keeps its entire flow in one `Stage` value, and every sub-view
 * (stepper dots, report visibility, button enablement) reads that one value —
 * so it must live in exactly one place. This hook holds the current stage and
 * mirrors it onto `document.body`'s `data-stage` attribute, the single DOM
 * surface the rest of the UI keys off. All transition *rules* stay in the pure
 * module; this hook only holds state, wires the guarded actions, and performs
 * the DOM reflection side effect.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  isInProgress,
  isTerminal,
  reset as resetStage,
  start as startStage,
  transition as applyTransition,
  type Stage,
  type StartResult,
} from './stage'

/** DOM attribute the whole UI keys off. Kept here as the one write target. */
export const STAGE_ATTRIBUTE = 'data-stage'

export interface UseStage {
  /** Current stage — the single source of truth for the whole screen. */
  stage: Stage
  /** True while an analysis is actively running (load / audit / ai). */
  inProgress: boolean
  /** True in an end state (done / done-partial / error-load). */
  terminal: boolean
  /**
   * Requests "start diagnosis". Starts from `idle` or a terminal (fresh restart);
   * refuses with `conflict: true` while a run is in progress. Returns the
   * outcome so the caller can surface the conflict as an inline field error.
   */
  start: () => StartResult
  /** Requests "new diagnosis": resets a terminal stage back to `idle`. */
  reset: () => void
  /**
   * Applies the transition to `to` when legal, returning whether it was
   * applied. Illegal transitions are ignored so the SSoT never lands in an
   * unreachable state. Used to drive the flow forward (load → audit → …) and
   * by the test-tools panel to force specific stages.
   */
  transitionTo: (to: Stage) => boolean
}

/**
 * @param initial Stage to start from. Defaults to `idle`.
 */
export function useStage(initial: Stage = 'idle'): UseStage {
  const [stage, setStage] = useState<Stage>(initial)

  // Reflect the SSoT onto body[data-stage] so CSS and sibling components read
  // one value. Runs on mount and every change; clears the attribute on unmount
  // so a torn-down grader never leaves a stale stage on the shared <body>.
  useEffect(() => {
    document.body.setAttribute(STAGE_ATTRIBUTE, stage)
    return () => {
      document.body.removeAttribute(STAGE_ATTRIBUTE)
    }
  }, [stage])

  const start = useCallback((): StartResult => {
    const result = startStage(stage)
    if (result.started) setStage(result.stage)
    return result
  }, [stage])

  const reset = useCallback(() => {
    setStage((prev) => resetStage(prev))
  }, [])

  const transitionTo = useCallback((to: Stage): boolean => {
    let applied = false
    setStage((prev) => {
      const next = applyTransition(prev, to)
      applied = next !== prev
      return next
    })
    return applied
  }, [])

  return {
    stage,
    inProgress: isInProgress(stage),
    terminal: isTerminal(stage),
    start,
    reset,
    transitionTo,
  }
}
