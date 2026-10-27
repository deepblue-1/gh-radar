import type { Page, Route } from '@playwright/test';
import type { PnlDayRow, PnlGroup, PnlReport } from '@gh-radar/shared';

/**
 * Phase 36-08 — 일자별 매매손익 E2E 픽스처 (`/me` 「손익」 탭 · `/admin/pnl`).
 *
 * - 화면 데이터는 `mockPnlApi` 가 `/api/pnl` · `/api/admin/pnl` 만 가로챈다(다른 어드민 라우트 무관 · launch 픽스처 꼴).
 * - 매수 1,234,567,890,000 원 행 1개 — 「123,456,789만」 이 데스크톱 매수 칸(104px) · 폰 아랫줄에서 잘리지 않는지
 *   보는 백스톱(UI-SPEC E2 overflow).
 * - 값은 전부 합성이다(가짜 계좌 · 가짜 dma_user_id).
 */

/** 조 단위 매수 — 「123,456,789만」. */
export const PNL_HUGE_BUY_KRW = 1_234_567_890_000;
export const PNL_HUGE_LABEL = '123,456,789만';

function day(over: Partial<PnlDayRow> & Pick<PnlDayRow, 'date'>): PnlDayRow {
  return { pnl: 0, fee: 0, tax: 0, buy: 0, sell: 0, fills: 0, stocks: [], ...over };
}

const DAYS: PnlDayRow[] = [
  day({
    date: '2026-10-27',
    pnl: 1_234_567,
    fee: 16_400,
    tax: 33_000,
    buy: PNL_HUGE_BUY_KRW,
    sell: 16_400_000,
    fills: 7,
    stocks: [
      { isin: 'KR7005930003', code: '005930', name: '삼성전자', pnl: 870_000, buy: 7_500_000, sell: 8_200_000, fills: 3 },
      {
        isin: 'KR7000660001',
        code: '000660',
        name: '아주아주긴종목이름이라서잘려야하는종목우선주',
        pnl: 376_912,
        buy: PNL_HUGE_BUY_KRW - 7_500_000,
        sell: 8_200_000,
        fills: 3,
      },
      { isin: 'KR7999999990', code: null, name: null, pnl: -12_345, buy: 0, sell: 0, fills: 1 },
    ],
  }),
  day({
    date: '2026-10-24',
    pnl: -12_345,
    fee: 4_400,
    tax: 0,
    buy: 1_000_000,
    sell: 0,
    fills: 2,
    stocks: [{ isin: 'KR7000660001', code: '000660', name: 'SK하이닉스', pnl: -12_345, buy: 1_000_000, sell: 0, fills: 2 }],
  }),
];

function totalOf(days: PnlDayRow[]): PnlGroup['total'] {
  const t = { pnl: 0, fee: 0, tax: 0, buy: 0, sell: 0, fills: 0 };
  for (const d of days) {
    t.pnl += d.pnl;
    t.fee += d.fee;
    t.tax += d.tax;
    t.buy += d.buy;
    t.sell += d.sell;
    t.fills += d.fills;
  }
  return t;
}

function group(over: Partial<PnlGroup> & Pick<PnlGroup, 'key'>, days: PnlDayRow[] = DAYS): PnlGroup {
  return { accounts: [], dma_user_ids: [], account_name: null, total: totalOf(days), days, ...over };
}

/** /me — 계좌 1 · 2일 · 종목 3(수익/손실 섞음 · 이름 없음 → ISIN) · 조 단위 매수. `dma_user_ids` 는 늘 빈 배열(36-07). */
export function pnlMeFixture(accountNo: string, range = '30'): PnlReport {
  return {
    from: range === '7' ? '2026-10-21' : '2026-09-28',
    to: '2026-10-27',
    groups: [group({ key: accountNo, accounts: [{ broker: 'KB', gateway: 'KB120', account_no: accountNo }] })],
  };
}

