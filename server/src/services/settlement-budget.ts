import type { Request } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SETTLEMENT_ACC_KEYS,
  SETTLEMENT_ACCOUNTS,
  addEffects,
  buildSettlementAccounts,
  nowBudgetsOfReads,
  pendAccKeys,
  reconcilePend,
  type DmaBroker,
  type SettlementAccKey,
  type SettlementAccountView,
  type SettlementEffect,
  type SettlementNowBudgets,
  type SettlementPend,
  type SettlementPendEntry,
  type SettlementPendReason,
  type SettlementRaw,
  type SettlementRawRead,
} from "@gh-radar/shared";

import { ApiError } from "../errors.js";
import { DbError, audit, fetchAccountCosts } from "../routes/admin.js";
import { fanoutAudit, fanoutOne } from "../routes/admin-accounts.js";
import type { RelayAdminClient } from "./relay-admin-client.js";

/**
 * Phase 44 — 정산 조회의 읽기 한 벌(44-RESEARCH Pattern 1). 화면 조회 · 뒤 플랜의 쓰기 직전 읽기가 같이 쓴다.
 *
 * - DB 왕복 1(RPC `admin_settlement_raw` — 계좌 대응 · 연결 · 레지스트리 · 마지막 읽은 값 · 거래 · 정산) ∥ relay 예수금 읽기.
 * - 예수금 판정은 shared `buildSettlementAccounts`(→ `settlementBudgetOf` — 어드민 계좌 메뉴와 같은 규칙 · D-03).
 * - relay 실패 · 모양 위반은 `fetchAccountCosts` 가 null 로 접는다 → 계좌는 DB 의 마지막 읽은 값(stale · D-04).
 * - RPC 오류 · 모양 위반은 `DB_ERROR` — 빈 목록으로 감추지 않는다(0원 정산 같은 오판을 막는다).
 */

export interface SettlementRead {
  raw: SettlementRaw;
  accounts: SettlementAccountView[];
  /** 이번에 relay 로 읽은 값 — 라우트가 `settlement_record_reads` 로 남긴다. */
  reads: SettlementRawRead[];
  nowIso: string;
}

const RAW_KEYS = ["accounts", "registry", "reads", "ledger", "settles"] as const;

function isSettlementRaw(v: unknown): v is SettlementRaw {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return RAW_KEYS.every((k) => Array.isArray(o[k]));
}

export async function readSettlement(req: Request): Promise<SettlementRead> {
  const supabase = req.app.locals.supabase as SupabaseClient;
  const [rpc, costs] = await Promise.all([supabase.rpc("admin_settlement_raw"), fetchAccountCosts(req)]);
  if (rpc.error) throw DbError("정산 조회에 실패했습니다.", rpc.error);
  if (!isSettlementRaw(rpc.data)) throw DbError("정산 조회에 실패했습니다.", new Error("admin_settlement_raw shape"));
  const raw = rpc.data;
  const nowIso = new Date().toISOString();
  const { accounts, reads } = buildSettlementAccounts(raw, costs, nowIso);
  return { raw, accounts, reads, nowIso };
}

// ─────────────────────────────────────────────────────────────────────────────
// 예수금 반영(44-RESEARCH Pattern 2 · D-10 · D-26 · D-30) — 거래 저장 · 고치기 · 지우기 · 정산 확정 · 취소 · 다시 반영 공용
//
// op 6 은 「값 설정」 뿐이라 증감을 「이번 요청에서 읽은 값 + 증감 → 그 절댓값 보내기」 로 흉내 낸다. 틈은 여기 한 곳에서 막는다:
//   Pitfall 1  새 값 1원 미만 → 보내지 않음(below_one) — op 6 의 0 은 「해제」 다.
//   Pitfall 2  timeout 은 「모름」 — pend 에 목표값(targetKrw)을 남기고, 지금 값 = 목표값이면 들어간 것으로 본다(shared
//              `reconcilePend`). 다시 반영 · 고치기 · 지우기 · 정산 취소 넷 다 이 대조를 거친다(CR-01).
//   Pitfall 3  계좌 옮김 두 계좌는 병렬로 보낸다.
//   Pitfall 8  결과 0건(빈 fan-out)은 반영됨이 아니다 — `results.length > 0` 을 함께 본다.
// 대상 사용자는 정산 RPC(`admin_settlement_raw`)가 준 링크에서 고른다 — 계좌 메뉴의 대상 조회를 계좌마다 다시 부르지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

/** 감사 줄 · relay 오류 로그의 작업 이름. */
export const SETTLEMENT_FANOUT_OP = "settlement-budget";

