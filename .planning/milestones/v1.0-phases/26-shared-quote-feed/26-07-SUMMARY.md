---
phase: 26-shared-quote-feed
plan: 07
subsystem: relay
tags: [relay, hub, fanout, price-level, quote-feed, d-05, d-06, d-07, tdd]

requires:
  - phase: 26-03
    provides: "HubMarketEvent { key, msg, full, price } · #onQuote · SubRefs · effectiveLevel · #deliverMarket 소켓 level 필터"
  - phase: 26-06
    provides: "quote 연결 프레임 경계 · fanout quote 스텁 하네스(F1~F7)"
provides:
  - "PRICE_MIN_INTERVAL_MS = 100 (gh-trade MarketPublisher.h:159 복제)"
  - "samePriceSection(a, b) — 가격 섹션 12필드 직접 비교(et · 호가 6칸 · 정적 4칸 제외)"
  - "키당 PRICE 게이트(lastPriceSentMs · pending · 타이머 1개) — #onQuote 가 market price 플래그를 키 단위 1회 판정"
  - "지연 방출 { full: false, price: true } — 마지막 PRICE 송신 +100ms 에 캐시 최신 q"
  - "게이트 정리: price 이탈 · FULL→PRICE 강등 · 1→0 · closeAll · 58"
affects: [26-08 linger (1→0 게이트 정리 자리), 26-09 limits, 26-11 nudge]

actuals:
  tokens: 7350
  tasks: 2
  commits: 4
plan_head_before: bf6da9b58377c3435fe07d03e00666fd83dbf90b

tech-stack:
  added: []
  patterns:
    - "서버 dirty 비트 없는 와이어에서 섹션 갱신을 복제할 때는 직전 캐시와 섹션 필드를 직접 비교한다 — 다른 섹션도 덮어쓰는 칸(et)은 서명에서 뺀다"
    - "키당 게이트는 참조계수가 바뀌는 자리(unsubscribe 한 줄: refs.price === 0 || 실효 PRICE)에서 한 번에 정리한다 — feed 준비 여부와 무관"
    - "Date 를 가짜로 두지 않는 fanout 하네스에서 시각을 밀 때는 Date.now 단조 오프셋 스파이(restoreAllMocks 원복)"

key-files:
  created: []
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/tests/hub.test.ts
    - relay/tests/fanout.test.ts

key-decisions:
  - "58(snap)은 언제나 price 참이고 pending · 타이머를 비운다 — 스냅샷이 최신 상태를 이미 실었다"
  - "게이트가 없는 FULL 키(스냅샷 전 59 · price 소비자 합류 직후)의 첫 가격 갱신은 바로 통과(lastPriceSentMs = -Infinity)"
  - "price 소비자만 빠지고 FULL 이 남는 경우도 게이트를 지운다(계획의 강등 · 1→0 · closeAll 에 추가) — 볼 소켓 없는 지연 방출 방지"
  - "지연 방출 발화 시점에 키가 FULL 업스트림 + price 소비자가 아니면 방출하지 않는다(방어)"

patterns-established:
  - "PRICE 판정은 hub 키 단위 1회 — fanout 은 26-03 #deliverMarket(소켓 level) 그대로, 비용이 소켓 수와 무관(T-26-11)"

requirements-completed: []

