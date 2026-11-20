import { Router, type Router as RouterT, type Request } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  appliedEffect,
  effectDiff,
  pendAccKeys,
  reflectEffect,
  type SettlementAccKey,
  type SettlementEffect,
  type SettlementPend,
  type SettlementView,
  type SettlementWriteResponse,
} from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { ApiError, ValidationFailed } from "../errors.js";
import { logger } from "../logger.js";
import {
  SETTLEMENT_TEXT_BAD_SHAPE,
  SETTLEMENT_TEXT_FUTURE_DATE,
  SETTLEMENT_TEXT_PERSON_NOT_IN_POOL,
  SettlementDeleteBodySchema,
  SettlementLedgerBodySchema,
  settlementIdParam,
  type SettlementLedgerBodyT,
} from "../schemas/settlement.js";
import {
  assertRevertable,
  pendMessage,
  planPend,
  planReflect,
  readSettlement,
  retryPend,
  sendReflect,
  unrevertedMessage,
  type ReflectPlanItem,
} from "../services/settlement-budget.js";
import { DbError, audit } from "./admin.js";

/**
 * Phase 44 — 어드민 정산(`/admin/settlement`) 라우트.
 *
 * - GET /settlement : 계좌 4개의 예수금(D-03 · 계좌 메뉴와 같은 판정) · 거래 기록 · 정산 기록(`SettlementView`).
 *   RPC `admin_settlement_raw` 1회 ∥ relay 예수금 읽기 → relay 로 읽은 값은 RPC `settlement_record_reads` 로 DB 에 남긴다(D-04).
 *   기록이 실패해도 응답은 막지 않는다 — 방금 읽은 값으로 200 + 경고 로그 한 줄(다음 조회 때 다시 기록된다).
 *   기록은 응답 뒤로 미루지 않는다(Cloud Run 은 요청 밖 CPU 가 제한돼 기록이 사라질 수 있다).
 * - POST /settlement/ledger      : 거래 저장(44-05 · D-10 · D-12 · D-29) — 「예수금에도 반영」 이면 그 계좌 예수금을 같이 고친다.
 * - PUT  /settlement/ledger/:id  : 거래 고치기(D-19 · D-23) — 반영 켬이면 「옛 반영 되돌림 + 새 값」 차이 한 벌만 보낸다 ·
 *                                  끄면 예수금을 그대로 두고 reflect false · pend {} 로 저장한다. 정산 때 만든 줄은 409.
 * - DELETE /settlement/ledger/:id : 거래 지우기(D-30) — 반영 켬이면 넣어 둔 증감을 되돌린다 · 못 되돌릴 것을 미리 알면 409
 *                                  `REVERT_UNREADABLE`(아무것도 바꾸지 않음) · 지운 뒤 보내기만 실패하면 `unreverted` · `message`.
 * - POST /settlement/ledger/:id/retry : 다시 반영(D-26) — 못 보낸 계좌만 · 지금 값 = 목표값이면 보내지 않는다(Pitfall 2).
 *
 * ── 돈 경로 순서(D-26) ─────────────────────────────────────
 *   검증(zod) → (반영 켬) 그 순간 예수금 읽기 → 계좌별 목표값 → 저장 RPC(pend = 보낼 모든 계좌 · 목표값 포함)
 *   → **RPC 가 성공했을 때만** relay 예수금 쓰기(op 6) → `settlement_set_pend`(남은 것만).
 *   RPC 오류는 어느 것이든 그 자리에서 throw — 오류를 받은 뒤 보내기로 넘어가는 갈래가 없다.
 *   장중에도 반영한다(D-13) — 시각으로 막지 않는다(경고 문구는 화면 몫).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401.
 *   D-18     `requireAdmin()` — DB role 을 매 요청 조회. admin 이 아니면 403 · RPC 0회 · relay 0회.
 *            관문은 `/settlement` 경로에만 건다 — 이 라우터는 adminRouter 앞에 마운트되므로(app.ts) 전체에 걸면 다른 어드민
 *            요청도 역할 조회를 한 번 더 한다.
 *   D-20     적은 사람 · 고친 사람 = `req.adminEmail`(RPC `p_by`) · 쓰기마다 `audit` 한 줄(계좌번호 · 금액 없이).
 *   권한     정산 표 · RPC 는 service_role 전용(anon · authenticated 명시 REVOKE) — 이 라우터가 유일한 창구.
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다. 경고 로그엔 계좌 키 · 오류 코드만(계좌번호 · 금액 없음).
 */

