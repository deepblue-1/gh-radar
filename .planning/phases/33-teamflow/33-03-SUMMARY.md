---
phase: 33-teamflow
plan: 03
subsystem: ui
tags: [nextjs, react, svg, tailwind, vitest, rtl, teamflow, tds-tokens]

# Dependency graph
requires:
  - phase: 33-01
    provides: "/analytics/teamflow 셸 · TeamflowDayGrid 아코디언(1·2·3·7열) · lib/teamflow-report.ts(fmtEok · toneOf · fmtRate · kstHm · tagOf · sortRows · summaryPartsOf · factLineOf) · 10/14 실측 픽스처"
  - phase: 33-02
    provides: "team_flow 적재 완성(D-03 재적재 감지 · pgTAP) — 웹 쪽 코드 의존은 없음"
provides:
  - "kpisOf · TeamflowKpis — KPI 4칸(탐지 · 팀 순매수 종목 · 상한가 도달 · 팀 순매수 합)"
  - "fmtShare · isHotShare · fmtQty · BAND_SLOTS · bandSlotsOf · rowDescriptionOf (lib/teamflow-report.ts)"
  - "lib/teamflow-chart.ts — CHART_FALLBACK_W(640) · chartWidthOf · stripBarsOf · StripBar (33-05 · 33-06 이 덧붙임)"
  - "TeamflowKpiStrip(data-slot teamflow-kpis · data-kpi={라벨}) + 최소치 캡션"
  - "TeamflowBandStrip(data-slot teamflow-strip · viewBox 0 0 178 28 · prop slots)"
  - "TeamflowDayGrid 행 완성 — aria-hidden 열 머리(data-slot teamflow-list-head) · data-slot teamflow-high / teamflow-below20 / teamflow-above20 / teamflow-share / teamflow-net"
  - "CSS 토큰 --team · --team-bg (라이트 · 다크)"
affects: [33-04, 33-05, 33-06, 33-07, 33-08, 33-09]

# Actuals (#2632)
actuals:
  tokens: 13700
  tasks: 3
  commits: 5
commits: 5
plan_head_before: a4f31054575962ec53fdd02cb4af5ee102da7444
plan_head_after: 9c5586623209b01c33309077b0900354a0fdbf4d

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "차트 픽셀 기하는 lib/teamflow-chart.ts 순수 함수 · 글자 변환은 lib/teamflow-report.ts — 컴포넌트는 그리기만(기하 골든을 단위 테스트가 잠근다)"
    - "미니막대 = viewBox 고정 + preserveAspectRatio none + vector-effect non-scaling-stroke · 행별 스케일 mx = max(5천만, |값| 최대)"
    - "같은 DOM · CSS 전환 행 — 메타 묶음 xl:contents · 라벨 xl:sr-only · 단 두 줄 칸(20% 아래/위)의 라벨은 xl 에서도 보인다"
    - "금액 칸 null 「—」 = --faint, 값은 부호 색(반올림 0 = --fg-2) · KPI 합만 반올림 0 = --fg"

key-files:
  created:
    - webapp/src/lib/teamflow-chart.ts
    - webapp/src/lib/__tests__/teamflow-report.test.ts
    - webapp/src/lib/__tests__/teamflow-chart.test.ts
    - webapp/src/components/analytics/teamflow-kpi-strip.tsx
    - webapp/src/components/analytics/teamflow-band-strip.tsx
  modified:
    - webapp/src/lib/teamflow-report.ts
    - webapp/src/components/analytics/teamflow-day-grid.tsx
    - webapp/src/components/analytics/teamflow-report.tsx
    - webapp/src/components/analytics/__tests__/teamflow-report.test.tsx
    - webapp/src/styles/globals.css
    - webapp/src/styles/__tests__/tds-tokens.test.ts

key-decisions:
  - "억 반올림을 33-01 의 「0.5 는 0 에서 먼 쪽」 에서 Math.round 로 바꿨다 — 플랜 골든 fmtEok(−5,000,000) = 「0.0억」(RESEARCH A4) 잠금이 정본. 등락률(fmtRate)은 대칭 반올림 그대로"
  - "TeamflowBandStrip 은 prop slots(bandSlotsOf 결과)를 받는다 — 플랜 action 문구(bands)와 key_links(slots)가 갈려 key_links 를 따름 · 슬롯 계산은 행(day-grid)에서 한 번"
  - "TeamflowDayGrid 는 열 머리 div + ol 을 fragment 로 돌려준다 — 부모 카드(section) 구조는 그대로 · key=date 리마운트 유지"
  - "KPI 의 kpisOf 입력은 정렬된 rows(같은 집합) — 개수 · 합은 순서와 무관"

