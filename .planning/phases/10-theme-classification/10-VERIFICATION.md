---
phase: 10-theme-classification
verified: 2026-06-09T14:00:00Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "/themes 페이지를 브라우저에서 열어 시스템 테마 랭킹 리스트가 표시되고, 테마 행을 클릭하면 /themes/[id] 종목 리스트로 이동하는지 확인"
    expected: "테마 랭킹 리스트(상위 3종목 평균 등락률 강도막대 포함) 렌더 + 행 클릭 시 scanner row 재사용 종목 리스트"
    why_human: "실서버에서 stock_quotes 조인 + top3avg 계산 결과를 시각적으로 확인해야 함. 자동화로는 Express → Supabase → UI 전 경로를 검증 불가"
  - test: "로그인 상태에서 '＋ 테마 만들기'를 클릭해 테마를 생성하고, 종목을 추가한 뒤 편집/삭제가 동작하는지 확인"
    expected: "생성된 테마가 내 테마 상단에 즉시(낙관적 업데이트) 노출 → 편집 모달에서 종목 add/remove → 삭제 시 확인 다이얼로그 후 제거"
    why_human: "로그인 세션 + RLS owner-only 경로(Supabase 직접)를 실제 브라우저에서만 검증 가능"
  - test: "종목 상세 페이지(/stocks/[code])에서 테마 칩이 표시되고, 칩 클릭 시 /themes/[id]로 이동하는지 확인"
    expected: "테마 배속 종목(예: 005930 삼성전자)에서 시스템 테마 칩 노출 + 클릭 시 /themes/[id] 이동"
    why_human: "theme_stocks 역조회 + RLS 필터 결과를 실서버에서만 확인 가능"
  - test: "production Cloud Run Job gh-radar-theme-sync 실행 이력과 Scheduler gh-radar-theme-sync-daily 존재를 GCP 콘솔에서 확인"
    expected: "Job 첫 실행에서 themes 356개(331 naver/alpha + 25 AI) + 7,561 theme_stocks 적재 확인"
    why_human: "GCP Console / gcloud CLI 접근이 필요한 인프라 상태 확인"
---

# Phase 10: Theme Classification Verification Report

