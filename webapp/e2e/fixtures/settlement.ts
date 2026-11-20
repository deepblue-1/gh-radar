import type { Page, Route } from '@playwright/test';
import {
  SETTLEMENT_ACCOUNTS,
  poolAccountRows,
  type SettlementAccKey,
  type SettlementLedgerRow,
  type SettlementSettleRow,
  type SettlementView,
  type SettlementWriteResponse,
} from '@gh-radar/shared';

/**
 * Phase 44 (44-12) — 어드민 정산 `/admin/settlement` E2E 픽스처.
 *
 * ① 무엇을 가로채나
 *   `mockSettlementApi` 는 `**\/api/admin/settlement**` 하나만 가로챈다 — 다른 어드민 라우트(계좌 · 사용자 · 서버 · 매매손익)는
 *   건드리지 않는다. 미들웨어는 실 Supabase 로 e2e 계정(admin 시드)을 통과시키고, 화면 데이터만 여기서 준다(admin.ts · pnl.ts 꼴).
 *   운영 relay · DB 는 부르지 않는다.
 *
 * ② 값은 전부 합성이다 — 검산 응답(D-01)
 *   계좌 4개 예수금(known) KB 정근형 8억 4,500만 · 교보 김현중 6억 8,400만 · 교보 정근형 2,000만 · KB 김현중 3억 7,200만 ·
 *   시드 거래 9건(server `admin-settlement.test.ts` 의 `SEED` · webapp `settlement-client-settle.test.tsx` 와 같은 값 · 원 단위).
 *   이 값이면 현중 · 근형 정산 전 수익 +10억 4,900만 · 쥬니 −2,800만 · 「김현중 → 정근형 5,950만원이면 맞음」 이다.
 *   `now` = 평일 KST 2026-11-20 14:32(읽은 시각 · 「오늘」 의 기준). 계좌번호는 응답에 없다(화면 응답 모양 `SettlementView`).
 *
 * ③ 상태 두 벌
 *   `SETTLEMENT_FIXTURE`(정산 없음) → `POST …/settles` 를 받으면 `SETTLEMENT_FIXTURE_AFTER_SETTLE` 로 바뀐다 —
 *   현중 · 근형 정산 1건(id 1 · +10억 4,900만 · 5 : 5) + 김현중 「바로 출금」 줄(교보 김현중에서 5억 2,450만 · 반영함) ·
 *   교보 김현중 예수금 1억 5,950만. 확정 뒤 화면의 다시 불러오기가 이 상태를 받는다.
 *
 * ④ 요청 기록
 *   모든 요청을 `requests` 에 `{ method, url, body }` 로 쌓는다(바디는 JSON 이면 파싱). 단언은 spec 이 한다.
 */

export const SETTLEMENT_NOW = '2026-11-20T05:32:00.000Z'; // KST 11/20(금) 14:32

type RowIn = Pick<SettlementLedgerRow, 'txDate' | 'kind' | 'amountKrw'> & Partial<SettlementLedgerRow>;

const ledgerRow = (id: number, r: RowIn): SettlementLedgerRow => ({
  id,
  who: null,
  fromAcc: null,
  toAcc: null,
  via: null,
  memo: '',
  settleId: null,
  reflect: false,
  pend: {},
  seeded: true,
  createdBy: null,
  createdAt: '2026-11-20T00:00:00.000Z',
  editedBy: null,
  editedAt: null,
  ...r,
});

/** 검산 시드 9건 — 현중 · 근형 정산 전 수익 +10억 4,900만. */
export const SETTLEMENT_SEED: SettlementLedgerRow[] = [
  ledgerRow(1, { txDate: '2025-12-31', kind: 'contribute', who: 'H', toAcc: 'kbG', amountKrw: 400_000_000 }),
  ledgerRow(2, { txDate: '2025-12-31', kind: 'contribute', who: 'G', toAcc: 'kbG', amountKrw: 400_000_000 }),
  ledgerRow(3, { txDate: '2026-08-10', kind: 'move', fromAcc: 'kbG', toAcc: 'kyH', via: 'corp_service', amountKrw: 300_000_000 }),
  ledgerRow(4, { txDate: '2026-09-10', kind: 'contribute', who: 'J', toAcc: 'kbH', amountKrw: 100_000_000 }),
  ledgerRow(5, { txDate: '2026-09-10', kind: 'move', fromAcc: 'kbG', toAcc: 'kbH', via: 'transfer', amountKrw: 100_000_000 }),
  ledgerRow(6, { txDate: '2026-09-13', kind: 'move', fromAcc: 'kbG', toAcc: 'kbH', via: 'transfer', amountKrw: 100_000_000 }),
  ledgerRow(7, { txDate: '2026-09-13', kind: 'move', fromAcc: 'kbG', toAcc: 'kyH', via: 'transfer', amountKrw: 400_000_000 }),
  ledgerRow(8, { txDate: '2026-09-18', kind: 'move', fromAcc: 'kbG', toAcc: 'kbH', via: 'transfer', amountKrw: 100_000_000 }),
  ledgerRow(9, { txDate: '2026-11-01', kind: 'move', fromAcc: 'kbG', toAcc: 'kyG', via: 'transfer', amountKrw: 20_000_000 }),
];

