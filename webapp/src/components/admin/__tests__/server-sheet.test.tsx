import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminServerView } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * Phase 29 (29-18) — 서버 편집 · 추가 시트 (D-17 · 목업 A 「카드 탭 → 편집 시트(키 · 증권사 · 주소 · 포트)」).
 *
 * 잠그는 것: 편집 = 키 · 증권사 읽기 전용 · host · port 만 입력 · 「저장」 폼 제출 1회(`patchAdminServer(key, { host, port })`) ·
 * 바뀐 것 없으면 비활성 · 추가 = 키 · 증권사 세그먼트 · host · port → `upsertAdminServer` 1회 · 검증(키 형식 ·
 * 증권사 접두 일치 · port 1~65535 · host 공백 금지 — 버튼 비활성 + 칸 오류) · 서버 거부(409) 는 시트 안 한 줄.
 * 주소는 TEST-NET(D-27).
 */

const patchAdminServerMock = vi.fn();
const upsertAdminServerMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  patchAdminServer: (key: string, body: unknown) => patchAdminServerMock(key, body),
  upsertAdminServer: (body: unknown) => upsertAdminServerMock(body),
}));

import { ServerSheet } from '../server-sheet';

const KB121: AdminServerView = {
  key: 'KB121',
  broker: 'KB',
  host: '192.0.2.121',
  port: 9100,
  enabled: true,
  isOrderServer: false,
  isQuotePrimary: false,
  sortOrder: 2,
  userCount: 2,
  status: null,
};

const dialog = () => screen.getByRole('dialog');
const field = (name: string) => within(dialog()).getByRole('textbox', { name });
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const errorOf = (slot: string) => dialog().querySelector(`[data-slot="server-sheet-error-${slot}"]`);

