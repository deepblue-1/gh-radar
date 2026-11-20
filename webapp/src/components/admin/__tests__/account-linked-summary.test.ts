import { describe, expect, it } from 'vitest';
import {
  accountCostOf,
  indexAccountCosts,
  normalizeAccountNo,
  settlementBudgetOf,
  type AdminAccountCostRow,
  type AdminAccountCostsRaw,
  type AdminAccountMaster,
  type AdminAccountView,
  type AdminUsersOverview,
  type SettlementRawAccount,
  type SettlementRawServer,
} from '@gh-radar/shared';

import {
  fanoutSlotLabel,
  flattenFanout,
  linkedAccountOf,
  orderEndpointToSend,
  summarizeLinkedCosts,
  summarizeLinkedOrderEndpoint,
  type LinkedAccount,
} from '../account-linked-summary';

/**
 * quick 261106-ntl N-01 · N-02 — 계좌 수정 시트의 사용자·서버 집계(순수 함수).
 *
 * 잠그는 것: 자리 = 마스터 users 순 × active 서버(removing 제외) · 라벨 「<DMA id> · <서버>」 · 개요 뷰는 DMA id 첫 줄 · 같은 증권사 ·
 * 정규화 계좌번호 · 정본 = 값을 아는 첫 사용자의 shared 출처 값 · 불일치는 정본 자리 밖 값-아는 자리 · 확인 전 자리는 비교 밖 ·
 * IP/MAC 보내기 규칙(정규화 비교 · 불일치 맞추기 · trim 원문 · 확인 전 빈 칸 미전송) · 팬아웃 응답 접기.
 */

const NO = '5120009880';
const MASTER: AdminAccountMaster = {
  broker: 'KB',
  accountNo: NO,
  name: '주식',
  branchNo: '00123',
  traderId: 'T00001',
  updatedAt: '2026-11-06T00:00:00Z',
  users: [
    { dmaUserId: 'kimtr', emails: [], priority: 0, servers: [{ serverKey: 'KB120', state: 'active' }, { serverKey: 'KB121', state: 'active' }] },
    { dmaUserId: 'leetr', emails: [], priority: 1, servers: [{ serverKey: 'KB120', state: 'active' }] },
    { dmaUserId: 'parktr', emails: [], priority: 2, servers: [{ serverKey: 'KB121', state: 'removing' }] },
  ],
};

const cost = (budgetKrw: number, feePpm = 100, sellTaxPpm = 2000) => ({ budgetKrw, feePpm, sellTaxPpm, budgetSource: 'live' as const });
const EP_A = { orderIp: '010041001124', orderMac: '1CFD087D978E' };
const EP_B = { orderIp: '010041001125', orderMac: '1CFD087D978E' };
const EP_UNSET = { orderIp: '', orderMac: '' };

function view(servers: string[], over: Partial<AdminAccountView> = {}): AdminAccountView {
  return {
    broker: 'KB',
    accountNo: `00${NO}`,
    name: '주식',
    branchNo: '00123',
    traderId: 'T00001',
    priority: 0,
    servers: servers.map((serverKey) => ({ serverKey, tone: 'ok' as const, message: null, state: 'active' as const })),
    serverOnlyOn: [],
    orderServer: null,
    defaultOrderServer: 'KB120',
    ...over,
  };
}

function overview(kim: Partial<AdminAccountView> | null, lee: Partial<AdminAccountView> | null): AdminUsersOverview {
  const row = (email: string, dmaUserId: string, accounts: AdminAccountView[]) => ({
    email,
    role: 'trader' as const,
    dmaUserId,
    signedUp: true,
    accountCount: accounts.length,
    servers: [],
    accounts,
  });
  return {
    users: [
      ...(kim ? [row('kim@x', 'kimtr', [view(['KB120', 'KB121'], kim)])] : []),
      // 같은 DMA id 둘째 줄(다른 이메일) — 첫 줄을 쓴다
      ...(kim ? [row('kim2@x', 'kimtr', [view(['KB120', 'KB121'], { costs: { KB120: cost(1), KB121: cost(1) } })])] : []),
      ...(lee ? [row('lee@x', 'leetr', [view(['KB120'], lee)])] : []),
      // 다른 증권사 · 같은 번호 — 섞이지 않는다
      row('ky@x', 'kytr', [{ ...view(['KYOBO119']), broker: 'KYOBO' }]),
    ],
    pending: [],
    serverOnly: [],
    servers: [
      { key: 'KB120', broker: 'KB', enabled: true },
      { key: 'KB121', broker: 'KB', enabled: true },
      { key: 'KYOBO119', broker: 'KYOBO', enabled: true },
    ],
  };
}

