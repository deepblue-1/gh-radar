import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

/**
 * `/api/push-devices` — 체결 앱 푸시 기기 API (Phase 40 D-12 · D-13 · D-15 · SC-4).
 *
 * server 는 40-01 RPC 4개를 `requireAuth` 뒤에서 `p_user_id = req.userId` 로만 부른다. 소유권(남의 · 없는 키 →
 * false)은 RPC 안의 `user_id` 조건이 정본이라 mock 은 그 판정을 흉내 내지 않고 **무엇을 넘겼는지**만 기록하고
 * 정해 둔 값을 돌려준다(`strategy-events.test.ts` 와 같은 모양의 최소 mock).
 *
 * quick-261109-dz1 — 계좌별 끄기 `GET /accounts` · `PUT /accounts/:accountNo` 도 같은 규율(D-01 · D-04 · D-08).
 */

let userSeq = 0;
const nextUser = () => ({ id: `00000000-0000-4000-8000-${String(4000 + ++userSeq).padStart(12, "0")}` });

const KEY = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const TOKEN = "a".repeat(64);

type Rec = { rpcCalls: { fn: string; params: Record<string, unknown> }[] };

function makeSupabase(opts: {
  user?: { id: string } | null;
  /** RPC 이름 → data. 없으면 `unexpected rpc` 오류. */
  data?: Record<string, unknown>;
  rpcError?: { code?: string; message: string };
}): { client: any; rec: Rec } {
  const rec: Rec = { rpcCalls: [] };
  const client = {
    auth: {
      getUser: async (_token: string) =>
        opts.user
          ? { data: { user: opts.user }, error: null }
          : { data: { user: null }, error: { message: "invalid token" } },
    },
    async rpc(fn: string, params: Record<string, unknown>) {
      rec.rpcCalls.push({ fn, params });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      if (opts.data && fn in opts.data) return { data: opts.data[fn], error: null };
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
  };
  return { client, rec };
}

/** RPC 공개 원소(40-01 · shared `PushDevice`). */
const deviceEl = (over: Record<string, unknown> = {}) => ({
  deviceKey: KEY,
  platform: "ios",
  label: "iPhone",
  enabled: true,
  lastSeenAt: "2026-11-07T01:02:03.000Z",
  createdAt: "2026-11-06T01:02:03.000Z",
  ...over,
});

const registerBody = (over: Record<string, unknown> = {}) => ({
  platform: "ios",
  token: TOKEN,
  label: "iPhone",
  ...over,
});

describe("PUT /api/push-devices/:deviceKey (D-12 · D-15)", () => {
  it("① 미인증 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client }))
      .put(`/api/push-devices/${KEY}`)
      .send(registerBody());
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② 정상 → 200 · dma_push_device_upsert 1회 {p_user_id: 인증 사용자 …} · 쿼리 user_id 무시 (T-19-17)", async () => {
    const user = nextUser();
    const other = nextUser();
    const { client, rec } = makeSupabase({ user, data: { dma_push_device_upsert: deviceEl() } });
    const r = await request(createApp({ supabase: client }))
      .put(`/api/push-devices/${KEY}?user_id=${other.id}&p_user_id=${other.id}`)
      .set("Authorization", "Bearer tok")
      .send(registerBody({ label: "  iPhone\u0007 15  " }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual(deviceEl());
    expect(rec.rpcCalls).toEqual([
      {
        fn: "dma_push_device_upsert",
        params: {
          p_user_id: user.id,
          p_device_key: KEY,
          p_platform: "ios",
          p_token: TOKEN,
          // 제어 문자 제거 · trim
          p_label: "iPhone 15",
        },
      },
    ]);
  });

  it("③ body 에 user_id 를 실어도 RPC 로 가지 않는다 — strict body 라 400 · RPC 0회", async () => {
    const other = nextUser();
    const { client, rec } = makeSupabase({ user: nextUser(), data: { dma_push_device_upsert: deviceEl() } });
    const r = await request(createApp({ supabase: client }))
      .put(`/api/push-devices/${KEY}`)
      .set("Authorization", "Bearer tok")
      .send(registerBody({ user_id: other.id }));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_FAILED");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("④ 응답에 token 키가 없다 — RPC 원소에 token 이 섞여 와도 공개 키 6개만 (T-19-14)", async () => {
    const { client } = makeSupabase({
      user: nextUser(),
      data: { dma_push_device_upsert: deviceEl({ token: TOKEN, userId: "leak" }) },
    });
    const r = await request(createApp({ supabase: client }))
      .put(`/api/push-devices/${KEY}`)
      .set("Authorization", "Bearer tok")
      .send(registerBody());
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(
      ["createdAt", "deviceKey", "enabled", "label", "lastSeenAt", "platform"],
    );
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);
  });

  it("⑤ label 은 80자로 자른다", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), data: { dma_push_device_upsert: deviceEl() } });
    const r = await request(createApp({ supabase: client }))
      .put(`/api/push-devices/${KEY}`)
      .set("Authorization", "Bearer tok")
      .send(registerBody({ label: "가".repeat(150) }));
    expect(r.status).toBe(200);
    expect(rec.rpcCalls[0].params.p_label).toBe("가".repeat(80));
  });

  it("⑥ RPC 오류 · 원소 아닌 반환 → 500 DB_ERROR (토큰은 응답에 없음)", async () => {
    for (const opts of [
      { rpcError: { code: "23514", message: `check violated token=${TOKEN}` } },
      { data: { dma_push_device_upsert: null } },
      { data: { dma_push_device_upsert: [deviceEl()] } },
    ]) {
      const { client } = makeSupabase({ user: nextUser(), ...opts });
      const r = await request(createApp({ supabase: client }))
        .put(`/api/push-devices/${KEY}`)
        .set("Authorization", "Bearer tok")
        .send(registerBody());
      expect(r.status).toBe(500);
      expect(r.body.error.code).toBe("DB_ERROR");
      expect(JSON.stringify(r.body)).not.toContain(TOKEN);
    }
  });
});