/** 어드민 계정별 — ezmesya · kim01 · 「미상」(맨 뒤 · RPC 순서 그대로). */
export const PNL_ADMIN_USER_FIXTURE: PnlReport = {
  from: '2026-09-28',
  to: '2026-10-27',
  groups: [
    group({
      key: 'ezmesya',
      accounts: [
        { broker: 'KB', gateway: 'KB120', account_no: '37728502101' },
        { broker: 'KYOBO', gateway: 'KYOBO119', account_no: '10279758101' },
      ],
      dma_user_ids: ['ezmesya'],
    }),
    group({ key: 'kim01', accounts: [{ broker: 'KB', gateway: 'KB121', account_no: '37728502102' }], dma_user_ids: ['kim01'] }, [
      DAYS[1]!,
    ]),
    group({ key: '', accounts: [{ broker: 'KB', gateway: 'KB120', account_no: '50011122233' }] }, [DAYS[1]!]),
  ],
};

/** 어드민 계좌별 — KB 계좌(KB120/KB121 한 묶음) · 교보 1. */
export const PNL_ADMIN_ACCOUNT_FIXTURE: PnlReport = {
  from: '2026-09-28',
  to: '2026-10-27',
  groups: [
    group({
      key: '37728502101',
      accounts: [
        { broker: 'KB', gateway: 'KB120', account_no: '37728502101' },
        { broker: 'KB', gateway: 'KB121', account_no: '37728502101' },
      ],
      dma_user_ids: ['ezmesya', 'kim01'],
      account_name: '위탁',
    }),
    group(
      {
        key: '10279758101',
        accounts: [{ broker: 'KYOBO', gateway: 'KYOBO119', account_no: '10279758101' }],
        dma_user_ids: ['ezmesya'],
      },
      [DAYS[1]!],
    ),
  ],
};

export interface PnlRequestRecord {
  path: '/api/pnl' | '/api/admin/pnl';
  query: Record<string, string>;
}

type PnlAnswer = PnlReport | { status: number; body: unknown };

export interface MockPnlApiOptions {
  /** /me 응답(undefined = 기본 `pnlMeFixture(account, range)`). */
  me?: (query: Record<string, string>) => PnlAnswer | undefined;
  /** 어드민 응답 — nth = 0 부터 센 어드민 요청 순번(undefined = group 에 따라 계정별 · 계좌별 픽스처). */
  admin?: (query: Record<string, string>, nth: number) => PnlAnswer | undefined;
}

function isStatus(a: PnlAnswer): a is { status: number; body: unknown } {
  return 'status' in a && 'body' in a;
}

/** `/api/pnl` · `/api/admin/pnl` 만 가로챈다 — 요청 URL 을 기록한다(단언은 케이스가 한다). */
export async function mockPnlApi(page: Page, opts: MockPnlApiOptions = {}): Promise<{ requests: PnlRequestRecord[] }> {
  const requests: PnlRequestRecord[] = [];
  let adminN = 0;
  await page.route(
    (url) => url.pathname.endsWith('/api/pnl') || url.pathname.endsWith('/api/admin/pnl'),
    async (route: Route) => {
      const url = new URL(route.request().url());
      const query = Object.fromEntries(url.searchParams.entries());
      const isAdmin = url.pathname.endsWith('/api/admin/pnl');
      requests.push({ path: isAdmin ? '/api/admin/pnl' : '/api/pnl', query });
      const answer: PnlAnswer = isAdmin
        ? (opts.admin?.(query, adminN++) ??
          (query.group === 'account' ? PNL_ADMIN_ACCOUNT_FIXTURE : PNL_ADMIN_USER_FIXTURE))
        : (opts.me?.(query) ?? pnlMeFixture(query.account ?? '', query.range));
      const status = isStatus(answer) ? answer.status : 200;
      const body = isStatus(answer) ? answer.body : answer;
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    },
  );
  return { requests };
}
