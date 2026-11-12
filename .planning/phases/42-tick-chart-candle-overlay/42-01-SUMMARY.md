---
phase: 42-tick-chart-candle-overlay
plan: 01
subsystem: ui
tags: [tick-viewer, candle-chart, svg, supabase-rpc, pgtap, vitest]

requires:
  - phase: 37-tick-viewer
    provides: tick_open_for_user RPC · TickSession · 선 차트 기하(lib/ticks/tick-chart.ts) · useChartView
provides:
  - "RPC tick_open_for_user 의 accum.avg_px(마이그레이션 20261113100000 · 원격 미적용 — 42-11)"
  - "shared TickOpenResponse.accum.avg_px?: unknown"
  - "lib/ticks/candle-chart.ts — CANDLE_CHART · CandlePanels · CandleFrame · Candles · candlesOf(6단위 · 세션 · 단위당 1회) · candleIdxAt · candleRangeOf · candleYOf · candlePathsOf · cumAvgPointsOf · cumAvgPathOf"
  - "CandlePriceLayer(children 자리 = 팀 원 · 우리 점) · CandleChart · ChartKindSwitch"
  - "tick-chart.tsx titleAddon 선택 입력 · OwnDiamond · TickGroupBox export"
  - "tick-viewer 선 차트 ↔ 봉 차트 조건부 렌더(처음 선 차트)"
affects: [42-02, 42-03, 42-04, 42-05, 42-06, 42-07, 42-08, 42-09, 42-10, 42-11]

actuals:
  tokens: 17300
  tasks: 2
  commits: 4
plan_head_before: 28959b35b35790d1a80c3c05c85b608b8c71642e
plan_head_after: b73b1782e50e116bb32729308cee1ec47af9b059

tech-stack:
  added: []
  patterns:
    - "CandlePanels = TickPanels 같은 키 + yCb · yRa · yRb — 기존 판 함수가 새 y 에서 그대로 돈다"
    - "봉 층 = 방향별 path 4개(useMemo · x/y 는 값 근거로 메모) — 봉마다 요소를 만들지 않는다"
    - "분봉 캐시 WeakMap<TickSession, { base, byUnit }> — 상위 단위는 1분봉에서 08:00 정시 칸으로 묶음"

key-files:
  created:
    - supabase/migrations/20261113100000_tick_open_accum_avg_px.sql
    - webapp/src/lib/ticks/candle-chart.ts
    - webapp/src/lib/ticks/__tests__/candle-chart.test.ts
    - webapp/src/components/ticks/candle-price-layer.tsx
    - webapp/src/components/ticks/candle-chart.tsx
    - webapp/src/components/ticks/chart-kind-switch.tsx
    - webapp/src/components/ticks/__tests__/chart-kind-switch.test.tsx
  modified:
    - supabase/tests/tick_viewer.test.sql
    - packages/shared/src/tick-api.ts
    - server/tests/routes/ticks.test.ts
    - webapp/src/components/ticks/tick-chart.tsx
    - webapp/src/components/ticks/tick-viewer.tsx

key-decisions:
  - "누적 평단 경로(cumAvgPathOf)는 avgPxPathOf 와 달리 클램프하지 않는다 — 범위 밖은 클립이 자르고 가장자리 글자(D-16 · 42-04)가 대신한다"
  - "candleRangeOf 는 창과 겹치는 봉이 없고 창 앞 봉도 없으면 첫 봉 종가 하나로 범위를 잡는다"
  - "candlePathsOf 꼬리는 칸 폭이 3px 미만이어도 그린다(몸통만 생략)"
  - "CandleChart 는 트레이서 범위만 결선 — onSeekMs · onJumpRec · own · onOwnJump · onOwnFillLine · listingShares 는 props 로 받되 42-05 · 42-09 가 쓴다"

patterns-established:
  - "새 차트 data-slot 은 candle- 접두(기존 tick-chart* 셀렉터가 봉 차트를 잡지 않게)"
  - "두 차트는 tick-viewer 에서 조건부 렌더 — 함께 마운트해 숨기지 않는다"

requirements-completed: [SC-1, SC-2, SC-5, SC-7]