export const adminSettlementRouter: RouterT = Router();

adminSettlementRouter.use("/settlement", requireAuth(), requireAdmin());

type PgError = { code?: string; message?: string };

const NoSuchLedgerRow = () => new ApiError(404, "NOT_FOUND", "없는 거래예요");
const SettleLinked = () => new ApiError(409, "SETTLE_LINKED", "정산 때 만든 줄은 그 정산을 취소해야 사라져요");

/**
 * 입력 검증 — `parseOrThrow` 와 같되 업무 규칙(`custom` 이슈)은 경로 접두 없이 문장만(화면 「저장하지 못했어요 · <message>」 자리).
 */
function parseSettlement<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw ValidationFailed(issue.code === "custom" ? issue.message : `${issue.path.join(".")}: ${issue.message}`);
  }
  return parsed.data;
}

/**
 * 거래 쓰기 RPC 오류 → API 오류(44-03 오류 코드 표). 업무 코드는 400 · 404 · 409 로, 모양 CHECK(23514)는 400 으로,
 * 그 밖은 DB_ERROR(500 · 원인은 로그 전용).
 */
function ledgerRpcError(error: unknown, msg: string): ApiError {
  const e = error as PgError;
  if (e.message === "FUTURE_DATE") return ValidationFailed(SETTLEMENT_TEXT_FUTURE_DATE);
  if (e.message === "PERSON_NOT_IN_POOL") return ValidationFailed(SETTLEMENT_TEXT_PERSON_NOT_IN_POOL);
  if (e.message === "NO_SUCH_ROW") return NoSuchLedgerRow();
  if (e.message === "SETTLE_LINKED") return SettleLinked();
  if (e.code === "23514") return ValidationFailed(SETTLEMENT_TEXT_BAD_SHAPE);
  return DbError(msg, error);
}

/** 저장 RPC 반환(`settlement_ledger_json` 17키)의 id — 없으면 계약 위반(DB_ERROR). */
function savedId(data: unknown): number {
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "number") throw DbError("거래 저장에 실패했습니다.", new Error("settlement_ledger_save shape"));
  return id;
}

/**
 * 반영 결과 기록(`settlement_set_pend`) — relay 쓰기가 이미 끝난 뒤라 실패해도 응답은 막지 않는다(경고 한 줄).
 * 그때 DB 에는 저장 때 남긴 목표값 pend 가 그대로 있어, 화면이 「예수금 미반영」 을 보이고 「다시 반영」 이 목표값 대조로
 * 두 번 더하지 않고 정리한다(Pitfall 2).
 */
async function recordPend(req: Request, pends: { id: number; pend: SettlementPend }[]): Promise<void> {
  const supabase = req.app.locals.supabase as SupabaseClient;
  let code: string | null = null;
  let failed = false;
  try {
    const { error } = await supabase.rpc("settlement_set_pend", { p_pends: pends });
    if (error) {
      failed = true;
      code = (error as PgError).code ?? null;
    }
  } catch {
    failed = true;
  }
  if (failed) {
    logger.warn(
      { settlement: { op: "set-pend", ids: pends.map((p) => p.id), code } },
      "[admin] 정산 반영 결과 기록 실패 — 저장 때 남긴 목표값으로 다시 반영이 정리한다",
    );
  }
}

