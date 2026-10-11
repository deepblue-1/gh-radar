---
phase: 29-dma-multi-server-admin
plan: 45
subsystem: relay
tags: [relay, dma, g-1, strategy-sweep, gap-closure, gc-01, gc-04, gc-14, tdd]
requires:
  - phase: 29-36
    provides: "연결 중 재수립 체인(#resyncChain · #sweepThenResync · resyncUser → dropUser → 1012)"
  - phase: 29-43
    provides: "StrategySweeper.sweep(24/21 → 14/11 → 재조회 0) · SweeperSessions 구조 타입"
  - phase: 29-44
    provides: "로그인 백스톱 · 60초 재시도 · sweepMoved · #clearIfOwner · 계좌 키 진행 중 집합 · EffectiveOwnerTracker.snapshotOf"
provides:
  - "SessionManager.releaseSession(userId, session): boolean — 엔트리가 그 객체일 때만 반납(GC-01) · refCountOf(userId, serverKey) 읽기 전용"
  - "SweeperSessions.releaseSession — sweeper finally 가 얻은 세션 객체로 반납(키 반납 면 제거)"
  - "fanout #userSweepsSettled — 재수립 전 그 사용자 진행 중 sweep 전부 대기(최대 3바퀴 · 넘으면 warn 후 진행)"
  - "fanout #sweepLanes((사용자, 서버) 레인 · 다음 sweep 합침) · #laneSweep · #sweepPending — 29-44 #sweepInFlight 대체(GC-04 relay 쪽)"
  - "StrategySweeper 14 확인 = 그 키 60 에코 뒤의 65(GC-04)"
  - "StrategySweepOptions.stillStale · 결과 skippedAccounts · fanout #sweepServer 의 트래커 기준 stillStale · 건너뛴 계좌 #clearIfOwner(GC-14)"
affects: [29-46, 29-49, ADMIN-06]
actuals:
  tokens: 12100
  tasks: 3
  commits: 6
plan_head_before: fb41305b27c74d0bcea6f7ee51e8f3e534a7b10e
plan_head_after: e26595630d5dafdef55113f72bf210ff3f5b40d4
tech-stack:
  added: []
  patterns:
    - "반납은 키가 아니라 얻은 객체로 — 재수립(dropUser) 뒤 같은 키의 새 엔트리를 늦은 반납이 건드리지 않는다(브라우저 close 의 키 반납은 resyncUser 가 쥔 서버 목록을 비워 막는다)"
    - "(사용자, 서버) 레인 = current 1개 + next 1개 — 진행 중 계좌는 current 대기, 나머지는 next 에 합쳐 current 끝난 뒤 1회"
    - "송신 직전 술어(stillStale) — 긴 비동기 절차 중 판정 근거가 바뀌면 그 대상만 건너뛰고 확인 기록 없이 해제"
    - "스텁 조회 답을 silenceQuery 로 막고 sendFrame 으로 늦게 보내 「세션을 얻은 채 멈춘 sweep」 을 만든다(래퍼 앞 게이트는 acquireOn 전이라 반납 경합을 재현하지 못한다)"
key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-45-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-45-task2-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-45-task3-red.json
  modified:
    - relay/src/dma/session-manager.ts
    - relay/src/dma/strategy-sweeper.ts
    - relay/src/ws/fanout.ts
    - relay/tests/session-manager.test.ts
    - relay/tests/strategy-sweeper.test.ts
    - relay/tests/order-server-resync.test.ts
