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
 * - "진단 시작" runs a real `/api/analyze` stream via {@link useAnalyze}: it POSTs
 *   the URL + the API-key credentials (read from the test-tools localStorage) and
 *   drives the stepper live off the NDJSON stage events, storing the terminal
 *   report. While the conflict simulator is set to "이미 분석 진행 중" the start is
 *   refused with a `conflict` result so the URL form shows the client-side block
 *   inline — no request is ever sent.
 * - The stage simulator drives the machine to any stage by walking the legal
 *   edges ({@link planStagePath}) one guarded transition at a time; it clears any
 *   stored real report first so the demo report shows through.
 * - The report shown is the stored real report when a run has produced one, else
 *   the stage's demo report (so the simulator still renders every outcome).
 */
import { useCallback, useState } from 'react'
import UrlForm from './components/UrlForm'
import ProgressStepper from './components/ProgressStepper'
import ReportView from './components/ReportView'
import TestToolsPanel from './components/testtools/TestToolsPanel'
import type { ConflictMode } from './components/testtools/StageSimulator'
import { planStagePath } from './components/testtools/stage-path'
import { demoReportFor } from './components/testtools/demo-reports'
import {
  API_KEY_STORAGE_KEYS,
  readStored,
} from './components/testtools/api-key-storage'
import { useAnalyze } from './state/useAnalyze'
import type { Stage, StartResult } from './state/stage'
import './styles/App.css'

/** Reads a stored credential, mapping the absent/blank case to `undefined`. */
function storedCredential(key: string): string | undefined {
  const value = readStored(key)
  return value !== null && value !== '' ? value : undefined
}

export default function App() {
  const { stage, report: liveReport, start, reset, transitionTo, clearReport } =
    useAnalyze()
  const [conflictMode, setConflictMode] = useState<ConflictMode>('none')

  // "진단 시작": run a real analysis for `url`, pulling the API-key credentials
  // from the test-tools localStorage (the MVP's key entry surface). When the
  // conflict simulator is armed, refuse with a conflict so the URL form surfaces
  // the client-side "이미 분석 진행 중" block and no request is sent.
  const handleStart = useCallback(
    (url: string): StartResult => {
      if (conflictMode === 'in-progress') {
        return { stage, started: false, conflict: true }
      }
      return start({
        url,
        apiKey: storedCredential(API_KEY_STORAGE_KEYS.apiKey),
        provider: storedCredential(API_KEY_STORAGE_KEYS.provider),
        model: storedCredential(API_KEY_STORAGE_KEYS.model),
      })
    },
    [conflictMode, stage, start],
  )

  // Force the machine to `target` by walking the shortest sequence of legal
  // edges from the current stage. Clear any stored real report first so the
  // simulator's demo report — not a leftover live one — renders at the target.
  const forceStage = useCallback(
    (target: Stage) => {
      clearReport()
      for (const next of planStagePath(stage, target)) {
        transitionTo(next)
      }
    },
    [stage, transitionTo, clearReport],
  )

  // Prefer the stored real report; fall back to the stage's demo report so the
  // test-tools simulator still renders each terminal outcome.
  const report = liveReport ?? demoReportFor(stage)

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