coverage:
  - id: D1
    description: "FULL 업스트림 키에서 호가(B6) · 체결 시각만 바뀐 59 는 price:false · 타이머 0, 체결/VI 발동예상가/KRX 종가가 바뀐 59 는 100ms 간격 충족 시 price:true"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#PRICE 판정 (D-05 · D-06) P2 · P4 · P5 · P7"
        status: pass
    human_judgment: false
  - id: D2
    description: "100ms 안의 가격 갱신은 억제 · pending, 마지막 PRICE 송신 +100ms 에 그 시점 최신 상태 1건이 { full:false, price:true } 로 방출(유실 없이 지연만)"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#PRICE 판정 (D-05 · D-06) P6 100ms 안의 체결은 억제되고 pending — 마지막 송신 +100ms 에 그 시점 최신 상태 1건이 price 로만 나간다"
        status: pass
    human_judgment: false
  - id: D3
    description: "업스트림 PRICE 키 판정 생략(전부 통과) · price 참조 0 키 price:false · 강등/1→0/price 이탈/58 이 pending 지연 방출을 0건으로 정리"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#PRICE 판정 (D-05 · D-06) P3 · P8 · P9 · P10 · P11 · P12 · P13"
        status: pass
    human_judgment: false
  - id: D4
    description: "실 wss PRICE/FULL 혼합 소켓 — 호가 틱 A 1 · B 0, 체결 A 1 · B 1(본문 동일 · D-07), tape A 만, quote 연결 75 는 A · B 0 · unhandledFrameCount 0"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#F8 PRICE/FULL 혼합 소켓 — 호가 틱 price 0 · 체결 price 1 · tape full 만 · 75 브라우저 0 (D-05 · D-07)"
        status: pass
      - kind: other
        ref: "뮤테이션 — #onQuote price 를 true 로 고정하면 F8 이 'expected length 1 but got 2'(B 가 호가 틱 수신)로 실패, 원복"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-05 편차(VI 상태만 바뀐 R8 불통과)는 PRICE 소비처가 q.p 만 읽어 표시 차이 없음 — grep 근거 기록"
    verification:
      - kind: other
        ref: "grep -rnE 'SUB_LEVEL[^=]*=\\s*\"price\"|lv:\\s*\"price\"' webapp/src · grep -nE '\\bq\\??\\.(…)\\b' use-breakout-quotes.ts breakout-strip.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "packages/shared · webapp 무변경(D-07) · relay 전체 회귀 green"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/relay run typecheck && typecheck:tests && test (33 files · 803 tests)"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-09-30
status: complete
---

# Phase 26 Plan 07: PRICE 소켓 판정기 relay 이관 Summary

**relay hub 가 서버 PRICE 규칙을 키 단위로 복제한다. 같은 종목을 다른 사용자가 FULL 로 보고 있어도 돌파 칩(PRICE 소켓)에는 가격 섹션(체결 · VI 발동예상가 · KRX 종가)이 바뀐 59 만 키당 100ms 간격으로 간다. 억제된 갱신은 버리지 않고 마지막 송신 +100ms 에 그 시점 최신 상태 1프레임으로 나간다. `samePriceSection` 은 필드 12개를 직접 비교하고 `PRICE_MIN_INTERVAL_MS = 100` 을 쓴다. 웹 타입과 파서는 바꾸지 않았다.**

## Performance

- **Duration:** 약 7분
- **Started:** 2026-09-30T14:03:41Z
- **Completed:** 2026-09-30T14:10:30Z
- **Tasks:** 2 (TDD — RED test → GREEN feat, Task 2 는 test-after + 뮤테이션 확인)
- **Files modified:** 3

## Accomplishments

- `#onQuote` 가 직전 캐시와 새 q 를 비교해 `"market"` 이벤트의 `price` 플래그를 정한다(`#priceFlag`). fanout 은 26-03 의 `#deliverMarket` 을 그대로 쓴다.
- 키당 PRICE 게이트(`#priceGates`: `lastPriceSentMs` · `pending` · `timer` 1개)와 지연 방출(`#flushPrice`)을 붙였다. 게이트는 정리 경로 5곳에서 지운다.
- 실 wss 로 PRICE/FULL 혼합 소켓의 결과를 고정했다(F8). 뮤테이션으로 테스트가 판정기를 실제로 지키는지도 확인했다.

## 서명 필드 표 (`samePriceSection`)

| 섹션 (서버 dirty 비트) | 서명 포함 | 제외 | 이유 |
|---|---|---|---|
| A3 체결 (Trade = 2) | `p o h l c cs cr v va` | `et` | 체결마다 `v` 가 올라 체결 틱은 반드시 다르다. `et` 는 B6 도 덮어쓴다(Pitfall 4) |
| R8 VI (VI = 4) | `viu vid` | — | VI 상태와 종류는 와이어에 없다. 그래서 아래 D-05 편차가 생긴다 |
| A6 종가 (Close = 8) | `kc` | — | |
| B6 호가 (Book = 1) | — | `ap aq bp bq ta tb` | `kDirtyPriceMask` 가 호가를 제외한다 |
| 마스터 정적 | — | `ul ll base ls` | 가격 섹션 갱신과 무관하다 |

## 판정 규칙 (`#priceFlag` — 키 단위 1회)

