---
phase: 10-theme-classification
plan: 01
subsystem: testing
tags: [vitest, cheerio, iconv-lite, anthropic-sdk, p-limit, supabase-mock, fixtures, theme-sync]

# Dependency graph
requires:
  - phase: 09.1-intraday-current-price
    provides: workers/ 워커 디렉터리 선례 (master-sync/discussion-sync/intraday-sync 복제 패턴)
provides:
  - workers/theme-sync 워크스페이스 골격 (package.json/tsconfig/vitest.config + logger/retry/supabase service)
  - 네이버 금융 테마 실측 fixture 2종 (EUC-KR→UTF-8 목록 + HBM 상세, cheerio 파서 회귀 고정)
  - 알파스퀘어 실측 JSON fixture 2종 (정치 카테고리 all-themes + 이재명 stocks)
  - createMockSupabase() v2 빌더 mock 헬퍼 (Wave 2+ integration test 토대)
  - cheerio/iconv-lite/@anthropic-ai/sdk/p-limit theme-sync 의존성 설치
affects: [10-03-scrape-pipeline, 10-04-system-theme-server, 10-06-ai-enrichment, theme-sync]

# Tech tracking
tech-stack:
  added: [cheerio ^1.2.0, iconv-lite ^0.6.3, "@anthropic-ai/sdk ^0.65.0", p-limit ^7.3.0]
  patterns: [worker scaffold 1:1 복제, EUC-KR→UTF-8 실측 fixture 캡처, vitest passWithNoTests Wave 0, Supabase v2 builder mock 체이닝]

key-files:
  created:
    - workers/theme-sync/package.json
    - workers/theme-sync/vitest.config.ts
    - workers/theme-sync/src/logger.ts
    - workers/theme-sync/src/retry.ts
    - workers/theme-sync/src/services/supabase.ts
    - workers/theme-sync/tests/fixtures/naver-theme-list.html
    - workers/theme-sync/tests/fixtures/naver-theme-detail.html
    - workers/theme-sync/tests/fixtures/alpha-all-themes.json
    - workers/theme-sync/tests/fixtures/alpha-stocks.json
    - workers/theme-sync/tests/helpers/supabase-mock.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "logger.ts 는 master-sync 의 named export `logger` 형태 채택 (discussion-sync factory 아님) — retry.ts 의 `import { logger }` 호환 유지하면서 redact paths 만 theme-sync 시크릿(brightdata/anthropic/supabase)으로 교체"
  - "alpha-all-themes.json 을 실측 548KB(27카테고리) → 정치(full 39테마)+반도체(2테마)로 트리밍 — CLAUDE.md 크롤링 5원칙 #5(부분 캐싱, 전체 DB 덤프 금지) + 필터(POLITICS_CATEGORIES) 포함/제외 양방향 검증 가능"
  - "네이버 HTML fixture 는 실측 full page 보존(트리밍 안 함) — cheerio td.name>div.name_area>a 선택자 컨텍스트(중첩 테이블) 손상 방지"

patterns-established:
  - "워커 스캐폴드: master-sync(package/tsconfig/retry/supabase) + discussion-sync(vitest passWithNoTests) 1:1 복제 후 name/redact 치환"
  - "실측 fixture 캡처: curl + iconv -f EUC-KR -t UTF-8 (네이버) / curl JSON 직접(알파), 파서 회귀 고정"
  - "Supabase v2 mock: 필터 메소드 mockReturnThis() 체이닝 + 종결 메소드 mockResolvedValue 주입, 동일 table 호출은 _chains[table] 동일 인스턴스 반환"

requirements-completed: [THEME-01, THEME-04]

# Metrics
duration: 6min
completed: 2026-06-09
---

# Phase 10 Plan 01: Test Infra & Fixtures Summary

**theme-sync 워크스페이스 스캐폴드 + 네이버 EUC-KR HTML 2종/알파스퀘어 JSON 2종 실측 fixture + createMockSupabase v2 빌더 mock 으로 Wave 0 테스트 토대 확보 (cheerio/iconv-lite/anthropic-sdk/p-limit 설치)**

## Performance

- **Duration:** 약 6분 25초
- **Started:** 2026-06-09T07:56:21Z
- **Completed:** 2026-06-09T08:02:46Z
- **Tasks:** 2
- **Files modified:** 11 (theme-sync 10 신규 + pnpm-lock.yaml)

