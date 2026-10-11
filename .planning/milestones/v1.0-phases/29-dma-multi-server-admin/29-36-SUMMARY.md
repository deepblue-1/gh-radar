---
phase: 29-dma-multi-server-admin
plan: 36
subsystem: relay
tags: [relay, dma, g-1, wr-05, order-server, resync, strategy-sweep, websocket, tdd]
requires:
  - phase: 29-43
    provides: "StrategySweeper.sweep · StaleStrategyRegister · healthz accountOrderServers · servers/status staleAccounts 선택 deps"
  - phase: 29-35
    provides: "hub 다중 서버 공존 · 소유 필터 · preferredPrimaryServerKey · 새 세션 ready → 25 → 66"
  - phase: 29-33
    provides: "AccountOrderServers changed(dmaUserIds) · createOrderServerRouting(serversFor · ownerOf) · acquireOn (유저, 서버)"
  - phase: 29-42
    provides: "세션 키 (유저, 서버) 하나 · order.server 표식 제거"
  - phase: 29-29
    provides: "gh-trade-84 ②(가) 확정 — 주문 서버를 바꾸면 옛 서버 전략을 꺼야 한다 · 「즉시 재접속」 사용자 확정"
provides:
  - "SessionManager.dropUser(userId, reason) — 그 사용자 세션 전부 유예 없이 닫고 지움(유예 중 포함)"
  - "WsFanout.resyncChangedUsers(reason) — 사용자별 서명(원하는 서버 키 · 계좌 소유 서버) 비교 → 옛 서버 전략 끄기 → dropUser · wss 1012"
  - "사용자별 직렬 체인 #resyncChain — 진행 중 sweep 세션을 뒤 변경이 닫지 않는다(체커 W3)"
  - "fail closed — 끄기 미확인 · 자격증명 없음은 레지스터 · warn 1줄 · 상태 프레임 staleStrategies"
  - "상태 프레임 계좌 serverKey · movedFrom · staleStrategies (shared RelayAccount 선택 필드 셋)"
  - "index 결선 — 지정 적재기 changed · 레지스트리 changed → resyncChangedUsers · healthz accountOrderServers/staleStrategies · admin staleStrategies"
affects: [29-38, 29-39, 29-40, 29-41, 29-44]
actuals:
  tokens: 28846
  tasks: 2
  commits: 5
plan_head_before: 9f31e03d52409f7f45939ab4590d11cbcde3788e
plan_head_after: 33f7013e3b8c3a9de50d5c5a3c1a65a95ae6e324
tech-stack:
  added: []
  patterns:
    - "서명 기록은 「처음 본 계좌만」 — 지정 변경이 이벤트보다 먼저 사본에 반영돼도 옮겨짐을 삼키지 않는다 · servers 는 세션을 실제로 연 자리(인증 · 세션 추가)에서만 갱신"
    - "사용자별 직렬 체인 — prev.then(run, run) · 같은 꼬리일 때만 제거 · 실행 시점에 서명 재계산"
    - "재수립 = 쥔 서버 목록 비움 → entry · 서명 · hub 결선 버림 → dropUser → close 1012 (close 경로가 지운 세션을 release 하지 않는다)"
    - "movedFrom 수명 — 재수립 뒤 첫 결선 세션 WeakSet · 뒤 결선에 그 세션이 하나도 없으면(유예 만료) 삭제"
key-files:
  created:
    - relay/tests/order-server-resync.test.ts
    - .planning/phases/29-dma-multi-server-admin/.red/29-36-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-36-task2-red.json
  modified:
    - relay/src/dma/session-manager.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - packages/shared/src/relay.ts
    - relay/tests/session-manager.test.ts
