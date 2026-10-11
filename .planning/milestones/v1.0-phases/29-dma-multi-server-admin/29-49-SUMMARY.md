---
phase: 29-dma-multi-server-admin
plan: 49
subsystem: relay
tags: [relay, dma, g-1, strategy-sweep, hub, gap-closure, gc-03, gc-04, tdd]
requires:
  - phase: 29-45
    provides: "StrategySweeper releaseSession(객체 반납) · stillStale 옵션 · fanout (사용자, 서버) sweep 레인 · 14 확인 = 그 키 60 에코 뒤 65"
  - phase: 29-35
    provides: "hub primary 선호 서버 · 소유 키(ownerKey) 결선 · #pendingViGets FIFO(사용자 단위 VI 원천)"
provides:
  - "SubscriptionHub.lendSession(session): Promise<HubSessionLease> — sweep 대여(소유 키 표식 #lent · 결선 안 된 세션은 무동작)"
  - "대여 중 그 세션: 자기 21 미룸(refetchVi) · 빈 61 무귀속 · 65 → strategies.disabled 팬아웃 억제 · 본문 61/60/64 는 종전"
  - "대여 전 배수 — hub 미해결 21 이 다 귀속될 때까지 대기 · HUB_LEASE_DRAIN_MS(5초) 상한 → 대기열 비움 · 반납 때 재요청"
  - "#requestViTriggers(userId, owner, session) — Ready 프리페치와 반납이 같은 21 송신 · FIFO 적재 코드"
  - "StrategySweepOptions.lend — acquireOn 뒤 대여(전체 시한 안 · FrameTap.hold) · finally 에서 반납을 releaseSession 보다 먼저"
  - "fanout #sweepServer 가 sweep 옵션 lend: (s) => this.#hub.lendSession(s)"
affects: [29-51, 29-54, ADMIN-06]
actuals:
  tokens: 12460
  tasks: 2
  commits: 4
plan_head_before: 70ab5d1b5432fa47d375387720292324d352d5b5
plan_head_after: 24d71b9995100fdce3ab65f4c6cf53eed44d4459
tech-stack:
  added: []
  patterns:
    - "세션 대여(lease) — 같은 세션을 두 소비자(hub · sweeper)가 쓸 때 한쪽이 빌리는 동안 다른 쪽은 요청을 미루고 응답 귀속 · 팬아웃을 멈춘다. 반납은 미룬 것이 있을 때만 회복 요청 1회"
    - "배수 후 표식 — 빌리기 전에 기존 주인의 미해결 요청이 다 답을 받을 때까지(상한 타이머 경주) 기다린 뒤 표식을 둔다. 상한에 걸리면 대기열을 비우고 반납 때 다시 묻는다"
    - "외부 기다림을 전체 시한에 묶는 FrameTap.hold — 단계 시한 없이 abort 만 받는다. 시한 뒤 늦게 온 대여는 곧장 반납한다"
key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-49-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-49-task2-red.json
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/src/dma/strategy-sweeper.ts
    - relay/src/ws/fanout.ts
    - relay/tests/strategy-sweeper.test.ts
    - relay/tests/hub-multi-session.test.ts
key-decisions:
  - "29-49: GC-03 · GC-04(hub 쪽)를 한 장치로 닫는다 — hub 세션 대여. sweeper 가 세션을 쥐면 hub 에 빌리고, 대여 동안 hub 는 그 세션 몫 21 을 미루고 빈 61 을 귀속하지 않으며 65 를 팬아웃하지 않는다. 결선 위치는 fanout #sweepServer 하나(index 무수정)"
  - "29-49: 반납 때 21 재요청은 hub 가 자기 21 을 미뤘거나(대여 중 Ready · primary 승격) 배수 상한으로 대기열을 비웠을 때만이다. sweeper 의 빈 61 을 무시한 것만으로는 다시 묻지 않는다. 대여가 미룬 프리페치의 회복 1회라 D-13 사용자 단위 재조회 진입점이 아니다"
  - "29-49: 미룬 21 의 반납 재요청은 그 세션이 아직 같은 소유 키 · Ready · primary 일 때만 보낸다. 교체됐으면 새 세션 Ready 가, primary 가 바뀌었으면 #afterPrimaryChange 가 이미 맡았다"
  - "29-49: 대여 중 브라우저가 낸 「전부 정지」의 65 도 억제된다(드묾). 그 60 에코는 그대로 카드를 갱신하므로 수용한다. 세션별 14 송신자 꼬리표로 거두는 일은 29-54(N-01) 몫이다"
  - "29-49: #requestViTriggers 가 대여 중이면 대기열만 새로 비우고 refetchVi 를 남긴다(옛 큐 폐기 규칙 (d) 유지). 그래서 대여 중 primary 승격 · Ready 재진입도 같은 한 자리에서 미뤄진다"
