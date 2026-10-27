import fs from 'node:fs';
import path from 'node:path';

import type { Page, Route } from '@playwright/test';
import type {
  LaunchFire,
  LaunchHeadRow,
  LaunchMapResponse,
  LaunchOrdersResponse,
  LaunchPieceRow,
  LaunchRange,
} from '@gh-radar/shared';

/**
 * Phase 35 (35-06) — 발사 어드민 E2E 픽스처.
 *
 * ① 왜 목인가 — `/admin/launch` 는 Express `/api/admin/launch/*`(35-05)만 부른다. middleware 는 실 Supabase 로 e2e 계정
 *   (admin 시드)을 통과시키고 화면 데이터는 여기서 `page.route('**\/api/admin/launch/**')` 하나로 준다.
 *   `mockAdminApi`(fixtures/admin.ts)는 쓰지 않는다 — 그 목은 `/api/admin/**` 의 모르는 경로에 404 를 준다.
 * ② 주문 내역 기본 응답 = shared 픽스처 `packages/shared/src/__fixtures__/launch-pieces-1012-1026.json`(gh-trade 첨부
 *   pieces.json · 10/12~10/26 16:00 KRX Q16 조각 196개)을 `LaunchPieceRow` 로 바꾼 것(source backfill · 주문 속성 null).
 *   dates 11개 내림차순 · 목록 밖 날짜는 heads/pieces 빈 배열.
 * ③ **합성 값 표시 · 실서버 값 아님(가짜 계좌).** 10/26 KB120 코스닥 머리 1개(학습 · 다음 오프셋)와 wire 0 조각의 주문 속성
 *   (삼성전자 · 1234567801 · e2e-user · 3404000288 · 15:59:59.999)은 화면 모양 확인용 합성이다.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 원본 → 행
// ─────────────────────────────────────────────────────────────────────────────

interface RawPiece {
  date: string;
  broker: 'KB' | '교보';
  market: '코스피' | '코스닥';
  wire: number;
  q: string;
  j: number;
  rel: number;
  result: string;
}

const REPO_ROOT = path.resolve(__dirname, '../../..');
const RAW: RawPiece[] = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'packages/shared/src/__fixtures__/launch-pieces-1012-1026.json'), 'utf-8'),
) as RawPiece[];

const GATEWAY = { KB: 'KB120', 교보: 'KYOBO119' } as const;
const MARKET = { 코스피: 'K', 코스닥: 'Q' } as const;

/** 빈 조각 — 주문 속성 · 추적 열 null. */
export function launchPiece(over: Partial<LaunchPieceRow> & Pick<LaunchPieceRow, 'trade_date' | 'gateway' | 'market' | 'wire' | 'sent_rel_us' | 'result'>): LaunchPieceRow {
  return {
    profile: 'Q16',
    fire_exchange: 'KRX',
    fire_base: '16:00:00',
    side: null,
    queued_id: null,
    piece_idx: null,
    round: null,
    probe: null,
    order_no: null,
    result_code: null,
    accept_time: null,
    retry: null,
    abandoned: null,
    isin: null,
    price: null,
    qty: null,
    filled_qty: null,
    account: null,
    dma_user_id: null,
    source: 'backfill',
    journal_epoch: null,
    seq: null,
    gw_time_ms: null,
    stock_code: null,
    stock_name: null,
    ...over,
  };
}

/** 빈 머리 — 계산 열 · 추적 열 null. */
export function launchHead(over: Partial<LaunchHeadRow> & Pick<LaunchHeadRow, 'trade_date' | 'gateway' | 'market'>): LaunchHeadRow {
  return {
    profile: 'Q16',
    fire_exchange: 'KRX',
    fire_base: '16:00:00',
    offset_used_us: null,
    fire_at_us: null,
    n_pieces: null,
    n_accepted: null,
    n_reject: null,
    n_other: null,
    first_accept_idx: null,
    retries: null,
    abandoned: null,
    gate_lo_us: null,
    gate_hi_us: null,
    nonmono: null,
    correction_before_us: null,
    correction_after_us: null,
    step_us: null,
    last_dir: null,
    bracketed: null,
    same_dir_run: null,
    reject_span_us: null,
    jump: null,
    one_way_us: null,
    rtt_min_us: null,
    next_offset_us: null,
    source: 'backfill',
    journal_epoch: null,
    seq: null,
    gw_time_ms: null,
    ...over,
  };
}

