---
phase: 20-toss-order-ticket
reviewed: 2026-09-25T06:26:07Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - packages/shared/src/index.ts
  - packages/shared/src/krxTick.test.ts
  - packages/shared/src/krxTick.ts
  - packages/shared/src/limitUp.ts
  - webapp/e2e/overflow.ts
  - webapp/e2e/specs/a11y.spec.ts
  - webapp/e2e/specs/orderbook.spec.ts
  - webapp/e2e/specs/sidebar-tree.spec.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/components/orderbook/__tests__/order-panel.test.tsx
  - webapp/src/components/orderbook/order-panel.tsx
  - webapp/src/components/trading/__tests__/card-body.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/card/manual-order-form.tsx
  - webapp/src/components/trading/lc/__tests__/inline-navigation.test.tsx
  - webapp/src/components/trading/lc/__tests__/inline-value-editor.test.tsx
  - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
  - webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx
  - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  - webapp/src/components/trading/lc/inline-value-editor.tsx
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/lc/number-pad-sheet.tsx
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/lib/__tests__/match-media.ts
  - webapp/src/lib/__tests__/numpad.test.ts
  - webapp/src/lib/__tests__/use-edit-mode.test.ts
  - webapp/src/lib/numpad.ts
  - webapp/src/lib/use-edit-mode.ts
  - webapp/src/styles/__tests__/tds-tokens.test.ts
  - webapp/src/styles/globals.css
findings:
  critical: 3
  warning: 7
  info: 3
  total: 13
status: issues_found
---

# Phase 20: 코드 리뷰 보고서

**Reviewed:** 2026-09-25T06:26:07Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

필드 확정 상태 기계(`use-lc-field-commit.ts`), 키패드 규칙(`numpad.ts`), 호가 단위 헬퍼(`krxTick.ts`), 상따 폼·인라인 편집기·키패드 시트, 수동주문 폼 배선을 읽었다. 필요한 곳에서는 호출 상대(`strategy-card.tsx`의 `acceptAnswer`/`handleSent`, `lib/limit-chaser.ts`의 `formFromServer`, relay의 `protocol.ts`/`fanout.ts`)까지 따라가 확인했다.

**그대로 유지된 것(확인함):**
- `krxTickSize`는 옛 `TICK_TABLE`/`tickFromTable`, `limitUpPrice` 인라인 구간과 모든 유한 입력에서 같은 값을 낸다(0 이하·NaN·Infinity는 1).
- 수동주문 전송 경로(`handleAction` → 스냅샷 → `OrderConfirmDialog` → `handleConfirmed` → `sendOrder`)는 입력 표면만 바뀌었다. 요청 조립, 재대조, 잠금은 그대로다.
- 끄는 방향 게이트는 판정하지 않는다(T-16-44).
- 철거 면제, 재전송 없음(T-16-10)도 코드에서 지켜진다.

**문제:** 가장 심각한 것은 두 가지다.
1. 키패드와 인라인 편집이 relay 스키마 범위 밖의 값을 허용한다(비율 0 또는 91 이상, 칩 `100`, 호가변경 256 이상). relay는 스키마 위반 시 **WebSocket 연결을 통째로 끊는다.**
2. 3초 무응답 타임아웃이 직렬화 슬롯을 풀어 버린다. 그래서 낡은 서버 기준값으로 만든 다음 전송이 늦게 도착한 앞 전송(무장 해제 포함)을 조용히 되돌린다.

이 밖에도 `buyOrderAmount` 특례는 거부를 성공으로 읽는다. 이는 훅의 불변식 ③을 스스로 어긴 것이고, 테스트가 그 동작을 고정해 두었다.

## Critical Issues

### CR-01: 비율·호가변경 값에 범위 검증이 없다 — 범위 밖 값 1회 확정이 relay WebSocket 연결 전체를 끊는다

**File:** `webapp/src/lib/numpad.ts:70,166-186` · `webapp/src/components/trading/lc/inline-value-editor.tsx:27,104-112` · `webapp/src/components/trading/lc/lc-fields.ts:131,145,161` (relay 근거: `relay/src/ws/protocol.ts:161,168,171`, `relay/src/ws/fanout.ts:545-548,1460-1464`)

