import { beforeEach } from "vitest";

beforeEach(() => {
  process.env.SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.CORS_ALLOWED_ORIGINS =
    "http://localhost:3000,/^https:\\/\\/gh-radar-.*\\.vercel\\.app$/";
  process.env.NODE_ENV = "test";
});