describe('linkedAccountOf', () => {
  it('자리 = 마스터 users 순 × active 서버(removing 제외) · 라벨 「kimtr · KB120」 · views = DMA id 첫 줄 · 같은 증권사 · 정규화 번호', () => {
    const l = linkedAccountOf(MASTER, overview({ costs: { KB120: cost(10) } }, {}));
    expect(l.slots.map((s) => s.label)).toEqual(['kimtr · KB120', 'kimtr · KB121', 'leetr · KB120']);
    expect(l.slots.some((s) => s.dmaUserId === 'parktr')).toBe(false);
    expect(fanoutSlotLabel('kimtr', 'KB120')).toBe('kimtr · KB120');
    expect([...l.views.keys()]).toEqual(['kimtr', 'leetr']);
    expect(l.views.get('kimtr')!.costs).toEqual({ KB120: cost(10) });
    expect(l.registry.map((s) => s.key)).toEqual(['KB120', 'KB121']);
  });

  it('overview null → views 비고 registry []', () => {
    const l = linkedAccountOf(MASTER, null);
    expect(l.slots).toHaveLength(3);
    expect(l.views.size).toBe(0);
    expect(l.registry).toEqual([]);
  });
});

describe('summarizeLinkedCosts', () => {
  it('kimtr(1천만 · 100/2000) · leetr(5백만) → 정본 kimtr · source 「kimtr · KB120」 · 예수금 불일치 1 · 비용률 불일치 따로', () => {
    const l = linkedAccountOf(
      MASTER,
      overview({ costs: { KB120: cost(10_000_000), KB121: cost(10_000_000) } }, { costs: { KB120: cost(5_000_000, 500, 2000) } }),
    );
    const { summary, slots } = summarizeLinkedCosts(l);
    expect(summary).toMatchObject({ state: 'known', budgetKrw: 10_000_000, feePpm: 100, sellTaxPpm: 2000, source: 'kimtr · KB120' });
    expect(summary.budgetMismatches).toEqual([{ serverKey: 'leetr · KB120', budgetKrw: 5_000_000 }]);
    expect(summary.feeMismatches).toEqual([{ serverKey: 'leetr · KB120', feePpm: 500, sellTaxPpm: 2000 }]);
    expect(slots).toEqual([
      { label: 'kimtr · KB120', known: true },
      { label: 'kimtr · KB121', known: true },
      { label: 'leetr · KB120', known: true },
    ]);
  });

  it('87 모르는 자리는 known false 로 남고 비교 밖', () => {
    const l = linkedAccountOf(MASTER, overview({ costs: { KB120: cost(10), KB121: null } }, { costs: { KB120: cost(10) } }));
    const { summary, slots } = summarizeLinkedCosts(l);
    expect(slots.map((s) => s.known)).toEqual([true, false, true]);
    expect(summary.budgetMismatches).toEqual([]);
    expect(summary.feeMismatches).toEqual([]);
  });

  it('kimtr 전부 모름 → 정본 = leetr · 개요에 kimtr 없음도 같음', () => {
    const a = summarizeLinkedCosts(linkedAccountOf(MASTER, overview({ costs: { KB120: null, KB121: null } }, { costs: { KB120: cost(7) } })));
    expect(a.summary).toMatchObject({ state: 'known', budgetKrw: 7, source: 'leetr · KB120' });
    const b = summarizeLinkedCosts(linkedAccountOf(MASTER, overview(null, { costs: { KB120: cost(7) } })));
    expect(b.summary.source).toBe('leetr · KB120');
    expect(b.slots.map((s) => s.known)).toEqual([false, false, true]);
  });

  it('아무도 모름 → unknown(0 · source null · 불일치 [])', () => {
    const { summary } = summarizeLinkedCosts(linkedAccountOf(MASTER, null));
    expect(summary).toEqual({
      state: 'unknown',
      budgetKrw: 0,
      feePpm: 0,
      sellTaxPpm: 0,
      source: null,
      budgetMismatches: [],
      feeMismatches: [],
    });
  });

  it('정본 = 사용자의 유효 주문 서버 값(kimtr 지정 KB121)', () => {
    const l = linkedAccountOf(
      MASTER,
      overview({ orderServer: 'KB121', costs: { KB120: cost(1), KB121: cost(2) } }, { costs: { KB120: cost(2) } }),
    );
    const { summary } = summarizeLinkedCosts(l);
    expect(summary).toMatchObject({ budgetKrw: 2, source: 'kimtr · KB121' });
    expect(summary.budgetMismatches).toEqual([{ serverKey: 'kimtr · KB120', budgetKrw: 1 }]);
  });
});

