---
phase: 29-dma-multi-server-admin
plan: 47
subsystem: relay
tags: [relay, shared, dma, admin, gap-closure, gc-02, order-ip-mac, tdd]
requires:
  - phase: 29-41
    provides: "Admin 계좌 경로(planner · dispatcher · 44/86/87 코덱)의 현재 형태"
  - phase: 29-04
    provides: "shared diffServerAccounts — planner 와 개요 칩의 공통 판정"
provides:
  - "relay AdminAccount.orderIp?/orderMac? · shared AdminAccountFields.orderIp?/orderMac?(87 전용 · 빈 값 = 키 없음)"
  - "buildWireAdminAccount 가 addOrderIp/addOrderMac 를 늘 싣는다(값 없음 = 빈 문자열)"
  - "parseAdminUsersSnapshot 이 비어 있지 않은 order_ip/order_mac 만 키로 읽는다"
  - "planner withServerEndpoint — op 1 · op 3 계좌에 계획 시점 87 의 그 계좌 값 되싣기(의도 쌍 우선 · 87 에 없으면 빈 문자열)"
  - "shared sameValues — 주문자 IP/MAC 은 의도 쪽에 값이 있을 때만 비교"
  - "ADMIN_CODE.BadOrderEndpoint = 13 · ADMIN_CODE_NAME[13] = BAD_ORDER_ENDPOINT"
affects: [29-53, ADMIN-05]
actuals:
  tokens: 5300
  tasks: 2
  commits: 4
plan_head_before: 4cc30de01394cd2773461a6d09a6ad2c90f9f695
plan_head_after: d9f61673fdd29690e1adbdadb1f427585e62f307
tech-stack:
  added: []
  patterns:
    - "87 전용 필드는 「의도에 값이 없으면 보존」 — planner 가 87 값을 되싣고 diff 는 비교하지 않는다(의도가 생기면 의도가 이긴다)"
    - "쌍 필드(서버가 둘 다 또는 둘 다 비움을 요구)는 출처를 섞지 않는다 — 의도에 한쪽이라도 있으면 의도 쌍 전부"
key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-47-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-47-task2-red.json
  modified:
    - relay/src/admin/types.ts
    - relay/src/dma/envelope.ts
    - relay/src/admin/planner.ts
    - packages/shared/src/admin.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/admin-planner.test.ts
    - relay/tests/admin-dispatcher.test.ts
    - packages/shared/src/__tests__/admin.test.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
key-decisions:
  - "29-47: op 1 · op 3 의 주문자 IP/MAC 은 의도에 어느 한쪽이라도 있으면 의도 쌍(빈 쪽 = 빈 문자열), 아니면 계획 시점 87 의 그 계좌 값 — 필드마다 따로 고르지 않는다(87 값과 섞으면 서버의 「둘 다 또는 둘 다 비움」 규칙을 relay 가 몰래 깨뜨린다)"
  - "29-47: planner 는 87 에 값이 없는 계좌에도 orderIp/orderMac 을 빈 문자열로 명시한다(op 객체 = 와이어에 실리는 값). 87 파서는 빈 값을 키로 두지 않는다 — 기존 87 toEqual 단언 무수정"
  - "29-47: diff 는 의도 쪽에 값이 있을 때만 두 필드를 비교한다 — 지금 DB 의도에는 값이 없으므로 IP/MAC 이 설정된 계좌도 나머지 4값이 같으면 op 0 · 반영됨. 의도의 빈 문자열은 「비우기」 의도로 비교한다"
  - "29-47: 웹은 86 코드표가 없다(서버 message 원문 표시 · D-23 ④) — 13 용 새 표를 만들지 않았다. 웹 계좌 편집기 IP/MAC 입력칸은 이번 라운드 밖(인박스 항목 4 · 후속)"
patterns-established:
  - "87 전용 필드 보존: 파서(빈 값 키 생략) → shared 선택 필드 → planner 되싣기 → 44 조립기 명시 기본값"
