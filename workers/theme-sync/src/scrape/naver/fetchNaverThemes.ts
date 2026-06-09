import type { ThemeSyncConfig } from "../../config";
import type { ThemeScrape } from "../types";
import { parseThemeList } from "./parseThemeList";
import { parseThemeDetail } from "./parseThemeDetail";
import { ThemeScrapeValidationError } from "../../proxy/errors";
import { logger } from "../../logger";

/**
 * 네이버 금융 테마 스크랩 (RESEARCH §Pattern 2 — 실측 검증).
 *
 * 1) 목록 페이지네이션: GET /sise/theme.naver?page={N}, EUC-KR (fetchFn 이 iconv 디코딩).
 *    page 1..maxPages. 직전 page 와 theme ID 집합이 동일하면 stop (Pitfall 6 무한루프/clamp 방지).
 * 2) 각 테마 상세: GET /sise/sise_group_detail.naver?type=theme&no={ID} → 종목 code + 편입사유.
 *
 * fetchFn 은 fetchWithFallback(encoding='euc-kr') 바인딩 — 직접 fetch 403/429 시 프록시 폴백.
 * Pitfall 10: 목록이 0 테마면 비정상(차단/마크업 변경) → throw (MIN_EXPECTED 가드).
 */

const NAVER_MIN_EXPECTED_THEMES = 1;

export interface FetchNaverDeps {
  cfg: ThemeSyncConfig;
  /** EUC-KR HTML 을 디코딩해 반환하는 fetch (fetchWithFallback euc-kr 바인딩). */
  fetchFn: (url: string) => Promise<string>;
}

export async function fetchNaverThemes(
  deps: FetchNaverDeps,
): Promise<ThemeScrape[]> {
  const { cfg, fetchFn } = deps;
  const base = cfg.naverThemeBase;

  // 1) 목록 페이지네이션 — theme no → name (dedupe 전역).
  const themeMap = new Map<string, string>();
  let prevPageKeys = "";
  for (let page = 1; page <= cfg.themeSyncMaxPages; page++) {
    const html = await fetchFn(`${base}/sise/theme.naver?page=${page}`);
    const items = parseThemeList(html);
    if (items.length === 0) break;
    const pageKeys = items
      .map((i) => i.no)
      .sort()
      .join(",");
    // 직전 page 와 theme ID 집합 동일 → clamp 된 마지막 페이지 반복 → stop (Pitfall 6).
    if (pageKeys === prevPageKeys) break;
    prevPageKeys = pageKeys;
    for (const it of items) {
      if (!themeMap.has(it.no)) themeMap.set(it.no, it.name);
    }
  }

  if (themeMap.size < NAVER_MIN_EXPECTED_THEMES) {
    throw new ThemeScrapeValidationError(
      `네이버 테마 목록 0개 — 차단 또는 마크업 변경 의심 (aborting, Pitfall 10)`,
    );
  }

  // 2) 각 테마 상세 → 종목 매핑.
  const out: ThemeScrape[] = [];
  for (const [no, name] of themeMap) {
    const detailHtml = await fetchFn(
      `${base}/sise/sise_group_detail.naver?type=theme&no=${no}`,
    );
    const stocks = parseThemeDetail(detailHtml);
    if (stocks.length === 0) {
      // 빈 테마(상장폐지 일소 등)는 per-theme skip — 전체 중단하지 않음.
      logger.warn({ no, name }, "네이버 테마 상세 종목 0개 — skip");
      continue;
    }
    out.push({
      name,
      description: null,
      aliases: [],
      stocks: stocks.map((s) => ({ code: s.code, reason: s.reason })),
      source: "naver",
    });
  }
  return out;
}
