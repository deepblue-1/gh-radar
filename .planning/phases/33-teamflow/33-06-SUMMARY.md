---
phase: 33-teamflow
plan: 06
subsystem: ui
tags: [nextjs, react, svg, tailwind, vitest, rtl, teamflow, a11y]

# Dependency graph
requires:
  - phase: 33-03
    provides: "lib/teamflow-report.ts(fmtEok · toneOf · fmtShare · isHotShare · fmtQty · kstHm · TONE_TEXT) · lib/teamflow-chart.ts(chartWidthOf · CHART_FALLBACK_W) · --team / --team-bg 토큰"
  - phase: 33-05
    provides: "useChartWidth(측정 폭 · 폴백 640) · TeamflowToggle(공용 접힘 토글) · TeamflowDetail 2열 그리드와 teamflow-rules 사이 자리"
provides:
  - "BUCKET_KEY_FIRST(54) · BUCKET_KEY_LAST(92) · BUCKET_KEY_CLOSE(93) · BUCKET_SLOTS(39) · bucketSlotsOf(buckets) → 39칸(key 93 → 슬롯 38 합산) · fmtRangePct(lo, hi) (lib/teamflow-report.ts)"
  - "windowSlotsOf(window) → [s0, s1] | null · firstLimitXOf(ms, W) → { x, anchor } | null · bucketChartOf(slots, window, firstLimitMs, W) → BucketChart + BUCKET_L/R/T/H1/GAP/H2/TICK/H 상수 (lib/teamflow-chart.ts)"
  - "TeamflowBucketChart(data-slot teamflow-bucket-chart · role=img · 범례 teamflow-bucket-legend) — 순수 SVG 39칸 고정축 · 높이 228"
  - "TeamflowBucketTable(data-slot teamflow-bucket-table) — 7열 · buckets 전부 · window 행 inset 띠"
  - "TeamflowDetail — 요약 → 2열 → teamflow-buckets(10분 차트 + 「10분 표 보기」) → teamflow-rules"
affects: [33-07, 33-08, 33-09]

# Actuals (#2632)
actuals:
  tokens: 12000
  tasks: 2
  commits: 4
commits: 4
plan_head_before: f8374c4ebc352c63d4a259dc702051b8cfb01749
plan_head_after: e3525cb284d4f350bca9ba5330f63aa19f31d394

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "고정축 차트 = 표시 변환(bucketSlotsOf — 칸 위치 · 합산 규칙) → 순수 기하(bucketChartOf — 픽셀) → 컴포넌트(그리기만) 3단. 표는 변환을 거치지 않고 원자료(buckets 전부)를 그린다"
    - "선 그래프 결측 = 구간 배열(shareSegments: 점[][]) — 빈 칸 · null 에서 끊고 한 점 구간은 r 1.5 점"

key-files:
  created:
    - webapp/src/components/analytics/teamflow-bucket-chart.tsx
    - webapp/src/components/analytics/teamflow-bucket-table.tsx
  modified:
    - webapp/src/lib/teamflow-report.ts
    - webapp/src/lib/teamflow-chart.ts
    - webapp/src/components/analytics/teamflow-detail.tsx
    - webapp/src/lib/__tests__/teamflow-report.test.ts
    - webapp/src/lib/__tests__/teamflow-chart.test.ts
    - webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx

key-decisions:
  - "key 93 합산 시 슬롯 38 이 비어 있으면 key 93 복사본(key 92 · start 15:20)을 그대로 둔다 — share 를 다시 계산하지 않는다(종가 단일가는 buy_aggr 0 이라 결과가 같다)"
  - "10분 표 window 띠 = windowSlotsOf 범위 key 54+s0~54+s1, 그리고 s1 이 슬롯 38 이면 key 93 행도 — 차트 슬롯 38 에 합산되는 행을 표에서도 같은 창으로 본다"
  - "등락률 띠는 lo · hi 중 하나만 있으면 그 값 하나로(최소 높이 1.5) 그린다 — 둘 다 null 이면 띠 없음"
  - "첫 상한가 라벨 y = 판 위끝 + 10(위쪽 라벨 · 오른쪽 축 「60%」 와 같은 줄) — 스케치의 T + 24 대신 판 맨 위에 붙였다"
  - "10분 블록 래퍼에 data-slot teamflow-buckets 를 달아 배치(2열 밖 · 판정 기준 앞)를 RTL 이 직접 잠근다"