requirements-completed: [ADMIN-05]
coverage:
  - id: D1
    description: "GC-02 트레이서 — 87 의 계좌 A order_ip/order_mac 이 파서 → planner op 3 → dispatcher command → 44 바이트까지 그대로 실리고, 생성 리더로 다시 읽으면 두 값이다"
    requirement: "ADMIN-05"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#44 op 3 — account 의 orderIp/orderMac 을 싣는다 · 바이트를 생성 리더로 다시 읽으면 두 값(GC-02 트레이서)"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#87 → order_ip/order_mac 은 비어 있지 않은 값만 키로 둔다"
        status: pass
      - kind: unit
        ref: "relay/tests/admin-planner.test.ts#planServerOps — 주문자 IP/MAC 되싣기 (GC-02 · 29-47)"
        status: pass
      - kind: integration
        ref: "relay/tests/admin-dispatcher.test.ts#D14 GC-02(29-47) — 87 의 주문자 IP/MAC 을 op 3 command 에 되싣는다 · 서버 값이 남는다"
        status: pass
    human_judgment: false
  - id: D2
    description: "87 에 없는 계좌(op 1 첫 계좌 · 추가 op 3)는 두 값을 빈 문자열로 싣고, 값이 없는 계좌의 44 는 null 이 아닌 빈 문자열이다(구 서버 · 교보 · 미설정 = 종전과 같은 서버 판정)"
    requirement: "ADMIN-05"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#44 — 두 값이 없는 계좌는 빈 문자열을 명시적으로 싣는다"
        status: pass
      - kind: unit
        ref: "relay/tests/admin-planner.test.ts#87 에 없는 계좌(추가 op 3)는 빈 문자열 · 87 에 유저가 없으면 op 1 첫 계좌 · 나머지 op 3 모두 빈 문자열"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#87 → 유저 2명 · 교보 계좌 branch/trader 빈 값 그대로 · priority 순서 보존(무수정)"
        status: pass
    human_judgment: false
  - id: D3
    description: "diff 는 의도 쪽에 값이 있을 때만 주문자 IP/MAC 을 비교한다 — IP/MAC 이 설정된 계좌도 나머지 값이 같으면 changed 0(개요 반영됨)"
    requirement: "ADMIN-05"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin.test.ts#diffServerAccounts — 주문자 IP/MAC 은 의도 값이 있을 때만 비교 (GC-02 · 29-47)"
        status: pass
      - kind: unit
        ref: "packages/shared/src/__tests__/admin-overview.test.ts (무수정)"
        status: pass
    human_judgment: false
  - id: D4
    description: "86 code 13 BAD_ORDER_ENDPOINT — relay 코드표 라벨 · 실패 해석 · dispatcher 결과 failed + 서버 message 원문"
    requirement: "ADMIN-05"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin.test.ts#interpretAdminResult op 3 · code 13 → failed / op 1 · code 13 → failed"
        status: pass
      - kind: integration
        ref: "relay/tests/admin-dispatcher.test.ts#D15 86 code 13 BAD_ORDER_ENDPOINT → failed · message 원문 · 로그 이름표"
        status: pass
    human_judgment: false
duration: 9min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 47: 주문자 IP/MAC 보존 (GC-02) Summary

**relay 의 op 1 · op 3 이 87 스냅샷의 그 계좌 order_ip/order_mac 을 되실어(44 슬롯 14 · 16 명시) 웹 계좌 편집 · 반영이 gh-trade 서버의 계좌별 주문자 IP/MAC 을 더는 지우지 않고, diff 는 의도에 값이 있을 때만 두 필드를 비교하며 86 code 13 BAD_ORDER_ENDPOINT 라벨을 더했다.**

## Performance

- **Duration:** 약 9분
- **Started:** 2026-10-11T00:31:11Z
- **Completed:** 2026-10-11T00:40:00Z
- **Tasks:** 2 (트레이서 1 · auto 1 — 둘 다 TDD RED → GREEN)
- **Files modified:** 12 (코드 4 · 테스트 4 · 테스트 헬퍼 2 · RED 증거 2)

## Accomplishments

