import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import type { AdminUsersOverview } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

import {
  DMA_CONNECT_ERROR,
  DmaConnectFields,
  EMPTY_DMA_CONNECT,
  dmaConnectFailure,
  toDmaInput,
  validateDmaConnect,
  type DmaConnectValue,
} from '../dma-connect-fields';

/**
 * Phase 29 (29-19) — 「DMA 연결」 필드 묶음 (D-16 · D-23 ③ · 목업 A `dmaGroup()`).
 *
 * 잠그는 것: `validateDmaConnect` 표(server zod 와 같은 규칙 — DMA id 8바이트 · 공백 · 비밀번호 일치 · 계좌번호 1~12 ·
 * KB 지점 5 · 트레이더 6 · 서버 1개 이상 · 증권사 일치 · 사용 중) · 증권사별 칸(KB 만 지점 · 트레이더) · 등록 서버 체크
 * (그 증권사만 · 사용 꺼진 서버 비활성 · 증권사 바꾸면 체크 해제) · 409 `DMA_USER_EXISTS` → DMA id 칸 아래 한 줄.
 */

const SERVERS: AdminUsersOverview['servers'] = [
  { key: 'KB120', broker: 'KB', enabled: true },
  { key: 'KB121', broker: 'KB', enabled: true },
  { key: 'KYOBO119', broker: 'KYOBO', enabled: true },
  { key: 'KYOBO127', broker: 'KYOBO', enabled: false },
];

const KB_OK: DmaConnectValue = {
  dmaUserId: 'leenew',
  password: 'pw-1234',
  confirm: 'pw-1234',
  broker: 'KB',
  accountNo: '12345678',
  branchNo: '00123',
  traderId: '000789',
  servers: ['KB120'],
};

const KYOBO_OK: DmaConnectValue = {
  ...KB_OK,
  broker: 'KYOBO',
  branchNo: '',
  traderId: '',
  servers: ['KYOBO119'],
};

describe('validateDmaConnect — server zod 와 같은 규칙', () => {
  const cases: { name: string; value: DmaConnectValue; valid: boolean; errors: Record<string, string> }[] = [
    { name: 'KB 전부 채움', value: KB_OK, valid: true, errors: {} },
    { name: '교보 — 지점 · 트레이더 없이 통과', value: KYOBO_OK, valid: true, errors: {} },
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
    {
      name: '계좌번호 13자 → 오류',
      value: { ...KB_OK, accountNo: '1234567890123' },
      valid: false,
      errors: { accountNo: DMA_CONNECT_ERROR.accountNo },
    },
    {
      name: 'KB 지점 4자 → 오류',
      value: { ...KB_OK, branchNo: '0012' },
      valid: false,
      errors: { branchNo: DMA_CONNECT_ERROR.branchNo },
    },
    {
      name: 'KB 트레이더 5자 → 오류',
      value: { ...KB_OK, traderId: '00078' },
      valid: false,
      errors: { traderId: DMA_CONNECT_ERROR.traderId },
    },
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
    { name: 'KB 지점 빈 칸 → 미완성', value: { ...KB_OK, branchNo: '' }, valid: false, errors: {} },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = validateDmaConnect(c.value, SERVERS);
      expect(r.valid).toBe(c.valid);
      expect(r.errors).toEqual(c.errors);
    });
  }

  it('toDmaInput — 정규화 계좌번호 · 교보 빈 지점/트레이더 · 레지스트리 순 서버', () => {
    expect(
      toDmaInput({ ...KYOBO_OK, accountNo: ' 000987 ', branchNo: '00123', traderId: '000789' }, SERVERS),
    ).toEqual({
      dmaUserId: 'leenew',
      password: 'pw-1234',
      account: { broker: 'KYOBO', accountNo: '987', name: '', branchNo: '', traderId: '', priority: 0 },
      servers: ['KYOBO119'],
    });
    expect(toDmaInput({ ...KB_OK, servers: ['KB121', 'KB120'] }, SERVERS).servers).toEqual(['KB120', 'KB121']);
  });

  it('dmaConnectFailure — 409 DMA_USER_EXISTS 는 DMA id 칸 · 그 밖은 한 줄', () => {
    expect(
      dmaConnectFailure(new ApiClientError({ code: 'DMA_USER_EXISTS', message: 'exists', status: 409 }), '만들지 못했어요'),
    ).toEqual({ fields: { dmaUserId: '이미 있는 DMA id 예요' }, line: null });
    expect(
      dmaConnectFailure(new ApiClientError({ code: 'RELAY_FAILED', message: 'relay 에 닿지 못했어요', status: 502 }), '만들지 못했어요'),
    ).toEqual({ fields: {}, line: '만들지 못했어요 · relay 에 닿지 못했어요' });
    expect(dmaConnectFailure(new Error('x'), '연결하지 못했어요')).toEqual({ fields: {}, line: '연결하지 못했어요' });
  });
});

function Harness({ initial = EMPTY_DMA_CONNECT, onChange }: { initial?: DmaConnectValue; onChange?: (v: DmaConnectValue) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <DmaConnectFields
      servers={SERVERS}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const group = () => document.querySelector('[data-slot="admin-dma-connect"]') as HTMLElement;

describe('DmaConnectFields — 증권사별 칸 · 등록 서버 규칙 (D-23 ③ · D-16)', () => {
  it('KB — 지점 · 트레이더 칸 · KB 서버 2대만 · 기본 체크 없음', () => {
    render(<Harness />);
    expect(within(group()).getByLabelText('지점')).toBeInTheDocument();
    expect(within(group()).getByLabelText('트레이더')).toBeInTheDocument();
    const boxes = within(group()).getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['KB120', 'KB121']);
    for (const b of boxes) expect(b).toHaveAttribute('aria-checked', 'false');
    expect(group()).toHaveTextContent('교보 계좌는 지점 · 트레이더 값이 없다.');
  });

  it('교보로 바꾸면 — 지점 · 트레이더 칸 사라짐 · KYOBO119 활성 · KYOBO127(사용 꺼짐) 비활성 · KB 서버 숨김 · 이전 체크 해제', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(within(group()).getByRole('checkbox', { name: 'KB120' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ servers: ['KB120'] }));

    fireEvent.click(within(group()).getByRole('radio', { name: '교보' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ broker: 'KYOBO', servers: [] }));
    expect(within(group()).queryByLabelText('지점')).toBeNull();
    expect(within(group()).queryByLabelText('트레이더')).toBeNull();
    expect(within(group()).queryByRole('checkbox', { name: 'KB120' })).toBeNull();
    expect(within(group()).getByRole('checkbox', { name: 'KYOBO119' })).toBeEnabled();
    expect(within(group()).getByRole('checkbox', { name: 'KYOBO127' })).toBeDisabled();
  });

  it('같은 KB 계좌를 두 KB 서버에 동시에 체크할 수 있다', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
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

  it('바깥 오류(409 DMA_USER_EXISTS)는 DMA id 칸 아래 · aria-invalid', () => {
    render(
      <DmaConnectFields
        servers={SERVERS}
        value={KB_OK}
        onChange={vi.fn()}
        errors={{ dmaUserId: '이미 있는 DMA id 예요' }}
      />,
    );
    const input = within(group()).getByLabelText(/DMA 사용자 id/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('이미 있는 DMA id 예요');
  });
});
