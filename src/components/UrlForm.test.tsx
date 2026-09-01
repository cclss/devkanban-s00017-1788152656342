// @vitest-environment jsdom
/**
 * Behaviour tests for {@link UrlForm} (grain-4).
 *
 * Covers the three rules the grain owns, driven only through the public props
 * contract (`stage` in, `onStart` / `onReset` out):
 * - Format validation: non-http(s) input shows an inline field-error and never
 *   calls `onStart` (no request is sent).
 * - Conflict: when the start machine reports `conflict`, the specified inline
 *   field-error is shown.
 * - Reset: terminal stages replace the start button with a "새로 진단" reset
 *   button wired to `onReset`; in-progress disables the start button.
 *
 * jsdom is opted into per-file so the React-free core suite keeps its fast
 * `node` environment.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import UrlForm, { URL_FORM_STRINGS, isHttpUrl } from './UrlForm'
import { MAX_SAVED_URLS, readUrlHistory } from './url-history'
import { CONTROL_HELP } from './control-help'
import type { StartResult } from '../state/stage'

afterEach(() => {
  cleanup()
  // The saved-address history persists in localStorage across renders; clear it
  // so each test starts from an empty history.
  window.localStorage.clear()
})

/** A clean "started" outcome, as the machine returns from idle. */
const started: StartResult = { stage: 'load', started: true, conflict: false }

function getStartButton() {
  return screen.getByRole('button', { name: URL_FORM_STRINGS.start })
}

