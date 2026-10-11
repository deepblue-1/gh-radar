---
phase: 29-dma-multi-server-admin
plan: 08
subsystem: relay
tags: [relay, admin, role2, dma, state-machine, healthz, fake-gateway]
status: complete

requires:
  - phase: 29-02
    provides: "buildObserverLoginReq role 2 · buildAdminCommandReq · parseAdminCommandResp · parseAdminUsersSnapshot · admin/types.ts · 스텁 게이트웨이 admin 모드(respondAdminLogin · onAdminCommand · defaultAdminHandler · pushAdminSnapshot)"
  - phase: 29-03
    provides: "ServerPipelines(서버당 파이프라인 · secretOf(broker) · sync/retire/stopAll) · order-api deps 함수형(journalGateways · brokers 본문 전용 규율)"
  - phase: 29-06
    provides: "index 결선 현재 형태(AppAccess · pipelines.onCreated)"
provides:
  - "AdminConn(start · stop · command · currentSnapshot · health · state · enabled · serverKey · 이벤트 snapshot/state)"
  - "ADMIN_CLIENT_NAME = gh-radar-relay/admin · ADMIN_COMMAND_TIMEOUT_MS = 5_000 · ADMIN_SNAPSHOT_WAIT_MS = 1_000 · ADMIN_REJECTED_RETRY_MS 5분 · ADMIN_REJECTED_RETRY_MAX 12"
  - "AdminCommandOutcome = result(+snapshot) | timeout | offline · AdminConnHealth · AdminSnapshotEvent { serverKey, snapshot }"
  - "ServerPipeline.admin: AdminConn — 저널 관찰자와 같은 생성 · 정지(서버당 1개)"
  - "healthz 본문 adminConns.<서버 키> = { state, usersRev }(본문 전용 · OrderApiDeps.adminConns · AdminConnHealthBody)"
affects: [29-11, 29-14, 29-25]

actuals:
  tokens: 21000
  tasks: 2
  commits: 3
plan_head_before: 3081092b90c28f5c21915018e4bfafe4f692936a
plan_head_after: a18a8ce87114c6c33b7767e8821c215a936a2dbc

tech-stack:
  added: []
  patterns:
    - "관찰자 상태기계 파생 복사(quote/feed.ts → admin/admin-conn.ts) — 저널 관찰자에 role 분기 없음"
    - "연결 세대에 묶인 캐시 — users_rev 대신 transport.generation 으로 신선도 판정, 세대가 바뀌면 새 87 전까지 null"
    - "서버당 1건 비행 FIFO + ulong 단조 request_id + 응답 타이머 — 87 에 request_id 가 없어 순서로 짝짓기"

key-files:
  created:
    - relay/src/admin/admin-conn.ts
    - relay/tests/admin-conn.test.ts
    - .planning/phases/29-dma-multi-server-admin/.red/29-08-task2-red.json
  modified:
    - relay/src/registry/pipelines.ts
    - relay/src/index.ts
    - relay/src/order/order-api.ts
    - relay/tests/pipelines.test.ts
    - relay/tests/order-api.test.ts
    - relay/tests/journal-boot.test.ts

key-decisions:
  - "request_id 는 접속 때 op 5 와 명령이 한 카운터를 공유한다(연결 세대와 무관한 단조 ulong). 첫 접속이면 op 5 = 1n, 명령 = 2n, 3n …"
  - "87 대기 판정은 같은 세대의 직전 rev(86 · 87 이 갱신)와 비교한다 — 세대가 다르거나 모르면(null) ok 86 은 변경으로 보고 1초까지 87 을 기다린다"
  - "87 대기 상한(1초) 초과 → op 5 1건을 다시 보내 캐시를 맞추고, 그 명령은 snapshot 없는 result 로 푼다(op 5 의 87 은 요청 없는 87 경로로 캐시를 갱신)"
  - "87 을 기다리는 중 끊기면 offline 이 아니라 snapshot 없는 result — 86 ok 로 변경은 이미 서버에 반영됐다. 86 대기 중 끊김 · 대기열은 offline"
  - "command(op 5) 는 86 이 없으므로 87 을 응답으로 보고 result 를 합성한다(code 0 · message 빈 문자열 · 그 87 의 rev)"
  - "admin 79 의 broker 가 레지스트리 행 증권사와 다르면(빈 값 · MOCK 제외) rejected 로 영구 정지(재시도 없음) — 다른 증권사 서버 users.toml 을 고치지 않는다"
  - "healthz adminConns 는 본문 전용 — admin 연결이 죽어도 시세 · 주문 · 저널은 멀쩡하므로 503 축에 넣지 않는다. 값은 state 와 usersRev(문자열)뿐"

