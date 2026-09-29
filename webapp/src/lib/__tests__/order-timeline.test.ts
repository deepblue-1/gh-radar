import { describe, expect, it } from "vitest";

import { timelineStrategyText, type JournalEventRow, type JournalOrderRow } from "@gh-radar/shared";

import {
  buildTimeline,
  isExpandable,
  journalTimelineLine,
  liveStrategyRows,
  memberOrderNos,
  membersSeqSignature,
  TIMELINE_REFETCH_DEBOUNCE_MS,
} from "../order-timeline";
import {
  BUNDLE_ORDER_NOS,
  BUNDLE_ROWS,
  FIXTURE_ACCOUNT_NO,
  FIXTURE_TRADE_DATE,
  JEV_12451_A,
  JEV_12451_E1,
  JEV_12451_E2,
  JEV_12453_C,
  ROW_12451,
  ROW_MANUAL,
  TIMELINE_12451,
  TIMELINE_BUNDLE,
  TIMELINE_MANUAL,
  at,
  journalEvent,
  journalItem,
  orderRow,
  strategyItem,
  strategyRow,
} from "@/test-fixtures/order-timeline";

/**
 * 25-08 Task 1 — 오늘 주문 행 펼침 타임라인의 순수 함수 (D-01 ~ D-03).
 *
 *  ① 통보 줄 문장 표 — gh-trade 템플릿 v0 + 대조 합의 문장에서 **행위 단어만** 앞 칸으로(재작성 금지 · R7).
 *     판정은 notice_type · request_kind · side_trusted · result_code · local_reject 뿐이고 message 는 꼬리다(D-36).
 *  ② running sum 은 주문번호별 E 를 seq 순 누적 · 분모 = 그 주문 행 qty · 전량 = running + modifiedQty ≥ qty.
 *  ③ 타임라인 순서 = gw_time_ms → 같은 ms 통보 먼저 → seq (Pitfall 9) · 상따 줄은 `timelineStrategyText` 한 조립기(D-09).
 *  ④ 라이브 선택 = 같은 계좌 · 같은 거래일 · 구성원 주문번호의 전략 이벤트만(시세 이벤트 제외).
 */

const ctx = (row: JournalOrderRow | undefined, running: number | null = null) => ({
  row,
  running,
  members: row === undefined ? [] : [row],
});