/** 보내기 전에 알 수 있는 「보내지 않음」 사유. */
export type ReflectBlock = Extract<SettlementPendReason, "unreachable" | "below_one" | "no_server">;

export interface ReflectPlanItem {
  accKey: SettlementAccKey;
  deltaKrw: number;
  /** 이번 요청에서 relay 로 읽은 값(0 포함) · 못 읽었으면 null. */
  nowKrw: number | null;
  /** 보낼 값(지금 + 증감) · 보내지 않는 계좌는 null. */
  targetKrw: number | null;
  block: ReflectBlock | null;
  /** 그 계좌에 active 등록 서버가 있는 연결 사용자(DMA id 오름차순 — RPC 순서). */
  users: string[];
  broker: DmaBroker;
  accountNo: string;
}

function accLabel(acc: SettlementAccKey): string {
  return SETTLEMENT_ACCOUNTS.find((a) => a.key === acc)?.label ?? acc;
}

/** 계좌 라벨을 화면 순서로 「 · 」 이음. */
function accLabels(accs: readonly SettlementAccKey[]): string {
  return SETTLEMENT_ACC_KEYS.filter((k) => accs.includes(k)).map(accLabel).join(" · ");
}

/**
 * 계좌별 증감 → 보낼 계획. 0 이 아닌 증감 계좌마다(화면 순서):
 * 계좌 대응 없음 · active 등록 서버가 있는 사용자 0 → `no_server` / 이번 요청에서 읽은 값 없음 → `unreachable` /
 * 지금 + 증감 < 1 → `below_one` / 그 밖은 보낼 값(target).
 * 「지금 값」 은 `read.reads`(이번에 relay 로 읽은 값 · 0 포함)만 쓴다 — DB 의 마지막 값(stale)으로 계산하지 않는다.
 * 서버 없음을 못 읽음보다 먼저 본다 — active 서버가 없으면 읽은 값도 없어서, 순서를 바꾸면 늘 `unreachable` 로 보인다.
 */
export function planReflect(read: SettlementRead, deltas: SettlementEffect): ReflectPlanItem[] {
  const items: ReflectPlanItem[] = [];
  for (const def of SETTLEMENT_ACCOUNTS) {
    const accKey = def.key;
    const deltaKrw = deltas[accKey] ?? 0;
    if (deltaKrw === 0) continue;
    const raw = read.raw.accounts.find((a) => a.accKey === accKey);
    const users = raw
      ? raw.links.filter((l) => l.servers.some((s) => s.state === "active")).map((l) => l.dmaUserId)
      : [];
    const nowKrw = read.reads.find((r) => r.accKey === accKey)?.budgetKrw ?? null;
    const base = { accKey, deltaKrw, nowKrw, users, broker: raw?.broker ?? def.broker, accountNo: raw?.accountNo ?? "" };
    if (!raw || users.length === 0) {
      items.push({ ...base, targetKrw: null, block: "no_server" });
    } else if (nowKrw === null) {
      items.push({ ...base, targetKrw: null, block: "unreachable" });
    } else if (nowKrw + deltaKrw < 1) {
      items.push({ ...base, targetKrw: null, block: "below_one" });
    } else {
      items.push({ ...base, targetKrw: nowKrw + deltaKrw, block: null });
    }
  }
  return items;
}

/**
 * 저장 RPC 에 함께 싣는 「보낼 모든 계좌」 pend(D-26 저장 순서 ③) — 보내기 전에 server 가 죽어도 다시 반영이 목표값 대조로
 * 두 번 더하지 않게 목표값을 먼저 남긴다. 보내기 뒤 `settlement_set_pend` 가 남은 것만으로 덮는다.
 */
export function planPend(plan: readonly ReflectPlanItem[]): SettlementPend {
  const pend: SettlementPend = {};
  for (const it of plan) pend[it.accKey] = { deltaKrw: it.deltaKrw, targetKrw: it.targetKrw, reason: it.block ?? "failed" };
  return pend;
}

/**
 * 계획을 보낸다 — block 없는 계좌를 **병렬**로(Pitfall 3), 계좌마다 사용자별 op 6(`fanoutOne` — 거부 · 실패 · 클라이언트 없음은
 * 항목 error 로 접힌다). 「반영됨」 = 사용자 1명 이상 · 모든 항목 error 없음 · 결과 1건 이상 · 모든 outcome ok(한 대라도 실패면
 * 미반영 · Pitfall 8). 남은 계좌만 pend 로 돌려준다 — 결과에 timeout 이 하나라도 있으면 `timeout`, 아니면 `failed`.
 * 감사 줄은 계좌마다 1줄(증권사 · 계좌 키 · 목표값 · 팬아웃 요약 — 계좌번호 없음).
 */
