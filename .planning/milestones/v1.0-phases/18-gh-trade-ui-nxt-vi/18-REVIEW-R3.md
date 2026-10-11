---
phase: 18
phase_dir: 18-gh-trade-ui-nxt-vi
round: R3
reviewed: 2026-09-22T10:49:55Z
depth: deep
scope: "git diff 25a3746..HEAD -- . ':!.planning' (plans 18-24..18-31)"
files_reviewed: 34
files_reviewed_list:
  - packages/shared/src/relay.ts
  - relay/src/dma/envelope.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/order/notice-status.ts
  - relay/src/store/orders.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/order-handler.ts
  - relay/tests/fanout.test.ts
  - relay/tests/strategy-hub.test.ts
  - relay/tests/ws-order.test.ts
  - scripts/verify-dma-orders-price-check.sh
  - supabase/migrations/20260922180000_dma_orders_price_check_null_safe.sql
  - supabase/tests/dma_orders_price_check.test.sql
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
  - webapp/src/components/orderbook/__tests__/order-confirm-dialog.test.tsx
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/orderbook/order-confirm-dialog.tsx
  - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
  - webapp/src/components/trading/__tests__/shared-panels.test.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/card/manual-order-form.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/workbench/shared-panels.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/vi-settings-rows.tsx
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/use-relay-socket.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 18: 코드 리뷰 보고서 — 갭 클로징 라운드 R3 (18-24 ~ 18-31)

**리뷰 시각:** 2026-09-22T10:49:55Z
**깊이:** deep (전 파일 standard 리뷰 + relay 통보 정산 → 기록 경로, lc.snap 게이트 → 리듀서 → 작업대 포커스 보류, 결과 모름 잠금 → 카드 → 폼 교차 추적)
**리뷰 파일 수:** 34 (소스 19 · 테스트/e2e/SQL 회귀 15)
**상태:** issues_found

## 요약

R2(`18-REVIEW-R2.md`)의 GC-CR-01 · GC-WR-01~04 · GC-IN-01~06 과 deferred relay `lc.snap` 항목을 닫으려는 8개 플랜의 변경을 리뷰했다. 범위는 `25a3746..HEAD` 에서 `.planning` 을 뺀 것이다.

직접 돌려 본 검증은 다음과 같다.
- relay `vitest`: 20 files · 523 passed
- webapp `vitest`: 92 files · 1454 passed · 1 skipped
- webapp `tsc --noEmit`: 오류 0

pgTAP 러너(`scripts/verify-dma-orders-price-check.sh`)는 로컬 Postgres 이미지가 필요해서 이번 리뷰에서는 돌리지 않았다. 대신 SQL 을 정적으로 확인했다. 거부 단언 6건은 각각 **통과 단언과 가격·세션만 다른 행**이라, 다른 CHECK 때문에 우연히 23514 가 나서 통과하는 거짓 양성이 구조적으로 막혀 있다.

R2 findings 11건과 deferred 1건은 코드 층에서 모두 의도대로 반영됐다. 새 CHECK 식에는 NULL 로 평가되는 갈래가 남지 않는다. `price` · `order_type` 은 NOT NULL 이고 `krx_session` 비교는 `COALESCE(…, false)` 로 감쌌다. 사전 확인 WHERE 도 같은 null-safe 식의 부정이다. relay `lc.snap` 게이트 → webapp 리듀서 기준점 → 작업대 `knowsRegistered` 세 층은 콜드 세션 · 재연결 · 빈 목록 경로 모두에서 서로 맞는다.

Critical 은 없다. 새로 확인된 결함은 둘이다.
- **R3-WR-01:** GC-WR-01 수정으로 「체결 E(Modify)가 정정 대기를 먼저 정산」하는 경로가 열렸다. 그 뒤 늦게 도착한 정정확인 "M" 이 기록 경로로 가서 감사 행 상태를 `filled`/`partially_filled` → `accepted` 로 **되돌린다.** 상태 갱신에 단조성 가드가 없다.
- **R3-WR-02:** 결과 모름 잠금이 `/trading` 페이지 수명에 묶였다. ✕ → 재추가 탈출은 닫혔지만, 다른 페이지로 갔다 돌아오면 잠금이 풀린다. 같은 종목을 호가 탭에서 주문하는 경로도 잠금을 보지 않는다. `RelayProvider` 는 루트 레이아웃에 있으므로 잠금을 앱 수명으로 올릴 자리가 이미 있다.

