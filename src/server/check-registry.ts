/**
 * The 22-check auto-audit registry.
 *
 * A single declarative list of checks — five categories, worth 60 points
 * combined in a later scoring grain — where every check is a pure function of one
 * {@link AuditContext}. Each entry declares its stable `id`, its `category`, an
 * English `label`, and an `evaluate(ctx)` that returns a
 * {@link ../core/report#CheckStatus} plus an English `message` and (for actionable
 * results) a `tip`. This module owns *what is checked and what the user is told*;
 * it does not fetch, score, or render — the pipeline feeds it a context and reads
 * the outcomes.
 *
 * Category split (22 total): SEO 5 / Performance 4 / Mobile 4 / Security 4 /
 * Accessibility 5.
 *
 * `skip` is a first-class outcome: a check that cannot apply to this page (no
 * images to alt-check, no viewport to inspect, a non-HTTPS page for a mixed-
 * content check) returns `skip` and is normalised out of the denominator by the
 * scorer, rather than being counted as a pass or a fail.
 *
 * All copy here is confirmed user-facing domain content (mirroring the report
 * labels), recorded in the design spec — it is not a design token.
 *
 * Boundary: standalone backend module reusing only `core/report` types and the
 * {@link AuditContext}. Pure functions throughout.
 */
import type {
  AuditCategoryId,
  CheckItem,
  CheckStatus,
} from '../core/report'
import type { AuditContext } from './audit-context'

/** The outcome of one check: a status plus English copy (and optional tip). */
export interface CheckResult {
  /** Pass / warn / fail, or `skip` when the check does not apply. */
  status: CheckStatus
  /** English one-line explanation of the result. */
  message: string
  /** English improvement tip; present for `warn`/`fail`, absent otherwise. */
  tip?: string
}

/** One declarative check: identity + category + a pure evaluator over context. */
export interface CheckDefinition {
  /** Stable id within the registry (e.g. `seo-title`). */
  id: string
  /** Which auto-audit category this check contributes to. */
  category: AuditCategoryId
  /** English label of what is checked. */
  label: string
  /** Pure evaluation of this check against a parsed page context. */
  evaluate: (ctx: AuditContext) => CheckResult
}

// --- Tunable budgets (implementation thresholds, not design tokens) ---------

/** A generous baseline ceiling for a landing page's raw HTML (~200 KB). */
const HTML_SIZE_BUDGET = 200_000
/** Recommended title length window, in characters. */
const TITLE_MIN = 10
const TITLE_MAX = 60
/** Warn above this many external `<script src>` tags. */
const EXTERNAL_SCRIPT_BUDGET = 15
/** Warn above this many inline `style="…"` attributes. */
const INLINE_STYLE_BUDGET = 20

// --- SEO (5) ----------------------------------------------------------------

const SEO_CHECKS: CheckDefinition[] = [
  {
    id: 'seo-title',
    category: 'seo',
    label: 'Title tag',
    evaluate: (ctx) =>
      ctx.title.length > 0
        ? { status: 'pass', message: 'The title tag is set.' }
        : {
            status: 'fail',
            message: 'The title tag is empty or missing.',
            tip: 'Add a unique title that will appear in search results.',
          },
  },
  {
    id: 'seo-title-length',
    category: 'seo',
    label: 'Title length',
    evaluate: (ctx) => {
      if (ctx.title.length === 0) {
        return { status: 'skip', message: 'There is no title, so its length cannot be evaluated.' }
      }
      if (ctx.title.length >= TITLE_MIN && ctx.title.length <= TITLE_MAX) {
        return { status: 'pass', message: 'The title length is within the recommended range.' }
      }
      return {
        status: 'warn',
        message:
          ctx.title.length < TITLE_MIN
            ? 'The title is too short.'
            : 'The title is too long.',
        tip: `Write a title between ${TITLE_MIN} and ${TITLE_MAX} characters.`,
      }
    },
  },
  {
    id: 'seo-meta-description',
    category: 'seo',
    label: 'Meta description',
    evaluate: (ctx) =>
      ctx.meta.description !== null
        ? { status: 'pass', message: 'A meta description is set.' }
        : {
            status: 'fail',
            message: 'The meta description tag is missing.',
            tip: 'Add a meta description that summarizes the page content.',
          },
  },
  {
    id: 'seo-h1',
    category: 'seo',
    label: 'Main heading (h1)',
    evaluate: (ctx) => {
      if (ctx.headings.h1Count === 1) {
        return { status: 'pass', message: 'There is exactly one main heading (h1).' }
      }
      if (ctx.headings.h1Count === 0) {
        return {
          status: 'fail',
          message: 'The main heading (h1) tag is missing.',
          tip: 'Use an h1 tag to define a single main heading for the page.',
        }
      }
      return {
        status: 'warn',
        message: 'There are multiple main headings (h1).',
        tip: 'Use only one h1 per page.',
      }
    },
  },
  {
    id: 'seo-open-graph',
    category: 'seo',
    label: 'Open Graph sharing tags',
    evaluate: (ctx) => {
      const hasTitle = ctx.meta.ogTitle !== null
      const hasImage = ctx.meta.ogImage !== null
      if (hasTitle && hasImage) {
        return { status: 'pass', message: 'Open Graph sharing tags are set.' }
      }
      return {
        status: 'warn',
        message:
          hasTitle || hasImage
            ? 'Open Graph tags are only partially set.'
            : 'Open Graph sharing tags are missing.',
        tip: 'Set og:title and og:image to improve the preview when the page is shared.',
      }
    },
  },
]

