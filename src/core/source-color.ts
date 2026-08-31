/**
 * Deterministic source-file → categorical colour assignment: each source PDF
 * gets a stable colour tag so pages can be traced back to their origin file.
 *
 * Every page card in the grid shows a colour tag so the user can tell at a
 * glance which source PDF a page came from. This module is the single place
 * that decides *which* colour a given source gets. It is intentionally
 * React-, DOM- and pdf.js-free so the mapping can be unit tested in plain Node.
 *
 * The colours themselves are NOT hardcoded here as hex — they live in the
 * design token surface (`src/styles/global.css`, Token Group
 * `color-categorical`). This module only decides which *slot* of that
 * categorical palette a source maps to and hands back the corresponding CSS
 * custom property, so the palette can be re-themed without touching this logic.
 */

/**
 * Number of distinct slots in the categorical palette. Must stay in lock-step
 * with the `--color-category-{1..N}` custom properties declared in
 * `src/styles/global.css`. When a workspace holds more source files than there
 * are slots, assignment wraps around (two sources may share a colour) rather
 * than inventing new, un-tokenised colours.
 */
export const SOURCE_COLOR_COUNT = 8

/** Prefix of the categorical palette custom properties in the token surface. */
const TOKEN_PREFIX = '--color-category-'

/**
 * A resolved categorical colour for one source file.
 *
 * `slot` is the stable zero-based palette index; `token` / `cssVar` are the
 * design-token references a component drops straight into a style attribute or
 * stylesheet — the component never sees a raw hex value, which keeps raw
 * colours from leaking into component code.
 */
export interface SourceColor {
  /** Zero-based palette slot, always in `[0, SOURCE_COLOR_COUNT)`. */
  slot: number
  /** Design token name, e.g. `--color-category-3`. */
  token: string
  /** Ready-to-use CSS value, e.g. `var(--color-category-3)`. */
  cssVar: string
}

/**
 * Map a zero-based ordinal to a categorical palette colour, cycling once the
 * ordinal reaches {@link SOURCE_COLOR_COUNT}.
 *
 * The mapping is total and deterministic: the same `index` always yields the
 * same slot. Negative ordinals wrap symmetrically (e.g. `-1` → last slot) so
 * the function never produces an out-of-range slot.
 *
 * @param index Zero-based position of the source among loaded files. Must be a
 *   finite integer.
 * @throws RangeError if `index` is not a finite integer — a non-integer ordinal
 *   signals a caller bug rather than a colour to guess at (fail loudly).
 */
export function sourceColorForIndex(index: number): SourceColor {
  if (!Number.isInteger(index)) {
    throw new RangeError(
      `sourceColorForIndex: index must be a finite integer, received ${index}`,
    )
  }
  // `% N` alone keeps the sign of the dividend, so a negative ordinal would
  // yield a negative slot. The double-mod normalises into `[0, N)`.
  const slot = ((index % SOURCE_COLOR_COUNT) + SOURCE_COLOR_COUNT) % SOURCE_COLOR_COUNT
  const token = `${TOKEN_PREFIX}${slot + 1}`
  return { slot, token, cssVar: `var(${token})` }
}

/**
 * Assign a stable categorical colour to each source id, in first-seen order.
 *
 * Colours are handed out by the order ids first appear, wrapping via
 * {@link sourceColorForIndex} once more than {@link SOURCE_COLOR_COUNT} distinct
 * sources are present. Re-encountering an already-seen id does not consume a new
 * slot, so the assignment stays stable as duplicate references pass through and
 * the same id always resolves to the same colour for a given ordering.
 *
 * @param sourceIds Source file ids in workspace (load) order.
 * @returns A map from source id to its resolved {@link SourceColor}.
 */
export function assignSourceColors(
  sourceIds: readonly string[],
): Map<string, SourceColor> {
  const assignment = new Map<string, SourceColor>()
  let ordinal = 0
  for (const id of sourceIds) {
    if (assignment.has(id)) continue
    assignment.set(id, sourceColorForIndex(ordinal))
    ordinal += 1
  }
  return assignment
}
