import "dotenv/config";

/**
 * Phase 10 — theme-sync worker 설정.
 *
 * 2-tier 스크랩(네이버 금융 테마 EUC-KR HTML + 알파스퀘어 공개 JSON API) →
 * 직접 fetch → 403/429 차단 시 Bright Data Web Unlocker 폴백(discussion-sync 선례) →
 * 보수적 이름 정규화 병합 → themes/theme_stocks service_role UPSERT.
 *
 * 시크릿(brightdataApiKey/anthropicApiKey/supabaseServiceRoleKey)은 logger redact
 * (T-10-03-02) 로 구조화 로그에서 차단. AI 보강(anthropic*)은 Plan 06 이 사용 —
 * 본 plan 에서는 config 에 자리만 둔다.
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
  /** 네이버 금융 테마 base (RESEARCH §Pattern 2, EUC-KR). */
  naverThemeBase: string;
  /** 네이버 목록 페이지네이션 hard cap (Pitfall 6 무한루프 방지). */
  themeSyncMaxPages: number;
  /** 알파스퀘어 수집 카테고리 화이트리스트 (부분 캐싱, 5원칙 #5 — 전체 451 덤프 금지). */
  alphaCategories: string[];
  /**
   * Plan 06 (AI 보강) — Claude Haiku 4.5 기반 신규 테마 발굴 + 오분류 교정.
   *   anthropicApiKey: Claude Haiku 호출 (classify 활성 시 필수).
   *   classifyEnabled: AI 보강 kill-switch (default false — POC 게이트 통과 후 활성화).
   *   classifyConcurrency: p-limit 동시 Claude 호출 수.
   *   classifyModel: "claude-haiku-4-5" 고정 (env override 는 테스트 안전망).
   *   discoverNewsLookbackDays: 발굴 입력 — 최근 N일 news_articles(published_at).
   *   discoverNewsMax: 발굴 입력 뉴스 최대 건수 (토큰/비용 상한).
   *   discoverExistingThemesMax: 중복 발굴 방지용 기존 시스템 테마 조회 상한.
   */
  anthropicApiKey: string;
  classifyEnabled: boolean;
  classifyConcurrency: number;
  classifyModel: string;
  discoverNewsLookbackDays: number;
  discoverNewsMax: number;
  discoverExistingThemesMax: number;
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
    naverThemeBase:
      process.env.NAVER_THEME_BASE ?? "https://finance.naver.com",
    themeSyncMaxPages: Number(process.env.THEME_SYNC_MAX_PAGES ?? "10"),
    alphaCategories: csv(process.env.THEME_SYNC_ALPHA_CATEGORIES, [
      "정치",
      "트렌드",
    ]),
    // Plan 06 (AI 보강) — 본 plan 미사용. ANTHROPIC_API_KEY 부재 시에도 cycle 동작하도록
    // req() 가 아닌 옵셔널 get() 으로 읽고 default ''. classify_enabled default false.
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    classifyEnabled:
      (process.env.THEME_SYNC_CLASSIFY_ENABLED ?? "false") === "true",
    classifyConcurrency: Number(
      process.env.THEME_SYNC_CLASSIFY_CONCURRENCY ?? "5",
    ),
    classifyModel:
      process.env.THEME_SYNC_CLASSIFY_MODEL ?? "claude-haiku-4-5",
    discoverNewsLookbackDays: Number(
      process.env.THEME_SYNC_DISCOVER_NEWS_LOOKBACK_DAYS ?? "1",
    ),
    discoverNewsMax: Number(process.env.THEME_SYNC_DISCOVER_NEWS_MAX ?? "300"),
    discoverExistingThemesMax: Number(
      process.env.THEME_SYNC_DISCOVER_EXISTING_THEMES_MAX ?? "2000",
    ),
    appVersion: process.env.APP_VERSION ?? "dev",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
