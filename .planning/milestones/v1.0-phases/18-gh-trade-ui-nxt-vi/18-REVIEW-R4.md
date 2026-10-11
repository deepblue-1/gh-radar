---
phase: 18
phase_dir: 18-gh-trade-ui-nxt-vi
round: R4
reviewed: 2026-09-22T12:22:30Z
depth: deep
scope: "git diff f5aa92a..HEAD -- . ':!.planning' (plans 18-33..18-35)"
files_reviewed: 15
files_reviewed_list:
  - relay/src/order/notice-status.ts
  - relay/src/store/orders.ts
  - relay/src/ws/order-handler.ts
  - relay/tests/helpers/fake-dma-orders.ts
  - relay/tests/order-store.test.ts
  - relay/tests/ws-order.test.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/components/orderbook/order-confirm-dialog.tsx
  - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/card/manual-order-form.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/lib/__tests__/relay-provider.test.tsx
  - webapp/src/lib/relay-provider.tsx
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 18: 코드 리뷰 보고서 — 갭 클로징 라운드 R4 (18-33 ~ 18-35)

**리뷰 시각:** 2026-09-22T12:22:30Z
**깊이:** deep (전 파일 standard 리뷰 + relay 통보 → `recordUnmatched` → `OrderStore` 큐 → `supabaseOrderSink` 조건부 UPDATE 추적, 호가 탭 `stock-orderbook-section` → `CardBody` → `ManualOrderForm` → `RelayProvider.orderLocks` 키 교차 추적)
**리뷰 파일 수:** 15 (소스 7 · 테스트/e2e/테스트 헬퍼 8)
**상태:** issues_found

## 요약

R3(`18-REVIEW-R3.md`)의 R3-WR-01 · R3-WR-02 · R3-IN-01~05 를 닫으려는 3개 플랜(18-33 ~ 18-35)의 변경을 리뷰했다. 범위는 `f5aa92a..HEAD` 에서 `.planning` 을 뺀 것이다.

직접 돌려 본 검증은 다음과 같다.
- relay `vitest`: 20 files · 534 passed
- relay `tsc --noEmit`: 오류 0
- webapp `vitest`: 92 files · 1472 passed · 1 skipped
- webapp `tsc --noEmit`: 오류 0

Playwright(GC6 포함)는 이번 리뷰에서 돌리지 않았다. 18-36 SUMMARY 의 기록(143 · 0 fail)만 확인했다.

relay 쪽 상태 단조성은 설계가 깔끔하다. 판정 지점이 `replaceableStatusesOf` 하나이고, Postgres 가 UPDATE 한 문장 안에서 원자적으로 판정한다. 7×7 전이를 손으로 다시 따져 봤다. 늦은 M 은 `partially_filled`/`filled` 를 되돌리지 못하고, 늦은 `timeout` 은 `accepted` 를 되돌리지 못한다. `timeout → accepted` 는 열려 있다. 23505 재시도도 같은 필터를 받는다. 재큐잉 때문에 순서가 뒤집혀도 이제 역행 갱신이 막힌다. 수량 모르는 체결 E 는 `status` 가 `undefined` 이므로 필터를 타지 않는다. 그래서 `filled_qty` 는 계속 반영된다.

webapp 쪽 잠금은 `RelayProvider` 한 곳으로 올라갔다. 세대 ref 로 로그아웃 경계를 지키고, 진행 중 → 결과 모름 전이는 한 액션이라 틈이 없다. 작업대 · 카드 본문의 prop 배선이 모두 걷혔다. 카드 정리 효과도 `cards` 파생 하나로 바뀌었다.

Critical 은 없다. 새로 확인된 결함은 하나다.
- **R4-WR-01:** 18-34 가 폼의 로컬 잠금(`blocked`)을 지우고 잠금 원천을 Provider 키 하나로 바꿨다. 그런데 **정정 요청은 원주문 행의 거래소로 잠그고, 폼은 자기 거래소 키만 읽는다.** 호가 탭은 미체결을 거래소로 거르지 않는다. 그래서 KRX 보기에서 NXT 원주문을 정정하다 timeout 이 나면, 그 폼은 「결과 모름」 배너를 띄운 채 **4버튼이 다시 열린다.** 같은 원주문을 곧바로 다시 정정할 수 있다. 18-34 이전에는 로컬 `blocked` 가 이 인스턴스를 잠갔으므로 **R4 가 만든 회귀**다. 단위 테스트가 바로 이 시나리오(폼 KRX · 원주문 NXT)를 돌리면서도 잠금 맵만 단언하고 버튼 상태는 보지 않는다.

