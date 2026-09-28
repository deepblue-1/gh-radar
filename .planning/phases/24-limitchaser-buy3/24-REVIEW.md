---
phase: 24-limitchaser-buy3
reviewed: 2026-09-28T02:39:05Z
depth: standard
files_reviewed: 43
files_reviewed_list:
  - packages/shared/src/index.ts
  - packages/shared/src/relay.ts
  - relay/src/dma/__tests__/codec.test.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/msg-type.ts
  - relay/src/generated/StockDMA.fbs
  - relay/src/generated/stock-dma/set-limit-chaser.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/protocol.ts
  - relay/tests/fanout.test.ts
  - relay/tests/helpers/fake-gateway.ts
  - relay/tests/helpers/frames.ts
  - relay/tests/protocol.test.ts
  - relay/tests/ws-latch.test.ts
  - webapp/e2e/fixtures/relay.ts
  - webapp/e2e/specs/a11y.spec.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/components/trading/__tests__/card-body.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/components/trading/__tests__/strategy-log.test.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/card/card-header.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/latch-led.tsx
  - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
  - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
  - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/lc/number-pad-sheet.tsx
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/strategy-log.tsx
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/lib/__tests__/strategy-log-feed.test.tsx
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/numpad.ts
  - webapp/src/lib/strategy-log-feed.tsx
  - webapp/src/styles/globals.css
  - webapp/src/test-fixtures/limit-chaser.ts
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 24: 코드 리뷰 보고서

**Reviewed:** 2026-09-28T02:39:05Z
**Depth:** standard
**Files Reviewed:** 43
**Status:** issues_found

## Narrative Findings (AI reviewer)

## 요약

gh-trade 매수 3종 분리(선매수 · 추가매수 · 후매수)를 relay(zod · 조립기 · 파서 · fanout 구 탭 관용)와 webapp(그룹 스위치 동반 제출 · 서버 접힘 자동 마스터 OFF · 선매수 자동 체크 · 사전 검증 · 전략 로그 · 상장주식수 시딩 · 접이식 카드)에 반영한 변경을 검토했다.

relay 쪽은 견고하다. 구 탭 `lc.set`/`lc.arm buy` 는 세션 · 계좌 가드 **뒤**에서 거부 프레임 1건으로 답하고 소켓을 유지하며, 철거 프레임만 중립값으로 채워 `buy3_schema=1` 로 중계한다. 조립기의 12필드 매핑, `buy_watch_side` 미적재, 파서의 17필드 읽기, `#strategyArmable` 그룹별 갈래와 웹 `canArmOf`/`armBlockOf` 의 동형(웹이 같거나 더 엄격)을 줄 단위로 대조했다. `relay` 의 해당 테스트 3파일(226건)도 통과를 확인했다. 후매수 발동 override 값이 재제출로 cfg 에 실리는 문제는 gh-trade `Gateway.cpp:3471-3473` 이 「클라는 이 값을 되싣어 재제출하므로 흡수한다」고 명시한 설계라 결함에서 뺐다.

결함은 webapp 쪽에 모여 있다. 아래 여섯 건이 핵심이다.
- **선매수 금액 0 = 「서버가 모른다」 레거시 특례가 buy3 에코에도 그대로 걸린다.** relay 는 선매수 금액이 0 인 후매수 전용 전략을 정상으로 보는데, 웹은 새로고침 뒤 그 전략의 모든 확정을 잠근다(WR-01).
- **`buy3Schema` 판별자를 웹이 한 번도 읽지 않는다.** 구 서버 에코가 오면 화면이 실제로 매수 감시 중인 전략을 「켠 매수 없음」으로 그린다. 게다가 어떤 편집이든 `buy_watch_side` 를 조용히 지운다(WR-02).
- 대기열에서 꺼내는 선매수 자동 체크 동반값이 낡은 가격으로 사용자가 방금 확정한 매도가를 덮을 수 있다(WR-03).
- `failQueue` 가 동반 필드를 보지 않는다(WR-04).
- 거부된 serverFold 제출의 사유가 다음 에코에 잘못 귀속된다(WR-05).
- 자동 마스터 OFF 가 탭 · 표면마다 한 번씩 나간다(WR-06).

## Warnings

