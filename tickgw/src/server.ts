/**
 * tickgw 내부 HTTP (Phase 37 · D-05 · D-07) — radar-gw :8092 · 방화벽 tcp:8092 ← 10.10.0.0/26(Cloud Run 서브넷)만.
 *
 * ── 계약(우리 소유 — 37-15 server · 37-12 승격이 쓴다. 바꾸면 세 곳을 함께) ─────────────
 *   GET /healthz                              무인증 · `{ ok, keys, bytes }`
 *   GET /internal/ticks/live?isin&ex&epoch&offset
 *       헤더 `X-Tickgw-Secret`(timingSafeEqual) 필수 — 틀리면 401
 *       isin `^[A-Z0-9]{12}$` · ex KRX|NXT · offset 음이 아닌 정수(기본 0) · epoch 선택(첫 요청은 비움)
 *       날짜는 언제나 KST 오늘(서버 시계) — 과거 날짜는 격자(Supabase Storage) 몫이다
 *       요청마다 poller.touch(key) → 리스 갱신
 *       epoch 가 주어졌는데 다르면 409 `{ epoch }` · epoch 없이 offset > 0 이어도 409 · offset > 끝이어도 409
 *       200 `application/octet-stream` 본문 = offset 이후 원본 zstd 바이트 · `Cache-Control: no-store`
 *         X-Tick-Epoch · X-Tick-Offset-End(본문 끝 바이트 offset = 다음 요청 offset) · X-Tick-Last-Recv-Ns(없으면 빈 값) ·
 *         X-Tick-State(loading|ready|queued|delayed|blocked) · X-Tick-Queue(대기 순번 k · 활성이면 0) ·
 *         X-Tick-Complete(true|false — 08:00 부터 끊김 없음) ·
 *         X-Tick-As-Of-Ms(이 키를 마지막으로 끝까지(has_more 없이) 읽은 인덱서 호출의 시작 시각 · tickgw 벽시계 epoch ms ·
 *         아직 없으면 빈 값 — 캐시는 이 시각 − 기록 지연까지 다 받았다 · quick-261104-6lh)
 *   GET /internal/ticks/export?date=YYYYMMDD    — 20:00 승격 Job(37-12) 입력 · 같은 비밀 헤더
 *       **closed 키만**(20:01 마감 마무리를 마친 하루치 전체 — D-07) →
 *       `{ date, keys: [{ isin, ex, bytes, records, first_recv_ns, last_recv_ns, closed_through_ns }], unclosed }`
 *       (ns 는 십진 문자열 · unclosed = 그날 키 중 closed 아닌 수)
 *       date 가 KST 오늘이 아니면 400 `{ error: "DATE_MISMATCH", today }` — 승격 Job 의 --date 와 캐시 날짜가 어긋나면 거부
 *   GET /internal/ticks/export/bytes?date&isin&ex — 그 키 전체 바이트(원본 zstd 프레임 이어붙임)
 *       같은 date 검사(400 DATE_MISMATCH) · closed 아니면 404 `{ error: "NOT_CLOSED" }`
 *
 * 로그 위생: 요청 헤더 · 바디를 로그에 넣지 않는다.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

import { TickCache, makeKey } from "./cache.js";
import { kstToday, loadConfig, type TickgwConfig } from "./config.js";
import { runIndexer, type Exchange } from "./indexer.js";
import { log } from "./log.js";
import { Poller } from "./poller.js";

export interface ServerDeps {
  cache: TickCache;
  poller: Poller;
  now: () => number;
}

export const SECRET_HEADER = "x-tickgw-secret";

function digest(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

/** 길이가 달라도 시간이 새지 않게 해시끼리 비교한다. */
export function secretOk(given: string | string[] | undefined, secret: string): boolean {
  if (typeof given !== "string" || given.length === 0) return false;
  return timingSafeEqual(digest(given), digest(secret));
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(s),
    "Cache-Control": "no-store",
  });
  res.end(s);
}

const ISIN_RE = /^[A-Z0-9]{12}$/;

function parseEx(v: string | null): Exchange | null {
  return v === "KRX" || v === "NXT" ? v : null;
}

function parseOffset(v: string | null): number | null {
  if (v === null || v === "") return 0;
  if (!/^\d{1,15}$/.test(v)) return null;
  return Number(v);
}

export function createTickgwServer(cfg: Pick<TickgwConfig, "secret">, deps: ServerDeps): http.Server {
  return http.createServer((req, res) => {
    try {
      handle(cfg, deps, req, res);
    } catch (e) {
      log("error", "request error", { err: String((e as Error).message ?? e) });
      if (!res.headersSent) json(res, 500, { error: "INTERNAL" });
      else res.destroy();
    }
  });
}

