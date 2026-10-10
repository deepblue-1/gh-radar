import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminServersOverview, AdminServerView } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * Phase 29 (29-18) — `/admin/servers` 증권사 그룹 카드 (D-17 · 목업 A `cardsA()` · `chips()` · `roleChips()`).
 *
 * 잠그는 것: 섹션 순(KB → 교보) · 섹션 문장 · 카드 순 · 상태 칩(상태 모름 · 연결 끊김 · 저널 꺼짐 · admin 재접속 중 ·
 * 유저 N) · 역할 칩 · 「주문 서버」 라디오 배타 범위(증권사 안) · 꺼진 서버 라디오 비활성 · 주문 서버 즉시 전환
 * (PUT 1건 → 재조회 → 칩 이동) · 실패 되돌림 + 카드 한 줄 · 목업 하단 안내.
 * API 는 `@/lib/admin-api` 목이다(Express 계약은 admin-api.test.ts 가 잠근다). 주소는 TEST-NET(D-27).
 */

const fetchAdminServersMock = vi.fn();
const setOrderServerMock = vi.fn();
const setQuotePrimaryMock = vi.fn();
const patchAdminServerMock = vi.fn();
const upsertAdminServerMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  fetchAdminServers: () => fetchAdminServersMock(),
  setOrderServer: (key: string) => setOrderServerMock(key),
  setQuotePrimary: (key: string) => setQuotePrimaryMock(key),
  patchAdminServer: (key: string, body: unknown) => patchAdminServerMock(key, body),
  upsertAdminServer: (body: unknown) => upsertAdminServerMock(body),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

import { ServersClient } from '../servers-client';

function srv(key: string, broker: 'KB' | 'KYOBO', host: string, over: Partial<AdminServerView> = {}): AdminServerView {
  return {
    key,
    broker,
    host,
    port: 9100,
    enabled: true,
    isOrderServer: false,
    isQuotePrimary: false,
    sortOrder: 0,
    userCount: 0,
    status: { conn: 'ok', journal: 'ok', admin: 'ok', quote: null },
    ...over,
  };
}

function overview(): AdminServersOverview {
  return {
    groups: [
      {
        broker: 'KB',
        servers: [
          srv('KB120', 'KB', '192.0.2.120', {
            isOrderServer: true,
            isQuotePrimary: true,
            sortOrder: 1,
            userCount: 3,
            status: { conn: 'ok', journal: 'ok', admin: 'ok', quote: 'live' },
          }),
          srv('KB121', 'KB', '192.0.2.121', {
            sortOrder: 2,
            userCount: 2,
            status: { conn: 'ok', journal: 'ok', admin: 'connecting', quote: null },
          }),
        ],
      },
      {
        broker: 'KYOBO',
        servers: [
          srv('KYOBO119', 'KYOBO', '198.51.100.119', { isOrderServer: true, sortOrder: 1, userCount: 2, status: null }),
          srv('KYOBO127', 'KYOBO', '198.51.100.127', {
            enabled: false,
            sortOrder: 2,
            userCount: 0,
            status: { conn: 'down', journal: 'off', admin: 'off', quote: null },
          }),
        ],
      },
    ],
  };
}

/** KB121 이 주문 서버가 된 재조회 응답. */
function afterOrderSwitch(): AdminServersOverview {
  const o = overview();
  for (const s of o.groups[0].servers) s.isOrderServer = s.key === 'KB121';
  return o;
}

const root = () => document.querySelector('[data-slot="admin-servers"]') as HTMLElement;
const card = (key: string) => root().querySelector(`[data-slot="server-card"][data-key="${key}"]`) as HTMLElement;
const chipTexts = (key: string) =>
  Array.from(card(key).querySelectorAll('[data-slot="server-status-chip"]')).map((c) => c.textContent);
const roleChips = (key: string) =>
  Array.from(card(key).querySelectorAll('[data-slot="server-role-chip"]')).map((c) => c.textContent);
const orderRadio = (key: string) => screen.getByRole('radio', { name: `${key} 주문 서버` }) as HTMLInputElement;

