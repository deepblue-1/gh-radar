import { describe, it, expect } from "vitest";
import request from "supertest";
import type { AdminAccountsOverview } from "@gh-radar/shared";

import { createApp } from "../../src/app";
import type { RelayAdminClient } from "../../src/services/relay-admin-client";
import {
  ADMIN_EMAIL,
  ADMIN_TOKEN,
  TRADER_TOKEN,
  baseAppUsers,
  baseUsers,
  makeAdminSupabase,
  type AdminSupabaseOpts,
} from "../fixtures/admin-supabase";
import { OK_RESULTS, makeFakeRelay, relayReject } from "../fixtures/fake-relay-admin";

/**
 * quick 261106-lwu — `/api/admin/accounts/*` 계좌 마스터. 불변식(백필 · FK · 연결 행 동시 갱신)은 DB(pgTAP
 * dma_accounts_master.test.sql)가 쥐고, 여기는 RPC 호출 · 오류 코드 매핑 · relay 팬아웃(D-08) · 등록이 relay 를
 * 부르지 않는다(D-07)는 것만 증명한다.
 */

const overview: AdminAccountsOverview = {
  accounts: [
    {
      broker: "KB",
      accountNo: "8800000001",
      name: "주식",
      branchNo: "00123",
      traderId: "T00001",
      updatedAt: "2026-11-06T00:00:00+00:00",
      users: [
        {
          dmaUserId: "kim01",
          emails: ["trader@gmail.com"],
          priority: 1,
          servers: [{ serverKey: "KB120", state: "active" }],
        },
      ],
    },
    // quick 261106-ntl — 예수금 · 수수료 팬아웃 대상: active 2명 + removing-only 1명.
    {
      broker: "KB",
      accountNo: "8800000002",
      name: "공유",
      branchNo: "00123",
      traderId: "T00001",
      updatedAt: "2026-11-06T00:00:00+00:00",
      users: [
        {
          dmaUserId: "kim01",
          emails: ["trader@gmail.com"],
          priority: 1,
          servers: [
            { serverKey: "KB120", state: "active" },
            { serverKey: "KB121", state: "active" },
          ],
        },
        { dmaUserId: "lee01", emails: [], priority: 4, servers: [{ serverKey: "KB120", state: "active" }] },
        { dmaUserId: "park01", emails: [], priority: 2, servers: [{ serverKey: "KB121", state: "removing" }] },
      ],
    },
    {
      broker: "KYOBO",
      accountNo: "777",
      name: "",
      branchNo: "",
      traderId: "",
      updatedAt: "2026-11-06T00:00:00+00:00",
      users: [],
    },
  ],
};

type RpcHandler = NonNullable<AdminSupabaseOpts["rpc"]>[string];
const ok: RpcHandler = () => ({ data: null, error: null });
const pgErr = (code: string, message: string): RpcHandler => () => ({ data: null, error: { code, message } });

const LINKS = {
  links: [
    { dmaUserId: "kim01", priority: 1, servers: ["KB120", "KB121"] },
    { dmaUserId: "lee01", priority: 4, servers: ["KB120"] },
    { dmaUserId: "park01", priority: 2, servers: [] }, // removing 만 남은 링크 — 팬아웃 대상 아님
  ],
};

function makeApp(opts: AdminSupabaseOpts = {}, relayAdmin?: RelayAdminClient) {
  const sb = makeAdminSupabase({
    users: baseUsers,
    appUsers: baseAppUsers(),
    ...opts,
    rpc: {
      admin_accounts_raw: () => ({ data: overview, error: null }),
      dma_admin_create_account: ok,
      dma_admin_update_account: () => ({ data: LINKS, error: null }),
      dma_admin_delete_account: ok,
      ...opts.rpc,
    },
  });
  const app = createApp({ supabase: sb.client, relayAdmin });
  return { app, ...sb };
}

