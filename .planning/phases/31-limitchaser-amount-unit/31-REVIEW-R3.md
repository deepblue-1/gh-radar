---
phase: 31-limitchaser-amount-unit
round: 3
reviewed: 2026-10-12T08:19:28Z
depth: standard
diff_base: 52e2592b2fbfb42954b59ed1c30f9699195e9460
files_reviewed: 10
files_reviewed_list:
  - packages/shared/src/lc-amount.ts
  - packages/shared/src/__tests__/lc-amount.test.ts
  - relay/src/dma/envelope.ts
  - relay/src/ws/fanout.ts
  - relay/tests/fanout.test.ts
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 31: Code Review Report — Round 3 (R2 수정 + quick-261012-mig 재리뷰)

**Reviewed:** 2026-10-12T08:19:28Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

R2 리뷰(31-REVIEW-R2.md) 이후의 소스 커밋을 `git show`로 읽었다.
- 31 수정 라운드 2: d890d07f · fee82cf8 · 9292fbdb · 0f828782 · cc92581d · 19839e14 · 17ac5c6b · 251cf2f0
- quick-261012-mig: 708c4772 · ef9e5173 (ef9e5173의 소스 변경은 주석 한 곳이고 나머지는 테스트다)

호출 경로도 함께 따라갔다.
- 훅 `use-lc-field-commit.ts`의 in-flight 판정 이펙트(876~965행)와 카드 `strategy-card.tsx`의 `acceptAnswer` 경로
- `validateCommit` → `amountLockTextOf` → `lcLegacyBlockOf` → `armBlockOf` 체인과 `lcBaseValues`
- relay `lc.set` 경로(`withNeutralBuy3` → `#withEchoAmounts`)
- gh-trade `feature/limitchaser-amount-unit`의 `LimitChaserForm.cs` 5100~5225(`addBuyLive` · `addMaxFloored` · `AnyArmed` 5689~)

**각 수정이 주장대로 고치는가:**
- **R2-WR-01 (d890d07f): 닫혔다.** `amountLockTextOf`가 제출 주를 먼저 보고, 행 · 안내 · 시트/인라인 잠금이 같은 판정을 쓴다. 가격 0 짝 원값 에코에서 행 「777주」 ↔ 시트 「비교가격 필요」 모순이 사라졌다. 값을 바꾸면 메모가 깨져 잠금이 다시 선다. 사전 검증 `armBlockOf` 1 · 2행이 매수/매도 활성 그룹의 가격 0을 따로 막으므로 풀어 준 잠금이 무장 가드를 우회하지 않는다.
- **IN-03 (fee82cf8): 맞다.** 로컬 `submitQtyOf`는 `lcSubmitQtyOf`와 식이 같다(가격은 `values[pair.price]`, 에코는 `server ? echoAmountOf : null`). lc-fields → lib/limit-chaser는 런타임 순환이 없다(`lib/limit-chaser`는 `@/lib/lc-ranges`와 shared만 import).
- **IN-01 (9292fbdb) → 708c4772로 대체:** 금액 비교(①)가 빠지고 C# e4a66ae2와 같은 「제출 주끼리」만 남았다. C# `LimitChaserForm.cs` 5205~5210과 대조해 조건 · 순서(최대 0주 → 최소 > 최대) · 모달 원문이 같다. C# 등록 검증은 `crud == Create`에서만 도는데 웹의 `isDeleteIntent` 선 면제와 같고, C# `AnyArmed`(5689)도 줄매수 ☐자동을 넣지 않아 동형이다.
- **IN-05 (0f828782): 맞다.** `amountFromQty`의 BigInt 분기 기준을 `p + 5000`으로 바꾼 것은 옳고(`p`가 안전 정수여도 합이 넘으면 BigInt), 경계 테스트도 있다.
- **IN-04 (19839e14) · R2-IN-01 (17ac5c6b) · R2-IN-02 (251cf2f0): 맞다.** `LcAmountKey`는 shared index에서 `export *`로 나가고 relay · webapp typecheck가 깨끗하다. 비교가 일치 조건이 서버 keep과 같은 불변식을 만들고, NXT 선행 에코 · 8쌍 · 철거 경로 테스트가 실제로 변이를 잡는다.
- **IN-02 (cc92581d): 한 가지 상호작용을 놓쳤다.** R3-WR-01.

**테스트:** main checkout에서 `--maxWorkers=2`로 shared `lc-amount`(83), relay `fanout -t P31`(7), webapp `limit-chaser-form` · `use-lc-field-commit` · `lc-fields`(492)를 돌렸고 모두 통과했다. relay · webapp `tsc --noEmit`도 깨끗하다.

BLOCKER는 없다.

## Warnings

