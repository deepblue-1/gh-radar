import { describe, expect, it } from "vitest";

import type { DmaOrderRow, RelayOrderMsg } from "@gh-radar/shared";

import {
  mergeKeyOf,
  mergeOrderNotices,
  orderActionSide,
  orderActionWord,
  orderNoticeLabel,
} from "../order-notices";
import type { TodayOrderRow } from "../orders-api";

/**
 * 17-10 Task 1 — 주문 통보의 **행위 단어**는 서버 필드로만 정해진다 (D-08 · D-15).
 *
 * 잠그는 것은 「무엇을 한 통보인가」의 판정 근거다:
 *  ① `notice_type` → `request_kind` → side 의 **우선순위**. 정정·취소 804 거부에서 서버가
 *     `message` 를 교체하므로 문구를 읽는 판정은 조용히 틀린다 — 그래서 함수는 문구를
 *     **인자로 받지 않는다**(받을 수 있으면 언젠가 읽는다).
 *  ② 취소·정정에는 방향이 없다. 서버는 `DirectOrderReq.side` 를 취소·정정에 쓰지 않고
 *     그대로 에코할 뿐이라 **매도 주문의 취소도 "매수"** 로 보인다(C# `ActionWord` 주석).
 *  ③ 「수동」 메타는 `requester`, 「시간외종가」 접두는 `board` — 둘 다 동등 비교뿐이다.
 */

describe("orderActionWord — 행위 단어는 서버 필드로만 (D-15)", () => {
  it("①-1 notice_type \"C\" 는 취소다 — request_kind 와 무관하다", () => {
    expect(orderActionWord({ noticeType: "C", requestKind: "", side: "B" })).toBe("취소");
  });

  it("①-2 notice_type \"M\" 은 정정이다", () => {
    expect(orderActionWord({ noticeType: "M", requestKind: "", side: "S" })).toBe("정정");
  });

  it("①-3 우선순위 — notice_type \"C\" 와 request_kind \"New\" 가 동시에 오면 취소가 이긴다", () => {
    // 서버가 「신규 요청의 취소확인」을 보낸 모양. 통보 종류가 있으면 그것이 정답이다.
    expect(orderActionWord({ noticeType: "C", requestKind: "New", side: "B" })).toBe("취소");
  });

  it("①-4 notice_type 이 그 밖이면 request_kind Cancel 이 취소를 만든다 (거부 통보 경로)", () => {
    // 'R'(거부)은 행위를 말하지 않는다 — 브로커 수신 전문의 정정취소구분이 말한다.
    expect(orderActionWord({ noticeType: "R", requestKind: "Cancel", side: "B" })).toBe("취소");
  });

  it("①-5 request_kind Modify 는 정정이다", () => {
    expect(orderActionWord({ noticeType: "R", requestKind: "Modify", side: "B" })).toBe("정정");
  });

  it("①-6 둘 다 해당 없으면 side 단어로 떨어진다 (신규·체결·구 서버)", () => {
    expect(orderActionWord({ noticeType: "A", requestKind: "New", side: "B" })).toBe("매수");
    expect(orderActionWord({ noticeType: "E", requestKind: "", side: "S" })).toBe("매도");
  });

  it("①-7 side 를 모르고 위 분기에도 안 걸리면 빈 문자열이다 — 지어내지 않는다", () => {
    expect(orderActionWord({ noticeType: "", requestKind: "", side: null })).toBe("");
  });
});

describe("orderActionSide — 취소·정정에는 방향이 없다", () => {
  it("②-1 취소·정정 통보는 방향색 원천이 null 이다", () => {
    expect(orderActionSide({ noticeType: "C", requestKind: "", side: "S" })).toBeNull();
    expect(orderActionSide({ noticeType: "M", requestKind: "", side: "S" })).toBeNull();
    expect(orderActionSide({ noticeType: "R", requestKind: "Cancel", side: "S" })).toBeNull();
  });

  it("②-2 접수·체결은 side 를 그대로 돌려준다", () => {
    expect(orderActionSide({ noticeType: "A", requestKind: "New", side: "S" })).toBe("S");
    expect(orderActionSide({ noticeType: "E", requestKind: "", side: "B" })).toBe("B");
  });
});