export async function sendReflect(req: Request, plan: readonly ReflectPlanItem[]): Promise<SettlementPend> {
  const relay = req.app.locals.relayAdmin as RelayAdminClient | undefined;
  const settled = await Promise.all(
    plan.map(async (it): Promise<[SettlementAccKey, SettlementPendEntry | null]> => {
      if (it.block !== null || it.targetKrw === null) {
        audit(req, SETTLEMENT_FANOUT_OP, it.broker, { accKey: it.accKey, block: it.block, users: it.users.length });
        return [it.accKey, { deltaKrw: it.deltaKrw, targetKrw: null, reason: it.block ?? "no_server" }];
      }
      const budgetKrw = it.targetKrw;
      const fanout = await Promise.all(
        it.users.map((dma) =>
          fanoutOne(relay, dma, SETTLEMENT_FANOUT_OP, (r) =>
            r.setAccountBudget(dma, it.broker, it.accountNo, { budgetKrw }, req.adminEmail!),
          ),
        ),
      );
      audit(req, SETTLEMENT_FANOUT_OP, it.broker, {
        accKey: it.accKey,
        budgetKrw,
        users: it.users.length,
        fanout: fanoutAudit(fanout),
      });
      const ok =
        fanout.length > 0 &&
        fanout.every((f) => f.error === null && f.results.length > 0 && f.results.every((x) => x.outcome === "ok"));
      if (ok) return [it.accKey, null];
      const timeout = fanout.some((f) => f.results.some((x) => x.outcome === "timeout"));
      return [it.accKey, { deltaKrw: it.deltaKrw, targetKrw: budgetKrw, reason: timeout ? "timeout" : "failed" }];
    }),
  );
  const pend: SettlementPend = {};
  for (const [acc, entry] of settled) if (entry) pend[acc] = entry;
  return pend;
}

/** 증감 한 벌 → 계획 + 보내기. 남은 계좌 pend. */
export async function reflectDeltas(req: Request, read: SettlementRead, deltas: SettlementEffect): Promise<SettlementPend> {
  return sendReflect(req, planReflect(read, deltas));
}

/** 계좌별로 합친 pend → 줄별 pend — 그 계좌에 증감이 있는 줄마다 `{ deltaKrw: 그 줄 자기 증감, targetKrw: 합친 목표값, reason }`. */
function splitPend(rows: readonly { id: number; effect: SettlementEffect }[], merged: SettlementPend): Map<number, SettlementPend> {
  const out = new Map<number, SettlementPend>();
  for (const r of rows) {
    const p: SettlementPend = {};
    for (const acc of pendAccKeys(merged)) {
      const d = r.effect[acc] ?? 0;
      const e = merged[acc]!;
      if (d !== 0) p[acc] = { deltaKrw: d, targetKrw: e.targetKrw, reason: e.reason };
    }
    out.set(r.id, p);
  }
  return out;
}

/**
 * 여러 줄(정산 바로 출금 · 취소 되돌림 — 44-08)을 계좌별로 합쳐(`addEffects`) 한 번만 보내고, 남은 계좌는 그 계좌에 증감이 있는
 * 줄마다 `{ deltaKrw: 그 줄 자기 증감, targetKrw: 합친 목표값, reason }` 으로 나눠 준다.
 * `beforeSend` 가 있으면 보내기 **전에** 「보낼 모든 계좌」 줄별 pend(목표값 포함 · reason failed)를 넘긴다 — 정산 취소가 그것을
 * 지운 줄에 먼저 남겨, 보내는 동안 server 가 죽어도 되돌릴 증감의 흔적이 남게 한다(IN-01 · 저장 경로의 D-26 ③ 과 같은 뜻).
 */
export async function reflectRows(
  req: Request,
  read: SettlementRead,
  rows: readonly { id: number; effect: SettlementEffect }[],
  opts: { beforeSend?: (planned: Map<number, SettlementPend>) => Promise<void> } = {},
): Promise<Map<number, SettlementPend>> {
  const plan = planReflect(read, addEffects(rows.map((r) => r.effect)));
  if (opts.beforeSend) await opts.beforeSend(splitPend(rows, planPend(plan)));
  return splitPend(rows, await sendReflect(req, plan));
}

/** 이번 요청에서 읽은 지금 값 — 목표값 대조(shared `reconcilePend` · `appliedEffectAt`)의 입력. */
export function nowOf(read: SettlementRead): SettlementNowBudgets {
  return nowBudgetsOfReads(read.reads);
}

