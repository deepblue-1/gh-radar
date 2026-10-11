---
phase: quick-261001-dyi
plan: 01
subsystem: trading-workbench / relay-fanout
tags: [relay, websocket, subscription-level, react-hooks, playwright]

requires:
  - phase: 26-shared-quote-feed
    provides: "PRICE/FULL 구독 level · hub 참조계수 · use-relay-socket 키당 {full, price} 참조계수와 flush 재송신(W2 · W3)"
provides:
  - "useRelaySubscription level 옵션(기본 full) — 키 수명 effect 와 level 전환 effect 분리, 전환은 새 level 먼저 잡고 옛 level 놓기"
  - "StrategyCard: open 이면 full, 접히면 price 로 자기 키 구독"
  - "relay fanout: 같은 소켓 price→full 승격에서 hub 캐시 q 스냅샷 → tape 스냅샷 순 전송"
  - "e2e GC2b: 접기/펼치기 와이어 프레임 · 게이트웨이 29/28/32 · unsub 0"
affects: [trading-workbench, relay-fanout, breakout-chips]

actuals:
  tokens: 7400
  tasks: 3
  commits: 5
plan_head_before: 6f8f21f6ceb3c2076862a46f9617fcf54003d7e6

tech-stack:
  added: []
  patterns:
    - "구독 level 전환은 소비자 훅에서 「새 level subscribe → 옛 level unsubscribe」 — 탭 참조계수가 0 을 지나지 않게(relay fanout 의 같은 소켓 level 갱신 규율과 동형)"
    - "해제는 항상 heldLevelRef(실제로 잡은 level)로 — 누수 0"

key-files:
  created: []
  modified:
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/lib/__tests__/relay-provider.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - relay/src/ws/fanout.ts
    - relay/tests/fanout.test.ts
    - webapp/e2e/specs/trading-workbench.spec.ts

key-decisions:
  - "① level 판정은 카드가 open 하나로 한다(펼침 full · 접힘 price). 더티 값 · 결과 모름 잠금이 있는 접힌 카드도 price"
  - "② 전환 순서는 훅에서 보장(소켓 계층 무변경) — 키 수명 effect 와 level 전환 effect 분리"
  - "③ 접힌 카드 price sub 은 돌파 칩과 같은 flush 순위 — 추가 우선순위 장치 없음(남은 위험으로 기록)"
  - "④ 키 단위 「호가 낡음」 표시는 만들지 않는다 — 원인(승격 시 q 미전송)을 relay 에서 고친다"

patterns-established:
  - "useRelaySubscription({ level }) — level 은 deps 에 넣지 않은 키 수명 effect + cleanup 없는 전환 effect 두 개"

requirements-completed: [DYI-01, DYI-02, DYI-03, DYI-04, DYI-05, DYI-06]

