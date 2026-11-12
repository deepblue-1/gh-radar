---
phase: 42-tick-chart-candle-overlay
plan: 07
subsystem: ui
tags: [tick-viewer, candle-chart, moving-average, popover, sheet, radiogroup, vitest]

requires:
  - phase: 42-01
    provides: "CandleUnit · CANDLE_UNITS · candleUnitLabelOf · ChartKindSwitch(스위치 노드)"
  - phase: 42-03
    provides: "MaSpec · maNameOf · maKeyOf · isValidMaSpec · MA_N_MIN/MAX · MA_MAX_LINES · MaConfig · addMaLine/toggleMaLine/removeMaLine · CandleUnitPref · --ma-1 ~ --ma-6"
provides:
  - "CandleUnitMenu — 봉 단위 버튼 + 펼침 목록(radiogroup)"
  - "CandleMaChips — 이동평균 칩 · 「＋」(6개 상한)"
  - "CandleMaForm · maFormStateOf · periodTextOf — 이동평균 더하기 한 장 양식(팝오버 ↔ 시트) · 순수 검증"
  - "CandleChartTitle — 봉 차트 제목 줄(데스크톱 한 줄 · 폰 두 줄)"
affects: [42-09, 42-10, 42-11]

actuals:
  tokens: 13200
  tasks: 3
  commits: 6
plan_head_before: e40351be468f39c3caa5ad00fbc2a4e597d45111
plan_head_after: 2225c8cd955a820f9096a985925e84a9bbb046bd

tech-stack:
  added: []
  patterns:
    - "펼침 목록 = Popover 안 radiogroup · 줄은 button role=radio(Space 를 버튼이 먹어 window 재생 키와 겹치지 않음)"
    - "팝오버 ↔ 시트 = push-alert-bell 의 열림 상태 하나 + 뷰포트 768 · 앱 셸 판정 · 본문은 열린 동안만 마운트(열 때마다 초기화)"
    - "이동평균 색 줄 = 색 번호 → 정적 클래스 bg-[var(--ma-n)] 표(Tailwind 소스 스캔)"

key-files:
  created:
    - webapp/src/components/ticks/candle-unit-menu.tsx
    - webapp/src/components/ticks/candle-ma-chips.tsx
    - webapp/src/components/ticks/candle-ma-form.tsx
    - webapp/src/components/ticks/candle-chart-title.tsx
    - webapp/src/components/ticks/__tests__/candle-unit-menu.test.tsx
    - webapp/src/components/ticks/__tests__/candle-ma-form.test.tsx
    - webapp/src/components/ticks/__tests__/candle-chart-title.test.tsx
  modified: []

key-decisions:
  - "봉 단위 목록은 고르면 바로 버튼에 초점을 준다 — Radix 의 닫힘 뒤 초점 복귀는 한 틱 늦고, 바깥 누르기 때는 Radix 기본(초점 안 뺏음)을 그대로 둔다"
  - "maFormStateOf 는 range 에서 name null · dup 에서만 name — 확인 버튼은 통과일 때만 「{이름} 더하기」, 그 밖은 「더하기」"
  - "폰 칩 줄 흐림은 오른쪽에 가려진 칩이 남아 있을 때만(끝까지 밀면 걷음) — 막 더한 칩이 흐려 보이지 않게"
  - "폰에서 칩 0개면 칩 줄을 그리지 않고 「＋ 이동평균」 이 봉 단위 버튼 바로 뒤에 선다"

patterns-established:
  - "제목 줄 조작부는 값 + 콜백만 받는다 — 저장(useCandleUnitPref · useMaConfig) · 차트 결선은 42-10"

requirements-completed: [SC-1, SC-2, SC-3]

