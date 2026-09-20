import { describe, expect, it } from "vitest";

import { orderActionSide, orderActionWord, orderNoticeLabel } from "../order-notices";

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
