import { toStrategyEventRow, type StrategyEventDbRow, type StrategyEventRow } from "./strategy-event";

/**
 * Phase 25 — 주문 1건(묶음) 타임라인 계약 (오늘 주문 행 펼침 · D-01 · D-02).
 *
 * 원천: server `GET /api/orders/:id/events` → RPC `dma_order_events_for_user` 한 번. 통보
 * (`dma_journal_events`)와 전략 이벤트(`dma_strategy_events`)를 UNION ALL 한 행이 `{ source, gw_time_ms,
 * seq, ev }` 모양으로 온다.
 *
 * - 가시성은 RPC 가 정한다(`:id` 행의 게이트웨이 · 거래일 · 계좌 + 계좌 조인). 이 모듈은 거르지 않는다.
 * - T-19-08 · T-25-16: 주문자(`dma_user_id`) · 투영 오류(`apply_error`) · 적용 시각(`applied_at`)은 RPC 가
 *   빼고, 매퍼도 **명시 키만** 옮긴다 — RPC 가 실수로 섞어 보내도 응답에 새지 않는다.
 * - 같은 ms 는 통보 → 전략 → seq(D-01 · Pitfall 9). 통보 seq 와 전략 seq 는 별도 공간이라 seq 만으로 두 소스를
 *   섞어 정렬하지 않는다. 시각은 두 소스 모두 RPC 가 준 `gw_time_ms` 정수다 — ISO 문자열 비교 금지.
 *
 * ★ REST(server)와 웹 펼침이 **같은 매퍼** `toOrderTimelineRow` · 같은 비교 함수 `compareTimelineAsc` 를 쓴다 —
 *   두 벌 금지(`journal.ts` 규율). 전략 행은 25-01 `toStrategyEventRow` 를 그대로 부른다.
 */

/**
 * 통보 이벤트 원문 공개 키 24종 — RPC `to_jsonb(j) - 'dma_user_id' - 'apply_error' - 'applied_at'` 의 키 목록.
 * 테스트가 부재 단언(주문자 · 투영 오류 · 적용 시각)에 쓴다.
 */
export const JOURNAL_EVENT_PUBLIC_KEYS = [
  "gateway",
  "journal_epoch",
  "seq",
  "trade_date",
  "gw_time",
  "account_no",
  "isin",
  "side",
  "side_trusted",
  "order_no",
  "org_order_no",
  "notice_type",
  "request_kind",
  "requester",
  "origin",
  "exchange",
  "board",
  "order_price",
  "order_qty",
  "exec_price",
  "exec_qty",
  "result_code",
  "message",
  "local_reject",
] as const;

/**
 * 통보 이벤트 1건 (camelCase). 값은 게이트웨이 원문이다 — 투영(`dma_account_orders`) 전의 통보 그대로.
 * 주문자(`dmaUserId`) · 투영 오류(`applyError`)는 없다.
 */
export type JournalEventRow = {
  gateway: string;
  journalEpoch: string;
  seq: number;
  /** KST 거래일 `YYYY-MM-DD`. */
  tradeDate: string;
  /** 게이트웨이 시각 epoch ms — RPC 가 `gw_time` 을 ms 정수로 내린 값(정렬 · 표시 정본). */
  gwTimeMs: number;
  accountNo: string;
  isin: string;
  /** 'B' / 'S' / ''. */
  side: string;
  /** C/M 에서 원주문 메타로 채운 값인지. */
  sideTrusted: boolean;
  /** 로컬 거부는 ''. */
  orderNo: string;
  orgOrderNo: string;
  /** A/E/C/M/R 원문. */
  noticeType: string;
  /** New/Modify/Cancel/''. */
  requestKind: string;
  requester: string;
  /** Manual/LimitChaser/VITrigger/'' 원문. */
  origin: string;
  exchange: string;
  board: string;
  orderPrice: number;
  orderQty: number;
  execPrice: number;
  execQty: number;
  resultCode: number;
  /** 게이트웨이 조립 문구 — 파싱하지 않는다. */
  message: string;
  localReject: boolean;
};

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown): number => Number(v ?? 0);

