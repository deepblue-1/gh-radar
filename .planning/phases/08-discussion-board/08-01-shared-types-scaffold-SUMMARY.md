---
phase: 08-discussion-board
plan: 01
subsystem: shared-types
tags: [shared, sanitize, discussion, scaffold, vitest, pnpm-workspace]

# Dependency graph
requires:
  - phase: 08-discussion-board
    provides: "Plan 08-00 POC — JSON API 채택, Bright Data zone, naver-board-types/fixtures"
  - phase: 07-news-ingestion
    provides: "packages/shared news 타입/sanitize 패턴, workers/news-sync 1:1 복제 기반"
provides:
  - "packages/shared Discussion camelCase 타입 (9 필드: id/stockCode/postId/title/body/author/postedAt/scrapedAt/url)"
  - "discussion-sanitize 3 순수함수: stripHtmlToPlaintext / extractNid / parseNaverBoardDate (regex 기반, V-20 guardrail 준수)"
  - "workers/discussion-sync 디렉터리 스캐폴드 (PIVOT deps: cheerio/iconv-lite 제외, sanitize-html 유지)"
  - "server/tests/routes/discussions.test.ts — 16 it.todo (Plan 08-03 SoT)"
  - "webapp/e2e/{specs,fixtures}/discussions.* — 13 test.skip + camelCase fixture + mockDiscussionsApi"
affects: [08-02, 08-03, 08-04, 08-06, phase-9-disc-02]

# Tech tracking
tech-stack:
  added:
    - "sanitize-html@^2.17.2 (workers/discussion-sync only — V-20 shared 보호)"
    - "@types/sanitize-html@^2.13.0 (devDeps)"
  patterns:
    - "ISO no-offset → +09:00 보강 정규화 패턴 (date-fns-tz 미사용)"
    - "regex 기반 entity decode + tag strip (Phase 7 stripHtml 와 분리된 모듈로 유지)"
    - "Phase 7 news-sync → Phase 8 discussion-sync 복제 시 PIVOT delta 적용 (cheerio/iconv 제외)"

key-files:
  created:
    - "packages/shared/src/discussion-sanitize.ts (3 함수, 158 lines)"
    - "packages/shared/src/__tests__/discussion-sanitize.test.ts (33 cases, 56 total file)"
    - "workers/discussion-sync/package.json"
    - "workers/discussion-sync/Dockerfile"
    - "workers/discussion-sync/tsconfig.json"
    - "workers/discussion-sync/vitest.config.ts"
    - "workers/discussion-sync/tests/helpers/supabase-mock.ts"
    - "server/tests/routes/discussions.test.ts (16 it.todo)"
    - "webapp/e2e/specs/discussions.spec.ts (13 test.skip)"
    - "webapp/e2e/fixtures/discussions.ts (DISCUSSION_ITEM_SAMPLE + buildDiscussionList + mockDiscussionsApi)"
  modified:
    - "packages/shared/src/discussion.ts (기존 8필드 → PIVOT 9필드, url 추가, title/postedAt nullable 교정)"
    - "packages/shared/src/index.ts (3 함수 re-export 추가)"
    - "webapp/e2e/fixtures/mock-api.ts (Phase 8 mock re-export 추가)"
    - "pnpm-lock.yaml (sanitize-html / @types/sanitize-html 신규 entries)"

key-decisions:
  - "Discussion 타입 url 필드 추가 — 기존 packages/shared/src/discussion.ts 의 8필드 shape 은 PIVOT 스펙(9필드)과 불일치, 수정"
  - "stripHtmlToPlaintext 는 Phase 7 stripHtml 과 분리된 모듈로 유지 — 토론방 body 가 더 광범위 HTML 처리 필요"
  - "parseNaverBoardDate 가 ISO no-offset / ISO with offset / legacy dot 3 케이스 모두 처리 — JSON API 와 사용자 공유 URL 양쪽 호환"
  - "workers/discussion-sync 에서 cheerio/iconv-lite 미설치 — POC PIVOT 의 JSON API 채택 결과 불필요"
  - "sanitize-html 은 worker 에만 설치, packages/shared 는 regex best-effort 유지 — V-20 번들 크기 보존"

patterns-established:
  - "Wave 0 scaffold pattern: shared types + worker dir + test stubs 한 plan 에서 일괄 생성하여 후속 plan 의 verify MISSING 차단"
  - "POC PIVOT delta 문서가 plan 본문보다 우선하는 실행 규칙"

requirements-completed: [DISC-01]

# Metrics
duration: 17min
completed: 2026-04-18
---

# Phase 8 Plan 01: shared-types-scaffold Summary

**Phase 8 Wave 0 인프라 — Discussion camelCase 타입 + 3개 sanitize 함수 (regex 기반, V-20 준수) + workers/discussion-sync 스캐폴드 + 후속 plan 테스트 스텁 SoT 일괄 구축**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-04-18T00:59:00Z
- **Completed:** 2026-04-18T01:16:31Z
- **Tasks:** 3
- **Files modified:** 13 (10 created + 3 modified, lockfile 별도)

