---
phase: 13-home-surge-themes
plan: 03
subsystem: home-surge-themes
tags: [server, route, read-only, object-contract, verbatim-payload, supertest]
requires:
  - home_theme_snapshots (13-01 테이블)
  - "@gh-radar/shared Home* 타입 계약 (13-01, HomeSnapshotResponse 등)"
  - home-sync payload append (13-02, jsonb blob shape)
provides:
  - "GET /api/home 읽기 라우트 (객체 계약 { snapshot, index })"
  - "HomeQuery Zod 스키마 (date?/capturedAt? 둘 다 optional)"
  - "mapSnapshot / mapIndexEntry (home_theme_snapshots row → camelCase, payload verbatim)"
  - "supabase-mock home_theme_snapshots 데이터셋 지원 (테스트 인프라)"
affects:
  - 13-04/05/06 (webapp) — apiFetch<HomeSnapshotResponse>('/api/home') 소비
  - 배포 plan — server 재배포 시 /api/home 노출
tech-stack:
  added: []
  patterns:
    - "읽기 전용 객체 계약 라우트 (limitUp { hero, events, themes } 선례 mirror — 배열 아님)"
    - "정적 이력 verbatim payload (실시간 시세 재조인 없음, Pitfall 3 / T-13-03)"
    - "파라미터 우선순위 분기 (capturedAt > date > 무필터, 최신 captured_at desc)"
    - "generic 에러 위임 (next(e), error.message 미노출 — T-13-09)"
key-files:
  created:
    - server/src/schemas/home.ts
    - server/src/mappers/home.ts
    - server/src/routes/home.ts
    - server/src/routes/home.route.test.ts
  modified:
    - server/src/app.ts
    - server/tests/fixtures/supabase-mock.ts
decisions:
  - "route .order(captured_at desc).limit(1).maybeSingle() 종결 — server supabase-mock 은 .limit 이 builder 반환·.maybeSingle 이 terminal 이라 체이닝 정상 (worker mock 과 달리 안전)"
  - "test 는 co-located src/routes/home.route.test.ts (plan frontmatter 명세) — server tsconfig 가 이미 src/**/*.test.ts exclude 라 build 오염 없음 (13-02 vitest-in-build 함정 재발 없음)"
  - "mapper JSDoc 에서 'stock_quotes' 리터럴 제거('실시간 시세 재조인')— acceptance grep(no stock_quotes) 을 주석까지 엄격 충족"
metrics:
  duration: ~3min
  tasks: 2
  files: 6
  completed: 2026-07-01
---

# Phase 13 Plan 03: server GET /api/home 읽기 라우트 Summary

HOME-01 의 소비 경로를 확정: `home_theme_snapshots`(13-02 워커가 :30 슬롯마다 append)를 홈 화면에 노출하는 읽기 전용 `GET /api/home` 라우트를 limitUp 선례대로 **객체 계약** `{ snapshot, index }`(배열 아님)로 구현. 파라미터 조합(capturedAt > date > 무필터)으로 대상 슬롯을 선택하고, payload changeRate 는 저장 시점 값을 verbatim 서빙(실시간 시세 재조인 없음 — 과거 슬롯이 오늘 시세로 오염되는 Pitfall 3 / T-13-03 차단). app.ts 결선 + supertest 통합 5종 green + build exit 0.

## What Was Built

### Task 1 — Zod 스키마 + row 매퍼 (commit `ccbff1a`)
- **schemas/home.ts**: `HomeQuery = z.object({ date: regex(/^\d{4}-\d{2}-\d{2}$/).optional(), capturedAt: z.string().datetime().optional() })`. 두 파라미터 모두 optional — 우선순위(capturedAt>date)는 route 책임. PostgREST 바인딩 전 형식 검증(T-13-10 Input Validation).
- **mappers/home.ts**: `HomeSnapshotRow`(snake) + `HomeIndexRow`(Omit payload). `mapSnapshot` = snake→camel + **payload verbatim 통과**(재조인/재계산 없음 — T-13-03 / Pitfall 3, limitUp 정적 이력 선례). `mapIndexEntry` = payload 제외 경량 엔트리.

