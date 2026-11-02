---
phase: 37-tick-viewer
plan: 07
subsystem: api
tags: [express, supabase-rpc, supabase-storage, signed-url, cloud-run-admin-api, metadata-server, zod, tick-viewer]
status: complete

requires:
  - phase: 37-tick-viewer (37-01)
    provides: "저장처: supabase-storage — 비공개 버킷 tick-grid · createSignedUrl"
  - phase: 37-tick-viewer (37-04)
    provides: "웹 RPC tick_day_for_user · tick_open_for_user · tick_today_for_user · tick_request_convert_for_user · tick_cancel_convert_for_user · Job/server RPC tick_request_trigger_failed"
provides:
  - "shared 계약 tick-api.ts — TickExchange · TickGridSource · TickGridMode · TickGridRow · TickConvertStatus · TickConvertRequest · TickDayResponse · TickTodayRow · TickTodayResponse · TickOpenGrid · TickOpenResponse · TickConvertBody · TickConvertResponse · TickCancelResponse"
  - "ticksRouter — GET /api/ticks/day · /today · /open · POST /api/ticks/convert · /convert/cancel"
  - "services/ticks.ts — getTickDay · getTickToday · openTick · requestTickConvert · cancelTickConvert · TICK_GRID_BUCKET · TICK_GRID_URL_TTL_S · TICK_REQUEST_DAILY_CAP_DEFAULT · 오류 생성자 3종"
  - "services/tick-convert-trigger.ts — metadataAccessToken · createTickConvertTrigger · TickConvertTrigger · TICK_REQUEST_TIMEOUT"
  - "AppDeps.tickConvertTrigger · AppDeps.tickRequestDailyCap · config tickConvertJob · tickRequestDailyCap"
  - "deploy-server.sh env TICK_CONVERT_JOB · TICK_REQUEST_DAILY_CAP (+ REQUIRED_ENV_KEYS)"
affects: [37-08, 37-10, 37-12, 37-15, 37-16, 37-18]

actuals:
  tokens: 16000
  tasks: 2
  commits: 3
plan_head_before: 18088679ec9ea1e0ebb47cdcd20425e5ec666aee
plan_head_after: 94d7727491f5102882543366ea0452c8b21bc767

tech-stack:
  added: []
  patterns:
    - "게이트 RPC 1회 → 격자 있을 때만 createSignedUrl 1회(object_path 는 응답에서 제거 · 서명 URL 만)"
    - "외부 트리거는 RPC 의 should_trigger 가 참일 때만 부르고, 실패하면 되돌림 RPC 로 triggered_at 을 지운다"
    - "Cloud Run 메타데이터 서버 토큰 + Admin API v2 jobs:run — SDK 없이 fetch 한 번 · throw 없이 결과 객체(status 0 = 닿지 못함)"

key-files:
  created:
    - packages/shared/src/tick-api.ts
    - server/src/schemas/ticks.ts
    - server/src/services/ticks.ts
    - server/src/services/tick-convert-trigger.ts
    - server/src/routes/ticks.ts
    - server/tests/routes/ticks.test.ts
    - server/tests/services/tick-convert-trigger.test.ts
  modified:
    - packages/shared/src/index.ts
    - server/src/app.ts
    - server/src/config.ts
    - server/src/server.ts
    - scripts/deploy-server.sh

key-decisions:
  - "Job 깨우기 실패 시 DB 에 남기는 error 는 TRIGGER_FAILED:<status> · TRIGGER_DISABLED 로 짧게 — Admin API 응답 원문(프로젝트 경로 · 권한 이름)은 cause 로 서버 로그에만"
  - "convert 응답에서 should_trigger 를 빼고 triggered(이 호출이 Job 을 깨웠는지)로 바꿔 싣는다 — capped 는 429 로 빠지므로 200 의 capped 는 늘 false"
  - "트리거가 없어도(TICK_CONVERT_JOB 미설정) should_trigger 가 거짓인 분기(grid_ready · not_uploaded · 앞 Job 에 실림)는 200 — 503 은 Job 을 실제로 깨워야 할 때만"
  - "실행 이름은 Operation 의 metadata.name(없으면 name) — v2 jobs:run 2xx 본문은 장기 실행 Operation"

