/**
 * Phase 37 Plan 08 — 틱 전문 뷰어 진입 e2e 픽스처 (ticks-viewer.spec · 37-10 이후 뷰어 본문 spec 공용).
 *
 * - 응답 모양 = `@gh-radar/shared` tick-api 계약(server 37-07 이 RPC 반환을 그대로 통과 · snake_case).
 * - `TICK_DATE` 20261016(금) 격자 3행 — 에코앤드림 KRX(매집감지 + 15%↑) · 에코앤드림 NXT(15%↑) · SK하이닉스 KRX(요청 변환).
 * - 격자 바이트(37-10): 서명 URL = 가짜 호스트 `storage.test` 의 `grid/<d>/<ex>/<isin>.nightly.ticks.zst?token=t<n>`
 *   (n = 그 (isin, d, ex) open 몇 번째 호출). `mockTickApi` 가 그 URL 을 shared 골든 픽스처 바이트로 응답한다 —
 *   `cut1300-krx.ticks.zst` / `cut1300-nxt.ticks.zst`(에코앤드림 2026-10-16 13:00~13:59 · 37-02 오라클 생성).
 *   만료 흉내(`expireFirstGrid`) = 첫 격자 요청만 403.
 * - `recentTradingDay()` = 오늘(KST)에서 7일 이상 전 · 90일 보관 안쪽의 거래일 — 요청 변환 케이스가 `nodataReasonOf` 의
 *   보관 밖 · 휴장 판정에 걸리지 않게 실행 날짜에서 계산한다(고정 날짜는 90일 뒤 「보관 밖」 으로 바뀐다).
 * - `mockTickApi` = `page.route` 로 `/api/ticks/{day,today,open,convert,convert/cancel}` 를 잡고 호출을 기록한다.
 *   경로는 URL 판정 함수로 정확히 가른다(glob `*` 는 `/` 를 넘지 않는다 — Pitfall 9).
 * - (37-19) `mockTickLive` = `/api/ticks/live` 가짜 server(37-15 계약 — 헤더 6종 · CORS expose · 409 없음). 컷 13시 KRX 픽스처를
 *   시각 경계로 나눈 zstd 덩이(`tickLiveChunks`)를 「공개된 만큼」 offset 이후로 내준다 · `queued` 면 `release()` 전까지 대기 k건.
 * ★ 실계좌 · 사용자 식별 리터럴 없음 — 종목 공개 정보뿐 · 서명 URL 은 가짜 호스트.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

import type { Page, Route } from '@playwright/test';
import {
  TICK_LIVE_HEADERS,
  isKrxHoliday,
  iterRecords,
  type TickConvertBody,
  type TickConvertRequest,
  type TickConvertResponse,
  type TickDayResponse,
  type TickExchange,
  type TickGridRow,
  type TickOpenResponse,
  type TickTodayResponse,
} from '@gh-radar/shared';

export const TICK_DATE = '20261016';
export const TICK_PREV_DATE = '20261015';

export const ECO = { isin: 'KR7101360006', code: '101360', name: '에코앤드림' } as const;
export const SKH = { isin: 'KR7000660001', code: '000660', name: 'SK하이닉스' } as const;
export const SAMSUNG = { isin: 'KR7005930003', code: '005930', name: '삼성전자' } as const;

const ETA = { KRX: 240, NXT: 120 } as const;

const TICK_FIXTURE_DIR = path.resolve(__dirname, '../../../packages/shared/src/__fixtures__/ticks');
/** 픽스처 레코드 수 · A3 수(37-02 표) — 열기 응답 메타가 실제 바이트와 맞게. */
const TICK_FIXTURE_META = { KRX: { records: 11_990, a3: 3_089 }, NXT: { records: 11_474, a3: 3_219 } } as const;
const gridBytesCache = new Map<TickExchange, Buffer>();

/** 격자 바이트(zstd) — 컷 13시 픽스처(KRX `cut1300-krx.ticks.zst` · NXT `cut1300-nxt.ticks.zst`). */
export function tickGridBytes(ex: TickExchange = 'KRX'): Buffer {
  let b = gridBytesCache.get(ex);
  if (b === undefined) {
    b = readFileSync(path.join(TICK_FIXTURE_DIR, ex === 'NXT' ? 'cut1300-nxt.ticks.zst' : 'cut1300-krx.ticks.zst'));
    gridBytesCache.set(ex, b);
  }
  return b;
}

