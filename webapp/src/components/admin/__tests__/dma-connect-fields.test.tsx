import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import type { AdminAccountMaster, AdminUsersOverview } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

import {
  DMA_CONNECT_ERROR,
  DmaConnectFields,
  EMPTY_DMA_CONNECT,
  clearChangedErrors,
  dmaConnectFailure,
  toDmaInput,
  validateDmaConnect,
  type DmaConnectValue,
} from '../dma-connect-fields';

/**
 * Phase 29 (29-19) — 「DMA 연결」 필드 묶음 (D-16 · 목업 A `dmaGroup()`) · quick 261106-lwu D-10 「첫 계좌」 피커(목업 ⑤ 방식 A).
 *
 * 잠그는 것: `validateDmaConnect` 표(server zod 와 같은 규칙 — DMA id 8바이트 · 공백 · 비밀번호 일치 · 첫 계좌 선택 필수 ·
 * 서버 1개 이상 · 고른 계좌 증권사 일치 · 사용 중) · 계좌번호 · 지점 · 트레이더 · 증권사 입력칸 없음 · 피커(마스터 전체 ·
 * 연결/취소 버튼 없음) · 고르면 서버 체크 초기화 · 등록 서버는 고른 계좌 증권사만(꺼진 서버 비활성) · `toDmaInput` 은
 * AdminDmaInput 모양 그대로 마스터 값 · 409 `DMA_USER_EXISTS` → DMA id 칸 · 409 `ACCOUNT_NOT_REGISTERED` → 첫 계좌 아래.
 */

const SERVERS: AdminUsersOverview['servers'] = [
  { key: 'KB120', broker: 'KB', enabled: true },
  { key: 'KB121', broker: 'KB', enabled: true },
  { key: 'KYOBO119', broker: 'KYOBO', enabled: true },
  { key: 'KYOBO127', broker: 'KYOBO', enabled: false },
];

const KB_M: AdminAccountMaster = {
  broker: 'KB',
  accountNo: '12345678',
  name: '주식',
  branchNo: '00123',
  traderId: '000789',
  updatedAt: '2026-11-06T00:00:00Z',
  users: [{ dmaUserId: 'kimtr', emails: [], priority: 0, servers: [] }],
};
const KY_M: AdminAccountMaster = {
  broker: 'KYOBO',
  accountNo: '987',
  name: '',
  branchNo: '',
  traderId: '',
  updatedAt: '2026-11-06T00:00:00Z',
  users: [],
};
const ACCOUNTS = [KB_M, KY_M];

const KB_OK: DmaConnectValue = {
  dmaUserId: 'leenew',
  password: 'pw-1234',
  confirm: 'pw-1234',
  account: KB_M,
  servers: ['KB120'],
};

const KYOBO_OK: DmaConnectValue = { ...KB_OK, account: KY_M, servers: ['KYOBO119'] };

