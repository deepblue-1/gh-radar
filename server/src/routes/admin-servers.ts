import { Router, type Request, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  brokerOfServerKey,
  deriveAdminServersOverview,
  type AdminServerLiveStatus,
  type AdminServersRaw,
} from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { ApiError, ValidationFailed } from "../errors.js";
import { logger } from "../logger.js";
import {
  AdminServerPatchSchema,
  AdminServerUpsertSchema,
  serverKeyParam,
} from "../schemas/admin.js";
import { toProxyResult, type RelayAdminClient } from "../services/relay-admin-client.js";
import { DbError, audit, parseOrThrow, relayFailed, requireRelayAdmin } from "./admin.js";

/**
 * Phase 29 (D-09 · D-10 · D-11 · D-17) — Admin 서버 레지스트리 API. `/admin/servers` 화면(29-19)이 부른다.
 *
 * - GET  /servers                     : RPC `admin_servers_raw` 1회 + relay `servers/status` 1회(병렬) → shared
 *                                       `deriveAdminServersOverview`. relay 가 없거나 실패하면 상태만 null(200 유지 —
 *                                       레지스트리 편집은 relay 없이도 된다).
 * - POST /servers                     : 서버 추가 → `dma_admin_upsert_server` → relay 레지스트리 재적재(best-effort).
 *                                       이미 있는 키는 409 `SERVER_EXISTS`(주소 변경은 PATCH — 「+ 서버」 가 기존 서버를 덮지 않게).
 * - PATCH /servers/:key               : `{ host?, port?, enabled?, sortOrder?, broker? }` — 필드별 즉시 저장(D-15 동형).
 *                                       주소 = upsert RPC(증권사 고정) · 사용 = `dma_admin_set_server_enabled` · 정렬 = 표 직접.
 * - PUT  /servers/:key/order-server   : 증권사 주문 서버 교체 RPC(한 트랜잭션) → 재적재. 열린 세션은 예전 서버 유지(D-10).
 * - PUT  /servers/:key/quote-primary  : relay `POST /internal/admin/servers/:key/quote-primary`(break-then-make 실행 ·
 *                                       성공 시 relay 가 DB 를 갱신 — 29-23). Express 는 DB 를 먼저 바꾸지 않는다 —
 *                                       relay 전환이 실패해 되돌린 경우 DB 만 새 서버를 가리키는 갈라짐이 생기므로.
 *
 * 불변식(증권사당 주문 서버 1 · 전체 시세 주 서버 1 · 끈 서버는 주문/시세 불가)은 DB 가 쥔다(부분 유니크 · CHECK ·
 * RPC). 여기는 RPC 오류를 코드로 옮길 뿐이다: `server in use` → 409 `SERVER_IN_USE` · `server disabled` → 409
 * `SERVER_DISABLED` · `broker change not allowed` → 409 `BROKER_CHANGE` · P0002 → 404 `NOT_FOUND`.
 *
 * ★ 관문은 `/servers` 경로에만 건다 — 이 라우터는 adminRouter 앞에 마운트된다(app.ts). 경로 없이 걸면 /users 요청도
 *   여기서 역할 조회를 한 번 더 해 Cloud Run → Supabase 왕복이 늘어난다.
 */

export const adminServersRouter: RouterT = Router();

adminServersRouter.use("/servers", requireAuth(), requireAdmin());

type PgError = { code?: string; message?: string };

/** 레지스트리 RPC 오류 → 응답 코드. 모르는 오류는 500 `DB_ERROR`(원문은 cause → warn 로그에만). */
function registryError(error: PgError, fallback: string): ApiError {
  const msg = error.message ?? "";
  if (error.code === "P0002") return new ApiError(404, "NOT_FOUND", "등록되지 않은 서버예요.");
  if (msg === "server in use") {
    return new ApiError(
      409,
      "SERVER_IN_USE",
      "주문 서버 · 시세 주 서버는 끌 수 없어요. 먼저 다른 서버로 옮기세요.",
    );
  }
  if (msg === "server disabled") {
    return new ApiError(
      409,
      "SERVER_DISABLED",
      "꺼진 서버는 주문 · 시세 서버로 고를 수 없어요. 먼저 사용을 켜세요.",
    );
  }
  if (msg === "broker change not allowed") {
    return new ApiError(409, "BROKER_CHANGE", "서버의 증권사는 바꿀 수 없어요.");
  }
  // 23514 = CHECK 위반(스키마가 먼저 거르므로 드물다 — 우회 입력 방어).
  if (error.code === "23514") return ValidationFailed("서버 값이 레지스트리 규칙에 맞지 않아요.");
  return DbError(fallback, error);
}

