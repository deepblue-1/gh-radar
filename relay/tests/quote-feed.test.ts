/**
 * Phase 26 Plan 02 — `QuoteFeed` 상태기계 단위 테스트 (가짜 전송 · 실 와이어 프레임).
 *
 * 잠그는 것:
 *   L1  로그인 페이로드 — up 한 번에 관찰자 로그인 1건 · role 1 · client `gh-radar-relay/quote` · since 0 · epoch ""
 *       · strategySinceSeq 0 (확정-로그인 · 확정-인증). 비밀은 받은 값 그대로 실린다.
 *   L2  79(success · role 1) → ready · "ready" 1회 · "state" 가 connecting → logging_in → ready 순.
 *       ready 뒤 프레임(59 · 78 …)은 "frame" 으로 그대로 넘기고 `lastFrameAtMs` 를 갱신한다.
 *   L3  ready 전에 온 프레임은 "frame" 으로 내보내지 않는다(로그인 판단 전 시세를 hub 에 흘리지 않는다).
 *   L4  79 success=false → rejected · stopReconnect 다음 destroy(순서가 바뀌면 닫힘이 부른 down 이 재접속을
 *       예약한다 — observer.ts #reject 동형 · 19 D-13) · 이후 up 에도 로그인 0.
 *   L5  79 success ∧ role≠1 (role 을 모르는 구 서버가 journal 로 수락) → role_mismatch · 같은 순서 · error 로그에
 *       받은 role · 이후 up 에도 로그인 0 (RESEARCH Pitfall 2 · T-26-04).
 *   L6  로그인 응답 없이 LOGIN_RESP_TIMEOUT_MS → dropTransport 1회 · connecting (T-26-08).
 *   L7  ready → down → up → 79 → reconnects 1 (재접속 계수 — healthz 원천).
 *   L8  send 는 ready 일 때만 전송에 넘긴다.
 *   L9  비밀 없음 → disabled · connect 0 (D-17 「quote 비밀 없음 = 끔」).
 *   L10 모든 케이스에서 logger 네 레벨 호출 인자에 비밀 · 호스트 문자열 0회 (T-19-03 · T-26-05 · T-26-07).
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QUOTE_CLIENT_NAME, QUOTE_ROLE, QuoteFeed, type QuoteFeedState } from "../src/quote/feed.js";
import { LOGIN_RESP_TIMEOUT_MS } from "../src/dma/session.js";
import { MSG } from "../src/dma/msg-type.js";
import { resetDroppedEnvelopeCount, tryParseEnvelope } from "../src/dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import type { ObserverTransport } from "../src/journal/types.js";
import {
  buildObserverLoginRespFrame,
  buildQuoteStateFrame,
  buildRateCrossSnapshotFrame,
  type FakeObserverLoginRespInput,
} from "./helpers/frames.js";
import { readObserverLoginRequest } from "./helpers/fake-gateway.js";

const SECRET = "quote-secret-DO-NOT-LOG-test-only-9c1e";
const HOST = "quote-gw.invalid.test";

// ============================================================
// 가짜 전송 (journal-observer.test.ts FakeTransport 최소형 + 호출 순서 기록)
// ============================================================

class FakeTransport extends EventEmitter implements ObserverTransport {
  gen = 0;
  /** 호출 순서 — stopReconnect 와 destroy 의 선후를 단언한다. */
  readonly calls: string[] = [];
  readonly sent: Uint8Array[] = [];
  readonly drops: string[] = [];
  readonly stops: string[] = [];

  get generation(): number {
    return this.gen;
  }
  connect(): void {
    this.calls.push("connect");
  }
  send(payload: Uint8Array): boolean {
    this.calls.push("send");
    this.sent.push(payload);
    return true;
  }
  stopReconnect(reason: string): void {
    this.calls.push("stopReconnect");
    this.stops.push(reason);
  }
  dropTransport(reason: string): void {
    this.calls.push("dropTransport");
    this.drops.push(reason);
  }
  resetReconnectAttempts(): void {
    this.calls.push("resetReconnectAttempts");
  }
  destroy(): void {
    this.calls.push("destroy");
  }

  count(call: string): number {
    return this.calls.filter((c) => c === call).length;
  }

  /** DmaClient 의 연결 수립 흉내 — 세대 +1 후 "up". */
  emitUp(): void {
    this.gen += 1;
    this.emit("up", { generation: this.gen });
  }
  /** DmaClient 의 단절 확정 흉내 — 세대 +1 후 "down". */
  emitDown(reason = "test down"): void {
    this.gen += 1;
    this.emit("down", { reason, generation: this.gen });
  }
  /** 실 와이어 바이트를 `tryParseEnvelope` 로 읽어 프레임 이벤트로 낸다(hub.test FakeSession.pushFrame 방식). */
  emitFrame(bytes: Uint8Array, generation = this.gen): TransportFrameEvent {
    const parsed = tryParseEnvelope(Buffer.from(bytes));
    if (parsed === null) throw new Error("테스트 프레임 파싱 실패");
    const e: TransportFrameEvent = { ...parsed, generation };
    this.emit("frame", e);
    return e;
  }
}

