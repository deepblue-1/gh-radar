---
phase: 34-accum
plan: 09
status: complete
subsystem: ui
tags: [nextjs, playwright, e2e, sidebar, accum, tracer]

requires:
  - phase: 34-08
    provides: "AccumDetail D-19 순서 완성(차트 블록 · 사이클 표 · 손익 줄 · 판정 기준 · 출처 칩)"
  - phase: 34-07
    provides: "useChartView 휠(passive:false) · 끌기 · 프리셋 · accum-view-range"
  - phase: 34-06
    provides: "accumSyntheticDetail 합성 상세 · accum-export 실측 6행 픽스처"
provides:
  - "webapp/e2e/fixtures/accum-report.ts — accumReportFixture(d, {worst}) · accumDetailFixtureOf(date, isin, {synthetic}) · ACCUM_WORST_ROW(합성 최악값) · ACCUM_DATES"
  - "webapp/e2e/specs/accum-report.spec.ts — P34-AC1 실브라우저 상세 경로(34-10 이 백스톱 케이스를 더한다)"
  - "사이드바 분석 › 매집감지 보고서(NAV_ACCUM · accumActive · SubNavLink item=accum)"
affects: [34-10, 34-12]

actuals:
  tokens: 6650
  tasks: 2
  commits: 2
plan_head_before: 122dddf69313e59a2056a7f781f9a9926f6619a6
plan_head_after: 3bc80f638f04bacfb49f30a93c4069cce2c432cb

tech-stack:
  added: []
  patterns:
    - "e2e 목에서 목록 · 상세를 URL 판정 함수(url.pathname === … / startsWith(…/))로 따로 등록 — glob * 가 / 를 넘지 않는 함정(Pitfall 9) 회피 · 상세 경로에서 date · isin 을 잘라 응답하고 요청 수를 기록"
    - "창 범위 「HH:MM ~ HH:MM」 을 분 폭으로 파싱해 휠 확대를 수치로 단언(expect.poll < 390분)"

key-files:
  created:
    - webapp/e2e/fixtures/accum-report.ts
    - webapp/e2e/specs/accum-report.spec.ts
  modified:
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/e2e/specs/sidebar-tree.spec.ts

key-decisions:
  - "합성 최악값 행 ISIN 은 KR790000AC99(34-04 합성 대역 AC01~07 다음) · 상세는 한선엔지니어링 payload + 최악값 평평한 열"
  - "accumDetailFixtureOf 의 synthetic 옵션 = accumSyntheticDetail 종류 배열 — 바탕 실측 isin 의 상세를 합성으로 갈아 끼운다(34-10 다중 사이클 · 이월 케이스용)"
  - "sidebar-tree 403 루프는 목록 · 상세를 한 URL 판정 함수로 막고, /analytics/accum 에서만 surface 문구 「매집감지 보고서는 …」 + 목록 0 을 추가 단언"
  - "콘솔 · pageerror 수집은 경로 전체에 걸고 휠 · 끌기 직후와 마지막에 0 단언 — 실제로 0 이 나와 필터가 필요 없었다"

patterns-established:
  - "재펼침 캐시 단언 = 접기 → 다시 펼치기 뒤 상세 요청 배열 길이 그대로 + 창이 「전체」 로 초기화 + 판정 기준 aria-expanded=false"

requirements-completed: []

coverage:
  - id: D-06-lazy-detail
    description: "행 펼침 때만 상세 요청 · 한 행 1회 · 재펼침 0 추가(캐시) · 다른 행 펼침 = 2회 · 한 번에 하나"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/accum-report.spec.ts#P34-AC1 ② ⑥ ⑦"
        status: pass
    human_judgment: false
  - id: D-08-default-collapsed
    description: "/analytics/accum?d=20261014 6행 전부 aria-expanded=false · 상세 0 · 머리 칩 「KYOBO119 판정 기준 · 20:30 적재」"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/accum-report.spec.ts#P34-AC1 ①"
        status: pass
    human_judgment: false
  - id: D-14-presets-wheel-drag
    description: "세 판 SVG(순매수 누적 · 10분 팀 매수 / 매도) · 기본 09:00 ~ 20:00 · 정규장 09:00 ~ 15:30 aria-pressed · 휠 확대 폭 < 6.5h · 프리셋 셋 다 꺼짐 · 휠 10회 + 끌기 1회 창 변화 · 페이지 오류 0(A1 백스톱)"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/accum-report.spec.ts#P34-AC1 ② ③ ④ ⑤"
        status: pass
    human_judgment: false
  - id: D-27-sidebar
    description: "분석 하위 「팀 매집 보고서」 다음 · 「AI 애널리스트」 앞 「매집감지 보고서」(href /analytics/accum · item accum · 접두 활성 · tradingVisible 거짓이면 미렌더) · 매핑 없는 직접 진입 → DmaGate"
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#링크 순서 · 「매집감지」 미렌더 · /analytics/accum 단독 활성"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts#TREE_LINKS · 2b 403 루프"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-20
---

# Phase 34 Plan 09: 매집감지 실브라우저 상세 경로 E2E + 사이드바 Summary

**실제 Chromium(1280)에서 목록 → 펼침 → 상세 요청 1회 → 세 판 차트 → 「정규장」 → 네이티브 휠 확대 → 휠 10회와 끌기(오류 0) → 재펼침 캐시 → 다른 행 2회까지 한 경로로 확인했다. 사이드바 「분석」 에는 「팀 매집 보고서」 다음, 「AI 애널리스트」 앞에 「매집감지 보고서」 를 넣었다.**

## Performance