describe("journalTimelineLine — 통보 문장 표 (템플릿 v0 · 대조 합의)", () => {
  it("A 접수 — 행위 「접수」 · 나머지 원문 순서 그대로", () => {
    expect(journalTimelineLine(JEV_12451_A, ctx(ROW_12451))).toEqual({
      action: "접수",
      text: "매수 300주 @12,350",
      cumTail: null,
    });
  });

  it("E 체결 — 분모 = 행 qty · 방향 단어 유지 · 누적 꼬리 분리", () => {
    expect(journalTimelineLine(JEV_12451_E1, ctx(ROW_12451, 100))).toEqual({
      action: "체결",
      text: "매수 100주 @12,350",
      cumTail: "(누적 100/300)",
    });
  });

  it("E 전량 체결 — running ≥ qty 면 「전량 체결」 · 방향 없음", () => {
    expect(journalTimelineLine(JEV_12451_E2, ctx(ROW_12451, 300))).toEqual({
      action: "전량 체결",
      text: "200주 @12,350",
      cumTail: "(누적 300/300)",
    });
  });

  it("E 전량 판정은 정정 이동 수량을 더한다 — running + modifiedQty ≥ qty", () => {
    const moved = { ...ROW_12451, modifiedQty: 100 };
    expect(journalTimelineLine(JEV_12451_E2, ctx(moved, 200)).action).toBe("전량 체결");
    expect(journalTimelineLine(JEV_12451_E2, ctx(ROW_12451, 200)).action).toBe("체결");
  });

  it("E 행 qty 모름 — 분모 없이 「체결 N주」 · 꼬리 null", () => {
    const unknownQty = { ...ROW_12451, qty: null };
    expect(journalTimelineLine(JEV_12451_E1, ctx(unknownQty, 100))).toEqual({
      action: "체결",
      text: "매수 100주 @12,350",
      cumTail: null,
    });
    // 행 자체를 모르면(구성원 밖) 역시 분모 없음.
    expect(journalTimelineLine(JEV_12451_E1, ctx(undefined, 100)).cumTail).toBeNull();
  });

  it("방향은 side_trusted ∧ side 일 때만 — 그 밖은 「주문」", () => {
    const untrusted = { ...JEV_12451_A, sideTrusted: false };
    expect(journalTimelineLine(untrusted, ctx(ROW_12451)).text).toBe("주문 300주 @12,350");
    const noSide = { ...JEV_12451_A, side: "" };
    expect(journalTimelineLine(noSide, ctx(ROW_12451)).text).toBe("주문 300주 @12,350");
    const sell = { ...JEV_12451_A, side: "S" };
    expect(journalTimelineLine(sell, ctx(ROW_12451)).text).toBe("매도 300주 @12,350");
  });

  it("C 원주문이 따로 있으면 「취소 확인」 · 잔량", () => {
    expect(journalTimelineLine(JEV_12453_C, ctx(undefined))).toEqual({
      action: "취소 확인",
      text: "잔량 300주",
      cumTail: null,
    });
  });

  it("C 원주문 번호가 비었거나 자기 번호면 「거래소 취소」 · 잔량 0 이면 빈 문장", () => {
    const exchange = { ...JEV_12453_C, orgOrderNo: "" };
    expect(journalTimelineLine(exchange, ctx(undefined))).toEqual({
      action: "거래소 취소",
      text: "잔량 300주",
      cumTail: null,
    });
    const self = { ...JEV_12453_C, orgOrderNo: "12460", orderQty: 0 };
    expect(journalTimelineLine(self, ctx(undefined))).toEqual({
      action: "거래소 취소",
      text: "",
      cumTail: null,
    });
  });

  it("M 새 번호 행이 구성원에 있고 qty 있으면 행 qty(DB 캡) · 없으면 「요청 N주」", () => {
    const m = journalEvent({
      seq: 40,
      gwTimeMs: at("10:00:00.000"),
      noticeType: "M",
      orderNo: "12480",
      orgOrderNo: "12451",
      requestKind: "Modify",
      orderPrice: 12_300,
      orderQty: 500,
    });
    const capped = orderRow({ id: "ord-12480", orderNo: "12480", qty: 200 });
    expect(journalTimelineLine(m, { row: capped, running: null, members: [ROW_12451, capped] })).toEqual({
      action: "정정 확인",
      text: "200주 @12,300",
      cumTail: null,
    });
    expect(journalTimelineLine(m, { row: undefined, running: null, members: [ROW_12451] })).toEqual({
      action: "정정 확인",
      text: "요청 500주 @12,300",
      cumTail: null,
    });
  });

  it("R 취소 거부 — message 는 원문 꼬리일 뿐 판정 입력이 아니다", () => {
    const r = journalEvent({
      seq: 41,
      gwTimeMs: at("10:00:01.000"),
      noticeType: "R",
      orderNo: "12451",
      requestKind: "Cancel",
      resultCode: 804,
      message: "이미 체결·취소돼 취소할 잔량 없음",
    });
    expect(journalTimelineLine(r, ctx(ROW_12451))).toEqual({
      action: "거부",
      text: "취소 거부 — 이미 체결·취소돼 취소할 잔량 없음",
      cumTail: null,
    });
    // 같은 문구를 정정 거부에 실어도 판정은 request_kind 다.
    expect(journalTimelineLine({ ...r, requestKind: "Modify" }, ctx(ROW_12451)).text).toBe(
      "정정 거부 — 이미 체결·취소돼 취소할 잔량 없음",
    );
    // 문구가 「매수」 를 말해도 행위는 바뀌지 않는다.
    expect(journalTimelineLine({ ...r, message: "매수 체결" }, ctx(ROW_12451)).action).toBe("거부");
  });

  it("R result_code −2 — 「접수 불명」 · 꼬리만", () => {
    const r = journalEvent({
      seq: 42,
      gwTimeMs: at("10:00:02.000"),
      noticeType: "R",
      orderNo: "",
      resultCode: -2,
      message: "응답 없음",
      orderQty: 300,
      orderPrice: 12_350,
    });
    expect(journalTimelineLine(r, ctx(undefined))).toEqual({
      action: "접수 불명",
      text: "— 응답 없음",
      cumTail: null,
    });
    expect(journalTimelineLine({ ...r, message: "" }, ctx(undefined)).text).toBe("");
  });

  it("R 로컬 거부 · 신규 거부 — 방향 수량 가격 + (서버 거부(미전송)) + 꼬리", () => {
    const base = journalEvent({
      seq: 43,
      gwTimeMs: at("10:00:03.000"),
      noticeType: "R",
      orderNo: "",
      resultCode: 1,
      orderQty: 300,
      orderPrice: 12_350,
      message: "주문거부 가격범위초과",
    });
    expect(journalTimelineLine({ ...base, localReject: true }, ctx(undefined))).toEqual({
      action: "거부",
      text: "매수 300주 @12,350 서버 거부(미전송) — 주문거부 가격범위초과",
      cumTail: null,
    });
    expect(journalTimelineLine(base, ctx(undefined))).toEqual({
      action: "거부",
      text: "매수 300주 @12,350 — 주문거부 가격범위초과",
      cumTail: null,
    });
    expect(journalTimelineLine({ ...base, message: "" }, ctx(undefined)).text).toBe("매수 300주 @12,350");
  });

  it("A 예약(Q-ID) — 「예약 접수」 · 번호를 문장 끝에", () => {
    const q = journalEvent({
      seq: 44,
      gwTimeMs: at("15:31:10.000"),
      noticeType: "A",
      orderNo: "Q000000012",
      orderQty: 200,
      orderPrice: 45_000,
    });
    expect(journalTimelineLine(q, ctx(undefined))).toEqual({
      action: "예약 접수",
      text: "매수 200주 @45,000 Q000000012",
      cumTail: null,
    });
  });

  it("board G2/G3 — 방향 줄 앞 「시간외종가 」 · 취소 확인은 문장 앞에만", () => {
    const g2 = { ...JEV_12451_A, board: "G2" };
    expect(journalTimelineLine(g2, ctx(ROW_12451)).text).toBe("시간외종가 매수 300주 @12,350");
    const g3c = { ...JEV_12453_C, board: "G3" };
    expect(journalTimelineLine(g3c, ctx(undefined))).toEqual({
      action: "취소 확인",
      text: "시간외종가 잔량 300주",
      cumTail: null,
    });
    const g1 = { ...JEV_12451_A, board: "G1" };
    expect(journalTimelineLine(g1, ctx(ROW_12451)).text).toBe("매수 300주 @12,350");
  });

  it("모르는 notice — 원문 그대로 · 빈 값이면 「통보」 · 빈 문장", () => {
    expect(journalTimelineLine({ ...JEV_12451_A, noticeType: "X" }, ctx(ROW_12451))).toEqual({
      action: "X",
      text: "",
      cumTail: null,
    });
    expect(journalTimelineLine({ ...JEV_12451_A, noticeType: "" }, ctx(ROW_12451)).action).toBe("통보");
  });
});

