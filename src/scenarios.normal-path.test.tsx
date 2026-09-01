// @vitest-environment jsdom
/**
 * Validation scenarios SC-1 · SC-2 (Story Measures M-1 · M-2), driven through the
 * assembled {@link App} — the normal (happy) path of the landing-page grader.
 *
 * These are the *scenario* proofs the grain asks for: not the unit coverage that
 * already locks each part (`analyze-client.test.ts`, `useAnalyze.hook.test.tsx`,
 * `ReportView.test.tsx`, `report-markdown.test.ts`), but an end-to-end walk of
 * what a user observes — a real `/api/analyze` run streamed over a mocked NDJSON
 * `Response`, no network — asserting the promised behaviour of the whole screen.
 *
 * - **SC-1 (M-1)** — enter a public URL with valid credentials, start the run, and
 *   watch the progress stepper advance `Page load → Auto audit → AI evaluation →
 *   Report done` in order, never skipping or regressing, every step ending
 *   `is-done`. On completion the report shows the total gauge + a real grade badge,
 *   the five auto-audit category cards, the three AI-axis cards, the desktop/mobile
 *   screenshot tabs, the checklist (message + English tip), and the AI comments /
 *   suggestions — all within a finite time budget (the 1-minute basis), measured
 *   from "Start diagnosis" to the final grade under the injected transport boundary.
 * - **SC-2 (M-2)** — from the completed report, clicking "Download markdown report"
 *   hands the byte-download boundary a Blob and a `landing-report-<host>-<ts>.md`
 *   filename, and the file's markdown carries the total, grade, per-category
 *   scores, per-check status + English tip, and the AI comments / suggestions.
 *
 * The streamed terminal report reuses the confirmed `done` fixture, so every
 * English string asserted here is the project's single confirmed source of that
 * copy (report labels, grade labels, category/axis labels, form/report strings)
 * — this suite introduces no new user-facing copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

// Mock only the byte-download boundary so the SC-2 download is observable without
// a real browser download; the markdown/filename builders stay real (their own
// suite covers them), so the Blob still carries the true report markdown.
const downloadBlob = vi.fn()
vi.mock('./core/download', () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}))

import App from './App'
import { URL_FORM_STRINGS } from './components/UrlForm'
import { REPORT_VIEW_STRINGS } from './components/ReportView'
import {
  PROGRESS_STEPPER_LABEL,
  PROGRESS_STEPS,
} from './components/ProgressStepper'
import { GRADE_LABELS } from './components/report-labels'
import { API_KEY_PANEL_STRINGS, API_KEY_PRESETS } from './components/testtools/ApiKeyPanel'
import { API_KEY_STORAGE_KEYS } from './components/testtools/api-key-storage'
import { STAGE_ATTRIBUTE } from './state/useStage'
import { resultEvent, serializeEvent, stageEvent } from './server/stage-events'
import {
  AUDIT_CATEGORY_LABELS,
  LLM_AXIS_LABELS,
  TOTAL_MAX_SCORE,
} from './core/report'
import { doneReport } from './core/__fixtures__/report-fixtures'

/**
 * Canonical forward order of the *in-flight* stages this run streams through
 * (the initial `idle` set on mount is not part of the run path). Used to assert
 * the observed `data-stage` transitions are sequential and never regress.
 */
const RUN_STAGE_ORDER = ['load', 'audit', 'ai', 'done'] as const

const TEST_URL = 'https://landing.example.com'

/** The grade cuts a normal (100-point) report may show — never "Grade withheld". */
const FULL_GRADE_LABELS = [
  GRADE_LABELS.excellent,
  GRADE_LABELS.good,
  GRADE_LABELS.fair,
  GRADE_LABELS.poor,
]

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
 * release one stage event at a time and observe the stepper advance between them
 * (proving the transitions are sequential and never batched past a step).
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