**Issue:**
relay `lc.set` 스키마의 범위는 다음과 같다.
- `sellOrderRatio`: `int().min(1).max(100)`
- `sellQtyTrackRatio`: `int().min(1).max(90)`
- `sweepMinTickCount`: `UByteSchema`(0~255)

`parseInbound`가 스키마 위반을 만나면 `#reject(conn, "bad message")`가 **`conn.ws.close(BAD_MESSAGE)`로 소켓을 닫는다.** 그런데 클라이언트는 이 범위를 어디서도 검사하지 않는다.
- `padIssue`는 `'%'`, `'건'` 단위에서 항상 `null`을 돌려준다. `canConfirmPad`는 명시적 `0`을 허용하고 9자리까지 받는다.
- `PAD_CHIPS['%']`에 `set(100)`이 있다. 이 칩이 `sellQtyTrackRatio`(최대 90) 시트에도 그대로 뜬다. 칩 한 번과 「잔량추적 적용」 한 번이면 소켓이 끊긴다.
- 인라인 편집기는 「빈 값 저장 = 0」이다. 매도비율이나 잔량추적 칸을 지우고 Enter를 누르면 `0`이 나가고 소켓이 끊긴다.
- `buildCfg`는 체크 on/off와 관계없이 32필드 전체를 싣는다. 그래서 잔량추적이 꺼져 있어도 비율 값이 전송 대상이다.

연결이 끊기면 영향이 이 필드에서 끝나지 않는다.
- 모든 카드의 시세·호가·에코가 재접속 전까지 멈춘다.
- 같은 소켓에서 진행 중이던 **수동주문은 결과를 모르게 되어 `result-unknown` 잠금**에 걸린다.
- 다른 카드에서 진행 중이던 확정들은 타임아웃 실패가 된다.

옛 폼에도 범위 검증은 없었다. 그러나 이번 phase가 `100` 칩과 「빈 값 = 0 즉시 전송」을 새로 들여와 한 번의 탭이나 Enter로 터지는 경로가 되었다.

**Fix:** 필드별 범위를 `lc-fields.ts` 스펙에 두고, `padIssue`/`validate`가 그 범위로 확인을 잠그게 한다. 칩은 범위를 넘으면 비활성화한다.
```ts
// lc-fields.ts — 행 스펙에 범위 추가(relay protocol.ts 와 같은 값)
{ kind: 'value', field: 'sellOrderRatio', ..., unit: '%', min: 1, max: 100 },
{ kind: 'checkValue', field: 'sellQtyTrackRatio', ..., unit: '%', min: 1, max: 90 },
{ kind: 'value', field: 'sweepMinTickCount', ..., unit: '건', min: 0, max: 255 },

// numpad.ts — PadCtx 에 min/max 를 받고
if (ctx.min !== undefined && v < ctx.min) return `${ctx.min}${unit} 이상 입력해 주세요`;
if (ctx.max !== undefined && v > ctx.max) return `최대 ${ctx.max}${unit}까지 입력할 수 있어요`;
// padChipDisabled: set 칩이 ctx.max 를 넘으면 비활성
```
추가로 훅의 `sendNow` 직전에 같은 범위 가드를 한 번 더 두어 마지막 방어선으로 삼는다. 이 필드들을 경계값(0, 91, 101, 256)으로 확정하는 단위 테스트도 추가한다.

### CR-02: 타임아웃이 직렬화를 풀어 낡은 기준값 전송이 앞 확정(무장 해제 포함)을 조용히 되돌린다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:229-236,281-298,329-336,379-380`

**Issue:**
`unacked`(3초 무응답)가 켜지면 `failInflight(inf, 'timeout')`이 `setInflight(null)`로 슬롯을 비운다. 하지만 **그 프레임은 이미 소켓에 실렸고 서버에 늦게 도착할 수 있다.** 이 시스템은 터널 정지 같은 수 초 지연이 실제로 관측되는 환경이다.

그 뒤 사용자가 **다른** 필드 B를 확정하면 경로는 이렇다.
1. `inflight === null`이고 `popAfterSeqRef === null`이므로 대기열 없이 곧바로 `sendNow`로 간다.
2. 기준값은 `formFromServer(server, …)`인데, 이 `server`에는 아직 A가 반영되지 않았다(T-20-03 설계).
3. 따라서 B의 cfg에는 **A의 옛 값**이 실린다.

