---
phase: 18
phase_dir: 18-gh-trade-ui-nxt-vi
round: R2
reviewed: 2026-09-22T08:15:00Z
depth: deep
scope: "git diff d383862..HEAD -- . ':!.planning' ':!infra' (plans 18-14..18-22)"
files_reviewed: 29
files_reviewed_list:
  - packages/shared/src/relay.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/order-handler.ts
  - relay/src/ws/protocol.ts
  - relay/src/ws/__tests__/protocol.test.ts
  - relay/tests/rate-cross.test.ts
  - relay/tests/ws-order.test.ts
  - supabase/migrations/20260922120000_dma_orders_cancel_price_zero.sql
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/components/orderbook/order-confirm-dialog.tsx
  - webapp/src/components/orderbook/__tests__/order-confirm-dialog.test.tsx
  - webapp/src/components/trading/card/card-header.tsx
  - webapp/src/components/trading/card/manual-order-form.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/workbench/card-grid.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/vi-settings-rows.tsx
  - webapp/src/components/trading/__tests__/card-grid.test.tsx
  - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/__tests__/relay-provider.test.tsx
  - webapp/src/lib/__tests__/relay-socket.test.ts
findings:
  critical: 1
  warning: 4
  info: 6
  total: 11
status: issues_found
---

# Phase 18: 코드 리뷰 보고서 — 갭 클로징 라운드 R2 (18-14 ~ 18-22)

**리뷰 시각:** 2026-09-22T08:15:00Z
**깊이:** deep (standard 전 파일 + relay 통보 정산·DB CHECK·카드 정체성 경로 교차 추적)
**리뷰 파일 수:** 29 (소스 16 · 테스트/e2e 13)
**상태:** issues_found

## 요약

라운드 1(`18-REVIEW.md`)의 CR-01 · CR-02 · WR-01~07 을 닫은 9개 플랜의 소스 변경을 리뷰했다. 범위는 `d383862..HEAD` 이고 `.planning` 과 `infra` 는 뺐다(`a7174d6` 은 다른 세션 커밋). 검증 결과 relay `vitest` 는 20 files · 516 passed, webapp `vitest` 는 92 files · 1383 passed · 1 skipped 로 전부 통과했다.

코드 층의 수정은 대체로 의도대로 맞물린다. 취소 가격 0 은 webapp 번역기 · zod · 조립기 세 층에서 같은 규칙을 쓴다. VI 줄은 등록 계좌를 정본으로 보낸다. `PendingOrder.kind` 하드 필터는 같은 원주문의 취소·정정 교차 정산을 막는다. 카드 정체성은 카드 id 로 옮겨졌고, 전략 키 유일성을 지키는 가드 5곳(유입 · 포커스 · 거래소 토글 · 계좌 채움 · 미체결 선택)이 서로 모순되지 않는다. `card-grid` 의 포털 + 고정 호스트 방식도 추적해 봤다. 삭제(mutation) → ref 부착(layout) 순서, 형제 순서, SSR 첫 렌더 모두 결함을 찾지 못했다.

가장 큰 문제는 **DB CHECK 가 3값 논리 때문에 설계한 규칙을 전혀 강제하지 못한다**는 점이다(GC-CR-01). `krx_session` 이 NULL 인 행에서는 CHECK 식이 NULL 로 평가되고, Postgres 는 NULL 을 통과로 본다. 그래서 세션 없는 가격 0 신규·정정도 DB 가 받는다. 18-18 이 「계속 거부된다」고 기록한 T-18-82 검증은 사실이 아니다. 라운드 1 CR-01 의 3번째 층(「취소 행 insert 가 CHECK 에 걸린다」)도 애초에 성립하지 않았다. 원격에 적용한 한쪽 문 마이그레이션이 틀린 전제 위에 서 있는 셈이다.

그 밖에 새로 생긴 결함은 넷이다.
- 통보 종류 "E"→신규 매핑이 명시적인 `requestKind:"Modify"` 를 이긴다. 그래서 정정의 감사 행이 영구히 `timeout` 으로 남을 수 있다(GC-WR-01).
- 취소 확인 중에 부분체결이 나면, 잔량보다 큰 옛 수량으로 취소가 나간다(GC-WR-02).
- 「결과 모름」 잠금은 여전히 카드에 묶여 있어 ✕ 후 다시 추가하면 풀린다(GC-WR-03).
- 등록된 VI 를 다른 계좌로 옮길 경로가 UI 에서 사라졌다(GC-WR-04).

