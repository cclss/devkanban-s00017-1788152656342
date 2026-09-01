/**
 * English, user-facing copy for the analysis pipeline's failure surfaces.
 *
 * Two families of message live here, and only here, so the pipeline that builds
 * a {@link LoadErrorReport} / partial {@link AnalysisReport} draws every string
 * from one source (and the design spec records the same strings):
 *
 * - **Load-error copy** — a `load`-stage failure produces no report; the UI
 *   shows a single card. All messages share the `Failed to load the page: `
 *   prefix and append a specific cause, matching the confirmed report copy.
 * - **Partial copy** — the AI axis drops and the report completes on the
 *   60-point auto-audit scale; `partialReason` explains why. Two tones live here,
 *   sharing the ` only the automated audit results are shown.` suffix:
 *   - a genuine **failure** (`invalid-key` / `rate-limit` / `parse-failure`)
 *     uses the `AI evaluation unavailable: ` prefix — something went wrong;
 *   - a deliberate **skip** (`missing-key`) uses the `AI evaluation skipped: `
 *     prefix — no key was entered, so the AI axis is intentionally bypassed and
 *     the run passes through neutrally. This is not an error state.
 *
 * These are confirmed English domain strings (mirroring the report labels), not
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

/**
 * Why the AI axis was dropped, routing the report to `done-partial`. Covers both
 * a genuine failure and the neutral no-key skip (`missing-key`); use
 * {@link isAiSkip} to tell them apart.
 */
export type AiFailureReason =
  /** No API key was entered — a deliberate skip, not a failure. */
  | 'missing-key'
  /** The key was rejected (auth error) or the model call otherwise failed. */
  | 'invalid-key'
  /** The provider quota / rate limit was exceeded. */
  | 'rate-limit'
  /** The model replied, but the JSON could not be parsed (even after a retry). */
  | 'parse-failure'

/** Shared prefix for every load-error message. */
export const LOAD_ERROR_PREFIX = 'Failed to load the page: '

/** Cause clause per load-failure reason (appended to {@link LOAD_ERROR_PREFIX}). */
const LOAD_ERROR_CAUSE: Readonly<Record<LoadFailureReason, string>> = {
  'invalid-url': 'The URL format is invalid.',
  'blocked-host': 'Private network addresses are blocked.',
  'private-address': 'Private network addresses are blocked.',
  'dns-failure': 'The address could not be resolved.',
  timeout: 'The page response timed out.',
  network: 'Could not connect to the page.',
  'http-error': 'The server returned an error status.',
} as const

/**
 * The full English load-error message for `reason`. When a `statusCode` is
 * available it is appended in parentheses so the card can show it (Design:
 * "include the status code when present").
 */
export function loadErrorMessage(
  reason: LoadFailureReason,
  statusCode?: number,
): string {
  const base = `${LOAD_ERROR_PREFIX}${LOAD_ERROR_CAUSE[reason]}`
  return statusCode === undefined ? base : `${base} (${statusCode})`
}

/**
 * Longer, actionable English detail per load-failure reason — the "why + what to
 * do" the terse {@link loadErrorMessage} cannot carry. Surfaced behind the
 * report's "view details" disclosure so a user who wants the specifics can see
 * the exact cause of the load failure without cluttering the headline message.
 */
const LOAD_FAILURE_DETAIL: Readonly<Record<LoadFailureReason, string>> = {
  'invalid-url':
    'The URL must be a valid address that starts with http:// or https://. Check the address for typos, then run the diagnosis again.',
  'blocked-host':
    'Private network, localhost, and link-local addresses are blocked to protect against SSRF. Enter a public URL that is reachable from outside.',
  'private-address':
    'Private network, localhost, and link-local addresses are blocked to protect against SSRF. Enter a public URL that is reachable from outside.',
  'dns-failure':
    'The domain of the address you entered could not be resolved. Check the domain spelling and your DNS settings, then run the diagnosis again.',
  timeout:
    'The page did not respond within the time limit. Make sure the page is working and try again in a moment.',
  network:
    'Could not connect to the page server. Check that the address is correct and that the server is able to respond.',
  'http-error':
    'The page server returned a non-successful (non-2xx) status code. Check that the page URL is correct and that it is not a page requiring access permission.',
} as const

