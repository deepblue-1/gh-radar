import { describe, it, expect } from "vitest";
import { createKrxClient } from "../src/krx/client";

describe("createKrxClient", () => {
  it("AUTH_KEY 헤더가 config 값으로 설정", () => {
    const c = createKrxClient({
      krxAuthKey: "test-key",
      krxBaseUrl: "https://example.com",
      supabaseUrl: "x",
      supabaseServiceRoleKey: "x",
      logLevel: "info",
      appVersion: "test",
    } as any);
    expect(c.defaults.headers["AUTH_KEY"]).toBe("test-key");
    expect(c.defaults.baseURL).toBe("https://example.com");
  });
});
