import fs from "node:fs";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { describe, expect, it } from "vitest";
import { concatBytes, encodeRecord, iterRecords, splitZstdFrames } from "@gh-radar/shared";

import {
  getMarketTicksText,
  MARKET_LEGEND,
  MARKET_MAX_RECORDS,
  type MarketDeps,
  type MarketMemo,
} from "../diagnosis/diagnosis-market";

/**
 * Phase 39 (39-04) — 진단 전문가 시세 도구 엔진. 픽스처 `cut1300-krx.ticks.zst`(에코앤드림 KR7101360006 10/16 13:00~ KRX 컷)를
 * 격자로 내주는 최소 mock 으로 원본 한 줄 포맷 · 창 · 잘림 · 틱 보기 링크를 고정한다.
 */

const FIX_DIR = fileURLToPath(new URL("../../../../../packages/shared/src/__fixtures__/ticks/", import.meta.url));
const fixture = (name: string): Uint8Array => new Uint8Array(fs.readFileSync(`${FIX_DIR}${name}`));
const KRX_FIX = fixture("cut1300-krx.ticks.zst");
const NXT_FIX = fixture("cut1300-nxt.ticks.zst");

const ISIN = "KR7101360006";
const USER = "00000000-0000-4000-8000-000000003904";
/** 2026-11-06 12:00 KST — 10/16 은 지난 날짜. */
const NOW = () => new Date("2026-11-06T03:00:00Z");

const GOLDEN_B6 =
  "13:00:00.013412 B6 s40 A 10210x22 10220x485 10230x136 10240x295 10250x1056 | B 10200x1095 10190x94 10180x153 10170x12 10160x140 T4120/2210 E0x0 #70638";

type Rec = {
  rpc: { fn: string; params: Record<string, unknown> }[];
  downloads: { bucket: string; path: string }[];
};

function gridOpen(over: Record<string, unknown> = {}) {
  return {
    access: true,
    date: "20261016",
    exchange: "KRX",
    isin: ISIN,
    grid: {
      object_path: "g/x",
      fmt: "pcapns-rec+zstd/1",
      bytes: 1,
      records: 1,
      a3_count: 1,
      mode: "nightly",
      sources: ["accum"],
      created_at: "2026-10-16T16:31:00+00:00",
      first_recv_ms: null,
      last_recv_ms: null,
    },
    request: null,
    accum: null,
    stock: null,
    eta_s: 300,
    ...over,
  };
}

function makeSupabase(opts: { open?: unknown; grid?: Uint8Array; rpc?: Record<string, unknown> }) {
  const rec: Rec = { rpc: [], downloads: [] };
  const client = {
    async rpc(fn: string, params: Record<string, unknown>) {
      rec.rpc.push({ fn, params });
      if (fn === "tick_open_for_user") return { data: opts.open ?? gridOpen(), error: null };
      const v = opts.rpc?.[fn];
      if (v === undefined) return { data: null, error: { message: `unexpected rpc ${fn}` } };
      return { data: v, error: null };
    },
    storage: {
      from(bucket: string) {
        return {
          async download(path: string) {
            rec.downloads.push({ bucket, path });
            return { data: new Blob([opts.grid ?? KRX_FIX]), error: null };
          },
        };
      },
    },
  };
  return { client: client as unknown as MarketDeps["supabase"], rec };
}

const deps = (supabase: MarketDeps["supabase"], over: Partial<MarketDeps> = {}): MarketDeps => ({
  supabase,
  userId: USER,
  dailyCap: 20,
  now: NOW,
  ...over,
});
const memo = (): MarketMemo => new Map();

/** 픽스처 첫 A3 레코드(recvNs · payload 사본). */
function firstA3(): { recvNs: bigint; payload: Uint8Array } {
  const raw = new Uint8Array(zlib.zstdDecompressSync(splitZstdFrames(KRX_FIX)[0]!));
  for (const r of iterRecords(raw)) {
    const p = raw.subarray(r.off, r.off + r.len);
    if (p[0] === 0x41 && p[1] === 0x33 && p.length === 186) return { recvNs: r.recvNs, payload: p.slice() };
  }
  throw new Error("픽스처에 A3 가 없다");
}

/** A3 사본의 trade_time(오프셋 35 · 12자리)을 바꾼다. */
function withTradeTime(payload: Uint8Array, hhmmssuuuuuu: string): Uint8Array {
  const p = payload.slice();
  for (let i = 0; i < 12; i++) p[35 + i] = hhmmssuuuuuu.charCodeAt(i);
  return p;
}

const zst = (records: Uint8Array[]): Uint8Array => new Uint8Array(zlib.zstdCompressSync(concatBytes(records)));
const lines = (text: string) => text.split("\n");

const BASE = { isin: ISIN, exchange: "KRX" as const, date: "2026-10-16" };

