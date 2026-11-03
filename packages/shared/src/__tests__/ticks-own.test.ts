/**
 * Phase 38 (D-15 · SC-2) `matchOwnFills` 합성 경계 — 창 [−200, +1500]ms · 남은 수량 차감 · 「추정」 20ms · 동률 = 작은 j ·
 * 가격 불일치 · tNs 없음(수신 시각) · 입력 순서 처리. 정의는 own-fills.ts 머리 주석 · RESEARCH Pattern 1 (a).
 *
 * 합성 A3 는 A3_LAYOUT 필드 이름으로 채운다(매직 오프셋 없음 — webapp tick-synth `a3Msg` 와 같은 꼴).
 * trade_time 은 수신 시각이 속한 KST 날짜의 HHMMSSuuuuuu 로 풀린다(parseTime12Ns) — 기준 13:00:00 KST.
 */
import { describe, expect, it } from "vitest";
import { concatBytes, encodeRecord } from "../ticks/framing";
import { A3_LAYOUT, type Layout } from "../ticks/layouts";
import { a3TimeMs, matchOwnFills, OWN_MATCH_DT_MAX_MS, OWN_MATCH_DT_MIN_MS, OWN_MATCH_EST_MS } from "../ticks/own-fills";
import { a3ColumnsOf, buildTickIndex, type A3Columns, type TickIndex } from "../ticks/record-index";
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

function setStr(b: Uint8Array, name: string, v: string): void {
  const f = field(A3_LAYOUT, name);
  put(b, f.offset, v.padEnd(f.length, " ").slice(0, f.length));
}

function setNum(b: Uint8Array, name: string, v: number): void {
  const f = field(A3_LAYOUT, name);
  put(b, f.offset, String(Math.trunc(Math.abs(v))).padStart(f.length, "0"));
}

function setPrice(b: Uint8Array, name: string, v: number): void {
  const f = field(A3_LAYOUT, name);
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
