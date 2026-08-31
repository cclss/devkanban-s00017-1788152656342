import { describe, it, expect } from 'vitest'
import { loadSourceFile } from './pdf-source'
import { makeValidPdf, makeCorruptFile, makeEncryptedPdf } from './__fixtures__/pdf-fixtures'

describe('loadSourceFile', () => {
  describe('valid PDFs', () => {
    it('returns the exact page count for a single-page PDF', async () => {
      const result = await loadSourceFile(await makeValidPdf(1), { id: 'a', name: 'one.pdf' })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.file.pageCount).toBe(1)
      expect(result.file.id).toBe('a')
      expect(result.file.name).toBe('one.pdf')
    })

    it('returns the exact page count for a multi-page PDF', async () => {
      const result = await loadSourceFile(await makeValidPdf(7), { id: 'b' })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.file.pageCount).toBe(7)
    })

    it('preserves the original bytes untouched', async () => {
      const bytes = await makeValidPdf(3)
      const result = await loadSourceFile(bytes)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.file.bytes).toBe(bytes)
      expect(result.file.bytes.byteLength).toBe(bytes.byteLength)
    })

    it('auto-generates an id when none is supplied', async () => {
      const result = await loadSourceFile(await makeValidPdf(2))

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.file.id).toBeTruthy()
      expect(typeof result.file.id).toBe('string')
    })

    it('accepts a browser File and derives the name from it', async () => {
      const bytes = await makeValidPdf(4)
      const file = new File([bytes], 'report.pdf', { type: 'application/pdf' })

      const result = await loadSourceFile(file)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.file.pageCount).toBe(4)
      expect(result.file.name).toBe('report.pdf')
    })
  })

  describe('rejected files', () => {
    it('rejects an encrypted PDF with a distinct "encrypted" error', async () => {
      const result = await loadSourceFile(makeEncryptedPdf())

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('encrypted')
      expect(result.error.message).toContain('password')
    })

    it('rejects a corrupt/non-PDF file with a distinct "corrupt" error', async () => {
      const result = await loadSourceFile(makeCorruptFile())

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('corrupt')
    })

    it('distinguishes encrypted from corrupt (they are not the same error)', async () => {
      const encrypted = await loadSourceFile(makeEncryptedPdf())
      const corrupt = await loadSourceFile(makeCorruptFile())

      expect(encrypted.ok).toBe(false)
      expect(corrupt.ok).toBe(false)
      if (encrypted.ok || corrupt.ok) return
      expect(encrypted.error.kind).not.toBe(corrupt.error.kind)
    })

    it('never throws — failures are returned as values', async () => {
      await expect(loadSourceFile(makeCorruptFile())).resolves.toBeDefined()
      await expect(loadSourceFile(makeEncryptedPdf())).resolves.toBeDefined()
    })
  })
})
