/**
 * Phase 19 Plan 10 — 실 relay 프로세스 부팅 종단 테스트 (tracer).
 *
 * `relay/node_modules/.bin/tsx src/index.ts` 를 **실제로 spawn** 해 부팅 결선을 증명한다 — 단위 테스트가 못 잡는
 * 곳(결선 누락 · 결선 순서 · 종료 순서)이다. 가짜는 게이트웨이 소켓 스텁(`startFakeGateway` 관찰자 모드)과
 * Supabase 스텁(`startSupabaseStub`) 둘뿐이고, 그 사이는 전부 실 코드다(config → 기록기 · 매핑 · 관찰자 ·
 * 상태 → fanout · `/healthz`).
 *
 * 경로(D-13): 부팅 → 커서 조회 → 관찰자 로그인(사용자 접속 없이) → 매핑 동기화 RPC → 저널 배치 → 적용 RPC →
 * `/healthz` journal.state live → SIGTERM 정상 종료(코드 0) · 출력에 비밀 문자열 없음(T-19-03).
 *
 * 규율: 실서버 주소 리터럴 금지(D-27) — `DMA_HOST=127.0.0.1` 을 명시한다. 포트는 전부 빈 포트다.
 * 각 케이스 뒤 프로세스 · 게이트웨이 · 스텁을 정리한다(남으면 vitest 가 매달린다).
 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { SAMPLE_ACCOUNT_NO } from "./helpers/frames.js";
import { startSupabaseStub, type SupabaseStub } from "./helpers/supabase-stub.js";

const RELAY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSX_BIN = path.join(RELAY_DIR, "node_modules", ".bin", "tsx");

const BOOT_SECRET = "boot-test-secret";
const GATEWAY = "KB";
const TEST_TIMEOUT_MS = 30_000;
const BOOT_WAIT_MS = 15_000;

type RelayProc = {
  child: ChildProcess;
  orderApiPort: number;
  output(): string;
  /** 종료 코드(시그널 종료면 null). 이미 내려갔으면 즉시. */
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) {
    await fn().catch(() => undefined);
  }
});

async function freePort(): Promise<number> {
  const srv = net.createServer();
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", () => resolve()));
  const { port } = srv.address() as net.AddressInfo;
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  return port;
}

async function spawnRelay(opts: {
  gatewayPort: number;
  supabaseUrl: string;
  nodeEnv: "test" | "production";
  secret: string | undefined;
  /** 추가 env (quick-260929-c8e — 추가 게이트웨이 관찰자). 상속 env 의 추가 관찰자 키는 먼저 지운다. */
  extraEnv?: Record<string, string>;
}): Promise<RelayProc> {
  const orderApiPort = await freePort();
  const wsPort = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: opts.nodeEnv,
    LOG_LEVEL: "info",
    APP_VERSION: "boot-test",
    SUPABASE_URL: opts.supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: "boot-test-service-role-key",
    DMA_CRED_KEY: Buffer.alloc(32).toString("base64"),
    RELAY_ORDER_SECRET: "boot-test-relay-order-secret",
    WS_PORT: String(wsPort),
    ORDER_API_PORT: String(orderApiPort),
    // ★ D-27 — 게이트웨이는 방금 띄운 로컬 스텁이다. 실서버 주소는 여기에 없다.
    DMA_HOST: "127.0.0.1",
    DMA_PORT: String(opts.gatewayPort),
    DMA_BROKER: GATEWAY,
    SESSION_GRACE_MS: "0",
  };
  delete env.DMA_OBSERVER_SECRET;
  if (opts.secret !== undefined) env.DMA_OBSERVER_SECRET = opts.secret;
  // 추가 관찰자 env 는 바깥 셸에서 상속되지 않게 지운 뒤, 케이스가 준 값만 덮는다.
  delete env.DMA_KYOBO_HOST;
  delete env.DMA_KYOBO_PORT;
  delete env.DMA_OBSERVER_SECRET_KYOBO;
  Object.assign(env, opts.extraEnv ?? {});

  const child = spawn(TSX_BIN, ["src/index.ts"], { cwd: RELAY_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const collect = (chunk: Buffer): void => {
    output += chunk.toString();
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

  cleanups.push(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  });
  return { child, orderApiPort, output: () => output, exited };
}

type Healthz = { status: number; body: Record<string, unknown> | null };

function getHealthz(port: number): Promise<Healthz> {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/healthz", timeout: 1_000 }, (res) => {
      let raw = "";
      res.on("data", (c: Buffer) => {
        raw += c.toString();
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) as Record<string, unknown> });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: null });
        }
      });
    });
    req.once("error", () => resolve({ status: 0, body: null }));
    req.once("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: null });
    });
  });
}

