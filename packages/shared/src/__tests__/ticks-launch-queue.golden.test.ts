/**
 * quick 261103-pei — 발사 대기열 · 체결 런 실측 골든. 기대값은 CONTEXT(10/22 · 10/30 원본 pcap 실측) · 목업 027 값
 * 그대로다 — 손으로 맞추지 않는다. 픽스처 = `bash scripts/tick-oracle/gen-fixtures.sh launch`(oracle.py launchcut).
 *
 * - launch1022-krx-g4 = 10/22 060900 G4 16~20시(그날 G4 세션 전부 — 체결 합 4,405 = filled_qty). CONTEXT 통계
 *   (369 · 14 · 90 · 165 · 6)는 스파이크와 같은 범위(수신 18:00 전)로 잘라 확인한다.
 * - launch1030-krx-g4 = 10/30 184230 G4 16:00~16:59(로컬 원본 한 시간).
 * - launch1030-{krx,nxt}-0900 = 여러 ISIN — 실제 격자는 ISIN 하나라 테스트가 ISIN 별로 바이트를 나눈다.
 * 조각 입력은 scratchpad 실측 JSON(accepted · n1030pieces · a1030pieces · fills1030 · afills) + launch_pieces 읽기
 * 전용 조회(profile · market · fire_base). 계좌 · dma_user_id 는 싣지 않는다.
 */
import { describe, expect, it } from "vitest";
import type { LaunchPieceQueue } from "../launch";
import { REC_HDR, iterRecords } from "../ticks/framing";
import { launchQueueOf, q16LevelOf, type LaunchQueuePieceIn } from "../ticks/launch-queue";
import { parseTickTime } from "../ticks/tick-time";
import { readTicksZst } from "./helpers/tick-digest";

