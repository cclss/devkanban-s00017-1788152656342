import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { HELP_TEXT } from '../strings/helpText'
import type { HelpKey } from '../strings/helpText'

/**
 * Accessible per-feature info icon (spec: per-feature help system, definition §info icon).
 *
 * A small ⓘ trigger placed next to a feature; hovering or activating it reveals a
 * popover with that one feature's help copy. The copy is never inlined — it is
 * read by key from the central {@link HELP_TEXT} source so the per-feature
 * tooltips and the later unified help screen stay in sync.
 *
 * Accessibility (spec §additional accessibility requirements):
 * - The trigger is a real `<button>`: Tab-focusable, and Enter/Space open it.
 * - `aria-expanded` on the trigger tells assistive tech the open state.
 * - While open, `aria-describedby` links the trigger to the popover (`role=
 *   "tooltip"`) so a screen reader announces the description with the control.
 * - ESC and an outside click both close it.
 *
 * Presentational only: it consumes {@link HELP_TEXT} by key and owns no app
 * logic (design-system coding policy — no core logic in a view component).
 */
export interface InfoTooltipProps {
  /** Which feature's help copy to show — indexes {@link HELP_TEXT}. */
  helpKey: HelpKey
  /**
   * Optional override for the trigger's accessible name. Defaults to
   * `"Help: {title}"` so screen-reader users hear which feature it explains.
   */
  label?: string
  /** Extra class(es) appended to the wrapper, for placement by host components. */
  className?: string
}

/** Info glyph (ⓘ) drawn inline to match the app's other inline-SVG icons. */
function InfoGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 11v5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" />
    </svg>
  )
}

export default function InfoTooltip({ helpKey, label, className }: InfoTooltipProps) {
  const { title, body } = HELP_TEXT[helpKey]

  // Two independent open sources so a hover-open and a click-pinned state don't
  // fight: the popover is visible if either is active.
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const isOpen = hovered || pinned

  const wrapperRef = useRef<HTMLSpanElement>(null)
  const popoverId = useId()

  const close = useCallback(() => {
    setHovered(false)
    setPinned(false)
  }, [])

  // While open, ESC (anywhere) and an outside pointer press both dismiss it.
  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [isOpen, close])

  // Enter/Space toggle the pinned state; preventDefault stops the browser's own
  // button activation (Enter→click, Space→scroll/click) from double-toggling.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      setPinned((prev) => !prev)
    } else if (event.key === 'Escape') {
      close()
    }
  }

  return (
    <span
      ref={wrapperRef}
      className={`info-tooltip${className ? ` ${className}` : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="info-tooltip__trigger"
        aria-label={label ?? `Help: ${title}`}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? popoverId : undefined}
        onClick={() => setPinned((prev) => !prev)}
        onKeyDown={handleKeyDown}
      >
        <InfoGlyph />
      </button>

      {isOpen ? (
        <span className="info-tooltip__popover" id={popoverId} role="tooltip">
          <span className="info-tooltip__title">{title}</span>
          <span className="info-tooltip__body">{body}</span>
        </span>
      ) : null}
    </span>
  )
}
