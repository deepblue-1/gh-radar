---
phase: 42-tick-chart-candle-overlay
plan: 04
subsystem: ui
tags: [tick-viewer, candle-chart, svg, moving-average, vitest]

requires:
  - phase: 42-01
    provides: "candle-chart.ts(CandleFrame · Candles · candlePathsOf 폭 규칙 · cumAvgPathOf) · CandlePriceLayer(children 자리 · 클립 둘)"
  - phase: 42-03
    provides: "candle-ma.ts CandleMaValue · maPathOf · --ma-1 ~ --ma-6 토큰"
provides:
  - "candle-chart.ts — CANDLE_AUTO_MIN_PX · autoUnitOf · AmountBars · amountBarsOf · maVisibleOf · cumAvgVisibleOf · EdgeLabelInput · EdgeLabel · EDGE_LABEL_MAX · EDGE_LABEL_STEP · edgeLabelsOf"
  - "CandlePriceLayer 선택 props ma · team · unitLabel · ownInTitle — 거래대금 막대 · 이동평균 선 · 당일 평단 · 가장자리 글자 · 판 제목"
affects: [42-05, 42-06, 42-07, 42-09, 42-10]

actuals:
  tokens: 8200
  tasks: 2
  commits: 4
plan_head_before: f49f70b878aff34219bb5c36522a8fccf4d57c58
plan_head_after: f8351150e13c74315a0634d71e3492a00e6f5e64

tech-stack:
  added: []
  patterns:
    - "범위 밖 선 = 숨김 집합(edgeLabelsOf.hidden) — 층 컴포넌트가 그 key 의 선을 건너뛰고 글자만 그린다(가격 범위는 봉만으로)"
    - "거래대금 막대도 봉처럼 방향별 path 2개(useMemo) — 봉마다 요소를 만들지 않는다"

key-files:
  created:
    - webapp/src/components/ticks/__tests__/candle-price-layer.test.tsx
  modified:
    - webapp/src/lib/ticks/candle-chart.ts
    - webapp/src/lib/ticks/__tests__/candle-chart.test.ts
    - webapp/src/components/ticks/candle-price-layer.tsx

key-decisions:
  - "가장자리 글자의 쪽(▾ ▴)은 보이는 마지막 값으로 정하고 글자 값은 last — 보이는 값이 위 · 아래로 갈렸지만 한 점도 범위 안이 아닌 드문 경우도 한 쪽에만 쌓인다"
  - "보이는 봉 판정은 42-01 visibleIdxOf 그대로(창 끝 시각에서 시작하는 봉 포함) — maVisibleOf · amountBarsOf 가 candlePathsOf 와 같은 봉 집합을 본다"
  - "당일 평단 점점선은 봉 영역 클립 안(teamAvgPathOf 가 [lo, hi] 로 클램프해 봉 영역 밖으로 나가지 않는다) · 판 제목은 가격 판 클립(그림 폭)으로 자른다"
  - "값이 전부 NaN 인 이동평균(maPathOf = '')은 path 요소 자체를 만들지 않는다"
  - "판 제목은 unitLabel 이 있고 데스크톱일 때만 — 42-10 결선 전(unitLabel 없음)에는 지금처럼 제목 없음"

patterns-established:
  - "층 컴포넌트에 새 기능을 붙일 때는 선택 props + 기본값(NO_MA 상수)으로 — 같은 wave 컨테이너와 합쳐도 타입이 깨지지 않는다"

requirements-completed: [SC-2, SC-3, SC-5, SC-7]

