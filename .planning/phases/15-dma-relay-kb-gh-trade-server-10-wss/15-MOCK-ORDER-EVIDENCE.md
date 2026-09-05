# Phase 15 — mock 브로커 주문 왕복 실측 증거

> 15-19 Task 3 (D-40 / D-24 / SC-6). 측정 2026-09-06.
> **전 과정 로컬 loopback 전용이다.** 실서버 게이트웨이·실계좌·VPN 에 접속하지 않았다 (D-27).
> 접속 대상은 `127.0.0.1:9100` 하나뿐이며, 이 포트에는 gh-trade 가 `[broker] name="mock"`
> 으로 떠 있다 — 기동 로그가 `MockBroker 사용 — 실주문이 거래소로 나가지 않고 가짜 체결
> 통보가 생성된다 (개발 전용)` 을 error 레벨로 남긴다.
>
> **비밀 값·실계좌번호·DMA 사용자 ID 는 이 문서에 기록하지 않는다.** 계좌번호는 앞 7자만
> 남기고 마스킹했다(`3772850****`).

---

## 0. 측정 환경

| 구성요소 | 값 |
|----------|-----|
| mock 게이트웨이 | gh-trade `stock-dma-server` · `config/server.toml` · `[broker] name="mock"` · port **9100** |
| 계정·계좌 원천 | gh-trade `config/users.toml` (사용자 1명 / 계좌 1건). 기동 로그 `사용자 파일 로드: config/users.toml (사용자 1명, 계좌 1건)` |
| 와이어 코드 | relay 의 **실제** `dma/envelope.ts` · `dma/codec.ts` (테스트 스텁 아님) |
| 로컬 relay | `DMA_HOST=127.0.0.1 DMA_PORT=9100 WS_PORT=8090 ORDER_API_PORT=8091` · `/healthz` 200 |
| 종목 | `005930` 삼성전자 · ISIN `KR7005930003` (`stocks.isin` 실값) |

측정은 두 갈래로 나눠 했다.

- **A. 와이어 갈래** — relay 의 조립·파싱 코드로 mock 게이트웨이에 직접 붙어 주문 통보를 받는다.
  `DirectOrderReq(2)` → `OrderResp(51)` 왕복 실측.
- **B. HTTP 갈래** — 로컬 relay 의 `POST /internal/orders` 를 실제로 호출해 공유 비밀 관문과
  zod 층, 세션 판정을 실측한다.

---

## 1. ★ 가격 0 거부 — **어느 층에서 막히는가** (이 문서의 핵심)

가격 0 주문은 **4개 층**을 지나야 브로커에 닿는다. 4층 전부를 개별로 두드려 측정했다.

| 층 | 위치 | 가격 0 결과 | 실측 응답 |
|----|------|------------|-----------|
| **층1** | server zod `OrderPostBody` (`server/src/schemas/orders.ts`) | **거부** | `path="price" code="too_small" msg="Too small: expected number to be >0"` → HTTP **400 VALIDATION_FAILED** |
| **층2** | relay zod `OrderRequestSchema` (`relay/src/order/order-api.ts`) | **거부** | `POST /internal/orders` → HTTP **400** `{"error":{"code":"VALIDATION_FAILED","message":"주문 요청 형식이 올바르지 않습니다."}}` |
| **층3** | relay 조립 `buildDirectOrderReq` (`relay/src/dma/envelope.ts`) | **거부** | `OrderBuildError code="BAD_PRICE" msg="주문가격은 1 이상의 정수여야 합니다"` |
| **층4** | mock 브로커 `MockBroker::PlaceOrder` | (도달 시) **거부** | `noticeType="R" rc=105 msg="mock_rejected 호가가격 Format 오류"` |

### 실제로 동작한 층은 **층1(server zod)** 이다

정상 경로(브라우저 → server → relay → 게이트웨이)로 가격 0 을 넣으면 **층1 에서 400 으로 끝난다.**
층2·3 은 도달하지 않고, **층4(브로커)에는 영원히 닿지 않는다.**

이것이 다층 방어의 의도된 결과다 — 그런데 그 결과로 **"브로커 거부 통보가 화면까지 오는가"
를 가격 0 으로는 검증할 수 없다.** 그래서 층4 를 두 방식으로 따로 측정했다.

