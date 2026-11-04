---
phase: quick-261104-umt
plan: 01
subsystem: webapp/ticks (틱뷰어 타임라인 차트)
status: complete
tags: [analytics, ticks, viewer, chart, tooltip, range-select, team, sketch-028]
requires:
  - sketch 028 결정(2026-11-04) — B 고정 띠 · Shift+끌기 구간 · 거울 매도선 · 판 높이 70
provides:
  - TickChartBand(고정 띠 B · 4칸 / 폰 2×2)
  - TickChartRange(구간 결과 줄)
  - tickBandAt · cumNetAt · tickGroupTableOf · tickRangeSumOf · fmtRangeDur(순수 모델)
  - dayStairs buy · sell · priceIdxAt · turnoverIdxBefore · yOfShare · TurnoverSeries.val0
affects:
  - /analytics/ticks 타임라인 카드(차트 307 / 222 · 띠 58 / 105 · 데스크톱 안내 줄)
tech-stack:
  added: []
  patterns:
    - 창 이동 잠금 ref(panLockRef)를 공용 훅 넷째 인자로 — 훅 무변경
    - 세션에 묶은 선택 상태를 effect 없이 파생(sel.session === session)
key-files:
  created:
    - webapp/src/components/ticks/tick-chart-band.tsx
    - webapp/src/components/ticks/tick-chart-range.tsx
  modified:
    - webapp/src/lib/ticks/team-model.ts
    - webapp/src/lib/ticks/tick-chart.ts
    - webapp/src/lib/ticks/tick-chart-tip.ts
    - webapp/src/components/ticks/tick-chart.tsx
    - webapp/src/lib/ticks/__tests__/team-model.test.ts
    - webapp/src/lib/ticks/__tests__/tick-chart.test.ts
    - webapp/src/lib/ticks/__tests__/tick-chart-tip.test.ts
    - webapp/src/components/ticks/__tests__/tick-chart.test.tsx
    - webapp/e2e/specs/ticks-viewer.spec.ts
decisions:
  - "고정 띠 B 는 차트 래퍼 밖(머리 줄 아래)에 두고 높이를 고정(데스크톱 58 · 폰 52×2) — 값이 넘치면 칸 안에서 자른다"
  - "구간 합계 금액은 넷째 판 누적 계열(팀 체결 조각 수신 시각) 차분으로, 건수는 구간 안 조각의 주문 수 — 10분 막대와 같은 수"
  - "tickOrderHoverOf 의 basePx 인자를 뺐다(표 상자는 기준가 등락률을 쓰지 않음 · 호출처 1곳)"
  - "TickChartRange 는 t0 · t1 을 따로 받지 않고 sum.t0 · sum.t1(정규화된 값)을 쓴다"
metrics:
  duration: "약 33분"
  completed: 2026-11-04
actuals:
  tokens: 30810
  tasks: 3
  commits: 3
plan_head_before: be3561577c49e021a49a557100eec26824847a0b
plan_head_after: 3cabd1153e203c598beb1e663dcc990337d42525
---

# Phase quick-261104-umt Plan 01: 틱뷰어 타임라인 스케치 028 채택안 Summary

판별 툴팁 대신 차트 위 높이 고정 4칸 띠(B)를 넣었다. 마우스를 올리면 그 시각 값, 떼면 현재 틱 값이다. 팀 주문 원 옆 상자는 주문마다 한 줄인 표로 바꿨다. Shift+끌기를 하면 차트 아래 줄에 그 구간의 팀 매수 · 매도 · 순매수 합계가 나온다. 순매수 판에는 매수 누적 선과 0선 아래 거울 매도 누적 선을 넣었고, 판 높이를 70(폰 50)으로 키웠다(차트 307 / 222).

## Tasks