describe('validateDmaConnect — server zod 와 같은 규칙', () => {
  const cases: { name: string; value: DmaConnectValue; valid: boolean; errors: Record<string, string> }[] = [
    { name: 'KB 계좌 · 서버 1대', value: KB_OK, valid: true, errors: {} },
    { name: '교보 계좌', value: KYOBO_OK, valid: true, errors: {} },
    { name: 'KB 두 서버 동시 등록', value: { ...KB_OK, servers: ['KB120', 'KB121'] }, valid: true, errors: {} },
    { name: 'DMA id 8바이트(영문 8자) 통과', value: { ...KB_OK, dmaUserId: 'abcdefgh' }, valid: true, errors: {} },
    {
      name: 'DMA id 9바이트(한글 3자) → 오류',
      value: { ...KB_OK, dmaUserId: '김이박' },
      valid: false,
      errors: { dmaUserId: DMA_CONNECT_ERROR.dmaUserIdBytes },
    },
    {
      name: 'DMA id 공백 → 오류',
      value: { ...KB_OK, dmaUserId: 'lee new' },
      valid: false,
      errors: { dmaUserId: DMA_CONNECT_ERROR.dmaUserIdSpace },
    },
    {
      name: '비밀번호 불일치 → 오류',
      value: { ...KB_OK, confirm: 'pw-9999' },
      valid: false,
      errors: { confirm: DMA_CONNECT_ERROR.passwordMismatch },
    },
    { name: '계좌 미선택 → 미완성(오류 줄 없음)', value: { ...KB_OK, account: null, servers: [] }, valid: false, errors: {} },
    { name: '서버 0 → 미완성(오류 줄 없음)', value: { ...KB_OK, servers: [] }, valid: false, errors: {} },
    {
      name: '다른 증권사 서버 → 오류',
      value: { ...KB_OK, servers: ['KB120', 'KYOBO119'] },
      valid: false,
      errors: { servers: DMA_CONNECT_ERROR.servers },
    },
    {
      name: '사용 꺼진 서버 → 오류',
      value: { ...KYOBO_OK, servers: ['KYOBO127'] },
      valid: false,
      errors: { servers: DMA_CONNECT_ERROR.servers },
    },
    { name: '빈 폼 → 미완성(오류 줄 없음)', value: EMPTY_DMA_CONNECT, valid: false, errors: {} },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = validateDmaConnect(c.value, SERVERS);
      expect(r.valid).toBe(c.valid);
      expect(r.errors).toEqual(c.errors);
    });
  }

  it('toDmaInput — AdminDmaInput 모양 그대로 · 계좌 값 = 고른 마스터 값 · priority 0 · 레지스트리 순 서버', () => {
    expect(toDmaInput(KB_OK, SERVERS)).toEqual({
      dmaUserId: 'leenew',
      password: 'pw-1234',
      account: { broker: 'KB', accountNo: '12345678', name: '주식', branchNo: '00123', traderId: '000789', priority: 0 },
      servers: ['KB120'],
    });
    expect(toDmaInput(KYOBO_OK, SERVERS).account).toEqual({
      broker: 'KYOBO',
      accountNo: '987',
      name: '',
      branchNo: '',
      traderId: '',
      priority: 0,
    });
    expect(toDmaInput({ ...KB_OK, servers: ['KB121', 'KB120'] }, SERVERS).servers).toEqual(['KB120', 'KB121']);
    expect(() => toDmaInput({ ...KB_OK, account: null }, SERVERS)).toThrow();
  });

  it('dmaConnectFailure — 409 DMA_USER_EXISTS 는 DMA id 칸 · 409 ACCOUNT_NOT_REGISTERED 는 첫 계좌 · 그 밖은 한 줄', () => {
    expect(
      dmaConnectFailure(new ApiClientError({ code: 'DMA_USER_EXISTS', message: 'exists', status: 409 }), '만들지 못했어요'),
    ).toEqual({ fields: { dmaUserId: '이미 있는 DMA id 예요' }, line: null });
    expect(
      dmaConnectFailure(
        new ApiClientError({ code: 'ACCOUNT_NOT_REGISTERED', message: '등록되지 않은 계좌예요', status: 409 }),
        '만들지 못했어요',
      ),
    ).toEqual({ fields: { account: '등록되지 않은 계좌예요' }, line: null });
    expect(
      dmaConnectFailure(new ApiClientError({ code: 'RELAY_FAILED', message: 'relay 에 닿지 못했어요', status: 502 }), '만들지 못했어요'),
    ).toEqual({ fields: {}, line: '만들지 못했어요 · relay 에 닿지 못했어요' });
    expect(dmaConnectFailure(new Error('x'), '연결하지 못했어요')).toEqual({ fields: {}, line: '연결하지 못했어요' });
  });

  it('clearChangedErrors — 다른 계좌를 고르면 첫 계좌 오류가 지워진다(같은 계좌면 남는다)', () => {
    const errs = { account: 'x' };
    expect(clearChangedErrors(errs, KB_OK, { ...KB_OK })).toBe(errs);
    expect(clearChangedErrors(errs, KB_OK, { ...KB_OK, account: KY_M })).toEqual({});
  });
});

