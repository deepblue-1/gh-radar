---
phase: 261012-mig-lc-extrabuy-minmax-parity
reviewed: 2026-10-12T07:19:56Z
depth: quick
files_reviewed: 2
files_reviewed_list:
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Quick 261012-mig: 코드 리뷰 보고서

**Reviewed:** 2026-10-12T07:19:56Z
**Depth:** quick (범위: 커밋 708c4772 diff 한정, 호출 경로는 필요한 만큼 따라감)
**Files Reviewed:** 2
**Status:** issues_found

## Summary

커밋 708c4772 를 gh-trade C# 원본(f6e176e5 WR-06 · e4a66ae2)과 한 줄씩 대조했다.

- **C# 동형성 — 맞다.** `extraBuyLive = extraBuyEnabled || extraBuyAuto` 는 C# `addBuyLive = chkAddBuyEnabled || chkAddBuyAuto` 와 같다.
  행 5 는 C# `addMaxFloored = addBuyLive && numAddBuyMaxQty.Value > 0 && addBuyMaxQtyRaw == 0` 와 같다.
  행 5b `extraBuyMinOverMax` 는 C# `addBuyLive && addBuyMaxQtyRaw != 0 && addBuyMinQtyRaw > addBuyMaxQtyRaw` 와 같다.
  `lcSubmitQtyOf` 는 shared `qtyForSubmit` 로 C# `QtyForSubmit`(에코 메모 → 서버 주, 아니면 내림)를 따른다. 5 를 5b 보다 먼저 보는 순서도
  C# 의 `addMaxFloored ? … : …` 우선순위와 같다. 문장 `extraBuyMinOverMax` 도 C# MessageBox 원문과 한 글자도 다르지 않다.
  `maxQty > 0` 을 `maxQty !== 0` 로 바꾼 것은 `narrowQty` 가 0 이상만 돌려주므로 같은 뜻이다.
- **서버 판정과 맞다.** Gateway(f6e176e5)는 `buy3_schema >= 5` 일 때만 `addBuyAuto` 를 요청으로 본다. 웹은 `extraBuyAuto` 를
  필수로 실어 relay 가 늘 schema 5 로 파생하므로 조건이 같다.
- **끄는 방향 · 철거 — 막지 않는다(대체로).** 대조 결과:
  - 게이트 OFF(`LC_GATE_FIELDS`)는 훅 `isDisarm` 이 `armBlockOf` 를 건너뛴다.
  - ☐자동 OFF 는 `extraBuyAuto` 가 게이트 필드가 아니어서 `armBlockOf` 를 지난다. 그래도 `next.extraBuyAuto=false` 라
    `extraBuyLive` 가 거짓이 되어(☐줄매수도 꺼져 있으면) 5/5b 는 서지 않는다.
  - ☐줄매수 OFF 는 `isDisarm` 으로 면제되고 `autoOff` 동반이 함께 실린다.
  - 철거(`isDeleteIntent`)는 맨 앞에서 면제된다.

  예외는 IN-01 이다.
- **사전 검증과의 순서 — 맞다.** 그룹 켜기 사전 검증의 `extraBuyMinOverMax` 는 최대 0주(내림)에서 false 라, 그 경우는 `armBlockOf` 행 5 가 받는다.
  C# 순서와 같다. 사전 검증이 금액 비교(①)를 뺀 것도 C# e4a66ae2 와 같다.
- **테스트:** 대상 파일 287건이 전부 통과했다(`vitest --maxWorkers=2`). 다만 이번 diff 가 넓힌 두 표면에 회귀 고정이 없다.
  하나는 행 5 의 ☐자동 확장, 하나는 ☐자동 OFF 탈출 경로다(WR-01 · WR-02).

BLOCKER 는 찾지 못했다.

## Warnings

