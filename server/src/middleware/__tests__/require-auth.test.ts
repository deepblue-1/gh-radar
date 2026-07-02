import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { requireAuth } from "../require-auth";

/**
 * requireAuth 미들웨어 유닛 테스트 (D-02, T-14-02 Spoofing mitigate).
 *
 * fake `req.app.locals.supabase.auth.getUser` 를 vi.fn 으로 주입해
 * JWT 검증 4케이스(무헤더 / Bearer 부재 / getUser error / 유효 토큰)를 검증한다.
 * res 는 status/json spy. next 는 vi.fn.
 */

function makeReq(
  authHeader: string | undefined,
  getUser?: ReturnType<typeof vi.fn>,
): Request {
  const supabase = {
    auth: {
      getUser:
        getUser ??
        vi.fn(async () => ({ data: { user: null }, error: new Error("boom") })),
    },
  };
  return {
    header: (name: string) =>
      name.toLowerCase() === "authorization" ? authHeader : undefined,
    app: { locals: { supabase } },
  } as unknown as Request;
}

function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res as unknown as Response & {
    statusCode?: number;
    body?: { error?: { code?: string; message?: string } };
  };
}

describe("requireAuth 미들웨어", () => {
  it("Test 1: Authorization 헤더 없음 → 401 UNAUTHENTICATED, next() 미호출", async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();

    await requireAuth()(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body?.error?.code).toBe("UNAUTHENTICATED");
    expect(next).not.toHaveBeenCalled();
  });

  it("Test 2: Bearer prefix 없는 헤더 → 401", async () => {
    const req = makeReq("token-without-bearer");
    const res = makeRes();
    const next = vi.fn();

    await requireAuth()(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body?.error?.code).toBe("UNAUTHENTICATED");
    expect(next).not.toHaveBeenCalled();
  });

  it("Test 3: supabase.auth.getUser 가 error 반환 → 401 세션 만료", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: null },
      error: new Error("invalid jwt"),
    }));
    const req = makeReq("Bearer expired.jwt.token", getUser);
    const res = makeRes();
    const next = vi.fn();

    await requireAuth()(req, res, next);

    expect(getUser).toHaveBeenCalledWith("expired.jwt.token");
    expect(res.statusCode).toBe(401);
    expect(res.body?.error?.code).toBe("UNAUTHENTICATED");
    expect(res.body?.error?.message).toBe("세션이 만료되었습니다.");
    expect(next).not.toHaveBeenCalled();
  });

  it("Test 4: 유효 토큰 → req.userId 설정 + next() 호출", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "user-123" } },
      error: null,
    }));
    const req = makeReq("Bearer valid.jwt.token", getUser);
    const res = makeRes();
    const next = vi.fn();

    await requireAuth()(req, res, next);

    expect(getUser).toHaveBeenCalledWith("valid.jwt.token");
    expect((req as unknown as { userId?: string }).userId).toBe("user-123");
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
