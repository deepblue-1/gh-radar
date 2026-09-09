/**
 * Phase 15 Plan 03 — RELAY-01. `SessionManager` 통합 테스트.
 *
 * 검증 대상은 **세션 수명**이다 — 사용자당 세션 1개, 사용자 간 독립, 마지막 wss 종료
 * 5분 뒤 소멸, 유예 중 재연결 시 같은 세션 재사용, graceful shutdown, 통계 무식별자.
 *
 * 타이머·대기 규율은 `dma-client.test.ts` 와 같다 (setImmediate 는 진짜, 조건 폴링).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_GRACE_MS,
  STALE_SESSION_MS,
  SessionManager,
  type DmaCredentials,
} from "../src/dma/session-manager.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";

const CREDS: DmaCredentials = { dmaUserId: "dma-login-id", password: "p@ssw0rd-절대노출금지" };

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

describe("SessionManager", () => {
  let gateway: FakeGateway;
  let manager: SessionManager;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    manager = new SessionManager({ host: "127.0.0.1", port: gateway.port, broker: "KB" });
  });

  afterEach(async () => {
    await manager.closeAll();
    await gateway.close();
    vi.useRealTimers();
  });

  it("① 같은 userId 로 두 번 acquire 하면 세션 1개를 공유한다 (탭 여러 개)", async () => {
    const first = manager.acquire("user-1", CREDS);
    await waitFor(() => first.state === "ready", "첫 acquire ready");

    const second = manager.acquire("user-1", CREDS);
    await flushIo();

    expect(second).toBe(first);
    // TCP 연결은 1개뿐이다 — 탭이 늘어도 게이트웨이 세션은 늘지 않는다 (D-13).
    expect(gateway.sockets).toHaveLength(1);
    expect(manager.stats().sessionCount).toBe(1);
  });

  it("② 사용자가 다르면 세션이 서로 독립이다 (교차 없음)", async () => {
    const a = manager.acquire("user-a", CREDS);
    const b = manager.acquire("user-b", { dmaUserId: "other-id", password: "other-secret" });
    await waitFor(() => a.state === "ready" && b.state === "ready", "두 세션 ready");

    expect(a).not.toBe(b);
    expect(a.userId).toBe("user-a");
    expect(b.userId).toBe("user-b");
    expect(manager.stats()).toEqual({
      sessionCount: 2,
      readyCount: 2,
      everReadyCount: 2,
      stalledCount: 0,
    });
    await waitFor(() => gateway.sockets.length === 2, "게이트웨이 연결 2개");

    // 한쪽을 닫아도 다른 쪽은 살아 있다.
    manager.release("user-a");
    vi.advanceTimersByTime(SESSION_GRACE_MS);
    await waitFor(() => manager.get("user-a") === undefined, "user-a 소멸");
    expect(manager.get("user-b")).toBe(b);
    expect(b.state).toBe("ready");
  });

  it("③ 마지막 wss 가 끊겨도 5분 전에는 살아 있고, 5분이 지나면 종료된다", async () => {
    const s = manager.acquire("user-1", CREDS);
    await waitFor(() => s.state === "ready", "ready 진입");

    manager.release("user-1");

    vi.advanceTimersByTime(SESSION_GRACE_MS - 1000);
    await flushIo();
    expect(manager.get("user-1")).toBe(s);
    expect(gateway.sockets).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    await waitFor(() => manager.get("user-1") === undefined, "유예 만료 소멸");
    await waitFor(() => gateway.sockets.length === 0, "TCP 종료");
    expect(manager.stats().sessionCount).toBe(0);
  });

  it("④ 유예 중 재연결하면 타이머를 취소하고 같은 세션을 재사용한다", async () => {
    const first = manager.acquire("user-1", CREDS);
    await waitFor(() => first.state === "ready", "ready 진입");

    manager.release("user-1");
    vi.advanceTimersByTime(SESSION_GRACE_MS - 1000);
    await flushIo();

    // 새로고침 왕복이 유예 안에 들어왔다 — 재로그인이 일어나면 안 된다.
    const second = manager.acquire("user-1", CREDS);
    expect(second).toBe(first);
    expect(second.state).toBe("ready");

    // 취소된 타이머는 더 이상 발화하지 않는다.
    vi.advanceTimersByTime(SESSION_GRACE_MS * 2);
    await flushIo();
    expect(manager.get("user-1")).toBe(first);
    expect(gateway.sockets).toHaveLength(1);
  });

  it("⑤ closeAll 은 모든 세션과 예약된 유예 타이머를 정리한다", async () => {
    const a = manager.acquire("user-a", CREDS);
    const b = manager.acquire("user-b", CREDS);
    await waitFor(() => a.state === "ready" && b.state === "ready", "두 세션 ready");
    manager.release("user-b"); // 유예 타이머가 걸린 상태로 종료해 본다

    await manager.closeAll();
    await waitFor(() => gateway.sockets.length === 0, "전 연결 종료");

    expect(manager.stats()).toEqual({
      sessionCount: 0,
      readyCount: 0,
      everReadyCount: 0,
      stalledCount: 0,
    });
    expect(manager.get("user-a")).toBeUndefined();
    expect(manager.get("user-b")).toBeUndefined();

    // 남은 타이머가 없다 — 있으면 종료된 세션을 다시 만지려 든다.
    vi.advanceTimersByTime(SESSION_GRACE_MS * 2);
    await flushIo();
    expect(manager.stats().sessionCount).toBe(0);
  });

  it("⑥ stats 는 식별자를 담지 않는다 (계좌번호·DMA user_id·userId 전부 제외)", async () => {
    const s = manager.acquire("user-1", CREDS);
    await waitFor(() => s.state === "ready", "ready 진입");

    const stats = manager.stats();
    expect(Object.keys(stats).sort()).toEqual([
      "everReadyCount",
      "readyCount",
      "sessionCount",
      "stalledCount",
    ]);

    const dumped = JSON.stringify(stats);
    expect(dumped).not.toContain(CREDS.dmaUserId);
    expect(dumped).not.toContain(CREDS.password);
    expect(dumped).not.toContain("user-1");
  });

  it("⑦ 로그인 거부 세션은 재접속 때도 재로그인하지 않고 그대로 돌려준다", async () => {
    const rejecting = await startFakeGateway({
      autoLogin: true,
      loginResp: { success: false, message: "등록되지 않은 사용자" },
    });
    const mgr = new SessionManager({ host: "127.0.0.1", port: rejecting.port, broker: "KB" });

    const first = mgr.acquire("user-1", CREDS);
    await waitFor(() => first.state === "session_rejected", "session_rejected 확정");
    const loginFrames = rejecting.sockets.length;

    mgr.release("user-1");
    const second = mgr.acquire("user-1", CREDS);

    // 같은 죽은 세션을 돌려준다 — 새 TCP 로그인을 시도하지 않는다 (T-15-10).
    expect(second).toBe(first);
    expect(second.state).toBe("session_rejected");
    vi.advanceTimersByTime(SESSION_GRACE_MS * 2);
    await flushIo();
    expect(rejecting.sockets.length).toBeLessThanOrEqual(loginFrames);

    await mgr.closeAll();
    await rejecting.close();
  });

  it("⑧ 세션 없는 release 는 조용히 넘어가지 않고 경고만 남긴 뒤 무해하게 끝난다", () => {
    expect(() => manager.release("없는-사용자")).not.toThrow();
    expect(manager.stats().sessionCount).toBe(0);
  });

  it("⑨ everReadyCount 는 「한 번도 Ready 인 적 없는」 세션과 「Ready 였다가 죽은」 세션을 가른다", async () => {
    // (가) 로그인에 답하지 않는 게이트웨이 = 「게이트웨이가 애초에 없는 환경」의 재현.
    //      세션은 만들어지지만 영원히 Ready 가 되지 않는다 → everReadyCount 0.
    const silent = await startFakeGateway({ autoLogin: false });
    const mgr = new SessionManager({ host: "127.0.0.1", port: silent.port, broker: "KB" });
    const never = mgr.acquire("user-never", CREDS);
    await waitFor(() => silent.sockets.length === 1, "침묵 게이트웨이 연결");
    await flushIo();

    expect(never.isReady).toBe(false);
    expect(never.hasBeenReady).toBe(false);
    expect(mgr.stats()).toEqual({
      sessionCount: 1,
      readyCount: 0,
      everReadyCount: 0,
      stalledCount: 0,
    });

    await mgr.closeAll();
    await silent.close();

    // (나) Ready 에 도달한 뒤 전송이 끊긴 세션 = 「게이트웨이 장애」 → everReadyCount 1.
    const s = manager.acquire("user-1", CREDS);
    await waitFor(() => s.state === "ready", "ready 진입");
    expect(manager.stats()).toEqual({
      sessionCount: 1,
      readyCount: 1,
      everReadyCount: 1,
      stalledCount: 0,
    });

    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 연결이 없습니다");
    gateway.hardClose(sock);
    await waitFor(() => !s.isReady, "전송 단절 후 Ready 해제");

    // 래치다 — 죽어도 되돌아가지 않는다. `/healthz` 가 「부재」와 「장애」를 가르는
    // 유일한 근거이므로 되돌리는 경로를 만들면 진짜 장애 탐지가 함께 죽는다.
    expect(s.hasBeenReady).toBe(true);
    expect(manager.stats()).toEqual({
      sessionCount: 1,
      readyCount: 0,
      everReadyCount: 1,
      stalledCount: 0,
    });
  });

  it("⑩ stalledCount 는 생성 직후 0 이고 STALE_SESSION_MS 를 넘기면 1 이 된다 (16-30 / GC-WR-07)", async () => {
    // 로그인에 답하지 않는 게이트웨이 = 「게이트웨이 프로세스가 죽은」 상태. relay 가
    // 재시작한 뒤라 `hasBeenReady` 래치는 비어 있고, 남는 신호는 **경과 시간**뿐이다.
    const silent = await startFakeGateway({ autoLogin: false });
    // 벽시계를 주입한다 — 기존 fake timer 는 setTimeout 계열만 가짜라 Date.now 를 못 민다.
    let clock = 1_000_000;
    const mgr = new SessionManager({
      host: "127.0.0.1",
      port: silent.port,
      broker: "KB",
      now: () => clock,
    });
    try {
      mgr.acquire("user-never", CREDS);
      await waitFor(() => silent.sockets.length === 1, "침묵 게이트웨이 연결");
      await flushIo();

      // 부팅·로그인 왕복 구간이다. 여기서 degraded 를 내면 재배포마다 알림이 울린다.
      expect(mgr.stats()).toEqual({
        sessionCount: 1,
        readyCount: 0,
        everReadyCount: 0,
        stalledCount: 0,
      });

      // 경계 위(정확히 유예만큼 경과)는 아직 정상이다 — 판정은 초과에서만 뒤집힌다.
      clock += STALE_SESSION_MS;
      expect(mgr.stats().stalledCount).toBe(0);

      clock += 1;
      expect(mgr.stats()).toEqual({
        sessionCount: 1,
        readyCount: 0,
        everReadyCount: 0,
        stalledCount: 1,
      });
    } finally {
      await mgr.closeAll();
      await silent.close();
    }
  });

  it("⑩-b 자격증명이 거부된 세션은 유예를 한참 넘겨도 stalled 로 세지 않는다 (16-37 / R2-CR-02)", async () => {
    // 로그인을 **명시 거부**하는 게이트웨이 = 사용자가 DMA 비밀번호를 틀린 상태. 게이트웨이도
    // VPN 도 멀쩡하고, 답을 정상적으로 보내고 있다 — relay 의 장애가 아니다.
    const rejecting = await startFakeGateway({
      autoLogin: true,
      loginResp: { success: false, message: "등록되지 않은 사용자" },
    });
    let clock = 1_000_000;
    const mgr = new SessionManager({
      host: "127.0.0.1",
      port: rejecting.port,
      broker: "KB",
      now: () => clock,
    });
    try {
      const s = mgr.acquire("user-rejected", CREDS);
      await waitFor(() => s.state === "session_rejected", "session_rejected 확정");

      // **`release` 를 부르지 않는다.** 탭이 열려 있는 상태(refCount > 0)가 이 갭의 조건이다 —
      // `acquire` 는 거부 세션을 재생성하지 않고(T-15-10 / D-16), 참조계수가 0 이 아니라
      // 유예 소멸 타이머도 걸리지 않아 세션이 **무기한** 남는다. 사유를 보지 않는 카운터라면
      // 이 한 사람이 relay 전체를 영구 503 으로 만든다.
      clock += STALE_SESSION_MS * 10;

      // 옆 필드가 함께 뒤집히는 것을 놓치지 않도록 객체 전체로 단언한다.
      expect(mgr.stats()).toEqual({
        sessionCount: 1,
        readyCount: 0,
        everReadyCount: 0,
        stalledCount: 0,
      });
    } finally {
      await mgr.closeAll();
      await rejecting.close();
    }
  });

  it("⑩-c 거부 세션이 옆의 진짜 미Ready 세션을 가리지 않는다 — 제외는 세션 단위다 (16-37)", async () => {
    // 한 매니저(=한 게이트웨이) 안에 두 사유를 같이 만든다. 게이트웨이의 응답 방식을 두 번째
    // acquire 직전에 바꿔, 사용자 A 는 「거부」로 B 는 「무응답」으로 몰아넣는다.
    const gw = await startFakeGateway({
      autoLogin: true,
      loginResp: { success: false, message: "등록되지 않은 사용자" },
    });
    let clock = 1_000_000;
    const mgr = new SessionManager({
      host: "127.0.0.1",
      port: gw.port,
      broker: "KB",
      now: () => clock,
    });
    try {
      const rejected = mgr.acquire("user-rejected", CREDS);
      await waitFor(() => rejected.state === "session_rejected", "거부 세션 확정");

      // 이제부터는 LoginReq 를 받기만 하고 답하지 않는다 = 게이트웨이가 죽은 상태의 재현.
      gw.silenceLogin();
      const stalling = mgr.acquire("user-stalling", CREDS);
      await waitFor(() => stalling.state === "logging_in", "무응답 세션 로그인 대기 진입");

      clock += STALE_SESSION_MS * 10;

      // 거부 세션은 빠지고 무응답 세션만 남는다. 전역 플래그였다면 0 이 나온다.
      expect(mgr.stats()).toEqual({
        sessionCount: 2,
        readyCount: 0,
        everReadyCount: 0,
        stalledCount: 1,
      });
    } finally {
      await mgr.closeAll();
      await gw.close();
    }
  });

  it("⑪ Ready 를 한 번이라도 본 세션은 시간이 아무리 지나도 stalled 로 세지 않는다", async () => {
    let clock = 1_000_000;
    const mgr = new SessionManager({
      host: "127.0.0.1",
      port: gateway.port,
      broker: "KB",
      now: () => clock,
    });
    try {
      const s = mgr.acquire("user-1", CREDS);
      await waitFor(() => s.state === "ready", "ready 진입");

      clock += STALE_SESSION_MS * 10;
      expect(mgr.stats()).toEqual({
        sessionCount: 1,
        readyCount: 1,
        everReadyCount: 1,
        stalledCount: 0,
      });

      // 전송이 끊겨 Ready 가 풀려도 stalled 가 아니다 — 그 상태는 everReadyCount 가
      // 이미 degraded 로 잡는다(16-21). 한 사건을 두 카운터가 겹쳐 세면 안 된다.
      const sock = gateway.sockets[0];
      if (sock === undefined) throw new Error("게이트웨이 연결이 없습니다");
      gateway.hardClose(sock);
      await waitFor(() => !s.isReady, "전송 단절 후 Ready 해제");

      clock += STALE_SESSION_MS * 10;
      expect(mgr.stats()).toEqual({
        sessionCount: 1,
        readyCount: 0,
        everReadyCount: 1,
        stalledCount: 0,
      });
    } finally {
      await mgr.closeAll();
    }
  });
});
