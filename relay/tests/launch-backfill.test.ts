/**
 * Phase 35 Plan 03 — 발사 백필 도구(`relay/src/tools/launch-backfill.ts`) 단위 테스트.
 *
 * 첨부 `pieces.json`(196행) · 합성 ndjson → 조각 입력 → 계획(논리 키 중복 · shared launchHeadOf 머리) → RPC 페이로드.
 * 실 DB 에 붙지 않는다 — 가짜 Supabase 클라이언트가 rpc · 체인 호출을 기록하고 정해 둔 응답을 돌려준다.
 *   - 트레이서: 첨부 196 → 거부 0 → 머리 33 · 날짜 11 · 중복 0 → apply(청크 500) = rpc 2회(조각 1 · 머리 1).
 *   - 쓰기는 `launch_backfill_apply` 뿐 — 표 직접 upsert 없음(조건부 upsert 규칙은 DB 한 곳).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { LaunchPieceInput } from "@gh-radar/shared";

import {
  applyLaunchBackfill,
  launchStatusOf,
  LAUNCH_NDJSON_KEYS,
  parseLaunchFile,
  pieceFromNdjson,
  planLaunchBackfill,
  reprojectLaunch,
} from "../src/tools/launch-backfill.js";

const ATTACH = fileURLToPath(
  new URL("../../docs/inbox/from-gh-trade/261027-launch-gate-admin-attach/pieces.json", import.meta.url),
);

type RpcCall = { fn: string; args: Record<string, unknown> };

/** 가짜 sb — rpc 호출을 기록하고 launch_backfill_apply 는 받은 수를 그대로 written 으로 돌려준다. */
function fakeSb(opts: { failAt?: number } = {}) {
  const calls: RpcCall[] = [];
  const sb = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (opts.failAt !== undefined && calls.length === opts.failAt) {
        return Promise.resolve({ data: null, error: { code: "P0001", message: "launch_upsert_piece: 필수 키 누락 sent_rel_us" } });
      }
      const p = (args.p_pieces as unknown[] | undefined) ?? [];
      const h = (args.p_heads as unknown[] | undefined) ?? [];
      return Promise.resolve({
        data: { pieces_in: p.length, pieces_written: p.length, heads_in: h.length, heads_written: h.length },
        error: null,
      });
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}

