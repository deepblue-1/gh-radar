---
phase: 31-limitchaser-amount-unit
round: 2
reviewed: 2026-10-12T00:35:00Z
depth: standard
diff_base: bd81b271335f11e113e2d9a6f03b22f5f751577e
files_reviewed: 5
files_reviewed_list:
  - relay/src/ws/fanout.ts
  - relay/src/ws/protocol.ts
  - relay/tests/fanout.test.ts
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 31: Code Review Report — Round 2 (갭 클로징 재리뷰)

**Reviewed:** 2026-10-12T00:35:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

`bd81b271..HEAD` 범위의 두 수정 커밋을 읽었다.
- d023526f: WR-01 수정. relay `lc.set`이 금액이 빠진 칸을 캐시 에코로 되싣는다(`#withEchoAmounts`).
- 694d1f06: WR-02 수정. `lcQtyRowSubOf`와 `lcAmountHintOf`가 제출 주를 먼저 계산한다.

호출 경로도 함께 따라갔다.
- relay: hub `getLimitChasers`의 캐시 삽입·삭제(`crud "D"` 삭제 포함)
- webapp: `buildCfg`가 금액 8필드를 늘 싣는지, 시트·인라인 `validateCommit` → `amountLockTextOf`, `number-pad-sheet.tsx`의 상태 줄 우선순위
- gh-trade: `LimitChaserForm.cs` 5790~5806 `SetQtyAmountTip` 원문(feature/limitchaser-amount-unit)

**WR-01은 닫혔다.**
- 키 대조는 `#teardownMarket`과 같은 `strategyKey()`이고, hub 캐시 키와 같은 축이다.
- 새 탭 `buildCfg`는 `...values`로 금액 8필드를 늘 싣는다. 그래서 되싣기는 금액 키가 없는 구 탭(phase-30 이하) 프레임에서만 동작한다.
- phase-30 탭은 `formFromServer`에서 `sellWatchQty = server.sellWatchQty`(살아 있는 주)를 싣는다. 추적 ON이어도 `echo[p.qty] === cfg[p.qty]` 대조의 축이 맞다. 래칫된 주와 원값이 짝을 잃는 경우가 있지만 `AmountOrDerive`가 역산으로 떨어뜨리므로 0을 보낸 것과 같은 화면이 된다.

**WR-02는 절반만 닫혔다.**
- 두 줄 행 아래 줄은 C# `SetQtyAmountTip`과 갈래·문구가 같아졌다.
- 그러나 같은 칸의 시트·인라인 잠금 `amountLockTextOf`는 여전히 비교가 0에서 제출 주를 보지 않고 단락한다. 이 수정으로 「행은 777주(정상) ↔ 시트는 비교가격 필요(빨강·확정 불가)」라는 새 모순이 생겼다.
- 시트 안내의 새 갈래(비교가 0 ∧ 값 > 0 ∧ 제출 주 > 0)는 실제 화면에서 도달할 수 없다(R2-WR-01).

**테스트:** `relay tests/fanout.test.ts -t P31`(4건)과 `webapp lc-fields.test.ts`(84건)를 `--maxWorkers=2`로 main checkout에서 다시 돌렸고 모두 통과했다.

**범위 밖:** round-1 Info IN-01~IN-05는 다시 적지 않는다.

## Warnings

### R2-WR-01: WR-02 수정이 행 아래 줄만 고치고 시트·인라인 잠금은 그대로 둬, 같은 값에서 행은 「777주」인데 시트는 「비교가격 필요」(확정 불가)를 보인다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:519-538`(미수정 `amountLockTextOf`), `webapp/src/components/trading/lc/lc-fields.ts:750`, `webapp/src/components/trading/lc/number-pad-sheet.tsx:177-195`, `webapp/src/components/trading/lc/__tests__/lc-fields.test.ts:549-554`

**Issue:**
- **재현 (짝 원값 에코):** 에코가 `sellWatchPrice 0 · sellWatchQty 777 · sellWatchAmount 1000`이면 수정 뒤 화면은 다음과 같다.
  - 행 아래 줄은 `lcQtyRowSubOf`에 따라 「777주」(muted)다.
  - 이 행을 눌러 시트를 열면 초기값 1000에 대해 `validate` → `validateCommit` → `amountLockTextOf`가 돈다. 이 함수는 `value > 0 ∧ values[price] === 0`이면 제출 주를 보지 않고 「비교가격 필요 — 매도 비교가격을 입력하세요」를 돌려준다.
  - `number-pad-sheet.tsx:177` `issue`가 서면 상태 줄은 alert이고 `canConfirm`은 false다. 같은 값에 대해 행은 정상이라 말하고, 시트는 빨간 잠금을 말한다.
  - 인라인 편집기도 같다. 둘째 줄은 「777주」(`lcQtyRowSubOf`, `limit-chaser-form.tsx:1545`)인데 Enter를 누르면 `issueOf()`가 같은 잠금 말풍선을 띄우고 저장을 거부한다.
  - 수정 전에는 두 표면이 모두 「비교가격 필요」라 서로 맞았다. 이 모순은 이번 수정이 새로 만든 것이다.
- **죽은 갈래:** `lcAmountHintOf`의 `price === 0 ∧ qty > 0 ∧ value > 0` 갈래(`lc-fields.ts:750`)에 실제 시트는 도달하지 못한다.
  - 시트는 `issue`가 없을 때만 `hint`를 부르는데(`number-pad-sheet.tsx:191-195`), 이 조합에서는 `amountLockTextOf`가 늘 `issue`를 만든다.
  - 테스트 「WR-02 짝 원값 에코 … 시트 안내 = 777주」(`lc-fields.test.ts:549-554`)는 순수 함수만 검사한다. 그래서 화면에 한 번도 나오지 않는 글자를 고정하고 있다.
  - 시트·인라인 수준 테스트가 없어 이 모순이 드러나지 않았다.
  - 반면 구 서버 에코(금액 0 · 주 Q · 가격 0) 갈래는 `value === 0`이라 잠금이 서지 않으므로 「= Q주」가 실제로 보인다. 이 절반은 닫혔다.
