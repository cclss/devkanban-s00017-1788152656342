import { describe, expect, it } from 'vitest'
import { planStagePath } from './stage-path'
import { STAGES, canTransition, type Stage } from '../../state/stage'

/** Replays a path from `from`, asserting each step is a legal edge. */
function walk(from: Stage, path: Stage[]): Stage {
  let current = from
  for (const next of path) {
    expect(canTransition(current, next)).toBe(true)
    current = next
  }
  return current
}

describe('planStagePath', () => {
  it('returns an empty path when already at the target', () => {
    for (const stage of STAGES) {
      expect(planStagePath(stage, stage)).toEqual([])
    }
  })

  it('walks the happy path from idle to done', () => {
    expect(planStagePath('idle', 'done')).toEqual(['load', 'audit', 'ai', 'done'])
  })

  it('reaches every stage from idle via only legal edges', () => {
    for (const target of STAGES) {
      const path = planStagePath('idle', target)
      expect(walk('idle', path)).toBe(target)
    }
  })

  it('reaches every target from every source via only legal edges', () => {
    for (const from of STAGES) {
      for (const to of STAGES) {
        const path = planStagePath(from, to)
        expect(walk(from, path)).toBe(to)
      }
    }
  })

  it('routes idle → error-load through load', () => {
    expect(planStagePath('idle', 'error-load')).toEqual(['load', 'error-load'])
  })

  it('restarts a terminal into a fresh run for a new stage', () => {
    // done → audit is not a direct edge; the only legal route restarts via load.
    expect(planStagePath('done', 'audit')).toEqual(['load', 'audit'])
  })

  it('resets a terminal directly to idle (a legal edge)', () => {
    expect(planStagePath('done', 'idle')).toEqual(['idle'])
    expect(planStagePath('error-load', 'idle')).toEqual(['idle'])
  })

  it('finds the shortest path (no redundant hops)', () => {
    // idle → ai is exactly three hops; never longer.
    expect(planStagePath('idle', 'ai')).toEqual(['load', 'audit', 'ai'])
  })
})