function handle(cfg: Pick<TickgwConfig, "secret">, deps: ServerDeps, req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://tickgw.local");
  if (req.method !== "GET") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });

  if (url.pathname === "/healthz") {
    return json(res, 200, { ok: true, keys: deps.cache.size(), bytes: deps.cache.totalBytes() });
  }
  if (!url.pathname.startsWith("/internal/ticks/")) return json(res, 404, { error: "NOT_FOUND" });
  if (!secretOk(req.headers[SECRET_HEADER], cfg.secret)) return json(res, 401, { error: "UNAUTHORIZED" });

  if (url.pathname === "/internal/ticks/live") return live(deps, url, res);
  if (url.pathname === "/internal/ticks/export") return exportList(deps, url, res);
  if (url.pathname === "/internal/ticks/export/bytes") return exportBytes(deps, url, res);
  return json(res, 404, { error: "NOT_FOUND" });
}

/** date 검사 — 형식이 틀리면 400 BAD_REQUEST, KST 오늘이 아니면 400 DATE_MISMATCH. 통과면 date. */
function checkDate(deps: ServerDeps, url: URL, res: http.ServerResponse): string | null {
  const date = url.searchParams.get("date") ?? "";
  if (!/^\d{8}$/.test(date)) {
    json(res, 400, { error: "BAD_REQUEST" });
    return null;
  }
  const today = kstToday(deps.now());
  if (date !== today) {
    json(res, 400, { error: "DATE_MISMATCH", today });
    return null;
  }
  return date;
}

function exportList(deps: ServerDeps, url: URL, res: http.ServerResponse): void {
  const date = checkDate(deps, url, res);
  if (!date) return;
  const day = deps.cache.values().filter((e) => e.date === date);
  const keys = day
    .filter((e) => e.closed)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((e) => ({
      isin: e.isin,
      ex: e.ex,
      bytes: e.size,
      records: e.records,
      first_recv_ns: e.firstRecvNs === null ? null : String(e.firstRecvNs),
      last_recv_ns: e.lastRecvNs === null ? null : String(e.lastRecvNs),
      closed_through_ns: String(e.closedThroughNs),
    }));
  json(res, 200, { date, keys, unclosed: day.length - keys.length });
}

function exportBytes(deps: ServerDeps, url: URL, res: http.ServerResponse): void {
  const isin = url.searchParams.get("isin") ?? "";
  const ex = parseEx(url.searchParams.get("ex"));
  if (!ISIN_RE.test(isin) || !ex) return json(res, 400, { error: "BAD_REQUEST" });
  const date = checkDate(deps, url, res);
  if (!date) return;
  const key = makeKey(isin, ex, date);
  const entry = deps.cache.get(key);
  if (!entry || !entry.closed) return json(res, 404, { error: "NOT_CLOSED" });
  const body = deps.cache.slice(key, 0);
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Tick-Records": String(entry.records),
  });
  res.end(body);
}

function live(deps: ServerDeps, url: URL, res: http.ServerResponse): void {
  const q = url.searchParams;
  const isin = q.get("isin") ?? "";
  const ex = parseEx(q.get("ex"));
  const offset = parseOffset(q.get("offset"));
  const epoch = q.get("epoch") ?? "";
  if (!ISIN_RE.test(isin) || !ex || offset === null || epoch.length > 64) {
    return json(res, 400, { error: "BAD_REQUEST" });
  }
  const now = deps.now();
  const key = makeKey(isin, ex, kstToday(now));
  const st = deps.poller.touch(key);
  const entry = deps.cache.get(key);
  if (!entry) return json(res, 503, { error: "CACHE_UNAVAILABLE" });

  const end = entry.size;
  if ((epoch !== "" && epoch !== entry.epoch) || (epoch === "" && offset > 0) || offset > end) {
    return json(res, 409, { epoch: entry.epoch });
  }
  const body = deps.cache.slice(key, offset, end);
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Tick-Epoch": entry.epoch,
    "X-Tick-Offset-End": String(end),
    "X-Tick-Last-Recv-Ns": entry.lastRecvNs === null ? "" : String(entry.lastRecvNs),
    "X-Tick-State": st.state,
    "X-Tick-Queue": String(st.queue),
    "X-Tick-Complete": entry.complete ? "true" : "false",
    "X-Tick-As-Of-Ms": entry.asOfMs === null ? "" : String(entry.asOfMs),
  });
  res.end(body);
}

// ---------------------------------------------------------------- 진입

export function main(): void {
  const cfg = loadConfig();
  const cache = new TickCache(cfg.cacheBytes, cfg.idleMs, cfg.keepUntilHhmm);
  const poller = new Poller(cfg, {
    cache,
    runIndexer: (args) =>
      runIndexer(args, {
        sshBin: cfg.sshBin,
        host: cfg.indexerHost,
        key: cfg.sshKey,
        knownHosts: cfg.knownHosts,
        timeoutMs: cfg.indexerTimeoutMs,
      }),
    now: Date.now,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    random: Math.random,
  });
  const server = createTickgwServer(cfg, { cache, poller, now: Date.now });
  poller.start();
  server.listen(cfg.port, () => {
    log("info", "tickgw listening", { port: cfg.port, max_keys: cfg.maxKeys, cache_bytes: cfg.cacheBytes });
  });
  const shutdown = (sig: string) => {
    log("info", "tickgw shutdown", { sig });
    server.close();
    void poller.stop().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`tickgw: ${String((e as Error).message ?? e)}\n`);
    process.exit(2);
  }
}
