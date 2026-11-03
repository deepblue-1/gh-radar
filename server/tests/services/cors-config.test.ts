import { describe, it, expect, vi } from "vitest";
import {
  parseAllowedOrigins,
  corsOptions,
} from "../../src/services/cors-config";

describe("parseAllowedOrigins", () => {
  it("returns empty array for undefined/empty", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
  });
  it("parses plain URLs as strings", () => {
    const r = parseAllowedOrigins(
      "http://localhost:3000,https://example.com",
    );
    expect(r).toEqual(["http://localhost:3000", "https://example.com"]);
  });
  it("parses /regex/ literal to RegExp", () => {
    const r = parseAllowedOrigins(
      "/^https:\\/\\/gh-radar-.*\\.vercel\\.app$/",
    );
    expect(r[0]).toBeInstanceOf(RegExp);
    expect((r[0] as RegExp).test("https://gh-radar-pr123.vercel.app")).toBe(
      true,
    );
  });
  it("trims whitespace", () => {
    expect(parseAllowedOrigins("  a  ,  b  ")).toEqual(["a", "b"]);
  });
});

describe("corsOptions().origin", () => {
  it("allows undefined origin (server-to-server)", () => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:3000";
    const cb = vi.fn();
    (corsOptions().origin as any)(undefined, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });
  it("rejects non-allowed origin", () => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:3000";
    const cb = vi.fn();
    (corsOptions().origin as any)("https://evil.com", cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error), false);
  });
  it("accepts regex-matched origin", () => {
    process.env.CORS_ALLOWED_ORIGINS =
      "/^https:\\/\\/gh-radar-.*\\.vercel\\.app$/";
    const cb = vi.fn();
    (corsOptions().origin as any)("https://gh-radar-pr123.vercel.app", cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });
});

describe("corsOptions().exposedHeaders", () => {
  it("기존 3종 유지 + X-Tick-* 8종(37-15 D-07 — 브라우저가 /api/ticks/live 커서 · 상태 · as-of · 더 있음을 읽는다)", () => {
    const exposed = corsOptions().exposedHeaders as string[];
    for (const h of ["X-Last-Updated-At", "X-Request-Id", "Retry-After"]) {
      expect(exposed).toContain(h);
    }
    for (const h of [
      "X-Tick-Epoch",
      "X-Tick-Offset-End",
      "X-Tick-Last-Recv-Ns",
      "X-Tick-State",
      "X-Tick-Queue",
      "X-Tick-Complete",
      "X-Tick-As-Of-Ms",
      // 37 WR-32 — 8MiB 로 잘린 응답의 「더 있음」. 노출하지 않으면 웹이 이어 받기를 몰라 버튼을 두 번 눌러야 한다
      "X-Tick-More",
    ]) {
      expect(exposed).toContain(h);
    }
    expect(new Set(exposed).size).toBe(exposed.length);
  });
});