coverage:
  - id: D1
    description: "펼친 카드 full · 접힌 카드(한 번도 안 펼친 카드 포함) price 로 구독"
    requirement: DYI-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card.test.tsx#구독 level — 펼침 full · 접힘 price (quick-261001-dyi)"
        status: pass
      - kind: integration
        ref: "webapp/src/lib/__tests__/relay-provider.test.tsx#L1-b level=price 로 처음 마운트하면 lv:price sub 1건으로 시작한다"
        status: pass
    human_judgment: false
  - id: D2
    description: "접기/펼치기 전환이 와이어 unsub 없이 sub 1건(다른 full 소비자가 있으면 0건)"
    requirement: DYI-02
    verification:
      - kind: integration
        ref: "webapp/src/lib/__tests__/relay-provider.test.tsx#L1 · L2"
        status: pass
    human_judgment: false
  - id: D3
    description: "전환 반복 뒤 언마운트 unsub 정확히 1건 · 재마운트 sub 1건(누수 0), 거래소 토글 순서 불변"
    requirement: DYI-03
    verification:
      - kind: integration
        ref: "webapp/src/lib/__tests__/relay-provider.test.tsx#L3 · ③-a"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card.test.tsx#거래소 prop 이 바뀌면 카드는 새 키를 본다"
        status: pass
    human_judgment: false
  - id: D4
    description: "접힌 헤더 표시 계약 불변(p · cr 갱신 · 칩 · LED · 83 무관) — 접힌 동안 헤더 가격이 꺼지지 않음"
    requirement: DYI-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#GC2b (접힌 헤더 가격 숫자 유지)"
        status: pass
    human_judgment: false
  - id: D5
    description: "relay 같은 소켓 price→full 승격 시 hub 캐시 q(호가 틱 반영)를 tape 보다 먼저 즉시 전송 · 업스트림 재요청 0"
    requirement: DYI-05
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#F9"
        status: pass
    human_judgment: false
  - id: D6
    description: "실 relay + 스텁 게이트웨이 e2e: 접기 lv:price sub · 게이트웨이 29 만, 펼치기 full sub · 28/32 각 1건, unsub 0"
    requirement: DYI-06
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#GC2b"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-10-01
status: complete
---

# Quick 261001-dyi Plan 01: 작업대 카드 접힘 price · 펼침 full 구독 Summary

**접힌 작업대 카드는 relay 를 price level 로 구독하고 펼치면 full 로 올린다. 전환은 「새 level 먼저 잡고 옛 level 놓기」라 와이어에는 unsub 없이 sub 1건만 나간다. relay 는 같은 소켓 price→full 승격 때 hub 캐시 q 를 tape 보다 먼저 보내, 펼친 직후 호가가 낡지 않는다.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-01T01:16:11Z
- **Completed:** 2026-10-01T01:25:25Z
- **Tasks:** 3 (트레이서 1 · auto 2)
- **Files modified:** 7

## Accomplishments

- `useRelaySubscription` 에 `level` 옵션(기본 `"full"`)을 더했다. 키 수명 effect(level 은 deps 밖, `levelRef` 로 최신값 읽음)와 cleanup 없는 level 전환 effect(`subscribe(새)` → `unsubscribe(heldLevelRef)`)를 따로 두었다. 해제는 항상 실제로 잡은 level(`heldLevelRef`)로 한다.
- `StrategyCard` 는 `useStrategyCardState({ ..., level: open ? "full" : "price" })` 로 부른다. 파일 헤더 ③/⑤ 에 근거를 적었다.
- relay `fanout.ts` 의 같은 소켓 level 갱신 분기에서 `lv === "full"` 이면 `getSnapshot` q 를 보낸 뒤 tape 스냅샷을 보낸다. 헤더 규칙 7 도 함께 고쳤다.
- e2e GC2b 를 추가했다. 접기는 `{t:'sub', lv:'price'}` 1건과 게이트웨이 29 만, 펼치기는 `{t:'sub'}` 1건과 28 · 32 각 1건을 만들고 unsub 은 0건이다. 펼친 뒤 사다리에 97,900 이 보인다.

### 접힌 헤더가 읽는 값 (DYI-04)

| 표시 | 출처 | 구독 level 영향 |
|------|------|----------------|
| 현재가 `p` · 등락률 `cr` | 시세 59 의 가격 섹션(`samePriceSection`) | price 소켓에도 온다(키당 100ms 간격) — 접힌 동안에도 갱신 |
| 요약 칩(미체결 · 보유) | 계좌 상태 66/67(`cardAccountSliceOf`) | 무관 |
| LED 3칩 | 서버 에코(`ledServer`) | 무관 |
| 83 잔량진행률 | 사용자 세션 경로(②) | 무관 |

## Task Commits

1. **Task 1 (tracer): 카드 open → useRelaySubscription(level) → 와이어 sub(lv)**
   - RED `61fbf27e` test(quick-261001-dyi): 카드 접힘 price · 펼침 full 구독 전환 실패 테스트
   - GREEN `99184dbd` feat(quick-261001-dyi): 접힌 작업대 카드는 price 로 구독하고 펼치면 full 로 승격
