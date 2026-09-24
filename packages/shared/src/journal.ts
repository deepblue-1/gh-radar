import type { OrderSide, OrderType, RelayExchange } from "./relay";

/**
 * Phase 19 — 계좌 기준 주문 저널 행 계약 (`dma_account_orders` 의 공개 뷰).
 *
 * 원천: 관찰자 기록기(relay 19-05)가 게이트웨이 주문 저널을 `dma_journal_apply` 로 투영한 행이다.
 * 행은 **계좌 기준**이다 — 누가 냈든(웹앱·HTS·자동주문) 그 계좌의 주문이면 한 행이 된다.
 *
 * - D-05: 「오늘 주문」 카드는 이 새 테이블만 읽는다. 구 `dma_orders` 는 동결됐고, 그 행 계약은
 *   19-06 에서 shared 에서 삭제됐다 — 옛 계약을 남기면 다음 소비자가 동결 테이블 모양을 다시 쓴다.
 * - D-06: 누가 어느 행을 보는지는 DB 조인(`user_id → dma_credentials.dma_user_id →
 *   dma_account_access → 계좌`)이 정본이다. 이 모듈은 가시성을 판정하지 않는다.
 * - D-08 · T-19-08: 주문자(`dma_user_id`)는 **싣지 않는다** — 주문자 표시를 하지 않기로 했고,
 *   같은 계좌를 보는 다른 사용자에게 남의 DMA 사용자 id 가 새면 안 된다. 조회 RPC
 *   (`dma_journal_orders_for_user`)와 적용 RPC 반환 `rows` 가 이미 같은 공개 컬럼 25종만 낸다.
 *
 * ★ **REST(server `GET /api/orders`)와 wss 푸시(relay `journal.rows`)가 같은 매퍼
 *   `toJournalOrderRow` 를 쓴다 — 두 벌 금지.** 두 벌이면 REST 행과 푸시 행의 모양이 갈라져
 *   카드의 병합 키(`id` · `lastSeq`)가 틀어진다.
 */

/**
 * 저널 행의 수명주기 상태 6종 (`dma_account_orders.status` CHECK 와 같은 값).
 *
 * `requested` · `timeout` 은 **없다** — 둘은 relay 즉시응답(`order.result`) 전용 상태이고,
 * 저널 행은 게이트웨이가 실제로 기록한 사실(접수·체결·취소·정정·거부)에서만 생긴다.
 * `modified` 는 원주문 행 전용 종결 상태다(잔량이 정정으로 새 주문번호에 옮겨가 닫힘).
 */
export type JournalOrderStatus =
  | "accepted"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected"
  | "modified";

/** 주문 출처 3종 (`dma_account_orders.origin` CHECK 와 같은 값). 미상은 컬럼이 NULL 이다. */
export type JournalOrderOrigin = "manual" | "limit_chaser" | "vi";

/**
 * 조회·적용 RPC 가 내는 행 원문 (snake_case 25종 — RPC `RETURNS TABLE` 정의 그대로).
 *
 * nullable 여부는 테이블 정의를 따른다. `last_seq` 는 Postgres `bigint` 라 PostgREST/jsonb
 * 직렬화 경로에 따라 문자열로 올 수 있어 `number | string` 으로 받는다.
 */
export type JournalOrderDbRow = {
  id: string;
  trade_date: string;
  account_no: string;
  isin: string;
  stock_code: string | null;
  exchange: RelayExchange;
  board: string | null;
  side: OrderSide | null;
  order_type: OrderType;
  org_order_no: string | null;
  qty: number | null;
  price: number | null;
  order_no: string | null;
  filled_qty: number;
  modified_qty: number;
  status: JournalOrderStatus;
  result_code: number | null;
  notice_type: string | null;
  message: string | null;
  origin: JournalOrderOrigin | null;
  requester: string | null;
  request_kind: string | null;
  last_seq: number | string;
  created_at: string;
  updated_at: string;
};

/**
 * 공개 컬럼 25종 — 조회 RPC 반환 컬럼 · 적용 RPC `rows` 키와 같은 목록이다.
 * `dma_user_id` 는 들어 있지 않다(T-19-08). 테스트가 이 목록으로 부재를 단언한다.
 */
