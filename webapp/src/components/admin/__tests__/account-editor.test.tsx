import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { summarizeAccountCosts, type AdminAccountMaster, type AdminAccountView, type AdminUsersOverview } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * Phase 29 (29-17) — 계좌 · 등록 서버 편집 (D-14 · D-15 · D-23 ③④⑤ · 목업 A `acct()`).
 *
 * 잠그는 것: 계좌 줄(증권사 · 계좌번호 · 이름 · 「제거」) · 그 증권사 서버만 토글 · 교보 「해당 없음」 · 87 전용 흐린 줄 ·
 * 토글 1회 = PUT 1건(계좌 단위 서버 집합) · 응답 결과 → 그 계좌 · 그 서버 칩(BUSY message 원문 title + 한 줄) ·
 * 마지막 서버는 못 끈다 · 연결 해제(종전 「제거」 — 2개 이상 = DELETE 1건 · 마지막 = 사용자 삭제로) · 「+ 계좌 연결」
 * (quick 261106-lwu D-09 — 피커 · 이미 있는 계좌 제외 · 고른 증권사 서버 · 마스터 값으로 PUT 1건) · 메타 줄 「계좌」 메뉴 안내.
 * quick 261106-ntl N-03 — 카드는 읽기 전용(「편집」 · 편집 모드 없음 · IP/MAC · 예수금 · 수수료 · 매도세 읽기 줄 끝 「설정은 「계좌」
 * 메뉴에서」). 세 칸 상태기계(P36)는 계좌 수정 시트가 꽂는 `AccountCostFields` 를 단일 사용자 하네스로 잠근다.
 */

const putDmaAccountMock = vi.fn();
const removeDmaAccountMock = vi.fn();
const setAccountOrderServerMock = vi.fn();
const setAccountBudgetMock = vi.fn();
const setAccountFeeMock = vi.fn();
const serverOnlyAccountMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  serverOnlyAccount: (dma: string, broker: string, no: string, action: string) => serverOnlyAccountMock(dma, broker, no, action),
  putDmaAccount: (dma: string, body: unknown) => putDmaAccountMock(dma, body),
  removeDmaAccount: (dma: string, broker: string, no: string) => removeDmaAccountMock(dma, broker, no),
  setAccountOrderServer: (dma: string, broker: string, no: string, key: string | null) =>
    setAccountOrderServerMock(dma, broker, no, key),
}));

import { AccountCostFields, AccountEditor, josaEulReul } from '../account-editor';

const SERVERS: AdminUsersOverview['servers'] = [
  { key: 'KB120', broker: 'KB', enabled: true },
  { key: 'KB121', broker: 'KB', enabled: true },
  { key: 'KYOBO119', broker: 'KYOBO', enabled: true },
  { key: 'KYOBO127', broker: 'KYOBO', enabled: true },
];

const BUSY = '미체결 2건 — 먼저 정리';
/** 꺼진 서버 skipped 사유(29-34 WR-04 — relay `SKIPPED_DISABLED_RECONCILE_MESSAGE` 와 같은 문구). */
const SKIPPED_REASON = '사용이 꺼진 서버 — 켜면 「다시 반영」 으로 맞춰요';

const KB_ACCT: AdminAccountView = {
  broker: 'KB',
  accountNo: '12345678901',
  name: '위탁',
  branchNo: '00123',
  traderId: '000789',
  priority: 1,
  servers: [{ serverKey: 'KB120', tone: 'ok', message: null, state: 'active' }],
  serverOnlyOn: [],
};

const KYOBO_ACCT: AdminAccountView = {
  broker: 'KYOBO',
  accountNo: '9876543201',
  name: '위탁',
  branchNo: '',
  traderId: '',
  priority: 2,
  servers: [{ serverKey: 'KYOBO119', tone: 'ok', message: null, state: 'active' }],
  serverOnlyOn: [],
};

const ONLY_ACCT: AdminAccountView = {
  broker: 'KYOBO',
  accountNo: '5550001',
  name: '',
  branchNo: '',
  traderId: '',
  priority: 0,
  servers: [],
  serverOnlyOn: ['KYOBO127'],
};

/** 계좌 마스터(quick 261106-lwu) — 위 의도 계좌 2개 + 아직 이 사용자에 없는 KB · 교보 계좌. */
const masterOf = (a: AdminAccountView, users: string[] = ['kimtr']): AdminAccountMaster => ({
  broker: a.broker,
  accountNo: a.accountNo,
  name: a.name,
  branchNo: a.branchNo,
  traderId: a.traderId,
  updatedAt: '2026-11-06T00:00:00Z',
  users: users.map((dmaUserId) => ({ dmaUserId, emails: [], priority: 0, servers: [] })),
});
const FREE_KB: AdminAccountMaster = {
  broker: 'KB',
  accountNo: '5120009880',
  name: '주식',
  branchNo: '00777',
  traderId: 'T00777',
  updatedAt: '2026-11-06T00:00:00Z',
  users: [{ dmaUserId: 'leetr', emails: [], priority: 0, servers: [] }],
};
const FREE_KYOBO: AdminAccountMaster = {
  broker: 'KYOBO',
  accountNo: '777',
  name: '',
  branchNo: '',
  traderId: '',
  updatedAt: '2026-11-06T00:00:00Z',
  users: [],
};
const MASTER: AdminAccountMaster[] = [masterOf(KB_ACCT), FREE_KB, masterOf(KYOBO_ACCT), FREE_KYOBO];

const acctRow = (no: string) => document.querySelector(`[data-slot="admin-account"][data-account="${no}"]`) as HTMLElement;
const toggle = (no: string, key: string) =>
  within(acctRow(no)).getByRole('checkbox', { name: key });
const pill = (no: string, key: string) =>
  acctRow(no).querySelector(`[data-slot="admin-server-toggle"][data-server="${key}"]`) as HTMLElement;

function setup(accounts: AdminAccountView[] = [KB_ACCT, KYOBO_ACCT, ONLY_ACCT]) {
  const onChanged = vi.fn();
  const onRemoveLast = vi.fn();
  render(
    <AccountEditor
      masterAccounts={MASTER}
      dmaUserId="kimtr"
      accounts={accounts}
      servers={SERVERS}
      onChanged={onChanged}
      onRemoveLast={onRemoveLast}
    />,
  );
  return { onChanged, onRemoveLast };
}

