/**
 * Central source of truth for every user-facing string in the app.
 *
 * Historically these labels, hints, error messages, placeholders, accessibility
 * descriptions, generated file-name markers, and console messages were
 * hardcoded (in Korean) across the components and core modules. Collecting them
 * here makes the copy auditable in one place and gives a fork of this template a
 * single English starting point regardless of the developer's own locale.
 *
 * i18n note: values are hardcoded English on purpose — no runtime language
 * toggle and no i18n framework are introduced here. The *shape* is deliberately
 * locale-agnostic: static text is a plain string and anything parameterized is a
 * pure builder function, grouped by concern. To add a language later, wrap this
 * object per locale (e.g. `byLocale[locale] = strings`) without touching any
 * call site.
 *
 * Boundary: this is a standalone constants module. It imports nothing from the
 * components or core layers, so those layers depend on it and never the reverse.
 */

/** App shell header (AppHeader). */
const header = {
  /** Product title shown in the header. */
  title: 'PDF Workspace',
  /** Subtitle emphasizing the privacy model: nothing leaves the browser. */
  subtitle: 'Processed right in your browser · files are never sent to a server',
} as const

/** Workspace toolbar: export/split actions, inputs, hints (Toolbar). */
const toolbar = {
  /** Landmark label for the toolbar region. */
  regionLabel: 'Document tools',

  /** Merge-and-download action (Export All). */
  exportAll: 'Export All',
  /** Extract-selected-pages action (Export Selected Pages). */
  exportSelected: 'Export Selected Pages',
  /** In-progress label for both export actions. */
  exporting: 'Exporting…',

  /** Split-every-N-pages run button. */
  splitByCount: 'Split by N Pages',
  /** Split-by-range run button. */
  splitByRange: 'Split by Range',
  /** In-progress label for both split actions. */
  splitting: 'Splitting…',

  /** Placeholder example for the "pages per split" number field. */
  countPlaceholder: 'e.g. 2',
  /** Accessible name for the "pages per split" number field. */
  countFieldLabel: 'Pages per split',
  /** Accessible name for the split-by-count run button. */
  splitByCountAction: 'Split by N pages',

  /** Placeholder example for the range field (syntax itself is unchanged). */
  rangePlaceholder: 'e.g. 1-3, 7, 10-12',
  /** Accessible name for the range field. */
  rangeFieldLabel: 'Split range',
  /** Accessible name for the split-by-range run button. */
  splitByRangeAction: 'Split by range',

  /** Live count of currently checked pages. */
  selectionCount: (count: number): string => `${count} selected`,
  /** Hint shown once pages are loaded. */
  hintReady: 'Export or split to save your PDF.',
  /** Hint shown before any PDF is loaded. */
  hintEmpty: 'Load a PDF to enable the tools.',
} as const

/** PDF loading surface (Dropzone). */
const dropzone = {
  /** Landmark label for the drop area. */
  regionLabel: 'PDF loading area',

  /** Drop-area title once files are already loaded. */
  dropMoreTitle: 'Drop more PDFs here',
  /** Drop-area title before any file is loaded. */
  dropTitle: 'Drop your PDFs here',
  /** Instruction under the title. */
  description: 'Or use the button below to choose files. You can load several at once.',

  /** File-picker button while a load is in progress. */
  loading: 'Loading…',
  /** File-picker button once files are already loaded. */
  addFiles: 'Add files',
  /** File-picker button before any file is loaded. */
  chooseFiles: 'Choose files',
  /** Privacy reassurance under the picker. */
  privacyNote: 'All processing happens entirely in your browser.',

  /** Heading for the list of files that failed to load. */
  rejectedTitle: (count: number): string => `${count} files couldn't be loaded`,
  /** Dismiss button for the rejected-files panel. */
  dismiss: 'Dismiss',

  /** Landmark label for the loaded-files list. */
  sourceListLabel: 'Loaded files',
  /** Heading for the loaded-files list. */
  sourceListTitle: (count: number): string => `${count} files loaded`,
  /** Per-file page-count badge. */
  pageCount: (count: number): string => `${count} pages`,
} as const

