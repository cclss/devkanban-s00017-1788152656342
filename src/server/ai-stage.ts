/**
 * The `ai` stage: the AI-rubric evaluation boundary and its partial-result gate.
 *
 * This module owns the *contract and routing* of the AI step. The stage takes an
 * {@link AiEvaluator} — an injected boundary that, given the page text and an API
 * key, returns either the three scored {@link LlmAxis} axes or a typed failure.
 * The pipeline turns a failure into a `done-partial` report (60-point auto-audit
 * only); a success into a full `done` report.
 *
 * The real evaluation lives elsewhere: the pipeline wires
 * `DEFAULT_AI_EVALUATOR = createRoutingAiEvaluator()`, which makes real
 * Claude/OpenAI SDK calls, so a valid API key performs a genuine evaluation — it
 * is not a mock. The {@link defaultAiEvaluator} in this module is only a minimal
 * key-gate stub (no key → `missing-key`; a key present → `invalid-key`); it is
 * *not* used by the pipeline and exists only as a trivial baseline for tests.
 * Tests inject their own evaluator to exercise both the happy path and each
 * failure branch without a network.
 *
 * Boundary: standalone backend module reusing only `core/report` types and the
 * `analysis-copy` failure-reason vocabulary. It performs no I/O itself.
 */
import {
  LLM_AXIS_IDS,
  LLM_MAX_SCORE,
  type LlmAxis,
  type Screenshot,
} from '../core/report'
import type { AiFailureReason } from './analysis-copy'

/** Input handed to an {@link AiEvaluator}. */
export interface AiEvaluatorInput {
  /** The analyzed page URL. */
  url: string
  /** The fetched page HTML (screenshot capture is out of scope this grain). */
  html: string
  /** The user-supplied API key, or empty/undefined when none was provided. */
  apiKey?: string
  /**
   * Selected AI provider id (e.g. `anthropic` | `openai`), when chosen. Used by a
   * routing evaluator to pick the backing model vendor; a single-vendor evaluator
   * ignores it.
   */
  provider?: string
  /** Selected model id (e.g. `claude-sonnet-5`, `gpt-4o`), when chosen. */
  model?: string
  /**
   * Optional Anthropic workspace id for an identity-linked key. The Claude
   * evaluator turns it into the `anthropic-workspace-id` request header; absent
   * is fine (an ordinary key needs no workspace). Other vendors ignore it.
   */
  workspaceId?: string
  /**
   * Captured page renderings, when available. The real evaluator sends these as
   * image blocks alongside the page text; absence is fine (text-only rubric).
   */
  screenshots?: Screenshot[]
}

/** A successful AI evaluation: the scored axes and their combined AI score. */
export interface AiSuccess {
  ok: true
  /** The three scored rubric axes. */
  axes: LlmAxis[]
  /** Combined AI points earned (0–{@link LLM_MAX_SCORE}). */
  llmScore: number
  /**
   * Set when the selected model was judged non-vision-capable, so the evaluator
   * deliberately skipped the screenshots and scored on the page text alone. The
   * pipeline threads this onto the `done` report (as `screenshotsOmitted`) so the
   * UI / markdown can show an "evaluated without screenshots" notice. Absent /
   * `false` on a normal evaluation that used any available screenshots.
   */
  screenshotsOmitted?: boolean
}

/** A failed AI evaluation, routing the report to `done-partial`. */
export interface AiFailure {
  ok: false
  /** Typed cause, mapped to the English `partialReason` copy by the pipeline. */
  reason: AiFailureReason
  /**
   * The provider HTTP status code, when the failure came from an HTTP response
   * (e.g. 401, 404, 429, 500). Absent for transport errors with no response and
   * for the no-key skip. Surfaced in failure details / server logs by later
   * grains — never carries the API key.
   */
  statusCode?: number
  /**
   * A short, **key-masked** summary of the provider error (status + message),
   * for the "view failure details" disclosure and server logs. It is passed
   * through {@link maskApiKey}, so the raw API key can never appear here.
   */
  summary?: string
}

