import { useCallback, useMemo } from 'react'
import AppHeader from './components/AppHeader'
import Toolbar from './components/Toolbar'
import Dropzone from './components/Dropzone'
import PageGrid from './components/PageGrid'
import { ThumbnailRenderer } from './core/thumbnail'
import { mergePages } from './core/merge'
import { extractPages, splitByRanges, splitEveryNPages } from './core/split'
import { buildExportFilename, downloadBlob, downloadPdf } from './core/download'
import { zipFiles } from './core/zip'
import { parseRangeGroups, planSplitDownload } from './core/split-plan'
import type { SourceFile, WorkspacePage } from './core/types'
import { useSourceFiles } from './state/useSourceFiles'
import { useWorkspacePages } from './state/useWorkspacePages'
import { strings } from './strings'
import './styles/App.css'

/**
 * Workspace screen.
 * Owns the `sourceFiles` state, derives the flat `pages` array from it, and
 * renders the page grid below the dropzone. A single
 * {@link ThumbnailRenderer} is shared across every card so each source document
 * is parsed once regardless of how many of its pages are on screen. Export is
 * wired through the toolbar above the workspace.
 */
export default function App() {
  const { sourceFiles, rejected, isLoading, addFiles, dismissRejected } =
    useSourceFiles()

  // One rasteriser for the whole workspace — its per-source document cache is
  // what keeps a many-page file from being re-parsed per thumbnail.
  const renderer = useMemo(() => new ThumbnailRenderer(), [])

  // The SSoT `pages` array (order/rotation/deletion) plus its mutations and the
  // selection set. Drag reordering commits through `reorder`; the per-card
  // rotate/delete/select controls commit through the rest.
  const { pages, selected, reorder, rotate, delete: deletePages, toggleSelect } =
    useWorkspacePages(sourceFiles)

  // A card's delete button removes exactly that one page; the SSoT `delete`
  // takes an id iterable, so wrap the single id.
  const deleteOne = useCallback(
    (id: string) => deletePages([id]),
    [deletePages],
  )

  // Export All (merge): assemble the current `pages` (order +
  // rotation) into one PDF and hand the bytes to the client-side download. This
  // "how" lives here in the UI-owning layer; the toolbar owns the "when"
  // (button-state, in-progress, inline error). Rejects propagate so the toolbar
  // can surface the failure. All bytes stay in the browser.
  const exportAll = useCallback(
    async (pagesToExport: WorkspacePage[], files: SourceFile[]) => {
      const bytes = await mergePages(pagesToExport, files)
      const filename = buildExportFilename(files.map((file) => file.name))
      downloadPdf(bytes, filename)
    },
    [],
  )

  // The checked pages in workspace order — filtering the ordered SSoT `pages`
  // by the selection set preserves output order. This is the
  // exact subset Export Selected Pages assembles.
  const selectedPages = useMemo(
    () => pages.filter((page) => selected.has(page.id)),
    [pages, selected],
  )

  // Export Selected Pages (extract): assemble only the checked pages
  // into a single PDF via the pure `extractPages` core, then download. Mirrors
  // `exportAll`'s split of concerns — this "how" lives here, the toolbar owns
  // the "when". The file is named after the source document(s) the selection
  // draws from, falling back to a generic name when no source name is usable. Rejects
  // propagate so the toolbar can surface the inline error.
  const exportSelected = useCallback(
    async (pagesToExport: WorkspacePage[], files: SourceFile[]) => {
      const bytes = await extractPages(pagesToExport, files)
      const nameById = new Map(files.map((file) => [file.id, file.name]))
      // Distinct origin file names in first-seen order; blanks are skipped so
      // buildExportFilename applies the selected-pages fallback when none remain.
      const sourceNames: string[] = []
      const seen = new Set<string>()
      for (const page of pagesToExport) {
        if (seen.has(page.sourceFileId)) continue
        seen.add(page.sourceFileId)
        const name = nameById.get(page.sourceFileId)
        if (name) sourceNames.push(name)
      }
      const filename = buildExportFilename(sourceNames, {
        fallback: strings.filenames.selectedPagesFallback,
      })
      downloadPdf(bytes, filename)
    },
    [],
  )

  // Executes a split result: one part downloads as a plain PDF,
  // several bundle into one zip. The single-vs-zip decision and all naming is the
  // pure `planSplitDownload`; this wiring only performs the plan's I/O — zip the
  // entries when needed and hand the Blob/bytes to the client-side download. All
  // bytes stay in the browser. Shared by both split flows.
  const deliverSplit = useCallback(
    async (parts: Uint8Array[], files: SourceFile[]) => {
      const plan = planSplitDownload(parts, files)
      if (plan.kind === 'single') {
        downloadPdf(plan.bytes, plan.filename)
        return
      }
      const blob = await zipFiles(plan.entries)
      downloadBlob(blob, plan.filename)
    },
    [],
  )

  // Split by N Pages: chunk the workspace into fixed-size PDFs
  // via the pure `splitEveryNPages`, then deliver (single PDF or zip). Rejects
  // propagate so the toolbar surfaces the inline error.
  const exportSplitByCount = useCallback(
    async (count: number, pagesToSplit: WorkspacePage[], files: SourceFile[]) => {
      const parts = await splitEveryNPages(pagesToSplit, files, count)
      await deliverSplit(parts, files)
    },
    [deliverSplit],
  )

  // Split by Range: the toolbar hands us the validated raw range
  // string; reconstruct one index group per comma segment (`parseRangeGroups`),
  // split into one PDF per group, then deliver (single PDF or zip). Rejects
  // propagate so the toolbar surfaces the inline error.
  const exportSplitByRanges = useCallback(
    async (
      rangeInput: string,
      pagesToSplit: WorkspacePage[],
      files: SourceFile[],
    ) => {
      const groups = parseRangeGroups(rangeInput, pagesToSplit.length)
      const parts = await splitByRanges(pagesToSplit, files, groups)
      await deliverSplit(parts, files)
    },
    [deliverSplit],
  )

  return (
    <div className="app-shell">
      <AppHeader />
      <Toolbar
        pages={pages}
        selectedPages={selectedPages}
        sourceFiles={sourceFiles}
        onExportAll={exportAll}
        onExportSelected={exportSelected}
        onSplitByCount={exportSplitByCount}
        onSplitByRanges={exportSplitByRanges}
        selectedCount={selected.size}
      />
      <main className="workspace">
        <Dropzone
          sourceFiles={sourceFiles}
          rejected={rejected}
          isLoading={isLoading}
          onAddFiles={addFiles}
          onDismissRejected={dismissRejected}
        />
        <PageGrid
          sourceFiles={sourceFiles}
          pages={pages}
          renderer={renderer}
          onReorder={reorder}
          selected={selected}
          onRotate={rotate}
          onDelete={deleteOne}
          onToggleSelect={toggleSelect}
        />
      </main>
    </div>
  )
}
