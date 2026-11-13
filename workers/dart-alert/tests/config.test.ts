import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DART_DAILY_BUDGET_LIMIT, loadConfig } from "../src/config";

/**
 * Phase 43-03 — env 계약(43-07 배포 스크립트와 같은 이름).
 * - SC-4 · 공식 API 운영 기준 ①: 하루 예산은 공식 20,000/일의 75% 이하(정수 1 ~ 15,000 · 기본 15,000).
 * - 필수 비밀이 없거나 방 id 가 숫자가 아니면 env 이름만 담은 오류 — 값은 싣지 않는다.
 * - 261113-rn7 U-2: OpenDART 키 2개(`OPENDART_API_KEY_2` 필수) · 두 키가 같은 값이면 시작하지 않는다(값 미출력).
 * - D-04 설정값: 주요사항보고서 종류 목록 · 정정 포함 여부.
 */
const KEY = "TEST-DART-KEY-DO-NOT-LOG";
const KEY2 = "TEST-DART-KEY2-DO-NOT-LOG";
const BOT = "123456:TEST-BOT-TOKEN-DO-NOT-LOG";
const SRK = "svc-role-VALUE-DO-NOT-LOG";
const CHAT = "-1009876543210";

const OPTIONAL_KEYS = [
  "DART_BASE_URL",
  "TELEGRAM_BASE_URL",
  "DART_ALERT_DAILY_BUDGET",
  "DART_ALERT_MODE",
  "DART_ALERT_B001_KINDS",
  "DART_ALERT_B001_CORRECTIONS",
  "LOG_LEVEL",
  "APP_VERSION",
];

function errorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "";
}

/** 이 파일이 만지는 env 이름 — 키 단위로 저장 · 복원한다(리뷰 IN-52 · modes.test.ts 와 같은 꼴) */
const TOUCHED_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENDART_API_KEY",
  "OPENDART_API_KEY_2",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  ...OPTIONAL_KEYS,
];

