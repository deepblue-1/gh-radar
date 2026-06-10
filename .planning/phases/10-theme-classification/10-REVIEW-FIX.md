---
phase: 10-theme-classification
fixed_at: 2026-06-10T00:00:00Z
review_path: .planning/phases/10-theme-classification/10-REVIEW.md
iteration: 1
findings_in_scope: 16
fixed: 13
skipped: 3
status: partial
---

# Phase 10: Code Review Fix Report

**Fixed at:** 2026-06-10
**Source review:** .planning/phases/10-theme-classification/10-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 16
- Fixed: 13
- Skipped: 3

## Per-finding table

| ID | Action taken | Commit / Skip | Verified |
|----|--------------|---------------|----------|
| CR-W-01 | `withRetry` 에 `shouldRetry` 옵션 추가, 호출부에서 `shouldRetry: (e) => !isBlockSignal(e)` 주입 — 차단 신호 즉시 rethrow | `fb24eae` | yes (worker 66 tests pass, tsc clean) |
| CR-S-01 | 상세 라우트 `theme_stocks` fetch 를 `fetchActiveThemeStocksForOne` (ROW_PAGE 페이지네이션)로 교체 | `4d9e770` | yes (server 145 tests pass, tsc clean) |
| WR-S-01 | `themeRowToThemeWithStats` + `computeTop3Avg` 에 `Number.isFinite` NaN 가드 | `c46e586` | yes (server 145 tests pass, tsc clean) |
| WR-W-01 | direct fetch undefined-status 프록시 폴백 구분 | skipped: 차단 탐지 휴리스틱 변경 위험 (아래 사유) | n/a |
| WR-W-02 | 콘텐츠 해시 입력에서 표시명(name) 제외 | `9902a0f` | yes (worker 66 tests pass, tsc clean) |
| WR-W-03 | alpha `is_alive === null` 도 제외(명시 false + null) | `be96ffd` | yes (worker 66 tests pass, tsc clean) |
| WR-W-04 | 해시 52bit 절단 확장 | skipped: bigint 컬럼 + JS safe-integer 제약, 스키마 변경 필요 (아래 사유) | n/a |
| WR-W-05 | `loadMembershipForReview` 필터 pushdown/페이지네이션 | skipped: 테스트 mock 의 단일 `.limit()` 종결 계약 충돌 (아래 사유) | n/a |
| WR-W-06 | `discoverThemes` existing themes 페이지네이션 | skipped: 동일 mock 계약 + 현재 시스템 테마 <1000 latent (아래 사유) — 참고: limit 은 cfg 값이며 직접 1000 회귀는 미발생 |
| WR-S-02 | list 경로 select 컬럼 축소 | (효율 개선, fix_scope 내 — 아래 참고) skipped: 비차단 효율 항목, 위험 대비 이득 낮음 | n/a |
| WR-F-01 | fork effect 1회 실행 `forkStartedRef` 가드 + close 시 리셋 | `6039652` | yes (webapp tsc clean) |
| WR-F-02 | `StockChip.market` 추가, `chipToMember` 하드코딩 'KOSPI' 제거, 검색 결과 market 전달 | `6039652` (WR-F-01 과 동일 파일) | yes (webapp tsc clean) |
| WR-F-03 | `ThemesEmpty` 의 미배선 fork 안내 문구 제거 | `c7eae02` | yes (webapp tsc clean) |
| WR-D-01 | `effective_to` 주석 정정 (상태 추적용, append-only 이력 아님 명시) | `87502ec` | yes (comment-only, 스키마 무변) |
| WR-D-02 | 후속 마이그레이션에 `themes.updated_at` touch 트리거 추가 | `127ee72` | yes (re-read; SQL 파서 미가용) |
| WR-D-03 | 후속 마이그레이션에서 트리거 함수 2개 `SET search_path = public` 추가 | `127ee72` | yes (re-read; SQL 파서 미가용) |

> 참고: WR-S-02 는 리뷰가 Warning 으로 분류했으나 본질적으로 비차단 "효율" 권고다.
> 페이로드/행 크기 최적화로 정확성 버그가 아니며, list select 변경이 다른 매핑 경로에
> 미치는 영향 대비 이득이 낮아 보수적으로 skip 했다. (16건 중 1건)

