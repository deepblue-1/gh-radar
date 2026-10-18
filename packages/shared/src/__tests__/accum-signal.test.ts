/**
 * quick-261018-rfy — kind 16 `AccumSignal`(매집감지) 행 → 이름 풀기.
 * 칸 매핑 정본 = 인박스 `docs/inbox/from-gh-trade/261018-accum-signal.md` 「kind 16 — 43칸 매핑 표」.
 */
import { describe, it, expect } from "vitest";
import {
  ACCUM_END_REASON_LABELS,
  ACCUM_STATE_LABELS,
  accumSignalOf,
} from "../accum-signal";
import type { StrategyEventRow } from "../strategy-event";

const NOTE_MESSAGE = "since=20261016|reg=101523|st=1|end=0|cyc=2|carry=0|row=1|our=0|th=100000000/30/500000000000";

/** 43칸이 모두 서로 다른 값인 kind 16 행 — 칸이 뒤섞이면 단언이 잡는다. */
function accumRow(over: Partial<StrategyEventRow> = {}): StrategyEventRow {
  return {
    gateway: "KB120",
    journalEpoch: "ep-34",
    seq: 77,
    tradeDate: "2026-10-18",
    gwTimeMs: 1_792_290_900_000,
    kind: 16,
    group: 0,
    exchange: "KRX",
    isin: "KR7000020008",
    stockCode: "000020",
    cumVolume: 1_234_567,
    accountNo: "",
    orderNo: "",
    price: 10_450,
    qty: 1,
    orderCondition: "",
    reasonCode: "",
    condThreshold: 1_234_000_000,
    condActual: 512,
    condMetric: 0,
    evKind: 2,
    evPrice: 10_120,
    evQtyBefore: 150_000,
    evQtyAfter: 30_000,
    evTradeQty: 120_000,
    limitBidQty: 1_518_000_000,
    bid1Price: 9_980,
    bid1Qty: 284_000_000,
    acceptLatencyUs: 0,
    immediateFillQty: 1_500,
    queueCase: 1,
    baseCum: 321_000_000_000,
    aheadQty: 45,
    expectedCum: 2,
    errorVolume: 0,
    remainingVolume: 0,
    hasRemaining: false,
    cancelReason: 0,
    resultCode: 3,
    message: NOTE_MESSAGE,
    entryRound: 0,
    snapQty: [9_900, 10_300],
    snapCum: [100_000_000, 30],
    askQtyAtLimit: 1_600_000_000,
    openAtLimit: false,
    ...over,
  };
}

