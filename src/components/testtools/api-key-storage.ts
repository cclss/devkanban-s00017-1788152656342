/**
 * localStorage contract for the API-key test tool.
 *
 * The grader never sends the API key to a server for storage — it lives only in
 * the browser (Design §로컬 스토리지 키 관리). Exactly three keys are used, named
 * here so both the {@link module:components/testtools/ApiKeyPanel} and its tests
 * read the single source of the key names. The read/write helpers guard access
 * so a missing / throwing `localStorage` (private mode, SSR, jsdom quirks) never
 * crashes the panel — a test tool must not take the app down.
 *
 * Boundary: storage adapter. It wraps the one browser API this feature touches so
 * the panel and its tests depend on these helpers, not on `localStorage` directly.
 */

/** The three (and only three) localStorage keys this screen owns. */
export const API_KEY_STORAGE_KEYS = {
  /** Selected provider id (e.g. `anthropic`). */
  provider: 'landing_grader_provider',
  /** Selected model id (`claude-sonnet-5` | `claude-opus-5`). */
  model: 'landing_grader_model',
  /** The raw API key string as typed. */
  apiKey: 'landing_grader_api_key',
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
    // Ignore: persistence is best-effort for this test tool.
  }
}
