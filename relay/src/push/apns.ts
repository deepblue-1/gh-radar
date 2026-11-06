/**
 * Phase 40 (40-09) — iOS 체결 푸시 송신기 (`ApnsSender` · APNs HTTP/2 직접).
 *
 * 40-06 `PushSender` 를 구현한다. 새 의존성 없이 `node:http2` 세션 1개 + `node:crypto` ES256 JWT 로 Apple 에 직접 보낸다
 * (로드맵 잠금 SC-5 — iOS 앱에 Firebase 없음).
 *
 * 근거(Apple 문서 · RESEARCH §Code Examples 「APNs 송신기 핵심」):
 *   - establishing-a-token-based-connection-to-apns — JWT 헤더 `{alg: ES256, kid}` · 클레임 `{iss: 팀 ID, iat}` ·
 *     「Refresh your token no more than once every 20 minutes and no less than once every 60 minutes」 → 50분 재사용
 *     (`APNS_JWT_REUSE_MS` · Pitfall 4 — 매번 새로 만들면 429 TooManyProviderTokenUpdates, 1시간 넘기면 403 ExpiredProviderToken).
 *   - sending-notification-requests-to-apns — `POST /3/device/<token>` · `apns-push-type: alert` · `apns-topic` = 번들 id ·
 *     `apns-priority: 10` · `apns-expiration` · `apns-collapse-id`(64바이트 이하) · 페이로드 4096 바이트 이하.
 *   - handling-notification-responses-from-apns — 상태 코드 · `reason` 문자열(아래 분류 표).
 *
 * 페이로드(D-17 · D-18 · D-21): `{ aps: { alert: { title, body }, sound: "default", "thread-id": ISIN }, path }` — 소리는
 * 플랫폼 기본(D-17) · 같은 종목을 한 묶음으로(D-18) · 탭 착지 경로는 최상위 `path`(D-21) · 앱 아이콘 숫자는 쓰지 않는다(D-21).
 * `apns-collapse-id` = 판정 RPC `log_id` — 같은 사건의 재시도가 기기에서 한 알림으로 합쳐진다.
 *
 * 응답 분류(`classifyApnsResponse` — D-15 · SC-3):
 *   200                         ok
 *   410 Unregistered/ExpiredToken token_removed(기기 행 정리 — 40-01 `dma_push_report`)
 *   400 BadDeviceToken 등         failed · **삭제 안 함**(호스트 · 환경 불일치일 수 있다 — Pitfall 5)
 *   403 ExpiredProviderToken      JWT 재발급 후 1회 재시도
 *   403 그 밖(InvalidProviderToken 등) failed(설정 오류 — error 로그)
 *   429                          failed + stopRun(그 묶음의 iOS 남은 송신 중단 — 공식 API 운영 기준 4 · 두드리지 않는다)
 *   5xx · 0(네트워크 · 5초 타임아웃) 1회 재시도 후 failed
 *
 * 하지 않는 것:
 *   - 기기 토큰 · JWT · 키를 로그에 싣지 않는다(T-19-14) — 상태 코드 · reason 만.
 *   - sandbox 호스트로 보내지 않는다 — TestFlight · App Store 빌드 토큰은 production 이다(Pitfall 5). Xcode 직접 실행
 *     기기는 이 phase 범위 밖.
 *   - 재시도를 두 번 이상 하지 않는다 · 429 를 재시도하지 않는다.
 */
import http2, { type ClientHttp2Session } from "node:http2";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";

import { logger } from "../logger.js";
import type { PushSendMessage, PushSendResult, PushSender } from "./notifier.js";

/** APNs production 호스트(Apple 문서 「Production server」). */
export const APNS_HOST = "https://api.push.apple.com:443";
/** JWT 재사용 시간 — Apple 규칙 20분 < 재사용 < 60분(Pitfall 4). */
export const APNS_JWT_REUSE_MS = 50 * 60_000;
/** 요청 한 건 제한 시간(ms) — 넘으면 status 0 으로 보고 1회 재시도. */
export const APNS_TIMEOUT_MS = 5_000;
/** `apns-expiration` — 지금부터 이 초 동안 기기가 꺼져 있으면 APNs 가 보관했다가 준다(1시간 지난 체결 알림은 의미 없다). */
export const APNS_EXPIRATION_SEC = 3_600;
/** APNs 페이로드 상한(바이트 · Apple 문서). */
export const APNS_MAX_PAYLOAD_BYTES = 4_096;