// ============================================================
// 하네스
// ============================================================

type LogCall = { level: string; args: unknown[] };
let logs: LogCall[] = [];

beforeEach(async () => {
  resetDroppedEnvelopeCount();
  const { logger } = await import("../src/logger.js");
  logs = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
      logs.push({ level, args });
    }) as never);
  }
});

afterEach(() => {
  // L10 — 모든 케이스 공통: 비밀 · 호스트가 어떤 로그 인자에도 없다.
  const serialized = JSON.stringify(logs.map((c) => c.args));
  expect(serialized).not.toContain(SECRET);
  expect(serialized).not.toContain(HOST);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Rig = {
  feed: QuoteFeed;
  transport: FakeTransport;
  states: QuoteFeedState[];
  frames: TransportFrameEvent[];
  readies: number;
};

/** `secret` 키를 명시하면 그 값(undefined 포함)을 쓴다 — 기본 매개변수는 undefined 를 삼키므로 객체로 받는다. */
function rig(opts: { secret?: string | undefined } = {}): Rig {
  const secret = "secret" in opts ? opts.secret : SECRET;
  const transport = new FakeTransport();
  const feed = new QuoteFeed({ secret, host: HOST, port: 9999, transport });
  const r: Rig = { feed, transport, states: [], frames: [], readies: 0 };
  feed.on("state", (s: QuoteFeedState) => r.states.push(s));
  feed.on("frame", (e: TransportFrameEvent) => r.frames.push(e));
  feed.on("ready", () => {
    r.readies += 1;
  });
  return r;
}

function login(r: Rig, input: FakeObserverLoginRespInput = {}): void {
  r.transport.emitFrame(
    buildObserverLoginRespFrame({ success: true, role: QUOTE_ROLE, epoch: "", accounts: [], ...input }),
  );
}

function bootToReady(r: Rig): void {
  r.feed.start();
  r.transport.emitUp();
  login(r);
}

function loginRequests(t: FakeTransport) {
  return t.sent
    .map((p) => readObserverLoginRequest(MSG.ObserverLoginReq, Buffer.from(p)))
    .filter((x) => x !== null);
}

function errorLogArgs(message: string): unknown[] | undefined {
  return logs.find((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes(message)))?.args;
}

// ============================================================
// 테스트
// ============================================================

describe("QuoteFeed — 로그인 · ready · 프레임", () => {
  it("L1 up → 관찰자 로그인 1건 · role 1 · client gh-radar-relay/quote · since 0 · epoch '' · logging_in", () => {
    const r = rig();
    r.feed.start();
    expect(r.transport.count("connect")).toBe(1);
    r.transport.emitUp();

    const reqs = loginRequests(r.transport);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toEqual({
      secret: SECRET,
      sinceSeq: 0,
      epoch: "",
      client: "gh-radar-relay/quote",
      strategySinceSeq: 0,
      role: 1,
    });
    expect(QUOTE_CLIENT_NAME).toBe("gh-radar-relay/quote");
    expect(r.feed.state).toBe("logging_in");
    expect(r.feed.isReady).toBe(false);
  });

  it("L2 79(success · role 1) → ready · 'ready' 1회 · state connecting → logging_in → ready · 뒤이은 59 → frame 1회", () => {
    const r = rig();
    bootToReady(r);

    expect(r.feed.state).toBe("ready");
    expect(r.feed.isReady).toBe(true);
    expect(r.readies).toBe(1);
    expect(r.states).toEqual(["connecting", "logging_in", "ready"]);
    expect(r.transport.count("resetReconnectAttempts")).toBe(1);
    // 79 는 feed 가 스스로 소비한다 — hub 로 넘기지 않는다.
    expect(r.frames).toHaveLength(0);
    expect(r.feed.lastFrameAtMs).toBeNull();

    const e = r.transport.emitFrame(buildQuoteStateFrame({ snapshot: false }));
    expect(r.frames).toHaveLength(1);
    expect(r.frames[0]).toBe(e);
    expect(r.frames[0]?.msgType).toBe(MSG.QuoteUpdate);
    expect(typeof r.feed.lastFrameAtMs).toBe("number");

    // 78 도 그대로 넘긴다(무시 판단은 hub 몫 — Open Q2 RESOLVED).
    r.transport.emitFrame(buildRateCrossSnapshotFrame([]));
    expect(r.frames.map((f) => f.msgType)).toEqual([MSG.QuoteUpdate, MSG.RateCrossSnapshot]);
  });

  it("L3 ready 전에 온 59 는 frame 으로 내보내지 않는다 · 옛 세대 프레임도 버린다", () => {
    const r = rig();
    r.feed.start();
    r.transport.emitUp();
    r.transport.emitFrame(buildQuoteStateFrame({ snapshot: false }));
    expect(r.frames).toHaveLength(0);
    expect(r.feed.lastFrameAtMs).toBeNull();

    login(r);
    expect(r.feed.state).toBe("ready");
    // 옛 세대(gen 0) 프레임 — ready 여도 넘기지 않는다.
    r.transport.emitFrame(buildQuoteStateFrame({ snapshot: false }), r.transport.gen - 1);
    expect(r.frames).toHaveLength(0);
  });
});

describe("QuoteFeed — 정지 경로 (거부 · 역할 불일치)", () => {
  it("L4 79 success=false → rejected · stopReconnect 다음 destroy · 이후 down/up 에도 로그인 0", () => {
    const r = rig();
    r.feed.start();
    r.transport.emitUp();
    r.transport.emitFrame(buildObserverLoginRespFrame({ success: false, message: "거부", accounts: [] }));

    expect(r.feed.state).toBe("rejected");
    expect(r.feed.isReady).toBe(false);
    expect(r.readies).toBe(0);
    const iStop = r.transport.calls.indexOf("stopReconnect");
    const iDestroy = r.transport.calls.indexOf("destroy");
    expect(iStop).toBeGreaterThanOrEqual(0);
    expect(iDestroy).toBeGreaterThan(iStop);
    expect(r.transport.count("stopReconnect")).toBe(1);

    r.transport.emitDown();
    expect(r.feed.state).toBe("rejected");
    r.transport.emitUp();
    expect(loginRequests(r.transport)).toHaveLength(1);
    expect(r.feed.state).toBe("rejected");
  });

  it("L5 79 success ∧ role 0 (구 서버) → role_mismatch · 같은 순서 · error 로그에 role 0 · 이후 up 에도 로그인 0", () => {
    const r = rig();
    r.feed.start();
    r.transport.emitUp();
    login(r, { role: 0 });

    expect(r.feed.state).toBe("role_mismatch");
    expect(r.feed.isReady).toBe(false);
    expect(r.readies).toBe(0);
    const iStop = r.transport.calls.indexOf("stopReconnect");
    const iDestroy = r.transport.calls.indexOf("destroy");
    expect(iStop).toBeGreaterThanOrEqual(0);
    expect(iDestroy).toBeGreaterThan(iStop);
    expect(r.transport.count("resetReconnectAttempts")).toBe(0);

    const args = errorLogArgs("role_mismatch");
    expect(args).toBeDefined();
    expect(args?.[0]).toMatchObject({ role: 0 });

    r.transport.emitDown();
    expect(r.feed.state).toBe("role_mismatch");
    r.transport.emitUp();
    expect(loginRequests(r.transport)).toHaveLength(1);
    // 정지 뒤 온 프레임도 넘기지 않는다.
    r.transport.emitFrame(buildQuoteStateFrame({ snapshot: false }));
    expect(r.frames).toHaveLength(0);
  });
});

describe("QuoteFeed — 타임아웃 · 재접속 · 송신 · 끔", () => {
  it("L6 로그인 응답 없이 LOGIN_RESP_TIMEOUT_MS → dropTransport 1회 · connecting · down 뒤에도 connecting", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const r = rig();
    r.feed.start();
    r.transport.emitUp();

    await vi.advanceTimersByTimeAsync(LOGIN_RESP_TIMEOUT_MS - 1);
    expect(r.transport.drops).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.transport.count("dropTransport")).toBe(1);
    expect(r.feed.state).toBe("connecting");

    r.transport.emitDown();
    expect(r.feed.state).toBe("connecting");
    // 한 번만 끊는다 — 이후 시간이 흘러도 추가 drop 없음.
    await vi.advanceTimersByTimeAsync(LOGIN_RESP_TIMEOUT_MS * 2);
    expect(r.transport.count("dropTransport")).toBe(1);
  });

  it("L7 ready → down → up → 79 → reconnects 1 · ready 2회", () => {
    const r = rig();
    bootToReady(r);
    expect(r.feed.reconnects).toBe(0);

    r.transport.emitDown();
    expect(r.feed.state).toBe("connecting");
    expect(r.feed.isReady).toBe(false);
    r.transport.emitUp();
    expect(r.feed.state).toBe("logging_in");
    login(r);

    expect(r.feed.state).toBe("ready");
    expect(r.feed.reconnects).toBe(1);
    expect(r.readies).toBe(2);
    expect(loginRequests(r.transport)).toHaveLength(2);
  });

  it("L8 send — ready 면 전송에 1건 · true / ready 아니면 0건 · false", () => {
    const r = rig();
    r.feed.start();
    r.transport.emitUp();
    const before = r.transport.sent.length;
    expect(r.feed.send(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(r.transport.sent.length).toBe(before);

    login(r);
    const bytes = new Uint8Array([4, 5, 6]);
    expect(r.feed.send(bytes)).toBe(true);
    expect(r.transport.sent.length).toBe(before + 1);
    expect(r.transport.sent.at(-1)).toBe(bytes);
  });

  it("L9 비밀 없음(undefined · '') → disabled · connect 0 · up 이 와도 로그인 0", () => {
    for (const secret of [undefined, ""]) {
      const r = rig({ secret });
      r.feed.start();
      expect(r.feed.state).toBe("disabled");
      expect(r.transport.count("connect")).toBe(0);
      r.transport.emitUp();
      expect(r.transport.sent).toHaveLength(0);
      expect(r.feed.isReady).toBe(false);
    }
  });

  it("L10 stop → destroy · 이후 up/79 가 와도 상태 불변 · 중복 start 는 warn", () => {
    const r = rig();
    bootToReady(r);
    r.feed.start();
    expect(logs.some((c) => c.level === "warn" && c.args.some((a) => typeof a === "string" && a.includes("[QUOTE]")))).toBe(
      true,
    );

    r.feed.stop();
    expect(r.transport.count("destroy")).toBe(1);
    r.transport.emitUp();
    expect(loginRequests(r.transport)).toHaveLength(1);
    r.transport.emitFrame(buildQuoteStateFrame({ snapshot: false }));
    expect(r.frames).toHaveLength(0);
  });
});