coverage:
  - id: D1
    description: "자동 단위 = 칸 폭 4px 이상인 가장 작은 단위 · 없으면 60(SC-2 · D-09)"
    requirement: SC-2
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/candle-chart.test.ts -t 자동 (3 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "거래대금 막대 높이 · 폭 · 방향 · 창 밖 제외 · 보이는 값 · 가장자리 글자 자리 · 쌓기 · 「외 n개」(D-06 · D-16)"
    requirement: SC-5
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/candle-chart.test.ts (30 passed · 새 12)"
        status: pass
    human_judgment: false
  - id: D3
    description: "가격 판 그리기 — 막대 .38 · 이동평균 --ma-n 1.25 round · 범위 밖 선 대신 글자 · 당일 평단 --up 1 2 · 판 제목 문구 · 겹침 순서 · 틱 선 없음(D-08 · D-10 · D-15 ~ D-17)"
    requirement: SC-3
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/candle-price-layer.test.tsx (10 passed)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/chart-kind-switch.test.tsx (3 passed · 회귀)"
        status: pass
    human_judgment: false
  - id: D4
    description: "실제 모양(막대 농도 · 이동평균 색 · 가장자리 글자 테)이 목업과 같다"
    verification: []
    human_judgment: true
    rationale: "시각 판단 — 컨테이너 결선(42-10) 뒤 42-11 UAT 에서 실기기 확인(이 플랜은 Playwright 금지)"

duration: 15min
completed: 2026-11-12
status: complete
---

# Phase 42 Plan 04: 가격 판 완성 — 자동 단위 · 거래대금 막대 · 이동평균 · 가장자리 글자 Summary

**칸 폭 4px 자동 단위, 창 안 최대 대비 거래대금 막대, 범위 밖 선을 「{이름} {값} ▾/▴」 로 바꾸는 가장자리 글자 배치를 순수 함수로 잠그고, 봉 차트 가격 판이 선택 props 만으로 거래대금 막대 · 이동평균 · 당일 평단 · 가장자리 글자 · 판 제목을 UI-SPEC 겹침 순서대로 그리게 했다.**

## Performance

- **Duration:** 약 15분
- **Completed:** 2026-11-12
- **Tasks:** 2(각 RED → GREEN)
- **Files:** 새 1 · 수정 3

## Accomplishments

- `candle-chart.ts` 에 함수 5개 · 상수 3개 · 타입 3개를 **더하기만** 했다 — 42-01 export 9개 시그니처는 그대로.
- `CandlePriceLayer` 에 **선택** props 4개(`ma` · `team` · `unitLabel` · `ownInTitle`)만 더했다 — 필수 props 무변, 지금 컨테이너(`candle-chart.tsx`)는 수정 없이 그대로 돈다.
- 가격 범위는 여전히 봉만으로 잡는다(D-16) — 범위 밖 누적 평단 · 이동평균은 선 대신 가장자리 글자.

## 뒤 플랜이 읽는 실제 시그니처(계약)

```ts
// webapp/src/lib/ticks/candle-chart.ts (42-04 가 더함)
export const CANDLE_AUTO_MIN_PX = 4;
export function autoUnitOf(span: number, plotW: number): CandleUnit;
export interface AmountBars { up: string; down: string; max: number }
export function amountBarsOf(c: Candles, view: View, x: (t: number) => number, P: CandlePanels): AmountBars;
export function maVisibleOf(c: Candles, values: Float64Array, view: View): number[];
export function cumAvgVisibleOf(pts: readonly PricePoint[], view: View): number[];
export interface EdgeLabelInput { key: string; name: string; fill: string; vis: readonly number[]; last: number | null }
export interface EdgeLabel { key: string; text: string; x: number; y: number; anchor: 'start' | 'end'; fill: string; side: 'below' | 'above' }
export const EDGE_LABEL_MAX = { desktop: 5, phone: 3 } as const;
export const EDGE_LABEL_STEP = 13;
export function edgeLabelsOf(
  items: readonly EdgeLabelInput[],
  range: Pick<TickPriceRange, 'lo' | 'hi'>,
  frame: Pick<CandleFrame, 'P' | 'L' | 'xr' | 'phone'>,
): { labels: EdgeLabel[]; hidden: ReadonlySet<string> };

// webapp/src/components/ticks/candle-price-layer.tsx (최종)
export interface CandlePriceLayerProps {
  frame: CandleFrame; candles: Candles; range: TickPriceRange; y: (px: number) => number;
  cumAvg: readonly PricePoint[]; clipId: string; children?: ReactNode;
  ma?: readonly CandleMaValue[];   // 켜진 선만 · 칩 순서 · values 는 candles 와 같은 색인 (컨테이너가 메모해 넘길 것)
  team?: TeamModel;                // 있으면 당일 평단 점점선
  unitLabel?: string;              // 있고 데스크톱이면 판 제목
  ownInTitle?: boolean;            // 판 제목에 「◆ 우리 체결」
}
```

- 새 data-slot: `candle-amt-up` · `candle-amt-down` · `candle-ma-line`(`data-ma-key`) · `candle-team-avg` · `candle-edge-labels`(묶음) · `candle-edge-label` · `candle-price-title`. 기존 42-01 slot 그대로.
- 가장자리 「외 n개」 key = `more-below` / `more-above` · 누적 평단 key = `cum`.
- 계약 변경 없음(플랜 「Artifacts」 이름 그대로).

## 테스트 수

- `candle-chart.test.ts` 30(42-01 의 18 + 새 12 — 자동 2 · 거래대금 막대 3 · 보이는 값 2 · 가장자리 5)
- `candle-price-layer.test.tsx` 10(새 파일)
- 회귀: `chart-kind-switch.test.tsx` 3 통과 · webapp `typecheck` 통과 · 새/수정 파일 eslint 경고 0

## Task Commits

1. **Task 1: 가격 판 기하** — RED `b9ff0940` · GREEN `2cd37ae9`
2. **Task 2: 가격 판 그리기** — RED `38fb65c7` · GREEN `f8351150`

REFACTOR 커밋 없음(정리할 것 없음).

## TDD Gate Compliance

- **Task 1:** `test(42-04)` `b9ff0940` → `feat(42-04)` `2cd37ae9`. RED 실행: 30 중 12 실패(`autoUnitOf is not a function` · `edgeLabelsOf is not a function` 등 — 새 export 가 없어서) · 42-01 의 18 은 통과. 모듈은 정상 로드 · 문법 · 픽스처 오류 아님 → 의도한 이유의 실패.
- **Task 2:** `test(42-04)` `38fb65c7` → `feat(42-04)` `f8351150`. RED 실행: 10 중 9 실패(막대 · 이동평균 선 · 가장자리 글자 · 판 제목 slot 없음 — 단언 실패) · 1 통과(「틱 선 없음」 은 42-01 부터 참인 불변식). 의도한 이유의 실패.

## Decisions Made

- 위 frontmatter `key-decisions` 5건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 수치] 자동 단위 「폭 100px · 하루 전체 → 60」 은 산술상 틀림**
- **Found during:** Task 1 RED 작성
- **Issue:** 12시간 · 100px 이면 30분 칸 = 1,800,000 / 43,200,000 × 100 = 4.17px ≥ 4 라 정의식(D-09)대로면 30 이다. 플랜 behavior 의 예시 수치가 정의식과 어긋났다.
- **Fix:** 정의식을 따랐다 — 「아무것도 4px 못 넘음 → 60」 은 폭 40px(60분 칸 3.33px)로 잠그고, 100px → 30 도 함께 단언.
- **Files modified:** webapp/src/lib/ticks/__tests__/candle-chart.test.ts
- **Commit:** b9ff0940

