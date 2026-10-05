---
phase: 28-limitup-feature-ingest
plan: 10
subsystem: api
tags: [supabase, rpc, jsonb, pgtap, server, express, storage, signed-url, shared]
status: complete

requires:
  - phase: 28-03
    provides: "limitup 표 10개 · limitup_commit_day · limitup_record_skip (열 이름 = export 키)"
  - phase: 28-06
    provides: "파생 표 grid_summary · member_daily 채움 · 비공개 버킷 limitup-grid (grid/<D>/<isin>.json.gz)"
  - phase: 28-07
    provides: "shared index.ts 정리(같은 파일)"
provides:
  - "limitup_report_for_user(uuid, text DEFAULT NULL) → jsonb — 게이트 · 적재 날짜 · 하루 묶음 · 마커 상위 40 · 어제 locks · 90일 지문"
  - "limitup_grid_isins_for_user(uuid, text) → jsonb — 같은 게이트 · 그날 grid_summary isin"
  - "shared limitup-report.ts — LimitupEntryRow · LimitupLockRow · LimitupFactRow · LimitupGridSummaryRow · LimitupMarkRow · LimitupFingerprintRow · LimitupDay · LimitupReportResponse · LimitupGridUrlsResponse · LimitupGridFile(24열)"
  - "GET /api/limitup/report?d= · GET /api/limitup/grid-urls?d= (requireAuth · 403 DMA_UNMAPPED · 서명 URL 600초)"
affects: [28-12, 28-13, 28-14, 28-15]

actuals:
  tokens: 15000
  tasks: 2
  commits: 2
plan_head_before: d0c17ebe0cd20958b311ea12fb2a7ef1765011fd

tech-stack:
  added: []
  patterns:
    - "보고서 = 게이트 + 여러 표를 jsonb 스칼라 하나로 묶는 RPC 1회(SETOF 없음 · max_rows 무관)"
    - "격자 = 게이트 RPC 1회 → createSignedUrls 1회(경로 ↔ isin 맵으로 되돌림 · 실패 항목은 뺀다)"
    - "행 키는 export 열 이름 그대로(to_jsonb(row)) — 매퍼 없음, 봉투만 camelCase"

key-files:
  created:
    - supabase/migrations/20261006090400_limitup_report_rpcs.sql
    - supabase/tests/limitup_report.test.sql
    - packages/shared/src/limitup-report.ts
    - server/src/schemas/limitup-report.ts
    - server/src/services/limitup-report.ts
    - server/src/routes/limitup-report.ts
    - server/tests/routes/limitup-report.test.ts
  modified:
    - packages/shared/src/index.ts
    - server/src/app.ts

key-decisions:
  - "shared · server 의 새 파일은 limitup-report.ts — 플랜의 limitup.ts 는 기존 limitUp.ts(shared · server/schemas)와 대소문자만 달라 macOS 에서 같은 파일이다"
  - "marks 는 isin 순 · 종목 안 krw 내림차순(동률 jump_no) · krw null 은 뒤로 — 웹이 가장 큰 ▼·✕ 1개만 라벨을 다는 규칙(UI-SPEC ④-4)과 맞는다"
  - "형식이 아닌 p_date 는 RPC 에서 예외가 아니라 loaded false — 형식 검사는 server zod 가 정본(400 · RPC 0회)"
  - "createSignedUrls 항목 중 error 가 있거나 signedUrl 이 빈 것은 urls 에서 뺀다(전체 실패만 500)"

requirements-completed: [D-10, D-11, D-15, D-17]

coverage:
  - deliverable: "보고서 RPC 2개(게이트 · 날짜 규칙 · 하루 묶음 · 마커 40 · 어제 locks · 90일 지문 · 권한)"
    human_judgment: false
    verification:
      - kind: pgtap
        ref: "supabase/tests/limitup_report.test.sql (50건)"
        status: pass
      - kind: pgtap
        ref: "supabase/tests/limitup_load.test.sql (145건 · 회귀)"
        status: pass
  - deliverable: "server /api/limitup/report · /api/limitup/grid-urls (401 · 400 · 403 · 200 · 500 · RPC 1회 · 서명 1회)"
    human_judgment: false
    verification:
      - kind: unit
        ref: "server/tests/routes/limitup-report.test.ts (16건)"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/server exec vitest run (308건)"
        status: pass
  - deliverable: "shared 계약 타입(server · webapp 공통)"
    human_judgment: false
    verification:
      - kind: command
        ref: "pnpm --filter @gh-radar/shared build · server/webapp/relay typecheck"
        status: pass

duration: 8min
completed: 2026-10-05
---

# Phase 28 Plan 10: 보고서 API Summary

