import { Router, type Router as RouterT, type Request, type RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  SETTLEMENT_POOLS,
  addEffects,
  appliedEffectAt,
  carryBasisLabel,
  carryShown,
  cumProfit,
  effectDiff,
  formatEokMan,
  pendAccKeys,
  poolAccountRows,
  reflectEffect,
  settlePlan,
  settledSum,
  type SettlePlan,
  type SettlementAccKey,
  type SettlementEffect,
  type SettlementLedgerRow,
  type SettlementPend,
  type SettlementPoolId,
  type SettlementSettleRow,
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
  SettlementCancelBodySchema,
  SettlementLedgerBodySchema,
  SettlementSettleBodySchema,
  settlementIdParam,
  type SettlementLedgerBodyT,
} from "../schemas/settlement.js";
import {
  assertReconcilable,
  assertRevertable,
  nowOf,
  pendMessage,
  planPend,
  planReflect,
  readSettlement,
  reflectRows,
  retryPend,
  sendReflect,
  unrevertedMessage,
  type ReflectPlanItem,
  type SettlementRead,
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
 * - POST /settlement/settles      : 정산 확정(44-08 · D-16) — server 가 누른 순간 예수금으로 shared `settlePlan` 을 돌려 몫 ·
 *                                  바로 출금 줄을 만든다(브라우저 숫자는 받지 않는다) · 확정 불가면 409 `CANNOT_SETTLE` ·
 *                                  기대값 어긋남은 409 `STALE_SETTLE`(Pitfall 5) · 같은 계좌 여러 줄은 합쳐 한 번 보낸다.
 * - POST /settlement/settles/:id/cancel : 정산 취소(D-17 · D-23 · D-30) — 그 묶음 가장 최근 정산만 · 바로 출금 줄이 넣어 둔
 *                                  증감을 되돌린다 · 못 되돌릴 것을 미리 알면 409 `REVERT_UNREADABLE`.
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
 *   IN-05    정산 쓰기는 인스턴스 안에서 한 번에 하나씩(`serializeSettlementWrites` — 같은 계좌 동시 반영의 읽고-고치고-쓰기 경합).
 */

export const adminSettlementRouter: RouterT = Router();

/** 쓰기 줄 세우기의 안전 상한 — 응답이 끝나지 않는 요청 하나가 뒤 쓰기를 영영 막지 않게(relay 쓰기 상한 15초 + 여유). */
const WRITE_LOCK_MAX_MS = 60_000;
let writeTail: Promise<void> = Promise.resolve();

/**
 * 정산 쓰기 줄 세우기(IN-05) — 이 인스턴스에서 정산 쓰기(GET 밖 전부)를 한 번에 하나씩 처리한다. 쓰기는 「예수금 읽기 →
 * 목표값 계산 → 절댓값 보내기(op 6)」 라, 두 탭 · 두 관리자가 같은 계좌를 동시에 반영하면 둘 다 같은 「지금 값」 을 읽어 한쪽
 * 증감이 사라진다. 줄은 응답이 끝나거나(finish) 연결이 끊길 때(close) · 상한 시간이 지나면 푼다.
 *
 * 한계(문서화한 전제): 줄은 인스턴스 메모리라 다른 Cloud Run 인스턴스(최대 3)의 쓰기와는 겹칠 수 있다 — 관리자 1 ~ 2명 ·
 * 최소 인스턴스 1 로 같은 인스턴스가 받는 것이 보통이다. 응답을 잃은 「거래 기록」 을 다시 눌러 같은 줄이 두 번 생기는 것은
 * 막지 못한다(멱등 키는 DB 변경이 필요해 하지 않았다) — 화면이 시간 초과 · 네트워크 실패를 「저장됐는지 확인하지 못했어요」 로
 * 알리고 목록을 다시 불러온다.
 */
function serializeSettlementWrites(): RequestHandler {
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") {
      next();
      return;
    }
    const prev = writeTail;
    let release!: () => void;
    writeTail = new Promise<void>((r) => {
      release = r;
    });
    let released = false;
    const timer = setTimeout(() => done(), WRITE_LOCK_MAX_MS);
    timer.unref?.();
    function done() {
      if (released) return;
      released = true;
      clearTimeout(timer);
      release();
    }
    res.once("finish", done);
    res.once("close", done);
    void prev.then(() => next());
  };
}

