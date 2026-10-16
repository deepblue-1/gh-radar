---
phase: 33-teamflow
plan: 05
subsystem: ui
tags: [nextjs, react, svg, tailwind, vitest, rtl, teamflow, a11y]

# Dependency graph
requires:
  - phase: 33-01
    provides: "TeamflowDetail 요약 블록 · TeamflowDayGrid 아코디언(열린 행만 상세 마운트) · @/test-fixtures/teamflow-export(10/14 34행)"
  - phase: 33-03
    provides: "lib/teamflow-chart.ts(CHART_FALLBACK_W · chartWidthOf) · lib/teamflow-report.ts(fmtEok · toneOf · fmtShare · isHotShare · fmtQty · TONE_TEXT) · --team / --team-bg 토큰"
provides:
  - "bandChartOf(bands, W) → { W, H, cx, sc, y20, rows[{ label, y, barY, barX, barW, tone, net, share, vol, isLimit }] } + BAND_ROW_H · BAND_BAR_H · BAND_LABEL_W · BAND_VALUE_W (lib/teamflow-chart.ts)"
  - "useChartWidth<T>() → [ref, width] — useLayoutEffect + ResizeObserver clientWidth · 폴백 640 (hooks/use-chart-width.ts — 33-06 10분 차트가 같이 쓴다)"
  - "TeamflowBandChart(data-slot teamflow-band-chart · role=img) — 순수 SVG · 측정 폭 1:1 viewBox"
  - "TeamflowToggle({ label, tone: 'accent' | 'muted', children }) — 접힘 토글 공용(data-slot teamflow-toggle · 33-06 「10분 표 보기」 가 재사용)"
  - "TeamflowBandTable(data-slot teamflow-band-table) — 6열 구간표"
  - "TeamflowMembers(data-slot teamflow-members · teamflow-member-row[data-member] · teamflow-member-buy/sell · teamflow-member-net · teamflow-members-none)"
  - "TeamflowDetail — 요약 → grid gap-4 xl:grid-cols-2 [teamflow-bands | teamflow-members] → teamflow-rules(판정 기준)"
affects: [33-06, 33-07, 33-08, 33-09]

# Actuals (#2632)
actuals:
  tokens: 10100
  tasks: 3
  commits: 7
commits: 7
plan_head_before: 81a6aa6a1df4a979cd9f07c2e775df4e7228300a
plan_head_after: fdd90998faf331ca070af58a88392347c1b249b2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "상세 차트는 측정 폭 → 순수 기하 함수 → viewBox 0 0 W H(1:1) · width 100% · height H — 글자 11px 이 늘어나지 않는다. 폭 측정은 useChartWidth 한 훅"
    - "상세 안 접힘은 TeamflowToggle 하나 — 닫히면 본문 언마운트 · 토글마다 상태 독립 · 행 접힘 = 상세 언마운트로 초기화"
    - "거래원 막대 폭 = 값 ÷ 그 종목 거래원 max(buy, sell) × 100 · null 칸은 채움 요소 자체를 그리지 않는다"

key-files:
  created:
    - webapp/src/hooks/use-chart-width.ts
    - webapp/src/components/analytics/teamflow-band-chart.tsx
    - webapp/src/components/analytics/teamflow-toggle.tsx
    - webapp/src/components/analytics/teamflow-band-table.tsx
    - webapp/src/components/analytics/teamflow-members.tsx
    - webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx
  modified:
    - webapp/src/lib/teamflow-chart.ts
    - webapp/src/lib/__tests__/teamflow-chart.test.ts
    - webapp/src/components/analytics/teamflow-detail.tsx

