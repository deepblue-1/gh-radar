---
phase: 16-trading-limit-chaser-vi-my-page
plan: 29
subsystem: relay
tags: [dma, limit-chaser, symbol-map, arming-guard, vitest]

requires:
  - phase: 16
    provides: "16-25 가 relay 로 옮긴 `lc.set` 의 `market` 소유권 (`#strategyMarket`)"
  - phase: 16
    provides: "16-20 이 넣은 `#strategyArmable` 무장 가드 (WR-06)"
provides:
  - "`#isTeardown` — 「철거 요청인가」의 서버측 단일 판정 (`crud:\"D\"` ∨ 게이트 4종 전부 OFF)"
  - "`#teardownMarket` — 삭제 전용 시장 해석. 에코 캐시 → SymbolMap → 폴백 순서이며 **null 을 돌려주지 않는다**"
  - "UI `canArmBuy`·`canArmSell`·`canArmSweep` 3식과 동형인 `#strategyArmable`"
  - "fanout 회귀 6케이스 (⑰-e · ⑰-e2 · ⑰-f · ⑰-g · ⑰-h · ⑰-h2)"
affects: [relay lc.set 관문, 상따 폼의 서버측 최후 관문, 16-30 이후 갭 클로징]

tech-stack:
  added: []
  patterns:
    - "같은 메시지 안에서 **의도(등록 vs 철거)로 관문의 엄격함을 가른다** — 한쪽을 풀어도 다른 쪽은 그대로다"
    - "폴백은 근거가 강한 순서의 명시 사슬(에코 → 마스터 → 상수)이고 마지막 단계는 반드시 `logger.error` (S-5)"
    - "가드의 예외 판정을 호출부가 아니라 **함수 자신이** 소유한다 — 호출부가 늘어도 규율이 갈리지 않는다"

key-files:
  created: []
  modified:
    - relay/src/ws/fanout.ts
    - relay/tests/fanout.test.ts

key-decisions:
  - "삭제의 최종 폴백은 **거부가 아니라 `\"K\"` 송신**이다 — 전략 키 `strategyKey()` = `ISIN:계좌:거래소` 에 시장이 없어(게이트웨이 `LimitChaser::MakeKey` 동형) 폴백 값이 「무엇을 지울지」에 관여하지 않는다. 지어낸 값이 엉뚱한 대상을 지울 위험이 구조적으로 없으므로, 사용자가 자기 전략을 못 내리는 상태를 만드는 쪽이 명백히 더 나쁘다"
  - "철거 판정을 `crud === \"D\"` **하나로 두지 않았다** — 게이트 4종이 전부 꺼진 요청은 `crud:\"C\"` 로 와도 게이트웨이가 `\"D\"` 로 정규화하므로 사실상 삭제다. 옛 탭·직접 wss 처럼 `crudOf()` 를 안 태운 경로가 여기로 온다"
  - "에코 캐시 조회를 세 필드 비교가 아니라 `strategyKey()` 로 한다 — 키 조립 지점은 `envelope.ts` 하나뿐이고, 손으로 비교하면 12자 절단·거래소 정규화 중 한쪽만 반영돼 「에코가 영원히 안 맞는」 실패가 된다"
  - "무장 가드의 철거 예외를 `#strategyArmable` **안**에 뒀다 (호출부 조건이 아니라). 호출부가 늘어날 때 한쪽만 고쳐지는 것이 이 파일에서 반복된 실패 형태다"
  - "거부 문구는 갈래별로 가르지 않고 한 벌을 유지했다 — UI `ARM_BLOCKED_TEXT` 3종이 이미 필드 단위로 정확히 안내하고 이 프레임은 UI 우회 경로에만 닿는다. 두 벌이면 언젠가 서로 모순된다. 갈래 구분은 로그 `gate` 로 한다"

patterns-established:
  - "회귀 잠금 실증: 새 분기를 무력화해 새 테스트가 실제로 실패하는지 확인 후 복원 (16-27·16-28 승계)"

requirements-completed: []

duration: 12min
completed: 2026-09-09
---

# Phase 16 Plan 29: 삭제는 통과·무장은 UI 와 동형 Summary

