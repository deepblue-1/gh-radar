import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminUsersOverview } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * Phase 29 (29-15) — `/admin/users` 목록 (D-14 · 목업 A `row()` · `srvChips()`).
 *
 * 잠그는 것: 반영 칩 문구 · 톤 · BUSY message 툴팁 · 「DMA 연결 없음」 · 계좌 수 표기 · 역할 칩 ·
 * 「서버에만 있음」 행(웹 유저 없음 · aria-disabled · 편집 진입 없음) · 로딩 · 403 · 그 밖 오류 + 다시 시도.
 * API 는 `@/lib/admin-api` 목이다(Express 계약은 admin-api.test.ts 가 잠근다).
 */

const fetchAdminUsersMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  fetchAdminUsers: () => fetchAdminUsersMock(),
}));

// PageHeader 의 BackButton 만 router 를 쓰지만, 안전하게 navigation 을 스텁한다.
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

import { UsersClient } from '../users-client';
import { ReflectChip } from '../reflect-chip';

const SERVERS = [
  { key: 'KB120', broker: 'KB' as const, enabled: true },
  { key: 'KB121', broker: 'KB' as const, enabled: true },
  { key: 'KYOBO119', broker: 'KYOBO' as const, enabled: true },
  { key: 'KYOBO127', broker: 'KYOBO' as const, enabled: true },
];

const OVERVIEW: AdminUsersOverview = {
  users: [
    {
      email: 'alex@example.invalid',
      role: 'admin',
      dmaUserId: 'alexjx',
      signedUp: true,
      accountCount: 2,
      servers: [
        { serverKey: 'KB120', tone: 'ok', message: null },
        { serverKey: 'KB121', tone: 'ok', message: null },
        { serverKey: 'KYOBO119', tone: 'ok', message: null },
        { serverKey: 'KYOBO127', tone: 'warn', message: null },
      ],
      accounts: [],
    },
    {
      email: 'kim.trader@example.invalid',
      role: 'trader',
      dmaUserId: 'kimtr',
      signedUp: true,
      accountCount: 2,
      servers: [
        { serverKey: 'KB120', tone: 'ok', message: null },
        { serverKey: 'KB121', tone: 'err', message: '미체결 주문이 있어 변경할 수 없습니다' },
        { serverKey: 'KYOBO119', tone: 'ok', message: null },
      ],
      accounts: [],
    },
    {
      email: 'park.view@example.invalid',
      role: 'viewer',
      dmaUserId: null,
      signedUp: true,
      accountCount: 0,
      servers: [],
      accounts: [],
    },
  ],
  pending: [],
  serverOnly: [{ dmaUserId: 'smok95', servers: ['KYOBO119'], accountCount: 1 }],
  servers: SERVERS,
};

const root = () => document.querySelector('[data-slot="admin-users"]') as HTMLElement;
const rows = () => Array.from(root().querySelectorAll('[data-slot="admin-user-row"]')) as HTMLElement[];
const rowOf = (email: string) => root().querySelector(`[data-email="${email}"]`) as HTMLElement;

beforeEach(() => {
  fetchAdminUsersMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ReflectChip', () => {
  it('ok → 키만 · warn → 「키 · 미반영」 · err → 「키 · 실패 · BUSY」 + title · only → 「키 · 서버에만 있음」', () => {
    render(
      <div>
        <ReflectChip serverKey="KB120" tone="ok" />
        <ReflectChip serverKey="KB121" tone="warn" />
        <ReflectChip serverKey="KB121" tone="err" message="미체결 주문이 있어 변경할 수 없습니다" />
        <ReflectChip serverKey="KYOBO119" tone="only" />
      </div>,
    );
    const chips = Array.from(document.querySelectorAll('[data-slot="reflect-chip"]'));
    expect(chips.map((c) => c.textContent)).toEqual([
      'KB120',
      'KB121 · 미반영',
      'KB121 · 실패 · BUSY',
      'KYOBO119 · 서버에만 있음',
    ]);
    expect(chips.map((c) => c.getAttribute('data-tone'))).toEqual(['ok', 'warn', 'err', 'only']);
    expect(chips[2]).toHaveAttribute('title', '미체결 주문이 있어 변경할 수 없습니다');
    expect(chips[0]).not.toHaveAttribute('title');
    // 색은 기존 토큰만 — 새 색 토큰 없음
    expect(chips[0].className).toContain('--led-armed');
    expect(chips[1].className).toContain('--led-latent');
    expect(chips[2].className).toContain('--destructive');
    expect(chips[3].className).toContain('border-dashed');
    expect(chips[3].className).toContain('--faint');
  });
});

