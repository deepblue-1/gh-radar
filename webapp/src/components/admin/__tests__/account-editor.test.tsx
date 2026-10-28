import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminAccountView, AdminUsersOverview } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * Phase 29 (29-17) — 계좌 · 등록 서버 편집 (D-14 · D-15 · D-23 ③④⑤ · 목업 A `acct()`).
 *
 * 잠그는 것: 계좌 줄(증권사 · 계좌번호 · 이름 · 「제거」) · 그 증권사 서버만 토글 · 교보 「해당 없음」 · 87 전용 흐린 줄 ·
 * 토글 1회 = PUT 1건(계좌 단위 서버 집합) · 응답 결과 → 그 계좌 · 그 서버 칩(BUSY message 원문 title + 한 줄) ·
 * 마지막 서버는 못 끈다 · 제거(2개 이상 = DELETE 1건 · 마지막 = 사용자 삭제로) · 「+ 계좌 추가」(KB 만 지점 · 트레이더 ·
 * 13자 오류 · 서버 0 비활성 · PUT 1건 정규화 계좌번호).
 */

const putDmaAccountMock = vi.fn();
const removeDmaAccountMock = vi.fn();
const setAccountOrderServerMock = vi.fn();
const setAccountBudgetMock = vi.fn();
const setAccountFeeMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  setAccountBudget: (dma: string, broker: string, no: string, krw: number) => setAccountBudgetMock(dma, broker, no, krw),
  setAccountFee: (dma: string, broker: string, no: string, fee: number, tax: number) =>
    setAccountFeeMock(dma, broker, no, fee, tax),
  putDmaAccount: (dma: string, body: unknown) => putDmaAccountMock(dma, body),
  removeDmaAccount: (dma: string, broker: string, no: string) => removeDmaAccountMock(dma, broker, no),
  setAccountOrderServer: (dma: string, broker: string, no: string, key: string | null) =>
    setAccountOrderServerMock(dma, broker, no, key),
}));

