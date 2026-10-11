---
phase: quick-260910-jce
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/lib/auth-fetch.ts
  - webapp/src/lib/chat-api.ts
  - webapp/src/lib/orders-api.ts
  - webapp/src/lib/__tests__/orders-api.test.ts
  - webapp/src/components/trading/today-orders-card.tsx
  - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/e2e/specs/me.spec.ts
  - relay/src/dma/msg-type.ts
  - relay/src/dma/codec.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/__tests__/envelope.test.ts
autonomous: true
requirements: [RELAY-02]

estimate:
  tokens: 96000
  raw_tokens: 48000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "로그인한 DMA 사용자가 /me 를 새로고침하면 오늘 낸 주문이 상태와 무관하게(접수·취소 포함) 목록으로 보인다"
    - "복원된 주문과 wss 로 들어오는 같은 주문이 두 줄로 보이지 않는다 — 한 줄이고 최신 통보가 이긴다"
    - "주문 목록 조회가 실패해도 My page 의 전략·계좌 카드는 그대로 선다"
    - "거래원 푸시(74/75) 드롭은 debug 로 남고, 정말 모르는 msg_type 드롭은 WARNING 으로 남는다"
    - "게이트웨이가 요청 대역(20/26/27/30/31) 번호를 보내오면 그것은 여전히 WARNING 이다"
  artifacts:
    - webapp/src/lib/orders-api.ts
    - webapp/src/components/trading/today-orders-card.tsx
    - relay/src/dma/msg-type.ts
  key_links:
    - "webapp orders-api → GET /api/orders (Bearer) → server ordersRouter → listTodayOrders"
    - "useRelayContext().orders (RelayOrderMsg[]) → mergeTodayOrders → 화면 한 줄"
    - "OUT_OF_SCOPE_INBOUND_MSG_TYPES → envelope drop() → logDroppedFrame(level)"
---

<objective>
RELAY-02 의 마지막 미충족 조항인 **오늘 주문 목록 복원(D-24)** 을 배선하고, relay 가 거래원 푸시를
진짜 이상 신호와 같은 WARNING 으로 쌓는 문제를 분리한다.

Purpose:
- 범위 A 는 **검증 공백이 아니라 기능 공백**이다. 서버 라우트는 살아 있는데 `webapp/src` 전체에
  호출자가 0건이다(16-16 이 접수만 wss 로 옮기고 복원은 옮기지 않았다).
- 범위 B 는 25~55초마다 나오는 의도된 드롭이 실제 이상을 가리는 문제다. 드롭 자체는 설계대로 옳다
  (Phase 15 가 MemberStats 팬아웃을 명시적으로 범위 밖에 뒀다) — 틀린 것은 로그 레벨 하나다.

Output: webapp 3파일 + 테스트 2파일 + e2e 1파일(범위 A, 커밋 1 + Vercel 배포), relay 3파일 +
테스트 1파일(범위 B, 커밋 1, **배포 보류**).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md

@server/src/routes/orders.ts
@server/src/services/dma-orders.ts
@webapp/src/lib/chat-api.ts
@webapp/src/components/trading/me-client.tsx
@relay/src/dma/msg-type.ts
@relay/src/dma/envelope.ts
</context>

<research_findings>

## 확정된 서버 계약 (추측 아님 — 코드에서 직접 읽음)

`server/src/app.ts:84` 이 `/api/orders` 에 `ordersRouter` 를 마운트한다. 라우트는 **GET `/` 하나뿐**
(`server/src/routes/orders.ts:36`)이고 `POST` 는 16-16 에서 제거됐다.

| 항목 | 확정값 | 근거 |
|------|--------|------|
| 메서드·경로 | `GET /api/orders` | `routes/orders.ts:36` · `app.ts:84` |
| 인증 | `requireAuth()` — `Authorization: Bearer <supabase access_token>`, 없거나 무효면 401 | `middleware/require-auth.ts:19-38` |
| 쿼리 파라미터 | `date` **하나뿐, optional**, 정규식 `^\d{4}-\d{2}-\d{2}$` | `schemas/orders.ts` `OrderListQuery` |
| `date` 생략 시 | 서버가 KST 오늘로 채운다 (`kstDateIso()`), 경계는 `[당일 00:00 KST, 익일 00:00 KST)` | `services/dma-orders.ts` `kstDayRangeUtc` |
| 응답 | **bare array** `DmaOrderRow[]` (envelope 아님 — scanner/themes/news/chat 과 같은 규약) | `routes/orders.ts:53` + 그 위 주석 |
| 정렬 | `created_at DESC` | `dma-orders.ts` `listTodayOrders` |
| 소유권 | `.eq("user_id", userId)` — 응답에 `userId` 를 싣지 않는다 | `dma-orders.ts` |
| 형식 오류 | 400 `VALIDATION_FAILED` / DB 오류 500 | `routes/orders.ts:39-42` |

