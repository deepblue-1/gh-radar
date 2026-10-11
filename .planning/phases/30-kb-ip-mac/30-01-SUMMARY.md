---
phase: 30-kb-ip-mac
plan: 01
subsystem: api
tags: [relay, express, zod, admin, dma, order-ip-mac, gh-trade]

requires:
  - phase: 29-dma-multi-server-admin
    provides: "relay Admin 반영 경로(dispatcher · planner · admin-conn op 5) · GC-02 87 IP/MAC 되싣기 · Express DMA 프록시"
provides:
  - "PUT /dma-users/:dma/accounts body 최상위 orderEndpoint {orderIp, orderMac} — Express · relay 스키마(KB 만 · 구조/길이만) → dispatcher override → 등록 서버 전부 op 3"
  - "OrderEndpointOverride 타입 · reconcileUser({ orderEndpoint }) 옵션(relay dispatcher)"
  - "R3-01 해제 — op 1(계좌)·op 3 직전 op 5 재조회 후 재계획 · 재조회 실패 시 그 서버 44 0건(fail closed)"
  - "R3-02 — 이 유저 87 에 없는 계좌는 같은 87 다른 유저의 IP/MAC 을 되싣는다(otherByNo)"
  - "relay 감사 줄 orderEndpoint: set | clear 플래그(값 없음)"
affects: [30-02, 30-03, 30-04, 30-05, 30-07, relay-deploy, server-deploy]

actuals:
  tokens: 12100
  tasks: 3
  commits: 5
plan_head_before: 3549c1072d29c3b5689a52467d27174806b8079f
plan_head_after: d3be77c8771329811499277690331c227b4e16e6

tech-stack:
  added: []
  patterns:
    - "요청 메모리 override — DB 를 지나지 않는 87 전용 값은 PUT body 최상위 키 → dispatcher 옵션 → 의도 행에 얹어 planner 로"
    - "쓰기 직전 신선도 — 캐시로 먼저 계획하고 IP/MAC 을 싣는 op 가 있을 때만 op 5 재조회 후 처음부터 재계획, 실패는 fail closed"

key-files:
  created:
    - .planning/phases/30-kb-ip-mac/30-01-SUMMARY.md
  modified:
    - server/src/schemas/admin.ts
    - server/tests/routes/admin-dma.test.ts
    - relay/src/admin/admin-api.ts
    - relay/src/admin/dispatcher.ts
    - relay/src/admin/planner.ts
    - relay/tests/admin-api.test.ts
    - relay/tests/admin-dispatcher.test.ts
    - relay/tests/admin-planner.test.ts

key-decisions:
  - "orderEndpoint 는 계좌 객체 밖 PUT body 최상위 키 — RPC p_account 에 IP/MAC 이 실리지 않는다(DB 변경 없음 · 87 정본)"
  - "Express · relay 는 IP/MAC 형식을 검사하지 않는다(구조 · 길이 64 만) — 정본은 gh-trade 86 code 13, 막으면 문구가 화면에 도달하지 못한다"
  - "op 5 재조회 실패는 fail closed — timeout 이면 timeout, offline/87 없음이면 offline 이고 그 서버엔 44 를 보내지 않는다(캐시 진행 금지)"
  - "재조회는 op 1(계좌)·op 3 이 계획에 있을 때만 — 비밀번호 · 제거(op 4) · 유저 삭제(op 2) · 무변경은 0회"
  - "R3-02 폴백 우선순위: 의도/override 쌍 > 이 유저 87 > 같은 87 다른 유저(IP/MAC 있는 계좌 · 87 순 앞의 것) > 빈 문자열. 다른 유저에는 op 없음(D-11)"
  - "relay 스키마는 trim 하지 않는다(Express 가 trim) — relay 는 받은 원문을 그대로 op 3 에"

patterns-established:
  - "87 전용 필드 쓰기: Express zod 에 키를 반드시 선언(strip 방지) → relay 라우트는 store 에는 계좌만, dispatcher 에는 override 만"
  - "FakeConn op 5 분기: sent 에 기록하지 않고 refreshes/refreshMode/refreshDelayMs 로 재조회만 흉내 — 기존 sent 단언 보존"

requirements-completed: [IPMAC-01, IPMAC-02, IPMAC-03, IPMAC-05]