/** 조건이 설 때까지 폴링한다. 실패하면 relay 로그를 붙여 던진다. */
async function waitFor<T>(
  probe: () => Promise<T> | T,
  ok: (v: T) => boolean,
  label: string,
  relay: RelayProc,
  timeoutMs = BOOT_WAIT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await probe();
    if (ok(last)) return last;
    if (relay.child.exitCode !== null) break;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `조건이 서지 않았습니다: ${label}\n마지막 값: ${JSON.stringify(last)}\n--- relay 로그 ---\n${relay.output()}`,
  );
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string, relay: RelayProc): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} — ${ms}ms 초과\n--- relay 로그 ---\n${relay.output()}`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function rig(): Promise<{ gateway: FakeGateway; supabase: SupabaseStub }> {
  const gateway = await startFakeGateway();
  cleanups.push(() => gateway.close());
  const supabase = await startSupabaseStub();
  cleanups.push(() => supabase.close());
  return { gateway, supabase };
}

const journalOf = (h: Healthz): Record<string, unknown> | undefined =>
  (h.body?.journal as Record<string, unknown> | undefined) ?? undefined;

describe("relay 부팅 결선 — 실 프로세스 · 관찰자 경로 (Phase 19 D-13 tracer)", () => {
  it(
    "부팅 → 커서 조회 → 관찰자 로그인 → 매핑 RPC → 배치 → 적용 RPC → healthz live → SIGTERM 0 · 비밀 부재",
    async () => {
      const { gateway, supabase } = await rig();
      // 게이트웨이는 관찰자 로그인에 곧바로 답한다(계좌 2행 · 새 epoch · head 1).
      gateway.respondObserverLogin({
        epoch: "ep-boot",
        headSeq: 1,
        oldestSeq: 1,
        resync: true,
        accounts: [
          { dmaUserId: "dma-user-1", accountNo: SAMPLE_ACCOUNT_NO, name: "위탁종합", priority: 0 },
          { dmaUserId: "dma-user-2", accountNo: "1234567802", name: "위탁종합2", priority: 1 },
        ],
      });

      const relay = await spawnRelay({
        gatewayPort: gateway.port,
        supabaseUrl: supabase.url,
        nodeEnv: "test",
        secret: BOOT_SECRET,
      });

      // ① healthz 200 — 사용자 접속 없이 뜬다.
      await waitFor(() => getHealthz(relay.orderApiPort), (h) => h.status === 200, "healthz 200", relay);

      // ② 커서 조회 1회(gateway=eq.KB) → 관찰자 로그인(secret 일치 · since 0 · epoch "").
      const sock = await withTimeout(gateway.waitForObserverConnection(BOOT_WAIT_MS), BOOT_WAIT_MS + 1_000, "관찰자 연결", relay);
      // 두 기록기(주문 · 전략 — Phase 25)가 같은 커서 행을 각자 칸으로 읽는다.
      const cursorReads = supabase.requestsTo("/rest/v1/dma_journal_cursor");
      expect(cursorReads).toHaveLength(2);
      for (const r of cursorReads) {
        expect(r.method).toBe("GET");
        expect(r.query.gateway).toBe(`eq.${GATEWAY}`);
      }
      expect(cursorReads.map((r) => r.query.select).sort()).toEqual([
        "journal_epoch,last_seq",
        "strategy_journal_epoch,strategy_last_seq",
      ]);
      expect(gateway.observerLoginRequests()).toEqual([
        { secret: BOOT_SECRET, sinceSeq: 0, epoch: "", client: "gh-radar-relay", strategySinceSeq: 0, role: 0 },
      ]);

      // ③ 로그인 응답(계좌 2행) → 매핑 동기화 RPC(p_gateway KB · p_rows 2).
      const sync = await waitFor(
        () => supabase.requestsTo("/rest/v1/rpc/dma_journal_sync_access"),
        (rs) => rs.length >= 1,
        "dma_journal_sync_access 수신",
        relay,
      );
      const syncBody = sync[0]?.body as { p_gateway: string; p_rows: unknown[] };
      expect(sync[0]?.method).toBe("POST");
      expect(syncBody.p_gateway).toBe(GATEWAY);
      expect(syncBody.p_rows).toHaveLength(2);

      // ④ 배치 [seq 1] caughtUp → 적용 RPC(p_events[0].seq 1) → healthz journal live · lastSeq 1.
      gateway.pushJournalBatch(sock, { records: [{ seq: 1 }], headSeq: 1, caughtUp: true });
      const applies = await waitFor(
        () => supabase.requestsTo("/rest/v1/rpc/dma_journal_apply"),
        (rs) => rs.length >= 1,
        "dma_journal_apply 수신",
        relay,
      );
      const applyBody = applies[0]?.body as { p_gateway: string; p_epoch: string; p_events: Array<{ seq: number }> };
      expect(applyBody.p_gateway).toBe(GATEWAY);
      expect(applyBody.p_epoch).toBe("ep-boot");
      expect(applyBody.p_events[0]?.seq).toBe(1);

      const live = await waitFor(
        () => getHealthz(relay.orderApiPort),
        (h) => journalOf(h)?.state === "live" && journalOf(h)?.lastSeq === 1,
        "healthz journal.state live · lastSeq 1",
        relay,
      );
      expect(live.status).toBe(200);
      expect(supabase.unknownRequests()).toEqual([]);

      // ⑤ SIGTERM → 5초 안에 코드 0. 종료 로그가 순서대로 남는다.
      relay.child.kill("SIGTERM");
      const exit = await withTimeout(relay.exited, 5_000, "SIGTERM 종료", relay);
      expect(exit, relay.output()).toEqual({ code: 0, signal: null });
      const out = relay.output();
      // 종료 순서(D-13): 사용자 세션 정리 → 관찰자 stop → (drain) → 완료.
      const iSessions = out.indexOf("[DMA] 전 세션 종료 완료");
      const iObserver = out.indexOf("[JOURNAL] 관찰자 종료");
      const iDone = out.indexOf("[relay] 종료 절차 완료");
      expect(iSessions, out).toBeGreaterThan(-1);
      expect(iObserver).toBeGreaterThan(iSessions);
      expect(iDone).toBeGreaterThan(iObserver);
      expect(out).not.toContain("기록기 drain 미완");
      // 부팅 로그는 관찰자 여부만 싣는다.
      expect(out).toContain('"journalObserver":"enabled"');
      // T-19-03 — 비밀 문자열은 어느 출력에도 없다.
      expect(out).not.toContain(BOOT_SECRET);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "seq 역행(같은 epoch · head 7 < 커서 10 · resync) → 커서 유지 · 11 적용 · healthz seqRegressions 1 · 200",
    async () => {
      const { gateway, supabase } = await rig();
      supabase.seedCursor({ journal_epoch: "ep-boot", last_seq: 10 });
      gateway.respondObserverLogin({ epoch: "ep-boot", headSeq: 7, oldestSeq: 1, resync: true });

      const relay = await spawnRelay({
        gatewayPort: gateway.port,
        supabaseUrl: supabase.url,
        nodeEnv: "test",
        secret: BOOT_SECRET,
      });
      const sock = await withTimeout(gateway.waitForObserverConnection(BOOT_WAIT_MS), BOOT_WAIT_MS + 1_000, "관찰자 연결", relay);
      expect(gateway.observerLoginRequests()[0]).toMatchObject({ sinceSeq: 10, epoch: "ep-boot" });

      const h = await waitFor(
        () => getHealthz(relay.orderApiPort),
        (x) => journalOf(x)?.state === "live" && journalOf(x)?.seqRegressions === 1,
        "healthz journal live · seqRegressions 1",
        relay,
      );
      // 역행 신호만으로는 503 이 아니다(스트림은 정상).
      expect(h.status).toBe(200);
      expect(typeof journalOf(h)?.lastSeqRegressionAgeSec).toBe("number");

      // 게이트웨이가 since+1 부터 보내면 갭 없이 적용된다(lastReceivedSeq 를 되돌리지 않았다).
      gateway.pushJournalBatch(sock, { records: [{ seq: 11 }], headSeq: 11, caughtUp: true });
      const applies = await waitFor(
        () => supabase.requestsTo("/rest/v1/rpc/dma_journal_apply"),
        (rs) => rs.length >= 1,
        "dma_journal_apply 수신",
        relay,
      );
      const body = applies[0]?.body as { p_epoch: string; p_events: Array<{ seq: number }> };
      expect(body.p_epoch).toBe("ep-boot");
      expect(body.p_events.map((e) => e.seq)).toEqual([11]);
      // 재접속(갭 끊기)이 없었다 — 관찰자 로그인은 처음 1건뿐.
      expect(gateway.observerLoginRequests()).toHaveLength(1);
      expect(relay.output()).toContain("저널 seq 역행");

      relay.child.kill("SIGTERM");
      const exit = await withTimeout(relay.exited, 5_000, "SIGTERM 종료", relay);
      expect(exit, relay.output()).toEqual({ code: 0, signal: null });
      expect(relay.output()).not.toContain(BOOT_SECRET);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "전략 이벤트 적용 결선 (Phase 25) — 전략 커서 없음 → 로그인 strategySinceSeq 0 → 80 전략 BuyOrder 1건 → dma_strategy_apply(KB) → healthz journal.strategy.lastSeq 1",
    async () => {
      const { gateway, supabase } = await rig();
      // 주문 스트림만 적용된 커서 행 — 전략 칸은 NULL(원격 마이그레이션 직후 모양).
      supabase.seedCursor({ journal_epoch: "ep-b", last_seq: 0, strategy_journal_epoch: null, strategy_last_seq: 0 });
      gateway.respondObserverLogin({ epoch: "ep-b", headSeq: 0, oldestSeq: 0, resync: false, strategyHeadSeq: 0 });

      const relay = await spawnRelay({
        gatewayPort: gateway.port,
        supabaseUrl: supabase.url,
        nodeEnv: "test",
        secret: BOOT_SECRET,
      });
      const sock = await withTimeout(gateway.waitForObserverConnection(BOOT_WAIT_MS), BOOT_WAIT_MS + 1_000, "관찰자 연결", relay);
      // 전략 기록기 epoch("") ≠ 주문 epoch("ep-b") — 전략 since 는 0(Pitfall 3).
      expect(gateway.observerLoginRequests()).toEqual([
        { secret: BOOT_SECRET, sinceSeq: 0, epoch: "ep-b", client: "gh-radar-relay", strategySinceSeq: 0, role: 0 },
      ]);
      await waitFor(
        () => getHealthz(relay.orderApiPort),
        (h) => journalOf(h)?.state === "live",
        "healthz journal live(두 pending 없음)",
        relay,
      );

      // 80 — 주문 0건 · 전략 BuyOrder(kind 3) seq 1.
      gateway.pushJournalBatch(sock, { records: [], headSeq: 0, strategyEvents: [{ seq: 1 }] });
      const applies = await waitFor(
        () => supabase.requestsTo("/rest/v1/rpc/dma_strategy_apply"),
        (rs) => rs.length >= 1,
        "dma_strategy_apply 수신",
        relay,
      );
      expect(applies).toHaveLength(1);
      const body = applies[0]?.body as {
        p_gateway: string;
        p_epoch: string;
        p_events: Array<{ seq: number; kind: number }>;
      };
      expect(applies[0]?.method).toBe("POST");
      expect(body.p_gateway).toBe(GATEWAY);
      expect(body.p_epoch).toBe("ep-b");
      expect(body.p_events.map((e) => e.seq)).toEqual([1]);
      expect(body.p_events[0]?.kind).toBe(3);
      // 주문 적용 RPC 는 부르지 않았다(주문 0건).
      expect(supabase.requestsTo("/rest/v1/rpc/dma_journal_apply")).toEqual([]);

      const h = await waitFor(
        () => getHealthz(relay.orderApiPort),
        (x) => (journalOf(x)?.strategy as Record<string, unknown> | null | undefined)?.lastSeq === 1,
        "healthz journal.strategy.lastSeq 1",
        relay,
      );
      expect(h.status).toBe(200);
      expect(journalOf(h)?.strategy).toEqual({ lastSeq: 1, headSeq: 1, lagSeq: 0, dbError: false, queueDepth: 0, paused: null });
      expect(JSON.stringify(h.body)).not.toMatch(/"(accountNo|userId|account_no|user_id|dmaUserId|dma_user_id)"/);
      expect(supabase.unknownRequests()).toEqual([]);

      relay.child.kill("SIGTERM");
      const exit = await withTimeout(relay.exited, 5_000, "SIGTERM 종료", relay);
      expect(exit, relay.output()).toEqual({ code: 0, signal: null });
      expect(relay.output()).not.toContain(BOOT_SECRET);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "production + DMA_OBSERVER_SECRET 없음 → 5초 안에 비정상 종료 · 사유 문구",
    async () => {
      const { gateway, supabase } = await rig();
      const relay = await spawnRelay({
        gatewayPort: gateway.port,
        supabaseUrl: supabase.url,
        nodeEnv: "production",
        secret: undefined,
      });
      const exit = await withTimeout(relay.exited, 5_000, "production 기동 거부", relay);
      expect(exit.code, relay.output()).not.toBe(0);
      expect(exit.code).not.toBeNull();
      expect(relay.output()).toContain("DMA_OBSERVER_SECRET must be set");
      expect(gateway.observerLoginRequests()).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "DMA_OBSERVER_SECRET 없음 + NODE_ENV test → healthz 200 · journal.state disabled · 관찰자 로그인 0",
    async () => {
      const { gateway, supabase } = await rig();
      const relay = await spawnRelay({
        gatewayPort: gateway.port,
        supabaseUrl: supabase.url,
        nodeEnv: "test",
        secret: undefined,
      });
      const h = await waitFor(
        () => getHealthz(relay.orderApiPort),
        (x) => x.status === 200 && journalOf(x) !== undefined,
        "healthz 200 · journal 필드",
        relay,
      );
      expect(journalOf(h)?.state).toBe("disabled");
      // 부팅 직후 한 박자 더 — 관찰자가 붙지 않는다(커서도 읽지 않는다).
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      expect(gateway.observerLoginRequests()).toEqual([]);
      expect(gateway.sockets).toHaveLength(0);
      expect(supabase.requestsTo("/rest/v1/dma_journal_cursor")).toEqual([]);

      relay.child.kill("SIGTERM");
      const exit = await withTimeout(relay.exited, 5_000, "SIGTERM 종료", relay);
      expect(exit, relay.output()).toEqual({ code: 0, signal: null });
      expect(relay.output()).toContain('"journalObserver":"disabled"');
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================
// quick-260929-c8e — 관찰자 다중 업스트림 (주 게이트웨이 KB + 추가 게이트웨이 KYOBO)
// ============================================================

const KYOBO_SECRET = "boot-test-secret-kyobo";
/** 가짜 교보 계좌 — 실계좌가 아니다(명백한 가짜값). */
const KYOBO_FAKE_ACCOUNT = "5555555501";

const gatewaysOf = (h: Healthz): Record<string, Record<string, unknown>> | undefined =>
  (h.body?.journalGateways as Record<string, Record<string, unknown>> | undefined) ?? undefined;

/** 주 게이트웨이(KB) 관찰자 로그인 즉시 live(head 0 · 재생 없음). */
function respondKbLive(gateway: FakeGateway): void {
  gateway.respondObserverLogin({
    epoch: "ep-kb",
    headSeq: 0,
    oldestSeq: 0,
    resync: true,
    accounts: [{ dmaUserId: "dma-user-1", accountNo: SAMPLE_ACCOUNT_NO, name: "위탁종합", priority: 0 }],
  });
}

async function startKyoboGateway(): Promise<FakeGateway> {
  const gateway = await startFakeGateway();
  cleanups.push(() => gateway.close());
  return gateway;
}

function kyoboEnv(kyobo: FakeGateway): Record<string, string> {
  // ★ D-27 — 추가 게이트웨이도 방금 띄운 로컬 스텁이다. 실서버 주소는 여기에 없다.
  return { DMA_KYOBO_HOST: "127.0.0.1", DMA_KYOBO_PORT: String(kyobo.port), DMA_OBSERVER_SECRET_KYOBO: KYOBO_SECRET };
}

describe("다중 업스트림 (quick-260929-c8e)", () => {
  it(
    "M1 KYOBO env 없음 → 관찰자 로그인 1(KB) · 커서 조회 gateway=eq.KB 1회 · healthz 키 8종 · journalGateways 없음",
    async () => {
      const { gateway, supabase } = await rig();
      respondKbLive(gateway);
      const relay = await spawnRelay({
        gatewayPort: gateway.port,
        supabaseUrl: supabase.url,
        nodeEnv: "test",
        secret: BOOT_SECRET,
      });
      await withTimeout(gateway.waitForObserverConnection(BOOT_WAIT_MS), BOOT_WAIT_MS + 1_000, "관찰자 연결", relay);
      const h = await waitFor(
        () => getHealthz(relay.orderApiPort),
        (x) => x.status === 200 && journalOf(x)?.state === "live",
        "healthz 200 · journal live",
        relay,
      );
      expect(Object.keys(h.body ?? {}).sort()).toEqual(
        ["dma", "everReadyCount", "journal", "sessionCount", "stalledCount", "status", "version", "vpn"],
      );
      expect(gateway.observerLoginRequests()).toHaveLength(1);
      // 주문 · 전략 기록기 각 1회(Phase 25) — 둘 다 같은 게이트웨이 키다.
      const cursorReads = supabase.requestsTo("/rest/v1/dma_journal_cursor");
      expect(cursorReads.map((r) => r.query.gateway)).toEqual([`eq.${GATEWAY}`, `eq.${GATEWAY}`]);
      expect(cursorReads.map((r) => r.query.select).sort()).toEqual([
        "journal_epoch,last_seq",
        "strategy_journal_epoch,strategy_last_seq",
      ]);

      relay.child.kill("SIGTERM");
      const exit = await withTimeout(relay.exited, 5_000, "SIGTERM 종료", relay);
      expect(exit, relay.output()).toEqual({ code: 0, signal: null });
      expect(relay.output()).not.toContain('"journalGateways"');
      expect(relay.output()).toContain('"journalObserver":"enabled"');
      // quick-260929-sas — 추가 게이트웨이가 없으면 신원 조회 자체가 없다(오늘과 같다).
      expect(supabase.requestsTo("/rest/v1/dma_visibility_identities")).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "M2 KB · KYOBO 둘 다 성공 → 비밀 · 커서 · 매핑 · 적용이 게이트웨이별로 분리 · healthz journalGateways.KYOBO live · SIGTERM 0",
    async () => {
      const { gateway: kb, supabase } = await rig();
      const kyobo = await startKyoboGateway();
      respondKbLive(kb);
      kyobo.respondObserverLogin({
        broker: "KYOBO",
        epoch: "ep-kyobo",
        headSeq: 1,
        oldestSeq: 1,
        resync: true,
        accounts: [{ dmaUserId: "dma-user-1", accountNo: KYOBO_FAKE_ACCOUNT, name: "교보 가짜 계좌", priority: 0 }],
      });

      const relay = await spawnRelay({
        gatewayPort: kb.port,
        supabaseUrl: supabase.url,
        nodeEnv: "test",
        secret: BOOT_SECRET,
        extraEnv: kyoboEnv(kyobo),
      });

      await withTimeout(kb.waitForObserverConnection(BOOT_WAIT_MS), BOOT_WAIT_MS + 1_000, "KB 관찰자 연결", relay);
      const kyoboSock = await withTimeout(
        kyobo.waitForObserverConnection(BOOT_WAIT_MS),
        BOOT_WAIT_MS + 1_000,
        "KYOBO 관찰자 연결",
        relay,
      );

      // 각 게이트웨이는 자기 비밀 하나만 받는다.
      expect(kb.observerLoginRequests()).toEqual([
        { secret: BOOT_SECRET, sinceSeq: 0, epoch: "", client: "gh-radar-relay", strategySinceSeq: 0, role: 0 },
      ]);
      expect(kyobo.observerLoginRequests()).toEqual([
        { secret: KYOBO_SECRET, sinceSeq: 0, epoch: "", client: "gh-radar-relay", strategySinceSeq: 0, role: 0 },
      ]);

      // 커서 조회는 게이트웨이별 1회씩.
      // 게이트웨이마다 두 기록기(주문 · 전략)가 각 1회.
      const cursorReads = supabase.requestsTo("/rest/v1/dma_journal_cursor");
      expect(cursorReads.map((r) => r.query.gateway).sort()).toEqual(["eq.KB", "eq.KB", "eq.KYOBO", "eq.KYOBO"]);

      // 매핑 동기화는 p_gateway 별로.
      const syncs = await waitFor(
        () => supabase.requestsTo("/rest/v1/rpc/dma_journal_sync_access"),
        (rs) => rs.length >= 2,
        "dma_journal_sync_access 2건",
        relay,
      );
      expect(new Set(syncs.map((r) => (r.body as { p_gateway: string }).p_gateway))).toEqual(new Set(["KB", "KYOBO"]));

      // KYOBO 소켓의 배치 → 적용 RPC p_gateway KYOBO · p_epoch ep-kyobo.
      kyobo.pushJournalBatch(kyoboSock, { records: [{ seq: 1, accountNo: KYOBO_FAKE_ACCOUNT }], headSeq: 1, caughtUp: true });
      const applies = await waitFor(
        () => supabase.requestsTo("/rest/v1/rpc/dma_journal_apply"),
        (rs) => rs.length >= 1,
        "dma_journal_apply 수신",
        relay,
      );
      const applyBody = applies[0]?.body as { p_gateway: string; p_epoch: string; p_events: Array<{ seq: number }> };
      expect(applyBody.p_gateway).toBe("KYOBO");
      expect(applyBody.p_epoch).toBe("ep-kyobo");
      expect(applyBody.p_events.map((e) => e.seq)).toEqual([1]);

      // quick-260929-sas — 추가 게이트웨이 신원은 규칙 뷰에서 그 게이트웨이 키로만 읽는다(부팅 즉시).
      const identityReads = await waitFor(
        () => supabase.requestsTo("/rest/v1/dma_visibility_identities"),
        (rs) => rs.some((r) => r.query.gateway === "in.(KYOBO)"),
        "dma_visibility_identities gateway=in.(KYOBO) 조회",
        relay,
      );
      const identityRead = identityReads.find((r) => r.query.gateway === "in.(KYOBO)");
      const identitySelect = (identityRead?.query.select ?? "").split(",").map((c) => c.trim());
      expect(identitySelect).toEqual(expect.arrayContaining(["user_id", "dma_user_id"]));

      const h = await waitFor(
        () => getHealthz(relay.orderApiPort),
        (x) => gatewaysOf(x)?.KYOBO?.state === "live" && gatewaysOf(x)?.KYOBO?.lastSeq === 1 && journalOf(x)?.state === "live",
        "healthz journal live · journalGateways.KYOBO live · lastSeq 1",
        relay,
      );
      expect(h.status).toBe(200);
      expect(Object.keys(gatewaysOf(h) ?? {})).toEqual(["KYOBO"]);
      expect(gatewaysOf(h)?.KYOBO?.alerting).toBe(false);
      expect(supabase.unknownRequests()).toEqual([]);

      relay.child.kill("SIGTERM");
      const exit = await withTimeout(relay.exited, 5_000, "SIGTERM 종료", relay);
      expect(exit, relay.output()).toEqual({ code: 0, signal: null });
      const out = relay.output();
      expect(out).not.toContain("기록기 drain 미완");
      expect(out).toContain('"journalGateways"');
      // T-c8e-01 — 두 비밀 문자열은 어느 출력에도 없다.
      expect(out).not.toContain(BOOT_SECRET);
      expect(out).not.toContain(KYOBO_SECRET);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "M3 KYOBO 로그인 거부 → KYOBO rejected · KB live · 200 · 재시도 없음 · 거부 로그에 gateway KYOBO",
    async () => {
      const { gateway: kb, supabase } = await rig();
      const kyobo = await startKyoboGateway();
      respondKbLive(kb);
      kyobo.respondObserverLogin({ success: false, message: "observer secret mismatch" });

      const relay = await spawnRelay({
        gatewayPort: kb.port,
        supabaseUrl: supabase.url,
        nodeEnv: "test",
        secret: BOOT_SECRET,
        extraEnv: kyoboEnv(kyobo),
      });

      const h = await waitFor(
        () => getHealthz(relay.orderApiPort),
        (x) => gatewaysOf(x)?.KYOBO?.state === "rejected" && journalOf(x)?.state === "live",
        "healthz KYOBO rejected · KB live",
        relay,
      );
      // KB 가 live 인 한 KYOBO 거부는 503 을 만들지 않는다(장중 결정적 잠금은 order-api 단위 테스트 b).
      expect(h.status).toBe(200);

      // 거부 = 정지(D-13) — 1.5초 더 기다려도 재로그인이 없다. KB 도 1건 그대로다.
      await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
      expect(kyobo.observerLoginRequests()).toHaveLength(1);
      expect(kb.observerLoginRequests()).toHaveLength(1);
      const again = await getHealthz(relay.orderApiPort);
      expect(again.status).toBe(200);
      expect(journalOf(again)?.state).toBe("live");

      const out = relay.output();
      expect(out).toContain("관찰자 로그인 거부");
      expect(out).toContain('"gateway":"KYOBO"');

      relay.child.kill("SIGTERM");
      const exit = await withTimeout(relay.exited, 5_000, "SIGTERM 종료", relay);
      expect(exit, relay.output()).toEqual({ code: 0, signal: null });
      expect(relay.output()).not.toContain(KYOBO_SECRET);
    },
    TEST_TIMEOUT_MS,
  );
});
