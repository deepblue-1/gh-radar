---
phase: 28-limitup-feature-ingest
plan: 12
subsystem: webapp
tags: [nextjs, react, analytics, limitup, sidebar, svg, sparkline, vitest, playwright]
status: complete

requires:
  - phase: 28-10
    provides: "GET /api/limitup/report?d= · /api/limitup/grid-urls?d= · shared limitup-report.ts 계약 타입"
provides:
  - "/analytics/limitup?d=YYYYMMDD — 머리 · 날짜 알약 ‹ › · KPI 5칸 · 하루 격자(2단/8열 · 스파크라인 · 결과 태그) · 빈/로딩/에러/게이트"
  - "webapp lib/limitup-report.ts — kpisOf · stocksOf · resultTagsOf · dayRowsOf · dateNavOf · parseYmdParam · fmtYmdLabel · fmtYmdShort · kstClock · spark* 헬퍼"
  - "webapp lib/limitup-api.ts — fetchLimitupReport · fetchLimitupGridUrls"
  - "사이드바 「분석 › 상한가 보고서」(tradingVisible · 제목만 활성) · DmaGateSurface 「상한가 보고서」"
  - "격자 행 → #ev-{isin} 스크롤 + h3 포커스(scrollToEventCard) — 28-13 사건 카드가 받을 자리"
affects: [28-13, 28-14, 28-15]

actuals:
  tokens: 24800
  tasks: 3
  commits: 3
plan_head_before: 03ddba0b9904b46c68e242225caf04722dcfdd2b

tech-stack:
  added: []
  patterns:
    - "같은 DOM · CSS 로만 배치 전환 — 메타 묶음은 xl 에서 `contents` 로 풀려 칸마다 `xl:col-start-N` 을 잡고 라벨은 `xl:sr-only`"
    - "inline SVG 스파크라인(viewBox 0 0 2340 100 · preserveAspectRatio none · non-scaling-stroke) + 깨짐 ● HTML 오버레이"
    - "GroupHeading 의 시각 활성(active)과 aria-current(ariaCurrent)를 분리 — 접두 일치 그룹은 정확 일치일 때만 aria-current"

key-files:
  created:
    - webapp/src/lib/limitup-api.ts
    - webapp/src/lib/limitup-report.ts
    - webapp/src/lib/__tests__/limitup-report.test.ts
    - webapp/src/test-fixtures/limitup-report.ts
    - webapp/src/app/analytics/limitup/page.tsx
    - webapp/src/components/analytics/limitup-report.tsx
    - webapp/src/components/analytics/limitup-date-nav.tsx
    - webapp/src/components/analytics/limitup-kpi-strip.tsx
    - webapp/src/components/analytics/limitup-day-grid.tsx
    - webapp/src/components/analytics/limitup-sparkline.tsx
    - webapp/src/components/analytics/__tests__/limitup-report.test.tsx
    - webapp/src/components/analytics/__tests__/limitup-day-grid.test.tsx
  modified:
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/components/trading/dma-gate.tsx
    - webapp/e2e/specs/sidebar-tree.spec.ts

key-decisions:
  - "KPI 값 정의는 gh-trade report.py _section_b_grid 그대로(같은 숫자 원칙) — UI-SPEC ④-2 표의 정의 문구(entries 행 수 · 잠김 수 · 평균)는 쓰지 않고 라벨 · 표기만 따른다"
  - "스파크 곡선은 q_krw null 에서 끊는다(gh-trade 는 0 으로 채운다) — 결측을 0원으로 그리지 않는다(플랜 behavior)"
  - "종목 라벨 폴백 = 이름 → 코드 → isin(gh-trade _label 은 이름 → isin) — 실데이터 20% 가 이름 · 코드 둘 다 null"
  - "종가 · 상한가는 entries 값이 정본, 결측일 때만 그 종목 첫 잠김 행으로 보탠다(결과 태그 판정)"
  - "dateNavOf 는 목록에 없는 날짜(적재 안 됨)에서도 앞뒤 적재 날짜로 간다 · ‹ › 는 마지막으로 받은 dates 로 판정해 날짜 이동 중 깜빡이지 않는다"
  - "보고서 조회 타임아웃 15초(기본 8초) — 실데이터 하루 ≈ 400KB 를 RPC 1회로 묶는다"
  - "모바일 탭바는 네이티브(mobile/ GhTradeTabBar)라 webapp layout 에 탭바 파일이 없다 — analytics 항목 추가 없음"