import { AccountEditor } from '../account-editor';

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
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AccountEditor — 계좌 줄', () => {
  it('KB 계좌는 KB 서버만 토글 · 교보 계좌는 「해당 없음」 · 87 전용 계좌는 흐린 「서버에만 있음」 줄(버튼 없음)', () => {
    setup();
    const kb = acctRow('12345678901');
    expect(kb).toHaveTextContent('KB');
    expect(kb).toHaveTextContent('위탁');
    expect(within(kb).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['KB120', 'KB121']);
    expect(toggle('12345678901', 'KB120')).toHaveAttribute('aria-checked', 'true');
    expect(toggle('12345678901', 'KB121')).toHaveAttribute('aria-checked', 'false');
    expect(within(kb).getByRole('button', { name: /제거/ })).toBeInTheDocument();
    // 반영 칩 — 목업 `.sv .st`(키는 토글 글자 · 칩은 상태 낱말)
    const ok = pill('12345678901', 'KB120').querySelector('[data-slot="reflect-chip"]') as HTMLElement;
    expect(ok).toHaveTextContent('반영됨');
    expect(ok).toHaveAttribute('data-tone', 'ok');

    const ky = acctRow('9876543201');
    expect(ky).toHaveTextContent('지점 해당 없음');
    expect(ky).toHaveTextContent('트레이더 해당 없음');
    expect(within(ky).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['KYOBO119', 'KYOBO127']);
    // 교보는 지점 · 트레이더 입력칸이 없다(Phase 36 이후 카드의 입력칸은 예수금 · 수수료 · 매도세 행뿐).
    expect(within(ky).queryByRole('textbox', { name: /지점|트레이더/ })).toBeNull();

    const only = acctRow('5550001');
    expect(only).toHaveAttribute('data-server-only', 'true');
    expect(only).toHaveTextContent('KYOBO127 · 서버에만 있음');
    expect(within(only).queryByRole('button')).toBeNull();
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

describe('AccountEditor — 제거', () => {
  it('계좌 2개 이상 → 확인 없이 DELETE 1건 · 결과 칩', async () => {
    removeDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    const { onChanged, onRemoveLast } = setup();
    fireEvent.click(within(acctRow('12345678901')).getByRole('button', { name: /제거/ }));
    expect(removeDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(removeDmaAccountMock).toHaveBeenCalledWith('kimtr', 'KB', '12345678901');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onRemoveLast).not.toHaveBeenCalled();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('마지막 계좌 → DELETE 를 보내지 않고 사용자 삭제로(onRemoveLast) — 87 전용 줄은 세지 않는다', () => {
    const { onRemoveLast } = setup([KB_ACCT, ONLY_ACCT]);
    fireEvent.click(within(acctRow('12345678901')).getByRole('button', { name: /제거/ }));
    expect(removeDmaAccountMock).not.toHaveBeenCalled();
    expect(onRemoveLast).toHaveBeenCalledTimes(1);
  });
});

describe('AccountEditor — 「+ 계좌 추가」', () => {
  const form = () => document.querySelector('[data-slot="admin-account-add"]') as HTMLElement;
  const field = (name: string) => within(form()).getByRole('textbox', { name });

  it('KB → 지점 · 트레이더 · KB 서버만 / 교보 → 지점 · 트레이더 칸 없음 · 교보 서버만', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 추가' }));
    const brokers = within(form()).getByRole('group', { name: '증권사' });
    expect(within(brokers).getByRole('radio', { name: 'KB' })).toHaveAttribute('aria-checked', 'true');
    expect(field('지점')).toBeInTheDocument();
    expect(field('트레이더')).toBeInTheDocument();
    expect(within(form()).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['KB120', 'KB121']);

    fireEvent.click(within(brokers).getByRole('radio', { name: 'KYOBO' }));
    expect(within(form()).queryByRole('textbox', { name: '지점' })).toBeNull();
    expect(within(form()).queryByRole('textbox', { name: '트레이더' })).toBeNull();
    expect(within(form()).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['KYOBO119', 'KYOBO127']);
  });

  it('계좌번호 13자 → 오류 · 서버 0 → 「추가」 비활성 · 다 채우면 PUT 1건(정규화 계좌번호 · 다음 priority)', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB121', outcome: 'ok' }] });
    const { onChanged } = setup();
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 추가' }));
    const add = () => within(form()).getByRole('button', { name: '추가' });

    fireEvent.change(field('계좌번호'), { target: { value: '1234567890123' } });
    expect(field('계좌번호')).toHaveAttribute('aria-invalid', 'true');
    expect(form()).toHaveTextContent('계좌번호는 1~12자예요');
    expect(add()).toBeDisabled();

    fireEvent.change(field('계좌번호'), { target: { value: ' 0055501 ' } });
    expect(field('계좌번호')).not.toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(field('계좌명'), { target: { value: '신용' } });
    fireEvent.change(field('지점'), { target: { value: '00777' } });
    fireEvent.change(field('트레이더'), { target: { value: '000111' } });
    expect(add()).toBeDisabled(); // 서버 0

    fireEvent.click(within(form()).getByRole('checkbox', { name: 'KB121' }));
    expect(add()).not.toBeDisabled();
    fireEvent.click(add());
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(putDmaAccountMock).toHaveBeenCalledWith('kimtr', {
      account: { broker: 'KB', accountNo: '55501', name: '신용', branchNo: '00777', traderId: '000111', priority: 3 },
      servers: ['KB121'],
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(form()).toBeNull();
  });

  it('교보 추가 → 지점 · 트레이더 빈 값으로 PUT', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KYOBO127', outcome: 'ok' }] });
    setup();
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 추가' }));
    fireEvent.click(within(within(form()).getByRole('group', { name: '증권사' })).getByRole('radio', { name: 'KYOBO' }));
    fireEvent.change(field('계좌번호'), { target: { value: '11223344' } });
    fireEvent.click(within(form()).getByRole('checkbox', { name: 'KYOBO127' }));
    fireEvent.click(within(form()).getByRole('button', { name: '추가' }));
    expect(putDmaAccountMock).toHaveBeenCalledWith('kimtr', {
      account: { broker: 'KYOBO', accountNo: '11223344', name: '', branchNo: '', traderId: '', priority: 3 },
      servers: ['KYOBO127'],
    });
    await act(async () => {});
  });

  // WR-06 — 「추가」 는 PUT upsert 1건이라 기존 계좌번호를 넣으면 그 계좌의 이름 · 지점 · 등록 서버를 조용히 덮는다. 막는다.
  it('이미 있는 의도 계좌(정규화 같은 키) → 「이미 있는 계좌」 한 줄 · 「추가」 비활성 · 제출해도 PUT 0건 · 증권사를 바꾸면 줄이 사라진다', async () => {
    const KB_123: AdminAccountView = { ...KB_ACCT, accountNo: '123' };
    setup([KB_123, KYOBO_ACCT, ONLY_ACCT]);
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 추가' }));
    const add = () => within(form()).getByRole('button', { name: '추가' });
    const dup = () => form().querySelector('[data-slot="admin-account-dup"]');

    fireEvent.change(field('계좌번호'), { target: { value: ' 00123' } });
    fireEvent.change(field('지점'), { target: { value: '00777' } });
    fireEvent.change(field('트레이더'), { target: { value: '000111' } });
    fireEvent.click(within(form()).getByRole('checkbox', { name: 'KB121' }));

    expect(dup()).not.toBeNull();
    expect(dup()).toHaveTextContent('이미 있는 계좌 — 위 계좌 줄에서 서버를 고르세요');
    expect(dup()).not.toHaveAttribute('role', 'alert');
    expect(add()).toBeDisabled();
    fireEvent.submit(form());
    expect(putDmaAccountMock).not.toHaveBeenCalled();

    // 증권사 교보 → 다른 키(KYOBO:123) — 줄이 사라진다
    fireEvent.click(within(within(form()).getByRole('group', { name: '증권사' })).getByRole('radio', { name: 'KYOBO' }));
    expect(dup()).toBeNull();
  });

  it('87 에만 있는 계좌(의도 없음)와 같은 번호는 막지 않는다 — 의도 계좌로 새로 올린다', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KYOBO127', outcome: 'ok' }] });
    setup();
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 추가' }));
    fireEvent.click(within(within(form()).getByRole('group', { name: '증권사' })).getByRole('radio', { name: 'KYOBO' }));
    fireEvent.change(field('계좌번호'), { target: { value: ONLY_ACCT.accountNo } });
    fireEvent.click(within(form()).getByRole('checkbox', { name: 'KYOBO127' }));
    expect(form().querySelector('[data-slot="admin-account-dup"]')).toBeNull();
    fireEvent.click(within(form()).getByRole('button', { name: '추가' }));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    await act(async () => {});
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
      <AccountEditor dmaUserId="kimtr" accounts={a} servers={s} onChanged={onChanged} onRemoveLast={vi.fn()} />
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
// Phase 30 (30-04) — KB 주문자 IP/MAC 읽기 줄 · 불일치 · 「이름 없음」 · 「편집」 → 계좌명 저장 · 저장 결과
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
    expect(line).toHaveTextContent('주문자 IP 10.41.1.124 · MAC 1C:FD:08:7D:97:8E');
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
    expect(line).toHaveTextContent('주문자 IP · MAC 미설정(서버 NIC 값)');
    const faint = line.querySelector('.text-\\[var\\(--faint\\)\\]') as HTMLElement;
    expect(faint).toHaveTextContent('미설정(서버 NIC 값)');
    expect(line.querySelectorAll('b')).toHaveLength(0);
  });

  it('87 미확인(orderEndpoints 없음 · 전부 null) → 「확인 전」(--faint) — 「미설정」 이 아니다', () => {
    setup([KB_TWO, KYOBO_ACCT]);
    expect(ipmacLine('12345678901')).toHaveTextContent('주문자 IP · MAC 확인 전');
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
      <AccountEditor dmaUserId="kimtr" accounts={[withEp(KB_TWO, { KB120: EP_A, KB121: EP_B })]} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />,
    );
    // 출처 = 유효 주문 서버(기본 KB120) — 읽기 줄은 KB120 값(표시 표기 · D-17)
    expect(ipmacLine('12345678901')).toHaveTextContent('주문자 IP 10.41.1.124 · MAC 1C:FD:08:7D:97:8E');
    let lines = mismatchLines('12345678901');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute('data-server', 'KB121');
    expect(lines[0]).toHaveTextContent(
      'KB121 값이 달라요(IP 10.41.1.125 · MAC 1C:FD:08:7D:97:8F) — 편집에서 저장하면 등록 서버가 모두 같아져요',
    );
    expect(lines[0].className).toContain('text-[var(--led-latent)]');
    expect(lines[0].className).toContain('break-keep');
    unmount();

    const r2 = render(
      <AccountEditor dmaUserId="kimtr" accounts={[withEp(KB_TWO, { KB120: EP_A, KB121: EP_UNSET })]} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />,
    );
    lines = mismatchLines('12345678901');
    expect(lines.map((l) => l.textContent)).toEqual(['KB121 값이 달라요(미설정) — 편집에서 저장하면 등록 서버가 모두 같아져요']);
    r2.unmount();

    const r3 = render(
      <AccountEditor dmaUserId="kimtr" accounts={[withEp(KB_TWO, { KB120: EP_A, KB121: EP_A })]} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />,
    );
    expect(mismatchLines('12345678901')).toHaveLength(0);
    r3.unmount();

    render(
      <AccountEditor dmaUserId="kimtr" accounts={[withEp(KB_TWO, { KB120: EP_A, KB121: null })]} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />,
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
});

describe('P30 편집 모드 — 계좌명 저장 (D-01 · D-02 · IPMAC-05)', () => {
  const EDIT = 'KB 12345678901 편집';
  const SAVE = 'KB 12345678901 편집 저장';
  const CANCEL = 'KB 12345678901 편집 취소';
  const btn = (name: string) => screen.getByRole('button', { name });
  const nameInput = () => within(acctRow('12345678901')).getByRole('textbox', { name: '계좌명' }) as HTMLInputElement;
  const editForm = () => acctRow('12345678901').querySelector('[data-slot="admin-account-edit"]') as HTMLElement | null;

  function mount(accounts: AdminAccountView[] = [withEp(KB_ACCT, { KB120: EP_A }), KYOBO_ACCT, ONLY_ACCT]) {
    const onChanged = vi.fn();
    const view = (a: AdminAccountView[]) => (
      <AccountEditor dmaUserId="kimtr" accounts={a} servers={SERVERS} onChanged={onChanged} onRemoveLast={vi.fn()} />
    );
    const r = render(view(accounts));
    return { onChanged, rerender: (a: AdminAccountView[]) => r.rerender(view(a)) };
  }

  it('「편집」 → 그 카드만 편집 모드(data-editing · --primary 테두리) · 계좌명 칸 포커스 · 제목줄 계좌명 · 「편집」 · IP/MAC 읽기 줄 숨김 · 다른 카드 「편집」 비활성', () => {
    mount();
    expect(acctRow('12345678901')).not.toHaveAttribute('data-editing');
    expect(btn('KYOBO 9876543201 편집')).not.toBeDisabled();
    // 「편집」 은 「제거」 왼쪽 · 같은 버튼 모양
    const remove = within(acctRow('12345678901')).getByRole('button', { name: /제거/ });
    expect(btn(EDIT).compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(btn(EDIT)).toHaveTextContent('편집');
    // 87 전용 줄에는 「편집」 이 없다
    expect(within(acctRow('5550001')).queryByRole('button')).toBeNull();

    fireEvent.click(btn(EDIT));
    const row = acctRow('12345678901');
    expect(row).toHaveAttribute('data-editing', 'true');
    expect(row.className).toContain('border-[var(--primary)]');
    expect(editForm()).not.toBeNull();
    expect(nameInput()).toHaveValue('위탁');
    expect(document.activeElement).toBe(nameInput());
    expect(screen.queryByRole('button', { name: EDIT })).toBeNull();
    expect(row).not.toHaveTextContent('위탁');
    expect(ipmacLine('12345678901')).toBeNull();
    expect(within(row).getByRole('button', { name: /제거/ })).toBeInTheDocument();
    expect(btn(SAVE)).toHaveTextContent('저장');
    expect(btn(CANCEL)).toHaveTextContent('취소');
    // 한 번에 한 카드
    expect(btn('KYOBO 9876543201 편집')).toBeDisabled();
    expect(btn('KYOBO 9876543201 편집')).toHaveAttribute('title', '다른 계좌 편집 중');
    expect(acctRow('9876543201')).not.toHaveAttribute('data-editing');
  });

  it('바뀐 게 없으면 「저장」 비활성 · "위탁종합" → 저장 → PUT 1건 { account(새 이름 · 나머지 개요 값), servers(active 그대로) } · orderEndpoint 키 없음', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mount();
    fireEvent.click(btn(EDIT));
    expect(btn(SAVE)).toBeDisabled();
    fireEvent.change(nameInput(), { target: { value: '위탁종합' } });
    expect(btn(SAVE)).not.toBeDisabled();
    fireEvent.click(btn(SAVE));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(putDmaAccountMock).toHaveBeenCalledWith('kimtr', {
      account: { broker: 'KB', accountNo: '12345678901', name: '위탁종합', branchNo: '00123', traderId: '000789', priority: 1 },
      servers: ['KB120'],
    });
    const body = putDmaAccountMock.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['account', 'servers']);
    expect(body).not.toHaveProperty('orderEndpoint');
    await act(async () => {});
  });

  it('전부 ok → 편집 닫힘 · onChanged 1회 · 포커스 「편집」 · 칩 「반영됨」', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    const { onChanged } = mount([withEp({ ...KB_ACCT, servers: [{ serverKey: 'KB120', tone: 'warn', message: null, state: 'active' }] }, { KB120: EP_A }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(nameInput(), { target: { value: '위탁종합' } });
    fireEvent.submit(editForm() as HTMLElement); // Enter = 「저장」
    await waitFor(() => expect(acctRow('12345678901')).not.toHaveAttribute('data-editing'));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(btn(EDIT));
    const chip = pill('12345678901', 'KB120').querySelector('[data-slot="reflect-chip"]') as HTMLElement;
    expect(chip).toHaveTextContent('반영됨');
    expect(btn('KYOBO 9876543201 편집')).not.toBeDisabled();
  });

  it('앞뒤 공백만 다르면 비활성(trim 비교) · 이름을 지우고 저장 → name ""', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mount();
    fireEvent.click(btn(EDIT));
    fireEvent.change(nameInput(), { target: { value: '  위탁 ' } });
    expect(btn(SAVE)).toBeDisabled();
    fireEvent.change(nameInput(), { target: { value: '   ' } });
    expect(btn(SAVE)).not.toBeDisabled();
    fireEvent.click(btn(SAVE));
    expect((putDmaAccountMock.mock.calls[0][1] as { account: { name: string } }).account.name).toBe('');
    await act(async () => {});
  });

  it('계좌명 칸 maxLength 40 · placeholder 「계좌명(선택)」 · autoComplete off', () => {
    mount();
    fireEvent.click(btn(EDIT));
    expect(nameInput()).toHaveAttribute('maxLength', '40');
    expect(nameInput()).toHaveAttribute('placeholder', '계좌명(선택)');
    expect(nameInput()).toHaveAttribute('autoComplete', 'off');
  });

  it('저장 중 → 입력칸 readOnly · 「취소」 「저장」 비활성(글자 그대로) · 결과 줄 없음', async () => {
    let resolve: (v: unknown) => void = () => {};
    putDmaAccountMock.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    mount();
    fireEvent.click(btn(EDIT));
    fireEvent.change(nameInput(), { target: { value: '위탁종합' } });
    fireEvent.click(btn(SAVE));
    expect(nameInput()).toHaveAttribute('readOnly');
    expect(btn(SAVE)).toBeDisabled();
    expect(btn(SAVE)).toHaveTextContent('저장');
    expect(btn(CANCEL)).toBeDisabled();
    expect(acctRow('12345678901').querySelector('[data-slot="admin-account-edit-result"]')).toBeNull();
    await act(async () => resolve({ results: [{ server: 'KB120', outcome: 'ok' }] }));
  });

  it('「취소」 → 요청 0 · 편집 닫힘 · 포커스 「편집」 · 다시 열면 개요 값에서 시작', () => {
    mount();
    fireEvent.click(btn(EDIT));
    fireEvent.change(nameInput(), { target: { value: '버릴 이름' } });
    fireEvent.click(btn(CANCEL));
    expect(putDmaAccountMock).not.toHaveBeenCalled();
    expect(acctRow('12345678901')).not.toHaveAttribute('data-editing');
    expect(editForm()).toBeNull();
    expect(document.activeElement).toBe(btn(EDIT));
    expect(acctRow('12345678901')).toHaveTextContent('위탁');
    fireEvent.click(btn(EDIT));
    expect(nameInput()).toHaveValue('위탁');
  });

  it('편집 중 재조회(새 accounts · 다른 이름)가 와도 입력값 · 초깃값 유지', () => {
    const { rerender } = mount();
    fireEvent.click(btn(EDIT));
    fireEvent.change(nameInput(), { target: { value: '쓰던 값' } });
    rerender([withEp({ ...KB_ACCT, name: '신용' }, { KB120: EP_A }), KYOBO_ACCT, ONLY_ACCT]);
    expect(nameInput()).toHaveValue('쓰던 값');
    expect(acctRow('12345678901')).toHaveAttribute('data-editing', 'true');
    // 초깃값('위탁')으로 되돌리면 「바뀐 게 없음」
    fireEvent.change(nameInput(), { target: { value: '위탁' } });
    expect(btn(SAVE)).toBeDisabled();
  });

  it('편집 중 같은 카드 서버 토글 → 즉시 PUT 1건(서버 집합) · 편집 모드 유지', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    mount();
    fireEvent.click(btn(EDIT));
    fireEvent.change(nameInput(), { target: { value: '쓰던 값' } });
    fireEvent.click(toggle('12345678901', 'KB121'));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect((putDmaAccountMock.mock.calls[0][1] as { servers: string[] }).servers).toEqual(['KB120', 'KB121']);
    await act(async () => {});
    expect(acctRow('12345678901')).toHaveAttribute('data-editing', 'true');
    expect(nameInput()).toHaveValue('쓰던 값');
  });

  it('편집 중 그 카드가 사라지면(제거 뒤 재조회) 다른 카드 「편집」 이 다시 켜진다', () => {
    const { rerender } = mount();
    fireEvent.click(btn(EDIT));
    expect(btn('KYOBO 9876543201 편집')).toBeDisabled();
    rerender([KYOBO_ACCT, ONLY_ACCT]);
    expect(btn('KYOBO 9876543201 편집')).not.toBeDisabled();
    expect(btn('KYOBO 9876543201 편집')).not.toHaveAttribute('title');
  });

  it('(D-08) 「+ 계좌 추가」 폼에는 주문자 IP · MAC 칸이 없다', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌 추가' }));
    const add = document.querySelector('[data-slot="admin-account-add"]') as HTMLElement;
    expect(add).not.toHaveTextContent('주문자 IP');
    expect(within(add).queryByRole('textbox', { name: /주문자 IP|MAC/ })).toBeNull();
  });
});

describe('P30 저장 결과 — 서버 문구 원문 · 중복 없음 (D-06 · IPMAC-03)', () => {
  /** gh-trade 86 code 13 BAD_ORDER_ENDPOINT 원문(인박스 261010) — 웹은 이 문장을 바꾸거나 대조하지 않는다(D-12). */
  const GH_TRADE_C13 =
    '주문자 IP/MAC 형식 오류 — IP 는 12자리 숫자 또는 a.b.c.d, MAC 은 12자리 16진, 둘 다 적거나 둘 다 비워야 합니다';
  const EDIT = 'KB 12345678901 편집';
  const SAVE = 'KB 12345678901 편집 저장';
  const CANCEL = 'KB 12345678901 편집 취소';
  const btn = (name: string) => screen.getByRole('button', { name });
  const nameInput = () => within(acctRow('12345678901')).getByRole('textbox', { name: '계좌명' }) as HTMLInputElement;
  const resultLines = () => [...acctRow('12345678901').querySelectorAll('[data-slot="admin-account-edit-result"]')];
  const editAndSave = (name = '위탁종합') => {
    fireEvent.click(btn(EDIT));
    fireEvent.change(nameInput(), { target: { value: name } });
    fireEvent.click(btn(SAVE));
  };

  function mount(accounts: AdminAccountView[] = [withEp(KB_TWO, { KB120: EP_A, KB121: EP_A }), KYOBO_ACCT]) {
    const onChanged = vi.fn();
    render(<AccountEditor dmaUserId="kimtr" accounts={accounts} servers={SERVERS} onChanged={onChanged} onRemoveLast={vi.fn()} />);
    return { onChanged };
  }

  it('[KB120 ok · KB121 failed code 13] → 편집 · 입력 유지 · 결과 줄 role=alert 「KB121 실패: <원문>」 · 칩 반영됨/title 원문 · BusyLines 에 같은 문구 없음', async () => {
    putDmaAccountMock.mockResolvedValue({
      results: [
        { server: 'KB120', outcome: 'ok' },
        { server: 'KB121', outcome: 'failed', code: 13, message: GH_TRADE_C13 },
      ],
    });
    const { onChanged } = mount();
    editAndSave();
    await waitFor(() => expect(resultLines()).toHaveLength(1));
    expect(acctRow('12345678901')).toHaveAttribute('data-editing', 'true');
    expect(nameInput()).toHaveValue('위탁종합');
    const line = resultLines()[0] as HTMLElement;
    expect(line.textContent).toBe(`KB121 실패: ${GH_TRADE_C13}`);
    expect(line).toHaveAttribute('role', 'alert');
    expect(line.className).toContain('text-[12px]');
    expect(line.className).toContain('text-[var(--destructive)]');
    expect(onChanged).toHaveBeenCalledTimes(1);
    const ok = pill('12345678901', 'KB120').querySelector('[data-slot="reflect-chip"]') as HTMLElement;
    const bad = pill('12345678901', 'KB121').querySelector('[data-slot="reflect-chip"]') as HTMLElement;
    expect(ok).toHaveTextContent('반영됨');
    expect(bad).toHaveAttribute('data-tone', 'err');
    expect(bad).toHaveAttribute('title', GH_TRADE_C13);
    const busy = [...document.querySelectorAll('[data-slot="admin-busy-line"]')].filter((l) =>
      (l.textContent ?? '').includes(GH_TRADE_C13),
    );
    expect(busy).toHaveLength(0);
    // 결과 줄은 동작 줄 바로 아래(편집 블록 안)
    expect((document.querySelector('[data-slot="admin-account-edit"]') as HTMLElement).contains(line)).toBe(true);
  });

  it.each([
    [{ server: 'KB120', outcome: 'timeout' }, 'KB120 실패: 응답 없음', 'err'],
    [{ server: 'KB120', outcome: 'offline' }, 'KB120 미반영: 서버 연결 안 됨', 'warn'],
    [{ server: 'KB120', outcome: 'skipped', message: SKIPPED_REASON }, `KB120 미반영: ${SKIPPED_REASON}`, 'warn'],
  ] as const)('결과 %o → 결과 줄 「%s」(%s) · 편집 유지', async (result, text, tone) => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB121', outcome: 'ok' }, result] });
    mount();
    editAndSave();
    await waitFor(() => expect(resultLines()).toHaveLength(1));
    const line = resultLines()[0] as HTMLElement;
    expect(line.textContent).toBe(text);
    if (tone === 'err') {
      expect(line).toHaveAttribute('role', 'alert');
      expect(line.className).toContain('text-[var(--destructive)]');
    } else {
      expect(line).not.toHaveAttribute('role');
      expect(line.className).toContain('text-[var(--led-latent)]');
    }
    expect(acctRow('12345678901')).toHaveAttribute('data-editing', 'true');
    // 같은 사유가 영역 하단 BusyLines 에 다시 뜨지 않는다
    expect(document.querySelectorAll('[data-slot="admin-busy-line"]')).toHaveLength(0);
  });

  it('HTTP 오류(502) → 편집 블록에 role=alert 「저장하지 못했어요 · X」 · 편집 · 입력 유지 · 카드 하단 오류 줄에는 없다', async () => {
    putDmaAccountMock.mockRejectedValue(new ApiClientError({ code: 'RELAY_FAILED', message: 'relay 에 닿지 못했어요', status: 502 }));
    const { onChanged } = mount();
    editAndSave();
    await waitFor(() => expect(resultLines()).toHaveLength(1));
    const line = resultLines()[0] as HTMLElement;
    expect(line.textContent).toBe('저장하지 못했어요 · relay 에 닿지 못했어요');
    expect(line).toHaveAttribute('role', 'alert');
    expect(acctRow('12345678901')).toHaveAttribute('data-editing', 'true');
    expect(nameInput()).toHaveValue('위탁종합');
    expect(acctRow('12345678901').querySelector('[data-slot="admin-account-error"]')).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
    // 다시 저장할 수 있다(바뀐 값 그대로)
    expect(btn(SAVE)).not.toBeDisabled();
  });

  it('실패 줄이 있을 때 계좌명을 한 글자 바꾸면 결과 줄 · HTTP 오류 줄이 사라진다', async () => {
    putDmaAccountMock.mockResolvedValueOnce({
      results: [
        { server: 'KB120', outcome: 'ok' },
        { server: 'KB121', outcome: 'failed', code: 13, message: GH_TRADE_C13 },
      ],
    });
    putDmaAccountMock.mockRejectedValueOnce(new ApiClientError({ code: 'RELAY_FAILED', message: 'X', status: 502 }));
    mount();
    editAndSave();
    await waitFor(() => expect(resultLines()).toHaveLength(1));
    fireEvent.change(nameInput(), { target: { value: '위탁종합1' } });
    expect(resultLines()).toHaveLength(0);
    fireEvent.click(btn(SAVE));
    await waitFor(() => expect(resultLines().map((l) => l.textContent)).toEqual(['저장하지 못했어요 · X']));
    fireEvent.change(nameInput(), { target: { value: '위탁종합2' } });
    expect(resultLines()).toHaveLength(0);
  });

  it('「취소」 → 결과 줄 지움 · 다음 「편집」 을 열면 결과 줄 없음', async () => {
    putDmaAccountMock.mockResolvedValue({
      results: [
        { server: 'KB120', outcome: 'ok' },
        { server: 'KB121', outcome: 'failed', code: 13, message: GH_TRADE_C13 },
      ],
    });
    mount();
    editAndSave();
    await waitFor(() => expect(resultLines()).toHaveLength(1));
    fireEvent.click(btn(CANCEL));
    expect(resultLines()).toHaveLength(0);
    fireEvent.click(btn(EDIT));
    expect(resultLines()).toHaveLength(0);
    expect(nameInput()).toHaveValue('위탁');
  });

  it('(30 WR-04) 부분 실패 뒤 「취소」 → 카드 결과 줄 대신 영역 하단 BusyLines 가 서버 문구를 이어 말한다 · 다시 「편집」 해도 유지', async () => {
    putDmaAccountMock.mockResolvedValue({
      results: [
        { server: 'KB120', outcome: 'ok' },
        { server: 'KB121', outcome: 'failed', code: 13, message: GH_TRADE_C13 },
      ],
    });
    mount();
    const busyWith = () =>
      [...document.querySelectorAll('[data-slot="admin-busy-line"]')].filter((l) => (l.textContent ?? '').includes(GH_TRADE_C13));
    editAndSave();
    await waitFor(() => expect(resultLines()).toHaveLength(1));
    expect(busyWith()).toHaveLength(0);
    fireEvent.click(btn(CANCEL));
    expect(resultLines()).toHaveLength(0);
    expect(busyWith()).toHaveLength(1);
    expect(busyWith()[0]).toHaveAttribute('data-tone', 'err');
    expect(busyWith()[0]?.textContent).toBe(`KB121 실패 · BUSY: ${GH_TRADE_C13} — 정리 뒤 「다시 반영」`);
    // 칩 title 은 그대로
    const bad = pill('12345678901', 'KB121').querySelector('[data-slot="reflect-chip"]') as HTMLElement;
    expect(bad).toHaveAttribute('title', GH_TRADE_C13);
    fireEvent.click(btn(EDIT));
    expect(resultLines()).toHaveLength(0);
    expect(busyWith()).toHaveLength(1);
  });

  it('(30 WR-04) 부분 실패 뒤 입력을 고쳐 카드 결과 줄이 지워지면 BusyLines 가 이어 말한다', async () => {
    putDmaAccountMock.mockResolvedValue({
      results: [
        { server: 'KB120', outcome: 'ok' },
        { server: 'KB121', outcome: 'failed', code: 13, message: GH_TRADE_C13 },
      ],
    });
    mount();
    editAndSave();
    await waitFor(() => expect(resultLines()).toHaveLength(1));
    fireEvent.change(nameInput(), { target: { value: '위탁종합1' } });
    expect(resultLines()).toHaveLength(0);
    const busy = [...document.querySelectorAll('[data-slot="admin-busy-line"]')].map((l) => l.textContent);
    expect(busy).toEqual([`KB121 실패 · BUSY: ${GH_TRADE_C13} — 정리 뒤 「다시 반영」`]);
  });

  it('(Pitfall 4) 계좌명 저장 성공 직후 · 재조회 전 서버 토글 → 토글 PUT 의 account.name 은 새 이름', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mount([withEp(KB_ACCT, { KB120: EP_A }), KYOBO_ACCT]);
    editAndSave('위탁종합');
    await waitFor(() => expect(acctRow('12345678901')).not.toHaveAttribute('data-editing'));
    fireEvent.click(toggle('12345678901', 'KB121'));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(2);
    const second = putDmaAccountMock.mock.calls[1][1] as { account: { name: string }; servers: string[] };
    expect(second.account.name).toBe('위탁종합');
    expect(second.servers).toEqual(['KB120', 'KB121']);
    await act(async () => {});
  });

  it('(30 WR-03) 편집 저장 비행 중 → 그 카드 서버 토글 · 주문 서버 · 「제거」 비활성 · 눌러도 요청 없음', async () => {
    let resolve: (v: unknown) => void = () => {};
    putDmaAccountMock.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    mount();
    editAndSave('위탁종합');
    const row = acctRow('12345678901');
    expect(toggle('12345678901', 'KB120')).toBeDisabled();
    expect(toggle('12345678901', 'KB121')).toBeDisabled();
    expect(within(row).getByRole('button', { name: /제거/ })).toBeDisabled();
    const seg = within(row).getByRole('group', { name: 'KB 12345678901 주문 서버' });
    for (const item of within(seg).getAllByRole('radio')) expect(item).toBeDisabled();
    fireEvent.click(toggle('12345678901', 'KB121'));
    fireEvent.click(within(seg).getByRole('radio', { name: 'KB121' }));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(setAccountOrderServerMock).not.toHaveBeenCalled();
    // 다른 카드는 잠그지 않는다
    expect(toggle('9876543201', 'KYOBO127')).not.toBeDisabled();
    await act(async () => resolve({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] }));
    await waitFor(() => expect(row).not.toHaveAttribute('data-editing'));
    expect(toggle('12345678901', 'KB121')).not.toBeDisabled();
    expect(within(row).getByRole('button', { name: /제거/ })).not.toBeDisabled();
  });

  it('(30 WR-03) 편집 저장이 HTTP 실패(409) → 이후 서버 토글 PUT 의 account.name 은 개요 이름(확정 안 된 새 이름을 싣지 않는다)', async () => {
    putDmaAccountMock.mockRejectedValueOnce(new ApiClientError({ code: 'NO_DMA_USER', message: 'DMA 유저 없음', status: 409 }));
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mount([withEp(KB_ACCT, { KB120: EP_A }), KYOBO_ACCT]);
    editAndSave('위탁종합');
    await waitFor(() => expect(resultLines()).toHaveLength(1));
    expect(acctRow('12345678901')).toHaveAttribute('data-editing', 'true');
    fireEvent.click(toggle('12345678901', 'KB121'));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(2);
    const second = putDmaAccountMock.mock.calls[1][1] as { account: { name: string }; servers: string[] };
    expect(second.account.name).toBe('위탁');
    expect(second.servers).toEqual(['KB120', 'KB121']);
    await act(async () => {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 30 (30-05) — KB 주문자 IP/MAC 편집칸 · 검증 · 보내기 규칙
// ─────────────────────────────────────────────────────────────────────────────

const IPMAC_HELP = '같은 서버의 두 계좌가 서로 체결될 수 있으면 계좌마다 서로 다른 사용자 PC 의 IP · MAC 을 적으세요(ipconfig /all).';
const IP_INVALID = 'IP 는 12자리 숫자 또는 10.41.1.124 형식이에요';
const MAC_INVALID = 'MAC 은 12자리 16진이에요(1C:FD:08:7D:97:8E)';
const PAIR_INVALID = 'IP 와 MAC 은 둘 다 적거나 둘 다 비워 주세요';

describe('P30 IP/MAC 편집칸 · 검증 (D-03 · D-04 · D-05 · D-10)', () => {
  const NO = '12345678901';
  const EDIT = 'KB 12345678901 편집';
  const SAVE = 'KB 12345678901 편집 저장';
  const btn = (name: string) => screen.getByRole('button', { name });
  const ipInput = () => within(acctRow(NO)).getByLabelText('주문자 IP') as HTMLInputElement;
  const macInput = () => within(acctRow(NO)).getByLabelText('MAC 주소') as HTMLInputElement;
  const nameInput = () => within(acctRow(NO)).getByRole('textbox', { name: '계좌명' }) as HTMLInputElement;
  const help = (no = NO) => acctRow(no).querySelector('[data-slot="admin-account-edit-help"]') as HTMLElement | null;
  const invalid = (no = NO) => acctRow(no).querySelector('[data-slot="admin-account-edit-invalid"]') as HTMLElement | null;

  function mount(accounts: AdminAccountView[]) {
    render(<AccountEditor dmaUserId="kimtr" accounts={accounts} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />);
  }

  it('KB 미설정 · 87 미확인 → 「주문자 IP」 · 「MAC 주소」 빈 칸(라벨 htmlFor) · placeholder · aria-invalid 없음 · 도움말 · 오류 줄 없음 · 2열 그리드', () => {
    for (const a of [withEp(KB_TWO, { KB120: EP_UNSET, KB121: EP_UNSET }), KB_TWO]) {
      const r = render(<AccountEditor dmaUserId="kimtr" accounts={[a, KYOBO_ACCT]} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />);
      fireEvent.click(btn(EDIT));
      expect(ipInput()).toHaveValue('');
      expect(macInput()).toHaveValue('');
      expect(ipInput()).toHaveAttribute('placeholder', '10.41.1.124');
      expect(macInput()).toHaveAttribute('placeholder', '1C:FD:08:7D:97:8E');
      expect(ipInput()).not.toHaveAttribute('aria-invalid');
      expect(macInput()).not.toHaveAttribute('aria-invalid');
      expect(help()).toHaveTextContent(IPMAC_HELP);
      expect(help()?.className).toContain('text-[12px]');
      expect(help()?.className).toContain('text-[var(--muted-fg)]');
      expect(invalid()).toBeNull();
      const grid = ipInput().closest('.grid') as HTMLElement;
      expect(grid.className).toContain('grid-cols-2');
      expect(grid.className).toContain('gap-2');
      expect(grid.contains(macInput())).toBe(true);
      expect(btn(SAVE)).toBeDisabled();
      r.unmount();
    }
  });

  it('IP · MAC 칸 속성 — inputMode decimal · autoComplete off · spellCheck false · MAC autoCapitalize characters', () => {
    mount([withEp(KB_ACCT, { KB120: EP_UNSET }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    expect(ipInput()).toHaveAttribute('inputMode', 'decimal');
    expect(ipInput()).toHaveAttribute('autoComplete', 'off');
    expect(ipInput()).toHaveAttribute('spellCheck', 'false');
    expect(macInput()).toHaveAttribute('autoComplete', 'off');
    expect(macInput()).toHaveAttribute('spellCheck', 'false');
    expect(macInput()).toHaveAttribute('autoCapitalize', 'characters');
    // 계좌명 칸 아래
    expect(nameInput().compareDocumentPosition(ipInput()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('설정 계좌(KB120 = KB121) → 초깃값 10.41.1.124 · 1C:FD:08:7D:97:8E(87 값의 표시 표기 · D-17) · 「저장」 비활성', () => {
    mount([withEp(KB_TWO, { KB120: EP_A, KB121: EP_A }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    expect(ipInput()).toHaveValue('10.41.1.124');
    expect(macInput()).toHaveValue('1C:FD:08:7D:97:8E');
    expect(btn(SAVE)).toBeDisabled();
    expect(invalid()).toBeNull();
  });

  it('IP 만 "10.41.1.124" → 비어 있는 MAC 칸 aria-invalid · 도움말 대신 짝 오류(12px · --destructive · role 없음) · 「저장」 비활성', () => {
    mount([withEp(KB_ACCT, { KB120: EP_UNSET }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(ipInput(), { target: { value: '10.41.1.124' } });
    expect(macInput()).toHaveAttribute('aria-invalid', 'true');
    expect(ipInput()).not.toHaveAttribute('aria-invalid');
    expect(invalid()).toHaveTextContent(PAIR_INVALID);
    expect(invalid()?.className).toContain('text-[12px]');
    expect(invalid()?.className).toContain('text-[var(--destructive)]');
    expect(invalid()).not.toHaveAttribute('role');
    expect(help()).toBeNull();
    expect(btn(SAVE)).toBeDisabled();
  });

  it('우선순위 — IP "256.1.1.1" · MAC "zz" → IP 칸만 · IP 문구 / IP 정상 · MAC "1c:fd" → MAC 칸 · MAC 문구', () => {
    mount([withEp(KB_ACCT, { KB120: EP_UNSET }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(ipInput(), { target: { value: '256.1.1.1' } });
    fireEvent.change(macInput(), { target: { value: 'zz' } });
    expect(ipInput()).toHaveAttribute('aria-invalid', 'true');
    expect(macInput()).not.toHaveAttribute('aria-invalid');
    expect(invalid()?.textContent).toBe(IP_INVALID);
    fireEvent.change(ipInput(), { target: { value: '10.41.1.124' } });
    fireEvent.change(macInput(), { target: { value: '1c:fd' } });
    expect(ipInput()).not.toHaveAttribute('aria-invalid');
    expect(macInput()).toHaveAttribute('aria-invalid', 'true');
    expect(invalid()?.textContent).toBe(MAC_INVALID);
    expect(btn(SAVE)).toBeDisabled();
  });

  it('오류를 고치면 오류 줄이 도움말로 돌아오고 「저장」 이 켜진다', () => {
    mount([withEp(KB_ACCT, { KB120: EP_UNSET }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(ipInput(), { target: { value: '10.41.1.124' } });
    expect(invalid()).not.toBeNull();
    fireEvent.change(macInput(), { target: { value: '1c:fd:08:7d:97:8e' } });
    expect(invalid()).toBeNull();
    expect(help()).toHaveTextContent(IPMAC_HELP);
    expect(ipInput()).not.toHaveAttribute('aria-invalid');
    expect(macInput()).not.toHaveAttribute('aria-invalid');
    expect(btn(SAVE)).not.toBeDisabled();
  });

  it('(D-10) 불일치 계좌(KB120 ≠ KB121) → 초깃값 = 출처(KB120) 값 · 바꾸지 않아도 「저장」 켜짐 · 불일치 경고 줄은 도움말 아래', () => {
    mount([withEp(KB_TWO, { KB120: EP_A, KB121: EP_B }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    expect(ipInput()).toHaveValue('10.41.1.124');
    expect(macInput()).toHaveValue('1C:FD:08:7D:97:8E');
    expect(btn(SAVE)).not.toBeDisabled();
    const lines = mismatchLines(NO);
    expect(lines).toHaveLength(1);
    expect((help() as HTMLElement).compareDocumentPosition(lines[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 오류가 있으면 불일치여도 「저장」 비활성
    fireEvent.change(macInput(), { target: { value: '' } });
    expect(btn(SAVE)).toBeDisabled();
    expect(invalid()).toHaveTextContent(PAIR_INVALID);
    expect((invalid() as HTMLElement).compareDocumentPosition(mismatchLines(NO)[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('(D-03) 교보 계좌 편집 → IP/MAC 칸 없음 · 「교보 계좌는 주문자 IP · MAC 해당 없음」 NOTE 한 줄 · 도움말 없음', () => {
    mount([withEp(KB_ACCT, { KB120: EP_A }), KYOBO_ACCT]);
    fireEvent.click(btn('KYOBO 9876543201 편집'));
    const row = acctRow('9876543201');
    expect(within(row).queryByLabelText('주문자 IP')).toBeNull();
    expect(within(row).queryByLabelText('MAC 주소')).toBeNull();
    const na = row.querySelector('[data-slot="admin-account-edit-na"]') as HTMLElement;
    expect(na.textContent).toBe('교보 계좌는 주문자 IP · MAC 해당 없음');
    expect(na.className).toContain('text-[var(--muted-fg)]');
    expect(help('9876543201')).toBeNull();
  });

  it('저장 중 → 계좌명 · IP · MAC 칸 모두 readOnly', async () => {
    let resolve: (v: unknown) => void = () => {};
    putDmaAccountMock.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    mount([withEp(KB_ACCT, { KB120: EP_UNSET }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(ipInput(), { target: { value: '10.41.1.124' } });
    fireEvent.change(macInput(), { target: { value: '1c:fd:08:7d:97:8e' } });
    fireEvent.click(btn(SAVE));
    expect(nameInput()).toHaveAttribute('readOnly');
    expect(ipInput()).toHaveAttribute('readOnly');
    expect(macInput()).toHaveAttribute('readOnly');
    expect(btn(SAVE)).toBeDisabled();
    await act(async () => resolve({ results: [{ server: 'KB120', outcome: 'ok' }] }));
  });
});

describe('P30 보내기 규칙 — 원문 · 변경 없음 · 비우기 · code 13 (D-06 · D-07 · IPMAC-03)', () => {
  /** gh-trade 86 code 13 BAD_ORDER_ENDPOINT 원문(인박스 261010) — 웹은 이 문장을 바꾸거나 대조하지 않는다(D-12). */
  const GH_TRADE_C13 =
    '주문자 IP/MAC 형식 오류 — IP 는 12자리 숫자 또는 a.b.c.d, MAC 은 12자리 16진, 둘 다 적거나 둘 다 비워야 합니다';
  const NO = '12345678901';
  const EDIT = 'KB 12345678901 편집';
  const SAVE = 'KB 12345678901 편집 저장';
  const btn = (name: string) => screen.getByRole('button', { name });
  const ipInput = () => within(acctRow(NO)).getByLabelText('주문자 IP') as HTMLInputElement;
  const macInput = () => within(acctRow(NO)).getByLabelText('MAC 주소') as HTMLInputElement;
  const nameInput = (no = NO) => within(acctRow(no)).getByRole('textbox', { name: '계좌명' }) as HTMLInputElement;
  const resultLines = (no = NO) => [...acctRow(no).querySelectorAll('[data-slot="admin-account-edit-result"]')];
  const bodyOf = (i = 0) => putDmaAccountMock.mock.calls[i][1] as Record<string, unknown> & { account: Record<string, unknown> };

  function mount(accounts: AdminAccountView[]) {
    render(<AccountEditor dmaUserId="kimtr" accounts={accounts} servers={SERVERS} onChanged={vi.fn()} onRemoveLast={vi.fn()} />);
  }

  it('(D-07) 미설정 계좌에 "10.41.1.124" · "1c:fd:08:7d:97:8e" 저장 → orderEndpoint 가 정확히 그 원문 · account 에 IP/MAC 키 없음', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mount([withEp(KB_ACCT, { KB120: EP_UNSET }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(ipInput(), { target: { value: '10.41.1.124' } });
    fireEvent.change(macInput(), { target: { value: '1c:fd:08:7d:97:8e' } });
    fireEvent.click(btn(SAVE));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    const body = bodyOf();
    expect(body.orderEndpoint).toEqual({ orderIp: '10.41.1.124', orderMac: '1c:fd:08:7d:97:8e' });
    expect(Object.keys(body).sort()).toEqual(['account', 'orderEndpoint', 'servers']);
    expect(body.account).not.toHaveProperty('orderIp');
    expect(body.account).not.toHaveProperty('orderMac');
    expect(body.account).toEqual({ broker: 'KB', accountNo: NO, name: '위탁', branchNo: '00123', traderId: '000789', priority: 1 });
    expect(body.servers).toEqual(['KB120']);
    await waitFor(() => expect(acctRow(NO)).not.toHaveAttribute('data-editing'));
  });

  it('앞뒤 공백 " 10.41.1.124 " · " 1c-fd-08-7d-97-8e " → trim 만 한 원문을 보낸다(구분자 · 대소문자 그대로)', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mount([withEp(KB_ACCT, { KB120: EP_UNSET }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(ipInput(), { target: { value: ' 10.41.1.124 ' } });
    fireEvent.change(macInput(), { target: { value: ' 1c-fd-08-7d-97-8e ' } });
    fireEvent.click(btn(SAVE));
    expect(bodyOf().orderEndpoint).toEqual({ orderIp: '10.41.1.124', orderMac: '1c-fd-08-7d-97-8e' });
    await act(async () => {});
  });

  it('(D-06) 설정 계좌에 같은 값을 12자리 · 구분자 없는 소문자 표기로 다시 적고 저장 → 요청 0 · 편집 닫힘 · 포커스 「편집」 · 「변경 없음」(NOTE) · 다시 열면 사라짐', () => {
    mount([withEp(KB_TWO, { KB120: EP_A, KB121: EP_A }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    // 초깃값은 표시 표기(10.41.1.124 · 1C:FD:08:7D:97:8E) — 다른 표기 · 같은 값(D-17 · 비교는 양쪽 정규화)
    fireEvent.change(ipInput(), { target: { value: '010041001124' } });
    fireEvent.change(macInput(), { target: { value: '1cfd087d978e' } });
    expect(btn(SAVE)).not.toBeDisabled(); // 원문이 달라 「바뀜」
    fireEvent.click(btn(SAVE));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(0);
    expect(acctRow(NO)).not.toHaveAttribute('data-editing');
    expect(document.activeElement).toBe(btn(EDIT));
    const lines = resultLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe('변경 없음');
    expect(lines[0].className).toContain('text-[var(--muted-fg)]');
    expect(lines[0]).not.toHaveAttribute('role');
    // IP/MAC 읽기 줄 아래
    expect((ipmacLine(NO) as HTMLElement).compareDocumentPosition(lines[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(btn(EDIT));
    expect(resultLines()).toHaveLength(0);
  });

  it('(D-04) 설정 계좌의 두 칸을 모두 비우고 저장 → orderEndpoint { "", "" } (확인 없음)', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    mount([withEp(KB_TWO, { KB120: EP_A, KB121: EP_A }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(ipInput(), { target: { value: '' } });
    fireEvent.change(macInput(), { target: { value: '' } });
    expect(btn(SAVE)).not.toBeDisabled();
    fireEvent.click(btn(SAVE));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(bodyOf().orderEndpoint).toEqual({ orderIp: '', orderMac: '' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {});
  });

  it('설정 계좌 계좌명만 바꿔 저장 → orderEndpoint 키 없음(87 값 보존)', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    mount([withEp(KB_TWO, { KB120: EP_A, KB121: EP_A }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(nameInput(), { target: { value: '위탁종합' } });
    fireEvent.click(btn(SAVE));
    expect(bodyOf()).not.toHaveProperty('orderEndpoint');
    expect(bodyOf().account.name).toBe('위탁종합');
    await act(async () => {});
  });

  it('계좌명 변경 + 같은 IP 를 12자리 표기로 → 이름만 싣고 orderEndpoint 없음(양쪽 정규화 비교로 같음)', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mount([withEp(KB_ACCT, { KB120: EP_A }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(nameInput(), { target: { value: '위탁종합' } });
    fireEvent.change(ipInput(), { target: { value: '010041001124' } });
    fireEvent.click(btn(SAVE));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(bodyOf()).not.toHaveProperty('orderEndpoint');
    await act(async () => {});
  });

  it('(D-10) 불일치 계좌(KB120 ≠ KB121) 바꾸지 않고 저장 → orderEndpoint = 칸 값(출처 KB120 의 표시 표기) 원문 · 등록 서버 전부', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    mount([withEp(KB_TWO, { KB120: EP_A, KB121: EP_B }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.click(btn(SAVE));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    // D-07 — 칸 값(표시 표기)을 trim 만 해서 싣는다 · 서버가 정규화한다
    expect(bodyOf().orderEndpoint).toEqual({ orderIp: '10.41.1.124', orderMac: '1C:FD:08:7D:97:8E' });
    expect(bodyOf().servers).toEqual(['KB120', 'KB121']);
    await act(async () => {});
  });

  it('(D-17) 87 IP 가 형식 밖(999999999999)인 설정 계좌 → IP 칸 초깃값 원문 · 계좌명만 바꿔 저장 → orderEndpoint 없음', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mount([withEp(KB_ACCT, { KB120: { orderIp: '999999999999', orderMac: '1CFD087D978E' } }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    expect(ipInput()).toHaveValue('999999999999');
    expect(macInput()).toHaveValue('1C:FD:08:7D:97:8E');
    fireEvent.change(nameInput(), { target: { value: '위탁종합' } });
    fireEvent.click(btn(SAVE));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(bodyOf()).not.toHaveProperty('orderEndpoint');
    expect(bodyOf().account.name).toBe('위탁종합');
    await act(async () => {});
  });

  it('(30 IN-06) 「확인 전」 계좌 — 두 칸을 비운 채 계좌명만 바꿔 저장해도 orderEndpoint 없음(모르는 87 을 빈 값으로 덮지 않는다)', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mount([KB_ACCT, KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    expect(ipInput()).toHaveValue('');
    expect(macInput()).toHaveValue('');
    fireEvent.change(nameInput(), { target: { value: '위탁종합' } });
    fireEvent.click(btn(SAVE));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(bodyOf()).not.toHaveProperty('orderEndpoint');
    await act(async () => {});
  });

  it('(30 IN-01) 87 값이 한쪽만 설정(IP 만)인 계좌 → 오류 줄 없이 열림 · 계좌명만 바꾸면 「저장」 켜짐 · orderEndpoint 없음', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mount([withEp(KB_ACCT, { KB120: { orderIp: '010041001124', orderMac: '' } }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    expect(ipInput()).toHaveValue('10.41.1.124');
    expect(macInput()).toHaveValue('');
    expect(acctRow(NO).querySelector('[data-slot="admin-account-edit-invalid"]')).toBeNull();
    fireEvent.change(nameInput(), { target: { value: '위탁종합' } });
    expect(btn(SAVE)).not.toBeDisabled();
    fireEvent.click(btn(SAVE));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(bodyOf()).not.toHaveProperty('orderEndpoint');
    expect(bodyOf().account.name).toBe('위탁종합');
    await act(async () => {});
  });

  it('(30 IN-01) 위 계좌에서 IP/MAC 칸을 고치면 그때 검증이 막는다 — 오류 줄이 이유를 보인다', () => {
    mount([withEp(KB_ACCT, { KB120: { orderIp: '010041001124', orderMac: '' } }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(nameInput(), { target: { value: '위탁종합' } });
    fireEvent.change(ipInput(), { target: { value: '10.41.1.125' } });
    expect(btn(SAVE)).toBeDisabled();
    expect(acctRow(NO).querySelector('[data-slot="admin-account-edit-invalid"]')).toHaveTextContent(
      'IP 와 MAC 은 둘 다 적거나 둘 다 비워 주세요',
    );
    expect(putDmaAccountMock).not.toHaveBeenCalled();
  });

  it('(30 IN-01) 불일치 계좌의 출처 값이 한쪽만 설정 → 열자마자 오류 줄(그대로 맞추면 code 13) · 「저장」 비활성', () => {
    mount([withEp(KB_TWO, { KB120: { orderIp: '010041001124', orderMac: '' }, KB121: EP_A }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    expect(macInput()).toHaveAttribute('aria-invalid', 'true');
    expect(acctRow(NO).querySelector('[data-slot="admin-account-edit-invalid"]')).toHaveTextContent(
      'IP 와 MAC 은 둘 다 적거나 둘 다 비워 주세요',
    );
    expect(btn(SAVE)).toBeDisabled();
  });

  it('(D-03) 교보 계좌 이름 변경 저장 → orderEndpoint 키 없음 · 같은 이름이면 「저장」 비활성', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KYOBO119', outcome: 'ok' }] });
    mount([withEp(KB_ACCT, { KB120: EP_A }), KYOBO_ACCT]);
    fireEvent.click(btn('KYOBO 9876543201 편집'));
    expect(btn('KYOBO 9876543201 편집 저장')).toBeDisabled();
    fireEvent.change(nameInput('9876543201'), { target: { value: '교보위탁' } });
    fireEvent.click(btn('KYOBO 9876543201 편집 저장'));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect(bodyOf()).not.toHaveProperty('orderEndpoint');
    expect(Object.keys(bodyOf()).sort()).toEqual(['account', 'servers']);
    await act(async () => {});
  });

  it('(IPMAC-03) [KB120 failed code 13 · gh-trade 원문] → 결과 줄 원문 · 편집 유지 · IP/MAC 칸 값 유지', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'failed', code: 13, message: GH_TRADE_C13 }] });
    mount([withEp(KB_ACCT, { KB120: EP_UNSET }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    fireEvent.change(ipInput(), { target: { value: '10.41.1.124' } });
    fireEvent.change(macInput(), { target: { value: '1c:fd:08:7d:97:8e' } });
    fireEvent.click(btn(SAVE));
    await waitFor(() => expect(resultLines()).toHaveLength(1));
    expect(resultLines()[0].textContent).toBe(`KB120 실패: ${GH_TRADE_C13}`);
    expect(resultLines()[0]).toHaveAttribute('role', 'alert');
    expect(acctRow(NO)).toHaveAttribute('data-editing', 'true');
    expect(ipInput()).toHaveValue('10.41.1.124');
    expect(macInput()).toHaveValue('1c:fd:08:7d:97:8e');
    // 같은 값으로 다시 「저장」 할 수 있다
    expect(btn(SAVE)).not.toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 30 (30-09) — 공유 계좌 안내 줄 (D-18 · UI-SPEC Addendum A2 · E7)
// ─────────────────────────────────────────────────────────────────────────────

describe('P30 공유 계좌 안내 (D-18)', () => {
  /**
   * gh-trade 86 code 7 ACCOUNT_CONFLICT 원문(gh-trade master 46a10ce9 — D-12 로 넓힌 문구). 웹은 이 문장을 대조하거나 바꾸지 않는다 —
   * 결과 줄 접두사 「KB120 실패: 」 만 웹 문구다(IPMAC-03).
   */
  const GH_TRADE_C7 = '다른 사용자가 같은 계좌를 다른 지점번호/거래자ID/주문자 IP·MAC 으로 보유하고 있습니다';
  const NO = '12345678901';
  const EDIT = `KB ${NO} 편집`;
  const SAVE = `KB ${NO} 편집 저장`;
  const CANCEL = `KB ${NO} 편집 취소`;
  const btn = (name: string) => screen.getByRole('button', { name });
  const sharedLines = () => [...document.querySelectorAll('[data-slot="admin-account-edit-shared"]')] as HTMLElement[];
  const resultLines = () => [...acctRow(NO).querySelectorAll('[data-slot="admin-account-edit-result"]')] as HTMLElement[];
  const ipInput = () => within(acctRow(NO)).getByRole('textbox', { name: '주문자 IP' }) as HTMLInputElement;
  const macInput = () => within(acctRow(NO)).getByRole('textbox', { name: 'MAC 주소' }) as HTMLInputElement;

  const holder = (
    dmaUserId: string | null,
    accounts: AdminAccountView[],
  ): AdminUsersOverview['users'][number] => ({
    email: `${dmaUserId ?? 'web'}@example.invalid`,
    role: 'trader',
    dmaUserId,
    signedUp: true,
    accountCount: accounts.length,
    servers: [],
    accounts,
  });
  const on = (a: AdminAccountView, keys: string[]): AdminAccountView => ({
    ...a,
    servers: keys.map((serverKey) => ({ serverKey, tone: 'ok' as const, message: null, state: 'active' as const })),
  });
  const OWN = withEp(KB_TWO, { KB120: EP_A, KB121: EP_A });
  /** 함께 쓰는 사용자 둘(kimtr — KB120 · bob — KB121) + 자기 · DMA 없는 웹 사용자(빠져야 한다). */
  const USERS = [
    holder('alexjx', [OWN, KYOBO_ACCT]),
    holder('kimtr', [on(KB_ACCT, ['KB120'])]),
    holder(null, []),
    holder('bob', [on(KB_ACCT, ['KB121'])]),
  ];

  function mount(
    accounts: AdminAccountView[] = [OWN, KYOBO_ACCT],
    /** null = users prop 을 넘기지 않는다. */
    users: AdminUsersOverview['users'] | null = USERS,
  ) {
    const onChanged = vi.fn();
    render(
      <AccountEditor
        dmaUserId="alexjx"
        accounts={accounts}
        servers={SERVERS}
        onChanged={onChanged}
        onRemoveLast={vi.fn()}
        {...(users ? { users } : {})}
      />,
    );
    return { onChanged };
  }

  it('함께 쓰는 사용자 둘 → 편집 모드 「… bob · kimtr — …」 · WARN_LINE · role 없음 · 불일치/도움말 줄 뒤 · 「취소」 앞', () => {
    mount([withEp(KB_TWO, { KB120: EP_A, KB121: EP_B }), KYOBO_ACCT]);
    fireEvent.click(btn(EDIT));
    expect(sharedLines()).toHaveLength(1);
    const line = sharedLines()[0];
    expect(line.textContent).toBe('이 계좌를 함께 쓰는 사용자 bob · kimtr — 주문자 IP · MAC 이 함께 바뀌어요');
    expect(line.className).toContain('text-[12px]');
    expect(line.className).toContain('break-keep');
    expect(line.className).toContain('text-[var(--led-latent)]');
    expect(line).not.toHaveAttribute('role');
    const edit = acctRow(NO).querySelector('[data-slot="admin-account-edit"]') as HTMLElement;
    expect(edit.contains(line)).toBe(true);
    const help = edit.querySelector('[data-slot="admin-account-edit-help"]') as HTMLElement;
    const mismatch = edit.querySelector('[data-slot="admin-account-ipmac-mismatch"]') as HTMLElement;
    expect(mismatch).not.toBeNull();
    expect(help.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mismatch.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(btn(CANCEL)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('안내 줄 0개 — 읽기 카드', () => {
    mount();
    expect(acctRow(NO)).not.toHaveAttribute('data-editing');
    expect(sharedLines()).toHaveLength(0);
  });

  it('안내 줄 0개 — users prop 없음', () => {
    mount([OWN, KYOBO_ACCT], null);
    fireEvent.click(btn(EDIT));
    expect(document.querySelector('[data-slot="admin-account-edit"]')).not.toBeNull();
    expect(sharedLines()).toHaveLength(0);
  });

  it('안내 줄 0개 — 겹치는 서버 없음(이 계좌 KB120 만 · 상대 KB121 만)', () => {
    mount([withEp(KB_ACCT, { KB120: EP_A }), KYOBO_ACCT], [holder('alexjx', []), holder('bob', [on(KB_ACCT, ['KB121'])])]);
    fireEvent.click(btn(EDIT));
    expect(document.querySelector('[data-slot="admin-account-edit"]')).not.toBeNull();
    expect(sharedLines()).toHaveLength(0);
  });

  it('안내 줄 0개 — 교보 계좌(같은 번호 교보 계좌를 다른 사용자가 같은 서버에 보유해도)', () => {
    mount([OWN, KYOBO_ACCT], [...USERS, holder('kyobo2', [KYOBO_ACCT])]);
    fireEvent.click(btn(`KYOBO ${KYOBO_ACCT.accountNo} 편집`));
    expect(document.querySelector('[data-slot="admin-account-edit"]')).not.toBeNull();
    expect(sharedLines()).toHaveLength(0);
  });

  it('[KB120 failed code 7 · KB121 ok] → 결과 줄 「KB120 실패: <gh-trade 원문>」 role=alert · 편집 · IP/MAC 입력값 · 안내 줄 유지 · onChanged 1회', async () => {
    putDmaAccountMock.mockResolvedValue({
      results: [
        { server: 'KB120', outcome: 'failed', code: 7, message: GH_TRADE_C7 },
        { server: 'KB121', outcome: 'ok' },
      ],
    });
    const { onChanged } = mount();
    fireEvent.click(btn(EDIT));
    fireEvent.change(ipInput(), { target: { value: '10.41.1.200' } });
    fireEvent.change(macInput(), { target: { value: '1C:FD:08:7D:97:90' } });
    fireEvent.click(btn(SAVE));
    await waitFor(() => expect(resultLines()).toHaveLength(1));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    expect((putDmaAccountMock.mock.calls[0][1] as { orderEndpoint?: unknown }).orderEndpoint).toEqual({
      orderIp: '10.41.1.200',
      orderMac: '1C:FD:08:7D:97:90',
    });
    const line = resultLines()[0];
    expect(line.textContent).toBe(`KB120 실패: ${GH_TRADE_C7}`);
    expect(line).toHaveAttribute('role', 'alert');
    expect(line).toHaveAttribute('data-tone', 'err');
    expect(acctRow(NO)).toHaveAttribute('data-editing', 'true');
    expect(ipInput()).toHaveValue('10.41.1.200');
    expect(macInput()).toHaveValue('1C:FD:08:7D:97:90');
    expect(sharedLines()).toHaveLength(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('저장 응답 전부 ok → 편집 닫힘 · onChanged 1회(개요 재조회 — 함께 쓰는 사용자 카드도 새 값)', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    const { onChanged } = mount();
    fireEvent.click(btn(EDIT));
    fireEvent.change(ipInput(), { target: { value: '10.41.1.200' } });
    fireEvent.change(macInput(), { target: { value: '1C:FD:08:7D:97:90' } });
    fireEvent.click(btn(SAVE));
    await waitFor(() => expect(acctRow(NO)).not.toHaveAttribute('data-editing'));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(resultLines()).toHaveLength(0);
    expect(sharedLines()).toHaveLength(0);
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
  within(acctRow(no)).getByRole('textbox', { name: `${broker} ${no} 예수금(만원)` }) as HTMLInputElement;
const costChips = (no = '12345678901') =>
  Array.from(costRow(no)!.querySelectorAll('[data-slot="admin-account-cost-chips"] [data-slot="reflect-chip"]')) as HTMLElement[];
const chipTexts = (no = '12345678901') => costChips(no).map((c) => c.textContent);
const caption = (no = '12345678901') =>
  costRow(no)!.querySelector('[data-slot="admin-account-cost-caption"]') as HTMLElement;
const enter = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });

function mountCost(accounts: AdminAccountView[]) {
  const onChanged = vi.fn();
  const view = (a: AdminAccountView[]) => (
    <AccountEditor dmaUserId="kimtr" accounts={a} servers={SERVERS} onChanged={onChanged} onRemoveLast={vi.fn()} />
  );
  const r = render(view(accounts));
  return { onChanged, rerender: (a: AdminAccountView[]) => r.rerender(view(a)) };
}

describe('P36 예수금 칸', () => {
  it('costs 1억(KB120 · live) → 칸 「10,000」 · 단위 「만원」 · 라벨 htmlFor · 캡션 문구(미설정 꼬리 없음) · 쉬는 칩 KB120 ok', () => {
    mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000) }), KYOBO_ACCT]);
    const input = budgetInput();
    expect(input).toHaveValue('10,000');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('placeholder', '—');
    const label = costRow('12345678901')!.querySelector(`label[for="${input.id}"]`);
    expect(label).toHaveTextContent('예수금');
    expect(costRow('12345678901')).toHaveTextContent('만원');
    expect(caption()).toHaveTextContent('예수금은 체결 손익·수수료·세금만큼 서버가 스스로 조정해요 · 0 = 해제');
    expect(caption()).not.toHaveTextContent('비우면 미설정');
    expect(chipTexts()).toEqual(['KB120']);
    expect(costChips()[0]).toHaveAttribute('data-tone', 'ok');
  });

  it('「1,500」 입력 + Enter → setAccountBudget(kimtr, KB, 계좌, 15,000,000) 1회 → results ok 2 → 칩 「KB120」 「KB121」 · onChanged', async () => {
    setAccountBudgetMock.mockResolvedValue({
      results: [
        { server: 'KB120', outcome: 'ok' },
        { server: 'KB121', outcome: 'ok', message: '변경 없음' },
      ],
    });
    const { onChanged } = mountCost([withCosts(KB_TWO, { KB120: cost(100_000_000), KB121: cost(100_000_000) })]);
    const input = budgetInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1500' } });
    expect(input).toHaveValue('1,500');
    enter(input);
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(1);
    expect(setAccountBudgetMock).toHaveBeenCalledWith('kimtr', 'KB', '12345678901', 15_000_000);
    await waitFor(() => expect(chipTexts()).toEqual(['KB120', 'KB121']));
    // code 0 은 message 가 「변경 없음」 이어도 ok 칩(D-06 — 문장 대조 없음)
    expect(costChips().map((c) => c.getAttribute('data-tone'))).toEqual(['ok', 'ok']);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('1,500');
  });

  it('값 0 → 빈 칸 · 입력 안내 글자 「—」 · 캡션 끝 「 · 비우면 미설정」', () => {
    mountCost([withCosts(KB_ACCT, { KB120: cost(0) })]);
    expect(budgetInput()).toHaveValue('');
    expect(budgetInput()).toHaveAttribute('placeholder', '—');
    expect(caption()).toHaveTextContent('예수금은 체결 손익·수수료·세금만큼 서버가 스스로 조정해요 · 0 = 해제 · 비우면 미설정');
  });

  it('입력은 숫자만 · 최대 9자리(999,999,999만원)', () => {
    mountCost([withCosts(KB_ACCT, { KB120: cost(0) })]);
    fireEvent.change(budgetInput(), { target: { value: '12a34567890123' } });
    expect(budgetInput()).toHaveValue('123,456,789');
  });

  it('87 전용 흐린 계좌 줄(ServerOnlyAccountRow)에는 「예수금」 행이 없다 · 교보 카드에는 있다', () => {
    mountCost([withCosts(KB_ACCT, { KB120: cost(1) }), withCosts(KYOBO_ACCT, { KYOBO119: cost(700_000_000) }), ONLY_ACCT]);
    expect(costRow('5550001')).toBeNull();
    expect(acctRow('5550001')).not.toHaveTextContent('예수금');
    expect(budgetInput('9876543201', 'KYOBO')).toHaveValue('70,000');
    expect(caption('9876543201')).toHaveTextContent('예수금은 체결 손익·수수료·세금만큼 서버가 스스로 조정해요');
  });

  it('편집 모드에서도 행이 보이고(편집 블록 다음 · 서버 알약 앞) · 카드 저장 바디(op 3)에 예수금 키가 없다', async () => {
    putDmaAccountMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000) })]);
    fireEvent.click(screen.getByRole('button', { name: 'KB 12345678901 편집' }));
    const row = costRow('12345678901')!;
    const form = acctRow('12345678901').querySelector('[data-slot="admin-account-edit"]') as HTMLElement;
    const pillEl = pill('12345678901', 'KB120');
    expect(form.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(pillEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(within(acctRow('12345678901')).getByRole('textbox', { name: '계좌명' }), { target: { value: '새 이름' } });
    fireEvent.click(screen.getByRole('button', { name: 'KB 12345678901 편집 저장' }));
    expect(putDmaAccountMock).toHaveBeenCalledTimes(1);
    const body = putDmaAccountMock.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['account', 'servers']);
    expect(JSON.stringify(body)).not.toMatch(/budget|fee|sellTax/i);
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it('읽기 카드 — 행 자리: IP/MAC 줄 다음 · 서버 알약 줄 앞', () => {
    mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000) })]);
    const row = costRow('12345678901')!;
    const ipmac = acctRow('12345678901').querySelector('[data-slot="admin-account-ipmac"]') as HTMLElement;
    expect(ipmac.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(pill('12345678901', 'KB120')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    fireEvent.change(budgetInput(), { target: { value: '10000' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    const note = costRow(NO)!.querySelector('[data-slot="admin-account-cost-unchanged"]');
    expect(note).toHaveTextContent('변경 없음');
    expect(chipTexts()).toEqual(['KB120 · 변경 없음', 'KB121 · 변경 없음']);
    expect(costChips().map((c) => c.getAttribute('data-tone'))).toEqual(['only', 'only']);
    fireEvent.change(budgetInput(), { target: { value: '1000' } });
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
    fireEvent.change(budgetInput(), { target: { value: '10000' } });
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
    fireEvent.change(budgetInput(), { target: { value: '2000' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(chipTexts()).toEqual(['KB120', 'KB121 · 서버 연결 안 됨']));
    expect(budgetInput()).toHaveValue('2,000');
    setAccountBudgetMock.mockResolvedValueOnce({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    enter(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(2);
    expect(setAccountBudgetMock).toHaveBeenLastCalledWith('kimtr', 'KB', NO, 20_000_000);
    await act(async () => {});
  });

  it('(WR-01) 서버 예수금이 만원 배수가 아니어도(체결 조정 9,998만 7,654원) 안 고친 칸 Enter 는 요청 0 · 「변경 없음」', () => {
    const ADJ = 99_987_654;
    mountCost([withCosts(KB_TWO, { KB120: cost(ADJ), KB121: cost(ADJ) })]);
    expect(budgetInput()).toHaveValue('9,998');
    fireEvent.focus(budgetInput());
    enter(budgetInput());
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    expect(costRow(NO)!.querySelector('[data-slot="admin-account-cost-unchanged"]')).toHaveTextContent('변경 없음');
    // 같은 숫자를 다시 쳐도 화면 단위로 같다 — 서버 원 값을 만원 내림 값으로 덮지 않는다
    fireEvent.change(budgetInput(), { target: { value: '9998' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
  });

  it('(WR-01) 불일치 맞추기(같은 숫자를 직접 침)는 서버 원 값 그대로(만원 내림 아님) · 다른 값이면 칸 값 × 10,000', async () => {
    setAccountBudgetMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }] });
    mountCost([withCosts(KB_TWO, { KB120: cost(99_987_654), KB121: cost(50_000_000) })]);
    fireEvent.focus(budgetInput());
    enter(budgetInput());
    // 안 고친 Enter 는 불일치여도 보내지 않는다(WR-01 R2)
    expect(setAccountBudgetMock).not.toHaveBeenCalled();
    fireEvent.change(budgetInput(), { target: { value: '9998' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(1);
    expect(setAccountBudgetMock).toHaveBeenLastCalledWith('kimtr', 'KB', NO, 99_987_654);
    await act(async () => {});
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '9999' } });
    enter(budgetInput());
    expect(setAccountBudgetMock).toHaveBeenCalledTimes(2);
    expect(setAccountBudgetMock).toHaveBeenLastCalledWith('kimtr', 'KB', NO, 99_990_000);
    await act(async () => {});
  });

  it('(WR-01) 서버 예수금이 1만원 미만(빈 칸 표시)이면 안 고친 Enter 로 해제(0)를 보내지 않는다 · 「0」 을 치면 해제', async () => {
    setAccountBudgetMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'ok' }] });
    mountCost([withCosts(KB_ACCT, { KB120: cost(1) })]);
    expect(budgetInput()).toHaveValue('');
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
    fireEvent.change(budgetInput(), { target: { value: '2000' } });
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
    fireEvent.change(budgetInput(), { target: { value: '2000' } });
    enter(budgetInput());
    await waitFor(() => expect(lineTexts()).toEqual(['KB120 실패: 계좌 없음']));
    expect(lines()[0]).toHaveAttribute('role', 'alert');
    expect(costChips()[0]).toHaveAttribute('title', '계좌 없음');

    setAccountBudgetMock.mockResolvedValueOnce({ results: [{ server: 'KB120', outcome: 'offline' }] });
    fireEvent.change(budgetInput(), { target: { value: '3000' } });
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
    fireEvent.change(budgetInput(), { target: { value: '2000' } });
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

  it('(behavior 6) 카드 편집 저장 비행 중 → 세 칸 모두 readOnly', async () => {
    const d = deferred<{ results: { server: string; outcome: string }[] }>();
    putDmaAccountMock.mockReturnValue(d.promise);
    mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000) })]);
    fireEvent.click(screen.getByRole('button', { name: 'KB 12345678901 편집' }));
    fireEvent.change(within(acctRow(NO)).getByRole('textbox', { name: '계좌명' }), { target: { value: '새 이름' } });
    fireEvent.click(screen.getByRole('button', { name: 'KB 12345678901 편집 저장' }));
    expect(budgetInput()).toHaveAttribute('readonly');
    expect(feeInput()).toHaveAttribute('readonly');
    expect(taxInput()).toHaveAttribute('readonly');
    await act(async () => d.resolve({ results: [{ server: 'KB120', outcome: 'ok' }] }));
  });

  it('(behavior 7) 서버별 다름 — 칸 = 주문 서버(KB120) 값 · 「KB121 은 5,000만 — …」 · 「KB121 은 0.05% · 0.2% — …」(WARN · role 없음)', () => {
    mountCost([withCosts(KB_TWO, { KB120: cost(100_000_000, 100, 2000), KB121: cost(50_000_000, 500, 2000, 'snapshot') })]);
    expect(budgetInput()).toHaveValue('10,000');
    expect(feeInput()).toHaveValue('0.01');
    expect(taxInput()).toHaveValue('0.2');
    const ms = Array.from(costRow(NO)!.querySelectorAll('[data-slot="admin-account-cost-mismatch"]')) as HTMLElement[];
    expect(ms.map((m) => m.textContent)).toEqual([
      'KB121 은 5,000만 — 저장하면 등록 서버가 모두 같아져요',
      'KB121 은 0.05% · 0.2% — 저장하면 등록 서버가 모두 같아져요',
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
      'KYOBO119 는 70,000만 — 저장하면 등록 서버가 모두 같아져요',
    ]);
    expect(Array.from(costRow(NO)!.querySelectorAll('[data-slot="admin-account-cost-mismatch"]')).map((m) => m.textContent)).toEqual([
      'KB121 은 5,000만 — 저장하면 등록 서버가 모두 같아져요',
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
    fireEvent.change(budgetInput(), { target: { value: '5' } });
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

  it('(D-04) 비용 저장 결과는 서버 알약의 반영 칩을 바꾸지 않는다', async () => {
    setAccountBudgetMock.mockResolvedValue({ results: [{ server: 'KB120', outcome: 'failed', code: 1, message: 'BAD_OP' }] });
    mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000) })]);
    const before = pill(NO, 'KB120').textContent;
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '2000' } });
    enter(budgetInput());
    await waitFor(() => expect(chipTexts()).toEqual(['KB120 · 실패']));
    expect(pill(NO, 'KB120').textContent).toBe(before);
    expect(document.querySelectorAll('[data-slot="admin-busy-line"]')).toHaveLength(0);
  });

  it('(E1 loading) 포커스 · 고치는 중에는 개요 재조회가 칸을 덮지 않는다 · 이탈(안 고침) 뒤에는 최신 개요 값을 따른다', () => {
    const { rerender } = mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000, 100, 2000) })]);
    fireEvent.focus(budgetInput());
    rerender([withCosts(KB_ACCT, { KB120: cost(90_000_000, 100, 2000) })]);
    expect(budgetInput()).toHaveValue('10,000');
    fireEvent.blur(budgetInput());
    expect(budgetInput()).toHaveValue('9,000');
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
    fireEvent.change(budgetInput(), { target: { value: '2000' } });
    fireEvent.blur(budgetInput());
    await waitFor(() => expect(chipTexts()).toEqual(['KB120']));
    expect(budgetInput()).toHaveValue('2,000');
    rerender([withCosts(KB_ACCT, { KB120: cost(19_950_000) })]);
    expect(budgetInput()).toHaveValue('1,995');
  });

  it('(E1 overflow) 배치 — 카드 폭 컨테이너 쿼리: 예수금 묶음 basis-full → 464px 부터 auto · 1줄 끝 구분점 hidden → inline · 수수료 · 매도세 한 묶음 · 칩 묶음 inline-flex flex-wrap gap-1', () => {
    mountCost([withCosts(KB_ACCT, { KB120: cost(100_000_000) })]);
    expect(costRow(NO)!.className).toContain('@container/cost');
    const group = costRow(NO)!.querySelector('[data-slot="admin-account-cost-budget"]') as HTMLElement;
    expect(group.className).toContain('basis-full');
    expect(group.className).toContain('@min-[464px]/cost:basis-auto');
    const dot = group.querySelector('[data-slot="admin-account-cost-sep"]') as HTMLElement;
    expect(dot.className).toContain('hidden');
    expect(dot.className).toContain('@min-[464px]/cost:inline');
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