describe("getMarketTicksText — 지난 날짜 격자 경로(Task 1)", () => {
  it("픽스처 13:00:00~13:00:05 → 첫 줄 범례 · 다음 두 줄 골든 A3/B6 · source grid", async () => {
    const { client, rec } = makeSupabase({});
    const r = await getMarketTicksText({ ...BASE, from: "13:00:00", to: "13:00:05" }, deps(client), memo());
    const ls = lines(r.text);
    expect(r.source).toBe("grid");
    expect(ls[0]).toBe(MARKET_LEGEND);
    expect(ls[1]).toBe("13:00:00.013412 A3 10210 1 b2 s40 10210/10200 c1198937 #70637");
    expect(ls[2]).toBe(GOLDEN_B6);
    expect(r.records).toBe(ls.length - 2); // 범례 · 링크 줄 제외
    expect(r.truncated).toBe(false);
    expect(rec.downloads).toEqual([{ bucket: "tick-grid", path: "g/x" }]);
  });

  it("final_bs_code 공백(0x20) A3 → 줄에 ` b_ ` (빈 bs 가 사라지지 않음)", async () => {
    const a3 = firstA3();
    const p = a3.payload.slice();
    p[147] = 0x20;
    const { client } = makeSupabase({ grid: zst([encodeRecord(a3.recvNs, p)]) });
    const r = await getMarketTicksText({ ...BASE, from: "13:00:00", to: "13:00:01" }, deps(client), memo());
    expect(r.source).toBe("grid");
    expect(lines(r.text)[1]).toContain(" b_ ");
    expect(lines(r.text)[1]).toBe("13:00:00.013412 A3 10210 1 b_ s40 10210/10200 c1198937 #70637");
  });

  it("from~to 가 60초 초과 → 창을 from+60초로 줄이고 truncated · 「잘렸음:」 문구", async () => {
    const a3 = firstA3();
    const sec = 1_000_000_000n;
    const recs = [
      encodeRecord(a3.recvNs + 10n * sec, withTradeTime(a3.payload, "130010000000")),
      encodeRecord(a3.recvNs + 80n * sec, withTradeTime(a3.payload, "130120000000")),
    ];
    const { client } = makeSupabase({ grid: zst(recs) });
    const r = await getMarketTicksText({ ...BASE, from: "13:00:00", to: "13:01:30" }, deps(client), memo());
    expect(r.truncated).toBe(true);
    expect(r.records).toBe(1);
    expect(r.text).not.toContain("13:01:20.000000");
    expect(r.text).toContain("잘렸음: 요청 13:00:00~13:01:30 중 13:00:10.000~13:00:10.000 까지 1건 — 범위를 좁혀 다시 부르세요");
  });

  it("400건 초과 → 앞에서 400건까지 + 「잘렸음:」(실제 덮은 첫~끝 시각)", async () => {
    const a3 = firstA3();
    const ms = 1_000_000n;
    const recs: Uint8Array[] = [];
    for (let i = 0; i < MARKET_MAX_RECORDS + 20; i++) {
      const us = String(i * 1000).padStart(6, "0"); // i ms
      recs.push(encodeRecord(a3.recvNs + BigInt(i) * ms, withTradeTime(a3.payload, `130001${us}`)));
    }
    const { client } = makeSupabase({ grid: zst(recs) });
    const r = await getMarketTicksText({ ...BASE, from: "13:00:00", to: "13:00:59" }, deps(client), memo());
    expect(r.records).toBe(MARKET_MAX_RECORDS);
    expect(r.truncated).toBe(true);
    const ls = lines(r.text);
    expect(ls.length).toBe(MARKET_MAX_RECORDS + 3); // 범례 + 400 + 잘림 + 링크
    expect(ls[MARKET_MAX_RECORDS]).toMatch(/^13:00:01\.399000 A3 /);
    expect(ls[MARKET_MAX_RECORDS + 1]).toBe(
      "잘렸음: 요청 13:00:00~13:00:59 중 13:00:01.000~13:00:01.399 까지 400건 — 범위를 좁혀 다시 부르세요",
    );
  });

  it("끝 줄 = 틱 보기 링크(KRX 는 ex 생략 · t = 첫 레코드 수신 시각 ms) · NXT 는 d 뒤 &ex=NXT", async () => {
    const krx = await getMarketTicksText(
      { ...BASE, from: "13:00:00", to: "13:00:05" },
      deps(makeSupabase({}).client),
      memo(),
    );
    const lastK = lines(krx.text).at(-1)!;
    expect(lastK.startsWith("틱 보기: /analytics/ticks?isin=KR7101360006&d=20261016&t=")).toBe(true);
    expect(lastK).toBe("틱 보기: /analytics/ticks?isin=KR7101360006&d=20261016&t=13:00:00.013");

    const nxt = await getMarketTicksText(
      { ...BASE, exchange: "NXT", from: "13:00:00", to: "13:00:05" },
      deps(makeSupabase({ open: gridOpen({ exchange: "NXT" }), grid: NXT_FIX }).client),
      memo(),
    );
    expect(nxt.source).toBe("grid");
    expect(lines(nxt.text).at(-1)!.startsWith("틱 보기: /analytics/ticks?isin=KR7101360006&d=20261016&ex=NXT&t=")).toBe(
      true,
    );
  });

  it("rpc 인자 = 정확히 { p_user_id: deps.userId, p_date: YYYYMMDD, p_isin, p_ex }", async () => {
    const { client, rec } = makeSupabase({});
    await getMarketTicksText({ ...BASE, from: "13:00:00", to: "13:00:01" }, deps(client), memo());
    expect(rec.rpc).toEqual([
      { fn: "tick_open_for_user", params: { p_user_id: USER, p_date: "20261016", p_isin: ISIN, p_ex: "KRX" } },
    ]);
  });

  it("격자 형식이 다르면 자료 없음(내려받기 0회) · from > to 면 자료 없음(RPC 0회)", async () => {
    const a = makeSupabase({ open: gridOpen({ grid: { ...gridOpen().grid, fmt: "parquet/1" } }) });
    const r1 = await getMarketTicksText({ ...BASE, from: "13:00:00", to: "13:00:01" }, deps(a.client), memo());
    expect(r1).toMatchObject({ source: "none", text: "자료 없음: 격자 형식 미지원(parquet/1)" });
    expect(a.rec.downloads).toEqual([]);

    const b = makeSupabase({});
    const r2 = await getMarketTicksText({ ...BASE, from: "13:00:05", to: "13:00:00" }, deps(b.client), memo());
    expect(r2.text).toBe("자료 없음: 시각 범위가 잘못됨(from ≤ to)");
    expect(b.rec.rpc).toEqual([]);
  });
});
