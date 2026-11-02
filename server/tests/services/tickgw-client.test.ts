import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { assertTickgwUrl, createTickgwClient } from "../../src/services/tickgw-client";

/**
 * tickgw-client — 사설 대역 가드 · 비밀 헤더 · 경로 접두 · 상태 0 규약 (37-15 · D-07).
 */

describe("assertTickgwUrl — http · 10.0.0.0/8 · 127.0.0.1 만", () => {
  it("통과 — 10.x 사설 주소 · 127.0.0.1", () => {
    expect(assertTickgwUrl("http://10.10.0.5:8092").host).toBe("10.10.0.5:8092");
    expect(assertTickgwUrl("http://10.255.255.255:8092").hostname).toBe("10.255.255.255");
    expect(assertTickgwUrl("http://127.0.0.1:8092").hostname).toBe("127.0.0.1");
  });

  it("거부 — 공인 IP · 다른 사설 대역 · 엉뚱한 호스트 · https · 자격 증명 · 형식 오류", () => {
    for (const bad of [
      "http://8.8.8.8:8092", // 공인 IP
      "http://34.64.10.10:8092", // GCP 공인
      "http://192.168.0.10:8092", // 10/8 밖 사설
      "http://172.16.0.1:8092",
      "http://10.evil.com:8092", // 10. 으로 시작하는 호스트 이름
      "http://10.0.0.1.evil.com:8092",
      "http://localhost:8092", // 이름은 받지 않는다
      "http://radar-gw:8092",
      "http://[::1]:8092",
      "https://10.10.0.5:8092", // https — tickgw 는 VPC 안 평문 http 만 연다
      "ftp://10.10.0.5",
      "http://user:pw@10.10.0.5:8092",
      "not a url",
      "",
    ]) {
      expect(() => assertTickgwUrl(bad), bad).toThrow(/TICKGW_URL/);
    }
  });

  it("10.x 16진 · 8진 표기 우회 거부(WHATWG URL 이 정규화한 결과만 본다)", () => {
    // WHATWG URL 은 0x0a.0.0.1 · 012.0.0.1 을 10.0.0.1 로 정규화한다 — 정규화 뒤가 10/8 이면 진짜 10/8 이다.
    expect(assertTickgwUrl("http://0x0a.0.0.1:8092").hostname).toBe("10.0.0.1");
    // 0x08.8.8.8 → 8.8.8.8 공인 — 거부.
    expect(() => assertTickgwUrl("http://0x08.8.8.8:8092")).toThrow(/TICKGW_URL/);
  });

  it("createTickgwClient 도 같은 가드 · 빈 비밀 거부", () => {
    expect(() => createTickgwClient({ baseUrl: "http://8.8.8.8:8092", secret: "x".repeat(40) })).toThrow(/TICKGW_URL/);
    expect(() => createTickgwClient({ baseUrl: "http://10.10.0.5:8092", secret: "" })).toThrow(/TICKGW_SECRET/);
  });
});

// ── 실제 HTTP ───────────────────────────────────────────────────────

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => (s.listening ? s.close(() => resolve()) : resolve()))),
  );
});

async function fake(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe("createTickgwClient.live", () => {
  it("비밀 헤더 · 경로 /internal/ticks/live · 쿼리 · identity 인코딩 · 바이트 Buffer 그대로 · X-Tick-* 만 추린다", async () => {
    const seen: http.IncomingMessage[] = [];
    const body = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0xff, 0x10]);
    const f = await fake((req, res) => {
      seen.push(req);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "X-Tick-Epoch": "ep",
        "X-Tick-Offset-End": "7",
        "X-Tick-Last-Recv-Ns": "",
        "X-Tick-State": "queued",
        "X-Tick-Queue": "3",
        "X-Tick-Complete": "false",
        "X-Other": "drop",
      });
      res.end(body);
    });
    const c = createTickgwClient({ baseUrl: f.baseUrl, secret: "k".repeat(40) });
    const r = await c.live({ isin: "KR7000650002", ex: "KRX", offset: 0 });

    expect(r.status).toBe(200);
    expect(Buffer.isBuffer(r.body)).toBe(true);
    expect(Buffer.compare(r.body!, body)).toBe(0);
    expect(r.headers).toEqual({
      epoch: "ep",
      offsetEnd: "7",
      lastRecvNs: "",
      state: "queued",
      queue: "3",
      complete: "false",
    });
    expect(seen[0].headers["x-tickgw-secret"]).toBe("k".repeat(40));
    expect(seen[0].headers["accept-encoding"]).toBe("identity");
    const u = new URL(seen[0].url!, "http://x");
    expect(u.pathname).toBe("/internal/ticks/live");
    expect(Object.fromEntries(u.searchParams)).toEqual({ isin: "KR7000650002", ex: "KRX", offset: "0" });
  });

  it("baseUrl 의 경로는 무시하고 origin + /internal/ticks/live 만 부른다", async () => {
    const urls: string[] = [];
    const f = await fake((req, res) => {
      urls.push(req.url!);
      res.writeHead(200, { "X-Tick-Epoch": "e", "X-Tick-Offset-End": "0" });
      res.end();
    });
    const c = createTickgwClient({ baseUrl: `${f.baseUrl}/other/prefix`, secret: "k".repeat(40) });
    const r = await c.live({ isin: "KR7000650002", ex: "NXT", epoch: "e", offset: 5 });
    expect(r.status).toBe(200);
    expect(r.body?.length).toBe(0);
    expect(new URL(urls[0], "http://x").pathname).toBe("/internal/ticks/live");
  });

  it("4xx/5xx 는 throw 하지 않고 status 그대로(409 본문 포함)", async () => {
    const f = await fake((_req, res) => {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ epoch: "new" }));
    });
    const c = createTickgwClient({ baseUrl: f.baseUrl, secret: "k".repeat(40) });
    const r = await c.live({ isin: "KR7000650002", ex: "KRX", epoch: "old", offset: 3 });
    expect(r.status).toBe(409);
    expect(JSON.parse(r.body!.toString("utf8"))).toEqual({ epoch: "new" });
  });

  it("네트워크 실패 → status 0 · netCode · body null (throw 안 함)", async () => {
    const f = await fake((_req, res) => res.end());
    await new Promise<void>((resolve) => f.server.close(() => resolve()));
    const c = createTickgwClient({ baseUrl: f.baseUrl, secret: "k".repeat(40) });
    const r = await c.live({ isin: "KR7000650002", ex: "KRX", offset: 0 });
    expect(r.status).toBe(0);
    expect(r.body).toBeNull();
    expect(r.netCode).toBe("ECONNREFUSED");
  });

  it("타임아웃 → status 0 (ECONNABORTED)", async () => {
    const f = await fake(() => {
      /* 응답하지 않는다 */
    });
    const c = createTickgwClient({ baseUrl: f.baseUrl, secret: "k".repeat(40), timeoutMs: 100 });
    const r = await c.live({ isin: "KR7000650002", ex: "KRX", offset: 0 });
    expect(r.status).toBe(0);
    expect(r.netCode).toBe("ECONNABORTED");
    f.server.closeAllConnections();
  });
});
