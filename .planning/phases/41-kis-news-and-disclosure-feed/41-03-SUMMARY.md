---
phase: 41-kis-news-and-disclosure-feed
plan: 03
subsystem: api · docs
tags: [express, express-rate-limit, cache, vitest, gh-trade-inbox, kis-news]

requires:
  - phase: 41-01
    provides: "GET /api/news/by-stock (computeNewsByStock · NewsByStockQuery) · 응답 예시 JSON"
provides:
  - "server NEWS_BY_STOCK_CACHE_TTL_MS(5_000) · getNewsByStock — (정렬 코드 | days | limit) 5초 캐시 · 진행 중 공유 · 실패 미캐시 · 응답은 요청 입력 순서"
  - "server newsByStockRateLimiter(opts?) — 기본 IP 당 분 600 · 같은 429 JSON · 라우트 체인에 모듈 범위 한 번"
  - "server apiRateLimitSkip(req) — 전역 /api 분 200 제한에서 /health… · /news/by-stock 을 뺀다"
  - "gh-trade 인박스 노트 ../gh-trade/docs/inbox/from-gh-radar/261112-kis-news-by-stock.md (status: open · 미커밋) + gh-radar 사본 41-GHTRADE-NOTE.md"
affects: [41-09, 41-10, gh-trade 돌파감지 창 · 상따창]

actuals:
  tokens: 6200
  tasks: 2
  commits: 3
plan_head_before: 4f55f5e1adcef51a9a58ec26b64944079fd3e2a3
plan_head_after: b0ac13850a457114fc6484686cea235f92828448

tech-stack:
  added: []
  patterns:
    - "캐시 값은 코드 집합 단위 스냅샷(byCode Map) — 응답 순서는 요청마다 입력 순서로 다시 조립(같은 집합 다른 순서도 RPC 1회)"
    - "특정 경로 전용 제한기 + 전역 제한기 skip 함수 export(테스트 가능한 경로 판정)"

key-files:
  created:
    - .planning/phases/41-kis-news-and-disclosure-feed/41-GHTRADE-NOTE.md
  modified:
    - server/src/routes/news-by-stock.ts
    - server/src/middleware/rate-limit.ts
    - server/tests/routes/news-by-stock.test.ts
    - server/tests/middleware/rate-limit.test.ts

key-decisions:
  - "RPC 결과에 없는 코드는 응답에서 생략(41-01 의 「RPC stocks 그대로」 동작 유지) — RPC 는 unnest 로 모든 코드를 주므로 실제로는 빠지지 않는다"
  - "rate-limit 의 keyGenerator · 429 handler 를 모듈 상수로 묶어 전역 · 전용 제한기가 같은 것을 쓴다"
  - "노트 실패 처리 목록에 429 도 넣었다(전용 제한기 응답) — 다음 주기에만 다시"
  - "목업의 「삭제 공시는 줄을 지웁니다」 는 계약에 없다고 노트에 명시(삭제 신호 필드 없음)"

requirements-completed: [SC-3, SC-4]

duration: 4min
completed: 2026-11-12
status: complete
---

# Phase 41 Plan 03: 묶음 조회 5초 캐시 · 전용 제한기 · gh-trade 계약 노트 Summary

**`/api/news/by-stock` 이 (정렬 코드 | days | limit) 5초 캐시(진행 중 공유 · 실패 미캐시 · 입력 순서 유지)와 IP 당 분 600 전용 제한기를 달고 전역 분 200 에서 빠졌고, 그 계약(호출 `days=3&limit=3` · 5초 · 분 600 · 첫 수집 10 ~ 15초)이 gh-trade 인박스 노트로 놓였다.**

## Performance

- **Duration:** 약 4분(작업 구간)
- **Started:** 2026-11-11T15:01:28Z
- **Completed:** 2026-11-11T15:05:17Z
- **Tasks:** 2 (TDD 1 · 문서 1)
- **Files modified:** 5 (생성 1 · 수정 4) + gh-trade 저장소 미추적 노트 1

## 계약 숫자(코드 = 노트)

