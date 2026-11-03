#!/usr/bin/env node
// Phase 38 (D-15 · SC-2 · SC-3) 우리 체결 오라클 픽스처 생성기 — 10/30 다섯 종목 「창」 격자 + 익명 저널.
//
// 목적: ROADMAP Phase 38 실측 수치(짝 401/406 · 큰 A3 의 일부 165 · 추정 108)는 이전 세션 probe 로 쟀고 그 스크립트는 저장소에
//   없다. 이 생성기가 그 입력을 저장소 안 픽스처로 바꿔 `ticks-own.golden.test.ts` 가 재현 테스트로 잠근다.
//
// 입력(원격 접근 없음 — 입력은 저장소 밖 로컬 사본):
//   --in <dir>  기본 $OWN_PROBE_DIR 또는 $HOME/gh-radar-own-probe-1030
//     KRX_KR7184230001.zst · KRX_KR7011080009.zst · KRX_KR7051630002.zst · KRX_KR7092190008.zst · NXT_KR7046890000.zst
//       = Storage `tick-grid/grid/20261030/<EX>/<isin>.nightly.ticks.zst` 사본(레코드 프레이밍 pcapns-rec+zstd/1)
//     fills1030.json  = `dma_journal_events` 10/30 체결(E) 행 · strat1030.json = `dma_strategy_events` 10/30 kind 3·6 행
//   Storage 격자는 보존 90일(TICK_KEEP_DAYS)이라 2027-01-28 무렵 purge 된다 — 그래서 픽스처를 지금 커밋한다.
//
// 창 규칙(레코드 순서 보존 필터 — 짝짓기 동률 규칙 「작은 j」 가 그대로 유지된다):
//   A3 ∧ ok 를 남긴다 — (a3TimeMs ∈ [g − 3000, g + 1000] 인 체결 g 가 있음) ∨ (수신 ms ∈ [e − 3500, e + 500] 인 이벤트 e 가 있음)
//     ∨ cumVolume ∈ {이벤트 cum_volume > 0} ∪ {ev_kind 2 의 ev_qty_after}
//     ∨ (ev_kind 2 ∧ ev_qty_after > ev_qty_before 인 이벤트의 (before, after] 에 cumVolume 이 듦)
//   B6 ∧ ok 를 남긴다 — 수신 ms ∈ [e − 3500, e + 500] 인 이벤트 e 가 있음.
//   그 밖(R8 · B9 · C3 · A0 · raw · 길이 안 맞는 행)은 버린다. 짝 후보 창 [g − 1500, g + 200] · B6 근거 창 [g − 3000, g + 50] ·
//   cum 일치 · 주기매도 구간을 모두 덮으므로 짝짓기 결과가 원본 격자와 같다(아래 자기검사가 확인한다).
//
// 익명화: account_no → ACC1 · ACC2 … (체결 → 이벤트 순 첫 등장 순 · 이벤트에는 계좌 칸이 없다). 원본 계좌번호 · dma_user_id 는
//   출력 · 로그 어디에도 쓰지 않는다(입력에 dma_user_id 칸은 없다). 주문번호 · 가격 · 수량 · 시각은 그대로(규칙 입력).
//
// 자기검사(하나라도 다르면 exit 1):
//   1. 원본 레코드 수 11,130 · 6,421 · 126,135 · 118,990 · 587,383
//   2. 체결(키 5개 ∧ exec_qty > 0) 키별 227 · 58 · 43 · 35 · 43(합 406) · 이벤트(키 5개) 124
//   3. 창 격자 파일당 ≤ 1.5MB(1,572,864B)
//   4. 키마다 원본 격자와 창 격자의 matchOwnFills 결과(짝 여부 · est · candidates · dt · 짝 A3 의 board · seq · px · qty)가 같다
//
// 출력(--out <dir> · 기본 packages/shared/src/__fixtures__/ticks):
//   own1030-{krx|nxt}-{ISIN}.ticks.zst 5개(zstd 레벨 19 · 한 프레임) + own1030.journal.json(행마다 한 줄 · 키 정렬 · 생성 시각 없음)
//
// 사용법(선행: shared 빌드 — 생성기는 packages/shared/dist 를 읽는다):
//   pnpm --filter @gh-radar/shared build && node scripts/tick-oracle/gen-own-fixtures.mjs
//   node scripts/tick-oracle/gen-own-fixtures.mjs --check   # 임시 디렉터리에 만들어 --out 과 바이트 비교 · 다르면 exit 1
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = join(ROOT, "packages/shared/dist/index.js");
const MAX_BYTES = 1572864;

