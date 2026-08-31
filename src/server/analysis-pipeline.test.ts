import { describe, expect, it, vi } from 'vitest'
import {
  runAnalysis,
  streamAnalysis,
  gradeForTotal,
  type AnalysisDeps,
  type AnalysisRequest,
} from './analysis-pipeline'
import { parseEvent, type StageEvent } from './stage-events'
import type { AiEvaluator } from './ai-stage'
import type { LoadFetch } from './load-stage'
import {
  AUDIT_MAX_SCORE,
  TOTAL_MAX_SCORE,
  type AnalysisReport,
  type LlmAxis,
  type LoadErrorReport,
} from '../core/report'

/**
 * The pipeline is the load→audit→ai→done runner behind `POST /api/analyze`.
 * These tests pin the grain Done-when: the happy-path event *order*, and both
 * failure branches (load → `error-load`, ai → `done-partial`) — all with mocked
 * fetch and an injected AI evaluator, so no real network is touched. Korean
 * load-error / partial copy is asserted against the confirmed report strings.
 */

const HTML = `<!doctype html><html lang="ko"><head>
  <title>랜딩 페이지</title>
  <meta name="description" content="설명">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head><body><h1>안녕하세요</h1></body></html>`

/** A public IPv4 literal — the SSRF guard allows it with no DNS needed. */
const PUBLIC_URL = 'https://93.184.216.34/'

/** A fetch that always returns a 2xx HTML response. */
function okFetch(html = HTML): LoadFetch {
  return async () => ({ ok: true, status: 200, text: async () => html })
}

/** Three well-formed rubric axes summing to 30/40. */
const AXES: LlmAxis[] = [
  { id: 'visual', label: '비주얼', score: 12, maxScore: 15, comment: '좋음', suggestions: [] },
  { id: 'copy', label: '카피', score: 10, maxScore: 15, comment: '보통', suggestions: [] },
  { id: 'cta', label: 'CTA', score: 8, maxScore: 10, comment: '개선 필요', suggestions: ['버튼 강조'] },
]

/** An evaluator that always succeeds with {@link AXES}. */
const successEvaluator: AiEvaluator = async () => ({ ok: true, axes: AXES, llmScore: 30 })

/** Collects every event the generator yields, in order. */
async function collect(
  deps: AnalysisDeps,
  request: AnalysisRequest = { url: PUBLIC_URL, apiKey: 'sk-test' },
) {
  const events: StageEvent[] = []
  for await (const event of runAnalysis(request, deps)) {
    events.push(event)
  }
  return events
}

/** The ordered list of `stage` values from an event stream. */
function stages(events: StageEvent[]): string[] {
  return events.filter((e) => e.type === 'stage').map((e) => (e as { stage: string }).stage)
}

/** The single terminal result payload. */
function resultOf(events: StageEvent[]) {
  const last = events.at(-1)
  expect(last?.type).toBe('result')
  return (last as { type: 'result'; result: AnalysisReport | LoadErrorReport }).result
}

describe('runAnalysis — happy path', () => {
  it('emits load → audit → ai → done in order, then one result', async () => {
    const fetchImpl = okFetch()
    const events = await collect({
      load: { fetchImpl, guardOptions: { allowPrivateNetwork: true } },
      evaluateAi: successEvaluator,
    })

    expect(stages(events)).toEqual(['load', 'audit', 'ai', 'done'])
    expect(events.filter((e) => e.type === 'result')).toHaveLength(1)
    expect(events.at(-1)?.type).toBe('result')
  })

  it('builds a full 100-scale report combining audit + AI scores', async () => {
    const events = await collect({
      load: { fetchImpl: okFetch(), guardOptions: { allowPrivateNetwork: true } },
      evaluateAi: successEvaluator,
      now: () => new Date('2026-08-31T09:00:00.000Z'),
    })
    const report = resultOf(events) as AnalysisReport

    expect(report.outcome).toBe('done')
    expect(report.url).toBe(PUBLIC_URL)
    expect(report.analyzedAt).toBe('2026-08-31T09:00:00.000Z')
    expect(report.score.max).toBe(TOTAL_MAX_SCORE)
    expect(report.score.llmScore).toBe(30)
    expect(report.score.total).toBe(report.score.auditScore + 30)
    expect(report.llmAxes).toEqual(AXES)
    expect(report.categories).toHaveLength(5)
    expect(report.partialReason).toBeUndefined()
  })

  it('passes the fetched HTML to the AI evaluator', async () => {
    const spy = vi.fn<AiEvaluator>(async () => ({ ok: true, axes: AXES, llmScore: 30 }))
    await collect({
      load: { fetchImpl: okFetch('<html lang="ko"><title>x</title></html>'), guardOptions: { allowPrivateNetwork: true } },
      evaluateAi: spy,
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].html).toContain('<title>x</title>')
    expect(spy.mock.calls[0][0].apiKey).toBe('sk-test')
  })
})

