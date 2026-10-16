import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { RelayUserSettingsMsg } from '@gh-radar/shared';

import { EMPTY_RELAY_VALUE, type RelayContextValue } from '@/lib/relay-provider';
import type { RelayServerMessageEntry } from '@/lib/use-relay-socket';

/**
 * Phase 27 (27-06) — `/me` 「상따 기본설정」 섹션 (D-10 · D-12 · D-13 · 인박스 Q1/Q2 · 목업 변형 C).
 *
 * 잠그는 것: 84 3상태(미수신 · present true · present false)의 칩 · 안내 원문 · 5묶음 12행 순서와 값 표기 ·
 * 미수신 흐림/비활성 · present=false 자동 42 없음 · 「선매수」 카드(quick-261012-u04).
 */

let mockRelay: RelayContextValue;
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return { ...actual, useRelayContext: () => mockRelay };
});

let mockEditMode: 'inline' | 'sheet' = 'inline';
vi.mock('@/lib/use-edit-mode', () => ({ useEditMode: () => mockEditMode }));

import { LimitChaserDefaultsSection, USER_SETTINGS_SAVE_TEXT, userSettingsValuesIssue } from '../limit-chaser-defaults';

/**
 * 서버 내장 기본값(fbs 주석 · 목업 `BUILTIN`) — Phase 31 12값. `postBuyFloorQty` 는 봉인(84 값을 읽지 않는다 ·
 * 42 에는 0)이라 일부러 0 이 아닌 값을 둔다. 후매수 최소(`postBuyFloorAmount`) 서버 내장값은 0.
 */
const BUILTIN: Omit<RelayUserSettingsMsg, 'present'> & { postBuyFloorAmount: number } = {
  t: 'user.settings',
  preBuyAmount: 4000,
  addBuyAmount: 4000,
  postBuyAmount: 4000,
  postBuyMaxCount: 3,
  postBuyFloorQty: 100_000,
  postBuyReboundPct: 30,
  sellQtyTrackRatio: 55,
  autoSellPeriodSec: 3,
  auctionSellRatioPct: 20,
  autoSellRatioDefaultPct: 10,
  autoSellMethodDefault: 3,
  postBuyFloorAmount: 0,
};

function settings(present: boolean, patch: Partial<RelayUserSettingsMsg> = {}): RelayUserSettingsMsg {
  return { ...BUILTIN, present, ...patch };
}

let send: ReturnType<typeof vi.fn>;

function relay(userSettings: RelayUserSettingsMsg | undefined): RelayContextValue {
  // 서버키 없는 84(구 relay 모양) = "" 칸 — serverKey prop 없는 섹션이 읽는 칸(종전 단일 동작).
  const userSettingsByServer = new Map(userSettings === undefined ? [] : [['', userSettings] as const]);
  return { ...EMPTY_RELAY_VALUE, status: 'ready', userSettingsByServer, send } as RelayContextValue;
}

const section = () => document.querySelector('[data-slot="me-lc-defaults"]') as HTMLElement;
const chip = () => section().querySelector('[data-slot="me-lc-defaults-chip"]') as HTMLElement;
const note = () => section().querySelector('[data-slot="me-lc-defaults-note"]') as HTMLElement;
const rowValue = (field: string) =>
  section().querySelector(`[data-lc-field="me-lc-${field}"] [data-slot="lc-row-value"]`)?.textContent;

