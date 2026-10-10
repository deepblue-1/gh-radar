import { afterEach, beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { assertRelayUrl, createRelayAdminClient } from "../../src/services/relay-admin-client";
import { logger } from "../../src/logger";
import { loadConfig } from "../../src/config";

/**
 * Phase 29 (29-10) — relay 내부 HTTP 클라이언트(Admin 명령용). 16-16 에서 지운 `relay-client.ts` 의 사설 대역 가드를
 * 그대로 복원했는지 · 공유 비밀 / 감사 헤더 · 타임아웃 · 「throw 하지 않는다」 계약을 로컬 http 서버로 증명한다.
 */

const SECRET = "test-relay-secret-XYZ";
const ADMIN = "alex@jx1.io";

describe("assertRelayUrl — 사설 대역 가드", () => {
  it.each([
    ["http://10.10.0.5:8091", "production"],
    ["http://10.10.0.0:8091", "production"],
    ["http://10.10.0.63:8091", "production"],
    ["https://10.10.0.10:8091", "production"],
    ["http://127.0.0.1:8091", "development"],
    ["http://localhost:8091", "test"],
  ])("%s (%s) → 통과", (url, env) => {
    expect(() => assertRelayUrl(url, env)).not.toThrow();
  });

  it.each([
    ["http://10.10.0.64:8091", "production"],
    ["http://10.10.1.5:8091", "production"],
    ["http://8.8.8.8:8091", "development"],
    ["http://127.0.0.1:8091", "production"],
    ["http://localhost:8091", "production"],
    ["ftp://10.10.0.5:8091", "production"],
    ["not a url", "development"],
    ["http://10.10.0.5x:8091", "production"],
  ])("%s (%s) → throw", (url, env) => {
    expect(() => assertRelayUrl(url, env)).toThrow(/RELAY_INTERNAL_URL/);
  });

  it("createRelayAdminClient 도 가드를 거친다 — 대역 밖이면 생성 단계에서 throw", () => {
    expect(() =>
      createRelayAdminClient({ baseUrl: "http://8.8.8.8:8091", secret: SECRET, timeoutMs: 1000, nodeEnv: "production" }),
    ).toThrow(/RELAY_INTERNAL_URL/);
  });
});

// ── 로컬 가짜 relay ────────────────────────────────────────────────
type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };
let server: http.Server;
let base: string;
let seen: Seen[] = [];
let reply: (req: http.IncomingMessage, res: http.ServerResponse) => void;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });
      reply(req, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

afterEach(() => {
  seen = [];
  vi.restoreAllMocks();
});

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const client = (timeoutMs = 2000) =>
  createRelayAdminClient({ baseUrl: base, secret: SECRET, timeoutMs, nodeEnv: "test" });

describe("createRelayAdminClient — 요청 계약", () => {
  it("reloadAccess → POST /internal/admin/access/reload · X-Relay-Secret · x-admin-email · { status, data }", async () => {
    reply = (_req, res) => json(res, 200, { ok: true, changed: true });
    const r = await client().reloadAccess(ADMIN);
    expect(r).toEqual({ status: 200, data: { ok: true, changed: true } });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("/internal/admin/access/reload");
    expect(seen[0].headers["x-relay-secret"]).toBe(SECRET);
    expect(seen[0].headers["x-admin-email"]).toBe(ADMIN);
  });

  it("reloadRegistry → POST /internal/admin/registry/reload", async () => {
    reply = (_req, res) => json(res, 200, { ok: true, changed: false });
    const r = await client().reloadRegistry(ADMIN);
    expect(r).toEqual({ status: 200, data: { ok: true, changed: false } });
    expect(seen[0].url).toBe("/internal/admin/registry/reload");
  });

  it("request — 바디는 JSON 으로 · 상태코드는 그대로(validateStatus 무조건 통과 — 409 를 throw 하지 않는다)", async () => {
    reply = (_req, res) => json(res, 409, { error: { code: "DMA_USER_EXISTS" } });
    const r = await client().request("POST", "/internal/admin/dma-users", ADMIN, { email: "a@b.co" });
    expect(r).toEqual({ status: 409, data: { error: { code: "DMA_USER_EXISTS" } } });
    expect(JSON.parse(seen[0].body)).toEqual({ email: "a@b.co" });
    expect(seen[0].headers["content-type"]).toMatch(/application\/json/);
  });

  it("relay 500 → { status: 500 } (throw 없음)", async () => {
    reply = (_req, res) => json(res, 500, { error: { code: "INTERNAL" } });
    const r = await client().reloadAccess(ADMIN);
    expect(r.status).toBe(500);
  });

  it("타임아웃 = timeoutMs — 응답이 늦으면 { status: 0, data: null } · warn 로그에 비밀 · 헤더 값 없음", async () => {
    const warn = vi.spyOn(logger, "warn");
    reply = (_req, res) => {
      setTimeout(() => json(res, 200, { ok: true, changed: false }), 600).unref();
    };
    const t0 = Date.now();
    const r = await client(100).reloadAccess(ADMIN);
    const elapsed = Date.now() - t0;
    expect(r).toEqual({ status: 0, data: null });
    expect(elapsed).toBeLessThan(500);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain("x-relay-secret");
    expect(logged).not.toContain("X-Relay-Secret");
  });

  it("연결 거부(relay 꺼짐) → { status: 0, data: null } (throw 없음)", async () => {
    const dead = http.createServer();
    await new Promise<void>((r) => dead.listen(0, "127.0.0.1", r));
    const port = (dead.address() as AddressInfo).port;
    await new Promise<void>((r) => dead.close(() => r()));
    const c = createRelayAdminClient({ baseUrl: `http://127.0.0.1:${port}`, secret: SECRET, timeoutMs: 1000, nodeEnv: "test" });
    expect(await c.reloadAccess(ADMIN)).toEqual({ status: 0, data: null });
  });

  it("경로는 /internal/admin/ 아래만 — 다른 내부 경로로 공유 비밀을 보내지 않는다", async () => {
    await expect(client().request("POST", "/internal/orders", ADMIN, {})).rejects.toThrow(/\/internal\/admin\//);
    expect(seen).toHaveLength(0);
  });

  it("요청자 이메일이 비면 보내지 않는다(relay 감사 헤더 필수)", async () => {
    await expect(client().reloadAccess("")).rejects.toThrow(/adminEmail/);
    expect(seen).toHaveLength(0);
  });
});

describe("relayAdminTimeoutMs — Express 상한 (29-32 WR-07)", () => {
  afterEach(() => {
    delete process.env.RELAY_ADMIN_TIMEOUT_MS;
  });

  it("기본 15000 — relay 요청 마감 10초 + 시세 전환 DB RPC · 네트워크 여유 · 브라우저 20초 안", () => {
    delete process.env.RELAY_ADMIN_TIMEOUT_MS;
    expect(loadConfig().relayAdminTimeoutMs).toBe(15_000);
  });

  it("env RELAY_ADMIN_TIMEOUT_MS 가 덮는다 · 숫자가 아니면 기본값", () => {
    process.env.RELAY_ADMIN_TIMEOUT_MS = "18000";
    expect(loadConfig().relayAdminTimeoutMs).toBe(18_000);
    process.env.RELAY_ADMIN_TIMEOUT_MS = "abc";
    expect(loadConfig().relayAdminTimeoutMs).toBe(15_000);
  });
});
