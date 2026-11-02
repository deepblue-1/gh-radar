import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import type http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TickCache, makeKey } from "../src/cache.js";
import { kstDayStartNs, kstToday } from "../src/config.js";
import { runIndexer, sshArgv, type IndexerOptions } from "../src/indexer.js";
import { Poller } from "../src/poller.js";
import { createTickgwServer } from "../src/server.js";

const FAKE = fileURLToPath(new URL("./fixtures/fake-indexer.mjs", import.meta.url));
const SECRET = "s".repeat(40);
const ISIN = "KR7101360006";

let dir: string;
let saved: NodeJS.ProcessEnv;
let server: http.Server | null = null;
let poller: Poller | null = null;
let base = "";

const idxOpts: IndexerOptions = {
  sshBin: FAKE,
  host: "smok95@10.16.207.119",
  key: "/ssh/id_ed25519",
  knownHosts: "/ssh/known_hosts",
  timeoutMs: 10_000,
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tickgw-srv-"));
  saved = { ...process.env };
  process.env.FAKE_INDEXER_LOG = join(dir, "calls.log");
});
afterEach(async () => {
  await poller?.stop();
  poller = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
  process.env = saved;
  rmSync(dir, { recursive: true, force: true });
});

async function boot(pollMs: number): Promise<{ cache: TickCache; poller: Poller }> {
  const cache = new TickCache(128 * 1024 * 1024, 15 * 60 * 1000);
  poller = new Poller(
    { pollMs, pollJitterMs: 0, leaseMs: 30_000, maxKeys: 8, closeDelayMs: 60_000 },
    {
      cache,
      runIndexer: (a) => runIndexer(a, idxOpts),
      now: Date.now,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      random: Math.random,
    },
  );
  server = createTickgwServer({ secret: SECRET }, { cache, poller, now: Date.now });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  poller.start();
  return { cache, poller };
}

function live(q: Record<string, string>, secret: string | null = SECRET): Promise<Response> {
  const u = new URL("/internal/ticks/live", base);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return fetch(u, { headers: secret === null ? {} : { "X-Tickgw-Secret": secret } });
}