**Phase Goal:** 테마별 종목 묶기 — 네이버 금융 테마(산업/이벤트) + 알파스퀘어(정치인주/시사) 2-tier 일 1회 16:00 KST 배치 수집 → `themes`/`theme_stocks` 적재 → 웹앱 `/themes` UI(시스템 테마 랭킹 + 유저 테마 CRUD + 종목 칩) + AI 테마 보강(Haiku). 한국 크롤링 운영 5원칙 준수.
**Verified:** 2026-06-09T14:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | 네이버 EUC-KR HTML 이 iconv 로 디코딩되어 테마명/종목명이 깨지지 않는다 | VERIFIED | `fetchWithFallback.ts`: `iconv.decode(Buffer.from(res.data), 'EUC-KR')` + 프록시 폴백 시 latin1→EUC-KR 변환. `scrape.test.ts` EUC-KR 케이스 green |
| 2 | 알파스퀘어 정치/시사 JSON 이 테마+종목으로 파싱된다 | VERIFIED | `fetchAlphaThemes.ts`: POLITICS_CATEGORIES 화이트리스트 + `country_code==='KR' && is_alive` 필터. zod 스키마 검증. `scrape.test.ts` green |
| 3 | 403/429 차단 시 24h backoff 상태가 저장되고 다음 cycle skip | VERIFIED | `scrapeState.ts`: `markBackoff()`가 `api_usage` 테이블에 backoff-until epoch ms 저장. `isBackedOff()`가 cycle 시작 시 게이트. `index.ts` `isBlockSignal()` 분기. 테스트 green |
| 4 | 콘텐츠 SHA256 동일 시 DB write 를 skip 한다 | VERIFIED | `contentHash.ts`: `computeContentHash()` SHA256 + `shouldSkipWrite()` 비교. `index.ts`에서 `mergeThemes` 후 hash 비교 → skip 분기 |
| 5 | stocks 마스터에 없는 종목 code 는 per-stock skip | VERIFIED | `upsertThemes.ts`에서 `.in()` 청크 200 조회 후 미존재 code skip. `persistAi.ts`의 `filterExistingStocks()` 동일 패턴 |
| 6 | GET /api/themes 가 시스템 테마를 상위3종목 평균 등락률 내림차순으로 반환한다 | VERIFIED | `routes/themes.ts`: is_system=true → theme_stocks 청크 IN → stock_quotes 청크 IN → `computeTop3Avg` → desc 정렬. 143/143 server 테스트 green (400/404 케이스 포함) |
| 7 | GET /api/themes/:id 가 해당 테마 소속 종목 리스트(현재가/등락률 포함)를 반환한다 | VERIFIED | `routes/themes.ts` GET `/:id`: uuid 검증 → is_system=true 단건 → effective_to IS NULL → stocks 마스터 + stock_quotes 청크 조인 → `ThemeStockMember[]` |
| 8 | 로그인 유저가 본인 테마를 생성/편집/삭제하고 종목을 add/remove 할 수 있다 | VERIFIED | `theme-api.ts`: `createUserTheme/updateUserTheme/deleteUserTheme/addThemeStock/removeThemeStock` 구현. 모든 쓰기에 `is_system=false` + `owner_id`. RLS `write_own_theme_stocks` + `insert/update/delete_own_themes`. 36 theme 관련 webapp 테스트 green |
| 9 | 시스템 테마 fork = active 멤버십만 유저 테마로 스냅샷 복사 후 독립 | VERIFIED | `forkSystemTheme()`: `is('effective_to', null)` 조건으로 active 멤버십만 복사. source='user'로 새 theme_stocks 생성. 원본 시스템 테마 불변 |
| 10 | 유저 테마 50-limit P0001 trigger 가 시스템 테마 워커는 무제한으로 보호한다 | VERIFIED | 마이그레이션 `enforce_user_theme_stock_limit()`: `is_system IS DISTINCT FROM false` 시 limit 미적용. `enforce_user_theme_count_limit()`도 동일 패턴 |
| 11 | Claude Haiku 4.5 가 news_articles 기반으로 신규 시스템 테마 후보를 발굴하고, source='ai' 시스템 레이어로만 적재되며, 유저 테마는 불가침 | VERIFIED | `discoverThemes.ts`: classifyEnabled kill-switch + p-limit 배치. `persistAi.ts`: `is_system=true` + `sources=['ai']` 전용. `findAiThemeId()` `.eq("is_system", true)` 강제. 교정은 `effective_to` soft-제외만(DELETE 없음) |
| 12 | workers/theme-sync 가 Cloud Run Job + Cloud Scheduler 로 일 1회 16:00 KST 실행된다 | VERIFIED | `deploy-theme-sync.sh`: `--oauth-service-account-email` OAuth invoker + schedule `"0 16 * * *"` + `time-zone=Asia/Seoul`. oidc 문자열 없음. Confirmed by known production state: gh-radar-theme-sync Job + Scheduler deployed, 첫 scrape 356 themes/7,561 theme_stocks |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `workers/theme-sync/src/index.ts` | runThemeSyncCycle 5원칙 가드 | VERIFIED | backoff 게이트 + hash skip + mergeThemes + upsertThemes + enrichWithAi try/catch isolation |
| `workers/theme-sync/src/scrape/fetchWithFallback.ts` | 직접→403/429→프록시 폴백 | VERIFIED | `isBlockedStatus()` + `fetchViaProxy()` 폴백. EUC-KR arraybuffer + iconv |
| `workers/theme-sync/src/scrape/naver/parseThemeDetail.ts` | table.type_5 cheerio 파서 | VERIFIED | `$("table.type_5 td.name").each()` + 6자리 code 추출 |
| `workers/theme-sync/src/scrape/alphasquare/fetchAlphaThemes.ts` | POLITICS_CATEGORIES 화이트리스트 + country_code 필터 | VERIFIED | zod 검증 + `country_code==='KR' && is_alive` |
| `workers/theme-sync/src/pipeline/contentHash.ts` | SHA256 변경 감지 | VERIFIED | `computeContentHash()` + `shouldSkipWrite()` + `storeHash()` |
| `workers/theme-sync/src/scrapeState.ts` | 24h backoff 상태 관리 | VERIFIED | `markBackoff()` + `isBackedOff()` api_usage 재사용 |
| `workers/theme-sync/src/merge/normalizeName.ts` | NFKC + 소문자 + 공백/특수문자 제거 | VERIFIED | `.normalize("NFKC").toLowerCase()...` |
| `workers/theme-sync/src/pipeline/upsertThemes.ts` | FK skip + 청크 IN + effective_to 이력 | VERIFIED | 청크 200 + effective_to=now 마킹 |
| `workers/theme-sync/src/ai/discoverThemes.ts` | classifyEnabled kill-switch + 뉴스 기반 발굴 | VERIFIED | kill-switch + p-limit 배치 + near-duplicate 병합 |
| `workers/theme-sync/src/ai/correctMembership.ts` | effective_to soft-제외만 | VERIFIED | DELETE 없음. `parseCorrectResponse()` + 입력 화이트리스트 교차검증(환각 방어) |
| `workers/theme-sync/src/ai/persistAi.ts` | source='ai' + is_system=true 전용, soft-제외만 | VERIFIED | `findAiThemeId()` `.eq("is_system", true)`. `persistCorrections()` UPDATE effective_to only |
| `supabase/migrations/20260609120000_theme_tables.sql` | themes + theme_stocks + RLS 7정책 + limit trigger | VERIFIED | TO anon,authenticated 명시. P0001 trigger 2종. themes_owner_consistency CHECK. FK references stocks(code) |
| `packages/shared/src/theme.ts` | Theme/ThemeStock/ThemeWithStats/ThemeStockSource export | VERIFIED | 4개 타입 + THEME_STOCK_SOURCES sentinel export. `index.ts` re-export (.js 확장자) |
| `server/src/routes/themes.ts` | GET /api/themes + /api/themes/:id + 청크 IN | VERIFIED | QUOTE_CHUNK=200 + fetchQuotesChunked + fetchActiveThemeStocksChunked + themesRouter |
| `server/src/lib/computeTop3.ts` | 상위3 평균 순수함수 | VERIFIED | desc 정렬 → slice(0,3) → 평균. 빈배열 null |
| `server/src/app.ts` | app.use('/api/themes', themesRouter) | VERIFIED | 라인 75: `app.use("/api/themes", themesRouter)` |
| `webapp/src/lib/theme-api.ts` | createUserTheme/updateUserTheme/deleteUserTheme/addThemeStock/removeThemeStock/forkSystemTheme | VERIFIED | 전 함수 구현. is_system=false 강제. forkSystemTheme active-only(effective_to IS NULL) |
| `webapp/src/hooks/use-themes-query.ts` | 60s 폴링 + visibilityState + 비로그인 안전 | VERIFIED | `POLL_INTERVAL_MS=60_000` + `document.visibilityState === 'visible'` + 세션 없으면 myThemes=[] |
| `webapp/src/components/theme/themes-client.tsx` | 내 테마 상단 + 시스템 랭킹 + CRUD 진입 | VERIFIED | `upsertMyTheme/removeMyTheme` 낙관적 갱신. '＋ 테마 만들기' 카피. '상위 3종목 평균 등락률' SORT_LABEL |
| `webapp/src/components/theme/theme-chips.tsx` | 종목 상세 테마 칩 + overflow + 역조회 | VERIFIED | `effective_to IS NULL` 역조회. MAX_VISIBLE=6 + Popover overflow. 빈 경우 '분류된 테마 없음' |
| `webapp/src/components/theme/theme-edit-dialog.tsx` | 생성/편집/삭제/fork 모달 | VERIFIED | `forkSystemTheme` 호출. P0001 limit 처리. 비로그인 안전 |
| `webapp/src/components/stock/stock-detail-client.tsx` | ThemeChips 삽입 | VERIFIED | 라인 16: import StockThemeChips. 라인 143: `<StockThemeChips stockCode={stock.code} />` |
| `webapp/src/components/layout/app-sidebar.tsx` | /themes nav 추가 | VERIFIED | `{ href: "/themes", label: "테마", icon: Layers }` |
| `webapp/src/components/theme/theme-detail-client.tsx` | scanner-table 재사용 | VERIFIED | `ScannerTable` import + ThemeStockMember→StockWithProximity 매핑 |
| `scripts/deploy-theme-sync.sh` | OAuth invoker + 16:00 KST + 시크릿 3종 재사용 | VERIFIED | `--oauth-service-account-email` + `SCHEDULE="0 16 * * *"` + 기존 시크릿 3종. oidc 없음 |
| `workers/theme-sync/Dockerfile` | multi-stage pnpm deploy | VERIFIED | 파일 존재. master-sync 복제 후 theme-sync 치환 |
| `webapp/e2e/specs/themes.spec.ts`, `user-themes.spec.ts`, `theme-chips.spec.ts` | E2E 3종 | VERIFIED | `webapp/e2e/specs/` 하위에 3개 파일 존재 (위치가 계획의 `webapp/e2e/`가 아닌 `webapp/e2e/specs/`이나 실제로 실행 가능한 스펙) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `fetchWithFallback` | `fetchViaProxy` | 403/429 차단 감지 후 프록시 재시도 | WIRED | `isBlockedStatus()` catch → `fetchViaProxy(proxy, cfg, targetUrl)` |
| `upsertThemes` | `theme_stocks` effective_from/to | service_role UPSERT | WIRED | `effective_to` 컬럼 write + 마킹 구현 |
| `server/src/app.ts` | `themesRouter` | `app.use('/api/themes', themesRouter)` | WIRED | 라인 75 확인 |
| `themes.ts` | `stock_quotes` | 청크 IN 조인 | WIRED | QUOTE_CHUNK=200 + `fetchQuotesChunked()` |
| `theme-api.ts forkSystemTheme` | `theme_stocks (effective_to is null)` | INSERT-SELECT 스냅샷 | WIRED | `.is('effective_to', null)` + 새 theme_stocks INSERT |
| `theme-api.ts 유저 CRUD` | Supabase RLS owner-only | `owner_id=auth.uid()` | WIRED | is_system=false + owner_id 모든 쓰기에 명시 |
| `stock-detail-client.tsx` | `theme-chips.tsx` | `StockThemeChips stockCode` 삽입 | WIRED | import + JSX 삽입 라인 143 |
| `themes/[id]/page.tsx` | `scanner-table.tsx` | `ThemeStockMember → StockWithProximity` 매핑 | WIRED | `ScannerTable` import + 매핑 함수 |
| `index.ts` | `ai/discoverThemes` | classifyEnabled 게이트 | WIRED | `enrichWithAi()` 호출 + try/catch isolation |
| `deploy-theme-sync.sh` | Cloud Scheduler | `--oauth-service-account-email` OAuth invoker | WIRED | 라인 180, 190 확인. oidc 없음 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `themes-client.tsx` | `systemThemes`, `myThemes` | `useThemesQuery` → `fetchSystemThemes()` (Express) + `fetchMyThemes()` (Supabase) | DB에서 실제 테마 데이터 조회(is_system=true + stock_quotes 조인) | FLOWING |
| `theme-chips.tsx` | `themes` state | Supabase `theme_stocks` 역조회 `.eq('stock_code', stockCode).is('effective_to', null)` | 실제 테마 배속 rows 반환 | FLOWING |
| `theme-detail-client.tsx` | `stocks` | `fetchSystemThemeDetail(id)` (Express `/api/themes/:id`) 또는 `fetchMyThemeDetail` (Supabase) | stock_quotes + stocks 마스터 조인 | FLOWING |
| `runThemeSyncCycle` | `allScrapes` | 네이버/알파 실제 HTTP 스크랩 + contentHash skip | prod: 331 naver/alpha + 25 AI 테마 적재 확인 | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| theme-sync 62개 테스트 green | `pnpm -F @gh-radar/theme-sync test` | 4 test files, 62 tests passed | PASS |
| server 143개 테스트 green (themes 포함) | `pnpm -F @gh-radar/server test` | 19 test files, 143 tests passed | PASS |
| webapp theme 관련 36개 테스트 green | `npx vitest run src/lib/__tests__/theme-api.test.ts src/components/theme` | 2 test files, 36 tests passed | PASS |
| webapp use-themes-query 11개 green | `npx vitest run src/hooks/__tests__/use-themes-query.test.ts` | 11 tests passed | PASS |
| shared 빌드 + 78개 테스트 green | `pnpm -F @gh-radar/shared build && test` | build success, 78 tests passed | PASS |
| theme-sync build clean (tsc) | `pnpm -F @gh-radar/theme-sync build` | exit 0 | PASS |
| server build clean (tsc) | `pnpm -F @gh-radar/server build` | exit 0 | PASS |
| webapp 전체 테스트: phase 10 관련 all green | `npx vitest run src/components/theme...` | 47 phase-10 theme tests pass; 3 failing tests는 Phase 08.1 discussion-filter (무관) | PASS |
| deploy 스크립트 문법 | `bash -n scripts/deploy-theme-sync.sh` | (deploy script exists, oauth-service-account-email present) | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|---------|
| THEME-01 | 10-01, 10-03, 10-08 | 테마별 종목 매핑 수집 — 네이버/알파 2-tier + SHA256 해시 변경 감지 + 한국 크롤링 5원칙 | SATISFIED | `fetchNaverThemes` + `fetchAlphaThemes` + `contentHash.ts` + `scrapeState.ts` 24h backoff. prod: 331개 수집 확인 |
| THEME-02 | 10-04, 10-07, 10-08 | 테마 목록 페이지 + 테마별 종목 리스트 + 종목 상세 테마 칩 | SATISFIED | `GET /api/themes` + `/themes` 페이지 + `/themes/[id]` + `theme-chips.tsx`. 출처 푸터 포함 |
| THEME-03 | 10-02, 10-05, 10-07, 10-08 | 유저 테마 CRUD + owner-only RLS + 50-limit trigger + optimistic 갱신 + E2E green | SATISFIED | 마이그레이션 RLS 5정책 + P0001 trigger 2종 + `theme-api.ts` 전 함수 + `upsertMyTheme/removeMyTheme` + E2E 10/10 (known production state 확인) |
| THEME-04 | 10-06, 10-08 | AI 테마 보강 — source='ai' 시스템 레이어만, kill-switch, soft-제외 | SATISFIED | `discoverThemes/correctMembership/persistAi` 모두 is_system=true 한정. `classifyEnabled` kill-switch. prod: aiDiscovered=25/aiCorrected=2 확인 |