adminSettlementRouter.use("/settlement", requireAuth(), requireAdmin(), serializeSettlementWrites());

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
 * 지우기 · 정산 취소의 되돌림 증감(CR-01) — 줄들이 지금 예수금에 넣어 둔 증감의 반대. pend 는 목표값으로 대조한다:
 * 지금 값 = 목표값인 계좌는 들어간 것이라 되돌리고, 보냈지만 지금 못 읽은 계좌는 「들어갔을 수 있음」 으로 넣어
 * `assertRevertable` 이 「읽지 못해 되돌릴 수 없어요」(D-30)로 막게 한다.
 */
function revertOf(read: SettlementRead, rows: readonly SettlementLedgerRow[]): SettlementEffect {
  const now = nowOf(read);
  return effectDiff(addEffects(rows.map((r) => appliedEffectAt(r, now, { unknownApplied: true }))), {});
}

// ─────────────────────────────────────────────────────────────────────────────
// 정산 확정 · 취소(44-08)
// ─────────────────────────────────────────────────────────────────────────────

const NoSuchSettle = () => new ApiError(404, "NOT_FOUND", "없는 정산이에요");
const NotLatest = () => new ApiError(409, "NOT_LATEST", "더 최근 정산부터 차례로 취소할 수 있어요");

/** 정산 RPC 오류 → API 오류(44-03 오류 코드 표 · 업무 코드는 `message`). 그 밖은 DB_ERROR. */
function settleRpcError(error: unknown, msg: string): ApiError {
  const e = error as PgError;
  if (e.message === "STALE_SETTLE") {
    return new ApiError(409, "STALE_SETTLE", "다른 곳에서 먼저 정산했어요 — 화면을 다시 불러와 주세요");
  }
  if (e.message === "NOT_LATEST") return NotLatest();
  if (e.message === "NO_SUCH_ROW") return NoSuchSettle();
  if (e.code === "23514") return ValidationFailed(SETTLEMENT_TEXT_BAD_SHAPE);
  return DbError(msg, error);
}

/**
 * 확정할 수 없을 때의 문장(UI-SPEC ⑧ 「확정할 수 없을 때」 — 시트 상자와 같은 글자). 이월 기준은 shared `carryBasisLabel`
 * (지난 정산이 있으면 「지난 정산 수준」) · 남은 금액이 만으로 0 이면 「나눌 수익이 없습니다.」(IN-02 · `carryShown`).
 */
function settleBlockMessage(pool: SettlementPoolId, plan: SettlePlan, read: SettlementRead): string {
  const def = SETTLEMENT_POOLS[pool];
  if (plan.block === "unset") {
    return "예수금이 설정되지 않은 계좌가 있어요. 계좌 메뉴에서 설정한 뒤 정산할 수 있어요.";
  }
  if (plan.block === "carry" && carryShown(plan.carryKrw)) {
    const basis = carryBasisLabel(pool, { ledger: read.raw.ledger, settles: read.raw.settles });
    return `${basis}까지 ${formatEokMan(plan.carryKrw)} 남았습니다. 회복한 뒤부터 ${def.ratioLabel} 로 나눕니다.`;
  }
  return "나눌 수익이 없습니다.";
}

/**
 * 정산 기록에 남길 그때의 값(D-16) — 그 묶음 계좌별 예수금 · 넣은 돈 · 들어온 돈 · 나간 돈 · 수익 · 못 읽음 · 읽은 시각,
 * 누적 수익 · 이미 정산한 수익. 바로 출금을 반영하기 **전** 읽기 한 벌로 만든다(목업 `settle-ok`).
 * readAt = 그 묶음 계좌 중 가장 최근 읽은 시각(없으면 지금 — 표 열이 NOT NULL).
 */
