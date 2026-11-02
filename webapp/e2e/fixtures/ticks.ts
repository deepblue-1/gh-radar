/**
 * Phase 37 Plan 08 — 틱 전문 뷰어 진입 e2e 픽스처 (ticks-viewer.spec · 37-10 이후 뷰어 본문 spec 공용).
 *
 * - 응답 모양 = `@gh-radar/shared` tick-api 계약(server 37-07 이 RPC 반환을 그대로 통과 · snake_case).
 * - `TICK_DATE` 20261016(금) 격자 3행 — 에코앤드림 KRX(매집감지 + 15%↑) · 에코앤드림 NXT(15%↑) · SK하이닉스 KRX(요청 변환).
 *   격자 바이트(서명 URL)는 받지 않는다 — 이 플랜은 머리까지다(본문 디코드는 37-10 · 37-12).
 * - `recentTradingDay()` = 오늘(KST)에서 7일 이상 전 · 90일 보관 안쪽의 거래일 — 요청 변환 케이스가 `nodataReasonOf` 의
 *   보관 밖 · 휴장 판정에 걸리지 않게 실행 날짜에서 계산한다(고정 날짜는 90일 뒤 「보관 밖」 으로 바뀐다).
 * - `mockTickApi` = `page.route` 로 `/api/ticks/{day,today,open,convert,convert/cancel}` 를 잡고 호출을 기록한다.
 *   경로는 URL 판정 함수로 정확히 가른다(glob `*` 는 `/` 를 넘지 않는다 — Pitfall 9).
 * ★ 실계좌 · 사용자 식별 리터럴 없음 — 종목 공개 정보뿐 · 서명 URL 은 가짜 호스트.
 */

import type { Page, Route } from '@playwright/test';
import {
  isKrxHoliday,
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
            url: 'https://tick-grid.invalid/signed',
            expiresIn: 600,
            bytes: 3_145_728,
            records: 48_210,
            a3_count: 9_120,
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
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

export async function mockTickApi(page: Page, opts: MockTickApiOpts = {}): Promise<TickApiRecorder> {
  const rec: TickApiRecorder = { day: [], today: 0, open: [], convert: [], cancel: [] };
  const openCount = new Map<string, number>();
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
          return json(route, 200, opts.open ? opts.open(q, n) : tickOpenFixture('grid', q));
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