### R3-WR-01: IN-02 수정이 「조기 성공」을 「거짓 거부」로 바꾼다 — 어떤 같은 키 에코든 `answerSeq`를 올리는데, 새 훅 테스트는 그 채널을 모사하지 않는다

**File:** `packages/shared/src/lc-amount.ts:148-174`, `webapp/src/components/trading/lc/use-lc-field-commit.ts:892-930`, `webapp/src/components/trading/card/strategy-card.tsx:549-556`, `webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx:2074-2088`

**Issue:**
- **실제 경로:** 카드는 **같은 키의 에코가 오기만 하면** `acceptAnswer()`로 `answerSeq`를 올린다(`strategy-card.tsx:549-556`). 300ms 런타임 푸시도 같은 키 에코라 예외가 아니다(559행 주석이 그렇게 적는다).
- 훅 이펙트는 `matches`가 거짓이고 `unacked`가 아니며 `rejectSeq`가 그대로인데 `answered`가 참이면 즉시 `failInflight(inf, 'rejected')`다(`use-lc-field-commit.ts:926-927`).
- **재현 순서 (금액을 아는 서버):**
  1. 사용자가 1,001만을 확정한다(저장 금액 0 · 777주 → 777주로 내림, 보낸 주 777).
  2. 서버가 처리하기 전에 옛 상태 푸시(금액 0 · 같은 주 777)가 먼저 도착한다. 같은 키 에코이므로 `answerSeq`가 오른다.
  3. IN-02 수정 전에는 `amountEchoMatches`가 금액 0 관용으로 참이라 여기서 (조기) 성공이었다.
  4. 수정 후에는 `matches`가 거짓이다. 다음 렌더에 `answered`가 서면 **`rejected` 실패**가 되어 「반영하지 못했어요」가 뜬다.
  5. 이어서 진짜 에코(1,001)가 오면 ③ 늦은 에코가 실패를 성공으로 되돌린다. 그러나 그 사이 실패 표시가 한 번 서고, ⑦ 규칙상 **그 사이 대기열에 서 있던 확정은 하나도 보내지 않고 각 필드를 실패로 표시한다.** 늦은 에코는 첫 건만 성공으로 되돌린다.
- **테스트가 이를 모사하지 않는다:** 새 훅 테스트(2074행)는 `t.update({ server: old() })`만 호출하고 `serverAnswerSeq`는 0으로 둔다. 그래서 「옛 푸시가 와도 in-flight는 그대로」가 통과한다. 운영에서는 같은 푸시가 곧 `answerSeq`를 올려 in-flight가 실패로 닫힌다. 테스트가 고정한 불변식이 실제 배선에서는 성립하지 않는다.
- **범위:** 영향은 옛 푸시의 주가 보낸 주와 같은 확정(예: 1,000 → 1,001처럼 같은 주로 내림되는 미세 조정)으로 좁다. 주가 다른 확정은 수정 전에도 이미 주 불일치로 같은 거짓 거부를 겪는다. 다른 필드 종류는 원래 이렇게 동작해서 일관성은 있다. 다만 FIX-R2가 「`answered`를 함께 요구하지 않은 이유」로 든 ⑦(답 신호가 에코보다 한 렌더 늦다)는 정확히 이 채널이고, 그 채널이 stale push로도 오른다는 점은 따져지지 않았다.

**Fix:** 둘 중 하나를 고른다.
- (a) 모호한 모양(에코 금액 0 ∧ 주 일치 ∧ 금액을 아는 서버)에서 `answered`만으로는 거부로 닫지 않고 거부 신호와 같은 유예(`LC_REJECT_ECHO_GRACE_MS`)를 건다. 이 모양은 거부 통지와 달리 「아직 안 왔다」일 수 있다. 훅에 판정 보조를 둔다.

```ts
// shared: 모호한 옛 푸시 모양 — 주는 맞고 금액만 0(금액을 아는 서버)
export function amountEchoIsAmbiguous(server, pair, sent): boolean {
  return server[pair.qty] === sent.qty && server[pair.amount] === 0 && sent.amount !== 0 && echoKnowsAmounts(server);
}
// 훅: answered && !matches 인데 모호하면 failInflight 대신 유예 타이머만 건다(rejectGraceTimer 재사용)
```

- (b) 수정을 되돌리고 R1 IN-02를 「알려진 한계」로 수용한다. 조기 성공은 다음 진짜 에코가 어차피 같은 값을 확인하는 무해한 쪽이다.

어느 쪽이든 훅 테스트에 `serverAnswerSeq`를 한 번 올린 렌더를 넣어 운영 배선을 모사한다.

## Info

### R3-IN-01: IN-05의 폼 수준 변경(`subOf` · `hint`의 `lcBaseValues`)을 되돌려도 어떤 테스트도 깨지지 않는다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:1570-1578`, `webapp/src/components/trading/limit-chaser-form.tsx:2062-2068`

