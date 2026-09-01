import OpenAI from 'openai'
import { describe, expect, it, vi } from 'vitest'
import {
  createOpenAiAiEvaluator,
  DEFAULT_OPENAI_MODEL,
  type OpenAiChatCreate,
} from './openai-evaluator'
import { LLM_MAX_SCORE, type Screenshot } from '../core/report'

/**
 * The OpenAI evaluator calls GPT behind an injected chat-create function, so
 * every branch is exercised with a stub — no network, no real key. These pin the
 * happy path (valid JSON → three axes summing to ≤40), the parse retry, the
 * failure→reason mapping, the key-hygiene invariant, and the GPT request shape
 * (JSON response format, image_url parts, default model).
 */

const KEY = 'sk-openai-secret-key-should-never-leak'

/** A minimal GPT reply carrying `text` as the single choice's message content. */
function reply(text: string): OpenAI.Chat.Completions.ChatCompletion {
  return {
    id: 'chatcmpl_test',
    object: 'chat.completion',
    created: 0,
    model: DEFAULT_OPENAI_MODEL,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
        message: { role: 'assistant', content: text, refusal: null },
      },
    ],
  } as unknown as OpenAI.Chat.Completions.ChatCompletion
}

const VALID_JSON = JSON.stringify({
  axes: [
    { id: 'visual', score: 15, comment: 'The layout is clean.', suggestions: ['Increase the whitespace.'] },
    { id: 'copy', score: 11, comment: 'The wording is clear.', suggestions: [] },
    { id: 'cta', score: 8, comment: 'The CTA stands out.', suggestions: ['Increase the color contrast.'] },
  ],
})

describe('createOpenAiAiEvaluator', () => {
  it('scores valid JSON into three axes summing to ≤ the 40-point AI max', async () => {
    const create: OpenAiChatCreate = vi.fn(async () => reply(VALID_JSON))
    const evaluate = createOpenAiAiEvaluator(create)
    const result = await evaluate({
      url: 'https://x.test',
      html: '<h1>hi</h1>',
      apiKey: KEY,
      provider: 'openai',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.axes).toHaveLength(3)
      expect(result.llmScore).toBe(34)
      expect(result.llmScore).toBeLessThanOrEqual(LLM_MAX_SCORE)
    }
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('retries once on a parse failure, then returns parse-failure', async () => {
    const create: OpenAiChatCreate = vi.fn(async () => reply('garbage {not json'))
    const evaluate = createOpenAiAiEvaluator(create)
    const result = await evaluate({ url: 'https://x.test', html: '', apiKey: KEY })

    expect(result).toEqual({ ok: false, reason: 'parse-failure' })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('recovers when the retry returns valid JSON', async () => {
    const create: OpenAiChatCreate = vi
      .fn<OpenAiChatCreate>()
      .mockResolvedValueOnce(reply('oops'))
      .mockResolvedValueOnce(reply(VALID_JSON))
    const evaluate = createOpenAiAiEvaluator(create)
    const result = await evaluate({ url: 'https://x.test', html: '', apiKey: KEY })

    expect(result.ok).toBe(true)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('maps an authentication error to invalid-key', async () => {
    const create: OpenAiChatCreate = vi.fn(async () => {
      throw new OpenAI.AuthenticationError(401, { error: { message: 'bad key' } }, 'auth', new Headers())
    })
    const evaluate = createOpenAiAiEvaluator(create)
    expect(await evaluate({ url: 'x', html: '', apiKey: KEY })).toEqual({
      ok: false,
      reason: 'invalid-key',
    })
  })

  it('maps a 429 rate-limit error to rate-limit', async () => {
    const create: OpenAiChatCreate = vi.fn(async () => {
      throw new OpenAI.RateLimitError(429, { error: { message: 'slow down' } }, 'rl', new Headers())
    })
    const evaluate = createOpenAiAiEvaluator(create)
    expect(await evaluate({ url: 'x', html: '', apiKey: KEY })).toEqual({
      ok: false,
      reason: 'rate-limit',
    })
  })

  it('returns missing-key without calling the model when no key is supplied', async () => {
    const create: OpenAiChatCreate = vi.fn(async () => reply(VALID_JSON))
    const evaluate = createOpenAiAiEvaluator(create)
    expect(await evaluate({ url: 'x', html: '' })).toEqual({ ok: false, reason: 'missing-key' })
    expect(await evaluate({ url: 'x', html: '', apiKey: '   ' })).toEqual({
      ok: false,
      reason: 'missing-key',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('sends screenshot image parts and page text, requests JSON, but never the key', async () => {
    const create = vi.fn<OpenAiChatCreate>(async () => reply(VALID_JSON))
    const evaluate = createOpenAiAiEvaluator(create)
    const screenshots: Screenshot[] = [
      { viewport: 'desktop', dataUrl: 'data:image/png;base64,AAAABBBB', width: 1280, height: 720 },
    ]
    await evaluate({ url: 'https://x.test', html: '<h1>hi</h1>', apiKey: KEY, screenshots })

    const [passedKey, params] = create.mock.calls[0]
    expect(passedKey).toBe(KEY)
    const serialized = JSON.stringify(params)
    expect(serialized).not.toContain(KEY)
    expect(params.response_format).toEqual({ type: 'json_object' })
    const userMessage = params.messages.find((m) => m.role === 'user')
    const content = userMessage?.content as OpenAI.Chat.Completions.ChatCompletionContentPart[]
    expect(content.some((p) => p.type === 'image_url')).toBe(true)
    expect(content.some((p) => p.type === 'text' && p.text.includes('<h1>hi</h1>'))).toBe(true)
  })

  it('uses the default GPT model when the input omits one, and honours an override', async () => {
    const create = vi.fn<OpenAiChatCreate>(async () => reply(VALID_JSON))
    const evaluate = createOpenAiAiEvaluator(create)

    await evaluate({ url: 'x', html: '', apiKey: KEY })
    expect(create.mock.calls[0][1].model).toBe(DEFAULT_OPENAI_MODEL)

    await evaluate({ url: 'x', html: '', apiKey: KEY, model: 'gpt-4o-mini' })
    expect(create.mock.calls[1][1].model).toBe('gpt-4o-mini')
  })

  it('keeps the key out of every thrown error and returned value', async () => {
    const throwers: OpenAiChatCreate[] = [
      async () => {
        throw new Error(`boom with ${KEY}`)
      },
      async () => {
        throw new OpenAI.AuthenticationError(401, {}, `auth ${KEY}`, new Headers())
      },
      async () => reply(`{invalid ${KEY}`),
    ]
    for (const create of throwers) {
      const evaluate = createOpenAiAiEvaluator(create)
      const result = await evaluate({ url: 'x', html: '', apiKey: KEY })
      expect(JSON.stringify(result)).not.toContain(KEY)
      expect(result.ok).toBe(false)
    }
  })
})
