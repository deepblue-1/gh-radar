/**
 * Phase 15 Plan 15 — RELAY-01. 계좌 선언 시퀀스 통합 테스트 (SC-5 전반부).
 *
 * 이 파일이 증명해야 하는 것은 하나다 — **`ready` 는 "서버가 우리 계좌를 전부 받았다"를
 * 확인한 뒤에만 선다**. 계좌 목록이 곧 주문 허용 화이트리스트가 되므로(T-15-01), 대조
 * 없이 Ready 로 가면 그 뒤의 모든 계좌 검증이 근거 없는 통과가 된다.
 *
 * 근거:
 *   17 D-11  선언은 추가 모드 하나뿐이다. 조회 왕복을 하지 않는다.
 *   17 D-12  계좌 0건은 세션 실패다. 재시도해도 결과가 같으므로 루프를 돌리지 않는다.
 *   17 D-13  서버 목록의 여분 계좌는 warn 만 하고 진행한다.
 *   C# A2    선언은 건별 대기 없이 연속 송신한다. 응답이 매번 목록 전체를 담기 때문이다.
 *   UI-SPEC D2  계좌번호는 화면에 전체, 로그에는 뒤 4자리 마스킹.
 *
 * 타이머·대기 규율은 `session.test.ts` 와 같다 — `setImmediate` 는 진짜로 두고
 * (`toFake` 화이트리스트), 상태 확인은 고정 flush 횟수가 아니라 조건 폴링으로 한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import net from "node:net";

import type { RelayStateMsg } from "@gh-radar/shared";

import { DmaClient, backoffDelayMs } from "../src/dma/dma-client.js";
import {
  ACCOUNT_RESP_TIMEOUT_MS,
  DmaSession,
  NO_ACCOUNTS_MESSAGE,
} from "../src/dma/session.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { logger } from "../src/logger.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import type { FakeAccount } from "./helpers/frames.js";

/** 선언 대상 2건. 뒤 4자리가 서로 달라 마스킹 검증이 우연히 통과하지 않는다. */
const ACC_A = "1234567801";
const ACC_B = "1234567802";
const TWO_ACCOUNTS: FakeAccount[] = [
  { accountNo: ACC_A, name: "위탁종합" },
  { accountNo: ACC_B, name: "연금저축" },
];

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

