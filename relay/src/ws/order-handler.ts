/**
 * Phase 16 Plan 08 — TRADE-03. **wss 주문 요청/응답 상관** (D-02).
 *
 * 이것은 재작성이 아니라 **이식**이다. `order/order-api.ts:340~565` 의 5단계 순서 ·
 * `statusOf` · `filledQtyOf` · 5초 타임아웃 문구를 그대로 옮기고 HTTP 껍데기만 벗겼다.
 * 순서가 곧 방어선이라 번호 주석 ①~⑤ 를 원본 그대로 유지한다.
 *
 * REST 에서 바뀐 것은 넷뿐이다:
 *   1. `userId` 는 요청 바디가 아니라 **연결**(`conn.userId`)에서 온다.
 *   2. 브라우저는 **ISIN 을 보낸다**(6자 단축코드가 아니다). `SymbolMap.lookup(isin)` 이
 *      `code`(`dma_orders.stock_code`)와 `market`("K"/"Q")을 채운다 (D-28 산술 유도 금지).
 *   3. `dma_orders` insert 를 **relay 가** 한다 (D-03). 반환 `id` 가 상관 1순위 키다.
 *   4. 타임아웃 응답은 HTTP 202 가 아니라 `{t:"order.result", status:"timeout"}` 1프레임이다.
 *
 * 결정 근거:
 *   D-02     주문은 relay wss 단일 경로다. 세션을 쥔 프로세스가 상관도 쥔다 — 두 경로가
 *            같은 `dma_orders` 행을 다투는 기간을 만들지 않는다.
 *   D-03     insert·update 를 전부 relay 가 한다. insert 는 `await`(id 가 상관 키),
 *            update 만 큐잉한다(D-32 — 수신 콜백에서 Supabase 를 await 하면 게이트웨이
 *            송신 큐가 찬다).
 *   T-16-01  `accountNo` 의 근거는 `session.allowedAccounts` **하나뿐**이다. 인바운드 바디도
 *            상태 프레임의 계좌 사본도 근거가 아니다 — 통과한 바이트는 실계좌 주문이 된다.
 *   T-16-03  대기 맵은 **연결 스코프**(`Map<C, ConnState>`)다. 전역 `rid` 맵을 만들지 않는다.
 *            `order.result` 는 **요청한 연결에만** 가고, 51 푸시(`{t:"order"}`)는 기존대로
 *            Hub 가 사용자 전 연결에 보낸다 — 두 규약이 다른 것이 의도다.
 *   T-16-07  대기열과 매칭되지 않는 통보(상따·VI 자동주문)는 **새 행으로 insert** 한다.
 *            PostgREST 의 update 는 0행이어도 에러가 아니므로, 조회 없이 갱신만 하면
 *            자동주문 기록이 조용히 사라진다 (Pitfall 18).
 *   T-16-09  계좌번호는 **로그에서만** 마스킹한다(`maskAccountNo`). 화면·프레임에는 전체다.
 *   T-16-10  같은 `rid`(**연결 스코프**) 또는 같은 `(accountNo,isin,side,price,qty)`
 *            (**사용자 스코프** — WR-02)가 대기 중이면 거부한다. 더블클릭·재전송·두 번째
 *            탭이 중복 체결로 이어지는 것이 이 파일 최악의 결과다. **취소는 그 튜플이
 *            아니라 `(accountNo,isin,"C",orgOrderNo)` 다** — 취소의 정체성은 원주문번호이고,
 *            가격·수량으로 묶으면 서로 다른 미체결의 연속 취소가 막힌다 (GC-WR-10).
 *
 * 함정 (Pitfall 9 / S-8):
 *   5초를 넘긴 주문은 **「실패」가 아니라 「결과 모름」**이다. 주문은 이미 나갔을 수 있으므로
 *   "실패"라고 말하면 사용자가 재주문해 중복 체결이 난다. 그래서 타임아웃 경로에는
 *   「실패」라는 단어를 쓰지 않고 「결과를 확인하지 못했습니다 — 미체결 목록을 확인해 주세요」
 *   만 쓴다. UI 는 이 상태에서 제출 버튼을 다시 열지 않는다.
 *
 * 하지 않는 것:
 *   - **소켓에 직접 쓰지 않는다.** 전송은 주입받은 `send`(= `WsFanout.#send`) 하나뿐이다 —
 *     전송 경로를 두 벌 만들면 한쪽이 대상 선택을 틀리는 순간 타인의 체결이 샌다 (T-16-02).
 *   - `statusOf`/`filledQtyOf` 를 재구현하지 않는다. `order/notice-status.ts` 에서 import 한다.
 *   - 주기 타이머를 만들지 않는다 (D-13). 여기 있는 `setTimeout` 은 요청 1건당 1개이고
 *     정산·거부·송신실패 어느 경로로 끝나든 반드시 `clearTimeout` 된다.
 *   - 세션이 없을 때 대신 로그인하지 않는다 (D-15). 세션 부재는 만들어 주는 것이 아니라 거부다.
 */
import type {
  DmaOrderStatus,
  OrderMarket,
  OrderSide,
  RelayAccount,
  RelayLimitChaser,
  RelayOrderCancelMsg,
  RelayOrderNewMsg,
  RelayOrderResultMsg,
  RelayViTrigger,
} from "@gh-radar/shared";

import { logger } from "../logger.js";
import {
  OrderBuildError,
  buildDirectOrderReq,
  fromWireSide,
  maskAccountNo,
  type ParsedOrderResp,
} from "../dma/envelope.js";
import { ORDER_RESP_TIMEOUT_MS, filledQtyOf, statusOf } from "../order/notice-status.js";
import type { HubOrderEvent } from "../hub/subscription-hub.js";
import type { OrderInsertRow, OrderUpdate } from "../store/orders.js";
import { safePgError } from "../store/pg-error.js";
import type { SymbolLookup } from "../store/symbols.js";

// ============================================================
// 계약 (전부 **최소 표면**이다 — 테스트가 스텁을 넣을 수 있게 좁힌다)
// ============================================================

/** 주문 핸들러가 세션에 요구하는 것. `DmaSession` 이 그대로 만족한다. */
export interface OrderHandlerSession {
  /** 운용 준비 여부. false 면 주문을 보내지 않는다 (D-15). */
  readonly isReady: boolean;
  /** **주문 허용 계좌의 유일한 원천** (T-16-01). */
  readonly allowedAccounts: RelayAccount[];
  send(payload: Uint8Array): boolean;
}

/** `SessionManager.get` 그대로. **여기서 대신 로그인하지 않는다** (D-15). */
export interface OrderHandlerSessions {
  get(userId: string): OrderHandlerSession | undefined;
}

/**
 * 주문 통보(51)의 출처 + 전략 캐시. `SubscriptionHub` 가 그대로 만족한다.
 *
 * 전략 조회 2종이 여기 있는 이유는 하나다: **`OrderResp(51)` 에는 계좌번호가 없다**
 * (fbs `table OrderResp` 에 `account_no` 필드 자체가 없다). 그런데 `dma_orders.account_no`
 * 는 NOT NULL 이므로, 자동주문 행을 만들려면 계좌를 어딘가에서 알아야 한다. 그 「어딘가」로
 * 지어낸 값이 아니라 **게이트웨이가 에코한 전략 등록값**(60/61)을 쓴다 — 상따는 그 ISIN 의
 * 전략이, VI 는 세션의 VI 설정이 계좌의 정본이다.
 */
export interface OrderNoticeSource {
  on(event: "order", listener: (e: HubOrderEvent) => void): unknown;
  /** 상따 전략 캐시. 자동주문 통보의 계좌·시장 출처다. */
  getLimitChasers(userId: string): RelayLimitChaser[];
  /** VI 전략 캐시. `undefined` = 아직 조회 못 함, `null` = 미등록 (16-06 3상태). */
  getViTrigger(userId: string): RelayViTrigger | null | undefined;
}

/** `dma_orders` 쓰기 창구 중 이 모듈이 쓰는 부분만 (D-03). */
export interface OrderRecorder {
  /** **`await`** — 반환 `id` 가 상관 1순위 키다 (A10). */
  insertRequest(row: OrderInsertRow): Promise<string>;
  /** **동기 O(1)** 여야 한다 (D-32). */
  enqueueUpdate(update: OrderUpdate): void;
  /**
   * `(userId, order_no)` 로 기존 행을 찾는다. 없으면 `null` → 자동주문 insert 분기 (Pitfall 18).
   *
   * `userId` 가 인자인 이유는 gap 1 이다 — 브로커 주문번호는 **일별 재사용 시퀀스**라
   * `order_no` 단독 조회는 남의 행·어제 행을 매치시킨다 (T-16-14 / T-16-15).
   */
  findIdByOrderNo(userId: string, orderNo: string): Promise<string | null>;
}

export type OrderHandlerDeps<C> = {
  sessions: OrderHandlerSessions;
  hub: OrderNoticeSource;
  orderStore: OrderRecorder;
  symbols: SymbolLookup;
  /**
   * 프레임 1건 전송. `WsFanout.#send` 를 그대로 넘긴다 — 이 모듈은 소켓을 모른다 (T-16-02).
   */
  send: (conn: C, msg: RelayOrderResultMsg) => void;
  /** 첫 통보 대기 상한(ms). 테스트가 줄여 쓴다. */
  timeoutMs?: number;
};

export interface OrderHandler<C> {
  /** 인바운드 주문 2종을 처리한다. 실패해도 throw 하지 않는다(거부 프레임으로 드러난다). */
  handle(conn: C, userId: string, msg: RelayOrderNewMsg | RelayOrderCancelMsg): Promise<void>;
  /** 연결 종료 정리. **타이머 누수 0** — 남기면 프로세스가 안 내려간다. */
  closeConn(conn: C): void;
  /** 전 연결 정리. 종료 절차가 부른다. */
  close(): void;
}

