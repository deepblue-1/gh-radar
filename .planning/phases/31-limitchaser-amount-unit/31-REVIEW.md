---
phase: 31-limitchaser-amount-unit
reviewed: 2026-10-11T23:16:04Z
depth: standard
files_reviewed: 47
files_reviewed_list:
  - docs/inbox/from-gh-trade/261011-amount-eok-and-limit-evprice.md
  - docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md
  - packages/shared/src/__fixtures__/strategy-day.ts
  - packages/shared/src/__tests__/lc-amount.test.ts
  - packages/shared/src/__tests__/strategy-event-text.test.ts
  - packages/shared/src/index.ts
  - packages/shared/src/lc-amount.ts
  - packages/shared/src/relay.ts
  - packages/shared/src/strategy-event-text.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/src/dma/envelope.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/protocol.ts
  - relay/tests/fanout.test.ts
  - relay/tests/helpers/fake-gateway.ts
  - relay/tests/helpers/frames.ts
  - relay/tests/protocol.test.ts
  - relay/tests/ws-autosell.test.ts
  - webapp/e2e/specs/a11y.spec.ts
  - webapp/e2e/specs/me.spec.ts
  - webapp/e2e/specs/order-log.spec.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx
  - webapp/src/components/me/limit-chaser-defaults.tsx
  - webapp/src/components/trading/__tests__/card-body.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/components/trading/lc/__tests__/inline-value-editor.test.tsx
  - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
  - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
  - webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx
  - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
  - webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  - webapp/src/components/trading/lc/inline-value-editor.tsx
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/lc/number-pad-sheet.tsx
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/lib/__tests__/numpad.test.ts
  - webapp/src/lib/lc-ranges.ts
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/numpad.ts
  - webapp/src/test-fixtures/limit-chaser.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-10-11T23:16:04Z
**Depth:** standard
**Files Reviewed:** 47
**Status:** issues_found

## Summary

Phase 31(상따 수량 임계 8칸 만원 입력 · 84 후매수 최소 금액 · 주문로그 ⑦ 금액 표기)의 shared 환산 한 벌(`lc-amount.ts`), relay 파서·조립기·zod·fanout, webapp 폼·커밋 훅·두 줄 행·시트·`/me` 섹션을 `56f641b6..HEAD` 범위에서 읽었다. 같은 범위의 phase-30 병합분(admin IP/MAC)은 제외했다.

환산 규칙은 gh-trade `LimitChaserForm.cs` feature 브랜치(b0d7f763) 원문 5691~5800 · 5150~5300 · 6235~6380과 한 줄씩 대조했다. 제출 내림 · 표시 반올림 · `AmountOrDerive` 짝 판정 · 추적 ON 기준선 메모 · 등록 차단 순서와 문장은 C#과 같다. 추적 ON 일 때 기준선을 메모 주로 쓰는 것도 확인했다. 서버 `LimitChaser.cpp:2047`이 `UpdateConfig` 때 기준선을 `cfg.sellWatchQty`로 심으므로 기준선 0으로 매도가 눕는 경로는 없다.

단위 테스트는 `--maxWorkers=2`로 일부를 실측했고 모두 통과했다. 실행한 범위는 shared `lc-amount`·`strategy-event-text`(226), webapp `limit-chaser`·`lc-fields`·`use-lc-field-commit`·`numpad`(427), relay `envelope`·`protocol`·`ws-autosell`(304)다.

BLOCKER는 없다. 경고 2건은 다음과 같다.
- relay가 구 탭 `lc.set`의 금액 8필드를 0으로 지어 보내 서버의 C# 원값을 지운다. 같은 상황에서 `user.settings.set`은 84 캐시로 되싣는다. 두 경로의 정책이 어긋난다.
- 두 줄 행 아래 줄과 시트 환산 안내는 비교가 0 갈래에서 에코 메모를 보지 않는다. 그래서 「화면 · 무장 · cfg 가 같은 주」 불변식이 깨진다.