function settleSnapshot(
  read: SettlementRead,
  pool: SettlementPoolId,
): { snapshot: SettlementSettleRow["snapshot"]; readAt: string } {
  const accounts = poolAccountRows(pool, read.accounts, read.raw.ledger);
  let readAt: string | null = null;
  for (const a of accounts) {
    if (a.readAt !== null && (readAt === null || Date.parse(a.readAt) > Date.parse(readAt))) readAt = a.readAt;
  }
  return {
    snapshot: {
      accounts,
      cumKrw: cumProfit(pool, read.accounts, read.raw.ledger),
      prevKrw: settledSum(pool, read.raw.settles),
    },
    readAt: readAt ?? read.nowIso,
  };
}

/** 줄별 남은 pend → 계좌별 합(응답 `pend`) — 증감은 더하고 목표값 · 사유는 같은 계좌 첫 줄 것(합쳐 보낸 한 번의 값). */
function sumPends(pends: Iterable<SettlementPend>): SettlementPend {
  const out: SettlementPend = {};
  for (const p of pends) {
    for (const acc of pendAccKeys(p)) {
      const e = p[acc]!;
      const cur = out[acc];
      out[acc] = cur ? { ...cur, deltaKrw: cur.deltaKrw + e.deltaKrw } : { ...e };
    }
  }
  return out;
}

/**
 * 거래 저장 · 고치기 공용(`id` null = 새 줄). 반영 끔이면 읽기 · 보내기 없이 `reflect false` · `pend {}` 로 저장한다.
 * 반영 켬이면 그 순간 예수금을 읽고 증감(새 줄 = `reflectEffect` · 고치기 = `effectDiff(appliedEffectAt(옛 줄, 지금 값), reflectEffect(새 값))`
 *   — 옛 pend 는 목표값으로 대조 · 들어갔는지 모르는 계좌가 있으면 409 `REFLECT_UNKNOWN` · CR-01)
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
    // CR-01 — 옛 pend 를 목표값으로 대조한 뒤 계산한다(이미 들어간 증감을 다시 보내지 않는다). 모르는 계좌가 있으면 409.
    assertReconcilable(read, old.pend);
    deltas = effectDiff(appliedEffectAt(old, nowOf(read)), reflectEffect(body));
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
    // IN-03 — 음수 예수금(실제 손실 상태)은 화면에는 그대로 보이되 DB 기록에서는 뺀다. 표 CHECK(budget_krw ≥ 0)가 한 문장
    // upsert 를 통째로 실패시켜 다른 계좌 기록까지 버려지지 않게 한다(그 계좌는 마지막으로 기록된 값이 남는다).
    const negative = reads.filter((r) => r.budgetKrw < 0).map((r) => r.accKey);
    if (negative.length > 0) {
      logger.warn(
        { settlement: { op: "record-reads", negative } },
        "[admin] 정산 예수금이 음수인 계좌는 읽은 값 기록에서 뺀다",
      );
    }
    const toRecord = reads.filter((r) => r.budgetKrw >= 0);
    if (toRecord.length > 0) {
      const supabase = req.app.locals.supabase as SupabaseClient;
      let code: string | null = null;
      let failed = false;
      try {
        const { error } = await supabase.rpc("settlement_record_reads", { p_reads: toRecord });
        if (error) {
          failed = true;
          code = (error as { code?: string }).code ?? null;
        }
      } catch {
        failed = true;
      }
      if (failed) {
        logger.warn(
          { settlement: { op: "record-reads", accounts: toRecord.map((r) => r.accKey), code } },
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
 * 반영 켬이면 그 거래가 예수금에 넣어 둔 증감(`revertOf` — 못 보냈던 계좌는 빠지고, 지금 값 = 목표값인 계좌는 들어간 것으로 센다 ·
 * 보냈지만 지금 못 읽은 계좌는 아래 409 로 막는다 · CR-01)을 되돌린다.
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
      const revert = revertOf(read, [old]);
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

/** 확정 RPC 반환 `{settleId, rowIds}` — 모양이 어긋나면 계약 위반(DB_ERROR · relay 쓰기 전). */
function confirmResult(data: unknown, outs: number): { settleId: number; rowIds: number[] } {
  const d = data as { settleId?: unknown; rowIds?: unknown } | null;
  const ok =
    typeof d?.settleId === "number" &&
    Array.isArray(d.rowIds) &&
    d.rowIds.length === outs &&
    d.rowIds.every((x) => typeof x === "number");
  if (!ok) throw DbError("정산 확정에 실패했습니다.", new Error("settlement_settle_confirm shape"));
  return { settleId: d!.settleId as number, rowIds: d!.rowIds as number[] };
}

