---
phase: 08-discussion-board
plan: 02
subsystem: workers
tags: [discussion-sync, brightdata, naver-json-api, zod, sanitize-html, supabase, p-limit, cloud-run-job, pino, vitest]

# Dependency graph
requires:
  - phase: 08-discussion-board
    provides: "Plan 08-01 shared discussion 타입 + sanitize 3함수 + worker 스캐폴드 + JSON API fixture (08-00 POC)"
  - phase: 07-news-ingestion
    provides: "news-sync pipeline 구조 (config/logger/retry/supabase/targets/upsert/apiUsage/retention) + api_usage RPC"
provides:
  - "workers/discussion-sync Cloud Run Job image 준비 — Bright Data Web Unlocker 경유 stock.naver.com JSON API 로 토론방 수집"
  - "fetchDiscussions: POST https://api.brightdata.com/request (zone=gh_radar_naver, country=kr, format=raw) + zod schema 검증"
  - "parseDiscussionsJson: replyDepth=0 + postType=normal + isCleanbotPassed=true 필터 → ParsedDiscussion[]"
  - "apiUsage: service='proxy_naver_discussion' (Phase 7 api_usage 공유) + atomic RPC 예산 체크"
  - "retention: 90일 scraped_at 기준 DELETE (discussions 스키마에 created_at 없음)"
  - "pipeline/collectDiscussions: per-stock 1 request (옵션 5 — body 포함, body fetch loop 불필요)"
  - "index.ts: p-limit(8) + per-stock try/catch + ProxyAuth/Budget → stopAll + retention hook"
affects: [08-03, 08-06, phase-9-disc-02]

# Tech tracking
tech-stack:
  added:
    - "zod@^4.0.0 (Naver JSON API 응답 schema 검증)"
  patterns:
    - "Bright Data Web Unlocker POST JSON body { zone, url, format:'raw', country:'kr' } 패턴"
    - "옵션 5 (JSON API) — per-stock 단일 호출 + contentSwReplacedButImg plaintext 직접 사용"
    - "D11 스팸 필터 2단계: worker 는 API 의 isCleanbotPassed=false drop, server 쿼리는 제목 <5자 OR URL 필터"
    - "UPSERT DO UPDATE SET scraped_at (ignoreDuplicates=false) — TTL 정확도 + body 백필"
    - "Phase 7 news-sync cycle 구조 복제 + fetcher 교체 패턴"