describe('UsersClient — 목록 (D-14 · 목업 A)', () => {
  it('헤더 · 「사용자 4」 · 행 4(웹 3 + 서버에만 1) · 하단 안내 2문장', async () => {
    fetchAdminUsersMock.mockResolvedValue(OVERVIEW);
    render(<UsersClient />);
    await waitFor(() => expect(rows()).toHaveLength(4));
    expect(screen.getByRole('heading', { level: 1, name: '사용자' })).toBeInTheDocument();
    expect(root()).toHaveTextContent('허용 gmail · 역할 · DMA 연결');
    expect(root().querySelector('[data-slot="admin-users-count"]')).toHaveTextContent('4');
    expect(root()).toHaveTextContent('사전 등록: 「+ 사용자」 로 gmail 만 먼저 넣어 두면 가입 즉시 열린다.');
    expect(root()).toHaveTextContent('「서버에만 있음」 행은 편집 불가 — 보기만.');
    // 「+ 사용자」 는 29-19 가 잇기 전까지 비활성
    expect(screen.getByRole('button', { name: '+ 사용자' })).toBeDisabled();
    expect(fetchAdminUsersMock).toHaveBeenCalledTimes(1);
  });

  it('사용자 행 — 역할 칩 · DMA id · 「· 계좌 N」 · 서버 칩(반영됨=키만 · BUSY=message 툴팁)', async () => {
    fetchAdminUsersMock.mockResolvedValue(OVERVIEW);
    render(<UsersClient />);
    await waitFor(() => expect(rows()).toHaveLength(4));

    const kim = rowOf('kim.trader@example.invalid');
    expect(kim.tagName).toBe('BUTTON');
    expect(kim.querySelector('[data-slot="admin-role-chip"]')).toHaveTextContent('trader');
    expect(kim).toHaveTextContent('DMA kimtr');
    expect(kim).toHaveTextContent('· 계좌 2');
    const chips = Array.from(kim.querySelectorAll('[data-slot="reflect-chip"]'));
    expect(chips.map((c) => c.textContent)).toEqual(['KB120', 'KB121 · 실패 · BUSY', 'KYOBO119']);
    expect(chips[1]).toHaveAttribute('title', '미체결 주문이 있어 변경할 수 없습니다');

    const alex = rowOf('alex@example.invalid');
    expect(alex.querySelector('[data-slot="admin-role-chip"]')).toHaveAttribute('data-role', 'admin');
    expect(within(alex).getByText('KYOBO127 · 미반영')).toBeInTheDocument();
  });

  it('DMA 없는 사용자 — 「DMA 연결 없음」 · 계좌 0 이면 「· 계좌」 없음 · 칩 없음', async () => {
    fetchAdminUsersMock.mockResolvedValue(OVERVIEW);
    render(<UsersClient />);
    await waitFor(() => expect(rows()).toHaveLength(4));
    const park = rowOf('park.view@example.invalid');
    expect(park).toHaveTextContent('DMA 연결 없음');
    expect(park).not.toHaveTextContent('계좌');
    expect(park.querySelectorAll('[data-slot="reflect-chip"]')).toHaveLength(0);
    expect(park.querySelector('[data-slot="admin-role-chip"]')).toHaveTextContent('viewer');
  });

  it('「서버에만 있음」 행 — 제목 DMA id · 「웹 유저 없음」 · aria-disabled · 버튼 아님 · 누르면 아무 일 없음', async () => {
    fetchAdminUsersMock.mockResolvedValue(OVERVIEW);
    render(<UsersClient />);
    await waitFor(() => expect(rows()).toHaveLength(4));
    const only = root().querySelector('[data-server-only="true"]') as HTMLElement;
    expect(only).toHaveAttribute('aria-disabled', 'true');
    expect(only.tagName).not.toBe('BUTTON');
    expect(only).toHaveTextContent('smok95');
    expect(only).toHaveTextContent('웹 유저 없음');
    expect(only).toHaveTextContent('· 계좌 1');
    expect(within(only).getByText('KYOBO119 · 서버에만 있음')).toHaveAttribute('data-tone', 'only');
    fireEvent.click(only);
    expect(root().querySelector('[data-selected="true"]')).toBeNull();
  });

  it('행을 누르면 그 행이 선택된다(편집 시트 자리 — 29-17)', async () => {
    fetchAdminUsersMock.mockResolvedValue(OVERVIEW);
    render(<UsersClient />);
    await waitFor(() => expect(rows()).toHaveLength(4));
    fireEvent.click(rowOf('kim.trader@example.invalid'));
    expect(rowOf('kim.trader@example.invalid')).toHaveAttribute('data-selected', 'true');
    expect(root().querySelectorAll('[data-selected="true"]')).toHaveLength(1);
  });

  it('로딩 중 스켈레톤', async () => {
    let resolve!: (v: AdminUsersOverview) => void;
    fetchAdminUsersMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<UsersClient />);
    expect(root().querySelector('[data-slot="admin-users-loading"]')).not.toBeNull();
    expect(rows()).toHaveLength(0);
    resolve(OVERVIEW);
    await waitFor(() => expect(root().querySelector('[data-slot="admin-users-loading"]')).toBeNull());
  });

  it('403 → 「관리자만 사용할 수 있어요.」 한 줄 · 다시 시도 없음', async () => {
    fetchAdminUsersMock.mockRejectedValue(new ApiClientError({ code: 'FORBIDDEN', message: 'x', status: 403 }));
    render(<UsersClient />);
    const err = await waitFor(() => {
      const e = root().querySelector('[data-slot="admin-users-error"]');
      expect(e).not.toBeNull();
      return e as HTMLElement;
    });
    expect(err).toHaveTextContent('관리자만 사용할 수 있어요.');
    expect(within(err).queryByRole('button')).toBeNull();
  });

  it('그 밖 오류 → 「불러오지 못했어요」 + 다시 시도 → 재조회 성공', async () => {
    fetchAdminUsersMock
      .mockRejectedValueOnce(new ApiClientError({ code: 'DB_ERROR', message: 'x', status: 500 }))
      .mockResolvedValueOnce(OVERVIEW);
    render(<UsersClient />);
    const retry = await screen.findByRole('button', { name: '다시 시도' });
    expect(root()).toHaveTextContent('불러오지 못했어요');
    fireEvent.click(retry);
    await waitFor(() => expect(rows()).toHaveLength(4));
    expect(fetchAdminUsersMock).toHaveBeenCalledTimes(2);
  });
});
