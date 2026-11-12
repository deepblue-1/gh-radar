---
phase: 42-tick-chart-candle-overlay
plan: 02
subsystem: webapp/ticks
status: complete
tags: [tick-viewer, candle-chart, returns, pure-functions, tdd]
requires: []
provides:
  - "webapp/src/lib/ticks/candle-returns.ts — 수익률 판 계산(당일 · 누적 · 두 눈금 0% 맞춤 · 경로 · 눈금 글자)"
affects: [42-05, 42-06, 42-10]
tech-stack:
  added: []
  patterns:
    - "당일 수익률 = 패널과 같은 teamKpiAt 를 점마다 호출(정의 복제 없음)"
    - "열 샘플(그림 폭 1px 열 끝 시각 · priceIdxAt) + 팀 체결 rec + 커서 rec"
key-files:
  created:
    - webapp/src/lib/ticks/candle-returns.ts
    - webapp/src/lib/ticks/__tests__/candle-returns.test.ts
  modified: []
decisions:
  - "당일 수익률 점은 같은 t 일 때 거래소순(exPos)으로 정렬 — 같은 수신 시각 여러 rec 의 세로 꺾임 순서를 패널 자르기 순서와 맞춤"
  - "누적 수익률 열 점의 t = 그 가격 점 수신 ms(열 끝 시각 아님) · 누적 평단 계단 시각 점이 사이의 평단 변화를 메움 · 그 시각 가격이 없으면 v null · rec −1"
  - "returnScalesOf 는 받은 점 전부(null 제외)로 범위를 잰다 — 커서 rec 가 창 밖이면 그 점도 범위에 들어가므로 호출부(42-05)가 보기 창 점만 넘긴다"
  - "returnPathOf 는 점 하나뿐인 조각(앞뒤 null)을 그리지 않는다 · 좌표 소수 1자리"
  - "fmtReturnTick 은 절댓값 반올림 후 부호를 붙인다(−0.00004 → 「0.0%」) · 수가 아니면 「—」"
metrics:
  duration: "약 20분"
  completed: 2026-11-12
  tasks: 2
  files: 2
estimate:
  tokens: 40000
  tasks: 2
actuals:
  tokens: 5242
  tasks: 2
  commits: 4
plan_head_before: 28959b35b35790d1a80c3c05c85b608b8c71642e
plan_head_after: 71443005488c0c8535328edc65303319a6cf9ca6
---

# Phase 42 Plan 02: 수익률 판 계산 Summary

패널 「평단 대비 수익률」 과 같은 `teamKpiAt` 를 열 · 팀 체결 · 커서 rec 마다 부르는 당일 수익률 시계열, (가격 − 누적 평단) ÷ 누적 평단 누적 수익률(미실현), z 를 공유하는 두 눈금 0% 맞춤, 끊김 경로, 「+3.2%」 눈금 글자를 순수 함수 하나로 묶고 17개 단위 테스트로 잠갔다.

## Export 시그니처

```ts
export interface ReturnPoint { t: number; v: number | null; rec: number }
export function dayReturnAt(session: TickSession, rec: number): number | null
export function dayReturnPointsOf(session: TickSession, view: View, plotW: number, cursorRec: number): ReturnPoint[]
export function cumAvgAt(pts: readonly PricePoint[], t: number): number | null
export function cumReturnPointsOf(session: TickSession, view: View, plotW: number, cumAvg: readonly PricePoint[]): ReturnPoint[]
export interface ReturnScales { top; bottom; z; zeroY; yDay; yCum; dayTop; dayBottom; cumTop; cumBottom }
export function returnScalesOf(day: readonly ReturnPoint[], cum: readonly ReturnPoint[], yRa: number, yRb: number): ReturnScales
export function returnPathOf(pts: readonly ReturnPoint[], x: (t: number) => number, y: (v: number) => number): string
export function fmtReturnTick(v: number): string
export const RETURN_PAD_RATIO = 0.12, RETURN_PAD_ABS = 0.0005, RETURN_Z_MIN = 0.15, RETURN_Z_MAX = 0.85
```

`View` · `PricePoint` 는 `@/lib/accum-chart` 타입이고, 42-01 의 `candle-chart.ts` 는 import 하지 않는다.

### `ReturnScales` 필드

| 필드 | 뜻 |
|---|---|
| `top` · `bottom` | 그림 영역 `[yRa + 4, yRb − 3]` |
| `z` | 0% 위쪽 높이 비율. 두 선 z 중 큰 쪽을 0.15 ~ 0.85 로 묶은 값이고, 점 있는 선이 없으면 0.5 |
| `zeroY` | `top + z × (bottom − top)` 로, 0% 선 하나를 두 선이 같이 쓴다 (`yDay(0) === yCum(0) === zeroY`) |
| `yDay` | 당일 y 함수. 점이 없어도 있다(여유 절댓값만으로 단위를 잡는다) |
| `yCum` | 누적 y 함수. 누적 점이 없으면 null |
| `dayTop` · `dayBottom` | 판 위 끝 · 아래 끝의 당일 값(`z × u` · `−(1 − z) × u`) |
| `cumTop` · `cumBottom` | 같은 값의 누적판. 누적이 없으면 null |

## 태스크와 커밋

