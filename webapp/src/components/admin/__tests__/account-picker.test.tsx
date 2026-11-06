import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AdminAccountMaster } from '@gh-radar/shared';

import { ACCOUNT_PICKER_TEXT as T, AccountPicker, masterKeyOf, matchesAccountQuery } from '../account-picker';

/**
 * quick 261106-lwu — AccountPicker(A) · `matchesAccountQuery` (D-09 · D-10 · 목업 ④⑤).
 *
 * 잠그는 것: 검색 순수 함수(빈 검색 참 · 번호 부분 일치 · 이름 부분 일치 대소문자 무시) · 후보 라디오(배지 · 번호 · 이름/「이름 없음」 ·
 * 쓰는 사용자 「 · 」 / 「연결 없음」) · 검색으로 좁힘 · 제외 판정 · 후보 0 · 못 읽음(null) · 「계좌」 에서 등록 링크 늘 보임 · 고르기.
 */

const acct = (over: Partial<AdminAccountMaster> & Pick<AdminAccountMaster, 'broker' | 'accountNo'>): AdminAccountMaster => ({
  name: '',
  branchNo: '',
  traderId: '',
  updatedAt: '2026-11-06T00:00:00Z',
  users: [],
  ...over,
});

const A = acct({
  broker: 'KB',
  accountNo: '5120009880',
  name: 'Stock 주식',
  users: [
    { dmaUserId: 'kimtr', emails: [], priority: 0, servers: [] },
    { dmaUserId: 'leetr', emails: [], priority: 1, servers: [] },
  ],
});
const B = acct({ broker: 'KYOBO', accountNo: '777' });
const C = acct({ broker: 'KB', accountNo: '51200098801', name: '선물대체' });

describe('matchesAccountQuery', () => {
  it.each([
    ['', true],
    ['   ', true],
    ['0009', true],
    ['5120009880', true],
    ['stock', true],
    ['STOCK', true],
    ['주식', true],
    ['선물', false],
    ['999', false],
  ])('%s → %s', (q, expected) => {
    expect(matchesAccountQuery(A, q)).toBe(expected);
  });
});

describe('AccountPicker', () => {
  const opts = () => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="account-picker-option"]')).map((o) => o.dataset.key);

  it('후보마다 라디오 · 배지 · 번호 · 이름/「이름 없음」 · 쓰는 사용자 「 · 」 / 「연결 없음」 · 등록 링크', () => {
    render(<AccountPicker accounts={[A, B, C]} selectedKey={null} onSelect={vi.fn()} title="계좌 연결" idPrefix="t" />);
    const group = screen.getByRole('radiogroup', { name: '계좌 연결' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    const a = document.querySelector<HTMLElement>('[data-key="KB|5120009880"]')!;
    expect(a).toHaveTextContent('KB');
    expect(a).toHaveTextContent('Stock 주식');
    expect(a.querySelector('[data-slot="account-picker-who"]')).toHaveTextContent('kimtr · leetr');
    const b = document.querySelector<HTMLElement>('[data-key="KYOBO|777"]')!;
    expect(b).toHaveTextContent('교보');
    expect(b).toHaveTextContent(T.noName);
    expect(b.querySelector('[data-slot="account-picker-who"]')).toHaveTextContent(T.noUsers);
    expect(screen.getByRole('link', { name: T.registerLink })).toHaveAttribute('href', '/admin/accounts');
    expect(screen.getByRole('searchbox', { name: T.search })).toHaveAttribute('placeholder', T.search);
  });

  it('검색으로 좁힌다 · 맞는 게 없으면 한 줄', () => {
    render(<AccountPicker accounts={[A, B, C]} selectedKey={null} onSelect={vi.fn()} title="계좌 연결" idPrefix="t" />);
    fireEvent.change(screen.getByRole('searchbox', { name: T.search }), { target: { value: '선물' } });
    expect(opts()).toEqual(['KB|51200098801']);
    fireEvent.change(screen.getByRole('searchbox', { name: T.search }), { target: { value: 'zzz' } });
    expect(opts()).toEqual([]);
    expect(screen.getByText(T.noMatch)).toBeInTheDocument();
  });

  it('제외 판정에 걸린 계좌는 안 보인다 · 후보 0 이면 「연결할 수 있는 계좌가 없어요」 · 등록 링크는 남는다', () => {
    const r = render(
      <AccountPicker accounts={[A, B]} selectedKey={null} onSelect={vi.fn()} isExcluded={(x) => x.broker === 'KB'} title="계좌 연결" idPrefix="t" />,
    );
    expect(opts()).toEqual(['KYOBO|777']);
    r.unmount();
    render(<AccountPicker accounts={[A]} selectedKey={null} onSelect={vi.fn()} isExcluded={() => true} title="계좌 연결" idPrefix="t" />);
    expect(screen.getByText(T.empty)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('link', { name: T.registerLink })).toBeInTheDocument();
  });

  it('accounts null → 「계좌 목록을 불러오지 못했어요」 · 등록 링크', () => {
    render(<AccountPicker accounts={null} selectedKey={null} onSelect={vi.fn()} title="첫 계좌" idPrefix="t" />);
    expect(screen.getByRole('alert')).toHaveTextContent(T.loadFailed);
    expect(screen.getByRole('link', { name: T.registerLink })).toBeInTheDocument();
  });

  it('라디오를 누르면 onSelect(그 마스터 행) · selectedKey 가 체크를 정한다', () => {
    const onSelect = vi.fn();
    render(<AccountPicker accounts={[A, B]} selectedKey={masterKeyOf(B)} onSelect={onSelect} title="첫 계좌" idPrefix="t" />);
    expect(screen.getByRole('radio', { name: '교보 777' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'KB 5120009880 Stock 주식' }));
    expect(onSelect).toHaveBeenCalledWith(A);
  });
});
