import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminUsersOverview, AdminUserView } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * Phase 29 (29-19) — 「+ 사용자」 생성 시트 (D-16 · D-23 ③ · 목업 A `createSheet()` · `dmaGroup()`).
 *
 * 잠그는 것: trader 를 고르면 「DMA 연결 · 필수」 그룹 · 전부 채워야 버튼 활성 · 버튼 문구가 체크 수를 말한다 ·
 * 제출 = `upsertAdminUser({ email, role, dma })` 1회(정규화 계좌번호 · 레지스트리 순 서버) · 제출 중 비활성 ·
 * 실패면 시트가 남고 한 줄 · 성공하면 생성 시트가 닫히고 재조회 → 그 이메일의 편집 시트가 결과 칩으로 열린다.
 */

const fetchAdminUsersMock = vi.fn();
const upsertAdminUserMock = vi.fn();
const connectAdminDmaMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  fetchAdminUsers: () => fetchAdminUsersMock(),
  upsertAdminUser: (body: unknown) => upsertAdminUserMock(body),
  connectAdminDma: (email: string, dma: unknown) => connectAdminDmaMock(email, dma),
  patchAdminRole: vi.fn(),
  putDmaAccount: vi.fn(),
  removeDmaAccount: vi.fn(),
  changeDmaPassword: vi.fn(),
  reconcileDmaUser: vi.fn(),
  deleteAdminUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

import { UsersClient } from '../users-client';
import { UserCreateSheet } from '../user-create-sheet';
import { UserSheet } from '../user-sheet';

const SERVERS: AdminUsersOverview['servers'] = [
  { key: 'KB120', broker: 'KB', enabled: true },
  { key: 'KB121', broker: 'KB', enabled: true },
  { key: 'KYOBO119', broker: 'KYOBO', enabled: true },
  { key: 'KYOBO127', broker: 'KYOBO', enabled: false },
];

const NEW_EMAIL = 'lee.new@example.invalid';
const BUSY = '미체결 주문 또는 실행 중인 전략이 있어 변경할 수 없습니다';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const sheet = () => screen.getByRole('dialog', { name: '사용자 만들기' });
const submitButton = () => within(sheet()).getByRole('button', { name: /만들기/ });
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(within(sheet()).getByLabelText(label), { target: { value } });
const pick = (name: string) => fireEvent.click(within(sheet()).getByRole('radio', { name }));
const check = (key: string) => fireEvent.click(within(sheet()).getByRole('checkbox', { name: key }));

/** trader + KB 계좌 + KB120 · KB121 — 버튼이 켜지는 최소 입력. */
function fillTrader() {
  type(/gmail/, `  ${NEW_EMAIL} `);
  pick('trader');
  type(/DMA 사용자 id/, 'leenew');
  type('비밀번호', 'pw-1234');
  type('비밀번호 확인', 'pw-1234');
  type('계좌번호', ' 0012345678');
  type('지점', '00123');
  type('트레이더', '000789');
  check('KB121');
  check('KB120');
}

function renderSheet(over: Partial<Parameters<typeof UserCreateSheet>[0]> = {}) {
  const props = {
    servers: SERVERS,
    onCreated: vi.fn(),
    onFailed: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<UserCreateSheet {...props} />);
  return props;
}