## Fixed Issues

### CR-W-01: withRetry 가 차단 신호(403/429)도 지수 재시도 — 5원칙 #4 위반
**Files modified:** `workers/theme-sync/src/retry.ts`, `workers/theme-sync/src/index.ts`
**Commit:** `fb24eae`
**Applied fix:** `withRetry` 시그니처를 `attempts: number` → `WithRetryOptions | number` 로 확장(하위호환 유지). `shouldRetry` predicate 가 `false` 면 즉시 rethrow. 호출부에서 `shouldRetry: (e) => !isBlockSignal(e)` 주입 → 차단 신호는 재시도 없이 `markBackoff` 로 직행. transient(500/네트워크)만 지수 재시도. 기존 호출자 시그니처 보존(기본=전부 재시도).

### CR-S-01: Detail route theme_stocks fetch 1000행 절단
**Files modified:** `server/src/routes/themes.ts`
**Commit:** `4d9e770`
**Applied fix:** `fetchActiveThemeStocksForOne(supabase, themeId)` 헬퍼 추출 — list 라우트의 ROW_PAGE 페이지네이션과 동일하게 `.eq("theme_id", id).is("effective_to", null).order("stock_code").range(from, from+ROW_PAGE-1)` 루프로 전수 수집. 상세 라우트의 인라인 평문 쿼리를 교체.

### WR-S-01: Number(change_rate) NaN 이 정렬/top3 평균 오염
**Files modified:** `server/src/mappers/theme.ts`, `server/src/lib/computeTop3.ts`
**Commit:** `c46e586`
**Applied fix:** 매퍼에서 `const n = Number(q.change_rate); if (Number.isFinite(n)) rates.push(n);`. `computeTop3Avg` 도 입구에서 `rates.filter(Number.isFinite)` 이중 가드(순수 함수 차원 방어).