key-decisions:
  - "bandChartOf 막대 폭은 net_val null 과 정확히 0 둘 다 0(behavior 「최소 2 는 값이 0 이 아닐 때」) — action 문구의 「null 만 0」 보다 behavior 를 따랐다"
  - "구간 차트 반올림 0 값은 막대 · 값 글자 모두 --faint(must_haves 색 규칙) — 표의 팀 순매수 글자는 기존 TONE_TEXT(반올림 0 = --fg-2)"
  - "거래원 참고 줄은 막대 행이 있을 때만 — UI-SPEC T7 「rows 비고 absent 만 = 막대 없이 「상위 5 밖」 한 줄」 을 문자 그대로 지켰다"
  - "거래원 순매수 색은 주 부호 그대로(+ --up · − --down · 0 --fg-2) — toneOf 는 원→억 반올림 규칙이라 주 단위에 쓰지 않는다"
  - "범례 견본은 <span> — 33-01 RTL (j) 가 상세 section 안 <i> 0 개를 단언한다(요약 HTML 주입 차단 증거)"
  - "구간표는 Table 의 tbl-wrap(overflow-x-auto)이 가로 스크롤을 맡는다 — 바깥 래퍼에 overflow 를 겹치지 않았다"

patterns-established:
  - "teamflow 상세 블록 = data-slot 루트 + 소제목 줄(mb-2 flex flex-wrap items-baseline gap-x-2 · h3 14/600 + 캡션 12/400)"

requirements-completed: [TEAM-04]

coverage:
  - id: D1
    description: "bandChartOf 기하 골든 — 에스엠벡셀 행 9 · H 276 · cx 308 · 최대 막대 204 · y = 8 + 28i · 20% 점선 148 · 상한가 가격 isLimit / 천일고속 행 8 · H 248 · 120 / 하루 합계만 = 행 0 / 20~25% 첫 행 = 점선 없음 / 폭 0 = 640 / 음수 barX · null 0 · 최소 2 · 하한 5천만"
    requirement: TEAM-04
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/teamflow-chart.test.ts#bandChartOf"
        status: pass
    human_judgment: false
  - id: D2
    description: "구간 가로 막대 SVG — role=img 「에스엠벡셀 등락 구간별 팀 순매수 — 20% 아래 −3.3억 · 20%~상한 +2.2억」 · viewBox 0 0 640 276 · 9행 title 툴팁 · 2열 그리드 안 · 빈 상태 「구간 체결이 없어요」 + 토글 유지"
    requirement: TEAM-04
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx#TeamflowDetail — 구간 가로 막대 (T6)"
        status: pass
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx#bands 가 「하루 합계」 뿐"
        status: pass
    human_judgment: false
  - id: D3
    description: "「구간표 보기」 · 「판정 기준」 기본 접힘 · aria-expanded / 열림 때만 aria-controls · 서로 독립 · 행 접으면 초기화 · 구간표 6열 10행(하루 합계 마지막 · 주 + 억 · ±억 + ±주) · 판정 기준 6항목 + 출처 줄"
    requirement: TEAM-04
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx#TeamflowDetail — 접힘 토글 · 구간표 · 판정 기준 (T6 · T9 · D-14)"
        status: pass
    human_judgment: false
  - id: D4
    description: "다섯 창구 거래원 — net 내림차순 · null 맨 뒤 「—」 · null 칸 채움 없음 · 폭 정규화 · 캡션 {time} 기준(15:30 · 19:50) · 상위 5 밖 · 범례 · 참고 줄(한쪽만 · 없음) · members null / rows·absent 빔 = 「거래원 자료 없음」 · rows 빔 + absent = 한 줄"
    requirement: TEAM-04
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx#TeamflowDetail — 다섯 창구 거래원 (T7)"
        status: pass
    human_judgment: false
  - id: D5
    description: "실제 브라우저 배치 — xl 2열 반폭 · 폰 1열 · 측정 폭 재그리기 · 11px 글자 · 라벨 96/값 120 칸 겹침 0 · 거래원 xl 반폭 넘침 0 · 구간표 폰 가로 스크롤 · hover opacity"
    requirement: TEAM-04
    verification: []
    human_judgment: true
    rationale: "jsdom 은 레이아웃 · clientWidth 를 계산하지 않는다(폭 0 → 폴백 640 경로만 검증). 실제 배치 · 폭 백스톱은 33-08 E2E · 33-09 라이브 UAT 몫"