patterns-established:
  - "hub 와 sweeper 가 같은 세션을 써도 그 세션의 미해결 21 은 늘 한 주인의 것이다 — 대여 전 배수 · 대여 중 hub 21 미룸 · sweeper 는 레인(29-45)으로 relay 안에서 하나"
requirements-completed: [ADMIN-06]
coverage:
  - id: D1
    description: "GC-03 — 실 hub 결선 세션에서 sweeper 가 계좌 X 를 끄는 동안 strategies.disabled 0 · 대여가 끝난 세션의 65 는 종전대로 팬아웃 1"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#GC-03 · GC-04 (29-49) 트레이서 — 실 hub 결선"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-04 primary 아닌 세션 대여"
        status: pass
    human_judgment: false
  - id: D2
    description: "GC-04(hub 쪽) — 대여 중 빈 61 무귀속 · 대여 전 hub 미해결 21 배수 · 5초 상한(대기열 비움 · warn · 반납 때 재요청) · Ready 앞 대여의 프리페치 21 미룸 · 반납 때 21(KRX → NXT)"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-04 배수 뒤 해결"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-04 5초 상한"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-04 Ready 앞 대여"
        status: pass
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#GC-03 · GC-04 (29-49) 트레이서 — 빈 61 vi 0 · 21 은 sweeper 4건뿐"
        status: pass
    human_judgment: false
  - id: D3
    description: "sweeper 결선 — 모든 갈래(ok · timeout · send-failed · not-ready · 예외)에서 lend 1 · 반납 1 · 반납이 releaseSession 보다 먼저 · no-session 이면 lend 0 · fanout 이 lend 를 넘김"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#GC-03 (29-49) — lend 1회 · 반납 1회 · 반납은 releaseSession 보다 먼저"
        status: pass
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts (실 hub · fanout 하네스 — 무수정 green)"
        status: pass
    human_judgment: false
  - id: D4
    description: "정리 · 무동작 — 결선 안 된 세션 대여 즉시 무동작 · 같은 소유 키 두 번째 대여는 앞 반납까지 대기 · 교체 · retainSessions 분리 · closeAll 이 표식 · 배수 대기를 정리하고 반납은 옛 세션으로 21 을 보내지 않음"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-04 결선 안 된 세션 무동작"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-04 같은 세션의 두 번째 대여"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-04 교체 · 분리 · closeAll 정리"
        status: pass
    human_judgment: false
  - id: D5
    description: "운영 보존 — 대여가 없으면 hub Ready 프리페치 순서 · 65 팬아웃 · VI 귀속 기존 단언 무수정 green · relay 전량 회귀"
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (57 파일 · 1447)"
        status: pass
    human_judgment: false
  - id: D6
    description: "운영 첫 sweep(지정 변경 · 두 번째 서버 켜기 · relay 재시작 뒤 로그인 백스톱) 때 실 게이트웨이에서 브라우저에 거짓 「전부 정지」가 찍히지 않고 VI 카드 거래소가 흐트러지지 않는지"
    verification: []
    human_judgment: true
    rationale: "스텁 게이트웨이 · 가짜 세션 회귀로 고정했지만 실 게이트웨이의 61 · 65 도착 순서와 Ready 프리페치 겹침은 운영 관찰이 필요하다(지금 운영은 sweep 0회 · 배포는 메인 세션 몫)"
duration: 13min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 49: hub 세션 대여 (GC-03 · GC-04 hub 쪽) Summary

**옛 서버 끄기(sweep)가 hub 가 듣는 세션을 쓸 때, sweeper 는 hub 에 그 세션을 빌린다(`lendSession`). 대여 동안 hub 는 그 세션 몫 21 을 미루고, sweeper 의 빈 61 을 자기 FIFO 로 귀속하지 않으며, 14 의 65 를 브라우저 「전부 정지」 로 팬아웃하지 않는다. 빌리기 전에는 hub 의 미해결 21 이 다 답을 받을 때까지(최대 5초) 기다린다.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-11T00:55:20Z
- **Completed:** 2026-10-11T01:08:08Z
- **Tasks:** 2 (TDD — 커밋 4)
- **Files modified:** 5 (+ RED 증거 2)

