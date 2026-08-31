import { describe, it, expect } from 'vitest'
import { zipFiles } from './zip'

/**
 * Reads the entry names out of a real zip archive by scanning its central
 * directory records (signature `PK\x01\x02`). Each record stores the file-name
 * length at offset +28 and the name itself starting at offset +46. This proves
 * the produced bytes are a genuine, parseable zip — not just a non-empty Blob.
 */
function readZipEntryNames(buffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const decoder = new TextDecoder()
  const names: string[] = []
  for (let i = 0; i + 46 <= bytes.length; i++) {
    // Central directory header signature: 50 4b 01 02 (little-endian).
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x01 &&
      bytes[i + 3] === 0x02
    ) {
      const nameLen = view.getUint16(i + 28, true)
      names.push(decoder.decode(bytes.subarray(i + 46, i + 46 + nameLen)))
    }
  }
  return names
}

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('zipFiles — archive shape', () => {
  it('produces a Blob typed as application/zip', async () => {
    const blob = await zipFiles([{ name: 'a.pdf', bytes: bytesOf('A') }])
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/zip')
    expect(blob.size).toBeGreaterThan(0)
  })

  it('emits one central-directory entry per input file, in order', async () => {
    const blob = await zipFiles([
      { name: 'report-1.pdf', bytes: bytesOf('one') },
      { name: 'report-2.pdf', bytes: bytesOf('two') },
      { name: 'report-3.pdf', bytes: bytesOf('three') },
    ])
    const names = readZipEntryNames(await blob.arrayBuffer())
    expect(names).toEqual(['report-1.pdf', 'report-2.pdf', 'report-3.pdf'])
  })

  it('preserves a single entry name', async () => {
    const blob = await zipFiles([{ name: 'only.pdf', bytes: bytesOf('x') }])
    const names = readZipEntryNames(await blob.arrayBuffer())
    expect(names).toEqual(['only.pdf'])
  })

  it('keeps non-ASCII (UTF-8) entry names intact', async () => {
    const blob = await zipFiles([{ name: 'résumé-1.pdf', bytes: bytesOf('x') }])
    const names = readZipEntryNames(await blob.arrayBuffer())
    expect(names).toEqual(['résumé-1.pdf'])
  })
})

describe('zipFiles — guards', () => {
  it('rejects an empty entry list', async () => {
    await expect(zipFiles([])).rejects.toThrow(/no entries/i)
  })
})
