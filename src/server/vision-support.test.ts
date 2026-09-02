import { describe, expect, it } from 'vitest'
import { modelSupportsVision } from './vision-support'

/**
 * The shared vision-capability predicate defaults to "send the screenshots"
 * (vision-capable) and only returns false for known text-only model families,
 * so an unknown model still gets the images (the reactive `vision-unsupported`
 * classification is the fallback for a genuine provider rejection).
 */
describe('modelSupportsVision', () => {
  it('defaults to vision-capable for an absent / blank model', () => {
    expect(modelSupportsVision(undefined)).toBe(true)
    expect(modelSupportsVision('')).toBe(true)
    expect(modelSupportsVision('   ')).toBe(true)
  })

  it('treats the evaluators default models as vision-capable', () => {
    expect(modelSupportsVision('claude-sonnet-5')).toBe(true)
    expect(modelSupportsVision('claude-opus-5')).toBe(true)
    expect(modelSupportsVision('gpt-4o')).toBe(true)
    expect(modelSupportsVision('gpt-4o-mini')).toBe(true)
  })

  it('flags known text-only families as non-vision', () => {
    expect(modelSupportsVision('gpt-3.5-turbo')).toBe(false)
    expect(modelSupportsVision('o1-mini')).toBe(false)
    expect(modelSupportsVision('o3-mini')).toBe(false)
    expect(modelSupportsVision('text-davinci-003')).toBe(false)
    expect(modelSupportsVision('claude-2.1')).toBe(false)
    expect(modelSupportsVision('claude-instant-1.2')).toBe(false)
  })

  it('assumes an unknown model is vision-capable (defers to the provider)', () => {
    expect(modelSupportsVision('some-future-model-x')).toBe(true)
  })
})