| 입력 | price 플래그 | 게이트 |
|---|---|---|
| 58 (snap) | 참 | 비우고, FULL 업스트림 + price 소비자면 `lastPriceSentMs = now` |
| price 참조 0 | 거짓 | 정리 |
| 업스트림 실효 PRICE (full 0) | 참 (판정 생략 · 서버가 이미 거름) | 정리 |
| FULL 업스트림 · 가격 섹션 불변 · pending 아님 | 거짓 | 그대로 (타이머 0) |
| FULL 업스트림 · (변경 또는 pending) · `now - last ≥ 100` | 참 | `last = now` · pending 해제 · 타이머 해제 |
| FULL 업스트림 · (변경 또는 pending) · `< 100` | 거짓 | pending · 타이머 1개 `last + 100` (이미 있으면 그대로) |
| 타이머 발화 | `{ full: false, price: true }` · 캐시 최신 q | `last = now` · pending 해제 |

## 새 테스트

- `relay/tests/hub.test.ts` — `describe("PRICE 판정 (D-05 · D-06)")` P1~P13. `vi.useFakeTimers()` 로 `Date` 까지 가짜로 둔다.
  - P1 상수 100 · P2 `samePriceSection`(호가 · `et` · 정적만 다르면 같다, 서명 필드 12칸은 하나씩 바꾸면 다르다)
  - P3 58 통과 · P4 호가만 바뀐 59 는 price 0 · 타이머 0 · P5 체결 59 통과
  - P6 t0 체결 통과 → t0+60 체결 억제 → t0+80 호가만 바뀐 59 도 억제 → t0+99 0건 → t0+100 `{full:false, price:true}` 1건, 본문은 t0+80 프레임과 deep-equal
  - P7 VI 발동예상가만 · KRX 종가만 바뀐 59 통과 · P8 업스트림 PRICE 키는 호가 틱도 통과 · P9 price 참조 0 이면 price:false · 타이머 0
  - P10 강등 · P11 1→0 · P12 price 이탈(FULL 은 남음) · P13 58 — 넷 다 pending 지연 방출 0건
- `relay/tests/fanout.test.ts` — `F8 PRICE/FULL 혼합 소켓 — 호가 틱 price 0 · 체결 price 1 · tape full 만 · 75 브라우저 0 (D-05 · D-07)`

## TDD 기록

- **RED** (`3020d0fa`): P1~P13 을 추가하고 판정기 없이 돌렸다. 13건 중 8건이 실패했다.
  - 동작 단언 실패: P4 · P6 · P9 가 `expected { key: 'KR7005930003|KRX', …(3) } to match object { full: true, price: false }` 로 실패했다(당시 price 플래그가 늘 참이었다). P10 · P11 · P13 은 `expected +0 to be 1` 로 실패했다(pending 타이머가 없었다).
  - export 부재: P1 `expected undefined to be 100`, P2 `samePriceSection is not a function`.
  - P3 · P5 · P7 · P8 · P12 는 옛 「늘 참」 동작에서도 참이라 통과했다. 회귀를 막는 가드 역할이다.
  - `check tdd-red-evidence` 는 vitest 출력을 파싱하지 못한다(알려진 툴링 제약). 그래서 관찰한 실패 출력을 여기에 기록했다.
- **GREEN** (`6237ae68`): 판정기를 구현하자 P1~P13 13건이 전부 통과했다. relay 전체는 33 files · 802 tests green 이었다.
- **Task 2** (`13835b0d`): 판정기가 이미 있어 F8 은 처음부터 통과했다. 그래서 뮤테이션으로 확인했다. `#onQuote` 의 price 를 `true` 로 고정하자 F8 이 `expected [ Array(2) ] to have a length of 1 but got 2` 로 실패했다(B 가 호가 틱을 받았다). 확인 뒤 원복했다.
- REFACTOR 커밋 없음.

## D-05 편차

**편차:** VI 상태만 바뀐 R8(참조가 불변)은 relay 가 통과시키지 않는다. 서버보다 엄격하다. `RelayQuote` 에 VI 상태 · 종류 칸이 없어서, 그런 R8 로 나온 59 는 와이어상 가격 칸 12개가 직전과 같기 때문이다. 서버는 `kDirtyVI` 비트를 보고 PRICE 프레임을 내지만 relay 는 그 비트를 받지 못한다.

**PRICE level 구독처 (전수):**

