/**
 * The analysis pipeline runner behind `POST /api/analyze`.
 *
 * {@link runAnalysis} sequences the four separated stages —
 * `load → audit → ai → done` — and yields one {@link StageEvent} at every
 * transition, so the caller can stream them as NDJSON and the browser can drive
 * the progress stepper live. It is an async generator: the HTTP layer just
 * `for await`s it and writes {@link serializeEvent} for each yield.
 *
 * Routing (Design §state-transition rules):
 * - `load` failure (SSRF block / timeout / network / non-2xx) → a terminal
 *   `error-load` stage event + a {@link LoadErrorReport}; the audit and AI
 *   stages never run.
 * - `ai` failure (missing/invalid key, rate limit, parse failure) →
 *   `done-partial`: the report completes on the 60-point auto-audit scale only,
 *   with `llmAxes: null`, a held (`pending`) grade, and a `partialReason`.
 * - Both succeed → `done`: the full 100-point report (auto-audit + AI rubric).
 *
 * Every external boundary (SSRF DNS resolver, fetch, AI evaluator, clock) is
 * injected, so the whole happy-path event order and both failure branches are
 * unit-testable with mocked fetch and no real network — per the grain Done-when.
 *
 * Boundary: standalone backend orchestrator composing the load / audit / ai
 * stages, the `analysis-copy` messages, the `stage-events` contract, and
 * `core/report` types. It holds no state and performs no I/O of its own.
 */
import {
  AUDIT_MAX_SCORE,
  LLM_MAX_SCORE,
  TOTAL_MAX_SCORE,
  type AnalysisReport,
  type Grade,
  type ReportResult,
  type Screenshot,
} from '../core/report'
import { aiFailureDetail, partialReasonMessage } from './analysis-copy'
import { runLoad, type LoadStageOptions } from './load-stage'
import { runAudit, type AuditResult } from './audit-stage'
import {
  runAi,
  type AiEvaluation,
  type AiEvaluator,
} from './ai-stage'
import { createRoutingAiEvaluator } from './ai-router'
import {
  resultEvent,
  serializeEvent,
  stageEvent,
  type StageEvent,
} from './stage-events'

/** A request to analyze one landing page. */
export interface AnalysisRequest {
  /** The target landing-page URL. */
  url: string
  /** User-supplied API key for the AI rubric (absent → partial result). */
  apiKey?: string
  /** Selected provider id (e.g. `anthropic`). */
  provider?: string
  /** Selected model id (e.g. `claude-sonnet-5`). */
  model?: string
  /**
   * Optional Anthropic workspace id for an identity-linked key. Threaded to the
   * Claude evaluator's `anthropic-workspace-id` header; never logged or put in
   * the URL. Absent → unchanged behaviour.
   */
  workspaceId?: string
}

/** Injectable dependencies for {@link runAnalysis} (all with sane defaults). */
export interface AnalysisDeps {
  /** Load-stage options: fetch impl, SSRF guard options, timeout. */
  load?: LoadStageOptions
  /**
   * AI evaluator boundary. Defaults to {@link DEFAULT_AI_EVALUATOR}, the real
   * Claude rubric evaluator, which builds a client from the request's API key
   * per call. Tests inject a stub to stay network-free.
   */
  evaluateAi?: AiEvaluator
  /** Clock for `analyzedAt`. Defaults to `() => new Date()`. */
  now?: () => Date
}

/**
 * The default AI evaluator wired into every `/api/analyze` run: the real,
 * provider-routing rubric evaluator. It dispatches on the request's `provider`
 * (Anthropic Claude or OpenAI GPT), constructing the vendor client from the
 * per-request API key inside each call (the key never leaves that call), so a
 * single shared instance is safe. An absent/invalid key or any provider/parse
 * failure degrades the run to `done-partial` via the standard AI-failure path.
 */
export const DEFAULT_AI_EVALUATOR: AiEvaluator = createRoutingAiEvaluator()

/**
 * 100-point grade cuts. The AI-rubric and auto-audit scores combine onto a
 * single 0–100 scale; these thresholds map that to the four grade tiers. A
 * `done-partial` report never uses these — its grade is held (`pending`) because
 * the 60-point-only score must not be judged on a 100-point curve.
 */
export const GRADE_CUTS: ReadonlyArray<{ min: number; grade: Grade }> = [
  { min: 90, grade: 'excellent' },
  { min: 70, grade: 'good' },
  { min: 50, grade: 'fair' },
  { min: 0, grade: 'poor' },
] as const

/** The grade tier for a 100-scale `total` (see {@link GRADE_CUTS}). */
export function gradeForTotal(total: number): Grade {
  for (const cut of GRADE_CUTS) {
    if (total >= cut.min) return cut.grade
  }
  return 'poor'
}

