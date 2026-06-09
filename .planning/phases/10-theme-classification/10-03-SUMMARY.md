---
phase: 10-theme-classification
plan: 03
subsystem: worker
tags: [theme-sync, cheerio, iconv-lite, euc-kr, alphasquare, bright-data-proxy, sha256, backoff, zod, scrape-pipeline]

# Dependency graph
requires:
  - phase: 10-theme-classification (Plan 01)
    provides: theme-sync 스캐폴드(logger/retry/supabase) + 네이버/알파 실측 fixture 4종 + createMockSupabase
  - phase: 10-theme-classification (Plan 02)
    provides: themes/theme_stocks 테이블(production live) + packages/shared Theme/ThemeStock 타입 계약
  - phase: 08-discussion-board
    provides: Bright Data Web Unlocker proxy/client + api_usage incr RPC (복제/재사용 기준)
provides:
  - theme-sync 2-tier 스크랩 코어 (네이버 EUC-KR cheerio + 알파스퀘어 공개 JSON API)
  - 직접 fetch → 403/429 Bright Data 프록시 폴백 (fetchWithFallback)
  - 보수적 norm_key 정규화 병합 (normalizeName + mergeThemes)
  - themes/theme_stocks service_role UPSERT (FK skip + 청크 + effective_to soft-제외 이력)
  - 콘텐츠 SHA256 변경 감지(shouldSkipWrite) + 429/403 24h backoff(scrapeState) — 한국 크롤링 5원칙 코드 반영
  - runThemeSyncCycle() 결선 (스크랩→병합→upsert, backoff/해시/일1회 가드)
affects: [10-06-ai-enrichment, 10-08-deploy, theme-sync]

# Tech tracking
tech-stack:
  added: [zod ^4.3.6]
  patterns:
    - "직접 fetch → 403/429/undefined-status 시 Bright Data 프록시 1회 폴백 (자동 지수 재시도 금지, 5원칙 #4)"
    - "EUC-KR: axios arraybuffer + iconv.decode (responseType:text 금지, Pitfall 2)"
    - "api_usage 테이블 재사용 backoff (service=theme_*_backoff, count=backoff-until epoch ms — 신규 마이그레이션 없음)"
    - "콘텐츠 SHA256 → 52bit 정수 다이제스트(api_usage.count bigint 저장) 변경 감지"
    - "보수적 norm_key 정규화 (NFKC+소문자+공백/특수문자 제거, 괄호 보존, Levenshtein 금지)"
    - "UPSERT: stocks .in() 청크(200) FK 존재확인 per-stock skip + theme_stocks 청크(500) + effective_to 이력"

key-files:
  created:
    - workers/theme-sync/src/config.ts
    - workers/theme-sync/src/proxy/errors.ts
    - workers/theme-sync/src/proxy/client.ts
    - workers/theme-sync/src/scrape/types.ts
    - workers/theme-sync/src/scrape/fetchWithFallback.ts
    - workers/theme-sync/src/scrape/naver/parseThemeList.ts
    - workers/theme-sync/src/scrape/naver/parseThemeDetail.ts
    - workers/theme-sync/src/scrape/naver/fetchNaverThemes.ts
    - workers/theme-sync/src/scrape/alphasquare/fetchAlphaThemes.ts
    - workers/theme-sync/src/scrapeState.ts
    - workers/theme-sync/src/merge/normalizeName.ts
    - workers/theme-sync/src/merge/mergeThemes.ts
    - workers/theme-sync/src/pipeline/contentHash.ts
    - workers/theme-sync/src/pipeline/upsertThemes.ts
    - workers/theme-sync/src/index.ts
    - workers/theme-sync/tests/scrape.test.ts
    - workers/theme-sync/tests/merge.test.ts
    - workers/theme-sync/tests/pipeline.test.ts
  modified:
    - workers/theme-sync/package.json
    - workers/theme-sync/tests/helpers/supabase-mock.ts
    - pnpm-lock.yaml

key-decisions:
  - "backoff 상태를 api_usage 테이블 재사용(service=theme_*_backoff, count=backoff-until epoch ms)으로 저장 — 신규 마이그레이션 회피(RESEARCH §Don't Hand-Roll). DDL 변경은 Rule 4 였으나 기존 (service,usage_date,count) PK 로 충분."
  - "콘텐츠 해시는 sha256 hex 전체를 count(bigint)에 못 담아 hex 앞 13자리(52bit) 정수 다이제스트로 축약 저장/비교 — 변경 감지용(보안 아님)이라 충돌 무시 가능."
  - "isBackedOff/shouldSkipWrite/getPreviousHash 는 .order().limit() 종결로 배열을 받아 JS max/비교 — createMockSupabase 가 .limit() 만 종결 지원 + backoff 가 KST 날짜 경계를 넘을 수 있어 특정 usage_date 한정 조회 회피."
  - "zod 를 theme-sync 의존성에 추가(^4 — discussion-sync 와 동일) — 알파스퀘어 JSON 응답 검증(Pitfall 10)에 필요. Rule 3 blocking."
  - "fetchWithFallback 이 차단 판정 status = 403/429/undefined(네트워크/타임아웃) — 네이버 차단의 흔한 증상까지 폴백. 500 등은 폴백 없이 throw."
  - "AI 보강(discoverThemes/correctMembership)은 OUT OF SCOPE(Plan 06) — index.ts merge 후 upsert 전에 주석 자리만. config 에 classify* 자리 확보(classifyEnabled default false)."