### WR-01: 행 5(「줄매수 최대 0주」)의 ☐자동 확장에 테스트가 없다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:487-490`, `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx:4365`
**Issue:** 이번 커밋은 행 5 조건을 `values.extraBuyEnabled` 에서 `extraBuyLive`(줄매수 ∨ 자동)로 넓혔다. 그런데 이 행의 테스트(4365 근처
「P31 등록 차단」 블록)는 ☐줄매수가 켜진 경우만 덮는다. 새 테스트 c3 · c4 는 5b 만 본다. 따라서 `extraBuyLive` 를 실수로
`values.extraBuyEnabled` 로 되돌려도(또는 5 만 되돌려도) 스위트가 녹색으로 남는다.
최대 0주 위험은 와이어 0 = 무제한이 되는 상한 반전이다. 회귀하면 5b 보다 더 위험한 쪽이다.
**Fix:** c3/c4 와 같은 모양의 테스트를 하나 더한다.
```tsx
it('(c6) WR-06 ☐줄매수 OFF · ☐자동 켜기 · 최대 금액 > 0 이 0주로 내림 → 전송 0 · 「줄매수 최대 0주」 문장', () => {
  // 최대 1만 @12,870 = 0주 · 최소 0
  render(<LimitChaserForm {...props({ server: csharpEcho({ extraBuyOrderAmount: 50, extraBuyMinAmount: 0, extraBuyMinQty: 0,
    extraBuyMaxAmount: 1, extraBuyMaxQty: 0 }) })} />);
  click(chk('줄매수 자동'));
  expect(sentConfigs()).toHaveLength(0);
  expect(submitError()?.textContent).toBe(`${EXTRA_MAX_TEXT} (1만 → 0주)`);
});
```
(에코 메모가 0주를 그대로 싣는지 확인하고 금액/주 값을 맞출 것. 메모가 맞으면 `lcSubmitQtyOf` 가 0 을 돌려 행 5 가 선다.)

### WR-02: ☐자동만 켜진 최소 > 최대 에코에서 「☐자동 끄기」가 나간다는 탈출 경로가 고정되지 않았다

**File:** `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx:4208-4213`, `webapp/src/components/trading/lc/use-lc-field-commit.ts:650-651`, `webapp/src/components/trading/lc/use-lc-field-commit.ts:211-217`
**Issue:** c4 는 그 에코에서 무관한 칸 확정까지 막히는 것을 고정한다. 그런데 사용자가 빠져나갈 길이 열려 있다는 반대쪽은 고정하지 않았다.
`extraBuyAuto` 는 `LC_GATE_FIELDS` 에 없어 `isDisarm` 면제를 받지 못한다. 지금 이 경로가 통과하는 것은 `next.extraBuyAuto=false` 가
우연히 `extraBuyLive` 를 끄기 때문뿐이다.
나중에 5b 가 에코의 ☐자동(`server.extraBuyAuto`)을 보도록 바뀌거나 앞 행이 ☐자동을 보도록 바뀌면, 사용자는 「자동 끄기」로 이 상태를
풀지 못한다. 최소/최대 금액을 고치는 길만 남는데, 그 길도 IN-02 의 가격 0 조합에서는 막힌다. 이렇게 되면 화면이 무장을 인질로 잡는
T-16-44 위반이 조용히 생긴다.
**Fix:** c4 옆에 탈출 경로 2건을 고정한다.
```tsx
it('(c4-off) 같은 에코에서 ☐자동 끄기는 나간다 — 5b 는 끄는 방향을 막지 않는다', () => {
  render(<LimitChaserForm {...props({ server: minOverMaxEcho({ extraBuyAuto: true }) })} />);
  click(chk('줄매수 자동'));
  expect(sentConfigs()).toHaveLength(1);
  expect(lastConfig()).toMatchObject({ extraBuyAuto: false });
});
it('(c4-max0) 같은 에코에서 최대를 0(무제한)으로 확정하면 나간다', () => {
  render(<LimitChaserForm {...props({ server: minOverMaxEcho({ extraBuyAuto: true }) })} />);
  editInline('lc-extra-buy-max', '0'); // 실제 행 id 확인
  expect(sentConfigs()).toHaveLength(1);
});
```

## Info

### IN-01: ☐자동만 켜진 최소 > 최대 에코(구 gh-trade 서버)에서는 게이트가 아닌 체크의 OFF 도 막힌다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:491`, `webapp/src/components/trading/lc/use-lc-field-commit.ts:211-217,372-374`
**Issue:** `isDisarm` 은 `LC_GATE_FIELDS` 와 `sweepEnabled` 만 면제한다. 그래서 다음 체크들은 끄는 방향이어도 `armBlockOf` 를 지나고 5b 에 막힌다.
- `cancelTradeEnabled`(취소:체결 — `isDeleteIntent` 는 게이트로 보지만 `LC_GATE_FIELDS` 에는 없다)
- `buyTradeQtyEnabled` · `sellTradeQtyEnabled` · `extraBuyBurstRelease` 등