/** 레지스트리 변경 뒤 relay 즉시 재적재(best-effort) — 실패해도 200 · relay 주기 재적재가 따라잡는다. */
async function notifyRegistry(req: Request, op: string): Promise<boolean> {
  const relay = req.app.locals.relayAdmin as RelayAdminClient | undefined;
  if (!relay) return false;
  const r = await relay.reloadRegistry(req.adminEmail!);
  if (r.status === 200) return true;
  logger.warn(
    { relay: { op, status: r.status } },
    "[admin] relay registry reload 실패 — relay 주기 재적재가 따라잡는다",
  );
  return false;
}

/** relay 서버 상태 칩 — 클라이언트 없음 · 실패 · 모양 위반이면 null(화면은 칩을 「알 수 없음」 으로). */
async function fetchLiveStatus(req: Request): Promise<Record<string, AdminServerLiveStatus> | null> {
  const relay = req.app.locals.relayAdmin as RelayAdminClient | undefined;
  if (!relay) return null;
  const r = await relay.serversStatus(req.adminEmail!);
  const servers = r.status === 200 ? r.data?.servers : undefined;
  if (servers && typeof servers === "object" && !Array.isArray(servers)) return servers;
  logger.warn({ relay: { op: "servers-status", status: r.status } }, "[admin] relay 서버 상태 조회 실패 — 상태 null");
  return null;
}

// --- GET /servers — 레지스트리 개요 (D-17) ---
adminServersRouter.get("/servers", async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;
    const [{ data, error }, live] = await Promise.all([
      supabase.rpc("admin_servers_raw"),
      fetchLiveStatus(req),
    ]);
    if (error) throw DbError("서버 목록 조회에 실패했습니다.", error);
    const raw = data as AdminServersRaw | null;
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.servers)) {
      throw DbError("서버 목록 조회에 실패했습니다.");
    }
    res.json(deriveAdminServersOverview(raw, live));
  } catch (e) {
    next(e);
  }
});

// --- POST /servers — 서버 추가 (꺼진 상태 · 맨 뒤 정렬로 들어간다) ---
adminServersRouter.post("/servers", async (req, res, next) => {
  try {
    const body = parseOrThrow(AdminServerUpsertSchema, req.body ?? {});
    const supabase = req.app.locals.supabase as SupabaseClient;

    const { data: exists, error: e1 } = await supabase
      .from("dma_servers")
      .select("key")
      .eq("key", body.key)
      .maybeSingle();
    if (e1) throw DbError("서버 추가에 실패했습니다.", e1);
    if (exists) throw new ApiError(409, "SERVER_EXISTS", "이미 등록된 서버 키예요. 주소는 서버 카드에서 바꾸세요.");

    const { error } = await supabase.rpc("dma_admin_upsert_server", {
      p_key: body.key,
      p_broker: body.broker,
      p_host: body.host,
      p_port: body.port,
    });
    if (error) throw registryError(error, "서버 추가에 실패했습니다.");

    if (body.sortOrder !== undefined) await setSortOrder(supabase, body.key, body.sortOrder);

    audit(req, "server-add", body.key, { host: body.host, port: body.port });
    res.json({ ok: true, relayNotified: await notifyRegistry(req, "server-add") });
  } catch (e) {
    next(e);
  }
});

/** 정렬 순서 — 불변식이 없는 표시 값이라 RPC 없이 표에 직접(service_role). 없는 키는 404. */
async function setSortOrder(supabase: SupabaseClient, key: string, sortOrder: number): Promise<void> {
  const { data, error } = await supabase
    .from("dma_servers")
    .update({ sort_order: sortOrder, updated_at: new Date().toISOString() })
    .eq("key", key)
    .select("key");
  if (error) throw DbError("서버 정렬 변경에 실패했습니다.", error);
  if (!Array.isArray(data) || data.length === 0) {
    throw new ApiError(404, "NOT_FOUND", "등록되지 않은 서버예요.");
  }
}

