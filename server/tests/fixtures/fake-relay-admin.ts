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
 *   quote-primary → 200 `{ ok: true }`
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

function defaultResponse(call: FakeRelayCall): RelayAdminResponse<unknown> {
  if (/\/reload$/.test(call.path)) return { status: 200, data: { ok: true, changed: true } };
  if (call.path === "/internal/admin/servers/status") return { status: 200, data: { servers: {} } };
  if (/\/quote-primary$/.test(call.path)) return { status: 200, data: { ok: true } };
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
