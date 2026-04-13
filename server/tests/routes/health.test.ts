import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";

describe("/api/health", () => {
  it("returns 200 + {status,timestamp,version}", async () => {
    process.env.APP_VERSION = "abc1234";
    const app = createApp({ supabase: mockSupabase({ stocks: [] }) });
    const r = await request(app).get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("ok");
    expect(typeof r.body.timestamp).toBe("string");
    expect(new Date(r.body.timestamp).toISOString()).toBe(r.body.timestamp);
    expect(r.body.version).toBe("abc1234");
  });

  it("falls back to 'dev' when APP_VERSION unset", async () => {
    delete process.env.APP_VERSION;
    const app = createApp({ supabase: mockSupabase({ stocks: [] }) });
    const r = await request(app).get("/api/health");
    expect(r.body.version).toBe("dev");
  });
});
