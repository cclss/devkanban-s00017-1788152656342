import { PDFDocument } from 'pdf-lib'

/**
 * Test fixtures for {@link loadSourceFile}. Kept out of the production module so
 * the core stays dependency-light; only tests build synthetic PDFs.
 */

/** Copies a Uint8Array view into a standalone ArrayBuffer of exactly its bytes. */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

/** A structurally valid PDF with the requested number of blank pages. */
export async function makeValidPdf(pageCount: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i += 1) doc.addPage([612, 792])
  return toArrayBuffer(await doc.save())
}

/**
 * Bytes that are not a parseable PDF at all — no header, no objects, no xref.
 * pdf-lib rejects these with a parse error (classified as `corrupt`).
 */
export function makeCorruptFile(): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode('not a pdf at all — %%broken bytes'))
}

/**
 * A minimal but well-formed PDF whose trailer declares `/Encrypt`, so pdf-lib
 * detects encryption and throws `EncryptedPDFError`. pdf-lib cannot *write*
 * encrypted PDFs, so we assemble the bytes by hand with a correct xref table.
 */
export function makeEncryptedPdf(): ArrayBuffer {
  const encoder = new TextEncoder()
  const byteLen = (s: string) => encoder.encode(s).length

  const header = '%PDF-1.4\n'
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
    // Standard security handler dictionary. Contents are never decrypted by
    // pdf-lib; its mere presence flags the document as encrypted.
    '<< /Filter /Standard /V 1 /R 2 /O <0123456789abcdef0123456789abcdef> ' +
      '/U <0123456789abcdef0123456789abcdef> /P -44 >>',
  ]

  const offsets: number[] = []
  let body = ''
  let cursor = byteLen(header)
  bodies.forEach((obj, i) => {
    offsets[i] = cursor
    const chunk = `${i + 1} 0 obj\n${obj}\nendobj\n`
    body += chunk
    cursor += byteLen(chunk)
  })

  const xrefOffset = cursor
  // Each xref entry is exactly 20 bytes: "nnnnnnnnnn ggggg t\r\n".
  const pad = (n: number, width: number) => n.toString().padStart(width, '0')
  let xref = `xref\n0 ${bodies.length + 1}\n`
  xref += '0000000000 65535 f\r\n'
  offsets.forEach((off) => {
    xref += `${pad(off, 10)} ${pad(0, 5)} n\r\n`
  })

  const trailer =
    `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R /Encrypt 4 0 R ` +
    '/ID [<0123456789abcdef0123456789abcdef> <0123456789abcdef0123456789abcdef>] >>\n' +
    `startxref\n${xrefOffset}\n%%EOF`

  return toArrayBuffer(encoder.encode(header + body + xref + trailer))
}
