import { Router, type Request, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveAdminUsersOverview, type AdminUsersRaw } from "@gh-radar/shared";
import type { z } from "zod";

import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { ApiError, ValidationFailed } from "../errors.js";
import { logger } from "../logger.js";
import { AdminRolePatchBody, AdminUserUpsertBody, adminEmailParam } from "../schemas/admin.js";
import {
  toProxyResult,
  type RelayAdminClient,
  type RelayAdminResponse,
} from "../services/relay-admin-client.js";
import type { AdminCommandResponse } from "@gh-radar/shared";

/**
 * Phase 29 (D-07 · D-14) — 웹 Admin 의 서버 관문. 반영 경로 = webapp → **Express(admin 역할 검증)** → relay HTTP.
 * 브라우저는 Admin 표(app_users · dma_*)에 PostgREST 로 직접 쓰지 않는다 — 표는 전부 service_role 전용이다.
 *
 * - GET    /users        : 사용자 개요(`AdminUsersOverview`) — RPC `admin_users_raw` **1회** → shared `deriveAdminUsersOverview`.
 *                          칩 판정 규칙은 shared 한 곳(relay planner 와 같은 diff)이고 server 는 파생만 부른다.
 * - POST   /users        : `{ email, role, dma? }` — 사전 등록 · 승인 대기 승인 · viewer 생성(D-03). app_users upsert.
 *                          `dma` 가 있으면(trader/admin · D-16) upsert 뒤 relay `POST /internal/admin/dma-users` 1회 →
 *                          서버별 결과 배열을 그대로 `results` 로. viewer + dma 는 400.
 * - PATCH  /users/:email : `{ role }` — 역할 변경(D-04 강등 즉시). 없는 이메일 404.
 * - DELETE /users/:email : DMA 연결 **없는** 사용자만 행 삭제. 연결 있으면 409 `HAS_DMA` — 그 삭제는 relay 경로(29-13).
 *
 * 쓰기는 Express 가 DB 에 직접 하고, 성공 뒤 relay `POST /internal/admin/access/reload` 를 **best-effort** 로 부른다
 * (`relayNotified`). 통보가 실패해도 200 — relay 의 60초 주기 재적재가 따라잡는다(D-04 「즉시」 는 webapp middleware 가
 * 매 요청 역할을 보는 것으로 이미 성립하고, relay 통보는 열린 wss 를 더 빨리 끊는 가속기다).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   인증      `requireAuth()` — 미인증 · 만료 토큰 401 `UNAUTHENTICATED`
 *   역할      `requireAdmin()` — app_users role = admin 만(매 요청 DB 조회 · 강등 즉시 반영 D-04). 그 밖 403 `FORBIDDEN`
 *   권한      `admin_users_raw` · `app_users` 는 service_role 전용(anon · authenticated 명시 REVOKE) — 이 라우터가 유일한 창구
 *   오류      DB 오류는 `DB_ERROR` 고정 문구 — 원문(PostgREST code · message)은 errorHandler warn 로그에만(T-15-07)
 *   자기 보호 요청자 본인의 admin 을 내리거나 본인을 지우면 409 `SELF_LOCKOUT` — Admin 이 스스로 잠기지 않게.
 *            (본인은 늘 admin 으로 남으므로 「마지막 admin 삭제」 도 이 규칙 하나로 막힌다)
 *   입력      zod — 이메일 trim · 소문자 · 형식 · ≤ 254, 역할 enum. 위반은 DB 를 두드리기 전에 400 `VALIDATION_FAILED`
 *   비밀      비밀번호 · 공유 비밀은 로그에 남지 않는다(logger redact). 감사 로그는 요청자 · 작업 · 대상 이메일 · 역할만
 *
 * ★ Cloud Run → Supabase 왕복이 지연을 지배한다 — 개요 한 장 = 역할 조회 1회 + RPC 1회.
 */

export const adminRouter: RouterT = Router();

// 라우터 전체에 인증 → 역할. 개별 라우트에 다시 걸지 않는다(빠뜨린 라우트가 생기지 않게).
adminRouter.use(requireAuth(), requireAdmin());

/** `cause` 는 로그 전용(errorHandler warn) — 응답에는 고정 문구만. */
const DbError = (msg: string, cause?: unknown) => new ApiError(500, "DB_ERROR", msg, cause);
const SelfLockout = () =>
  new ApiError(409, "SELF_LOCKOUT", "본인의 관리자 권한은 내리거나 지울 수 없어요.");
