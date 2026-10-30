/**
 * quick-261030-kpg — 상따 change_mask 비트 표 · 짝 수량 규칙(gh-trade Phase 44 · D-10).
 *
 * 못박는 것:
 *   ① shared `LC_CHANGE_MASK_FIELDS` 50행 = 인계 노트 ② 리터럴(append-only 잠금) · key/wire 유일 · wire = camel→snake
 *   ② (gh-trade 저장소가 있으면) `LimitChaserChangeMask.h` 의 비트 상수 50줄과 비트 · 와이어 이름이 같다
 *   ③ `lcChangeMaskOf` — 자기 비트 · 짝 16규칙 · 추적 OFF 조건부 · 조합 · 중복 · 빈 배열 · 모르는 이름
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LC_CHANGE_MASK_FIELDS, isLcChangeMaskField } from "@gh-radar/shared";
import { LC_CHANGE_MASK_PAIR_RULES, lcChangeMaskOf } from "../lc-change-mask.js";

/** 마스크 → 세워진 비트 번호(오름차순). */
function bitsOf(mask: bigint): number[] {
  const out: number[] = [];
  for (let i = 0; i < 64; i++) if ((mask >> BigInt(i)) & 1n) out.push(i);
  return out;
}

const camelToSnake = (s: string): string => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** 인계 노트 ② 사본 — 바꾸지 말 것(append-only). 새 칸은 50 부터 뒤에 붙인다. */
const NOTE_TABLE: readonly (readonly [number, string])[] = [
  [0, "buy_enabled"],
  [1, "buy_order_price"],
  [2, "buy_watch_price"],
  [3, "pre_buy_enabled"],
  [4, "buy_order_amount"],
  [5, "buy_order_qty"],
  [6, "buy_watch_amount"],
  [7, "buy_watch_qty"],
  [8, "buy_trade_qty_enabled"],
  [9, "buy_min_trade_amount"],
  [10, "buy_min_trade_qty"],
  [11, "sweep_enabled"],
  [12, "sweep_min_tick_count"],
  [13, "sweep_watch_price"],
  [14, "extra_buy_enabled"],
  [15, "extra_buy_order_amount"],
  [16, "extra_buy_order_qty"],
  [17, "extra_buy_min_amount"],
  [18, "extra_buy_min_qty"],
  [19, "extra_buy_max_amount"],
  [20, "extra_buy_max_qty"],
  [21, "extra_buy_burst_release"],
  [22, "extra_buy_auto"],
  [23, "post_buy_enabled"],
  [24, "post_buy_order_amount"],
  [25, "post_buy_order_qty"],
  [26, "post_buy_rebound_pct"],
  [27, "post_buy_floor_amount"],
  [28, "post_buy_floor_qty"],
  [29, "post_buy_auto"],
  [30, "sell_enabled"],
  [31, "sell_order_price"],
  [32, "sell_watch_price"],
  [33, "sell_watch_amount"],
  [34, "sell_watch_qty"],
  [35, "sell_order_ratio"],
  [36, "sell_qty_track_enabled"],
  [37, "sell_qty_track_ratio"],
  [38, "sell_trade_qty_enabled"],
  [39, "sell_min_trade_amount"],
  [40, "sell_min_trade_qty"],
  [41, "cancel_qty_enabled"],
  [42, "cancel_watch_amount"],
  [43, "cancel_watch_qty"],
  [44, "cancel_trade_enabled"],
  [45, "cancel_qty_track_enabled"],
  [46, "auto_sell_enabled"],
  [47, "auto_sell_start_cond"],
  [48, "auto_sell_ratio_pct"],
  [49, "auto_sell_method"],
];

describe("LC_CHANGE_MASK_FIELDS 비트 표 (인계 노트 ②)", () => {
  it("50행 · key 유일 · wire 유일 · wire = key 의 camel→snake", () => {
    expect(LC_CHANGE_MASK_FIELDS).toHaveLength(50);
    const keys = LC_CHANGE_MASK_FIELDS.map((f) => f.key);
    const wires = LC_CHANGE_MASK_FIELDS.map((f) => f.wire);
    expect(new Set(keys).size).toBe(50);
    expect(new Set(wires).size).toBe(50);
    for (const f of LC_CHANGE_MASK_FIELDS) expect(f.wire, f.key).toBe(camelToSnake(f.key));
  });

  it("[인덱스, wire] 50쌍 = 노트 ② 리터럴(append-only)", () => {
    expect(LC_CHANGE_MASK_FIELDS.map((f, i) => [i, f.wire])).toEqual(NOTE_TABLE.map(([b, w]) => [b, w]));
  });

  it("isLcChangeMaskField — 표 안 true · postBuyReentry(식별·고정·봉인) · 임의 이름 false", () => {
    expect(isLcChangeMaskField("buyEnabled")).toBe(true);
    expect(isLcChangeMaskField("autoSellMethod")).toBe(true);
    expect(isLcChangeMaskField("postBuyReentry")).toBe(false);
    expect(isLcChangeMaskField("isin")).toBe(false);
    expect(isLcChangeMaskField("zzz")).toBe(false);
  });
});

const ROOT = new URL("../../../../", import.meta.url);
const GH_TRADE_DIR = process.env.GH_TRADE_DIR ?? fileURLToPath(new URL("../gh-trade/", ROOT));
const MASK_HEADER = `${GH_TRADE_DIR.replace(/\/$/, "")}/server/src/trade/strategy/LimitChaserChangeMask.h`;
const HAS_GH_TRADE = existsSync(MASK_HEADER);

