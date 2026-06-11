---
phase: 11-co-movement-candidates-top-k
reviewed: 2026-06-11T00:00:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - packages/shared/src/comovement.ts
  - packages/shared/src/index.ts
  - scripts/deploy-comovement-sync.sh
  - scripts/setup-comovement-sync-iam.sh
  - scripts/smoke-comovement-sync.sh
  - server/src/lib/computeComovement.test.ts
  - server/src/lib/computeComovement.ts
  - server/src/lib/quoteJoin.ts
  - server/src/mappers/comovement.ts
  - server/src/routes/comovement.ts
  - server/src/routes/stocks.ts
  - server/src/routes/themes.ts
  - server/src/schemas/comovement.ts
  - server/tests/fixtures/supabase-mock.ts
  - server/tests/routes/co-movement.test.ts
  - server/tsconfig.json
  - server/vitest.config.ts
  - supabase/migrations/20260611120000_comovement_tables.sql
  - supabase/migrations/20260611130000_service_role_statement_timeout.sql
  - supabase/migrations/20260611140000_pgrst_reload_config.sql
  - webapp/src/components/stock/__tests__/stock-comovement-section.test.tsx
  - webapp/src/components/stock/stock-comovement-section.tsx
  - webapp/src/components/stock/stock-detail-client.tsx
  - webapp/src/lib/comovement-api.ts
  - workers/co-movement-sync/Dockerfile
  - workers/co-movement-sync/package.json
  - workers/co-movement-sync/src/config.ts
  - workers/co-movement-sync/src/index.ts
  - workers/co-movement-sync/src/logger.ts
  - workers/co-movement-sync/src/rebuild.ts
  - workers/co-movement-sync/src/services/supabase.ts
  - workers/co-movement-sync/tests/config.test.ts
  - workers/co-movement-sync/tests/rebuild.test.ts
  - workers/co-movement-sync/tsconfig.json
  - workers/co-movement-sync/vitest.config.ts
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-06-11
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

Phase 11 (동조 후보 TOP-K) 전체 스택 — shared 타입 계약, server 라우트/순수함수, SQL 사전계산 마이그레이션, Cloud Run 워커, 배포/스모크 스크립트, webapp 섹션 컴포넌트 — 를 standard 깊이로 검토했다.

전반적 품질은 높다. 보안 측면은 견고하다: `:code` zod 정규식 검증(T-11-09), `k` 상한 클램프(T-11-10), `rebuild_comovement` REVOKE 3줄(T-11-01, 프로젝트 memory 의 RPC REVOKE 교훈 준수), RLS `TO anon, authenticated` 명시(memory 교훈 준수), `SECURITY DEFINER SET search_path`(T-11-03), 워커 최소권한 SA(T-11-16), 하드코딩 시크릿 0건. PostgREST 1000행 침묵 절단·414 URL 한계 등 과거 회귀(37afcde)에 대한 방어도 테스트와 함께 잘 갖춰져 있다. `isThemeEligible` 와 SQL 적격성 필터의 일치(`security_group NOT NULL` 확인 포함)도 검증했다.

Critical 이슈는 없다. 다만 (1) UI "동반율" 라벨에 가중치 적용값(conf_d0_eff)이 노출되어 실제 동반율을 크게 과소 표기하는 의미 불일치, (2) 앵커의 유일 테마가 hidden 인 경우 tombstone 테마 멤버가 무근거 후보로 누수되는 엣지, (3) `service_role` statement_timeout 600s 상향이 사용자-facing API 에도 적용되는 DoS 방어 약화, (4) Next App Router 비-remount 내비게이션에서 동조 섹션 state 가 stale/sticky 되는 문제 — 4건의 Warning 을 발견했다.

## Warnings

### WR-01: UI "동반율" 표시값이 가중치 적용된 conf_d0_eff — 실제 동반율을 과소 표기

**File:** `server/src/lib/computeComovement.ts:167,177` + `webapp/src/components/stock/stock-comovement-section.tsx:61` + `packages/shared/src/comovement.ts:21-22`
**Issue:** `CoMovementCandidate.confD0` 는 shared 타입 doc 에 "동반율 (표시 메트릭, 0~1)" 로 정의되어 있고 webapp 은 이를 "동반율 N%" 로 렌더한다. 그러나 server 는 `confD0Eff = conf_d0 × 1/sqrt(member_count) × anchorRel` (라인 167, 177) 를 채워 보낸다. 예: 10명 테마에서 raw 동반율 70%, anchorRel≈0.83 인 후보는 `0.7 × 0.316 × 0.83 ≈ 0.18` → UI 에 "동반율 18%" 로 표기된다. 타이트니스/참여도 가중은 랭킹(strength)용 내부 점수인데 확률 라벨("동반율")에 그대로 노출되어 사용자에게 실제보다 4배 가까이 약한 신호로 오인된다. 코드 주석(Acc 의 "표시 메트릭 = conf_d0_eff")과 shared 타입 doc("동반율 0~1")이 서로 모순이므로 적어도 한쪽은 잘못이다. raw 값(`bestConfD0Raw`)은 이미 계산되어 있으나 후행 판정에만 쓰인다.
**Fix:** 표시 필드는 raw 동반율을 사용하고, 가중값은 strength 에만 반영:
```ts
// computeComovement.ts step 4
confD0: Number.isFinite(a.bestConfD0Raw) ? a.bestConfD0Raw : 0,
```
(의도적으로 eff 노출이 맞다면 shared 타입 doc 과 UI 라벨("동반율" → "결합 동반점수" 등)을 일치시킬 것.)