// ============================================================
// 내부 자료구조
// ============================================================

/**
 * 대기 중인 주문 1건. `order.result` 를 돌려줄 때까지 산다.
 *
 * `settle` 은 **정확히 한 번만** 실행된다(내부 `settled` 플래그). 통보와 타임아웃이 같은
 * 틱에 겹쳐도 프레임이 두 번 나가지 않는다.
 */
export type PendingOrder = {
  rid: string;
  orderRowId: string;
  isin: string;
  /**
   * 아래 다섯(`isin`·`qty`·`price`·`side`·`isCancel`/`orgOrderNo`)은 **통보 매칭 축**이다
   * (`narrowPending`). 저장만 하고 읽지 않으면 gap 2 가 재발한다 — ISIN 하나로만 고르던
   * 시절에는 「취소하고 다시 걸기」에서 살아 있는 매수 주문이 「취소됨」으로 표시됐다.
   * (IN-01 은 `qty` 가 실린 채 어디서도 읽히지 않던 그 상태의 이름이다.)
   */
  qty: number;
  price: number;
  /**
   * 이 대기의 매매구분 — **요청 원문**이다 (GC-WR-03).
   *
   * 취소 대기는 `""` 다. `handle` 이 계산하는 `const side = isCancel ? "S" : msg.side` 는
   * `dma_orders.side` CHECK(B/S 둘뿐)를 통과시키기 위한 **표기**이지 방향의 정본이 아니다
   * — 취소 요청 자체에 매매구분이 실리지 않는다(방향의 정본은 `orgOrderNo` 가 가리키는
   * 원주문 행이다). 그 표기를 여기로 가져오면 매도 취소가 아니라 **모든** 취소 대기가
   * 「매도」로 보여 ②-1 축이 남의 통보를 정산한다. 그래서 값을 비우고, ②-1 축은
   * `!p.isCancel` 인 후보에만 적용한다.
   */
  side: OrderSide | "";
  /** 이 대기가 취소 주문인가. 통보의 `noticeType`("C"/"M") 과 맞춘다. */
  isCancel: boolean;
  /** 취소 대기의 원주문번호. 신규는 `""` — 가장 강한 매칭 축이다. */
  orgOrderNo: string;
  timer: NodeJS.Timeout;
  settle: (notice: ParsedOrderResp | null) => void;
};

/**
 * 연결 1개의 주문 상태.
 *
 * `claims` 가 `pending` 과 **따로** 있는 이유: 중복 판정은 `dma_orders` insert(`await`)
 * **앞에서** 끝나야 한다. insert 를 기다리는 동안 두 번째 클릭이 들어오면, pending 만 보는
 * 검사는 아직 비어 있는 큐를 보고 통과시킨다 — 그것이 정확히 T-16-10 이 막으려는 중복 주문이다.
 * 그래서 요청 키는 **동기적으로** 먼저 잡고, 어느 경로로 끝나든 반드시 놓는다.
 */
type ConnState = {
  userId: string;
  claims: Set<string>;
  /**
   * **이 연결이 잡고 있는 사용자 스코프 dup 키** — `userDupKeys` 의 역인덱스다.
   *
   * 이게 없으면 탭을 닫은 뒤 그 키가 사용자 맵에 영원히 남아 같은 주문을 다시 낼 수 없다
   * (가드 leak). 연결 종료가 곧 회수 시점이라 추적을 연결 쪽에 둔다 (T-16-33).
   */
  dupKeys: Set<string>;
  pending: PendingOrder[];
};

/** 이 요청의 키 2종. **잡는 자료구조가 다르다** — 아래 두 함수의 주석이 그 이유다. */
type ClaimKeys = { rid: string; dup: string };

/**
 * 재전송 키 — **연결 스코프**다 (`ConnState.claims`, T-16-03 유지).
 *
 * `rid` 는 브라우저가 그 탭에서 만드는 값이라 탭 간 충돌이 없다. 사용자 축으로 올리면
 * 다른 탭이 우연히 같은 `rid` 를 만들었을 때 정상 주문이 거부된다.
 */
function ridKey(msg: RelayOrderNewMsg | RelayOrderCancelMsg): string {
  return `rid:${msg.rid}`;
}

/**
 * 중복 주문 키 — **사용자 스코프**다 (`userDupKeys`, WR-02 / T-16-31).
 *
 * `RelayProvider` 는 문서(탭)당 소켓 1개를 연다. 연결 스코프 가드는 같은 화면을 두 탭에
 * 띄우는 순간 무력해져 **완전히 동일한 주문 2건이 모두 통과**한다(재접속 직후도 같다).
 * 중복 체결이 이 파일 최악의 결과이므로 이 판정만 사용자 축으로 올린다.
 *
 * **요청 종류로 키가 갈린다** (GC-WR-10) — 「같은 주문」의 정의가 서로 다르기 때문이다.
 *
 *   · 신규: `(accountNo, isin, side, price, qty)`. 같은 값이면 같은 주문이다. 이 형태는
 *     **바뀌지 않는다** — 두 탭 동시 발주 차단이 여기 달려 있다 (T-16-31 / 16-22).
 *   · 취소: `(accountNo, isin, "C", orgOrderNo)`. **취소의 정체성은 원주문번호**이고
 *     가격·수량은 식별자가 아니다(취소 수량은 언제나 미체결 잔량 전부다 — UI D-21).
 *     가격·수량으로 묶으면 같은 종목·같은 가격·같은 잔량의 미체결 2건(다른 단말·전일
 *     잔여·자동주문으로 흔히 생긴다)에서 **두 번째 취소가 최대 5초 거부**된다. 급락
 *     국면에서 미체결 일괄 취소가 막히는 것은 자산 위험이고, 그 가드는 사고를 막는 것이
 *     아니라 사고를 만든다.
 *
 * 이 분기는 중복 가드를 **없애지 않는다.** 같은 `orgOrderNo` 로 두 번 누르면 키가 같으므로
 * 두 번째는 그대로 거부다 — 좁아진 것은 「무엇이 같은 취소인가」의 정의뿐이다.
 */
function dupKey(msg: RelayOrderNewMsg | RelayOrderCancelMsg): string {
  if (msg.t === "order.cancel") {
    return `dup:${msg.accountNo}|${msg.isin}|C|${msg.orgOrderNo}`;
  }
  return `dup:${msg.accountNo}|${msg.isin}|${msg.side}|${msg.price}|${msg.qty}`;
}

/** 두 키를 함께 만든다. 잡고 놓는 자리에서 한 쌍으로 다뤄야 누락이 없다. */
function claimKeys(msg: RelayOrderNewMsg | RelayOrderCancelMsg): ClaimKeys {
  return { rid: ridKey(msg), dup: dupKey(msg) };
}

/**
 * 거부·타임아웃 프레임의 `resultCode`.
 *
 * 게이트웨이 코드는 0(성공) 이상이므로 **음수는 relay 자체 판정**이라는 뜻이 된다. `0` 을
 * 쓰면 계약상 "성공"으로 읽히고, 그것이 거부·타임아웃 프레임에 실리면 최악의 오독이다.
 * 이 값은 `dma_orders.result_code` 에 **쓰지 않는다** — DB 에는 게이트웨이가 준 코드만 남긴다.
 */
const RELAY_RESULT_CODE = -1;

/**
 * `ensureRow` 의 결과 (WR-01).
 *
 * `string | null` 로 두지 않는 이유: 「행을 못 만들었다」와 「조회 자체가 실패했다」는 후속
 * 처리가 다르다. 전자는 드롭(사유는 이미 로그), 후자는 **`order_no` 셀렉터로 열화 갱신**이다
 * (S-5 — 조회가 죽었다고 통보를 버리지 않는다). 두 경우를 같은 `null` 로 뭉개면 그 열화
 * 경로가 사라진다.
 */
type EnsureResult =
  | { kind: "row"; id: string }
  | { kind: "lookup-failed" }
  | { kind: "unavailable" };

// ============================================================
// 팩토리
// ============================================================