**① 가드를 우회한 raw 프레임 직송** — relay 의 가드를 지우지 않고, 측정 하네스 안에서만
같은 형태의 `DirectOrderReq` 를 손으로 조립해 `price=0` 으로 보냈다. 게이트웨이의 자체
입력검증이 `price >= 0` 을 허용하므로(gh-trade `Gateway.cpp` `priceOk`) 프레임은 브로커까지 간다.

```
[층4 mock 브로커] 가드 우회 raw 프레임 직송 →
    통보1: noticeType="R" rc=105 orderNo="" orgOrderNo="" msg="mock_rejected 호가가격 Format 오류"
           price=0 qty=1 side="B" sideTrusted=true exchange=KRX
```

mock 로그:
```
[MockBroker] 신규주문 slot=3 code=KR7005930003 side=B price=0 qty=1
[MockBroker] 거부 유도 발동 (가격 0): code=KR7005930003 price=0 qty=1 → rc=105
```

**② sentinel 수량 105** — mock 이 **정확히 이 목적으로** 둔 두 번째 거부 훅이다
(`MockBroker.h` `kRejectSentinelQty`). 가격·종목·계좌가 전부 정상이라 층1~3 을 모두 통과하고
브로커에서만 거부된다 — 즉 **정상 경로로 도달 가능한 유일한 브로커 거부 갈래**다. §3 참조.

> **결론.** 가격 0 은 `price > 0` 를 강제하는 **층1(server zod)** 에서 막힌다. 층2·층3 이
> 같은 판정을 독립적으로 내리므로, server 를 우회한 호출(relay 직접 호출)도 같은 곳에서 멈춘다.
> 브로커의 가격 0 거부 능력은 실재하지만 정상 경로에서는 **도달 불가**이며,
> 거부 통보의 화면 왕복은 sentinel 수량(§3)으로 검증한다.

---

## 2. CASE ① 정상 주문 — 접수 → 전량 체결

요청: 매수 1주 @70,000 · `orderType:"N"` · 계좌 `3772850****` · `KRX`/`K`

```
통보1: noticeType="A" rc=0 orderNo="0000000002" orgOrderNo="" msg="mock_accepted"
       price=70000 qty=1 side="B" sideTrusted=true exchange=KRX
통보2: noticeType="E" rc=0 orderNo="0000000002" orgOrderNo="" msg="mock_filled"
       price=70000 qty=1 side="B" sideTrusted=true exchange=KRX
```

- 한 주문에 통보가 **2건** 온다 — 접수(`A`)와 체결(`E`)이 같은 주문번호로 연달아 온다.
- `parseOrderResp` 가 두 건 모두 정상 파싱했고, `sideTrusted=true`(신규 통보라 매매구분 신뢰 가능).
- relay `statusOf` 매핑: `A → accepted`, `E → quantity >= requestedQty ? filled : partially_filled`.

**왕복 지연 (loopback, 표본 10건 / 통보 20건):**

| 구간 | min | median | max |
|------|-----|--------|-----|
| `DirectOrderReq` 송신 → 첫 통보(`A`) 수신 | **1.87 ms** | **3.33 ms** | **4.50 ms** |

D-22 의 relay 대기 상한은 5,000 ms 다. loopback mock 기준 여유는 3자릿수 배수이며,
실측값은 **상한 산정이 타당함**을 뒷받침한다(실 게이트웨이·VPN 구간은 별도 측정 대상).

---

## 3. CASE ② 브로커 거부 경로 — sentinel 수량 105 (거부가 화면까지 오는가)

요청: 매수 **105주** @70,000 — 가격·종목·계좌 전부 정상. 층1~3 을 모두 통과한다.

```
통보1: noticeType="R" rc=105 orderNo="" orgOrderNo="" msg="mock_rejected 호가가격 Format 오류"
       price=70000 qty=105 side="B" sideTrusted=true exchange=KRX
```

mock 로그:
```
[MockBroker] 신규주문 slot=3 code=KR7005930003 side=B price=70000 qty=105
[MockBroker] 거부 유도 발동 (sentinel 수량): code=KR7005930003 price=70000 qty=105 → rc=105
```

관측된 사실 3가지:

1. **`orderNo` 가 빈 문자열이다** — 접수 전 거부라 주문번호가 발급되지 않는다.
   상관 셀렉터 우선순위가 `id → order_no` 인 이유가 여기서 실증된다(15-16): 거부 통보만으로는
   `order_no` 로 행을 찾을 수 없다.
2. **`message` 에 한글 사유가 병기된다** — 브로커 원문 `mock_rejected` 뒤에 게이트웨이가
   rc=105 의 코드표 문구(`호가가격 Format 오류`)를 붙여 보낸다. 화면에 그대로 노출되는 문자열이다.