export const TICK_GRID_HOST = 'storage.test';

/** 서명 URL — `https://storage.test/tick-grid/grid/<d>/<ex>/<isin>.nightly.ticks.zst?token=t<n>`. */
export function tickGridUrl(q: { isin: string; d: string; ex: TickExchange }, n = 1): string {
  return `https://${TICK_GRID_HOST}/tick-grid/grid/${q.d}/${q.ex}/${q.isin}.nightly.ticks.zst?token=t${n}`;
}

function gridRow(
  s: { isin: string; code: string; name: string },
  date: string,
  exchange: TickExchange,
  sources: TickGridRow['sources'],
  high_rate: number,
): TickGridRow {
  return {
    date,
    exchange,
    isin: s.isin,
    code: s.code,
    name: s.name,
    mode: sources.includes('request') ? 'request' : 'nightly',
    sources,
    bytes: 3_145_728,
    records: 48_210,
    a3_count: 9_120,
    high_rate,
    last_rate: high_rate - 2,
    created_at: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T15:00:00Z`,
  };
}

/** 하루 목록 — d 없음 = 최근(TICK_DATE). 목록에 없는 날은 rows []. */
export function tickDayFixture(d: string | null): TickDayResponse {
  const date = d ?? TICK_DATE;
  const rows =
    date === TICK_DATE
      ? [
          gridRow(ECO, date, 'KRX', ['accum', 'up15'], 29.9),
          gridRow(ECO, date, 'NXT', ['up15'], 15.6),
          gridRow(SKH, date, 'KRX', ['request'], 1.8),
        ]
      : [];
  return { access: true, dates: [TICK_DATE, TICK_PREV_DATE], date, rows, requests: [], eta_s: { ...ETA } };
}

export function tickTodayFixture(opts: { live: boolean; date: string }): TickTodayResponse {
  return {
    access: true,
    date: opts.date,
    rows: [{ isin: ECO.isin, code: ECO.code, name: ECO.name, sources: ['accum', 'up15'], rate: 22.1, high_rate: 29.9 }],
    live: opts.live,
  };
}

export function tickRequestOf(over: Partial<TickConvertRequest> & { isin: string }): TickConvertRequest {
  return {
    exchange: 'KRX',
    status: 'pending',
    requested_at: new Date().toISOString(),
    triggered_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    error: null,
    stale: false,
    ...over,
  };
}

/** 열기 응답 — grid(서명 URL 가짜) · request(진행 중) · none(격자 · 요청 없음 = 요청 변환 대상). */
export function tickOpenFixture(
  kind: 'grid' | 'request' | 'none',
  q: { isin: string; d: string; ex: TickExchange },
  n = 1,
): TickOpenResponse {
  const s = [ECO, SKH, SAMSUNG].find((x) => x.isin === q.isin);
  return {
    access: true,
    date: q.d,
    exchange: q.ex,
    isin: q.isin,
    stock: s ? { code: s.code, name: s.name } : null,
    grid:
      kind === 'grid'
        ? {
            url: tickGridUrl(q, n),
            expiresIn: 600,
            bytes: tickGridBytes(q.ex).length,
            records: TICK_FIXTURE_META[q.ex].records,
            a3_count: TICK_FIXTURE_META[q.ex].a3,
            mode: 'nightly',
            sources: ['accum', 'up15'],
            fmt: 'pcapns-rec+zstd/1',
            first_recv_ms: null,
            last_recv_ms: null,
            created_at: '2026-10-16T15:00:00Z',
          }
        : null,
    request: kind === 'request' ? tickRequestOf({ isin: q.isin, exchange: q.ex, status: 'running' }) : null,
    accum: null,
    eta_s: ETA[q.ex],
  };
}

const KST_MS = 9 * 3600_000;
const ymdOf = (t: number) => {
  const k = new Date(t + KST_MS);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, '0')}${String(k.getUTCDate()).padStart(2, '0')}`;
};

/** 오늘(KST)에서 7일 이상 전 · 90일 안쪽의 첫 거래일(주말 · KRX 휴장일 제외). */
export function recentTradingDay(now = Date.now()): string {
  for (let back = 7; back < 60; back++) {
    const t = now - back * 86_400_000;
    const ymd = ymdOf(t);
    const wd = new Date(t + KST_MS).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if (isKrxHoliday(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`)) continue;
    return ymd;
  }
  throw new Error('최근 거래일을 찾지 못함');
}

/** 가장 가까운 지난 토요일(KST). */
export function lastSaturday(now = Date.now()): string {
  for (let back = 1; back <= 7; back++) {
    const t = now - back * 86_400_000;
    if (new Date(t + KST_MS).getUTCDay() === 6) return ymdOf(t);
  }
  throw new Error('토요일 없음');
}

export interface TickApiRecorder {
  /** 격자 서명 URL 요청(전체 URL) — 만료 흉내 403 포함. */
  grid: string[];
  day: (string | null)[];
  today: number;
  open: string[];
  convert: TickConvertBody[];
  cancel: TickConvertBody[];
}

export interface MockTickApiOpts {
  /** 모든 `/api/ticks/*` 를 403 `DMA_UNMAPPED` 로. */
  forbid?: boolean;
  /** 열기 응답 — n = 그 (isin, d, ex) 몇 번째 호출(1부터). 기본 = grid. */
  open?: (q: { isin: string; d: string; ex: TickExchange }, n: number) => TickOpenResponse;
  convert?: (body: TickConvertBody) => TickConvertResponse;
  today?: { live: boolean; date: string };
  /** 첫 격자 요청을 403(서명 만료)으로 — 뷰어가 open 을 한 번 다시 불러 새 URL 로 받는다. */
  expireFirstGrid?: boolean;
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

export async function mockTickApi(page: Page, opts: MockTickApiOpts = {}): Promise<TickApiRecorder> {
  const rec: TickApiRecorder = { grid: [], day: [], today: 0, open: [], convert: [], cancel: [] };
  const openCount = new Map<string, number>();
  // 격자(서명 URL) — 브라우저가 Storage 를 직접 받는다(교차 출처라 CORS 헤더를 붙인다).
  await page.route(
    (url) => url.hostname === TICK_GRID_HOST,
    async (route) => {
      const u = new URL(route.request().url());
      rec.grid.push(u.toString());
      const cors = { 'access-control-allow-origin': '*' };
      if (opts.expireFirstGrid && rec.grid.length === 1) {
        return route.fulfill({ status: 403, headers: cors, contentType: 'application/json', body: '{"error":"expired"}' });
      }
      const ex: TickExchange = u.pathname.includes('/NXT/') ? 'NXT' : 'KRX';
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/zstd', body: tickGridBytes(ex) });
    },
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/ticks/'),
    async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      if (req.method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
          },
        });
      }
      if (opts.forbid) return json(route, 403, { error: { code: 'DMA_UNMAPPED', message: 'DMA 매핑 없음' } });
      switch (u.pathname) {
        case '/api/ticks/day': {
          const d = u.searchParams.get('d');
          rec.day.push(d);
          return json(route, 200, tickDayFixture(d));
        }
        case '/api/ticks/today': {
          rec.today += 1;
          return json(route, 200, tickTodayFixture(opts.today ?? { live: false, date: ymdOf(Date.now()) }));
        }
        case '/api/ticks/open': {
          const q = {
            isin: u.searchParams.get('isin') ?? '',
            d: u.searchParams.get('d') ?? '',
            ex: (u.searchParams.get('ex') ?? 'KRX') as TickExchange,
          };
          const key = `${q.isin}/${q.d}/${q.ex}`;
          const n = (openCount.get(key) ?? 0) + 1;
          openCount.set(key, n);
          rec.open.push(key);
          return json(route, 200, opts.open ? opts.open(q, n) : tickOpenFixture('grid', q, n));
        }
        case '/api/ticks/convert': {
          const body = req.postDataJSON() as TickConvertBody;
          rec.convert.push(body);
          const resp: TickConvertResponse = opts.convert
            ? opts.convert(body)
            : {
                access: true,
                grid_ready: false,
                capped: false,
                triggered: true,
                not_uploaded: false,
                retry_after: null,
                request: tickRequestOf({ isin: body.isin, exchange: body.ex }),
                eta_s: ETA[body.ex],
              };
          return json(route, 200, resp);
        }
        case '/api/ticks/convert/cancel': {
          const body = req.postDataJSON() as TickConvertBody;
          rec.cancel.push(body);
          return json(route, 200, { access: true, cancelled: true, request: null });
        }
        default:
          return json(route, 404, { error: { code: 'NOT_FOUND', message: u.pathname } });
      }
    },
  );
  return rec;
}

// ── 당일 경로(37-19) ────────────────────────────────────────────────────────────────

const KST_OFF_NS = 9n * 3_600_000_000_000n;
/** `YYYYMMDD` + `HH:MM:SS` (KST) → epoch ns. */
function kstNs(ymd: string, hms: string): bigint {
  const [h, m, s] = hms.split(':').map(Number) as [number, number, number];
  const utcMs = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)), h, m, s);
  return BigInt(utcMs) * 1_000_000n - KST_OFF_NS;
}

