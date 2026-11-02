---
phase: 37-tick-viewer
plan: 14
subsystem: webapp
status: complete
tags: [tick-viewer, chart, svg, team-pnl, golden, members-b9, nxt, minViewMs, playwright]

requires:
  - phase: 37-03
    provides: "teamFillsOf · buildPnlPrefix · fillsUpTo · pnlAt · teamPnlOf · 천일 10/14 골든(chunil-1014-a3.ticks.zst · chunil-1014.pnl.json)"
  - phase: 37-05
    provides: "viSpansOf · lastB9Of · memberTableAt · TEAM_MEMBER_LABEL"
  - phase: 37-10
    provides: "TickSession · useTickCursor(seekNs · jumpToRec) · TickViewer HTS_PANES"
  - phase: 37-13
    provides: "세션 주문 판정(orders · teamOfRec · orderOfRec · orderEndPos · lastA3) · 오른쪽 열 tick-side 격자 · 폰 「버스트 · 팀」 탭"
provides:
  - "clampView(v, T0, T2000, minViewMs = MIN_VIEW_MS) · useChartView({ …, minViewMs? }) · ChartViewControl.minViewMs · useChartGestures 의 minViewMs 전달"
  - "lib/ticks/tick-chart.ts — TICK_CHART · tickPanelsOf · tickBoundsOf · msOfNs · xOfTick · tOfTick · cursorXOf · tickTicksOf · priceSeriesOf · decimatedIdxOf · pricePathDecimated · tickPriceRangeOf · yOfTickPrice · lastTradeMsOfSession · lastRecvMsOf · yOfNet · dayNetRangeOf · cumPointsOf · cumNetRangeOf · teamDayStairsOf · cumStairsOf · TEAM_BUCKETS · teamBucketsOf · bucketMaxOfModel · viBandsOf · teamAvgPathOf"
  - "lib/ticks/team-model.ts — TeamModel · TeamOrderPoint · TeamKpi · buildTeamModel · teamKpiAt · teamCirclesOf"
  - "TickSession.team(세션 생성 때 한 번)"
  - "components/ticks: TickChart(3판 · 커서 · 클릭 점프 · 1분/10초 · + − 0) · TickTeamPanel(KPI · 5창구 · 캡션)"
  - "TickViewer props accum · isToday(페이지가 열기 응답에서 넘김)"
  - "테스트 픽스처 tickFixtureBytes · tickFixtureJson · b9Msg 금액(선택)"
affects: [37-16, 37-19]

actuals:
  tokens: 30600       # chars/4 over 실현 diff(webapp 122,310자)
  tasks: 3
  commits: 4          # MEASURED: git rev-list --count 54c34bee..7fa0a186 (SUMMARY 커밋 제외)
plan_head_before: 54c34bee9cc8edaec173baf422ff735bb96d90a2
plan_head_after: 7fa0a186fc9c59dc855702364e58663d5dc9ee86

tech-stack:
  added: []
  patterns:
    - "보기 창 훅은 최소 창을 인자로 받는다(기본 = 매집감지 10분) — 같은 휠 · 끌기 · 핀치 · 키 코드를 틱 뷰어가 10초로 재사용"
    - "가격 선 = 수신순 A3 계열(세션당 WeakMap 한 번) → 보이는 창만 이진 탐색 → 픽셀 열마다 첫 · 최소 · 최대 · 끝 4점"
    - "팀 손익 선택 틱 = 커서 이하(거래소순) 마지막 A3 까지 본 체결 시각 누적 최댓값으로 fillsUpTo → pnlAt(shared 골든 함수 그대로)"
    - "차트 x 는 전부 수신 시각(커서 · 가격 · 원 · 계단 · 막대 · VI) — ns → ms 는 µs 정수로 자른 뒤 나눈다(2^53 넘김 방지)"
    - "클릭 vs 끌기 = pointerdown 좌표 기억 → click 에서 4px 문턱 · 원 판정은 pointerdown 대상(포인터 캡처 뒤 click 대상은 svg)"

