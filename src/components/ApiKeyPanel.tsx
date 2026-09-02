/**
 * API key + provider/model entry — a real product block of the grader screen.
 *
 * This is the surface where the user enters the credentials the AI rubric
 * evaluation uses. The panel lets the user pick a provider/model and type a
 * masked key, then persist all four to browser-local storage with an explicit
 * "Save" button (Design §Local storage key management). Nothing is written on
 * every keystroke: the field holds the typed value in component state, and only
 * a Save press mirrors it to the four owned localStorage keys — so switching the
 * URL below (which re-renders the app but keeps this panel mounted) never wipes a
 * key the user is still typing.
 *
 * The optional workspace-id field carries the `anthropic-workspace-id` an
 * identity-linked key needs; it is stored and revealed exactly like the other
 * fields and an empty value is valid (the request then omits the header).
 *
 * The four keys are read back on mount so a revisit / reload is pre-filled, and a
 * reveal toggle flips the masked field to plain text so a saved value can be
 * confirmed by eye. Entering no key is a valid state: the app simply runs without
 * AI evaluation (partial result), so this panel imposes no "key required" gate.
 *
 * Boundary: presentational + local persistence via the storage adapter. It holds
 * only its own form state; all copy is co-located English domain content.
 */
import { useEffect, useId, useState } from 'react'
import {
  API_KEY_STORAGE_KEYS,
  readStored,
  writeStored,
} from './api-key-storage'
import InfoTooltip from './InfoTooltip'
import { CONTROL_HELP } from './control-help'
import {
  CLAUDE_CODE_TOKEN_GUIDANCE,
  isClaudeCodeToken,
} from '../core/claude-code-token'

/** Provider options. Anthropic (Claude) and OpenAI (GPT) are both supported. */
export const API_KEY_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
] as const

/**
 * Model options, each tagged with the provider it belongs to (Design/§Assumptions: no
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

/** User-facing copy for the panel. Exported so tests assert one source. */
export const API_KEY_PANEL_STRINGS = {
  heading: 'API key settings',
  providerLabel: 'Provider',
  modelLabel: 'Model',
  keyLabel: 'API key',
  keyPlaceholder: 'sk-...',
  /** Label for the optional identity-linked workspace id field. */
  workspaceLabel: 'Workspace ID (optional)',
  /** Placeholder hinting the field may stay empty. */
  workspacePlaceholder: 'wrkspc_… (optional)',
  /**
   * Hint under the workspace field: names the lookup path and states that leaving
   * it blank keeps the existing behavior (no workspace header sent).
   */
  workspaceHint:
    'Only needed for a workspace-linked API key. Find the ID at Console → Settings → Workspaces. Leave it blank to keep the existing behavior.',
  /** Button that persists the current provider/model/key to this browser. */
  save: 'Save',
  /** Confirmation shown after a save; cleared as soon as a field changes. */
  saveConfirm: 'Saved',
  /** Button that reveals the masked key so a saved value can be confirmed. */
  revealShow: 'Show key',
  /** Button that re-masks a revealed key. */
  revealHide: 'Hide key',
  /**
   * Tells the user the key is only kept once Save is pressed, so a masked
   * (dotted) field is not mistaken for a lost value and so they know to save.
   */
  keyHint:
    'Press Save to keep the key in this browser, so you will not need to enter it again. Leave it empty to run without AI evaluation.',
} as const

const DEFAULT_PROVIDER = API_KEY_PROVIDERS[0].id
const DEFAULT_MODEL = API_KEY_MODELS[0].id

/**
 * @param props Optional `onSave` fired after a successful Save with the persisted
 *   form value, purely so a host/test can observe the save. The panel is
 *   otherwise self-contained (state + localStorage).
 */
export interface ApiKeyPanelProps {
  onSave?: (value: {
    provider: string
    model: string
    apiKey: string
    workspaceId: string
  }) => void
}