**`date` 를 보내지 않는다.** 서버가 이미 공유 `kstDateIso()` 로 KST 오늘을 계산하고 그것이 정본이다.
브라우저에서 KST 를 한 번 더 계산하면 두 벌이 되고, 두 벌이 되는 순간 한쪽만 고쳐진다. 그래서 요청 URL 은
쿼리 문자열 없는 `/api/orders` 다.

## 병합 키 — `orderNo` 하나뿐이다 (코드로 확인)

- REST 행: `DmaOrderRow.orderNo` (`packages/shared/src/relay.ts`, **nullable** — 접수 전 거부·타임아웃이면 null)
- 라이브 프레임: `RelayOrderMsg.no` (`packages/shared/src/relay.ts`), 조립처는 `relay/src/hub/subscription-hub.ts:666`
- **`rid` 는 키가 될 수 없다** — `rid` 는 `order.new`/`order.cancel`/`order.result` 세 타입에만 있다.
  `{t:"order"}` 푸시에 `rid` 필드가 없고 `dma_orders` 에도 그 컬럼이 없다.
- **`broker_order_no` 라는 컬럼은 존재하지 않는다** — DB 컬럼은 `order_no`, camelCase 뷰는 `orderNo` 다
  (`dma-orders.ts` `ORDER_COLS`).

**어느 쪽이 이기는가 — 라이브가 이긴다.** `{t:"order"}` 는 접수·체결·취소확인·거부가 전부 통과하는 단일
통보 경로이고(`subscription-hub.ts:655` 주석), REST 스냅샷보다 언제나 나중이다.

**★ 라이브는 행을 만들 수 없다, 덮어쓸 수만 있다.** `RelayOrderMsg` 는 `side`·`isin`·`accountNo` 를
**의도적으로 싣지 않는다**(`subscription-hub.ts:660-663` — 취소·정정 통보의 매매구분은 믿을 수 없다).
그래서 라이브 프레임으로 행을 합성하면 매매구분 칸이 빈 줄이 화면에 선다. 트레이더가 방향을 읽는 칸이다.

**★ 라이브 배열은 최신이 앞이다.** `use-relay-socket.ts:396` 이 `[frame, ...state.orders]` 로
**앞에 붙이고 중복 제거를 하지 않는다** — 같은 `no` 가 A → E → C 로 여러 번 들어 있고 **index 0 이 가장
최신**이다. 순회하며 `map.set(f.no, f)` 로 접으면 **가장 오래된 프레임이 남는다**(마지막 쓰기가 이긴다).
`no` 당 **첫 번째 등장만** 취해야 한다.

## 붙일 자리 — My page 다 (두 패널을 읽고 내린 결정)

과제 지시는 「주문 이력이 이미 보이는 컴포넌트에 붙이라」였다. **읽어 보니 그런 컴포넌트가 없다.**

- `order-panel.tsx` 는 **주문 입력 폼**이다. 목록이 없다(파일 헤더 ①~⑥ 전부 폼 규율).
- `account-panel.tsx` 는 **미체결 + 잔고**만 그린다(헤더 ①). 오늘 주문 이력이 아니다.

그래서 셋 중 하나를 골라야 했고, 근거는 다음과 같다.

1. **미체결은 이 요구를 담을 수 없다.** 최종 검증 대상이 `accepted 2 · **cancelled 1**` 인데, 취소된 주문은
   정의상 미체결 목록에 없다. 미체결에 붙이면 3건 중 1건이 구조적으로 안 나온다.
2. **`account-panel` 은 계좌 축이 있고 이 라우트는 없다.** `listTodayOrders` 는 `user_id` 로만 거르고
   계좌로 거르지 않는다. 그런데 `me-client.tsx:236` 이 AccountPanel 을 **계좌마다 한 벌** 렌더한다 —
   계좌가 2개면 같은 응답을 2번 부른다. 게다가 이 패널은 4표면(호가주문·상따·VI·My page)이 공유하므로
   종목 축이 있는 3표면에도 종목 무관 주문 목록이 딸려 간다.
