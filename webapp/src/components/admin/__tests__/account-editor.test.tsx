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
vi.mock('@/lib/admin-api', () => ({
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
    expect(within(ky).queryByRole('textbox')).toBeNull();

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
});
