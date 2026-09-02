/**
 * End-to-end LOCK for the four AI-failure causes the story turns on.
 *
 * The reproduction bug was that *every* AI failure collapsed to "an API key
 * error occurred", hiding the real cause (wrong model id, no model access,
 * vision-unsupported model, …). The taxonomy that fixes this is unit-tested per
 * layer already (`classifyAiError`, `claude-evaluator`, `analysis-copy`,
 * `analysis-pipeline`, `app`). This file is the *integration* proof that the four
 * distinct provider failures survive intact all the way from a thrown Anthropic
 * SDK error, through the real {@link createClaudeAiEvaluator} classifier, through
 * the pipeline, into the `done-partial` report a user actually sees:
 *
 *  1. wrong / invalid key      → 401 → `invalid-key`
 *  2. non-existent model id     → 404 → `model-error`
 *  3. model with no access      → 403 "no access to model" → `model-error`
 *  4. vision-unsupported model  → 400 image block rejected → `vision-unsupported`
 *
 * Distinctness note (design, not a defect): the *reason code* taxonomy maps both
 * "non-existent model" (404) and "no model access" (403) to the single
 * `model-error` reason — a deliberate merge made by the mapping-owning grain, so
 * their report copy is identical. They stay **user-distinguishable** through the
 * two other required signals the story mandates: the visible
 * `partialStatusCode` (404 vs 403) and the key-masked `partialSummary` (provider
 * message). So across all four scenarios the (reason-copy, statusCode) pair is
 * unique, and every one exposes a status code in the report — which is exactly
 * what the completion condition ("실패 상세에 프로바이더 상태코드가 보인다") asks for.
 *
 * And the key-hygiene lock: when the provider echoes the raw API key inside its
 * error message, the key must appear in *no* user- or operator-visible surface —
 * not the report's `partialSummary` / `partialReason` / `partialDetail`, not the
 * NDJSON response body, and not any server log line.
 */
import Anthropic from '@anthropic-ai/sdk'
import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createClaudeAiEvaluator, type AnthropicMessageCreate } from './claude-evaluator'
import { runAnalysis } from './analysis-pipeline'
import { createApp, type CreateAppOptions } from './app'
import { parseEvent, type StageEvent } from './stage-events'
import type { LoadFetch } from './load-stage'
import type { AiFailureReason } from './analysis-copy'
import { partialReasonMessage } from './analysis-copy'
import type { AnalysisReport } from '../core/report'

/** A public IPv4 literal — the SSRF guard allows it with no DNS lookup. */
const PUBLIC_URL = 'https://93.184.216.34/'

/** A fetch that always returns a minimal 2xx HTML page. */
const okFetch: LoadFetch = async () => ({
  ok: true,
  status: 200,
  text: async () => '<!doctype html><html lang="en"><head><title>x</title></head><body><h1>Hi</h1></body></html>',
})

/** Runs the full pipeline with a Claude evaluator whose SDK call always throws `error`. */
async function partialReportFor(
  error: unknown,
  apiKey = 'sk-ant-valid-user-key-000',
): Promise<AnalysisReport> {
  const create: AnthropicMessageCreate = async () => {
    throw error
  }
  const evaluateAi = createClaudeAiEvaluator(create)
  let last: StageEvent | undefined
  for await (const event of runAnalysis(
    { url: PUBLIC_URL, apiKey, provider: 'anthropic', model: 'claude-opus-5' },
    { load: { fetchImpl: okFetch, guardOptions: { allowPrivateNetwork: true } }, evaluateAi },
  )) {
    last = event
  }
  expect(last?.type).toBe('result')
  const report = (last as { type: 'result'; result: AnalysisReport }).result
  expect(report.outcome).toBe('done-partial')
  return report
}

/** The four story scenarios, each as the Anthropic SDK error the provider would throw. */
const SCENARIOS = {
  invalidKey: {
    label: 'wrong / invalid key (401)',
    error: new Anthropic.AuthenticationError(401, { error: { message: 'invalid x-api-key' } }, 'invalid x-api-key', new Headers()),
    reason: 'invalid-key' as AiFailureReason,
    status: 401,
  },
  modelNotFound: {
    label: 'non-existent model id (404)',
    error: new Anthropic.NotFoundError(404, { error: { message: 'model: claude-nonexistent not found' } }, 'model claude-nonexistent not found', new Headers()),
    reason: 'model-error' as AiFailureReason,
    status: 404,
  },
  noAccess: {
    label: 'no access to model (403)',
    error: new Anthropic.PermissionDeniedError(403, { error: { message: 'Your API key does not have access to model claude-opus-5' } }, 'You do not have access to model claude-opus-5', new Headers()),
    reason: 'model-error' as AiFailureReason,
    status: 403,
  },
  visionUnsupported: {
    label: 'vision-unsupported model (400 image block)',
    error: new Anthropic.BadRequestError(400, { error: { message: 'messages.0.content.1.image: this model does not support image input' } }, 'this model does not support image input', new Headers()),
    reason: 'vision-unsupported' as AiFailureReason,
    status: 400,
  },
} as const

