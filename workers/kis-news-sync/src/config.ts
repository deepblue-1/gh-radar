import "dotenv/config";

/**
 * Phase 41-06 — kis-news-sync env 계약.
 *
 * 이름은 41-02 배포 스크립트(`scripts/deploy-kis-news-sync.sh`)와 같은 계약이다 — 바꾸지 않는다.
 * - D-01 · 공식 API 운영 기준 ①: 초당 상한 `KIS_NEWS_MAX_RPS` 는 공식 초당 20건의 75% 이하
 *   (정수 1 ~ 15 · 기본 5). 범위 밖이면 시작하지 않는다.
 * - 필수 비밀이 없으면 이름만 담은 오류로 멈춘다 — 값은 어떤 오류 메시지에도 싣지 않는다.
 */

/** auto = KST 시각으로 판정 · fast = 상시 루프 · slow = 한 바퀴 · probe = 탐침 1건 */
export type KisNewsMode = "auto" | "fast" | "slow" | "probe";

export interface KisNewsConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  kisAppKey: string;
  kisAppSecret: string;
  kisBaseUrl: string;
  /** 초당 호출 상한(전체) — 1 ~ 15 */
  maxRps: number;
  /** 하루 호출 상한(api_usage `kis_news_title`) */
  dailyBudget: number;
  mode: KisNewsMode;
  /** 종목 조회 대상 상한 */
  targetCap: number;
  logLevel: string;
  appVersion: string;
}

export const KIS_DEFAULT_BASE_URL = "https://openapi.koreainvestment.com:9443";
/** 공식 초당 20건 × 75% */
export const KIS_MAX_RPS_LIMIT = 15;
const DEFAULT_MAX_RPS = 5;
const DEFAULT_DAILY_BUDGET = 200_000;
const DEFAULT_TARGET_CAP = 450;
const MODES: readonly KisNewsMode[] = ["auto", "fast", "slow", "probe"];

function req(key: string): string {
  const v = process.env[key];
  if (!v || v.length === 0) throw new Error(`missing env: ${key}`);
  return v;
}

function optional(key: string): string | undefined {
  const v = process.env[key];
  return v === undefined || v === "" ? undefined : v;
}

/** 정수 · [min, max] 안이어야 한다. 비밀이 아닌 설정값이라 받은 값을 오류에 싣는다. */
function intEnv(key: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = optional(key);
  if (raw === undefined) return fallback;
  const n = /^-?\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    const range = max === Number.MAX_SAFE_INTEGER ? `>= ${min}` : `${min} ~ ${max}`;
    throw new Error(`invalid ${key}: ${raw} (정수 ${range})`);
  }
  return n;
}

function parseMode(raw: string | undefined): KisNewsMode {
  const v = raw ?? "auto";
  if ((MODES as readonly string[]).includes(v)) return v as KisNewsMode;
  throw new Error(`invalid KIS_NEWS_MODE: ${v} (${MODES.join("|")})`);
}

export function loadConfig(): KisNewsConfig {
  return {
    supabaseUrl: req("SUPABASE_URL"),
    supabaseServiceRoleKey: req("SUPABASE_SERVICE_ROLE_KEY"),
    kisAppKey: req("KIS_APPKEY"),
    kisAppSecret: req("KIS_APPSECRET"),
    kisBaseUrl: optional("KIS_BASE_URL") ?? KIS_DEFAULT_BASE_URL,
    maxRps: intEnv("KIS_NEWS_MAX_RPS", DEFAULT_MAX_RPS, 1, KIS_MAX_RPS_LIMIT),
    dailyBudget: intEnv("KIS_NEWS_DAILY_BUDGET", DEFAULT_DAILY_BUDGET, 1),
    mode: parseMode(optional("KIS_NEWS_MODE")),
    targetCap: intEnv("KIS_NEWS_TARGET_CAP", DEFAULT_TARGET_CAP, 1),
    logLevel: optional("LOG_LEVEL") ?? "info",
    appVersion: optional("APP_VERSION") ?? "dev",
  };
}
