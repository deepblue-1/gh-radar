import type { SupabaseClient } from "@supabase/supabase-js";
import { SHORT_CODE_RE, isEtpProduct } from "@gh-radar/shared";
import type { StockMeta } from "./classify.js";
import type { TargetInfo } from "./scheduler.js";

/**
 * Phase 41-08 — 종목별 조회 대상 · 종목 정보(41-02 RPC).
 *
 * - D-05: 대상 = 최신 급등 상위 100 ∪ 관심종목 ∪ 최근 10분 안 조회 등록(최근 순 200) —
 *   `kis_news_targets_list(100, 10, 200)` 한 번(jsonb 1값 · 1000행 절단 없음).
 * - ETP 종목(ETF · ETN · ELW · 지수연동)은 대상에서 뺀다 — 판정은 shared `isEtpProduct` 단일 정의 ·
 *   종목 정보(`kis_news_stock_meta`)의 이름 · 증권그룹으로.
 * - 운영 기준 ③: 웹 · gh-trade 조회는 등록만 한다. 실제 호출 수는 이 목록 크기 · 초당 상한 · 고정 주기로만 정해진다.
 */

export const TARGET_TOP = 100;
export const TARGET_IDLE_MINUTES = 10;
export const TARGET_REGISTERED_CAP = 200;

interface TargetRow {
  code?: unknown;
  reasons?: unknown;
  rank?: unknown;
  last_requested_at?: unknown;
  last_collected_at?: unknown;
}

function msOrNull(v: unknown): number | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

function pgError(name: string, e: unknown): Error {
  const o = (e ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof o.code === "string" ? ` (${o.code})` : "";
  return new Error(`${name} 실패: ${typeof o.message === "string" ? o.message : "unknown"}${code}`);
}

export async function loadTargets(
  supabase: SupabaseClient,
  meta: ReadonlyMap<string, StockMeta>,
): Promise<TargetInfo[]> {
  const { data, error } = await supabase.rpc("kis_news_targets_list", {
    p_top: TARGET_TOP,
    p_idle_minutes: TARGET_IDLE_MINUTES,
    p_registered_cap: TARGET_REGISTERED_CAP,
  });
  if (error) throw pgError("kis_news_targets_list", error);
  if (!Array.isArray(data)) throw new Error("kis_news_targets_list 결과 모양이 다르다(배열 아님)");

  const out: TargetInfo[] = [];
  for (const r of data as TargetRow[]) {
    const code = typeof r?.code === "string" ? r.code.trim().toUpperCase() : "";
    if (!SHORT_CODE_RE.test(code)) continue;
    const m = meta.get(code);
    if (m && isEtpProduct(m.name, m.group)) continue;
    out.push({
      code,
      reasons: Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === "string") : [],
      rank: typeof r.rank === "number" && Number.isFinite(r.rank) ? r.rank : null,
      lastRequestedAt: msOrNull(r.last_requested_at),
      lastCollectedAt: msOrNull(r.last_collected_at),
    });
  }
  return out;
}

/** `kis_news_stock_meta()` {코드: {n, g}} → Map<코드, {name, group}> */
export async function loadStockMeta(supabase: SupabaseClient): Promise<Map<string, StockMeta>> {
  const { data, error } = await supabase.rpc("kis_news_stock_meta");
  if (error) throw pgError("kis_news_stock_meta", error);
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("kis_news_stock_meta 결과 모양이 다르다(객체 아님)");
  }
  const out = new Map<string, StockMeta>();
  for (const [code, v] of Object.entries(data as Record<string, { n?: unknown; g?: unknown } | null>)) {
    const name = typeof v?.n === "string" ? v.n : "";
    const group = typeof v?.g === "string" ? v.g : null;
    out.set(code, { name, group });
  }
  return out;
}
