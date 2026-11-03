import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { TICK_LIVE_HEADERS } from "@gh-radar/shared";

import { createApp, type AppDeps } from "../../src/app";
import { createTickgwClient } from "../../src/services/tickgw-client";
import { createTickGateCache } from "../../src/services/tick-gate-cache";

/**
 * `GET /api/ticks/live` — 당일 바이트 경로 끝에서 끝 (37-15 · D-05 · D-07 · D-08 · D-22).
 *
 * 가짜 tickgw = `node:http` 서버를 127.0.0.1 임의 포트에 띄우고 **진짜 `createTickgwClient`** 로 결선한다 — 브라우저 →
 * requireAuth → 게이트 캐시 → tickgw-client → 가짜 tickgw → 바이트 · X-Tick-* 그대로를 한 경로로 잰다.
 */

const SECRET = "s".repeat(40);
const ISIN = "KR7000650002";

let userSeq = 0;
const nextUser = () => ({ id: `00000000-0000-4000-8000-${String(15_000 + ++userSeq).padStart(12, "0")}` });

type RpcCall = { fn: string; params: Record<string, unknown> };

function makeSupabase(opts: { user: { id: string }; access?: boolean | "error" }) {
  const rpcCalls: RpcCall[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: opts.user }, error: null }) },
    async rpc(fn: string, params: Record<string, unknown>) {
      rpcCalls.push({ fn, params });
      if (fn === "tick_access_for_user") {
        if (opts.access === "error") return { data: null, error: { message: "boom", code: "XX000" } };
        return { data: { access: opts.access ?? true }, error: null };
      }
      if (fn === "tick_today_for_user") {
        return { data: { access: true, date: "20261102", rows: [] }, error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
    from() {
      throw new Error("RPC 만");
    },
  };
  return { client, rpcCalls };
}

/** 가짜 tickgw 응답 정의 — 요청을 기록하고 고정 응답을 준다. */
type FakeReply = { status: number; headers?: Record<string, string>; body?: Buffer | string };
type FakeReq = { url: string; secret: string | undefined; acceptEncoding: string | undefined };

const servers: http.Server[] = [];

async function startFakeTickgw(reply: (req: FakeReq) => FakeReply) {
  const seen: FakeReq[] = [];
  const server = http.createServer((req, res) => {
    const r: FakeReq = {
      url: req.url ?? "",
      secret: req.headers["x-tickgw-secret"] as string | undefined,
      acceptEncoding: req.headers["accept-encoding"] as string | undefined,
    };
    seen.push(r);
    const out = reply(r);
    const body = typeof out.body === "string" ? Buffer.from(out.body) : (out.body ?? Buffer.alloc(0));
    res.writeHead(out.status, { "Content-Length": body.length, ...out.headers });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return { server, seen, baseUrl: `http://127.0.0.1:${port}` };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => (s.listening ? s.close(() => resolve()) : resolve()))),
  );
});

/** 압축이 걸렸다면 확실히 줄어들 바이트(0 반복 · 4KB) + 앞머리 표식 — 「그대로」 와 「압축 안 됨」 을 함께 잰다. */
const BYTES = Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), Buffer.alloc(4096, 0)]);

const liveHeaders = (over: Record<string, string> = {}) => ({
  "Content-Type": "application/octet-stream",
  "Cache-Control": "no-store",
  "X-Tick-Epoch": "6f1c2b9e-0000-4000-8000-000000000001",
  "X-Tick-Offset-End": String(BYTES.length),
  "X-Tick-Last-Recv-Ns": "1762041600123456789",
  "X-Tick-State": "ready",
  "X-Tick-Queue": "0",
  "X-Tick-Complete": "true",
  "X-Tick-As-Of-Ms": "1762041601500",
  ...over,
});

function appWith(client: unknown, extra: Partial<AppDeps> = {}) {
  return createApp({ supabase: client as any, ...extra });
}

const auth = (r: request.Test) => r.set("Authorization", "Bearer tok");
const LIVE = (q: string) => `/api/ticks/live?${q}`;