beforeEach(() => {
  send = vi.fn(() => true);
  mockEditMode = 'inline';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Phase 27 상따 기본설정 표시', () => {
  it('84 미수신 — 「불러오는 중」 칩 · 안내 · 10행 흐림 · 값 버튼 비활성', () => {
    mockRelay = relay(undefined);
    render(<LimitChaserDefaultsSection />);
    expect(within(section()).getByRole('heading', { name: '상따 기본설정' })).toBeInTheDocument();
    expect(chip()).toHaveTextContent('불러오는 중');
    expect(chip()).toHaveAttribute('data-tone', 'loading');
    expect(note()).toHaveTextContent('DMA 세션이 준비되면 서버 설정(84)을 불러와요');
    const body = section().querySelector('[data-slot="me-lc-defaults-rows"]') as HTMLElement;
    expect(body).toHaveAttribute('data-dim', 'true');
    const buttons = within(body).getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(10);
    for (const b of buttons) expect(b).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });

  it('present=true — 「서버 저장값」(ok) · 서버 저장값 안내', () => {
    mockRelay = relay(settings(true));
    render(<LimitChaserDefaultsSection />);
    expect(chip()).toHaveTextContent('서버 저장값');
    expect(chip()).toHaveAttribute('data-tone', 'ok');
    expect(note()).toHaveTextContent('새 전략 폼의 기본값이에요 · 매도 주기 · 동시호가 비율은 서버가 다음 주기부터 바로 써요');
    const body = section().querySelector('[data-slot="me-lc-defaults-rows"]') as HTMLElement;
    expect(body).not.toHaveAttribute('data-dim', 'true');
  });

  it('present=false — 「서버 저장값 없음 · 내장 기본값」(warn) · 84 값 그대로 · 42 자동 송신 0', () => {
    mockRelay = relay(settings(false));
    render(<LimitChaserDefaultsSection />);
    expect(chip()).toHaveTextContent('서버 저장값 없음 · 내장 기본값');
    expect(chip()).toHaveAttribute('data-tone', 'warn');
    expect(note()).toHaveTextContent('아직 저장한 적이 없어요 · 저장하면 이 사용자(DMA 계정)의 모든 화면에 적용돼요');
    expect(rowValue('pre-buy-amount')).toBe('4,000만원');
    expect(send).not.toHaveBeenCalled();
  });

  it('묶음 5개 · 12행 순서 · 값 표기(만원 · % · 초 · 방법 · 체크)', () => {
    mockRelay = relay(settings(true));
    render(<LimitChaserDefaultsSection />);
    const groups = Array.from(section().querySelectorAll('[data-slot="me-lc-defaults-group"]')).map(
      (g) => g.textContent,
    );
    expect(groups).toEqual(['매수 금액', '선매수', '후매수', '매도', '자동매도']);
    const labels = Array.from(section().querySelectorAll('[data-slot="me-lc-defaults-row"]')).map(
      (r) => r.getAttribute('data-label'),
    );
    expect(labels).toEqual([
      '선매수 금액',
      '줄매수 금액',
      '후매수 금액',
      '매도잔량',
      '줄매수도 같이 켜기',
      '후매수 최소',
      '후매수 반등',
      '매도 잔량추적',
      '매도 주기',
      '동시호가 매도비율',
      '비율 기본값',
      '방법 기본값',
    ]);
    expect(rowValue('pre-buy-amount')).toBe('4,000만원');
    expect(rowValue('add-buy-amount')).toBe('4,000만원');
    expect(rowValue('post-buy-amount')).toBe('4,000만원');
    expect(rowValue('pre-buy-watch-amount')).toBe('0만원');
    expect(rowValue('post-buy-floor-amount')).toBe('0만원');
    expect(rowValue('post-buy-rebound-pct')).toBe('30%');
    expect(rowValue('sell-qty-track-ratio')).toBe('55%');
    expect(rowValue('auto-sell-period-sec')).toBe('3초');
    expect(rowValue('auction-sell-ratio-pct')).toBe('20%');
    expect(rowValue('auto-sell-ratio-default-pct')).toBe('10%');
    // 방법 기본값 — 3택 행(ChoiceRow). 데스크톱 세그먼트의 선택 = 「양쪽」.
    const method = within(section()).getByRole('radiogroup', { name: '방법 기본값' });
    expect(within(method).getByRole('radio', { checked: true })).toHaveTextContent('양쪽');
    expect(screen.getAllByText('양쪽').length).toBeGreaterThan(0);
  });
});

/* ───────────────────────── Task 3 — 행 확정마다 즉시 42 ───────────────────────── */

/**
 * 42 본문 기대값 — 84 의 10값 + 후매수 최소 그대로 · 봉인 하한잔량은 늘 0(84 값을 읽지 않는다 · D-13) ·
 * 선매수 2필드는 84 부재면 0 · false 로 늘 싣는다(quick-261012-u04 · gh-trade 261012).
 */
const VALUES_OF = (m: RelayUserSettingsMsg) => {
  const { t: _t, present: _p, ...rest } = m;
  return {
    ...rest,
    postBuyFloorQty: 0,
    postBuyFloorAmount: m.postBuyFloorAmount ?? 0,
    preBuyWatchAmount: m.preBuyWatchAmount ?? 0,
    preBuyAutoAddBuy: m.preBuyAutoAddBuy ?? false,
  };
};

function msg(m: string, extra: Partial<RelayServerMessageEntry> = {}): RelayServerMessageEntry {
  return { t: 'msg', lv: 'ERROR', m, i: '', a: '', src: 'SetUserSettings', kind: '', receivedAt: '10:00:00', ...extra };
}

