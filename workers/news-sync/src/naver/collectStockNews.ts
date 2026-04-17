import type { AxiosInstance } from "axios";
import { parsePubDate } from "@gh-radar/shared";
import {
  NAVER_MAX_DISPLAY,
  NAVER_MAX_START,
  searchNews,
  type NaverNewsItem,
} from "./searchNews.js";

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
    const page = await searchNews(client, query, {
      start,
      display: NAVER_MAX_DISPLAY,
    });
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
