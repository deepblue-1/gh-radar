import "dotenv/config";
import { DEFAULT_B001_KINDS } from "./watches";

/**
 * Phase 43-03 — dart-alert env 계약.
 *
 * 이름은 43-07 배포 스크립트(`scripts/deploy-dart-alert.sh`)와 같은 계약이다 — 바꾸지 않는다.
 * - SC-4 · 공식 API 운영 기준 ①: 하루 예산 `DART_ALERT_DAILY_BUDGET` 은 공식 일일 한도(인증키당 20,000)의 75% 이하
 *   (정수 1 ~ 15,000 · 기본 15,000). 범위 밖이면 시작하지 않는다. 키가 2개라(261113-rn7 U-2) 같은 값을 **키마다 따로**
 *   적용한다(키 1 카운터 `opendart_list` · 키 2 카운터 `opendart_list_k2`).
 * - 필수 비밀 5개(`OPENDART_API_KEY` · `OPENDART_API_KEY_2` · `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` ·
 *   `SUPABASE_SERVICE_ROLE_KEY`)와 `SUPABASE_URL` 이 없으면 이름만 담은 오류로 멈춘다 — 값은 어떤 오류 메시지에도 싣지 않는다.
 *   두 OpenDART 키가 같은 값이면 시작하지 않는다(같은 키를 둘로 세면 실제 한도를 넘는다 · 한 키 대체 동작 없음).
 * - D-14: 단체방 id 는 설정값(Secret)이다 — 숫자(음수 허용)가 아니면 이름만 담아 멈춘다.
 * - D-04: 주요사항보고서 종류 목록(기본 6종 — 유상증자결정 · 유무상증자결정 · 회사합병결정 · 회사분할합병결정 ·
 *   자기주식취득결정 · 주식교환ㆍ이전결정 · watches.ts `DEFAULT_B001_KINDS`) · 정정 포함 여부는 재배포 없이 env 로
 *   바꾼다(정정 기본 include — 가정 3).
 *   gcloud `--set-env-vars` 로 쉼표 값을 넣을 때의 구분자 바꾸기 요령은 43-07 배포 스크립트 머리 주석이 맡는다.
 */

/**
 * auto = 평소 수집 · probe = 탐침 1건 · seed = 그날 건을 보내지 않고 넣기만(첫 배포) · test-send = 시험 글 1건
 */
export type DartAlertMode = "auto" | "probe" | "seed" | "test-send";

export interface DartAlertConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** OpenDART 인증키 1(crtfc_key) — 공개매수 · 주요사항보고서 */
  dartApiKey: string;
  /** OpenDART 인증키 2(crtfc_key) — 거래소 수시공시 등 그 밖 감시 대상 · 운영 도구(261113-rn7) */
  dartApiKey2: string;
  telegramBotToken: string;
  /** 단체방 id — 숫자 문자열(슈퍼그룹은 음수) */
  telegramChatId: string;
  dartBaseUrl: string;
  telegramBaseUrl: string;
  /** 키마다 하루 호출 상한(api_usage `opendart_list` · `opendart_list_k2`) — 1 ~ 15,000 */
  dailyBudget: number;
  mode: DartAlertMode;
  /** D-04 주요사항보고서 허용 종류명 */
  b001Kinds: string[];
  /**
   * D-04 주요사항보고서 정정 공시 포함 여부 — 자기주식취득결정 · 주식교환ㆍ이전결정은 이 값과 무관하게 원본만 ·
   * I001 · D005 는 늘 원본만(261113-iez · watches.ts)
   */
  b001Corrections: "include" | "exclude";
  logLevel: string;
  appVersion: string;
}

export const DART_DEFAULT_BASE_URL = "https://opendart.fss.or.kr";
export const TELEGRAM_DEFAULT_BASE_URL = "https://api.telegram.org";
/**
 * 키마다 하루 예산 상한 = 공식 20,000/일(인증키당)의 75%. 키별 설계 사용량(cadence.ts `plannedDailyCalls`):
 * 키 1 = 14,760(공개매수 D004 종일 5초 9,360 + 주요사항보고서 B001 5,400) · 키 2 = 거래소 수시공시 I001 10초 4,680 +
 * 30초 감시 대상마다 1,560 + I001 100건 넘는 날 추가 쪽. 남는 몫은 추가 쪽 · 막힌 키 재탐침 몫이다.
 */
