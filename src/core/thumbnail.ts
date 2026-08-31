/**
 * pdf.js-backed thumbnail rasteriser (lazy thumbnail rendering).
 *
 * This is the isolation boundary for pdf.js. Everything that actually touches
 * pdf.js or the DOM canvas lives
 * here; the numeric/keying logic ({@link ./thumbnail-scale}) and the load-cache
 * contract ({@link ./document-cache}) are pure, pdf.js-free, and unit tested on
 * their own. Page rasterisation is delegated to the pdf.js **worker** — merely
 * setting `GlobalWorkerOptions.workerSrc` makes pdf.js parse and paint off the
 * main thread, which is what keeps the UI responsive on large files.
 *
 * Node/test note: this module statically imports pdf.js and a Vite `?url`
 * asset, so it is only importable inside the browser/Vite build. Unit tests
 * import the pure helpers from `./thumbnail-scale` and `./document-cache`
 * directly and never load this file.
 */
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist'
// Vite resolves this to a hashed URL for the pre-built worker bundle. Pointing
// `workerSrc` at it is what routes pdf.js parsing/rendering into a Web Worker.
import PdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { AsyncKeyedCache } from './document-cache'
import {
  computeRenderScale,
  thumbnailCacheKey,
  thumbnailPixelSize,
  type PixelSize,
} from './thumbnail-scale'

// Re-export the pure helpers so consumers can import the whole thumbnail
// surface from one module without reaching into the split internals.
export {
  computeRenderScale,
  thumbnailCacheKey,
  thumbnailPixelSize,
  MIN_RENDER_SCALE,
  MAX_RENDER_SCALE,
} from './thumbnail-scale'
export type { PixelSize } from './thumbnail-scale'
export { AsyncKeyedCache } from './document-cache'

// Route parsing/rendering to the worker exactly once at module load.
pdfjs.GlobalWorkerOptions.workerSrc = PdfjsWorkerUrl

/** Encoded raster output of a rendered page. */
export type ThumbnailFormat = 'image/png' | 'image/jpeg'

/** A request to rasterise one page of one source document. */
export interface ThumbnailRequest {
  /** Stable id of the source file; used as the document-load cache key. */
  sourceId: string
  /** Original PDF bytes (never mutated — a copy is handed to pdf.js). */
  bytes: ArrayBuffer
  /** Zero-based page index within the document. */
  pageIndex: number
  /** Desired thumbnail width in device pixels. */
  targetWidth: number
  /** Encoded output format. Defaults to `image/png`. */
  format?: ThumbnailFormat
  /** JPEG/WebP quality in [0, 1]; ignored for PNG. Defaults to 0.82. */
  quality?: number
}

/** A rendered thumbnail plus the device-pixel size it was drawn at. */
export interface Thumbnail {
  /** Stable key identifying this (source, page, width) triple. */
  cacheKey: string
  /** Encoded raster as a `data:` URL, ready for an `<img src>`. */
  dataUrl: string
  /** Actual canvas width in device pixels. */
  width: number
  /** Actual canvas height in device pixels. */
  height: number
}

const DEFAULT_FORMAT: ThumbnailFormat = 'image/png'
const DEFAULT_QUALITY = 0.82

/**
 * Renders page thumbnails from source PDF bytes, loading each distinct source
 * document at most once.
 *
 * Holds an {@link AsyncKeyedCache} of parsed `PDFDocumentProxy` objects keyed by
 * `sourceId`, mirroring the merge/split modules' "parse once, reuse for every
 * page" strategy so a many-page file is never re-parsed per thumbnail. Instances
 * are cheap; a UI typically keeps one for the workspace and calls
 * {@link forget} when a file is removed.
 */
export class ThumbnailRenderer {
  private readonly documents = new AsyncKeyedCache<PDFDocumentProxy>()