key-decisions:
  - "29-45: GC-01 은 두 겹으로 막는다 — (1) #sweepThenResync 가 그 사용자의 진행 중 sweep 전부(백스톱 · 재시도 · sweepMoved)를 기다린 뒤 resyncUser, (2) sweeper 는 얻은 세션 객체로만 반납(releaseSession — 엔트리가 다른 객체면 info 1줄 · 무시). 기다림은 끝나기만 보고 실패해도 재수립은 진행한다"
  - "29-45: #userSweepsSettled 는 최대 3바퀴 — 기다리는 사이 붙은 sweep 을 다시 모으되, 계속 생기면 warn 1줄(userId · 수)로 재수립을 진행한다(무기한 막지 않는다)"
  - "29-45: sweep 직렬화 단위는 (사용자, 서버) 레인 — 진행 중 계좌는 그 sweep 을 기다리고, 나머지는 다음 sweep 1회에 합친다(자격증명은 마지막 요청 값). 다른 서버 레인은 병렬"
  - "29-45: 14 확인은 그 키의 60 에코 뒤의 65 — 에코의 스위치 값(켜짐 여부)은 보지 않는다. 꺼졌는지는 재조회가 판정해 내리지 않는 서버는 종전처럼 remaining 으로 남긴다"
  - "29-45: stillStale = 트래커 스냅샷에서 그 계좌의 유효 서버가 이 서버가 아니면 참 · 항목이 없으면 참 · 트래커 미주입이면 넘기지 않는다(종전). 건너뛴 계좌는 확인 · 미확인 기록 없이 #clearIfOwner"
patterns-established:
  - "옛 서버 끄기 네 갈래(29-36 · sweepMoved · 백스톱 · 재시도)가 한 (사용자, 서버) 레인을 공유하고, 재수립은 그 사용자 레인이 빌 때까지 기다린다"
requirements-completed: [ADMIN-06]
coverage:
  - id: D1
    description: "GC-01 — 백스톱이 KB121 세션을 쥔 채 다른 계좌 지정이 바뀌어도 재수립은 그 sweep 이 끝날 때까지 dropUser 하지 않고, 재접속이 만든 새 세션의 참조계수는 탭 수(1) 그대로 6분 뒤에도 살아 B 주문이 KB121 로 간다"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑱ GC-01 회귀"
        status: pass
      - kind: unit
        ref: "relay/tests/session-manager.test.ts#releaseSession (29-45 GC-01)"
        status: pass
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#GC-01 (29-45) — 반납은 얻은 세션 객체로"
        status: pass
    human_judgment: false
  - id: D2
    description: "GC-04(relay 쪽) — 같은 (사용자, 서버)의 sweep 은 한 번에 하나(두 번째 sweep 의 첫 24 가 첫 sweep 재조회 마지막 21 뒤) · 14 확인은 그 키 60 에코 뒤의 65"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑲ GC-04"
        status: pass
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#GC-04 (29-45) — 남의 65 만 오고 그 키 에코가 없으면 다음 키로 넘어가지 않는다"
        status: pass
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#GC-04 (29-45) — 남의 65 가 그 키 에코보다 먼저 와도"
        status: pass
    human_judgment: false
  - id: D3
    description: "GC-14 — 송신 직전 stillStale 이 거짓이면 그 계좌의 14 · 11 생략 · skippedAccounts · 확인 기록 없이 해제(다시 옮기면 다시 끈다)"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑳ GC-14"
        status: pass
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#GC-14 (29-45) ×3"
        status: pass
    human_judgment: false
  - id: D4
    description: "운영 보존 — 29-36 · 29-43 · 29-44 기존 케이스 · relay 전량 회귀 green(브라우저 close 의 키 반납 경로 · 세션 키 · 5분 유예 의미 불변)"
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (57 파일 · 1413)"
        status: pass
    human_judgment: false
  - id: D5
    description: "운영 첫 실사용(지정 변경 · 두 번째 서버 켜기) 때 실 게이트웨이에서 sweep 갈래가 겹쳐도 연결 탭 세션이 유지되는지"
    verification: []
    human_judgment: true
    rationale: "스텁 2대 · 가짜 타이머 회귀로 고정했지만 실 게이트웨이 60 에코 · 65 순서와 다중 갈래 경합은 운영 관찰이 필요하다(지금 운영은 지정 0 · 두 번째 서버 꺼짐이라 sweep 0회 — 배포는 메인 세션 몫)"
