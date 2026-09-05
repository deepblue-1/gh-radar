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
    expect(manager.stats()).toEqual({ sessionCount: 2, readyCount: 2 });
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

    expect(manager.stats()).toEqual({ sessionCount: 0, readyCount: 0 });
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
    expect(Object.keys(stats).sort()).toEqual(["readyCount", "sessionCount"]);

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
});