### R2 findings 종결 판정

| R2 ID | 플랜 | 판정 | 근거 |
|-------|------|------|------|
| GC-CR-01 | 18-24 · 18-29 | **종결** | `20260922180000_…null_safe.sql:659-663` 의 식은 NULL 갈래가 없다. 신규(`order_type = 'N'`)만 G2/G3 가격 0 을 연다. `(0,'M','G2')` 도 거부된다. pgTAP 회귀는 거부 6 · 통과 5 · 단일성 1 이다. 원격 적용(사용자 「지금 적용」 선택, 위반 행 0)은 18-29 SUMMARY 기록으로만 확인했다. 이 리뷰에서 원격 DB 에 접속하지는 않았다. `orders.ts:226-228` 주석도 새 규칙과 맞는다. |
| GC-WR-01 | 18-25 | **종결 (신규 결함 동반)** | `order-handler.ts:1311-1320` 에서 wire `requestKind` 가 정본이고, 통보 종류는 허용 집합(`ANSWERABLE_KINDS_BY_NOTICE_TYPE`)으로만 건다. ws ㊸ 와 narrowPending (f)~(i) 가 green 이다. 다만 E 가 먼저 정산한 뒤 도착하는 M 이 상태를 되돌린다(R3-WR-01). |
| GC-WR-02 | 18-27 | **종결** | `cancelQtyAtConfirm`(`manual-order-form.tsx:153-161`)을 폼(`:585-588`, live = `liveSelected`)과 계좌 패널(`account-panel.tsx:374-375`, live = `account.unf`)이 함께 쓴다. 수량을 내리기만 하고 막지는 않는다. |
| GC-WR-03 | 18-30 | **부분 종결** | ✕ → 재추가 · 접기 · 계좌 전환 · 게이트 전환으로는 이제 잠금이 풀리지 않는다(`trading-workbench.tsx:341-347`, e2e GC5). 페이지 이탈 → 복귀와 호가 탭 경로는 남아 있다(R3-WR-02). |
| GC-WR-04 | 18-28 | **종결** | 중지 ∧ 계좌 다름일 때만 「상태줄 계좌로 옮겨 시작」이 나온다. 확정 직전에 `viMoveTargetOf` 로 다시 판정하고(`vi-settings-rows.tsx:659-666`), `submit` 에 가동 중 차단 두 번째 겹(`:459`)이 있다. 요약에는 B → A 가 나온다. |
| GC-IN-01 | 18-24 · 18-25 · 18-31 | **종결** | `orders.ts` · `envelope.ts:33-35` · `notice-status.ts:51` 주석을 고쳤다. `strategy-card.tsx:41-42` 의 붙은 줄을 떼어 냈다. `isCancel` → `refersOrg` 로 바꿨고 잔여 참조는 0 이다(`grep`). 더티 바 재측정은 `dirtyBarCount` 의존성으로 바뀌었다(`shared-panels.tsx:135`). |
| GC-IN-02 | 18-26 | **종결** | relay 는 64 를 받은 뒤에만 인증 경로에서 `lc.snap` 을 보낸다(`fanout.ts:605-607`, `hub:1102`). 세션 교체 · closeAll 때 지운다. 리듀서는 ready 전환 시 0 으로 되돌린다(`use-relay-socket.ts:485-486`). `knowsRegistered = snapSeq > 0` 이다. ①0건 사용자 ②전부 삭제 ③재연결 세 틈이 모두 닫혔다. |
| GC-IN-03 | 18-27 | **종결** | 판정 지점이 `isOffhoursOrder` 하나다(`order-confirm-dialog.tsx:87-89`). 칩 · 다이얼로그 · 옛 취소 요약 · `modifyLockReason`(`manual-order-form.tsx:199`)이 모두 이것을 쓴다. 전제 범위에 대한 관찰은 R3-IN-04 에 있다. |
| GC-IN-04 | 18-31 | **종결** | `holdingQuotePrice` 는 KRX 우선, 없으면 NXT 로 폴백한다. 카드 순서와 무관하다. 합친 로그 `who` 와 사이드바가 `exchangeLabeledName` 을 공용으로 쓴다. |
| GC-IN-05 | 18-31 | **종결** | `fillAccountCards` 가 펼침을 잇고, `forgetCardState` 로 정리한다. 효과 안의 이중 계산에는 잔여 관찰이 있다(R3-IN-03). |
| GC-IN-06 | 18-27 | **종결** | 문구가 세 갈래다: 선택 없음 · 번호 다름(`MODIFY_TARGET_CHANGED_TEXT`) · 잔량 감소(`manual-order-form.tsx:566-574`). |
| deferred relay `lc.snap` (18-22) | 18-26 | **종결 (배포 순서 조건부)** | 코드는 닫혔다. 단 webapp 이 먼저 배포되면 옛 relay 의 콜드 `lc.snap []` 이 확정으로 읽혀 D-02 가 회귀한다. HEAD 는 origin 보다 32 커밋 앞서 있고 아직 push 되지 않았다(R3-IN-05). |