beforeEach(() => {
  patchAdminServerMock.mockReset();
  upsertAdminServerMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ServerSheet — 편집', () => {
  it('키 · 증권사는 읽기 전용 · host · port 만 입력 · 바뀐 것 없으면 「저장」 비활성', () => {
    render(<ServerSheet mode="edit" server={KB121} onSaved={() => {}} onClose={() => {}} />);

    expect(within(dialog()).getByRole('heading', { name: 'KB121' })).toBeInTheDocument();
    expect(within(dialog()).queryByRole('textbox', { name: '키' })).toBeNull();
    expect(within(dialog()).queryByRole('group', { name: '증권사' })).toBeNull();
    expect(dialog().querySelector('[data-slot="server-sheet-key"]')).toHaveTextContent('KB121');
    expect(dialog().querySelector('[data-slot="server-sheet-broker"]')).toHaveTextContent('KB');
    expect(field('주소')).toHaveValue('192.0.2.121');
    expect(field('포트')).toHaveValue('9100');
    expect(within(dialog()).getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('host · port 수정 → 「저장」 → patchAdminServer(key, { host, port }) 1회 · onSaved · onClose', async () => {
    patchAdminServerMock.mockResolvedValue({ ok: true, relayNotified: true });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<ServerSheet mode="edit" server={KB121} onSaved={onSaved} onClose={onClose} />);

    type('주소', ' 192.0.2.221 ');
    type('포트', '9101');
    fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(patchAdminServerMock).toHaveBeenCalledTimes(1);
    expect(patchAdminServerMock).toHaveBeenCalledWith('KB121', { host: '192.0.2.221', port: 9101 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('host 공백 · port 0 → 칸 오류 + 「저장」 비활성 · 요청 없음', () => {
    render(<ServerSheet mode="edit" server={KB121} onSaved={() => {}} onClose={() => {}} />);

    type('주소', '192.0.2 .221');
    expect(errorOf('host')).toHaveTextContent('주소에 공백을 넣을 수 없어요');
    type('주소', '192.0.2.221');
    type('포트', '0');
    expect(errorOf('port')).toHaveTextContent('포트는 1~65535 예요');
    const save = within(dialog()).getByRole('button', { name: '저장' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(patchAdminServerMock).not.toHaveBeenCalled();
  });
});

describe('ServerSheet — 추가', () => {
  it('키 KB122 · 증권사 KB · host · port 9100 → 「추가」 → upsertAdminServer 1회(사용 꺼짐은 DB 기본 — enabled 를 보내지 않음)', async () => {
    upsertAdminServerMock.mockResolvedValue({ ok: true, relayNotified: true });
    const onSaved = vi.fn();
    render(<ServerSheet mode="create" onSaved={onSaved} onClose={() => {}} />);

    expect(within(dialog()).getByRole('heading', { name: '서버 추가' })).toBeInTheDocument();
    const add = within(dialog()).getByRole('button', { name: '추가' });
    expect(add).toBeDisabled();

    type('키', 'kb122');
    expect(field('키')).toHaveValue('KB122');
    type('주소', '192.0.2.122');
    type('포트', '9100');
    expect(add).toBeEnabled();
    fireEvent.click(add);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(upsertAdminServerMock).toHaveBeenCalledTimes(1);
    expect(upsertAdminServerMock).toHaveBeenCalledWith({ key: 'KB122', broker: 'KB', host: '192.0.2.122', port: 9100 });
  });

  it('교보 세그먼트 → 키 KYOBO130 → 증권사 KYOBO 로 보냄', async () => {
    upsertAdminServerMock.mockResolvedValue({ ok: true, relayNotified: true });
    render(<ServerSheet mode="create" onSaved={() => {}} onClose={() => {}} />);

    fireEvent.click(within(within(dialog()).getByRole('group', { name: '증권사' })).getByRole('radio', { name: '교보' }));
    type('키', 'KYOBO130');
    type('주소', '198.51.100.130');
    type('포트', '9100');
    fireEvent.click(within(dialog()).getByRole('button', { name: '추가' }));
    await waitFor(() => expect(upsertAdminServerMock).toHaveBeenCalledTimes(1));
    expect(upsertAdminServerMock).toHaveBeenCalledWith({
      key: 'KYOBO130',
      broker: 'KYOBO',
      host: '198.51.100.130',
      port: 9100,
    });
  });

  it('키 KX1 · 증권사 접두 불일치 · port 70000 → 각 칸 오류 + 「추가」 비활성 · 요청 없음', () => {
    render(<ServerSheet mode="create" onSaved={() => {}} onClose={() => {}} />);
    type('주소', '192.0.2.122');

    type('키', 'KX1');
    type('포트', '9100');
    expect(errorOf('key')).toHaveTextContent('키는 KB 또는 KYOBO 뒤에 숫자 1~3자리예요');
    expect(within(dialog()).getByRole('button', { name: '추가' })).toBeDisabled();

    type('키', 'KYOBO5'); // 증권사는 KB(기본)
    expect(errorOf('key')).toBeNull();
    expect(errorOf('broker')).toHaveTextContent('키 접두와 증권사가 달라요');
    expect(within(dialog()).getByRole('button', { name: '추가' })).toBeDisabled();

    type('키', 'KB5');
    type('포트', '70000');
    expect(errorOf('broker')).toBeNull();
    expect(errorOf('port')).toHaveTextContent('포트는 1~65535 예요');
    expect(field('포트')).toHaveAttribute('aria-invalid', 'true');
    const add = within(dialog()).getByRole('button', { name: '추가' });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(upsertAdminServerMock).not.toHaveBeenCalled();
  });

  it('409 SERVER_EXISTS → 시트 안 한 줄(서버 message) · 시트 유지', async () => {
    upsertAdminServerMock.mockRejectedValue(
      new ApiClientError({ code: 'SERVER_EXISTS', message: '이미 있는 서버예요', status: 409 }),
    );
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<ServerSheet mode="create" onSaved={onSaved} onClose={onClose} />);

    type('키', 'KB120');
    type('주소', '192.0.2.120');
    type('포트', '9100');
    fireEvent.click(within(dialog()).getByRole('button', { name: '추가' }));

    const line = await within(dialog()).findByRole('alert');
    expect(line).toHaveTextContent('이미 있는 서버예요');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