/** Discriminated outcome of the AI stage. */
export type AiEvaluation = AiSuccess | AiFailure

/**
 * The AI-evaluation boundary: page text + key in, scored axes or a typed
 * failure out. Injected so the pipeline stays testable and the real model call
 * can be wired later without touching the pipeline.
 */
export type AiEvaluator = (input: AiEvaluatorInput) => Promise<AiEvaluation>

/** Whether an API key string is present (non-blank). */
export function hasApiKey(apiKey: string | undefined): boolean {
  return typeof apiKey === 'string' && apiKey.trim() !== ''
}

/** Sum of the axes' scores, clamped to the AI maximum for safety. */
export function sumAxisScores(axes: readonly LlmAxis[]): number {
  const total = axes.reduce((sum, axis) => sum + axis.score, 0)
  return Math.min(total, LLM_MAX_SCORE)
}

/**
 * Redacts API-key material from a string before it is logged or returned.
 *
 * Two layers, so no key can slip into a failure summary or a log line
 * (spec "no API key logging"):
 *  1. If the exact `apiKey` is known, every occurrence is replaced verbatim.
 *  2. As a backstop for keys the caller did not pass (e.g. a provider that
 *     echoed a differently-formatted token), anything shaped like an API key
 *     (`sk-…`, `pk-…`, `rk-…`, or a long `Bearer …` token) is redacted too.
 */
export function maskApiKey(text: string, apiKey?: string): string {
  let masked = text
  if (typeof apiKey === 'string' && apiKey.trim() !== '') {
    masked = masked.split(apiKey.trim()).join('[redacted]')
  }
  return masked
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{6,}/gi, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [redacted]')
}

/**
 * Normalised view of a thrown provider error, extracted by each evaluator from
 * its SDK exception. Both the Anthropic and OpenAI SDK errors expose a numeric
 * `status` and a `message`, so this shape is provider-agnostic.
 */
export interface ProviderErrorInfo {
  /** The provider HTTP status code, when the error carried an HTTP response. */
  status?: number
  /** The provider error message, when present. */
  message?: string
}

/** Whether a 400 message indicates the model rejected image / vision input. */
function indicatesVisionUnsupported(message: string): boolean {
  return /image|vision|multimodal/i.test(message)
}

/** Whether a message indicates the model is missing or the key has no access to it. */
function indicatesModelProblem(message: string): boolean {
  const m = message.toLowerCase()
  return (
    /model/.test(m) &&
    /(not found|does not exist|not exist|unknown|invalid|no access|not have access|access to)/.test(
      m,
    )
  )
}

/**
 * Classifies a provider error into a typed {@link AiFailureReason} by status
 * code and message — the taxonomy the whole grain turns on:
 * 401/403 → `invalid-key`, 404 / model-not-found / no-access → `model-error`,
 * 400 image-unsupported → `vision-unsupported`, other 400 → `request-error`,
 * 5xx → `provider-error`, 429 → `rate-limit`, and a timeout / networked / status-less
 * error → `ai-network`.
 */
export function classifyAiError(info: ProviderErrorInfo): AiFailureReason {
  const { status } = info
  const message = info.message ?? ''
  if (status === 429) return 'rate-limit'
  if (status === 400 && indicatesVisionUnsupported(message)) return 'vision-unsupported'
  // A model-specific message wins over a bare auth status (a 403 "no access to
  // model X" is a model problem, not a rejected key).
  if (status !== 401 && indicatesModelProblem(message)) return 'model-error'
  if (status === 404) return 'model-error'
  if (status === 401 || status === 403) return 'invalid-key'
  if (status === 400) return 'request-error'
  if (typeof status === 'number' && status >= 500) return 'provider-error'
  // No HTTP status (timeout / connection reset / unknown transport failure).
  return 'ai-network'
}

