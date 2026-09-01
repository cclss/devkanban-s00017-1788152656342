// @vitest-environment jsdom
/**
 * Behaviour tests for {@link InfoTooltip} (design spec §additional accessibility requirements).
 *
 * Cover the component's contract, not its internals: it renders the help copy for
 * a given key, opens/closes via mouse (hover + click) and keyboard (Enter/Space/
 * ESC), closes on an outside click, and wires the ARIA attributes that link the
 * popover to its trigger. Rendering runs in jsdom via testing-library (opted in
 * per-file above so the React-free core suite keeps its fast `node` environment).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import InfoTooltip from './InfoTooltip'
import { HELP_TEXT } from '../strings/helpText'

afterEach(cleanup)

const KEY = 'splitByRange' as const
const { title, body } = HELP_TEXT[KEY]

function renderTooltip() {
  render(<InfoTooltip helpKey={KEY} />)
  return screen.getByRole('button')
}

describe('InfoTooltip', () => {
  it('renders a focusable trigger, closed, with the feature title in its name', () => {
    const trigger = renderTooltip()

    expect(trigger.getAttribute('aria-label')).toContain(title)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    // Copy is not shown until opened.
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(screen.queryByText(body)).toBeNull()
  })

  it('exposes a Tab-focusable trigger (a native, non-disabled button that takes focus)', () => {
    const trigger = renderTooltip()

    // A real <button> is in the tab order (Tab reaches it and Enter/Space
    // activate it natively). jsdom can't drive an actual Tab traversal without
    // user-event, so we assert the properties that put it in that order: it is a
    // genuine <button>, not disabled, and its tabIndex was not removed (-1).
    expect(trigger.tagName).toBe('BUTTON')
    expect((trigger as HTMLButtonElement).disabled).toBe(false)
    expect(trigger.tabIndex).not.toBe(-1)

    // And it actually accepts programmatic focus (the end state a Tab produces).
    trigger.focus()
    expect(document.activeElement).toBe(trigger)
  })

  it('opens and closes the popover on click, showing the help copy', () => {
    const trigger = renderTooltip()

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('tooltip')).toBeDefined()
    expect(screen.getByText(title)).toBeDefined()
    expect(screen.getByText(body)).toBeDefined()

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens on hover and closes when the pointer leaves', () => {
    const trigger = renderTooltip()
    const wrapper = trigger.parentElement as HTMLElement

    fireEvent.mouseEnter(wrapper)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('tooltip')).toBeDefined()

    fireEvent.mouseLeave(wrapper)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens via the Enter key and via the Space key', () => {
    const trigger = renderTooltip()

    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.keyDown(trigger, { key: ' ' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('closes on the Escape key', () => {
    const trigger = renderTooltip()

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('closes on an outside click but stays open for clicks inside', () => {
    const trigger = renderTooltip()

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    // A press inside the popover must not dismiss it.
    fireEvent.mouseDown(screen.getByRole('tooltip'))
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.mouseDown(document.body)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('links the popover to the trigger via aria-describedby only while open', () => {
    const trigger = renderTooltip()
    expect(trigger.getAttribute('aria-describedby')).toBeNull()

    fireEvent.click(trigger)
    const popover = screen.getByRole('tooltip')
    expect(popover.id).toBeTruthy()
    expect(trigger.getAttribute('aria-describedby')).toBe(popover.id)
  })

  it('uses a custom accessible label when provided', () => {
    render(<InfoTooltip helpKey={KEY} label="Custom label" />)
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Custom label')
  })

  describe('copy-agnostic entry path', () => {
    const entry = { title: 'URL to analyze', body: 'Enter the landing-page address to analyze.' }

    it('renders arbitrary copy from an entry prop, closed, with the title in its name', () => {
      render(<InfoTooltip entry={entry} />)
      const trigger = screen.getByRole('button')

      expect(trigger.getAttribute('aria-label')).toContain(entry.title)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(screen.queryByRole('tooltip')).toBeNull()
      expect(screen.queryByText(entry.body)).toBeNull()
    })

    it('opens and closes the entry copy in a role="tooltip" on click', () => {
      render(<InfoTooltip entry={entry} />)
      const trigger = screen.getByRole('button')

      fireEvent.click(trigger)
      const popover = screen.getByRole('tooltip')
      expect(popover).toBeDefined()
      expect(screen.getByText(entry.title)).toBeDefined()
      expect(screen.getByText(entry.body)).toBeDefined()
      expect(trigger.getAttribute('aria-describedby')).toBe(popover.id)

      fireEvent.click(trigger)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('accepts title/body passed inline instead of an entry object', () => {
      render(<InfoTooltip title="Screenshot tabs" body="Switch between desktop and mobile screenshots." />)
      const trigger = screen.getByRole('button')
      expect(trigger.getAttribute('aria-label')).toContain('Screenshot tabs')

      fireEvent.click(trigger)
      expect(screen.getByRole('tooltip')).toBeDefined()
      expect(screen.getByText('Switch between desktop and mobile screenshots.')).toBeDefined()
    })
  })
})
