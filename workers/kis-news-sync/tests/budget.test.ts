import { describe, expect, it, vi } from "vitest";
import {
  BUDGET_WARN_RATIO,
  KIS_QUOTA_STRIKE_SERVICE,
  KIS_USAGE_SERVICE,
  UsageCounter,
  budgetStateOf,
  checkBudget,
  incrementUsage,
  kstDateString,
  readQuotaStrikes,
  recordQuotaStrike,
} from "../src/apiUsage";

/**
 * Phase 41-08 — 한투 호출 수 카운터(SC-4). api_usage service `kis_news_title`(KST 날짜 키) ·
 * 한도 의심 표시 `kis_news_title_quota_strike` · 10초 묶음 flush · 80% 경고.
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
  it("카운터 kis_news_title · 한도 의심 kis_news_title_quota_strike · 경고 80%", () => {
    expect(KIS_USAGE_SERVICE).toBe("kis_news_title");
    expect(KIS_QUOTA_STRIKE_SERVICE).toBe("kis_news_title_quota_strike");
    expect(BUDGET_WARN_RATIO).toBe(0.8);
  });

  it("kstDateString 은 KST 날짜 — UTC 15:30 은 다음 날", () => {
    expect(kstDateString(new Date("2026-11-16T15:30:00Z"))).toBe("2026-11-17");
    expect(kstDateString(new Date("2026-11-16T14:59:59Z"))).toBe("2026-11-16");
  });
});

describe("budgetStateOf", () => {
  it("159,999 / 200,000 → ok", () => {
    expect(budgetStateOf(159_999, 200_000)).toBe("ok");
  });
  it("160,000 / 200,000 → warn", () => {
    expect(budgetStateOf(160_000, 200_000)).toBe("warn");
  });
  it("200,000 / 200,000 → exhausted", () => {
    expect(budgetStateOf(200_000, 200_000)).toBe("exhausted");
  });
});

describe("api_usage 읽기 · 쓰기", () => {
  it("checkBudget 기본 서비스는 kis_news_title · 행 없으면 0", async () => {
    const m = selectMock(null);
    await expect(checkBudget(m.client, "2026-11-16")).resolves.toBe(0);
    expect(m.from).toHaveBeenCalledWith("api_usage");
    expect(m.eq1).toHaveBeenCalledWith("service", "kis_news_title");
    expect(m.eq2).toHaveBeenCalledWith("usage_date", "2026-11-16");
  });

  it("incrementUsage 는 incr_api_usage(kis_news_title, 날짜, n)", async () => {
    const m = rpcMock(42);
    await expect(incrementUsage(m.client, "2026-11-16", 7)).resolves.toBe(42);
    expect(m.rpc).toHaveBeenCalledWith("incr_api_usage", {
      p_service: "kis_news_title",
      p_date: "2026-11-16",
      p_amount: 7,
    });
  });

  it("한도 의심 표시 읽기 · 기록은 strike 서비스로", async () => {
    const s = selectMock(2);
    await expect(readQuotaStrikes(s.client, "2026-11-16")).resolves.toBe(2);
    expect(s.eq1).toHaveBeenCalledWith("service", "kis_news_title_quota_strike");
    const r = rpcMock(3);
    await expect(recordQuotaStrike(r.client, "2026-11-16")).resolves.toBe(3);
    expect(r.rpc).toHaveBeenCalledWith("incr_api_usage", {
      p_service: "kis_news_title_quota_strike",
      p_date: "2026-11-16",
      p_amount: 1,
    });
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
      p_service: "kis_news_title",
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
    expect(ok.rpc.mock.calls[0][1]).toMatchObject({ p_amount: 5 });
  });
});
