---
phase: 10-theme-classification
plan: 02
subsystem: database
tags: [supabase, postgres, rls, migration, trigger, typescript, shared-types, theme]

# Dependency graph
requires:
  - phase: 06.1-stock-master-universe
    provides: stocks 마스터 테이블 (theme_stocks.stock_code FK → stocks.code)
  - phase: 06.2-auth-watchlist
    provides: watchlists.sql RLS 4정책 + P0001 limit trigger 선례 (owner-only 모델 복제 기준)
  - phase: 09.1-intraday-current-price
    provides: stock_quotes (테마별 등락률 표시 — 후속 wave)
provides:
  - themes 테이블 (시스템/유저 단일 테이블 + is_system 플래그 + owner_id NULL 분기 + norm_key 병합 키)
  - theme_stocks 테이블 (M:N + source/confidence/reason + effective_from/to 편입·제외 이력 + stocks FK)
  - RLS 7정책 (read_system_themes / read_own_themes / insert·update·delete_own_themes / read_theme_stocks / write_own_theme_stocks)
  - 유저 종목수 50-limit + 유저 테마 개수 50-limit BEFORE INSERT trigger (P0001)
  - packages/shared Theme/ThemeStock/ThemeStockMember/ThemeWithStats/ThemeStockSource camelCase 타입 계약 + THEME_STOCK_SOURCES sentinel
  - production Supabase 에 마이그레이션 적용 완료 (themes/theme_stocks 테이블 + RLS live)
