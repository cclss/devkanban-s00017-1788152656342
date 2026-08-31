/**
 * Pure geometry + keying logic for thumbnail rendering.
 *
 * Deliberately free of any pdf.js / DOM / React dependency so the numeric
 * behaviour that governs how a page is rasterised — the render scale, the
 * device-pixel canvas size, and the per-page cache key — can be unit tested in
 * a plain Node environment. The pdf.js-backed rasteriser in
 * {@link ./thumbnail} composes these functions; the actual page draw happens in
 * the pdf.js worker.
 */

/**
 * Lower bound on the render scale. A page whose natural width dwarfs the target
 * (or a caller asking for a sub-pixel thumbnail) still renders at least one
 * device pixel wide rather than collapsing to an empty canvas.
 */
export const MIN_RENDER_SCALE = 1e-4

/**
 * Upper bound on the render scale. Caps the canvas area regardless of the
 * requested target width, so a hostile or malformed input cannot ask for a
 * multi-gigapixel raster and exhaust memory (a fail-secure large-file guard).
 * At 1x a page is drawn at its natural PDF-point size; 64x
 * is far beyond any legitimate thumbnail need.
 */
export const MAX_RENDER_SCALE = 64

/** Field separator for {@link thumbnailCacheKey}. */
const CACHE_KEY_DELIMITER = '|'

/**
 * Scale factor that renders a page at (approximately) `targetWidth` device
 * pixels wide.
 *
 * pdf.js reports a page's natural size at `scale: 1` in PDF points; multiplying
 * a viewport by this factor produces a raster whose width matches the desired
 * thumbnail width while preserving aspect ratio. The result is clamped to
 * [{@link MIN_RENDER_SCALE}, {@link MAX_RENDER_SCALE}].
 *
 * @param naturalWidth Page width at `scale: 1`, in PDF points. Must be > 0.
 * @param targetWidth  Desired thumbnail width, in device pixels. Must be > 0.
 * @throws {RangeError} If either argument is not a positive, finite number —
 *         these signal a malformed page or a caller bug, not user error.
 */
export function computeRenderScale(naturalWidth: number, targetWidth: number): number {
  assertPositive(naturalWidth, 'naturalWidth')
  assertPositive(targetWidth, 'targetWidth')

  const scale = targetWidth / naturalWidth
  return clamp(scale, MIN_RENDER_SCALE, MAX_RENDER_SCALE)
}

/** Integer device-pixel dimensions of a thumbnail canvas. */
export interface PixelSize {
  width: number
  height: number
}

/**
 * Integer canvas dimensions for a page rendered at `scale`.
 *
 * A canvas needs whole-pixel dimensions, so both axes are rounded up (never
 * below 1) to avoid clipping the last row/column of the rasterised page while
 * keeping the source aspect ratio.
 *
 * @param naturalWidth  Page width at `scale: 1`, in PDF points. Must be > 0.
 * @param naturalHeight Page height at `scale: 1`, in PDF points. Must be > 0.
 * @param scale         Render scale, typically from {@link computeRenderScale}.
 *                      Must be > 0.
 * @throws {RangeError} If any argument is not a positive, finite number.
 */
export function thumbnailPixelSize(
  naturalWidth: number,
  naturalHeight: number,
  scale: number,
): PixelSize {
  assertPositive(naturalWidth, 'naturalWidth')
  assertPositive(naturalHeight, 'naturalHeight')
  assertPositive(scale, 'scale')

  return {
    width: Math.max(1, Math.ceil(naturalWidth * scale)),
    height: Math.max(1, Math.ceil(naturalHeight * scale)),
  }
}

/**
 * Stable cache key for a single rendered thumbnail.
 *
 * A thumbnail is uniquely identified by its source document, the page within
 * it, and the target width it was rendered for (a wider target is a different
 * raster). Keying on all three lets a UI memoise data URLs and re-render only
 * when the requested width actually changes.
 *
 * @param sourceId    Stable id of the source file (see `SourceFile.id`).
 * @param pageIndex   Zero-based page index within the source document. Must be
 *                    a non-negative integer.
 * @param targetWidth Desired thumbnail width in device pixels. Must be > 0.
 * @throws {RangeError} On a non-integer/negative page index or non-positive
 *         width — these indicate a caller bug.
 */
export function thumbnailCacheKey(
  sourceId: string,
  pageIndex: number,
  targetWidth: number,
): string {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new RangeError(
      `thumbnailCacheKey: pageIndex must be a non-negative integer, got ${pageIndex}`,
    )
  }
  assertPositive(targetWidth, 'targetWidth')
  // The delimiter keeps the three fields from colliding across boundaries
  // (e.g. ids "a" + page "1" vs "a1" + page ""). Source ids are generated
  // UUIDs, so the delimiter cannot appear inside one.
  return [sourceId, pageIndex, targetWidth].join(CACHE_KEY_DELIMITER)
}

/** Throws unless `value` is a finite number strictly greater than zero. */
function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number, got ${value}`)
  }
}

/** Constrains `value` to the inclusive range [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