### R3 findings 종결 판정

| R3 ID | 플랜 | 판정 | 근거 |
|-------|------|------|------|
| R3-WR-01 | 18-33 | **종결** | `notice-status.ts:109-114` 의 `replaceableStatusesOf` 가 판정의 유일 지점이다. 결과는 「`next` 자신 ∪ 종결이 아니면서 순위가 `next` 이하인 상태」다. `orders.ts:368-375` 는 `status` 가 실린 갱신에만 `.in("status", …)` + `.select("id")` 를 붙이고, 0행이면 통째로 반영하지 않는다(`applied:false`). 23505 재시도(`:439-445`)도 같은 `runUpdate` 를 지나므로 같은 필터를 받는다. 늦은 M → `accepted` 는 `{accepted, requested, timeout}` 만 덮는다. 그래서 체결 행(정정 행이든 원주문 행이든)은 되돌아가지 않는다. 테스트는 49칸 전이표와 ws ㊹ ㊺(E 뒤 M) 회귀가 green 이다. 같은 계열에 남은 틈(다른 행으로 잘못 귀속되는 경우)은 R4-IN-02 에 적었다. |
| R3-WR-02 | 18-34 · 18-35 | **부분 종결** | 잠금은 이제 `RelayProvider`(`relay-provider.tsx:382-398`, `:419-433`)가 앱 수명으로 든다. 작업대 카드와 호가 탭 폼이 같은 `strategyKey` 로 읽는다(`manual-order-form.tsx:306-307`). 페이지 이탈 → 복귀와 호가 탭 경로가 닫혔고, e2e GC6 가 이것을 고정한다. `CLOSE_UNKNOWN_BODY`(`trading-workbench.tsx:162-163`)도 해제 규칙(로그아웃 · 새로고침)을 사실대로 말한다. 다만 로컬 잠금을 지우면서 **정정 요청 키 ≠ 폼 키**인 경로가 새로 열렸다(R4-WR-01). 새 탭 · 새로고침으로 풀리는 것은 사용자 결정 1 에 기록된 제품 결정으로 본다. |
| R3-IN-01 | 18-34 | **종결** | `relay-provider.tsx:420` 에서 취소는 잠금 등록 없이 곧바로 보낸다. 폼 테스트 「취소 timeout → 잠금 등록 0 · 버튼 잠기지 않음」이 green 이다. 참고로 신규 · 정정의 결과 모름 잠금은 여전히 **폼의** 취소 버튼까지 막는다(`manual-order-form.tsx:614`, `busy` 포함). 하지만 공용 패널의 미체결 취소는 살아 있으므로 위험을 줄이는 동작은 막히지 않는다. 「4버튼 잠금」 설계와도 일치한다. |
| R3-IN-02 | 18-34 | **종결** | 보내기 직전 `start`(진행 중 +1)를 하고, 결과가 오면 `settle` 한 액션으로 −1 과 결과 모름을 함께 반영한다(`relay-provider.tsx:181-198`, `:422-431`). 전송 중 ✕ → 재추가 경로에서도 새 폼이 `in-flight` 로 잠겨 「주문 전송 중…」을 보인다(`manual-order-form.tsx:397-399`). ✕ 판정도 `orderLocks.has` 로 진행 중을 포함한다(`trading-workbench.tsx:611`). 다이얼로그 문구 관찰은 R4-IN-03 에 있다. |
| R3-IN-03 | 18-35 | **종결** | 계좌 채움 효과가 치운 카드를 따로 계산하지 않는다. `setCards(prev => fillAccountCards(prev, accountNo).next)` 한 번뿐이다(`trading-workbench.tsx:591-594`). 더티 · 직전 로그 정리는 커밋된 `cards` 에서 파생하는 효과 하나가 맡는다(`:567-579`). 카드 id 는 재사용되지 않고(`nextCardId`), 두 맵의 키가 모두 카드 id 라는 것을 `:550` · `:690-691` 에서 확인했다. |
| R3-IN-04 | 18-35 | **부분 종결** | 근거 2 의 범위를 「relay 발 주문 한정」으로 좁히는 주석이 `order-confirm-dialog.tsx:83-89` 에 들어갔다. 중립 표기(「가격 없음」)는 서버 주문유형 필드가 필요해서 deferred 로 넘겼다. 오표기(칩 · 정정 잠금 사유)는 그대로 남는다. 잠그는 방향이라 무해하다. |
| R3-IN-05 | 18-36(기록) | **미종결 (운영 게이트)** | 코드 handshake 는 deferred 다. 배포 순서(relay → 검증 → webapp push)는 18-36 SUMMARY · 18-VALIDATION 에만 기록돼 있다. 지금 HEAD 는 `origin/master` 보다 **48 커밋** 앞서 있고(R3 시점 32), 18-26 결합은 여전히 같은 push 에 묶여 있다. R4 relay 변경(18-33)은 webapp 과 결합이 없다. |

