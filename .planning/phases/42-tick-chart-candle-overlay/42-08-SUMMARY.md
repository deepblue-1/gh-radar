---
phase: 42-tick-chart-candle-overlay
plan: 08
subsystem: ui
tags: [tick-viewer, tick-chart, view-sync, localStorage, useSyncExternalStore, react, vitest]

requires:
  - phase: 42-01
    provides: "tick-chart.tsx titleAddon · tick-viewer 선 ↔ 봉 조건부 렌더 · ChartKind"
  - phase: 42-03
    provides: "use-candle-prefs.ts useChartKind(gh-radar:tick-chart-kind)"
provides:
  - "lib/ticks/use-view-sync.ts — ChartViewSnap · useViewSync(ctl, initialView?, onViewChange?): { pending }"
  - "TickChartProps.initialView? · TickChartProps.onViewChange?(선 차트 선택 입력 둘)"
  - "tick-viewer 차트 종류 기억(useChartKind) · 마지막 보기 창 ref · 전환 순간의 창 → 선 차트 처음 창"
affects: [42-09, 42-10, 42-11]

actuals:
  tokens: 5245
  tasks: 2
  commits: 5
plan_head_before: f49f70b878aff34219bb5c36522a8fccf4d57c58
plan_head_after: 8c35dbf84aed1a8ba85af2639804323d8dabc307

tech-stack:
  added: []
  patterns:
    - "보기 창 주고받기 = 공용 훅 한 줄(useViewSync) — useChartView 는 그대로, 마운트 layout effect 로 적용"
    - "뷰어는 마지막 창을 렌더 없는 ref 에 쥐고 스위치 처리기에서만 읽어 state(switchView)로 넘긴다"

key-files:
  created:
    - webapp/src/lib/ticks/use-view-sync.ts
    - webapp/src/components/ticks/__tests__/tick-chart-view-sync.test.tsx
  modified:
    - webapp/src/components/ticks/tick-chart.tsx
    - webapp/src/components/ticks/tick-viewer.tsx
    - webapp/src/components/ticks/__tests__/chart-kind-switch.test.tsx

key-decisions:
  - "StrictMode 가상 해제가 useChartView 의 예약 프레임을 버리면 appliedRef 만으로는 창이 영영 반영되지 않고 svg 가 숨은 채 남는다 — layout effect 정리 함수가 반영 전이면 appliedRef 를 되돌려 다시 붙을 때 한 번 더 예약한다(실제 적용은 한 번)"
  - "같은 차트 종류를 다시 누르면 아무것도 하지 않는다(창 넘김 · 저장 둘 다 생략)"
  - "뷰어 렌더 횟수는 useTickOwn 래핑 mock 으로 센다 — TickViewer 만 렌더마다 한 번 부르는 훅"

patterns-established:
  - "보기 창 공유 입력 = initialView(마운트 1회) + onViewChange(반영 뒤에만) — 42-10 이 봉 차트에 같은 훅으로 붙인다"

requirements-completed: [SC-1]

