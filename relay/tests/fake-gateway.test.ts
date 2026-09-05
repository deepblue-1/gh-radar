/**
 * Phase 15 Plan 02 — RELAY-01. 테스트 헬퍼 스모크 (Wave 0 도구 검증).
 *
 * 후속 wave 전체가 이 두 헬퍼 위에 얹히므로, 헬퍼 자체가 동작하는지 여기서 먼저
 * 못박는다. 특히 **누수 없이 종료**되는지가 중요하다 — 소켓/서버가 하나라도 남으면
 * vitest 가 영원히 멈춘다.
 *
 * 하지 않는 것: relay 의 세션 상태기계·팬아웃을 시험하지 않는다(아직 없다).
 *              여기서는 헬퍼가 약속한 관측점만 확인한다.
 */
import net from "node:net";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebSocketServer } from "ws";

import { logger } from "../src/logger.js";
import { frame, FrameReader } from "../src/dma/codec.js";
import { MSG } from "../src/dma/msg-type.js";
import {
  buildLoginReq,
  buildLivePing,
  tryParseEnvelope,
  parseLoginResp,
  parseQuoteState,
  resetDroppedEnvelopeCount,
  droppedEnvelopeCount,
} from "../src/dma/envelope.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import { SAMPLE_ISIN, buildQuoteStateFrame } from "./helpers/frames.js";

/** 게이트웨이에 붙는 최소 클라이언트 — 프레임 단위로 수신을 관측한다. */
type TestClient = {
  sock: net.Socket;
  nextFrame(timeoutMs?: number): Promise<Buffer>;
  close(): void;
};

async function connectClient(port: number): Promise<TestClient> {
  const sock = net.connect(port, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    sock.once("connect", () => resolve());
    sock.once("error", reject);
  });
  sock.on("error", () => undefined);

  const reader = new FrameReader();
  const inbox: Buffer[] = [];
  const waiters: Array<(f: Buffer) => void> = [];

  sock.on("data", (chunk: Buffer) => {
    for (const payload of reader.push(chunk).frames) {
      const waiter = waiters.shift();
      if (waiter) waiter(payload);
      else inbox.push(payload);
    }
  });

  return {
    sock,
    nextFrame(timeoutMs = 1000) {
      const buffered = inbox.shift();
      if (buffered !== undefined) return Promise.resolve(buffered);
      return new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("프레임 대기 시간 초과")), timeoutMs);
        waiters.push((f) => {
          clearTimeout(timer);
          resolve(f);
        });
      });
    },
    close() {
      sock.destroy();
    },
  };
}

let gateway: FakeGateway | null = null;
let client: TestClient | null = null;