async function renderReady() {
  render(<ServersClient />);
  await waitFor(() => expect(root().querySelectorAll('[data-slot="server-card"]')).toHaveLength(4));
}

beforeEach(() => {
  fetchAdminServersMock.mockReset();
  setOrderServerMock.mockReset();
  setQuotePrimaryMock.mockReset();
  patchAdminServerMock.mockReset();
  upsertAdminServerMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ServersClient — 증권사 그룹 카드 (D-17 · 목업 A)', () => {
  it('헤더 · 섹션 「KB」 → 「교보」 · 섹션 문장 · 카드 sort 순 · host:port · 하단 안내', async () => {
    fetchAdminServersMock.mockResolvedValue(overview());
    await renderReady();

    expect(screen.getByRole('heading', { level: 1, name: '서버' })).toBeInTheDocument();
    expect(root()).toHaveTextContent('레지스트리 4대 · 주문/시세 서버');
    expect(screen.getByRole('button', { name: '+ 서버' })).toBeInTheDocument();

    const sections = Array.from(root().querySelectorAll('[data-slot="admin-servers-group"]')) as HTMLElement[];
    expect(sections.map((s) => within(s).getByRole('heading', { level: 2 }).textContent)).toEqual(['KB', '교보']);
    for (const s of sections) expect(s).toHaveTextContent('주문 서버는 증권사 안에서 1대');
    expect(
      sections.map((s) => Array.from(s.querySelectorAll('[data-slot="server-card"]')).map((c) => c.getAttribute('data-key'))),
    ).toEqual([
      ['KB120', 'KB121'],
      ['KYOBO119', 'KYOBO127'],
    ]);

    expect(card('KB121').querySelector('[data-slot="server-addr"]')).toHaveTextContent('192.0.2.121:9100');
    expect(root()).toHaveTextContent(
      '시세 주 서버는 증권사와 무관하게 전체 1대. 바꾸면 relay 가 예전 연결을 닫고 새 서버에 붙는다(전환 중 시세 배지 적색).',
    );
    expect(root()).toHaveTextContent('주문 서버를 바꾸면 열린 세션은 그대로, 새 로그인부터 적용.');
  });

  it('상태 칩 — 정상 · admin 재접속 중 · relay 미응답 「상태 모름」 한 칩 · 연결 끊김 · 저널/admin 꺼짐 · 유저 N', async () => {
    fetchAdminServersMock.mockResolvedValue(overview());
    await renderReady();

    expect(chipTexts('KB120')).toEqual(['연결', '저널', 'admin', '유저 3']);
    expect(chipTexts('KB121')).toEqual(['연결', '저널', 'admin 재접속 중', '유저 2']);
    expect(chipTexts('KYOBO119')).toEqual(['상태 모름', '유저 2']);
    expect(chipTexts('KYOBO127')).toEqual(['연결 끊김', '저널 꺼짐', 'admin 꺼짐', '유저 0']);

    const tone = (key: string, axis: string) =>
      card(key).querySelector(`[data-axis="${axis}"]`)?.getAttribute('data-tone');
    expect(tone('KB120', 'conn')).toBe('ok');
    expect(tone('KB121', 'admin')).toBe('warn');
    expect(tone('KYOBO127', 'conn')).toBe('err');
    expect(tone('KYOBO127', 'journal')).toBe('dim');
    expect(tone('KYOBO119', 'unknown')).toBe('dim');
  });

  it('역할 칩 · 「주문 서버」 라디오는 증권사 안에서만 배타 · 꺼진 서버(KYOBO127) 라디오 비활성', async () => {
    fetchAdminServersMock.mockResolvedValue(overview());
    await renderReady();

    expect(roleChips('KB120')).toEqual(['주문 서버', '시세 주 서버']);
    expect(roleChips('KB121')).toEqual([]);
    expect(roleChips('KYOBO119')).toEqual(['주문 서버']);

    // 주문 라디오 — 증권사마다 하나씩 켜져 있다(KB120 · KYOBO119 동시)
    expect(orderRadio('KB120')).toBeChecked();
    expect(orderRadio('KYOBO119')).toBeChecked();
    expect(orderRadio('KB121')).not.toBeChecked();
    expect(orderRadio('KB120').name).not.toBe(orderRadio('KYOBO119').name);
    expect(orderRadio('KB120').name).toBe(orderRadio('KB121').name);

    // 시세 라디오 — 전체 1개(KB120)
    expect(screen.getByRole('radio', { name: 'KB120 시세 주 서버' })).toBeChecked();
    expect(screen.getAllByRole('radio', { name: /시세 주 서버$/, checked: true })).toHaveLength(1);

    // 꺼진 서버
    expect(orderRadio('KYOBO127')).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'KYOBO127 시세 주 서버' })).toBeDisabled();
    expect(orderRadio('KB121')).toBeEnabled();
  });

  it('KB121 주문 라디오 → setOrderServer("KB121") 1회 → 재조회 → 「주문 서버」 칩이 KB121 로', async () => {
    fetchAdminServersMock.mockResolvedValueOnce(overview()).mockResolvedValueOnce(afterOrderSwitch());
    setOrderServerMock.mockResolvedValue({ ok: true, relayNotified: true });
    await renderReady();

    fireEvent.click(orderRadio('KB121'));
    // 응답 전에도 라디오는 누른 값(의도)을 그린다 — 같은 증권사의 KB120 은 꺼진다 · 교보는 그대로
    expect(orderRadio('KB121')).toBeChecked();
    expect(orderRadio('KB120')).not.toBeChecked();
    expect(orderRadio('KYOBO119')).toBeChecked();

    await waitFor(() => expect(roleChips('KB121')).toEqual(['주문 서버']));
    expect(roleChips('KB120')).toEqual(['시세 주 서버']);
    expect(setOrderServerMock).toHaveBeenCalledTimes(1);
    expect(setOrderServerMock).toHaveBeenCalledWith('KB121');
    expect(fetchAdminServersMock).toHaveBeenCalledTimes(2);
    expect(root().querySelector('[data-slot="server-card-error"]')).toBeNull();
  });

  it('주문 서버 전환 실패 → 라디오는 원래 KB120 · 누른 카드에 한 줄(서버 message 원문) · 재조회 없음', async () => {
    fetchAdminServersMock.mockResolvedValue(overview());
    setOrderServerMock.mockRejectedValue(
      new ApiClientError({ code: 'SERVER_DISABLED', message: '꺼진 서버는 주문 서버로 고를 수 없어요', status: 409 }),
    );
    await renderReady();

    fireEvent.click(orderRadio('KB121'));
    const line = await waitFor(() => {
      const el = card('KB121').querySelector('[data-slot="server-card-error"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(line).toHaveTextContent('꺼진 서버는 주문 서버로 고를 수 없어요');
    expect(line).toHaveAttribute('role', 'alert');
    expect(orderRadio('KB120')).toBeChecked();
    expect(orderRadio('KB121')).not.toBeChecked();
    expect(card('KB120').querySelector('[data-slot="server-card-error"]')).toBeNull();
    expect(fetchAdminServersMock).toHaveBeenCalledTimes(1);
  });

  it('첫 조회 403 → 「관리자만 사용할 수 있어요.」 · 그 밖 오류 → 다시 시도', async () => {
    fetchAdminServersMock.mockRejectedValueOnce(new ApiClientError({ code: 'FORBIDDEN', message: 'x', status: 403 }));
    const { unmount } = render(<ServersClient />);
    expect(await screen.findByText('관리자만 사용할 수 있어요.')).toBeInTheDocument();
    unmount();

    fetchAdminServersMock.mockRejectedValueOnce(new ApiClientError({ code: 'DB_ERROR', message: 'x', status: 500 }));
    fetchAdminServersMock.mockResolvedValueOnce(overview());
    render(<ServersClient />);
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(root().querySelectorAll('[data-slot="server-card"]')).toHaveLength(4));
  });
});

