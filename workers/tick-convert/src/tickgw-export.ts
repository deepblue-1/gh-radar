/**
 * tickgw 내부 export 클라이언트(37-12 · 37-09 계약) — 승격 Job 이 radar-gw tickgw 의 당일 캐시를 당겨 온다.
 *
 *   GET /internal/ticks/export?date=YYYYMMDD
 *       200 `{ date, keys: [{ isin, ex, bytes, records, first_recv_ns, last_recv_ns, closed_through_ns }], unclosed }`
 *           — 20:01 마감 마무리가 끝난 **closed 키만** · ns 는 십진 문자열 ·
 *           레코드 0건 키(NXT 비상장 · 거래정지 등)는 `first_recv_ns` · `last_recv_ns` 가 **null** 이다(tickgw server.ts 실제 계약 · CR-30)
 *       400 `{ error: "DATE_MISMATCH", today }` — date 가 tickgw 의 KST 오늘이 아니다
 *   GET /internal/ticks/export/bytes?date&isin&ex
 *       200 원본 zstd 프레임을 이어붙인 바이트(풀 때 `splitZstdFrames` 로 나눈다 — Node zstd 는 첫 프레임만 푼다)
 *       404 `{ error: "NOT_CLOSED" }` · 400 DATE_MISMATCH
 *   둘 다 헤더 `X-Tickgw-Secret` 필수(틀리면 401).
 *
 * 방향: Job → radar-gw(Direct VPC private-ranges-only). radar-gw 에는 Supabase 키를 두지 않는다(D-07).
 * 비밀은 헤더에만 싣는다 — 오류 메시지 · 로그에 넣지 않는다.
 *
 * 키 단위 격리(CR-30): 목록 응답의 바깥 모양(`{date, keys[], unclosed}`)이 틀리면 throw(run 실패)지만,
 * **키 하나의 모양 위반은 그 키만 `rejected` 로 내린다** — 키 하나 때문에 그날 승격 전체가 죽지 않게.
 */

export type TickgwEx = "KRX" | "NXT";

export interface TickgwExportKey {
  isin: string;
  ex: TickgwEx;
  bytes: number;
  records: number;
  /** 레코드 0건 키는 null(tickgw 가 첫/끝 recv 를 모른다). */
  first_recv_ns: string | null;
  last_recv_ns: string | null;
  closed_through_ns: string;
}

/** 모양 검사에 걸린 export 키 — 읽을 수 있는 만큼만 채운다(isin · ex 를 못 읽으면 null). */
export interface TickgwRejectedKey {
  index: number;
  isin: string | null;
  ex: TickgwEx | null;
  reason: string;
}

export interface TickgwExportList {
  date: string;
  keys: TickgwExportKey[];
  /** 키 단위 모양 위반(CR-30) — 다른 키는 그대로 승격한다. */
  rejected: TickgwRejectedKey[];
  /** 오늘 키 중 마감 마무리가 끝나지 않아 export 에서 빠진 키 수. */
  unclosed: number;
}

export interface TickgwExportClient {
  list(date: string): Promise<TickgwExportList>;
  bytes(date: string, isin: string, ex: TickgwEx): Promise<Uint8Array>;
}