/** The unified page grid (PageGrid). */
const pageGrid = {
  /** Landmark label for the page grid section. */
  regionLabel: 'Page preview',
  /** Heading with the total page count. */
  title: (count: number): string => `${count} pages`,
} as const

/**
 * Per-page thumbnail card accessibility copy (PageThumbnailCard).
 *
 * These are aria-label/alt builders: the wording changes but the *meaning* a
 * screen reader conveys (which page, of which file, and the control's role) is
 * preserved exactly.
 */
const pageCard = {
  /** Alt text for the rendered thumbnail image. */
  previewAlt: (sourceName: string, pageLabel: number): string =>
    `${sourceName} page ${pageLabel} preview`,
  /** Status label when a thumbnail fails to render. */
  previewFailed: 'Preview failed to load',
  /** Status label while a thumbnail is being prepared. */
  previewLoading: 'Preparing preview',
  /** Accessible name for the selection checkbox. */
  selectPage: (sourceName: string, pageLabel: number): string =>
    `Select ${sourceName} page ${pageLabel}`,
  /** Accessible name for the rotate-90°-clockwise button. */
  rotatePage: (sourceName: string, pageLabel: number): string =>
    `Rotate ${sourceName} page ${pageLabel} 90 degrees`,
  /** Accessible name for the delete-page button. */
  deletePage: (sourceName: string, pageLabel: number): string =>
    `Delete ${sourceName} page ${pageLabel}`,
} as const

/**
 * Classified error copy. Each builder mirrors an existing error condition — the
 * language changes but *what failed and why* is unchanged.
 */
const errors = {
  /** Range-parser inline messages (core/range-parser). */
  range: {
    /** Input was blank or whitespace only. */
    empty: 'Enter a range. e.g. 1-3, 7, 10-12',
    /** A token was not a positive integer or `a-b` range. */
    invalidToken: (token: string): string =>
      `'${token}' is not a valid range. Use page numbers and ranges starting from 1 (e.g. 1-3, 7).`,
    /** A range's end page is smaller than its start. */
    reversedRange: (start: number, end: number): string =>
      `The range ${start}-${end} ends before it begins. Make the start less than or equal to the end.`,
    /** A page exceeds the document's page count. */
    outOfRange: (page: number, pageCount: number): string =>
      `Page ${page} is outside the document. This document has ${pageCount} pages.`,
  },
  /** PDF load errors (core/pdf-source). */
  pdfSource: {
    /** The PDF is password protected. */
    encrypted: 'This PDF is password protected. Remove the password and try again.',
    /** The bytes are corrupt or not a valid PDF. */
    corrupt: 'This file is damaged or is not a valid PDF.',
  },
  /**
   * Generic inline copy shown when a merge/split/download pipeline fails
   * (Toolbar). Intentionally non-specific so it never leaks system internals.
   */
  exportFailed: "Couldn't create the PDF. Please try again in a moment.",
} as const

/**
 * Generated file-name pieces (core/download). These strings are directly
 * observable by the user in their downloads.
 *
 * The existing composition, separator, and order are preserved: the multi-source
 * merge name stays `"{firstBase}-{marker}"`, so with `mergeMoreMarker` a three-
 * source export becomes e.g. `report-+2 more.pdf`.
 */
const filenames = {
  /** Fallback base for a merge export when no source name is usable. */
  mergeFallback: 'merged',
  /** Fallback base for split parts when no source name is usable. */
  splitFallback: 'split',
  /** Fallback base for a selected-pages export when no source name is usable. */
  selectedPagesFallback: 'selected-pages',
  /**
   * Marker appended after the first source base for a multi-source merge.
   * @param moreCount How many additional sources beyond the first (>= 1).
   */
  mergeMoreMarker: (moreCount: number): string => `+${moreCount} more`,
} as const

/** Developer-facing console messages (main.tsx). Not shown to end users. */
const consoleMessages = {
  /** Thrown when the root mount element is missing. */
  rootElementMissing: 'Root element (#root) was not found.',
} as const

/**
 * The full English string set, grouped by concern. Exported as both a named and
 * default binding so call sites can import whichever reads best.
 */
export const strings = {
  header,
  toolbar,
  dropzone,
  pageGrid,
  pageCard,
  errors,
  filenames,
  console: consoleMessages,
} as const

export type Strings = typeof strings

export default strings
