/**
 * localStorage contract for the API-key panel.
 *
 * The grader never sends the API key to a server for storage — it lives only in
 * the browser (Design §Local storage key management). Exactly four keys are used, named
 * here so both the {@link module:components/ApiKeyPanel} and its tests
 * read the single source of the key names. The read/write helpers guard access
 * so a missing / throwing `localStorage` (private mode, SSR, jsdom quirks) never
 * crashes the panel — the key entry must not take the app down.
 *
 * Boundary: storage adapter. It wraps the one browser API this feature touches so
 * the panel and its tests depend on these helpers, not on `localStorage` directly.
 */

/** The four (and only four) localStorage keys this screen owns. */
export const API_KEY_STORAGE_KEYS = {
  /** Selected provider id (e.g. `anthropic`). */
  provider: 'landing_grader_provider',
  /** Selected model id (`claude-sonnet-5` | `claude-opus-5`). */
  model: 'landing_grader_model',
  /** The raw API key string as typed. */
  apiKey: 'landing_grader_api_key',
  /**
   * Optional Anthropic workspace id for an identity-linked key. Empty when the
   * key is not workspace-scoped; kept alongside the key so a revisit is
   * pre-filled and treated with the same browser-only, never-on-server handling.
   */
  workspaceId: 'landing_grader_workspace_id',
} as const

/** Reads a stored value, returning `null` when absent or when storage throws. */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Writes a value, swallowing any storage error so the panel never crashes. */
export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore: persistence is best-effort for this browser-only key entry.
  }
}
