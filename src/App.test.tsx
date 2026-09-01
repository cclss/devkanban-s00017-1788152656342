// @vitest-environment jsdom
/**
 * Integration (smoke) test for the assembled grader shell.
 *
 * Renders the whole {@link App} and drives the real wiring a tester meets: the
 * test-tools panel on top, then UrlForm → ProgressStepper → ReportView, all keyed
 * off the one `body[data-stage]` SSoT. It asserts the observable behaviour the
 * grain promises — the simulator transitions `data-stage` and the three blocks
 * per the rules, the conflict simulator blocks a start client-side, and the API
 * key panel persists its three localStorage keys.
 *
 * No heavy boundaries need mocking here: the grader flow is pure state + demo
 * data (no real `/api/analyze` in this grain).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import { URL_FORM_STRINGS } from './components/UrlForm'
import { REPORT_VIEW_STRINGS } from './components/ReportView'
import { PROGRESS_STEPPER_LABEL } from './components/ProgressStepper'
import { API_KEY_STORAGE_KEYS } from './components/api-key-storage'
import { API_KEY_PANEL_STRINGS } from './components/ApiKeyPanel'
import { URL_HISTORY_STORAGE_KEY } from './components/url-history'
import { TEST_TOOLS_PANEL_STRINGS } from './components/testtools/TestToolsPanel'

afterEach(() => {
  cleanup()
  document.body.removeAttribute('data-stage')
  vi.unstubAllGlobals()
})

beforeEach(() => {
  window.localStorage.clear()
})

function stageOf(): string | null {
  return document.body.getAttribute('data-stage')
}

/** Clicks a stage-simulator button by its stable `data-stage-target` attribute. */
function clickForceStage(target: string): void {
  const button = document.querySelector(`[data-stage-target="${target}"]`)
  if (button === null) throw new Error(`No stage-force button for "${target}"`)
  fireEvent.click(button)
}

/** Clicks a conflict-simulator button by its stable `data-conflict-mode` attribute. */
function clickConflictMode(mode: string): void {
  const button = document.querySelector(`[data-conflict-mode="${mode}"]`)
  if (button === null) throw new Error(`No conflict-mode button for "${mode}"`)
  fireEvent.click(button)
}