key-files:
  created:
    - webapp/src/lib/ticks/tick-chart.ts
    - webapp/src/lib/ticks/team-model.ts
    - webapp/src/components/ticks/tick-chart.tsx
    - webapp/src/components/ticks/tick-team-panel.tsx
    - webapp/src/lib/ticks/__tests__/tick-chart.test.ts
    - webapp/src/lib/ticks/__tests__/team-model.test.ts
    - webapp/src/components/ticks/__tests__/tick-chart.test.tsx
    - webapp/src/components/ticks/__tests__/tick-team-panel.test.tsx
    - .planning/phases/37-tick-viewer/37-14-red-evidence.json
  modified:
    - webapp/src/lib/accum-chart.ts
    - webapp/src/hooks/use-chart-view.ts
    - webapp/src/hooks/__tests__/use-chart-view.test.tsx
    - webapp/src/lib/__tests__/accum-chart.test.ts
    - webapp/src/lib/ticks/tick-session.ts
    - webapp/src/components/ticks/tick-viewer.tsx
    - webapp/src/components/ticks/tick-viewer-page.tsx
    - webapp/src/test-fixtures/tick-grid.ts
    - webapp/src/test-fixtures/tick-synth.ts
    - webapp/e2e/specs/ticks-viewer.spec.ts

key-decisions:
  - "AccumChart(accum-chart.tsx)는 손대지 않았다 — Task 1 커밋 75658fe3 의 변경 파일 목록에 없다. accum 회귀는 기존 단언 그대로 통과(accum-chart 100 · use-chart-view 14 기존 + 새 케이스 4)"
  - "선택 틱 KPI 의 자르는 시각 = 커서 이하(거래소순) 마지막 A3 까지 본 체결 시각의 누적 최댓값(runMaxNs). 마지막 틱에서 k = 전체라 teamPnlOf 전체값과 같고, 중간 틱은 미래 체결이 섞이지 않는다(테스트로 잠금)"
  - "teamKpiAt 셋째 인자는 수신 ns 가 아니라 커서 rec — lastA3 · exPos 표로 O(1) 에 마지막 A3 를 찾고 그 체결가를 lastPx 로 쓴다"
  - "차트의 모든 시각 축은 수신 시각 — 커서 · 클릭 점프(recAtNs)가 수신순이라 같은 축이어야 커서가 원 · 선 위를 지난다. 주문 시각 = 거래소순 마지막 조각의 수신 시각"
  - "당일 보라 계단 축 = 하루 범위 고정(0 포함 · 매집감지 cumRangeOf 와 같은 규칙) · 누적 회색 축 = pos_net 값 ∪ 0 독립 범위(스케치 018 ②) · posNetPathOf 재사용(T0 = 08:00)"
  - "범례는 SVG 판 제목이 아니라 차트 머리 HTML 에 둔다 — 폰은 판 제목을 생략하지만 D-09 범례는 늘 보여야 해서"
  - "accum 이 있는데 pos_net 이 비면 「누적 자료 없음(매집감지 포지션 없음)」 · 당일 화면은 범례 없이 당일 선만(D-09)"
  - "폰 · 데스크톱 판 높이는 측정 폭(< 600 → 165)으로 고른다 — viewBox 1:1 이라 기하가 폭을 이미 안다(뷰포트 CSS 판정과 따로)"
  - "← → 는 차트가 가로채지 않는다(창 키 = 커서 이동) · + − 0 만 차트 키"

requirements-completed: [D-00, D-09, D-10, D-11, D-12, D-13]

duration: ~16min
completed: 2026-11-02
---

# Phase 37 Plan 14: 3판 차트 + 팀 거래정보 패널 Summary

**매집감지 상세 차트와 같은 3판(가격 · 팀 평단 · 팀 주문 원 | 당일 보라 · 누적 회색 계단 | 10분 막대)을 틱 수신 시각 축으로 그리고, 클릭 · 원 클릭 · 1분/10초가 같은 커서를 움직인다. 팀 거래정보 패널은 shared 골든 함수(`fillsUpTo` + `pnlAt`)로 선택 틱까지 손익을 내며, 천일 10/14 마지막 틱이 export `payload.pnl` 13키와 같다.**

## Performance

- **Duration:** 약 16분(12:23Z → 12:39Z)
- **Tasks:** 3/3 (Task 1 tracer · Task 2 TDD RED → GREEN · Task 3)
- **Files:** 생성 9 · 수정 10

## accum 회귀 결과

| 대상 | 결과 |
|------|------|
| `src/lib/__tests__/accum-chart.test.ts` | 기존 99 단언 그대로 + `clampView minViewMs` 1건 → 100 통과 |
| `src/hooks/__tests__/use-chart-view.test.tsx` | 기존 14 그대로 + `minViewMs` 3건(10초까지 확대 · 생략하면 10분 · 5초 요청 → 10초) → 17 통과 |
| `src/components/analytics/**`(AccumChart · 상세 화면 RTL 포함) | 회귀 실행 통과 |
| `accum-chart.tsx` 변경 | 없음 — `git show --name-only 75658fe3` 에 없다 |