key-decisions:
  - "29-36: 옮겨짐 판정 = 기록된 계좌 소유 서버 ↔ 지금 소유 서버(지금 어느 세션도 선언하지 않는 계좌는 제외) · 재수립 = 옮겨짐 있음 OR 원하는 서버 키 집합 변화"
  - "29-36: 서명의 계좌 소유는 처음 본 값만 기록(인증 · 세션 추가 · 세션 state/accounts 이벤트) — 재수립 · 마지막 연결 소멸 때만 지운다. 원하는 서버 집합은 인증 · 세션 추가에서만 갱신"
  - "29-36: 재수립 때 hub.retainSessions(userId, ∅) 로 그 사용자 hub 결선 · 캐시를 비운다 — 재접속 새 세션 ready → 25 → 66 이 다시 채운다(옛 서버 몫 캐시가 새 탭 스냅샷으로 새지 않게)"
  - "29-36: 레지스터 remaining 은 서버별 sweep 대상 계좌가 1개일 때만 그대로, 여럿이면 null(계좌별 수를 모름) — warn 의 N건은 그 서버 대상 전체 수"
  - "29-36: index StrategySweeper.targetOf 는 꺼진(enabled false) 서버도 대상 — 꺼짐은 relay 라우팅 결정일 뿐 그 서버 전략은 계속 돌고, 재수립 대상 사용자는 그 세션을 아직 쥐고 있어 acquireOn 이 재사용한다"
  - "29-36: 상태 프레임 serverKey 는 단일 세션 사용자에게도 싣는다(표시용 · 판정 근거 아님) — 기존 fanout 테스트 무수정 통과"
patterns-established:
  - "G-1 주문 서버 변경 = 끄기(옛 서버 · 29-43 sweeper 하나) → 확인/시한 → 재수립(dropUser · 1012) → 25→66 — fanout 은 14 · 11 을 직접 조립하지 않는다"
requirements-completed: [ADMIN-06]
coverage:
  - id: D1
    description: "트레이서 — 지정 변경(A → KB121) → KB120 에서 A 전략만 끄기(24 · 21 · 21 · 14 · 재조회 24 · 21 · 21)가 dropUser 보다 먼저 · u1 두 탭 1012 · KB120 재로그인 0 · u2 무영향 · 재접속 → KB120(B) · KB121(A) ready → 25 각 1 → 66 → A 주문 KB121 에만 · 같은 지정 재적재 → 재수립 0 · sweep 0 · 지워진 세션 release warn 0"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#① 트레이서"
        status: pass
    human_judgment: false
  - id: D2
    description: "fail closed — 65 미수신 → 단계 시한 timeout → warn 1줄(계좌 · DMA id · 키 없음) · 레지스터 { KB120, A, remaining 1, timeout } · 그래도 1012 · 재접속 상태 프레임 A staleStrategies { KB120, 1 } · B 없음"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#② 끄기 미확인"
        status: pass
    human_judgment: false
  - id: D3
    description: "소유자 없음 전이(KB121 매핑에 A 없음) — KB120 에서 A 끄기 1회 · B 키 0 · 재접속 뒤 A 소유 세션 없음(fail closed)"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#③ 소유자 없음 전이"
        status: pass
    human_judgment: false
  - id: D4
    description: "연달아 두 번(체커 W3) — 지연 래퍼로 앞 sweep 진행 중 두 번째 변경 → 세션 생존 · close 0 · dropUser 0 → 풀면 실 sweep ok · dropUser 1 · 1012 · 두 번째는 0 · 재접속은 최신 지정"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#④ 연달아 두 번"
        status: pass
    human_judgment: false
  - id: D5
    description: "자격증명 null · not_ready · throw → sweep 0 · 레지스터 no-session(count null) · warn 1줄 · 1012 진행 · 재접속 A staleStrategies { KB120, null }"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑤ 자격증명 (3 cases)"
        status: pass
    human_judgment: false
  - id: D6
    description: "SessionManager.dropUser — 유예 중 포함 전부 즉시 닫고 지움 · 다른 사용자 무영향 · 다음 acquire 새 로그인 · 로그 DMA id 없음"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/session-manager.test.ts#dropUser (29-36 G-1)"
        status: pass
    human_judgment: false
  - id: D7
    description: "증권사 기본 주문 서버 KB120 → KB121 — u1 · u2 각자 계좌 키만 끈 뒤 각자 1012 · 전부 KB121 지정 u3 0 · 재접속 u1 = KB121 · 25 → 66 · 주소 · 안 쓰는 서버 끄기뿐이면 0"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑥ ⑦"
        status: pass
    human_judgment: false
  - id: D8
    description: "상태 프레임 계좌 serverKey(단일 세션 포함) · movedFrom(옮겨진 계좌만 · 세션 재사용 유지 · 다음 재수립 교체 · 세션 소멸 시 삭제) · shared 선택 필드 · webapp typecheck"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑧ 상태 프레임 계좌 serverKey · movedFrom"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
    human_judgment: false
  - id: D9
    description: "index 결선 — 지정 적재기 changed · 레지스트리 changed → resyncChangedUsers · healthz accountOrderServers(entries 서버별 계수 + 저널 health) · staleStrategies · admin router staleStrategies"
    requirement: "ADMIN-06"
    verification:
      - kind: other
        ref: "grep resyncChangedUsers · accountOrderServers · staleStrategies relay/src/index.ts + relay typecheck"
        status: pass
    human_judgment: true
    rationale: "부팅 결선 단위 테스트 없음(29-28 D5 선례) — 운영 healthz · 실서버 재수립 확인은 29-41 몫"
  - id: D10
    description: "회귀 — 전체 relay 스위트(fanout · fanout-multi-session · session-routing · strategy-sweeper 포함)"
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (56 files · 1366 tests)"
        status: pass
    human_judgment: false
