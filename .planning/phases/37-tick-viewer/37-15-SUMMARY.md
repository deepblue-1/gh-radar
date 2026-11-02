---
phase: 37-tick-viewer
plan: 15
subsystem: api
tags: [express, tickgw, internal-http, gate-cache, cors, cloud-run, deploy-script, tick-viewer]
status: complete

requires:
  - phase: 37-tick-viewer (37-04)
    provides: "RPC tick_access_for_user(p_user_id) → {access} · service_role 전용"
  - phase: 37-tick-viewer (37-07)
    provides: "ticksRouter(/day · /today · /open · /convert) · /today 의 live = app.locals.tickgw 결선 여부 · deploy-server.sh 37-07 env"
  - phase: 37-tick-viewer (37-09)
    provides: "tickgw 내부 계약 GET /internal/ticks/live · X-Tickgw-Secret · X-Tick-* 6종 · 409 {epoch} · port 8092"
provides:
  - "shared tick-api.ts — TickLiveState · TickLiveMeta · TICK_LIVE_HEADERS(37-19 웹이 같은 상수로 헤더를 읽는다)"
  - "server/src/services/tickgw-client.ts — assertTickgwUrl · createTickgwClient · TickgwClient.live · TICKGW_TIMEOUT_MS_DEFAULT"
  - "server/src/services/tick-gate-cache.ts — createTickGateCache · TICK_GATE_TTL_MS_DEFAULT(60초)"
  - "GET /api/ticks/live — 게이트 60초 캐시 → tickgw → 바이트 · X-Tick-* 그대로 · 오류 TICKS_LIVE_UNAVAILABLE(503) · TICKS_LIVE_UNREACHABLE(502)"
  - "AppDeps.tickgw · AppDeps.tickGate · config tickgwUrl · tickgwSecret · env TICKGW_URL · TICKGW_SECRET"
  - "CORS exposedHeaders 에 X-Tick-* 6종"
  - "deploy-server.sh — TICKGW_URL 이 주어질 때만 env · 비밀 TICKGW_SECRET 바인딩 · 필수 키 대조"
affects: [37-16, 37-17, 37-19]

actuals:
  tokens: 14900
  tasks: 2
  commits: 2
plan_head_before: f7c86598f348f21f123d8454f9be7ad0cf553abe
plan_head_after: d19784a0c88ba08214d0b9bb30d56b4acc3fba50

tech-stack:
  added: []
  patterns:
    - "내부 HTTP 중계 — axios responseType arraybuffer · decompress false · Accept-Encoding identity · validateStatus 전부 통과 · 네트워크 실패 status 0(throw 없음)"
    - "게이트 RPC 사용자별 TTL 캐시(true/false 둘 다 · 오류는 캐시 안 함 · 진행 중 RPC 합침)"
    - "배포 스크립트 조건부 결선 — URL 이 있을 때만 --set-env-vars 꼬리 · --update-secrets 꼬리 · REQUIRED_ENV_KEYS += (빈 배열 확장을 피해 macOS bash 3.2 set -u 안전)"

key-files:
  created:
    - server/src/services/tickgw-client.ts
    - server/src/services/tick-gate-cache.ts
    - server/tests/routes/ticks-live.test.ts
    - server/tests/services/tickgw-client.test.ts
  modified:
    - packages/shared/src/tick-api.ts
    - server/src/routes/ticks.ts
    - server/src/schemas/ticks.ts
    - server/src/config.ts
    - server/src/server.ts
    - server/src/app.ts
    - server/src/services/cors-config.ts
    - server/tests/services/cors-config.test.ts
    - scripts/deploy-server.sh

