/**
 * tickgw 내부 live 클라이언트(quick 261104-n7i · D-3) — launch-live 모드가 radar-gw tickgw 의 **당일** 원본 바이트를 받는다.
 *
 * 계약(tickgw/src/server.ts live · 변경 없음):
 *   GET {TICKGW_URL}/internal/ticks/live?isin&ex=KRX|NXT&epoch&offset · 헤더 `X-Tickgw-Secret`
 *     날짜 = tickgw 의 KST 오늘 · 요청마다 리스 30초 갱신(poller.touch — 활성 8키 = 처음 touch 순)
 *     200 본문 = 원본 zstd 프레임 바이트(offset..end · 8MiB 청크 경계 상한) · 헤더 이름은 shared `TICK_LIVE_HEADERS`
 *         (Epoch · Offset-End · Last-Recv-Ns · State loading|ready|queued|delayed|blocked · Queue · Complete · More · As-Of-Ms)
 *     409 `{epoch}` — epoch 불일치 · epoch 없이 offset>0 · offset>끝 → 그 epoch 로 offset 0 부터 다시
 *     503 CACHE_UNAVAILABLE · 400 BAD_REQUEST · 401 비밀 불일치
 *
 * 방향: Cloud Run Job → radar-gw(Direct VPC private-ranges-only · URL 은 config.checkTickgwUrl 가 사설 대역만 허용).
 * 비밀은 요청 헤더에만 싣는다 — URL · 로그 · 오류 문구에 넣지 않는다.
 *
 * 키 하루치 받기 루프(`fetchLiveDay` · 웹 use-tick-live ② 의 워커판):
 *   200 → 본문을 쌓고 offset = Offset-End · epoch = Epoch
 *         More=true → 대기 없이 곧바로 이어 받기
 *         loading   → LIVE_POLL_MS 뒤 이어 받기(요청 자체가 리스 갱신)
 *         queued    → LIVE_POLL_MS 뒤 다시 · 처음 queued 뒤 LIVE_QUEUED_GIVEUP_MS 를 넘으면 deferred queued(한 키가 run 예산을 다 먹지 않게)
 *         delayed   → LIVE_DELAYED_MS 뒤 다시(캐시 full · 백오프)
 *         blocked   → failed(인덱서 인자 오류 · 너무 큼)
 *         ready     → Complete=false 면 deferred incomplete(구멍 있는 하루 — 계산하지 않음) ·
 *                     asOf(As-Of-Ms, 비면 Last-Recv-Ns/1e6) 가 없거나 needMs 미만이면 LIVE_POLL_MS 뒤 다시 · 아니면 done
 *   409 → 새 epoch · offset 0 · 쌓은 본문 버림 · 곧바로 다시(연속 LIVE_MAX_CONFLICTS 회를 넘으면 failed — 엔트리가 계속 바뀜)
 *   503 · 그 밖 4xx/5xx · 네트워크/타임아웃 throw → failed(사유에 상태 코드 · 오류 이름)
 *   401 → TickgwAuthError 를 그대로 올린다(run 실패 — 비밀 · 배포 문제)
 *   데드라인(clock() > deadlineMs) → deferred timeout(다음 run 이 잇는다)
 * 매 요청 직전 clock() 을 lastReqAt 으로 남긴다 — 모드의 리스 인식 게이트 입력(우리 리스 = lastReqAt + 30초).
 */
import { TICK_LIVE_HEADERS, concatBytes } from "@gh-radar/shared";
import { SECRET_HEADER, type TickgwEx } from "./tickgw-export";

/** loading · queued · ready(asOf 미달) 재요청 간격 — 웹 TICK_LIVE_LOADING_MS 와 같은 값. */
export const LIVE_POLL_MS = 2000;
/** delayed(백오프 · 캐시 full) 재요청 간격. */
export const LIVE_DELAYED_MS = 5000;
/** queued 가 처음 보인 뒤 이만큼 지나도 활성이 못 되면 그 키는 deferred queued. */
export const LIVE_QUEUED_GIVEUP_MS = 20_000;
/** 409 가 연달아 이만큼 넘게 오면 그 키는 failed(엔트리가 계속 바뀐다 · 무한 루프 방지). */
export const LIVE_MAX_CONFLICTS = 3;

