---
phase: 34-accum
plan: 13
status: complete
subsystem: api+ui
tags: [express, zod, rpc, nextjs, react, accordion, lazy-load, query-cache, tracer]

requires:
  - phase: 34-01
    provides: "accum_report_for_user · accum_detail_for_user RPC 계약 · 10/14 6행 워커 픽스처 accum_flow.ndjson.gz"
provides:
  - "shared AccumReport* 타입(AccumReportRow 37열 · AccumReportPayload 6키 · AccumReportCycle 16키 · AccumDetailRow · AccumReportResponse · AccumDetailResponse)"
  - "server GET /api/accum/report?d · GET /api/accum/report/:date/:isin (accumReportRouter · requireAuth 만 · RPC 1회)"
  - "webapp /analytics/accum 페이지 셸 · AccumDayGrid(최종 7열 템플릿 · accumRowButtonId) · AccumDetail(지연 로드 셸 + KPI 줄)"
  - "webapp lib: ACCUM_LOAD_HM · sortAccumRows · stateLabelOf · fmtPx · detailKpisOf · fetchAccumReport · fetchAccumDetail · accumDetailCacheKey"
  - "webapp/src/test-fixtures/accum-export.ts — 워커 gz 원문 로더(ACCUM_DATE · 6 ISIN 상수 · accumDetailRows · accumListRows · accumReportFixture · accumDetailFixture)"
  - "DmaGateSurface 유니온 「매집감지 보고서」"
affects: [34-03, 34-04, 34-06, 34-07, 34-08, 34-09, 34-10]

actuals:
  tokens: 21000
  tasks: 1
  commits: 2
plan_head_before: 48fca8e7de305e88e9ca8deaaba9f5d5dd6e15c4
plan_head_after: d09acaf57ab40234457ce7b64b1ad4f3b5170377

tech-stack:
  added: []
  patterns:
    - "상세 지연 로드 = query-cache(만료 없음) + 모듈 Map 진행 중 합침 + access:true 만 캐시(실패 비캐시)"
    - "펼친 상세 첫 렌더를 캐시에서 동기로 초기화 — 재펼침 스켈레톤 깜빡임 없음"
    - "RTL 은 authFetch 만 목 — fetchAccumDetail 캐시 · 합침 로직은 진짜로 돈다(요청 수 = authFetch 호출 수)"

key-files:
  created:
    - packages/shared/src/accum-report.ts
    - server/src/schemas/accum-report.ts
    - server/src/services/accum-report.ts
    - server/src/routes/accum-report.ts
    - server/tests/routes/accum-report.test.ts
    - webapp/src/lib/accum-api.ts
    - webapp/src/lib/accum-report.ts
    - webapp/src/app/analytics/accum/page.tsx
    - webapp/src/components/analytics/accum-report.tsx
    - webapp/src/components/analytics/accum-day-grid.tsx
    - webapp/src/components/analytics/accum-detail.tsx
    - webapp/src/test-fixtures/accum-export.ts
    - webapp/src/components/analytics/__tests__/accum-report.test.tsx
  modified:
    - packages/shared/src/index.ts
    - server/src/app.ts
    - webapp/src/components/trading/dma-gate.tsx

key-decisions:
  - "상세 응답은 access:true 일 때만 캐시한다(row:null 포함 — 재적재 전까지 같은 답). {access:false} 와 실패는 캐시하지 않는다"
  - "AccumDetail 은 첫 렌더 상태를 query-cache 에서 동기로 읽는다 — 재펼침에 스켈레톤이 번쩍이지 않는다(fetch 는 캐시 hit 으로 요청 0)"
  - "상세 row 모양 검사: null 또는 객체만 통과 — 키 누락(undefined) · 수 · 배열은 500 DB_ERROR"
  - "목록 열 머리 · sr 설명(aria-describedby)은 34-04 가 열을 채울 때 함께 더한다 — 이 플랜은 종목 · 상태 배지 · 셰브론만"

patterns-established:
  - "보고서 상세 분리 라우트: 목록 RPC 1회(평평한 열) + 상세 RPC 1회(payload) · 같은 게이트 · 같은 모양 검사 헬퍼(복제)"

requirements-completed: []