key-files:
  created:
    - "workers/discussion-sync/src/config.ts (BRIGHTDATA_* env + naverDiscussionApiBase)"
    - "workers/discussion-sync/src/logger.ts (T-03 redact: brightdataApiKey/supabaseServiceRoleKey)"
    - "workers/discussion-sync/src/retry.ts (news-sync 1:1 복제)"
    - "workers/discussion-sync/src/services/supabase.ts (service_role)"
    - "workers/discussion-sync/src/proxy/errors.ts (ProxyAuthError/BudgetExhausted/BadRequest/Blocked + NaverRateLimit + NaverApiValidation)"
    - "workers/discussion-sync/src/proxy/client.ts (Bright Data POST JSON + 401/402/400/403/429/503/504 맵핑)"
    - "workers/discussion-sync/src/scraper/types.ts (NaverDiscussionApiResponse — src 공식 타입)"
    - "workers/discussion-sync/src/scraper/fetchDiscussions.ts (JSON API + zod + 207B fieldErrors 가드)"
    - "workers/discussion-sync/src/scraper/parseDiscussionsJson.ts (replyDepth/postType/cleanbot 필터 + sanitize-html plaintext)"
    - "workers/discussion-sync/src/pipeline/targets.ts (top_movers ∪ watchlists + stocks FK)"
    - "workers/discussion-sync/src/pipeline/map.ts (ALLOWED_HOSTS T-07 화이트리스트)"
    - "workers/discussion-sync/src/pipeline/upsert.ts (ON CONFLICT DO UPDATE)"
    - "workers/discussion-sync/src/pipeline/collectDiscussions.ts (fetch + parse + 24h cutoff + map)"
    - "workers/discussion-sync/src/apiUsage.ts (service='proxy_naver_discussion')"
    - "workers/discussion-sync/src/retention.ts (90일 scraped_at DELETE)"
    - "workers/discussion-sync/src/index.ts (cycle entry)"
    - "workers/discussion-sync/tests/logger.test.ts (5 cases — T-03 redact)"
    - "workers/discussion-sync/tests/proxy/client.test.ts (10 cases — HTTPS 강제 + status 맵핑)"
    - "workers/discussion-sync/tests/scraper/fetchDiscussions.test.ts (6 cases — 필수 param + zod + fieldErrors)"
    - "workers/discussion-sync/tests/scraper/parseDiscussionsJson.test.ts (9 cases — fixture + 필터 + edge)"
    - "workers/discussion-sync/tests/pipeline/map.test.ts (10 cases — T-07 + D11 미적용 + null body/author)"
    - "workers/discussion-sync/tests/pipeline/upsert.test.ts (4 cases — onConflict + ignoreDuplicates=false)"
    - "workers/discussion-sync/tests/pipeline/targets.test.ts (3 cases — 합집합 + FK + dedupe)"
    - "workers/discussion-sync/tests/apiUsage.test.ts (7 cases — proxy_naver_discussion label + KST)"
    - "workers/discussion-sync/tests/retention.test.ts (4 cases — scraped_at 기준 DELETE)"
    - "workers/discussion-sync/tests/pipeline.test.ts (smoke — fixture → row 4 cases, 3 todo)"
  modified:
    - "workers/discussion-sync/package.json (zod@^4.0.0 dependency 추가)"
    - "pnpm-lock.yaml (zod entries)"

key-decisions:
  - "PIVOT 우선 적용 — fetchBoard/parseBoardHtml/fetchPostBody 가 아니라 fetchDiscussions/parseDiscussionsJson 단일 경로. cheerio/iconv-lite 미설치, JSON.parse + zod schema 사용"
  - "Naver API response 필드 필수 3종 (isHolderOnly/excludesItemNews/isItemNewsOnly) 를 fetcher URL builder 가 항상 명시. 207B fieldErrors 응답 감지 시 NaverApiValidationError throw"
  - "scraper/types.ts 를 src 쪽에 공식 타입으로 둠 — tests/helpers/naver-board-types.ts 는 fixture 용 (src 가 tests 에서 import 하면 tsc rootDir 위반)"
  - "D11 스팸 필터 이중화: worker 는 API 의 isCleanbotPassed=false drop (저장 자체 skip). CONTEXT D11 의 제목 <5자 / URL 포함 필터는 server query 단계에 위임 (원본 보존)"
  - "UPSERT 전략: ignoreDuplicates=false (DO UPDATE) — 같은 post_id 재수집 시 scraped_at 갱신 + body backfill 허용. TTL 계산 정확도 우선"
  - "retention scraped_at 기준 — discussions 스키마에 created_at 컬럼 없음 (20260413120000_init_tables.sql:58-71)"
  - "옵션 5 채택 결과 per-stock request = 1 (body 포함). index.ts 의 expected budget = targets × 1, fetchPostBody loop 제거"

patterns-established:
  - "Bright Data Web Unlocker proxy POST JSON + 'raw' format 경유 — weekly-wine-bot 와 동일 아키텍처, zone 분리로 서비스 격리"
  - "Naver API 필수 파라미터 강제 (URL builder defaults + zod runtime 검증) — 207B fieldErrors 응답 예방"
  - "tests/helpers naver-board-fixtures 가 POC 캡처를 fixture 로 유지 — parser/integration 테스트 SoT"

requirements-completed: [DISC-01]

# Metrics
duration: 13min
completed: 2026-04-18
---

# Phase 8 Plan 02: discussion-sync-worker Summary

