---
phase: 29-dma-multi-server-admin
plan: 54
subsystem: relay
tags: [relay, dma, g-1, kill-switch, strategies-disable, hub, strategy-sweep, gap-closure, n-01, tdd]
requires:
  - phase: 29-49
    provides: "hub 세션 대여 lendSession · #lent · 대여 중 65 억제(GC-03) — 이 플랜이 송신자 꼬리표로 사용자 65 를 되살린다"
  - phase: 29-51
    provides: "소유 키별 VI 원천 · G-1 하네스(KB120 · KB121) — 「증권사 축 유지 · 서버 축만 넓힘」 모양"
  - phase: 29-52
    provides: "sweeper 14 송신 루프 · fanout #sweepServer lend 결선(29-49) 위 최신 상태"
provides:
  - "SubscriptionHub.beginAllStop(userId, sessions): HubAllStop { sent · failed · done } — 세션별 65 를 모아 strategies.disabled 1건(답한 세션 ≥ 1)"
  - "SubscriptionHub.noteUserDisable(session) · HubSessionLease.noteDisableSent() — 소유 키별 14 송신자 꼬리표 FIFO(sweeper · user · 집계)"
  - "HUB_ALL_STOP_COLLECT_MS(5초 · 웹 8초 백스톱 안) · HUB_DISABLE_SENDER_MAX_AGE_MS(30초 — 오래된 꼬리표 버림 warn) · SubscriptionHubOptions.allStopCollectMs"
  - "fanout #allStopTargets(userId, primary) — primary 먼저 + 같은 증권사의 쥔 세션 전부 · 빈 키 strategies.disable 다중 대상 집계 경로(#allStop)"
  - "ALL_STOP_PARTIAL_TEXT(serverKeys) — 부분 실패 시 요청 탭 msg ERROR(kind strategies.disable)"
  - "strategy-sweeper: 14 송신 성공 직후 lease?.noteDisableSent?.()"
affects: [29-53, ADMIN-06]
actuals:
  tokens: 10241
  tasks: 2
  commits: 4
plan_head_before: 7e544170b793438c0d0d2f1ac9ae2e16d113b65e
plan_head_after: c40ebf5d5e4906737d53f5e69a495904a8dcc385
tech-stack:
  added: []
  patterns:
    - "응답 송신자 꼬리표 FIFO — 같은 연결의 같은 요청(14)을 여러 주체가 보낼 때, 보낸 직후 송신자를 쌓고 응답(65)마다 머리를 뺀다. 서버가 요청을 순서대로 처리하고 응답이 그 처리의 마지막 프레임이라 정확히 짝지어진다. 오래된 꼬리표는 응답 유실로 보고 버린다"
    - "다중 세션 명령 집계 — 대상이 2개 이상일 때만 집계 경로(대상 1개는 종전 바이트 그대로). 모든 대상 답 · 실패 · 시한 중 먼저 오는 것으로 끝내고, 답한 몫만 1건으로 모아 낸다. 답 0 이면 지어내지 않는다"
key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-54-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-54-task2-red.json
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - relay/src/dma/strategy-sweeper.ts
    - relay/tests/fanout-multi-session.test.ts
    - relay/tests/hub-multi-session.test.ts
    - relay/tests/strategy-sweeper.test.ts
key-decisions:
  - "29-54: 전부 정지 대상 = primary 와 같은 증권사의, 그 사용자가 쥔 세션 전부(primary 먼저 · 소유 계좌 0 세션 포함). 다른 증권사 세션(KB primary 사용자의 교보)은 오늘처럼 대상이 아니다 — D-18 증권사 축 유지 · 서버 축만 넓힘"
  - "29-54: 대상이 2개 이상 · Ready 1개 이상일 때만 hub 집계 경로다. 대상 1개(지정 0 운영)는 종전 #strategySession 경로 그대로이고 hub 에 user 꼬리표만 더한다"
  - "29-54: 65 귀속은 소유 키별 14 송신자 FIFO(sweeper · user · 집계)다. 그래서 대여 중에도 사용자 14 의 65 는 사용자에게 간다 — 29-49 의 「대여 중 사용자 65 억제」 수용을 거뒀다. 꼬리표 없는 65(서버 발)는 29-49 규칙 그대로"
  - "29-54: 부분 실패(시한 · 미준비 · 송신 실패 · 분리)는 기존 msg ERROR 프레임(kind strategies.disable)에 실패 서버 키를 실어 요청 탭에만 알린다. 브라우저 계약 무변경. 답 0 이면 strategies.disabled 를 내지 않는다(웹 8초 백스톱)"
  - "29-54: 해석하지 못한 65 도 그 14 의 짝이라 꼬리표 머리는 뺀다(뒤 꼬리표가 밀리지 않게). 집계 대상이면 시한 갈래가 맡는다"