/** 키 → (라벨 · ISIN · 기대 원본 레코드 수 · 기대 체결 수). RESEARCH §10/30 픽스처 계획 · Pattern 1 표. */
const KEYS = [
  { key: "KRX_KR7184230001", label: "krx", isin: "KR7184230001", records: 11130, fills: 227 },
  { key: "KRX_KR7011080009", label: "krx", isin: "KR7011080009", records: 6421, fills: 58 },
  { key: "KRX_KR7051630002", label: "krx", isin: "KR7051630002", records: 126135, fills: 43 },
  { key: "KRX_KR7092190008", label: "krx", isin: "KR7092190008", records: 118990, fills: 35 },
  { key: "NXT_KR7046890000", label: "nxt", isin: "KR7046890000", records: 587383, fills: 43 },
];
const EXPECT_FILLS = 406;
const EXPECT_EVENTS = 124;
const FILLS_FILE = "fills1030.json";
const EVENTS_FILE = "strat1030.json";
const JOURNAL_FILE = "own1030.journal.json";

function fail(msg) {
  console.error(`[gen-own-fixtures] 실패: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const a = { in: process.env.OWN_PROBE_DIR || join(homedir(), "gh-radar-own-probe-1030"), out: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--in") a.in = argv[++i];
    else if (v === "--out") a.out = argv[++i];
    else if (v === "--check") a.check = true;
    else fail(`모르는 인자 ${v} — 사용법: [--in <dir>] [--out <dir>] [--check]`);
  }
  if (!a.in || (a.out === undefined)) fail("--in · --out 값이 비었다");
  a.out = resolve(a.out ?? join(ROOT, "packages/shared/src/__fixtures__/ticks"));
  a.in = resolve(a.in);
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (!existsSync(DIST)) fail(`${DIST} 가 없다 — 먼저 pnpm --filter @gh-radar/shared build`);
const S = await import(pathToFileURL(DIST).href);
const { splitZstdFrames, concatBytes, encodeRecord, buildTickIndex, a3ColumnsOf, TAG_CODE, matchOwnFills, a3TimeMs } = S;
for (const [name, fn] of Object.entries({ splitZstdFrames, concatBytes, encodeRecord, buildTickIndex, a3ColumnsOf, matchOwnFills, a3TimeMs })) {
  if (typeof fn !== "function") fail(`shared dist 에 ${name} 가 없다 — shared 를 다시 빌드한다`);
}

function u8(b) {
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

/** zstd 바이트 → 레코드 프레이밍 바이트(여러 프레임이면 프레임마다 풀어 잇는다 — Node 는 첫 프레임에서 멈춘다). */
function unzstd(bytes) {
  const frames = splitZstdFrames(u8(bytes));
  return concatBytes(frames.map((f) => u8(zlib.zstdDecompressSync(f))));
}

function zstd19(bytes) {
  return u8(zlib.zstdCompressSync(bytes, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } }));
}

function readJson(path) {
  if (!existsSync(path)) fail(`${path} 가 없다`);
  const v = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(v)) fail(`${path} 가 배열이 아니다`);
  return v;
}

/** 오름차순 배열 xs 에 [lo, hi] 안 값이 있는가. */
function anyIn(xs, lo, hi) {
  let a = 0;
  let b = xs.length;
  while (a < b) {
    const m = (a + b) >>> 1;
    if (xs[m] < lo) a = m + 1;
    else b = m;
  }
  return a < xs.length && xs[a] <= hi;
}

function cmpRow(x, y) {
  return x.gw_time_ms - y.gw_time_ms || (x.gateway < y.gateway ? -1 : x.gateway > y.gateway ? 1 : 0) || x.seq - y.seq;
}

/** 키 정렬 · 공백 없는 한 줄 JSON. */
function line(obj) {
  const o = {};
  for (const k of Object.keys(obj).sort()) o[k] = obj[k];
  return JSON.stringify(o);
}

function journalText(source, fills, events) {
  const rows = (xs) => (xs.length === 0 ? "[]" : `[\n${xs.map((x) => `  ${line(x)}`).join(",\n")}\n ]`);
  return `{\n "events": ${rows(events)},\n "fills": ${rows(fills)},\n "source": ${line(source)}\n}\n`;
}

/** 짝짓기 결과를 격자와 무관한 값으로(A3 열 색인 j 는 창 격자에서 달라진다). */
function matchView(index, a3, m) {
  if (m.a3j < 0) return { a3: null, est: m.est, candidates: m.candidates };
  const j = m.a3j;
  return {
    a3: { board: index.boards[a3.board[j]], seq: a3.seq[j], px: a3.px[j], qty: a3.qty[j], t: a3TimeMs(index, a3, j) },
    est: m.est,
    candidates: m.candidates,
    dtMs: m.dtMs,
  };
}

function build(inDir) {
  // ── 저널 ──────────────────────────────────────────────────────────────
  const keySet = new Set(KEYS.map((k) => k.key));
  const rawFills = readJson(join(inDir, FILLS_FILE));
  const rawEvents = readJson(join(inDir, EVENTS_FILE));
  const fills = [];
  rawFills.forEach((f, seq) => {
    const key = `${f.exchange}_${f.isin}`;
    if (!keySet.has(key) || !(f.exec_qty > 0)) return;
    const gw = Date.parse(f.gw_time);
    if (!Number.isFinite(gw)) fail(`${FILLS_FILE}[${seq}] gw_time 을 읽지 못했다`);
    fills.push({
      key,
      gateway: f.gateway,
      seq,
      gw_time_ms: gw,
      account_no: f.account_no,
      order_no: f.order_no,
      side: f.side,
      exchange: f.exchange,
      isin: f.isin,
      exec_price: f.exec_price,
      exec_qty: f.exec_qty,
    });
  });
  fills.sort(cmpRow);
  const events = [];
  rawEvents.forEach((e, seq) => {
    const key = `${e.exchange}_${e.isin}`;
    if (!keySet.has(key)) return;
    if (!Number.isFinite(e.gw_time_ms)) fail(`${EVENTS_FILE}[${seq}] gw_time_ms 가 숫자가 아니다`);
    events.push({
      key,
      gateway: e.gateway,
      seq,
      gw_time_ms: e.gw_time_ms,
      kind: e.kind,
      exchange: e.exchange,
      isin: e.isin,
      cum_volume: e.cum_volume,
      order_no: e.order_no,
      price: e.price,
      qty: e.qty,
      reason_code: e.reason_code,
      cond_metric: e.cond_metric,
      cond_threshold: e.cond_threshold,
      cond_actual: e.cond_actual,
      ev_kind: e.ev_kind,
      ev_price: e.ev_price,
      ev_qty_before: e.ev_qty_before,
      ev_qty_after: e.ev_qty_after,
      ev_trade_qty: e.ev_trade_qty,
    });
  });
  events.sort(cmpRow);
  if (fills.length !== EXPECT_FILLS) fail(`체결 ${fills.length} ≠ ${EXPECT_FILLS}`);
  if (events.length !== EXPECT_EVENTS) fail(`이벤트 ${events.length} ≠ ${EXPECT_EVENTS}`);

  // 계좌 익명화 — 체결 → 이벤트 순 첫 등장 순(이벤트에는 계좌 칸이 없다). 원본 값은 어디에도 쓰지 않는다.
  const acc = new Map();
  for (const f of fills) {
    if (!acc.has(f.account_no)) acc.set(f.account_no, `ACC${acc.size + 1}`);
    f.account_no = acc.get(f.account_no);
  }

  // ── 격자 ──────────────────────────────────────────────────────────────
  const out = new Map(); // 파일명 → 바이트
  const report = [];
  for (const k of KEYS) {
    const kf = fills.filter((f) => f.key === k.key);
    const ke = events.filter((e) => e.key === k.key);
    if (kf.length !== k.fills) fail(`${k.key} 체결 ${kf.length} ≠ ${k.fills}`);

    const src = join(inDir, `${k.key}.zst`);
    if (!existsSync(src)) fail(`${src} 가 없다`);
    const buf = unzstd(readFileSync(src));
    const index = buildTickIndex(buf, k.label);
    if (index.n !== k.records) fail(`${k.key} 원본 레코드 ${index.n} ≠ ${k.records}`);
    const a3 = a3ColumnsOf(buf, index);

    const fillMs = kf.map((f) => f.gw_time_ms).sort((x, y) => x - y);
    const evMs = ke.map((e) => e.gw_time_ms).sort((x, y) => x - y);
    const cums = new Set();
    const ranges = [];
    for (const e of ke) {
      if (e.cum_volume > 0) cums.add(e.cum_volume);
      if (e.ev_kind === 2) {
        cums.add(e.ev_qty_after);
        if (e.ev_qty_after > e.ev_qty_before) ranges.push([e.ev_qty_before, e.ev_qty_after]);
      }
    }
    const recvMs = (rec) => Number(index.recvNs[rec] / 1000n) / 1000;
    const nearEvent = (rec) => {
      const r = recvMs(rec);
      return anyIn(evMs, r - 500, r + 3500); // r ∈ [e − 3500, e + 500]
    };

    const keep = new Uint8Array(index.n);
    for (let j = 0; j < a3.n; j++) {
      const rec = a3.rec[j];
      const t = a3TimeMs(index, a3, j);
      const cv = a3.cumVolume[j];
      if (
        anyIn(fillMs, t - 1000, t + 3000) || // t ∈ [g − 3000, g + 1000]
        nearEvent(rec) ||
        cums.has(cv) ||
        ranges.some(([lo, hi]) => cv > lo && cv <= hi)
      ) {
        keep[rec] = 1;
      }
    }
    for (let rec = 0; rec < index.n; rec++) {
      if (index.tag[rec] === TAG_CODE.B6 && index.ok[rec] === 1 && nearEvent(rec)) keep[rec] = 1;
    }
    const chunks = [];
    for (let rec = 0; rec < index.n; rec++) {
      if (keep[rec] !== 1) continue;
      const o = index.off[rec];
      chunks.push(encodeRecord(index.recvNs[rec], buf.subarray(o, o + index.len[rec])));
    }
    const win = concatBytes(chunks);
    const z = zstd19(win);
    const name = `own1030-${k.label}-${k.isin}.ticks.zst`;
    if (z.length > MAX_BYTES) fail(`${name} ${z.length}B > ${MAX_BYTES}B`);

    // 동일성 자기검사 — 원본 격자 = 창 격자(압축을 푼 바이트로 다시 읽어 픽스처 경로와 같게)
    const winBuf = unzstd(z);
    const wIndex = buildTickIndex(winBuf, k.label);
    const wA3 = a3ColumnsOf(winBuf, wIndex);
    const ins = kf.map((f) => ({ gwMs: f.gw_time_ms, px: f.exec_price, qty: f.exec_qty }));
    const mOrig = matchOwnFills(index, a3, ins).map((m) => matchView(index, a3, m));
    const mWin = matchOwnFills(wIndex, wA3, ins).map((m) => matchView(wIndex, wA3, m));
    for (let i = 0; i < ins.length; i++) {
      if (JSON.stringify(mOrig[i]) !== JSON.stringify(mWin[i])) {
        fail(`${k.key} 체결 #${i} 짝짓기가 원본과 창 격자에서 다르다(원본 ${JSON.stringify(mOrig[i])} · 창 ${JSON.stringify(mWin[i])})`);
      }
    }
    const matched = mOrig.filter((m) => m.a3 !== null).length;
    out.set(name, z);
    report.push({ key: k.key, records: index.n, kept: wIndex.n, bytes: z.length, fills: kf.length, matched, events: ke.length });
  }

  const source = {
    date: "2026-10-30",
    events: events.length,
    events_file: EVENTS_FILE,
    fills: fills.length,
    fills_file: FILLS_FILE,
    grids: KEYS.map((k) => `${k.key}.zst`),
    keys: KEYS.map((k) => k.key),
  };
  out.set(JOURNAL_FILE, new TextEncoder().encode(journalText(source, fills, events)));
  return { out, report, accounts: acc.size };
}