function stageOf(): string | null {
  return document.body.getAttribute(STAGE_ATTRIBUTE)
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

/** Data-status of a single stepper step, read from the stepper region. */
function stepStatusOf(stepId: string): string | null {
  const step = document
    .querySelector(`li[data-step="${stepId}"]`)
  return step?.getAttribute('data-status') ?? null
}

describe('SC-1 — normal diagnosis: 4 stages advance in order within 1 minute, final grade & report shown (M-1)', () => {
  it('streams load→audit→ai→done in order (no skip/regress) and renders the full report within the time budget', async () => {
    // Given: valid Anthropic / claude-sonnet-5 credentials and a public URL.
    const controlled = makeControlledStream()
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        ({ ok: true, body: controlled.stream }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchMock)

    // Record every data-stage transition so we can assert the exact forward path.
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
      // Enter valid credentials via the API-key test tool (valid-key preset).
      fireEvent.click(
        screen.getByRole('button', { name: API_KEY_PANEL_STRINGS.presetValid }),
      )
      expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe(
        API_KEY_PRESETS.valid,
      )

      // When: enter a public URL and start the diagnosis — the time budget clock
      // starts at the "Start diagnosis" click (M-1 basis: click → final grade).
      fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
        target: { value: TEST_URL },
      })
      const startedAt = performance.now()
      fireEvent.click(screen.getByRole('button', { name: URL_FORM_STRINGS.start }))

      // The request went out with the URL + credentials in the body, never the URL.
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [calledUrl, init] = fetchMock.mock.calls[0]
      expect(calledUrl).toBe('/api/analyze')
      expect(String(calledUrl)).not.toContain('landing.example.com')
      expect(JSON.parse(init.body as string)).toMatchObject({
        url: TEST_URL,
        apiKey: API_KEY_PRESETS.valid,
        provider: 'anthropic',
        model: 'claude-sonnet-5',
      })

      // Starting immediately enters `load`; the start button is disabled meanwhile.
      expect(stageOf()).toBe('load')
      expect(
        (screen.getByRole('button', { name: URL_FORM_STRINGS.start }) as HTMLButtonElement)
          .disabled,
      ).toBe(true)
      expect(stepStatusOf('load')).toBe('active')

      // Release the server's stage events one at a time, asserting the stepper
      // advances in order — the load step never leaves `done` once passed.
      controlled.push(serializeEvent(stageEvent('load')))
      controlled.push(serializeEvent(stageEvent('audit')))
      await waitFor(() => expect(stageOf()).toBe('audit'))
      expect(stepStatusOf('load')).toBe('done')
      expect(stepStatusOf('audit')).toBe('active')

      controlled.push(serializeEvent(stageEvent('ai')))
      await waitFor(() => expect(stageOf()).toBe('ai'))
      expect(stepStatusOf('audit')).toBe('done')
      expect(stepStatusOf('ai')).toBe('active')

      controlled.push(serializeEvent(stageEvent('done')))
      await waitFor(() => expect(stageOf()).toBe('done'))

      // The terminal report arrives and closes the stream.
      controlled.push(serializeEvent(resultEvent(doneReport)))
      controlled.close()

      // Then: the final grade badge is shown — the run is complete.
      const gradeBadge = await screen.findByText(GRADE_LABELS[doneReport.score.grade])
      const elapsedMs = performance.now() - startedAt

      // ── Time budget (M-1): the whole run finishes well inside the 1-minute basis.
      expect(elapsedMs).toBeLessThan(60_000)

      // ── 4 steps advanced sequentially and never regressed ──────────────────
      // The observed data-stage path is exactly the canonical forward order.
      expect(observed).toEqual([...RUN_STAGE_ORDER])
      // Strictly increasing canonical indices ⇒ sequential and non-regressing.
      const indices = observed.map((s) => RUN_STAGE_ORDER.indexOf(s as never))
      for (let i = 1; i < indices.length; i += 1) {
        expect(indices[i]).toBeGreaterThan(indices[i - 1])
      }
      // Every stepper step ends `is-done`.
      for (const step of PROGRESS_STEPS) {
        expect(stepStatusOf(step.id)).toBe('done')
      }
      expect(screen.getByRole('list', { name: PROGRESS_STEPPER_LABEL })).toBeDefined()

      // ── Total gauge + a real (100-point) grade badge ───────────────────────
      expect(screen.getByText(REPORT_VIEW_STRINGS.totalHeading)).toBeDefined()
      const meter = screen.getByRole('meter')
      expect(meter).toHaveProperty('ariaValueNow', String(doneReport.score.total))
      expect(meter).toHaveProperty('ariaValueMax', String(TOTAL_MAX_SCORE))
      expect(FULL_GRADE_LABELS).toContain(gradeBadge.textContent)
      // Not the partial-scale note nor the held grade on a full report.
      expect(screen.queryByText(REPORT_VIEW_STRINGS.partialScaleNote)).toBeNull()
      expect(screen.queryByText(GRADE_LABELS.pending)).toBeNull()

      // ── Five auto-audit category cards ─────────────────────────────────────
      for (const label of Object.values(AUDIT_CATEGORY_LABELS)) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0)
      }
      // ── Three AI-axis cards + comments ─────────────────────────────────────
      for (const label of Object.values(LLM_AXIS_LABELS)) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0)
      }

      // ── Desktop / mobile screenshot tabs ───────────────────────────────────
      const tabs = screen.getAllByRole('tab')
      expect(tabs).toHaveLength(2)
      expect(
        screen.getByRole('tab', { name: REPORT_VIEW_STRINGS.viewportLabels.desktop }),
      ).toBeDefined()
      expect(
        screen.getByRole('tab', { name: REPORT_VIEW_STRINGS.viewportLabels.mobile }),
      ).toBeDefined()

      // ── Checklist: a check message and its English tip render ───────────────
      expect(
        screen.getByText('The hero image is excessively large at 2.4MB.'),
      ).toBeDefined()
      expect(screen.getByText(/Convert to WebP and compress under 200KB/)).toBeDefined()
      // At least one tip line, prefixed with the "Tip" label.
      expect(screen.getAllByText(/^Tip:/).length).toBeGreaterThan(0)

      // ── AI comments + suggestions render (done only) ───────────────────────
      expect(screen.getByText(REPORT_VIEW_STRINGS.aiCommentsHeading)).toBeDefined()
      expect(
        screen.getByText('Whitespace and typographic hierarchy are clear, giving a clean first impression.'),
      ).toBeDefined()
      expect(screen.getAllByText(/^Suggestion:/).length).toBeGreaterThan(0)

      // ── The start control has flipped to "Start fresh" ─────────────────────
      expect(screen.getByRole('button', { name: URL_FORM_STRINGS.reset })).toBeDefined()
      expect(
        screen.queryByRole('button', { name: URL_FORM_STRINGS.start }),
      ).toBeNull()
    } finally {
      observer.disconnect()
    }
  })
})