## 차트 레이어 표

| 순서(아래 → 위) | 레이어 | 판 | 색 · 규칙 | data-slot |
|---|---|---|---|---|
| 1 | 장전 음영 08:00~09:00 | 세 판 | `--accum-shade` | `tick-pre-shade` |
| 2 | 빈 띠 15:30~16:00 | 세 판 | `--accum-gap` | `tick-gap-band` |
| 3 | VI 띠(발동 ~ 해제 수신 · 진행 중이면 세션 끝) | 세 판 | `--vi` 14% · `<title>` | `tick-vi-band` |
| 4 | 시각 격자(1초 ~ 3시간 단계) | 세 판 | `--border-subtle` | — |
| 5 | 0선 | ② | `--faint` 점선 | `tick-net-zero` |
| 6 | 누적(이월 포함) 회색 계단 · 왼쪽 회색 축 | ② | `--muted-fg` · pos_net 있을 때만 · posNetPathOf | `tick-cum-path` · `tick-cum-axis` |
| 7 | 당일 팀 순매수 보라 계단 · 오른쪽 보라 축 | ② | `--team` 1.75 · 주문 끝 시각 순 ±금액 | `tick-day-path` · `tick-day-axis` |
| 8 | 10분 팀 매수/매도 막대 쌍(72칸) | ③ | `--up` / `--down` 70% · 하루 최대 기준 | `tick-bucket` |
| 9 | 가격 선(열별 4점 솎음 · 15분 공백에서 끊김) | ① | `--fg-2` 1.25 | `tick-price-path` |
| 10 | 팀 평단 점점선(잔량 > 0 · 0 에서 끊김 · 판 안 클램프) | ① | `--up` `1 2` | `tick-team-avg-path` |
| 11 | 팀 주문 원 ≥ 500만(큰 원 먼저 · 반지름 orderRadiusOf) · 클릭 = 마지막 조각 | ① | 매수 `--up` · 매도 `--down` · 커서 주문 `--fg` 고리 | `tick-order-circle` |
| 12 | 현재 틱 커서(세 판 관통) + 아래 시각 라벨 | 전체 | `--fg` | `tick-chart-cursor` · `-label` |

판 높이 = 데스크톱 7+104+7+50+7+40+15 = **230** · 폰 0+72+7+36+7+28+15 = **165**(스케치 019 D). 범례(머리 HTML): 「누적 자료 없음(매집감지 미등록)」 · 「누적 = 매집감지 포지션(이월 포함)」 · NXT 「누적 = 매집감지 포지션(KRX+NXT 합산)」.

## 골든 대조(SC 4)

- 천일고속 10/14(`chunil-1014-a3.ticks.zst` → `buildTickSession` → `TickSession.team`) 마지막 틱 `teamKpiAt` = `chunil-1014.pnl.json` accum 13키(실현 28,621,939 · 미실현 3,160,411 · 합계 31,782,350 · 끝 잔량 3,406 · ret 0.011768…) — lastPx 224,000 = 골든 last_px. 패널 표기는 「+1.18%」 · 「실현 +2,862만 · 미실현 +316만」 · 「잔량 3,406주」.
- 같은 KPI = `teamPnlOf(model.fills, lastPx)`(화면 함수 = 골든 함수) · 당일 계단 끝 = buy_val − sell_val · 10분 막대 합 = buy_val / sell_val.
- 중간 틱 KPI = 자르는 시각 이하 팀 체결만으로 다시 계산한 `teamPnlOf` 와 같다.
- NXT 컷 13시 — 팀 주문 65건(= 37-13 오라클) · 팀 체결 = 그 조각 · 마지막 KPI = teamPnlOf 전체(D-13).

## Task Commits

1. **Task 1 (tracer): minViewMs 일반화 · 틱 가격 선 · 커서 · 클릭 점프 · 1분/10초** — `75658fe3` (feat)
2. **Task 2 RED: 팀 모델 실패 테스트** — `c9b88a11` (test)
3. **Task 2 GREEN: 차트 팀 레이어** — `6ee72e52` (feat)
4. **Task 3: 팀 거래정보 패널 · e2e** — `7fa0a186` (feat)