/**
 * POST /settlement/settles — 정산 확정(D-09 · D-15 · D-16 · D-26 · Pitfall 5). 바디 `{ pool, outs, memo, reflect, expectPrev }`.
 *
 * 그 순간 예수금 읽기(못 읽은 계좌는 마지막 값 · stale) → shared `settlePlan` → 확정 불가면 409 `CANNOT_SETTLE`(RPC 0 · relay 0)
 * → 줄별 증감(`withdraw_profit` · 뺄 계좌 −금액) → (반영 켬) 같은 계좌 증감을 합친 목표값으로 줄마다 처음 pend
 * → 확정 RPC(정산 + 바로 출금 줄 한 트랜잭션 · 기대값 대조) → **RPC 가 성공했을 때만** 합쳐 한 번 보내기 → 줄별 남은 것 기록.
 * 스냅샷은 보내기 **전** 읽기 한 벌이라 예수금은 반영 전 값이다.
 */
adminSettlementRouter.post("/settlement/settles", async (req, res, next) => {
  try {
    const body = parseSettlement(SettlementSettleBodySchema, req.body ?? {});
    const supabase = req.app.locals.supabase as SupabaseClient;

    const read = await readSettlement(req);
    const plan = settlePlan(body.pool, { accounts: read.accounts, ledger: read.raw.ledger, settles: read.raw.settles }, body.outs);
    if (!plan.can) throw new ApiError(409, "CANNOT_SETTLE", settleBlockMessage(body.pool, plan, read));

    const effects = plan.outs.map((o) =>
      reflectEffect({ kind: "withdraw_profit", fromAcc: o.fromAcc, toAcc: null, amountKrw: o.amountKrw }),
    );
    const reflectOn = body.reflect && plan.outs.length > 0;
    const reflectPlan = reflectOn ? planReflect(read, addEffects(effects)) : [];
    const firstPend = (e: SettlementEffect): SettlementPend => {
      const p: SettlementPend = {};
      for (const acc of accountsOf(e)) {
        const it = reflectPlan.find((x) => x.accKey === acc);
        if (it) p[acc] = { deltaKrw: e[acc]!, targetKrw: it.targetKrw, reason: it.block ?? "failed" };
      }
      return p;
    };

    const { snapshot, readAt } = settleSnapshot(read, body.pool);
    const { data, error } = await supabase.rpc("settlement_settle_confirm", {
      p_pool: body.pool,
      p_expect_prev: body.expectPrev,
      p_settle: { profitKrw: plan.profitKrw, shares: plan.shares, snapshot, readAt, memo: body.memo },
      p_outs: plan.outs.map((o, i) => ({
        who: o.who,
        fromAcc: o.fromAcc,
        amountKrw: o.amountKrw,
        reflect: body.reflect,
        pend: reflectOn ? firstPend(effects[i]!) : {},
      })),
      p_by: req.adminEmail!,
    });
    if (error) throw settleRpcError(error, "정산 확정에 실패했습니다.");
    const { settleId, rowIds } = confirmResult(data, plan.outs.length);

    let pend: SettlementPend = {};
    if (reflectOn) {
      const left = await reflectRows(
        req,
        read,
        rowIds.map((id, i) => ({ id, effect: effects[i]! })),
      );
      await recordPend(
        req,
        rowIds.map((id) => ({ id, pend: left.get(id) ?? {} })),
      );
      pend = sumPends(left.values());
    }
    audit(req, "settlement-confirm", body.pool, { settleId, outs: plan.outs.length, reflect: body.reflect });
    const out: SettlementWriteResponse = {
      ok: true,
      id: settleId,
      pend,
      ...(pendAccKeys(pend).length > 0 ? { message: pendMessage(pend) } : {}),
    };
    res.json(out);
  } catch (e) {
    next(e);
  }
});

