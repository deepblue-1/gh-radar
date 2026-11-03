import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zstdDecompressSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseMeta, runIndexer, sshArgv, type IndexerArgs, type IndexerOptions } from "../src/indexer.js";

const FAKE = fileURLToPath(new URL("./fixtures/fake-indexer.mjs", import.meta.url));
const DAY = "20261030";
const DAY_START = 1793314800000000000n; // 2026-10-30 08:00 KST

let dir: string;
let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tickgw-idx-"));
  saved = { ...process.env };
  process.env.FAKE_INDEXER_LOG = join(dir, "calls.log");
});
afterEach(() => {
  process.env = saved;
  rmSync(dir, { recursive: true, force: true });
});

const opts = (o: Partial<IndexerOptions> = {}): IndexerOptions => ({
  sshBin: FAKE,
  host: "smok95@10.16.207.119",
  key: "/ssh/id_ed25519",
  knownHosts: "/ssh/known_hosts",
  timeoutMs: 10_000,
  ...o,
});
const args: IndexerArgs = { isin: "KR7101360006", ex: "KRX", date: DAY, fromNs: DAY_START, toNs: 0n };

function calls(): string[][] {
  return readFileSync(process.env.FAKE_INDEXER_LOG!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
}

describe("sshArgv — 37-01 노트 ② 인자 순서 · ssh 규율", () => {
  it("옵션 뒤 호스트 · isin · ex · date · from_ns · to_ns 순서", () => {
    const a = sshArgv(args, opts());
    expect(a.slice(-6)).toEqual(["smok95@10.16.207.119", "KR7101360006", "KRX", DAY, String(DAY_START), "0"]);
    for (const o of [
      "IdentitiesOnly=yes",
      "BatchMode=yes",
      "StrictHostKeyChecking=yes",
      "UserKnownHostsFile=/ssh/known_hosts",
      "ControlMaster=auto",
      "ControlPath=/tmp/tp-%C",
      "ControlPersist=120",
      "ConnectTimeout=10",
    ]) {
      expect(a).toContain(o);
      expect(a[a.indexOf(o) - 1]).toBe("-o");
    }
    expect(a.slice(0, 2)).toEqual(["-i", "/ssh/id_ed25519"]);
  });
});

describe("runIndexer — 가짜 119", () => {
  it("인자를 그대로 넘기고 stdout zstd · stderr 끝 줄 JSON 을 BigInt 로 읽는다", async () => {
    process.env.FAKE_INDEXER_PAGE = "3";
    const r = await runIndexer(args, opts());
    expect(r.code).toBe(0);
    expect(calls()).toEqual([sshArgv(args, opts())]);
    expect(r.meta).toEqual({
      fmt: "pcapns-rec/1",
      records: 3,
      firstRecvNs: DAY_START + 1_000_000_000n,
      lastRecvNs: DAY_START + 3_000_000_000n,
      hasMore: true,
      nextFromNs: DAY_START + 4_000_000_000n,
      compressedFilesSkipped: 0,
    });
    const raw = zstdDecompressSync(r.stdout);
    expect(raw.length).toBe(3 * (16 + 40));
    // 첫 레코드 헤더 = 08:00:01 KST
    const ns = BigInt(raw.readUInt32LE(0)) * 1_000_000_000n + BigInt(raw.readUInt32LE(4));
    expect(ns).toBe(DAY_START + 1_000_000_000n);
    expect(raw.readUInt32LE(8)).toBe(40);
  });

  it("0건 — stdout 은 빈 zstd 프레임 정확히 1개(회신 차이 ②) · compressed_files_skipped 를 읽는다(회신 차이 ①)", async () => {
    process.env.FAKE_INDEXER_SKIPPED = "2";
    const r = await runIndexer({ ...args, fromNs: DAY_START + 3_600_000_000_000n }, opts());
    expect(r.code).toBe(0);
    expect(r.meta?.records).toBe(0);
    expect(r.meta?.compressedFilesSkipped).toBe(2);
    expect(r.stdout.length).toBeGreaterThan(0);
    expect(zstdDecompressSync(r.stdout).length).toBe(0);
  });

  it("종료코드 75(바쁨) — meta 없음 · code 75", async () => {
    process.env.FAKE_INDEXER_EXIT = "75";
    const r = await runIndexer(args, opts());
    expect(r.code).toBe(75);
    expect(r.meta).toBeNull();
    expect(r.stdout.length).toBe(0);
  });

  it("ssh 255 — stderrTail 에 연결 오류 문구가 남는다", async () => {
    process.env.FAKE_INDEXER_EXIT = "255";
    process.env.FAKE_INDEXER_STDERR = "ssh: connect to host 10.16.207.119 port 22: Connection timed out";
    const r = await runIndexer(args, opts());
    expect(r.code).toBe(255);
    expect(r.stderrTail).toContain("Connection timed out");
  });

  it("시간 초과 — kill 하고 code −1 · 지연만큼 기다리지 않는다", async () => {
    process.env.FAKE_INDEXER_DELAY_MS = "5000";
    const t0 = Date.now();
    const r = await runIndexer(args, opts({ timeoutMs: 300 }));
    expect(r.code).toBe(-1);
    expect(r.meta).toBeNull();
    expect(Date.now() - t0).toBeLessThan(3_000);
  });

  it("stdout 상한 초과 — kill · code −1", async () => {
    process.env.FAKE_INDEXER_TOTAL = "2000";
    const r = await runIndexer(args, opts({ maxStdoutBytes: 64 }));
    expect(r.code).toBe(-1);
    expect(r.stdout.length).toBe(0); // 버린다 — 0 으로 채운 꼬리 버퍼를 만들지 않는다(IN-30)
  });

  it("실행 파일 없음 — code −1", async () => {
    const r = await runIndexer(args, opts({ sshBin: join(dir, "no-such-ssh") }));
    expect(r.code).toBe(-1);
    expect(r.meta).toBeNull();
  });
});

describe("parseMeta", () => {
  it("앞 줄은 자유 · 마지막 비지 않은 줄만 JSON", () => {
    const m = parseMeta('log a\nlog b\n{"fmt":"pcapns-rec/1","records":0,"first_recv_ns":null,"last_recv_ns":null,"has_more":false,"next_from_ns":null}\n\n');
    expect(m).toEqual({
      fmt: "pcapns-rec/1", records: 0, firstRecvNs: null, lastRecvNs: null, hasMore: false, nextFromNs: null, compressedFilesSkipped: 0,
    });
  });
  it("회신 예시 줄 그대로 — ns 세 값 문자열 · compressed_files_skipped", () => {
    const m = parseMeta(
      '{"fmt":"pcapns-rec/1","records":3,"first_recv_ns":"1762045201000000100","last_recv_ns":"1762045206000000600","has_more":false,"next_from_ns":"0","compressed_files_skipped":1}',
    );
    expect(m).toEqual({
      fmt: "pcapns-rec/1", records: 3, firstRecvNs: 1762045201000000100n, lastRecvNs: 1762045206000000600n,
      hasMore: false, nextFromNs: 0n, compressedFilesSkipped: 1,
    });
  });
  it("2^53 넘는 ns 문자열을 잃지 않는다", () => {
    const m = parseMeta('{"fmt":"pcapns-rec/1","records":1,"first_recv_ns":"1793314801000000123","last_recv_ns":"1793314801000000123","has_more":false}');
    expect(m?.lastRecvNs).toBe(1793314801000000123n);
  });
  it("끝 줄이 JSON 이 아니거나 필수 키가 없으면 null", () => {
    expect(parseMeta('{"fmt":"x","records":1,"has_more":false}\ntrailing')).toBeNull();
    expect(parseMeta('{"fmt":"x","records":1}')).toBeNull();
    expect(parseMeta("")).toBeNull();
    expect(parseMeta("{broken")).toBeNull();
  });
});
