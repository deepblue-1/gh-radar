---
phase: 42-tick-chart-candle-overlay
plan: 05
subsystem: webapp/ticks
status: complete
tags: [tick-viewer, candle-chart, svg, returns, tdd, vitest]
requires:
  - phase: 42-01
    provides: CandleFrame · CandlePanels(yRa · yRb) · candlePanelsOf · CANDLE_CHART
  - phase: 42-02
    provides: ReturnPoint · ReturnScales · returnPathOf · fmtReturnTick · returnScalesOf · dayReturnPointsOf · cumReturnPointsOf
provides:
  - "webapp/src/components/ticks/candle-return-layer.tsx — CandleReturnLayer(수익률 판: 당일 · 누적 · 0% 한 줄 · 두 눈금 · 제목 · 빈 상태)"
  - "webapp/src/components/ticks/candle-lower-layers.tsx — CandleLowerLayers(순매수 · 10분 · 누적 거래대금 판, 선 차트와 같은 함수 · CandlePanels)"
affects: [42-06, 42-09, 42-10]
tech-stack:
  added: []
  patterns:
    - "그리기 층은 CandleFrame 하나를 받고, 계산은 lib 함수(candle-returns · tick-chart)가 한다"
    - "아래 판은 기존 tick-chart.ts 함수에 frame.P(CandlePanels)를 넘겨 새 y 에서 그대로 그린다(함수 수정 0)"
key-files:
  created:
    - webapp/src/components/ticks/candle-return-layer.tsx
    - webapp/src/components/ticks/candle-lower-layers.tsx
    - webapp/src/components/ticks/__tests__/candle-return-layer.test.tsx
    - webapp/src/components/ticks/__tests__/candle-lower-layers.test.tsx
  modified: []
key-decisions:
  - "수익률 판 「팀 체결 없음」 은 당일 값(null 아닌 유한수)도 없고 누적(yCum 과 값)도 없을 때만 쓴다. 당일이 없어도 누적이 있으면 누적 선과 왼쪽 눈금만 그린다"
  - "수익률 판 제목은 데스크톱이면 빈 상태여도 그린다(선 차트 판 제목도 늘 그린다)"
  - "CandleLowerLayers 는 파생 계산 전체를 useMemo 하나로 묶었다. 키는 session · accum · isToday · listingShares · view · x · P · plotW · bounds · endMs"
metrics:
  duration: "약 15분"
  completed: 2026-11-12
  tasks: 2
  files: 4
estimate:
  tokens: 55000
  tasks: 2
actuals:
  tokens: 7750
  tasks: 2
  commits: 4
plan_head_before: f49f70b878aff34219bb5c36522a8fccf4d57c58
plan_head_after: ac33dd3a6f9092a0abf711d4b76bd5fc9195e4ea
requirements-completed: [SC-4, SC-5, SC-6]
---

# Phase 42 Plan 05: 수익률 판 · 아래 세 판 그리기 층 Summary

봉 차트 수익률 판을 그리는 층을 만들었다. 당일 수익률은 보라 1.75 · 오른쪽 눈금, 누적 수익률은 회색 1.5 · 왼쪽 눈금이고, 두 선은 `scales.zeroY` 0% 선 하나를 같이 쓴다. 아래 세 판(순매수 · 10분 · 누적 거래대금) 층은 선 차트와 같은 `tick-chart.ts` 함수에 `CandlePanels` 를 넘겨 새 판 위치에 같은 모양으로 그린다. 두 층의 동작은 컴포넌트 테스트 20개로 고정했다.

## 층 계약(42-10 결선용)

```ts
// webapp/src/components/ticks/candle-return-layer.tsx
export interface CandleReturnLayerProps {
  frame: CandleFrame;
  day: readonly ReturnPoint[];   // dayReturnPointsOf
  cum: readonly ReturnPoint[];   // cumReturnPointsOf — 누적 없으면 []
  scales: ReturnScales;          // returnScalesOf — 호출부가 보기 창 안 점으로 만든다
  clipId: string;
}
export function CandleReturnLayer(props: CandleReturnLayerProps): JSX.Element;

// webapp/src/components/ticks/candle-lower-layers.tsx
export interface CandleLowerLayersProps {
  frame: CandleFrame;
  session: TickSession;
  accum?: TickOpenResponse['accum'];
  isToday: boolean;
  listingShares: number | null;
  clipId: string;
}
export function CandleLowerLayers(props: CandleLowerLayersProps): JSX.Element;
```

- **CandleReturnLayer data-slot:** `candle-return-layer` · `candle-ret-zero` · `candle-ret-cum` · `candle-ret-day` · `candle-ret-day-axis` · `candle-ret-cum-axis` · `candle-ret-title` · `candle-ret-empty`. 클립 id 는 `${clipId}-ret` 이고 범위는 `[L, yRa] ~ [xr, yRb]` 이다.
- **CandleLowerLayers data-slot:** `candle-lower-layers` · `candle-net-zero` · `candle-cum-path` · `candle-day-buy-path` · `candle-day-sell-path` · `candle-day-path` · `candle-bucket` · `candle-turnover-area` · `candle-team-share-path` · `candle-day-axis` · `candle-cum-axis` · `candle-bucket-max` · `candle-turnover-axis` · `candle-share-axis` · `candle-lower-title` · `candle-lower-empty`. 클립 id 는 `${clipId}-low` 이고 범위는 `[L, yRb] ~ [xr, y4b]` 이다.
- **42-10 이 지킬 것:** `dayReturnPointsOf` 는 커서 rec 가 보기 창 밖에 있어도 그 점을 넣는다. 그래서 `returnScalesOf` 에는 보기 창 `[t0, t1]` 안의 점만 걸러서 넘겨야 한다. 층에 넘기는 `day` 에는 창 밖 점이 섞여도 된다. 그림은 판 클립이 잘라 낸다.
- 시각 격자 · 장전 음영 · 빈 띠는 이 층에 없다. 다섯 판에 공통으로 걸리므로 컨테이너(`candle-chart.tsx`)가 그린다. 이 층 둘은 선 차트처럼 마우스를 받지 않는다(`pointerEvents="none"`).