서버는 A(새 값)와 B(A의 옛 값) 순서로 처리한다. 화면에서는 다음이 차례로 일어난다.
1. A 에코가 오면 ③ 늦은 에코 규칙이 A를 **성공 강조**로 바꾼다.
2. 곧이어 B 에코가 A를 옛 값으로 덮는다. A에는 더 이상 실패 표시가 없어 아무 경고도 뜨지 않는다.

A가 `sellEnabled=false`(무장 해제)였다면 **해제 → 성공 표시 → 조용히 재무장**이 된다. 파일 머리말 ②-3과 T-16-44가 가장 경계하는 결과다. 이 훅은 ⑦에서 「동시에 나가 있는 전송은 1건」을 약속하는데, 타임아웃 경로가 그 약속을 깬다.

**Fix:** 타임아웃은 「결과 모름」이지 「끝남」이 아니다. 실패 표시는 하되 **직렬화 장벽은 다음 답 신호가 올 때까지 유지**한다.
```ts
// failInflight(inf, 'timeout') 안에서
setInflight(null);
// 보냈지만 답을 못 받은 프레임이 살아 있다 — 다음 답 신호까지 새 확정은 대기열로.
orphanSeqRef.current = inf.answerSeqAtSend;
...
// commit(): inflight !== null || popAfterSeqRef.current !== null || orphanSeqRef.current !== null → queue
// effect: orphanSeqRef.current !== null && seq !== orphanSeqRef.current → orphanSeqRef.current = null; drain()
```
장벽이 영구히 걸리지 않도록 재접속(`status` 전이)이나 다음 스냅샷에서도 장벽을 해제한다. 해제 시점에는 대기 건을 **새 서버 값으로** 다시 판정한다(`drain`의 no-op 판정이 이미 그렇게 한다).

### CR-03: `buyOrderAmount` 특례가 거부를 성공으로 읽는다(불변식 ③ 위반) — 테스트가 이 결함을 고정했다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:365-370` · `webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx:479-487`

**Issue:**
판정식은 `inf.field === 'buyOrderAmount' && server.buyOrderAmount === 0 && answered`다. 거부 통지(54)도 `acceptAnswer()`로 `serverAnswerSeq`를 올린다(`strategy-card.tsx:494`). 따라서 **서버 금액이 0인 레거시 전략에서 주문금액 변경이 거부되면, 서버 값은 그대로인데 `answered`가 참이 되어 성공이 된다.** 결과적으로 성공 강조가 뜨고, 시트가 닫히고, 실패 문구는 걷힌다.

relay는 `buyOrderAmount`를 싣고(`envelope.ts:1236`) 되돌려 준다(`:2034`). 그러니 정상적으로 수락되면 에코 값이 보낸 값과 같아져 일반 판정으로 성공한다. 이 특례가 따로 성공으로 판정하는 경우는 **거부나 무관한 답뿐이다.**

서버가 금액을 정말 저장하지 않는 경우도 문제다. 값 필드는 낙관 반영을 하지 않고 `formFromServer`는 `prev.buyOrderAmount`(옛 값)를 남긴다. 그래서 새 금액이 폼에 끝내 들어가지 않고, 다음 확정 때 옛 금액으로 `buyOrderQty`를 다시 계산해 **주문 수량을 되돌린다.** 즉 이 특례가 성공을 선언하는 두 경우 모두 틀린 결과다.

테스트 479행(「답 도착만으로 성공」)은 서버를 바꾸지 않고 seq만 올려서 성공을 단언한다. 이것은 거부 시나리오와 구분할 수 없는 입력이다.

**Fix:** 특례를 없애거나, 적어도 서버가 실제로 반영했다는 증거(파생 수량 일치)를 요구한다.
```ts
const amountEchoUnknown =
  inf.field === 'buyOrderAmount' && server.buyOrderAmount === 0 && answered &&
  server.buyOrderQty === buyOrderQtyFromAmount(inf.value as number, server.buyOrderPrice);
```
이 특례로 성공 판정을 할 때는 폼에 새 금액을 반영해야 한다(`setForm(prev => ({ ...prev, buyOrderAmount: inf.value }))`). 그러지 않으면 다음 전송이 수량을 되돌린다. 테스트 479행은 「답만 오고 서버 불변이면 실패」로 뒤집고, 「수량이 일치하는 에코면 성공」 케이스를 추가한다.

