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

/**
 * Longer, actionable Korean detail per load-failure reason — the "why + what to
 * do" the terse {@link loadErrorMessage} cannot carry. Surfaced behind the
 * report's "자세히 보기" disclosure so a user who wants the specifics can see the
 * exact cause of the load failure without cluttering the headline message.
 */
const LOAD_FAILURE_DETAIL: Readonly<Record<LoadFailureReason, string>> = {
  'invalid-url':
    'URL은 http:// 또는 https:// 로 시작하는 올바른 형식이어야 합니다. 주소에 오타가 없는지 확인한 뒤 다시 진단하세요.',
  'blocked-host':
    '사설 네트워크·localhost·링크로컬 주소는 SSRF 보호를 위해 차단됩니다. 외부에서 접근 가능한 공개 URL을 입력하세요.',
  'private-address':
    '사설 네트워크·localhost·링크로컬 주소는 SSRF 보호를 위해 차단됩니다. 외부에서 접근 가능한 공개 URL을 입력하세요.',
  'dns-failure':
    '입력한 주소의 도메인을 확인하지 못했습니다. 도메인 철자와 DNS 설정을 확인한 뒤 다시 진단하세요.',
  timeout:
    '페이지가 제한 시간 안에 응답하지 않았습니다. 페이지가 정상 동작하는지 확인하고 잠시 후 다시 시도하세요.',
  network:
    '페이지 서버에 연결하지 못했습니다. 주소가 맞는지, 서버가 응답 가능한 상태인지 확인하세요.',
  'http-error':
    '페이지 서버가 정상(2xx)이 아닌 상태 코드를 반환했습니다. 페이지 URL이 올바른지, 접근 권한이 필요한 페이지가 아닌지 확인하세요.',
} as const

/** The full Korean load-failure detail for `reason` (see {@link LOAD_FAILURE_DETAIL}). */
export function loadFailureDetail(reason: LoadFailureReason): string {
  return LOAD_FAILURE_DETAIL[reason]
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

/**
 * Longer, actionable Korean detail per AI-failure reason — the "why + what to
 * do" the terse {@link partialReasonMessage} cannot carry. Surfaced behind the
 * report's "자세히 보기" disclosure so a user who wants to know *exactly* why the
 * AI evaluation was dropped (and how to recover it) can see the specifics.
 */
const AI_FAILURE_DETAIL: Readonly<Record<AiFailureReason, string>> = {
  'missing-key':
    'AI 평가를 실행하려면 API 키가 필요합니다. 테스트 도구 패널에서 공급자와 모델을 선택하고 유효한 API 키를 입력한 뒤 다시 진단하세요.',
  'invalid-key':
    '입력한 API 키가 공급자에서 거부되었습니다. 키 값이 정확한지, 선택한 모델을 사용할 권한이 있는지 확인한 뒤 다시 진단하세요.',
  'rate-limit':
    '공급자의 API 사용 한도(요청 수·토큰)를 초과했습니다. 잠시 후 다시 시도하거나 공급자 콘솔에서 사용량 한도를 확인하세요.',
  'parse-failure':
    'AI가 응답을 반환했지만 정해진 JSON 형식으로 해석하지 못했습니다. 재시도 후에도 형식이 어긋나 AI 점수를 계산하지 못했습니다.',
} as const

/** The full Korean AI-failure detail for `reason` (see {@link AI_FAILURE_DETAIL}). */
export function aiFailureDetail(reason: AiFailureReason): string {
  return AI_FAILURE_DETAIL[reason]
}