/** Truncation cap for the masked error summary carried on an {@link AiFailure}. */
const SUMMARY_MAX_LENGTH = 300

/**
 * Builds the failure fields of an {@link AiFailure} from a provider error: the
 * typed `reason`, the provider `statusCode`, and a short **key-masked** `summary`
 * (status + message). Shared by both evaluators' `mapError`. The `apiKey` is used
 * only to redact — it is never stored or returned.
 */
export function classifyProviderFailure(
  info: ProviderErrorInfo,
  apiKey?: string,
): Omit<AiFailure, 'ok'> {
  const reason = classifyAiError(info)
  const parts: string[] = []
  if (typeof info.status === 'number') parts.push(`HTTP ${info.status}`)
  if (info.message) parts.push(info.message)
  const raw = parts.join(': ')
  const summary = maskApiKey(
    raw.length > SUMMARY_MAX_LENGTH ? `${raw.slice(0, SUMMARY_MAX_LENGTH)}…` : raw,
    apiKey,
  )
  const failure: Omit<AiFailure, 'ok'> = { reason }
  if (typeof info.status === 'number') failure.statusCode = info.status
  if (summary !== '') failure.summary = summary
  return failure
}

/**
 * Extracts a {@link ProviderErrorInfo} from a thrown SDK error by duck-typing
 * its `status` / `message`. Works for both the Anthropic and OpenAI `APIError`
 * shapes (a numeric `status` and a string `message`); a plain thrown value
 * yields an empty info, which {@link classifyAiError} maps to `ai-network`.
 */
export function toProviderErrorInfo(error: unknown): ProviderErrorInfo {
  if (typeof error !== 'object' || error === null) return {}
  const e = error as { status?: unknown; message?: unknown }
  return {
    status: typeof e.status === 'number' ? e.status : undefined,
    message: typeof e.message === 'string' ? e.message : undefined,
  }
}

/**
 * Baseline key-gate stub: no key → `missing-key`; a key present → `invalid-key`.
 * It never calls a model. **This is not wired into the pipeline** — `/api/analyze`
 * uses `DEFAULT_AI_EVALUATOR = createRoutingAiEvaluator()`, the real
 * Claude/OpenAI evaluator, so a valid key performs a real evaluation. This stub
 * exists only as a trivial default for tests/callers that want no network.
 */
export const defaultAiEvaluator: AiEvaluator = async ({ apiKey }) => {
  if (!hasApiKey(apiKey)) {
    return { ok: false, reason: 'missing-key' }
  }
  return { ok: false, reason: 'invalid-key' }
}

/**
 * Runs the AI stage, delegating to `evaluate`. The evaluators already classify
 * their own provider failures (returning a typed reason plus a masked summary),
 * so a returned failure is passed through **verbatim** — its reason and metadata
 * are preserved, never flattened to `invalid-key`. The `catch` is only a safety
 * net for an evaluator that *throws* instead of returning; since the true cause
 * is unknown there, it degrades to `ai-network` (a transport-level failure), so
 * the AI step stays non-fatal by the partial-result principle without
 * mislabelling the cause as a rejected key.
 */
export async function runAi(
  input: AiEvaluatorInput,
  evaluate: AiEvaluator,
): Promise<AiEvaluation> {
  try {
    const result = await evaluate(input)
    if (result.ok) {
      // Normalise the reported score against the axes, ignoring an inflated
      // caller-supplied total. Preserve the evaluator's screenshots-omitted flag
      // so the "evaluated without screenshots" notice survives to the report.
      const success: AiSuccess = {
        ok: true,
        axes: result.axes,
        llmScore: sumAxisScores(result.axes),
      }
      if (result.screenshotsOmitted) success.screenshotsOmitted = true
      return success
    }
    return result
  } catch {
    return { ok: false, reason: 'ai-network' }
  }
}

/** The AI-rubric axis ids this stage scores (re-exported for callers/tests). */
export const AI_AXIS_IDS = LLM_AXIS_IDS
