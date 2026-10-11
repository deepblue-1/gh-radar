---
phase: 29-dma-multi-server-admin
plan: 48
subsystem: relay
tags: [relay, admin, gap-closure, gc-10, gc-15, deadline, reload, ops-sql, tdd]
requires:
  - phase: 29-32
    provides: "WR-07 요청 마감 — deadlineOf · ADMIN_REQUEST_DEADLINE_MS(10초) · dispatcher 마감 접기"
  - phase: 29-37
    provides: "변경 라우트 끝 지정 재적재(reloadOrderServers · AccountOrderServers.reload 꼬리 의미)"
  - phase: 29-41
    provides: "런북 정정 문장 — CLI v2.75 에 SQL 원격 실행 하위 명령 없음 · 대시보드 SQL 편집기 / REST Prefer: count=exact"
provides:
  - "relay admin-api awaitWithinDeadline(work, deadlineAt, route, what) — 남은 마감까지만 기다리고 지면 warn 1줄 + 응답 먼저 · 재적재는 취소 없이 뒤에서 끝까지 · 거부는 잡아 warn"
  - "PUT accounts · DELETE account · PUT order-server · DELETE user(접근 맵 + 지정 — 같은 deadlineAt 공유)의 재적재 대기에 마감 상한"
  - "PUT order-server 도 핸들러 첫 줄 deadlineOf() 마감"
  - "supabase/ops/29-orphan-dma-users.sql 머리 실행 안내 = 대시보드 SQL 편집기 또는 REST Prefer: count=exact"
affects: [ADMIN-05, ADMIN-08, ADMIN-03, 29-VERIFICATION-R3]
actuals:
  tokens: 5100
  tasks: 2
  commits: 3
plan_head_before: ef549d0d51b015a28a7cf390243b51b14cba05ef
plan_head_after: a5519ea07ca804806b0bbe54a8804d2f14c2c3ae
tech-stack:
  added: []
  patterns:
    - "응답 경로의 부수 재적재는 `awaitWithinDeadline` 으로 — 남은 마감까지만 기다리고, 지면 응답 먼저 · 일은 취소하지 않는다(거부는 도우미가 잡는다)"
    - "같은 요청의 연속 대기는 같은 deadlineAt 을 넘겨 남은 시간을 나눠 쓴다(합이 마감을 넘지 않는다)"
key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-48-task1-red.json
  modified:
    - relay/src/admin/admin-api.ts
    - relay/tests/admin-api.test.ts
    - supabase/ops/29-orphan-dma-users.sql
key-decisions:
  - "29-48: GC-10 은 fire-and-forget 이 아니라 남은 마감(deadlineAt − now)까지 Promise.race — 빠른 DB(평상시)는 종전처럼 응답 전에 재적재가 끝나 「응답 뒤 첫 주문이 새 지정으로」(29-37)가 유지되고, 느린 DB 만 응답이 먼저다"
  - "29-48: DELETE user 의 접근 맵 재적재 거부는 이제 500 이 아니라 warn 1줄 + 200 — 유저 삭제는 이미 DB · 서버에 반영됐고 60초 주기가 잡는다(「반영됐는데 실패 화면」 제거와 같은 규율)"
  - "29-48: 마감 warn 은 route · what(order-servers | access)만 싣는다 — DMA id 없음"
patterns-established:
  - "admin 변경 라우트: dispatcher 마감 접기 → awaitWithinDeadline(재적재) → 200 — Express 15초 상한 안에서 끝난다"
