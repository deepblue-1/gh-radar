import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../errors.js";

/**
 * Phase 37 (D-08) — 당일 바이트 경로(`GET /api/ticks/live`) 게이트 · **사용자별 60초 프로세스 메모리 캐시**.
 *
 * 브라우저는 당일 종목을 수 초마다 폴링한다(37-19). 폴링마다 게이트 RPC 를 부르면 Cloud Run(VPC all-traffic egress) →
 * Supabase 왕복이 응답 지연을 지배한다(프로젝트 메모리 「Cloud Run 왕복 비용」). 그래서 RPC `tick_access_for_user`(37-04 ·
 * `dma_visible_accounts` 존재 검사)의 답을 사용자별로 60초 들고 있는다 — 60초 안 폴링 N 회 = RPC 1회.
 *
 * - access true / false 둘 다 캐시한다(매핑 해제는 최대 60초 늦게 반영 — Admin 매핑 쓰기는 드물고, 과거 경로는 매 요청 RPC 라 즉시).
 * - RPC 오류 · 모양 위반은 **캐시하지 않고** throw(500 `DB_ERROR`) — 일시 장애가 60초 거부로 굳지 않게.
 * - 같은 사용자의 동시 요청은 진행 중 RPC 하나를 같이 기다린다(첫 폴링 몰림에도 RPC 1회).
 * - 캐시는 인스턴스 메모리다(Cloud Run 인스턴스마다 따로) — 정합성은 60초 TTL 이 상한을 준다.
 */

export const TICK_GATE_TTL_MS_DEFAULT = 60_000;

/** 만료 항목 정리 문턱 — 사용자 수만큼만 자라지만, 오래 떠 있는 인스턴스에서 만료 항목이 쌓이지 않게. */
const SWEEP_AT = 1_000;

const FAIL = "틱 전문 뷰어 조회에 실패했습니다.";

export type TickGateCache = {
  /** 사용자가 당일 바이트 경로를 볼 수 있는가 — 60초 캐시. RPC 실패는 throw(ApiError 500). */
  check(sb: SupabaseClient, userId: string): Promise<boolean>;
};

export function createTickGateCache(opts: { ttlMs?: number; now?: () => number } = {}): TickGateCache {
  const ttlMs = opts.ttlMs ?? TICK_GATE_TTL_MS_DEFAULT;
  const now = opts.now ?? Date.now;
  const entries = new Map<string, { access: boolean; exp: number }>();
  const inflight = new Map<string, Promise<boolean>>();

  function sweep(t: number): void {
    if (entries.size < SWEEP_AT) return;
    for (const [k, e] of entries) if (e.exp <= t) entries.delete(k);
  }

  async function fetchAccess(sb: SupabaseClient, userId: string): Promise<boolean> {
    const { data, error } = await sb.rpc("tick_access_for_user", { p_user_id: userId });
    if (error) {
      throw new ApiError(500, "DB_ERROR", FAIL, { code: error.code, message: error.message });
    }
    const access = (data as { access?: unknown } | null)?.access;
    if (typeof access !== "boolean") {
      throw new ApiError(500, "DB_ERROR", FAIL, { reason: "tick_access_for_user.access 모양 위반", type: typeof access });
    }
    return access;
  }

  return {
    async check(sb, userId) {
      const t = now();
      const hit = entries.get(userId);
      if (hit && hit.exp > t) return hit.access;

      const pending = inflight.get(userId);
      if (pending) return pending;

      const p = fetchAccess(sb, userId)
        .then((access) => {
          sweep(now());
          entries.set(userId, { access, exp: now() + ttlMs });
          return access;
        })
        .finally(() => inflight.delete(userId));
      inflight.set(userId, p);
      return p;
    },
  };
}
