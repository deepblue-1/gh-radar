---
phase: 30-kb-ip-mac
plan: 02
subsystem: shared
tags: [shared, admin, order-ip-mac, gh-trade, normalization, vitest]

requires:
  - phase: 29-dma-multi-server-admin
    provides: "shared admin.ts 판정 한 벌(diffServerAccounts · deriveAdminUsersOverview) · resolveEffectiveOrderServer(GC-06)"
  - phase: 30-01
    provides: "PUT orderEndpoint 쓰기 경로(Express · relay) — 이 플랜이 계약 타입을 shared 에 둔다"
provides:
  - "normalizeOrderIp · normalizeOrderMac — gh-trade AccountUtil.h NormalizeOrderIp/Mac 이식(trim 없음 · \"\" 미설정 · null 형식 오류)"
  - "validateOrderEndpointInput — trim 뒤 오류 하나(IP → MAC → 짝 · 짝은 비어 있는 칸)"
  - "summarizeOrderEndpoint — 표시값 · 출처 서버(유효 주문 서버 규칙) · 불일치 목록 · state set|unset|unknown"
  - "AdminOrderEndpoint · AdminOrderEndpointRow · AdminOrderEndpointsRaw(relay GET /internal/admin/order-endpoints 응답 계약)"
  - "AdminPutAccountBody.orderEndpoint · AdminAccountView.orderEndpoints"
  - "deriveAdminUsersOverview(raw, endpoints?) — 의도 계좌의 active 등록 서버별 87 IP/MAC 파생"
  - "sameValues 정규화 비교(IPMAC-02) — 같은 값 재저장이 op 3 을 만들지 않는다"
affects: [30-03, 30-04, 30-05, 30-06, 30-07, relay-admin-api, server-admin-users, webapp-account-editor]

actuals:
  tokens: 9800
  tasks: 3
  commits: 6
plan_head_before: e4cf20926ae5c76164bc1a45ec4974b6119250f6
plan_head_after: 8416b2f4cfb76a07911e77c9c59e25ee1b800c90

tech-stack:
  added: []
  patterns:
    - "타입 전용 순환 — admin.ts 가 order-endpoint 를 런타임 import(sameValues), order-endpoint 는 admin 을 import type 으로만"
    - "파생 2번째 인자 선택(endpoints?) — null 과 생략이 같은 출력, 기존 호출 · 픽스처 호환(29-37 orderServer? 선례)"

key-files:
  created:
    - packages/shared/src/order-endpoint.ts
    - packages/shared/src/__tests__/order-endpoint.test.ts
  modified:
    - packages/shared/src/admin.ts
    - packages/shared/src/index.ts
    - packages/shared/src/__tests__/admin.test.ts
    - packages/shared/src/__tests__/admin-overview.test.ts

key-decisions:
  - "sameValues 는 의도 IP/MAC 이 정규화에 성공하면 정규화값, 실패하면 원문으로 87 값과 비교 — gh-trade Gateway.cpp op 3 멱등과 같아 code 13 경로를 막지 않는다(의도에 필드 없으면 비교 제외 · GC-02 그대로)"
  - "orderEndpoints 는 KB/교보 구분 없이 의도 계좌의 active 등록 서버 전부에 채운다 — KB 만 그리는 것은 화면(D-09) 몫"
  - "summarizeOrderEndpoint 의 등록 목록 구성은 웹 OrderServerControl 과 같다(레지스트리 순 · 켜진 서버만 유효 서버 계산 · 꺼진 지정 무시) — 꺼진 서버도 값을 알면 불일치 비교에는 든다"
  - "87 한쪽만 설정(IP 만 있음)은 state set 으로 본다(gh-trade 짝 규칙상 생기지 않음 — 플래너 가정 그대로)"

patterns-established:
  - "정규화 규칙은 shared 한 벌 — 웹 검증 · relay 멱등 · 표시가 같은 normalizeOrderIp/Mac 을 부른다"
  - "87 값은 이미 정규화값 — 표시 · 불일치 비교는 문자열 비교만(재정규화 금지)"

requirements-completed: [IPMAC-02]