patterns-established:
  - "teamflow 상세 블록 = data-slot 루트 + 소제목 줄 + 측정 폭 SVG + 8px 아래 TeamflowToggle(표)"

requirements-completed: [TEAM-04]

coverage:
  - id: D1
    description: "bucketSlotsOf — 39칸 · 천일고속 전 칸 채움 · slots[38] = key 93 복사(15:20 · vol 40 · share null) · 합성 92+93 합산(vol 15 · share 0.5 · lo 20 · hi 22 · net_val 100) · 분모 0 → null · key 53/94 버림 · [] → null 39개 · 입력 불변 / fmtRangePct"
    requirement: TEAM-04
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/teamflow-report.test.ts#bucketSlotsOf (D-13 · 2026-10-16 보정 — key 93 → 슬롯 38 합산)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/teamflow-report.test.ts#fmtRangePct (UI-SPEC 10분 표 · 툴팁)"
        status: pass
    human_judgment: false
  - id: D2
    description: "10분 차트 기하 골든 — windowSlotsOf([1,5] · [18,18] · [18,19] · 자름) · firstLimitXOf(286.57 start · 588.09 end · 40 · 604 · null) · bucketChartOf(H 228 · slot 564/39 · zero 78.4 · 최대 −9.2억 막대 h 53.6 · 눈금 7 · 한선 음영 · 비중 선 끊김 [2,1,2] · 0.6 초과 위끝 · rlo/rhi · empty · net_val null 막대 없음)"
    requirement: TEAM-04
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/teamflow-chart.test.ts#bucketChartOf (39칸 고정축 · 높이 228)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/teamflow-chart.test.ts#windowSlotsOf"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/teamflow-chart.test.ts#firstLimitXOf (첫 상한가 세로선 — KST 분 정확 위치)"
        status: pass
    human_judgment: false
  - id: D3
    description: "10분 흐름 SVG — 천일고속 접근 이름 「천일고속 10분 흐름 — 최대 매집 12:00~12:09 +7.2억 · 첫 상한가 11:50」 · viewBox 0 0 640 228 · 칸 title 39 · 캡션 음영 문구 · 범례 6 · 2열 밖 판정 기준 앞 · 동양고속 첫 상한가 없음 · window null = 「최대 매집 창 없음」 · buckets [] = 「10분 체결 기록이 없어요」"
    requirement: TEAM-04
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx#TeamflowDetail — 10분 흐름 차트 (T8 · D-13)"
        status: pass
    human_judgment: false
  - id: D4
    description: "「10분 표 보기」 — 기본 접힘 · 7열 · 천일고속 39행(마지막 15:30) · 12:00 행 칸 · window 행 띠(천일고속 1 · 한선 5) · 범위 밖 key 50 = 표 맨 위 · 차트 39칸 그대로 · 세 토글 독립 · 행 접으면 초기화"
    requirement: TEAM-04
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx#TeamflowDetail — 「10분 표 보기」 (T8 · D-14)"
        status: pass
    human_judgment: false
  - id: D5
    description: "실제 브라우저 — 폰 390 칸 ≈ 7px · 「첫 상한가 HH:MM」 라벨 오른쪽 끝 넘침 0(84px 추정 상수) · 왼쪽 축 「+N.N억」 40px 칸 안 · 11px 글자 · hover opacity · 10분 표 폰 가로 스크롤"
    requirement: TEAM-04
    verification: []
    human_judgment: true
    rationale: "jsdom 은 레이아웃 · 글자 폭 · clientWidth 를 계산하지 않는다(폭 0 → 폴백 640 경로만 검증). 실측 백스톱은 33-07/33-08 E2E · 33-09 라이브 UAT 몫"

