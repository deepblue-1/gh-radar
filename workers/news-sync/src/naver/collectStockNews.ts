import type { AxiosInstance } from "axios";
import { parsePubDate } from "@gh-radar/shared";
import {
  NAVER_MAX_DISPLAY,
  NAVER_MAX_START,
  NaverRateLimitError,
  searchNews,
  type NaverNewsItem,
} from "./searchNews.js";

/**
 * Phase 07.2 — page 호출을 429 backoff retry 로 감싼다.
 * NaverRateLimitError 만 retry (sleep 250ms → 500ms, 최대 2회).
 * 3회 시도 모두 429 → propagate (per-stock 루프에서 종목 skip).
 * 다른 에러는 즉시 propagate.
 *
 * NOTE (incrementUsage): 이 함수 내부에서는 onPage 를 호출하지 않는다.
 * budget 카운터는 페이지 루프가 성공 반환을 받은 뒤 1회만 증가 (retry 중간 증가 금지).
 * Naver 가 429 를 돌려준 호출은 Naver 쪽 quota 카운터에도 증가하지 않는 것이 정책.
 */
async function fetchPageWithRateLimitBackoff(
  client: AxiosInstance,
  query: string,
  start: number,
  display: number,
): Promise<NaverNewsItem[]> {
  const delaysMs = [250, 500]; // 2 retries after first failure
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await searchNews(client, query, { start, display });
    } catch (err: unknown) {
      if (err instanceof NaverRateLimitError) {
        lastErr = err;
        if (attempt < delaysMs.length) {
          await new Promise((r) => setTimeout(r, delaysMs[attempt]));
          continue;
        }
        throw err; // exhausted retries — propagate
      }
      throw err; // non-rate-limit errors are not retried
    }
  }
  throw lastErr ?? new NaverRateLimitError();
}

export interface CollectOpts {
  /** 이전 수집의 MAX(published_at) — 없으면 첫 수집 (null) */
  lastSeenIso: string | null;
  /** 첫 수집 시 7일 컷오프 ISO. 증분 수집이어도 폴백으로 사용 */
  firstCutoffIso: string;
  /** page 하나 호출 직후 실행되는 콜백 — budget 증가/abort 판정. false 반환 시 루프 즉시 종료 */
  onPage: () => Promise<boolean>;
}

export interface CollectResult {
  items: NaverNewsItem[];
  pages: number;
  stoppedBy: "cutoff" | "empty" | "api-limit" | "budget";
}

/**
 * R7: display=100, start=1→101→201→... 페이지네이션 루프.
 *
 * 종료 조건:
 *   (1) 증분: 페이지의 **youngest** pubDate 가 lastSeenIso 이하 → cutoff 도달
 *   (2) 첫 수집: 페이지의 youngest 가 firstCutoffIso(7일 전) 이전 → cutoff
 *   (3) API 상한: start > 1000 → api-limit
 *   (4) 응답 빈 배열 또는 page.length < NAVER_MAX_DISPLAY → empty (마지막 페이지)
 *   (5) onPage 가 false → budget (abort 시그널)
 */
export async function collectStockNews(
  client: AxiosInstance,
  query: string,
  opts: CollectOpts,
): Promise<CollectResult> {
  const cutoffIso = opts.lastSeenIso ?? opts.firstCutoffIso;
  const items: NaverNewsItem[] = [];
  let pages = 0;
  let start = 1;
  let stoppedBy: CollectResult["stoppedBy"] = "empty";

  while (start <= NAVER_MAX_START) {
    const page = await fetchPageWithRateLimitBackoff(
      client,
      query,
      start,
      NAVER_MAX_DISPLAY,
    );
    pages++;

    const shouldContinue = await opts.onPage();
    if (!shouldContinue) {
      stoppedBy = "budget";
      break;
    }

    if (page.length === 0) {
      stoppedBy = "empty";
      break;
    }

    let hitCutoff = false;
    for (const it of page) {
      const iso = parsePubDate(it.pubDate);
      if (!iso) continue;
      if (iso <= cutoffIso) {
        hitCutoff = true;
        continue;
      }
      items.push(it);
    }

    if (hitCutoff) {
      stoppedBy = "cutoff";
      break;
    }
    if (page.length < NAVER_MAX_DISPLAY) {
      stoppedBy = "empty";
      break;
    }

    start += NAVER_MAX_DISPLAY;
  }

  if (start > NAVER_MAX_START) stoppedBy = "api-limit";
  return { items, pages, stoppedBy };
}