beforeEach(() => {
  resetDroppedEnvelopeCount();
  vi.spyOn(logger, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  client?.close();
  client = null;
  await gateway?.close();
  gateway = null;
  vi.restoreAllMocks();
});

describe("fake-gateway 헬퍼", () => {
  it("LoginReq 를 받고 LoginResp 를 돌려준다", async () => {
    gateway = await startFakeGateway();
    client = await connectClient(gateway.port);

    client.sock.write(frame(buildLoginReq("alex-radar", "pw", "KB")));
    const payload = await client.nextFrame();

    const parsed = tryParseEnvelope(payload);
    expect(parsed?.msgType).toBe(MSG.LoginResp);
    expect(parseLoginResp(parsed!.env)).toEqual({ success: true, message: "" });
  });

  it("respondLogin 으로 거부 응답을 지정할 수 있다", async () => {
    gateway = await startFakeGateway();
    gateway.respondLogin({ success: false, message: "허용되지 않은 사용자" });
    client = await connectClient(gateway.port);

    client.sock.write(frame(buildLoginReq("nobody", "pw", "KB")));
    const parsed = tryParseEnvelope(await client.nextFrame());

    expect(parseLoginResp(parsed!.env)).toEqual({
      success: false,
      message: "허용되지 않은 사용자",
    });
  });

  it("onFrame 으로 수신 프레임을 msgType 단위로 관찰한다", async () => {
    gateway = await startFakeGateway({ autoLogin: false });
    const seen: number[] = [];
    gateway.onFrame((msgType) => void seen.push(msgType));
    client = await connectClient(gateway.port);

    client.sock.write(frame(buildLoginReq("alex", "pw", "KB")));
    client.sock.write(frame(buildLivePing()));
    await vi.waitFor(() => expect(seen).toEqual([MSG.LoginReq, MSG.LivePing]));
  });

  it("receivedPings 가 LivePing 수신 횟수를 센다", async () => {
    gateway = await startFakeGateway();
    client = await connectClient(gateway.port);

    client.sock.write(frame(buildLivePing()));
    client.sock.write(frame(buildLivePing()));
    await vi.waitFor(() => expect(gateway!.receivedPings()).toBe(2));
  });

  it("sendRaw 로 청크 경계를 지정해도 프레임이 복원된다", async () => {
    gateway = await startFakeGateway();
    client = await connectClient(gateway.port);
    const sock = await gateway.waitForConnection();

    // 호가 프레임 하나를 **길이 헤더 한가운데**(2바이트)에서 쪼개 두 번에 나눠 보낸다.
    const full = frame(buildQuoteStateFrame({ isin: SAMPLE_ISIN }));
    gateway.sendRaw(sock, full.subarray(0, 2));
    gateway.sendRaw(sock, full.subarray(2));

    const parsed = tryParseEnvelope(await client.nextFrame());
    expect(parsed?.msgType).toBe(MSG.GetQuoteResp);
    expect(parseQuoteState(parsed!.env, true)?.i).toBe(SAMPLE_ISIN);
  });

  it("sendRaw 로 두 프레임을 한 청크에 붙여 보내도 분리된다", async () => {
    gateway = await startFakeGateway();
    client = await connectClient(gateway.port);
    const sock = await gateway.waitForConnection();

    gateway.sendRaw(
      sock,
      Buffer.concat([
        frame(buildQuoteStateFrame({ exchange: "KRX" })),
        frame(buildQuoteStateFrame({ exchange: "NXT" })),
      ]),
    );

    expect(parseQuoteState(tryParseEnvelope(await client.nextFrame())!.env, true)?.x).toBe("KRX");
    expect(parseQuoteState(tryParseEnvelope(await client.nextFrame())!.env, true)?.x).toBe("NXT");
  });

  it("pushQuote / pushTape 가 58 / 69 프레임을 주입한다", async () => {
    gateway = await startFakeGateway();
    client = await connectClient(gateway.port);
    const sock = await gateway.waitForConnection();

    gateway.pushQuote(sock, { exchange: "NXT" });
    gateway.pushTape(sock, { entries: [{}, {}, {}] });

    const quote = tryParseEnvelope(await client.nextFrame());
    expect(quote?.msgType).toBe(MSG.GetQuoteResp);
    expect(parseQuoteState(quote!.env, true)?.x).toBe("NXT");

    const tape = tryParseEnvelope(await client.nextFrame());
    expect(tape?.msgType).toBe(MSG.TradeTapeResp);
  });

  it("sendGarbage 는 드롭 경로를 태우고 연결은 유지된다", async () => {
    gateway = await startFakeGateway();
    client = await connectClient(gateway.port);
    const sock = await gateway.waitForConnection();

    gateway.sendGarbage(sock, "unknown-msg-type");
    expect(tryParseEnvelope(await client.nextFrame())).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);

    // 연결이 살아 있어 다음 정상 프레임은 그대로 온다 (D-31).
    gateway.pushQuote(sock);
    expect(tryParseEnvelope(await client.nextFrame())?.msgType).toBe(MSG.GetQuoteResp);
    expect(client.sock.destroyed).toBe(false);
  });

  it("hardClose 는 예고 없이 연결을 끊는다 (재접속 경로)", async () => {
    gateway = await startFakeGateway();
    client = await connectClient(gateway.port);
    const sock = await gateway.waitForConnection();

    const closed = new Promise<void>((resolve) => client!.sock.once("close", () => resolve()));
    gateway.hardClose(sock);

    await expect(closed).resolves.toBeUndefined();
  });

  it("close() 는 서버와 모든 연결을 정리한다", async () => {
    const gw = await startFakeGateway();
    const c = await connectClient(gw.port);
    await gw.waitForConnection();

    await gw.close();

    expect(gw.sockets).toHaveLength(0);
    await expect(connectClient(gw.port)).rejects.toThrow();
    c.close();
  });
});

describe("ws-client 헬퍼", () => {
  let wss: WebSocketServer | null = null;
  let ws: TestWs | null = null;

  afterEach(async () => {
    await ws?.close();
    ws = null;
    if (wss !== null) {
      const server = wss;
      wss = null;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("접속 → nextMessage → waitClose(4401) 를 관측한다", async () => {
    wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    wss.on("connection", (sock) => {
      sock.send(JSON.stringify({ t: "state", s: "ready" }));
      sock.on("message", () => sock.close(4401, "인증 시간 초과"));
    });
    await new Promise<void>((resolve) => wss!.once("listening", () => resolve()));
    const address = wss.address();
    if (address === null || typeof address === "string") throw new Error("포트 확인 불가");

    ws = await connectWs(address.port);
    const first = await ws.nextMessage();

    expect(first).toEqual({ t: "state", s: "ready" });
    expect(ws.bufferedAmount).toBe(0);

    ws.sendAuth("dummy-token");
    const info = await ws.waitClose();

    expect(info.code).toBe(4401);
    expect(info.reason).toBe("인증 시간 초과");
  });

  it("응답이 없으면 nextMessage 가 시간 초과로 실패한다", async () => {
    wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => wss!.once("listening", () => resolve()));
    const address = wss.address();
    if (address === null || typeof address === "string") throw new Error("포트 확인 불가");

    ws = await connectWs(address.port);

    await expect(ws.nextMessage(50)).rejects.toThrow(/시간 초과/);
  });
});
