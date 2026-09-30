/**
 * Phase 25 — 상따 전략 이벤트 행 계약 (`dma_strategy_events` 의 공개 뷰).
 *
 * 원천: 관찰자 80 `JournalBatch.strategy_events`(gh-trade `.fbs` 5f49cfa5 · blob f08677d9) →
 * relay 전략 기록기 → `dma_strategy_apply` 가 돌려준 삽입 행. 필드 이름 · enum 번호는 HANDOFF v0.1
 * 과 1:1 인 **one-way 계약**이다(gh-trade D-03 · G1 통보 (c)).
 *
 * - 원문 보존: 값은 게이트웨이 원문이다 — 투영 · 보정 · 기본값 채움이 없다. 모르는 enum 값(v0.1 밖 말미
 *   추가 포함)도 숫자 그대로 싣고, 표시명은 `strategy-event-labels.ts` 가 모르면 원문 숫자로 그린다(D-10).
 * - T-19-08 · T-25-02: 주문자(`dma_user_id`)는 **싣지 않는다** — 적재 입력에만 있고 적용 RPC 반환 rows ·
 *   `journal.events` 프레임 · 조회 RPC 어디에도 없다.
 * - 가시성: 주문 이벤트(kind 3~8)는 그 계좌 권한 사용자에게만, 시세 이벤트(kind 1·2)는 자격증명이 있는
 *   사용자 전원에게 간다. 판정은 **kind 로만** 한다(`isMarketStrategyEvent`) — 빈 계좌번호로 판정하면 형식
 *   이상 주문 이벤트가 전 사용자에게 샌다(RESEARCH Security).
 *
 * ★ REST 조회(25-03)와 wss 푸시(relay `journal.events`)가 같은 매퍼 `toStrategyEventRow` 를 쓴다 — 두 벌 금지.
 */

/** `StrategyEventKind` (G1 (c) · ubyte · 0 = None). */
export const STRATEGY_EVENT_KIND = {
  None: 0,
  LimitExposed: 1,
  LimitEntered: 2,
  BuyOrder: 3,
  Queued: 4,
  FirstFill: 5,
  SellOrder: 6,
  Cancelled: 7,
  Rejected: 8,
} as const;

/**
 * `OrderGroup` (G1 (c) · ubyte · 0 = None). 1~3 매수 · 4~6 매도 · 7 수동 · 8 VI 자동주문(gh-trade 말미 추가
 * 2026-09-30 — 번호 0~6 불변). 7 · 8 은 조건 필드가 비어 오고(cond_metric 0 · ev_kind 0 · reason_code "")
 * 방향은 group 만이 아니라 kind 로 정한다 — `strategyEventSide`.
 */
export const ORDER_GROUP = {
  None: 0,
  PreBuy: 1,
  AddBuy: 2,
  PostBuy: 3,
  SellQuote: 4,
  SellTrade: 5,
  SellFillHook: 6,
  Manual: 7,
  VITrigger: 8,
} as const;

/**
 * 시세 이벤트(상한가노출 · 상한가진입)인가. 이 이벤트는 계좌가 없어 `account_no` 가 빈 문자열이지만,
 * 판정은 반드시 kind 로 한다 — 빈 계좌번호 비교로 공개 여부를 정하지 않는다(T-25-01).
 */
export function isMarketStrategyEvent(kind: number): boolean {
  return kind === STRATEGY_EVENT_KIND.LimitExposed || kind === STRATEGY_EVENT_KIND.LimitEntered;
}

/**
 * 적용 RPC 반환 · 조회 RPC 행 원문 (snake_case 45키 = `gateway` · `journal_epoch` · `stock_code` + 와이어
 * 43 − `dma_user_id`). Postgres `bigint` 칸은 직렬화 경로에 따라 문자열로 올 수 있어 `number | string`.
 */