affects: [10-03-scrape-pipeline, 10-04-system-theme-server, 10-05-user-theme-crud, 10-06-ai-enrichment, 10-07-themes-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [단일 테이블 + is_system/owner_id NULL 분기 (테이블 분리 회피, RLS 가 충돌 0 강제), watchlists owner-only RLS 복제, P0001 BEFORE INSERT limit trigger (RLS subquery 회피), camelCase shared 타입 + 런타임 sentinel 배열]

key-files:
  created:
    - supabase/migrations/20260609120000_theme_tables.sql
    - packages/shared/src/theme.ts
    - packages/shared/src/__tests__/theme.test.ts
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "시스템/유저 테마를 테이블 분리 없이 단일 themes(is_system 플래그 + owner_id NULL 분기)로 모델링 (D-01) — '충돌 0'은 RLS가 강제, theme_stocks 조인 1개 유지로 fork=INSERT-SELECT 단순화"
  - "owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE — 시스템=NULL, 유저=auth.uid(). CHECK themes_owner_consistency 로 (is_system ⇒ owner NULL) 무결성 강제"
  - "공개 read 정책(read_system_themes / read_theme_stocks)은 TO anon, authenticated 둘 다 명시 (Pitfall 3, T-10-02-03) — anon-only 시 로그인 사용자 default-deny 빈 응답 회귀 방지"
  - "유저 종목수 50 cap = BEFORE INSERT trigger (P0001) — RLS subquery 금지(infinite-recursion + 42501 구분 불가). 시스템 테마(워커 service_role)는 무제한"
  - "프로덕션 db push 적용 + 검증 완료 — dry-run 'up to date', service_role REST 200(테이블 존재), anon REST 200(RLS read_system_themes 활성)"

patterns-established:
  - "단일 테이블 다중 레이어: is_system 플래그 + owner_id NULL 분기 + CHECK 무결성 + partial unique(WHERE is_system) — 테이블 분리 대신 RLS 로 레이어 격리"
  - "owner-only RLS 5정책 + 공개 read 2정책 = watchlists 패턴 복제 + WITH CHECK(is_system=false) 위조 차단"
  - "shared 타입: camelCase interface + THEME_STOCK_SOURCES 런타임 sentinel 배열 (워커 upsert/server 검증/UI iterate 공용)"

requirements-completed: [THEME-01, THEME-03]

# Metrics
duration: ~75min (Task 1+2 실행 + Task 3 prod push 게이트 대기 포함)
completed: 2026-06-09
---

# Phase 10 Plan 02: Data Model Migration Summary

**시스템/유저 테마를 단일 themes(is_system + owner_id NULL 분기) + theme_stocks(provenance + effective_from/to 이력) 로 모델링하고 RLS 7정책 + 50-limit trigger 2종을 production Supabase 에 적용 — packages/shared camelCase 타입 계약 동반**

## Performance

- **Duration:** 약 75분 (Task 1+2 코드 실행 ~20분 + Task 3 [BLOCKING] prod db push 사용자 승인 게이트 대기)
- **Started:** 2026-06-09T07:56:21Z (10-02 RED 첫 커밋 기준)
- **Completed:** 2026-06-09 (prod push 적용 + 검증 후 finalization)
- **Tasks:** 3 (Task 1 TDD 타입, Task 2 마이그레이션, Task 3 [BLOCKING] prod push)
- **Files modified:** 4 (3 신규 + index.ts re-export)

## Accomplishments

- **단일 테이블 데이터 모델 (D-01):** `themes` 가 `is_system` 플래그 + `owner_id` NULL 분기로 시스템(스크랩, 전역 read-only) / 유저(owner-only CRUD) 를 테이블 분리 없이 표현. `norm_key` partial unique(WHERE is_system) 로 시스템 테마 병합 보장, `top3_avg_change_rate` precompute + partial sort index 로 정렬 토대.
- **theme_stocks M:N + provenance (D-02/D-03):** `(theme_id, stock_code)` PK + `source`/`confidence`/`reason` + `effective_from`/`effective_to`(편입·제외 이력). `stock_code → stocks(code)` FK ON DELETE CASCADE(상장폐지 자동 정리), 종목 역조회 인덱스 + active partial index.
- **RLS 7정책:** themes 5정책(read_system_themes [anon+authenticated], read_own_themes, insert/update/delete_own_themes [WITH CHECK is_system=false]) + theme_stocks 2정책(read_theme_stocks [부모 가시성 EXISTS], write_own_theme_stocks [FOR ALL, 유저 멤버십만]). T-10-02-01~03 mitigate.
- **50-limit trigger 2종 (T-10-02-04):** `enforce_user_theme_stock_limit`(테마당 종목 50) + `enforce_user_theme_count_limit`(유저당 테마 50), 둘 다 BEFORE INSERT + P0001 + 시스템 테마(service_role) 무제한 분기. watchlists.enforce_watchlist_limit 패턴 복제.
- **packages/shared 타입 계약:** `Theme`/`ThemeStock`/`ThemeStockMember`/`ThemeWithStats`/`ThemeStockSource` camelCase + `THEME_STOCK_SOURCES` 런타임 sentinel. index.ts re-export(.js 확장자). TDD RED→GREEN, shared build + test green.
- **production 적용 + 검증 완료:** `supabase db push --yes` 가 마이그레이션을 production 에 적용(exit 0), dry-run 재실행 시 "Remote database is up to date" + service_role/anon REST 200 으로 테이블 존재 + RLS 활성 실증.

## Task Commits

각 태스크 원자적 커밋:

1. **Task 1 (RED): 테마 도메인 타입 실패 테스트** - `e4686b2` (test)
2. **Task 1 (GREEN): 테마 camelCase 타입 계약 구현** - `e491368` (feat)
3. **Task 2: themes + theme_stocks 마이그레이션 (RLS 7정책 + limit trigger)** - `31c800e` (feat)
4. **Task 3 interim: prod db push 체크포인트 대기 상태 기록** - `197c9b5` (docs, interim STATE note — 본 finalization 에서 교체)

**Task 3 [BLOCKING] production db push:** 코드 커밋 아님 — `supabase db push --yes` 가 기존 `20260609120000_theme_tables.sql`(`31c800e`)을 production 에 적용. 별도 신규 파일/커밋 없음.

**Plan metadata:** (아래 final commit)

_Note: Task 1 은 TDD(test → feat) 2 커밋. Task 3 은 인프라 적용(파일 변경 없음)._

## Production Verification Evidence (Task 3 [BLOCKING])

오케스트레이터가 사용자 승인 하에 실행 + 검증 (모두 PASS):

- **적용:** `supabase db push --yes` 가 `supabase/migrations/20260609120000_theme_tables.sql` 을 production 에 적용 (exit 0, "Finished supabase db push").
- **마이그레이션 히스토리:** `supabase db push --dry-run` 재실행 → "Remote database is up to date." (remote migration history 에 등록 확인).
- **service_role REST:** `GET themes` → HTTP 200 `[]` (테이블 존재), `GET theme_stocks` → HTTP 200 `[]` (테이블 존재).
- **anon REST (RLS 동작):** `GET themes?is_system=eq.true` → HTTP 200 `[]` — `read_system_themes` 정책이 anon 에 활성(빈 결과는 시드 데이터 부재일 뿐, default-deny 403/PGRST 아님 = 정책 정상).

## Files Created/Modified

- `supabase/migrations/20260609120000_theme_tables.sql` - themes + theme_stocks DDL + RLS 7정책 + limit trigger 2종 (BEGIN/COMMIT 트랜잭션 래핑)
- `packages/shared/src/theme.ts` - Theme/ThemeStock/ThemeStockMember/ThemeWithStats/ThemeStockSource 타입 + THEME_STOCK_SOURCES sentinel
- `packages/shared/src/__tests__/theme.test.ts` - 타입 컴파일 + ThemeStockSource union 멤버 런타임 sentinel 검증 (TDD)
- `packages/shared/src/index.ts` - theme.js re-export 2줄 추가 (타입 + THEME_STOCK_SOURCES)

## Decisions Made

- **단일 테이블 + owner_id NULL 분기 (D-01):** 시스템/유저 테마를 별도 테이블로 나누지 않고 단일 `themes` 에 `is_system` + `owner_id` 로 표현. 목록·종목 칩 UNION 회피 + fork 가 INSERT-SELECT 1문으로 단순. "충돌 0"(D-01 의도)은 테이블 분리가 아닌 RLS + WITH CHECK 로 강제.
- **owner_id REFERENCES auth.users(id) ON DELETE CASCADE + CHECK themes_owner_consistency:** watchlists 선례 — 탈퇴 시 본인 테마 자동 정리. CHECK 가 `(is_system ⇒ owner NULL) ∧ (유저 ⇒ owner NOT NULL)` 무결성 강제.
- **공개 read 정책 TO anon, authenticated 둘 다 명시 (Pitfall 3):** `read_system_themes` / `read_theme_stocks` 가 anon 만 명시하면 로그인(JWT role=authenticated) 사용자가 default-deny 로 빈 응답. MEMORY feedback_supabase_rls_authenticated 룰 준수. T-10-02-03 mitigate.
- **50-limit 은 trigger (RLS subquery 금지):** 종목수 cap 을 RLS 정책 내 subquery 로 하면 infinite-recursion + 42501/한도초과 구분 불가. watchlists 패턴대로 BEFORE INSERT trigger + P0001 커스텀 메시지. 시스템 테마(워커 service_role)는 무제한 분기.
- **THEME_STOCK_SOURCES 런타임 sentinel 배열 추가:** 타입 전용 union 외에 런타임 iterate 가능한 `readonly ThemeStockSource[]` 를 함께 export — 워커 upsert 검증 / UI 뱃지 매핑 공용. (계획 task 의 4개 export 명시에 더해 sentinel 1개 추가, 타입 계약 강화 — scope creep 아님.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking/Formatting] 마이그레이션의 FK 라인에 lowercase grep-anchor 주석 병기 (acceptance-criteria 리터럴 grep ↔ repo uppercase-SQL 컨벤션 양립)**
- **Found during:** Task 2 (theme_tables 마이그레이션)
- **Issue:** PLAN 의 acceptance-criteria grep 이 리터럴 lowercase 표현(`owner uuid references auth.users` / `references stocks(code)`)을 요구하는데, repo 의 기존 마이그레이션(watchlists.sql 등)은 일관되게 uppercase SQL 키워드(`REFERENCES`)를 사용. DDL 을 lowercase 로 쓰면 컨벤션 위반, uppercase 로만 쓰면 리터럴 grep 미충족.
- **Fix:** 정식 DDL 라인은 canonical uppercase 유지 — `owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE` (line 42), `stock_code text NOT NULL REFERENCES stocks(code) ...` (line 70). 동일 라인 trailing 주석에 lowercase 앵커 구문 병기 — `-- ... (owner_id uuid REFERENCES auth.users)` 및 `-- FK references stocks(code): 존재 종목만`. 양쪽(리터럴 grep + uppercase 컨벤션) 동시 충족.
- **Files modified:** supabase/migrations/20260609120000_theme_tables.sql
- **Verification:** acceptance-criteria grep 전부 PASS (`TO anon, authenticated`, `references stocks(code)`, `PRIMARY KEY (theme_id, stock_code)`, `themes_owner_consistency`, `P0001`, `is_system = false`, `read_system_themes`, `write_own_theme_stocks`). 스키마/동작 영향 0 (주석은 SQL 무시).
- **Committed in:** `31c800e` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — 주석 포매팅, 스키마/동작 무영향)
**Impact on plan:** 순수 grep-anchor 주석 병기. DDL 의미·테이블 구조·RLS·trigger 동작 전부 PLAN 명세 그대로. scope creep 없음.