duration: 15min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 45: sweep 갈래 간 직렬화 · 동일성 반납 Summary

**옛 서버 끄기(sweep)가 재수립과 겹쳐도 새 세션을 닫지 않는다 — sweeper 는 얻은 세션 객체로만 반납하고, 재수립은 그 사용자의 진행 중 sweep 전부를 기다리며, 같은 (사용자, 서버)의 sweep 은 레인 하나로 직렬화되고(14 확인은 그 키 60 에코 뒤의 65), 송신 직전 stillStale 로 되돌아온 서버의 전략은 끄지 않는다 (GC-01 블로커 · GC-04 relay 쪽 · GC-14).**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-11T00:12:37Z
- **Completed:** 2026-10-11T00:27:53Z
- **Tasks:** 3 (TDD — 커밋 6)
- **Files modified:** 6 (+ RED 증거 3)

## Accomplishments

- **GC-01 블로커 닫음.** 29-VERIFICATION-R2 truth 17 의 실패 근거 셋이 사라졌다.
  - 키 반납: sweeper 는 `releaseSession(userId, 얻은 세션)` 으로 반납한다. 맵 엔트리가 그 객체가 아니면 info 1줄을 남기고 무시한다.
  - 계좌 단위 진행 중 집합: (사용자, 서버) 레인으로 바꿨다.
  - 체인 밖 갈래: `#sweepThenResync` 가 `#userSweepsSettled` 로 그 사용자 레인 전부를 기다린 뒤에 `resyncUser` 를 부른다.
- **회귀 ⑱ 고정.** 백스톱이 KB121 세션에서 [B, C] sweep 을 쥔 채로 B 지정이 바뀌는 경우다.
  - 게이트를 풀기 전에는 dropUser 0 · 1012 0 이다.
  - 풀면 dropUser 1 → 재접속이 KB121 새 세션을 만든다. `refCountOf(u1, "KB121")` 는 Ready 직후와 6분 뒤 모두 1 이다.
  - 같은 객체가 Ready 로 살아 있고 B 주문은 KB121 DirectOrderReq 1 로 간다.
- **GC-04(relay 쪽).** 같은 세션에서 sweeper 의 미해결 21 은 다시 하나뿐이다.
  - ⑲: 두 번째 sweep 의 첫 24 가 첫 sweep 재조회의 마지막 21 뒤에 온다.
  - 14 확인은 그 키의 60 에코 뒤에 오는 65 로만 접는다. 남의 65 로는 다음 키로 넘어가지 않는다.
- **GC-14.** sweeper 가 14 · 11 을 보내기 직전마다 그 계좌가 아직 옛 서버 계좌인지(`stillStale`) 묻는다.
  - 되돌아온 서버의 전략은 끄지 않는다. 그 계좌는 `skippedAccounts` 로 돌려준다.
  - fanout 은 그 계좌를 확인 기록 없이 `#clearIfOwner` 로 해제한다(다시 옮기면 처음부터 다시 판정).
- **운영 경로 불변.**
  - 브라우저 close 의 `release(userId, serverKey)`, 세션 키, 5분 유예 의미, 지정 0 운영의 sweep 0회는 그대로다.
  - relay 전량(57 파일 · 1413)이 green 이다.

## Task Commits

1. **Task 1 RED:** GC-01 회귀 실패 테스트 · 동일성 반납 골격 — `c28ebd65` (test)
2. **Task 1 GREEN:** sweep 반납을 세션 객체로 · 재수립은 그 사용자의 진행 중 sweep 전부를 기다림 — `2772909d` (fix)
3. **Task 2 RED:** 같은 세션 두 sweep 직렬 · 14 확인 60 에코 짝 실패 테스트 — `04303462` (test)
4. **Task 2 GREEN:** (사용자, 서버) 레인 직렬화 · 14 확인은 그 키 60 에코로 — `5694b4c6` (fix)
5. **Task 3 RED:** 송신 직전 stillStale 실패 테스트 · 옵션 · skippedAccounts 골격 — `93633242` (test)
6. **Task 3 GREEN:** 송신 직전 stillStale · 건너뛴 계좌 해제 — `e2659563` (fix)