beforeEach(() => {
  putDmaAccountMock.mockReset();
  removeDmaAccountMock.mockReset();
  setAccountOrderServerMock.mockReset();
  setAccountBudgetMock.mockReset();
  setAccountFeeMock.mockReset();
  serverOnlyAccountMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AccountEditor — 계좌 줄', () => {
  it('KB 계좌는 KB 서버만 토글 · 교보 계좌는 「해당 없음」 · 87 전용 계좌는 흐린 「서버에만 있음」 줄(설명 + 연결 버튼)', () => {
    setup();
    const kb = acctRow('12345678901');
    expect(kb).toHaveTextContent('KB');
    expect(kb).toHaveTextContent('위탁');
    expect(within(kb).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['KB120', 'KB121']);
    expect(toggle('12345678901', 'KB120')).toHaveAttribute('aria-checked', 'true');
    expect(toggle('12345678901', 'KB121')).toHaveAttribute('aria-checked', 'false');
    expect(within(kb).getByRole('button', { name: /연결 해제/ })).toBeInTheDocument();
    // 반영 칩 — 목업 `.sv .st`(키는 토글 글자 · 칩은 상태 낱말)
    const ok = pill('12345678901', 'KB120').querySelector('[data-slot="reflect-chip"]') as HTMLElement;
    expect(ok).toHaveTextContent('반영됨');
    expect(ok).toHaveAttribute('data-tone', 'ok');

    const ky = acctRow('9876543201');
    expect(ky).toHaveTextContent('지점 해당 없음');
    expect(ky).toHaveTextContent('트레이더 해당 없음');
    expect(within(ky).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['KYOBO119', 'KYOBO127']);
    // 카드에는 입력칸이 없다(quick 261106-ntl N-03 — 예수금 · 수수료 · 매도세 · IP/MAC 도 「계좌」 메뉴로).
    expect(within(kb).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(ky).queryAllByRole('textbox')).toHaveLength(0);

    const only = acctRow('5550001');
    expect(only).toHaveAttribute('data-server-only', 'true');
    expect(only).toHaveTextContent('KYOBO127 · 서버에만 있음');
    // quick-261107-moq — 칩 아래 설명 줄 + 버튼 줄(체크박스 없음).
    expect(only.querySelector('[data-slot="admin-server-only-why"]')).toHaveTextContent(
      'KYOBO127 서버 설정에만 있고 이 사용자에 연결돼 있지 않아요. 그래서 여기서 연결 해제해도 그 서버에는 닿지 않아요.',
    );
    expect(within(only).getAllByRole('button').map((b) => b.textContent)).toEqual(['이 사용자에 연결']);
    expect(within(only).queryByRole('checkbox')).toBeNull();
  });

  it('KB121 켬 → PUT 1건(계좌 + 서버 집합) → KB121 failed → 「실패 · BUSY」 칩(title = message) · 한 줄 · 토글은 켜진 채', async () => {
    putDmaAccountMock.mockResolvedValue({
      results: [
        { server: 'KB120', outcome: 'ok' },
        { server: 'KB121', outcome: 'failed', code: 9, message: BUSY },
      ],
    });
    const { onChanged } = setup();
    fireEvent.click(toggle('12345678901', 'KB121'));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(putDmaAccountMock).toHaveBeenCalledWith('kimtr', {
      account: { broker: 'KB', accountNo: '12345678901', name: '위탁', branchNo: '00123', traderId: '000789', priority: 1 },
      servers: ['KB120', 'KB121'],
    });

    const chip = await waitFor(() => {
      const c = pill('12345678901', 'KB121').querySelector('[data-slot="reflect-chip"]') as HTMLElement;
      if (!c) throw new Error('no chip');
      return c;
    });
    expect(chip).toHaveTextContent('실패 · BUSY');
    expect(chip).toHaveAttribute('data-tone', 'err');
    expect(chip).toHaveAttribute('title', BUSY);
    const line = document.querySelector('[data-slot="admin-busy-line"]') as HTMLElement;
    expect(line).toHaveTextContent(`KB121 실패 · BUSY: ${BUSY} — 정리 뒤 「다시 반영」`);
    expect(toggle('12345678901', 'KB121')).toHaveAttribute('aria-checked', 'true');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('결과 → 칩: timeout 「응답 없음」(err) · offline 「서버 연결 안 됨」(warn) · skipped 「미반영」(warn)', async () => {
    putDmaAccountMock.mockResolvedValue({
      results: [
        { server: 'KYOBO119', outcome: 'timeout' },
        { server: 'KYOBO127', outcome: 'offline' },
      ],
    });
    setup();
    fireEvent.click(toggle('9876543201', 'KYOBO127'));
    await waitFor(() => expect(pill('9876543201', 'KYOBO127').querySelector('[data-slot="reflect-chip"]')).not.toBeNull());
    const t = pill('9876543201', 'KYOBO119').querySelector('[data-slot="reflect-chip"]') as HTMLElement;
    const o = pill('9876543201', 'KYOBO127').querySelector('[data-slot="reflect-chip"]') as HTMLElement;
    expect([t.textContent, t.getAttribute('data-tone')]).toEqual(['응답 없음', 'err']);
    expect([o.textContent, o.getAttribute('data-tone')]).toEqual(['서버 연결 안 됨', 'warn']);
  });

  it('(29-34 WR-04) skipped + 사유 → warn 칩 「미반영」 title = 사유 · 계좌 영역 아래 「KB121 미반영: <사유>」 한 줄 · 사유 없는 skipped 는 줄 없음', async () => {
    putDmaAccountMock.mockResolvedValue({
      results: [
        { server: 'KB120', outcome: 'skipped' },
        { server: 'KB121', outcome: 'skipped', message: SKIPPED_REASON },
      ],
    });
    setup();
    fireEvent.click(toggle('12345678901', 'KB121'));
    const chip = await waitFor(() => {
      const c = pill('12345678901', 'KB121').querySelector('[data-slot="reflect-chip"]') as HTMLElement;
      if (!c) throw new Error('no chip');
      return c;
    });
    expect(chip).toHaveTextContent('미반영');
    expect(chip).toHaveAttribute('data-tone', 'warn');
    expect(chip).toHaveAttribute('title', SKIPPED_REASON);
    const lines = [...document.querySelectorAll('[data-slot="admin-busy-line"]')];
    expect(lines.map((l) => l.textContent)).toEqual([`KB121 미반영: ${SKIPPED_REASON}`]);
    expect(lines[0]).toHaveAttribute('data-tone', 'warn');
    // 사유 없는 skipped — 종전(칩만 · title 없음)
    const plain = pill('12345678901', 'KB120').querySelector('[data-slot="reflect-chip"]') as HTMLElement;
    expect(plain).toHaveAttribute('data-tone', 'warn');
    expect(plain).not.toHaveAttribute('title');
  });

  it('PUT 실패(502) → 토글이 원래 값으로 · 계좌 안 한 줄', async () => {
    putDmaAccountMock.mockRejectedValue(new ApiClientError({ code: 'RELAY_FAILED', message: 'relay 에 닿지 못했어요', status: 502 }));
    const { onChanged } = setup();
    fireEvent.click(toggle('12345678901', 'KB121'));
    const alert = await within(acctRow('12345678901')).findByRole('alert');
    expect(alert).toHaveTextContent('relay 에 닿지 못했어요');
    expect(toggle('12345678901', 'KB121')).toHaveAttribute('aria-checked', 'false');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('켜진 서버가 1대면 그 토글은 끌 수 없다 — 비활성 + 「계좌는 서버 1대 이상」', () => {
    setup();
    expect(toggle('12345678901', 'KB120')).toBeDisabled();
    expect(toggle('12345678901', 'KB121')).not.toBeDisabled();
    expect(pill('12345678901', 'KB120')).toHaveAttribute('title', '계좌는 서버 1대 이상');
    expect(pill('12345678901', 'KB121')).not.toHaveAttribute('title');
    expect(document.querySelector('[data-slot="admin-accounts-note"]')).toHaveTextContent('계좌는 서버 1대 이상');
    fireEvent.click(toggle('12345678901', 'KB120'));
    expect(putDmaAccountMock).not.toHaveBeenCalled();
  });
});

describe('AccountEditor — 연결 해제(종전 「제거」 · 동작 = DELETE 그대로)', () => {
  it('계좌 2개 이상 → 확인 없이 DELETE 1건 · 결과 칩', async () => {
    removeDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    const { onChanged, onRemoveLast } = setup();
    fireEvent.click(within(acctRow('12345678901')).getByRole('button', { name: /연결 해제/ }));
    expect(removeDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(removeDmaAccountMock).toHaveBeenCalledWith('kimtr', 'KB', '12345678901');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onRemoveLast).not.toHaveBeenCalled();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('마지막 계좌 → DELETE 를 보내지 않고 사용자 삭제로(onRemoveLast) — 87 전용 줄은 세지 않는다', () => {
    const { onRemoveLast } = setup([KB_ACCT, ONLY_ACCT]);
    fireEvent.click(within(acctRow('12345678901')).getByRole('button', { name: /연결 해제/ }));
    expect(removeDmaAccountMock).not.toHaveBeenCalled();
    expect(onRemoveLast).toHaveBeenCalledTimes(1);
  });
});

describe('AccountEditor — 「+ 계좌 연결」(quick 261106-lwu D-09 · 피커 A)', () => {
  const form = () => document.querySelector('[data-slot="admin-account-link"]') as HTMLElement;
  const options = () =>
    Array.from(form().querySelectorAll<HTMLElement>('[data-slot="account-picker-option"]')).map((o) => o.dataset.key);
  const pick = (name: string) => fireEvent.click(within(form()).getByRole('radio', { name }));
  const linkBtn = () => within(form()).getByRole('button', { name: '연결' });

  it('「+ 계좌 연결」 → 피커(검색칸 · 이 사용자 의도에 이미 있는 계좌는 빠짐 · 쓰는 사용자/연결 없음) · 「계좌」 링크 · 계좌를 고르기 전 서버 체크 없음', () => {
    setup();
    expect(screen.queryByRole('button', { name: '+ 계좌 추가' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 연결' }));
    expect(within(form()).getByRole('searchbox', { name: '계좌번호 · 계좌명 검색' })).toBeInTheDocument();
    // KB_ACCT · KYOBO_ACCT 는 이미 이 사용자 의도 — 후보 = 아직 없는 KB 5120009880 · 교보 777
    expect(options()).toEqual(['KB|5120009880', 'KYOBO|777']);
    const kbOpt = form().querySelector<HTMLElement>('[data-key="KB|5120009880"]')!;
    expect(kbOpt.querySelector('[data-slot="account-picker-who"]')).toHaveTextContent('leetr');
    const kyOpt = form().querySelector<HTMLElement>('[data-key="KYOBO|777"]')!;
    expect(kyOpt).toHaveTextContent('이름 없음');
    expect(kyOpt.querySelector('[data-slot="account-picker-who"]')).toHaveTextContent('연결 없음');
    expect(within(form()).getByRole('link', { name: '「계좌」 에서 등록' })).toHaveAttribute('href', '/admin/accounts');
    expect(within(form()).queryAllByRole('checkbox')).toHaveLength(0);
    expect(linkBtn()).toBeDisabled();
  });

  it('계좌를 고르면 그 증권사 등록 서버만 · 기본 체크 없음 · 꺼진 서버는 보이되 비활성 · 계좌를 바꾸면 체크 초기화', () => {
    const servers: AdminUsersOverview['servers'] = [
      ...SERVERS.slice(0, 3),
      { key: 'KYOBO127', broker: 'KYOBO', enabled: false },
    ];
    render(
      <AccountEditor masterAccounts={MASTER} dmaUserId="kimtr" accounts={[KB_ACCT]} servers={servers} onChanged={vi.fn()} onRemoveLast={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 연결' }));
    pick('KB 5120009880 주식');
    const boxes = () => within(form()).getAllByRole('checkbox');
    expect(boxes().map((c) => c.getAttribute('aria-label'))).toEqual(['KB120', 'KB121']);
    expect(boxes().every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true);
    fireEvent.click(within(form()).getByRole('checkbox', { name: 'KB121' }));
    expect(linkBtn()).toBeEnabled();

    pick('교보 777');
    expect(boxes().map((c) => c.getAttribute('aria-label'))).toEqual(['KYOBO119', 'KYOBO127']);
    expect(within(form()).getByRole('checkbox', { name: 'KYOBO127' })).toBeDisabled();
    expect(boxes().every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(linkBtn()).toBeDisabled();
  });

  it('검색 — 계좌번호 · 계좌명 부분 일치로 좁힌다', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 연결' }));
    const search = within(form()).getByRole('searchbox', { name: '계좌번호 · 계좌명 검색' });
    fireEvent.change(search, { target: { value: '주식' } });
    expect(options()).toEqual(['KB|5120009880']);
    fireEvent.change(search, { target: { value: '777' } });
    expect(options()).toEqual(['KYOBO|777']);
    fireEvent.change(search, { target: { value: '0098' } });
    expect(options()).toEqual(['KB|5120009880']);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(options()).toEqual([]);
  });

  it('연결 → PUT 1건(계좌 값 = 마스터 값 · 다음 priority · 서버 레지스트리 순) → onChanged · 폼 닫힘', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    const { onChanged } = setup();
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 연결' }));
    pick('KB 5120009880 주식');
    fireEvent.click(within(form()).getByRole('checkbox', { name: 'KB121' }));
    fireEvent.click(within(form()).getByRole('checkbox', { name: 'KB120' }));
    fireEvent.click(linkBtn());
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(putDmaAccountMock).toHaveBeenCalledWith('kimtr', {
      account: { broker: 'KB', accountNo: '5120009880', name: '주식', branchNo: '00777', traderId: 'T00777', priority: 3 },
      servers: ['KB120', 'KB121'],
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(form()).toBeNull();
  });

  it('409 ACCOUNT_NOT_REGISTERED → 폼에 서버 message 한 줄 · 폼 유지', async () => {
    putDmaAccountMock.mockRejectedValue(
      new ApiClientError({ code: 'ACCOUNT_NOT_REGISTERED', message: '「계좌」 메뉴에 등록되지 않은 계좌예요 — 먼저 등록하세요.', status: 409 }),
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 연결' }));
    pick('교보 777');
    fireEvent.click(within(form()).getByRole('checkbox', { name: 'KYOBO119' }));
    fireEvent.click(linkBtn());
    await waitFor(() =>
      expect(form().querySelector('[data-slot="admin-account-link-error"]')).toHaveTextContent('등록되지 않은 계좌예요'),
    );
    expect(form()).not.toBeNull();
  });

  it('87 에만 있는 계좌(의도 없음)와 같은 번호의 마스터는 후보에 남는다 · 마스터 목록을 못 읽으면 피커 한 줄', () => {
    const onlyMaster: AdminAccountMaster = { ...FREE_KYOBO, accountNo: ONLY_ACCT.accountNo };
    const r = render(
      <AccountEditor masterAccounts={[onlyMaster]} dmaUserId="kimtr" accounts={[KB_ACCT, ONLY_ACCT]} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 연결' }));
    expect(options()).toEqual([`KYOBO|${ONLY_ACCT.accountNo}`]);
    r.unmount();

    render(
      <AccountEditor masterAccounts={null} dmaUserId="kimtr" accounts={[KB_ACCT]} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 연결' }));
    expect(form().querySelector('[data-slot="account-picker-failed"]')).toHaveTextContent('계좌 목록을 불러오지 못했어요');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 29-38 G-1 ⑦ — 계좌 줄 「주문 서버」 세그먼트(29-30 채택 admin-control A · mockup-g1-account-order-server.html 변형 A)
// ─────────────────────────────────────────────────────────────────────────────

describe('AccountEditor — 계좌 주문 서버(29-38 채택 A)', () => {
  /** KB 계좌 123 — 등록 KB120 · KB121(active) · 기본 KB120 · 지정 없음. */
  const KB2: AdminAccountView = {
    ...KB_ACCT,
    accountNo: '123',
    servers: [
      { serverKey: 'KB120', tone: 'ok', message: null, state: 'active' },
      { serverKey: 'KB121', tone: 'ok', message: null, state: 'active' },
    ],
    orderServer: null,
    defaultOrderServer: 'KB120',
  };
  const SERVERS_KB121_OFF: AdminUsersOverview['servers'] = SERVERS.map((s) =>
    s.key === 'KB121' ? { ...s, enabled: false } : s,
  );

  const seg = (no: string) => acctRow(no).querySelector('[data-slot="admin-order-server"]') as HTMLElement | null;
  const cells = (no: string) => within(seg(no) as HTMLElement).getAllByRole('radio');
  const cell = (no: string, name: string) => within(seg(no) as HTMLElement).getByRole('radio', { name });
  const offLine = (no: string) => acctRow(no).querySelector('[data-slot="admin-order-server-off"]') as HTMLElement | null;

  function mount(accounts: AdminAccountView[], servers: AdminUsersOverview['servers'] = SERVERS) {
    const onChanged = vi.fn();
    const view = (a: AdminAccountView[], s = servers) => (
      <AccountEditor masterAccounts={MASTER} dmaUserId="kimtr" accounts={a} servers={s} onChanged={onChanged} onRemoveLast={vi.fn()} />
    );
    const r = render(view(accounts));
    return { onChanged, rerender: (a: AdminAccountView[], s = servers) => r.rerender(view(a, s)) };
  }

  it('서버 칩 줄 아래 「주문 서버」 세그먼트 — 칸 = 「기본 · KB120」 · KB120 · KB121(이 순서) · 지금 값 = 기본 칸 · 접근 이름 「KB 123 주문 서버」', () => {
    mount([KB2, KYOBO_ACCT]);
    const s = seg('123');
    expect(s).not.toBeNull();
    expect(s).toHaveTextContent('주문 서버');
    expect(within(acctRow('123')).getByRole('group', { name: 'KB 123 주문 서버' })).toBeInTheDocument();
    expect(cells('123').map((c) => c.textContent)).toEqual(['기본 · KB120', 'KB120', 'KB121']);
    expect(cell('123', '기본 · KB120')).toHaveAttribute('aria-checked', 'true');
    expect(cell('123', 'KB120')).toHaveAttribute('aria-checked', 'false');
    expect(cell('123', 'KB121')).toHaveAttribute('aria-checked', 'false');
    // 세그먼트는 서버 칩 줄 아래(DOM 순서)
    const toggles = acctRow('123').querySelector('[data-slot="admin-server-toggle"]') as HTMLElement;
    expect(toggles.compareDocumentPosition(s as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(offLine('123')).toBeNull();
  });

  it('KB121 칸 → PUT 1건(serverKey KB121) · 플래시 · 재조회 KB121 → 그 칸 · 재조회 null(다른 경로로 되돌림) → 기본 칸', async () => {
    setAccountOrderServerMock.mockResolvedValue({ ok: true, orderServer: 'KB121' });
    const { onChanged, rerender } = mount([KB2, KYOBO_ACCT]);
    fireEvent.click(cell('123', 'KB121'));
    expect(setAccountOrderServerMock).toHaveBeenCalledTimes(1);
    expect(setAccountOrderServerMock).toHaveBeenCalledWith('kimtr', 'KB', '123', 'KB121');
    expect(cell('123', 'KB121')).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(seg('123')).toHaveAttribute('data-state', 'flash');

    rerender([{ ...KB2, orderServer: 'KB121' }, KYOBO_ACCT]);
    expect(cell('123', 'KB121')).toHaveAttribute('aria-checked', 'true');
    rerender([{ ...KB2, orderServer: null }, KYOBO_ACCT]);
    expect(cell('123', '기본 · KB120')).toHaveAttribute('aria-checked', 'true');
    expect(cell('123', 'KB121')).toHaveAttribute('aria-checked', 'false');
  });

  it('기본 칸 → { serverKey: null }', async () => {
    setAccountOrderServerMock.mockResolvedValue({ ok: true, orderServer: null });
    mount([{ ...KB2, orderServer: 'KB121' }, KYOBO_ACCT]);
    expect(cell('123', 'KB121')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(cell('123', '기본 · KB120'));
    expect(setAccountOrderServerMock).toHaveBeenCalledWith('kimtr', 'KB', '123', null);
    await act(async () => {});
  });

  it('비행 중 연타 → 1건만 비행 · 응답 뒤 2건째는 마지막 값만(사이 값 KB120 은 가지 않는다)', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    setAccountOrderServerMock
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValue({ ok: true, orderServer: 'KB121' });
    mount([KB2, KYOBO_ACCT]);
    fireEvent.click(cell('123', 'KB121'));
    fireEvent.click(cell('123', 'KB120'));
    fireEvent.click(cell('123', 'KB121'));
    expect(setAccountOrderServerMock).toHaveBeenCalledTimes(1);
    await act(async () => resolveFirst({ ok: true, orderServer: 'KB121' }));
    await waitFor(() => expect(setAccountOrderServerMock).toHaveBeenCalledTimes(2));
    expect(setAccountOrderServerMock.mock.calls.map((c) => c[3])).toEqual(['KB121', 'KB121']);
  });

  it('409 ORDER_SERVER_NOT_REGISTERED → 그 계좌 줄 오류 한 줄(서버 문구) · 값은 재조회(개요) 값으로', async () => {
    setAccountOrderServerMock.mockRejectedValue(
      new ApiClientError({ code: 'ORDER_SERVER_NOT_REGISTERED', message: '그 계좌에 등록된 서버가 아니에요', status: 409 }),
    );
    const { onChanged } = mount([KB2, KYOBO_ACCT]);
    fireEvent.click(cell('123', 'KB121'));
    const alert = await within(acctRow('123')).findByRole('alert');
    expect(alert).toHaveTextContent('그 계좌에 등록된 서버가 아니에요');
    expect(cell('123', 'KB121')).toHaveAttribute('aria-checked', 'false');
    expect(cell('123', '기본 · KB120')).toHaveAttribute('aria-checked', 'true');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('등록 서버가 1대인 계좌 → 세그먼트 없이 글자 「주문 서버 KB120(기본)」 만', () => {
    mount([{ ...KB_ACCT, orderServer: null, defaultOrderServer: 'KB120' }, KYOBO_ACCT]);
    const s = seg('12345678901');
    expect(s).not.toBeNull();
    expect(within(s as HTMLElement).queryAllByRole('radio')).toHaveLength(0);
    expect(s).toHaveTextContent('주문 서버 KB120(기본)');
  });

  it('꺼진 서버 칸 → 취소선 · 누를 수 없음(클릭해도 PUT 0건) · 지정이 없으면 경고 줄 없음', () => {
    mount([KB2, KYOBO_ACCT], SERVERS_KB121_OFF);
    const off = cell('123', 'KB121');
    expect(off).toBeDisabled();
    expect(off).toHaveAttribute('data-off', 'true');
    expect(off.className).toContain('line-through');
    fireEvent.click(off);
    expect(setAccountOrderServerMock).not.toHaveBeenCalled();
    expect(cell('123', 'KB120')).not.toBeDisabled();
    expect(offLine('123')).toBeNull();
  });

  it('꺼진 서버가 지정돼 있으면 그 칸이 켜진 채 경고색 · 계좌 카드에 「KB121 꺼짐 — 기본 KB120 으로」 한 줄', () => {
    mount([{ ...KB2, orderServer: 'KB121' }, KYOBO_ACCT], SERVERS_KB121_OFF);
    const off = cell('123', 'KB121');
    expect(off).toHaveAttribute('aria-checked', 'true');
    expect(off).toHaveAttribute('data-off', 'true');
    expect(off.className).toContain('text-[var(--led-latent)]');
    const line = offLine('123');
    expect(line).not.toBeNull();
    expect(line).toHaveTextContent('KB121 꺼짐 — 기본 KB120 으로');
    expect(line?.className).toContain('text-[var(--led-latent)]');
  });

  it('removing 서버 · 다른 증권사 서버는 칸에 없다 · 87 에만 있는 계좌 줄에는 세그먼트가 없다', () => {
    const withRemoving: AdminAccountView = {
      ...KB2,
      servers: [...KB2.servers, { serverKey: 'KB122', tone: 'warn', message: null, state: 'removing' }],
    };
    mount([withRemoving, KYOBO_ACCT, ONLY_ACCT]);
    expect(cells('123').map((c) => c.textContent)).toEqual(['기본 · KB120', 'KB120', 'KB121']);
    expect(seg('5550001')).toBeNull();
  });

  it('하단 안내 — gh-trade-84 ②(가) 뒤 문장(relay 가 옛 서버 활성 전략을 끈다 · 클라(OCX) 대사) · 답 이전 목업 문장은 없다', () => {
    mount([KB2, KYOBO_ACCT]);
    const note = document.querySelector('[data-slot="admin-accounts-note"]') as HTMLElement;
    expect(note).toHaveTextContent(
      '주문 서버를 바꾸면 relay 가 옛 서버에 남은 그 계좌의 활성 전략(상따 · VI · 자동매도)을 끄고 새 서버로 바로 재접속해요 — 옛 서버의 미체결은 그 서버(클라)에서 정리하고, 옛 서버로 되돌릴 때는 클라(OCX) 대사로 잔고를 맞추세요.',
    );
    expect(note).not.toHaveTextContent('그 서버에서 정리하세요');
    expect(note).toHaveTextContent('계좌는 서버 1대 이상');
  });

  // ── 29-55 GC-06 — relay 와 같은 shared 규칙(resolveEffectiveOrderServer · 29-46)으로 진짜 소유 서버를 그린다 ──
  const SERVERS_WITH_KB122: AdminUsersOverview['servers'] = [
    ...SERVERS.slice(0, 2),
    { key: 'KB122', broker: 'KB', enabled: true },
    ...SERVERS.slice(2),
  ];
  /** KB 계좌 777 — 등록 KB121 · KB122(active) · 기본 KB120 에는 미등록 · 지정 없음. */
  const KB_NO_DEFAULT: AdminAccountView = {
    ...KB_ACCT,
    accountNo: '777',
    servers: [
      { serverKey: 'KB121', tone: 'ok', message: null, state: 'active' },
      { serverKey: 'KB122', tone: 'ok', message: null, state: 'active' },
    ],
    orderServer: null,
    defaultOrderServer: 'KB120',
  };
  const noDefaultLine = (no: string) =>
    acctRow(no).querySelector('[data-slot="admin-order-server-no-default"]') as HTMLElement | null;

  it('GC-06: 등록 서버 1대가 기본 서버가 아니면(KB121 · 기본 KB120 미등록 · 지정 없음) → 「주문 서버 KB121」 · 「(기본)」 없음 · 경고 줄 없음', () => {
    mount([{ ...KB_ACCT, servers: [{ serverKey: 'KB121', tone: 'ok', message: null, state: 'active' }], orderServer: null, defaultOrderServer: 'KB120' }, KYOBO_ACCT]);
    const s = seg('12345678901');
    expect(s).not.toBeNull();
    expect(within(s as HTMLElement).queryAllByRole('radio')).toHaveLength(0);
    expect(s).toHaveTextContent('주문 서버 KB121');
    expect(s).not.toHaveTextContent('(기본)');
    expect(noDefaultLine('12345678901')).toBeNull();
  });

  it('GC-06: 등록 2대 [KB121, KB122] · 기본 KB120 미등록 · 지정 없음 → 「기본 · KB120」 칸 잠금(클릭해도 PUT 0) · 경고 한 줄 · KB121 고르면 PUT 1건 → 경고 사라짐', async () => {
    setAccountOrderServerMock.mockResolvedValue({ ok: true, orderServer: 'KB121' });
    mount([KB_NO_DEFAULT, KYOBO_ACCT], SERVERS_WITH_KB122);
    expect(cells('777').map((c) => c.textContent)).toEqual(['기본 · KB120', 'KB121', 'KB122']);
    const def = cell('777', '기본 · KB120');
    expect(def).toBeDisabled();
    expect(def).toHaveAttribute('data-off', 'true');
    fireEvent.click(def);
    expect(setAccountOrderServerMock).not.toHaveBeenCalled();
    expect(cell('777', 'KB121')).not.toBeDisabled();
    expect(cell('777', 'KB122')).not.toBeDisabled();
    const line = noDefaultLine('777');
    expect(line).not.toBeNull();
    expect(line).toHaveTextContent('기본 KB120 에 등록되지 않은 계좌 — 주문 서버를 고르세요');
    expect(acctRow('777').querySelectorAll('[data-slot="admin-order-server-no-default"]')).toHaveLength(1);

    fireEvent.click(cell('777', 'KB121'));
    expect(setAccountOrderServerMock).toHaveBeenCalledTimes(1);
    expect(setAccountOrderServerMock).toHaveBeenCalledWith('kimtr', 'KB', '777', 'KB121');
    expect(noDefaultLine('777')).toBeNull();
    await act(async () => {});
  });

  it('GC-06: 기본 미등록이어도 지정(KB122)이 있으면 경고 줄 없음 · 「기본」 칸은 잠긴 채', () => {
    mount([{ ...KB_NO_DEFAULT, orderServer: 'KB122' }, KYOBO_ACCT], SERVERS_WITH_KB122);
    expect(cell('777', 'KB122')).toHaveAttribute('aria-checked', 'true');
    expect(cell('777', '기본 · KB120')).toBeDisabled();
    expect(noDefaultLine('777')).toBeNull();
  });

  it('GC-06 운영 보존: 기본 서버에 등록된 계좌(KB120 · KB121) → 「기본」 칸 잠기지 않음 · 경고 줄 없음', () => {
    mount([KB2, KYOBO_ACCT]);
    expect(cell('123', '기본 · KB120')).not.toBeDisabled();
    expect(cell('123', '기본 · KB120')).not.toHaveAttribute('data-off');
    expect(noDefaultLine('123')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 30 (30-04) — KB 주문자 IP/MAC 읽기 줄 · 불일치 · 「이름 없음」(quick 261106-ntl N-03 — 카드 편집 모드 없음)
// ─────────────────────────────────────────────────────────────────────────────

/** KB 계좌 12345678901 — 등록 KB120 · KB121(active) · 기본 KB120 · 지정 없음 · 87 값은 테스트마다. */
const KB_TWO: AdminAccountView = {
  ...KB_ACCT,
  servers: [
    { serverKey: 'KB120', tone: 'ok', message: null, state: 'active' },
    { serverKey: 'KB121', tone: 'ok', message: null, state: 'active' },
  ],
  orderServer: null,
  defaultOrderServer: 'KB120',
};
const EP_A = { orderIp: '010041001124', orderMac: '1CFD087D978E' };
const EP_B = { orderIp: '010041001125', orderMac: '1CFD087D978F' };
const EP_UNSET = { orderIp: '', orderMac: '' };
const withEp = (a: AdminAccountView, orderEndpoints: AdminAccountView['orderEndpoints']): AdminAccountView => ({
  ...a,
  orderEndpoints,
});

const ipmacLine = (no: string) => acctRow(no).querySelector('[data-slot="admin-account-ipmac"]') as HTMLElement | null;
const mismatchLines = (no: string) => [...acctRow(no).querySelectorAll('[data-slot="admin-account-ipmac-mismatch"]')];

describe('P30 읽기 카드 — IP/MAC 줄 · 불일치 · 이름 없음 (D-09 · D-10)', () => {
  it('설정됨 → 「주문자 IP 10.41.1.124 · MAC 1C:FD:08:7D:97:8E」 · 값 2개는 font-semibold · 87 값의 표시 표기(D-17)', () => {
    setup([withEp(KB_TWO, { KB120: EP_A, KB121: EP_A }), KYOBO_ACCT]);
    const line = ipmacLine('12345678901');
    expect(line).not.toBeNull();
    expect(line).toHaveTextContent('주문자 IP 10.41.1.124 · MAC 1C:FD:08:7D:97:8E · 설정은 「계좌」 메뉴에서');
    expect(line?.className).toContain('tabular-nums');
    expect(line?.className).toContain('text-[12px]');
    const values = [...(line as HTMLElement).querySelectorAll('b')];
    expect(values.map((b) => b.textContent)).toEqual(['10.41.1.124', '1C:FD:08:7D:97:8E']);
    for (const b of values) expect(b.className).toContain('font-semibold');
    // 지점 · 트레이더 줄 바로 아래
    const branch = acctRow('12345678901').querySelector('[data-slot="admin-account-branch"]') as HTMLElement;
    expect(branch.nextElementSibling).toBe(line);
    expect(mismatchLines('12345678901')).toHaveLength(0);
  });

  it('(D-17) 87 값이 정규화 형식 밖이면 원문 그대로 — IP 999999999999(옥텟 > 255) · MAC 은 콜론 표기', () => {
    setup([withEp(KB_ACCT, { KB120: { orderIp: '999999999999', orderMac: '1CFD087D978E' } }), KYOBO_ACCT]);
    const line = ipmacLine('12345678901') as HTMLElement;
    expect(line).toHaveTextContent('주문자 IP 999999999999 · MAC 1C:FD:08:7D:97:8E');
    expect([...line.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['999999999999', '1C:FD:08:7D:97:8E']);
  });

  it('미설정 → 「주문자 IP · MAC 미설정(서버 NIC 값)」 · 「미설정(서버 NIC 값)」 만 --faint', () => {
    setup([withEp(KB_TWO, { KB120: EP_UNSET, KB121: EP_UNSET }), KYOBO_ACCT]);
    const line = ipmacLine('12345678901') as HTMLElement;
    expect(line).toHaveTextContent('주문자 IP · MAC 미설정(서버 NIC 값) · 설정은 「계좌」 메뉴에서');
    const faint = line.querySelector('.text-\\[var\\(--faint\\)\\]') as HTMLElement;
    expect(faint).toHaveTextContent('미설정(서버 NIC 값)');
    expect(line.querySelectorAll('b')).toHaveLength(0);
  });

  it('87 미확인(orderEndpoints 없음 · 전부 null) → 「확인 전」(--faint) — 「미설정」 이 아니다', () => {
    setup([KB_TWO, KYOBO_ACCT]);
    expect(ipmacLine('12345678901')).toHaveTextContent('주문자 IP · MAC 확인 전 · 설정은 「계좌」 메뉴에서');
    expect(ipmacLine('12345678901')).not.toHaveTextContent('미설정');
  });

  it('{ KB120: null } 만 있어도 「확인 전」 · 교보 계좌에는 IP/MAC 줄이 없다', () => {
    setup([withEp(KB_ACCT, { KB120: null }), withEp(KYOBO_ACCT, { KYOBO119: EP_A })]);
    const line = ipmacLine('12345678901') as HTMLElement;
    expect(line).toHaveTextContent('주문자 IP · MAC 확인 전');
    expect((line.querySelector('.text-\\[var\\(--faint\\)\\]') as HTMLElement).textContent).toBe('확인 전');
    expect(ipmacLine('9876543201')).toBeNull();
  });

  it('불일치 — KB121 다른 값 → 경고 1줄(값) · KB121 미설정 → 「(미설정)」 · 같은 값 · KB121 null → 0줄', () => {
    const { unmount } = render(
      <AccountEditor masterAccounts={MASTER} dmaUserId="kimtr" accounts={[withEp(KB_TWO, { KB120: EP_A, KB121: EP_B })]} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />,
    );
    // 출처 = 유효 주문 서버(기본 KB120) — 읽기 줄은 KB120 값(표시 표기 · D-17)
    expect(ipmacLine('12345678901')).toHaveTextContent('주문자 IP 10.41.1.124 · MAC 1C:FD:08:7D:97:8E');
    let lines = mismatchLines('12345678901');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute('data-server', 'KB121');
    expect(lines[0]).toHaveTextContent(
      'KB121 값이 달라요(IP 10.41.1.125 · MAC 1C:FD:08:7D:97:8F) — 「계좌」 메뉴에서 저장하면 모두 같아져요',
    );
    expect(lines[0].className).toContain('text-[var(--led-latent)]');
    expect(lines[0].className).toContain('break-keep');
    unmount();

    const r2 = render(
      <AccountEditor masterAccounts={MASTER} dmaUserId="kimtr" accounts={[withEp(KB_TWO, { KB120: EP_A, KB121: EP_UNSET })]} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />,
    );
    lines = mismatchLines('12345678901');
    expect(lines.map((l) => l.textContent)).toEqual(['KB121 값이 달라요(미설정) — 「계좌」 메뉴에서 저장하면 모두 같아져요']);
    r2.unmount();

    const r3 = render(
      <AccountEditor masterAccounts={MASTER} dmaUserId="kimtr" accounts={[withEp(KB_TWO, { KB120: EP_A, KB121: EP_A })]} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />,
    );
    expect(mismatchLines('12345678901')).toHaveLength(0);
    r3.unmount();

    render(
      <AccountEditor masterAccounts={MASTER} dmaUserId="kimtr" accounts={[withEp(KB_TWO, { KB120: EP_A, KB121: null })]} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />,
    );
    expect(mismatchLines('12345678901')).toHaveLength(0);
  });

  it('계좌명 "" → 제목줄 계좌명 자리에 --faint 「이름 없음」 · 87 전용 줄(이름 "")에는 없다', () => {
    setup([{ ...KB_ACCT, name: '' }, KYOBO_ACCT, ONLY_ACCT]);
    const kb = acctRow('12345678901');
    const noName = within(kb).getByText('이름 없음');
    expect(noName.className).toContain('text-[var(--faint)]');
    expect(noName.className).toContain('truncate');
    expect(acctRow('5550001')).not.toHaveTextContent('이름 없음');
    expect(acctRow('9876543201')).not.toHaveTextContent('이름 없음');
  });

  it('메타 줄 끝 「계좌명 · 지점 · 트레이더는 「계좌」 메뉴에서」(KB · 교보 카드) · 87 전용 줄에는 없다', () => {
    setup([withEp(KB_ACCT, { KB120: EP_A }), KYOBO_ACCT, ONLY_ACCT]);
    expect(acctRow('12345678901').querySelector('[data-slot="admin-account-branch"]')).toHaveTextContent(
      '지점 00123 · 트레이더 000789 · 계좌명 · 지점 · 트레이더는 「계좌」 메뉴에서',
    );
    expect(acctRow('9876543201').querySelector('[data-slot="admin-account-master-hint"]')).not.toBeNull();
    expect(acctRow('5550001').querySelector('[data-slot="admin-account-master-hint"]')).toBeNull();
  });

  it('(quick 261106-ntl N-03) 교보 · KB 카드에 「편집」 이 없다 · 편집 폼이 열리지 않는다 · 「연결 해제」 는 그대로', () => {
    setup([withEp(KB_TWO, { KB120: EP_A, KB121: EP_B }), KYOBO_ACCT, ONLY_ACCT]);
    expect(screen.queryByRole('button', { name: /편집/ })).toBeNull();
    expect(document.querySelector('[data-slot="admin-account-edit"]')).toBeNull();
    expect(document.querySelector('[data-editing]')).toBeNull();
    expect(screen.getByRole('button', { name: 'KB 12345678901 연결 해제' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'KYOBO 9876543201 연결 해제' })).toBeInTheDocument();
  });
});



// ─────────────────────────────────────────────────────────────────────────────
// Phase 36 — 예수금 · 수수료 · 매도세 행 (36-UI-SPEC ① · D-01 ~ D-07)
// ─────────────────────────────────────────────────────────────────────────────

type Cost = NonNullable<NonNullable<AdminAccountView['costs']>[string]>;
const cost = (budgetKrw: number, feePpm = 100, sellTaxPpm = 2000, budgetSource: Cost['budgetSource'] = 'live'): Cost => ({
  budgetKrw,
  feePpm,
  sellTaxPpm,
  budgetSource,
});
// KB_TWO(KB120 · KB121 active · 기본 KB120)는 위 P30 픽스처를 그대로 쓴다.
const withCosts = (a: AdminAccountView, costs: AdminAccountView['costs']): AdminAccountView => ({ ...a, costs });

const costRow = (no: string) => acctRow(no).querySelector('[data-slot="admin-account-cost"]') as HTMLElement | null;
const budgetInput = (no = '12345678901', broker = 'KB') =>
  within(acctRow(no)).getByRole('textbox', { name: `${broker} ${no} 예수금(원)` }) as HTMLInputElement;
const costChips = (no = '12345678901') =>
  Array.from(costRow(no)!.querySelectorAll('[data-slot="admin-account-cost-chips"] [data-slot="reflect-chip"]')) as HTMLElement[];
const chipTexts = (no = '12345678901') => costChips(no).map((c) => c.textContent);
const caption = (no = '12345678901') =>
  costRow(no)!.querySelector('[data-slot="admin-account-cost-caption"]') as HTMLElement;
const enter = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });

/**
 * `AccountCostFields` 단일 사용자 하네스(quick 261106-ntl) — 계좌마다 `admin-account` 틀 안에 세 칸을 그린다. 라벨 = 서버 키 ·
 * summary = shared `summarizeAccountCosts`(그 증권사 레지스트리) · slots = active 서버 레지스트리 순 · 저장 = 기존 mock 모양
 * ('kimtr', broker, no, …). 계좌 수정 시트의 사용자·서버 팬아웃 배선은 account-master-sheet 테스트가 잠근다.
 */
function CostHarness({
  account,
  onChanged,
  disabled = false,
}: {
  account: AdminAccountView;
  onChanged: () => void;
  disabled?: boolean;
}) {
  const registry = SERVERS.filter((s) => s.broker === account.broker);
  const activeKeys = account.servers.filter((s) => s.state === 'active').map((s) => s.serverKey);
  const slots = registry
    .map((s) => s.key)
    .filter((k) => activeKeys.includes(k))
    .map((k) => ({ label: k, known: account.costs?.[k] != null }));
  return (
    <div data-slot="admin-account" data-account={account.accountNo}>
      <AccountCostFields
        broker={account.broker}
        accountNo={account.accountNo}
        summary={summarizeAccountCosts({ account, registry })}
        slots={slots}
        saveBudget={(krw) => setAccountBudgetMock('kimtr', account.broker, account.accountNo, krw)}
        saveFee={(v) => setAccountFeeMock('kimtr', account.broker, account.accountNo, v.feePpm, v.sellTaxPpm)}
        releaseOn={account}
        disabled={disabled}
        onChanged={onChanged}
      />
    </div>
  );
}

function mountCost(accounts: AdminAccountView[], opts: { disabled?: boolean } = {}) {
  const onChanged = vi.fn();
  const view = (a: AdminAccountView[]) => (
    <>
      {a
        .filter((x) => x.servers.length > 0)
        .map((x) => (
          <CostHarness key={x.accountNo} account={x} onChanged={onChanged} disabled={opts.disabled} />
        ))}
    </>
  );
  const r = render(view(accounts));
  return { onChanged, rerender: (a: AdminAccountView[]) => r.rerender(view(a)) };
}

describe('P36 예수금 칸', () => {
  it('costs 1억(KB120 · live) → 칸 「100,000,000」 · 단위 「원」 · 라벨 htmlFor · 캡션 문구(미설정 꼬리 없음) · 쉬는 칩 KB120 ok', () => {
    mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000) }), KYOBO_ACCT]);
    const input = budgetInput();
    expect(input).toHaveValue('100,000,000');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('placeholder', '—');
    const label = costRow('12345678901')!.querySelector(`label[for="${input.id}"]`);
    expect(label).toHaveTextContent('예수금');
    expect(costRow('12345678901')).toHaveTextContent('원');
    expect(costRow('12345678901')).not.toHaveTextContent('만원');
    expect(caption()).toHaveTextContent('예수금은 체결 손익·수수료·세금만큼 서버가 스스로 조정해요 · 0 = 해제');
    expect(caption()).not.toHaveTextContent('비우면 미설정');
    expect(chipTexts()).toEqual(['KB120']);
    expect(costChips()[0]).toHaveAttribute('data-tone', 'ok');
  });

  it('「15,000,000」 입력 + Enter → setAccountBudget(kimtr, KB, 계좌, 15,000,000) 1회 → results ok 2 → 칩 「KB120」 「KB121」 · onChanged', async () => {
    setAccountBudgetMock.mockResolvedValue({
      results: [
        { server: 'KB120', outcome: 'ok' },
        { server: 'KB121', outcome: 'ok', message: '변경 없음' },
      ],
    });
    const { onChanged } = mountCost([withCosts(KB_TWO, { KB120: cost(100_000_000), KB121: cost(100_000_000) })]);
    const input = budgetInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '15000000' } });
    expect(input).toHaveValue('15,000,000');
    enter(input);
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(1);
    expect(setAccountBudgetMock).toHaveBeenCalledWith('kimtr', 'KB', '12345678901', 15_000_000);
    await waitFor(() => expect(chipTexts()).toEqual(['KB120', 'KB121']));
    // code 0 은 message 가 「변경 없음」 이어도 ok 칩(D-06 — 문장 대조 없음)
    expect(costChips().map((c) => c.getAttribute('data-tone'))).toEqual(['ok', 'ok']);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('15,000,000');
  });

  it('값 0 → 빈 칸 · 입력 안내 글자 「—」 · 캡션 끝 「 · 비우면 미설정」', () => {
    mountCost([withCosts(KB_ACCT, { KB120: cost(0) })]);
    expect(budgetInput()).toHaveValue('');
    expect(budgetInput()).toHaveAttribute('placeholder', '—');
    expect(caption()).toHaveTextContent('예수금은 체결 손익·수수료·세금만큼 서버가 스스로 조정해요 · 0 = 해제 · 비우면 미설정');
  });

  it('입력은 숫자만 · 최대 13자리(9,999,999,999,999원)', () => {
    mountCost([withCosts(KB_ACCT, { KB120: cost(0) })]);
    fireEvent.change(budgetInput(), { target: { value: '12a3456789012345' } });
    expect(budgetInput()).toHaveValue('1,234,567,890,123');
  });

  it('교보 계좌도 같은 세 칸(라벨 「KYOBO 9876543201 예수금(원)」)', () => {
    mountCost([withCosts(KYOBO_ACCT, { KYOBO119: cost(700_000_000) })]);
    expect(budgetInput('9876543201', 'KYOBO')).toHaveValue('700,000,000');
    expect(caption('9876543201')).toHaveTextContent('예수금은 체결 손익·수수료·세금만큼 서버가 스스로 조정해요');
  });

  it('(quick 261106-ntl) disabled(연결 0명) → 세 칸 disabled · 값 "" · 「—」 · 칩 · 캡션 · 줄 없음 · 입력 · Enter 해도 저장 0', () => {
    mountCost([withCosts(KB_TWO, { KB120: cost(100_000_000), KB121: cost(50_000_000) })], { disabled: true });
    const row = costRow('12345678901')!;
    expect(row).toHaveAttribute('data-disabled', 'true');
    const inputs = within(row).getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs).toHaveLength(3);
    for (const el of inputs) {
      expect(el).toBeDisabled();
      expect(el).toHaveValue('');
      expect(el).toHaveAttribute('placeholder', '—');
      fireEvent.focus(el);
      fireEvent.change(el, { target: { value: '1' } });
      enter(el);
      fireEvent.blur(el);
    }
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    expect(setAccountFeeMock).not.toHaveBeenCalled();
    expect(row.querySelector('[data-slot="admin-account-cost-chips"]')).toBeNull();
    expect(row.querySelector('[data-slot="admin-account-cost-caption"]')).toBeNull();
    expect(row.querySelector('[data-slot="admin-account-cost-mismatch"]')).toBeNull();
  });
});

const costRead = (no: string) => acctRow(no).querySelector('[data-slot="admin-account-cost-read"]') as HTMLElement | null;

describe('P36 카드 읽기 줄 (quick 261106-ntl N-03 · 목업 ④)', () => {
  const READ_HINT = '설정은 「계좌」 메뉴에서';

  it('costs 1억 · 100ppm · 2000ppm → 「예수금 100,000,000원 · 수수료 0.01% · 매도세 0.2% · 설정은 「계좌」 메뉴에서」 · 값 font-semibold · 입력칸 없음', () => {
    setup([withCosts(withEp(KB_TWO, { KB120: EP_A, KB121: EP_A }), { KB120: cost(100_000_000), KB121: cost(100_000_000) }), KYOBO_ACCT]);
    const line = costRead('12345678901')!;
    expect(line.textContent).toBe(`예수금 100,000,000원 · 수수료 0.01% · 매도세 0.2% · ${READ_HINT}`);
    expect([...line.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['100,000,000원', '0.01%', '0.2%']);
    for (const b of line.querySelectorAll('b')) expect(b.className).toContain('font-semibold');
    expect(within(acctRow('12345678901')).queryAllByRole('textbox')).toHaveLength(0);
    expect(acctRow('12345678901').querySelector('[data-slot="admin-account-cost"]')).toBeNull();
  });

  it('예수금 0 → 「예수금 미설정 · …」(--faint) · 87 모름 → 「예수금 · 수수료 · 매도세 확인 전 · 설정은 「계좌」 메뉴에서」', () => {
    setup([withCosts(KB_ACCT, { KB120: cost(0) }), KYOBO_ACCT]);
    const line = costRead('12345678901')!;
    expect(line.textContent).toBe(`예수금 미설정 · 수수료 0.01% · 매도세 0.2% · ${READ_HINT}`);
    expect((line.querySelector('.text-\\[var\\(--faint\\)\\]') as HTMLElement).textContent).toBe('미설정');
    expect(costRead('9876543201')!.textContent).toBe(`예수금 · 수수료 · 매도세 확인 전 · ${READ_HINT}`);
  });

  it('자리: IP/MAC 줄 다음 · 서버 알약 줄 앞 · 87 전용 흐린 줄에는 없음 · 교보 카드에도 있음', () => {
    setup([withCosts(KB_ACCT, { KB120: cost(100_000_000) }), withCosts(KYOBO_ACCT, { KYOBO119: cost(1) }), ONLY_ACCT]);
    const line = costRead('12345678901')!;
    const ipmac = acctRow('12345678901').querySelector('[data-slot="admin-account-ipmac"]') as HTMLElement;
    expect(ipmac.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(pill('12345678901', 'KB120')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(costRead('5550001')).toBeNull();
    expect(acctRow('5550001')).not.toHaveTextContent('예수금');
    expect(costRead('9876543201')!.textContent).toBe(`예수금 1원 · 수수료 0.01% · 매도세 0.2% · ${READ_HINT}`);
  });

  it('서버 간 다름 → 「KB121 은 50,000,000원 — 「계좌」 메뉴에서 저장하면 모두 같아져요」 · 비용률 쌍은 따로 한 줄 · role 없음', () => {
    setup([withCosts(KB_TWO, { KB120: cost(100_000_000, 100, 2000), KB121: cost(50_000_000, 500, 2000) })]);
    const ms = Array.from(acctRow('12345678901').querySelectorAll('[data-slot="admin-account-cost-mismatch"]')) as HTMLElement[];
    expect(ms.map((m) => m.textContent)).toEqual([
      'KB121 은 50,000,000원 — 「계좌」 메뉴에서 저장하면 모두 같아져요',
      'KB121 은 0.05% · 0.2% — 「계좌」 메뉴에서 저장하면 모두 같아져요',
    ]);
    ms.forEach((m) => expect(m).not.toHaveAttribute('role'));
  });
});

describe('P36 비용률 · 상태 6종', () => {
  const NO = '12345678901';
  const feeInput = (no = NO, broker = 'KB') =>
    within(acctRow(no)).getByRole('textbox', { name: `${broker} ${no} 수수료(%)` }) as HTMLInputElement;
  const taxInput = (no = NO, broker = 'KB') =>
    within(acctRow(no)).getByRole('textbox', { name: `${broker} ${no} 매도세(%)` }) as HTMLInputElement;
  const lines = (no = NO) =>
    Array.from(costRow(no)!.querySelectorAll('[data-slot="admin-account-cost-line"]')) as HTMLElement[];
  const lineTexts = (no = NO) => lines(no).map((l) => l.textContent);
  const RANGE = '수수료 · 매도세는 0~1%, 소수 넷째 자리까지예요';
  const SAME = { KB120: cost(100_000_000, 100, 2000), KB121: cost(100_000_000, 100, 2000) };
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };

  it('표시 — 수수료 「0.01」 · 매도세 「0.2」(ppm → % 끝 0 없음) · inputMode decimal · 입력 안내 글자 「0」 · 값 0 → 빈 칸', () => {
    mountCost([withCosts(KB_TWO, SAME), withCosts(KYOBO_ACCT, { KYOBO119: cost(0, 0, 0) })]);
    expect(feeInput()).toHaveValue('0.01');
    expect(taxInput()).toHaveValue('0.2');
    expect(feeInput()).toHaveAttribute('inputmode', 'decimal');
    expect(feeInput()).toHaveAttribute('placeholder', '0');
    expect(feeInput('9876543201', 'KYOBO')).toHaveValue('');
    expect(taxInput('9876543201', 'KYOBO')).toHaveValue('');
    expect(costRow(NO)).toHaveTextContent('%');
  });

  it('(behavior 1) 「1.5」 Enter → 칸 aria-invalid + 범위 줄 · setAccountFee 0회 · 입력값 유지 · 「0.05」 로 고치면 줄 사라짐', () => {
    mountCost([withCosts(KB_TWO, SAME)]);
    fireEvent.focus(feeInput());
    fireEvent.change(feeInput(), { target: { value: '1.5' } });
    enter(feeInput());
    expect(setAccountFeeMock).not.toHaveBeenCalled();
    expect(feeInput()).toHaveAttribute('aria-invalid', 'true');
    expect(feeInput()).toHaveValue('1.5');
    expect(costRow(NO)).toHaveTextContent(RANGE);
    expect(taxInput()).not.toHaveAttribute('aria-invalid');
    fireEvent.change(feeInput(), { target: { value: '0.05' } });
    expect(feeInput()).not.toHaveAttribute('aria-invalid');
    expect(costRow(NO)).not.toHaveTextContent(RANGE);
  });

  it('(behavior 1) 소수 다섯째 자리 · 숫자 아님 · 포커스 이탈도 보내지 않는다', () => {
    mountCost([withCosts(KB_TWO, SAME)]);
    fireEvent.focus(taxInput());
    fireEvent.change(taxInput(), { target: { value: '0.00001' } });
    fireEvent.blur(taxInput());
    expect(setAccountFeeMock).not.toHaveBeenCalled();
    expect(taxInput()).toHaveAttribute('aria-invalid', 'true');
    fireEvent.focus(feeInput());
    fireEvent.change(feeInput(), { target: { value: 'abc' } });
    enter(feeInput());
    expect(setAccountFeeMock).not.toHaveBeenCalled();
    expect(feeInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('(behavior 2) 수수료 「0.05」 Enter → setAccountFee(…, 500, 2000) — 매도세 현재값을 함께 · 매도세만 고쳐도 두 값 함께', async () => {
    setAccountFeeMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    mountCost([withCosts(KB_TWO, SAME)]);
    fireEvent.focus(feeInput());
    fireEvent.change(feeInput(), { target: { value: '0.05' } });
    enter(feeInput());
    expect(setAccountFeeMock).toHaveBeenCalledTimes(1);
    expect(setAccountFeeMock).toHaveBeenCalledWith('kimtr', 'KB', NO, 500, 2000);
    await waitFor(() => expect(chipTexts()).toEqual(['KB120', 'KB121']));

    fireEvent.focus(taxInput());
    fireEvent.change(taxInput(), { target: { value: '0.18' } });
    enter(taxInput());
    expect(setAccountFeeMock).toHaveBeenCalledTimes(2);
    expect(setAccountFeeMock).toHaveBeenLastCalledWith('kimtr', 'KB', NO, 500, 1800);
    await act(async () => {});
  });

  it('(behavior 3) 표시값과 같은 값 Enter + 불일치 없음 → 요청 0 · NOTE 「변경 없음」 · 칩 「<키> · 변경 없음」 · 다시 고치면 지움', () => {
    mountCost([withCosts(KB_TWO, SAME)]);
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '100000000' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    const note = costRow(NO)!.querySelector('[data-slot="admin-account-cost-unchanged"]');
    expect(note).toHaveTextContent('변경 없음');
    expect(chipTexts()).toEqual(['KB120 · 변경 없음', 'KB121 · 변경 없음']);
    expect(costChips().map((c) => c.getAttribute('data-tone'))).toEqual(['only', 'only']);
    fireEvent.change(budgetInput(), { target: { value: '10000000' } });
    expect(costRow(NO)!.querySelector('[data-slot="admin-account-cost-unchanged"]')).toBeNull();

    // 비용률도 같은 규칙 — 값을 안 고치고 Enter 만
    fireEvent.focus(feeInput());
    enter(feeInput());
    expect(setAccountFeeMock).not.toHaveBeenCalled();
    expect(costRow(NO)!.querySelector('[data-slot="admin-account-cost-unchanged"]')).toHaveTextContent('변경 없음');
  });

  it('(WR-01 R2) 불일치여도 안 고친 칸 Enter 는 요청 0 · 「변경 없음」(시트를 연 시점 값으로 서버 조정분을 되감지 않는다)', () => {
    mountCost([withCosts(KB_TWO, { KB120: cost(100_000_000, 100, 2000), KB121: cost(50_000_000, 500, 2000) })]);
    fireEvent.focus(budgetInput());
    enter(budgetInput());
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    expect(costRow(NO)!.querySelector('[data-slot="admin-account-cost-unchanged"]')).toHaveTextContent('변경 없음');
    expect(chipTexts()).toEqual(['KB120 · 변경 없음', 'KB121 · 변경 없음']);
    fireEvent.focus(taxInput());
    enter(taxInput());
    expect(setAccountFeeMock).not.toHaveBeenCalled();
    // 불일치 줄은 그대로 남는다 — 맞추려면 값을 직접 친다
    expect(costRow(NO)!.querySelectorAll('[data-slot="admin-account-cost-mismatch"]')).toHaveLength(2);
  });

  it('(behavior 3) 불일치가 있으면 같은 값을 직접 쳐서 Enter 할 때 보낸다(예수금 · 비용률 따로)', async () => {
    setAccountBudgetMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    setAccountFeeMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    mountCost([withCosts(KB_TWO, { KB120: cost(100_000_000, 100, 2000), KB121: cost(50_000_000, 500, 2000) })]);
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '100000000' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledWith('kimtr', 'KB', NO, 100_000_000);
    await act(async () => {});
    fireEvent.focus(taxInput());
    // 지우고 같은 값을 다시 침(같은 글자로의 change 는 React 가 무시한다 — 실제 입력은 지웠다 치는 동작)
    fireEvent.change(taxInput(), { target: { value: '' } });
    fireEvent.change(taxInput(), { target: { value: '0.2' } });
    enter(taxInput());
    expect(setAccountFeeMock).toHaveBeenCalledWith('kimtr', 'KB', NO, 100, 2000);
    await act(async () => {});
  });

  it('(WR-01 R2) 실패로 입력값이 남은 칸은 고치지 않고 Enter 해도 다시 보낸다(재시도)', async () => {
    setAccountBudgetMock.mockResolvedValueOnce({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'offline' }] });
    mountCost([withCosts(KB_TWO, { KB120: cost(100_000_000), KB121: cost(100_000_000) })]);
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '20000000' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(chipTexts()).toEqual(['KB120', 'KB121 · 서버 연결 안 됨']));
    expect(budgetInput()).toHaveValue('20,000,000');
    setAccountBudgetMock.mockResolvedValueOnce({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    enter(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(2);
    expect(setAccountBudgetMock).toHaveBeenLastCalledWith('kimtr', 'KB', NO, 20_000_000);
    await act(async () => {});
  });

  it('(WR-01) 서버 예수금이 체결 조정으로 99,987,654원이면 칸도 원 그대로 · 안 고친 칸 Enter · 같은 숫자 다시 침은 요청 0 · 「변경 없음」', () => {
    const ADJ = 99_987_654;
    mountCost([withCosts(KB_TWO, { KB120: cost(ADJ), KB121: cost(ADJ) })]);
    expect(budgetInput()).toHaveValue('99,987,654');
    fireEvent.focus(budgetInput());
    enter(budgetInput());
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    expect(costRow(NO)!.querySelector('[data-slot="admin-account-cost-unchanged"]')).toHaveTextContent('변경 없음');
    fireEvent.change(budgetInput(), { target: { value: '99987654' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
  });

  it('(WR-01) 불일치 맞추기(같은 숫자를 직접 침)는 그 원 값 그대로 · 다른 값이면 친 원 값', async () => {
    setAccountBudgetMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    mountCost([withCosts(KB_TWO, { KB120: cost(99_987_654), KB121: cost(50_000_000) })]);
    fireEvent.focus(budgetInput());
    enter(budgetInput());
    // 안 고친 Enter 는 불일치여도 보내지 않는다(WR-01 R2)
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    fireEvent.change(budgetInput(), { target: { value: '99987654' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(1);
    expect(setAccountBudgetMock).toHaveBeenLastCalledWith('kimtr', 'KB', NO, 99_987_654);
    await act(async () => {});
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '99990001' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(2);
    expect(setAccountBudgetMock).toHaveBeenLastCalledWith('kimtr', 'KB', NO, 99_990_001);
    await act(async () => {});
  });

  it('(WR-01) 서버 예수금 1원 → 칸 「1」 · 안 고친 Enter 는 요청 0 · 「0」 을 치면 해제', async () => {
    setAccountBudgetMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mountCost([withCosts(KB_ACCT, { KB120: cost(1) })]);
    expect(budgetInput()).toHaveValue('1');
    fireEvent.focus(budgetInput());
    enter(budgetInput());
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    fireEvent.change(budgetInput(), { target: { value: '0' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(1);
    expect(setAccountBudgetMock).toHaveBeenCalledWith('kimtr', 'KB', NO, 0);
    await act(async () => {});
  });

  it('(behavior 4) 포커스 이탈 — 안 고쳤으면 요청 0 · 고쳤으면 요청 1', async () => {
    setAccountBudgetMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    setAccountFeeMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000, 100, 2000) })]);
    fireEvent.focus(budgetInput());
    fireEvent.blur(budgetInput());
    fireEvent.focus(feeInput());
    fireEvent.blur(feeInput());
    fireEvent.focus(taxInput());
    fireEvent.blur(taxInput());
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    expect(setAccountFeeMock).not.toHaveBeenCalled();

    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '20000000' } });
    fireEvent.blur(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(1);
    expect(setAccountBudgetMock).toHaveBeenCalledWith('kimtr', 'KB', NO, 20_000_000);
    await act(async () => {});
    fireEvent.focus(taxInput());
    fireEvent.change(taxInput(), { target: { value: '0.15' } });
    fireEvent.blur(taxInput());
    expect(setAccountFeeMock).toHaveBeenCalledTimes(1);
    expect(setAccountFeeMock).toHaveBeenCalledWith('kimtr', 'KB', NO, 100, 1500);
    await act(async () => {});
  });

  it('(behavior 5) failed code 1 「BAD_OP」 → 칩 「KB120 · 실패」 title 「서버 미지원 · BAD_OP」 + role=alert 줄 · 입력값 유지', async () => {
    setAccountFeeMock.mockResolvedValue({
      results: [
        { server: 'KB120', outcome: 'failed', code: 1, message: 'BAD_OP' },
        { server: 'KB121', outcome: 'ok' },
      ],
    });
    mountCost([withCosts(KB_TWO, SAME)]);
    fireEvent.focus(feeInput());
    fireEvent.change(feeInput(), { target: { value: '0.05' } });
    enter(feeInput());
    await waitFor(() => expect(chipTexts()).toEqual(['KB120 · 실패', 'KB121']));
    expect(costChips()[0]).toHaveAttribute('data-tone', 'err');
    expect(costChips()[0]).toHaveAttribute('title', '서버 미지원 · BAD_OP');
    const alert = within(costRow(NO)!).getByRole('alert');
    expect(alert).toHaveTextContent('KB120 실패: 서버 미지원 · BAD_OP — 서버 업데이트 뒤 다시 저장');
    fireEvent.blur(feeInput());
    expect(feeInput()).toHaveValue('0.05');
  });

  it('(behavior 5) failed code 5 → 「KB120 실패: <message>」(role=alert · 서버 미지원 아님) · offline → WARN 「KB120 미반영: 서버 연결 안 됨」(role 없음) · 칩 「KB120 · 서버 연결 안 됨」', async () => {
    setAccountBudgetMock.mockResolvedValueOnce({ results: [{ server: 'KB120', outcome: 'failed', code: 5, message: '계좌 없음' }] });
    mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000) })]);
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '20000000' } });
    enter(budgetInput());
    await waitFor(() => expect(lineTexts()).toEqual(['KB120 실패: 계좌 없음']));
    expect(lines()[0]).toHaveAttribute('role', 'alert');
    expect(costChips()[0]).toHaveAttribute('title', '계좌 없음');

    setAccountBudgetMock.mockResolvedValueOnce({ results: [{ server: 'KB120', outcome: 'offline' }] });
    fireEvent.change(budgetInput(), { target: { value: '30000000' } });
    // 그 op 칸을 다시 고치면 지난 실패 줄을 지운다
    expect(lineTexts()).toEqual([]);
    enter(budgetInput());
    await waitFor(() => expect(lineTexts()).toEqual(['KB120 미반영: 서버 연결 안 됨']));
    expect(lines()[0]).not.toHaveAttribute('role');
    expect(lines()[0]).toHaveAttribute('data-tone', 'warn');
    expect(chipTexts()).toEqual(['KB120 · 서버 연결 안 됨']);
    expect(costChips()[0]).toHaveAttribute('data-tone', 'warn');
  });

  it('(behavior 6) 비행 중 — 예수금 저장이면 예수금 칸만 readOnly · 「<키> · 보내는 중」 칩(스피너) · 비용률 저장이면 두 칸 readOnly', async () => {
    const b = deferred<{ results: { server: string; outcome: string }[] }>();
    setAccountBudgetMock.mockReturnValue(b.promise);
    mountCost([withCosts(KB_TWO, SAME)]);
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '20000000' } });
    enter(budgetInput());
    expect(budgetInput()).toHaveAttribute('readonly');
    expect(budgetInput().className).toContain('opacity-50');
    expect(feeInput()).not.toHaveAttribute('readonly');
    expect(taxInput()).not.toHaveAttribute('readonly');
    expect(chipTexts()).toEqual(['KB120 · 보내는 중', 'KB121 · 보내는 중']);
    expect(costChips()[0]).toHaveAttribute('data-tone', 'only');
    const spinner = costChips()[0].querySelector('[data-slot="admin-cost-spinner"]') as HTMLElement;
    expect(spinner.className).toContain('animate-spin');
    expect(spinner.className).toContain('motion-reduce:animate-none');
    await act(async () => b.resolve({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] }));
    expect(budgetInput()).not.toHaveAttribute('readonly');

    const f = deferred<{ results: { server: string; outcome: string }[] }>();
    setAccountFeeMock.mockReturnValue(f.promise);
    fireEvent.focus(feeInput());
    fireEvent.change(feeInput(), { target: { value: '0.02' } });
    enter(feeInput());
    expect(feeInput()).toHaveAttribute('readonly');
    expect(taxInput()).toHaveAttribute('readonly');
    expect(budgetInput()).not.toHaveAttribute('readonly');
    await act(async () => f.resolve({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] }));
  });

  it('(behavior 7) 서버별 다름 — 칸 = 주문 서버(KB120) 값 · 「KB121 은 50,000,000원 — …」 · 「KB121 은 0.05% · 0.2% — …」(WARN · role 없음)', () => {
    mountCost([withCosts(KB_TWO, { KB120: cost(100_000_000, 100, 2000), KB121: cost(50_000_000, 500, 2000, 'snapshot') })]);
    expect(budgetInput()).toHaveValue('100,000,000');
    expect(feeInput()).toHaveValue('0.01');
    expect(taxInput()).toHaveValue('0.2');
    const ms = Array.from(costRow(NO)!.querySelectorAll('[data-slot="admin-account-cost-mismatch"]')) as HTMLElement[];
    expect(ms.map((m) => m.textContent)).toEqual([
      'KB121 은 50,000,000원 — 저장하면 모두 같아져요',
      'KB121 은 0.05% · 0.2% — 저장하면 모두 같아져요',
    ]);
    ms.forEach((m) => expect(m).not.toHaveAttribute('role'));
    // 서버 1대 · 같은 값이면 불일치 줄 없음
    expect(costRow(NO)!.querySelectorAll('[data-slot="admin-account-cost-mismatch"]')).toHaveLength(2);
  });

  it('(behavior 7) 조사 은/는 = 키 끝 숫자 읽기 — KYOBO119 는 · KB120 의 미설정 → 「미설정」 · 87 모르는 서버는 「확인 전」 칩 · 불일치 판정 밖', () => {
    const KY_TWO: AdminAccountView = {
      ...KYOBO_ACCT,
      servers: [
        { serverKey: 'KYOBO119', tone: 'ok', message: null, state: 'active' },
        { serverKey: 'KYOBO127', tone: 'ok', message: null, state: 'active' },
      ],
      orderServer: 'KYOBO127',
    };
    mountCost([
      withCosts(KB_TWO, { KB120: cost(0), KB121: cost(50_000_000) }),
      withCosts(KY_TWO, { KYOBO119: cost(700_000_000, 500, 2000), KYOBO127: cost(100_000_000, 500, 2000) }),
    ]);
    expect(Array.from(costRow('9876543201')!.querySelectorAll('[data-slot="admin-account-cost-mismatch"]')).map((m) => m.textContent)).toEqual([
      'KYOBO119 는 700,000,000원 — 저장하면 모두 같아져요',
    ]);
    expect(Array.from(costRow(NO)!.querySelectorAll('[data-slot="admin-account-cost-mismatch"]')).map((m) => m.textContent)).toEqual([
      'KB121 은 50,000,000원 — 저장하면 모두 같아져요',
    ]);
  });

  it('(E1 empty) 87 미확인 서버만 → 세 칸 「—」 · 「<키> · 확인 전」 칩(only) · 불일치 줄 없음', () => {
    mountCost([withCosts(KB_TWO, { KB120: null, KB121: null })]);
    expect(budgetInput()).toHaveValue('');
    expect(budgetInput()).toHaveAttribute('placeholder', '—');
    expect(feeInput()).toHaveAttribute('placeholder', '—');
    expect(taxInput()).toHaveAttribute('placeholder', '—');
    expect(chipTexts()).toEqual(['KB120 · 확인 전', 'KB121 · 확인 전']);
    expect(costChips().every((c) => c.getAttribute('data-tone') === 'only')).toBe(true);
    expect(costRow(NO)!.querySelectorAll('[data-slot="admin-account-cost-mismatch"]')).toHaveLength(0);
  });

  it('(CR-01) 확인 전(E1 empty) — 세 칸 안 고친 Enter · 포커스 이탈은 요청 0 · 칩 「확인 전」 그대로(모르는 값을 0 으로 덮지 않는다)', () => {
    mountCost([withCosts(KB_TWO, { KB120: null, KB121: null })]);
    for (const el of [budgetInput(), feeInput(), taxInput()]) {
      fireEvent.focus(el);
      enter(el);
      fireEvent.blur(el);
    }
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    expect(setAccountFeeMock).not.toHaveBeenCalled();
    expect(chipTexts()).toEqual(['KB120 · 확인 전', 'KB121 · 확인 전']);
    expect(costRow(NO)!.querySelector('[data-slot="admin-account-cost-unchanged"]')).toBeNull();
  });

  it('(CR-01) 확인 전 — 쳤다 지운 빈 칸도 해제(0)를 보내지 않는다 · 「0」 을 직접 치면 해제', async () => {
    setAccountBudgetMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    mountCost([withCosts(KB_TWO, { KB120: null, KB121: null })]);
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '50000' } });
    fireEvent.change(budgetInput(), { target: { value: '' } });
    enter(budgetInput());
    fireEvent.blur(budgetInput());
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '0' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(1);
    expect(setAccountBudgetMock).toHaveBeenCalledWith('kimtr', 'KB', NO, 0);
    await act(async () => {});
  });

  it('(CR-01) 확인 전 — 수수료만 치고 매도세가 빈 칸이면 보내지 않는다(빈 칸 aria-invalid + 범위 줄) · 두 칸 다 치면 op 7', async () => {
    setAccountFeeMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    mountCost([withCosts(KB_TWO, { KB120: null, KB121: null })]);
    fireEvent.focus(feeInput());
    fireEvent.change(feeInput(), { target: { value: '0.01' } });
    enter(feeInput());
    expect(setAccountFeeMock).not.toHaveBeenCalled();
    expect(taxInput()).toHaveAttribute('aria-invalid', 'true');
    expect(feeInput()).not.toHaveAttribute('aria-invalid');
    expect(feeInput()).toHaveValue('0.01');
    expect(costRow(NO)).toHaveTextContent(RANGE);
    fireEvent.focus(taxInput());
    fireEvent.change(taxInput(), { target: { value: '0' } });
    enter(taxInput());
    expect(setAccountFeeMock).toHaveBeenCalledTimes(1);
    expect(setAccountFeeMock).toHaveBeenCalledWith('kimtr', 'KB', NO, 100, 0);
    await act(async () => {});
  });

  it('(E1 partial) KB121 만 87 모름 → KB120 ok 칩 · KB121 「확인 전」 · 불일치 줄 없음', () => {
    mountCost([withCosts(KB_TWO, { KB120: cost(100_000_000), KB121: null })]);
    expect(chipTexts()).toEqual(['KB120', 'KB121 · 확인 전']);
    expect(costRow(NO)!.querySelectorAll('[data-slot="admin-account-cost-mismatch"]')).toHaveLength(0);
  });

  it('(D-04) 비용 저장 결과는 세 칸 자리 칩 · 줄로만 말한다(BusyLines 로 새지 않는다)', async () => {
    setAccountBudgetMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'failed', code: 1, message: 'BAD_OP' }] });
    mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000) })]);
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '20000000' } });
    enter(budgetInput());
    await waitFor(() => expect(chipTexts()).toEqual(['KB120 · 실패']));
    expect(document.querySelectorAll('[data-slot="admin-busy-line"]')).toHaveLength(0);
  });

  it('(E1 loading) 포커스 · 고치는 중에는 개요 재조회가 칸을 덮지 않는다 · 이탈(안 고침) 뒤에는 최신 개요 값을 따른다', () => {
    const { rerender } = mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000, 100, 2000) })]);
    fireEvent.focus(budgetInput());
    rerender([withCosts(KB_ACCT, { KB120: cost(90_000_000, 100, 2000) })]);
    expect(budgetInput()).toHaveValue('100,000,000');
    fireEvent.blur(budgetInput());
    expect(budgetInput()).toHaveValue('90,000,000');
    fireEvent.focus(feeInput());
    fireEvent.change(feeInput(), { target: { value: '0.0' } });
    rerender([withCosts(KB_ACCT, { KB120: cost(90_000_000, 300, 2000) })]);
    expect(feeInput()).toHaveValue('0.0');
    expect(setAccountFeeMock).not.toHaveBeenCalled();
  });

  it('(D-05) 저장 성공 뒤 재조회 전에는 저장한 값 · 재조회가 오면 개요 값(서버 체결 조정)이 정본', async () => {
    setAccountBudgetMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    const { rerender } = mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000) })]);
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '20000000' } });
    fireEvent.blur(budgetInput());
    await waitFor(() => expect(chipTexts()).toEqual(['KB120']));
    expect(budgetInput()).toHaveValue('20,000,000');
    rerender([withCosts(KB_ACCT, { KB120: cost(19_950_000) })]);
    expect(budgetInput()).toHaveValue('19,950,000');
  });

  it('(E1 overflow) 배치 — 카드 폭 컨테이너 쿼리: 예수금 묶음 basis-full → 480px 부터 auto · 1줄 끝 구분점 hidden → inline · 수수료 · 매도세 한 묶음 · 칩 묶음 inline-flex flex-wrap gap-1', () => {
    mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000) })]);
    expect(costRow(NO)!.className).toContain('@container/cost');
    const group = costRow(NO)!.querySelector('[data-slot="admin-account-cost-budget"]') as HTMLElement;
    expect(group.className).toContain('basis-full');
    expect(group.className).toContain('@min-[480px]/cost:basis-auto');
    const dot = group.querySelector('[data-slot="admin-account-cost-sep"]') as HTMLElement;
    expect(dot.className).toContain('hidden');
    expect(dot.className).toContain('@min-[480px]/cost:inline');
    const rates = costRow(NO)!.querySelector('[data-slot="admin-account-cost-rates"]') as HTMLElement;
    expect(within(rates).getAllByRole('textbox').map((i) => i.getAttribute('aria-label'))).toEqual([
      'KB 12345678901 수수료(%)',
      'KB 12345678901 매도세(%)',
    ]);
    const chipsEl = costRow(NO)!.querySelector('[data-slot="admin-account-cost-chips"]') as HTMLElement;
    expect(chipsEl.className).toContain('inline-flex');
    expect(chipsEl.className).toContain('flex-wrap');
    expect(chipsEl.className).toContain('gap-1');
  });
});