patterns-established:
  - "2-tier 스크랩: EUC-KR(네이버 cheerio) + UTF-8 JSON(알파 zod) 소스별 encoding 분기 + 공통 fetchWithFallback"
  - "5원칙 코드 반영: 일1회 캡(incrementUsage) + 24h 해시(shouldSkipWrite) + 서버측 배치만(cycle) + 429/403 24h backoff(markBackoff, 자동재시도 금지) + 출처표기·부분캐싱(alphaCategories 화이트리스트 + source 태그)"
  - "mergeThemes: norm_key group, 네이버 우선 name/source/reason, sources·code 합집합 (정확 일치만 병합)"

requirements-completed: [THEME-01]

# Metrics
duration: ~16min
completed: 2026-06-09
---

# Phase 10 Plan 03: Scrape Pipeline Summary

**theme-sync 워커의 2-tier 스크랩 파이프라인 구현 — 네이버 금융 테마(EUC-KR cheerio) + 알파스퀘어(공개 JSON API zod) 직접 fetch → 403/429 Bright Data 프록시 폴백 → 보수적 norm_key 병합 → themes/theme_stocks service_role UPSERT(FK skip + 청크 + effective_to 이력) → SHA256 변경 감지 + 24h backoff. 한국 크롤링 운영 5원칙을 코드 레벨로 구조 반영. AI 보강은 Plan 06 자리만.**

## Performance

- **Duration:** 약 16분
- **Tasks:** 3 (Task 1/2 TDD, Task 3 cycle 결선)
- **Tests:** 38 passed (scrape 15 + merge 9 + pipeline 14)
- **Files:** 18 신규 + 3 수정(package.json/supabase-mock/pnpm-lock)

## Accomplishments