## Narrative Findings (AI reviewer)

## Warnings

### R4-WR-01: 호가 탭에서 다른 거래소 원주문을 정정하다 timeout 이 나면, 폼이 「결과 모름」 배너를 띄운 채 4버튼을 다시 연다 (18-34 회귀)

**File:** `webapp/src/components/trading/card/manual-order-form.tsx:306-307` (폼은 `strategyKey(isin, accountNo, exchange)` = **폼의** 거래소만 읽는다) · `:467-476` (정정 요청의 `exchange: selected.exchange`, `:473`) · `webapp/src/lib/relay-provider.tsx:422` (잠금 키 = **요청의** 거래소) · `webapp/src/components/stock/stock-orderbook-section.tsx:157` · `:170` (호가 탭 미체결은 ISIN 으로만 거르고 거래소로는 거르지 않는다)

**Issue:** 18-34 는 폼의 로컬 `blocked` 를 지우고 `locked = lock !== undefined` 로 잠금 원천을 하나로 줄였다(`:397`). 그 전제는 「폼이 읽는 키 = 폼이 보낸 요청의 키」다. 신규 주문에서는 이 전제가 맞다. **정정에서는 틀리다.**
1. 호가 탭 상태줄 거래소가 KRX 이다. `stockAccount.unf` 는 `u.isin === subscriptionIsin` 으로만 거르므로 같은 종목의 **NXT 미체결 행도 목록에 뜨고 선택할 수 있다.**
2. 그 행을 정정한다. 요청 키는 `…:NXT` 이고 Provider 는 `…:NXT` 를 잠근다.
3. timeout 이 난다. 폼은 `setResult({ kind: 'unknown' })` 만 한다(`:591`). 폼이 읽는 키는 `…:KRX` 라 `lock === undefined` 이다. `submitting` 이 `false` 로 돌아오는 순간 **매수 · 매도 · 정정 · 취소 4버튼이 모두 다시 열린다.** 선택 행은 여전히 미체결에 있으므로 같은 원주문을 **곧바로 다시 정정**할 수 있다. 「결과 모름이면 버튼을 다시 열지 않는다」(파일 헤더 4번)가 바로 이 폼에서 깨진다.
4. 배너는 「결과를 모른다 · 미체결을 확인하라」고 말하는데 버튼은 열려 있다. 화면이 스스로 모순된다. 잠금 문구(`:828`)는 조건이 `lock === 'result-unknown'` 이라 뜨지 않는다.

18-34 이전에는 `setBlocked(true)` 가 요청 키와 무관하게 이 폼 인스턴스를 잠갔다. 그래서 이것은 **R4 가 새로 연 경로**다. 작업대는 선택 행을 「같은 ISIN ∧ 행의 거래소 ∧ 카드」가 맞을 때만 카드에 내리므로 이 틈이 없다. 호가 탭만 해당한다. 단위 테스트 「정정 timeout → 원주문 **행의** 키(NXT)가 잠긴다 — 폼 키(KRX)가 아니다」(`manual-order-form.test.tsx:944-957`)가 정확히 이 구성(폼 KRX · 행 NXT)을 돌린다. 그런데 잠금 맵만 단언하고 **버튼 상태는 보지 않아서** 회귀가 초록불 아래 숨었다.

