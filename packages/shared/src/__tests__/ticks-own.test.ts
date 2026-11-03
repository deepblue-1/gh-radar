/**
 * Phase 38 (D-15 · SC-2) `matchOwnFills` 합성 경계 — 창 [−200, +1500]ms · 남은 수량 차감 · 「추정」 20ms · 동률 = 작은 j ·
 * 가격 불일치 · tNs 없음(수신 시각) · 입력 순서 처리. 정의는 own-fills.ts 머리 주석 · RESEARCH Pattern 1 (a).
 *
 * 38-05: `locateEvidence` · `anchorOf` 합성 경계 — B6 창 [g − 3000, g + 50] · 마지막 일치 · 매수 · 매도 단 · 체결 단건 ·
 * 주기매도 구간 (before, after] · 근거 없음 · 앵커 마지막 j. 정의는 own-fills.ts 「조건 근거 · 앵커」 머리 주석.
 *
 * 합성 A3 는 A3_LAYOUT · 합성 B6 는 B6_LAYOUT 필드 이름으로 채운다(매직 오프셋 없음 — webapp tick-synth `a3Msg` 와 같은 꼴).
 * trade_time 은 수신 시각이 속한 KST 날짜의 HHMMSSuuuuuu 로 풀린다(parseTime12Ns) — 기준 13:00:00 KST.
 */
import { describe, expect, it } from "vitest";
import { concatBytes, encodeRecord } from "../ticks/framing";
import { A3_LAYOUT, B6_LAYOUT, type Layout } from "../ticks/layouts";
import {
  a3TimeMs,
  anchorOf,
  cumIndexOf,
  locateEvidence,
  matchOwnFills,
  OWN_B6_AFTER_MS,
  OWN_B6_BEFORE_MS,
  OWN_MATCH_DT_MAX_MS,
  OWN_MATCH_DT_MIN_MS,
  OWN_MATCH_EST_MS,
  type OwnEventIn,
} from "../ticks/own-fills";
import { a3ColumnsOf, buildTickIndex, recvOrderOf, type A3Columns, type TickIndex } from "../ticks/record-index";
import { dayStartNs } from "../ticks/tick-time";

/** 13:00:00.000 KST(2026-10-30) epoch ns · ms. */
const BASE_NS = dayStartNs("20261030", "1300");
const BASE_MS = Number(BASE_NS / 1_000_000n);

function put(b: Uint8Array, off: number, s: string): void {
  for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
}

function field(layout: Layout, name: string): { offset: number; length: number } {
  const f = layout.fields.find((x) => x.name === name);
  if (!f) throw new Error(`${layout.table}.${name} 없음`);
  return f;
}

function setStr(b: Uint8Array, name: string, v: string, layout: Layout = A3_LAYOUT): void {
  const f = field(layout, name);
  put(b, f.offset, v.padEnd(f.length, " ").slice(0, f.length));
}

function setNum(b: Uint8Array, name: string, v: number, layout: Layout = A3_LAYOUT): void {
  const f = field(layout, name);
  put(b, f.offset, String(Math.trunc(Math.abs(v))).padStart(f.length, "0"));
}

function setPrice(b: Uint8Array, name: string, v: number, layout: Layout = A3_LAYOUT): void {
  const f = field(layout, name);
  put(b, f.offset, (v < 0 ? "-0" : "00") + String(Math.abs(v)).padStart(f.length - 2, "0"));
}