describe("buildTimeline — 한 타임라인 (D-01 · D-02)", () => {
  it("12451 — 같은 ms 는 통보 먼저 · 상따 줄은 timelineStrategyText", () => {
    const lines = buildTimeline(TIMELINE_12451, [ROW_12451], { bundled: false });
    expect(lines.map((l) => [l.time, l.source, l.action])).toEqual([
      ["09:45:02.861", "strategy", "주문"],
      ["09:45:02.879", "journal", "접수"],
      ["09:45:02.880", "strategy", "대기"],
      ["09:45:07.415", "journal", "체결"],
      ["09:45:07.415", "strategy", "첫 체결"],
      ["09:45:09.102", "journal", "전량 체결"],
    ]);
    const fill = timelineStrategyText(strategyRow("fill12451"));
    expect(lines[4]).toMatchObject({ action: fill.action, text: fill.text, cumTail: null });
    expect(lines[3]).toMatchObject({ text: "매수 100주 @12,350", cumTail: "(누적 100/300)" });
    expect(lines[5]).toMatchObject({ text: "200주 @12,350", cumTail: "(누적 300/300)" });
    // 단건이면 주문번호 꼬리 없음.
    expect(lines.every((l) => l.orderNo === null)).toBe(true);
  });

  it("입력 순서가 섞여도 같은 결과 · 같은 키 중복은 한 줄", () => {
    const shuffled = [...TIMELINE_12451].reverse();
    const dup = [...shuffled, TIMELINE_12451[0]!, TIMELINE_12451[3]!];
    const a = buildTimeline(TIMELINE_12451, [ROW_12451], { bundled: false });
    const b = buildTimeline(dup, [ROW_12451], { bundled: false });
    expect(b).toEqual(a);
    expect(new Set(a.map((l) => l.key)).size).toBe(a.length);
  });

  it("running sum 은 주문번호별 — 묶음 12461 · 12462 체결이 섞여도 각자 누적", () => {
    const lines = buildTimeline(TIMELINE_BUNDLE, BUNDLE_ROWS, { bundled: true });
    const tails = lines
      .filter((l) => l.source === "journal" && (l.orderNo === "12461" || l.orderNo === "12462"))
      .filter((l) => l.cumTail !== null)
      .map((l) => [l.orderNo, l.action, l.cumTail]);
    expect(tails).toEqual([
      ["12461", "체결", "(누적 120/600)"],
      ["12461", "전량 체결", "(누적 600/600)"],
      ["12462", "전량 체결", "(누적 300/300)"],
    ]);
  });

  it("bundled 면 줄마다 주문번호 꼬리 — 취소 확인(새 번호)은 원주문 번호로", () => {
    const lines = buildTimeline(TIMELINE_BUNDLE, BUNDLE_ROWS, { bundled: true });
    expect(lines.every((l) => l.orderNo !== null && BUNDLE_ORDER_NOS.includes(l.orderNo as never))).toBe(true);
    const cancel = buildTimeline(
      [journalItem(JEV_12453_C)],
      [orderRow({ id: "x", orderNo: "12453" }), orderRow({ id: "y", orderNo: "12454" })],
      { bundled: true },
    );
    expect(cancel[0]?.orderNo).toBe("12453");
  });

  it("수동 주문 — 통보 줄만", () => {
    const lines = buildTimeline(TIMELINE_MANUAL, [ROW_MANUAL], { bundled: false });
    expect(lines.map((l) => [l.source, l.action, l.text])).toEqual([["journal", "접수", "매수 10주 @12,400"]]);
  });

  it("빈 응답 — 빈 배열", () => {
    expect(buildTimeline([], [ROW_12451], { bundled: false })).toEqual([]);
  });
});