# Metrics
duration: 9min
completed: 2026-10-16
status: complete
---

# Phase 33 Plan 06: 상세 ② — 10분 흐름 차트 · 「10분 표 보기」 Summary

**펼친 상세의 2열 아래 전폭에 10분 흐름 차트를 붙였습니다. 차트는 09:00~15:30 고정 39칸 순수 SVG(높이 228 · 측정 폭 1:1)이고, key 93 종가 단일가는 슬롯 38(15:20 칸)에 합산합니다. 순매수 막대 ± · 매수 중 팀 보라 선(빈 칸 · null 에서 끊김) · 등락률 띠 · 최대 매집 창 음영 · 첫 상한가 세로선을 그립니다. 그 아래 「10분 표 보기」 7열 표는 buckets 원자료(key 92 · 93 · 범위 밖)를 각자 행으로 보여 줍니다.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-16T07:38:16Z
- **Completed:** 2026-10-16T07:47:15Z
- **Tasks:** 2 (트레이서 TDD 1 · auto TDD 1)
- **Files modified:** 8

## Accomplishments

- **슬롯 변환 `bucketSlotsOf`:** key 54~92 를 `key − 54` 칸에 복사합니다. key 93 은 슬롯 38 에 합산합니다. 합산 규칙은 수량 · 금액 10키 null-안전 합, `lo` min, `hi` max, `share` = 합산 `team_buy ÷ buy_aggr`(분모 0 → null)이고 칸 start 는 「15:20」 입니다. 그 밖 key 는 버리고 입력은 바꾸지 않습니다. 10/14 실측 34행은 key 92 가 0행이라, 천일고속 · 동양고속 · 한선엔지니어링 모두 39칸이 전부 찹니다.
- **기하 `bucketChartOf`:** UI-SPEC T8 상수(L 40 · R 36 · T 8 · H1 128 · GAP 16 · H2 56 · TICK 20 → H 228)로 막대 · 띠 · 비중 선 구간 · 음영 · 첫 상한가 · 눈금 · 히트 칸을 계산합니다. `firstLimitXOf` 는 KST 분(초 포함)을 축 위 정확한 x 로 바꾸고 `[40, W − 36]` 으로 자릅니다. 라벨(≈ 84px)이 오른쪽 끝을 넘으면 anchor 를 'end' 로 바꿉니다.
- **`TeamflowBucketChart`:** 레이어 순서는 음영(`--team-bg` 맨 아래) → 0선 → 20% 점선 → 칸 `<g>`(투명 히트 + `<title>` + 막대 + 띠) → 보라 선 → 첫 상한가 → 축 글자입니다. aria-label 은 「{종목} 10분 흐름 — 최대 매집 … | 최대 매집 창 없음 · 첫 상한가 HH:MM」 이고, buckets 가 비면 판 가운데에 「10분 체결 기록이 없어요」 를 그립니다. 범례 견본은 `<span>` 입니다(33-01 RTL (j)).
- **`TeamflowBucketTable`:** 7열 · key 오름차순 · window 칸 행 첫 칸에 `shadow-[inset_3px_0_0_var(--team)]` 띠를 긋습니다. 팀 순매수는 ±억 부호 색, 매수 중 팀은 ≥30% `--team` 600 · 0% `--faint` 입니다. 공용 `TeamflowToggle` 로 기본 접혀 있습니다.

## Task Commits

1. **Task 1 (tracer · TDD) RED:** 10분 흐름 차트 실패 테스트 — `6f4f0e2d` (test)
2. **Task 1 (tracer · TDD) GREEN:** bucketSlotsOf · bucketChartOf · TeamflowBucketChart · 상세 배치 — `1f46e11f` (feat)
3. **Task 2 (TDD) RED:** 「10분 표 보기」 실패 테스트 — `97f241e2` (test)
4. **Task 2 (TDD) GREEN:** TeamflowBucketTable · 토글 배치 — `e3525cb2` (feat)

