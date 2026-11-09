/**
 * Phase 40 (40-09) — `FcmSender` · `classifyFcmResponse` (FCM HTTP v1 · 메타데이터 토큰).
 *
 * 잠그는 것:
 *   - 메타데이터 토큰을 만료 60초 전까지 재사용 · 401 이면 캐시를 버리고 1회 재요청 후 재시도
 *   - 요청 URL · 헤더 · 본문(notification 필수 · android.priority HIGH · ttl · channel_id fills · data.path · tag 없음)
 *   - 응답 분류 표(200 · 404 UNREGISTERED · FcmError 없는 404(삭제 안 함) · 400 INVALID_ARGUMENT · 403 · 429 · 5xx · 네트워크) · 재시도 횟수
 *   - `probe()` — validate_only 한 번 · 403 이면 error · 400/404 UNREGISTERED 면 info · FcmError 없는 404 면 warn · 예외는 삼킨다
 *   - 로그에 기기 토큰 · 액세스 토큰이 없다(T-19-14)
 *
 * 가짜 fetch: URL 로 메타데이터 · FCM 요청을 갈라 기록하고, FCM 응답은 스크립트 순서대로 낸다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "../src/logger.js";
import { FCM_METADATA_TOKEN_URL, FcmSender, classifyFcmResponse } from "../src/push/fcm.js";
import type { PushSendMessage } from "../src/push/notifier.js";

const DEVICE_TOKEN = "fcm-device-token-" + "x".repeat(140);
const T0 = Date.UTC(2026, 10, 7, 0, 0, 0);
const SEND_URL = "https://fcm.googleapis.com/v1/projects/gh-radar/messages:send";

const MSG: PushSendMessage = {
  title: "금양그린파워 · 선매수 체결",
  body: "200주 체결 (62만) · 잔량 300주 · 3,120 · KRX 09:00:31",
  path: "/trading/order-log?stock=KR7282720004&date=2026-11-07",
  threadId: "KR7282720004",
  collapseId: "3f2b1c4d-0000-4000-8000-000000000001",
};

/** FCM 응답 한 칸 — 상태 + 오류 코드(details errorCode) · 또는 네트워크 예외. */
type Step = { status: number; errorStatus?: string; errorCode?: string } | "network" | "timeout";

function fcmError(step: { status: number; errorStatus?: string; errorCode?: string }): string {
  if (step.status === 200) return JSON.stringify({ name: "projects/gh-radar/messages/0:123" });
  return JSON.stringify({
    error: {
      code: step.status,
      message: "fake",
      status: step.errorStatus ?? "UNKNOWN",
      ...(step.errorCode !== undefined
        ? { details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: step.errorCode }] }
        : {}),
    },
  });
}

type Call = { url: string; init: RequestInit | undefined };

function harness(script: Step[], opts: { expiresIn?: number; metadataFails?: boolean } = {}) {
  const clock = { t: T0 };
  const metadata: Call[] = [];
  const sends: Call[] = [];
  let tokenSeq = 0;
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url === FCM_METADATA_TOKEN_URL) {
      metadata.push({ url, init });
      if (opts.metadataFails === true) throw new TypeError("fetch failed");
      tokenSeq += 1;
      return new Response(JSON.stringify({ access_token: `ya29.access-${tokenSeq}`, expires_in: opts.expiresIn ?? 3599, token_type: "Bearer" }), {
        status: 200,
      });
    }
    sends.push({ url, init });
    const step = script.shift() ?? { status: 200 };
    if (step === "network") throw new TypeError("fetch failed");
    if (step === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    return new Response(fcmError(step), { status: step.status });
  });
  const sender = new FcmSender({ projectId: "gh-radar", fetch: fetchImpl as unknown as typeof fetch, now: () => clock.t });
  const bodyOf = (i: number) => JSON.parse(String(sends[i]!.init!.body)) as Record<string, unknown>;
  const headerOf = (i: number, k: string) => new Headers(sends[i]!.init!.headers).get(k);
  return { sender, clock, metadata, sends, bodyOf, headerOf };
}

type LogCall = { level: string; text: string };

