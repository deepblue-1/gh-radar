import { describe, it, expect } from "vitest";
import { classifyPerStockError } from "../src/pipeline/classify";
import {
  NaverAuthError,
  NaverBudgetExhaustedError,
  NaverBadRequestError,
  NaverRateLimitError,
} from "../src/naver/searchNews";

describe("classifyPerStockError (Phase 07.2 per-stock 분기)", () => {
  it("NaverAuthError → stopAll + error", () => {
    const r = classifyPerStockError(new NaverAuthError());
    expect(r.disposition).toBe("stopAll");
    expect(r.level).toBe("error");
    expect(r.kind).toBe("auth");
  });

  it("NaverBudgetExhaustedError → stopAll + error", () => {
    const r = classifyPerStockError(new NaverBudgetExhaustedError());
    expect(r.disposition).toBe("stopAll");
    expect(r.level).toBe("error");
    expect(r.kind).toBe("budget-exhausted");
  });

  it("NaverRateLimitError → skip + warn (Phase 07.2 회귀: stopAll 미발동)", () => {
    const r = classifyPerStockError(new NaverRateLimitError());
    expect(r.disposition).toBe("skip");
    expect(r.level).toBe("warn");
    expect(r.kind).toBe("rate-limit");
  });

  it("NaverBadRequestError → skip + warn (기존)", () => {
    const r = classifyPerStockError(new NaverBadRequestError("bad"));
    expect(r.disposition).toBe("skip");
    expect(r.level).toBe("warn");
    expect(r.kind).toBe("other");
  });

  it("일반 Error → skip + warn (기존)", () => {
    const r = classifyPerStockError(new Error("network"));
    expect(r.disposition).toBe("skip");
    expect(r.level).toBe("warn");
    expect(r.kind).toBe("other");
  });
});
