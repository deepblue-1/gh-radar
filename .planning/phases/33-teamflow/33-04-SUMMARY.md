---
phase: 33-teamflow
plan: 04
subsystem: ui
tags: [nextjs, sidebar, playwright, e2e, teamflow, backstop]

# Dependency graph
requires:
  - phase: 33-01
    provides: "/analytics/teamflow 셸 · TeamflowDayGrid 아코디언 · DmaGate surface 「팀 매집」 · @/test-fixtures/teamflow-export(10/14 34행)"
  - phase: 33-03
    provides: "KPI 4칸(data-kpi) · 행 완성(data-slot teamflow-tag / teamflow-above20 / teamflow-strip / teamflow-row-chevron) · xl 7열 / 폰 카드형"
provides:
  - "사이드바 「분석 › 팀 매집」 — NAV_TEAMFLOW(/analytics/teamflow) · teamflowActive · SubNavLink item=teamflow(상한가 보고서 다음 · AI 애널리스트 앞)"
  - "E2E 픽스처 e2e/fixtures/teamflow-report.ts — TEAMFLOW_LATEST · TEAMFLOW_DATES · teamflowE2EFixture({date, worst}) · WORST_ROW(합성)"
  - "E2E spec e2e/specs/teamflow-report.spec.ts — P33-TF1~4 · P33-TF-B1~B3(installTeamflowMocks · 가로 넘침 = 문서 + main)"
affects: [33-05, 33-06, 33-07, 33-08, 33-09]

# Actuals (#2632)
actuals:
  tokens: 7060
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 3b4abd08c3d2ccb61ff69ea911d05e9a6f11c861
plan_head_after: 14bc3d4dcb2e02ce9ca99aed1de33686254b3a66

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "E2E 가로 넘침은 문서 스크롤과 앱 셸 main(overflow-auto) 둘 다 잰다 — main 이 스크롤 주체라 문서만 보면 넘침을 놓친다"
    - "E2E 픽스처는 @/test-fixtures 실 export 를 감싸고 합성 응답 · 합성 행은 머리 주석에 「합성」 으로 표시"

key-files:
  created:
    - webapp/e2e/fixtures/teamflow-report.ts
    - webapp/e2e/specs/teamflow-report.spec.ts
  modified:
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/e2e/specs/sidebar-tree.spec.ts

key-decisions:
  - "백스톱 T3 「한 줄」 판정을 「이름 · 태그 · 셰브론 top 8px 안」 에서 「태그 · 셰브론 top 8px 안 + 둘 다 이름 줄과 세로 겹침 + (390) 셋 다 미니막대 줄 위」 로 바꿨다 — 종목 칸이 이름 + 코드 두 줄 묶음이라 items-center 행에서 태그 · 셰브론이 묶음 가운데(이름 top +10px)에 선다. 스크린샷으로 한 줄 배치 확인"
  - "사이드바 diff 최소(12줄) — 상수 1 · 활성 1 · li 1. 레일 전용 아이콘 없음(「분석」 아이콘이 /analytics 접두로 켜짐)"

patterns-established:
  - "teamflow E2E 목: page.route('**/api/teamflow/report*') — d 기록 · mode403 · DATES 밖 = rows []"

requirements-completed: [TEAM-02, TEAM-03]

coverage:
  - id: D1
    description: "사이드바 「분석」 하위 = 상한가 보고서 → 팀 매집 → AI 애널리스트 · 팀 매집 href /analytics/teamflow · data-sidebar-item teamflow"
    requirement: TEAM-02
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#tradingVisible 참 → … 하위 = 상한가 보고서 · 팀 매집 · AI 애널리스트"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts (TREE_LINKS 순서 · 링크 수)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/analytics/teamflow 에서 「팀 매집」 만 aria-current · 선택 토큰 · 「상한가 보고서」 꺼짐"
    requirement: TEAM-02
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#/analytics/teamflow → 하위 「팀 매집」 만 활성"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/teamflow-report.spec.ts#P33-TF1"
        status: pass
    human_judgment: false
  - id: D3
    description: "트레이딩 권한 없음(비로그인 · unauthorized · 판정 전) → 「팀 매집」 미렌더 · 매핑 없음 직접 진입 → 403 → DmaGate"
    requirement: TEAM-02
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#tradingVisible 거짓 → 「팀 매집」 미렌더"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts#2b (경로 배열에 /analytics/teamflow + 403 목)"
        status: pass
    human_judgment: false
  - id: D4
    description: "1280 — 사이드바 클릭 → KPI 34 · 9 · 9 · −26.3억 → 캡션 → 34행 · 첫 행 한선엔지니어링 · 전부 접힘 · 열 머리 보임 · 천일고속 상세가 바로 다음 형제 · 동양고속 → 천일고속 상세 사라짐 · 연 행 y > 40 · 재클릭 접힘"
    requirement: TEAM-03
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/teamflow-report.spec.ts#P33-TF1"
        status: pass
    human_judgment: false
  - id: D5
    description: "390 카드형 — 열 머리 숨김 · 메타 라벨 3종 · 셰브론 · 미니막대 ≥ 행 폭 90% · 가로 스크롤 0"
    requirement: TEAM-03
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/teamflow-report.spec.ts#P33-TF2"
        status: pass
    human_judgment: false
  - id: D6
    description: "날짜 알약 ‹ → d=20261013 · 최신에서 › disabled · ?d=2026 → replace · ?d=20261010 빈 상태 → 「최신 보고서 보기」 → ?d=20261014 · 403 → DmaGate 「팀 매집은」"
    requirement: TEAM-03
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/teamflow-report.spec.ts#P33-TF3 · P33-TF4"
        status: pass
    human_judgment: false
  - id: D7
    description: "폭 백스톱 T1(머리 설명 break-keep · 알약 뷰포트 안) · T2(KPI −1,234.5억 잘림 0) · T3(15자 이름 말줄임 + title · 태그 잘림 0 · 한 줄 · 20%~상한 칸) — 390 · 1280"
    requirement: TEAM-03
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/teamflow-report.spec.ts#P33-TF-B1 · B2 · B3"
        status: pass
    human_judgment: false

