---
phase: 29-dma-multi-server-admin
plan: 16
subsystem: relay
tags: [relay, dma-session, session-manager, routing, multi-server]
status: complete

requires:
  - phase: 29-03
    provides: "ServerRegistry.orderServerOf(broker) · SessionManager.resolveTarget(무인자 · KB)"
  - phase: 29-06
    provides: "AppAccess 자격증명 원천(createAccessCredentials) — wss 인증의 creds"
  - phase: 29-14
    provides: "서버별 파이프라인 결선(서버 키 = 레지스트리 키)"
provides:
  - "SessionManager 키 (userId, serverKey) · acquireFor(userId, broker, creds) · release(userId, serverKey) · sessionsOf · primaryOf(KB 우선) · forAccount · get=primaryOf 별칭"
  - "resolveTarget(broker) — 증권사별 주문 서버 · 없으면 세션을 열지 않음(null)"
  - "updatePassword(dmaUserId, pw) · closeForDmaUser(dmaUserId, reason) — 결선은 29-21"
  - "DmaSession.serverKey · broker · setPassword · isDmaUser · terminate('unauthorized')"
  - "fanout conn.acquiredServers · #strategySession(conn, userId, t, accountNo?) · order-handler forAccount 라우팅"
affects: [29-20, 29-21, 29-22, 29-25]

actuals:
  tokens: 22600
  tasks: 2
  commits: 2
plan_head_before: 74de8ba88ae47e727148d3e55a574777fff08b3e
plan_head_after: 1bcbbd0d35638a7d9a440a5d0b3e82ac4e06e7fc

tech-stack:
  added: []
  patterns:
    - "세션 맵 키 `${userId}|${serverKey}` + 사용자 × 증권사 색인 `${userId}|${broker}` → 세션 키(D-10 재사용은 증권사로 찾는다)"
    - "계좌 명령 세션 = forAccount ?? primaryOf — 판정 순서 · 거부 문구는 종전 그대로"
    - "DMA id 는 게터 없이 isDmaUser(비교)만 연다 — 로그 유출 경로 차단"

key-files:
  created:
    - relay/tests/session-routing.test.ts
  modified:
    - relay/src/dma/session-manager.ts
    - relay/src/dma/session.ts
    - relay/src/ws/fanout.ts
    - relay/src/ws/order-handler.ts
    - relay/src/index.ts
    - relay/tests/session-manager.test.ts
    - relay/tests/session.test.ts
    - relay/tests/fanout.test.ts
    - relay/tests/fanout-access.test.ts
    - relay/tests/ws-order.test.ts

key-decisions:
  - "resolveTarget(broker) 가 undefined 면 세션을 열지 않는다(acquireFor → null) — 29-03 의 생성자 게이트웨이 폴백을 끝냈다(db 모드 생성자 값 127.0.0.1 은 열리지 않는 세션만 만든다). resolveTarget 미지정(단위 테스트)은 생성자 단일 대상 · 서버 키 = broker"
  - "fanout 인증에서 KB 주문 서버가 없으면 failed 프레임 + close(1011) — 자격증명 조회 실패와 같은 재접속 가치 있는 장애 갈래"
  - "계좌 명령의 세션 선택은 forAccount ?? primaryOf — 어느 세션에도 계좌가 없으면 primary 로 판정을 이어 종전 「세션 없음」/「사용할 수 없는 계좌」 문구 그대로"
  - "vi.set 은 계좌를 싣지만 사용자 단위(거래소별 1건)라 primaryOf(D-18) · 계좌 대조는 그 세션 허용 목록으로 종전대로"
  - "lc.arm 은 세션 선택에 키 둘째 조각을 그대로 쓰고 형식 관문(#armLatchAccount)은 뒤에 둬 판정 순서(세션 → 키 형식 → 계좌) 불변"
  - "closeForDmaUser 는 엔트리를 지우지 않는다 — 탭이 남은 동안 재acquire 는 죽은 unauthorized 세션 재사용(NO_RETRY), 탭이 다 닫히면 종전 유예로 소멸"

patterns-established:
  - "(유저, 서버) 세션: 생성 시점에만 주문 서버를 읽고 살아 있는 동안은 증권사 색인으로 재사용"

requirements-completed: [ADMIN-06]

