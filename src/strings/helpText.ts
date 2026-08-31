/**
 * Central source for feature help copy (spec: per-feature help system).
 *
 * This module is the single place description copy for each feature lives, so the
 * info-tooltip components and the unified help screen (built in later cards) all
 * read the same text instead of duplicating strings inline. It is deliberately
 * React-, DOM- and framework-free: it exports plain data so the copy can be unit
 * tested in plain Node and reused from any component.
 *
 * Scope of THIS card: the copy itself for the 9 identified features plus the
 * local-processing/privacy notice. The info-icon / help-screen UI, and the
 * English conversion of display strings (Spec A), are handled elsewhere.
 *
 * Tone: calm, polite, and instructional, matching the rest of the app's copy.
 * Delete copy reflects the analysed `deletePages`/`reconcilePages` behaviour —
 * a deletion cannot be undone inside the workspace, but the source file is left
 * untouched, so re-loading the same file restores the removed pages.
 */

/** One help entry: a short heading and the explanatory body shown to the user. */
export interface HelpEntry {
  /** Short label naming the feature — used as the tooltip / help-section heading. */
  title: string
  /** One- to three-sentence explanation shown in the info tooltip and help screen. */
  body: string
}

/**
 * Keys for the nine feature help entries plus the local-processing notice.
 * Named by semantic role, not by any component that renders them, so the copy
 * can be reused wherever a feature appears.
 */
export type HelpKey =
  | 'exportAll'
  | 'exportSelected'
  | 'splitByCount'
  | 'splitByRange'
  | 'dropzone'
  | 'rotate'
  | 'delete'
  | 'reorder'
  | 'thumbnailPreview'
  | 'localProcessing'

/** The nine feature keys (excludes the `localProcessing` notice). */
export const HELP_FEATURE_KEYS = [
  'exportAll',
  'exportSelected',
  'splitByCount',
  'splitByRange',
  'dropzone',
  'rotate',
  'delete',
  'reorder',
  'thumbnailPreview',
] as const satisfies readonly HelpKey[]

/** Key of the local-processing / privacy notice shown in the unified help screen. */
export const LOCAL_PROCESSING_KEY = 'localProcessing' as const satisfies HelpKey

/**
 * The description copy for every feature and the local-processing notice.
 *
 * Single source of truth: components import an entry by key rather than hardcoding
 * strings, keeping the wording consistent between per-feature tooltips and the
 * unified help screen.
 */
export const HELP_TEXT: Record<HelpKey, HelpEntry> = {
  exportAll: {
    title: 'Export all',
    body: 'Combines every loaded page into a single PDF, keeping the current order and rotation. If you uploaded multiple files, they are merged into one.',
  },
  exportSelected: {
    title: 'Export selected pages',
    body: 'Exports only the checked pages as a single PDF. Unlike a full merge, unselected pages are not included.',
  },
  splitByCount: {
    title: 'Split every N pages',
    body: 'Enter a number N to cut the document into multiple PDFs of N pages each, starting from the front. If there is more than one result, they are bundled into a ZIP for download.',
  },
  splitByRange: {
    title: 'Split by range',
    body: 'Enter page numbers and ranges separated by commas, such as \"1-3, 7, 10-12\", and each segment is cut into its own PDF. Page numbers start at 1, and multiple segments are bundled into a ZIP for download.',
  },
  dropzone: {
    title: 'Load files',
    body: 'Drag and drop PDFs onto the area, or pick them with the button. When you upload several files at once, they are appended in the order you chose. All processing happens inside your browser and files are never sent to a server.',
  },
  rotate: {
    title: 'Rotate page',
    body: 'Each press rotates the page clockwise by another cumulative 90 degrees. The source file is not modified; only the orientation used at export time changes.',
  },
  delete: {
    title: 'Delete page',
    body: 'Removes the selected pages from the workspace. This cannot be undone inside the workspace, but the source file is untouched, so re-loading the same file restores the deleted pages.',
  },
  reorder: {
    title: 'Drag to reorder',
    body: 'Drag and drop thumbnails to change the page order. The order you set here becomes the final export order.',
  },
  thumbnailPreview: {
    title: 'Thumbnail preview',
    body: 'Shows each page as a small thumbnail. Every source file gets a color tag, so you can tell at a glance which file a page came from.',
  },
  localProcessing: {
    title: 'Local-only processing',
    body: 'This tool never sends files to a server; everything is processed inside your browser. Loaded PDFs never leave your device, so even sensitive documents are safe to work with.',
  },
}