describe('four-cause distinctness — end to end through the real classifier into the report', () => {
  it.each(Object.values(SCENARIOS))(
    'maps $label to reason $reason with the provider status code visible on the report',
    async ({ error, reason, status }) => {
      const report = await partialReportFor(error)
      // Reason copy matches the taxonomy's confirmed line for this reason…
      expect(report.partialReason).toBe(partialReasonMessage(reason))
      // …it is NOT the blanket "API key error" line unless the cause really is a key.
      if (reason !== 'invalid-key') {
        expect(report.partialReason).not.toContain('an API key error occurred')
      }
      // The provider status code is threaded onto the report (the "실패 상세" signal).
      expect(report.partialStatusCode).toBe(status)
      // A masked summary carrying the status is present for the details disclosure.
      expect(report.partialSummary).toContain(String(status))
      // Actionable detail is present and distinct from the terse reason line.
      expect(report.partialDetail).toBeDefined()
      expect(report.partialDetail).not.toBe(report.partialReason)
    },
  )

  it('yields four mutually distinguishable outcomes (reason-copy + status code)', async () => {
    const reports = await Promise.all(
      Object.values(SCENARIOS).map((s) => partialReportFor(s.error)),
    )
    // Every scenario exposes a status code — none is a status-less blur.
    for (const report of reports) {
      expect(report.partialStatusCode).toBeDefined()
    }
    // The (reason copy, status code) pair is unique across all four, so a user can
    // always tell which of the four situations occurred — even the two that share
    // the `model-error` reason (distinguished by 404 vs 403).
    const signatures = reports.map((r) => `${r.partialReason}|${r.partialStatusCode}`)
    expect(new Set(signatures).size).toBe(4)
  })

  it('gives invalid-key, model-error and vision-unsupported three distinct reason lines', async () => {
    const [invalid, model, vision] = await Promise.all([
      partialReportFor(SCENARIOS.invalidKey.error),
      partialReportFor(SCENARIOS.modelNotFound.error),
      partialReportFor(SCENARIOS.visionUnsupported.error),
    ])
    const lines = [invalid.partialReason, model.partialReason, vision.partialReason]
    expect(new Set(lines).size).toBe(3)
    expect(model.partialReason).toContain('the selected model could not be used')
    expect(vision.partialReason).toContain('does not support image input')
  })

  it('distinguishes non-existent-model (404) from no-access (403) by status code and summary', async () => {
    const notFound = await partialReportFor(SCENARIOS.modelNotFound.error)
    const noAccess = await partialReportFor(SCENARIOS.noAccess.error)
    // Same reason code + copy by design (the deliberate model-error merge)…
    expect(notFound.partialReason).toBe(noAccess.partialReason)
    // …but the visible status code and the provider summary tell them apart.
    expect(notFound.partialStatusCode).toBe(404)
    expect(noAccess.partialStatusCode).toBe(403)
    expect(notFound.partialSummary).not.toBe(noAccess.partialSummary)
    expect(noAccess.partialSummary).toContain('access')
  })
})

let servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  )
  servers = []
})

/** Boots the app on an ephemeral loopback port and returns its base URL. */
function boot(options: CreateAppOptions): string {
  const app = createApp(options)
  const server = app.listen(0)
  servers.push(server)
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

describe('key-hygiene lock — a provider that echoes the raw key leaks it nowhere', () => {
  it('keeps the raw key out of the report, the NDJSON body, and every server log line', async () => {
    const secret = 'sk-ant-super-secret-user-key-abcdef123456'
    const lines: string[] = []
    const logger = {
      log: (...args: unknown[]) => lines.push(args.join(' ')),
      error: (...args: unknown[]) => lines.push(args.join(' ')),
    }
    // The provider rejects auth AND echoes the raw key inside its error message —
    // the worst case for a leak. The real evaluator must mask it before it can
    // reach any surface.
    const leakyCreate: AnthropicMessageCreate = async () => {
      throw new Anthropic.AuthenticationError(
        401,
        { error: { message: `authentication failed for key ${secret}` } },
        `authentication failed for key ${secret}`,
        new Headers(),
      )
    }
    const base = boot({
      logger,
      deps: {
        load: { fetchImpl: okFetch, guardOptions: { allowPrivateNetwork: true } },
        evaluateAi: createClaudeAiEvaluator(leakyCreate),
      },
    })

    const res = await fetch(`${base}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: PUBLIC_URL, apiKey: secret, provider: 'anthropic', model: 'claude-opus-5' }),
    })
    const body = await res.text()

    // The report still surfaces the *cause* (401 → invalid-key) with its status…
    const events = body
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map(parseEvent)
    const result = events.at(-1)
    expect(result?.type).toBe('result')
    const report = (result as { type: 'result'; result: AnalysisReport }).result
    expect(report.outcome).toBe('done-partial')
    expect(report.partialStatusCode).toBe(401)
    expect(report.partialReason).toBe(partialReasonMessage('invalid-key'))

    // …but the raw key appears on NO partial field, in the whole body, or any log.
    expect(report.partialSummary ?? '').not.toContain(secret)
    expect(report.partialReason).not.toContain(secret)
    expect(report.partialDetail ?? '').not.toContain(secret)
    expect(body).not.toContain(secret)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line).not.toContain(secret)
    }
  })
})