describe('summarizeLinkedOrderEndpoint', () => {
  it('kimtr A · leetr 미설정 → set · source 「kimtr · KB120」 · 불일치 [leetr · KB120 unset]', () => {
    const s = summarizeLinkedOrderEndpoint(
      linkedAccountOf(MASTER, overview({ orderEndpoints: { KB120: EP_A, KB121: EP_A } }, { orderEndpoints: { KB120: EP_UNSET } })),
    );
    expect(s).toEqual({
      state: 'set',
      orderIp: EP_A.orderIp,
      orderMac: EP_A.orderMac,
      source: 'kimtr · KB120',
      mismatches: [{ serverKey: 'leetr · KB120', state: 'unset', orderIp: '', orderMac: '' }],
    });
  });

  it('IP 만 달라도 불일치(set) · 모르는 자리는 비교 밖 · 아무도 모르면 unknown', () => {
    const s = summarizeLinkedOrderEndpoint(
      linkedAccountOf(MASTER, overview({ orderEndpoints: { KB120: EP_A, KB121: null } }, { orderEndpoints: { KB120: EP_B } })),
    );
    expect(s.mismatches).toEqual([{ serverKey: 'leetr · KB120', state: 'set', ...EP_B }]);
    expect(summarizeLinkedOrderEndpoint(linkedAccountOf(MASTER, null))).toEqual({
      state: 'unknown',
      orderIp: '',
      orderMac: '',
      source: null,
      mismatches: [],
    });
  });

  it('kimtr 미설정이 정본이면 state unset', () => {
    const s = summarizeLinkedOrderEndpoint(
      linkedAccountOf(MASTER, overview({ orderEndpoints: { KB120: EP_UNSET, KB121: EP_UNSET } }, { orderEndpoints: { KB120: EP_UNSET } })),
    );
    expect(s).toMatchObject({ state: 'unset', source: 'kimtr · KB120', mismatches: [] });
  });
});

