---
phase: 16-trading-limit-chaser-vi-my-page
plan: 25
subsystem: relay
tags: [zod, flatbuffers, symbol-map, react, vitest, playwright, trust-boundary]

requires:
  - phase: 16-19
    provides: "`LimitChaserSurface` 가 내려보내는 `disabled`(= `status !== 'ready'`) 세션 가드 — WR-06 무장 가드를 **그 위에** 얹어 하나의 `gateBlocked()` 로 합쳤다"
  - phase: 16-20
    provides: "`packages/shared/src/relay.ts` 의 현행 계약(`DmaOrderOrigin`·`DmaOrderRow.origin`) — 같은 파일의 `RelayLimitChaserInput` 절만 손댔다"
  - phase: 16-23
    provides: "`RelayConnectionState` 에서 제거된 `account`(마지막 수신 계좌)와 isin-labels 훅 — 상따 화면의 계좌·표시 출처가 이미 정리돼 있어 `market` 파생만 걷어내면 됐다"
  - phase: 16-24
    provides: "`MAX_VI_ORDER_AMOUNT_KRW` 로 확립된 「단일 정본 + 층마다 복제 금지」 규율 — 시장 구분의 정본을 `SymbolMap` 하나로 모으는 이 plan 과 같은 형태다"
provides:
  - "`RelayLimitChaserInput` 에서 `market` 제거 (33 → **32필드**) — 브라우저가 시장 구분을 실을 자리 자체가 없다"
  - "`WsFanout.#strategyMarket()` — `lc.set` 의 ②-1 ISIN→시장 해석. `order-handler.ts` 게이트 ③-1 과 동형이고 못 풀면 기존 형식의 거부 프레임을 돌려준다"
  - "`WsFanout.#strategyArmable()` — `lc.set` 의 ②-2 무장 조건 검사. `UIntSchema` 가 0 을 통과시키므로 조립 단계가 마지막 관문이다"
  - "`isPickable(row)` (`limit-chaser-client.tsx`) — 검색 행의 선택 가능 판정 **단일 지점**(`isin` 존재 ∧ `market ∈ {KOSPI, KOSDAQ}`). `disabled` 와 `onClick` 가드가 같은 함수를 읽는다"
  - "`gateBlocked(key, next)` (`limit-chaser-form.tsx`) — 스위치 `disabled` 와 `toggleGate` 전송 가드의 **단일 지점**. `next === false`(끄기)는 언제나 통과한다"
  - "`data-slot=\"lc-arm-blocked\"` · `data-slot=\"lc-search-unorderable\"` — 「왜 못 켜는가 / 왜 못 고르는가」를 말하는 UI 계약"
affects: [16-26 배포·TRADE-01/03 재판정, 향후 lc.set 을 다루는 모든 표면, 새 전략 종류를 추가하는 plan(같은 ②-1/②-2 관문을 통과해야 한다)]

tech-stack:
  added: []
  patterns:
    - "**브라우저가 만든 값을 검증하는 대신 애초에 받지 않는다.** `z.enum(['K','Q'])` 는 형식만 봤고 `SymbolMap` 과 대조하지 않아 브라우저의 추측을 통과시켰다 — 필드를 지우면 `z.object` 가 미지 키를 떨어뜨려 실려 와도 통과하지 못한다(S→C 4필드·`vi.set.priceType` 과 같은 논리)"
    - "**조립기에 기본값을 두지 않는다.** `buildSetLimitChaserReq` 는 `market` 을 호출부에서 받는다 — 기본값 `\"K\"` 를 두는 순간 코스닥 전략이 코스피로 등록되고, 전략은 한 번의 주문이 아니라 반복 발주 설정이라 그 오차가 계속 재생산된다"
    - "**`disabled` 와 전송 가드는 같은 함수를 읽는다.** 두 곳에 따로 적으면 한쪽만 고쳐지고 그때 「비활성인데 눌리면 나가는」 경로가 뚫린다(`vi-order-list.tsx` `isConfirmable` 승계)"
    - "**막는 방향은 한쪽뿐이다.** 무장은 막고 **해제는 언제나 허용**한다 — 끄는 길을 막으면 사용자의 자산을 인질로 잡는다(T-16-44)"
    - "**고를 수 없는 것은 목록에서 그렇게 보인다.** relay 가 못 푸는 종목을 고를 수 있게 두면 사용자가 폼을 다 채우고 스위치를 켠 뒤에야 거부 프레임을 본다"
    - "**표시 전용 파생값을 게이트 조건으로 쓰지 않는다.** `estimatedSellQty` 는 정본이 아니라 표시값이고, 그것을 무장 조건에 넣으면 상따의 주 동선(사기 전에 팔 조건 걸기)이 막힌다"