coverage:
  - id: D1
    description: "틱 열기 RPC 가 accum 에 avg_px 를 payload 그대로 싣는다(키 없음 → null · STABLE · 권한 3줄 유지)"
    requirement: SC-5
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql (141/141 ok)"
        status: pass
    human_judgment: false
  - id: D2
    description: "server 가 accum.avg_px 를 모양 검사 없이 그대로 넘긴다(server 소스 무변경)"
    requirement: SC-5
    verification:
      - kind: unit
        ref: "server/tests/routes/ticks.test.ts (34 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "틱뷰어 제목 줄 「선 차트 | 봉 차트」 스위치 · 봉 차트 420 · 봉 · 누적 평단 긴 점선 · 당일/미등록이면 누적 없음 · 선 차트 기존 테스트 무변 통과"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/chart-kind-switch.test.tsx (3 passed)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-chart.test.tsx (29 passed · 수정 없음)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx (수정 없음 · 통과)"
        status: pass
    human_judgment: false
  - id: D4
    description: "분봉 1 · 5 · 10 · 15 · 30 · 60분 시 · 고 · 저 · 종 · 거래대금 = 직접 집계 · 세션 · 단위당 1회 캐시 · candleIdxAt · 판 치수 · 누적 · 봉 경로"
    requirement: SC-2
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/candle-chart.test.ts (18 passed · -t 집계 10 · -t 캐시 1 · -t 누적 3)"
        status: pass
    human_judgment: false
  - id: D5
    description: "봉 차트 실제 모양(봉 색 · 누적 평단 점선 · 폰 303 배치)이 목업과 같다"
    verification: []
    human_judgment: true
    rationale: "시각 판단 — 42-11 UAT 에서 실기기로 확인(이 플랜은 Playwright 금지)"

duration: 35min
completed: 2026-11-12
status: complete
---

# Phase 42 Plan 01: 봉 차트 트레이서 · 분봉 집계 Summary

**틱 열기 RPC `accum.avg_px` 한 키가 shared 타입 · server 통과를 거쳐 새 순수 SVG 봉 차트(1분봉 + 회색 긴 점선 누적 평단)까지 이어지고, 차트 카드 제목 줄 「선 차트 | 봉 차트」 스위치로 오가며, 분봉 6단위 집계가 직접 집계 오라클과 `toBe` 로 같다는 것이 테스트로 잠겼다.**

## Performance

- **Duration:** 약 35분
- **Completed:** 2026-11-12
- **Tasks:** 2(Task 1 = 조각 A · B 두 커밋)
- **Files:** 생성 7 · 수정 5

## Accomplishments

- 마이그레이션 **`20261113100000_tick_open_accum_avg_px.sql`**(최종 이름 그대로 — 시작 때 최신 `20261112500000` 보다 뒤 · 본문 원천 `20261103210000` 확인) — accum 줄과 COMMENT 만 다르고(주석 제외 diff 4줄) `STABLE` · `SECURITY INVOKER` · `SET search_path` · 권한 3줄 그대로.
- pgTAP `tick_viewer.test.sql` `plan(141)` — 단언 3 추가(키 없음 → JSON null · payload 그대로 · STABLE 유지) · 로컬 컨테이너 141/141 ok.
- `CANDLE_CHART` · `candlePanelsOf` · `CandleFrame` · 분봉 집계 · 가격 범위 · 봉 경로 · 누적 평단 점 · 경로 순수 함수와 `CandlePriceLayer` · `CandleChart` · `ChartKindSwitch` 컴포넌트.
- `tick-chart.tsx` diff = `titleAddon` 선택 입력 + `export` 두 단어(7 추가 · 3 삭제) — 기존 `tick-chart.test.tsx` 수정 없이 통과.

## Task Commits

1. **Task 1 조각 A(DB · shared · server 테스트)** — `403e8c85` (feat)
2. **Task 1 조각 B(webapp 7파일)** — `7b699b02` (feat)
3. **Task 2 RED** — `9baed77d` (test)
4. **Task 2 GREEN** — `b73b1782` (feat)

REFACTOR 커밋 없음(정리할 것 없음).