### 라운드 1 findings 종결 판정

| R1 ID | 플랜 | 판정 | 근거 |
|-------|------|------|------|
| CR-01 | 18-14 · 18-16 · 18-18 | **코드 층은 종결, DB 층 전제는 오류** | 번역기 `relay-provider.tsx:176-182` · zod `protocol.ts:316` · 조립기 `envelope.ts:967` 이 취소 0 을 받는다. ws ㊵ 왕복 테스트도 green 이다. 다만 DB CHECK 는 NULL 세션 행을 원래부터 막지 못했다. 새 마이그레이션은 불필요했고, 뜻한 규칙도 강제하지 못한다(GC-CR-01). |
| CR-02 | 18-15 | **종결** | `viRowAccountOf` 한 값을 송신 · 잠금 · 요약 · 고지가 함께 읽는다(`vi-settings-rows.tsx:313, 401, 432, 566`). 부작용으로 VI 계좌 이전 경로가 사라졌다(GC-WR-04). |
| WR-01 | 18-16 | **종결** | 세션이 `null` 이면 주문을 만들지 않는다(`manual-order-form.tsx:434-440`). 다이얼로그 `orderType` 도 같은 `session` 에서 나온다. |
| WR-02 | 18-20 | **부분 종결** | 접기·펴기로는 이제 재마운트되지 않는다. 그러나 잠금이 여전히 카드 로컬이라 ✕ → 재추가로 풀린다(GC-WR-03). |
| WR-03 | 18-19 | **종결 (신규 결함 동반)** | 교차 정산은 막았다. 대신 E→N 매핑이 명시적 `requestKind` 와 충돌하면 정정이 timeout 으로 남는다(GC-WR-01). |
| WR-04 | 18-22 | **종결** | 받을 카드가 없으면 `cardForUnfilled` 가 행 키로 카드를 붙인다. 전달 조건과 같은 술어를 쓴다(`trading-workbench.tsx:204-224, 725-731`). |
| WR-05 | 18-21 | **종결** | 카드 id 정체성과 키 충돌 가드 5곳을 확인했다. 표시 층에 잔여가 있다(GC-IN-04). |
| WR-06 | 18-16 | **정정은 종결** | 추종 · 제출 검증 · 확정 직전 재대조가 들어갔다. 취소 수량에는 같은 문제가 남았다(GC-WR-02). |
| WR-07 | 18-22 | **부분 종결** | 비어 있지 않은 스냅샷 이후의 미스는 버린다. 등록 전략 0건 사용자와 재연결 구간은 남는다(GC-IN-02 · deferred-items 와 일치). |
| IN-01 · IN-02 · IN-03 | — | **미처리** | 옛 주석과 `isCancel` 이름, 더티 바 관찰이 그대로다(GC-IN-01). |

## Narrative Findings (AI reviewer)

## Critical Issues

### GC-CR-01: `dma_orders_price_check` 가 NULL 3값 논리 때문에 「세션 없는 가격 0」을 막지 못한다 — 18-18 검증 기록이 사실과 다르다

**File:** `supabase/migrations/20260922120000_dma_orders_cancel_price_zero.sql:47-48` (원 결함은 `20260921120000_dma_orders_modify_offhours.sql:91-92`)

**Issue:** CHECK 식은 `price > 0 OR (price = 0 AND (order_type = 'C' OR krx_session IN ('G2','G3')))` 이다. `krx_session` 은 nullable 이다(`20260921120000:66-67`, 「NULL = 서버 자동 판정」). `price = 0`, `order_type = 'N'`(또는 `'M'`), `krx_session IS NULL` 인 행을 넣으면 다음 순서로 평가된다.
- `krx_session IN ('G2','G3')` → **NULL**
- `'N' = 'C' OR NULL` → NULL
- `true AND NULL` → NULL
- `false OR NULL` → **NULL**

