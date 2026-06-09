---
phase: 10-theme-classification
plan: 04
subsystem: server
tags: [express, route, zod, supabase, service-role, chunked-in, top3-avg, theme, scanner-pattern]

# Dependency graph
requires:
  - phase: 10-theme-classification (Plan 02)
    provides: themes/theme_stocks 테이블(production live, RLS read_system_themes) + packages/shared Theme/ThemeWithStats/ThemeStockMember 타입 계약
  - phase: 09.1-intraday-current-price
    provides: stock_quotes.change_rate (장중 1분 갱신 + EOD overlay — 장중/장외 단일 컬럼 등락률)
  - phase: 06.1-stock-master-universe
    provides: stocks 마스터 (theme_stocks.stock_code → name/market 캐노니컬)
provides:
  - GET /api/themes (시스템 테마 목록 + 소속 종목 등락률 상위3 평균 desc 정렬)
  - GET /api/themes/:id (시스템 테마 소속 active 종목 ThemeStockMember[])
  - computeTop3Avg 순수 함수 (등락률 desc 상위3 평균, D-14)
  - 테마 mapper (themeRowToThemeWithStats / themeStockRowToMember / themeRowToTheme)
  - stock_quotes 청크(200) IN 헬퍼 3종 (fetchQuotesChunked / fetchMastersChunked / fetchActiveThemeStocksChunked)
  - supabase-mock 확장 (themes/theme_stocks dataset + .is(col,null) 연산자)