// --- PATCH /servers/:key — 주소 · 사용 토글 · 정렬 (필드별 즉시 저장) ---
adminServersRouter.patch("/servers/:key", async (req, res, next) => {
  try {
    const { key } = parseOrThrow(serverKeyParam, req.params);
    const patch = parseOrThrow(AdminServerPatchSchema, req.body ?? {});
    // 증권사는 키 접두가 정한다 — 같은 값이면 무변경, 다르면 400(DB 도 broker 변경을 거부한다).
    if (patch.broker !== undefined && patch.broker !== brokerOfServerKey(key)) {
      throw ValidationFailed("broker: 서버의 증권사는 바꿀 수 없어요");
    }
    const supabase = req.app.locals.supabase as SupabaseClient;

    if (patch.host !== undefined || patch.port !== undefined) {
      // upsert RPC 는 host · port 를 함께 받는다 — 보내지 않은 쪽은 지금 값으로 채운다.
      const { data: row, error: e1 } = await supabase
        .from("dma_servers")
        .select("broker, host, port")
        .eq("key", key)
        .maybeSingle();
      if (e1) throw DbError("서버 변경에 실패했습니다.", e1);
      if (!row) throw new ApiError(404, "NOT_FOUND", "등록되지 않은 서버예요.");
      const cur = row as { broker: string; host: string; port: number };
      const { error } = await supabase.rpc("dma_admin_upsert_server", {
        p_key: key,
        p_broker: cur.broker,
        p_host: patch.host ?? cur.host,
        p_port: patch.port ?? cur.port,
      });
      if (error) throw registryError(error, "서버 변경에 실패했습니다.");
    }

    if (patch.sortOrder !== undefined) await setSortOrder(supabase, key, patch.sortOrder);

    if (patch.enabled !== undefined) {
      const { error } = await supabase.rpc("dma_admin_set_server_enabled", {
        p_key: key,
        p_enabled: patch.enabled,
      });
      if (error) throw registryError(error, "서버 사용 변경에 실패했습니다.");
    }

    audit(req, "server-patch", key, {
      fields: Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    res.json({ ok: true, relayNotified: await notifyRegistry(req, "server-patch") });
  } catch (e) {
    next(e);
  }
});

// --- PUT /servers/:key/order-server — 증권사 주문 서버 교체 (D-10 새 로그인부터) ---
adminServersRouter.put("/servers/:key/order-server", async (req, res, next) => {
  try {
    const { key } = parseOrThrow(serverKeyParam, req.params);
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { error } = await supabase.rpc("dma_admin_set_order_server", { p_key: key });
    if (error) throw registryError(error, "주문 서버 변경에 실패했습니다.");
    audit(req, "order-server", key);
    res.json({ ok: true, relayNotified: await notifyRegistry(req, "order-server") });
  } catch (e) {
    next(e);
  }
});

// --- PUT /servers/:key/quote-primary — 시세 주 서버 전환 (D-11 break-then-make · relay 가 실행 + DB 갱신) ---
adminServersRouter.put("/servers/:key/quote-primary", async (req, res, next) => {
  try {
    const { key } = parseOrThrow(serverKeyParam, req.params);
    const relay = requireRelayAdmin(req);
    const res0 = await relay.setQuotePrimary(key, req.adminEmail!);
    // 400 · 404(NO_SUCH_SERVER) · 409(꺼진 서버 · 새 서버 로그인 실패로 되돌림 · 전환 중) 은 relay 오류 그대로.
    const r = toProxyResult(res0, [400, 404, 409]);
    if (r.status !== 200) {
      const { code, message } = (r.body as { error: { code: string; message: string } }).error;
      if (code === "RELAY_FAILED") throw relayFailed("quote-primary", res0.status);
      audit(req, "quote-primary", key, { rejected: code });
      throw new ApiError(r.status, code, message);
    }
    audit(req, "quote-primary", key);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