coverage:
  - id: D1
    description: "선 차트가 받은 창(initialView)으로 열고 바뀐 창을 알린다 · 반영 전 숨김 · 반영 전엔 알리지 않음 · 「전체」 는 이름으로 · 최소 창 10초 · 마운트 뒤 바뀐 입력 무시 · StrictMode 에서도 열림 · titleAddon"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-chart-view-sync.test.tsx (8 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "새 입력을 안 주면 선 차트가 이 phase 전과 같다 · tick-chart.tsx diff 가 허용 범위 안"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-chart.test.tsx (29 passed · 수정 없음)"
        status: pass
      - kind: other
        ref: "diff 범위 게이트(git diff -U0 b72dcd0f -- tick-chart.tsx) = SCOPE-OK · use-chart-view.ts · tick-chart.test.tsx diff 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "차트 종류 기억(처음 선 · 고른 쪽이 다음에도) · 선 1분 → 봉 → 선 이면 1분 · 뷰어 key 재마운트면 하루 전체 · 창이 바뀌어도 뷰어 재렌더 없음"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/chart-kind-switch.test.tsx (7 passed · 새 describe 「기억 · 보던 구간(선 차트 쪽)」 4)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx (23 passed · 수정 없음)"
        status: pass
    human_judgment: false
  - id: D4
    description: "실기기에서 전환 직후 하루 전체가 한 프레임 비치지 않는다(깜박임 없음)"
    verification: []
    human_judgment: true
    rationale: "rAF 와 React 19 커밋 순서에 따른 시각 깜박임은 jsdom 이 재현하지 못한다(RESEARCH A1 [ASSUMED]) — 42-11 UAT 에서 실기기로 확인"

duration: 12min
completed: 2026-11-12
status: complete
---

# Phase 42 Plan 08: 선 차트 보기 창 주고받기 · 차트 종류 기억 Summary

**공용 훅 `useViewSync` 한 줄로 선 차트가 받은 창(`initialView`)으로 열고 바뀐 창을 알리게(`onViewChange`) 했고, 뷰어는 차트 종류를 브라우저에 기억하며(`gh-radar:tick-chart-kind`) 마지막 창을 렌더 없는 ref 에 쥐었다가 스위치를 누르는 순간 새 선 차트의 처음 창으로 넘긴다.**

## Performance

- **Duration:** 약 12분
- **Started:** 2026-11-12T13:50:03Z
- **Completed:** 2026-11-12T13:56Z
- **Tasks:** 2
- **Files:** 새 2 · 수정 3

## Accomplishments

- `useViewSync` — 마운트 1회 적용(프리셋은 `setPreset` · 숫자는 `schedule` → `clampView` 가 10초 · 08:00 ~ 20:00 로 자름) · 반영 뒤에만 알림 · 반영 전 `pending` 으로 svg 숨김 · StrictMode 안전.
- `tick-chart.tsx` 최종 diff(기준 `b72dcd0f`, 42-01 몫 포함) = **16 추가 · 4 삭제** — 이 플랜 몫은 import 1 · props 2(+JSDoc 2) · 구조분해 2 · 훅 1 · svg `style` 1줄 교체. 범위 게이트 SCOPE-OK.
- `tick-viewer.tsx` — `useState<ChartKind>('line')` → `useChartKind()` · `lastViewRef` · `onViewChange`(useCallback) · `switchView` state · `onKindChange` · `<TickChart initialView onViewChange>`. `<CandleChart>` 에는 아직 넘기지 않는다(42-10).

## 계약(뒤 플랜이 읽는 시그니처)

```ts
// webapp/src/lib/ticks/use-view-sync.ts ('use client')
export interface ChartViewSnap { t0: number; t1: number; preset: ChartPreset | null }
export function useViewSync(
  ctl: ChartViewControl,
  initialView?: ChartViewSnap,
  onViewChange?: (v: ChartViewSnap) => void,
): { pending: boolean };

// webapp/src/components/ticks/tick-chart.tsx — TickChartProps 에 더함
initialView?: ChartViewSnap;               // 마운트 때 한 번만 · 안 주면 하루 전체
onViewChange?: (v: ChartViewSnap) => void; // 반영 뒤 창이 바뀔 때마다
```

- 42-10 은 `candle-chart.tsx` 에서 `const { pending } = useViewSync(ctl, initialView, onViewChange);` 한 줄 + svg `visibility: pending ? 'hidden' : undefined` 로 같은 계약을 붙이고, 뷰어의 `<CandleChart>` 에 `initialView={switchView ?? undefined}` · `onViewChange={onViewChange}` 를 넘기면 된다(뷰어 쪽 ref · state 는 이미 있다).

## 테스트 수

| 파일 | 테스트 |
|---|---|
| `tick-chart-view-sync.test.tsx`(새) | 8 |
| `chart-kind-switch.test.tsx` | 7(기존 3 + 새 describe 4) |
| `tick-chart.test.tsx`(수정 없음) | 29 |
| `tick-viewer-live.test.tsx`(수정 없음) | 23 |

플랜 검증: 네 파일 한 번에 67 통과 · `pnpm --filter @gh-radar/webapp run typecheck` 통과 · 변경 파일 eslint 경고 0.

## Task Commits

1. **Task 1: useViewSync + 선 차트 선택 입력 둘** — RED `af131c1b` · GREEN `b56821e8` · REFACTOR `d17e5a29`(테스트 캐스트 → 실제 props 타입)
2. **Task 2: 뷰어 차트 종류 기억 · 마지막 창 ref** — RED `9056f279` · GREEN `8c35dbf8`

## TDD Gate Compliance

두 태스크 모두 `test(42-08)` → `feat(42-08)` 순서. RED 증거는 vitest `tap-flat` 을 `-t` 로 대상 하나만 돌려 `gsd-tools check tdd-red-evidence` = **RED_EVIDENCE_OK**(target_test_failed). 증거 파일은 커밋하지 않았다.

- **Task 1 RED:** 대상 「initialView 1분 창 → 반영 전엔 svg 숨김 …」. `expected '' to be 'hidden'` — 모듈은 정상 로드(전체 실행 8 중 2 통과: 새 입력 없음 · titleAddon 은 42-01 코드라 RED 때도 참), 선 차트가 `initialView` 를 아직 받지 않아 계획한 단언에서 실패. 의미 판정: 유효.
- **Task 2 RED:** 대상 「기억 없음 → 선 차트 · 「봉 차트」 누름 → 저장소 candle …」. `expected null to be 'candle'` — 뷰어가 `useState` 라 저장하지 않음. 전체 실행 7 중 3 실패(기억 · 1분 유지 · key 재마운트), 렌더 횟수 테스트는 RED 때도 참(그때 뷰어는 창을 들지 않음). 의미 판정: 유효.
- **대조 실험(커밋 안 함):** ① 정리 함수를 빼면 StrictMode 테스트가 실패 ② 뷰어 `onViewChange` 에 `setSwitchView(v)` 를 넣으면 렌더 횟수 테스트가 `expected 5 to be 3` 으로 실패 — 두 테스트가 지키려는 것을 실제로 잡는다. 둘 다 원래대로 되돌렸다.

## Decisions Made

- 위 frontmatter `key-decisions` 3건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] StrictMode 에서 받은 창이 반영되지 않고 svg 가 숨은 채 남는 문제**
- **Found during:** Task 1 (GREEN)
- **Issue:** 계획(RESEARCH Pattern 5)대로 `appliedRef` 하나로만 막으면, 개발 모드 StrictMode 가상 해제 때 `useChartView` 의 정리(`aliveRef` · `dropPending`)가 `schedule` 이 걸어 둔 프레임을 버리고, 다시 붙을 때는 `appliedRef` 가 true 라 적용을 건너뛴다 — 창은 하루 전체 · `pending` 은 영영 true(svg 숨김).
- **Fix:** 숫자 창 경로의 layout effect 정리 함수가 아직 반영 전(`doneRef` false)이면 `appliedRef` 를 되돌린다 → 다시 붙을 때 한 번 더 예약(첫 예약은 버려졌으므로 실제 적용은 한 번). 프리셋 경로는 동기 commit 이라 그대로.
- **Files modified:** `webapp/src/lib/ticks/use-view-sync.ts`
- **Verification:** `tick-chart-view-sync.test.tsx` 「StrictMode 이중 실행에도 …」 — 정리 함수를 빼면 실패 · 넣으면 통과(대조 실험).
- **Committed in:** `b56821e8`