describe("첨부 pieces.json 트레이서", () => {
  const parsed = parseLaunchFile(ATTACH, readFileSync(ATTACH, "utf8"));

  it("parse — 조각 196 · 거부 0 · 열 매핑(KB→KB120 · 코스피→K · Q16 · KRX 16:00:00 · 없는 값 null)", () => {
    expect(parsed.pieces).toHaveLength(196);
    expect(parsed.rejects).toEqual([]);
    expect(parsed.pieces[0]).toEqual({
      trade_date: "2026-10-12",
      gateway: "KB120",
      profile: "Q16",
      fire_exchange: "KRX",
      fire_base: "16:00:00",
      market: "K",
      wire: 0,
      side: null,
      queued_id: "Q153027001",
      piece_idx: 0,
      round: null,
      probe: null,
      order_no: null,
      sent_rel_us: -305,
      result: "101",
      result_code: null,
      accept_time: null,
      retry: null,
      abandoned: null,
      isin: null,
      price: null,
      qty: null,
      filled_qty: null,
      account: null,
      dma_user_id: null,
    });
  });

  it("plan — 머리 33 · 날짜 11 · 중복 0 · n_pieces 합 196 · 학습 열 · next_offset_us null", () => {
    const plan = planLaunchBackfill(parsed.pieces);
    expect(plan.pieces).toHaveLength(196);
    expect(plan.heads).toHaveLength(33);
    expect(plan.duplicates).toBe(0);
    expect(new Set(plan.pieces.map((p) => p.trade_date)).size).toBe(11);
    expect(plan.heads.reduce((s, h) => s + (h.n_pieces ?? 0), 0)).toBe(196);
    expect(plan.groups).toHaveLength(33);
    expect(plan.groups[0]).toEqual({
      trade_date: "2026-10-12",
      gateway: "KB120",
      market: "K",
      profile: "Q16",
      fire_exchange: "KRX",
      fire_base: "16:00:00",
      pieces: 3,
    });
    const h = plan.heads.find((x) => x.trade_date === "2026-10-12" && x.gateway === "KB120" && x.market === "K")!;
    expect(h).toMatchObject({
      fire_base: "16:00:00",
      n_pieces: 3,
      n_accepted: 0,
      n_reject: 3,
      n_other: 0,
      gate_lo_us: -302,
      gate_hi_us: null,
      offset_used_us: -305,
      first_accept_idx: null,
      nonmono: false,
      next_offset_us: null,
      correction_after_us: null,
    });
  });

  it("apply(청크 500) — rpc 2회(조각 1 · 머리 1) · p_pieces 196 · 원문 추적 키 없음", async () => {
    const plan = planLaunchBackfill(parsed.pieces);
    const { sb, calls } = fakeSb();
    const res = await applyLaunchBackfill(sb, plan, { chunk: 500 });
    expect(calls.map((c) => c.fn)).toEqual(["launch_backfill_apply", "launch_backfill_apply"]);
    const p0 = calls[0]!.args.p_pieces as Record<string, unknown>[];
    expect(p0).toHaveLength(196);
    expect(calls[0]!.args.p_heads).toEqual([]);
    expect(calls[1]!.args.p_pieces).toEqual([]);
    expect(calls[1]!.args.p_heads as unknown[]).toHaveLength(33);
    for (const k of ["source", "journal_epoch", "seq", "gw_time_ms"]) expect(p0[0]).not.toHaveProperty(k);
    expect(res).toEqual({ pieces_written: 196, heads_written: 33, calls: 2 });
  });

  it("RPC 오류면 몇 번째 청크인지와 함께 throw", async () => {
    const plan = planLaunchBackfill(parsed.pieces);
    const { sb } = fakeSb({ failAt: 1 });
    await expect(applyLaunchBackfill(sb, plan, { chunk: 500 })).rejects.toThrow(/조각 청크 1\/1/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// gh-trade ndjson 입력
// ─────────────────────────────────────────────────────────────────────────────

/** 16:00 Q16 · 09:00:30 N(retry 2 · accept_time 8자리) · A KRX 09:00:27 buy · A NXT sell + 깨진 줄 2개 + 빈 줄. */
const NDJSON = [
  JSON.stringify({ date: "2026-10-27", gateway: "KB120", profile: "Q16", fire_exchange: "KRX", market: "K", wire: 0, queued_id: "Q160000001", piece_idx: 0, probe: 0, sent_rel_us: -300, result: "접수", accept_time: 155959999, user: "dmauser1", account: "12345678" }),
  JSON.stringify({ date: "20261027", gateway: "kb", profile: "N", fire_exchange: "NXT", market: "Q", wire: 0, side: "buy", sent_rel_us: -200, result: "515", retry: 2, accept_time: 90030046, probe: "1" }),
  JSON.stringify({ date: "2026-10-27", gateway: "KYOBO119", profile: "A", fire_exchange: "KRX", market: "K", wire: 0, side: "buy", sent_rel_us: -150, result: "접수", abandoned: 0 }),
  "",
  JSON.stringify({ date: "2026-10-27", gateway: "교보", profile: "A", fire_exchange: "NXT", fire_base: "09:00:30", market: "K", wire: 0, side: "sell", sent_rel_us: -180, result: "접수", abandoned: true, extra_field: 1 }),
  JSON.stringify({ date: "2026-10-27", gateway: "KB120", profile: "Q16", fire_exchange: "KRX", market: "Q", wire: 1, result: "101" }),
  JSON.stringify({ date: "2026-10-27", gateway: "X", profile: "Q16", fire_exchange: "KRX", market: "Q", wire: 2, sent_rel_us: -1, result: "101" }),
].join("\n");

describe("gh-trade ndjson 입력", () => {
  const parsed = parseLaunchFile("/tmp/full.ndjson", NDJSON);

  it("조각 4 · 거부 2(줄 번호 · 사유) · 모르는 키 모음", () => {
    expect(parsed.pieces).toHaveLength(4);
    expect(parsed.rejects).toEqual([
      { where: "/tmp/full.ndjson:6", reason: "필수 키 누락: sent_rel_us" },
      { where: "/tmp/full.ndjson:7", reason: "모르는 gateway: X" },
    ]);
    expect(parsed.unknownKeys).toEqual(["extra_field"]);
  });

  it("fire_base 파생 · date 정규화 · gateway 별칭 · user → dma_user_id · probe/abandoned boolean · accept_time 숫자 그대로", () => {
    const [q16, n, aBuy, aSell] = parsed.pieces;
    expect(q16).toMatchObject({ trade_date: "2026-10-27", fire_base: "16:00:00", probe: false, dma_user_id: "dmauser1", account: "12345678", accept_time: 155959999, side: null });
    expect(q16).not.toHaveProperty("user");
    expect(n).toMatchObject({ trade_date: "2026-10-27", gateway: "KB120", fire_base: "09:00:30", side: "buy", retry: 2, accept_time: 90030046, probe: true, round: null, order_no: null });
    expect(aBuy).toMatchObject({ gateway: "KYOBO119", profile: "A", fire_exchange: "KRX", fire_base: "09:00:27", side: "buy", abandoned: false });
    expect(aSell).toMatchObject({ gateway: "KYOBO119", profile: "A", fire_exchange: "NXT", fire_base: "09:00:30", side: "sell", abandoned: true });
  });

  it("A 두 다리는 다른 논리 키 — 계획에서 둘 다 남고 머리도 따로", () => {
    const plan = planLaunchBackfill(parsed.pieces);
    expect(plan.pieces).toHaveLength(4);
    expect(plan.duplicates).toBe(0);
    expect(plan.heads).toHaveLength(4);
    const aHeads = plan.heads.filter((h) => h.profile === "A").map((h) => [h.fire_exchange, h.fire_base]);
    expect(aHeads).toEqual([
      ["KRX", "09:00:27"],
      ["NXT", "09:00:30"],
    ]);
  });

  it("요청한 키 목록 25개 — user 만 열 이름과 다르다", () => {
    expect(LAUNCH_NDJSON_KEYS).toHaveLength(25);
    expect(LAUNCH_NDJSON_KEYS).toContain("user");
    expect(LAUNCH_NDJSON_KEYS).not.toContain("dma_user_id");
  });

  it("거부 사유 — 필수 키 · fire_base 를 정할 수 없음 · side · probe · date · market 형식", () => {
    const base = { date: "2026-10-27", gateway: "KB120", profile: "Q16", fire_exchange: "KRX", market: "K", wire: 0, sent_rel_us: -1, result: "101" };
    expect(() => pieceFromNdjson({ ...base, result: undefined })).toThrow("필수 키 누락: result");
    expect(() => pieceFromNdjson({ ...base, fire_exchange: "NXT" })).toThrow(/fire_base 를 정할 수 없습니다/);
    expect(() => pieceFromNdjson({ ...base, side: "hold" })).toThrow(/모르는 side/);
    expect(() => pieceFromNdjson({ ...base, probe: 2 })).toThrow(/probe/);
    expect(() => pieceFromNdjson({ ...base, date: "2026/10/27" })).toThrow(/date 형식/);
    expect(() => pieceFromNdjson({ ...base, market: "X" })).toThrow(/모르는 market/);
  });

  it("result_code — 브로커 원 거부 코드 문자열(F083 · E124) 그대로 · 숫자는 문자열로 · 없으면 null", () => {
    const base = { date: "2026-10-27", gateway: "KB120", profile: "Q16", fire_exchange: "KRX", market: "K", wire: 0, sent_rel_us: -1, result: "기타" };
    expect(pieceFromNdjson({ ...base, result_code: "F083" }).result_code).toBe("F083");
    expect(pieceFromNdjson({ ...base, result_code: "E124" }).result_code).toBe("E124");
    expect(pieceFromNdjson({ ...base, result: "515", result_code: 515 }).result_code).toBe("515");
    expect(pieceFromNdjson({ ...base, result: "접수", result_code: 0 }).result_code).toBe("0");
    expect(pieceFromNdjson(base).result_code).toBeNull();
  });

  it("parseLaunchFile — 모르는 확장자는 throw", () => {
    expect(() => parseLaunchFile("/tmp/x.csv", "")).toThrow(/모르는 파일 형식/);
  });
});

describe("계획 — --date 필터 · 논리 키 중복", () => {
  const attach = parseLaunchFile(ATTACH, readFileSync(ATTACH, "utf8")).pieces;

  it("--date 20261012 → 그날 조각만 · 머리 = 그날 발사 수", () => {
    const plan = planLaunchBackfill(attach, { dates: ["20261012"] });
    const expected = attach.filter((p) => p.trade_date === "2026-10-12");
    expect(plan.pieces).toHaveLength(expected.length);
    expect(plan.pieces.every((p) => p.trade_date === "2026-10-12")).toBe(true);
    expect(plan.heads).toHaveLength(new Set(expected.map((p) => `${p.gateway}|${p.market}`)).size);
  });

  it("같은 논리 키 3번 → 중복 2 · 마지막 값이 이긴다", () => {
    const line = { date: "2026-10-27", gateway: "KB120", profile: "Q16", fire_exchange: "KRX", market: "K", wire: 0, result: "101" };
    const pieces = [
      pieceFromNdjson({ ...line, sent_rel_us: -300 }),
      pieceFromNdjson({ ...line, wire: 1, sent_rel_us: -290 }),
      pieceFromNdjson({ ...line, sent_rel_us: -299 }),
      pieceFromNdjson({ ...line, sent_rel_us: -298, result: "접수" }),
    ];
    const plan = planLaunchBackfill(pieces);
    expect(plan.duplicates).toBe(2);
    expect(plan.pieces).toHaveLength(2);
    expect(plan.pieces.find((p) => p.wire === 0)).toMatchObject({ sent_rel_us: -298, result: "접수" });
    expect(plan.heads[0]).toMatchObject({ n_pieces: 2, n_accepted: 1, n_reject: 1, offset_used_us: -298 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 적재 청크 · 상태 · 재해석 — 가짜 sb
// ─────────────────────────────────────────────────────────────────────────────

type ChainCall = { method: string; args: unknown[] };

/** rpc 는 fn 별 응답 함수 · from() 체인은 호출을 기록하고 await 하면 count 를 돌려준다. */
function fakeSbFull(rpcData: Record<string, (args: Record<string, unknown>) => unknown>, count = 0) {
  const rpcCalls: RpcCall[] = [];
  const chain: ChainCall[] = [];
  const record = (method: string, args: unknown[]) => {
    chain.push({ method, args });
    return builder;
  };
  const builder = {
    select: (...args: unknown[]) => record("select", args),
    in: (...args: unknown[]) => record("in", args),
    gte: (...args: unknown[]) => record("gte", args),
    lte: (...args: unknown[]) => record("lte", args),
    then: (resolve: (v: unknown) => unknown) => resolve({ count, error: null, data: null }),
  };
  const sb = {
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      const h = rpcData[fn];
      return Promise.resolve(h ? { data: h(args), error: null } : { data: null, error: { code: "PGRST202", message: "no fn" } });
    },
    from(table: string) {
      return record("from", [table]);
    },
  };
  return { sb: sb as unknown as SupabaseClient, rpcCalls, chain };
}

function syntheticFire(n: number, result: (i: number) => string): LaunchPieceInput[] {
  return Array.from({ length: n }, (_, i) =>
    pieceFromNdjson({ date: "2026-10-27", gateway: "KB120", profile: "Q16", fire_exchange: "KRX", market: "K", wire: i, sent_rel_us: -400 + i, result: result(i) }),
  );
}

describe("applyLaunchBackfill — 청크", () => {
  it("합성 1,201조각(한 발사) → 조각 rpc 3회(500 · 500 · 201) + 머리 rpc 1회", async () => {
    const plan = planLaunchBackfill(syntheticFire(1201, (i) => (i < 100 ? "101" : "접수")));
    expect(plan.heads).toHaveLength(1);
    const { sb, calls } = fakeSb();
    const res = await applyLaunchBackfill(sb, plan);
    expect(calls.map((c) => [(c.args.p_pieces as unknown[]).length, (c.args.p_heads as unknown[]).length])).toEqual([
      [500, 0],
      [500, 0],
      [201, 0],
      [0, 1],
    ]);
    expect(res).toEqual({ pieces_written: 1201, heads_written: 1, calls: 4 });
  });

  it("두 번째 청크 실패면 「조각 청크 2/3」 으로 throw 하고 머리는 보내지 않는다", async () => {
    const { sb, calls } = fakeSb({ failAt: 2 });
    await expect(applyLaunchBackfill(sb, planLaunchBackfill(syntheticFire(1201, () => "접수")))).rejects.toThrow(
      /조각 청크 2\/3 실패: P0001 launch_upsert_piece/,
    );
    expect(calls).toHaveLength(2);
  });
});

describe("launchStatusOf — 읽기 전용", () => {
  it("launch_map_for_admin 을 q16 · n0930 두 번(p_days null) · 날짜 × 서버 × 시장 조각 수", async () => {
    const { sb, rpcCalls, chain } = fakeSbFull({
      launch_map_for_admin: (args) =>
        args.p_fire === "q16"
          ? {
              days: ["20261026", "20261023"],
              heads: [{}, {}],
              pieces: [
                { trade_date: "20261023", gateway: "KB120", market: "Q" },
                { trade_date: "20261026", gateway: "KB120", market: "Q" },
                { trade_date: "20261026", gateway: "KB120", market: "Q" },
                { trade_date: "20261026", gateway: "KYOBO119", market: "K" },
              ],
            }
          : { days: [], heads: [], pieces: [] },
    });
    const res = await launchStatusOf(sb);
    expect(rpcCalls).toEqual([
      { fn: "launch_map_for_admin", args: { p_fire: "q16", p_days: null } },
      { fn: "launch_map_for_admin", args: { p_fire: "n0930", p_days: null } },
    ]);
    expect(chain).toEqual([]);
    expect(res).toEqual([
      {
        fire: "q16",
        days: 2,
        pieces: 4,
        heads: 2,
        byDay: [
          { trade_date: "20261023", gateway: "KB120", market: "Q", pieces: 1 },
          { trade_date: "20261026", gateway: "KB120", market: "Q", pieces: 2 },
          { trade_date: "20261026", gateway: "KYOBO119", market: "K", pieces: 1 },
        ],
      },
      { fire: "n0930", days: 0, pieces: 0, heads: 0, byDay: [] },
    ]);
  });
});

describe("reprojectLaunch — Wave B 재해석", () => {
  it("dry — rpc 0회 · kind 17·18 head count 만(날짜 범위 gte/lte)", async () => {
    const { sb, rpcCalls, chain } = fakeSbFull({}, 42);
    const res = await reprojectLaunch(sb, { from: "20261012", to: "20261026", apply: false });
    expect(res).toEqual({ mode: "dry", events: 42 });
    expect(rpcCalls).toHaveLength(0);
    expect(chain).toEqual([
      { method: "from", args: ["dma_strategy_events"] },
      { method: "select", args: ["seq", { count: "exact", head: true }] },
      { method: "in", args: ["kind", [17, 18]] },
      { method: "gte", args: ["trade_date", "2026-10-12"] },
      { method: "lte", args: ["trade_date", "2026-10-26"] },
    ]);
  });

  it("apply — launch_reproject 1회 · 반환 그대로", async () => {
    const { sb, rpcCalls, chain } = fakeSbFull({
      launch_reproject: () => ({ projected: 7, errors: [{ gateway: "KB120", seq: 3, error: "x" }] }),
    });
    const res = await reprojectLaunch(sb, { from: "20261012", apply: true });
    expect(rpcCalls).toEqual([{ fn: "launch_reproject", args: { p_from: "2026-10-12", p_to: null } }]);
    expect(chain).toEqual([]);
    expect(res).toEqual({ mode: "apply", projected: 7, errors: [{ gateway: "KB120", seq: 3, error: "x" }] });
  });
});
