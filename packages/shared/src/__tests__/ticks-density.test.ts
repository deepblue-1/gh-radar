/**
 * Phase 37 (D-00 ① 슬라이더) 5분 거래대금 밀도 · VI 구간.
 * 컷 13시 픽스처 Σ 단언 + 합성 A3 경계 · 합성 R8(레이아웃 오프셋대로 ASCII 고정폭).
 */
import { describe, expect, it } from "vitest";
import { concatBytes, encodeRecord } from "../ticks/framing";
import { DENSITY_BUCKETS, densityOf, viSpansOf } from "../ticks/density";
import { a3ColumnsOf, buildTickIndex } from "../ticks/record-index";
import { parseTickTime } from "../ticks/tick-time";
import { readTicksZst } from "./helpers/tick-digest";

function put(b: Uint8Array, off: number, s: string): void {
  for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
}

function price(v: number): string {
  return `00${String(v).padStart(9, "0")}`;
}

/** A3 186B — 보드 · seq · 체결가 · 수량 · 매수 · 체결 시각은 없음(공백 → null). */
function a3Msg(seq: number, board: string, px: number, qty: number, bs = "2"): Uint8Array {
  const b = new Uint8Array(186).fill(48);
  put(b, 0, "A3");
  put(b, 2, "01S");
  put(b, 5, String(seq).padStart(8, "0"));
  put(b, 13, board);
  put(b, 17, "KR7101360006");
  put(b, 59, price(px));
  put(b, 70, String(qty).padStart(10, "0"));
  put(b, 147, bs);
  return b;
}

/** R8 116B — vi_status(54) · vi_type(55) · trigger_price(78). */
function r8Msg(seq: number, status: "1" | "2", type: string, trigger: number): Uint8Array {
  const b = new Uint8Array(116).fill(48);
  put(b, 0, "R8");
  put(b, 2, "01S");
  put(b, 5, String(seq).padStart(8, "0"));
  put(b, 13, "G1");
  put(b, 15, "KR7101360006");
  put(b, 45, "         ");
  put(b, 54, status);
  put(b, 55, type);
  put(b, 78, price(trigger));
  return b;
}

const YMD = "20261016";
const at = (hms: string): bigint => parseTickTime(hms, YMD)!;

describe("densityOf — 08:00~20:00 144칸", () => {
  it("DENSITY_BUCKETS = 144", () => {
    expect(DENSITY_BUCKETS).toBe(144);
  });

  it("합성 경계 — 08:00 칸 0 · 07:59:59.999 · 20:00 제외 · 19:59:59.999 칸 143 · 단일가 bs 포함", () => {
    const rows: [string, Uint8Array][] = [
      ["07:59:59.999", a3Msg(1, "G1", 1_000, 1)],
      ["08:00:00.000", a3Msg(2, "G1", 10_000, 3)],
      ["08:04:59.999", a3Msg(3, "G2", 10_000, 2)],
      ["08:05:00.000", a3Msg(4, "G1", 10_100, 5, "0")],
      ["13:02:00.000", a3Msg(5, "G4", 9_990, 7)],
      ["19:59:59.999", a3Msg(6, "G1", 10_200, 4)],
      ["20:00:00.000", a3Msg(7, "G1", 99_999, 9)],
    ];
    const buf = concatBytes(rows.map(([t, m]) => encodeRecord(at(t), m)));
    const index = buildTickIndex(buf, "krx");
    const d = densityOf(a3ColumnsOf(buf, index), index, YMD);
    expect(d.length).toBe(144);
    expect(d[0]).toBe(10_000 * 3 + 10_000 * 2);
    expect(d[1]).toBe(10_100 * 5);
    expect(d[60]).toBe(9_990 * 7); // 13:00 = (13−8)·12
    expect(d[143]).toBe(10_200 * 4);
    expect(d.reduce((s, v) => s + v, 0)).toBe(30_000 + 20_000 + 50_500 + 69_930 + 40_800);
  });

  it.each([
    ["krx", "cut1300-krx"],
    ["nxt", "cut1300-nxt"],
  ] as const)("컷 13시 %s — Σ칸 = 범위 A3 px×qty 합 · 13시 칸에만 있다", (label, name) => {
    const buf = readTicksZst(`${name}.ticks.zst`);
    const index = buildTickIndex(buf, label);
    const a3 = a3ColumnsOf(buf, index);
    const d = densityOf(a3, index, YMD);
    let want = 0;
    const lo = at("08:00:00.000");
    const hi = at("20:00:00.000");
    for (let j = 0; j < a3.n; j++) {
      const r = index.recvNs[a3.rec[j]!]!;
      if (r >= lo && r < hi) want += a3.px[j]! * a3.qty[j]!;
    }
    expect(want).toBeGreaterThan(0);
    const sum = d.reduce((s, v) => s + v, 0);
    expect(sum).toBe(want);
    // 13시 컷 — 칸 60..71 밖은 0
    for (let k = 0; k < 144; k++) if (k < 60 || k > 71) expect(d[k]).toBe(0);
  });
});

describe("viSpansOf — R8 '1' 발동 ~ '2' 해제", () => {
  it("발동 → 해제 · 끝 없는 발동은 endNs null · vi_type · trigger_price 보존", () => {
    const rows: [string, Uint8Array][] = [
      ["09:10:00.000", r8Msg(10, "1", "2", 11_000)],
      ["09:10:00.500", a3Msg(11, "G1", 11_000, 1)],
      ["09:12:00.000", r8Msg(12, "2", "2", 11_000)],
      ["09:13:00.000", r8Msg(13, "2", "1", 0)], // 짝 없는 해제 — 무시
      ["14:00:00.000", r8Msg(14, "1", "1", 12_100)],
    ];
    const buf = concatBytes(rows.map(([t, m]) => encodeRecord(at(t), m)));
    const index = buildTickIndex(buf, "krx");
    expect(viSpansOf(buf, index)).toEqual([
      { startNs: at("09:10:00.000"), endNs: at("09:12:00.000"), startRec: 0, endRec: 2, viType: "2", triggerPx: 11_000 },
      { startNs: at("14:00:00.000"), endNs: null, startRec: 4, endRec: null, viType: "1", triggerPx: 12_100 },
    ]);
  });

  it("R8 이 없으면 빈 배열", () => {
    const buf = readTicksZst("cut1300-krx.ticks.zst");
    expect(viSpansOf(buf, buildTickIndex(buf, "krx"))).toEqual([]);
  });
});