const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ADMIN_TOKEN}`);

describe("GET /api/admin/accounts — 계좌 목록 (D-06)", () => {
  it("RPC admin_accounts_raw 1회 → 그대로 · 역할 조회 1회(adminRouter 가 한 번 더 하지 않음) · relay 0", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/accounts"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(overview);
    expect(rec.rpcCalls.map((c) => c.fn)).toEqual(["admin_accounts_raw"]);
    expect(rec.ops.filter((o) => o.table === "app_users" && o.kind === "select")).toHaveLength(1);
    expect(relay.calls).toHaveLength(0);
  });

  it("trader → 403 FORBIDDEN · RPC 0", async () => {
    const { app, rec } = makeApp();
    const res = await request(app).get("/api/admin/accounts").set("Authorization", `Bearer ${TRADER_TOKEN}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("미인증 → 401", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/admin/accounts");
    expect(res.status).toBe(401);
  });

  it("RPC 오류 · 모양 위반 → 500 DB_ERROR(빈 목록으로 감추지 않음)", async () => {
    const e1 = makeApp({ rpc: { admin_accounts_raw: pgErr("XX000", "boom") } });
    const r1 = await auth(request(e1.app).get("/api/admin/accounts"));
    expect(r1.status).toBe(500);
    expect(r1.body.error.code).toBe("DB_ERROR");
    const e2 = makeApp({ rpc: { admin_accounts_raw: () => ({ data: { accounts: null }, error: null }) } });
    const r2 = await auth(request(e2.app).get("/api/admin/accounts"));
    expect(r2.status).toBe(500);
  });
});

describe("POST /api/admin/accounts — 등록 (D-07 · DB 마스터만)", () => {
  it("계좌번호 정규화(\" 00123\" → \"123\") · RPC 1회 · relay 0 · 200 { ok }", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/accounts")).send({
      broker: "KB",
      accountNo: " 00123",
      name: " 주식 ",
      branchNo: "00123",
      traderId: "T00001",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(rec.rpcCalls).toEqual([
      {
        fn: "dma_admin_create_account",
        params: {
          p_account: { broker: "KB", accountNo: "123", name: "주식", branchNo: "00123", traderId: "T00001" },
        },
      },
    ]);
    expect(relay.calls).toHaveLength(0);
  });

  it("교보 지점 · 트레이더는 빈 값으로 RPC 에", async () => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).post("/api/admin/accounts")).send({
      broker: "KYOBO",
      accountNo: "777",
      branchNo: "00999",
      traderId: "X1",
    });
    expect(res.status).toBe(200);
    expect(rec.rpcCalls[0].params).toEqual({
      p_account: { broker: "KYOBO", accountNo: "777", name: "", branchNo: "", traderId: "" },
    });
  });

  it.each([
    ["KB 지점 4자", { broker: "KB", accountNo: "1", branchNo: "0012", traderId: "T00001" }],
    ["KB 트레이더 누락", { broker: "KB", accountNo: "1", branchNo: "00123" }],
    ["계좌번호 13자", { broker: "KB", accountNo: "1234567890123", branchNo: "00123", traderId: "T00001" }],
    ["증권사 enum 밖", { broker: "NH", accountNo: "1" }],
    ["계좌명 41자", { broker: "KYOBO", accountNo: "1", name: "가".repeat(41) }],
  ])("%s → 400 VALIDATION_FAILED · RPC 0", async (_l, body) => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).post("/api/admin/accounts")).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("RPC ACCOUNT_EXISTS → 409 ACCOUNT_EXISTS · CHECK 23514 → 400 · 그 밖 → 500", async () => {
    const body = { broker: "KYOBO", accountNo: "777" };
    const dup = makeApp({ rpc: { dma_admin_create_account: pgErr("P0001", "ACCOUNT_EXISTS") } });
    const r1 = await auth(request(dup.app).post("/api/admin/accounts")).send(body);
    expect(r1.status).toBe(409);
    expect(r1.body.error).toMatchObject({ code: "ACCOUNT_EXISTS", message: "이미 등록된 계좌예요." });
    const chk = makeApp({ rpc: { dma_admin_create_account: pgErr("23514", "check") } });
    const r2 = await auth(request(chk.app).post("/api/admin/accounts")).send(body);
    expect(r2.status).toBe(400);
    const other = makeApp({ rpc: { dma_admin_create_account: pgErr("XX000", "boom") } });
    const r3 = await auth(request(other.app).post("/api/admin/accounts")).send(body);
    expect(r3.status).toBe(500);
    expect(r3.body.error.code).toBe("DB_ERROR");
  });
});

