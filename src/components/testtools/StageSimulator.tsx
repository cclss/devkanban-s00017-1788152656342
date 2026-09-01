/**
 * Test-tool: stage forcing + conflict simulation (Design §Test-tools panel).
 *
 * Two groups of controls that let a tester shake the state machine by hand:
 *
 * - **Force stage transition**: one button per {@link Stage}. Pressing one asks
 *   the host to drive the machine to that stage (the host walks the legal edges —
 *   see {@link module:components/testtools/stage-path}); the button of the current
 *   stage is marked active so the tester can see where the flow sits.
 * - **Conflict simulation**: No conflict / Analysis already in progress. This
 *   flips the host's start behaviour so a "start diagnosis" press surfaces the
 *   in-progress conflict block (Design §Conflict rules) without the tester having
 *   to race a real run.
 *
 * The component is presentational: it owns no flow state, reads the current stage
 * and conflict mode, and reports intents up. All copy is co-located English.
 *
 * Boundary: presentational component. It imports only the `Stage` type from the
 * state layer.
 */
import type { Stage } from '../../state/stage'
import InfoTooltip from '../InfoTooltip'
import { CONTROL_HELP } from '../control-help'

/** How the host's start action should behave, toggled by the conflict group. */
export type ConflictMode = 'none' | 'in-progress'

/** A forceable stage with its button label, in flow order. */
export interface StageChoice {
  stage: Stage
  label: string
}

/**
 * Every stage the simulator can force, labelled. Exported so tests assert against
 * the single source of the copy.
 */
export const STAGE_CHOICES: readonly StageChoice[] = [
  { stage: 'idle', label: 'Idle' },
  { stage: 'load', label: 'Load' },
  { stage: 'audit', label: 'Audit' },
  { stage: 'ai', label: 'AI evaluation' },
  { stage: 'done', label: 'Done (normal)' },
  { stage: 'done-partial', label: 'Done (AI failed · partial result)' },
  { stage: 'error-load', label: 'Error (load failed)' },
] as const

/** Conflict-mode choices with their labels. */
export const CONFLICT_CHOICES: readonly { mode: ConflictMode; label: string }[] = [
  { mode: 'none', label: 'No conflict' },
  { mode: 'in-progress', label: 'Analysis already in progress' },
] as const

/** User-facing copy for the simulator. Exported for tests. */
export const STAGE_SIMULATOR_STRINGS = {
  stageHeading: 'Force stage transition',
  conflictHeading: 'Conflict simulation',
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