# Metrics
duration: 17min
completed: 2026-10-16
status: complete
---

# Phase 33 Plan 04: 사이드바 「분석 › 팀 매집」 + 목록 E2E Summary

**사이드바 「분석」 하위에 「팀 매집」(/analytics/teamflow · 상한가 보고서 다음)을 넣었다. 실브라우저에서 사이드바 → KPI → 34행 아코디언 → 날짜 알약 → 빈 상태 → 403 게이트 흐름이 1280 · 390 두 폭에서 통과했고, UI-SPEC 폭 백스톱 T1 · T2 · T3 은 실측으로 잠갔다(E2E 7케이스).**

## Performance

- **Duration:** 17 min(다른 세션이 3100 포트를 쓰는 동안 기다린 약 6분 포함)
- **Started:** 2026-10-16T07:02:43Z
- **Completed:** 2026-10-16T07:19:13Z
- **Tasks:** 2 (tracer 1 · auto 1)
- **Files modified:** 5

## Accomplishments

- 사이드바: `NAV_TEAMFLOW` · `teamflowActive` · `SubNavLink item="teamflow"`를 넣었다. 권한 노출 조건은 「분석」 그룹과 같은 `tradingVisible`이다.
- 단위 테스트에서 순서 배열 2곳과 subLinks `[limitup-report, teamflow, chat]`를 고쳤고, 미노출 3상태와 활성 단언 2개를 새로 넣었다(67/67).
- sidebar-tree E2E: `TREE_LINKS`에 「팀 매집」을 넣었다. 2b 게이트 직접 진입 루프에는 `/analytics/teamflow`와 `api/teamflow/report` 403 목을 더했다(9/9).
- 팀 매집 E2E 7케이스: P33-TF1~4는 흐름 검증, P33-TF-B1~B3은 폭 백스톱이다(8/8, setup 포함).

## Task Commits

1. **Task 1 (tracer): 사이드바 「분석 › 팀 매집」 + 단위 · sidebar-tree E2E** - `0244bd48` (feat)
2. **Task 2: 팀 매집 목록 E2E 픽스처 + spec** - `14bc3d4d` (test)

트레이서 피드백 게이트: Task 1 `<verify>`는 자동 검증뿐이다(human_verify_mode end-of-phase). 재실행해 vitest 67/67, Playwright 9/9로 통과한 뒤 다음 태스크로 넘어갔다.

## Files Created/Modified

- `webapp/src/components/layout/app-sidebar.tsx` — 상수 · 활성 판정 · 하위 li(+12줄)
- `webapp/src/components/layout/__tests__/app-sidebar.test.tsx` — 순서 · subLinks · 새 it 2개
- `webapp/e2e/specs/sidebar-tree.spec.ts` — TREE_LINKS · 머리 주석 · 게이트 루프
- `webapp/e2e/fixtures/teamflow-report.ts`(신규) — 실 export 감싸기 · 20261013 합성 · WORST_ROW 합성
- `webapp/e2e/specs/teamflow-report.spec.ts`(신규) — P33-TF1~4 · P33-TF-B1~B3

## Decisions Made