const HasDma = () =>
  new ApiError(409, "HAS_DMA", "DMA 연결이 있는 사용자는 DMA 삭제 경로로 지워야 해요.");
const UserNotFound = () => new ApiError(404, "NOT_FOUND", "허용 목록에 없는 사용자예요.");
const RelayUnavailable = () =>
  new ApiError(503, "RELAY_UNAVAILABLE", "relay 연결이 설정되지 않아 처리할 수 없어요.");

/**
 * relay DMA 프록시 응답 해석 → 200 이면 `{ results }` 를 돌려주고, 아니면 `ApiError` 로 던진다(errorHandler 가 그대로 응답).
 * relay 409 업무 거부는 409 그대로(`DMA_USER_EXISTS` · `LAST_ACCOUNT` …), 못 닿음 · 5xx · 모양 위반은 502 `RELAY_FAILED`.
 * 200 인데 `results` 배열이 없으면 계약 위반 — 빈 배열로 감추지 않고 502.
 */
function relayResults(res: RelayAdminResponse<AdminCommandResponse>, op: string): AdminCommandResponse["results"] {
  const r = toProxyResult(res);
  if (r.status === 200) {
    const results = (r.body as Partial<AdminCommandResponse>).results;
    if (Array.isArray(results)) return results;
    throw relayFailed(op, res.status);
  }
  const { code, message } = (r.body as { error: { code: string; message: string } }).error;
  if (code === "RELAY_FAILED") throw relayFailed(op, res.status);
  throw new ApiError(r.status, code, message);
}

/** 502 `RELAY_FAILED` — 로그(cause)에는 relay 상태코드와 작업 이름만(바디 · 비밀 없음). */
function relayFailed(op: string, relayStatus: number): ApiError {
  return new ApiError(502, "RELAY_FAILED", "relay 처리에 실패했어요. 잠시 뒤 다시 시도하세요.", {
    relay: { op, status: relayStatus },
  });
}

/**
 * relay 의존 라우트(29-13 DMA 프록시)의 관문 — 클라이언트가 없으면(env 미설정) 503 `RELAY_UNAVAILABLE`.
 * 허용/역할 쓰기는 이것을 쓰지 않는다(best-effort 통보 — `notifyAccess`).
 */
export function requireRelayAdmin(req: Request): RelayAdminClient {
  const relay = req.app.locals.relayAdmin as RelayAdminClient | undefined;
  if (!relay) throw RelayUnavailable();
  return relay;
}

function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
  }
  return parsed.data;
}

/** 감사 로그 1줄 — 요청자 · 작업 · 대상 이메일 · 역할만(비밀번호 · 토큰 없음). */
function audit(req: Request, op: string, target: string, extra: Record<string, unknown> = {}): void {
  logger.info(
    { audit: "admin", admin: req.adminEmail, op, target, ...extra },
    `[admin] admin=${req.adminEmail} op=${op} target=${target}`,
  );
}

/**
 * 쓰기 성공 뒤 relay 허용 표 즉시 재적재(best-effort). 클라이언트 없음 · 비200 · 닿지 못함(0) → false + warn.
 * 실패해도 throw 하지 않는다 — 쓰기는 이미 DB 에 들어갔고, relay 60초 재적재가 따라잡는다.
 */
async function notifyAccess(req: Request, op: string): Promise<boolean> {
  const relay = req.app.locals.relayAdmin as RelayAdminClient | undefined;
  if (!relay) return false;
  const r = await relay.reloadAccess(req.adminEmail!);
  if (r.status === 200) return true;
  logger.warn(
    { relay: { op, status: r.status } },
    "[admin] relay access reload 실패 — relay 60초 재적재가 따라잡는다",
  );
  return false;
}

// --- GET /users — 사용자 개요 (D-14) ---
adminRouter.get("/users", async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { data, error } = await supabase.rpc("admin_users_raw");
    if (error) throw DbError("사용자 목록 조회에 실패했습니다.", error);
    // RPC 는 늘 7키 객체를 준다(coalesce '[]'). 객체가 아니면 계약 위반 — 빈 목록으로 감추지 않는다.
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw DbError("사용자 목록 조회에 실패했습니다.");
    }
    res.json(deriveAdminUsersOverview(data as AdminUsersRaw));
  } catch (e) {
    next(e);
  }
});

