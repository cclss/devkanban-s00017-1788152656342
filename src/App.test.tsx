// @vitest-environment jsdom
/**
 * Smoke test for the core workspace flow: load a file → show the page grid →
 * enable the export button.
 *
 * This is the UI-integration (smoke) layer, not a unit test — it renders the
 * whole {@link App} and drives the real load → derive → render wiring end to
 * end, asserting only the observable transition a user sees. The two heavy
 * boundaries are isolated so the test stays fast and deterministic:
 *
 * - `./core/pdf-source` `loadSourceFile` is mocked to return a ready
 *   {@link SourceFile} (2 pages) — no real pdf-lib parsing of dummy bytes.
 * - `./core/thumbnail` `ThumbnailRenderer` is stubbed — no pdf.js worker /
 *   canvas rasterisation (which jsdom cannot do).
 *
 * Removing either mock (or breaking the load→grid→enable wiring) makes the
 * assertions fail: dummy bytes would be rejected as corrupt, so no pages would
 * appear and Export All would stay disabled.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

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

// jsdom has no IntersectionObserver; the cards degrade gracefully without it,
// but a no-op stub keeps the lazy-render effect from firing so the smoke test
// stays focused on the load→grid→enable transition.
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

describe('App workspace smoke flow', () => {
  it('goes Export All disabled → load file → grid shown → button enabled', async () => {
    vi.stubGlobal('IntersectionObserver', NoopIntersectionObserver)

    const { container } = render(<App />)

    // Before any file loads, the merge action is disabled and no grid exists.
    const exportButton = screen.getByRole('button', {
      name: 'Export All',
    }) as HTMLButtonElement
    expect(exportButton.disabled).toBe(true)
    expect(screen.queryByText(/^\d+ pages$/)).toBeNull()

    // The hidden file input inside the PDF drop surface.
    const input = container.querySelector(
      'input[type="file"][accept="application/pdf"]',
    ) as HTMLInputElement
    expect(input).not.toBeNull()

    // Load one dummy PDF through the (mocked) loader.
    await act(async () => {
      fireEvent.change(input, { target: { files: [pdfFile()] } })
    })

    // The page grid appears with a heading reflecting the derived page count.
    // Queried by role so it can't collide with the Dropzone per-file page-count
    // badge, which shares the same "N pages" wording in a different region.
    expect(
      await screen.findByRole('heading', { name: '2 pages' }),
    ).toBeDefined()

    // …and the merge action has transitioned to enabled.
    const exportAfter = screen.getByRole('button', {
      name: 'Export All',
    }) as HTMLButtonElement
    expect(exportAfter.disabled).toBe(false)
  })
})
