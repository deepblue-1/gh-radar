/**
 * Phase 15 Plan 05 → Phase 16 Plan 16 — 내부 HTTP 표면 통합 테스트.
 *
 * 검증 대상은 **관문 그 자체**다 — 비밀이 없거나 틀리면 아무 라우트에도 닿지 않고,
 * `/healthz` 만 예외로 통과하며, 실패 응답이 기대값을 흘리지 않는다는 것.
 *
 * ★ 주문 케이스 14종은 이 파일에서 사라졌다 (D-02). `POST /internal/orders` 라우트가
 * 제거됐고 같은 규율의 검증 정본은 `ws-order.test.ts` 17종이다. 여기에는 그 대신
 * **"주문 경로가 정말 없다"** 를 잠그는 케이스 ⑪ 이 남는다 — 올바른 비밀로도 404 여야
 * 하고(라우트 부재), 비밀 없이는 404 조차 받지 못해야 한다(경로 존재 여부도 정보다).
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
import os from "node:os";
import type { AddressInfo } from "node:net";

import { createOrderApi, type OrderApiSessions } from "../src/order/order-api.js";
import type { SessionStats } from "../src/dma/session-manager.js";

const SECRET = "test-relay-order-secret-0123456789";

type Harness = {
  url: (path: string) => string;
  close: () => Promise<void>;
};

type StartOptions = {
  stats?: SessionStats;
  nodeEnv?: string;
  /** 게이트웨이 주소 — 회선 판정 기준. */
  dmaHost?: string;
  /** 인터페이스 목록. 생략하면 VPN 이 서 있는 상태(UP_INTERFACES). */
  interfaces?: NodeJS.Dict<os.NetworkInterfaceInfo[]>;
};

/** VPN 이 서 있는 VM 의 실측 인터페이스 (2026-09-06 radar-gw). */
const UP_INTERFACES: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
  lo: [{ address: "127.0.0.1", family: "IPv4", internal: true } as os.NetworkInterfaceInfo],
  ens4: [{ address: "10.10.0.5", family: "IPv4", internal: false } as os.NetworkInterfaceInfo],
  tun0: [{ address: "10.41.1.124", family: "IPv4", internal: false } as os.NetworkInterfaceInfo],
};

/** VPN 이 내려간 상태 — `tun0` 과 그 주소가 통째로 사라진다. */
const DOWN_INTERFACES: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
  lo: UP_INTERFACES.lo,
  ens4: UP_INTERFACES.ens4,
};

