import fs from 'node:fs';
import path from 'node:path';

import type { Page, Route } from '@playwright/test';
import type {
  LaunchFire,
  LaunchHeadRow,
  LaunchMapPiece,
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
 * ④ 10/26 09:00:30 — 첨부 로그 pieces120.txt · pieces119.txt 의 N 10줄(ordno · sent_rel_us · result · retry · accept_time 그대로 ·
 *   accept_time 은 앞 0 빠진 8자리 원문) + **합성** A 두 다리 2줄(KB120 코스닥 · KRX 09:00:27 매수 접수 / NXT 09:00:30 매도 101) +
 *   **합성** N 머리 2개(KB120 코스닥 −245 · KYOBO119 코스닥 −200 — 고정 오프셋).
 * ⑤ `ordersEmpty` — dates [] 응답(적재 이력 0).
 * ⑥ 경계 지도(35-08 · `launchMapFixture`) — q16 = 위 첨부 조각(days 11 내림차순 · 10d 면 최신 10일만 · 20d/all 은 11일) +
 *   **합성** Q16 머리 4개(첨부 NEXT: KB120 Q −337 · KB120 K −285 · KYOBO119 Q −526 · KYOBO119 K −400 — 라이브는 kind 18
 *   next_offset_us). n0930 = 10/26 N 10조각(로그 그대로) + **합성** A 매도 1조각(KB120 Q · 101) + **합성** N 머리
 *   (KB120 −245 · KYOBO119 −200). 기본 map 핸들러가 이것이다.
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

const N_LEG = { profile: 'N', fire_exchange: 'NXT', fire_base: '09:00:30', queued_id: 'N', trade_date: '20261026' } as const;

/** 10/26 09:00:30 N 조각 — 첨부 로그 그대로(KB120 = pieces120.txt · KYOBO119 = pieces119.txt). */
const N_PIECES_1026: LaunchPieceRow[] = (
  [
    ['KB120', 'K', 0, '3404000020', -20148, '101', 2, 90030046],
    ['KB120', 'K', 1, '3404000019', -20143, '101', 1, 90030007],
    ['KB120', 'Q', 0, '3405000786', -20148, '101', 2, 90030092],
    ['KB120', 'Q', 1, '3405000784', -20143, '101', 1, 90030025],
    ['KB120', 'Q', 2, '3405000785', -20141, '101', 1, 90030060],
    ['KYOBO119', 'K', 0, '53200032', -20149, '기타', 0, 90029979],
    ['KYOBO119', 'K', 1, '53200033', -20142, '기타', 0, 90029979],
    ['KYOBO119', 'Q', 0, '53200030', -20149, '기타', 0, 90029979],
    ['KYOBO119', 'Q', 1, '53200031', -20140, '기타', 0, 90029979],
    ['KYOBO119', 'Q', 2, '53200034', -20138, '기타', 0, 90029979],
  ] as const
).map(([gateway, market, wire, order_no, sent_rel_us, result, retry, accept_time]) =>
  launchPiece({ ...N_LEG, gateway, market, wire, piece_idx: wire, order_no, sent_rel_us, result, retry, accept_time }),
);

/** 10/26 합성 A 두 다리 — KB120 코스닥(매수 KRX 09:00:27 접수 · 매도 NXT 09:00:30 101). */
const A_PIECES_1026: LaunchPieceRow[] = [
  launchPiece({
    trade_date: '20261026',
    gateway: 'KB120',
    market: 'Q',
    profile: 'A',
    fire_exchange: 'KRX',
    fire_base: '09:00:27',
    queued_id: 'A',
    piece_idx: 0,
    wire: 0,
    side: 'buy',
    sent_rel_us: -1210,
    result: '접수',
    retry: 0,
    accept_time: 90027004,
  }),
  launchPiece({
    trade_date: '20261026',
    gateway: 'KB120',
    market: 'Q',
    profile: 'A',
    fire_exchange: 'NXT',
    fire_base: '09:00:30',
    queued_id: 'A',
    piece_idx: 0,
    wire: 0,
    side: 'sell',
    sent_rel_us: -20139,
    result: '101',
    retry: 0,
    accept_time: 90030012,
  }),
];

/** 10/26 합성 N 머리 — 고정 오프셋. */
const N_HEAD_KEY = { profile: 'N', fire_exchange: 'NXT', fire_base: '09:00:30', trade_date: '20261026' } as const;
const N_HEADS_1026: LaunchHeadRow[] = [
  launchHead({ ...N_HEAD_KEY, gateway: 'KB120', market: 'Q', offset_used_us: -245, next_offset_us: -245 }),
  launchHead({ ...N_HEAD_KEY, gateway: 'KYOBO119', market: 'Q', offset_used_us: -200, next_offset_us: -200 }),
];

// ─────────────────────────────────────────────────────────────────────────────
// 경계 지도 (35-08)
// ─────────────────────────────────────────────────────────────────────────────

/** 행 → 지도 RPC 가 싣는 열만. */
function toMapPiece(p: LaunchPieceRow): LaunchMapPiece {
  return {
    trade_date: p.trade_date,
    gateway: p.gateway,
    market: p.market,
    profile: p.profile,
    fire_exchange: p.fire_exchange,
    side: p.side,
    wire: p.wire,
    piece_idx: p.piece_idx,
    sent_rel_us: p.sent_rel_us,
    result: p.result,
    retry: p.retry,
  };
}

/** 합성 Q16 머리 — 첨부 NEXT(라이브는 kind 18 next_offset_us). 지도 heads = (서버, 시장, profile) 별 최신 1행. */
const Q16_MAP_HEADS: LaunchHeadRow[] = (
  [
    ['KB120', 'Q', -337],
    ['KB120', 'K', -285],
    ['KYOBO119', 'Q', -526],
    ['KYOBO119', 'K', -400],
  ] as const
).map(([gateway, market, next]) => launchHead({ trade_date: '20261026', gateway, market, next_offset_us: next }));

/** 합성 N 머리 — 고정 오프셋(KB120 −245 · KYOBO119 −200). */
const N_MAP_HEADS: LaunchHeadRow[] = (
  [
    ['KB120', 'Q', -245],
    ['KB120', 'K', -245],
    ['KYOBO119', 'Q', -200],
    ['KYOBO119', 'K', -200],
  ] as const
).map(([gateway, market, next]) =>
  launchHead({ ...N_HEAD_KEY, gateway, market, offset_used_us: next, next_offset_us: next }),
);

/** 경계 지도 응답 — 발사 기준 × 범위. */
export function launchMapFixture(fire: LaunchFire, range: LaunchRange): LaunchMapResponse {
  if (fire === 'n0930') {
    const aSell = A_PIECES_1026.filter((p) => p.fire_exchange === 'NXT' && p.side === 'sell');
    return { days: ['20261026'], heads: N_MAP_HEADS, pieces: [...N_PIECES_1026, ...aSell].map(toMapPiece) };
  }
  const days = range === '10d' ? LAUNCH_DATES.slice(0, 10) : LAUNCH_DATES;
  const pieces = LAUNCH_Q16_PIECES.filter((p) => days.includes(p.trade_date)).map(toMapPiece);
  return { days, heads: Q16_MAP_HEADS, pieces };
}

/** 적재 이력 0 응답. */
export const LAUNCH_ORDERS_EMPTY: LaunchOrdersResponse = { dates: [], date: null, heads: [], pieces: [] };

/** 주문 내역 응답 — `d` 생략 = 최신. 목록 밖 날짜는 빈 heads/pieces. */
export function launchOrdersFixture(d?: string): LaunchOrdersResponse {
  const date = d ?? LAUNCH_LATEST;
  const pieces = LAUNCH_Q16_PIECES.filter((p) => p.trade_date === date).map((p) =>
    date === '20261026' && p.gateway === 'KB120' && p.market === 'Q' && p.wire === 0 ? { ...p, ...SYN_ORDER_1026 } : p,
  );
  if (date !== '20261026') return { dates: LAUNCH_DATES, date, heads: [], pieces };
  return {
    dates: LAUNCH_DATES,
    date,
    heads: [...SYN_HEADS_1026, ...N_HEADS_1026],
    pieces: [...pieces, ...N_PIECES_1026, ...A_PIECES_1026],
  };
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
  /** true = 적재 이력 0(`LAUNCH_ORDERS_EMPTY`). */
  ordersEmpty?: boolean;
  orders?: (d: string | undefined) => LaunchOrdersResponse | { status: number; body: unknown };
  map?: (fire: LaunchFire, range: LaunchRange) => LaunchMapResponse;
}

export interface LaunchApiMock {
  requests: LaunchRequestRecord[];
  /** GET /orders 요청만. */
  orders: () => LaunchRequestRecord[];
  /** GET /map 요청만. */
  maps: () => LaunchRequestRecord[];
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
      const out = opts.ordersEmpty
        ? LAUNCH_ORDERS_EMPTY
        : (opts.orders?.(rec.query.d) ?? launchOrdersFixture(rec.query.d));
      if (isStatusBody(out)) {
        status = out.status;
        body = out.body;
      } else {
        body = out;
      }
    } else if (rec.path === '/map') {
      const fire = (rec.query.fire ?? 'q16') as LaunchFire;
      const range = (rec.query.range ?? '10d') as LaunchRange;
      body = opts.map?.(fire, range) ?? launchMapFixture(fire, range);
    } else {
      status = 404;
      body = { error: { code: 'NOT_FOUND', message: '없는 경로예요' } };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return {
    requests,
    orders: () => requests.filter((r) => r.method === 'GET' && r.path === '/orders'),
    maps: () => requests.filter((r) => r.method === 'GET' && r.path === '/map'),
  };
}