coverage:
  - id: D1
    description: "(userId, serverKey) 세션 키 · acquireFor(KB) → 레지스트리 KB 주문 서버 세션 · 둘째 탭 공유(참조계수 2)"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/session-routing.test.ts#① acquireFor(u, KB) → 레지스트리 KB 주문 서버(KB120) 세션"
        status: pass
    human_judgment: false
  - id: D2
    description: "주문 서버 없음 → acquireFor null · warn 1줄(사용자 · 증권사만)"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/session-routing.test.ts#② 그 증권사 주문 서버가 없으면 세션을 열지 않는다"
        status: pass
      - kind: unit
        ref: "relay/tests/session-manager.test.ts#resolveTarget 이 undefined 면 세션을 열지 않는다"
        status: pass
    human_judgment: false
  - id: D3
    description: "forAccount 라우팅 — 두 증권사 세션(스텁 2대)에서 주문 프레임이 그 계좌의 스텁에만 · 종전 거부 문구 유지"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/session-routing.test.ts#④ 두 증권사 세션(스텁 2대)"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-order.test.ts (전체)"
        status: pass
    human_judgment: false
  - id: D4
    description: "wss 인증 경로는 KB 세션만 연다(교보 스텁 소켓 0)"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/session-routing.test.ts#⑤ wss 인증 경로는 KB 세션만 연다"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout-access.test.ts#① (acquireFor 둘째 인자 KB)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-10 주문 서버 전환 재사용 · primaryOf(KB 우선) · sessionsOf · firstReady 사용자 단위 회피 · stats 다중 세션"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/session-manager.test.ts#SessionManager — 조회 · 비밀 교체 · DMA 유저 종료 · 주문 서버 전환 재사용 (29-16)"
        status: pass
    human_judgment: false
  - id: D6
    description: "updatePassword(열린 세션 유지 · 재접속 LoginReq 새 비밀) · closeForDmaUser(unauthorized · 재접속 없음)"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/session.test.ts#⑩ setPassword · ⑪ terminate(unauthorized)"
        status: pass
      - kind: unit
        ref: "relay/tests/session-manager.test.ts#updatePassword · closeForDmaUser"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-10-07
---

# Phase 29 Plan 16: (유저, 서버) 사용자 세션 트레이서 Summary

**SessionManager 를 `${userId}|${serverKey}` 키 + 사용자 × 증권사 색인으로 바꾸고, 세션 생성 때만 증권사별 주문 서버(`resolveTarget(broker)`)를 읽으며, 주문 · 계좌 전략을 `forAccount`(그 계좌가 든 세션)로 라우팅 — wss 는 여전히 KB 세션 하나만 열어 기존 동작 그대로.**

## Performance

- **Duration:** 약 9분
- **Started:** 2026-10-06T17:52:53Z
- **Completed:** 2026-10-06T18:01:58Z
- **Tasks:** 2
- **Files modified:** 11 (신규 1)

## Accomplishments

- 세션 키 `(userId, serverKey)` · `acquireFor` · `release(userId, serverKey)` · `sessionsOf` · `primaryOf`(KB 우선) · `forAccount` · `get`=primaryOf 별칭
- D-10: 그 증권사 세션이 살아 있으면(탭 · 유예) 주문 서버가 바뀌어도 재사용, 세션이 끝난 뒤 acquire 부터 새 서버 — 테스트로 고정
- 주문(`order-handler`) · 상따 lc.set/lc.arm · 자동매도는 `forAccount`, VI · 사용자 설정 · vi.confirm · strategies.disable 은 `primaryOf`
- `updatePassword`(열린 세션 유지 · 재접속 로그인부터 새 비밀) · `closeForDmaUser`(재접속 없이 `unauthorized`) API — 결선은 29-21
- `/healthz` stats 는 모든 (유저, 서버) 세션을 센다 — 판정 규율 · 503 축 불변

## Task Commits

1. **Task 1: 트레이서 — (userId, serverKey) 키 · resolveTarget(broker) · acquireFor · forAccount 주문 라우팅 (KB 만)** - `1cd3b765` (feat)
2. **Task 2: 조회 API · 전략 명령 세션 선택 · 비밀 교체 · DMA 유저 단위 종료 · D-10 재사용 · stats** - `1bcbbd0d` (feat)

트레이서 피드백 게이트: auto 모드 아님 · `human_verify_mode` end-of-phase · `<verify>` 자동만 → Task 1 verify 재실행 green 후 확장(체크포인트 없음).

## Files Created/Modified