patterns-established:
  - "같은 세션을 여러 주체(사용자 · sweeper · 집계)가 쓰는 요청의 응답은 송신 순서 꼬리표로 주인을 가른다 — 표식(대여 여부)만으로 가르지 않는다"
requirements-completed: [ADMIN-06]
coverage:
  - id: D1
    description: "N-01 트레이서 — KB120 기본(B) + KB121 지정(A) 사용자의 전부 정지가 두 서버에 빈 키 14 각 1 · 브라우저 strategies.disabled 정확히 1건 { count 2 } · 두 서버 lc 에코 뒤 · msg 0"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#N-01 (29-54) 트레이서 — 전부 정지(빈 키)는 KB120 · KB121 두 세션에 빈 키 14 각 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "운영 보존 — KB120 + KYOBO119 사용자의 전부 정지는 오늘과 같다(KB 14 1 · 교보 14 0 · strategies.disabled { count 1 }) · 단일 세션 ⑲ · 꼬리표 없는 65 ⑧ 무수정 green"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#N-01 (29-54) 운영 보존 — KB120 + KYOBO119 사용자의 전부 정지는 오늘과 같다"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑲ key 를 생략한 strategies.disable 은 msg_type 14 에 빈 키로 나간다"
        status: pass
      - kind: unit
        ref: "relay/tests/strategy-hub.test.ts#⑧ 65 는 완료 신호일 뿐 캐시를 고치지 않는다"
        status: pass
    human_judgment: false
  - id: D3
    description: "hub 집계 — 두 65 합 · OR 1건 · 시한 → 답한 몫 1건 · 늦은 65 팬아웃 0(info) · 답 0 → 0건 · 즉시 해결"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#N-01 두 65 뒤에만 1건 · 합 · OR"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#N-01 시한 → 답한 몫 1건 · 늦은 65 팬아웃 0 · info 1줄"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#N-01 답 0 → strategies.disabled 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "부분 실패 알림 — KB121 65 없음(시한) · KB121 미준비 → strategies.disabled 1건(KB120 몫) + 요청 탭 msg ERROR(kind strategies.disable · 문구에 KB121)"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#N-01 (29-54) 부분 실패 — KB121 65 없음"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#N-01 (29-54) KB121 미준비(로그인 무응답)"
        status: pass
    human_judgment: false
  - id: D5
    description: "29-49 대여 맞물림 — sweeper 14 의 65 는 집계 · 팬아웃 0(두 순서) · 대여 중 user 꼬리표 65 는 팬아웃 1 · 대여 중 꼬리표 없는 65 는 0 · sweeper 가 14 송신 성공마다 noteDisableSent 1 · 실패 0"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#N-01 대여 중 sweeper 65 는 집계 0 · 사용자 65 는 집계 — 두 순서"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#N-01 대여 중 user 꼬리표 65 → 팬아웃 1(29-49 수용 거둠)"
        status: pass
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#N-01 (29-54) — 14 송신 성공마다 lease.noteDisableSent 1회"
        status: pass
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#GC-03 · GC-04 (29-49) 트레이서 — 실 hub 결선 (무수정 green)"
        status: pass
    human_judgment: false
  - id: D6
    description: "정리 · 위생 — 분리 · 교체는 그 세션 꼬리표 비움 · 진행 중 집계 대상 detached · closeAll 은 팬아웃 없이 done 해결 · 타이머 0 · 30초 넘은 꼬리표 버림(warn) · 결선 안 된 세션 무동작"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#N-01 분리 · 교체 · closeAll 정리"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#N-01 30초 넘은 꼬리표 버림"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#N-01 결선 안 된 세션"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (57 파일 · 1491)"
        status: pass
    human_judgment: false
  - id: D7
    description: "두 번째 KB 서버를 켠 운영에서 웹 「전부 정지」 의 in-flight 창 · 「전부 정지 때문에 꺼짐」 귀속 · 부분 실패 문구가 실제 화면에서 자연스러운지"
    verification: []
    human_judgment: true
    rationale: "relay 는 스텁 게이트웨이로 순서(모든 서버 에코 뒤 1건)를 고정했지만 웹 쪽 귀속 창은 이 플랜이 고치지 않은 webapp 코드다. 실 게이트웨이 두 대의 도착 간격과 화면 문구는 운영 관찰이 필요하다(운영은 지정 0 이라 아직 새 경로를 타지 않는다 · 배포는 메인 세션 몫)"