patterns-established:
  - "teamflow 차트 기하 모듈: 상수(칸 · 사이 · 0선 · 최대 높이 · 스케일 하한) + 순수 함수 → 골든 테스트"
  - "행 sr 설명은 lib(rowDescriptionOf) 한 함수 — 보이는 칸 조건(고가 보조줄)과 같은 조건을 쓴다"

requirements-completed: [TEAM-03]

coverage:
  - id: D1
    description: "KPI 4칸 — 10/14 = 34 · 9 · 9 · 「−26.3억」(4번째만 --down) · 반올림 0 합 = 「0.0억」 --fg · null 행 제외 · 행 0 날 KPI 없음"
    requirement: TEAM-03
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/teamflow-report.test.ts#kpisOf (D-11)"
        status: pass
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-report.test.tsx (k)(m)(n)"
        status: pass
    human_judgment: false
  - id: D2
    description: "최소치 캡션 「탐지 = 20%↑ 또는 상한가 체결 종목 · 팀 수치는 들어와서 친 체결만 센 최소치예요」 가 KPI 아래 항상 보임 · 머리 → KPI → 캡션 → 카드 순서"
    requirement: TEAM-03
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-report.test.tsx (k)"
        status: pass
    human_judgment: false
  - id: D3
    description: "표시 변환 골든(+7.0억 · −3.1억 · 0.2억 · 0.0억 · +1,234.5억 · 26% · 37% · +22.6% · 11:50 · fmtQty) · 정렬 상위 5 · null 맨 뒤 · 동률 isin"
    requirement: TEAM-03
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/teamflow-report.test.ts"
        status: pass
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-report.test.tsx (l)"
        status: pass
    human_judgment: false
  - id: D4
    description: "9칸 미니막대 — bandSlotsOf 고정 슬롯(0% 미만 없음 = 빈 선 · 모르는 label 무시) · stripBarsOf 기하(x i×20 · h max(1.5,|v|÷mx×12) · mx 하한 5천만) · SVG viewBox 0 0 178 28 · 칸 title"
    requirement: TEAM-03
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/teamflow-chart.test.ts · teamflow-report.test.ts#BAND_SLOTS · bandSlotsOf"
        status: pass
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-report.test.tsx (o)"
        status: pass
    human_judgment: false
  - id: D5
    description: "행 완성 — 열 머리 · 결과 보조줄 「고가 +29.3%」(미도달만) · 20% 아래/위 · 매수 중 팀(≥30% --team 600 · null 「—」 --faint) · name null = short_code · sr 설명 전문"
    requirement: TEAM-03
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/analytics/__tests__/teamflow-report.test.tsx (o)(p)"
        status: pass
    human_judgment: false
  - id: D6
    description: "xl 7열 / 폰 390 2줄 카드형 실제 배치 · 폭 백스톱(페이지 가로 스크롤 0 · 148 칸 말줄임) · 미니막대 시각 비율"
    requirement: TEAM-03
    verification: []
    human_judgment: true
    rationale: "jsdom 은 CSS 그리드 · 컨테이너 폭을 계산하지 않는다 — 클래스 계약만 테스트됨. 실제 배치는 33-08 E2E · 33-09 라이브 UAT 몫"
  - id: D7
    description: "--team · --team-bg 라이트 · 다크 값 고정 · oklch 부재"
    verification:
      - kind: unit
        ref: "webapp/src/styles/__tests__/tds-tokens.test.ts"
        status: pass
    human_judgment: false

# Metrics
duration: 11min
completed: 2026-10-16
status: complete
---

# Phase 33 Plan 03: 팀 매집 목록 완성 Summary

**KPI 4칸(10/14 = 34 · 9 · 9 · −26.3억) + 최소치 캡션, 행마다 결과 보조줄 · 20% 아래/위 · 매수 중 팀 · 9칸 SVG 미니막대(viewBox 0 0 178 28 · 행별 스케일)를 xl 7열 / 폰 카드형 한 DOM 으로 — 표시 변환 · 막대 기하 골든과 --team 토큰을 테스트로 잠갔다**

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-16T06:48:57Z
- **Completed:** 2026-10-16T06:59:56Z
- **Tasks:** 3 (트레이서 TDD 1 · auto TDD 1 · auto 1)
- **Files modified:** 11

## Accomplishments

