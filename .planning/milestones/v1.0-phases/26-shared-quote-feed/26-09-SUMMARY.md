---
phase: 26-shared-quote-feed
plan: 09
subsystem: relay
tags: [relay, hub, fanout, quote-feed, sub-limit, shared-types, d-11, d-15, tdd]

requires:
  - phase: 26-08
    provides: "#lingering(since) · #releaseKey(key, reason, sendUnsubscribe) · 업스트림 키 = #refs.size(live + linger)"
  - phase: 26-03
    provides: "전역 참조계수 · 0→1/승격/강등 프레임 · fanout quote 게이트웨이 하네스"
provides:
  - "QUOTE_SUB_LIMIT = 2000 · USER_SUB_LIMIT = 200 · HubSubscribeResult(ok · limit-user · limit-global)"
  - "SubscriptionHub 생성자 limits?: { global?; user? } (테스트 주입)"
  - "#userRefs(userId → marketKey → 탭 · level 합산 참조) · HubStats.subLimitRejects"
  - "shared RelaySubLimitMsg { t: \"sub.limit\"; i; x; scope: \"global\" | \"user\" } · RelayOutbound 합류"
  - "fanout sub — hub 판정 먼저, 거부면 그 소켓에만 sub.limit 1건 · conn.keys · #keyConns 미등록"