3. **호가주문 탭에서는 E2E 가 이 라우트를 끊는다.** `webapp/e2e/specs/orderbook.spec.ts:93` 의
   `page.route('**/api/orders')` 가 그 페이지에서 이 경로를 `abort()` 한다.
4. **My page 는 종목 축이 없는 계좌 축 표면이다**(D-19/D-20). 「오늘 내 주문 전체」가 놓일 자리는 여기뿐이고,
   페이지당 **한 번**만 부르면 된다.

**대가 — D-20 의 유예를 명시적으로 뒤집는다.** `me-client.tsx:28-31` 헤더 ⑤ 가 「오늘 주문 이력 표를 만들지
않는다」를, `webapp/e2e/specs/me.spec.ts:274-275` 가 그 부재를 각각 잠그고 있다. RELAY-02 는 요구사항이고
D-20 의 유예는 v1 편의였으므로 요구사항이 이긴다. **다만 조용히 어기지 않는다** — 같은 커밋에서 주석과 E2E
단언을 함께 고친다. 자기 자신을 두고 거짓말하는 파일을 남기는 것이 이 저장소가 3라운드에 걸쳐 싸운 실패 모양이다.

## 범위 밖 msg_type — 정본은 주석이고, 방향으로 갈린다

`relay/src/dma/msg-type.ts` 의 「하지 않는 것」 블록이 열거하는 **다섯 줄**이 정본이다:
74/75(MemberStats) · **27/57(SymbolMaster)** · **20(GetLimitChaserReq)** · 26/68(Reconcile) · 30/31/70(NXT 상따).
과제 지시가 인용한 「26/68 · 30/31/70 · 74/75」는 이 목록의 부분집합이다 — 27/57 과 20 이 빠져 있다. **주석 전체를 쓴다.**

그런데 이 번호들은 **방향이 섞여 있다.** 생성 코드 `relay/src/generated/stock-dma/msg-type.ts` 실측:

| 번호 | 이름 | 방향 | 판정 |
|------|------|------|------|
| 57 | SymbolMasterResp | S→C | 범위 밖 유입 → **debug** |
| 68 | ReconcileAccountStateResp | S→C | 범위 밖 유입 → **debug** |
| 70 | SetLimitChaserNXTResp | S→C | 범위 밖 유입 → **debug** |
| 74 | MemberStatsResp | S→C | 범위 밖 유입 → **debug** |
| 75 | MemberStatsPush | S→C | 범위 밖 유입 → **debug** |
| 20 | GetLimitChaserReq | C→S | 요청이 수신 경로로 옴 → **warn 유지** |
| 26 | ReconcileAccountStateReq | C→S | 〃 |
| 27 | GetSymbolMasterReq | C→S | 〃 |
| 30 | SetLimitChaserNXTReq | C→S | 〃 |
| 31 | GetLimitChaserNXTReq | C→S | 〃 |

이 갈래는 새로 발명한 규칙이 아니라 **같은 파일이 이미 말하고 있는 규칙**이다 — `INBOUND_MSG_TYPES` 주석이
「요청 계열(1~34)이 수신 경로로 들어오는 것 자체가 이상 신호」라고 못박아 뒀다. 요청 번호까지 debug 로 내리면
이번 수정이 없애려던 바로 그 실명(失明)을 새로 만든다. 그래서 강등 집합은 **응답 대역 5종**이다.

## 드롭 경로 구조

- `relay/src/dma/envelope.ts:426` — `INBOUND_MSG_TYPES` 미포함이면 `drop("unknown-msg-type", msgType, payload)`
- `envelope.ts:168` — `drop()` 이 `droppedEnvelopes` 를 올리고 `logDroppedFrame(...)` 호출
- `relay/src/dma/codec.ts:110` — `logDroppedFrame` 이 **무조건 `logger.warn`**. 여기가 레벨의 유일한 소유자다.
- `codec.ts:183` — desync 경로도 같은 함수를 쓴다(레벨 바뀌면 안 된다 → 기본값 warn 유지)

## 카운터 판단 — 나누지 않는다 (과설계 금지)