Postgres(SQL 표준)의 CHECK 는 식이 FALSE 일 때만 위반이고 **NULL 이면 통과**다. sqlite 로 같은 식을 재현했다. `(0,'N',NULL)` 과 `(0,'M',NULL)` 은 둘 다 insert 됐고 `(-1,'N',NULL)` 만 거부됐다.

결과는 다음과 같다.
1. DB 층은 「가격 0 은 취소 또는 G2/G3 신규만」이라는 규칙을 **한 번도 강제한 적이 없다.** 세션 없는 가격 0 신규·정정도 감사 행으로 들어간다. 지금은 relay zod · 조립기가 막고 있을 뿐이다. 마이그레이션 머리 주석(「정정('M') 가격 0 은 여전히 거부된다」)과 18-18 SUMMARY 의 T-18-82 완화 기록(「세션 없는 가격 0 신규·정정도 계속 거부된다」)은 사실이 아니다.
2. 라운드 1 CR-01 의 3번째 층도 오판이었다. `price = 0 AND krx_session IS NULL` 인 취소 행은 옛 CHECK 에서도 NULL 로 평가돼 **통과했다.** 그러므로 원격에 적용한 이번 마이그레이션(한쪽 문)은 목적상 불필요했다. 새로 넣은 `order_type = 'C'` 갈래는 NULL 세션 행에 대해 아무 효과가 없다.
3. 음수는 제대로 거부된다. `price = 0` 이 FALSE 라 AND 전체가 FALSE 가 되기 때문이다.

실돈 주문의 감사 테이블에서 최후 방어선이 선언과 다르게 동작하고, 그 검증 기록마저 틀렸다. 코드 층이 회귀하는 날(예: zod 를 느슨하게 고치는 날) DB 가 받쳐 주지 못한다.

**Fix:** NULL 을 명시적으로 FALSE 로 접는 후속 마이그레이션을 추가한다. 적용 전에 위반 행이 0건인지 조회로 확인한다.
```sql
-- 사전 확인 (0 이어야 한다)
SELECT count(*) FROM public.dma_orders
 WHERE price = 0 AND order_type <> 'C' AND (krx_session IS NULL OR krx_session NOT IN ('G2','G3'));

BEGIN;
ALTER TABLE public.dma_orders DROP CONSTRAINT dma_orders_price_check;
ALTER TABLE public.dma_orders ADD CONSTRAINT dma_orders_price_check
  CHECK (
    price > 0
    OR (price = 0 AND (order_type = 'C'
                       OR (order_type = 'N' AND krx_session IS NOT NULL AND krx_session IN ('G2','G3'))))
  );
COMMIT;
```
`COALESCE(krx_session IN ('G2','G3'), false)` 로 써도 된다. 신규만 G2/G3 를 허용하려면 `order_type = 'N'` 도 명시한다(현재 식은 `'M'` + G2/G3 + 0 도 통과시킨다). 로컬 Postgres 에 `(0,'N',NULL)` · `(0,'M',NULL)` · `(0,'M','G2')` 거부와 `(0,'C',NULL)` · `(0,'N','G3')` 통과를 확인하는 SQL 회귀를 둔다. 18-18 SUMMARY 의 T-18-82 문장은 R2 기록에서 정정한다(원 SUMMARY 는 덮어쓰지 않는다).

## Warnings

### GC-WR-01: 체결("E")→신규 매핑이 통보가 **명시한** `requestKind:"Modify"` 를 이겨, 실행된 정정의 감사 행이 영구 `timeout` 이 된다

**File:** `relay/src/ws/order-handler.ts:1205-1209` (매핑) · `:1276-1282` (하드 필터)

**Issue:** 두 축을 AND 로 건다. 통보가 `noticeType:"E"`, `requestKind:"Modify"`, `orgOrderNo:X` 이면 다음과 같이 된다.
- `byOrgOrderNo` 는 정정 대기 `[M]` 하나로 좁혀진다.
- `noticeTypeKind = "N"`, `wireRequestKind = "M"` 이 서로 어긋나 후보가 0건이 되고 `null` 을 돌려준다.