| 항목 | 값 | 위치 |
|------|-----|------|
| 캐시 TTL | 5초 (`NEWS_BY_STOCK_CACHE_TTL_MS = 5_000`) | `server/src/routes/news-by-stock.ts` |
| 캐시 키 | 정렬한 코드 + `|days|limit` | 같은 파일 `getNewsByStock` |
| 전용 제한 | IP 당 분 600회 · 429 `RATE_LIMITED` | `server/src/middleware/rate-limit.ts` `newsByStockRateLimiter` |
| 전역 제한 제외 | `/health…` · `/news/by-stock` | 같은 파일 `apiRateLimitSkip` |
| gh-trade 호출 | `days=3&limit=3` (기본 `days=3&limit=20`) | 노트 「요청 내용」 · 「gh-trade 가 할 일」 |
| 첫 수집 | 약 10 ~ 15초 | 노트 「뜻」 |
| 권장 주기 | 10초 · 100코드 묶음 · gzip | 노트 「gh-trade 가 할 일」 |

## gh-trade 인박스 노트

- **정본 경로:** `/Users/alex/repos/gh-trade/docs/inbox/from-gh-radar/261112-kis-news-by-stock.md`
- frontmatter 는 스크립트가 만든 그대로(`status: open` · `from_commit: d4d75f77` · `from_branch: worktree-agent-a9c33e9f783ad2503` · `fbs_sync_marker: a4e54275`). 본문 5절은 scratchpad 에 쓴 뒤 같은 디렉터리 임시 파일 + `mv` 로 놓았다. 「id 로」 문구 한 곳만 그 뒤 `sed -i` 로 고쳤다.
- gh-trade 저장소 상태: `?? docs/inbox/from-gh-radar/261112-kis-news-by-stock.md` — 커밋하지 않았다.
- gh-radar 사본: `.planning/phases/41-kis-news-and-disclosure-feed/41-GHTRADE-NOTE.md` — 머리 주석 한 줄 외 본문 동일(`diff` 확인).

**메인 세션 후속:** ListAgents 로 gh-trade 세션을 찾아 SendMessage(노트 경로 `/Users/alex/repos/gh-trade/docs/inbox/from-gh-radar/261112-kis-news-by-stock.md` · 「배포는 gh-radar 41-09 뒤」 한 줄) — 파일이 정본이다. executor 는 메시지를 보내지 않았다.

## Task Commits

1. **Task 1: 5초 캐시 + 전용 제한기 + 전역 제한기에서 빼기(TDD)** — RED `61a0a69b` (test) → GREEN `d4d75f77` (feat) · REFACTOR 없음
2. **Task 2: gh-trade 계약 노트(gh-radar 사본)** — `b0ac1385` (docs)

## Files Created/Modified

- `server/src/routes/news-by-stock.ts` — `NEWS_BY_STOCK_CACHE_TTL_MS` · `NewsByStockSnapshot` · `getNewsByStock` · `toResponse`(입력 순서 조립) · 체인에 `newsByStockLimiter`
- `server/src/middleware/rate-limit.ts` — `apiRateLimitSkip` · `newsByStockRateLimiter` · 공통 `keyGenerator` / 429 handler
- `server/tests/routes/news-by-stock.test.ts` — 캐시 6건 추가(기존 21건 그대로)
- `server/tests/middleware/rate-limit.test.ts` — 전용 제한기 · skip 2건 추가
- `.planning/phases/41-kis-news-and-disclosure-feed/41-GHTRADE-NOTE.md` — gh-trade 노트 사본

## Decisions Made

- RPC 결과에 없는 코드는 생략 — 41-01 테스트 「codes 100개 → 200」(RPC `stocks: []`)이 그대로 통과하도록 기존 동작 유지. RPC 가 모든 코드를 주므로 실제 차이는 없다.
- 노트 실패 목록에 429 추가 · 목업 「삭제 공시는 줄을 지웁니다」 는 계약 밖이라고 명시.

## Deviations from Plan

### 실행 방식 차이

**1. 노트 생성 스크립트를 main tree 가 아니라 worktree 에서 실행**
- 계획은 「main tree 에서」 였지만 orchestrator 지시(워크트리에서도 git-common-dir 로 같은 gh-trade 를 찾음)에 따라 worktree 에서 돌렸다. 결과: 생성 경로는 같고, frontmatter 의 `from_commit` / `from_branch` 가 워크트리 브랜치(`d4d75f77` · `worktree-agent-a9c33e9f783ad2503`)로 찍혔다. 이 커밋은 머지 뒤 master 에 들어가므로 추적은 된다. 필요하면 메인 세션이 master 머지 해시로 바꿔도 된다.