## Warnings

### WR-01: 미등록 전략에서 등록 전송이 진행 중일 때 한 값 편집이 성공 강조 뒤 에코에 조용히 덮인다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:320-325` · `webapp/src/components/trading/limit-chaser-form.tsx:453-463`

**Issue:** `server == null && !isGateField` 경로는 `setForm`과 `markSuccess`로 **즉시 성공 강조**만 한다. 이 경로는 게이트 전송(등록)이 in-flight인지 확인하지 않는다.

사용자가 매수주문 스위치를 켜 등록을 보냈고, 그 사이 매수가격을 바꿨다고 하자. 등록 에코가 오면 폼 이펙트의 `formFromServer(server, prev)`가 모든 필드를 **서버 값(등록 cfg 시점 값)**으로 덮는다. 사용자가 강조까지 본 편집이 사라지고, 서버에도 가지 않는다.

**Fix:** 등록 전송이 in-flight이거나 대기열이 있으면 `server == null`이어도 비게이트 확정을 **대기열에 넣는다.** drain 시점에는 서버가 생겼으므로 정상 전송이 된다. 다른 방법으로는 `inflightRef.current !== null`일 때 로컬 반영을 막고 `queued`를 반환하는 방식도 있다.

### WR-02: 성공 직후 대기열이 비어 있으면 뒤따르는 답 신호 증가가 다음 확정을 「거부」로 오판한다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:370-378,329`

**Issue:** 머리말 ⑦에 따르면 성공 에코 뒤의 `serverAnswerSeq` 증가는 **한 렌더 늦게** 온다(`strategy-card.tsx`의 에코 이펙트가 `acceptAnswer`를 부른다). 그런데 이 장벽(`popAfterSeqRef = seq`)은 **대기열에 건이 있을 때만** 세운다.

대기열이 빈 상태에서 성공 렌더와 증가 렌더 사이에 사용자 확정이 들어오면 다음 순서로 오판된다.
1. `answerSeqAtSend`가 증가 전 값으로 기록된 채 전송된다.
2. 증가 렌더에서 `answered && !matches` → `failInflight('rejected')`가 된다.
3. 토글은 되돌려지고, 뒤따르는 대기 건도 전부 실패 처리된다.
4. 카드의 `acceptAnswer`가 새 전송의 3초 타이머까지 꺼 버린다.

창은 짧지만(ms), 스위치를 연달아 누르는 흐름에서는 실제로 일어날 수 있다.

**Fix:** 성공이 `serverChanged` 렌더에서 판정되면 대기열 유무와 관계없이 `popAfterSeqRef.current = seq`를 세운다. 이렇게 하면 새 확정은 그 증가가 올 때까지 대기열에 선다.

### WR-03: 대기열에서 꺼낼 때 무장 불가나 끊김으로 막힌 토글이 아무 문구 없이 되돌아간다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:258-278` · `webapp/src/components/trading/limit-chaser-form.tsx:660-673,688-691`

**Issue:** 토글의 `armBlocked`/`disconnected` 사유는 폼 맨 위 `submitError`만 말한다. 그런데 `submitError`는 `commitToggle`이 **직접 받은 반환값**으로만 세워진다. `drain()`이 이펙트 안에서 대기 토글을 보내다 `blocked`나 `disconnected`를 받으면, 훅은 그 필드를 실패로 기록하고 스위치를 되돌린다.
- `toggleFailureTextOf`는 `rejected`/`timeout`만 보여 준다.
- 곧이어 `[server, serverAnswerSeq]` 이펙트가 `submitError`를 비운다.

결과적으로 스위치가 켜졌다가 아무 설명 없이 꺼진다. 「무로그 fail-safe 금지」와 파일 머리말 ⑥(화면 문장이 유일한 통보)에 어긋난다.