patterns-established:
  - "admin 관리 경로 = AdminConn.command() / snapshot 이벤트 → Express HTTP(29-11) · DB 적재(29-14). 86/87 은 사용자 세션 · wss 로 흐르지 않는다(D-07)"

requirements-completed: [ADMIN-04, ADMIN-05]

coverage:
  - id: D1
    description: "트레이서 — enabled 서버 → admin 연결 role 2 → 79 → op 5 → 87 → 서버별 스냅샷 캐시 · 비밀 없음 disabled · 재접속 세대 무효화(rev 1 로 돌아가도 갱신)"
    requirement: ADMIN-04
    verification:
      - kind: integration
        ref: "relay/tests/admin-conn.test.ts#A1 · A2 · A3"
        status: pass
    human_judgment: false
  - id: D2
    description: "ServerPipelines — 서버당 admin 연결 정확히 1개 · 저널 관찰자와 별개 소켓 · 증권사별 비밀 · 서버를 끄면 admin 도 stop · 비밀 없는 증권사 admin disabled"
    requirement: ADMIN-04
    verification:
      - kind: integration
        ref: "relay/tests/pipelines.test.ts#⑥ · ⑦"
        status: pass
    human_judgment: false
  - id: D3
    description: "명령 상관 — 서버당 1건 비행 · request_id 단조 · 86→87 짝 · 무변경 · BUSY 원문 · 타임아웃 · 늦은 86 warn · offline · 요청 없는 87 · 87 미도착 보정 · op 5 명령"
    requirement: ADMIN-05
    verification:
      - kind: integration
        ref: "relay/tests/admin-conn.test.ts#B1 · B2 · B3 · B4 · B5 · B8 · B9"
        status: pass
    human_judgment: false
  - id: D4
    description: "관찰자 규율 — 79 거부 rejected + 유한 재시도 12회 · role_mismatch 영구 정지 · health()"
    requirement: ADMIN-05
    verification:
      - kind: integration
        ref: "relay/tests/admin-conn.test.ts#B6a · B6b · B7"
        status: pass
    human_judgment: false
  - id: D5
    description: "healthz 본문 adminConns.<서버 키> = { state, usersRev } · 503 판정 불변 · 식별자 없음 · 부팅 결선"
    requirement: ADMIN-05
    verification:
      - kind: unit
        ref: "relay/tests/order-api.test.ts#Phase 29-08 adminConns"
        status: pass
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#M1"
        status: pass
    human_judgment: false
  - id: D6
    description: "86/87 을 사용자 세션 · 브라우저로 흘리지 않는다(D-07) — AdminConn 은 snapshot 이벤트 · command() 결과로만 내보내고 fanout/hub 결선이 없다"
    requirement: ADMIN-05
    human_judgment: true
    rationale: "부재 증명이라 테스트 단언이 아니라 코드 판단(prohibition verification: judgment) — 29-11 결선 리뷰에서 다시 본다"

duration: 13min
completed: 2026-10-07
---

# Phase 29 Plan 08: 서버별 admin 연결(role 2) Summary

**`AdminConn` — 서버마다 role 2 관리 연결 하나가 접속 때마다 op 5 로 users.toml 전체를 받아 연결 세대에 묶어 캐시하고, `command()` 는 서버당 1건 비행 · ulong 단조 request_id · 5초 타임아웃 · 86→87 짝으로 결과를 `result | timeout | offline` 세 갈래로만 돌려준다. healthz 본문에 `adminConns.<서버 키>` 를 싣는다(503 축 아님).**

## Performance

- **Duration:** 약 13분
- **Started:** 2026-10-06T16:02:23Z
- **Completed:** 2026-10-07 (KST)
- **Tasks:** 2 (트레이서 1 + TDD 1)
- **Files modified:** 9 (신규 3 · 수정 6)

## Accomplishments

- `relay/src/admin/admin-conn.ts` 신규 — quote/feed.ts 상태기계를 파생 복사(role 2 · client `gh-radar-relay/admin`). ready 진입 즉시 op 5 → 87 → 캐시 + `snapshot` 이벤트. 세대가 바뀌면 새 87 전까지 `currentSnapshot()` = null.
- `ServerPipelines` 가 서버마다 admin 연결을 정확히 하나 만들고 저널 관찰자와 같이 start/stop(sync 제거 · stopAll · closeAll).
- `command()` — FIFO 1건 비행, 86 request_id 대조, 5초 타임아웃, 변경 86 뒤 1초 87 대기 · 미도착 시 op 5 보정, 끊김/정지 시 offline, 감사 로그 1줄.
- healthz `adminConns` 결선(index → `pipelines.all().map(p => p.admin.health())`), 부팅 로그 서버 목록에 admin 여부.