describe("loadConfig (43-03 env 계약)", () => {
  // process.env 를 일반 객체로 바꿔 끼우면(process.env = {...}) 값을 문자열로 바꾸는 Node 특수 객체가 아니게 된다 — 키만 되돌린다
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(TOUCHED_KEYS.map((k) => [k, process.env[k]]));
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SRK;
    process.env.OPENDART_API_KEY = KEY;
    process.env.OPENDART_API_KEY_2 = KEY2;
    process.env.TELEGRAM_BOT_TOKEN = BOT;
    process.env.TELEGRAM_CHAT_ID = CHAT;
    for (const k of OPTIONAL_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of TOUCHED_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("필수 여섯만 있으면 기본값으로 채운다", () => {
    expect(loadConfig()).toEqual({
      supabaseUrl: "https://x.supabase.co",
      supabaseServiceRoleKey: SRK,
      dartApiKey: KEY,
      dartApiKey2: KEY2,
      telegramBotToken: BOT,
      telegramChatId: CHAT,
      dartBaseUrl: "https://opendart.fss.or.kr",
      telegramBaseUrl: "https://api.telegram.org",
      dailyBudget: 15000,
      mode: "auto",
      b001Kinds: ["유상증자결정", "유무상증자결정", "회사합병결정", "회사분할합병결정", "자기주식취득결정", "주식교환ㆍ이전결정"],
      b001Corrections: "include",
      logLevel: "info",
      appVersion: "dev",
    });
  });

  it("예산 상한 상수는 15,000(공식 20,000 의 75%)", () => {
    expect(DART_DAILY_BUDGET_LIMIT).toBe(15000);
    expect(DART_DAILY_BUDGET_LIMIT).toBeLessThanOrEqual(20000 * 0.75);
  });

  it("TELEGRAM_BOT_TOKEN 이 없으면 이름만 담은 오류 — 다른 비밀 값은 메시지에 없다", () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const message = errorOf(() => loadConfig());
    expect(message).toContain("TELEGRAM_BOT_TOKEN");
    for (const v of [KEY, KEY2, SRK, CHAT]) expect(message).not.toContain(v);
  });

  it("OPENDART_API_KEY_2 가 없으면 `missing env: OPENDART_API_KEY_2` — 키 값은 메시지에 없다(261113-rn7)", () => {
    delete process.env.OPENDART_API_KEY_2;
    const message = errorOf(() => loadConfig());
    expect(message).toBe("missing env: OPENDART_API_KEY_2");
    expect(message).not.toContain(KEY);
  });

  it.each([
    ["같은 값", KEY],
    ["앞뒤 공백만 다른 값", `  ${KEY}\n`],
  ])("OPENDART_API_KEY_2 가 키 1 과 %s 이면 시작하지 않는다 — 오류에 값이 없다(한 키 대체 없음)", (_label, v) => {
    process.env.OPENDART_API_KEY_2 = v;
    const message = errorOf(() => loadConfig());
    expect(message).toContain("invalid OPENDART_API_KEY_2");
    expect(message).toContain("OPENDART_API_KEY 와 같은 값");
    expect(message).not.toContain(KEY);
  });

  it.each(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENDART_API_KEY", "OPENDART_API_KEY_2", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"])(
    "필수 %s 가 비어 있으면 그 이름으로 멈춘다",
    (key) => {
      process.env[key] = "";
      expect(() => loadConfig()).toThrow(new RegExp(key));
    },
  );

  it.each(["15001", "0", "abc", "-1", "2.5"])("DART_ALERT_DAILY_BUDGET=%s → 시작하지 않는다", (v) => {
    process.env.DART_ALERT_DAILY_BUDGET = v;
    expect(() => loadConfig()).toThrow(/DART_ALERT_DAILY_BUDGET/);
  });

  it.each([
    ["15000", 15000],
    ["9000", 9000],
    ["1", 1],
  ])("DART_ALERT_DAILY_BUDGET=%s → %i", (v, n) => {
    process.env.DART_ALERT_DAILY_BUDGET = v;
    expect(loadConfig().dailyBudget).toBe(n);
  });

  it("DART_ALERT_MODE=turbo → 오류", () => {
    process.env.DART_ALERT_MODE = "turbo";
    expect(() => loadConfig()).toThrow(/DART_ALERT_MODE/);
  });

  it.each(["auto", "probe", "seed", "test-send"])("DART_ALERT_MODE=%s 를 그대로 받는다", (v) => {
    process.env.DART_ALERT_MODE = v;
    expect(loadConfig().mode).toBe(v);
  });

  it.each(["-1001234567890", "123456789"])("TELEGRAM_CHAT_ID=%s → 그대로", (v) => {
    process.env.TELEGRAM_CHAT_ID = v;
    expect(loadConfig().telegramChatId).toBe(v);
  });

  it.each(["@team", "12a", "-", "1-2"])("TELEGRAM_CHAT_ID=%s → 오류(이름만 · 값 없음)", (v) => {
    process.env.TELEGRAM_CHAT_ID = v;
    const message = errorOf(() => loadConfig());
    expect(message).toContain("TELEGRAM_CHAT_ID");
    expect(message).not.toContain(v);
    for (const s of [KEY, SRK, BOT]) expect(message).not.toContain(s);
  });

  it("DART_ALERT_B001_KINDS 는 쉼표로 나눠 trim · 빈 항목을 버린다", () => {
    process.env.DART_ALERT_B001_KINDS = " 유상증자결정 , 무상증자결정 ";
    expect(loadConfig().b001Kinds).toEqual(["유상증자결정", "무상증자결정"]);
    process.env.DART_ALERT_B001_KINDS = "유상증자결정,,회사합병결정,";
    expect(loadConfig().b001Kinds).toEqual(["유상증자결정", "회사합병결정"]);
  });

  it.each([",", " , , ", ",,,"])("DART_ALERT_B001_KINDS=%j (빈 항목만) → 오류", (v) => {
    process.env.DART_ALERT_B001_KINDS = v;
    expect(() => loadConfig()).toThrow(/DART_ALERT_B001_KINDS/);
  });

  it("DART_ALERT_B001_KINDS 가 20개를 넘으면 오류", () => {
    process.env.DART_ALERT_B001_KINDS = Array.from({ length: 21 }, (_, i) => `종류${i}`).join(",");
    expect(() => loadConfig()).toThrow(/DART_ALERT_B001_KINDS/);
    process.env.DART_ALERT_B001_KINDS = Array.from({ length: 20 }, (_, i) => `종류${i}`).join(",");
    expect(loadConfig().b001Kinds).toHaveLength(20);
  });

  it("기본 b001Kinds 는 공유 상수와 다른 배열이다(설정이 상수를 바꾸지 못함)", async () => {
    const { DEFAULT_B001_KINDS } = await import("../src/watches");
    const cfg = loadConfig();
    expect(cfg.b001Kinds).toEqual([...DEFAULT_B001_KINDS]);
    expect(cfg.b001Kinds).not.toBe(DEFAULT_B001_KINDS);
  });

  it.each(["include", "exclude"])("DART_ALERT_B001_CORRECTIONS=%s → 그대로", (v) => {
    process.env.DART_ALERT_B001_CORRECTIONS = v;
    expect(loadConfig().b001Corrections).toBe(v);
  });

  it("DART_ALERT_B001_CORRECTIONS=maybe → 오류", () => {
    process.env.DART_ALERT_B001_CORRECTIONS = "maybe";
    expect(() => loadConfig()).toThrow(/DART_ALERT_B001_CORRECTIONS/);
  });

  it("DART_BASE_URL · TELEGRAM_BASE_URL · LOG_LEVEL · APP_VERSION 덮어쓰기", () => {
    process.env.DART_BASE_URL = "http://127.0.0.1:9001";
    process.env.TELEGRAM_BASE_URL = "http://127.0.0.1:9002";
    process.env.LOG_LEVEL = "debug";
    process.env.APP_VERSION = "abc1234";
    const cfg = loadConfig();
    expect(cfg.dartBaseUrl).toBe("http://127.0.0.1:9001");
    expect(cfg.telegramBaseUrl).toBe("http://127.0.0.1:9002");
    expect(cfg.logLevel).toBe("debug");
    expect(cfg.appVersion).toBe("abc1234");
  });
});
