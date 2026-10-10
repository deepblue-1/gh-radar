import { afterEach, beforeEach, describe, it, expect } from "vitest";
import pino from "pino";
import request from "supertest";

import { createApp } from "../../src/app";
import { logger } from "../../src/logger";
import type { RelayAdminClient } from "../../src/services/relay-admin-client";
import {
  ADMIN_EMAIL,
  ADMIN_TOKEN,
  baseAppUsers,
  baseUsers,
  makeAdminSupabase,
  type AdminSupabaseOpts,
} from "../fixtures/admin-supabase";
import { OK_RESULTS, makeFakeRelay, relayReject, type FakeRelayHandler } from "../fixtures/fake-relay-admin";

/**
 * Phase 29 (29-13) — Express DMA 프록시. 경로 · 바디는 실제 `relayAdminClientFrom` 래퍼가 만든 문자열을 단언한다
 * (가짜는 저수준 request 만 바꾼다). relay 계약 정본 = 29-11 SUMMARY 「relay 내부 HTTP 계약」 표.
 */

const PASSWORD = "Pw-SECRET-9f3a"; // 로그 · 응답에 나오면 안 되는 표식

function makeApp(opts: AdminSupabaseOpts = {}, relayAdmin?: RelayAdminClient) {
  const sb = makeAdminSupabase({ users: baseUsers, appUsers: baseAppUsers(), ...opts });
  const app = createApp({ supabase: sb.client, relayAdmin });
  return { app, ...sb };
}

