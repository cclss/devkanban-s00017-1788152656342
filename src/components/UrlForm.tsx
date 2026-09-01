/**
 * First block of the grader's 3-block layout: the URL entry form.
 *
 * The form owns the "Start diagnosis" / "Start fresh" (restart)
 * control and the inline field-error surface. It is a controlled, stage-aware
 * view: it reads the single `Stage` value to decide which control to show and
 * whether the start button is enabled, and it delegates the actual state
 * transition to the parent's {@link UrlFormProps.onStart} / {@link
 * UrlFormProps.onReset}. It never holds the flow state itself — that lives in
 * the one `useStage` source of truth — so it can never drift out of sync with
 * the stepper and report.
 *
 * Rules encoded here (Design §state-transition rules):
 * - Format check: only `http://` / `https://` URLs may start a run. A malformed
 *   value shows an inline `field-error` and never calls `onStart`, so no request
 *   is ever sent (SSRF / private-network judgement is the server's job and is out
 *   of scope for this form).
 * - Start is offered only from `idle`; while a run is in progress the button is
 *   disabled. If the authoritative start machine still reports a **conflict**
 *   (a run already in progress), that is surfaced as an inline `field-error`
 *   ("An analysis is already in progress…") and, again, no request is sent — the
 *   client blocks it, not the server.
 * - In any terminal stage (`done` / `done-partial` / `error-load`) the start
 *   button is replaced by a "Start fresh" reset button wired to `onReset`.
 * - Saved addresses: a URL that actually starts a run (format-valid, not blocked
 *   by a conflict) is recorded to a browser-local history of up to five recent
 *   site addresses (see {@link module:components/url-history}). The history shows
 *   as click-to-fill chips under the input so a returning user can re-run a
 *   previous URL without retyping it; the list is the form's only local state
 *   beyond the input, seeded from storage on mount.
 *
 * Boundary: presentational component. It imports the `Stage` type and the
 * `StartResult` shape from the state layer but holds no flow state and touches
 * no DOM globals; all copy is co-located domain content (English, like the report
 * labels), not design tokens.
 */
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import {
  isInProgress,
  isTerminal,
  type Stage,
  type StartResult,
} from '../state/stage'
import { addUrlToHistory, readUrlHistory, writeUrlHistory } from './url-history'
import InfoTooltip from './InfoTooltip'
import { CONTROL_HELP } from './control-help'

/**
 * English, user-facing copy for the URL form. Co-located as confirmed domain
 * content (mirroring the report-domain labels) rather than design tokens.
 * Exported so tests assert against the single source of the copy.
 */
export const URL_FORM_STRINGS = {
  /** Accessible label for the URL input. */
  urlLabel: 'URL to analyze',
  /** Placeholder example shown in the empty input. */
  urlPlaceholder: 'https://example.com',
  /** Start-diagnosis submit button (offered only from idle). */
  start: 'Start diagnosis',
  /** Reset button shown in terminal stages ("start fresh"). */
  reset: 'Start fresh',
  /** Inline error when the input is not an http/https URL. */
  formatError: 'Enter a URL that starts with http:// or https://.',
  /** Inline error when a run is already in progress (client-side conflict block). */
  conflictError: 'An analysis is already in progress. Try again after it finishes.',
  /** Section label above the saved-address chips (recent URLs, up to 5). */
  savedLabel: 'Saved addresses',
} as const

/**
 * True when `value` is a syntactically valid absolute URL using the `http` or
 * `https` scheme. Anything else — a non-http scheme (`ftp://…`), bare text, or
 * an unparseable string — is rejected. This is a *format* gate only; whether the
 * host is reachable or safe (SSRF / private network) is decided server-side.
 */
export function isHttpUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}

