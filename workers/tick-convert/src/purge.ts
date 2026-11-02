/**
 * 90일 보존 정리(D-04) — nightly 실행 끝에 한 번(날짜가 0개 · 실패 날짜가 있어도).
 *
 *   ① 표 — RPC `tick_purge_old(p_keep_days)`: tick_grids · tick_convert_requests · tick_convert_runs 의 KST 오늘 − keepDays
 *      이전 행을 지우고 `{cutoff, grids, requests, runs, dates}` 를 돌려준다(`dates` = 세 표에서 지운 날짜 · 37-04).
 *   ② Storage 날짜 폴더 목록 — `grid/` 아래 cutoff 보다 이른 폴더. 메타 행이 없는 객체(업로드 뒤 메타 upsert 실패 · store.ts
 *      순서 계약)도 지우려고 ① 의 dates 와 합친다.
 *   ③ Storage 삭제 — 합친 날짜의 `grid/<D>/KRX` · `grid/<D>/NXT` 객체를 storage API 로 지운다(SQL 로 storage.objects 를 지우면
 *      실제 파일이 남는다 — limitup-sync purge 동형).
 *
 * 단계는 서로 막지 않는다(limitup-sync WR-B05 동형) — 하나가 실패해도 나머지를 돌린 뒤, 단계 사유를 ` | ` 로 이어 한 번 throw
 * (`partial` 에 끝난 단계 결과). nightly 는 그 오류를 실패로 세어 종료 1(알림 정책이 정리 실패를 잡는다).
 * cutoff 는 RPC 와 같은 식(KST 오늘 − keepDays · `date < cutoff`)이다 — archive.ts `kstYmdDaysAgo`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { kstYmdDaysAgo } from "./archive";
import { createMeta, type PurgeOut } from "./meta";
import type { GridStore } from "./store";

export type PurgeResult = {
  /** ① 결과 — 그 단계가 실패하면 null. */
  tables: PurgeOut | null;
  /** ③ 에서 지운 날짜(오름차순). */
  storageDates: string[];
  /** ③ 에서 지운 객체 수. */
  removed: number;
};

export async function purgeOld(sb: SupabaseClient, store: GridStore, keepDays: number, now: Date): Promise<PurgeResult> {
  const out: PurgeResult = { tables: null, storageDates: [], removed: 0 };
  const errs: string[] = [];
  const step = async (run: () => Promise<void>): Promise<void> => {
    try {
      await run();
    } catch (e) {
      errs.push(e instanceof Error ? e.message : String(e));
    }
  };
  const cutoff = kstYmdDaysAgo(now, keepDays);
  const dates = new Set<string>();

  await step(async () => {
    out.tables = await createMeta(sb).purgeOld(keepDays);
    for (const d of out.tables.dates) dates.add(d);
  });

  await step(async () => {
    for (const d of await store.listDates()) if (d < cutoff) dates.add(d);
  });

  await step(async () => {
    const list = [...dates].sort();
    if (list.length === 0) return;
    out.removed = await store.removeDates(list);
    out.storageDates = list;
  });

  if (errs.length > 0) throw Object.assign(new Error(errs.join(" | ")), { partial: out });
  return out;
}
