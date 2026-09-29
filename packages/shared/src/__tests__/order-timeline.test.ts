import { describe, it, expect } from "vitest";
import {
  JOURNAL_EVENT_PUBLIC_KEYS,
  compareTimelineAsc,
  timelineRowKey,
  toJournalEventRow,
  toOrderTimelineRow,
  type OrderTimelineDbRow,
  type OrderTimelineRow,
} from "../order-timeline";
import { toStrategyEventRow } from "../strategy-event";
import { STRATEGY_DAY_DB_ROWS, kstMs } from "../__fixtures__/strategy-day";

/**
 * 주문 1건 타임라인 공유 매퍼 단위 테스트 (Phase 25 D-01 · D-02 · Pitfall 9 · T-19-08).
 *
 * 이 매퍼는 server `GET /api/orders/:id/events`(REST)와 웹 펼침이 **같이** 쓴다 — 두 벌 금지.
 * 잠그는 것:
 *   ① journal 행 → `JournalEventRow`(camel 24키) · gwTimeMs/seq 숫자화 · 주문자 · apply_error 부재
 *   ② strategy 행 → `toStrategyEventRow` 결과 그대로
 *   ③ 정렬: gwTimeMs → 같은 ms 는 통보(journal) 먼저 → seq
 *   ④ 키: `${source}|${gateway}|${journalEpoch}|${seq}` — 통보 · 전략 seq 공간이 달라 source 가 키의 일부다
 */

const AT = kstMs("2026-09-29", "09:45:02.861");

/** dma_order_events_for_user 통보 행 — ev 는 `to_jsonb(j) - dma_user_id - apply_error - applied_at`. */
const journalDb = (over: Record<string, unknown> = {}, seq: number | string = "12"): OrderTimelineDbRow => ({
  source: "journal",
  gw_time_ms: String(AT),
  seq,
  ev: {
    gateway: "KB",
    journal_epoch: "ep-25",
    seq: Number(seq),
    trade_date: "2026-09-29",
    gw_time: "2026-09-29T00:45:02.861+00:00",
    account_no: "1234567801",
    isin: "KR7005930003",
    side: "B",
    side_trusted: true,
    order_no: "12451",
    org_order_no: "",
    notice_type: "A",
    request_kind: "New",
    requester: "",
    origin: "LimitChaser",
    exchange: "KRX",
    board: "",
    order_price: 12350,
    order_qty: 300,
    exec_price: 0,
    exec_qty: 0,
    result_code: 0,
    message: "접수",
    local_reject: false,
    ...over,
  },
});

const buyDb = STRATEGY_DAY_DB_ROWS[1];

describe("toOrderTimelineRow — journal", () => {
  it("① journal 행 → JournalEventRow · gwTimeMs/seq 숫자 · 24키 · 주문자/apply_error 없음", () => {
    const row = toOrderTimelineRow(journalDb());
    expect(row.source).toBe("journal");
    expect(row.gwTimeMs).toBe(AT);
    expect(row.seq).toBe(12);
    if (row.source !== "journal") throw new Error("journal 이어야 한다");
    expect(row.event).toEqual({
      gateway: "KB",
      journalEpoch: "ep-25",
      seq: 12,
      tradeDate: "2026-09-29",
      gwTimeMs: AT,
      accountNo: "1234567801",
      isin: "KR7005930003",
      side: "B",
      sideTrusted: true,
      orderNo: "12451",
      orgOrderNo: "",
      noticeType: "A",
      requestKind: "New",
      requester: "",
      origin: "LimitChaser",
      exchange: "KRX",
      board: "",
      orderPrice: 12350,
      orderQty: 300,
      execPrice: 0,
      execQty: 0,
      resultCode: 0,
      message: "접수",
      localReject: false,
    });
    expect(row.event).not.toHaveProperty("dmaUserId");
    expect(row.event).not.toHaveProperty("applyError");
  });

  it("①-b RPC 가 dma_user_id · apply_error 가 섞인 ev 를 돌려줘도(방어) 옮기지 않는다", () => {
    const row = toOrderTimelineRow(journalDb({ dma_user_id: "dma-x", apply_error: "boom", applied_at: "t" }));
    expect(JSON.stringify(row)).not.toContain("dma-x");
    expect(JSON.stringify(row)).not.toContain("boom");
    expect(row.event).not.toHaveProperty("dmaUserId");
  });

  it("①-c JOURNAL_EVENT_PUBLIC_KEYS — 24키 · 주문자 · 투영 오류 · 적용 시각 없음", () => {
    expect(JOURNAL_EVENT_PUBLIC_KEYS).toHaveLength(24);
    for (const k of ["dma_user_id", "apply_error", "applied_at"]) {
      expect(JOURNAL_EVENT_PUBLIC_KEYS as readonly string[]).not.toContain(k);
    }
    expect(Object.keys(journalDb().ev).sort()).toEqual([...JOURNAL_EVENT_PUBLIC_KEYS].sort());
  });

  it("①-d toJournalEventRow 의 gwTimeMs 는 바깥 gw_time_ms 정수(ISO gw_time 을 다시 파싱하지 않는다)", () => {
    const ev = toJournalEventRow(journalDb().ev, 1790000000123);
    expect(ev.gwTimeMs).toBe(1790000000123);
  });
});

describe("toOrderTimelineRow — strategy", () => {
  it("② strategy 행 → toStrategyEventRow 결과 그대로", () => {
    const row = toOrderTimelineRow({
      source: "strategy",
      gw_time_ms: buyDb.gw_time_ms,
      seq: String(buyDb.seq),
      ev: buyDb as unknown as Record<string, unknown>,
    });
    expect(row.source).toBe("strategy");
    expect(row.seq).toBe(Number(buyDb.seq));
    expect(row.gwTimeMs).toBe(Number(buyDb.gw_time_ms));
    expect(row.event).toEqual(toStrategyEventRow(buyDb));
    expect(row.event).not.toHaveProperty("dmaUserId");
  });
});

describe("compareTimelineAsc · timelineRowKey", () => {
  const j = (gw: number, seq: number): OrderTimelineRow =>
    toOrderTimelineRow({ ...journalDb({}, seq), gw_time_ms: gw });
  const s = (gw: number, seq: number): OrderTimelineRow =>
    toOrderTimelineRow({
      source: "strategy",
      gw_time_ms: gw,
      seq,
      ev: { ...(buyDb as unknown as Record<string, unknown>), seq, gw_time_ms: gw },
    });

  it("③ 같은 ms 는 journal 먼저(seq 가 더 커도) → 그다음 seq · 다른 ms 는 시각순", () => {
    const rows = [s(AT, 2), j(AT, 11), s(AT + 19, 6), j(AT + 139, 12), j(AT, 10)];
    const sorted = [...rows].sort(compareTimelineAsc).map((r) => `${r.source}:${r.seq}`);
    expect(sorted).toEqual(["journal:10", "journal:11", "strategy:2", "strategy:6", "journal:12"]);
  });

  it("④ timelineRowKey = source|gateway|journalEpoch|seq — 같은 seq 라도 source 가 다르면 다른 키", () => {
    expect(timelineRowKey(j(AT, 2))).toBe("journal|KB|ep-25|2");
    expect(timelineRowKey(s(AT, 2))).toBe("strategy|KB|ep-25|2");
  });
});
