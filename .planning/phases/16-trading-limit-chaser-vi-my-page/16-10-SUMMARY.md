---
phase: 16-trading-limit-chaser-vi-my-page
plan: 10
subsystem: webapp
tags: [order, wss, relay, account-panel, mobile-reflow, e2e]
requires:
  - "16-03: RelayInbound order.new/order.cancel · RelayOutbound order.result 와이어 계약"
  - "16-08: relay wss 주문 핸들러 (rid 상관 · 5초 결과 3분류 · ISIN→code/market 해석)"
  - "16-09: RelayProvider 전역 컨텍스트 + 연결 훅의 sendOrder(프레임) 대기 맵"
provides:
  - "useRelayContext().sendOrder(req): {kind:'new'|'cancel'} 요청 → rid 생성 → order.result 상관"
  - "OrderPanel: 신규 주문이 wss 단일 경로 (isin 키)"
  - "AccountPanel: 취소가 wss + 그 행의 ISIN 키"
  - "AccountPanel: 모바일 2줄 카드 행(.rlist, <1280px) — 3표면 공용"
  - "AccountPanel: 계좌 전용 모드(종목 축 없음) — My page 가 계좌마다 1벌 렌더"
  - "AccountPanel: originTag prop (상따/VI 출처 태그 슬롯)"
  - "E2E 픽스처: pushAccountState(66/67) · orderInserts() · stocks/dma_orders Supabase 라우트"
affects:
  - "16-11 이후 상따·VI·My page 3표면 (계좌 패널을 그대로 소비한다)"
  - "16-16 (REST /api/orders 라우트·createOrder 제거 — 호출부가 이미 0건이다)"
tech-stack:
  added: []
  patterns:
    - "요청 객체 → 와이어 프레임 번역을 Provider 한 곳에 두고 rid 생성처를 단일화"
    - "실패를 예외가 아니라 결과값으로 표면화 (호출부에 catch 분기를 만들지 않는다)"
    - "표/카드 두 트리 + CSS 브레이크포인트 (JS 는 뷰포트를 재지 않는다)"
    - "잘림 E2E 는 잎 요소 getBoundingClientRect().right 대조 (행 폭·scrollWidth 는 침묵한다)"
key-files:
  created: []
  modified:
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/__tests__/relay-provider.test.tsx
    - webapp/src/components/orderbook/order-panel.tsx
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/orderbook/__tests__/order-panel.test.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
    - webapp/src/components/stock/stock-orderbook-section.tsx
    - webapp/e2e/fixtures/relay.ts
    - webapp/e2e/specs/orderbook.spec.ts
decisions:
  - "sendOrder 를 컨텍스트 경계에서 한 번 더 감싼다 — rid 생성처가 하나여야 relay 의 중복 rid 거부(T-16-10)에 걸리지 않는다"
  - "대기 맵·타임아웃·단절 정산은 연결 훅에 그대로 둔다 — 소켓과 같은 곳에 있어야 「끊기면 전량 결과 모름」이 한 경로다"
  - "형식 오류는 보내지 않고 rejected 로 resolve — relay 거부와 「나가지 않았다」가 화면에서 구분되게"
  - "「code 없으면 취소 불가」 제약 폐기 — 취소 키가 ISIN 이 된 이상 사실이 아닌 제약이었다"
  - "코드 기반 guidanceFor 를 제거하고 rejectDetail 로 교체 — 없어진 코드 체계를 흉내 내면 세션 문제에 「가격·수량을 확인」이 붙는다"
  - "표/카드 두 트리를 모두 DOM 에 두고 CSS 로 가른다 — jsdom 조회는 트리를 좁혀서 한다"
  - "계좌 전용 모드에서는 탭을 없애고 ≥1280 에서 2열(R4) — My page 는 미체결·잔고를 함께 본다"
metrics:
  duration: ~55m
  tasks: 3
  commits: 3
  completed: 2026-09-08
---

# Phase 16 Plan 10: 주문 wss 이관 + 계좌 패널 3표면 공용화 Summary

