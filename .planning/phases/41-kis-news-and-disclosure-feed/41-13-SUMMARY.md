---
phase: 41-kis-news-and-disclosure-feed
plan: 13
subsystem: worker
status: complete
tags: [kis-news-sync, kis, axios, token, pagination, error-classification, sc-5]
requires:
  - phase: 41-02
    provides: "표 kis_access_tokens(token_type PK · access_token · expires_at · fetched_at)"
  - phase: 41-06
    provides: "KisNewsTitleRow · 실측 표본 픽스처 · 비밀 가림 로거"
provides:
  - "src/kis/client.ts — createKisHttp · KisApiError · KisErrorKind · classifyKisError · safeErrorFields · KisSafeErrorFields · KIS_NEWS_TITLE_PATH · KIS_NEWS_TITLE_TR_ID · KIS_TOKEN_PATH"
  - "src/kis/newsTitle.ts — fetchNewsTitlePage · pageUntilSeen · cursorOf · cursorParams · KisAuth · NewsTitleCursor · NewsTitleQuery · PageUntilSeenOptions · PageUntilSeenResult"
  - "src/kis/token.ts — getKisAccessToken · parseKisExpiry · KIS_TOKEN_TYPE(live) · TOKEN_REUSE_MIN_MS(3_600_000) · TOKEN_ISSUE_GAP_MS(61_000) · KisTokenLog · GetKisAccessTokenArgs · KisAccessToken"
affects: [41-08]
actuals:
  tokens: 11648   # chars/4 over 변경 파일 8개(46592자 — 소스 · 테스트 37731 + RED 기록 8861)
  tasks: 2
  commits: 4
plan_head_before: ba6c3aeeea2eee7b77b03d61e6134458bcfd689d
plan_head_after: d8ca4b7b14afed986804e72d46cf1e79efe47526
tech-stack:
  added: []
  patterns:
    - "한투 실패는 항상 KisApiError(상태 · msg_cd · msg1 · 종류)로 다시 던지고 원래 axios 오류는 cause 로도 붙이지 않는다 — config(인증 헤더 · 발급 본문)가 로그로 새는 길을 막는다"
    - "validateStatus: () => true + 본문 rt_cd 판정 — 상태값이 아니라 msg_cd 로 분류"
    - "토큰 함수는 시계를 인자 now(epoch ms)로 받는다"
key-files:
  created:
    - workers/kis-news-sync/src/kis/client.ts
    - workers/kis-news-sync/src/kis/newsTitle.ts
    - workers/kis-news-sync/src/kis/token.ts
    - workers/kis-news-sync/tests/classifyError.test.ts
    - workers/kis-news-sync/tests/newsTitle.test.ts
    - workers/kis-news-sync/tests/token.test.ts
    - .planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-13-T1-red.json
    - .planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-13-T2-red.json
  modified: []
key-decisions:
  - "classifyKisError 순서: 아는 msg_cd → 상태 0 · 5xx(transient) → 429(rate_limit) → unknown. 500 + EGW00201 은 rate_limit"
  - "pageUntilSeen 은 받은 쪽의 행을 걸러내지 않고 모두 돌려준다(쪽 경계 겹침만 일련번호로 제거) — 들여오기가 멱등이고 수정본은 일련번호 순서가 어긋날 수 있다"
  - "pageUntilSeen 은 새 행이 하나도 없는 쪽(같은 쪽 되풀이)에서도 멈춘다 — 커서가 앞으로 못 가면 maxPages 까지 같은 쪽을 부르는 낭비 방지"
  - "임대 없는 실행 + force: 발급하지 않고 살아 있는 DB 토큰을 경고와 함께 돌려준다(보유자가 이미 바꿨을 수 있다). 같은 토큰이 또 무효면 41-08 이 종료 1"
  - "DB 읽기 실패면 발급하지 않고 오류 — 직전 발급 시각을 모르면 61초 가드를 지킬 수 없다"
  - "만료 문자열 · expires_in 둘 다 없으면 24시간(실측 86400)으로 본다 — 틀려도 토큰 무효 → force 재발급으로 스스로 낫는다"
patterns-established:
  - "41-08 루프는 실패 로그에 safeErrorFields(err) 만 쓴다"
  - "pageUntilSeen(fetchPage, ...) 의 fetchPage 는 (cursor) => fetchNewsTitlePage(http, auth, { cursor, ... })"