describe('orderEndpointToSend', () => {
  const SET = { ip: '10.41.1.124', mac: '1C:FD:08:7D:97:8E' };
  it('정규화 비교 같음 + 불일치 없음 → null(다른 표기 · 앞뒤 공백도)', () => {
    expect(orderEndpointToSend({ initial: SET, draft: SET, mismatched: false })).toBeNull();
    expect(
      orderEndpointToSend({ initial: SET, draft: { ip: ' 010041001124 ', mac: '1c-fd-08-7d-97-8e' }, mismatched: false }),
    ).toBeNull();
  });

  it('바뀜 → { trim 원문 }(정규화값을 보내지 않음)', () => {
    expect(orderEndpointToSend({ initial: SET, draft: { ip: ' 10.41.1.200 ', mac: '1c-fd-08-7d-97-8e' }, mismatched: false })).toEqual({
      orderIp: '10.41.1.200',
      orderMac: '1c-fd-08-7d-97-8e',
    });
  });

  it('안 바뀜 + 불일치 → draft trim 원문', () => {
    expect(orderEndpointToSend({ initial: SET, draft: { ip: '10.41.1.124 ', mac: SET.mac }, mismatched: true })).toEqual({
      orderIp: '10.41.1.124',
      orderMac: '1C:FD:08:7D:97:8E',
    });
  });

  it('확인 전(초깃값 "" "") 두 칸 빈 채 → null · 설정값에서 두 칸 비움 → { "", "" }', () => {
    const EMPTY = { ip: '', mac: '' };
    expect(orderEndpointToSend({ initial: EMPTY, draft: { ip: '  ', mac: '' }, mismatched: false })).toBeNull();
    expect(orderEndpointToSend({ initial: SET, draft: EMPTY, mismatched: false })).toEqual({ orderIp: '', orderMac: '' });
  });
});

describe('flattenFanout', () => {
  it('results server → 「<dma> · <server>」(code · message · outcome 보존) · error 항목 → { server: dma, outcome: failed, message } 1개', () => {
    expect(
      flattenFanout({
        ok: true,
        fanout: [
          {
            dmaUserId: 'kimtr',
            results: [
              { server: 'KB120', outcome: 'ok', usersRev: '3' },
              { server: 'KB121', outcome: 'failed', code: 1, message: 'BAD_OP' },
            ],
            error: null,
          },
          { dmaUserId: 'leetr', results: [], error: { code: 'NO_SUCH_ACCOUNT', message: '없는 계좌' } },
        ],
      }),
    ).toEqual({
      results: [
        { server: 'kimtr · KB120', outcome: 'ok', usersRev: '3' },
        { server: 'kimtr · KB121', outcome: 'failed', code: 1, message: 'BAD_OP' },
        { server: 'leetr', outcome: 'failed', message: '없는 계좌' },
      ],
    });
  });
});

/**
 * Phase 44 D-03 — 정산 예수금 판정(shared `settlementBudgetOf`)은 계좌 메뉴 판정(`summarizeLinkedCosts`)과 같다.
 *
 * 같은 relay 응답(`AdminAccountCostsRaw`)과 같은 연결(사용자 2 · 서버 2 · 주문 서버 KB120)을 양쪽 모양으로 만들어 넣고
 * 예수금 · 출처 서버(계좌 메뉴 라벨 「<DMA id> · <서버>」 의 서버 부분) · 서버 간 다름 여부가 같은지 4 경우로 대조한다.
 * 양쪽 값은 같은 `accountCostOf(indexAccountCosts(raw).get(서버)?.get(정규화 계좌), dma)` 로 만든다(행이 없으면 그 서버 첫 행으로 내려가는 규칙까지 같게).
 */