/** The full English load-failure detail for `reason` (see {@link LOAD_FAILURE_DETAIL}). */
export function loadFailureDetail(reason: LoadFailureReason): string {
  return LOAD_FAILURE_DETAIL[reason]
}

/** Prefix for a genuine AI *failure* (`invalid-key` / `rate-limit` / `parse-failure`). */
export const PARTIAL_REASON_PREFIX = 'AI evaluation unavailable: '

/**
 * Prefix for the deliberate no-key *skip* (`missing-key`). Distinct from
 * {@link PARTIAL_REASON_PREFIX} so the neutral pass-through never reads as a
 * failure — nothing went wrong, the AI axis was simply not requested.
 */
export const AI_SKIP_REASON_PREFIX = 'AI evaluation skipped: '

/** The AI reasons that are deliberate skips rather than genuine failures. */
const AI_SKIP_REASONS: ReadonlySet<AiFailureReason> = new Set<AiFailureReason>(['missing-key'])

/**
 * Whether `reason` is a deliberate skip (no key entered) rather than a genuine
 * failure. Drives the neutral-vs-error framing of the partial copy.
 */
export function isAiSkip(reason: AiFailureReason): boolean {
  return AI_SKIP_REASONS.has(reason)
}

/** Cause clause per AI-drop reason (framed by prefix + shared suffix). */
const PARTIAL_CAUSE: Readonly<Record<AiFailureReason, string>> = {
  'missing-key': 'no API key was entered, so',
  'invalid-key': 'an API key error occurred, so',
  'rate-limit': 'the API usage limit was exceeded, so',
  'parse-failure': 'the AI response could not be interpreted, so',
} as const

/** Shared suffix for every partial-result reason. */
export const PARTIAL_REASON_SUFFIX = ' only the automated audit results are shown.'

/**
 * The full English `partialReason` for `reason`. A genuine failure reads as an
 * error (`AI evaluation unavailable: an API key error occurred, so …`); the
 * no-key skip reads neutrally (`AI evaluation skipped: no API key was entered,
 * so only the automated audit results are shown.`).
 */
export function partialReasonMessage(reason: AiFailureReason): string {
  const prefix = isAiSkip(reason) ? AI_SKIP_REASON_PREFIX : PARTIAL_REASON_PREFIX
  return `${prefix}${PARTIAL_CAUSE[reason]}${PARTIAL_REASON_SUFFIX}`
}

/**
 * Longer, actionable English detail per AI-drop reason — the "why + what to
 * do" the terse {@link partialReasonMessage} cannot carry. Surfaced behind the
 * report's "view details" disclosure so a user who wants to know *exactly* why
 * the AI evaluation was dropped (and how to recover it) can see the specifics.
 * The `missing-key` entry stays neutral — it explains a skip, not an error — and
 * points at the real API-key panel, not the removed test-tools presets.
 */
const AI_FAILURE_DETAIL: Readonly<Record<AiFailureReason, string>> = {
  'missing-key':
    'This is not an error: no API key was entered, so the AI evaluation was skipped and the report was completed on the 60-point automated audit scale. To include the AI score, enter an API key in the API key panel, save it, then run the diagnosis again.',
  'invalid-key':
    'The API key you entered was rejected by the provider. Check that the key value is correct and that you have permission to use the selected model, then run the diagnosis again.',
  'rate-limit':
    "The provider's API usage limit (request count / tokens) was exceeded. Try again in a moment, or check your usage limits in the provider console.",
  'parse-failure':
    'The AI returned a response, but it could not be interpreted as the required JSON format. The format was still invalid after a retry, so the AI score could not be computed.',
} as const

/** The full English AI-failure detail for `reason` (see {@link AI_FAILURE_DETAIL}). */
export function aiFailureDetail(reason: AiFailureReason): string {
  return AI_FAILURE_DETAIL[reason]
}