requirements-completed: [SC-1, SC-5]
coverage:
  - id: D1
    description: "한투 오류를 msg_cd 로 분류(EGW00201 rate_limit · EGW00121/00123 token_invalid · EGW00133 token_rate · 0/5xx transient · 그 밖 unknown)하고 실패 로그는 상태 · msg_cd · msg1 · 종류 네 필드만 남긴다"
    requirement: "SC-5"
    verification:
      - kind: unit
        ref: "workers/kis-news-sync/tests/classifyError.test.ts (17 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "news-title 한 쪽 호출(헤더 · 쿼리 8칸 · 표본 커서) · 마지막 본 일련번호까지 커서 되감기(겹침 1건 · capped · 빈 쪽 · minWrittenAt)"
    requirement: "SC-1"
    verification:
      - kind: unit
        ref: "workers/kis-news-sync/tests/newsTitle.test.ts (16 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "DB 토큰 재사용 · 만료 1시간 전 재발급 · 61초 가드 · 임대 보유자만 발급 · 로그에 토큰 · 시크릿 없음"
    requirement: "SC-5"
    verification:
      - kind: unit
        ref: "workers/kis-news-sync/tests/token.test.ts (15 tests)"
        status: pass
    human_judgment: false
duration: 7min
completed: 2026-11-12
---

# Phase 41 Plan 13: 한투 호출 클라이언트 · 커서 되감기 · DB 토큰 Summary

**한투 news-title 호출을 msg_cd 오류 분류 · 네 필드 안전 로그 · 표본 커서(`00YYYYMMDD` · `0000HHMMSS` · 일련번호) 되감기로 감싸고, 접근 토큰을 `kis_access_tokens` 재사용 · 1시간 전 재발급 · 61초 가드 · 임대 보유자만 발급으로 묶었다. 41-08 루프는 엮기만 하면 된다(테스트 48건).**

## Performance

- **Duration:** 약 7분(문맥 읽기 뒤 기록 시작 기준)
- **Started:** 2026-11-11T15:21:40Z
- **Completed:** 2026-11-11T15:28:42Z
- **Tasks:** 2
- **Files modified:** 8 (소스 3 · 테스트 3 · RED 기록 2)

## Accomplishments

- `classifyKisError` · `KisApiError` · `safeErrorFields` — 어떤 실패든 `{ status, msgCd, msg1, kind }` 넷으로만 로그된다. axios 오류의 `config.headers.appsecret` · 인증 토큰 · 발급 본문이 결과 JSON 에 없음을 테스트로 잠갔다.
- `fetchNewsTitlePage` · `pageUntilSeen` — 실측 표본 `all_latest` → `cont_by_cursor` 두 쪽으로 커서 파라미터와 경계 겹침 1건 제거를 검증했다.
- `getKisAccessToken` — 알림톡 폭탄(Pitfall 1)을 막는 판정 표를 시계 주입 단위 테스트로 고정했다.

## 오류 코드 → 종류

| 입력 | 종류 | 41-08 처리(41-RESEARCH 표) |
|---|---|---|
| `msg_cd` EGW00201 | `rate_limit` | 그 틱 중단 · 1분 5회면 60초 정지 |
| `msg_cd` EGW00121 · EGW00123 | `token_invalid` | `force` 재발급 1번 → 또 무효면 종료 1 |
| `msg_cd` EGW00133 (발급 응답은 `error_code`) | `token_rate` | 재발급 중단 · 61초 뒤 1회 |
| 상태 0(네트워크 · 타임아웃) · 5xx · msg_cd 모름 | `transient` | 그 흐름만 지수 물러섬 |
| 상태 429 · msg_cd 없음 | `rate_limit` | 위와 같음 |
| 그 밖(예 200 + OPSQ0001) | `unknown` | 연속 5번이면 한도 의심 표시 · 종료 1 |

아는 `msg_cd` 가 상태값보다 먼저다(500 + EGW00201 → `rate_limit`).

## 토큰 판정 표 (남은 시간 × 임대 × 직전 발급)

