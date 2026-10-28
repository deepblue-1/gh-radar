---
phase: 36-account-budget
reviewed: 2026-10-28T03:02:53Z
depth: standard
round: 2
diff_base: 91bc1cc5
files_reviewed: 8
files_reviewed_list:
  - relay/src/admin/admin-api.ts
  - relay/src/admin/admin-conn.ts
  - relay/src/admin/dispatcher.ts
  - relay/src/admin/types.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/index.ts
  - webapp/src/components/admin/account-editor.tsx
  - webapp/src/components/trading/me-client.tsx
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 36: 코드 리뷰 보고서 — 2라운드 (수정 회차 재검토)

**Reviewed:** 2026-10-28T03:02:53Z
**Depth:** standard (`git diff 91bc1cc5 HEAD` 중심 + 호출 경로 확인)
**Files Reviewed:** 8
**Status:** issues_found

## Summary

36-REVIEW.md 의 WR-01 · WR-02 · WR-03 · WR-05 수정(커밋 3feb08dc · e1f352a8 · c3a6bd74 · 22dd07c7)을 다시 봤다. WR-04 는 사용자 결정으로 미뤘으므로 다시 올리지 않는다.

수정별 판정은 이렇다.

| 원 지적 | 판정 | 근거 |
|---|---|---|
| WR-01 (안 고친 Enter → op 6) | **부분 종결** | 「서버 값 알고 · 불일치 없음」 경로만 닫혔다. 「확인 전」 상태에서는 안 고친 Enter 가 op 6(0) · op 7(0,0)를 보내 등록 서버 전부의 예수금 · 비용률을 **해제**한다(CR-01). 불일치 상태에서는 페이지를 연 시점의 값으로 덮는다(WR-01). |
| WR-02 (67 live 무조건 우선) | **종결** | `freshLiveBudget` 가 87 수신 시각과 견준다. `snapshotReceivedAtMs` 는 `currentSnapshot` 과 같은 ready · 세대 조건을 쓴다. hub 의 `#accountStateAtMs` 는 set · 세션 정리 · `clear` 세 곳에서 `#accountStates` 와 함께 움직인다. `refreshNames` 의 set(2525)은 같은 키를 덮는 것이라 시각을 보존해도 맞다. 잔여 위험은 IN-02 · IN-03 에 적었다. |
| WR-03 (되싣기가 다른 op 실패에 묶임) | **부분 종결** | code 실패는 이제 되싣는다. 그러나 timeout · offline 실패에서는 여전히 영구 누락된다. `firstSeen` 이 휘발성이라는 근본 원인이 남았다(WR-03). |
| WR-05 (/me priceOf 없음) | **부분 종결 + 회귀** | `priceOf` 는 넘긴다. 그런데 `/me` 에는 시세 구독이 하나도 없다. 그래서 직접 진입하면 여전히 undefined 다. SPA 로 이동해 오면 구독이 풀린 키의 **얼어붙은 옛 시세**로 잔고 평가 · 손익 · 주문가능을 계산한다(WR-02). |

## Critical Issues

### CR-01: 「확인 전」 상태에서 안 고친 칸에 Enter 만 쳐도 op 6(0) · op 7(0,0)가 등록 서버 전부에 나가 예수금 · 비용률이 해제된다 (WR-01 미종결)

**File:** `webapp/src/components/admin/account-editor.tsx:799-817, 819-845, 902, 939, 971` (`budgetKrwToSave` 583-590)
**Issue:** `summary.state !== "known"` 이면 칸은 `""`(placeholder 「—」)로 보인다. 그런데 이 상태는 87 을 모를 때만이 아니라, Express `fetchAccountCosts` 가 null 을 돌려줄 때도 생긴다(`server/src/routes/admin.ts:299-315`: relay 비200 · 2초 상한 초과 · throw). 이때 서버의 admin 연결은 멀쩡히 ready 일 수 있다. 이 상태에서 어드민이 예수금 칸을 클릭하고 Enter 만 치면 다음 순서로 흘러간다.
1. `budgetKrwToSave("", null)` 를 부른다. `serverKrw` 가 null 이라 표기 대조를 건너뛰고 `parseBudgetManwon("")` 를 그대로 쓴다. 결과는 `{ ok: true, krw: 0 }` 이다.
2. `known` 이 false 라 「변경 없음」 판정(809)을 통째로 건너뛴다.
3. `budget.run(0)` 이 실행된다. 등록 서버 전부에 op 6 `budget_krw = 0` 이 나가 **해제**된다.