requirements-completed: [D-09, D-10, D-11, D-12]

coverage:
  - deliverable: "보고서 계산 lib(KPI · 결과 태그 · 행 순서 · 메타 · 날짜 · ?d · 스파크) + API 경로"
    human_judgment: false
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limitup-report.test.ts (29건)"
        status: pass
  - deliverable: "/analytics/limitup 페이지 — 머리 · 날짜 알약 · KPI · 하루 격자 · 빈/로딩/에러/게이트 상태"
    human_judgment: false
    verification:
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/limitup-report.test.tsx (11건)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/limitup-day-grid.test.tsx (10건)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts#6 (분석 클릭 → 빈 이력 빈 상태) · #2b (/analytics/limitup 게이트)"
        status: pass
  - deliverable: "사이드바 「분석 › 상한가 보고서」(노출 · 순서 · 제목만 활성 · 레일)"
    human_judgment: false
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx (54건 · 신규 6)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts (9건)"
        status: pass
  - deliverable: "격자 시각 품질(폰 2단 · xl 8열 · 말줄임 · 실데이터 형태)"
    human_judgment: true
    rationale: "실데이터 20261002 export 로 390 · 820 · 1280 · 1440 스크린샷을 executor 가 확인했다(가로 넘침 0). 취향 판단은 사용자 UAT 몫"

duration: 16min
completed: 2026-10-05
---

# Phase 28 Plan 12: 보고서 ① — 메뉴 · 게이트 · 날짜 · KPI · 하루 격자 Summary

**사이드바 「분석 › 상한가 보고서」에서 여는 `/analytics/limitup?d=` 를 만들었다. 날짜 알약 ‹ › 는 적재된 날짜 사이를 오가고, KPI 5칸은 gh-trade `_section_b_grid` 와 같은 정의로 계산한다. 하루 격자는 같은 DOM 으로 폰 2단과 xl 8열을 모두 그리고, 행마다 중립색 SVG 스파크라인과 결과 태그를 단다.**

## Performance

- **Duration:** 약 16분
- **Started:** 2026-10-05T10:45:42Z
- **Completed:** 2026-10-05T11:01:14Z
- **Tasks:** 3
- **Files:** 신규 12 · 수정 4

## Accomplishments

- `lib/limitup-report.ts`: KPI · 행 순서 · 결과 태그 · 행 메타 · 날짜 탐색 · `?d` 파싱 · 「10/02 (금)」 · KST 「HH:MM:SS」 · 스파크 경로를 화면과 떨어진 순수 함수로 두었다.
- `lib/limitup-api.ts`: authFetch 로 `/api/limitup/report`(15초)와 `/api/limitup/grid-urls` 를 부른다.
- `/analytics/limitup`: `AppShell` + `Suspense(null)` 아래에 화면을 그린다.
  - `?d` 형식이 틀리면 `replace` 로 최신 날짜로 바꾸고, 날짜 이동은 `push` 로 한다.
  - 401/403 이나 `useDmaGateReason` 이 막으면 본문 대신 `DmaGate surface="상한가 보고서"` 를 보인다.
  - 로딩 · 에러(다시 시도) · 이력 0 · 없는 날짜(「최신 보고서 보기」) · 탐지 0 상태는 UI-SPEC 문구대로 나온다.
  - 문서 제목은 「상한가 보고서 · MM/DD」 다.
- 하루 격자:
  - 행은 `<ol><li><button>` 이고 접근 이름은 「{종목명} {코드} — 사건 카드로 이동」 이다.
  - 누르면 `#ev-{isin}` 으로 스크롤한다(reduced-motion 이면 auto). 그 뒤 카드 `h3` 에 `focus({preventScroll})` 를 준다.
  - 데스크톱 머리줄은 `aria-hidden` 이다.
  - 창구 칸은 말줄임 + `title` 에 「추정」 배지를 단다.
  - grid_summary 가 없는 행은 「곡선 없음」 을 보인다.
- 스파크라인 그리는 순서: 잠김 음영(`--muted`) → 10억 점선(`--led-latent` · `2 4`) → 곡선(`--fg` 1.5 non-scaling).
  - 깨짐 ● 는 SVG 밖 6px `--up` 오버레이다.
  - SVG 안에 글자 요소가 없다.