- `relay/src/dma/session-manager.ts` — 키 구조 · 증권사 색인 · acquireFor/release/sessionsOf/primaryOf/forAccount/updatePassword/closeForDmaUser · `sessionKey` · `DMA_USER_CLOSED_MESSAGE`
- `relay/src/dma/session.ts` — `serverKey` · `broker` · `isDmaUser` · `setPassword` · `terminate("unauthorized")` · `DmaSessionCreds.serverKey`
- `relay/src/ws/fanout.ts` — 인증 `acquireFor(userId, "KB")`(null → failed + 1011) · `conn.acquiredServers` 반납 · `#strategySession(…, accountNo?)`
- `relay/src/ws/order-handler.ts` — `OrderHandlerSessions` = forAccount · primaryOf, `forAccount ?? primaryOf` 라우팅
- `relay/src/index.ts` — `resolveTarget: (broker) => registry.orderServerOf(broker)`
- `relay/tests/session-routing.test.ts` — 신규 트레이서 5건

## Decisions Made

frontmatter `key-decisions` 참조. 핵심: 주문 서버 없음 = 세션 미개설(29-03 폴백 종료), 계좌 명령 세션은 `forAccount ?? primaryOf` 로 종전 거부 문구 보존.

## Deviations from Plan

### 고친 기존 테스트 (키 구조 · API 이름 때문 — 의미 불변)

- `relay/tests/session-manager.test.ts` — `acquire(u, creds)` → `acquireFor(u, "KB", creds)!`, `release(u)` → `release(u, "KB")` 기계적 치환(무 resolveTarget 은 서버 키 = broker). 29-03 테스트 「resolveTarget undefined → 생성자 폴백 + warn」 은 플랜이 대체를 명시한 동작이라 「null + warn 1줄 · 생성자 단일 대상은 그 증권사만」 으로 다시 썼다.
- `relay/tests/fanout.test.ts` · `relay/tests/fanout-access.test.ts` — `vi.spyOn(sessions, "acquire")` → `"acquireFor"`, creds 단언 인덱스 `[1]` → `[2]` + `[1] === "KB"` 단언 추가.
- `relay/tests/ws-order.test.ts` ⑮ — 핸들러 직접 호출 스텁 `get` → `forAccount` · `primaryOf`(같은 Ready 세션).

### Auto-fixed Issues

None.

### 계획 대비 배치 차이

- `isDmaUser` · `terminate` 는 Task 2 몫이지만 `session.ts` 를 Task 1 에서 한 번에 편집해 Task 1 커밋에 들어갔다. Task 2 RED 는 매니저 `updatePassword` · `closeForDmaUser` 부재(`TypeError: m.updatePassword is not a function` 외 1건)로 확인했고 GREEN 은 매니저 메서드 추가뿐이다.
- 플랜 지시대로 TDD 태스크도 커밋 1개(test/feat 분리 안 함).

**Total deviations:** 0 auto-fixed · 기존 테스트 4파일 의미 불변 수정. **Impact:** 범위 밖 변경 없음.

## Issues Encountered

None.

## TDD Gate Compliance

- RED: Task 2 신규 테스트 실행 → 2 failed(`updatePassword`/`closeForDmaUser` is not a function), 30 passed.
- GREEN: 매니저 메서드 추가 후 세션 3파일 37/37 · relay 전체 46파일 1186/1186.
- REFACTOR: 없음.

## Verification

- `pnpm --filter @gh-radar/shared build` · relay `typecheck` · `typecheck:tests` — error 0
- `vitest run tests/session-routing.test.ts tests/session-manager.test.ts tests/session.test.ts tests/ws-order.test.ts` — green(세션 3파일 2회 반복 재실행 green)
- relay 전체: Test Files 46 passed · Tests 1186 passed
- 수용 기준: fanout `acquireFor` 5 · order-handler `forAccount` 4 · `deps.sessions.get(userId)` 0 · manager `updatePassword|closeForDmaUser` 3 · session `setPassword` 2 · session.test `updatePassword|setPassword` 2
- 스키마 푸시: 해당 없음 · 배포 없음(운영 relay 는 29-25 까지 옛 이미지)

## User Setup Required

None.

## Next Phase Readiness

- 29-20(hub 세션 소유 키 → 교보 세션 acquire 켜기) · 29-21(87 반영 → updatePassword/closeForDmaUser 결선) · 29-22(주문 서버 배지 — `session.serverKey`)가 이 위에 선다.

## Self-Check: PASSED

- FOUND: relay/tests/session-routing.test.ts · relay/src/dma/session-manager.ts · relay/src/dma/session.ts
- FOUND commits: 1cd3b765 · 1bcbbd0d (HEAD 조상)