수수료 · 매도세 칸도 똑같다. `parseCostPct("")` → `{ ok: true, ppm: 0 }` 이고, op 7 (0, 0)이 비용률을 해제한다. Enter 핸들러(902 · 939 · 971)는 `edited` 를 보지 않는다. 포커스 이탈만 `edited` 를 본다.

결과는 이렇다. 체결마다 서버가 조정해 온 현재 예수금(주문가능 한도의 원천)이 0 = 미설정으로 지워진다. 어드민은 그 직전 값을 화면에서 본 적이 없어 되돌릴 수도 없다. 이는 30 IN-06 이 IP/MAC 에 세운 원칙(「확인 전 계좌 — 모르는 87 을 빈 값으로 덮지 않는다」, 테스트 1381)을 비용 행이 어긴 것이다. 수정 보고서는 「빈 칸으로 보이는 경우 안 고친 Enter 로 해제를 보내지 않는다」 고 했지만, 그 말은 `known` 일 때만 참이다. 수정 전부터 있던 경로지만, WR-01(「안 고친 Enter 가 op 6 를 보내 서버 값을 덮는다」)의 같은 범주다. 영향은 더 크다(만원 미만 절삭이 아니라 전액 해제).
**Fix:** 「모르는 값」 은 빈 칸을 0 으로 해석하지 않는다. Enter 도 실제로 고쳤을 때만(또는 known 이면서 불일치 맞추기일 때만) 저장한다.
```tsx
const saveBudget = () => {
  if (budgetLocked) return;
  // 확인 전 + 안 고침 = 아무것도 보내지 않는다(30 IN-06 결 — 모르는 값을 빈 값으로 덮지 않는다)
  if (!budgetKnown && !budgetField.edited) { budgetField.settle(false); return; }
  ...
};
const saveFee = () => {
  if (feeLocked) return;
  if (!feeKnown && !feeField.edited && !taxField.edited) { feeField.settle(false); taxField.settle(false); return; }
  ...
};
```
회귀 테스트로 `(E1 empty)` 픽스처에서 세 칸 Enter → `setAccountBudget` · `setAccountFee` 호출 0 을 추가한다.

## Warnings

### WR-01: 불일치 상태(다중 등록 계좌의 체결 뒤 상시 상태)에서는 안 고친 Enter 가 여전히 op 6 를 fan-out 한다. 보내는 값은 개요를 받은 시점의 값이라, 그 뒤 체결 조정분을 주문 서버에서 되돌린다

**File:** `webapp/src/components/admin/account-editor.tsx:802, 809-817`
**Issue:** `budgetKrwToSave` 는 칸이 표기와 같으면 `summary.budgetKrw` 를 돌려준다. 그러면 `parsed.krw === summary.budgetKrw` 지만, `budgetMismatched` 면 「변경 없음」 을 건너뛰고 op 6 를 등록 서버 **전부**에 보낸다. 출처(유효 주문 서버)도 포함된다. 1라운드 IN-02 대로 체결 조정은 주문 서버에서만 일어난다. 그래서 다중 등록 계좌는 첫 체결 뒤로 `budgetMismatched` 가 늘 참이다. 따라서 UAT 2 의 기대(「고치지 않고 Enter → 변경 없음 · 요청 없음」)는 단일 서버 계좌나 갓 맞춘 계좌에서만 성립한다.

보내는 값에도 문제가 있다. 어드민 화면은 폴링하지 않고 `onChanged` 때만 재조회한다(`users-client.tsx:179`). 그래서 `summary.budgetKrw` 는 시트를 연 시점의 값이다. 그 사이 체결로 주문 서버 예수금이 바뀌었다면, 실수로 친 Enter 한 번이 주문 서버의 현재 한도를 옛 값으로 **되감는다**. 원 지적이 말한 「서버 간에 쌓인 차이도 조용히 덮인다」 는 이 경로로 남아 있다.
**Fix:** 둘 중 하나를 고른다.
- (a) Enter 저장을 `budgetField.edited` 일 때로 한정한다. 「맞추기」 는 칸을 실제로 고쳐 치는 동작으로만 한다.
- (b) 안 고친 칸의 맞추기라면 보내기 직전에 개요를 다시 받아 `summary.budgetKrw` 를 최신으로 만든다. 그리고 출처 서버는 fan-out 대상에서 뺀다(그 서버 값이 곧 보내는 값이므로). 후자는 PUT 에 대상 서버 목록을 받는 인자가 필요하다.