export default function ApiKeyPanel({ onSave }: ApiKeyPanelProps) {
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
  // Optional workspace id for an identity-linked key. Empty is a valid state.
  const [workspaceId, setWorkspaceId] = useState(
    () => readStored(API_KEY_STORAGE_KEYS.workspaceId) ?? '',
  )
  // Reveal the masked key on demand so a persisted value can be confirmed by
  // eye. Purely presentational — it never touches storage. Defaults to masked.
  const [revealed, setRevealed] = useState(false)
  // Shows the "Saved" confirmation after a Save; cleared on the next edit so it
  // never lingers over unsaved changes.
  const [saved, setSaved] = useState(false)

  const providerId = useId()
  const modelId = useId()
  const keyId = useId()
  const workspaceFieldId = useId()
  const workspaceHintId = useId()
  const hintId = useId()
  const guidanceId = useId()
  const statusId = useId()

  // A Claude Code CLI token (`sk-ant-oat…`) is not a Messages API key; flag it
  // the moment it is typed so the user is redirected before ever pressing Start.
  const isCodeToken = isClaudeCodeToken(apiKey)

  // Persist whatever was seeded (including the defaults) once on mount, so the
  // three keys always exist after the panel has been shown. This is the only
  // implicit write; every later write goes through the explicit Save button.
  useEffect(() => {
    writeStored(API_KEY_STORAGE_KEYS.provider, provider)
    writeStored(API_KEY_STORAGE_KEYS.model, model)
    writeStored(API_KEY_STORAGE_KEYS.apiKey, apiKey)
    writeStored(API_KEY_STORAGE_KEYS.workspaceId, workspaceId)
    // Mount-only seed: subsequent writes happen only on Save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Any field edit invalidates a shown "Saved" note (the change is now unsaved).
  const handleProvider = (value: string) => {
    setProvider(value)
    setSaved(false)
    // Switching provider may orphan the current model (it belongs to the other
    // vendor); reconcile to the new provider's default in local state only.
    const nextModel = resolveModelForProvider(value, model)
    if (nextModel !== model) setModel(nextModel)
  }

  const handleModel = (value: string) => {
    setModel(value)
    setSaved(false)
  }

  const handleKey = (value: string) => {
    setApiKey(value)
    setSaved(false)
  }

  const handleWorkspace = (value: string) => {
    setWorkspaceId(value)
    setSaved(false)
  }

  // Explicit persistence: mirror the current form to the three owned keys. This
  // is the only path (besides the mount seed) that writes storage.
  const handleSave = () => {
    writeStored(API_KEY_STORAGE_KEYS.provider, provider)
    writeStored(API_KEY_STORAGE_KEYS.model, model)
    writeStored(API_KEY_STORAGE_KEYS.apiKey, apiKey)
    writeStored(API_KEY_STORAGE_KEYS.workspaceId, workspaceId)
    setSaved(true)
    onSave?.({ provider, model, apiKey, workspaceId })
  }

  return (
    <section className="api-key grader-card" aria-label={API_KEY_PANEL_STRINGS.heading}>
      <h3 className="api-key__title">{API_KEY_PANEL_STRINGS.heading}</h3>

      <div className="api-key__field">
        <div className="control-help">
          <label className="api-key__label" htmlFor={providerId}>
            {API_KEY_PANEL_STRINGS.providerLabel}
          </label>
          <InfoTooltip entry={CONTROL_HELP.provider} />
        </div>
        <select
          id={providerId}
          className="field-input api-key__select"
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

      <div className="api-key__field">
        <div className="control-help">
          <label className="api-key__label" htmlFor={modelId}>
            {API_KEY_PANEL_STRINGS.modelLabel}
          </label>
          <InfoTooltip entry={CONTROL_HELP.model} />
        </div>
        <select
          id={modelId}
          className="field-input api-key__select"
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

      <div className="api-key__field">
        <div className="control-help">
          <label className="api-key__label" htmlFor={keyId}>
            {API_KEY_PANEL_STRINGS.keyLabel}
          </label>
          <InfoTooltip entry={CONTROL_HELP.apiKey} />
        </div>
        <div className="api-key__key-row">
          {/* Masked by default so the key is not shown in plain text; the reveal
              toggle flips it to text so a saved key can be confirmed. */}
          <input
            id={keyId}
            type={revealed ? 'text' : 'password'}
            className="field-input api-key__input"
            value={apiKey}
            placeholder={API_KEY_PANEL_STRINGS.keyPlaceholder}
            autoComplete="off"
            aria-describedby={isCodeToken ? `${hintId} ${guidanceId}` : hintId}
            aria-invalid={isCodeToken ? true : undefined}
            onChange={(event) => handleKey(event.target.value)}
          />
          <button
            type="button"
            className="btn api-key__btn"
            aria-pressed={revealed}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed
              ? API_KEY_PANEL_STRINGS.revealHide
              : API_KEY_PANEL_STRINGS.revealShow}
          </button>
          <InfoTooltip entry={CONTROL_HELP.revealKey} />
        </div>
        {/* Tells the user the key persists locally only after Save, so a dotted
            field after a failed run or reload is not mistaken for a lost value. */}
        <p id={hintId} className="api-key__hint">
          {API_KEY_PANEL_STRINGS.keyHint}
        </p>
        {/* Claude Code CLI token caught inline: redirect the user to a real
            Messages API key before they attempt a run that would 401. */}
        {isCodeToken ? (
          <p id={guidanceId} className="field-guidance" role="alert">
            {CLAUDE_CODE_TOKEN_GUIDANCE}
          </p>
        ) : null}
      </div>

      <div className="api-key__field">
        <div className="control-help">
          <label className="api-key__label" htmlFor={workspaceFieldId}>
            {API_KEY_PANEL_STRINGS.workspaceLabel}
          </label>
          <InfoTooltip entry={CONTROL_HELP.workspaceId} />
        </div>
        {/* Optional: only a workspace-linked (identity-linked) key needs this;
            empty is valid and the request then sends no workspace header. */}
        <input
          id={workspaceFieldId}
          type="text"
          className="field-input"
          value={workspaceId}
          placeholder={API_KEY_PANEL_STRINGS.workspacePlaceholder}
          autoComplete="off"
          aria-describedby={workspaceHintId}
          onChange={(event) => handleWorkspace(event.target.value)}
        />
        <p id={workspaceHintId} className="api-key__hint">
          {API_KEY_PANEL_STRINGS.workspaceHint}
        </p>
      </div>

      <div className="api-key__actions">
        <span className="control-help">
          <button
            type="button"
            className="btn btn--primary api-key__save"
            onClick={handleSave}
          >
            {API_KEY_PANEL_STRINGS.save}
          </button>
          <InfoTooltip entry={CONTROL_HELP.saveKey} />
        </span>
        {/* Announce the save so a masked field is not mistaken for "nothing
            happened"; cleared on the next edit. */}
        <span id={statusId} className="api-key__saved" role="status" aria-live="polite">
          {saved ? API_KEY_PANEL_STRINGS.saveConfirm : ''}
        </span>
      </div>
    </section>
  )
}