describe("GET /api/push-devices (D-13)", () => {
  it("① 미인증 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client })).get("/api/push-devices");
    expect(r.status).toBe(401);
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② 200 bare array — dma_push_devices_for_user {p_user_id: 인증 사용자} · 쿼리 user_id 무시 · 토큰 없음", async () => {
    const user = nextUser();
    const other = nextUser();
    const second = deviceEl({ deviceKey: "2b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", platform: "android", enabled: false });
    const { client, rec } = makeSupabase({
      user,
      data: { dma_push_devices_for_user: [deviceEl({ token: TOKEN }), second] },
    });
    const r = await request(createApp({ supabase: client }))
      .get(`/api/push-devices?user_id=${other.id}`)
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([deviceEl(), second]);
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);
    expect(rec.rpcCalls).toEqual([{ fn: "dma_push_devices_for_user", params: { p_user_id: user.id } }]);
  });

  it("③ 빈 목록 → 200 []", async () => {
    const { client } = makeSupabase({ user: nextUser(), data: { dma_push_devices_for_user: [] } });
    const r = await request(createApp({ supabase: client }))
      .get("/api/push-devices")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it("④ RPC 가 배열이 아닌 값 · 모양 어긋난 원소 · 오류 → 500", async () => {
    for (const opts of [
      { data: { dma_push_devices_for_user: null } },
      { data: { dma_push_devices_for_user: { deviceKey: KEY } } },
      { data: { dma_push_devices_for_user: [deviceEl({ enabled: "yes" })] } },
      { rpcError: { message: "boom" } },
    ]) {
      const { client } = makeSupabase({ user: nextUser(), ...opts });
      const r = await request(createApp({ supabase: client }))
        .get("/api/push-devices")
        .set("Authorization", "Bearer tok");
      expect(r.status, JSON.stringify(opts)).toBe(500);
      expect(r.body.error.code).toBe("DB_ERROR");
    }
  });
});