브라우저의 **신규 주문·취소를 REST 에서 wss 단일 경로로** 옮기고(D-02), 미체결·잔고 패널을 상따·VI·My page 3표면이 그대로 쓸 수 있게 넓혔다(모바일 2줄 카드 행 + 계좌 전용 모드). 「결과 모름」 규율은 문구 한 글자까지 보존했고, E2E 가 그 규율과 모바일 잘림 0을 실제 브라우저에서 잠근다.

## 무엇을 만들었나

### 1. `RelayProvider.sendOrder` — 요청 → 프레임 번역기 (`176c6b6`)

16-09 가 남긴 연결 훅의 `sendOrder(frame)` 위에 **컨텍스트 경계의 한 겹**을 얹었다.

| 층 | 시그니처 | 소유 |
|---|---|---|
| `useRelayConnection` (16-09) | `(msg: RelayOrderNewMsg\|RelayOrderCancelMsg) => Promise<RelayOrderResultMsg>` | 대기 맵 · 백스톱 타이머 · 단절 정산 |
| `useRelayContext` (16-10) | `(req: RelayOrderRequest) => Promise<RelayOrderResultMsg>` | `rid` 생성 · 프레임 조립 · 형식 검사 |

`RelayOrderRequest` 에는 **`rid` 가 없다.** 상관 키를 호출부가 만들면 두 패널이 같은 값을 만들거나 재사용할 여지가 생기고, relay 는 같은 `rid` 를 중복 요청으로 거부한다(T-16-10). 생성처를 하나로 묶어 그 사고를 구조적으로 없앴다.

- `market` 은 싣지 않는다 — relay 가 ISIN 으로 푼다(D-28). `grep -c "market:" relay-provider.tsx` = 0.
- `crypto.randomUUID` 는 **보안 컨텍스트에서만** 정의된다. 없으면 던지는 대신 시각 + 단조 카운터 + 난수로 만든다(던지면 주문 버튼이 통째로 죽는다).
- 형식 오류(취소인데 원주문번호 없음 / 신규인데 매매 구분 없음 / 수량·가격 0)는 **보내지 않고** `status:"rejected"` 로 resolve + `console.error`. 계좌번호는 로그에 싣지 않는다(T-16-09).
- 어떤 경로에서도 **reject 하지 않는다.** 그래서 두 패널에 주문 실패용 `catch` 가 **한 개도 없다** — catch 를 두면 거기서 「실패」 문구를 쓰게 되고, 결과를 모르는 주문에 「실패」를 쓰는 것이 이 Phase 최악의 사고다(S-8).

### 2. 주문·취소 wss 전환 + 계좌 패널 공용화 (`0d9e59a`)

**`order-panel.tsx`** — `createOrder(REST)` → `sendOrder({kind:'new'})`. 종목 키를 `code`(6자) → **`isin`(12자)** 로 바꿨고, 결과 3분류·`blocked` 잠금·문구는 그대로다.

**`account-panel.tsx`** — 취소가 `sendOrder({kind:'cancel', isin: row.isin, ...})`. **그 행의 ISIN** 이 키다(T-16-01: 화면에 열린 종목을 쓰면 다른 종목이 취소된다).

**모바일 2줄 카드 행(`.rlist`, <1280px)** — UI-SPEC C7/R6 대로:

| 줄 | 미체결 | 잔고 |
|---|---|---|
| ① | 종목명 · ▲매수/▼매도 · 출처태그 · (우) 주문번호 | 종목명 · 보유 · 매도 · (우) 평가 |
| ② | 주문가 · 미체결 `{잔량}/{주문량}` · (우) ✕ 취소 | 평단 → 현재 · (우) 손익 · 손익률 |

**신축 항목은 종목명 하나**(`flex-1 min-w-0 truncate`)이고 나머지는 전부 `flex-none` 이다. 표(≥1280)와 카드(<1280) 두 트리가 **모두 DOM 에 있고 판정은 전부 CSS** 다 — 기존 파일의 「JS 는 뷰포트를 재지 않는다」 규율을 그대로 이었다.

