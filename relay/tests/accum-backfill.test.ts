/**
 * Phase 34 Plan 02 — D-23 소급 내보내기(`relay/src/store/accum-backfill.ts`) 단위 테스트.
 *
 * kind 16(KYOBO119) 행 → 인박스 261020 「소급 목록 파일 형식」 23키 JSON lines. 실 DB 에 붙지 않는다 —
 * 가짜 Supabase 클라이언트가 체인 호출(select · eq · order · range)을 기록하고 head count · range 페이지를 돌려준다.
 *   - 한 날짜 경로: count 미리보기 → 1,000 + 7 행 2페이지 → 23키 매핑 → 임시 파일 → rename → 요약(Pitfall 16).
 *   - count ≠ 읽은 행 수 · 기존 파일(--force 없음)은 throw 하고 파일을 건드리지 않는다.
 *   - 매핑 경계(Pitfall 17): since/reg 는 문자열(앞 0 유지 · 깨지면 "") · th 셋째 결측 0 · snap_cum 짧음 0.
 *   - 라이브 `accumSignalOf`(shared)와 같은 열을 가리키는지 대응 필드로 대조한다(함수 재사용은 안 한다).
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { accumSignalOf, STRATEGY_EVENT_KIND, type StrategyEventRow } from "@gh-radar/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  ACCUM_BACKFILL_KEYS,
  accumBackfillLineOf,
  exportAccumBackfillDay,
  type Kind16Row,
} from "../src/store/accum-backfill.js";

/** gh-trade `server/tools/analysis/tickana/teamflow_accum.py` EVENT_KEYS_REQUIRED 원문(2026-10-20) — 대조용 사본. */
const GH_TRADE_EVENT_KEYS_REQUIRED = [
  "row", "gw_time_ms", "isin", "state", "end_reason", "cycle", "carry_days", "since_date", "reg_time",
  "buy_qty", "buy_krw", "sell_qty", "sell_krw", "net_qty", "net_krw", "avg_px", "reg_px", "peak_net_krw",
  "our_excluded_qty", "mcap_krw", "th_net_krw", "th_min_same", "th_max_mcap_krw",
];

/** kind 16 한 행 — 값은 의미 없는 더미, 열 이름만 실제(snake_case select 결과). */
function kind16(i: number, overrides: Partial<Kind16Row> = {}): Kind16Row {
  return {
    queue_case: 1,
    gw_time_ms: 1_760_832_000_000 + i * 1000,
    isin: `KR700000${String(i % 3).padStart(3, "0")}2`,
    qty: 1,
    cancel_reason: 0,
    expected_cum: 1,
    entry_round: 0,
    message: "since=20261019|reg=095720|st=1|end=0|cyc=1|carry=0|row=1|our=0|th=100000000/30/500000000000",
    ev_qty_before: 100,
    limit_bid_qty: 1_000_000,
    ev_qty_after: 0,
    bid1_qty: 0,
    ev_trade_qty: 100,
    cond_threshold: 1_000_000,
    ev_price: 10_000,
    bid1_price: 9_900,
    ask_qty_at_limit: 1_000_000,
    immediate_fill_qty: 0,
    base_cum: 50_000_000_000,
    snap_cum: [100_000_000, 30],
    journal_epoch: "e1",
    seq: i + 1,
    ...overrides,
  };
}

type Call = { method: string; args: unknown[] };

/**
 * 가짜 Supabase — `from(table)` 마다 새 빌더. 빌더는 호출을 기록하고 await 시 head 면 count, 아니면 range 슬라이스를 준다.
 * `count` 를 따로 주면 미리보기 count 만 그 값이 된다(행 수 불일치 재현).
 */
function fakeSupabase(rows: Kind16Row[], opts: { count?: number } = {}) {
  const queries: { table: string; calls: Call[] }[] = [];
  const client = {
    from(table: string) {
      const q = { table, calls: [] as Call[] };
      queries.push(q);
      let head = false;
      let range: [number, number] | null = null;
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "range"]) {
        builder[method] = (...args: unknown[]) => {
          q.calls.push({ method, args });
          if (method === "select") head = (args[1] as { head?: boolean } | undefined)?.head === true;
          if (method === "range") range = [args[0] as number, args[1] as number];
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        try {
          if (head) return Promise.resolve(resolve({ data: null, error: null, count: opts.count ?? rows.length }));
          const [from, to] = range ?? [0, rows.length - 1];
          return Promise.resolve(resolve({ data: rows.slice(from, to + 1), error: null, count: null }));
        } catch (e) {
          return Promise.resolve(reject(e));
        }
      };
      return builder;
    },
  };
  return { sb: client as unknown as SupabaseClient, queries };
}