**2. [Rule 1 - 테스트 정합] maVisibleOf 창 경계**
- **Found during:** Task 1 GREEN
- **Issue:** 처음 쓴 테스트가 창 끝(`t1`)과 같은 시각에 시작하는 봉을 「안 보임」 으로 봤는데, 42-01 `visibleIdxOf`(봉 경로 · 가격 범위가 쓰는 판정)는 그 봉을 포함한다. 막대 · 이동평균 보이는 값만 다른 판정을 쓰면 봉과 어긋난다.
- **Fix:** 테스트 창을 `t1 = T0 + 30초` 로 바꿔 42-01 판정에 맞췄다(구현은 `visibleIdxOf` 재사용).
- **Files modified:** webapp/src/lib/ticks/__tests__/candle-chart.test.ts
- **Commit:** 2cd37ae9

**Total deviations:** 2 auto-fixed(둘 다 테스트 수치 · 경계 — 구현 계약 무변). **Impact:** 없음.

## 실행 환경 메모

- 워크트리라 `pnpm install --frozen-lockfile` · `pnpm --filter @gh-radar/shared build` 를 먼저 돌렸다(git 무시 대상). env 복사 불필요.
- vitest 는 이 플랜이 건드린 파일(+ 회귀 1개)만 `--maxWorkers=2` 로 돌렸다. 전체 스위트 · Playwright 미실행.
- 배포 · push · STATE.md · ROADMAP.md 손대지 않음.

## Known Stubs

- 없음. 컨테이너(`candle-chart.tsx`)가 아직 `ma` · `team` · `unitLabel` · `ownInTitle` 을 넘기지 않아 화면에서는 거래대금 막대만 새로 보인다 — 플랜이 의도한 범위(결선 = 42-10)이고 이 플랜의 목표(층이 받으면 그린다)는 달성.

## Issues Encountered

- 없음.

## Next Phase Readiness

- 42-10 결선: `autoUnitOf(view.t1 − view.t0, plotW)` 로 단위를 고르고, `ma` 는 켜진 선만 칩 순서로 메모해 넘기면 된다(메모하지 않으면 가장자리 · 이동평균 경로 useMemo 가 매 렌더 다시 돈다). `unitLabel = candleUnitLabelOf(unit, auto)` · `ownInTitle = own 있음` · `team = 팀 모델`.

## Self-Check: PASSED

- 파일 4개 존재 · 커밋 `b9ff0940` · `2cd37ae9` · `38fb65c7` · `f8351150` 모두 HEAD 조상.
- Task 1 수용 기준: 새 함수 5개 export 줄 · `CANDLE_AUTO_MIN_PX = 4` · 42-01 export 9개 그대로(grep 9) · `-t 자동` 3 · `-t 가장자리` 5 통과.
- Task 2 수용 기준: 선택 props 4줄 · `candle-edge-label` 2 · `teamAvgPathOf` 3 · `maPathOf` 2 · `paintOrder="stroke"` 1 · `fillOpacity={0.38}` 2 · `pricePathDecimated` 없음 · `it(` 10 전부 통과.
