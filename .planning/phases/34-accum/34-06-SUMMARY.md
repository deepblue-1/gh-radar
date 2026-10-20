---
phase: 34-accum
plan: 06
status: complete
subsystem: ui
tags: [nextjs, react, svg, chart, geometry, tdd, tracer]

requires:
  - phase: 34-04
    provides: "endReasonLabelOf · isCarry · isTodayReg · 합성 목록 행 · accumKstMs"
  - phase: 34-13
    provides: "AccumDetail 지연 로드 셸 + KPI 줄 · 워커 픽스처 로더(accumDetailRows) · AccumDetailRow/payload 타입"
provides:
  - "webapp lib/accum-chart.ts: ACCUM_CHART · MIN_VIEW_MS · View · dayBoundsOf · clampView · xOfView · priceAxisWidthOf · dayMaxPxOf · pricePointsOf · priceRangeOf · yOfPrice · pricePathOf · orderRadiusOf · orderCirclesOf · cumRangeOf · yOfCum · cumPathOf · bucketMaxOf · bucketBarsOf · gapBandOf · shadeOf · cycleMarksOf · carryLineOf · ticksOf · labelWidthOf · labelRowsOf"
  - "AccumChart(accum-chart.tsx · data-slot accum-chart) — 3판 순수 SVG 정적 레이어 · view prop"
  - "AccumDetail 준비 상태 KPI 줄 아래 <AccumChart> (하루 전체 창)"
  - "--accum-shade · --accum-gap 토큰(라이트 · 다크) + tds-tokens 고정"
  - "test-fixtures accumSyntheticDetail(multiCycle · carry · drop0600 · preOpenReg · noTeam · noPrice)"
affects: [34-07, 34-08, 34-10, 34-12]

actuals:
  tokens: 18300
  tasks: 3
  commits: 6
plan_head_before: 86a60f50f0fc922d12a562459eebcacd7a783657
plan_head_after: ba9eaa2869bdb42ec1ec2673fe6496dd484fee45

tech-stack:
  added: []
  patterns:
    - "차트 기하는 전부 lib 순수 함수(시각 ms → 좌표) · 컴포넌트는 그리기만 — 목업 C JS 를 그대로 옮기고 픽셀만 4 배수"
    - "창 밖 가격 점은 이진 탐색(lowerBound/upperBound)으로 ±30분까지 잘라 순회 · 15분 넘는 공백은 M 으로 끊음"
    - "y 범위 축 분리: 가격 = 보이는 창(∪ 주문 px) · 누적/10분 = 하루 전체 고정"
    - "세로선 · 라벨은 clipPath 밖에 창 안 것만 그린다(왼쪽 끝 06:00 · 09:00 이전 선이 반쯤 잘리지 않게)"
    - "clipPath id = useId 를 [A-Za-z0-9_-] 로 정리한 값(url(#…) 안전)"

key-files:
  created:
    - webapp/src/lib/accum-chart.ts
    - webapp/src/lib/__tests__/accum-chart.test.ts
    - webapp/src/components/analytics/accum-chart.tsx
    - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
    - .planning/phases/34-accum/tdd-evidence/34-06-T1-red.json
    - .planning/phases/34-accum/tdd-evidence/34-06-T2-red.json
    - .planning/phases/34-accum/tdd-evidence/34-06-T3-red.json
  modified:
    - webapp/src/components/analytics/accum-detail.tsx
    - webapp/src/styles/globals.css
    - webapp/src/styles/__tests__/tds-tokens.test.ts
    - webapp/src/test-fixtures/accum-export.ts

key-decisions:
  - "시각 눈금은 KST 자정 기준으로 맞춘다 — 2시간 간격이면 10 · 12 · … · 20(epoch 정렬이면 홀수 시가 된다)"
  - "10분 판 「팀 체결 없음」 은 buckets 가 빌 때, 누적 판은 day_cum_net 이 빌 때 — 판마다 해당 배열 기준(UI-SPEC 「해당 배열이 빌 때」)"
  - "shadeOf 는 첫 사이클의 since_date 가 그날과 다르면(이월 사이클이 먼저 나온 경우) null — 「등록 전」 이 성립하지 않는다"
  - "종료 사유가 0 인데 end_time_ms 가 있으면 종료선 라벨 「종료 HH:MM」(사유 라벨 null 대체)"
  - "세로선(등록 · 종료)은 창 [view.t0, view.t1] 안에 있을 때만 그린다 — 34-07 확대/이동에서 창 밖 선 · 라벨이 축 영역에 남지 않게"
  - "합성 상세 케이스는 바탕 실측 행의 ISIN · 종목명을 그대로 둔다(목록 행 펼침으로 찾기 위해) — 합성임은 머리 주석이 말한다"

