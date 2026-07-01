import "dotenv/config";

/**
 * Phase 13 — home-sync worker 설정 (theme-sync config 의 reduced 변형).
 *
 * home-sync 는 외부 크롤링/프록시가 없다 (§Pattern 5): Supabase(top_movers⋈stock_quotes +
 * news_articles 읽기, home_theme_snapshots 쓰기) + Anthropic(Claude Haiku 1회 클러스터링)
 * 만 호출한다. 따라서 theme-sync 의 프록시 / 스크랩 소스 / 페이지네이션 계열 설정을 모두 제거하고
 * anthropic + supabase + 급등 튜닝(surge / news)만 남긴다.
 *
 * 시크릿(anthropicApiKey/supabaseServiceRoleKey)은 logger redact 로 구조화 로그에서 차단
 * (T-13-05). classifyModel 은 Claude Haiku 고정 (env override 는 테스트 안전망).
 */
export interface HomeSyncConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Claude Haiku 호출 (클러스터링 활성 시 필수). 부재 시 anthropic.ts 가 throw → 다음 cycle 재시도. */
  anthropicApiKey: string;
  /** "claude-haiku-4-5" 고정 (env override 는 테스트 안전망). */
  classifyModel: string;
  /** 급등 임계값 % (기본 20 고정) — 이 값 이상 등락 종목만 클러스터링 입력. */
  surgeThreshold: number;
  /** 급등 종목당 뉴스 최대 건수 (토큰/비용 상한). */
  newsPerStock: number;
  /** 급등 종목 최대 수 (Claude 입력 상한, 강세장 폭주 방지). */
  surgeMax: number;
  appVersion: string;
  logLevel: string;
}

function req(key: string): string {
  const v = process.env[key];
  if (!v || v.length === 0) throw new Error(`missing env: ${key}`);
  return v;
}

export function loadConfig(): HomeSyncConfig {
  return {
    supabaseUrl: req("SUPABASE_URL"),
    supabaseServiceRoleKey: req("SUPABASE_SERVICE_ROLE_KEY"),
    // Claude Haiku — ANTHROPIC_API_KEY 부재 시에도 config 로드는 동작하도록 옵셔널 get() + default ''.
    // 실제 클러스터링 호출 시 anthropic.ts 가 throw (getAnthropicClient).
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    classifyModel: process.env.HOME_SYNC_MODEL ?? "claude-haiku-4-5",
    surgeThreshold: Number(process.env.HOME_SYNC_SURGE_THRESHOLD ?? "20"),
    newsPerStock: Number(process.env.HOME_SYNC_NEWS_PER_STOCK ?? "5"),
    surgeMax: Number(process.env.HOME_SYNC_SURGE_MAX ?? "80"),
    appVersion: process.env.APP_VERSION ?? "dev",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
