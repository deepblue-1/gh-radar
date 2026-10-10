---
phase: 29-dma-multi-server-admin
plan: 44
subsystem: relay
tags: [relay, dma, g-1, strategy-sweep, order-server, backstop, retry, tdd]
requires:
  - phase: 29-36
    provides: "연결 중 사용자 경로(서명 diff → sweep → dropUser → 1012) · StaleStrategyRegister 결선 · 상태 프레임 staleStrategies · index sweeper/register 생성"
  - phase: 29-43
    provides: "StrategySweeper.sweep(24/21 → 14/11 → 재조회 0 · 20초) · StaleStrategyRegister(set · confirm · pendingFor · all)"
  - phase: 29-37
    provides: "Admin PUT order-server → AccountOrderServers 즉시 reload → changed"
  - phase: 29-33
    provides: "createOrderServerRouting.effectiveOrderServer · serversFor · AccountOrderServers.ready()/loaded"
provides:
  - "EffectiveOwnerTracker — 전 DMA 유저 × 계좌 유효 주문 서버 스냅샷 · refresh diff(OwnerMove) · snapshotOf 지금 값(owner · effective · servers) · 연결 유무 무관"
  - "AppAccess.userIdOf(dmaUserId) 역방향 색인 · JournalAccess.dmaUserIds()"
  - "WsFanout.sweepMoved(moves, reason) — 브라우저 0 · 세션 0 사용자 포함 옛 서버 끄기(임시 세션 · release)"
  - "WsFanout 로그인 백스톱 #backstopSweep — 등록됐지만 주문 서버가 아닌 (서버, 계좌) · 확인 기록 있으면 0회"
  - "WsFanout.startStaleRetry/stopStaleRetry · STALE_STRATEGY_RETRY_MS 60초 · #clearIfOwner 되돌아옴 해제"
  - "#sweepInFlight — 29-36 · sweepMoved · 백스톱 · 재시도 공유 진행 중 집합(같은 키 동시 sweep 0)"
  - "index 결선 — 트래커 · 지정 첫 적재 뒤 기준선 · 지정/레지스트리 changed · 87 applied → sweepOwnerMoves · 재시도 부팅 · 종료 정리"
affects: [29-38, 29-40, 29-41, ADMIN-06]
actuals:
  tokens: 19361
  tasks: 2
  commits: 4
plan_head_before: 67c586d15b2b64871946179637faed36001000fa
plan_head_after: 4a1bfdebd6643929e9d85d92172ddd40831358be
tech-stack:
  added: []
  patterns:
    - "연결 무관 계산(트래커) ↔ 연결 중 판정(29-36 서명) 두 갈래가 같은 sweep · 레지스터 · 상태 프레임으로 모이고, 진행 중 집합 하나로 중복을 막는다"
    - "확인 기록 = (사용자|서버|계좌) → 확인 당시 소유 서버 — 소유 서버가 바뀌면 다시 판정, 미확인 · 되돌아옴이면 지운다"
    - "지금 유효 서버(effective)는 어느 경로도 끄지 않는다 — 소유 서버(owner, fail closed)가 아니라 effective 로 판정"
    - "연결 탭이 있는 fake-timer 테스트는 10초씩 민다(wss 하트비트 30초 terminate 방지) · sweep 시작을 보면 시계를 멈춘다(단계 시한 보호)"
key-files:
  created:
    - relay/src/dma/effective-owner-tracker.ts
    - relay/tests/effective-owner-tracker.test.ts
    - .planning/phases/29-dma-multi-server-admin/.red/29-44-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-44-task2-red.json
  modified:
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/src/access/app-access.ts
    - relay/src/journal/access.ts
    - relay/tests/order-server-resync.test.ts
    - relay/tests/app-access.test.ts