requirements-completed: [ADMIN-05, ADMIN-08, ADMIN-03]
coverage:
  - id: D1
    description: "GC-10 트레이서 — PUT accounts 의 지정 재적재가 무응답이어도 마감(주입 300ms) 안에 200 + 서버별 결과 배열 · 마감 warn 1줄(식별자 없음) · 재적재는 취소되지 않고 늦은 결과도 처리된다"
    requirement: "ADMIN-05"
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#G1 GC-10 무응답 재적재 → 마감 안 200 + 결과 배열 · 마감 warn 1줄 · 재적재는 뒤에서 끝까지"
        status: pass
    human_judgment: false
  - id: D2
    description: "빠른 재적재(50ms)는 종전처럼 응답 전에 끝난다 — 29-37 「응답 뒤 첫 주문이 새 지정으로」 유지 · 29-37 R1~R4 · O1~O5 무수정 green"
    requirement: "ADMIN-08"
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#G2 GC-10 빠른 재적재(50ms) → 응답 전 완료(종전 순서) · 마감 warn 0"
        status: pass
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#R1 계좌 put 으로 지정 서버 KB121 이 빠지면 DB 가 지정을 지우고 → 응답 전에 지정 재적재 1회"
        status: pass
    human_judgment: false
  - id: D3
    description: "DELETE user — 접근 맵 + 지정 재적재 둘 다 무응답이어도 마감 안 200 { deleted: true } · 두 대기가 남은 마감 공유 · 거부(즉시 · 마감 뒤)도 200 + warn · 미처리 거부 0"
    requirement: "ADMIN-03"
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#G3 GC-10 DELETE user — access + 지정 재적재 둘 다 무응답 → 마감 안 200 { deleted: true } · 남은 마감 공유 · warn 2줄"
        status: pass
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#G5 GC-10 재적재 거부 — 즉시(지정) · 마감 뒤(접근 맵) 둘 다 응답 200 · warn · 미처리 거부 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "PUT order-server — 지정 재적재 무응답이어도 마감 안 200 { ok, orderServer } (핸들러 첫 줄 deadlineOf)"
    requirement: "ADMIN-08"
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#G4 GC-10 PUT order-server — 지정 재적재 무응답 → 마감 안 200 { ok, orderServer }"
        status: pass
    human_judgment: false
  - id: D5
    description: "29-32 마감 describe(M1 · M2) 무수정 green · relay 전체 스위트 green"
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#M1 변경 라우트 6개 — deadlineAt = 도착 시각 + 10_000 을 dispatcher 에 넘긴다"
        status: pass
      - kind: other
        ref: "pnpm exec vitest run --maxWorkers=2 (cwd relay) — 57 files · 1430 tests passed"
        status: pass
    human_judgment: false
  - id: D6
    description: "GC-15 — 고아 점검 SQL 머리가 대시보드 SQL 편집기 / REST Prefer: count=exact 만 안내 · 없는 CLI 하위 명령 0회 · d1c30b07 대비 바뀐 줄 전부 주석"
    verification:
      - kind: other
        ref: "Task 2 <automated> grep + git diff d1c30b07 주석 줄 검사 → OK"
        status: pass
    human_judgment: false
duration: 3min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 48: 재적재 대기 마감 상한 (GC-10) · 고아 점검 SQL 머리 정정 (GC-15) Summary

**admin 변경 라우트의 지정 · 접근 맵 재적재 대기를 `awaitWithinDeadline` 으로 남은 마감까지만 기다리게 해, DB 가 느려도 relay 는 10초 마감 안에 실제 결과로 200 을 내고(Express 15초 502 없음) 재적재는 취소 없이 뒤에서 끝난다. 고아 점검 SQL 머리는 존재하는 실행 수단만 안내한다.**

## Performance

- **Duration:** 3 min(기록 시작 00:42:31Z 기준 — 사전 읽기 제외)
- **Started:** 2026-10-11T00:42:31Z
- **Completed:** 2026-10-11T00:45:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `awaitWithinDeadline(work, deadlineAt, route, what)` — `work` 에 거부 처리(warn)를 먼저 달고 `max(0, deadlineAt − now)` 타이머와 경주한다. 타이머가 이기면 warn 1줄 「재적재 대기 마감 — 응답 먼저, 재적재는 뒤에서 계속」(route · what)을 남기고 돌아가며, 이긴 쪽과 무관하게 타이머를 정리한다. 시각은 `deps.now ?? Date.now`.
- 적용 자리 5곳: PUT accounts · DELETE account · PUT order-server(핸들러 첫 줄 `deadlineAt = deadlineOf()` 신설) · DELETE user 의 `access.reload`(what `access`)와 지정 재적재 — 유저 삭제는 같은 `deadlineAt` 을 넘겨 두 대기가 남은 시간을 나눠 쓴다.
- 평상시(빠른 DB)는 종전 순서 그대로다. 재적재가 응답 전에 끝나 29-37 의 「응답 뒤 첫 주문이 새 지정으로」가 유지된다. 느린 DB 에서만 응답이 먼저 나가고, 라우팅은 그 재적재와 60초 주기가 따라잡는다.
- 마감 · Express 타임아웃 값은 바꾸지 않았다(`ADMIN_REQUEST_DEADLINE_MS` 10초 · `RELAY_ADMIN_TIMEOUT_MS` 15초).
- GC-15: `supabase/ops/29-orphan-dma-users.sql` 의 「실행 위치」 문단을 「메인 세션 또는 사람이 대시보드 SQL 편집기 · 수만 필요하면 REST(`Prefer: count=exact` · 서비스 키 · 읽기 전용) · executor 는 원격 실행 안 함」으로 고쳤다. SELECT 본문 · 해석 문단은 무변경이다.