coverage:
  - id: D1
    description: "봉 단위 메뉴 — 버튼 글자 「5분봉(자동)」 / 「15분봉」 · aria-label · aria-haspopup=dialog · aria-expanded · 목록 7줄(전부 BUTTON) · 「지금」 꼬리표 · 고르기 · ↑ ↓(preventDefault) · Esc · 폰/데스크톱 치수"
    requirement: SC-2
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/candle-unit-menu.test.tsx (8 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "이동평균 칩(켜고 끄기 · × 확인 없이 지움 · 색 줄 · 0개 · 6개 상한) · 더하기 양식(빈 칸 · range · dup · 숫자 정리 · 일 + 지수 불가 · Enter · 팝오버/시트 · 첫 초점 · 더하면 새 칩 맨 뒤 + 「＋」 초점)"
    requirement: SC-3
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/candle-ma-form.test.tsx (15 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "제목 줄 — 데스크톱 한 줄 순서 · 긴 범례 없음 · 폰 두 줄(칩 6개에도) · 확대 버튼 이름 · 콜백"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/candle-chart-title.test.tsx (6 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "폰 360 · 390 목록이 잘리지 않음 · 「단순 240」 칩 6개 가로 밀기 · 오류 줄 줄바꿈 · 데스크톱 184 안 「지금」 꼬리표(backstop 시각 확인)"
    verification: []
    human_judgment: true
    rationale: "시각 판단 — 이 플랜은 Playwright 금지. 42-10 결선 뒤 42-11 UAT 에서 실기기로 확인"

duration: 10min
completed: 2026-11-12
status: complete
---

# Phase 42 Plan 07: 봉 차트 제목 줄 조작부 Summary

**봉 단위 메뉴(Popover 안 radiogroup · 「지금」 꼬리표 · 키보드), 이동평균 칩 + 6개 상한 「＋」, 팝오버 ↔ 바텀 시트 한 장 양식(순수 검증 `maFormStateOf`), 데스크톱 한 줄 / 폰 두 줄 제목 줄 `CandleChartTitle` 을 값 + 콜백만 받는 컴포넌트 4개로 만들고 테스트 29건으로 잠갔다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-11-12T14:02:15Z
- **Completed:** 2026-11-12T14:12Z
- **Tasks:** 3
- **Files:** 새 파일 7(컴포넌트 4 · 테스트 3) · 수정 0

## Accomplishments

- `CandleUnitMenu` — 채택 목업 A 그대로 펼침 목록. 줄은 전부 `<button role="radio">` 라 Space 가 틱 재생 키를 건드리지 않는다(Pitfall 11). select 요소는 쓰지 않았다(D-23).
- `CandleMaChips` · `CandleMaForm` — 켜기 칸 · × 칸 칩, 6개면 `aria-disabled` + `title`(초점은 남음), 뷰포트 768 + 앱 셸 아님 = 팝오버 · 그 밖 = 바텀 시트. 열 때마다 봉 · 빈 칸 · 단순으로 시작.
- `CandleChartTitle` — 데스크톱은 선 차트 제목 줄 클래스 · 확대 버튼 `btn` 문자열 · 우리 범례 마크업을 그대로 옮기고, 폰은 칩 수와 무관하게 두 줄.
- 새 UI 부품 설치 없음(기존 Popover · Sheet · Input 만).

## 뒤 플랜이 읽는 실제 시그니처(계약)

```ts
// webapp/src/components/ticks/candle-unit-menu.tsx
export interface CandleUnitMenuProps {
  value: CandleUnitPref; current: CandleUnit; onChange: (unit: CandleUnitPref) => void;
  phone: boolean; className?: string;
}
export function CandleUnitMenu(props: CandleUnitMenuProps): JSX.Element;
// data-slot: candle-unit-button · candle-unit-list · candle-unit-now

// webapp/src/components/ticks/candle-ma-chips.tsx
export interface CandleMaChipsProps { config: MaConfig; onChange: (cfg: MaConfig) => void; phone: boolean }
export function CandleMaChips(props: CandleMaChipsProps): JSX.Element;
// data-slot: candle-ma-chips(데스크톱 = 묶음 · 폰 = 칩 줄) · candle-ma-chip(data-on) · candle-ma-add
// 묶음 role=group aria-label="이동평균" · 칩 0개 폰이면 칩 줄(candle-ma-chips) 자체가 없다

// webapp/src/components/ticks/candle-ma-form.tsx
export interface MaFormInput { base: MaBase; nText: string; kind: MaKind }
export interface MaFormState { spec: MaSpec | null; error: 'range' | 'dup' | null; name: string | null }
export function maFormStateOf(input: MaFormInput, config: MaConfig): MaFormState;
export function periodTextOf(raw: string): string;   // 숫자만 · 앞 0 지움 · 3자리
export interface CandleMaFormProps {
  open: boolean; onOpenChange: (open: boolean) => void; config: MaConfig;
  onAdd: (spec: MaSpec) => void; trigger: ReactNode;
}
export function CandleMaForm(props: CandleMaFormProps): JSX.Element;
// data-slot: candle-ma-form(본문)

// webapp/src/components/ticks/candle-chart-title.tsx
export interface CandleChartTitleProps {
  phone: boolean; kindSwitch: ReactNode;
  unitPref: CandleUnitPref; currentUnit: CandleUnit; onUnit: (unit: CandleUnitPref) => void;
  ma: MaConfig; onMa: (cfg: MaConfig) => void;
  ownLegend: boolean; spanLabel: string;
  onZoomIn: () => void; onZoomOut: () => void; onFull: () => void; onMinute: () => void; onTenSec: () => void;
}
export function CandleChartTitle(props: CandleChartTitleProps): JSX.Element;
// data-slot: candle-chart-title(data-dims="desktop" | "phone") · candle-chart-span · candle-chart-own-legend
```

- 확대 버튼 접근 이름 = 「확대」 · 「축소」 · 「전체」 · 「1분」 · 「10초」(선 차트 · 42-09 지시와 같음). 「확대」 · 「축소」 는 `aria-label`, 나머지는 글자.
- 폰에서 `ownLegend` · `spanLabel` 은 받기만 하고 그리지 않는다(우리 범례는 카드 아래 줄 — 42-10 결선 몫).
- 계약 변경: `CandleUnitMenu` 에 선택 입력 `className` 하나를 더했다(폰 둘째 줄 `shrink-0` 용). `periodTextOf` 를 추가 export. 나머지는 플랜 「Artifacts」 이름 그대로.

## 테스트 수

| 파일 | 테스트 |
|---|---|
| `candle-unit-menu.test.tsx` | 8 |
| `candle-ma-form.test.tsx` | 15 |
| `candle-chart-title.test.tsx` | 6(`it(` 4 + `it.each` 2) |

플랜 검증: 세 파일 한 번에 29 통과(`--maxWorkers=2`) · `pnpm --filter @gh-radar/webapp run typecheck` 통과 · 새 파일 eslint 출력 없음.

## Task Commits

1. **Task 1: 봉 단위 메뉴** — RED `6a25074f` · GREEN `cf9edc06`
2. **Task 2: 이동평균 칩 · 더하기 양식** — RED `2a9733b7` · GREEN `3bc0b75a`
3. **Task 3: 제목 줄 배치** — RED `22f4d89a` · GREEN `2225c8cd`

REFACTOR 커밋 없음(정리할 것이 없었다).

## TDD Gate Compliance

세 태스크 모두 `test(42-07)` → `feat(42-07)` 순서다. RED 뼈대는 계약 이름 · 타입만 두고 틀린 값을 돌려주게 해서 단언에서 실패시켰다(42-03 방식). 증거는 vitest `tap-flat` 출력으로 `gsd-tools check tdd-red-evidence` 를 돌렸고 셋 다 **RED_EVIDENCE_OK**(target_test_failed)다. 전체 실행은 여러 줄 메시지(DOM 덤프 · 객체 diff) 때문에 분류기가 Malformed TAP 으로 거부해서, 같은 명령에 `-t` 로 대상 하나만 다시 돌린 결과를 기록했다. 증거 파일은 커밋하지 않았다.

- **Task 1 RED:** 대상 「자동 · 지금 5분 → 「5분봉(자동)」 · aria-label · aria-haspopup=dialog · 누르면 펼쳐진다」 — `expected '' to be '5분봉(자동)'`. 전체 실행에서는 8건 모두 실패. 의미 판정: 모듈은 정상 로드됐고, 계획한 버튼 글자 단언에서 실패했다. 유효.
- **Task 2 RED:** 대상 「빈 칸 → 오류 없음 · spec 없음 / 1 · 241 → range」 — `expected null to be 'range'`. 전체 실행에서는 15건 모두 실패. 의미 판정: 유효.
- **Task 3 RED:** 대상 「한 줄 flex-wrap · 순서 = …」 — `expected undefined to be 'desktop'`. 전체 실행에서는 6건 중 5건 실패(「ownLegend 가 없으면 우리 범례 없음」 은 빈 뼈대에서도 참이라 통과). 의미 판정: 유효.
- 여러 줄 메시지를 피하려고 대상 테스트의 첫 단언을 원시값 `toBe` 로 앞에 두었다(Task 1 · 2). 검사하는 내용은 그대로다.

## Decisions Made

- 위 frontmatter `key-decisions` 4건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 폰 칩 줄 흐림이 끝까지 민 뒤에도 남는 문제**
- **Found during:** Task 2
- **Issue:** 계획 문구대로 「넘칠 때(`scrollWidth > clientWidth`)」 만 보면, 칩을 더해 끝까지 밀었을 때 막 더한 칩의 오른쪽 16px 가 흐려진 채 보인다.
- **Fix:** 오른쪽에 가려진 칩이 남아 있을 때만 흐림(`scrollLeft + clientWidth < scrollWidth − 1`) · 스크롤 · 크기 변화 때마다 다시 잰다.
- **Files modified:** `webapp/src/components/ticks/candle-ma-chips.tsx`
- **Commit:** `3bc0b75a`

**2. [Rule 3 - Blocking] 수용 기준 grep 과 주석 충돌**
- **Found during:** Task 1
- **Issue:** 설명 주석의 select 태그 표기가 `! grep -n "<select"`(D-23) 에 걸렸다.
- **Fix:** 주석 글자를 「select 요소」 로 바꿨다(코드에는 처음부터 없음).
- **Files modified:** `webapp/src/components/ticks/candle-unit-menu.tsx`
- **Commit:** `cf9edc06`

**Total deviations:** 2건 자동 수정(Rule 1 하나 · Rule 3 하나). **Impact:** 계약 이름 · 시그니처 변화 없음.

## Issues Encountered

- 워크트리에 `node_modules` · shared `dist` 가 없어 `pnpm install --frozen-lockfile` · `pnpm --filter @gh-radar/shared build` 를 먼저 돌렸다(둘 다 git 무시 대상). env 파일은 필요 없었다.
- 배포 · push · `supabase db push` 는 하지 않았다. STATE.md · ROADMAP.md 는 손대지 않았다(오케스트레이터 몫).

## Next Phase Readiness

- 42-10 결선: `CandleChart` 의 제목 줄 자리에 `<CandleChartTitle phone={phone} kindSwitch={titleAddon?.(phone)} unitPref={unitPref} currentUnit={unit} onUnit={setUnitPref} ma={maConfig} onMa={setMaConfig} ownLegend={…} spanLabel={fmtSpan(span)} onZoomIn={() => zoomBy(0.5)} … />` 로 잇는다. 줌 콜백 이름은 선 차트의 `zoomBy(0.5)` · `zoomBy(2)` · `ctl.setPreset('full')` · `zoomTo(60_000)` · `zoomTo(10_000)` 과 하나씩 짝이다.
- 폰 우리 범례(「◆ 우리 체결」 · 「○ 조건 근거」)는 이 제목 줄이 그리지 않는다 — 카드 아래 줄(S9)에서 그려야 한다.

## Self-Check: PASSED

- 새 파일 7개 모두 존재.
- 커밋 `6a25074f` · `cf9edc06` · `2a9733b7` · `3bc0b75a` · `22f4d89a` · `2225c8cd` 모두 HEAD 조상.
- 세 태스크 acceptance_criteria 재실행 전부 통과(radiogroup 1 · radio 4 · 「보기 창에 맞춰 바뀌어요」 2 · select 없음 · `it(` 8 / maFormStateOf 1 · 768 쿼리 1 · 오류 문구 1 · 안내 문구 1 · 6개 문구 1 · aria-disabled 2 · `it(` 15 / 확대 1 · 축소 1 · `h-8 min-w-7 px-1` 1 · `grid gap-y-1` 1 · 긴 범례 없음 · `it(` 4).
