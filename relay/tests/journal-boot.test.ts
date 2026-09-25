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
      const cursorReads = supabase.requestsTo("/rest/v1/dma_journal_cursor");
      expect(cursorReads).toHaveLength(1);
      expect(cursorReads[0]?.method).toBe("GET");
      expect(cursorReads[0]?.query.gateway).toBe(`eq.${GATEWAY}`);
      expect(gateway.observerLoginRequests()).toEqual([
        { secret: BOOT_SECRET, sinceSeq: 0, epoch: "", client: "gh-radar-relay" },
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