export const DART_DAILY_BUDGET_LIMIT = 15_000;
const MODES: readonly DartAlertMode[] = ["auto", "probe", "seed", "test-send"];
const CORRECTIONS = ["include", "exclude"] as const;
/** 종류 목록 상한 — 설정 실수(구분자 오인 등)로 목록이 터무니없이 길어지는 것을 막는다 */
const MAX_B001_KINDS = 20;
const CHAT_ID_RE = /^-?[0-9]+$/;

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
function intEnv(key: string, fallback: number, min: number, max: number): number {
  const raw = optional(key);
  if (raw === undefined) return fallback;
  const n = /^-?\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`invalid ${key}: ${raw} (정수 ${min} ~ ${max})`);
  }
  return n;
}

function parseMode(raw: string | undefined): DartAlertMode {
  const v = raw ?? "auto";
  if ((MODES as readonly string[]).includes(v)) return v as DartAlertMode;
  throw new Error(`invalid DART_ALERT_MODE: ${v} (${MODES.join("|")})`);
}

/** 방 id 는 Secret 이다 — 오류에 값을 싣지 않고 이름과 기대 꼴만 */
function parseChatId(raw: string): string {
  if (!CHAT_ID_RE.test(raw)) throw new Error("invalid TELEGRAM_CHAT_ID (숫자 · 음수 허용)");
  return raw;
}

function parseKinds(raw: string | undefined): string[] {
  if (raw === undefined) return [...DEFAULT_B001_KINDS];
  const kinds = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (kinds.length === 0) throw new Error("invalid DART_ALERT_B001_KINDS: 빈 목록 (쉼표로 나눈 종류명 1개 이상)");
  if (kinds.length > MAX_B001_KINDS) {
    throw new Error(`invalid DART_ALERT_B001_KINDS: ${kinds.length}개 (최대 ${MAX_B001_KINDS}개)`);
  }
  return kinds;
}

function parseCorrections(raw: string | undefined): "include" | "exclude" {
  const v = raw ?? "include";
  if ((CORRECTIONS as readonly string[]).includes(v)) return v as "include" | "exclude";
  throw new Error(`invalid DART_ALERT_B001_CORRECTIONS: ${v} (${CORRECTIONS.join("|")})`);
}

export function loadConfig(): DartAlertConfig {
  const cfg: DartAlertConfig = {
    supabaseUrl: req("SUPABASE_URL"),
    supabaseServiceRoleKey: req("SUPABASE_SERVICE_ROLE_KEY"),
    dartApiKey: req("OPENDART_API_KEY"),
    dartApiKey2: req("OPENDART_API_KEY_2"),
    telegramBotToken: req("TELEGRAM_BOT_TOKEN"),
    telegramChatId: parseChatId(req("TELEGRAM_CHAT_ID")),
    dartBaseUrl: optional("DART_BASE_URL") ?? DART_DEFAULT_BASE_URL,
    telegramBaseUrl: optional("TELEGRAM_BASE_URL") ?? TELEGRAM_DEFAULT_BASE_URL,
    dailyBudget: intEnv("DART_ALERT_DAILY_BUDGET", DART_DAILY_BUDGET_LIMIT, 1, DART_DAILY_BUDGET_LIMIT),
    mode: parseMode(optional("DART_ALERT_MODE")),
    b001Kinds: parseKinds(optional("DART_ALERT_B001_KINDS")),
    b001Corrections: parseCorrections(optional("DART_ALERT_B001_CORRECTIONS")),
    logLevel: optional("LOG_LEVEL") ?? "info",
    appVersion: optional("APP_VERSION") ?? "dev",
  };
  // 두 키가 같은 값이면 시작하지 않는다 — 값은 오류에 싣지 않는다(261113-rn7 U-2)
  if (cfg.dartApiKey.trim() === cfg.dartApiKey2.trim()) {
    throw new Error(
      "invalid OPENDART_API_KEY_2: OPENDART_API_KEY 와 같은 값 — 키 2개는 서로 다른 OpenDART 인증키여야 한다(같은 키를 둘로 세면 실제 한도를 넘는다)",
    );
  }
  return cfg;
}