- **87 파서** — `parseAdminUsersSnapshot` 이 `orderIp()` · `orderMac()` 를 읽어 비어 있지 않을 때만 `orderIp` · `orderMac` 키로 둔다. 구 서버(필드 없음) · 교보 · 미설정(빈 문자열)은 키가 없어 기존 87 `toEqual` 단언이 무수정 green 이다.
- **44 조립기** — `buildWireAdminAccount` 가 `addOrderIp(a.orderIp ?? "")` · `addOrderMac(a.orderMac ?? "")` 를 늘 싣는다. 서버 판정상 null 과 빈 문자열은 같은 「미설정」 이지만 명시적으로 싣는다.
- **planner 되싣기** — `withServerEndpoint` 가 op 1 첫 계좌 · op 3 계좌마다 계획 시점 87 의 그 계좌(정규화 번호로 찾음) 값을 채운다. 의도에 어느 한쪽이라도 있으면 의도 쌍이 이기고, 87 에 없는 계좌는 빈 문자열이다. 이름 · 우선순위 · 지점 수정, 신규 서버 반영, 「다시 반영」 이 모두 이 경로를 탄다.
- **diff 규칙** — `sameValues(의도, 87)` 는 의도 쪽에 값이 있을 때만 두 필드를 87 값(없음 = 빈 문자열)과 비교한다. 지금 DB 의도에는 두 필드가 없으므로 IP/MAC 이 설정된 계좌도 「미반영」 이 되지 않는다.
- **code 13** — `ADMIN_CODE.BadOrderEndpoint = 13` · `ADMIN_CODE_NAME[13] = "BAD_ORDER_ENDPOINT"` 를 더해 admin-conn 86 감사 로그 `codeName` 에 쓰인다. `interpretAdminResult` 는 이미 13 을 실패로 해석한다(주석에 13 추가). dispatcher 결과는 `{ outcome: "failed", code: 13, message: 서버 원문 }` 이다.
- **웹 확인** — webapp 에는 86 코드표가 없다. 서버별 실패 칩은 서버 한국어 message 원문을 그린다(D-23 ④). 그래서 새 표를 만들지 않았다. `webapp/src` 의 `LAST_ACCOUNT` 등은 relay HTTP 오류 코드이고 86 코드가 아니다.

## Task Commits

1. **Task 1 (트레이서): 87 파싱 → planner op 3 되싣기 → dispatcher → 44 바이트**
   - `dc98d013` test(29-47): GC-02 실패 테스트 — 87 주문자 IP/MAC 파싱 · op 3 되싣기 · 44 바이트에 두 값 (RED)
   - `233bf31a` fix(29-47): op 3 이 87 의 주문자 IP/MAC 을 되싣는다 — 서버 계좌 설정 보존 (GC-02) (GREEN)
2. **Task 2: diff 비교 규칙 · 86 code 13 라벨**
   - `f3342abc` test(29-47): GC-02 실패 테스트 — 주문자 IP/MAC 은 의도 값이 있을 때만 비교 · 86 code 13 라벨 (RED)
   - `d9f61673` fix(29-47): 주문자 IP/MAC 은 의도 값이 있을 때만 비교 · 86 code 13 라벨 (GC-02) (GREEN)

트레이서 게이트: interactive · `end-of-phase` · `<verify>` 는 automated 뿐이다. Task 1 verify 를 다시 돌려 green(5 파일 293 테스트)을 확인했다. 그 뒤 Task 2 로 확장했다.

## TDD Gate Compliance

