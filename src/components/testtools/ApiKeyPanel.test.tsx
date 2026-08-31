// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ApiKeyPanel, {
  API_KEY_MODELS,
  API_KEY_PANEL_STRINGS,
  API_KEY_PRESETS,
} from './ApiKeyPanel'
import { API_KEY_STORAGE_KEYS } from './api-key-storage'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  window.localStorage.clear()
})

describe('ApiKeyPanel', () => {
  it('persists the seeded provider/model/key to the three keys on mount', () => {
    render(<ApiKeyPanel />)
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.provider)).toBe(
      'anthropic',
    )
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.model)).toBe(
      API_KEY_MODELS[0].id,
    )
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe('')
  })

  it('pre-fills each field from localStorage on mount', () => {
    window.localStorage.setItem(API_KEY_STORAGE_KEYS.model, 'claude-opus-5')
    window.localStorage.setItem(API_KEY_STORAGE_KEYS.apiKey, 'sk-restored')
    render(<ApiKeyPanel />)

    expect(
      (screen.getByLabelText(API_KEY_PANEL_STRINGS.modelLabel) as HTMLSelectElement)
        .value,
    ).toBe('claude-opus-5')
    // The masked key input still holds its (restored) value.
    const keyInput = screen.getByLabelText(
      API_KEY_PANEL_STRINGS.keyLabel,
    ) as HTMLInputElement
    expect(keyInput.value).toBe('sk-restored')
    expect(keyInput.type).toBe('password')
  })

  it('writes the model key immediately on change (no save button)', () => {
    render(<ApiKeyPanel />)
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.modelLabel), {
      target: { value: 'claude-opus-5' },
    })
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.model)).toBe(
      'claude-opus-5',
    )
  })

  it('writes the key immediately as the user types', () => {
    render(<ApiKeyPanel />)
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel), {
      target: { value: 'sk-typed-key' },
    })
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe(
      'sk-typed-key',
    )
  })

  it('applies the 키 없음 / 유효한 키 / 무효한 키 presets to the key + storage', () => {
    render(<ApiKeyPanel />)
    const keyInput = screen.getByLabelText(
      API_KEY_PANEL_STRINGS.keyLabel,
    ) as HTMLInputElement

    fireEvent.click(screen.getByRole('button', { name: API_KEY_PANEL_STRINGS.presetValid }))
    expect(keyInput.value).toBe(API_KEY_PRESETS.valid)
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe(
      API_KEY_PRESETS.valid,
    )

    fireEvent.click(screen.getByRole('button', { name: API_KEY_PANEL_STRINGS.presetInvalid }))
    expect(keyInput.value).toBe(API_KEY_PRESETS.invalid)

    fireEvent.click(screen.getByRole('button', { name: API_KEY_PANEL_STRINGS.presetNone }))
    expect(keyInput.value).toBe('')
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe('')
  })

  it('fires onChange with the whole form value on each change', () => {
    const seen: { provider: string; model: string; apiKey: string }[] = []
    render(<ApiKeyPanel onChange={(value) => seen.push(value)} />)
    fireEvent.click(screen.getByRole('button', { name: API_KEY_PANEL_STRINGS.presetValid }))
    expect(seen[seen.length - 1]).toEqual({
      provider: 'anthropic',
      model: API_KEY_MODELS[0].id,
      apiKey: API_KEY_PRESETS.valid,
    })
  })
})
