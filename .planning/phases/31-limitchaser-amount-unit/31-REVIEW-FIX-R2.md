---
phase: 31-limitchaser-amount-unit
fixed_at: 2026-10-12T00:58:00Z
review_path: .planning/phases/31-limitchaser-amount-unit/31-REVIEW.md (+ 31-REVIEW-R2.md)
iteration: 2
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 31: Code Review Fix Report — Round 2

**Fixed at:** 2026-10-12
**Source review:** `31-REVIEW.md`(Info IN-01~IN-05)와 `31-REVIEW-R2.md`(R2-WR-01 · R2-IN-01 · R2-IN-02)
**Iteration:** 2

**Summary:**
- 범위 안 지적은 8건이다(fix_scope all). round-1의 WR-01 · WR-02는 이미 d023526f · 694d1f06으로 고쳐져 있어 범위에서 뺐다.
- 고친 것: 8건
- 건너뛴 것: 0건

**처리 순서:** 파일이 겹치는 곳에서 같은 줄을 여러 번 고치지 않도록 다음 순서로 진행했다.
- R2-WR-01(경고 1건, 먼저)
- IN-03 → IN-01 → IN-05: `lc-fields.ts` · `limit-chaser-form.tsx`
- IN-02: shared · 훅
- IN-04 → R2-IN-01 → R2-IN-02: relay

각 지적은 고치기 전에 현재 소스와 다시 대조했다.

**로직 변경이라 사람 확인이 필요한 커밋(fixed: requires human verification):**
- R2-WR-01: 칸 잠금 판정 순서
- IN-01: 사전 검증 조건 추가
- IN-02: 성공 판정 관용을 좁힘
- R2-IN-01: relay 되싣기 짝 판정

IN-03 · IN-04 · R2-IN-02는 동작이 바뀌지 않는다(리팩터 · 테스트). IN-05는 같은 렌더에서 값이 같으면 출력도 같다.

## Fixed Issues

### R2-WR-01: WR-02 수정이 행 아래 줄만 고치고 시트·인라인 잠금은 그대로 둬, 같은 값에서 행은 「777주」인데 시트는 「비교가격 필요」(확정 불가)를 보인다

**Files modified:** `webapp/src/components/trading/limit-chaser-form.tsx`, `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx`
**Commit:** d890d07f
**Applied fix:**
- `amountLockTextOf`가 먼저 제출 주 `lcSubmitQtyOf({ ...values, [amountField]: value }, amountField, server)`를 계산한다. 이 값은 에코 메모를 포함한다.
  - 제출 주가 0보다 크면 `null`을 돌려준다.
  - 제출 주가 0이고 비교가가 0이면 「비교가격 필요」를 돌려준다.
  - 제출 주가 0이고 비교가가 있으면 「{N}만 → 0주」를 돌려준다.
- 이 순서는 `lcQtyRowSubOf` · `lcAmountHintOf`와 같다. 그래서 행 · 시트 안내 · 시트/인라인 잠금이 같은 판정을 쓴다. JSDoc에는 다음 두 가지를 적었다.
  - 이 칸 잠금은 웹에만 있는 규칙이다. C#에는 칸 잠금이 없다.
  - 값을 바꾸면 메모가 깨져 잠금이 다시 선다.
- 시트 수준 테스트를 추가했다. 가격 0 · 짝 원값 에코(1,000만 · 777주)에서 다음을 확인한다.
  - 행 아래 줄은 「777주」, 시트 상태 줄은 「= 777주」이고 적용 버튼이 켜져 있다.
  - 1,500만을 넣으면 「비교가격 필요 — 매도 비교가격을 입력하세요」가 뜨고 적용 버튼이 꺼진다.
  - 1,000만으로 되돌리면 「= 777주」로 돌아오고, 적용해도 전송은 0건이다(no-op).
