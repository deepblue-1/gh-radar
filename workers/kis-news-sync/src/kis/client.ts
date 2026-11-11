import axios, { isAxiosError, type AxiosInstance } from "axios";

/**
 * Phase 41-13 — 한투(KIS) REST 클라이언트 · 오류 분류 · 안전 로그 필드.
 *
 * - D-01 · SC-5: 한투 오류는 HTTP 상태가 아니라 본문 `msg_cd` 로 가른다(41-RESEARCH 오류 코드 표 —
 *   상태값은 미확인). 아는 코드가 없을 때만 상태(0 · 5xx · 429)로 본다.
 * - 로그 · 오류 객체에 axios 요청 설정(`config` — 인증 헤더 · 토큰 발급 본문의 앱키 · 시크릿을 품는다)을
 *   싣지 않는다. 실패 로그는 반드시 `safeErrorFields(err)` 의 네 필드(상태 · msg_cd · msg1 · 종류)만 쓴다.
 *   `KisApiError` 는 원래 axios 오류를 `cause` 로 붙이지 않는다 — 붙이면 로거가 config 를 따라 내려간다.
 */

export const KIS_NEWS_TITLE_PATH = "/uapi/domestic-stock/v1/quotations/news-title";
/** 「종합 시황/공시 제목」 */
export const KIS_NEWS_TITLE_TR_ID = "FHKST01011800";
/** 접근 토큰 발급 — 발급마다 알림톡 · 1분 1회(Pitfall 1). 호출은 token.ts 만 */
export const KIS_TOKEN_PATH = "/oauth2/tokenP";

/**
 * rate_limit = 초당 거래건수 초과(EGW00201) · token_invalid = 토큰 무효/만료(EGW00121 · EGW00123) ·
 * token_rate = 토큰 발급 과다(EGW00133) · transient = 5xx · 네트워크 · unknown = 그 밖 모르는 코드
 */
export type KisErrorKind = "rate_limit" | "token_invalid" | "token_rate" | "transient" | "unknown";

/** 로그에 남겨도 되는 필드 — 이 넷뿐이다 */
export interface KisSafeErrorFields {
  status: number | null;
  msgCd: string | null;
  msg1: string | null;
  kind: KisErrorKind;
}

const KIND_BY_MSG_CD: Readonly<Record<string, KisErrorKind>> = {
  EGW00201: "rate_limit",
  EGW00121: "token_invalid",
  EGW00123: "token_invalid",
  EGW00133: "token_rate",
};

/** 로그 한 줄이 끝없이 길어지지 않게 — msg1 은 한투가 준 짧은 문구라 보통 이보다 짧다 */
const MSG1_MAX = 200;

export function classifyKisError(status: number, msgCd: string | null | undefined): KisErrorKind {
  const known = msgCd ? KIND_BY_MSG_CD[msgCd] : undefined;
  if (known) return known;
  if (status === 0 || status >= 500) return "transient";
  if (status === 429) return "rate_limit";
  return "unknown";
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, MSG1_MAX) : null;
}

export class KisApiError extends Error {
  readonly status: number;
  readonly msgCd: string | null;
  readonly msg1: string | null;
  readonly kind: KisErrorKind;

  constructor(status: number, msgCd: string | null | undefined, msg1: string | null | undefined) {
    const cd = str(msgCd);
    // message 에는 상태 · 코드만 — 헤더 · 토큰 · 요청 본문은 넣지 않는다
    super(`KIS API error status=${status} msg_cd=${cd ?? "-"}`);
    this.name = "KisApiError";
    this.status = status;
    this.msgCd = cd;
    this.msg1 = str(msg1);
    this.kind = classifyKisError(status, cd);
  }
}

/**
 * baseURL · timeout · JSON 헤더만 둔다. 인증 헤더(authorization · appkey · appsecret · tr_id)는
 * 호출마다 넘긴다 — 토큰이 실행 중 바뀔 수 있다.
 */
export function createKisHttp(baseUrl: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 10_000,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * 어떤 오류든 로그에 남겨도 되는 네 필드로 줄인다.
 * - KisApiError → 그대로
 * - axios 오류 → 응답 본문의 msg_cd · msg1(토큰 발급 오류는 error_code · error_description) · 상태 —
 *   응답이 없으면(네트워크 · 타임아웃) status 0 · transient. `config` · `request` 는 보지 않는다.
 * - 그 밖 → 메시지 문자열만(unknown)
 */
export function safeErrorFields(err: unknown): KisSafeErrorFields {
  if (err instanceof KisApiError) {
    return { status: err.status, msgCd: err.msgCd, msg1: err.msg1, kind: err.kind };
  }
  if (isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const data = err.response?.data as Record<string, unknown> | undefined;
    const body = data && typeof data === "object" ? data : undefined;
    const msgCd = str(body?.msg_cd) ?? str(body?.error_code);
    const msg1 = str(body?.msg1) ?? str(body?.error_description) ?? str(err.code) ?? str(err.message);
    return { status, msgCd, msg1, kind: classifyKisError(status, msgCd) };
  }
  const msg1 = err instanceof Error ? str(err.message) : str(err);
  return { status: null, msgCd: null, msg1, kind: "unknown" };
}
