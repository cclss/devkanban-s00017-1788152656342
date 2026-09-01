// @vitest-environment jsdom
/**
 * Validation scenarios SC-3 · SC-4 — the *exception* paths of the landing-page
 * grader, driven end-to-end through the assembled {@link App} over a mocked
 * NDJSON stream (network-free), the sibling of the SC-1/SC-2 happy-path suite.
 *
 * - **SC-3 (Story Measure M-3) — AI failure → partial result.** When the AI step
 *   fails (SC-3a: no key → `missing-key`; SC-3b: an invalid key → `invalid-key`),
 *   the run terminates in `done-partial` (straight from `ai`, never through
 *   `done`). The report still renders — never blocked by an error card — on the
 *   **60-point auto-audit scale**: the gauge maxes at {@link AUDIT_MAX_SCORE},
 *   the "out of 60 (auto-audit only)" note shows, the grade badge reads "Grade
 *   withheld", the AI-axis cards are replaced by the English partial notice, and
 *   the five category cards + checklist render normally. The markdown download still
 *   works and carries the "out of 60, auto-audit only" scale note plus the AI-drop
 *   reason. In SC-3b the entered key string is never surfaced in the report, any
 *   error copy, or the downloaded file (key no-leak, Story spec "UI wiring and
 *   error handling").
 * - **SC-4 (no Measure id — ordered exception coverage).**
 *   - SC-4a: a non-http(s) URL shows the inline form error and sends *no* request
 *     (`fetch` is never called; the machine stays `idle`).
 *   - SC-4b: a private-IP / localhost URL is a valid http URL, so the request is
 *     sent, but the server blocks it and the run transitions to `error-load`:
 *     only the single English error card shows (no ReportView, no meter), and the
 *     flow never advances to `audit` / `ai`.
 *
 * Every English string asserted here is the project's single confirmed source of
 * that copy — the partial reasons come from `server/analysis-copy`
 * (`partialReasonMessage`), the load-error message + the report/grade/form labels
 * from their confirmed modules and the confirmed report fixtures — so this suite
 * introduces no new user-facing copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

// Mock only the byte-download boundary so the SC-3 download is observable without
// a real browser download; the markdown/filename builders stay real, so the Blob
// still carries the true partial-report markdown.
const downloadBlob = vi.fn()
vi.mock('./core/download', () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}))

import App from './App'
import { URL_FORM_STRINGS } from './components/UrlForm'
import { REPORT_VIEW_STRINGS } from './components/ReportView'
import { PARTIAL_REPORT_NOTICE } from './components/report-markdown'
import { GRADE_LABELS } from './components/report-labels'
import { API_KEY_PANEL_STRINGS } from './components/ApiKeyPanel'
import { API_KEY_STORAGE_KEYS } from './components/api-key-storage'
import { STAGE_ATTRIBUTE } from './state/useStage'
import { resultEvent, serializeEvent, stageEvent } from './server/stage-events'
import { partialReasonMessage } from './server/analysis-copy'
import {
  AUDIT_CATEGORY_LABELS,
  AUDIT_MAX_SCORE,
  LLM_AXIS_LABELS,
  type AnalysisReport,
} from './core/report'
import {
  donePartialReport,
  errorLoadReport,
} from './core/__fixtures__/report-fixtures'

const TEST_URL = 'https://landing.example.com'

/** A well-formed but not-actually-valid key the user types for SC-3b. */
const INVALID_KEY = 'sk-invalid-real-key'

/** Types `key` into the API-key panel and presses Save to persist it. */
function enterAndSaveKey(key: string): void {
  fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel), {
    target: { value: key },
  })
  fireEvent.click(screen.getByRole('button', { name: API_KEY_PANEL_STRINGS.save }))
}

afterEach(() => {
  cleanup()
  document.body.removeAttribute(STAGE_ATTRIBUTE)
  downloadBlob.mockClear()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  window.localStorage.clear()
})

/**
 * A streaming `Response` body whose chunks are pushed on demand, so the test can
 * release one stage event at a time and observe the machine advance between them
 * (proving `ai → done-partial` happens without passing through `done`).
 */
function makeControlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  return {
    stream,
    push: (wire: string) => controller.enqueue(encoder.encode(wire)),
    close: () => controller.close(),
  }
}

/** A one-shot streaming `Response` that emits `wire` and closes immediately. */
function makeStaticStream(wire: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(wire))
      c.close()
    },
  })
}

function stageOf(): string | null {
  return document.body.getAttribute(STAGE_ATTRIBUTE)
}

/** Data-status of a single stepper step, read from the stepper region. */
function stepStatusOf(stepId: string): string | null {
  return (
    document
      .querySelector(`li[data-step="${stepId}"]`)
      ?.getAttribute('data-status') ?? null
  )
}

/** Reads a Blob's text via FileReader (jsdom's Blob has no `.text()`). */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

/** Builds a `done-partial` report from the confirmed fixture with a given reason. */
function partialReportWith(reason: string): AnalysisReport {
  return { ...donePartialReport, partialReason: reason }
}