key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - relay/src/dma/envelope.ts
    - relay/tests/protocol.test.ts
    - relay/tests/fanout.test.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
    - webapp/e2e/specs/trading-limit-chaser.spec.ts
    - webapp/e2e/fixtures/relay.ts

key-decisions:
  - "`lc.set` 의 시장 구분은 relay 가 소유한다 — `RelayLcSetSchema` 에서 `market` 필드를 **삭제**하고 `symbols.lookup` 으로 채운다. 못 풀면 거부다(D-28 을 `order.new` 에서 `lc.set` 으로 확장)"
  - "`buildSetLimitChaserReq` 의 파라미터를 `RelayLimitChaserInput & { market: OrderMarket }` 으로 좁혔다 — 조립기가 기본값을 갖지 않는 것이 규율의 본체다"
  - "검색 결과의 선택 가능 판정은 `isin !== null` 에서 `isin !== null ∧ market ∈ {KOSPI, KOSDAQ}` 로 넓혔다. 타입은 `Market = KOSPI|KOSDAQ` 이라고 말하지만 런타임은 KONEX·`null` 을 싣는다"
  - "매도 무장 조건은 플랜의 `sellQty > 0` 대신 **`sellWatchQty > 0`** 을 본다 — `estimatedSellQty` 는 `lib/limit-chaser.ts` 가 「표시 전용」이라 못박은 값이고, 보유 0 을 차단 조건으로 삼으면 「사기 전에 팔 조건을 거는」 상따 주 동선이 통째로 막힌다. 서버가 매도를 눕히는 조건도 `sellWatchQty === 0` 이다"
  - "한방(스윕)은 `sweepWatchPrice > 0 ∧ 매수 무장 조건` 을 함께 요구한다 — `crudOf` 의 게이트 4종에 `sweepEnabled` 가 없다는 사실이 「한방만 켠 전략은 서버가 삭제로 정규화한다」를 말한다"
  - "무장 해제는 언제나 허용한다 — `gateBlocked(key, next)` 가 `next === false` 면 무장 조건을 보지 않는다(T-16-44)"

patterns-established:
  - "받지 않기 > 검증하기: 브라우저가 정할 수 없어야 하는 값은 스키마에서 필드를 지운다"
  - "단일 판정 지점: 렌더의 `disabled` 와 전송 직전 가드가 같은 함수를 호출한다"
  - "비대칭 가드: 위험을 만드는 방향만 막고 되돌리는 방향은 항상 연다"

requirements-completed: []

duration: 20min
completed: 2026-09-09
---

# Phase 16 Plan 25: lc.set 시장구분 소유권 이관 + 무장 조건 가드 Summary

**브라우저가 지어낸 시장구분과 0원·0주 무장이 실계좌 자동발주 설정이 되는 두 경로를 닫았다 — `market` 은 스키마에서 사라지고 relay 가 ISIN 으로 풀며, 발주할 수 없는 전략은 UI·relay 양쪽에서 켜지지 않는다.**

## Performance

- **Duration:** 20min
- **Started:** 2026-09-09T02:32:07Z
- **Completed:** 2026-09-09T02:52:00Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- **WR-03 종결.** `RelayLimitChaserInput` 에서 `market` 을 제거해 `lc.set` 을 **32필드**로 줄였고, `RelayLcSetSchema.cfg` 에서 필드를 삭제해 브라우저가 실어 보내도 통과하지 못하게 했다. relay 의 `#strategyMarket()` 이 `symbols.lookup(isin)` 으로 풀고 못 풀면 거부한다 — `order.new` 게이트 ③-1 과 완전 동형이다.
- **브라우저에서 시장 추정이 사라졌다.** `row.market === 'KOSDAQ' ? 'Q' : 'K'` 와 `?? 'K'` 폴백이 모두 없어졌고 `SelectedStock.market` 자체를 지웠다 — 화면 상태로 남겨 두면 언젠가 다시 와이어로 샌다.
- **WR-06 종결.** `gateBlocked()` 한 지점이 스위치 `disabled` 와 `toggleGate` 전송 가드를 함께 읽는다. 켤 수 없을 때 카드 안에 사유 한 줄(`lc-arm-blocked`)이 서고, **이미 켜진 게이트는 언제나 끌 수 있다**. relay 도 `buyEnabled && (price|qty === 0)` · `sellEnabled && price === 0` 을 거부해 UI 우회 경로를 막는다.
- **고를 수 없는 종목이 목록에서 그렇게 보인다.** `isPickable()` 이 `isin === null` 과 시장 미상을 같은 취급으로 묶고 `lc-search-unorderable` 배지가 이유를 말한다.
- **E2E 가 실제 왕복으로 이 규율을 잠근다.** 로컬 relay 프로세스 + 스텁 게이트웨이 왕복에서 「스위치 잠김 → 금액 상향 → 켜짐 → 게이트웨이 10 수신」이 통째로 검증된다.