/** 취소 RPC 반환 `{rows}` — 취소 전 바로 출금 줄(17키). 모양이 어긋나면 계약 위반(DB_ERROR). */
function cancelRows(data: unknown): SettlementLedgerRow[] {
  const rows = (data as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows) || !rows.every((r) => typeof (r as { id?: unknown } | null)?.id === "number")) {
    throw DbError("정산 취소에 실패했습니다.", new Error("settlement_settle_cancel shape"));
  }
  return rows as SettlementLedgerRow[];
}

/**
 * POST /settlement/settles/:id/cancel — 정산 취소(D-17 · D-21 · D-23 · D-30). 바디 `{ reflect }`.
 * 그 묶음 가장 최근 정산만(RPC 가 `NOT_LATEST` 로 다시 본다) · 바로 출금 줄은 RPC 가 함께 지운다.
 * 반영 켬이면 그 줄들이 예수금에 넣어 둔 증감(`revertOf` — 지우기와 같은 목표값 대조 · CR-01)을 되돌린다:
 * 되돌릴 수 없다는 것을 미리 알 수 있으면(못 읽음 · 대응 · 등록 서버 없음 · 1원 미만) 취소 전에 409 `REVERT_UNREADABLE`
 * (취소 RPC 0 · relay 쓰기 0) · **RPC 가 성공했을 때만** 합쳐 한 번 보내기 · 보내기만 실패한 계좌는 지운 줄 pend 에 남기고
 * `unreverted` · `message`(화면은 확인 창을 닫지 않고 그 문장을 보인다).
 */
adminSettlementRouter.post("/settlement/settles/:id/cancel", async (req, res, next) => {
  try {
    const { id } = parseSettlement(settlementIdParam, req.params);
    const { reflect } = parseSettlement(SettlementCancelBodySchema, req.body ?? {});
    const supabase = req.app.locals.supabase as SupabaseClient;

    let read: SettlementRead | null = null;
    // 감사 대상 = 묶음(반영 끔은 정산을 읽지 않아 모른다 → "settle").
    let pool: string = "settle";
    if (reflect) {
      read = await readSettlement(req);
      const settle = read.raw.settles.find((s) => s.id === id);
      if (!settle) throw NoSuchSettle();
      pool = settle.pool;
      // 읽은 값으로 먼저 본다 — 더 최근 정산이 있으면 못 읽음 안내보다 「차례로 취소」 가 맞는 문장이다(RPC 가 다시 본다).
      if (read.raw.settles.some((s) => s.pool === settle.pool && s.id > id)) throw NotLatest();
      const revert = revertOf(
        read,
        read.raw.ledger.filter((r) => r.settleId === id),
      );
      if (accountsOf(revert).length > 0) assertRevertable(read, revert, "취소해요");
    }

    const { data, error } = await supabase.rpc("settlement_settle_cancel", { p_id: id, p_by: req.adminEmail! });
    if (error) throw settleRpcError(error, "정산 취소에 실패했습니다.");
    const rows = cancelRows(data);

    let pend: SettlementPend = {};
    if (read !== null) {
      const at = read;
      const items = rows
        .map((r) => ({ id: r.id, effect: revertOf(at, [r]) }))
        .filter((it) => accountsOf(it.effect).length > 0);
      if (items.length > 0) {
        const left = await reflectRows(req, read, items);
        const leftRows = items
          .map((it) => ({ id: it.id, pend: left.get(it.id) ?? {} }))
          .filter((p) => pendAccKeys(p.pend).length > 0);
        if (leftRows.length > 0) await recordPend(req, leftRows);
        pend = sumPends(left.values());
      }
    }
    const unreverted = pendAccKeys(pend);
    audit(req, "settlement-cancel", pool, { settleId: id, reflect, unreverted });
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
