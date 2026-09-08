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
import * as flatbuffers from "flatbuffers";

import { logger } from "../src/logger.js";
import { frame, FrameReader } from "../src/dma/codec.js";
import { MSG } from "../src/dma/msg-type.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
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
import {
  SAMPLE_ACCOUNTS,
  SAMPLE_ISIN,
  STRATEGY_MSG,
  buildBareEnvelope,
  buildQuoteStateFrame,
} from "./helpers/frames.js";

/**
 * Envelope 을 **화이트리스트 없이** 읽는다.
 *
 * `tryParseEnvelope` 를 쓰지 않는 이유: 그 함수의 `INBOUND_MSG_TYPES` 에는 전략 응답
 * (60·61·64·72·73)이 아직 없어 전부 드롭된다(16-04 소관). 여기서 검증하려는 것은
 * relay 의 수신 정책이 아니라 **스텁이 올바른 프레임을 내보냈는가**이므로 직접 읽는다.
 */
function rootEnvelope(payload: Buffer): Envelope {
  return Envelope.getRootAsEnvelope(
    new flatbuffers.ByteBuffer(new Uint8Array(payload.buffer, payload.byteOffset, payload.length)),
  );
}

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
    // 기본 응답은 허용 계좌 1건을 싣는다 — 계좌 0건은 세션 실패 경로라 기본값이 될 수 없다.
    expect(parseLoginResp(parsed!.env)).toEqual({
      success: true,
      message: "",
      accounts: SAMPLE_ACCOUNTS,
    });
  });

  it("respondLogin 으로 거부 응답을 지정할 수 있다", async () => {
    gateway = await startFakeGateway();
    gateway.respondLogin({ success: false, message: "허용되지 않은 사용자" });
    client = await connectClient(gateway.port);

    client.sock.write(frame(buildLoginReq("nobody", "pw", "KB")));
    const parsed = tryParseEnvelope(await client.nextFrame());

    // 거부 응답에는 계좌를 싣지 않는다 (17 D-19).
    expect(parseLoginResp(parsed!.env)).toEqual({
      success: false,
      message: "허용되지 않은 사용자",
      accounts: [],
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

/**
 * Phase 16 Plan 02 — 전략(상따/VI) 주입 표면.
 *
 * 잠그는 규칙 두 가지:
 *   ① **조회 3종(24·21·34)은 늘 답한다** — 등록 0건이어도 빈 응답을 보낸다(무응답 금지).
 *      침묵하면 relay 가 멎고, 그 증상은 "전략이 안 보인다"로 나타나 원인이 가려진다.
 *   ② **명령 4종(10·11·14·33)은 답하지 않고 기록만 한다** — 에코 타이밍을 테스트가 쥐어야
 *      "보냈다"와 "서버가 받아들였다"를 구분할 수 있다(거부 경로 재현).
 */
describe("fake-gateway 전략 표면", () => {
  it("24 요청에 64(상따 목록) 로 답한다 — 시드한 목록 그대로", async () => {
    gateway = await startFakeGateway();
    gateway.respondLimitChaserList([{ isin: SAMPLE_ISIN }, { isin: "KR7000660001" }]);
    client = await connectClient(gateway.port);

    client.sock.write(frame(buildBareEnvelope(STRATEGY_MSG.GetLimitChaserListReq)));
    const env = rootEnvelope(await client.nextFrame());

    expect(env.msgType()).toBe(STRATEGY_MSG.GetLimitChaserListResp);
    expect(env.limitChaserList()?.itemsLength()).toBe(2);
    expect(env.limitChaserList()?.items(1)?.isin()).toBe("KR7000660001");
  });

  it("24 요청은 시드가 없어도 길이 0 벡터로 답한다 (무응답 금지)", async () => {
    gateway = await startFakeGateway();
    client = await connectClient(gateway.port);

    client.sock.write(frame(buildBareEnvelope(STRATEGY_MSG.GetLimitChaserListReq)));
    const env = rootEnvelope(await client.nextFrame());

    expect(env.msgType()).toBe(STRATEGY_MSG.GetLimitChaserListResp);
    // 슬롯 자체는 존재하고 길이만 0 이다 — "아직 안 왔다"와 "없다"가 구분돼야 한다.
    expect(env.limitChaserList()).not.toBeNull();
    expect(env.limitChaserList()?.itemsLength()).toBe(0);
  });

  it("21 요청에 respondViTrigger(null) 이면 빈 61 이 나간다 (미등록)", async () => {
    gateway = await startFakeGateway();
    gateway.respondViTrigger(null);
    client = await connectClient(gateway.port);

    client.sock.write(frame(buildBareEnvelope(STRATEGY_MSG.GetVITriggerReq)));
    const env = rootEnvelope(await client.nextFrame());

    expect(env.msgType()).toBe(STRATEGY_MSG.SetVITriggerResp);
    // 테이블이 **없는** 것이 미등록의 표현이다. 값 0 인 테이블과 다르다.
    expect(env.setViTrigger()).toBeNull();
  });

  it("21 요청에 등록본을 시드하면 그 값이 61 로 나간다", async () => {
    gateway = await startFakeGateway();
    gateway.respondViTrigger({ run: true, orderAmountKrw: 3_000_000n, checkRate: 30 });
    client = await connectClient(gateway.port);

    client.sock.write(frame(buildBareEnvelope(STRATEGY_MSG.GetVITriggerReq)));
    const env = rootEnvelope(await client.nextFrame());

    expect(env.setViTrigger()?.run()).toBe(true);
    expect(env.setViTrigger()?.orderAmountKrw()).toBe(3_000_000n);
    expect(env.setViTrigger()?.checkRate()).toBe(30);
  });

  it("34 요청에 72(VI 주문 스냅샷) 로 답한다", async () => {
    gateway = await startFakeGateway();
    gateway.respondViOrderList([{ orderNo: "0000012345", state: "Accepted" }]);
    client = await connectClient(gateway.port);

    client.sock.write(frame(buildBareEnvelope(STRATEGY_MSG.GetVIOrderListReq)));
    const env = rootEnvelope(await client.nextFrame());

    expect(env.msgType()).toBe(STRATEGY_MSG.GetVIOrderListResp);
    expect(env.viOrderList()?.isSnapshot()).toBe(true);
    expect(env.viOrderList()?.itemsLength()).toBe(1);
    expect(env.viOrderList()?.items(0)?.state()).toBe("Accepted");
  });

  it("10 을 보내면 strategyRequests 에 msgType·페이로드가 기록된다", async () => {
    gateway = await startFakeGateway();
    client = await connectClient(gateway.port);

    const sent = buildBareEnvelope(STRATEGY_MSG.SetLimitChaserReq);
    client.sock.write(frame(sent));
    await vi.waitFor(() => expect(gateway!.strategyRequests()).toHaveLength(1));

    const [req] = gateway.strategyRequests();
    expect(req!.msgType).toBe(STRATEGY_MSG.SetLimitChaserReq);
    // 페이로드는 원본 바이트 사본이라 테스트가 직접 파싱할 수 있다.
    expect(Buffer.from(sent).equals(req!.payload)).toBe(true);
    expect(rootEnvelope(req!.payload).msgType()).toBe(STRATEGY_MSG.SetLimitChaserReq);
  });

  it("명령 4종만 기록하고 조회는 기록하지 않는다", async () => {
    gateway = await startFakeGateway();
    client = await connectClient(gateway.port);

    for (const t of [
      STRATEGY_MSG.SetLimitChaserReq,
      STRATEGY_MSG.SetVITriggerReq,
      STRATEGY_MSG.DisableStrategiesReq,
      STRATEGY_MSG.ConfirmVIOrderReq,
      STRATEGY_MSG.GetLimitChaserListReq,
      STRATEGY_MSG.GetVITriggerReq,
      STRATEGY_MSG.GetVIOrderListReq,
    ]) {
      client.sock.write(frame(buildBareEnvelope(t)));
    }

    await vi.waitFor(() =>
      expect(gateway!.strategyRequests().map((r) => r.msgType)).toEqual([
        STRATEGY_MSG.SetLimitChaserReq,
        STRATEGY_MSG.SetVITriggerReq,
        STRATEGY_MSG.DisableStrategiesReq,
        STRATEGY_MSG.ConfirmVIOrderReq,
      ]),
    );
  });

  it("pushLimitChaserEcho / pushViOrderList / pushOrderResp 가 60 / 73 / 51 을 주입한다", async () => {
    gateway = await startFakeGateway();
    client = await connectClient(gateway.port);
    const sock = await gateway.waitForConnection();

    gateway.pushLimitChaserEcho(sock, { buyEnabled: true, cancelQtyTrackBaseline: 42 });
    gateway.pushViOrderList(sock, [{ orderNo: "0000099999" }], false);
    gateway.pushOrderResp(sock, { orderNo: "0000012345", noticeType: "A" });

    const echo = rootEnvelope(await client.nextFrame());
    expect(echo.msgType()).toBe(STRATEGY_MSG.SetLimitChaserResp);
    expect(echo.setLimitChaser()?.buyEnabled()).toBe(true);
    // 16-01 재동기화로 생긴 45번째 슬롯이 실제로 왕복하는지 여기서 못박는다.
    expect(echo.setLimitChaser()?.cancelQtyTrackBaseline()).toBe(42);

    const push = rootEnvelope(await client.nextFrame());
    expect(push.msgType()).toBe(STRATEGY_MSG.VIOrderListPush);
    expect(push.viOrderList()?.isSnapshot()).toBe(false);
    expect(push.viOrderList()?.items(0)?.orderNo()).toBe("0000099999");

    const order = rootEnvelope(await client.nextFrame());
    expect(order.msgType()).toBe(MSG.OrderResp);
    expect(order.orderResp()?.orderNo()).toBe("0000012345");
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