/** 인라인으로 그 행을 열어 값을 넣고 Enter. */
function inlineCommit(field: string, value: string) {
  const btn = section().querySelector(`button[data-lc-field="me-lc-${field}"]`) as HTMLButtonElement;
  fireEvent.click(btn);
  const input = document.getElementById(`me-lc-${field}`) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

const sentPayloads = () => send.mock.calls.map((c) => c[0] as { t: string; s: Record<string, number> });
const rowWrap = (field: string) =>
  section().querySelector(`[data-slot="me-lc-defaults-row"][data-field="me-lc-${field}"]`) as HTMLElement;
const rejectLine = () => section().querySelector('[data-slot="me-lc-defaults-reject"]');

describe('Phase 27 상따 기본설정 즉시 저장(42)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('42 — 매도 주기 3 → 5 확정 = send 1회 · s 는 84 의 12값(봉인 0) + autoSellPeriodSec 5', () => {
    const base = settings(true);
    mockRelay = relay(base);
    render(<LimitChaserDefaultsSection />);
    inlineCommit('auto-sell-period-sec', '5');
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentPayloads()[0]).toEqual({ t: 'user.settings.set', s: { ...VALUES_OF(base), autoSellPeriodSec: 5 } });
  });

  it('u04 — 84 에 선매수 2키가 없을 때 매도 주기 3 → 5 확정 = s 에 preBuyWatchAmount 0 · preBuyAutoAddBuy false 를 늘 싣는다', () => {
    const base = settings(true);
    expect(base).not.toHaveProperty('preBuyWatchAmount');
    mockRelay = relay(base);
    render(<LimitChaserDefaultsSection />);
    inlineCommit('auto-sell-period-sec', '5');
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentPayloads()[0]).toEqual({
      t: 'user.settings.set',
      s: {
        preBuyAmount: 4000,
        addBuyAmount: 4000,
        postBuyAmount: 4000,
        postBuyMaxCount: 3,
        postBuyFloorQty: 0,
        postBuyReboundPct: 30,
        sellQtyTrackRatio: 55,
        autoSellPeriodSec: 5,
        auctionSellRatioPct: 20,
        autoSellRatioDefaultPct: 10,
        autoSellMethodDefault: 3,
        postBuyFloorAmount: 0,
        preBuyWatchAmount: 0,
        preBuyAutoAddBuy: false,
      },
    });
  });

  it('u04 — 84 에 50 · true 가 있을 때 다른 행 확정 → s.preBuyWatchAmount 50 · s.preBuyAutoAddBuy true 그대로', () => {
    mockRelay = relay(settings(true, { preBuyWatchAmount: 50, preBuyAutoAddBuy: true }));
    render(<LimitChaserDefaultsSection />);
    inlineCommit('auto-sell-period-sec', '5');
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentPayloads()[0]!.s).toMatchObject({ autoSellPeriodSec: 5, preBuyWatchAmount: 50, preBuyAutoAddBuy: true });
  });

  it('42 — 시트에서 61 → 적용 비활성 · 「1~60초 사이여야 해요」 · 전송 0 / 잔량추적 0 은 허용(서버 범위 0~90)', () => {
    mockEditMode = 'sheet';
    const base = settings(true);
    mockRelay = relay(base);
    render(<LimitChaserDefaultsSection />);
    fireEvent.click(section().querySelector('button[data-lc-field="me-lc-auto-sell-period-sec"]')!);
    const sheet = document.querySelector('[data-slot="numpad-sheet"]') as HTMLElement;
    expect(sheet).toHaveTextContent('1~60초');
    const keypad = within(within(sheet).getByRole('group', { name: '숫자 키패드' }));
    fireEvent.click(keypad.getByRole('button', { name: '6' }));
    fireEvent.click(keypad.getByRole('button', { name: '1' }));
    const confirm = sheet.querySelector('[data-slot="numpad-confirm"]') as HTMLButtonElement;
    expect(confirm).toBeDisabled();
    expect(sheet.querySelector('[data-slot="numpad-status"]')).toHaveTextContent('1~60초 사이여야 해요');
    fireEvent.click(confirm);
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));

    // 잔량추적 0 — lc.set(1~90) 보다 넓은 서버 범위(0~90) 그대로.
    fireEvent.click(section().querySelector('button[data-lc-field="me-lc-sell-qty-track-ratio"]')!);
    const sheet2 = document.querySelector('[data-slot="numpad-sheet"]') as HTMLElement;
    fireEvent.click(within(within(sheet2).getByRole('group', { name: '숫자 키패드' })).getByRole('button', { name: '0' }));
    const confirm2 = sheet2.querySelector('[data-slot="numpad-confirm"]') as HTMLButtonElement;
    expect(confirm2).toBeEnabled();
    fireEvent.click(confirm2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentPayloads()[0]!.s.sellQtyTrackRatio).toBe(0);
  });

  it('42 — 금액 범위 문구는 천단위 쉼표(0~999,999,999만원)', () => {
    mockEditMode = 'sheet';
    mockRelay = relay(settings(true));
    render(<LimitChaserDefaultsSection />);
    fireEvent.click(section().querySelector('button[data-lc-field="me-lc-pre-buy-amount"]')!);
    const sheet = document.querySelector('[data-slot="numpad-sheet"]') as HTMLElement;
    expect(sheet).toHaveTextContent('0~999,999,999만원');
  });

  it('42 — 비행 중 두 번째 확정은 즉시 안 보내고 84 뒤 새 캐시로 조립(앞 칸을 되돌리지 않는다)', () => {
    const base = settings(true);
    mockRelay = relay(base);
    const view = render(<LimitChaserDefaultsSection />);
    inlineCommit('auto-sell-period-sec', '5');
    inlineCommit('auto-sell-ratio-default-pct', '15');
    expect(send).toHaveBeenCalledTimes(1);

    // 앞 건의 84 — 주기 5 가 실렸다.
    const after = settings(true, { autoSellPeriodSec: 5 });
    mockRelay = relay(after);
    view.rerender(<LimitChaserDefaultsSection />);
    expect(send).toHaveBeenCalledTimes(2);
    expect(sentPayloads()[1]).toEqual({
      t: 'user.settings.set',
      s: { ...VALUES_OF(after), autoSellRatioDefaultPct: 15 },
    });
    expect(sentPayloads()[1]!.s.autoSellPeriodSec).toBe(5);
  });

  it('42 — 84 가 보낸 값을 실으면 그 행 플래시(~700ms) · 다른 탭 84 로 바뀐 행도 플래시', () => {
    mockRelay = relay(settings(true));
    const view = render(<LimitChaserDefaultsSection />);
    inlineCommit('auto-sell-period-sec', '5');
    mockRelay = relay(settings(true, { autoSellPeriodSec: 5 }));
    view.rerender(<LimitChaserDefaultsSection />);
    expect(rowWrap('auto-sell-period-sec')).toHaveAttribute('data-flash', 'ok');
    expect(rowValue('auto-sell-period-sec')).toBe('5초');
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(rowWrap('auto-sell-period-sec')).not.toHaveAttribute('data-flash');

    // 다른 탭의 42 — 이 탭은 보낸 적 없다.
    mockRelay = relay(settings(true, { autoSellPeriodSec: 5, postBuyReboundPct: 40 }));
    view.rerender(<LimitChaserDefaultsSection />);
    expect(rowWrap('post-buy-rebound-pct')).toHaveAttribute('data-flash', 'ok');
    expect(rowWrap('auto-sell-period-sec')).not.toHaveAttribute('data-flash');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('42 — 3초 안에 84 · 거부가 없으면 그 행 실패 · 재전송 0 · 대기 건은 보내지 않고 실패', () => {
    mockRelay = relay(settings(true));
    const view = render(<LimitChaserDefaultsSection />);
    inlineCommit('auto-sell-period-sec', '5');
    inlineCommit('auto-sell-ratio-default-pct', '15');
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(rowWrap('auto-sell-period-sec')).toHaveAttribute('data-failed', 'true');
    expect(rowWrap('auto-sell-ratio-default-pct')).toHaveAttribute('data-failed', 'true');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    // 늦은 84 가 와도 대기 건은 나가지 않는다.
    mockRelay = relay(settings(true, { autoSellPeriodSec: 5 }));
    view.rerender(<LimitChaserDefaultsSection />);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('WR-05 — 3초 실패 뒤 늦은 84 가 시도한 값을 실으면 그 행 실패를 거둔다 · 다른 값의 84 · 저장 안 된 대기 행은 실패 유지', () => {
    mockRelay = relay(settings(true));
    const view = render(<LimitChaserDefaultsSection />);
    inlineCommit('auto-sell-period-sec', '5');
    inlineCommit('auto-sell-ratio-default-pct', '15');
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(rowWrap('auto-sell-period-sec')).toHaveAttribute('data-failed', 'true');

    // 시도한 값이 아닌 84(다른 탭이 7 로 저장) — 실패 유지.
    mockRelay = relay(settings(true, { autoSellPeriodSec: 7 }));
    view.rerender(<LimitChaserDefaultsSection />);
    expect(rowWrap('auto-sell-period-sec')).toHaveAttribute('data-failed', 'true');

    // 시도한 값 5 를 실은 늦은 84 — 서버 저장 성공 → 실패를 거둔다. 대기 행(15)은 보낸 적 없어 그대로 실패.
    mockRelay = relay(settings(true, { autoSellPeriodSec: 5 }));
    view.rerender(<LimitChaserDefaultsSection />);
    expect(rowWrap('auto-sell-period-sec')).not.toHaveAttribute('data-failed');
    expect(rowValue('auto-sell-period-sec')).toBe('5초');
    expect(rowWrap('auto-sell-ratio-default-pct')).toHaveAttribute('data-failed', 'true');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('42 — 비행 중 54 ERROR SetUserSettings → 섹션 아래 원문 · 행 값은 84 그대로 · 창 밖 거부는 줄을 세우지 않는다', () => {
    mockRelay = relay(settings(true));
    const view = render(<LimitChaserDefaultsSection />);

    // 창 밖(비행 없음) 거부 — 다른 탭의 거부가 팬아웃돼도 줄이 서지 않는다.
    const other = msg('다른 탭 거부');
    mockRelay = { ...relay(settings(true)), messages: [other] };
    view.rerender(<LimitChaserDefaultsSection />);
    expect(rejectLine()).toBeNull();

    inlineCommit('auto-sell-period-sec', '9');
    const text = '매도 주기는 1~60초여야 합니다(받은 값 99)';
    // 같은 사용자 다른 소스의 54(INFO · 다른 src)는 귀속하지 않는다.
    const info = msg('자동매도 사유', { lv: 'INFO', src: 'AutoSell' });
    mockRelay = { ...relay(settings(true)), messages: [msg(text), info, other] };
    view.rerender(<LimitChaserDefaultsSection />);
    expect(rejectLine()).toHaveTextContent(text);
    expect(rejectLine()).toHaveAttribute('role', 'alert');
    expect(rowValue('auto-sell-period-sec')).toBe('3초');
    expect(rowWrap('auto-sell-period-sec')).toHaveAttribute('data-failed', 'true');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('42 — 방법 기본값 선택 = 1회 · present=false 상태에서도 확정 때만 보낸다', () => {
    const base = settings(false);
    mockRelay = relay(base);
    render(<LimitChaserDefaultsSection />);
    expect(send).not.toHaveBeenCalled();
    const method = within(section()).getByRole('radiogroup', { name: '방법 기본값' });
    fireEvent.click(within(method).getByRole('radio', { name: '매도1호가' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentPayloads()[0]).toEqual({ t: 'user.settings.set', s: { ...VALUES_OF(base), autoSellMethodDefault: 1 } });
  });

  it('42 — 서버 값과 같은 확정은 보내지 않는다 · send false(끊김)는 실패 표시 · 재전송 0', () => {
    mockRelay = relay(settings(true));
    render(<LimitChaserDefaultsSection />);
    inlineCommit('auto-sell-period-sec', '3');
    expect(send).not.toHaveBeenCalled();
    send.mockReturnValue(false);
    inlineCommit('auto-sell-period-sec', '7');
    expect(send).toHaveBeenCalledTimes(1);
    expect(rowWrap('auto-sell-period-sec')).toHaveAttribute('data-failed', 'true');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('IN-02 — 84 캐시의 다른 칸이 범위 밖이면 42 를 보내지 않고 바꾼 행을 실패로 둔다 · 대기 건도 칸마다 판정', () => {
    // 캐시의 비율 기본값 0 — 서버 범위 1~50 밖. 그대로 실어 보내면 relay zod 가 close(4400)로 소켓을 끊는다.
    const bad = settings(true, { autoSellRatioDefaultPct: 0 });
    mockRelay = relay(bad);
    render(<LimitChaserDefaultsSection />);
    inlineCommit('auto-sell-period-sec', '5');
    expect(send).not.toHaveBeenCalled();
    expect(rowWrap('auto-sell-period-sec')).toHaveAttribute('data-failed', 'true');
    // 바꾼 칸이 그 위반 칸을 고치면 11칸이 모두 범위 안이라 나간다.
    inlineCommit('auto-sell-ratio-default-pct', '15');
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentPayloads()[0]).toEqual({ t: 'user.settings.set', s: { ...VALUES_OF(bad), autoSellRatioDefaultPct: 15 } });
  });

  it('IN-02 — userSettingsValuesIssue: 11칸 전부 안이면 null · 바꾼 칸 위반은 문장만 · 다른 칸 위반은 그 칸 이름을 붙인다', () => {
    const ok = VALUES_OF(settings(true));
    expect(userSettingsValuesIssue(ok, 'autoSellPeriodSec')).toBeNull();
    expect(userSettingsValuesIssue({ ...ok, autoSellPeriodSec: 61 }, 'autoSellPeriodSec')).toBe('1~60초 사이여야 해요');
    expect(userSettingsValuesIssue({ ...ok, autoSellMethodDefault: 0 }, 'autoSellPeriodSec')).toBe(
      '방법 기본값 1~3 사이여야 해요',
    );
  });

  it('42 — 84 미수신이면 어떤 확정도 보내지 않는다', () => {
    mockRelay = relay(undefined);
    render(<LimitChaserDefaultsSection />);
    const btn = section().querySelector('button[data-lc-field="me-lc-auto-sell-period-sec"]') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(document.getElementById('me-lc-auto-sell-period-sec')).toBeNull();
    const method = within(section()).getByRole('radiogroup', { name: '방법 기본값' });
    fireEvent.click(within(method).getByRole('radio', { name: '매도1호가' }));
    expect(send).not.toHaveBeenCalled();
  });
});

describe('261006-pey 설정 탭 S1 묶음 카드 (D-2 · sketch 013 settings.html S1)', () => {
  const rowsEl = () => section().querySelector('[data-slot="me-lc-defaults-rows"]') as HTMLElement;
  const cards = () =>
    Array.from(section().querySelectorAll('[data-slot="me-lc-defaults-group-card"]')) as HTMLElement[];

  it('S1-1 — 묶음 카드 5장 · role=group 이름 순서 · CARD 면(radius 16 · --card) · 카드별 행 3·2·2·1·4', () => {
    mockRelay = relay(settings(true));
    render(<LimitChaserDefaultsSection />);
    const cs = cards();
    expect(cs).toHaveLength(5);
    expect(cs.map((c) => c.getAttribute('role'))).toEqual(['group', 'group', 'group', 'group', 'group']);
    expect(cs.map((c) => c.getAttribute('aria-label'))).toEqual(['매수 금액', '선매수', '후매수', '매도', '자동매도']);
    for (const c of cs) {
      expect(c.className).toContain('rounded-[16px]');
      expect(c.className).toContain('bg-[var(--card)]');
    }
    expect(cs.map((c) => c.querySelectorAll('[data-slot="me-lc-defaults-row"]').length)).toEqual([3, 2, 2, 1, 4]);
    expect(section().querySelectorAll('[data-slot="me-lc-defaults-row"]')).toHaveLength(12);
  });

  it('S1-2 — 카드마다 행 목록에 @container/lc 하나 · 섹션 루트는 @container/me 이고 카드 면이 아니다', () => {
    mockRelay = relay(settings(true));
    render(<LimitChaserDefaultsSection />);
    for (const c of cards()) {
      const lcs = Array.from(c.querySelectorAll('*')).filter((el) =>
        (el.getAttribute('class') ?? '').split(/\s+/).includes('@container/lc'),
      );
      expect(lcs).toHaveLength(1);
      expect(lcs[0].querySelectorAll('[data-slot="me-lc-defaults-row"]').length).toBeGreaterThan(0);
    }
    expect(section().className.split(/\s+/)).toContain('@container/me');
    expect(section().className).not.toContain('bg-[var(--card)]');
  });

  it('S1-3 — 격자 래퍼: 1열 · 섹션 본문 ≥700 2열 · items-start · 84 미수신이면 data-dim 유지', () => {
    mockRelay = relay(undefined);
    render(<LimitChaserDefaultsSection />);
    const cls = rowsEl().className.split(/\s+/);
    expect(cls).toContain('grid-cols-1');
    expect(cls).toContain('@min-[700px]/me:grid-cols-2');
    expect(cls).toContain('items-start');
    expect(rowsEl()).toHaveAttribute('data-dim', 'true');
  });

  it('S1-3b u04 B′ 열 고정 — 열 래퍼 2개(왼쪽 매수 금액 · 선매수 · 후매수 / 오른쪽 매도 · 자동매도) · 1열 contents · ≥700 grid', () => {
    mockRelay = relay(settings(true));
    render(<LimitChaserDefaultsSection />);
    const cols = Array.from(rowsEl().children) as HTMLElement[];
    expect(cols).toHaveLength(2);
    for (const col of cols) {
      expect(col).toHaveAttribute('data-slot', 'me-lc-defaults-column');
      const cls = col.className.split(/\s+/);
      expect(cls).toContain('contents');
      expect(cls).toContain('@min-[700px]/me:grid');
    }
    const namesOf = (col: HTMLElement) =>
      Array.from(col.querySelectorAll('[data-slot="me-lc-defaults-group-card"]')).map((c) => c.getAttribute('aria-label'));
    expect(namesOf(cols[0]!)).toEqual(['매수 금액', '선매수', '후매수']);
    expect(namesOf(cols[1]!)).toEqual(['매도', '자동매도']);
  });

  it('S1-4 — 제목 · 칩 · 안내는 격자 위에 한 번씩만', () => {
    mockRelay = relay(settings(true));
    render(<LimitChaserDefaultsSection />);
    const heads = within(section()).getAllByRole('heading', { name: '상따 기본설정' });
    const chips = section().querySelectorAll('[data-slot="me-lc-defaults-chip"]');
    const notes = section().querySelectorAll('[data-slot="me-lc-defaults-note"]');
    expect(heads).toHaveLength(1);
    expect(chips).toHaveLength(1);
    expect(notes).toHaveLength(1);
    for (const el of [heads[0], chips[0], notes[0]]) {
      expect(el.compareDocumentPosition(rowsEl()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

/* ───────────────────────── Phase 31 — 「후매수 최소」(만원 · 42/84 vtable 28) ───────────────────────── */

describe('P31 후매수 최소 (D-13 · UI-SPEC S5)', () => {
  const rowButton = (field: string) =>
    section().querySelector(`button[data-lc-field="me-lc-${field}"]`) as HTMLButtonElement;

  it('84 최소 84 → 후매수 묶음 「최소 · 반등」 · 「84만원」 · 접근성 이름 「후매수 최소 84만원」 · 하한잔량 글자 0 · 12행', () => {
    mockRelay = relay(settings(true, { postBuyFloorAmount: 84 }));
    render(<LimitChaserDefaultsSection />);
    const card = within(section()).getByRole('group', { name: '후매수' });
    const labels = Array.from(card.querySelectorAll('[data-slot="me-lc-defaults-row"]')).map((r) =>
      r.getAttribute('data-label'),
    );
    expect(labels).toEqual(['후매수 최소', '후매수 반등']);
    expect(rowValue('post-buy-floor-amount')).toBe('84만원');
    expect(rowButton('post-buy-floor-amount')).toHaveAccessibleName('후매수 최소 84만원');
    expect(section().textContent).not.toContain('하한잔량');
    expect(section().querySelectorAll('[data-slot="me-lc-defaults-row"]')).toHaveLength(12);
  });

  it('84 최소 0 → 「0만원」(의미어 없음)', () => {
    mockRelay = relay(settings(true, { postBuyFloorAmount: 0 }));
    render(<LimitChaserDefaultsSection />);
    expect(rowValue('post-buy-floor-amount')).toBe('0만원');
  });

  it('「후매수 최소」 300 확정 → send 1회 · 84 의 10값 그대로 + 최소 300 + 하한잔량 0(84 의 150000 은 싣지 않는다)', () => {
    const base = settings(true, { postBuyFloorQty: 150_000, postBuyFloorAmount: 84 });
    mockRelay = relay(base);
    render(<LimitChaserDefaultsSection />);
    inlineCommit('post-buy-floor-amount', '300');
    expect(send).toHaveBeenCalledTimes(1);
    const s = sentPayloads()[0]!.s;
    expect(s).toEqual({ ...VALUES_OF(base), postBuyFloorAmount: 300 });
    expect(s.postBuyFloorQty).toBe(0);
    expect(Object.keys(s)).toHaveLength(14);
  });

  it('다른 칸(매도 주기 5) 확정 → s.postBuyFloorAmount 는 84 값 그대로 · 하한잔량 0', () => {
    const base = settings(true, { postBuyFloorQty: 150_000, postBuyFloorAmount: 84 });
    mockRelay = relay(base);
    render(<LimitChaserDefaultsSection />);
    inlineCommit('auto-sell-period-sec', '5');
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentPayloads()[0]!.s.postBuyFloorAmount).toBe(84);
    expect(sentPayloads()[0]!.s.postBuyFloorQty).toBe(0);
  });

  it('84 에 최소 키 없음(구 relay) → 「불러오는 중」 칩 · 안내 · 행 버튼 비활성 · send 0 (Pitfall 10)', () => {
    const { postBuyFloorAmount: _drop, ...legacy } = settings(true);
    mockRelay = relay(legacy);
    render(<LimitChaserDefaultsSection />);
    expect(chip()).toHaveTextContent('불러오는 중');
    expect(chip()).toHaveAttribute('data-tone', 'loading');
    expect(note()).toHaveTextContent('DMA 세션이 준비되면 서버 설정(84)을 불러와요');
    const body = section().querySelector('[data-slot="me-lc-defaults-rows"]') as HTMLElement;
    expect(body).toHaveAttribute('data-dim', 'true');
    for (const b of within(body).getAllByRole('button')) expect(b).toBeDisabled();
    fireEvent.click(rowButton('auto-sell-period-sec'));
    expect(document.getElementById('me-lc-auto-sell-period-sec')).toBeNull();
    const method = within(section()).getByRole('radiogroup', { name: '방법 기본값' });
    fireEvent.click(within(method).getByRole('radio', { name: '매도1호가' }));
    expect(send).not.toHaveBeenCalled();
  });

  it('54 ERROR SetUserSettings 「후매수 하한금액은 …」 → me-lc-defaults-reject 줄에 원문 그대로', () => {
    vi.useFakeTimers();
    try {
      mockRelay = relay(settings(true, { postBuyFloorAmount: 84 }));
      const view = render(<LimitChaserDefaultsSection />);
      inlineCommit('post-buy-floor-amount', '300');
      const text = '후매수 하한금액은 0~999999999만원이어야 합니다(받은 값 1000000000)';
      mockRelay = { ...relay(settings(true, { postBuyFloorAmount: 84 })), messages: [msg(text)] };
      view.rerender(<LimitChaserDefaultsSection />);
      expect(rejectLine()?.textContent).toBe(text);
      expect(rowValue('post-buy-floor-amount')).toBe('84만원');
    } finally {
      vi.useRealTimers();
    }
  });

  it('userSettingsValuesIssue — 최소 범위 밖은 「0~999,999,999만원 사이여야 해요」(shared 범위 한 벌)', () => {
    const ok = VALUES_OF(settings(true));
    expect(userSettingsValuesIssue({ ...ok, postBuyFloorAmount: 1_000_000_000 }, 'postBuyFloorAmount')).toBe(
      '0~999,999,999만원 사이여야 해요',
    );
    expect(userSettingsValuesIssue({ ...ok, postBuyFloorAmount: 999_999_999 }, 'postBuyFloorAmount')).toBeNull();
  });
});

/* ───────────────────────── quick-261012-u04 — 「선매수」 카드(매도잔량 · 줄매수도 같이 켜기) ───────────────────────── */

describe('u04 「선매수」 카드 (gh-trade 261012 · 목업 B′)', () => {
  const checkbox = () => within(section()).getByRole('checkbox', { name: '선매수 줄매수도 같이 켜기' });

  it('84 50 · true → 「매도잔량」 「50만원」 · 체크 행 role=checkbox · aria-checked true', () => {
    mockRelay = relay(settings(true, { preBuyWatchAmount: 50, preBuyAutoAddBuy: true }));
    render(<LimitChaserDefaultsSection />);
    const card = within(section()).getByRole('group', { name: '선매수' });
    const labels = Array.from(card.querySelectorAll('[data-slot="me-lc-defaults-row"]')).map((r) =>
      r.getAttribute('data-label'),
    );
    expect(labels).toEqual(['매도잔량', '줄매수도 같이 켜기']);
    expect(rowValue('pre-buy-watch-amount')).toBe('50만원');
    expect(checkbox()).toHaveAttribute('aria-checked', 'true');
    expect(checkbox()).toBeEnabled();
  });

  it('84 에 두 키가 없으면(구 서버) 「0만원」 · 미체크 · 편집 가능(불러오는 중 아님)', () => {
    mockRelay = relay(settings(true));
    render(<LimitChaserDefaultsSection />);
    expect(chip()).toHaveTextContent('서버 저장값');
    expect(rowValue('pre-buy-watch-amount')).toBe('0만원');
    expect(checkbox()).toHaveAttribute('aria-checked', 'false');
    expect(checkbox()).toBeEnabled();
    expect(section().querySelector('button[data-lc-field="me-lc-pre-buy-watch-amount"]')).toBeEnabled();
  });

  it('84 미수신 — 체크 버튼 disabled · 행 흐림', () => {
    mockRelay = relay(undefined);
    render(<LimitChaserDefaultsSection />);
    expect(checkbox()).toBeDisabled();
    expect(section().querySelector('[data-slot="me-lc-defaults-rows"]')).toHaveAttribute('data-dim', 'true');
    fireEvent.click(checkbox());
    expect(send).not.toHaveBeenCalled();
  });

  describe('저장', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('매도잔량 인라인 300 확정 → send 1 · s = 84 14값 + preBuyWatchAmount 300', () => {
      const base = settings(true, { preBuyWatchAmount: 50, preBuyAutoAddBuy: true });
      mockRelay = relay(base);
      render(<LimitChaserDefaultsSection />);
      inlineCommit('pre-buy-watch-amount', '300');
      expect(send).toHaveBeenCalledTimes(1);
      expect(sentPayloads()[0]).toEqual({ t: 'user.settings.set', s: { ...VALUES_OF(base), preBuyWatchAmount: 300 } });
    });

    it('매도잔량 범위 — 「0~999,999,999만원 사이여야 해요」(shared 범위 한 벌) · 시트 설명 줄 · 84 캐시가 범위 밖이면 보내지 않는다', () => {
      const ok = VALUES_OF(settings(true));
      expect(userSettingsValuesIssue({ ...ok, preBuyWatchAmount: 1_000_000_000 }, 'preBuyWatchAmount')).toBe(
        '0~999,999,999만원 사이여야 해요',
      );
      expect(userSettingsValuesIssue({ ...ok, preBuyWatchAmount: 999_999_999 }, 'preBuyWatchAmount')).toBeNull();
      // bool 칸은 범위 검사 대상이 아니다.
      expect(userSettingsValuesIssue({ ...ok, preBuyAutoAddBuy: true }, 'preBuyAutoAddBuy')).toBeNull();

      // 84 캐시의 매도잔량이 범위 밖 — 체크 토글도 42 를 보내지 않고 그 행을 실패로 둔다(IN-02 · 소켓 close 4400 차단).
      mockRelay = relay(settings(true, { preBuyWatchAmount: 1_000_000_000 }));
      render(<LimitChaserDefaultsSection />);
      fireEvent.click(checkbox());
      expect(send).not.toHaveBeenCalled();
      expect(rowWrap('pre-buy-auto-add-buy')).toHaveAttribute('data-failed', 'true');
    });

    it('체크 클릭(84 false) → send 1 · s = 84 14값 + preBuyAutoAddBuy true · 84 전엔 aria-checked false(낙관 없음) · aria-busy · 84(true) → 체크 · 플래시', () => {
      const base = settings(true);
      mockRelay = relay(base);
      const view = render(<LimitChaserDefaultsSection />);
      fireEvent.click(checkbox());
      expect(send).toHaveBeenCalledTimes(1);
      expect(sentPayloads()[0]).toEqual({ t: 'user.settings.set', s: { ...VALUES_OF(base), preBuyAutoAddBuy: true } });
      expect(checkbox()).toHaveAttribute('aria-checked', 'false');
      expect(checkbox()).toHaveAttribute('aria-busy', 'true');
      expect(checkbox()).toBeDisabled();

      mockRelay = relay(settings(true, { preBuyAutoAddBuy: true }));
      view.rerender(<LimitChaserDefaultsSection />);
      expect(checkbox()).toHaveAttribute('aria-checked', 'true');
      expect(checkbox()).not.toHaveAttribute('aria-busy');
      expect(rowWrap('pre-buy-auto-add-buy')).toHaveAttribute('data-flash', 'ok');
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('체크 켬 상태(84 true)에서 클릭 → s.preBuyAutoAddBuy false(그 bool 만 뒤집는다)', () => {
      const base = settings(true, { preBuyWatchAmount: 50, preBuyAutoAddBuy: true });
      mockRelay = relay(base);
      render(<LimitChaserDefaultsSection />);
      fireEvent.click(checkbox());
      expect(sentPayloads()[0]).toEqual({ t: 'user.settings.set', s: { ...VALUES_OF(base), preBuyAutoAddBuy: false } });
    });

    it('체크 3초 무응답 → 그 행 실패 말풍선 「반영되지 않았어요」 · 재전송 0', () => {
      mockRelay = relay(settings(true));
      render(<LimitChaserDefaultsSection />);
      fireEvent.click(checkbox());
      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(rowWrap('pre-buy-auto-add-buy')).toHaveAttribute('data-failed', 'true');
      expect(document.querySelector('[data-slot="lc-failure-bubble"]')).toHaveTextContent(USER_SETTINGS_SAVE_TEXT.timeout);
      expect(checkbox()).toHaveAttribute('aria-checked', 'false');
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('체크 비행 중 54 SetUserSettings 거부 → 섹션 아래 원문 줄 · 체크는 84 그대로', () => {
      mockRelay = relay(settings(true));
      const view = render(<LimitChaserDefaultsSection />);
      fireEvent.click(checkbox());
      const text = '선매수 매도잔량 기본값은 0~999999999만원이어야 합니다';
      mockRelay = { ...relay(settings(true)), messages: [msg(text)] };
      view.rerender(<LimitChaserDefaultsSection />);
      expect(rejectLine()).toHaveTextContent(text);
      expect(checkbox()).toHaveAttribute('aria-checked', 'false');
      expect(rowWrap('pre-buy-auto-add-buy')).toHaveAttribute('data-failed', 'true');
    });

    it('비행 중 체크 확정은 대기열 — 앞 건 84 뒤 새 캐시로 조립(앞 칸을 되돌리지 않는다)', () => {
      mockRelay = relay(settings(true));
      const view = render(<LimitChaserDefaultsSection />);
      inlineCommit('pre-buy-watch-amount', '50');
      fireEvent.click(checkbox());
      expect(send).toHaveBeenCalledTimes(1);
      const after = settings(true, { preBuyWatchAmount: 50, preBuyAutoAddBuy: false });
      mockRelay = relay(after);
      view.rerender(<LimitChaserDefaultsSection />);
      expect(send).toHaveBeenCalledTimes(2);
      expect(sentPayloads()[1]).toEqual({ t: 'user.settings.set', s: { ...VALUES_OF(after), preBuyAutoAddBuy: true } });
      expect(sentPayloads()[1]!.s.preBuyWatchAmount).toBe(50);
    });
  });
});
