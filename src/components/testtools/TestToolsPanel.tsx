/**
 * The test-tools panel that sits above the three grader blocks (Design
 * §Test-tools panel). It is a collapsible `<details>` region — mockup scaffolding, not a
 * real product surface — that holds the stage/conflict simulator so a tester can
 * shake the UI's state machine by hand. (The API-key entry moved out to a real
 * product block; only the simulator remains here.)
 *
 * It owns no flow state: it passes the stage/conflict props straight through to
 * {@link StageSimulator}.
 *
 * Boundary: presentational container.
 */
import StageSimulator, { type ConflictMode } from './StageSimulator'
import type { Stage } from '../../state/stage'

/** User-facing copy for the panel shell. Exported for tests. */
export const TEST_TOOLS_PANEL_STRINGS = {
  title: 'Test tools',
  note: 'A tool for verifying this screen; it does not exist on the real product screen.',
} as const

export interface TestToolsPanelProps {
  /** Current flow stage, forwarded to the simulator. */
  stage: Stage
  /** Requests the machine be driven to `target`. */
  onForceStage: (target: Stage) => void
  /** Current conflict-simulation mode. */
  conflictMode: ConflictMode
  /** Requests a change of conflict-simulation mode. */
  onConflictModeChange: (mode: ConflictMode) => void
}

export default function TestToolsPanel({
  stage,
  onForceStage,
  conflictMode,
  onConflictModeChange,
}: TestToolsPanelProps) {
  return (
    <details className="testtools grader-card grader-card--muted" open>
      <summary className="testtools__summary">
        {TEST_TOOLS_PANEL_STRINGS.title}
      </summary>
      <p className="testtools__note">{TEST_TOOLS_PANEL_STRINGS.note}</p>
      <div className="testtools__groups">
        <StageSimulator
          stage={stage}
          onForceStage={onForceStage}
          conflictMode={conflictMode}
          onConflictModeChange={onConflictModeChange}
        />
      </div>
    </details>
  )
}
