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

import {
  applyLaunchBackfill,
  parseLaunchFile,
  planLaunchBackfill,
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