coverage:
  - id: D1
    description: "KB 계좌 PUT 의 orderEndpoint 원문이 Express · relay 를 지나 등록 서버마다 op 3 에 실리고 RPC p_account 에는 없다 · 교보/반쪽 쌍 400 · 형식 오류는 통과"
    requirement: IPMAC-02
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#P30 주문자 IP/MAC 쓰기 경로 (W1~W5)"
        status: pass
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#P30 PUT orderEndpoint 통과 (S1~S4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "op 1(계좌)·op 3 직전 op 5 재조회 · 새 87 로 재계획 · 재조회 timeout/offline 이면 44 0건 · 불필요 경로 재조회 0회 · override 가 새 87 값보다 우선"
    requirement: IPMAC-01
    verification:
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#IPMAC-01 R3-01 — op 1/3 직전 op 5 재조회 (D-15) (8 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "계좌명만 바꾼 PUT 이 active 등록 서버마다 op 3(새 name + 각 서버 새 87 IP/MAC)"
    requirement: IPMAC-05
    verification:
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#IPMAC-05 계좌명만 바꾼 PUT"
        status: pass
    human_judgment: false
  - id: D4
    description: "relay · Express 가 형식 오류를 막지 않아 86 code 13 이 failed · 서버 message 원문으로 결과에 실린다"
    requirement: IPMAC-03
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#W4 형식 오류 IP 도 relay 는 막지 않는다"
        status: pass
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#D15 86 code 13 BAD_ORDER_ENDPOINT"
        status: pass
    human_judgment: false
  - id: D5
    description: "R3-02 — 다른 DMA 유저가 IP/MAC 과 함께 가진 같은 계좌를 추가할 때 op 1/op 3 에 그 값을 되싣고 다른 유저에는 op 없음"
    requirement: IPMAC-01
    verification:
      - kind: unit
        ref: "relay/tests/admin-planner.test.ts#R3-02 — 다른 유저의 같은 계좌 IP/MAC 되싣기 (D-16) (7 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "실서버(KB 운영 gh-trade)에서 relay 밖 설정 IP/MAC 이 웹 계좌명 변경 뒤에도 남는지 — 배포(30-07) 뒤 라이브 확인"
    requirement: IPMAC-01
    verification: []
    human_judgment: true
    rationale: "단위/통합 테스트는 스텁 게이트웨이 기준이다. 실 gh-trade users.toml 보존은 relay 배포 뒤 운영 서버에서만 확인할 수 있다(30-07 메인 세션)."

duration: 7min
completed: 2026-10-11
status: complete
---

# Phase 30 Plan 01: orderEndpoint 쓰기 경로 · R3-01 op 5 재조회 · R3-02 다른 유저 IP/MAC 되싣기 Summary

**계좌 PUT body 의 orderEndpoint 를 Express → relay → dispatcher override → 등록 서버 전부 op 3 원문으로 싣고(DB 미저장), relay 가 op 1/3 직전 op 5 로 87 을 새로 받아 다시 계획하며(실패면 44 0건), 다른 유저가 가진 같은 계좌의 IP/MAC 을 추가 op 에 되싣는다**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-11T06:04:37Z
- **Completed:** 2026-10-11T06:11:56Z
- **Tasks:** 3 (tracer 1 + TDD 2)
- **Files modified:** 8

## Accomplishments

- **트레이서(IPMAC-02):** `AdminPutAccountSchema`(server) · `PutAccountBody`(relay) 에 `orderEndpoint` — KB 만 · 두 키 필수 · 길이 64 · 형식 검사 없음. relay 라우트는 `store.putAccount` 에 계좌만, `reconcileUser` 에 `OrderEndpointOverride` 만 넘긴다. 감사 줄은 `orderEndpoint: "set" | "clear"`.
- **R3-01 해제(IPMAC-01 · D-15):** `#applyServer` 가 캐시 계획에 op 1(계좌)·op 3 이 있으면 `ADMIN_OP.ListUsers` 로 새 87 을 받아 처음부터 재계획. 재조회 timeout → `timeout`, offline/87 없음 → `offline`, 그 서버 44 0건 + warn 1줄(서버 키 · 사유만).
- **R3-02(D-16):** `planServerOps` 에 `otherByNo` — 이 유저 87 에 없는 계좌는 같은 87 다른 유저의 같은 정규화 계좌번호 IP/MAC 을 op 1 첫 계좌 · op 3 에 싣는다. 다른 유저 계좌를 겨냥한 op 는 만들지 않는다(D-11).
- 검증: relay 전체 57 파일 · 1511 tests 통과, server admin-dma · admin 110 tests 통과, relay typecheck · typecheck:tests · server typecheck 0 오류.

## Task Commits

1. **Task 1 (tracer): orderEndpoint 한 경로 — Express PUT → relay 라우트 → reconcileUser override → op 3** - `ef0b8cab` (feat)
2. **Task 2: IPMAC-01 R3-01 — op 1/3 직전 op 5 재조회** - `463e9b86` (test · RED) → `b2298704` (feat · GREEN)
3. **Task 3: D-16 R3-02 — 다른 유저의 같은 계좌 IP/MAC 되싣기** - `4df2ee0c` (test · RED) → `d3be77c8` (feat · GREEN)

Tracer feedback gate: end-of-phase 모드 · automated-only verify 재실행 통과(relay P30 5 passed · server P30 4 passed · typecheck 3종 0) → 확장 진행.

## Files Created/Modified

