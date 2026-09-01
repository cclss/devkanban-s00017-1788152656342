import { describe, expect, it, vi } from 'vitest'
import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  createRoutingAiEvaluator,
  resolveProvider,
} from './ai-router'
import type { AiEvaluator } from './ai-stage'
import {
  LLM_AXIS_IDS,
  LLM_AXIS_LABELS,
  LLM_AXIS_MAX_SCORES,
  type LlmAxis,
} from '../core/report'

/**
 * The router dispatches on the request's `provider`, defaulting to Anthropic. It
 * is exercised with stub evaluators (no network, no real SDK), pinning the
 * dispatch table, the default-fallback for absent/unknown providers, and the
 * provider-normalisation helper.
 */

const axes: LlmAxis[] = LLM_AXIS_IDS.map((id) => ({
  id,
  label: LLM_AXIS_LABELS[id],
  score: 1,
  maxScore: LLM_AXIS_MAX_SCORES[id],
  comment: '',
  suggestions: [],
}))

const stub = (tag: string): AiEvaluator =>
  vi.fn(async () => ({ ok: true as const, axes, llmScore: 3, _tag: tag }) as never)

describe('resolveProvider', () => {
  it('keeps a known provider and falls back to the default otherwise', () => {
    expect(resolveProvider('openai')).toBe('openai')
    expect(resolveProvider('anthropic')).toBe('anthropic')
    expect(resolveProvider(undefined)).toBe(DEFAULT_AI_PROVIDER)
    expect(resolveProvider('gemini')).toBe(DEFAULT_AI_PROVIDER)
    expect(resolveProvider('')).toBe(DEFAULT_AI_PROVIDER)
  })

  it('lists exactly anthropic and openai', () => {
    expect([...AI_PROVIDERS]).toEqual(['anthropic', 'openai'])
  })
})

describe('createRoutingAiEvaluator', () => {
  it('routes an openai request to the openai evaluator', async () => {
    const anthropic = stub('anthropic')
    const openai = stub('openai')
    const evaluate = createRoutingAiEvaluator({ anthropic, openai })

    await evaluate({ url: 'x', html: '', apiKey: 'k', provider: 'openai' })
    expect(openai).toHaveBeenCalledTimes(1)
    expect(anthropic).not.toHaveBeenCalled()
  })

  it('routes an anthropic request to the anthropic evaluator', async () => {
    const anthropic = stub('anthropic')
    const openai = stub('openai')
    const evaluate = createRoutingAiEvaluator({ anthropic, openai })

    await evaluate({ url: 'x', html: '', apiKey: 'k', provider: 'anthropic' })
    expect(anthropic).toHaveBeenCalledTimes(1)
    expect(openai).not.toHaveBeenCalled()
  })

  it('defaults to anthropic when the provider is absent or unknown', async () => {
    const anthropic = stub('anthropic')
    const openai = stub('openai')
    const evaluate = createRoutingAiEvaluator({ anthropic, openai })

    await evaluate({ url: 'x', html: '', apiKey: 'k' })
    await evaluate({ url: 'x', html: '', apiKey: 'k', provider: 'nope' })
    expect(anthropic).toHaveBeenCalledTimes(2)
    expect(openai).not.toHaveBeenCalled()
  })
})