coverage:
  - id: D1
    description: "normalizeOrderIp · normalizeOrderMac 이 gh-trade 규칙 표본 24건과 같은 결과 · validateOrderEndpointInput 이 trim 뒤 IP → MAC → 짝 순으로 오류 하나와 칸을 낸다"
    requirement: IPMAC-02
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/order-endpoint.test.ts#normalizeOrderIp / normalizeOrderMac / validateOrderEndpointInput (32 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "sameValues 정규화 비교 — 10.41.1.124 대 010041001124 같음 · 999.1.1.1 대 빈 값 다름 · 의도 필드 없으면 무시(GC-02)"
    requirement: IPMAC-02
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin.test.ts#P30 sameValues 정규화 비교 (IPMAC-02) (5 tests)"
        status: pass
      - kind: unit
        ref: "relay/tests/admin-planner.test.ts (37 tests — 정규화 비교로 기존 planner 회귀 없음)"
        status: pass
    human_judgment: false
  - id: D3
    description: "deriveAdminUsersOverview(raw, endpoints) 가 의도 계좌의 active 등록 서버별 orderEndpoints 를 채운다(87 모름 · 계좌 없음 null · 다른 유저 행 무시 · 계좌번호 정규화 · 87 전용 {} · null=생략)"
    requirement: IPMAC-02
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin-overview.test.ts#P30 orderEndpoints 파생 (D-09 · D-10) (6 tests)"
        status: pass
      - kind: integration
        ref: "server/tests/routes/admin.test.ts (28 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "summarizeOrderEndpoint 가 유효 주문 서버 규칙으로 출처를 정하고 불일치 · unknown · unset 을 판정한다"
    requirement: IPMAC-02
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/order-endpoint.test.ts#summarizeOrderEndpoint — 출처 · 불일치 (D-09 · D-10) (12 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "shared dist 재빌드 · 소비자(relay · relay tests · server · webapp) typecheck 통과"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/shared build && pnpm --filter {relay,server,webapp} run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-10-11
status: complete
---

# Phase 30 Plan 02: shared 주문자 IP/MAC 규칙 한 벌 Summary

**gh-trade NormalizeOrderIp/Mac 이식 정규화 · 입력 검증 · 유효 주문 서버 기반 표시 판정(summarizeOrderEndpoint)을 shared 한 벌에 두고, Admin 계약(orderEndpoint · orderEndpoints · AdminOrderEndpointsRaw)과 개요 파생 · sameValues 정규화 비교로 확장**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-11T06:14:03Z
- **Completed:** 2026-10-11T06:19:18Z
- **Tasks:** 3 (TDD — RED/GREEN 커밋 6개)
- **Files modified:** 6

## Accomplishments
- `order-endpoint.ts` 신규 — `normalizeOrderIp` · `normalizeOrderMac`(gh-trade 와 같은 규칙 · trim 없음) · `validateOrderEndpointInput`(trim 뒤 오류 하나) · `summarizeOrderEndpoint`(출처 · 불일치 · set/unset/unknown)
- `admin.ts` 계약 확장 — `AdminOrderEndpoint` · `AdminOrderEndpointRow` · `AdminOrderEndpointsRaw` · `AdminPutAccountBody.orderEndpoint` · `AdminAccountView.orderEndpoints`
- `deriveAdminUsersOverview(raw, endpoints?)` — (서버, 유저 + 정규화 계좌번호) 색인으로 active 등록 서버별 87 IP/MAC 을 싣는다
- `sameValues` 정규화 비교 — 같은 값(점표기 대 12자리)을 다시 저장해도 op 3 이 나가지 않는다 · 정규화 실패 값은 원문 비교라 code 13 경로 유지
- shared 전체 519 tests 통과 · dist 재빌드(`summarizeOrderEndpoint` d.ts 노출) · relay planner 37 tests · server admin route 28 tests 회귀 없음

## Task Commits

1. **Task 1: normalizeOrderIp · normalizeOrderMac · validateOrderEndpointInput**
   - `2a9de11f` test — RED(32건)
   - `76aabad3` feat — GREEN + index.ts 재수출