// ── Task 2 — 시세 주 서버 전환 · 사용 토글 · 편집 시트 진입 ─────────────────────────

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const quoteRadio = (key: string) => screen.getByRole('radio', { name: `${key} 시세 주 서버` }) as HTMLInputElement;
const toggle = (key: string) => screen.getByRole('switch', { name: `${key} 사용` });
const cardError = (key: string) => card(key).querySelector('[data-slot="server-card-error"]');

/** KYOBO119 가 시세 주 서버가 된 재조회 응답. */
function afterQuoteSwitch(): AdminServersOverview {
  const o = overview();
  for (const g of o.groups) for (const s of g.servers) s.isQuotePrimary = s.key === 'KYOBO119';
  return o;
}

describe('ServersClient — 시세 주 서버 전환 (D-11)', () => {
  it('KYOBO119 시세 라디오 → setQuotePrimary 1회 · 응답 전 그 카드 「전환 중」 · 시세 라디오 전부 비활성 → 성공 → 재조회 · 칩 이동', async () => {
    fetchAdminServersMock.mockResolvedValueOnce(overview()).mockResolvedValueOnce(afterQuoteSwitch());
    const d = deferred<unknown>();
    setQuotePrimaryMock.mockReturnValue(d.promise);
    await renderReady();

    fireEvent.click(quoteRadio('KYOBO119'));
    expect(setQuotePrimaryMock).toHaveBeenCalledTimes(1);
    expect(setQuotePrimaryMock).toHaveBeenCalledWith('KYOBO119');
    expect(card('KYOBO119').querySelector('[data-slot="server-switching"]')).toHaveTextContent('전환 중');
    expect(card('KYOBO119')).toHaveAttribute('aria-busy', 'true');
    expect(card('KB120').querySelector('[data-slot="server-switching"]')).toBeNull();
    for (const key of ['KB120', 'KB121', 'KYOBO119', 'KYOBO127']) expect(quoteRadio(key)).toBeDisabled();
    // 주문 라디오는 시세 전환과 무관하다
    expect(orderRadio('KB121')).toBeEnabled();

    d.resolve({ ok: true });
    await waitFor(() => expect(roleChips('KYOBO119')).toEqual(['주문 서버', '시세 주 서버']));
    expect(roleChips('KB120')).toEqual(['주문 서버']);
    expect(quoteRadio('KYOBO119')).toBeChecked();
    expect(quoteRadio('KB121')).toBeEnabled();
    expect(root().querySelector('[data-slot="server-switching"]')).toBeNull();
    expect(fetchAdminServersMock).toHaveBeenCalledTimes(2);
  });

  it('409(새 서버 로그인 실패) → 라디오는 KB120 그대로 · KYOBO119 카드 한 줄에 relay message 원문 · 토스트 없음', async () => {
    fetchAdminServersMock.mockResolvedValue(overview());
    setQuotePrimaryMock.mockRejectedValue(
      new ApiClientError({ code: 'HTTP_409', message: '새 서버 로그인 실패 — KB120 으로 되돌림', status: 409 }),
    );
    await renderReady();

    fireEvent.click(quoteRadio('KYOBO119'));
    await waitFor(() => expect(cardError('KYOBO119')).not.toBeNull());
    expect(cardError('KYOBO119')).toHaveTextContent('새 서버 로그인 실패 — KB120 으로 되돌림');
    expect(quoteRadio('KB120')).toBeChecked();
    expect(quoteRadio('KYOBO119')).not.toBeChecked();
    expect(quoteRadio('KYOBO119')).toBeEnabled();
    expect(root().querySelector('[data-slot="server-switching"]')).toBeNull();
    expect(roleChips('KB120')).toEqual(['주문 서버', '시세 주 서버']);
    expect(fetchAdminServersMock).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-sonner-toast]')).toBeNull();
  });
});