### Task 2 — home.ts 라우트 + app.ts 결선 + supertest (commit `586cb0b`)
- **routes/home.ts**: `HomeQuery.safeParse` → 400 `INVALID_QUERY_PARAM`. 쿼리1 = 대상 스냅샷(`capturedAt` eq | else `date` eq | else 무필터) `.order(captured_at desc).limit(1).maybeSingle()`. 쿼리2 = 네비 인덱스(payload 제외) `.order(captured_at desc).limit(200)`. `Cache-Control: no-store`. `res.json({ snapshot, index } satisfies HomeSnapshotResponse)`. 에러 `next(e)`(generic, message 미노출 — T-13-09).
- **app.ts**: `import { homeRouter }` + `app.use("/api/home", homeRouter)` (apiRateLimiter 이후, `/api/themes` 옆).
- **tests/fixtures/supabase-mock.ts**: `homeSnapshots` State 필드 + `home_theme_snapshots` datasetFor 분기 추가(테스트 인프라).
- **routes/home.route.test.ts** (supertest + mockSupabase): (1) 무파라미터 → 객체 `{ snapshot, index }`(배열 아님) + 최신 06:30 슬롯 + index payload 미포함 + no-store. (2) 데이터 없음 → `{ snapshot: null, index: [] }`. (3) `?date=xx` → 400. (4) payload changeRate=34.5 verbatim(Pitfall 3 assertion). (5) date+capturedAt → capturedAt 분기 우선(00:30/21.1 선택, date 무시).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 문서/grep 정합] mapper JSDoc 의 'stock_quotes' 리터럴 제거**
- **Found during:** Task 1 (acceptance grep 검증)
- **Issue:** mappers/home.ts JSDoc 이 "stock_quotes 실시간 재조인을 하지 않는다"로 negative 설명했으나, plan acceptance 는 `grep -q "stock_quotes" ... 무매치`를 엄격 요구 → 주석의 리터럴이 grep 에 걸려 기준 위반.
- **Fix:** 주석을 "실시간 시세 재조인을 하지 않는다"로 리워딩(`stock_quotes` 토큰 제거). 의미 동일, no-rejoin 규약 명확 유지.
- **Files modified:** server/src/mappers/home.ts
- **Commit:** `ccbff1a`

없음(그 외) — plan 은 명세대로 실행됨. 라우트 shape/스키마/에러 경로 모두 §Pattern 6 및 limitUp 선례와 동형.

## Verification

- `pnpm --filter server exec vitest run src/routes/home.route.test.ts` → **5/5 green**.
- 전체 스위트 `pnpm --filter server test` → **173/173 green (23 파일)** — 회귀 없음.
- `pnpm --filter server build` → **exit 0**.
- acceptance grep 전부 통과: `app.use("/api/home"`, `Cache-Control`/`no-store`, `home_theme_snapshots`, `next(e)`, mapper/route 둘 다 `stock_quotes` 무매치(no re-join).

## Threat Model Coverage

- **T-13-03 (stale-quote pollution) — mitigate**: mapSnapshot 이 payload 를 verbatim 통과, 실시간 시세 재조인 0(mapper/route grep 무매치). test 4 가 저장 mock changeRate=34.5 그대로 assertion.
- **T-13-09 (PostgREST error leak) — mitigate**: 에러 전부 `next(e)` 위임(generic error-handler), route 가 error.message 를 응답에 노출하지 않음.
- **T-13-10 (malformed query) — mitigate**: HomeQuery Zod(date regex + capturedAt datetime), safeParse 실패 → 400. test 3 가 `?date=xx` 400 assertion.

## Known Stubs

None — 라우트/스키마/매퍼 모두 실제 로직. 홈 payload 를 표시하는 webapp(13-04~06)과 server 재배포는 후속 plan 범위(스텁 아님).

## Threat Flags

None — 신규 네트워크 표면은 읽기 전용 `GET /api/home` 1개(untrusted query → Zod 검증 → Supabase 읽기)로, plan `<threat_model>` 이 이미 T-13-03/09/10 으로 커버. 신규 인증 경로/파일 접근/스키마 변경 없음(테이블은 13-01 에서 생성).

## Self-Check: PASSED

- FOUND: server/src/schemas/home.ts
- FOUND: server/src/mappers/home.ts
- FOUND: server/src/routes/home.ts
- FOUND: server/src/routes/home.route.test.ts
- FOUND: commit ccbff1a
- FOUND: commit 586cb0b
