---
phase: 35-launch-gate
plan: 07
subsystem: webapp admin
tags: [launch-gate, admin, svg, react, vitest, rtl, tdd]
status: complete

requires:
  - phase: 35-launch-gate
    provides: "35-03 shared launch.ts — launchDaysOf · launchPanelStatsOf · launchRibbonAt · launchFireOf · LaunchDay · LaunchMapPiece · 첨부 pieces.json 픽스처"
  - phase: 35-launch-gate
    provides: "35-06 launch-format.ts(fmtUs · resultToneOf · brokerMarketLabelOf · DASH) · 발사 색 축 토큰 --launch-* 8개"
provides:
  - "launch-map.ts — LAUNCH_CHART · launchAxisOf(중앙값 ± 상한) · launchAxisFrom · launchTicksOf · xOfUs · launchStackOf · launchGateBandOf · launchRibbonCellsOf · launchMarkOf · diamondPathOf · launchTooltipOf · mapNextOffsetOf · launchDateLabelOf"
  - "LaunchGateChart — 서버 × 시장 패널 하나(순수 SVG · data-slot launch-panel · launch-chart · launch-day-table) · 35-08 이 4패널로 조립"
affects: [35-08, 35-10, 35-11]

actuals:
  tokens: 13300
  tasks: 2
  commits: 3
plan_head_before: 8c7c999ad5fc12cea6793f9fad71e2450d7f9359
plan_head_after: 258db496db838fbb875f5ee8db313780bd4303b6

tech-stack:
  added: []
  patterns:
    - "지도 기하는 순수 함수(launch-map.ts)가 잠그고 컴포넌트는 그리기만 — accum-chart 와 같은 꼴"
    - "이상치 상한 — 축은 아래 중앙값 ± cap 안 값으로만, 밖의 점은 끝에 고정 + ◂/▸ · title 「축 밖」"
    - "SVG 노드 상한 — 눈금 ≤ 12 · 간격 ≥ 28px · 리본 칸 수 ≤ 그림 폭 px(넘으면 1·2·5 nice 로 올림)"

key-files:
  created:
    - webapp/src/lib/launch-map.ts
    - webapp/src/lib/__tests__/launch-map.test.ts
    - webapp/src/components/admin/launch-gate-chart.tsx
    - webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx
  modified: []

key-decisions:
  - "35-07: 축 넓음/좁음 경계는 값 폭 40µs — 플랜 글의 「span > 100」 으로는 must_haves 4축(−360~−280 등, 값 폭 47~75)이 나오지 않아 40 으로 맞췄다(첨부 4패널 = 넓은 축 · 09:00:30 오발 묶음 11µs = 좁은 축)"
  - "35-07: 축 중심 m 은 아래 중앙값(실제 값 하나) — 짝수 개 평균 중앙값이면 [−300, −20148] 같은 입력에서 core 가 비어 축을 못 잡는다"
  - "35-07: 축 밖 다음 오프셋은 점선 대신 행 아래 끝에 「▸ 다음 −245µs」(--primary) — 리본 머리 글과 같은 줄에 두지 않아 겹치지 않게"
  - "35-07: 패널 머리 문구는 must_haves · 목업대로 「경계 잡힌 날 n · 전부 접수 n · 전부 거부 n」(Task 1 action 의 「경계 n」 과 다름)"

patterns-established:
  - "지도 점 표식: 16:00 은 전부 원 · 09:00:30 은 매도(A 매도 다리)만 마름모 · side null 은 원 · 채움 색 = 결과 tone · 기타는 빈 표식(--launch-other 테두리)"

requirements-completed: []