### WR-01: buy3 에코의 선매수 금액 0 을 「서버가 모른다」로 읽어, 후매수 전용 전략이 새로고침 뒤 편집 불가가 된다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:343-346, 735` · `webapp/src/lib/limit-chaser.ts:527` · `webapp/src/components/trading/limit-chaser-form.tsx:392-401`
**Issue:**
`amountRequired` 판정은 `server.buyOrderAmount === 0 && !amountConfirmed` 뿐이고 `buy3Schema` 를 보지 않는다. Phase 24 에서는 선매수 금액 0 이 정상값이다.
- relay `fanout.ts:1268` 은 「선매수 금액이 빈 정상 후매수 전략」이 게이트웨이에 닿아야 한다고 명시하고 선매수 OFF 면 `buyOrderQty === 0` 을 통과시킨다.
- 웹도 `lcValueTextOf` 가 선매수 금액 0 을 「—」로 표기하고, 금액 칸에 범위가 없어 0 확정을 허용한다.
- `formFromServer` 는 추가 · 후매수 금액에 대해 「새 서버는 금액을 늘 싣기 때문에 0 은 모른다가 아니라 사용자가 둔 값」(limit-chaser.ts:549-550)이라고 적으면서, 같은 서버가 싣는 `buyOrderAmount` 에는 레거시 특례를 그대로 적용한다.

결과는 이렇다. 사용자가 선매수 금액을 0 으로 확정하면 그 폼 인스턴스에서는 ⑧ 특례(`amountEchoed`)로 풀린다. 그러나 새로고침 · 재마운트 뒤에는 `amountRequired = true` 가 된다. 그러면 후매수 켜기 · 후매수 값 · 매도 · 취소 등 **끄기를 뺀 모든 확정**이 「주문금액을 먼저 입력해 주세요」로 막힌다. WinForms 가 만든 후매수 전용 전략도 똑같이 잠긴다.
**Fix:** 레거시 판정을 구 서버 에코로 좁힌다(판정 지점 두 곳을 함께 바꾼다).
```ts
// use-lc-field-commit.ts
const legacyAmountUnknown = (s: RelayLimitChaser | null) =>
  s != null && s.buy3Schema === 0 && s.buyOrderAmount === 0;
// amountUnknownNow / amountRequired 둘 다 이 함수로
// limit-chaser.ts formFromServer
buyOrderAmount: server.buy3Schema === 0 && server.buyOrderAmount === 0 ? prev.buyOrderAmount : server.buyOrderAmount,
```
선매수 사전 검증(`groupPrechecksOf`)도 금액 0 이면 추가 · 후매수와 같은 `amountRequired` 문구를 쓰게 맞춘다(IN-04 참조). CONTEXT D-03 은 「D-04a 는 선매수에 그대로 적용」이라고 적었지만, 그 결정은 buy3 서버가 금액을 늘 싣는다는 사실과 충돌하므로 재확인이 필요하다.

### WR-02: `buy3Schema` 판별자를 웹이 소비하지 않는다 — 구 서버 에코를 틀리게 그리고, 편집하면 `buy_watch_side` 를 지운다

**File:** `webapp/src/components/trading/card/card-body.tsx:131-149` · `webapp/src/lib/limit-chaser.ts:516-558` · `webapp/src/components/trading/limit-chaser-form.tsx:603-623` (relay `envelope.ts:2083-2084` 주석 「구 서버(필드 부재)는 0 — 판정은 UI 몫이다」)
**Issue:** relay 는 판별을 UI 에 넘겼는데 webapp 어디에서도 `buy3Schema` 를 읽지 않는다(`grep buy3Schema webapp/src` 는 주석 1건뿐이다). 구 서버(롤백 · 재기동 순서 역전)의 에코는 신필드가 전부 0/false 이다. 그 결과:
- `cardGroupStatusOf` 는 「매수주문 켜짐 · 켠 매수 없음 / 선매수 꺼짐」을 그린다. 그러나 구 서버는 `buyEnabled` 하나로 **실제 매수 감시 중**이다. 발주 직전 상태를 거짓으로 말하는 셈이다.
- `formFromServer` 가 추가 · 후매수 금액 4000 기본값을 0 으로 덮는다.
- 어떤 값 하나라도 확정하면 `buildCfg` 는 `buy_watch_side` 를 싣지 않는다(24-03). 구 서버는 부재를 `"0"` 으로 읽으므로 「매수잔량 기준(`"1"`)」 전략의 감시 기준이 **조용히 반대 호가로 뒤집힌다.**