### WR-02: 앵커의 모든 테마가 hidden 이면 tombstone 테마 멤버가 무근거 후보로 누수

**File:** `server/src/routes/comovement.ts:80-130` + `server/src/lib/computeComovement.ts:156-159`
**Issue:** 라우트는 step 1 에서 `theme_comovement` 의 theme_id 를 hidden 필터 없이 수집하고, step 4 에서야 `themes.hidden=false` 로 `anchorThemes` 를 필터한다. 야간 rebuild 이후 운영자가 테마를 hidden 처리하면 `theme_comovement` 에는 해당 테마 행이 남는다. 이때 앵커의 **유일** 테마가 hidden 이면 `anchorThemes=[]` → `computeComovement` 의 `anchorThemeIds.size > 0 && !anchorThemeIds.has(...)` 가드(라인 159)가 비활성화되어 hidden 테마 멤버 전원이 테마 경로 후보로 집계된다. `themeNameById` 가 비어 sharedThemes 칩은 없으므로 UI 에서 근거 없는(coSurgeCount=null, 동반율 "—") 행으로 노출된다. 앵커 테마가 2개 이상이고 일부만 hidden 인 경우엔 가드가 정상 동작하는 비대칭 엣지.
**Fix:** themes 메타 조회를 멤버 조회보다 앞으로 옮기고, hidden 제외된 id 만 사용:
```ts
// step 1.5: themes 메타 먼저 (hidden=false)
const visibleThemeIds = anchorThemes.map((t) => t.id);
const themeMemberRows = await fetchThemeMembersPaged(supabase, visibleThemeIds);
```
또는 `computeComovement` 라인 159 의 `anchorThemeIds.size > 0 &&` 조건을 제거하고 항상 `anchorThemeIds.has(r.theme_id)` 를 요구 (Test C 는 themeRows=[] 라 영향 없음).

### WR-03: `ALTER ROLE service_role SET statement_timeout='600s'` 가 사용자-facing API 전체에 적용 — DoS 방어 약화

**File:** `supabase/migrations/20260611130000_service_role_statement_timeout.sql:19`
**Issue:** 마이그레이션 주석은 "service_role 은 백엔드 전용 ... 공개 API 응답성에 영향 없음" 이라 단정하지만, Express server 자체가 `SUPABASE_SERVICE_ROLE_KEY` 로 PostgREST 를 호출한다(`server/src/services/supabase.ts:4`). 따라서 이 role 레벨 설정은 야간 rebuild RPC 뿐 아니라 **모든 사용자 트리거 읽기 쿼리**의 타임아웃 천장을 ~8s → 600s 로 올린다. 메가 테마 페이지네이션 등 무거운 읽기가 실패-빠르게 끊기는 대신 최대 10분 커넥션을 점유할 수 있어, 이 phase 가 직접 명시한 위협(T-11-10 DoS)의 방어선을 약화시킨다.
**Fix:** 워커 전용 role 분리가 정석:
```sql
-- 야간 rebuild 전용 role 에만 600s 부여, service_role 은 기본 유지
CREATE ROLE comovement_worker NOINHERIT LOGIN ...;
GRANT EXECUTE ON FUNCTION public.rebuild_comovement(int) TO comovement_worker;
ALTER ROLE comovement_worker SET statement_timeout = '600s';
```
차선책: server 의 supabase-js 호출에 per-request 타임아웃(AbortSignal) 을 도입해 API 측 상한을 코드로 복원.

### WR-04: 종목 간 내비게이션 시 동조 섹션 state 미리셋 — 에러 1회 후 영구 숨김 + stale 후보 표시

**File:** `webapp/src/components/stock/stock-comovement-section.tsx:150-168`
**Issue:** `webapp/src/app/stocks/[code]/page.tsx` 는 `StockDetailClient` 에 `key={code}` 를 주지 않으므로, 후보 행 Link(`/stocks/A` → `/stocks/B`) 로 같은 동적 라우트 내를 이동하면 Next App Router 는 컴포넌트를 remount 하지 않고 props 만 갱신한다. `useEffect` 는 재실행되지만 effect 시작 시 state 를 리셋하지 않아 두 가지 버그가 생긴다: (1) **hasError sticky** — 어떤 종목에서 한 번 fetch 가 실패하면 `setHasError(true)` 이후 성공 경로에 `setHasError(false)` 가 없어, 이후 모든 종목에서 섹션이 영구 숨김된다. (2) **stale 표시** — 새 fetch 가 끝나기 전까지 이전 종목의 후보 목록/expanded 상태가 그대로 노출된다.
**Fix:** effect 시작 시 전체 리셋:
```ts
useEffect(() => {
  setLoaded(false);
  setHasError(false);
  setExpanded(false);
  setCandidates([]);
  const controller = new AbortController();
  // ... 기존 fetch 로직
}, [stockCode]);
```
(또는 page.tsx 에서 `<StockDetailClient key={code} ... />` 로 remount 강제 — 동일 클래스 stale 이 있는 StockDetailClient 자체 state 도 함께 해결됨.)