describe('D-03 — 정산 예수금 판정은 계좌 메뉴와 같다', () => {
  const ACC_NO = '5120009880';
  const ORDER = 'KB120';
  const costRow = (dmaUserId: string, budgetKrw: number, liveBudgetKrw: number | null): AdminAccountCostRow => ({
    dmaUserId,
    accountNo: ACC_NO,
    budgetKrw,
    feePpm: 100,
    sellTaxPpm: 2000,
    liveBudgetKrw,
  });

  function judge(raw: AdminAccountCostsRaw, links: { dma: string; servers: string[] }[]) {
    const idx = indexAccountCosts(raw);
    const key = normalizeAccountNo(ACC_NO);
    const linked: LinkedAccount = {
      slots: links.flatMap((l) =>
        l.servers.map((s) => ({ dmaUserId: l.dma, serverKey: s, label: fanoutSlotLabel(l.dma, s) })),
      ),
      views: new Map(
        links.map((l) => [
          l.dma,
          view(l.servers, {
            defaultOrderServer: ORDER,
            costs: Object.fromEntries(l.servers.map((s) => [s, accountCostOf(idx.get(s)?.get(key), l.dma)])),
          }),
        ]),
      ),
      registry: [
        { key: 'KB120', broker: 'KB', enabled: true },
        { key: 'KB121', broker: 'KB', enabled: true },
      ],
    };
    const account: SettlementRawAccount = {
      accKey: 'kbG',
      broker: 'KB',
      accountNo: ACC_NO,
      name: '주식',
      links: links.map((l) => ({
        dmaUserId: l.dma,
        servers: l.servers.map((s) => ({ serverKey: s, state: 'active' as const, isOrder: false })),
      })),
    };
    const registry: SettlementRawServer[] = [
      { key: 'KB120', broker: 'KB', enabled: true, isOrderServer: ORDER === 'KB120' },
      { key: 'KB121', broker: 'KB', enabled: true, isOrderServer: false },
    ];
    const menu = summarizeLinkedCosts(linked).summary;
    const settle = settlementBudgetOf(account, registry, raw);
    return { menu, settle };
  }

  /** 두 판정이 같은 예수금 · 같은 출처 서버 · 같은 다름 여부를 낸다. */
  function expectSame(r: ReturnType<typeof judge>, want: { budgetKrw: number; server: string; mismatch: boolean }) {
    expect(r.menu.state).toBe('known');
    expect(r.settle.state).toBe('known');
    if (r.settle.state !== 'known') return;
    expect(r.menu.budgetKrw).toBe(want.budgetKrw);
    expect(r.settle.budgetKrw).toBe(want.budgetKrw);
    expect(r.menu.source!.split(' · ')[1]).toBe(want.server);
    expect(r.settle.source).toBe(want.server);
    expect(r.menu.budgetMismatches.length > 0).toBe(want.mismatch);
    expect(r.settle.mismatch).toBe(want.mismatch);
  }

  const TWO_USERS = [
    { dma: 'kimtr', servers: ['KB120', 'KB121'] },
    { dma: 'leetr', servers: ['KB120'] },
  ];

  it('① 67 live 우선 — 87 값(8억)이 아니라 live 값(9억) · 출처 주문 서버 KB120 · 다름 없음', () => {
    const r = judge(
      { servers: { KB120: [costRow('kimtr', 800_000_000, 900_000_000)], KB121: [costRow('kimtr', 900_000_000, null)] } },
      TWO_USERS,
    );
    expectSame(r, { budgetKrw: 900_000_000, server: 'KB120', mismatch: false });
    expect(r.settle.state === 'known' && r.settle.budgetSource).toBe('live');
  });

  it('② live 없음 → 87 값으로 내려감(8억 · snapshot)', () => {
    const r = judge(
      { servers: { KB120: [costRow('kimtr', 800_000_000, null)], KB121: [costRow('kimtr', 800_000_000, null)] } },
      TWO_USERS,
    );
    expectSame(r, { budgetKrw: 800_000_000, server: 'KB120', mismatch: false });
    expect(r.settle.state === 'known' && r.settle.budgetSource).toBe('snapshot');
  });

  it('③ 첫 사용자(kimtr · KB121)가 모름 → 둘째 사용자(leetr · KB120) 값', () => {
    const r = judge({ servers: { KB120: [costRow('leetr', 500_000_000, 500_000_000)] } }, [
      { dma: 'kimtr', servers: ['KB121'] },
      { dma: 'leetr', servers: ['KB120'] },
    ]);
    expectSame(r, { budgetKrw: 500_000_000, server: 'KB120', mismatch: false });
    expect(r.menu.source).toBe('leetr · KB120');
  });

  it('④ 서버 간 다름 — KB120 9억 · KB121 7억 → 주문 서버(KB120) 값 · 양쪽 모두 다름', () => {
    const r = judge(
      {
        servers: {
          KB120: [costRow('kimtr', 900_000_000, 900_000_000)],
          KB121: [costRow('kimtr', 700_000_000, 700_000_000)],
        },
      },
      TWO_USERS,
    );
    expectSame(r, { budgetKrw: 900_000_000, server: 'KB120', mismatch: true });
  });
});