function Harness({ initial = EMPTY_DMA_CONNECT, onChange }: { initial?: DmaConnectValue; onChange?: (v: DmaConnectValue) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <DmaConnectFields
      servers={SERVERS}
      accounts={ACCOUNTS}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const group = () => document.querySelector('[data-slot="admin-dma-connect"]') as HTMLElement;

describe('DmaConnectFields — 첫 계좌 피커 · 등록 서버 규칙 (D-16 · quick 261106-lwu D-10)', () => {
  it('계좌번호 · 지점 · 트레이더 · 증권사 입력칸 없음 · 「첫 계좌」 피커(마스터 전체 · 버튼 없음) · 고르기 전 서버 체크 없음', () => {
    render(<Harness />);
    expect(within(group()).queryByRole('textbox', { name: '계좌번호' })).toBeNull();
    expect(within(group()).queryByLabelText('지점')).toBeNull();
    expect(within(group()).queryByLabelText('트레이더')).toBeNull();
    expect(within(group()).queryByRole('group', { name: '증권사' })).toBeNull();
    const picker = within(group()).getByRole('radiogroup', { name: '첫 계좌' });
    expect(within(picker).getAllByRole('radio')).toHaveLength(2);
    expect(within(group()).queryByRole('button', { name: '연결' })).toBeNull();
    expect(within(group()).queryAllByRole('checkbox')).toHaveLength(0);
    expect(group()).toHaveTextContent('계좌를 고르면 그 증권사의 서버가 보여요');
  });

  it('KB 계좌를 고르면 value.account = 마스터 행 · KB 서버 2대만 · 기본 체크 없음', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(within(group()).getByRole('radio', { name: 'KB 12345678 주식' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ account: KB_M, servers: [] }));
    const boxes = within(group()).getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['KB120', 'KB121']);
    for (const b of boxes) expect(b).toHaveAttribute('aria-checked', 'false');
  });

  it('교보 계좌로 바꾸면 — 서버 체크 초기화 · KYOBO119 활성 · KYOBO127(사용 꺼짐) 비활성 · KB 서버 숨김', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(within(group()).getByRole('radio', { name: 'KB 12345678 주식' }));
    fireEvent.click(within(group()).getByRole('checkbox', { name: 'KB120' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ servers: ['KB120'] }));

    fireEvent.click(within(group()).getByRole('radio', { name: '교보 987' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ account: KY_M, servers: [] }));
    expect(within(group()).queryByRole('checkbox', { name: 'KB120' })).toBeNull();
    expect(within(group()).getByRole('checkbox', { name: 'KYOBO119' })).toBeEnabled();
    expect(within(group()).getByRole('checkbox', { name: 'KYOBO127' })).toBeDisabled();
  });

  it('같은 KB 계좌를 두 KB 서버에 동시에 체크할 수 있다', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ ...EMPTY_DMA_CONNECT, account: KB_M }} onChange={onChange} />);
    fireEvent.click(within(group()).getByRole('checkbox', { name: 'KB120' }));
    fireEvent.click(within(group()).getByRole('checkbox', { name: 'KB121' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ servers: ['KB120', 'KB121'] }));
    expect(within(group()).getByRole('checkbox', { name: 'KB121' })).toHaveAttribute('aria-checked', 'true');
  });

  it('채운 칸의 형식 오류만 그 칸 아래 한 줄 — 빈 폼은 오류 없음', () => {
    render(<Harness />);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    fireEvent.change(within(group()).getByLabelText(/DMA 사용자 id/), { target: { value: '김이박' } });
    expect(screen.getByRole('alert')).toHaveTextContent(DMA_CONNECT_ERROR.dmaUserIdBytes);
  });

  it('바깥 오류 — DMA_USER_EXISTS 는 DMA id 칸 아래 · aria-invalid / ACCOUNT_NOT_REGISTERED 는 첫 계좌 아래', () => {
    const r = render(
      <DmaConnectFields
        servers={SERVERS}
        accounts={ACCOUNTS}
        value={KB_OK}
        onChange={vi.fn()}
        errors={{ dmaUserId: '이미 있는 DMA id 예요' }}
      />,
    );
    const input = within(group()).getByLabelText(/DMA 사용자 id/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('이미 있는 DMA id 예요');
    r.unmount();

    render(
      <DmaConnectFields servers={SERVERS} accounts={ACCOUNTS} value={KB_OK} onChange={vi.fn()} errors={{ account: '등록되지 않은 계좌예요' }} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('등록되지 않은 계좌예요');
  });

  it('계좌 목록을 못 읽으면(null) 피커 자리에 한 줄', () => {
    render(<DmaConnectFields servers={SERVERS} accounts={null} value={EMPTY_DMA_CONNECT} onChange={vi.fn()} />);
    expect(group().querySelector('[data-slot="account-picker-failed"]')).toHaveTextContent('계좌 목록을 불러오지 못했어요');
  });
});