/**
 * 컷 13시 KRX 픽스처(13:00~13:48)를 시각 경계(`HH:MM:SS` KST · 오름차순)로 나눈 zstd 덩이들 — 경계 수 + 1 개.
 * 덩이마다 독립 zstd 프레임이라 이어붙여도 유효하다(tickgw 캐시와 같은 꼴). 픽스처는 수신순이 시각순이다.
 */
export function tickLiveChunks(cuts: readonly string[], d = TICK_DATE): Buffer[] {
  const raw = zstdDecompressSync(tickGridBytes('KRX'));
  const bounds = cuts.map((c) => kstNs(d, c));
  const offs: number[] = [];
  let k = 0;
  for (const r of iterRecords(raw)) {
    while (k < bounds.length && r.recvNs >= bounds[k]!) {
      offs.push(r.off - 16);
      k += 1;
    }
  }
  while (offs.length < bounds.length) offs.push(raw.length);
  const edges = [0, ...offs, raw.length];
  const out: Buffer[] = [];
  for (let i = 0; i + 1 < edges.length; i++) out.push(zstdCompressSync(raw.subarray(edges[i]!, edges[i + 1]!)));
  return out;
}

export interface TickLiveRecorder {
  /** `/api/ticks/live` 요청(OPTIONS 제외) — epoch · offset. */
  calls: { epoch: string | null; offset: number }[];
  /** 다음 덩이를 공개한다(새 틱이 119 에 쌓인 흉내) — 다음 폴링이 가져간다. */
  publish: () => void;
  /** 대기열에서 풀어 준다(이후 요청은 ready) — 받는 중 카드를 확인한 뒤 부른다(순간 상태 단언 피하기). */
  release: () => void;
}