duration: 17min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 36: 주문 서버 변경 즉시 적용 — 옛 서버 전략 끄기 → 재수립 → 25→66 Summary

**계좌 지정 또는 증권사 기본 주문 서버가 바뀌면 relay 가 영향받는 연결 중 사용자마다 옛 서버 세션에서 옮겨지는 계좌의 활성 전략을 `StrategySweeper` 로 끈 뒤(못 끄면 레지스터 · warn · 상태 프레임 `staleStrategies`) 세션을 유예 없이 닫고 wss 1012 로 재접속시켜, 새 서버 세션 ready → 25 → 66 으로 계좌 상태를 다시 맞추고 그 계좌 주문을 새 서버로 보낸다**

## Performance

- **Duration:** 17 min
- **Started:** 2026-10-10T15:46:12Z
- **Completed:** 2026-10-10T16:03:10Z
- **Tasks:** 2 (TDD — 커밋 4 · 측정 구간에 동시 세션 quick 커밋 1 포함)
- **Files modified:** 6 (+ RED 증거 2)

## Accomplishments

- WR-05 해소 · G-1 missing (c) 의 「주문 서버 바뀜 배지」 자리를 「바꾸면 끄고 바로 옮긴다」 로 채웠다 — 지시 불필요 · 즉시 적용(사용자 확정 2026-10-10 「즉시 재접속」).
- gh-trade-84 ②(가): 순서 고정 — 끄기(29-43 sweeper · 14 키별 · 재조회 확인) → dropUser → 1012. 같은 서버에 남는 계좌 · 다른 사용자 계좌 · 새 서버 전략은 끄지 않고, 미체결 명령(2)은 보내지 않는다.
- fail closed: 끄기 미확인 · 자격증명 없음은 조용히 넘기지 않고 레지스터 · warn 1줄 · 상태 프레임 `staleStrategies` 셋 다 남긴 뒤 재수립은 진행.
- gh-trade-84 ③: 재접속 새 세션마다 hub `ready` → 25(account_no "") → 66 이 그대로 일어남을 스텁 단언으로 고정.
- 상태 프레임 계좌 `serverKey` · `movedFrom` — 29-39 작업대 「주문 서버 KB121 → KB120 — 옛 서버 잔고 · 미체결은 클라(OCX) 대사로」 안내 원천.
- index 결선: 지정 적재기 · 레지스트리 `changed` → `resyncChangedUsers` · healthz `accountOrderServers` · `staleStrategies` · Admin `servers/status` `staleStrategies`. 503 축 · uptime 고정 경로 불변.

## Task Commits

1. **Task 1 RED: 재수립 트레이서 실패 테스트 · dropUser · fanout 골격** - `7a16396f` (test)
2. **Task 1 GREEN: 계좌 주문 서버 변경 즉시 적용(끄기 → 재수립 · 1012 · 25→66)** - `3d9451d8` (feat)
3. **Task 2 RED: 기본 서버 변경 · serverKey · movedFrom 실패 테스트** - `5529181c` (test)
4. **Task 2 GREEN: 기본 서버 변경 결선 · 계좌 serverKey · movedFrom · healthz 결선** - `33f7013e` (feat)

