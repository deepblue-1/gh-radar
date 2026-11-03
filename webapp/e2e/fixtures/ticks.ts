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
 * - (38-09) `tickOwnFixture` = `/api/ticks/own` 합성 응답 — 에코앤드림 KRX 10/16 만 체결 3 · 주문 3(값은 컷 13시 KRX 격자에서 유도 ·
 *   `ECO_OWN` 주석). `mockTickApi` 기본이 이 응답이라 37 절도 우리 층이 켜진 화면에서 돈다 · `opts.own` 으로 실패 상태를 줄 수 있다.
 * ★ 실계좌 · 사용자 식별 리터럴 없음 — 종목 공개 정보뿐 · 서명 URL 은 가짜 호스트 · 우리 체결 계좌는 합성(`1234560001` 꼴).
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
  type TickOwnResponse,
  type TickTodayResponse,
} from '@gh-radar/shared';

export const TICK_DATE = '20261016';
export const TICK_PREV_DATE = '20261015';

/** listingShares = 열기 응답 stock.listing_shares(차트 넷째 판 · 거래대금 카드 시총 대비 — 스케치 022). */
export const ECO = { isin: 'KR7101360006', code: '101360', name: '에코앤드림', listingShares: 22_000_000 } as const;
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
  /** 팀 칸(quick 261103-j4d · 20261103230000) — 없으면 키 자체를 싣지 않는다(옛 RPC 모양). */
  team?: { fills: number | null; net: number | null; pnl: number | null; cum: number | null },
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
    ...(team === undefined
      ? {}
      : {
          team_fills: team.fills,
          team_day_net_krw: team.net,
          team_day_pnl_krw: team.pnl,
          accum_pos_net_krw: team.cum,
        }),
  };
}