# Metrics
duration: 13min
completed: 2026-10-16
status: complete
---

# Phase 33 Plan 05: 상세 ① — 구간 가로 막대 · 거래원 2단 막대 · 구간표 · 판정 기준 Summary

**펼친 상세 요약 아래에 [측정 폭 1:1 순수 SVG 구간 가로 막대 | 다섯 창구 거래원 2단 막대] 2열(폰 1열)을 붙였습니다. 차트 아래 「구간표 보기」 6열 표와 상세 맨 아래 「판정 기준」 6항목은 공용 토글로 기본 접혀 있습니다. 기하는 `bandChartOf` 골든으로, 상태는 RTL 11케이스로 잠갔습니다.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-16T07:22:33Z
- **Completed:** 2026-10-16T07:35:04Z
- **Tasks:** 3 (트레이서 TDD 1 · auto TDD 2)
- **Files modified:** 9

## Accomplishments

- **구간 가로 막대:** `bandChartOf` 순수 함수가 「하루 합계」 를 뺀 bands 의 기하를 계산합니다(행 28 · 막대 16 · 라벨 96 · 값 120 · H = 24 + 행 수 × 28 · 스케일 하한 5천만). `useChartWidth` 가 래퍼 폭을 재고, `TeamflowBandChart` 는 viewBox 를 그 폭과 1:1 로 둡니다. 중앙 0선 · 20% 점선 · 오른쪽 값 · 매수 중 팀 % · 행마다 투명 히트 rect + `<title>` · 각주를 그리며, 차트 라이브러리는 import 하지 않습니다.
- **접힘 토글:** `TeamflowToggle` 은 button + `aria-expanded` 이고, 열렸을 때만 `aria-controls` 를 답니다. 닫히면 본문을 언마운트합니다. 33-06 「10분 표 보기」 가 그대로 재사용합니다.
- **구간표:** 6열 · bands 전부를 그리고 「하루 합계」 행은 마지막에 `--team-bg` · 600 으로 둡니다. 팀 매수/매도는 주 + 아랫줄 억, 팀 순매수는 ±억 + 아랫줄 ±주입니다.
- **판정 기준:** UI-SPEC 6항목을 문구 그대로 하드코딩하고 「출처: gh-trade 팀 매집 분석 규칙」 줄(링크 없음)을 붙였습니다.
- **거래원:** net 내림차순(null 뒤) 2단 막대입니다. 매수 `--up` · 매도 `--down` 이고 폭은 그 종목 max(buy, sell) 로 정규화합니다. 이어서 「상위 5 밖」 · 범례 · 참고 줄을 두고, 자료가 없으면 「거래원 자료 없음」 을 보입니다.

## Task Commits

1. **Task 1 (tracer · TDD) RED:** 구간 가로 막대 기하 골든 · 상세 접근 이름 실패 테스트 — `60fbbcda` (test)
2. **Task 1 (tracer · TDD) GREEN:** bandChartOf · useChartWidth · TeamflowBandChart · 2열 왼쪽 칸 — `7e387048` (feat)
3. **Task 2 (TDD) RED:** 구간표 · 판정 기준 접힘 토글 실패 테스트 — `4bc4f175` (test)
4. **Task 2 (TDD) GREEN:** TeamflowToggle · TeamflowBandTable · 판정 기준 — `6b48a8cf` (feat)
5. **Task 3 (TDD) RED:** 다섯 창구 거래원 실패 테스트 — `6673c224` (test)
6. **Task 3 (TDD) GREEN:** TeamflowMembers · 2열 오른쪽 칸 — `76c2c1d7` (feat)
7. **회귀 수정:** 범례 견본 `<i>` → `<span>` — `fdd90998` (fix)