describe("PATCH /api/push-devices/:deviceKey — 끄기만 (D-13 · SC-4)", () => {
  it("① 미인증 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client }))
      .patch(`/api/push-devices/${KEY}`)
      .send({ enabled: false });
    expect(r.status).toBe(401);
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② {enabled:false} · RPC true → 200 {ok:true} · dma_push_device_disable {p_user_id: 인증 사용자, p_device_key}", async () => {
    const user = nextUser();
    const other = nextUser();
    const { client, rec } = makeSupabase({ user, data: { dma_push_device_disable: true } });
    const r = await request(createApp({ supabase: client }))
      .patch(`/api/push-devices/${KEY}?user_id=${other.id}`)
      .set("Authorization", "Bearer tok")
      .send({ enabled: false });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(rec.rpcCalls).toEqual([
      { fn: "dma_push_device_disable", params: { p_user_id: user.id, p_device_key: KEY } },
    ]);
  });

  it("③ RPC false(남의 · 없는 키) → 404 · RPC 1회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), data: { dma_push_device_disable: false } });
    const r = await request(createApp({ supabase: client }))
      .patch(`/api/push-devices/${KEY}`)
      .set("Authorization", "Bearer tok")
      .send({ enabled: false });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("NOT_FOUND");
    expect(rec.rpcCalls).toHaveLength(1);
  });

  it("④ {enabled:true} · 빈 body · 다른 키 → 400 · RPC 0회 (켜기는 PUT 만)", async () => {
    for (const body of [{ enabled: true }, {}, { enabled: false, label: "x" }, { enabled: "false" }]) {
      const { client, rec } = makeSupabase({ user: nextUser(), data: { dma_push_device_disable: true } });
      const r = await request(createApp({ supabase: client }))
        .patch(`/api/push-devices/${KEY}`)
        .set("Authorization", "Bearer tok")
        .send(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls).toHaveLength(0);
    }
  });

  it("⑤ RPC 가 boolean 이 아니면 500", async () => {
    const { client } = makeSupabase({ user: nextUser(), data: { dma_push_device_disable: null } });
    const r = await request(createApp({ supabase: client }))
      .patch(`/api/push-devices/${KEY}`)
      .set("Authorization", "Bearer tok")
      .send({ enabled: false });
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
  });
});

describe("DELETE /api/push-devices/:deviceKey — 지우기 (D-13 · D-15 · SC-4)", () => {
  it("① 미인증 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client })).delete(`/api/push-devices/${KEY}`);
    expect(r.status).toBe(401);
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② RPC true → 200 {ok:true} · dma_push_device_delete {p_user_id: 인증 사용자, p_device_key}", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, data: { dma_push_device_delete: true } });
    const r = await request(createApp({ supabase: client }))
      .delete(`/api/push-devices/${KEY}`)
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(rec.rpcCalls).toEqual([
      { fn: "dma_push_device_delete", params: { p_user_id: user.id, p_device_key: KEY } },
    ]);
  });

  it("③ RPC false(남의 · 없는 키) → 404 NOT_FOUND · RPC 1회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), data: { dma_push_device_delete: false } });
    const r = await request(createApp({ supabase: client }))
      .delete(`/api/push-devices/${KEY}`)
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("NOT_FOUND");
    expect(rec.rpcCalls).toHaveLength(1);
  });
});

