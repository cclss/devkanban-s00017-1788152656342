/**
 * Pure, React-free state machine for the landing-page grader flow.
 *
 * The whole screen is driven by one finite state: the grader `Stage`. It is the
 * single source of truth (SSoT) for what the stepper, report visibility, and
 * button states show — kept in one value (surfaced later as body `data-stage`)
 * so no part of the UI can drift out of sync. This module owns *only* the legal
 * transitions and the semantic actions (`start` / `reset`); it holds no state,
 * touches no DOM, and carries no user-facing copy, so it can be unit tested
 * without React or a browser.
 *
 * Flow: `idle → load → audit → ai → done` (happy path). The `ai` step may go
 * straight to `done-partial` when the AI evaluation fails (partial-result
 * principle — the 60-point auto-audit report still completes). The `load` step
 * may fail terminally into `error-load` (timeout / SSRF block / bad URL), in
 * which case no report is produced. Every terminal state resets back to `idle`
 * for a fresh run.
 *
 * Boundary: standalone logic module. It imports nothing from the components,
 * core, or state hooks, so those layers may depend on it and never the reverse.
 */

/** Every stage the grader flow can occupy. */
export type Stage =
  | 'idle'
  | 'load'
  | 'audit'
  | 'ai'
  | 'done'
  | 'done-partial'
  | 'error-load'

/** All stages, in canonical order (idle first, terminals last). */
export const STAGES: readonly Stage[] = [
  'idle',
  'load',
  'audit',
  'ai',
  'done',
  'done-partial',
  'error-load',
] as const

/**
 * Stages where an analysis is actively running. While in any of these, a new
 * "start" request is a conflict and must be blocked client-side.
 */
export const IN_PROGRESS_STAGES: readonly Stage[] = ['load', 'audit', 'ai']

/**
 * End states of a run. From any terminal the flow can only reset to `idle`
 * (via {@link reset}) or restart directly into a fresh run (via {@link start}).
 */
export const TERMINAL_STAGES: readonly Stage[] = [
  'done',
  'done-partial',
  'error-load',
]

/**
 * Adjacency map of every legal transition. Reset (`→ idle`) and restart
 * (`→ load`) from terminals are encoded here too, so {@link canTransition}
 * fully describes the machine; the {@link start} / {@link reset} helpers are
 * just the named, guarded entry points into these edges.
 */
const TRANSITIONS: Readonly<Record<Stage, readonly Stage[]>> = {
  idle: ['load'],
  load: ['audit', 'error-load'],
  audit: ['ai'],
  ai: ['done', 'done-partial'],
  done: ['idle', 'load'],
  'done-partial': ['idle', 'load'],
  'error-load': ['idle', 'load'],
} as const

/** True when `stage` is one of the actively-running stages. */
export function isInProgress(stage: Stage): boolean {
  return IN_PROGRESS_STAGES.includes(stage)
}

/** True when `stage` is an end state (`done` / `done-partial` / `error-load`). */
export function isTerminal(stage: Stage): boolean {
  return TERMINAL_STAGES.includes(stage)
}

/** Whether the direct edge `from → to` is a legal transition. */
export function canTransition(from: Stage, to: Stage): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * Applies the transition `from → to` when it is legal, returning the resulting
 * stage. An illegal transition is a no-op: it returns `from` unchanged so the
 * SSoT never lands in an unreachable state.
 */
export function transition(from: Stage, to: Stage): Stage {
  return canTransition(from, to) ? to : from
}

/** Outcome of a "start diagnosis" request. */
export interface StartResult {
  /** Stage after the request (always `load` when started, else unchanged). */
  stage: Stage
  /** True when the run actually began (`idle` or a terminal restart). */
  started: boolean
  /**
   * True when the request was refused because a run is already in progress.
   * The caller surfaces this as an inline field error and sends no request.
   */
  conflict: boolean
  /**
   * True when the request was pre-blocked because the saved credential is a
   * Claude Code CLI token (`sk-ant-oat…`) that the Messages API rejects. The
   * caller surfaces the dedicated guidance and sends no request. Absent on the
   * normal path (only the App start gate ever sets it).
   */
  claudeCodeToken?: boolean
}

/**
 * Semantic "start diagnosis" action, enforcing the two start rules:
 *
 * - Start is allowed from `idle` and from any terminal (a terminal restart
 *   discards the old run and begins a completely fresh state machine).
 * - Start while a run is in progress is a **conflict**: no transition happens
 *   and `conflict` is `true`, so the client blocks the request before it is
 *   ever sent.
 */
export function start(current: Stage): StartResult {
  if (isInProgress(current)) {
    return { stage: current, started: false, conflict: true }
  }
  // idle or any terminal: begin a fresh run.
  return { stage: 'load', started: true, conflict: false }
}

/**
 * Semantic "new diagnosis" (reset) action. Returns `idle` from any terminal state
 * and is a no-op everywhere else (you cannot reset a run that is still going).
 */
export function reset(current: Stage): Stage {
  return isTerminal(current) ? 'idle' : current
}