describe('isHttpUrl', () => {
  it('accepts http and https URLs, rejects other schemes and non-URLs', () => {
    expect(isHttpUrl('http://example.com')).toBe(true)
    expect(isHttpUrl('https://example.com/path?q=1')).toBe(true)
    expect(isHttpUrl('  https://example.com  ')).toBe(true)
    expect(isHttpUrl('ftp://example.com')).toBe(false)
    expect(isHttpUrl('그냥텍스트')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
    expect(isHttpUrl('example.com')).toBe(false)
  })
})

describe('UrlForm — format validation', () => {
  it('shows an inline field-error and does not call onStart for a non-http(s) value', () => {
    const onStart = vi.fn<(url: string) => StartResult>(() => started)
    render(<UrlForm stage="idle" onStart={onStart} onReset={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value: 'ftp://example.com' },
    })
    fireEvent.click(getStartButton())

    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveProperty(
      'textContent',
      URL_FORM_STRINGS.formatError,
    )
  })

  it('does not call onStart for an empty input and shows the format error', () => {
    const onStart = vi.fn<(url: string) => StartResult>(() => started)
    render(<UrlForm stage="idle" onStart={onStart} onReset={vi.fn()} />)

    fireEvent.click(getStartButton())

    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(URL_FORM_STRINGS.formatError)
  })

  it('calls onStart with the trimmed URL for a valid http(s) value and clears any error', () => {
    const onStart = vi.fn<(url: string) => StartResult>(() => started)
    render(<UrlForm stage="idle" onStart={onStart} onReset={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value: '  https://example.com/landing  ' },
    })
    fireEvent.click(getStartButton())

    expect(onStart).toHaveBeenCalledWith('https://example.com/landing')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears a shown error as soon as the field is edited', () => {
    render(<UrlForm stage="idle" onStart={vi.fn(() => started)} onReset={vi.fn()} />)

    fireEvent.click(getStartButton())
    expect(screen.getByRole('alert')).toBeDefined()

    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value: 'h' },
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('UrlForm — conflict', () => {
  it('surfaces the conflict field-error when the start machine reports a conflict', () => {
    const conflict: StartResult = { stage: 'idle', started: false, conflict: true }
    const onStart = vi.fn<(url: string) => StartResult>(() => conflict)
    render(<UrlForm stage="idle" onStart={onStart} onReset={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(getStartButton())

    expect(onStart).toHaveBeenCalledWith('https://example.com')
    expect(screen.getByRole('alert').textContent).toBe(URL_FORM_STRINGS.conflictError)
    expect(URL_FORM_STRINGS.conflictError).toContain('이미 분석이 진행 중입니다')
  })
})

describe('UrlForm — saved addresses (up to 5)', () => {
  function getSavedGroup() {
    return screen.getByText(URL_FORM_STRINGS.savedLabel).parentElement as HTMLElement
  }

  function startUrl(value: string) {
    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value },
    })
    fireEvent.click(getStartButton())
  }

  it('has no saved section before any run', () => {
    render(<UrlForm stage="idle" onStart={vi.fn(() => started)} onReset={vi.fn()} />)
    expect(screen.queryByText(URL_FORM_STRINGS.savedLabel)).toBeNull()
  })

  it('saves a URL after a successful start and shows it as a chip', () => {
    render(<UrlForm stage="idle" onStart={vi.fn(() => started)} onReset={vi.fn()} />)

    startUrl('https://example.com/landing')

    expect(
      within(getSavedGroup()).getByRole('button', {
        name: 'https://example.com/landing',
      }),
    ).toBeDefined()
    // Persisted to storage, not just React state.
    expect(readUrlHistory()).toEqual(['https://example.com/landing'])
  })

  it('does not save a URL that fails format validation', () => {
    render(<UrlForm stage="idle" onStart={vi.fn(() => started)} onReset={vi.fn()} />)

    startUrl('ftp://example.com')

    expect(screen.queryByText(URL_FORM_STRINGS.savedLabel)).toBeNull()
    expect(readUrlHistory()).toEqual([])
  })

  it('does not save a URL when the start is blocked by a conflict', () => {
    const conflict: StartResult = { stage: 'idle', started: false, conflict: true }
    render(<UrlForm stage="idle" onStart={vi.fn(() => conflict)} onReset={vi.fn()} />)

    startUrl('https://example.com')

    expect(screen.queryByText(URL_FORM_STRINGS.savedLabel)).toBeNull()
    expect(readUrlHistory()).toEqual([])
  })

  it('restores saved addresses from storage on mount', () => {
    window.localStorage.setItem(
      'landing_grader_url_history',
      JSON.stringify(['https://saved-1.com', 'https://saved-2.com']),
    )
    render(<UrlForm stage="idle" onStart={vi.fn(() => started)} onReset={vi.fn()} />)

    const group = getSavedGroup()
    expect(within(group).getByRole('button', { name: 'https://saved-1.com' })).toBeDefined()
    expect(within(group).getByRole('button', { name: 'https://saved-2.com' })).toBeDefined()
  })

  it('fills the input from a saved chip without starting a run', () => {
    const onStart = vi.fn<(url: string) => StartResult>(() => started)
    window.localStorage.setItem(
      'landing_grader_url_history',
      JSON.stringify(['https://saved-1.com']),
    )
    render(<UrlForm stage="idle" onStart={onStart} onReset={vi.fn()} />)

    fireEvent.click(
      within(getSavedGroup()).getByRole('button', { name: 'https://saved-1.com' }),
    )

    expect(screen.getByLabelText(URL_FORM_STRINGS.urlLabel)).toHaveProperty(
      'value',
      'https://saved-1.com',
    )
    // Selecting a chip does not itself start a run.
    expect(onStart).not.toHaveBeenCalled()
  })

  it('keeps at most 5 saved addresses, newest first', () => {
    render(<UrlForm stage="idle" onStart={vi.fn(() => started)} onReset={vi.fn()} />)

    for (let i = 1; i <= 6; i += 1) {
      startUrl(`https://site-${i}.com`)
    }

    const stored = readUrlHistory()
    expect(stored).toHaveLength(MAX_SAVED_URLS)
    expect(stored[0]).toBe('https://site-6.com')
    expect(stored).not.toContain('https://site-1.com')
  })
})

describe('UrlForm — per-control ⓘ help', () => {
  function helpTrigger(entry: { title: string }) {
    return screen.getByRole('button', { name: `Help: ${entry.title}` })
  }

  it('renders an accessible ⓘ trigger for the URL input and the start button', () => {
    render(<UrlForm stage="idle" onStart={vi.fn(() => started)} onReset={vi.fn()} />)

    const urlHelp = helpTrigger(CONTROL_HELP.urlInput)
    expect(urlHelp.tagName).toBe('BUTTON')
    expect(urlHelp.getAttribute('aria-expanded')).toBe('false')
    expect(helpTrigger(CONTROL_HELP.startDiagnosis)).toBeDefined()
    // Help copy is not shown until the trigger is activated.
    expect(screen.queryByText(CONTROL_HELP.urlInput.body)).toBeNull()
  })

  it('reveals the matching help body when a ⓘ trigger is activated', () => {
    render(<UrlForm stage="idle" onStart={vi.fn(() => started)} onReset={vi.fn()} />)

    fireEvent.click(helpTrigger(CONTROL_HELP.startDiagnosis))
    expect(screen.getByText(CONTROL_HELP.startDiagnosis.body)).toBeDefined()
  })

  it('renders the saved-addresses ⓘ help without breaking the start control', () => {
    window.localStorage.setItem(
      'landing_grader_url_history',
      JSON.stringify(['https://saved-1.com']),
    )
    const onStart = vi.fn<(url: string) => StartResult>(() => started)
    render(<UrlForm stage="idle" onStart={onStart} onReset={vi.fn()} />)

    fireEvent.click(helpTrigger(CONTROL_HELP.savedUrls))
    expect(screen.getByText(CONTROL_HELP.savedUrls.body)).toBeDefined()
    // The start control still works after wiring the help icons.
    fireEvent.change(screen.getByLabelText(URL_FORM_STRINGS.urlLabel), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(getStartButton())
    expect(onStart).toHaveBeenCalledWith('https://example.com')
  })
})

describe('UrlForm — stage-linked start/reset controls', () => {
  it('enables the start button in idle', () => {
    render(<UrlForm stage="idle" onStart={vi.fn(() => started)} onReset={vi.fn()} />)
    expect(getStartButton()).toHaveProperty('disabled', false)
  })

  it('disables the start button and the input while a run is in progress', () => {
    render(<UrlForm stage="audit" onStart={vi.fn(() => started)} onReset={vi.fn()} />)

    expect(getStartButton()).toHaveProperty('disabled', true)
    expect(screen.getByLabelText(URL_FORM_STRINGS.urlLabel)).toHaveProperty(
      'disabled',
      true,
    )
    // No reset button while running.
    expect(screen.queryByRole('button', { name: URL_FORM_STRINGS.reset })).toBeNull()
  })

  it.each(['done', 'done-partial', 'error-load'] as const)(
    'replaces the start button with a reset button wired to onReset in the %s terminal stage',
    (stage) => {
      const onReset = vi.fn()
      render(<UrlForm stage={stage} onStart={vi.fn(() => started)} onReset={onReset} />)

      // Start button is gone; reset button is present.
      expect(screen.queryByRole('button', { name: URL_FORM_STRINGS.start })).toBeNull()
      const resetButton = screen.getByRole('button', { name: URL_FORM_STRINGS.reset })

      fireEvent.click(resetButton)
      expect(onReset).toHaveBeenCalledTimes(1)
    },
  )
})