## Narrative Findings (AI reviewer)

## Warnings

### R3-WR-01: 체결 E(Modify)가 정정 대기를 먼저 정산한 뒤 늦게 온 정정확인 "M" 이 감사 행 상태를 `accepted` 로 되돌린다

**File:** `relay/src/ws/order-handler.ts:1311-1320` (새 축) · `:489-516` (`recordUnmatched` 수동 분기) · `relay/src/order/notice-status.ts:50-52` (`M → "accepted"`) · `relay/src/store/orders.ts:890` (상태를 그대로 덮어씀)

**Issue:** GC-WR-01 수정이 겨냥한 시나리오는 「M 확인이 **유실·지연**되고 E 가 첫 통보」다. 유실이 아니라 **지연**이라면 순서는 다음과 같다.
1. E(org X, `requestKind:"Modify"`, qty 10 = 전량)가 정정 대기를 정산한다. `finish` 가 정정 행을 `order_no = Y`, `status = "filled"`(또는 `partially_filled`), `filled_qty` 로 갱신한다.
2. 늦게 온 M 확인에는 더 이상 대기가 없다. 그래서 `recordUnmatched` → `originKind === "manual"` → `findIdByOrderNo(userId, Y)` 로 방금 채운 정정 행을 찾는다.
3. `enqueueUpdate({ ...patchOf(M), orderRowId })` 가 실행된다. `statusOf(M) = "accepted"` 이고 `filledQtyOf(M) = undefined` 라서, **`status` 만 `accepted` 로 덮이고 `notice_type` 은 `M` 이 된다.**

`rowPatchOf` 에도 DB 에도(트리거 없음) 상태 단조성 가드가 없다. 결과적으로 **전량 체결된 정정이 감사 기록에 「접수」로 영구히 남는다.** 추가 체결 통보가 없으면 되돌릴 사건도 없다. 18-25 이전에는 이 순서에서 정정 행이 `timeout` 이었고 `order_no` 가 비어 있어 M 이 붙을 행이 없었다. 그래서 이 되돌림은 **GC-WR-01 수정이 새로 연 경로**다. M 통보의 `orderNo` 가 원주문 X 라면 `findIdByOrderNo(X)` 가 **원주문 행**을 `accepted` 로 덮는다. 어느 쪽이든 오기록이다. ws ㊸ 는 E 한 건에서 멈추므로 이 순서를 보지 못한다.

**Fix:** 기록 경로 갱신에 상태 단조성을 둔다. 최소한 「종결·체결 상태를 접수로 내리지 않는다」는 규칙이 필요하다.
```ts
// notice-status.ts
const RANK: Record<DmaOrderStatus, number> = {
  requested: 0, accepted: 1, partially_filled: 2, filled: 3, cancelled: 3, rejected: 3, timeout: 0,
};
// recordUnmatched 수동 분기: 기존 행 상태를 함께 조회해
if (patch.status !== undefined && RANK[patch.status] < RANK[existing.status]) {
  patch = { ...patch, status: undefined }; // notice_type·message 만 남기거나 통째로 생략
}
```
DB 쪽에서 막으려면 `UPDATE … WHERE status NOT IN ('filled','cancelled','rejected') OR excluded rank ≥ …` 조건부 갱신을 쓴다. 회귀는 ws ㊸ 뒤에 「이어서 M(org X, orderNo Y) 도착 → 행 상태가 `filled` 로 유지되는지」를 붙인다.