**Bright Data Web Unlocker 경유 stock.naver.com discussion JSON API 수집 worker — cheerio/iconv-lite 없이 zod + sanitize-html 만으로 파이프라인 완성, 59 tests green**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-04-18T01:17:00Z
- **Completed:** 2026-04-18T01:30:20Z
- **Tasks:** 3 (원 plan 의 3 task 구조를 2 atomic commit 으로 압축 — 인프라 / 파이프라인+entry)
- **Files modified:** 28 (26 created + 2 modified)

## Accomplishments

- `workers/discussion-sync` Cloud Run Job image build-ready — `pnpm -F @gh-radar/discussion-sync build` 가 dist/index.js 생성
- Bright Data Web Unlocker POST JSON 계약 완성 (zone=`gh_radar_naver`, country=`kr`, format=`raw`) + 401/402/400/403/429/503/504 status 맵핑 + 보수적 재시도 1회
- Naver discussion JSON API fetcher: 필수 3 파라미터 (`isHolderOnly`, `excludesItemNews`, `isItemNewsOnly`) 항상 명시 + zod schema 검증 + 207B fieldErrors 가드
- parseDiscussionsJson 의 3 단계 필터 (replyDepth=0 / postType=normal / isCleanbotPassed=true) + sanitize-html `allowedTags:[]` plaintext 변환 + `stock.naver.com/domestic/stock/{code}/discussion/{id}?chip=all` URL 조립
- 59 unit+smoke tests green (10 spec 파일, 3 todo), `pnpm -F @gh-radar/discussion-sync typecheck` + `build` 모두 exit 0
- Phase 7 회귀 없음: news-sync 61 tests green, shared 56 tests green, V-20 guardrail 유지 (cheerio/iconv-lite 0 imports)

## Task Commits

1. **Task 1: 인프라 (config/logger/retry/supabase/proxy client + errors)** — `941116a` (feat)
   - 15 tests (logger 5 + proxy/client 10)
2. **Task 2+3: 파이프라인 + entry (fetch/parse/map/upsert/targets/collect/apiUsage/retention/index)** — `79e6e78` (feat)
   - 44 new tests (+ 15 from Task 1 = 59 total)

_Note: 원 plan 의 Task 3 (index + smoke) 는 Task 2 와 파일 경계가 자연스럽게 겹쳐서 단일 atomic commit 으로 결합. pipeline.test.ts smoke 포함._

## Files Created/Modified

### Created (26)
- `workers/discussion-sync/src/config.ts` — BRIGHTDATA_API_KEY/ZONE/URL + naverDiscussionApiBase + discussionSyncDailyBudget/Concurrency/PageSize
- `workers/discussion-sync/src/logger.ts` — pino redact 10개 path (T-03)
- `workers/discussion-sync/src/retry.ts` — news-sync 1:1 복제
- `workers/discussion-sync/src/services/supabase.ts` — service_role
- `workers/discussion-sync/src/proxy/errors.ts` — 6개 에러 클래스
- `workers/discussion-sync/src/proxy/client.ts` — Bright Data POST + HTTPS 강제 (T-09)
- `workers/discussion-sync/src/scraper/types.ts` — NaverDiscussionApiResponse 공식 타입 (src 측)
- `workers/discussion-sync/src/scraper/fetchDiscussions.ts` — URL builder + zod + fieldErrors 가드
- `workers/discussion-sync/src/scraper/parseDiscussionsJson.ts` — 3 단계 필터 + sanitize-html plaintext
- `workers/discussion-sync/src/pipeline/{targets,map,upsert,collectDiscussions}.ts` — 파이프라인 4종
- `workers/discussion-sync/src/{apiUsage,retention,index}.ts` — 예산/retention/CLI entry
- `workers/discussion-sync/tests/**/*.test.ts` — 10 spec 파일 (59 cases)

### Modified
- `workers/discussion-sync/package.json` — `zod@^4.0.0` 추가
- `pnpm-lock.yaml` — zod 트랜지티브 entries

