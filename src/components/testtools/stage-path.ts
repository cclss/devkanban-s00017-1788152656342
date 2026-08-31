/**
 * Legal-path planner for the test-tools stage simulator.
 *
 * The simulator lets a tester jump the flow to any {@link Stage} to eyeball how
 * the three blocks react. The single {@link module:state/stage} SSoT only ever
 * accepts *legal* edges, so a jump like `idle → done` is not one transition but a
 * walk of the machine (`idle → load → audit → ai → done`). This module computes
 * that walk as the shortest sequence of legal edges from `from` to `to`, using a
 * breadth-first search over the exported {@link canTransition} adjacency — so the
 * simulator never forces the SSoT into an unreachable state; it drives it there
 * one legal step at a time.
 *
 * Boundary: pure helper. It imports only the stage type + predicates from the
 * state layer, holds no state, and touches no DOM, so it unit-tests without React.
 */
import { STAGES, canTransition, type Stage } from '../../state/stage'

/**
 * The shortest sequence of legal transitions that moves the machine from `from`
 * to `to`, as the list of intermediate-and-final stages to apply in order
 * (excluding `from`, including `to`). Returns `[]` when `from === to`.
 *
 * The grader graph is connected (every terminal restarts into `load`), so a path
 * always exists; the function still returns `[]` for the impossible case rather
 * than throwing, keeping the caller a plain loop.
 */
export function planStagePath(from: Stage, to: Stage): Stage[] {
  if (from === to) return []

  // BFS over the legal-edge graph. `prev` records how each stage was first
  // reached so the path can be reconstructed once `to` is found.
  const prev = new Map<Stage, Stage>()
  const visited = new Set<Stage>([from])
  const queue: Stage[] = [from]

  while (queue.length > 0) {
    const current = queue.shift() as Stage
    for (const next of STAGES) {
      if (visited.has(next)) continue
      if (!canTransition(current, next)) continue
      visited.add(next)
      prev.set(next, current)
      if (next === to) {
        return reconstruct(prev, from, to)
      }
      queue.push(next)
    }
  }

  return []
}

/** Walks the `prev` chain back from `to` to `from`, returning the forward path. */
function reconstruct(prev: Map<Stage, Stage>, from: Stage, to: Stage): Stage[] {
  const path: Stage[] = []
  let step: Stage | undefined = to
  while (step !== undefined && step !== from) {
    path.unshift(step)
    step = prev.get(step)
  }
  return path
}
