/**
 * Landing-page grader shell.
 *
 * Assembles the whole screen: the test-tools panel on top, then the three grader
 * blocks stacked vertically — {@link UrlForm} → {@link ProgressStepper} →
 * {@link ReportView}. Every block reads one value, the {@link useStage} `Stage`
 * SSoT (mirrored to `body[data-stage]`), so they can never drift apart; this
 * component only holds that one hook plus the conflict-simulation toggle and
 * wires the pieces together.
 *
 * Wiring rules (Design §상태 전이 규칙):
 * - "진단 시작" starts a run from `idle`/terminal via the stage machine; while the
 *   conflict simulator is set to "이미 분석 진행 중" the start is refused with a
 *   `conflict` result so the URL form shows the client-side block inline — no
 *   request is ever sent (there is no real request in this grain anyway).
 * - The stage simulator drives the machine to any stage by walking the legal
 *   edges ({@link planStagePath}) one guarded transition at a time.
 * - The report shown is derived purely from the stage: terminal stages resolve to
 *   the matching demo report, every other stage to `null` (nothing rendered).
 *
 * Out of scope for this grain: any real `/api/analyze` call. The flow is exercised
 * entirely through the test-tools simulator.
 */
import { useCallback, useState } from 'react'
import UrlForm from './components/UrlForm'
import ProgressStepper from './components/ProgressStepper'
import ReportView from './components/ReportView'
import TestToolsPanel from './components/testtools/TestToolsPanel'
import type { ConflictMode } from './components/testtools/StageSimulator'
import { planStagePath } from './components/testtools/stage-path'
import { demoReportFor } from './components/testtools/demo-reports'
import { useStage } from './state/useStage'
import type { Stage, StartResult } from './state/stage'
import './styles/App.css'

export default function App() {
  const { stage, start, reset, transitionTo } = useStage()
  const [conflictMode, setConflictMode] = useState<ConflictMode>('none')

  // "진단 시작": normally hand off to the stage machine. When the conflict
  // simulator is armed, refuse with a conflict so the URL form surfaces the
  // client-side "이미 분석 진행 중" block — mirroring a real in-progress refusal.
  const handleStart = useCallback((): StartResult => {
    if (conflictMode === 'in-progress') {
      return { stage, started: false, conflict: true }
    }
    return start()
  }, [conflictMode, stage, start])

  // Force the machine to `target` by walking the shortest sequence of legal
  // edges from the current stage. Each guarded `transitionTo` is a functional
  // update, so the sequence compounds to land exactly on `target`.
  const forceStage = useCallback(
    (target: Stage) => {
      for (const next of planStagePath(stage, target)) {
        transitionTo(next)
      }
    },
    [stage, transitionTo],
  )

  // The report is a pure function of the stage — no separate report state to keep
  // in sync. Terminal stages resolve to their demo report; all others to null.
  const report = demoReportFor(stage)

  return (
    <div className="grader-layout">
      <TestToolsPanel
        stage={stage}
        onForceStage={forceStage}
        conflictMode={conflictMode}
        onConflictModeChange={setConflictMode}
      />
      <UrlForm stage={stage} onStart={handleStart} onReset={reset} />
      <ProgressStepper stage={stage} />
      <ReportView report={report} />
    </div>
  )
}