e2e P24-5 (a)가 `buy3Schema: 0` 에코를 「레거시 전략」으로 두고 추가매수 금액을 보내 성공시키는데, 이는 구 서버가 받을 수 없는 흐름을 정상 경로로 굳힌다.
**Fix:** `server.buy3Schema === 0` 이면 폼을 읽기 전용으로 두고 철거(게이트 4종 OFF)만 허용한다. 카드 상태에는 「구 서버 전략 — 새로고침/서버 확인 필요」 같은 한 줄을 세운다. 판정은 lib 한 곳(`isLegacyBuySchema(server)`)에 두고 폼 · 카드 · 훅이 읽는다.

### WR-03: 대기열에 선 선매수 켜기가 낡은 자동 체크 동반값으로 사용자가 방금 확정한 매도 가격을 덮는다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:910-937` · `webapp/src/components/trading/lc/use-lc-field-commit.ts:414, 607-621`
**Issue:** `preBuyAutoChecksOf(base, upperLimit)` 는 **누른 순간**의 서버 동기값으로 동반 필드를 만든다. 예를 들어 매도 주문가격이 0 이면 `sellOrderPrice: upperLimit` 가 들어간다. 앞 확정이 in-flight 라 이 확정이 `queued` 가 되면, `drain → sendNow` 는 `{ ...최신 base, ...p.companions, ... }` 로 합친다. 다음 순서가 그대로 재현된다.
1. 매도 주문가격 12,000 확정(in-flight)
2. 곧바로 선매수 켜기 → 동반 `sellOrderPrice = 상한가` 로 대기
3. 12,000 에코 도착 → 대기 건이 나간다

결과적으로 사용자가 방금 확정한 12,000 이 상한가로 덮인다. 자동 체크 플래그도 같은 방식으로 낡는다. 매도 매수잔량을 0 으로 막 바꿨는데 `sellEnabled: true` 가 실리면 relay sell 갈래가 **프레임 전체**를 거부하고, 선매수 켜기까지 함께 실패한다.
**Fix:** 동반 필드를 값이 아니라 **꺼낼 때 계산하는 함수**로 넘긴다(`companions: (base) => Partial<…>`). 또는 선매수 켜기가 `busy` 면 가격 채움 동반을 빼고, 꺼낼 때 `preBuyAutoChecksOf(최신 base)` 를 다시 부른다. 로그 줄(`pendingAutoCheckRef`)도 그 재계산 결과로 만든다.

### WR-04: `failQueue` 가 동반 필드를 무시해, 마스터 동반 끔을 싣지 못한 채 「성공」으로 처리한다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:492-503`
**Issue:** `drain` 과 즉시 경로는 `sameAsServer(server, field, value, companions)` 로 「주 필드와 **모든** 동반 필드가 같을 때만 no-op」(⑪)을 지킨다. `failQueue` 만 `server[q.field] === q.value` 로 주 필드만 본다. 예를 들어 대기 중인 「선매수 끔 + `buyEnabled:false` 동반(D-02 전반)」이 있다고 하자. 앞 건이 실패했고 서버의 선매수가 이미 false(발주로 접힘)라면, 동반 마스터 OFF 는 보내지 않은 채 `markSuccess` 된다. 되돌림도 하지 않으므로 폼은 낙관 표시된 마스터 OFF 를 계속 보여 준다. 서버에서는 마스터가 ON 이다.
**Fix:**
```ts
if (server != null && sameAsServer(server, q.field, q.value, q.companions)) {
  markSuccess(q.field);
  continue;
}
```

### WR-05: 거부 · 무응답으로 끝난 제출의 `sent`/`sentCause` 가 다음 에코에 귀속된다 — 「서버가 매수 그룹 해제」 등 Phase 24 문장이 엉뚱한 사건에 붙는다

**File:** `webapp/src/components/trading/card/strategy-card.tsx:366-372, 480-501, 555-594`
**Issue:** `pendingRef`/`pendingCauseRef` 는 에코를 소비할 때와 키 변경 · 삭제 때만 비워진다. 거부 통지(`isLimitChaserSetRejection → acceptAnswer`)와 3초 무응답은 비우지 않는다. 그래서 serverFold 자동 끔(또는 D-02 전반 마스터 동반 끔)이 거부되면 `sent.buyEnabled === false` · `sentCause === 'serverFold'` 가 남는다. 그 상태에서 다음 비런타임 에코가 오면 원인과 무관하게 「서버가 매수 그룹 해제 — …」 / 「선매수 해제 — 매수주문도 끔」으로 기록된다. 그 에코는 다른 단말의 마스터 OFF 일 수도 있고, 15:40 KRX 해제일 수도 있다.

