import { describe, expect, it, vi } from 'vitest'
import {
  defaultAiEvaluator,
  hasApiKey,
  runAi,
  sumAxisScores,
  type AiEvaluator,
} from './ai-stage'
import type { LlmAxis } from '../core/report'

/**
 * The AI stage owns the key-gate and the failure→partial routing (the real
 * model call is a later grain). These tests pin the default evaluator's gate,
 * the score normalisation, and the error containment.
 */

const AXES: LlmAxis[] = [
  { id: 'visual', label: '비주얼', score: 15, maxScore: 15, comment: '', suggestions: [] },
  { id: 'copy', label: '카피', score: 15, maxScore: 15, comment: '', suggestions: [] },
  { id: 'cta', label: 'CTA', score: 10, maxScore: 10, comment: '', suggestions: [] },
]

describe('hasApiKey', () => {
  it('treats blank / undefined keys as absent', () => {
    expect(hasApiKey(undefined)).toBe(false)
    expect(hasApiKey('')).toBe(false)
    expect(hasApiKey('   ')).toBe(false)
    expect(hasApiKey('sk-x')).toBe(true)
  })
})

describe('sumAxisScores', () => {
  it('sums axis scores and clamps to the 40-point AI max', () => {
    expect(sumAxisScores(AXES)).toBe(40)
    expect(sumAxisScores([{ ...AXES[0], score: 100 }])).toBe(40)
  })
})

describe('defaultAiEvaluator', () => {
  it('fails with missing-key when no key is supplied', async () => {
    await expect(defaultAiEvaluator({ url: 'x', html: '' })).resolves.toEqual({
      ok: false,
      reason: 'missing-key',
    })
  })

  it('fails with invalid-key when a key is present (real call not wired)', async () => {
    await expect(
      defaultAiEvaluator({ url: 'x', html: '', apiKey: 'sk-x' }),
    ).resolves.toEqual({ ok: false, reason: 'invalid-key' })
  })
})

describe('runAi', () => {
  it('normalises the AI score from the axes on success', async () => {
    const evaluate: AiEvaluator = async () => ({ ok: true, axes: AXES, llmScore: 999 })
    const result = await runAi({ url: 'x', html: '' }, evaluate)
    expect(result).toEqual({ ok: true, axes: AXES, llmScore: 40 })
  })

  it('passes a failure result straight through', async () => {
    const evaluate: AiEvaluator = async () => ({ ok: false, reason: 'rate-limit' })
    expect(await runAi({ url: 'x', html: '' }, evaluate)).toEqual({
      ok: false,
      reason: 'rate-limit',
    })
  })

  it('contains a thrown error as an invalid-key failure', async () => {
    const evaluate = vi.fn<AiEvaluator>(async () => {
      throw new Error('boom')
    })
    expect(await runAi({ url: 'x', html: '' }, evaluate)).toEqual({
      ok: false,
      reason: 'invalid-key',
    })
  })
})