const { out, report, accounts } = build(args.in);
for (const r of report) {
  console.log(
    `${r.key} 원본 ${r.records} → 남김 ${r.kept} · ${r.bytes}B · 체결 ${r.fills}(짝 ${r.matched}) · 이벤트 ${r.events}`,
  );
}
const total = report.reduce((s, r) => s + r.bytes, 0);
console.log(`격자 합 ${total}B · 저널 ${out.get(JOURNAL_FILE).length}B · 익명 계좌 ${accounts}개`);

if (args.check) {
  const tmp = mkdtempSync(join(tmpdir(), "gen-own-fixtures-"));
  try {
    let bad = 0;
    for (const [name, bytes] of out) {
      writeFileSync(join(tmp, name), bytes);
      const p = join(args.out, name);
      if (!existsSync(p)) {
        console.error(`[--check] ${name}: ${args.out} 에 없다`);
        bad += 1;
        continue;
      }
      if (!Buffer.from(bytes).equals(readFileSync(p))) {
        console.error(`[--check] ${name}: 바이트가 다르다`);
        bad += 1;
      }
    }
    if (bad > 0) fail(`--check 불일치 ${bad}건`);
    console.log(`[--check] ${out.size}개 파일 바이트 일치`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
} else {
  for (const [name, bytes] of out) writeFileSync(join(args.out, name), bytes);
  console.log(`${out.size}개 파일 → ${args.out}`);
}