/** tickgw 가 401 로 거절했다 — 비밀 불일치(run 실패). 메시지에 비밀을 넣지 않는다. */
export class TickgwAuthError extends Error {
  constructor() {
    super("tickgw live: HTTP 401 — TICKGW_SECRET 불일치");
    this.name = "TickgwAuthError";
  }
}

/** 200 응답을 읽은 값. */
export type LiveOk = {
  kind: "ok";
  status: 200;
  body: Uint8Array;
  epoch: string;
  offsetEnd: number;
  state: string;
  queue: number;
  complete: boolean;
  more: boolean;
  /** As-Of-Ms(숫자) · 비면 Last-Recv-Ns/1e6 · 둘 다 없으면 null. */
  asOfMs: number | null;
};
/** 409 — 그 epoch 로 offset 0 부터 다시. */
export type LiveConflict = { kind: "conflict"; status: 409; epoch: string };
/** 그 밖(503 · 400 · 5xx · 헤더 모양 위반) — 키 실패. */
export type LiveError = { kind: "error"; status: number; error: string };
export type LiveResp = LiveOk | LiveConflict | LiveError;

export interface TickgwLiveClient {
  get(isin: string, ex: TickgwEx, offset: number, epoch?: string): Promise<LiveResp>;
}

export type TickgwLiveOptions = {
  /** 사설 대역 URL(config.checkTickgwUrl 를 거친 값 · 끝 `/` 없음). */
  url: string;
  secret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const NAT_RE = /^\d{1,20}$/;

/** As-Of-Ms 가 숫자면 그 값 · 비었으면 Last-Recv-Ns(십진 ns)를 ms 로 내린 값 · 둘 다 없으면 null. */
function asOfOf(asOfRaw: string | null, lastRecvRaw: string | null): number | null {
  const a = (asOfRaw ?? "").trim();
  if (NAT_RE.test(a)) return Number(a);
  const l = (lastRecvRaw ?? "").trim();
  if (NAT_RE.test(l)) return Number(BigInt(l) / 1_000_000n);
  return null;
}

async function errorOf(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { error?: unknown };
    return typeof b?.error === "string" ? b.error : "";
  } catch {
    return "";
  }
}

