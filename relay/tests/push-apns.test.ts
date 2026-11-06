/**
 * Phase 40 (40-09) — `ApnsSender` · `classifyApnsResponse`.
 *
 * 잠그는 것:
 *   - JWT 헤더 `{alg: ES256, kid}` · 클레임 `{iss, iat}` · ieee-p1363 서명(64바이트)이 공개키로 검증된다 · 49분 재사용 · 51분 새로
 *   - 요청 헤더(:path · authorization · push-type · topic · priority · expiration · collapse-id) · 본문 모양(배지 키 없음)
 *   - 응답 분류 표(200 · 410 · 400 · 429 · 403 Expired/Invalid · 5xx · 0) · 재시도 횟수
 *   - 세션 재사용 · goaway / error 뒤 새 세션 · close
 *   - 로그에 토큰 · JWT 가 없다(T-19-14)
 *
 * 가짜 http2 세션: `request()` 가 헤더 · 본문을 기록하고, 스크립트(응답 순서)대로 response → data → close 를 낸다.
 * 키는 테스트 안에서 만든 P-256 키쌍이다(실제 APNs 키 아님).
 */
import { EventEmitter } from "node:events";
import type { ClientHttp2Session } from "node:http2";
import { generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "../src/logger.js";
import {
  APNS_HOST,
  APNS_JWT_REUSE_MS,
  ApnsSender,
  classifyApnsResponse,
} from "../src/push/apns.js";
import type { PushSendMessage } from "../src/push/notifier.js";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const TOKEN = "a".repeat(64);
const T0 = Date.UTC(2026, 10, 7, 0, 0, 0);

const MSG: PushSendMessage = {
  title: "금양그린파워 · 선매수 체결",
  body: "200주 체결 (62만) · 잔량 300주 · 3,120 · KRX 09:00:31",
  path: "/trading/order-log?stock=KR7282720004&date=2026-11-07",
  threadId: "KR7282720004",
  collapseId: "3f2b1c4d-0000-4000-8000-000000000001",
};

/** 응답 스크립트 한 칸 — 숫자 상태 + reason, 또는 타임아웃 · 스트림 오류. */
type Step = { status: number; reason?: string } | "timeout" | "error";

class FakeStream extends EventEmitter {
  headers: Record<string, string>;
  body = "";
  #timeoutCb: (() => void) | null = null;
  constructor(
    headers: Record<string, string>,
    private readonly step: Step,
  ) {
    super();
    this.headers = headers;
  }
  setTimeout(_ms: number, cb: () => void): this {
    this.#timeoutCb = cb;
    return this;
  }
  close(): void {
    setImmediate(() => this.emit("close"));
  }
  end(body: string): void {
    this.body = body;
    setImmediate(() => {
      const step = this.step;
      if (step === "timeout") {
        this.#timeoutCb?.(); // 송신기가 close(CANCEL) 를 부른다 → close
        return;
      }
      if (step === "error") {
        this.emit("error", new Error("stream reset"));
        this.emit("close");
        return;
      }
      this.emit("response", { ":status": step.status });
      if (step.reason !== undefined) this.emit("data", Buffer.from(JSON.stringify({ reason: step.reason })));
      this.emit("close");
    });
  }
}

class FakeSession extends EventEmitter {
  closed = false;
  destroyed = false;
  readonly streams: FakeStream[] = [];
  constructor(private readonly script: Step[]) {
    super();
  }
  request(headers: Record<string, string>): FakeStream {
    const step = this.script.shift() ?? { status: 200 };
    const s = new FakeStream(headers, step);
    this.streams.push(s);
    return s;
  }
  close(): void {
    this.closed = true;
  }
  destroy(): void {
    this.destroyed = true;
  }
  unref(): void {}
}

function harness(script: Step[], clock = { t: T0 }) {
  const sessions: FakeSession[] = [];
  const authorities: string[] = [];
  const sender = new ApnsSender({
    keyPem: KEY_PEM,
    keyId: "ABC123DEFG",
    teamId: "954QPCS3F5",
    topic: "com.ghtrade.app",
    connect: (authority) => {
      authorities.push(authority);
      const s = new FakeSession(script);
      sessions.push(s);
      return s as unknown as ClientHttp2Session;
    },
    now: () => clock.t,
  });
  const streams = () => sessions.flatMap((s) => s.streams);
  return { sender, sessions, authorities, streams, clock };
}

function decodeJwt(jwt: string) {
  const [h, c, s] = jwt.split(".");
  return {
    header: JSON.parse(Buffer.from(h!, "base64url").toString()) as Record<string, unknown>,
    claims: JSON.parse(Buffer.from(c!, "base64url").toString()) as Record<string, unknown>,
    signingInput: `${h}.${c}`,
    sig: Buffer.from(s!, "base64url"),
  };
}

const bearer = (st: FakeStream) => st.headers.authorization!.replace(/^bearer /, "");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyApnsResponse — 분류 표(D-15 · SC-3)", () => {
  it("200 ok · 410 token_removed(Unregistered · ExpiredToken)", () => {
    expect(classifyApnsResponse(200)).toEqual({ result: "ok", httpStatus: 200 });
    expect(classifyApnsResponse(410, "Unregistered")).toEqual({ result: "token_removed", httpStatus: 410, reason: "Unregistered" });
    expect(classifyApnsResponse(410, "ExpiredToken").result).toBe("token_removed");
  });

  it("400 BadDeviceToken 은 failed — 삭제하지 않는다(Pitfall 5)", () => {
    const v = classifyApnsResponse(400, "BadDeviceToken");
    expect(v.result).toBe("failed");
    expect(v.retry).toBeUndefined();
    expect(v.stopRun).toBeUndefined();
  });

  it("429 는 failed + stopRun · 재시도 없음(공식 API 운영 기준 4)", () => {
    const v = classifyApnsResponse(429, "TooManyRequests");
    expect(v).toMatchObject({ result: "failed", stopRun: true, httpStatus: 429 });
    expect(v.retry).toBeUndefined();
  });

  it("403 ExpiredProviderToken → JWT 재발급 재시도 · 403 InvalidProviderToken → failed", () => {
    expect(classifyApnsResponse(403, "ExpiredProviderToken").retry).toBe("jwt");
    const inv = classifyApnsResponse(403, "InvalidProviderToken");
    expect(inv.result).toBe("failed");
    expect(inv.retry).toBeUndefined();
  });

  it("5xx · 0 → 1회 재시도 대상", () => {
    expect(classifyApnsResponse(500, "InternalServerError").retry).toBe("transient");
    expect(classifyApnsResponse(503, "ServiceUnavailable").retry).toBe("transient");
    expect(classifyApnsResponse(0).retry).toBe("transient");
  });
});