### WR-02: `/me` 는 시세를 구독하지 않는다 — `priceOf` 는 직접 진입이면 늘 undefined(D-11 불일치 지속)이고, 페이지 이동 뒤엔 구독이 풀린 옛 시세로 잔고 평가 · 주문가능을 계산한다 (WR-05 부분 종결 + 회귀)

**File:** `webapp/src/components/trading/me-client.tsx:347, 354, 533` · `webapp/src/lib/use-relay-socket.ts:1369-1401` · `webapp/src/components/orderbook/account-panel.tsx:431-448`
**Issue:** `holdingQuotePrice(quotes, isin)` 는 relay 컨텍스트의 `quotes` 맵만 읽는다. 이 맵은 `useRelaySubscription` 으로 구독한 키만 채워진다. 지우는 경로도 없다(q 프레임 병합만 있고 해제 시 제거가 없다 — `use-relay-socket.ts:1380-1384`). `RelayProvider` 는 루트 layout 에 있어 페이지를 옮겨도 살아 있다. 그런데 `/me` 의 어떤 탭도(`StrategyStatusCard` · `TodayOrdersCard` · `AccountPanel`) 시세를 구독하지 않는다. 그래서 결과가 둘로 갈린다.
1. **`/me` 로 바로 진입**(새로고침 · 앱 딥링크)하면 `quotes` 가 비어 `priceOf` 가 늘 undefined 다. 시장가 매수 미체결은 여전히 0 으로 세어진다. 작업대(카드가 그 종목을 구독)와 「주문가능」 이 다른 숫자가 된다. 원 지적(D-11 「계산 한 벌」)이 그대로 남는다. UAT 1 의 pass 는 작업대에서 넘어온 경로에서만 재현될 가능성이 크다.
2. **작업대에서 SPA 로 이동**하면 카드가 언마운트돼 구독이 풀린다. 그 키의 마지막 시세가 맵에 얼어붙은 채 남는다. 수정 전 `/me` 잔고 평가는 `priceOf` 가 없어 「—」 였다. 수정 뒤에는 그 옛 시세로 평가금액 · 손익 · 수익률을 **현재 값처럼** 그린다(신선도 표시 없음). 주문가능의 시장가 매수 금액도 옛 가격으로 센다. 이것이 수정이 만든 회귀다.
**Fix:** `/me` 잔고 탭이 그 계좌 보유 ISIN 과 시장가(price 0) 매수 미체결 ISIN 을 `level: "price"` 로 구독하게 한다. KRX · NXT 둘 다 구독해 `holdingQuotePrice` 의 폴백 순서와 맞춘다. 키 집합을 받는 다건 구독 훅을 두는 방식이 깔끔하다. 구독을 두지 않을 거라면, `priceOf` 를 「지금 구독 중인 키만」 으로 제한해 얼어붙은 값을 쓰지 않게 한다. 그리고 D-11 불일치는 문서로 남긴다.

### WR-03: 되싣기 누락은 timeout · offline 실패에서 여전히 영구적이다 — `firstSeen` 이 휘발성이라는 근본 원인이 남았다 (WR-03 부분 종결)

**File:** `relay/src/admin/dispatcher.ts:456-461` (`known` · `firstSeen` 418-420)
**Issue:** 수정은 `failure.outcome === "failed"` 만 되싣기에 넣었다. 그런데 원 지적의 메커니즘은 실패 종류와 무관하다. 「op 3 ok → 이 호출이 끝나기 전에 되싣기가 빠짐 → 다음 reconcile 에선 그 계좌가 87 에 있어(`known`) 다시 firstSeen 이 안 됨 → 그 서버 예수금 · 비용률 0 고정」 이다. 이 메커니즘은 timeout · offline 에도 똑같이 성립한다. 예를 들어 같은 계획에서 계좌 A 의 op 3 은 ok 였고, 뒤의 계좌 B op 4 가 86 미도착으로 `timeout` 이 됐다고 하자. 그러면 A 는 영영 되싣기를 받지 못한다. 주석의 「연결 실패(timeout · offline)만 건너뛴다 — 보내도 닿지 않는다」(457-458)는 timeout 에 대해 사실이 아니다. timeout 은 86 이 5초 안에 오지 않았다는 뜻일 뿐이고, 연결은 살아 있을 수 있다. 결국 relay 재기동 · admin 재접속 · 프로세스 중단에서도 같은 영구 누락이 생긴다.
**Fix:** 되싣기 트리거를 「이번 호출에서 처음 본 계좌」 에서 87 상태 기반의 멱등 조건으로 바꾼다. reconcile 마다 이 서버 87 의 그 계좌가 (budget 0, fee 0, tax 0)이고 출처 서버 값이 (0,0,0)이 아니면 `#reloadCosts` 를 부른다. 이러면 어느 실패 뒤든 다음 「다시 반영」 이 스스로 복구한다.
```ts
for (const op of p.ops) { /* ... */ }
// firstSeen 대신: 계획에 있던 이 서버 active 계좌 중 87 비용이 전부 0 인 것
const zeroed = intentAccountsOnThisServer.filter((no) => isZeroCost(latest87, no));
if (opts.reloadCostsFrom !== undefined && failure?.outcome !== "offline") {
  for (const accountNo of zeroed) await this.#reloadCosts(serverKey, admin, accountNo, opts.reloadCostsFrom);
}
```