**2. [Rule 2 - 정확성] 테스트 사이 차트 종류 기억 누수 차단**
- **Found during:** Task 2 (RED)
- **Issue:** 이제 「봉 차트」 클릭이 `localStorage` 에 남아 같은 파일의 다음 테스트가 봉 차트로 시작할 수 있다(전역 setup 은 이 키를 지우지 않음).
- **Fix:** `chart-kind-switch.test.tsx` 최상위 `beforeEach` 에 `window.localStorage.clear()` 한 줄(기존 테스트 단언은 그대로).
- **Files modified:** `webapp/src/components/ticks/__tests__/chart-kind-switch.test.tsx`
- **Committed in:** `9056f279`

---

**Total deviations:** 2 auto-fixed(Rule 1 하나 · Rule 2 하나). **Impact:** 계약 이름 · 시그니처 변화 없음. `use-chart-view.ts` 는 고치지 않았다.

## Known Stubs

- 없음. `<CandleChart>` 에 `initialView` · `onViewChange` 를 아직 넘기지 않는 것은 플랜이 42-10 으로 나눈 몫이다(지금은 봉 차트 → 선 차트로 돌아올 때 봉 차트에서 바꾼 창이 아니라 선 차트에서 마지막으로 본 창으로 연다 — 42-10 이 같은 훅을 붙이면 해결).

## Issues Encountered

- `chart-kind-switch.test.tsx` 실행 때 React `act(...)` 경고(뷰어가 여는 `fetchTickOwn` 비동기 응답) — 실패 아님, 42-01 때와 같은 성질.
- 워크트리에 `node_modules` · shared `dist` 가 없어 `pnpm install --frozen-lockfile` · `pnpm --filter @gh-radar/shared build` 를 먼저 돌렸다(git 무시 대상). env 파일 복사 불필요.

## 실행 환경 메모

- vitest 는 이 플랜이 건드린 · 검증 대상 테스트 파일만 `--maxWorkers=2` 로 돌렸다. 전체 회귀 · Playwright 는 돌리지 않았다.
- 배포 · push 없음. STATE.md · ROADMAP.md 는 손대지 않았다(오케스트레이터 몫).

## Next Phase Readiness

- 42-10 이 위 계약으로 봉 차트 쪽 두 입력과 뷰어 → 봉 차트 전달을 붙이면 D-24 양방향이 닫힌다.
- 전환 직후 깜박임 유무는 42-11 실기기 UAT 항목(coverage D4).

## Self-Check: PASSED

- 새 파일 2 · 수정 파일 3 존재 확인.
- 커밋 `af131c1b` · `b56821e8` · `d17e5a29` · `9056f279` · `8c35dbf8` 모두 HEAD 조상.
- Task 1 수용 기준: `export function useViewSync` 1 · 훅 줄 1 · SCOPE-OK · use-chart-view.ts · tick-chart.test.tsx diff 0 · 테스트 8 ≥ 7 전부 통과.
- Task 2 수용 기준: `useChartKind()` 1 · `lastViewRef` 3 ≥ 2 · 저장소에 창 쓰기 grep 출력 없음 · 새 describe 존재 · 전부 통과 · tick-viewer-live 통과(수정 없음).

---
*Phase: 42-tick-chart-candle-overlay*
*Completed: 2026-11-12*
