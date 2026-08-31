// @vitest-environment jsdom
/**
 * Integration test for the assembled help system (design spec: per-feature help
 * system, §accessibility requirements, Measure M-1/M-2/M-3).
 *
 * The per-component contracts already have unit coverage (InfoTooltip.test.tsx,
 * HelpDialog.test.tsx, and the placement smoke tests in Toolbar/Dropzone/PageGrid
 * tests). This layer renders the whole {@link App} with one mock PDF loaded so the
 * real header + toolbar + dropzone + page grid are all mounted together, and
 * verifies the help system end to end as a user meets it:
 *
 * - **M-1** every one of the six *placed* info icons sits near its feature and
 *   reveals that feature's `HELP_TEXT` body when activated. (The 3 unplaced keys —
 *   exportSelected/rotate/thumbnailPreview — are surveyed only inside the unified
 *   HelpDialog, covered by HelpDialog.test.tsx, so they are out of scope here.)
 * - **M-2** the header entry point opens the unified HelpDialog, the local-only
 *   privacy notice ("…never sends files to a server…") is shown, and it closes via all three
 *   documented paths: the close button, ESC, and an overlay (outside) click.
 * - **M-3** keyboard-only reachability: the header trigger is a focusable native
 *   button (so Enter/Space activate it in a browser), ESC closes the dialog and
 *   returns focus to that trigger, focus is trapped inside the open dialog, and an
 *   info-icon trigger is focusable and opens via the Enter key.
 *
 * The two heavy boundaries are mocked exactly as in App.test.tsx so the test stays
 * fast and deterministic: the pdf-source loader (a dummy File → a ready 2-page
 * SourceFile) and the pdf.js/canvas-backed ThumbnailRenderer, plus a no-op
 * IntersectionObserver stub (jsdom has none). Loading one file mounts PageGrid so
 * the grid-top (reorder) and in-card (delete) icons exist.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { strings } from './strings'
import { HELP_TEXT } from './strings/helpText'
import type { HelpKey } from './strings/helpText'

// Stub the pdf.js-backed rasteriser: App constructs one ThumbnailRenderer and
// hands it to every card. The dummy never touches pdf.js or a real canvas.
vi.mock('./core/thumbnail', () => {
  class ThumbnailRenderer {
    async render() {
      return { cacheKey: 'k', dataUrl: 'data:image/png;base64,', width: 1, height: 1 }
    }
    async forget() {}
    get cachedDocumentCount() {
      return 0
    }
  }
  return { ThumbnailRenderer }
})

// Stub the loader so a dummy File resolves to a valid 2-page SourceFile without
// any real PDF parsing. `useSourceFiles` imports this same module.
vi.mock('./core/pdf-source', () => ({
  loadSourceFile: vi.fn(
    async (input: File | ArrayBuffer, options: { id?: string; name?: string } = {}) => ({
      ok: true,
      file: {
        id: options.id ?? 'src-1',
        name: options.name ?? (input instanceof ArrayBuffer ? 'document.pdf' : input.name),
        bytes: new ArrayBuffer(0),
        pageCount: 2,
      },
    }),
  ),
}))

import App from './App'

// jsdom has no IntersectionObserver; a no-op stub keeps the lazy-render effect
// from firing so the cards mount without attempting a rasterise.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function pdfFile(name = 'sample.pdf'): File {
  return new File(['%PDF-1.4 dummy'], name, { type: 'application/pdf' })
}

/** The default accessible name InfoTooltip gives a trigger for `key`. */
const infoName = (key: HelpKey) => `Help: ${HELP_TEXT[key].title}`

/**
 * Render App and load one mock PDF so PageGrid mounts (2 pages). Returns once the
 * grid title reflects the derived page count, i.e. the whole shell is assembled.
 */
async function renderAppWithPdf() {
  vi.stubGlobal('IntersectionObserver', NoopIntersectionObserver)
  const utils = render(<App />)

  const input = utils.container.querySelector(
    'input[type="file"][accept="application/pdf"]',
  ) as HTMLInputElement

  await act(async () => {
    fireEvent.change(input, { target: { files: [pdfFile()] } })
  })

  // The grid is present once its count title renders (2 pages from the mock).
  // Scope to the grid heading: the same "2 pages" copy also appears in the
  // loaded-file list, so match the title element specifically.
  await screen.findByText(strings.pageGrid.title(2), {
    selector: '.page-grid__title',
  })
  return utils
}

// The six info-icon placements this spec wires into the assembled app. `delete`
// renders once per page card (two here), so it is queried with *All.
const PLACED_KEYS: HelpKey[] = [
  'exportAll',
  'splitByCount',
  'splitByRange',
  'dropzone',
  'reorder',
  'delete',
]