- **RED Task 1:** 대상은 `envelope.test.ts > … > 44 op 3 — account 의 orderIp/orderMac 을 싣는다 · 바이트를 생성 리더로 다시 읽으면 두 값(GC-02 트레이서)` 이다. 기대값은 `orderIp() === "010041001124"`, 실제값은 `null` 이었다(슬롯 14 미적재). 분류기는 `RED_EVIDENCE_OK` 를 냈다(tap-flat · 앞쪽 pino 로그 1줄 제거). 같은 실행에서 실패한 21건은 모두 계획한 단언의 `AssertionError` 였다. 로드 · 구문 오류는 없었다. 의미 판정: 대상이 실제로 실행됐고 계획한 단언에서 실패했다.
- **RED Task 2:** 대상은 `admin.test.ts > diffServerAccounts — 주문자 IP/MAC 은 의도 값이 있을 때만 비교 (GC-02 · 29-47) > 의도에 orderIp 가 있고 87 과 다르면 changed [의도 A1]` 이다. 기대값은 `changed [의도 A1]`, 실제값은 `[]` 였다. tap-flat 이 여러 줄 assertion 메시지를 들여쓰지 않아 분류기가 `Malformed TAP` 를 냈다. 그래서 같은 대상을 junit 리포터로 다시 돌렸고 `RED_EVIDENCE_OK` 를 받았다(reportPath · runStartedAt · reportModifiedAt 기록). D15 는 `ADMIN_CODE.BadOrderEndpoint` 가 `undefined` 라서 실패했다.
- **GREEN:** 두 task 모두 `fix(29-47)` 커밋이 RED `test(29-47)` 뒤에 있다. 이 phase 의 기존 관례가 GREEN 을 `fix` 로 적는다. REFACTOR 커밋은 없다(불필요).

## Files Created/Modified

- `relay/src/admin/types.ts` — `AdminAccount.orderIp?/orderMac?` · `ADMIN_CODE.BadOrderEndpoint` · `ADMIN_CODE_NAME[13]`
- `relay/src/dma/envelope.ts` — 44 조립에 두 필드를 명시 적재 · 87 파서 · 44/87 절 머리 주석(GC-02)
- `relay/src/admin/planner.ts` — `withServerEndpoint` · 87 계좌 정규화 맵 · `fieldsOf` 가 의도 값이 있을 때만 옮김 · 머리 규칙 한 줄
- `packages/shared/src/admin.ts` — `AdminAccountFields.orderIp?/orderMac?` · `sameValues` 의도 정의 비교 · 주석(13 · 87 전용)
- `relay/tests/helpers/frames.ts` — `FakeAdminAccountInput.orderIp?/orderMac?`(주어질 때만 싣는다)
- `relay/tests/helpers/fake-gateway.ts` — op 3 멱등 7필드(`fullAccount`) · 44 리더가 두 값을 87 파서 규칙으로 읽음
- 테스트 4개 파일 — 위 coverage 참조. 기존 op 1/3 단언에 빈 문자열 두 키를 더했다(planner `sent()` · dispatcher `wire()`)

## Decisions Made

- 위 frontmatter key-decisions 4건 참조. 플랜 문구와 다른 점은 아래 Deviations 1 하나다(의도 쌍 규칙).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] planner 의 의도 우선을 필드별이 아니라 쌍으로 적용**
- **Found during:** Task 1
- **Issue:** 플랜 문구 `orderIp: account.orderIp ?? snap?.orderIp ?? ""` 를 필드마다 따로 적용하면, 의도에 한쪽만 있을 때 「의도 IP + 87 MAC」 조합이 서버로 나간다. 서버는 둘을 함께 적거나 함께 비우라고 요구하므로, 이 조합은 의도하지 않은 단말 식별값이 된다.
- **Fix:** 의도에 어느 한쪽이라도 있으면 의도 쌍(빈 쪽 = 빈 문자열)을 쓴다. 이 경우 서버가 13 으로 거부하므로 섞인 값이 조용히 들어가지 않는다. 의도에 둘 다 없으면 87 쌍을 쓴다. 지금 DB 의도에는 값이 없어 운영 동작은 플랜과 같다.
- **Files modified:** relay/src/admin/planner.ts · relay/tests/admin-planner.test.ts(「한쪽만이어도 섞지 않는다」 케이스)
- **Committed in:** 233bf31a

