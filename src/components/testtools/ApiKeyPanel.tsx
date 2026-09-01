/**
 * Test-tool: API key + provider/model entry (Design §테스트 도구 패널).
 *
 * This is mockup scaffolding, not a real product surface: the real user's key
 * entry is stubbed here so the wiring can be exercised by hand. The panel lets a
 * tester pick a provider/model, type a masked key, and jump the key to one of the
 * three "permission" presets — 키 없음 / 유효한 키 / 무효한 키. Every change is
 * mirrored to the three owned localStorage keys on the spot (no save button), and
 * the three keys are read back on mount so a revisit is pre-filled.
 *
 * The key affects nothing in the flow yet (there is no real `/api/analyze`); AI
 * failure is simulated separately by the stage simulator. So this panel is
 * self-contained: it owns its own form state + persistence and needs no props.
 *
 * Boundary: presentational + local persistence via the storage adapter. It holds
 * only its own form state; all copy is co-located Korean domain content.
 */
import { useEffect, useId, useState } from 'react'
import {
  API_KEY_STORAGE_KEYS,
  readStored,
  writeStored,
} from './api-key-storage'
import InfoTooltip from '../InfoTooltip'
import { CONTROL_HELP } from '../control-help'

/** Provider options. Anthropic (Claude) and OpenAI (GPT) are both supported. */
export const API_KEY_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
] as const

/**
 * Model options, each tagged with the provider it belongs to (Design/§가정: no
 * date-suffixed ids). The model `<select>` shows only the models of the currently
 * selected provider, so a Claude model is never offered while OpenAI is picked and
 * vice versa.
 */
export const API_KEY_MODELS = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', provider: 'anthropic' },
  { id: 'claude-opus-5', label: 'Claude Opus 5', provider: 'anthropic' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
] as const

/** The models offered for a given provider id (empty if the id is unknown). */
export function modelsForProvider(
  provider: string,
): ReadonlyArray<(typeof API_KEY_MODELS)[number]> {
  return API_KEY_MODELS.filter((option) => option.provider === provider)
}

/**
 * Resolves a stored/selected model to one valid for `provider`: keeps it if it
 * belongs to the provider, otherwise falls back to that provider's first model.
 * Guards against a stale localStorage pair (e.g. provider=openai, model=claude-*).
 */
export function resolveModelForProvider(
  provider: string,
  model: string,
): string {
  const options = modelsForProvider(provider)
  if (options.some((option) => option.id === model)) return model
  return options[0]?.id ?? API_KEY_MODELS[0].id
}

/**
 * The three "permission" presets the key buttons apply. `none` clears the key
 * (missing-key case), `valid` / `invalid` set demo strings of the right shape so
 * the tester can drive the valid vs. invalid-key branches by eye.
 */
export const API_KEY_PRESETS = {
  none: '',
  valid: 'sk-valid-demo-0000000000',
  invalid: 'invalid-demo-key',
} as const

/** Korean, user-facing copy for the panel. Exported so tests assert one source. */
export const API_KEY_PANEL_STRINGS = {
  heading: 'API 키 설정',
  providerLabel: '공급자',
  modelLabel: '모델',
  keyLabel: 'API 키',
  keyPlaceholder: 'sk-...',
  presetGroupLabel: '키 프리셋',
  presetNone: '키 없음',
  presetValid: '유효한 키',
  presetInvalid: '무효한 키',
  /** Button that reveals the masked key so a saved value can be confirmed. */
  revealShow: '키 표시',
  /** Button that re-masks a revealed key. */
  revealHide: '키 숨김',
  /**
   * Reassures the user the key is persisted locally, so a masked (dotted) field
   * is not mistaken for a lost value after a failed run or a page reload.
   */
  keyHint: '입력한 키는 이 브라우저에 자동 저장되어 다음에 다시 입력할 필요가 없습니다.',
} as const

const DEFAULT_PROVIDER = API_KEY_PROVIDERS[0].id
const DEFAULT_MODEL = API_KEY_MODELS[0].id

/**
 * @param props Optional `onChange` fired after each field change with the whole
 *   current form value, purely so a host/test can observe changes. The panel is
 *   otherwise self-contained (state + localStorage).
 */
export interface ApiKeyPanelProps {
  onChange?: (value: {
    provider: string
    model: string
    apiKey: string
  }) => void
}