export const JOURNAL_ORDER_PUBLIC_COLUMNS = [
  "id",
  "trade_date",
  "account_no",
  "isin",
  "stock_code",
  "exchange",
  "board",
  "side",
  "order_type",
  "org_order_no",
  "qty",
  "price",
  "order_no",
  "filled_qty",
  "modified_qty",
  "status",
  "result_code",
  "notice_type",
  "message",
  "origin",
  "requester",
  "request_kind",
  "last_seq",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof JournalOrderDbRow)[];

/**
 * `GET /api/orders` 응답 1건 · `journal.rows` 푸시 1건 (camelCase).
 *
 * 주문자 필드(`dmaUserId`)는 **없다** — D-08 로 주문자를 표시하지 않고, 같은 계좌를 보는
 * 다른 사용자에게 주문자 식별자가 새지 않게 한다(T-19-08).
 */
export type JournalOrderRow = {
  id: string;
  /** KST 거래일 `YYYY-MM-DD`. */
  tradeDate: string;
  /** 게이트웨이 정규화값 그대로(재정규화하지 않는다). */
  accountNo: string;
  /** 12자 KRX 표준코드. */
  isin: string;
  /** 6자 단축코드. 마스터에 없으면 null. */
  stockCode: string | null;
  exchange: RelayExchange;
  /** 게이트웨이 보드 원문. 모르면 null. */
  board: string | null;
  /** 매매 구분. C/M 통보만 받은 행처럼 확실하지 않으면 null. */
  side: OrderSide | null;
  orderType: OrderType;
  /** 정정·취소의 원주문번호. 신규는 null. */
  orgOrderNo: string | null;
  /** 주문 수량. 체결이 접수보다 먼저 온 행은 null. */
  qty: number | null;
  /** 주문 가격. 취소는 0 이 정상. 모르면 null. */
  price: number | null;
  /** 주문번호. 주문번호 없는 로컬 거부 행은 null(화면은 「—」). */
  orderNo: string | null;
  filledQty: number;
  /** 정정으로 새 주문번호에 옮겨간 수량. */
  modifiedQty: number;
  status: JournalOrderStatus;
  /** 0=성공, 그 외 거부코드. 모르면 null. */
  resultCode: number | null;
  /** 마지막 통보 원문 1자. 해석하지 않는다. */
  noticeType: string | null;
  message: string | null;
  /**
   * 발주 주체. **null = 출처 미상 → 출처 칩을 생략한다**(D-08 보충). 「수동」 으로 채우면
   * 거짓일 수 있으므로 매퍼도 기본값을 넣지 않는다.
   */
  origin: JournalOrderOrigin | null;
  requester: string | null;
  requestKind: string | null;
  /** 이 행에 반영된 마지막 저널 seq — 카드 병합의 최신성 정본(같은 id 면 큰 쪽). */
  lastSeq: number;
  /** 첫 이벤트 게이트웨이 시각(ISO). */
  createdAt: string;
  /** 마지막 이벤트 게이트웨이 시각(ISO). */
  updatedAt: string;
};

/**
 * RPC 행 원문 → 공개 camelCase 행. **순수 매핑**이다 — 값 보정·기본값 채움이 없다
 * (`origin` null 은 null 그대로). 유일한 변환은 `last_seq` 의 숫자화다.
 */
export function toJournalOrderRow(r: JournalOrderDbRow): JournalOrderRow {
  return {
    id: r.id,
    tradeDate: r.trade_date,
    accountNo: r.account_no,
    isin: r.isin,
    stockCode: r.stock_code,
    exchange: r.exchange,
    board: r.board,
    side: r.side,
    orderType: r.order_type,
    orgOrderNo: r.org_order_no,
    qty: r.qty,
    price: r.price,
    orderNo: r.order_no,
    filledQty: r.filled_qty,
    modifiedQty: r.modified_qty,
    status: r.status,
    resultCode: r.result_code,
    noticeType: r.notice_type,
    message: r.message,
    origin: r.origin,
    requester: r.requester,
    requestKind: r.request_kind,
    lastSeq: Number(r.last_seq),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
