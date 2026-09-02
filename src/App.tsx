/**
 * Landing-page grader shell.
 *
 * Assembles the whole screen: the test-tools panel on top, then the real grader
 * blocks stacked vertically — {@link ApiKeyPanel} → {@link UrlForm} →
 * {@link ProgressStepper} → {@link ReportView}. The stage-driven blocks each read
 * one value, the {@link useStage} `Stage`
 * SSoT (mirrored to `body[data-stage]`), so they can never drift apart; this
 * component only holds that one hook plus the conflict-simulation toggle and
 * wires the pieces together.
 *
 * Wiring rules (Design §state-transition rules):
 * - "Start diagnosis" runs a real `/api/analyze` stream via {@link useAnalyze}: it
 *   POSTs the URL + the saved API-key credentials (read from the localStorage the
 *   {@link ApiKeyPanel} Save button persists) and drives the stepper live off the
 *   NDJSON stage events, storing the terminal
 *   report. While the conflict simulator is set to "analysis already in progress"
 *   the start is refused with a `conflict` result so the URL form shows the
 *   client-side block inline — no request is ever sent.
 * - The stage simulator drives the machine to any stage by walking the legal
 *   edges ({@link planStagePath}) one guarded transition at a time; it clears any
 *   stored real report first so the demo report shows through.
 * - The report shown is the stored real report when a run has produced one, else
 *   the stage's demo report (so the simulator still renders every outcome).
 */
import { useCallback, useState } from 'react'
import ApiKeyPanel from './components/ApiKeyPanel'
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
} from './components/api-key-storage'
import { isClaudeCodeToken } from './core/claude-code-token'
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

  // "Start diagnosis": run a real analysis for `url`, pulling the API-key
  // credentials from localStorage (persisted by the ApiKeyPanel Save button).
  // When the conflict simulator is armed, refuse with a conflict so the URL form
  // surfaces the client-side "analysis already in progress" block and no request
  // is sent.
  const handleStart = useCallback(
    (url: string): StartResult => {
      const apiKey = storedCredential(API_KEY_STORAGE_KEYS.apiKey)
      // Pre-block a Claude Code CLI token (`sk-ant-oat…`) before any request:
      // the Messages API only ever answers it with a 401, so short-circuit and
      // surface the dedicated guidance instead of spending a round trip.
      if (apiKey !== undefined && isClaudeCodeToken(apiKey)) {
        return { stage, started: false, conflict: false, claudeCodeToken: true }
      }
      if (conflictMode === 'in-progress') {
        return { stage, started: false, conflict: true }
      }
      return start({
        url,
        apiKey,
        provider: storedCredential(API_KEY_STORAGE_KEYS.provider),
        model: storedCredential(API_KEY_STORAGE_KEYS.model),
        workspaceId: storedCredential(API_KEY_STORAGE_KEYS.workspaceId),
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
      <ApiKeyPanel />
      <UrlForm stage={stage} onStart={handleStart} onReset={reset} />
      <ProgressStepper stage={stage} />
      <ReportView report={report} />
    </div>
  )
}
