/**
 * Co-located help copy for the landing-grader's controls (한국어).
 *
 * Each control on the grader screen — the URL input, the 진단 시작/새로 진단
 * button, the saved-address chips, the provider/model selects, the API-key input,
 * the reveal toggle, the three key presets, the stage-force buttons, the conflict
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
 * - `title`: a short 명사구 label naming the control (e.g. "진단할 URL").
 * - `body`: one or two sentences in the app's 평서형 `...니다.` voice explaining
 *   what pressing / filling the control does.
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
  | 'presetNone'
  | 'presetValid'
  | 'presetInvalid'
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
  'presetNone',
  'presetValid',
  'presetInvalid',
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
    title: '진단할 URL',
    body: '품질을 진단할 랜딩페이지 주소를 입력하는 칸입니다. http:// 또는 https:// 로 시작하는 공개 주소만 진단할 수 있습니다.',
  },
  startDiagnosis: {
    title: '진단 시작 / 새로 진단',
    body: '입력한 URL의 진단을 시작합니다. 진단이 진행되는 동안에는 비활성화되며, 끝난 뒤에는 "새로 진단" 버튼으로 바뀌어 처음부터 다시 진단할 수 있습니다.',
  },
  savedUrls: {
    title: '저장된 주소',
    body: '최근에 진단을 시작한 주소가 최대 5개까지 자동으로 저장됩니다. 주소를 누르면 입력란에 다시 채워져 재입력 없이 바로 진단할 수 있습니다.',
  },
  provider: {
    title: '공급자 선택',
    body: 'AI 루브릭 평가에 사용할 AI 공급자를 고릅니다. 공급자를 바꾸면 그 공급자의 모델만 아래 모델 목록에 나타납니다.',
  },
  model: {
    title: '모델 선택',
    body: '선택한 공급자의 AI 모델 중 평가에 사용할 모델을 고릅니다. 선택한 공급자에 속한 모델만 표시됩니다.',
  },
  apiKey: {
    title: 'API 키 입력',
    body: 'AI 평가를 요청할 때 사용할 API 키를 입력합니다. 입력한 키는 이 브라우저에만 자동 저장되며 서버에 저장·기록되지 않습니다.',
  },
  revealKey: {
    title: '키 표시 / 숨김',
    body: '마스킹된 API 키를 평문으로 잠깐 드러내 저장된 값을 눈으로 확인합니다. 표시는 화면에서만 바뀌며 저장된 키 자체는 그대로입니다.',
  },
  presetNone: {
    title: '키 없음 프리셋',
    body: '입력란의 API 키를 비웁니다. 키가 없을 때 AI 평가가 실패하고 자동 점검 결과만 표시되는 부분 결과 흐름을 확인할 때 사용합니다.',
  },
  presetValid: {
    title: '유효한 키 프리셋',
    body: '유효한 형식의 예시 키를 입력란에 채웁니다. AI 평가까지 정상적으로 완료되는 흐름을 확인할 때 사용합니다.',
  },
  presetInvalid: {
    title: '무효한 키 프리셋',
    body: '형식은 맞지만 실제로는 유효하지 않은 예시 키를 채웁니다. 키 오류로 AI 평가가 실패하고 부분 결과가 표시되는 흐름을 확인할 때 사용합니다.',
  },
  forceStage: {
    title: '진행 단계 강제 전이',
    body: '진단을 실제로 실행하지 않고도 화면을 원하는 진행 단계로 강제로 옮겨 봅니다. 대기·로드·감사·AI 평가·완료·부분 결과·로드 실패 상태를 눌러 화면 반응을 확인하는 테스트 도구입니다.',
  },
  conflictSim: {
    title: '충돌 시뮬레이션',
    body: '이미 진단이 진행 중인 상황을 흉내 냅니다. "이미 분석 진행 중"을 켜 두면 진단 시작을 눌러도 요청을 보내지 않고 진행 중 안내가 표시되는 규칙을 확인할 수 있습니다.',
  },
  markdownDownload: {
    title: '마크다운 리포트 다운로드',
    body: '화면에 표시된 총점·등급·카테고리 점수·체크리스트·AI 코멘트를 그대로 담은 마크다운 리포트 파일을 내려받습니다. 부분 결과일 때는 60점 만점 기준임이 파일에도 표시됩니다.',
  },
  screenshotTabs: {
    title: '스크린샷 탭',
    body: '진단한 페이지의 데스크톱·모바일 스크린샷을 탭으로 전환해 봅니다. 탭을 누르면 해당 화면 크기로 촬영한 미리보기가 표시됩니다.',
  },
}