key-decisions:
  - "tickgw 가 200 · 409 밖 응답(401 비밀 불일치 · 503 CACHE_UNAVAILABLE · 400)을 주거나 200 인데 X-Tick-Epoch/Offset-End 가 없으면 502 TICKS_LIVE_UNREACHABLE — 503 은 「미결선(D-22)」 한 뜻으로만 남긴다(웹이 「당일 자료 준비 중」 과 「잠시 뒤 재시도」 를 가른다). 401 은 error 로그 한 줄(비밀 불일치 진단)"
  - "200 응답은 res.send 가 아니라 Content-Length + res.end — 수 MB 본문의 ETag 해시 · 304 분기를 타지 않는다"
  - "assertTickgwUrl 은 http 만(https 거부 — tickgw 는 VPC 평문 http) · 호스트는 WHATWG 정규화 뒤 10.0.0.0/8 dotted-quad 또는 127.0.0.1 · 자격 증명 실린 URL 거부 · 이름(localhost · radar-gw) 거부"
  - "게이트 캐시는 access false 도 60초 캐시한다(매핑 해제 반영은 최대 60초 늦음) — RPC 오류 · 모양 위반만 캐시하지 않고 500 DB_ERROR"
  - "입력 순서: zod 400 → 미결선 503 → 게이트 403 → tickgw — 미결선이면 게이트 RPC 도 0회"

requirements-completed: [D-05, D-07, D-08, D-22]

duration: 6min
completed: 2026-11-02
---

# Phase 37 Plan 15: 당일 경로 server — /api/ticks/live 중계 Summary

**`GET /api/ticks/live` 가 requireAuth → 사용자별 60초 게이트 캐시(RPC `tick_access_for_user`) → 사설 대역 가드된 tickgw 클라이언트(`X-Tickgw-Secret`)를 거쳐 tickgw 의 zstd 프레임 바이트와 X-Tick-* 6종을 풀지도 다시 압축하지도 않고 그대로 넘긴다. CORS 는 X-Tick-* 를 노출하고, deploy-server.sh 는 `TICKGW_URL` 이 주어진 배포에서만 env · 비밀을 결선한다.**

## Performance

- **Duration:** 약 6분
- **Started:** 2026-11-02T11:32:37Z
- **Completed:** 2026-11-02T11:38:17Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- 트레이서: 가짜 tickgw(`node:http` · 127.0.0.1 임의 포트) + **진짜 `createTickgwClient`** 로 끝에서 끝 — 바이트 동일 · 헤더 6종 그대로 · 압축 없음 · no-store.
- 게이트 60초 캐시: 5초 간격 폴링 12회 → RPC 1회 · 61초 뒤 1회 더(주입한 `now` 로 측정).
- CORS `exposedHeaders` 에 X-Tick-* 6종(기존 3종 유지 · 중복 없음).
- deploy-server.sh 조건부 결선(D-22) — 값이 없으면 지금과 같은 배포. 값이 있으면 env · 비밀 · 필수 키 대조가 함께 붙는다.

## 라우트

| 메서드 · 경로 | 게이트 | 왕복 | 응답 |
|---|---|---|---|
| GET `/api/ticks/live?isin&ex&epoch&offset` | requireAuth + `app.locals.tickGate.check`(사용자별 60초 · RPC `tick_access_for_user`) | 캐시 적중이면 Supabase 0회 · tickgw 1회 | 200 `application/octet-stream` = tickgw 바이트 그대로 + X-Tick-* 6종 + `Cache-Control: no-store` |
| GET `/api/ticks/today` | (37-07 그대로) | RPC 1회 | `live` = `app.locals.tickgw` 결선 여부(TICKGW_URL + TICKGW_SECRET 둘 다 있을 때 true) |

입력(zod `TickLiveQuery`): `isin` `^[A-Z0-9]{12}$` · `ex` KRX|NXT · `epoch` 선택 ≤64(빈 값 = 없음) · `offset` 음이 아닌 정수(기본 0). tickgw 와 같은 집합이라 통과한 요청이 tickgw 에서 400 이 될 일이 없다.

## 상태 코드