## TDD — RED / GREEN

- **RED** (`c8b70916`): describe 「재적재 대기 상한 (29-48 GC-10)」 G1~G5. 무응답 재적재는 `within(fetch, 마감+200ms)` 경주로 판정한다. 구현이 무한 대기여도 테스트가 타임아웃이 아니라 단언(`res` not null)에서 실패한다.
  - 결과: G1 · G3 · G4 · G5 가 「마감 안 응답 — 50xms: expected null not to be null」로 실패했다. G2(종전 순서 회귀 가드)는 의도대로 green 이다.
  - 증거: `.red/29-48-task1-red.json`(vitest `tap-flat` · 대상 G1)을 `gsd-tools check tdd-red-evidence` 에 넣어 **RED_EVIDENCE_OK**(`target_test_failed`)를 받았다.
  - 의미 평가: 계획한 단언에서 실패했다. 수집 · 픽스처 · 구문 오류는 없다.
- **GREEN** (`198afe34`): `awaitWithinDeadline` 을 넣고 4개 라우트에 적용했다. plan verify(shared build · relay typecheck · typecheck:tests · admin-api 47 tests)가 green 이다.
- **REFACTOR**: 없음.
- **Tracer gate**: interactive · end-of-phase · `<automated>` 만 있는 경우라 verify 를 다시 돌렸고 green 이었다. 그대로 Task 2 로 진행했다.

## Task Commits

1. **Task 1 RED: GC-10 실패 테스트** — `c8b70916` (test)
2. **Task 1 GREEN: 재적재 대기를 남은 마감으로** — `198afe34` (fix)
3. **Task 2: 고아 점검 SQL 머리 정정 (GC-15)** — `a5519ea0` (docs)

## Files Created/Modified

- `relay/src/admin/admin-api.ts` — `awaitWithinDeadline` 도우미 · 4개 라우트 적용 · PUT order-server 마감 · 머리 29-32 마감 문단에 GC-10 줄 · `reloadOrderServers` · deps 주석 갱신
- `relay/tests/admin-api.test.ts` — describe 「재적재 대기 상한 (29-48 GC-10)」 G1~G5. 무응답 대역은 afterEach 에서 풀어 열린 핸들을 남기지 않는다. `unhandledRejection` 수집이 0 이어야 한다.
- `supabase/ops/29-orphan-dma-users.sql` — 머리 실행 안내(주석 3줄)만 바꿨다.
- `.planning/phases/29-dma-multi-server-admin/.red/29-48-task1-red.json` — RED 증거(무시되는 디렉터리 — 커밋 대상 아님)

## Decisions Made

- 남은 마감까지 경주하는 방식을 골랐다(플래너 재량, 결정 9 의 두 선택지 중 하나). fire-and-forget 이면 평상시에도 응답이 재적재보다 먼저 나가 29-37 의 즉시성이 약해진다.
- DELETE user 의 `access.reload` 거부 동작이 바뀌었다. 종전에는 거부가 그대로 throw 돼 500 이 났다. 이제는 도우미가 잡아 warn 1줄 + 200 이다. 삭제는 이미 반영됐으니 실패 화면은 「반영됐는데 실패」의 또 다른 형태이고, 60초 주기가 접근 맵을 따라잡는다. 이 경로를 단언하는 기존 테스트는 없었다(S2 의 `/access/reload` 502 는 별도 라우트로 무변경).

## Deviations from Plan

None - plan executed exactly as written.

(커밋 접두사: 계획 예시대로 GREEN 을 `fix(29-48)` 로 했다. 29-47 등 이 phase 의 갭 클로징 관례와 같다. RED `test(29-48)` → GREEN 순서는 지켰다.)

## Issues Encountered

- 첫 RED 기록에 vitest 앞에 찍힌 pino 로그 줄이 섞여 분류기가 `invalid_record`(Unsupported report format)를 냈다. `TAP version 13` 앞부분을 잘라내고(29-47 관례와 같음) 다시 넣어 RED_EVIDENCE_OK 를 받았다.

## User Setup Required

None - 배포 없음(코드 · 테스트 · 주석). relay 반영은 다음 relay 배포 창에서 메인 세션이 한다.

## Next Phase Readiness

- GC-10 · GC-15 는 fixed 다. relay 이미지 배포 전까지 운영 relay 는 종전 동작(상한 없는 재적재 대기)이다.
- 고아 점검 SQL 실행 자체(29-41 「남은 것」 1)는 여전히 메인 세션 · 사람 몫이다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*

## Self-Check: PASSED
