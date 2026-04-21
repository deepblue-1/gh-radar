import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscussionSyncConfig } from "../config.js";
import { fetchDiscussions } from "../scraper/fetchDiscussions.js";
import {
  parseDiscussionsJson,
  type ParsedDiscussion,
} from "../scraper/parseDiscussionsJson.js";
import { mapToDiscussionRow, type DiscussionRow } from "./map.js";

/**
 * Phase 08 — 한 종목의 토론방 파이프라인:
 *   1. onRequest() 예산 체크 (false → skip)
 *   2. DB 의 max(scraped_at) 조회 → mode 결정
 *      - null OR > incrementalHours: backfill (다중 페이지, max=backfillMaxPages 또는 backfillDays 도달)
 *      - 그 외: incremental (1 페이지)
 *   3. fetchDiscussions loop (offset 추가) — Bright Data → Naver JSON API
 *   4. parseDiscussionsJson (replyDepth/postType/cleanbot 필터) per page
 *   5. cutoff (backfill: backfillDays / incremental: incrementalHours) + 최신순 정렬
 *   6. map → DiscussionRow[]
 *
 * 옵션 5 (JSON API) 채택 결과: body 는 contentSwReplacedButImg 에 이미 포함 → body fetch loop 불필요.
 *
 * onRequest() 는 페이지마다 호출 — 다중 페이지 fetch 가 예산을 초과하지 않도록 page-by-page 카운팅.
 */

export interface CollectResult {
  rows: DiscussionRow[];
  requests: number;
  filteredByCutoff: number;
  parsedCount: number;
  /** "backfill" 또는 "incremental" — 로깅용. */
  mode: "backfill" | "incremental";
}

/** DB 에서 해당 종목의 마지막 scraped_at 조회. 없으면 null. */
async function getLastScrapedAt(
  supabase: SupabaseClient,
  stockCode: string,
): Promise<Date | null> {
  const { data, error } = await supabase
    .from("discussions")
    .select("scraped_at")
    .eq("stock_code", stockCode)
    .order("scraped_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.scraped_at) return null;
  const ms = new Date(data.scraped_at as string).getTime();
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export async function collectDiscussions(
  proxy: AxiosInstance,
  cfg: DiscussionSyncConfig,
  supabase: SupabaseClient,
  stockCode: string,
  onRequest: () => Promise<boolean>,
): Promise<CollectResult> {
  // mode 결정
  const lastScrapedAt = await getLastScrapedAt(supabase, stockCode);
  const incrementalThresholdMs = cfg.discussionSyncIncrementalHours * 3600_000;
  const isStale =
    !lastScrapedAt || Date.now() - lastScrapedAt.getTime() > incrementalThresholdMs;
  const mode: "backfill" | "incremental" = isStale ? "backfill" : "incremental";

  // cutoff 결정 (mode 별)
  const cutoffMs =
    mode === "backfill"
      ? Date.now() - cfg.discussionSyncBackfillDays * 86400_000
      : Date.now() - cfg.discussionSyncIncrementalHours * 3600_000;

  // incremental 모드도 페이지 loop 적용 — 1시간 cron 사이 pageSize(100) 초과 누적 시 누락 방지.
  // cutoff (24h) 로 대부분 early-stop, maxPages 는 안전 상한 역할.
  const maxPages =
    mode === "backfill"
      ? cfg.discussionSyncBackfillMaxPages
      : cfg.discussionSyncIncrementalMaxPages;

  const fetchedAt = new Date().toISOString();
  const allParsed: ParsedDiscussion[] = [];
  let filteredByCutoff = 0;
  let requests = 0;
  let offset: string | undefined;
  let reachedCutoff = false;

  for (let page = 0; page < maxPages; page++) {
    const ok = await onRequest();
    if (!ok) break;

    const apiResp = await fetchDiscussions(
      { itemCode: stockCode, offset },
      { proxy, cfg },
    );
    requests++;

    const parsed: ParsedDiscussion[] = parseDiscussionsJson(apiResp, {
      stockCode,
      fetchedAt,
    });

    // cutoff 적용 + early stop 판단
    for (const p of parsed) {
      const ms = new Date(p.postedAt).getTime();
      if (!Number.isFinite(ms)) continue;
      if (ms < cutoffMs) {
        filteredByCutoff++;
        reachedCutoff = true; // 정렬이 desc 가정 — 한 번 cutoff 넘으면 이후도 모두 넘음
        continue;
      }
      allParsed.push(p);
    }

    // 다음 페이지 cursor — 없거나 빈 페이지면 종료
    const nextOffset = apiResp.lastOffset;
    if (!nextOffset || parsed.length === 0) break;
    if (reachedCutoff) break; // 더 진행해도 cutoff 이전 글만 나옴
    offset = nextOffset;
  }

  // 최신순 정렬 (desc by postedAt)
  allParsed.sort((a, b) => {
    const am = new Date(a.postedAt).getTime();
    const bm = new Date(b.postedAt).getTime();
    return bm - am;
  });

  const rows: DiscussionRow[] = [];
  for (const p of allParsed) {
    const row = mapToDiscussionRow(stockCode, p);
    if (row) rows.push(row);
  }

  return {
    rows,
    requests,
    filteredByCutoff,
    parsedCount: allParsed.length + filteredByCutoff,
    mode,
  };
}