export function createOrderHandler<C>(deps: OrderHandlerDeps<C>): OrderHandler<C> {
  const timeoutMs = deps.timeoutMs ?? ORDER_RESP_TIMEOUT_MS;
  /** **연결 스코프** 대기 맵 (T-16-03). 전역 `rid` 맵은 만들지 않는다. */
  const conns = new Map<C, ConnState>();
  /** userId → 그 사용자의 연결들. 통보 상관이 훑을 범위를 그 사용자로 좁힌다 (T-15-02). */
  const byUser = new Map<string, Set<C>>();
  /**
   * userId → 그 사용자가 **지금 대기 중인 주문의 dup 키** (WR-02 / T-16-31).
   *
   * **중복 판정은 사용자 스코프**다 — `RelayProvider` 는 탭당 소켓 1개를 열므로 연결 스코프
   * 가드는 두 번째 탭에서 무력하다. 반대로 `rid` 키는 브라우저가 만드는 값이라 탭 간 충돌이
   * 없으므로 **연결 스코프로 남긴다**(T-16-03 유지) — 두 요구는 애초에 다른 것이다.
   *
   * Set 이 비면 사용자 항목 자체를 지운다. 맵이 사용자 수만큼 무한히 자라면 그 자체가
   * 장기 실행 프로세스의 누수다 (T-16-33).
   */
  const userDupKeys = new Map<string, Set<string>>();
  /**
   * `${userId}|${orderNo}` → 진행 중인 「조회 → 없으면 insert」 왕복 (WR-01 / T-16-16).
   *
   * 같은 자동주문의 접수(A)·체결(E) 통보는 **수십 ms 간격**으로 겹쳐 온다. 각자 조회를
   * 시작하면 둘 다 「행 없음」을 보고 둘 다 insert 해 같은 주문이 감사 기록에 두 벌 남는다.
   * 그래서 첫 통보가 만든 Promise 를 두 번째가 **재사용**한다 — 왕복은 1회, 행도 1건이다.
   */
  const inflight = new Map<string, Promise<EnsureResult>>();

  function stateOf(conn: C, userId: string): ConnState {
    const existing = conns.get(conn);
    if (existing !== undefined) return existing;
    const created: ConnState = {
      userId,
      claims: new Set(),
      dupKeys: new Set(),
      pending: [],
    };
    conns.set(conn, created);
    const set = byUser.get(userId) ?? new Set<C>();
    set.add(conn);
    byUser.set(userId, set);
    return created;
  }

  function release(state: ConnState, keys: ClaimKeys): void {
    state.claims.delete(keys.rid);
    // **이 연결이 아직 그 키를 쥐고 있을 때만** 사용자 맵에서 회수한다. `closeConn` 이
    // 이미 회수한 뒤(= `dupKeys` 가 비었다) 진행 중이던 `handle` 이 늦게 놓으면, 그 사이
    // 다른 탭이 새로 잡은 **같은 키**를 풀어 주게 되어 중복 가드가 조용히 뚫린다.
    if (!state.dupKeys.delete(keys.dup)) return;
    dropUserDupKeys(state.userId, [keys.dup]);
  }

  /** 사용자 스코프 dup 키 회수. Set 이 비면 사용자 항목 자체를 지운다 (T-16-33). */
  function dropUserDupKeys(userId: string, keys: Iterable<string>): void {
    const held = userDupKeys.get(userId);
    if (held === undefined) return;
    for (const key of keys) held.delete(key);
    if (held.size === 0) userDupKeys.delete(userId);
  }

  function reject(conn: C, rid: string, message: string): void {
    deps.send(conn, {
      t: "order.result",
      rid,
      // 접수 전 거부라 주문번호가 없는 것이 **진실**이다. 지어내지 않는다.
      orderNo: "",
      resultCode: RELAY_RESULT_CODE,
      message,
      status: "rejected",
    });
  }

  // ----------------------------------------------------------
  // 통보 소비 — 대기열 매칭 → 정산, 못 찾으면 기록 경로
  // ----------------------------------------------------------

  deps.hub.on("order", ({ userId, notice }: HubOrderEvent) => {
    // **그 사용자의 연결만** 훑는다. 통보는 그 사용자의 세션에서 왔으므로 다른 사용자의
    // 대기 주문과 섞일 수 없다 (T-15-02). 그 안에서 ISIN 으로 **후보를 모으고**,
    // `narrowPending` 이 통보가 실어 온 축(`orgOrderNo`→`noticeType`→`side`→`quantity`→`price`)
    // 으로 하나까지 좁힌다. **좁히지 못하면 아무것도 정산하지 않는다** — 잘못 귀속된
    // 기록은 없는 기록보다 나쁘다 (gap 2 / T-16-29).
    //
    // 후보를 그 사용자의 **전 연결에서** 모으는 것이 연결 축 오귀속의 방어다 (T-16-30):
    // 「ISIN 이 맞는 첫 연결」을 고르면 탭 A 의 통보가 탭 B 의 대기를 정산한다.
    const candidates: { state: ConnState; entry: PendingOrder }[] = [];
    for (const conn of byUser.get(userId) ?? []) {
      const state = conns.get(conn);
      if (state === undefined) continue;
      for (const entry of state.pending) {
        if (entry.isin === notice.isin) candidates.push({ state, entry });
      }
    }

    const picked = narrowPending(
      candidates.map((c) => c.entry),
      notice,
    );
    const hit = picked === null ? undefined : candidates.find((c) => c.entry === picked);
    if (hit !== undefined) {
      const at = hit.state.pending.indexOf(hit.entry);
      if (at >= 0) hit.state.pending.splice(at, 1);
      hit.entry.settle(notice);
      return;
    }

    // 후보가 **1건이어도** 좁히지 못하고 끝날 수 있다 (GC-CR-01 이후) — 그 침묵을
    // 남기지 않는다 (무로그 fail-safe 금지 / T-16-51). 계좌번호·주문번호 원문은 싣지
    // 않는다 (T-16-32) — 후보 수와 축만으로 진단된다.
    if (candidates.length > 0 && picked === null) {
      logger.warn(
        { isin: notice.isin, noticeType: notice.noticeType, candidates: candidates.length },
        "[WS-order] 통보를 대기 항목 하나로 좁히지 못했다 — 아무것도 정산하지 않는다",
      );
    }

    // 후보가 없거나 좁히지 못했다. 남은 대기 항목은 **그대로 둔다** — 5초 타임아웃이
    // 「결과 모름」으로 끝내는 것이 이 상황의 진실이다 (Pitfall 9). 통보 자체는
    // 접수 이후의 것이거나 **자동주문**(상따·VI)이므로 기록 경로로 보낸다.
    // `.catch` 가 없으면 이 한 줄이 프로세스 종료 스위치다 — `index.ts` 의
    // `unhandledRejection` 핸들러는 `logger.fatal` + **프로세스 종료**이므로, 통보 1건의
    // 파손이 그 순간 접속한 **모든 사용자의 DMA 세션**을 끊는다. 그렇게 두지 않는다
    // (GC-WR-01). 원인 쪽(`ensureRow` 의 try 범위)도 함께 막았다 — 한 겹만 두면 원인은
    // 남고 증상만 가려진다.
    void recordUnmatched(userId, notice).catch((err: unknown) => {
      // 여기 `err` 는 PostgREST 가 아니다 — `recordUnmatched` 안의 Supabase 왕복 세 곳
      // (`findIdByOrderNo` ×2 · `insertRequest`)이 **각각** catch 로 종결되므로, 이 최후
      // 그물까지 오는 것은 조립·프로그래밍 예외뿐이고 그때는 스택이 유일한 단서다.
      // 안쪽 catch 를 하나라도 걷어내면 이 판정이 무효가 된다 (16-38 / R2-CR-03 판정).
      logger.error(
        { err, orderNo: notice.orderNo },
        "[WS-order] 통보 기록 경로 예외 — 이 통보는 기록되지 않았다 (stdout 이 두 번째 사본이다)",
      );
    });
  });

  /** 통보에서 뽑은 수명주기 갱신값. insert 든 update 든 같은 값을 쓴다. */
  function patchOf(notice: ParsedOrderResp): OrderUpdate {
    return {
      orderNo: notice.orderNo,
      status: statusOf(notice, null),
      resultCode: notice.resultCode,
      noticeType: notice.noticeType,
      message: notice.message,
      filledQty: filledQtyOf(notice),
      origin: notice.originKind,
    };
  }

  /**
   * 대기열과 매칭되지 않은 통보를 기록한다.
   *
   * **여기가 Pitfall 18 의 자리다.** PostgREST 의 update 는 대상이 0행이어도 에러가 아니다.
   * 그래서 조회 없이 `order_no` 로 갱신만 하면 상따·VI 자동주문 통보가 **조용히 사라진다** —
   * 사용자는 자기 계좌에서 나간 주문의 기록을 어디서도 볼 수 없게 된다 (T-16-07 Repudiation).
   *
   * **수동 주문도 이 분기를 탄다.** 옛 주석은 「행은 요청 시점에 이미 만들어졌으니(D-03 ③-2)
   * 여기 올 일이 없다」고 적었지만 그 전제는 틀렸다 — 실사용에서 두 경로가 여기로 온다
   * (GC-CR-02):
   *   1. **좁히기 실패** — 같은 종목·수량·가격의 매수/매도가 동시에 대기하면 `narrowPending`
   *      이 `null` 을 돌려준다 (테스트 ㉑ 이 그 상태를 고정한다).
   *   2. **연결 종료 후 도착** — `closeConn` 이 `state.pending` 을 비운 뒤 온 통보는 후보가
   *      0건이라 좁히기 경고조차 없이 여기로 떨어진다.
   *
   * 그리고 그 시점의 수동 행에는 **`order_no` 가 아직 없다** — insert 는 접수 전이라 주문번호를
   * 모르고(③-2), `finish` 가 정산할 때 비로소 채운다. 그래서 조회 없이 `order_no` 셀렉터로
   * 갱신하면 **0행**이고 PostgREST 는 그것을 에러로 주지 않는다. 이 분기가 조회를 거치는
   * 이유가 그것이다.
   *
   * 구 게이트웨이가 `origin` 을 비워 보내면 `toOrderOrigin` 이 `"manual"` 로 좁히므로 자동주문도
   * 이 길로 온다 — 그것은 와이어에 정보가 없는 것이라 relay 가 메울 수 없다(envelope.ts 가
   * 같은 이유를 적어 둔다).
   */
  async function recordUnmatched(userId: string, notice: ParsedOrderResp): Promise<void> {
    const patch = patchOf(notice);

    if (notice.originKind === "manual") {
      // 자동 분기와 **같은 조회**를 거친다. 「행이 있는가」는 조회해야만 알 수 있고, 모르는
      // 채로 보낸 갱신은 0행이어도 성공처럼 보인다 (GC-CR-02 / Pitfall 18).
      let existingId: string | null;
      try {
        existingId = await deps.orderStore.findIdByOrderNo(userId, notice.orderNo);
      } catch (err) {
        // 조회가 죽었다고 통보를 버리지 않는다 (S-5). 아래 `lookup-failed` 규율과 **동형**이다:
        // 셀렉터가 사용자·당일로 좁혀져 있으므로 없으면 0행이고 있으면 **내 행**이다.
        // `userId` 를 반드시 싣는다 (gap 1) — 없으면 `selectorOf` 가 `null` 을 돌려 드롭이다.
        // ★ 이 파일에서 **PostgREST 오류를 받을 수 있는** catch 는 전부 `safePgError` 를
        //   지난다 (16-38 / R2-CR-03 · T-16-45). 근거는 `store/pg-error.ts` docstring 한
        //   곳에만 있다 — 요약하면 제약 위반의 `details` 가 `dma_orders` 행 전체(계좌번호
        //   포함)를 실어 나른다. 여기 `err` 는 `findIdByOrderNo` = 조회 sink 가 던진 원문이다.
        logger.error(
          { pgError: safePgError(err), orderNo: notice.orderNo, noticeType: notice.noticeType },
          "[WS-order] 수동 통보 — 기존 행 조회 실패, 열화 갱신만 시도",
        );
        deps.orderStore.enqueueUpdate({ ...patch, userId });
        return;
      }

      if (existingId !== null) {
        // 행이 있음이 **확인된** 경우다. 이때만 갱신을 보낸다 — `order_no` 셀렉터는 확인
        // 없이 쓰지 않는다는 것이 이 분기의 규율이고, 확인했으므로 A10 1순위인
        // `orderRowId` 로 좁히는 것이 더 정확하다.
        deps.orderStore.enqueueUpdate({ ...patch, orderRowId: existingId });
        return;
      }

      // 붙을 행이 없다 = 이 갱신은 0행이다. **큐에 넣지 않는다** — 0행 update 는 아무것도
      // 하지 않으면서 성공으로 보이고, 그 침묵이 이 파일이 없애겠다고 선언한 Pitfall 18 이다.
      // 대신 통보 원문을 stdout 에 남긴다. relay stdout 이 D-24 의 두 번째 감사 사본이므로
      // 기록이 0 이 되지는 않는다 (S-5). 계좌번호는 51 통보에 실려 오지 않는다 (T-16-45).
      logger.error(
        {
          orderNo: notice.orderNo,
          noticeType: notice.noticeType,
          resultCode: notice.resultCode,
          isin: notice.isin,
          quantity: notice.quantity,
          price: notice.price,
        },
        "[WS-order] 대기·행 어디에도 붙지 않는 수동 통보 — stdout 이 유일한 기록이다",
      );
      return;
    }

    const result = await ensureRow(userId, notice);

    if (result.kind === "row") {
      // 수명주기 필드(결과코드·통보종류·메시지·체결수량)는 큐로 넘긴다 — insert 는 「요청」
      // 모양이고 그 뒤의 상태는 update 경로가 소유한다는 경계를 유지한다.
      deps.orderStore.enqueueUpdate({ ...patch, orderRowId: result.id });
      return;
    }

    if (result.kind === "lookup-failed") {
      // 조회가 실패했다고 통보를 버리지 않는다. 행이 있을 수도 있으니 갱신은 시도한다 —
      // 셀렉터가 사용자·당일로 좁혀져 있으므로 없으면 0행이고 있으면 **내 행**이다.
      // 조용히 넘기지는 않는다 (S-5).
      deps.orderStore.enqueueUpdate({ ...patch, userId });
    }
    // `unavailable` 은 드롭이다 — 사유는 `ensureRow`/`autoInsertRow` 가 이미 남겼다.
  }

  /**
   * 「조회 → 없으면 insert」를 **주문번호 단위로 한 번만** 수행한다 (WR-01 / T-16-16).
   *
   * 이 함수의 존재 이유는 경주다. 같은 자동주문의 접수·체결 통보가 insert 왕복(수십~수백 ms)
   * 중에 겹치면, 가드가 없을 때 두 통보가 각각 「행 없음」을 보고 각각 insert 한다 — 같은
   * 주문이 감사 기록에 두 벌 남고, 그 뒤의 갱신은 둘 중 하나에만 붙는다.
   *
   * 키는 `${userId}|${orderNo}` 다. 사용자를 키에 넣는 이유는 gap 1 과 같다 — 브로커
   * 주문번호는 일별 재사용 시퀀스라 그 자체로는 사용자를 가르지 않는다.
   */
  async function ensureRow(userId: string, notice: ParsedOrderResp): Promise<EnsureResult> {
    // 빈 주문번호는 상관 키가 아니다 — 합치면 서로 다른 거부가 한 행에 겹친다 (GC-WR-02).
    // 접수 전 거부("R")는 `orderNo === ""` 로 오므로, 키를 만들면 그 사용자의 **모든** 빈
    // 주문번호 통보가 `"user|"` 하나를 공유하고 동시 도착한 서로 다른 거부가 같은 `row.id`
    // 를 받아 차례로 덮어쓴다. 게다가 `findIdByOrderNo` 는 이 값에서 **항상 `null`** 이라
    // (`store/orders.ts` 의 빈 값 방어) 이 키에는 dedup 의 의미가 애초에 없다.
    if (notice.orderNo === "") return insertOnly(userId, notice);

    const key = `${userId}|${notice.orderNo}`;
    const running = inflight.get(key);
    if (running !== undefined) return running;

    const task = (async (): Promise<EnsureResult> => {
      let existingId: string | null;
      try {
        existingId = await deps.orderStore.findIdByOrderNo(userId, notice.orderNo);
      } catch (err) {
        logger.error(
          { pgError: safePgError(err), origin: notice.originKind, orderNo: notice.orderNo },
          "[WS-order] 자동주문 통보 — 기존 행 조회 실패, 갱신만 시도",
        );
        return { kind: "lookup-failed" };
      }

      // 이 자동주문의 첫 통보에서 이미 행을 만들었다. 이후 통보는 그 행의 갱신이다.
      if (existingId !== null) return { kind: "row", id: existingId };

      return insertOnly(userId, notice);
    })();

    inflight.set(key, task);
    try {
      return await task;
    } finally {
      // 왕복이 끝나면 키를 놓는다. 이후 통보는 새로 조회해 **이미 만들어진 행**을 찾는다.
      inflight.delete(key);
    }
  }

  /**
   * `ensureRow` 의 **insert 갈래**. 조회를 거치지 않고 새 행 하나를 만든다.
   *
   * 뽑아낸 이유가 둘이다.
   *   1. **`autoInsertRow` 를 try 안으로** 넣기 위해서다 (GC-WR-01). 그 함수는
   *      `deps.symbols.lookup` · `deps.hub.getLimitChasers` · `deps.hub.getViTrigger` 를
   *      부르는데, 예전에는 try **밖**이라 여기서 난 예외가 `recordUnmatched` 를 reject 시키고
   *      `index.ts` 의 `unhandledRejection`(= 프로세스 종료)까지 그대로 올라갔다.
   *   2. 빈 주문번호 갈래(GC-WR-02)가 in-flight 맵을 지나지 않고 곧장 여기로 오기 위해서다.
   *
   * 어느 경로로 실패하든 **행을 지어내지 않고** `unavailable` 로 끝낸다 — 사유는 stdout 에
   * 남으므로 기록이 0 이 되지는 않는다 (D-24).
   */
  async function insertOnly(userId: string, notice: ParsedOrderResp): Promise<EnsureResult> {
    try {
      const row = autoInsertRow(userId, notice);
      if (row === null) return { kind: "unavailable" }; // 사유는 `autoInsertRow` 가 남겼다.

      const orderRowId = await deps.orderStore.insertRequest(row);
      logger.info(
        {
          origin: notice.originKind,
          orderNo: notice.orderNo,
          noticeType: notice.noticeType,
          accountNo: maskAccountNo(row.accountNo),
        },
        "[WS-order] 자동주문 통보 — 대기 행이 없어 새 행으로 기록",
      );
      return { kind: "row", id: orderRowId };
    } catch (err) {
      logger.error(
        { pgError: safePgError(err), origin: notice.originKind, orderNo: notice.orderNo },
        "[WS-order] 자동주문 행 생성 실패 — 감사 기록 결손 (stdout 이 두 번째 사본이다)",
      );
      return { kind: "unavailable" };
    }
  }

  /**
   * 자동주문 통보 → insert 행. 만들 수 없으면 `null` 이고 사유를 남긴다.
   *
   * `dma_orders` 의 NOT NULL·CHECK 를 통과하지 못하는 값은 **지어내지 않는다.** 통과 못 할
   * 값으로 insert 하면 그 행 전체를 잃는데, 그건 「기록이 없다」와 결과가 같으면서 원인만
   * 더 어려워진다. 그래서 못 만들면 error 로그로 남긴다 — relay stdout 이 D-24 의 두 번째
   * 감사 사본이므로 기록이 0 이 되지는 않는다.
   */
  function autoInsertRow(userId: string, notice: ParsedOrderResp): OrderInsertRow | null {
    const ctx = { userId, origin: notice.originKind, orderNo: notice.orderNo, isin: notice.isin };

    // `qty`/`price` 는 CHECK > 0 이다. 접수·체결 통보는 항상 양수를 싣지만, 파손 프레임을
    // 그대로 밀어 넣어 행을 잃는 것보다 여기서 멈추고 사유를 남기는 편이 낫다.
    if (!Number.isInteger(notice.quantity) || notice.quantity <= 0) {
      logger.error({ ...ctx }, "[WS-order] 자동주문 통보의 수량이 0 이하 — 행을 만들 수 없다");
      return null;
    }
    if (!Number.isInteger(notice.price) || notice.price <= 0) {
      logger.error({ ...ctx }, "[WS-order] 자동주문 통보의 가격이 0 이하 — 행을 만들 수 없다");
      return null;
    }

    const strategy = strategyOf(userId, notice);
    const info = deps.symbols.lookup(notice.isin);
    // 시장은 종목마스터가 1순위다(원천이 `stocks`). 마스터가 아직 안 실렸으면 게이트웨이가
    // 에코한 전략 등록값을 쓴다 — 둘 다 없으면 CHECK 를 통과할 수 없으므로 멈춘다.
    const market: OrderMarket | null = info?.market ?? strategy?.market ?? null;
    if (market === null) {
      logger.error({ ...ctx }, "[WS-order] 자동주문 통보의 시장 구분 미상 — 행을 만들 수 없다");
      return null;
    }

    const accountNo = strategy?.accountNo ?? soleAccountOf(userId) ?? "";
    if (accountNo === "") {
      // **감사 우선**: 계좌를 몰라도 행은 남긴다. 빈 문자열은 「모른다」의 표현이고, 아무
      // 계좌나 골라 적는 것(= 남의 계좌로 귀속되는 기록)보다 압도적으로 낫다.
      logger.warn({ ...ctx }, "[WS-order] 자동주문 계좌 미상 — 계좌 없이 기록 (감사 우선)");
    }

    return {
      userId,
      accountNo,
      isin: notice.isin,
      code: info?.code ?? null,
      exchange: notice.exchange,
      market,
      // 취소·정정 통보의 매매구분은 브로커가 채울 값이 없다 (Pitfall 8). CHECK 가 B/S 둘만
      // 받으므로 취소 행은 "S" 로 적되, **방향의 정본은 `org_order_no` 가 가리키는 원주문
      // 행**이다 — 취소 행의 side 를 표시에 쓰지 말 것 (수동 취소 경로와 같은 규율).
      side: sideOf(notice),
      orderType: notice.noticeType === "C" ? "C" : "N",
      orgOrderNo: notice.orgOrderNo === "" ? undefined : notice.orgOrderNo,
      qty: notice.quantity,
      price: notice.price,
      origin: notice.originKind,
      // `status` 는 `'requested'` 로 시작하지 않아도 CHECK 를 통과한다(7종 전부 허용).
      // 이 행은 이미 접수·체결 이후이므로 통보에서 파생한 상태로 시작하는 것이 진실이다.
      status: statusOf(notice, null) ?? "accepted",
      orderNo: notice.orderNo,
    };
  }

  /**
   * 감사 행(`dma_orders.side`)에 적을 매매구분 — **표시해도 되는가**의 질문이다.
   *
   * ⚠️ 매칭 축 ②-1(`narrowPending`)과 이 함수는 **같은 필드를 다르게 쓴다.** 축은 「이 값으로
   * 후보를 **좁혀도** 되는가」를 묻고 여기는 「이 값을 **표시해도** 되는가」를 묻는다. 16-34 가
   * 판정했듯 `sideTrusted` 는 후자에는 맞지만 전자에는 한 겹 모자라다(거부 "R" 도 신뢰로
   * 표시되는데 취소 대기에도 온다) — 그래서 두 곳의 **적용 조건이 다른 것이 정상**이다.
   * 다만 **모르는 값을 지어내지 않는 규율은 공통**이라, 둘 다 `fromWireSide` 를 지난다.
   *
   * 세 갈래다:
   *   · `sideTrusted === false`(취소·정정 통보) → `"S"`. 취소·정정 요청에는 매매구분이 실리지
   *     않아 브로커가 채울 값이 없다(Pitfall 8). 위 행 조립 주석과 `handle` 의
   *     `const side = isCancel ? "S" : msg.side` 가 같은 규율이고, **방향의 정본은
   *     `org_order_no` 가 가리키는 원주문 행**이라는 뜻의 표기다.
   *   · 신뢰할 수 있고 해석되면 → 그 값. `startsWith("S") ? "S" : "B"` 는 쓰지 않는다 —
   *     빈 값(구 게이트웨이)·`"X"`·소문자 `"b"` 가 전부 `"B"` 가 되어 **매도 자동주문이 감사
   *     기록에 매수로 남는다** (R2-WR-06). `fromWireSide` 가 첫 글자로만 판정하고 아니면
   *     `null` 을 주는 그 규율이 정본이다(`envelope.ts` — 「모르는 값을 매수로 지어내지 않는다」).
   *   · 신뢰할 수 있는데 **해석되지 않으면**(빈 값·미지 표기) → 지어내지 않는다. 그런데
   *     `dma_orders.side` CHECK 는 `B`/`S` 둘뿐이라 **행을 남기려면 하나를 골라야 한다**
   *     (감사 우선 — 계좌 미상 분기와 같은 판단이다). 그래서 **취소 행과 같은 `"S"`** 를 적고
   *     사유를 `logger.warn` 으로 남긴다(S-5 — 무로그 fail-safe 금지).
   *
   * `"S"` 를 고른 이유(기본값을 `"B"` 에서 뒤집는 변경이라 근거를 적는다): 이 파일에서 `"S"` 는
   * 이미 **「이 행의 side 는 방향의 정본이 아니다」를 뜻하는 표기**로 쓰이고 있고(취소 행),
   * 그 규율을 읽는 사람에게 「믿지 말 것」이라고 위 주석이 말하고 있다. 모르는 값을 그 표기로
   * 수렴시키면 「믿을 수 없는 side」가 한 값으로 모인다. 반대로 `"B"` 는 이 파일 어디에서도
   * 「모른다」를 뜻하지 않는 **평범한 매수**이므로, 거기에 미지 값을 섞으면 매수 기록과
   * 구분되지 않는다. `dma_orders.side` 를 읽어 주문을 내는 경로는 없다(취소 주문의 방향은
   * 미체결 행에서 오고 그쪽은 `fromWireSide` 가 이미 지킨다) — 영향은 표시와 감사뿐이다.
   */
  function sideOf(notice: ParsedOrderResp): OrderSide {
    if (!notice.sideTrusted) return "S";
    const side = fromWireSide(notice.side);
    if (side !== null) return side;
    // 계좌번호는 싣지 않는다 (T-16-45). 어느 통보인지와 그 종류면 추적에 충분하다.
    logger.warn(
      { orderNo: notice.orderNo, noticeType: notice.noticeType },
      '[WS-order] 통보의 매매구분을 해석하지 못했다 — 감사 행에 "S"(방향 미상) 로 남긴다',
    );
    return "S";
  }

  /**
   * 자동주문의 계좌·시장 출처 — **게이트웨이가 에코한 전략 등록값**이다.
   *
   * 상따는 그 ISIN 의 전략이, VI 는 세션의 VI 설정이 정본이다. 51 통보에는 계좌번호가 없어서
   * (fbs 에 필드 자체가 없다) 여기 말고는 근거가 없다.
   */
  function strategyOf(
    userId: string,
    notice: ParsedOrderResp,
  ): { accountNo: string; market: OrderMarket | null } | null {
    if (notice.originKind === "limit_chaser") {
      const hit = deps.hub.getLimitChasers(userId).find((lc) => lc.isin === notice.isin);
      return hit === undefined ? null : { accountNo: hit.accountNo, market: hit.market };
    }
    const vi = deps.hub.getViTrigger(userId);
    // `undefined`(아직 조회 못 함)와 `null`(미등록) 둘 다 「계좌를 모른다」로 수렴한다.
    return vi === null || vi === undefined ? null : { accountNo: vi.accountNo, market: null };
  }

  /**
   * 세션에 계좌가 **정확히 하나**면 그것이다. 둘 이상이면 `null` — 고르는 순간 지어내는 것이고,
   * 잘못 고른 계좌로 남은 기록은 없는 기록보다 나쁘다.
   */
  function soleAccountOf(userId: string): string | null {
    const accounts = deps.sessions.get(userId)?.allowedAccounts ?? [];
    return accounts.length === 1 ? (accounts[0]?.accountNo ?? null) : null;
  }

  // ----------------------------------------------------------
  // 요청 처리 — order-api.ts ①~⑤ 이식
  // ----------------------------------------------------------

  async function handle(
    conn: C,
    userId: string,
    msg: RelayOrderNewMsg | RelayOrderCancelMsg,
  ): Promise<void> {
    const isCancel = msg.t === "order.cancel";
    const logCtx = {
      userId,
      t: msg.t,
      // 로그에는 뒤 4자리를 가린다. 화면에는 전체를 보여 준다 (T-16-09 / UI-SPEC D2).
      accountNo: maskAccountNo(msg.accountNo),
      isin: msg.isin,
      rid: msg.rid,
    };

    const state = stateOf(conn, userId);
    const keys = claimKeys(msg);

    // ⓪ **중복 방지** (T-16-10). insert 를 기다리는 동안 두 번째 클릭이 통과하지 않도록
    //    `await` 보다 **먼저**, 동기적으로 잡는다. `rid` 는 이 연결에서 보고, dup 키는
    //    **이 사용자의 전 연결**에서 본다 (WR-02) — 두 번째 탭도 같은 주문을 낼 수 없다.
    if (state.claims.has(keys.rid) || userDupKeys.get(userId)?.has(keys.dup) === true) {
      logger.warn(logCtx, "[WS-order] 이미 대기 중인 주문 — 중복 요청 거부");
      reject(conn, msg.rid, "같은 주문이 이미 처리 중입니다. 결과를 기다려 주세요.");
      return;
    }
    state.claims.add(keys.rid);
    state.dupKeys.add(keys.dup);
    const heldDupKeys = userDupKeys.get(userId) ?? new Set<string>();
    heldDupKeys.add(keys.dup);
    userDupKeys.set(userId, heldDupKeys);

    // ① 활성 Ready 세션이 있어야 한다. **여기서 대신 로그인하지 않는다** (D-15).
    const session = deps.sessions.get(userId);
    if (session === undefined || !session.isReady) {
      logger.warn({ ...logCtx, hasSession: session !== undefined }, "[WS-order] 세션 미준비 — 거부");
      release(state, keys);
      reject(conn, msg.rid, "실시간 세션이 없습니다. 호가창을 먼저 열어 주세요.");
      return;
    }

    // ② **계좌 화이트리스트 대조** — relay 쪽 최후 방어선이다 (T-16-01 / D-20).
    //    원천은 `session.allowedAccounts` 뿐이다. 인바운드 바디를 근거로 삼으면 IDOR 이다.
    if (!session.allowedAccounts.some((a) => a.accountNo === msg.accountNo)) {
      logger.error(logCtx, "[WS-order] 세션 계좌 목록 밖의 주문 시도 — 거부");
      release(state, keys);
      reject(conn, msg.rid, "이 세션에서 사용할 수 없는 계좌입니다.");
      return;
    }

    // ③ 취소는 원주문번호가 필수다. 스키마(`RelayOrderCancelSchema`)가 이미 강제하지만
    //    조립 단계가 **모든** 호출 경로의 마지막 관문이어야 하므로 방어적으로 재확인한다.
    const orgOrderNo = isCancel ? msg.orgOrderNo : "";
    if (isCancel && orgOrderNo === "") {
      logger.warn(logCtx, "[WS-order] 원주문번호 없는 취소 — 거부");
      release(state, keys);
      reject(conn, msg.rid, "취소 주문에는 원주문번호가 필요합니다.");
      return;
    }

    // ③-1 **ISIN 해석** (D-28). 모르는 종목·모르는 시장은 지어내지 않고 거부한다 — 기본값
    //     "K" 로 메우면 코스닥 주문이 코스피로 나간다 (T-16-05).
    const info = deps.symbols.lookup(msg.isin);
    if (info === undefined || info.market === null) {
      logger.error(
        { ...logCtx, known: info !== undefined },
        "[WS-order] ISIN → 단축코드·시장 해석 실패 — 거부 (게이트웨이로 나가지 않았다)",
      );
      release(state, keys);
      reject(conn, msg.rid, "이 종목은 지금 주문할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const side = isCancel ? "S" : msg.side;
    // ③-2 **`dma_orders` insert** (D-03). 게이트웨이 송신 **전에** 남긴다 (T-15-32) —
    //     나중에 남기면 그 사이에 죽었을 때 「나갔는지 모르는 주문」이 흔적 없이 사라진다.
    let orderRowId: string;
    try {
      orderRowId = await deps.orderStore.insertRequest({
        userId,
        accountNo: msg.accountNo,
        isin: msg.isin,
        code: info.code,
        exchange: msg.exchange,
        market: info.market,
        // 취소 통보에는 매매구분이 없어(Pitfall 8) 원주문 방향을 알 수 없다. CHECK 가 B/S
        // 둘만 받으므로 취소 행은 "S" 로 적고, 방향의 정본은 `org_order_no` 가 가리키는
        // 원주문 행이다 — 취소 행의 side 를 표시에 쓰지 말 것.
        side,
        orderType: isCancel ? "C" : "N",
        orgOrderNo: orgOrderNo === "" ? undefined : orgOrderNo,
        qty: msg.qty,
        price: msg.price,
        origin: "manual",
      });
    } catch (err) {
      // 기록에 실패했으면 **보내지 않는다.** 감사 기록 없는 실주문을 만드는 것보다,
      // 사용자에게 지금 못 보낸다고 말하는 편이 낫다 (D-24).
      logger.error(
        { pgError: safePgError(err), ...logCtx },
        "[WS-order] dma_orders 기록 실패 — 주문을 보내지 않는다",
      );
      release(state, keys);
      reject(conn, msg.rid, "주문 기록에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    // ③-3 **연결 생존 재확인** (GC-CR-03). 위 `await` 는 Supabase 왕복 수십~수백 ms 이고,
    //     그 사이에 사용자가 탭을 닫으면 `closeConn` 이 먼저 돌아 `state.pending` 을 비우고
    //     `conns`·`byUser` 에서 이 연결을 지운다. **보내기 전에 확인한다**가 유일한 안전한
    //     순서다 — 대기 등록·타이머 생성 이전이라 회수할 것이 없다. 뒤에서 확인하면 고아
    //     `ConnState` 에 매달린 대기가 통보 상관 후보가 되지 못한 채 5초 뒤 `timeout` 으로
    //     확정되고, **실제로 접수·체결된 주문이 감사 기록에 `timeout` 으로 남는다.**
    //     판정은 `conns.get(conn) !== state` 하나다 — `closeConn` 이 `conns.delete(conn)` 을
    //     하므로 이 비교가 「그 사이에 닫혔다」의 유일한 정본이다.
    if (conns.get(conn) !== state) {
      logger.warn({ ...logCtx, orderRowId }, "[WS-order] 요청 처리 중 연결 종료 — 주문을 보내지 않는다");
      // 행이 `requested` 로 영원히 남지 않게 한다 — 나가지 않은 주문의 진실은 `rejected` 다.
      deps.orderStore.enqueueUpdate({
        orderRowId,
        status: "rejected",
        message: "요청 처리 중 연결이 끊겨 주문을 보내지 않았습니다.",
      });
      // `closeConn` 이 이미 claims·dup 키를 회수했다면 `release` 는 조기 반환으로 무해하게
      // 지나간다(위 `release` 의 `dupKeys.delete` 가드). 아직 남아 있을 때만 실제로 푼다.
      release(state, keys);
      // `reject` 는 부르지 않는다 — 받을 소켓이 이미 없다. 닫힌 연결로 프레임을 쏘는 것은
      // 사용자에게 아무것도 알리지 못하면서 에러만 만든다.
      return;
    }

    let payload: Uint8Array;
    try {
      payload = buildDirectOrderReq({
        isin: msg.isin,
        accountNo: msg.accountNo,
        exchange: msg.exchange,
        market: info.market,
        side,
        orderType: isCancel ? "C" : "N",
        orgOrderNo,
        qty: msg.qty,
        price: msg.price,
      });
    } catch (err) {
      const code = err instanceof OrderBuildError ? err.code : "BUILD_FAILED";
      const reason =
        err instanceof OrderBuildError ? err.message : "주문 요청을 만들지 못했습니다.";
      // `err` 원문을 그대로 싣는 것이 여기서는 옳다 — 이 try 가 감싼 것은 `buildDirectOrderReq`
      // 하나이고 그것이 던지는 값은 `OrderBuildError`(`dma/envelope.ts`)뿐이다. PostgREST 가
      // 닿지 않는 자리라 `details` 유출 경로가 없고, 조립 실패는 스택이 유일한 단서다.
      // 메시지에도 값이 실리지 않는다(예: `BAD_ACCOUNT_NO` → "계좌번호 형식 위반") — 16-38 판정.
      logger.error({ err, ...logCtx, code }, "[WS-order] 주문 조립 거부 — 게이트웨이로 나가지 않았다");
      deps.orderStore.enqueueUpdate({ orderRowId, status: "rejected", message: reason });
      release(state, keys);
      reject(conn, msg.rid, reason);
      return;
    }

    // ④ 대기 등록을 **송신보다 먼저** 한다. 통보가 송신 직후 동기적으로 돌아오는
    //    테스트·저지연 환경에서 순서가 뒤바뀌면 응답을 영원히 놓친다.
    let settled = false;

    const drop = (): void => {
      const at = state.pending.indexOf(entry);
      if (at >= 0) state.pending.splice(at, 1);
      release(state, keys);
    };

    const finish = (notice: ParsedOrderResp | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(entry.timer);
      drop();

      if (notice === null) {
        // 5초를 넘겼다 = **「보냈는지 안 보냈는지 모른다」** (Pitfall 9). "실패"로 단정하지
        // 않는다 — 주문이 이미 나갔을 수 있고, 실패라고 말하면 재주문으로 중복 체결이 난다.
        deps.orderStore.enqueueUpdate({ orderRowId, status: "timeout" });
        logger.error({ ...logCtx, timeoutMs }, "[WS-order] 첫 주문 통보 미수신 — 결과 확인 필요");
        deps.send(conn, {
          t: "order.result",
          rid: msg.rid,
          orderNo: "",
          resultCode: RELAY_RESULT_CODE,
          message: "주문 결과를 확인하지 못했습니다. 미체결 목록을 확인해 주세요.",
          status: "timeout",
        });
        return;
      }

      const status: DmaOrderStatus = statusOf(notice, msg.qty) ?? "accepted";
      // 상관 1순위 키(`orderRowId`)로 좁히고, 이번에 알게 된 주문번호를 같이 채운다.
      deps.orderStore.enqueueUpdate({
        orderRowId,
        orderNo: notice.orderNo,
        status,
        resultCode: notice.resultCode,
        noticeType: notice.noticeType,
        message: notice.message,
        filledQty: filledQtyOf(notice),
        origin: notice.originKind,
      });
      logger.info({ ...logCtx, status, noticeType: notice.noticeType }, "[WS-order] 주문 통보 수신");
      deps.send(conn, {
        t: "order.result",
        rid: msg.rid,
        orderNo: notice.orderNo,
        resultCode: notice.resultCode,
        message: notice.message,
        status,
      });
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    // 종료 절차가 이 타이머에 매달리지 않게 한다 — 최대 5초짜리라 기다릴 이유가 없다.
    timer.unref?.();

    const entry: PendingOrder = {
      rid: msg.rid,
      orderRowId,
      isin: msg.isin,
      // 매칭 축 5종. 통보가 실어 오는 값과 대조할 수 있게 **요청 원문 그대로** 싣는다.
      qty: msg.qty,
      price: msg.price,
      // 취소 요청에는 매매구분이 없다 — 위 `const side` 의 "S" 는 DB CHECK 용 표기라
      // 여기로 가져오면 안 된다 (`PendingOrder.side` 주석 / GC-WR-03).
      side: isCancel ? "" : msg.side,
      isCancel,
      orgOrderNo,
      timer,
      settle: finish,
    };
    state.pending.push(entry);

    // ⑤ 송신. 실패하면 대기를 **즉시** 걷어낸다 — 5초를 기다릴 이유가 없다.
    if (!session.send(payload)) {
      settled = true;
      clearTimeout(timer);
      drop();
      deps.orderStore.enqueueUpdate({
        orderRowId,
        status: "rejected",
        message: "게이트웨이로 주문을 보내지 못했습니다.",
      });
      logger.error(logCtx, "[WS-order] 주문 송신 실패 — 게이트웨이 연결 없음");
      reject(conn, msg.rid, "게이트웨이로 주문을 보내지 못했습니다. 연결 상태를 확인해 주세요.");
      return;
    }
    logger.info(logCtx, "[WS-order] 주문 송신 — 첫 통보 대기");
  }

  // ----------------------------------------------------------
  // 정리
  // ----------------------------------------------------------

  /**
   * 연결 1개 정리.
   *
   * **`inflight` 은 건드리지 않는다** (WR-01): 진행 중인 Supabase 왕복을 끊으면 그게 곧
   * 기록 결손이다. 그 Promise 는 연결이 아니라 주문번호에 매여 있고, `finally` 가 스스로
   * 키를 놓는다.
   */
  function closeConn(conn: C): void {
    const state = conns.get(conn);
    if (state === undefined) return;
    // 타이머를 남기면 프로세스가 안 내려가고, 이미 닫힌 소켓으로 프레임을 쏘게 된다.
    for (const p of state.pending) clearTimeout(p.timer);
    state.pending.length = 0;
    state.claims.clear();
    // 이 연결이 잡은 사용자 스코프 dup 키를 **반드시** 회수한다. 남기면 탭을 닫은 뒤
    // 같은 주문을 영원히 못 낸다 (가드 leak / T-16-33). `close()` 도 이 경로를 지나므로
    // 전 연결 정리에 별도 처리가 필요 없다.
    dropUserDupKeys(state.userId, state.dupKeys);
    state.dupKeys.clear();
    conns.delete(conn);

    const set = byUser.get(state.userId);
    if (set !== undefined) {
      set.delete(conn);
      if (set.size === 0) byUser.delete(state.userId);
    }
  }

  function close(): void {
    for (const conn of [...conns.keys()]) closeConn(conn);
  }

  return { handle, closeConn, close };
}

// ============================================================
// 통보 매칭 (순수 함수 — 단위 테스트가 직접 친다)
// ============================================================

/**
 * 브로커 주문번호 비교용 정규화 — **앞뒤 공백 제거 + 선행 0 제거**.
 *
 * 규칙의 정본은 relay 가 아니라 게이트웨이다: `gh-trade/server/src/trade/account/
 * AccountManager.cpp:607-621` 의 `NormalizeOrderNo` 가 정확히 같은 두 줄을 한다(주석 그대로
 * 「주문번호 정규화 — 공백 제거 + 선행 0 제거」). 원장(OCX TR)과 브로커 통보의 표기가 어긋나
 * **같은 주문 하나가 「원장에만 있음」+「서버에만 있음」 두 건의 어긋남**으로 잡히던 사고를
 * 막으려고 거기 들어간 함수다. 여기서 막으려는 것도 같은 부류다 (R2-WR-03①).
 *
 * 표기가 갈리는 경로가 실제로 있다 — 완전일치를 전제로 삼으면 진실을 잃는다:
 *   · 와이어 주문번호 필드는 10자리 **고정폭**이고 `IntToChar`(`broker/krx/
 *     KRXOrderProtocol.h:256`)가 **0 으로 좌패딩**한다. 브로커는 그 10바이트를 `strncpy` 로
 *     그대로 옮긴다(`broker/kb/KBBroker.cpp:1341-1342`) — 통보 쪽은 패딩이 붙어 온다.
 *   · 반면 요청 쪽 값은 미체결 목록에서 왔고, 그 목록에는 원장 유입분·재기동 복원분(TOML)이
 *     섞인다(`AccountManager.cpp:830-840` — 「키는 원장 표기를 그대로 쓴다」). 패딩이 없을 수
 *     있는 자리다.
 *   · 게이트웨이는 값의 정체성을 **숫자**로 본다: `CharToUint64`(`KRXOrderProtocol.h:243-251`)
 *     는 숫자가 아닌 문자를 건너뛰고 자릿값만 누적한다. 즉 정규화는 이 값의 **원래 규약**이지
 *     relay 가 새로 만든 관대함이 아니다.
 *
 * 완전일치를 고집하면 실패의 모양이 나쁜 쪽이다 — 하드 필터가 후보를 0으로 만들고 `null` 이
 * 나가면 5초 뒤 `finish(null)` → `status:"timeout"` 이라, **실제로 접수·확인된 취소가 감사
 * 기록에 「결과를 확인하지 못했습니다」로 남는다.**
 *
 * ⚠️ **부작용**: 선행 0 을 지우면 `"0000012345"` 와 `"12345"` 가 같아진다. 이 축은 언제나
 *    `p.isCancel` 과 함께 걸리므로 오귀속이 성립하려면 **같은 종목의 취소 대기 2건**이 동시에
 *    살아 있고 그 둘의 주문번호가 **선행 0 만** 다른 값이어야 한다. KB 주문번호 대역은
 *    3,406,000,000 부터라 10자리를 꽉 채워 선행 0 이 없다(`KRXOrderProtocol.h:240-242`,
 *    그리고 `AccountManager.cpp:614` 이 같은 사실을 「현 주문번호 대역(3404~)은 선행 0 이
 *    없어 지금은 무동작이다」로 적어 뒀다). 충돌 확률이 현 대역에서 0 인 쪽과, 표기가 갈릴
 *    확률이 위 세 경로만큼 있는 쪽을 저울질한 결과가 이 방향이다.
 *
 * 「값 없음」은 `""` 하나로 수렴한다 — 공백만 담긴 필드(`FillSpaces`)도, 0 으로 채워진 고정폭
 * 필드도 여기서 `""` 가 된다. 게이트웨이의 `NormalizeOrderNo` 는 맵 키라 전부 0 일 때
 * 마지막 한 자리(`"0"`)를 남기지만 **여기서는 그 한 줄만 일부러 다르다**: 이 함수의 반환값이
 * `""` 면 「원주문번호 축 없음」을 뜻하는데, `"0"` 을 축으로 쓰면 존재하지 않는 주문번호
 * 0 번을 실어 온 것으로 읽혀 **신규 통보가 취소 대기만 남기고 0건 → 통째로 미정산**이 된다.
 * 같은 규칙, 다른 용도다.
 */
export function normalizeOrderNo(raw: string): string {
  const t = raw.trim();
  let z = 0;
  while (z < t.length && t[z] === "0") z += 1;
  return t.slice(z);
}

/**
 * 「이 통보는 **신규 대기**의 것」이라고 단정할 수 있는 통보 종류 — **화이트리스트**다
 * (R2-IN-03 / R2-WR-03③).
 *
 * 블랙리스트(`noticeType !== "" && !== "R"`)였을 때의 문제: 장래에 추가될 종류(부분취소·예약
 * 확인 등)가 전부 `false` 로 떨어져 **신규 대기 쪽으로** 좁혀진다. 확장될 때마다 조용히
 * 오분류하는 형태라, 아는 값만 축으로 쓰고 모르는 값은 **축을 건너뛴다** — 이 파일의 `refine`
 * 규율과 같은 방향이다(축이 틀렸을 가능성이 후보를 전부 지우는 것보다 낫다).
 *
 * 채택 근거 (gh-trade 원본에서 확인한 것):
 *   · `server/src/protocol/StockDMA.fbs:204` — 「"A"=접수 "E"=체결 "C"=취소확인 "M"=정정확인
 *     "R"=거부」. 프로토콜 계약 그대로다.
 *   · `server/src/broker/kb/KBBroker.cpp:1367`(접수 → 'A') · `:1420`(체결 → 'E'),
 *     `server/src/broker/mock/MockBroker.h:104`·`:125` — 실브로커·Mock 둘 다 **명시로** 채운다.
 *   · 취소성("C"/"M")은 이 함수의 하드 필터가 이미 걸렀고, 거부("R")는 신규·취소 **어느 쪽에도**
 *     온다(그래서 예전부터 축에서 빠져 있었다).
 *
 * ⚠️ **알고 받아들인 잔여 위험 — "A" 는 기본값이기도 하다.** `ExecutionReport.noticeType` 의
 *    선언 기본값이 `'A'` 라(`server/src/broker/IBroker.h:118`) 이 필드를 채우지 않는 브로커에서는
 *    취소확인도 'A' 로 온다. 교보가 그 상태다 — `server/src/broker/kyobo/KyoboBroker.cpp:406`
 *    이 「noticeType → 기본 'A'(접수) 라 취소확인/정정확인이 접수로 처리된다」고 적어 뒀다.
 *    그럼에도 "A" 를 남기는 이유는 **그 경로가 relay 에 닿지 않기 때문**이다: 같은 주석
 *    (`:404`)이 「termId/origin (0) → Server 콜백의 GetSession(0) 실패 → 모든 통보가 전달
 *    포기」라고 적고 있고, 같은 목록에서 `orgOrderNo` 도 채우지 않는다고 밝힌다(그 브로커에서는
 *    취소 정산 자체가 서지 않는다). **교보 경로가 살아나는 날 이 집합을 다시 판정해야 한다.**
 *
 * ②(통보 종류 축)와 ②-1(매매구분 축)이 **같은 집합**을 본다 — 두 축이 각자 리터럴을 들고
 * 있으면 언젠가 한쪽만 갱신된다.
 */
const NEW_ORDER_NOTICE_TYPES: ReadonlySet<string> = new Set(["A", "E"]);

/**
 * ISIN 이 일치하는 대기 후보들을 **통보가 실어 온 축으로 하나까지 좁힌다** (gap 2 / T-16-29).
 *
 * 하나로 좁히지 못하면 `null` 이다. 「가장 오래된 것」 폴백을 두지 않는 이유가 이 함수의
 * 전부다 — **잘못 귀속된 기록은 없는 기록보다 나쁘다.** 폴백이 있던 시절의 실패는 이렇다:
 * 매수 주문을 낸 5초 안에 같은 종목의 미체결을 취소하면, 먼저 도착한 취소확인이 **신규
 * 대기**를 정산해 살아 있는 매수 주문이 화면에 「취소됨」으로 뜬다. 사용자가 그 표시를 믿고
 * 재주문하면 중복 체결이다 — 이 파일이 스스로 「최악의 결과」라고 적어 둔 상황이다.
 *
 * ①~④ 를 **하드 필터가 아니라 단계적 좁히기**로 쓰는 이유: 구 게이트웨이는 `noticeType` 을
 * 비워 보내고(fbs 주석), 체결 통보의 `quantity`·`price` 는 주문값이 아니라 **체결값**이다
 * (부분체결이면 다르다). 하드 필터로 쓰면 정상 통보가 후보를 전부 지워 매칭이 통째로
 * 실패한다. 그래서 각 단계는 **남는 후보가 0이 되면 적용하지 않는다** — 축이 틀렸을
 * 가능성이 후보를 전부 지우는 것보다 낫다.
 *
 * **그러나 그 근거의 유효 범위는 「비어 있는 축」까지다** (GC-CR-01). 통보가 **실제로 실어
 * 온** 강한 축(비어 있지 않은 `orgOrderNo` · 취소성 `noticeType` "C"/"M")은 후보 수와
 * 무관한 **하드 필터**다 — 구 서버 호환은 「비어 있는 축을 건너뛴다」였지 「실어 온 축을
 * 무시한다」가 아니었다. 후보가 1건이어도 그 축과 어긋나면 정산하지 않는다.
 *
 * 그 하드 필터의 비교는 **정규화 뒤에** 한다 (R2-WR-03① / `normalizeOrderNo`). 표기 차이는
 * 「축이 어긋난 것」이 아니라 **같은 값의 다른 표기**이고, 둘을 구분하지 못하면 실제로
 * 접수·확인된 취소가 감사 기록에 `timeout` 으로 남는다. 그리고 축이 후보를 **전부** 지운
 * 상황은 전용 로그로 남긴다 (R2-WR-03②) — 어느 축이 원인인지 알 수 없는 침묵은 실계좌에서
 * 원인 추적을 통째로 잃는다.
 */
export function narrowPending(candidates: PendingOrder[], n: ParsedOrderResp): PendingOrder | null {
  if (candidates.length === 0) return null;

  // ★ 하드 필터 — `refine` 과 **규율이 다르다.** 하드 필터는 결과가 0건이면 `null` 을
  //   돌려주고, `refine` 은 0건이면 그 축을 건너뛴다. 두 규율이 갈리는 지점은 오직
  //   「통보가 그 축을 **실어 왔는가**」다. 비어 있는 축은 여기서도 적용하지 않으므로
  //   구 게이트웨이 호환은 그대로다 (GC-CR-01).
  const isCancelNotice = n.noticeType === "C" || n.noticeType === "M";
  // 비교는 **정규화 뒤에** 한다 (R2-WR-03① / `normalizeOrderNo` 의 근거 참조). 요청 문자열과
  // 통보 문자열은 서로 다른 단말이 만든 표기라, 선행 0 하나가 달라도 완전일치는 깨지고 그
  // 취소는 영영 정산되지 않는다.
  const noticeOrgNo = normalizeOrderNo(n.orgOrderNo);
  // 두 축을 **따로** 세운다 — 후보가 0건이 됐을 때 「어느 축이 지웠는가」를 로그가 말할 수
  // 있어야 한다 (R2-WR-03②). 한 번에 `filter` 하면 그 정보가 사라진다.
  //
  // 원주문번호를 실어 온 통보는 **그 취소 대기**의 것이다. 신규 통보는 이 값이 "" 다.
  const byOrgOrderNo =
    noticeOrgNo === ""
      ? candidates
      : candidates.filter((p) => p.isCancel && normalizeOrderNo(p.orgOrderNo) === noticeOrgNo);
  // 취소확인·정정확인은 **취소 대기**의 것이다. 신규 대기를 정산하면 살아 있는 주문이
  // 화면에 「취소됨」으로 뜨고, 사용자가 그것을 믿고 재주문하면 중복 체결이다.
  const hard = isCancelNotice ? byOrgOrderNo.filter((p) => p.isCancel) : byOrgOrderNo;
  // 아무것도 정산하지 않는다 — 5초 타임아웃이 이 상황의 진실이다 (Pitfall 9).
  if (hard.length === 0) {
    // 이 침묵은 일반 미매칭과 **다르다.** 바깥 통보 루프의 warn(「좁히지 못했다」)은 후보 수만
    // 말할 뿐 원인 축을 구분하지 못하는데, 여기서는 원인이 둘 중 하나로 특정된다 —
    // `afterOrgOrderNo === 0` 이면 **원주문번호 축**이, 그 이상인데 최종 0건이면 **취소성
    // 통보 축**이 지운 것이다. 표기 어긋남으로 취소가 통째로 타임아웃되는 상황이 정확히
    // 앞의 갈래이고, 그것을 로그에서 갈라내지 못하면 실계좌에서 원인을 짚을 수 없다.
    //
    // 주문번호 **원문은 싣지 않는다** (T-16-45 — ㉑ 이 같은 규율을 잠그고 있다). 길이·적용
    // 여부·축별 잔존 수만으로 진단된다.
    logger.warn(
      {
        isin: n.isin,
        noticeType: n.noticeType,
        candidates: candidates.length,
        afterOrgOrderNo: byOrgOrderNo.length,
        orgOrderNoApplied: noticeOrgNo !== "",
        orgOrderNoLen: noticeOrgNo.length,
        cancelNoticeApplied: isCancelNotice,
      },
      "[WS-order] 강한 축이 후보를 전부 지웠다 — 아무것도 정산하지 않는다",
    );
    return null;
  }
  if (hard.length === 1) return hard[0] ?? null;

  let pool = hard;
  /** 축 1개를 적용한다. 남는 후보가 0이면 **그 축은 없던 것으로 한다**. */
  const refine = (keep: (p: PendingOrder) => boolean): void => {
    const next = pool.filter(keep);
    if (next.length > 0) pool = next;
  };

  // ① 취소 축. 원주문번호가 가장 강하다 — 신규 통보는 이 값을 비워 보낸다.
  //    위 하드 필터와 조건이 같아 여기까지 온 후보는 이미 통과했다. 무해한 중복이므로
  //    남겨 둔다 — 축 순서 ①~④ 의 문서적 대응을 깨지 않는 편이 읽기에 낫다.
  if (noticeOrgNo !== "") {
    refine((p) => p.isCancel && normalizeOrderNo(p.orgOrderNo) === noticeOrgNo);
  }

  // ② 통보 종류 축. **화이트리스트**다 (R2-IN-03) — 채택 근거와 잔여 위험은
  //    `NEW_ORDER_NOTICE_TYPES` 주석에 있다. 취소성("C"/"M")은 위 하드 필터가 이미 걸렀고,
  //    여기서는 **접수·체결의 반대 방향**(신규 통보 → 신규 대기)을 좁히는 몫이 남는다.
  //    거부("R")·빈 값(구 서버)·**모르는 종류**는 축을 건너뛴다 — 「신규」로 단정할 근거가
  //    그 값에 없다. 부정 조건(`!== "R"`)으로 적으면 장래에 추가될 종류가 자동으로 신규가 된다.
  if (NEW_ORDER_NOTICE_TYPES.has(n.noticeType)) {
    refine((p) => !p.isCancel);
  }

  // ②-1 매매구분 축 (GC-WR-03). 매수 10@70000 과 매도 10@70000 이 동시에 대기하면
  //     ③④ 로는 영원히 갈리지 않는다 — 그 둘을 가르는 유일한 값이 방향이고, 접수 통보는
  //     그것을 실어 온다. 축을 안 쓰면 **실제로 접수된 주문 2건이 모두** 「결과를 확인하지
  //     못했습니다」로 끝난다.
  //
  //     적용 조건이 세 겹인 이유:
  //       · `sideTrusted` — 취소·정정 통보(C/M)에는 매매구분이 없다. 요청에 담기지 않아
  //         브로커가 채울 값이 없고 MockBroker 는 "B" 를 남긴다 (Pitfall 8 / envelope.ts:1186).
  //       · `noticeType` 이 `NEW_ORDER_NOTICE_TYPES`("A"/"E") — 거부("R")와 빈 값(구 서버)은
  //         **취소 대기에도 온다.** ② 축과 **같은 집합**을 본다(R2-IN-03) — 리터럴을 두 벌
  //         적으면 통보 종류가 늘어나는 날 한쪽만 갱신된다.
  //         취소거부의 `side` 는 브로커 기본값이므로 그것으로 좁히면 살아 있는 신규 주문이
  //         「거부됨」으로 뜬다. ② 가 "R" 을 건너뛰는 것과 같은 근거다.
  //       · `fromWireSide` 가 `null` 이 아님 — 첫 글자로만 판정하고, 모르는 값은 매수로
  //         지어내지 않는다 (envelope.ts:1322-1333 의 규율을 그대로 쓴다).
  //
  //     ③④ 보다 **앞**인 이유: 체결 통보의 수량·가격은 부분체결이면 주문값과 다르지만
  //     방향은 어떤 통보에서도 변하지 않는다 — 더 강한 축이 먼저다.
  //
  //     `refine` 이므로 남는 후보가 0이면 이 축은 없던 것으로 한다. 하드 필터가 아니다.
  if (n.sideTrusted && NEW_ORDER_NOTICE_TYPES.has(n.noticeType)) {
    const noticeSide = fromWireSide(n.side);
    if (noticeSide !== null) {
      refine((p) => !p.isCancel && p.side === noticeSide);
    }
  }

  // ③ 수량 축 · ④ 가격 축. 체결("E")은 부분체결이면 주문값과 다르므로 둘 다 건너뛴다.
  if (n.noticeType !== "E") {
    if (n.quantity > 0) refine((p) => p.qty === n.quantity);
    if (n.price > 0) refine((p) => p.price === n.price);
  }

  return pool.length === 1 ? (pool[0] ?? null) : null;
}