## Task Commits

1. **Task 1: lc.set 의 시장구분 소유권을 relay 로 옮긴다 (WR-03 / D-28)** — `404e185` (feat)
2. **Task 2: 브라우저에서 시장 추정 제거 + 시장 미상 종목 선택 차단** — `5fa8521` (fix)
3. **Task 3: 발주가·수량 0 인 게이트 무장을 UI 와 relay 양쪽에서 막는다 (WR-06)** — `b0f7f2a` (fix)
4. **(Task 3 후속) 상따 E2E 를 WR-06 무장 규율에 맞춘다** — `29eab36` (test)

**Plan metadata:** 별도 `docs(16-25)` 커밋

## Files Created/Modified

- `packages/shared/src/relay.ts` — `RelayLimitChaserInput` 의 Omit 목록에 `"market"` 추가, 「33필드」 → 「32필드」, 왜 받지 않는지 주석
- `relay/src/ws/protocol.ts` — `RelayLcSetSchema.cfg` 에서 `market` 필드 삭제 + S→C 4필드와 같은 형식의 ⚠️ 주석
- `relay/src/ws/fanout.ts` — `#symbols` 인스턴스 보관, `#strategyMarket()`(②-1), `#strategyArmable()`(②-2), `lc.set` 분기 재배선
- `relay/src/dma/envelope.ts` — `buildSetLimitChaserReq(cfg & { market })` 로 파라미터 좁힘 + 「호출부가 채운다」 근거
- `relay/tests/protocol.test.ts` — 32필드 · `market` 미지 키 탈락 · 정상 통과 케이스
- `relay/tests/fanout.test.ts` — 하네스에 `SYMBOLS` 결선, ⑰-a(KOSDAQ 이 `"Q"` 로 나감) · ⑰-b(미상 ISIN 0바이트) · ⑰-c(0원 무장 거부) · ⑰-d(꺼진 게이트는 0 이어도 통과)
- `webapp/src/components/trading/limit-chaser-form.tsx` — `market` prop·`buildCfg` 필드 제거, `canArmBuy/Sell/Sweep`·`gateBlocked()`·`ARM_BLOCKED_TEXT`, `GateSwitch` 의 `disabled` 지원, `Group` 의 `armBlocked` 슬롯
- `webapp/src/components/trading/limit-chaser-client.tsx` — `market` 파생·`?? 'K'`·`SelectedStock.market` 제거, `isPickable()` 도입, `lc-search-unorderable` 배지
- `webapp/src/lib/limit-chaser.ts` — `LimitChaserFormValues` 의 Omit 에서 `'market'` 제거(정체성 4 → 3), 근거 주석
- `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` — cfg 키 32개·`market` 부재 잠금, WR-06 7케이스(⑬), 발주 가능한 기본 픽스처로 교정
- `webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx` — `searchStocks` 스텁, ⑯ 3케이스(KONEX·`market null`·`isin null` 차단 + cfg 에 `market` 없음)
- `webapp/e2e/specs/trading-limit-chaser.spec.ts` — 테스트 3 에 「잠김 → 금액 상향 → 켜짐」 왕복 추가
- `webapp/e2e/fixtures/relay.ts` — `stocks` 스텁이 `lc.set` 의 시장 해석에도 쓰인다는 사실 명시

## Decisions Made

위 프론트매터 `key-decisions` 참조. 핵심 셋:

1. **시장 구분의 정본은 `SymbolMap` 하나다.** 값을 검증하는 대신 필드를 지운다 — `vi.set.priceType`·S→C 4필드가 이미 쓰던 논리를 `market` 에 그대로 적용했다.
2. **조립기에 기본값을 두지 않는다.** `buildSetLimitChaserReq` 가 `market` 을 인자로 요구하므로, 앞으로 어떤 호출 경로가 생겨도 시장을 「지어내는」 코드를 쓰지 않으면 컴파일되지 않는다.
3. **매도 무장 조건은 `sellWatchQty`** 다(플랜의 `sellQty` 대신). 아래 Deviations 1 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 매도 무장 조건을 `sellQty > 0` 대신 `sellWatchQty > 0` 로 잡았다**