describe("orderNoticeLabel — 「수동」 메타와 「시간외종가」 접두 (D-15)", () => {
  const base = { noticeType: "A", requestKind: "New", side: "B" as const, requester: "", board: "" };

  it("③-1 requester \"Manual\" 이면 「수동」 메타가 붙는다", () => {
    expect(orderNoticeLabel({ ...base, requester: "Manual" }).meta).toBe("수동");
  });

  it("③-2 빈 requester · 그 밖의 값에는 메타가 붙지 않는다", () => {
    expect(orderNoticeLabel({ ...base, requester: "" }).meta).toBe("");
    expect(orderNoticeLabel({ ...base, requester: "LimitChaser" }).meta).toBe("");
  });

  it("③-3 board G2/G3 · 접수·체결·거부는 side 단어 앞에 접두가 붙는다", () => {
    expect(orderNoticeLabel({ ...base, board: "G2" }).text).toBe("시간외종가 매수");
    expect(orderNoticeLabel({ ...base, board: "G3", side: "S" }).text).toBe("시간외종가 매도");
  });

  it("③-4 board G2/G3 · 취소·정정 확인은 「시간외종가」 만이다 (D-15 · 사용자 결정 2026-09-17)", () => {
    expect(orderNoticeLabel({ ...base, noticeType: "C", board: "G2" }).text).toBe("시간외종가");
    expect(orderNoticeLabel({ ...base, noticeType: "M", board: "G3" }).text).toBe("시간외종가");
  });

  it("③-5 board 가 빈 값·그 밖이면 접두가 없다 — 벽시계로 판정하지 않는다", () => {
    expect(orderNoticeLabel({ ...base, board: "" }).text).toBe("매수");
    expect(orderNoticeLabel({ ...base, board: "G1" }).text).toBe("매수");
  });

  it("③-6 방향색 원천은 라벨에도 그대로 실린다", () => {
    expect(orderNoticeLabel({ ...base, board: "G2" }).side).toBe("B");
    expect(orderNoticeLabel({ ...base, noticeType: "C" }).side).toBeNull();
  });
});

describe("문구를 읽을 수 없는 구조다 (T-17-33)", () => {
  it("④-1 orderActionWord 의 인자 객체에 문구 키가 없다 — 받을 수 없으면 읽을 수 없다", () => {
    // 타입만으로는 런타임에 증명되지 않으므로, 문구를 넣어도 결과가 달라지지 않음을 단언한다.
    const withText = { noticeType: "R", requestKind: "Cancel", side: "B" as const };
    expect(orderActionWord(withText)).toBe("취소");
    expect(Object.keys(withText)).toEqual(["noticeType", "requestKind", "side"]);
  });
});

// ===========================================================================
// 17-10 Task 2 — `mergeOrderNotices` 3초 창 묶기 (D-16 / T-17-34 · T-17-36)
// ===========================================================================

/**
 * 부분체결 조각 매도(quick-260916-fq3)에서 통보가 조각 수만큼 쏟아져 표가 한 종목으로
 * 가득 찬다. 묶기는 그것을 한 줄로 읽히게 하되, **묶으면 안 되는 것은 그대로 둔다**:
 *
 *  ★ 매수 접수를 묶으면 취소 직후 재매수가 앞 줄에 합쳐져 **이미 취소된 수량이 더해져
 *    보인다**(Pitfall 8 · 사용자 결정 2026-09-17). 거부·취소확인·정정확인도 마찬가지로
 *    한 건 한 건이 사건이다.
 *  ★ 시각은 **고정 타임스탬프 픽스처**로 넣는다 — 순수함수가 현재 시각을 읽으면
 *    테스트가 시계에 의존하고, 무엇보다 같은 입력이 다른 출력을 낸다.
 */

