/**
 * Phase 29 Plan 03 — D-09 트레이서. 레지스트리 행 → `ServerPipelines` → 서버별 관찰자 연결 (스텁 게이트웨이 2대).
 *
 * 실 `ServerPipelines` + 실 `JournalObserver` · `JournalWriter` · `JournalAccess` · 실 코덱 · 실 `DmaClient` 이고, 가짜는
 * 게이트웨이 소켓 스텁(`startFakeGateway` 관찰자 모드)과 Supabase 스텁(`startSupabaseStub`) 둘뿐이다. 잠그는 것:
 *   ① 행 2개(KB · KYOBO) sync → 각 스텁이 role 0 관찰자 로그인 1건 · 비밀은 **증권사별**(KB/KYOBO) · 커서 키 = 레지스트리 키
 *   ② KYOBO enabled=false sync → KYOBO 연결 닫힘 · KB 그대로(재로그인 없음) · onRemoved
 *   ③ 주소(port) 변경 sync → 옛 연결 닫힘 + 새 주소로 재로그인(같은 키 · 같은 비밀)
 *   ④ 비밀 없는 증권사 → 그 파이프라인 observer disabled(소켓 0) · 다른 서버는 영향 없음
 *   ⑤ 79 broker 불일치(KYOBO 행에 "KB" 응답) → 그 관찰자만 rejected · error 로그 1(키 · 기대 · 받은 broker) · 재로그인 없음
 *      · "MOCK" · 빈 broker 는 통과
 *   ⑥ (29-08) 서버당 admin 연결(role 2) 정확히 1개 · 저널 관찰자와 별개 소켓 · 증권사별 비밀 · 접속마다 op 5 → 87 캐시 ·
 *      서버를 끄면 admin 연결도 stop · 비밀 없는 증권사는 admin 도 disabled
 *   ⑧ (29-50 GC-07) 주소(port) 변경 재생성 → 새 벌 매핑이 79 전부터 옛 매핑(잠정) · 라우팅 `serversFor` 전후 같음 ·
 *      새 주소 첫 79 가 잠정을 실제 매핑으로 교체 · 잠정 매핑은 DB 에 쓰지 않는다
 *
 * 29-08 부터 서버마다 소켓이 2개다(저널 관찰자 1 + admin 1) — 아래 「살아 있는 소켓 수」 단언은 둘을 합친 값이다.
 *
 * 규율: 주소는 127.0.0.1 만(D-27). 비밀은 테스트 더미이고 로그에 실리지 않는다(T-19-03).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOrderServerRouting } from "../src/access/account-order-servers.js";
import { logger } from "../src/logger.js";
import { ServerPipelines, type ServerPipeline } from "../src/registry/pipelines.js";
import type { DmaBroker, DmaServerRow } from "../src/registry/registry.js";
import { createRelaySupabase } from "../src/store/supabase.js";
import { defaultAdminHandler, startFakeGateway, type FakeAdminState, type FakeGateway } from "./helpers/fake-gateway.js";
import { startSupabaseStub, type SupabaseStub } from "./helpers/supabase-stub.js";

const KB_SECRET = "pipelines-kb-secret-DO-NOT-LOG";
const KYOBO_SECRET = "pipelines-kyobo-secret-DO-NOT-LOG";
const WAIT_MS = 5_000;

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
  vi.restoreAllMocks();
});

async function waitFor(predicate: () => boolean, label: string, timeoutMs = WAIT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 스텁별 admin users 표(29-08) — 유저 1명. */
function adminState(userId: string): FakeAdminState {
  return {
    usersRev: 1n,
    users: new Map([[userId, [{ accountNo: "1111111101", name: "위탁", priority: 1 }]]]),
    busyAccounts: new Set(),
  };
}

async function gatewayFor(broker: string): Promise<FakeGateway> {
  const gw = await startFakeGateway({ autoLogin: false, autoAccount: false });
  gw.respondObserverLogin({ broker, epoch: `ep-${broker}`, headSeq: 0, oldestSeq: 0, resync: true });
  // 29-08 — 같은 서버의 admin 연결(role 2)에도 답한다(같은 broker · 유저 1명 표).
  gw.respondAdminLogin({ broker });
  gw.onAdminCommand(defaultAdminHandler(adminState(`user-${broker}`)));
  cleanups.push(() => gw.close());
  return gw;
}