patterns-established:
  - "새 순수 모듈의 RED: 시그니처만 있고 빈 값을 돌려주는 골격을 RED 커밋에 함께 넣어 단언 실패로 RED 를 성립시킨다(34-02 선례)"

requirements-completed: []

coverage:
  - id: D-17
    description: "순수 SVG(차트 라이브러리 import 0) · useChartWidth 측정 폭 W 와 viewBox 0 0 W 472 1:1 · jsdom 640 폴백"
    verification:
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/accum-detail.test.tsx#(c1)"
        status: pass
      - kind: other
        ref: "grep -Eq \"^import .*lightweight-charts\" accum-chart.tsx lib/accum-chart.ts → exit 1"
        status: pass
    human_judgment: false
  - id: D-14
    description: "세 판 같은 x 창 · 판 좌표(16~216 / 240~352 / 376~448 · 눈금 465) · clampView · 가격 선 ±30분 이진 탐색 · 15분 끊기 · 가격 y = 보이는 가격 ∪ 주문 px ± 8% · 폴백 · 누적/10분 고정 범위 · 막대 폭 창 기준 · 시각 눈금 28px 규칙"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/accum-chart.test.ts (창 · x · 가격 판 · 누적 · 10분 막대 · 시각 눈금)"
        status: pass
    human_judgment: false
  - id: D-15
    description: "주문 원 반지름 식 · 큰 원 → 작은 원 → first · first 테두리 --fg 1.5 채움 .9 · 원마다 title(천일고속 「09:01:00 팀 매수 9주 · 0.02억 @174,300 · 1조각 · 팀매수 시작」)"
    verification:
      - kind: unit
        ref: "accum-chart.test.ts#주문 원 · accum-detail.test.tsx#(c2)"
        status: pass
    human_judgment: false
  - id: D-16
    description: "사이클 세로선(나온 순서 k · CR-01 · 오늘 등록만 등록선 · max(t, T0) · 원래 시각 라벨) · 등록 전 음영 · 이월 줄 · 06:00 왼쪽 끝 · 09:00 이전 등록 · 라벨 줄 배치"
    verification:
      - kind: unit
        ref: "accum-chart.test.ts#사이클 세로선 · 이월 줄 · labelRowsOf · accum-detail.test.tsx#(c4)(c5)(c6)"
        status: pass
    human_judgment: false
  - id: D-18
    description: "팀 체결 없음 = 가격 선 + 0선 + 축 + 빈 띠 + 누적 판 · 10분 판 가운데 「팀 체결 없음」"
    verification:
      - kind: unit
        ref: "accum-detail.test.tsx#(c3)"
        status: pass
    human_judgment: false
  - id: TOKENS
    description: "--accum-shade · --accum-gap 라이트 rgba(107,118,132,.10/.07) · 다크 rgba(255,255,255,.07/.04)"
    verification:
      - kind: unit
        ref: "webapp/src/styles/__tests__/tds-tokens.test.ts"
        status: pass
    human_judgment: false
  - id: VISUAL
    description: "실기기 · 실브라우저에서 3판 차트 모양(라벨 겹침 · 폰 폭 310 · 다크/라이트 음영 대비)"
    verification: []
    human_judgment: true
    rationale: "jsdom 에는 레이아웃 · 글자 폭이 없다 — 라벨 폭은 추정식이다. 34-10 폭 백스톱 · 34-12 라이브 UAT 몫"

duration: 11min
completed: 2026-10-20
---

# Phase 34 Plan 06: 매집감지 상세 차트 정적 레이어 Summary

**펼친 상세의 KPI 줄 아래에 순수 SVG 3판 차트를 그렸다. 판은 가격 · 순매수 누적 · 10분 팀 매수/매도이고, 한 x(ms) 창을 공유한다. 측정 폭과 viewBox 는 1:1 이고 높이는 472 다. 레이어는 가격 선, 팀 주문 원(반지름 식 · first), 누적 계단, 10분 막대 쌍, 사이클 세로선과 라벨, 등록 전 음영, 15:30~16:00 빈 띠, 눈금, 축 글자, 이월 줄이다. 기하는 모두 `lib/accum-chart.ts` 순수 함수이고, 실측 6행과 합성 상세 6종으로 골든을 잠갔다.**

## Performance

