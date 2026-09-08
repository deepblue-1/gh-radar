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
 *   T-16-10  같은 `rid` 또는 같은 `(accountNo,isin,side,price,qty)` 가 대기 중이면 거부한다.
 *            더블클릭·재전송이 중복 체결로 이어지는 것이 이 파일 최악의 결과다.
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
  RelayAccount,
  RelayOrderCancelMsg,
  RelayOrderNewMsg,
  RelayOrderResultMsg,
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

/** 주문 통보(51)의 출처. `SubscriptionHub` 가 그대로 만족한다. */
export interface OrderNoticeSource {
  on(event: "order", listener: (e: HubOrderEvent) => void): unknown;
}

/** `dma_orders` 쓰기 창구 중 이 모듈이 쓰는 부분만 (D-03). */
export interface OrderRecorder {
  /** **`await`** — 반환 `id` 가 상관 1순위 키다 (A10). */
  insertRequest(row: OrderInsertRow): Promise<string>;
  /** **동기 O(1)** 여야 한다 (D-32). */
  enqueueUpdate(update: OrderUpdate): void;
  /** `order_no` 로 기존 행을 찾는다. 없으면 `null` → 자동주문 insert 분기 (Pitfall 18). */
  findIdByOrderNo(orderNo: string): Promise<string | null>;
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
type PendingOrder = {
  rid: string;
  orderRowId: string;
  isin: string;
  qty: number;
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
  pending: PendingOrder[];
};

/** 중복 판정 키 2종 (T-16-10). `rid` 는 재전송, 파라미터 조합은 더블클릭을 잡는다. */
function claimKeys(msg: RelayOrderNewMsg | RelayOrderCancelMsg): [string, string] {
  const side = msg.t === "order.new" ? msg.side : "C";
  return [
    `rid:${msg.rid}`,
    `dup:${msg.accountNo}|${msg.isin}|${side}|${msg.price}|${msg.qty}`,
  ];
}

/**
 * 거부·타임아웃 프레임의 `resultCode`.
 *
 * 게이트웨이 코드는 0(성공) 이상이므로 **음수는 relay 자체 판정**이라는 뜻이 된다. `0` 을
 * 쓰면 계약상 "성공"으로 읽히고, 그것이 거부·타임아웃 프레임에 실리면 최악의 오독이다.
 * 이 값은 `dma_orders.result_code` 에 **쓰지 않는다** — DB 에는 게이트웨이가 준 코드만 남긴다.
 */
const RELAY_RESULT_CODE = -1;

// ============================================================
// 팩토리
// ============================================================

export function createOrderHandler<C>(deps: OrderHandlerDeps<C>): OrderHandler<C> {
  const timeoutMs = deps.timeoutMs ?? ORDER_RESP_TIMEOUT_MS;
  /** **연결 스코프** 대기 맵 (T-16-03). 전역 `rid` 맵은 만들지 않는다. */
  const conns = new Map<C, ConnState>();
  /** userId → 그 사용자의 연결들. 통보 상관이 훑을 범위를 그 사용자로 좁힌다 (T-15-02). */
  const byUser = new Map<string, Set<C>>();

  function stateOf(conn: C, userId: string): ConnState {
    const existing = conns.get(conn);
    if (existing !== undefined) return existing;
    const created: ConnState = { userId, claims: new Set(), pending: [] };
    conns.set(conn, created);
    const set = byUser.get(userId) ?? new Set<C>();
    set.add(conn);
    byUser.set(userId, set);
    return created;
  }

  function release(state: ConnState, keys: [string, string]): void {
    state.claims.delete(keys[0]);
    state.claims.delete(keys[1]);
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
    // 대기 주문과 섞일 수 없다 (T-15-02). 그 안에서 ISIN 으로 다시 좁힌다.
    for (const conn of byUser.get(userId) ?? []) {
      const state = conns.get(conn);
      if (state === undefined) continue;
      const index = state.pending.findIndex((p) => p.isin === notice.isin);
      if (index < 0) continue;

      const [entry] = state.pending.splice(index, 1);
      entry?.settle(notice);
      return;
    }

    // 대기열에 없다 = 접수 이후의 통보이거나 **자동주문**(상따·VI)이다. 16-08 Task 3 이
    // 이 자리에 insert 분기를 붙인다.
    void recordUnmatched(notice);
  });

  /**
   * 대기열과 매칭되지 않은 통보를 기록한다.
   *
   * Task 2 시점의 동작은 원본(`order-api.ts`)과 같다 — `order_no` 로 좁혀 갱신만 한다.
   * Task 3 이 「행이 없으면 insert」 분기를 여기에 더한다 (Pitfall 18 / T-16-07).
   */
  async function recordUnmatched(notice: ParsedOrderResp): Promise<void> {
    deps.orderStore.enqueueUpdate({
      orderNo: notice.orderNo,
      status: statusOf(notice, null),
      resultCode: notice.resultCode,
      noticeType: notice.noticeType,
      message: notice.message,
      filledQty: filledQtyOf(notice),
      origin: notice.originKind,
    });
    await Promise.resolve();
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
    //    `await` 보다 **먼저**, 동기적으로 잡는다.
    if (state.claims.has(keys[0]) || state.claims.has(keys[1])) {
      logger.warn(logCtx, "[WS-order] 이미 대기 중인 주문 — 중복 요청 거부");
      reject(conn, msg.rid, "같은 주문이 이미 처리 중입니다. 결과를 기다려 주세요.");
      return;
    }
    state.claims.add(keys[0]);
    state.claims.add(keys[1]);

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
      qty: msg.qty,
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

  function closeConn(conn: C): void {
    const state = conns.get(conn);
    if (state === undefined) return;
    // 타이머를 남기면 프로세스가 안 내려가고, 이미 닫힌 소켓으로 프레임을 쏘게 된다.
    for (const p of state.pending) clearTimeout(p.timer);
    state.pending.length = 0;
    state.claims.clear();
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