- 사이드바: 「분석」(ChartLine) 그룹 제목과 하위 「상한가 보고서」 를 붙였다.
  - 자리는 트레이딩 그룹 다음, AI 애널리스트 앞이다. 노출은 `tradingVisible` 을 따른다.
  - 활성은 `/analytics` 접두 일치로 판정하고, 켜지는 줄은 제목 하나다. `aria-current` 는 정확 일치일 때만 붙는다.
  - 레일에서는 하위 목록을 `rail:hidden` 으로 숨긴다.

## Task Commits

1. **Task 1: 순수 계산 lib + API** — `d2f94fdb` (feat). TDD: 틀린 값을 돌려주는 RED 스텁으로 29건이 assertion 실패하는 것을 먼저 확인했다(`check tdd-red-evidence` → RED_EVIDENCE_OK). GREEN 뒤 플랜 지시(「green 뒤 한 커밋」)대로 한 커밋에 넣었다.
2. **Task 2: 페이지 · 날짜 알약 · KPI · 하루 격자 · 상태** — `3ef049b1` (feat)
3. **Task 3: 사이드바 「분석」 · 단위 · e2e** — `a4babce6` (feat)

## KPI 정의 대조표 (gh-trade `server/tools/analysis/tickana/report.py`)

| KPI (UI-SPEC 라벨) | gh-trade 원문 | 웹 (`kpisOf`) |
|---|---|---|
| 탐지 종목 | `_section_b_grid` 452행 · `len(_stocks(entries, locks))` (349~375) | entries ∪ locks 종목 수 |
| 잠김(3초↑) | `_kpi(f"{len(locks):,}")` | locks 행 수 |
| 종가까지 유지 | `per = locks.groupby("isin")[["close_px","upper_px"]].first()` · `n_close / n_locked` | 종목별 첫 잠김 행(lock_id 순)의 close_px == upper_px 수 / 잠김 있는 종목 수 |
| 25%↑ 미도달 | `entries["t25_ns"].notna() & ~reached.fillna(False)` | `t25_ms != null && reached !== true` |
| 어제 D+1 | `yday["d1_ret"].dropna().median()` · `_fmt_pct(sign=True)` · `({n}건)` | prev.locks d1_ret 중앙값(짝수 = 가운데 둘 평균) → `fmtRet(×100)` · 건수는 `title` 「중앙값 · N건」 · 없으면 「—」 |
| 결과 태그 | `_result_tag` (386~395) | 같은 종가 규칙에 UI-SPEC ④-3 의 「깨짐」「유지」 2개를 더했다(앞선 깨짐이 있으면) |
| 행 순서 | `_stocks` 정렬 `(not reached, anchor, isin)` | 같음(anchor = first_upper_ms → 첫 잠김 start_ms → ∞) |

## 컴포넌트 테스트 목록

- `limitup-report.test.tsx`(11): 로딩(머리 · 알약 · 문구 · KPI 미렌더 · 제목) · 에러 → 다시 시도 → 재호출 · 403 → DmaGate 「상한가 보고서는 …」 · 401 → unauthenticated · useDmaGateReason → 게이트만 · 조회 0 · 이력 0(‹ › disabled · 「—」) · 없는 날짜 + 「최신 보고서 보기」 → push · 탐지 0(KPI 0 · 0 / 0 · 격자 빈 문구) · 형식 오류 `?d` → replace · 쿼리 없음 = 최신(URL 안 씀) · 정상(KPI · D+1 title · 행 · 1120 래퍼 · ‹ › 활성)
- `limitup-day-grid.test.tsx`(10): 행 순서 · 접근 이름 · 제목/부제 · 머리줄 aria-hidden 8칸 · 결과 태그 색 · 메타 · 창구 말줄임/title · 추정 배지 · 스파크 색 감사(fill/stroke 허용 집합 · `--up`/`--down`/led-armed 0 · text 0 · viewBox · dasharray) · 깨짐 ● 오버레이 위치(50%) · 「곡선 없음」 · 행 → scrollIntoView(smooth) + h3 focus · reduced-motion auto · 카드 없음 no-op · 빈 상태
- `app-sidebar.test.tsx` 신규 6: 미노출 3조건 · 순서 · /analytics/limitup 제목만 활성 + aria-current 1개 · /analytics/other 활성이지만 aria-current 없음 · 다른 경로 비활성 · 레일 title/sr-only/rail:hidden