이 상태(☐줄매수 OFF · ☐자동 ON · 제출 주 최소 > 최대)는 새 서버(WR-06 배포 후)라면 Gateway 가 자동을 눕혀 에코에 남지 않는다.
남는 경우는 WR-06 이전 서버에 이미 저장된 전략뿐이다. C# 도 등록 검증이 폼 전체라 같은 체크 OFF 를 막는다(WinForms 동형).
게이트 OFF · ☐자동 OFF · 최소/최대 수정 · 철거는 모두 열려 있어 인질 상태는 아니다. 그래서 결함이 아니라 의도된 동형으로 기록한다.
**Fix:** 조치는 필요 없다. 다만 `armBlockOf` 머리 주석 447행 「켜져 있는 게이트만 본다 — 끄는 방향은 막지 않는다」 는 이제 사실과 다르다.
5/5b/6b 는 게이트가 아닌 `extraBuyAuto`/`postBuyAuto` 를 보고, 끄는 방향 면제는 훅 `isDisarm` 의 게이트 필드에 한정된다.
주석에 「게이트가 아닌 체크의 OFF 는 면제되지 않는다(C# 동형)」 한 줄을 더하면 다음 리뷰어가 같은 추적을 반복하지 않는다.

### IN-02: 매수 비교가 0 · 구서버(금액 미에코) 에코에서는 화면 「최대 0만」 인데 5b 가 「최대를 0 으로 하라」 고 말할 수 있다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:655-658`, `packages/shared/src/lc-amount.ts:132-148`
**Issue:** 이 경우 `echoAmountOf` 의 `shown` 이 `amountFromQty(qty, 0) = 0` 이 된다. 그래서 다음 순서로 막힌다.
1. 칸 금액 0 · 가격 0 이 에코와 같아 메모가 서버 주(예: 최대 500주)를 싣는다.
2. 5b 가 「최대를 0(무제한) 으로 하거나…」 로 막는다. 화면 최대는 이미 0만이다.
3. 행 1(`buyNeedsWatchPrice`)은 금액 > 0 을 요구하므로 먼저 잡지 않는다.

결과는 와이어 기준으로 맞고(서버도 같은 주를 비교한다) C# `QtyForSubmit` 도 같다. 다만 문장이 화면과 어긋나고, 최대를 0 으로
다시 확정해도 값이 같아 메모가 유지되어 풀리지 않는다. 비교가를 넣어야 풀린다. 구서버 · 가격 0 · 자동 또는 줄매수 ON 이 겹쳐야 하는
드문 조합이다.
**Fix:** 동형을 유지하는 쪽으로 둔다. 필요하면 gh-trade 인계 후보로 기록한다(C# 도 같은 문장).

### IN-03: 같은 「최소 > 최대」 판정이 경로에 따라 두 문장으로 나온다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:244,637-638`, `webapp/src/components/trading/lc/use-lc-field-commit.ts:233`
**Issue:** 두 경로가 같은 판정을 다른 어조로 말한다.

| 경로 | 문장 원천 | 문장 |
|---|---|---|
| ☐줄매수 켜기(사전 검증, 카드 줄) | `LC_COMMIT_TEXT.minOverMax`(웹 어조) | 「최소 잔량이 최대 잔량보다 커요 — … 낮춰 주세요」 |
| ☐자동 켜기 · 무관한 칸 확정(5b, 폼 맨 위 · 말풍선) | `ARM_BLOCKED_TEXT.extraBuyMinOverMax`(C# 원문) | 「줄매수의 최소 잔량이 최대 잔량보다 큽니다 — … 낮추세요」 |

사전 검증 문장은 이번 커밋 전부터 있었다. 그런데 5b 가 생기면서 한 화면에서 두 문장이 공존하게 됐다.
**Fix:** UI-SPEC 의 카드 줄 문장 계약을 유지할지 결정한다. 유지한다면 그대로 두고 두 문장 원천의 관계를 주석에 남긴다.
통일한다면 사전 검증도 `ARM_BLOCKED_TEXT.extraBuyMinOverMax` 를 쓰게 한다.

### IN-04: 기존 테스트 (c) 는 이름만 「제출 주끼리」 로 바뀌었고 판정 방식을 가르지 못한다

**File:** `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx:4144`
**Issue:** 이 테스트는 최소 2,000만 · 최대 1,500만이라 금액 비교와 주 비교가 같은 결과를 낸다. 새 의미(주끼리)를 실제로 가르는 테스트는
(c2)(금액 같음 · 주 최소 > 최대)와 (c5)(금액 최소 > 최대 · 주 같음)다. 둘 다 있으므로 결함은 아니다. 다만 (c) 의 이름이
「주끼리를 검증한다」 고 읽혀 오해를 부른다.
**Fix:** 제목을 「최소/최대 문구(금액 · 주 모두 최소 > 최대)」 처럼 사실대로 바꾼다.

---

_Reviewed: 2026-10-12T07:19:56Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
