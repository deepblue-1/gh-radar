import { isAxiosError } from "axios";
import { DartApiError } from "./dart/client";

/**
 * Phase 43-01 — 로그에 남겨도 되는 오류 필드(kis-news-sync `safeErrorFields` 꼴).
 *
 * 무로그 실패 금지: 모든 catch 는 사유를 이 함수로 줄여 남긴다. 상태 · 코드 · 짧은 문구 · 종류 넷뿐이고,
 * axios 요청 설정(config — DART 키가 든 쿼리 인자 · 봇 토큰이 박힌 URL) · request 는 보지 않는다.
 * 텔레그램 전용 필드(`telegramSafeFields`)는 43-04 가 더한다.
 */
export interface SafeErrorFields {
  status: number | null;
  code: string | null;
  message: string | null;
  kind: string;
}

const TEXT_MAX = 200;

function str(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && v.length > 0 ? v.slice(0, TEXT_MAX) : null;
}

/**
 * - DartApiError → 상태 · 본문 status · OpenDART 문구 · 종류
 * - axios 오류 → 응답 본문의 `status` · `error_code` · `description` 만(200자) · 응답이 없으면 status 0 · transient
 * - 그 밖 → 메시지 문자열만(unknown)
 */
export function safeErrorFields(err: unknown): SafeErrorFields {
  if (err instanceof DartApiError) {
    return { status: err.httpStatus, code: err.code, message: err.description ?? err.message, kind: err.kind };
  }
  if (isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const data = err.response?.data as Record<string, unknown> | undefined;
    const body = data && typeof data === "object" ? data : undefined;
    const code = str(body?.status) ?? str(body?.error_code) ?? str(err.code);
    const message = str(body?.description) ?? (status === 0 ? "no response" : null);
    return { status, code, message, kind: status === 0 || status >= 500 ? "transient" : "unknown" };
  }
  const message = err instanceof Error ? str(err.message) : str(err);
  return { status: null, code: null, message, kind: "unknown" };
}