15:40 · 전부 정지 원인(`cause`)을 계산해 놓고도 `strategyLogLine` 에 `sent` 를 그대로 넘긴다(501). 옛 `hadOrder` 는 `cause !== null` 이면 제출 귀속을 끊었는데, 그 규율이 사라졌다. 파일 상단 「클라가 지어낸 사유를 쓰지 않는다」 규율 위반이다.
**Fix:**
```ts
const attributed = cause !== null ? null : sent;
const line = strategyLogLine(prev, server, {
  sent: attributed,
  sentCause: attributed === null ? null : sentCause,
});
```
거부로 판정된 순간(`isLimitChaserSetRejection` 분기)과 무응답 타이머 만료 때도 `pendingRef`/`pendingCauseRef` 를 함께 비운다.

### WR-06: D-02 후반 자동 마스터 OFF 가 폼 인스턴스마다 나간다 — 여러 탭 · 기기에서는 낡은 cfg 전체가 사람의 동시 편집을 되돌릴 수 있다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:989-1034`
**Issue:** 「정확히 1건」 보장은 **폼 인스턴스 안**에서만 성립한다. 같은 사용자의 모든 소켓이 같은 접힘 에코를 받으므로, 열린 탭 · 앱 · 작업대 카드 N개가 각자 setTimeout 0 뒤에 `lc.set` 을 하나씩 보낸다(전체 N건). 각 제출은 그 인스턴스가 본 에코 기준의 **cfg 전체**다. 그래서 그 사이 다른 탭에서 사람이 확정한 값(예: 매도 매수잔량)이 서버에 먼저 닿으면, 뒤따르는 자동 제출이 그 값을 조용히 되돌린다. CONTEXT D-02 는 「WinForms + 웹 둘 다 보내되 둘째는 무해」만 수용했다. 웹 다중 인스턴스 사이의 값 경합은 다루지 않았다. D-34 서버에서는 닿지 않는 백스톱이라 발생 빈도는 낮지만, 사람 손이 아닌 자동 제출이 사람의 편집을 덮을 수 있는 경로다.
**Fix:** 자동 제출은 `buyEnabled:false` 가 실제로 바꾸는 필드만 의미가 있다. 따라서 ② 재확인 뒤, 보낼 cfg 가 **최신 에코와 `buyEnabled` 외에 다른 값이 있으면** 보내지 않는다. 또는 relay 에 탭 간 중복 억제(같은 키 · 같은 cfg 해시 · 짧은 창)를 둔다. 최소한 「보이는 카드 1개만」(예: `document.visibilityState === 'visible'` ∧ 포커스 카드)으로 제한하는 것을 검토한다.

## Info

### IN-01: 파일 머리 · 주석의 필드 수와 목록이 Phase 24 이전 값으로 남아 있다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:56-62, 596` · `webapp/src/lib/limit-chaser.ts:23-25, 36, 45` · `webapp/src/components/trading/lc/use-lc-field-commit.ts:8, 31`
**Issue:** 「클라 입력 29 + 고정 3 = 32」, 「33필드」, 「S→C 전용 4필드」, 「폼이 편집하는 값 24종」, 「그룹 스위치 4개」가 남아 있다. 실제 값은 입력 43필드 · S→C 10필드 · 등록 필드 6개다. 이 파일들은 「정본은 한 곳」을 반복해서 강조하므로, 낡은 숫자는 다음 수정자를 오도한다.
**Fix:** 숫자를 지우고 `LIMIT_CHASER_SERVER_ONLY_FIELDS` · `LC_GATE_FIELDS` 를 가리키는 문장으로 바꾼다.

### IN-02: `dirtyFieldsOf`/`DIRTY_COMPARED_FIELDS` 는 제품 코드에서 쓰이지 않는데 Phase 24 에서 확장됐고, 자기 규칙과도 모순된다

**File:** `webapp/src/lib/limit-chaser.ts:149-214`
**Issue:** 제품 소비처가 없는 죽은 코드다(테스트만 참조한다). 그런데 그룹 스위치 3종(`preBuyEnabled` 등)을 비교 대상에 넣었다. 이는 같은 파일 ②의 「스위치는 더티가 아니다」와 모순된다.
**Fix:** 삭제하거나, 남긴다면 그룹 게이트 3종을 빼고 「미사용 · 테스트 전용」이라고 명시한다.