/**
 * 통보 ev 원문 → `JournalEventRow`. `gwTimeMs` 는 RPC 바깥 칸 `gw_time_ms` 정수를 받는다 — ev 안의 ISO
 * `gw_time` 을 다시 파싱하지 않는다(표기 · 부동소수 흔들림 방지 · Pitfall 9).
 */
export function toJournalEventRow(ev: Record<string, unknown>, gwTimeMs: number): JournalEventRow {
  return {
    gateway: str(ev.gateway),
    journalEpoch: str(ev.journal_epoch),
    seq: num(ev.seq),
    tradeDate: str(ev.trade_date),
    gwTimeMs,
    accountNo: str(ev.account_no),
    isin: str(ev.isin),
    side: str(ev.side),
    sideTrusted: ev.side_trusted === true,
    orderNo: str(ev.order_no),
    orgOrderNo: str(ev.org_order_no),
    noticeType: str(ev.notice_type),
    requestKind: str(ev.request_kind),
    requester: str(ev.requester),
    origin: str(ev.origin),
    exchange: str(ev.exchange),
    board: str(ev.board),
    orderPrice: num(ev.order_price),
    orderQty: num(ev.order_qty),
    execPrice: num(ev.exec_price),
    execQty: num(ev.exec_qty),
    resultCode: num(ev.result_code),
    message: str(ev.message),
    localReject: ev.local_reject === true,
  };
}

/** RPC `dma_order_events_for_user` 반환 행 원문. bigint 칸은 직렬화 경로에 따라 문자열로 올 수 있다. */
export type OrderTimelineDbRow = {
  source: "journal" | "strategy";
  gw_time_ms: number | string;
  seq: number | string;
  ev: Record<string, unknown>;
};

/** `GET /api/orders/:id/events` 응답 1건 — source 판별 유니온. */
export type OrderTimelineRow =
  | { source: "journal"; gwTimeMs: number; seq: number; event: JournalEventRow }
  | { source: "strategy"; gwTimeMs: number; seq: number; event: StrategyEventRow };

/** RPC 행 → 공개 행. 전략은 `toStrategyEventRow`(25-01) 그대로 — 두 벌 금지. */
export function toOrderTimelineRow(r: OrderTimelineDbRow): OrderTimelineRow {
  const gwTimeMs = Number(r.gw_time_ms);
  const seq = Number(r.seq);
  if (r.source === "strategy") {
    return { source: "strategy", gwTimeMs, seq, event: toStrategyEventRow(r.ev as StrategyEventDbRow) };
  }
  return { source: "journal", gwTimeMs, seq, event: toJournalEventRow(r.ev, gwTimeMs) };
}

/** 같은 ms 안의 소스 순위 — 통보 0 · 전략 1 (D-01 · UI-SPEC ① 줄 순서). */
const sourceRank = (s: OrderTimelineRow["source"]): number => (s === "journal" ? 0 : 1);

/** 타임라인 정렬 — `gwTimeMs` → 같은 ms 는 통보 먼저 → `seq` 오름차순. RPC `ORDER BY` 와 같은 규칙. */
export function compareTimelineAsc(
  a: Pick<OrderTimelineRow, "source" | "gwTimeMs" | "seq">,
  b: Pick<OrderTimelineRow, "source" | "gwTimeMs" | "seq">,
): number {
  if (a.gwTimeMs !== b.gwTimeMs) return a.gwTimeMs - b.gwTimeMs;
  const rank = sourceRank(a.source) - sourceRank(b.source);
  if (rank !== 0) return rank;
  return a.seq - b.seq;
}

/**
 * 병합 · React 키 — `${source}|${gateway}|${journalEpoch}|${seq}`. 통보와 전략은 같은 epoch 의 별도 seq 공간이라
 * source 가 키의 일부여야 한다(같은 seq 두 줄이 겹치지 않게).
 */
export function timelineRowKey(r: OrderTimelineRow): string {
  return `${r.source}|${r.event.gateway}|${r.event.journalEpoch}|${r.seq}`;
}
