import type { Request } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSettlementAccounts,
  type SettlementAccountView,
  type SettlementRaw,
  type SettlementRawRead,
} from "@gh-radar/shared";

import { DbError, fetchAccountCosts } from "../routes/admin.js";

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