## Warnings

### WR-01: 구 탭 `lc.set`(금액 8필드 부재)을 relay가 금액 0으로 조립해 서버에 저장된 C# 만원 원값을 지운다

**File:** `relay/src/ws/fanout.ts:1981-2030`, `relay/src/dma/envelope.ts:1716-1724`, `relay/src/ws/protocol.ts:255-264`

**Issue:**
- **현재 동작:** zod는 금액 8필드를 `.optional()`로 받는다. 조립기는 `cfg.buyWatchAmount ?? 0`처럼 부재를 0으로 싣는다. 그래서 relay 배포 뒤에도 열려 있는 phase-30 이하 webapp 탭이 아무 칸이나 확정하면 SetLimitChaser가 금액 8개를 모두 0으로 싣는다. gh-trade 인계 노트대로 서버는 「0 이 오면 0 을 저장한다(keep 아님)」. 그 결과 C# 상따창에서 사람이 넣은 만원 원값이 지워지고, C# 칸은 역산값으로 떨어진다.
- **user.settings.set과의 어긋남:** 같은 phase에서 같은 위험(42 전체 교체로 C# 「최소 [ ]만」 원값 소실, Pitfall 3)에 대해 `user.settings.set`은 relay가 84 캐시로 되싣는다(`fanout.ts:2115`). 정책 근거가 같은데 `lc.set`만 0을 지어낸다.
- **수정 가능성:** 인계 노트 ⓑ가 「0 을 지어내면 C# 단말 칸이 … 역산 표시로 떨어진다」고 명시한 바로 그 경로다. relay는 `hub.getLimitChasers(userId)`로 그 키의 최신 에코를 이미 들고 있다.
- **영향:** 서버 비교 주는 바뀌지 않아 발주는 깨지지 않는다. 그러나 사용자 입력값이 소실되는 데이터 손실이다.

**Fix:** `lc.set` 분기에서 금액 키가 없는 쌍만 캐시 에코로 채운다. 짝이 맞을 때(보낼 주 == 에코 주)만 원값을 쓰고, 아니면 0을 둔다. 0은 인계 노트가 허용한 값이다.

```ts
// fanout.ts lc.set — buy3CfgOf 뒤 · buildSetLimitChaserReq 앞
const echo = this.#hub.getLimitChasers(userId).find(
  (s) => s.isin === cfg.isin && s.accountNo === cfg.accountNo && s.exchange === cfg.exchange,
);
const filled: Partial<Record<LcAmountKey, number>> = {};
for (const p of LC_AMOUNT_PAIRS) {
  if (cfg[p.amount] !== undefined) continue;               // 새 탭은 그대로
  filled[p.amount] = echo !== undefined && echo[p.qty] === cfg[p.qty] ? echo[p.amount] : 0;
}
cfg = { ...cfg, ...filled };
```

relay 테스트 하나도 함께 둔다. 「구 탭 cfg(금액 없음) + 캐시 에코 금액 300 · 같은 주 → 158~172에 300」을 확인한다.

### WR-02: 두 줄 행 아래 줄 · 시트 환산 안내가 비교가 0 갈래에서 에코 메모를 무시한다 — 제출 주와 다른 글자를 보인다

**File:** `webapp/src/components/trading/lc/lc-fields.ts:727`, `webapp/src/components/trading/lc/lc-fields.ts:743`

**Issue:** 이 phase의 핵심 불변식은 「화면에 보이는 주 · 무장 판정의 주 · cfg 에 실리는 주는 모두 `qtyForSubmit` 한 함수」다(`lc-amount.ts:9` · `lc-fields.ts` 주석 「주는 행 아래 줄과 같은 `qtyForSubmit` 값」). 그런데 비교가 0 갈래 두 곳이 `qtyForSubmit`을 부르기 전에 단락한다.

- **`lcQtyRowSubOf`(727행):** 금액 > 0 ∧ 비교가 0이면 무조건 「비교가격 필요」(alert)를 보인다.
  - 짝 원값 에코(가격 0 → `amountOrDerive`가 원값 반환)에서도 이 문구가 나오는데, 이때 `buildCfg`는 에코 주 Q를 그대로 싣는다.
  - C# `SetQtyAmountTip`(LimitChaserForm.cs 5785~5800)은 「가격 0 에코의 서버 주를 보존 중이면 「N주」」로 갈라 둔다. 웹만 이 갈래가 없다.
- **`lcAmountHintOf`(743행):** 비교가 0 ∧ 값 0이면 「= 0주」(또는 의미어)를 보인다.
  - 구 서버 에코(금액 0 · 주 Q · 가격 0)에서는 `echoAmountOf().shown === 0`이라 `qtyForSubmit(0, 0, echo)`가 Q를 돌려준다. 같은 칸의 행 아래 줄은 「Q주」를 보인다.
  - 그래서 행은 「Q주」인데 시트는 「= 0주」라고 말한다. 시트를 그대로 확정하면 `serverHolds`가 noop으로 접어 서버 주 Q가 남는다. 사용자가 0주로 바꿨다고 믿게 된다.

**Fix:** 두 갈래 모두 먼저 제출 주를 계산하고, 그 주가 0일 때만 비교가 0 문구를 쓴다. C# 동형이다.

```ts
export function lcQtyRowSubOf(field, values, server): LcRowSub {
  const amount = values[field];
  const qty = submitQtyOf(field, amount, values, server);
  if (amount > 0 && values[amountPairOf(field).price] === 0 && qty === 0) {
    return { text: '비교가격 필요', tone: 'alert' };
  }
  return { text: qtyWordOf(field, qty), tone: 'muted' };
}

export function lcAmountHintOf(field, value, values, server): string | null {
  const price = values[amountPairOf(field).price];
  const qty = submitQtyOf(field, value, values, server);
  if (price === 0) return qty > 0 || value === 0 ? `= ${qtyWordOf(field, qty)}` : null;
  return `= ${qtyWordOf(field, qty)} (비교가격 ${fmt(price, '원')})`;
}
```

## Info

### IN-01: 줄매수 최소 > 최대 사전 검증이 금액끼리 비교해, 같은 금액이어도 제출 주는 최소 > 최대가 될 수 있다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:625`

**Issue:**
- **현재 검사:** 주석은 「같은 매수 비교가로 내림 환산하므로 금액 순서 = 주 순서」라고 하지만, 에코 메모 칸은 내림 환산이 아니라 서버 주를 싣는다.
- **재현 예:** 최소 에코 주 1,000 · 비교가 12,354원이면 표시 금액은 `round(1,235.4)` = 1,235만이다. 사용자가 최대에 같은 1,235만을 넣으면 `floor(12,350,000 ÷ 12,354)` = 999주가 된다. 금액은 같아 사전 검증을 지나지만, 제출 주는 최소 1,000 > 최대 999다. 서버가 줄매수를 ERROR로 눕힌다.
- **C# 비교:** C#(5196~5198)도 Value끼리 비교하므로 동형이다. 다만 웹은 제출 주를 이미 알고 있다.

**Fix:** `lcSubmitQtyOf(values, 'extraBuyMinAmount', server) > lcSubmitQtyOf(values, 'extraBuyMaxAmount', server)`로 주끼리 비교한다. C# 동형을 유지하려면 gh-trade에 같은 보강을 인계한다.

### IN-02: `amountEchoMatches`의 「에코 금액 0 = 성공」 관용이 새 서버에서도 열려 있어 늦게 온 푸시 에코로 조기 성공 판정이 난다

**File:** `packages/shared/src/lc-amount.ts:160`, `webapp/src/components/trading/lc/use-lc-field-commit.ts:891`

**Issue:** 구 gh-trade 서버를 위한 관용(`server[pair.amount] === 0`)이 새 서버에도 적용된다.
- **재현 예:** 저장 금액이 0이던 칸(구 relay 재제출 뒤 등)에서 사용자가 같은 주로 내림되는 다른 금액을 넣으면, 답 에코보다 먼저 도착한 300ms 푸시(금액 0 · 같은 주)가 in-flight 성공으로 확정된다.
- **영향:** 실해는 낮다. 서버는 금액을 거부하지 않고 뒤따르는 답 에코가 값을 맞춘다. 다만 「보낸 성공 신호」(`sentSuccessSeq`)가 실제 답이 아닌 프레임에서 오른다.

**Fix:** 에코 `buy3Schema`나 금액 8필드가 하나라도 0이 아닌 에코를 「금액을 아는 서버」로 보고 관용을 끈다. 또는 성공 판정에 `answered`(seq 변화)를 함께 요구한다.

### IN-03: 제출 주 계산이 두 곳에 같은 식으로 복제돼 있다

**File:** `webapp/src/components/trading/lc/lc-fields.ts:699-707`, `webapp/src/lib/limit-chaser.ts:144-153`

**Issue:** `lc-fields.ts`의 `submitQtyOf`와 lib의 `lcSubmitQtyOf`가 같은 `qtyForSubmit(amount, values[pair.price], server ? echoAmountOf(server, pair) : null)` 식이다. 「한 함수」 불변식을 두 사본이 지키고 있다. components → lib 방향 import는 계층 규칙(IN-05)에 걸리지 않는다.

**Fix:** `lc-fields.ts`에서 lib `lcSubmitQtyOf({ ...values, [field]: amount }, field, server)`를 부르고 로컬 `submitQtyOf`를 지운다.

### IN-04: relay `envelope.ts`가 shared에 이미 있는 `LcAmountKey`를 로컬 타입으로 다시 적었다

**File:** `relay/src/dma/envelope.ts:1438-1446`

**Issue:** shared `lc-amount.ts`가 `LcAmountKey`를 export하는데, relay가 같은 8개 리터럴을 다시 나열한다. 필드가 합류하거나 이름이 바뀌면 두 곳이 갈라진다.

**Fix:** `import type { LcAmountKey } from "@gh-radar/shared";`로 바꾸고 로컬 선언을 지운다. 조립기의 8줄 `add…Amount`도 `LC_AMOUNT_PAIRS`로 순회할 수 있다면 같은 이유로 고려한다.

### IN-05: 두 줄 행 · 시트 안내는 렌더 `form`으로, 잠금 검증은 서버 동기값으로 계산해 비행 중에 갈릴 수 있다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:1544-1546`, `webapp/src/components/trading/limit-chaser-form.tsx:2028-2030`, `webapp/src/components/trading/limit-chaser-form.tsx:1586-1592`

**Issue:** `subOf` · `hint`는 `{ ...form, [field]: v }`로 주를 계산한다. 반면 `validateCommit` → `amountLockTextOf` · `armBlockOf`와 실제 cfg(`buildCfg`)는 `lcBaseValues(server, formRef.current)`(= `formFromServer`)로 계산한다. 비교가 칸 확정이 비행 중이거나 낙관 토글이 걸린 동안에는 둘이 다른 비교가를 볼 수 있다. 그러면 시트는 「= 777주」인데 잠금은 「→ 0주」처럼 서로 다른 말을 한다.

**Fix:** 아래 줄 · 안내도 `lcBaseValues(server ?? null, form)`로 기준값을 만들어 부른다. `amountFromQty`의 안전 정수 경계(`p ≤ 2^53`이어도 `p + 5000`이 2^53을 넘으면 반올림 오차 가능 · `lc-amount.ts:44`)도 같이 정리하려면 `Number.isSafeInteger(p + 5_000)`로 판정한다.

---

_Reviewed: 2026-10-11T23:16:04Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