## 태스크와 커밋

| Task | 이름 | 커밋 | 파일 |
|---|---|---|---|
| 1 RED | 수익률 판 층 실패 테스트 + 자리표 | dcee1e23 | candle-return-layer.test.tsx · candle-return-layer.tsx(자리표) |
| 1 GREEN | 수익률 판 층(당일 · 누적 · 0% · 두 눈금 · 제목 · 빈 상태) | d1526f2b | candle-return-layer.tsx |
| 2 RED | 아래 세 판 층 실패 테스트 + 자리표 | aa8eb8c6 | candle-lower-layers.test.tsx · candle-lower-layers.tsx(자리표) |
| 2 GREEN | 아래 세 판 층(선 차트 같은 함수 · CandlePanels) | ac33dd3a | candle-lower-layers.tsx |

REFACTOR 커밋은 없다(정리할 것이 없었다).

## 테스트 수

- `candle-return-layer.test.tsx` 10개 전부 통과. 내용: 두 선 순서 · 색 · 0% y · 누적 null 끊김 · 오른쪽 · 왼쪽 눈금 자리와 글자 · 누적 없을 때 · 판 제목 두 가지와 폰 · 빈 상태 셋. 점과 눈금은 42-02 함수(`dayReturnPointsOf` · `cumReturnPointsOf` · `returnScalesOf` · `fmtReturnTick`)로 만들었다.
- `candle-lower-layers.test.tsx` 10개 전부 통과. 내용: 0선이 231 ~ 301 안 · 당일 경로가 `teamDayStairsOf(CandlePanels)` 결과와 비트까지 같음 · 누적 계단과 축(과거 · 당일 · accum null) · 10분 막대가 판 안 · 축 글자가 선 차트 테스트 기대값과 같음(「1,718만0」 · 「100%0%」 · 시총 대비 %) · 「팀 체결 없음」 둘 · 데스크톱 판 제목 · 폰 치수.
- 검증: `vitest run` 두 파일 `--maxWorkers=2` 결과 20 passed. `pnpm --filter @gh-radar/webapp run typecheck` 통과. eslint(4파일) 출력 없음. `git diff --quiet b72dcd0f -- webapp/src/lib/ticks/tick-chart.ts` exit 0. 두 층 파일에서 `data-slot="tick-` 를 찾으면 0줄이다.

## TDD Gate Compliance

- Task 1 RED (dcee1e23): `vitest --reporter=tap-flat` exit 1, 10개 중 10개 실패. 대상 「빈 상태 > 팀 체결 없음 · 누적 [] → …」 이 `expected to have a length of 1 but got +0` 로 실패했고 `gsd-tools check tdd-red-evidence` 판정은 **RED_EVIDENCE_OK**(target_test_failed)였다. 의미 판정: 모듈 import 와 픽스처는 정상이었다(누적 null 끊김 테스트의 전제 단언 `cum.some(v === null)` 도 통과). 자리표가 빈 `<g>` 만 그려서 계획한 단언에서 실패한 것이다.
- Task 2 RED (aa8eb8c6): 10개 중 10개 실패. 대상 「팀 체결 있음 → 당일 · 매수 · 거울 매도 경로 …」 는 `candle-lower-layers` 1개와 `P.y2a` = 231 · `P.y2b` = 301 단언을 통과한 뒤 `candle-day-path` 0개에서 실패했다. 판정은 **RED_EVIDENCE_OK**였다. 의미 판정은 위와 같다(로드 · 구문 오류 아님).
- GREEN 커밋 d1526f2b · ac33dd3a 는 각각 자기 RED 커밋의 후손이다. 증거 파일은 커밋하지 않고 지웠다.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

없음. 자리표는 RED 커밋에만 있었고 GREEN 에서 모두 실제 구현으로 바꿨다. 층은 아직 `candle-chart.tsx` 에 결선하지 않았다. 결선은 플랜에 적힌 대로 42-10 몫이다.

## 실행 환경 메모

- 워크트리에서 `pnpm install --frozen-lockfile` 과 shared build 를 직접 실행했다. 테스트가 env 를 읽지 않아 env 파일은 복사하지 않았다.
- vitest 는 이 플랜의 두 파일만 `--maxWorkers=2` 로 돌렸다. 전체 스위트 · Playwright 는 돌리지 않았다.
- STATE.md · ROADMAP.md 는 손대지 않았다(오케스트레이터 몫). 배포 · push 도 하지 않았다.

## Self-Check: PASSED

- FOUND: webapp/src/components/ticks/candle-return-layer.tsx
- FOUND: webapp/src/components/ticks/candle-lower-layers.tsx
- FOUND: webapp/src/components/ticks/__tests__/candle-return-layer.test.tsx
- FOUND: webapp/src/components/ticks/__tests__/candle-lower-layers.test.tsx
- FOUND: dcee1e23 · d1526f2b · aa8eb8c6 · ac33dd3a (HEAD 의 조상)
