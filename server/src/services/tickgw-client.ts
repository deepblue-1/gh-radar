import axios, { type AxiosInstance } from "axios";
import { TICK_LIVE_HEADERS } from "@gh-radar/shared";

import { logger } from "../logger.js";

/**
 * Phase 37 (D-07 · D-08) — tickgw 내부 HTTP 중계 클라이언트 · **당일 바이트 경로 전용**.
 *
 * 브라우저 → Cloud Run `GET /api/ticks/live`(requireAuth · 게이트 60초 캐시) → **Direct VPC Egress** → radar-gw:8092 →
 * tickgw `/internal/ticks/live`(37-09). server 는 tickgw 가 준 zstd 프레임 바이트를 **풀지도 다시 압축하지도 않고** 넘긴다.
 *
 * ── 계약 (정본은 37-09 SUMMARY 「내부 계약」 표 · `tickgw/src/server.ts`) ─────────────────
 *   헤더   `X-Tickgw-Secret`(공유 비밀 · tickgw 가 timingSafeEqual · 틀리면 401)
 *   응답   `{ status, body, headers }` — 상태코드는 호출부(라우트)가 분기한다(`validateStatus: () => true`).
 *          409 `{epoch}` 를 axios 예외로 흘리면 「epoch 가 바뀌었다」 와 「tickgw 에 못 닿았다」 가 섞인다.
 *          body 는 언제나 원본 Buffer(`responseType: "arraybuffer"`) — 409 JSON 은 호출부가 파싱한다.
 *   실패   네트워크 오류 · 타임아웃은 **throw 하지 않고** `{ status: 0, body: null, netCode }` — 라우트가 502 로 바꾼다.
 *   경로   `/internal/ticks/` 아래 고정 — 같은 공유 비밀로 다른 내부 경로를 부르는 실수를 막는다.
 *
 * ── 로그 위생 ──────────────────────────────────────────────────────
 *   axios 오류 객체를 통째로 로그에 넣지 않는다 — `config.headers` 에 공유 비밀이 있다. 남기는 것은 경로 · 오류 코드뿐(본문 금지).
 */

/** tickgw `/internal/ticks/live` 쿼리 — 날짜는 tickgw 가 언제나 KST 오늘로 정한다. */
export type TickgwLiveQuery = {
  isin: string;
  ex: "KRX" | "NXT";
  /** 이전 응답의 `X-Tick-Epoch` — 첫 요청은 없음. */
  epoch?: string;
  /** 이전 응답의 `X-Tick-Offset-End` — 첫 요청은 0. */
  offset: number;
};

export type TickLiveHeaderKey = keyof typeof TICK_LIVE_HEADERS;

/**
 * tickgw 응답. `status = 0` 은 「tickgw 에 닿지 못함」(네트워크 오류 · 타임아웃) — 그때 `netCode` 에 오류 코드
 * (`ECONNREFUSED` · `ECONNABORTED` · …, 모르면 `UNKNOWN`)를 싣는다. `headers` 는 X-Tick-* 6종 중 tickgw 가 준 것만(값 그대로).
 */
export type TickgwLiveResponse = {
  status: number;
  body: Buffer | null;
  headers: Partial<Record<TickLiveHeaderKey, string>>;
  netCode?: string;
};

export type TickgwClient = {
  live(q: TickgwLiveQuery): Promise<TickgwLiveResponse>;
};

/** 브라우저 상한(37-19 웹)보다 작게 — tickgw 가 한 응답을 8MiB(또는 한 프레임 ≤ 16MB)로 자르므로(WR-32) VPC 안이면 수 초 안쪽이다. */
export const TICKGW_TIMEOUT_MS_DEFAULT = 20_000;

const LIVE_PATH = "/internal/ticks/live";
const TICKS_PATH_PREFIX = "/internal/ticks/";
const SECRET_HEADER = "X-Tickgw-Secret";

// ============================================================
// 사설 대역 가드 — 공유 비밀이 인터넷으로 나가는 것보다 서버가 안 뜨는 편이 낫다(부팅 throw)
// ============================================================

/** `10.a.b.c` (RFC1918 10.0.0.0/8) — 옥텟 4개가 모두 0~255 십진일 때만. 호스트 이름 · 16진 표기 · 앞자리 0 은 거부. */
function isTenSlash8(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts[0] !== "10") return false;
  return parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

