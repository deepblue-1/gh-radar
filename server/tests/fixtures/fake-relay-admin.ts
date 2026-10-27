import {
  relayAdminClientFrom,
  type RelayAdminClient,
  type RelayAdminMethod,
  type RelayAdminResponse,
} from "../../src/services/relay-admin-client";

/**
 * Phase 29 (29-13) — 가짜 relay. 실제 `relayAdminClientFrom` 래퍼를 쓰고 저수준 `request` 만 갈아 끼운다 —
 * 그래서 테스트가 단언하는 경로 · 바디는 운영 클라이언트가 실제로 보낼 문자열 그대로다(29-11 계약 표 1:1).
 *
 * `handler` 가 없거나 `undefined` 를 돌려주면 기본 응답:
 *   dma-users 계열 → 200 `{ results: [KB120 ok] }` (DELETE /dma-users/:dma 는 `deleted: true` 포함)
 *   reload        → 200 `{ ok: true, changed: true }`
 *   servers/status → 200 `{ servers: {} }`
 *   order-endpoints → 200 `{ servers: {} }` (30-03 — 전 서버 「확인 전」)
 *   quote-primary → 200 `{ ok: true }`
 *   GET launch-plan → 200 `{ servers: { KB120, KYOBO119 } }` 둘 다 ok 4칸(35-13 · `LAUNCH_PLAN_DEFAULT`)
 */

export type FakeRelayCall = {
  method: RelayAdminMethod;
  path: string;
  adminEmail: string;
  body?: unknown;
};

export type FakeRelayHandler = (
  call: FakeRelayCall,
) => RelayAdminResponse<unknown> | undefined | Promise<RelayAdminResponse<unknown> | undefined>;

export const OK_RESULTS = [{ server: "KB120", outcome: "ok", usersRev: "2" }];

/** 서버 1대의 기본 계획(ok · 4칸) — N 값만 서버마다 다르다. */
const planOf = (n: number) => ({
  status: "ok",
  plan_rev: 3,
  updated_at: "2026-10-27T22:41:00",
  entries: [
    { profile: "Q16", market: "K", offsets_us: [-340, -335, -320] },
    { profile: "Q16", market: "Q", offsets_us: [-350, -345, -325] },
    { profile: "N", market: "K", offsets_us: [n] },
    { profile: "N", market: "Q", offsets_us: [n] },
  ],
});

/** 가짜 relay 의 기본 발사 계획(35-13) — GET 기본 응답의 `servers`. */
export const LAUNCH_PLAN_DEFAULT: Record<string, ReturnType<typeof planOf>> = {
  KB120: planOf(-245),
  KYOBO119: planOf(-200),
};

function defaultResponse(call: FakeRelayCall): RelayAdminResponse<unknown> {
  if (/\/reload$/.test(call.path)) return { status: 200, data: { ok: true, changed: true } };
  if (call.path === "/internal/admin/servers/status") return { status: 200, data: { servers: {} } };
  if (call.path === "/internal/admin/order-endpoints") return { status: 200, data: { servers: {} } };
  if (/\/quote-primary$/.test(call.path)) return { status: 200, data: { ok: true } };
  if (call.method === "GET" && call.path.startsWith("/internal/admin/launch-plan")) {
    return { status: 200, data: { servers: LAUNCH_PLAN_DEFAULT } };
  }
  if (call.method === "DELETE" && /^\/internal\/admin\/dma-users\/[^/]+$/.test(call.path)) {
    return { status: 200, data: { results: OK_RESULTS, deleted: true } };
  }
  return { status: 200, data: { results: OK_RESULTS } };
}

export function makeFakeRelay(handler?: FakeRelayHandler): {
  client: RelayAdminClient;
  calls: FakeRelayCall[];
} {
  const calls: FakeRelayCall[] = [];
  const request = async <T>(
    method: RelayAdminMethod,
    path: string,
    adminEmail: string,
    body?: unknown,
  ): Promise<RelayAdminResponse<T>> => {
    const call: FakeRelayCall = { method, path, adminEmail, ...(body === undefined ? {} : { body }) };
    calls.push(call);
    const r = (await handler?.(call)) ?? defaultResponse(call);
    return r as RelayAdminResponse<T>;
  };
  return { client: relayAdminClientFrom(request), calls };
}

/** relay 업무 거부 본문(29-11 errorHandler 모양). */
export const relayReject = (status: number, code: string, message = `${code} 거부`) => ({
  status,
  data: { error: { code, message } },
});