describe("deviceKey 형식 — 대문자 · 짧은 값 · 경로 조각 → 400 · RPC 0회", () => {
  const BAD_KEYS = [KEY.toUpperCase(), "1b9d6bcd", "..%2Fx", `${KEY}z`];

  it("PUT · PATCH · DELETE 모두 400", async () => {
    for (const bad of BAD_KEYS) {
      for (const method of ["put", "patch", "delete"] as const) {
        const { client, rec } = makeSupabase({
          user: nextUser(),
          data: { dma_push_device_upsert: deviceEl(), dma_push_device_disable: true, dma_push_device_delete: true },
        });
        let req = request(createApp({ supabase: client }))
          [method](`/api/push-devices/${bad}`)
          .set("Authorization", "Bearer tok");
        if (method === "put") req = req.send(registerBody());
        if (method === "patch") req = req.send({ enabled: false });
        const r = await req;
        expect(r.status, `${method} ${bad}`).toBe(400);
        expect(r.body.error.code).toBe("VALIDATION_FAILED");
        expect(rec.rpcCalls).toHaveLength(0);
      }
    }
  });
});

describe("PUT body 형식 — 400 · RPC 0회", () => {
  it("token 공백 포함 · 15자 · 4097자 · platform 'web' · 모르는 키 · label 누락", async () => {
    const bads = [
      registerBody({ token: `${"a".repeat(30)} ${"a".repeat(30)}` }),
      registerBody({ token: "a".repeat(15) }),
      registerBody({ token: "a".repeat(4097) }),
      registerBody({ platform: "web" }),
      registerBody({ extra: 1 }),
      { platform: "ios", token: TOKEN },
    ];
    for (const body of bads) {
      const { client, rec } = makeSupabase({ user: nextUser(), data: { dma_push_device_upsert: deviceEl() } });
      const r = await request(createApp({ supabase: client }))
        .put(`/api/push-devices/${KEY}`)
        .set("Authorization", "Bearer tok")
        .send(body);
      expect(r.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_FAILED");
      // 400 메시지에 토큰 값이 실리지 않는다
      expect(JSON.stringify(r.body)).not.toContain("a".repeat(15));
      expect(rec.rpcCalls).toHaveLength(0);
    }
  });

  it("FCM 꼴 토큰(`:` `-` `_` `.` 포함) · android → 200", async () => {
    const fcm = "dXk3:APA91bH-abc_DEF.123456789";
    const { client, rec } = makeSupabase({
      user: nextUser(),
      data: { dma_push_device_upsert: deviceEl({ platform: "android" }) },
    });
    const r = await request(createApp({ supabase: client }))
      .put(`/api/push-devices/${KEY}`)
      .set("Authorization", "Bearer tok")
      .send(registerBody({ platform: "android", token: fcm }));
    expect(r.status).toBe(200);
    expect(rec.rpcCalls[0].params).toMatchObject({ p_platform: "android", p_token: fcm });
  });
});

describe("GET /api/push-devices/accounts — 끈 계좌 (quick-261109-dz1 D-08)", () => {
  it("① 미인증 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client })).get("/api/push-devices/accounts");
    expect(r.status).toBe(401);
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② 정상 → 200 bare array 그대로 · dma_push_account_mutes_for_user 1회 {p_user_id: 인증 사용자} · 쿼리 user_id 무시", async () => {
    const user = nextUser();
    const other = nextUser();
    const { client, rec } = makeSupabase({
      user,
      data: { dma_push_account_mutes_for_user: ["12345678-01", "5512-0034"] },
    });
    const r = await request(createApp({ supabase: client }))
      .get(`/api/push-devices/accounts?user_id=${other.id}`)
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    expect(r.body).toEqual(["12345678-01", "5512-0034"]);
    // 라우트 충돌 없음 — 기기 목록 RPC 를 부르지 않는다.
    expect(rec.rpcCalls).toEqual([{ fn: "dma_push_account_mutes_for_user", params: { p_user_id: user.id } }]);
  });

  it("③ RPC 가 배열 아님 · 원소에 비문자열 · RPC 오류 → 500 DB_ERROR", async () => {
    for (const opts of [
      { data: { dma_push_account_mutes_for_user: null } },
      { data: { dma_push_account_mutes_for_user: { a: 1 } } },
      { data: { dma_push_account_mutes_for_user: ["12345678-01", 7] } },
      { rpcError: { code: "XX000", message: "boom" } },
    ]) {
      const { client } = makeSupabase({ user: nextUser(), ...opts });
      const r = await request(createApp({ supabase: client }))
        .get("/api/push-devices/accounts")
        .set("Authorization", "Bearer tok");
      expect(r.status, JSON.stringify(opts)).toBe(500);
      expect(r.body.error.code).toBe("DB_ERROR");
    }
  });
});

