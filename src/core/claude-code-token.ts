/**
 * Detector + guidance for Claude Code-only credentials (`sk-ant-oat…`).
 *
 * `claude setup-token` issues a value beginning `sk-ant-oat…`. That token is a
 * Claude Code CLI credential, **not** a Messages API key: sending it to the AI
 * evaluation only ever comes back as a `401 authentication_error`, which reads to
 * the user as "my brand-new, valid token was rejected". To spare that dead end,
 * the grader recognises the prefix up front and blocks it *before* any
 * `/api/analyze` request is made, pointing the user at the real API-key issuance
 * path instead.
 *
 * This module is a pure, DOM-free predicate plus the one confirmed English
 * guidance string, so both the {@link module:components/ApiKeyPanel} (inline, as
 * the value is typed/saved) and the start-flow gate can share a single source and
 * be unit-tested without React or a browser.
 *
 * Scope: detection + copy only. The 401 failure-detail wording (when a bad key
 * still reaches the API) and the ⓘ help wording live in sibling grains; the
 * server pipeline is untouched.
 *
 * Boundary: standalone logic + domain copy module. It imports nothing from the
 * components, state, or server layers, so those may depend on it and never the
 * reverse.
 */

/**
 * Prefix of a Claude Code CLI token (`claude setup-token` → `sk-ant-oat…`).
 * Compared case-insensitively against a trimmed value.
 */
export const CLAUDE_CODE_TOKEN_PREFIX = 'sk-ant-oat'

/**
 * True when `key` looks like a Claude Code CLI token — i.e. once trimmed of
 * surrounding whitespace it begins (case-insensitively) with `sk-ant-oat`.
 * Blank / whitespace-only input is not a token, so it returns `false`.
 *
 * Pure and DOM-free: it inspects only the string, so the panel, the start gate,
 * and the tests all agree on one rule.
 */
export function isClaudeCodeToken(key: string): boolean {
  return key.trim().toLowerCase().startsWith(CLAUDE_CODE_TOKEN_PREFIX)
}

/**
 * The confirmed English guidance shown wherever a Claude Code token is caught
 * (the API-key panel inline, and the start-flow block). It names the credential
 * difference and the real issuance path so the user knows exactly what to enter
 * instead. Single source — both surfaces render this same string.
 */
export const CLAUDE_CODE_TOKEN_GUIDANCE =
  'This value is a Claude Code-only token, so this tool cannot use it. ' +
  'Enter an API key issued at console.anthropic.com → API Keys ' +
  '(it starts with sk-ant-api…).'