describe("PUT /api/admin/accounts/:broker/:accountNo — 저장 + 팬아웃 (D-08)", () => {
  const body = { name: "새이름", branchNo: "00999", traderId: "N00001" };

  it("링크 2명(active) + removing-only 1명 → relay putAccount 2회(각 priority · active 서버 그대로 · 저장 값 · orderEndpoint 없음) · fanout 2건", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/accounts/KB/008800000001")).send(body);
    expect(res.status).toBe(200);
    expect(rec.rpcCalls).toEqual([
      {
        fn: "dma_admin_update_account",
        params: { p_broker: "KB", p_account_no: "8800000001", p_name: "새이름", p_branch_no: "00999", p_trader_id: "N00001" },
      },
    ]);
    const acct = { broker: "KB", accountNo: "8800000001", name: "새이름", branchNo: "00999", traderId: "N00001" };
    expect(relay.calls).toEqual([
      {
        method: "PUT",
        path: "/internal/admin/dma-users/kim01/accounts",
        adminEmail: ADMIN_EMAIL,
        body: { account: { ...acct, priority: 1 }, servers: ["KB120", "KB121"] },
      },
      {
        method: "PUT",
        path: "/internal/admin/dma-users/lee01/accounts",
        adminEmail: ADMIN_EMAIL,
        body: { account: { ...acct, priority: 4 }, servers: ["KB120"] },
      },
    ]);
    expect(res.body).toEqual({
      ok: true,
      fanout: [
        { dmaUserId: "kim01", results: OK_RESULTS, error: null },
        { dmaUserId: "lee01", results: OK_RESULTS, error: null },
      ],
    });
  });

  it("한 사용자 relay 409 · 다른 사용자 502 → 200 유지 · 그 항목 error {code, message} · 성공 항목 results", async () => {
    const { app } = makeApp(
      {
        rpc: {
          dma_admin_update_account: () => ({
            data: {
              links: [
                { dmaUserId: "kim01", priority: 1, servers: ["KB120"] },
                { dmaUserId: "lee01", priority: 4, servers: ["KB120"] },
                { dmaUserId: "park01", priority: 2, servers: ["KB121"] },
              ],
            },
            error: null,
          }),
        },
      },
      makeFakeRelay((c) => {
        if (c.path.includes("/kim01/")) return relayReject(409, "NO_SERVERS", "등록 서버가 없어요");
        if (c.path.includes("/park01/")) return { status: 0, data: null };
        return undefined;
      }).client,
    );
    const res = await auth(request(app).put("/api/admin/accounts/KB/8800000001")).send(body);
    expect(res.status).toBe(200);
    expect(res.body.fanout).toEqual([
      { dmaUserId: "kim01", results: [], error: { code: "NO_SERVERS", message: "등록 서버가 없어요" } },
      { dmaUserId: "lee01", results: OK_RESULTS, error: null },
      { dmaUserId: "park01", results: [], error: { code: "RELAY_FAILED", message: expect.any(String) } },
    ]);
  });

  it("링크 0 → relay 0 · fanout []", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({ rpc: { dma_admin_update_account: () => ({ data: { links: [] }, error: null }) } }, relay.client);
    const res = await auth(request(app).put("/api/admin/accounts/KB/8800000001")).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, fanout: [] });
    expect(relay.calls).toHaveLength(0);
  });

  it("relay 클라이언트 없음 + 링크 있음 → 마스터 저장(RPC 1회) · 각 항목 error RELAY_UNAVAILABLE", async () => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).put("/api/admin/accounts/KB/8800000001")).send(body);
    expect(res.status).toBe(200);
    expect(rec.rpcCalls.map((c) => c.fn)).toEqual(["dma_admin_update_account"]);
    expect(res.body.fanout.map((f: { dmaUserId: string; error: { code: string } }) => `${f.dmaUserId}:${f.error.code}`)).toEqual([
      "kim01:RELAY_UNAVAILABLE",
      "lee01:RELAY_UNAVAILABLE",
    ]);
  });

  it("교보 → 지점 · 트레이더 빈 값으로 RPC · relay", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp(
      { rpc: { dma_admin_update_account: () => ({ data: { links: [{ dmaUserId: "kim01", priority: 0, servers: ["KYOBO119"] }] }, error: null }) } },
      relay.client,
    );
    const res = await auth(request(app).put("/api/admin/accounts/KYOBO/777")).send({ name: "교", branchNo: "x", traderId: "y" });
    expect(res.status).toBe(200);
    expect(rec.rpcCalls[0].params).toMatchObject({ p_branch_no: "", p_trader_id: "" });
    expect((relay.calls[0].body as { account: unknown }).account).toEqual({
      broker: "KYOBO",
      accountNo: "777",
      name: "교",
      branchNo: "",
      traderId: "",
      priority: 0,
    });
  });

  it("KB 길이 위반 → 400 · RPC 0 · relay 0", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/accounts/KB/8800000001")).send({ name: "x", branchNo: "1", traderId: "N00001" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(rec.rpcCalls).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });

  it("RPC NO_SUCH_ACCOUNT → 404 NOT_FOUND · relay 0", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({ rpc: { dma_admin_update_account: pgErr("P0001", "NO_SUCH_ACCOUNT") } }, relay.client);
    const res = await auth(request(app).put("/api/admin/accounts/KB/8800000001")).send(body);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: "NOT_FOUND", message: "등록되지 않은 계좌예요." });
    expect(relay.calls).toHaveLength(0);
  });

  it("N-02 orderEndpoint → 각 사용자 putAccount 바디에 trim 값 그대로(표기 보존) · 감사엔 값 없음", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/accounts/KB/8800000001")).send({
      ...body,
      orderEndpoint: { orderIp: " 10.41.1.124 ", orderMac: "1c-fd-08-7d-97-8e" },
    });
    expect(res.status).toBe(200);
    expect(relay.calls).toHaveLength(2);
    for (const c of relay.calls) {
      expect((c.body as { orderEndpoint: unknown }).orderEndpoint).toEqual({
        orderIp: "10.41.1.124",
        orderMac: "1c-fd-08-7d-97-8e",
      });
    }
  });

  it("N-02 orderEndpoint 없는 저장 → putAccount 바디에 키 자체가 없다(87 IP/MAC 보존)", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/accounts/KB/8800000001")).send(body);
    expect(res.status).toBe(200);
    for (const c of relay.calls) expect(Object.keys(c.body as object)).not.toContain("orderEndpoint");
  });

  it("N-02 교보 + orderEndpoint → 400 · RPC 0 · relay 0", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/accounts/KYOBO/777")).send({
      name: "교",
      orderEndpoint: { orderIp: "", orderMac: "" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(rec.rpcCalls).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });

  it("RPC links 모양 위반 → 500 DB_ERROR · relay 0", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({ rpc: { dma_admin_update_account: () => ({ data: { links: [{ dmaUserId: 1 }] }, error: null }) } }, relay.client);
    const res = await auth(request(app).put("/api/admin/accounts/KB/8800000001")).send(body);
    expect(res.status).toBe(500);
    expect(relay.calls).toHaveLength(0);
  });
});