// IN-03 — 즉시 저장 필드는 성공 뒤 다음 재조회 결과가 오면 누른 값을 놓는다. relay 보정(시세 주 서버 restore) · 다른 Admin
// 변경이 화면에 보인다. 재조회 전(성공 직후)에는 누른 값을 유지한다(깜빡임 없음).
describe('ServersClient — 성공 뒤 재조회 값이 정본 (IN-03 · releaseOn)', () => {
  it('시세 주 서버 KB120 → KYOBO119 성공 · 재조회 전엔 KYOBO119 유지 · 재조회가 KB120(relay 되돌림)이면 KB120', async () => {
    const reloadD = deferred<AdminServersOverview>();
    fetchAdminServersMock.mockResolvedValueOnce(overview()).mockReturnValueOnce(reloadD.promise);
    setQuotePrimaryMock.mockResolvedValue({ ok: true });
    await renderReady();

    fireEvent.click(quoteRadio('KYOBO119'));
    await waitFor(() => expect(fetchAdminServersMock).toHaveBeenCalledTimes(2));
    // 성공 직후 · 재조회 전 — 누른 값 유지(깜빡임 없음)
    expect(quoteRadio('KYOBO119')).toBeChecked();
    expect(quoteRadio('KB120')).not.toBeChecked();

    // 재조회 = relay 가 KB120 으로 되돌린 상태
    await act(async () => {
      reloadD.resolve(overview());
    });
    await waitFor(() => expect(quoteRadio('KB120')).toBeChecked());
    expect(quoteRadio('KYOBO119')).not.toBeChecked();
    expect(roleChips('KB120')).toEqual(['주문 서버', '시세 주 서버']);
  });

  it('주문 서버 KB120 → KB121 성공 · 재조회가 KB120(다른 Admin 이 되돌림)이면 라디오가 KB120', async () => {
    const reloadD = deferred<AdminServersOverview>();
    fetchAdminServersMock.mockResolvedValueOnce(overview()).mockReturnValueOnce(reloadD.promise);
    setOrderServerMock.mockResolvedValue({ ok: true });
    await renderReady();

    fireEvent.click(orderRadio('KB121'));
    await waitFor(() => expect(fetchAdminServersMock).toHaveBeenCalledTimes(2));
    expect(orderRadio('KB121')).toBeChecked();

    await act(async () => {
      reloadD.resolve(overview());
    });
    await waitFor(() => expect(orderRadio('KB120')).toBeChecked());
    expect(orderRadio('KB121')).not.toBeChecked();
  });
});

