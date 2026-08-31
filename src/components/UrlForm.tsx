/**
 * First block of the grader's 3-block layout: the URL entry form.
 *
 * The form owns the "진단 시작" (start diagnosis) / "새로 진단" (fresh restart)
 * control and the inline field-error surface. It is a controlled, stage-aware
 * view: it reads the single `Stage` value to decide which control to show and
 * whether the start button is enabled, and it delegates the actual state
 * transition to the parent's {@link UrlFormProps.onStart} / {@link
 * UrlFormProps.onReset}. It never holds the flow state itself — that lives in
 * the one `useStage` source of truth — so it can never drift out of sync with
 * the stepper and report.
 *
 * Rules encoded here (Design §상태 전이 규칙):
 * - Format check: only `http://` / `https://` URLs may start a run. A malformed
 *   value shows an inline `field-error` and never calls `onStart`, so no request
 *   is ever sent (SSRF / private-network judgement is the server's job and is out
 *   of scope for this form).
 * - Start is offered only from `idle`; while a run is in progress the button is
 *   disabled. If the authoritative start machine still reports a **conflict**
 *   (a run already in progress), that is surfaced as an inline `field-error`
 *   ("이미 분석이 진행 중입니다…") and, again, no request is sent — the client
 *   blocks it, not the server.
 * - In any terminal stage (`done` / `done-partial` / `error-load`) the start
 *   button is replaced by a "새로 진단" reset button wired to `onReset`.
 *
 * Boundary: presentational component. It imports the `Stage` type and the
 * `StartResult` shape from the state layer but holds no flow state and touches
 * no DOM globals; all copy is co-located domain content (Korean, like the report
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

/**
 * Korean, user-facing copy for the URL form. Co-located as confirmed domain
 * content (mirroring the report-domain labels) rather than design tokens.
 * Exported so tests assert against the single source of the copy.
 */
export const URL_FORM_STRINGS = {
  /** Accessible label for the URL input. */
  urlLabel: '진단할 URL',
  /** Placeholder example shown in the empty input. */
  urlPlaceholder: 'https://example.com',
  /** Start-diagnosis submit button (offered only from idle). */
  start: '진단 시작',
  /** Reset button shown in terminal stages ("start fresh"). */
  reset: '새로 진단',
  /** Inline error when the input is not an http/https URL. */
  formatError: 'http:// 또는 https:// 로 시작하는 URL을 입력하세요.',
  /** Inline error when a run is already in progress (client-side conflict block). */
  conflictError: '이미 분석이 진행 중입니다. 완료 후 다시 시도하세요.',
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
  /** Requests "새로 진단": resets a terminal stage back to idle. */
  onReset: () => void
}

/**
 * @param props See {@link UrlFormProps}.
 */
export default function UrlForm({ stage, onStart, onReset }: UrlFormProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
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
    const result = onStart(url.trim())
    if (result.conflict) {
      setError(URL_FORM_STRINGS.conflictError)
      return
    }
    setError(null)
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

  return (
    <form className="url-form grader-block" onSubmit={handleSubmit} noValidate>
      <div className="grader-card">
        <label className="url-form__label" htmlFor={inputId}>
          {URL_FORM_STRINGS.urlLabel}
        </label>
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
        </div>
        {error ? (
          <p id={errorId} className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  )
}
