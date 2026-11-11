import type { AxiosInstance } from "axios";

// RED 스텁(41-13 Task 1) — GREEN 커밋에서 실제 구현으로 바뀐다.
export const KIS_NEWS_TITLE_PATH = "";
export const KIS_NEWS_TITLE_TR_ID = "";
export const KIS_TOKEN_PATH = "";

export type KisErrorKind = "rate_limit" | "token_invalid" | "token_rate" | "transient" | "unknown";

export interface KisSafeErrorFields {
  status: number | null;
  msgCd: string | null;
  msg1: string | null;
  kind: KisErrorKind;
}

export function classifyKisError(_status: number, _msgCd: string | null | undefined): KisErrorKind {
  return "unknown";
}

export class KisApiError extends Error {
  readonly status: number = 0;
  readonly msgCd: string | null = null;
  readonly msg1: string | null = null;
  readonly kind: KisErrorKind = "unknown";
}

export function createKisHttp(_baseUrl: string): AxiosInstance {
  throw new Error("not implemented");
}

export function safeErrorFields(_err: unknown): KisSafeErrorFields {
  return { status: null, msgCd: null, msg1: null, kind: "unknown" };
}