**계좌 전용 모드** — `code` 미전달이 유일한 판정이다. 계좌 `<select>` 대신 계좌번호를 **전체 표시**하고(D2/S-5), 탭이 없으며, ≥1280px 에서만 미체결|잔고 2열이다(R4). My page 가 계좌마다 이 패널을 1벌씩 렌더한다(D-21).

**`originTag?: '상따' | 'VI'`** — 값의 원천은 `dma_orders.origin` 이 아니라 화면 컨텍스트다. 수동 표면은 태그가 없다(「수동」 배지를 붙이면 대부분의 행에 의미 없는 배지가 하나씩 붙는다).

### 3. E2E — 주문 왕복과 모바일 잘림을 실제 브라우저에서 (`ac0b01c`)

| # | 케이스 |
|---|---|
| 6 | 폼 제출 → 확인 → `order.new` → `DirectOrderReq(2)` → 통보(51) → **「접수」 배너** + `POST /api/orders` **0건** + `dma_orders` insert 1건(`stock_code`·`market` 이 relay 해석값) |
| 7 | 통보 미수신 → relay 5초 → **「결과 모름」**(`role="status"`, 패널에 「실패」 0회, 제출 버튼 잠김) |
| 8 | 390px → `.rlist` 카드 행 렌더 + 표 숨김 + **잘림 0** |

E2E 픽스처(`e2e/fixtures/relay.ts`)에 Supabase 스텁 라우트 3종을 더했다. **없으면 모든 주문이 게이트웨이로 나가기 전에 거부된다**:
- `GET /rest/v1/stocks` — 없으면 relay 가 ISIN 을 못 풀어 「이 종목은 지금 주문할 수 없습니다」
- `POST/PATCH/GET /rest/v1/dma_orders` — insert 실패면 「주문 기록에 실패했습니다」(D-03: 기록 없는 실주문을 만들지 않는다)

`pushAccountState(66/67)` · `orderInserts()` 도 추가했다. `postgrest-js` 의 `.single()` 은 `Accept: vnd.pgrst.object+json` 을 보내므로 스텁이 **헤더를 보고** 객체/배열을 가른다(추측하지 않는다).

## 계획에서 벗어난 것

### Rule 3 — 막고 있던 것 복구

**1. `OrderPanel` 에 `isin` prop 이 없었다**
- 발견: Task 2
- 이슈: plan 은 "isin 은 이미 props 로 들어온다"고 적었지만 `OrderPanelProps` 에는 `code` 뿐이었다. ISIN 없이는 wss 주문을 조립할 수 없다.
- 수정: `isin: string` prop 추가 + `stock-orderbook-section.tsx` 가 `subscriptionIsin` 을 내려 준다. 게이트 분기(`isGated`) 안쪽이라 TS 가 `string` 으로 좁힌다 — `?? ''` 같은 거짓 폴백을 쓰지 않았다.
- 파일: `order-panel.tsx` / `stock-orderbook-section.tsx` / 커밋 `0d9e59a`

**2. E2E Supabase 스텁에 `stocks`·`dma_orders` 가 없었다**
- 발견: Task 3 (설계 단계에서 relay 코드 대조 중)
- 이슈: 스텁은 `auth/v1/user` 와 `dma_credentials` 두 경로만 있었다. relay 의 주문 경로는 그 전에 `SymbolMap.lookup`(stocks)과 `insertRequest`(dma_orders)를 통과해야 하고, 둘 다 404 면 **주문이 게이트웨이로 나가기 전에 거부**된다. 스텁 없이 쓴 E2E 는 「거부 배너」만 보게 된다.
- 파일: `webapp/e2e/fixtures/relay.ts` / 커밋 `ac0b01c`

### Rule 2 — 사실이 아닌 것을 지운 것