실돈 영향은 제한적이다. 첫 정정이 실제로 접수됐다면 원주문 X 의 잔량이 옮겨 갔으므로, X 를 겨냥한 두 번째 정정은 서버가 거부할 가능성이 크다. 하지만 R3-WR-02 가 막으려던 「결과 모름 뒤 같은 주문 재전송」 범주에 그대로 해당한다. 잠금 계약이 한 표면에서 성립하지 않는 것이므로 WARNING 으로 둔다.

**Fix:** 폼 잠금을 「폼 키 ∪ 선택 행 키」로 판정한다. 정정 · 취소 대상 행의 키가 잠겨 있으면 적어도 정정은 막는다.
```ts
// manual-order-form.tsx
const formKey = accountNo.length > 0 ? strategyKey(isin, accountNo, exchange) : null;
const rowKey =
  selected && accountNo.length > 0 ? strategyKey(selected.isin, accountNo, selected.exchange) : null;
const lock =
  (formKey !== null ? orderLocks.get(formKey) : undefined) ??
  (rowKey !== null ? orderLocks.get(rowKey) : undefined);
```
다른 방법도 있다. 호가 탭이 미체결을 `u.exchange === exchange` 로도 거르면 선택 행의 거래소가 항상 폼 거래소와 같아진다(작업대와 같은 규칙). 회귀 테스트는 위 단위 테스트 끝에 `for (const b of allButtons()) expect(b).toBeDisabled()` 를 붙이면 된다.

## Info

### R4-IN-01: 「0행」 과 「단조성 가드에 막힘」 이 같은 신호로 합쳐졌고, `applied`/`flushedNoop` 주석은 여전히 「자리는 하나다」라고 말한다

**File:** `relay/src/store/orders.ts:375` (`blocked = 0행`) · `:386` (warn 문구) · `:175-180` · `:291-296` (갱신되지 않은 docstring) · `relay/src/ws/order-handler.ts:514` · `:557` (`order_no` 셀렉터 열화 경로)

**Issue:** `blocked` 는 「가드에 걸렸다」가 아니라 「`status` 를 실은 UPDATE 가 오류 없이 0행이었다」이다. 조회 실패 뒤의 열화 갱신(`enqueueUpdate({ ...patch, userId })`)은 `order_no` 셀렉터를 쓴다. 이 경로는 수동 행에 아직 `order_no` 가 없어서 0행이 흔하다(주석 Pitfall 18). 이제 이 경우가 「상태 단조성 — 더 진행된 행을 되돌리는 갱신」 warn 과 `flushedNoop` 으로 집계된다. 전에는 `flushed` 였다. 로그 문구에 「(또는 대상 행 없음)」을 붙이긴 했다. 하지만 운영자가 이 warn 을 보고 두 원인을 가를 수 없다. `OrderUpdateResult`(`:177`)와 `flushedNoop`(`:293`)의 docstring 은 여전히 「지금 이 값이 나오는 자리는 하나다 — 23505」라고 적혀 있다. 감사 지표라고 선언한 카운터(S-5)의 뜻이 바뀌었는데 문서가 따라가지 않았다.

**Fix:** docstring 두 곳에 「상태 단조성 가드(또는 대상 0행)」를 두 번째 자리로 적는다. 원인을 가르려면 `id` 셀렉터일 때만 `blocked` 로 부르고(행 존재가 조회로 확인된 경로), `order_no` 셀렉터의 0행은 별도 문구로 로그를 남긴다.

### R4-IN-02: 단조성 가드는 「같은 행의 역행」만 막는다 — 늦은 통보가 **다른 행**(원주문)에 붙는 오귀속은 같은 순위 · 종결 방향이면 그대로 통과한다

**File:** `relay/src/order/notice-status.ts:109-114` · `relay/src/ws/order-handler.ts:498-521`

**Issue:** R3-WR-01 은 두 번째 갈래로 「M 통보의 `orderNo` 가 원주문 X 라면 원주문 행을 덮는다」를 적었다. 원주문이 이미 `partially_filled`/`filled` 이면 이제 가드가 막는다. 그러나 가드가 허용하는 방향의 오귀속은 남는다.
- 원주문 X 가 `accepted` 인 상태에서 늦은 정정확인 M(orderNo X)이 오면 `accepted → accepted` 는 허용된다. 원주문 행의 `notice_type` 이 `M` 으로 바뀐다.
- 정정 대기가 timeout 된 뒤 늦게 도착한 정정 **거부** R 의 `orderNo` 가 원주문 X 라면, `accepted`/`partially_filled → rejected` 도 허용된다. 살아 있는 원주문이 감사 기록에 「거부」로 남는다.