트레이서 피드백 게이트: Task 1 `<verify>` 는 automated 만 있고 human_verify_mode 는 end-of-phase 입니다. 재실행 결과 13/13 통과해 확장을 진행했습니다.

## TDD Gate

세 RED 모두 vitest `--reporter=junit` 으로 캡처한 뒤 `gsd-tools check tdd-red-evidence` 에 넣었고, 셋 다 **RED_EVIDENCE_OK (target_test_failed)** 였습니다.

- **Task 1 RED:** 대상 `bandChartOf > 에스엠벡셀 640 — 행 9 · H 276 · …`
  - semanticAssessment: 모듈은 정상 로드됐고 기존 stripBarsOf 6케이스는 통과했습니다. 대상은 `bandChartOf is not a function`(계획한 함수 부재)으로 실패했습니다. RTL 은 role=img 이름을 찾지 못해 실패했습니다(차트 부재). 문법 · 픽스처 오류는 없었습니다.
- **Task 2 RED:** 대상 `「구간표 보기」 기본 접힘(표 없음) → 클릭 → …`
  - semanticAssessment: 4케이스 모두 「구간표 보기」 버튼 부재로 실패했습니다(토글 미구현). Task 1 케이스는 통과했습니다.
- **Task 3 RED:** 대상 `members null → 「거래원 자료 없음」 …`
  - semanticAssessment: 6케이스가 `teamflow-members` / `teamflow-members-none` 요소 부재로 실패했습니다(거래원 미구현). 앞 5케이스는 통과했습니다.
- **GREEN · REFACTOR:** GREEN 은 태스크마다 `feat(33-05)` 커밋 뒤 verify 명령이 통과했습니다. REFACTOR 커밋은 없습니다. 증거 기록 JSON 은 임시로 만들고 지웠습니다.

## Files Created/Modified

- `webapp/src/lib/teamflow-chart.ts` — bandChartOf · BAND_* 상수 · BandChart/BandChartRow 타입
- `webapp/src/hooks/use-chart-width.ts` — 측정 폭 훅(폴백 640)
- `webapp/src/components/analytics/teamflow-band-chart.tsx` — 구간 가로 막대 SVG
- `webapp/src/components/analytics/teamflow-toggle.tsx` — 공용 접힘 토글
- `webapp/src/components/analytics/teamflow-band-table.tsx` — 구간표 6열
- `webapp/src/components/analytics/teamflow-members.tsx` — 거래원 2단 막대
- `webapp/src/components/analytics/teamflow-detail.tsx` — 2열 그리드 · 구간표 토글 · 판정 기준 블록
- 테스트
  - `lib/__tests__/teamflow-chart.test.ts`: bandChartOf 6케이스 추가
  - `components/analytics/__tests__/teamflow-detail.test.tsx`: 신규 11케이스

## Decisions Made

key-decisions(프런트매터) 참조. 요지는 다음과 같습니다.
- 막대 폭: 0 값은 폭 0
- 차트 색: 반올림 0 은 `--faint`
- 참고 줄: 막대 행이 있을 때만
- 거래원 색: 주 부호로 판정
- 범례 견본: `<span>`
- 구간표 가로 스크롤: Table 래퍼에 맡김

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 거래원 범례 견본 `<i>` 가 33-01 RTL (j) 를 깨뜨렸습니다**
- **Found during:** 플랜 `<verification>`(analytics 전 RTL)
- **Issue:** `teamflow-report.test.tsx (j)` 는 상세 section 안에 `<i>` 가 0 개임을 단언합니다(요약의 허용 밖 태그 제거 증거). 범례 견본을 `<i>` 로 그려서 이 단언이 실패했습니다.
- **Fix:** 견본 요소를 `<span aria-hidden>` 으로 바꿨습니다. 모양 · 치수는 같습니다.
- **Files modified:** webapp/src/components/analytics/teamflow-members.tsx
- **Verification:** analytics 8파일 111/111 통과
- **Commit:** fdd90998

