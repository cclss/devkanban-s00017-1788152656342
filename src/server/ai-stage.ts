/**
 * The `ai` stage: the AI-rubric evaluation boundary and its partial-result gate.
 *
 * This grain owns only the *contract and routing* of the AI step, not a real
 * model call (that is a later grain). The stage takes an {@link AiEvaluator} —
 * an injected boundary that, given the page text and an API key, returns either
 * the three scored {@link LlmAxis} axes or a typed failure. The pipeline turns a
 * failure into a `done-partial` report (60-point auto-audit only); a success
 * into a full `done` report.
 *
 * The default evaluator, {@link defaultAiEvaluator}, encodes the baseline
 * key-gate: no key → `missing-key`; a key present → `invalid-key`, because the
 * real Claude call is not wired yet. So out of the box every run with a key
 * still completes as a partial result, and a later grain swaps in an evaluator
 * that actually calls the model. Tests inject their own evaluator to exercise
 * both the happy path and each failure branch without a network.
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
  /** Selected model id (e.g. `claude-sonnet-5`), when chosen. */
  model?: string
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
}

/** A failed AI evaluation, routing the report to `done-partial`. */
export interface AiFailure {
  ok: false
  /** Typed cause, mapped to Korean `partialReason` copy by the pipeline. */
  reason: AiFailureReason
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
 * Baseline evaluator: the key-gate only. No key → `missing-key`; a key present →
 * `invalid-key`, since the real Claude call is not wired in this grain. A later
 * grain replaces this with an evaluator that actually calls the model.
 */
export const defaultAiEvaluator: AiEvaluator = async ({ apiKey }) => {
  if (!hasApiKey(apiKey)) {
    return { ok: false, reason: 'missing-key' }
  }
  return { ok: false, reason: 'invalid-key' }
}

/**
 * Runs the AI stage, delegating to `evaluate`. Any thrown error is contained and
 * converted to an `invalid-key` failure so a misbehaving evaluator degrades to a
 * partial result instead of tearing down the whole analysis (errors are
 * information, but the AI step is non-fatal by the partial-result principle).
 */
export async function runAi(
  input: AiEvaluatorInput,
  evaluate: AiEvaluator,
): Promise<AiEvaluation> {
  try {
    const result = await evaluate(input)
    if (result.ok) {
      // Normalise the reported score against the axes, ignoring an inflated
      // caller-supplied total.
      return { ok: true, axes: result.axes, llmScore: sumAxisScores(result.axes) }
    }
    return result
  } catch {
    return { ok: false, reason: 'invalid-key' }
  }
}

/** The AI-rubric axis ids this stage scores (re-exported for callers/tests). */
export const AI_AXIS_IDS = LLM_AXIS_IDS
