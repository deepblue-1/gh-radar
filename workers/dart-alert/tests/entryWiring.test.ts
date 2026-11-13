import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DartAlertConfig } from "../src/config";
import { buildDeps } from "../src/index";
import { logRecorder } from "./helpers/fakes";

/**
 * 리뷰 WR-56 — 진입점(`buildDeps`)의 사용량 · 한도 의심 결선을 실제로 단언한다.
 *
 * 수집기 테스트는 가짜 DB 만 쓰고 `budget.test.ts` 는 함수 하나씩만 봐서, `index.ts` 가
 * `usage.read → checkBudget(opendart_list)` · `strikes.read/record → opendart_list_quota_strike` 로 묶였는지는
 * 어떤 테스트에도 걸리지 않았다(잘못 묶으면 예산 가드 — 공식 API 운영 기준 ① 의 유일한 강제점 — 가 조용히 꺼진다).
 * 여기서는 Supabase 클라이언트만 가짜로 바꿔(`vi.mock`) 표 이름 · 서비스 키 · 날짜 · RPC 인자를 그대로 본다.
 * 실제 네트워크 호출 없음.
 */

const sb = vi.hoisted(() => {
  const calls: { op: string; args: unknown[] }[] = [];
  const rows = new Map<string, number>(); // `${service}|${date}` → count
  const filters: Record<string, unknown> = {};
  const query = {
    select: (...args: unknown[]) => {
      calls.push({ op: "select", args });
      return query;
    },
    eq: (col: string, val: unknown) => {
      calls.push({ op: "eq", args: [col, val] });
      filters[col] = val;
      return query;
    },
    maybeSingle: async () => {
      const n = rows.get(`${String(filters.service)}|${String(filters.usage_date)}`);
      return { data: n === undefined ? null : { count: n }, error: null };
    },
  };
  const client = {
    from: (table: string) => {
      calls.push({ op: "from", args: [table] });
      for (const k of Object.keys(filters)) delete filters[k];
      return query;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ op: "rpc", args: [fn, args] });
      if (fn !== "incr_api_usage") return { data: null, error: null };
      const key = `${String(args.p_service)}|${String(args.p_date)}`;
      const next = (rows.get(key) ?? 0) + Number(args.p_amount);
      rows.set(key, next);
      return { data: next, error: null };
    },
  };
  return { calls, rows, client };
});

vi.mock("../src/services/supabase", () => ({
  createSupabaseClient: () => sb.client,
}));

const cfg: DartAlertConfig = {
  supabaseUrl: "http://127.0.0.1:1",
  supabaseServiceRoleKey: "svc-role-VALUE-DO-NOT-LOG",
  dartApiKey: "TEST-DART-KEY-DO-NOT-LOG",
  dartApiKey2: "TEST-DART-KEY2-DO-NOT-LOG",
  telegramBotToken: "123456:TEST-BOT-TOKEN-DO-NOT-LOG",
  telegramChatId: "-1009876543210",
  dartBaseUrl: "http://dart.invalid",
  telegramBaseUrl: "http://telegram.invalid",
  dailyBudget: 15_000,
  mode: "auto",
  b001Kinds: ["유상증자결정"],
  b001Corrections: "exclude",
  logLevel: "info",
  appVersion: "test",
};

const DAY = "2026-11-16";
const OTHER_DAY = "2026-11-17";

