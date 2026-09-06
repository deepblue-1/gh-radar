/**
 * Phase 15 Plan 03 — RELAY-01. `DmaSession` 상태기계 통합 테스트.
 *
 * 검증 대상은 "운용 준비 판정"이다 — 부트 상태 시퀀스, 5초 응답 타임아웃, 로그인 거부
 * 시 재접속 루프 중단, 재접속 후 Ready 복귀, 상한 소진 승격, **비밀번호 미노출**.
 *
 * 타이머·대기 규율은 `dma-client.test.ts` 와 같다 (setImmediate 는 진짜, 조건 폴링).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspect } from "node:util";
import net from "node:net";

import type { RelayStateMsg } from "@gh-radar/shared";

import { DmaClient, RECONNECT_ESCALATE_ATTEMPTS, backoffDelayMs } from "../src/dma/dma-client.js";
import { DmaSession, LOGIN_RESP_TIMEOUT_MS } from "../src/dma/session.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { SAMPLE_ACCOUNTS } from "./helpers/frames.js";

/** 절대 로그·상태 프레임·직렬화에 나타나면 안 되는 값. */
const SECRET = "p@ssw0rd-절대노출금지";
const DMA_USER = "dma-login-id";

async function flushIo(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function waitFor(predicate: () => boolean, label: string, turns = 200): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (predicate()) return;
    await flushIo(1);
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

describe("DmaSession", () => {
  let gateway: FakeGateway;
  let session: DmaSession | null = null;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
  });

  afterEach(async () => {
    session?.close();
    session = null;
    await gateway.close();
    vi.useRealTimers();
  });

  /** 세션 1개 + 그 세션의 전송을 만든다. 상태 프레임을 순서대로 모아 돌려준다. */
  function makeSession(port = gateway.port): {
    session: DmaSession;
    client: DmaClient;
    states: RelayStateMsg[];
  } {
    const client = new DmaClient({ host: "127.0.0.1", port });
    const s = new DmaSession(
      { userId: "user-1", dmaUserId: DMA_USER, password: SECRET, broker: "KB" },
      client,
    );
    session = s;
    const states: RelayStateMsg[] = [];
    s.on("state", (frame) => states.push(frame));
    return { session: s, client, states };
  }

  it("① 정상 부트는 connecting → logging_in → declaring → ready 를 밟는다", async () => {
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    const { session: s, states } = makeSession();
    const readies: number[] = [];
    s.on("ready", (e) => readies.push(e.generation));

    s.start();
    await waitFor(() => s.state === "ready", "ready 진입");

    expect(states.map((f) => f.s)).toEqual(["connecting", "logging_in", "declaring", "ready"]);
    expect(s.isReady).toBe(true);
    // Ready 진입 이벤트는 재구독의 유일한 트리거다 — 정확히 1회 발화한다.
    expect(readies).toHaveLength(1);
  });

  it("② LoginResp 가 5초 안에 오지 않으면 failed 로 확정한다", async () => {
    gateway = await startFakeGateway({ autoLogin: false });
    const { session: s, client, states } = makeSession();

    s.start();
    await waitFor(() => s.state === "logging_in", "logging_in 진입");

    // 4.9초에는 아직 실패가 아니다 — 타임아웃 값이 실제로 5초임을 고정한다.
    vi.advanceTimersByTime(LOGIN_RESP_TIMEOUT_MS - 100);
    await flushIo();
    expect(s.state).toBe("logging_in");

    vi.advanceTimersByTime(100);
    await waitFor(() => s.state === "failed", "failed 확정");

    const last = states.at(-1);
    expect(last?.s).toBe("failed");
    expect(last?.msg).toContain("타임아웃");
    // 부트 실패는 자동 재접속으로 넘기지 않는다.
    expect(client.autoReconnect).toBe(false);
  });

  it("③ 로그인 거부는 재접속 루프를 끊고 session_rejected 로 확정한다", async () => {
    gateway = await startFakeGateway({
      autoLogin: true,
      loginResp: { success: false, message: "등록되지 않은 사용자" },
    });
    const { session: s, client, states } = makeSession();
    const stopSpy = vi.spyOn(client, "stopReconnect");
    const attempts: number[] = [];
    client.on("reconnecting", (e) => attempts.push(e.attempt));

    s.start();
    await waitFor(() => s.state === "session_rejected", "session_rejected 확정");

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(client.autoReconnect).toBe(false);
    // 거부 뒤에는 백오프가 한 번도 돌지 않는다 (T-15-10 — KB 계정 잠금 회피).
    vi.advanceTimersByTime(10 * 60_000);
    await flushIo();
    expect(attempts).toHaveLength(0);

    const last = states.at(-1);
    expect(last?.s).toBe("session_rejected");
    expect(last?.msg).toContain("등록되지 않은 사용자");
  });

  it("④ Ready 후 단절되면 재접속 → 재로그인 → 다시 ready 가 된다", async () => {
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    const { session: s, states } = makeSession();
    const readies: number[] = [];
    s.on("ready", (e) => readies.push(e.generation));

    s.start();
    await waitFor(() => s.state === "ready", "최초 ready");
    await waitFor(() => gateway.sockets.length > 0, "게이트웨이 accept");

    gateway.hardClose(gateway.sockets[0] as net.Socket);
    await waitFor(() => s.state === "reconnecting", "reconnecting 진입");

    const reconnectFrame = states.filter((f) => f.s === "reconnecting").at(-1);
    expect(reconnectFrame?.attempt).toBe(1);

    vi.advanceTimersByTime(backoffDelayMs(1));
    await waitFor(() => s.state === "ready", "재접속 후 ready 복귀");

    // 재구독 트리거가 재접속마다 다시 발화한다 (Pitfall 4).
    expect(readies).toHaveLength(2);
    expect(states.map((f) => f.s)).toEqual([
      "connecting",
      "logging_in",
      "declaring",
      "ready",
      "reconnecting",
      "logging_in",
      "declaring",
      "ready",
    ]);
  });

  it("⑤ 전송이 계속 실패해도 포기하지 않고 reconnecting 을 유지한다 (D-16 완화)", async () => {
    // 아무도 듣지 않는 포트 — 연결 자체가 서지 않는다.
    const dead = await startFakeGateway({ autoLogin: false });
    const deadPort = dead.port;
    await dead.close();
    gateway = await startFakeGateway({ autoLogin: false });

    const { session: s, client } = makeSession(deadPort);
    const attempts: number[] = [];
    client.on("reconnecting", (e) => attempts.push(e.attempt));

    s.start();
    const ROUNDS = RECONNECT_ESCALATE_ATTEMPTS + 5;
    for (let i = 1; i <= ROUNDS; i += 1) {
      await waitFor(() => attempts.length === i, `재접속 예약 ${i}회차`);
      vi.advanceTimersByTime(backoffDelayMs(i));
    }
    await waitFor(() => attempts.length === ROUNDS + 1, "상한 없이 다음 회차 예약");

    // 옛 구현은 여기서 manual_required 로 확정하고 멈췄다. 이제는 계속 재시도한다 —
    // VPN 이 5분 뒤에 돌아와도 relay 가 스스로 복구되어야 하기 때문이다.
    expect(s.state).toBe("reconnecting");
  });

  it("⑥ 비밀번호는 상태 프레임·직렬화·inspect 어디에도 나오지 않는다", async () => {
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    const { session: s, states } = makeSession();

    s.start();
    await waitFor(() => s.state === "ready", "ready 진입");
    // 단절·재접속 경로의 프레임까지 모은다.
    await waitFor(() => gateway.sockets.length > 0, "게이트웨이 accept");
    gateway.hardClose(gateway.sockets[0] as net.Socket);
    await waitFor(() => s.state === "reconnecting", "reconnecting 진입");

    const dumped = JSON.stringify(states);
    expect(dumped).not.toContain(SECRET);
    expect(dumped).not.toContain(DMA_USER);

    // 객체째 덤프해도 새지 않는다 (D-19 — pino redact 는 2차 방어일 뿐이다).
    expect(JSON.stringify(s)).not.toContain(SECRET);
    expect(JSON.stringify(s)).not.toContain(DMA_USER);
    expect(String(s)).not.toContain(SECRET);
    expect(inspect(s, { depth: 5 })).not.toContain(SECRET);
    expect(inspect(s, { depth: 5 })).not.toContain(DMA_USER);
    // 게터로도 꺼낼 수 없다.
    expect(Object.keys(s)).not.toContain("password");
  });

  it("⑦ 계좌 목록은 항상 배열이고 ready 에서는 대조된 목록이 실린다 (D-25 게이트 통과)", async () => {
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    const { session: s, states } = makeSession();

    s.start();
    await waitFor(() => s.state === "ready", "ready 진입");

    expect(Array.isArray(s.allowedAccounts)).toBe(true);
    // 축약 경로(항상 0건)는 사라졌다 — 서버가 준 목록이 대조를 통과해 그대로 실린다.
    expect(s.allowedAccounts).toEqual(SAMPLE_ACCOUNTS);
    // 모든 상태 프레임이 accounts 를 배열로 싣는다 — 브라우저가 undefined 분기를 만들지 않게.
    for (const frame of states) {
      expect(Array.isArray(frame.accounts)).toBe(true);
    }
    // 게터는 복사본을 준다 — 밖에서 밀어 넣어도 세션 내부가 오염되지 않는다 (T-15-01).
    s.allowedAccounts.push({ accountNo: "9999999999", name: "침입" });
    expect(s.allowedAccounts).toEqual(SAMPLE_ACCOUNTS);
    expect(s.isReady).toBe(true);
  });

  it("⑧ 운용 중 로그인 실패는 재접속 카운터를 리셋하지 않는다", async () => {
    // 첫 로그인은 성공시키고, 재접속 후에는 응답하지 않게 바꾼다.
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    const { session: s, client } = makeSession();

    s.start();
    await waitFor(() => s.state === "ready", "최초 ready");
    await waitFor(() => gateway.sockets.length > 0, "게이트웨이 accept");

    // 재접속 이후에는 LoginResp 를 주지 않는다 → 운용 중 5초 타임아웃 경로.
    gateway.silenceLogin();
    gateway.hardClose(gateway.sockets[0] as net.Socket);
    await waitFor(() => s.state === "reconnecting", "reconnecting 진입");

    vi.advanceTimersByTime(backoffDelayMs(1));
    await waitFor(() => s.state === "logging_in", "재로그인 시도");
    expect(client.reconnectAttempts).toBe(1);

    vi.advanceTimersByTime(LOGIN_RESP_TIMEOUT_MS);
    await waitFor(() => client.reconnectAttempts === 1 && s.state === "reconnecting", "재예약");

    // 운용 중 실패는 failed 로 확정하지 않고 백오프를 이어 간다. 카운터가 0 으로
    // 돌아가면 상한 10회가 무력화된다.
    expect(s.state).toBe("reconnecting");
    expect(client.autoReconnect).toBe(true);
    expect(client.reconnectAttempts).toBe(1);
  });

  it("⑨ session_rejected 에서는 수동 재접속이 열리지 않는다", async () => {
    gateway = await startFakeGateway({
      autoLogin: true,
      loginResp: { success: false, message: "브로커 불일치" },
    });
    const { session: s } = makeSession();

    s.start();
    await waitFor(() => s.state === "session_rejected", "session_rejected 확정");

    expect(s.manualReconnect()).toBe(false);
    expect(s.state).toBe("session_rejected");
  });
});
