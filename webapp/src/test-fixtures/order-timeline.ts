/**
 * 오늘 주문 행 펼침 타임라인 픽스처 — **테스트 전용** (Phase 25 25-08 · D-01 ~ D-04).
 *
 * 웹 단위 테스트 · e2e(me.spec P25-E) 가 이 경로만 import 한다. 제품 코드는 이 파일을 import 하지 않는다 —
 * 픽스처가 번들에 들어가면 안 된다.
 *
 * 값은 기획서 하루 흐름(`strategy-day` — 25-04 골든)과 채택 목업 `mockup-today-orders-expand.html` 의
 * EV_12451 · EV_12453 · EV_SELL 줄 순서 · 누적과 같다. 상따 줄은 `STRATEGY_DAY_BY_NAME` 을 그대로 쓰고(두 벌 금지),
 * 통보 줄(`JournalEventRow`)만 여기서 만든다.
 *
 * - 통보 seq 는 11~ · 전략 seq 는 하루 흐름 1~14 / 묶음 복제 201~ — 두 소스는 별도 seq 공간이다. 같은 ms 의 통보 seq 를
 *   전략 seq 보다 **크게** 둬서 「같은 ms = 통보 먼저」 가 seq 가 아니라 소스 순위로 성립함을 판별한다(25-03 pgTAP 과 같은 설계).
 * - 계좌 · 주문번호는 가짜 값이다(D-27 · 실서버 리터럴 없음).
 */
import {
  compareTimelineAsc,
  type JournalEventRow,
  type JournalOrderRow,
  type OrderTimelineRow,
  type StrategyEventRow,
} from "@gh-radar/shared";

import {
  FIXTURE_ACCOUNT_NO,
  FIXTURE_TRADE_DATE,
  kstMs,
  STRATEGY_DAY_BY_NAME,
} from "./strategy-day";

export { FIXTURE_ACCOUNT_NO, FIXTURE_TRADE_DATE };

const ISIN = "KR7005930003";
const STOCK_CODE = "005930";

/** KST `HH:MM:SS.mmm` → epoch ms (픽스처 거래일). */
export const at = (hms: string): number => kstMs(FIXTURE_TRADE_DATE, hms);

/** 이름으로 꺼내는 하루 흐름 전략 행 — 없는 이름이면 픽스처 오타라 즉시 던진다. */
export function strategyRow(name: string): StrategyEventRow {
  const row = STRATEGY_DAY_BY_NAME[name];
  if (row === undefined) throw new Error(`strategy-day 픽스처에 ${name} 없음`);
  return row;
}

/** 통보 이벤트 1건 — 없는 값은 와이어 기본(0 / "" / false). 기본 = 상따 매수 신규 · 방향 확실. */
export function journalEvent(
  over: Partial<JournalEventRow> & Pick<JournalEventRow, "seq" | "gwTimeMs" | "noticeType" | "orderNo">,
): JournalEventRow {
  return {
    gateway: "KB",
    journalEpoch: "ep-25",
    tradeDate: FIXTURE_TRADE_DATE,
    accountNo: FIXTURE_ACCOUNT_NO,
    isin: ISIN,
    side: "B",
    sideTrusted: true,
    orgOrderNo: "",
    requestKind: "New",
    requester: "",
    origin: "LimitChaser",
    exchange: "KRX",
    board: "",
    orderPrice: 0,
    orderQty: 0,
    execPrice: 0,
    execQty: 0,
    resultCode: 0,
    message: "",
    localReject: false,
    ...over,
  };
}

/** 통보 → 응답 행. */
export const journalItem = (event: JournalEventRow): OrderTimelineRow => ({
  source: "journal",
  gwTimeMs: event.gwTimeMs,
  seq: event.seq,
  event,
});

/** 전략 → 응답 행. */
export const strategyItem = (event: StrategyEventRow): OrderTimelineRow => ({
  source: "strategy",
  gwTimeMs: event.gwTimeMs,
  seq: event.seq,
  event,
});

/** RPC 가 돌려주는 순서(= `compareTimelineAsc`)로 정렬한 응답. */
export const asResponse = (rows: readonly OrderTimelineRow[]): OrderTimelineRow[] =>
  [...rows].sort(compareTimelineAsc);

