import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LAUNCH_PLAN_GATEWAYS,
  LAUNCH_RANGE_DAYS,
  launchPlanProfileOf,
  type AdminServerResult,
  type LaunchFire,
  type LaunchMarket,
  type LaunchMapResponse,
  type LaunchOrdersResponse,
  type LaunchPlanChangeRow,
  type LaunchPlanRelaySetResponse,
  type LaunchPlanServer,
  type LaunchRange,
} from "@gh-radar/shared";

import { ApiError } from "../errors.js";
import { logger } from "../logger.js";
import { RELAY_FAILED_MESSAGE, type RelayAdminClient } from "./relay-admin-client.js";

/**
 * Phase 35 D-20 — 발사 경계 지도 어드민 **조회 전용** 서비스.
 *
 * 서비스롤 `SupabaseClient` 를 인자로 받는 순수 함수 모듈. 헬퍼(DbError · causeOf · shapeCause · isObject)는
 * `accum-report.ts` 에서 복제한다 — 공용화하지 않는다(서비스 모듈마다 독립 · teamflow-report 규약).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   인가     어드민 판정은 라우트 관문(requireAuth → requireAdmin · DB role 매 요청)이 한다. 여기에는 DMA 게이트가 없다 —
 *            RPC 가 사용자 id 를 받지 않는다(어드민 전용 · 계좌 · 사용자 열 그대로 · D-02).
 *   T-19-01  RPC EXECUTE 는 service_role 전용(anon · authenticated 명시 REVOKE — 35-02 마이그레이션).
 *   T-15-07  DB 오류 원문은 응답에 싣지 않는다(고정 문구 DB_ERROR). 원문은 `cause` 로 실어 errorHandler 가 warn 로그에만 남긴다.
 *   모양     웹이 `dates` · `heads` · `pieces` 를 바로 순회한다 — 배열이 아니면 렌더 예외 대신 500 `DB_ERROR`.
 *   D-20     행은 RPC 가 실은 열 이름 그대로(snake_case) 통과한다 — 매퍼도 경계 계산도 없다(계산은 웹 shared 한 벌).
 *
 * ★ Cloud Run → Supabase 왕복이 지연을 지배하므로 요청 하나 = RPC **1회**(jsonb 스칼라 — max_rows 무관).
 */

const DbError = (msg: string, cause: unknown) => new ApiError(500, "DB_ERROR", msg, cause);