## Decisions Made

- **D11 스팸 필터 이중화 — worker 는 isCleanbotPassed=false drop, 제목/URL 필터는 server query**: CONTEXT D11 "원본은 DB에 저장하되 UI 노출에서만 제외" 정책 충실. 단 cleanbot 신호는 네이버 API 가 직접 제공하므로 이를 저장 자체 skip 으로 취급 — DB 절약 + 2022 대법원 판결 대비 스팸 원본 저장 최소화.
- **파일 경로 공식 타입 src 쪽 배치**: plan 의 `import { NaverDiscussionApiResponse } from '../tests/helpers/naver-board-types.js'` 지침은 tsc `rootDir=./src` 위반. `workers/discussion-sync/src/scraper/types.ts` 를 src 쪽 공식 타입으로 재생성 (fixture 타입과 필드 부분집합 호환). 테스트에서는 `as unknown as NaverDiscussionApiResponse` 로 cross-cast.
- **task 3 과 task 2 병합**: 원 plan 의 Task 3 (index.ts + pipeline.test.ts) 는 Task 2 와 파일 경계가 자연스럽게 얽혀서 atomic commit 하나로 결합. 테스트/typecheck/build 모두 Task 2 완료 시 이미 통과.
- **옵션 5 채택 후 expected request per stock = 1**: index.ts 의 budget 예상은 `targets × 1`. 원 plan 의 `1 + topN` 공식은 옵션 2 (body fetch) 전제였음. PIVOT 반영.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] src 가 tests/helpers 의 타입을 import 하면 tsc rootDir 위반**
- **Found during:** Task 2 (fetchDiscussions.ts 작성)
- **Issue:** Plan 의 import 경로 `../../tests/helpers/naver-board-types.js` 는 tsconfig `rootDir=./src` 에서 금지. `tsc --noEmit` 이 "File is not under rootDir" 에러 발생 예상.
- **Fix:** `workers/discussion-sync/src/scraper/types.ts` 를 src 쪽 공식 타입으로 생성 (fixture 타입과 필드 부분집합). 테스트는 `as unknown as NaverDiscussionApiResponse` cross-cast.
- **Files modified:** `workers/discussion-sync/src/scraper/types.ts` (신규)
- **Verification:** `pnpm -F @gh-radar/discussion-sync typecheck` exit 0
- **Committed in:** `79e6e78` (Task 2 commit)

**2. [Rule 3 - Blocking] `@gh-radar/shared` dist 에 parseNaverBoardDate export 누락**
- **Found during:** Task 2 typecheck
- **Issue:** `packages/shared/dist/index.d.ts` 에 `parseNaverBoardDate` 가 없어서 import 실패. dist 가 오래된 빌드로 남아있었음 (Plan 08-01 이후 rebuild 누락).
- **Fix:** `pnpm -F @gh-radar/shared build` 로 dist 재생성 (tsup).
- **Files modified:** `packages/shared/dist/*` (빌드 산출물 — 리포에는 커밋 안 함)
- **Verification:** `grep -c parseNaverBoardDate dist/index.d.ts` 확인 후 typecheck 통과.
- **Committed in:** N/A (dist 는 build 산출물, gitignore 대상)

**3. [Rule 2 - Missing Critical] zod dependency 누락 (PIVOT 이 요구했으나 Plan 08-01 package.json 에 없음)**
- **Found during:** Task 2 fetchDiscussions.ts 작성
- **Issue:** PIVOT `#3` "JSON.parse + zod schema validation" 지시를 따르려면 zod 필요. 08-01 scaffold 가 설치하지 않음.
- **Fix:** `workers/discussion-sync/package.json` 에 `"zod": "^4.0.0"` 추가 후 `pnpm install`.
- **Files modified:** `workers/discussion-sync/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm -F @gh-radar/discussion-sync typecheck` exit 0 + fetchDiscussions.test.ts 의 schema mismatch 케이스 pass.
- **Committed in:** `941116a` (Task 1 commit — 인프라 커밋에 포함)

