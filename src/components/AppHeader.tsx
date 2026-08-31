import { useCallback, useRef, useState } from 'react'
import { strings } from '../strings'
import HelpDialog from './HelpDialog'

/**
 * App shell header: brand mark, product title, the working-name badge, and the
 * help entry point (design spec §unified help screen entry point).
 *
 * The badge shows the interim project code (`s00011-pdftool`) until a brand
 * name is confirmed (design spec §1). All display copy is drawn from the central
 * strings module.
 *
 * Help entry point (spec: per-feature help system, §unified help screen / §accessibility requirements):
 * - A labelled ⓘ button lives in the header's action area. It carries
 *   `aria-haspopup="dialog"` and reflects its open state via `aria-expanded`.
 * - Clicking it (or activating with Enter/Space — it is a real `<button>`) mounts
 *   the {@link HelpDialog}. This component owns only the open/close state and the
 *   trigger placement; the dialog internals, focus trap and copy live in
 *   HelpDialog / the central `HELP_TEXT` source.
 * - On close (close button / ESC / overlay), focus is returned to this trigger via
 *   a stored ref so keyboard users land back where they left off.
 */

/** Info glyph (ⓘ) drawn inline to match the app's other inline-SVG icons. */
function HelpGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" />
    </svg>
  )
}

export default function AppHeader() {
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const openHelp = useCallback(() => setIsHelpOpen(true), [])

  // Close and return focus to the trigger so keyboard users resume where they
  // were. HelpDialog also self-restores focus on unmount; we point both at the
  // same button, which is idempotent.
  const closeHelp = useCallback(() => {
    setIsHelpOpen(false)
    triggerRef.current?.focus()
  }, [])

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M9 13h6" />
            <path d="M9 17h4" />
          </svg>
        </span>
        <div>
          <h1 className="app-header__title">{strings.header.title}</h1>
          <p className="app-header__subtitle">{strings.header.subtitle}</p>
        </div>
      </div>

      <div className="app-header__actions">
        <span className="app-header__job-badge">s00011-pdftool</span>
        <button
          ref={triggerRef}
          type="button"
          className="app-header__help"
          aria-label="Open help"
          aria-haspopup="dialog"
          aria-expanded={isHelpOpen}
          onClick={openHelp}
        >
          <HelpGlyph />
        </button>
      </div>

      {isHelpOpen ? <HelpDialog onClose={closeHelp} /> : null}
    </header>
  )
}
