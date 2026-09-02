/**
 * Core domain types for the landing-page quality report.
 *
 * This layer is intentionally React-independent and holds *no* scoring logic:
 * it is pure data shapes describing a finished (or failed) analysis, so the
 * report view, the markdown exporter, and the fixtures can all agree on one
 * contract. The actual grading pipeline (how a page earns points) and the
 * markdown rendering live in later grains — this module only says what a
 * completed result *looks like*.
 *
 * Scoring model (fixed by the Story spec):
 * - Auto-audit: 60 points across 5 categories (SEO / performance / mobile /
 *   security / accessibility), each category a list of checks.
 * - AI rubric: 40 points across 3 axes (visual / copy / CTA).
 * - Total: 100 points on the happy path (`done`). When the AI step fails the
 *   report still completes as `done-partial` on the 60-point auto-audit scale
 *   only, with the grade held (`pending`) rather than re-cut onto 100.
 *
 * A `load` failure produces no report at all: {@link LoadErrorReport} carries an
 * English message (and an optional status code) instead of any scores.
 */

/**
 * Terminal outcome of one analysis, matching the grader `Stage` terminals:
 * - `done`: full 100-point report (auto-audit + AI rubric).
 * - `done-partial`: AI step failed; auto-audit-only 60-point report.
 * - `error-load`: page never loaded (timeout / SSRF block / bad URL); no report.
 */
export type ReportOutcome = 'done' | 'done-partial' | 'error-load'

/**
 * Result of a single audit check.
 * - `pass`: the check succeeded.
 * - `warn`: a non-blocking issue worth improving.
 * - `fail`: a real problem that costs points.
 * - `skip`: not applicable to this page (normalized out of the denominator).
 */
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

/**
 * Overall quality grade. `excellent` / `good` / `fair` / `poor` are the 100-point
 * grade cuts; `pending` ("Grade withheld") is used for `done-partial`, where the
 * 100-point cuts are deliberately *not* applied to the 60-point-only score.
 * Values mirror the `--color-grade-*` tokens registered in the design spec.
 */
export type Grade = 'excellent' | 'good' | 'fair' | 'poor' | 'pending'

/** The five auto-audit categories that make up the 60-point auto score. */
export type AuditCategoryId =
  | 'seo'
  | 'performance'
  | 'mobile'
  | 'security'
  | 'accessibility'

/** The three AI-rubric axes that make up the 40-point AI score. */
export type LlmAxisId = 'visual' | 'copy' | 'cta'

/** Which rendering the screenshot was captured at. */
export type ViewportKind = 'desktop' | 'mobile'

/**
 * One audit check within a category.
 *
 * `tip` is the English improvement hint shown for actionable results; it is
 * optional because a clean `pass` or an inapplicable `skip` has nothing to fix.
 */
export interface CheckItem {
  /** Stable id within the check registry (e.g. `seo-title`). */
  id: string
  /** English label of what was checked. */
  label: string
  /** Outcome of the check. */
  status: CheckStatus
  /** English one-line explanation of the result. */
  message: string
  /** English improvement tip; present for `warn` / `fail`, usually absent otherwise. */
  tip?: string
}

/**
 * One auto-audit category and its checks. `score` is out of `maxScore`; `skip`
 * checks are expected to be excluded from how the category was scored, but this
 * type only records the resulting numbers — it does not compute them.
 */
export interface AuditCategory {
  /** Category discriminant. */
  id: AuditCategoryId
  /** English display label (e.g. `Performance`). */
  label: string
  /** Points earned in this category. */
  score: number
  /** Maximum points this category can contribute. */
  maxScore: number
  /** The individual checks that make up this category. */
  checks: CheckItem[]
}

/**
 * One AI-rubric axis: a 0–`maxScore` score plus the model's qualitative
 * feedback. Present only on a `done` report; a `done-partial` report has no
 * axes (see {@link AnalysisReport.llmAxes}).
 */
export interface LlmAxis {
  /** Axis discriminant. */
  id: LlmAxisId
  /** English display label (e.g. `Visual`). */
  label: string
  /** Points the AI awarded on this axis. */
  score: number
  /** Maximum points this axis can contribute. */
  maxScore: number
  /** English overall comment for this axis. */
  comment: string
  /** English, concrete improvement suggestions. */
  suggestions: string[]
}

/**
 * A captured rendering of the page. `dataUrl` is a self-contained image source
 * (data URI) so the report is portable and needs no extra network fetch.
 */
export interface Screenshot {
  /** Desktop or mobile capture. */
  viewport: ViewportKind
  /** `data:` image URL of the capture. */
  dataUrl: string
  /** Intrinsic pixel width. */
  width: number
  /** Intrinsic pixel height. */
  height: number
}

/**
 * The composed score block for a completed report.
 *
 * On `done`, `total`/`max` are on the 100-point scale and `llmScore`/`llmMax`
 * are numbers. On `done-partial`, `total`/`max` collapse to the 60-point
 * auto-audit scale, `llmScore` is `null`, and `grade` is `pending`.
 */
export interface ReportScore {
  /** Total points earned on the reported scale. */
  total: number
  /** Maximum of the reported scale (100 for `done`, 60 for `done-partial`). */
  max: number
  /** Derived grade; `pending` when the AI step failed. */
  grade: Grade
  /** Auto-audit points earned (out of {@link auditMax}). */
  auditScore: number
  /** Auto-audit maximum (60). */
  auditMax: number
  /** AI-rubric points earned, or `null` when the AI step failed. */
  llmScore: number | null
  /** AI-rubric maximum (40). */
  llmMax: number
}