---

**Total deviations:** 3 auto-fixed (2 blocking dependency/import 이슈, 1 missing critical runtime validation lib)
**Impact on plan:** 모두 PIVOT 스펙 준수 + typecheck/build 통과를 위한 최소 조정. 범위 확장 0, PIVOT 의도 100% 반영.

## Issues Encountered

- **`.planning/ROADMAP.md` / `08-03~06-PLAN.md` 선행 modification**: 본 plan 실행 전 working tree 에 이미 존재하던 M 파일들. 본 plan 이 건드리지 않았으므로 원복/commit 모두 생략.

## Known Stubs

없음 — 본 plan 은 실제 동작하는 fetcher/parser/pipeline 을 제공. stub placeholder 없음.

## User Setup Required

없음 — 본 plan 은 코드/테스트만 추가. Bright Data API 키 + Secret Manager 설정은 Plan 08-06 (deploy-and-e2e) 에서 다룸.

## Next Phase Readiness

- **Plan 08-03 (server-discussion-routes)**: 즉시 실행 가능. server 의 on-demand 경로가 `@gh-radar/discussion-sync` 의 `fetchDiscussions` + `parseDiscussionsJson` 을 reuse 하거나 shared 로 일부 로직을 승격 가능. PIVOT delta §"Plan 08-03" 지침 반영 필요 (cheerio import 제거).
- **Plan 08-06 (deploy-and-e2e)**: Bright Data secret (`gh-radar-brightdata-api-key`) + `gh-radar-brightdata-zone=gh_radar_naver` + `BRIGHTDATA_URL=https://api.brightdata.com/request` Cloud Run Job env + Secret Manager 등록. IAM 스크립트의 secret 이름 치환 필요 (PIVOT delta 참조).
- **Plan 08-04 (webapp-discussion-section)**: Phase 7 Wave 2(07-04) merge 후 시작. Worker 가 produce 하는 row shape (camelCase Discussion) 은 Plan 08-01 에서 이미 shared 타입 확정.

## Self-Check: PASSED

검증 (모두 PASS):
- `[ -f workers/discussion-sync/src/index.ts ]` + 9 others ✓
- `[ -f workers/discussion-sync/tests/pipeline.test.ts ]` + 9 test specs ✓
- `git log --oneline -5 | grep -q 941116a` (Task 1 commit) ✓
- `git log --oneline -5 | grep -q 79e6e78` (Task 2+3 commit) ✓
- `pnpm -F @gh-radar/discussion-sync test`: **59 passed | 3 todo** ✓
- `pnpm -F @gh-radar/discussion-sync typecheck`: exit 0 ✓
- `pnpm -F @gh-radar/discussion-sync build`: exit 0 (dist/index.js 생성) ✓
- T-09 HTTPS enforcement: `grep "startsWith(\"https://\")" src/proxy/client.ts` ✓
- T-03 redact: `brightdataApiKey` in logger.ts ✓
- T-07 ALLOWED_HOSTS: stock.naver.com 화이트리스트 in pipeline/map.ts ✓
- T-08 UPSERT: `onConflict: "stock_code,post_id"` + `ignoreDuplicates: false` ✓
- apiUsage service label: `proxy_naver_discussion` ✓
- retention scraped_at 기준 DELETE (created_at 아님 — 주석만 created_at 언급) ✓
- 24h cutoff: `24 * 3600_000` in collectDiscussions.ts ✓
- index stopAll + Proxy Auth/Budget abort ✓
- V-20 guardrail 유지: `grep -rE "from ['\"]cheerio|from ['\"]iconv-lite" workers/{news,discussion}-sync/src packages/shared/src` → 0 matches ✓
- Phase 7 회귀 없음: news-sync 61 tests green, shared 56 tests green ✓

---
*Phase: 08-discussion-board*
*Completed: 2026-04-18*