```
$ grep -rnE 'SUB_LEVEL[^=]*=\s*"price"|lv:\s*"price"' webapp/src --include='*.ts' --include='*.tsx' | grep -v __tests__
webapp/src/lib/use-breakout-quotes.ts:74:const BREAKOUT_SUB_LEVEL: RelaySubLevel = "price";
webapp/src/lib/use-relay-socket.ts:259:    ? { t: "sub", isin: entry.isin, ex: entry.ex, lv: "price" }
webapp/src/lib/use-relay-socket.ts:593:   * 실효 level 이 full→price 로 바뀌면 `lv:"price"` 로 `sub` 을 다시 보낸다.
webapp/src/lib/use-relay-socket.ts:1919:        // 아직 다른 소비자가 보고 있다 — full→price 강등이면 `lv:"price"` 로 재송신, 아니면 무동작.
```

`use-relay-socket.ts` 세 줄은 전송 경로다. 탭 안의 실효 level 을 합성해(`effectiveSubLevel` :252) `sub` 을 보낼 뿐이고 `RelayQuote` 를 소비하지 않는다. `"price"` level 을 요청하는 소비자는 `use-breakout-quotes.ts` 의 `BREAKOUT_SUB_LEVEL` 하나다. 그 결과는 돌파 칩 `webapp/src/components/trading/workbench/breakout-strip.tsx:298` `const { prices } = useBreakoutQuotes(...)` 가 쓴다(`RelaySubLevel` 을 `"price"` 로 넘기는 다른 호출부도 grep 결과 없음).

**그 소비처가 읽는 `RelayQuote` 필드:**

```
$ grep -nE '\bq\??\.(p|o|h|l|c|cs|cr|v|va|viu|vid|kc|ap|aq|bp|bq|ta|tb|et)\b' webapp/src/lib/use-breakout-quotes.ts webapp/src/components/trading/workbench/breakout-strip.tsx
webapp/src/lib/use-breakout-quotes.ts:105:  return q !== undefined && Number.isFinite(q.p) && q.p > 0 ? q.p : undefined;
```

- `use-breakout-quotes.ts` 가 `RelayQuote` 를 읽는 곳은 `breakoutQuotePrice`(:99-106) 하나이고, 필드는 `p` 뿐이다. `priceSigOf` · `readPrices` 도 이 함수만 거친다.
- `breakout-strip.tsx` 는 `RelayQuote` 를 직접 읽지 않는다. 숫자 맵 `prices` 만 받는다. 등락률은 `((o.price - row.basePrice) * 100) / row.basePrice`(:495-497)로 계산하는데, 기준가 `row.basePrice` 는 76/78 돌파 항목 값이지 `RelayQuote` 가 아니다.
- `viu` · `vid` · VI 상태를 읽는 PRICE 소비처는 없다.

**결론:** VI 상태만 바뀐 R8 은 relay 가 통과시키지 않는다(서버보다 엄격). 하지만 PRICE 소비처는 `p`(현재가) 만 읽으므로 표시 차이가 없다. 그런 R8 의 59 는 `p` 도 직전과 같아, 통과시켰더라도 칩이 그리는 값은 같았다.

## Task Commits

1. **Task 1 RED: PRICE 판정 hub 단위 실패 테스트** - `3020d0fa` (test)
2. **Task 1 GREEN: PRICE 소켓 판정기 relay 이관** - `6237ae68` (feat)
3. **Task 2: PRICE/FULL 혼합 소켓 실 wss · D-05 편차 근거** - `13835b0d` (test)

`actuals.commits: 4` 는 `git rev-list --count bf6da9b5..HEAD` 로 측정한 값이다. 이 중 `6072b065 fix(trading): 카드 제목 포커스를 …` 는 같은 트리에서 동시에 작업하던 다른 세션의 커밋이다(webapp 카드). 이 플랜이 만든 커밋은 위 3건이고, 셋 다 `relay/` 파일만 건드린다.

## Files Created/Modified

- `relay/src/hub/subscription-hub.ts`: 헤더에 D-05 · D-06 · D-07 블록과 알려진 차이 한 줄을 넣었다. 그 밖에 `PRICE_MIN_INTERVAL_MS` · `samePriceSection` · `PriceGate` · `#priceGates` · `#priceFlag` · `#flushPrice` · `#dropPriceGate` 를 추가했고, `unsubscribe` 와 `closeAll` 에 게이트 정리를 넣었다.
- `relay/tests/hub.test.ts`: `describe("PRICE 판정 (D-05 · D-06)")` P1~P13.
- `relay/tests/fanout.test.ts`: F8 PRICE/FULL 혼합 소켓을 추가했다(`buildBareEnvelope` · `droppedEnvelopeCount` · `PRICE_MIN_INTERVAL_MS` import).

