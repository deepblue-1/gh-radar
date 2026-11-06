---
phase: 40-fill-push-notification
plan: 07
subsystem: server
status: complete
tags: [server, express, zod, push, api, sc-4]
requires:
  - "40-01 RPC dma_push_device_upsert · dma_push_devices_for_user · dma_push_device_disable · dma_push_device_delete"
  - "40-02 shared PushDevice · PushDeviceRegisterBody"
provides:
  - "/api/push-devices — GET / · PUT /:deviceKey · PATCH /:deviceKey · DELETE /:deviceKey (pushDevicesRouter)"
  - "zod PushDeviceKeyParam · PushDeviceRegisterBodySchema · PushDevicePatchBody"
  - "services listPushDevices · registerPushDevice · disablePushDevice · deletePushDevice"
affects: [40-10, 40-12]
tech-stack:
  added: []
  patterns:
    - "RPC 원소를 shared 공개 키만 골라 옮기는 매퍼(toPushDevice) — DB 가 키를 더 실어도 응답으로 새지 않음"
    - "boolean 소유권 RPC → false 면 NotFound(남의 · 없는 키를 구분하지 않음)"
key-files:
  created:
    - server/src/schemas/push-devices.ts
    - server/src/services/push-devices.ts
    - server/src/routes/push-devices.ts
    - server/tests/routes/push-devices.test.ts
    - .planning/phases/40-fill-push-notification/tdd-evidence/40-07-task2-red.json
  modified:
    - server/src/app.ts
decisions:
  - "응답 원소는 RPC 반환을 그대로 넘기지 않고 PushDevice 6키만 옮긴다 — 모양이 어긋난 원소는 500(빈 값으로 감추지 않음)"
  - "PUT body 는 .strict() — body 에 user_id 같은 모르는 키가 오면 무시가 아니라 400"
  - "DB 오류의 로그 원인(cause)은 PostgREST 메시지에서 등록 토큰 문자열을 [token] 으로 가린 뒤 남긴다(T-19-14)"
  - "404 는 기존 NotFound()(code NOT_FOUND) 그대로 — 남의 키와 없는 키를 구분하지 않는다"
metrics:
  duration: "약 20분"
  completed: 2026-11-07
estimate:
  tokens: 55000
  tasks: 2
actuals:
  tokens: 6300
  tasks: 2
  commits: 3
plan_head_before: 43ae0da89cf3a70bdf08391d636febece7346ff2
plan_head_after: f5341af30a86cbaa4a486ea571029ad52e57e753
requirements-completed: [SC-1, SC-4]
---

# Phase 40 Plan 07: server 기기 API `/api/push-devices` Summary

앱의 「이 기기 체결 알림 켜기」(PUT)와 웹의 기기 목록 · 끄기 · 지우기(GET · PATCH · DELETE)를 `requireAuth` 뒤에서 40-01 RPC 4개로 잇는 라우트. RPC 에는 언제나 `req.userId` 하나만 넘기고, 남의 · 없는 키는 404, 형식 위반은 400, 응답 · 로그에는 토큰이 없다.

## API 계약(40-10 webapp 이 소비)

| 메서드 · 경로 | body | 응답 |
|---|---|---|
| `GET /api/push-devices` | — | `PushDevice[]`(bare array) |
| `PUT /api/push-devices/:deviceKey` | `{ platform: 'ios'\|'android', token, label }`(strict) | `PushDevice`(enabled = true) |
| `PATCH /api/push-devices/:deviceKey` | `{ enabled: false }` 만(strict) | `{ ok: true }` · 없으면 404 |
| `DELETE /api/push-devices/:deviceKey` | — | `{ ok: true }` · 없으면 404 |

- 미인증 401(`UNAUTHENTICATED`) · 형식 위반 400(`VALIDATION_FAILED`) · 남의 · 없는 키 404(`NOT_FOUND`) · RPC 오류 · 모양 위반 500(`DB_ERROR`).
- deviceKey = 소문자 UUID · token = `^[A-Za-z0-9:_\-.]{16,4096}$` · label = 제어 문자 제거 → trim → 80자(입력 상한 200자).

## Tasks

| Task | 이름 | 커밋 | 파일 |
|---|---|---|---|
| 1 (tracer) | PUT 한 길 + app.ts 결선 + 테스트 6건 | `cd6f9be6` | schemas · services · routes · app.ts · 테스트 |
| 2 RED | 목록 · 끄기 · 지우기 · 404 · 400 · 401 행렬 15건 | `0aaff556` | 테스트 · RED 증거 |
| 2 GREEN | 서비스 3개 · 라우트 3개 | `f5341af3` | services · routes |

Tracer 게이트: 자동 모드 아님 · `end-of-phase` + 자동 verify → 커밋 뒤 재실행 PASS 확인 후 확장.