describe("liveStrategyRows — 라이브 끼워 넣기 대상 (D-03)", () => {
  it("같은 계좌 · 같은 거래일 · 구성원 주문번호의 주문 이벤트만 · 시세 이벤트 제외", () => {
    const queued = strategyRow("queued12451");
    const otherAccount = { ...queued, seq: 901, accountNo: "9999999901" };
    const otherOrder = { ...queued, seq: 902, orderNo: "12999" };
    const yesterday = { ...queued, seq: 903, tradeDate: "2026-09-28" };
    const market = strategyRow("entered1");
    const picked = liveStrategyRows(
      [queued, otherAccount, otherOrder, yesterday, market],
      [ROW_12451],
      FIXTURE_ACCOUNT_NO,
      FIXTURE_TRADE_DATE,
    );
    expect(picked).toEqual([strategyItem(queued)]);
  });
});

describe("memberOrderNos · isExpandable · membersSeqSignature", () => {
  it("memberOrderNos — null 제외 · 중복 제거 · 순서 유지", () => {
    const rows = [
      orderRow({ id: "a", orderNo: "12461" }),
      orderRow({ id: "b", orderNo: null }),
      orderRow({ id: "c", orderNo: "12462" }),
      orderRow({ id: "d", orderNo: "12461" }),
    ];
    expect(memberOrderNos(rows)).toEqual(["12461", "12462"]);
  });

  it("isExpandable — 주문번호 표기가 없으면 펼칠 수 없다", () => {
    expect(isExpandable({ orderNoText: null })).toBe(false);
    expect(isExpandable({ orderNoText: "12451" })).toBe(true);
    expect(isExpandable({ orderNoText: "#12461~12467" })).toBe(true);
  });

  it("membersSeqSignature — 구성원 lastSeq 변화에만 바뀐다", () => {
    const members = [ROW_12451];
    const base = membersSeqSignature(members, []);
    const unrelated = orderRow({ id: "zzz", orderNo: "99999", lastSeq: 500 });
    expect(membersSeqSignature(members, [unrelated])).toBe(base);
    // 스토어 행이 더 최신이면 바뀐다.
    expect(membersSeqSignature(members, [{ ...ROW_12451, lastSeq: 15 }])).not.toBe(base);
    // 구성원 자체의 lastSeq 가 오르면 바뀐다.
    expect(membersSeqSignature([{ ...ROW_12451, lastSeq: 15 }], [])).not.toBe(base);
    // 스토어의 옛 값(더 작은 lastSeq)은 무시한다.
    expect(membersSeqSignature(members, [{ ...ROW_12451, lastSeq: 3 }])).toBe(base);
  });

  it("재조회 디바운스는 400ms (UI-SPEC R19)", () => {
    expect(TIMELINE_REFETCH_DEBOUNCE_MS).toBe(400);
  });
});

// 타입 확인용 — 픽스처 이벤트가 공유 계약 모양이다.
const _typecheck: JournalEventRow = JEV_12451_A;
void _typecheck;