const accountsOf = (e: SettlementEffect) => Object.keys(e) as SettlementAccKey[];

/**
 * 거래 저장 · 고치기 공용(`id` null = 새 줄). 반영 끔이면 읽기 · 보내기 없이 `reflect false` · `pend {}` 로 저장한다.
 * 반영 켬이면 그 순간 예수금을 읽고 증감(새 줄 = `reflectEffect` · 고치기 = `effectDiff(appliedEffect(옛 줄), reflectEffect(새 값))`)
 * 의 목표값을 계산해 저장 RPC → 성공일 때만 보내기 → 남은 것 기록.
 */
async function saveLedger(
  req: Request,
  id: number | null,
  body: SettlementLedgerBodyT,
): Promise<SettlementWriteResponse> {
  const supabase = req.app.locals.supabase as SupabaseClient;
  const op = id === null ? "settlement-ledger-save" : "settlement-ledger-edit";
  const save = (pend: SettlementPend) =>
    supabase.rpc("settlement_ledger_save", { p_id: id, p_row: { ...body, pend }, p_by: req.adminEmail! });

  if (!body.reflect) {
    const { data, error } = await save({});
    if (error) throw ledgerRpcError(error, "거래 저장에 실패했습니다.");
    const rowId = savedId(data);
    audit(req, op, body.kind, { id: rowId, reflect: false, accounts: [] });
    return { ok: true, id: rowId, pend: {} };
  }

  const read = await readSettlement(req);
  let deltas: SettlementEffect;
  if (id === null) {
    deltas = reflectEffect(body);
  } else {
    const old = read.raw.ledger.find((r) => r.id === id);
    if (!old) throw NoSuchLedgerRow();
    if (old.settleId !== null) throw SettleLinked();
    deltas = effectDiff(appliedEffect(old), reflectEffect(body));
  }
  const plan = planReflect(read, deltas);

  const { data, error } = await save(planPend(plan));
  if (error) throw ledgerRpcError(error, "거래 저장에 실패했습니다.");
  const rowId = savedId(data);

  const pend = await sendReflect(req, plan);
  await recordPend(req, [{ id: rowId, pend }]);
  audit(req, op, body.kind, { id: rowId, reflect: true, accounts: accountsOf(deltas) });
  return { ok: true, id: rowId, pend };
}

