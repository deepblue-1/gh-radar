import { describe, it, expect } from "vitest";
import {
  JOURNAL_ORDER_PUBLIC_COLUMNS,
  toJournalOrderRow,
  type JournalOrderDbRow,
} from "../journal";

/**
 * 저널 행 공유 매퍼 단위 테스트 (Phase 19 D-05 · D-08 · T-19-08).
 *
 * 이 매퍼는 server `GET /api/orders`(REST)와 relay `journal.rows`(wss 푸시)가 **같이** 쓴다.
 * 여기서 잠그는 것:
 *   ① 25 컬럼이 빠짐없이 옮겨지고 키 집합이 정확히 기대 camelCase 25종이다 — 한쪽에만 필드가
 *      생기면 카드 병합(id · lastSeq)이 갈린다.
 *   ② `last_seq` 는 bigint 직렬화로 문자열이 와도 number 가 된다.
 *   ③ null 은 null 그대로 — 특히 `origin` null 을 「수동」 으로 채우지 않는다(D-08 보충).
 *   ④ 주문자(`dma_user_id` / `dmaUserId`)는 공개 목록에도 결과에도 없다(T-19-08).
 */

const EXPECTED_KEYS = [
  "id",
  "tradeDate",
  "accountNo",
  "isin",
  "stockCode",
  "exchange",
  "board",
  "side",
  "orderType",
  "orgOrderNo",
  "qty",
  "price",
  "orderNo",
  "filledQty",
  "modifiedQty",
  "status",
  "resultCode",
  "noticeType",
  "message",
  "origin",
  "requester",
  "requestKind",
  "lastSeq",
  "createdAt",
  "updatedAt",
];

const dbRow = (over: Partial<JournalOrderDbRow> = {}): JournalOrderDbRow => ({
  id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
  trade_date: "2026-09-28",
  account_no: "12345678901",
  isin: "KR7005930003",
  stock_code: "005930",
  exchange: "NXT",
  board: "G1",
  side: "S",
  order_type: "M",
  org_order_no: "0000100",
  qty: 20,
  price: 71000,
  order_no: "0000123",
  filled_qty: 5,
  modified_qty: 3,
  status: "modified",
  result_code: 0,
  notice_type: "M",
  message: "정정확인",
  origin: "vi",
  requester: "web",
  request_kind: "modify",
  last_seq: 42,
  created_at: "2026-09-28T00:30:00Z",
  updated_at: "2026-09-28T00:31:00Z",
  ...over,
});

describe("toJournalOrderRow", () => {
  it("25 컬럼을 모두 camelCase 로 옮긴다", () => {
    expect(toJournalOrderRow(dbRow())).toEqual({
      id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
      tradeDate: "2026-09-28",
      accountNo: "12345678901",
      isin: "KR7005930003",
      stockCode: "005930",
      exchange: "NXT",
      board: "G1",
      side: "S",
      orderType: "M",
      orgOrderNo: "0000100",
      qty: 20,
      price: 71000,
      orderNo: "0000123",
      filledQty: 5,
      modifiedQty: 3,
      status: "modified",
      resultCode: 0,
      noticeType: "M",
      message: "정정확인",
      origin: "vi",
      requester: "web",
      requestKind: "modify",
      lastSeq: 42,
      createdAt: "2026-09-28T00:30:00Z",
      updatedAt: "2026-09-28T00:31:00Z",
    });
  });

  it('last_seq 가 문자열("42")이어도 number 42 가 된다 — bigint 직렬화 방어', () => {
    const r = toJournalOrderRow(dbRow({ last_seq: "42" }));
    expect(r.lastSeq).toBe(42);
    expect(typeof r.lastSeq).toBe("number");
  });

  it("null 은 null 그대로 — origin 을 「수동」 으로 채우지 않는다 (D-08 보충)", () => {
    const r = toJournalOrderRow(
      dbRow({
        origin: null,
        side: null,
        qty: null,
        price: null,
        stock_code: null,
        order_no: null,
        board: null,
        result_code: null,
      }),
    );
    expect(r.origin).toBeNull();
    expect(r.side).toBeNull();
    expect(r.qty).toBeNull();
    expect(r.price).toBeNull();
    expect(r.stockCode).toBeNull();
    expect(r.orderNo).toBeNull();
    expect(r.board).toBeNull();
    expect(r.resultCode).toBeNull();
  });

  it("결과 키 집합 = 기대 camelCase 25종 · 주문자 필드 없음 (T-19-08)", () => {
    const r = toJournalOrderRow(dbRow());
    expect(Object.keys(r).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(r).not.toHaveProperty("dmaUserId");
    expect(r).not.toHaveProperty("dma_user_id");
  });

  it("원문에 주문자 컬럼이 섞여 와도 결과로 흘리지 않는다 (T-19-08)", () => {
    const leaky = { ...dbRow(), dma_user_id: "trader01" } as JournalOrderDbRow;
    const r = toJournalOrderRow(leaky);
    expect(JSON.stringify(r)).not.toContain("trader01");
    expect(Object.keys(r)).toHaveLength(25);
  });
});

describe("JOURNAL_ORDER_PUBLIC_COLUMNS", () => {
  it("길이 25 · dma_user_id 미포함 · 중복 없음", () => {
    expect(JOURNAL_ORDER_PUBLIC_COLUMNS).toHaveLength(25);
    expect(JOURNAL_ORDER_PUBLIC_COLUMNS).not.toContain("dma_user_id");
    expect(new Set(JOURNAL_ORDER_PUBLIC_COLUMNS).size).toBe(25);
  });

  it("매퍼가 읽는 원문 키 집합과 같다 — 목록과 매퍼가 갈라지지 않는다", () => {
    expect([...JOURNAL_ORDER_PUBLIC_COLUMNS].sort()).toEqual(Object.keys(dbRow()).sort());
  });
});