export type StrategyEventDbRow = {
  gateway: string;
  journal_epoch: string;
  seq: number | string;
  trade_date: string;
  gw_time_ms: number | string;
  kind: number;
  group: number;
  exchange: string;
  isin: string;
  /** 6자 단축코드 — `stocks` 조인. 마스터에 없으면 null. */
  stock_code: string | null;
  cum_volume: number | string;
  account_no: string;
  order_no: string;
  price: number;
  qty: number;
  order_condition: string;
  reason_code: string;
  cond_threshold: number | string;
  cond_actual: number | string;
  cond_metric: number;
  ev_kind: number;
  ev_price: number;
  ev_qty_before: number | string;
  ev_qty_after: number | string;
  ev_trade_qty: number | string;
  limit_bid_qty: number | string;
  bid1_price: number;
  bid1_qty: number | string;
  accept_latency_us: number;
  immediate_fill_qty: number | string;
  queue_case: number;
  base_cum: number | string;
  ahead_qty: number | string;
  expected_cum: number | string;
  error_volume: number | string;
  remaining_volume: number | string;
  has_remaining: boolean;
  cancel_reason: number;
  result_code: number;
  message: string;
  entry_round: number;
  snap_qty: Array<number | string>;
  snap_cum: Array<number | string>;
  ask_qty_at_limit: number | string;
  open_at_limit: boolean;
};

/** 공개 컬럼 45종 — 적용 RPC `rows` 키 · 조회 RPC 반환 컬럼과 같은 목록. `dma_user_id` · `applied_at` 없음. */
export const STRATEGY_EVENT_PUBLIC_COLUMNS = [
  "gateway",
  "journal_epoch",
  "seq",
  "trade_date",
  "gw_time_ms",
  "kind",
  "group",
  "exchange",
  "isin",
  "stock_code",
  "cum_volume",
  "account_no",
  "order_no",
  "price",
  "qty",
  "order_condition",
  "reason_code",
  "cond_threshold",
  "cond_actual",
  "cond_metric",
  "ev_kind",
  "ev_price",
  "ev_qty_before",
  "ev_qty_after",
  "ev_trade_qty",
  "limit_bid_qty",
  "bid1_price",
  "bid1_qty",
  "accept_latency_us",
  "immediate_fill_qty",
  "queue_case",
  "base_cum",
  "ahead_qty",
  "expected_cum",
  "error_volume",
  "remaining_volume",
  "has_remaining",
  "cancel_reason",
  "result_code",
  "message",
  "entry_round",
  "snap_qty",
  "snap_cum",
  "ask_qty_at_limit",
  "open_at_limit",
] as const satisfies readonly (keyof StrategyEventDbRow)[];

/**
 * `journal.events` 푸시 1건 · 조회 응답 1건 (camelCase 45키). 주문자 필드가 없다(T-19-08).
 * 필드 의미는 `.fbs` `table StrategyEvent` 주석이 정본이다 — 없는 값은 0 / "" (와이어 규약).
 */
export type StrategyEventRow = {
  /** 게이트웨이 식별자(`"KB"` · `"KYOBO"`) — 키의 일부. */
  gateway: string;
  /** 저널 epoch — 주문 저널과 같은 epoch, 별도 seq 공간. */
  journalEpoch: string;
  seq: number;
  /** KST 거래일 `YYYY-MM-DD`. */
  tradeDate: string;
  /** 발생 epoch ms (주문 이벤트 = 전송 직전 시각). 정렬 · 표시 정본. */
  gwTimeMs: number;
  kind: number;
  group: number;
  exchange: string;
  isin: string;
  stockCode: string | null;
  cumVolume: number;
  /** 주문 이벤트만. 시세 이벤트는 "". */
  accountNo: string;
  /** 없으면 "" (거부 · 시세 이벤트). */
  orderNo: string;
  price: number;
  qty: number;
  orderCondition: string;
  /** 서버 `OrderReasonName` 원문 — 연산자 판정 키(`reasonOperator`). */
  reasonCode: string;
  condThreshold: number;
  condActual: number;
  condMetric: number;
  evKind: number;
  evPrice: number;
  evQtyBefore: number;
  evQtyAfter: number;
  evTradeQty: number;
  limitBidQty: number;
  bid1Price: number;
  bid1Qty: number;
  /** 전송→접수 µs. 0 = 미측정. */
  acceptLatencyUs: number;
  immediateFillQty: number;
  queueCase: number;
  baseCum: number;
  aheadQty: number;
  expectedCum: number;
  errorVolume: number;
  remainingVolume: number;
  hasRemaining: boolean;
  cancelReason: number;
  resultCode: number;
  message: string;
  entryRound: number;
  snapQty: number[];
  snapCum: number[];
  askQtyAtLimit: number;
  openAtLimit: boolean;
};