2. **Task 2: admin.ts 계약 · orderEndpoints 파생 · sameValues 정규화 비교**
   - `dcee667d` test — RED(P30 11건 중 8건 실패 확인)
   - `302528ae` feat — GREEN
3. **Task 3: summarizeOrderEndpoint + dist 재빌드**
   - `944789d3` test — RED(12건)
   - `8416b2f4` feat — GREEN · `pnpm --filter @gh-radar/shared build`(dist 는 추적 대상 아님)

## Files Created/Modified
- `packages/shared/src/order-endpoint.ts` — 정규화 · 검증 · 표시 판정 한 벌(admin 은 import type 만)
- `packages/shared/src/__tests__/order-endpoint.test.ts` — gh-trade 규칙 표본 · 검증 우선순위 · 출처/불일치 표 44건
- `packages/shared/src/admin.ts` — 계약 타입 3개 · 필드 2개 · 파생 2번째 인자 · sameValues 정규화 비교
- `packages/shared/src/index.ts` — `export * from "./order-endpoint";`
- `packages/shared/src/__tests__/admin.test.ts` — P30 sameValues 정규화 비교 5건
- `packages/shared/src/__tests__/admin-overview.test.ts` — P30 orderEndpoints 파생 6건 + 기존 toEqual 2건 기대값 보강

## Decisions Made
- sameValues 는 「정규화 성공 → 정규화값 · 실패 → 원문」 으로 비교(gh-trade Gateway.cpp op 3 멱등과 동일).
- orderEndpoints 는 증권사 구분 없이 의도 계좌의 active 등록 서버 전부에 채운다 — KB 만 그리는 판단은 화면 몫(D-09).
- summarizeOrderEndpoint 는 유효 서버 계산에서 꺼진 서버를 빼지만, 값을 아는 꺼진 서버도 불일치 비교에는 넣는다(플랜 action 그대로 — known = registered 중 값이 있는 키).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 기존 개요 toEqual 테스트 2건에 orderEndpoints 기대값 추가**
- **Found during:** Task 2 GREEN
- **Issue:** 플랜은 「기존 테스트 본문은 고치지 않는다」 이면서 「파생은 늘 채운다」(null 과 생략 출력 동일 → 생략 시 서버별 null)를 요구한다. `admin-overview.test.ts` 의 「active 계좌의 등록 서버마다 칩 …」 · 「관리 유저의 87 전용 계좌 …」 두 테스트는 계좌 객체 전체를 `toEqual` 로 단언해 새 필드 때문에 실패했다.
- **Fix:** 29-37 `orderServer` 추가 때와 같은 방식으로 기대 객체에 `orderEndpoints: { KB120: null, KB121: null }` · `{ KYOBO119: null }` · `{}`(87 전용) 한 줄씩만 더했다. 단언 의미는 그대로다.
- **Files modified:** packages/shared/src/__tests__/admin-overview.test.ts
- **Verification:** admin · admin-overview 77 tests 통과
- **Committed in:** 302528ae

---

**Total deviations:** 1 auto-fixed (Rule 3 1건)
**Impact on plan:** 새 필드를 늘 채우려면 꼭 필요한 기대값 보강이다. 범위가 넓어진 것은 없다.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- relay `GET /internal/admin/order-endpoints`(→ `AdminOrderEndpointsRaw`)와 Express `GET /users` 병렬 병합(`deriveAdminUsersOverview(raw, endpoints)`)이 바로 이 계약을 쓸 수 있다.
- webapp 계좌 편집기는 `validateOrderEndpointInput` · `normalizeOrderIp/Mac`(「변경 없음」 판정) · `summarizeOrderEndpoint`(읽기 카드 · 불일치 줄)를 import 하면 된다.
- 배포 없음(shared 는 소비 워크스페이스 배포 때 같이 나간다).

## Self-Check: PASSED
- FOUND: packages/shared/src/order-endpoint.ts · packages/shared/src/__tests__/order-endpoint.test.ts
- FOUND commits: 2a9de11f · 76aabad3 · dcee667d · 302528ae · 944789d3 · 8416b2f4 (HEAD 조상)
- shared typecheck · build · vitest 519/519 · relay planner 37/37 · server admin route 28/28 · relay/server/webapp typecheck 0 error