## Accomplishments

- **theme-sync 워크스페이스**가 pnpm workspace(`workers/*` glob)에 인식되고 `pnpm -F @gh-radar/theme-sync test` 가 0 test 로 exit 0 (passWithNoTests). typecheck/build 도 clean.
- **네이버 금융 테마 실측 fixture 2종** 캡처 — `naver-theme-list.html`(table.type_1.theme, 40 테마 anchor, EUC-KR→UTF-8 한글 무손상) + `naver-theme-detail.html`(HBM no=536, table.type_5, 33종목, info_txt 편입사유). cheerio 가 실제 선택자로 40 anchor / 33 code 파싱 확인.
- **알파스퀘어 실측 JSON fixture 2종** 캡처 — `alpha-all-themes.json`(정치 카테고리 full 39테마, 이재명 id=6 포함) + `alpha-stocks.json`(이재명 40종목, code/country_code/is_alive).
- **createMockSupabase()** v2 빌더 mock — from/select/eq/in/is/maybeSingle/single/rpc 체이닝 + 종결 메소드 응답 주입 지원. Wave 2+ theme_stocks FK-skip/upsert integration test 토대.
- **의존성 설치** — cheerio ^1.2.0 / iconv-lite ^0.6.3 / @anthropic-ai/sdk ^0.65.0 / p-limit ^7.3.0, 워크스페이스 컨텍스트에서 require.resolve 검증.

## Task Commits

각 태스크 원자적 커밋:

1. **Task 1: theme-sync 워크스페이스 스캐폴드 (master-sync 복제)** - `e525c03` (feat)
2. **Task 2: 네이버/알파스퀘어 실측 fixture + supabase-mock 헬퍼** - `c19958b` (test)

**Plan metadata:** (아래 final commit)

## Files Created/Modified

- `workers/theme-sync/package.json` - @gh-radar/theme-sync, master-sync deps + cheerio/iconv-lite/@anthropic-ai/sdk/p-limit
- `workers/theme-sync/tsconfig.json` - master-sync 복제 (변경 없음)
- `workers/theme-sync/vitest.config.ts` - discussion-sync 복제 + passWithNoTests true
- `workers/theme-sync/src/logger.ts` - pino, theme-sync 시크릿 redact (brightdata/anthropic/supabase service-role/token)
- `workers/theme-sync/src/retry.ts` - master-sync withRetry 복제
- `workers/theme-sync/src/services/supabase.ts` - discussion-sync createSupabaseClient(url, serviceRoleKey) 복제
- `workers/theme-sync/tests/fixtures/naver-theme-list.html` - 네이버 테마 목록 EUC-KR→UTF-8 (table.type_1.theme, 40 anchor)
- `workers/theme-sync/tests/fixtures/naver-theme-detail.html` - 네이버 HBM(no=536) 상세 (table.type_5, 33종목, info_txt)
- `workers/theme-sync/tests/fixtures/alpha-all-themes.json` - 알파 정치(39테마)+반도체(2) all-themes
- `workers/theme-sync/tests/fixtures/alpha-stocks.json` - 알파 이재명(id=6) 종목 40개
- `workers/theme-sync/tests/helpers/supabase-mock.ts` - createMockSupabase v2 빌더 체이닝 mock
- `pnpm-lock.yaml` - 신규 4 의존성 lock

## Decisions Made