describe("PUT /api/push-devices/accounts/:accountNo — 계좌 끄기 · 켜기 (D-01 · D-04 · D-08)", () => {
  it("① 미인증 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client }))
      .put("/api/push-devices/accounts/12345678-01")
      .send({ enabled: false });
    expect(r.status).toBe(401);
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② {enabled:false} → 200 {ok:true} · dma_push_account_mute_set 1회 {p_user_id: 인증 사용자, p_account_no: 경로값, p_enabled: false}", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, data: { dma_push_account_mute_set: true } });
    const r = await request(createApp({ supabase: client }))
      .put("/api/push-devices/accounts/12345678-01")
      .set("Authorization", "Bearer tok")
      .send({ enabled: false });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(rec.rpcCalls).toEqual([
      {
        fn: "dma_push_account_mute_set",
        params: { p_user_id: user.id, p_account_no: "12345678-01", p_enabled: false },
      },
    ]);
  });

  it("③ {enabled:true} → p_enabled true", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, data: { dma_push_account_mute_set: true } });
    const r = await request(createApp({ supabase: client }))
      .put("/api/push-devices/accounts/5512-0034")
      .set("Authorization", "Bearer tok")
      .send({ enabled: true });
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toEqual([
      {
        fn: "dma_push_account_mute_set",
        params: { p_user_id: user.id, p_account_no: "5512-0034", p_enabled: true },
      },
    ]);
  });

  it("④ RPC 가 false(이미 그 상태) → 그래도 200 {ok:true} (멱등)", async () => {
    const { client } = makeSupabase({ user: nextUser(), data: { dma_push_account_mute_set: false } });
    const r = await request(createApp({ supabase: client }))
      .put("/api/push-devices/accounts/12345678-01")
      .set("Authorization", "Bearer tok")
      .send({ enabled: false });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });

  it("⑤ RPC 가 boolean 아님 · RPC 오류 → 500 DB_ERROR", async () => {
    for (const opts of [
      { data: { dma_push_account_mute_set: null } },
      { data: { dma_push_account_mute_set: "true" } },
      { rpcError: { code: "22023", message: "bad" } },
    ]) {
      const { client } = makeSupabase({ user: nextUser(), ...opts });
      const r = await request(createApp({ supabase: client }))
        .put("/api/push-devices/accounts/12345678-01")
        .set("Authorization", "Bearer tok")
        .send({ enabled: false });
      expect(r.status, JSON.stringify(opts)).toBe(500);
      expect(r.body.error.code).toBe("DB_ERROR");
    }
  });

  it("⑥ body 에 user_id 추가 · 빈 body · enabled 문자열 → 400 VALIDATION_FAILED · RPC 0회", async () => {
    const other = nextUser();
    for (const body of [{ enabled: false, user_id: other.id }, {}, { enabled: "false" }]) {
      const { client, rec } = makeSupabase({ user: nextUser(), data: { dma_push_account_mute_set: true } });
      const r = await request(createApp({ supabase: client }))
        .put("/api/push-devices/accounts/12345678-01")
        .set("Authorization", "Bearer tok")
        .send(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls).toHaveLength(0);
    }
  });

  it("⑦ 경로 계좌번호 13자 · 공백만 → 400 · RPC 0회 / 12자 → 200", async () => {
    for (const no of ["1".repeat(13), "%20%20"]) {
      const { client, rec } = makeSupabase({ user: nextUser(), data: { dma_push_account_mute_set: true } });
      const r = await request(createApp({ supabase: client }))
        .put(`/api/push-devices/accounts/${no}`)
        .set("Authorization", "Bearer tok")
        .send({ enabled: false });
      expect(r.status, no).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls).toHaveLength(0);
    }
    const { client, rec } = makeSupabase({ user: nextUser(), data: { dma_push_account_mute_set: true } });
    const r = await request(createApp({ supabase: client }))
      .put(`/api/push-devices/accounts/${"1".repeat(12)}`)
      .set("Authorization", "Bearer tok")
      .send({ enabled: false });
    expect(r.status).toBe(200);
    expect(rec.rpcCalls[0].params.p_account_no).toBe("1".repeat(12));
  });
});