| Task | 이름 | 커밋 | 파일 |
|---|---|---|---|
| 1 RED | 당일 수익률 실패 테스트(자리표 대상 5건 실패) | 93038be0 | candle-returns.test.ts · candle-returns.ts(자리표) |
| 1 GREEN | 당일 수익률 시계열 — `teamKpiAt` 열 · 팀 체결 · 커서 rec | 0e90a9f3 | candle-returns.ts · candle-returns.test.ts |
| 2 RED | 누적 · 두 눈금 · 경로 · 눈금 글자 실패 테스트(8건 실패) | 79d22429 | candle-returns.test.ts · candle-returns.ts(자리표) |
| 2 GREEN | 누적 수익률 · 두 눈금 0% 맞춤 · 경로 · 눈금 글자 | 71443005 | candle-returns.ts · candle-returns.test.ts |

## 테스트 수

`candle-returns.test.ts` 는 17개이고 전부 통과했다. 기준(14 이상)을 넘는다.
- 「당일 수익률」 8개: 전제 · teamKpiAt 비트 일치 · 커서 rec · 창 안 팀 체결 · 첫 매수 전 null · 팀 체결 없음 [] · 3px 열 상한 · dayReturnAt
- 「누적 수익률」 3개: cumAvgAt 계단 · 미실현 0.1 · px 0 끊김과 계단 시각 점
- 「두 눈금」 5개: 상수 · z 0.85 묶음과 0% 한 줄 · 묶음 안과 0.15 묶음 · 빈 선 · returnPathOf
- 「눈금 글자」 1개

검증 결과: `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/candle-returns.test.ts --maxWorkers=2` 에서 17 passed. `pnpm --filter @gh-radar/webapp run typecheck` 통과, eslint(두 파일) 출력 없음. `git diff --quiet b72dcd0f -- webapp/src/lib/ticks/team-model.ts webapp/src/lib/ticks/tick-chart.ts packages/shared/src/ticks/team-pnl.ts` 는 exit 0 이다.

## TDD Gate Compliance

- Task 1 RED (93038be0): 대상 테스트 「커서 rec 를 주면 그 rec 의 점이 반드시 있고 값 = 패널 계산 …」 가 `expected [] to have a length of 1 but got +0` 로 실패했다. vitest `tap-flat` 출력을 `gsd-tools check tdd-red-evidence` 에 넣어 `RED_EVIDENCE_OK` 를 받았다. 의미 판정: import 는 성공했고, 자리표가 빈 배열을 내서 계획한 단언에서 실패했다(로드 · 구문 오류 아님).
- Task 2 RED (79d22429): 대상 테스트 「당일 위 0.03 · 누적 위 0.25 아래 0.02 → z …」 가 `expected +0 to be 0.85` 로 실패했고 `RED_EVIDENCE_OK` 를 받았다. 의미 판정: 자리표 z 0 이 계획한 단언에서 걸렸다.
- GREEN 0e90a9f3 · 71443005 는 각각 자기 RED 커밋의 후손이다. REFACTOR 커밋은 없다(필요 없었음).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 테스트 픽스처 — 일반 체결이 팀으로 판정됨**
- **Found during:** Task 1 RED
- **Issue:** 앞뒤에 넣은 일반 체결(seq 99 · 109)과 「팀 없음」 세션 체결이 호가 a1/b1 0(= 0/0 단독)이라 shared `isTeamKind` 에서 팀으로 판정됐다.
- **Fix:** 그 체결들에 a1 · b1 호가를 넣어 일반 주문으로 만들었다. 「전제 — 팀 체결 4건」 테스트가 이 조건을 지킨다.
- **Files modified:** webapp/src/lib/ticks/__tests__/candle-returns.test.ts
- **Commit:** 93038be0

**2. [Rule 1 - Bug] 테스트 — 「창 밖 팀 체결은 넣지 않는다」 단언이 열 샘플과 겹침**
- **Found during:** Task 1 GREEN
- **Issue:** 창 [6ms, 10ms] 의 첫 열 샘플은 「열 끝 시각 이하 마지막 틱」 이라 5ms 팀 매도 rec 를 정당하게 집는다. 사양대로 동작한 것이고 단언이 틀렸다.
- **Fix:** 창을 [8.5ms, 10ms] 로 바꿔 열 샘플이 일반 체결 109 하나뿐임을 함께 단언했다.
- **Commit:** 0e90a9f3

**3. [Rule 3 - Blocking] 테스트 import 중복 줄**
- **Found during:** Task 2 GREEN 타입 검사
- **Issue:** Task 2 테스트를 붙이면서 `@/test-fixtures/tick-synth` import 가 두 번 들어가 `TS2300 Duplicate identifier` 가 났다. vitest(esbuild)는 통과했지만 tsc 가 막았다.
- **Fix:** 중복 줄을 지우고 import 순서를 정리했다.
- **Commit:** 71443005

## 계약 메모(뒤 플랜용)

- 이름 · 시그니처는 42-01 「Artifacts」 표 그대로이고 계약 변경은 없다.
- 42-05(수익률 판 그리기)는 `returnScalesOf` 에 보기 창 안 점만 넘겨야 한다. `dayReturnPointsOf` 는 커서 rec 가 창 밖이어도 그 점을 넣는다(값 띠와 같은 값을 쓰기 위해서).
- `cumReturnPointsOf` 의 점은 열 샘플 + 계단 시각이라, 같은 t 점 두 개가 같은 값으로 나올 수 있다. 경로에는 영향이 없다.

## Known Stubs

없음. 자리표는 RED 커밋에만 있었고 GREEN 에서 모두 실제 구현으로 바뀌었다.

## Self-Check: PASSED

- FOUND: webapp/src/lib/ticks/candle-returns.ts
- FOUND: webapp/src/lib/ticks/__tests__/candle-returns.test.ts
- FOUND: 93038be0 · 0e90a9f3 · 79d22429 · 71443005 (HEAD 의 조상)