export function createTickgwLiveClient({
  url,
  secret,
  fetchImpl = fetch,
  timeoutMs = 30_000,
}: TickgwLiveOptions): TickgwLiveClient {
  return {
    async get(isin, ex, offset, epoch) {
      const q = new URLSearchParams({ isin, ex, epoch: epoch ?? "", offset: String(offset) });
      const res = await fetchImpl(`${url}/internal/ticks/live?${q.toString()}`, {
        method: "GET",
        headers: { [SECRET_HEADER]: secret },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 401) throw new TickgwAuthError();
      if (res.status === 409) {
        let e: unknown;
        try {
          e = ((await res.json()) as { epoch?: unknown })?.epoch;
        } catch {
          e = undefined;
        }
        if (typeof e !== "string" || e === "") return { kind: "error", status: 409, error: "409 응답에 epoch 없음" };
        return { kind: "conflict", status: 409, epoch: e };
      }
      if (res.status !== 200) {
        const err = await errorOf(res);
        return { kind: "error", status: res.status, error: `HTTP ${res.status}${err ? ` ${err}` : ""}` };
      }
      const h = (name: string): string | null => res.headers.get(name);
      const epochH = h(TICK_LIVE_HEADERS.epoch) ?? "";
      const endH = h(TICK_LIVE_HEADERS.offsetEnd) ?? "";
      if (epochH === "" || !NAT_RE.test(endH)) {
        return { kind: "error", status: 200, error: "200 응답 헤더 모양 위반(X-Tick-Epoch · X-Tick-Offset-End)" };
      }
      const queueH = h(TICK_LIVE_HEADERS.queue) ?? "";
      return {
        kind: "ok",
        status: 200,
        body: new Uint8Array(await res.arrayBuffer()),
        epoch: epochH,
        offsetEnd: Number(endH),
        state: h(TICK_LIVE_HEADERS.state) ?? "",
        queue: NAT_RE.test(queueH) ? Number(queueH) : 0,
        complete: h(TICK_LIVE_HEADERS.complete) === "true",
        more: h(TICK_LIVE_HEADERS.more) === "true",
        asOfMs: asOfOf(h(TICK_LIVE_HEADERS.asOfMs), h(TICK_LIVE_HEADERS.lastRecvNs)),
      };
    },
  };
}

export type FetchLiveDayOptions = {
  isin: string;
  ex: TickgwEx;
  /** asOf 가 이 시각(epoch ms) 이상이어야 done — 그 키 조각 fire_base 최대 + 여유. */
  needMs: number;
  /** clock() 이 이 값을 넘으면 deferred timeout. */
  deadlineMs: number;
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
};

type LoopStats = { bytes: number; requests: number; lastReqAt: number };

export type LiveDayResult =
  | ({ kind: "done"; raw: Uint8Array; asOfMs: number } & LoopStats)
  | ({ kind: "deferred"; reason: "timeout" | "queued" | "incomplete"; asOfMs: number | null; state: string | null } & LoopStats)
  | ({ kind: "failed"; reason: string } & LoopStats);

/** 키 하나 하루치(08:00~as-of) 압축 바이트 받기 — 위 머리 주석의 루프. 401 만 throw(TickgwAuthError). */
export async function fetchLiveDay(client: TickgwLiveClient, o: FetchLiveDayOptions): Promise<LiveDayResult> {
  let parts: Uint8Array[] = [];
  let offset = 0;
  let epoch: string | undefined;
  let queuedSince: number | null = null;
  let conflicts = 0;
  let lastState: string | null = null;
  let lastAsOf: number | null = null;
  const st: LoopStats = { bytes: 0, requests: 0, lastReqAt: o.clock() };
  const stats = (): LoopStats => ({ ...st });

  for (;;) {
    if (o.clock() > o.deadlineMs) {
      return { kind: "deferred", reason: "timeout", asOfMs: lastAsOf, state: lastState, ...stats() };
    }
    st.lastReqAt = o.clock();
    st.requests += 1;
    let r: LiveResp;
    try {
      r = await client.get(o.isin, o.ex, offset, epoch);
    } catch (err) {
      if (err instanceof TickgwAuthError) throw err;
      const name = err instanceof Error ? err.name : "Error";
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "failed", reason: `network ${name}: ${msg}`, ...stats() };
    }
    if (r.kind === "conflict") {
      conflicts += 1;
      if (conflicts > LIVE_MAX_CONFLICTS) return { kind: "failed", reason: `409 연속 ${conflicts}회(엔트리가 계속 바뀜)`, ...stats() };
      epoch = r.epoch;
      offset = 0;
      parts = [];
      st.bytes = 0;
      continue;
    }
    if (r.kind === "error") return { kind: "failed", reason: r.error, ...stats() };

    conflicts = 0;
    if (r.body.length > 0) parts.push(r.body);
    st.bytes += r.body.length;
    offset = r.offsetEnd;
    epoch = r.epoch;
    lastState = r.state;
    lastAsOf = r.asOfMs;
    if (r.more) continue;

    if (r.state !== "queued") queuedSince = null;
    switch (r.state) {
      case "loading":
        await o.sleep(LIVE_POLL_MS);
        continue;
      case "queued": {
        const now = o.clock();
        if (queuedSince === null) queuedSince = now;
        if (now - queuedSince > LIVE_QUEUED_GIVEUP_MS) {
          return { kind: "deferred", reason: "queued", asOfMs: lastAsOf, state: r.state, ...stats() };
        }
        await o.sleep(LIVE_POLL_MS);
        continue;
      }
      case "delayed":
        await o.sleep(LIVE_DELAYED_MS);
        continue;
      case "blocked":
        return { kind: "failed", reason: "state blocked", ...stats() };
      case "ready":
        if (!r.complete) return { kind: "deferred", reason: "incomplete", asOfMs: lastAsOf, state: r.state, ...stats() };
        if (r.asOfMs === null || r.asOfMs < o.needMs) {
          await o.sleep(LIVE_POLL_MS);
          continue;
        }
        return { kind: "done", raw: concatBytes(parts), asOfMs: r.asOfMs, ...stats() };
      default:
        return { kind: "failed", reason: `모르는 state ${JSON.stringify(r.state)}`, ...stats() };
    }
  }
}