export interface UrlFormProps {
  /** Current flow stage — the single source of truth this view reads. */
  stage: Stage
  /**
   * Requests a run for `url` (already format-validated by the form). Returns the
   * authoritative {@link StartResult}; the form surfaces `conflict` as an inline
   * error and otherwise leaves the transition to the caller.
   */
  onStart: (url: string) => StartResult
  /** Requests "Start fresh": resets a terminal stage back to idle. */
  onReset: () => void
}

/**
 * @param props See {@link UrlFormProps}.
 */
export default function UrlForm({ stage, onStart, onReset }: UrlFormProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Recently-diagnosed addresses (up to 5), seeded from browser-local storage on
  // mount so a returning user sees their saved URLs without retyping.
  const [savedUrls, setSavedUrls] = useState<string[]>(() => readUrlHistory())
  const inputId = useId()
  const errorId = useId()

  const inProgress = isInProgress(stage)
  const terminal = isTerminal(stage)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Format gate: reject non-http(s) input before any request is considered.
    if (!isHttpUrl(url)) {
      setError(URL_FORM_STRINGS.formatError)
      return
    }
    // Authoritative start: the machine may still refuse with a conflict, which
    // we surface inline and send nothing — the client blocks, not the server.
    const trimmed = url.trim()
    const result = onStart(trimmed)
    if (result.conflict) {
      setError(URL_FORM_STRINGS.conflictError)
      return
    }
    setError(null)
    // The run actually started: remember this address (newest first, max 5) so
    // it can be re-run later without retyping.
    setSavedUrls((current) => {
      const next = addUrlToHistory(current, trimmed)
      writeUrlHistory(next)
      return next
    })
  }

  const handleReset = () => {
    setError(null)
    onReset()
  }

  const handleChange = (value: string) => {
    setUrl(value)
    // Clear a stale inline error as soon as the user edits the field.
    if (error) setError(null)
  }

  // Fill the input from a saved address so it can be re-run; clears any stale
  // error but does not start the run (the user still presses "Start diagnosis").
  const handleSelectSaved = (value: string) => {
    setUrl(value)
    if (error) setError(null)
  }

  return (
    <form className="url-form grader-block" onSubmit={handleSubmit} noValidate>
      <div className="grader-card">
        <div className="control-help control-help--field-label">
          <label className="url-form__label" htmlFor={inputId}>
            {URL_FORM_STRINGS.urlLabel}
          </label>
          <InfoTooltip entry={CONTROL_HELP.urlInput} />
        </div>
        <div className="url-form__row">
          <input
            id={inputId}
            type="url"
            inputMode="url"
            className={`field-input url-form__input${
              error ? ' field-input--invalid' : ''
            }`}
            value={url}
            onChange={(event) => handleChange(event.target.value)}
            placeholder={URL_FORM_STRINGS.urlPlaceholder}
            disabled={inProgress}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          {terminal ? (
            <button
              type="button"
              className="btn btn--primary url-form__action"
              onClick={handleReset}
            >
              {URL_FORM_STRINGS.reset}
            </button>
          ) : (
            <button
              type="submit"
              className={`btn url-form__action ${
                inProgress ? 'btn--disabled' : 'btn--primary'
              }`}
              disabled={inProgress}
            >
              {URL_FORM_STRINGS.start}
            </button>
          )}
          <InfoTooltip entry={CONTROL_HELP.startDiagnosis} />
        </div>
        {error ? (
          <p id={errorId} className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {savedUrls.length > 0 ? (
          <div className="url-form__saved">
            <span className="url-form__saved-label control-help">
              {URL_FORM_STRINGS.savedLabel}
              <InfoTooltip entry={CONTROL_HELP.savedUrls} />
            </span>
            <ul className="url-form__saved-list">
              {savedUrls.map((saved) => (
                <li key={saved}>
                  <button
                    type="button"
                    className="url-form__saved-item"
                    onClick={() => handleSelectSaved(saved)}
                    disabled={inProgress}
                    title={saved}
                  >
                    {saved}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </form>
  )
}