**2. [Rule 3 - Blocking] 가짜 게이트웨이 `fullAccount` 타입 · 44 리더**
- **Found during:** Task 1
- **Issue:** `FakeAdminAccountInput` 에 선택 필드를 더하자 `Required<FakeAdminAccountInput>` 반환이 typecheck:tests 를 깨뜨렸다. 또 가짜 서버의 op 3 멱등 판정이 5필드뿐이라 실서버(7필드)와 달랐다.
- **Fix:** `fullAccount` 를 7필드(없음 = 빈 문자열)로 바꿨다. `readAdminCommandRequest` 는 두 값을 87 파서 규칙(비어 있지 않을 때만 키)으로 읽는다. 그래서 기존 `adminCommands` 단언 모양은 그대로다.
- **Files modified:** relay/tests/helpers/fake-gateway.ts(플랜 files_modified 밖 · 테스트 헬퍼)
- **Committed in:** dc98d013 · 233bf31a

**3. [Rule 2 - 검증 범위] code 13 의 codeName 단언 위치**
- **Found during:** Task 2
- **Issue:** 플랜은 「relay 로그 `codeName` 이 BAD_ORDER_ENDPOINT」 를 dispatcher 테스트에 두라고 했다. 그런데 `codeName` 로그는 admin-conn 이 남기고, dispatcher 테스트는 admin-conn 대역(FakeConn)을 쓴다.
- **Fix:** D15 에서 dispatcher 결과(failed · 원문)를 단언하고, admin-conn 로그가 읽는 표 자체(`ADMIN_CODE.BadOrderEndpoint === 13` · `ADMIN_CODE_NAME[13]`)를 함께 단언했다.
- **Committed in:** f3342abc

---

**Total deviations:** 3 auto-fixed (Rule 2 ×2 · Rule 3 ×1)
**Impact on plan:** 셋 다 정확성 · 테스트 충실도 쪽이다. 범위 확장은 없다. 웹 · DB · RPC 는 건드리지 않았다(prohibitions 준수). 두 값은 어떤 로그 인자에도 싣지 않는다. snapshot-sink 는 5필드를 명시 매핑하므로 DB 적재 열도 그대로다.

## Issues Encountered

- vitest `tap-flat` 리포터가 여러 줄 assertion 메시지를 YAML 블록 들여쓰기 없이 내보낸다. 그래서 RED 분류기가 `Malformed TAP` 로 거부했다. 같은 대상을 junit 리포터로 다시 돌려 해결했다(Task 2 RED).

## Verification

- Task 1 verify: shared build · relay typecheck · typecheck:tests · vitest 5 파일(envelope · admin-planner · admin-dispatcher · admin-conn · admin-snapshot-sink) **293 passed**
- Task 2 verify: shared admin · admin-overview **66 passed** · shared build · relay typecheck 두 벌 · admin-dispatcher · admin-planner **63 passed** · server · webapp typecheck exit 0
- 플랜 끝 relay 전체: **57 files · 1425 passed**(`--maxWorkers=2` 1회)
- 운영 보존: 87 에 두 필드가 없는 기존 단언(유저 2명 · 교보 빈 값)이 무수정 green 이다. 구 서버 · 교보는 빈 문자열을 싣는데, 서버 판정상 종전과 같은 값이다.

## User Setup Required

None — 배포 전 코드 · 테스트만 바꿨다. relay 배포는 메인 세션 몫이다(배포 순서: relay → push). 인박스 노트 `261010-kb-order-ip-mac.md` 는 status open 을 유지한다. 진행 줄은 29-53 이 적는다.

## Next Phase Readiness

- relay 가 배포되면 gh-trade 가 KB 운영 서버에 IP/MAC 을 설정해도 웹 계좌 편집이 그 값을 보존한다. 29-VERIFICATION-R2 의 「relay 보존 전에는 설정하지 말 것」 경고는 relay 배포 뒤에 풀린다.
- 후속 과제: 웹 계좌 편집기에 IP/MAC 입력칸을 두는 일(인박스 항목 4 · 목업 필요)이다. 입력칸이 생기면 의도에 값이 실리고, 이번에 만든 「의도 쌍 우선」 · 「의도 값 있을 때만 비교」 가 그대로 쓰인다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*

## Self-Check: PASSED