// --- Performance (4) --------------------------------------------------------

const PERFORMANCE_CHECKS: CheckDefinition[] = [
  {
    id: 'perf-html-size',
    category: 'performance',
    label: 'HTML document size',
    evaluate: (ctx) =>
      ctx.htmlSize <= HTML_SIZE_BUDGET
        ? { status: 'pass', message: 'The HTML document size is within a reasonable range.' }
        : {
            status: 'warn',
            message: 'The HTML document is excessively large.',
            tip: 'Extract inline resources to reduce the initial document size.',
          },
  },
  {
    id: 'perf-external-scripts',
    category: 'performance',
    label: 'External script count',
    evaluate: (ctx) =>
      ctx.scripts.external <= EXTERNAL_SCRIPT_BUDGET
        ? { status: 'pass', message: 'The number of external scripts is reasonable.' }
        : {
            status: 'warn',
            message: 'There are many external scripts, which can slow down loading.',
            tip: 'Remove unnecessary external scripts or defer their loading.',
          },
  },
  {
    id: 'perf-inline-styles',
    category: 'performance',
    label: 'Inline style usage',
    evaluate: (ctx) =>
      ctx.inlineStyleCount <= INLINE_STYLE_BUDGET
        ? { status: 'pass', message: 'Inline style usage is reasonable.' }
        : {
            status: 'warn',
            message: 'Inline styles are used excessively.',
            tip: 'Move repeated inline styles into an external CSS file.',
          },
  },
  {
    id: 'perf-image-lazyload',
    category: 'performance',
    label: 'Image lazy loading',
    evaluate: (ctx) => {
      if (ctx.images.total === 0) {
        return { status: 'skip', message: 'There are no images, so lazy loading does not apply.' }
      }
      if (ctx.images.lazyLoaded === ctx.images.total) {
        return { status: 'pass', message: 'All images use lazy loading.' }
      }
      return {
        status: 'warn',
        message:
          ctx.images.lazyLoaded > 0
            ? 'Lazy loading is applied to only some images.'
            : 'Lazy loading is not applied to any images.',
        tip: 'Add loading="lazy" to images outside the viewport.',
      }
    },
  },
]

// --- Mobile (4) -------------------------------------------------------------