- KPI 띠 — `kpisOf` → `TeamflowKpiStrip`(limitup 복제 · 치수 불변 · 4번째 칸만 부호 색) → 최소치 캡션(항상 보임) → 탐지 종목 카드
- 행 완성 — aria-hidden 열 머리 7칸 · 결과 태그 + 미도달 보조줄 · 팀 순매수 14/600 · 20% 아래/위 두 줄 · 매수 중 팀(≥30% `--team` 600) · 9칸 미니막대 · sr 설명 전문(`rowDescriptionOf`)
- `lib/teamflow-chart.ts` 신설 — 미니막대 기하 순수 함수(33-05 · 33-06 이 차트 기하를 덧붙일 자리)
- 팀 축 토큰 `--team` · `--team-bg` 를 `:root` · `.dark` 둘 다 · 토큰 테스트 고정

## Task Commits

1. **Task 1 (tracer · TDD) RED: KPI · 변환 골든 실패 테스트** - `fb8a217c` (test)
2. **Task 1 (tracer · TDD) GREEN: kpisOf → TeamflowKpiStrip → 캡션** - `1835dfae` (feat)
3. **Task 2 (TDD) RED: 행 완성 · 미니막대 기하 실패 테스트** - `bc01acff` (test)
4. **Task 2 (TDD) GREEN: lib 함수 · teamflow-chart · BandStrip · DayGrid 행 완성** - `affdef74` (feat)
5. **Task 3: --team · --team-bg + 토큰 테스트** - `9c558662` (feat)

트레이서 피드백 게이트: Task 1 `<verify>`(automated only · human_verify_mode end-of-phase) 재실행 통과 → 확장 진행.

## TDD Gate

- **Task 1 RED:** 대상 `kpisOf (D-11) > 10/14 픽스처 = 탐지 34 · …` — vitest `--reporter=junit` 재캡처(33-02 와 같은 이유: tap-flat 은 분류기에 malformed) → `gsd-tools check tdd-red-evidence` **RED_EVIDENCE_OK (target_test_failed)**.
  - semanticAssessment: 모듈은 정상 로드되고 대상 테스트가 실행돼 `kpisOf is not a function`(계획한 함수 부재)으로 실패했다. 같은 실행에서 `fmtEok(−5,000,000)` 골든도 「−0.1억」 으로 실패 — 33-01 반올림 규칙과 골든의 실제 차이(아래 Deviation 1). 문법 · 픽스처 오류 없음.
- **Task 2 RED:** 대상 `BAND_SLOTS · bandSlotsOf (UI-SPEC T4) > 에스엠벡셀 = 9칸 전부 · 「하루 합계」 제외` → **RED_EVIDENCE_OK (target_test_failed)**.
  - semanticAssessment: 대상 테스트는 `bandSlotsOf is not a function` 으로 실패(행동 부재). 같은 커밋의 `teamflow-chart.test.ts` 는 모듈 자체가 없어 import 해석 실패(로드 실패)였다 — 분류기 대상이 아니며, GREEN 에서 모듈 생성 후 5케이스 모두 통과.
- GREEN: 두 태스크 모두 `feat(33-03)` 커밋 후 verify 명령 통과. REFACTOR 커밋 없음.
- 증거 기록 파일은 임시로 만들고 지웠다(저장소에 남기지 않음).

## Files Created/Modified

- `webapp/src/lib/teamflow-report.ts` — kpisOf · fmtShare · isHotShare · fmtQty · BAND_SLOTS · bandSlotsOf · rowDescriptionOf · 억 반올림 Math.round
- `webapp/src/lib/teamflow-chart.ts` — CHART_FALLBACK_W · chartWidthOf · stripBarsOf
- `webapp/src/components/analytics/teamflow-kpi-strip.tsx` — KPI 4칸
- `webapp/src/components/analytics/teamflow-band-strip.tsx` — 9칸 미니막대 SVG
- `webapp/src/components/analytics/teamflow-day-grid.tsx` — 열 머리 · 행 7열/카드형 완성
- `webapp/src/components/analytics/teamflow-report.tsx` — KPI · 캡션 배치
- `webapp/src/styles/globals.css` · `__tests__/tds-tokens.test.ts` — 팀 축 토큰
- 테스트: `lib/__tests__/teamflow-report.test.ts`(신규 30케이스) · `lib/__tests__/teamflow-chart.test.ts`(신규 6케이스) · RTL (k)~(p) 6케이스 추가

## Decisions Made