/** 하루 목록 — d 없음 = 최근(TICK_DATE). 목록에 없는 날은 rows []. */
export function tickDayFixture(d: string | null): TickDayResponse {
  const date = d ?? TICK_DATE;
  const rows =
    date === TICK_DATE
      ? [
          gridRow(ECO, date, 'KRX', ['accum', 'up15'], 29.9, {
            fills: 120,
            net: -312_000_000,
            pnl: 184_000_000,
            cum: 4_520_000_000,
          }),
          gridRow(ECO, date, 'NXT', ['up15'], 15.6, { fills: 14, net: 89_000_000, pnl: -21_500_000, cum: 4_520_000_000 }),
          gridRow(SKH, date, 'KRX', ['request'], 1.8, { fills: 0, net: null, pnl: null, cum: null }),
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
    stock: s ? { code: s.code, name: s.name, listing_shares: s === ECO ? ECO.listingShares : null } : null,
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

// ── 우리 주문 · 체결(38-09) ─────────────────────────────────────────────────────────

/** `HH:MM:SS.mmm`(KST · TICK_DATE) → epoch ms. */
const ecoAt = (hms: string): number => Date.parse(`2026-10-16T${hms}+09:00`);

/**
 * 에코앤드림 KRX 10/16 합성 우리 체결 · 주문 — 값은 `packages/shared/src/__fixtures__/ticks/cut1300-krx.ticks.zst`(컷 13시 KRX ·
 * 11,990 레코드 · A3 3,089)에서 뽑았다. 유도: 스크래치 스크립트(커밋 안 함)가 shared dist 의 `buildTickIndex(buf, "krx")` ·
 * `a3ColumnsOf` · `recvOrderOf` · `bookAt` · `a3TimeMs` 로 13:30 이후를 훑고 `matchOwnFills` · `locateEvidence` · `anchorOf` 로 확인했다.
 *
 * (a) 부분 체결 — A3 j 2399 · rec 8964 · seq 79601 · 체결 시각 13:33:29.448339 · 10,340 × 500 · 후보 1(추정 아님).
 *     우리 수량 = ⌊500 / 3⌋ = 166 · gw = ⌊a3TimeMs⌋ + 30 = 13:33:29.478 → dt +29.66ms · 칩 「166/500」.
 * (b) 전량 — A3 j 3012 · rec 11304 · seq 81941 · 13:36:01.985446 · 10,660(상한가) × 733 · 후보 1. gw = ⌊a3TimeMs⌋ + 10 = 13:36:01.995.
 * (c) 짝 없음 — 13:45:00.000 · 10,600 × 100. 그 시각 ± 2초 안에 A3 가 하나도 없다(그 가격 0건) → 「짝 전문 없음」.
 *     (계획의 「13:50 근처」 대신 13:45 — 컷이 13:48:32.565 에서 끝나 13:50 이면 줄이 목록 맨 끝에 붙는다 · 행 사이에 두려고.)
 * 주문 1 이벤트 — gw = (a) gw − 400 = 13:33:29.078 · kind 3 · 선매수(group 1) · 매물소진 · 호가 근거(ev_kind 1):
 *     창 [13:33:26.078, 13:33:29.128] 안 마지막 B6 = rec 8960 · seq 79597 · 13:33:29.055 · 매도1 10,340 잔량 1,234
 *     (그 앞 B6 seq 79595 는 1,308 → ev_qty_before) · `locateEvidence` = { kind: 'b6', rec: 8960 }.
 *     cum_volume = 이벤트 직전 A3(j 2397 · seq 79596 · 13:33:29.055) 누적 1,347,810 → 앵커 = 그 A3(근거 B6 와 다른 행).
 * 주문 2 이벤트 — (b) gw − 300 · kind 3 · 수동(group 7) · 조건 · 근거 · 누적 0.
 * 주문 3 — 이벤트 없이 보조 주문 행(`orders[]` · origin 'limit_chaser' · created_ms = (c) gw − 200).
 */
export const ECO_OWN = {
  servers: ['KB120', 'KYOBO119'],
  a: { seq: 79601, px: 10_340, our: 166, total: 500, gwMs: ecoAt('13:33:29.478'), orderNo: '100231' },
  evidence: { seq: 79597, px: 10_340, qtyBefore: 1_308, qtyAfter: 1_234 },
  anchor: { seq: 79596, cum: 1_347_810 },
  b: { seq: 81941, px: 10_660, qty: 733, gwMs: ecoAt('13:36:01.995'), orderNo: '100457' },
  c: { px: 10_600, qty: 100, gwMs: ecoAt('13:45:00.000'), orderNo: '100822' },
} as const;

/** `/api/ticks/own` 응답 — 에코앤드림 KRX TICK_DATE 면 `ECO_OWN` · 그 밖은 빈 배열(켜진 서버는 같다). 계좌는 합성. */
export function tickOwnFixture(q: { isin: string; d: string; ex: TickExchange }): TickOwnResponse {
  const base: TickOwnResponse = {
    access: true,
    date: q.d,
    exchange: q.ex,
    isin: q.isin,
    servers: [...ECO_OWN.servers],
    fills: [],
    events: [],
    orders: [],
  };
  if (q.isin !== ECO.isin || q.d !== TICK_DATE || q.ex !== 'KRX') return base;
  const { a, b, c, evidence, anchor } = ECO_OWN;
  const fill = (gateway: string, account_no: string, order_no: string) => ({ gateway, account_no, order_no, side: 'B' });
  const ev = {
    seq: 0,
    kind: 3,
    group: 0,
    price: 0,
    qty: 0,
    reason_code: '',
    cond_metric: 0,
    cond_threshold: 0,
    cond_actual: 0,
    ev_kind: 0,
    ev_price: 0,
    ev_qty_before: 0,
    ev_qty_after: 0,
    ev_trade_qty: 0,
    cum_volume: 0,
  };
  return {
    ...base,
    fills: [
      { ...fill('KB120', '1234560001', a.orderNo), seq: 501, gw_time_ms: a.gwMs, exec_price: a.px, exec_qty: a.our },
      { ...fill('KYOBO119', '1234560002', b.orderNo), seq: 502, gw_time_ms: b.gwMs, exec_price: b.px, exec_qty: b.qty },
      { ...fill('KB120', '1234560001', c.orderNo), seq: 503, gw_time_ms: c.gwMs, exec_price: c.px, exec_qty: c.qty },
    ],
    events: [
      {
        ...ev,
        gateway: 'KB120',
        seq: 401,
        gw_time_ms: a.gwMs - 400,
        group: 1,
        account_no: '1234560001',
        order_no: a.orderNo,
        price: a.px,
        qty: 500,
        reason_code: 'PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)',
        cond_metric: 1,
        cond_threshold: 1_250,
        cond_actual: evidence.qtyAfter,
        ev_kind: 1,
        ev_price: evidence.px,
        ev_qty_before: evidence.qtyBefore,
        ev_qty_after: evidence.qtyAfter,
        cum_volume: anchor.cum,
      },
      {
        ...ev,
        gateway: 'KYOBO119',
        seq: 402,
        gw_time_ms: b.gwMs - 300,
        group: 7,
        account_no: '1234560002',
        order_no: b.orderNo,
        price: b.px,
        qty: b.qty,
      },
    ],
    orders: [
      {
        gateway: 'KB120',
        account_no: '1234560001',
        order_no: c.orderNo,
        side: 'B',
        price: c.px,
        qty: c.qty,
        origin: 'limit_chaser',
        created_ms: c.gwMs - 200,
      },
    ],
  };
}

export interface TickApiRecorder {
  /** 격자 서명 URL 요청(전체 URL) — 만료 흉내 403 포함. */
  grid: string[];
  day: (string | null)[];
  today: number;
  open: string[];
  convert: TickConvertBody[];
  cancel: TickConvertBody[];
  /** (38-09) `/api/ticks/own` 요청 — `${isin}/${d}/${ex}`. */
  own: string[];
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
  /** (38-09) 우리 주문 · 체결 응답 — `{ status }` 면 그 코드로 실패. 기본 = `tickOwnFixture`. */
  own?: (q: { isin: string; d: string; ex: TickExchange }) => TickOwnResponse | { status: number };
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

export async function mockTickApi(page: Page, opts: MockTickApiOpts = {}): Promise<TickApiRecorder> {
  const rec: TickApiRecorder = { grid: [], day: [], today: 0, open: [], convert: [], cancel: [], own: [] };
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
        case '/api/ticks/own': {
          const q = {
            isin: u.searchParams.get('isin') ?? '',
            d: u.searchParams.get('d') ?? '',
            ex: (u.searchParams.get('ex') ?? 'KRX') as TickExchange,
          };
          rec.own.push(`${q.isin}/${q.d}/${q.ex}`);
          const r = opts.own ? opts.own(q) : tickOwnFixture(q);
          if ('status' in r) return json(route, r.status, { error: { code: 'E2E_OWN_FAIL', message: `own ${r.status}` } });
          return json(route, 200, r);
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
