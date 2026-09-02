/**
 * The real AI-rubric evaluator: a Claude `claude-sonnet-5` call behind the
 * injected {@link AiEvaluator} boundary.
 *
 * Given the page text (and screenshots when present), it asks Claude to score
 * the landing page on the three rubric axes — Visual / Copy / CTA — and to reply
 * with a strict JSON envelope. The reply is parsed and validated into
 * {@link LlmAxis}[]; a malformed reply is retried exactly once before the stage
 * degrades to a typed `parse-failure`. Provider failures are classified by
 * status/message into distinct typed reasons (401/403 → `invalid-key`,
 * 404 / no-model-access → `model-error`, 400 image-unsupported →
 * `vision-unsupported`, other 400 → `request-error`, 5xx → `provider-error`,
 * 429 → `rate-limit`, timeout/network → `ai-network`) so the pipeline can turn
 * any of them into a `done-partial` report with an accurate cause; no key →
 * `missing-key`.
 *
 * Key hygiene (spec "no API key logging"): the API key is only ever handed to the
 * injected message-create function to construct the client. It is never written
 * into the request body, the rubric prompt, a log line, or any returned/thrown
 * value — this module returns reason *codes*, never the key.
 *
 * Boundary: standalone backend evaluator. It composes `ai-stage` / `core/report`
 * types and the Anthropic SDK behind an injected `createMessage` function, so
 * tests exercise every branch with a mocked SDK and no network. It has no React
 * or component dependencies and performs no I/O of its own beyond that call.
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  LLM_AXIS_IDS,
  LLM_AXIS_LABELS,
  LLM_AXIS_MAX_SCORES,
  type LlmAxis,
  type LlmAxisId,
  type Screenshot,
} from '../core/report'
import {
  classifyProviderFailure,
  hasApiKey,
  sumAxisScores,
  toProviderErrorInfo,
  type AiEvaluation,
  type AiEvaluator,
  type AiEvaluatorInput,
  type AiFailure,
  type AiSuccess,
} from './ai-stage'
import { modelSupportsVision } from './vision-support'

/** The Claude model this evaluator scores with, unless the input overrides it. */
export const DEFAULT_AI_MODEL = 'claude-sonnet-5'

/** Output cap for the rubric reply — a small JSON envelope needs little room. */
const MAX_TOKENS = 2048

/**
 * The injected message-create boundary. Given the API key and a Messages
 * request, it returns Claude's reply. The default builds a per-call client from
 * the key; tests inject a stub so no network (and no real key) is involved.
 *
 * The key is a *separate* argument — never part of `params` — so it stays out of
 * anything that could be logged or echoed.
 */
export type AnthropicMessageCreate = (
  apiKey: string,
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>

/** Default boundary: construct a client from the key and call the real API. */
const defaultCreateMessage: AnthropicMessageCreate = (apiKey, params) =>
  new Anthropic({ apiKey }).messages.create(params)

/**
 * The English rubric system prompt. Tone: a concise, professional landing-page
 * quality reviewer that writes plain English and returns *only* the JSON envelope
 * — no prose, no code fences. The three axes and their point ceilings match
 * {@link LLM_AXIS_MAX_SCORES}.
 */
export const RUBRIC_SYSTEM_PROMPT = [
  'You are an expert who evaluates landing-page quality.',
  'Based on the provided page text and screenshots (when available), evaluate the three axes below.',
  '',
  'Evaluation axes and maximum scores:',
  `- visual: out of ${LLM_AXIS_MAX_SCORES.visual} points. Evaluate layout, spacing, typography, and visual hierarchy.`,
  `- copy: out of ${LLM_AXIS_MAX_SCORES.copy} points. Evaluate the clarity and persuasiveness of the headline, value proposition, and wording.`,
  `- cta: out of ${LLM_AXIS_MAX_SCORES.cta} points. Evaluate the clarity, prominence, and repeated placement of the call-to-action.`,
  '',
  "Each axis's score is an integer between 0 and its maximum, inclusive.",
  'comment is a one-sentence evaluation in English, and suggestions is an array of English improvement-suggestion strings.',
  '',
  'Output exactly one JSON object in the format below. Do not add code fences or any other explanatory text.',
  '{"axes":[' +
    '{"id":"visual","score":0,"comment":"","suggestions":[]},' +
    '{"id":"copy","score":0,"comment":"","suggestions":[]},' +
    '{"id":"cta","score":0,"comment":"","suggestions":[]}]}',
].join('\n')

/** Splits a `data:` URL into its media type and base64 payload, or `null`. */
function parseDataUrl(
  dataUrl: string,
): { mediaType: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const mediaType = match[1]
  const data = match[2]
  if (!data) return null
  return { mediaType, data }
}

/** Anthropic image media types accepted for screenshot blocks. */
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const IMAGE_MEDIA_TYPES: readonly ImageMediaType[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]

/** Builds an image content block for a screenshot, skipping unusable ones. */
function screenshotBlock(
  shot: Screenshot,
): Anthropic.ImageBlockParam | null {
  const parsed = parseDataUrl(shot.dataUrl)
  if (!parsed) return null
  if (!IMAGE_MEDIA_TYPES.includes(parsed.mediaType as ImageMediaType)) {
    return null
  }
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: parsed.mediaType as ImageMediaType,
      data: parsed.data,
    },
  }
}