key-decisions:
  - "29-44: 트래커는 지정 첫 적재 전(ready false)에 기준선을 잡지 않고, index 는 accountOrderServers.ready() 직후 기준선 1회 — 미적재 사본을 기준선으로 삼으면 부팅마다 「지정 계좌 전부 옮겨짐」 대량 sweep"
  - "29-44: 어느 경로도 그 계좌의 지금 유효 서버(effective — 지정 ?? 기본, 매핑 무관)는 끄지 않는다 — 소유 서버(owner)가 매핑 공백으로 undefined 가 돼도 주문 서버의 전략은 보존"
  - "29-44: 확인 기록(#confirmedOwner)은 fanout 에 둔다(strategy-sweeper.ts 는 플랜 파일 밖) · clearIfOwner 도 fanout private(레지스터 confirm + 기록 삭제)"
  - "29-44: 로그인 백스톱은 레지스터 미확인 키를 건너뛴다(60초 재시도 몫) — 확인 기록도 미확인 기록도 없거나 소유 서버가 바뀐 (서버, 계좌)만"
  - "29-44: 웹 사용자(userIdOf)를 못 찾는 DMA 유저는 레지스터 키가 없어 warn 1줄(수만)로 끝난다 · userIdOf 는 DMA 권한 행 먼저, viewer 연결도 찾아 자격증명 null → no-session 으로 보이게"
  - "29-44: 재시도는 레지스터 항목에 증권사가 없어 트래커 스냅샷에서 계좌로 찾는다 — 어느 매핑에도 없는 계좌는 건드리지 않고 항목만 남긴다"
patterns-established:
  - "G-1 (가) 옛 서버 끄기 네 갈래(연결 중 재수립 · 연결 무관 move · 로그인 백스톱 · 60초 재시도) = 한 sweeper · 한 레지스터 · 한 진행 중 집합 · 한 상태 프레임"