duration: 10min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 54: 전부 정지 primary 증권사 세션 전부 · 세션별 65 집계 (N-01) Summary

**웹 「전부 정지」(빈 키 `strategies.disable`)가 이제 primary 와 같은 증권사의 세션 전부(KB120 · KB121)로 간다. 세션별 65 는 hub 가 소유 키별 14 송신자 꼬리표로 귀속해 `strategies.disabled` 1건으로 모은다. 그 1건은 모든 서버의 60 에코 뒤에 온다. 답하지 않은 서버는 기존 ERROR 프레임에 서버 키를 실어 알린다. 지정 0 인 운영 사용자는 오늘과 바이트 단위로 같다.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-11T02:02:16Z
- **Completed:** 2026-10-11T02:12:28Z
- **Tasks:** 2 (TDD — 커밋 4)
- **Files modified:** 6 (+ RED 증거 2)

## Accomplishments

- **N-01 닫음.** G-1 로 KB121 에 지정한 계좌의 상따 · VI 도 「전부 정지」 로 멈춘다. kill switch 가 거짓 안심을 주지 않는다.
  - 트레이서: KB120 · KB121 스텁이 빈 키 14 를 1건씩 받는다. 브라우저는 `strategies.disabled { count: 2 }` 를 정확히 1건 받는다.
  - 그 1건은 A(KB121) · B(KB120) 의 `lc` 에코 둘 다보다 뒤에 온다. 웹 in-flight 창의 「전부 정지 때문에 꺼짐」 귀속이 KB121 에코까지 덮는다.
- **대상 범위.** primary 먼저, 그다음 그 사용자가 쥔 세션 중 같은 증권사인 것 전부다(소유 계좌 0 세션 포함 — 끄는 방향이라 넓게). 다른 증권사 세션은 대상이 아니다.
- **집계(hub `beginAllStop`).** 대상이 2개 이상 · Ready 1개 이상일 때만 연다.
  - 대상마다 14 를 즉시 보낸다. 대여 · sweep 을 기다리지 않는다(kill switch).
  - 모든 대상이 답하거나, 실패하거나, 시한(`HUB_ALL_STOP_COLLECT_MS` 5초 — 웹 8초 백스톱 안)이 오면 끝난다.
  - 답한 세션이 1개 이상이면 1건(count 합 · viDisabled OR)을 낸다. 답 0 이면 지어내지 않는다.
  - 집계가 끝난 뒤 늦게 온 65 는 팬아웃하지 않는다(info 1줄).
- **부분 실패.** 시한 · 미준비 · 송신 실패 · 분리가 있으면 요청 탭에 `msg` ERROR 1건(`kind: "strategies.disable"`)을 보낸다.
  - 문구: 「전부 정지를 확인하지 못한 서버가 있습니다(KB121) — 그 서버 계좌의 전략이 아직 켜져 있을 수 있습니다. 전략 목록을 확인해 주세요.」
- **29-49 대여와 맞물림.** 소유 키별 14 송신자 FIFO(sweeper · user · 집계)로 65 의 주인을 가른다.
  - sweeper 14 의 65 는 집계에도 팬아웃에도 섞이지 않는다(두 순서 모두).
  - 사용자 14 의 65 는 대여 중에도 사용자에게 간다.
  - 꼬리표 없는 65(서버 발)는 29-49 규칙 그대로다(대여 중 억제 · 아니면 팬아웃).
