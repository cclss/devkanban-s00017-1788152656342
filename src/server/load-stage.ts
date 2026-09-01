/**
 * The `load` stage: SSRF-guarded, timeout-bounded fetch of the target page.
 *
 * This is the first and only stage that can fail terminally into `error-load`.
 * It runs the user URL through the {@link checkUrl} SSRF guard *before* any
 * network call, then fetches with an abort-based timeout. A guard block, a
 * timeout, a network error, or a non-2xx status all short-circuit the pipeline
 * with a Korean {@link LoadErrorReport} and no scores; success hands the fetched
 * HTML (and status code) on to the audit stage.
 *
 * Every external edge is injected — the SSRF guard's DNS resolver and the fetch
 * implementation — so the stage unit-tests with mocked fetch and no real
 * network, per the grain's Done-when.
 *
 * Boundary: standalone backend module composing the `ssrf-guard`, the
 * `analysis-copy` messages, and `core/report` types. It owns the only Node/fetch
 * surface in the pipeline (behind the injected default).
 */
import type { LoadErrorReport, Screenshot } from '../core/report'
import { checkUrl, type SsrfGuardOptions } from './ssrf-guard'
import {
  loadErrorMessage,
  loadFailureDetail,
  type LoadFailureReason,
} from './analysis-copy'

/** Minimal response shape the load stage needs from a fetch. */
export interface LoadFetchResponse {
  /** Whether the status is in the 2xx range. */
  ok: boolean
  /** HTTP status code. */
  status: number
  /** Resolves the response body as text (the page HTML). */
  text(): Promise<string>
}

/** Injectable fetch: called with the URL and an abort signal for the timeout. */
export type LoadFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<LoadFetchResponse>

/** Options for {@link runLoad}. */
export interface LoadStageOptions {
  /** Fetch implementation. Defaults to the global `fetch`. */
  fetchImpl?: LoadFetch
  /** SSRF guard options (resolver, private-network bypass). */
  guardOptions?: SsrfGuardOptions
  /** Fetch timeout in milliseconds. Defaults to {@link DEFAULT_LOAD_TIMEOUT_MS}. */
  timeoutMs?: number
}

/** Successful load: the fetched HTML and the status it came back with. */
export interface LoadSuccess {
  ok: true
  html: string
  statusCode: number
  /**
   * Captured page renderings, when the load stage produced any. Threaded through
   * to the AI evaluator (as image blocks) and the finished report. Optional: the
   * baseline load is text-only, so this is usually absent.
   */
  screenshots?: Screenshot[]
}

/** Failed load: the terminal Korean error report to stream to the client. */
export interface LoadFailure {
  ok: false
  report: LoadErrorReport
}

/** Discriminated outcome of the load stage. */
export type LoadResult = LoadSuccess | LoadFailure

/** Default page-load timeout: 15s keeps the whole run within the ~1-minute budget. */
export const DEFAULT_LOAD_TIMEOUT_MS = 15_000

/** Wraps the global `fetch` in the {@link LoadFetch} shape. */
const globalFetch: LoadFetch = (url, init) =>
  fetch(url, { signal: init.signal, redirect: 'follow' })

function failure(
  url: string,
  reason: LoadFailureReason,
  statusCode?: number,
): LoadFailure {
  return {
    ok: false,
    report: {
      outcome: 'error-load',
      url,
      message: loadErrorMessage(reason, statusCode),
      detail: loadFailureDetail(reason),
      ...(statusCode !== undefined ? { statusCode } : {}),
    },
  }
}

/** Maps an SSRF guard block reason to its load-failure reason (1:1). */
function guardReasonToLoadReason(
  reason: 'invalid-url' | 'blocked-host' | 'private-address' | 'dns-failure',
): LoadFailureReason {
  return reason
}

/**
 * Runs the load stage: SSRF check, then a timeout-bounded fetch. Returns a
 * {@link LoadSuccess} with the HTML on a 2xx response, or a {@link LoadFailure}
 * carrying the Korean error report for any guard block, timeout, network error,
 * or non-2xx status.
 */
export async function runLoad(
  url: string,
  options: LoadStageOptions = {},
): Promise<LoadResult> {
  const guard = await checkUrl(url, options.guardOptions)
  if (!guard.allowed) {
    return failure(url, guardReasonToLoadReason(guard.reason))
  }

  const fetchImpl = options.fetchImpl ?? globalFetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, { signal: controller.signal })
    if (!response.ok) {
      return failure(url, 'http-error', response.status)
    }
    const html = await response.text()
    return { ok: true, html, statusCode: response.status }
  } catch {
    // An aborted signal means the timeout fired; anything else is a network error.
    const reason: LoadFailureReason = controller.signal.aborted
      ? 'timeout'
      : 'network'
    return failure(url, reason)
  } finally {
    clearTimeout(timer)
  }
}