## Accomplishments

- **GC-03 닫음.** sweeper 가 연결 중 사용자의 세션으로 옛 서버 계좌를 꺼도, 그 14 의 65 가 사용자의 모든 전략 카드에 「전부 정지가 반영됐어요」를 찍지 않는다.
  - 실 hub 결선 트레이서에서 strategies.disabled 가 1 에서 0 으로 바뀌었다.
  - 대여가 끝난 세션의 65(브라우저 전부 정지 · 서버 발 비활성화)는 종전대로 1 건 팬아웃된다.
- **GC-04(hub 쪽) 닫음.** 한 세션의 미해결 21 은 늘 한 주인의 것이다.
  - 빌리기 전: hub 가 보낸 21 이 남아 있으면 그 61 이 다 귀속될 때까지 대여를 미룬다. 대기 중 온 61 은 종전대로 KRX · NXT 순으로 hub 몫이다.
  - 5초 상한: 넘으면 hub 대기열을 비우고 warn 1줄(userId · 서버 키 · 남은 수)을 남긴 뒤, 반납 때 21 두 거래소를 다시 요청한다.
  - 대여 중: sweeper 의 빈 61 은 귀속 0 이다. 본문 있는 61 · 60 · 64 는 서버 사실이라 캐시 · 팬아웃한다(끈 전략이 카드에서 꺼진다).
  - Ready 앞 대여: hub 는 Ready 에서 25 · 24 · 34 · 43 만 보내고, 21 은 반납 때 보낸다.
- **결선.** fanout `#sweepServer` 가 sweep 옵션 `lend: (s) => this.#hub.lendSession(s)` 를 넘긴다. `relay/src/index.ts` 는 고치지 않았다.
  - sweeper 는 `acquireOn` 뒤에 빌린다. 대여 대기도 전체 시한(20초) 안이다(`FrameTap.hold`).
  - 반납은 finally 에서 `releaseSession` 보다 먼저 한다. 모든 갈래(ok · timeout · send-failed · not-ready · 예외)에서 lend 1 · 반납 1 이다.
- **정리.** 결선 안 된 세션(연결 없는 사용자의 임시 세션)의 대여는 즉시 무동작이다. 교체 · `retainSessions` 분리 · `closeAll` 은 표식과 배수 대기를 지운다. 반납은 옛 세션으로 21 을 보내지 않는다.
- **운영 보존.** 지금 운영은 sweep 0회라 대여도 0회다. hub · strategy-hub · fanout-multi-session · order-server-resync 기존 케이스는 무수정 green 이다. relay 전량은 57 파일 · 1447 건 green 이다.

## Task Commits

1. **Task 1 RED:** GC-03 트레이서 실패 테스트 · lend/반납 순서 · 대여 골격 — `14cd19af` (test)
2. **Task 1 GREEN:** sweep 은 hub 에 세션을 빌린다 — 65 팬아웃 · 빈 61 귀속 억제 — `0993236d` (fix)
3. **Task 2 RED:** hub 대여 실패 테스트 — 배수 · 5초 상한 · Ready 앞 대여 · 무동작 · 교체 정리 — `d0da4aab` (test)
4. **Task 2 GREEN:** 대여 전 hub 미해결 21 배수 · 5초 상한 · 세션 교체 정리 — `24d71b99` (fix)

## TDD Gate Compliance

- **Task 1 RED** (`14cd19af`): 트레이서가 `strategies.disabled` 0 단언에서 1 건으로 실패했다. 실 hub · 실 SessionManager · 스텁 게이트웨이 위에서 sweeper 의 14 → 65 가 hub 팬아웃을 탄 것으로, GC-03 을 그대로 재현한다. lend 순서 케이스도 lend 미호출로 실패했다. 증거는 `.red/29-49-task1-red.json` 이고 판정은 RED_EVIDENCE_OK 다.
- **Task 2 RED** (`d0da4aab`): 「배수 뒤 해결」이 대여 미해결 단언에서 실패했다(Task 1 대여는 즉시 해결). 5초 상한 · 두 번째 대여 대기 · 교체/분리/closeAll 정리 케이스도 계획된 단언에서 실패했다. Ready 앞 대여 · 결선 안 된 세션 · primary 아닌 세션 케이스는 Task 1 동작으로 이미 green 이었고, 행동 고정용으로 남겼다. 증거는 `.red/29-49-task2-red.json` 이고 판정은 RED_EVIDENCE_OK 다.
- **GREEN:** `0993236d` · `24d71b99` 다. REFACTOR 커밋은 없다.
- **Tracer feedback gate:** interactive · end-of-phase · `<automated>` 만이라 verify 를 끝에서 끝까지 재실행했고 통과했다(4 파일 · 102). 그 뒤 Task 2 로 확장했다.

