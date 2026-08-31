import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PAGE_ROTATION,
  ROTATION_STEP,
  deletePages,
  deriveWorkspacePages,
  reconcilePages,
  reorderPages,
  rotatePage,
  workspacePageId,
} from './pages'
import type { SourceFile, WorkspacePage } from './types'

/**
 * A `SourceFile` with a real (but empty) ArrayBuffer. The pages builder never
 * inspects the bytes, so their content is irrelevant to these tests.
 */
function makeSource(id: string, pageCount: number, name = `${id}.pdf`): SourceFile {
  return { id, name, bytes: new ArrayBuffer(0), pageCount }
}

describe('workspacePageId', () => {
  it('builds a stable, delimited id from source id and page index', () => {
    expect(workspacePageId('src-a', 0)).toBe('src-a:0')
    expect(workspacePageId('src-a', 12)).toBe('src-a:12')
  })

  it('is deterministic for the same inputs', () => {
    expect(workspacePageId('src-b', 3)).toBe(workspacePageId('src-b', 3))
  })
})

describe('deriveWorkspacePages', () => {
  it('returns no pages for an empty workspace', () => {
    expect(deriveWorkspacePages([])).toEqual([])
  })

  it('emits one page per page of a single file, in ascending page order', () => {
    const pages = deriveWorkspacePages([makeSource('src-a', 3)])

    expect(pages).toHaveLength(3)
    expect(pages.map((p) => p.pageIndex)).toEqual([0, 1, 2])
    expect(pages.every((p) => p.sourceFileId === 'src-a')).toBe(true)
  })

  it('flattens multiple files file-by-file, preserving load order', () => {
    const pages = deriveWorkspacePages([
      makeSource('src-a', 2),
      makeSource('src-b', 1),
      makeSource('src-c', 2),
    ])

    expect(pages.map((p) => [p.sourceFileId, p.pageIndex])).toEqual([
      ['src-a', 0],
      ['src-a', 1],
      ['src-b', 0],
      ['src-c', 0],
      ['src-c', 1],
    ])
  })

  it('gives every derived page a stable, unique id', () => {
    const pages = deriveWorkspacePages([
      makeSource('src-a', 2),
      makeSource('src-b', 2),
    ])
    const ids = pages.map((p) => p.id)

    expect(ids).toEqual(['src-a:0', 'src-a:1', 'src-b:0', 'src-b:1'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('starts every page at the default rotation', () => {
    const pages = deriveWorkspacePages([makeSource('src-a', 2)])
    expect(pages.every((p) => p.rotation === DEFAULT_PAGE_ROTATION)).toBe(true)
    expect(DEFAULT_PAGE_ROTATION).toBe(0)
  })

  it('contributes nothing for a zero-page file but keeps the rest', () => {
    const pages = deriveWorkspacePages([
      makeSource('src-a', 0),
      makeSource('src-b', 2),
    ])
    expect(pages.map((p) => p.sourceFileId)).toEqual(['src-b', 'src-b'])
  })

  it('does not mutate the source files it reads', () => {
    const source = makeSource('src-a', 1)
    const before = { ...source }
    deriveWorkspacePages([source])
    expect(source).toEqual(before)
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'throws RangeError on an invalid pageCount (%s)',
    (bad) => {
      expect(() => deriveWorkspacePages([makeSource('src-a', bad)])).toThrow(
        RangeError,
      )
    },
  )
})

/** Builds a workspace page directly, for the mutation-function tests. */
function page(id: string, rotation = 0): WorkspacePage {
  const [sourceFileId, pageIndex] = id.split(':')
  return { id, sourceFileId, pageIndex: Number(pageIndex), rotation }
}

/** Reads back the order of an SSoT array as a plain id list. */
function order(pages: readonly WorkspacePage[]): string[] {
  return pages.map((p) => p.id)
}

describe('reorderPages', () => {
  const base = [page('a:0'), page('a:1'), page('a:2'), page('a:3')]

  it('moves a page forward to the target slot (dnd-kit arrayMove)', () => {
    expect(order(reorderPages(base, 'a:0', 'a:2'))).toEqual([
      'a:1',
      'a:2',
      'a:0',
      'a:3',
    ])
  })

  it('moves a page backward to the target slot', () => {
    expect(order(reorderPages(base, 'a:3', 'a:1'))).toEqual([
      'a:0',
      'a:3',
      'a:1',
      'a:2',
    ])
  })

  it('is a no-op when source and target are the same page', () => {
    expect(order(reorderPages(base, 'a:1', 'a:1'))).toEqual(order(base))
  })

  it('is a no-op when an id is not in the grid', () => {
    expect(order(reorderPages(base, 'a:1', 'ghost'))).toEqual(order(base))
    expect(order(reorderPages(base, 'ghost', 'a:1'))).toEqual(order(base))
  })

  it('never mutates the input array', () => {
    const snapshot = order(base)
    reorderPages(base, 'a:0', 'a:3')
    expect(order(base)).toEqual(snapshot)
  })
})

describe('rotatePage', () => {
  it('adds one 90° step to the targeted page only', () => {
    const pages = [page('a:0', 0), page('a:1', 90)]
    const next = rotatePage(pages, 'a:1')
    expect(next.map((p) => p.rotation)).toEqual([0, 180])
  })

  it('wraps 270° back to 0° (cycles within [0, 360))', () => {
    const next = rotatePage([page('a:0', 270)], 'a:0')
    expect(next[0].rotation).toBe(0)
  })

  it('cycles a page through the full turn', () => {
    let pages = [page('a:0', 0)]
    const seen: number[] = []
    for (let i = 0; i < 4; i += 1) {
      pages = rotatePage(pages, 'a:0')
      seen.push(pages[0].rotation)
    }
    expect(seen).toEqual([90, 180, 270, 0])
    expect(ROTATION_STEP).toBe(90)
  })

  it('is a no-op copy for an unknown id', () => {
    const pages = [page('a:0', 90)]
    const next = rotatePage(pages, 'ghost')
    expect(next.map((p) => p.rotation)).toEqual([90])
  })

  it('does not mutate the input pages', () => {
    const pages = [page('a:0', 0)]
    rotatePage(pages, 'a:0')
    expect(pages[0].rotation).toBe(0)
  })
})

describe('deletePages', () => {
  const base = [page('a:0'), page('a:1'), page('a:2')]

  it('removes the listed pages, preserving the order of the rest', () => {
    expect(order(deletePages(base, ['a:1']))).toEqual(['a:0', 'a:2'])
  })

  it('removes several pages at once', () => {
    expect(order(deletePages(base, ['a:0', 'a:2']))).toEqual(['a:1'])
  })

  it('accepts a Set of ids', () => {
    expect(order(deletePages(base, new Set(['a:0'])))).toEqual(['a:1', 'a:2'])
  })

  it('ignores ids that match no page', () => {
    expect(order(deletePages(base, ['ghost']))).toEqual(order(base))
  })

  it('returns an order-preserving copy for an empty selection', () => {
    expect(order(deletePages(base, []))).toEqual(order(base))
  })

  it('does not mutate the input array', () => {
    deletePages(base, ['a:1'])
    expect(order(base)).toEqual(['a:0', 'a:1', 'a:2'])
  })
})

describe('reconcilePages', () => {
  it('appends pages of a newly loaded file to the end', () => {
    const prev = deriveWorkspacePages([makeSource('src-a', 2)])
    const next = reconcilePages(prev, [
      makeSource('src-a', 2),
      makeSource('src-b', 2),
    ])
    expect(order(next)).toEqual(['src-a:0', 'src-a:1', 'src-b:0', 'src-b:1'])
  })

  it('preserves a reordered arrangement of existing pages', () => {
    const files = [makeSource('src-a', 3)]
    const reordered = reorderPages(deriveWorkspacePages(files), 'src-a:0', 'src-a:2')
    const next = reconcilePages(reordered, [
      makeSource('src-a', 3),
      makeSource('src-b', 1),
    ])
    expect(order(next)).toEqual([
      'src-a:1',
      'src-a:2',
      'src-a:0',
      'src-b:0',
    ])
  })

  it('preserves rotation on existing pages', () => {
    const files = [makeSource('src-a', 1)]
    const rotated = rotatePage(deriveWorkspacePages(files), 'src-a:0')
    const next = reconcilePages(rotated, [
      makeSource('src-a', 1),
      makeSource('src-b', 1),
    ])
    expect(next.find((p) => p.id === 'src-a:0')?.rotation).toBe(90)
  })

  it('does not re-add a page the user deleted from an existing file', () => {
    const files = [makeSource('src-a', 3)]
    const afterDelete = deletePages(deriveWorkspacePages(files), ['src-a:1'])
    // sourceFiles unchanged: the deleted page must stay gone.
    const next = reconcilePages(afterDelete, files)
    expect(order(next)).toEqual(['src-a:0', 'src-a:2'])
  })

  it('keeps deletions in an existing file while appending a new file', () => {
    const afterDelete = deletePages(
      deriveWorkspacePages([makeSource('src-a', 2)]),
      ['src-a:0'],
    )
    const next = reconcilePages(afterDelete, [
      makeSource('src-a', 2),
      makeSource('src-b', 1),
    ])
    expect(order(next)).toEqual(['src-a:1', 'src-b:0'])
  })

  it('drops pages whose source file was removed', () => {
    const prev = deriveWorkspacePages([
      makeSource('src-a', 1),
      makeSource('src-b', 2),
    ])
    const next = reconcilePages(prev, [makeSource('src-b', 2)])
    expect(order(next)).toEqual(['src-b:0', 'src-b:1'])
  })

  it('returns an empty array when all files are removed', () => {
    const prev = deriveWorkspacePages([makeSource('src-a', 2)])
    expect(reconcilePages(prev, [])).toEqual([])
  })

  it('derives fresh pages from an empty prior state', () => {
    expect(order(reconcilePages([], [makeSource('src-a', 2)]))).toEqual([
      'src-a:0',
      'src-a:1',
    ])
  })

  it('does not mutate the prior pages array', () => {
    const prev = deriveWorkspacePages([makeSource('src-a', 1)])
    const snapshot = order(prev)
    reconcilePages(prev, [makeSource('src-a', 1), makeSource('src-b', 1)])
    expect(order(prev)).toEqual(snapshot)
  })
})