## 검증

- `pnpm --filter @gh-radar/server run typecheck` — `error TS` 0.
- `vitest run tests/routes/push-devices.test.ts tests/routes/strategy-events.test.ts --maxWorkers=2` — 29/29 통과(5회 반복 모두 통과).
- 플랜 verification `vitest run tests/routes --maxWorkers=2` — 27 파일 601 테스트 중 600 통과. 남은 1건 `admin.test.ts > 로그 위생` 은 TAP 출력을 깨끗하게 받으려고 `LOG_LEVEL=silent` 로 돌린 탓이다(로그를 캡처해 검사하는 테스트). 기본 로그로 그 파일만 다시 돌려 39/39 통과.
- 수용 기준 grep: `app.use("/api/push-devices", pushDevicesRouter)` 1 · `requireAuth()` 2 · `logger.*token` 0 · `pushDevicesRouter.(get|put|patch|delete)(` 4 · `z.literal(false)` 1.

## TDD Gate Compliance

- **RED** `0aaff556` — `LOG_LEVEL=silent pnpm --filter @gh-radar/server exec vitest run tests/routes/push-devices.test.ts --maxWorkers=2 --reporter=tap-flat` · exit 1 · 21 중 13 실패 · 대상 `PATCH … ② {enabled:false} · RPC true → 200 {ok:true}` 가 `expected 404 to be 200` 으로 실패 · 분류기 `RED_EVIDENCE_OK`(`target_test_failed`). 증거 `.planning/phases/40-fill-push-notification/tdd-evidence/40-07-task2-red.json`.
  - semanticAssessment: 대상 테스트가 실제로 실행돼 계획한 단언(200)에서 404 로 실패 — PATCH 라우트 부재로 notFoundHandler 가 응답한 것이 원인. import · 구문 · 픽스처 오류 없음. 통과 8개는 Task 1 이 이미 구현한 PUT 경로 몫. TAP 앞의 pino 진단 1줄 · pnpm 꼬리 줄은 기록의 `consoleOther` 에 따로 보존.
- **GREEN** `f5341af3` — 21/21 통과.
- **REFACTOR** — 없음.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 보안] 응답 원소를 공개 키 6개로 골라 옮긴다**
- **Found during:** Task 1
- **Issue:** 계획은 「응답은 RPC 공개 원소 그대로」. RPC 가 지금은 token 을 싣지 않지만, 그대로 넘기면 나중에 RPC 가 키를 더 실을 때 응답으로 샌다.
- **Fix:** `toPushDevice` 가 `deviceKey · platform · label · enabled · lastSeenAt · createdAt` 만 옮기고 모양이 어긋나면 500. 테스트가 RPC 원소에 `token` 을 섞어 넣고 응답에서 빠지는지 잠근다.
- **Files modified:** server/src/services/push-devices.ts
- **Commit:** `cd6f9be6`

**2. [Rule 2 - 보안] DB 오류 로그 원인에서 토큰을 가린다**
- **Found during:** Task 1
- **Issue:** errorHandler 는 `cause`(PostgREST `{code, message}`)를 warn 로그에 남긴다. 메시지에 값이 섞이면 토큰이 로그로 샌다(T-19-14).
- **Fix:** `registerPushDevice` 가 메시지에서 등록 토큰 문자열을 `[token]` 으로 바꾼 뒤 cause 로 넘긴다.
- **Files modified:** server/src/services/push-devices.ts
- **Commit:** `cd6f9be6`

### 계획보다 넓힌 테스트

- PUT: label 제어 문자 제거 · 80자 자름 · 4097자 토큰 · label 누락 · FCM 꼴 토큰 통과 · 500 응답에 토큰 없음 · 400 메시지에 토큰 없음.
- GET: 원소 모양 위반 500. PATCH: 문자열 `"false"` · 다른 키 400 · boolean 아님 500.

### 참고 — 재현되지 않은 단발 실패 1건

Task 2 GREEN 직후 첫 묶음 실행에서 `PATCH ⑤ RPC 가 boolean 이 아니면 500` 이 한 번 실패했다(상세 출력을 걸러 버려 원인 미확인). 같은 명령을 6번 다시 돌려 모두 통과했고, 그 경로는 mock 이 고정값(`data: null`)을 주는 결정적 경로다. 같은 Mac 에서 executor 3개가 동시에 돌던 시점의 소켓 · 부하 문제로 추정한다 — 다시 보이면 원인을 확인해야 한다.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: server/src/schemas/push-devices.ts · server/src/services/push-devices.ts · server/src/routes/push-devices.ts · server/tests/routes/push-devices.test.ts · tdd-evidence/40-07-task2-red.json
- FOUND: cd6f9be6 · 0aaff556 · f5341af3 (HEAD 조상)