- 인라인 테스트도 추가했다. 같은 에코에서 1500을 넣고 Enter를 누르면 잠금 말풍선이 뜨고 전송은 0건이다. 1000으로 되돌리고 Enter를 누르면 잠금이 없다.
- 기존 테스트 「매수 칸은 『매수 …』」(`at({ buyWatchPrice: 0 })`)는 바로 이 모순(짝 에코인데 잠금)을 그대로 고정하고 있었다. 1500을 입력한 뒤 잠금을 확인하도록 고쳤다.
- 수정 전 코드에서는 새 테스트 2건이 실패하는 것을 확인했다.
- 이 수정으로 R2 리뷰가 「죽은 갈래」라고 지적한 `lcAmountHintOf`의 `price 0 ∧ qty > 0 ∧ value > 0` 갈래에 실제 시트가 도달한다. 위 시트 테스트가 그 글자를 화면에서 확인한다.

### IN-03: 제출 주 계산이 두 곳에 같은 식으로 복제돼 있다

**Files modified:** `webapp/src/components/trading/lc/lc-fields.ts`
**Commit:** fee82cf8
**Applied fix:**
- `lc-fields.ts`의 로컬 `submitQtyOf`는 이제 lib `lcSubmitQtyOf({ ...values, [field]: amount }, field, server)`를 부르기만 한다. 식은 지웠다.
- 쓰지 않게 된 shared import(`echoAmountOf`, `qtyForSubmit`)를 정리했다.
- lib `limit-chaser.ts`는 런타임에 shared와 `lc-ranges`만 import하므로 순환 import가 생기지 않는다.
- 로컬 함수 이름은 남겼다. 호출하는 두 곳(`lcQtyRowSubOf` · `lcAmountHintOf`)의 인자 순서를 유지하려는 얇은 어댑터다.

### IN-01: 줄매수 최소 > 최대 사전 검증이 금액끼리 비교해, 같은 금액이어도 제출 주는 최소 > 최대가 될 수 있다

**Files modified:** `webapp/src/components/trading/limit-chaser-form.tsx`, `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx`
**Commit:** 9292fbdb
**Applied fix:**
- **C# 원문 대조:** gh-trade `feature/limitchaser-amount-unit` 브랜치(b57a1992)의 `LimitChaserForm.cs` 5196~5210을 읽었다.
  - C#은 `numAddBuyMinQty.Value > numAddBuyMaxQty.Value`로 금액끼리 비교한다.
  - 주석은 「만원끼리 비교해도 같은 비교가격으로 환산하므로 단조라 결과가 같다 (Phase 32)」라고 적는다.
  - C#은 `addMaxFloored`(최대 0주)를 최소 > 최대보다 먼저 본다.