const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ADMIN_TOKEN}`);

const kbDma = (over: Record<string, unknown> = {}) => ({
  dmaUserId: "lee01",
  password: PASSWORD,
  account: {
    broker: "KB",
    accountNo: "12345678901",
    name: "이",
    branchNo: "00123",
    traderId: "T00001",
    priority: 0,
  },
  servers: ["KB120", "KB121"],
  ...over,
});

/** pino 가 실제로 직렬화한 출력 전부(자식 로거 · pino-http 포함 — 같은 스트림을 쓴다). */
function captureLogs() {
  const stream = (logger as unknown as Record<symbol, { write: (s: string) => unknown }>)[
    pino.symbols.streamSym
  ];
  const lines: string[] = [];
  const orig = stream.write;
  const prevLevel = logger.level;
  logger.level = "trace";
  stream.write = function (this: unknown, s: string) {
    lines.push(String(s));
    return true;
  };
  return {
    text: () => lines.join(""),
    restore: () => {
      stream.write = orig;
      logger.level = prevLevel;
    },
  };
}

describe("POST /api/admin/users + dma — 트레이서 (D-16)", () => {
  it("trader + dma → app_users upsert 1회 → relay POST /internal/admin/dma-users 1회 → 200 { ok, relayNotified, results } (relay 결과 그대로)", async () => {
    const relay = makeFakeRelay();
    const { app, rec, rows } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/users")).send({
      email: " Lee@Gmail.com ",
      role: "trader",
      dma: kbDma(),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, relayNotified: true, results: OK_RESULTS });

    expect(rec.ops.filter((o) => o.kind === "upsert")).toHaveLength(1);
    expect(rows.get("lee@gmail.com")?.role).toBe("trader");

    // relay: 생성 1회(요청자 이메일 · 웹 사용자 이메일 소문자 · DMA 입력 그대로) → 접근 맵 재적재 1회.
    expect(relay.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /internal/admin/dma-users",
      "POST /internal/admin/access/reload",
    ]);
    expect(relay.calls[0].adminEmail).toBe(ADMIN_EMAIL);
    expect(relay.calls[0].body).toEqual({ email: "lee@gmail.com", ...kbDma() });
  });

  it("교보 계좌의 branch/trader 는 빈 값으로 정규화되어 relay 로 간다 (D-23 ③)", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/users")).send({
      email: "kyo@gmail.com",
      role: "trader",
      dma: kbDma({
        account: { broker: "KYOBO", accountNo: "777", name: "교", branchNo: "00999", traderId: "X1" },
        servers: ["KYOBO119"],
      }),
    });
    expect(res.status).toBe(200);
    const sent = relay.calls[0].body as { account: Record<string, unknown> };
    expect(sent.account).toEqual({
      broker: "KYOBO",
      accountNo: "777",
      name: "교",
      branchNo: "",
      traderId: "",
      priority: 0,
    });
  });

  it("viewer + dma → 400 VALIDATION_FAILED · 쓰기 0 · relay 0", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/users")).send({
      email: "v@gmail.com",
      role: "viewer",
      dma: kbDma(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(rec.ops.filter((o) => o.kind !== "select")).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });

  it("admin/trader 인데 dma 없음 → 200 (DMA 연결 없음 사용자 — 생성 호출 0 · 통보만)", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    for (const role of ["trader", "admin"]) {
      relay.calls.length = 0;
      const res = await auth(request(app).post("/api/admin/users")).send({ email: `${role}x@gmail.com`, role });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, relayNotified: true });
      expect(relay.calls.map((c) => c.path)).toEqual(["/internal/admin/access/reload"]);
    }
  });

  it.each([
    ["비밀번호 빈 값", kbDma({ password: "" })],
    ["비밀번호 65자", kbDma({ password: "p".repeat(65) })],
    ["DMA id 9바이트", kbDma({ dmaUserId: "abcdefghi" })],
    ["DMA id 한글 3자 = 9바이트", kbDma({ dmaUserId: "가나다" })],
    ["DMA id 공백", kbDma({ dmaUserId: "le e" })],
    ["DMA id 빈 값", kbDma({ dmaUserId: "" })],
    ["계좌번호 13자", kbDma({ account: { ...kbDma().account, accountNo: "1234567890123" } })],
    ["계좌번호 공백만", kbDma({ account: { ...kbDma().account, accountNo: "   " } })],
    ["KB 지점 4자", kbDma({ account: { ...kbDma().account, branchNo: "0012" } })],
    ["KB 트레이더 빈 값", kbDma({ account: { ...kbDma().account, traderId: "" } })],
    ["priority 1000", kbDma({ account: { ...kbDma().account, priority: 1000 } })],
    ["servers 빈 배열", kbDma({ servers: [] })],
    ["servers 9개", kbDma({ servers: Array.from({ length: 9 }, (_, i) => `KB${120 + i}`) })],
    ["서버 키 형식 위반", kbDma({ servers: ["KB-120"] })],
    ["KB 계좌에 교보 서버", kbDma({ servers: ["KB120", "KYOBO119"] })],
    ["증권사 enum 밖", kbDma({ account: { ...kbDma().account, broker: "NH" } })],
  ])("%s → 400 VALIDATION_FAILED · 쓰기 0 · relay 0", async (_name, dma) => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/users")).send({ email: "lee@gmail.com", role: "trader", dma });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(rec.ops.filter((o) => o.kind !== "select")).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });

  it("(29-27 CR-01) 이미 DMA 가 연결된 이메일 + dma → 409 DMA_LINKED · app_users upsert 0 · 역할 그대로 · relay 0 · 통보 0", async () => {
    const relay = makeFakeRelay();
    const { app, rec, rows } = makeApp({}, relay.client);
    // trader@gmail.com 은 baseAppUsers 에서 kim01 로 연결돼 있다. 대문자 · 공백도 같은 이메일로 본다.
    const res = await auth(request(app).post("/api/admin/users")).send({
      email: " Trader@Gmail.com ",
      role: "admin",
      dma: kbDma(),
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "DMA_LINKED", message: "이미 DMA 가 연결된 사용자예요." } });
    expect(rec.ops.filter((o) => o.kind !== "select")).toHaveLength(0);
    // 사전 확인은 그 이메일의 dma_user_id 한 번(쓰기보다 앞선다).
    expect(
      rec.ops.filter((o) => o.table === "app_users" && o.filters.some(([, c, v]) => c === "email" && v === "trader@gmail.com")),
    ).toEqual([expect.objectContaining({ kind: "select" })]);
    expect(rows.get("trader@gmail.com")).toMatchObject({ role: "trader", dma_user_id: "kim01" });
    expect(relay.calls).toHaveLength(0);
  });

  it("(29-27) 연결 없는 기존 사용자 + dma → 종전 경로(upsert 1 · relay 생성 1 · 통보 1)", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp(
      { appUsers: [...baseAppUsers(), { email: "t2@gmail.com", role: "viewer", dma_user_id: null }] },
      relay.client,
    );
    const res = await auth(request(app).post("/api/admin/users")).send({ email: "t2@gmail.com", role: "trader", dma: kbDma() });
    expect(res.status).toBe(200);
    expect(rec.ops.filter((o) => o.kind === "upsert")).toHaveLength(1);
    expect(relay.calls.map((c) => c.path)).toEqual(["/internal/admin/dma-users", "/internal/admin/access/reload"]);
  });

  it("relay 409 DMA_USER_EXISTS → 409 그대로(코드 · 문구) · app_users 행은 남는다 · 통보 0", async () => {
    const relay = makeFakeRelay((c) =>
      c.path === "/internal/admin/dma-users" ? relayReject(409, "DMA_USER_EXISTS", "이미 있는 DMA id 예요.") : undefined,
    );
    const { app, rows } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/users")).send({ email: "lee@gmail.com", role: "trader", dma: kbDma() });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "DMA_USER_EXISTS", message: "이미 있는 DMA id 예요." } });
    expect(rows.has("lee@gmail.com")).toBe(true);
    expect(relay.calls.map((c) => c.path)).toEqual(["/internal/admin/dma-users"]);
  });

  it.each<[string, FakeRelayHandler]>([
    ["relay 에 닿지 못함(status 0)", () => ({ status: 0, data: null })],
    ["relay 500", () => relayReject(500, "INTERNAL")],
    ["relay 503", () => ({ status: 503, data: null })],
    ["relay 401(공유 비밀 불일치 — 설정 문제)", () => relayReject(401, "UNAUTHORIZED_RELAY")],
    ["relay 200 인데 results 없음(계약 위반)", () => ({ status: 200, data: { ok: true } })],
    ["relay 409 인데 본문 모양 위반", () => ({ status: 409, data: "conflict" })],
  ])("%s → 502 RELAY_FAILED", async (_name, handler) => {
    const relay = makeFakeRelay((c) => (c.path === "/internal/admin/dma-users" ? handler(c) : undefined));
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/users")).send({ email: "lee@gmail.com", role: "trader", dma: kbDma() });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("RELAY_FAILED");
  });

  it("relay 클라이언트 없음 → 503 RELAY_UNAVAILABLE · 쓰기 전에 거부(반쪽 행 없음)", async () => {
    const { app, rec, rows } = makeApp();
    const res = await auth(request(app).post("/api/admin/users")).send({ email: "lee@gmail.com", role: "trader", dma: kbDma() });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("RELAY_UNAVAILABLE");
    expect(rec.ops.filter((o) => o.kind === "upsert")).toHaveLength(0);
    expect(rows.has("lee@gmail.com")).toBe(false);
  });

  describe("로그 위생 — Express 는 비밀번호를 남기지 않는다 (Phase 15 D-19 · RESEARCH A6)", () => {
    let cap: ReturnType<typeof captureLogs>;
    beforeEach(() => {
      cap = captureLogs();
    });
    afterEach(() => cap.restore());

    it("성공 · relay 거부 · relay 실패 · 검증 실패 어느 경로에도 password 원문이 pino 출력 · 응답에 없다", async () => {
      const outcomes: FakeRelayHandler[] = [
        () => undefined,
        () => relayReject(409, "DMA_USER_EXISTS"),
        () => ({ status: 0, data: null }),
      ];
      const bodies: string[] = [];
      for (const h of outcomes) {
        const relay = makeFakeRelay((c) => (c.path === "/internal/admin/dma-users" ? h(c) : undefined));
        const { app } = makeApp({}, relay.client);
        const res = await auth(request(app).post("/api/admin/users")).send({
          email: "lee@gmail.com",
          role: "trader",
          dma: kbDma(),
        });
        bodies.push(JSON.stringify(res.body));
      }
      // 검증 실패(비밀번호 65자 · 표식 포함) — zod 문구가 입력값을 싣지 않는다.
      const { app } = makeApp({}, makeFakeRelay().client);
      const bad = await auth(request(app).post("/api/admin/users")).send({
        email: "lee@gmail.com",
        role: "trader",
        dma: kbDma({ password: PASSWORD + "x".repeat(64) }),
      });
      expect(bad.status).toBe(400);
      bodies.push(JSON.stringify(bad.body));

      const logged = cap.text();
      expect(logged.length).toBeGreaterThan(0); // 캡처가 실제로 돌았다(감사 · 경고 로그)
      expect(logged).toContain("dma-create");
      expect(logged).not.toContain(PASSWORD);
      for (const b of bodies) expect(b).not.toContain(PASSWORD);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 2 — 나머지 DMA 프록시 (D-15 필드별 즉시 저장 — 각각 relay 1회)
// ─────────────────────────────────────────────────────────────────────────────

describe("DMA 프록시 — relay 계약(29-11) 1:1", () => {
  const kbAccount = kbDma().account;

  it("비밀번호: POST /dma-users/:dma/password → relay 같은 경로 1회 · 바디 { password } → 200 { results }", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/dma-users/kim01/password")).send({ password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: OK_RESULTS });
    expect(relay.calls).toEqual([
      {
        method: "POST",
        path: "/internal/admin/dma-users/kim01/password",
        adminEmail: ADMIN_EMAIL,
        body: { password: PASSWORD },
      },
    ]);
  });

  it("경로의 DMA id 는 한 세그먼트로 다시 인코딩되어 relay 로 간다(한글 2자 = 6바이트)", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).post(`/api/admin/dma-users/${encodeURIComponent("가나")}/reconcile`));
    expect(res.status).toBe(200);
    expect(relay.calls[0].path).toBe(`/internal/admin/dma-users/${encodeURIComponent("가나")}/reconcile`);
  });

  it("계좌 put: PUT /dma-users/:dma/accounts → relay PUT 1회 · 교보 branch/trader 빈 값 · 200 { results }", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/dma-users/kim01/accounts")).send({
      account: { broker: "KYOBO", accountNo: "00777", name: "교", branchNo: "x", traderId: "y", priority: 3 },
      servers: ["KYOBO119", "KYOBO127"],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: OK_RESULTS });
    expect(relay.calls).toEqual([
      {
        method: "PUT",
        path: "/internal/admin/dma-users/kim01/accounts",
        adminEmail: ADMIN_EMAIL,
        body: {
          account: { broker: "KYOBO", accountNo: "00777", name: "교", branchNo: "", traderId: "", priority: 3 },
          servers: ["KYOBO119", "KYOBO127"],
        },
      },
    ]);
  });

  it("계좌 remove: DELETE /dma-users/:dma/accounts/:broker/:accountNo → relay DELETE 1회 · 200 { results }", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).delete("/api/admin/dma-users/kim01/accounts/KB/00123"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: OK_RESULTS });
    expect(relay.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "DELETE /internal/admin/dma-users/kim01/accounts/KB/00123",
    ]);
  });

  it("다시 반영: POST /dma-users/:dma/reconcile → relay POST 1회 · 200 { results }", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/dma-users/kim01/reconcile"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: OK_RESULTS });
    expect(relay.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /internal/admin/dma-users/kim01/reconcile"]);
  });

  it("relay 409 LAST_ACCOUNT → 409 그대로(webapp 이 「유저 삭제」 확인으로 분기)", async () => {
    const relay = makeFakeRelay(() => relayReject(409, "LAST_ACCOUNT", "마지막 계좌는 지울 수 없어요."));
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).delete("/api/admin/dma-users/kim01/accounts/KB/123"));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "LAST_ACCOUNT", message: "마지막 계좌는 지울 수 없어요." } });
  });

  it("relay 409 NO_DMA_USER (비밀번호) · 400 VALIDATION_FAILED (계좌) 는 그대로", async () => {
    const relay = makeFakeRelay((c) =>
      c.path.endsWith("/password") ? relayReject(409, "NO_DMA_USER") : relayReject(400, "VALIDATION_FAILED"),
    );
    const { app } = makeApp({}, relay.client);
    const a = await auth(request(app).post("/api/admin/dma-users/ghost/password")).send({ password: "x" });
    expect(a.status).toBe(409);
    expect(a.body.error.code).toBe("NO_DMA_USER");
    const b = await auth(request(app).put("/api/admin/dma-users/kim01/accounts")).send({
      account: kbAccount,
      servers: ["KB120"],
    });
    expect(b.status).toBe(400);
    expect(b.body.error.code).toBe("VALIDATION_FAILED");
  });

  it.each<[string, (app: Parameters<typeof request>[0]) => request.Test]>([
    ["password", (app) => auth(request(app).post("/api/admin/dma-users/kim01/password")).send({ password: "p" })],
    ["accounts put", (app) => auth(request(app).put("/api/admin/dma-users/kim01/accounts")).send({ account: kbAccount, servers: ["KB120"] })],
    ["accounts remove", (app) => auth(request(app).delete("/api/admin/dma-users/kim01/accounts/KB/1"))],
    ["reconcile", (app) => auth(request(app).post("/api/admin/dma-users/kim01/reconcile"))],
  ])("%s: relay 에 닿지 못함 → 502 RELAY_FAILED · 클라이언트 없음 → 503 RELAY_UNAVAILABLE", async (_n, call) => {
    const down = makeApp({}, makeFakeRelay(() => ({ status: 0, data: null })).client);
    const r1 = await call(down.app);
    expect(r1.status).toBe(502);
    expect(r1.body.error.code).toBe("RELAY_FAILED");
    const none = makeApp();
    const r2 = await call(none.app);
    expect(r2.status).toBe(503);
    expect(r2.body.error.code).toBe("RELAY_UNAVAILABLE");
  });

  it.each<[string, (app: Parameters<typeof request>[0]) => request.Test]>([
    ["비밀번호 빈 값", (app) => auth(request(app).post("/api/admin/dma-users/kim01/password")).send({ password: "" })],
    ["DMA id 9바이트(경로)", (app) => auth(request(app).post("/api/admin/dma-users/abcdefghi/reconcile"))],
    ["계좌 put 서버 증권사 불일치", (app) => auth(request(app).put("/api/admin/dma-users/kim01/accounts")).send({ account: kbAccount, servers: ["KYOBO119"] })],
    ["계좌 put 서버 빈 배열", (app) => auth(request(app).put("/api/admin/dma-users/kim01/accounts")).send({ account: kbAccount, servers: [] })],
    ["계좌 remove 증권사 enum 밖", (app) => auth(request(app).delete("/api/admin/dma-users/kim01/accounts/NH/1"))],
    ["계좌 remove 계좌번호 13자", (app) => auth(request(app).delete("/api/admin/dma-users/kim01/accounts/KB/1234567890123"))],
  ])("%s → 400 VALIDATION_FAILED · relay 0", async (_n, call) => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await call(app);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(relay.calls).toHaveLength(0);
  });

  it("trader 토큰 → 403 · relay 0", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await request(app)
      .post("/api/admin/dma-users/kim01/reconcile")
      .set("Authorization", "Bearer tok-trader");
    expect(res.status).toBe(403);
    expect(relay.calls).toHaveLength(0);
  });
});

describe("POST /api/admin/users/:email/dma — 기존 사용자에 DMA 연결", () => {
  const withT2 = () => ({ appUsers: [...baseAppUsers(), { email: "t2@gmail.com", role: "trader", dma_user_id: null }] });

  it("DMA 없는 trader → relay POST /internal/admin/dma-users 1회(email 포함) → 200 { results, relayNotified }", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp(withT2(), relay.client);
    const res = await auth(request(app).post("/api/admin/users/T2%40gmail.com/dma")).send(kbDma());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: OK_RESULTS, relayNotified: true });
    expect(relay.calls.map((c) => c.path)).toEqual([
      "/internal/admin/dma-users",
      "/internal/admin/access/reload",
    ]);
    expect(relay.calls[0].body).toEqual({ email: "t2@gmail.com", ...kbDma() });
  });

  it("이미 DMA 가 연결된 사용자 → 409 DMA_LINKED · viewer → 400 · 없는 사용자 → 404 · relay 0", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const linked = await auth(request(app).post("/api/admin/users/trader%40gmail.com/dma")).send(kbDma());
    expect(linked.status).toBe(409);
    expect(linked.body.error.code).toBe("DMA_LINKED");
    const viewer = await auth(request(app).post("/api/admin/users/viewer%40gmail.com/dma")).send(kbDma());
    expect(viewer.status).toBe(400);
    expect(viewer.body.error.code).toBe("VALIDATION_FAILED");
    const ghost = await auth(request(app).post("/api/admin/users/ghost%40gmail.com/dma")).send(kbDma());
    expect(ghost.status).toBe(404);
    expect(relay.calls).toHaveLength(0);
  });

  it("relay 409 DMA_USER_EXISTS → 409 그대로", async () => {
    const relay = makeFakeRelay(() => relayReject(409, "DMA_USER_EXISTS"));
    const { app } = makeApp(withT2(), relay.client);
    const res = await auth(request(app).post("/api/admin/users/t2%40gmail.com/dma")).send(kbDma());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DMA_USER_EXISTS");
  });
});

describe("DELETE /api/admin/users/:email — DMA 있는 사용자 (D-15 공유 판정)", () => {
  it("단독 DMA → relay DELETE /internal/admin/dma-users/:dma → 전 서버 ok(deleted) → 행 삭제 → { ok, deleted: true, results }", async () => {
    const relay = makeFakeRelay();
    const { app, rows, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).delete("/api/admin/users/trader%40gmail.com"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: true, results: OK_RESULTS, relayNotified: true });
    expect(rows.has("trader@gmail.com")).toBe(false);
    expect(relay.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "DELETE /internal/admin/dma-users/kim01",
      "POST /internal/admin/access/reload",
    ]);
    // 공유 판정 = 같은 dma_user_id 행 수(head count) 1회.
    const counts = rec.ops.filter((o) => o.count);
    expect(counts).toHaveLength(1);
    expect(counts[0].filters).toEqual([["eq", "dma_user_id", "kim01"]]);
  });

  it("한 서버 failed → relay deleted=false → 행 유지 · { ok, deleted: false, results } · 통보 0", async () => {
    const results = [
      { server: "KB120", outcome: "ok", usersRev: "3" },
      { server: "KB121", outcome: "failed", code: 9, message: "다른 작업 중입니다" },
    ];
    const relay = makeFakeRelay((c) =>
      c.method === "DELETE" ? { status: 200, data: { results, deleted: false } } : undefined,
    );
    const { app, rows } = makeApp({}, relay.client);
    const res = await auth(request(app).delete("/api/admin/users/trader%40gmail.com"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: false, results, relayNotified: false });
    expect(rows.has("trader@gmail.com")).toBe(true);
    expect(relay.calls.map((c) => c.path)).toEqual(["/internal/admin/dma-users/kim01"]);
  });

  it("공유(같은 dma_user_id 행 2개) → 이 웹 사용자 행만 삭제 · relay DMA 경로 0회(통보만)", async () => {
    const relay = makeFakeRelay();
    const { app, rows } = makeApp(
      { appUsers: [...baseAppUsers(), { email: "trader2@gmail.com", role: "trader", dma_user_id: "kim01" }] },
      relay.client,
    );
    const res = await auth(request(app).delete("/api/admin/users/trader%40gmail.com"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: true, relayNotified: true });
    expect(rows.has("trader@gmail.com")).toBe(false);
    expect(rows.get("trader2@gmail.com")?.dma_user_id).toBe("kim01");
    expect(relay.calls.map((c) => c.path)).toEqual(["/internal/admin/access/reload"]);
  });

  it("단독 DMA · relay 409 NO_DMA_USER → 409 그대로 · 행 유지", async () => {
    const relay = makeFakeRelay(() => relayReject(409, "NO_DMA_USER"));
    const { app, rows } = makeApp({}, relay.client);
    const res = await auth(request(app).delete("/api/admin/users/trader%40gmail.com"));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NO_DMA_USER");
    expect(rows.has("trader@gmail.com")).toBe(true);
  });

  it("단독 DMA · relay 클라이언트 없음 → 503 · 행 유지 / relay 못 닿음 → 502 · 행 유지", async () => {
    const none = makeApp();
    const a = await auth(request(none.app).delete("/api/admin/users/trader%40gmail.com"));
    expect(a.status).toBe(503);
    expect(none.rows.has("trader@gmail.com")).toBe(true);
    const down = makeApp({}, makeFakeRelay(() => ({ status: 0, data: null })).client);
    const b = await auth(request(down.app).delete("/api/admin/users/trader%40gmail.com"));
    expect(b.status).toBe(502);
    expect(b.body.error.code).toBe("RELAY_FAILED");
    expect(down.rows.has("trader@gmail.com")).toBe(true);
  });

  it("공유 판정이 DMA 있는 사용자를 HAS_DMA 로 거부하지 않는다(29-10 분기 대체)", async () => {
    const { app } = makeApp({}, makeFakeRelay().client);
    const res = await auth(request(app).delete("/api/admin/users/trader%40gmail.com"));
    expect(res.body.error?.code).not.toBe("HAS_DMA");
  });
});

describe("로그 위생 — 비밀번호 변경 · DMA id 마스킹", () => {
  let cap: ReturnType<typeof captureLogs>;
  beforeEach(() => {
    cap = captureLogs();
  });
  afterEach(() => cap.restore());

  it("비밀번호 변경 성공 · 실패에서 password 원문이 없고, 감사 로그의 DMA id 는 마스킹(kim01 → ki***(5))", async () => {
    for (const h of [() => undefined, () => ({ status: 0, data: null })] as FakeRelayHandler[]) {
      const { app } = makeApp({}, makeFakeRelay(h).client);
      await auth(request(app).post("/api/admin/dma-users/kim01/password")).send({ password: PASSWORD });
    }
    const logged = cap.text();
    expect(logged).toContain("dma-password");
    expect(logged).toContain("ki***(5)");
    expect(logged).not.toContain(PASSWORD);
  });
});