**`lc.set` 의 관문이 잘못된 방향으로 엄격하던 것(삭제까지 막음)과 잘못된 방향으로 느슨하던 것(무장 조건 2/3 누락)을 동시에 바로잡았다 — 시장을 못 푸는 종목의 전략도 내릴 수 있고, UI 가 막는 무장 조합은 relay 도 전부 막는다.**

## Performance

- **Duration:** 약 12분
- **Tasks:** 2/2
- **Files modified:** 2 (신규 파일 0 · 마이그레이션 0)
- **relay 테스트:** 361 passed (17 files) — fanout 만 32 (신규 6)

## Accomplishments

### Task 1 — 삭제를 시장 해석 실패로 막지 않는다 (GC-WR-04 / T-16-55) · commit `e1c627e`

`#strategyMarket` 은 `crud` 를 보지 않았다. `SymbolMap` 이 ISIN 을 못 풀면(상장폐지로 `stocks` 에서 빠졌거나 relay 부팅 직후 `symbols.start()` 가 아직 안 끝났거나) **등록·수정·삭제가 전부** 「이 종목은 지금 전략을 등록할 수 없습니다」로 막혔다. 사용자가 자기 전략을 내릴 수 없는 상태 — `limit-chaser-form.tsx` 가 `gateBlocked` 에 「끄는 것은 언제나 허용한다. 무장 해제를 막으면 그게 더 위험하다」(T-16-44)고 적어 둔 위험이 서버 쪽에 그대로 남아 있었다.

**이제 시장 해석이 의도로 갈린다** (`fanout.ts:600-612`):

- **철거** (`#isTeardown` = `crud:"D"` ∨ 게이트 4종 전부 OFF) → `#teardownMarket(userId, t, cfg)`. **`null` 을 돌려주지 않는다.**
- **등록·수정** → `#strategyMarket(...)` **완전히 그대로**. 못 풀면 거부다.

`#teardownMarket` 의 폴백 사슬(`fanout.ts:814-836`)은 근거가 강한 순서다:

1. **서버가 에코한 전략의 `market`** — `this.#hub.getLimitChasers(userId)` 에서 `strategyKey(isin, accountNo, exchange)` 가 일치하는 항목. 게이트웨이가 그 값으로 저장했다는 1차 증거이고, `lc.snap` 이 쓰는 바로 그 캐시다.
2. **`SymbolMap` 해석** — 캐시에 없을 때(다른 세션이 등록했거나 재시작 직후)의 2차 근거.
3. **`TEARDOWN_MARKET_FALLBACK = "K"`** — 통과시키되 **`logger.error`**(`fanout.ts:831`): `"[WS] 시장 미해석 상태의 전략 삭제 — 폴백 시장으로 송신 (전략 키에 시장이 없어 대상은 정확하다)"`. 조용한 폴백이 아니다(S-5). 계좌번호는 싣지 않는다(T-16-45).

**③ 을 「거부」가 아니라 「통과」로 정한 근거**는 전략 키에 시장이 없다는 사실이다 — `envelope.ts` 의 `strategyKey()` = `${isin}:${accountNo}:${exchange}` 이고 게이트웨이 `LimitChaser::MakeKey` 와 동형이다. 즉 철거 프레임의 `market` 은 **무엇을 지울지에 관여하지 않는다.** 등록에서 같은 폴백이 금지인 이유(코스닥 전략이 코스피로 등록되고 반복 발주로 재생산된다 / T-16-42)가 삭제에는 성립하지 않는다.

**「전 게이트 OFF = 삭제」 규율 확인 (계획 ③).** `crudOf()` 계산은 브라우저에 있고 relay 는 `cfg.crud` 를 그대로 받으므로, 정상 경로의 전 게이트 OFF 는 `crud:"D"` 로 도착한다. 다만 그것에만 의존하지 않았다 — `#isTeardown`(`fanout.ts:793-798`)은 `webapp/src/lib/limit-chaser.ts` 의 `isDeleteIntent()` 와 **같은 네 항**(`buyEnabled`·`sellEnabled`·`cancelQtyEnabled`·`cancelTradeEnabled`, `sweepEnabled` 는 제외)을 함께 본다. `crudOf` 를 안 태운 경로(옛 탭·직접 wss)의 전 게이트 OFF 도 삭제 경로로 간다.