requirements-completed: [ADMIN-06]
coverage:
  - id: D1
    description: "트레이서 — 브라우저 0 · 세션 0 u1 의 A 지정 KB120 → KB121 → 트래커 move → sweepMoved → KB120 임시 로그인 1 · 24 · 21 · 21 · 14(A) · 재조회 → ok · 레지스터 0 · release(유예 뒤 소멸) · KB121 LoginReq 0 · u2 무영향 · 같은 지정 재적재 sweep 0"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑨ 트레이서(29-44)"
        status: pass
    human_judgment: false
  - id: D2
    description: "EffectiveOwnerTracker — 첫 refresh 0 · 지정 변경 move 1 · 재호출 0 · to undefined move · 레지스트리 기본 변경 · 사라짐/새로 보임 move 아님 · ready 전 기준선 없음 · snapshotOf 지금 값 · 기준선 불변"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/effective-owner-tracker.test.ts (6 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "AppAccess.userIdOf 역방향 색인 — 첫 적재 전 undefined · DMA 권한 행 먼저 · viewer 연결도 · 재적재로 옛 키 사라짐"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/app-access.test.ts#userIdOf(29-44 역방향 색인)"
        status: pass
    human_judgment: false
  - id: D4
    description: "fail closed — 자격증명 null → sweep 0 · 레지스터 no-session · warn 1줄(계좌 · DMA id 없음) · 다음 로그인 첫 상태 프레임 staleStrategies / 웹 사용자 없음 → warn 1줄(수만) · 레지스터 0 / 65 미수신 → timeout 레지스터 → 다음 로그인 staleStrategies { KB120, 1 }"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑩ ⑪ ⑫"
        status: pass
    human_judgment: false
  - id: D5
    description: "로그인 백스톱 — 인증과 병행해 KB120 에서 A 만 1회(세션 재사용 · LoginReq 추가 0) · 새 탭 0회 · 소유 서버 변경 뒤 인증 다시 1회"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑬ 로그인 백스톱"
        status: pass
    human_judgment: false
  - id: D6
    description: "60초 재시도 — 실패 attempts 2(유예 세션 재사용) · 미확인 키는 백스톱 아닌 재시도 몫 · 고친 서버로 성공 → 레지스터 확인 · 연결 중 상태 프레임 재송신(staleStrategies 사라짐)"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑭ 60초 재시도"
        status: pass
    human_judgment: false
  - id: D7
    description: "되돌아옴 — KB120 미확인 남은 채 지정 해제 → 레지스터 해제 · KB120 24/14 0 · KB121(새 옛 서버) A 끄기"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑮ 되돌아옴"
        status: pass
    human_judgment: false
  - id: D8
    description: "동시 — 연결 중 u1 지정 변경에서 29-36 경로와 sweepMoved 가 같은 틱 → (u1, KB120, A) sweep 1회(14 1 · 24 2) · 1012 · close 뒤 재시도 타이머 없음(sweep 0)"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑯ ⑰"
        status: pass
    human_judgment: false
  - id: D9
    description: "index 결선 — 트래커 · 지정 첫 적재 뒤 기준선 · 지정/레지스트리 changed · 87 applied 에서 resync 뒤 sweepOwnerMoves · startStaleRetry 부팅 · 종료 stopStaleRetry"
    requirement: "ADMIN-06"
    verification:
      - kind: other
        ref: "grep sweepMoved · startStaleRetry · EffectiveOwnerTracker relay/src/index.ts + relay typecheck"
        status: pass
    human_judgment: true
    rationale: "부팅 결선 단위 테스트 없음(29-28 D5 · 29-36 D9 선례) — 운영 relay 에서 연결 없는 사용자 지정 변경 · 재시작 뒤 로그인 백스톱 확인은 29-41 몫"
  - id: D10
    description: "회귀 — 29-36 ①~⑧ 무수정 green · fanout-access · fanout-multi-session · session-routing 무수정 · 전체 relay 스위트"
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (57 files · 1402 tests)"
        status: pass
    human_judgment: false
duration: 17min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 44: (가) 보강 — 연결 없는 사용자 · 로그인 백스톱 · 60초 재시도 · 되돌아오면 해제 Summary

**`EffectiveOwnerTracker` 가 연결 유무와 무관하게 전 사용자 계좌의 유효 주문 서버 변화를 내고 `WsFanout.sweepMoved` 가 브라우저를 닫아 둔 트레이더의 옛 서버 전략까지 임시 세션으로 끄며, 로그인 백스톱 · 60초 재시도 · 되돌아옴 해제가 relay 재시작 · 놓친 변경 · 끄기 실패를 수렴시킨다 — 네 갈래가 한 sweeper · 한 레지스터 · 한 진행 중 집합을 쓴다**

## Performance

- **Duration:** 17 min
- **Started:** 2026-10-10T16:56:54Z
- **Completed:** 2026-10-10T17:14:08Z
- **Tasks:** 2 (TDD — 커밋 4)
- **Files modified:** 8 (+ RED 증거 2)

## Accomplishments

- gh-trade-84 ②(가) 「세션은 연결 0 이어도 전략이 남아 옛 서버가 실주문을 낼 수 있다」 를 브라우저를 닫은 트레이더에게도 닫았다 — Admin 이 그 계좌를 옮기면 relay 가 옛 서버에만 임시 로그인해 그 계좌 전략을 끄고 확인한 뒤 release 한다(새 주문 서버 세션은 미리 열지 않는다).
- 로그인 백스톱: 인증마다 「등록됐지만 주문 서버가 아닌 (서버, 계좌)」 를 세션 수립과 병행해 끈다 — 확인 기록이 있고 소유 서버가 그대로면 0회.
- 60초 재시도: 미확인 항목을 다시 끄고, 성공하면 확인 · 연결 중 상태 프레임 재송신. 그 서버가 다시 주문 서버가 되면(되돌아옴) 끄지 않고 해제.
- 29-36 연결 중 경로는 동작 불변(①~⑧ 무수정 green) — 진행 중 집합만 함께 써서 같은 (사용자, 서버, 계좌)를 두 경로가 동시에 끄지 않는다.
- 어느 경로도 지금 유효 서버의 전략 · 미체결은 건드리지 않고, 로그에 DMA id · 계좌번호를 싣지 않는다.

## Task Commits

1. **Task 1 RED: 연결 없는 사용자 끄기 트레이서 실패 테스트 · 트래커 · 역방향 색인 골격** - `03ea6d4a` (test)
2. **Task 1 GREEN: 연결 없는 사용자의 주문 서버 변경도 옛 서버 전략을 끈다 — EffectiveOwnerTracker · 임시 세션 sweep** - `4704c0a4` (feat)
3. **Task 2 RED: 로그인 백스톱 · 60초 재시도 · 되돌아옴 · 동시 · close 실패 테스트** - `78e7406a` (test)
4. **Task 2 GREEN: 로그인 백스톱 sweep · 60초 재시도 · 되돌아오면 해제 · 동시 sweep 방지** - `4a1bfdeb` (feat)

측정 구간(`67c586d1..4a1bfdeb`, 4 커밋)에 다른 세션 커밋은 없다.

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `relay/src/dma/effective-owner-tracker.ts` — `EffectiveOwnerTracker` · `OwnerMove` · `OwnerSnapshotEntry`(owner · effective · servers) · `ready` 게이트 · 머리 주석 (가) 근거
- `relay/src/ws/fanout.ts` — 머리 11 번 문단 · deps `userIdOf` · `owners` · `sweepMoved` · `#sweepMovedUser` · `#backstopSweep` · `startStaleRetry`/`stopStaleRetry` · `#retryStale`/`#retryUser` · `#credentialsFor` · `#clearIfOwner` · `#sweepAccounts`(진행 중 집합) · `#confirmedOwner` · `STALE_STRATEGY_RETRY_MS` · 29-36 `#sweepThenResync` 가 `#sweepAccounts` 경유 · `closeAll` 재시도 정리
- `relay/src/index.ts` — 트래커 생성 · 지정 첫 적재 뒤 기준선 · `sweepOwnerMoves`(지정 · 레지스트리 changed · 87 applied, resync 뒤) · fanout deps · `startStaleRetry` · 종료 절차 `stopStaleRetry` · 머리 주석
- `relay/src/access/app-access.ts` — `userIdOf` · `#byDma`(`reverseIndex` — DMA 권한 행 먼저)
- `relay/src/journal/access.ts` — `dmaUserIds()`
- `relay/tests/effective-owner-tracker.test.ts` — 6 케이스
- `relay/tests/order-server-resync.test.ts` — 하네스 `tracker` · `staleRetry` · `dmaToUser` · `advanceAlive` · ⑨~⑰ 9 케이스
- `relay/tests/app-access.test.ts` — `userIdOf` 케이스

## Decisions Made

- 트래커 기준선은 지정 첫 적재 뒤에만(index 는 `ready()` 직후 1회) — 미적재 사본 기준선은 부팅마다 대량 sweep 을 만든다.
- 끄지 말아야 할 서버 판정은 소유 서버(owner)가 아니라 유효 서버(effective)로 한다 — 매핑 공백으로 소유자가 비어도 주문 서버의 전략은 보존.
- 확인 기록 · `clearIfOwner` 는 fanout 에 둔다(플랜 파일 범위 — `strategy-sweeper.ts` 무변경).
- 백스톱은 레지스터 미확인 키를 건너뛴다(재시도 몫) — 로그인 시점 중복 두드림 · 테스트 결정성.
- 웹 사용자를 못 찾는 DMA 유저는 warn 1줄(수만) — 레지스터 키(userId)가 없고 DMA id 를 로그에 실을 수 없다.
- 재시도는 증권사를 트래커 스냅샷에서 찾는다 — 어느 매핑에도 없는 계좌는 항목만 남긴다(healthz · 상태 프레임에는 보인다).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED 커밋에 API 골격 포함**
- **Found during:** Task 1 RED · Task 2 RED
- **Issue:** 새 모듈 · 메서드를 부르는 테스트만 커밋하면 typecheck · 로드 실패로 INVALID_RED.
- **Fix:** Task 1 RED 에 트래커 골격(refresh [] · snapshotOf 빈 맵) · `userIdOf` undefined · `sweepMoved` 0 · `dmaUserIds`, Task 2 RED 에 `STALE_STRATEGY_RETRY_MS` · `startStaleRetry` no-op.
- **Files modified:** effective-owner-tracker.ts · app-access.ts · journal/access.ts · fanout.ts
- **Committed in:** 03ea6d4a · 78e7406a

**2. [Rule 2 - Missing Critical] 트래커 `ready` 게이트 · `effective` 필드 · `servers` 에 증권사**
- **Found during:** Task 1 GREEN
- **Issue:** 산출물 표의 `servers: () => string[]` 로는 계좌 증권사를 알 수 없고, 지정 첫 적재 전 기준선은 부팅마다 「지정 계좌 전부 옮겨짐」 오판, 소유 서버(owner)만으로는 매핑 공백 때 주문 서버 자신을 끌 수 있다.
- **Fix:** `servers` 는 `{ key, broker }[]` · `ready?` 게이트 · 스냅샷 항목에 `effective` · sweepMoved/백스톱/재시도가 effective 서버를 끄지 않음.
- **Files modified:** relay/src/dma/effective-owner-tracker.ts · relay/src/ws/fanout.ts · relay/src/index.ts
- **Committed in:** 4704c0a4 · 4a1bfdeb

**3. [Rule 1 - Bug] 테스트 — 가짜 시계 30초 초과 이동이 연결 탭을 하트비트로 terminate**
- **Found during:** Task 2 GREEN(⑭)
- **Issue:** `advanceTimersByTime(60_000)` 이 wss 하트비트(30초)를 pong 없이 두 번 돌려 탭이 끊겼고, 10초 단위로 밀면 재시도 sweep 의 단계 시한(5초)이 다음 이동에 만료됐다.
- **Fix:** `advanceAlive`(10초씩 · I/O 턴) · 재시도 sweep 시작을 보면 시계 정지 · ⑨ 의 u2 단언을 5분 유예 이동 전으로.
- **Files modified:** relay/tests/order-server-resync.test.ts
- **Committed in:** 4a1bfdeb

---

**Total deviations:** 3 auto-fixed (1 blocking · 1 missing critical · 1 test bug)
**Impact on plan:** 범위 확장 없음 — TDD 게이트 순서 · 안전 판정 보강 · 테스트 타이밍.

## TDD Gate Compliance

- **Task 1 RED** — 목표 `order-server-resync > ⑨ 트레이서(29-44)` 가 계획 단언 지점(연결 없는 u1 의 KB120 sweep 완료 대기)에서 실패(sweepMoved · 트래커 골격). junit → classifier `RED_EVIDENCE_OK`(target_test_failed · 49 수집). 의미 판정: 로드 · 문법 · 픽스처 오류 없음, 29-36 ①~⑧ · session-routing green, ⑩~⑫ · 트래커 5 · userIdOf 도 같은 미구현으로 실패, 트래커 「사라짐/새로 보임 = move 아님」 은 골격과 같아 처음부터 green(회귀 고정).
- **Task 2 RED** — 목표 `⑬ 로그인 백스톱` 이 「백스톱 sweep 1」 대기에서 실패. `RED_EVIDENCE_OK`(54 수집). ⑭(재시도 14 없음) · ⑮(레지스터 남음) · ⑯(KB120:A sweep 2회)도 실패, ⑰(close 뒤 타이머 0)은 골격이 타이머를 만들지 않아 처음부터 green(회귀 고정).
- **Tracer gate** — Task 1(type tracer) 뒤 `<verify>`(shared build · typecheck 2 · 4 파일 49 케이스) 재실행 green → Task 2 확장.
- 증거: `.planning/phases/29-dma-multi-server-admin/.red/29-44-task{1,2}-red.json`. REFACTOR 커밋 없음.

## Issues Encountered

- `gsd-tools windows append` 는 기록할 스텁 · 미실행 verify 가 없어 부르지 않았다.
- ADMIN-06 플래그 가정(G-1 대체)은 29-40 REQUIREMENTS 등록 때 문구 정정 — 그대로 유효.
- `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`(open)는 범위 밖이라 손대지 않았다.

## Known Stubs

없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 29-41: 운영 relay 에서 브라우저 0 사용자의 지정 변경 → 옛 서버 임시 로그인 · 끄기, 재시작 뒤 로그인 백스톱, healthz `staleAccounts` 의 60초 재시도 수렴을 실서버로 확인.
- 29-38 · 29-40: Admin 안내 문구가 「연결이 없어도 옛 서버 전략을 끈다 · 못 끄면 60초마다 다시 시도」 규칙과 맞는지.
- 운영 메모: 레지스터 항목이 계속 실패하면 사용자 · 서버당 60초마다 warn 1줄이 난다(무로그 fail-safe 금지 규율).

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*