**Issue:** FIX-R2도 「렌더 테스트는 따로 두지 않았다」고 적었다. `form`과 `lcBaseValues`가 수량 칸 주에서 갈리는 상태를 만들 수 없다는 이유다. 결과적으로 이 두 줄은 회귀 고정이 0이다. shared의 `amountFromQty` 경계 테스트만 새로 생겼다. 이 변경은 값이 갈릴 때만 의미가 있는데, 그 상태를 만들 방법이 없다면 변경 자체가 효과가 없는 것(평상시 `form === lcBaseValues` 결과)이라는 뜻이기도 하다.

**Fix:** 둘 중 하나를 택한다. 값이 실제로 갈리는 입력(예: 서버 푸시 직후 `form`이 아직 이전 비교가를 든 한 렌더)을 `rerender`로 만드는 테스트를 하나 두거나, 효과를 증명할 수 없다면 이 변경을 거두고 R1 IN-05를 알려진 한계로 닫는다.

### R3-IN-02: `armBlockOf` 머리 주석의 「☐자동 끄기는 열려 있다」가 ☐줄매수도 켜진 조합에서는 거짓이다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:447-449`, `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx:4215-4226`

**Issue:** `extraBuyLive = extraBuyEnabled || extraBuyAuto`이고 `extraBuyAuto`는 `LC_GATE_FIELDS`가 아니라 `isDisarm` 면제도 받지 못한다. ☐줄매수와 ☐자동이 **둘 다** 켜진 채 구간이 깨졌으면 ☐자동 끄기는 `extraBuyEnabled`가 `extraBuyLive`를 유지해 5b에 막힌다. 열린 길은 ☐줄매수 끄기(게이트, 자동 끄기 동반)이다. 테스트 (c4b)는 ☐줄매수 OFF · ☐자동 ON만 덮어 이 조합에서는 주석이 틀렸음을 드러내지 못한다. 서버가 그 조합(☐줄매수 ON ∧ 최소 > 최대)을 저장하지 않아 현재 도달성은 낮다.

**Fix:** 주석을 「☐자동 끄기(☐줄매수가 꺼져 있을 때) · ☐줄매수 끄기 · 최소/최대 수정 · 철거」로 정확히 고친다.

### R3-IN-03: 금액을 아는 서버 판별(`echoKnowsAmounts`)이 모든 금액이 0인 에코에서는 관용을 유지한다 — 구 탭이 다룬 전략과 옛 전략이 정확히 그 모양이다

**File:** `packages/shared/src/lc-amount.ts:149-157`

**Issue:** 관용이 남는 모양은 8필드가 모두 0인 에코다. 이는 옛 서버뿐 아니라 새 서버 위의 옛 전략(Phase 31 이전에 저장됨)과 relay가 0으로 되싣게 한 구 탭 전략도 포함한다. 「저장 금액 0 · 777주에 1,001만 확정」(IN-02의 재현 예)이 나오는 곳이 바로 이런 전략이다. 따라서 수정은 이미 금액이 한 번이라도 들어간 전략에서만 효과가 있다. 설계상 인정한 한계지만, FIX-R2의 「IN-02 닫힘」 요약에는 이 잔여가 적혀 있지 않다. R3-WR-01의 판단에 따라 함께 정리한다.

**Fix:** R3-WR-01 (b)를 택하면 이 한계를 JSDoc에 「알려진 한계」로 남긴다. (a)를 택하면 해당 없다.

### R3-IN-04: 줄매수 최소 > 최대 판정이 바뀌었는데 UI-SPEC · 31-04 문서는 여전히 「금액끼리」다

**File:** `.planning/phases/31-limitchaser-amount-unit/31-UI-SPEC.md:230`, `.planning/phases/31-limitchaser-amount-unit/31-04-PLAN.md:38`

**Issue:** UI-SPEC 230행은 「판정만 금액끼리 비교(C# 동형)」라고 못박는다. 코드는 708c4772부터 제출 주끼리(C# e4a66ae2 동형)이고 금액이 최소 > 최대여도 같은 주로 내림되면 통과시킨다(테스트 (c5)). 다음 리뷰어가 UI-SPEC을 기준으로 (c5)를 결함으로 읽을 수 있다. quick 단계가 계약 문서를 닫지 않았다.

**Fix:** UI-SPEC 230행에 「Phase 32 e4a66ae2 · quick-261012-mig로 제출 주끼리로 정렬(금액 비교 폐기)」를 한 줄 덧붙이고 CONTEXT 결정 로그에도 한 줄 남긴다.

---

_Reviewed: 2026-10-12T08:19:28Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