## 뒤 플랜이 읽는 실제 시그니처(계약)

```ts
// webapp/src/lib/ticks/candle-chart.ts
export const CANDLE_CHART = {
  desktop: { TOP: 7, H1: 160, AMT: 32, GAP: 7, HR: 50, H2: 70, H3: 40, H4: 50, LB: 15, H: 420 },
  phone:   { TOP: 0, H1: 110, AMT: 22, GAP: 7, HR: 36, H2: 50, H3: 28, H4: 36, LB: 15, H: 303 },
} as const;
export type CandleDims = (typeof CANDLE_CHART)['desktop'] | (typeof CANDLE_CHART)['phone'];
export interface CandlePanels extends TickPanels { yCb: number; yRa: number; yRb: number }
export interface CandleFrame {
  W: number; P: CandlePanels; L: number; xr: number; plotW: number; phone: boolean;
  view: View; x: (t: number) => number; bounds: TickBounds; endMs: number;
}
export type CandleUnit = 1 | 5 | 10 | 15 | 30 | 60;
export interface Candles { unit: CandleUnit; n: number; t0; o; h; l; c; amt: Float64Array }
export function candlesOf(session: TickSession, unit: CandleUnit): Candles;   // 세션 · 단위당 같은 객체
export function candleBaseOf(session: TickSession): Candles;                  // === candlesOf(s, 1)
export function candleIdxAt(c: Candles, t: number): number;                   // 칸 밖 −1
export function candleRangeOf(c: Candles, view: View): TickPriceRange;
export function candleYOf(range: TickPriceRange, P: CandlePanels): (px: number) => number;
export function candlePathsOf(c, view, x, y): CandlePaths;                    // { upBody, downBody, upWick, downWick }
export function cumAvgPointsOf(accum: TickOpenResponse['accum'] | null | undefined, isToday: boolean): PricePoint[];
export function cumAvgPathOf(pts, x, y, T0: number, endMs: number): string;

// webapp/src/components/ticks/candle-price-layer.tsx
export interface CandlePriceLayerProps {
  frame: CandleFrame; candles: Candles; range: TickPriceRange; y: (px: number) => number;
  cumAvg: readonly PricePoint[]; clipId: string; children?: ReactNode;  // children = 가격 판 높이 클립 안(팀 원 · 우리 점)
}

// webapp/src/components/ticks/candle-chart.tsx
export interface CandleChartProps {
  session; accum?; isToday?; cursorRec; onSeekMs; onJumpRec; listingShares?;
  height?: 420 | 303; own?; onOwnJump?; onOwnFillLine?;
  titleAddon?: (phone: boolean) => ReactNode; className?;
}

// webapp/src/components/ticks/chart-kind-switch.tsx
export type ChartKind = 'line' | 'candle';
export function ChartKindSwitch({ value, onChange, phone }): JSX.Element;
```

- data-slot: `candle-chart` · `candle-chart-wrap` · `candle-chart-svg`(`data-dims`) · `candle-chart-span` · `candle-pre-shade` · `candle-gap-band` · `candle-vi-band` · `candle-price-layer` · `candle-wick-up/down` · `candle-body-up/down` · `candle-cum-avg` · `candle-price-overlay` · `candle-px-axis` · `candle-chart-cursor` · `chart-kind-switch`.
- `tick-viewer.tsx` 의 `const [chartKind, setChartKind] = useState<ChartKind>('line')` 가 42-08 이 `useChartKind` 로 바꿀 자리 · `kindAddon` 이 두 차트 공통 `titleAddon`.
- 계약 변경 없음(플랜 「Artifacts」 이름 그대로).

## 테스트 수

- pgTAP `tick_viewer.test.sql` 141(새 단언 3)
- server `tests/routes/ticks.test.ts` 34
- webapp `chart-kind-switch.test.tsx` 3 · `candle-chart.test.ts` 18 · 기존 `tick-chart.test.tsx` 29 · `tick-viewer-live.test.tsx` 통과(둘 다 수정 없음)

## TDD Gate Compliance(Task 2)