## TDD Gate Compliance

- **RED** `c9b88a11` — 대상 `team-model.test.ts > 천일고속 10/14 … > 마지막 틱 — 13키 골든 …`. JUnit 리포터 단독 실행 exit 1 · `expected null to be 224000`. `gsd-tools check tdd-red-evidence` → **RED_EVIDENCE_OK**(target_test_failed) · 증거 `37-14-red-evidence.json`.
  - semanticAssessment: 대상 테스트가 실행됐고 계획한 단언(마지막 틱 KPI)에서 AssertionError 로 실패했다. 원인은 team-model 뼈대(빈 모델 · 빈 KPI)라는 계획된 미구현이다. import · 문법 · 픽스처 오류가 아니다(뼈대 export 를 두어 단언에서 실패하게 했다). 전체 RED 실행에서 9건 모두 단언 실패.
- **GREEN** `6ee72e52` — team-model 10 · tick-chart 19 · tick-chart RTL 9 통과.
- **REFACTOR** — 없음.
- Task 1 은 `type="tracer"` — 트레이서 게이트(interactive · end-of-phase · 자동 verify)로 verify 를 다시 돌려 통과(129 테스트) 뒤 확장했다.

## Verification

- Task 1 verify: `shared build && webapp typecheck && vitest accum-chart · use-chart-view · tick-chart` → exit 0 · 3 파일 129 통과.
- Task 2 verify: `… vitest team-model · tick-chart · tick-chart.test.tsx` → 37 통과(뒤에 세션 부착 단언 1건 더해 38).
- Task 3 verify(단위 · 타입): `webapp typecheck(tsc + tsconfig.e2e)` 통과 · `vitest tick-team-panel · tick-chart.test.tsx · accum-chart` 통과.
- 회귀: `vitest src/components/ticks src/lib/ticks accum-chart use-chart-view src/components/analytics` → **30 파일 522 테스트 통과**.
- eslint(`src/lib/ticks` · `src/components/ticks` · 픽스처 · e2e 스펙 · use-chart-view · accum-chart) 오류 · 경고 0.
- 수락 기준 grep 전부 OK: `minViewMs`(use-chart-view) · `minViewMs = MIN_VIEW_MS`(accum-chart) · `export function teamKpiAt` · `누적 자료 없음` · `KRX+NXT 합산`(tick-chart.tsx) · `호가 걸어 둔 팀 주문 미포함(최소치)` · `1분 해상도`(tick-team-panel) · `export function pricePathDecimated`.
- 세션 생성 시간: 컷 13시 KRX 25.5ms → 31.8ms(jsdom · 팀 모델 추가 ~5ms).
- **e2e 미실행 — 오케스트레이터가 메인 트리에서 실행.** worktree 에 webapp env 가 없고 비밀 가드가 복사를 막는다. 실행할 명령:
  `cd webapp && pnpm exec playwright test e2e/specs/ticks-viewer.spec.ts e2e/specs/accum-report.spec.ts --workers=1`
  - 새 describe 「틱 전문 뷰어 3판 차트 · 팀 거래정보」 3절
    1. 차트 — 클릭(10분 막대 판 y 200 · 13:24 지점) → 머리 시각 13:2x · 데스크톱 230 · 범례 「누적 자료 없음(매집감지 미등록)」 · 1280 가로 넘침 0
    2. 휠 확대 10회 페이지 오류 0 · 「10초」 → 창 「10초」 · 「1분」 · 0 키 → 「하루 전체」
    3. 팀 패널 캡션(최소치 · ≈1분 해상도 · NXT 줄 없음) · 13:57 클릭 → 당일 순매수 「—」 아님
  - 기존 절은 손대지 않았다. 다만 본문 맨 위에 차트 카드가 늘어 37-08 · 37-10 · 37-13 절의 1280 가로 넘침 단언이 새 배치도 함께 본다. accum-report.spec 은 훅 기본값 회귀 확인용이다.

## Decisions Made

frontmatter `key-decisions` 참고. 요점: AccumChart 무변경 · 선택 틱 자르기 = 거래소순 체결 시각 누적 최댓값 · `teamKpiAt(model, session, rec)` · 모든 차트 시각 = 수신 시각 · 범례는 머리 HTML · 판 높이는 측정 폭으로.

## Deviations from Plan

### Auto-fixed / 보강