## 상태기계

| 현재 | 사건 | 다음 | 비고 |
|---|---|---|---|
| disabled | start · 비밀 없음 | disabled | 소켓 0 |
| disabled | start · 비밀 있음 | connecting | DmaClient connect |
| connecting | up | logging_in | ObserverLoginReq(5) role 2 · client admin · 로그인 타이머 |
| logging_in | 79 ok · role 2 · broker 일치(또는 빈 값 · MOCK) | ready | 재접속 카운터 리셋 → **op 5 송신** |
| logging_in | 79 거부 | rejected ■ | 5분 × 12 유한 재시도 → connecting |
| logging_in | 79 ok · role ≠ 2 | role_mismatch ■ | 영구 정지 · 재시도 없음 |
| logging_in | 79 ok · broker 불일치 | rejected ■ | 영구 정지 · 재시도 없음(Pitfall 12) |
| logging_in | 응답 타임아웃 | connecting | dropTransport → 백오프 재접속 |
| ready / logging_in | down | connecting | 스냅샷 무효 · 비행/대기 명령 offline |
| 아무 상태 | stop | (정지) | 타이머 · 리스너 해제 · 비행/대기 offline |

LivePing 은 DmaClient 30초 핑 그대로(게이트웨이 유휴 스윕 90초 안).

## 87 대기 규칙

| 86 | 같은 세대 직전 rev 대비 | 동작 | 결과 |
|---|---|---|---|
| ok · code 0 | 다름(또는 모름) | 87 을 `ADMIN_SNAPSHOT_WAIT_MS`(1초)까지 대기 | `{ result, snapshot }` |
| ok · code 0 | 같음(무변경) | 기다리지 않음 | `{ result }` |
| ok false(BUSY 9 등) | — | 기다리지 않음(87 없음) | `{ result }` · message 원문 |
| 변경 86 뒤 1초 내 87 없음 | — | op 5 1건 재송신 | `{ result }`(보정 87 은 캐시만 갱신) |
| 87 대기 중 끊김 | — | — | `{ result }`(변경은 반영됨) |
| 86 미도착 5초 | — | 다음 명령 진행 · 늦은 86 은 warn 후 버림 | `{ timeout }` |
| ready 아님 · 86 대기 중 끊김 · 대기열 | — | — | `{ offline }` |
| op 5 명령 | — | 87 이 응답 | 합성 result(code 0 · 87 rev) + snapshot |
| 요청 없는 87 | — | 캐시 교체 · snapshot 이벤트 | — |

## Task Commits

1. **Task 1: 트레이서 — 서버별 admin 연결 role 2 · op 5 · 스냅샷 캐시** — `460d36c7` (feat)
2. **Task 2 RED: 명령 상관 · healthz adminConns 실패 테스트** — `73e75e70` (test)
3. **Task 2 GREEN: 명령 상관 · 1건 비행 · 타임아웃/offline · 86→87 짝 · healthz adminConns** — `a18a8ce8` (feat)

## TDD Gate Compliance

- RED `73e75e70` — B1~B5 · B7 · B8 · order-api adminConns 3건이 스텁(`command()` → offline · `health()` usersRev null · adminConns 미결선)에서 **단언 실패**. B6a/B6b 는 Task 1 상태기계로 이미 green(예상).
- RED 증거 `.red/29-08-task2-red.json` — `gsd-tools check tdd-red-evidence` → **RED_EVIDENCE_OK**(target_test_failed · 대상 B2 `expected 'offline' to be 'result'`). 전체 RED 실행 TAP 은 vitest tap 리포터가 여러 줄 diff 를 YAML 밖에 써서 분류기가 Malformed TAP 으로 읽었다 → 대상 B2 만 `-t` 로 다시 돌린 실제 실행을 증거로 썼다(record 의 note 에 경위). semanticAssessment: 대상이 실행되어 계획한 단언에서 실패 · 로드/구문 오류 없음.
- GREEN `a18a8ce8` — relay 전체 42 파일 · 1130 테스트 green.
- REFACTOR — 없음.

## Verification