describe('quick-261107-moq 서버에만 있음 계좌 — 연결', () => {
  const confirmBox = () =>
    acctRow('5550001').querySelector('[data-slot="admin-server-only-confirm"]') as HTMLElement | null;
  const actions = () => acctRow('5550001').querySelector('[data-slot="admin-server-only-actions"]');

  it('josaEulReul — 받침 · 숫자 한자어 읽기 · 그 밖 「을」', () => {
    expect(josaEulReul('교보 김현중')).toBe('을');
    expect(josaEulReul('위탁')).toBe('을');
    expect(josaEulReul('교보')).toBe('를');
    expect(josaEulReul('5550001')).toBe('을');
    expect(josaEulReul('12')).toBe('를');
    expect(josaEulReul('abc')).toBe('을');
  });

  it('「이 사용자에 연결」 → 파랑 확인 상자(목업 B 문장) · 버튼 줄 사라짐 → 「취소」 → 버튼 줄 복귀 · 호출 0', () => {
    setup();
    fireEvent.click(within(acctRow('5550001')).getByRole('button', { name: '이 사용자에 연결' }));
    const box = confirmBox()!;
    expect(box).toHaveAttribute('data-kind', 'link');
    expect(box).toHaveTextContent('5550001을 kimtr 에 연결해요. KYOBO127 서버 설정은 그대로예요.');
    expect(box).toHaveTextContent('연결하면 위 계좌들처럼 서버를 켜고 끄거나 연결 해제할 수 있어요.');
    expect(actions()).toBeNull();

    fireEvent.click(within(box).getByRole('button', { name: '취소' }));
    expect(confirmBox()).toBeNull();
    expect(actions()).not.toBeNull();
    expect(serverOnlyAccountMock).not.toHaveBeenCalled();
  });

  it('이름 있는 계좌 · 두 서버 → 「교보 김현중을 kimtr 에 연결해요. KYOBO119 · KYOBO127 서버 설정은 그대로예요.」', () => {
    setup([{ ...ONLY_ACCT, name: '교보 김현중', serverOnlyOn: ['KYOBO119', 'KYOBO127'] }]);
    expect(acctRow('5550001').querySelector('[data-slot="admin-server-only-why"]')).toHaveTextContent(
      'KYOBO119 · KYOBO127 서버 설정에만 있고',
    );
    fireEvent.click(within(acctRow('5550001')).getByRole('button', { name: '이 사용자에 연결' }));
    expect(confirmBox()).toHaveTextContent('교보 김현중을 kimtr 에 연결해요. KYOBO119 · KYOBO127 서버 설정은 그대로예요.');
  });

  it('「연결」 → serverOnlyAccount(kimtr, KYOBO, 5550001, link) 1회 → { results: [] } 뒤 onChanged 1회', async () => {
    serverOnlyAccountMock.mockResolvedValue({ results: [] });
    const { onChanged } = setup();
    fireEvent.click(within(acctRow('5550001')).getByRole('button', { name: '이 사용자에 연결' }));
    fireEvent.click(within(confirmBox()!).getByRole('button', { name: '연결' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(serverOnlyAccountMock).toHaveBeenCalledTimes(1);
    expect(serverOnlyAccountMock).toHaveBeenCalledWith('kimtr', 'KYOBO', '5550001', 'link');
  });

  it('409 NOT_SERVER_ONLY → 상자 열린 채 오류 줄(서버 문구) · onChanged 0', async () => {
    const msg = '서버에만 있는 계좌가 아니에요 — 이미 정리됐거나 화면이 오래됐어요';
    serverOnlyAccountMock.mockRejectedValue(new ApiClientError({ code: 'NOT_SERVER_ONLY', message: msg, status: 409 }));
    const { onChanged } = setup();
    fireEvent.click(within(acctRow('5550001')).getByRole('button', { name: '이 사용자에 연결' }));
    fireEvent.click(within(confirmBox()!).getByRole('button', { name: '연결' }));
    const alert = await within(acctRow('5550001')).findByRole('alert');
    expect(alert).toHaveTextContent(`저장하지 못했어요 · ${msg}`);
    expect(confirmBox()).not.toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