/** 분류 결과 — `retry` 가 있으면 송신기가 한 번 더 보낸다(종류마다 1회). */
export type ApnsVerdict = PushSendResult & { retry?: "transient" | "jwt" };

/** APNs 응답 → 결과(위 머리 표). `status` 0 = 네트워크 · 타임아웃. */
export function classifyApnsResponse(status: number, reason?: string): ApnsVerdict {
  const base = { httpStatus: status, ...(reason !== undefined ? { reason } : {}) };
  if (status === 200) return { result: "ok", ...base };
  if (status === 410) return { result: "token_removed", ...base };
  if (status === 429) return { result: "failed", stopRun: true, ...base };
  if (status === 403 && reason === "ExpiredProviderToken") return { result: "failed", retry: "jwt", ...base };
  if (status === 0 || status >= 500) return { result: "failed", retry: "transient", ...base };
  return { result: "failed", ...base };
}

export type ApnsSenderOptions = {
  keyPem: string;
  keyId: string;
  teamId: string;
  topic: string;
  /** 세션 열기(테스트가 가짜 세션을 넣는다). 기본 `http2.connect`. */
  connect?: (authority: string) => ClientHttp2Session;
  /** 시계(ms · 테스트가 가짜 시계를 넣는다). 기본 `Date.now`. */
  now?: () => number;
  /** 요청 제한 시간(ms). 기본 `APNS_TIMEOUT_MS`. */
  timeoutMs?: number;
};

type RawResponse = { status: number; reason?: string };

const b64url = (b: Buffer | string): string => Buffer.from(b).toString("base64url");

/** 송신 본문(JSON 문자열) — 배지 키 없음(D-21). */
export function apnsPayloadOf(msg: PushSendMessage): string {
  return JSON.stringify({
    aps: { alert: { title: msg.title, body: msg.body }, sound: "default", "thread-id": msg.threadId },
    path: msg.path,
  });
}

export class ApnsSender implements PushSender {
  readonly platform = "ios" as const;

  readonly #key: KeyObject;
  readonly #keyId: string;
  readonly #teamId: string;
  readonly #topic: string;
  readonly #connect: (authority: string) => ClientHttp2Session;
  readonly #now: () => number;
  readonly #timeoutMs: number;
  #jwt: { token: string; at: number } | null = null;
  #session: ClientHttp2Session | null = null;

  constructor(o: ApnsSenderOptions) {
    // 키가 PEM 이 아니면 여기서 throw — index 가 잡아 iOS 송신기만 뺀다(값은 로그로 내보내지 않는다).
    this.#key = createPrivateKey(o.keyPem);
    this.#keyId = o.keyId;
    this.#teamId = o.teamId;
    this.#topic = o.topic;
    this.#connect = o.connect ?? ((authority) => http2.connect(authority));
    this.#now = o.now ?? Date.now;
    this.#timeoutMs = o.timeoutMs ?? APNS_TIMEOUT_MS;
  }

  async send(token: string, msg: PushSendMessage): Promise<PushSendResult> {
    const body = apnsPayloadOf(msg);
    if (Buffer.byteLength(body, "utf8") > APNS_MAX_PAYLOAD_BYTES) {
      // 문안은 shared 가 짧게 만든다 — 여기 오면 계약 밖. 보내지 않는다(APNs 413 을 일부러 받지 않는다).
      logger.error({ bytes: Buffer.byteLength(body, "utf8") }, "[push] APNs 페이로드 4KB 초과 — 보내지 않음");
      return { result: "failed", httpStatus: 0, reason: "PayloadTooLarge" };
    }
    let jwtRetried = false;
    let transientRetried = false;
    for (;;) {
      const raw = await this.#post(token, body, msg.collapseId);
      const v = classifyApnsResponse(raw.status, raw.reason);
      if (v.retry === "jwt" && !jwtRetried) {
        jwtRetried = true;
        this.#jwt = null; // 다음 #token() 이 새로 서명한다.
        continue;
      }
      if (v.retry === "transient" && !transientRetried) {
        transientRetried = true;
        continue;
      }
      const { retry: _retry, ...result } = v;
      if (result.result !== "ok") this.#logFailure(result);
      return result;
    }
  }

  close(): void {
    const s = this.#session;
    this.#session = null;
    if (s !== null && !s.closed && !s.destroyed) s.close();
  }

