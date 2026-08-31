import { useCallback, useEffect, useId, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import {
  HELP_FEATURE_KEYS,
  HELP_TEXT,
  LOCAL_PROCESSING_KEY,
} from '../strings/helpText'

/**
 * Unified help screen (spec: per-feature help system, definition §unified help screen).
 *
 * A modal that surveys every feature in one place: it lists all nine feature
 * entries (iterating {@link HELP_FEATURE_KEYS} → {@link HELP_TEXT}) as a
 * title/body summary, then closes with a distinct local-processing / privacy
 * notice ({@link LOCAL_PROCESSING_KEY}) reassuring the user that files never
 * leave the browser. Like {@link InfoTooltip}, the copy is read by key from the
 * central {@link HELP_TEXT} source — never inlined — so the per-feature tooltips
 * and this screen stay in sync.
 *
 * Accessibility (spec §additional accessibility requirements, unified help screen):
 * - `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the
 *   heading, so assistive tech announces it as a modal named by its title.
 * - Focus moves into the dialog on open and a Tab / Shift+Tab focus trap keeps
 *   it cycling within the panel.
 * - Closes via an explicit close button, the ESC key, or a click on the overlay
 *   outside the panel.
 * - The element focused before opening is restored when the dialog unmounts, so
 *   keyboard focus returns to the trigger that opened it (the trigger itself is
 *   wired in a later card).
 *
 * Presentational only: it takes an {@link onClose} callback and owns no app
 * state (design-system coding policy — no core logic in a view component).
 */
export interface HelpDialogProps {
  /** Invoked when the user dismisses the dialog (close button / ESC / overlay). */
  onClose: () => void
}

/** X glyph for the close button, drawn inline to match the app's other icons. */
function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Every tab-focusable element currently inside the panel, in DOM order. */
function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  const selector =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute('disabled'),
  )
}

export default function HelpDialog({ onClose }: HelpDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const headingId = useId()

  // Move focus into the dialog on open, and restore it to whatever held focus
  // before (the trigger) once the dialog unmounts — this is the focus-return
  // half of the spec's focus-trap requirement.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => previouslyFocused?.focus?.()
  }, [])

  // ESC (from anywhere) closes; Tab / Shift+Tab wrap within the panel so focus
  // never escapes the modal. The panel itself is the initial focus holder
  // (tabIndex -1), so a first Tab lands on the first real control.
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusable(panelRef.current)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || active === panelRef.current) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || active === panelRef.current) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  // A press that starts and ends on the overlay backdrop (not the panel) closes.
  const handleOverlayClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose()
    },
    [onClose],
  )

  const privacy = HELP_TEXT[LOCAL_PROCESSING_KEY]

  return (
    <div
      className="help-dialog__overlay"
      onMouseDown={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        className="help-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <header className="help-dialog__header">
          <h2 id={headingId} className="help-dialog__title">
            Help
          </h2>
          <button
            type="button"
            className="help-dialog__close"
            aria-label="Close help"
            onClick={onClose}
          >
            <CloseGlyph />
          </button>
        </header>

        <div className="help-dialog__content">
          <ul className="help-dialog__list">
            {HELP_FEATURE_KEYS.map((key) => {
              const { title, body } = HELP_TEXT[key]
              return (
                <li key={key} className="help-dialog__item">
                  <h3 className="help-dialog__item-title">{title}</h3>
                  <p className="help-dialog__item-body">{body}</p>
                </li>
              )
            })}
          </ul>

          <section className="help-dialog__privacy" aria-label={privacy.title}>
            <h3 className="help-dialog__privacy-title">{privacy.title}</h3>
            <p className="help-dialog__privacy-body">{privacy.body}</p>
          </section>
        </div>
      </div>
    </div>
  )
}