describe('runAnalysis — load failure → error-load', () => {
  it('blocks a private target via the SSRF guard without fetching', async () => {
    const fetchImpl = vi.fn<LoadFetch>()
    const events = await collect(
      { load: { fetchImpl } },
      { url: 'http://127.0.0.1:3000/', apiKey: 'sk-test' },
    )

    expect(stages(events)).toEqual(['load', 'error-load'])
    expect(fetchImpl).not.toHaveBeenCalled()
    const report = resultOf(events) as LoadErrorReport
    expect(report.outcome).toBe('error-load')
    expect(report.message).toBe('페이지를 불러오지 못했습니다: 사설 네트워크 주소는 차단됩니다.')
  })

  it('maps a network error to the connection-failure message', async () => {
    const fetchImpl: LoadFetch = async () => {
      throw new Error('ECONNREFUSED')
    }
    const events = await collect({
      load: { fetchImpl, guardOptions: { allowPrivateNetwork: true } },
    })

    expect(stages(events)).toEqual(['load', 'error-load'])
    const report = resultOf(events) as LoadErrorReport
    expect(report.message).toBe('페이지를 불러오지 못했습니다: 페이지에 연결할 수 없습니다.')
    expect(report.statusCode).toBeUndefined()
  })

  it('includes the status code for a non-2xx response', async () => {
    const fetchImpl: LoadFetch = async () => ({ ok: false, status: 503, text: async () => '' })
    const events = await collect({
      load: { fetchImpl, guardOptions: { allowPrivateNetwork: true } },
    })

    const report = resultOf(events) as LoadErrorReport
    expect(report.statusCode).toBe(503)
    expect(report.message).toContain('(503)')
  })

  it('does not run the audit or AI stages after a load failure', async () => {
    const evaluateAi = vi.fn<AiEvaluator>(async () => ({ ok: true, axes: AXES, llmScore: 30 }))
    const events = await collect(
      { evaluateAi },
      { url: 'http://localhost/', apiKey: 'sk-test' },
    )
    expect(stages(events)).not.toContain('audit')
    expect(evaluateAi).not.toHaveBeenCalled()
  })
})

describe('runAnalysis — AI failure → done-partial', () => {
  it('routes a missing key to a 60-point partial report', async () => {
    const events = await collect(
      { load: { fetchImpl: okFetch(), guardOptions: { allowPrivateNetwork: true } } },
      { url: PUBLIC_URL }, // no apiKey
    )

    expect(stages(events)).toEqual(['load', 'audit', 'ai', 'done-partial'])
    const report = resultOf(events) as AnalysisReport
    expect(report.outcome).toBe('done-partial')
    expect(report.score.max).toBe(AUDIT_MAX_SCORE)
    expect(report.score.grade).toBe('pending')
    expect(report.score.llmScore).toBeNull()
    expect(report.llmAxes).toBeNull()
    expect(report.partialReason).toBe(
      'AI 평가 결과 없음: API 키가 없어 자동 점검 결과만 표시합니다.',
    )
  })

  it('routes an invalid key to the confirmed key-error partial copy', async () => {
    // The default evaluator rejects any present key (real call not wired yet).
    const events = await collect({
      load: { fetchImpl: okFetch(), guardOptions: { allowPrivateNetwork: true } },
    })
    const report = resultOf(events) as AnalysisReport
    expect(report.outcome).toBe('done-partial')
    expect(report.partialReason).toBe(
      'AI 평가 결과 없음: API 키 오류로 자동 점검 결과만 표시합니다.',
    )
  })

  it('degrades to partial when the evaluator throws', async () => {
    const throwingEvaluator: AiEvaluator = async () => {
      throw new Error('boom')
    }
    const events = await collect({
      load: { fetchImpl: okFetch(), guardOptions: { allowPrivateNetwork: true } },
      evaluateAi: throwingEvaluator,
    })
    const report = resultOf(events) as AnalysisReport
    expect(report.outcome).toBe('done-partial')
    expect(report.partialReason).toContain('API 키 오류로')
  })

  it('routes a rate-limit failure to its own partial copy', async () => {
    const rateLimited: AiEvaluator = async () => ({ ok: false, reason: 'rate-limit' })
    const events = await collect({
      load: { fetchImpl: okFetch(), guardOptions: { allowPrivateNetwork: true } },
      evaluateAi: rateLimited,
    })
    const report = resultOf(events) as AnalysisReport
    expect(report.partialReason).toBe(
      'AI 평가 결과 없음: API 사용 한도를 초과하여 자동 점검 결과만 표시합니다.',
    )
  })
})

describe('streamAnalysis', () => {
  it('serialises each event as a parseable NDJSON line in order', async () => {
    const lines: string[] = []
    await streamAnalysis(
      { url: PUBLIC_URL, apiKey: 'sk-test' },
      (line) => lines.push(line),
      {
        load: { fetchImpl: okFetch(), guardOptions: { allowPrivateNetwork: true } },
        evaluateAi: successEvaluator,
      },
    )

    expect(lines.every((line) => line.endsWith('\n'))).toBe(true)
    const events = lines.map(parseEvent)
    expect(stages(events)).toEqual(['load', 'audit', 'ai', 'done'])
    expect(events.at(-1)?.type).toBe('result')
  })
})

describe('gradeForTotal', () => {
  it('maps a 100-scale total to the four grade tiers', () => {
    expect(gradeForTotal(95)).toBe('excellent')
    expect(gradeForTotal(90)).toBe('excellent')
    expect(gradeForTotal(75)).toBe('good')
    expect(gradeForTotal(60)).toBe('fair')
    expect(gradeForTotal(40)).toBe('poor')
    expect(gradeForTotal(0)).toBe('poor')
  })
})