## Files Created/Modified

- `relay/src/hub/subscription-hub.ts` — `lendSession` · `#lent` · `#endLease` · `#drainViGets` · `#settleDrains` · `#leaseTails` · `#requestViTriggers` · `HUB_LEASE_DRAIN_MS` · `HubSessionLease`. `#onFrame` 61 · 65 의 대여 억제, 교체 · 분리 · `closeAll` 정리, 머리 주석 「Phase 29-49 sweep 대여」 문단을 넣었다.
- `relay/src/dma/strategy-sweeper.ts` — `StrategySweepOptions.lend` · `FrameTap.hold`. acquireOn 뒤 대여하고 finally 에서 반납을 세션 반납보다 먼저 한다. 머리 주석을 갱신했다.
- `relay/src/ws/fanout.ts` — `#sweepServer` 의 sweep 옵션에 `lend` 를 넣고, 머리 11 에 대여 한 문장을 넣었다.
- `relay/tests/strategy-sweeper.test.ts` — 실 hub 결선 트레이서와 lend · 반납 순서 케이스.
- `relay/tests/hub-multi-session.test.ts` — describe 「sweep 대여 (29-49 · GC-03 · GC-04)」 7건(가짜 타이머 포함).

## Decisions Made

- GC-03 · GC-04(hub 쪽)를 한 장치(세션 대여)로 닫았다. 플래너 재량을 그대로 따랐고, 결선은 fanout 한 곳이다.
- 반납 재요청은 hub 가 자기 21 을 미뤘거나 대기열을 비웠을 때만 한다. sweeper 의 빈 61 을 무시한 것으로는 다시 묻지 않는다(hub 캐시는 자기 프리페치 · 본문 에코로 이미 맞다).
- 미룬 21 은 반납 시점에 그 세션이 같은 소유 키 · Ready · primary 일 때만 보낸다.
- 대여 중 사용자 14 의 65 도 억제되는 것은 수용했다(드묾 — 60 에코가 카드를 갱신한다). 29-54(N-01)가 세션별 14 송신자 꼬리표로 거둔다.
- `#requestViTriggers` 하나가 Ready 프리페치 · primary 승격 · 반납의 21 을 모두 보내고, 대여 중이면 그 자리에서 미룬다.

## Deviations from Plan

None - plan executed exactly as written.

계획 밖으로 더한 것은 방어 두 가지뿐이고, 둘 다 계획 action 이 명시한 범위 안이다.
- 대여 대기 중 전체 시한이 오면, 늦게 온 대여를 곧장 반납한다. hub 에 표식이 남지 않게 하려는 것이다.
- 21 을 하나도 보내지 못한 경우에도 배수 대기를 끝낸다(`#requestViTriggers` 뒤 `#settleDrains`).

## Issues Encountered

- RED 증거 분류기를 부를 때 리졸버 `.md` 를 셸에 source 해 백그라운드로 넘어간 일이 있었다. `node ~/.claude/gsd-core/bin/gsd-tools.cjs` 로 직접 불러 해결했다. 코드 영향은 없다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- relay 코드 · 테스트만 바뀌었다. 배포(relay VM)는 메인 세션 몫이다. 지금 운영은 지정 0 · 두 번째 서버 꺼짐이라 sweep 0회이고 대여도 0회다.
- 29-51 이 VI 원천을 계좌 소유 세션으로 넓히면, 대여 배수 판정(`#primaryOwner(userId) === owner`)도 그 원천 판정을 따라가야 한다. 표식은 이미 소유 키 단위다.
- 29-54(N-01)가 세션별 14 송신자 꼬리표로 「대여 중 사용자 65 억제」를 거둔다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*

## Self-Check: PASSED

- 변경 파일 3 · RED 증거 2 존재 (FOUND)
- 커밋 14cd19af · 0993236d · d0da4aab · 24d71b99 HEAD 조상 (FOUND) · evaluation-scope resolved
- 수용 기준: hub lendSession 4 · fanout lendSession 1 · #requestViTriggers 4 · HUB_LEASE_DRAIN_MS 5 · #lent 9 · plan 커밋에 relay/src/index.ts 0
- verify: Task 1(4 파일 · 102) · Task 2(6 파일 · 229) · relay 전량(57 파일 · 1447) green