| Task | 이름 | Commit | 핵심 파일 |
| ---- | ---- | ------ | --------- |
| 1 (tracer) | 고정 띠 B 끝에서 끝까지 (결정 ①) | 8abc24be | team-model.ts · tick-chart-tip.ts(tickBandAt · cumNetAt) · tick-chart-band.tsx · tick-chart.tsx |
| 2 | 거울선 · 판 높이 70 · 묶음 표 상자 · 마우스 세로선 (결정 ② · ④) | 39054ded | tick-chart.ts(H2 70 · dayNetRangeOf · pick · yOfShare) · tick-chart-tip.ts(tickGroupTableOf) · tick-chart.tsx · e2e |
| 3 | Shift+끌기 구간 합계 (결정 ③) | 3cabd115 | tick-chart.ts(turnoverIdxBefore · val0) · tick-chart-tip.ts(tickRangeSumOf · fmtRangeDur) · tick-chart-range.tsx · tick-chart.tsx |

Tracer 확인: Task 1 의 `<verify>` 를 다시 처음부터 끝까지 돌렸다. 세 테스트 파일 · typecheck · grep 2개가 모두 통과한 뒤 Task 2 로 넘어갔다.

## 검증

- `vitest --maxWorkers=2 src/lib/ticks src/components/ticks src/hooks src/components/analytics`: 46파일 776테스트 통과(매집감지 차트 · 공용 훅 회귀 0)
- `npm run typecheck`(tsc 본체 + e2e tsconfig): 통과
- `eslint src/components/ticks src/lib/ticks`: error 0 · 기존 warning 1건(use-tick-live.test.tsx `_omit`)은 그대로
- `git diff --quiet HEAD -- use-chart-view.ts accum-chart.tsx lib/accum-chart.ts`: 종료 0(바이트 무변경)
- e2e `ticks-viewer.spec.ts` 전체(`--workers=1`): 28/28 통과. 「차트 —」 3건 포함, 높이 307 확인
- 이동 잠금 테스트가 실제로 잠금을 검사하는지 따로 확인했다. 같은 테스트를 Shift 없이 끌도록 잠시 바꾸면 커서 x 가 바뀐다(되돌림 · 커밋 안 함)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tick-chart.test.ts 계단 리터럴에 buy · sell 을 Task 1 에서 추가**
- **Found during:** Task 1 typecheck
- **Issue:** dayStairs 타입에 buy · sell 이 생기자, Task 2 소관인 tick-chart.test.ts 의 리터럴 계단이 tsc 에서 실패했다
- **Fix:** 리터럴에 `buy` · `sell` 만 먼저 넣었다(단언 변경은 Task 2 에서)
- **Files modified:** webapp/src/lib/ticks/__tests__/tick-chart.test.ts
- **Commit:** 8abc24be

**2. [Rule 1 - Bug 예방] 구간 끌기 끝값을 ref 에 둔다**
- **Found during:** Task 3
- **Issue:** pointerup 시점에 draft 상태가 아직 반영되지 않았을 수 있다(연속 이벤트 배치)
- **Fix:** `rangeDownRef.t1` 에 마지막 시각을 함께 저장하고, 확정할 때 그 값을 쓴다
- **Commit:** 3cabd115

**3. 인터페이스 소폭 조정(동작 무관)**
- `tickOrderHoverOf(model, basePx, circles, seed, view)` 를 `tickOrderHoverOf(model, circles, seed, view)` 로 바꿨다. 쓰지 않는 인자를 뺐고, 호출처는 tick-chart.tsx 1곳이다
- `TickChartRange` props 를 `{ sum, dragging, onClear }` 로 줄였다. 구간 시각은 `sum.t0 · sum.t1`(정규화된 값)을 쓴다
- 컴포넌트 테스트의 끌기 도우미는 pointerup 뒤에 click 을 한 번 더 낸다. 브라우저가 끌기 뒤에도 click 을 내는 동작을 재현해, 끌기 문턱이 그 click 을 거르는지까지 검사한다

### 커밋 가드 메모
- GSD 기본 가드는 master 를 보호 브랜치로 본다. 그러나 이 프로젝트는 `branching_strategy: none` 이고 작업 규칙도 「작업은 master 에서」다. 오케스트레이터 지시(메인 작업 트리 순차 실행)에 따라 master 에 경로를 지정해 커밋했다. push 는 하지 않았다.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: webapp/src/components/ticks/tick-chart-band.tsx
- FOUND: webapp/src/components/ticks/tick-chart-range.tsx
- FOUND: 8abc24be · 39054ded · 3cabd115 (HEAD 조상)
