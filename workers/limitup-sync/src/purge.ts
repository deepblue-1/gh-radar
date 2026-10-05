/**
 * run 끝 보존 정리(D-16 · D-19 · D-08) — 날짜가 0개인 run 에도 1회.
 *
 *   ① `limitup_purge_old(p_keep_days, p_alloc_keep_days)` — 표 5 · 파생 2 · 이력 · stage 는 KST 오늘 − keepDays 이전,
 *      member_alloc 만 − allocKeepDays 이전(마이그레이션 20261006090300).
 *   ② Storage `limitup-grid/grid/<YYYYMMDD>/` 폴더 중 같은 cutoff 보다 이른 날짜의 객체 삭제(storage API — SQL 로
 *      storage.objects 를 지우면 실제 파일이 남는다). 한 폴더 목록은 1,000개까지 — 남으면 그 폴더는 여전히 오래된
 *      날짜라 다음 run 이 마저 지운다. GCS 사본은 지우지 않는다(재적재 가능).
 *   ③ `dma_strategy_events_purge_limit_feature(p_keep_days)` — kind 15 만 kind15KeepDays(28-02).
 *
 * 오류는 단계 · 메시지를 담아 throw — 그날 적재는 이미 끝났으므로 dispatch 가 사유를 남기고 main 이 종료 1
 * (알림 정책이 정리 실패를 잡는다).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRID_BUCKET } from "./grid";

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LIST_LIMIT = 1000;
const DATE_RE = /^\d{8}$/;

/** KST 기준 `now − days` 날짜의 `YYYYMMDD`. 적재 창(`>= since`)과 정리 경계(`< cutoff`)가 같은 식을 쓴다. */
export function kstYmdDaysAgo(now: Date, days: number): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const day0 = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return new Date(day0 - days * DAY_MS).toISOString().slice(0, 10).replace(/-/g, "");
}

export type PurgeConfig = { keepDays: number; allocKeepDays: number; kind15KeepDays: number; now: Date };

export type PurgeResult = {
  /** limitup_purge_old 반환 `{ cutoff, alloc_cutoff, deleted: { 표: 지운 수 } }`. */
  tables: unknown;
  /** 객체를 지운 Storage 날짜 폴더(오름차순). */
  storageDates: string[];
  /** kind 15 지운 행 수. */
  kind15: number;
};

export async function purgeOld(sb: SupabaseClient, cfg: PurgeConfig): Promise<PurgeResult> {
  const { data: tables, error } = await sb.rpc("limitup_purge_old", {
    p_keep_days: cfg.keepDays,
    p_alloc_keep_days: cfg.allocKeepDays,
  });
  if (error) throw new Error(`limitup_purge_old: ${error.message}`);

  const cutoff = kstYmdDaysAgo(cfg.now, cfg.keepDays);
  const bucket = sb.storage.from(GRID_BUCKET);
  const { data: dirs, error: listErr } = await bucket.list("grid", { limit: LIST_LIMIT });
  if (listErr) throw new Error(`storage list ${GRID_BUCKET}/grid: ${listErr.message}`);
  const old = (dirs ?? [])
    .map((d) => d.name)
    .filter((n) => DATE_RE.test(n) && n < cutoff)
    .sort();
  for (const d of old) {
    const { data: files, error: fe } = await bucket.list(`grid/${d}`, { limit: LIST_LIMIT });
    if (fe) throw new Error(`storage list ${GRID_BUCKET}/grid/${d}: ${fe.message}`);
    const paths = (files ?? []).map((f) => `grid/${d}/${f.name}`);
    if (paths.length === 0) continue;
    const { error: re } = await bucket.remove(paths);
    if (re) throw new Error(`storage remove ${GRID_BUCKET}/grid/${d}: ${re.message}`);
  }

  const { data: k15, error: ke } = await sb.rpc("dma_strategy_events_purge_limit_feature", {
    p_keep_days: cfg.kind15KeepDays,
  });
  if (ke) throw new Error(`dma_strategy_events_purge_limit_feature: ${ke.message}`);
  const kind15 = Number(k15);
  if (k15 === null || k15 === undefined || !Number.isInteger(kind15)) throw new Error(`dma_strategy_events_purge_limit_feature: bad count ${String(k15)}`);

  return { tables, storageDates: old, kind15 };
}