| 상태 | 코드 | 조건 |
|---|---|---|
| 200 | — | tickgw 200 + `X-Tick-Epoch` · `X-Tick-Offset-End` 있음 → 바이트 · 헤더 그대로(offset 0 의 `loading` · `queued` + `X-Tick-Queue` 도 그대로 — D-05) |
| 400 | `VALIDATION_FAILED` | 입력 형식 위반 — 게이트 · tickgw 0회 |
| 401 | `UNAUTHORIZED` | 미인증 — 게이트 · tickgw 0회 |
| 403 | `DMA_UNMAPPED` | 게이트 캐시가 false — tickgw 0회 |
| 409 | `{ epoch }` | tickgw 409(epoch 다름 · epoch 없이 offset>0 · offset>끝) — 본문의 epoch 를 그대로 |
| 500 | `DB_ERROR` | 게이트 RPC 오류 · 모양 위반(캐시하지 않음 — 다음 요청이 다시 RPC) |
| 502 | `TICKS_LIVE_UNREACHABLE` | tickgw 에 닿지 못함(status 0 · 네트워크 · 20초 타임아웃) · 계약 밖 응답(401 · 503 · 400 · 헤더 빠진 200 · epoch 없는 409) |
| 503 | `TICKS_LIVE_UNAVAILABLE` | `TICKGW_URL`/`TICKGW_SECRET` 미설정(D-22) — 게이트 RPC 0회 |

## 헤더 6종 (`TICK_LIVE_HEADERS` · CORS 노출)

`X-Tick-Epoch` · `X-Tick-Offset-End` · `X-Tick-Last-Recv-Ns`(없으면 빈 문자열 그대로) · `X-Tick-State`(loading|ready|queued|delayed|blocked) · `X-Tick-Queue` · `X-Tick-Complete`("true"/"false" 문자열). server 는 tickgw 가 준 값만 그대로 싣는다(바꾸지 않음).

## 게이트 캐시 RPC 횟수

- 같은 사용자 60초 안 폴링 12회(5초 간격 · 마지막 55초) → `tick_access_for_user` **1회**.
- 61초 뒤 → **1회 더**(총 2회).
- 미결선 503 · 입력 400 · 미인증 401 → **0회**.
- RPC 오류 2회 요청 → 2회(오류는 캐시 안 함).

## env · 배포 스크립트 (수정만 · 실행 안 함)

- server config: `TICKGW_URL` · `TICKGW_SECRET` — 둘 다 있어야 결선. 하나라도 없으면 warn 「TICKGW_URL/TICKGW_SECRET not set — /api/ticks/live 503 (당일 경로 꺼짐 · D-22)」(어느 쪽이 설정됐는지 불리언만 · 값 미출력). URL 이 가드 밖이면 부팅 throw.
- `scripts/deploy-server.sh`:
  - `TICKGW_URL` 이 있으면 먼저 모양 가드(`http://10.x.x.x[:포트]`) → 어긋나면 exit 1.
  - 있을 때만 `--set-env-vars` 꼬리 `@TICKGW_URL=${TICKGW_URL}` · `--update-secrets` 꼬리 `,TICKGW_SECRET=gh-radar-tickgw-secret:latest` · `REQUIRED_ENV_KEYS += (TICKGW_URL TICKGW_SECRET)`. 비밀 바인딩 문자열은 조건 블록 안에만 있다.
  - 끄기 안내 주석: 값 없이 재배포하면 env 는 사라지지만 비밀 바인딩은 병합이라 남는다 → `--remove-secrets=TICKGW_SECRET`.
  - 기존 CORS_ALLOWED_ORIGINS · RELAY_INTERNAL_URL 추출 · 가드 로직은 건드리지 않았다.
- **스크립트 수정만 — 실행은 37-16 · 37-17.** `bash -n` · 가드 정규식 단독 시험(scratchpad 스크립트 · gcloud 미실행)만 했다. `gcloud` · Secret Manager · `docker push` · `git push` 없음.