- `server/src/schemas/admin.ts` — `OrderEndpointSchema`(export · trim · ≤64) · `AdminPutAccountSchema.orderEndpoint?` + KB 전용 superRefine
- `server/tests/routes/admin-dma.test.ts` — 「P30 PUT orderEndpoint 통과 (IPMAC-02)」 S1~S4
- `relay/src/admin/admin-api.ts` — 모듈 내부 `OrderEndpointSchema` · `PutAccountBody` superRefine(KB 만) · PUT 라우트 override 전달 · 감사 set/clear · 머리 계약 주석
- `relay/src/admin/dispatcher.ts` — `OrderEndpointOverride` export · `reconcileUser` 옵션 · `withOrderEndpoint` · `#applyServer` op 5 재조회/재계획/fail closed · 머리 주석 흐름 · 하지 않는 것
- `relay/src/admin/planner.ts` — `otherByNo` 폴백 맵 · 머리 규칙 주석
- `relay/tests/admin-api.test.ts` — 「P30 주문자 IP/MAC 쓰기 경로」 W1~W5 · 잠금 목록
- `relay/tests/admin-dispatcher.test.ts` — `FakeConn` op 5 분기(`refreshes` · `refreshMode` · `refreshDelayMs`) · 「IPMAC-01 R3-01」 8 tests · 잠금 목록
- `relay/tests/admin-planner.test.ts` — 「R3-02 — 다른 유저의 같은 계좌 IP/MAC 되싣기 (D-16)」 7 tests

## Decisions Made

- override 는 그 계좌의 **active** 의도 행(같은 증권사 · 정규화 번호)에만 얹고, 등록 서버 키 집합은 원래 의도에서 뽑는다 — removing 행 · 다른 계좌는 영향 없음.
- 재조회 warn 로그 인자는 `{ server, reason }` 뿐(dmaUserId · 계좌 · IP/MAC 없음).
- relay 스키마는 trim 하지 않는다 — Express 가 trim 하고, relay 는 받은 원문을 그대로 op 3 에 싣는다(D-07).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] D15 테스트의 `command` 목이 op 5 재조회까지 가로채 실패**
- **Found during:** Task 2 GREEN
- **Issue:** 29-47 의 D15(86 code 13) 테스트는 `vi.spyOn(conn, "command")` 로 모든 44 를 code 13 으로 돌려준다. op 5 재조회도 그 목을 타서 snapshot 없는 결과 → fail closed(offline)가 되어 `ops = [3]` 단언이 깨졌다. 플랜의 Pitfall 3 은 `FakeConn.command` 만 다뤘고 이 목은 다루지 않았다.
- **Fix:** 목 안에서 `input.op === 5` 면 원래 `FakeConn.command` 로 넘기게 2줄 추가. D15 의 `expect(` 단언은 하나도 바꾸지 않았다. D1~D13 it 블록은 무변경.
- **Files modified:** relay/tests/admin-dispatcher.test.ts
- **Verification:** admin-dispatcher.test.ts 41 passed · relay 전체 1511 passed
- **Committed in:** `b2298704`

**2. [추가 테스트] 재조회 왕복의 요청 마감 접기(Pitfall 9)**
- **Found during:** Task 2
- **Issue:** RESEARCH Pitfall 9 가 「op 5 지연 + 마감 접기 1건 확인 권고」 를 남겼고 플랜이 `refreshDelayMs` 대역 필드를 요구했지만 쓰는 테스트가 없었다.
- **Fix:** IPMAC-01 describe 에 1건 — op 5 150ms · 마감 30ms → `timeout`(마감 문구)으로 먼저 응답 · 뒤에서 op 3 까지 끝나 record 2회째. 구현 변경 없음(기존 마감 접기가 처리).
- **Files modified:** relay/tests/admin-dispatcher.test.ts
- **Committed in:** `b2298704`

---

**Total deviations:** 1 auto-fixed (Rule 3) + 1 권고 테스트 추가
**Impact on plan:** 범위 확장 없음. 테스트 대역 정합만.

## Issues Encountered

- Task 2 는 TDD 순서를 지키려고 구현 diff 를 스크래치 패치로 떼어 두고(`git checkout -- relay/src/admin/dispatcher.ts`) RED 를 확인·커밋한 뒤 `git apply` 로 되돌렸다. RED 에서 「재조회 0회」 테스트는 구현 전에도 통과(재조회가 없으니 0회가 자명) — 회귀 잠금 용도다. R3-02 의 override · 자기 값 · 빈 값 3건도 같은 이유로 RED 에서 통과했다(기존 우선순위 잠금).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 30-02(shared 정규화 · 멱등 비교) · 30-03(Express 감사 플래그 · GET /users 병합) · 30-04/05(웹 편집 칸)가 이 쓰기 계약(`orderEndpoint` 최상위 · KB 만 · 형식 검사 없음)을 그대로 쓴다.
- 배포 순서 **relay → server → webapp**(Express strip — Pitfall 1). 배포는 30-07 메인 세션 몫 — 이 플랜은 커밋만, push · 배포 없음.
- override 테스트 서버 값은 정규화해도 다른 값(`010041001120` · `1CFD087D9700`)이라 30-02 가 `sameValues` 를 정규화 비교로 바꿔도 단언이 유지된다.

---
*Phase: 30-kb-ip-mac*
*Completed: 2026-10-11*

## Self-Check: PASSED
