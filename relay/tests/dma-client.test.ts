/**
 * Phase 15 Plan 03 — RELAY-01. `DmaClient` 통합 테스트 (가짜 게이트웨이 대상).
 *
 * 검증 대상은 **연결 수명 관리**다 — 30초 핑, 지수 백오프, 재접속 상한 10회,
 * desync 시 연결 재수립, NoDelay, 세대 교체 후 구세대 침묵.
 *
 * 타이머 규율: `setTimeout/setInterval` 만 가짜로 바꾸고 `setImmediate` 는 진짜로 둔다.
 * 소켓 I/O(연결 수립·accept·ECONNREFUSED·close)는 libuv 이벤트 루프에서 오므로, 가짜
 * 타이머를 진행시킨 뒤 실제 루프를 돌려야 결과가 관측된다. `setImmediate` 까지 가짜로
 * 바꾸면 그 통로가 막혀 테스트가 영원히 멈춘다.
 *
 * 대기 규율: **고정 횟수 flush 로 단정하지 않는다.** 몇 바퀴 만에 연결이 서는지는
 * 앞선 테스트가 남긴 부하에 따라 달라져(실측: 같은 파일에서 ③이 3회 중 2회 실패)
 * 간헐 실패의 원인이 된다. 조건이 설 때까지 폴링하는 `waitFor` 만 쓴다. "일어나지
 * 않음"을 단언할 때만 고정 flush 를 쓴다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import net from "node:net";

import {
  DmaClient,
  RECONNECT_ESCALATE_ATTEMPTS,
  PING_INTERVAL_MS,
  backoffDelayMs,
  type TransportDownEvent,
  type TransportFrameEvent,
  type TransportUpEvent,
} from "../src/dma/dma-client.js";
import { MSG } from "../src/dma/msg-type.js";
import { droppedEnvelopeCount, resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";

/** 실제 이벤트 루프를 n 바퀴 돌린다. 소켓 I/O 콜백이 여기서 소화된다. */
async function flushIo(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** 조건이 설 때까지 이벤트 루프를 돌린다. 서지 않으면 사유와 함께 실패한다. */
async function waitFor(predicate: () => boolean, label: string, turns = 200): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (predicate()) return;
    await flushIo(1);
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

/** 게이트웨이가 accept 한 첫 소켓. */
async function gatewaySocket(gw: FakeGateway): Promise<net.Socket> {
  await waitFor(() => gw.sockets.length > 0, "게이트웨이 accept");
  return gw.sockets[0] as net.Socket;
}

describe("DmaClient", () => {
  let gateway: FakeGateway;
  let client: DmaClient | null = null;

  beforeEach(async () => {
    // setImmediate 는 진짜로 남긴다 (파일 상단 규율 참조).
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    gateway = await startFakeGateway({ autoLogin: false });
  });

  afterEach(async () => {
    client?.destroy();
    client = null;
    await gateway.close();
    vi.useRealTimers();
  });

  function makeClient(port = gateway.port, autoReconnect = true): DmaClient {
    const c = new DmaClient({ host: "127.0.0.1", port, autoReconnect });
    client = c;
    return c;
  }

  it("① 연결이 서면 up 이벤트를 세대와 함께 올린다", async () => {
    const c = makeClient();
    const ups: TransportUpEvent[] = [];
    c.on("up", (e) => ups.push(e));

    c.connect();
    await waitFor(() => ups.length === 1, "up 이벤트");

    expect(ups[0]?.generation).toBe(1);
    expect(c.generation).toBe(1);
    expect(c.connected).toBe(true);

    await gatewaySocket(gateway); // 게이트웨이도 같은 연결을 accept 했다
    expect(gateway.sockets).toHaveLength(1);
  });

  it("② 30초마다 LivePing 을 보낸다 (Ready 여부와 무관)", async () => {
    const c = makeClient();
    c.connect();
    await gatewaySocket(gateway);
    expect(gateway.receivedPings()).toBe(0);

    vi.advanceTimersByTime(PING_INTERVAL_MS);
    await waitFor(() => gateway.receivedPings() === 1, "1회차 핑");

    vi.advanceTimersByTime(PING_INTERVAL_MS);
    await waitFor(() => gateway.receivedPings() === 2, "2회차 핑");
  });

  it("③ 게이트웨이가 강제 종료하면 백오프 뒤 재접속해 다시 up 이 된다", async () => {
    const c = makeClient();
    const ups: TransportUpEvent[] = [];
    const downs: TransportDownEvent[] = [];
    const reconnecting: number[] = [];
    c.on("up", (e) => ups.push(e));
    c.on("down", (e) => downs.push(e));
    c.on("reconnecting", (e) => reconnecting.push(e.attempt));

    c.connect();
    const first = await gatewaySocket(gateway);

    gateway.hardClose(first);
    await waitFor(() => downs.length === 1, "down 이벤트");

    expect(reconnecting).toEqual([1]);
    expect(c.connected).toBe(false);

    // 1회차 백오프는 1초다.
    vi.advanceTimersByTime(backoffDelayMs(1));
    await waitFor(() => ups.length === 2, "재접속 후 up");

    expect(c.connected).toBe(true);
    expect(c.reconnectAttempts).toBe(1);
    // 세대는 단조 증가한다 — 수립(+1)·단절(+1)·재수립(+1).
    expect(ups[1]?.generation).toBeGreaterThan(ups[0]?.generation ?? 0);
  });

  it("④ 재접속에 상한이 없다 — 30초 간격으로 계속 시도한다 (D-16 완화)", async () => {
    // 아무도 듣지 않는 포트를 만든다 — 게이트웨이를 띄운 뒤 닫아 포트만 회수한다.
    const dead = await startFakeGateway({ autoLogin: false });
    const deadPort = dead.port;
    await dead.close();

    const c = makeClient(deadPort);
    const attempts: number[] = [];
    c.on("reconnecting", (e) => attempts.push(e.attempt));

    c.connect();

    // 옛 상한(10회)을 **넘겨서** 돌린다 — 여기서 멈추면 VPN 이 돌아와도 relay 가 죽어 있다.
    const ROUNDS = RECONNECT_ESCALATE_ATTEMPTS + 5;
    for (let i = 1; i <= ROUNDS; i += 1) {
      await waitFor(() => attempts.length === i, `재접속 예약 ${i}회차`);
      vi.advanceTimersByTime(backoffDelayMs(i));
    }
    await waitFor(() => attempts.length === ROUNDS + 1, "상한 없이 다음 회차 예약");

    // 지연은 1→2→4→8→16→30 으로 오르고 그 뒤로는 30초 고정이다.
    expect(backoffDelayMs(6)).toBe(30_000);
    expect(backoffDelayMs(ROUNDS)).toBe(30_000);
    // 자동 재접속이 꺼지지 않는다 — 옛 구현은 상한 소진에서 이걸 false 로 내렸다.
    expect(c.autoReconnect).toBe(true);
    expect(c.reconnectAttempts).toBe(ROUNDS);
  });

  it("⑤ 쓰레기 프레임은 그 프레임만 버리고 연결을 유지한다", async () => {
    const c = makeClient();
    const frames: TransportFrameEvent[] = [];
    const downs: TransportDownEvent[] = [];
    c.on("frame", (e) => frames.push(e));
    c.on("down", (e) => downs.push(e));

    c.connect();
    const sock = await gatewaySocket(gateway);

    // 화이트리스트 밖 msg_type — 파서 단계 드롭.
    gateway.sendGarbage(sock, "unknown-msg-type");
    await waitFor(() => droppedEnvelopeCount() === 1, "파서 드롭 카운터");

    // 8바이트 미만 페이로드 — 코덱 단계 드롭.
    gateway.sendGarbage(sock, "too-small");
    await waitFor(() => c.droppedFrameCount === 1, "코덱 드롭 카운터");

    // 정상 프레임은 그대로 통과한다 — 드롭이 스트림을 오염시키지 않았다는 증거다.
    gateway.pushQuote(sock);
    await waitFor(() => frames.length === 1, "정상 프레임 수신");

    expect(frames.map((f) => f.msgType)).toEqual([MSG.GetQuoteResp]);
    expect(downs).toHaveLength(0);
    expect(c.connected).toBe(true);
  });

  it("⑥ 1MB 초과 길이 헤더(desync)는 드롭이 아니라 연결 재수립이다", async () => {
    const c = makeClient();
    const downs: TransportDownEvent[] = [];
    const ups: TransportUpEvent[] = [];
    c.on("down", (e) => downs.push(e));
    c.on("up", (e) => ups.push(e));

    c.connect();
    const sock = await gatewaySocket(gateway);

    // 2MB 를 선언하는 길이 헤더만 보낸다.
    const header = Buffer.alloc(4);
    header.writeUInt32LE(2 * 1024 * 1024, 0);
    gateway.sendRaw(sock, header);
    await waitFor(() => downs.length === 1, "desync 로 인한 down");

    expect(downs[0]?.reason).toContain("desync");
    expect(c.connected).toBe(false);

    // 재수립까지 확인 — 경계 유실이 영구 단절이 되면 안 된다.
    vi.advanceTimersByTime(backoffDelayMs(1));
    await waitFor(() => ups.length === 2, "desync 이후 재수립");
    expect(c.connected).toBe(true);
  });

  it("⑦ 소켓에 TCP_NODELAY 를 켠다", async () => {
    const spy = vi.spyOn(net.Socket.prototype, "setNoDelay");
    const c = makeClient();
    c.connect();
    await gatewaySocket(gateway);

    expect(spy).toHaveBeenCalledWith(true);
    spy.mockRestore();
  });

  it("⑧ destroy 이후 도착한 프레임은 아무것도 보고하지 않는다 (세대 교체)", async () => {
    const c = makeClient();
    const frames: TransportFrameEvent[] = [];
    const downs: TransportDownEvent[] = [];
    c.on("frame", (e) => frames.push(e));
    c.on("down", (e) => downs.push(e));

    c.connect();
    const sock = await gatewaySocket(gateway);

    const genBefore = c.generation;
    c.destroy();
    expect(c.generation).toBeGreaterThan(genBefore);

    gateway.pushQuote(sock);
    vi.advanceTimersByTime(60_000);
    await flushIo(10);

    expect(frames).toHaveLength(0);
    // 의도된 종료는 down 보고도 재접속 예약도 만들지 않는다.
    expect(downs).toHaveLength(0);
    expect(c.autoReconnect).toBe(false);
  });

  it("⑨ 연결이 없을 때의 send 는 조용히 성공하지 않는다", () => {
    const c = makeClient();
    expect(c.send(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(false);
    expect(c.failedSendCount).toBe(1);
  });

  it("⑩ stopReconnect 는 백오프 루프를 끊는다 (로그인 거부 경로)", async () => {
    const c = makeClient();
    const attempts: number[] = [];
    const downs: TransportDownEvent[] = [];
    c.on("reconnecting", (e) => attempts.push(e.attempt));
    c.on("down", (e) => downs.push(e));

    c.connect();
    const sock = await gatewaySocket(gateway);

    c.stopReconnect("로그인 거부");
    gateway.hardClose(sock);
    await waitFor(() => downs.length === 1, "down 이벤트");

    expect(attempts).toHaveLength(0);
    expect(c.autoReconnect).toBe(false);

    vi.advanceTimersByTime(5 * 60_000);
    await flushIo(10);
    expect(attempts).toHaveLength(0);
    expect(c.connected).toBe(false);
  });

  it("⑪ 백오프 지연은 1,2,4,8,16,30,30… 초다", () => {
    const delays = [1, 2, 3, 4, 5, 6, 7, 10].map((n) => backoffDelayMs(n));
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    // 방어적 입력도 1초로 수렴한다.
    expect(backoffDelayMs(0)).toBe(1000);
  });
});