const MOBILE_CHECKS: CheckDefinition[] = [
  {
    id: 'mobile-viewport',
    category: 'mobile',
    label: 'Responsive viewport',
    evaluate: (ctx) =>
      ctx.meta.viewport !== null
        ? {
            status: 'pass',
            message: 'A responsive viewport meta tag is set.',
          }
        : {
            status: 'fail',
            message: 'The viewport meta tag is missing, so the page may appear zoomed in on mobile.',
            tip: 'Add a viewport meta tag with width=device-width.',
          },
  },
  {
    id: 'mobile-device-width',
    category: 'mobile',
    label: 'Device-width support',
    evaluate: (ctx) => {
      if (ctx.meta.viewport === null) {
        return { status: 'skip', message: 'The viewport meta tag is missing, so this cannot be evaluated.' }
      }
      return /width\s*=\s*device-width/i.test(ctx.meta.viewport)
        ? { status: 'pass', message: 'The viewport is set to the device width.' }
        : {
            status: 'warn',
            message: 'The viewport does not specify width=device-width.',
            tip: 'Specify width=device-width in the viewport content.',
          }
    },
  },
  {
    id: 'mobile-initial-scale',
    category: 'mobile',
    label: 'Initial zoom scale',
    evaluate: (ctx) => {
      if (ctx.meta.viewport === null) {
        return { status: 'skip', message: 'The viewport meta tag is missing, so this cannot be evaluated.' }
      }
      return /initial-scale\s*=\s*1/i.test(ctx.meta.viewport)
        ? { status: 'pass', message: 'The initial zoom scale is set to 1.' }
        : {
            status: 'warn',
            message: 'The initial zoom scale (initial-scale) is not set.',
            tip: 'Add initial-scale=1 to the viewport content.',
          }
    },
  },
  {
    id: 'mobile-media-query',
    category: 'mobile',
    label: 'Responsive media queries',
    evaluate: (ctx) =>
      ctx.hasMediaQuery
        ? { status: 'pass', message: 'Responsive media queries are present.' }
        : {
            status: 'warn',
            message: 'No responsive media queries were found in the document.',
            tip: 'Use @media queries to provide layouts for different screen sizes.',
          },
  },
]

// --- Security (4) -----------------------------------------------------------

const SECURITY_CHECKS: CheckDefinition[] = [
  {
    id: 'security-https',
    category: 'security',
    label: 'HTTPS delivery',
    evaluate: (ctx) =>
      ctx.https
        ? { status: 'pass', message: 'The page is served over HTTPS.' }
        : {
            status: 'fail',
            message: 'The page is not served over HTTPS.',
            tip: 'Apply a TLS certificate to serve the page over HTTPS.',
          },
  },
  {
    id: 'security-mixed-content',
    category: 'security',
    label: 'Mixed content',
    evaluate: (ctx) => {
      if (!ctx.https) {
        return {
          status: 'skip',
          message: 'This is not an HTTPS page, so mixed content does not apply.',
        }
      }
      return ctx.mixedContentCount === 0
        ? { status: 'pass', message: 'There is no mixed content (http resources).' }
        : {
            status: 'fail',
            message: 'The secure page includes http resources.',
            tip: 'Update all resources to load over https.',
          }
    },
  },
  {
    id: 'security-external-link-safety',
    category: 'security',
    label: 'New-window link safety',
    evaluate: (ctx) => {
      if (ctx.links.blankTotal === 0) {
        return {
          status: 'skip',
          message: 'There are no links that open in a new window, so this does not apply.',
        }
      }
      return ctx.links.blankUnsafe === 0
        ? {
            status: 'pass',
            message: 'New-window links use rel="noopener".',
          }
        : {
            status: 'warn',
            message: 'There are links that open in a new window without rel="noopener".',
            tip: 'Add rel="noopener" to target="_blank" links.',
          }
    },
  },
  {
    id: 'security-inline-handlers',
    category: 'security',
    label: 'Inline event handlers',
    evaluate: (ctx) =>
      !ctx.hasInlineEventHandlers
        ? { status: 'pass', message: 'There are no inline event handlers.' }
        : {
            status: 'warn',
            message: 'Inline event handlers (such as onclick) are used.',
            tip: 'Bind events from an external script to make CSP easier to apply.',
          },
  },
]

// --- Accessibility (5) ------------------------------------------------------

