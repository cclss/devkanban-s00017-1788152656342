import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import {
  createClaudeAiEvaluator,
  parseRubricAxes,
  RUBRIC_SYSTEM_PROMPT,
  type AnthropicMessageCreate,
} from './claude-evaluator'
import { LLM_AXIS_LABELS, LLM_MAX_SCORE, type Screenshot } from '../core/report'

/**
 * The real evaluator calls Claude behind an injected message-create function, so
 * every branch is exercised with a stub — no network, no real key. These pin the
 * happy path (valid JSON → three axes summing to ≤40), the parse retry, the
 * failure→reason mapping, and the key-hygiene invariant.
 */

const KEY = 'sk-ant-secret-key-should-never-leak'

/** A minimal Claude reply carrying `text` as its single text block. */
function reply(text: string): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as unknown as Anthropic.Message
}

const VALID_JSON = JSON.stringify({
  axes: [
    { id: 'visual', score: 16, comment: 'The layout is clear.', suggestions: ['Increase the contrast.'] },
    { id: 'copy', score: 12, comment: 'The wording is somewhat abstract.', suggestions: [] },
    { id: 'cta', score: 9, comment: 'The CTA is clear.', suggestions: ['Also place it at the bottom.'] },
  ],
})

describe('parseRubricAxes', () => {
  it('parses a valid JSON envelope into three canonical axes', () => {
    const axes = parseRubricAxes(VALID_JSON)
    expect(axes?.map((a) => a.id)).toEqual(['visual', 'copy', 'cta'])
    expect(axes?.map((a) => a.maxScore)).toEqual([16, 14, 10])
    expect(axes?.[0].label).toBe(LLM_AXIS_LABELS.visual)
  })

  it('tolerates a markdown code fence around the JSON', () => {
    expect(parseRubricAxes('```json\n' + VALID_JSON + '\n```')).not.toBeNull()
  })

  it('clamps out-of-range scores into each axis ceiling', () => {
    const axes = parseRubricAxes(
      JSON.stringify({
        axes: [
          { id: 'visual', score: 999 },
          { id: 'copy', score: -5 },
          { id: 'cta', score: 7.6 },
        ],
      }),
    )
    expect(axes?.map((a) => a.score)).toEqual([16, 0, 8])
  })

  it('returns null on non-JSON, missing axes, or non-numeric scores', () => {
    expect(parseRubricAxes('not json at all')).toBeNull()
    expect(parseRubricAxes(JSON.stringify({ axes: [{ id: 'visual', score: 5 }] }))).toBeNull()
    expect(
      parseRubricAxes(
        JSON.stringify({
          axes: [
            { id: 'visual', score: 'x' },
            { id: 'copy', score: 5 },
            { id: 'cta', score: 5 },
          ],
        }),
      ),
    ).toBeNull()
  })
})

describe('createClaudeAiEvaluator', () => {
  it('scores valid JSON into three axes summing to ≤ the 40-point AI max', async () => {
    const create: AnthropicMessageCreate = vi.fn(async () => reply(VALID_JSON))
    const evaluate = createClaudeAiEvaluator(create)
    const result = await evaluate({ url: 'https://x.test', html: '<h1>hi</h1>', apiKey: KEY })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.axes).toHaveLength(3)
      expect(result.llmScore).toBe(37)
      expect(result.llmScore).toBeLessThanOrEqual(LLM_MAX_SCORE)
    }
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('retries once on a parse failure, then returns parse-failure', async () => {
    const create: AnthropicMessageCreate = vi.fn(async () => reply('garbage {not json'))
    const evaluate = createClaudeAiEvaluator(create)
    const result = await evaluate({ url: 'https://x.test', html: '', apiKey: KEY })

    expect(result).toEqual({ ok: false, reason: 'parse-failure' })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('recovers when the retry returns valid JSON', async () => {
    const create: AnthropicMessageCreate = vi
      .fn<AnthropicMessageCreate>()
      .mockResolvedValueOnce(reply('oops'))
      .mockResolvedValueOnce(reply(VALID_JSON))
    const evaluate = createClaudeAiEvaluator(create)
    const result = await evaluate({ url: 'https://x.test', html: '', apiKey: KEY })

    expect(result.ok).toBe(true)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('maps an authentication error to invalid-key', async () => {
    const create: AnthropicMessageCreate = vi.fn(async () => {
      throw new Anthropic.AuthenticationError(401, { error: { message: 'bad key' } }, 'auth', new Headers())
    })
    const evaluate = createClaudeAiEvaluator(create)
    expect(await evaluate({ url: 'x', html: '', apiKey: KEY })).toEqual({
      ok: false,
      reason: 'invalid-key',
    })
  })

  it('maps a 429 rate-limit error to rate-limit', async () => {
    const create: AnthropicMessageCreate = vi.fn(async () => {
      throw new Anthropic.RateLimitError(429, { error: { message: 'slow down' } }, 'rl', new Headers())
    })
    const evaluate = createClaudeAiEvaluator(create)
    expect(await evaluate({ url: 'x', html: '', apiKey: KEY })).toEqual({
      ok: false,
      reason: 'rate-limit',
    })
  })

  it('returns missing-key without calling the model when no key is supplied', async () => {
    const create: AnthropicMessageCreate = vi.fn(async () => reply(VALID_JSON))
    const evaluate = createClaudeAiEvaluator(create)
    expect(await evaluate({ url: 'x', html: '' })).toEqual({ ok: false, reason: 'missing-key' })
    expect(await evaluate({ url: 'x', html: '', apiKey: '   ' })).toEqual({
      ok: false,
      reason: 'missing-key',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('sends screenshot image blocks and page text, but never the key, in the request', async () => {
    const create = vi.fn<AnthropicMessageCreate>(async () => reply(VALID_JSON))
    const evaluate = createClaudeAiEvaluator(create)
    const screenshots: Screenshot[] = [
      { viewport: 'desktop', dataUrl: 'data:image/png;base64,AAAABBBB', width: 1280, height: 720 },
    ]
    await evaluate({ url: 'https://x.test', html: '<h1>hi</h1>', apiKey: KEY, screenshots })

    const [passedKey, params] = create.mock.calls[0]
    expect(passedKey).toBe(KEY)
    const serialized = JSON.stringify(params)
    expect(serialized).not.toContain(KEY)
    const content = params.messages[0].content as Anthropic.ContentBlockParam[]
    expect(content.some((b) => b.type === 'image')).toBe(true)
    expect(content.some((b) => b.type === 'text' && b.text.includes('<h1>hi</h1>'))).toBe(true)
  })

  it('keeps the key out of every thrown error and returned value', async () => {
    const throwers: AnthropicMessageCreate[] = [
      async () => {
        throw new Error(`boom with ${KEY}`)
      },
      async () => {
        throw new Anthropic.AuthenticationError(401, {}, `auth ${KEY}`, new Headers())
      },
      async () => reply(`{invalid ${KEY}`),
    ]
    for (const create of throwers) {
      const evaluate = createClaudeAiEvaluator(create)
      const result = await evaluate({ url: 'x', html: '', apiKey: KEY })
      expect(JSON.stringify(result)).not.toContain(KEY)
      expect(result.ok).toBe(false)
    }
  })

  it('embeds the three axis ceilings in the English rubric prompt', () => {
    expect(RUBRIC_SYSTEM_PROMPT).toContain('out of 16 points')
    expect(RUBRIC_SYSTEM_PROMPT).toContain('out of 14 points')
    expect(RUBRIC_SYSTEM_PROMPT).toContain('out of 10 points')
    expect(RUBRIC_SYSTEM_PROMPT).toContain('JSON')
  })
})