/** 레코드 프레이밍 바이트 → 오프셋 17 ISIN 이 같고(지정 시) 수신 < before 인 레코드만. */
function cutOf(buf: Uint8Array, isin: string, before?: bigint): Uint8Array {
  const want = new TextEncoder().encode(isin);
  const parts: Uint8Array[] = [];
  let size = 0;
  for (const r of iterRecords(buf)) {
    if (before !== undefined && r.recvNs >= before) continue;
    let same = r.len >= 29;
    for (let i = 0; same && i < 12; i++) if (buf[r.off + 17 + i] !== want[i]) same = false;
    if (!same) continue;
    const part = buf.subarray(r.off - REC_HDR, r.off + r.len);
    parts.push(part);
    size += part.length;
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function pz(
  gateway: string,
  profile: string,
  fire_exchange: string,
  fire_base: string,
  market: string,
  wire: number,
  side: "buy" | "sell",
  isin: string,
  price: number,
  qty: number,
  fills: [number, number][] = [],
): LaunchQueuePieceIn {
  return { gateway, profile, fire_exchange, fire_base, market, wire, side, isin, price, qty, fills };
}

function valuesOf(buf: Uint8Array, ex: "KRX" | "NXT", date: string, pieces: LaunchQueuePieceIn[]): Map<string, LaunchPieceQueue> {
  const out = new Map<string, LaunchPieceQueue>();
  for (const r of launchQueueOf(buf, ex, date, pieces)) {
    if (r.value) out.set(`${r.piece.gateway}|${r.piece.wire}|${r.piece.isin}`, r.value);
  }
  return out;
}

function get(m: Map<string, LaunchPieceQueue>, gw: string, wire: number, isin: string): LaunchPieceQueue {
  const v = m.get(`${gw}|${wire}|${isin}`);
  if (!v) throw new Error(`값 없음 ${gw} ${wire} ${isin}`);
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10/22 060900 — 2140 매수 대기열
// ─────────────────────────────────────────────────────────────────────────────

describe("골든 10/22 KRX G4 060900 (2140 매수)", () => {
  const I = "KR7060900008";
  const q = (gw: string, wire: number, qty: number): LaunchQueuePieceIn =>
    pz(gw, "Q16", "KRX", "16:00:00", "Q", wire, "buy", I, 2140, qty);
  const KB = [
    q("KB120", 2, 23333),
    q("KB120", 4, 18691),
    q("KB120", 6, 23333),
    q("KB120", 8, 18691),
    q("KB120", 10, 23334),
    q("KB120", 12, 18691),
    q("KB120", 14, 18693),
  ];
  const KY = [q("KYOBO119", 0, 23333), q("KYOBO119", 2, 23333), q("KYOBO119", 4, 23334)];
  const full = readTicksZst("launch1022-krx-g4.ticks.zst");
  const before18 = cutOf(full, I, parseTickTime("18:00:00", "20261022")!);

  it("순번 — KB #1·#3·#8·#14·#19·#23·#28 · 교보 #98·#99·#101 (KB 먼저만 성립 → 추정 아님)", () => {
    for (const buf of [full, before18]) {
      // 교보를 먼저 넣어도 순서는 성립성이 정한다
      const m = valuesOf(buf, "KRX", "20261022", [...KY, ...KB]);
      expect(KB.map((p) => get(m, "KB120", p.wire, I).rank)).toEqual([1, 3, 8, 14, 19, 23, 28]);
      expect(KY.map((p) => get(m, "KYOBO119", p.wire, I).rank)).toEqual([98, 99, 101]);
      for (const p of [...KB, ...KY]) expect(get(m, p.gateway, p.wire, I).order_est).toBe(false);
    }
  });

  it("2140 레벨 통계(수신 18:00 전 — 스파이크 범위) 추가 369 · 체결 14 · 정확취소 90 · 모호취소 165 · 설명불가 6", () => {
    const r = q16LevelOf(before18, "KRX", "20261022", { isin: I, side: "buy", price: 2140, fire_base: "16:00:00" });
    expect(r.stats).toEqual({ adds: 369, fills: 14, cancelExact: 90, cancelAmbig: 165, cancelNone: 6 });
  });

  it("체결은 FIFO — KB wire 2(#1)가 그날 G4 체결 전부 4,405(= filled_qty)를 받는다", () => {
    const r = q16LevelOf(full, "KRX", "20261022", { isin: I, side: "buy", price: 2140, fire_base: "16:00:00" });
    expect(r.orders[0]!.filled).toBe(4405);
    const total = r.orders.reduce((s, o) => s + o.filled, 0);
    expect(total).toBe(4405);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10/30 184230 — 2575 매수 대기열 · 뒤탐침 1387
// ─────────────────────────────────────────────────────────────────────────────

describe("골든 10/30 KRX G4 184230 (2575 매수 · 16:00~16:59)", () => {
  const I = "KR7184230001";
  const q = (gw: string, wire: number, price: number, qty: number): LaunchQueuePieceIn =>
    pz(gw, "Q16", "KRX", "16:00:00", "Q", wire, "buy", I, price, qty);
  const KB = [
    q("KB120", 0, 2575, 16666),
    q("KB120", 1, 2575, 7766),
    q("KB120", 2, 2575, 16666),
    q("KB120", 3, 2575, 7766),
    q("KB120", 4, 2575, 16668),
    q("KB120", 5, 2575, 7768),
  ];
  const KBP = [q("KB120", 6, 1387, 1), q("KB120", 7, 1387, 1), q("KB120", 8, 1387, 1)];
  const KY = [q("KYOBO119", 0, 2575, 16666), q("KYOBO119", 1, 2575, 16666), q("KYOBO119", 2, 2575, 16668)];
  const KYP = [q("KYOBO119", 3, 1387, 1), q("KYOBO119", 4, 1387, 1), q("KYOBO119", 5, 1387, 1)];
  const buf = readTicksZst("launch1030-krx-g4.ticks.zst");
  const m = valuesOf(buf, "KRX", "20261030", [...KB, ...KBP, ...KY, ...KYP]);

  it("KB 순번 #9·#13·#17·#20·#25·#30 · 교보 #48·#52·#57 (KB 먼저만 성립)", () => {
    expect(KB.map((p) => get(m, "KB120", p.wire, I).rank)).toEqual([9, 13, 17, 20, 25, 30]);
    expect(KY.map((p) => get(m, "KYOBO119", p.wire, I).rank)).toEqual([48, 52, 57]);
    for (const p of [...KB, ...KY]) expect(get(m, p.gateway, p.wire, I).order_est).toBe(false);
  });

  it("접수 때 앞 — KB wire 0~4 = 68,808 · 109,238 · 144,630 · 177,272 · 224,323주(금액 = 주 × 2575) · 교보 547,600 · 640,028", () => {
    const kb = [0, 1, 2, 3, 4].map((w) => get(m, "KB120", w, I));
    expect(kb.map((v) => v.ahead_qty)).toEqual([68808, 109238, 144630, 177272, 224323]);
    for (const v of kb) expect(v.ahead_amt).toBe(v.ahead_qty! * 2575);
    expect(kb[0]!.ahead_amt).toBe(177_180_600);
    const ky = [0, 1].map((w) => get(m, "KYOBO119", w, I));
    expect(ky.map((v) => v.ahead_qty)).toEqual([547600, 640028]);
    for (const v of ky) expect(v.ahead_amt).toBe(v.ahead_qty! * 2575);
  });

  it("마감 때(추정) — KB wire 0 open 4건 30,560 · wire 1 open 5건 47,226 · wire 2 open 6건 54,992 · wire 3 · 4 취소 · 교보 wire 0 · 1 취소", () => {
    const pick = (gw: string, w: number) => {
      const v = get(m, gw, w, I);
      return [v.end_state, v.end_n, v.end_qty, v.end_amt];
    };
    expect(pick("KB120", 0)).toEqual(["open", 4, 30560, 30560 * 2575]);
    expect(pick("KB120", 1)).toEqual(["open", 5, 47226, 47226 * 2575]);
    expect(pick("KB120", 2)).toEqual(["open", 6, 54992, 54992 * 2575]);
    expect(pick("KB120", 3)).toEqual(["cancelled", null, null, null]);
    expect(pick("KB120", 4)).toEqual(["cancelled", null, null, null]);
    expect(pick("KYOBO119", 0)).toEqual(["cancelled", null, null, null]);
    expect(pick("KYOBO119", 1)).toEqual(["cancelled", null, null, null]);
    // 목업 027 첫 줄 값 — 7,869만 = 30,560 × 2575 반올림
    expect(Math.round((30560 * 2575) / 1e4)).toBe(7869);
  });

  it("뒤탐침(1387) — KB wire 6·7·8 → #1·#2·#3 · 교보 3·4·5 → #4·#5·#6 (두 순서 모두 성립 → LAUNCH_ORDER + 추정)", () => {
    expect(KBP.map((p) => get(m, "KB120", p.wire, I).rank)).toEqual([1, 2, 3]);
    expect(KYP.map((p) => get(m, "KYOBO119", p.wire, I).rank)).toEqual([4, 5, 6]);
    for (const p of [...KBP, ...KYP]) expect(get(m, p.gateway, p.wire, I).order_est).toBe(true);
  });

  it("뒤탐침 접수 때 앞 = 직전 B6 의 2575 단(더 좋은 가격) 잔량 + 1387 단 잔량 (design_decisions 6 — 오케스트레이터 결정)", () => {
    const vs = [...KBP, ...KYP].map((p) => get(m, p.gateway, p.wire, I));
    expect(vs.map((v) => v.ahead_qty)).toEqual([420893, 460185, 564268, 833242, 861278, 869472]);
    // 1387 단은 앞선 우리 탐침 1주씩 — 금액은 단마다 잔량 × 그 단 가격
    for (const [i, v] of vs.entries()) expect(v.ahead_amt).toBe((v.ahead_qty! - i) * 2575 + i * 1387);
  });

  it("2575 레벨 통계 265 · 16 · 98 · 51 · 4", () => {
    const r = q16LevelOf(buf, "KRX", "20261030", { isin: I, side: "buy", price: 2575, fire_base: "16:00:00" });
    expect(r.stats).toEqual({ adds: 265, fills: 16, cancelExact: 98, cancelAmbig: 51, cancelNone: 4 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10/30 09:00:30 NXT — N 공격 주문 체결 런
// ─────────────────────────────────────────────────────────────────────────────

const N1030 = [
  pz("KB120", "N", "NXT", "09:00:30", "K", 0, "buy", "KR7005930003", 222500, 22, []),
  pz("KB120", "N", "NXT", "09:00:30", "Q", 0, "sell", "KR7376900007", 17910, 281, [[18000, 281]]),
  pz("KB120", "N", "NXT", "09:00:30", "Q", 1, "buy", "KR7095340006", 160100, 20, [
    [159300, 1],
    [159300, 1],
    [159400, 2],
    [159400, 1],
    [159400, 1],
    [159500, 1],
    [159500, 1],
    [159600, 1],
    [159700, 1],
    [159800, 2],
    [159800, 1],
    [159900, 1],
    [159900, 1],
    [160000, 1],
    [160000, 1],
    [160100, 1],
  ]),
  pz("KB120", "N", "NXT", "09:00:30", "K", 1, "sell", "KR7012450003", 723000, 7, []),
  pz("KB120", "N", "NXT", "09:00:30", "Q", 2, "buy", "KR7425420007", 84500, 59, [
    [84300, 4],
    [84300, 5],
    [84400, 5],
    [84400, 3],
    [84500, 20],
    [84500, 22],
  ]),
  pz("KB120", "N", "NXT", "09:00:30", "K", 4, "buy", "KR7010140002", 15310, 326, []),
];

function perIsin(name: string, ex: "KRX" | "NXT", pieces: LaunchQueuePieceIn[]): Map<string, LaunchPieceQueue> {
  const all = readTicksZst(name);
  const out = new Map<string, LaunchPieceQueue>();
  const isins = [...new Set(pieces.map((p) => p.isin))];
  for (const isin of isins) {
    const m = valuesOf(cutOf(all, isin), ex, "20261030", pieces.filter((p) => p.isin === isin));
    for (const [k, v] of m) out.set(k, v);
  }
  return out;
}

describe("골든 10/30 NXT 09:00:30 (N · 보드 G1)", () => {
  const m = perIsin("launch1030-nxt-0900.ticks.zst", "NXT", N1030);

  it("425420 매수 59 → 1번째 · 앞 0 · 체결 59 @ 84,300~84,500", () => {
    expect(get(m, "KB120", 2, "KR7425420007")).toMatchObject({
      kind: "run",
      matched: true,
      rank: 1,
      ahead_n: 0,
      ahead_qty: 0,
      ahead_amt: 0,
      fill_qty: 59,
      fill_px_min: 84300,
      fill_px_max: 84500,
      end_state: null,
    });
  });

  it("376900 매도 281 → 1번째 · 체결 281 @ 18,000", () => {
    expect(get(m, "KB120", 0, "KR7376900007")).toMatchObject({
      rank: 1,
      fill_qty: 281,
      fill_px_min: 18000,
      fill_px_max: 18000,
    });
  });

  it("095340 매수 20 → 2번째 · 앞 2주 · 318,000원 · 체결 18 @ 159,300~160,100", () => {
    expect(get(m, "KB120", 1, "KR7095340006")).toMatchObject({
      rank: 2,
      ahead_n: 1,
      ahead_qty: 2,
      ahead_amt: 318000,
      fill_qty: 18,
      fill_px_min: 159300,
      fill_px_max: 160100,
    });
  });

  it("미체결 005930 매수 22@222,500 → 앞선 1건 · 4,861주 · 10.82억", () => {
    const v = get(m, "KB120", 0, "KR7005930003");
    expect(v).toMatchObject({ matched: true, rank: null, ahead_n: 1, ahead_qty: 4861, fill_qty: 0, fill_px_min: null });
    expect((v.ahead_amt! / 1e8).toFixed(2)).toBe("10.82");
  });

  it("미체결 012450 매도 7@723,000 → 1건 · 134주 · 0.98억 (seq 7570~7582 한 런 — CONTEXT 정정 · 스파이크 µs 기준은 3건으로 쪼갰다)", () => {
    const v = get(m, "KB120", 1, "KR7012450003");
    expect(v).toMatchObject({ rank: null, ahead_n: 1, ahead_qty: 134, fill_qty: 0 });
    expect((v.ahead_amt! / 1e8).toFixed(2)).toBe("0.98");
  });

  it("미체결 010140 매수 326@15,310 → 1건 · 3,417주", () => {
    expect(get(m, "KB120", 4, "KR7010140002")).toMatchObject({ rank: null, ahead_n: 1, ahead_qty: 3417, fill_qty: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10/30 09:00:27 · 09:00:29 KRX — A 매수 체결 런
// ─────────────────────────────────────────────────────────────────────────────

const A1030 = [
  pz("KB120", "A", "KRX", "09:00:27", "Q", 0, "buy", "KR7376900007", 17840, 281, [
    [17760, 16],
    [17770, 4],
    [17770, 159],
    [17790, 31],
    [17800, 27],
    [17830, 32],
    [17840, 12],
  ]),
  pz("KB120", "A", "KRX", "09:00:27", "K", 0, "buy", "KR7012450003", 698000, 7, [[698000, 7]]),
  pz("KB120", "A", "KRX", "09:00:27", "Q", 1, "buy", "KR7033640004", 23950, 208, [
    [23900, 1],
    [23900, 2],
    [23900, 82],
    [23950, 19],
    [23950, 100],
    [23950, 4],
  ]),
  pz("KB120", "A", "KRX", "09:00:27", "K", 1, "buy", "KR7272210006", 61700, 81, [
    [61700, 69],
    [61700, 12],
  ]),
  pz("KB120", "A", "KRX", "09:00:27", "K", 2, "buy", "KR7010060002", 169800, 25, [
    [169700, 7],
    [169700, 16],
    [169800, 2],
  ]),
  pz("KYOBO119", "A", "KRX", "09:00:27", "Q", 0, "buy", "KR7376900007", 17770, 56, []),
  pz("KYOBO119", "A", "KRX", "09:00:27", "K", 0, "buy", "KR7012450003", 698000, 1, [[698000, 1]]),
  pz("KYOBO119", "A", "KRX", "09:00:27", "K", 1, "buy", "KR7272210006", 61700, 16, [[61700, 16]]),
  pz("KYOBO119", "A", "KRX", "09:00:27", "Q", 1, "buy", "KR7033640004", 23900, 38, []),
  pz("KYOBO119", "A", "KRX", "09:00:27", "K", 2, "buy", "KR7010060002", 169700, 5, []),
  pz("KYOBO119", "A", "KRX", "09:00:29", "K", 0, "buy", "KR7249420001", 13410, 74, [
    [13400, 30],
    [13410, 44],
  ]),
  pz("KYOBO119", "A", "KRX", "09:00:29", "Q", 0, "buy", "KR7222800005", 116400, 8, [
    [116200, 6],
    [116400, 2],
  ]),
  pz("KYOBO119", "A", "KRX", "09:00:29", "Q", 1, "buy", "KR7445680002", 59100, 16, [
    [59000, 1],
    [59100, 8],
    [59100, 1],
    [59100, 6],
  ]),
];

describe("골든 10/30 KRX A 09:00:27 · 09:00:29 (보드 G1)", () => {
  const m = perIsin("launch1030-krx-0900.ticks.zst", "KRX", A1030);

  it("KB 376900 281 · 033640 208 · 272210 81 · 010060 25 · 012450 7 = 각 종목 1번째", () => {
    const kb: [number, string, number][] = [
      [0, "KR7376900007", 281],
      [1, "KR7033640004", 208],
      [1, "KR7272210006", 81],
      [2, "KR7010060002", 25],
      [0, "KR7012450003", 7],
    ];
    for (const [w, isin, q] of kb) {
      expect(get(m, "KB120", w, isin), isin).toMatchObject({ matched: true, rank: 1, fill_qty: q });
    }
  });

  it("교보 249420 74 · 222800 8 · 445680 16 (09:00:29) = 각 1번째", () => {
    const ky: [number, string, number][] = [
      [0, "KR7249420001", 74],
      [0, "KR7222800005", 8],
      [1, "KR7445680002", 16],
    ];
    for (const [w, isin, q] of ky) {
      expect(get(m, "KYOBO119", w, isin), isin).toMatchObject({ matched: true, rank: 1, fill_qty: q });
    }
  });

  it("교보 376900 매수 56@17,770 미체결 → KB(우리)가 먼저 가져감(앞 ≥ 1건 · ≥ 179주)", () => {
    const v = get(m, "KYOBO119", 0, "KR7376900007");
    expect(v.rank).toBeNull();
    expect(v.fill_qty).toBe(0);
    expect(v.ahead_n!).toBeGreaterThanOrEqual(1);
    expect(v.ahead_qty!).toBeGreaterThanOrEqual(16 + 4 + 159);
  });
});