- RED `9baed77d` → GREEN `b73b1782` 순서 지킴.
- RED 증거: `vitest run … --reporter=tap-flat` exit 1 · 18 중 11 실패 · `gsd-tools check tdd-red-evidence` = **RED_EVIDENCE_OK**(target_test_failed · 대상 「집계 > 5분봉 …」). semanticAssessment: 모듈은 정상 로드됐고(7건 통과) 대상 테스트가 `candlesOf is not a function` — 계획한 기능(단위별 집계 · candleIdxAt)이 없어서 실패한 것이지 문법 · 픽스처 · 수집 오류가 아니다. 판 치수 · 누적 · 봉 경로 7건은 Task 1 코드라 RED 때도 통과(정상). 증거 파일은 커밋하지 않았다.

## Decisions Made

- 위 frontmatter `key-decisions` 4건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2 테스트의 6단위 오라클 케이스를 단위별 `it(` 로 펼침**
- **Found during:** Task 2 수용 기준 확인
- **Issue:** 처음엔 `for (unit of CANDLE_UNITS) it(…)` 한 줄이라 수용 기준 `grep -c "it("` ≥ 15 가 13 으로 나왔다(실행 시 테스트 수는 18).
- **Fix:** 공통 helper `vsOracle(unit)` + 단위별 이름이 소스에 그대로 보이는 `it(` 6줄. 실행 18건 그대로.
- **Files modified:** webapp/src/lib/ticks/__tests__/candle-chart.test.ts
- **Commit:** b73b1782

**Total deviations:** 1 auto-fixed(Rule 3). **Impact:** 테스트 표기만 — 동작 무변.

## 실행 환경 메모

- 워크트리라 `pnpm install --frozen-lockfile` 직접 실행 · env 파일 복사 불필요(테스트가 env 를 읽지 않음).
- pgTAP 실행함(Docker · 로컬 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` 있음) — 원격 DB 접촉 0.
- 원격 적용(`supabase db push`) · server 배포 · push 는 하지 않았다(42-11).
- STATE.md · ROADMAP.md 는 손대지 않았다(오케스트레이터 몫).

## Known Stubs

- `webapp/src/components/ticks/candle-chart.tsx` — `onSeekMs` · `onJumpRec` · `own` · `onOwnJump` · `onOwnFillLine` · `listingShares` 는 props 로 받기만 하고 아직 쓰지 않는다. 플랜이 의도한 트레이서 빈칸이다(클릭 점프 · 원 · 우리 점 = 42-09, 넷째 판 시총 대비 = 42-05, 결선 = 42-10). 봉 단위는 1분봉 고정(자동 · 메뉴 = 42-04 · 42-07 · 42-10). 이 플랜의 목표(한 길 + 집계)는 막지 않는다.

## Issues Encountered

- `chart-kind-switch.test.tsx` 실행 때 React `act(...)` 경고 1줄(뷰어가 여는 `fetchTickOwn` 비동기 응답) — 실패 아님 · 기존 뷰어 테스트와 같은 성질.

## Next Phase Readiness

- Wave 2 플랜(42-02 ~ 42-07)이 `CandleFrame` · `CandlePanels` · `candlesOf` · `CandlePriceLayer` children 자리 · `titleAddon` 계약을 그대로 읽을 수 있다.

## Self-Check: PASSED

- 생성 파일 7개 존재 확인 · 커밋 403e8c85 · 7b699b02 · 9baed77d · b73b1782 모두 HEAD 조상.
- Task 1 수용 기준 전부 통과(마이그레이션 grep · 권한 3줄 · 본문 diff 4 ≤ 6 · plan(141) · avg_px grep · Phase 42 커밋 필터 양성 대조 `403e8c85` / server/src 0 · titleAddon 3 · export 두 줄 · tick-chart.tsx 삭제 3 ≤ 3 · 지키는 파일 diff 0 · CandleChart 2 · ChartKindSwitch 2 · pricePathDecimated 없음 · tick-chart slot 없음 · lightweight-charts import 없음).
- Task 2 수용 기준 전부 통과(아홉 함수 export · `it(` 18 · describe 집계 · 캐시 · 누적 · `-t` 필터 각각 10 · 1 · 3 통과).