describe("POST /api/push-devices/handover — 앱 로그인 뒤 이 폰 정리 (리뷰 WR-07 · D-15)", () => {
  it("① 미인증 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client }))
      .post("/api/push-devices/handover")
      .send({ token: TOKEN, deviceKey: KEY });
    expect(r.status).toBe(401);
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② 정상 → 200 {ok:true, removed} · dma_push_device_handover 1회 {p_user_id: 인증 사용자, p_token, p_device_key} · 쿼리 user_id 무시", async () => {
    const user = nextUser();
    const other = nextUser();
    const { client, rec } = makeSupabase({ user, data: { dma_push_device_handover: 1 } });
    const r = await request(createApp({ supabase: client }))
      .post(`/api/push-devices/handover?user_id=${other.id}`)
      .set("Authorization", "Bearer tok")
      .send({ token: TOKEN, deviceKey: KEY });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, removed: 1 });
    expect(rec.rpcCalls).toEqual([
      { fn: "dma_push_device_handover", params: { p_user_id: user.id, p_token: TOKEN, p_device_key: KEY } },
    ]);
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);
  });

  it("③ deviceKey null(로그아웃 정리 실패로 키를 버림) → p_device_key null · 0 도 200", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), data: { dma_push_device_handover: 0 } });
    const r = await request(createApp({ supabase: client }))
      .post("/api/push-devices/handover")
      .set("Authorization", "Bearer tok")
      .send({ token: TOKEN, deviceKey: null });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, removed: 0 });
    expect(rec.rpcCalls[0].params.p_device_key).toBeNull();
  });

  it("④ 토큰 누락 · 빈 토큰 · 대문자 키 · deviceKey 누락 · user_id 추가 → 400 · RPC 0회", async () => {
    const bodies: Record<string, unknown>[] = [
      { deviceKey: KEY },
      { token: "", deviceKey: KEY },
      { token: TOKEN, deviceKey: KEY.toUpperCase() },
      { token: TOKEN },
      { token: TOKEN, deviceKey: KEY, user_id: nextUser().id },
    ];
    for (const body of bodies) {
      const { client, rec } = makeSupabase({ user: nextUser(), data: { dma_push_device_handover: 0 } });
      const r = await request(createApp({ supabase: client }))
        .post("/api/push-devices/handover")
        .set("Authorization", "Bearer tok")
        .send(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls).toHaveLength(0);
    }
  });

  it("⑤ RPC 오류 · 정수 아닌 반환 → 500 DB_ERROR (토큰은 응답에 없음)", async () => {
    for (const opts of [
      { rpcError: { code: "XX000", message: `boom ${TOKEN}` } },
      { data: { dma_push_device_handover: "1" } },
      { data: { dma_push_device_handover: -1 } },
    ]) {
      const { client } = makeSupabase({ user: nextUser(), ...opts });
      const r = await request(createApp({ supabase: client }))
        .post("/api/push-devices/handover")
        .set("Authorization", "Bearer tok")
        .send({ token: TOKEN, deviceKey: KEY });
      expect(r.status).toBe(500);
      expect(r.body.error.code).toBe("DB_ERROR");
      expect(JSON.stringify(r.body)).not.toContain(TOKEN);
    }
  });
});
