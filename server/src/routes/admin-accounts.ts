import { Router, type Request, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  maskDmaUserId,
  type AdminAccountFanout,
  type AdminAccountSaveResponse,
  type AdminAccountsOverview,
} from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { ApiError, ValidationFailed } from "../errors.js";
import {
  AdminAccountCreateSchema,
  AdminAccountSaveSchema,
  accountMasterParam,
  kbAccountIssues,
} from "../schemas/admin.js";
import type { RelayAdminClient } from "../services/relay-admin-client.js";
import { DbError, audit, parseOrThrow, relayResults } from "./admin.js";

/**
 * quick 261106-lwu (D-03 · D-06 · D-07 · D-08) — 어드민 계좌 마스터 API. `/admin/accounts` 화면이 부른다.
 *
 * - GET    /accounts                     : RPC `admin_accounts_raw` 1회 → `AdminAccountsOverview` 그대로(파생 없음).
 * - POST   /accounts                     : 등록 — `{ broker, accountNo, name, branchNo, traderId }` → RPC
 *                                          `dma_admin_create_account`. 계좌번호는 shared `normalizeAccountNo` 정규화값으로.
 *                                          **DB 마스터에만 쓴다 — relay · 증권사 서버를 부르지 않는다(D-07).**
 *                                          중복 409 `ACCOUNT_EXISTS` · CHECK 위반 400.
 * - PUT    /accounts/:broker/:accountNo  : 저장 — `{ name, branchNo, traderId }` → RPC `dma_admin_update_account`(마스터 +
 *                                          모든 연결 행 한 트랜잭션) → 연결된 DMA 사용자마다 기존 relay
 *                                          `PUT /internal/admin/dma-users/:dma/accounts` 로 같은 값 반영(그 사용자의 지금 active
 *                                          등록 서버 · priority 그대로 · orderEndpoint 없음 = 87 IP/MAC 보존). 한 사용자 relay
 *                                          거부 · 실패는 그 항목 `error` 로 접고 나머지는 계속한다 — 응답은 200 `{ ok, fanout }`.
 *                                          active 서버가 없는 링크(removing 만)는 부르지 않는다(relay 는 빈 servers 를 거부).
 * - DELETE /accounts/:broker/:accountNo  : 삭제 — 연결 0명만. 연결 있으면 409 `ACCOUNT_IN_USE`(RPC · FK 23503 모두).
 *
 * 감사 줄에는 계좌번호를 넣지 않는다(증권사만) · DMA id 는 `maskDmaUserId`.
 *
 * ★ 관문은 `/accounts` 경로에만 건다 — 이 라우터는 adminRouter 앞에 마운트된다(app.ts). 경로 없이 걸면 /users 요청도
 *   여기서 역할 조회를 한 번 더 해 Cloud Run → Supabase 왕복이 늘어난다(admin-servers.ts 와 같은 규칙).
 */

export const adminAccountsRouter: RouterT = Router();

adminAccountsRouter.use("/accounts", requireAuth(), requireAdmin());

type PgError = { code?: string; message?: string };

const NoSuchAccount = () => new ApiError(404, "NOT_FOUND", "등록되지 않은 계좌예요.");
const AccountInUse = () =>
  new ApiError(
    409,
    "ACCOUNT_IN_USE",
    "연결된 사용자가 있어 삭제할 수 없어요 — 「사용자」 에서 먼저 연결을 해제하세요",
  );

/** RPC `dma_admin_update_account` 의 링크 1개 — 팬아웃 대상. */
type AccountLink = { dmaUserId: string; priority: number; servers: string[] };

function isAccountLink(v: unknown): v is AccountLink {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.dmaUserId === "string" &&
    typeof o.priority === "number" &&
    Array.isArray(o.servers) &&
    o.servers.every((s) => typeof s === "string")
  );
}

// --- GET /accounts — 계좌 목록 (D-06) ---
adminAccountsRouter.get("/accounts", async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { data, error } = await supabase.rpc("admin_accounts_raw");
    if (error) throw DbError("계좌 목록 조회에 실패했습니다.", error);
    // RPC 는 늘 { accounts: [] } 를 준다(coalesce '[]'). 아니면 계약 위반 — 빈 목록으로 감추지 않는다.
    const raw = data as Partial<AdminAccountsOverview> | null;
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.accounts)) {
      throw DbError("계좌 목록 조회에 실패했습니다.");
    }
    res.json(raw);
  } catch (e) {
    next(e);
  }
});