측정 구간(`9f31e03d..33f7013e`, 5 커밋)에는 동시 세션의 `799d928f chore(quick-261011-0yb)`(relay 생성물 재동기화)가 끼어 있다 — 이 플랜 커밋이 아니다.

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `relay/src/dma/session-manager.ts` — `dropUser(userId, reason)`(유예 타이머 해제 · 세션 close · 엔트리 삭제 · info 1줄)
- `relay/src/ws/fanout.ts` — 머리 10 번 문단(G-1 재수립 규칙 · 순서) · deps `sweeper` · `staleStrategies` · `WS_CLOSE_ORDER_SERVER_CHANGED` 1012 · `FanoutSessions.dropUser?` · `resyncChangedUsers` · `resyncUser` · `#enqueueResync`(직렬 체인) · `#resyncIfChanged` · `#currentSignature` · `#recordSignature` · `#movesOf` · `#sweepThenResync` · `#sweepServer` · `#markStale` · `#bindMovedFrom` · `#withAccountExtras`
- `relay/src/index.ts` — `StrategySweeper` · `StaleStrategyRegister` 생성 · fanout deps · 지정 적재기 / 레지스트리 `changed` → `resyncChangedUsers` · healthz · admin deps · 머리 결정 근거 D-10 → G-1
- `packages/shared/src/relay.ts` — `RelayAccount.serverKey?` · `movedFrom?` · `staleStrategies?`
- `relay/tests/order-server-resync.test.ts` — 10 케이스(① 트레이서 ~ ⑧ · ⑤ 는 3갈래)
- `relay/tests/session-manager.test.ts` — `dropUser` 단위

## Decisions Made

- 옮겨짐 = 기록된 계좌 소유 서버 ↔ 지금 소유 서버(지금 어느 세션도 선언하지 않는 계좌는 87 축소 등이라 제외). 재수립 = 옮겨짐 있음 OR 원하는 서버 키 집합 변화.
- 서명의 계좌 소유는 「처음 본 값만」 기록 — 인증 시점엔 세션이 아직 계좌를 모르므로 세션 `state` · `accounts` 이벤트에서도 새 계좌를 더하고, 이미 기록된 계좌는 재수립 · 마지막 연결 소멸 때만 지운다. 원하는 서버 집합은 세션을 실제로 연 자리에서만 갱신(이벤트가 덮으면 「서버는 늘었는데 세션은 그대로」 를 삼킨다).
- 재수립 때 `hub.retainSessions(userId, ∅)` 로 그 사용자 hub 결선 · 캐시를 비운다 — 25→66 이 다시 채운다.
- 레지스터 계좌별 `remaining` 은 그 서버 sweep 대상이 1계좌일 때만 그대로, 여럿이면 null.
- `targetOf` 는 꺼진 서버도 대상 — 꺼짐은 relay 라우팅 결정일 뿐 그 서버 전략은 계속 돈다.
- `serverKey` 는 단일 세션 사용자에게도 싣는다(표시용).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED 커밋에 API 골격 포함 · shared `staleStrategies?` 를 Task 1 에서 추가**
- **Found during:** Task 1 RED
- **Issue:** 새 메서드(`dropUser` · `resyncChangedUsers`)와 상태 프레임 `staleStrategies` 단언이 typecheck:tests 를 통과하려면 골격과 shared 필드가 먼저 있어야 한다(플랜은 shared 를 Task 2 파일로 적었다).
- **Fix:** RED 커밋에 「0 반환 · 아무것도 하지 않음」 골격과 `RelayAccount.staleStrategies?` 를 넣었다. Task 2 RED 는 `serverKey?` · `movedFrom?` 를 더했다.
- **Files modified:** relay/src/dma/session-manager.ts · relay/src/ws/fanout.ts · packages/shared/src/relay.ts
- **Committed in:** 7a16396f · 5529181c

**2. [Rule 1 - Bug] ⑧ 테스트 — 유예 만료 단언 전 서버 close 경로 대기**
- **Found during:** Task 2 GREEN
- **Issue:** 클라 close 직후 가짜 시계를 밀어 서버 `#onClose` 의 release(유예 예약)보다 먼저 시간이 가 유예가 만료되지 않았다(테스트 순서 결함).
- **Fix:** `connectedUsers()` 에서 u1 이 빠질 때까지 기다린 뒤 시계를 민다.
- **Files modified:** relay/tests/order-server-resync.test.ts
- **Committed in:** 33f7013e

