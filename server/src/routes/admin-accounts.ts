import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  maskDmaUserId,
  type AdminAccountFanout,
  type AdminAccountSaveResponse,
  type AdminAccountsOverview,
  type AdminCommandResponse,
  type DmaBroker,
} from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { ApiError, ValidationFailed } from "../errors.js";
import {
  AdminAccountBudgetSchema,
  AdminAccountCreateSchema,
  AdminAccountFeeSchema,
  AdminAccountSaveSchema,
  accountMasterParam,
  kbAccountIssues,
} from "../schemas/admin.js";
import type { RelayAdminClient, RelayAdminResponse } from "../services/relay-admin-client.js";
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
 *                                          quick 261106-ntl N-02 — 바디에 `orderEndpoint`(KB 만 · 교보면 400)가 있으면 각 사용자
 *                                          putAccount 바디에 그대로 싣는다(없으면 키 자체를 넣지 않는다 = 87 IP/MAC 보존).
 * - PUT    /accounts/:broker/:accountNo/budget : 예수금(quick 261106-ntl N-01) — `{ budgetKrw }` → RPC `admin_accounts_raw` 1회로
 *                                          그 계좌의 active 등록 서버가 있는 사용자를 찾아 사용자마다 기존 relay
 *                                          `…/dma-users/:dma/accounts/:broker/:accountNo/budget`(op 6) 1회 → 200 `{ ok, fanout }`.
 * - PUT    /accounts/:broker/:accountNo/fee    : 수수료 · 매도세(quick 261106-ntl N-01) — `{ feePpm, sellTaxPpm }` → 같은 팬아웃(op 7).
 *                                          0~10000 범위 검사는 하지 않는다(gh-trade code 1 경로 — per-user 경로와 같은 계약).
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
 * 사용자 1명 relay 호출 → 팬아웃 1건. 거부(409) · 실패(502) · 클라이언트 없음은 그 항목 `error` 로 접는다(D-08 — 전체 실패로
 * 만들지 않는다). 계좌 저장(putAccount) · 예수금(op 6) · 수수료(op 7) 팬아웃이 함께 쓴다(quick 261106-ntl).
 */
async function fanoutOne(
  relay: RelayAdminClient | undefined,
  dmaUserId: string,
  op: string,
  call: (relay: RelayAdminClient) => Promise<RelayAdminResponse<AdminCommandResponse>>,
): Promise<AdminAccountFanout> {
  if (!relay) {
    return {
      dmaUserId,
      results: [],
      error: { code: "RELAY_UNAVAILABLE", message: "relay 연결이 설정되지 않아 처리할 수 없어요." },
    };
  }
  try {
    const results = relayResults(await call(relay), op);
    return { dmaUserId, results, error: null };
  } catch (e) {
    const err =
      e instanceof ApiError
        ? { code: e.code, message: e.message }
        : { code: "RELAY_FAILED", message: "relay 처리에 실패했어요. 잠시 뒤 다시 시도하세요." };
    return { dmaUserId, results: [], error: err };
  }
}

/** 감사 줄의 팬아웃 요약 — `<마스킹 DMA id>:<서버>:<outcome>` · 항목 오류는 `<마스킹 DMA id>:error:<code>`(계좌번호 없음). */
function fanoutAudit(fanout: AdminAccountFanout[]): string[] {
  return fanout.flatMap((f) =>
    f.error
      ? [`${maskDmaUserId(f.dmaUserId)}:error:${f.error.code}`]
      : f.results.map((r) => `${maskDmaUserId(f.dmaUserId)}:${r.server}:${r.outcome}`),
  );
}

/**
 * quick 261106-ntl N-01 — 계좌를 쓰는 사용자 중 active 등록 서버가 있는 DMA id(RPC 정렬 = DMA id 오름차순). 기존 RPC
 * `admin_accounts_raw` 1회를 재사용한다(새 RPC · 표 직접 조회 없음). 목록에 없는 계좌 → 404.
 */
async function activeLinkUsers(supabase: SupabaseClient, broker: DmaBroker, accountNo: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("admin_accounts_raw");
  if (error) throw DbError("계좌 조회에 실패했습니다.", error);
  const raw = data as Partial<AdminAccountsOverview> | null;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.accounts)) throw DbError("계좌 조회에 실패했습니다.");
  const account = raw.accounts.find((a) => a.broker === broker && a.accountNo === accountNo);
  if (!account) throw NoSuchAccount();
  return account.users.filter((u) => u.servers.some((s) => s.state === "active")).map((u) => u.dmaUserId);
}

