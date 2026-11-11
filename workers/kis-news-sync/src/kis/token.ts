import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";

// RED 스텁(41-13 Task 2) — GREEN 커밋에서 실제 구현으로 바뀐다.
export const KIS_TOKEN_TYPE = "";
export const TOKEN_REUSE_MIN_MS = 0;
export const TOKEN_ISSUE_GAP_MS = 0;

export interface KisTokenLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface GetKisAccessTokenArgs {
  supabase: SupabaseClient;
  http: Pick<AxiosInstance, "post">;
  appkey: string;
  appsecret: string;
  canIssue: boolean;
  force?: boolean;
  now: number;
  log: KisTokenLog;
}

export interface KisAccessToken {
  token: string;
  expiresAt: Date;
  issued: boolean;
}

export function parseKisExpiry(_s: unknown): Date | null {
  return new Date(0);
}

export async function getKisAccessToken(_args: GetKisAccessTokenArgs): Promise<KisAccessToken> {
  throw new Error("not implemented");
}
