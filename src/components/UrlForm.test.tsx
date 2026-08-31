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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import UrlForm, { URL_FORM_STRINGS, isHttpUrl } from './UrlForm'
import type { StartResult } from '../state/stage'

afterEach(cleanup)

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
