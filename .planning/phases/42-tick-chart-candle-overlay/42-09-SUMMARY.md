---
phase: 42-tick-chart-candle-overlay
plan: 09
subsystem: ui
tags: [tick-viewer, candle-chart, svg, gestures, touch-inspect, vitest]

requires:
  - phase: 42-01
    provides: CandleChart 골격 · CandlePanels · candleYOf · candleIdxAt · CandlePriceLayer children 자리 · OwnDiamond · TickGroupBox export
provides:
  - "봉 차트 조작(선 차트 복제) — 클릭 점프 · 끌기 문턱 · + − 0 키 · 확대 버튼 5개 · Shift+끌기 구간 합계 · 커서 따라가기 · 커서 시각 라벨 · 마우스 세로선 · 값 점 · 안내 줄"
  - "봉 차트 겹침 — 팀 주문 원(봉 영역 y) · 고리 · 씨앗 · 우리 점 ◆ ○ ◇ · 원 옆 묶음 상자 · 폰 길게 누르기 · 원 · 우리 점 클릭"
  - "candle-chart.test.tsx — describe 조작 11 · 겹침 9 (20건)"
affects: [42-10, 42-11]

actuals:
  tokens: 10700
  tasks: 2
  commits: 4
plan_head_before: f49f70b878aff34219bb5c36522a8fccf4d57c58
plan_head_after: 8584749fee4289233fe36404bc0b30f24fa600ab

tech-stack:
  added: []
  patterns:
    - "선 차트 조작 골격을 그대로 복제하고 판 경계만 CandlePanels — 같은 훅(useChartView · useChartGestures · createTouchInspect) · 훅 무변경"
    - "팀 원 · 우리 점은 CandlePriceLayer children 으로 넘겨 가격 판 높이 클립 안에 그린다 — y 는 봉과 같은 candleYOf"

key-files:
  created:
    - webapp/src/components/ticks/__tests__/candle-chart.test.tsx
  modified:
    - webapp/src/components/ticks/candle-chart.tsx

key-decisions:
  - "값 점의 가격 판 점 = 그 시각 봉의 종가(candleIdxAt) — 봉이 없는 칸이면 가격 점을 찍지 않는다(선 차트의 '시각 이하 마지막 가격' 대신)"
  - "순매수 · 누적 · 팀 비중 값 점은 아래 판이 아직 그려지지 않아도 선 차트와 같은 tickBandAt 값 + yOfNet · yOfShare(P) 로 계산 — 42-10 이 band.tick 으로 바꾼다"
  - "길게 누르기 동안 세로선은 선 차트처럼 보이지 않는다(손가락이 닿아 있는 동안 useChartGestures 의 dragging = true) — 동형 유지"

patterns-established:
  - "봉 차트 data-slot 은 candle- 접두 · 가져다 쓰는 OwnDiamond(tick-own-mark) · TickGroupBox(tick-chart-group*) · TickChartRange(tick-chart-range) 의 자기 slot 은 예외"

requirements-completed: [SC-4, SC-6]