function row(key: string, broker: DmaBroker, port: number, extra: Partial<DmaServerRow> = {}): DmaServerRow {
  return {
    key,
    broker,
    host: "127.0.0.1",
    port,
    enabled: true,
    isOrderServer: true,
    isQuotePrimary: broker === "KB",
    sortOrder: broker === "KB" ? 0 : 1,
    ...extra,
  };
}

async function rig(secrets: Partial<Record<DmaBroker, string>> = { KB: KB_SECRET, KYOBO: KYOBO_SECRET }): Promise<{
  supabase: SupabaseStub;
  pipelines: ServerPipelines;
  created: string[];
  removed: string[];
}> {
  const supabase = await startSupabaseStub();
  cleanups.push(() => supabase.close());
  const created: string[] = [];
  const removed: string[] = [];
  const pipelines = new ServerPipelines({
    supabase: createRelaySupabase(supabase.url, "pipelines-test-service-role-key"),
    secretOf: (broker) => secrets[broker],
    onCreated: (p: ServerPipeline) => created.push(p.server.key),
    onRemoved: (p: ServerPipeline) => removed.push(p.server.key),
    drainTimeoutMs: 200,
  });
  cleanups.push(async () => {
    pipelines.stopAll();
    await pipelines.drainAll(200);
    pipelines.closeAll();
  });
  return { supabase, pipelines, created, removed };
}

const liveSockets = (gw: FakeGateway): number => gw.sockets.filter((s) => !s.destroyed).length;