// --- POST /accounts — 계좌 등록 (D-07 · DB 마스터만) ---
adminAccountsRouter.post("/accounts", async (req, res, next) => {
  try {
    const body = parseOrThrow(AdminAccountCreateSchema, req.body ?? {});
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { error } = await supabase.rpc("dma_admin_create_account", { p_account: body });
    if (error) {
      const e = error as PgError;
      if (e.message === "ACCOUNT_EXISTS") throw new ApiError(409, "ACCOUNT_EXISTS", "이미 등록된 계좌예요.");
      if (e.code === "23514") throw ValidationFailed("계좌 값이 증권사 규칙에 맞지 않아요.");
      throw DbError("계좌 등록에 실패했습니다.", error);
    }
    audit(req, "account-create", body.broker);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * 링크 1개 relay 반영 — 거부(409) · 실패(502) · 클라이언트 없음은 그 항목 `error` 로 접는다(D-08 — 전체 실패로 만들지 않는다).
 */
async function fanoutOne(
  req: Request,
  relay: RelayAdminClient | undefined,
  account: { broker: "KB" | "KYOBO"; accountNo: string; name: string; branchNo: string; traderId: string },
  link: AccountLink,
): Promise<AdminAccountFanout> {
  if (!relay) {
    return {
      dmaUserId: link.dmaUserId,
      results: [],
      error: { code: "RELAY_UNAVAILABLE", message: "relay 연결이 설정되지 않아 처리할 수 없어요." },
    };
  }
  try {
    const results = relayResults(
      await relay.putAccount(
        link.dmaUserId,
        { account: { ...account, priority: link.priority }, servers: link.servers },
        req.adminEmail!,
      ),
      "account-save",
    );
    return { dmaUserId: link.dmaUserId, results, error: null };
  } catch (e) {
    const err =
      e instanceof ApiError
        ? { code: e.code, message: e.message }
        : { code: "RELAY_FAILED", message: "relay 처리에 실패했어요. 잠시 뒤 다시 시도하세요." };
    return { dmaUserId: link.dmaUserId, results: [], error: err };
  }
}

// --- PUT /accounts/:broker/:accountNo — 계좌 저장 + 연결 사용자 팬아웃 (D-08) ---
adminAccountsRouter.put("/accounts/:broker/:accountNo", async (req, res, next) => {
  try {
    const { broker, accountNo } = parseOrThrow(accountMasterParam, req.params);
    const body = parseOrThrow(AdminAccountSaveSchema, req.body ?? {});
    const issue = kbAccountIssues({ broker, ...body })[0];
    if (issue) throw ValidationFailed(`${issue.path}: ${issue.message}`);
    // 교보는 지점 · 트레이더 없음(D-03) — 남은 값이 실려 와도 빈 값으로.
    const values = {
      name: body.name,
      branchNo: broker === "KYOBO" ? "" : body.branchNo,
      traderId: broker === "KYOBO" ? "" : body.traderId,
    };

    const supabase = req.app.locals.supabase as SupabaseClient;
    const { data, error } = await supabase.rpc("dma_admin_update_account", {
      p_broker: broker,
      p_account_no: accountNo,
      p_name: values.name,
      p_branch_no: values.branchNo,
      p_trader_id: values.traderId,
    });
    if (error) {
      const e = error as PgError;
      if (e.message === "NO_SUCH_ACCOUNT") throw NoSuchAccount();
      if (e.code === "23514") throw ValidationFailed("계좌 값이 증권사 규칙에 맞지 않아요.");
      throw DbError("계좌 저장에 실패했습니다.", error);
    }
    const links = (data as { links?: unknown } | null)?.links;
    if (!Array.isArray(links) || !links.every(isAccountLink)) throw DbError("계좌 저장에 실패했습니다.");

    const relay = req.app.locals.relayAdmin as RelayAdminClient | undefined;
    const account = { broker, accountNo, ...values };
    const fanout = await Promise.all(
      links.filter((l) => l.servers.length > 0).map((l) => fanoutOne(req, relay, account, l)),
    );

    audit(req, "account-save", broker, {
      users: links.length,
      fanout: fanout.flatMap((f) =>
        f.error
          ? [`${maskDmaUserId(f.dmaUserId)}:error:${f.error.code}`]
          : f.results.map((r) => `${maskDmaUserId(f.dmaUserId)}:${r.server}:${r.outcome}`),
      ),
    });
    const out: AdminAccountSaveResponse = { ok: true, fanout };
    res.json(out);
  } catch (e) {
    next(e);
  }
});

// --- DELETE /accounts/:broker/:accountNo — 계좌 삭제 (D-08 · 연결 0명만) ---
adminAccountsRouter.delete("/accounts/:broker/:accountNo", async (req, res, next) => {
  try {
    const { broker, accountNo } = parseOrThrow(accountMasterParam, req.params);
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { error } = await supabase.rpc("dma_admin_delete_account", {
      p_broker: broker,
      p_account_no: accountNo,
    });
    if (error) {
      const e = error as PgError;
      if (e.message === "ACCOUNT_IN_USE" || e.code === "23503") throw AccountInUse();
      if (e.message === "NO_SUCH_ACCOUNT") throw NoSuchAccount();
      throw DbError("계좌 삭제에 실패했습니다.", error);
    }
    audit(req, "account-delete", broker);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