/**
 * `TICKGW_URL` 검증 — `http:` 이고 호스트가 10.0.0.0/8 또는 127.0.0.1 일 때만 통과. 아니면 throw(호출부 `server.ts` 부팅 경로).
 *
 * - https 는 거부한다 — tickgw 는 VPC 안 평문 http 만 연다(TLS 종단이 없다). https 값은 배포 실수다.
 * - 127.0.0.1 은 로컬 가짜 tickgw(시험) — 비밀이 이 머신 밖으로 나가지 않는다.
 * - URL 파싱 실패를 먼저 걸러 `new URL` 이 던지는 원문(값에 비밀이 섞인 오설정 가능)이 로그에 남지 않게 한다.
 */
export function assertTickgwUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("TICKGW_URL must be a valid URL");
  }
  if (url.protocol !== "http:") {
    throw new Error(`TICKGW_URL must be http (got: ${url.protocol})`);
  }
  if (url.username || url.password) {
    throw new Error("TICKGW_URL must not carry credentials");
  }
  const host = url.hostname;
  if (host === "127.0.0.1" || isTenSlash8(host)) return url;
  throw new Error(`TICKGW_URL host must be inside 10.0.0.0/8 or 127.0.0.1 (got: ${host})`);
}

// ============================================================
// 팩토리
// ============================================================

/** tickgw 클라이언트 — `TICKGW_URL` · `TICKGW_SECRET` 둘 다 있을 때만 만든다(`server.ts`). 가드 실패는 throw. */
export function createTickgwClient(opts: {
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
}): TickgwClient {
  const url = assertTickgwUrl(opts.baseUrl);
  if (!opts.secret) throw new Error("TICKGW_SECRET must be set");
  const client: AxiosInstance = axios.create({
    baseURL: url.origin,
    timeout: opts.timeoutMs ?? TICKGW_TIMEOUT_MS_DEFAULT,
    headers: { [SECRET_HEADER]: opts.secret },
    // 바이트 그대로 — 문자열 · JSON 변환 금지(zstd 프레임이 깨진다).
    responseType: "arraybuffer",
    // tickgw 는 압축하지 않는다 — 혹시라도 gzip 이 끼면 axios 가 풀어 「그대로」 가 깨지므로 identity 만 받는다.
    decompress: false,
    // 상태코드 분기는 라우트가 한다 — 4xx/5xx 를 예외로 바꾸지 않는다.
    validateStatus: () => true,
  });

  async function get(path: string, params: Record<string, string | number>): Promise<TickgwLiveResponse> {
    if (!path.startsWith(TICKS_PATH_PREFIX)) {
      throw new Error(`tickgw path must start with ${TICKS_PATH_PREFIX}`);
    }
    try {
      const res = await client.get<ArrayBuffer>(path, {
        params,
        headers: { "Accept-Encoding": "identity" },
      });
      const headers: Partial<Record<TickLiveHeaderKey, string>> = {};
      for (const [key, name] of Object.entries(TICK_LIVE_HEADERS) as [TickLiveHeaderKey, string][]) {
        const v = res.headers[name.toLowerCase()];
        if (typeof v === "string") headers[key] = v;
      }
      // Node axios(arraybuffer)는 이미 Buffer 를 준다 — Buffer.from 으로 한 번 더 복사하지 않는다(WR-32 · 사용자 수 비례 메모리)
      const data = res.data as unknown;
      const body = Buffer.isBuffer(data)
        ? data
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data
            ? Buffer.from(data as Uint8Array)
            : Buffer.alloc(0);
      return { status: res.status, body, headers };
    } catch (err) {
      // 오류 객체 통째 금지(config.headers = 공유 비밀). 경로 · 코드만.
      const code = (err as { code?: unknown })?.code;
      const netCode = typeof code === "string" ? code : "UNKNOWN";
      logger.warn({ tickgw: { path, code: netCode } }, "[tickgw] tickgw 에 닿지 못함 (네트워크 오류 · 타임아웃)");
      return { status: 0, body: null, headers: {}, netCode };
    }
  }

  return {
    live: (q) =>
      get(LIVE_PATH, {
        isin: q.isin,
        ex: q.ex,
        offset: q.offset,
        ...(q.epoch ? { epoch: q.epoch } : {}),
      }),
  };
}