patterns-established:
  - "틱 뷰어 서버 오류 코드: TICK_CONVERT_CAPPED(429) · TICK_CONVERT_TRIGGER_FAILED(502) · TICK_CONVERT_UNAVAILABLE(503) — services/ticks.ts 안 상수"

requirements-completed: [D-03, D-08, D-09, D-15]

duration: 25min
completed: 2026-11-02
---

# Phase 37 Plan 07: 틱 뷰어 server 과거 경로 API — open(게이트 · 서명 URL) · day · today · 요청 변환 트리거 Summary

**`/api/ticks/{day,today,open,convert,convert/cancel}` 다섯 경로를 붙였다. 미들웨어는 `requireAuth()` 하나만 쓰고 게이트는 37-04 RPC 가 맡는다. 열기는 RPC 1회에, 격자가 있을 때만 `tick-grid` 서명 URL(600초) 1회를 더한다. 요청 변환은 RPC 가 `should_trigger: true` 를 준 호출에서만 Cloud Run Admin API v2 `jobs:run` 을 부른다. 인자는 overrides `request --date D --ex EX`, 실행 상한은 `timeout 1200s` 다. 상한 초과 · 실행 실패 · 트리거 미설정은 각각 429 · 502 · 503 으로 갈린다. 테스트는 39건 모두 통과했고 server 전체 회귀도 719건 모두 통과했다.**

## Performance

- **Duration:** 약 25분
- **Completed:** 2026-11-02
- **Tasks:** 2/2 (Task 1 tracer · Task 2 TDD RED → GREEN)
- **Files:** 7개 생성 · 5개 수정

## 라우트

| 메서드 · 경로 | 입력 | RPC | 응답 |
|---|---|---|---|
| GET `/api/ticks/day` | `d?` (YYYYMMDD) | `tick_day_for_user` 1회 | `TickDayResponse` 그대로 통과 |
| GET `/api/ticks/today` | 없음 | `tick_today_for_user` 1회 | `TickTodayResponse` = RPC + `live`(`app.locals.tickgw` 가 있으면 true · 37-15 가 결선 · 지금은 false) |
| GET `/api/ticks/open` | `isin` · `d` · `ex` | `tick_open_for_user` 1회 + 격자 있으면 `createSignedUrl(tick-grid, object_path, 600)` 1회 | `TickOpenResponse` — grid 는 `TickOpenGrid`(url · expiresIn · 메타) · **object_path 없음** |
| POST `/api/ticks/convert` | 본문 `{isin, d, ex}` | `tick_request_convert_for_user`(p_daily_cap) 1회 · should_trigger 이면 Admin API 1회 · 실패 시 `tick_request_trigger_failed` 1회 | `TickConvertResponse` (`triggered` · `grid_ready` · `not_uploaded` · `retry_after` · `request` · `eta_s`) |
| POST `/api/ticks/convert/cancel` | 본문 `{isin, d, ex}` | `tick_cancel_convert_for_user` 1회 | `TickCancelResponse` |

입력 규칙: isin 은 `^[A-Z0-9]{12}$` 이고 KR 로 좁히지 않는다. d 는 형식과 실재 날짜를 함께 보는 `Ymd` 를 쓴다. ex 는 `KRX|NXT` 만 받는다. 위반하면 400 `VALIDATION_FAILED` 를 주고 RPC 는 부르지 않는다. 미인증은 401 이고, RPC 가 `access:false` 를 줄 때만 403 `DMA_UNMAPPED` 를 준다. 그 밖의 모양 위반은 500 `DB_ERROR` 다.

## 오류 코드