describe("계좌 선언 시퀀스", () => {
  let gateway: FakeGateway;
  let session: DmaSession | null = null;
  /** 전 레벨 로그 인자를 한 곳에 모은다 — 마스킹 검증은 레벨을 가리지 않는다. */
  let logged: unknown[] = [];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    logged = [];
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        logged.push(args);
        return undefined;
      });
    }
  });

  afterEach(async () => {
    session?.close();
    session = null;
    await gateway.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function makeSession(): { session: DmaSession; client: DmaClient; states: RelayStateMsg[] } {
    const client = new DmaClient({ host: "127.0.0.1", port: gateway.port });
    const s = new DmaSession(
      { userId: "user-1", dmaUserId: "dma-login-id", password: "pw-절대노출금지", broker: "KB" },
      client,
    );
    session = s;
    const states: RelayStateMsg[] = [];
    s.on("state", (frame) => states.push(frame));
    return { session: s, client, states };
  }

  it("① 계좌 2건은 응답을 기다리지 않고 연속 선언된다 (C# A2)", async () => {
    gateway = await startFakeGateway();
    gateway.respondLoginWithAccounts(TWO_ACCOUNTS);
    // 응답을 끊는다 — 건별 대기 구현이라면 1건만 도착하고 멈춘다.
    gateway.silenceAccountResp();
    const { session: s } = makeSession();

    s.start();
    await waitFor(() => gateway.declaredAccounts().length === 2, "선언 2건 도착");

    expect(gateway.declaredAccounts()).toEqual([
      { mode: "1", accountNo: ACC_A },
      { mode: "1", accountNo: ACC_B },
    ]);
    // 조회 왕복(mode 2)을 섞지 않는다 (17 D-11).
    expect(gateway.declaredAccounts().every((d) => d.mode === "1")).toBe(true);
    // 응답이 없으므로 아직 Ready 가 아니다 — 대조가 진짜 관문이라는 뜻이다.
    expect(s.state).toBe("declaring");
  });

  it("② 응답 목록이 선언 목록을 전부 포함하면 ready 로 간다", async () => {
    gateway = await startFakeGateway();
    gateway.respondLoginWithAccounts(TWO_ACCOUNTS);
    const { session: s, states } = makeSession();
    const readies: number[] = [];
    s.on("ready", (e) => readies.push(e.generation));

    s.start();
    await waitFor(() => s.state === "ready", "ready 진입");

    expect(states.map((f) => f.s)).toEqual(["connecting", "logging_in", "declaring", "ready"]);
    expect(s.allowedAccounts).toEqual([
      { accountNo: ACC_A, name: "위탁종합" },
      { accountNo: ACC_B, name: "연금저축" },
    ]);
    // 재구독 트리거는 대조를 통과한 뒤에만, 정확히 1회 발화한다.
    expect(readies).toHaveLength(1);
  });

  it("③ 응답에 1건이 빠지면 5초 뒤 실패하고 누락 계좌가 화면 문구에 실린다", async () => {
    gateway = await startFakeGateway();
    gateway.respondLoginWithAccounts(TWO_ACCOUNTS);
    // 서버가 A 만 등록했다 — B 는 users.toml 허용 목록 밖이라 조용히 무시된 상황 (17 D-13).
    gateway.respondUpdateAccountNo([ACC_A]);
    const { session: s, states } = makeSession();

    s.start();
    await waitFor(() => s.state === "declaring", "declaring 진입");
    await waitFor(() => gateway.declaredAccounts().length === 2, "선언 2건 도착");

    // 4.9초에는 아직 실패가 아니다 — 대기 상한이 실제로 5초임을 고정한다.
    vi.advanceTimersByTime(ACCOUNT_RESP_TIMEOUT_MS - 100);
    await flushIo();
    expect(s.state).toBe("declaring");

    vi.advanceTimersByTime(100);
    await waitFor(() => s.state === "failed", "대조 실패 확정");

    const last = states.at(-1);
    expect(last?.s).toBe("failed");
    expect(last?.msg).toContain("계좌 선언 미확인");
    // 어느 계좌가 걸렸는지 화면에서 알 수 있어야 users.toml 을 고칠 수 있다.
    expect(last?.msg).toContain(ACC_B);
    expect(last?.msg).not.toContain(ACC_A);
  });

  it("④ 계좌 0건은 재접속 없이 즉시 실패하고 원인을 그대로 알린다 (17 D-12)", async () => {
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    // 로그인은 성공하지만 허용 계좌가 없다 — users.toml 미등록 상태.
    gateway.respondLoginWithAccounts([]);
    const { session: s, client, states } = makeSession();
    const attempts: number[] = [];
    client.on("reconnecting", (e) => attempts.push(e.attempt));

    s.start();
    await waitFor(() => s.state === "session_rejected", "계좌 0건 실패 확정");

    const last = states.at(-1);
    expect(last?.msg).toBe(NO_ACCOUNTS_MESSAGE);
    expect(last?.accounts).toEqual([]);
    // 선언할 것이 없으므로 요청도 나가지 않는다.
    expect(gateway.declaredAccounts()).toHaveLength(0);
    // 재시도해도 결과가 같다 — 백오프를 한 번도 돌리지 않는다 (T-15-10).
    vi.advanceTimersByTime(10 * 60_000);
    await flushIo();
    expect(attempts).toHaveLength(0);
    expect(client.autoReconnect).toBe(false);
  });

  it("⑤ 서버 목록의 여분 계좌는 warn 만 남기고 ready 를 막지 않는다 (17 D-13)", async () => {
    gateway = await startFakeGateway();
    gateway.respondLoginWithAccounts(TWO_ACCOUNTS);
    // 같은 user_id 를 쓰는 다른 클라이언트가 남긴 계좌가 섞여 온 상황 (D-17 세션 합류).
    gateway.respondUpdateAccountNo([ACC_A, ACC_B, "9998887701"]);
    const { session: s } = makeSession();

    s.start();
    await waitFor(() => s.state === "ready", "ready 진입");

    // 여분 계좌는 우리 세션의 주문 대상이 아니다 — 목록에 섞이면 안 된다.
    expect(s.allowedAccounts.map((a) => a.accountNo)).toEqual([ACC_A, ACC_B]);
    const dumped = JSON.stringify(logged);
    expect(dumped).toContain("선언하지 않은 계좌가 서버 목록에 있다");
    expect(dumped).not.toContain("9998887701");
  });

  it("⑥ 재접속하면 재로그인 → 계좌 재선언을 다시 밟는다 (Pitfall 4)", async () => {
    gateway = await startFakeGateway();
    gateway.respondLoginWithAccounts(TWO_ACCOUNTS);
    const { session: s, states } = makeSession();
    const readies: number[] = [];
    s.on("ready", (e) => readies.push(e.generation));

    s.start();
    await waitFor(() => s.state === "ready", "최초 ready");
    await waitFor(() => gateway.sockets.length > 0, "게이트웨이 accept");
    expect(gateway.declaredAccounts()).toHaveLength(2);

    gateway.hardClose(gateway.sockets[0] as net.Socket);
    await waitFor(() => s.state === "reconnecting", "reconnecting 진입");

    vi.advanceTimersByTime(backoffDelayMs(1));
    await waitFor(() => s.state === "ready", "재접속 후 ready 복귀");

    // 재접속 경로가 선언을 건너뛰면 서버는 이 세션의 계좌를 모른 채로 주문을 받게 된다.
    expect(gateway.declaredAccounts()).toHaveLength(4);
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

  it("⑦ ready 상태 프레임에 계좌 목록이 전체 표기로 실린다 (주문 패널 원천, UI-SPEC D2)", async () => {
    gateway = await startFakeGateway();
    gateway.respondLoginWithAccounts(TWO_ACCOUNTS);
    const { session: s, states } = makeSession();

    s.start();
    await waitFor(() => s.state === "ready", "ready 진입");

    const readyFrame = states.find((f) => f.s === "ready");
    expect(readyFrame?.accounts).toEqual([
      { accountNo: ACC_A, name: "위탁종합" },
      { accountNo: ACC_B, name: "연금저축" },
    ]);
    // 화면은 마스킹하지 않는다 — 트레이더가 계좌를 고르려면 전체가 보여야 한다.
    expect(JSON.stringify(readyFrame)).toContain(ACC_A);
    expect(JSON.stringify(readyFrame)).not.toContain("****");
  });

  it("⑧ 로그에는 계좌번호 원문이 아니라 마스킹 값만 남는다 (T-15-15)", async () => {
    gateway = await startFakeGateway();
    gateway.respondLoginWithAccounts(TWO_ACCOUNTS);
    gateway.respondUpdateAccountNo([ACC_A]);
    const { session: s } = makeSession();

    s.start();
    await waitFor(() => s.state === "declaring", "declaring 진입");
    await waitFor(() => gateway.declaredAccounts().length === 2, "선언 2건 도착");
    vi.advanceTimersByTime(ACCOUNT_RESP_TIMEOUT_MS);
    await waitFor(() => s.state === "failed", "대조 실패 확정");

    const dumped = JSON.stringify(logged);
    // 실패 사유도 상태 전이 로그도 원문을 남기지 않는다.
    expect(dumped).not.toContain(ACC_A);
    expect(dumped).not.toContain(ACC_B);
    expect(dumped).toContain("123456****");
  });
});
