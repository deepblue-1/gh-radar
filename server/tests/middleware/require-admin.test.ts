import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

import { requireAuth } from "../../src/middleware/require-auth";
import { requireAdmin, requireAdminOrMenu } from "../../src/middleware/require-admin";
import { errorHandler } from "../../src/middleware/error-handler";
import {
  ADMIN_EMAIL,
  ADMIN_TOKEN,
  NO_EMAIL_TOKEN,
  PENDING_TOKEN,
  TRADER_TOKEN,
  VIEWER_TOKEN,
  appUsersWithTraderMenus,
  baseAppUsers,
  baseUsers,
  makeAdminSupabase,
  type AdminSupabaseOpts,
  type AppUserRow,
} from "../fixtures/admin-supabase";

/**
 * Phase 29 (29-10) — `requireAuth → requireAdmin` 체인 단독 검증. 라우트와 분리하려고 탐침 핸들러 하나만 단다.
 * 역할 원천은 `app_users`(이메일 키) 하나 — 목 표에 무엇이 있느냐로 판정이 갈린다.
 */
function makeProbeApp(opts: AdminSupabaseOpts = {}) {
  const { client, rec } = makeAdminSupabase({ users: baseUsers, appUsers: baseAppUsers(), ...opts });
  const app = express();
  app.locals.supabase = client;
  app.get("/probe", requireAuth(), requireAdmin(), (req, res) => {
    res.json({ adminEmail: req.adminEmail, userEmail: req.userEmail });
  });
  app.use(errorHandler);
  return { app, rec };
}