**Fix:** `toggleFailureTextOf`가 `armBlocked`/`disconnected`에는 `f.text`를 보여 주게 한다. 또는 폼이 `lc.failures`의 토글 필드 실패를 보고 `submitError`를 파생하게 한다(반환값 대신 상태에서 파생).

### WR-04: 세션이 비활성이 되면 시트 「적용」과 인라인 Enter가 아무 반응 없이 무시된다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:303` · `webapp/src/components/trading/limit-chaser-form.tsx:551-557,599-605,660-673`

**Issue:** `commit`은 `disabled`이면 실패를 기록하지 않고 `'blocked'`만 돌려준다. 시트나 인라인 편집기가 열린 채 연결이 `ready`에서 벗어나면(재접속·끊김) 다음과 같이 된다.
- `handleSheetConfirm`과 `handleInlineSave`는 `'blocked'`를 처리하지 않는다. 버튼을 눌러도 **아무 일도 일어나지 않고** 어떤 문구도 없다.
- 토글 쪽은 `commitToggle`이 `armBlockOf(...) ?? ''`를 보여 준다. 그래서 끊김인데 무장 사유 문장이 뜨거나 빈 문자열이 된다.

**Fix:** `disabled`일 때는 `setFailure(field, 'disconnected', LC_COMMIT_TEXT.disconnected, value)`를 남기고 `'disconnected'`를 반환한다. 또는 `'blocked'`와 `'disabled'`를 구분한 반환값을 두고 호출부가 끊김 문구를 보여 주게 한다.

### WR-05: ETF·ETN 등 다른 호가 단위를 쓰는 유효 가격을 하드 블록한다(상따 시트·인라인, 수동주문 터치 시트)

**File:** `packages/shared/src/krxTick.ts:20-21,57-66` · `webapp/src/lib/numpad.ts:167-173` · `webapp/src/components/trading/lc/inline-value-editor.tsx:109-112` · `webapp/src/components/trading/card/manual-order-form.tsx:1080-1084` (비교: `:782`)

**Issue:** 헬퍼 주석은 「ETF/ETN 예외 단위는 다루지 않는다(deferred)」고 적었다. 하지만 `priceInputIssue`는 모든 종목에 주식 표를 적용해 **확인 버튼을 잠근다.** 예를 들어 ETF의 25,005원(5원 단위)은 `offTick`(50원 단위) 판정을 받는다.
- 상따 설정에서는 그런 가격을 아예 확정할 수 없다.
- 수동주문 터치 모드는 상자가 버튼뿐이라 시트가 유일한 입력 경로다. 따라서 유효한 가격을 넣을 수 없다. 같은 폼의 마우스 인라인(`:782`)은 경고만 하고 주문을 허용하므로 입력 장치에 따라 규칙이 갈린다.

「입력 보조일 뿐 서버 판정을 대체하지 않는다」(D-15 괄호)는 전제가 이 종목들에서 깨진다.

**Fix:** 종목 구분(ETF·ETN 여부)을 모르면 `offTick`은 **경고로만 보여 주고 확인은 막지 않는다.** 최소한 수동주문 시트는 인라인과 같게 경고만 한다. 또는 `PadCtx`에 `tickRule: 'stock' | 'etp' | 'unknown'`을 받아 `unknown`/`etp`에서는 호가 단위 잠금을 끈다.

### WR-06: 꺼낼 때 no-op이 된 대기 확정은 성공 신호가 없어 편집기나 시트가 열린 채 남는다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:263-266,288-291` · `webapp/src/components/trading/limit-chaser-form.tsx:536-542,551-557,599-605`

**Issue:** 편집기와 시트는 `'queued'`면 열린 채 기다리다가 `successSeq`로 닫힌다. 그런데 다음 두 경로는 실패만 지우고 `markSuccess`를 부르지 않는다.
- `drain`이 대기 건을 「서버가 이미 그 값」이라 건너뛰는 경우
- `failInflight`가 같은 이유로 건너뛰는 경우

그래서 사용자가 「적용」이나 Enter를 누른 값이 서버에 이미 서 있는데도 시트는 `editing` 상태로 계속 열려 있고, 인라인 편집기도 닫히지 않는다.