function captureLogs(): LogCall[] {
  const out: LogCall[] = [];
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
      out.push({ level, text: JSON.stringify(args) });
    }) as never);
  }
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyFcmResponse — 분류 표(D-15 · SC-3)", () => {
  it("200 ok · FcmError UNREGISTERED 만 token_removed", () => {
    expect(classifyFcmResponse(200)).toEqual({ result: "ok", httpStatus: 200 });
    expect(classifyFcmResponse(404, "UNREGISTERED", "NOT_FOUND")).toEqual({ result: "token_removed", httpStatus: 404, reason: "UNREGISTERED" });
  });

  it("WR-04 — FcmError 없는 404 · Google NOT_FOUND 는 failed(프로젝트 · URL 문제 — 기기를 지우지 않는다)", () => {
    expect(classifyFcmResponse(404)).toEqual({ result: "failed", httpStatus: 404 });
    expect(classifyFcmResponse(404, undefined, "NOT_FOUND")).toEqual({ result: "failed", httpStatus: 404, reason: "NOT_FOUND" });
    expect(classifyFcmResponse(404, "NOT_FOUND").result).toBe("failed");
  });

  it("400 INVALID_ARGUMENT 는 failed — 삭제하지 않는다", () => {
    const v = classifyFcmResponse(400, "INVALID_ARGUMENT");
    expect(v).toEqual({ result: "failed", httpStatus: 400, reason: "INVALID_ARGUMENT" });
  });

  it("403 PERMISSION_DENIED · SENDER_ID_MISMATCH 는 failed · 재시도 · 중단 없음", () => {
    for (const s of ["PERMISSION_DENIED", "SENDER_ID_MISMATCH"]) {
      const v = classifyFcmResponse(403, s);
      expect(v.result).toBe("failed");
      expect(v.retry).toBeUndefined();
      expect(v.stopRun).toBeUndefined();
    }
  });

  it("429 QUOTA_EXCEEDED → failed + stopRun · 재시도 없음", () => {
    const v = classifyFcmResponse(429, "QUOTA_EXCEEDED");
    expect(v).toMatchObject({ result: "failed", stopRun: true, httpStatus: 429 });
    expect(v.retry).toBeUndefined();
  });

  it("401 → 토큰 재발급 재시도 · 5xx · 0 → 1회 재시도", () => {
    expect(classifyFcmResponse(401, "UNAUTHENTICATED").retry).toBe("auth");
    expect(classifyFcmResponse(500, "INTERNAL").retry).toBe("transient");
    expect(classifyFcmResponse(503, "UNAVAILABLE").retry).toBe("transient");
    expect(classifyFcmResponse(0).retry).toBe("transient");
  });
});

describe("FcmSender — 메타데이터 토큰", () => {
  it("Metadata-Flavor 헤더 · 만료 60초 전까지 재사용 · 넘으면 새로", async () => {
    const h = harness([], { expiresIn: 3600 });
    await h.sender.send(DEVICE_TOKEN, MSG);
    expect(h.metadata).toHaveLength(1);
    expect(new Headers(h.metadata[0]!.init!.headers).get("Metadata-Flavor")).toBe("Google");

    h.clock.t = T0 + (3600 - 61) * 1000;
    await h.sender.send(DEVICE_TOKEN, MSG);
    expect(h.metadata).toHaveLength(1);
    expect(h.headerOf(1, "authorization")).toBe("Bearer ya29.access-1");

    h.clock.t = T0 + (3600 - 59) * 1000;
    await h.sender.send(DEVICE_TOKEN, MSG);
    expect(h.metadata).toHaveLength(2);
    expect(h.headerOf(2, "authorization")).toBe("Bearer ya29.access-2");
  });

  it("401 → 캐시를 버리고 토큰을 다시 받아 1회 재시도 → ok", async () => {
    const h = harness([{ status: 401, errorStatus: "UNAUTHENTICATED" }, { status: 200 }]);
    expect(await h.sender.send(DEVICE_TOKEN, MSG)).toEqual({ result: "ok", httpStatus: 200 });
    expect(h.metadata).toHaveLength(2);
    expect(h.sends).toHaveLength(2);
    expect(h.headerOf(0, "authorization")).toBe("Bearer ya29.access-1");
    expect(h.headerOf(1, "authorization")).toBe("Bearer ya29.access-2");
  });

  it("메타데이터 서버 실패 → status 0 · 1회 재시도 뒤 failed(FCM 요청 0)", async () => {
    captureLogs();
    const h = harness([], { metadataFails: true });
    const r = await h.sender.send(DEVICE_TOKEN, MSG);
    expect(r).toMatchObject({ result: "failed", httpStatus: 0 });
    expect(h.metadata).toHaveLength(2);
    expect(h.sends).toHaveLength(0);
  });
});

