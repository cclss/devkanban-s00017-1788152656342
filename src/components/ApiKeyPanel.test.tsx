// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ApiKeyPanel, {
  API_KEY_MODELS,
  API_KEY_PANEL_STRINGS,
  API_KEY_PROVIDERS,
  modelsForProvider,
  resolveModelForProvider,
} from './ApiKeyPanel'
import { API_KEY_STORAGE_KEYS } from './api-key-storage'
import { CONTROL_HELP } from './control-help'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  window.localStorage.clear()
})

/** Presses the panel's Save button. */
function clickSave() {
  fireEvent.click(screen.getByRole('button', { name: API_KEY_PANEL_STRINGS.save }))
}

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

  it('does not persist a typed key until Save is pressed', () => {
    render(<ApiKeyPanel />)
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel), {
      target: { value: 'sk-typed-key' },
    })
    // No autosave: storage still holds the empty mount seed.
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe('')

    clickSave()
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe(
      'sk-typed-key',
    )
  })

  it('persists the provider and model together on Save', () => {
    render(<ApiKeyPanel />)
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.modelLabel), {
      target: { value: 'claude-opus-5' },
    })
    // Not written yet.
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.model)).toBe(
      API_KEY_MODELS[0].id,
    )
    clickSave()
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.model)).toBe(
      'claude-opus-5',
    )
  })

  it('shows a "Saved" confirmation after Save and clears it on the next edit', () => {
    render(<ApiKeyPanel />)
    expect(screen.queryByText(API_KEY_PANEL_STRINGS.saveConfirm)).toBeNull()
    clickSave()
    expect(screen.getByText(API_KEY_PANEL_STRINGS.saveConfirm)).toBeDefined()
    // Editing a field marks the state unsaved again.
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel), {
      target: { value: 'sk-new' },
    })
    expect(screen.queryByText(API_KEY_PANEL_STRINGS.saveConfirm)).toBeNull()
  })

  it('keeps a typed key in the input across a page re-render without Save', () => {
    // The panel stays mounted while the rest of the app re-renders (e.g. the user
    // clicks a saved-URL chip). Its local state must hold the typed key so the
    // field is never wiped mid-entry, even before Save.
    const { rerender } = render(<ApiKeyPanel />)
    const keyInput = screen.getByLabelText(
      API_KEY_PANEL_STRINGS.keyLabel,
    ) as HTMLInputElement
    fireEvent.change(keyInput, { target: { value: 'sk-still-here' } })
    rerender(<ApiKeyPanel />)
    expect(
      (screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel) as HTMLInputElement)
        .value,
    ).toBe('sk-still-here')
  })

  it('keeps a saved key across an unmount+remount (survives a page reload)', () => {
    const { unmount } = render(<ApiKeyPanel />)
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel), {
      target: { value: 'sk-persist-me' },
    })
    clickSave()
    unmount()
    // A brand-new mount reads the same localStorage — the saved key must reappear.
    render(<ApiKeyPanel />)
    expect(
      (screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel) as HTMLInputElement)
        .value,
    ).toBe('sk-persist-me')
  })

  it('masks the key by default and reveals/re-masks it via the toggle', () => {
    render(<ApiKeyPanel />)
    const keyInput = screen.getByLabelText(
      API_KEY_PANEL_STRINGS.keyLabel,
    ) as HTMLInputElement
    fireEvent.change(keyInput, { target: { value: 'sk-secret' } })
    // Masked by default.
    expect(keyInput.type).toBe('password')

    const toggle = screen.getByRole('button', {
      name: API_KEY_PANEL_STRINGS.revealShow,
    })
    fireEvent.click(toggle)
    // Revealed: type flips and the same value stays put (nothing is cleared).
    expect(keyInput.type).toBe('text')
    expect(keyInput.value).toBe('sk-secret')

    fireEvent.click(
      screen.getByRole('button', { name: API_KEY_PANEL_STRINGS.revealHide }),
    )
    expect(keyInput.type).toBe('password')
    expect(keyInput.value).toBe('sk-secret')
  })

  it('shows the persistence hint describing the Save behavior', () => {
    render(<ApiKeyPanel />)
    expect(screen.getByText(API_KEY_PANEL_STRINGS.keyHint)).toBeDefined()
  })

  it('fires onSave with the whole form value only when Save is pressed', () => {
    const seen: { provider: string; model: string; apiKey: string }[] = []
    render(<ApiKeyPanel onSave={(value) => seen.push(value)} />)
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel), {
      target: { value: 'sk-my-key' },
    })
    // Editing alone does not fire onSave.
    expect(seen).toHaveLength(0)
    clickSave()
    expect(seen[seen.length - 1]).toEqual({
      provider: 'anthropic',
      model: API_KEY_MODELS[0].id,
      apiKey: 'sk-my-key',
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
    // The shown model flips to OpenAI's first model in local state...
    expect(
      (screen.getByLabelText(API_KEY_PANEL_STRINGS.modelLabel) as HTMLSelectElement)
        .value,
    ).toBe('gpt-4o')
    // ...and Save persists the reconciled pair.
    clickSave()
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.provider)).toBe('openai')
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.model)).toBe('gpt-4o')
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

  it('persists a GPT key typed under the OpenAI provider on Save', () => {
    render(<ApiKeyPanel />)
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.providerLabel), {
      target: { value: 'openai' },
    })
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel), {
      target: { value: 'sk-my-gpt-key' },
    })
    clickSave()
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.provider)).toBe('openai')
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe(
      'sk-my-gpt-key',
    )
  })
})

describe('ApiKeyPanel — per-control ⓘ help', () => {
  function helpTrigger(entry: { title: string }) {
    return screen.getByRole('button', { name: `Help: ${entry.title}` })
  }

  it('renders a ⓘ trigger next to provider, model, key, reveal, and Save', () => {
    render(<ApiKeyPanel />)
    for (const entry of [
      CONTROL_HELP.provider,
      CONTROL_HELP.model,
      CONTROL_HELP.apiKey,
      CONTROL_HELP.revealKey,
      CONTROL_HELP.saveKey,
    ]) {
      expect(helpTrigger(entry).getAttribute('aria-expanded')).toBe('false')
    }
  })

  it('reveals the matching help body on activation without altering the control', () => {
    render(<ApiKeyPanel />)

    fireEvent.click(helpTrigger(CONTROL_HELP.apiKey))
    expect(screen.getByText(CONTROL_HELP.apiKey.body)).toBeDefined()

    // The Save control still persists the current value with the help icon in place.
    fireEvent.change(screen.getByLabelText(API_KEY_PANEL_STRINGS.keyLabel), {
      target: { value: 'sk-help-check' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: API_KEY_PANEL_STRINGS.save }),
    )
    expect(window.localStorage.getItem(API_KEY_STORAGE_KEYS.apiKey)).toBe(
      'sk-help-check',
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