- **Found during:** Task 3
- **Issue:** 플랜은 매도 무장 조건을 `sellOrderPrice > 0 && sellQty > 0` 으로 지정했다. 그런데 `sellQty = estimatedSellQty(sellableQty, ratio)` 이고 `lib/limit-chaser.ts` 는 이 값을 **「표시 전용, 정본은 서버가 Set 시점에 스냅샷한 `sellOrderQty`」** 라고 못박고 있다. 더 큰 문제는 동선이다 — 상따의 정상 흐름은 「아직 한 주도 없는 상태에서 매수·매도를 함께 무장」이라 `sellableQty === 0` 이 기본값이다. 플랜대로 두면 **매도 스위치가 사실상 영구히 잠겨** 이 화면의 주 동선이 막힌다(기존 테스트 3건이 즉시 깨진 것이 그 신호였다).
- **Fix:** `sellOrderPrice > 0 && sellWatchQty > 0` 으로 잡았다. 게이트웨이가 매도를 눕히는 조건이 정확히 `sellWatchQty === 0`(「0 이면 서버가 매도 활성화를 거부한다」)이라 **서버 검증과 동형**이고, WR-06 이 지목한 「시세를 못 받은 종목」은 `sellOrderPrice === 0` 으로 그대로 걸린다. relay 쪽 거부는 플랜대로 `sellEnabled && sellOrderPrice === 0` 을 유지했다.
- **Files modified:** `webapp/src/components/trading/limit-chaser-form.tsx`
- **Verification:** 「보유 0 이어도 매도는 무장할 수 있다」 · 「매도는 감시 호가잔량 0 일 때 못 켠다」 두 케이스로 양방향을 잠갔다. 근거는 코드 주석에 그대로 남겼다.
- **Committed in:** `b0f7f2a`

**2. [Rule 1 - Bug] 폼 테스트의 기본 픽스처가 「발주할 수 없는 전략」이었다**

- **Found during:** Task 3
- **Issue:** `limit-chaser-form.test.tsx` 의 기본 `echo()` 가 `buyOrderPrice: 130_000` + `buyOrderAmount: 10`(만원) 이라 산출 수량이 `floor(10만 / 13만) = **0주**` 였고, `sweepWatchPrice: 0` 이었다. 즉 「무장이 되는 전략」을 전제로 하는 케이스들이 실제로는 **WR-06 이 막아야 하는 조합** 위에서 돌고 있었다.
- **Fix:** 기본 픽스처를 `buyOrderAmount: 50`(→ 3주) · `sweepWatchPrice: 130_000` 으로 교정하고, 신규 폼 케이스에는 `upperLimit: 30_000` 시딩을 넣었다. 0주 조합은 WR-06 전용 케이스로 따로 세웠다.
- **Files modified:** `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx`
- **Verification:** `pnpm --filter @gh-radar/webapp test` 653건 green
- **Committed in:** `b0f7f2a`

**3. [Rule 1 - Bug] E2E 테스트 3 이 같은 이유로 깨졌다 (실제 결함의 실증)**

- **Found during:** Task 3 검증
- **Issue:** E2E 는 상한가 `127,400원` 종목 + WinForms 기본 주문금액 `10만원` 으로 매수 스위치를 눌렀다 — `floor(10만 / 12.74만) = 0주`. **이것이 WR-06 이 말한 바로 그 상황**이고, 옛 코드에서는 그대로 「매수 켜짐」이 됐다.
- **Fix:** 스펙을 「스위치 잠김 + 사유 표시 확인 → 주문금액 50만원 상향 → 켜짐 → 게이트웨이 10 수신」 왕복으로 바꿨다. 회귀 잠금이 더 강해졌다.
- **Files modified:** `webapp/e2e/specs/trading-limit-chaser.spec.ts`
- **Verification:** `playwright test e2e/specs/trading-limit-chaser.spec.ts` 12/12 green
- **Committed in:** `29eab36`

**4. [Rule 2 - Missing Critical] 무장 불가 사유 문구에서 「매수 발주」 표현을 뺐다**

- **Found during:** Task 3
- **Issue:** 한방 사유 문구 초안이 「한방가격이나 **매수 발주** 수량이 0 이에요」였는데, `limit-chaser-client.test.tsx` 의 「내가 껐으므로 발주가 아니다」 케이스가 `queryByText(/매수 발주/)` 로 **로그에 「매수 발주」가 없음**을 단언한다. 폼의 사유 문구가 그 조회구에 걸려 「발주됐다」는 오해를 만들 수 있었다(Pitfall 10 의 표면 확장).
- **Fix:** 「한방가격이나 **매수 주문수량**이 0 이에요」로 바꿨다 — 폼의 파생값 라벨(「산출 주문수량」)과도 어휘가 맞는다.
- **Files modified:** `webapp/src/components/trading/limit-chaser-form.tsx`, 대응 테스트
- **Verification:** 두 테스트 파일 49건 green
- **Committed in:** `b0f7f2a`

