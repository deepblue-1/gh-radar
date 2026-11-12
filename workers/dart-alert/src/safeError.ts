import { isAxiosError } from "axios";
import { classifyDartStatus, DartApiError } from "./dart/client";
import type { SendResult } from "./telegram/client";

/**
 * Phase 43-01 — 로그에 남겨도 되는 오류 필드(kis-news-sync `safeErrorFields` 꼴).
 *
 * 무로그 실패 금지: 모든 catch 는 사유를 이 함수로 줄여 남긴다. 상태 · 코드 · 짧은 문구 · 종류 넷뿐이고,
 * axios 요청 설정(config — DART 키가 든 쿼리 인자 · 봇 토큰이 박힌 URL) · request 는 보지 않는다.
 * 텔레그램은 오류를 던지지 않고 분류 결과를 돌려주므로 그 결과를 `telegramSafeFields` 로 줄인다(43-04).
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
 * - axios 오류 → 응답 본문의 `status` · `message` 만(200자 — OpenDART 꼴. 텔레그램 꼴 `error_code` · `description` 은
 *   뒷순위) · 종류는 본문 status 가 있으면 상태 표로, 없으면 응답 없음 · 5xx 는 transient. URL · 요청 설정은 안 본다
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
    const dartStatus = str(body?.status);
    const code = dartStatus ?? str(body?.error_code) ?? str(err.code);
    const message = str(body?.message) ?? str(body?.description) ?? (status === 0 ? "no response" : null);
    let kind: string = status === 0 || status >= 500 ? "transient" : "unknown";
    if (dartStatus && status > 0 && status < 500) {
      const cls = classifyDartStatus(dartStatus);
      kind = cls === "ok" || cls === "empty" ? "unknown" : cls;
    }
    return { status, code, message, kind };
  }
  const message = err instanceof Error ? str(err.message) : str(err);
  return { status: null, code: null, message, kind: "unknown" };
}


export interface TelegramSafeFields {
  kind: SendResult["kind"];
  code: number | null;
  description: string | null;
}

/**
 * 텔레그램 분류 결과 → 로그 필드(kind · code · description). 토큰 · URL 은 결과에 애초에 없다.
 * migrated 의 새 방 id 는 끝 4자리만(리서치 확인 7 — 비밀을 고치라는 error 로그용).
 */
export function telegramSafeFields(r: SendResult): TelegramSafeFields {
  switch (r.kind) {
    case "ok":
      return { kind: "ok", code: null, description: null };
    case "rate":
      return { kind: "rate", code: 429, description: `retry after ${r.retryAfterS}s` };
    case "migrated":
      return { kind: "migrated", code: 400, description: `chat migrated to …${r.to.slice(-4)}` };
    default:
      return { kind: r.kind, code: r.code, description: str(r.description) };
  }
}