### IN-03: 선매수 사전 검증이 한방가격 0 을 보지 않아, 막힘 사유가 카드 줄이 아니라 폼 맨 위에 뜬다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:343-345, 392-410`
**Issue:** 한방 체크 ON ∧ 한방가격 0 인 상태에서 선매수를 켜면 `groupPrechecksOf` 는 통과한다. 그 뒤 훅의 `armBlockOf` 가 막고 `lc-submit-error`(폼 맨 위)에 「선매수 한방 · …」을 띄운다. UI-SPEC §7 의 「누른 카드 한 자리」 규약과 어긋난다.
**Fix:** `groupPrechecksOf('preBuyEnabled')` 에 `values.sweepEnabled && values.sweepWatchPrice === 0` 검증을 더한다(문구는 `ARM_BLOCKED_TEXT.sweepPrice`).

### IN-04: 선매수 금액 0(비레거시)의 사전 검증 문구가 사실과 다르다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:394-401`
**Issue:** 선매수 금액이 0 이면 수량 검증으로 떨어져 「금액이 주문가격보다 작아 주문수량이 0주예요」가 뜬다. 금액이 비어 있는 것이지 작은 것이 아니다. 추가 · 후매수는 같은 상황에서 「주문금액을 먼저 입력해 주세요」를 쓴다.
**Fix:** 선매수도 `values.buyOrderAmount === 0` 이면 `LC_COMMIT_TEXT.amountRequired` 를 쓴다(WR-01 과 함께).

### IN-05: 토글 확정의 동반 필드로 값 필드(매도 가격)가 낙관 반영된다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:394-403` · `webapp/src/components/trading/limit-chaser-form.tsx:933-937`
**Issue:** 훅 ④ 「값 필드는 낙관 반영하지 않는다」에 예외가 생겼다. 선매수 자동 체크가 `sellOrderPrice`/`sellWatchPrice` 를 동반으로 실으면 `showToggle` 이 그 값을 에코 전에 폼에 넣는다. 거부 시 되돌림은 되지만, 「보인 값 = 서버에 선 값」 불변식이 깨진다.
**Fix:** `showToggle` 에서 동반 필드 중 `LcNumField` 는 빼고 적용하거나, 이 예외를 ④에 명시한다.

### IN-06: 마스터 OFF 뒤 첫 제출이 그룹 cfg 를 조용히 지운다(gh-trade D-32 에코 접힘과의 상호작용)

**File:** `webapp/src/lib/limit-chaser.ts:545-556` · `webapp/src/components/trading/lc/use-lc-field-commit.ts:413`
**Issue:** 마스터 OFF 이면 서버가 세 그룹 에코를 OFF 로 접는다(D-32). 폼은 이를 설정값으로 받아들인다. 그래서 마스터를 끈 뒤 **무관한 값 하나**만 확정해도, 또는 마스터 스위치로 다시 켜도, cfg 의 그룹 체크가 전부 false 로 덮인다. 결과는 「켜짐 · 켠 매수 없음」이다. WinForms 도 같은 동작이라면 동형이지만, 사용자에게는 「일시정지 → 재개」가 그룹 선택을 잃는 동작으로 보인다.
**Fix:** 의도라면 UI-SPEC/CONTEXT 에 명시한다. 아니라면 gh-trade 와 에코의 그룹 원값(접지 않은 cfg) 노출 여부를 협의한다.

### IN-07: e2e 부정 단언이 고정 대기(`waitForTimeout` 500/1500ms)에 의존한다

**File:** `webapp/e2e/specs/trading-workbench.spec.ts` (P24-3 · P24-4 · P24-5 · P24-6)
**Issue:** 「추가 전송 0건」을 고정 창으로 단언한다. CI 가 느리면 자동 제출이 창 밖에서 나가 거짓 통과할 수 있다. 창이 1.5초라 대체로 충분하지만, 타이밍 기반이다.
**Fix:** 가능한 곳은 「다음 관측 가능한 사건(예: 로그 줄 · 에코 반영) 뒤 개수 불변」으로 바꾼다. 그 사건 직후 재확인하는 식으로 창을 사건에 묶는다.

---

_Reviewed: 2026-09-28T02:39:05Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