describe("accumSignalOf — kind 16 43칸 → 이름 (노트 매핑 표)", () => {
  it("노트 예시 행을 모든 칸 이름으로 돌려준다", () => {
    const sig = accumSignalOf(accumRow());
    expect(sig).toEqual({
      isin: "KR7000020008",
      exchange: "KRX",
      stockCode: "000020",
      tradeDate: "2026-10-18",
      gateway: "KB120",
      gwTimeMs: 1_792_290_900_000,
      state: 1,
      endReason: 0,
      cycle: 2,
      carryDays: 0,
      buyQty: 150_000,
      buyKrw: 1_518_000_000,
      sellQty: 30_000,
      sellKrw: 284_000_000,
      netQty: 120_000,
      netKrw: 1_234_000_000,
      avgPx: 10_120,
      loPx: 9_900,
      hiPx: 10_300,
      regPx: 9_980,
      peakNetKrw: 1_600_000_000,
      sellPhases: 3,
      maxSame: 45,
      mcapKrw: 321_000_000_000,
      ourExcludedQty: 1_500,
      lastPx: 10_450,
      rateBp: 512,
      row: 1,
      sinceDate: "2026-10-16",
      regTime: "10:15:23",
      thNetKrw: 100_000_000,
      thMinSame: 30,
      thMaxMcapKrw: 500_000_000_000,
    });
  });

  it("매도중(2) · 청산(3) · 종료 사유 · 이월 · 행 종류 4 를 칸 그대로 옮긴다", () => {
    const sell = accumSignalOf(accumRow({ qty: 2, entryRound: 2, queueCase: 2 }));
    expect(sell?.state).toBe(2);
    expect(sell?.carryDays).toBe(2);
    expect(sell?.row).toBe(2);
    const end = accumSignalOf(accumRow({ qty: 3, cancelReason: 2, queueCase: 4 }));
    expect(end?.state).toBe(3);
    expect(end?.endReason).toBe(2);
    expect(end?.row).toBe(4);
  });

  it("음수 순매수(netKrw) · 음수 등락률(rateBp)을 부호 그대로 둔다", () => {
    const sig = accumSignalOf(accumRow({ condThreshold: -250_000_000, condActual: -130 }));
    expect(sig?.netKrw).toBe(-250_000_000);
    expect(sig?.rateBp).toBe(-130);
  });

  it("kind ≠ 16 · isin 빈 문자열 · state ∉ {1,2,3} → null", () => {
    expect(accumSignalOf(accumRow({ kind: 15 }))).toBeNull();
    expect(accumSignalOf(accumRow({ kind: 1 }))).toBeNull();
    expect(accumSignalOf(accumRow({ isin: "" }))).toBeNull();
    expect(accumSignalOf(accumRow({ qty: 0 }))).toBeNull();
    expect(accumSignalOf(accumRow({ qty: 4 }))).toBeNull();
  });

  it("message 가 비었으면 sinceDate · regTime · thMaxMcapKrw 만 null (나머지 칸은 그대로)", () => {
    const sig = accumSignalOf(accumRow({ message: "" }));
    expect(sig).not.toBeNull();
    expect(sig?.sinceDate).toBeNull();
    expect(sig?.regTime).toBeNull();
    expect(sig?.thMaxMcapKrw).toBeNull();
    expect(sig?.netKrw).toBe(1_234_000_000);
    expect(sig?.thNetKrw).toBe(100_000_000);
    expect(sig?.cycle).toBe(2);
  });

  it("message 키가 깨지면 그 값만 null", () => {
    const bad = accumSignalOf(accumRow({ message: "since=2026-10-16|reg=1015|st=1|th=100000000/30/abc" }));
    expect(bad?.sinceDate).toBeNull();
    expect(bad?.regTime).toBeNull();
    expect(bad?.thMaxMcapKrw).toBeNull();
    const partial = accumSignalOf(accumRow({ message: "since=20261016|reg=xx|th=1/2" }));
    expect(partial?.sinceDate).toBe("2026-10-16");
    expect(partial?.regTime).toBeNull();
    expect(partial?.thMaxMcapKrw).toBeNull();
  });

  it("message 의 st/end/cyc/carry/row/our 는 읽지 않는다 — 칸이 정본", () => {
    const sig = accumSignalOf(
      accumRow({ message: "since=20261016|reg=101523|st=3|end=2|cyc=9|carry=5|row=4|our=999|th=1/2/3" }),
    );
    expect(sig?.state).toBe(1);
    expect(sig?.endReason).toBe(0);
    expect(sig?.cycle).toBe(2);
    expect(sig?.carryDays).toBe(0);
    expect(sig?.row).toBe(1);
    expect(sig?.ourExcludedQty).toBe(1_500);
    expect(sig?.thMaxMcapKrw).toBe(3);
  });

  it("snapQty / snapCum 길이 < 2 → 빠진 원소 0", () => {
    const sig = accumSignalOf(accumRow({ snapQty: [9_900], snapCum: [] }));
    expect(sig?.loPx).toBe(9_900);
    expect(sig?.hiPx).toBe(0);
    expect(sig?.thNetKrw).toBe(0);
    expect(sig?.thMinSame).toBe(0);
  });

  it("상태 · 종료 사유 문구 (gh-trade 클라 동형 — 배지는 「청산」 하나)", () => {
    expect(ACCUM_STATE_LABELS).toEqual({ 1: "매집중", 2: "매도중", 3: "청산" });
    expect(ACCUM_END_REASON_LABELS).toEqual({ 1: "청산", 2: "이월 탈락", 3: "이월 만료" });
  });
});
