import { describe, expect, it, vi } from 'vitest'
import { createSourceId, loadFiles } from './useSourceFiles'
import type { LoadResult, SourceFile } from '../core/types'
import { strings } from '../strings'

/**
 * `loadFiles` is the pure, React-free heart of the state layer. These tests
 * drive it with an injected fake loader so no real PDF bytes are needed and the
 * batch / partial-failure / id-ownership behaviour is verified in isolation.
 */

/** Minimal `File` stand-in — `loadFiles` only reads `.name` off the input. */
function fakeFile(name: string): File {
  return { name } as unknown as File

}

/** A loader that resolves each file by looking its name up in a script. */
function scriptedLoader(script: Record<string, LoadResult>) {
  return vi.fn(
    async (
      input: File | ArrayBuffer,
      options?: { id?: string },
    ): Promise<LoadResult> => {
      const name = (input as File).name
      const result = script[name]
      if (!result) throw new Error(`no scripted result for ${name}`)
      // Echo the id the state layer assigned so tests can assert ownership.
      if (result.ok && options?.id) {
        return { ok: true, file: { ...result.file, id: options.id } }
      }
      return result
    },
  )
}

function ok(name: string, pageCount: number): LoadResult {
  const file: SourceFile = {
    id: 'placeholder',
    name,
    bytes: new ArrayBuffer(0),
    pageCount,
  }
  return { ok: true, file }
}

function corrupt(): LoadResult {
  return {
    ok: false,
    error: { kind: 'corrupt', message: strings.errors.pdfSource.corrupt },
  }
}

function encrypted(): LoadResult {
  return {
    ok: false,
    error: { kind: 'encrypted', message: strings.errors.pdfSource.encrypted },
  }
}

describe('loadFiles', () => {
  it('loads multiple PDFs and reports each file info', async () => {
    const loader = scriptedLoader({
      'a.pdf': ok('a.pdf', 3),
      'b.pdf': ok('b.pdf', 7),
    })

    const { added, rejected } = await loadFiles(
      [fakeFile('a.pdf'), fakeFile('b.pdf')],
      { loader, genId: idSeq() },
    )

    expect(rejected).toHaveLength(0)
    expect(added.map((f) => [f.name, f.pageCount])).toEqual([
      ['a.pdf', 3],
      ['b.pdf', 7],
    ])
  })

  it('assigns a distinct state-layer id to each loaded file', async () => {
    const loader = scriptedLoader({
      'a.pdf': ok('a.pdf', 1),
      'b.pdf': ok('b.pdf', 1),
    })

    const { added } = await loadFiles(
      [fakeFile('a.pdf'), fakeFile('b.pdf')],
      { loader, genId: idSeq() },
    )

    const ids = added.map((f) => f.id)
    expect(ids).toEqual(['id-0', 'id-1'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the successes when part of the batch fails (design spec §6)', async () => {
    const loader = scriptedLoader({
      'good.pdf': ok('good.pdf', 2),
      'locked.pdf': encrypted(),
      'broken.pdf': corrupt(),
    })

    const { added, rejected } = await loadFiles(
      [fakeFile('good.pdf'), fakeFile('locked.pdf'), fakeFile('broken.pdf')],
      { loader, genId: idSeq() },
    )

    expect(added.map((f) => f.name)).toEqual(['good.pdf'])
    expect(rejected).toEqual([
      {
        name: 'locked.pdf',
        kind: 'encrypted',
        message: strings.errors.pdfSource.encrypted,
      },
      {
        name: 'broken.pdf',
        kind: 'corrupt',
        message: strings.errors.pdfSource.corrupt,
      },
    ])
  })

  it('returns empty partitions for an empty batch', async () => {
    const loader = scriptedLoader({})
    const result = await loadFiles([], { loader, genId: idSeq() })
    expect(result).toEqual({ added: [], rejected: [] })
    expect(loader).not.toHaveBeenCalled()
  })
})

describe('createSourceId', () => {
  it('produces a distinct, non-empty id on each call', () => {
    const ids = new Set([createSourceId(), createSourceId(), createSourceId()])
    expect(ids.size).toBe(3)
    for (const id of ids) expect(id.length).toBeGreaterThan(0)
  })
})

/** Deterministic id generator for assertions. */
function idSeq(): () => string {
  let n = 0
  return () => `id-${n++}`
}