describe("ApnsSender — JWT(ES256 · 50분 재사용)", () => {
  it("헤더 {alg: ES256, kid} · 클레임 {iss, iat} · ieee-p1363 64바이트 서명이 공개키로 검증된다", async () => {
    const h = harness([{ status: 200 }]);
    await h.sender.send(TOKEN, MSG);
    const jwt = decodeJwt(bearer(h.streams()[0]!));
    expect(jwt.header).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(jwt.claims).toEqual({ iss: "954QPCS3F5", iat: Math.floor(T0 / 1000) });
    expect(jwt.sig.length).toBe(64);
    const ok = verify(
      "sha256",
      Buffer.from(jwt.signingInput),
      { key: publicKey as KeyObject, dsaEncoding: "ieee-p1363" },
      jwt.sig,
    );
    expect(ok).toBe(true);
  });

  it("49분 뒤 같은 토큰 · 51분 뒤 새 토큰", async () => {
    expect(APNS_JWT_REUSE_MS).toBe(50 * 60_000);
    const h = harness([{ status: 200 }, { status: 200 }, { status: 200 }]);
    await h.sender.send(TOKEN, MSG);
    h.clock.t = T0 + 49 * 60_000;
    await h.sender.send(TOKEN, MSG);
    h.clock.t = T0 + 51 * 60_000;
    await h.sender.send(TOKEN, MSG);
    const [a, b, c] = h.streams().map(bearer);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
    expect(decodeJwt(c!).claims.iat).toBe(Math.floor((T0 + 51 * 60_000) / 1000));
  });
});