describe('App grader shell', () => {
  it('assembles the test-tools panel above the three blocks and starts idle', () => {
    render(<App />)
    // Test tools present.
    expect(screen.getByText(TEST_TOOLS_PANEL_STRINGS.title)).toBeDefined()
    // The three blocks: URL start button, the stepper region, and no report yet.
    expect(screen.getByRole('button', { name: URL_FORM_STRINGS.start })).toBeDefined()
    expect(screen.getByRole('list', { name: PROGRESS_STEPPER_LABEL })).toBeDefined()
    expect(stageOf()).toBe('idle')
    expect(screen.queryByText(REPORT_VIEW_STRINGS.totalHeading)).toBeNull()
  })

  it('persists the three API-key localStorage keys on mount', () => {
    render(<App />)
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.provider)).not.toBeNull()
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.model)).not.toBeNull()
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe('')
  })

  it('forcing done drives data-stage to done and shows the report', () => {
    render(<App />)
    clickForceStage('done')
    expect(stageOf()).toBe('done')
    // Report gauge + download appear; the URL form flips to the reset control.
    expect(screen.getByText(REPORT_VIEW_STRINGS.totalHeading)).toBeDefined()
    expect(screen.getByRole('button', { name: REPORT_VIEW_STRINGS.download })).toBeDefined()
    expect(screen.getByRole('button', { name: URL_FORM_STRINGS.reset })).toBeDefined()
  })

  it('forcing done-partial shows the 60-point partial note', () => {
    render(<App />)
    clickForceStage('done-partial')
    expect(stageOf()).toBe('done-partial')
    expect(screen.getByText(REPORT_VIEW_STRINGS.partialScaleNote)).toBeDefined()
  })

  it('forcing error-load hides the report gauge and shows only the error card', () => {
    render(<App />)
    clickForceStage('error-load')
    expect(stageOf()).toBe('error-load')
    expect(screen.queryByText(REPORT_VIEW_STRINGS.totalHeading)).toBeNull()
    expect(screen.getByRole('region', { name: REPORT_VIEW_STRINGS.errorLabel })).toBeDefined()
  })

  it('resets back to idle from a terminal via the idle stage button', () => {
    render(<App />)
    clickForceStage('done')
    expect(stageOf()).toBe('done')
    clickForceStage('idle')
    expect(stageOf()).toBe('idle')
    expect(screen.queryByText(REPORT_VIEW_STRINGS.totalHeading)).toBeNull()
  })

  it('starts a real run from idle: start POSTs /api/analyze (url in body) and enters load', () => {
    // A never-resolving fetch holds the run in `load` so the assertion sees the
    // synchronous transition without a real network call or later state churn.
    const fetchMock = vi.fn(
      (_url: string, _init: RequestInit) => new Promise<Response>(() => {}),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: URL_FORM_STRINGS.start }))

    expect(stageOf()).toBe('load')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = fetchMock.mock.calls[0]
    // The endpoint path carries no query — the URL rides the JSON body.
    expect(calledUrl).toBe('/api/analyze')
    expect(String(calledUrl)).not.toContain('example.com')
    expect(JSON.parse(init.body as string)).toMatchObject({ url: 'https://example.com' })
  })

  it('keeps the entered API key after a diagnosis fails to a partial result', async () => {
    // The run streams to done-partial (AI failure). The key the user typed must
    // still be present in the field and storage afterwards — a failed test must
    // not wipe the entered key.
    const body = [
      { type: 'stage', stage: 'load' },
      { type: 'stage', stage: 'audit' },
      { type: 'stage', stage: 'ai' },
      { type: 'stage', stage: 'done-partial' },
      {
        type: 'result',
        result: {
          outcome: 'done-partial',
          url: 'https://example.com',
          analyzedAt: '2026-09-01T00:00:00.000Z',
          score: {
            total: 40,
            max: 60,
            grade: 'pending',
            auditScore: 40,
            auditMax: 60,
            llmScore: null,
            llmMax: 40,
          },
          categories: [],
          llmAxes: null,
          screenshots: [],
          partialReason: 'No AI evaluation results: an API key error means only the auto-audit results are shown.',
        },
      },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n')
    const fetchMock = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(body))
              controller.close()
            },
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    const keyInput = screen.getByLabelText(
      API_KEY_PANEL_STRINGS.keyLabel,
    ) as HTMLInputElement
    fireEvent.change(keyInput, { target: { value: 'sk-keep-me' } })
    // The key is used from storage, so it must be saved before starting.
    fireEvent.click(screen.getByRole('button', { name: API_KEY_PANEL_STRINGS.save }))
    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: URL_FORM_STRINGS.start }))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(stageOf()).toBe('done-partial')
    expect(
      (screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel) as HTMLInputElement)
        .value,
    ).toBe('sk-keep-me')
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe(
      'sk-keep-me',
    )
  })

  it('conflict simulation blocks a start client-side with an inline error', () => {
    render(<App />)
    clickConflictMode('in-progress')
    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: URL_FORM_STRINGS.start }))
    // No transition happened and the client-side conflict error is shown.
    expect(stageOf()).toBe('idle')
    expect(screen.getByRole('alert').textContent).toBe(URL_FORM_STRINGS.conflictError)
  })

  it('keeps the typed API key when switching URLs via a saved-address chip', () => {
    // Seed a saved URL so the URL form shows a click-to-fill chip.
    window.localStorage.setItem(
      URL_HISTORY_STORAGE_KEY,
      JSON.stringify(['https://saved.example.com']),
    )
    render(<App />)

    // Type a key but do not save it — it lives only in the panel's state.
    const keyInput = screen.getByLabelText(
      API_KEY_PANEL_STRINGS.keyLabel,
    ) as HTMLInputElement
    fireEvent.change(keyInput, { target: { value: 'sk-typed-not-saved' } })

    // Click the saved-address chip to refill the URL input (re-renders App).
    fireEvent.click(
      screen.getByRole('button', { name: 'https://saved.example.com' }),
    )

    // The key input must still hold the typed value — switching URLs must not
    // wipe the key the user is still entering.
    expect(
      (screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel) as HTMLInputElement)
        .value,
    ).toBe('sk-typed-not-saved')
    expect(
      (screen.getByLabelText(URL_FORM_STRINGS.urlLabel) as HTMLInputElement).value,
    ).toBe('https://saved.example.com')
  })
})
