/**
 * Phase 15 Plan 05 — RELAY-01/RELAY-03. 내부 HTTP 표면 통합 테스트.
 *
 * 검증 대상은 **관문 그 자체**다 — 비밀이 없거나 틀리면 아무 라우트에도 닿지 않고,
 * `/healthz` 만 예외로 통과하며, 실패 응답이 기대값을 흘리지 않는다는 것.
 *
 * 실제 `http.Server` 에 붙여 `fetch` 로 두드린다(supertest 대신). 15-04 가 세운 규율
 * — "이 계층의 리스크는 배선이므로 스텁을 최소화하고 진짜를 쓴다" — 을 따른 것이고,
 * 헤더 부재/오타/길이 불일치는 실제 HTTP 왕복으로 봐야 의미가 있다. relay 의
 * devDependency 도 늘지 않는다.
 *
 * 가짜 타이머를 쓰지 않는다 — 이 파일은 실제 소켓 왕복만 한다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { createOrderApi, type OrderApiSessions } from "../src/order/order-api.js";
import type { SessionStats } from "../src/dma/session-manager.js";

const SECRET = "test-relay-order-secret-0123456789";

/** 세션 통계만 흉내 낸다 — 이 모듈이 `SessionManager` 에서 쓰는 전부다. */
function fakeSessions(stats: SessionStats): OrderApiSessions {
  return { stats: () => stats };
}

type Harness = {
  url: (path: string) => string;
  close: () => Promise<void>;
};

async function start(stats: SessionStats, nodeEnv = "test"): Promise<Harness> {
  const app = createOrderApi({
    relayOrderSecret: SECRET,
    appVersion: "test-sha",
    nodeEnv,
    sessions: fakeSessions(stats),
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;

  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("createOrderApi — /healthz + 공유 비밀 관문", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await start({ sessionCount: 0, readyCount: 0 });
  });

  afterEach(async () => {
    await h.close();
  });

  it("① /healthz 는 비밀 헤더 없이 200 이다 (uptime check 대상)", async () => {
    const res = await fetch(h.url("/healthz"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.version).toBe("test-sha");
  });

  it("② /healthz 응답에 식별자 계열 키가 없다 (T-15-22)", async () => {
    const res = await fetch(h.url("/healthz"));
    const body = (await res.json()) as Record<string, unknown>;

    // 필드 화이트리스트 — 늘어나면 이 테스트가 먼저 깨져야 한다.
    expect(Object.keys(body).sort()).toEqual([
      "dma",
      "sessionCount",
      "status",
      "version",
      "vpn",
    ]);

    const dumped = JSON.stringify(body).toLowerCase();
    for (const forbidden of ["accountno", "account_no", "userid", "user_id", "dmauserid"]) {
      expect(dumped).not.toContain(forbidden);
    }
  });

  it("③ 비밀 헤더가 없으면 401 이고 본문이 기대값을 흘리지 않는다 (T-15-06)", async () => {
    const res = await fetch(h.url("/internal/anything"), { method: "POST" });

    expect(res.status).toBe(401);
    const raw = await res.text();
    expect(JSON.parse(raw)).toEqual({
      error: { code: "UNAUTHORIZED_RELAY", message: "Unauthorized" },
    });
    // 기대 비밀도, 그 조각도 응답에 없다.
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain(SECRET.slice(0, 8));
  });

  it("④ 비밀이 틀리면 401 이다 (길이는 같고 내용만 다른 경우)", async () => {
    const wrong = `${SECRET.slice(0, -1)}X`;
    expect(wrong).toHaveLength(SECRET.length);

    const res = await fetch(h.url("/internal/anything"), {
      method: "POST",
      headers: { "x-relay-secret": wrong },
    });

    expect(res.status).toBe(401);
    expect((await res.json()) as unknown).toMatchObject({
      error: { code: "UNAUTHORIZED_RELAY" },
    });
  });

  it("⑤ 올바른 비밀은 관문을 통과해 라우터(404)까지 도달한다", async () => {
    const res = await fetch(h.url("/internal/orders"), {
      method: "POST",
      headers: { "x-relay-secret": SECRET, "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });

    // 주문 라우트는 D-25 게이트 뒤(15-16)라 아직 없다 — 401 이 아니라 404 여야 한다.
    expect(res.status).toBe(404);
    expect((await res.json()) as unknown).toEqual({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  it("⑥ 길이가 다른 비밀도 throw 없이 401 이다 (timingSafeEqual 길이 함정)", async () => {
    for (const wrong of ["", "x", `${SECRET}-extra-suffix`]) {
      const res = await fetch(h.url("/internal/anything"), {
        method: "POST",
        headers: { "x-relay-secret": wrong },
      });
      // 길이 불일치로 `timingSafeEqual` 이 터졌다면 500 이 온다.
      expect(res.status).toBe(401);
    }
  });

  it("⑦ 세션이 0개면 degraded 가 아니다 (장 시작 전이 정상 상태)", async () => {
    const res = await fetch(h.url("/healthz"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", vpn: true, dma: true, sessionCount: 0 });
  });

  it("⑧ 세션이 있는데 Ready 가 0개면 degraded + HTTP 503 (Assumption A7)", async () => {
    const degraded = await start({ sessionCount: 2, readyCount: 0 });
    try {
      const res = await fetch(degraded.url("/healthz"));
      const body = (await res.json()) as Record<string, unknown>;

      // 본문만 degraded 로 두면 uptime check 가 못 잡는다 — 상태 코드로도 내려야 한다.
      expect(res.status).toBe(503);
      expect(body).toMatchObject({ status: "degraded", vpn: false, dma: false, sessionCount: 2 });
    } finally {
      await degraded.close();
    }
  });

  it("⑨ Ready 세션이 하나라도 있으면 ok 다", async () => {
    const ready = await start({ sessionCount: 3, readyCount: 1 });
    try {
      const res = await fetch(ready.url("/healthz"));
      expect(res.status).toBe(200);
      expect((await res.json()) as unknown).toMatchObject({ status: "ok", sessionCount: 3 });
    } finally {
      await ready.close();
    }
  });

  it("⑩ 관문은 GET·DELETE 등 모든 메서드에 걸린다 (POST 전용이 아니다)", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
      const res = await fetch(h.url("/internal/anything"), { method });
      expect(res.status).toBe(401);
    }
  });
});
