import { beforeEach } from "vitest";

beforeEach(() => {
  process.env.SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.CORS_ALLOWED_ORIGINS =
    "http://localhost:3000,/^https:\\/\\/gh-radar-.*\\.vercel\\.app$/";
  process.env.NODE_ENV = "test";
  process.env.KIS_APP_KEY = "test-kis-app-key";
  process.env.KIS_APP_SECRET = "test-kis-app-secret";
  // Phase 09.1 — Kiwoom config (D-17/D-19). loadConfig() get() 가 throw 회피.
  process.env.KIWOOM_APPKEY = "test-kiwoom-appkey";
  process.env.KIWOOM_SECRETKEY = "test-kiwoom-secretkey";
});
