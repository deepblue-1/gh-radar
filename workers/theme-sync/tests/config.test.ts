import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig — 네이버 증권 JSON API base (2026-09 레거시 테마 페이지 폐지)", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.NAVER_STOCK_API_BASE;
    delete process.env.NAVER_STOCK_API_BASE;
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
    vi.stubEnv("BRIGHTDATA_API_KEY", "bd");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    if (saved === undefined) delete process.env.NAVER_STOCK_API_BASE;
    else process.env.NAVER_STOCK_API_BASE = saved;
  });

  it("기본값은 m.stock.naver.com 이고, 옛 NAVER_THEME_BASE(finance.naver.com) 는 무시한다", () => {
    // 라이브 Job env 에 남은 레거시 키가 새 코드로 새어 들어오면 302 SPA 로 되돌아간다.
    vi.stubEnv("NAVER_THEME_BASE", "https://finance.naver.com");
    expect(loadConfig().naverStockApiBase).toBe("https://m.stock.naver.com");
  });

  it("NAVER_STOCK_API_BASE 로 override 할 수 있다", () => {
    vi.stubEnv("NAVER_STOCK_API_BASE", "https://example.test");
    expect(loadConfig().naverStockApiBase).toBe("https://example.test");
  });
});
