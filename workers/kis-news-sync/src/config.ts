// RED 스텁 — 41-06 Task 2 GREEN 에서 채운다.
export type KisNewsMode = "auto" | "fast" | "slow" | "probe";

export interface KisNewsConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  kisAppKey: string;
  kisAppSecret: string;
  kisBaseUrl: string;
  maxRps: number;
  dailyBudget: number;
  mode: KisNewsMode;
  targetCap: number;
  logLevel: string;
  appVersion: string;
}

export function loadConfig(): KisNewsConfig {
  throw new Error("not implemented");
}