/** `2026-09-16T05:00:00Z` 기준 + n 밀리초. */
const T0 = Date.parse("2026-09-16T05:00:00.000Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();

function liveFrame(over: Partial<RelayOrderMsg> = {}): RelayOrderMsg {
  return { t: "order", no: "0000100001", nt: "E", rc: 0, msg: "", org: "", p: 1_000, q: 10, x: "KRX", ...over };
}

/** 상따 자동주문의 **체결** 행 하나. 묶기의 기본 픽스처다. */
function autoFill(over: Partial<DmaOrderRow> = {}, live: Partial<RelayOrderMsg> = {}): TodayOrderRow {
  const row: DmaOrderRow = {
    id: `id-${over.orderNo ?? "0000100001"}`,
    accountNo: "1234567801",
    isin: "KR7005930003",
    stockCode: "005930",
    exchange: "KRX",
    market: "K",
    side: "S",
    orderType: "N",
    orgOrderNo: null,
    qty: 10,
    price: 1_000,
    orderNo: "0000100001",
    status: "filled",
    resultCode: 0,
    noticeType: "E",
    message: null,
    filledQty: 10,
    origin: "limit_chaser",
    createdAt: at(0),
    updatedAt: at(0),
    ...over,
  };
  return { ...row, live: liveFrame({ no: row.orderNo ?? "", q: row.qty, p: row.price, ...live }) };
}

describe("mergeKeyOf — 무엇이 묶일 수 있는가 (D-16)", () => {
  it("⑤-1 자동주문의 체결은 origin·ISIN·거래소·side 축으로 묶인다", () => {
    const a = autoFill({ orderNo: "0000100001" });
    const b = autoFill({ orderNo: "0000100002" });
    expect(mergeKeyOf(a)).toBe(mergeKeyOf(b));
  });

  it("⑤-2 ISIN·거래소·side 중 하나라도 다르면 키가 갈린다", () => {
    const base = autoFill({ orderNo: "0000100001" });
    expect(mergeKeyOf(autoFill({ orderNo: "0000100002", isin: "KR7000660001" }))).not.toBe(mergeKeyOf(base));
    expect(mergeKeyOf(autoFill({ orderNo: "0000100003", exchange: "NXT" }))).not.toBe(mergeKeyOf(base));
    expect(mergeKeyOf(autoFill({ orderNo: "0000100004", side: "B" }))).not.toBe(mergeKeyOf(base));
  });

  it("⑤-3 수동 발주(requester Manual)·주체 미상(origin manual)은 주문번호가 키다", () => {
    const manualRequester = autoFill({ orderNo: "0000100002" }, { rq: "Manual" });
    const unknownOrigin = autoFill({ orderNo: "0000100003", origin: "manual" });
    expect(mergeKeyOf(manualRequester)).not.toBe(mergeKeyOf(autoFill({ orderNo: "0000100001" })));
    expect(mergeKeyOf(manualRequester)).toContain("0000100002");
    expect(mergeKeyOf(unknownOrigin)).toContain("0000100003");
  });

  it("⑤-4 라이브 통보가 없는 복원 행은 묶이지 않는다", () => {
    const restoredOnly: TodayOrderRow = { ...autoFill({ orderNo: "0000100009" }), live: null };
    expect(mergeKeyOf(restoredOnly)).toContain("0000100009");
  });
});

describe("mergeOrderNotices — 3초 창 (D-16 / T-17-36)", () => {
  it("⑥-1 같은 자동주문 체결 3건이 3초 안에 오면 한 줄이 된다", () => {
    const merged = mergeOrderNotices([
      autoFill({ orderNo: "0000100003", createdAt: at(2_000), qty: 3, price: 1_020 }),
      autoFill({ orderNo: "0000100002", createdAt: at(1_000), qty: 5, price: 1_010 }),
      autoFill({ orderNo: "0000100001", createdAt: at(0), qty: 10, price: 1_000 }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.count).toBe(3);
    expect(merged[0]?.qty).toBe(18);
    // 시각은 **첫 통보**(가장 이른) 것이다.
    expect(merged[0]?.at).toBe(at(0));
    expect(merged[0]?.orderNoText).toBe("#0000100001~0000100003");
    // 단가를 더하면 없는 값이 생긴다 — 범위로 말한다.
    expect(merged[0]?.priceMin).toBe(1_000);
    expect(merged[0]?.priceMax).toBe(1_020);
  });

  it("⑥-2 자동주문의 **매도 접수** 2건은 묶인다", () => {
    const merged = mergeOrderNotices([
      autoFill({ orderNo: "0000100002", createdAt: at(500), side: "S" }, { nt: "A" }),
      autoFill({ orderNo: "0000100001", createdAt: at(0), side: "S" }, { nt: "A" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.count).toBe(2);
  });

  it("⑥-3 자동주문의 **매수 접수** 2건은 묶이지 않는다 (Pitfall 8 직접 그물)", () => {
    // 취소 직후 재매수가 앞 줄에 합쳐지면 이미 취소된 수량이 더해져 보인다.
    const merged = mergeOrderNotices([
      autoFill({ orderNo: "0000100002", createdAt: at(500), side: "B" }, { nt: "A" }),
      autoFill({ orderNo: "0000100001", createdAt: at(0), side: "B" }, { nt: "A" }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.every((m) => m.count === 1)).toBe(true);
  });

  it("⑥-4 거부(R)는 묶이지 않는다", () => {
    const merged = mergeOrderNotices([
      autoFill({ orderNo: "0000100002", createdAt: at(500) }, { nt: "R", rc: 804 }),
      autoFill({ orderNo: "0000100001", createdAt: at(0) }, { nt: "R", rc: 804 }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("⑥-5 취소확인(C)은 묶이지 않는다", () => {
    const merged = mergeOrderNotices([
      autoFill({ orderNo: "0000100002", createdAt: at(500) }, { nt: "C" }),
      autoFill({ orderNo: "0000100001", createdAt: at(0) }, { nt: "C" }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("⑥-6 정정확인(M)은 묶이지 않는다", () => {
    const merged = mergeOrderNotices([
      autoFill({ orderNo: "0000100002", createdAt: at(500) }, { nt: "M" }),
      autoFill({ orderNo: "0000100001", createdAt: at(0) }, { nt: "M" }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("⑥-7 3초를 넘긴 4번째 체결은 새 행이 된다 — 창 기준은 그 묶음의 첫 통보다", () => {
    // 슬라이딩 창이면 통보가 계속 오는 동안 한 행이 무한히 자란다 (T-17-36).
    const merged = mergeOrderNotices([
      autoFill({ orderNo: "0000100004", createdAt: at(4_000) }),
      autoFill({ orderNo: "0000100003", createdAt: at(2_000) }),
      autoFill({ orderNo: "0000100002", createdAt: at(1_000) }),
      autoFill({ orderNo: "0000100001", createdAt: at(0) }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.count)).toEqual([1, 3]);
  });

  it("⑥-8 묶이지 않은 단건에는 묶임 표기가 붙지 않는다 (N === 1)", () => {
    const merged = mergeOrderNotices([autoFill({ orderNo: "0000100001" })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.count).toBe(1);
    // `#a~b` 도 `(N건)` 도 없다 — 단건이 묶인 것처럼 보이면 안 된다.
    expect(merged[0]?.orderNoText).toBe("0000100001");
  });

  it("⑥-9 창 기준은 **그 묶음의 첫 통보**다 — 경계 3000ms 는 포함이다", () => {
    const merged = mergeOrderNotices([
      autoFill({ orderNo: "0000100002", createdAt: at(3_000) }),
      autoFill({ orderNo: "0000100001", createdAt: at(0) }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.count).toBe(2);
  });

  it("⑥-10 창 폭은 인자로 바꿀 수 있다 — 현재 시각을 읽지 않는다", () => {
    const rows = [
      autoFill({ orderNo: "0000100002", createdAt: at(2_000) }),
      autoFill({ orderNo: "0000100001", createdAt: at(0) }),
    ];
    expect(mergeOrderNotices(rows, 1_000)).toHaveLength(2);
    expect(mergeOrderNotices(rows, 3_000)).toHaveLength(1);
    // 같은 입력은 몇 번을 불러도 같은 출력이다.
    expect(mergeOrderNotices(rows)).toEqual(mergeOrderNotices(rows));
  });

  it("⑥-11 라이브 통보 없는 복원 행만 있으면 묶기가 아무것도 바꾸지 않는다", () => {
    const rows: TodayOrderRow[] = [
      { ...autoFill({ orderNo: "0000100002", createdAt: at(500) }), live: null },
      { ...autoFill({ orderNo: "0000100001", createdAt: at(0) }), live: null },
    ];
    const merged = mergeOrderNotices(rows);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.head)).toEqual(rows);
  });
});