**보고서 한 장을 jsonb RPC 한 번(DMA 매핑 게이트 · 적재 날짜 · 하루 묶음 · 마커 상위 40 · 어제 locks · 90일 지문)으로, 격자 서명 URL 은 게이트 RPC 1회와 createSignedUrls 1회로 내주는 `/api/limitup` 라우트 2개와 shared 계약 타입.**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-10-05T10:16:37Z
- **Completed:** 2026-10-05T10:24Z
- **Tasks:** 2
- **Files:** 신규 7 · 수정 2

## Accomplishments

- `limitup_report_for_user(p_user_id, p_date)`: 가시 계좌 없음 → `{access:false}` 만 · 적재 이력 0 → `{access, dates:[], date:null, loaded:false}` · 적재 안 된 날짜 → `loaded:false` · 적재된 날짜 → `day{entries, locks, facts, summaries, marks, rows}` + `prev{date, locks}|null` + `fingerprint[]`. SETOF 없음.
- `limitup_grid_isins_for_user(p_user_id, p_date)`: 같은 게이트 · `{access, date, isins}`.
- 두 함수 service_role 전용: PUBLIC, anon, authenticated 명시 REVOKE + GRANT.
- shared `limitup-report.ts`: 행 키는 export 열 이름 그대로, 봉투 키는 camelCase. 격자 파일 타입 `LimitupGridFile`(열 24개 유니온) 포함.
- server: `d` = zod `^\d{8}$` + `Date.UTC` 재전개 실재 검사 · `p_user_id = req.userId` 하나 · `{access:false}` → 403 `DMA_UNMAPPED` · DB/Storage 오류는 고정 문구 500 `DB_ERROR`.

## Task Commits

1. **Task 1: 보고서 RPC 2개 + pgTAP** — `9fa5af52` (feat)
2. **Task 2: shared 계약 타입 + server 라우트 2개** — `669423cb` (feat)

TDD: 두 태스크 모두 테스트를 먼저 쓰고 RED 를 확인했다(pgTAP `function limitup_report_for_user(uuid) does not exist` · vitest 16건 실패). GREEN 뒤 구현과 같은 커밋에 넣었다(플랜 지시: 「PASS 뒤 한 커밋」).

## pgTAP — `limitup_report.test.sql` plan(50)

| 묶음 | 건수 | 내용 |
|---|---|---|
| A 게이트 · 이력 0 | 5 | U3 report(두 형태) · grid → `{access:false}` 만 · skip 만 있는 상태 → dates [] · p_user_id null |
| B 날짜 규칙 | 9 | 내림차순 · skip 날짜 제외 · null = 최신 · null 응답 = 20261002 응답 · 키 7개 · skip 날짜 / 이력 없는 날짜 / 형식 밖 → loaded false |
| C 하루 묶음 | 18 | entries isin 순 · null short_code 키 유지 · locks (isin, lock_id) · facts 정렬 · `"values"` · source · summaries q_krw null 유지 · rows · marks 40개 · new 제외 · 최소 6000 · 첫 행 45000 · 종목 02 내림차순 · 마커 키 8개 |
| D 어제 결과 | 5 | prev.date · prev.locks · d1_ret 소수 · 이전 없음 → null · 마커 없는 날 [] |
| E 지문 | 6 | n 내림차순 → member · 91일 전 · D−90 경계 제외 · 이름 최신 non-null · 합계 · 키 13개 · D=20261001 창 |
| F 격자 isin | 2 | 그날 isin · 격자 없는 날 [] |
| G 권한 | 6 | 2 함수 × anon · authenticated(불가) · service_role(가능) |

## 라우트 케이스 — `limitup-report.test.ts` 16건

- **report:** ① 미인증 401 · RPC 0 ② `2026-10-02 · abc · 2026100 · 20261340 · 20260230 · 20261000` → 400 · RPC 0 ③ `d` 생략 → `{p_user_id, p_date:null}` · 쿼리 user_id 무시 ④ `d=20261002` 그대로 · loaded 본문 snake_case 그대로 ⑤ 적재 안 된 날짜 200 loaded false ⑥ `{access:false}` → 403 DMA_UNMAPPED ⑦ RPC error → 500 원문 비노출 ⑧ null · 배열 · 문자열 → 500
- **grid-urls:** ① 미인증 401 · 서명 0 ② `d` 생략 · 형식 위반 · 날짜 아님 → 400 ③ access false → 403 · 서명 0 ④ isins 2 → `createSignedUrls(["grid/20261002/…A.json.gz", "…B.json.gz"], 600)` 1회 · `urls[isin]` ⑤ isins [] → 서명 0 · `urls {}` ⑥ 항목 error / 빈 signedUrl 은 뺀다 ⑦ Storage error → 500 원문 비노출 ⑧ RPC error · 비객체 · isins 배열 아님 → 500 · 서명 0

## 응답 크기 (실데이터 20261002 기준)

