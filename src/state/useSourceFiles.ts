/**
 * `sourceFiles` state layer for the PDF workspace.
 *
 * Owns the identity and batch-loading rules for loaded PDFs while delegating
 * every *load judgment* (page count, encrypted vs corrupt) to the core
 * module. Kept deliberately thin: the pure {@link loadFiles} function does the
 * work and is unit tested without React or the DOM; the hook only holds the
 * resulting state and appends batches.
 */
import { useCallback, useState } from 'react'
import { loadSourceFile } from '../core/pdf-source'
import type { LoadErrorKind, SourceFile } from '../core/types'

/** A file the user tried to load that the core rejected. */
export interface RejectedFile {
  /** Original file name, so the inline message can point at the offending file. */
  name: string
  /** Why it was rejected — mirrors the core {@link LoadErrorKind}. */
  kind: LoadErrorKind
  /** Human-facing message suitable for inline display. */
  message: string
}

/** Outcome of loading one batch: what was added and what was rejected. */
export interface AddFilesResult {
  added: SourceFile[]
  rejected: RejectedFile[]
}

/** Injection seam so {@link loadFiles} stays deterministic under test. */
export interface LoadFilesDeps {
  loader?: typeof loadSourceFile
  genId?: () => string
}

/**
 * Generates a stable id for a source file. The state layer owns identity so
 * pages can link back to their origin regardless of load order.
 */
export function createSourceId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Runtime fallback only; tests inject a deterministic generator.
  return `src-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

/**
 * Loads a batch of files through the core loader and partitions the outcome.
 *
 * Pure and React-free: successes and failures are returned separately so the
 * caller decides how to merge them. A partial failure never discards the
 * successes in the same batch — each file is judged independently.
 *
 * @param files Files chosen via drop or the file picker.
 * @param deps Optional loader / id generator overrides (tests inject fakes).
 */
export async function loadFiles(
  files: File[],
  deps: LoadFilesDeps = {},
): Promise<AddFilesResult> {
  const loader = deps.loader ?? loadSourceFile
  const genId = deps.genId ?? createSourceId

  const results = await Promise.all(
    files.map((file) => loader(file, { id: genId() })),
  )

  const added: SourceFile[] = []
  const rejected: RejectedFile[] = []
  results.forEach((result, index) => {
    if (result.ok) {
      added.push(result.file)
    } else {
      rejected.push({
        name: files[index].name,
        kind: result.error.kind,
        message: result.error.message,
      })
    }
  })

  return { added, rejected }
}

export interface UseSourceFiles {
  /** All successfully loaded PDFs, in load order. */
  sourceFiles: SourceFile[]
  /** Files rejected by the most recent batch, awaiting dismissal. */
  rejected: RejectedFile[]
  /** True while a batch is being read. */
  isLoading: boolean
  /**
   * Loads a batch and appends the successes to existing state. Returns the
   * batch outcome for callers that want to react to it.
   */
  addFiles: (files: File[]) => Promise<AddFilesResult>
  /** Clears the current inline rejection messages. */
  dismissRejected: () => void
}

/**
 * React binding over {@link loadFiles}. Appends each batch's successes to the
 * existing `sourceFiles` (so loading more files mid-session never drops what is
 * already loaded) and surfaces the batch's rejections for inline display.
 */
export function useSourceFiles(deps: LoadFilesDeps = {}): UseSourceFiles {
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([])
  const [rejected, setRejected] = useState<RejectedFile[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const addFiles = useCallback(
    async (files: File[]): Promise<AddFilesResult> => {
      if (files.length === 0) return { added: [], rejected: [] }

      setIsLoading(true)
      try {
        const result = await loadFiles(files, deps)
        if (result.added.length > 0) {
          setSourceFiles((prev) => [...prev, ...result.added])
        }
        setRejected(result.rejected)
        return result
      } finally {
        setIsLoading(false)
      }
    },
    // `deps` is a stable injection seam supplied once at the call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const dismissRejected = useCallback(() => setRejected([]), [])

  return { sourceFiles, rejected, isLoading, addFiles, dismissRejected }
}