// --- PUT /accounts/:broker/:accountNo — 계좌 저장 + 연결 사용자 팬아웃 (D-08) ---
adminAccountsRouter.put("/accounts/:broker/:accountNo", async (req, res, next) => {
  try {
    const { broker, accountNo } = parseOrThrow(accountMasterParam, req.params);
    const body = parseOrThrow(AdminAccountSaveSchema, req.body ?? {});
    const issue = kbAccountIssues({ broker, ...body })[0];
    if (issue) throw ValidationFailed(`${issue.path}: ${issue.message}`);
    // N-02 — 주문자 IP/MAC 은 KB 계좌만(per-user 계좌 PUT 과 같은 규칙) · RPC 전에 거부한다.
    const orderEndpoint = body.orderEndpoint;
    if (orderEndpoint && broker === "KYOBO") {
      throw ValidationFailed("orderEndpoint: 주문자 IP · MAC 은 KB 계좌만이에요");
    }
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
      links
        .filter((l) => l.servers.length > 0)
        .map((l) =>
          fanoutOne(relay, l.dmaUserId, "account-save", (r) =>
            r.putAccount(
              l.dmaUserId,
              {
                account: { ...account, priority: l.priority },
                servers: l.servers,
                ...(orderEndpoint ? { orderEndpoint } : {}),
              },
              req.adminEmail!,
            ),
          ),
        ),
    );

    audit(req, "account-save", broker, {
      users: links.length,
      fanout: fanoutAudit(fanout),
      // 값은 싣지 않는다 — 사용자 PC 식별 정보(로그 금지).
      ...(orderEndpoint
        ? { orderEndpoint: orderEndpoint.orderIp === "" && orderEndpoint.orderMac === "" ? "clear" : "set" }
        : {}),
    });
    const out: AdminAccountSaveResponse = { ok: true, fanout };
    res.json(out);
  } catch (e) {
    next(e);
  }
});

// --- PUT /accounts/:broker/:accountNo/budget — 예수금 팬아웃 (quick 261106-ntl N-01 · op 6) ---
adminAccountsRouter.put("/accounts/:broker/:accountNo/budget", async (req, res, next) => {
  try {
    const { broker, accountNo } = parseOrThrow(accountMasterParam, req.params);
    const { budgetKrw } = parseOrThrow(AdminAccountBudgetSchema, req.body ?? {});
    const supabase = req.app.locals.supabase as SupabaseClient;
    const users = await activeLinkUsers(supabase, broker, accountNo);
    const relay = req.app.locals.relayAdmin as RelayAdminClient | undefined;
    const fanout = await Promise.all(
      users.map((dma) =>
        fanoutOne(relay, dma, "account-budget", (r) =>
          r.setAccountBudget(dma, broker, accountNo, { budgetKrw }, req.adminEmail!),
        ),
      ),
    );
    audit(req, "account-budget", broker, { budgetKrw, users: users.length, fanout: fanoutAudit(fanout) });
    const out: AdminAccountSaveResponse = { ok: true, fanout };
    res.json(out);
  } catch (e) {
    next(e);
  }
});

// --- PUT /accounts/:broker/:accountNo/fee — 수수료 · 매도세 팬아웃 (quick 261106-ntl N-01 · op 7 · 범위 검사 없음) ---
adminAccountsRouter.put("/accounts/:broker/:accountNo/fee", async (req, res, next) => {
  try {
    const { broker, accountNo } = parseOrThrow(accountMasterParam, req.params);
    const { feePpm, sellTaxPpm } = parseOrThrow(AdminAccountFeeSchema, req.body ?? {});
    const supabase = req.app.locals.supabase as SupabaseClient;
    const users = await activeLinkUsers(supabase, broker, accountNo);
    const relay = req.app.locals.relayAdmin as RelayAdminClient | undefined;
    const fanout = await Promise.all(
      users.map((dma) =>
        fanoutOne(relay, dma, "account-fee", (r) =>
          r.setAccountFee(dma, broker, accountNo, { feePpm, sellTaxPpm }, req.adminEmail!),
        ),
      ),
    );
    audit(req, "account-fee", broker, { feePpm, sellTaxPpm, users: users.length, fanout: fanoutAudit(fanout) });
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
