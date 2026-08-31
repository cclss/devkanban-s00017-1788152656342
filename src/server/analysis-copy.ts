/**
 * Korean, user-facing copy for the analysis pipeline's failure surfaces.
 *
 * Two families of message live here, and only here, so the pipeline that builds
 * a {@link LoadErrorReport} / partial {@link AnalysisReport} draws every string
 * from one source (and the design spec records the same strings):
 *
 * - **Load-error copy** — a `load`-stage failure produces no report; the UI
 *   shows a single Korean card. All messages share the `페이지를 불러오지 못했습니다: `
 *   prefix and append a specific cause, matching the confirmed report copy.
 * - **Partial copy** — an `ai`-stage failure drops AI scoring and completes the
 *   report on the 60-point auto-audit scale; `partialReason` explains why, all
 *   sharing the `AI 평가 결과 없음: ` prefix + `자동 점검 결과만 표시합니다.` suffix.
 *
 * These are confirmed Korean domain strings (mirroring the report labels), not
 * design tokens. The SSRF guard deliberately returns reason *codes*, not copy;
 * this module is the layer that maps a code (and the non-guard load failures) to
 * the localised message.
 *
 * Boundary: standalone backend copy module. It imports only failure-reason
 * *types* and holds no logic beyond the lookup maps.
 */
import type { SsrfBlockReason } from './ssrf-guard'

/** Why the `load` stage failed, beyond the SSRF reasons. */
export type LoadFailureReason =
  | SsrfBlockReason
  /** The fetch exceeded the load timeout. */
  | 'timeout'
  /** The fetch failed at the network level (connection refused / reset / etc). */
  | 'network'
  /** The server answered, but with a non-2xx status. */
  | 'http-error'

/** Why the `ai` stage failed, routing the report to `done-partial`. */
export type AiFailureReason =
  /** No API key was supplied. */
  | 'missing-key'
  /** The key was rejected (auth error) or the model call otherwise failed. */
  | 'invalid-key'
  /** The provider quota / rate limit was exceeded. */
  | 'rate-limit'
  /** The model replied, but the JSON could not be parsed (even after a retry). */
  | 'parse-failure'

/** Shared prefix for every load-error message. */
export const LOAD_ERROR_PREFIX = '페이지를 불러오지 못했습니다: '

/** Cause clause per load-failure reason (appended to {@link LOAD_ERROR_PREFIX}). */
const LOAD_ERROR_CAUSE: Readonly<Record<LoadFailureReason, string>> = {
  'invalid-url': 'URL 형식이 올바르지 않습니다.',
  'blocked-host': '사설 네트워크 주소는 차단됩니다.',
  'private-address': '사설 네트워크 주소는 차단됩니다.',
  'dns-failure': '주소를 확인할 수 없습니다.',
  timeout: '페이지 응답 시간이 초과되었습니다.',
  network: '페이지에 연결할 수 없습니다.',
  'http-error': '서버가 오류 상태를 반환했습니다.',
} as const

/**
 * The full Korean load-error message for `reason`. When a `statusCode` is
 * available it is appended in parentheses so the card can show it (Design:
 * "상태코드가 있으면 포함").
 */
export function loadErrorMessage(
  reason: LoadFailureReason,
  statusCode?: number,
): string {
  const base = `${LOAD_ERROR_PREFIX}${LOAD_ERROR_CAUSE[reason]}`
  return statusCode === undefined ? base : `${base} (${statusCode})`
}

/** Shared prefix for every partial-result reason. */
export const PARTIAL_REASON_PREFIX = 'AI 평가 결과 없음: '

/** Cause clause per AI-failure reason (framed by prefix + shared suffix). */
const PARTIAL_CAUSE: Readonly<Record<AiFailureReason, string>> = {
  'missing-key': 'API 키가 없어',
  'invalid-key': 'API 키 오류로',
  'rate-limit': 'API 사용 한도를 초과하여',
  'parse-failure': 'AI 응답을 해석하지 못해',
} as const

/** Shared suffix for every partial-result reason. */
export const PARTIAL_REASON_SUFFIX = ' 자동 점검 결과만 표시합니다.'

/**
 * The full Korean `partialReason` for `reason`, e.g.
 * `AI 평가 결과 없음: API 키 오류로 자동 점검 결과만 표시합니다.`
 */
export function partialReasonMessage(reason: AiFailureReason): string {
  return `${PARTIAL_REASON_PREFIX}${PARTIAL_CAUSE[reason]}${PARTIAL_REASON_SUFFIX}`
}
