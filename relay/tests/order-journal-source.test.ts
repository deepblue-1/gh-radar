/**
 * Phase 29 Plan 22 → 29-42 — `OrderServerJournal`(브라우저 `journal.state` 원천 · healthz `journal`) · G-1 에서 「주문 서버 바뀜」
 * 표식 폐지 확인.
 *
 * 29-22 의 「주문 서버 바뀜」 상태 프레임(`{t:"order.server"}` — D-10 「재접속하면 적용」 배지)은 G-1 에서 없앴다. 주문 서버 변경
 * (계좌 지정 · 증권사 기본)은 29-36 의 즉시 재수립이 맡는다(사용자 확정 2026-10-10 「즉시 재접속」). 이 파일은 그 표식 테스트
 * (`order-server-notice.test.ts`)를 옮긴 것이다 — 표식 케이스(①~⑦)는 지우고, 같은 파일에 있던 journal 원천 케이스(⑧ · ⑧-b ·
 * ⑧-c)는 이름 · 단언 그대로 남긴다.
 *
 * 실 `WsFanout` · 실 `SessionManager`(`resolveTarget` = 아래 주문 서버 표) · 실 `SubscriptionHub` · TCP 로 붙는 스텁 게이트웨이
 * 2대(KB120 · KB121). 가짜는 Supabase 토큰 검증 · 자격증명 공급자뿐이다.
 *
 * 검증 대상:
 *   ⓪ (29-42 G-1) fanout 은 「주문 서버 바뀜」 프레임을 어떤 경로로도 보내지 않는다 — KB120 세션을 쥔 탭이 있는 채 KB 주문
 *      서버를 KB121 로 바꾸고(레지스트리 변경 진입점 `notifyOrderServers` 없음) 새 탭이 인증해도 두 탭 모두 `order.server` 0
 *   ⑧ `OrderServerJournal` — 브라우저 `journal.state` 원천 · healthz `journal` 이 현재 KB 주문 서버 파이프라인을 따라간다
 *      (전환 뒤 다음 프레임 · 다음 판정부터 새 서버 · 옛 서버 프레임은 흘리지 않는다 · 인증 스냅샷도 새 서버)
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EventEmitter } from "node:events";
import type { RelayJournalStateMsg, RelayOutbound, RelayStateMsg } from "@gh-radar/shared";

import { SessionManager, type DmaCredentials, type SessionTarget } from "../src/dma/session-manager.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { WsFanout } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import type { DmaBroker } from "../src/registry/registry.js";
import { OrderServerJournal, type OrderJournalStatusView } from "../src/registry/order-journal.js";
import type { JournalHealth } from "../src/journal/types.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";

const USER_A = "3f1c2b7a-9d40-4a11-8e55-0000000022a1";
const CREDS: DmaCredentials = { dmaUserId: "dma-d22", password: "pw-절대노출금지" };

async function flushIo(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function waitFor(predicate: () => boolean, label: string, turns = 400): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (predicate()) return;
    await flushIo(1);
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

function statesOf(inbox: RelayOutbound[]): RelayStateMsg[] {
  return inbox.filter((m): m is RelayStateMsg => m.t === "state");
}

/** 폐지된 「주문 서버 바뀜」 프레임 — 공유 타입은 29-39 가 지웠다(`RelayOutbound` 밖). 여기서는 `t` 글자로만 센다. */
function orderServerFramesOf(inbox: RelayOutbound[]): RelayOutbound[] {
  return inbox.filter((m) => (m.t as string) === "order.server");
}

function supabaseStub(): SupabaseClient {
  const users: Record<string, string> = { "token-a": USER_A };
  return {
    auth: {
      getUser: (token: string) =>
        Promise.resolve(
          users[token] !== undefined
            ? { data: { user: { id: users[token] } }, error: null }
            : { data: { user: null }, error: { message: "invalid JWT" } },
        ),
    },
  } as unknown as SupabaseClient;
}