beforeEach(() => {
  fetchAdminUsersMock.mockReset();
  upsertAdminUserMock.mockReset();
  connectAdminDmaMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('UserCreateSheet — trader + DMA + 첫 계좌 한 번에 (D-16 트레이서)', () => {
  it('trader 면 「DMA 연결 · 필수」 그룹 — DMA id · 비밀번호 두 칸 · 첫 계좌 · 등록 서버 · 안내 문장', () => {
    renderSheet();
    const s = sheet();
    expect(within(s).getByText('가입 전이면 사전 등록으로 남고, 이미 가입했으면 승인 대기에서 빠진다.')).toBeInTheDocument();
    // 목업 기본 = trader
    expect(within(s).getByRole('radio', { name: 'trader' })).toHaveAttribute('aria-checked', 'true');
    const group = s.querySelector('[data-slot="admin-dma-connect"]') as HTMLElement;
    expect(group).not.toBeNull();
    expect(group).toHaveTextContent('DMA 연결필수');
    expect(group).toHaveTextContent('DMA 사용자 id · 모든 서버 공통');
    expect(group).toHaveTextContent('비밀번호 · 저장 뒤 다시 볼 수 없음');
    expect(group).toHaveTextContent('첫 계좌');
    expect(group).toHaveTextContent('등록 서버');
    expect(group).toHaveTextContent('증권사에 맞는 서버만 고를 수 있다.');
    // 저장 버튼 · 토스트 같은 목업 밖 요소 없음 — 버튼은 하나
    expect(within(s).getAllByRole('button', { name: /만들기/ })).toHaveLength(1);
  });

  it('전부 채워야 버튼이 켜진다 · 문구가 체크한 서버 수를 말한다', () => {
    renderSheet();
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent('사용자 + DMA 유저 만들기 · 서버 0대에 반영');

    type(/gmail/, NEW_EMAIL);
    type(/DMA 사용자 id/, 'leenew');
    type('비밀번호', 'pw-1234');
    type('비밀번호 확인', 'pw-1234');
    type('계좌번호', '12345678');
    type('지점', '00123');
    type('트레이더', '000789');
    expect(submitButton()).toBeDisabled(); // 서버 0

    check('KB120');
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent('사용자 + DMA 유저 만들기 · 서버 1대에 반영');
    check('KB121');
    expect(submitButton()).toHaveTextContent('사용자 + DMA 유저 만들기 · 서버 2대에 반영');

    // 비밀번호 불일치 → 다시 비활성
    type('비밀번호 확인', 'pw-9999');
    expect(submitButton()).toBeDisabled();
  });

  it('제출 = upsertAdminUser 1회 — trim 이메일 · 정규화 계좌번호 · 레지스트리 순 서버 · 이름 없음 · priority 0', async () => {
    const d = deferred<{ ok: true; relayNotified: boolean; results: unknown[] }>();
    upsertAdminUserMock.mockReturnValue(d.promise);
    const props = renderSheet();
    fillTrader();

    fireEvent.click(submitButton());
    expect(upsertAdminUserMock).toHaveBeenCalledTimes(1);
    expect(upsertAdminUserMock).toHaveBeenCalledWith({
      email: NEW_EMAIL,
      role: 'trader',
      dma: {
        dmaUserId: 'leenew',
        password: 'pw-1234',
        account: { broker: 'KB', accountNo: '12345678', name: '', branchNo: '00123', traderId: '000789', priority: 0 },
        servers: ['KB120', 'KB121'],
      },
    });
    // 제출 중 — 버튼 비활성 · 두 번 누르지 않는다
    expect(submitButton()).toBeDisabled();
    fireEvent.click(submitButton());
    expect(upsertAdminUserMock).toHaveBeenCalledTimes(1);

    const results = [
      { server: 'KB120', outcome: 'ok' },
      { server: 'KB121', outcome: 'failed', code: 9, message: BUSY },
    ];
    d.resolve({ ok: true, relayNotified: true, results });
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(NEW_EMAIL, results));
    expect(props.onFailed).not.toHaveBeenCalled();
  });

  it('실패(502) — 시트가 남고 하단 한 줄 · 입력은 그대로 · 버튼 다시 활성 · onFailed(재조회)', async () => {
    upsertAdminUserMock.mockRejectedValue(new ApiClientError({ code: 'RELAY_FAILED', message: 'relay 에 닿지 못했어요', status: 502 }));
    const props = renderSheet();
    fillTrader();
    fireEvent.click(submitButton());

    const line = await within(sheet()).findByRole('alert');
    expect(line).toHaveTextContent('만들지 못했어요 · relay 에 닿지 못했어요');
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(props.onFailed).toHaveBeenCalledTimes(1);
    expect(within(sheet()).getByLabelText(/DMA 사용자 id/)).toHaveValue('leenew');
    expect(submitButton()).toBeEnabled();
  });
});

describe('UsersClient 「+ 사용자」 → 생성 → 편집 시트 결과 칩', () => {
  const KIM: AdminUserView = {
    email: 'kim.trader@example.invalid',
    role: 'trader',
    dmaUserId: 'kimtr',
    signedUp: true,
    accountCount: 0,
    servers: [],
    accounts: [],
  };
  const BEFORE: AdminUsersOverview = { users: [KIM], pending: [], serverOnly: [], servers: SERVERS };
  const LEE: AdminUserView = {
    email: NEW_EMAIL,
    role: 'trader',
    dmaUserId: 'leenew',
    signedUp: false,
    accountCount: 1,
    servers: [
      { serverKey: 'KB120', tone: 'warn', message: null },
      { serverKey: 'KB121', tone: 'warn', message: null },
    ],
    accounts: [
      {
        broker: 'KB',
        accountNo: '12345678',
        name: '',
        branchNo: '00123',
        traderId: '000789',
        priority: 0,
        servers: [
          { serverKey: 'KB120', tone: 'warn', message: null, state: 'active' },
          { serverKey: 'KB121', tone: 'warn', message: null, state: 'active' },
        ],
        serverOnlyOn: [],
      },
    ],
  };
  const AFTER: AdminUsersOverview = { ...BEFORE, users: [KIM, LEE] };

  it('성공 → 생성 시트 닫힘 · 재조회 1회 · 그 이메일 편집 시트 · KB120 반영됨 · KB121 실패 · BUSY(원문 title)', async () => {
    fetchAdminUsersMock.mockResolvedValueOnce(BEFORE).mockResolvedValueOnce(AFTER);
    upsertAdminUserMock.mockResolvedValue({
      ok: true,
      relayNotified: true,
      results: [
        { server: 'KB120', outcome: 'ok' },
        { server: 'KB121', outcome: 'failed', code: 9, message: BUSY },
      ],
    });
    render(<UsersClient />);

    const create = await screen.findByRole('button', { name: '+ 사용자' });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(sheet()).toBeInTheDocument();
    fillTrader();
    fireEvent.click(submitButton());

    const edit = await screen.findByRole('dialog', { name: NEW_EMAIL });
    expect(screen.queryByRole('dialog', { name: '사용자 만들기' })).toBeNull();
    expect(fetchAdminUsersMock).toHaveBeenCalledTimes(2);
    expect(upsertAdminUserMock).toHaveBeenCalledTimes(1);

    const pill = (key: string) =>
      edit.querySelector(`[data-slot="admin-server-toggle"][data-server="${key}"] [data-slot="reflect-chip"]`) as HTMLElement;
    await waitFor(() => expect(pill('KB120')).toHaveTextContent('반영됨'));
    expect(pill('KB121')).toHaveTextContent('실패 · BUSY');
    expect(pill('KB121')).toHaveAttribute('title', BUSY);
    expect(within(edit).getByText(`KB121 실패 · BUSY: ${BUSY} — 정리 뒤 「다시 반영」`)).toBeInTheDocument();
  });

  it('목록을 읽기 전에는 「+ 사용자」 비활성 (등록 서버 후보가 없다)', () => {
    fetchAdminUsersMock.mockReturnValue(new Promise(() => {}));
    render(<UsersClient />);
    expect(screen.getByRole('button', { name: '+ 사용자' })).toBeDisabled();
  });
});

describe('UserCreateSheet — viewer · 409 (D-16 · D-21)', () => {
  it('viewer — DMA 그룹 없음 · 안내(D-21 「테마」) · 버튼 「사용자 만들기」 · 바디에 dma 없음', async () => {
    upsertAdminUserMock.mockResolvedValue({ ok: true, relayNotified: true });
    const props = renderSheet();
    pick('viewer');
    expect(sheet().querySelector('[data-slot="admin-dma-connect"]')).toBeNull();
    expect(sheet()).toHaveTextContent(
      'viewer 는 스캐너 · 뉴스 · 테마만 보고 DMA 연결이 없다. 나중에 trader 로 올리면 편집 시트에서 DMA 를 연결한다.',
    );
    expect(submitButton()).toHaveTextContent(/^사용자 만들기$/);
    expect(submitButton()).toBeDisabled(); // gmail 없음
    type(/gmail/, NEW_EMAIL);
    expect(submitButton()).toBeEnabled();

    fireEvent.click(submitButton());
    expect(upsertAdminUserMock).toHaveBeenCalledTimes(1);
    expect(upsertAdminUserMock).toHaveBeenCalledWith({ email: NEW_EMAIL, role: 'viewer' });
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(NEW_EMAIL, null));
  });

  it('viewer → trader 로 되돌리면 DMA 그룹이 다시 펼쳐지고 입력은 남아 있다', () => {
    renderSheet();
    type(/DMA 사용자 id/, 'leenew');
    pick('viewer');
    pick('admin');
    expect(within(sheet()).getByLabelText(/DMA 사용자 id/)).toHaveValue('leenew');
    expect(submitButton()).toHaveTextContent('사용자 + DMA 유저 만들기 · 서버 0대에 반영');
  });

  it('409 DMA_USER_EXISTS → DMA id 칸 아래 「이미 있는 DMA id 예요」 · 하단 한 줄 없음 · id 를 고치면 사라진다', async () => {
    upsertAdminUserMock.mockRejectedValue(
      new ApiClientError({ code: 'DMA_USER_EXISTS', message: 'DMA user exists', status: 409 }),
    );
    const props = renderSheet();
    fillTrader();
    fireEvent.click(submitButton());

    const idInput = within(sheet()).getByLabelText(/DMA 사용자 id/);
    await waitFor(() => expect(idInput).toHaveAttribute('aria-invalid', 'true'));
    const alerts = within(sheet()).getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('이미 있는 DMA id 예요');
    expect(sheet().querySelector('[data-slot="admin-user-create-error"]')).toBeNull();
    expect(props.onFailed).toHaveBeenCalledTimes(1);

    type(/DMA 사용자 id/, 'leenew2');
    expect(within(sheet()).queryAllByRole('alert')).toHaveLength(0);
    expect(submitButton()).toBeEnabled();
  });
});