## Task Commits

1. **Task 1 (tracer): 당일 경로 server 트레이서** — `ec2a0731` (feat)
2. **Task 2: CORS X-Tick-* 노출 · server 당일 env 조건부 배포** — `d19784a0` (feat)

## 테스트

- Task 1 verify: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && vitest run tests/routes/ticks-live.test.ts tests/services/tickgw-client.test.ts tests/routes/ticks.test.ts --maxWorkers=2` → exit 0 · **3 파일 45 테스트 통과**(37-07 `ticks.test.ts` 회귀 0). 트레이서 게이트: 커밋 전 같은 명령을 다시 돌려 통과 확인.
- Task 2 verify: `vitest run tests/services/cors-config.test.ts` 8/8 · `bash -n scripts/deploy-server.sh` OK · grep `TICKGW_URL:-` · `TICKGW_SECRET=gh-radar-tickgw-secret:latest` OK.
- 플랜 verification: `vitest run tests/routes tests/services --maxWorkers=2` → **28 파일 569 테스트 통과**.
- 배포 가드 정규식 단독 시험: `10.178.0.5:8092` · `10.0.0.1` 통과 / `10.256.0.1` · `https://10.1.1.1` · `8.8.8.8` · `10.1.1.1.evil` · `010.1.1.1` 거부 · 빈 배열 + `set -u` 안전(조건부 `+=`).

## Files Created/Modified

- `packages/shared/src/tick-api.ts` — `TickLiveState` · `TickLiveMeta` · `TICK_LIVE_HEADERS`
- `server/src/services/tickgw-client.ts` — 사설 대역 가드 · 비밀 헤더 · 상태 0 규약 · 경로 접두 `/internal/ticks/` 고정 · 로그 위생(경로 · 코드만)
- `server/src/services/tick-gate-cache.ts` — 사용자별 60초 캐시 · 진행 중 RPC 합침 · 만료 항목 정리(1000 이상일 때)
- `server/src/routes/ticks.ts` — `GET /live` · 오류 생성자 `TicksLiveUnavailable` · `TicksLiveUnreachable` · `/today` 주석 갱신
- `server/src/schemas/ticks.ts` — `TickLiveQuery`
- `server/src/config.ts` · `server/src/server.ts` · `server/src/app.ts` — 결선 · compression 필터에 `application/octet-stream` 제외
- `server/src/services/cors-config.ts` · `server/tests/services/cors-config.test.ts` — exposedHeaders 6종
- `server/tests/routes/ticks-live.test.ts` · `server/tests/services/tickgw-client.test.ts` — 새 시험 2 파일
- `scripts/deploy-server.sh` — 조건부 env · 비밀 · 필수 키 · 모양 가드 · 끄기 안내

## Decisions Made

frontmatter key-decisions 참조. 요점: 503 은 미결선 한 뜻 · 나머지 tickgw 이상은 502 · 200 은 `res.end`(ETag 없음) · 가드는 http + 10/8 + 127.0.0.1 · false 도 60초 캐시.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `server/src/schemas/ticks.ts` 에 `TickLiveQuery` 추가**
- **Found during:** Task 1
- **Issue:** 플랜 files 목록에 schemas 파일이 없지만, 라우트의 zod 검사를 37-07 규약(입력 스키마는 `schemas/ticks.ts`)대로 두려면 필요했다.
- **Fix:** `TickLiveQuery`(isin · ex · epoch ≤64 · offset 음이 아닌 정수 기본 0) 추가.
- **Commit:** `ec2a0731`