- **결정:** 금액 비교(C# 동형)는 그대로 두고, 제출 주 비교를 **합집합**으로 더했다. 새 함수는 `extraBuyMinOverMax`다.
  - ① 금액끼리: 최소 금액 > 최대 금액. C#과 같다.
  - ② 제출 주끼리: 최대 주가 0보다 크고 최소 주 > 최대 주.
  - ②는 금액이 같은 경우만 새로 막는다. 금액이 최소 < 최대이면 주도 최소 ≤ 최대이기 때문이다(메모 표시값은 반올림이라, 그보다 작은 금액은 늘 더 적은 주로 내림된다). 그래서 C#보다 덜 막는 경우는 없고, 서버가 줄매수를 ERROR로 눕힐 경우만 추가로 막는다.
  - 최대 주가 0인 경우는 ②에서 보지 않는다. 기존 `armBlockOf` 5번 「줄매수 최대 0주」가 먼저 막는다. C#의 addMaxFloored 우선순위와 같다.
- 제출 주를 계산하려면 에코 메모가 필요하다. 그래서 `groupPrechecksOf` / `groupPrecheckOf`에 `server` 인자를 더했고, 호출하는 세 곳이 각자의 server(`server` / `serverRef.current`)를 넘긴다.
- 테스트 (c2)를 추가했다. 최소는 구 서버 모양 에코(금액 0 · 1,000주 @12,354원)라 표시가 1,235만이다. 최대는 1,235만(999주)이다. 줄매수를 켜면 전송 0건이고 「최소 잔량이 최대 잔량보다 커요 …」가 뜬다. 수정 전 코드에서는 이 테스트가 실패하는 것을 확인했다.
- **gh-trade 인계 후보:** ②는 C#에 없는, 웹이 의도적으로 갈라지는 보강이다.
  - C# 주석의 「만원끼리 … 단조라 결과가 같다」는 에코 메모 칸에서 틀린다. 메모 칸은 내림이 아니라 서버 주를 싣는다.
  - C#도 `QtyForSubmit` 값끼리 비교를 더하는 같은 보강을 고려하도록 gh-trade에 넘기기를 제안한다.
  - 재현 수치: 최소 에코 1,000주 @12,354원(표시 1,235만), 최대 1,235만 → 999주.

### IN-05: 두 줄 행 · 시트 안내는 렌더 `form`으로, 잠금 검증은 서버 동기값으로 계산해 비행 중에 갈릴 수 있다

**Files modified:** `webapp/src/components/trading/limit-chaser-form.tsx`, `packages/shared/src/lc-amount.ts`, `packages/shared/src/__tests__/lc-amount.test.ts`
**Commit:** 0f828782
**Applied fix:**
- 인라인 편집기 `subOf`와 시트 `hint`가 이제 `lcBaseValues(server ?? null, form)`에 버퍼 값을 얹어 주를 계산한다.
  - `validateCommit` → `amountLockTextOf`와 `buildCfg`가 쓰는 기준값과 같다.
  - 그래서 편집 중 아래 줄 · 시트 안내 · 잠금 · cfg가 한 기준값으로 주를 센다.
- 편집 중이 아닌 행 표시(`displayOf`)는 바꾸지 않았다.
  - 위 줄 값을 `form`에서 읽으므로, 아래 줄도 같은 `form`으로 계산해야 한 행 안에서 맞는다.
  - 값 필드는 낙관 반영하지 않으므로(훅 ④) 평상시에는 `form`이 서버 값과 같다.
- shared `amountFromQty`는 BigInt 경로를 고르는 기준을 바꿨다. 곱(`p`)이 아니라 `p + 5000`이 안전 정수인지 본다. 경계 테스트 1건(주 1 × 가격 2^53−1)을 추가했다.
  - 참고: 곱이 안전 정수이고 `p + 5000`만 2^53을 넘는 구간 [2^53−5000, 2^53−1]을 따져 봤다.
  - 이 구간에서는 합이 짝수 쪽으로 반올림돼도 10,000 경계를 넘는 값이 없어 결과가 틀리지는 않는다.
  - 그래도 판정을 더한 값 기준으로 두면 이 증명이 필요 없으므로 같이 정리했다.
- 렌더 테스트는 따로 두지 않았다.
  - 값 필드가 낙관 반영되지 않아서, `form`과 `lcBaseValues`가 수량 칸 주에서 갈리는 상태를 테스트에서 안정적으로 만들 수 없다.
  - 두 값이 갈리는 필드는 레거시 `buyOrderAmount`뿐이고, 수량 칸 주와 무관하다.
  - 기존 시트 · 인라인 테스트(R2-WR-01 포함)는 모두 통과한다.

### IN-02: `amountEchoMatches`의 「에코 금액 0 = 성공」 관용이 새 서버에서도 열려 있어 늦게 온 푸시 에코로 조기 성공 판정이 난다

**Files modified:** `packages/shared/src/lc-amount.ts`, `packages/shared/src/__tests__/lc-amount.test.ts`, `webapp/src/components/trading/lc/use-lc-field-commit.ts`, `webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx`
**Commit:** cc92581d
**Applied fix:**
- 리뷰가 낸 두 선택지 가운데 「금액을 아는 서버」 판별을 골랐다.
  - 새 함수 `echoKnowsAmounts(server)`는 금액 8필드 중 하나라도 0보다 크면 참이다.
  - 구 gh-trade 서버는 vtable 158~172를 읽지 않으므로 8필드가 늘 0이다. 그래서 구 서버에서 관용이 꺼지는 일은 없다.
  - 8필드가 모두 0인 새 서버 에코는 구 서버와 구분할 수 없다. 이 경우는 관용을 유지한다(종전과 같음).
- 다른 선택지(성공에 `answered`를 함께 요구)는 쓰지 않았다. 훅의 설계상 답 신호 증가가 성공 에코보다 **한 렌더 늦게** 보이기 때문이다(⑦). 그 조건을 걸면 정상 성공이 한 렌더 늦어지거나, 꺼내기 장벽 규칙과 충돌한다.
- `amountEchoMatches`의 판정은 다음과 같다.
  - 주가 다르면 실패다.
  - 금액이 같으면 성공이다. 0을 보낸 확정도 여기서 성공이다.
  - 그 밖에는 `에코 금액 0 ∧ 금액을 모르는 서버`일 때만 성공이다.
- 훅 JSDoc 두 곳을 그에 맞게 고쳤다.
- shared 단위 테스트 1건을 추가했다. 다른 칸 금액이 0보다 큰 에코에서 금액 0 · 같은 주는 실패, 답 에코는 성공, 0을 보낸 확정은 성공임을 확인한다.
- 훅 테스트 1건도 추가했다. 저장 금액 0 · 777주인 칸에 1,001만(777주)을 확정한 뒤 다음을 확인한다.
  - 옛 푸시(금액 0 · 같은 주)가 와도 in-flight는 그대로이고 `sentSuccessSeq`는 0이다.
  - 답 에코(1,001)가 오면 성공한다.
- 수정 전 shared로 빌드하면 훅 테스트가 실패하는 것을 확인했다.

### IN-04: relay `envelope.ts`가 shared에 이미 있는 `LcAmountKey`를 로컬 타입으로 다시 적었다

**Files modified:** `relay/src/dma/envelope.ts`
**Commit:** 19839e14
**Applied fix:**
- 로컬 `type LcAmountKey`(8개 리터럴)를 지우고, 기존 `import type { … } from "@gh-radar/shared"` 목록에 `LcAmountKey`를 더했다.
- 지운 타입에 붙어 있던 규약 설명은 `LcSetCfg` JSDoc으로 옮겼다. 설명 내용은 금액 8필드가 선택이라는 것(구 탭 관용 · 부재 = 0)과, fanout이 먼저 짝 맞는 에코 원값으로 채운다는 것이다.
- 조립기의 `add…Amount` 8줄은 `LC_AMOUNT_PAIRS` 순회로 바꾸지 **않았다**.
  - FlatBuffers 생성 코드의 정적 setter는 필드 이름이 호출에 붙어 있어 잘못 조립하는 일을 구조적으로 막는다. 이 규율은 `frames.ts` 주석의 Pitfall 1과 같다.
  - 순회로 바꾸려면 키 → setter 대응표가 따로 있어야 하는데, 그 표가 또 하나의 사본이 된다.

### R2-IN-01: `#withEchoAmounts`의 「짝」 판정이 주만 보고 비교가를 보지 않아, 주석의 근거와 실제 동작이 다르다

**Files modified:** `relay/src/ws/fanout.ts`, `relay/tests/fanout.test.ts`
**Commit:** 17ac5c6b
**Applied fix:**
- 리뷰의 첫째 선택지를 택했다. 판정을 `echo[p.qty] === cfg[p.qty] && echo[p.price] === cfg[p.price]`로 바꿨다.
  - 짝을 만든 두 입력(주 · 그룹 비교가)이 모두 그대로일 때만 에코 원값을 되싣는다. 이것은 서버 「keep」과 같은 동작이다.
  - 둘 중 하나라도 바뀌면 0을 싣는다. 0은 인계 노트 ⓑ가 허용한 값이다.
  - 이제 주석의 불변식(「저장되는 금액은 늘 주와 짝」)을 코드가 보장한다. JSDoc도 함께 고쳤다.
- 테스트 1건을 추가했다. 구 탭이 주는 그대로 두고 매도 비교가만 12,870에서 13,000으로 바꾸면 `sellWatchAmount`는 0이 되고, 매수 쌍은 원값 300 그대로다. 수정 전 코드에서는 이 테스트가 실패하는 것을 확인했다.
- 기존 WR-01 테스트도 고쳤다.
  - 에코의 매수 비교가 기본값은 71,100이고 `lcInput` 기본값은 69,900이다. 이 두 값이 다른 상태에서 「같은 주 → 300」을 단언하고 있었다.
  - 에코와 cfg의 매수 비교가를 69,900으로 맞춰 「주 · 비교가가 모두 같은 짝」 조건을 명시했다.

### R2-IN-02: WR-01 relay 테스트가 키 격리와 철거 경로를 고정하지 않는다

**Files modified:** `relay/tests/fanout.test.ts`
**Commit:** 251cf2f0
**Applied fix:**
- 키 격리와 8쌍 테스트를 추가했다.
  - 같은 ISIN · 같은 계좌로 `exchange: "NXT"` 에코(8쌍 금액 모두 9999)를 **먼저** 민 다음 KRX 에코를 민다.
  - KRX 에코에는 8쌍에 서로 다른 금액(301~308)과 서로 다른 주를 준다.
  - 구 탭 KRX `lc.set`(금액 키 없음)이 8쌍 모두 KRX 원값을 싣는지 쌍별로 단언한다.
- 철거 경로 테스트도 추가했다. 옛 모양 cfg(`legacyCfg` · 게이트 4종 OFF · `crud: "D"` · 금액 키 없음)는 `withNeutralBuy3`를 거친다.
  - 레거시 5쌍(매도잔량 · 체결량 · 매수잔량 · 체결 · 취소)은 에코 원값으로 되실린다.
  - 중립값(주 0)이 된 줄매수 최소 · 최대와 후매수 최소 3쌍은 에코 주(10 · 20 · 30)와 짝이 아니어서 0이 된다.
- 변이 검사도 했다. 에코 찾기를 `lc.isin === cfg.isin`으로 바꾸면 키 격리 테스트가 실패한다. 확인 뒤 원래대로 되돌렸다.

## Verification

검증은 모두 **격리 worktree**(`.claude/worktrees/rf-31-23442-*`)에서 돌렸다. 정리 단계에서 그 worktree를 지우므로, 아래 수치는 main checkout에서 그대로 재현되지 않는다.
- worktree 안에서 `pnpm install --offline --frozen-lockfile`을 shared · relay · webapp 필터로 돌렸고, shared build를 한 뒤 실행했다.
- vitest는 모두 `--maxWorkers=2`로 돌렸다.
- 각 지적마다 수정 전 코드에서 새 테스트가 실패하는 것을 확인했다. 확인 방법은 stash 또는 변이다.

- shared
  - `build`와 `typecheck`를 통과했다.
  - vitest 전체 21파일 642/642가 통과했다.
- relay
  - `typecheck`와 `typecheck:tests`를 통과했다.
  - `tests/fanout.test.ts`, `tests/protocol.test.ts`, `tests/ws-autosell.test.ts`, `src/dma/__tests__/envelope.test.ts` 4파일 402/402가 통과했다.
- webapp
  - `typecheck`(tsc + e2e tsconfig)를 통과했다.
  - 다음 13파일 1018/1018이 통과했다.
    - `lc/__tests__` 전체
    - `limit-chaser-form`
    - `card-body`
    - `strategy-card-flow`
    - `lib/limit-chaser`
    - `me/limit-chaser-defaults`
- e2e · playwright와 전체 회귀는 돌리지 않았다(지시 범위 밖).

---

_Fixed: 2026-10-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