const ACCESSIBILITY_CHECKS: CheckDefinition[] = [
  {
    id: 'a11y-html-lang',
    category: 'accessibility',
    label: 'Document language',
    evaluate: (ctx) =>
      ctx.lang !== null
        ? { status: 'pass', message: 'The html element has a lang attribute.' }
        : {
            status: 'fail',
            message: 'The html element has no lang attribute.',
            tip: 'Add a language attribute such as lang="en" to the html tag.',
          },
  },
  {
    id: 'a11y-img-alt',
    category: 'accessibility',
    label: 'Image alternative text',
    evaluate: (ctx) => {
      if (ctx.images.total === 0) {
        return { status: 'skip', message: 'The page has no images, so this does not apply.' }
      }
      return ctx.images.missingAlt === 0
        ? { status: 'pass', message: 'All images have alternative text.' }
        : {
            status: 'warn',
            message: 'Some images are missing alternative text.',
            tip: 'Add an alt attribute to every meaningful image.',
          }
    },
  },
  {
    id: 'a11y-heading-structure',
    category: 'accessibility',
    label: 'Heading structure',
    evaluate: (ctx) =>
      ctx.headings.totalCount > 0
        ? { status: 'pass', message: 'Heading tags structure the document.' }
        : {
            status: 'fail',
            message: 'There are no heading tags.',
            tip: 'Use h1–h6 heading tags to structure the document.',
          },
  },
  {
    id: 'a11y-form-labels',
    category: 'accessibility',
    label: 'Input labels',
    evaluate: (ctx) => {
      if (ctx.inputs.total === 0) {
        return { status: 'skip', message: 'There are no input forms, so this does not apply.' }
      }
      return ctx.inputs.unlabeled === 0
        ? {
            status: 'pass',
            message: 'All input elements have an associated label.',
          }
        : {
            status: 'fail',
            message: 'Some input elements have no associated label.',
            tip: 'Associate a label or aria-label with every input element.',
          }
    },
  },
  {
    id: 'a11y-zoom-enabled',
    category: 'accessibility',
    label: 'Screen zoom allowed',
    evaluate: (ctx) => {
      if (ctx.meta.viewport === null) {
        return {
          status: 'skip',
          message: 'The viewport meta tag is missing, so the zoom setting cannot be evaluated.',
        }
      }
      const locked =
        /user-scalable\s*=\s*(no|0)/i.test(ctx.meta.viewport) ||
        /maximum-scale\s*=\s*1(\.0+)?\b/i.test(ctx.meta.viewport)
      return locked
        ? {
            status: 'fail',
            message: 'User screen zoom is disabled.',
            tip: 'Remove user-scalable=no and maximum-scale limits to allow zooming.',
          }
        : { status: 'pass', message: 'User screen zoom is allowed.' }
    },
  },
]

/**
 * The full 22-check registry in canonical (category, then declared) order:
 * SEO 5 → Performance 4 → Mobile 4 → Security 4 → Accessibility 5.
 */
export const CHECK_REGISTRY: readonly CheckDefinition[] = [
  ...SEO_CHECKS,
  ...PERFORMANCE_CHECKS,
  ...MOBILE_CHECKS,
  ...SECURITY_CHECKS,
  ...ACCESSIBILITY_CHECKS,
]

/** How many checks each category contributes (SEO 5 / Performance 4 / … / Accessibility 5). */
export const CHECK_COUNT = CHECK_REGISTRY.length

/**
 * Runs one check against a context and folds its identity in, producing the
 * report-facing {@link CheckItem}. `tip` is omitted (not `undefined`) when the
 * result has none, matching the optional-property contract of `CheckItem`.
 */
export function evaluateCheck(def: CheckDefinition, ctx: AuditContext): CheckItem {
  const result = def.evaluate(ctx)
  return {
    id: def.id,
    label: def.label,
    status: result.status,
    message: result.message,
    ...(result.tip !== undefined ? { tip: result.tip } : {}),
  }
}

/**
 * Runs every registered check against `ctx`, returning the {@link CheckItem}s in
 * registry order. This is the whole-registry evaluation the scorer consumes; it
 * does not group or score — it only produces the per-check outcomes.
 */
export function evaluateAllChecks(ctx: AuditContext): CheckItem[] {
  return CHECK_REGISTRY.map((def) => evaluateCheck(def, ctx))
}

/**
 * Groups the registry's checks by category id, preserving declared order within
 * each category — a convenience for the scorer/report builder that assembles the
 * five {@link ../core/report#AuditCategory} blocks.
 */
export function checksByCategory(
  ctx: AuditContext,
): Record<AuditCategoryId, CheckItem[]> {
  const grouped: Record<AuditCategoryId, CheckItem[]> = {
    seo: [],
    performance: [],
    mobile: [],
    security: [],
    accessibility: [],
  }
  for (const def of CHECK_REGISTRY) {
    grouped[def.category].push(evaluateCheck(def, ctx))
  }
  return grouped
}
