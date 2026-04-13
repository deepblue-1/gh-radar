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
