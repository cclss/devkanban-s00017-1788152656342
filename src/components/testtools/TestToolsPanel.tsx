/**
 * The test-tools panel that sits above the three grader blocks (Design §테스트
 * 도구 패널). It is a collapsible `<details>` region — mockup scaffolding, not a
 * real product surface — that gathers the API-key tool and the stage/conflict
 * simulator in one place so a tester can wire and shake the UI by hand.
 *
 * It owns no flow state: it renders {@link ApiKeyPanel} (self-contained) and
 * passes the stage/conflict props straight through to {@link StageSimulator}.
 *
 * Boundary: presentational container.
 */
import ApiKeyPanel from './ApiKeyPanel'
import StageSimulator, { type ConflictMode } from './StageSimulator'
import type { Stage } from '../../state/stage'

/** Korean, user-facing copy for the panel shell. Exported for tests. */
export const TEST_TOOLS_PANEL_STRINGS = {
  title: '테스트 도구',
  note: '실제 제품 화면에는 없는, 이 화면을 검증하기 위한 도구입니다.',
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
        <ApiKeyPanel />
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