describe("DELETE /api/admin/accounts/:broker/:accountNo — 삭제 (D-08 · 연결 0명만)", () => {
  it("성공 → 200 { ok } · RPC 정규화 번호 · relay 0", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).delete("/api/admin/accounts/KYOBO/00777"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(rec.rpcCalls).toEqual([{ fn: "dma_admin_delete_account", params: { p_broker: "KYOBO", p_account_no: "777" } }]);
    expect(relay.calls).toHaveLength(0);
  });

  it("ACCOUNT_IN_USE · 23503 → 409 ACCOUNT_IN_USE(같은 문구) · NO_SUCH_ACCOUNT → 404", async () => {
    for (const h of [pgErr("P0001", "ACCOUNT_IN_USE"), pgErr("23503", "fk violation")]) {
      const { app } = makeApp({ rpc: { dma_admin_delete_account: h } });
      const res = await auth(request(app).delete("/api/admin/accounts/KB/8800000001"));
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: "ACCOUNT_IN_USE",
        message: "연결된 사용자가 있어 삭제할 수 없어요 — 「사용자」 에서 먼저 연결을 해제하세요",
      });
    }
    const gone = makeApp({ rpc: { dma_admin_delete_account: pgErr("P0001", "NO_SUCH_ACCOUNT") } });
    const r = await auth(request(gone.app).delete("/api/admin/accounts/KB/8800000001"));
    expect(r.status).toBe(404);
  });

  it("경로 증권사 enum 밖 → 400 · RPC 0", async () => {
    const { app, rec } = makeApp();
    const res = await auth(request(app).delete("/api/admin/accounts/NH/1"));
    expect(res.status).toBe(400);
    expect(rec.rpcCalls).toHaveLength(0);
  });
});