/** 13:00:00 기준 µs 오프셋 → HHMMSSuuuuuu. */
function timeOf(offUs: number): string {
  const total = 13 * 3600 * 1_000_000 + offUs;
  const us = total % 1_000_000;
  const s = Math.floor(total / 1_000_000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p2 = (x: number): string => String(x).padStart(2, "0");
  return `${p2(hh)}${p2(mm)}${p2(ss)}${String(us).padStart(6, "0")}`;
}

interface A3Rec {
  seq: number;
  px: number;
  qty: number;
  /** 체결 시각 — 13:00:00 기준 µs. null 이면 trade_time 을 숫자가 아닌 칸으로(tNs −1n). */
  timeUs: number | null;
  /** 수신 시각 — 13:00:00 기준 µs(기본 = timeUs 또는 0). */
  recvUs?: number;
  cumVolume?: number;
}

/** 테스트 안 지역 헬퍼 — A3_LAYOUT 필드 이름으로 한 건을 채워 레코드 프레이밍 바이트로. */
function a3Rec(s: A3Rec): Uint8Array {
  const b = new Uint8Array(A3_LAYOUT.size).fill(48);
  put(b, 0, A3_LAYOUT.tag);
  put(b, 2, "01S");
  setNum(b, "msg_seq", s.seq);
  setStr(b, "board_id", "G1");
  setStr(b, "isin", "KR7184230001");
  setStr(b, "final_bs_code", "2");
  setPrice(b, "trade_price", s.px);
  setNum(b, "trade_qty", s.qty);
  setStr(b, "trade_time", s.timeUs === null ? "            " : timeOf(s.timeUs));
  setNum(b, "cum_volume", s.cumVolume ?? 0);
  const recvUs = s.recvUs ?? s.timeUs ?? 0;
  return encodeRecord(BASE_NS + BigInt(recvUs) * 1000n, b);
}

function cols(recs: A3Rec[]): { index: TickIndex; a3: A3Columns } {
  const buf = concatBytes(recs.map(a3Rec));
  const index = buildTickIndex(buf, "krx");
  return { index, a3: a3ColumnsOf(buf, index) };
}

/** 13:00:00 + ms 의 gw epoch ms. */
const gw = (ms: number): number => BASE_MS + ms;

/** 거를 rec 목록 → rec → 1 배열(웹 세션 `duplicates` 모양). */
function skipOf(index: TickIndex, recs: number[]): Uint8Array {
  const out = new Uint8Array(index.n);
  for (const r of recs) out[r] = 1;
  return out;
}

describe("matchOwnFills 합성 경계", () => {
  it("합성 헬퍼 — A3 열 값(px · qty · cumVolume · 시각)", () => {
    const { index, a3 } = cols([{ seq: 1, px: 1000, qty: 300, timeUs: 1_500_250, cumVolume: 12_345 }]);
    expect(a3.n).toBe(1);
    expect(a3.px[0]).toBe(1000);
    expect(a3.qty[0]).toBe(300);
    expect(a3.cumVolume[0]).toBe(12_345);
    expect(a3TimeMs(index, a3, 0)).toBe(BASE_MS + 1500.25);
  });

  it("창 경계 — dt = −200 · +1500 은 후보 · −201 · +1501 은 아님", () => {
    expect(OWN_MATCH_DT_MIN_MS).toBe(-200);
    expect(OWN_MATCH_DT_MAX_MS).toBe(1500);
    const { index, a3 } = cols([{ seq: 1, px: 1000, qty: 100, timeUs: 10_000_000 }]);
    const t = 10_000; // A3 시각(ms 오프셋)
    const one = (g: number) => matchOwnFills(index, a3, [{ gwMs: gw(g), px: 1000, qty: 10 }])[0]!;
    expect(one(t - 200)).toMatchObject({ a3j: 0, dtMs: -200, candidates: 1, est: false });
    expect(one(t + 1500)).toMatchObject({ a3j: 0, dtMs: 1500, candidates: 1 });
    expect(one(t - 201).a3j).toBe(-1);
    expect(one(t + 1501).a3j).toBe(-1);
    expect(Number.isNaN(one(t + 1501).dtMs)).toBe(true);
  });

  it("남은 수량 차감 — 300주 A3 에 200주 두 건: A3 하나면 둘째 못찾음 · 둘이면 둘째는 다른 A3", () => {
    const single = cols([{ seq: 1, px: 1000, qty: 300, timeUs: 0 }]);
    const fills = [
      { gwMs: gw(10), px: 1000, qty: 200 },
      { gwMs: gw(20), px: 1000, qty: 200 },
    ];
    const m1 = matchOwnFills(single.index, single.a3, fills);
    expect(m1[0]!.a3j).toBe(0);
    expect(m1[1]!.a3j).toBe(-1);
    // a3 열은 바뀌지 않는다
    expect(single.a3.qty[0]).toBe(300);

    const two = cols([
      { seq: 1, px: 1000, qty: 300, timeUs: 0 },
      { seq: 2, px: 1000, qty: 300, timeUs: 100_000 },
    ]);
    const m2 = matchOwnFills(two.index, two.a3, fills);
    expect(m2[0]!.a3j).toBe(0); // |dt| 10 < 90
    expect(m2[1]!.a3j).toBe(1); // A3 0 은 남은 100 < 200 이라 후보 아님
    expect(m2[1]!.candidates).toBe(1);
  });

  it("「추정」 — 첫째 · 둘째 후보 |dt| 차 19.9ms 는 추정 · 20ms 는 추정 아님", () => {
    expect(OWN_MATCH_EST_MS).toBe(20);
    const near = cols([
      { seq: 1, px: 1000, qty: 100, timeUs: 0 },
      { seq: 2, px: 1000, qty: 100, timeUs: 19_900 },
    ]);
    const a = matchOwnFills(near.index, near.a3, [{ gwMs: gw(500), px: 1000, qty: 10 }])[0]!;
    expect(a).toMatchObject({ a3j: 1, candidates: 2, est: true });

    const far = cols([
      { seq: 1, px: 1000, qty: 100, timeUs: 0 },
      { seq: 2, px: 1000, qty: 100, timeUs: 20_000 },
    ]);
    const b = matchOwnFills(far.index, far.a3, [{ gwMs: gw(500), px: 1000, qty: 10 }])[0]!;
    expect(b).toMatchObject({ a3j: 1, candidates: 2, est: false });
  });

  it("|dt| 동률이면 A3 열 색인(파일 순서) 작은 쪽 — 시각순과 파일순이 달라도", () => {
    // j0 = 더 늦은 A3(dt −100) · j1 = 더 이른 A3(dt +100) — 시각순으로는 j1 이 먼저다
    const { index, a3 } = cols([
      { seq: 1, px: 1000, qty: 100, timeUs: 1_100_000 },
      { seq: 2, px: 1000, qty: 100, timeUs: 900_000 },
    ]);
    const m = matchOwnFills(index, a3, [{ gwMs: gw(1000), px: 1000, qty: 10 }])[0]!;
    expect(m).toMatchObject({ a3j: 0, candidates: 2, est: true, dtMs: -100 });
  });

  it("가격이 다르면 후보 아님", () => {
    const { index, a3 } = cols([
      { seq: 1, px: 1005, qty: 100, timeUs: 0 }, // |dt| 5 — 더 가깝지만 가격이 다르다
      { seq: 2, px: 1000, qty: 100, timeUs: 100_000 }, // dt −95
    ]);
    const m = matchOwnFills(index, a3, [{ gwMs: gw(5), px: 1000, qty: 10 }])[0]!;
    expect(m).toMatchObject({ a3j: 1, candidates: 1, est: false });
    expect(matchOwnFills(index, a3, [{ gwMs: gw(5), px: 990, qty: 10 }])[0]!.a3j).toBe(-1);
  });

  it("tNs 가 −1n 인 A3 는 수신 시각으로 잰다", () => {
    const { index, a3 } = cols([{ seq: 1, px: 1000, qty: 100, timeUs: null, recvUs: 5_000_000 }]);
    expect(a3.tNs[0]).toBe(-1n);
    expect(a3TimeMs(index, a3, 0)).toBe(BASE_MS + 5000);
    const m = matchOwnFills(index, a3, [{ gwMs: gw(5300), px: 1000, qty: 10 }])[0]!;
    expect(m).toMatchObject({ a3j: 0, dtMs: 300 });
    // 체결 시각 칸이 있다면 0 이었을 시각(13:00:00)으로는 창 밖이다 — 수신 시각으로만 잡힌다
    expect(matchOwnFills(index, a3, [{ gwMs: gw(100), px: 1000, qty: 10 }])[0]!.a3j).toBe(-1);
  });

  it("입력 순서대로 차감한다(gw 시각으로 다시 정렬하지 않는다)", () => {
    const { index, a3 } = cols([{ seq: 1, px: 1000, qty: 200, timeUs: 0 }]);
    const m = matchOwnFills(index, a3, [
      { gwMs: gw(1000), px: 1000, qty: 200 }, // 늦은 체결이 먼저 들어왔다
      { gwMs: gw(10), px: 1000, qty: 200 },
    ]);
    expect(m[0]!.a3j).toBe(0);
    expect(m[1]!.a3j).toBe(-1);
  });
});

interface B6Rec {
  seq: number;
  /** 수신 시각 — 13:00:00 기준 µs. */
  recvUs: number;
  /** 매수 단 [가격, 잔량] — bids[0] = 매수1. 빈 단은 0/0. */
  bids?: [number, number][];
  /** 매도 단 [가격, 잔량] — asks[0] = 매도1. */
  asks?: [number, number][];
}

/** 테스트 안 지역 헬퍼 — B6_LAYOUT 필드 이름으로 호가 한 건을 채워 레코드 프레이밍 바이트로. */
function b6Rec(s: B6Rec): Uint8Array {
  const b = new Uint8Array(B6_LAYOUT.size).fill(48);
  put(b, 0, B6_LAYOUT.tag);
  setStr(b, "info_cat", "01S", B6_LAYOUT);
  setNum(b, "msg_seq", s.seq, B6_LAYOUT);
  setStr(b, "board_id", "G1", B6_LAYOUT);
  setStr(b, "isin", "KR7184230001", B6_LAYOUT);
  setStr(b, "proc_time", timeOf(s.recvUs), B6_LAYOUT);
  for (let i = 1; i <= 10; i++) {
    const [bp, bq] = s.bids?.[i - 1] ?? [0, 0];
    const [ap, aq] = s.asks?.[i - 1] ?? [0, 0];
    setPrice(b, `bid${i}_px`, bp, B6_LAYOUT);
    setNum(b, `bid${i}_qty`, bq, B6_LAYOUT);
    setPrice(b, `ask${i}_px`, ap, B6_LAYOUT);
    setNum(b, `ask${i}_qty`, aq, B6_LAYOUT);
  }
  return encodeRecord(BASE_NS + BigInt(s.recvUs) * 1000n, b);
}

type SynthRec = { a3: A3Rec } | { b6: B6Rec };

/**
 * 파일 순서대로 A3 · B6 를 섞은 세션 → locateEvidence 입력 한 벌(recvOrder · cumIdx 는 세션당 한 번).
 * `skipRecs` = 중복으로 거를 rec(파일 순서 색인) — 웹 세션 `duplicates` 와 같은 rec → 1 배열로 만든다.
 */
function session(recs: SynthRec[], skipRecs?: number[]) {
  const buf = concatBytes(recs.map((r) => ("a3" in r ? a3Rec(r.a3) : b6Rec(r.b6))));
  const index = buildTickIndex(buf, "krx");
  const recvOrder = recvOrderOf(index);
  const a3 = a3ColumnsOf(buf, index);
  const skip = skipRecs ? skipOf(index, skipRecs) : undefined;
  const cumIdx = cumIndexOf(a3, skip);
  const locate = (ev: Partial<OwnEventIn> & { gwMs: number; evKind: number }) =>
    locateEvidence(
      buf,
      index,
      recvOrder,
      a3,
      cumIdx,
      {
        evPrice: 0,
        evQtyBefore: 0,
        evQtyAfter: 0,
        evTradeQty: 0,
        ...ev,
      },
      skip,
    );
  return { buf, index, a3, cumIdx, locate };
}

describe("locateEvidence · anchorOf 합성 경계", () => {
  it("B6 합성 헬퍼 — 매수 · 매도 단이 bookAt 그대로", () => {
    const s = session([{ b6: { seq: 1, recvUs: 0, bids: [[1000, 500]], asks: [[1005, 700]] } }]);
    expect(s.index.ok[0]).toBe(1);
    const v = s.locate({ gwMs: gw(0), evKind: 1, evPrice: 1005, evQtyAfter: 700 });
    expect(v).toEqual({ kind: "b6", rec: 0 });
  });

  it("호가 근거 창 — g − 3000 · g + 50 포함 · g − 3001 · g + 51 제외", () => {
    expect(OWN_B6_BEFORE_MS).toBe(3000);
    expect(OWN_B6_AFTER_MS).toBe(50);
    const g = 10_000; // 이벤트 시각(ms 오프셋)
    const one = (recvMs: number) =>
      session([{ b6: { seq: 1, recvUs: recvMs * 1000, bids: [[1000, 500]] } }]).locate({
        gwMs: gw(g),
        evKind: 1,
        evPrice: 1000,
        evQtyAfter: 500,
      });
    expect(one(g - 3000)).toEqual({ kind: "b6", rec: 0 });
    expect(one(g + 50)).toEqual({ kind: "b6", rec: 0 });
    expect(one(g - 3001)).toEqual({ kind: "none" });
    expect(one(g + 51)).toEqual({ kind: "none" });
  });

  it("창 안 일치가 둘이면 뒤(수신순 마지막) 것 · 잔량 다르면 근거 아님", () => {
    const s = session([
      { b6: { seq: 1, recvUs: 1_000_000, bids: [[1000, 500]] } },
      { b6: { seq: 2, recvUs: 2_000_000, bids: [[1000, 500]] } },
      { b6: { seq: 3, recvUs: 2_500_000, bids: [[1000, 499]] } }, // 더 늦지만 잔량이 다르다
    ]);
    expect(s.locate({ gwMs: gw(3000), evKind: 1, evPrice: 1000, evQtyAfter: 500 })).toEqual({ kind: "b6", rec: 1 });
    expect(s.locate({ gwMs: gw(3000), evKind: 1, evPrice: 1000, evQtyAfter: 499 })).toEqual({ kind: "b6", rec: 2 });
    expect(s.locate({ gwMs: gw(3000), evKind: 1, evPrice: 1000, evQtyAfter: 1 })).toEqual({ kind: "none" });
  });

  it("매수 단 · 매도 단 어디서든(10단 안 아무 단)", () => {
    const s = session([
      {
        b6: {
          seq: 1,
          recvUs: 0,
          bids: [
            [1000, 10],
            [995, 20],
            [990, 30],
          ],
          asks: [
            [1005, 40],
            [1010, 50],
          ],
        },
      },
    ]);
    expect(s.locate({ gwMs: gw(0), evKind: 1, evPrice: 990, evQtyAfter: 30 })).toEqual({ kind: "b6", rec: 0 });
    expect(s.locate({ gwMs: gw(0), evKind: 1, evPrice: 1010, evQtyAfter: 50 })).toEqual({ kind: "b6", rec: 0 });
    expect(s.locate({ gwMs: gw(0), evKind: 1, evPrice: 1020, evQtyAfter: 50 })).toEqual({ kind: "none" });
  });

  it("체결 근거 단건 — cum == after ∧ 수량 == trade ∧ 가격 == price 가 정확히 하나", () => {
    const s = session([
      { a3: { seq: 1, px: 1000, qty: 50, timeUs: 0, cumVolume: 150 } },
      { a3: { seq: 2, px: 1000, qty: 30, timeUs: 1000, cumVolume: 180 } },
      { a3: { seq: 3, px: 1005, qty: 30, timeUs: 2000, cumVolume: 180 } }, // 같은 cum · 가격 다름 → 후보 아님
    ]);
    const v = s.locate({ gwMs: gw(5), evKind: 2, evPrice: 1000, evQtyBefore: 100, evQtyAfter: 180, evTradeQty: 30 });
    expect(v).toEqual({ kind: "a3", j: 1 });
  });

  it("단건 후보 2개면 단건 아님 → 구간 (before, after] — before 제외 · after 포함", () => {
    const s = session([
      { a3: { seq: 1, px: 1000, qty: 100, timeUs: 0, cumVolume: 100 } }, // = before → 제외
      { a3: { seq: 2, px: 1000, qty: 50, timeUs: 1000, cumVolume: 150 } },
      { a3: { seq: 3, px: 1000, qty: 30, timeUs: 2000, cumVolume: 180 } }, // = after
      { a3: { seq: 3, px: 1000, qty: 30, timeUs: 2000, cumVolume: 180 } }, // 같은 전문 중복 수신 → 단건 후보 둘
      { a3: { seq: 4, px: 1000, qty: 10, timeUs: 3000, cumVolume: 190 } }, // > after → 제외
    ]);
    const v = s.locate({ gwMs: gw(5), evKind: 2, evPrice: 1000, evQtyBefore: 100, evQtyAfter: 180, evTradeQty: 30 });
    expect(v).toEqual({ kind: "range", firstJ: 1, lastJ: 3, n: 3, qty: 110 });
  });

  it("단건이 없고 after > before 면 구간(주기매도) · 구간에 A3 가 없으면 근거 없음", () => {
    const s = session([
      { a3: { seq: 1, px: 1000, qty: 20, timeUs: 0, cumVolume: 70 } },
      { a3: { seq: 2, px: 1010, qty: 30, timeUs: 1000, cumVolume: 100 } },
    ]);
    // 주기매도: trade_qty = after − before(70) — 단건 수량과 다르다
    const v = s.locate({ gwMs: gw(5), evKind: 2, evPrice: 1010, evQtyBefore: 30, evQtyAfter: 100, evTradeQty: 70 });
    expect(v).toEqual({ kind: "range", firstJ: 0, lastJ: 1, n: 2, qty: 50 });
    const empty = s.locate({ gwMs: gw(5), evKind: 2, evPrice: 1010, evQtyBefore: 100, evQtyAfter: 120, evTradeQty: 20 });
    expect(empty).toEqual({ kind: "none" });
  });

  it("before = after = 0 → 근거 없음 · after < before → 근거 없음", () => {
    const s = session([{ a3: { seq: 1, px: 1000, qty: 20, timeUs: 0, cumVolume: 70 } }]);
    expect(s.locate({ gwMs: gw(5), evKind: 2, evPrice: 1000, evQtyBefore: 0, evQtyAfter: 0, evTradeQty: 0 })).toEqual({
      kind: "none",
    });
    expect(s.locate({ gwMs: gw(5), evKind: 2, evPrice: 1000, evQtyBefore: 90, evQtyAfter: 60, evTradeQty: 20 })).toEqual({
      kind: "none",
    });
  });

  it("ev_kind 0 · 3 · 그 밖은 근거 없음 — 호가 · 체결이 맞아도", () => {
    const s = session([
      { b6: { seq: 1, recvUs: 0, bids: [[1000, 500]] } },
      { a3: { seq: 2, px: 1000, qty: 30, timeUs: 0, cumVolume: 180 } },
    ]);
    const base = { gwMs: gw(0), evPrice: 1000, evQtyBefore: 100, evQtyAfter: 180, evTradeQty: 30 };
    expect(s.locate({ ...base, evKind: 2 })).toEqual({ kind: "a3", j: 0 });
    for (const k of [0, 3, 4, -1]) expect(s.locate({ ...base, evKind: k })).toEqual({ kind: "none" });
    expect(s.locate({ ...base, evKind: 1, evQtyAfter: 500 })).toEqual({ kind: "b6", rec: 0 });
    expect(s.locate({ ...base, evKind: 0, evQtyAfter: 500 })).toEqual({ kind: "none" });
  });

  it("cumIndexOf · anchorOf — 같은 cum 의 마지막 j · cum 0 이하 · 없는 cum 이면 −1", () => {
    const s = session([
      { a3: { seq: 1, px: 1000, qty: 10, timeUs: 0, cumVolume: 0 } },
      { a3: { seq: 2, px: 1000, qty: 10, timeUs: 1000, cumVolume: 500 } },
      { b6: { seq: 3, recvUs: 1500, bids: [[1000, 1]] } },
      { a3: { seq: 2, px: 1000, qty: 10, timeUs: 1000, cumVolume: 500 } }, // 같은 cum 중복 → 마지막
      { a3: { seq: 4, px: 1000, qty: 10, timeUs: 2000, cumVolume: 510 } },
    ]);
    expect(s.cumIdx.has(0)).toBe(false);
    expect(s.cumIdx.get(500)).toEqual([1, 2]);
    expect(anchorOf(s.cumIdx, 500)).toBe(2);
    expect(anchorOf(s.cumIdx, 510)).toBe(3);
    expect(anchorOf(s.cumIdx, 0)).toBe(-1);
    expect(anchorOf(s.cumIdx, -5)).toBe(-1);
    expect(anchorOf(s.cumIdx, 505)).toBe(-1);
  });
});

describe("중복 A3 거르기 skip(WR-03 — 같은 보드 · seq 재수신)", () => {
  it("matchOwnFills — 중복은 둘째 후보가 아니다(「추정」 아님) · 원본이 바닥나도 중복으로 넘어가지 않는다", () => {
    const { index, a3 } = cols([
      { seq: 1, px: 1000, qty: 100, timeUs: 0 },
      { seq: 1, px: 1000, qty: 100, timeUs: 0, recvUs: 50_000 }, // 같은 전문 재수신(rec 1)
    ]);
    const one = [{ gwMs: gw(5), px: 1000, qty: 10 }];
    expect(matchOwnFills(index, a3, one)[0]).toMatchObject({ a3j: 0, candidates: 2, est: true });
    const skip = skipOf(index, [1]);
    expect(matchOwnFills(index, a3, one, skip)[0]).toMatchObject({ a3j: 0, candidates: 1, est: false, dtMs: 5 });
    const two = [
      { gwMs: gw(5), px: 1000, qty: 100 },
      { gwMs: gw(6), px: 1000, qty: 100 },
    ];
    expect(matchOwnFills(index, a3, two).map((m) => m.a3j)).toEqual([0, 1]);
    expect(matchOwnFills(index, a3, two, skip).map((m) => m.a3j)).toEqual([0, -1]);
  });

  it("체결 근거 — 중복을 빼면 단건(hits 1) · 구간 n · qty 도 중복 없이", () => {
    const recs: SynthRec[] = [
      { a3: { seq: 1, px: 1000, qty: 100, timeUs: 0, cumVolume: 100 } },
      { a3: { seq: 2, px: 1000, qty: 50, timeUs: 1000, cumVolume: 150 } },
      { a3: { seq: 3, px: 1000, qty: 30, timeUs: 2000, cumVolume: 180 } },
      { a3: { seq: 3, px: 1000, qty: 30, timeUs: 2000, cumVolume: 180 } }, // 중복(rec 3)
      { a3: { seq: 4, px: 1000, qty: 10, timeUs: 3000, cumVolume: 190 } },
    ];
    const ev = { gwMs: gw(5), evKind: 2, evPrice: 1000, evQtyBefore: 100, evQtyAfter: 180, evTradeQty: 30 };
    expect(session(recs).locate(ev)).toEqual({ kind: "range", firstJ: 1, lastJ: 3, n: 3, qty: 110 });
    const s = session(recs, [3]);
    expect(s.locate(ev)).toEqual({ kind: "a3", j: 2 });
    expect(s.locate({ ...ev, evQtyAfter: 190, evTradeQty: 999 })).toEqual({ kind: "range", firstJ: 1, lastJ: 4, n: 3, qty: 90 });
  });

  it("cumIndexOf · anchorOf — 중복은 색인에 없다 · 앵커는 원본 j", () => {
    const recs: SynthRec[] = [
      { a3: { seq: 2, px: 1000, qty: 10, timeUs: 1000, cumVolume: 500 } },
      { a3: { seq: 2, px: 1000, qty: 10, timeUs: 1000, cumVolume: 500 } }, // 중복(rec 1)
    ];
    expect(anchorOf(session(recs).cumIdx, 500)).toBe(1);
    const s = session(recs, [1]);
    expect(s.cumIdx.get(500)).toEqual([0]);
    expect(anchorOf(s.cumIdx, 500)).toBe(0);
  });
});