export default function ApiKeyPanel({ onChange }: ApiKeyPanelProps) {
  // Seed from localStorage on first render so a revisit is pre-filled; fall back
  // to the first provider/model and an empty key.
  const [provider, setProvider] = useState(
    () => readStored(API_KEY_STORAGE_KEYS.provider) ?? DEFAULT_PROVIDER,
  )
  // Seed the model from storage but reconcile it against the seeded provider, so
  // a stale/mismatched pair never leaves the select showing a model that belongs
  // to the other provider.
  const [model, setModel] = useState(() =>
    resolveModelForProvider(
      readStored(API_KEY_STORAGE_KEYS.provider) ?? DEFAULT_PROVIDER,
      readStored(API_KEY_STORAGE_KEYS.model) ?? DEFAULT_MODEL,
    ),
  )
  const [apiKey, setApiKey] = useState(
    () => readStored(API_KEY_STORAGE_KEYS.apiKey) ?? '',
  )
  // Reveal the masked key on demand so a persisted value can be confirmed by
  // eye. Purely presentational — it never touches storage. Defaults to masked.
  const [revealed, setRevealed] = useState(false)

  const providerId = useId()
  const modelId = useId()
  const keyId = useId()
  const hintId = useId()

  // Persist whatever was seeded (including the defaults) once on mount, so the
  // three keys always exist after the panel has been shown.
  useEffect(() => {
    writeStored(API_KEY_STORAGE_KEYS.provider, provider)
    writeStored(API_KEY_STORAGE_KEYS.model, model)
    writeStored(API_KEY_STORAGE_KEYS.apiKey, apiKey)
    // Mount-only sync: subsequent writes happen in the change handlers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emitChange = (next: { provider: string; model: string; apiKey: string }) => {
    onChange?.(next)
  }

  const handleProvider = (value: string) => {
    setProvider(value)
    writeStored(API_KEY_STORAGE_KEYS.provider, value)
    // Switching provider may orphan the current model (it belongs to the other
    // vendor); reconcile to the new provider's default and persist both.
    const nextModel = resolveModelForProvider(value, model)
    if (nextModel !== model) {
      setModel(nextModel)
      writeStored(API_KEY_STORAGE_KEYS.model, nextModel)
    }
    emitChange({ provider: value, model: nextModel, apiKey })
  }

  const handleModel = (value: string) => {
    setModel(value)
    writeStored(API_KEY_STORAGE_KEYS.model, value)
    emitChange({ provider, model: value, apiKey })
  }

  const handleKey = (value: string) => {
    setApiKey(value)
    writeStored(API_KEY_STORAGE_KEYS.apiKey, value)
    emitChange({ provider, model, apiKey: value })
  }

  return (
    <section className="testtools__group" aria-label={API_KEY_PANEL_STRINGS.heading}>
      <h3 className="testtools__group-title">{API_KEY_PANEL_STRINGS.heading}</h3>

      <div className="testtools__field">
        <div className="control-help">
          <label className="testtools__label" htmlFor={providerId}>
            {API_KEY_PANEL_STRINGS.providerLabel}
          </label>
          <InfoTooltip entry={CONTROL_HELP.provider} />
        </div>
        <select
          id={providerId}
          className="field-input testtools__select"
          value={provider}
          onChange={(event) => handleProvider(event.target.value)}
        >
          {API_KEY_PROVIDERS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="testtools__field">
        <div className="control-help">
          <label className="testtools__label" htmlFor={modelId}>
            {API_KEY_PANEL_STRINGS.modelLabel}
          </label>
          <InfoTooltip entry={CONTROL_HELP.model} />
        </div>
        <select
          id={modelId}
          className="field-input testtools__select"
          value={model}
          onChange={(event) => handleModel(event.target.value)}
        >
          {modelsForProvider(provider).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="testtools__field">
        <div className="control-help">
          <label className="testtools__label" htmlFor={keyId}>
            {API_KEY_PANEL_STRINGS.keyLabel}
          </label>
          <InfoTooltip entry={CONTROL_HELP.apiKey} />
        </div>
        <div className="testtools__key-row">
          {/* Masked by default so the key is not shown in plain text; the reveal
              toggle flips it to text so a saved key can be confirmed. */}
          <input
            id={keyId}
            type={revealed ? 'text' : 'password'}
            className="field-input testtools__input"
            value={apiKey}
            placeholder={API_KEY_PANEL_STRINGS.keyPlaceholder}
            autoComplete="off"
            aria-describedby={hintId}
            onChange={(event) => handleKey(event.target.value)}
          />
          <button
            type="button"
            className="btn testtools__btn"
            aria-pressed={revealed}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed
              ? API_KEY_PANEL_STRINGS.revealHide
              : API_KEY_PANEL_STRINGS.revealShow}
          </button>
          <InfoTooltip entry={CONTROL_HELP.revealKey} />
        </div>
        {/* Tells the user the key persists locally, so a dotted field after a
            failed run or reload is not mistaken for a lost value. */}
        <p id={hintId} className="testtools__hint">
          {API_KEY_PANEL_STRINGS.keyHint}
        </p>
      </div>

      <div className="testtools__buttons" role="group" aria-label={API_KEY_PANEL_STRINGS.presetGroupLabel}>
        <span className="control-help">
          <button
            type="button"
            className="btn testtools__btn"
            onClick={() => handleKey(API_KEY_PRESETS.none)}
          >
            {API_KEY_PANEL_STRINGS.presetNone}
          </button>
          <InfoTooltip entry={CONTROL_HELP.presetNone} />
        </span>
        <span className="control-help">
          <button
            type="button"
            className="btn testtools__btn"
            onClick={() => handleKey(API_KEY_PRESETS.valid)}
          >
            {API_KEY_PANEL_STRINGS.presetValid}
          </button>
          <InfoTooltip entry={CONTROL_HELP.presetValid} />
        </span>
        <span className="control-help">
          <button
            type="button"
            className="btn testtools__btn"
            onClick={() => handleKey(API_KEY_PRESETS.invalid)}
          >
            {API_KEY_PANEL_STRINGS.presetInvalid}
          </button>
          <InfoTooltip entry={CONTROL_HELP.presetInvalid} />
        </span>
      </div>
    </section>
  )
}