describe.skipIf(!HAS_GH_TRADE)("gh-trade LimitChaserChangeMask.h 대조 (파일이 있을 때만)", () => {
  it("비트 상수 50줄의 [비트, 와이어 이름] = LC_CHANGE_MASK_FIELDS · 비트 집합 = 0..49", () => {
    const src = readFileSync(MASK_HEADER, "utf8");
    const re = /^inline constexpr uint64_t kMask\w+ = 1ULL << (\d+);\s*\/\/ (\w+)\s*$/gm;
    const rows = [...src.matchAll(re)].map((m) => [Number(m[1]), m[2]!] as const);
    expect(rows).toHaveLength(50);
    expect(rows.map(([b]) => b).sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    for (const [bit, wire] of rows) expect(LC_CHANGE_MASK_FIELDS[bit]!.wire, `bit ${bit}`).toBe(wire);
  });
});

describe("lcChangeMaskOf — 자기 비트 · 짝 수량 규칙(gh-trade D-10)", () => {
  const OFF = { sellQtyTrackEnabled: false, cancelQtyTrackEnabled: false } as const;
  const ON = { sellQtyTrackEnabled: true, cancelQtyTrackEnabled: true } as const;
  const bitsFor = (changed: string[], cfg: { sellQtyTrackEnabled: boolean; cancelQtyTrackEnabled: boolean } = ON) =>
    bitsOf(lcChangeMaskOf(changed, cfg).mask);

  it.each([
    ["buyOrderAmount", [4, 5]],
    ["buyWatchAmount", [6, 7]],
    ["buyMinTradeAmount", [9, 10]],
    ["extraBuyOrderAmount", [15, 16]],
    ["extraBuyMinAmount", [17, 18]],
    ["extraBuyMaxAmount", [19, 20]],
    ["postBuyOrderAmount", [24, 25]],
    ["postBuyFloorAmount", [27, 28]],
    ["sellWatchAmount", [33, 34]],
    ["sellMinTradeAmount", [39, 40]],
    ["cancelWatchAmount", [42, 43]],
    ["buyOrderPrice", [1, 5, 16, 25]],
    ["buyWatchPrice", [2, 7, 10, 18, 20, 28]],
    ["sellWatchPrice", [32, 34, 40, 43]],
  ] as const)("%s → %j", (name, bits) => {
    expect(bitsFor([name])).toEqual(bits);
    // 금액 · 가격 규칙은 추적 값과 무관하다.
    expect(bitsFor([name], OFF)).toEqual(bits);
  });

  it("sellQtyTrackEnabled — cfg false(OFF 로 바뀜) → {33,34,36} · cfg true → {36}", () => {
    expect(bitsFor(["sellQtyTrackEnabled"], OFF)).toEqual([33, 34, 36]);
    expect(bitsFor(["sellQtyTrackEnabled"], ON)).toEqual([36]);
  });

  it("cancelQtyTrackEnabled — cfg false(OFF) → {42,43,45} · cfg true → {45}", () => {
    expect(bitsFor(["cancelQtyTrackEnabled"], OFF)).toEqual([42, 43, 45]);
    expect(bitsFor(["cancelQtyTrackEnabled"], ON)).toEqual([45]);
  });

  it("체크 · 짝 없는 칸은 자기 비트만 — preBuyEnabled {3} · sellOrderRatio {35} · autoSellMethod = 1n << 49n 정확", () => {
    expect(bitsFor(["preBuyEnabled"])).toEqual([3]);
    expect(bitsFor(["sellOrderRatio"])).toEqual([35]);
    expect(lcChangeMaskOf(["autoSellMethod"], ON).mask).toBe(562949953421312n);
  });

  it("짝 규칙이 없는 칸은 50칸 중 34칸 — 그 칸들은 자기 비트 하나뿐이다", () => {
    const ruled = new Set(LC_CHANGE_MASK_PAIR_RULES.map((r) => r.from));
    expect(ruled.size).toBe(16);
    for (const [i, f] of LC_CHANGE_MASK_FIELDS.entries()) {
      if (ruled.has(f.key)) continue;
      expect(bitsFor([f.key], OFF), f.key).toEqual([i]);
    }
  });

  it("조합 [buyOrderAmount, buyOrderPrice] → {1,4,5,16,25} · 중복 이름 = 한 번", () => {
    expect(bitsFor(["buyOrderAmount", "buyOrderPrice"])).toEqual([1, 4, 5, 16, 25]);
    expect(lcChangeMaskOf(["preBuyEnabled", "preBuyEnabled"], ON).mask).toBe(1n << 3n);
  });

  it("빈 배열 → mask 0n · unknown []", () => {
    expect(lcChangeMaskOf([], ON)).toEqual({ mask: 0n, unknown: [] });
  });

  it("모르는 이름 → unknown(중복 없이 · 처음 본 순서) — postBuyReentry 는 비트 표 밖", () => {
    const r = lcChangeMaskOf(["buyOrderAmount", "postBuyReentry", "zzz", "zzz"], ON);
    expect(r.unknown).toEqual(["postBuyReentry", "zzz"]);
    expect(bitsOf(r.mask)).toEqual([4, 5]);
  });

  it("규칙 표 — from · adds 가 전부 비트 표 안 · from 유일 · whenOff 는 추적 체크 2행뿐", () => {
    for (const r of LC_CHANGE_MASK_PAIR_RULES) {
      expect(isLcChangeMaskField(r.from), r.control).toBe(true);
      for (const a of r.adds) expect(isLcChangeMaskField(a), `${r.control} → ${a}`).toBe(true);
    }
    expect(LC_CHANGE_MASK_PAIR_RULES.filter((r) => r.whenOff === true).map((r) => r.from)).toEqual([
      "sellQtyTrackEnabled",
      "cancelQtyTrackEnabled",
    ]);
  });
});