describe("WsFanout — journal 원천 · 주문 서버 바뀜 표식 폐지 (29-22 → 29-42)", () => {
  let kb120: FakeGateway;
  let kb121: FakeGateway;
  let server: http.Server;
  let port: number;
  let hub: SubscriptionHub;
  let manager: SessionManager;
  let fanout: WsFanout;
  /** 레지스트리 흉내 — 증권사 → 지금 주문 서버(세션 생성 `resolveTarget` 의 원천). */
  let orderServers: Map<DmaBroker, SessionTarget>;
  let targets: Map<string, SessionTarget>;
  const sockets: TestWs[] = [];

  const orderServerOf = (broker: DmaBroker): string | undefined => orderServers.get(broker)?.serverKey;

  function switchOrderServer(broker: DmaBroker, serverKey: string): void {
    const t = targets.get(serverKey);
    if (t === undefined) throw new Error(`없는 서버 ${serverKey}`);
    orderServers.set(broker, t);
  }

  /**
   * `legacyOrderServerSource` — 29-22 까지 index 가 fanout 에 주던 「주문 서버 키 원천」(`orderServerOf`)을 그대로 넘긴다. G-1 에서
   * deps 가 사라졌으므로 타입 밖 값이다 — 줘도 표식이 0 이어야 한다(옛 결선이 남아도 배지가 되살아나지 않는다).
   */
  async function setup(
    opts: { legacyOrderServerSource?: boolean; journalState?: { frame(): RelayJournalStateMsg | null } } = {},
  ): Promise<void> {
    kb120 = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    kb121 = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    targets = new Map<string, SessionTarget>([
      ["KB120", { serverKey: "KB120", host: "127.0.0.1", port: kb120.port, broker: "KB" }],
      ["KB121", { serverKey: "KB121", host: "127.0.0.1", port: kb121.port, broker: "KB" }],
    ]);
    orderServers = new Map<DmaBroker, SessionTarget>();
    switchOrderServer("KB", "KB120");
    manager = new SessionManager({
      host: "127.0.0.1",
      port: 1,
      broker: "KB",
      resolveTarget: (b) => orderServers.get(b as DmaBroker),
    });
    hub = new SubscriptionHub();
    server = http.createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
    const legacy: object = opts.legacyOrderServerSource === true ? { orderServerOf } : {};
    fanout = new WsFanout({
      server,
      supabase: supabaseStub(),
      sessions: manager,
      hub,
      credKey: randomBytes(32).toString("base64"),
      credentials: (userId) => Promise.resolve(userId === USER_A ? CREDS : null),
      path: "/ws",
      ...legacy,
      ...(opts.journalState !== undefined ? { journalState: opts.journalState } : {}),
    });
  }

  async function tab(token = "token-a"): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const ws = await connectWs(port, "/ws");
    sockets.push(ws);
    const inbox: RelayOutbound[] = [];
    ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
    ws.sendAuth(token);
    await waitFor(() => statesOf(inbox).length > 0, "인증 상태 프레임");
    return { ws, inbox };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
  });

  afterEach(async () => {
    for (const ws of sockets.splice(0)) await ws.close();
    await fanout?.close();
    await manager?.closeAll();
    hub?.closeAll();
    await new Promise<void>((r) => server.close(() => r()));
    await kb120.close();
    await kb121.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("G-1 — 「주문 서버 바뀜」 표식 폐지 (29-42)", () => {
    it("⓪ KB120 세션 탭이 있는 채 KB 주문 서버 → KB121 · 새 탭 인증 → 두 탭 모두 order.server 0 · 레지스트리 변경 진입점 없음", async () => {
      await setup({ legacyOrderServerSource: true });
      const a = await tab();
      await waitFor(() => statesOf(a.inbox).some((f) => f.s === "ready"), "첫 탭 ready");

      switchOrderServer("KB", "KB121");
      const b = await tab();
      await waitFor(() => statesOf(b.inbox).some((f) => f.s === "ready"), "새 탭 ready");
      await flushIo(10);

      expect(orderServerFramesOf(a.inbox)).toEqual([]);
      expect(orderServerFramesOf(b.inbox)).toEqual([]);
      // 레지스트리 changed 처리기가 부르던 송신 진입점이 없다 — 주문 서버 변경은 29-36 즉시 재수립 몫.
      expect((fanout as unknown as Record<string, unknown>)["notifyOrderServers"]).toBeUndefined();
    });
  });

  describe("Task 2 — journal 원천 = 현재 KB 주문 서버 파이프라인 (OrderServerJournal)", () => {
    class StubStatus extends EventEmitter implements OrderJournalStatusView {
      constructor(
        public current: RelayJournalStateMsg | null,
        public state: JournalHealth["state"],
      ) {
        super();
      }
      frame(): RelayJournalStateMsg | null {
        return this.current;
      }
      health(): JournalHealth {
        return { state: this.state } as JournalHealth;
      }
      push(frame: RelayJournalStateMsg): void {
        this.current = frame;
        this.emit("frame", frame);
      }
    }

    function journalFixture() {
      const statuses = new Map<string, StubStatus>([
        ["KB120", new StubStatus({ t: "journal.state", s: "delayed", since: "2026-10-07T01:00:00.000Z" }, "rejected")],
        ["KB121", new StubStatus({ t: "journal.state", s: "live" }, "live")],
      ]);
      let kbKey = "KB120";
      const sent: RelayJournalStateMsg[] = [];
      const journal = new OrderServerJournal({ current: () => statuses.get(kbKey), onFrame: (f) => sent.push(f) });
      for (const st of statuses.values()) journal.watch(st);
      journal.refresh();
      sent.length = 0;
      return { statuses, sent, journal, switchTo: (key: string) => (kbKey = key) };
    }

    it("⑧ frame · health 는 현재 KB 주문 서버 — 전환 뒤 다음 판정부터 새 서버", () => {
      const { journal, switchTo } = journalFixture();
      expect(journal.frame()).toEqual({ t: "journal.state", s: "delayed", since: "2026-10-07T01:00:00.000Z" });
      expect(journal.health(0)?.state).toBe("rejected");
      switchTo("KB121");
      expect(journal.frame()).toEqual({ t: "journal.state", s: "live" });
      expect(journal.health(0)?.state).toBe("live");
      switchTo("KB999");
      expect(journal.frame()).toBeNull();
      expect(journal.health(0)).toBeUndefined();
    });

    it("⑧-b 상태 frame 은 현재 주문 서버 것만 흘린다 · refresh 가 전환 직후 새 서버 현재 프레임 1건", () => {
      const { statuses, sent, journal, switchTo } = journalFixture();
      statuses.get("KB121")!.push({ t: "journal.state", s: "delayed", since: "2026-10-07T01:05:00.000Z" });
      expect(sent).toEqual([]);
      statuses.get("KB120")!.push({ t: "journal.state", s: "live" });
      expect(sent).toEqual([{ t: "journal.state", s: "live" }]);

      switchTo("KB121");
      expect(journal.refresh()).toBe(true);
      expect(sent.at(-1)).toEqual({ t: "journal.state", s: "delayed", since: "2026-10-07T01:05:00.000Z" });
      expect(journal.refresh()).toBe(false);
      expect(sent).toHaveLength(2);

      statuses.get("KB120")!.push({ t: "journal.state", s: "delayed", since: "2026-10-07T01:06:00.000Z" });
      expect(sent).toHaveLength(2);
      statuses.get("KB121")!.push({ t: "journal.state", s: "live" });
      expect(sent.at(-1)).toEqual({ t: "journal.state", s: "live" });
    });

    it("⑧-c 브라우저 인증 스냅샷의 journal.state 도 현재 KB 주문 서버 것", async () => {
      const fx = journalFixture();
      await setup({ journalState: fx.journal });
      const a = await tab();
      await waitFor(() => a.inbox.some((m) => m.t === "journal.state"), "첫 탭 journal.state");
      expect(a.inbox.filter((m) => m.t === "journal.state")).toEqual([
        { t: "journal.state", s: "delayed", since: "2026-10-07T01:00:00.000Z" },
      ]);
      fx.switchTo("KB121");
      const b = await tab();
      await waitFor(() => b.inbox.some((m) => m.t === "journal.state"), "새 탭 journal.state");
      expect(b.inbox.filter((m) => m.t === "journal.state")).toEqual([{ t: "journal.state", s: "live" }]);
    });
  });
});