**3. [Rule 2 - Missing Critical] `StrategySweeper.targetOf` 가 꺼진 서버도 대상**
- **Found during:** Task 1 GREEN(index 결선)
- **Issue:** 꺼진 서버를 `undefined` 로 접으면 Admin 이 옛 서버를 끄면서 기본 서버를 바꾼 경우 끄기가 늘 `no-session` 이 된다 — 그 서버 프로세스 전략은 계속 돈다(gh-trade-84 ②(가) 위반).
- **Fix:** 레지스트리 행이 있으면 enabled 와 무관하게 대상을 준다(재수립 대상 사용자는 그 세션을 쥐고 있어 새 로그인 없이 재사용).
- **Files modified:** relay/src/index.ts
- **Committed in:** 3d9451d8

---

**Total deviations:** 3 auto-fixed (1 blocking · 1 test bug · 1 missing critical)
**Impact on plan:** 범위 확장 없음 — TDD 게이트 순서 조정 · 테스트 순서 결함 · (가) 를 꺼진 서버에도 지키는 결선.

## TDD Gate Compliance

- **Task 1 RED** — 목표 `order-server-resync > ① 트레이서` 가 계획 단언 지점(지정 변경 뒤 u1 두 탭 1012)에서 실패(`resyncChangedUsers` 골격). junit → classifier `RED_EVIDENCE_OK`(target_test_failed · 31 수집 · 23 pass · 8 fail). 의미 판정: 로드 · 문법 · 픽스처 오류 없음, ②~⑤ · dropUser 단위(expected 0 to be 2)도 같은 미구현.
- **Task 2 RED** — 목표 `⑧ 상태 프레임 계좌 serverKey · movedFrom` 가 첫 단언(단일 세션 계좌 serverKey)에서 AssertionError. `RED_EVIDENCE_OK`. ⑥ 은 기본 서버 변경 재수립 전 과정이 Task 1 구현으로 이미 통과하고 마지막 serverKey 단언에서만 실패, ⑦(서명 같음 → 0)은 회귀 고정으로 처음부터 green.
- **Tracer gate** — Task 1(type tracer) 뒤 `<verify>`(shared build · typecheck 2 · 4 테스트 파일 64 케이스)를 다시 돌려 green → 확장(Task 2) 진행.
- 증거: `.planning/phases/29-dma-multi-server-admin/.red/29-36-task{1,2}-red.json`. REFACTOR 커밋 없음.

## Issues Encountered

- 동시 세션(quick-261011-0yb)이 같은 작업 트리에서 `packages/shared/src/relay.ts` · `relay/src/dma/envelope.ts` · `relay/src/ws/protocol.ts` 를 고치는 중이었다(미커밋) — 이 플랜 커밋은 경로 지정으로 자기 파일만 담았다. RED 1 의 shared 변경은 그 세션 편집 전 커밋이다.
- `gsd-tools windows append` 는 기록할 스텁 · 미실행 verify 가 없어 부르지 않았다.

## Known Stubs

없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 29-38: `/admin/servers` 「기본 주문 서버」 표기 · 하단 안내 · 계좌 줄 안내를 「바꾸면 옛 서버 전략을 끄고 즉시 재접속」 규칙으로 맞춘다 · 서버 카드 `staleAccounts`.
- 29-39: 작업대가 상태 프레임 계좌 `serverKey` · `movedFrom` · `staleStrategies` 를 그린다(선택 필드 — 소비자 무수정 typecheck 통과).
- 29-44: 연결 없는 사용자(서명 없음 → 이 플랜은 손대지 않는다) · 로그인 백스톱 · 레지스터 재시도(`pendingFor` · `attempts`). ④ 의 C 처럼 앞 재수립 뒤 연결이 없을 때 온 변경의 옛 서버 잔여 전략도 그 몫이다.
- 29-41: 운영 healthz `accountOrderServers` · 실서버 재수립 확인.
- ADMIN-06 플래그 가정(G-1 대체)은 29-40 REQUIREMENTS 등록 때 문구 정정 — 그대로 유효.
- `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`(open)는 범위 밖이라 손대지 않았다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*

## Self-Check: PASSED

- 파일: order-server-resync.test.ts · fanout.ts · session-manager.ts · index.ts · shared relay.ts · RED 증거 2 존재
- 커밋 4개(7a16396f · 3d9451d8 · 5529181c · 33f7013e) HEAD 조상 · evaluation-scope resolved(plan-subjects)
- 태스크 acceptance grep 전부 통과(builders 4 = 29-42 뒤 4) · 플랜 verify 두 번(Task 1 64 · Task 2 109 + webapp typecheck) · 전체 relay 56 files · 1366 green