fbs 주석(`StockDMA.fbs:282-284`)에 따르면 `request_kind` 의 원천은 브로커 ExecutionReport 의 정정취소구분이다. 그러니 정정된 주문의 체결 통보가 "Modify" 를 싣는 것은 자연스러운 경우다. 게다가 이 통보는 원주문번호와 요청 종류를 **둘 다** 명시해서 가장 모호하지 않은 통보다. 그런데도 약한 휴리스틱(E 는 신규의 사건)이 이것을 버린다.

M 확인이 유실·지연돼 E 가 첫 통보가 되면 다음 일이 이어진다.
- 정정 행이 `timeout` 으로 기록된다. 새 주문번호를 모르므로 이후 이 행을 고칠 수단이 없다.
- 폼은 `blocked` 로 잠긴다.
- 사용자는 「결과 모름」을 본다.

18-19 는 이것을 「알고 받아들인 경계」로 적었다. 하지만 wire 값이 있을 때는 피할 수 있는 제한이다.

**Fix:** wire `requestKind` 가 화이트리스트 값이면 그것을 정본으로 쓰고, 통보 종류 매핑은 wire 가 비어 있을 때(구 서버)만 쓴다.
```ts
const kindAxis = wireRequestKind ?? noticeTypeKind;
const hard = byCancelNotice.filter((p) => kindAxis === null || p.kind === kindAxis);
```
취소확인 "C" + wire "Modify" 같은 모순을 계속 0건으로 두려면, `noticeType` 이 C/M 일 때만 두 값의 일치를 따로 요구한다. ws 테스트에 「정정 대기 + E(org=X, requestKind=Modify) → 정정 정산」 케이스를 추가한다.

### GC-WR-02: 취소 확인 중 부분체결이 나면 잔량보다 큰 옛 수량으로 취소가 나간다

**File:** `webapp/src/components/trading/card/manual-order-form.tsx:360-372` (스냅샷) · `:490-508` (정정만 재대조)

**Issue:** 취소 스냅샷의 `qty` 는 다이얼로그를 열 때의 `selected.unfilledQty` 다. 18-16 은 정정만 확정 직전에 재대조하고, 취소는 「지연은 자산 위험」이라는 이유로 재대조를 뺐다. 그런데 뺀 것은 **차단**만이 아니라 **갱신**이기도 하다.

다이얼로그가 열린 사이 부분체결로 잔량이 10 → 4 가 되면 `qty:10` 취소가 나간다. KRX 계열 브로커는 보통 「취소가능수량 초과」로 거부한다(gh-trade 가 클램프하는지는 이 저장소에서 확인하지 못했다). 거부되면 급락 국면에서 사용자가 다시 선택하고 다시 확인해야 한다. 코드가 피하려던 바로 그 취소 지연이다. relay `dupKey` 가 취소에서 수량을 보지 않으므로, 재시도는 앞선 대기가 정산된 뒤에야 가능하다.

**Fix:** 막지 말고 수량을 현재 잔량으로 내린다. 의미가 「잔량 전부」이므로 사용자 확인의 뜻과 같다.
```ts
if (req.kind === 'cancel' && selected !== null && selected.orderNo === req.orgOrderNo
    && selected.unfilledQty > 0 && selected.unfilledQty < req.qty) {
  sendReq = { ...req, qty: selected.unfilledQty };
}
```
`account-panel.tsx` 옛 취소 경로도 같은 규칙으로 맞춘다.

### GC-WR-03: 「결과 모름」 잠금이 여전히 카드 로컬이라 ✕ → 재추가로 풀린다 (WR-02 부분 종결)

**File:** `webapp/src/components/trading/card/manual-order-form.tsx:247` (`blocked` 로컬 상태) · `webapp/src/components/trading/workbench/trading-workbench.tsx:510-521` (미등록 카드 ✕ 즉시 제거)

**Issue:** 18-20 은 접기·펴기의 재마운트만 없앴다. 라운드 1 WR-02 가 지적한 근본(중복 체결 방지 잠금이 컴포넌트 수명에 묶여 있다)은 그대로다. 미등록 카드는 ✕ 한 번에 확인 없이 사라진다(`closeCard` → `removeCard`). 같은 종목을 종목 추가나 돌파 칩, 또는 미체결 선택(`cardForUnfilled` 가 새 카드를 붙인다)으로 다시 열면 잠기지 않은 새 폼이 생긴다. timeout 직후 「결과 모름」을 본 사용자가 카드를 닫고 다시 여는 것은 자연스러운 행동이다. 그 경로로 같은 주문을 다시 낼 수 있다.