**2. 「id 로」 수용 grep 맞춤**
- 처음 본문이 「`id` 로」(백틱)라 수용 grep 「id 로」 가 0 이었다 — 「새 글 강조는 id 로」 로 고쳐 두 파일 모두 반영.

**Total deviations:** 0 auto-fix(Rule 1 ~ 3 없음) · 실행 방식 차이 2
**Impact on plan:** 없음 — 계약 · 이름 · 숫자는 계획 그대로.

## TDD Gate Compliance

- RED `61a0a69b` `test(41-03)` → GREEN `d4d75f77` `feat(41-03)` 순서 확인.
- RED 근거: `pnpm exec vitest run tests/routes/news-by-stock.test.ts tests/middleware/rate-limit.test.ts --maxWorkers=2` → exit 1 · 6 failed / 26 passed. 캐시 「5초 안 두 번 rpc 1회」 · 「다른 순서 rpc 1회」 는 `expected [ …(2) ] to have a length of 1 but got 2`(계획한 assertion 에서 실패), 「5,001ms」 는 `expected undefined to be 5000`, 나머지 3건(`newsByStockRateLimiter` · `apiRateLimitSkip` · `getNewsByStock`)은 `is not a function`(심볼 부재).
- 「days/limit 다른 키」 · 「실패 미캐시」 2건은 캐시가 없던 RED 시점에도 통과했다 — 캐시가 이 둘을 깨지 않는지 보는 회귀 가드라 의도된 결과.
- 의미 평가: 핵심 행위(캐시 공유)는 계획한 assertion 에서 실패했고, 새 심볼 케이스는 심볼 부재 실패라 엄밀한 RED 근거로는 약하다 — GREEN 뒤 32/32 통과로 보완. `gsd_run check tdd-red-evidence` 기록은 만들지 않았다(이 플랜은 `type: execute` · TDD_MODE 미지정).

## Verification

- `pnpm --filter @gh-radar/shared build` — 성공
- `pnpm --filter @gh-radar/server run typecheck` — 성공(`tsc --noEmit` 오류 0)
- `vitest run tests/routes/news-by-stock.test.ts tests/middleware/rate-limit.test.ts --maxWorkers=2` — 2 files · 32/32 통과(41-01 라우트 21건 회귀 0)
- 수용 grep: `NEWS_BY_STOCK_CACHE_TTL_MS = 5_000` 1 · `export function newsByStockRateLimiter` 1 · `/news/by-stock` in rate-limit.ts 3 · `grep -rnE "FHKST01011800|KIS_APPKEY" server/src` 빈 출력
- Task 2 verify: `NOTE-OK` · 「돌파 C」 · 「상따 1」 · 「알림음 없음」 · 「truncated」 · 「feedAt」 · 「id 로」 · 「600」 · 「5초」 모두 grep 됨 · `git -C ../gh-trade status` 에 `??`

## Issues Encountered

- 워크트리에 node_modules 가 없어 `pnpm install --frozen-lockfile --prefer-offline` 실행(5.6초).

## User Setup Required

None — 원격 배포는 41-09.

## Next Phase Readiness

- 41-09 배포 뒤 이 경로가 생긴다. 그 전엔 gh-trade 클라가 404 를 「아직 없음」 으로 넘겨야 한다(노트에 명시).
- 노트 「질문」: `count` + `truncated` 로 배지 「N건 / N건+」 가 충분한지 — gh-trade 답을 기다린다.

## Self-Check: PASSED

- 파일 존재: `server/src/routes/news-by-stock.ts` · `server/src/middleware/rate-limit.ts` · 테스트 2 · `41-GHTRADE-NOTE.md` · gh-trade 인박스 노트
- 커밋 `61a0a69b` · `d4d75f77` · `b0ac1385` HEAD 조상 확인

---
*Phase: 41-kis-news-and-disclosure-feed*
*Completed: 2026-11-12*