/** quick 261106-ntl N-01 — 예수금(op 6) · 수수료(op 7) 계좌 단위 팬아웃. 대상 = admin_accounts_raw 의 active 링크 사용자. */
describe.each([
  {
    op: "budget",
    good: { budgetKrw: 15000000 },
    bad: [
      ["음수", { budgetKrw: -1 }],
      ["소수", { budgetKrw: 1.5 }],
      ["추가 키", { budgetKrw: 1, x: 1 }],
    ],
  },
  {
    op: "fee",
    good: { feePpm: 500, sellTaxPpm: 2000 },
    bad: [
      ["uint32 밖", { feePpm: 2 ** 32, sellTaxPpm: 0 }],
      ["한 값 누락", { feePpm: 500 }],
      ["추가 키", { feePpm: 1, sellTaxPpm: 1, x: 1 }],
    ],
  },
] as const)("PUT /api/admin/accounts/:broker/:accountNo/$op — 계좌 팬아웃 (N-01)", ({ op, good, bad }) => {
  const url = `/api/admin/accounts/KB/008800000002/${op}`;

  it("active 사용자 2명만 relay 1회씩(바디 그대로) · removing-only 0 · RPC admin_accounts_raw 1회 · 200 { ok, fanout } DMA id 순", async () => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).put(url)).send(good);
    expect(res.status).toBe(200);
    expect(rec.rpcCalls.map((c) => c.fn)).toEqual(["admin_accounts_raw"]);
    expect(relay.calls).toEqual([
      {
        method: "PUT",
        path: `/internal/admin/dma-users/kim01/accounts/KB/8800000002/${op}`,
        adminEmail: ADMIN_EMAIL,
        body: good,
      },
      {
        method: "PUT",
        path: `/internal/admin/dma-users/lee01/accounts/KB/8800000002/${op}`,
        adminEmail: ADMIN_EMAIL,
        body: good,
      },
    ]);
    expect(res.body).toEqual({
      ok: true,
      fanout: [
        { dmaUserId: "kim01", results: OK_RESULTS, error: null },
        { dmaUserId: "lee01", results: OK_RESULTS, error: null },
      ],
    });
  });

  it("한 사용자 relay 409 · 다른 사용자 502 → 200 유지 · 그 항목 error · results []", async () => {
    const { app } = makeApp(
      {},
      makeFakeRelay((c) => {
        if (c.path.includes("/kim01/")) return relayReject(409, "NO_SUCH_ACCOUNT", "그 사용자에게 없는 계좌예요");
        if (c.path.includes("/lee01/")) return { status: 0, data: null };
        return undefined;
      }).client,
    );
    const res = await auth(request(app).put(url)).send(good);
    expect(res.status).toBe(200);
    expect(res.body.fanout).toEqual([
      { dmaUserId: "kim01", results: [], error: { code: "NO_SUCH_ACCOUNT", message: "그 사용자에게 없는 계좌예요" } },
      { dmaUserId: "lee01", results: [], error: { code: "RELAY_FAILED", message: expect.any(String) } },
    ]);
  });

  it("relay 클라이언트 없음 + active 링크 → 각 항목 error RELAY_UNAVAILABLE", async () => {
    const { app } = makeApp();
    const res = await auth(request(app).put(url)).send(good);
    expect(res.status).toBe(200);
    expect(res.body.fanout.map((f: { dmaUserId: string; error: { code: string } }) => `${f.dmaUserId}:${f.error.code}`)).toEqual([
      "kim01:RELAY_UNAVAILABLE",
      "lee01:RELAY_UNAVAILABLE",
    ]);
  });

  it("active 링크 0(연결 0명) → relay 0 · fanout []", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).put(`/api/admin/accounts/KYOBO/777/${op}`)).send(good);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, fanout: [] });
    expect(relay.calls).toHaveLength(0);
  });

  it("목록에 없는 계좌 → 404 NOT_FOUND · relay 0", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).put(`/api/admin/accounts/KB/999/${op}`)).send(good);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(relay.calls).toHaveLength(0);
  });

  it.each(bad)("바디 %s → 400 · RPC 0 · relay 0", async (_l, b) => {
    const relay = makeFakeRelay();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).put(url)).send(b);
    expect(res.status).toBe(400);
    expect(rec.rpcCalls).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });

  it("trader → 403 · RPC 0", async () => {
    const { app, rec } = makeApp();
    const res = await request(app).put(url).set("Authorization", `Bearer ${TRADER_TOKEN}`).send(good);
    expect(res.status).toBe(403);
    expect(rec.rpcCalls).toHaveLength(0);
  });
});

describe("PUT …/fee 범위 (N-01)", () => {
  it("0~10000 밖(20000)은 400 이 아니다 — relay 로 간다(gh-trade code 1 경로)", async () => {
    const relay = makeFakeRelay();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/accounts/KB/8800000002/fee")).send({ feePpm: 20000, sellTaxPpm: 0 });
    expect(res.status).toBe(200);
    expect(relay.calls.map((c) => c.body)).toEqual([
      { feePpm: 20000, sellTaxPpm: 0 },
      { feePpm: 20000, sellTaxPpm: 0 },
    ]);
  });
});