async function until<T>(fn: () => Promise<T | null | undefined | false>, ms = 8_000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("until: timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function waitReady(): Promise<Response> {
  return until(async () => {
    const r = await live({ isin: ISIN, ex: "KRX", offset: "0" });
    if (r.headers.get("X-Tick-State") === "ready") return r;
    await r.arrayBuffer();
    return null;
  });
}

function calls(): string[][] {
  const p = process.env.FAKE_INDEXER_LOG!;
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** 같은 인자로 가짜 119 를 직접 불러 기대 바이트를 만든다(결정적). */
function fakeBytes(date: string, from: bigint): Buffer {
  const a = sshArgv({ isin: ISIN, ex: "KRX", date, fromNs: from, toNs: 0n }, idxOpts);
  const env = { ...process.env };
  delete env.FAKE_INDEXER_LOG;
  const r = spawnSync(FAKE, a, { env });
  return r.stdout;
}

describe("GET /internal/ticks/live — 트레이서", () => {
  it("첫 요청은 loading 또는 ready · epoch 를 준다 · healthz 는 무인증", async () => {
    await boot(60_000);
    const r = await live({ isin: ISIN, ex: "KRX", offset: "0" });
    expect(r.status).toBe(200);
    expect(["loading", "ready"]).toContain(r.headers.get("X-Tick-State"));
    expect(r.headers.get("X-Tick-Epoch")).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.headers.get("X-Tick-Queue")).toBe("0");
    expect(r.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    await r.arrayBuffer();

    const h = await fetch(new URL("/healthz", base));
    expect(h.status).toBe(200);
    expect(await h.json()).toMatchObject({ ok: true, keys: 1 });
  });

  it("08:00 하루치 + has_more 이어받기 → 바이트 = 두 응답을 이어붙인 것 · offset 이후만", async () => {
    process.env.FAKE_INDEXER_PAGE = "3";
    process.env.FAKE_INDEXER_TOTAL = "5";
    await boot(60_000);
    const today = kstToday(Date.now());
    const dayStart = kstDayStartNs(today);

    const r = await waitReady();
    const body = Buffer.from(await r.arrayBuffer());
    const c = calls();
    expect(c.map((a) => a.slice(-5))).toEqual([
      [ISIN, "KRX", today, String(dayStart), "0"],
      [ISIN, "KRX", today, String(dayStart + 4_000_000_000n), "0"], // next_from_ns 로 곧바로
    ]);
    const expected = Buffer.concat([fakeBytes(today, dayStart), fakeBytes(today, dayStart + 4_000_000_000n)]);
    expect(body.equals(expected)).toBe(true);
    expect(r.headers.get("X-Tick-Offset-End")).toBe(String(expected.length));
    expect(r.headers.get("X-Tick-Last-Recv-Ns")).toBe(String(dayStart + 5_000_000_000n));
    expect(r.headers.get("X-Tick-Complete")).toBe("true");

    const epoch = r.headers.get("X-Tick-Epoch")!;
    const k = 17;
    const r2 = await live({ isin: ISIN, ex: "KRX", epoch, offset: String(k) });
    expect(r2.status).toBe(200);
    expect(Buffer.from(await r2.arrayBuffer()).equals(expected.subarray(k))).toBe(true);

    const r3 = await live({ isin: ISIN, ex: "KRX", epoch, offset: String(expected.length) });
    expect(Buffer.from(await r3.arrayBuffer()).length).toBe(0);
  });

  it("epoch 불일치 409 {epoch} · epoch 없이 offset>0 도 409", async () => {
    await boot(60_000);
    const r = await waitReady();
    const epoch = r.headers.get("X-Tick-Epoch");
    await r.arrayBuffer();
    const bad = await live({ isin: ISIN, ex: "KRX", epoch: "00000000-0000-0000-0000-000000000000", offset: "10" });
    expect(bad.status).toBe(409);
    expect(await bad.json()).toEqual({ epoch });
    const noEpoch = await live({ isin: ISIN, ex: "KRX", offset: "10" });
    expect(noEpoch.status).toBe(409);
    await noEpoch.arrayBuffer();
  });

  it("비밀 틀림 · 없음 → 401 · 잘못된 인자 → 400", async () => {
    await boot(60_000);
    const wrong = await live({ isin: ISIN, ex: "KRX" }, "x".repeat(40));
    expect(wrong.status).toBe(401);
    await wrong.arrayBuffer();
    const none = await live({ isin: ISIN, ex: "KRX" }, null);
    expect(none.status).toBe(401);
    await none.arrayBuffer();
    for (const q of [{ isin: "kr7101360006", ex: "KRX" }, { isin: ISIN, ex: "XXX" }, { isin: ISIN, ex: "KRX", offset: "-1" }]) {
      const r = await live(q);
      expect(r.status).toBe(400);
      await r.arrayBuffer();
    }
    expect(calls()).toEqual([]); // 401 · 400 은 119 를 부르지 않는다
  });

  it("같은 키 브라우저 5개 동시 요청 → 119 호출은 키당 1(+이어받기) — D-07", async () => {
    process.env.FAKE_INDEXER_PAGE = "3";
    process.env.FAKE_INDEXER_DELAY_MS = "150";
    await boot(60_000);
    const today = kstToday(Date.now());
    const dayStart = String(kstDayStartNs(today));
    const rs = await Promise.all(Array.from({ length: 5 }, () => live({ isin: ISIN, ex: "KRX", offset: "0" })));
    for (const r of rs) {
      expect(r.status).toBe(200);
      await r.arrayBuffer();
    }
    const epochs = new Set(rs.map((r) => r.headers.get("X-Tick-Epoch")));
    expect(epochs.size).toBe(1);
    await waitReady();
    // 다시 5개 — 이미 ready 라 새 하루치 요청이 없다
    await Promise.all(Array.from({ length: 5 }, async () => (await live({ isin: ISIN, ex: "KRX", offset: "0" })).arrayBuffer()));
    const c = calls();
    expect(c.filter((a) => a.at(-2) === dayStart)).toHaveLength(1);
    expect(c).toHaveLength(2); // 하루치 1 + 이어받기 1
  });

  it("ready 뒤 증분 — lastRecvNs+1 부터만 부르고 새 바이트가 뒤에 붙는다", async () => {
    const totalFile = join(dir, "total");
    writeFileSync(totalFile, "3");
    process.env.FAKE_INDEXER_TOTAL_FILE = totalFile;
    await boot(100);
    const today = kstToday(Date.now());
    const dayStart = kstDayStartNs(today);
    const r = await waitReady();
    const first = Buffer.from(await r.arrayBuffer());
    const epoch = r.headers.get("X-Tick-Epoch")!;
    writeFileSync(totalFile, "5");
    const grown = await until(async () => {
      const x = await live({ isin: ISIN, ex: "KRX", epoch, offset: String(first.length) });
      const b = Buffer.from(await x.arrayBuffer());
      return b.length > 0 ? { x, b } : null;
    });
    expect(grown.x.headers.get("X-Tick-Last-Recv-Ns")).toBe(String(dayStart + 5_000_000_000n));
    expect(calls().map((a) => a.at(-2))).toContain(String(dayStart + 3_000_000_001n)); // lastRecvNs + 1
    expect(grown.b.equals(fakeBytes(today, dayStart + 3_000_000_001n))).toBe(true);
    expect(makeKey(ISIN, "KRX", today)).toBe(`${ISIN}|KRX|${today}`);
  });
});
