/**
 * API 클라이언트 — Phase 2 Cloud Run 서버와의 얇은 fetch wrapper.
 *
 * 규약:
 * - Base URL: `process.env.NEXT_PUBLIC_API_BASE_URL` (Phase 2 D-17 공개 API)
 * - 미설정 시 개발용 `http://localhost:8080` 으로 fallback + `console.warn`
 * - 에러 응답: Phase 2 envelope `{error:{code,message}}` 파싱 → `ApiClientError`
 * - `X-Request-Id` 응답 헤더 캡처 (Phase 2 D-22 추적용)
 * - `AbortController` 기반 8초 기본 타임아웃
 * - 기본 `cache: 'no-store'` — 호출부에서 `next: { revalidate }` 로 override 가능
 */

import type { ApiErrorBody } from '@gh-radar/shared';

const DEV_FALLBACK_BASE_URL = 'http://localhost:8080';
const DEFAULT_TIMEOUT_MS = 8_000;

let warnedMissingBaseUrl = false;

export function resolveBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (raw && raw.length > 0) return raw;

  if (!warnedMissingBaseUrl) {
    warnedMissingBaseUrl = true;
    console.warn(
      `[gh-radar] NEXT_PUBLIC_API_BASE_URL 미설정 — 개발용 ${DEV_FALLBACK_BASE_URL} 로 fallback. Vercel/로컬 .env.local 에 Cloud Run URL 을 설정하세요.`,
    );
  }
  return DEV_FALLBACK_BASE_URL;
}

export interface ApiClientErrorOptions {
  code: string;
  message: string;
  status: number;
  requestId?: string;
  cause?: unknown;
  /**
   * 서버 envelope 의 부가 필드. 본 Phase 에서는 429 응답의 `retry_after_seconds` 를
   * `{ retry_after_seconds: number }` 로 보존하는 용도로 사용.
   */
  details?: unknown;
}

/**
 * API 호출 실패를 표현하는 통합 에러.
 * - `code`: Phase 2 envelope 의 `error.code` 또는 내부 합성 코드
 *   (`TIMEOUT` / `NETWORK_ERROR` / `HTTP_<status>`)
 * - `status`: HTTP status. 네트워크/타임아웃인 경우 0
 * - `requestId`: 서버가 `X-Request-Id` 헤더에 실어 보낸 요청 ID (있을 때만)
 * - `details`: envelope 의 non-standard 필드 (e.g. `retry_after_seconds`) 보존용
 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor({ code, message, status, requestId, cause, details }: ApiClientErrorOptions) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

export interface ApiFetchInit extends Omit<RequestInit, 'signal'> {
  /** 요청 타임아웃 (ms). 기본 8000. 0 이하이면 타임아웃 비활성. */
  timeoutMs?: number;
  /** 외부 abort 신호 — 제공 시 자체 타임아웃 컨트롤러와 함께 연결된다. */
  signal?: AbortSignal;
}

/**
 * Phase 2 envelope 기반 JSON fetch. 성공 시 `T` 를 반환하고, 비정상 응답 시 `ApiClientError` 를 throw 한다.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, headers, ...rest } = init;

  const base = resolveBaseUrl();
  let url: string;
  try {
    url = new URL(path, base).toString();
  } catch (cause) {
    throw new ApiClientError({
      code: 'INVALID_BASE_URL',
      message: `API base URL 이 올바르지 않습니다 (값: "${base}")`,
      status: 0,
      cause,
    });
  }

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timeoutId =
    timeoutMs > 0
      ? setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs)
      : null;

  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      ...rest,
      headers: {
        accept: 'application/json',
        ...(headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (cause) {
    if (controller.signal.aborted && (cause as Error)?.name !== 'AbortError') {
      // external abort — caller 가 처리하도록 그대로 전파
      throw cause;
    }
    const isTimeout =
      (cause as Error)?.name === 'TimeoutError' ||
      (cause as Error)?.name === 'AbortError';
    throw new ApiClientError({
      code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isTimeout ? '요청이 시간 초과되었습니다' : '네트워크 요청에 실패했습니다',
      status: 0,
      cause,
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }

  const requestId = response.headers.get('x-request-id') ?? undefined;

  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    let message = response.statusText || '요청이 실패했습니다';
    let details: unknown = undefined;
    try {
      const body = (await response.json()) as
        | (Partial<ApiErrorBody> & { retry_after_seconds?: number })
        | undefined;
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
      if (typeof body?.retry_after_seconds === 'number') {
        // 429 envelope 의 retry_after_seconds 를 details 에 보존 — UI 카운트다운에 사용.
        details = { retry_after_seconds: body.retry_after_seconds };
      }
    } catch {
      // envelope 파싱 실패 — 기본 코드/메시지 유지
    }
    throw new ApiClientError({ code, message, status: response.status, requestId, details });
  }

  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      message: '응답 JSON 파싱에 실패했습니다',
      status: response.status,
      requestId,
      cause,
    });
  }
}
