import { describe, expect, it } from 'vitest'
import {
  IN_PROGRESS_STAGES,
  STAGES,
  TERMINAL_STAGES,
  canTransition,
  isInProgress,
  isTerminal,
  reset,
  start,
  transition,
  type Stage,
} from './stage'

/**
 * The grader flow is a finite state machine driven by one `Stage` value. These
 * tests pin every transition rule the Design document specifies — legal vs
 * illegal edges, the start-only-from-idle + conflict-block rules, the
 * `ai → done-partial` direct edge, `error-load` as a load terminal, and the
 * terminal → idle reset — against the pure module, no React or DOM needed.
 */

describe('stage classification', () => {
  it('marks load / audit / ai as in progress', () => {
    expect(IN_PROGRESS_STAGES).toEqual(['load', 'audit', 'ai'])
    for (const s of IN_PROGRESS_STAGES) expect(isInProgress(s)).toBe(true)
  })

  it('marks done / done-partial / error-load as terminal', () => {
    expect(TERMINAL_STAGES).toEqual(['done', 'done-partial', 'error-load'])
    for (const s of TERMINAL_STAGES) expect(isTerminal(s)).toBe(true)
  })

  it('idle is neither in progress nor terminal', () => {
    expect(isInProgress('idle')).toBe(false)
    expect(isTerminal('idle')).toBe(false)
  })

  it('in-progress and terminal sets are disjoint', () => {
    for (const s of IN_PROGRESS_STAGES) expect(isTerminal(s)).toBe(false)
    for (const s of TERMINAL_STAGES) expect(isInProgress(s)).toBe(false)
  })
})

describe('canTransition — legal edges', () => {
  const legal: ReadonlyArray<[Stage, Stage]> = [
    ['idle', 'load'],
    ['load', 'audit'],
    ['load', 'error-load'],
    ['audit', 'ai'],
    ['ai', 'done'],
    ['ai', 'done-partial'],
    ['done', 'idle'],
    ['done-partial', 'idle'],
    ['error-load', 'idle'],
    ['done', 'load'],
    ['done-partial', 'load'],
    ['error-load', 'load'],
  ]

  it.each(legal)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true)
  })
})

describe('canTransition — illegal edges', () => {
  const illegal: ReadonlyArray<[Stage, Stage]> = [
    ['idle', 'audit'], // cannot skip load
    ['idle', 'ai'],
    ['idle', 'done'],
    ['load', 'ai'], // cannot skip audit
    ['load', 'done'],
    ['audit', 'done'], // cannot skip ai
    ['audit', 'error-load'], // error-load is a load-only terminal
    ['ai', 'audit'], // no backward step
    ['audit', 'load'], // no backward step
    ['done', 'done-partial'], // terminals only reset / restart
    ['error-load', 'audit'],
    ['idle', 'idle'], // no self-loop
  ]

  it.each(illegal)('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false)
  })
})

describe('transition', () => {
  it('applies a legal transition', () => {
    expect(transition('load', 'audit')).toBe('audit')
  })

  it('takes the ai → done-partial direct edge', () => {
    expect(transition('ai', 'done-partial')).toBe('done-partial')
  })

  it('is a no-op for an illegal transition, keeping the source stage', () => {
    expect(transition('idle', 'ai')).toBe('idle')
    expect(transition('audit', 'done')).toBe('audit')
  })
})

describe('start — start-only-from-idle + conflict block', () => {
  it('starts from idle into load', () => {
    expect(start('idle')).toEqual({
      stage: 'load',
      started: true,
      conflict: false,
    })
  })

  it.each(IN_PROGRESS_STAGES)(
    'blocks a start while %s is in progress (conflict, no transition)',
    (current) => {
      expect(start(current)).toEqual({
        stage: current,
        started: false,
        conflict: true,
      })
    },
  )

  it.each(TERMINAL_STAGES)(
    'restarts a fresh run from terminal %s into load',
    (current) => {
      expect(start(current)).toEqual({
        stage: 'load',
        started: true,
        conflict: false,
      })
    },
  )
})

describe('reset — terminal → idle', () => {
  it.each(TERMINAL_STAGES)('resets terminal %s to idle', (current) => {
    expect(reset(current)).toBe('idle')
  })

  it('is a no-op from idle', () => {
    expect(reset('idle')).toBe('idle')
  })

  it.each(IN_PROGRESS_STAGES)(
    'refuses to reset while %s is in progress',
    (current) => {
      expect(reset(current)).toBe(current)
    },
  )
})

describe('full happy-path and partial-path walks', () => {
  it('walks idle → load → audit → ai → done and resets', () => {
    let s: Stage = 'idle'
    s = start(s).stage
    expect(s).toBe('load')
    s = transition(s, 'audit')
    s = transition(s, 'ai')
    s = transition(s, 'done')
    expect(s).toBe('done')
    expect(reset(s)).toBe('idle')
  })

  it('walks the partial path idle → load → audit → ai → done-partial', () => {
    let s: Stage = 'idle'
    s = start(s).stage
    s = transition(s, 'audit')
    s = transition(s, 'ai')
    s = transition(s, 'done-partial')
    expect(s).toBe('done-partial')
  })

  it('walks the load-failure path idle → load → error-load', () => {
    let s: Stage = 'idle'
    s = start(s).stage
    s = transition(s, 'error-load')
    expect(s).toBe('error-load')
    expect(reset(s)).toBe('idle')
  })
})

describe('STAGES catalogue', () => {
  it('lists exactly the seven stages, idle first', () => {
    expect(STAGES).toEqual([
      'idle',
      'load',
      'audit',
      'ai',
      'done',
      'done-partial',
      'error-load',
    ])
  })
})
