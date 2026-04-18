import type { AxiosInstance } from "axios";
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
 *   2. fetchDiscussions (Bright Data → Naver JSON API)
 *   3. parseDiscussionsJson (replyDepth/postType/cleanbot 필터 + ParsedDiscussion[])
 *   4. 24h cutoff + 최신순 정렬
 *   5. map → DiscussionRow[]
 *
 * 옵션 5 (JSON API) 채택 결과: body 는 contentSwReplacedButImg 에 이미 포함 → body fetch loop 불필요.
 */

export interface CollectResult {
  rows: DiscussionRow[];
  requests: number;
  filteredByCutoff: number;
  parsedCount: number;
}

export async function collectDiscussions(
  proxy: AxiosInstance,
  cfg: DiscussionSyncConfig,
  stockCode: string,
  onRequest: () => Promise<boolean>,
): Promise<CollectResult> {
  const ok = await onRequest();
  if (!ok) {
    return { rows: [], requests: 0, filteredByCutoff: 0, parsedCount: 0 };
  }

  const fetchedAt = new Date().toISOString();
  const apiResp = await fetchDiscussions(
    { itemCode: stockCode },
    { proxy, cfg },
  );
  const parsed: ParsedDiscussion[] = parseDiscussionsJson(apiResp, {
    stockCode,
    fetchedAt,
  });

  // 24h cutoff 필터
  const cutoffMs = Date.now() - 24 * 3600_000;
  const recent: ParsedDiscussion[] = [];
  let filteredByCutoff = 0;
  for (const p of parsed) {
    const ms = new Date(p.postedAt).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms < cutoffMs) {
      filteredByCutoff++;
      continue;
    }
    recent.push(p);
  }
  // 최신순 정렬 (desc by postedAt)
  recent.sort((a, b) => {
    const am = new Date(a.postedAt).getTime();
    const bm = new Date(b.postedAt).getTime();
    return bm - am;
  });

  const rows: DiscussionRow[] = [];
  for (const p of recent) {
    const row = mapToDiscussionRow(stockCode, p);
    if (row) rows.push(row);
  }

  return {
    rows,
    requests: 1,
    filteredByCutoff,
    parsedCount: parsed.length,
  };
}