export type TickgwExportOptions = {
  /** 사설 대역 URL(config.checkTickgwUrl 를 거친 값 · 끝 `/` 없음). */
  url: string;
  secret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** tickgw 가 400 DATE_MISMATCH 로 거절했다 — 요청 날짜와 tickgw 캐시 날짜(KST 오늘)가 다르다. */
export class TickgwDateMismatchError extends Error {
  constructor(
    readonly requested: string,
    readonly today: string | null,
  ) {
    super(`tickgw export: DATE_MISMATCH (요청 ${requested} · tickgw 오늘 ${today ?? "?"})`);
    this.name = "TickgwDateMismatchError";
  }
}

export const SECRET_HEADER = "X-Tickgw-Secret";
const NS_RE = /^\d{1,20}$/;
const ISIN_RE = /^[A-Z0-9]{12}$/;

function isNat(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function checkKey(k: unknown, i: number): TickgwExportKey {
  const o = (k ?? {}) as Record<string, unknown>;
  const bad = (what: string): never => {
    throw new Error(`tickgw export: keys[${i}] ${what} 가 계약 모양이 아니다`);
  };
  if (typeof o.isin !== "string" || !ISIN_RE.test(o.isin)) bad("isin");
  if (o.ex !== "KRX" && o.ex !== "NXT") bad("ex");
  if (!isNat(o.bytes)) bad("bytes");
  if (!isNat(o.records)) bad("records");
  // first/last 는 레코드 0건 키에서 null(CR-30) · closed_through 는 언제나 필수
  for (const f of ["first_recv_ns", "last_recv_ns"] as const) {
    if (o[f] !== null && (typeof o[f] !== "string" || !NS_RE.test(o[f] as string))) bad(f);
  }
  if (typeof o.closed_through_ns !== "string" || !NS_RE.test(o.closed_through_ns)) bad("closed_through_ns");
  return {
    isin: o.isin as string,
    ex: o.ex as TickgwEx,
    bytes: o.bytes as number,
    records: o.records as number,
    first_recv_ns: o.first_recv_ns as string | null,
    last_recv_ns: o.last_recv_ns as string | null,
    closed_through_ns: o.closed_through_ns as string,
  };
}

/** 키 하나씩 검사 — 통과는 keys, 위반은 rejected(그 키만). */
function splitKeys(raw: unknown[]): { keys: TickgwExportKey[]; rejected: TickgwRejectedKey[] } {
  const keys: TickgwExportKey[] = [];
  const rejected: TickgwRejectedKey[] = [];
  raw.forEach((k, i) => {
    try {
      keys.push(checkKey(k, i));
    } catch (err) {
      const o = (k ?? {}) as Record<string, unknown>;
      rejected.push({
        index: i,
        isin: typeof o.isin === "string" && ISIN_RE.test(o.isin) ? o.isin : null,
        ex: o.ex === "KRX" || o.ex === "NXT" ? o.ex : null,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  });
  return { keys, rejected };
}

async function errorBody(res: Response): Promise<{ error?: string; today?: string }> {
  try {
    return (await res.json()) as { error?: string; today?: string };
  } catch {
    return {};
  }
}

export function createTickgwExportClient({
  url,
  secret,
  fetchImpl = fetch,
  timeoutMs = 30_000,
}: TickgwExportOptions): TickgwExportClient {
  const get = (path: string, q: Record<string, string>): Promise<Response> =>
    fetchImpl(`${url}${path}?${new URLSearchParams(q).toString()}`, {
      method: "GET",
      headers: { [SECRET_HEADER]: secret },
      signal: AbortSignal.timeout(timeoutMs),
    });

  return {
    async list(date) {
      const res = await get("/internal/ticks/export", { date });
      if (!res.ok) {
        const b = await errorBody(res);
        if (res.status === 400 && b.error === "DATE_MISMATCH") throw new TickgwDateMismatchError(date, b.today ?? null);
        throw new Error(`tickgw export: HTTP ${res.status} ${b.error ?? ""}`.trim());
      }
      const body = (await res.json()) as Record<string, unknown> | null;
      if (!body || typeof body.date !== "string" || !Array.isArray(body.keys) || !isNat(body.unclosed)) {
        throw new Error("tickgw export: 응답이 {date, keys, unclosed} 가 아니다");
      }
      return { date: body.date, ...splitKeys(body.keys), unclosed: body.unclosed };
    },
    async bytes(date, isin, ex) {
      const res = await get("/internal/ticks/export/bytes", { date, isin, ex });
      if (!res.ok) {
        const b = await errorBody(res);
        if (res.status === 400 && b.error === "DATE_MISMATCH") throw new TickgwDateMismatchError(date, b.today ?? null);
        throw new Error(`tickgw export/bytes ${ex}/${isin}: HTTP ${res.status} ${b.error ?? ""}`.trim());
      }
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