describe("GET /api/ticks/live — 트레이서(가짜 tickgw · 진짜 클라이언트)", () => {
  it("offset 0 → 바이트 동일 · X-Tick-* 7종 그대로 · 압축 안 됨 · no-store · 비밀 헤더 · 쿼리 그대로", async () => {
    const fake = await startFakeTickgw(() => ({ status: 200, headers: liveHeaders(), body: BYTES }));
    const { client, rpcCalls } = makeSupabase({ user: nextUser() });
    const app = appWith(client, { tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }) });

    const r = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=KRX&offset=0`)))
      .set("Accept-Encoding", "gzip, deflate, br")
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(r.status).toBe(200);
    expect(Buffer.compare(r.body as Buffer, BYTES)).toBe(0);
    expect(r.headers["content-type"]).toBe("application/octet-stream");
    expect(r.headers["content-encoding"]).toBeUndefined();
    expect(r.headers["content-length"]).toBe(String(BYTES.length));
    expect(r.headers["cache-control"]).toBe("no-store");
    const expected = liveHeaders();
    for (const name of Object.values(TICK_LIVE_HEADERS)) {
      expect(r.headers[name.toLowerCase()]).toBe(expected[name as keyof typeof expected]);
    }
    // 루프는 shared 이름과 tickgw 리터럴이 달라도 undefined === undefined 로 통과한다 — 이름 · 값을 따로 잠근다
    expect(TICK_LIVE_HEADERS.asOfMs).toBe("X-Tick-As-Of-Ms");
    expect(r.headers["x-tick-as-of-ms"]).toBe("1762041601500");

    expect(fake.seen).toHaveLength(1);
    const u = new URL(fake.seen[0].url, "http://x");
    expect(u.pathname).toBe("/internal/ticks/live");
    expect(Object.fromEntries(u.searchParams)).toEqual({ isin: ISIN, ex: "KRX", offset: "0" });
    expect(fake.seen[0].secret).toBe(SECRET);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["tick_access_for_user"]);
  });

  it("D-05 — state loading + queue 2 · complete false · 빈 last-recv 를 그대로 넘긴다 · epoch/offset 커서 전달", async () => {
    const headers = liveHeaders({
      "X-Tick-State": "loading",
      "X-Tick-Queue": "2",
      "X-Tick-Complete": "false",
      "X-Tick-Last-Recv-Ns": "",
    });
    const fake = await startFakeTickgw(() => ({ status: 200, headers, body: BYTES.subarray(0, 4) }));
    const { client } = makeSupabase({ user: nextUser() });
    const app = appWith(client, { tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }) });

    const r = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=NXT&epoch=e-1&offset=1234`)));
    expect(r.status).toBe(200);
    expect(r.headers["x-tick-state"]).toBe("loading");
    expect(r.headers["x-tick-queue"]).toBe("2");
    expect(r.headers["x-tick-complete"]).toBe("false");
    expect(r.headers["x-tick-last-recv-ns"]).toBe("");
    const u = new URL(fake.seen[0].url, "http://x");
    expect(Object.fromEntries(u.searchParams)).toEqual({ isin: ISIN, ex: "NXT", offset: "1234", epoch: "e-1" });
  });

  it("옛 tickgw(X-Tick-As-Of-Ms 없음) → 응답에도 없음 · 나머지 헤더는 그대로", async () => {
    const { "X-Tick-As-Of-Ms": _omit, ...old } = liveHeaders();
    const fake = await startFakeTickgw(() => ({ status: 200, headers: old, body: BYTES }));
    const { client } = makeSupabase({ user: nextUser() });
    const app = appWith(client, { tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }) });

    const r = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=KRX&offset=0`)));
    expect(r.status).toBe(200);
    expect(r.headers["x-tick-as-of-ms"]).toBeUndefined();
    expect(r.headers["x-tick-epoch"]).toBe(old["X-Tick-Epoch"]);
    expect(r.headers["x-tick-offset-end"]).toBe(old["X-Tick-Offset-End"]);
    expect(r.headers["x-tick-last-recv-ns"]).toBe(old["X-Tick-Last-Recv-Ns"]);
    expect(r.headers["x-tick-state"]).toBe("ready");
    expect(r.headers["x-tick-queue"]).toBe("0");
    expect(r.headers["x-tick-complete"]).toBe("true");
  });

  it("CORS — 다른 출처 웹이 X-Tick-As-Of-Ms 를 읽도록 노출 목록에 올린다", async () => {
    const fake = await startFakeTickgw(() => ({ status: 200, headers: liveHeaders(), body: BYTES }));
    const { client } = makeSupabase({ user: nextUser() });
    const app = appWith(client, { tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }) });

    const r = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=KRX&offset=0`))).set("Origin", "http://localhost:3000");
    expect(r.status).toBe(200);
    expect(r.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(r.headers["access-control-expose-headers"]).toMatch(/X-Tick-As-Of-Ms/i);
  });

  it("tickgw 409 {epoch} → 409 {epoch}", async () => {
    const fake = await startFakeTickgw(() => ({
      status: 409,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epoch: "new-epoch" }),
    }));
    const { client } = makeSupabase({ user: nextUser() });
    const app = appWith(client, { tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }) });
    const r = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=KRX&epoch=old&offset=10`)));
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ epoch: "new-epoch" });
  });

  it("가짜 tickgw 를 닫으면 502 TICKS_LIVE_UNREACHABLE", async () => {
    const fake = await startFakeTickgw(() => ({ status: 200, headers: liveHeaders(), body: BYTES }));
    await new Promise<void>((resolve) => fake.server.close(() => resolve()));
    const { client } = makeSupabase({ user: nextUser() });
    const app = appWith(client, { tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }) });
    const r = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=KRX`)));
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe("TICKS_LIVE_UNREACHABLE");
  });

  it("tickgw 가 계약 밖 응답(401 비밀 불일치 · 503 · 헤더 빠진 200 · epoch 없는 409) → 502", async () => {
    const replies: FakeReply[] = [
      { status: 401, body: JSON.stringify({ error: "UNAUTHORIZED" }) },
      { status: 503, body: JSON.stringify({ error: "CACHE_UNAVAILABLE" }) },
      { status: 200, headers: { "Content-Type": "application/octet-stream" }, body: BYTES },
      { status: 409, body: "{}" },
    ];
    let i = 0;
    const fake = await startFakeTickgw(() => replies[i++]);
    const { client } = makeSupabase({ user: nextUser() });
    const app = appWith(client, { tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }) });
    for (let k = 0; k < replies.length; k++) {
      const r = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=KRX`)));
      expect(r.status).toBe(502);
      expect(r.body.error.code).toBe("TICKS_LIVE_UNREACHABLE");
    }
  });

  it("tickgw 미결선 → 503 TICKS_LIVE_UNAVAILABLE · 게이트 RPC 0회", async () => {
    const { client, rpcCalls } = makeSupabase({ user: nextUser() });
    const r = await auth(request(appWith(client)).get(LIVE(`isin=${ISIN}&ex=KRX`)));
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("TICKS_LIVE_UNAVAILABLE");
    expect(rpcCalls).toEqual([]);
  });

  it("미매핑 → 403 DMA_UNMAPPED · tickgw 호출 0회", async () => {
    const fake = await startFakeTickgw(() => ({ status: 200, headers: liveHeaders(), body: BYTES }));
    const user = nextUser();
    const { client, rpcCalls } = makeSupabase({ user, access: false });
    const app = appWith(client, { tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }) });
    const r = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=KRX`)));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_UNMAPPED");
    expect(rpcCalls).toEqual([{ fn: "tick_access_for_user", params: { p_user_id: user.id } }]);
    expect(fake.seen).toHaveLength(0);
  });

  it("게이트 RPC 오류 → 500 DB_ERROR · 캐시하지 않는다(다음 요청이 다시 RPC)", async () => {
    const fake = await startFakeTickgw(() => ({ status: 200, headers: liveHeaders(), body: BYTES }));
    const { client, rpcCalls } = makeSupabase({ user: nextUser(), access: "error" });
    const app = appWith(client, { tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }) });
    const r1 = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=KRX`)));
    const r2 = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=KRX`)));
    expect(r1.status).toBe(500);
    expect(r1.body.error.code).toBe("DB_ERROR");
    expect(r2.status).toBe(500);
    expect(rpcCalls).toHaveLength(2);
    expect(fake.seen).toHaveLength(0);
  });

  it("D-08 — 60초 안 폴링 12회 → RPC 1회 · 61초 뒤 1회 더 · 사용자별 따로", async () => {
    const fake = await startFakeTickgw(() => ({ status: 200, headers: liveHeaders(), body: BYTES }));
    let t = 1_762_041_600_000;
    const user = nextUser();
    const { client, rpcCalls } = makeSupabase({ user });
    const app = appWith(client, {
      tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }),
      tickGate: createTickGateCache({ now: () => t }),
    });

    for (let k = 0; k < 12; k++) {
      const r = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=KRX`)));
      expect(r.status).toBe(200);
      t += 5_000; // 5초 폴링 — 12회째가 55초
    }
    expect(rpcCalls.filter((c) => c.fn === "tick_access_for_user")).toHaveLength(1);
    expect(fake.seen).toHaveLength(12);

    t = 1_762_041_600_000 + 61_000;
    const r = await auth(request(app).get(LIVE(`isin=${ISIN}&ex=KRX`)));
    expect(r.status).toBe(200);
    expect(rpcCalls.filter((c) => c.fn === "tick_access_for_user")).toHaveLength(2);
  });

  it("입력 — isin · ex 형식 · offset 음수/소수 · epoch 65자 → 400 (게이트 · tickgw 0회)", async () => {
    const fake = await startFakeTickgw(() => ({ status: 200, headers: liveHeaders(), body: BYTES }));
    const { client, rpcCalls } = makeSupabase({ user: nextUser() });
    const app = appWith(client, { tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }) });
    for (const q of [
      `isin=kr7000650002&ex=KRX`,
      `isin=${ISIN}&ex=KOSPI`,
      `isin=${ISIN}`,
      `isin=${ISIN}&ex=KRX&offset=-1`,
      `isin=${ISIN}&ex=KRX&offset=1.5`,
      `isin=${ISIN}&ex=KRX&epoch=${"e".repeat(65)}`,
    ]) {
      const r = await auth(request(app).get(LIVE(q)));
      expect(r.status, q).toBe(400);
    }
    expect(rpcCalls).toEqual([]);
    expect(fake.seen).toHaveLength(0);
  });

  it("미인증 → 401 (게이트 · tickgw 0회)", async () => {
    const fake = await startFakeTickgw(() => ({ status: 200, headers: liveHeaders(), body: BYTES }));
    const { client, rpcCalls } = makeSupabase({ user: nextUser() });
    const app = appWith(client, { tickgw: createTickgwClient({ baseUrl: fake.baseUrl, secret: SECRET }) });
    const r = await request(app).get(LIVE(`isin=${ISIN}&ex=KRX`));
    expect(r.status).toBe(401);
    expect(rpcCalls).toEqual([]);
    expect(fake.seen).toHaveLength(0);
  });
});

describe("GET /api/ticks/today — live = tickgw 결선 여부 (D-22)", () => {
  it("미결선 false · 결선 true", async () => {
    const { client } = makeSupabase({ user: nextUser() });
    const off = await auth(request(appWith(client)).get("/api/ticks/today"));
    expect(off.status).toBe(200);
    expect(off.body.live).toBe(false);

    const tickgw = createTickgwClient({ baseUrl: "http://127.0.0.1:1", secret: SECRET });
    const on = await auth(request(appWith(client, { tickgw })).get("/api/ticks/today"));
    expect(on.status).toBe(200);
    expect(on.body.live).toBe(true);
  });
});