## Info

### IN-01: `?k=-3` 등 음수 k 가 조용히 빈 후보를 반환

**File:** `server/src/routes/comovement.ts:75`
**Issue:** `Math.min(Number(req.query.k) || 8, 50)` 은 NaN/0 은 8 로 폴백하지만 음수는 통과시킨다. `k=-3` → `computeComovement` 의 `Math.max(0, Math.min(-3, len))` → 항상 `{ candidates: [] }`. 400 도 기본값도 아닌 제3의 동작이라 디버깅 시 혼동 소지.
**Fix:** `const k = Math.min(Math.max(1, Math.trunc(Number(req.query.k)) || 8), 50);`

### IN-02: 워커 `pnpm dev` 가 silent no-op — CLI 가드가 `.ts` 진입을 배제

**File:** `workers/co-movement-sync/src/index.ts:34`
**Issue:** `process.argv[1].endsWith("index.js")` 는 `tsx src/index.ts` (dev 스크립트) 실행 시 argv[1] 이 `index.ts` 로 끝나 `main()` 이 호출되지 않고 정상 종료된다. candle-sync 등 기존 워커 패턴의 미러라 일관성은 있으나, 로컬 dev 실행이 아무 일 없이 exit 0 하는 함정.
**Fix:** `if (process.argv[1] && /index\.(js|ts)$/.test(process.argv[1])) { main(); }`

### IN-03: pino redact 경로가 1-depth 중첩만 커버

**File:** `workers/co-movement-sync/src/logger.ts:7`
**Issue:** `*.supabaseServiceRoleKey` 는 정확히 한 단계 중첩된 키만 마스킹한다. 톱레벨(`log.info(config)`)이나 2단계 이상 중첩 시 키가 평문 유출된다. 현재 코드는 config 객체를 로깅하지 않아 실해는 없으나 방어선이 얇다.
**Fix:** `paths: ["supabaseServiceRoleKey", "*.supabaseServiceRoleKey", "*.*.supabaseServiceRoleKey"]`

### IN-04: isTrailing 판정이 서로 다른 테마의 max 값을 교차 비교

**File:** `server/src/lib/computeComovement.ts:178-179,218`
**Issue:** `bestConfD1`(전 테마 max conf_d1)과 `bestConfD0Raw`(전 테마 max conf_d0)를 독립적으로 취해 비교하므로, 테마 A 에서 명백히 후행형(conf_d0=0.2, conf_d1=0.4)인 후보가 테마 B 의 conf_d0=0.5 에 가려 `isTrailing=false` 가 될 수 있다. 보수적 방향(과소 판정)이라 오탐은 없으나 다중 테마 후보에서 배지가 누락될 수 있음.
**Fix:** 테마 행 단위로 `conf_d1 > conf_d0 && conf_d1 >= 0.3` 을 판정해 `a.isTrailing ||= rowTrailing` 으로 누적.

### IN-05: 스모크 INV-3 가 gcloud 실패 시 false PASS

**File:** `scripts/smoke-comovement-sync.sh:75-82,97-105`
**Issue:** INV-3 은 "failed 로그 0건" 을 `wc -l` 로 세는데, `gcloud logging read` 자체가 실패(인증 만료 등)해도 출력이 비어 COUNT=0 → PASS 로 통과한다. 또한 INV-4 의 두 번째 check(cosurge_edges)는 첫 check 와 달리 `: ${SUPABASE_URL:?}` env 가드가 없다(첫 check 의 가드는 별도 subshell 이라 전파되지 않음 — env 미설정 시 curl 실패로 FAIL 은 되지만 진단 메시지가 없음).
**Fix:** INV-3 에서 `gcloud ... || exit 1` 로 명령 실패와 0건을 구분하고, INV-4 두 번째 check 에도 동일 env 가드를 추가.

### IN-06: `idx_ohlcv_surge_bar` 가 트랜잭션 내 non-CONCURRENT CREATE INDEX

**File:** `supabase/migrations/20260611120000_comovement_tables.sql:61-62`
**Issue:** `stock_daily_ohlcv` 는 24개월×전 종목 규모의 대형 테이블인데 BEGIN/COMMIT 블록 안에서 일반 `CREATE INDEX` 로 부분 인덱스를 생성한다. 생성 동안 SHARE 락으로 쓰기(candle-sync 의 EOD upsert)가 차단된다. 야간 외 시간대 적용 시 ingestion 워커와 충돌 가능. (마이그레이션 1회성이므로 운영 절차로 흡수 가능 — 기록 차원.)
**Fix:** 적용 시점을 장 마감 후로 제한하거나, 트랜잭션 밖 `CREATE INDEX CONCURRENTLY` 분리 마이그레이션으로 처리.

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