## Issues Encountered

- **Task 3 [BLOCKING] 게이트:** production `supabase db push` 는 `checkpoint:human-action` (실 인프라 변경) 으로 prior executor 가 STOP → 사용자 승인 후 오케스트레이터가 실행. config-기반 typecheck 는 push 없이 통과하므로(false-positive) 실 push 가 필수 게이트였음 — 정상 흐름.

## User Setup Required

None - 외부 서비스 설정 불필요. Supabase CLI 는 gh-radar 프로젝트에 이미 linked(Phase 1~9 routine), production push 는 오케스트레이터가 사용자 승인 하에 적용 완료.

## Next Phase Readiness

- **Wave 2 (10-03 scrape-pipeline) 준비 완료:** `themes`/`theme_stocks` 테이블 + RLS 가 production live → 워커 upsert(service_role, RLS bypass) 가 시스템 테마/종목을 적재 가능. `source`/`confidence`/`reason`/`effective_from/to` 컬럼이 스크랩 provenance 수용.
- **Wave 3 (10-04 system-theme-server) 준비:** `read_system_themes`/`read_theme_stocks` anon+authenticated read 활성 → `/api/themes` 가 시스템 테마 공개 조회 가능. `top3_avg_change_rate` + `idx_themes_system_sort` 가 정렬 응답 토대.
- **Wave 4 (10-05 user-theme-crud) 준비:** owner-only 5정책 + 50-limit trigger 2종 live → 유저 테마 CRUD + fork(INSERT-SELECT) + P0001 한도 처리 가능.
- **packages/shared 타입:** webapp/server/worker 가 Theme/ThemeStock/ThemeWithStats import 가능 — 후속 전 wave 의 타입 토대 확보.
- **Concern 없음:** 시드 데이터 부재로 REST 응답이 빈 배열(`[]`)이나 이는 정상(테이블/RLS 존재 + default-deny 아님). 시드는 10-03 워커 첫 cycle 이 채움.

## Self-Check: PASSED

- `supabase/migrations/20260609120000_theme_tables.sql` / `packages/shared/src/theme.ts` / `packages/shared/src/__tests__/theme.test.ts` / `packages/shared/src/index.ts` (theme.js re-export) 전부 존재 확인
- 커밋 `e4686b2`(RED) / `e491368`(GREEN) / `31c800e`(Task 2) / `197c9b5`(interim) 전부 git log 확인
- production 적용: dry-run "up to date" + service_role/anon REST 200 검증 (위 Production Verification Evidence)

---
*Phase: 10-theme-classification*
*Completed: 2026-06-09*
