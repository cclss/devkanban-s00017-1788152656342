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
import { API_KEY_STORAGE_KEYS } from './components/testtools/api-key-storage'

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

describe('App grader shell', () => {
  it('assembles the test-tools panel above the three blocks and starts idle', () => {
    render(<App />)
    // Test tools present.
    expect(screen.getByText('테스트 도구')).toBeDefined()
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

  it('forcing 완료(정상) drives data-stage to done and shows the report', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '완료(정상)' }))
    expect(stageOf()).toBe('done')
    // Report gauge + download appear; the URL form flips to the reset control.
    expect(screen.getByText(REPORT_VIEW_STRINGS.totalHeading)).toBeDefined()
    expect(screen.getByRole('button', { name: REPORT_VIEW_STRINGS.download })).toBeDefined()
    expect(screen.getByRole('button', { name: URL_FORM_STRINGS.reset })).toBeDefined()
  })

  it('forcing 완료(부분결과) shows the 60-point partial note', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '완료(AI 실패·부분결과)' }))
    expect(stageOf()).toBe('done-partial')
    expect(screen.getByText(REPORT_VIEW_STRINGS.partialScaleNote)).toBeDefined()
  })

  it('forcing 에러(로드 실패) hides the report gauge and shows only the error card', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '에러(로드 실패)' }))
    expect(stageOf()).toBe('error-load')
    expect(screen.queryByText(REPORT_VIEW_STRINGS.totalHeading)).toBeNull()
    expect(screen.getByRole('region', { name: REPORT_VIEW_STRINGS.errorLabel })).toBeDefined()
  })

  it('resets back to idle from a terminal via 대기', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '완료(정상)' }))
    expect(stageOf()).toBe('done')
    fireEvent.click(screen.getByRole('button', { name: '대기' }))
    expect(stageOf()).toBe('idle')
    expect(screen.queryByText(REPORT_VIEW_STRINGS.totalHeading)).toBeNull()
  })

  it('starts a real run from idle: 진단 시작 POSTs /api/analyze (url in body) and enters load', () => {
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

  it('conflict simulation blocks a start client-side with an inline error', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '이미 분석 진행 중' }))
    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: URL_FORM_STRINGS.start }))
    // No transition happened and the client-side conflict error is shown.
    expect(stageOf()).toBe('idle')
    expect(screen.getByRole('alert').textContent).toBe(URL_FORM_STRINGS.conflictError)
  })
})
