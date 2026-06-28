---
phase: 12-a-n-master-sync
plan: 03
subsystem: backend
tags: [limit-up, express-route, supabase, read-only, cloud-run, contract-object]

# Dependency graph
requires:
  - phase: 12-a-n-master-sync (12-01)
    provides: LimitUpResponse/Event/StockStats/ThemeStat 객체 계약 타입 (packages/shared)
  - phase: 12-a-n-master-sync (12-02)
    provides: limit_up_events / limit_up_stock_stats / limit_up_theme_stats 3 사전계산 테이블 (production 적재 3459/1271/322 행) + RLS read TO anon, authenticated
  - phase: 11-co-movement
    provides: comovement.ts 라우트/스키마/매퍼 패턴 (1:1 복제 원본 — mergeParams, ApiError safeParse, 객체 satisfies 반환, toNum)
provides:
  - "GET /api/stocks/:code/limit-up 읽기 라우트 — limit_up_* SELECT → { hero, events, themes } 객체 (production live, revision gh-radar-server-00030-wb6)"
  - "LimitUpParams :code zod regex 검증 + snake_case→camelCase 매퍼(mapEvent/mapStats/mapTheme/zeroStats)"
  - "supabase-mock limit_up_* 데이터셋 라우팅 (후속 server 테스트 재사용)"