`droppedFrameCount` 는 「이 프로세스가 지금까지 몇 프레임을 버렸나」를 세는 단조 증가값이고, 운영자가 재시작
간에 비교하는 숫자다. 둘로 쪼개면 기존 WARNING 줄의 `droppedFrameCount` 가 **조용히 다른 모집단을 세기 시작해**
Cloud Logging 에 이미 쌓인 값과의 연속성이 끊긴다. 두 모집단은 `reason` 필드로 이미 로그 쿼리에서 분리된다 —
새 상태를 만들 이유가 없다. **카운터는 한 개 그대로 두고, 그 이유를 코드 주석에 남긴다.**
</research_findings>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: GET /api/orders 복원 호출 + 라이브 병합 (순수 계층, UI 없음)</name>
  <files>webapp/src/lib/auth-fetch.ts, webapp/src/lib/chat-api.ts, webapp/src/lib/orders-api.ts, webapp/src/lib/__tests__/orders-api.test.ts</files>
  <read_first>
    webapp/src/lib/chat-api.ts (authFetch 정본), webapp/src/lib/api.ts (apiFetch·ApiClientError),
    packages/shared/src/relay.ts 의 DmaOrderRow·RelayOrderMsg·DmaOrderStatus,
    webapp/src/lib/__tests__/theme-api.test.ts 와 chat-sse.test.ts (mock 하네스 패턴)
  </read_first>
  <behavior>
    fetchTodayOrders:
    - 세션 있음 → `/api/orders` 를 **쿼리 문자열 없이** 호출하고 Authorization 헤더에 Bearer 토큰이 실린다
    - 세션 없음 → 서버 왕복 0회, UNAUTHENTICATED 성격의 ApiClientError
    - 응답은 bare array 그대로 반환 (envelope 언랩 금지)

    mergeTodayOrders(restored, live):
    - 같은 orderNo 인 복원 행 + 라이브 프레임 → 결과 행 **1개**
    - 같은 no 가 라이브에 A·E·C 세 번 들어 있으면 **index 0(가장 최신)** 프레임이 붙는다
    - orderNo 가 null 인 복원 행(접수 전 거부·타임아웃)은 어떤 프레임과도 합쳐지지 않고 id 로 유지된다
    - 복원 목록에 없는 라이브 no 는 **행을 만들지 않고** unmatched 로 보고된다
    - 정렬은 복원 순서(created_at DESC)를 보존한다

    orderDisplayStatus(row):
    - 라이브 nt "A"/"C"/"R" → 각각 접수/취소/거부로 이긴다
    - 라이브 nt "E" → 체결로 표시하되 **전량/부분을 주장하지 않는다**(프레임에 체결수량이 없다)
    - 라이브 없음 → 복원 행의 status 를 그대로 쓴다
  </behavior>
  <action>
    ① `webapp/src/lib/chat-api.ts` 의 private `authFetch` 를 `webapp/src/lib/auth-fetch.ts` 로 **그대로 옮겨**
    export 하고, chat-api.ts 는 그것을 import 하도록 바꾼다. 본문 로직은 한 줄도 바꾸지 않는다. 사본을 하나 더
    만들지 않는 것이 목적이다 — 인증 패턴이 두 벌이 되면 언젠가 한쪽만 고쳐진다(T-16-14 와 같은 규율).
    새 인증 방식을 발명하지 않는다.

    ② `webapp/src/lib/orders-api.ts` 를 만든다. 세 가지를 담는다:
      - `fetchTodayOrders(): Promise<DmaOrderRow[]>` — `authFetch<DmaOrderRow[]>("/api/orders")`.
        `date` 를 붙이지 않는다(위 research 의 근거를 파일 주석에 남긴다: KST 계산의 정본은 서버다).
      - 순수 함수 `mergeTodayOrders(restored, live)` — 반환은
        `{ rows: TodayOrderRow[]; unmatchedOrderNos: string[] }`. `TodayOrderRow` 는 `DmaOrderRow` 에
        `live: RelayOrderMsg | null` 을 더한 형태다. 라이브 접기는 **`no` 당 첫 등장만** 취한다
        (배열 앞이 최신이라는 사실을 그 자리 주석에 근거와 함께 못박는다).
      - 순수 함수 `orderDisplayStatus(row)` — 표시 라벨과 톤을 고른다. `DmaOrderStatus` 값을 라이브 프레임으로
        덮어쓰지 않는다: 체결 통보에는 체결수량이 없어 전량·부분을 구분할 수 없고, 모르는 것을 지어내면 그
        숫자로 매도 판단이 난다(account-panel 헤더 ⑤ 와 같은 규율).
      `unmatchedOrderNos` 를 **순수 함수가 보고하게** 두는 이유: 화면에 없는 주문이 생겼다는 사실은 순수하게
      판정할 수 있고, 그것을 어떻게 처리할지(재조회)는 컴포넌트 몫이라 타이머 없이 단위 테스트로 잠긴다.

    ③ `webapp/src/lib/__tests__/orders-api.test.ts` — behavior 블록 9케이스를 전부 잠근다. mock 하네스는
    `chat-sse.test.ts` 의 supabase `getSession` mock 과 `theme-api.test.ts` 의 `vi.mock('../api')` 를 그대로
    따른다. Bearer 헤더와 **요청 경로에 물음표가 붙지 않는다는 것**을 단언한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar &amp;&amp; pnpm --filter @gh-radar/shared run build &amp;&amp; pnpm --filter @gh-radar/webapp run test &amp;&amp; pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>
    webapp 스위트 exit 0 이고 기준선(680) 대비 케이스가 늘었다. chat-api 관련 기존 테스트가 한 건도 깨지지 않았다.
    `orders-api.ts` 가 `date` 를 조립하지 않고, 라이브 접기가 첫 등장을 취한다.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: My page 에 「오늘 주문」 카드 배선 + D-20 유예 명시적 해제 + Vercel 배포</name>
  <files>webapp/src/components/trading/today-orders-card.tsx, webapp/src/components/trading/__tests__/today-orders-card.test.tsx, webapp/src/components/trading/me-client.tsx, webapp/e2e/specs/me.spec.ts</files>
  <read_first>
    webapp/src/components/trading/me-client.tsx 전체, webapp/src/components/orderbook/account-panel.tsx 의
    `.rlist` 모바일 카드 행 + `.tbl-wrap` 구현부(리플로우·min-w-0 규율의 정본),
    webapp/e2e/specs/me.spec.ts 의 케이스 1 과 픽스처 상단, webapp/src/lib/__tests__/isin-labels.test.tsx (RTL 패턴)
  </read_first>
  <behavior>
    - 복원 3건(접수 2 · 취소 1)이 오면 3줄이 그려지고, 그중 취소 행이 취소로 표시된다
    - 같은 orderNo 의 라이브 프레임이 있으면 줄 수가 늘지 않고 그 줄의 상태만 바뀐다
    - 조회가 ApiClientError 로 실패해도 컴포넌트가 throw 하지 않고 안내 문구로 수렴한다
    - 복원 0건이면 빈 상태 문구를 낸다 (로딩 중과 구분된다)
  </behavior>
  <action>
    ① `today-orders-card.tsx` — `useRelayContext().orders` 와 `fetchTodayOrders()` 를 `mergeTodayOrders` 로 합쳐
    그리는 카드. 마운트 시 1회 조회. `unmatchedOrderNos` 가 비어 있지 않으면 **그 orderNo 당 최대 1회** 재조회한다
    (이미 요청한 orderNo 를 ref 의 Set 에 기록해 재진입을 막는다) — 페이지 로드 이후 낸 주문이 「오늘 주문」이라는
    이름의 목록에서 빠지는 것을 막되, 라이브 프레임으로 행을 합성하지는 않기 때문이다. 루프가 될 수 없다는 것을
    그 자리 주석에 적는다.
    표시 열: 시각 · 종목(stockCode 없으면 isin 폴백) · 매매구분 · 수량 · 가격 · 상태. 실패는 「불러오지 못했어요」
    계열 안내 한 줄로 수렴하고 **다른 섹션을 무너뜨리지 않는다**(E2E 와 프로덕션 양쪽에서 이 경로가 실제로 밟힌다).
    ★ 좁은 폭에서는 표가 아니라 카드 행이다. flex/grid 자식 중 `flex:1 1 auto; min-width:0` 은 종목명 하나뿐이고
    나머지는 `flex:none` 이다 — 이 규칙이 어긋나면 스크롤이 아니라 **조용한 잘림**이 된다(account-panel 헤더 ⑧,
    `tasks/lessons.md` 등재 함정). 색 토큰은 account-panel 이 쓰는 것과 같은 것만 쓴다.
    ② `me-client.tsx` — 계좌 카드 블록 **뒤**에 카드를 붙인다. 세로 순서 계약이 한 칸 늘었으므로 헤더 주석 ①
    에 그 사실을 반영한다. **헤더 주석 ⑤ 를 다시 쓴다** — 이 표를 만들지 않는다는 서술과 REST 라우트를 부르지
    않는다는 서술이 이제 사실이 아니다. 새 주석은 ⓐ RELAY-02 요구사항이 D-20 의 v1 유예를 이겼다는 것,
    ⓑ 조회는 **페이지당 1회**이고 계좌 카드 안(AccountPanel)이 아닌 이유(그 컴포넌트는 4표면 공유 + 계좌마다
    렌더 = 같은 응답 N회), ⓒ 미체결로는 취소된 주문을 담을 수 없다는 것을 담는다. T-16-02 의 취지(표면마다 조회
    경로를 늘리지 않는다)는 유지된다 — 늘어난 조회 표면은 **하나**다.
    ③ `today-orders-card.test.tsx` — RTL 로 behavior 4케이스. `useRelayContext` 와 `fetchTodayOrders` 를 mock 한다.
    ④ `me.spec.ts` — 케이스 1 의 부재 단언을 **존재 단언**으로 바꾼다. 카드의 `data-slot` 으로 단언하고,
    같은 spec 에 `/api/orders` 응답 스텁(접수 2 · 취소 1)을 `mockStockApi` 와 같은 자리에 추가한다. 세로 순서
    y 좌표 단언은 새 섹션이 마지막이므로 그대로 성립해야 한다 — 성립하는지 실행으로 확인한다.
    ⑤ 게이트 통과 후 **범위 A 만** 커밋한다(한글 메시지, `Co-Authored-By` 넣지 않는다). 그다음 repo **root** 에서
    수동 배포한다: `vercel pull --yes --environment=production` → `vercel build --prod` →
    `vercel deploy --prebuilt --prod`. root 에서 실행하는 이유는 `rootDirectory=webapp` 이라 webapp/ 에서 돌리면
    `webapp/webapp` ENOENT 가 나기 때문이다. 배포 확인은 `vercel inspect https://gh-radar-webapp.vercel.app`
    의 age 가 방금인지로 한다. **실계좌 주문을 내지 않는다 — POST 계열 호출 0회.**
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar &amp;&amp; pnpm --filter @gh-radar/webapp run test &amp;&amp; pnpm --filter @gh-radar/webapp run typecheck &amp;&amp; pnpm --filter @gh-radar/webapp exec playwright test specs/me.spec.ts specs/orderbook.spec.ts</automated>
    <human-check>배포 후 사용자가 프로덕션 https://gh-radar-webapp.vercel.app/me 를 새로고침한다 → 오늘 주문 3건(접수 2 · 취소 1)이 한 줄씩, 중복 없이 보이는가. 새 주문은 내지 않는다.</human-check>
  </verify>
  <done>
    webapp 단위 스위트 + me/orderbook E2E 가 exit 0. `orderbook.spec.ts` 케이스 6(REST 라우트 미사용)이 여전히
    통과한다. me-client 헤더 주석이 파일의 실제 동작과 일치한다. Vercel prod alias 가 방금 배포를 가리킨다.
    사용자가 프로덕션에서 3건을 확인했다.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 범위 밖 msg_type 드롭을 debug 로 분리 (relay — 커밋만, 배포 없음)</name>
  <files>relay/src/dma/msg-type.ts, relay/src/dma/codec.ts, relay/src/dma/envelope.ts, relay/src/dma/__tests__/envelope.test.ts</files>
  <read_first>
    relay/src/dma/msg-type.ts 「하지 않는 것」 블록, relay/src/generated/stock-dma/msg-type.ts (번호↔방향),
    relay/src/dma/envelope.ts:160-180 과 :415-430, relay/src/dma/codec.ts:104-127 과 :175-190,
    relay/src/dma/__tests__/envelope.test.ts:110-225 (warn 스파이 하네스 · buildBareEnvelope · droppedEnvelopeCount)
  </read_first>
  <behavior>
    - msg_type 75 → 드롭, reason 이 out-of-scope 계열, **logger.debug** 호출, logger.warn 미호출, 카운터 +1
    - msg_type 74 → 같음
    - msg_type 99(정체불명) → 드롭, reason `unknown-msg-type`, **logger.warn** 유지, 카운터 +1
    - msg_type 30(요청 대역, 범위 밖 목록에 있지만 C→S) → **logger.warn** 유지
    - desync 등 기존 드롭 경로는 레벨이 warn 그대로다
  </behavior>
  <action>
    ① `msg-type.ts` 에 `OUT_OF_SCOPE_INBOUND_MSG_TYPES: ReadonlySet&lt;number&gt;` 를 추가한다. 원소는
    **응답 대역 5종: 57 · 68 · 70 · 74 · 75**. 값은 생성 코드 enum 이름을 인용해 적고 리터럴을 지어내지 않는다.
    「하지 않는 것」 주석 블록을 고쳐 ⓐ 이 목록이 상수의 정본이라는 것, ⓑ **목록이 바뀌면 상수도 같이 바꾼다**는
    것, ⓒ 요청 대역(20·26·27·30·31)은 왜 여기 들어오지 않는지 — 요청이 수신 경로로 오는 것은 그 자체가 이상
    신호라는 `INBOUND_MSG_TYPES` 주석의 기존 규율 — 를 명시한다. 주석과 상수가 어긋날 수 없게 서로를 가리킨다.
    ② `codec.ts` 의 `logDroppedFrame` 필드에 `level?: "warn" | "debug"` 를 더하고 기본값 warn 으로 분기한다.
    로그 본문·필드 구성은 바꾸지 않는다 — desync 호출부(:183)는 인자를 한 글자도 고치지 않아 그대로 warn 이다.
    ③ `envelope.ts` 의 화이트리스트 미통과 분기에서 집합 포함 여부로 갈라, 포함이면 reason `out-of-scope-msg-type`
    + level debug, 아니면 기존 `unknown-msg-type` + warn 을 그대로 쓴다. `drop()` 이 `level` 을 넘길 수 있게
    선택 인자를 더하되 기본값은 warn 이라 나머지 호출부 전부가 무변경이다.
    **카운터는 나누지 않는다.** `droppedEnvelopes` 하나를 그대로 쓰고, 왜 나누지 않았는지(모집단이 조용히 바뀌면
    이미 쌓인 로그값과의 연속성이 끊기고, 두 모집단은 `reason` 으로 이미 분리된다)를 그 자리 주석에 남긴다.
    ④ `envelope.test.ts` — `beforeEach` 의 warn 스파이 옆에 debug 스파이를 같은 방식으로 추가하고, behavior
    5케이스를 잠근다. 기존 케이스 ⑤(99 → unknown + warn)는 지우지 않고 「debug 로 새지 않았다」 단언만 덧댄다.
    ⑤ **범위 B 만** 별도 커밋한다(한글 메시지, `Co-Authored-By` 넣지 않는다).
    ⑥ **배포하지 않는다.** 컨테이너 재시작이 DMA 세션을 끊고 지금은 장중이다. SUMMARY 에
    「배포 보류 — 마감(15:30 KST) 후 오케스트레이터가 실행」을 적고, 배포 명령(`scripts/deploy-relay.sh`,
    `DMA_HOST` 를 **주입하지 않는다** — 16-45 의 3단 우선순위가 실행 중인 컨테이너 값을 보존한다)과 배포 후 확인
    명령(`curl -s https://dma.jx1.io/healthz` → `dma:true` + `version` 이 새 커밋 해시)을 그대로 적어 둔다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar &amp;&amp; pnpm --filter @gh-radar/relay run test &amp;&amp; pnpm --filter @gh-radar/relay run typecheck &amp;&amp; pnpm --filter @gh-radar/relay run typecheck:tests</automated>
  </verify>
  <done>
    relay 스위트 exit 0 이고 기준선(397) 대비 케이스가 늘었다. `OUT_OF_SCOPE_INBOUND_MSG_TYPES` 의 원소 5개가
    전부 응답 대역이고, 요청 대역 번호는 하나도 들어 있지 않다. desync 드롭 경로의 인자가 무변경이다.
    gcloud 호출 0회 — 프로덕션 relay 는 손대지 않았다.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저 → Cloud Run `/api/orders` | 사용자 JWT 를 실어 남의 주문을 요청할 수 있는 지점 |
