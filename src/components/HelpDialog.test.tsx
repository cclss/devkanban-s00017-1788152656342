// @vitest-environment jsdom
/**
 * Behaviour tests for {@link HelpDialog} (design spec §additional accessibility requirements,
 * unified help screen).
 *
 * Cover the component's contract, not its internals: it renders every feature's
 * help copy plus the local-processing notice, exposes dialog semantics, closes
 * via the close button / ESC / an overlay click, moves focus inside on open, and
 * traps Tab within the panel. jsdom is opted into per-file so the React-free core
 * suite keeps its fast `node` environment.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import HelpDialog from './HelpDialog'
import {
  HELP_FEATURE_KEYS,
  HELP_TEXT,
  LOCAL_PROCESSING_KEY,
} from '../strings/helpText'

afterEach(cleanup)

function renderDialog() {
  const onClose = vi.fn()
  render(<HelpDialog onClose={onClose} />)
  return { onClose, dialog: screen.getByRole('dialog') }
}

describe('HelpDialog', () => {
  it('renders every feature title and body', () => {
    renderDialog()

    expect(HELP_FEATURE_KEYS).toHaveLength(9)
    for (const key of HELP_FEATURE_KEYS) {
      const { title, body } = HELP_TEXT[key]
      expect(screen.getByText(title)).toBeDefined()
      expect(screen.getByText(body)).toBeDefined()
    }
  })

  it('renders the local-processing / privacy notice', () => {
    renderDialog()

    const { title, body } = HELP_TEXT[LOCAL_PROCESSING_KEY]
    expect(screen.getByText(title)).toBeDefined()
    expect(screen.getByText(body)).toBeDefined()
    // The notice mentions files are not sent to a server.
    expect(body).toContain('never sends files to a server')
  })

  it('exposes dialog semantics: role, aria-modal, and a labelling heading', () => {
    const { dialog } = renderDialog()

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const heading = document.getElementById(labelledBy as string)
    expect(heading).not.toBeNull()
    expect(heading?.textContent).toBe('Help')
  })

  it('closes via the explicit close button', () => {
    const { onClose } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Close help' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on the Escape key', () => {
    const { onClose, dialog } = renderDialog()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on an overlay (outside) click but not on a click inside the panel', () => {
    const { onClose, dialog } = renderDialog()
    const overlay = dialog.parentElement as HTMLElement

    // A press on the panel (inside) must not dismiss.
    fireEvent.mouseDown(dialog)
    expect(onClose).not.toHaveBeenCalled()

    // A press on the backdrop (outside the panel) dismisses.
    fireEvent.mouseDown(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus inside the dialog on open', () => {
    const { dialog } = renderDialog()

    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('traps Tab and Shift+Tab within the dialog, wrapping at the edges', () => {
    const { dialog } = renderDialog()
    const closeButton = screen.getByRole('button', { name: 'Close help' })

    // Tab from the last focusable wraps to the first (here the sole control).
    closeButton.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)

    // Shift+Tab from the first focusable wraps back to the last.
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(closeButton)

    // A Tab issued while the panel itself holds focus lands on the first control.
    dialog.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)
  })
})
