/**
 * Test-tool: stage forcing + conflict simulation (Design §테스트 도구 패널).
 *
 * Two groups of controls that let a tester shake the state machine by hand:
 *
 * - **진행 단계 강제 전이**: one button per {@link Stage}. Pressing one asks the
 *   host to drive the machine to that stage (the host walks the legal edges — see
 *   {@link module:components/testtools/stage-path}); the button of the current
 *   stage is marked active so the tester can see where the flow sits.
 * - **충돌 시뮬레이션**: 충돌 없음 / 이미 분석 진행 중. This flips the host's
 *   start behaviour so a "진단 시작" press surfaces the in-progress conflict block
 *   (Design §충돌 규칙) without the tester having to race a real run.
 *
 * The component is presentational: it owns no flow state, reads the current stage
 * and conflict mode, and reports intents up. All copy is co-located Korean.
 *
 * Boundary: presentational component. It imports only the `Stage` type from the
 * state layer.
 */
import type { Stage } from '../../state/stage'
import InfoTooltip from '../InfoTooltip'
import { CONTROL_HELP } from '../control-help'

/** How the host's start action should behave, toggled by the conflict group. */
export type ConflictMode = 'none' | 'in-progress'

/** A forceable stage with its Korean button label, in flow order. */
export interface StageChoice {
  stage: Stage
  label: string
}

/**
 * Every stage the simulator can force, labelled. Exported so tests assert against
 * the single source of the copy.
 */
export const STAGE_CHOICES: readonly StageChoice[] = [
  { stage: 'idle', label: '대기' },
  { stage: 'load', label: '로드' },
  { stage: 'audit', label: '감사' },
  { stage: 'ai', label: 'AI 평가' },
  { stage: 'done', label: '완료(정상)' },
  { stage: 'done-partial', label: '완료(AI 실패·부분결과)' },
  { stage: 'error-load', label: '에러(로드 실패)' },
] as const

/** Conflict-mode choices with their Korean labels. */
export const CONFLICT_CHOICES: readonly { mode: ConflictMode; label: string }[] = [
  { mode: 'none', label: '충돌 없음' },
  { mode: 'in-progress', label: '이미 분석 진행 중' },
] as const

/** Korean, user-facing copy for the simulator. Exported for tests. */
export const STAGE_SIMULATOR_STRINGS = {
  stageHeading: '진행 단계 강제 전이',
  conflictHeading: '충돌 시뮬레이션',
} as const

export interface StageSimulatorProps {
  /** Current flow stage — the single source of truth this view reflects. */
  stage: Stage
  /** Requests the machine be driven to `target` (host walks the legal edges). */
  onForceStage: (target: Stage) => void
  /** Current conflict-simulation mode. */
  conflictMode: ConflictMode
  /** Requests a change of conflict-simulation mode. */
  onConflictModeChange: (mode: ConflictMode) => void
}

export default function StageSimulator({
  stage,
  onForceStage,
  conflictMode,
  onConflictModeChange,
}: StageSimulatorProps) {
  return (
    <section className="testtools__group" aria-label={STAGE_SIMULATOR_STRINGS.stageHeading}>
      <div className="control-help">
        <h3 className="testtools__group-title">
          {STAGE_SIMULATOR_STRINGS.stageHeading}
        </h3>
        <InfoTooltip entry={CONTROL_HELP.forceStage} />
      </div>
      <div className="testtools__buttons" role="group" aria-label={STAGE_SIMULATOR_STRINGS.stageHeading}>
        {STAGE_CHOICES.map((choice) => {
          const active = choice.stage === stage
          return (
            <button
              key={choice.stage}
              type="button"
              className={`btn testtools__btn${active ? ' is-active' : ''}`}
              aria-pressed={active}
              data-stage-target={choice.stage}
              onClick={() => onForceStage(choice.stage)}
            >
              {choice.label}
            </button>
          )
        })}
      </div>

      <div className="control-help">
        <h3 className="testtools__group-title">
          {STAGE_SIMULATOR_STRINGS.conflictHeading}
        </h3>
        <InfoTooltip entry={CONTROL_HELP.conflictSim} />
      </div>
      <div className="testtools__buttons" role="group" aria-label={STAGE_SIMULATOR_STRINGS.conflictHeading}>
        {CONFLICT_CHOICES.map((choice) => {
          const active = choice.mode === conflictMode
          return (
            <button
              key={choice.mode}
              type="button"
              className={`btn testtools__btn${active ? ' is-active' : ''}`}
              aria-pressed={active}
              data-conflict-mode={choice.mode}
              onClick={() => onConflictModeChange(choice.mode)}
            >
              {choice.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