## Decisions Made

- 58 은 언제나 price 참이고 pending 을 덮는다(P13). 스냅샷이 이미 최신 상태이므로 지연 방출은 중복이 된다.
- 게이트가 없는 FULL 키의 첫 가격 갱신은 바로 통과시킨다. 예를 들어 price 소비자가 합류한 직후나, 승격 직후 58 보다 먼저 온 59 가 그렇다. 억제할 기준 시각이 없기 때문이다.
- 게이트 정리는 `unsubscribe` 의 한 줄 조건 `refs.price === 0 || effectiveLevel(refs) === "price"` 에서 한다. 계획에 적힌 강등 · 1→0 에 더해 「price 소비자만 이탈, FULL 은 남음」 도 덮는다(P12).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] fanout 하네스에서 `vi.setSystemTime` 이 `Date.now()` 에 닿지 않음**
- **Found during:** Task 2 (F8)
- **Issue:** 계획은 「`vi.setSystemTime` 으로 100ms 를 민다」 였다. 그런데 fanout 하네스는 `toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"]` 로 `Date` 를 가짜로 두지 않는다. 그래서 `setSystemTime` 이 실시계 `Date.now()` 를 바꾸지 못했다. 체결 59 는 B 에게 pending 으로 남았고 `조건이 서지 않았습니다: 시세 도착` 으로 실패했다.
- **Fix:** 그 케이스에서만 `vi.spyOn(Date, "now").mockImplementation(() => realNow() + PRICE_MIN_INTERVAL_MS)` 로 실시계에 단조 오프셋을 더했다. 기존 afterEach 의 `vi.restoreAllMocks()` 가 원복한다. 지연 방출 타이머가 아니라 「간격 충족 즉시 통과」 경로를 그대로 본다.
- **Files modified:** relay/tests/fanout.test.ts
- **Verification:** F8 green. 판정기를 무력화하는 뮤테이션에서는 실패한다.
- **Committed in:** `13835b0d`

**2. [Rule 2 - Missing Critical] price 소비자만 이탈(FULL 은 남음) 시 게이트 정리 추가**
- **Found during:** Task 1
- **Issue:** 계획의 정리 지점은 FULL→PRICE 강등 · 1→0 · closeAll 이다. 그런데 price 참조만 0 이 되고 FULL 이 남으면 예약된 지연 방출 타이머가 남는다. 받을 price 소켓이 없는데도 발화한다(T-26-11 · 키당 타이머 유계).
- **Fix:** `unsubscribe` 에서 `refs.price === 0` 일 때도 `#dropPriceGate` 를 부른다. `#flushPrice` 도 발화 시점에 FULL 업스트림 + price 소비자인지 다시 확인한다.
- **Files modified:** relay/src/hub/subscription-hub.ts
- **Verification:** hub P12 green.
- **Committed in:** `6237ae68`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** 둘 다 테스트 방법 또는 정리 경로의 보강이다. 판정 규칙과 와이어는 계획 그대로다.

## Issues Encountered

- 실행 중 다른 세션이 master 에 webapp 커밋 `6072b065` 을 넣었다. 내 커밋은 파일을 경로 지정으로 스테이징해 그 커밋이나 미커밋 파일과 섞이지 않았다.

## Threat Model

- T-26-11 (DoS · PRICE 판정 비용) — mitigate 를 적용했다. 판정은 키 단위 1회이고, 필드 12개를 직접 비교한다(문자열 조립 없음). 타이머는 키당 최대 1개이며(P6 `getTimerCount() === 1`), 강등 · 1→0 · price 이탈 · closeAll · 58 에서 정리한다.
- 새 보안 표면 없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 26-08(linger)은 1→0 을 linger 로 바꿀 때 `#dropPriceGate` 호출 위치를 함께 옮겨야 한다. 지금은 `unsubscribe` 에서 `refs.price === 0` 이 되는 즉시 지운다. linger 중인 키는 price 소비자가 없으므로 그대로 두어도 무해하다. 다만 만료 시 캐시를 지우는 자리에서도 게이트가 없어야 한다.
- 배포는 relay 먼저 → push 순서를 따른다(이 플랜은 커밋까지만).

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-09-30*

## Self-Check: PASSED