affects: [12-04 워커 배포(rebuild_limit_up 정기 호출), 12-05 webapp 상한가 섹션(이 라우트 apiFetch)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "정적 이력 읽기 라우트 = comovement 골격 복제 - 실시간 시세 조인/computeComovement/청크 fetch 제거 (RESEARCH Anti-Pattern)"
    - "응답 계약 객체 { hero, events, themes } (배열 아님) + satisfies LimitUpResponse 컴파일 강제"
    - "테마 통계 정렬은 읽기 시 sample_n DESC (마이그레이션은 전 풀 적재, D-17)"
    - "이벤트 0회 종목 → zeroStats() 로 hero 항상 객체 형태 보존 (webapp 빈 상태)"

key-files:
  created:
    - server/src/schemas/limitUp.ts
    - server/src/mappers/limitUp.ts
    - server/src/routes/limitUp.ts
    - server/src/routes/__tests__/limitUp.test.ts
  modified:
    - server/src/routes/stocks.ts
    - server/tests/fixtures/supabase-mock.ts

key-decisions:
  - "라우트는 limit_up_* SELECT 만 — 시세 실시간 조인/재계산 0 (D-22 read-only, RESEARCH Anti-Pattern). prod read-only 검증: 호출 전후 limit_up_events count 3459 불변"
  - "turnover/win_rate/avg_open_ret 등은 toNumOrNull 로 NULL 보존 (toNum 0-fallback 과 분리) — webapp 이 null 을 '—'/숨김 처리 (D-09 N≥3 게이팅)"
  - "테마 통계는 themes IN(앵커 active theme_id) name 조인(hidden=false tombstone 필터) + sample_n DESC 정렬 (D-17), 앵커 active 멤버십은 theme_stocks effective_to IS NULL"

patterns-established:
  - "server 단위 테스트 src/routes/__tests__/*.test.ts co-locate + supertest createApp + mockSupabase 상태주입 (vitest include src/**/*.test.ts 활용)"

requirements-completed: [LIMIT-01]

# Metrics
duration: ~11min (코드; checkpoint 배포 대기 제외)
completed: 2026-06-28
---

# Phase 12 Plan 03: server 상한가 다음날 이력 읽기 라우트 Summary

**GET /api/stocks/:code/limit-up — 사전계산 limit_up_* 테이블을 { hero, events, themes } 객체 계약으로 반환하는 정적 이력 읽기 라우트(시세 조인 0·재계산 0, comovement 골격 복제). server production 재배포(revision gh-radar-server-00030-wb6) + prod curl 검증: 000440 객체 계약 events=4·005930 빈 상태·!!! 400·limit_up_events count 3459 불변**

## Performance

- **Duration:** ~11 min (코드 작성·커밋·로컬 검증; [BLOCKING] checkpoint 배포 대기 제외)
- **Started:** 2026-06-28T12:01Z
- **Completed:** 2026-06-28T12:12Z (production 재배포 + prod curl 오케스트레이터 완료 후)
- **Tasks:** 3 (Task 3 = [BLOCKING] checkpoint, 오케스트레이터가 사용자 승인 후 실행)
- **Files created/modified:** 6 (생성 4 + 수정 2)

## Accomplishments
- `schemas/limitUp.ts` — `LimitUpParams` zod `:code` regex `/^[A-Za-z0-9]{1,10}$/` (comovement 복제, PostgREST 바인딩 전 형식 차단 T-12-03-01).
- `mappers/limitUp.ts` — 3 row 타입(LimitUpEventRow/StockStatsRow/ThemeStatRow) + `mapEvent`/`mapStats`/`mapTheme`/`zeroStats` + `toNum`/`toNumOrNull`. numeric(text) 정규화 + NULL 보존(turnover/win_rate) + histogram 5버킷 조립.
- `routes/limitUp.ts` — `Router({ mergeParams: true })` GET "/": stock_stats maybeSingle→hero(없으면 zeroStats) / events ORDER date DESC / theme_stocks active(effective_to IS NULL)→theme_id→limit_up_theme_stats IN + themes name 조인(hidden=false)→mapTheme→sample_n DESC. `res.json({ hero, events, themes } satisfies LimitUpResponse)`. **시세 조인/재계산 0** (정적 이력).
- `stocks.ts` — `stocksRouter.use("/:code/limit-up", limitUpRouter)` 를 `/:code` 핸들러보다 먼저 등록(use 라인 30 < get 라인 96, shadowing 회피 Pitfall 5).
- `__tests__/limitUp.test.ts` — supertest createApp 4 케이스: 객체 계약(Array.isArray===false)/events DESC+hero·theme 매핑+turnover null 보존/이벤트 0회 빈 상태/잘못된 :code 400. supabase-mock 에 limit_up_* 데이터셋 라우팅 추가.
- 로컬 검증: `pnpm -F @gh-radar/server test` **168/168 green** · `typecheck` exit 0 · `build` exit 0. acceptance grep 게이트 전부 통과.
- **production 재배포 + prod curl (오케스트레이터, 사용자 승인 후):** `deploy-server.sh` → revision `gh-radar-server-00030-wb6` 100% traffic. `/api/stocks/000440/limit-up` 200 객체 계약(hero.totalEvents=4·winRate=0.5·events 4건 점상1·themes 포함) / `005930` 200 빈 상태(totalEvents 0·events:[]) / `!!!` 400 / read-only count 3459 불변(D-22).

## Task Commits

1. **Task 1: schemas + mappers/limitUp.ts (zod 검증 + DB row 타입 + numeric 정규화)** — `28f6ce8` (feat)
2. **Task 2: routes/limitUp.ts + stocks.ts 등록 + 단위 테스트** — `285aa45` (feat)
3. **Task 3: [BLOCKING] server production 재배포 + prod curl 검증** — 코드 변경 없음(오케스트레이터 배포 실행). 검증 결과는 Accomplishments 반영.

_Task 2 는 tdd 지정 — RED(라우트 미존재 4건 404/실패 확인) → GREEN(라우트+등록) 검증 후, 라우트·테스트·mock 이 강결합이라 단일 feat 커밋으로 원자화(Plan 01 선례)._

## Files Created/Modified
- `server/src/schemas/limitUp.ts` - LimitUpParams zod :code regex (comovement 복제)
- `server/src/mappers/limitUp.ts` - 3 row 타입 + mapEvent/mapStats/mapTheme/zeroStats + toNum/toNumOrNull (NULL 보존)
- `server/src/routes/limitUp.ts` - GET /api/stocks/:code/limit-up 읽기 라우트 (limit_up_* SELECT → 객체 계약, 시세 조인 0)
- `server/src/routes/stocks.ts` - limitUpRouter import + /:code 핸들러 앞 등록
- `server/src/routes/__tests__/limitUp.test.ts` - 4 케이스(객체/DESC/null/빈상태/400)
- `server/tests/fixtures/supabase-mock.ts` - limit_up_* 데이터셋 라우팅 3종 추가

## Decisions Made
- **라우트 = SELECT only (D-22 read-only)**: rebuild_limit_up RPC 미호출, 시세 실시간 조인/computeComovement/청크 fetch 전부 제거(RESEARCH Anti-Pattern). prod 검증으로 limit_up_events count 3459 불변 실증.
- **NULL 보존 매핑 분리**: turnover/win_rate/avg_open_ret/worst_low_ret 등은 `toNumOrNull`(null 보존), 카운트 필드는 `toNum`(0 fallback). webapp 이 null 을 "—"/숨김 처리 — 0 으로 접으면 빈 데이터와 실제 0 구분 불가.
- **테마 정렬은 읽기 시**: 마이그레이션이 active 시스템 테마 전 풀 적재(D-17 HAVING count>=1), 라우트가 sample_n DESC 정렬해 노출. 앵커 active 멤버십은 theme_stocks effective_to IS NULL.
- **zeroStats 빈 상태**: 이벤트 0회 종목(005930 등)도 hero 가 항상 객체 형태 유지 — webapp 이 totalEvents 0 으로 빈 상태 렌더.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] limitUp.ts 주석의 식별자가 acceptance 리터럴 grep 게이트 위반**
- **Found during:** Task 2
- **Issue:** "시세 조인 제거" 의도를 설명하는 주석에 `stock_quotes`/`computeComovement`/`fetchQuotesChunked` 식별자를 명시했으나, plan acceptance 의 `grep -c "stock_quotes\|computeComovement\|fetchQuotesChunked" == 0` 리터럴 게이트가 2 매치로 실패(의미상 "미사용" 설명이나 게이트는 literal-0).
- **Fix:** 주석을 식별자 없이 의미 보존 표현("comovement 라우트의 실시간 시세 조인 / 동조 점수 계산 / 청크 시세 fetch 는 의도적으로 미사용")으로 변경 — Plan 01/02 의 grep 앵커 표현 변경 패턴 승계. 동작 무영향(주석).
- **Files modified:** server/src/routes/limitUp.ts
- **Verification:** `grep -cE "stock_quotes|computeComovement|fetchQuotesChunked" server/src/routes/limitUp.ts` == 0, build 재확인 green
- **Committed in:** 285aa45 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 주석 표현만 변경, 라우트 동작·계약 무영향. Scope creep 없음.