**Fix:** 두 no-op 분기에서 `markSuccess(p.field)`를 부른다. 서버 값이 곧 사용자 확정값이므로 성공으로 보는 것이 맞다.

### WR-07: 레거시 전략(서버 `buyOrderAmount === 0`)에서는 어떤 필드를 확정해도 `buyOrderQty`가 클라이언트 기본 금액으로 재계산되어 덮인다

**File:** `webapp/src/components/trading/lc/use-lc-field-commit.ts:233-242` · `webapp/src/components/trading/limit-chaser-form.tsx:435-441,473-490` · `webapp/src/lib/limit-chaser.ts:313`

**Issue:** 서버가 금액을 모르면 `formFromServer`는 `prev.buyOrderAmount`를 남긴다. 최초 마운트에서는 `defaultLimitChaserForm()`의 10(만원)이 그 값이다. `buildCfg`는 매 전송마다 `buyOrderQty = floor(amount × 10,000 / price)`를 **다시 계산한다.** 그래서 서버가 쥔 실제 수량(예: 500주)이 체크 하나, 비교가격 하나를 바꾸는 것만으로 `floor(100,000/price)`주로 조용히 바뀐다. 가격이 10만원을 넘으면 0주가 되어 `armBlockOf`가 **모든 값 확정을 막는다.**

이 동작 자체는 Phase 16부터 있었다. 그러나 D-04로 「필드 하나 = 전체 전송」이 되면서 발생 빈도가 크게 늘었다.

**Fix:** 서버 금액이 0이면 cfg의 `buyOrderQty`에 **서버 에코의 `buyOrderQty`를 그대로** 싣는다. 금액 필드를 사용자가 확정한 경우에만 재계산한다. 또는 그 전략에서는 값 확정 전에 「주문금액을 먼저 입력해 주세요」로 막는다.

## Info

### IN-01: ±1호가, ↑↓ 스텝이 호가 격자에 맞지 않는 값에서 시작하면 결과도 격자 밖이다

**File:** `packages/shared/src/krxTick.ts:41-51` · `webapp/src/lib/numpad.ts:189-192`

**Issue:** `tickDown(5002)`는 `5002 − tick(5001)=10` = 4,992다. 4,992는 5원 구간에서 5의 배수가 아니다. `tickUp(5002)`도 5,012가 된다. 스텝 버튼이 격자로 돌아오게 해 주지 않아, 사용자는 검증 문구를 보고 다시 손으로 고쳐야 한다.

**Fix:** 격자 밖 값이면 먼저 격자에 맞춘다. 올림 방향은 `ceil(v/t)*t`, 내림 방향은 `floor(v/t)*t`로 맞추고, 이미 격자 위에 있으면 기존대로 한 칸 이동한다.

### IN-02: 대기 중인 토글의 낙관 표시가 앞 건 에코에 한 렌더 덮였다가 다시 걸린다(깜빡임)

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:453-463` · `webapp/src/components/trading/lc/use-lc-field-commit.ts:251-252`

**Issue:** 앞 건의 에코가 오면 폼 이펙트가 모든 필드를 서버 값으로 덮는다. 이때 대기 토글의 낙관 표시도 서버 값으로 돌아간다. 한 렌더 뒤 `drain` → `sendNow`가 다시 건다. 결과적으로 스위치가 한 프레임 꺼졌다가 켜진다.

**Fix:** 폼 이펙트에서 `lc.queuedFields`와 `inflightField` 중 토글 필드는 덮지 않는다. 또는 훅이 낙관 값 오버레이를 따로 들고 렌더에서 합성한다.

### IN-03: 키패드 「00」은 8자리에서 통째로 무시된다

**File:** `webapp/src/lib/numpad.ts:94-95`

**Issue:** 8자리 버퍼에 「00」을 누르면 10자리가 되어 **두 0이 모두** 무시된다. 한 자리만 붙일 수 있는데도 아무 반응이 없다. D-16의 「9자리 초과 무시」와 모순은 아니지만, 사용자에게는 키가 먹지 않는 것처럼 보인다.

**Fix:** `'00'`은 남은 자리만큼 잘라 붙인다: `next.slice(0, PAD_MAX_DIGITS)`.

---

_Reviewed: 2026-09-25T06:26:07Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