adminSettlementRouter.get("/settlement", async (req, res, next) => {
  try {
    const { raw, accounts, reads, nowIso } = await readSettlement(req);
    if (reads.length > 0) {
      const supabase = req.app.locals.supabase as SupabaseClient;
      let code: string | null = null;
      let failed = false;
      try {
        const { error } = await supabase.rpc("settlement_record_reads", { p_reads: reads });
        if (error) {
          failed = true;
          code = (error as { code?: string }).code ?? null;
        }
      } catch {
        failed = true;
      }
      if (failed) {
        logger.warn(
          { settlement: { op: "record-reads", accounts: reads.map((r) => r.accKey), code } },
          "[admin] 정산 읽은 예수금 기록 실패 — 응답은 방금 읽은 값으로",
        );
      }
    }
    const body: SettlementView = { now: nowIso, accounts, ledger: raw.ledger, settles: raw.settles };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

// --- POST /settlement/ledger — 거래 저장 (+ 예수금 반영) ---
adminSettlementRouter.post("/settlement/ledger", async (req, res, next) => {
  try {
    const body = parseSettlement(SettlementLedgerBodySchema, req.body ?? {});
    res.json(await saveLedger(req, null, body));
  } catch (e) {
    next(e);
  }
});

// --- PUT /settlement/ledger/:id — 거래 고치기 (+ 반영 차이) ---
adminSettlementRouter.put("/settlement/ledger/:id", async (req, res, next) => {
  try {
    const { id } = parseSettlement(settlementIdParam, req.params);
    const body = parseSettlement(SettlementLedgerBodySchema, req.body ?? {});
    res.json(await saveLedger(req, id, body));
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /settlement/ledger/:id — 거래 지우기(D-19 · D-23 · D-30). 바디 `{ reflect }`.
 * 반영 켬이면 그 거래가 예수금에 넣어 둔 증감(`appliedEffect` — 못 보냈던 계좌는 빠진다)을 되돌린다.
 * 되돌릴 수 없다는 것을 미리 알 수 있으면(못 읽음 · 대응 · 등록 서버 없음 · 1원 미만) 지우기 전에 409 `REVERT_UNREADABLE`
 * (지우기 RPC 0 · relay 쓰기 0). 지운 뒤 보내기만 실패한 계좌는 지운 줄 pend 에 남기고(D-21 추적) `unreverted` · `message`.
 */
adminSettlementRouter.delete("/settlement/ledger/:id", async (req, res, next) => {
  try {
    const { id } = parseSettlement(settlementIdParam, req.params);
    const { reflect } = parseSettlement(SettlementDeleteBodySchema, req.body ?? {});
    const supabase = req.app.locals.supabase as SupabaseClient;
    const remove = async () => {
      const { error } = await supabase.rpc("settlement_ledger_delete", { p_id: id, p_by: req.adminEmail! });
      if (error) throw ledgerRpcError(error, "거래 지우기에 실패했습니다.");
    };

    let plan: ReflectPlanItem[] = [];
    // 감사 대상 = 거래 종류(반영 끔은 옛 줄을 읽지 않아 모른다 → "ledger").
    let kind: string = "ledger";
    if (reflect) {
      const read = await readSettlement(req);
      const old = read.raw.ledger.find((r) => r.id === id);
      if (!old) throw NoSuchLedgerRow();
      if (old.settleId !== null) throw SettleLinked();
      kind = old.kind;
      const revert = effectDiff(appliedEffect(old), {});
      if (accountsOf(revert).length > 0) plan = assertRevertable(read, revert, "지워요");
    }

    await remove();
    const pend = plan.length > 0 ? await sendReflect(req, plan) : {};
    const unreverted = pendAccKeys(pend);
    if (unreverted.length > 0) await recordPend(req, [{ id, pend }]);
    audit(req, "settlement-ledger-delete", kind, {
      id,
      reflect,
      accounts: plan.map((it) => it.accKey),
      unreverted,
    });
    const out: SettlementWriteResponse = {
      ok: true,
      pend,
      unreverted,
      ...(unreverted.length > 0 ? { message: unrevertedMessage(unreverted) } : {}),
    };
    res.json(out);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /settlement/ledger/:id/retry — 다시 반영(D-26). 못 보낸 계좌만 다시 보낸다(확인 없이 · 화면 「다시 반영」).
 * 지금 값 = 기록된 목표값이면 보내지 않고 반영됨으로 정리(Pitfall 2) · 아니면 지금 + 못 보낸 증감.
 */
adminSettlementRouter.post("/settlement/ledger/:id/retry", async (req, res, next) => {
  try {
    const { id } = parseSettlement(settlementIdParam, req.params);
    const read = await readSettlement(req);
    const row = read.raw.ledger.find((r) => r.id === id);
    if (!row) throw NoSuchLedgerRow();
    const before = pendAccKeys(row.pend);
    if (before.length === 0) {
      const empty: SettlementWriteResponse = { ok: true, id, pend: {} };
      res.json(empty);
      return;
    }
    const pend = await retryPend(req, read, row.pend);
    await recordPend(req, [{ id, pend }]);
    const left = pendAccKeys(pend);
    audit(req, "settlement-ledger-retry", row.kind, { id, accounts: before, left });
    const out: SettlementWriteResponse = {
      ok: true,
      id,
      pend,
      ...(left.length > 0 ? { message: pendMessage(pend) } : {}),
    };
    res.json(out);
  } catch (e) {
    next(e);
  }
});
