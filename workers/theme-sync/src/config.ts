import "dotenv/config";

/**
 * Phase 10 — theme-sync worker 설정.
 *
 * 2-tier 스크랩(네이버 증권 테마 JSON API + 알파스퀘어 공개 JSON API) →
 * 직접 fetch → 403/429 차단 시 Bright Data Web Unlocker 폴백(discussion-sync 선례) →
 * 보수적 이름 정규화 병합 → themes/theme_stocks service_role UPSERT.
 *
 * 시크릿(brightdataApiKey/supabaseServiceRoleKey)은 logger redact
 * (T-10-03-02) 로 구조화 로그에서 차단.
 */
export interface ThemeSyncConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Bright Data Web Unlocker — 직접 fetch 403/429 시 폴백 (D-07). */
  brightdataApiKey: string;
  brightdataZone: string;
  brightdataUrl: string;
  /** 알파스퀘어 공개 JSON API base (RESEARCH §Pattern 3). */
  alphaApiBase: string;
  /**
   * 네이버 증권 JSON API base (UTF-8). 테마 목록/상세 = /api/stocks/theme[/{no}].
   * 레거시 finance.naver.com 테마 페이지는 2026-09-10~11 폐지(302 → stock.naver.com SPA).
   */
  naverStockApiBase: string;
  /** 네이버 목록 페이지네이션 hard cap (Pitfall 6 무한루프 방지). */
  themeSyncMaxPages: number;
  /** 알파스퀘어 수집 카테고리 화이트리스트 (부분 캐싱, 5원칙 #5 — 전체 451 덤프 금지). */
  alphaCategories: string[];
  appVersion: string;
  logLevel: string;
}

function req(key: string): string {
  const v = process.env[key];
  if (!v || v.length === 0) throw new Error(`missing env: ${key}`);
  return v;
}

/** 콤마 구분 env → 트림된 비어있지 않은 토큰 배열 (없으면 fallback). */
function csv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : fallback;
}

export function loadConfig(): ThemeSyncConfig {
  return {
    supabaseUrl: req("SUPABASE_URL"),
    supabaseServiceRoleKey: req("SUPABASE_SERVICE_ROLE_KEY"),
    brightdataApiKey: req("BRIGHTDATA_API_KEY"),
    brightdataZone: process.env.BRIGHTDATA_ZONE ?? "gh_radar_naver",
    brightdataUrl:
      process.env.BRIGHTDATA_URL ?? "https://api.brightdata.com/request",
    alphaApiBase:
      process.env.ALPHA_API_BASE ?? "https://api.alphasquare.co.kr",
    naverStockApiBase:
      process.env.NAVER_STOCK_API_BASE ?? "https://m.stock.naver.com",
    themeSyncMaxPages: Number(process.env.THEME_SYNC_MAX_PAGES ?? "10"),
    alphaCategories: csv(process.env.THEME_SYNC_ALPHA_CATEGORIES, [
      "정치",
      "트렌드",
    ]),
    appVersion: process.env.APP_VERSION ?? "dev",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