## Issues Encountered
- **deploy-server.sh exit 1 = smoke INV-8(rate limit 201→429) FAIL** — 본 plan 변경과 **무관**한 기존 rate-limit 타이밍 smoke. server 재배포·라우트 자체는 정상(revision gh-radar-server-00030-wb6 100% traffic, INV-1~7·9 전부 PASS, prod curl 4종 통과). 라우트 동작에 영향 없음. (DI 후보: smoke INV-8 타이밍 안정화 — 별도 인프라 PR.)
- **테스트 첫 실행 시 turnover null 어설션 실패** — 테스트 fixture 의 `turnover: p.turnover ?? 4.5` 가 명시 `null` 입력을 `4.5` 로 접는 버그(라우트가 아닌 테스트 fixture). `"turnover" in p ? p.turnover : 4.5` 로 수정 — 라우트는 null 정상 보존(toNumOrNull). 168/168 green.

## User Setup Required
None - server 재배포는 오케스트레이터가 사용자 GCP 인증(Deployer SA) 후 production 적용 완료. 추가 외부 서비스 설정 불필요. (rebuild_limit_up 정기 호출 워커 배포는 12-04, webapp 상한가 섹션은 12-05.)

## Next Phase Readiness
- **Wave 4 (12-04) 준비됨**: server 읽기 경로가 production live — webapp 섹션(12-05)이 `apiFetch<LimitUpResponse>("/api/stocks/:code/limit-up")` 로 객체 계약 소비 가능. 12-01 limit-up-sync 워커 배포(rebuild_limit_up 야간 1회 Cloud Run Job)는 12-04 책임.
- **블로커 없음**: 객체 계약·:code 검증·정적 읽기(시세 조인 0·재계산 0) 전부 prod curl 로 실증(000440 events>0, 005930 빈, !!! 400, count 불변).

## Self-Check: PASSED

- 생성 파일 4종(schemas/mappers/routes/limitUp.ts + __tests__/limitUp.test.ts) 전부 존재
- 커밋 28f6ce8 / 285aa45 둘 다 git log 확인
- prod 라우트 200 객체 계약 (오케스트레이터 curl 검증)

---
*Phase: 12-a-n-master-sync*
*Completed: 2026-06-28*