describe("ApnsSender — 요청 · 본문", () => {
  it("헤더 · production 호스트 · 본문 모양(thread-id · path · 배지 키 없음)", async () => {
    const h = harness([{ status: 200 }]);
    const r = await h.sender.send(TOKEN, MSG);
    expect(r).toEqual({ result: "ok", httpStatus: 200 });
    expect(h.authorities).toEqual([APNS_HOST]);
    expect(APNS_HOST).toBe("https://api.push.apple.com:443");
    const st = h.streams()[0]!;
    expect(st.headers).toMatchObject({
      ":method": "POST",
      ":path": `/3/device/${TOKEN}`,
      "apns-push-type": "alert",
      "apns-topic": "com.ghtrade.app",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(T0 / 1000) + 3600),
      "apns-collapse-id": MSG.collapseId,
    });
    expect(st.headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(Buffer.byteLength(MSG.collapseId)).toBeLessThanOrEqual(64);
    const body = JSON.parse(st.body) as Record<string, unknown>;
    expect(body).toEqual({
      aps: { alert: { title: MSG.title, body: MSG.body }, sound: "default", "thread-id": MSG.threadId },
      path: MSG.path,
    });
    expect(JSON.stringify(body)).not.toContain("badge");
    expect(Buffer.byteLength(st.body)).toBeLessThanOrEqual(4096);
  });

  it("4KB 넘는 본문은 보내지 않고 failed", async () => {
    const h = harness([{ status: 200 }]);
    const r = await h.sender.send(TOKEN, { ...MSG, body: "가".repeat(2000) });
    expect(r).toMatchObject({ result: "failed", httpStatus: 0, reason: "PayloadTooLarge" });
    expect(h.streams()).toHaveLength(0);
  });
});

