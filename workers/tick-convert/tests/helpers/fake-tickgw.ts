/**
 * 가짜 tickgw(37-09 export 계약) — node:http 로 127.0.0.1 임의 포트에 뜬다. 승격 시험(37-12)이 진짜 fetch 경로를 그대로 탄다.
 *
 *   GET /internal/ticks/export?date=        → `{date, keys, unclosed}` (closed 키만 · ns 는 십진 문자열 ·
 *                                              레코드 0건 키는 first/last_recv_ns **null** — 실제 tickgw server.ts exportList 와 같다 · CR-30)
 *   GET /internal/ticks/export/bytes?date&isin&ex → 원본 레코드를 **두 zstd 프레임으로 나눠 이어붙인** 바이트(+X-Tick-Records)
 *   비밀 헤더 `X-Tickgw-Secret` 틀리면 401 · date ≠ today 면 400 DATE_MISMATCH · closed 아니면 404 NOT_CLOSED
 *
 * 상태(`state`)는 시험이 실행 사이에 바꾼다(두 번째 실행에서 키를 closed 로 바꾸기 등).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { concatBytes, encodeRecord } from "@gh-radar/shared";

export type FakeKey = {
  isin: string;
  ex: "KRX" | "NXT";
  /** 레코드(recvNs, payload) — 수신순. */
  recs: { recvNs: bigint; payload: Uint8Array }[];
  closed: boolean;
  closedThroughNs: bigint;
  /** export 목록의 records 를 일부러 틀리게(재확인 시험). 없으면 recs.length. */
  recordsOverride?: number;
  /** bytes 응답 상태 코드 덮기(예 500). */
  bytesStatus?: number;
  /** export 목록 항목에 덮어쓸 필드(계약 위반 키 흉내 — 예 `{ bytes: -1 }`). */
  listPatch?: Record<string, unknown>;
};

export type FakeTickgwState = {
  secret: string;
  /** tickgw 의 KST 오늘 — 요청 date 가 다르면 400 DATE_MISMATCH. */
  today: string;
  /** export 목록 응답의 date 를 덮는다(캐시 날짜가 어긋난 tickgw 흉내 — 검사는 today 로 통과시키고 응답만 다른 날). */
  listDate?: string;
  keys: FakeKey[];
  /** closed 가 아닌 키 수에 더할 값(LRU 로 밀린 키 등). */
  extraUnclosed?: number;
};

export type FakeTickgw = {
  url: string;
  state: FakeTickgwState;
  /** 받은 요청 경로(쿼리 포함) — 순서대로. */
  hits: string[];
  /** 키의 원시 레코드 바이트(`<IIII>` + payload 이어붙임). */
  rawOf(k: FakeKey): Uint8Array;
  /** 키의 응답 바이트(두 프레임 이어붙임). */
  servedOf(k: FakeKey): Uint8Array;
  close(): Promise<void>;
};

export function rawOf(k: FakeKey): Uint8Array {
  return concatBytes(k.recs.map((r) => encodeRecord(r.recvNs, r.payload)));
}

/** 레코드 경계에서 둘로 나눠 프레임 두 개로 압축해 이어붙인다(119 가 폴링마다 프레임을 하나씩 준 모양). */
export function servedOf(k: FakeKey): Uint8Array {
  const half = Math.max(1, Math.floor(k.recs.length / 2));
  const parts = [k.recs.slice(0, half), k.recs.slice(half)].filter((p) => p.length > 0);
  return concatBytes(
    parts.map((p) => new Uint8Array(zlib.zstdCompressSync(concatBytes(p.map((r) => encodeRecord(r.recvNs, r.payload)))))),
  );
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(s) });
  res.end(s);
}

export async function startFakeTickgw(state: FakeTickgwState): Promise<FakeTickgw> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    hits.push(`${url.pathname}${url.search}`);
    if (req.headers["x-tickgw-secret"] !== state.secret) return send(res, 401, { error: "UNAUTHORIZED" });
    const date = url.searchParams.get("date") ?? "";
    if (date !== state.today) return send(res, 400, { error: "DATE_MISMATCH", today: state.today });
    if (url.pathname === "/internal/ticks/export") {
      const closed = state.keys.filter((k) => k.closed);
      return send(res, 200, {
        date: state.listDate ?? state.today,
        keys: closed.map((k) => {
          const raw = rawOf(k);
          return {
            isin: k.isin,
            ex: k.ex,
            bytes: servedOf(k).length,
            records: k.recordsOverride ?? k.recs.length,
            // 실제 tickgw 계약 — 레코드 0건이면 null(String(0n) = "0" 이 아니다 · CR-30)
            first_recv_ns: k.recs.length > 0 ? String(k.recs[0]!.recvNs) : null,
            last_recv_ns: k.recs.length > 0 ? String(k.recs[k.recs.length - 1]!.recvNs) : null,
            closed_through_ns: String(k.closedThroughNs),
            _raw: raw.length, // 계약 밖 필드 — 클라이언트가 무시해야 한다
            ...k.listPatch,
          };
        }),
        unclosed: state.keys.filter((k) => !k.closed).length + (state.extraUnclosed ?? 0),
      });
    }
    if (url.pathname === "/internal/ticks/export/bytes") {
      const k = state.keys.find((x) => x.isin === url.searchParams.get("isin") && x.ex === url.searchParams.get("ex"));
      if (!k || !k.closed) return send(res, 404, { error: "NOT_CLOSED" });
      if (k.bytesStatus !== undefined) return send(res, k.bytesStatus, { error: "BOOM" });
      const body = servedOf(k);
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": body.length,
        "X-Tick-Records": String(k.recs.length),
      });
      return res.end(body);
    }
    return send(res, 404, { error: "NOT_FOUND" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    hits,
    rawOf,
    servedOf,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((e) => (e ? reject(e) : resolve()));
      }),
  };
}