### 계획과 다르게 구현한 지점 (기능 동일)

- **`grep -c "lookup(cfg.isin)"` 대신 `#strategyMarket(conn, userId, msg.t, cfg.isin)` 호출.** 플랜의 수용 기준은 `fanout.ts` 안에 `lookup(cfg.isin)` 문자열을 요구했지만, `#strategySession`·`#accountAllowed` 와 같은 형태의 private 헬퍼로 뽑는 편이 분기 본문의 ①②③ 리듬을 유지한다(플랜 ④ 의 「같은 헬퍼를 호출한다」와 같은 취지). 실제 호출은 헬퍼 안의 `this.#symbols.lookup(isin)` 이고 `grep -c "lookup(isin)"` = 1, `grep -c "buildSetLimitChaserReq({ ...cfg"` = 1 이다.
- **`buildSetLimitChaserReq` 시그니처를 바꿨다.** 플랜은 「시그니처는 바꾸지 않는다」였으나 `RelayLimitChaserInput` 에서 `market` 을 뺀 순간 타입이 성립하지 않는다. `RelayLimitChaserInput & { market: OrderMarket }` 로 좁혀 「호출부가 채워 넣는다」는 의도는 그대로 두고 타입 수준에서 강제했다.

---

**Total deviations:** 4 auto-fixed (3 bug, 1 missing critical) + 계획 대비 구현 차이 2건
**Impact on plan:** 전부 플랜의 목표(WR-03·WR-06 종결)를 지키기 위한 수정이다. 1번은 플랜대로 두면 새 결함(주 동선 봉쇄)이 생기는 자리였고, 2·3번은 기존 픽스처가 이미 WR-06 조합 위에 서 있었다는 **실증**이다. 스코프 확장 없음.

## Issues Encountered

- **기존 픽스처가 결함을 재현하고 있었다.** 유닛 3건 + E2E 1건이 새 가드에 걸렸는데, 전부 「0주 발주」 조합이었다. 가드를 느슨하게 하는 대신 픽스처를 발주 가능한 값으로 교정했다 — 테스트를 통과시키려고 규율을 깎으면 그 순간 규율이 사라진다.
- **`market` prop 을 표시용으로 남길지 판단.** 상따 화면 어디에도 시장 배지가 없어(`market` 의 유일한 소비자가 `buildCfg` 였다) prop·상태·타입 필드를 모두 제거했다. 남겨 두면 언젠가 다시 와이어로 샌다.

## User Setup Required

None — 외부 서비스 설정 변경 없음. 배포는 16-26 소관이다.

## Next Phase Readiness

- **검증 전량 green:** `pnpm typecheck`(13 워크스페이스) 0 · relay 351 · webapp 653 · shared 99 · server 252 · `pnpm build` 0 · 상따 E2E 12/12.
- **TRADE-01 / TRADE-03 은 Pending 유지.** 요구사항 재판정은 16-26(배포 + 라이브 확인) 소관이다 — relay 재배포 전까지 프로덕션 게이트웨이는 여전히 옛 `market` 필드를 기대하지 않는다(필드가 없어져도 게이트웨이 계약은 그대로다: relay 가 채운다).
- **배포 주의:** 이 변경은 **relay 와 webapp 을 함께** 올려야 한다. 새 webapp + 옛 relay 조합은 `market` 없는 `cfg` 가 옛 스키마의 필수 필드 검증에 걸려 `lc.set` 이 전부 드롭된다. 16-26 배포 순서에서 relay 를 먼저 올린다.
- `grep -rn "10.41.1.120" relay/ webapp/src` 는 2건이나 둘 다 **문서·주석**(`relay/README.md` 경고문, `link-health.ts` 설명)이고 이 plan 이 만든 것이 아니다 — D-27 의 「실서버 접속 코드 0건」은 유지된다.

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-09*

## Self-Check: PASSED

- 파일 4/4 존재 (`packages/shared/src/relay.ts` · `relay/src/ws/fanout.ts` · `webapp/src/components/trading/limit-chaser-form.tsx` · 이 SUMMARY)
- 커밋 4/4 존재 (`404e185` · `5fa8521` · `b0f7f2a` · `29eab36`)