- **Duration:** 약 11분 (13:49Z 시작 → 14:00Z 마지막 태스크 커밋)
- **Completed:** 2026-10-20
- **Tasks:** 3개 (Task 1 tracer · Task 2 · Task 3 auto). 태스크마다 RED → GREEN 커밋을 한 쌍씩 남겼다.
- **Files:** 신규 7개 (lib 1 · 컴포넌트 1 · 테스트 2 · RED 증거 3), 수정 4개

## Accomplishments

- **가격 판 (Task 1, 트레이서)**
  - `ACCUM_CHART` 의 판 배치 = 16 / 200 / 24 / 112 / 24 / 72 / 24 → 472, 눈금 기준선은 465 다.
  - 함수: `dayBoundsOf` · `clampView`(리서치 코드 그대로) · `xOfView`.
  - `priceAxisWidthOf`: 하루 최대 가격이 1,000,000 이상이면 60, 아니면 52.
  - `priceRangeOf`: 보이는 가격 ∪ 보이는 주문 px 에 8% 여유를 둔다. 보이는 점이 0 이면 하루 전체로 폴백하고, 값이 하나도 없으면 [0, 1] 을 쓴다.
  - `pricePathOf`: 창 ±30분 밖은 이진 탐색으로 잘라 내고, 15분이 넘는 공백은 `M` 으로 끊는다.
  - `AccumChart`: `useChartWidth` 로 잰 폭을 viewBox 에 1:1 로 쓴다. `role=img` 와 A6 접근 이름, `clipPath` 를 단다.
- **데이터 레이어 (Task 2)**
  - **주문 원:** `orderRadiusOf` 는 2.2~7 이다. `orderCirclesOf` 는 first 아닌 원을 반지름 내림차순으로 그리고 first 원을 맨 마지막에 둔다. 원마다 D-15 title 을 단다.
  - **누적:** `cumRangeOf` · `cumPathOf` 는 하루 전체 고정 범위의 계단이다. 0선은 `--faint` `2 3` 점선이다.
  - **10분 막대:** `bucketBarsOf` 의 막대 폭은 현재 창 기준 칸 폭 × 0.42(최소 1.5)이고, 높이는 하루 최대 기준이다. 칸 히트 rect 에 title 을 단다.
  - **빈 띠 · 음영:** `gapBandOf`, 그리고 `shadeOf`(오늘 등록 · 첫 사이클 reg 있을 때만 · `max(T0, reg)`).
  - **팀 체결 없음:** 해당 배열이 빈 판 가운데에 「팀 체결 없음」 을 쓴다.
  - **토큰:** `--accum-shade` · `--accum-gap` 를 `:root` · `.dark` 둘 다에 넣고 축 주석을 달았다. tds-tokens 테스트가 값을 고정한다.
  - **합성 상세 6종:** `accumSyntheticDetail`. multiCycle 은 CR-01 재현용으로 `cycle` 값이 1, 1 이다.
- **세로선 · 눈금 · 글자 (Task 3)**
  - **세로선:** `cycleMarksOf` 는 나온 순서로 k 를 매기고, 오늘 등록 사이클만 등록선을 긋는다. 선 위치는 `max(t, T0)` 이고 라벨은 원래 시각이다. 사유 라벨은 `endReasonLabelOf` 를 재사용한다.
  - **이월 줄:** `carryLineOf` 는 `isCarry` · `fmtYmdShort` 를 재사용한다.
  - **눈금:** `ticksOf` 는 5분 → 15분 → 30분 → 1h 순으로 고르고, 간격이 28px 미만이면 2h · 3h 로 올린다. 기준은 KST 정시다.
  - **라벨 줄:** `labelRowsOf` 는 폭을 추정하고(한글 11 · 그 밖 6.5), 4px 안으로 겹치면 다음 줄로 보낸다. 최대 3줄이다. 그림 끝을 넘으면 라벨을 선 반대쪽으로 뒤집고, 이월 줄이 1줄 왼쪽 자리를 먼저 차지한다.
  - **렌더:** 시각 격자와 등록선(`--team` 실선) · 종료선(`--muted-fg` `4 3` 점선)을 그리고, 선마다 폭 8 히트 rect + title 을 단다. 글자는 가격 축 5개 · 누적 축 · 10분 최대값 · 판 제목 2개 · 눈금 · 이월 줄이다.

## Task Commits