측정 구간 `fb41305b..e2659563` 의 6 커밋은 전부 이 플랜 몫이다(다른 세션 커밋 없음).

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `relay/src/dma/session-manager.ts`
  - `releaseSession`(동일성 가드 · info 1줄 · boolean)과 `refCountOf`(읽기 전용)를 더했다.
  - 머리 주석 29-33 절에 GC-01 근거 2줄을 넣었다.
- `relay/src/dma/strategy-sweeper.ts`
  - `SweeperSessions.releaseSession` 을 두고 finally 가 객체로 반납한다.
  - 14 확인을 그 키 60 에코 뒤의 65 로 바꿨다.
  - `StrategySweepOptions.stillStale` 을 더했다. 송신 직전에 확인하고, 재조회 확인에서는 건너뛴 계좌를 뺀다.
  - 결과 두 갈래에 `skippedAccounts` 를 실었다. 머리 주석에 GC-01 · GC-04 · GC-14 를 적었다.
- `relay/src/ws/fanout.ts`
  - `#sweepLanes` · `SweepLane` · `SweepNext` · `sweepLaneKey` 를 더했다.
  - `#sweepAccounts` 를 레인 방식으로 다시 썼고 `#laneSweep` · `#sweepPending` 을 더했다.
  - `#userSweepsSettled` 와 `USER_SWEEP_SETTLE_ROUNDS` 3 을 더하고, `#sweepThenResync` 가 이를 기다린다.
  - `#sweepServer` 가 stillStale 을 넘기고 skipped 를 해제한다.
  - 머리 주석 10 · 11 을 고쳤다.
- `relay/tests/session-manager.test.ts` — releaseSession 동일성 가드 1 케이스(옛 객체 false · refCountOf 불변 · 6분 생존 · 엔트리 없음 false · 같은 객체 종전 유예).
- `relay/tests/strategy-sweeper.test.ts`
  - 반납 스파이를 releaseSession 으로 바꿨다.
  - 새 케이스 6개를 더했다: GC-01 반납 갈래 · GC-04 2 · GC-14 3.
  - 기존 결과 단언에 `skippedAccounts: []` 를 더했다.
- `relay/tests/order-server-resync.test.ts`
  - ⑱ · ⑲ · ⑳ 와 `threeAccounts` 를 더했다.
  - `recording` 이 opts 를 넘기게 했다.
  - import `buildLimitChaserListRespFrame` · `buildSetVITriggerRespFrame` · `readViSetRequest` 를 더했다.
- `.planning/phases/29-dma-multi-server-admin/.red/29-45-task{1,2,3}-red.json` — RED 증거(RED_EVIDENCE_OK).

## Decisions Made

- GC-01 은 두 겹으로 막았다. 재수립 전 대기가 1차 방어이고, 동일성 반납이 2차 방어다.
  - 대기만으로도 ⑱ 은 통과한다.
  - 그래도 다른 경로로 dropUser 가 생길 수 있으니 반납 쪽도 막았다.