### R3-WR-02: 결과 모름 잠금이 `/trading` 페이지 수명이라, 페이지 이탈 → 복귀나 호가 탭에서 같은 주문을 다시 낼 수 있다 (GC-WR-03 부분 종결)

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:333-347` (잠금 집합 = `TradingWorkbench` 로컬 state) · `webapp/src/app/layout.tsx:46` (`RelayProvider` 는 루트)

**Issue:** 18-30 은 R2 가 지적한 ✕ → 재추가 탈출을 닫았다. 그러나 잠금의 수명 경계를 카드에서 **페이지**로 한 칸 올렸을 뿐이다. 설계 문구 그대로 「`/trading` 을 떠날 때(언마운트) 풀린다」.
- 사이드바로 `/me` 나 종목 상세에 갔다가 돌아오면 `TradingWorkbench` 가 다시 마운트되고, 잠금 집합은 빈 `Set` 으로 새로 만들어진다. 결과 모름을 본 사용자가 「미체결을 확인하라」는 안내를 따라 `/me` 미체결을 보러 가는 것은 자연스러운 동선이다. 그 동선이 바로 탈출 경로다.
- 종목 상세의 호가 탭 폼은 작업대 잠금을 아예 읽지 않는다. 설계상 「폼 로컬 규칙 그대로」다.

두 경로 모두 R2 GC-WR-03 이 지적한 실돈 중복 체결 위험이 그대로 남는다. 반면 `RelayProvider` 는 루트 레이아웃(앱 수명 · 세션 단위)에 있어서, 잠금을 거기 두는 비용은 이 플랜의 prop 배선과 거의 같다.

**Fix:** 잠금 집합을 `RelayProvider` 컨텍스트로 올린다. 키는 지금과 같은 `strategyKey(isin, accountNo, exchange)` 를 쓴다.
```ts
// relay-provider.tsx
const [resultUnknownKeys, setResultUnknownKeys] = useState<ReadonlySet<string>>(() => new Set());
const markResultUnknown = useCallback((k: ResultUnknownKey) => { … }, []);
// value 에 { resultUnknownKeys, markResultUnknown } 추가 — 로그아웃(reset)에서만 비운다
```
작업대 카드와 호가 탭 `ManualOrderForm` 이 둘 다 이 값을 읽게 한다. 해제 규칙은 「로그아웃 · 새로고침」 한 문장이 된다. 페이지 단위 해제를 제품 결정으로 유지할 거라면, 최소한 이 탈출 경로를 D-27 기록과 `CLOSE_UNKNOWN_BODY` 문구(「다시 열어도 잠긴 채」)에 반영해 사용자가 잘못 믿지 않게 한다.

## Info

### R3-IN-01: 카드 폼의 **취소·정정** timeout 도 그 키의 신규 매수·매도를 페이지 수명 동안 잠근다

**File:** `webapp/src/components/trading/card/manual-order-form.tsx:594-599` · `trading-workbench.tsx:344-347`

**Issue:** `onResultUnknown` 은 요청 종류와 무관하게 부른다. 중복 체결 위험이 있는 것은 신규(와 정정)다. 취소 결과 모름은 재시도해도 무해하다(서버가 이미 취소됐으면 거부한다). 그런데 이제 취소 timeout 한 번이 그 계좌 · 종목 · 거래소의 4버튼을 페이지를 떠날 때까지 잠근다. 로컬 `blocked` 시절에는 ✕ 로 풀렸던 제약이 이제 더 오래 간다. 공용 패널 미체결의 취소 버튼(`account-panel.tsx:431-452`)은 잠금과 무관하게 살아 있어서, 위험 축소 동작(취소)은 막히지 않는다.

**Fix:** 잠금 키 등록을 `req.kind === 'new'`(필요하면 `'modify'` 까지)로 한정하거나, 취소 timeout 은 로컬 결과 배너만 남기도록 한다. 제품 결정이라면 D-27 에 명시한다.

### R3-IN-02: 결과 도착 전(전송 중 ≤5초)의 ✕ → 재추가는 잠기지 않은 새 폼을 준다

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:625-640` (`closeCard` 는 잠금 집합만 본다) · `manual-order-form.tsx:590-599`

**Issue:** 잠금은 timeout **이후**에만 등록된다. 전송 중(`submitting`)인 카드를 ✕ 로 닫고(확인 다이얼로그 없음) 같은 종목을 다시 추가하면, 새 폼은 `submitting=false` · 잠금 없음 상태로 선다. 첫 주문 결과가 나오기 전에 두 번째 주문을 낼 수 있다. timeout 뒤에는 안정 콜백 덕분에 잠금이 (닫힌 카드 대신) 새 카드에 걸린다. 창은 좁지만 결과 모름 잠금이 막으려는 것과 같은 종류의 중복이다.