async function start(opts: StartOptions = {}): Promise<Harness> {
  const stats = opts.stats ?? { sessionCount: 0, readyCount: 0, everReadyCount: 0, stalledCount: 0 };

  const apiSessions: OrderApiSessions = {
    stats: () => stats,
  };

  const app = createOrderApi({
    relayOrderSecret: SECRET,
    // 회선 판정 기준. 기본은 "VPN 이 서 있다" — 아래 주입으로 없는 상태도 시험한다.
    // ★ D-27 — **실 게이트웨이 주소를 적지 않는다.** `isGatewayLinkUp` 은 /16 만 보므로
    //   `tun0`(10.41.1.124) 과 같은 대역이기만 하면 판정이 동일하다. 실주소를 테스트에
    //   박아 두면 저장소를 읽는 것만으로 사내망 호스트가 드러난다(T-16-09 grep 게이트).
    dmaHost: opts.dmaHost ?? "10.41.0.10",
    networkInterfaces: () => opts.interfaces ?? UP_INTERFACES,
    appVersion: "test-sha",
    nodeEnv: opts.nodeEnv ?? "test",
    sessions: apiSessions,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;

  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe("createOrderApi — /healthz + 공유 비밀 관문", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await start();
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
      "everReadyCount",
      "sessionCount",
      "stalledCount",
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

  it("⑤ 올바른 비밀은 관문을 통과한다 (401 이 아니라 404 다)", async () => {
    const res = await fetch(h.url("/internal/anything"), {
      method: "POST",
      headers: { "x-relay-secret": SECRET, "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });

    // 관문을 통과했으므로 401 이 아니다. 통과한 뒤 갈 곳이 없어 404 다.
    expect(res.status).toBe(404);
    expect((await res.json()) as unknown).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("⑤-b 없는 경로는 여전히 404 다", async () => {
    const res = await fetch(h.url("/internal/nope"), {
      method: "POST",
      headers: { "x-relay-secret": SECRET },
    });

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

  it("⑦-b 접속자 0명이어도 VPN 이 내려가면 degraded + 503 (2026-09-06 회귀 가드)", async () => {
    // 옛 구현은 `sessionCount === 0` 이면 무조건 ok 였다. 그래서 아무도 안 쓰는 시간에
    // VPN 이 죽어도 uptime check 가 200 만 보고 넘어갔고, 실장애가 사용자 신고로 발견됐다.
    const noVpn = await start({ interfaces: DOWN_INTERFACES });
    try {
      const res = await fetch(noVpn.url("/healthz"));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(503);
      // 회선과 세션은 **분리된 신호**다 — 세션이 없으니 dma 는 문제없고, vpn 만 false 다.
      expect(body).toMatchObject({ status: "degraded", vpn: false, dma: true, sessionCount: 0 });
    } finally {
      await noVpn.close();
    }
  });

  it("⑦-c 로컬 mock(DMA_HOST=127.0.0.1) 은 VPN 없이도 ok 다", async () => {
    // mock 배포에는 터널이 없다. loopback 이 곧 게이트웨이 경로이므로 degraded 가 아니다.
    const mock = await start({ dmaHost: "127.0.0.1", interfaces: DOWN_INTERFACES });
    try {
      const res = await fetch(mock.url("/healthz"));
      expect(res.status).toBe(200);
      expect((await res.json()) as Record<string, unknown>).toMatchObject({ vpn: true });
    } finally {
      await mock.close();
    }
  });

  it("⑧ Ready 였다가 죽은 세션 2건이면 degraded + HTTP 503 (Assumption A7)", async () => {
    // 게이트웨이가 **있었는데** 죽은 경우다. everReadyCount 가 sessionCount 와 같으므로
    // 「애초에 없는 환경」과 구분된다 — 이쪽은 진짜 장애이고 알림이 울려야 한다.
    const degraded = await start({
      stats: { sessionCount: 2, readyCount: 0, everReadyCount: 2, stalledCount: 0 },
    });
    try {
      const res = await fetch(degraded.url("/healthz"));
      const body = (await res.json()) as Record<string, unknown>;

      // 본문만 degraded 로 두면 uptime check 가 못 잡는다 — 상태 코드로도 내려야 한다.
      expect(res.status).toBe(503);
      // 회선은 멀쩡한데 세션만 못 서는 경우다(게이트웨이 거부 등). 두 신호를 분리했으므로
      // `vpn` 은 true 로 남아야 한다 — 여기를 false 로 적으면 VPN 을 애먼 범인으로 만든다.
      expect(body).toMatchObject({
        status: "degraded",
        vpn: true,
        dma: false,
        sessionCount: 2,
        everReadyCount: 2,
      });
    } finally {
      await degraded.close();
    }
  });

  it("⑧-b 한 번도 Ready 인 적 없는 세션 1건은 ok 200 이다 — 게이트웨이 부재는 장애가 아니다 (gap 4)", async () => {
    // `DMA_HOST` 가 뜨지 않은 환경. 로그인 사용자가 붙는 즉시 세션이 만들어지지만 영원히
    // Ready 가 되지 않는다. 이 구간을 503 으로 보고하면 uptime 이 상시 적색이 되고,
    // 상시 적색은 곧 알림 무시다 (15-05 계약 대체, 16-21).
    const absent = await start({
      stats: { sessionCount: 1, readyCount: 0, everReadyCount: 0, stalledCount: 0 },
    });
    try {
      const res = await fetch(absent.url("/healthz"));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        status: "ok",
        vpn: true,
        dma: true,
        sessionCount: 1,
        everReadyCount: 0,
        // 유예 안이라 stalled 가 아니다 — 16-30 이 붙인 시간 상한이 16-21 의 면제를
        // 잡아먹지 않는다는 회귀 잠금이다.
        stalledCount: 0,
      });
    } finally {
      await absent.close();
    }
  });

  it("⑧-c never-Ready 세션이 있어도 VPN 이 죽으면 degraded 503 이다 (세션 완화가 회선 신호를 가리지 않는다)", async () => {
    const absentNoVpn = await start({
      stats: { sessionCount: 1, readyCount: 0, everReadyCount: 0, stalledCount: 0 },
      interfaces: DOWN_INTERFACES,
    });
    try {
      const res = await fetch(absentNoVpn.url("/healthz"));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(503);
      // 세션 판정은 통과(dma:true)했는데 회선이 죽었다 — 두 신호가 분리되어 있다는 증거다.
      expect(body).toMatchObject({ status: "degraded", vpn: false, dma: true, everReadyCount: 0 });
    } finally {
      await absentNoVpn.close();
    }
  });

  it("⑧-d everReadyCount 0 이라도 stalledCount 가 1 이면 degraded 503 이다 (재시작 후 영원한 초록 차단, 16-30)", async () => {
    // 게이트웨이가 죽어 있는 동안 relay 가 한 번 재시작한 상태의 재현. `hasBeenReady`
    // 래치는 프로세스 메모리라 0 으로 지워졌지만, 세션이 생성 후 STALE_SESSION_MS 를
    // 넘기도록 Ready 를 못 봤다는 사실은 남는다 — 그것이 진짜 장애의 유일한 신호다.
    const stalled = await start({
      stats: { sessionCount: 1, readyCount: 0, everReadyCount: 0, stalledCount: 1 },
    });
    try {
      const res = await fetch(stalled.url("/healthz"));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(503);
      // 회선은 멀쩡하다 — 죽은 것은 게이트웨이 프로세스이지 터널이 아니다.
      expect(body).toMatchObject({
        status: "degraded",
        vpn: true,
        dma: false,
        sessionCount: 1,
        everReadyCount: 0,
        stalledCount: 1,
      });
    } finally {
      await stalled.close();
    }
  });

  it("⑧-e stalled 세션이 있어도 지금 Ready 가 하나 있으면 ok 200 이다 (readyCount 우선)", async () => {
    // 한 사용자의 세션이 오래 미Ready 라도 다른 세션이 지금 서 있으면 게이트웨이는 산다.
    // 판정의 `|| readyCount > 0` 항이 stalled 를 덮는다는 계약을 잠근다.
    const mixed = await start({
      stats: { sessionCount: 2, readyCount: 1, everReadyCount: 1, stalledCount: 1 },
    });
    try {
      const res = await fetch(mixed.url("/healthz"));
      expect(res.status).toBe(200);
      expect((await res.json()) as unknown).toMatchObject({ status: "ok", stalledCount: 1 });
    } finally {
      await mixed.close();
    }
  });

  it("⑨ Ready 세션이 하나라도 있으면 ok 다", async () => {
    const ready = await start({
      stats: { sessionCount: 3, readyCount: 1, everReadyCount: 3, stalledCount: 0 },
    });
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

  it("⑪ POST /internal/orders 는 제거됐다 — 올바른 비밀로도 404 다 (D-02 / T-16-11)", async () => {
    // 15-05 의 형식 검사가 살아 있다면 400 VALIDATION_FAILED 가, 세션 검사가 살아 있다면
    // 409 SESSION_NOT_READY 가 온다. 라우트가 정말 사라졌을 때만 404 다.
    const res = await fetch(h.url("/internal/orders"), {
      method: "POST",
      headers: { "x-relay-secret": SECRET, "content-type": "application/json" },
      body: JSON.stringify({
        userId: "11111111-2222-4333-8444-555555555555",
        orderRowId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        isin: "KR7005930003",
        exchange: "KRX",
        market: "K",
        side: "B",
        orderType: "N",
        qty: 10,
        price: 70_000,
        accountNo: "12345678901",
      }),
    });

    expect(res.status).toBe(404);
    expect((await res.json()) as unknown).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("⑪-b 비밀 없는 /internal/orders 는 404 조차 받지 못한다 (경로 존재 여부도 정보다)", async () => {
    const res = await fetch(h.url("/internal/orders"), { method: "POST" });
    expect(res.status).toBe(401);
  });
});