- 레인의 다음 sweep 은 하나뿐이다. 자격증명은 마지막 요청 값을 쓰고, 증권사는 서버마다 하나라 마지막 값과 같다.
- 14 확인에서 에코의 「켜짐 아님」 은 보지 않는다(아래 편차 1).
- 건너뛴 계좌만 남은 실패에는 레지스터 · warn 을 남기지 않는다. 대상이 빈 `#markStale` 은 의미 없는 warn 이 되기 때문이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 14 확인 짝을 「그 키 60 에코(key 일치)」 로만 맞추고 「켜짐 아님」 조건은 뺐다**
- **Found during:** Task 2 GREEN
- **Issue:** 산출물 표는 60 에코가 「key 일치 · 켜짐 아님」 이어야 한다고 적었다.
  - 그대로 하면 14 를 받아도 스위치를 내리지 않는 서버(`apply: false`)에서 에코가 켜진 채로 온다.
  - 그러면 기존 strategy-sweeper ⑮(remaining 2) · ⑱(warn reason remaining)이 단계 시한 timeout 으로 바뀐다.
  - 플랜 verification 은 「29-43 기존 케이스 무수정 green」 을 요구한다.
- **Fix:** 에코는 key 일치만 보고 65 는 그 에코 뒤의 것만 받는다. 꺼졌는지는 종전처럼 재조회가 판정한다(fail closed 유지). GC-04 의 목적(남의 65 로 다음 키가 접히지 않음)은 그대로 달성한다.
- **Files modified:** relay/src/dma/strategy-sweeper.ts
- **Committed in:** 5694b4c6

**2. [Rule 3 - Blocking] 결과 `skippedAccounts` 필드 때문에 기존 sweeper 결과 단언 16건에 `skippedAccounts: []` 를 더했다**
- **Found during:** Task 3 RED
- **Issue:** 산출물 표는 결과 두 갈래에 항상 `skippedAccounts: string[]` 를 요구한다. 그래서 기존 `toEqual({ ok, … })` 단언이 깨진다.
- **Fix:** 필드만 기계적으로 더했다. 판정 의미는 바꾸지 않았다. resync 쪽은 `objectContaining` 이라 영향이 없다.
- **Files modified:** relay/tests/strategy-sweeper.test.ts
- **Committed in:** 93633242

**3. [Rule 1 - Bug] ⑱ 게이트를 래퍼 앞이 아니라 「KB121 스텁 24 답 막기」 로 만들었다**
- **Found during:** Task 1 RED
- **Issue:** ④ 패턴(래퍼가 `real.sweep` 앞에서 쥠)은 `acquireOn` 전에 멈춘다.
  - 그러면 고치기 전 코드에서도 sweep 이 재접속 뒤 새 세션을 얻고 반납해 참조계수가 맞는다.
  - 즉 GC-01 경합(세션을 얻은 채 drop 을 지나는 sweep)을 재현하지 못한다.
- **Fix:** 래퍼는 hub 프리페치 24 가 끝난 뒤 `silenceQuery(24)` 를 걸고 `real.sweep` 을 부른다. 그래서 sweep 이 세션을 얻고 첫 24 에서 멈춘다.
  - 해제할 때 `silenceQuery(24, false)` 와 `sendFrame(64)` 를 보낸다.
  - RED 는 계획 단언 「게이트 해제 전 dropUser 0」 에서 실패했다. 이 단언이 refCount 단언보다 앞에 있어 먼저 걸린다.
- **Files modified:** relay/tests/order-server-resync.test.ts
- **Committed in:** c28ebd65

**4. [Rule 2 - Missing Critical] 건너뛴 계좌만 남은 실패 결과에서 빈 `#markStale` 생략**
- **Found during:** Task 3 GREEN
- **Issue:** 실패 결과의 대상 계좌가 전부 skipped 일 수 있다. 이때 그대로 두면 빈 계좌 목록으로 「끄지 못함」 warn 이 나간다.
- **Fix:** 건너뛰지 않은 계좌가 있을 때만 `#markStale` 을 부른다.
- **Files modified:** relay/src/ws/fanout.ts
- **Committed in:** e2659563

---

**Total deviations:** 4 auto-fixed (2 bug · 1 blocking · 1 missing critical)
**Impact on plan:** 범위 확장 없음. 모두 기존 케이스 보존 · 회귀 재현 정확도 · 로그 위생 때문이다.