| DB 토큰 남은 시간 | `canIssue`(임대) | `force` | 직전 발급 | 결과 | 발급 요청 |
|---|---|---|---|---|---|
| > 1시간 | 무관 | 아님 | 무관 | DB 토큰 재사용 (`issued: false`) | 0 |
| ≤ 1시간 · 살아 있음 | 없음 | 무관 | 무관 | DB 토큰 + warn | 0 |
| 만료 · 없음 | 없음 | 무관 | — | 오류 | 0 |
| ≤ 1시간 · 만료 · 없음, 또는 `force` | 있음 | 무관 | 61초 안 | 오류(「61초 가드」) | 0 |
| ≤ 1시간 · 만료 · 없음, 또는 `force` | 있음 | 무관 | 61초 밖 | tokenP 발급 · upsert(onConflict `token_type`) (`issued: true`) | 1 |
| DB 읽기 실패 | 무관 | 무관 | 모름 | 오류 | 0 |

발급 응답 `access_token_token_expired` `"YYYY-MM-DD HH:MM:SS"` 를 `+09:00` 로 읽고(넘친 값 13월 · 45일 등은 null), 안 되면 `expires_in` 초 → 그것도 없으면 86400초.

## Task Commits

1. **Task 1: 클라이언트 · 오류 분류 · 한 쪽 호출 · 커서 페이징**
   - RED `ba923eee` (test) — 29/33 실패
   - GREEN `9b927f7a` (feat) — 33/33 통과
2. **Task 2: DB 토큰 — 재사용 · 1시간 전 재발급 · 61초 가드 · 임대 보유자만 발급**
   - RED `8961c0ce` (test) — 12/15 실패
   - GREEN `d8ca4b7b` (feat) — 48/48 통과(세 파일)

REFACTOR 커밋 없음(정리할 것 없음).

## Files Created/Modified

- `workers/kis-news-sync/src/kis/client.ts` — 경로 · tr_id 상수, `createKisHttp`(timeout 10초 · 인증 헤더는 호출마다), 오류 분류 · 안전 필드
- `workers/kis-news-sync/src/kis/newsTitle.ts` — 한 쪽 호출 · 커서 · 되감기
- `workers/kis-news-sync/src/kis/token.ts` — DB 토큰 판정 · 발급 · upsert
- `workers/kis-news-sync/tests/classifyError.test.ts` (17) · `tests/newsTitle.test.ts` (16) · `tests/token.test.ts` (15)
- `.planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-13-T1-red.json` · `41-13-T2-red.json` — RED 증거 기록

## TDD 기록

- **Task 1 RED (`ba923eee`):** 타입만 맞춘 스텁으로 29/33 실패. 판정기 `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK`(target `tests/classifyError.test.ts > classifyKisError — msg_cd 로 가른다 > EGW00201 (초당 거래건수 초과) → rate_limit`, expected `rate_limit` · actual `unknown`). 파일 전체 tap 보고는 `toEqual` 객체 차이가 여러 줄 문자열로 찍혀 `invalid_record`(Malformed TAP)로 거부돼, `-t classifyKisError` 로 대상 describe 만 다시 돌린 기록을 썼다. 의미 판정: target 이 실행돼 단언에서 실패(로드 · 문법 오류 없음).
- **Task 2 RED (`8961c0ce`):** 스텁이 `not implemented` 로 던져 12/15 실패. 판정기 → `RED_EVIDENCE_OK`(target `직전 발급 30초 전 → 발급 호출 없이 오류(61초 가드)`, expected `/61/` · actual `not implemented`). 통과 3건은 「오류여야 한다」만 보는 케이스(임대 없음 2 · DB 읽기 실패)로 스텁의 throw 에 우연히 맞았고 GREEN 에서 같은 단언으로 다시 검증됐다. 처음엔 스텁이 빈 토큰을 resolve 해 실패 메시지에 여러 줄 객체가 찍혔기에 throw 로 바꿨다.
- **GREEN:** `9b927f7a` · `d8ca4b7b`.

## Decisions Made

frontmatter `key-decisions` 참고. 핵심만: 되감기는 받은 쪽 행을 거르지 않는다(멱등 들여오기에 맡김) · 새 행 없는 쪽에서도 멈춘다 · 임대 없는 실행은 `force` 여도 발급하지 않는다 · DB 를 못 읽으면 발급하지 않는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 테스트 버그: 「output 없음」 케이스가 기본 인자로 표본 40건을 받았다**
- **Found during:** Task 1 GREEN
- **Issue:** `okHttp(undefined)` 가 기본값 `PAGE1` 을 써서 output 이 있는 응답을 만들었다.
- **Fix:** 그 케이스만 output 없는 응답 목을 직접 만들었다.
- **Files modified:** workers/kis-news-sync/tests/newsTitle.test.ts
- **Committed in:** 9b927f7a

