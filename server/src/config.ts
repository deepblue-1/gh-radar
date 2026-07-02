export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  logLevel: string;
  appVersion: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  corsAllowedOrigins: string;
  // Kiwoom — Phase 09.1 신규 (D-17 server 키움 통합, D-19 worker 와 동일 token row 공유)
  kiwoomBaseUrl: string;
  kiwoomAppkey: string;
  kiwoomSecretkey: string;
  kiwoomTokenType: string;
  naverClientId: string | undefined;
  naverClientSecret: string | undefined;
  naverBaseUrl: string;
  naverDailyBudget: number;
  // Phase 08 — Bright Data Web Unlocker (on-demand discussion refresh).
  // 모두 optional. 미설정 시 server.ts 가 brightdataClient=undefined 로 시작하고
  // POST /api/stocks/:code/discussions/refresh 만 503 PROXY_UNAVAILABLE 반환.
  brightdataApiKey: string | undefined;
  brightdataZone: string;
  brightdataUrl: string;
  discussionDailyBudget: number;
  discussionRefreshCooldownSeconds: number;
  // Phase 08.1 — inline classify (POST /refresh 훅). anthropicApiKey 미설정 시
  // classifyAndPersist 가 graceful no-op (0 반환) → refresh 자체는 계속 200.
  anthropicApiKey: string | null;
  classifyConcurrency: number;
  classifyModel: string;
  /**
   * 분류 기능 일괄 ON/OFF — 튜닝 중 정지 등 운영용 kill-switch.
   * `DISCUSSION_CLASSIFY_ENABLED` env, default true. "false" 일 때 classifyAndPersist
   * 가 호출되어도 즉시 0 반환 → Claude 호출/비용 0. refresh 는 200 유지.
   */
  classifyEnabled: boolean;
  // Phase 14 — AI 애널리스트 챗봇 (D-11/D-12, RESEARCH A1/A2). anthropicApiKey 재사용.
  chatEnabled: boolean;          // CHAT_DISABLED kill-switch (ww-bot 패턴)
  chatLeadModel: string;         // 팀장 — Sonnet 5 (사용자 결정 2026-07-02)
  chatSpecialistModel: string;   // 전문가 — Sonnet 5 (사용자 결정 2026-07-02)
  chatWebSearchModel: string;    // 웹서치 — Sonnet 5 (별도 키, env override 가능)
  chatMaxToolRounds: number;     // 팀장 tool-use 루프 상한
  chatMaxHistoryMessages: number;// pruneHistory 슬라이딩 윈도우
};

export function loadConfig(): AppConfig {
  const get = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} must be set`);
    return v;
  };
  const optional = (k: string): string | undefined => process.env[k];
  return {
    nodeEnv: (process.env.NODE_ENV ?? "development") as AppConfig["nodeEnv"],
    port: Number(process.env.PORT ?? 8080),
    logLevel: process.env.LOG_LEVEL ?? "info",
    appVersion: process.env.APP_VERSION ?? "dev",
    supabaseUrl: get("SUPABASE_URL"),
    supabaseServiceRoleKey: get("SUPABASE_SERVICE_ROLE_KEY"),
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS ?? "",
    // Kiwoom — Phase 09.1 신규 (D-17/D-19)
    kiwoomBaseUrl: process.env.KIWOOM_BASE_URL ?? "https://api.kiwoom.com",
    kiwoomAppkey: get("KIWOOM_APPKEY"),
    kiwoomSecretkey: get("KIWOOM_SECRETKEY"),
    kiwoomTokenType: process.env.KIWOOM_TOKEN_TYPE ?? "live",
    // Naver Search API — 선택. 미설정 시 server.ts 가 naverClient=undefined 로 시작.
    naverClientId: process.env.NAVER_CLIENT_ID,
    naverClientSecret: process.env.NAVER_CLIENT_SECRET,
    naverBaseUrl: process.env.NAVER_BASE_URL ?? "https://openapi.naver.com",
    naverDailyBudget: Number(process.env.NAVER_DAILY_BUDGET ?? "24500"),
    // Bright Data Web Unlocker (Phase 08 — on-demand 토론방 새로고침).
    brightdataApiKey: process.env.BRIGHTDATA_API_KEY,
    brightdataZone: process.env.BRIGHTDATA_ZONE ?? "gh_radar_naver",
    brightdataUrl:
      process.env.BRIGHTDATA_URL ?? "https://api.brightdata.com/request",
    discussionDailyBudget: Number(process.env.DISCUSSION_DAILY_BUDGET ?? "5000"),
    discussionRefreshCooldownSeconds: Number(
      process.env.DISCUSSION_REFRESH_COOLDOWN_SECONDS ?? "30",
    ),
    // Phase 08.1 — on-demand inline classify. key 없으면 서버는 정상 기동하고
    // refresh 경로에서만 classify skip (무료 로컬 dev + 단계적 secret rollout 수용).
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
    classifyConcurrency: Number(process.env.DISCUSSION_CLASSIFY_CONCURRENCY ?? "5"),
    classifyModel: process.env.DISCUSSION_CLASSIFY_MODEL ?? "claude-haiku-4-5",
    classifyEnabled: (process.env.DISCUSSION_CLASSIFY_ENABLED ?? "true") !== "false",
    // Phase 14 — AI 애널리스트 챗봇. anthropicApiKey(위) 재사용 — 신규 키 없음.
    chatEnabled: (process.env.CHAT_DISABLED ?? "false") !== "true",
    // 챗 모델 전면 Sonnet 5 — 사용자 결정(2026-07-02, 14-11 checkpoint: 팀장+전문가 모두).
    // 필요 시 CHAT_*_MODEL env 로 개별 override 가능(deploy default 회귀 함정 주의).
    chatLeadModel: process.env.CHAT_LEAD_MODEL ?? "claude-sonnet-5",
    chatSpecialistModel: process.env.CHAT_SPECIALIST_MODEL ?? "claude-sonnet-5",
    chatWebSearchModel: process.env.CHAT_WEBSEARCH_MODEL ?? "claude-sonnet-5",
    chatMaxToolRounds: Number(process.env.CHAT_MAX_TOOL_ROUNDS ?? "5"),
    chatMaxHistoryMessages: Number(process.env.CHAT_MAX_HISTORY_MESSAGES ?? "30"),
  };
}