로컬 export `~/ticks/research/export/20261002` 로 RPC 와 같은 모양을 만들어 쟀다. entries 29행(25.5KB) · locks 12(5.2KB) · facts 169(52.9KB) · summaries 29(280.8KB — coarse q_krw 2,340점 × 29가 대부분) · marks 239(36.9KB — burst_sell + cancel 2,265행에서 종목마다 40개로 줄인 결과). `day` 합계는 **약 401KB, gzip 약 45KB** 다(server compression 이 이미 켜져 있다). prev locks 와 fingerprint 는 각각 몇 KB 수준이라 합계에 크게 보태지 않는다.

## Decisions Made

- 파일명은 `limitup-report.ts`(아래 Deviation 1).
- marks 순서는 isin 순, 종목 안에서는 krw 내림차순(동률이면 jump_no, krw null 은 뒤). 웹이 가장 큰 ▼·✕ 하나에만 라벨을 붙이는 규칙과 맞춘 것이다.
- p_date 형식 검사는 server zod 가 맡는다. RPC 는 형식 밖 값에 예외를 내지 않고 loaded false 를 돌려준다.
- 서명 URL 은 항목 단위 실패(객체 없음)면 그 항목만 빼고, 호출 전체가 실패할 때만 500 이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shared · server 새 파일 이름을 `limitup.ts` 에서 `limitup-report.ts` 로 바꿨다**
- **Found during:** Task 2
- **Issue:** 플랜 경로 `packages/shared/src/limitup.ts` · `server/src/schemas/limitup.ts` 는 기존 `limitUp.ts`(Phase 12 상한가 다음날 이력)와 대소문자만 다르다. macOS 의 대소문자 무시 파일 시스템에서는 같은 파일이라, 새 타입을 쓰자 기존 `packages/shared/src/limitUp.ts` 내용이 덮였다. tsup DTS 가 `TS1149 … differs … only in casing` 로 실패해 드러났다.
- **Fix:** `git checkout -- packages/shared/src/limitUp.ts` 로 원본을 되살렸다(커밋 전이라 이력 영향 없음, 커밋 669423cb 에 limitUp.ts 변경 없음). 새 파일은 라우트 이름과 같은 `limitup-report.ts` 로 맞췄다. 대상은 shared, schemas, services 세 곳이다(services 에는 충돌이 없지만 세 파일 이름을 통일했다).
- **Files:** packages/shared/src/limitup-report.ts · server/src/schemas/limitup-report.ts · server/src/services/limitup-report.ts
- **Commit:** 669423cb
- **영향:** 플랜 acceptance grep 의 `server/src/services/limitup.ts` · `packages/shared/src/limitup.ts` 는 `limitup-report.ts` 로 읽는다. 결과는 DMA_UNMAPPED 2 · createSignedUrls 2 · `export type LimitupReportResponse` 1. 뒤 플랜(28-12/13)은 `@gh-radar/shared` 패키지 이름으로 import 하므로 경로가 바뀐 영향을 받지 않는다.

**2. [Rule 1 - Bug] pgTAP 기대값을 바로잡았다(구현은 그대로)**
- **Found during:** Task 1 GREEN
- **Issue:** E 묶음의 「D=20261001 창」 단언이 00099 행(20261002 기준 D−90)을 제외한다고 기대했다. 그런데 이 행은 20261001 기준으로는 D−89 라 창 안에 있는 것이 맞다.
- **Fix:** 기대값을 `[["00099",7],["00002",2]]` 로 고쳤다. 같은 단언이 「91일 전 행 = 20261001 기준 D−90 경계 제외」 도 함께 잠근다.
- **Commit:** 9fa5af52

---

**Total deviations:** 2 auto-fixed (Rule 3 1 · Rule 1 1)
**Impact on plan:** 범위 변화 없음. 계약 타입 이름과 모양은 플랜 Artifacts 표 그대로다.

## Issues Encountered

- 플랜이 지정한 이름으로 shared 파일을 쓰다가 기존 `limitUp.ts` 를 잠시 덮었다(Deviation 1). 커밋 전에 git 원본으로 되돌렸고, `git diff d0c17ebe..HEAD -- packages/shared/src/limitUp.ts` 는 비어 있다.

## User Setup Required

None. 원격 RPC 적용은 28-14(`supabase db push`), server 배포는 28-15 몫이다. 이 플랜은 커밋만 했다(push · 배포 없음).

## Next Phase Readiness

- 28-12/13 웹 보고서 페이지는 `LimitupReportResponse` · `LimitupGridUrlsResponse` · `LimitupGridFile` 만 보면 된다. 403 `DMA_UNMAPPED` 와 401 은 모두 `DmaGate` 로 바꾼다.
- 평균(sum ÷ cnt)과 10건 게이트(「관찰 중」)는 웹이 계산한다. RPC 는 합계만 준다.
- Ready for 28-11.

## Self-Check: PASSED

- 신규 파일 7개 FOUND · 커밋 9fa5af52 · 669423cb FOUND · `limitUp.ts` 이력 변경 0