**2. [Rule 2 - 핵심 기능 보완] 계획 behavior 밖의 안전 장치 몇 가지**
- `pageUntilSeen`: 새 행이 없는 쪽이면 멈춘다(무한 되감기 · 호출 낭비 방지) — 테스트 1건.
- `classifyKisError`: msg_cd 없는 429 → `rate_limit` — 테스트 1건.
- `getKisAccessToken`: DB 읽기 실패면 발급하지 않고 오류(61초 가드를 지킬 근거가 없다) — 테스트 1건. 발급 거절 본문 `error_code` · `error_description`(EGW00133) 을 `KisApiError` 로 — 테스트 1건.
- upsert 실패 로그 · DB 읽기 오류 메시지에는 PostgREST 오류의 `code` · `message` 만 싣는다(`details` 는 「Failing row contains (...)」 처럼 토큰 값을 담을 수 있다).
- **Committed in:** 9b927f7a · d8ca4b7b

---

**Total deviations:** 2 auto-fixed (테스트 버그 1 · 안전 장치 보완 1)
**Impact on plan:** 계획 계약(이름 · 반환 모양)은 그대로. 41-08 이 쓸 표면은 계획 색인과 같다.

## Issues Encountered

- vitest `tap-flat` 보고가 `toEqual` 객체 차이를 여러 줄 문자열로 찍어 RED 판정기가 Malformed TAP 으로 거부한다. 대상 테스트만 `-t` 로 다시 돌려 기록했다(41-06 과 같은 우회).

## Known Stubs

없음 — RED 스텁은 두 GREEN 커밋에서 실제 구현으로 바뀌었다.

## 41-08 이 알아둘 것

- `getKisAccessToken({ supabase, http, appkey, appsecret, canIssue, force?, now, log })` — `now` 는 epoch ms 숫자, `log` 는 `{ info(obj, msg), warn(obj, msg) }`(pino 로거 그대로 넘기면 된다). 발급 실패는 `KisApiError`(kind `token_rate` 등) 또는 일반 `Error`(61초 가드 · 임대 없음 · DB 읽기 실패) — 둘 다 `safeErrorFields` 로 로그.
- 61초 가드는 DB `fetched_at`(성공한 발급) 기준이다. 발급이 거절(EGW00133)되면 `fetched_at` 이 바뀌지 않으므로 「61초 뒤 1회만」 재시도 간격은 루프가 지켜야 한다.
- `fetchNewsTitlePage` 는 실패를 항상 `KisApiError` 로 던진다(네트워크도 status 0 · `transient`).
- `pageUntilSeen` 의 `capped: true` 가 Pitfall 3 「page cap reached」 warn 신호다. 마지막 본 번호가 null 이면 `maxPages` 까지 가서 `capped: true` 다(slow 모드 첫 실행).
- 마지막 본 일련번호 비교는 계획대로 문자열 비교다. 수정본이 옛 일련번호를 단 채 피드 맨 위로 오르면 1쪽에서 일찍 멈출 수 있다(표본에서는 일련번호 시각과 작성 시각이 모두 일치해 관찰되지 않음). F · G 60초 안전망(41-08)이 보완한다.

## User Setup Required

None — 외부 설정 없음(실제 한투 호출 · 배포 없음, 테스트는 전부 목).

## Next Phase Readiness

- 41-08(루프)이 `client` · `newsTitle` · `token` 을 바로 엮을 수 있다. 막힌 것 없음.

## Self-Check: PASSED

- FOUND: workers/kis-news-sync/src/kis/client.ts · newsTitle.ts · token.ts · tests/classifyError.test.ts · tests/newsTitle.test.ts · tests/token.test.ts · tdd-red/41-13-T1-red.json · tdd-red/41-13-T2-red.json
- FOUND: ba923eee · 9b927f7a · 8961c0ce · d8ca4b7b (HEAD 조상)
- 수락 기준: `FHKST01011800` 1 · `export async function pageUntilSeen` 1 · `safeErrorFields`(테스트) 6 · Task 1 테스트 33 ≥ 12 · `TOKEN_ISSUE_GAP_MS = 61_000` 1 · `kis_access_tokens` 2 · 로그 비밀 grep 빈 출력 · token.test.ts 15 ≥ 7
- 계획 verification: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/token.test.ts tests/classifyError.test.ts tests/newsTitle.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync run typecheck` → 3 files · 48 passed · tsc 오류 0 · exit 0
- STATE.md · ROADMAP.md 변경 없음
