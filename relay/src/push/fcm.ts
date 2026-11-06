/**
 * Phase 40 (40-09) — Android 체결 푸시 송신기 (`FcmSender` · FCM HTTP v1).
 *
 * 40-06 `PushSender` 를 구현한다. 새 의존성 없이 전역 `fetch` 로 `POST https://fcm.googleapis.com/v1/projects/<id>/messages:send`
 * 를 부른다(로드맵 잠금). 액세스 토큰은 GCE **메타데이터 서버**(VM 기본 서비스계정)에서 받는다 — 키 파일 · 서비스계정 JSON 을
 * 두지 않는다(키가 새어 나갈 표면 0 · 회전 0). VM 은 `--scopes=cloud-platform`(setup-relay-iam.sh)이고 FCM 송신 역할은 같은
 * 스크립트가 붙인다. 이 조합이 실제로 통하는지(RESEARCH A2)는 기동 때 `probe()` 가 한 번 알려 준다.
 *
 * 근거(Firebase 문서 · RESEARCH §Code Examples 「FCM v1 송신」):
 *   - send/v1-api — 엔드포인트 · Compute Engine 은 기본 서비스계정 토큰(ADC)을 쓴다.
 *   - manage-tokens — `UNREGISTERED`(404) 는 토큰이 더는 유효하지 않다 → 기기 행 정리.
 *   - FCM v1 오류 형식 `{ error: { code, status, details: [{ "@type": "…FcmError", errorCode }] } }` — 분류는 `errorCode` 우선,
 *     없으면 `status`.
 *
 * 페이로드(D-17 · D-18 · D-21 · Pattern 7): `notification {title, body}` **필수** — data-only 메시지는 앱이 꺼져 있거나 포그라운드
 * 일 때 시스템 알림으로 뜨지 않는다. `android.notification {channel_id: fills, sound: default}` · `android.priority HIGH` ·
 * `android.ttl 3600s`(1시간 지난 체결 알림은 의미 없다) · `data.path`(탭 착지 · 값은 문자열만). `tag` 를 넣지 않는다 — 같은 종목
 * 알림이 서로 덮어쓰지 않게(D-18).
 *
 * 응답 분류(`classifyFcmResponse` — D-15 · SC-3):
 *   200                                   ok
 *   404 · UNREGISTERED · NOT_FOUND         token_removed(기기 행 정리)
 *   400 INVALID_ARGUMENT                   failed · **삭제 안 함**(페이로드 · 설정 문제일 수 있다 — RESEARCH Pitfall 5 동형)
 *   401                                   메타데이터 토큰을 버리고 다시 받아 1회 재시도
 *   403 PERMISSION_DENIED · SENDER_ID_MISMATCH failed + error 로그(역할 · API · 프로젝트 설정 오류)
 *   429 QUOTA_EXCEEDED                     failed + stopRun(공식 API 운영 기준 4 — 두드리지 않는다)
 *   5xx · 0(네트워크 · 5초 타임아웃 · 메타데이터 실패) 1회 재시도 후 failed
 *
 * 하지 않는 것:
 *   - 기기 토큰 · 액세스 토큰을 로그에 싣지 않는다(T-19-14) — 상태 코드 · 오류 코드만.
 *   - 서비스계정 키 파일을 읽지 않는다 · Firebase Admin SDK 를 쓰지 않는다.
 *   - 재시도를 두 번 이상 하지 않는다 · 429 를 재시도하지 않는다.
 */
import { PUSH_CHANNEL_ID } from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { PushSendMessage, PushSendResult, PushSender } from "./notifier.js";

/** GCE 메타데이터 서버 — VM 기본 서비스계정 액세스 토큰(`Metadata-Flavor: Google` 헤더 필수). */
export const FCM_METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
/** 요청 한 건 제한 시간(ms) — 메타데이터 · FCM 공통. */
export const FCM_TIMEOUT_MS = 5_000;
/** 액세스 토큰 만료 여유(ms) — 만료 60초 전부터는 새로 받는다. */
export const FCM_TOKEN_EARLY_MS = 60_000;
/** `android.ttl` — 1시간 지난 체결 알림은 버린다. */
export const FCM_TTL = "3600s";
/** `probe()` 가 쓰는 가짜 기기 토큰(실제 기기로 가지 않는다 — validate_only). */
const PROBE_TOKEN = "gh-radar-relay-probe-invalid-token";
/** reason 상한 — `dma_push_deliveries.reason` CHECK(200자). */
const REASON_MAX = 200;

