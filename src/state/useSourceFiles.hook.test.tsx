// @vitest-environment jsdom
/**
 * React-binding tests for {@link useSourceFiles}.
 *
 * `useSourceFiles.test.ts` already covers the pure `loadFiles` partitioning. The
 * behaviour that only lives in the hook — appending each batch's successes onto
 * the *existing* `sourceFiles` so a later failing batch never drops what is
 * already loaded — is verified here with `renderHook`, using an injected fake
 * loader so no real PDF bytes are needed.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useSourceFiles } from './useSourceFiles'
import type { LoadResult, SourceFile } from '../core/types'
import { strings } from '../strings'

afterEach(cleanup)

/** Minimal `File` stand-in — the loader only reads `.name`. */
function fakeFile(name: string): File {
  return { name } as unknown as File
}

function scriptedLoader(script: Record<string, LoadResult>) {
  return async (
    input: File | ArrayBuffer,
    options?: { id?: string },
  ): Promise<LoadResult> => {
    const name = (input as File).name
    const result = script[name]
    if (!result) throw new Error(`no scripted result for ${name}`)
    if (result.ok && options?.id) {
      return { ok: true, file: { ...result.file, id: options.id } }
    }
    return result
  }
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

const encrypted: LoadResult = {
  ok: false,
  error: { kind: 'encrypted', message: strings.errors.pdfSource.encrypted },
}
const corrupt: LoadResult = {
  ok: false,
  error: { kind: 'corrupt', message: strings.errors.pdfSource.corrupt },
}

function idSeq(): () => string {
  let n = 0
  return () => `id-${n++}`
}

describe('useSourceFiles hook', () => {
  it('appends a later batch onto the existing sourceFiles', async () => {
    const loader = scriptedLoader({
      'a.pdf': ok('a.pdf', 1),
      'b.pdf': ok('b.pdf', 2),
    })
    const { result } = renderHook(() =>
      useSourceFiles({ loader, genId: idSeq() }),
    )

    await act(async () => {
      await result.current.addFiles([fakeFile('a.pdf')])
    })
    await act(async () => {
      await result.current.addFiles([fakeFile('b.pdf')])
    })

    expect(result.current.sourceFiles.map((f) => f.name)).toEqual([
      'a.pdf',
      'b.pdf',
    ])
  })

  it('keeps already-loaded files when a later batch is fully rejected', async () => {
    const loader = scriptedLoader({
      'good.pdf': ok('good.pdf', 3),
      'locked.pdf': encrypted,
      'broken.pdf': corrupt,
    })
    const { result } = renderHook(() =>
      useSourceFiles({ loader, genId: idSeq() }),
    )

    await act(async () => {
      await result.current.addFiles([fakeFile('good.pdf')])
    })
    await act(async () => {
      await result.current.addFiles([
        fakeFile('locked.pdf'),
        fakeFile('broken.pdf'),
      ])
    })

    // Existing success is preserved; nothing new is added.
    expect(result.current.sourceFiles.map((f) => f.name)).toEqual(['good.pdf'])
    // Only the failed files surface, with their kinds intact.
    expect(result.current.rejected.map((r) => [r.name, r.kind])).toEqual([
      ['locked.pdf', 'encrypted'],
      ['broken.pdf', 'corrupt'],
    ])
  })

  it('replaces rejections with the newest batch and clears them on dismiss', async () => {
    const loader = scriptedLoader({
      'locked.pdf': encrypted,
      'later.pdf': ok('later.pdf', 1),
    })
    const { result } = renderHook(() =>
      useSourceFiles({ loader, genId: idSeq() }),
    )

    await act(async () => {
      await result.current.addFiles([fakeFile('locked.pdf')])
    })
    expect(result.current.rejected).toHaveLength(1)

    // A subsequent clean batch clears the stale rejection banner.
    await act(async () => {
      await result.current.addFiles([fakeFile('later.pdf')])
    })
    expect(result.current.rejected).toHaveLength(0)
    expect(result.current.sourceFiles.map((f) => f.name)).toEqual(['later.pdf'])

    // And an explicit dismiss also clears any standing rejections.
    await act(async () => {
      await result.current.addFiles([fakeFile('locked.pdf')])
    })
    expect(result.current.rejected).toHaveLength(1)
    act(() => result.current.dismissRejected())
    expect(result.current.rejected).toHaveLength(0)
  })
})