- **네이버 EUC-KR cheerio 파서 (실측 fixture 검증):** `parseThemeList`(table.type_1.theme → {no,name} dedupe, HBM no=536 확인) + `parseThemeDetail`(table.type_5 → {code,name,reason} 6자리 정규식, 테크윙 089030 편입사유 확인). `fetchNaverThemes` 가 목록 페이지네이션(직전 theme-ID 집합 동일 시 stop, Pitfall 6) + 상세 fetch 결선.
- **알파스퀘어 공개 JSON API (zod):** `fetchAlphaThemes` 가 `/theme/v2/all-themes` + `/theme/v2/themes/{id}/stocks`(bare array)를 zod 검증, `alphaCategories` 화이트리스트(정치/트렌드)만 수집(부분 캐싱 5원칙 #5), KR+is_alive+6자리 code 필터. 비정상 응답 시 ThemeScrapeValidationError(Pitfall 10).
- **직접→프록시 폴백 (D-07):** `fetchWithFallback` 이 직접 axios → 403/429/undefined-status 시 `fetchViaProxy`(Bright Data Web Unlocker, discussion-sync 선례 복제) 1회 폴백. EUC-KR 은 arraybuffer + iconv.decode(Pitfall 2), 한글 mojibake 0 검증.
- **보수적 병합 (D-10):** `normalizeName`(NFKC+소문자+공백/특수문자 제거, 괄호 보존) + `mergeThemes`(norm_key group, 네이버 우선, sources·code 합집합). 'AI챗봇'/'ai 챗봇' 동일 norm_key, 'HBM(고대역폭메모리)'/'HBM' 분리 유지(오병합 회피).
- **service_role UPSERT (D-03):** `upsertThemes` 가 stocks `.in()` 청크(200) FK 존재확인 → 미존재 code per-stock skip(Pitfall 5), themes norm_key INSERT/UPDATE, theme_stocks 청크(500) UPSERT, 이번 cycle 에서 빠진 active 종목 effective_to=now soft-제외(편입/제외 이력), MIN_EXPECTED 가드(Pitfall 10).
- **변경 감지 + backoff (5원칙 #2/#4):** `contentHash`(결정적 SHA256, 순서 무관 → 52bit 정수 다이제스트 api_usage 저장) 동일 시 write skip. `scrapeState`(api_usage 재사용 24h backoff, 자동 지수 재시도 금지).
- **cycle 결선:** `runThemeSyncCycle` 이 소스별 isBackedOff 게이트 → fetch(withRetry+폴백) → 차단 catch markBackoff → contentHash skip → mergeThemes → upsertThemes → storeHash → incrementUsage(일1회 캡). main() CLI 진입점.

## Task Commits

각 태스크 원자적 커밋 (Korean, no Co-Authored-By):

1. **Task 1: fetch 레이어 (네이버 cheerio + 알파 JSON + 직접→프록시 폴백 + 24h backoff)** - `e0e573e` (feat)
2. **Task 2: 병합 + UPSERT + 콘텐츠 해시 파이프라인** - `3b08dce` (feat)
3. **Task 3: cycle 결선 index.ts (스크랩→병합→upsert, 5원칙 가드)** - `a84fd68` (feat)

**Plan metadata:** (아래 final commit)

## Decisions Made

- **backoff = api_usage 재사용 (신규 마이그레이션 회피):** `service='theme_naver_backoff'`/`'theme_alpha_backoff'`, `count`(bigint)=backoff-until epoch ms. 기존 (service,usage_date,count) PK + service_role bypass 로 충분 → RESEARCH §Don't Hand-Roll 의 "api_usage 재사용" 채택. DDL 추가는 Rule 4(architectural) 였으나 컬럼 추가 없이 해결.
- **콘텐츠 해시 52bit 정수 다이제스트:** sha256 hex(64자)를 count(bigint)에 직접 못 담아 hex 앞 13자리(52bit)를 정수로 축약 저장/비교. 변경 감지용(보안 아님)이라 충돌 확률 무시 가능. `computeContentHash` 는 전체 hex 반환(로그용), 저장/비교만 정수.
- **`.order().limit()` 배열 종결:** `isBackedOff`/`shouldSkipWrite` 가 단일 row 가 아닌 `.limit(N)` 배열을 받아 JS 에서 max/비교 — (1) createMockSupabase 가 `.limit()` 만 종결 지원(`.limit().maybeSingle()` 미지원), (2) backoff 가 KST 날짜 경계를 넘어 기록될 수 있어 특정 usage_date 한정 조회는 위험.
- **차단 status 판정 = 403/429/undefined:** undefined(네트워크/타임아웃)도 네이버 차단의 흔한 증상이라 폴백 트리거에 포함. 500 등 서버 에러는 폴백 없이 throw(withRetry 가 처리).
- **AI 보강 자리만(Plan 06):** index.ts merge 후 upsert 전에 주석 placeholder. config 에 `anthropicApiKey`(옵셔널, default '')/`classifyEnabled`(default false)/`classifyConcurrency`/`classifyModel` 자리 확보 — Plan 06 이 활성화.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] zod 를 theme-sync 의존성에 추가**
- **Found during:** Task 1 (fetchAlphaThemes)
- **Issue:** 플랜 인터페이스가 "JSON 응답 zod 검증"(Pitfall 10)을 명시하나 zod 가 theme-sync package.json 에 없음(discussion-sync 의 per-workspace dep). 검증 코드가 컴파일 불가.
- **Fix:** `zod@^4.0.0`(discussion-sync 와 동일, 설치 시 ^4.3.6 해석) 을 theme-sync dependencies 에 추가 + `pnpm -F @gh-radar/theme-sync add zod`.
- **Files modified:** workers/theme-sync/package.json, pnpm-lock.yaml
- **Verification:** fetchAlphaThemes zod 검증 테스트(비정상 JSON → ThemeScrapeValidationError) green, typecheck/build exit 0
- **Committed in:** `e0e573e` (Task 1)

**2. [Rule 3 - Blocking] createMockSupabase.insert 를 chain 반환으로 보강 (.select().single() 체이닝 지원)**
- **Found during:** Task 2 (upsertThemes 테스트)
- **Issue:** Plan 01 의 mock 은 `insert` 를 terminal(Promise resolve)로 구현 → `upsertThemes` 의 실제 Supabase 패턴 `.insert({...}).select('id').single()` 가 "insert(...).select is not a function" 으로 실패. mock 이 현실 패턴을 표현 못 함.
- **Fix:** mock 의 `insert` 를 row 기록 후 `this`(chain) 반환으로 변경 — `.select().single()` 체이닝 지원. 종결 `.single()` 값은 테스트가 주입. theme-sync 테스트 중 bare `await .insert()` 사용처 없음 확인(회귀 0).
- **Files modified:** workers/theme-sync/tests/helpers/supabase-mock.ts
- **Verification:** upsertThemes FK-skip 테스트 green, 기존 Plan 01 mock 사용처(scrape.test backoff) 회귀 0
- **Committed in:** `3b08dce` (Task 2)

**3. [Rule 1 - Bug] index.ts JSDoc 블록 주석 내 `*/` 조기 종결 수정**
- **Found during:** Task 3 (cycle 결선)
- **Issue:** `/** ... 차단(Proxy*/NaverRateLimit) ... */` 블록 주석 안의 `*/` 가 주석을 조기 종결 → esbuild transform + tsc 구문 에러("Expected ';' but found ')'").
- **Fix:** `Proxy*/NaverRateLimit` → `Proxy 계열 / NaverRateLimit` 로 변경(슬래시 분리). 라인 주석(`//`) 내 `*/` 와 문자열 리터럴(`text/plain,*/*`) 은 안전 확인.
- **Files modified:** workers/theme-sync/src/index.ts
- **Verification:** 전체 src `*/` 스캔(블록 주석만 위험) — 나머지는 line-comment/string-literal 안전. test/typecheck/build exit 0
- **Committed in:** `a84fd68` (Task 3)

---

**Total deviations:** 3 auto-fixed (2 blocking 의존성/mock, 1 주석 구문 버그)
**Impact on plan:** 모두 정합·컴파일에 필수, scope creep 없음. 모든 acceptance-criteria 그대로 충족.

## Threat Surface

플랜 `<threat_model>` 의 T-10-03-01~05 surface 만 도입(신규 surface 없음). 모두 설계대로 mitigate:
- T-10-03-01 (XSS/Tampering): zod 검증 + 6자리 code 정규식 필터(parseThemeDetail/fetchAlphaThemes)
- T-10-03-02 (시크릿 노출): logger redact(brightdata/anthropic/supabase) + proxy client status/byte length 만 로그
- T-10-03-03 (DoS/법적): 5원칙 코드 반영 (일1회 incrementUsage + 24h backoff markBackoff 자동재시도 금지 + 콘텐츠 해시 + 부분캐싱 alphaCategories)
- T-10-03-04 (SSRF): targetUrl 고정 도메인(네이버/알파)만 — 사용자 입력 url 없음
- T-10-03-05 (FK batch 실패): stocks `.in()` 존재확인 후 per-stock skip

## Issues Encountered

- **service-aware mock responder (cycle smoke):** cycle 이 `isBackedOff`(service=theme_*_backoff)와 `shouldSkipWrite`(service=theme_content_hash)를 둘 다 `api_usage.limit` 종결로 호출 → mock 이 `.eq()` 인자를 무시해 구분 불가. 해결: 테스트가 `chain.eq.mock.calls` 의 최근 `service` 필터를 읽어 service 별 응답 분기(`setApiUsageResponder`). 단일 스레드 호출 순서(eq→limit) 보장으로 정확 동작.
- **withRetry 지연:** NaverRateLimitError 차단 테스트가 withRetry 3회(200/400ms backoff)로 ~608ms — 정상(차단→재시도→backoff 검증). 실 운영도 동일 보수적 재시도.

## User Setup Required

None - 본 plan 은 fixture/mock 단위 테스트만(실 외부 스크랩 호출 없음, production 미실행). 실 시크릿(BRIGHTDATA/ANTHROPIC/SUPABASE)·Cloud Run 배포는 Plan 08.

## Next Phase Readiness

- **Plan 06 (AI 보강) 준비:** index.ts merge 후 upsert 전 AI 자리(주석) + config classify* 자리 확보. `@anthropic-ai/sdk`(Plan 01 설치) + mergeThemes 출력(source='ai' 추가 가능) 토대.
- **Plan 08 (배포) 준비:** runThemeSyncCycle + main() CLI 진입점 → master-sync deploy 템플릿(Cloud Run Job + Scheduler OAuth invoker, 16:00 KST) 복제로 배포 가능. 시크릿 3종(supabase/brightdata/anthropic) 재사용.
- **Concern:** 실 production IP 차단 여부(Phase 8 교훈)는 첫 배포 cycle 에서 검증 — 직접 fetch 통과 못해도 프록시 폴백으로 동작, 둘 다 차단 시 24h backoff. 외부 소스 구조 변경(RESEARCH valid_until 2026-07-09) 시 fixture 재캡처 필요.

## Self-Check: PASSED

- 18 신규 파일 + SUMMARY.md 전부 존재 확인 (FOUND × 18)
- 커밋 e0e573e(Task 1) / 3b08dce(Task 2) / a84fd68(Task 3) 전부 git log 확인
- 38/38 테스트 green + typecheck exit 0 + build exit 0 + shared build exit 0

---
*Phase: 10-theme-classification*
*Completed: 2026-06-09*