describe("ApnsSender — 응답에 따른 재시도 · 정리 · 중단", () => {
  it("410 Unregistered → token_removed · 재시도 없음", async () => {
    const h = harness([{ status: 410, reason: "Unregistered" }]);
    expect(await h.sender.send(TOKEN, MSG)).toEqual({ result: "token_removed", httpStatus: 410, reason: "Unregistered" });
    expect(h.streams()).toHaveLength(1);
  });

  it("400 BadDeviceToken → failed · 재시도 없음 · 삭제 아님", async () => {
    const h = harness([{ status: 400, reason: "BadDeviceToken" }]);
    expect(await h.sender.send(TOKEN, MSG)).toEqual({ result: "failed", httpStatus: 400, reason: "BadDeviceToken" });
    expect(h.streams()).toHaveLength(1);
  });

  it("429 → failed + stopRun · 재시도 없음", async () => {
    const h = harness([{ status: 429, reason: "TooManyRequests" }]);
    expect(await h.sender.send(TOKEN, MSG)).toEqual({
      result: "failed",
      httpStatus: 429,
      reason: "TooManyRequests",
      stopRun: true,
    });
    expect(h.streams()).toHaveLength(1);
  });

  it("403 ExpiredProviderToken → JWT 를 새로 서명해 1회 재시도 → ok", async () => {
    const h = harness([{ status: 403, reason: "ExpiredProviderToken" }, { status: 200 }]);
    h.clock.t = T0;
    const first = h.sender.send(TOKEN, MSG);
    // 재시도 전에 시계를 1초 옮겨 새 iat 로 다른 토큰이 나오는지 본다.
    h.clock.t = T0 + 1_000;
    expect(await first).toEqual({ result: "ok", httpStatus: 200 });
    const [a, b] = h.streams().map(bearer);
    expect(h.streams()).toHaveLength(2);
    expect(b).not.toBe(a);
  });

  it("403 ExpiredProviderToken 이 두 번이면 두 번째에서 멈춘다(failed)", async () => {
    const h = harness([
      { status: 403, reason: "ExpiredProviderToken" },
      { status: 403, reason: "ExpiredProviderToken" },
      { status: 200 },
    ]);
    expect(await h.sender.send(TOKEN, MSG)).toMatchObject({ result: "failed", httpStatus: 403 });
    expect(h.streams()).toHaveLength(2);
  });

  it("403 InvalidProviderToken → failed · 재시도 없음", async () => {
    const h = harness([{ status: 403, reason: "InvalidProviderToken" }]);
    expect(await h.sender.send(TOKEN, MSG)).toMatchObject({ result: "failed", httpStatus: 403, reason: "InvalidProviderToken" });
    expect(h.streams()).toHaveLength(1);
  });

  it("5xx → 1회 재시도 후 ok", async () => {
    const h = harness([{ status: 503, reason: "ServiceUnavailable" }, { status: 200 }]);
    expect(await h.sender.send(TOKEN, MSG)).toEqual({ result: "ok", httpStatus: 200 });
    expect(h.streams()).toHaveLength(2);
  });

  it("5xx 두 번 → failed(재시도는 1회뿐)", async () => {
    const h = harness([{ status: 500 }, { status: 500 }, { status: 200 }]);
    expect(await h.sender.send(TOKEN, MSG)).toMatchObject({ result: "failed", httpStatus: 500 });
    expect(h.streams()).toHaveLength(2);
  });

  it("타임아웃 · 스트림 오류 → status 0 · 1회 재시도 후 failed", async () => {
    const h = harness(["timeout", "error"]);
    expect(await h.sender.send(TOKEN, MSG)).toEqual({ result: "failed", httpStatus: 0, reason: "Network" });
    expect(h.streams()).toHaveLength(2);
    const h2 = harness(["timeout", { status: 200 }]);
    expect(await h2.sender.send(TOKEN, MSG)).toEqual({ result: "ok", httpStatus: 200 });
  });
});

describe("ApnsSender — 세션", () => {
  it("세션 하나를 재사용하고 goaway · error 뒤 다음 요청이 새로 연다 · close 가 닫는다", async () => {
    const h = harness([]);
    await h.sender.send(TOKEN, MSG);
    await h.sender.send(TOKEN, MSG);
    expect(h.sessions).toHaveLength(1);

    h.sessions[0]!.emit("goaway");
    expect(h.sessions[0]!.closed).toBe(true);
    await h.sender.send(TOKEN, MSG);
    expect(h.sessions).toHaveLength(2);

    vi.spyOn(logger, "warn").mockImplementation((() => undefined) as never);
    h.sessions[1]!.emit("error", Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" }));
    await h.sender.send(TOKEN, MSG);
    expect(h.sessions).toHaveLength(3);

    h.sender.close();
    expect(h.sessions[2]!.closed).toBe(true);
  });
});

describe("ApnsSender — 로그(T-19-14)", () => {
  it("실패 로그에 토큰 · JWT · 키가 없다", async () => {
    const lines: string[] = [];
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
        lines.push(JSON.stringify(args));
      }) as never);
    }
    const h = harness([
      { status: 410, reason: "Unregistered" },
      { status: 400, reason: "BadDeviceToken" },
      { status: 403, reason: "InvalidProviderToken" },
      { status: 429, reason: "TooManyRequests" },
    ]);
    for (let i = 0; i < 4; i++) await h.sender.send(TOKEN, MSG);
    const jwt = bearer(h.streams()[0]!);
    expect(lines.length).toBeGreaterThanOrEqual(4);
    for (const l of lines) {
      expect(l).toContain("[push] APNs");
      expect(l).not.toContain(TOKEN);
      expect(l).not.toContain(jwt);
      expect(l).not.toContain("PRIVATE KEY");
    }
  });
});