coverage:
  - id: D-06
    description: "목록/상세 두 라우트가 requireAuth 만 거치고 RPC 를 정확히 1회 · 403 DMA_UNMAPPED · 400(RPC 0회) · 500 원문 비노출 · 비 KR ISIN 200"
    verification:
      - kind: integration
        ref: "server/tests/routes/accum-report.test.ts (11건)"
        status: pass
  - id: D-06-web
    description: "행 펼침 때만 상세 1회 요청 · 접었다 다시 펼침 요청 0 · 진행 중 합침 · 실패 재시도 재요청"
    verification:
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/accum-report.test.tsx#(b)(c)(c2)(d)(e)"
        status: pass
  - id: D-08
    description: "6행 · 기본 전부 접힘 · 한 번에 하나 · state → pos_net_krw → isin 정렬"
    verification:
      - kind: unit
        ref: "accum-report.test.tsx#(a)(a2)(d)"
        status: pass
  - id: D-19
    description: "KPI 줄 「등록가 205,500」 · 「평단 200,407」 · 「등록 후 순매수 +1.6억」(부호 색) · 「최고 순매수 +1.7억」"
    verification:
      - kind: unit
        ref: "accum-report.test.tsx#(b)"
        status: pass
  - id: D-22
    description: "머리 출처 칩 「KYOBO119 판정 기준 · 20:30 적재」 + 장중 패널 안내 · 20:30 은 ACCUM_LOAD_HM 하나"
    verification:
      - kind: unit
        ref: "accum-report.test.tsx#(h)(g)"
        status: pass
  - id: TRACER
    description: "C4 verify 한 줄 — 워커(34-01 accum_flow stage) · server · 웹 전 층"
    verification:
      - kind: integration
        ref: "C4 <verify> automated 한 줄 exit 0 — limitup-sync 57/57 · server 23/23 · webapp 33/33"
        status: pass

duration: 8min
completed: 2026-10-20
---

# Phase 34 Plan 13: 매집감지 조회 경로 (트레이서 후반) Summary

**34-01 의 목록/상세 RPC 를 shared 타입 → `GET /api/accum/report`(+`/:date/:isin`) → `/analytics/accum` 목록(기본 접힘) → 행 펼침 지연 로드(캐시 · 진행 중 합침) → 상세 KPI 줄 4항목까지 이었다. C4 verify 한 줄이 워커 · server · 웹을 함께 돌려 픽스처 → 화면 전 경로가 green 이다.**

## Performance

- **Duration:** 약 8분 (13:17Z 시작 → 13:24Z C4 커밋)
- **Completed:** 2026-10-20
- **Tasks:** 1 (tracer · 층 커밋 2개)
- **Files:** 신규 13 · 수정 3

## Accomplishments

- **C3 shared + server**
  - `packages/shared/src/accum-report.ts`: `AccumReport*` 접두 타입. 라이브 kind 16 의 `AccumState` · `AccumSignal` 과 이름이 겹치지 않는다. pnl 은 `TeamflowPnl` 을 재사용한다.
  - `accumReportRouter`: `/report`(query `d` = `Ymd.optional()`)와 `/report/:date/:isin`(isin `^[A-Z0-9]{12}$`) 두 경로. 미들웨어는 `requireAuth()` 하나다.
  - 서비스 규칙
    - `access === false` 면 403 이다.
    - 그 밖의 모양 위반은 500 이다. 목록은 dates/rows 가 배열이 아닐 때, 상세는 row 가 null 도 객체도 아닐 때다.
    - 표는 `from()` 으로 읽지 않는다.
  - `app.ts`: `/api/teamflow` 다음 줄에 `app.use("/api/accum", accumReportRouter);` 를 등록했다.
- **C4 web**
  - 페이지 셸은 teamflow 상태기계를 복제했다.
    - 출처 칩은 `data-slot=accum-source` 이고, 빈 상태 2종, 오류 + 다시 시도, `DmaGate surface="매집감지 보고서"` 를 둔다.
    - 문서 제목은 「매집감지 보고서 · MM/DD」 다.
  - `AccumDayGrid`
    - 기본 전부 접힘이고 한 번에 하나만 열린다. `pendingScroll` 을 쓴다.
    - 최종 7열 템플릿이다. 이 플랜은 종목 · 상태 배지(`data-slot=accum-state`) · 셰브론만 채운다.
  - `AccumDetail`
    - 상태는 스켈레톤(4칸 + sr 상태) · 실패 · 게이트 · row null · 준비 다섯 가지다.
    - 준비 상태에서는 차트 블록 안에 KPI 줄(`data-slot=accum-kline`)을 그린다.
  - `fetchAccumDetail`: 키는 `accum-detail:{date}:{isin}` 이고 진행 중 요청을 Map 으로 합친다. 실패는 캐시하지 않으며 타임아웃은 15초다.
  - 웹 픽스처 로더는 워커 gz 를 원문 그대로 읽는다. 웹 쪽 사본은 없다(`git ls-files 'webapp/**/*.ndjson.gz'` 의 accum 0).

## Task Commits

1. **C3 — shared + server**: `255d385f` feat(34-13): 매집감지 shared 타입 · GET /api/accum/report 목록/상세 (트레이서 후반 C3)
2. **C4 — web + RTL**: `d09acaf5` feat(34-13): /analytics/accum 목록 · 펼침 상세 지연 로드 (트레이서 후반 C4)