트레이서 피드백 게이트: auto_advance false · human_verify_mode end-of-phase · Task 1 `<verify>` 는 automated 만 있습니다. 재실행해 73/73 통과했고 Task 2 로 확장했습니다.

## TDD Gate

두 RED 모두 vitest `--reporter=junit` 으로 캡처해 `gsd-tools check tdd-red-evidence` 에 넣었고, 둘 다 **RED_EVIDENCE_OK (target_test_failed)** 였습니다.

- **Task 1 RED:** 대상 `bucketChartOf (39칸 고정축 · 높이 228) > 천일고속 640 — …` (73 테스트 중 26 실패 · 47 통과)
  - semanticAssessment: 모듈은 정상 로드됐고 기존 33-03 · 33-05 케이스 47개는 통과했습니다. 새 케이스는 `bucketSlotsOf` / `bucketChartOf` / `windowSlotsOf` / `firstLimitXOf` / `fmtRangePct is not a function`(계획한 함수 부재)으로 실패했습니다. RTL 은 `teamflow-bucket-chart` 요소가 없어 실패했습니다. 문법 · 픽스처 오류는 없었습니다.
- **Task 2 RED:** 대상 `TeamflowDetail — 「10분 표 보기」 (T8 · D-14) > 기본 접힘 → 클릭 → …` (38 중 6 실패)
  - semanticAssessment: 6케이스 모두 「10분 표 보기」 버튼 부재로 실패했습니다(토글 미구현). 합성 key 50 케이스는 차트 칸 39 단언을 통과한 뒤 버튼 부재에서 멈췄습니다. Task 1 · 33-05 케이스는 통과했습니다.
- **GREEN · REFACTOR:** GREEN 은 태스크마다 `feat(33-06)` 커밋 뒤 verify 명령이 통과했습니다. REFACTOR 커밋은 없습니다. 증거 기록(junit XML · JSON)은 webapp 아래에 임시로 만들고 커밋 전에 지웠습니다.

## Files Created/Modified

- `webapp/src/lib/teamflow-report.ts` — BUCKET_* 상수 · bucketSlotsOf · fmtRangePct
- `webapp/src/lib/teamflow-chart.ts` — BUCKET_L/R/T/H1/GAP/H2/TICK/H · windowSlotsOf · firstLimitXOf · bucketChartOf · BucketChart 타입
- `webapp/src/components/analytics/teamflow-bucket-chart.tsx` — 10분 흐름 SVG + 범례
- `webapp/src/components/analytics/teamflow-bucket-table.tsx` — 10분 표 7열
- `webapp/src/components/analytics/teamflow-detail.tsx` — 2열 아래 teamflow-buckets 블록(차트 + 「10분 표 보기」)
- 테스트
  - `lib/__tests__/teamflow-report.test.ts`: bucketSlotsOf 7 · fmtRangePct 2 추가
  - `lib/__tests__/teamflow-chart.test.ts`: windowSlotsOf 2 · firstLimitXOf 3 · bucketChartOf 7 추가
  - `components/analytics/__tests__/teamflow-detail.test.tsx`: 10분 차트 5 · 10분 표 6 추가

## Decisions Made

key-decisions(프런트매터) 참조. 요지는 다음과 같습니다.
- 슬롯 38 이 빈 칸: key 93 복사본을 그대로 둠
- 표 window 띠: 슬롯 38 이 창에 들면 key 93 행도 포함
- 등락률 띠: 한쪽만 있으면 그 값 하나로
- 첫 상한가 라벨: 판 위끝 + 10
- 배치 잠금: `data-slot="teamflow-buckets"` 래퍼

## Deviations from Plan

### Auto-fixed Issues

None — 버그 · 차단 이슈 자동 수정은 없었습니다.

### 계약 정합 · 플래너 재량 보완