/** FCM 송신 URL. */
export function fcmSendUrlOf(projectId: string): string {
  return `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
}

/** 분류 결과 — `retry` 가 있으면 송신기가 한 번 더 보낸다(종류마다 1회). */
export type FcmVerdict = PushSendResult & { retry?: "transient" | "auth" };

const REMOVED_CODES: ReadonlySet<string> = new Set(["UNREGISTERED", "NOT_FOUND"]);

/** FCM 응답 → 결과(위 머리 표). `errorStatus` = 응답 본문의 FcmError `errorCode`(없으면 `error.status`). `status` 0 = 네트워크. */
export function classifyFcmResponse(status: number, errorStatus?: string): FcmVerdict {
  const base = { httpStatus: status, ...(errorStatus !== undefined ? { reason: errorStatus } : {}) };
  if (status === 200) return { result: "ok", ...base };
  if (status === 404 || (errorStatus !== undefined && REMOVED_CODES.has(errorStatus))) return { result: "token_removed", ...base };
  if (status === 429 || errorStatus === "QUOTA_EXCEEDED") return { result: "failed", stopRun: true, ...base };
  if (status === 401) return { result: "failed", retry: "auth", ...base };
  if (status === 0 || status >= 500) return { result: "failed", retry: "transient", ...base };
  return { result: "failed", ...base };
}

/** FCM 오류 본문 → 오류 코드(FcmError `errorCode` 우선 · 없으면 `error.status`). 형식이 어긋나면 undefined. */
export function fcmErrorCodeOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const err = (body as { error?: unknown }).error;
  if (typeof err !== "object" || err === null) return undefined;
  const details = (err as { details?: unknown }).details;
  if (Array.isArray(details)) {
    for (const d of details) {
      const code = (d as { errorCode?: unknown } | null)?.errorCode;
      if (typeof code === "string" && code !== "") return code.slice(0, REASON_MAX);
    }
  }
  const s = (err as { status?: unknown }).status;
  return typeof s === "string" && s !== "" ? s.slice(0, REASON_MAX) : undefined;
}

/** 송신 본문(`message` 한 건). `validateOnly` 는 probe 전용. */
export function fcmBodyOf(token: string, msg: Pick<PushSendMessage, "title" | "body" | "path">, validateOnly = false): string {
  return JSON.stringify({
    ...(validateOnly ? { validate_only: true } : {}),
    message: {
      token,
      notification: { title: msg.title, body: msg.body },
      android: { priority: "HIGH", ttl: FCM_TTL, notification: { channel_id: PUSH_CHANNEL_ID, sound: "default" } },
      data: { path: String(msg.path) },
    },
  });
}

export type FcmSenderOptions = {
  projectId: string;
  /** fetch(테스트가 가짜를 넣는다). 기본 전역 `fetch`. */
  fetch?: typeof fetch;
  /** 시계(ms). 기본 `Date.now`. */
  now?: () => number;
  /** 요청 제한 시간(ms). 기본 `FCM_TIMEOUT_MS`. */
  timeoutMs?: number;
};

type RawResponse = { status: number; code?: string };

export class FcmSender implements PushSender {
  readonly platform = "android" as const;

  readonly #url: string;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #timeoutMs: number;
  #access: { token: string; exp: number } | null = null;

  constructor(o: FcmSenderOptions) {
    this.#url = fcmSendUrlOf(o.projectId);
    this.#fetch = o.fetch ?? ((input, init) => fetch(input, init));
    this.#now = o.now ?? Date.now;
    this.#timeoutMs = o.timeoutMs ?? FCM_TIMEOUT_MS;
  }

  async send(token: string, msg: PushSendMessage): Promise<PushSendResult> {
    const r = await this.#sendBody(fcmBodyOf(token, msg));
    if (r.result !== "ok") this.#logFailure(r);
    return r;
  }

  /**
   * 기동 권한 확인 — `validate_only: true` + 가짜 토큰으로 한 번. 기기로 아무것도 가지 않는다.
   * 403(·401)이면 역할 · API · 토큰 범위 문제라 error 로그, 400 · 404 면 권한은 통과(토큰만 가짜)라 info. 절대 throw 하지 않는다.
   */
  async probe(): Promise<void> {
    try {
      const r = await this.#sendBody(fcmBodyOf(PROBE_TOKEN, { title: "probe", body: "probe", path: "/" }, true));
      const fields = { status: r.httpStatus, reason: r.reason ?? "" };
      if (r.httpStatus === 403 || r.httpStatus === 401) {
        logger.error(fields, "[push] FCM 송신 권한 없음 — setup-relay-iam.sh(FCM 역할 · API) 확인");
      } else if (r.httpStatus === 400 || r.httpStatus === 404 || r.httpStatus === 200) {
        logger.info(fields, "[push] FCM 권한 확인");
      } else {
        logger.warn(fields, "[push] FCM 권한 확인 못 함 — 다음 송신에서 다시 드러난다");
      }
    } catch (err) {
      logger.warn({ error: err instanceof Error ? err.name : "unknown" }, "[push] FCM 권한 확인 예외 — 기동은 계속");
    }
  }

  close(): void {
    // 세션 없음(요청마다 fetch). 캐시만 비운다.
    this.#access = null;
  }

  async #sendBody(body: string): Promise<PushSendResult> {
    let authRetried = false;
    let transientRetried = false;
    for (;;) {
      const raw = await this.#post(body);
      const v = classifyFcmResponse(raw.status, raw.code);
      if (v.retry === "auth" && !authRetried) {
        authRetried = true;
        this.#access = null; // 다음 #accessToken() 이 메타데이터에서 새로 받는다.
        continue;
      }
      if (v.retry === "transient" && !transientRetried) {
        transientRetried = true;
        continue;
      }
      const { retry: _retry, ...result } = v;
      return result;
    }
  }

  /** 실패 로그 — 상태 코드 · 오류 코드만(토큰 없음). */
  #logFailure(r: PushSendResult): void {
    const fields = { status: r.httpStatus, reason: r.reason ?? "" };
    if (r.result === "token_removed") {
      logger.info(fields, "[push] FCM 토큰 만료 — 기기 정리");
    } else if (r.httpStatus === 403 || r.httpStatus === 401) {
      logger.error(fields, "[push] FCM 권한 · 설정 오류 — setup-relay-iam.sh(FCM 역할 · API) 확인");
    } else if (r.stopRun === true) {
      logger.warn(fields, "[push] FCM 한도 신호 — 이 묶음 Android 송신 중단");
    } else {
      logger.warn(fields, "[push] FCM 송신 실패");
    }
  }

  /** 메타데이터 토큰 — 만료 60초 전까지 재사용. 실패는 throw(호출자가 status 0 으로 본다). */
  async #accessToken(): Promise<string> {
    const now = this.#now();
    if (this.#access !== null && now < this.#access.exp - FCM_TOKEN_EARLY_MS) return this.#access.token;
    const res = await this.#fetch(FCM_METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!res.ok) throw new Error(`metadata ${res.status}`);
    const j = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof j.access_token !== "string" || typeof j.expires_in !== "number") throw new Error("metadata shape");
    this.#access = { token: j.access_token, exp: now + j.expires_in * 1000 };
    return this.#access.token;
  }

  async #post(body: string): Promise<RawResponse> {
    let access: string;
    try {
      access = await this.#accessToken();
    } catch {
      return { status: 0, code: "Metadata" };
    }
    let res: Response;
    try {
      res = await this.#fetch(this.#url, {
        method: "POST",
        headers: { authorization: `Bearer ${access}`, "content-type": "application/json; charset=utf-8" },
        body,
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      return { status: 0, code: name === "TimeoutError" || name === "AbortError" ? "Timeout" : "Network" };
    }
    if (res.status === 200) {
      // 본문(`name`)은 쓰지 않는다 — 연결을 놓아 주려고 소비만.
      await res.arrayBuffer().catch(() => undefined);
      return { status: 200 };
    }
    let code: string | undefined;
    try {
      code = fcmErrorCodeOf(await res.json());
    } catch {
      code = undefined;
    }
    return code !== undefined ? { status: res.status, code } : { status: res.status };
  }
}