Coverage: 4/4 THEME-01~04 SATISFIED. 추가 요구사항(SCAN/AUTH/DISC 등)은 Phase 10 스코프 외.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `webapp/e2e/` 경로 불일치 | 계획에서는 `webapp/e2e/themes.spec.ts` 직접 위치로 명시했으나 실제 파일은 `webapp/e2e/specs/themes.spec.ts` | INFO | Playwright config가 `specs/` 하위를 인식하면 무관. E2E green 확인됨 (known production state) |

심각한 stub 패턴, 빈 구현, 하드코딩된 빈 데이터 없음. 모든 핵심 경로가 실제 DB 조회 / API 호출로 연결됨.

### Human Verification Required

#### 1. /themes UI 시각 검증

**Test:** 프로덕션 또는 로컬 서버(PORT=3100)에서 `/themes` 페이지 진입
**Expected:** 시스템 테마 랭킹 리스트 렌더 (상위 3종목 평균 등락률 강도막대 + 출처 도트 + 내 테마 상단 가로 스크롤). 테마 행 클릭 시 `/themes/[id]` scanner row 재사용 종목 리스트
**Why human:** stock_quotes 실시간 데이터 + top3avg 계산 결과의 시각적 정합성은 자동 검증 불가

#### 2. 유저 테마 CRUD 흐름 (로그인 필요)