- **위생.** 30초 넘은 꼬리표는 65 유실로 보고 버린다(warn 1줄 — userId · 서버 키 · 버린 수).
  - 교체 · 분리는 그 세션 꼬리표를 지우고 진행 중 집계의 그 대상을 `detached` 로 끝낸다.
  - `closeAll` 은 모든 집계를 팬아웃 없이 끝내고 `done` 을 해결한다(타이머 0).
- **브라우저 계약 무변경.** `packages/shared/src/relay.ts` · webapp 은 고치지 않았다. relay 전량은 57 파일 · 1491 건 green 이다.

## Task Commits

1. **Task 1 RED: N-01 트레이서 · 운영 보존 실패 테스트** — `45233cf8` (test)
2. **Task 1 GREEN: 전부 정지를 primary 증권사 세션 전부로 · 세션별 65 집계** — `bc432326` (fix)
3. **Task 2 RED: 부분 실패 · sweeper 꼬리표 · 대여 맞물림 · 정리 · 오래된 꼬리표 실패 테스트 + API 골격** — `e38d01ef` (test)
4. **Task 2 GREEN: 부분 실패 알림 · 꼬리표로 sweep 대여와 분리 · 정리** — `c40ebf5d` (fix)

## TDD 기록

- **Task 1 RED** `45233cf8`: 증거는 `.red/29-54-task1-red.json` 이다(JUnit · `RED_EVIDENCE_OK`). 16 수집 · 실패 1 · errors 0.
  - 목표 「N-01 (29-54) 트레이서」 는 `allStopsOf(p121) === 1` 단언에서 `expected +0 to be 1` 로 실패했다.
  - 의미 판정: KB120 의 14 · 65 로 `strategies.disabled` 1건이 온 뒤 KB121 14 가 0 이다. N-01 그대로다.
  - 운영 보존 케이스는 오늘 동작이라 RED 에서도 green 이다(보존 단언이지 RED 목표가 아니다).
- **Task 1 GREEN** `bc432326`: 트레이서 · 운영 보존 green. ⑲ · ⑧ · 29-20 · 29-35 · 29-51 기존 케이스 무수정 green.
- **트레이서 게이트:** interactive · end-of-phase · `<automated>` 만이라 verify 재실행으로 통과(3 파일 · 133) 뒤 확장했다.
- **Task 2 RED** `e38d01ef`: 증거는 `.red/29-54-task2-red.json` 이다(JUnit · `RED_EVIDENCE_OK`). 100 수집 · 실패 6 · errors 0.
  - 목표 「N-01 분리 · 교체 · closeAll 정리」 는 `detachDone.value` 가 undefined 라 실패했다(정리 갈래 미구현).
  - 다른 실패 5건도 모두 Task 2 미구현 몫이다: sweeper 꼬리표 없음(대여 두 순서) · 30초 버림 없음 · fanout ERROR 없음(시한 · 미준비) · sweeper noteDisableSent 0회.
  - RED 커밋의 API 골격은 `HUB_DISABLE_SENDER_MAX_AGE_MS` 상수와 무동작 `noteDisableSent` 다(29-44 관례).
- **Task 2 GREEN** `c40ebf5d`: Task 2 verify 7 파일 · 355 green.
- REFACTOR 커밋은 없다(정리할 것이 없었다).

## Files Created/Modified

- `relay/src/hub/subscription-hub.ts` — `beginAllStop` · `noteUserDisable` · 14 송신자 FIFO(`#disableSenders` · `#takeDisableSender` · `#dropDisableSenders`) · 65 갈래 · 대여 `noteDisableSent` · 정리 · 상수 2 · 머리 문단
- `relay/src/ws/fanout.ts` — `#allStopTargets` · `#allStop` · 빈 키 분기 · 단일 대상 `noteUserDisable` · `ALL_STOP_PARTIAL_TEXT` · D-01 머리 한 줄
- `relay/src/dma/strategy-sweeper.ts` — `lend` 반환 타입에 선택 `noteDisableSent` · 14 송신 성공 직후 `lease?.noteDisableSent?.()`
- `relay/tests/fanout-multi-session.test.ts` — 트레이서 · 운영 보존 · 부분 실패 2 · G-1 하네스 hub `allStopCollectMs: 300`
- `relay/tests/hub-multi-session.test.ts` — describe 「전부 정지 집계 (29-54 · N-01)」 8건
- `relay/tests/strategy-sweeper.test.ts` — 14 송신 성공마다 noteDisableSent 1 · 실패 0 · 없는 대여 종전