describe("FcmSender — 요청 · 본문", () => {
  it("v1 URL · 헤더 · notification 필수 · android HIGH · ttl · channel fills · data.path · tag 없음 · 5초 signal", async () => {
    const h = harness([{ status: 200 }]);
    expect(await h.sender.send(DEVICE_TOKEN, MSG)).toEqual({ result: "ok", httpStatus: 200 });
    expect(h.sends[0]!.url).toBe(SEND_URL);
    expect(h.sends[0]!.init!.method).toBe("POST");
    expect(h.headerOf(0, "content-type")).toMatch(/^application\/json/);
    expect(h.sends[0]!.init!.signal).toBeInstanceOf(AbortSignal);
    const body = h.bodyOf(0);
    expect(body).toEqual({
      message: {
        token: DEVICE_TOKEN,
        notification: { title: MSG.title, body: MSG.body },
        android: { priority: "HIGH", ttl: "3600s", notification: { channel_id: "fills", sound: "default" } },
        data: { path: MSG.path },
      },
    });
    expect(JSON.stringify(body)).not.toContain('"tag"');
    expect(JSON.stringify(body)).not.toContain("validate_only");
    const data = (body.message as { data: Record<string, unknown> }).data;
    for (const v of Object.values(data)) expect(typeof v).toBe("string");
  });
});

describe("FcmSender — 응답에 따른 재시도 · 정리 · 중단", () => {
  it("404 UNREGISTERED(details errorCode) → token_removed · 재시도 없음", async () => {
    captureLogs();
    const h = harness([{ status: 404, errorStatus: "NOT_FOUND", errorCode: "UNREGISTERED" }]);
    expect(await h.sender.send(DEVICE_TOKEN, MSG)).toEqual({ result: "token_removed", httpStatus: 404, reason: "UNREGISTERED" });
    expect(h.sends).toHaveLength(1);
  });

  it("WR-04 — 404 NOT_FOUND(FcmError 없음 · 프로젝트 id 오타 등) → failed · error 로그 · 재시도 없음", async () => {
    const logs = captureLogs();
    const h = harness([{ status: 404, errorStatus: "NOT_FOUND" }]);
    expect(await h.sender.send(DEVICE_TOKEN, MSG)).toEqual({ result: "failed", httpStatus: 404, reason: "NOT_FOUND" });
    expect(h.sends).toHaveLength(1);
    expect(logs.some((l) => l.level === "error" && l.text.includes("[push] FCM 404(UNREGISTERED 아님)"))).toBe(true);
  });

  it("400 INVALID_ARGUMENT → failed · 삭제 아님 · 재시도 없음", async () => {
    captureLogs();
    const h = harness([{ status: 400, errorStatus: "INVALID_ARGUMENT", errorCode: "INVALID_ARGUMENT" }]);
    expect(await h.sender.send(DEVICE_TOKEN, MSG)).toEqual({ result: "failed", httpStatus: 400, reason: "INVALID_ARGUMENT" });
    expect(h.sends).toHaveLength(1);
  });

  it("403 SENDER_ID_MISMATCH → failed + error 로그", async () => {
    const logs = captureLogs();
    const h = harness([{ status: 403, errorStatus: "PERMISSION_DENIED", errorCode: "SENDER_ID_MISMATCH" }]);
    expect(await h.sender.send(DEVICE_TOKEN, MSG)).toMatchObject({ result: "failed", httpStatus: 403, reason: "SENDER_ID_MISMATCH" });
    expect(h.sends).toHaveLength(1);
    expect(logs.some((l) => l.level === "error" && l.text.includes("[push] FCM"))).toBe(true);
  });

  it("429 QUOTA_EXCEEDED → failed + stopRun · 재시도 없음", async () => {
    captureLogs();
    const h = harness([{ status: 429, errorStatus: "RESOURCE_EXHAUSTED", errorCode: "QUOTA_EXCEEDED" }]);
    expect(await h.sender.send(DEVICE_TOKEN, MSG)).toEqual({
      result: "failed",
      httpStatus: 429,
      reason: "QUOTA_EXCEEDED",
      stopRun: true,
    });
    expect(h.sends).toHaveLength(1);
  });

  it("5xx → 1회 재시도 후 ok · 두 번이면 failed", async () => {
    captureLogs();
    const h = harness([{ status: 503, errorStatus: "UNAVAILABLE" }, { status: 200 }]);
    expect(await h.sender.send(DEVICE_TOKEN, MSG)).toEqual({ result: "ok", httpStatus: 200 });
    expect(h.sends).toHaveLength(2);
    const h2 = harness([{ status: 500, errorStatus: "INTERNAL" }, { status: 500, errorStatus: "INTERNAL" }, { status: 200 }]);
    expect(await h2.sender.send(DEVICE_TOKEN, MSG)).toMatchObject({ result: "failed", httpStatus: 500 });
    expect(h2.sends).toHaveLength(2);
  });

  it("네트워크 · 타임아웃 → status 0 · 1회 재시도 후 failed", async () => {
    captureLogs();
    const h = harness(["timeout", "network"]);
    expect(await h.sender.send(DEVICE_TOKEN, MSG)).toEqual({ result: "failed", httpStatus: 0, reason: "Network" });
    expect(h.sends).toHaveLength(2);
    const h2 = harness(["timeout", { status: 200 }]);
    expect(await h2.sender.send(DEVICE_TOKEN, MSG)).toEqual({ result: "ok", httpStatus: 200 });
  });
});

