/**
 * The OpenAI AI-rubric evaluator: a GPT chat-completion call behind the injected
 * {@link AiEvaluator} boundary.
 *
 * This is the OpenAI sibling of {@link module:server/claude-evaluator}. Given the
 * page text (and screenshots when present), it asks a GPT model to score the
 * landing page on the same three rubric axes — Visual / Copy / CTA — and to reply
 * with the strict JSON envelope. The rubric system prompt and the reply
 * parser/validator are *shared* with the Claude evaluator so both vendors produce
 * an identical {@link LlmAxis}[] contract; only the transport (the OpenAI SDK
 * request/response shape) differs here. A malformed reply is retried exactly once
 * before the stage degrades to a typed `parse-failure`. Provider failures map to
 * typed reasons so the pipeline can turn any of them into a `done-partial` report:
 * no key → `missing-key`, an auth rejection → `invalid-key`, a 429 → `rate-limit`.
 *
 * Key hygiene (spec "no API key logging"): the API key is only ever handed to the
 * injected chat-create function to construct the client. It is never written into
 * the request body, the rubric prompt, a log line, or any returned/thrown value —
 * this module returns reason *codes*, never the key.
 *
 * Boundary: standalone backend evaluator. It composes `ai-stage` / `core/report`
 * types, the shared rubric prompt + parser, and the OpenAI SDK behind an injected
 * `createChat` function, so tests exercise every branch with a mocked SDK and no
 * network. It has no React or component dependencies and performs no I/O of its
 * own beyond that call.
 */
import OpenAI from 'openai'
import { type LlmAxis, type Screenshot } from '../core/report'
import type { AiFailureReason } from './analysis-copy'
import {
  hasApiKey,
  sumAxisScores,
  type AiEvaluation,
  type AiEvaluator,
  type AiEvaluatorInput,
} from './ai-stage'
import { RUBRIC_SYSTEM_PROMPT, parseRubricAxes } from './claude-evaluator'

/** The GPT model this evaluator scores with, unless the input overrides it. */
export const DEFAULT_OPENAI_MODEL = 'gpt-4o'

/** Output cap for the rubric reply — a small JSON envelope needs little room. */
const MAX_TOKENS = 2048

/**
 * The injected chat-create boundary. Given the API key and a chat-completions
 * request, it returns the model's reply. The default builds a per-call client
 * from the key; tests inject a stub so no network (and no real key) is involved.
 *
 * The key is a *separate* argument — never part of `params` — so it stays out of
 * anything that could be logged or echoed.
 */
export type OpenAiChatCreate = (
  apiKey: string,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
) => Promise<OpenAI.Chat.Completions.ChatCompletion>

/** Default boundary: construct a client from the key and call the real API. */
const defaultCreateChat: OpenAiChatCreate = (apiKey, params) =>
  new OpenAI({ apiKey }).chat.completions.create(params)

/** Builds an image content part for a screenshot, skipping unusable ones. */
function screenshotPart(
  shot: Screenshot,
): OpenAI.Chat.Completions.ChatCompletionContentPart | null {
  // OpenAI accepts a `data:` URL directly as the image source, so (unlike the
  // Anthropic path) no base64 splitting is needed — just pass a well-formed one.
  if (!/^data:image\/[a-z+]+;base64,.+/i.test(shot.dataUrl)) return null
  return { type: 'image_url', image_url: { url: shot.dataUrl } }
}

/** Assembles the user message content: screenshots first, then the page text. */
function buildUserContent(
  input: AiEvaluatorInput,
): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []
  for (const shot of input.screenshots ?? []) {
    const part = screenshotPart(shot)
    if (part) {
      parts.push({
        type: 'text',
        text: `The following is a screenshot of the ${shot.viewport === 'mobile' ? 'mobile' : 'desktop'} view.`,
      })
      parts.push(part)
    }
  }
  parts.push({
    type: 'text',
    text: [
      `Target URL: ${input.url}`,
      '',
      'Page text (HTML):',
      input.html,
      '',
      'Based on the material above, evaluate the visual, copy, and cta axes and output exactly one JSON object.',
    ].join('\n'),
  })
  return parts
}

/** Builds the non-streaming chat-completions request for this input. */
function buildRequest(
  input: AiEvaluatorInput,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  const model =
    typeof input.model === 'string' && input.model.trim() !== ''
      ? input.model
      : DEFAULT_OPENAI_MODEL
  return {
    model,
    max_tokens: MAX_TOKENS,
    // Ask for a JSON object so the model does not wrap the envelope in prose; the
    // shared parser still defends against fences/garbage as a backstop.
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: RUBRIC_SYSTEM_PROMPT },
      { role: 'user', content: buildUserContent(input) },
    ],
  }
}

/** Concatenates the assistant text of a chat-completion reply. */
function replyText(completion: OpenAI.Chat.Completions.ChatCompletion): string {
  return (completion.choices ?? [])
    .map((choice) => choice.message?.content ?? '')
    .filter((content): content is string => typeof content === 'string')
    .join('\n')
    .trim()
}

/** Maps a thrown provider error to a typed AI-failure reason (never the key). */
function mapError(error: unknown): AiFailureReason {
  if (
    error instanceof OpenAI.RateLimitError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { status?: unknown }).status === 429)
  ) {
    return 'rate-limit'
  }
  // Auth rejections and any other provider/model failure degrade to invalid-key
  // (the partial-result principle: the AI step is non-fatal).
  return 'invalid-key'
}

/**
 * Creates a real {@link AiEvaluator} backed by OpenAI GPT. `createChat` is
 * injected so tests supply a stub; production uses {@link defaultCreateChat}.
 */
export function createOpenAiAiEvaluator(
  createChat: OpenAiChatCreate = defaultCreateChat,
): AiEvaluator {
  return async (input: AiEvaluatorInput): Promise<AiEvaluation> => {
    if (!hasApiKey(input.apiKey)) {
      return { ok: false, reason: 'missing-key' }
    }
    const apiKey = input.apiKey as string
    const request = buildRequest(input)
    try {
      // One initial attempt, then exactly one retry on a parse failure only.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const completion = await createChat(apiKey, request)
        const axes: LlmAxis[] | null = parseRubricAxes(replyText(completion))
        if (axes) {
          return { ok: true, axes, llmScore: sumAxisScores(axes) }
        }
      }
      return { ok: false, reason: 'parse-failure' }
    } catch (error) {
      return { ok: false, reason: mapError(error) }
    }
  }
}