**Fix:** 전송 시작 시 키를 「진행 중」 집합에 넣고, 결과(접수 · 거부)가 오면 빼고 timeout 이면 결과 모름으로 옮긴다. 폼 잠금은 둘의 합집합으로 판정한다.

### R3-IN-03: 계좌 채움 효과가 치운 카드를 `cardsRef` 로, 남길 카드를 업데이터 `prev` 로 따로 계산한다

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:609-613`

**Issue:** `forgetCardState(fillAccountCards(cardsRef.current, accountNo).dropped)` 는 마지막 커밋된 카드로 계산한다. `setCards(prev => fillAccountCards(prev, accountNo).next)` 는 같은 배치에 쌓인 갱신(예: 같은 커밋의 등록 전략 유입 효과가 넣은 카드)을 포함한 `prev` 로 계산한다. 둘이 갈리면 업데이터가 치운 카드의 더티 키와 `lastLogText` 가 정리되지 않는다. 합산은 `cards` 기준이라 기능 영향은 없다. 게다가 `accountNo` 와 `lc.snap` 은 서로 다른 프레임이라 같은 배치에 들 가능성은 낮다. 다만 「같은 함수로 다시 읽는다」는 주석이 보장하는 것보다 약하다.

**Fix:** 치운 id 를 업데이터 안에서 ref 로 넘긴 뒤 효과 끝에서 정리하거나(업데이터 순수성은 ref 쓰기만 허용), `cardDirty` 정리를 `cards` 기준 파생(존재하지 않는 id 무시)으로 바꿔 정리 자체를 없앤다.

### R3-IN-04: `isOffhoursOrder` 의 「가격 0 ⇒ 시간외종가」 전제는 relay 발 주문에만 성립한다

**File:** `webapp/src/components/orderbook/order-confirm-dialog.tsx:74-89` · `manual-order-form.tsx:199`

**Issue:** 근거 2는 「가격 0 은 DB · zod 불변식상 G2/G3 원주문에서만 나온다」이다. 그런데 미체결 목록(`RelayAccountState.unf`)은 게이트웨이 계좌 상태라서 **같은 계좌의 다른 단말**(세션 합류 · WinForms) 주문도 싣는다. 게이트웨이 스키마는 시장가를 갖고 있으므로, 다른 단말의 시장가 미체결(단일가 · VI 구간에서 잔존 가능)도 가격 0 으로 온다. 그러면 칩 · 요약이 「시간외종가」라고 잘못 말하고, 정정 잠금 사유도 틀린 문구(`MODIFY_LOCK_OFFHOURS_ORDER`)로 뜬다. 잠그는 방향 자체는 보수적이라 해가 없다.

**Fix:** 근거 주석을 「relay 발 주문 한정 · 타 단말 시장가도 가격 0」으로 좁힌다. 가능하면 서버에 주문유형 필드를 요청해 `board` 가 빈 가격 0 행에는 「가격 없음」이라는 중립 표기를 쓴다.

### R3-IN-05: 18-26 webapp 변경은 relay 배포 **뒤에만** 나가야 한다 — 현재 32 커밋 미push

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:321-323` · `webapp/src/lib/use-relay-socket.ts:485-486`

**Issue:** `knowsRegistered = snapSeq > 0` 은 「relay 가 64 전에는 `lc.snap` 을 보내지 않는다」는 새 계약에 기댄다. 옛 relay 는 콜드 세션 인증 직후 `lc.snap []` 을 보낸다. 그러면 snapSeq 가 1 이 되어 `?focus=` 가 진짜 목록 도착 전에 버려진다(D-02 회귀). 18-26 SUMMARY 가 이 순서를 적어 두었고, 프로젝트 규칙(「push 자체가 webapp 프로덕션 배포 — relay 먼저」)과도 같다. 코드 결함은 아니다. 다만 R3 의 모든 webapp 변경이 같은 push 에 묶여 있으므로 이 게이트를 놓치면 회귀가 바로 프로덕션에 나간다.

**Fix:** relay 를 배포하고 인증 경로 로그(`hasLimitChaserList`)를 확인한 뒤에 push 한다. 순서를 코드로 보강하려면, 인증 ACK 에 relay 계약 버전 필드를 싣고 옛 relay 이면 `knowsRegistered` 를 옛 규칙(빈 목록은 모호)으로 되돌리는 방법이 있다.

---

_Reviewed: 2026-09-22T10:49:55Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
