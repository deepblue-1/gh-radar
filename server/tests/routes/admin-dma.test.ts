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