/** 오늘 주문 저널 행 1개 — 기본 = 상따 KRX 매수 접수. */
export function orderRow(over: Partial<JournalOrderRow> & Pick<JournalOrderRow, "id">): JournalOrderRow {
  return {
    tradeDate: FIXTURE_TRADE_DATE,
    accountNo: FIXTURE_ACCOUNT_NO,
    isin: ISIN,
    stockCode: STOCK_CODE,
    exchange: "KRX",
    board: null,
    side: "B",
    orderType: "N",
    orgOrderNo: null,
    qty: 300,
    price: 12_350,
    orderNo: null,
    filledQty: 0,
    modifiedQty: 0,
    status: "accepted",
    resultCode: 0,
    noticeType: "A",
    message: null,
    origin: "limit_chaser",
    requester: null,
    requestKind: "New",
    lastSeq: 1,
    createdAt: new Date(at("09:00:00.000")).toISOString(),
    updatedAt: new Date(at("09:00:00.000")).toISOString(),
    ...over,
  };
}

const iso = (hms: string): string => new Date(at(hms)).toISOString();

// ===========================================================================
// 12451 선매수 — 주문 → 접수 → 대기 → 체결 100(같은 ms 첫 체결) → 전량 체결 200 (EV_12451)
// ===========================================================================

export const JEV_12451_A = journalEvent({
  seq: 11,
  gwTimeMs: at("09:45:02.879"),
  noticeType: "A",
  orderNo: "12451",
  orderPrice: 12_350,
  orderQty: 300,
});
export const JEV_12451_E1 = journalEvent({
  seq: 13,
  gwTimeMs: at("09:45:07.415"),
  noticeType: "E",
  orderNo: "12451",
  execPrice: 12_350,
  execQty: 100,
});
export const JEV_12451_E2 = journalEvent({
  seq: 14,
  gwTimeMs: at("09:45:09.102"),
  noticeType: "E",
  orderNo: "12451",
  execPrice: 12_350,
  execQty: 200,
});

export const ROW_12451 = orderRow({
  id: "ord-12451",
  orderNo: "12451",
  filledQty: 300,
  status: "filled",
  noticeType: "E",
  lastSeq: 14,
  createdAt: iso("09:45:02.879"),
  updatedAt: iso("09:45:09.102"),
});

export const TIMELINE_12451: OrderTimelineRow[] = asResponse([
  strategyItem(strategyRow("buy12451")),
  journalItem(JEV_12451_A),
  strategyItem(strategyRow("queued12451")),
  journalItem(JEV_12451_E1),
  strategyItem(strategyRow("fill12451")),
  journalItem(JEV_12451_E2),
]);

// ===========================================================================
// 12453 후매수 — 대기 중 취소 (EV_12453) · 취소 확인은 새 번호 12460 · 원주문 12453
// ===========================================================================

export const JEV_12453_A = journalEvent({
  seq: 21,
  gwTimeMs: at("09:52:40.122"),
  noticeType: "A",
  orderNo: "12453",
  orderPrice: 12_350,
  orderQty: 300,
});
export const JEV_12453_C = journalEvent({
  seq: 22,
  gwTimeMs: at("09:56:03.410"),
  noticeType: "C",
  orderNo: "12460",
  orgOrderNo: "12453",
  requestKind: "Cancel",
  orderQty: 300,
});

export const ROW_12453 = orderRow({
  id: "ord-12453",
  orderNo: "12453",
  status: "cancelled",
  noticeType: "C",
  lastSeq: 22,
  createdAt: iso("09:52:40.122"),
  updatedAt: iso("09:56:03.410"),
});

export const TIMELINE_12453: OrderTimelineRow[] = asResponse([
  strategyItem(strategyRow("buy12453")),
  journalItem(JEV_12453_A),
  strategyItem(strategyRow("queued12453")),
  journalItem(JEV_12453_C),
  strategyItem(strategyRow("cancel12453")),
]);

// ===========================================================================
// 자동 매도 조각 7건 12461~12467 (EV_SELL) — 3초 창 안이라 오늘 주문 표에서 한 줄로 묶인다(2-A)
// ===========================================================================

export const BUNDLE_ORDER_NOS = ["12461", "12462", "12463", "12464", "12465", "12466", "12467"] as const;

