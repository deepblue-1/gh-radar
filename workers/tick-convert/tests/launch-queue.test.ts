/**
 * quick 261103-pei — gridLaunchOf(발사 대기열 값 · 실패 격리). 실제 G4 픽스처(10/30 184230)로 정상 값 = shared launchQueueOf,
 * 계산 throw · 이상값 → 그 키 행 없음 + 에러 로그(throw 안 함) · matched false → info 한 줄.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { launchQueueOf, type LaunchQueueOut } from "@gh-radar/shared";
import { logger } from "../src/logger";
import { gridLaunchOf } from "../src/launch-queue";
import type { LaunchInputRow } from "../src/meta";

const FIXTURES = path.resolve(__dirname, "../../../packages/shared/src/__fixtures__/ticks");
function raw(name: string): Uint8Array {
  const b = zlib.zstdDecompressSync(readFileSync(path.join(FIXTURES, name)));
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

const I = "KR7184230001";
const q = (gateway: string, wire: number, price: number, qty: number, profile = "Q16"): LaunchInputRow => ({
  trade_date: "20261030",
  gateway,
  profile,
  fire_exchange: "KRX",
  fire_base: "16:00:00",
  market: "Q",
  wire,
  side: "buy",
  isin: I,
  price,
  qty,
  fills: [],
});
// KB 6조각 전부 + 교보 wire 0 — 일부만 넣으면 교보가 빠진 KB 조각 자리를 잡는다(부분열 짝짓기)
const PIECES = [
  q("KB120", 0, 2575, 16666),
  q("KB120", 1, 2575, 7766),
  q("KB120", 2, 2575, 16666),
  q("KB120", 3, 2575, 7766),
  q("KB120", 4, 2575, 16668),
  q("KB120", 5, 2575, 7768),
  q("KYOBO119", 0, 2575, 16666),
];
const CTX = { date: "20261030", isin: I, mode: "t", objectPath: "grid/20261030/KRX/KR7184230001.nightly.ticks.zst" };

afterEach(() => vi.restoreAllMocks());

describe("gridLaunchOf", () => {
  it("정상 — 행 = shared launchQueueOf 값 + 7키 + object_path(ctx) · KB wire 0 #9 · 교보 #48", () => {
    const buf = raw("launch1030-krx-g4.ticks.zst");
    const out = gridLaunchOf(buf, "KRX", "20261030", PIECES, CTX);
    expect(out.ok).toBe(true);
    expect(out.unmatched).toBe(0);
    const want = launchQueueOf(buf, "KRX", "20261030", PIECES);
    expect(out.rows).toEqual(
      want.map((w) => ({
        trade_date: "20261030",
        gateway: w.piece.gateway,
        profile: "Q16",
        fire_exchange: "KRX",
        fire_base: "16:00:00",
        market: "Q",
        wire: w.piece.wire,
        object_path: CTX.objectPath,
        ...w.value,
      })),
    );
    expect(out.rows.map((r) => r.rank)).toEqual([9, 13, 17, 20, 25, 30, 48]);
  });

  it("object_path null(너무 큰 격자) 도 그대로 싣는다 · 대상 밖 profile(value null)은 행 없음", () => {
    const out = gridLaunchOf(raw("launch1030-krx-g4.ticks.zst"), "KRX", "20261030", [...PIECES, q("KB120", 7, 2575, 1, "X")], {
      ...CTX,
      objectPath: null,
    });
    expect(out.rows).toHaveLength(PIECES.length);
    expect(out.rows.every((r) => r.object_path === null)).toBe(true);
  });

  it("matched false 가 있으면 info 한 줄(수) · 행은 쓴다(웹 「—」)", () => {
    const info = vi.spyOn(logger, "info");
    const out = gridLaunchOf(raw("launch1030-krx-g4.ticks.zst"), "KRX", "20261030", [q("KB120", 0, 2575, 12345)], CTX);
    expect(out).toMatchObject({ ok: true, unmatched: 1 });
    expect(out.rows[0]).toMatchObject({ matched: false, rank: null });
    expect(info.mock.calls.some((c) => (c[0] as { unmatched?: number }).unmatched === 1)).toBe(true);
  });

  it("계산 throw → 행 없음 · ok false · logger.error(date · ex · isin · mode · err) · throw 안 함", () => {
    const err = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const boom = (): LaunchQueueOut[] => {
      throw new Error("boom");
    };
    const out = gridLaunchOf(new Uint8Array(0), "KRX", "20261030", PIECES, CTX, boom);
    expect(out).toMatchObject({ rows: [], ok: false });
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0]![0]).toMatchObject({ date: "20261030", ex: "KRX", isin: I, mode: "t" });
  });

  it("이상값(NaN · 소수) → 그 키 행 없음 · ok false · 에러 로그", () => {
    const err = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const bad = (): LaunchQueueOut[] => [
      {
        piece: PIECES[0]!,
        value: {
          kind: "queue",
          matched: true,
          rank: 1,
          ahead_n: null,
          ahead_qty: Number.NaN,
          ahead_amt: 0.5,
          end_state: null,
          end_n: null,
          end_qty: null,
          end_amt: null,
          fill_qty: null,
          fill_px_min: null,
          fill_px_max: null,
          order_est: false,
        },
      },
    ];
    const out = gridLaunchOf(new Uint8Array(0), "KRX", "20261030", PIECES, CTX, bad);
    expect(out).toMatchObject({ rows: [], ok: false });
    expect(err.mock.calls[0]![0]).toMatchObject({ bad: "ahead_qty NaN" });
  });
});