**3. 「단축코드를 못 푼 행은 취소 불가」 제약 폐기**
- 발견: Task 2 (업스트림 인계 대조)
- 이슈: Phase 15 는 `POST /api/orders` 가 6자 단축코드를 받았기 때문에 `row.code == null` 인 행의 취소 버튼을 잠그고 「그 종목 페이지에서 취소할 수 있어요」를 띄웠다. D-02 이후 취소 키는 **ISIN** 이고 `unf[].isin` 은 언제나 실려 온다 — 잠글 근거가 사라졌는데 그대로 두면 **취소할 수 있는 주문을 못 취소하게 막는** UI 가 된다.
- 수정: `cancellable = unfilledQty > 0 && !locked` 로 좁히고 안내 문구(`hasUnresolvedRow`)를 제거. RTL ⑮ 를 「잠그지 않는다 + ISIN 으로 나간다」로 뒤집었다.

**4. 코드 기반 `guidanceFor` → `rejectDetail`**
- 발견: Task 2
- 이슈: `guidanceFor(code)` 는 REST 에러 코드 7종에 기대던 함수인데 wss 에는 그 코드 체계가 없다. 그대로 두고 응답 경로에 붙이면 「가격·수량을 다시 확인해 주세요」가 **세션 문제·계좌 문제에도** 붙는다. 사실이 아닌 안내는 안내가 없는 것보다 나쁘다.
- 수정: 거부 사유(다음 행동 포함)는 relay/게이트웨이의 `message` 를 **그대로** 제목에 쓰고, 보조 줄은 모든 거부에 대해 참인 사실 하나 —「주문은 나가지 않았어요. 사유를 확인한 뒤 다시 시도해 주세요. (코드 N)」— 만 말한다.

**5. 계좌 전용 모드에 탭 대신 2열 레이아웃**
- 발견: Task 2
- 이유: plan 은 셀렉터 숨김만 지시했지만, 탭을 남기면 My page 계좌 카드에서 미체결/잔고 중 하나만 보인다(UI-SPEC My page 는 둘을 함께 본다). 탭을 없애고 R4 의 ≥1280px 2열(`min-w-0` 자식 포함)을 여기서 구현했다 — 3표면이 공유하는 리플로우를 「여기 한 번만」 두라는 plan 취지와 같은 방향이다.

### 계획과 다르게 판단한 것

**6. 클라이언트 타임아웃은 `ORDER_RESULT_BACKSTOP_MS`(10초)를 그대로 쓴다**
- plan 은 "`ORDER_REQUEST_TIMEOUT_MS`(9초) 재사용"을 예시로 들었으나, 그 상수는 **16-16 에서 지워질** `orders-api.ts` 에 있다. 삭제 예정 모듈로 import 를 새로 만드는 대신 16-09 가 이미 넣어 둔 10초 백스톱을 유지했다. 의도(relay 5초보다 넉넉히)는 동일하게 충족한다.

**7. RTL 재작성이 Task 2 커밋에 포함됐다**
- plan 은 RTL 갱신을 Task 3 에 뒀지만, Task 2 의 `<verify>` 가 그 두 테스트다 — 스텁 경계를 옮기지 않으면 Task 2 를 검증할 방법이 없다. 그래서 Task 2 커밋 = 컴포넌트 + RTL, Task 3 커밋 = E2E 로 갈랐다. **세 커밋 모두 HEAD 가 green 이다.**

## 테스트 실효성 실측 (변이 주입 13종)

plan 의 blindspot 지시("첫 실행에 전부 green 이면 변이 주입으로 실효성 실측")를 따랐다. **E2E 에서 실제로 공허한 단언이 나왔다.**

