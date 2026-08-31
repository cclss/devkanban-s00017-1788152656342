/**
 * Second block of the grader's 3-block layout: the progress stepper.
 *
 * The stepper renders the four phases the diagnosis walks through — page load →
 * auto audit → AI evaluation → report done — and colours each one from the single
 * `Stage` value (the SSoT surfaced as body `data-stage`). It holds no flow state
 * of its own: given a stage it derives, per step, whether that step is still
 * pending, currently `is-active`, already `is-done`, or failed (`is-error`), so it
 * can never drift out of sync with the URL form and the report.
 *
 * Rules encoded here (Design §상태 전이 규칙):
 * - Happy path `idle → load → audit → ai → done`: the step matching the current
 *   in-progress stage is `is-active`; every earlier step is `is-done`. When the
 *   run reaches `done` all four steps are `is-done`.
 * - Partial result (`done-partial`): the load and audit steps completed, the AI
 *   step failed (`is-error`), yet the report still completed, so the final
 *   "리포트 완료" step is `is-done` — the partial 60-point report exists.
 * - Load failure (`error-load`): the page-load step transitions to a failure
 *   indication (`is-error`); the later steps never start (stay pending), because
 *   no report is produced.
 *
 * Boundary: presentational component. It imports only the `Stage` type from the
 * state layer, holds no flow state, and touches no DOM globals. All copy is
 * co-located Korean domain content (mirroring the URL-form / report labels), not
 * design tokens.
 */
import type { Stage } from '../state/stage'

/** Visual state a single step can occupy, mapped 1:1 to the stepper CSS. */
export type StepStatus = 'pending' | 'active' | 'done' | 'error'

/** Stable identity of each progress step, in walk order. */
export type ProgressStepId = 'load' | 'audit' | 'ai' | 'done'

/** Korean, user-facing label for a progress step. */
export interface ProgressStep {
  id: ProgressStepId
  label: string
}

/**
 * The four diagnosis phases, in order. Labels are confirmed domain content
 * (like the report labels), not design tokens. Exported so tests assert against
 * the single source of the copy.
 */
export const PROGRESS_STEPS: readonly ProgressStep[] = [
  { id: 'load', label: '페이지 로드' },
  { id: 'audit', label: '자동 점검' },
  { id: 'ai', label: 'AI 평가' },
  { id: 'done', label: '리포트 완료' },
] as const

/** Accessible label for the stepper region. */
export const PROGRESS_STEPPER_LABEL = '진단 진행 단계'

/**
 * Per-stage map of every step's visual status. Kept explicit (one row per
 * `Stage`) so the mapping is auditable at a glance and each `Stage → step`
 * assignment is directly testable, rather than being reconstructed from index
 * arithmetic. This is the whole behaviour of the component.
 */
const STAGE_STEP_STATUS: Readonly<
  Record<Stage, Readonly<Record<ProgressStepId, StepStatus>>>
> = {
  idle: { load: 'pending', audit: 'pending', ai: 'pending', done: 'pending' },
  load: { load: 'active', audit: 'pending', ai: 'pending', done: 'pending' },
  audit: { load: 'done', audit: 'active', ai: 'pending', done: 'pending' },
  ai: { load: 'done', audit: 'done', ai: 'active', done: 'pending' },
  done: { load: 'done', audit: 'done', ai: 'done', done: 'done' },
  // AI failed but the auto-audit report still completed: AI step errors, the
  // report step is nonetheless done.
  'done-partial': { load: 'done', audit: 'done', ai: 'error', done: 'done' },
  // Page load failed: the load step shows the failure; nothing after it starts.
  'error-load': {
    load: 'error',
    audit: 'pending',
    ai: 'pending',
    done: 'pending',
  },
}

/** Maps a step status to its stepper CSS modifier (`pending` has none). */
const STATUS_CLASS: Readonly<Record<StepStatus, string>> = {
  pending: '',
  active: 'is-active',
  done: 'is-done',
  error: 'is-error',
}

/**
 * Visual glyph shown inside the step dot: a check for a completed step, a cross
 * for a failed one, otherwise the 1-based step number.
 */
function dotGlyph(status: StepStatus, index: number): string {
  if (status === 'done') return '✓'
  if (status === 'error') return '✕'
  return String(index + 1)
}

/**
 * The visual status of `stepId` when the flow is at `stage`. Pure and exported
 * so the stage→step rules can be verified without rendering.
 */
export function stepStatus(stage: Stage, stepId: ProgressStepId): StepStatus {
  return STAGE_STEP_STATUS[stage][stepId]
}

export interface ProgressStepperProps {
  /** Current flow stage — the single source of truth this view reads. */
  stage: Stage
}

/**
 * @param props See {@link ProgressStepperProps}.
 */
export default function ProgressStepper({ stage }: ProgressStepperProps) {
  return (
    <ol
      className="grader-stepper grader-block"
      aria-label={PROGRESS_STEPPER_LABEL}
    >
      {PROGRESS_STEPS.map((step, index) => {
        const status = stepStatus(stage, step.id)
        const modifier = STATUS_CLASS[status]
        return (
          <li
            key={step.id}
            className={`grader-step${modifier ? ` ${modifier}` : ''}`}
            data-step={step.id}
            data-status={status}
            aria-current={status === 'active' ? 'step' : undefined}
          >
            <span className="grader-step__dot" aria-hidden="true">
              {dotGlyph(status, index)}
            </span>
            <span className="grader-step__label">{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