## 운영 확인 기록

- **오늘의 `strategies.disable` 경로(코드 근거).** fanout 의 `strategies.disable` 분기는 `#strategySession(conn, userId, t)` 를 부른다.
  - 계좌가 없는 명령이라 `forAccount` 를 건너뛰고 `this.#sessions.primaryOf(userId)` 하나를 고른다(선호 서버 = KB 기본 주문 서버 → 첫 KB → 첫 세션).
  - 그 뒤 `#readySession` 이 세션 없음 → 미준비 순으로 거른다.
  - 그래서 KB · 교보 둘 다 가진 사용자의 교보(KYOBO119) 세션에는 오늘 14 가 닿지 않는다. 교보만 가진 사용자는 KYOBO119 가 primary 라 닿는다.
- **이 플랜은 그 증권사 범위를 그대로 두었다.** 대상은 primary 와 같은 증권사 세션뿐이다. 근거 테스트: `relay/tests/fanout-multi-session.test.ts` 「N-01 (29-54) 운영 보존 — KB120 + KYOBO119 사용자의 전부 정지는 오늘과 같다」(KB 14 1 · 교보 14 0 · `strategies.disabled { count 1 }`).
- **29-49 의 「대여 중 사용자 65 억제」 수용을 거뒀다.** 근거 테스트: `relay/tests/hub-multi-session.test.ts` 「N-01 대여 중 user 꼬리표 65 → 팬아웃 1(29-49 수용 거둠)」.

## Decisions Made

- 대상 = primary 증권사 세션 전부(primary 먼저). 다른 증권사는 오늘처럼 제외한다(사용자 결정 「오늘 교보에 닿는지 확인하고 그대로」).
- 대상 1개는 종전 경로다. 꼬리표 push 만 더하고 보이는 결과 · 로그는 같다.
- 65 귀속은 송신 순서 꼬리표다. 대여 표식만으로 가르면 대여 중 사용자 65 가 사라진다.
- 해석하지 못한 65 도 꼬리표 머리는 뺀다. 남기면 뒤 꼬리표가 한 칸씩 밀린다.

## Deviations from Plan

None - plan executed exactly as written.

계획의 재량 안에서 고른 세부 두 가지를 적는다(편차 아님).
- 집계 `answered` · `failed` 는 도착 순이 아니라 대상 순(primary 먼저)이다. 결과가 결정적이다.
- 「결선 안 된 세션 — noteUserDisable · 무동작 대여의 noteDisableSent 는 꼬리표를 넣지 않는다」 케이스 1건을 hub describe 에 더했다(계획 behavior 의 「무동작 대여는 무동작」 단언).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 29-53(전량 회귀 · 배포)이 마지막 wave 다. 이 플랜은 relay 코드 · 테스트만 바꿨고 배포하지 않았다.
- 운영은 지정 0 이라 새 집계 경로를 타지 않는다. 두 번째 KB 서버를 켜기 전에 relay 를 이 커밋 이상으로 배포해야 N-01 이 닫힌 채 켜진다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*

## Self-Check: PASSED

- 파일: `relay/src/hub/subscription-hub.ts` · `relay/src/ws/fanout.ts` · `relay/src/dma/strategy-sweeper.ts` · `.red/29-54-task1-red.json` · `.red/29-54-task2-red.json` 모두 있음
- 커밋: `45233cf8` · `bc432326` · `e38d01ef` · `c40ebf5d` 모두 HEAD 조상 · evaluation-scope(plan 29-54) resolved
- 플랜 verification: 7 파일 · 355 green(Task 2 verify) · relay 전량 57 파일 · 1491 green · `packages/shared` · webapp 변경 0