## Info

### IN-01: 실패 경로에도 되싣기가 붙어, 마감 접기가 실제 code 실패를 「응답 없음」 으로 가릴 수 있다 (1라운드 IN-06 확장)

**File:** `relay/src/admin/dispatcher.ts:459-461` · `#answerBy` 642-690
**Issue:** 종전에는 code 실패(예: op 4 BUSY 9)가 나면 `#applyServer` 가 바로 돌아왔다. 이제는 새 계좌마다 op 6 · op 7 을 각각 최대 5초씩 기다린 뒤에 돈다. 그 사이 10초 마감이 지나면 그 서버 결과는 응답에서 `timeout`(「응답 없음」)으로 접힌다. 어드민은 실제 원인(「BUSY」 서버 message)을 보지 못하고, 같은 유저 `#serial` 줄도 그만큼 길게 잡힌다. 실제 결과는 뒤에 기록되니 정확성 결함은 아니고 표시 품질 문제다.
**Fix:** `failure !== null` 이면 되싣기를 `void` 로 떼어 낸다(결과 확정 뒤 비동기 · warn 로깅). 아니면 마감 잔여 시간이 `ADMIN_COMMAND_TIMEOUT_MS × 2` 미만일 때 건너뛴다.

### IN-02: `freshLiveBudget` 는 벽시계(`Date.now()`) 두 개를 견주고, 동률이면 live 를 고른다

**File:** `relay/src/admin/types.ts:222-226` · `relay/src/hub/subscription-hub.ts:3375` · `relay/src/admin/admin-conn.ts:475`
**Issue:** 수신 시각은 둘 다 `Date.now()` 다. NTP 가 시계를 뒤로 맞추면 87 이 더 최근인데도 live 가 이기거나 그 반대가 될 수 있다. 같은 ms 에 도착하면 `>=` 때문에 live 가 이긴다. 저장 직후 옛 67 이 같은 ms 에 들어오면 WR-02 증상이 다시 난다. 확률은 낮다.
**Fix:** 단조 시계(`performance.now()` 또는 프로세스 전역 증가 시퀀스)로 두 수신 시점을 찍는다. 동률은 87 쪽(명시 쓰기 결과)으로 기울인다.

### IN-03: WR-02 의 정확성은 「op 5 87 = 체결 조정이 반영된 현재 값」 계약 한 줄에 전적으로 기댄다 — 실제로 live 는 15초 창 안에서만 쓰인다

**File:** `relay/src/admin/admin-api.ts:870-905, 926-939`
**Issue:** `GET /account-costs` 는 응답 전에 서버마다 op 5 를 다시 조회한다(15초 스로틀). 그래서 재조회가 성공하면 87 이 거의 늘 67 보다 최근이고, 화면 예수금의 실제 원천은 대부분 87 이 된다(`budgetSource: "snapshot"`). 인박스 261027-account-pnl 의 「다음 87(op 5 등)은 현재 값을 싣는다」 가 맞으면 문제가 없다. 하지만 gh-trade 가 87 에 설정값(체결 조정 전)을 싣는 쪽으로 바뀌면 D-05 「현재 예수금」 이 아무 경고 없이 설정값으로 돌아간다. 이 계약을 지키는 테스트나 로그가 relay 쪽에 없다.
**Fix:** 같은 계좌에서 live 와 그보다 최근인 87 의 값이 다르면 debug/warn 1줄(서버 · 마스킹 계좌 · 두 값)을 남겨 계약 어긋남을 관측할 수 있게 한다. `docs/inbox` 계약 문구를 `freshLiveBudget` JSDoc 에 출처로 고정해 둔다(현재는 인박스 날짜만 언급).

---

_Reviewed: 2026-10-28T03:02:53Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