**2. [계약 정합] bandChartOf 0 값 막대 폭**
- 플랜 action 1 은 `barW = net_val == null ? 0 : max(2, …)` 이지만, behavior 는 「막대 최소 폭 2(값이 0 이 아닐 때)」 입니다. behavior 를 따라 정확히 0 인 값도 폭 0 으로 두고, 골든으로 잠갔습니다.

**3. [계약 정합] TeamflowBandChart name 폴백**
- 플랜은 `row.name ?? row.short_code` 입니다. short_code 도 null 일 수 있어(타입상 nullable) `?? row.isin` 을 덧붙였습니다. 접근 이름이 「null 등락 …」 이 되는 것을 막습니다.

---

**Total deviations:** 1 auto-fixed (Rule 1) + 계약 정합 2. **Impact:** 범위 밖 변경은 없습니다. 상한가 보고서 · Phase 32 파일도 바꾸지 않았습니다.

## Issues Encountered

- **샌드박스 명령 거부:** 변수가 든 복합 명령(`SP=…; pnpm … $SP`)은 worktree 격리 검사가 거부했습니다. 명령을 단순한 개별 호출로 나눠 실행했습니다.
- **플랜 커밋 원장:** 33-03 · 33-04 와 같이 세션 scratchpad 에 두었습니다. `commits: 7` 은 `git rev-list --count 81a6aa6a..HEAD` 로 실측한 값입니다.

## Known Stubs

없습니다. 「구간 체결이 없어요」 · 「거래원 자료 없음」 은 UI-SPEC 이 정한 빈 상태 문구이며, 모든 블록이 `row.payload` 실데이터에 연결돼 있습니다.

## Verification

- **Task 1 verify:** shared build + vitest(teamflow-chart · teamflow-detail) 13/13 통과
- **Task 2 verify:** shared build + vitest(teamflow-detail · teamflow-report) 21/21 통과
- **Task 3 verify:** shared build + webapp typecheck(tsc + e2e tsconfig) + vitest(teamflow-detail · teamflow-chart) 23/23 통과
- **플랜 `<verification>`:** `src/components/analytics/__tests__` 전부(상한가 포함)와 teamflow lib 2파일, 합계 8파일 111/111 통과(회귀 수정 후)
- **acceptance_criteria:** 전 항목 PASS
  - A: bandChartOf · useChartWidth · data-slot · xl:grid-cols-2 · recharts/lightweight-charts 0
  - B: aria-expanded · `<details` 0 · 하루 합계 · band-table slot · 출처 · 200µs · 넥스트레이드 제외
  - C: 48/1fr/88 · 상위 5 밖 · members-none · `<TeamflowMembers`
- **eslint:** 변경 9파일 무경고

## Next Phase Readiness

- **33-06 이 쓸 것**
  - `useChartWidth`: 10분 차트 폭 측정
  - `TeamflowToggle`: 「10분 표 보기」
  - `teamflow-detail.tsx` 의 2열 그리드와 `teamflow-rules` 사이 자리: 10분 블록(세로 16px · `gap-4` 가 이미 줌)
- **E2E 33-08 · UAT 33-09 몫:** 실제 xl 반폭 · 폰 배치와 폭 백스톱(라벨 96 / 값 120 칸 겹침 0) (coverage D5)

## Self-Check: PASSED

- **파일 존재 확인(FOUND):**
  - webapp/src/hooks/use-chart-width.ts
  - webapp/src/components/analytics/teamflow-band-chart.tsx
  - webapp/src/components/analytics/teamflow-toggle.tsx
  - webapp/src/components/analytics/teamflow-band-table.tsx
  - webapp/src/components/analytics/teamflow-members.tsx
  - webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx
- **커밋 존재 확인(FOUND):** 60fbbcda · 7e387048 · 4bc4f175 · 6b48a8cf · 6673c224 · 76c2c1d7 · fdd90998