/**
 * Assembles the user message: screenshots first, then the page-text prompt. When
 * `includeScreenshots` is `false` (the selected model is non-vision-capable) the
 * image blocks are skipped entirely and the rubric is evaluated on the page text
 * alone.
 */
function buildUserContent(
  input: AiEvaluatorInput,
  includeScreenshots: boolean,
): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = []
  if (includeScreenshots) {
    for (const shot of input.screenshots ?? []) {
      const block = screenshotBlock(shot)
      if (block) {
        blocks.push({
          type: 'text',
          text: `The following is a screenshot of the ${shot.viewport === 'mobile' ? 'mobile' : 'desktop'} view.`,
        })
        blocks.push(block)
      }
    }
  }
  blocks.push({
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
  return blocks
}

/** Resolves the effective model id for this input (the override, else the default). */
function resolveModel(input: AiEvaluatorInput): string {
  return typeof input.model === 'string' && input.model.trim() !== ''
    ? input.model
    : DEFAULT_AI_MODEL
}

/** Builds the non-streaming Messages request for this input. */
function buildRequest(
  input: AiEvaluatorInput,
  model: string,
  includeScreenshots: boolean,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: RUBRIC_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildUserContent(input, includeScreenshots) },
    ],
  }
}

/** Concatenates the text blocks of a Claude reply. */
function replyText(message: Anthropic.Message): string {
  return message.content
    .filter(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    )
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/** Strips a leading/trailing markdown code fence if the model added one. */
function stripCodeFence(text: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim())
  return fenced ? fenced[1].trim() : text.trim()
}

/** Coerces an unknown to a finite integer within `[0, max]`, or `null`. */
function clampScore(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < 0) return 0
  if (rounded > max) return max
  return rounded
}

/** Coerces an unknown to an array of non-empty trimmed strings. */
function toSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/**
 * Parses and validates a rubric reply into the three {@link LlmAxis} entries, in
 * canonical order. Returns `null` on any structural problem (not JSON, missing
 * axis, non-numeric score) so the caller can retry / degrade to `parse-failure`.
 */
export function parseRubricAxes(text: string): LlmAxis[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(text))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const rawAxes = (parsed as { axes?: unknown }).axes
  if (!Array.isArray(rawAxes)) return null

  const byId = new Map<LlmAxisId, Record<string, unknown>>()
  for (const entry of rawAxes) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const id = record.id
    if (
      typeof id === 'string' &&
      (LLM_AXIS_IDS as readonly string[]).includes(id)
    ) {
      byId.set(id as LlmAxisId, record)
    }
  }

  const axes: LlmAxis[] = []
  for (const id of LLM_AXIS_IDS) {
    const record = byId.get(id)
    if (!record) return null
    const maxScore = LLM_AXIS_MAX_SCORES[id]
    const score = clampScore(record.score, maxScore)
    if (score === null) return null
    axes.push({
      id,
      label: LLM_AXIS_LABELS[id],
      score,
      maxScore,
      comment: typeof record.comment === 'string' ? record.comment.trim() : '',
      suggestions: toSuggestions(record.suggestions),
    })
  }
  return axes
}

/**
 * Maps a thrown Claude error to the failure fields of an {@link AiFailure} —
 * a typed reason, the provider status code, and a **key-masked** summary. The
 * Anthropic SDK's `APIError` exposes a numeric `status` and a `message`, which
 * {@link toProviderErrorInfo} reads and {@link classifyProviderFailure}
 * classifies (401/403 → invalid-key, 404 / no-model-access → model-error,
 * 400 image-unsupported → vision-unsupported, other 400 → request-error,
 * 5xx → provider-error, 429 → rate-limit, timeout/network → ai-network).
 * `apiKey` is used only to redact the summary — it is never stored or returned.
 */
function mapError(error: unknown, apiKey: string): Omit<AiFailure, 'ok'> {
  return classifyProviderFailure(toProviderErrorInfo(error), apiKey)
}

/**
 * Creates a real {@link AiEvaluator} backed by Claude. `createMessage` is
 * injected so tests supply a stub; production uses {@link defaultCreateMessage}.
 */
export function createClaudeAiEvaluator(
  createMessage: AnthropicMessageCreate = defaultCreateMessage,
): AiEvaluator {
  return async (input: AiEvaluatorInput): Promise<AiEvaluation> => {
    if (!hasApiKey(input.apiKey)) {
      return { ok: false, reason: 'missing-key' }
    }
    const apiKey = input.apiKey as string
    const model = resolveModel(input)
    // Proactively skip screenshots when the model can't accept images; the
    // reactive `vision-unsupported` classification remains as the fallback.
    const supportsVision = modelSupportsVision(model)
    const screenshotsOmitted =
      !supportsVision && (input.screenshots?.length ?? 0) > 0
    const request = buildRequest(input, model, supportsVision)
    try {
      // One initial attempt, then exactly one retry on a parse failure only.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const message = await createMessage(apiKey, request)
        const axes = parseRubricAxes(replyText(message))
        if (axes) {
          const success: AiSuccess = {
            ok: true,
            axes,
            llmScore: sumAxisScores(axes),
          }
          if (screenshotsOmitted) success.screenshotsOmitted = true
          return success
        }
      }
      return { ok: false, reason: 'parse-failure' }
    } catch (error) {
      return { ok: false, ...mapError(error, apiKey) }
    }
  }
}
