/**
 * localStorage contract for the saved-URL history of the URL form.
 *
 * Sibling to the API-key storage adapter (`testtools/api-key-storage.ts`): the
 * grader keeps the recently-diagnosed site addresses in the browser only — never
 * on a server — so a returning user can pick a previous URL instead of retyping
 * it (Design §로컬 스토리지 키 관리, extended to the URL form). Unlike the three
 * scalar key entries, the history is a *list*, so it owns one dedicated key
 * holding a JSON string array and is capped at {@link MAX_SAVED_URLS} entries.
 *
 * The read/write helpers guard every `localStorage` access so a missing /
 * throwing store (private mode, SSR, jsdom quirks) or a corrupt value never
 * crashes the form. The list transform is a pure function so the cap + de-dup +
 * newest-first ordering can be unit-tested without the DOM.
 *
 * Boundary: storage adapter. It wraps the one browser API this feature touches so
 * the form and its tests depend on these helpers, not on `localStorage` directly.
 */

/** The single localStorage key holding the saved-URL history (a JSON array). */
export const URL_HISTORY_STORAGE_KEY = 'landing_grader_url_history'

/** How many site addresses may be kept at once ("최대 5개"). */
export const MAX_SAVED_URLS = 5

/**
 * Reads the saved-URL history, newest first. Returns an empty list when the key
 * is absent, when storage throws, or when the stored value is not a JSON array
 * of strings. Non-string members are dropped and the result is capped at
 * {@link MAX_SAVED_URLS} so a hand-edited / oversized value can never overflow
 * the UI.
 */
export function readUrlHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(URL_HISTORY_STORAGE_KEY)
    if (raw === null || raw === '') return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .slice(0, MAX_SAVED_URLS)
  } catch {
    return []
  }
}

/** Writes the history list, swallowing any storage error (best-effort persistence). */
export function writeUrlHistory(urls: readonly string[]): void {
  try {
    window.localStorage.setItem(URL_HISTORY_STORAGE_KEY, JSON.stringify(urls))
  } catch {
    // Ignore: persisting the history is best-effort and must never break the form.
  }
}

/**
 * Returns the history with `url` recorded as the most-recent entry: trimmed,
 * de-duplicated (an existing copy is moved to the front, not duplicated), placed
 * first, and truncated to {@link MAX_SAVED_URLS} so the oldest entry falls off
 * once the cap is reached. A blank `url` is a no-op (the history is returned
 * unchanged). Pure — it never touches storage.
 */
export function addUrlToHistory(
  history: readonly string[],
  url: string,
): string[] {
  const trimmed = url.trim()
  if (trimmed === '') return [...history]
  const withoutDuplicate = history.filter((item) => item !== trimmed)
  return [trimmed, ...withoutDuplicate].slice(0, MAX_SAVED_URLS)
}