// --- POST /users — 사전 등록 · 승인 대기 승인 · 생성 (D-03) · DMA 연결 한 번에 (D-16) ---
adminRouter.post("/users", async (req, res, next) => {
  try {
    const body = parseOrThrow(AdminUserUpsertBody, req.body ?? {});
    if (body.email === req.adminEmail && body.role !== "admin") throw SelfLockout();
    // DMA 를 함께 만들 때는 relay 가 필수 — 설정이 없으면 **쓰기 전에** 503(허용 행만 남는 반쪽 상태를 만들지 않는다).
    const relay = body.dma ? requireRelayAdmin(req) : undefined;

    const supabase = req.app.locals.supabase as SupabaseClient;
    const { error } = await supabase
      .from("app_users")
      .upsert(
        { email: body.email, role: body.role, updated_at: new Date().toISOString() },
        { onConflict: "email" },
      );
    if (error) throw DbError("사용자 저장에 실패했습니다.", error);

    audit(req, "upsert", body.email, { role: body.role, ...(body.dma ? { dma: true } : {}) });
    if (!relay || !body.dma) {
      res.json({ ok: true, relayNotified: await notifyAccess(req, "upsert") });
      return;
    }

    // DMA 유저 + 첫 계좌 → 등록 서버마다 op 1 (relay 가 비밀번호 암호화 · 의도 저장 · 반영 · 결과 기록).
    // 비밀번호 평문은 여기서 relay 로만 간다(VPC 내부) — Express 는 암호화 · 저장 · 로그하지 않는다(Phase 15 D-19).
    // relay 가 거부(409) · 실패(502)하면 위 app_users 행은 남는다 — 「DMA 연결 없음」 사용자로 보이고, 편집 시트의
    // 「DMA 연결」(POST /users/:email/dma)로 다시 시도한다(되돌리면 승인 대기 사용자의 허용까지 사라진다).
    const results = relayResults(
      await relay.createDmaUser({ email: body.email, ...body.dma }, req.adminEmail!),
      "dma-create",
    );
    audit(req, "dma-create", body.email, { servers: results.map((r) => `${r.server}:${r.outcome}`) });
    // 생성 RPC 가 app_users.dma_user_id 를 채웠다 — 접근 맵을 바로 다시 읽혀 새 trader 의 DMA 가 60초를 기다리지 않게.
    res.json({ ok: true, relayNotified: await notifyAccess(req, "dma-create"), results });
  } catch (e) {
    next(e);
  }
});

// --- PATCH /users/:email — 역할 변경 (D-04 강등 즉시) ---
adminRouter.patch("/users/:email", async (req, res, next) => {
  try {
    const { email } = parseOrThrow(adminEmailParam, req.params);
    const { role } = parseOrThrow(AdminRolePatchBody, req.body ?? {});
    if (email === req.adminEmail && role !== "admin") throw SelfLockout();

    const supabase = req.app.locals.supabase as SupabaseClient;
    const { data, error } = await supabase
      .from("app_users")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("email", email)
      .select("email");
    if (error) throw DbError("역할 변경에 실패했습니다.", error);
    if (!Array.isArray(data) || data.length === 0) throw UserNotFound();

    audit(req, "role", email, { role });
    res.json({ ok: true, relayNotified: await notifyAccess(req, "role") });
  } catch (e) {
    next(e);
  }
});

// --- DELETE /users/:email — DMA 연결 없는 사용자만 (연결 있으면 29-13 relay 경로) ---
adminRouter.delete("/users/:email", async (req, res, next) => {
  try {
    const { email } = parseOrThrow(adminEmailParam, req.params);
    if (email === req.adminEmail) throw SelfLockout();

    const supabase = req.app.locals.supabase as SupabaseClient;
    // 「DMA 없음」 조건을 삭제 문장 자체에 건다 — 조회와 삭제 사이에 DMA 가 연결되는 경합에도 연결된 행은 지워지지 않는다.
    const { data, error } = await supabase
      .from("app_users")
      .delete()
      .eq("email", email)
      .is("dma_user_id", null)
      .select("email");
    if (error) throw DbError("사용자 삭제에 실패했습니다.", error);

    if (!Array.isArray(data) || data.length === 0) {
      // 0행 = 없는 사용자 또는 DMA 연결 있음 — 어느 쪽인지 1회 더 본다(거부 경로에서만 왕복 1회 추가).
      const { data: row, error: e2 } = await supabase
        .from("app_users")
        .select("dma_user_id")
        .eq("email", email)
        .maybeSingle();
      if (e2) throw DbError("사용자 삭제에 실패했습니다.", e2);
      throw row ? HasDma() : UserNotFound();
    }

    audit(req, "delete", email);
    res.json({ ok: true, relayNotified: await notifyAccess(req, "delete") });
  } catch (e) {
    next(e);
  }
});