/** Builds the full `done` report from a successful audit + AI evaluation. */
function buildDoneReport(
  url: string,
  analyzedAt: string,
  audit: AuditResult,
  ai: Extract<AiEvaluation, { ok: true }>,
  screenshots: Screenshot[],
): AnalysisReport {
  const total = audit.auditScore + ai.llmScore
  const report: AnalysisReport = {
    outcome: 'done',
    url,
    analyzedAt,
    score: {
      total,
      max: TOTAL_MAX_SCORE,
      grade: gradeForTotal(total),
      auditScore: audit.auditScore,
      auditMax: AUDIT_MAX_SCORE,
      llmScore: ai.llmScore,
      llmMax: LLM_MAX_SCORE,
    },
    categories: audit.categories,
    llmAxes: ai.axes,
    screenshots,
  }
  // The AI step evaluated on text alone because the model can't take images:
  // mark the report so the UI / markdown show the "evaluated without
  // screenshots" notice.
  if (ai.screenshotsOmitted) report.screenshotsOmitted = true
  return report
}

/** Builds the `done-partial` report from the audit alone when the AI step failed. */
function buildPartialReport(
  url: string,
  analyzedAt: string,
  audit: AuditResult,
  ai: Extract<AiEvaluation, { ok: false }>,
  screenshots: Screenshot[],
): AnalysisReport {
  const report: AnalysisReport = {
    outcome: 'done-partial',
    url,
    analyzedAt,
    score: {
      total: audit.auditScore,
      max: AUDIT_MAX_SCORE,
      grade: 'pending',
      auditScore: audit.auditScore,
      auditMax: AUDIT_MAX_SCORE,
      llmScore: null,
      llmMax: LLM_MAX_SCORE,
    },
    categories: audit.categories,
    llmAxes: null,
    screenshots,
    partialReason: partialReasonMessage(ai.reason),
    partialDetail: aiFailureDetail(ai.reason),
  }
  // Thread the provider status code and key-masked error summary (already
  // redacted by the evaluator) onto the report so the UI, markdown export, and
  // server log can surface the real cause without ever exposing the API key.
  if (ai.statusCode !== undefined) report.partialStatusCode = ai.statusCode
  if (ai.summary !== undefined && ai.summary !== '') report.partialSummary = ai.summary
  return report
}

/**
 * Runs one analysis, yielding {@link StageEvent}s in transition order:
 * `load` → (`audit` → `ai` → `done` | `done-partial`) | `error-load`, each
 * followed by exactly one terminal `result` event carrying the report.
 */
export async function* runAnalysis(
  request: AnalysisRequest,
  deps: AnalysisDeps = {},
): AsyncGenerator<StageEvent, void, void> {
  const now = deps.now ?? (() => new Date())
  const evaluateAi = deps.evaluateAi ?? DEFAULT_AI_EVALUATOR

  // Stage 1 — load (the only terminal-failure stage).
  yield stageEvent('load')
  const load = await runLoad(request.url, deps.load)
  if (!load.ok) {
    yield stageEvent('error-load')
    yield resultEvent(load.report)
    return
  }

  // Any captured renderings ride from load → AI evaluator (as image blocks) and
  // the finished report. Baseline load is text-only, so this is normally empty.
  const screenshots = load.screenshots ?? []

  // Stage 2 — audit (minimal real HTML checks).
  yield stageEvent('audit')
  const audit = runAudit(load.html, request.url)

  // Stage 3 — ai (key-gated; failure routes to partial).
  yield stageEvent('ai')
  const ai = await runAi(
    {
      url: request.url,
      html: load.html,
      apiKey: request.apiKey,
      provider: request.provider,
      model: request.model,
      workspaceId: request.workspaceId,
      screenshots,
    },
    evaluateAi,
  )

  // Stage 4 — done / done-partial.
  const analyzedAt = now().toISOString()
  const report: ReportResult = ai.ok
    ? buildDoneReport(request.url, analyzedAt, audit, ai, screenshots)
    : buildPartialReport(request.url, analyzedAt, audit, ai, screenshots)

  yield stageEvent(report.outcome)
  yield resultEvent(report)
}

/**
 * Convenience wrapper: runs {@link runAnalysis} and pushes each event as a
 * serialised NDJSON line via `write`. The HTTP handler passes a function that
 * writes to the response stream; tests pass a collector.
 */
export async function streamAnalysis(
  request: AnalysisRequest,
  write: (line: string) => void,
  deps: AnalysisDeps = {},
): Promise<void> {
  for await (const event of runAnalysis(request, deps)) {
    write(serializeEvent(event))
  }
}
