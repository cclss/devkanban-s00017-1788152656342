/**
 * The `POST /api/analyze` streaming client.
 *
 * This is the imperative half of the grader's real run: it POSTs the target URL
 * and API-key credentials to the endpoint, reads the NDJSON stage-event stream
 * ({@link readAnalyzeStream}), and dispatches each event to the caller — every
 * `stage` event drives the progress stepper, the single terminal `result` event
 * carries the report to store. It holds no React and no UI state, so it is unit
 * testable with a hand-built streaming `Response` and an injected `fetch`.
 *
 * Security invariant (Story spec "UI 배선 및 에러 처리"): the API key travels in
 * the request **body**, never in the URL or a log — the endpoint path is a fixed
 * constant with no query string, and this module never logs the params.
 *
 * Failure handling (Design §상태 전이 규칙): a `load`-stage failure the server
 * detects (timeout / SSRF block / bad URL) arrives as a normal terminal
 * `error-load` `result` event and flows through `onResult` like any other. A
 * *transport* failure — the request never reaching the server, a non-OK
 * response, or a truncated stream — cannot produce a server report, so this
 * module synthesises the equivalent Korean `error-load` report itself
 * ({@link transportErrorReport}) and hands it to `onResult`, so the UI still
 * lands in `error-load` with a message instead of hanging in `load`.
 *
 * Boundary: state-layer client. It imports the wire reader from
 * `core/analyze-events` and the report/stage *types*; the only external edge it
 * touches, `fetch`, is injectable so tests stay network-free.
 */
import { readAnalyzeStream } from '../core/analyze-events'
import type { LoadErrorReport, ReportResult } from '../core/report'
import type { Stage } from './stage'

/** The single analyze endpoint. A fixed path — the API key never rides the URL. */
export const ANALYZE_ENDPOINT = '/api/analyze'

/**
 * Korean transport-failure message, used when the request never yields a server
 * report (network error / non-OK response / truncated stream). Mirrors the
 * pipeline's confirmed `network` load-error copy so the card reads identically
 * whether the failure was detected server- or client-side.
 */
export const TRANSPORT_ERROR_MESSAGE =
  '페이지를 불러오지 못했습니다: 페이지에 연결할 수 없습니다.'

/** Credentials + target for one analysis run. */
export interface AnalyzeParams {
  /** The landing-page URL to analyze (already format-validated by the form). */
  url: string
  /** The API key — sent in the body, never the URL or a log. */
  apiKey?: string
  /** Selected provider id (e.g. `anthropic`). */
  provider?: string
  /** Selected model id (e.g. `claude-sonnet-5`). */
  model?: string
}

/** Callbacks the client fires as the stream is read. */
export interface AnalyzeHandlers {
  /** A `stage` event arrived: the pipeline entered `stage`. Drives the stepper. */
  onStage: (stage: Stage) => void
  /** The terminal `result` event arrived: the finished (or failed) report. */
  onResult: (result: ReportResult) => void
}

/** The `fetch` surface this client depends on. Injectable so tests mock it. */
export type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<Response>

/** Builds the synthetic terminal report for a client-side transport failure. */
export function transportErrorReport(url: string): LoadErrorReport {
  return { outcome: 'error-load', url, message: TRANSPORT_ERROR_MESSAGE }
}

/**
 * Runs one analysis: POSTs `params` to {@link ANALYZE_ENDPOINT} and streams the
 * result, firing `handlers.onStage` per stage event and `handlers.onResult`
 * once for the terminal report.
 *
 * Never rejects: any transport error is caught and surfaced as an `error-load`
 * report through `onResult`, so the caller only ever has to react to events
 * (the flow can never be left hanging on an unhandled rejection).
 *
 * @param params   The run credentials + target URL.
 * @param handlers Stage / result callbacks.
 * @param fetchImpl Injected `fetch` (defaults to the global).
 */
export async function postAnalyze(
  params: AnalyzeParams,
  handlers: AnalyzeHandlers,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  try {
    const response = await fetchImpl(ANALYZE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The API key lives here, in the body — never in the URL.
      body: JSON.stringify({
        url: params.url,
        apiKey: params.apiKey,
        provider: params.provider,
        model: params.model,
      }),
    })

    if (!response.ok) {
      handlers.onResult(transportErrorReport(params.url))
      return
    }

    let sawResult = false
    for await (const event of readAnalyzeStream(response)) {
      if (event.type === 'stage') {
        handlers.onStage(event.stage)
      } else {
        sawResult = true
        handlers.onResult(event.result)
      }
    }

    // A well-formed stream always ends with a `result`. If the stream closed
    // without one (truncated / server crash mid-stream), surface a transport
    // error so the UI never hangs waiting for a report that will not arrive.
    if (!sawResult) {
      handlers.onResult(transportErrorReport(params.url))
    }
  } catch {
    // Network error, or a malformed line that made the reader throw: no server
    // report is possible, so synthesise the terminal error-load report.
    handlers.onResult(transportErrorReport(params.url))
  }
}
