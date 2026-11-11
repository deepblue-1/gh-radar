import type { SupabaseClient } from "@supabase/supabase-js";

// RED 스텁 — 41-08 Task 1 GREEN 에서 구현한다.
export const KIS_USAGE_SERVICE = "";
export const KIS_QUOTA_STRIKE_SERVICE = "";
export const BUDGET_WARN_RATIO = 0;
export type BudgetState = "ok" | "warn" | "exhausted";
export function kstDateString(_now: Date = new Date()): string {
  return "";
}
export async function checkBudget(_s: SupabaseClient, _d: string, _service = ""): Promise<number> {
  return -1;
}
export async function incrementUsage(_s: SupabaseClient, _d: string, _amount = 1, _service = ""): Promise<number> {
  return -1;
}
export async function readQuotaStrikes(_s: SupabaseClient, _d: string): Promise<number> {
  return -1;
}
export async function recordQuotaStrike(_s: SupabaseClient, _d: string): Promise<number> {
  return -1;
}
export function budgetStateOf(_used: number, _budget: number): BudgetState {
  return "ok";
}
export class UsageCounter {
  get pending(): number {
    return -1;
  }
  add(_n = 1): void {}
  async flush(_s: SupabaseClient, _d: string): Promise<number | null> {
    return -1;
  }
}