| # | 주입한 변이 | 결과 |
|---|---|---|
| 1 | `newRid()` 고정값 | ✓ 2건 실패 (⑨ rid 유일성 / ⑨-d 대기 뭉갬) |
| 2 | 취소 `orgOrderNo` 검증 제거 | ✓ ⑨-b |
| 3 | `onclose` 의 대기 주문 정산 제거 | ✓ ⑨-d |
| 4 | `order.result` 를 rid 무시하고 첫 대기에 resolve | ✓ ⑨-a (**기존 relay-socket ⑰ 는 못 잡았다**) |
| 5 | 취소가 `row.isin` 대신 화면 ISIN | ✓ ⑭ ⑮ |
| 6 | 카드 종목명에서 `min-w-0`/`truncate` 제거 | ✓ RTL ⑰ |
| 7 | `stockScoped` 를 항상 true | ✓ ⑯ ⑯-a ⑯-b |
| 8 | 주문에 `isin` 대신 `code` 전송 | ✓ RTL ⑪ + E2E 6 |
| 9 | `timeout` 분기 삭제(거부로 뭉갬) | ✓ RTL ⑭ + E2E 7 |
| 10 | `.rlist` 브레이크포인트 역전 | ✓ E2E 8 |
| 11 | 카드 종목명 고정폭(잘림 유발) — **1차 단언** | ❌ **놓침** → 단언 교체 후 검출 |
| 12 | 같은 변이 — 2차 단언(잎 요소 right 대조) | ✓ E2E 8 |
| 13 | 긴 종목명 픽스처 없이 12자 ISIN 만 | — 넘치지 않아 무의미(픽스처를 스트레스 데이터로 교체) |

**변이 11 이 드러낸 것(중요):** 「잘림 0」을 행의 `boundingBox().width ≤ 컨테이너 폭` 과 `scrollWidth - clientWidth ≤ 1` 로 단언했는데 **둘 다 통과했다.** 행은 블록이라 내용이 넘쳐도 폭이 컨테이너와 같고, `.rlist` 의 `overflow-hidden` 이 넘침을 삼켜 `scrollWidth` 마저 조용하다. `tasks/lessons.md` 의 「문서 스크롤폭이 아니라 요소 실측 폭」은 한 단계 더 내려가야 한다 — **행이 아니라 행 안의 잎 요소**의 `getBoundingClientRect().right` 를 컨테이너 오른쪽 끝과 대조해야 문다(`getBoundingClientRect` 는 ancestor 클리핑에 영향받지 않는다). 실패 메시지에 「무엇이 몇 px 밀려났는지」가 남도록 바꿨고, 픽스처도 긴 종목명 + 7자리 가격 + 6자리 수량으로 교체했다(짧은 데이터로는 규율을 지워도 아무것도 넘치지 않는다).

## 검증 결과

| 항목 | 결과 |
|---|---|
| `pnpm typecheck` (모노레포 전체) | exit 0 |
| `pnpm --filter @gh-radar/webapp test` | 46 파일 / 428 passed, 1 skipped (승격 전 414 → +14) |
| `pnpm --filter @gh-radar/webapp test:e2e -- orderbook` | **11/11 passed** (기존 8 + 신규 3) |
| `pnpm --filter @gh-radar/relay test` | 17 파일 / 327 passed (회귀 없음) |
| `pnpm --filter @gh-radar/webapp lint` | 신규 경고 0 (기존 2건 그대로) |

acceptance criteria 대조:

- `grep -c "sendOrder" relay-provider.tsx` = 10 (요구 ≥3) ✓
- `grep -c "market:" relay-provider.tsx` = 0 ✓
- `sendOrder` 가 어떤 경로에서도 reject 하지 않음 — 미연결·타임아웃·형식오류 3경우 resolve 테스트 ✓
- 연결 종료 시 대기 rid 전량 `timeout` 정리 테스트(⑨-d) ✓
- `grep -rn "createOrder(" webapp/src/components/orderbook/` = 0건 ✓
- `grep -c "sendOrder(" order-panel.tsx account-panel.tsx` = 2+1 (요구 합계 ≥2) ✓
- `account-panel.tsx` 에 `data-slot="account-unfilled-row"` + `min-w-0`(13곳) 공존 ✓
- 계좌 전용 모드 RTL 케이스 5건(⑯ ~ ⑯-d) ✓
- 취소가 `row.isin` 을 보내는 RTL 케이스(⑭ ⑮ ⑯-d) ✓
- E2E 에 타임아웃 케이스 1건(7) · 390px `.rlist` 케이스 1건(8) ✓
- `.rlist` 케이스가 `boundingBox` 기반 잘림 0 단언 ✓ (잎 요소 right 대조로 강화)
- `grep -rn "createOrder" webapp/e2e/ webapp/src/components/orderbook/__tests__/` = 0건 ✓
- 실서버 IP 리터럴 0건 — `relay.ts`/`orderbook.spec.ts` 의 IP 는 전부 `127.0.0.1` ✓

