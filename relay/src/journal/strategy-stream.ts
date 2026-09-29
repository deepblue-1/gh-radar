/**
 * Phase 25 — 전략 이벤트 스트림 서술자 · 기록기 (`createStrategyWriter`).
 *
 * 관찰자 80 한 프레임의 두 번째 스트림(`strategy_events`)을 `dma_strategy_apply` 로 적재한다. 기록기 본체는
 * 주문 저널과 같은 `JournalWriter` 다 — push · beginEpoch · 재시도 · drain 규율을 복제하지 않고 스트림 고유
 * 4지점만 `STRATEGY_STREAM` 서술자로 주입한다(`writer.ts` 머리 주석).
 *
 * 결정 근거(CONTEXT 「이미 확정된 것」):
 *   - **별도 트랜잭션 · 별도 커서.** 주문 적용과 전략 적용은 서로 기다리지 않는다(advisory 키도 다르다). 커서는
 *     같은 `dma_journal_cursor` 행의 전략 칸 두 개(`strategy_journal_epoch` · `strategy_last_seq`)다 — 같은
 *     epoch, 별도 seq 공간(G1 (e)).
 *   - **투영 없음 · 원문 보존.** 이벤트는 불변 원문이라 삽입뿐이다(PK `(gateway, journal_epoch, seq)` 멱등 게이트).
 *     enum 칸은 CHECK 가 없어 모르는 값도 그대로 적재된다(G1 ⓓ — CHECK 거부는 멱등 게이트를 없애 영구 재시도를 만든다).
 *   - T-19-08: `dma_user_id` 는 적재 입력에만 싣고 반환 rows 에는 없다(적용 RPC 가 뺀다 · 공개 매퍼에도 칸이 없다).
 */
import { toStrategyEventRow } from "@gh-radar/shared";
import type { StrategyEventDbRow, StrategyEventRow } from "@gh-radar/shared";

import type { StrategyEventRecord } from "./types.js";
import { JournalWriter, type JournalStreamSpec, type JournalWriterDeps } from "./writer.js";

/** `dma_strategy_apply` 입력 이벤트 1건 — 와이어 43필드 이름 그대로(snake_case). SQL `ev->>'…'` 키와 1:1. */
export type StrategyApplyEvent = {
  seq: number;
  trade_date: string;
  gw_time_ms: number;
  kind: number;
  group: number;
  exchange: string;
  isin: string;
  cum_volume: number;
  dma_user_id: string;
  account_no: string;
  order_no: string;
  price: number;
  qty: number;
  order_condition: string;
  reason_code: string;
  cond_threshold: number;
  cond_actual: number;
  cond_metric: number;
  ev_kind: number;
  ev_price: number;
  ev_qty_before: number;
  ev_qty_after: number;
  ev_trade_qty: number;
  limit_bid_qty: number;
  bid1_price: number;
  bid1_qty: number;
  accept_latency_us: number;
  immediate_fill_qty: number;
  queue_case: number;
  base_cum: number;
  ahead_qty: number;
  expected_cum: number;
  error_volume: number;
  remaining_volume: number;
  has_remaining: boolean;
  cancel_reason: number;
  result_code: number;
  message: string;
  entry_round: number;
  snap_qty: number[];
  snap_cum: number[];
  ask_qty_at_limit: number;
  open_at_limit: boolean;
};

/**
 * 적용 RPC 입력 키 43종. 하나라도 이름이 틀리면 DB 가 그 값을 0/''/false 로 조용히 적재한다 — 테스트가
 * 이 목록 길이(43)와 `toStrategyApplyEvent` 결과 키 집합을 잠근다.
 */
export const STRATEGY_APPLY_KEYS = [
  "seq",
  "trade_date",
  "gw_time_ms",
  "kind",
  "group",
  "exchange",
  "isin",
  "cum_volume",
  "dma_user_id",
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
] as const satisfies readonly (keyof StrategyApplyEvent)[];

/** camelCase 도메인 레코드 → 적용 RPC 입력 43키. **순수 매핑**이다 — 값 보정 0. */
export function toStrategyApplyEvent(r: StrategyEventRecord): StrategyApplyEvent {
  return {
    seq: r.seq,
    trade_date: r.tradeDate,
    gw_time_ms: r.gwTimeMs,
    kind: r.kind,
    group: r.group,
    exchange: r.exchange,
    isin: r.isin,
    cum_volume: r.cumVolume,
    dma_user_id: r.dmaUserId,
    account_no: r.accountNo,
    order_no: r.orderNo,
    price: r.price,
    qty: r.qty,
    order_condition: r.orderCondition,
    reason_code: r.reasonCode,
    cond_threshold: r.condThreshold,
    cond_actual: r.condActual,
    cond_metric: r.condMetric,
    ev_kind: r.evKind,
    ev_price: r.evPrice,
    ev_qty_before: r.evQtyBefore,
    ev_qty_after: r.evQtyAfter,
    ev_trade_qty: r.evTradeQty,
    limit_bid_qty: r.limitBidQty,
    bid1_price: r.bid1Price,
    bid1_qty: r.bid1Qty,
    accept_latency_us: r.acceptLatencyUs,
    immediate_fill_qty: r.immediateFillQty,
    queue_case: r.queueCase,
    base_cum: r.baseCum,
    ahead_qty: r.aheadQty,
    expected_cum: r.expectedCum,
    error_volume: r.errorVolume,
    remaining_volume: r.remainingVolume,
    has_remaining: r.hasRemaining,
    cancel_reason: r.cancelReason,
    result_code: r.resultCode,
    message: r.message,
    entry_round: r.entryRound,
    snap_qty: r.snapQty,
    snap_cum: r.snapCum,
    ask_qty_at_limit: r.askQtyAtLimit,
    open_at_limit: r.openAtLimit,
  };
}

/** 전략 이벤트 스트림 서술자. */
export const STRATEGY_STREAM: JournalStreamSpec<StrategyEventRecord, StrategyEventRow> = {
  name: "strategy",
  rpc: "dma_strategy_apply",
  cursorEpochColumn: "strategy_journal_epoch",
  cursorSeqColumn: "strategy_last_seq",
  toApply: toStrategyApplyEvent,
  toOut: (row) => toStrategyEventRow(row as StrategyEventDbRow),
};

/** 전략 기록기 — 게이트웨이당 1개. 주문 기록기와 같은 deps(서술자만 고정). */
export function createStrategyWriter(
  deps: Omit<JournalWriterDeps<StrategyEventRecord, StrategyEventRow>, "stream">,
): JournalWriter<StrategyEventRecord, StrategyEventRow> {
  return new JournalWriter<StrategyEventRecord, StrategyEventRow>({ ...deps, stream: STRATEGY_STREAM });
}