1. **Task 1 RED:** `b7e1cdc6` test(34-06): 차트 기하 · 가격 판 실패 테스트
2. **Task 1 GREEN:** `e71309ab` feat(34-06): 매집감지 상세 차트 가격 판(순수 SVG · 1:1 viewBox)
3. **Task 2 RED:** `bcde9394` test(34-06): 원 · 계단 · 10분 막대 · 음영 기하 테스트
4. **Task 2 GREEN:** `d9678937` feat(34-06): 차트 데이터 레이어 · --accum-shade/--accum-gap 토큰
5. **Task 3 RED:** `2da06d21` test(34-06): 사이클 세로선 · 라벨 · 눈금 골든
6. **Task 3 GREEN:** `ba9eaa28` feat(34-06): 사이클 세로선 · 이월 줄 · 눈금 · 축 글자

REFACTOR 커밋은 없다. 정리할 것이 없었다.

## TDD Gate Compliance

- **Task 1 RED:** target `(c1) 천일고속 펼침 → …` 가 첫 단언 `svg 존재` 에서 AssertionError(`expected null to be truthy`)로 실패했다. 분류기 판정은 `RED_EVIDENCE_OK (target_test_failed)` 다(`tdd-evidence/34-06-T1-red.json`).
  - 의미 판정: 목록 렌더 · 펼침 · 상세 section 까지는 통과했고, 차트가 아직 없어서 실패했다.
  - lib 단위 11건은 골격 모듈(시그니처만 · 빈 값)에서 전부 단언 실패였다. 로드 실패가 아니다.
- **Task 2 RED:** target `(c3) CJ씨푸드1우 …` 가 「팀 체결 없음」 2개 단언에서 AssertionError(`expected [] to have a length of 2 but got +0`)로 실패했다. 판정은 `RED_EVIDENCE_OK` 다(`tdd-evidence/34-06-T2-red.json`).
  - 의미 판정: Task 1 의 svg 는 그려졌고 데이터 레이어가 없어서 실패했다.
  - lib 11건 중 1건은 빈 배열 인덱싱 TypeError 였다. 원인은 같다(골격이 [] 반환). 토큰 6건은 globals.css 에 토큰이 없어서 실패했다.
- **Task 3 RED:** target `(c4) multiCycle …` 가 `expected [] to include '등록 09:12 · 1'` 로 실패했다. 판정은 `RED_EVIDENCE_OK` 다(`tdd-evidence/34-06-T3-red.json`).
  - 빈 출력 경계 2건(cycles 0 · 라벨 0)은 골격에서도 green 인 잠금 테스트다.
- **GREEN:** 세 태스크 모두 feat 커밋에서 대상 테스트를 포함한 전부가 통과했다.
- **트레이서 게이트(Task 1):** 대화형 · end-of-phase 모드이고 `<verify>` 가 자동 검증뿐이다. 그래서 verify 한 줄을 다시 돌려 exit 0 · 12/12 와 차트 라이브러리 import 0 을 확인한 뒤 확장했다.

## Verification

- **Task 3 verify(플랜 verification)** 는 exit 0 이다.
  - 순서: shared build → webapp typecheck(`tsc --noEmit && tsc -p tsconfig.e2e.json`) → vitest `accum-chart.test.ts` · `accum-detail.test.tsx` · `accum-report.test.tsx`(+ `tds-tokens.test.ts`).
  - 결과는 **161/161** 이다. lib 41 · 상세 RTL 8 · 목록 RTL 회귀 green · 토큰.
- `grep -Eq "^import .*lightweight-charts" accum-chart.tsx lib/accum-chart.ts` 는 exit 1 이다(일치 없음).
- eslint 변경 파일은 error 0 이다. warning 1건(`accum-export.ts` `_payload`)은 34-13 부터 있던 것이다.
- **ROADMAP SC 4** 가 단위 · RTL 로 관측된다.
  - 차트 7요소 + first 표식: (c2) · (c4).
  - 09:00 이전 등록을 09:00 에 맞춤: preOpenReg 단위.
  - 15:30~16:00 빈 칸: 한선 경로의 M ≥ 2 · gap rect.
  - 팀 체결 없는 종목도 깨지지 않음: (c3).

## Decisions Made