## 알려진 고려사항 (스텁 아님)

- **`orders-api.ts` 와 `POST /api/orders` 는 아직 살아 있다.** 이 plan 은 호출부만 옮겼고(되돌리기 쉬운 순서) 라우트·`createOrder` 제거는 **16-16** 이다. `webapp/src/components/orderbook/` 안의 호출은 이미 0건이라 16-16 은 파일 삭제만 하면 된다.
- **`.rlist` 브레이크포인트는 1280px 이고 호가주문 탭에도 적용된다.** 호가주문 탭의 계좌 컬럼은 `minmax(380px,1fr)` 이라 900~1279px 구간에서도 표가 비좁았으므로 카드 행이 오히려 낫다. Playwright 기본 뷰포트(1280×720)에서는 표가 그대로여서 기존 E2E 회귀도 그대로 통과한다.
- **표/카드 두 트리가 DOM 에 공존한다.** 취소 버튼도 두 벌이라 RTL 은 `queryAllByRole` 로 「있다/없다」만 보고, E2E 는 `data-slot` 으로 트리를 좁힌다. 개수를 단언하지 않는 이유는 그것이 렌더 구현 세부이기 때문이다.
- **잔고의 평가·손익은 「지금 구독 중인 종목」에서만 계산된다.** 계좌 전용 모드(My page)에서는 현재가를 하나도 모르므로 전부 `—` 다. 이건 규율 ⑤(모르면 지어내지 않는다)의 결과이지 미완성이 아니다. My page 가 평가금액을 보여 주려면 별도 시세 원천이 필요하고, 그것은 이 plan 의 범위가 아니다.

## Threat Flags

없음 — 새 네트워크 표면·인증 경로·스키마 변경이 없다. plan 의 `<threat_model>` 이 `mitigate` 로 지정한 셋은 전부 구현 + 테스트로 고정했다:

| Threat | 조치 |
|---|---|
| T-16-10 중복 주문 | `submitting`/`blocked`/`lockedOrderNos` 잠금 유지 + 타임아웃이 resolve 로 수렴해 catch 재시도 경로 자체가 없다. 「실패」 문구 금지를 RTL ⑭ + E2E 7 이 잠근다 |
| T-16-01 취소 대상 | 취소는 **그 행의 `isin`/`orderNo`** 를 쓴다. RTL ⑭ ⑮ ⑯-d 가 화면 종목 값 사용을 잡는다(변이 5 실측) |
| T-16-03 rid | 브라우저가 생성하고 relay 는 연결 스코프로만 매칭. 대기 맵은 소켓 수명과 함께 정리된다(⑨-d) |
| T-16-09 계좌번호 | 화면에는 전체 표시(계약), 로그·전송에는 추가 노출 없음 — 형식 오류 로그에 `accountNo` 를 싣지 않는다 |

## Self-Check: PASSED

- `webapp/src/lib/relay-provider.tsx` FOUND
- `webapp/src/components/orderbook/account-panel.tsx` FOUND
- `webapp/src/components/orderbook/order-panel.tsx` FOUND
- `webapp/e2e/specs/orderbook.spec.ts` FOUND
- `webapp/e2e/fixtures/relay.ts` FOUND
- commit `176c6b6` FOUND / `0d9e59a` FOUND / `ac0b01c` FOUND