**1. [Rule 3 - 막힘] 페이지(`tick-viewer-page.tsx`)가 `accum` · `isToday` 를 뷰어에 넘긴다(플랜 files 밖)**
- 플랜은 차트 · 패널 props 에 `accum` 을 두지만 열기 응답을 가진 곳은 페이지다. `TickViewer` 에 선택 props 두 개를 더하고 페이지가 `view.resp.accum` · `view.resp.date === today` 를 넘긴다.
- Commit `6ee72e52`

**2. [Rule 3 - 막힘] 테스트 픽스처 보강 — `tickFixtureBytes` · `tickFixtureJson`(tick-grid.ts) · `b9Msg` 금액(tick-synth.ts)**
- 천일 골든 · NXT 컷을 webapp 테스트에서 읽어야 하고, 5창구 표 금액을 합성하려면 B9 금액 필드가 필요하다. 기존 호출은 그대로(금액 생략 = 0).
- Commit `c9b88a11` · `7fa0a186`

**3. [시그니처 조정] `teamKpiAt(model, session, rec)` — 플랜 `recvNs`**
- 커서 rec 로 `lastA3[exPos[rec]]` 를 O(1) 에 찾아 lastPx 와 자르는 시각을 함께 정한다. 수신 ns 로는 거래소순 마지막 A3 를 바로 못 찾는다.

**4. [모양 보강] `TeamModel.teamOrders` = `TeamOrderPoint[]`(플랜 `ViewOrder[]`) · `fillMs` · `runMaxNs` 추가**
- 원 · 계단에 마지막 조각 rec · 수신 시각 · 체결가가 필요하고(원 클릭 점프), 평단 계단 x 와 선택 틱 자르기 시각을 세션마다 한 번 만든다. 원래 주문은 `order` 필드로 그대로 든다.

**5. [Rule 1 - 정확성] `msOfNs` = µs 정수로 자른 뒤 ÷ 1000**
- `Number(ns) / 1e6` 은 ns(≈1.76e18)가 2^53 을 넘어 256ns 단위로 깎였다. VI 띠 1ms 테스트에서 드러났다. µs 정수(≈1.76e15)는 정확하다.
- Commit `6ee72e52`

---

**Total deviations:** 5(막힘 2 · 시그니처 1 · 모양 1 · 정확성 1). 범위 확대 없음.

## Known Stubs

없음.

## Known Limitations

- 시각 확인(실화면)은 못 했다 — env 가 없어 dev 서버를 띄울 수 없었다. 1280 가로 넘침 0 은 e2e 단언에 넣었다. 데스크톱 오른쪽 열(330 폭)에 카드가 셋이 되어 640 높이를 넘으면 열 안에서 스크롤한다(37-13 배치 규칙 그대로).
- 일반 호버 툴팁(시각 · 가격 · 당일 순매수 · 누적 · 평단 — 스케치 019 D)은 넣지 않았다. 원 · 막대 · VI 띠는 `<title>` 툴팁이다. 플랜 Task 2 는 원 툴팁만 요구한다.
- 당일 증분(37-19)으로 세션을 다시 만들면 팀 모델도 새로 만든다(세션 생성 때 한 번).

## Issues Encountered

- `.planning/WINDOWS.md` 장부에 「e2e 미실행」 을 append 하려 했지만 `gsd-tools windows append` 가 「Ledger counts disagree with entries: 4/0/13/17 vs 3/0/14/17」 로 거부했다. 37-08 · 37-10 · 37-13 과 같은 기존 장부 집계 불일치이고 이 플랜 밖이라 고치지 않았다.

## Threat Flags

없음 — 새 네트워크 · 인증 · 스키마 표면이 없다(이미 받은 격자 바이트 · 열기 응답 위 순수 계산 · 화면).

## Next Phase Readiness

- 37-16(골든 대조 · 검증): 화면 KPI 는 `teamKpiAt` 하나 — shared `fillsUpTo` + `pnlAt` 그대로다. 빅텍 G4 조각도 `buildTickSession` → `session.team` 으로 같은 경로를 탄다.
- 37-19(당일): `isToday` 면 누적 선 · 누적 KPI 를 그리지 않는다(D-09). 진행 중 VI 띠는 세션 마지막 수신까지 그린다.

## Self-Check: PASSED

- FOUND: 생성 9 · 수정 10 파일 전부 존재
- FOUND: `75658fe3` · `c9b88a11` · `6ee72e52` · `7fa0a186` (HEAD 조상)