key-decisions(프런트매터) 참조 — 반올림 규칙 정렬 · BandStrip prop `slots` · DayGrid fragment 반환 · kpisOf 입력.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 억 반올림이 플랜 골든과 달랐다**
- **Found during:** Task 1 RED
- **Issue:** 33-01 `eokOf` 는 0.5 를 0 에서 먼 쪽으로 반올림 → `fmtEok(−5,000,000, {signed})` = 「−0.1억」. 플랜 behavior 골든 · RESEARCH A4 는 「0.0억」(JS `Math.round`).
- **Fix:** `eokOf` 를 `Math.round(won / 1e7) / 10` 으로(플랜 action 1 「골든에 맞지 않으면 고친다」). fmtRate 의 대칭 반올림은 그대로.
- **Files modified:** webapp/src/lib/teamflow-report.ts
- **Verification:** 골든 30케이스 · RTL 통과 · 33-01 RTL (a)~(j) 회귀 없음
- **Commit:** 1835dfae

**2. [계약 정합] TeamflowBandStrip prop 이름**
- 플랜 Task 2 action 3 은 `TeamflowBandStrip({ bands })`, key_links 는 `bandSlotsOf(...) → <TeamflowBandStrip slots>`. key_links 를 따라 `slots` 로 받는다(슬롯 계산은 행에서 한 번). 동작 차이 없음.

**3. [커버리지 추가] RTL (o)(p)**
- Task 2 files 목록에 RTL 파일은 없지만 verify 가 그 파일을 돌린다 — 열 머리 · 행마다 9칸 strip · 고가 보조줄 · 20% 칸 · ≥30% `--team` · null 「—」 · name null 을 화면 수준에서 잠갔다.

---

**Total deviations:** 1 auto-fixed (Rule 1) + 계약 정합 1 + 커버리지 추가 1. **Impact:** 범위 밖 변경 없음 · 상한가 보고서 파일 무변경.

## Issues Encountered

- Task 2 GREEN 중 `npx prettier --write` 를 한 번 돌렸는데 저장소에 prettier 설정이 없어 기본값(큰따옴표 · 80열)으로 6파일이 재포맷됐다. 커밋 전에 추적 파일은 `git checkout -- <파일>`(개별 경로)로 되돌리고 새 파일 · 변경분은 원래 스타일로 다시 썼다 — 커밋된 내용에는 영향 없음(eslint 무경고).
- 샌드박스가 `.git/worktrees/phase-33/` 안 쓰기를 거부해 플랜 커밋 원장(protocol 0c)을 세션 scratchpad 에 두었다 — `commits: 5` 는 `git rev-list --count a4f31054..HEAD` 실측.

## Known Stubs

없음 — 새 컴포넌트는 모두 실제 응답 행(`resp.rows` · `payload.bands`)에 연결돼 있다.

## Verification

- Task 1 verify: shared build + vitest(teamflow-report lib · RTL) — 통과
- Task 2 verify: shared build + webapp typecheck + vitest(lib · chart · RTL) — 통과(46/46)
- Task 3 verify: tds-tokens — 통과(71/71)
- 플랜 `<verification>`: limitup-day-grid · limitup-report 회귀 포함 6파일 141/141 통과
- acceptance_criteria 전 항목 PASS(`formatTradeAmount` 0 · limitup-kpi-strip / limitup-day-grid diff 없음 · `--team:` 2 · `--team-bg:` 2)
- eslint(변경 9파일) 무경고

## Next Phase Readiness

- 33-04 이후가 쓸 것: `lib/teamflow-chart.ts`(차트 기하 덧붙일 자리 · `chartWidthOf` 폴백) · `--team` / `--team-bg` 토큰 · `fmtQty` · `fmtShare` · `isHotShare`.
- 「상한가 도달」 = 종가 기준(status limit) — 33-09 라이브 UAT 에서 라벨 확인 예정(플랜 Flagged assumption, 이 플랜은 바꾸지 않음).
- 실제 xl / 폰 배치 · 폭 백스톱은 E2E(33-08) · UAT(33-09) 몫(coverage D6).

## Self-Check: PASSED

- FOUND: webapp/src/lib/teamflow-chart.ts · webapp/src/components/analytics/teamflow-kpi-strip.tsx · webapp/src/components/analytics/teamflow-band-strip.tsx · webapp/src/lib/__tests__/teamflow-report.test.ts · webapp/src/lib/__tests__/teamflow-chart.test.ts
- FOUND commits: fb8a217c · 1835dfae · bc01acff · affdef74 · 9c558662