- **C# 대조:** C# `SetQtyAmountTip`(5790~5806)은 「가격 0 에코의 서버 주를 보존 중이면 N주」다. C# 칸(NumericTextBox)에는 값 확정 잠금이 없다. 등록 차단(5153~)은 게이트 단위이고 웹에서는 `armBlockOf` 1·2행이 같은 일을 한다. 따라서 칸 잠금은 웹에만 있는 규칙이고, 그 규칙도 「제출 주 먼저」 원칙을 따라야 행·안내와 같은 말을 한다.
- **안전성:** 잠금을 「제출 주 0」일 때로 좁혀도 위험하지 않다.
  - 값 = 에코 표시값 ∧ 비교가 = 에코 비교가(0)이면 `buildCfg`가 에코 주 777을 그대로 싣는다. 그 확정은 `serverHolds`가 noop으로 접는다.
  - 값을 바꾸면 메모가 깨져 제출 주가 0이 되고, 그때 잠금이 다시 선다.

**Fix:** `amountLockTextOf`도 제출 주를 먼저 계산하고, 비교가 0 문구는 제출 주가 0일 때만 쓴다(`lcQtyRowSubOf`와 같은 순서).

```ts
function amountLockTextOf(field, value, values, server): string | null {
  const amountField = lcQtyAmountFieldOf(field);
  if (amountField === null || !(value > 0)) return null;
  const qty = lcSubmitQtyOf({ ...values, [amountField]: value }, amountField, server);
  if (qty > 0) return null; // 에코 메모가 서버 주를 보존 중(가격 0 짝 원값 포함) — 행 · 안내와 같은 판정
  const price = lcAmountPairOf(amountField)!.price;
  if (values[price] === 0) {
    return price === 'buyWatchPrice'
      ? '비교가격 필요 — 매수 비교가격을 입력하세요'
      : '비교가격 필요 — 매도 비교가격을 입력하세요';
  }
  return `${NUM.format(value)}만 → 0주 — 금액을 늘리세요`;
}
```

시트 수준 테스트도 하나 둔다(`limit-chaser-form.test.tsx` 또는 `number-pad-sheet.test.tsx`). 「가격 0 · 짝 원값 에코 칸을 열면 상태 줄이 `= 777주`(status)이고 확정 버튼이 막히지 않으며, 값을 1500으로 바꾸면 『비교가격 필요』 잠금」을 확인한다.

## Info

### R2-IN-01: `#withEchoAmounts`의 「짝」 판정이 주만 보고 비교가를 보지 않아, 주석의 근거와 실제 동작이 다르다

**File:** `relay/src/ws/fanout.ts:2629-2651`

**Issue:**
- JSDoc은 「주가 바뀐 칸에 옛 원값을 실으면 금액 ↔ 주 짝이 어긋난 채 저장된다」를 0으로 떨어뜨리는 근거로 든다.
- 그러나 판정은 `echo[p.qty] === cfg[p.qty]` 하나뿐이다. 구 탭이 그룹 비교가(`buyWatchPrice` · `sellWatchPrice`)만 바꾸고 주는 그대로 보내면, 에코 원값이 새 비교가와 짝이 맞지 않는데도 그대로 실린다.
- 화면 영향은 없다. C# `AmountOrDerive`와 웹 `echoAmountOf`가 `floor(금액×10000÷가격) ≠ 주`이면 역산으로 떨어지므로 0을 보낸 것과 같은 표시가 된다. 다만 주석이 말하는 불변식(「저장되는 금액은 늘 주와 짝」)을 코드가 보장하지 않는다.

**Fix:** 둘 중 하나를 고른다.
- 판정에 비교가를 더한다: `echo[p.qty] === cfg[p.qty] && echo[p.price] === cfg[p.price]`. 가격 0은 `AmountOrDerive`도 원값을 쓰므로 같은 축이다.
- 주석을 「짝 판정은 주만 본다 — 비교가가 바뀐 원값은 표시 쪽 `AmountOrDerive`가 역산으로 거른다」로 고친다.

### R2-IN-02: WR-01 relay 테스트가 키 격리와 철거 경로를 고정하지 않는다

**File:** `relay/tests/fanout.test.ts:2075-2138`

**Issue:**
- 두 테스트 모두 캐시에 에코가 1건뿐이라, `strategyKey()` 대조가 틀려도(예: 첫 에코를 무조건 집음) 통과한다. 같은 ISIN의 다른 거래소(NXT) 에코나 다른 계좌 에코가 있는 경우가 없다.
- 8쌍 중 2쌍(buyWatch · sellWatch)만 단언한다. 나머지 6쌍은 에코 금액이 0이라 어느 갈래로 가도 0이다.
- `withNeutralBuy3`를 거치는 옛 모양 철거 프레임에도 되싣기가 걸리는데, 그 경로의 테스트가 없다.

**Fix:**
- 같은 ISIN · 같은 계좌에 `exchange: "NXT"` 에코(금액 9999 · 같은 주)를 하나 더 넣고, KRX `lc.set`이 300을 싣는지(9999가 아닌지) 단언한다.
- 가능하면 8쌍 모두 서로 다른 에코 금액을 주고 쌍별로 단언한다.

---

_Reviewed: 2026-10-12T00:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