describe('ServersClient — 사용 토글 (D-17)', () => {
  it('주문/시세 서버(KB120 · KYOBO119) 토글은 비활성 · 그 밖은 활성', async () => {
    fetchAdminServersMock.mockResolvedValue(overview());
    await renderReady();

    expect(toggle('KB120')).toBeDisabled();
    expect(toggle('KYOBO119')).toBeDisabled();
    expect(toggle('KB121')).toBeEnabled();
    expect(toggle('KYOBO127')).toBeEnabled();
    expect(toggle('KB121')).toHaveAttribute('aria-checked', 'true');
    expect(toggle('KYOBO127')).toHaveAttribute('aria-checked', 'false');
  });

  it('유저 0 인 서버 끄기 → 확인 없이 PATCH { enabled: false } 1회 → 재조회', async () => {
    const o = overview();
    o.groups[0].servers[1].userCount = 0;
    fetchAdminServersMock.mockResolvedValue(o);
    patchAdminServerMock.mockResolvedValue({ ok: true, relayNotified: true });
    await renderReady();

    fireEvent.click(toggle('KB121'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(patchAdminServerMock).toHaveBeenCalledTimes(1);
    expect(patchAdminServerMock).toHaveBeenCalledWith('KB121', { enabled: false });
    await waitFor(() => expect(fetchAdminServersMock).toHaveBeenCalledTimes(2));
  });

  it('꺼진 서버 켜기 → 확인 없이 PATCH { enabled: true } 1회', async () => {
    fetchAdminServersMock.mockResolvedValue(overview());
    patchAdminServerMock.mockResolvedValue({ ok: true, relayNotified: true });
    await renderReady();

    fireEvent.click(toggle('KYOBO127'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(patchAdminServerMock).toHaveBeenCalledWith('KYOBO127', { enabled: true });
    await waitFor(() => expect(fetchAdminServersMock).toHaveBeenCalledTimes(2));
  });

  it('유저 2 인 서버 끄기 → 확인 다이얼로그 「운영 중 서버에 유저 2명 — 끄면 저널 · admin 연결을 내린다」 · 취소 0회 · 확인 1회', async () => {
    fetchAdminServersMock.mockResolvedValue(overview());
    patchAdminServerMock.mockResolvedValue({ ok: true, relayNotified: true });
    await renderReady();

    fireEvent.click(toggle('KB121'));
    const dlg = screen.getByRole('alertdialog');
    expect(dlg).toHaveTextContent('운영 중 서버에 유저 2명 — 끄면 저널 · admin 연결을 내린다');
    fireEvent.click(within(dlg).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(patchAdminServerMock).not.toHaveBeenCalled();
    expect(toggle('KB121')).toHaveAttribute('aria-checked', 'true');
    // 다이얼로그 조작이 카드 탭(편집 시트)으로 새지 않는다
    expect(document.querySelector('[data-slot="server-sheet"]')).toBeNull();

    fireEvent.click(toggle('KB121'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '끄기' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(patchAdminServerMock).toHaveBeenCalledTimes(1);
    expect(patchAdminServerMock).toHaveBeenCalledWith('KB121', { enabled: false });
    expect(document.querySelector('[data-slot="server-sheet"]')).toBeNull();
  });

  it('409 SERVER_IN_USE → 토글 원복 + 카드 한 줄(서버 message)', async () => {
    const o = overview();
    o.groups[0].servers[1].userCount = 0;
    fetchAdminServersMock.mockResolvedValue(o);
    patchAdminServerMock.mockRejectedValue(
      new ApiClientError({ code: 'SERVER_IN_USE', message: '주문 서버 · 시세 주 서버는 끌 수 없어요', status: 409 }),
    );
    await renderReady();

    fireEvent.click(toggle('KB121'));
    await waitFor(() => expect(cardError('KB121')).not.toBeNull());
    expect(cardError('KB121')).toHaveTextContent('주문 서버 · 시세 주 서버는 끌 수 없어요');
    expect(toggle('KB121')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('ServersClient — 편집 · 추가 시트 진입', () => {
  it('카드 탭(라디오 · 토글 밖) → 편집 시트 · 라디오/토글 탭은 시트를 열지 않음 · host 수정 → 「저장」 → PATCH { host, port } 1회 → 닫힘 · 재조회', async () => {
    fetchAdminServersMock.mockResolvedValue(overview());
    patchAdminServerMock.mockResolvedValue({ ok: true, relayNotified: true });
    setOrderServerMock.mockReturnValue(new Promise(() => {}));
    await renderReady();

    fireEvent.click(card('KB121').querySelector('[data-slot="server-order-radio"]')!);
    expect(document.querySelector('[data-slot="server-sheet"]')).toBeNull();

    fireEvent.click(card('KB121').querySelector('[data-slot="server-addr"]')!);
    const sheet = await waitFor(() => {
      const el = document.querySelector('[data-slot="server-sheet"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const dialog = sheet.closest('[role="dialog"]') as HTMLElement;
    expect(within(dialog).getByRole('heading', { name: 'KB121' })).toBeInTheDocument();
    const host = within(dialog).getByRole('textbox', { name: '주소' });
    fireEvent.change(host, { target: { value: '192.0.2.221' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

    await waitFor(() => expect(document.querySelector('[data-slot="server-sheet"]')).toBeNull());
    expect(patchAdminServerMock).toHaveBeenCalledTimes(1);
    expect(patchAdminServerMock).toHaveBeenCalledWith('KB121', { host: '192.0.2.221', port: 9100 });
    await waitFor(() => expect(fetchAdminServersMock).toHaveBeenCalledTimes(2));
  });

  it('「+ 서버」 → 생성 시트(제목 「서버 추가」)', async () => {
    fetchAdminServersMock.mockResolvedValue(overview());
    await renderReady();

    const create = screen.getByRole('button', { name: '+ 서버' });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    const sheet = await waitFor(() => {
      const el = document.querySelector('[data-slot="server-sheet"][data-mode="create"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(within(sheet.closest('[role="dialog"]') as HTMLElement).getByRole('heading', { name: '서버 추가' })).toBeInTheDocument();
  });
});