coverage:
  - id: D1
    description: "축 · 눈금 · 좌표 · 쌓기 · 경계 띠 · 다음 오프셋 — 첨부 4패널 축(−360~−280 · −320~−250 · −560~−460 · −430~−350) · KB 코스닥 눈금 step 10 · 9개 · 같은 µs −4/0/4 · 띠 4종 · mapNextOffsetOf q16/n0930/null"
    requirement: "LAUNCH-06"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/launch-map.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "리본 칸(stepR 0.2 · 400칸 · v −337 = 접수 5 · 거부 3 · 모름 2) · 이상치 상한(n0930 오발 축 −20152~−20135 · next hi · 섞인 축 lo · 극단 폭 눈금 ≤ 12 · 간격 ≥ 28px · 칸 ≤ plotPx) · 표식 · 마름모 경로 · 툴팁"
    requirement: "LAUNCH-06"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/launch-map.test.ts (35 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "LaunchGateChart 렌더 — KB 코스닥 머리 집계 · 날짜 10 · 점 87 · gate 띠 4 · 전부 거부 1(+ 문구) · 점선 1 · 폭 640 · 빈 패널 · 09:00:30 원 3 + 마름모 1 · 축 밖 「▸ 다음 −245µs」 · 리본 rect = 칸 × 3 · ◂ 표식 · 날짜별 표 · 판단 불가 알약"
    requirement: "LAUNCH-06"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx (14 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "패널이 첨부 지도 · 채택 목업과 같은 느낌으로 읽히는지(밀도 · 색 · 글 겹침) — 라이트/다크 실브라우저"
    verification:
      - kind: other
        ref: "35-08 이 탭에 조립한 뒤 E2E 스크린샷"
        status: unknown
    human_judgment: true
    rationale: "이 플랜은 패널 부품만 만들고 페이지에 붙이지 않는다(조립 · 폰 E2E 는 35-08). 시각 품질은 사람이 본다."

duration: 약 8분
completed: 2026-10-27
---

# Phase 35 Plan 07: 발사 경계 지도 패널 Summary

**첨부 `drawPanel()` 과 채택 목업을 순수 SVG 패널 `LaunchGateChart` 로 옮겼다. 패널은 날짜 행 · 결과 점 · 그날 경계 띠 · 다음 첫 조각 점선 · 「쐈다면」 리본 · 날짜별 표를 그린다. 09:00:30 은 같은 패널에서 A 매도를 마름모로 그린다. 10/26 오발(−20,148µs) 같은 이상치가 섞여도 축은 중앙값 ± 상한으로 잡혀 늘어나지 않고, 그 점은 축 끝에 ◂/▸ 표식으로 남는다.**

## Performance

- **Duration:** 약 8분 (2026-10-27T12:35Z → 12:43Z)
- **Tasks:** 2/2 (Task 1 트레이서 · Task 2 TDD)
- **Files:** 신규 4 · 수정 0

## 기하 규칙 (테스트가 잠근 최종형)

- **축 `launchAxisOf(values, next, fire)`**
  - cap 은 q16 300 · n0930 100(µs)이다. m 은 values 의 아래 중앙값이고, values 가 비면 next ?? 0 이다.
  - core 는 m ± cap 안의 values 에, m ± cap 안이면 next 를 더한 것이다. core 가 비면 m 하나로 잡는다.
  - core 폭이 40µs 를 넘으면 여유 8 · 단위 10, 아니면 여유 3 · 단위 1 이다. xmin = floor((min − pad)/unit)·unit, xmax = ceil((max + pad)/unit)·unit 이다.
  - **변경 이유:** 플랜 글의 경계는 「span > 100」 이다. 그런데 첨부 4패널의 값 폭은 47~75 라 이 경계로는 좁은 축(예: −355~−293)이 나온다. 그러면 must_haves 의 4축(첨부 식 −360~−280 등)과 어긋난다. 그래서 경계를 40 으로 낮췄다. 09:00:30 오발 묶음(폭 11)은 그대로 좁은 축(−20152~−20135)이 된다.
  - 아래 중앙값을 쓰는 이유: 실제 값 하나라서 core 가 비지 않는다.
- **눈금 `launchTicksOf`**
  - 기본 step 은 폭 > 200 이면 20, > 40 이면 10, 아니면 2 다.
  - 개수가 12 를 넘거나 간격이 28px 보다 좁으면 다음 nice step(1 · 2 · 5 × 10^k)으로 올린다.
  - 값은 step 배수 중 [xmin, xmax] 안에 드는 것이다. 첨부는 xmin 부터 더해 나갔지만 여기서는 배수로 정렬한다.
- **리본 `launchRibbonCellsOf(days, axis, plotPx)`**
  - stepR 은 축 폭 > 100 이면 1, 아니면 0.2 다. 칸 수가 plotPx 를 넘으면 nice 로 올린다.
  - 칸 v = xmin + i·stepR 이다. i 는 정수이고, 1e-6 단위로 꼬리를 정리해 누적 오차를 막는다.
  - 칸 값은 shared `launchRibbonAt` 그대로다.
  - 플랜 시그니처의 `fire` 인자는 뺐다. stepR 규칙이 발사 기준과 무관해서 쓰이지 않는 인자다.
- **나머지 함수**
  - `xOfUs` 는 선형이고, 축 밖 값은 끝으로 고정한다.
  - `launchStackOf` 는 같은 µs 묶음에서 dy = (i − (k−1)/2)·4 를 준다.
  - `launchGateBandOf` 의 gate 띠는 최소 폭이 2px 다.
  - `launchMarkOf` 는 n0930 의 sell 만 마름모로 정한다.
  - `diamondPathOf(cx, cy, r)` 는 마름모 경로를 낸다.
  - `launchTooltipOf(date, piece, fire, offAxis?)` 를 두었다.
  - `mapNextOffsetOf` 는 Q16 · N 머리에서 가장 최근 거래일 행을 고르고, A 머리는 무시한다.
  - `launchDateLabelOf` 는 YYYYMMDD 와 YYYY-MM-DD 를 「MM/DD」 로 바꾼다.

## 이상치 표시 방식

- **축 밖 점:** x 를 축 끝(L 또는 W − R)에 고정한다. 그 행 안쪽 7px 에 「◂」/「▸」(10px · --muted-fg)를 행 · 쪽마다 하나 그린다. title 끝에는 「 · 축 밖」 을 붙이고, 실제 µs 를 그대로 보인다.
- **축 밖 다음 오프셋:** 점선을 그리지 않는다. 대신 마지막 행 아래 그 쪽 끝에 「▸ 다음 −245µs」(--primary)를 쓰고, title 은 「… · 축 밖」 이다.
- **노드 수:** 눈금 ≤ 12 · 리본 칸 ≤ 그림 폭이다. 극단 축(−10000~10000)에서도 눈금 11개 · 리본 400칸(stepR 50)이다. 리본 칸은 `<g>` 없이 rect 3개씩이다.
- **next null 내성:** 백필 머리나 gh-trade 의 발사 계획 어드민 전환 뒤처럼 next 가 null 이면, 점선 · 축 밖 글을 모두 그리지 않는다. 축은 values 만으로 잡는다.

## 테스트 수

- `launch-map.test.ts` 35건 · `launch-gate-chart.test.tsx` 14건: 합 49 passed.
- 35-06 형제 테스트(`launch-format` · `launch-orders-tab`)와 함께 돌려 85 passed(`--maxWorkers=2`)를 확인했다.
- webapp typecheck: 기존 frames.ts 외 0건(`relay/tests/helpers/frames.ts:490` · `:1618` 은 알려진 기존 오류다).
- eslint: 4파일 0건.

## Task Commits

1. **Task 1 (tracer): 16:00 패널 하나 끝까지**: `a1a64d97` (feat). 트레이서 게이트에서 `<verify>`(shared build · typecheck · vitest 28 passed)를 다시 돌려 통과를 확인한 뒤 Task 2 로 넘어갔다.
2. **Task 2 RED: 리본 · 마름모 · 이상치 상한**: `f177631a` (test)
3. **Task 2 GREEN: 리본 · 마름모 · 이상치 표식 · 날짜별 표**: `258db496` (feat)

REFACTOR 커밋은 없다. 리본 `<g>` → Fragment 정리는 GREEN 커밋에 들어갔다.

## TDD Gate Compliance

- RED `f177631a` 가 GREEN `258db496` 보다 앞선다.
- RED 증거는 JUnit reporter 로 냈고, `gsd-tools check tdd-red-evidence` 판정은 **RED_EVIDENCE_OK**(target_test_failed · 49 tests · 21 fail)다.
- 타깃 테스트는 `LaunchGateChart — 09:00:30 합패널(N 매수 원 · A 매도 마름모) › 원 3 · 마름모 1 …` 다.
- 의미 판정:
  - 타깃은 실행됐고, 계획된 단언 `circle toHaveLength(3)` 에서 실패했다(받은 값 4). Task 1 컴포넌트가 A 매도도 원으로 그렸기 때문이다.
  - 로드 · 구문 · 픽스처 오류는 없었고, Task 1 테스트 28건은 통과했다.
  - lib 신규 함수 단언 15건은 함수가 없어서 실패했다(TypeError). 이 실패는 타깃이 아니고 보조 증거다.
- 증거 기록은 files_modified 밖이라 커밋하지 않았다(scratchpad 에 보관).

## Decisions Made

- frontmatter key-decisions 4건을 보라. 그중 축 경계 40 과 아래 중앙값은 플랜 글과 다르다(아래 편차 1 · 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 플랜 축 규칙(span > 100)으로는 must_haves 4축이 나오지 않음**
- **Found during:** Task 1
- **Issue:** 「기하 규칙」 은 pad = span > 100 ? 8 : 3 · unit = span > 100 ? 10 : 1 이다. 그런데 첨부 4패널의 core 폭은 47 · 56 · 51 · 75 라 모두 좁은 축이 되고, must_haves · RESEARCH 의 −360~−280 등과 어긋난다.
- **Fix:** 경계를 40µs 로 낮췄다(`WIDE_SPAN`). 이 값은 눈금 규칙의 「> 40 이면 10」 과도 같은 수다. 4패널은 넓은 축, 09:00:30 오발 묶음은 좁은 축이 된다.
- **Files modified:** webapp/src/lib/launch-map.ts
- **Verification:** launch-map.test.ts 4패널 축 · n0930 이상치 축(−20152~−20135) 통과
- **Committed in:** a1a64d97

**2. [Rule 1 - Bug] 평균 중앙값이면 core 가 빌 수 있음**
- **Found during:** Task 1
- **Issue:** 짝수 개 값의 평균 중앙값은 실제 값이 아니다. [−300, −20148] 같은 입력이면 m ± cap 안에 아무 값도 없어 축을 못 잡는다.
- **Fix:** 아래 중앙값(정렬 뒤 floor((n−1)/2) 번째)을 쓰고, 그래도 비면 m 하나로 잡는다.
- **Files modified:** webapp/src/lib/launch-map.ts
- **Committed in:** a1a64d97

**3. [Rule 3 - 정리] `launchRibbonCellsOf` 의 `fire` 인자 제거 · `launchAxisFrom` · `launchDateLabelOf` 추가**
- **Issue:** 플랜 시그니처의 fire 는 stepR 규칙에 쓰이지 않는다. 극단 폭 테스트는 「cap 무시 강제 축」 을 요구한다. 날짜 글은 MM/DD 변환을 컴포넌트 · 툴팁 · 표 세 곳에서 쓴다.
- **Fix:** 인자를 뺐다. 강제 축 생성자와 날짜 라벨 함수를 export 했다.
- **Committed in:** a1a64d97 · 258db496

**Total deviations:** 3 auto-fixed (Rule 1 ×2 · Rule 3 ×1). **Impact:** 공개 함수 이름 · data-slot · 색 토큰은 플랜 그대로다. 35-08 조립에는 영향이 없다. 35-08 은 `launchRibbonCellsOf` 를 부를 일이 없다(컴포넌트 내부).

## Issues Encountered

None.

## 다음 플랜 메모 (35-08)

- 조립:
  - 패널 하나 = `<LaunchGateChart gateway market fire days={launchDaysOf(그 패널 조각)} next={mapNextOffsetOf(heads, gateway, market, fire)} />` 다.
  - 패널 조각은 지도 응답 pieces 에서 (gateway, market) 와 `launchFireOf(piece) === fire` 로 거른다.
- 범례(접수 · 101/515 · 기타 · A 매도 마름모 · 경계 · 다음 첫 조각)와 프리셋 칩 · 요약 카드는 35-08 몫이다. 패널에는 리본 머리 한 줄만 있다.
- 실브라우저 시각 확인(라이트/다크 · 폰 390 가로 스크롤)은 35-08 E2E 에서 한다(coverage D4).

## Self-Check: PASSED

- 신규 4파일이 디스크에 있다.
- 커밋 a1a64d97 · f177631a · 258db496 이 HEAD 조상에 있다.
- Task 2 `<verify>` 결과: shared build 0 · typecheck 기존 frames.ts 외 0 · vitest 49 passed.