**Fix:** `blocked` 를 작업대(또는 relay 컨텍스트)의 `accountNo|isin|exchange` 축 상태로 끌어올린다. 최소한 `blocked` 인 카드의 ✕ 는 확인 다이얼로그를 거치게 한다(「결과를 모르는 주문이 있어요 — 미체결을 확인하세요」).

### GC-WR-04: 등록된 VI 를 다른 계좌로 옮길 방법이 UI 에서 사라졌다 (CR-02 수정의 부작용)

**File:** `webapp/src/components/trading/workbench/vi-settings-rows.tsx:131-138` (`viRowAccountOf`) · `:432`

**Issue:** 서버 객체가 있으면(가동 중이든 중지 상태든) 모든 `vi.set` 이 `server.accountNo` 로 나간다. 중지(`run:false`)해도 설정 객체는 남으므로, 계좌 B 에 한 번 등록된 VI 는 이후 시작·수정·중지가 **영원히 B** 다. 옛 `vi-settings-card.tsx` 는 계좌 변경을 더티로 추적해 이전을 허용했다. 새 고지 문구(「수정·시작·중지는 이 계좌로 나가요」)는 사실을 말할 뿐 출구가 없다. 실돈 오계좌를 막는 방향은 맞다. 하지만 사용자가 의도적으로 A 로 옮기려 하면 이 화면에서는 할 수 없다.

**Fix:** 중지 상태(`run:false`)이고 `differs` 일 때 「상태줄 계좌({A})로 옮겨 시작」 동작을 명시적으로 두고, 확인 요약에 「계좌 B → A」를 표시한다. 가동 중에는 지금처럼 정본 계좌를 고정한다. 제품 결정이 필요하면 최소한 고지 문구에 이전 방법(예: My page)을 적는다.

## Info

### GC-IN-01: 사실과 달라진 주석 (라운드 1 IN-01~03 미처리 포함)

**File:** `relay/src/store/orders.ts:225-226` · `relay/src/dma/envelope.ts:33-34` · `relay/src/order/notice-status.ts:51` · `webapp/src/components/trading/card/strategy-card.tsx:41` · `relay/src/ws/order-handler.ts:201` · `webapp/src/components/trading/workbench/shared-panels.tsx:98-117`

**Issue:** 항목별로 다음과 같다.
- `orders.ts` 는 「DB CHECK 가 `price = 0` 을 이 값이 G2/G3 일 때만 받는다」고 적었다. 18-14 이후에는 취소 갈래도 있고, 실제로는 GC-CR-01 처럼 NULL 이면 통과다.
- `envelope.ts:33` 「정정(M)… 만들지 않는다」와 `notice-status.ts:51` 「정정은 v1 이 만들지 않지만」(R1 IN-01)이 그대로다.
- `strategy-card.tsx:41` 은 두 주석 줄이 한 줄로 붙어 「… 건넨다. *   접힌 카드는」이 됐다.
- `isCancel` 이름(R1 IN-02)은 `kind` 가 추가됐는데도 바뀌지 않았다.
- 더티 바 관찰(R1 IN-03)은 손대지 않았다. 18-20 이후 접힌 카드의 더티 바가 계속 떠 있게 되면서 발생 빈도가 오히려 늘었다.

**Fix:** 주석을 현재 규칙으로 고친다. `isCancel` 은 `refersOrg` 로 바꾸고, IN-03 은 더티 카드 수를 의존성에 넣는다.

