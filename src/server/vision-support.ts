/**
 * Shared model vision-capability check for the AI-rubric evaluators.
 *
 * Both the Claude and OpenAI evaluators can be pointed at a model the user
 * selected, and not every model accepts image input. Sending screenshots to a
 * text-only model is rejected by the provider (a 400 the reactive taxonomy maps
 * to `vision-unsupported`). This module lets the evaluators decide *proactively*:
 * when the selected model is judged non-vision-capable, they skip the image
 * blocks and score on the page text alone, and the pipeline marks the report so
 * the UI can show an "evaluated without screenshots" notice.
 *
 * The judgement is a best-effort heuristic, not an exhaustive registry. It
 * defaults to **vision-capable** (send the screenshots) and only returns `false`
 * for model families that are known to be text-only — so an unknown model still
 * gets the images and, if the provider rejects them, the reactive
 * `vision-unsupported` classification remains as the fallback. Being wrong in the
 * conservative direction (assuming vision) never silently drops screenshots; it
 * just defers to the provider's own answer.
 *
 * Boundary: a pure, dependency-free predicate reused by both evaluators. No I/O,
 * no SDK types — just string matching over the model id.
 */

/**
 * Model-id patterns for families that do **not** accept image input. Anything
 * matching one of these is treated as text-only; everything else is assumed
 * vision-capable. Kept deliberately narrow (known text-only families only) so
 * the default stays "send the screenshots".
 */
const TEXT_ONLY_MODEL_PATTERNS: readonly RegExp[] = [
  // OpenAI GPT-3.5 family — chat/completlion models with no vision.
  /gpt-3\.5/i,
  // OpenAI reasoning "mini" tiers (o1-mini, o3-mini, …): no image input. The
  // digit after `o` avoids matching vision-capable ids like `gpt-4o-mini`.
  /\bo\d+-mini\b/i,
  // Legacy OpenAI completion models (text-davinci, babbage, curie, ada, …).
  /(?:^|[-/])(?:text|davinci|babbage|curie|ada)\b/i,
  // Pre-3 Claude models (claude-instant, claude-1, claude-2): text-only.
  /claude-(?:instant|1|2)\b/i,
]

/**
 * Whether the selected model is judged to accept image (vision) input.
 *
 * Returns `true` (vision-capable) for an empty/absent model — the evaluators'
 * default models are all vision-capable — and for any model not matching a known
 * text-only family. Returns `false` only for models that match
 * {@link TEXT_ONLY_MODEL_PATTERNS}.
 *
 * @param model The selected model id, or `undefined` when none was chosen.
 * @returns `true` if screenshots should be sent, `false` to evaluate text-only.
 */
export function modelSupportsVision(model: string | undefined): boolean {
  if (typeof model !== 'string' || model.trim() === '') return true
  const id = model.trim()
  return !TEXT_ONLY_MODEL_PATTERNS.some((pattern) => pattern.test(id))
}
