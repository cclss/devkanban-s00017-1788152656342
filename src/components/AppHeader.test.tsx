// @vitest-environment jsdom
/**
 * Behaviour tests for {@link AppHeader}'s help entry point (design spec
 * §unified help screen / §additional accessibility requirements).
 *
 * Cover the contract this grain owns — not the dialog internals (grain-1): the
 * header exposes a labelled help button that advertises a dialog popup, opening
 * it reflects state via `aria-expanded` and surfaces the feature summary plus the
 * local-processing notice, and every close path (button / ESC) returns focus to
 * the trigger. jsdom is opted into per-file so the React-free core suite keeps its
 * fast `node` environment.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AppHeader from './AppHeader'
import { HELP_TEXT, LOCAL_PROCESSING_KEY } from '../strings/helpText'

afterEach(cleanup)

function getHelpButton() {
  return screen.getByRole('button', { name: 'Open help' })
}

describe('AppHeader help entry point', () => {
  it('renders a labelled help button that advertises a dialog and starts collapsed', () => {
    render(<AppHeader />)

    const button = getHelpButton()
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    // Closed by default: no dialog mounted.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the HelpDialog on click, reflecting the open state via aria-expanded', () => {
    render(<AppHeader />)
    const button = getHelpButton()

    fireEvent.click(button)

    expect(screen.getByRole('dialog')).toBeDefined()
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('shows the feature summary and the local-processing privacy notice when open', () => {
    render(<AppHeader />)
    fireEvent.click(getHelpButton())

    // A representative feature entry from the summary list.
    expect(screen.getByText(HELP_TEXT.exportAll.title)).toBeDefined()
    // The privacy / local-processing notice.
    const privacy = HELP_TEXT[LOCAL_PROCESSING_KEY]
    expect(screen.getByText(privacy.title)).toBeDefined()
    expect(screen.getByText(privacy.body)).toBeDefined()
    expect(privacy.body).toContain('never sends files to a server')
  })

  it('returns focus to the trigger when closed via the close button', () => {
    render(<AppHeader />)
    const button = getHelpButton()
    button.focus()
    fireEvent.click(button)

    fireEvent.click(screen.getByRole('button', { name: 'Close help' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
  })

  it('returns focus to the trigger when closed via the Escape key', () => {
    render(<AppHeader />)
    const button = getHelpButton()
    button.focus()
    fireEvent.click(button)

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})