결정 내용은 프런트매터 key-decisions에 있다: 백스톱 T3의 「한 줄」 판정 기준과 사이드바 diff 최소화.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 기준 결함] 백스톱 T3 「top 8px 안」 기준이 실제 배치와 맞지 않았다**
- **Found during:** Task 2(P33-TF-B3 첫 실행)
- **Issue:** 390에서 측정한 top 값은 이름 463, 태그 472.5, 셰브론 474.5로 차이가 11.5px였다. 종목 칸이 이름 + 「코드 · 시장」 두 줄 묶음이고 행 그리드가 `items-center`라서, 태그와 셰브론은 묶음 가운데에 선다. 배치 결함이 아니다(스크린샷으로 한 줄 확인).
- **Fix:** 판정 기준을 바꿨다. 태그와 셰브론의 top 차이는 8px 이하여야 하고, 둘 다 이름 줄과 세로로 겹쳐야 한다. 390에서는 이름 · 태그 · 셰브론 셋 다 미니막대 줄 위에 있어야 한다. xl에서는 미니막대가 같은 줄 6열이라 이 항목을 보지 않는다. 겹침 0 · 순서 · 셰브론이 행 안에 있는지 · 태그 잘림 0 · 이름 말줄임 + title은 그대로 단언한다.
- **Files modified:** webapp/e2e/specs/teamflow-report.spec.ts
- **Verification:** 8/8 통과. 390 · 1280 행 스크린샷에서 한 줄 배치 확인.
- **Committed in:** 14bc3d4d

**2. [보강] 가로 넘침을 앱 셸 `main`에서도 잰다**
- 플랜 문법은 `document.scrollingElement.scrollWidth <= window.innerWidth`이다. 그런데 앱 셸 `main`이 `overflow-auto`라서 넘침이 main 안에서만 생길 수 있다. 그래서 `main.scrollWidth <= main.clientWidth`도 함께 단언한다.

**3. [보강] P33-TF4 · TF3 단언 추가**
- 게이트와 빈 상태에서 KPI · 목록이 0개인지도 확인한다. 알약을 20261013으로 옮긴 뒤 ‹ 버튼이 disabled인지도 본다.

---

**Total deviations:** 1 auto-fixed(Rule 1, 테스트 기준) + 보강 2. **Impact:** 제품 코드 변경은 사이드바뿐이다. Phase 32 파일 · 상한가 보고서 파일 변경 없음.

## Issues Encountered

- **3100 포트 공유:** 실행 중에 다른 세션(메인 체크아웃 `/Users/alex/repos/gh-radar/webapp`)의 Next dev 서버가 두 번 3100을 잡았다. 그 프로세스는 건드리지 않았다.
  - 첫 번째(16:08)에는 webServer가 일찍 종료돼 실행 자체가 실패했다.
  - 두 번째(16:10:52)에는 limitup 회귀 실행이 그 서버를 재사용해 무효가 됐다.
  - 두 경우 모두 포트가 빌 때까지 기다린 뒤 다시 돌렸다. 최종 실행 4건은 모두 이 worktree의 `next dev`가 기동한 것을 확인했다. 팀 매집 8/8은 메인 체크아웃에 `/analytics/teamflow` 라우트가 없으므로 이 worktree 서버로만 통과할 수 있다.
- **`.next` 캐시 증상:** limitup 회귀 재실행 때 `NextFontGoogleFontFileReplacer` 반복이 나타났다. 이 worktree의 `webapp/.next`를 지우고 재실행해 4/4 통과했다.
- **플랜 커밋 원장:** 33-03과 같이 세션 scratchpad에 두었다. `commits: 2`는 `git rev-list --count 3b4abd08..HEAD`로 실측한 값이다.

## Known Stubs

없음.

## Verification

- Task 1 verify: shared build ✓, vitest app-sidebar 67/67 ✓, Playwright sidebar-tree 9/9 ✓
- Task 2 verify: shared build ✓, Playwright teamflow-report 8/8 ✓(P33-TF 7 + setup)
- 플랜 `<verification>`: Playwright limitup-report 4/4 ✓(자기 서버, 회귀 없음)
- eslint(변경 5파일) 무경고, `tsc --noEmit`(tsconfig.json) 통과, tsconfig.e2e.json에서 변경 파일 오류 0
- acceptance: `NAV_TEAMFLOW = …` ✓, `item="teamflow"` ✓, `["limitup-report", "teamflow", "chat"]` ✓, `"팀 매집"` 4회(≥3) ✓, sidebar-tree `'팀 매집'` · `'/analytics/teamflow'` · `api/teamflow/report` ✓, `test('P33-TF` 7회 ✓, `mode: 'serial'` ✓, 픽스처 `@/test-fixtures/teamflow-export` · 「합성」 ✓

## Next Phase Readiness

- 33-05 이후 상세(구간 차트 · 10분 차트) E2E는 `installTeamflowMocks` · `teamflowE2EFixture` · `WORST_ROW`를 재사용할 수 있다.
- 실제 라이브 데이터 배치 · 색 확인은 33-09 UAT 몫이다.

## Self-Check: PASSED

- FOUND: webapp/e2e/fixtures/teamflow-report.ts · webapp/e2e/specs/teamflow-report.spec.ts · webapp/src/components/layout/app-sidebar.tsx
- FOUND commits: 0244bd48 · 14bc3d4d
