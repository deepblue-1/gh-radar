#!/usr/bin/env node
// 가짜 119 강제 명령 — tickgw 가 `ssh <옵션…> <host> <isin> <ex> <date> <from_ns> <to_ns>` 로 부르는 자리에 TICKGW_SSH_BIN 으로 놓는다.
// 계약(37-01 제안 + gh-trade 1차 회신 261102-tick-viewer-contract-1)대로: stdout = 항상 zstd 프레임 정확히 1개
// (pcap-ns 레코드 `<IIII>` 16B + 합성 A3 페이로드 반복 · 0건이면 빈 프레임) · stderr 마지막 줄 JSON
// (compressed_files_skipped 포함) · 종료코드 0/75/64.
//
// 하루 레코드: 그날 08:00 KST + (i+1)초(i = 0..TOTAL−1) — 결정적이라 같은 인자는 같은 바이트를 낸다.
//
// 환경변수
//   FAKE_INDEXER_LOG         호출마다 argv JSON 한 줄을 덧붙일 파일
//   FAKE_INDEXER_TOTAL       하루 레코드 수(기본 5)
//   FAKE_INDEXER_TOTAL_FILE  있으면 이 파일의 정수가 TOTAL(시험이 하루를 「자라게」 한다)
//   FAKE_INDEXER_PAGE        응답당 최대 레코드 수(기본 무제한) — 넘으면 has_more + next_from_ns
//   FAKE_INDEXER_EXIT        이 종료코드로 바로 끝낸다(출력 없음 · stderr 에 FAKE_INDEXER_STDERR)
//   FAKE_INDEXER_STDERR      종료 전 stderr 에 쓸 줄
//   FAKE_INDEXER_DELAY_MS    응답 전 지연
//   FAKE_INDEXER_SKIPPED     stderr JSON compressed_files_skipped 값(기본 0)
//   FAKE_INDEXER_SKIPPED_RECORDS stderr JSON skipped_records 값(기본 0)
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { zstdCompressSync } from "node:zlib";

const argv = process.argv.slice(2);
const env = process.env;
if (env.FAKE_INDEXER_LOG) appendFileSync(env.FAKE_INDEXER_LOG, JSON.stringify(argv) + "\n");

const [isin, ex, date, fromRaw, toRaw] = argv.slice(-5);

async function main() {
  const delay = Number(env.FAKE_INDEXER_DELAY_MS || 0);
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));

  if (env.FAKE_INDEXER_EXIT) {
    if (env.FAKE_INDEXER_STDERR) process.stderr.write(env.FAKE_INDEXER_STDERR + "\n");
    process.exitCode = Number(env.FAKE_INDEXER_EXIT); // exit() 는 파이프 쓰기를 자를 수 있다
    return;
  }
  if (!/^[A-Z0-9]{12}$/.test(isin ?? "") || (ex !== "KRX" && ex !== "NXT") || !/^\d{8}$/.test(date ?? "")
      || !/^\d+$/.test(fromRaw ?? "") || !/^\d+$/.test(toRaw ?? "")) {
    process.stderr.write("bad args\n");
    process.exitCode = 64;
    return;
  }

  let total = Number(env.FAKE_INDEXER_TOTAL || 5);
  if (env.FAKE_INDEXER_TOTAL_FILE && existsSync(env.FAKE_INDEXER_TOTAL_FILE)) {
    total = Number(readFileSync(env.FAKE_INDEXER_TOTAL_FILE, "utf8").trim());
  }
  const page = Number(env.FAKE_INDEXER_PAGE || 0) || Infinity;

  const y = Number(date.slice(0, 4)), m = Number(date.slice(4, 6)), d = Number(date.slice(6, 8));
  const dayStartNs = BigInt(Date.UTC(y, m - 1, d, 8, 0) - 9 * 3600 * 1000) * 1_000_000n;
  const from = BigInt(fromRaw);
  const to = BigInt(toRaw);

  const all = [];
  for (let i = 0; i < total; i++) {
    const ns = dayStartNs + BigInt(i + 1) * 1_000_000_000n;
    if (ns < from) continue;
    if (to !== 0n && ns > to) continue;
    all.push({ i, ns });
  }
  const take = all.slice(0, page);
  const hasMore = all.length > take.length;

  const parts = [];
  for (const { i, ns } of take) {
    const payload = Buffer.alloc(40, 0x20);
    payload.write("A301S", 0, "latin1"); // 합성 A3 (정보구분 앞자리 — 실전문 레이아웃 아님)
    payload.write(isin, 17, "latin1"); // A3 ISIN 오프셋 17
    payload.write(String(i).padStart(6, "0"), 30, "latin1");
    const hdr = Buffer.alloc(16);
    hdr.writeUInt32LE(Number(ns / 1_000_000_000n), 0);
    hdr.writeUInt32LE(Number(ns % 1_000_000_000n), 4);
    hdr.writeUInt32LE(payload.length, 8);
    hdr.writeUInt32LE(payload.length, 12);
    parts.push(hdr, payload);
  }
  // 회신 차이 ②: 0건이어도 빈 프레임 1개 — 응답 N 개 = 프레임 N 개
  const out = zstdCompressSync(Buffer.concat(parts));
  process.stdout.write(out);
  const meta = {
    fmt: "pcapns-rec/1",
    records: take.length,
    first_recv_ns: take.length ? String(take[0].ns) : null,
    last_recv_ns: take.length ? String(take[take.length - 1].ns) : null,
    has_more: hasMore,
    next_from_ns: hasMore ? String(all[take.length].ns) : "0",
    compressed_files_skipped: Number(env.FAKE_INDEXER_SKIPPED || 0),
    skipped_records: Number(env.FAKE_INDEXER_SKIPPED_RECORDS || 0),
  };
  process.stderr.write("fake-indexer: free log line\n" + JSON.stringify(meta) + "\n");
}

main();
