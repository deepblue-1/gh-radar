import { describe, expect, it, vi } from "vitest";
import {
  BUDGET_WARN_RATIO,
  budgetStateOf,
  checkBudget,
  DART_KEY_SERVICES,
  DART_QUOTA_STRIKE_SERVICE,
  DART_QUOTA_STRIKE_SERVICE_2,
  DART_USAGE_SERVICE_2,
  DART_USAGE_SERVICE,
  incrementUsage,
  readQuotaStrikes,
  recordQuotaStrike,
  UsageCounter,
} from "../src/apiUsage";

/**
 * Phase 43-03 — OpenDART 호출 수 카운터(SC-4). api_usage service `opendart_list`(KST 날짜 키) ·
 * 한도 의심 표시 `opendart_list_quota_strike` · 10초 묶음 flush · 예산 80% 경고.
 * 261113-rn7 U-2: 키 2 카운터 `opendart_list_k2` · `opendart_list_k2_quota_strike`(키마다 따로).
 */

function rpcMock(result: unknown = 0, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error });
  return { client: { rpc } as never, rpc };
}

function selectMock(count: number | null, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: count === null ? null : { count }, error });
  const eq2 = vi.fn(() => ({ maybeSingle }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, eq1, eq2 };
}

describe("서비스 키 · 상수", () => {
  it("카운터 opendart_list · 한도 의심 opendart_list_quota_strike · 경고 80%", () => {
    expect(DART_USAGE_SERVICE).toBe("opendart_list");
    expect(DART_QUOTA_STRIKE_SERVICE).toBe("opendart_list_quota_strike");
    expect(BUDGET_WARN_RATIO).toBe(0.8);
  });

  it("키별 service — 키 1 = 기존 두 이름 그대로(연속성) · 키 2 = opendart_list_k2 · opendart_list_k2_quota_strike", () => {
    expect(DART_KEY_SERVICES[1]).toEqual({ usage: "opendart_list", strike: "opendart_list_quota_strike" });
    expect(DART_KEY_SERVICES[2]).toEqual({ usage: "opendart_list_k2", strike: "opendart_list_k2_quota_strike" });
    expect(DART_USAGE_SERVICE_2).toBe("opendart_list_k2");
    expect(DART_QUOTA_STRIKE_SERVICE_2).toBe("opendart_list_k2_quota_strike");
  });
});

describe("budgetStateOf (예산 15,000)", () => {
  it("11,999 → ok", () => {
    expect(budgetStateOf(11_999, 15_000)).toBe("ok");
  });
  it("12,000 → warn", () => {
    expect(budgetStateOf(12_000, 15_000)).toBe("warn");
  });
  it("15,000 → exhausted", () => {
    expect(budgetStateOf(15_000, 15_000)).toBe("exhausted");
  });
  it("15,001 → exhausted", () => {
    expect(budgetStateOf(15_001, 15_000)).toBe("exhausted");
  });
});

describe("api_usage 읽기 · 쓰기", () => {
  it("checkBudget 기본 서비스는 opendart_list · 행 없으면 0", async () => {
    const m = selectMock(null);
    await expect(checkBudget(m.client, "2026-11-16")).resolves.toBe(0);
    expect(m.from).toHaveBeenCalledWith("api_usage");
    expect(m.eq1).toHaveBeenCalledWith("service", "opendart_list");
    expect(m.eq2).toHaveBeenCalledWith("usage_date", "2026-11-16");
  });

  it("checkBudget 은 문자열 count 도 숫자로 · 오류는 던진다", async () => {
    await expect(checkBudget(selectMock("321" as never).client, "2026-11-16")).resolves.toBe(321);
    await expect(checkBudget(selectMock(null, { message: "boom" }).client, "2026-11-16")).rejects.toBeTruthy();
  });

  it("incrementUsage 는 incr_api_usage(opendart_list, 날짜, n)", async () => {
    const m = rpcMock(42);
    await expect(incrementUsage(m.client, "2026-11-16", 7)).resolves.toBe(42);
    expect(m.rpc).toHaveBeenCalledWith("incr_api_usage", {
      p_service: "opendart_list",
      p_date: "2026-11-16",
      p_amount: 7,
    });
  });

  it("한도 의심 표시 읽기 · 기록은 strike 서비스로", async () => {
    const s = selectMock(2);
    await expect(readQuotaStrikes(s.client, "2026-11-16")).resolves.toBe(2);
    expect(s.eq1).toHaveBeenCalledWith("service", "opendart_list_quota_strike");
    const r = rpcMock(3);
    await expect(recordQuotaStrike(r.client, "2026-11-16")).resolves.toBe(3);
    expect(r.rpc).toHaveBeenCalledWith("incr_api_usage", {
      p_service: "opendart_list_quota_strike",
      p_date: "2026-11-16",
      p_amount: 1,
    });
  });
});

describe("키 2 service 인자(261113-rn7)", () => {
  it("readQuotaStrikes · recordQuotaStrike 는 service 인자를 따른다", async () => {
    const s = selectMock(1);
    await expect(readQuotaStrikes(s.client, "2026-11-16", DART_QUOTA_STRIKE_SERVICE_2)).resolves.toBe(1);
    expect(s.eq1).toHaveBeenCalledWith("service", "opendart_list_k2_quota_strike");
    const r = rpcMock(2);
    await expect(recordQuotaStrike(r.client, "2026-11-16", DART_QUOTA_STRIKE_SERVICE_2)).resolves.toBe(2);
    expect(r.rpc).toHaveBeenCalledWith("incr_api_usage", {
      p_service: "opendart_list_k2_quota_strike",
      p_date: "2026-11-16",
      p_amount: 1,
    });
  });

  it("new UsageCounter(\"opendart_list_k2\") 의 flush 는 그 service 로 incr_api_usage", async () => {
    const m = rpcMock(7);
    const c = new UsageCounter("opendart_list_k2");
    c.add(2);
    await expect(c.flush(m.client, "2026-11-16")).resolves.toBe(7);
    expect(m.rpc).toHaveBeenCalledWith("incr_api_usage", { p_service: "opendart_list_k2", p_date: "2026-11-16", p_amount: 2 });
  });
});

describe("UsageCounter (10초 묶음)", () => {
  it("add 를 모았다가 flush 때 incr_api_usage 1회 · 새 누적을 돌려준다", async () => {
    const m = rpcMock(1_005);
    const c = new UsageCounter();
    c.add();
    c.add(3);
    c.add();
    expect(c.pending).toBe(5);
    await expect(c.flush(m.client, "2026-11-16")).resolves.toBe(1_005);
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("incr_api_usage", {
      p_service: "opendart_list",
      p_date: "2026-11-16",
      p_amount: 5,
    });
    expect(c.pending).toBe(0);
  });

  it("pending 0 이면 RPC 를 부르지 않는다", async () => {
    const m = rpcMock(0);
    const c = new UsageCounter();
    await expect(c.flush(m.client, "2026-11-16")).resolves.toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("flush 실패면 pending 을 되돌려 다음 flush 에 다시 싣는다", async () => {
    const bad = rpcMock(null, { message: "boom" });
    const c = new UsageCounter();
    c.add(4);
    await expect(c.flush(bad.client, "2026-11-16")).rejects.toBeTruthy();
    expect(c.pending).toBe(4);
    c.add();
    const ok = rpcMock(10);
    await c.flush(ok.client, "2026-11-16");
    expect(ok.rpc.mock.calls[0][1]).toMatchObject({ p_service: "opendart_list", p_amount: 5 });
    expect(c.pending).toBe(0);
  });
});