### GC-IN-02: WR-07 보류 규칙의 남은 틈

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:236-238, 354-356, 402`

**Issue:** 틈은 셋이다.
1. 등록 전략이 0건이면(`limitChasers.length === 0`) 오래된 키가 무기한 보류된다. deferred-items 에 기록돼 있다.
2. 사용자가 전략을 모두 지워 목록이 다시 비면, 이후의 사이드바 미스가 다시 보류된다.
3. 재연결은 `reset` 이 아니라서 `limitChaserSnapSeq > 0` 과 이전 연결의 목록이 남는다. 새 64 가 오기 전의 미스는 낡은 목록 기준으로 버려진다.

**Fix:** deferred 의 relay 측 수정(`#limitChaserKnown`)을 반영한 뒤 `knowsRegistered` 를 「이번 연결에서 확정 64 를 받았는가」로 바꾼다. 인증(`state` ready) 전환 때 시퀀스 기준점을 다시 잡는다.

### GC-IN-03: 가격 0 = 시간외종가 표시 규칙과 정정 잠금 규칙이 다르다

**File:** `webapp/src/components/trading/card/manual-order-form.tsx:139-147` (잠금은 `board` 만) · `:562-565` (칩은 `board` 또는 `price === 0`) · `webapp/src/components/orderbook/order-confirm-dialog.tsx:156-167`

**Issue:** 18-16 은 「가격 0 ⇒ 시간외종가 원주문」을 표시 불변식으로 채택했다. 그런데 `modifyLockReason` 은 `board` 만 본다. `board === ''` 인데 가격이 0 인 행이 오면(구 서버 등) 칩은 「시간외종가」라고 말하는데 정정 버튼은 열린다. 채움 효과는 `selectedFillPrice > 0` 일 때만 가격을 채우므로 가격 칸에는 이전 값이 남는다. 서버가 최종 거부하겠지만, 화면 규칙이 두 벌이다.

**Fix:** `modifyLockReason` 에 `row.price === 0 → MODIFY_LOCK_OFFHOURS_ORDER` 를 추가하거나, 판정 함수 `isOffhoursOrder(row)` 하나를 칩 · 다이얼로그 · 잠금이 함께 쓴다.

### GC-IN-04: 같은 종목 카드 둘(WR-05) 이후의 ISIN 단위 잔재

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:558-565` (`priceOf`) · `:576-580` (합친 로그 `who`)

**Issue:** 두 곳이 아직 종목 단위다.
- `priceOf` 는 그 ISIN 의 **첫 카드** 거래소 시세로 잔고를 평가한다. KRX · NXT 카드가 함께 있으면 첫 카드 순서에 따라 평가 가격이 바뀐다.
- 합친 전략 로그의 `who` 는 종목명이라, 두 카드의 줄이 구분되지 않는다. 사이드바도 같은 문제가 있다(18-21 관찰).

**Fix:** `priceOf` 는 잔고 행의 거래소(없으면 KRX)를 명시하게 한다. `who` 에는 거래소나 계좌 꼬리를 붙인다(`{종목명} · NXT`).

### GC-IN-05: 계좌 채움 효과가 사용자 카드를 말없이 치운다

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:307-325`

**Issue:** 계좌 도착 전에 만든 카드(`X::KRX`, 펼침)가 있는 상태에서 같은 키의 등록 전략이 먼저 유입되면, 계좌를 채울 때 사용자가 연 카드가 사라지고 접힌 등록 카드만 남는다. `cardDirty` · `lastLogText` 항목도 정리되지 않는다(합산은 `cards` 기준이라 기능 영향은 없다). 발생 창은 좁다.

**Fix:** 치울 때 등록 카드를 `open: true` 로 바꿔 사용자 맥락을 잇는다. 정리는 `removeCard` 와 같은 경로를 쓴다.

### GC-IN-06: 확정 직전 재대조 문구가 선택 변경을 「미체결 아님」으로 말한다

**File:** `webapp/src/components/trading/card/manual-order-form.tsx:497-499`

**Issue:** `selected.orderNo !== req.orgOrderNo` 인 경우(다른 행이 선택됨)에도 `MODIFY_TARGET_GONE_TEXT`(「원주문이 더 이상 미체결이 아니에요」)를 띄운다. 원주문은 아직 미체결인데 사용자가 잘못 믿을 수 있다. 막는 동작 자체는 옳다.

**Fix:** `selected === null` 이면 지금 문구를 쓰고, 번호만 다르면 「선택한 원주문이 바뀌었어요 — 다시 확인해 주세요」를 쓴다.

---

_Reviewed: 2026-09-22T08:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