/**
 * 다시 반영(D-26) — 못 보낸 계좌만. 목표값 대조(shared `reconcilePend` — 고치기 · 지우기 · 정산 취소와 같은 판정)로
 * 지금 값 = 기록된 목표값인 계좌는 앞 시도가 실제로 들어간 것이라 보내지 않고 반영됨으로 정리한다(Pitfall 2 — 두 번 더하지 않음).
 * 보냈지만 지금 못 읽어 들어갔는지 모르는 계좌는 보내지도 않고 원래 항목(목표값 포함)을 그대로 남긴다 — 목표값을 지우면 다음
 * 대조의 근거가 사라진다. 나머지는 `deltaKrw` 를 증감으로 다시 계획 · 보내기.
 */
export async function retryPend(req: Request, read: SettlementRead, pend: SettlementPend): Promise<SettlementPend> {
  const { pend: left, unknown } = reconcilePend(pend, nowOf(read));
  const deltas: SettlementEffect = {};
  for (const acc of pendAccKeys(left)) {
    const e = left[acc]!;
    if (!unknown.includes(acc) && e.deltaKrw !== 0) deltas[acc] = e.deltaKrw;
  }
  const out = await reflectDeltas(req, read, deltas);
  for (const acc of unknown) out[acc] = left[acc]!;
  return out;
}

/**
 * 거래 고치기(반영 켬) 전에 — 보냈지만 지금 못 읽어 들어갔는지 모르는 계좌가 있으면 409 `REFLECT_UNKNOWN`(아무것도 바꾸지 않음).
 * 그대로 고치면 옛 증감을 「안 들어감」 으로 보고 새 값을 통째로 다시 보내거나(두 번 들어감), 새 pend 가 목표값 기록을 덮어 다음
 * 대조의 근거가 사라진다(CR-01).
 */
export function assertReconcilable(read: SettlementRead, pend: SettlementPend): void {
  const { unknown } = reconcilePend(pend, nowOf(read));
  if (unknown.length === 0) return;
  throw new ApiError(
    409,
    "REFLECT_UNKNOWN",
    `${accLabels(unknown)} 예수금을 읽지 못해 앞서 보낸 반영이 들어갔는지 알 수 없어요 — 예수금이 읽힌 뒤 다시 저장해 주세요`,
  );
}

/**
 * D-30 「미리 막고 안내」 — 지우기 · 정산 취소의 되돌림이 막힐 것을 미리 알 수 있으면(못 읽음 · 계좌 대응 · 등록 서버 없음 ·
 * 1원 미만) 아무것도 바꾸기 전에 409 `REVERT_UNREADABLE`. 못 읽음 · 서버 없음이 하나라도 있으면 그 계좌들로 「읽지 못해」 문장,
 * 전부 1원 미만이면 「0 이하가 되어」 문장. 막히지 않으면 계획을 돌려준다(이어서 `sendReflect`).
 */
export function assertRevertable(
  read: SettlementRead,
  deltas: SettlementEffect,
  verb: "지워요" | "취소해요",
): ReflectPlanItem[] {
  const plan = planReflect(read, deltas);
  const blocked = plan.filter((it) => it.block !== null);
  if (blocked.length === 0) return plan;
  const unreadable = blocked.filter((it) => it.block !== "below_one").map((it) => it.accKey);
  const message =
    unreadable.length > 0
      ? `${accLabels(unreadable)} 예수금을 읽지 못해 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 ${verb}`
      : `${accLabels(blocked.map((it) => it.accKey))} 예수금이 0 이하가 되어 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 ${verb}`;
  throw new ApiError(409, "REVERT_UNREADABLE", message);
}

/** 지운 · 취소한 뒤 보내기만 실패한 계좌의 문장(D-30) — 거래 지우기 · 정산 취소(44-08)가 같이 쓴다. */
export function unrevertedMessage(accKeys: readonly SettlementAccKey[]): string {
  return `${accLabels(accKeys)} 예수금은 되돌리지 못했어요 — 계좌 메뉴에서 맞춰 주세요`;
}

/** 남은 pend 의 화면 문장(UI-SPEC 문구 정본) — 사유별 한 문장씩(못 보냄 → 1원 미만 순) · 문장끼리는 「 / 」. */
export function pendMessage(pend: SettlementPend): string {
  const keys = pendAccKeys(pend);
  const below = keys.filter((k) => pend[k]!.reason === "below_one");
  const other = keys.filter((k) => pend[k]!.reason !== "below_one");
  const parts: string[] = [];
  if (other.length > 0) parts.push(`${accLabels(other)} 미반영 — 매매 서버에 보내지 못했어요`);
  if (below.length > 0) parts.push(`${accLabels(below)} 미반영 — 예수금이 0 이하가 되어 보내지 않았어요`);
  return parts.join(" / ");
}