describe('SC-3 — on AI evaluation failure, show the 60-point auto-audit partial result (M-3)', () => {
  /**
   * Drives {@link App} to a `done-partial` report over a controlled stream, one
   * stage event at a time, recording every `data-stage` transition. The initial
   * key state is applied via `setKey` (SC-3a leaves it empty; SC-3b types and
   * saves an invalid key). Returns the observed transition path for the caller to
   * assert `ai → done-partial` never passed through `done`.
   */
  async function driveToPartial(
    partialReason: string,
    setKey: () => void,
  ): Promise<{ observed: string[] }> {
    const controlled = makeControlledStream()
    const fetchMock = vi.fn(
      async () => ({ ok: true, body: controlled.stream }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchMock)

    const observed: string[] = []
    const observer = new MutationObserver(() => {
      const current = stageOf()
      if (current && observed[observed.length - 1] !== current) {
        observed.push(current)
      }
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [STAGE_ATTRIBUTE],
    })

    render(<App />)
    setKey()
    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value: TEST_URL },
    })
    fireEvent.click(screen.getByRole('button', { name: URL_FORM_STRINGS.start }))

    // Release the stage events one at a time so the stepper advances in order.
    controlled.push(serializeEvent(stageEvent('load')))
    controlled.push(serializeEvent(stageEvent('audit')))
    await waitFor(() => expect(stageOf()).toBe('audit'))
    controlled.push(serializeEvent(stageEvent('ai')))
    await waitFor(() => expect(stageOf()).toBe('ai'))

    // The AI step fails: the pipeline goes straight to done-partial (never done)
    // and streams the auto-audit-only report.
    controlled.push(serializeEvent(stageEvent('done-partial')))
    controlled.push(serializeEvent(resultEvent(partialReportWith(partialReason))))
    controlled.close()

    await waitFor(() => expect(stageOf()).toBe('done-partial'))
    observer.disconnect()
    return { observed }
  }

  /** Shared SC-3 assertions on the rendered partial report. */
  function assertPartialReport(partialReason: string): void {
    // The report renders (not blocked by an error card): the analysis region and
    // its gauge are present, not the error card region.
    const region = screen.getByRole('region', {
      name: REPORT_VIEW_STRINGS.regionLabel,
    })
    expect(
      screen.queryByRole('region', { name: REPORT_VIEW_STRINGS.errorLabel }),
    ).toBeNull()

    // Total is on the 60-point auto-audit scale, with the scale note.
    const meter = screen.getByRole('meter')
    expect(meter).toHaveProperty('ariaValueNow', String(donePartialReport.score.total))
    expect(meter).toHaveProperty('ariaValueMax', String(AUDIT_MAX_SCORE))
    expect(screen.getByText(REPORT_VIEW_STRINGS.partialScaleNote)).toBeDefined()

    // The grade badge is held: "Grade withheld", not a 100-point grade cut.
    expect(screen.getByText(GRADE_LABELS.pending)).toBeDefined()
    for (const full of [
      GRADE_LABELS.excellent,
      GRADE_LABELS.good,
      GRADE_LABELS.fair,
      GRADE_LABELS.poor,
    ]) {
      expect(screen.queryByText(full)).toBeNull()
    }

    // AI-axis cards + comments are replaced by the English partial notice.
    expect(screen.getByText(partialReason)).toBeDefined()
    for (const axisLabel of Object.values(LLM_AXIS_LABELS)) {
      expect(screen.queryByText(axisLabel)).toBeNull()
    }
    expect(screen.queryByText(REPORT_VIEW_STRINGS.aiCommentsHeading)).toBeNull()

    // The five category cards and the checklist render normally.
    for (const label of Object.values(AUDIT_CATEGORY_LABELS)) {
      expect(within(region).getAllByText(label).length).toBeGreaterThan(0)
    }
    expect(
      within(region).getByText('The hero image is excessively large at 2.4MB.'),
    ).toBeDefined()
    expect(within(region).getAllByText(/^Tip:/).length).toBeGreaterThan(0)
  }

  it('SC-3a — no key: ai→done-partial, 60-point report, AI notice, download', async () => {
    const reason = partialReasonMessage('missing-key')
    // SC-3a: the API-key field is left empty (the panel seeds it to '' on mount).
    const { observed } = await driveToPartial(reason, () => {
      /* leave the key empty — nothing typed or saved */
    })

    // The key really is empty (SC-3a precondition).
    expect(
      window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey) ?? '',
    ).toBe('')

    // ── ai → done-partial without passing through done ──────────────────────
    expect(observed).not.toContain('done')
    expect(observed[observed.length - 1]).toBe('done-partial')
    const aiIndex = observed.indexOf('ai')
    expect(aiIndex).toBeGreaterThanOrEqual(0)
    expect(observed[aiIndex + 1]).toBe('done-partial')
    // The stepper shows the AI step failed but the report step is still done.
    expect(stepStatusOf('ai')).toBe('error')
    expect(stepStatusOf('done')).toBe('done')

    assertPartialReport(reason)

    // The download still works and the file carries the 60-point note + reason.
    fireEvent.click(
      screen.getByRole('button', { name: REPORT_VIEW_STRINGS.download }),
    )
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [blob] = downloadBlob.mock.calls[0] as [Blob, string]
    const markdown = await readBlobText(blob)
    expect(markdown).toContain('out of 60, auto-audit only')
    expect(markdown).toContain(PARTIAL_REPORT_NOTICE)
    expect(markdown).toContain(reason)
  })

  it('SC-3b — invalid key (auth failure): same partial result + entered key never surfaced on screen/error/report/download', async () => {
    const reason = partialReasonMessage('invalid-key')
    // SC-3b: a well-formed but invalid key is typed and saved.
    const { observed } = await driveToPartial(reason, () => {
      enterAndSaveKey(INVALID_KEY)
    })

    // The invalid key was stored and travelled in the request body (auth attempt),
    // never on the URL.
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe(
      INVALID_KEY,
    )
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(calledUrl)).not.toContain(INVALID_KEY)
    expect(JSON.parse(init.body as string)).toMatchObject({
      apiKey: INVALID_KEY,
    })

    // Same partial outcome as SC-3a.
    expect(observed).not.toContain('done')
    expect(observed[observed.length - 1]).toBe('done-partial')
    assertPartialReport(reason)

    // ── Key no-leak: the entered key string appears nowhere a user can read it ─
    // Not in the rendered screen text (report, notice, form) …
    expect(document.body.textContent ?? '').not.toContain(INVALID_KEY)
    const region = screen.getByRole('region', {
      name: REPORT_VIEW_STRINGS.regionLabel,
    })
    expect(region.textContent ?? '').not.toContain(INVALID_KEY)
    // … and not in the AI-drop reason (which stands in for the AI error surface).
    expect(reason).not.toContain(INVALID_KEY)

    // … and not in the downloaded report file.
    fireEvent.click(
      screen.getByRole('button', { name: REPORT_VIEW_STRINGS.download }),
    )
    const [blob] = downloadBlob.mock.calls[0] as [Blob, string]
    const markdown = await readBlobText(blob)
    expect(markdown).not.toContain(INVALID_KEY)
  })
})