export interface MockTickLiveOpts {
  /** 덩이(zstd) — 처음에는 `initial` 개가 공개돼 있다. */
  chunks: readonly Buffer[];
  initial?: number;
  /** true 면 `release()` 전까지 모든 요청이 queued(대기 `queue` 건 · 바이트 없음). 기본 false. */
  queued?: boolean;
  queue?: number;
  epoch?: string;
}

/** `/api/ticks/live` 가짜 server — offset 이후 공개된 바이트 · X-Tick-* 6종(37-15 이름 그대로) · CORS expose. */
export async function mockTickLive(page: Page, opts: MockTickLiveOpts): Promise<TickLiveRecorder> {
  const epoch = opts.epoch ?? 'e2e-epoch-1';
  let published = opts.initial ?? 1;
  let holding = opts.queued ?? false;
  const rec: TickLiveRecorder = {
    calls: [],
    publish: () => (published = Math.min(opts.chunks.length, published + 1)),
    release: () => (holding = false),
  };
  const exposed = Object.values(TICK_LIVE_HEADERS).join(', ');
  await page.route(
    (url) => url.pathname === '/api/ticks/live',
    async (route) => {
      const req = route.request();
      const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': exposed };
      if (req.method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            ...cors,
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-allow-methods': 'GET, OPTIONS',
          },
        });
      }
      const u = new URL(req.url());
      const offset = Number(u.searchParams.get('offset') ?? '0');
      rec.calls.push({ epoch: u.searchParams.get('epoch'), offset });
      const queued = holding;
      const all = Buffer.concat(queued ? [] : opts.chunks.slice(0, published));
      const body = all.subarray(Math.min(offset, all.length));
      const end = Math.max(offset, all.length);
      return route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        headers: {
          ...cors,
          'cache-control': 'no-store',
          [TICK_LIVE_HEADERS.epoch]: epoch,
          [TICK_LIVE_HEADERS.offsetEnd]: String(end),
          [TICK_LIVE_HEADERS.lastRecvNs]: '',
          [TICK_LIVE_HEADERS.state]: queued ? 'queued' : 'ready',
          [TICK_LIVE_HEADERS.queue]: String(queued ? (opts.queue ?? 2) : 0),
          [TICK_LIVE_HEADERS.complete]: 'true',
        },
        body,
      });
    },
  );
  return rec;
}
