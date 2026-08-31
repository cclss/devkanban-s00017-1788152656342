/**
 * `buildAuditContext` — parse a fetched page once into the flat signal bag the
 * check registry reads.
 *
 * The 22 auto-audit checks ({@link ./check-registry}) are declarative and pure:
 * each one is a function of a single {@link AuditContext}. Rather than have every
 * check re-scan the raw HTML string, this module walks the markup *once* (regex,
 * no DOM — the pipeline runs in `node` and never has a live document) and records
 * the handful of facts the checks need: the title, the meta tags, the heading
 * counts, the images, the links, the form controls, plus a few page-wide flags
 * (inline styles / event handlers / media queries / mixed content) and the
 * transport facts (HTTPS, byte size) that only the URL and the raw bytes can
 * answer.
 *
 * Boundary: standalone backend module. It imports nothing from the app and holds
 * no scoring logic — it only extracts facts, so it unit-tests with plain string
 * fixtures.
 */

/**
 * Every fact the check registry needs about one fetched page, parsed once.
 *
 * All counts are derived from the raw HTML string; `https`/`htmlSize` come from
 * the URL and the raw bytes. Nothing here is a score — the registry turns these
 * facts into per-check {@link ../core/report#CheckStatus} outcomes.
 */
export interface AuditContext {
  /** The analyzed page URL (used by transport-level checks). */
  url: string
  /** Whether the page is served over HTTPS. */
  https: boolean
  /** Raw document size in bytes (UTF-8). */
  htmlSize: number
  /** `lang` attribute on `<html>`, or `null` when absent/empty. */
  lang: string | null
  /** Trimmed inner text of the first `<title>`, or `''` when absent. */
  title: string
  /** Selected `<meta>`/OpenGraph content, `null` when the tag is absent. */
  meta: {
    /** `<meta name="description">` content. */
    description: string | null
    /** `<meta name="viewport">` content. */
    viewport: string | null
    /** `<meta property="og:title">` content. */
    ogTitle: string | null
    /** `<meta property="og:image">` content. */
    ogImage: string | null
  }
  /** Heading tallies used by structure checks. */
  headings: {
    /** Number of `<h1>` tags. */
    h1Count: number
    /** Number of heading tags of any level (`h1`–`h6`). */
    totalCount: number
  }
  /** Image tallies used by alt-text / lazy-loading checks. */
  images: {
    /** Total `<img>` tags. */
    total: number
    /** `<img>` tags with no `alt` attribute at all. */
    missingAlt: number
    /** `<img>` tags with `loading="lazy"`. */
    lazyLoaded: number
  }
  /** Anchor tallies used by the external-link-safety check. */
  links: {
    /** Total `<a>` tags. */
    total: number
    /** `<a target="_blank">` tags. */
    blankTotal: number
    /** `<a target="_blank">` tags missing `rel="noopener"`/`"noreferrer"`. */
    blankUnsafe: number
  }
  /** Form-control tallies used by the label check (hidden/button types excluded). */
  inputs: {
    /** Total labelable controls (`input`/`select`/`textarea`). */
    total: number
    /** Controls with no associated label, `aria-label(ledby)`, or `title`. */
    unlabeled: number
  }
  /** Script tallies used by the external-script budget check. */
  scripts: {
    /** `<script src="…">` tags (external scripts). */
    external: number
  }
  /** Number of inline `style="…"` attributes across the document. */
  inlineStyleCount: number
  /** Whether any inline event handler (`onclick=` …) is present. */
  hasInlineEventHandlers: boolean
  /** Whether any `@media` query is present in inline `<style>`/attributes. */
  hasMediaQuery: boolean
  /** Count of `http://` resource references when the page itself is HTTPS. */
  mixedContentCount: number
}

/** Reads one attribute's value from a single tag string, or `null` if absent. */
function attr(tag: string, name: string): string | null {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    'i',
  )
  const m = re.exec(tag)
  if (!m) return null
  return (m[2] ?? m[3] ?? m[4] ?? '').trim()
}

/** All tags of one element name, e.g. `img` → every `<img …>` open tag. */
function tagsOf(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? []
}

/** Inner text of the first `<title>`, trimmed, or `''`. */
function titleText(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return m ? m[1].trim() : ''
}

