/**
 * Provider routing for the AI-rubric stage.
 *
 * The grader now offers more than one AI vendor (Anthropic Claude and OpenAI
 * GPT). Both sit behind the same {@link AiEvaluator} boundary and return the
 * identical scored-axes contract, so the only thing that varies per run is *which
 * vendor* the user picked. {@link createRoutingAiEvaluator} composes one evaluator
 * per provider id and dispatches on the request's `provider` field, defaulting to
 * Anthropic when the field is absent or unknown (the original single-vendor
 * behaviour, so existing callers are unaffected).
 *
 * Boundary: standalone backend composer. It wires the concrete vendor evaluators
 * behind the injected-evaluator seam and holds no state; the per-call API key
 * still lives only inside each vendor evaluator's own request.
 */
import {
  type AiEvaluation,
  type AiEvaluator,
  type AiEvaluatorInput,
} from './ai-stage'
import { createClaudeAiEvaluator } from './claude-evaluator'
import { createOpenAiAiEvaluator } from './openai-evaluator'

/** The provider ids this router understands. */
export const AI_PROVIDERS = ['anthropic', 'openai'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

/** The provider used when a request omits (or misnames) `provider`. */
export const DEFAULT_AI_PROVIDER: AiProvider = 'anthropic'

/** Normalises an arbitrary provider string to a known id, or the default. */
export function resolveProvider(provider: string | undefined): AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(provider ?? '')
    ? (provider as AiProvider)
    : DEFAULT_AI_PROVIDER
}

/** The per-provider evaluator table {@link createRoutingAiEvaluator} dispatches on. */
export type ProviderEvaluators = Record<AiProvider, AiEvaluator>

/**
 * Builds an {@link AiEvaluator} that dispatches on `input.provider`. Pass a
 * partial `evaluators` map to override a vendor (tests inject stubs); any vendor
 * left unset falls back to its real evaluator with the default SDK boundary.
 */
export function createRoutingAiEvaluator(
  evaluators: Partial<ProviderEvaluators> = {},
): AiEvaluator {
  const table: ProviderEvaluators = {
    anthropic: evaluators.anthropic ?? createClaudeAiEvaluator(),
    openai: evaluators.openai ?? createOpenAiAiEvaluator(),
  }
  return (input: AiEvaluatorInput): Promise<AiEvaluation> =>
    table[resolveProvider(input.provider)](input)
}