coverage:
  - id: D1
    description: "봉 차트 조작이 선 차트와 같다 — 클릭 점프 · 끌기 문턱 · 10초/1분/확대/축소/전체 · 0 키 · ← → 통과 · 커서 라벨 · 커서 따라가기 · 세로선 · 값 점(종가 y)"
    requirement: SC-6
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/candle-chart.test.tsx -t 조작 (11 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shift+끌기 구간 합계 — 결과 줄(TickChartRange) · 띠 · 알약(수익률 판 위 P.yRa − 15) · 시각 이동 없음 · 그냥 끌기 무구간 · ✕ · Esc · 빈 곳 클릭 지움 · 1분 창 고정 · 폰 무구간 · 안내 줄"
    requirement: SC-6
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/candle-chart.test.tsx describe 「조작 — Shift+끌기 구간 합계」 (5 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "팀 원 · 우리 점 ◆ ○ ◇ 가 봉과 같은 시간축 · 봉 영역 y · 가격 판 overlay 안 · 묶음 상자 · 우리 줄 · 클릭 우선순위 · 폰 길게 누르기"
    requirement: SC-4
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/candle-chart.test.tsx -t 겹침 (9 passed)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/chart-kind-switch.test.tsx (3 passed · 수정 없음)"
        status: pass
    human_judgment: false
  - id: D4
    description: "실기기에서 휠 · 핀치 · 길게 누르기 손맛과 원 · 봉 겹침 모양이 선 차트와 같다"
    verification: []
    human_judgment: true
    rationale: "제스처 손맛 · 시각 판단 — 42-11 UAT 에서 실기기로 확인(이 플랜은 Playwright 금지)"

duration: 45min
completed: 2026-11-12
status: complete
---

# Phase 42 Plan 09: 봉 차트 조작 · 겹침 Summary

**선 차트(`tick-chart.tsx`)의 조작 골격 — 클릭 점프 · 확대 버튼 · `+ − 0` 키 · Shift+끌기 구간 합계 · 커서 따라가기 · 세로선 · 값 점 · 팀 주문 원 · 우리 점 ◆ ○ ◇ · 묶음 상자 · 폰 길게 누르기 — 을 봉 차트로 그대로 복제하고 판 경계만 `CandlePanels` 로 바꿔, 두 차트가 같은 방식으로 움직인다는 것이 컴포넌트 테스트 20건으로 잠겼다.**

## Performance

- **Duration:** 약 45분
- **Completed:** 2026-11-12
- **Tasks:** 2 (각 RED → GREEN)
- **Files:** 생성 1 · 수정 1

## 복제한 덩어리(원 위치 → 새 위치)

| 덩어리 | 선 차트 `tick-chart.tsx` | 봉 차트 `candle-chart.tsx` | 바꾼 것 |
|--------|--------------------------|----------------------------|---------|
| 상수 `CLICK_SLOP_PX` · `WRAP_PAD_Y` · `TouchAnchor` · `anchorOf` | 124 ~ 135 | 머리 상수 | 없음 |
| 터치 살펴보기 · 비수동 touchmove | 287 ~ 329 | `inspectRef` · `tracker` · touchmove effect | 없음 |
| 구간 상태 · Esc 리스너 | 331 ~ 355 | 같은 이름 | 없음 |
| 터치 상자 높이 측정 | 357 ~ 363 | 같은 이름 | 없음 |
| 커서 따라가기 effect | 367 ~ 378 | 같은 이름 | 없음 |
| 원 · 우리 점 계산 | 406 ~ 415 | `circles` · `ownR` · `marks` · `curOrder` | y = `candleYOf`(봉 영역) |
| `pickAt` · `inPlot` · `tAt` · 터치 앵커 · `tip` | 427 ~ 445 | 같은 이름 | `inPlot` 아래 끝 `P.y4b`(CandlePanels) |
| 띠 시각 · 세로선 · 값 점 | 447 ~ 472 | `hoverT` · `bandVal` · `hoverDots` | 가격 점 = 그 시각 봉 종가(`candleIdxAt`) |
| 구간 합계 · 띠 계산 | 474 ~ 491 | 같은 이름 | 없음 |
| 포인터 down/move/up/cancel/lostcapture · `vbX` | 493 ~ 594 · 729 ~ 745 | 같은 이름 | 없음 |
| `ownHitOf` · `goOwn` · 클릭 | 535 ~ 624 | 같은 이름 | 없음 |
| 키 · `zoomTo` · `zoomBy` · 확대 버튼 | 626 ~ 698 | 제목 줄 `ml-auto` 묶음 | 없음(임시 — 아래) |
| 원 · 고리 · 씨앗 · 우리 점 마크업 | 900 ~ 966 | `<CandlePriceLayer>{…}</CandlePriceLayer>` children | slot `candle-` 접두 |
| 구간 띠 · 알약 | 969 ~ 1006 | 가격 판 층 뒤 클립 그룹 | 알약 y = `P.yRa − 15`(수익률 판 위) |
| 세로선 · 값 점 마크업 | 1008 ~ 1034 | 같은 그룹 | slot 접두 |
| 커서 시각 라벨 | 1173 ~ 1194 | svg 끝 | slot 접두 |
| 툴팁 상자 · 우리 줄 | 1196 ~ 1225 | 래퍼 안 svg 뒤 | slot 접두(`candle-chart-tip` · `candle-chart-own-line`) |
| 구간 결과 줄 · 안내 줄 | 1228 ~ 1239 | 카드 끝(래퍼 밖) | 안내 slot `candle-chart-hint` |

`OwnDiamond` · `TickGroupBox` 는 복제하지 않고 `./tick-chart` 에서 import 한다. `use-chart-view.ts` · `touch-inspect.ts` 는 고치지 않았다(`git diff b72dcd0f` 비어 있음).

## data-slot(이 플랜이 더한 것)

`candle-range` · `candle-range-band` · `candle-range-pill` · `candle-chart-hover` · `candle-chart-hover-line` · `candle-chart-hover-dot` · `candle-chart-cursor-label` · `candle-order-circle`(`data-order-rec` · `data-side`) · `candle-order-hover` · `candle-order-seed` · `candle-own-ev-mark`(`data-own-i` · `data-rec`) · `candle-chart-tip`(`data-touch`) · `candle-chart-own-line` · `candle-chart-hint`. 기존 `candle-chart-span` 은 확대 버튼 묶음 안으로 옮겼다.

## 임시 제목 줄 버튼(42-10 이 교체)

제목 줄 `titleAddon` 뒤 `ml-auto` 묶음 = 창 폭 글자 `candle-chart-span` + 버튼 5개(선 차트 `btn` 클래스 · `aria-label="확대"` / `"축소"` · `title` 「하루 전체 (0)」 · 이름 「전체」 「1분」 「10초」). 42-10 의 `CandleChartTitle` 이 같은 버튼 이름으로 바꾼다 — 테스트는 `getByRole('button', { name })` 으로 찾으므로 교체 뒤에도 그대로 통과해야 한다. 버튼은 래퍼(`candle-chart-wrap`) 밖이라 키 처리와 겹치지 않는다(Pitfall 12 — 테스트가 `wrap.contains(확대 버튼) === false` 로 잠금).

## Task Commits

1. **Task 1 RED** — `4a7a634f` (test) — 조작 11건
2. **Task 1 GREEN** — `6119b462` (feat)
3. **Task 2 RED** — `ec2c16c5` (test) — 겹침 9건
4. **Task 2 GREEN** — `8584749f` (feat)

REFACTOR 커밋 없음.

## 테스트 수

- `candle-chart.test.tsx` **20건 통과**(`-t 조작` 11 · `-t 겹침` 9)
- `chart-kind-switch.test.tsx` 3건 통과(수정 없음)
- webapp `typecheck` 통과 · 두 파일 ESLint 통과

## TDD Gate Compliance

- Task 1: RED `4a7a634f` → GREEN `6119b462`. RED 증거 `vitest run … --reporter=tap-flat -t onSeekMs` exit 1 → `gsd-tools check tdd-red-evidence` = **RED_EVIDENCE_OK**(target_test_failed · 대상 「빈 곳 클릭 → 그 x 의 시각(onSeekMs) …」). semanticAssessment: 모듈 로드 정상, 대상 테스트가 `expected "spy" to be called 1 times, but got 0 times` — 봉 차트에 클릭 처리기가 없어서 실패(문법 · 픽스처 · 수집 오류 아님). 전체 실행 때는 11 중 10 실패 · 1 통과(「그냥 끌기는 구간 없음」 — 구간이 아예 없으니 정상 통과).
- Task 2: RED `ec2c16c5` → GREEN `8584749f`. RED 증거 `-t 500` exit 1 → **RED_EVIDENCE_OK**(대상 「팀 주문 ≥ 500만 2개 …」). semanticAssessment: `expected [] to have a length of 2 but got +0` — 팀 원을 그리지 않아서 실패. 전체 실행 때 겹침 9건 모두 실패 · 조작 11건 통과.
- 처음 전체 TAP 출력은 testing-library DOM 덤프 · 배열 diff 의 여러 줄 문자열 때문에 분류기가 `invalid_record`(Malformed TAP)로 거절했다 → 같은 프로젝트 명령에 `-t` 로 대상만 다시 돌려 한 줄 실패 메시지로 기록했다(보고서는 수정하지 않음). 증거 파일은 커밋하지 않았다.

## Decisions Made

- frontmatter `key-decisions` 3건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 길게 누르기 테스트의 「세로선도 손가락 자리」 단언 제거**
- **Found during:** Task 2 GREEN
- **Issue:** RED 때 쓴 단언이 선 차트 실제 동작과 달랐다 — `useChartGestures` 는 포인터가 눌린 동안 `dragging = true` 라 선 차트도 손가락이 닿아 있는 동안 세로선을 그리지 않는다. 봉 차트만 다르게 만들면 D-19(같은 방식) 위반.
- **Fix:** 테스트에서 그 한 줄을 지우고 구현은 선 차트 그대로 둠(동형 유지).
- **Files modified:** webapp/src/components/ticks/__tests__/candle-chart.test.tsx
- **Commit:** 8584749f

**2. [Rule 3 - Blocking] 값 점 호버 x 를 13:00 봉 칸 안쪽으로**
- **Found during:** Task 1 GREEN
- **Issue:** 테스트가 정확히 13:00:00.000 x 에 호버해 부동소수 오차로 봉 칸 앞(−1)이 되어 가격 점이 빠졌다(테스트 좌표 문제).
- **Fix:** 호버 x = 13:00 x + 0.3px(≈ 13:00:24 — 1px ≈ 80초).
- **Files modified:** webapp/src/components/ticks/__tests__/candle-chart.test.tsx
- **Commit:** 6119b462

**3. [Rule 3 - Blocking] Task 2 대상 테스트에 개수 단언 추가**
- **Found during:** Task 2 RED 증거
- **Issue:** 배열 `toEqual` 실패의 여러 줄 diff 가 vitest TAP 를 깨뜨려 RED 분류기가 읽지 못했다.
- **Fix:** `expect(circles).toHaveLength(2)` 를 먼저 둠(검증 강도 같음 · 한 줄 실패 메시지).
- **Commit:** ec2c16c5

**Total deviations:** 3 auto-fixed(Rule 1 · Rule 3 ×2). **Impact:** 테스트 표기 · 좌표만 — 구현은 선 차트 동형.

## 실행 환경 메모

- 워크트리라 `pnpm install --frozen-lockfile` · `pnpm --filter @gh-radar/shared build` 직접 실행 · env 복사 불필요.
- vitest 는 이 플랜 테스트 두 파일만 `--maxWorkers=2` · Playwright · 전체 스위트 · 배포 · push 하지 않음.
- STATE.md · ROADMAP.md 는 손대지 않았다(오케스트레이터 몫).

## Known Stubs

- `webapp/src/components/ticks/candle-chart.tsx` — 순매수 · 누적 · 팀 비중 값 점은 계산되지만 그 판(수익률 · 아래 세 판)은 아직 그려지지 않는다(42-05 · 42-10 결선). 수익률 판 값 점 · 값 띠는 42-10. `listingShares` 는 값 점 시총 계산에만 쓰인다. 이 플랜 목표(조작 · 겹침 동형)는 막지 않는다.

## Next Phase Readiness

- 42-10 이 제목 줄 묶음을 `CandleChartTitle` 로 바꾸고(같은 버튼 이름 · `zoomBy` · `zoomTo` · `ctl.setPreset` 그대로 넘김), `bandVal` 을 `candleBandAt(…).tick` 으로, `candleBaseOf` 를 단위 봉으로 바꾸면 값 점 종가 · 원 y 가 같은 `y` 로 따라간다.

## Self-Check: PASSED

- 생성 파일 `webapp/src/components/ticks/__tests__/candle-chart.test.tsx` 존재 · 커밋 4a7a634f · 6119b462 · ec2c16c5 · 8584749f 모두 HEAD 조상.
- Task 1 수용 기준: `tickRangeSumOf` 2 · `TickChartRange` 3 · `P.yRa - 15` 1 · `aria-label="확대"` 1 · `candle-chart-hint` 1 · 훅 · 터치 모듈 diff 0 · `-t 조작` 11 통과(≥ 8).
- Task 2 수용 기준: 다섯 이름 각각 줄 있음 · `OwnDiamond` 2 · 함수 정의 복제 없음 · `data-order-rec` 5(≥ 2) · `-t 겹침` 9 통과 · 전체 20(≥ 15).