/** `content` of the first `<meta>` whose `attrName` equals `value` (ci). */
function metaContent(html: string, attrName: string, value: string): string | null {
  for (const tag of tagsOf(html, 'meta')) {
    const key = attr(tag, attrName)
    if (key && key.toLowerCase() === value.toLowerCase()) {
      return attr(tag, 'content') ?? ''
    }
  }
  return null
}

/** Non-empty string or `null`, so callers can treat blank as absent. */
function nonEmpty(value: string | null): string | null {
  return value && value.length > 0 ? value : null
}

/** Controls whose `type` never needs a visible label. */
const UNLABELABLE_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
])

/** Counts labelable form controls and how many lack any accessible name. */
function collectInputs(html: string): { total: number; unlabeled: number } {
  const forRefs = new Set(
    tagsOf(html, 'label')
      .map((tag) => attr(tag, 'for'))
      .filter((v): v is string => v !== null && v.length > 0),
  )
  const controls = [
    ...tagsOf(html, 'input'),
    ...tagsOf(html, 'select'),
    ...tagsOf(html, 'textarea'),
  ].filter((tag) => {
    const type = attr(tag, 'type')?.toLowerCase()
    return !(type !== undefined && UNLABELABLE_INPUT_TYPES.has(type))
  })

  let unlabeled = 0
  for (const tag of controls) {
    const id = attr(tag, 'id')
    const named =
      (id !== null && forRefs.has(id)) ||
      nonEmpty(attr(tag, 'aria-label')) !== null ||
      nonEmpty(attr(tag, 'aria-labelledby')) !== null ||
      nonEmpty(attr(tag, 'title')) !== null
    if (!named) unlabeled += 1
  }
  return { total: controls.length, unlabeled }
}

/** Counts `<a>` tags and the `target="_blank"` ones missing opener protection. */
function collectLinks(html: string): AuditContext['links'] {
  const anchors = tagsOf(html, 'a')
  let blankTotal = 0
  let blankUnsafe = 0
  for (const tag of anchors) {
    if (attr(tag, 'target')?.toLowerCase() !== '_blank') continue
    blankTotal += 1
    const rel = (attr(tag, 'rel') ?? '').toLowerCase()
    if (!rel.includes('noopener') && !rel.includes('noreferrer')) {
      blankUnsafe += 1
    }
  }
  return { total: anchors.length, blankTotal, blankUnsafe }
}

/**
 * Parses one fetched page into its {@link AuditContext}. Pure: `html` + `url` in,
 * facts out — no network, no scoring, no DOM.
 */
export function buildAuditContext(html: string, url: string): AuditContext {
  const images = tagsOf(html, 'img')
  const https = url.toLowerCase().startsWith('https://')

  return {
    url,
    https,
    htmlSize: Buffer.byteLength(html, 'utf8'),
    lang: nonEmpty(attr(tagsOf(html, 'html')[0] ?? '', 'lang')),
    title: titleText(html),
    meta: {
      description: nonEmpty(metaContent(html, 'name', 'description')),
      viewport: nonEmpty(metaContent(html, 'name', 'viewport')),
      ogTitle: nonEmpty(metaContent(html, 'property', 'og:title')),
      ogImage: nonEmpty(metaContent(html, 'property', 'og:image')),
    },
    headings: {
      h1Count: tagsOf(html, 'h1').length,
      totalCount: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].reduce(
        (sum, tag) => sum + tagsOf(html, tag).length,
        0,
      ),
    },
    images: {
      total: images.length,
      missingAlt: images.filter((tag) => !/\balt\s*=/i.test(tag)).length,
      lazyLoaded: images.filter(
        (tag) => attr(tag, 'loading')?.toLowerCase() === 'lazy',
      ).length,
    },
    links: collectLinks(html),
    inputs: collectInputs(html),
    scripts: {
      external: tagsOf(html, 'script').filter(
        (tag) => nonEmpty(attr(tag, 'src')) !== null,
      ).length,
    },
    inlineStyleCount: (html.match(/\sstyle\s*=\s*["']/gi) ?? []).length,
    hasInlineEventHandlers: /\son[a-z]+\s*=\s*["']/i.test(html),
    hasMediaQuery: /@media\b/i.test(html),
    mixedContentCount: https
      ? (html.match(/\b(?:src|href)\s*=\s*["']http:\/\//gi) ?? []).length
      : 0,
  }
}