describe("ServerPipelines — 레지스트리 행 → 서버별 관찰자 (Phase 29 D-09 트레이서)", () => {
  it("① 행 2개 sync → 스텁마다 role 0 로그인 1건 · 증권사별 비밀 · 커서 키 = 레지스트리 키 · live", async () => {
    const kb = await gatewayFor("KB");
    const kyobo = await gatewayFor("KYOBO");
    const { supabase, pipelines, created } = await rig();

    const result = pipelines.sync([row("KB", "KB", kb.port), row("KYOBO", "KYOBO", kyobo.port)]);
    expect(result).toEqual({ created: ["KB", "KYOBO"], removed: [] });
    expect(created).toEqual(["KB", "KYOBO"]);

    await waitFor(() => kb.observerLoginRequests().length === 1 && kyobo.observerLoginRequests().length === 1, "로그인 2건");
    expect(kb.observerLoginRequests()[0]).toMatchObject({ secret: KB_SECRET, role: 0, client: "gh-radar-relay" });
    expect(kyobo.observerLoginRequests()[0]).toMatchObject({ secret: KYOBO_SECRET, role: 0, client: "gh-radar-relay" });

    await waitFor(
      () => pipelines.get("KB")?.observer.state === "live" && pipelines.get("KYOBO")?.observer.state === "live",
      "두 관찰자 live",
    );
    const keys = supabase.requestsTo("/rest/v1/dma_journal_cursor").map((r) => r.query.gateway);
    expect([...new Set(keys)].sort()).toEqual(["eq.KB", "eq.KYOBO"]);
    expect(pipelines.all().map((p) => p.server.key)).toEqual(["KB", "KYOBO"]);
    expect(pipelines.get("KYOBO")?.observerEnabled).toBe(true);
  });

  it("② KYOBO enabled=false sync → KYOBO 연결 닫힘 · KB 그대로 · onRemoved", async () => {
    const kb = await gatewayFor("KB");
    const kyobo = await gatewayFor("KYOBO");
    const { pipelines, removed } = await rig();
    pipelines.sync([row("KB", "KB", kb.port), row("KYOBO", "KYOBO", kyobo.port)]);
    // 서버마다 저널 관찰자 1 + admin 1(29-08).
    await waitFor(() => liveSockets(kb) === 2 && liveSockets(kyobo) === 2, "두 서버 × (저널 + admin)");
    await waitFor(() => pipelines.get("KYOBO")?.observer.state === "live", "KYOBO live");
    const kbPipeline = pipelines.get("KB");

    const result = pipelines.sync([row("KB", "KB", kb.port), row("KYOBO", "KYOBO", kyobo.port, { enabled: false, isOrderServer: false })]);
    expect(result).toEqual({ created: [], removed: ["KYOBO"] });
    expect(pipelines.get("KYOBO")).toBeUndefined();
    await waitFor(() => liveSockets(kyobo) === 0, "KYOBO 연결 닫힘");
    await waitFor(() => removed.includes("KYOBO"), "onRemoved(KYOBO)");

    // KB 는 같은 벌 그대로 — 재로그인 없음 · 연결 유지.
    await sleep(300);
    expect(pipelines.get("KB")).toBe(kbPipeline);
    expect(kb.observerLoginRequests()).toHaveLength(1);
    expect(liveSockets(kb)).toBe(2);
    expect(kyobo.observerLoginRequests()).toHaveLength(1);
    expect(kb.adminLoginRequests()).toHaveLength(1);
  });

  it("③ 주소(port) 변경 sync → 옛 연결 닫힘 + 새 주소로 재로그인(같은 키 · 같은 비밀)", async () => {
    const kb = await gatewayFor("KB");
    const kyoboOld = await gatewayFor("KYOBO");
    const kyoboNew = await gatewayFor("KYOBO");
    const { pipelines, created, removed } = await rig();
    pipelines.sync([row("KB", "KB", kb.port), row("KYOBO", "KYOBO", kyoboOld.port)]);
    await waitFor(() => kyoboOld.observerLoginRequests().length === 1, "옛 주소 로그인");
    const oldPipeline = pipelines.get("KYOBO");

    const result = pipelines.sync([row("KB", "KB", kb.port), row("KYOBO", "KYOBO", kyoboNew.port)]);
    expect(result).toEqual({ created: ["KYOBO"], removed: ["KYOBO"] });
    expect(pipelines.get("KYOBO")).not.toBe(oldPipeline);
    await waitFor(() => liveSockets(kyoboOld) === 0, "옛 연결 닫힘");
    await waitFor(() => kyoboNew.observerLoginRequests().length === 1, "새 주소 로그인");
    expect(kyoboNew.observerLoginRequests()[0]).toMatchObject({ secret: KYOBO_SECRET, role: 0 });
    await waitFor(() => removed.includes("KYOBO"), "옛 벌 onRemoved");
    expect(created).toEqual(["KB", "KYOBO", "KYOBO"]);
    // KB 는 건드리지 않았다.
    expect(kb.observerLoginRequests()).toHaveLength(1);
    // 옛 주소로 재접속하지 않는다.
    await sleep(300);
    expect(kyoboOld.observerLoginRequests()).toHaveLength(1);
  });

  it("④ 비밀 없는 증권사(KYOBO) → 그 파이프라인 observer disabled · 소켓 0 · KB 는 정상", async () => {
    const kb = await gatewayFor("KB");
    const kyobo = await gatewayFor("KYOBO");
    const { pipelines } = await rig({ KB: KB_SECRET });
    pipelines.sync([row("KB", "KB", kb.port), row("KYOBO", "KYOBO", kyobo.port)]);
    await waitFor(() => kb.observerLoginRequests().length === 1, "KB 로그인");
    expect(pipelines.get("KYOBO")?.observer.state).toBe("disabled");
    expect(pipelines.get("KYOBO")?.observerEnabled).toBe(false);
    await sleep(300);
    expect(kyobo.sockets).toHaveLength(0);
    expect(kyobo.observerLoginRequests()).toEqual([]);
  });

  it("⑤ 79 broker 불일치(KYOBO 행 · \"KB\" 응답) → 그 관찰자만 rejected · error 로그 1 · 재로그인 없음 · MOCK 은 통과", async () => {
    const kb = await gatewayFor("KB");
    // KYOBO 행이 KB 서버를 가리키는 주소 오설정 흉내.
    const misrouted = await gatewayFor("KB");
    const mock = await gatewayFor("MOCK");
    const errors: unknown[][] = [];
    const origError = logger.error.bind(logger);
    vi.spyOn(logger, "error").mockImplementation(((...args: unknown[]) => {
      errors.push(args);
      return (origError as (...a: unknown[]) => void)(...args);
    }) as never);
    const { pipelines } = await rig();

    pipelines.sync([row("KB", "KB", kb.port), row("KYOBO", "KYOBO", misrouted.port)]);
    await waitFor(() => pipelines.get("KYOBO")?.observer.state === "rejected", "KYOBO rejected");
    await waitFor(() => pipelines.get("KB")?.observer.state === "live", "KB live");
    const mismatch = errors.filter((a) => typeof a[1] === "string" && a[1].includes("broker 불일치"));
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]?.[0]).toEqual({ gateway: "KYOBO", expectedBroker: "KYOBO", receivedBroker: "KB" });
    // 매핑 · 커서를 건드리기 전에 멈췄다 — 비밀은 어느 로그 인자에도 없다.
    expect(JSON.stringify(errors)).not.toContain(KYOBO_SECRET);
    // 거부와 같은 영구 정지 — 1.5초 기다려도 재로그인이 없다.
    await sleep(1_500);
    expect(misrouted.observerLoginRequests()).toHaveLength(1);
    expect(pipelines.get("KYOBO")?.observer.state).toBe("rejected");

    // 로컬 mock 게이트웨이("MOCK")는 대조를 통과한다.
    pipelines.sync([row("KB", "KB", kb.port), row("KYOBO", "KYOBO", mock.port)]);
    await waitFor(() => pipelines.get("KYOBO")?.observer.state === "live", "MOCK 응답 live");
  });

  it("⑥ (29-08) 서버당 admin 연결 정확히 1개 · 저널과 별개 소켓 · op 5 → 87 캐시 · 끄면 admin 도 stop", async () => {
    const kb = await gatewayFor("KB");
    const kyobo = await gatewayFor("KYOBO");
    const { pipelines } = await rig();
    pipelines.sync([row("KB120", "KB", kb.port), row("KYOBO119", "KYOBO", kyobo.port)]);

    await waitFor(
      () => pipelines.get("KB120")?.admin.state === "ready" && pipelines.get("KYOBO119")?.admin.state === "ready",
      "두 admin ready",
    );
    await waitFor(
      () => pipelines.get("KB120")?.admin.currentSnapshot() !== null && pipelines.get("KYOBO119")?.admin.currentSnapshot() !== null,
      "두 서버 스냅샷",
    );
    // 서버마다 admin 로그인 정확히 1건(D-23 ①) · 증권사별 비밀 · role 2 · admin client.
    expect(kb.adminLoginRequests()).toHaveLength(1);
    expect(kyobo.adminLoginRequests()).toHaveLength(1);
    expect(kb.adminLoginRequests()[0]).toMatchObject({ secret: KB_SECRET, role: 2, client: "gh-radar-relay/admin" });
    expect(kyobo.adminLoginRequests()[0]).toMatchObject({ secret: KYOBO_SECRET, role: 2, client: "gh-radar-relay/admin" });
    // 저널 관찰자 로그인과는 다른 소켓이다 — 저널 로그인도 각 1건, 살아 있는 소켓은 서버마다 2개.
    // 저널 로그인은 admin 과 독립으로 도착한다 — 병렬 부하에서 늦을 수 있어 도착을 기다린 뒤 "정확히 1건" 을 단언한다.
    await waitFor(
      () => kb.observerLoginRequests().length >= 1 && kyobo.observerLoginRequests().length >= 1,
      "두 서버 저널 로그인 도착",
    );
    expect(kb.observerLoginRequests()).toHaveLength(1);
    expect(kyobo.observerLoginRequests()).toHaveLength(1);
    const kbAdminSock = await kb.waitForAdminConnection();
    const kbJournalSock = await kb.waitForObserverConnection();
    expect(kbAdminSock).not.toBe(kbJournalSock);
    await waitFor(() => liveSockets(kb) === 2 && liveSockets(kyobo) === 2, "서버마다 소켓 2");
    // 서버별 캐시 — 섞이지 않는다.
    expect(pipelines.get("KB120")?.admin.currentSnapshot()?.users.map((u) => u.userId)).toEqual(["user-KB"]);
    expect(pipelines.get("KYOBO119")?.admin.currentSnapshot()?.users.map((u) => u.userId)).toEqual(["user-KYOBO"]);
    expect(pipelines.get("KB120")?.admin.serverKey).toBe("KB120");

    // KYOBO119 를 끄면 admin 연결도 stop — 두 소켓 다 닫힌다. KB120 admin 은 그대로(재로그인 없음).
    const kyoboAdmin = pipelines.get("KYOBO119")?.admin;
    pipelines.sync([row("KB120", "KB", kb.port), row("KYOBO119", "KYOBO", kyobo.port, { enabled: false })]);
    await waitFor(() => liveSockets(kyobo) === 0, "KYOBO 소켓 전부 닫힘");
    expect(kyoboAdmin?.currentSnapshot()).toBeNull();
    await sleep(300);
    expect(kyobo.adminLoginRequests()).toHaveLength(1);
    expect(kb.adminLoginRequests()).toHaveLength(1);
    expect(pipelines.get("KB120")?.admin.state).toBe("ready");
  });

  it("⑧ (29-50 GC-07) 주소 변경 재생성 → 새 벌 매핑이 79 전부터 옛 매핑(잠정) · serversFor 전후 같음 · 새 79 가 잠정을 교체", async () => {
    const D1 = "gc07-d1";
    const KB_ACC = "1111111101";
    const KYOBO_ACC = "9111111101";
    const KYOBO_ACC2 = "9111111102";
    const withAccounts = async (broker: string, accounts: { dmaUserId: string; accountNo: string }[]): Promise<FakeGateway> => {
      const gw = await startFakeGateway({ autoLogin: false, autoAccount: false });
      gw.respondObserverLogin({ broker, epoch: `ep-${broker}`, headSeq: 0, oldestSeq: 0, resync: true, accounts });
      gw.respondAdminLogin({ broker });
      gw.onAdminCommand(defaultAdminHandler(adminState(`user-${broker}`)));
      cleanups.push(() => gw.close());
      return gw;
    };
    const kb = await withAccounts("KB", [{ dmaUserId: D1, accountNo: KB_ACC }]);
    const kyoboOld = await withAccounts("KYOBO", [{ dmaUserId: D1, accountNo: KYOBO_ACC }]);
    // 새 주소는 다른 등록(계좌 2개)을 돌려준다 — 첫 79 가 잠정 매핑을 교체하는지 본다.
    const kyoboNew = await withAccounts("KYOBO", [
      { dmaUserId: D1, accountNo: KYOBO_ACC },
      { dmaUserId: D1, accountNo: KYOBO_ACC2 },
    ]);
    const { supabase, pipelines } = await rig();

    let rows = [row("KB120", "KB", kb.port), row("KYOBO119", "KYOBO", kyoboOld.port)];
    const routing = createOrderServerRouting({
      loaded: () => true,
      chosenOf: () => undefined,
      registry: {
        get: (key) => rows.find((r) => r.key === key),
        enabled: () => rows.filter((r) => r.enabled),
        orderServerOf: (broker) => rows.find((r) => r.broker === broker && r.isOrderServer && r.enabled),
      },
      accountsOf: (key, dma) => pipelines.get(key)?.access.accountsOf(dma),
      mappingLoaded: (key) => pipelines.get(key)?.access.loaded === true,
    });
    const serverKeys = (): string[] | undefined => routing.serversFor(D1)?.map((t) => t.serverKey);
    const syncCallsOf = (gateway: string): number =>
      supabase
        .requestsTo("/rest/v1/rpc/dma_journal_sync_access")
        .filter((r) => (r.body as { p_gateway?: string } | null)?.p_gateway === gateway).length;

    pipelines.sync(rows);
    await waitFor(
      () => pipelines.get("KB120")?.access.loaded === true && pipelines.get("KYOBO119")?.access.loaded === true,
      "두 서버 매핑 적재(79)",
    );
    await waitFor(() => syncCallsOf("KYOBO119") === 1, "옛 KYOBO119 매핑 DB 동기화 1");
    const before = serverKeys();
    expect(before).toEqual(["KB120", "KYOBO119"]);
    const oldPipeline = pipelines.get("KYOBO119");

    // 운영 레지스트리에서 KYOBO119 의 port 만 바꾼다 → 같은 키 재생성.
    rows = [row("KB120", "KB", kb.port), row("KYOBO119", "KYOBO", kyoboNew.port)];
    const result = pipelines.sync(rows);
    expect(result).toEqual({ created: ["KYOBO119"], removed: ["KYOBO119"] });
    const fresh = pipelines.get("KYOBO119");
    expect(fresh).not.toBe(oldPipeline);
    // 79 전(동기 직후) — 새 벌이 옛 매핑을 잠정으로 들고 있다.
    expect(fresh?.access.loaded).toBe(true);
    expect(fresh?.access.provisional).toBe(true);
    expect([...(fresh?.access.accountsOf(D1) ?? [])]).toEqual([KYOBO_ACC]);
    // 라우팅 결과(재수립 서명의 원천)가 재생성 전후 같다 — 그 서버 사용자를 1012 로 끊지 않는다.
    expect(serverKeys()).toEqual(before);

    // 새 주소의 첫 79 가 잠정을 실제 매핑으로 교체한다.
    await waitFor(() => fresh?.access.provisional === false, "새 79 수신 → 잠정 끝");
    expect([...(fresh?.access.accountsOf(D1) ?? [])].sort()).toEqual([KYOBO_ACC, KYOBO_ACC2]);
    expect(serverKeys()).toEqual(before);
    // DB 동기화는 실제 스냅샷만 — 옛 벌 1 + 새 79 1(잠정 매핑은 쓰지 않았다).
    await waitFor(() => syncCallsOf("KYOBO119") === 2, "새 79 매핑 DB 동기화");
    await sleep(200);
    expect(syncCallsOf("KYOBO119")).toBe(2);
    const lastSync = supabase
      .requestsTo("/rest/v1/rpc/dma_journal_sync_access")
      .filter((r) => (r.body as { p_gateway?: string } | null)?.p_gateway === "KYOBO119")
      .at(-1);
    expect(((lastSync?.body as { p_rows: { account_no: string }[] }).p_rows ?? []).map((r) => r.account_no).sort()).toEqual([
      KYOBO_ACC,
      KYOBO_ACC2,
    ]);
    // KB120 은 재생성 대상이 아니다 — 잠정 표식 없음.
    expect(pipelines.get("KB120")?.access.provisional).toBe(false);
  });

  it("⑧-b (29-50 GC-07) 끄기 · 행 제거로 내린 벌은 잠정 대상이 아니다 — 다시 켜면 빈 매핑(loaded 거짓)부터", async () => {
    const kb = await gatewayFor("KB");
    const kyobo = await gatewayFor("KYOBO");
    const { pipelines } = await rig();
    pipelines.sync([row("KB120", "KB", kb.port), row("KYOBO119", "KYOBO", kyobo.port)]);
    await waitFor(() => pipelines.get("KYOBO119")?.access.loaded === true, "KYOBO119 매핑 적재");

    pipelines.sync([row("KB120", "KB", kb.port), row("KYOBO119", "KYOBO", kyobo.port, { enabled: false })]);
    pipelines.sync([row("KB120", "KB", kb.port), row("KYOBO119", "KYOBO", kyobo.port)]);
    const again = pipelines.get("KYOBO119");
    expect(again?.access.loaded).toBe(false);
    expect(again?.access.provisional).toBe(false);
    expect(again?.access.size).toBe(0);
  });

  it("⑦ (29-08) 비밀 없는 증권사 → admin 연결도 disabled · 소켓 0", async () => {
    const kb = await gatewayFor("KB");
    const kyobo = await gatewayFor("KYOBO");
    const { pipelines } = await rig({ KB: KB_SECRET });
    pipelines.sync([row("KB", "KB", kb.port), row("KYOBO", "KYOBO", kyobo.port)]);
    await waitFor(() => kb.adminLoginRequests().length === 1, "KB admin 로그인");
    expect(pipelines.get("KYOBO")?.admin.state).toBe("disabled");
    expect(pipelines.get("KYOBO")?.admin.enabled).toBe(false);
    await sleep(300);
    expect(kyobo.sockets).toHaveLength(0);
    expect(kyobo.adminLoginRequests()).toEqual([]);
  });
});