describe('App help system — M-1: placed info icons render and reveal their copy', () => {
  it('shows all six placed info icons near their features', async () => {
    await renderAppWithPdf()

    for (const key of PLACED_KEYS) {
      const triggers = screen.getAllByRole('button', { name: infoName(key) })
      expect(triggers.length).toBeGreaterThan(0)
    }
  })

  it.each(PLACED_KEYS)(
    'reveals the %s feature help body only after its icon is activated',
    async (key) => {
      await renderAppWithPdf()
      const { body } = HELP_TEXT[key]

      // Closed by default — the body is not on screen.
      expect(screen.queryByText(body)).toBeNull()

      // Activate the first placement of this key (delete has one per card).
      const [trigger] = screen.getAllByRole('button', { name: infoName(key) })
      fireEvent.click(trigger)

      expect(screen.getByText(body)).toBeTruthy()
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    },
  )
})

describe('App help system — M-2: unified help dialog opens, informs, and closes', () => {
  const openHelp = () => {
    const trigger = screen.getByRole('button', { name: 'Open help' })
    fireEvent.click(trigger)
    return { trigger, dialog: screen.getByRole('dialog') }
  }

  it('opens the HelpDialog from the header and shows the local-only privacy notice', async () => {
    await renderAppWithPdf()

    // No dialog until the header entry point is used.
    expect(screen.queryByRole('dialog')).toBeNull()

    const { dialog } = openHelp()
    expect(dialog.getAttribute('aria-modal')).toBe('true')

    // The privacy paragraph reassuring the user files are not sent to a server.
    expect(within(dialog).getByText(/never sends files to a server/)).toBeTruthy()
  })

  it('closes via the explicit close button', async () => {
    await renderAppWithPdf()
    const { dialog } = openHelp()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close help' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on the Escape key', async () => {
    await renderAppWithPdf()
    const { dialog } = openHelp()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on an overlay (outside) click but not on a press inside the panel', async () => {
    await renderAppWithPdf()
    const { dialog } = openHelp()
    const overlay = dialog.parentElement as HTMLElement

    // A press on the panel itself must not dismiss.
    fireEvent.mouseDown(dialog)
    expect(screen.queryByRole('dialog')).not.toBeNull()

    // A press on the backdrop outside the panel closes.
    fireEvent.mouseDown(overlay)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('App help system — M-3: keyboard-only reachability', () => {
  it('exposes the header trigger as a focusable native button (Enter/Space activatable)', async () => {
    await renderAppWithPdf()
    const trigger = screen.getByRole('button', {
      name: 'Open help',
    }) as HTMLButtonElement

    // A real <button> gets Enter/Space activation from the browser for free; the
    // guarantee we can assert in jsdom is that it *is* such a button, is not
    // disabled, and accepts keyboard focus (tabIndex not removed).
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.disabled).toBe(false)
    expect(trigger.tabIndex).not.toBe(-1)

    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    // Activating it (what Enter/Space do on a focused button) opens the dialog.
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('moves focus into the dialog on open and traps Tab within it', async () => {
    await renderAppWithPdf()
    fireEvent.click(screen.getByRole('button', { name: 'Open help' }))
    const dialog = screen.getByRole('dialog')

    // Focus moved inside the dialog (the panel holds initial focus).
    expect(dialog.contains(document.activeElement)).toBe(true)

    // Tab from the last focusable wraps to the first (here the sole close button),
    // so focus never escapes the modal.
    const closeButton = within(dialog).getByRole('button', { name: 'Close help' })
    closeButton.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(closeButton)

    // Shift+Tab from the first focusable wraps back to the last — still trapped.
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('closes on ESC and returns focus to the header trigger', async () => {
    await renderAppWithPdf()
    const trigger = screen.getByRole('button', {
      name: 'Open help',
    }) as HTMLButtonElement

    // Open from a focused trigger so the pre-open focus owner is the trigger.
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog')

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    // Focus is restored to the trigger the keyboard user opened it from.
    expect(document.activeElement).toBe(trigger)
  })

  it('exposes an info-icon trigger as focusable and opens it via the Enter key', async () => {
    await renderAppWithPdf()

    // The grid-top reorder icon: a single, unambiguous placement.
    const trigger = screen.getByRole('button', {
      name: infoName('reorder'),
    }) as HTMLButtonElement
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.tabIndex).not.toBe(-1)

    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    // InfoTooltip wires an explicit Enter handler, so the keyboard path opens it.
    expect(screen.queryByText(HELP_TEXT.reorder.body)).toBeNull()
    fireEvent.keyDown(trigger, { key: 'Enter' })

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(HELP_TEXT.reorder.body)).toBeTruthy()
  })
})