- **Duration:** 약 4분 (14:22Z 시작 → 14:25Z 마지막 태스크 커밋)
- **Completed:** 2026-10-20
- **Tasks:** 2개 (Task 1 tracer · Task 2 auto)
- **Files:** 신규 2개, 수정 3개

## Accomplishments

- **e2e 픽스처 (Task 1)**: `webapp/e2e/fixtures/accum-report.ts`
  - `accumReportFixture(d, { worst })` 의 응답은 날짜에 따라 셋이다.
    - 20261014: 실측 6행.
    - 20261013: date 만 바꾼 합성 응답.
    - 그 밖의 날: 행 없는 날.
  - `accumDetailFixtureOf(date, isin, { synthetic })` 는 실측 상세를 돌려준다. 없는 isin 은 `row: null` 이다. 합성 최악값 isin 은 한선 payload 를 쓰고, `synthetic` 을 주면 `accumSyntheticDetail` 로 바꿔 낸다.
  - `ACCUM_WORST_ROW` 는 34-10 백스톱용 합성 행이다. 들어 있는 값: 15자 종목명 · 종료 · 이월 D+5 · 사이클 3 · 「이월 탈락(복원 안 됨) · 08:41」 · 「상한가 +29.9%」 · pos −1,234.5억 · 평단 200,407 · 등록가 205,500.
- **P34-AC1 (Task 1, 트레이서)**: `webapp/e2e/specs/accum-report.spec.ts`. 목록과 상세 목은 URL 판정 함수 둘로 나눠 잡고(Pitfall 9), 상세 요청은 배열에 기록한다. 경로는 ①~⑦ 단계다.
  - ① 6행이 전부 접혀 있고 머리 칩이 보인다.
  - ② 한선을 펼치면 상세 요청이 정확히 `[20261014/KR7452280001]` 다. 세 판 텍스트와 「09:00 ~ 20:00」 이 보인다.
  - ③ 「정규장」 을 누르면 「09:00 ~ 15:30」 이 되고 그 버튼이 pressed 다.
  - ④ 휠(−400)을 굴리면 창 폭이 390분보다 짧아지고 프리셋 셋 다 꺼진다.
  - ⑤ 휠 10회 뒤 창이 바뀌고, 끌기 −120px 뒤 다시 바뀐다. pageerror · console error 는 0이다.
  - ⑥ 접었다 다시 펼치면 요청은 그대로 1회다. 창은 「전체」 로 돌아오고 판정 기준은 접혀 있다.
  - ⑦ 천일고속을 펼치면 한선 상세가 사라지고 요청은 2회가 된다.
- **사이드바 (Task 2)**
  - `NAV_ACCUM` · `accumActive`(접두 일치) · `SubNavLink item="accum"` 을 더했다. 가시성은 기존 분석 하위 규칙 그대로이고, 레일 아이콘은 새로 두지 않았다.
  - 단위 테스트 변경:
    - 링크 순서 배열 2곳과 하위 item 순서 `[limitup-report, teamflow, accum, chat]` 을 갱신했다.
    - 「매집감지」 미렌더(비로그인 · unauthorized · 판정 전) 케이스를 더했다.
    - `/analytics/accum` 에서 그 항목만 활성인 케이스를 더했다.
  - e2e 변경: `TREE_LINKS` 에서 「팀 매집 보고서」 바로 다음에 「매집감지 보고서」 를 넣었다. 403 루프에는 목록 · 상세 403 목과 `/analytics/accum` 경로를 더했고, 그 경로에서 「매집감지 보고서는 증권사 계정이 연결된 사용자만 이용할 수 있어요. 관리자에게 연결을 요청하세요.」 와 목록 0 을 단언한다.

## Task Commits

1. **Task 1: 실브라우저 상세 경로 E2E** — `37823080` (test)
2. **Task 2: 사이드바 매집감지 보고서 + 순서 · 403 단언** — `3bc80f63` (feat)

## Verification

- `pnpm --filter @gh-radar/shared build` 성공.
- `playwright test e2e/specs/accum-report.spec.ts --workers=1`: 2 passed(setup 포함), failed 0.
- `vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2`: 89 passed.
- `playwright test e2e/specs/sidebar-tree.spec.ts --workers=1`: 12 passed(setup 포함), failed 0.
- `tsc --noEmit -p tsconfig.json` 은 exit 0 이다. e2e 는 tsconfig include 밖이라 Playwright 변환으로 확인했다.
- 트레이서 게이트: auto 모드가 아니고 end-of-phase 기본값이다. 자동 verify 를 다시 돌려 통과했으므로 확장을 이어갔다.

## Decisions Made

- 합성 최악값 행 ISIN 은 KR790000AC99 로 정했다. 34-04 합성 대역의 연장이다.
- 403 루프에서 목록 · 상세를 한 판정 함수로 막는다. 상세까지 막지 않으면 glob 만으로는 상세 경로가 새어 나간다.
- 콘솔 오류는 필터 없이 0 을 단언한다. 실측도 0 이었다.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- 34-10 은 `accum-report.spec.ts` 에 폭 백스톱 케이스를 더할 수 있다. 쓸 픽스처는 `accumReportFixture(d, { worst: true })` · `ACCUM_WORST_ISIN` · `accumDetailFixtureOf(..., { synthetic })` 다.
- 남은 일: 폰 310 · 390 폭 실측(사이클 표 가로 스크롤 · 최악값 행 한 줄)은 34-10 이, 라이브 UAT 는 34-12 가 맡는다.

## Self-Check: PASSED

- FOUND: webapp/e2e/fixtures/accum-report.ts
- FOUND: webapp/e2e/specs/accum-report.spec.ts
- FOUND: 37823080
- FOUND: 3bc80f63