### Task 2 — 무장 가드를 UI `canArm*` 3식과 동형으로 (GC-WR-05 / T-16-43) · commit `b059be8`

`#strategyArmable` 은 `sellEnabled && sellOrderPrice === 0` 하나만 봤다. `sellWatchQty` 도 `sweepEnabled` 도 보지 않았으므로 **마지막 관문이 첫 관문보다 느슨했고**, 그러면 이 검사의 존재 이유(「UI 를 우회한 경로가 있어도 무장 상태가 만들어지면 안 된다」)가 성립하지 않는다.

이제 `reason` 이 3갈래다(`fanout.ts:905-920`). 각 갈래에 대응하는 UI 식을 주석으로 짝지었다:

| `gate` | relay 조건 | UI 대응 (`limit-chaser-form.tsx:343-365`) |
|---|---|---|
| `"buy"` | `buyEnabled && (buyOrderPrice === 0 ‖ buyOrderQty === 0)` | `canArmBuy = buyOrderPrice > 0 && buyQty > 0` |
| `"sell"` | `sellEnabled && (sellOrderPrice === 0 ‖ sellWatchQty === 0)` | `canArmSell = sellOrderPrice > 0 && sellWatchQty > 0` |
| `"sweep"` | `sweepEnabled && (sweepWatchPrice === 0 ‖ buyOrderPrice === 0 ‖ buyOrderQty === 0)` | `canArmSweep = sweepWatchPrice > 0 && canArmBuy` |

UI 는 `buyQty` 를 `buyOrderQtyFromAmount(금액, 가격)` 로 산출하지만 relay 가 받는 것은 이미 산출된 `buyOrderQty` 다 — 「식이 다르다」가 아니라 같은 식의 양 끝이라는 것을 주석에 남겼다(`fanout.ts:901-904`).

**삭제에는 이 가드가 걸리지 않는다.** 판정(`if (this.#isTeardown(cfg)) return true;`)을 호출부 조건이 아니라 함수 안에 뒀다 — 이 파일에서 반복된 실패 형태가 「두 곳에 적고 한쪽만 고침」이다.

**거부 로그는 형태를 유지**했다: `logger.error({ userId, t, isin, gate: reason }, "[WS] 발주가·수량 0 인 게이트 무장 …")` — 계좌번호 미포함(T-16-45). 사용자 대면 문구는 한 벌을 유지하되 세 갈래를 모두 포괄하도록 다듬었다(`"가격이나 수량이 0 인 게이트가 있어 전략을 켤 수 없습니다. 값을 확인해 주세요."`) — 필드명을 relay 에도 적으면 UI `ARM_BLOCKED_TEXT` 3종과 두 벌이 되어 언젠가 모순된다.

## Verification

| 항목 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts` | **32 passed** (신규 6) |
| `pnpm --filter @gh-radar/relay test` | **361 passed / 17 files** (이전 355 → +6) |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `grep -c 'crud === "D"' relay/src/ws/fanout.ts` | 2 (≥1) |
| `grep -c "getLimitChasers" relay/src/ws/fanout.ts` | 3 (≥2 — `lc.snap` 외에 `#teardownMarket` 에서도 쓴다) |
| `grep -c "sellWatchQty" · "sweepEnabled" · '"sweep"' (src)` | 3 · 2 · 1 (전부 ≥1) |
| `grep -c "sellWatchQty\|sweepWatchPrice" relay/tests/fanout.test.ts` | 9 (≥2) |
| `grep -rn "10\.41\.1\.120" relay/` | **2건 — 아래 「검증 기준의 정정」 참조** |

### 신규 테스트 6케이스 (이름 그대로 인용)

**Task 1 (GC-WR-04)**
- `⑰-e SymbolMap 이 모르는 ISIN 이어도 crud:"D" 는 거부 없이 게이트웨이로 나간다 (GC-WR-04)` — 거부 프레임 **0건** + `SetLimitChaserReq` **1건**(`crud:"D"`, `market:"K"`) + 폴백 `logger.error` 존재 + 로그에 계좌번호 없음
- `⑰-e2 삭제의 시장은 **에코 캐시가 1순위**다 — 종목맵이 못 풀어도 폴백까지 가지 않는다` — 에코가 `market:"Q"` 면 나가는 프레임도 `"Q"` 이고 폴백 로그는 **없다**
- `⑰-f 같은 ISIN 이라도 crud:"C" 는 여전히 거부된다 — 등록의 엄격함은 그대로다 (16-25 회귀)` — 거부 프레임 1건 + 게이트웨이 송신 0건