2. **Task 2: relay 승격 캐시 q 스냅샷**
   - RED `4f148297` test(quick-261001-dyi): price→full 승격 소켓 캐시 q 스냅샷 실패 테스트
   - GREEN `fd0f6938` fix(quick-261001-dyi): 같은 소켓 price→full 승격에 캐시 q 스냅샷을 먼저 보낸다
3. **Task 3: 작업대 e2e GC2b** — `3de6aab5` test(quick-261001-dyi): 작업대 카드 접기/펼치기 구독 level e2e

커밋 5개 모두 master 에 있고 한글 메시지다. Co-Authored-By 트레일러는 없다(`git log --format=%B -n 5 | grep -ci co-authored-by` = 0). push · 배포는 하지 않았다.

## TDD Gate Compliance (RED 관측 원문)

`check tdd-red-evidence` 는 vitest 출력을 파싱하지 못하므로 관측한 RED 를 여기에 그대로 옮긴다.

- **Task 1 RED**: 7 failed | 53 passed. 실패는 모두 대상 단언에서 났다. 예:
  - `L1-b … AssertionError: expected [ { t: 'sub', …(2) } ] to deeply equal [ { t: 'sub', …(3) } ]` (lv 키 없음 = level 무시)
  - `strategy-card … AssertionError: expected [ [ 'KR7086520004', 'KRX' ] ] to deeply equal [ [ 'KR7086520004', 'KRX', 'price' ] ]`
  - L3 는 구현 전에도 통과했다. 구현 전 훅은 level 을 무시해 전환 자체가 없다. L3 는 전환을 넣은 뒤에도 누수가 없는지 보는 회귀 방지 단언이다.
- **Task 2 RED**: `F9 … Error: 조건이 서지 않았습니다: 승격 q 스냅샷` (waitFor 타임아웃 — 승격 뒤 B 가 q 를 받지 못함, 계획대로)
- GREEN 은 둘 다 `feat`/`fix` 커밋으로 남겼다. REFACTOR 커밋은 없다(정리할 것이 없었다).

## 테스트 수치

| 범위 | 결과 |
|------|------|
| Task 1 verify — vitest 6파일 | 395 passed |
| webapp vitest 전량 | 140 files · 3146 passed · 1 skipped |
| relay vitest 전량 | 35 files · 882 passed (fanout.test.ts 76) |
| typecheck | shared build · relay typecheck · relay typecheck:tests · webapp typecheck(+e2e tsconfig) 모두 green |
| e2e GC2b 단독 | 2 passed (setup 포함) · 12.2s |
| e2e 작업대 스펙 전체(제외 3건) | **66 passed · 0 failed · 2.8m** |

## Files Created/Modified

- `webapp/src/lib/relay-provider.tsx` — `UseRelaySubscriptionOptions.level`, effect 두 개로 나눔, docblock 에 이유 기록
- `webapp/src/components/trading/card/strategy-card.tsx` — `UseStrategyCardStateOptions.level`(구조분해 이름 `subLevel` · 로그 level 과 섀도잉 방지), open 으로 level 결정, 헤더 ③/⑤ 주석
- `webapp/src/lib/__tests__/relay-provider.test.tsx` — `QuoteConsumer` 에 level prop 추가, describe 「level 전환」 L1 · L1-b · L2 · L3
- `webapp/src/components/trading/__tests__/strategy-card.test.tsx` — 3-인자 단언으로 갱신, open 별 level · 「새 level 먼저」 호출 순서(invocationCallOrder) 검증
- `relay/src/ws/fanout.ts` — 승격 분기에서 q 캐시 → tape 순, 헤더 규칙 7
- `relay/tests/fanout.test.ts` — F9
- `webapp/e2e/specs/trading-workbench.spec.ts` — `captureSubFrames` 헬퍼 · GC2b

