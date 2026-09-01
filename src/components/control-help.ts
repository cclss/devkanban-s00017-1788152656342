/**
 * Co-located help copy for the landing-grader's controls (English).
 *
 * Each control on the grader screen — the URL input, the start/reset diagnosis
 * button, the saved-address chips, the provider/model selects, the API-key input,
 * the reveal toggle, the Save-key button, the stage-force buttons, the conflict
 * simulator, the markdown download, and the screenshot tabs — gets one short
 * `HelpEntry{title, body}` describing what it does. These render inside the
 * accessible ⓘ popover ({@link module:components/InfoTooltip}) so a user can learn
 * each control in place.
 *
 * This is domain copy, not design tokens: the wording carries tone/structure
 * decisions (recorded in the design spec), so it lives in one place as plain data
 * — React-, DOM- and framework-free — and can be unit tested in plain Node and
 * asserted against by any component. It is deliberately kept separate from the
 * legacy PDF-tool {@link module:strings/helpText} copy: those keys describe a
 * different product surface and must not be reused here.
 *
 * Tone (matches the rest of the grader copy):
 * - `title`: a short noun-phrase label naming the control (e.g. "URL to analyze").
 * - `body`: one or two plain declarative sentences explaining what pressing /
 *   filling the control does.
 */
import type { HelpEntry } from '../strings/helpText'

export type { HelpEntry }

/**
 * One key per grader control. Named by the control's semantic role (not by the
 * component that renders it) so the copy can be reused wherever the control
 * appears. The start/reset button and the reveal toggle each occupy a single slot
 * that swaps label by stage, so they share one entry apiece.
 */
export type ControlHelpKey =
  | 'urlInput'
  | 'startDiagnosis'
  | 'savedUrls'
  | 'provider'
  | 'model'
  | 'apiKey'
  | 'revealKey'
  | 'saveKey'
  | 'forceStage'
  | 'conflictSim'
  | 'markdownDownload'
  | 'screenshotTabs'

/** Every control help key, in the on-screen order the controls appear. */
export const CONTROL_HELP_KEYS = [
  'urlInput',
  'startDiagnosis',
  'savedUrls',
  'provider',
  'model',
  'apiKey',
  'revealKey',
  'saveKey',
  'forceStage',
  'conflictSim',
  'markdownDownload',
  'screenshotTabs',
] as const satisfies readonly ControlHelpKey[]

/**
 * The help copy for every grader control. Single source of truth: components read
 * an entry by key (via {@link module:components/InfoTooltip}) rather than inlining
 * strings, so the ⓘ popovers stay consistent with the spec record.
 */
export const CONTROL_HELP: Record<ControlHelpKey, HelpEntry> = {
  urlInput: {
    title: 'URL to analyze',
    body: 'The field for entering the landing-page address to analyze. Only public addresses starting with http:// or https:// can be analyzed.',
  },
  startDiagnosis: {
    title: 'Start diagnosis / Start fresh',
    body: 'Starts analyzing the entered URL. It is disabled while an analysis is running, and afterwards it changes to a "Start fresh" button so you can analyze again from the beginning.',
  },
  savedUrls: {
    title: 'Saved addresses',
    body: 'Up to five recently analyzed addresses are saved automatically. Click an address to refill the input so you can analyze it again without retyping.',
  },
  provider: {
    title: 'Provider selection',
    body: 'Choose the AI provider used for the AI rubric evaluation. Changing the provider makes only that provider\'s models appear in the model list below.',
  },
  model: {
    title: 'Model selection',
    body: 'Choose which of the selected provider\'s AI models to use for the evaluation. Only models belonging to the selected provider are shown.',
  },
  apiKey: {
    title: 'API key input',
    body: 'Enter the API key used to request AI evaluation. The entered key is saved automatically in this browser only and is never stored or logged on the server.',
  },
  revealKey: {
    title: 'Show / hide key',
    body: 'Briefly reveals the masked API key as plain text so you can visually confirm the stored value. Only the display changes on screen; the stored key itself stays the same.',
  },
  saveKey: {
    title: 'Save key',
    body: 'Saves the provider, model, and API key in this browser so they are reused on your next visit. The key is kept only after you press Save; leave the key empty to run without AI evaluation.',
  },
  forceStage: {
    title: 'Force progress stage',
    body: 'Forces the screen to a chosen progress stage without actually running an analysis. It is a test tool for pressing the idle, load, audit, AI evaluation, done, partial-result, and load-failure states to check how the screen reacts.',
  },
  conflictSim: {
    title: 'Conflict simulation',
    body: 'Simulates a situation where an analysis is already running. With "analysis already in progress" turned on, pressing start sends no request and shows the in-progress notice, letting you verify that rule.',
  },
  markdownDownload: {
    title: 'Download markdown report',
    body: 'Downloads a markdown report file containing the total score, grade, category scores, checklist, and AI comments exactly as shown on screen. For a partial result, the file also notes that it is on the 60-point scale.',
  },
  screenshotTabs: {
    title: 'Screenshot tabs',
    body: 'Switch between the analyzed page\'s desktop and mobile screenshots via tabs. Clicking a tab shows the preview captured at that screen size.',
  },
}