describe('SC-4 — pre-validation of invalid input (SSRF / URL format)', () => {
  it('SC-4a — non-http/https input: inline form error shown, no request sent (fetch not called), stepper not started', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    // A non-http(s) value: a valid string but the wrong scheme.
    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value: 'ftp://example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: URL_FORM_STRINGS.start }))

    // Inline form error appears immediately …
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe(URL_FORM_STRINGS.formatError)

    // … and no request was ever sent: the machine never left idle, the stepper
    // never started (page-load step stays pending), no report or error card.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(stageOf()).toBe('idle')
    expect(stepStatusOf('load')).toBe('pending')
    expect(
      screen.queryByRole('region', { name: REPORT_VIEW_STRINGS.regionLabel }),
    ).toBeNull()
    expect(
      screen.queryByRole('region', { name: REPORT_VIEW_STRINGS.errorLabel }),
    ).toBeNull()
  })

  it('SC-4b — private IP/localhost: transitions to error-load, shows only the English error card instead of ReportView', async () => {
    // The server detects the SSRF block during load and streams an error-load
    // result (private-address message). The request *is* sent — the URL is a
    // valid http URL — but no report is produced.
    const wire =
      serializeEvent(stageEvent('load')) +
      serializeEvent(stageEvent('error-load')) +
      serializeEvent(resultEvent(errorLoadReport))
    const fetchMock = vi.fn(
      async () => ({ ok: true, body: makeStaticStream(wire) }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchMock)

    // Record transitions to prove the flow never advances to audit / ai.
    const observed: string[] = []
    const observer = new MutationObserver(() => {
      const current = stageOf()
      if (current && observed[observed.length - 1] !== current) {
        observed.push(current)
      }
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [STAGE_ATTRIBUTE],
    })

    try {
      render(<App />)
      fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
        target: { value: errorLoadReport.url },
      })
      fireEvent.click(screen.getByRole('button', { name: URL_FORM_STRINGS.start }))

      // The request was sent (valid http URL — the form does not gate SSRF).
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // It transitions to error-load …
      await waitFor(() => expect(stageOf()).toBe('error-load'))

      // … never advancing to audit or ai.
      expect(observed).not.toContain('audit')
      expect(observed).not.toContain('ai')
      expect(stepStatusOf('load')).toBe('error')
      expect(stepStatusOf('audit')).toBe('pending')
      expect(stepStatusOf('ai')).toBe('pending')

      // Only the single English error card shows — no ReportView, no meter, no
      // download button.
      const errorRegion = screen.getByRole('region', {
        name: REPORT_VIEW_STRINGS.errorLabel,
      })
      expect(within(errorRegion).getByText(errorLoadReport.message)).toBeDefined()
      expect(
        screen.queryByRole('region', { name: REPORT_VIEW_STRINGS.regionLabel }),
      ).toBeNull()
      expect(screen.queryByRole('meter')).toBeNull()
      expect(
        screen.queryByRole('button', { name: REPORT_VIEW_STRINGS.download }),
      ).toBeNull()
    } finally {
      observer.disconnect()
    }
  })
})
