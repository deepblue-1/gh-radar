import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

/**
 * `/api/push-devices` — 체결 앱 푸시 기기 API (Phase 40 D-12 · D-13 · D-15 · SC-4).
 *
 * server 는 40-01 RPC 4개를 `requireAuth` 뒤에서 `p_user_id = req.userId` 로만 부른다. 소유권(남의 · 없는 키 →
 * false)은 RPC 안의 `user_id` 조건이 정본이라 mock 은 그 판정을 흉내 내지 않고 **무엇을 넘겼는지**만 기록하고
 * 정해 둔 값을 돌려준다(`strategy-events.test.ts` 와 같은 모양의 최소 mock).
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