게이트웨이가 정정 통보의 `orderNo` 에 무엇을 싣는지에 달린 조건부 관찰이다. 순위 규칙의 결함이 아니라 `recordUnmatched` 의 귀속 문제다.

**Fix:** `requestKind` 가 `Modify` 인 늦은 R/M 이 `recordUnmatched` 에서 찾은 행이 원주문 행(`org_order_no` 없음)이면, 상태를 싣지 않고 `notice_type`/`message` 도 쓰지 않는다. 또는 게이트웨이 계약(정정 R/M 의 `orderNo` 의미)을 확인해 주석으로 고정한다.

### R4-IN-03: ✕ 다이얼로그가 「진행 중」 잠금에도 「결과를 모르는 주문이 있어요 · 로그아웃하거나 새로고침하면 풀려요」라고 말한다

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:611` · `:161-163`

**Issue:** `closeCard` 는 `orderLocks.has(key)` 로 판정하므로 `in-flight`(응답 대기 ≤ 수 초)도 `reason: "unknown"` 이 된다. 이때 제목과 본문은 결과 모름 전용 문구다. 실제 진행 중 잠금은 접수 · 거부가 오면 곧 풀린다. 그런데 사용자는 「새로고침해야 풀린다」는 틀린 안내를 받는다. 다이얼로그가 떠 있는 동안 결과가 오면 문구와 상태가 더 벌어진다. 잠그는 방향이라 안전 문제는 아니다.

**Fix:** `orderLocksRef.current.get(key)` 의 종류로 가른다. `in-flight` 이면 「주문 전송 중이에요 — 결과가 오면 다시 닫을 수 있어요」 같은 별도 문구(또는 `data-reason="in-flight"`)를 쓴다.

### R4-IN-04: 가짜 PostgREST 가 가드로 0행이 된 UPDATE 에도 23505 를 계산한다 — 실제 DB 와 갈린다

**File:** `relay/tests/helpers/fake-dma-orders.ts:170-175`

**Issue:** 충돌 판정의 `owner` 는 `query.matched[0]?.user_id ?? filters.user_id` 이다. `order_no` 셀렉터에서 `status IN (…)` 필터가 행을 전부 걸러도 `owner` 는 필터값으로 채워진다. 그래서 `order_no` 를 채우는 패치면 23505 를 돌려준다. 실제 Postgres 는 WHERE 가 0행이면 인덱스 충돌이 날 수 없고 `data: []` 를 돌려준다. 최종 결과(`applied:false`)는 두 경로 모두 같다. 하지만 테스트가 「가드에 막힘」 대신 「23505 → 재시도 → 막힘」 경로를 밟게 되어, 로그 · 호출 횟수 단언이 실제와 다른 경로를 고정할 수 있다. 헬퍼 머리 주석이 「스텁이 아니라 실제로 계산한다」를 규율로 내세우므로 짚어 둔다.

**Fix:** `query.matched.length === 0` 이면 충돌 검사를 건너뛴다(0행 UPDATE 는 제약을 평가하지 않는다).

### R4-IN-05: e2e GC6 의 `isVisible()` 즉시 판정 분기는 타이밍에 따라 갈린다

**File:** `webapp/e2e/specs/trading-workbench.spec.ts:1001-1003` · `:1020-1022`

**Issue:** `if (!(await obForm.isVisible()))` 는 기다리지 않는 한 번의 스냅샷이다. 탭 전환 · 새로고침 직후 폼이 아직 마운트되지 않았으면 「수동주문」을 누른다. 폼이 기본 펼침인 구성에서는 그 클릭이 폼을 **접는** 토글이 될 수 있다. 그러면 바로 다음 `toBeVisible()` 이 실패한다. 지금은 통과하지만 느린 CI 에서 흔들리는 전형적인 모양이다.

**Fix:** 먼저 `manual-entry` 영역이나 상태줄 ready 를 기다린 뒤, 수동주문 토글의 `aria-expanded` 로 결정한다. 또는 호가 탭의 기본 펼침 여부를 픽스처로 고정하고 분기를 없앤다.

---

_Reviewed: 2026-09-22T12:22:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