- 시각 눈금은 KST 자정 기준으로 맞춘다. 2h 간격이면 10 · 12 · … · 20 이다.
- 「팀 체결 없음」 은 판마다 해당 배열 기준이다. 누적 판은 day_cum_net, 10분 판은 buckets 를 본다.
- `shadeOf` 는 첫 사이클의 since_date 가 그날과 다르면 null 이다.
- 등록선 · 종료선 · 라벨은 창 안에 있을 때만 그린다. clipPath 밖이므로 왼쪽 끝 선도 온전히 보인다.
- end_reason 0 인데 end_time 이 있으면 라벨은 「종료 HH:MM」 이다.
- 합성 상세는 바탕 실측 행의 ISIN · 종목명을 유지한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 산수] clampView 골든 입력**
- **Found during:** Task 1 GREEN
- **Issue:** 플랜 behavior 의 `clampView({t0: T0 − 1h, t1: T0 + 5분}) = 폭 10분` 은 산수가 맞지 않았다. 입력 폭이 65분이라, 잠긴 clampView 식(리서치 Code Example)으로는 폭 65분 · 시작 T0 가 맞다.
- **Fix:** 입력을 폭 5분 창 `{T0 − 1h, T0 − 1h + 5분}` 으로 고쳐 「10분 · 시작 T0」 를 단언했다. 65분 창은 「폭 유지 · 시작 T0」 단언으로 따로 남겼다. 구현은 리서치 식 그대로다.
- **Files modified:** `webapp/src/lib/__tests__/accum-chart.test.ts`
- **Commit:** `e71309ab`

**2. [Rule 3 - Blocking] RED 커밋에 골격 모듈 포함(34-02 선례)**
- **Issue:** 없는 모듈을 import 하면 로드 실패다. TDD 게이트는 이를 INVALID_RED 로 본다.
- **Fix:** Task 1 · 2 · 3 RED 커밋마다 시그니처만 있고 빈 값을 돌려주는 골격을 함께 넣었다. GREEN 커밋이 골격을 구현으로 바꿨다.

**3. [범위 · 사소] 수용 grep 「fill-opacity」**
- JSX 는 `fillOpacity` 로 쓰고 DOM 에서 `fill-opacity` 가 된다(RTL (c2) 가 DOM 속성을 단언한다).
- 소스 grep 이 통과하도록, 머리 주석의 불투명도 설명에 DOM 속성 이름을 적었다.

그 밖에는 계획대로 실행했다.

## Issues Encountered

- `gsd-tools windows append` 가 거부됐다. `.planning/WINDOWS.md` 의 frontmatter 카운트(open 4 / fixed 13)와 실제 항목(open 3 / fixed 14)이 원래부터 맞지 않기 때문이다.
- 원장 기록은 best-effort 이고 이 플랜 범위 밖이라 원장을 고치지 않았다. 아래 Known Stubs 가 같은 내용을 담는다.

## Known Stubs

| 파일 | 내용 | 해소 플랜 |
|---|---|---|
| `webapp/src/components/analytics/accum-chart.tsx` | `price.idx` 가 빈 종목이면 `AccumChart` 는 null 만 낸다. 대체 문구 「그날 체결 자료 없음」 은 범례 · 프리셋 · 캡션 자리와 함께 들어갈 몫이다. | 34-07 (이 플랜 truths 가 명시적으로 넘김) |

창(view)은 지금 부모가 주는 하루 전체 고정값이다. 확대/이동 훅 · 프리셋 · 범례 · 캡션은 34-07 범위이고 stub 이 아니다.

## Next Phase Readiness

- **34-07:** `AccumDetail` 의 `fullViewOf` 를 `use-chart-view` 훅으로 바꾸면 된다. `AccumChart` 는 view prop 만 받는다.
  - 재사용할 함수: `clampView` · `MIN_VIEW_MS` · `dayBoundsOf` · `xOfView`. `zoomAt` · `presetOf` 는 아직 없다.
  - 「그날 체결 자료 없음」 도 34-07 이 넣는다.
- **34-10 폭 백스톱 대상:**
  - data-slot: `accum-chart` · `accum-cycle-label` · `accum-carry-line` · `accum-px-axis` · `accum-cum-axis`.
  - 라벨 폭은 추정식(한글 11 · 그 밖 6.5)이다.
- **34-12 라이브 UAT:** 폰 `<title>` 툴팁 부재(UI A6 error 가정)를 사용자에게 묻는다.
- 원격 DB 적용 · push · 배포는 하지 않았다.

## Self-Check: PASSED
- FOUND: lib/accum-chart.ts · lib/__tests__/accum-chart.test.ts · analytics/accum-chart.tsx · analytics/__tests__/accum-detail.test.tsx · tdd-evidence 34-06-T1/T2/T3-red.json
- FOUND: b7e1cdc6 · e71309ab · bcde9394 · d9678937 · 2da06d21 · ba9eaa28 (HEAD 조상)

---
*Phase: 34-accum*
*Completed: 2026-10-20*