/**
 * Drives {@link App} through a full successful run and returns once the completed
 * report (grade badge) is on screen — the shared precondition for SC-2.
 */
async function driveToCompletedReport(): Promise<void> {
  const wire =
    serializeEvent(stageEvent('load')) +
    serializeEvent(stageEvent('audit')) +
    serializeEvent(stageEvent('ai')) +
    serializeEvent(stageEvent('done')) +
    serializeEvent(resultEvent(doneReport))
  const fetchMock = vi.fn(async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(wire))
        c.close()
      },
    })
    return { ok: true, body } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)

  render(<App />)
  fireEvent.click(
    screen.getByRole('button', { name: API_KEY_PANEL_STRINGS.presetValid }),
  )
  fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
    target: { value: TEST_URL },
  })
  fireEvent.click(screen.getByRole('button', { name: URL_FORM_STRINGS.start }))

  await screen.findByText(GRADE_LABELS[doneReport.score.grade])
}

describe('SC-2 — download the completed report as markdown (M-2)', () => {
  it('downloads landing-report-<host>-<ts>.md with the score, grade, tips, and AI feedback', async () => {
    // Given: a completed report is on screen (SC-1 outcome).
    await driveToCompletedReport()

    // When: click "Download markdown report".
    fireEvent.click(
      screen.getByRole('button', { name: REPORT_VIEW_STRINGS.download }),
    )

    // Then: the byte-download boundary received a Blob + the SC-2 filename shape.
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [blob, filename] = downloadBlob.mock.calls[0] as [Blob, string]
    expect(blob).toBeInstanceOf(Blob)
    // landing-report-<host>-<YYYY-MM-DDThhmmss>.md
    expect(filename).toMatch(
      /^landing-report-.+-\d{4}-\d{2}-\d{2}T\d{6}\.md$/,
    )
    // Host + timestamp are derived from the report's URL and analyzedAt.
    expect(filename).toBe('landing-report-example.com-2026-08-31T090000.md')

    // And: the file's markdown carries the score, grade, per-category scores,
    // per-check status + English tips, and AI comments / suggestions.
    const markdown = await readBlobText(blob)
    expect(markdown).toContain('# Landing Page Quality Report')
    expect(markdown).toContain(`- Total score: ${doneReport.score.total} / ${TOTAL_MAX_SCORE}`)
    expect(markdown).toContain(`- Grade: ${GRADE_LABELS[doneReport.score.grade]}`)
    // Per-category score line (e.g. "### SEO (11/12)").
    expect(markdown).toMatch(/### SEO \(\d+\/\d+\)/)
    // Per-check status label + the improvement tip.
    expect(markdown).toContain('[Fail] Image optimization')
    expect(markdown).toContain('Tip: Convert to WebP and compress under 200KB to shorten initial load.')
    // AI axis comment + a concrete suggestion.
    expect(markdown).toContain('Whitespace and typographic hierarchy are clear, giving a clean first impression.')
    expect(markdown).toContain('Suggestion: Place the same CTA once more at the bottom of the scroll.')
    // A full report carries no partial-result notice.
    expect(markdown).not.toContain('Partial result notice')
  })
})
