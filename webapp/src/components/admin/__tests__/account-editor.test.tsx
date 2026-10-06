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
vi.mock('@/lib/admin-api', () => ({
  putDmaAccount: (dma: string, body: unknown) => putDmaAccountMock(dma, body),
  removeDmaAccount: (dma: string, broker: string, no: string) => removeDmaAccountMock(dma, broker, no),
}));

import { AccountEditor } from '../account-editor';

const SERVERS: AdminUsersOverview['servers'] = [
  { key: 'KB120', broker: 'KB', enabled: true },
  { key: 'KB121', broker: 'KB', enabled: true },
  { key: 'KYOBO119', broker: 'KYOBO', enabled: true },
  { key: 'KYOBO127', broker: 'KYOBO', enabled: true },
];

const BUSY = '미체결 2건 — 먼저 정리';

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
});