function rowsOf(n: number): Kind16Row[] {
  return Array.from({ length: n }, (_, i) => kind16(i));
}

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), "accum-backfill-"));
}

describe("exportAccumBackfillDay — 한 날짜 경로(트레이서)", () => {
  it("kind=16 · gateway=KYOBO119 · trade_date=2026-10-19 필터와 gw_time_ms · journal_epoch · seq 정렬로 읽는다", async () => {
    const { sb, queries } = fakeSupabase(rowsOf(1007));
    await exportAccumBackfillDay({ sb, date: "20261019", outDir: freshDir() });

    expect(queries.length).toBeGreaterThanOrEqual(2);
    for (const q of queries) {
      expect(q.table).toBe("dma_strategy_events");
      const eqs = q.calls.filter((c) => c.method === "eq").map((c) => c.args);
      expect(eqs).toEqual(
        expect.arrayContaining([
          ["kind", 16],
          ["gateway", "KYOBO119"],
          ["trade_date", "2026-10-19"],
        ]),
      );
    }
    const pages = queries.filter((q) => q.calls.some((c) => c.method === "range"));
    expect(pages.length).toBe(2);
    for (const p of pages) {
      expect(p.calls.filter((c) => c.method === "order").map((c) => c.args[0])).toEqual(["gw_time_ms", "journal_epoch", "seq"]);
    }
    expect(pages.map((p) => p.calls.find((c) => c.method === "range")?.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("미리보기 count 1007 · 2페이지(1000 + 7) → 1,007줄 파일 · rows 1007 · isins = 서로 다른 isin 수", async () => {
    const outDir = freshDir();
    const { sb } = fakeSupabase(rowsOf(1007));
    const res = await exportAccumBackfillDay({ sb, date: "20261019", outDir });

    expect(res.path).toBe(join(outDir, "20261019.jsonl"));
    expect(res.rows).toBe(1007);
    expect(res.isins).toBe(3);
    const lines = readFileSync(res.path, "utf8").split("\n").filter((l) => l !== "");
    expect(lines).toHaveLength(1007);
  });

  it("각 줄의 키 집합이 ACCUM_BACKFILL_KEYS(23개 · gh-trade EVENT_KEYS_REQUIRED)와 같고 since_date · reg_time 은 문자열", async () => {
    expect(ACCUM_BACKFILL_KEYS).toHaveLength(23);
    expect([...ACCUM_BACKFILL_KEYS].sort()).toEqual([...GH_TRADE_EVENT_KEYS_REQUIRED].sort());

    const { sb } = fakeSupabase(rowsOf(5));
    const res = await exportAccumBackfillDay({ sb, date: "20261019", outDir: freshDir() });
    const lines = readFileSync(res.path, "utf8").split("\n").filter((l) => l !== "");
    expect(lines).toHaveLength(5);
    for (const l of lines) {
      const obj = JSON.parse(l) as Record<string, unknown>;
      expect(Object.keys(obj).sort()).toEqual([...ACCUM_BACKFILL_KEYS].sort());
      expect(typeof obj.since_date).toBe("string");
      expect(typeof obj.reg_time).toBe("string");
      expect(obj.reg_time).toBe("095720");
    }
  });

  it("출력 디렉터리에 임시 파일이 남지 않는다(<D>.jsonl 하나)", async () => {
    const outDir = freshDir();
    const { sb } = fakeSupabase(rowsOf(1007));
    await exportAccumBackfillDay({ sb, date: "20261019", outDir });
    expect(readdirSync(outDir)).toEqual(["20261019.jsonl"]);
  });

  it("미리보기 count 1008 인데 1007행만 읽히면 throw · 파일 없음", async () => {
    const outDir = freshDir();
    const { sb } = fakeSupabase(rowsOf(1007), { count: 1008 });
    await expect(exportAccumBackfillDay({ sb, date: "20261019", outDir })).rejects.toThrow(/1008/);
    expect(existsSync(join(outDir, "20261019.jsonl"))).toBe(false);
    expect(readdirSync(outDir)).toEqual([]);
  });

  it("대상 파일이 이미 있으면 force 없이 throw(내용 그대로) · force=true 면 덮어쓴다", async () => {
    const outDir = freshDir();
    const target = join(outDir, "20261019.jsonl");
    writeFileSync(target, "old\n");
    const { sb } = fakeSupabase(rowsOf(3));

    await expect(exportAccumBackfillDay({ sb, date: "20261019", outDir })).rejects.toThrow(/--force/);
    expect(readFileSync(target, "utf8")).toBe("old\n");

    const res = await exportAccumBackfillDay({ sb, date: "20261019", outDir, force: true });
    expect(res.rows).toBe(3);
    expect(readFileSync(target, "utf8").split("\n").filter((l) => l !== "")).toHaveLength(3);
  });
});

const MSG_FULL = "since=20261016|reg=095720|st=1|end=0|cyc=2|carry=1|row=1|our=0|th=100000000/30/500000000000";

describe("accumBackfillLineOf — 매핑 경계(Pitfall 17)", () => {
  it("온전한 message → since_date \"20261016\" · reg_time \"095720\"(앞 0 유지) · th_max_mcap_krw 500000000000", () => {
    const line = accumBackfillLineOf(kind16(0, { message: MSG_FULL }));
    expect(line.since_date).toBe("20261016");
    expect(line.reg_time).toBe("095720");
    expect(line.th_max_mcap_krw).toBe(500_000_000_000);
  });

  it("since= 빈 값 · reg= 5자리 · th 두 칸 → since_date \"\" · reg_time \"\" · th_max_mcap_krw 0", () => {
    const line = accumBackfillLineOf(kind16(0, { message: "since=|reg=95720|th=1/2" }));
    expect(line.since_date).toBe("");
    expect(line.reg_time).toBe("");
    expect(line.th_max_mcap_krw).toBe(0);
  });

  it("th 셋째 값이 숫자가 아니면 0", () => {
    expect(accumBackfillLineOf(kind16(0, { message: "th=1/2/abc" })).th_max_mcap_krw).toBe(0);
  });

  it("message \"\" · null → since_date · reg_time \"\" · 예외 없음 · 23키 유지", () => {
    for (const message of ["", null]) {
      const line = accumBackfillLineOf(kind16(0, { message }));
      expect(line.since_date).toBe("");
      expect(line.reg_time).toBe("");
      expect(line.th_max_mcap_krw).toBe(0);
      expect(Object.keys(line)).toEqual([...ACCUM_BACKFILL_KEYS]);
    }
  });

  it("snap_cum [100000000] → th_net_krw 100000000 · th_min_same 0 · null → 둘 다 0", () => {
    const short = accumBackfillLineOf(kind16(0, { snap_cum: [100_000_000] }));
    expect(short.th_net_krw).toBe(100_000_000);
    expect(short.th_min_same).toBe(0);
    const none = accumBackfillLineOf(kind16(0, { snap_cum: null }));
    expect(none.th_net_krw).toBe(0);
    expect(none.th_min_same).toBe(0);
  });

  it("bigint 칸이 문자열로 와도 정수 · null 이면 0 · net_krw 음수 유지", () => {
    const line = accumBackfillLineOf(
      kind16(0, { base_cum: "123456789012", cond_threshold: -5_000_000, ev_qty_before: null, snap_cum: ["7", "8"] }),
    );
    expect(line.mcap_krw).toBe(123_456_789_012);
    expect(line.net_krw).toBe(-5_000_000);
    expect(line.buy_qty).toBe(0);
    expect(line.th_net_krw).toBe(7);
    expect(line.th_min_same).toBe(8);
  });

  it("since/reg 를 뺀 22키 중 isin 을 뺀 21키 값은 정수", () => {
    const line = accumBackfillLineOf(kind16(0, { message: MSG_FULL }));
    for (const k of ACCUM_BACKFILL_KEYS) {
      if (k === "isin" || k === "since_date" || k === "reg_time") continue;
      expect(Number.isInteger(line[k]), k).toBe(true);
    }
  });
});

describe("accumBackfillLineOf ↔ shared accumSignalOf 열 대응", () => {
  /** 칸마다 다른 값 — 두 칸이 뒤바뀌면 대조가 깨진다. */
  const src: Kind16Row = {
    queue_case: 4,
    gw_time_ms: 1_760_900_000_123,
    isin: "KR7000650002",
    qty: 2,
    cancel_reason: 1,
    expected_cum: 3,
    entry_round: 2,
    message: MSG_FULL,
    ev_qty_before: 11,
    limit_bid_qty: 12,
    ev_qty_after: 13,
    bid1_qty: 14,
    ev_trade_qty: 15,
    cond_threshold: -16,
    ev_price: 17,
    bid1_price: 18,
    ask_qty_at_limit: 19,
    immediate_fill_qty: 20,
    base_cum: 21,
    snap_cum: [22, 23],
    journal_epoch: "e1",
    seq: 1,
  };

  /** 같은 원천을 shared 의 camelCase 행으로 — 쓰지 않는 칸은 0/"". */
  function camelOf(r: Kind16Row): StrategyEventRow {
    return {
      gateway: "KYOBO119", journalEpoch: r.journal_epoch, seq: Number(r.seq), tradeDate: "2026-10-19",
      gwTimeMs: Number(r.gw_time_ms), kind: STRATEGY_EVENT_KIND.AccumSignal, group: 0, exchange: "KRX",
      isin: r.isin ?? "", stockCode: null, cumVolume: 0, accountNo: "", orderNo: "", price: 0, qty: Number(r.qty),
      orderCondition: "", reasonCode: "", condThreshold: Number(r.cond_threshold), condActual: 0, condMetric: 0,
      evKind: 0, evPrice: Number(r.ev_price), evQtyBefore: Number(r.ev_qty_before), evQtyAfter: Number(r.ev_qty_after),
      evTradeQty: Number(r.ev_trade_qty), limitBidQty: Number(r.limit_bid_qty), bid1Price: Number(r.bid1_price),
      bid1Qty: Number(r.bid1_qty), acceptLatencyUs: 0, immediateFillQty: Number(r.immediate_fill_qty),
      queueCase: Number(r.queue_case), baseCum: Number(r.base_cum), aheadQty: 0, expectedCum: Number(r.expected_cum),
      errorVolume: 0, remainingVolume: 0, hasRemaining: false, cancelReason: Number(r.cancel_reason), resultCode: 0,
      message: r.message ?? "", entryRound: Number(r.entry_round), snapQty: [], snapCum: (r.snap_cum ?? []).map(Number),
      askQtyAtLimit: Number(r.ask_qty_at_limit), openAtLimit: false,
    };
  }

  it("대응 필드 값이 같다(net_krw ↔ netKrw · state ↔ state · carry_days ↔ carryDays …)", () => {
    const line = accumBackfillLineOf(src);
    const sig = accumSignalOf(camelOf(src));
    expect(sig).not.toBeNull();
    if (!sig) return;
    const pairs: [string | number, string | number | null][] = [
      [line.row, sig.row],
      [line.gw_time_ms, sig.gwTimeMs],
      [line.isin, sig.isin],
      [line.state, sig.state],
      [line.end_reason, sig.endReason],
      [line.cycle, sig.cycle],
      [line.carry_days, sig.carryDays],
      [line.buy_qty, sig.buyQty],
      [line.buy_krw, sig.buyKrw],
      [line.sell_qty, sig.sellQty],
      [line.sell_krw, sig.sellKrw],
      [line.net_qty, sig.netQty],
      [line.net_krw, sig.netKrw],
      [line.avg_px, sig.avgPx],
      [line.reg_px, sig.regPx],
      [line.peak_net_krw, sig.peakNetKrw],
      [line.our_excluded_qty, sig.ourExcludedQty],
      [line.mcap_krw, sig.mcapKrw],
      [line.th_net_krw, sig.thNetKrw],
      [line.th_min_same, sig.thMinSame],
      [line.th_max_mcap_krw, sig.thMaxMcapKrw],
    ];
    for (const [a, b] of pairs) expect(a).toBe(b);
    // 표기만 다르다 — shared 는 "2026-10-16" · "09:57:20", 소급 줄은 원문 문자열
    expect(line.since_date).toBe(sig.sinceDate?.replaceAll("-", ""));
    expect(line.reg_time).toBe(sig.regTime?.replaceAll(":", ""));
  });
});

describe("exportAccumBackfillDay — 결측 집계", () => {
  it("missingSince · missingReg 가 결측 줄 수를 센다", async () => {
    const rows = [
      kind16(0, { message: MSG_FULL }),
      kind16(1, { message: "since=|reg=095720" }),
      kind16(2, { message: "since=20261016|reg=9572" }),
      kind16(3, { message: null }),
    ];
    const { sb } = fakeSupabase(rows);
    const res = await exportAccumBackfillDay({ sb, date: "20261019", outDir: freshDir() });
    expect(res.rows).toBe(4);
    expect(res.missingSince).toBe(2);
    expect(res.missingReg).toBe(2);
  });

  it("onPreview 가 페이지 조회 전에 미리보기 count 를 받는다", async () => {
    const seen: number[] = [];
    const { sb } = fakeSupabase(rowsOf(3));
    await exportAccumBackfillDay({ sb, date: "20261019", outDir: freshDir(), onPreview: (n) => seen.push(n) });
    expect(seen).toEqual([3]);
  });

  it("날짜 형식 오류 · 없는 날짜는 조회 전에 throw", async () => {
    const { sb, queries } = fakeSupabase(rowsOf(1));
    await expect(exportAccumBackfillDay({ sb, date: "2026-10-19", outDir: freshDir() })).rejects.toThrow(/형식/);
    await expect(exportAccumBackfillDay({ sb, date: "20260230", outDir: freshDir() })).rejects.toThrow(/없는 날짜/);
    expect(queries).toHaveLength(0);
  });
});
