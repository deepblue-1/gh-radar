import type { ThemeSyncConfig } from "../../config";
import type { ThemeScrape } from "../types";
import { parseThemeList } from "./parseThemeList";
import { parseThemeDetail, type NaverThemeStock } from "./parseThemeDetail";
import { ThemeScrapeValidationError } from "../../proxy/errors";
import { logger } from "../../logger";

/**
 * 네이버 증권 테마 스크랩 — stock.naver.com SPA 가 쓰는 공개 JSON API (UTF-8).
 *
 * 레거시 finance.naver.com/sise/theme.naver · sise_group_detail.naver 는 2026-09-10~11
 * 폐지되어 stock.naver.com SPA 로 302 된다(서버 렌더 테이블 없음). 테마 no 는 레거시와 동일.
 *
 * 1) 목록: GET /api/stocks/theme?page={N}&pageSize=100 → 수집 수가 totalCount 에 닿거나
 *    빈 페이지·직전과 같은 ID 집합(Pitfall 6 clamp)이면 stop. maxPages hard cap.
 * 2) 상세: GET /api/stocks/theme/{no}?page={N}&pageSize=100 → 종목 code + 편입사유.
 *    100 종목 초과 테마(예: 2차전지 143)가 있어 상세도 페이지네이션 — 잘리면 upsert 가
 *    101번째 이후 종목을 retire 해버린다.
 *
 * fetchFn 은 fetchWithFallback(encoding='utf-8') 바인딩 — 직접 fetch 403/429 시 프록시 폴백.
 * Pitfall 10: 목록이 0 테마면 비정상 → throw (MIN_EXPECTED 가드).
 */

const NAVER_MIN_EXPECTED_THEMES = 1;
/** 네이버 API 페이지 크기 — SPA 기본값과 같은 100 (그 이상은 미검증이라 페이지네이션으로 처리). */
export const NAVER_PAGE_SIZE = 100;

export interface FetchNaverDeps {
  cfg: ThemeSyncConfig;
  /** UTF-8 JSON 본문을 반환하는 fetch (fetchWithFallback utf-8 바인딩). */
  fetchFn: (url: string) => Promise<string>;
}

/** 테마 1개의 전체 종목 — 상세 페이지네이션 (dedupe by code). */
async function fetchThemeStocks(
  deps: FetchNaverDeps,
  no: string,
): Promise<NaverThemeStock[]> {
  const { cfg, fetchFn } = deps;
  const byCode = new Map<string, NaverThemeStock>();
  let totalCount = 0;
  for (let page = 1; page <= cfg.themeSyncMaxPages; page++) {
    const body = await fetchFn(
      `${cfg.naverStockApiBase}/api/stocks/theme/${no}?page=${page}&pageSize=${NAVER_PAGE_SIZE}`,
    );
    const { stocks, totalCount: total } = parseThemeDetail(body);
    totalCount = total;
    let added = 0;
    for (const s of stocks) {
      if (byCode.has(s.code)) continue;
      byCode.set(s.code, s);
      added++;
    }
    // 전부 수집 / 빈 페이지·clamp 반복(새 code 없음) → stop.
    if (byCode.size >= totalCount || added === 0) break;
  }
  if (byCode.size < totalCount) {
    logger.warn(
      { no, collected: byCode.size, totalCount },
      "네이버 테마 상세 수집 수 < totalCount — 페이지 상한 또는 API 불일치",
    );
  }
  return [...byCode.values()];
}

export async function fetchNaverThemes(
  deps: FetchNaverDeps,
): Promise<ThemeScrape[]> {
  const { cfg, fetchFn } = deps;
  const base = cfg.naverStockApiBase;

  // 1) 목록 페이지네이션 — theme no → name (dedupe 전역).
  const themeMap = new Map<string, string>();
  let prevPageKeys = "";
  let totalCount = 0;
  for (let page = 1; page <= cfg.themeSyncMaxPages; page++) {
    const body = await fetchFn(
      `${base}/api/stocks/theme?page=${page}&pageSize=${NAVER_PAGE_SIZE}`,
    );
    const { items, totalCount: total } = parseThemeList(body);
    totalCount = total;
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
    if (themeMap.size >= totalCount) break;
  }

  if (themeMap.size < NAVER_MIN_EXPECTED_THEMES) {
    throw new ThemeScrapeValidationError(
      `네이버 테마 목록 0개 — 차단 또는 API 응답 변경 의심 (aborting, Pitfall 10)`,
    );
  }
  if (themeMap.size < totalCount) {
    logger.warn(
      { collected: themeMap.size, totalCount },
      "네이버 테마 목록 수집 수 < totalCount — 페이지 상한 또는 API 불일치",
    );
  }

  // 2) 각 테마 상세 → 종목 매핑.
  //    상세 1건의 응답 검증 실패(목록~상세 사이 테마 삭제 등)는 per-theme skip — 하나 때문에
  //    source 전체가 실패하면 withRetry 가 ~270 요청을 통째로 되풀이한다(5원칙 #4 두드림).
  //    전부 실패하면 API 변경으로 보고 throw (Pitfall 10).
  const out: ThemeScrape[] = [];
  let invalidDetails = 0;
  for (const [no, name] of themeMap) {
    let stocks: NaverThemeStock[];
    try {
      stocks = await fetchThemeStocks(deps, no);
    } catch (err) {
      if (!(err instanceof ThemeScrapeValidationError)) throw err;
      invalidDetails++;
      logger.warn(
        { no, name, err: err.message },
        "네이버 테마 상세 응답 검증 실패 — skip",
      );
      continue;
    }
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
  if (invalidDetails === themeMap.size) {
    throw new ThemeScrapeValidationError(
      `네이버 테마 상세 ${invalidDetails}건 전부 응답 검증 실패 — API 변경 의심 (aborting, Pitfall 10)`,
    );
  }
  if (invalidDetails > 0) {
    logger.warn(
      { invalidDetails, themes: themeMap.size },
      "네이버 테마 상세 일부 응답 검증 실패 — 해당 테마 skip",
    );
  }
  return out;
}