affects: [26-10 resubscribe pacing, 26-11 nudge (#userRefs 가 사용자별 0→1 판정 원천), 26-12 healthz (subLimitRejects), webapp sub.limit 소비(범위 밖 — 옛 리듀서는 무시)]

actuals:
  tokens: 9000
  tasks: 2
  commits: 4
plan_head_before: 8f1cf6d9c1440a3bf4c7344a889a370fe5425310

tech-stack:
  added: []
  patterns:
    - "공유 자원 한도는 참조계수를 바꾸기 전에 판정하고, 거부는 상태 무변경 + 계수 + warn + 반환값 — 호출자가 거부를 표면화한다"
    - "fanout 은 hub 판정이 ok 일 때만 소켓 소유권 기록 · 키 색인을 만든다(판정 먼저, 등록 나중)"
    - "사용자 표면 거부는 용도별 전용 프레임 — 전략 오류 슬롯({t:msg})을 다른 뜻으로 재사용하지 않는다"

key-files:
  created: []
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/tests/hub.test.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - relay/src/ws/fanout.ts
    - relay/tests/fanout.test.ts

key-decisions:
  - "판정 순서는 사용자 한도 → 전역 한도다. 사용자 한도는 그 사용자에게 새 키일 때만, 전역 한도는 #refs 항목이 없는(업스트림에 없는) 새 키일 때만 건다 — linger 키 복귀는 전역 한도에 걸리지 않는다"
  - "전역 자리 만들기는 since 가 가장 작은 linger 키 1개를 #releaseKey(…, true) 로 29(false) 해제한 뒤 진행 — 29(false) 가 새 키 28/29/32 보다 먼저 나간다(서버 FIFO 전제 · A10)"
  - "#userRefs 는 탭 · level 합산 참조 수를 센다. 같은 소켓의 level 갱신(+1 뒤 -1)이 사용자 키 수를 바꾸지 않는다"
  - "subLimitRejects 는 closeAll 에서 초기화하지 않는 누적 계수다(프로세스 수명 카운터 — healthz 원천)"
  - "fanout level 갱신 갈래는 한도에 걸릴 수 없지만, 걸리면 옛 level 을 되돌리고 옛 level 해제를 생략한 뒤 warn — 참조계수가 0 을 지나 29(false) 가 나가는 것을 막는다"

patterns-established:
  - "hub 한도 테스트는 합성 ISIN(KR7 + 0 채움 9자리)으로 실 한도 2000 을 채우고, 실 wss 테스트는 limits 주입(3 · 2)으로 작게 잡는다"

requirements-completed: []

coverage:
  - id: D1
    description: "전역 2000(live + linger)에서 새 업스트림 키는 limit-global — 28/29/32 0건 · subLimitRejects 1 · warn 1 · 기존 키 참조계수 불변, 이미 업스트림에 있는 키의 추가 구독은 ok"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#구독 한도 (D-11 · D-15) HL1 · HL2"
        status: pass
    human_judgment: false
  - id: D2
    description: "한도에서 가장 오래 linger 한 키를 29(false) 로 먼저 풀고 새 키 28 → 29 → 32, linger 키가 없으면 거부(LRU 축출 없음) · 풀린 linger 의 옛 만료 타이머는 침묵"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#구독 한도 (D-11 · D-15) HL3"
        status: pass
    human_judgment: false
  - id: D3
    description: "사용자당 200 — 201번째 새 키 limit-user, 다른 사용자의 새 키 · 그 사용자의 기존 키 추가 탭(다른 level 포함)은 ok, 끝까지 해제하면 199 로 줄어 수용"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#구독 한도 (D-11 · D-15) HL4 · HL5"
        status: pass
    human_judgment: false
  - id: D4
    description: "생성자 limits 주입 · 거래소별 키 구분 · 거부된 키는 상태를 남기지 않고 closeAll 이 사용자 계수를 비운다"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#구독 한도 (D-11 · D-15) HL6 · HL7"
        status: pass
    human_judgment: false
  - id: D5
    description: "실 wss — 한도 거부는 그 소켓에만 {t:\"sub.limit\", i, x, scope} 1건 · {t:msg} 0 · 같은 사용자 다른 탭 · 다른 사용자 0 · quote 게이트웨이 29 누적 불변 · 뒤에 다른 사용자가 연 그 키의 59 도 거부 소켓엔 0건"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#구독 한도 — sub.limit 프레임 · 그 소켓만 · 게이트웨이 0 (D-11 · D-15) SL1"
        status: pass
    human_judgment: false
  - id: D6
    description: "실 wss — 전역 한도 scope:global, linger 키가 생기면 29(false) K1 → 29(true) K4 순서로 수용"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#구독 한도 — sub.limit 프레임 · 그 소켓만 · 게이트웨이 0 (D-11 · D-15) SL2"
        status: pass
    human_judgment: false
  - id: D7
    description: "shared RelaySubLimitMsg 타입이 RelayOutbound 에 합류하고 webapp 이 컴파일된다(옛 리듀서는 모르는 t 무시)"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp exec vitest run relay — 151 passed"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-09-30
status: complete
---

# Phase 26 Plan 09: 공유 연결 구독 한도 Summary

**relay hub 는 이제 새 시세 키를 업스트림으로 보내기 전에 두 한도를 판정한다. 하나는 사용자당 서로 다른 키 200 개(D-15)이고, 다른 하나는 quote 연결의 업스트림 키 2000 개(live + linger · D-11)다. 전역 한도에 닿으면 가장 오래 linger 한 키를 29(false) 로 먼저 풀고, linger 키가 없으면 거부한다. 거부된 브라우저 소켓에는 `{t:"sub.limit", i, x, scope}` 1건만 가고, 그 키는 소켓 소유권 · 키 색인 · 업스트림 어디에도 남지 않는다.**

## Performance

- **Duration:** 약 5분
- **Started:** 2026-09-30T14:27:02Z
- **Completed:** 2026-09-30T14:32:09Z
- **Tasks:** 2 (둘 다 TDD — RED test → GREEN feat)
- **Files modified:** 6

## Accomplishments

- `subscribe` 가 참조계수를 바꾸기 **전에** 한도를 판정하고 `HubSubscribeResult` 를 돌려준다. 거부하면 상태는 그대로이고, `subLimitRejects` 를 1 올리고, `[HUB] 구독 한도 — 새 키 거부 (D-11 · D-15)` warn 을 1건 남긴다.
- `#userRefs` 가 사용자별 키 참조(탭 · level 합산)를 센다. 26-11 넛지의 「사용자별 0→1」 판정에도 이 맵을 쓸 수 있다.
- fanout 은 hub 판정이 `"ok"` 일 때만 `conn.keys` · `#keyConns` 에 등록하고 캐시로 바로 응답한다. 거부면 그 소켓에만 `sub.limit` 을 보낸다.

## 한도 판정 순서 (hub `subscribe`)

| 순서 | 조건 | 결과 |
|---|---|---|
| ① | 그 사용자에게 새 키(`#userRefs` 에 없음) **이고** 사용자 키 수 ≥ `USER_SUB_LIMIT`(200) | `"limit-user"` — 상태 무변경 |
| ② | 업스트림에 없는 새 키(`#refs` 항목 없음 · linger 키는 항목이 있다) **이고** `#refs.size` ≥ `QUOTE_SUB_LIMIT`(2000) | linger 키가 있으면 `since` 최소 키를 `#releaseKey(key, "구독 한도 — linger 먼저 해제 (D-11)")` 로 29(false) 해제한 뒤 ③, 없으면 `"limit-global"` |
| ③ | 수용 | `#userRefs` +1 → 종전 흐름(linger 복귀 · 0→1 · 승격 · 공유) → `"ok"` |

- 이미 업스트림에 있는 키(다른 사용자가 연 키 · linger 키)를 새로 여는 것은 전역 한도에 걸리지 않는다. 업스트림 키 수가 늘지 않기 때문이다.
- `unsubscribe` 는 전역 참조계수를 내린 뒤 `#userRefs` 를 내린다. 0 이 되면 항목을 지우고, 빈 사용자 맵도 지운다. `closeAll` 이 맵을 비운다.
- 한도 상수의 근거는 서버 원문이다. `kMaxObserverSubsPerConn = 2000`(MarketPublisher.h:94)과 `kMaxSubsPerConn = 200`(MarketPublisher.h:88)을 JSDoc 에 인용했다.

## 거부 프레임 모양

```ts
// packages/shared/src/relay.ts — RelayOutbound 에 합류 · index 재수출
export type RelaySubLimitMsg = { t: "sub.limit"; i: string; x: RelayExchange; scope: "global" | "user" };
```

- 거부한 그 소켓에만 1건 간다. 같은 사용자의 다른 탭과 다른 사용자에게는 가지 않는다.
- `{t:"msg"}`(fanout `rejectFrame`)는 재사용하지 않았다. 그 슬롯은 전략 카드가 같은 ISIN 오류로 소비하기 때문이다(RESEARCH Pattern 9-2).
- webapp 리듀서의 `default:` 가 모르는 `t` 를 무시하므로, relay 를 먼저 배포해도 옛 webapp 이 깨지지 않는다. webapp 표시(토스트 · 배지)는 이 플랜 범위 밖이다.

## 새 테스트 이름

- `relay/tests/hub.test.ts` — `describe("구독 한도 (D-11 · D-15)")`
  - HL1 상수는 서버 원문 복제다 — 전역 2000(kMaxObserverSubsPerConn) · 사용자 200(kMaxSubsPerConn)
  - HL2 전역 2000 에서 새 사용자의 새 키는 limit-global — 28/29/32 0건 · subLimitRejects 1 · warn 1 · 기존 키 불변
  - HL3 전역 2000 이 linger 키를 포함하면 가장 오래 linger 한 키를 29(false) 로 먼저 풀고 새 키를 받는다
  - HL4 한 사용자의 201번째 새 키는 limit-user — 다른 사용자의 새 키 · 그 사용자의 기존 키 추가 탭은 ok
  - HL5 사용자가 키 하나를 끝까지 해제하면(그 사용자 참조 0) 사용자 키 수가 199 로 줄어 새 키를 받는다
  - HL6 생성자 limits 주입이 두 한도를 바꾼다 — { global: 3, user: 2 }
  - HL7 거부된 키는 상태를 남기지 않는다 — 그 키 해제는 「참조계수 없는 해제」 warn 뒤 무시 · closeAll 이 사용자 계수를 비운다
- `relay/tests/fanout.test.ts` — `describe("구독 한도 — sub.limit 프레임 · 그 소켓만 · 게이트웨이 0 (D-11 · D-15)")`
  - SL1 사용자 한도 — A 의 3번째 새 키는 그 소켓만 scope:user 1건 · {t:msg} 0 · 29 누적 2, 뒤에 B 가 그 키를 열어도 A 소켓에 59 0건
  - SL2 전역 한도 — 3 키가 찬 뒤 B 의 새 키는 scope:global, A 가 키 하나를 놓아 linger 가 생기면 29(false) 뒤 수용

## TDD 기록

- **Task 1 RED** (`b7624604`): HL1~HL7 7건이 모두 실패했다. export 가 없어서(`expected undefined to be 2000`) 실패했고, `subscribe` 반환값이 없어서(`expected undefined to be 'limit-user'` · `expected undefined to be 'ok'`) 실패했고, `stats` 에 `subLimitRejects` 가 없어서 `toMatchObject` 가 실패했다. 모두 계획한 동작이 없어서 난 실패다(구문 · 로드 오류 아님).
- **Task 1 GREEN** (`ea303b58`): 7/7 통과. relay 전체는 33 files · 823 tests green 이다.
- **Task 2 RED** (`320567ba`): SL1 · SL2 가 `조건이 서지 않았습니다: A 소켓 sub.limit` / `B 소켓 sub.limit` 로 실패했다. 한도 주입 하네스는 재기동을 거쳐 구독 단계까지 정상으로 돌았고, 거부 프레임이 없어서 실패했다.
- **Task 2 GREEN** (`7adee5b2`): 2/2 통과. relay 전체는 33 files · 825 tests green 이다.
- `check tdd-red-evidence` 는 vitest 출력을 파싱하지 못한다(알려진 툴링 제약). 그래서 관찰한 실패 출력을 여기에 적었다. REFACTOR 커밋은 없다.

## Task Commits

1. **Task 1 RED: hub 구독 한도 실패 테스트** - `b7624604` (test)
2. **Task 1 GREEN: hub 구독 한도 — 전역 2000 · 사용자 200 · linger 먼저 해제** - `ea303b58` (feat)
3. **Task 2 RED: sub.limit 프레임 실패 테스트** - `320567ba` (test)
4. **Task 2 GREEN: sub.limit 프레임 — 한도 거부는 그 소켓만** - `7adee5b2` (feat)

`actuals.commits: 4` 는 `git rev-list --count 8f1cf6d9..HEAD` 로 잰 값이다.

## Files Created/Modified

- `relay/src/hub/subscription-hub.ts` — `QUOTE_SUB_LIMIT` · `USER_SUB_LIMIT` · `HubSubscribeResult` · 생성자 `limits` · `#userRefs` · `#rejectSubscribe` · `#oldestLingerKey` · `#releaseUserRef` · `HubStats.subLimitRejects` · 헤더 D-11 · D-15 블록
- `relay/tests/hub.test.ts` — `구독 한도 (D-11 · D-15)` HL1~HL7
- `packages/shared/src/relay.ts` — `RelaySubLimitMsg` · `RelayOutbound` 합류
- `packages/shared/src/index.ts` — `RelaySubLimitMsg` 재수출
- `relay/src/ws/fanout.ts` — `sub` 신규 키에서 hub 판정을 먼저 하고 거부면 `sub.limit` 전송 · level 갱신 방어 · 헤더 7번 한 줄
- `relay/tests/fanout.test.ts` — `startHarness` hub 옵션 주입 · SL1 · SL2

## Decisions Made

- 판정 순서는 사용자 → 전역이다. 사용자 한도에 걸린 요청이 linger 키를 풀지 않게 하려는 것이다. 이 순서면 거부될 요청이 자리 만들기 부작용을 남기지 않는다.
- 전역 자리 만들기는 `since` 를 선형 탐색한다. 한도에 닿았을 때만 돌고(n ≤ 2000), Map 삽입 순서에 기대지 않는다.
- `subLimitRejects` 는 누적 계수로 두고 `closeAll` 에서 초기화하지 않는다.
- 사용자 참조가 없는데 해제가 들어오면(회계 불일치) warn 을 남기고 사용자 계수만 건너뛴다. 전역 해제는 그대로 진행한다(S-5 · 무로그 fail-safe 금지).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 사용자 참조 불일치 해제 warn**
- **Found during:** Task 1
- **Issue:** 계획은 `unsubscribe` 가 `#userRefs` 를 내린다고만 적었다. 전역 참조는 있는데 그 사용자 몫이 없는 해제(회계 불일치)는 조용히 지나갈 수 있었다.
- **Fix:** `#releaseUserRef` 가 `[HUB] 사용자 참조 없는 해제 — 사용자 계수만 건너뜀` warn 을 남긴다. 전역 해제는 그대로 진행한다.
- **Files modified:** relay/src/hub/subscription-hub.ts
- **Verification:** relay 전체 823 green(기존 케이스에서 이 경로는 타지 않는다)
- **Committed in:** ea303b58

**2. [Rule 3 - Blocking] fanout 하네스 hub 옵션 주입**
- **Found during:** Task 2
- **Issue:** `startHarness` 가 `new SubscriptionHub()` 를 고정으로 만들어서 한도를 주입할 수 없었다.
- **Fix:** 두 번째 인자 `hubOpts` 를 추가했다(기존 호출부는 무변경). 한도 describe 의 `beforeEach` 는 바깥 하네스를 닫고, 옛 quote 소켓이 닫힌 것을 확인한 뒤 주입 hub 로 다시 세운다.
- **Files modified:** relay/tests/fanout.test.ts
- **Committed in:** 320567ba

---

**Total deviations:** 2 auto-fixed (1 missing critical · 1 blocking)
**Impact on plan:** 범위 확장은 없다. 1 은 회계 가시성 보강이고, 2 는 테스트 하네스를 조정한 것이다.

## Issues Encountered

없음. shared build · relay typecheck(src · tests) · webapp typecheck(src · e2e) · relay 전체 825 · webapp relay 테스트 151 모두 green 이다.

## Known Stubs

없음. webapp 이 `sub.limit` 을 표시하지 않는 것은 스텁이 아니라 범위 밖이다. 옛 리듀서는 이 프레임을 무시하고, 표시 여부는 이후 플랜이나 UI 결정에서 정한다.

## Threat Flags

없음. 새 네트워크 표면이나 인증 경로를 만들지 않았다. T-26-14(사용자당 200 + 전역 2000 · 거부는 그 소켓만), T-26-15(업스트림 송신 전 가드 · linger 먼저 해제 · `subLimitRejects`), T-26-17(`[HUB] 구독 한도` warn 에 userId · 키 · scope · limit 기록)을 적용했다.

## User Setup Required

없음. 외부 서비스 설정이 필요 없다.

## Next Phase Readiness

- 26-10(재구독 페이싱): `resubscribeAll` 은 이 플랜에서 바꾸지 않았다. 합집합 키 수가 전역 한도 안이라는 것은 이 가드가 보장한다.
- 26-11(83 넛지): 사용자별 0→1 은 `subscribe` 의 `userHeld === 0` 자리(수용 확정 뒤)에서 판정하면 된다. 전역 키가 이미 있거나 linger 중이면 넛지 대상이다.
- 26-12(healthz): `HubStats.subLimitRejects` 가 준비됐다.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-09-30*

## Self-Check: PASSED
