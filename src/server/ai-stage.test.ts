import { describe, expect, it, vi } from 'vitest'
import {
  classifyAiError,
  classifyProviderFailure,
  defaultAiEvaluator,
  hasApiKey,
  maskApiKey,
  runAi,
  sumAxisScores,
  toProviderErrorInfo,
  type AiEvaluator,
} from './ai-stage'
import type { AiFailureReason } from './analysis-copy'
import type { LlmAxis } from '../core/report'

/**
 * The AI stage owns the key-gate and the failure→partial routing; the real model
 * call lives in the routing evaluator wired into the pipeline. These tests pin
 * the default stub evaluator's gate, the score normalisation, and the error
 * containment.
 */

const AXES: LlmAxis[] = [
  { id: 'visual', label: 'Visual', score: 15, maxScore: 15, comment: '', suggestions: [] },
  { id: 'copy', label: 'Copy', score: 15, maxScore: 15, comment: '', suggestions: [] },
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

  it('fails with invalid-key when a key is present (stub gate, not the real evaluator)', async () => {
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

  it('contains a truly-unknown thrown error as an ai-network failure (not invalid-key)', async () => {
    // The evaluators classify their own provider failures and *return* them, so
    // a throw here means an unexpected transport-level fault of unknown cause —
    // it degrades to ai-network, never a blanket invalid-key.
    const evaluate = vi.fn<AiEvaluator>(async () => {
      throw new Error('boom')
    })
    expect(await runAi({ url: 'x', html: '' }, evaluate)).toEqual({
      ok: false,
      reason: 'ai-network',
    })
  })

  it('preserves an evaluator-classified failure verbatim (reason + status + summary)', async () => {
    const evaluate: AiEvaluator = async () => ({
      ok: false,
      reason: 'model-error',
      statusCode: 404,
      summary: 'HTTP 404: model not found',
    })
    expect(await runAi({ url: 'x', html: '' }, evaluate)).toEqual({
      ok: false,
      reason: 'model-error',
      statusCode: 404,
      summary: 'HTTP 404: model not found',
    })
  })
})

describe('maskApiKey', () => {
  it('redacts the exact known key everywhere it appears', () => {
    const key = 'sk-ant-secret-value-123'
    expect(maskApiKey(`auth failed for ${key} twice: ${key}`, key)).toBe(
      'auth failed for [redacted] twice: [redacted]',
    )
    expect(maskApiKey(`auth failed for ${key}`, key)).not.toContain(key)
  })

  it('redacts key-shaped tokens even when the exact key is not supplied', () => {
    expect(maskApiKey('rejected: sk-openai-abcdef123456')).toBe('rejected: [redacted]')
    expect(maskApiKey('header Bearer abcdef1234567890')).toBe('header Bearer [redacted]')
  })

  it('leaves ordinary text untouched', () => {
    expect(maskApiKey('HTTP 404: model not found', 'sk-x-unused')).toBe(
      'HTTP 404: model not found',
    )
  })
})

describe('toProviderErrorInfo', () => {
  it('extracts numeric status and string message from an SDK-shaped error', () => {
    expect(toProviderErrorInfo({ status: 404, message: 'no such model' })).toEqual({
      status: 404,
      message: 'no such model',
    })
  })

  it('yields an empty info for a status-less or non-object throw', () => {
    expect(toProviderErrorInfo(new Error('boom'))).toEqual({ status: undefined, message: 'boom' })
    expect(toProviderErrorInfo('nope')).toEqual({})
    expect(toProviderErrorInfo(null)).toEqual({})
  })
})

describe('classifyAiError', () => {
  const cases: Array<[string, { status?: number; message?: string }, AiFailureReason]> = [
    ['401 auth', { status: 401, message: 'invalid api key' }, 'invalid-key'],
    ['403 auth', { status: 403, message: 'forbidden' }, 'invalid-key'],
    ['403 no model access', { status: 403, message: 'You do not have access to model gpt-x' }, 'model-error'],
    ['404 model', { status: 404, message: 'model not found' }, 'model-error'],
    ['400 model not found', { status: 400, message: 'The model `foo` does not exist' }, 'model-error'],
    ['400 image unsupported', { status: 400, message: 'This model does not support image input' }, 'vision-unsupported'],
    ['400 other', { status: 400, message: 'invalid request: bad field' }, 'request-error'],
    ['429', { status: 429, message: 'slow down' }, 'rate-limit'],
    ['500', { status: 500, message: 'internal error' }, 'provider-error'],
    ['503', { status: 503, message: 'unavailable' }, 'provider-error'],
    ['no status (timeout/network)', { message: 'Connection timed out' }, 'ai-network'],
    ['empty', {}, 'ai-network'],
  ]

  it.each(cases)('maps %s to its distinct reason', (_label, info, expected) => {
    expect(classifyAiError(info)).toBe(expected)
  })
})

describe('classifyProviderFailure', () => {
  it('captures reason, statusCode, and a masked summary', () => {
    const failure = classifyProviderFailure(
      { status: 401, message: 'auth failed for sk-secret-abcdef123456' },
      'sk-secret-abcdef123456',
    )
    expect(failure.reason).toBe('invalid-key')
    expect(failure.statusCode).toBe(401)
    expect(failure.summary).toBe('HTTP 401: auth failed for [redacted]')
    expect(JSON.stringify(failure)).not.toContain('sk-secret-abcdef123456')
  })

  it('omits statusCode for a status-less transport error', () => {
    const failure = classifyProviderFailure({ message: 'Connection error' })
    expect(failure.reason).toBe('ai-network')
    expect(failure.statusCode).toBeUndefined()
    expect(failure.summary).toBe('Connection error')
  })
})