| 코드 | HTTP | 언제 |
|---|---|---|
| `TICK_CONVERT_CAPPED` | 429 | RPC `capped: true`(전역 하루 상한) · Job 0회 |
| `TICK_CONVERT_TRIGGER_FAILED` | 502 | Admin API 비 2xx · 네트워크 · 10초 타임아웃 · 토큰 실패 → `tick_request_trigger_failed(D, EX, "TRIGGER_FAILED:<status>")` 로 되돌린 뒤 |
| `TICK_CONVERT_UNAVAILABLE` | 503 | `TICK_CONVERT_JOB` 미설정인데 should_trigger → `tick_request_trigger_failed(D, EX, "TRIGGER_DISABLED")` 뒤 |
| `DMA_UNMAPPED` | 403 | RPC `access:false` |
| `DB_ERROR` | 500 | RPC · Storage 오류 · 모양 위반(원문은 cause 로 로그에만) |

`not_uploaded: true` 이면 200 `{not_uploaded: true, retry_after}` 를 준다. Job 은 깨우지 않고 되돌림 RPC 도 부르지 않는다.

## env

- `TICK_CONVERT_JOB` = `projects/<p>/locations/<r>/jobs/<j>`. 빈 값이면 미설정으로 보고 server 가 warn 한 줄 「TICK_CONVERT_JOB not set — POST /api/ticks/convert 503」 을 남긴다. 형식이 다르면 부팅 단계에서 throw 한다. deploy-server.sh 에서는 `projects/${EXPECTED_PROJECT}/locations/${REGION}/jobs/gh-radar-tick-convert` 다.
- `TICK_REQUEST_DAILY_CAP` = 양의 정수이고 기본값은 20 이다. deploy 값도 20 이다.
- deploy-server.sh 는 `--set-env-vars` 문자열과 `REQUIRED_ENV_KEYS` 양쪽에 두 이름을 넣었다. `--set-env-vars` 가 전량 치환이라 한쪽만 넣으면 사라지는 함정(T-15-55)이 있어서다. 스크립트는 실행하지 않았다(37-16 메인 세션).
- 실행 SA 에 그 Job 단위로 `run.jobs.runWithOverrides` 를 주는 일은 37-18 deploy-tick-convert.sh 가 맡는다. 머리 주석에 적어 두었다.

## 테스트

- `server/tests/routes/ticks.test.ts` **24건**:
  - 공통: 401 · 403 · 400 9종(RPC 0회) · 모양 위반 500 · RPC 오류 500(원문 비노출)
  - open: 서명 인자 `(tick-grid, object_path, 600)` · object_path 비노출 · 쿼리 user_id 무시 · 비 KR ISIN 과 NXT · grid null 이면 서명 0회 · 서명 실패 500 · grid 모양 위반 500
  - day · today: 통과 모양 · live false/true
  - convert 10건: should_trigger true/false · capped 429 · grid_ready · not_uploaded(run 0 · 되돌림 0) · 실패 되돌림 502(403 · 네트워크) · 되돌림 RPC 실패에도 502 · 미설정 503 · 미설정이지만 should_trigger false 면 200 · 401/403/400
  - cancel 2건
- `server/tests/services/tick-convert-trigger.test.ts` **15건**:
  - 토큰: URL · `Metadata-Flavor` · expires_in − 60초 캐시 경계 · 실패 throw
  - jobs:run: URL · Bearer · 본문 overrides · `timeout: "1200s"` · 실행 이름 · 두 번째 run 은 토큰 요청 0회 · tokenFn 주입
  - 실패 매핑: 403(본문 200자) · 네트워크 status 0 · 토큰 실패 시 Admin API 0회 · 타임아웃 `TIMEOUT` · 로그에 토큰 없음
  - config 3건: 미설정 · 형식 throw · 상한 덮기