**Task 2 (GC-WR-05)**
- `⑰-g sellEnabled + sellWatchQty 0 은 거부된다 — UI canArmSell 과 동형 (GC-WR-05)` — 매도가는 정상이라 **옛 갈래로는 안 잡히던** 조합. `gate:"sell"`
- `⑰-h sweepEnabled + sweepWatchPrice 0 은 거부된다 — UI canArmSweep 과 동형 (GC-WR-05)` — `gate:"sweep"`
- `⑰-h2 한방은 **매수 무장 조건**을 함께 요구한다 — buyEnabled 가 꺼져 있어도 마찬가지다` — 매도만 켜 「전 게이트 OFF = 삭제」로 새지 않게 한 뒤 `buyOrderQty:0` 으로 sweep 을 막는다

### 회귀 잠금 실증 (16-27·16-28 승계)

새 테스트가 「그냥 통과하는 테스트」가 아님을 두 번 확인하고 복원했다:

- `#isTeardown` 의 `crud === "D"` 를 `false` 로 뒤집음 → **⑰-e · ⑰-e2 2건 실패** (나머지 27 통과)
- `sell` 갈래를 옛 식(`sellOrderPrice === 0`)으로 되돌리고 `sweep` 갈래를 `false` 로 무력화 → **⑰-g · ⑰-h · ⑰-h2 3건 실패** (나머지 29 통과)

## 검증 기준의 정정 — `10.41.1.120` 0건 조건

계획의 verification 은 `grep -rn "10\.41\.1\.120" relay/` **0건**을 요구하지만 실측은 **2건**이다:

- `relay/README.md:17` — 「기본 `DMA_HOST` 는 `127.0.0.1`(로컬 mock)이다. 실서버 `10.41.1.120` 과 실계좌 접속은 …」이라는 **경고 문장**
- `relay/src/dma/link-health.ts:20` — 「게이트웨이가 `10.41.1.120` 이라 이 조건이 곧 "터널이 서 있다"」라는 **주석**

둘 다 이 plan 이전부터 있던 **산문**이고 접속 대상 설정이 아니다. 이 plan 은 `relay/src/ws/fanout.ts` · `relay/tests/fanout.test.ts` 두 파일만 손댔고 새 IP 참조를 만들지 않았다. D-27(실서버·실계좌 미접속)의 실질은 지켜졌으나 **문자 그대로의 0건 조건은 성립하지 않는다** — 기준 문구가 실제 저장소 상태와 어긋나 있는 것이며, 향후 plan 이 이 조건을 그대로 인용하면 같은 불일치가 반복된다.

## Deviations from Plan

**계획대로 실행했다. 계획이 실행자에게 남긴 선택 1건과 계획보다 넓힌 항목 2건이 있다.**

**1. [계획이 위임한 선택] 삭제의 최종 폴백 — 「그래도 통과」 채택**
- 계획 문구: 「마지막 폴백을 무엇으로 할지(고정값 사용 vs 그래도 통과)는 실행자가 정하되 … 그 선택 근거를 코드 주석과 SUMMARY 에 함께 적는다」
- 채택: **고정값 `"K"` 를 실어 통과**. 근거는 전략 키에 시장이 없다는 사실(`strategyKey()` = `ISIN:계좌:거래소`)이다 — 폴백 값이 삭제 대상을 바꾸지 않으므로 「지어낸 값의 위험」이 구조적으로 없고, 남는 위험은 0 이며 얻는 것은 「전략을 내릴 수 있다」이다.
- 로그: `fanout.ts:831` `logger.error` (계획이 요구한 무로그 fail-safe 금지 / S-5)