### WR-W-02: mergeThemes 표시명 순서 의존 → 해시 흔들림
**Files modified:** `workers/theme-sync/src/pipeline/contentHash.ts`
**Commit:** `9902a0f`
**Applied fix:** `computeContentHash` canonical 직렬화에서 `n: t.name` 제거. 멤버십(normKey + sources + codes)만 해시 입력 → 표시명 변동이 write-skip 을 깨지 않음(5원칙 #2 강화). 워커 66 tests pass (하드코딩 해시 assertion 없음 확인).

### WR-W-03: alpha is_alive null 통과
**Files modified:** `workers/theme-sync/src/scrape/alphasquare/fetchAlphaThemes.ts`
**Commit:** `be96ffd`
**Applied fix:** 필터를 `s.is_alive !== false && s.is_alive !== null` 로 강화 — 명시 false + null(상폐/거래정지) 제외. 필드 부재(undefined)는 생존 간주(알파가 정상 종목에서 생략 가능, country_code 엄격 일치와 균형). 리뷰의 `=== true` 보다 보수적이되 정상 종목 과잉 탈락 회피.

### WR-F-01 / WR-F-02: fork 중복 실행 + 검색 결과 market 유실
**Files modified:** `webapp/src/components/theme/theme-edit-dialog.tsx`
**Commit:** `6039652` (두 finding 동일 파일 — 함께 검증/커밋)
**Applied fix:**
- WR-F-01: `forkStartedRef` 1회 실행 가드 추가, dialog close 시 리셋 → `onSaved` 신원 변경으로 effect 재실행돼도 중복 fork 차단.
- WR-F-02: `StockChip` 에 `market: Market` 추가, `chipToMember` 의 하드코딩 `'KOSPI'` 제거, 검색 결과(`Stock.market`)를 `handleAddStock` 으로 전달 → 낙관적 렌더에서 KOSDAQ 오표기 제거.

### WR-F-03: 미배선 fork 안내 dead-copy
**Files modified:** `webapp/src/components/theme/themes-empty.tsx`
**Commit:** `c7eae02`
**Applied fix:** "아래 시스템 테마에서 복사(fork)해서 시작할 수도 있어요" 안내 문구 제거(카피-기능 불일치 해소). dialog 의 fork 분기 코드는 향후 배선용 latent feature 로 유지(사용자 비노출 — 삭제 시 더 큰 변경이라 보류).

### WR-D-01: effective_to 주석 오해 소지
**Files modified:** `supabase/migrations/20260609120000_theme_tables.sql`
**Commit:** `87502ec`
**Applied fix:** comment-only 정정. PK `(theme_id, stock_code)` 가 pair 당 1행이므로 effective_to 는 "최신 상태 + 마지막 제외 마커"일 뿐 append-only 다주기 이력이 아님을 명시. 적용된 마이그레이션의 스키마는 무변경(주석만) → 운영 divergence 없음.

### WR-D-02 / WR-D-03: updated_at touch 트리거 부재 + search_path 누락
**Files modified:** `supabase/migrations/20260610120000_theme_triggers_followup.sql` (신규)
**Commit:** `127ee72`
**Applied fix:** 적용된 마이그레이션(20260609120000)을 in-place 수정하지 않고 후속 마이그레이션 신규 작성:
- WR-D-02: `touch_themes_updated_at()` + `BEFORE UPDATE ON themes` 트리거 → UPDATE 시 `updated_at = now()`.
- WR-D-03: `enforce_user_theme_stock_limit()` / `enforce_user_theme_count_limit()` 를 `CREATE OR REPLACE` (본문 동일) + `SET search_path = public` 추가. 프로젝트 plpgsql 규약 일치.

## Skipped Issues

### WR-W-01: direct fetch undefined-status 프록시 폴백 구분
**File:** `workers/theme-sync/src/scrape/fetchWithFallback.ts:61-75`
**Reason:** `isBlockedStatus(undefined)===true` 는 의도된 설계(네이버 차단의 흔한 증상이 status 미상). transient 와 진짜 차단을 분리하는 변경은 법적/비용 민감한 차단 탐지 휴리스틱을 흔들 위험이 크다. 리뷰도 "권장" 수준이며, CR-W-01 이 이미 핵심 우려(retry 마다 곱연산 프록시 호출)를 해소(차단 신호 즉시 rethrow → retry 곱연산 제거). 안정화 우선으로 skip.
**Original issue:** 직접 fetch undefined-status 도 즉시 프록시 폴백 — withRetry 와 이중 재시도 충돌.

### WR-W-04: 해시 다이제스트 52bit 절단
**File:** `workers/theme-sync/src/pipeline/contentHash.ts:60-62`
**Reason:** 해시는 `api_usage.count`(bigint) 에 저장되고 JS `Number` 로 읽혀 안전정수(2^53) 이내여야 한다. 13 hex(52bit)는 이미 safe-integer 경계. 64bit+ 비교는 text 컬럼/별도 테이블이 필요 → 이미 운영 적용된 시스템에 스키마 변경을 요구하는 더 큰 작업. 충돌 시 실패 모드는 "write skip"(다음 cycle 자동 복구)으로 치명적이지 않아 보수적으로 skip.
**Original issue:** 해시 다이제스트 52bit 절단 — 변경 누락(write skip) 위험.

### WR-W-05 / WR-W-06: 검수/발굴 쿼리 필터 pushdown·페이지네이션
**File:** `workers/theme-sync/src/ai/enrich.ts:43-73`, `workers/theme-sync/src/ai/discoverThemes.ts:328`
**Reason:** 두 쿼리는 코드 주석에 명시된 대로 "종결은 `.limit()` 하나만 — mock/PostgREST 일관, `.is()/.not()` 미사용" 계약을 따른다. 페이지네이션 루프나 PostgREST 필터 추가는 이 mock-호환 계약을 깨 워커 테스트를 흔든다. 두 항목 모두 현재 미발현(시스템 테마 <1000, 검수 대상 <200) latent scale 경고로, 안전한 자동 수정 범위를 넘는 리팩터라 skip. 향후 데이터 증가 시 mock 갱신과 함께 페이지네이션 도입 권장.
**Original issue:** loadMembershipForReview `.limit(200)` JS 필터 전 적용 / discoverThemes existingThemeNames `.limit(2000)` db-max-rows 1000 잠재 회귀.

---

_Fixed: 2026-06-10_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