/** 첨부 16:00 조각 전부(10/12~10/26). */
export const LAUNCH_Q16_PIECES: LaunchPieceRow[] = RAW.map((r) =>
  launchPiece({
    trade_date: r.date.replaceAll('-', ''),
    gateway: GATEWAY[r.broker],
    market: MARKET[r.market],
    wire: r.wire,
    queued_id: r.q,
    piece_idx: r.j,
    sent_rel_us: r.rel,
    result: r.result,
  }),
);

/** 행 있는 날짜 — 내림차순. */
export const LAUNCH_DATES: string[] = [...new Set(LAUNCH_Q16_PIECES.map((p) => p.trade_date))].sort().reverse();
export const LAUNCH_LATEST = LAUNCH_DATES[0]!;

/** 10/26 합성 — KB120 코스닥 Q16 머리(학습 · 다음 오프셋). */
const SYN_HEADS_1026: LaunchHeadRow[] = [
  launchHead({
    trade_date: '20261026',
    gateway: 'KB120',
    market: 'Q',
    offset_used_us: -332,
    correction_before_us: -146,
    correction_after_us: -151,
    step_us: 5,
    next_offset_us: -337,
  }),
];

/** 10/26 합성 — KB120 코스닥 wire 0 조각의 주문 속성(가짜 계좌). */
const SYN_ORDER_1026: Partial<LaunchPieceRow> = {
  isin: 'KR7005930003',
  stock_name: '삼성전자',
  stock_code: '005930',
  side: 'buy',
  price: 12680,
  qty: 150,
  filled_qty: 150,
  account: '1234567801',
  dma_user_id: 'e2e-user',
  order_no: '3404000288',
  accept_time: 155959999,
};

/** 주문 내역 응답 — `d` 생략 = 최신. 목록 밖 날짜는 빈 heads/pieces. */
export function launchOrdersFixture(d?: string): LaunchOrdersResponse {
  const date = d ?? LAUNCH_LATEST;
  const pieces = LAUNCH_Q16_PIECES.filter((p) => p.trade_date === date).map((p) =>
    date === '20261026' && p.gateway === 'KB120' && p.market === 'Q' && p.wire === 0 ? { ...p, ...SYN_ORDER_1026 } : p,
  );
  const heads = date === '20261026' ? SYN_HEADS_1026 : [];
  return { dates: LAUNCH_DATES, date, heads, pieces };
}

// ─────────────────────────────────────────────────────────────────────────────
// page.route 목
// ─────────────────────────────────────────────────────────────────────────────

export interface LaunchRequestRecord {
  method: string;
  /** `/orders` · `/map` */
  path: string;
  query: Record<string, string>;
}

export interface MockLaunchApiOptions {
  orders?: (d: string | undefined) => LaunchOrdersResponse | { status: number; body: unknown };
  map?: (fire: LaunchFire, range: LaunchRange) => LaunchMapResponse;
}

export interface LaunchApiMock {
  requests: LaunchRequestRecord[];
  /** GET /orders 요청만. */
  orders: () => LaunchRequestRecord[];
}

function isStatusBody(v: unknown): v is { status: number; body: unknown } {
  return typeof v === 'object' && v !== null && 'status' in v && 'body' in v;
}

export async function mockLaunchApi(page: Page, opts: MockLaunchApiOptions = {}): Promise<LaunchApiMock> {
  const requests: LaunchRequestRecord[] = [];
  await page.route('**/api/admin/launch/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const idx = url.pathname.indexOf('/api/admin/launch');
    const rec: LaunchRequestRecord = {
      method: request.method(),
      path: url.pathname.slice(idx + '/api/admin/launch'.length),
      query: Object.fromEntries(url.searchParams.entries()),
    };
    requests.push(rec);

    let status = 200;
    let body: unknown;
    if (rec.path === '/orders') {
      const out = opts.orders?.(rec.query.d) ?? launchOrdersFixture(rec.query.d);
      if (isStatusBody(out)) {
        status = out.status;
        body = out.body;
      } else {
        body = out;
      }
    } else if (rec.path === '/map') {
      const fire = (rec.query.fire ?? 'q16') as LaunchFire;
      const range = (rec.query.range ?? '10d') as LaunchRange;
      body = opts.map?.(fire, range) ?? { days: [], heads: [], pieces: [] };
    } else {
      status = 404;
      body = { error: { code: 'NOT_FOUND', message: '없는 경로예요' } };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return {
    requests,
    orders: () => requests.filter((r) => r.method === 'GET' && r.path === '/orders'),
  };
}
