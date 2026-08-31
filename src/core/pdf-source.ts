import { PDFDocument } from 'pdf-lib'
import type { LoadResult, SourceFile } from './types'
import { strings } from '../strings'

/**
 * Reads a PDF and produces a {@link SourceFile}, or a classified error.
 *
 * React-independent. Accepts either a browser `File`
 * (drag-and-drop / file picker) or a raw `ArrayBuffer` (tests, programmatic
 * use). Never throws for bad input — encryption and corruption are reported as
 * distinct {@link LoadResult} errors so the UI can show the right guidance
 * while keeping existing workspace state intact.
 */

// User-facing messages come from the central strings module.
const ENCRYPTED_MESSAGE = strings.errors.pdfSource.encrypted
const CORRUPT_MESSAGE = strings.errors.pdfSource.corrupt

/** Fallback name when loading raw bytes without an originating `File`. */
const DEFAULT_NAME = 'document.pdf'

export interface LoadOptions {
  /**
   * Identifier to assign. Injectable so the function stays deterministic under
   * test; the state layer omits it to auto-generate one at load time.
   */
  id?: string
  /** Overrides the derived name (required to label raw `ArrayBuffer` input). */
  name?: string
}

function createId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Runtime fallback only; tests pin `id` explicitly via LoadOptions.
  return `src-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

/**
 * Extracts page count and metadata from a PDF.
 *
 * @param input Original `File` or raw `ArrayBuffer`.
 * @param options Optional `id` / `name` overrides.
 * @returns `{ ok: true, file }` on success; `{ ok: false, error }` with
 *          `error.kind` of `'encrypted'` or `'corrupt'` on failure.
 */
export async function loadSourceFile(
  input: File | ArrayBuffer,
  options: LoadOptions = {},
): Promise<LoadResult> {
  const isBuffer = input instanceof ArrayBuffer
  const bytes: ArrayBuffer = isBuffer ? input : await input.arrayBuffer()
  const name = options.name ?? (isBuffer ? DEFAULT_NAME : input.name)

  let doc: PDFDocument
  try {
    // Load with `ignoreEncryption: true` so encryption does NOT surface as a
    // thrown error — only genuinely unparseable (corrupt) bytes throw here.
    // Encryption is then reported via the reliable `isEncrypted` flag below;
    // pdf-lib's error subclasses can't be distinguished with `instanceof`.
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  } catch {
    return { ok: false, error: { kind: 'corrupt', message: CORRUPT_MESSAGE } }
  }

  if (doc.isEncrypted) {
    return { ok: false, error: { kind: 'encrypted', message: ENCRYPTED_MESSAGE } }
  }

  const file: SourceFile = {
    id: options.id ?? createId(),
    name,
    bytes,
    pageCount: doc.getPageCount(),
  }
  return { ok: true, file }
}