describe("requireAdmin", () => {
  it("Authorization 없음 → 401 UNAUTHENTICATED (app_users 조회 0회)", async () => {
    const { app, rec } = makeProbeApp();
    const res = await request(app).get("/probe");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(rec.ops).toHaveLength(0);
  });

  it("무효 토큰 → 401 UNAUTHENTICATED", async () => {
    const { app, rec } = makeProbeApp();
    const res = await request(app).get("/probe").set("Authorization", "Bearer nope");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(rec.ops).toHaveLength(0);
  });

  it("유효 토큰 · app_users 에 없음(승인 대기) → 403 FORBIDDEN 「관리자만 사용할 수 있어요.」", async () => {
    const { app } = makeProbeApp();
    const res = await request(app).get("/probe").set("Authorization", `Bearer ${PENDING_TOKEN}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "FORBIDDEN", message: "관리자만 사용할 수 있어요." } });
  });

  it("trader → 403 FORBIDDEN", async () => {
    const { app } = makeProbeApp();
    const res = await request(app).get("/probe").set("Authorization", `Bearer ${TRADER_TOKEN}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("이메일 없는 토큰 → 403 (app_users 조회 0회)", async () => {
    const { app, rec } = makeProbeApp();
    const res = await request(app).get("/probe").set("Authorization", `Bearer ${NO_EMAIL_TOKEN}`);
    expect(res.status).toBe(403);
    expect(rec.ops).toHaveLength(0);
  });

  it("admin — 토큰 이메일 대문자도 소문자로 비교 · 1회 조회 · req.adminEmail = 정규화 이메일", async () => {
    const { app, rec } = makeProbeApp();
    const res = await request(app).get("/probe").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ adminEmail: ADMIN_EMAIL, userEmail: "Alex@JX1.io" });
    expect(rec.ops).toEqual([
      { table: "app_users", kind: "select", payload: undefined, options: undefined, filters: [["eq", "email", ADMIN_EMAIL]] },
    ]);
  });

  it("app_users 조회 오류 → 500 DB_ERROR (권한 없음으로 위장하지 않는다 · 원문 미노출)", async () => {
    const { app } = makeProbeApp({ dbError: { select: { message: "connection reset SECRET-DETAIL" } } });
    const res = await request(app).get("/probe").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("SECRET-DETAIL");
  });
});

/**
 * quick 261121-n1b — `requireAuth → requireAdminOrMenu(menu)` 체인. admin 은 전부 · trader 는 그 메뉴가 열렸을 때만 ·
 * viewer 는 저장값이 있어도 없음 · 승인 대기 없음. 탐침 경로 두 개(/probe-pnl · /probe-settlement)로 메뉴 갈림을 본다.
 */
function makeMenuProbeApp(appUsers: AppUserRow[] = baseAppUsers(), opts: AdminSupabaseOpts = {}) {
  const { client, rec } = makeAdminSupabase({ users: baseUsers, appUsers, ...opts });
  const app = express();
  app.locals.supabase = client;
  const echo: express.RequestHandler = (req, res) => {
    res.json({ adminEmail: req.adminEmail, userEmail: req.userEmail });
  };
  app.get("/probe-pnl", requireAuth(), requireAdminOrMenu("pnl"), echo);
  app.get("/probe-settlement", requireAuth(), requireAdminOrMenu("settlement"), echo);
  app.use(errorHandler);
  return { app, rec };
}

const bearer = (tok: string) => ({ Authorization: `Bearer ${tok}` });
const FORBIDDEN_BODY = { error: { code: "FORBIDDEN", message: "관리자만 사용할 수 있어요." } };

describe("requireAdminOrMenu", () => {
  it("admin → 두 메뉴 다 통과 · app_users 조회 1회 · req.adminEmail = 정규화 이메일", async () => {
    const { app, rec } = makeMenuProbeApp();
    const res = await request(app).get("/probe-pnl").set(bearer(ADMIN_TOKEN));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ adminEmail: ADMIN_EMAIL, userEmail: "Alex@JX1.io" });
    expect(rec.ops).toEqual([
      { table: "app_users", kind: "select", payload: undefined, options: undefined, filters: [["eq", "email", ADMIN_EMAIL]] },
    ]);
    expect((await request(app).get("/probe-settlement").set(bearer(ADMIN_TOKEN))).status).toBe(200);
  });

  it("trader + [pnl] → /probe-pnl 통과(adminEmail = trader 이메일) · /probe-settlement 403", async () => {
    const { app } = makeMenuProbeApp(appUsersWithTraderMenus(["pnl"]));
    const ok = await request(app).get("/probe-pnl").set(bearer(TRADER_TOKEN));
    expect(ok.status).toBe(200);
    expect(ok.body.adminEmail).toBe("trader@gmail.com");
    const no = await request(app).get("/probe-settlement").set(bearer(TRADER_TOKEN));
    expect(no.status).toBe(403);
    expect(no.body).toEqual(FORBIDDEN_BODY);
  });

  it("trader + [settlement] → /probe-settlement 통과 · /probe-pnl 403", async () => {
    const { app } = makeMenuProbeApp(appUsersWithTraderMenus(["settlement"]));
    expect((await request(app).get("/probe-settlement").set(bearer(TRADER_TOKEN))).status).toBe(200);
    expect((await request(app).get("/probe-pnl").set(bearer(TRADER_TOKEN))).status).toBe(403);
  });

  it("trader 메뉴 없음([] · 열 없음) → 두 경로 403", async () => {
    for (const appUsers of [appUsersWithTraderMenus([]), baseAppUsers()]) {
      const { app } = makeMenuProbeApp(appUsers);
      expect((await request(app).get("/probe-pnl").set(bearer(TRADER_TOKEN))).status).toBe(403);
      expect((await request(app).get("/probe-settlement").set(bearer(TRADER_TOKEN))).status).toBe(403);
    }
  });

  it("admin_menus 가 배열이 아님(문자열 · null · 객체) → 메뉴 없음으로 취급 → 403", async () => {
    for (const bad of ["pnl", null, { pnl: true }]) {
      const { app } = makeMenuProbeApp(appUsersWithTraderMenus(bad));
      expect((await request(app).get("/probe-pnl").set(bearer(TRADER_TOKEN))).status).toBe(403);
    }
  });

  it("viewer + [pnl, settlement] 저장값 → 두 경로 403 (viewer 는 메뉴 효력 없음)", async () => {
    const appUsers = baseAppUsers().map((r) =>
      r.email === "viewer@gmail.com" ? { ...r, admin_menus: ["pnl", "settlement"] } : r,
    );
    const { app } = makeMenuProbeApp(appUsers);
    expect((await request(app).get("/probe-pnl").set(bearer(VIEWER_TOKEN))).status).toBe(403);
    expect((await request(app).get("/probe-settlement").set(bearer(VIEWER_TOKEN))).status).toBe(403);
  });

  it("승인 대기(표에 없음) → 403", async () => {
    const { app } = makeMenuProbeApp(appUsersWithTraderMenus(["pnl", "settlement"]));
    const res = await request(app).get("/probe-pnl").set(bearer(PENDING_TOKEN));
    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN_BODY);
  });

  it("이메일 없는 토큰 → 403 · app_users 조회 0회", async () => {
    const { app, rec } = makeMenuProbeApp();
    const res = await request(app).get("/probe-pnl").set(bearer(NO_EMAIL_TOKEN));
    expect(res.status).toBe(403);
    expect(rec.ops).toHaveLength(0);
  });

  it("조회 오류 → 500 DB_ERROR (권한 없음으로 위장하지 않는다 · 원문 미노출)", async () => {
    const { app } = makeMenuProbeApp(baseAppUsers(), { dbError: { select: { message: "reset SECRET-DETAIL" } } });
    const res = await request(app).get("/probe-settlement").set(bearer(TRADER_TOKEN));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("SECRET-DETAIL");
  });
});