**2. [계획보다 넓힘] 철거 판정에 「게이트 4종 전부 OFF」를 포함**
- 계획 ③ 은 「만약 게이트 4종이 전부 false 인데 `crud:"C"` 로 오는 경우가 있다면 그 경우도 삭제 경로로 보낸다」였다. 조사 결과 정상 브라우저 경로는 항상 `crud:"D"` 로 보내지만, `crudOf()` 는 브라우저에만 있으므로 **UI 우회 경로에는 보장이 없다.** 그래서 조건부가 아니라 **항상** 두 갈래를 함께 본다(`#isTeardown`). 게이트웨이가 그 요청을 어차피 `"D"` 로 정규화하므로 등록의 엄격함을 느슨하게 하지 않는다.

**3. [계획보다 넓힘] 테스트 6케이스 (계획은 4)**
- `⑰-e2`(에코 캐시 1순위)와 `⑰-h2`(한방의 매수 무장 요구)를 추가했다. 전자는 폴백 사슬의 **순서**를 잠그고(①이 ③보다 먼저), 후자는 `canArmSweep` 의 두 항 중 계획 케이스가 덮지 않은 쪽(`canArmBuy`)을 잠근다.

**4. [문구] 무장 거부 메시지 미세 조정**
- `"발주가나 수량이 0 이라 전략을 켤 수 없습니다. 가격을 확인해 주세요."` → `"가격이나 수량이 0 인 게이트가 있어 전략을 켤 수 없습니다. 값을 확인해 주세요."`
- 이유: 새 `sweep` 갈래의 원인은 「한방 감시가」라 「발주가」가 아니고, `sell` 갈래의 원인은 「감시 호가잔량」이라 「가격을 확인」이 어긋난다. 기존 테스트가 단언하는 부분 문자열(`"전략을 켤 수 없습니다"`)은 유지된다.

**자동 수정(Rule 1~3) 없음.** 사전 존재 경고·무관 실패를 건드리지 않았고, `deferred-items.md` 에 새로 적을 항목도 없다.

## Requirements

**`requirements.mark-complete` 를 돌리지 않았다.**

- **TRADE-01 / TRADE-03** — 이 plan 의 frontmatter 가 인용하는 요구사항이지만 상태를 바꾸지 않는다. 특히 **TRADE-03 은 Pending 유지가 정본**이다: 프로덕션 `/healthz` 의 `everReadyCount: 0`(16-26 실측)이 「Ready 에 도달한 DMA 세션이 한 건도 없었음」을 말하고, 그 판정은 이 plan 으로 바뀌지 않았다. 단위 검증만으로 Complete 로 올리지 않는다(RELAY-02 와 같은 기준).

## Threat Model 처리

| Threat ID | Disposition | 이 plan 의 처리 |
|---|---|---|
| T-16-55 | mitigate | ✅ 삭제·전 게이트 OFF 는 시장 해석 실패로 막지 않는다. 에코 → SymbolMap → 상수 폴백, 최종 단계 `logger.error` 동반 |
| T-16-42 | mitigate | ✅ **완화하지 않았다.** `crud:"C"` + 게이트 ON 은 여전히 거부 — ⑰-f 로 잠금 |
| T-16-43 | mitigate | ✅ UI 3식을 서버로 이식. ⑰-g · ⑰-h · ⑰-h2 로 잠금 |
| T-16-45 | mitigate | ✅ 신규 로그 2종(`#teardownMarket` 폴백 · 3갈래 무장 거부) 모두 `userId`·`t`·`isin`·(`gate`\|`fallbackMarket`)만. 테스트가 계좌번호 미포함을 단언 |
| T-16-13 | accept | ✅ FakeGateway 만 사용. 실서버·실계좌 접속 0회 (D-27 승계) |

## 배포

**미실시.** relay 재배포는 2라운드 종결 plan 에서 일괄 처리한다(16-27·16-28 과 같은 규율). 이 plan 의 변경은 아직 프로덕션에 없다.

## Known Stubs

없음. 이 plan 은 표시 표면을 만들지 않는다.

## Next

- 16-30 이후 남은 갭 클로징 2라운드 plan
- relay 재배포(2라운드 종결 plan) 후 프로덕션에서의 확인

## Self-Check: PASSED

- 파일 3종 실재 확인 (`16-29-SUMMARY.md` · `relay/src/ws/fanout.ts` · `relay/tests/fanout.test.ts`)
- 커밋 2건 실재 확인 (`e1c627e` · `b059be8`)
