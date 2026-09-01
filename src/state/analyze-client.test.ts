/**
 * Tests for the streaming analyze client {@link postAnalyze}.
 *
 * Covers the grain Done-when at the transport layer, all with a mocked
 * streaming `Response` and injected `fetch` (no network):
 * - ordered `stage` dispatch then the terminal `result`;
 * - a `done` result is delivered as an analysis report;
 * - an `error-load` result flows through `onResult` like any terminal;
 * - the API key rides the request **body**, never the URL;
 * - transport failures (non-OK, truncated stream, rejected fetch) never leave
 *   the caller hanging — they surface a synthetic `error-load` report.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  ANALYZE_ENDPOINT,
  TRANSPORT_ERROR_MESSAGE,
  postAnalyze,
  type AnalyzeHandlers,
  type FetchLike,
} from './analyze-client'
import {
  resultEvent,
  serializeEvent,
  stageEvent,
} from '../server/stage-events'
import type { AnalysisReport, ReportResult } from '../core/report'
import type { Stage } from './stage'

const doneReport: AnalysisReport = {
  outcome: 'done',
  url: 'https://example.com',
  analyzedAt: '2026-08-31T00:00:00.000Z',
  score: {
    total: 82,
    max: 100,
    grade: 'good',
    auditScore: 50,
    auditMax: 60,
    llmScore: 32,
    llmMax: 40,
  },
  categories: [],
  llmAxes: [],
  screenshots: [],
}

/** Builds a mock `fetch` that streams `wire` back as a single 200 body chunk. */
function fetchStreaming(wire: string, ok = true): FetchLike {
  return vi.fn(async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire))
        controller.close()
      },
    })
    return { ok, body } as unknown as Response
  })
}

/** A recording handler pair. */
function recorder(): {
  handlers: AnalyzeHandlers
  stages: Stage[]
  results: ReportResult[]
} {
  const stages: Stage[] = []
  const results: ReportResult[] = []
  return {
    stages,
    results,
    handlers: {
      onStage: (s) => stages.push(s),
      onResult: (r) => results.push(r),
    },
  }
}

describe('postAnalyze — happy path', () => {
  const wire =
    serializeEvent(stageEvent('load')) +
    serializeEvent(stageEvent('audit')) +
    serializeEvent(stageEvent('ai')) +
    serializeEvent(stageEvent('done')) +
    serializeEvent(resultEvent(doneReport))

  it('dispatches stage events in order, then the terminal result', async () => {
    const { handlers, stages, results } = recorder()
    await postAnalyze({ url: 'https://example.com' }, handlers, fetchStreaming(wire))

    expect(stages).toEqual(['load', 'audit', 'ai', 'done'])
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(doneReport)
  })

  it('sends the API key in the request body and never in the URL', async () => {
    const fetchImpl = fetchStreaming(wire)
    const { handlers } = recorder()
    await postAnalyze(
      { url: 'https://example.com', apiKey: 'sk-secret-123', provider: 'anthropic', model: 'claude-sonnet-5' },
      handlers,
      fetchImpl,
    )

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    // Endpoint is the fixed path — no key, no query string.
    expect(calledUrl).toBe(ANALYZE_ENDPOINT)
    expect(String(calledUrl)).not.toContain('sk-secret-123')
    // The key lives in the JSON body instead.
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      url: 'https://example.com',
      apiKey: 'sk-secret-123',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
    })
  })
})

describe('postAnalyze — terminal outcomes', () => {
  it('delivers a server error-load result through onResult', async () => {
    const errorReport: ReportResult = {
      outcome: 'error-load',
      url: 'https://10.0.0.1',
      message: 'Failed to load the page: Private network addresses are blocked.',
    }
    const wire =
      serializeEvent(stageEvent('load')) +
      serializeEvent(stageEvent('error-load')) +
      serializeEvent(resultEvent(errorReport))
    const { handlers, stages, results } = recorder()

    await postAnalyze({ url: 'https://10.0.0.1' }, handlers, fetchStreaming(wire))

    expect(stages).toEqual(['load', 'error-load'])
    expect(results[0]).toEqual(errorReport)
  })
})

describe('postAnalyze — transport failures', () => {
  it('surfaces a non-OK response as a synthetic error-load report', async () => {
    const { handlers, stages, results } = recorder()
    await postAnalyze(
      { url: 'https://example.com' },
      handlers,
      fetchStreaming('', false),
    )

    expect(stages).toEqual([])
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      outcome: 'error-load',
      url: 'https://example.com',
      message: TRANSPORT_ERROR_MESSAGE,
    })
  })

  it('surfaces a stream that closes without a result as error-load', async () => {
    const wire =
      serializeEvent(stageEvent('load')) + serializeEvent(stageEvent('audit'))
    const { handlers, results } = recorder()

    await postAnalyze({ url: 'https://example.com' }, handlers, fetchStreaming(wire))

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ outcome: 'error-load', message: TRANSPORT_ERROR_MESSAGE })
  })

  it('surfaces a rejected fetch as error-load and never throws', async () => {
    const rejecting: FetchLike = vi.fn(async () => {
      throw new Error('connection refused')
    })
    const { handlers, results } = recorder()

    await expect(
      postAnalyze({ url: 'https://example.com' }, handlers, rejecting),
    ).resolves.toBeUndefined()
    expect(results[0]).toMatchObject({ outcome: 'error-load', message: TRANSPORT_ERROR_MESSAGE })
  })
})