3. relay `statusOf`: `R → rejected`.

**화면 문구 대조** (`webapp/src/components/orderbook/order-panel.tsx`):
`res.status === 'rejected' || res.resultCode !== 0` 분기에 해당하므로 배너는

> **주문이 거부됐어요 · mock_rejected 호가가격 Format 오류**
> 가격·수량을 다시 확인해 주세요. (코드 105)

이며 `role="alert"` + `--destructive` 테두리다. (배너 렌더 자체는 15-18 이 검증했다.
여기서는 **그 분기에 들어가는 입력값**이 실측으로 확정됐다.)

---

## 4. CASE ③ 취소 왕복

요청: `orderType:"C"` · `orgOrderNo="0000000002"` (CASE ① 의 접수 주문번호) · 1주

```
통보1: noticeType="C" rc=0 orderNo="0000000003" orgOrderNo="0000000002" msg="mock_canceled"
       price=0 qty=1 side="B" sideTrusted=false exchange=KRX
```

게이트웨이 로그: `[Gateway] 수동취소 code=KR7005930003 org=0000000002 qty=1 exchange=K result=0`

관측된 사실 2가지:

1. **`sideTrusted=false`** — Pitfall 8 이 실측으로 확인됐다. 취소 통보의 `side` 는 `"B"` 로
   채워져 오지만 **요청에 매매구분이 담기지 않아 브로커가 지어낸 값**이다. 그대로 그리면
   매도 취소가 "매수"로 표시된다. `parseOrderResp` 가 `noticeType==="C"` 를 근거로
   `sideTrusted=false` 를 세우고, UI 는 매수/매도 대신 "취소"를 표기한다.
2. **취소 통보는 새 주문번호(`0000000003`)를 갖고 원주문번호를 `orgOrderNo` 로 싣는다.**
   `orderNo` 만 보고 상관하면 원주문 행을 찾지 못한다.

`statusOf`: `C → cancelled`.

---

## 5. relay 내부 주문 API (HTTP 갈래) — 관문·층 실측

로컬 relay `POST http://127.0.0.1:8091/internal/orders` 실측 4건.

| # | 요청 | 응답 |
|---|------|------|
| ① | `X-Relay-Secret` **헤더 없음** | **401** `{"error":{"code":"UNAUTHORIZED_RELAY","message":"Unauthorized"}}` |
| ② | `X-Relay-Secret` **틀린 값** | **401** `{"error":{"code":"UNAUTHORIZED_RELAY","message":"Unauthorized"}}` |
| ③ | 비밀 정상 + **`price:0`** | **400** `{"error":{"code":"VALIDATION_FAILED","message":"주문 요청 형식이 올바르지 않습니다."}}` |
| ④ | 비밀 정상 + 가격 정상, **세션 없음** | **409** `{"error":{"code":"SESSION_NOT_READY","message":"실시간 세션이 없습니다. 호가창을 먼저 열어 주세요."}}` |

- ①②가 **같은 응답**이다 — "헤더 없음"과 "값 틀림"을 구분해 주지 않는다(오라클 차단).
- ④는 프로덕션 결선 검증(15-19 Task 2 / `smoke-relay.sh` INV-9)이 기대하는 바로 그 응답이다.
  **relay 가 세션 부재로 조립 전에 끊으므로 주문은 게이트웨이로 나가지 않는다** — 그래서
  이 프로브는 실계좌에 안전하다. 그 안전성이 여기서 실측으로 확인됐다.

---

## 6. relay 조립 가드 2건 (오주문 차단)

| 케이스 | 결과 |
|--------|------|
| 취소인데 원주문번호 부재 | 거부 · `code="ORG_ORDER_NO_REQUIRED"` · `"취소 주문에는 원주문번호가 필요합니다"` |
| 수량 0 | 거부 · `code="BAD_QTY"` · `"주문수량은 1 이상의 정수여야 합니다 (0 은 즉시 거부)"` |

수량 0 은 **전량취소가 아니라 입력 오류**다(D-44). 게이트웨이도 같은 판정을 내리지만
(`Gateway.cpp` `qtyOk`), relay 가 먼저 막아 왕복 5초를 태우지 않는다.

server zod 층에서도 같은 판정이 난다:

```
가격 0    : 거부 → path="price" code="too_small"
가격 음수  : 거부 → path="price" code="too_small"
가격 소수  : 거부 → path="price" code="invalid_type" (expected int)
수량 0    : 거부 → path="qty"   code="too_small"
정상      : 통과
```

---

## 7. 로그에 비밀이 남지 않는가 (T-15-04)

로컬 relay 로그 전량(7줄) 대조 결과:

| 대상 | 평문 노출 |
|------|-----------|
| `RELAY_ORDER_SECRET` 값 | **0건** |
| `DMA_CRED_KEY` 값 | **0건** |
| `SUPABASE_SERVICE_ROLE_KEY` 값 | **0건** |
| `password` 문자열 | **0건** |

무엇을 대신 남기는가 — 진단에 필요한 **최소한**만 남긴다:

```
{"message":"[order-api] 공유 비밀 불일치 — 401","path":"/internal/orders","method":"POST","hasHeader":false}
{"message":"[order-api] 공유 비밀 불일치 — 401","path":"/internal/orders","method":"POST","hasHeader":true}
{"message":"[order-api] 주문 요청 형식 위반","issues":["price"]}
{"message":"[order-api] 세션 미준비 — 409","userId":"1111…","accountNo":"377285****","isin":"KR7005930003","orderType":"N","hasSession":false}
```

- 401 로그는 **비밀 값이 아니라 `hasHeader` 불리언**만 남긴다.
- 400 로그는 바디를 통째로 남기지 않고 **위반 필드 이름(`["price"]`)만** 남긴다 —
  바디에는 계좌번호가 들어 있기 때문이다.
- 409 로그의 계좌번호는 **`377285****` 로 마스킹**돼 있다 (`maskAccountNo`).

---

## 8. 이번 측정으로 확인되지 **않은** 것

정직하게 남긴다. 아래 3건은 **측정하지 못했고, 실패한 것이 아니다.**

| 미측정 항목 | 이유 |
|-------------|------|
| 브라우저 UI 왕복 (배너 실물·확인 다이얼로그·미체결 목록 갱신) | 로그인 세션이 필요하다. 배너 렌더 자체는 15-18 이 검증했고, 여기서는 **그 분기에 들어가는 입력값**(§3)을 확정했다 |
| `dma_orders` status 전이 (`requested → accepted/rejected/cancelled`) | 기록은 server 가 relay 를 부르기 **전에** insert 하고 결과로 patch 한다. 그 경로는 로그인 토큰 + allowlist 통과가 전제다 |
| `GET /api/orders` 목록 복원 (D-24) | 위와 같은 이유 |

**공통 전제 1개** — `dma_credentials` 테이블이 현재 **0행**이다. 이 행이 allowlist 이므로
(D-12), 행이 없으면 인증된 요청도 server 의 `isDmaAllowed` 에서 `403 DMA_NOT_ALLOWED` 로
끊긴다. 자격증명 등록은 실계정 비밀번호를 다루므로 15-19 범위 밖이며 **15-20 소관**이다.

등록 후 위 3건과 `smoke-relay.sh` INV-9 을 한 번에 측정할 수 있다.

---

## 9. 재현 절차

```bash
# ① mock 게이트웨이 (9100) — [broker] name="mock" 확인 후
cd ../gh-trade/server && ./scripts/build.sh && ./scripts/run-mac.sh

# ② 로컬 relay (8090 / 8091)
DMA_HOST=127.0.0.1 DMA_PORT=9100 pnpm --filter @gh-radar/relay run dev

# ③ 관문·층 확인
curl -s -X POST http://127.0.0.1:8091/internal/orders -H 'content-type: application/json' \
  -H "X-Relay-Secret: $RELAY_ORDER_SECRET" \
  -d '{"userId":"<uuid>","orderRowId":"<uuid>","isin":"KR7005930003","exchange":"KRX",
       "market":"K","side":"B","orderType":"N","qty":1,"price":0,"accountNo":"<계좌>"}'
# → 400 VALIDATION_FAILED (price:0)   / price 를 정상값으로 바꾸면 409 SESSION_NOT_READY
```

와이어 갈래(§1~4·6)는 relay 의 `envelope.ts`/`codec.ts` 를 직접 부르는 일회용 하네스로
측정했다. 하네스는 저장소에 남기지 않는다 — 실계정 자격증명을 `config/users.toml` 에서
읽기 때문에 커밋 대상이 아니다. **거부 경로 회귀 검사는 sentinel 수량 105 로 재현한다**
(`MockBroker.h` `kRejectSentinelQty`).