/** PostgREST 오류에서 로그에 남길 필드만 — 객체 통째로 싣지 않는다. */
const causeOf = (e: { message?: string; code?: string; details?: string | null; hint?: string | null }) => ({
  code: e.code,
  message: e.message,
  details: e.details ?? undefined,
  hint: e.hint ?? undefined,
});
/** 응답 모양 위반 — 무엇이 왔는지(타입)만. 행 값(계좌 등)은 싣지 않는다. */
const shapeCause = (what: string, v: unknown) => ({
  reason: `${what} 모양 위반`,
  type: Array.isArray(v) ? "array" : v === null ? "null" : typeof v,
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 객체가 아니거나 `keys` 중 배열이 아닌 키가 있으면 500 — 첫 위반 키를 cause 에 남긴다. */
function assertArrays(fn: string, fail: string, data: unknown, keys: readonly string[]): asserts data is Record<string, unknown> {
  if (!isObject(data)) throw DbError(fail, shapeCause(fn, data));
  for (const k of keys) {
    if (!Array.isArray(data[k])) throw DbError(fail, shapeCause(`${fn}.${k}`, data[k]));
  }
}

const ORDERS_FAIL = "발사 주문 내역 조회에 실패했습니다.";

/**
 * 주문 내역 하루치. `d` 생략 = 조각이 있는 최신 거래일. 행 없는 날짜는 200 `heads: [] · pieces: []` 그대로(빈 상태).
 */
export async function getLaunchOrders(
  supabase: SupabaseClient,
  d: string | undefined,
): Promise<LaunchOrdersResponse> {
  const { data, error } = await supabase.rpc("launch_orders_for_admin", { p_date: d ?? null });
  if (error) throw DbError(ORDERS_FAIL, causeOf(error));
  assertArrays("launch_orders_for_admin", ORDERS_FAIL, data, ["dates", "heads", "pieces"]);
  return data as unknown as LaunchOrdersResponse;
}

const MAP_FAIL = "발사 경계 지도 조회에 실패했습니다.";

/**
 * 경계 지도 — 발사 기준(`fire`) 하나의 최근 거래일(`range` → `p_days` = LAUNCH_RANGE_DAYS · all = null) 조각 + 최신 머리.
 * 날·패널 분류 · 리본은 웹이 shared `launchDaysOf` 로 계산한다(server 는 계산하지 않는다 · D-20).
 */
export async function getLaunchMap(
  supabase: SupabaseClient,
  fire: LaunchFire,
  range: LaunchRange,
): Promise<LaunchMapResponse> {
  const { data, error } = await supabase.rpc("launch_map_for_admin", {
    p_fire: fire,
    p_days: LAUNCH_RANGE_DAYS[range],
  });
  if (error) throw DbError(MAP_FAIL, causeOf(error));
  assertArrays("launch_map_for_admin", MAP_FAIL, data, ["days", "heads", "pieces"]);
  return data as unknown as LaunchMapResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// 범위 7 (35-13) — 발사 계획 · 변경 이력(D-25 · D-27 · D-29 · D-30)
// ─────────────────────────────────────────────────────────────────────────────

/** relay 클라이언트가 없을 때(env 미설정 · 로컬) 서버 칸 문구. */
export const RELAY_NOT_CONFIGURED_MESSAGE = "relay 연결이 설정되지 않았어요";

/** 이력 읽기 한도 — 조합(gateway × fire × market)별 최근 N(+ 마지막 ok · 35-12 RPC). */
export const LAUNCH_PLAN_CHANGES_LIMIT = 20;

const CHANGES_FAIL = "발사 계획 이력 조회에 실패했습니다.";

/** 변경 이력 — RPC `launch_plan_changes_for_admin` 1회 → `changes`. 배열이 아니면 500(웹이 바로 순회한다). */
export async function getLaunchPlanChanges(supabase: SupabaseClient): Promise<LaunchPlanChangeRow[]> {
  const { data, error } = await supabase.rpc("launch_plan_changes_for_admin", { p_limit: LAUNCH_PLAN_CHANGES_LIMIT });
  if (error) throw DbError(CHANGES_FAIL, causeOf(error));
  assertArrays("launch_plan_changes_for_admin", CHANGES_FAIL, data, ["changes"]);
  return data.changes as LaunchPlanChangeRow[];
}

/** relay 가 준 서버 값 하나가 `LaunchPlanServer` 모양인지 — 아니면 그 서버는 offline 으로 접는다. */
function isLaunchPlanServer(v: unknown): v is LaunchPlanServer {
  if (!isObject(v)) return false;
  switch (v.status) {
    case "ok":
      return Array.isArray(v.entries);
    case "failed":
      return typeof v.code === "number" && typeof v.message === "string";
    case "offline":
    case "timeout":
    case "skipped":
      return v.message === undefined || typeof v.message === "string";
    default:
      return false;
  }
}

const allServers = (v: LaunchPlanServer): Record<string, LaunchPlanServer> =>
  Object.fromEntries(LAUNCH_PLAN_GATEWAYS.map((k) => [k, v]));

/**
 * 서버별 현재 계획(D-25) — relay `launchPlans` 1회. **실패해도 throw 하지 않는다**: relay 없음 · 못 닿음(0) · 비200 · 모양 위반 ·
 * relay 가 빠뜨린 서버는 `{ status: "offline", message }` — 웹이 대신 값(최신 머리)으로 그리고 「계획 고치기」 를 끈다.
 * 반환 키 = `LAUNCH_PLAN_GATEWAYS` 순서. 로그에는 relay status 와 offline 으로 접은 서버 키만(바디 원문 금지).
 */
export async function readLaunchPlanServers(
  relay: RelayAdminClient | undefined,
  adminEmail: string,
): Promise<Record<string, LaunchPlanServer>> {
  if (!relay) return allServers({ status: "offline", message: RELAY_NOT_CONFIGURED_MESSAGE });
  const offline: LaunchPlanServer = { status: "offline", message: RELAY_FAILED_MESSAGE };
  let status = 0;
  try {
    const r = await relay.launchPlans(LAUNCH_PLAN_GATEWAYS, adminEmail);
    status = r.status;
    const servers: unknown = r.status === 200 && isObject(r.data) ? r.data.servers : undefined;
    if (isObject(servers)) {
      const out: Record<string, LaunchPlanServer> = {};
      const folded: string[] = [];
      for (const k of LAUNCH_PLAN_GATEWAYS) {
        const v = servers[k];
        if (isLaunchPlanServer(v)) out[k] = v;
        else {
          out[k] = offline;
          folded.push(k);
        }
      }
      if (folded.length > 0) {
        logger.warn(
          { relay: { op: "launch-plan-get", status, offline: folded } },
          "[admin-launch] 발사 계획 조회 일부 서버 모양 위반 · 누락 → offline",
        );
      }
      return out;
    }
  } catch {
    // 닿지 못함과 같게 본다(status 0).
  }
  logger.warn({ relay: { op: "launch-plan-get", status } }, "[admin-launch] 발사 계획 조회 실패 → offline");
  return allServers(offline);
}

const RECORD_FAIL = "발사 계획 이력 기록에 실패했습니다.";

/** 이력 1행 기록(D-29 · 시도마다 · 실패 포함) — RPC `launch_plan_change_record` `{ p }` 1회 → 기록된 행. */
export async function recordLaunchPlanChange(
  supabase: SupabaseClient,
  input: Omit<LaunchPlanChangeRow, "id" | "at">,
): Promise<LaunchPlanChangeRow> {
  const { data, error } = await supabase.rpc("launch_plan_change_record", { p: input });
  if (error) throw DbError(RECORD_FAIL, causeOf(error));
  if (!isObject(data)) throw DbError(RECORD_FAIL, shapeCause("launch_plan_change_record", data));
  return data as unknown as LaunchPlanChangeRow;
}

const OUTCOMES: readonly string[] = ["ok", "failed", "timeout", "offline", "skipped"];

/** relay 저장 결과가 이 서버의 `AdminServerResult` 인지 — 다른 서버 결과 · 어휘 밖 outcome 은 모양 위반. */
function isServerResultOf(v: unknown, gateway: string): v is AdminServerResult {
  return (
    isObject(v) &&
    v.server === gateway &&
    typeof v.outcome === "string" &&
    OUTCOMES.includes(v.outcome) &&
    (v.code === undefined || typeof v.code === "number") &&
    (v.message === undefined || typeof v.message === "string")
  );
}

const isNumberArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === "number");

/**
 * 계획 저장(D-27) — relay `setLaunchPlan` 1회. **throw 하지 않는다**: relay 없음 · 못 닿음(0) · 비200 · 모양 위반은
 * `{ result: { server, outcome: "offline", message }, before_us: null, plan: null }` — 호출부가 이 결과로 이력 1행을 남긴다(D-29).
 * relay 의 plan 은 op 8 뒤 재조회 값 — 웹이 다시 부르지 않게 그대로 싣는다. 로그에는 relay status 만(바디 원문 금지).
 */
export async function saveLaunchPlanViaRelay(
  relay: RelayAdminClient | undefined,
  adminEmail: string,
  gateway: string,
  fire: LaunchFire,
  market: LaunchMarket,
  offsets_us: number[],
): Promise<LaunchPlanRelaySetResponse> {
  const offline = (message: string): LaunchPlanRelaySetResponse => ({
    result: { server: gateway, outcome: "offline", message },
    before_us: null,
    plan: null,
  });
  if (!relay) return offline(RELAY_NOT_CONFIGURED_MESSAGE);
  let status = 0;
  try {
    const r = await relay.setLaunchPlan(gateway, { profile: launchPlanProfileOf(fire), market, offsets_us }, adminEmail);
    status = r.status;
    const d: unknown = r.data;
    if (
      r.status === 200 &&
      isObject(d) &&
      isServerResultOf(d.result, gateway) &&
      (d.before_us === null || isNumberArray(d.before_us)) &&
      (d.plan === null || isLaunchPlanServer(d.plan))
    ) {
      return { result: d.result, before_us: d.before_us, plan: d.plan };
    }
  } catch {
    // 닿지 못함과 같게 본다(status 0).
  }
  logger.warn({ relay: { op: "launch-plan-put", status } }, "[admin-launch] 발사 계획 저장 relay 실패 → offline");
  return offline(RELAY_FAILED_MESSAGE);
}