/**
 * A completed analysis report — either the full `done` result or the
 * auto-audit-only `done-partial` result.
 *
 * On `done-partial`, `llmAxes` is `null` and `partialReason` explains (in
 * English) why the AI evaluation was dropped, so the UI can replace the AI cards
 * with a notice instead of scores. `partialDetail` carries the longer, actionable
 * English explanation of that reason, surfaced behind a "View details" disclosure so
 * a user can see *why* the AI step failed and what to do about it.
 */
export interface AnalysisReport {
  /** `done` (full) or `done-partial` (auto-audit only). */
  outcome: 'done' | 'done-partial'
  /** The analyzed page URL. */
  url: string
  /** ISO-8601 timestamp of when the analysis completed. */
  analyzedAt: string
  /** Composed score block. */
  score: ReportScore
  /** The five auto-audit categories. */
  categories: AuditCategory[]
  /** The three AI axes on `done`; `null` on `done-partial`. */
  llmAxes: LlmAxis[] | null
  /** Desktop / mobile captures. */
  screenshots: Screenshot[]
  /** English reason the AI step was dropped; present only on `done-partial`. */
  partialReason?: string
  /**
   * English, actionable detail explaining the partial-result cause (what failed
   * and how to fix it). Present only on `done-partial`; shown behind a "View
   * details" disclosure so the terse `partialReason` stays scannable.
   */
  partialDetail?: string
  /**
   * The provider HTTP status code behind the partial result, when the AI failure
   * carried one (e.g. 401, 404, 429, 500). Present only on `done-partial`, and
   * only for failures that came from an HTTP response — absent for transport
   * errors, the parse failure, and the no-key skip. Surfaced in the "View failure
   * details" disclosure and the markdown export. Never carries the API key.
   */
  partialStatusCode?: number
  /**
   * A short, **key-masked** summary of the provider error (status + message)
   * behind the partial result. Present only on `done-partial` when the failure
   * carried one. It is produced by `maskApiKey`, so the raw API key can never
   * appear here; shown in the "View failure details" disclosure and the markdown
   * export so an operator can diagnose the real cause.
   */
  partialSummary?: string
  /**
   * `true` when the AI evaluation deliberately skipped the captured screenshots
   * because the selected model was judged non-vision-capable, and scored on the
   * page text alone. Present only on a `done` report (the AI step still
   * succeeded); the UI and markdown show an "evaluated without screenshots"
   * notice so the reader knows the AI score is text-only. Absent when the
   * screenshots were sent (or there were none).
   */
  screenshotsOmitted?: boolean
}

/**
 * A `load`-stage failure. No scores are produced; the UI hides the whole report
 * and shows only this English message (with `statusCode` appended when present).
 */
export interface LoadErrorReport {
  /** Discriminant. */
  outcome: 'error-load'
  /** The URL that failed to load. */
  url: string
  /** English, user-facing error message. */
  message: string
  /** HTTP-style status code when one is available. */
  statusCode?: number
  /**
   * English, actionable detail explaining the load failure (what went wrong and
   * how to fix it), surfaced behind a "View details" disclosure so the terse
   * `message` stays scannable. Absent on synthetic client-side failures that
   * carry only the shared message.
   */
  detail?: string
}

/**
 * The full space of terminal report states, discriminated by `outcome`. This is
 * what a terminal grader `Stage` maps onto: `done` / `done-partial` →
 * {@link AnalysisReport}, `error-load` → {@link LoadErrorReport}.
 */
export type ReportResult = AnalysisReport | LoadErrorReport

/** Canonical order of the auto-audit categories, as shown in the report. */
export const AUDIT_CATEGORY_IDS: readonly AuditCategoryId[] = [
  'seo',
  'performance',
  'mobile',
  'security',
  'accessibility',
] as const

/** English display labels for each auto-audit category. */
export const AUDIT_CATEGORY_LABELS: Readonly<Record<AuditCategoryId, string>> = {
  seo: 'SEO',
  performance: 'Performance',
  mobile: 'Mobile',
  security: 'Security',
  accessibility: 'Accessibility',
} as const

/** Canonical order of the AI-rubric axes, as shown in the report. */
export const LLM_AXIS_IDS: readonly LlmAxisId[] = ['visual', 'copy', 'cta'] as const

/** English display labels for each AI-rubric axis. */
export const LLM_AXIS_LABELS: Readonly<Record<LlmAxisId, string>> = {
  visual: 'Visual',
  copy: 'Copy',
  cta: 'CTA',
} as const

/**
 * Per-axis maximum points. The three axes split the 40-point AI rubric as
 * visual 16 / copy 14 / cta 10 (summing to {@link LLM_MAX_SCORE}). This mirrors
 * the distribution already used by the confirmed report fixtures, so the real
 * evaluator scores each axis on the same ceiling the report view renders.
 */
export const LLM_AXIS_MAX_SCORES: Readonly<Record<LlmAxisId, number>> = {
  visual: 16,
  copy: 14,
  cta: 10,
} as const

/** Auto-audit maximum (points contributed by the 5 categories combined). */
export const AUDIT_MAX_SCORE = 60

/** AI-rubric maximum (points contributed by the 3 axes combined). */
export const LLM_MAX_SCORE = 40

/** Full report maximum on the happy path (`AUDIT_MAX_SCORE + LLM_MAX_SCORE`). */
export const TOTAL_MAX_SCORE = 100