**1. [계약 정합] 10분 표 window 띠의 key 93 행**
- **Found during:** Task 2
- **Issue:** 플랜 action 의 `key 54+s0 ~ 54+s1` 만 쓰면, 창이 15:20~15:30 까지 이어질 때 차트 슬롯 38 에는 음영이 있는데 그 칸에 합산된 key 93 행에는 띠가 빠집니다.
- **Fix:** `s1 === 38` 이면 key 93 행도 띠 대상으로 넣었습니다.
- **Files modified:** webapp/src/components/analytics/teamflow-bucket-table.tsx
- **Commit:** e3525cb2

**2. [플래너 재량 보완] `BucketChart.yTop` 필드 추가**
- 축 글자 「{rhi}%」 의 y(`yr(rhi)`)를 컴포넌트가 다시 계산하지 않도록 기하 결과에 `yTop` 을 하나 더 실었습니다. 플랜 필드는 전부 그대로입니다.

**3. [플래너 재량 보완] 등락률 띠 한쪽 null**
- UI-SPEC 은 lo~hi 만 정하고 있습니다. 한쪽만 있을 때 칸을 비우면 정보가 사라지므로, 있는 값 하나로 최소 1.5 띠를 그립니다. 둘 다 null 이면 띠를 그리지 않습니다.

---

**Total deviations:** 자동 수정 0 · 계약 정합 1 · 재량 보완 2. **Impact:** 범위 밖 변경은 없습니다. 상한가 보고서 · Phase 32 파일도 바꾸지 않았습니다.

## Issues Encountered

- **샌드박스 명령 거부:** `cd` 와 git 을 섞은 복합 명령, `eval` 루프는 worktree 격리 검사가 거부했습니다. 단순한 개별 호출로 나눠 실행했습니다.
- **플랜 커밋 원장:** 33-03~33-05 와 같이 세션 scratchpad 에 두었습니다. `commits: 4` 는 `git rev-list --count f8374c4e..HEAD` 실측값입니다.

## Known Stubs

없습니다. 「10분 체결 기록이 없어요」 는 UI-SPEC 이 정한 빈 상태 문구입니다. 차트 · 표 모두 `row.payload.buckets` · `window` · `first_limit_ms` 실데이터에 연결돼 있습니다.

## Verification

- **Task 1 verify:** shared build + vitest(teamflow-report · teamflow-chart · teamflow-detail) 73/73 통과 · exit 0
- **Task 2 verify:** shared build + webapp typecheck(tsc + e2e tsconfig · error TS 0) + vitest(teamflow-detail · teamflow-report) 38/38 통과 · exit 0
- **플랜 `<verification>`:** `src/lib/__tests__` + `src/components/analytics/__tests__` 53파일 1230 통과 · 1 skipped(기존) · exit 0
- **acceptance_criteria:** 전 항목 PASS
  - Task 1: bucketSlotsOf · `BUCKET_KEY_CLOSE = 93` · bucketChartOf · firstLimitXOf · `data-slot="teamflow-bucket-chart"` · `<TeamflowBucketChart` 각 1 · recharts/lightweight-charts 0
  - Task 2: `data-slot="teamflow-bucket-table"` · `inset_3px_0_0_var(--team)` · 「10분 표 보기」
- **eslint:** 변경 8파일 무경고

## Next Phase Readiness

- **33-07 · 33-08 E2E · 33-09 UAT 몫 (coverage D5):**
  - 폰 390 칸 폭과 첫 상한가 라벨 넘침(84px 추정 상수)
  - 왼쪽 축 「+N.N억」 이 40px 칸 안에 드는지(두 자리 억이면 빠듯함)
  - 10분 표 폰 가로 스크롤
- **E2E 셀렉터:** `teamflow-buckets` · `teamflow-bucket-chart` · `teamflow-bucket-legend` · `teamflow-bucket-table`

## Self-Check: PASSED

- **파일 존재 확인(FOUND):**
  - webapp/src/components/analytics/teamflow-bucket-chart.tsx
  - webapp/src/components/analytics/teamflow-bucket-table.tsx
- **커밋 존재 확인(FOUND):** 6f4f0e2d · 1f46e11f · 97f241e2 · e3525cb2