/** 조각 매도 주문 1건의 (접수 시각 · 수량 · 체결 조각[시각, 수량]). */
const BUNDLE_PLAN: ReadonlyArray<{
  no: string;
  accept: string;
  qty: number;
  fills: ReadonlyArray<readonly [string, number]>;
}> = [
  { no: "12461", accept: "10:11:40.226", qty: 600, fills: [["10:11:40.512", 120], ["10:11:41.390", 480]] },
  { no: "12462", accept: "10:11:41.047", qty: 300, fills: [["10:11:41.902", 300]] },
  { no: "12463", accept: "10:11:42.131", qty: 300, fills: [["10:11:42.640", 300]] },
  { no: "12464", accept: "10:11:42.955", qty: 300, fills: [["10:11:43.301", 300]] },
  { no: "12465", accept: "10:11:43.010", qty: 300, fills: [["10:11:43.402", 300]] },
  { no: "12466", accept: "10:11:43.100", qty: 300, fills: [["10:11:43.503", 300]] },
  { no: "12467", accept: "10:11:43.200", qty: 300, fills: [["10:11:43.604", 300]] },
];

let bundleSeq = 100;
export const BUNDLE_JOURNAL_EVENTS: JournalEventRow[] = BUNDLE_PLAN.flatMap((p) => [
  journalEvent({
    seq: ++bundleSeq,
    gwTimeMs: at(p.accept),
    noticeType: "A",
    orderNo: p.no,
    side: "S",
    orderPrice: 12_350,
    orderQty: p.qty,
  }),
  ...p.fills.map(([hms, qty]) =>
    journalEvent({
      seq: ++bundleSeq,
      gwTimeMs: at(hms),
      noticeType: "E",
      orderNo: p.no,
      side: "S",
      execPrice: 12_350,
      execQty: qty,
    }),
  ),
]);

/** 묶음의 상따 주문 줄 — 하루 흐름 매도 두 줄을 번호 · 시각만 바꿔 복제(문장은 25-04 골든 그대로). */
export const BUNDLE_STRATEGY_EVENTS: StrategyEventRow[] = [
  { ...strategyRow("sell12454"), seq: 201, orderNo: "12461", gwTimeMs: at("10:11:40.210") },
  { ...strategyRow("sell12455"), seq: 202, orderNo: "12462", gwTimeMs: at("10:11:41.030") },
];

export const BUNDLE_ROWS: JournalOrderRow[] = BUNDLE_PLAN.map((p, i) =>
  orderRow({
    id: `ord-${p.no}`,
    orderNo: p.no,
    side: "S",
    qty: p.qty,
    filledQty: p.qty,
    status: "filled",
    noticeType: "E",
    lastSeq: 110 + i,
    createdAt: iso(p.accept),
    updatedAt: iso(p.fills[p.fills.length - 1]![0]),
  }),
);

export const TIMELINE_BUNDLE: OrderTimelineRow[] = asResponse([
  ...BUNDLE_STRATEGY_EVENTS.map(strategyItem),
  ...BUNDLE_JOURNAL_EVENTS.map(journalItem),
]);

// ===========================================================================
// 수동 주문 — 전략 이벤트 없음(통보 줄만 · 빈 문구 없음)
// ===========================================================================

export const JEV_MANUAL_A = journalEvent({
  seq: 31,
  gwTimeMs: at("10:30:00.100"),
  noticeType: "A",
  orderNo: "12470",
  origin: "Manual",
  requester: "Manual",
  orderPrice: 12_400,
  orderQty: 10,
});

export const ROW_MANUAL = orderRow({
  id: "ord-12470",
  orderNo: "12470",
  qty: 10,
  price: 12_400,
  origin: "manual",
  requester: "Manual",
  lastSeq: 31,
  createdAt: iso("10:30:00.100"),
  updatedAt: iso("10:30:00.100"),
});

export const TIMELINE_MANUAL: OrderTimelineRow[] = [journalItem(JEV_MANUAL_A)];

/** 펼침 조회 목 — 첫 통보 행 id → 응답. 모르는 id 는 빈 응답(0건 문구). */
export const TIMELINE_BY_ANCHOR: Readonly<Record<string, OrderTimelineRow[]>> = {
  [ROW_12451.id]: TIMELINE_12451,
  [ROW_12453.id]: TIMELINE_12453,
  [BUNDLE_ROWS[0]!.id]: TIMELINE_BUNDLE,
  [ROW_MANUAL.id]: TIMELINE_MANUAL,
};
