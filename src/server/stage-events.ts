/**
 * NDJSON stage-event contract for `POST /api/analyze`.
 *
 * The analysis runs as a stream: the server walks the separated
 * `load → audit → ai → done` pipeline and, at each transition, writes one JSON
 * object per line (newline-delimited JSON). The browser reads those lines as
 * they arrive and drives the `ProgressStepper` off the `stage` events, then
 * renders the report off the terminal `result` event — so the stepper updates
 * live instead of waiting for the whole analysis.
 *
 * Two event kinds make up the contract:
 * - {@link StageProgressEvent} (`type: 'stage'`) — the pipeline entered a
 *   `Stage`. Emitted for every visited stage in order, including the terminal
 *   one (`done` / `done-partial` / `error-load`), so the stepper can be driven
 *   from the event stream alone without inspecting the report.
 * - {@link StageResultEvent} (`type: 'result'`) — the terminal payload, a
 *   {@link ReportResult}. Emitted exactly once, last.
 *
 * The `Stage` vocabulary and the `ReportResult` shapes are reused from the
 * shared state / core layers, so client and server agree on one contract; this
 * module adds only the wire envelope plus the (de)serialisation helpers.
 *
 * Boundary: standalone backend module. It imports only *types* from the state
 * and core layers (no runtime coupling) and touches no DOM or Node globals, so
 * both the server writer and the client reader can unit-test it network-free.
 */
import type { Stage } from '../state/stage'
import type { ReportResult } from '../core/report'

/** The pipeline entered `stage`. Drives the progress stepper live. */
export interface StageProgressEvent {
  type: 'stage'
  /** The stage the pipeline just transitioned into. */
  stage: Stage
}

/** The terminal analysis payload. Emitted once, as the final line. */
export interface StageResultEvent {
  type: 'result'
  /** The finished (or failed-load) report. */
  result: ReportResult
}

/** One line of the NDJSON analysis stream. */
export type StageEvent = StageProgressEvent | StageResultEvent

/** Convenience constructor for a `stage` progress event. */
export function stageEvent(stage: Stage): StageProgressEvent {
  return { type: 'stage', stage }
}

/** Convenience constructor for the terminal `result` event. */
export function resultEvent(result: ReportResult): StageResultEvent {
  return { type: 'result', result }
}

/**
 * Serialises one event to a single NDJSON line (JSON + trailing `\n`). The
 * newline terminates the record so the reader can split the stream on `\n`.
 */
export function serializeEvent(event: StageEvent): string {
  return `${JSON.stringify(event)}\n`
}

/**
 * Parses one NDJSON line back into a {@link StageEvent}. Throws on a blank line
 * or a payload whose shape is not a recognised event, so a corrupt stream fails
 * loudly rather than silently yielding `undefined` fields to the UI.
 */
export function parseEvent(line: string): StageEvent {
  const trimmed = line.trim()
  if (trimmed === '') {
    throw new Error('cannot parse an empty NDJSON line')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`invalid NDJSON line: ${trimmed}`)
  }

  if (!isStageEvent(parsed)) {
    throw new Error(`unrecognised stage event: ${trimmed}`)
  }
  return parsed
}

/** Runtime type guard: whether `value` is a well-formed {@link StageEvent}. */
export function isStageEvent(value: unknown): value is StageEvent {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.type === 'stage') return typeof record.stage === 'string'
  if (record.type === 'result') {
    return typeof record.result === 'object' && record.result !== null
  }
  return false
}