affects: [10-07-themes-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "scanner.ts 동형: codes → stock_quotes IN → 메모리 집계 (top_movers 선례를 theme_stocks 로 적용)"
    - "stock_quotes/.in() 청크(200) + error throw — 37afcde 강세장 빈응답 회귀 방지를 신규 경로에 선제 적용 (scanner.ts 는 아직 미청크, themes 는 청크)"
    - "상위3평균은 DB precompute 컬럼이 아닌 server 실시간 재계산 (D-14 권장 A2 — 항상 최신, 별도 Job 운영비 0)"
    - "service_role 로 시스템 테마(is_system=true) RLS 우회 + 라우트가 is_system 필터로 유저 테마 격리 (T-10-04-04)"
    - "Zod z.string().uuid() :id 검증 → PostgREST 바인딩 전 형식 차단 (T-10-04-01, stocks.ts :code 선례)"

key-files:
  created:
    - server/src/lib/computeTop3.ts
    - server/src/mappers/theme.ts
    - server/src/routes/themes.ts
    - server/src/schemas/themes.ts
    - server/tests/lib/computeTop3.test.ts
    - server/tests/routes/themes.test.ts
  modified:
    - server/src/app.ts
    - server/tests/fixtures/supabase-mock.ts

key-decisions:
  - "상위3평균을 server 실시간 계산(A2)으로 구현 — DB top3_avg_change_rate 컬럼은 캐시 폴백용으로만 두고 stock_quotes.change_rate 로 매 요청 재계산 (D-14 '지금 뜨는 테마' 신선도, scanner.ts 선례 동형)"
  - "stock_quotes/stocks/theme_stocks .in() 을 청크(200) + error throw — codes 합집합이 수천 개 가능(테마 종목 M:N)하므로 37afcde 회귀를 신규 경로에 선제 차단. scanner.ts(미청크)와 달리 themes 는 입력 규모 가변폭이 커 청크 필수"
  - "GET /:id 가 시스템 테마(is_system=true)만 조회 — 유저 테마 id 는 404. 유저 테마는 webapp→Supabase RLS 직접 경로(Plan 05)라 이 라우트에 노출 금지 (T-10-04-04 mitigate)"
  - "테스트 fixture uuid 를 valid v4(version=4)로 교정 — Zod v4 .uuid() 가 version nibble 을 검증하므로 'aaaa...' 형 비표준 uuid 는 400. 실 PK(gen_random_uuid)는 항상 v4라 라우트는 정상, fixture 만 실 형식으로 맞춤"
  - "테스트를 server/tests/ 에 배치 (PLAN frontmatter 의 src/__tests__/ 대신) — vitest.config include=tests/**/*.test.ts + 기존 19개 테스트 전부 tests/ 컨벤션. __tests__ 는 planning 아티팩트 오기"

patterns-established:
  - "테마 라우트: themes(is_system) → active theme_stocks 청크 IN → stock_quotes 청크 IN → computeTop3Avg → ThemeWithStats[] top3avg desc"
  - "청크 헬퍼 시그니처: (supabase, ids[]) → for(i+=200) .in(chunk) + error throw → Map/배열 집계 (37afcde fetchStocksMasterChunked 패턴)"
  - "mapper 분리: themeRowToThemeWithStats(목록·통계) vs themeStockRowToMember(상세·행) — 목록은 마스터 불필요, 상세만 stocks 조인"

requirements-completed: [THEME-02]

# Metrics
duration: ~7min
completed: 2026-06-09
---

# Phase 10 Plan 04: System Theme Server Summary

**시스템 테마 표시용 Express 라우트 구현 — GET /api/themes(시스템 테마 + 소속 종목 등락률 상위3 평균 desc 정렬) + GET /api/themes/:id(소속 active 종목 ThemeStockMember[]). 상위3평균은 theme_stocks 를 읽고 stock_quotes 를 청크(200) IN 으로 조인해 server 에서 실시간 계산(scanner.ts 동형). 37afcde 강세장 빈응답 회귀를 신규 경로에 선제 차단. service_role + is_system 필터로 유저 테마 격리.**

## Performance

- **Duration:** 약 7분 (09:15 → 09:22 UTC, 2태스크 TDD)
- **Tasks:** 2 (둘 다 TDD: computeTop3+mapper, 라우트+청크+결선)
- **Tests:** 25 신규 (computeTop3/mapper 13 + themes 라우트 12) — 전체 143 passed (19 파일)
- **Files:** 6 신규 + 2 수정(app.ts, supabase-mock)

## Accomplishments

- **computeTop3Avg 순수 함수 (D-14):** 등락률 배열 desc 정렬 → 상위3(이하) 평균, 빈 배열 null. 음수/혼합/2개/1개/0개 경계 7케이스. 라거드 희석 없이 "테마 발화" 신호 포착.
- **테마 mapper (snake→camel):** `themeRowToTheme`(기본 변환) + `themeRowToThemeWithStats`(stock_quotes 로 top3평균 실시간 재계산 + stockCount, DB precompute 컬럼 무시) + `themeStockRowToMember`(master/quote 조인, 시세 부재 em-dash 폴백, 스키마 외 source 폴백). source 는 THEME_STOCK_SOURCES sentinel 로 검증.
- **GET /api/themes (목록 정렬):** themes(is_system=true) → active theme_stocks(effective_to IS NULL) 청크 IN → 종목 code 합집합 → stock_quotes 청크 IN → 테마별 computeTop3Avg → ThemeWithStats[] top3avg **desc 정렬**(null 맨 뒤). Cache-Control no-store. 유저 테마/제외(effective_to) 멤버 격리.
- **GET /api/themes/:id (상세):** uuid 검증(400) → 시스템 테마 단건(없으면/유저면 404) → active 멤버 → stocks 마스터 + stock_quotes 청크 조인 → ThemeStockMember[]. 시세 부재 종목도 멤버 포함(price/changeRate/tradeAmount=0).
- **청크 IN 회귀 차단 (37afcde 교훈):** `fetchQuotesChunked`/`fetchMastersChunked`/`fetchActiveThemeStocksChunked` 가 codes/themeIds 를 200개씩 `.in()` + **error throw**. 테마 종목 합집합이 수천 개여도 PostgREST URL 한계(414) 통째 실패 → 빈 응답 회귀를 구조적으로 방지. 201개 code 테스트가 stock_quotes 호출 ≥2회로 청크 분할 실증.
- **app 결선:** `app.use("/api/themes", themesRouter)` (scannerRouter 다음). supabase-mock 에 themes/theme_stocks dataset + `.is(col,null)` 연산자 추가(active 필터 테스트 지원).

## Task Commits

각 태스크 원자적 커밋 (Korean, no Co-Authored-By):

1. **Task 1: computeTop3Avg 순수 함수 + 테마 mapper** - `812f798` (feat)
2. **Task 2: themes 라우트(목록+상세) + stock_quotes 청크 IN + app 결선** - `57f98bd` (feat)

**Plan metadata:** (아래 final commit)

_Note: 두 태스크 모두 tdd="true" 였으나 vitest 워크플로우상 RED(테스트 작성→실패 확인)→GREEN(구현→통과)를 단일 feat 커밋으로 통합. RED 산출물(테스트)과 GREEN 산출물(구현)이 같은 파일군에 속해 분리 커밋 이점 없음._

## Decisions Made

- **상위3평균 = server 실시간 계산(D-14 권장 A2):** DB `top3_avg_change_rate` precompute 컬럼이 아닌 매 요청 stock_quotes.change_rate 로 재계산. scanner.ts(top_movers codes → stock_quotes IN → 메모리 정렬)와 동형 — 항상 최신("지금 뜨는 테마"), 별도 stats Job 운영비 0. DB 컬럼은 캐시 폴백용으로만 보존(theme-stats Job 이 추후 채워도 라우트는 무시).
- **청크(200) + error throw 를 신규 경로에 선제 적용:** scanner.ts 는 아직 단일 `.in()`(미청크)이나, 테마는 종목 합집합 규모가 외부 상황(강세장 종목 폭증)에 따라 10배 변동 → 37afcde 회귀(약세장 통과/강세장 빈화면)가 그대로 재현될 위험. tasks/lessons.md "입력 가변 규모는 양극단 검증 + .in() 청크 필수" 룰을 처음부터 반영. error 무시 금지(조용한 빈 결과 → silent 오출력 차단).
- **is_system 필터로 유저 테마 격리 (T-10-04-04):** GET /:id 가 `.eq("is_system", true)` 로 시스템 테마만 조회 — 유저 테마 id 는 404. 유저 테마는 webapp→Supabase 직접(authenticated RLS, Plan 05) 경로라 service_role 라우트에 노출하면 RLS 우회로 타인 테마 누출 위험. 라우트 레벨에서 차단.
- **테스트 fixture uuid valid v4 교정 (Rule 1):** Zod v4 `.uuid()` 가 version nibble(13번째 hex=4) + variant(8~b)를 검증 → `aaaaaaaa-...` 형 비표준 uuid 는 400 반환. 실 PK 는 `gen_random_uuid()`(항상 v4)라 **라우트는 정상**, 내 fixture 만 비표준이라 실 형식(`a1111111-1111-4111-8111-...`)으로 교정. 라우트 코드 무변경.
- **테스트 위치 = server/tests/ (Rule 3):** PLAN frontmatter 의 `server/src/__tests__/` 는 planning 아티팩트 오기 — 실제 repo 는 vitest.config `include: ["tests/**/*.test.ts"]` + 기존 19개 테스트 전부 `server/tests/`. 컨벤션·config 양쪽 진실인 `tests/` 에 배치.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 테스트 경로를 server/tests/ 로 (PLAN frontmatter 의 src/__tests__/ 대신)**
- **Found during:** Task 1 (테스트 작성 위치 결정)
- **Issue:** PLAN frontmatter `files_modified` 가 `server/src/__tests__/{themes,computeTop3}.test.ts` 를 명시하나, 해당 디렉터리 부재 + vitest.config 의 `include` 가 `tests/**/*.test.ts` (src/ 미포함, tsconfig 도 tests exclude). src/__tests__/ 에 두면 테스트가 실행조차 안 됨.
- **Fix:** `server/tests/lib/computeTop3.test.ts` + `server/tests/routes/themes.test.ts` 에 배치 (기존 routes/mappers/lib 테스트 컨벤션 동일).
- **Files modified:** (테스트 파일 위치만 — 신규 생성)
- **Verification:** vitest 가 25 테스트 발견·실행 green. PLAN body Task 2 action 도 "themes.test.ts" 만 명시(경로 무관)라 의미 충족.
- **Committed in:** `812f798` / `57f98bd`

**2. [Rule 1 - Bug] 테스트 fixture uuid 를 valid v4 로 교정**
- **Found during:** Task 2 (GET /:id 테스트 5건이 200/404 기대에 400 반환)
- **Issue:** fixture uuid `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` 등이 RFC 4122 version nibble 미충족 → Zod v4 `.uuid()` 가 reject → 라우트가 정상 동작 전에 400. 라우트가 아닌 fixture 결함(실 PK 는 v4라 무영향).
- **Fix:** SYS_A/SYS_B/USER_T + "없는 테마" uuid 를 valid v4 형식(`a1111111-1111-4111-8111-111111111111` 등 version=4, variant=8)으로 교정. 라우트/스키마 코드 무변경.
- **Files modified:** server/tests/routes/themes.test.ts
- **Verification:** node 로 Zod uuid 검증 실증(v4 OK / 비표준 FAIL) 후 12 테스트 green.
- **Committed in:** `57f98bd`

**3. [Rule 3 - Blocking] supabase-mock 확장 (themes/theme_stocks dataset + .is 연산자)**
- **Found during:** Task 2 (라우트 테스트가 themes/theme_stocks 조회 + effective_to IS NULL 필터 사용)
- **Issue:** 기존 mockSupabase 는 stocks/stock_quotes/top_movers dataset 만, `.is(col,null)` 연산자 미지원 → 테마 라우트 테스트 작성 불가.
- **Fix:** State 에 `themes?`/`themeStocks?` 추가 + datasetFor 분기 + `.is()` 연산자(null/값 필터). 기존 18개 테스트 회귀 0(추가만, 기존 dataset/연산자 무변경).
- **Files modified:** server/tests/fixtures/supabase-mock.ts
- **Verification:** 전체 143 테스트 green (기존 131 + 신규 12, 회귀 0).
- **Committed in:** `57f98bd`

---

**Total deviations:** 3 auto-fixed (2 blocking 인프라/경로, 1 fixture 버그). 라우트/스키마/mapper 프로덕션 코드는 PLAN 명세 그대로 — 전부 테스트 인프라/fixture 조정.
**Impact on plan:** scope creep 없음. 모든 acceptance-criteria 충족 (test green, build 0, api/themes·themesRouter grep PASS, 201 code 청크 케이스 존재, top3 desc + 404 케이스 존재).

## Threat Surface

플랜 `<threat_model>` 의 T-10-04-01~04 surface 만 도입(신규 surface 없음). 모두 설계대로 mitigate:
- **T-10-04-01 (Tampering/Injection):** ThemeDetailParams `z.string().uuid()` → PostgREST 바인딩 전 형식 차단. 잘못된 :id → 400 INVALID_QUERY_PARAM.
- **T-10-04-02 (Information Disclosure):** ApiError envelope 로 generic 코드(THEME_NOT_FOUND/INVALID_QUERY_PARAM) 반환, 내부 PostgREST/RLS 메시지 미노출(error handler 미들웨어 선례).
- **T-10-04-03 (DoS):** stock_quotes/stocks/theme_stocks .in() 청크(200) — codes 수천 개여도 URL 한계/빈응답 회귀 차단(37afcde). 201 code 테스트가 분할 실증.
- **T-10-04-04 (Information Disclosure):** 두 라우트 모두 is_system=true 만 조회 — 유저 테마 누출 0. 유저 테마는 webapp→Supabase RLS 경로(Plan 05).

## Issues Encountered

- **Zod v4 `.uuid()` strict 검증:** Zod 4 의 `.uuid()` 는 RFC 4122 version/variant 까지 검증(v3 의 느슨한 정규식과 다름). 비표준 fixture uuid 가 400 을 유발 → 실 PK(gen_random_uuid=v4)는 무영향이나 테스트는 실 형식 사용 필수. (라우트는 strict 검증이 오히려 보안상 정확 — T-10-04-01.)
- **scanner.ts 미청크 vs themes 청크 불일치(의도적):** scanner.ts 는 top_movers 상한(KIS 등락률 순위 ~100)이라 codes 가 작아 단일 .in() 통과. themes 는 종목 합집합이 가변·대규모 → 청크 필수. 동일 코드베이스 내 두 패턴 공존은 입력 규모 차이에 기인(scanner 청크화는 별도 작업 — 본 plan 범위 밖, deferred-items 불필요: scanner 는 top_movers 상한으로 현재 안전).

## User Setup Required

None - 본 plan 은 server 라우트 + 단위 테스트만. themes/theme_stocks 테이블은 Plan 02 에서 production live, stock_quotes 는 Phase 09.1 운영 중. 외부 서비스/시크릿 추가 불필요. 실 데이터(시스템 테마 시드)는 theme-sync 워커(Plan 03 코드, Plan 08 배포) 첫 cycle 이 채움 — 배포 전에는 빈 배열 정상.

## Next Phase Readiness

- **Plan 07 (themes UI) 준비 완료:** GET /api/themes(목록, top3 desc 정렬) + GET /api/themes/:id(종목 ThemeStockMember[]) 가 webapp fetch 토대. ThemeStockMember 가 scanner row(StockWithProximity)와 매핑 가능한 최소 필드(code/name/market/price/changeRate/tradeAmount) 제공 → scanner-table.tsx 재사용(D-15). 빈/로딩/에러 상태는 scanner 컴포넌트 복제.
- **데이터 경로 확정:** 시스템 테마 = Express /api/themes(service_role, 본 plan), 유저 테마 = webapp→Supabase 직접(Plan 05). UI(Plan 07)는 두 경로를 내 테마(상단)+시스템(하단)으로 합성(D-13).
- **Concern:** 시스템 테마 시드 부재 시 /api/themes 가 `[]` 반환(정상) — UI 는 빈 상태 처리 필요. 실 시드는 theme-sync 배포(Plan 08) 후. top3평균은 stock_quotes 의존 → 장 마감 후/거래정지 종목은 등락률 0/제외(설계대로).

## Self-Check: PASSED

- 6 신규 파일(computeTop3.ts/theme.ts/themes.ts/schemas/themes.ts/computeTop3.test.ts/themes.test.ts) + SUMMARY.md + 2 수정(app.ts/supabase-mock.ts) 전부 존재 확인
- 커밋 `812f798`(Task 1) / `57f98bd`(Task 2) git log 확인
- 143/143 테스트 green + typecheck exit 0 + build exit 0
- grep: api/themes(app.ts) / themesRouter(routes) / computeTop3Avg / QUOTE_CHUNK=200 전부 PASS

---
*Phase: 10-theme-classification*
*Completed: 2026-06-09*