describe("FcmSender — probe(기동 권한 확인)", () => {
  it("validate_only 한 번 · 가짜 토큰 · 403 이면 error 「송신 권한 없음」", async () => {
    const logs = captureLogs();
    const h = harness([{ status: 403, errorStatus: "PERMISSION_DENIED" }]);
    await h.sender.probe();
    expect(h.sends).toHaveLength(1);
    const body = h.bodyOf(0) as { validate_only?: unknown; message: { token: string } };
    expect(body.validate_only).toBe(true);
    expect(body.message.token).not.toBe(DEVICE_TOKEN);
    expect(
      logs.some((l) => l.level === "error" && l.text.includes("[push] FCM 송신 권한 없음 — setup-relay-iam.sh(FCM 역할 · API) 확인")),
    ).toBe(true);
  });

  it("400 · 404 UNREGISTERED 면 info 「FCM 권한 확인」", async () => {
    for (const step of [
      { status: 400, errorStatus: "INVALID_ARGUMENT" },
      { status: 404, errorStatus: "NOT_FOUND", errorCode: "UNREGISTERED" },
    ]) {
      vi.restoreAllMocks();
      const logs = captureLogs();
      const h = harness([step]);
      await h.sender.probe();
      expect(logs.some((l) => l.level === "info" && l.text.includes("[push] FCM 권한 확인"))).toBe(true);
      expect(logs.some((l) => l.level === "error")).toBe(false);
    }
  });

  it("WR-04 — FcmError 없는 404 면 warn 「프로젝트 · 송신 URL 확인」(info 로 가리지 않는다)", async () => {
    const logs = captureLogs();
    const h = harness([{ status: 404, errorStatus: "NOT_FOUND" }]);
    await h.sender.probe();
    expect(logs.some((l) => l.level === "warn" && l.text.includes("[push] FCM 404 — 프로젝트 · 송신 URL 확인"))).toBe(true);
    expect(logs.some((l) => l.level === "info" && l.text.includes("[push] FCM 권한 확인"))).toBe(false);
  });

  it("예외는 삼키고 로그만(기동을 막지 않는다)", async () => {
    const logs = captureLogs();
    const h = harness([], { metadataFails: true });
    await expect(h.sender.probe()).resolves.toBeUndefined();
    expect(logs.some((l) => l.text.includes("[push] FCM"))).toBe(true);
  });
});

describe("FcmSender — 로그(T-19-14)", () => {
  it("로그에 기기 토큰 · 액세스 토큰이 없다", async () => {
    const logs = captureLogs();
    const h = harness([
      { status: 404, errorCode: "UNREGISTERED" },
      { status: 400, errorStatus: "INVALID_ARGUMENT" },
      { status: 403, errorStatus: "PERMISSION_DENIED" },
      { status: 429, errorCode: "QUOTA_EXCEEDED" },
      { status: 403, errorStatus: "PERMISSION_DENIED" },
    ]);
    for (let i = 0; i < 4; i++) await h.sender.send(DEVICE_TOKEN, MSG);
    await h.sender.probe();
    expect(logs.length).toBeGreaterThanOrEqual(4);
    for (const l of logs) {
      expect(l.text).toContain("[push] FCM");
      expect(l.text).not.toContain(DEVICE_TOKEN);
      expect(l.text).not.toContain("ya29.");
    }
  });
});