## Decisions Made

- ① level 은 카드가 `open` 하나로 정한다(펼침 full · 접힘 price). 더티 값이나 결과 모름 잠금이 있는 접힌 카드도 price 다. 본문이 숨어 있어 호가를 볼 수 없다. D-36 판정은 펼친 본문의 스위치에서만 일어난다. 펼치는 순간 승격 + 승격 스냅샷이 호가를 즉시 채운다.
- ② 전환 순서는 훅이 보장한다. 소켓 계층(`use-relay-socket.ts`)은 바꾸지 않았다. relay fanout 의 「새 level 을 먼저 올리고 옛 level 을 내린다」와 같은 규율이다.
- ③ 접힌 카드의 price sub 은 돌파 칩과 같은 flush 순위(Map 삽입 순)다. 추가 우선순위 장치는 만들지 않았다.
- ④ 키 단위 「호가 낡음」 표시는 만들지 않았다. 원인을 relay(Task 2)에서 고쳤다.

## Deviations from Plan

None - plan executed exactly as written.

(작은 구현 선택 하나: `useStrategyCardState` 에서 `level` 을 `subLevel` 로 구조분해했다. 같은 함수 안 로그 콜백의 `level: "info" | "error"` 와 이름이 섀도잉되지 않게 하려는 것이다. 동작에는 영향이 없다.)

## 남은 위험

- **flush 순위 (설계 결정 ③):** 접힌 카드의 price sub 은 돌파 칩과 같은 price 버킷 순위다. 보통은 배치 복원(`readTradingLayout`)이 relay 인증 전에 끝나 카드가 먼저 삽입된다. 새로고침 직후 칩이 먼저 삽입되는 드문 순서에서는 접힌 헤더 가격이 초당 6건 버킷만큼 늦게 뜰 수 있다.
- e2e GC2b 의 28 · 32 정확 단언은 게이트웨이 요청 로그를 키 구분 없이 센다. 같은 시점에 다른 키가 새로 FULL 승격되면 흔들릴 수 있다. 현재 스펙 전체(66건)에서는 안정적이다.

## 배포 순서 (메인 세션 몫 — 이 executor 는 push · 배포하지 않음)

1. **relay 먼저.** `fanout.ts` 변경이므로 배포 스크립트와 smoke 는 26-15 와 같다.
2. 검증
3. **webapp push** (= Vercel 프로덕션 배포)

**한쪽만 배포했을 때(와이어는 양쪽 다 호환):**
- **webapp 만 나간 경우:** 카드 접기/펼치기는 정상 동작한다(relay 는 이미 `lv` 를 이해한다 — 26 단계). 다만 업스트림이 이미 FULL 인 키(다른 탭이나 사용자가 full 로 보는 종목)에서는 펼친 직후 호가 사다리와 매수1잔량이 다음 FULL 59 까지 접힌 동안 값으로 남을 수 있다. 조용한 상한가 종목이면 수 초에서 수십 초다. D-36 판정 입력이 이 영향을 받는다.
- **relay 만 나간 경우:** 사용자 쪽 변화는 없다. 이미 잠복해 있던 「돌파 칩(price) + 같은 종목 카드 마운트」 승격 결함이 먼저 고쳐질 뿐이다.
- 그래서 권장 순서는 relay → webapp 이다.

## Issues Encountered

None. Next webServer 기동 문제(NextFontGoogleFontFileReplacer)도 이번에는 나오지 않았다.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- 수정 파일 7개가 모두 디스크에 있다.
- 커밋 `61fbf27e` · `99184dbd` · `4f148297` · `fd0f6938` · `3de6aab5` 가 모두 `git log` 에 있다(plan_head_before 6f8f21f6 기준 rev-list 5).

---
*Quick: 261001-dyi*
*Completed: 2026-10-01*