- **logger.ts export 형태**: 플랜은 "discussion-sync logger 복사"였으나 discussion-sync 는 `createLogger()` factory 를, master-sync(retry.ts 출처)는 named `logger` 를 export. retry.ts 의 `import { logger }` 호환을 위해 master-sync named-export 형태 채택 + redact paths 만 theme-sync 시크릿으로 교체. 수용 기준(brightdataApiKey/anthropicApiKey grep) 충족.
- **alpha-all-themes 트리밍**: 실측 548KB(27카테고리) 전체 대신 정치(full 39테마, 이재명 id=6)+반도체(2테마) 만 보존. CLAUDE.md 한국 크롤링 5원칙 #5(부분 캐싱·전체 DB 덤프 금지) 준수 + Wave 2 `fetchAlphaThemes` 의 POLITICS_CATEGORIES 필터 포함/제외 양방향 검증 가능.
- **네이버 HTML 미트리밍**: cheerio `td.name > div.name_area > a` 선택자가 중첩 테이블 컨텍스트에 의존 → 손수 트리밍 시 선택자 컨텍스트 손상 위험. 실측 full page 보존하여 파서 fidelity 확보(EUC-KR 디코딩 검증도 실페이지 기준).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] logger.ts named export 형태로 조정 (retry.ts import 호환)**
- **Found during:** Task 1 (워크스페이스 스캐폴드)
- **Issue:** 플랜은 discussion-sync logger 복사 지시이나 그 파일은 `createLogger()` factory export. master-sync 의 retry.ts 는 `import { logger }` (named instance) 사용 → factory 그대로 복사 시 retry.ts import 깨짐.
- **Fix:** master-sync logger 의 named `logger` export 형태를 채택하되 redact paths 를 theme-sync 시크릿(brightdataApiKey/anthropicApiKey/supabaseServiceRoleKey/access_token/token/authorization)으로 교체. T-10-01-01(Information Disclosure) mitigate 충족.
- **Files modified:** workers/theme-sync/src/logger.ts
- **Verification:** typecheck exit 0 (retry.ts→logger import 해소), grep brightdataApiKey/anthropicApiKey PASS
- **Committed in:** e525c03 (Task 1 commit)

**2. [Rule 2 - 부분 캐싱 정합] alpha-all-themes 실측 fixture 를 정치+반도체로 트리밍**
- **Found during:** Task 2 (fixture 캡처)
- **Issue:** 실측 all-themes 응답이 548KB(27카테고리 451테마 전체). CLAUDE.md 한국 크롤링 5원칙 #5 가 "전체 DB 덤프 보관 금지(부분 캐싱)" 를 명시 → 전체 덤프를 repo fixture 로 박제하면 5원칙 위반.
- **Fix:** 정치 카테고리(full 39테마, 핵심 가치)+반도체(2테마, 필터 제외 검증용)만 보존하여 49KB 로 트리밍. 실 구조(키 셰이프) 100% 보존 + 이재명 id=6 보존.
- **Files modified:** workers/theme-sync/tests/fixtures/alpha-all-themes.json
- **Verification:** 정치 카테고리 + 이재명 id=6 grep/JSON 파싱 PASS, country_code 필드 보존
- **Committed in:** c19958b (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking import 호환, 1 CLAUDE.md 부분캐싱 정합)
**Impact on plan:** 둘 다 정합성·정책 준수에 필수, scope creep 없음. 모든 수용 기준 그대로 충족.

## Issues Encountered

- **root `require.resolve` false alarm**: 검증 중 repo root 에서 `require.resolve('cheerio')` 가 MODULE_NOT_FOUND. 원인은 pnpm isolated node_modules(deps 가 workers/theme-sync/node_modules 에 있고 root 미호이스트) — 문제 아님. theme-sync 워크스페이스 컨텍스트에서 재실행 시 4개 deps 전부 resolve + cheerio 가 fixture 40 anchor/33 code 실파싱 확인.

## User Setup Required

None - 외부 서비스 설정 불필요. (theme-sync 의 실 시크릿 KIWOOM/BRIGHTDATA/ANTHROPIC/SUPABASE 환경변수는 후속 plan(10-03 스크랩 파이프라인, 10-08 배포)에서 도입.)

## Next Phase Readiness

- **Wave 2(10-03 scrape-pipeline) 준비 완료**: parseThemeList/parseThemeDetail unit test 가 네이버 fixture 참조 가능(cheerio 선택자 실파싱 확인), fetchAlphaThemes test 가 알파 JSON fixture(정치 포함/반도체 제외) 참조 가능, upsertThemes integration test 가 createMockSupabase 사용 가능.
- **Wave 5(10-06 ai-enrichment) 준비**: @anthropic-ai/sdk 설치 완료 + logger anthropicApiKey redact 경로 확보.
- **Concern 없음**: 외부 소스(네이버/알파) 둘 다 curl 200 OK(차단 없음) — RESEARCH valid_until 2026-07-09 내 실측 캡처 고정. 향후 소스 구조 변경 시 fixture 재캡처 필요.

## Self-Check: PASSED

- 11 theme-sync 파일 + SUMMARY.md 전부 존재 확인
- 커밋 e525c03(Task 1) / c19958b(Task 2) 전부 git log 확인

---
*Phase: 10-theme-classification*
*Completed: 2026-06-09*