describe("buildDeps — 사용량 · 한도 의심 결선(리뷰 WR-56)", () => {
  beforeEach(() => {
    sb.calls.length = 0;
    sb.rows.clear();
  });

  const deps = () => buildDeps(cfg, logRecorder().log, new AbortController().signal);

  it("usage.read — api_usage 표 · service opendart_list · 받은 KST 날짜로 읽는다(다른 서비스 · 다른 날 값은 안 섞임)", async () => {
    sb.rows.set(`opendart_list|${DAY}`, 4321);
    sb.rows.set(`opendart_list_quota_strike|${DAY}`, 7);
    sb.rows.set(`opendart_list|${OTHER_DAY}`, 99);
    const d = deps();
    expect(await d.db.usage.read(DAY, 1)).toBe(4321);
    expect(sb.calls.filter((c) => c.op === "from").map((c) => c.args[0])).toEqual(["api_usage"]);
    expect(sb.calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["service", "opendart_list"],
      ["usage_date", DAY],
    ]);
  });

  it("strikes.read — 같은 표의 service opendart_list_quota_strike 로 읽는다", async () => {
    sb.rows.set(`opendart_list|${DAY}`, 4321);
    sb.rows.set(`opendart_list_quota_strike|${DAY}`, 2);
    const d = deps();
    expect(await d.db.strikes.read(DAY, 1)).toBe(2);
    expect(sb.calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["service", "opendart_list_quota_strike"],
      ["usage_date", DAY],
    ]);
  });

  it("usage.add → flush — incr_api_usage(opendart_list · 날짜 · 모은 수) 1회, 모은 것이 없으면 RPC 0", async () => {
    const d = deps();
    expect(await d.db.usage.flush(DAY, 1)).toBeNull();
    expect(sb.calls.filter((c) => c.op === "rpc")).toEqual([]);
    d.db.usage.add(3, 1);
    d.db.usage.add(2, 1);
    expect(await d.db.usage.flush(DAY, 1)).toBe(5);
    expect(sb.calls.filter((c) => c.op === "rpc").map((c) => c.args)).toEqual([
      ["incr_api_usage", { p_service: "opendart_list", p_date: DAY, p_amount: 5 }],
    ]);
    // 더한 값을 같은 결선으로 다시 읽는다
    expect(await d.db.usage.read(DAY, 1)).toBe(5);
  });

  it("strikes.record — incr_api_usage(opendart_list_quota_strike · 날짜 · 1) · 사용량 카운터는 그대로", async () => {
    const d = deps();
    expect(await d.db.strikes.record(DAY, 1)).toBe(1);
    expect(sb.calls.filter((c) => c.op === "rpc").map((c) => c.args)).toEqual([
      ["incr_api_usage", { p_service: "opendart_list_quota_strike", p_date: DAY, p_amount: 1 }],
    ]);
    expect(await d.db.usage.read(DAY, 1)).toBe(0);
    expect(await d.db.strikes.read(DAY, 1)).toBe(1);
  });

  it("키 2 — usage.read(DAY, 2) 는 service opendart_list_k2 · 키 1 값과 안 섞인다(261113-rn7)", async () => {
    sb.rows.set(`opendart_list|${DAY}`, 4321);
    sb.rows.set(`opendart_list_k2|${DAY}`, 55);
    const d = deps();
    expect(await d.db.usage.read(DAY, 2)).toBe(55);
    expect(sb.calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["service", "opendart_list_k2"],
      ["usage_date", DAY],
    ]);
  });

  it("키 2 — add/flush(DAY, 2) 는 incr_api_usage p_service opendart_list_k2 · 키 1 카운터와 따로 모은다", async () => {
    const d = deps();
    d.db.usage.add(4, 2);
    d.db.usage.add(1, 1);
    expect(await d.db.usage.flush(DAY, 2)).toBe(4);
    expect(await d.db.usage.flush(DAY, 1)).toBe(1);
    expect(sb.calls.filter((c) => c.op === "rpc").map((c) => c.args)).toEqual([
      ["incr_api_usage", { p_service: "opendart_list_k2", p_date: DAY, p_amount: 4 }],
      ["incr_api_usage", { p_service: "opendart_list", p_date: DAY, p_amount: 1 }],
    ]);
  });

  it("키 2 — strikes.read/record(DAY, 2) 는 opendart_list_k2_quota_strike", async () => {
    const d = deps();
    expect(await d.db.strikes.record(DAY, 2)).toBe(1);
    expect(sb.calls.filter((c) => c.op === "rpc").map((c) => c.args)).toEqual([
      ["incr_api_usage", { p_service: "opendart_list_k2_quota_strike", p_date: DAY, p_amount: 1 }],
    ]);
    sb.calls.length = 0;
    expect(await d.db.strikes.read(DAY, 2)).toBe(1);
    expect(sb.calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["service", "opendart_list_k2_quota_strike"],
      ["usage_date", DAY],
    ]);
    expect(await d.db.strikes.read(DAY, 1)).toBe(0);
  });
});