- `pnpm --filter @gh-radar/shared build` · relay `typecheck` · `typecheck:tests` — 통과.
- `vitest run tests/admin-conn.test.ts tests/pipelines.test.ts tests/order-api.test.ts` — 3 파일 · 74 통과.
- `pnpm --filter @gh-radar/relay run test` — 42 파일 · 1130 통과.
- 수락 grep: `export class AdminConn` 1 · `gh-radar-relay/admin` 1 · `new AdminConn`(pipelines) 1 · `ADMIN_COMMAND_TIMEOUT_MS = 5_000` 1 · `kind: "offline"` 7 · `adminConns`(order-api) 9.
- 스키마 푸시: 해당 없음. 보안검사: `security_enforcement: false` — 생략.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] admin 79 broker 대조 추가**
- **Found during:** Task 1
- **Issue:** 플랜 deps 에 `broker` 가 있으나 대조 규칙이 없었다. 레지스트리 주소 오설정(KYOBO 행이 KB 서버)이면 admin 명령이 다른 증권사 users.toml 을 고친다 — 저널 관찰자(29-03 Pitfall 12)보다 피해가 크다.
- **Fix:** 79 broker 가 비어 있지 않고 "MOCK" 이 아니며 행 증권사와 다르면 `rejected` 영구 정지(재시도 없음 · error 1줄 — 문구는 저널 테스트의 "broker 불일치" 필터와 겹치지 않게 「증권사 대조 실패」).
- **Files modified:** relay/src/admin/admin-conn.ts
- **Commit:** 460d36c7

**2. [Rule 3 - Blocking] 기존 테스트 2개의 기대값 갱신(플랜 files 밖 1개 포함)**
- **Found during:** Task 1 · Task 2
- **Issue:** 서버마다 소켓이 2개(저널 + admin)가 되어 `pipelines.test.ts` ② 의 「살아 있는 소켓 1」 단언이 깨지고, healthz 본문에 `adminConns` 가 생겨 `journal-boot.test.ts` M1 의 키 목록 단언이 깨졌다.
- **Fix:** pipelines ② 를 2(저널 + admin)로, 스텁 `gatewayFor` 가 admin 로그인 · 기본 handler 에도 답하게. journal-boot M1 키 목록에 `adminConns` 추가 + 값 키가 `state · usersRev` 뿐임을 단언.
- **Files modified:** relay/tests/pipelines.test.ts, relay/tests/journal-boot.test.ts
- **Commits:** 460d36c7, a18a8ce8

**3. [플랜 해석] Task 2 커밋 1개 → TDD RED/GREEN 2개**
- 플랜 문구는 「한 커밋」이지만 `tdd="true"` 라 tdd.md 규약대로 RED(`test`) → GREEN(`feat`) 으로 나눴다. 총 커밋 3개(플랜 예상 2개).

**4. [플랜 보강] 87 대기 · op 5 명령 세부 규칙 확정**
- 87 대기 중 끊김은 offline 이 아닌 snapshot 없는 result, `command(op 5)` 는 87 을 응답으로 합성 — key-decisions 참조. 테스트 B8 · B9 추가.

**Total deviations:** 2 auto-fixed (Rule 2 × 1 · Rule 3 × 1) + 플랜 해석 2. **Impact:** 범위 밖 동작 변경 없음 — admin 연결은 새 소켓만 더하고 저널 관찰자 · quote · 사용자 세션 경로는 무변경.

## Issues Encountered

- 프로젝트 루트 핀은 매 커밋 전 통과. `git.base-branch --is-protected master` 는 true 를 돌려주지만, 오케스트레이터 지시(메인 작업 트리 · master · 순차 실행)와 저장소 관례(phase 작업은 master)에 따라 master 에 커밋했다. push 는 하지 않았다.

## Next Phase Readiness

- 29-11(fan-out)이 `pipelines.get(key)?.admin.command(...)` 로 서버별 44 를 보내고 `AdminCommandOutcome` 을 서버별 결과 배열로 모은다. 29-14 는 `admin.on("snapshot")` 으로 87 을 DB 에 적재한다.
- **29-25 빅뱅 배포 전 주의:** 이 코드가 배포되면 enabled 서버마다 role 2 연결이 하나씩 더 열린다. gh-trade 새 바이너리(관찰자 정원 6 · role 2 관문) 배포 **전**에 relay 를 올리면 구 서버는 role 2 를 79 거부로 답할 것이고 admin 연결은 rejected(5분 × 12 재시도 뒤 정지)로 머문다 — 503 축은 아니지만 정원 4 의 구 서버에서는 재시도마다 관찰자 칸을 잠깐 쓴다. 배포 순서는 gh-trade 서버 먼저.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: relay/src/admin/admin-conn.ts · relay/tests/admin-conn.test.ts · .planning/phases/29-dma-multi-server-admin/.red/29-08-task2-red.json
- FOUND commits: 460d36c7 · 73e75e70 · a18a8ce8 (HEAD 조상)