const BUDGETS: Record<SettlementAccKey, number> = {
  kbG: 845_000_000,
  kyH: 684_000_000,
  kyG: 20_000_000,
  kbH: 372_000_000,
};

function view(budgets: Record<SettlementAccKey, number>, ledger: SettlementLedgerRow[], settles: SettlementSettleRow[]): SettlementView {
  return {
    now: SETTLEMENT_NOW,
    accounts: SETTLEMENT_ACCOUNTS.map((a) => ({
      accKey: a.key,
      label: a.label,
      owner: a.owner,
      pool: a.pool,
      state: 'known' as const,
      budgetKrw: budgets[a.key],
      readAt: SETTLEMENT_NOW,
      mismatch: false,
    })),
    ledger,
    settles,
  };
}

/** 첫 화면 — 정산 없음 · 계좌 4개 known · 시드 9건. */
export const SETTLEMENT_FIXTURE: SettlementView = view(BUDGETS, SETTLEMENT_SEED, []);

/** 정산 확정 뒤 — 현중 · 근형 정산 id 1. */
export const SETTLE_ID = 1;
const P1_PROFIT_KRW = 1_049_000_000;
const SHARE_KRW = P1_PROFIT_KRW / 2; // 5억 2,450만

const OUT_ROW = ledgerRow(10, {
  txDate: '2026-11-20',
  kind: 'withdraw_profit',
  who: 'H',
  fromAcc: 'kyH',
  amountKrw: SHARE_KRW,
  settleId: SETTLE_ID,
  reflect: true,
  seeded: false,
  createdBy: 'e2e@example.invalid',
  createdAt: SETTLEMENT_NOW,
});

const SETTLE_ROW: SettlementSettleRow = {
  id: SETTLE_ID,
  pool: 'p1',
  profitKrw: P1_PROFIT_KRW,
  shares: { H: SHARE_KRW, G: SHARE_KRW },
  // 확정한 순간(바로 출금 전)의 계좌 — 첫 화면 값 그대로.
  snapshot: {
    accounts: poolAccountRows('p1', SETTLEMENT_FIXTURE.accounts, SETTLEMENT_SEED),
    cumKrw: P1_PROFIT_KRW,
    prevKrw: 0,
  },
  readAt: SETTLEMENT_NOW,
  memo: '',
  createdBy: 'e2e@example.invalid',
  createdAt: SETTLEMENT_NOW,
};

export const SETTLEMENT_FIXTURE_AFTER_SETTLE: SettlementView = view(
  { ...BUDGETS, kyH: BUDGETS.kyH - SHARE_KRW }, // 1억 5,950만
  [...SETTLEMENT_SEED, OUT_ROW],
  [SETTLE_ROW],
);

export interface SettlementRequestRecord {
  method: string;
  url: string;
  body: unknown;
}

export interface MockSettlementApiOptions {
  /** true 면 처음부터 정산 뒤 상태. */
  afterSettle?: boolean;
}

/** `**\/api/admin/settlement**` 만 가로챈다 — GET 은 지금 상태 · 쓰기는 바디를 기록하고 성공 응답. */
export async function mockSettlementApi(
  page: Page,
  opts: MockSettlementApiOptions = {},
): Promise<{ requests: SettlementRequestRecord[] }> {
  const requests: SettlementRequestRecord[] = [];
  let current: SettlementView = opts.afterSettle ? SETTLEMENT_FIXTURE_AFTER_SETTLE : SETTLEMENT_FIXTURE;

  await page.route('**/api/admin/settlement**', async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();
    const path = new URL(url).pathname;
    const raw = request.postData();
    let body: unknown = null;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    requests.push({ method, url, body });

    let res: SettlementView | SettlementWriteResponse;
    if (method === 'GET') {
      res = current;
    } else if (method === 'POST' && path.endsWith('/api/admin/settlement/settles')) {
      current = SETTLEMENT_FIXTURE_AFTER_SETTLE;
      res = { ok: true, id: SETTLE_ID, pend: {} };
    } else if ((method === 'POST' || method === 'PUT') && /\/api\/admin\/settlement\/ledger(\/\d+)?$/.test(path)) {
      res = { ok: true, id: 99, pend: {} };
    } else {
      res = { ok: true, pend: {} };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });

  return { requests };
}
