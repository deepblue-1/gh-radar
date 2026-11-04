/**
 * 가짜 tickgw live(quick 261104-n7i) — 진짜 `createTickgwLiveClient` 에 넣을 `fetchImpl`. 요청(URL · 헤더)을 기록하고,
 * 응답은 시험이 정한다(`reply(req, i)` → 상태 · 본문 · 헤더 · 또는 throw 할 Error).
 *
 * `serveDay(bytes, opts)` 는 tickgw live 핸들러 흉내다 — offset..min(offset+cap, 끝) 을 내고, 더 있으면 More=true · state loading,
 * 끝이면 state(기본 ready) · Complete · As-Of-Ms 를 낸다. epoch 없이 offset>0 이거나 epoch 가 다르면 409 `{epoch}`.
 */
import { TICK_LIVE_HEADERS } from "@gh-radar/shared";

export type LiveReq = { url: URL; isin: string; ex: string; offset: number; epoch: string; headers: Record<string, string> };

export type LiveReply =
  | Error
  | {
      status?: number;
      body?: Uint8Array;
      json?: unknown;
      epoch?: string;
      offsetEnd?: number;
      state?: string;
      queue?: number;
      complete?: boolean;
      more?: boolean;
      /** "" = 옛 tickgw(빈 헤더) · undefined = 헤더 없음. */
      asOfMs?: number | "";
      lastRecvNs?: string;
    };

export function liveFetch(reply: (req: LiveReq, i: number) => LiveReply): { fetchImpl: typeof fetch; reqs: LiveReq[] } {
  const reqs: LiveReq[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const req: LiveReq = {
      url,
      isin: url.searchParams.get("isin") ?? "",
      ex: url.searchParams.get("ex") ?? "",
      offset: Number(url.searchParams.get("offset") ?? "0"),
      epoch: url.searchParams.get("epoch") ?? "",
      headers,
    };
    const i = reqs.length;
    reqs.push(req);
    const r = reply(req, i);
    if (r instanceof Error) throw r;
    const status = r.status ?? 200;
    if (r.json !== undefined) {
      return new Response(JSON.stringify(r.json), { status, headers: { "Content-Type": "application/json" } });
    }
    if (status !== 200) return new Response(null, { status });
    const body = r.body ?? new Uint8Array(0);
    const h: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      [TICK_LIVE_HEADERS.epoch]: r.epoch ?? "ep-1",
      [TICK_LIVE_HEADERS.offsetEnd]: String(r.offsetEnd ?? req.offset + body.length),
      [TICK_LIVE_HEADERS.lastRecvNs]: r.lastRecvNs ?? "",
      [TICK_LIVE_HEADERS.state]: r.state ?? "ready",
      [TICK_LIVE_HEADERS.queue]: String(r.queue ?? 0),
      [TICK_LIVE_HEADERS.complete]: r.complete === false ? "false" : "true",
      [TICK_LIVE_HEADERS.more]: r.more ? "true" : "false",
    };
    if (r.asOfMs !== undefined) h[TICK_LIVE_HEADERS.asOfMs] = String(r.asOfMs);
    return new Response(body.slice(), { status: 200, headers: h });
  }) as typeof fetch;
  return { fetchImpl, reqs };
}

/** tickgw live 핸들러 흉내 — 한 키 하루치 바이트를 cap 바이트씩. */
export function serveDay(
  bytes: Uint8Array,
  opts: { asOfMs: number | ""; cap?: number; epoch?: string; state?: string; complete?: boolean },
): (req: LiveReq) => LiveReply {
  const epoch = opts.epoch ?? "ep-1";
  const cap = opts.cap ?? bytes.length;
  return (req) => {
    if ((req.epoch !== "" && req.epoch !== epoch) || (req.epoch === "" && req.offset > 0) || req.offset > bytes.length) {
      return { status: 409, json: { epoch } };
    }
    const end = Math.min(bytes.length, req.offset + cap);
    const more = end < bytes.length;
    return {
      body: bytes.slice(req.offset, end),
      epoch,
      offsetEnd: end,
      more,
      state: more ? "loading" : (opts.state ?? "ready"),
      complete: opts.complete ?? true,
      asOfMs: opts.asOfMs,
    };
  };
}

/** 가상 시계 — sleep 이 시계를 전진시킨다. */
export function virtualClock(start = 0): { clock: () => number; sleep: (ms: number) => Promise<void>; sleeps: number[]; advance: (ms: number) => void } {
  let t = start;
  const sleeps: number[] = [];
  return {
    clock: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
    advance: (ms) => {
      t += ms;
    },
  };
}
