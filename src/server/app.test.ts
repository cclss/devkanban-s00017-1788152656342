/**
 * HTTP-edge tests for `POST /api/analyze` and static serving.
 *
 * The app is booted on an ephemeral loopback port (`listen(0)`) and driven with
 * the real `fetch`, so this exercises the actual Express wiring — request
 * parsing, NDJSON streaming, headers, status codes — end to end, yet stays
 * network-free: every pipeline boundary (fetch, SSRF DNS resolver, AI evaluator)
 * is injected, so no real outbound request is ever made. The client's own
 * connection is to the test server on loopback, which the SSRF guard does not
 * touch (it only classifies the *target* URL in the request body).
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp, type CreateAppOptions } from './app'
import { parseEvent, type StageEvent } from './stage-events'
import type { LoadFetch, LoadFetchResponse } from './load-stage'
import type { AiEvaluator } from './ai-stage'
import { LLM_AXIS_IDS } from '../core/report'

/** A fetch stub returning fixed HTML with a 200 status (no real network). */
function okFetch(html: string): LoadFetch {
  const response: LoadFetchResponse = {
    ok: true,
    status: 200,
    text: async () => html,
  }
  return async () => response
}

/** An AI evaluator stub returning three full-score axes (drives a `done` report). */
const winningEvaluator: AiEvaluator = async () => ({
  ok: true,
  llmScore: 40,
  axes: LLM_AXIS_IDS.map((id) => ({
    id,
    label: id,
    score: 13,
    maxScore: 14,
    comment: 'Good',
    suggestions: ['Improve'],
  })),
})

/** Resolver that maps any host to a single public IP (bypasses real DNS). */
const publicResolver = async () => ['93.184.216.34']

let servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  )
  servers = []
})

/** Boots the app on an ephemeral port and returns its base URL. */
function boot(options: CreateAppOptions): string {
  const app = createApp(options)
  const server = app.listen(0)
  servers.push(server)
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

/** POSTs a JSON body to `/api/analyze` and returns the raw response. */
async function analyze(base: string, body: unknown): Promise<Response> {
  return fetch(`${base}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Splits an NDJSON body into parsed stage events. */
function readEvents(text: string): StageEvent[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(parseEvent)
}

describe('POST /api/analyze', () => {
  it('streams the full load→audit→ai→done NDJSON sequence for a public URL', async () => {
    const base = boot({
      deps: {
        load: {
          fetchImpl: okFetch('<html><head><title>Hi</title></head><body>ok</body></html>'),
          guardOptions: { resolver: publicResolver },
        },
        evaluateAi: winningEvaluator,
      },
    })

    const res = await analyze(base, { url: 'https://example.com', apiKey: 'k' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')

    const events = readEvents(await res.text())
    const stages = events
      .filter((e): e is Extract<StageEvent, { type: 'stage' }> => e.type === 'stage')
      .map((e) => e.stage)
    expect(stages).toEqual(['load', 'audit', 'ai', 'done'])

    const result = events.at(-1)
    expect(result?.type).toBe('result')
    if (result?.type === 'result') {
      expect(result.result.outcome).toBe('done')
    }
  })

  it('streams load→audit→ai→done-partial via the default evaluator when the key is absent', async () => {
    // No `evaluateAi` injected: the app falls back to the real Claude evaluator,
    // which short-circuits to `missing-key` (no network) when no key is sent, so
    // the run still streams a clean `done-partial`.
    const base = boot({
      deps: {
        load: {
          fetchImpl: okFetch('<html><head><title>Hi</title></head><body>ok</body></html>'),
          guardOptions: { resolver: publicResolver },
        },
      },
    })

    const res = await analyze(base, { url: 'https://example.com' })
    expect(res.status).toBe(200)

    const events = readEvents(await res.text())
    const stages = events
      .filter((e): e is Extract<StageEvent, { type: 'stage' }> => e.type === 'stage')
      .map((e) => e.stage)
    expect(stages).toEqual(['load', 'audit', 'ai', 'done-partial'])

    const result = events.at(-1)
    expect(result?.type).toBe('result')
    if (result?.type === 'result') {
      expect(result.result.outcome).toBe('done-partial')
    }
  })

  it('emits error-load and no audit/ai stage for an SSRF (loopback) target', async () => {
    const base = boot({
      deps: { load: { guardOptions: { resolver: publicResolver } } },
    })

    const res = await analyze(base, { url: 'http://127.0.0.1:3000' })
    expect(res.status).toBe(200)

    const events = readEvents(await res.text())
    const stages = events
      .filter((e): e is Extract<StageEvent, { type: 'stage' }> => e.type === 'stage')
      .map((e) => e.stage)
    expect(stages).toEqual(['load', 'error-load'])
    expect(stages).not.toContain('audit')

    const result = events.at(-1)
    if (result?.type === 'result') {
      expect(result.result.outcome).toBe('error-load')
    }
  })

  it('emits error-load for a non-http(s) / unparseable URL', async () => {
    const base = boot({})

    const res = await analyze(base, { url: 'ftp://example.com/thing' })
    const events = readEvents(await res.text())
    const stages = events
      .filter((e): e is Extract<StageEvent, { type: 'stage' }> => e.type === 'stage')
      .map((e) => e.stage)
    expect(stages).toEqual(['load', 'error-load'])
  })

  it('rejects a request with no url as 400 without streaming', async () => {
    const base = boot({})
    const res = await analyze(base, { apiKey: 'k' })
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toMatch(/url/)
  })

  it('never writes the API key to any log line, even on failure', async () => {
    const secret = 'sk-super-secret-key-should-never-appear-12345'
    const lines: string[] = []
    const logger = {
      log: (...args: unknown[]) => lines.push(args.join(' ')),
      error: (...args: unknown[]) => lines.push(args.join(' ')),
    }
    // An evaluator that throws — the AI stage must contain it, and the edge must
    // not log the request body (which carries the key) on the error path.
    const throwingEvaluator: AiEvaluator = async () => {
      throw new Error('boom from evaluator')
    }
    const base = boot({
      logger,
      deps: {
        load: {
          fetchImpl: okFetch('<html><body>ok</body></html>'),
          guardOptions: { resolver: publicResolver },
        },
        evaluateAi: throwingEvaluator,
      },
    })

    await analyze(base, { url: 'https://example.com', apiKey: secret })

    expect(lines.length).toBeGreaterThan(0) // the request line was logged
    for (const line of lines) {
      expect(line).not.toContain(secret)
    }
  })
})