  /**
   * Rasterises one page to an encoded data URL.
   *
   * The source document is parsed on first use and cached; the page is drawn at
   * a scale chosen by {@link computeRenderScale} to hit `targetWidth`, onto a
   * canvas sized by {@link thumbnailPixelSize}. The heavy work (parse + paint)
   * runs in the pdf.js worker.
   *
   * @throws {Error} If invoked without a DOM canvas (e.g. SSR), or if pdf.js
   *         fails to parse/render the page. Errors propagate unchanged so the
   *         caller can surface the offending page without corrupting workspace
   *         state.
   */
  async render(request: ThumbnailRequest): Promise<Thumbnail> {
    const { sourceId, bytes, pageIndex, targetWidth } = request
    const cacheKey = thumbnailCacheKey(sourceId, pageIndex, targetWidth)

    const doc = await this.documents.getOrLoad(sourceId, () => loadDocument(bytes))
    // pdf.js pages are 1-based.
    const page = await doc.getPage(pageIndex + 1)

    const natural: PageViewport = page.getViewport({ scale: 1 })
    const scale = computeRenderScale(natural.width, targetWidth)
    const viewport = page.getViewport({ scale })
    const size = thumbnailPixelSize(natural.width, natural.height, scale)

    const canvas = createCanvas(size)
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('ThumbnailRenderer: 2D canvas context is unavailable')
    }

    try {
      await page.render({ canvasContext: context, viewport }).promise
      const dataUrl = canvas.toDataURL(
        request.format ?? DEFAULT_FORMAT,
        request.quality ?? DEFAULT_QUALITY,
      )
      return { cacheKey, dataUrl, width: size.width, height: size.height }
    } finally {
      // Release the page's rendering resources; the parsed document stays
      // cached for sibling pages.
      page.cleanup()
    }
  }

  /**
   * Drops the cached parsed document for `sourceId` (e.g. when the user removes
   * the file). The underlying pdf.js document is destroyed to free its worker
   * resources. Safe to call for an unknown id.
   */
  async forget(sourceId: string): Promise<void> {
    if (!this.documents.has(sourceId)) return
    const pending = this.documents.getOrLoad(sourceId, () => {
      throw new Error('unreachable')
    })
    this.documents.delete(sourceId)
    try {
      const doc = await pending
      await doc.destroy()
    } catch {
      // A document that never loaded has nothing to destroy.
    }
  }

  /** Number of distinct source documents currently cached. */
  get cachedDocumentCount(): number {
    return this.documents.size
  }
}

/**
 * Parses PDF bytes into a pdf.js document via the worker.
 *
 * A *copy* of the bytes is handed to pdf.js: `getDocument` may transfer the
 * backing `ArrayBuffer` to the worker and detach it, which would corrupt the
 * original `SourceFile.bytes` that merge/split rely on (kept as the SSoT).
 */
function loadDocument(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const copy = bytes.slice(0)
  return pdfjs.getDocument({ data: copy }).promise
}

/** Minimal shape shared by `HTMLCanvasElement` and `OffscreenCanvas`. */
interface RenderCanvas {
  getContext(id: '2d'): CanvasRenderingContext2D | null
  toDataURL(type?: string, quality?: number): string
}

/**
 * Creates a canvas sized to `size`. Prefers a real DOM canvas; there is no DOM
 * in a plain worker/SSR context, so this throws a clear error rather than
 * failing obscurely deep inside pdf.js.
 */
function createCanvas(size: PixelSize): RenderCanvas {
  if (typeof document === 'undefined') {
    throw new Error(
      'ThumbnailRenderer.render must run where a DOM canvas is available',
    )
  }
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  return canvas
}

/** Process-wide default renderer for callers that don't manage their own. */
const defaultRenderer = new ThumbnailRenderer()

/**
 * Convenience wrapper over a shared {@link ThumbnailRenderer}. Prefer an
 * explicit instance when you need to scope the document cache (e.g. per
 * workspace) or call {@link ThumbnailRenderer.forget}.
 */
export function renderThumbnail(request: ThumbnailRequest): Promise<Thumbnail> {
  return defaultRenderer.render(request)
}