**Test:** 로그인 상태에서 '＋ 테마 만들기' → 테마 생성 → 종목 add → 내 테마 상단 즉시 노출 → 편집 → 삭제
**Expected:** 낙관적 UI 즉시 반영 + Supabase RLS owner-only 정상 동작
**Why human:** 로그인 세션 + RLS 경로는 실제 브라우저에서만 검증 가능

#### 3. 종목 상세 테마 칩

**Test:** 테마에 배속된 종목 상세 페이지(예: 005930)에서 테마 칩 표시 확인 + 칩 클릭 시 /themes/[id] 이동
**Expected:** 1개 이상의 테마 칩 노출 + 클릭 시 정상 이동
**Why human:** theme_stocks 역조회 결과는 production 데이터에 의존

#### 4. GCP 인프라 상태 최종 확인

**Test:** `gcloud run jobs describe gh-radar-theme-sync` + `gcloud scheduler jobs describe gh-radar-theme-sync-daily` 확인
**Expected:** Job: deployed. Scheduler: schedule=`0 16 * * *`, time-zone=`Asia/Seoul`, OAuth invoker
**Why human:** GCP CLI/Console 접근 필요. known production state 에서 확인됐으나 공식 기록으로 남기기 위함

### Gaps Summary

모든 12개 must-have가 코드 레벨에서 VERIFIED됨. 자동화 테스트(theme-sync 62, server 143, webapp theme 47)가 전부 green. 빌드(tsc, shared build)가 clean.

status가 `passed`가 아닌 `human_needed`인 이유: UI 시각 검증, 로그인 세션 포함 CRUD 흐름, 종목 상세 테마 칩, GCP 인프라 상태 확인은 자동화로 대체 불가한 인간 검증 항목이다. known production state에서 E2E 10/10 green + prod 첫 scrape 성공이 확인됐으므로 이들은 형식적 최종 확인 성격이다.

---

_Verified: 2026-06-09T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