| 게이트웨이 → relay 프레임 | Verifier 없는 FlatBuffers 가 들어오는 지점 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-JCE-01 | Information Disclosure | `GET /api/orders` | high | mitigate | 기존 방어선을 **그대로 쓴다** — `requireAuth()` + 서비스 계층 `.eq("user_id", ...)`. 이 작업은 서버 라우트·서비스·스키마를 한 줄도 고치지 않는다(webapp 호출부만 추가). 토큰은 `authFetch` 한 곳에서만 붙는다 |
| T-JCE-02 | Spoofing | webapp 인증 패턴 | medium | mitigate | 새 인증 방식을 만들지 않는다. `authFetch` 를 **이동**만 하고 본문 무변경 — 사본이 생기면 한쪽만 고쳐진다 |
| T-JCE-03 | Tampering | 주문 접수 경로 | critical | mitigate | 이 작업은 **읽기 전용**이다. `POST` 계열 호출 0건, 실계좌 주문 0건. `orderbook.spec.ts` 케이스 6 이 REST 접수 부재를 계속 잠근다 |
| T-JCE-04 | Denial of Service | 재조회 루프 | medium | mitigate | unmatched orderNo 재조회는 orderNo 당 최대 1회(ref Set 가드). 폴링이 아니다 |
| T-JCE-05 | Repudiation | relay 드롭 로그 | high | mitigate | debug 강등을 **응답 대역 5종으로 한정**한다. 요청 대역·정체불명은 WARNING 유지 — 이번 수정이 진짜 이상 신호를 가리지 않게 하는 것이 목적 자체다 |
| T-JCE-06 | Tampering | npm/pip/cargo installs | n/a | accept | **신규 패키지 설치 0건.** 이 계획은 기존 의존성만 쓴다(@testing-library/react·vitest 는 이미 설치됨) — 패키지 정당성 게이트 대상이 없다 |
</threat_model>