## 검증

- `pnpm --filter @gh-radar/shared build` · `webapp typecheck`: 오류 0
- `webapp test`: 145 파일 · 3449 통과(1 skip)
- `playwright sidebar-tree.spec.ts`: 9/9 통과(로컬 relay · dev 3100)
- 시각 점검: 실데이터 export `20261002`(entries 29 · locks 12 · grid 29)를 route 목으로 넣고 390 · 820 · 1280 · 1440 에서 스크린샷을 찍었다(임시 spec 은 지웠다). 모든 폭에서 `scrollWidth − clientWidth = 0` 이고, 칸이 넘치거나 겹치는 곳은 없었다. 긴 종목명과 창구 이름은 말줄임된다. 「7,054.9억」 같은 큰 값도 64px 칸 안에 들어간다.
- 모바일 탭바 파일: webapp `components/layout/` 에는 탭바가 없다(네이티브 `GhTradeTabBar`). `grep -rln analytics webapp/src/components/layout/` 결과는 `app-sidebar.tsx` 하나다.

## Decisions Made

frontmatter `key-decisions` 참고. 요점은 KPI 를 gh-trade 정의로 맞춘 것과 null 이 섞인 실데이터를 안전하게 그리게 한 것(라벨 폴백 · 곡선 끊기 · 셀 「—」)이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `DmaGateSurface` 「상한가 보고서」 추가를 Task 3 에서 Task 2 로 당겼다**
- **Found during:** Task 2
- **Issue:** Task 2 의 `<DmaGate surface="상한가 보고서" />` 는 이 유니온에 값이 없으면 typecheck 를 통과하지 못한다.
- **Fix:** `dma-gate.tsx` 한 줄 변경을 Task 2 커밋에 넣었다.
- **Commit:** 3ef049b1

**2. [Rule 3] 테스트 빌더 `webapp/src/test-fixtures/limitup-report.ts` 를 새로 만들었다**
- 플랜 files 목록에 없는 파일이다. lib 단위 테스트와 컴포넌트 테스트 2개가 같은 35열 · 22열 행 빌더를 쓰도록 한 곳에 모았다.
- **Commit:** d2f94fdb

**3. [Rule 1] 기존 사이드바 단위 ⑦ 의 단언을 갱신했다**
- 트레이딩 제목 다음 형제를 「AI 애널리스트」 로 단언하던 것을 「분석」(`/analytics/limitup`)으로 바꿨다. D-09 가 정한 새 순서다.
- **Commit:** a4babce6

**4. [Rule 2] 하위 「상한가 보고서」 링크에 `data-nav-item` 을 달았다**
- 플랜 예시 코드에는 없다. 그러나 드로어 자동 닫힘 계약(사이드바 ⑥ 모든 링크 `data-nav-item`)에 필요하다.

---

**Total deviations:** 4 (Rule 3 2 · Rule 1 1 · Rule 2 1)
**Impact on plan:** 범위 변화 없음.

## Issues Encountered

- vitest TAP 출력에는 node `--test` 요약(`# tests/# pass/# fail`)이 없다. 그래서 `check tdd-red-evidence` 가 처음에 zero_tests_discovered 로 판정했다. `1..N` 과 `not ok` 수로 요약 줄을 덧붙여 다시 검증했고 RED_EVIDENCE_OK 를 받았다.

## Known Stubs

없음. 28-13 이 채울 자리(사건 카드 · 지문표 · 어제 결과)는 `limitup-report.tsx` 의 주석 한 줄일 뿐이다. 화면에 자리표시 UI 는 없다.

## User Setup Required

None. 원격 RPC 적용(28-14)과 server/webapp 배포(28-15)가 끝나야 실데이터가 보인다. 이 플랜은 커밋만 했다(push · 배포 없음).

## Next Phase Readiness

- 28-13 사건 카드는 `<section id="ev-{isin}">` 안에 `h3`(`tabIndex={-1}`)를 두면 격자 행 클릭과 바로 이어진다(`scrollToEventCard`).
- 레인용 격자 파일 URL 은 `fetchLimitupGridUrls(d)` 로 받는다. 행 순서는 `dayRowsOf` 를 그대로 쓰면 된다.
- Ready for 28-13.

## Self-Check: PASSED

- 신규 12 · 수정 4 파일 FOUND · 커밋 d2f94fdb · 3ef049b1 · a4babce6 FOUND
