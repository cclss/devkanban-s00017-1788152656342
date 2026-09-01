// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ApiKeyPanel, {
  API_KEY_MODELS,
  API_KEY_PANEL_STRINGS,
  API_KEY_PROVIDERS,
  API_KEY_PRESETS,
  modelsForProvider,
  resolveModelForProvider,
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

  it('offers both Anthropic and OpenAI providers', () => {
    expect(API_KEY_PROVIDERS.map((p) => p.id)).toEqual(['anthropic', 'openai'])
    render(<ApiKeyPanel />)
    const providerSelect = screen.getByLabelText(
      API_KEY_PANEL_STRINGS.providerLabel,
    )
    const optionValues = Array.from(
      providerSelect.querySelectorAll('option'),
    ).map((o) => (o as HTMLOptionElement).value)
    expect(optionValues).toEqual(['anthropic', 'openai'])
  })

  it('shows only the selected provider’s models (GPT models for OpenAI)', () => {
    render(<ApiKeyPanel />)
    const modelSelect = () =>
      screen.getByLabelText(API_KEY_PANEL_STRINGS.modelLabel) as HTMLSelectElement
    const modelValues = () =>
      Array.from(modelSelect().querySelectorAll('option')).map(
        (o) => (o as HTMLOptionElement).value,
      )

    // Anthropic (default) → only Claude models.
    expect(modelValues()).toEqual(['claude-sonnet-5', 'claude-opus-5'])

    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.providerLabel), {
      target: { value: 'openai' },
    })
    // OpenAI → only GPT models.
    expect(modelValues()).toEqual(['gpt-4o', 'gpt-4o-mini'])
  })

  it('resets the model to the new provider’s default when switching provider', () => {
    render(<ApiKeyPanel />)
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.providerLabel), {
      target: { value: 'openai' },
    })
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.provider)).toBe('openai')
    // The stored Claude model is replaced by OpenAI's first model.
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.model)).toBe('gpt-4o')
    expect(
      (screen.getByLabelText(API_KEY_PANEL_STRINGS.modelLabel) as HTMLSelectElement)
        .value,
    ).toBe('gpt-4o')
  })

  it('reconciles a stale provider/model pair from storage on mount', () => {
    // Storage says OpenAI but carries a Claude model (e.g. left over from a
    // prior version): the panel must not show the mismatched model.
    window.localStorage.setItem(API_KEY_STORAGE_KEYS.provider, 'openai')
    window.localStorage.setItem(API_KEY_STORAGE_KEYS.model, 'claude-opus-5')
    render(<ApiKeyPanel />)
    expect(
      (screen.getByLabelText(API_KEY_PANEL_STRINGS.modelLabel) as HTMLSelectElement)
        .value,
    ).toBe('gpt-4o')
  })

  it('keeps a GPT key typed under the OpenAI provider in storage', () => {
    render(<ApiKeyPanel />)
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.providerLabel), {
      target: { value: 'openai' },
    })
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel), {
      target: { value: 'sk-my-gpt-key' },
    })
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.provider)).toBe('openai')
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe(
      'sk-my-gpt-key',
    )
  })
})

describe('modelsForProvider / resolveModelForProvider', () => {
  it('filters models by provider', () => {
    expect(modelsForProvider('anthropic').map((m) => m.id)).toEqual([
      'claude-sonnet-5',
      'claude-opus-5',
    ])
    expect(modelsForProvider('openai').map((m) => m.id)).toEqual([
      'gpt-4o',
      'gpt-4o-mini',
    ])
    expect(modelsForProvider('unknown')).toEqual([])
  })

  it('keeps a valid model and falls back to the provider default otherwise', () => {
    expect(resolveModelForProvider('openai', 'gpt-4o-mini')).toBe('gpt-4o-mini')
    expect(resolveModelForProvider('openai', 'claude-opus-5')).toBe('gpt-4o')
    expect(resolveModelForProvider('anthropic', 'gpt-4o')).toBe('claude-sonnet-5')
  })
})