  /** 실패 로그 — 상태 코드 · reason 만(토큰 · JWT 없음). */
  #logFailure(r: PushSendResult): void {
    const fields = { status: r.httpStatus, reason: r.reason ?? "" };
    if (r.result === "token_removed") {
      logger.info(fields, "[push] APNs 토큰 만료 — 기기 정리");
    } else if (r.httpStatus === 403) {
      logger.error(fields, "[push] APNs 인증 실패 — 키 · 팀 ID · Key ID 확인");
    } else if (r.stopRun === true) {
      logger.warn(fields, "[push] APNs 한도 신호 — 이 묶음 iOS 송신 중단");
    } else {
      logger.warn(fields, "[push] APNs 송신 실패");
    }
  }

  /** ES256 JWT — `APNS_JWT_REUSE_MS` 동안 재사용. */
  #token(): string {
    const now = this.#now();
    if (this.#jwt !== null && now - this.#jwt.at < APNS_JWT_REUSE_MS) return this.#jwt.token;
    const head = b64url(JSON.stringify({ alg: "ES256", kid: this.#keyId }));
    const claims = b64url(JSON.stringify({ iss: this.#teamId, iat: Math.floor(now / 1000) }));
    // JWS(ES256)는 DER 이 아니라 r‖s 64바이트다 — ieee-p1363.
    const sig = sign("sha256", Buffer.from(`${head}.${claims}`), { key: this.#key, dsaEncoding: "ieee-p1363" });
    this.#jwt = { token: `${head}.${claims}.${b64url(sig)}`, at: now };
    return this.#jwt.token;
  }

  /** 세션 하나를 재사용한다 — `goaway` · `error` · 닫힘 뒤에는 다음 요청이 새로 연다. */
  #sess(): ClientHttp2Session {
    const cur = this.#session;
    if (cur !== null && !cur.closed && !cur.destroyed) return cur;
    const s = this.#connect(APNS_HOST);
    const drop = (): void => {
      if (this.#session === s) this.#session = null;
    };
    s.on("error", (err: unknown) => {
      drop();
      logger.warn({ code: (err as { code?: unknown })?.code ?? "" }, "[push] APNs 세션 오류 — 다음 요청이 새로 연다");
    });
    s.on("goaway", () => {
      drop();
      s.close();
    });
    s.on("close", drop);
    s.unref(); // 종료 절차를 붙잡지 않게.
    this.#session = s;
    return s;
  }

  #post(token: string, body: string, collapseId: string): Promise<RawResponse> {
    return new Promise<RawResponse>((resolve) => {
      let settled = false;
      const done = (r: RawResponse): void => {
        if (settled) return;
        settled = true;
        resolve(r);
      };
      let req: ReturnType<ClientHttp2Session["request"]>;
      try {
        req = this.#sess().request({
          ":method": "POST",
          ":path": `/3/device/${token}`,
          authorization: `bearer ${this.#token()}`,
          "apns-push-type": "alert",
          "apns-topic": this.#topic,
          "apns-priority": "10",
          "apns-expiration": String(Math.floor(this.#now() / 1000) + APNS_EXPIRATION_SEC),
          "apns-collapse-id": collapseId,
          "content-type": "application/json",
        });
      } catch {
        // 닫히는 중인 세션 등 — 세션을 버리고 네트워크 실패로 본다(호출자가 1회 재시도).
        this.#session = null;
        done({ status: 0, reason: "Network" });
        return;
      }
      let status = 0;
      let timedOut = false;
      const chunks: Buffer[] = [];
      req.setTimeout(this.#timeoutMs, () => {
        timedOut = true;
        req.close(http2.constants.NGHTTP2_CANCEL);
      });
      req.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
      });
      req.on("data", (c: Buffer | string) => {
        chunks.push(typeof c === "string" ? Buffer.from(c) : c);
      });
      req.on("error", () => {
        // 이어서 close 가 온다 — 상태를 못 받았으면 0.
      });
      req.on("close", () => {
        if (status === 0) {
          done({ status: 0, reason: timedOut ? "Timeout" : "Network" });
          return;
        }
        let reason: string | undefined;
        if (chunks.length > 0) {
          try {
            const j = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { reason?: unknown };
            if (typeof j.reason === "string") reason = j.reason;
          } catch {
            // 본문이 JSON 이 아니면 reason 없이.
          }
        }
        done(reason !== undefined ? { status, reason } : { status });
      });
      req.end(body);
    });
  }
}