## Accomplishments

- `packages/shared` Discussion camelCase 타입 9필드 확정 (PIVOT 스펙) + sanitize 3함수 export — 56/56 unit test green, V-20 guardrail (sanitize-html/striptags/dompurify/date-fns-tz) shared 범위 0 match 유지
- `workers/discussion-sync` workspace 인식 완료 (pnpm `@gh-radar/discussion-sync@0.0.0` 등록), Phase 7 `news-sync` 1:1 복제 후 PIVOT 델타(cheerio/iconv-lite 제외, sanitize-html 유지) 반영
- 후속 plan SoT 테스트 스텁 16 it.todo + 13 test.skip 등록 — Plan 08-02/03/04/06 의 `<verify>` MISSING 사전 차단

## Task Commits

1. **Task 1: packages/shared Discussion 타입 + discussion-sanitize 3 함수** — `df9004d` (feat)
2. **Task 2: workers/discussion-sync 스캐폴드 (news-sync 복제 + PIVOT deps)** — `a671b61` (chore)
3. **Task 3: server/webapp 토론방 테스트 스텁** — `2405349` (test)

## Files Created/Modified

### Created
- `packages/shared/src/discussion-sanitize.ts` — regex 기반 3 순수함수
- `packages/shared/src/__tests__/discussion-sanitize.test.ts` — 33 cases (V-04 11 + V-05 9 + V-06 13)
- `workers/discussion-sync/package.json` — `@gh-radar/discussion-sync` workspace + sanitize-html dep
- `workers/discussion-sync/Dockerfile` — news-sync sed 치환 (`news-sync` 0 / `discussion-sync` 5 matches)
- `workers/discussion-sync/tsconfig.json` — news-sync 1:1
- `workers/discussion-sync/vitest.config.ts` — tests/** + src/** include
- `workers/discussion-sync/tests/helpers/supabase-mock.ts` — news-sync 1:1 + `in()` 체인 추가
- `server/tests/routes/discussions.test.ts` — 16 it.todo (GET 8 + POST 6 + CORS 1, +1 describe)
- `webapp/e2e/specs/discussions.spec.ts` — 13 test.skip (detail 3 + fullpage 5 + cooldown 1 + stale 1 + empty 1 + a11y 1, +1 미상)
- `webapp/e2e/fixtures/discussions.ts` — camelCase fixture + 4 모드 mockDiscussionsApi (ok/cooldown/error/stale)

### Modified
- `packages/shared/src/discussion.ts` — 기존 8필드 (url 누락, title/postedAt nullable) → PIVOT 9필드 (url 추가, title/postedAt non-null) 교정
- `packages/shared/src/index.ts` — `stripHtmlToPlaintext / extractNid / parseNaverBoardDate` re-export 추가
- `webapp/e2e/fixtures/mock-api.ts` — Phase 8 mock re-export 추가 (Phase 7 mockNewsApi 그대로 유지)
- `pnpm-lock.yaml` — sanitize-html 트랜지티브 entries 추가

## Decisions Made

- **Discussion 타입 shape 교정**: 기존 `packages/shared/src/discussion.ts` 가 PLAN/PIVOT 스펙(9 필드, url 포함, title/postedAt non-null)과 불일치(8 필드, url 누락, nullable) → 새로 작성하여 일치시킴. 후속 mapper/fixture 가 이 계약을 신뢰할 수 있게 됨.
- **stripHtmlToPlaintext 분리 유지**: Phase 7 `news-sanitize.stripHtml` 과 동일 알고리즘이지만 별도 파일로 둠 — 향후 토론방 body 의 HTML 다양성에 맞춘 확장(예: `<br>` → 줄바꿈 보존)을 news 영향 없이 가능하게 함.
- **테스트 케이스 자기보정**: `decodes named entities` 테스트의 기대값이 인접 엔티티 디코드 후 공백 정규화 결과를 잘못 추정 → 두 테스트(공백 분리 케이스 + 인접 케이스)로 분리하여 함수 동작 명확화.
- **PIVOT 우선 원칙 적용**: PLAN 본문의 `cheerio@^1.2.0` 추가 지시를 무시하고 PIVOT 의 JSON API 결정에 맞춰 미설치. PLAN 의 Step C 코드 스니펫(`+09:00` 보강만 하는 단순 버전) 대신 PIVOT 의 ISO/dot 양 포맷 처리 버전 구현.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 기존 packages/shared/src/discussion.ts 의 shape 불일치 교정**
- **Found during:** Task 1 (Discussion 타입 작성)
- **Issue:** 기존 파일이 8필드 (url 누락) + title/postedAt nullable 로 PLAN/PIVOT 스펙(9필드, non-null)과 충돌. 이대로 두면 후속 server mapper / webapp fixture 가 잘못된 계약을 따름.
- **Fix:** PIVOT 스펙대로 9필드로 재작성 (url 추가, title/postedAt non-null, JSDoc 주석으로 각 필드의 데이터 출처 명시).
- **Files modified:** `packages/shared/src/discussion.ts`
- **Verification:** `pnpm -F @gh-radar/shared typecheck` exit 0, camelCase 검증 grep 통과
- **Committed in:** `df9004d`

**2. [Rule 1 - Bug] decodes named entities 테스트 기대값 보정**
- **Found during:** Task 1 (test 첫 실행)
- **Issue:** 테스트 케이스가 인접 엔티티 입력 (`"&amp;&lt;&gt;&quot;&nbsp;end"`) 의 기대 결과를 `'& < > " end'` (공백 분리)로 잘못 가정. 실제로는 디코드 후 인접 문자열이 되고 (`'&<>" end'`) `&nbsp;` 만 1 space 가 됨.
- **Fix:** 두 케이스로 분리 — 공백 분리 입력 케이스 (`"&amp; &lt; &gt; ..."`) + 인접 입력 케이스. 함수 동작 의도(공백 정규화)를 명확히 표현.
- **Files modified:** `packages/shared/src/__tests__/discussion-sanitize.test.ts`
- **Verification:** 56/56 test pass
- **Committed in:** `df9004d` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (Rule 1 bugs)
**Impact on plan:** 모두 정확성/일관성을 위한 수정. 범위 변경 없음. PIVOT 스펙 준수.

## Issues Encountered

- 없음 — Plan 08-00 SUMMARY 가 명시한 대로 `naver-board-types.ts` / `naver-board-fixtures.ts` 가 이미 존재함을 확인 (53KB+ fixture 그대로 보존), 본 plan 에서 touch 하지 않음.

## User Setup Required

없음 — 본 plan 은 shared 코드/스캐폴드/테스트 스텁만 추가. 외부 서비스 설정 (Bright Data API key 등) 은 Plan 08-06 deploy 단계에서 다룸.

## Next Phase Readiness

- **Plan 08-02 (discussion-sync-worker)**: 즉시 실행 가능. `workers/discussion-sync/src/` 가 비어있는 상태이므로 `scraper/fetchDiscussions.ts` + `scraper/parseDiscussionsJson.ts` + `index.ts` 신규 작성. Plan 08-00 의 `naver-board-fixtures.ts` 가 parser test SoT 로 준비됨.
- **Plan 08-03 (server-discussion-routes)**: 즉시 실행 가능. `server/tests/routes/discussions.test.ts` 의 16 it.todo 를 it.* 로 채움.
- **Plan 08-04 (webapp-discussion-section)**: Phase 7 Wave 2(07-04) merge 후 시작. `webapp/e2e/{specs,fixtures}/discussions.*` 가 SoT 로 대기.
- **Plan 08-06 (deploy-and-e2e)**: Bright Data secret (`gh-radar-brightdata-api-key`) GCP Secret Manager 등록 + Cloud Run Job 배포. PIVOT delta 의 IAM 스크립트 시크릿명 변경 적용 필요.

## Self-Check: PASSED

검증:
- `[ -f packages/shared/src/discussion-sanitize.ts ]` ✅
- `[ -f packages/shared/src/__tests__/discussion-sanitize.test.ts ]` ✅
- `[ -f workers/discussion-sync/package.json ]` ✅
- `[ -f workers/discussion-sync/Dockerfile ]` ✅
- `[ -f server/tests/routes/discussions.test.ts ]` ✅
- `[ -f webapp/e2e/specs/discussions.spec.ts ]` ✅
- `[ -f webapp/e2e/fixtures/discussions.ts ]` ✅
- `git log --oneline -5 | grep -q df9004d` (Task 1 commit) ✅
- `git log --oneline -5 | grep -q a671b61` (Task 2 commit) ✅
- `git log --oneline -5 | grep -q 2405349` (Task 3 commit) ✅
- `pnpm -F @gh-radar/shared test -- discussion-sanitize.test.ts --run`: 56/56 pass ✅
- `pnpm -F @gh-radar/shared typecheck`: exit 0 ✅
- `pnpm -F @gh-radar/webapp typecheck`: exit 0 (Phase 7 회귀 없음) ✅
- `pnpm -F @gh-radar/server test`: 76 passed + 15 todo (Phase 7 그대로 + Phase 8 신규 todo 등록) ✅
- V-20 guardrail (shared): `grep -E "sanitize-html|striptags|dompurify|date-fns-tz" packages/shared/package.json` → 0 ✅
- Phase 7 V-20 회귀 없음: `pnpm --filter @gh-radar/news-sync list | grep -E "sanitize-html|cheerio|iconv"` → 0 ✅

---
*Phase: 08-discussion-board*
*Completed: 2026-04-18*