<verification>
1. `pnpm --filter @gh-radar/shared run build` 를 **먼저** 돌린다 — 낡은 `packages/shared/dist` 를 보고
   typecheck 가 통과하는 함정이 이 저장소에 실재한다(16-41 이 데였다).
2. `pnpm -r test` exit 0 (기준선 2,044 passed / 191 파일 대비 증가).
3. `pnpm -r typecheck` + relay `typecheck:tests` exit 0.
4. Playwright `me.spec.ts` · `orderbook.spec.ts` 통과 (기준선 126 passed).
5. 프로덕션 라우트 도달성 — `webapp/.env.local` 의 `NEXT_PUBLIC_API_BASE_URL` 로
   `curl -s -o /dev/null -w '%{http_code}' "$API_BASE/api/orders"` → **401**. GET 이므로 아무것도 바꾸지 않고,
   401 이 나온다는 것이 「라우트가 배포돼 있고 인증이 붙어 있다」의 증거다. 값을 대화에 복사하지 않는다.
6. relay 프로덕션 무변경 확인 — 이 작업 동안 `gcloud` 호출 0회.
</verification>

<success_criteria>
- 사용자가 프로덕션 `/me` 를 새로고침해 오늘 주문 3건(접수 2 · 취소 1)을 **중복 없이** 확인했다.
- 복원 행과 wss 행이 같은 주문일 때 한 줄이고, 라이브가 이긴다.
- `me-client.tsx` 헤더 주석과 `me.spec.ts` 단언이 파일의 실제 동작과 일치한다(D-20 유예를 조용히 어기지 않았다).
- relay 에서 74/75 드롭이 debug 이고, 정체불명 msg_type 과 요청 대역 유입은 여전히 WARNING 이다.
- 커밋 2개(범위 A / 범위 B), 한글 메시지, `Co-Authored-By` 없음. relay 배포는 SUMMARY 에 절차와 함께 보류로 기록.
</success_criteria>

<output>
Create `.planning/quick/260910-jce-relay-02-relay/260910-jce-SUMMARY.md` when done.
SUMMARY 에 반드시 담을 것:
- 범위 A 가 닫은 것과 **닫지 못한 것**(예: 라이브 전용 행 미합성이 남기는 표시 공백)을 과장 없이
- RELAY-02 재판정 근거 — 「오늘 주문 목록 복원 응답 미관측」 잔여가 해소됐는지, 취소(`C`) 왕복 잔여는 별개인지
- **범위 B 배포 보류** — 마감 후 실행할 명령과 배포 후 확인 명령을 그대로
</output>