## TDD Gate Compliance

- **Task 1 RED** (`c28ebd65`)
  - 목표 ⑱ 이 계획 단언 「게이트 해제 전 dropUser 0」 에서 실패했다. junit → classifier 판정은 `RED_EVIDENCE_OK`(67 수집 · 2 실패)이다.
  - 의미 판정: 로드 · 문법 · 픽스처 오류가 없다. 같은 미구현으로 session-manager 동일성 가드 케이스도 실패했다.
  - sweeper GC-01 반납 케이스는 골격(객체 반납 면)이라 처음부터 green 이다(회귀 고정).
- **Tracer gate** — Task 1(type tracer) 뒤 `<verify>` 를 다시 돌려 green 이었고 Task 2 로 확장했다(⑱ 3회 반복 green).
- **Task 2 RED** (`04303462`)
  - 목표 ⑲ 가 KB120 순서 단언에서 실패했다(24, 24 … 끼어듦). 판정은 `RED_EVIDENCE_OK`(54 수집)이다.
  - sweeper 「남의 65 만」 케이스도 실패했다. 「남의 65 먼저 → 에코 → 65」 는 종전 코드에서도 green 이다(회귀 고정).
- **Task 3 RED** (`93633242`)
  - 목표 ⑳ 이 `skippedAccounts [A]` 단언에서 실패했다. 판정은 `RED_EVIDENCE_OK`(74 수집)이다.
  - sweeper GC-14 두 케이스도 실패했다. 「미주입 → 종전」 은 골격에서 green 이다.
- RED 커밋은 29-44 관례대로 API 골격을 포함한다.
  - Task 1: `releaseSession` 위임(가드 없음) · `refCountOf` · `SweeperSessions.releaseSession`
  - Task 3: `StrategySweepOptions` · 세 번째 인자 무시 · `skippedAccounts: []`
- REFACTOR 커밋은 없다. 증거 파일은 `.planning/phases/29-dma-multi-server-admin/.red/29-45-task{1,2,3}-red.json` 이다.

## Issues Encountered

- **⑨ 1회 실패(재현 안 됨).** Task 2 GREEN 직후 4파일 묶음 첫 실행에서 29-44 ⑨ 트레이서가 1회 실패했다.
  - 실패 상세는 캡처하지 못했다. 그 뒤 같은 묶음 12회와 relay 전량 1회는 모두 green 이다.
  - ⑨ 는 연결 없는 사용자의 sweepMoved 단독 경로다. 레인 변경으로 의미가 바뀌는 단언은 없다.
  - 동시 세션 부하 아래 `waitFor` 600턴 예산 초과로 보인다. 다시 보이면 별도 조사 대상이다.
- **기본 브랜치 커밋.** 커밋 전 안전 단언이 `master` 를 보호 브랜치로 판정한다.
  - 이 저장소는 `branching_strategy: none` 이고, 사용자 메모리 「작업은 master 에서」 와 29-xx 전 플랜 관례에 따라 master 에 순차 커밋했다.
  - push · 배포는 하지 않았다.
- 원격 배포(relay VM)와 운영 관찰은 메인 세션 몫이다. 지금 운영은 지정 0 이라 sweep 이 0회이므로 이 변경이 닿는 운영 경로가 없다.

## Known Stubs

없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 29-46(GC-06 규칙 — resync 테스트 ⑥ 단언 변경 · wave 23)과 29-49(GC-04 hub 쪽 — hub FIFO 귀속 · 65 팬아웃)가 이 레인 · 에코 짝 위에서 일한다.
- G-1 첫 실사용(지정 변경 · 두 번째 서버 켜기) 전 블로커 GC-01 은 코드 · 회귀로 닫혔다. 배포는 relay 먼저 → 검증 → push 순서로 메인 세션이 한다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*

## Self-Check: PASSED