/**
 * RPC 행 원문 → 공개 camelCase 행. **순수 매핑**이다 — 값 보정 0. 유일한 변환은 bigint 칸의 숫자화
 * (`Number()`)와 벡터 원소의 숫자화다.
 */
export function toStrategyEventRow(r: StrategyEventDbRow): StrategyEventRow {
  return {
    gateway: r.gateway,
    journalEpoch: r.journal_epoch,
    seq: Number(r.seq),
    tradeDate: r.trade_date,
    gwTimeMs: Number(r.gw_time_ms),
    kind: r.kind,
    group: r.group,
    exchange: r.exchange,
    isin: r.isin,
    stockCode: r.stock_code,
    cumVolume: Number(r.cum_volume),
    accountNo: r.account_no,
    orderNo: r.order_no,
    price: r.price,
    qty: r.qty,
    orderCondition: r.order_condition,
    reasonCode: r.reason_code,
    condThreshold: Number(r.cond_threshold),
    condActual: Number(r.cond_actual),
    condMetric: r.cond_metric,
    evKind: r.ev_kind,
    evPrice: r.ev_price,
    evQtyBefore: Number(r.ev_qty_before),
    evQtyAfter: Number(r.ev_qty_after),
    evTradeQty: Number(r.ev_trade_qty),
    limitBidQty: Number(r.limit_bid_qty),
    bid1Price: r.bid1_price,
    bid1Qty: Number(r.bid1_qty),
    acceptLatencyUs: r.accept_latency_us,
    immediateFillQty: Number(r.immediate_fill_qty),
    queueCase: r.queue_case,
    baseCum: Number(r.base_cum),
    aheadQty: Number(r.ahead_qty),
    expectedCum: Number(r.expected_cum),
    errorVolume: Number(r.error_volume),
    remainingVolume: Number(r.remaining_volume),
    hasRemaining: r.has_remaining,
    cancelReason: r.cancel_reason,
    resultCode: r.result_code,
    message: r.message,
    entryRound: r.entry_round,
    snapQty: r.snap_qty.map(Number),
    snapCum: r.snap_cum.map(Number),
    askQtyAtLimit: Number(r.ask_qty_at_limit),
    openAtLimit: r.open_at_limit,
  };
}

/** 멱등 병합 키 — DB PK `(gateway, journal_epoch, seq)` 와 같은 축. */
export function strategyEventKey(r: Pick<StrategyEventRow, "gateway" | "journalEpoch" | "seq">): string {
  return `${r.gateway}|${r.journalEpoch}|${r.seq}`;
}

/** 표시 정렬 — `gwTimeMs` → `gateway` → `seq` 오름차순(새 로그는 아래 · UI-SPEC ②-0). */
export function compareStrategyEventAsc(
  a: Pick<StrategyEventRow, "gwTimeMs" | "gateway" | "seq">,
  b: Pick<StrategyEventRow, "gwTimeMs" | "gateway" | "seq">,
): number {
  if (a.gwTimeMs !== b.gwTimeMs) return a.gwTimeMs - b.gwTimeMs;
  if (a.gateway !== b.gateway) return a.gateway < b.gateway ? -1 : 1;
  return a.seq - b.seq;
}

/**
 * 미체결 잔량진행률 1건 (`QueueProgressItem` 83 · 25-06 이 소비). 주문자 필드가 없다(T-19-08).
 * relay 가 `account_no` 로 계좌 권한을 거른 뒤 내린다.
 */
export type RelayQueueProgressItem = {
  accountNo: string;
  orderNo: string;
  exchange: string;
  isin: string;
  group: number;
  expectedCum: number;
  currentCum: number;
  remainingVolume: number;
  /** 진행률 basis point (0~10000). */
  progressBp: number;
};