- 플랜 verify: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && vitest run tests/routes/ticks.test.ts tests/services/tick-convert-trigger.test.ts --maxWorkers=2` → **39/39 통과** · `bash -n scripts/deploy-server.sh` OK · `TICK_CONVERT_JOB|TICK_REQUEST_DAILY_CAP` 6회(기준 ≥4).
- server 전체 회귀 `vitest run --maxWorkers=2` → **47 파일 · 719/719 통과**.

## Task Commits

1. **Task 1 (tracer): open(게이트 RPC · 서명 URL) · day · today · shared 계약** — `396b862d` (feat)
2. **Task 2 RED: 트리거 · convert/cancel 실패 시험** — `0ff55cf3` (test). 시험 12건 실패 · 12건 통과(Task 1 몫)와 trigger 모듈 없음을 확인했다.
3. **Task 2 GREEN: 요청 변환 트리거 · 취소 · 하루 상한 · config · 결선 · deploy env** — `94d77274` (feat)

트레이서 피드백 게이트: Task 1 verify(shared build · server typecheck · 라우트 시험 12/12)를 끝에서 끝까지 다시 돌려 통과한 것을 확인한 뒤 Task 2 로 넘어갔다.

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 계약 보강] `TickCancelResponse` 타입 추가**
- **Found during:** Task 2
- **Issue:** 플랜의 shared 타입 목록에는 cancel 응답 타입이 없었다. 그러면 웹이 `{access, cancelled, request}` 모양을 임의로 적어야 한다.
- **Fix:** `packages/shared/src/tick-api.ts` 에 `TickCancelResponse` 를 더했다. 모양은 37-04 RPC 반환 그대로다.
- **Commit:** 396b862d

**2. [Rule 2 - 견고성] 되돌림 RPC 자체가 실패해도 원래 오류(502/503)를 유지**
- **Found during:** Task 2
- **Issue:** `tick_request_trigger_failed` 도 실패할 수 있다. 그 오류를 그대로 던지면 사용자는 원인과 다른 500 을 받는다.
- **Fix:** 되돌림 실패는 cause(`rollback`)에만 싣고 응답 코드는 그대로 둔다. 되돌리지 못한 triggered_at 은 2분 stale 규칙(37-04) 덕분에 결국 다시 깨울 수 있다. 시험 1건으로 잠갔다.
- **Commit:** 94d77274

**3. [Rule 2 - 견고성] open 의 grid 모양 검사**
- **Issue:** grid 가 객체가 아니거나 object_path 가 비어 있으면 `createSignedUrl` 에 undefined 가 들어간다.
- **Fix:** 그 경우 서명 없이 500 `DB_ERROR` 를 준다. 시험으로 잠갔다.
- **Commit:** 396b862d

## Issues Encountered

- 이번 worktree 격리 쉘은 `$(git …)` 나 복합 git 명령을 거부했다. 그래서 플랜 커밋 기록 파일(`gsd-plan-head-before-37-07`)은 만들지 못했다. plan_head_before 는 dispatch 가 지정한 base(18088679)를 그대로 쓰고, `git rev-list --count 18088679..HEAD` = 3 으로 실측했다.

## User Setup Required

없음. 배포(deploy-server.sh)와 Job 단위 IAM 은 37-16 · 37-18 몫이다.

## Next Phase Readiness

- 웹(37-10 · 37-12)은 `@gh-radar/shared` 의 `Tick*Response` 타입과 위 오류 코드 셋을 그대로 쓰면 된다. stale 이면 open → convert 를 다시 부른다. `not_uploaded` 이면 `retry_after` 를 표시한다.
- 37-15 는 `app.locals.tickgw` 를 결선하기만 하면 된다. 그러면 `/today` 의 `live` 가 true 가 된다.
- 37-16 은 deploy-server.sh 를 실행한다. `TICK_CONVERT_JOB` 이 가리키는 Job(37-18)이 먼저 있어야 convert 가 502 없이 동작한다. Job 이 없어도 부팅과 다른 경로는 정상이다.

## Self-Check: PASSED

- FOUND: packages/shared/src/tick-api.ts · server/src/schemas/ticks.ts · server/src/services/ticks.ts · server/src/services/tick-convert-trigger.ts · server/src/routes/ticks.ts · server/tests/routes/ticks.test.ts · server/tests/services/tick-convert-trigger.test.ts
- FOUND: 396b862d · 0ff55cf3 · 94d77274 (HEAD 조상)
- 수락 기준 grep 전부 OK
