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
 *            탭이 중복 체결로 이어지는 것이 이 파일 최악의 결과다.
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
  maskAccountNo,
  type ParsedOrderResp,
} from "../dma/envelope.js";
import { ORDER_RESP_TIMEOUT_MS, filledQtyOf, statusOf } from "../order/notice-status.js";
import type { HubOrderEvent } from "../hub/subscription-hub.js";
import type { OrderInsertRow, OrderUpdate } from "../store/orders.js";
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
   * 아래 넷(`isin`·`qty`·`price`·`isCancel`/`orgOrderNo`)은 **통보 매칭 축**이다
   * (`narrowPending`). 저장만 하고 읽지 않으면 gap 2 가 재발한다 — ISIN 하나로만 고르던
   * 시절에는 「취소하고 다시 걸기」에서 살아 있는 매수 주문이 「취소됨」으로 표시됐다.
   * (IN-01 은 `qty` 가 실린 채 어디서도 읽히지 않던 그 상태의 이름이다.)
   */
  qty: number;
  price: number;
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
 */
function dupKey(msg: RelayOrderNewMsg | RelayOrderCancelMsg): string {
  const side = msg.t === "order.new" ? msg.side : "C";
  return `dup:${msg.accountNo}|${msg.isin}|${side}|${msg.price}|${msg.qty}`;
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
    // `narrowPending` 이 통보가 실어 온 축(`orgOrderNo`→`noticeType`→`quantity`→`price`)
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

    if (candidates.length > 1) {
      // 계좌번호·주문번호 원문은 싣지 않는다 (T-16-32) — 후보 수와 축만으로 진단된다.
      logger.warn(
        { isin: notice.isin, noticeType: notice.noticeType, candidates: candidates.length },
        "[WS-order] 통보를 대기 항목 하나로 좁히지 못했다 — 아무것도 정산하지 않는다",
      );
    }

    // 후보가 없거나 좁히지 못했다. 남은 대기 항목은 **그대로 둔다** — 5초 타임아웃이
    // 「결과 모름」으로 끝내는 것이 이 상황의 진실이다 (Pitfall 9). 통보 자체는
    // 접수 이후의 것이거나 **자동주문**(상따·VI)이므로 기록 경로로 보낸다.
    void recordUnmatched(userId, notice);
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
   * 수동 주문은 이 분기를 타지 않는다: 행은 요청 시점에 이미 만들어졌고(D-03 ③-2 / REST 는
   * server 가), 여기 오는 것은 접수 이후의 체결·취소확인이다. 구 게이트웨이가 `origin` 을
   * 비워 보내면 `toOrderOrigin` 이 `"manual"` 로 좁히므로 자동주문도 이 길로 온다 — 그것은
   * 와이어에 정보가 없는 것이라 relay 가 메울 수 없다(envelope.ts 가 같은 이유를 적어 둔다).
   */
  async function recordUnmatched(userId: string, notice: ParsedOrderResp): Promise<void> {
    const patch = patchOf(notice);

    if (notice.originKind === "manual") {
      // 접수 이후의 통보다. `order_no` 로 행을 좁혀 갱신한다 (A10 셀렉터 2순위).
      // **`userId` 를 반드시 싣는다** (gap 1): 없으면 `selectorOf` 가 `null` 을 돌려 이
      // 갱신이 통째로 드롭되고, 접수 이후 수동 통보가 전부 사라진다.
      deps.orderStore.enqueueUpdate({ ...patch, userId });
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
    const key = `${userId}|${notice.orderNo}`;
    const running = inflight.get(key);
    if (running !== undefined) return running;

    const task = (async (): Promise<EnsureResult> => {
      let existingId: string | null;
      try {
        existingId = await deps.orderStore.findIdByOrderNo(userId, notice.orderNo);
      } catch (err) {
        logger.error(
          { err, origin: notice.originKind, orderNo: notice.orderNo },
          "[WS-order] 자동주문 통보 — 기존 행 조회 실패, 갱신만 시도",
        );
        return { kind: "lookup-failed" };
      }

      // 이 자동주문의 첫 통보에서 이미 행을 만들었다. 이후 통보는 그 행의 갱신이다.
      if (existingId !== null) return { kind: "row", id: existingId };

      const row = autoInsertRow(userId, notice);
      if (row === null) return { kind: "unavailable" }; // 사유는 `autoInsertRow` 가 남겼다.

      try {
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
          { err, origin: notice.originKind, orderNo: notice.orderNo },
          "[WS-order] 자동주문 행 생성 실패 — 감사 기록 결손 (stdout 이 두 번째 사본이다)",
        );
        return { kind: "unavailable" };
      }
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

  /** 통보의 매매구분. 믿을 수 없으면(취소·정정) 위 주석의 규율대로 "S" 다. */
  function sideOf(notice: ParsedOrderResp): OrderSide {
    if (!notice.sideTrusted) return "S";
    return notice.side.startsWith("S") ? "S" : "B";
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
      logger.error({ err, ...logCtx }, "[WS-order] dma_orders 기록 실패 — 주문을 보내지 않는다");
      release(state, keys);
      reject(conn, msg.rid, "주문 기록에 실패했습니다. 잠시 후 다시 시도해 주세요.");
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
      // 매칭 축 4종. 통보가 실어 오는 값과 대조할 수 있게 **요청 원문 그대로** 싣는다.
      qty: msg.qty,
      price: msg.price,
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
 * ISIN 이 일치하는 대기 후보들을 **통보가 실어 온 축으로 하나까지 좁힌다** (gap 2 / T-16-29).
 *
 * 하나로 좁히지 못하면 `null` 이다. 「가장 오래된 것」 폴백을 두지 않는 이유가 이 함수의
 * 전부다 — **잘못 귀속된 기록은 없는 기록보다 나쁘다.** 폴백이 있던 시절의 실패는 이렇다:
 * 매수 주문을 낸 5초 안에 같은 종목의 미체결을 취소하면, 먼저 도착한 취소확인이 **신규
 * 대기**를 정산해 살아 있는 매수 주문이 화면에 「취소됨」으로 뜬다. 사용자가 그 표시를 믿고
 * 재주문하면 중복 체결이다 — 이 파일이 스스로 「최악의 결과」라고 적어 둔 상황이다.
 *
 * 축을 **하드 필터가 아니라 단계적 좁히기**로 쓰는 이유: 구 게이트웨이는 `noticeType` 을
 * 비워 보내고(fbs 주석), 체결 통보의 `quantity`·`price` 는 주문값이 아니라 **체결값**이다
 * (부분체결이면 다르다). 하드 필터로 쓰면 정상 통보가 후보를 전부 지워 매칭이 통째로
 * 실패한다. 그래서 각 단계는 **남는 후보가 0이 되면 적용하지 않는다** — 축이 틀렸을
 * 가능성이 후보를 전부 지우는 것보다 낫다.
 */
export function narrowPending(candidates: PendingOrder[], n: ParsedOrderResp): PendingOrder | null {
  // 후보 1개는 지금까지의 정상 경로다(대부분의 실사용). 여기서 회귀가 없어야 한다.
  if (candidates.length <= 1) return candidates[0] ?? null;

  let pool = candidates;
  /** 축 1개를 적용한다. 남는 후보가 0이면 **그 축은 없던 것으로 한다**. */
  const refine = (keep: (p: PendingOrder) => boolean): void => {
    const next = pool.filter(keep);
    if (next.length > 0) pool = next;
  };

  // ① 취소 축. 원주문번호가 가장 강하다 — 신규 통보는 이 값을 비워 보낸다.
  if (n.orgOrderNo !== "") {
    refine((p) => p.isCancel && p.orgOrderNo === n.orgOrderNo);
  }

  // ② 통보 종류 축. 거부("R")는 신규·취소 어느 쪽에도 오므로 이 축을 쓰지 않는다.
  if (n.noticeType !== "" && n.noticeType !== "R") {
    const isCancelNotice = n.noticeType === "C" || n.noticeType === "M";
    refine((p) => p.isCancel === isCancelNotice);
  }

  // ③ 수량 축 · ④ 가격 축. 체결("E")은 부분체결이면 주문값과 다르므로 둘 다 건너뛴다.
  if (n.noticeType !== "E") {
    if (n.quantity > 0) refine((p) => p.qty === n.quantity);
    if (n.price > 0) refine((p) => p.price === n.price);
  }

  return pool.length === 1 ? (pool[0] ?? null) : null;
}