describe('UserSheet — DMA 연결 없는 trader/admin 의 「DMA 연결」 (D-16)', () => {
  const NODMA: AdminUserView = {
    email: 'choi.trader@example.invalid',
    role: 'trader',
    dmaUserId: null,
    signedUp: true,
    accountCount: 0,
    servers: [],
    accounts: [],
  };

  function renderEdit(user: AdminUserView) {
    const props = { onChanged: vi.fn(), onClose: vi.fn() };
    render(<UserSheet user={user} servers={SERVERS} {...props} />);
    return props;
  }
  const edit = () => screen.getByRole('dialog', { name: NODMA.email });
  const connectButton = () => within(edit()).getByRole('button', { name: /DMA 유저 \+ 첫 계좌 만들기/ });
  const fill = () => {
    const g = edit().querySelector('[data-slot="admin-dma-connect"]') as HTMLElement;
    const t = (label: string | RegExp, v: string) => fireEvent.change(within(g).getByLabelText(label), { target: { value: v } });
    fireEvent.click(within(g).getByRole('radio', { name: '교보' }));
    t(/DMA 사용자 id/, 'choitr');
    t('비밀번호', 'pw-1');
    t('비밀번호 확인', 'pw-1');
    t('계좌번호', '0098765432');
    fireEvent.click(within(g).getByRole('checkbox', { name: 'KYOBO119' }));
  };

  it('trader · DMA 없음 → 「DMA 연결」 그룹 + 버튼(서버 수) → connectAdminDma 1회 → 결과 칩 · 재조회', async () => {
    connectAdminDmaMock.mockResolvedValue({ results: [{ server: 'KYOBO119', outcome: 'ok' }], relayNotified: true });
    const props = renderEdit(NODMA);
    expect(edit()).toHaveTextContent('DMA 연결 없음');
    expect(edit().querySelector('[data-slot="admin-dma-connect"]')).not.toBeNull();
    expect(connectButton()).toBeDisabled();
    expect(connectButton()).toHaveTextContent('DMA 유저 + 첫 계좌 만들기 · 서버 0대에 반영');

    fill();
    expect(connectButton()).toHaveTextContent('DMA 유저 + 첫 계좌 만들기 · 서버 1대에 반영');
    expect(connectButton()).toBeEnabled();
    fireEvent.click(connectButton());
    expect(connectAdminDmaMock).toHaveBeenCalledTimes(1);
    expect(connectAdminDmaMock).toHaveBeenCalledWith(NODMA.email, {
      dmaUserId: 'choitr',
      password: 'pw-1',
      account: { broker: 'KYOBO', accountNo: '98765432', name: '', branchNo: '', traderId: '', priority: 0 },
      servers: ['KYOBO119'],
    });

    const results = await waitFor(() => {
      const el = edit().querySelector('[data-slot="admin-dma-connect-results"]') as HTMLElement;
      expect(el).not.toBeNull();
      return el;
    });
    expect(within(results).getByText('KYOBO119')).toHaveAttribute('data-tone', 'ok');
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    // 비밀번호는 보낸 뒤 들고 있지 않는다(D-06)
    expect(within(edit()).getByLabelText('비밀번호')).toHaveValue('');
  });

  it('409 DMA_USER_EXISTS → DMA id 칸 아래 한 줄 · 재조회 없음', async () => {
    connectAdminDmaMock.mockRejectedValue(new ApiClientError({ code: 'DMA_USER_EXISTS', message: 'exists', status: 409 }));
    const props = renderEdit(NODMA);
    fill();
    fireEvent.click(connectButton());
    expect(await within(edit()).findByText('이미 있는 DMA id 예요')).toBeInTheDocument();
    expect(props.onChanged).not.toHaveBeenCalled();
  });

  it('viewer · DMA 없음 → 연결 그룹 없음(「DMA 연결 없음」 만)', () => {
    renderEdit({ ...NODMA, role: 'viewer' });
    expect(edit()).toHaveTextContent('DMA 연결 없음');
    expect(edit().querySelector('[data-slot="admin-dma-connect"]')).toBeNull();
    expect(within(edit()).queryByRole('button', { name: /DMA 유저 \+ 첫 계좌 만들기/ })).toBeNull();
  });
});