**2. [Rule 2 - Missing critical] tickgw 계약 밖 응답 처리**
- **Found during:** Task 1
- **Issue:** 플랜은 200 · 409 · status 0 만 정했다. tickgw 는 401(비밀 불일치) · 503 `CACHE_UNAVAILABLE` · 400 도 줄 수 있고(37-09 `server.ts`), 그대로 흘리면 tickgw 내부 오류 본문이 브라우저로 나가거나 503 이 「미결선」 과 섞인다.
- **Fix:** 200 · 409 밖 응답과 헤더 빠진 200 · epoch 없는 409 는 전부 502 `TICKS_LIVE_UNREACHABLE`(cause 에 upstream status 만). 401 은 error 로그 한 줄. 시험 1건이 4종을 단언한다.
- **Commit:** `ec2a0731`

**3. [Rule 2 - Missing critical] 게이트 캐시 동시 요청 합침 · 만료 정리**
- **Found during:** Task 1
- **Issue:** 첫 폴링이 몰리면(여러 탭 · 증분 + 재시도) TTL 캐시만으로는 RPC 가 동시에 여러 번 나간다. 오래 떠 있는 인스턴스에서는 만료 항목이 쌓인다.
- **Fix:** 진행 중 Promise 를 사용자별로 공유한다. 항목이 1000개 이상이면 저장할 때 만료 항목을 지운다.
- **Commit:** `ec2a0731`

**참고(플랜 문구와의 차이 · 결과 동일):** 플랜은 `res.type("application/octet-stream")` 을 적었는데, 실제로는 `setHeader("Content-Type", …)` + `Content-Length` + `res.end` 로 했다. `res.send` 를 쓰면 ETag 해시와 304 분기를 타기 때문이다. 압축 제외는 app.ts 필터에서 하고, 시험으로 `content-encoding` 이 없는 것을 확인했다. 참고로 mime-db 기준 `application/octet-stream` 은 원래 압축 대상이 아니어서 필터는 이중 방어다. 그래서 「압축 안 됨」 시험이 필터 하나만을 증명하지는 않는다.

## Issues Encountered

- 이 실행 환경은 `git` 이름이 들어간 복합 셸 명령과 heredoc 을 막는다. 그래서 커밋 원장 파일(`gsd-plan-head-before-37-15`)은 만들지 않았다. 기준점은 지시된 base `f7c86598` 그대로 쓰고, `git rev-list --count f7c86598..HEAD` = 2 로 직접 쟀다.

## User Setup Required

없음. 당일 경로를 실제로 켜는 일은 37-17 에서 한다(119 인덱서 배포 확인 → tickgw 배포 → `TICKGW_URL=http://<radar-gw 내부 IP>:8092 bash scripts/deploy-server.sh`).

## Next Phase Readiness

- **37-19(웹):** `TICK_LIVE_HEADERS` 로 헤더를 읽는다. 409 `{epoch}` 를 받으면 offset 0 부터 다시 읽고, 503 `TICKS_LIVE_UNAVAILABLE` 이면 「당일 자료 준비 중」 카드를, 502 면 다음 폴링에서 재시도한다. 레이트 리밋은 `/api` 전체가 IP 당 분당 200회라 폴링 간격을 설계할 때 같이 봐야 한다.
- **37-16:** deploy-server.sh 를 `TICKGW_URL` 없이 실행하면 지금과 같은 배포다(「당일 틱 경로 꺼짐」 한 줄이 추가로 출력된다).
- **37-17:** 위 명령으로 켠다. server 런타임 SA 의 accessor 는 setup-tickgw-iam.sh(37-09)가 이미 준다.

## Self-Check: PASSED

- FOUND: server/src/services/tickgw-client.ts · server/src/services/tick-gate-cache.ts · server/tests/routes/ticks-live.test.ts · server/tests/services/tickgw-client.test.ts
- FOUND: ec2a0731 · d19784a0 (HEAD 조상)
- acceptance grep: TICKS_LIVE_UNAVAILABLE · TICKS_LIVE_UNREACHABLE(routes/ticks.ts) · tick_access_for_user(tick-gate-cache.ts) · X-Tickgw-Secret(tickgw-client.ts) · TICK_LIVE_HEADERS(tick-api.ts · cors-config.ts) 모두 있음