두 커밋 모두 34-01 「트레이서 전반 C2」(`858de35c`) 뒤에 있고, `supabase/` · `workers/` 경로는 없다(`git show --stat` 확인).

## Verification

- **C3 verify:** shared build → server typecheck → vitest `accum-report.test.ts` + `teamflow-report.test.ts` 결과 **23/23**(accum 11 · teamflow 12), exit 0.
- **C4 verify(트레이서 전 층 판정):** 한 줄로 돌렸고 exit 0 이다.
  - limitup-sync typecheck + dispatch · load · dispatch-dryrun-totals **57/57**
  - server **23/23**
  - webapp typecheck(+e2e tsconfig) + `accum-report.test.tsx` · `teamflow-report.test.tsx` **33/33**(accum 15 · teamflow 18)
- **변이 확인:** `fetchAccumDetail` 의 캐시 쓰기와 진행 중 합침을 끄면 RTL (c) · (c2) 두 건이 실패한다. 확인한 뒤 원복했다. 캐시 단언이 실제로 걸려 있다는 뜻이다.
- **수용 grep**
  - `app.use("/api/accum", accumReportRouter);` 가 있다.
  - `| "매집감지 보고서"` 가 있다.
  - `accum-detail:` 가 3곳에 있다.
  - 컴포넌트에서 「20:30」 리터럴은 주석에만 있다.

## Decisions Made

- 상세는 `access:true` 응답만 캐시한다. `row:null` 도 캐시한다. 재적재 전까지 같은 답이기 때문이다.
- `AccumDetail` 의 첫 상태는 query-cache 에서 동기로 읽는다. 그래서 재펼침 때 스켈레톤이 번쩍이지 않는다.
- 상세 row 모양 검사는 null 또는 객체만 통과시킨다. 키 누락 · 수 · 배열은 500 이다.
- 목록 열 머리와 행 sr 설명(`aria-describedby`)은 이 플랜에 넣지 않았다. 빈 열에 머리만 서는 것을 피하려는 것이고, 34-04 가 열을 채울 때 함께 더한다.

## Deviations from Plan

- **[사소 · 표기] `ACCUM_LOAD_HM` 따옴표.** 플랜 수용 문구는 `export const ACCUM_LOAD_HM = "20:30"` 이지만, webapp 은 홑따옴표 관례라 `'20:30'` 으로 썼다. 값과 이름은 같다.
- **[보강] 출처 칩 간격.** UI-SPEC 의 「칩 뒤 4px」 는 별도 margin 을 두지 않고 카피의 선행 공백(「 장중에는 …」)으로 냈다. `PageHeader` 의 `<p>` 에 class 를 줄 수 없어서, `break-keep` 은 description 을 감싼 `<span>` 에 걸었다. `PageHeader` 는 바꾸지 않았다.

그 밖에는 계획대로 실행했다. 34-01 의 RPC 응답 키와 픽스처는 기대와 일치했다. 37열이고, 목록 행에 payload 가 없고, 상세는 `{access, row}` 다.

## Planned Extension Points (스텁 아님 — 이 phase 뒤 플랜 몫)

| 자리 | 파일 | 채울 플랜 |
|---|---|---|
| KPI 4칸 자리(주석) | `webapp/src/components/analytics/accum-report.tsx` | 34-04 |
| 목록 결과 · 팀 순매수 · 하루 순매수 · 등록·종료 칸 · 이월/사이클 배지 · 사유 줄 · 열 머리 · sr 설명 · 흐린 행 | `webapp/src/components/analytics/accum-day-grid.tsx` | 34-04 |
| 상세 범례 · 프리셋 · 차트 · 캡션 · 사이클 표 · 손익 줄 · 판정 기준 · 상세 출처 칩 | `webapp/src/components/analytics/accum-detail.tsx` | 34-06~08 |

이 플랜의 목표(목록 → 펼침 지연 로드 → KPI 줄)는 실데이터로 끝까지 흐른다. 위 자리는 계획된 가산이라 WINDOWS 원장에 올리지 않았다.

## Issues Encountered

없음. 모든 테스트가 첫 실행에서 통과했다.

## Next Phase Readiness

- 34-03(재적재 감지 일반화)과 34-04(KPI 4칸 · 목록 열 채우기)는 이 플랜이 shared dist 를 빌드한 뒤의 wave 다.
- 34-04 는 `sortAccumRows` · `stateLabelOf` · `fmtPx` · 7열 템플릿 · 웹 픽스처 로더(`accumReportFixture({ rows })` 로 합성 덮어쓰기)를 그대로 쓴다.
- 원격 DB 에는 아직 적용하지 않았다(34-11). push · 배포도 하지 않았다.

## Self-Check: PASSED
- FOUND: 신규 13 · 수정 3 파일
- FOUND: 255d385f · d09acaf5 (HEAD 조상)

---
*Phase: 34-accum*
*Completed: 2026-10-20*
