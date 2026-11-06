import fs from "node:fs";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { concatBytes, decodeAny, encodeRecord, iterRecords, splitZstdFrames } from "@gh-radar/shared";

import type { TickConvertTrigger } from "../../tick-convert-trigger";
import type { TickgwClient, TickgwLiveQuery, TickgwLiveResponse } from "../../tickgw-client";
import { requestTickConvert } from "../../ticks";

// requestTickConvert 를 실제 구현 그대로 감싼 스파이 — 호출 인자를 본다(동작은 실제 RPC mock 경로 그대로).
vi.mock("../../ticks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ticks")>();
  return { ...actual, requestTickConvert: vi.fn(actual.requestTickConvert) };
});

import {
  formatA3Line,
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

function makeSupabase(opts: {
  open?: unknown;
  /** open 을 부를 때마다 차례로(마지막 값 반복). */
  openSeq?: unknown[];
  grid?: Uint8Array;
  rpc?: Record<string, unknown>;
}) {
  const rec: Rec = { rpc: [], downloads: [] };
  let opens = 0;
  const client = {
    async rpc(fn: string, params: Record<string, unknown>) {
      rec.rpc.push({ fn, params });
      if (fn === "tick_open_for_user") {
        const i = opens++;
        const v = opts.openSeq ? opts.openSeq[Math.min(i, opts.openSeq.length - 1)] : (opts.open ?? gridOpen());
        return { data: v, error: null };
      }
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

// ── 오늘 경로(Task 2) ────────────────────────────────────────────────

const DAY_NS = 86_400_000_000_000n;
/** 10/16 → 11/06 = 21일. 픽스처 레코드 수신 시각을 오늘로 옮긴다(trade_time_ns 날짜 = 수신 KST 날짜). */
const SHIFT_NS = 21n * DAY_NS;

/** 픽스처 레코드 전부(수신 시각을 오늘로 옮긴 레코드 프레이밍 바이트 · 원본 순서). */
function todayRecords(fix: Uint8Array): Uint8Array[] {
  const raw = new Uint8Array(zlib.zstdDecompressSync(splitZstdFrames(fix)[0]!));
  const out: Uint8Array[] = [];
  for (const r of iterRecords(raw)) out.push(encodeRecord(r.recvNs + SHIFT_NS, raw.slice(r.off, r.off + r.len)));
  return out;
}

type Script = (q: TickgwLiveQuery, i: number) => TickgwLiveResponse;
function fakeTickgw(script: Script): TickgwClient & { calls: TickgwLiveQuery[] } {
  const calls: TickgwLiveQuery[] = [];
  return {
    calls,
    async live(q) {
      calls.push({ ...q });
      return script(q, calls.length - 1);
    },
  };
}

const live200 = (
  body: Uint8Array,
  h: { epoch?: string; offsetEnd: number; state?: string; more?: boolean },
): TickgwLiveResponse => ({
  status: 200,
  body: Buffer.from(body),
  headers: {
    epoch: h.epoch ?? "e1",
    offsetEnd: String(h.offsetEnd),
    state: h.state ?? "ready",
    complete: "true",
    more: h.more ? "true" : "false",
  },
});

/** 가짜 시계 — sleep 이 시계를 민다. */
function fakeClock(iso: string) {
  let t = Date.parse(iso);
  const sleeps: number[] = [];
  return {
    now: () => new Date(t),
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

/** 2026-11-06(금) 13:30 KST. */
const TODAY_ISO = "2026-11-06T04:30:00Z";
const TODAY = { isin: ISIN, exchange: "KRX" as const, date: "2026-11-06" };
const noSupabase = makeSupabase({}).client;

let fetchSpy: MockInstance;
beforeAll(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});
afterAll(() => {
  fetchSpy.mockRestore();
});

async function runToday(script: Script, win = { from: "13:00:00", to: "13:00:05" }, m: MarketMemo = memo()) {
  const c = fakeClock(TODAY_ISO);
  const tg = fakeTickgw(script);
  const r = await getMarketTicksText({ ...TODAY, ...win }, deps(noSupabase, { tickgw: tg, now: c.now, sleep: c.sleep }), m);
  return { r, tg, c };
}

describe("getMarketTicksText — 오늘 tickgw 경로(Task 2)", () => {
  it("deps.tickgw 없음 → 자료 없음: 당일 시세 경로 꺼짐(TICKS_LIVE_UNAVAILABLE)", async () => {
    const c = fakeClock(TODAY_ISO);
    const r = await getMarketTicksText(
      { ...TODAY, from: "13:00:00", to: "13:00:05" },
      deps(noSupabase, { now: c.now, sleep: c.sleep }),
      memo(),
    );
    expect(r).toMatchObject({ source: "none", text: "자료 없음: 당일 시세 경로 꺼짐(TICKS_LIVE_UNAVAILABLE)" });
  });

  it("주말 · 휴장일 · KST 08:00 전 → tickgw 호출 0회 + 자료 없음: 장 시작 전/휴장", async () => {
    const cases = [
      { iso: "2026-11-07T03:00:00Z", date: "2026-11-07" }, // 토요일
      { iso: "2026-12-25T03:00:00Z", date: "2026-12-25" }, // 성탄절
      { iso: "2026-11-05T22:30:00Z", date: "2026-11-06" }, // 11/06 07:30 KST
    ];
    for (const k of cases) {
      const c = fakeClock(k.iso);
      const tg = fakeTickgw(() => {
        throw new Error("호출되면 안 된다");
      });
      const r = await getMarketTicksText(
        { ...TODAY, date: k.date, from: "07:00:00", to: "07:00:05" },
        deps(noSupabase, { tickgw: tg, now: c.now, sleep: c.sleep }),
        memo(),
      );
      expect(r.text).toBe("자료 없음: 장 시작 전/휴장");
      expect(tg.calls).toEqual([]);
    }
  });

  it("status 0 → UNREACHABLE · blocked → 차단 · queued 20초 넘게 → 대기열", async () => {
    const u = await runToday(() => ({ status: 0, body: null, headers: {}, netCode: "ECONNREFUSED" }));
    expect(u.r.text).toBe("자료 없음: 당일 시세 경로 응답 없음(UNREACHABLE)");

    const b = await runToday(() => live200(new Uint8Array(0), { offsetEnd: 0, state: "blocked" }));
    expect(b.r.text).toBe("자료 없음: 당일 시세 차단");

    const q = await runToday(() => live200(new Uint8Array(0), { offsetEnd: 0, state: "queued" }));
    expect(q.r.text).toBe("자료 없음: 당일 시세 대기열(잠시 뒤 다시)");
    const waited = q.c.sleeps.reduce((a, x) => a + x, 0);
    expect(waited).toBeGreaterThan(20_000);
    expect(waited).toBeLessThanOrEqual(24_000);
  });

  it("401 → logger.error 1회 + 자료 없음: 당일 시세 경로 인증 실패(본문은 로그에 없음)", async () => {
    const { logger } = await import("../../../logger");
    const spy = vi.spyOn(logger, "error");
    try {
      const a = await runToday(() => ({ status: 401, body: Buffer.from("secret-body"), headers: {} }));
      expect(a.r.text).toBe("자료 없음: 당일 시세 경로 인증 실패");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(spy.mock.calls)).not.toContain("secret-body");
    } finally {
      spy.mockRestore();
    }
  });

  it("이어붙인 두 zstd 프레임(200 · more false) → 둘째 프레임 레코드도 창에 나온다", async () => {
    const recs = todayRecords(KRX_FIX);
    const half = Math.floor(recs.length / 2);
    const body = concatBytes([zst(recs.slice(0, half)), zst(recs.slice(half))]);
    expect(splitZstdFrames(body).length).toBe(2);

    // 둘째 프레임 안 첫 A3 — 그 거래소 시각이 든 1초 창
    let target: { line: string; hms: string } | null = null;
    for (const rec of recs.slice(half)) {
      const r = iterRecords(rec).next().value!;
      const d = decodeAny(rec.subarray(r.off, r.off + r.len), r.recvNs, "KRX");
      if (d.table === "a3") {
        const tt = String(d.row.trade_time);
        target = { line: formatA3Line(d.row), hms: `${tt.slice(0, 2)}:${tt.slice(2, 4)}:${tt.slice(4, 6)}` };
        break;
      }
    }
    expect(target).not.toBeNull();

    const { r } = await runToday(() => live200(body, { offsetEnd: body.length }), {
      from: target!.hms,
      to: `${target!.hms}.999`,
    });
    expect(r.source).toBe("live");
    expect(r.text.split("\n")).toContain(target!.line);
    expect(r.text.split("\n").at(-1)!.startsWith(`틱 보기: /analytics/ticks?isin=${ISIN}&d=20261106&t=`)).toBe(true);
  });

  it("같은 memo 로 같은 isin|ex 두 번 → 둘째 호출의 첫 live offset = 첫 호출 offsetEnd(처음부터 다시 받지 않음)", async () => {
    const body = zst(todayRecords(KRX_FIX));
    const c = fakeClock(TODAY_ISO);
    const tg = fakeTickgw((q) =>
      q.offset === 0 ? live200(body, { offsetEnd: body.length }) : live200(new Uint8Array(0), { offsetEnd: body.length }),
    );
    const m = memo();
    const d = deps(noSupabase, { tickgw: tg, now: c.now, sleep: c.sleep });
    const r1 = await getMarketTicksText({ ...TODAY, from: "13:00:00", to: "13:00:05" }, d, m);
    expect(r1.source).toBe("live");
    const firstCalls = tg.calls.length;
    const r2 = await getMarketTicksText({ ...TODAY, from: "13:00:10", to: "13:00:15" }, d, m);
    expect(r2.source).toBe("live");
    expect(tg.calls[0]).toMatchObject({ offset: 0 });
    expect(tg.calls[firstCalls]).toMatchObject({ isin: ISIN, ex: "KRX", offset: body.length, epoch: "e1" });
  });

  it("창 안 레코드 0 → 자료 없음: 그 시각 시세 기록 없음(그 종목 미기록일 수 있음)", async () => {
    const body = zst(todayRecords(KRX_FIX));
    const { r } = await runToday(() => live200(body, { offsetEnd: body.length }), { from: "09:00:00", to: "09:00:05" });
    expect(r).toMatchObject({ source: "none", text: "자료 없음: 그 시각 시세 기록 없음(그 종목 미기록일 수 있음)" });
  });
});

// ── 격자 없음 → 변환 요청(Task 3) ─────────────────────────────────────

const PAST = { isin: ISIN, exchange: "KRX" as const, date: "2026-11-05", from: "13:00:00", to: "13:00:05" };
const noGrid = gridOpen({ date: "20261105", grid: null });
/** `tick_request_convert_for_user` 응답 — 기본은 「이미 진행 중」. */
const convertRow = (over: Record<string, unknown> = {}) => ({
  access: true,
  should_trigger: false,
  capped: false,
  grid_ready: false,
  not_uploaded: false,
  retry_after: null,
  request: { exchange: "KRX", isin: ISIN, status: "pending", requested_at: "2026-11-06T03:00:00Z", triggered_at: null, started_at: null, finished_at: null, error: null },
  eta_s: 120,
  ...over,
});
const okTrigger = (): TickConvertTrigger & { runs: [string, string][] } => {
  const runs: [string, string][] = [];
  return {
    runs,
    async run(d, ex) {
      runs.push([d, ex]);
      return { ok: true, execution: "exec-1" };
    },
  };
};

async function runPast(
  opts: Parameters<typeof makeSupabase>[0],
  over: Partial<MarketDeps> = {},
): Promise<{ r: Awaited<ReturnType<typeof getMarketTicksText>>; rec: Rec; sleep: ReturnType<typeof vi.fn> }> {
  const { client, rec } = makeSupabase(opts);
  const sleep = vi.fn(async () => {});
  const r = await getMarketTicksText(PAST, deps(client, { sleep, ...over }), memo());
  return { r, rec, sleep };
}

describe("getMarketTicksText — 격자 없음 → 변환 요청(Task 3)", () => {
  it("triggered true · eta_s 300 → 「변환 중 · 약 5분 뒤 다시 물어 주세요」 · source none · 대기 없음", async () => {
    const trigger = okTrigger();
    const { r, sleep } = await runPast(
      { open: noGrid, rpc: { tick_request_convert_for_user: convertRow({ should_trigger: true, eta_s: 300 }) } },
      { trigger },
    );
    expect(r).toMatchObject({ source: "none", text: "변환 중 · 약 5분 뒤 다시 물어 주세요" });
    expect(sleep).not.toHaveBeenCalled();
    expect(trigger.runs).toEqual([["20261105", "KRX"]]);
  });

  it("429 → 오늘 변환 한도 소진 · 503 → 변환 경로 꺼짐 · 502 → 변환 요청 실패", async () => {
    const capped = await runPast({ open: noGrid, rpc: { tick_request_convert_for_user: convertRow({ capped: true }) } });
    expect(capped.r.text).toBe("자료 없음: 오늘 변환 한도 소진");

    const off = await runPast({
      open: noGrid,
      rpc: { tick_request_convert_for_user: convertRow({ should_trigger: true }), tick_request_trigger_failed: null },
    });
    expect(off.r.text).toBe("자료 없음: 변환 경로 꺼짐");

    const failing: TickConvertTrigger = { run: async () => ({ ok: false, status: 500, error: "boom" }) };
    const bad = await runPast(
      {
        open: noGrid,
        rpc: { tick_request_convert_for_user: convertRow({ should_trigger: true }), tick_request_trigger_failed: null },
      },
      { trigger: failing },
    );
    expect(bad.r.text).toBe("자료 없음: 변환 요청 실패");
    expect(bad.r.text).not.toContain("boom");
  });

  it("not_uploaded → 원본 업로드 전 문구 · grid_ready(경합) → 한 번 다시 열어 격자를 읽는다", async () => {
    const nu = await runPast({ open: noGrid, rpc: { tick_request_convert_for_user: convertRow({ not_uploaded: true }) } });
    expect(nu.r.text).toBe("자료 없음: 원본 업로드 전(매일 22:00 업로드 · 23:30 뒤 변환)");

    // 픽스처는 10/16 수신 — 11/05 창으로 읽히도록 수신 시각을 20일 뒤로 옮긴 격자
    const shifted = zst(todayRecords(KRX_FIX).map((rec) => {
      const r = iterRecords(rec).next().value!;
      return encodeRecord(r.recvNs - DAY_NS, rec.subarray(r.off, r.off + r.len));
    }));
    const race = await runPast({
      openSeq: [noGrid, gridOpen({ date: "20261105" })],
      grid: shifted,
      rpc: { tick_request_convert_for_user: convertRow({ grid_ready: true }) },
    });
    expect(race.r.source).toBe("grid");
    expect(race.r.text.split("\n")[2]).toBe(GOLDEN_B6);
    expect(race.rec.rpc.filter((c) => c.fn === "tick_open_for_user")).toHaveLength(2);
    expect(race.rec.downloads).toHaveLength(1);
  });

  it("이미 진행 중(triggered false · request 있음 · eta_s 120) → 「변환 중 · 약 2분 뒤 다시 물어 주세요」", async () => {
    const { r } = await runPast({ open: noGrid, rpc: { tick_request_convert_for_user: convertRow() } });
    expect(r).toMatchObject({ source: "none", text: "변환 중 · 약 2분 뒤 다시 물어 주세요" });
  });

  it("requestTickConvert 호출 인자 = (supabase, userId, { d, isin, ex }, { trigger, dailyCap })", async () => {
    const spy = vi.mocked(requestTickConvert);
    spy.mockClear();
    const trigger = okTrigger();
    const { client } = makeSupabase({ open: noGrid, rpc: { tick_request_convert_for_user: convertRow() } });
    await getMarketTicksText(PAST, deps(client, { trigger, dailyCap: 7 }), memo());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(client, USER, { d: "20261105", isin: ISIN, ex: "KRX" }, { trigger, dailyCap: 7 });
  });

  it("tick_open_for_user access false → 자료 없음: DMA 계좌 매핑 없음", async () => {
    const { r } = await runPast({ open: { access: false } });
    expect(r).toMatchObject({ source: "none", text: "자료 없음: DMA 계좌 매핑 없음" });
  });
});

describe("SC-5 — 시세 도구는 외부 원본을 부르지 않는다", () => {
  it("이 파일의 모든 호출 동안 globalThis.fetch 0회", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
