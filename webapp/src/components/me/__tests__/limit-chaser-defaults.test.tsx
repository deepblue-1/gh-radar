import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { RelayUserSettingsMsg } from '@gh-radar/shared';

import { EMPTY_RELAY_VALUE, type RelayContextValue } from '@/lib/relay-provider';

/**
 * Phase 27 (27-06) — `/me` 「상따 기본설정」 섹션 (D-10 · D-12 · D-13 · 인박스 Q1/Q2 · 목업 변형 C).
 *
 * 잠그는 것: 84 3상태(미수신 · present true · present false)의 칩 · 안내 원문 · 4묶음 11행 순서와 값 표기 ·
 * 미수신 흐림/비활성 · present=false 자동 42 없음.
 */

let mockRelay: RelayContextValue;
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return { ...actual, useRelayContext: () => mockRelay };
});

import { LimitChaserDefaultsSection } from '../limit-chaser-defaults';

/** 서버 내장 기본값(fbs 주석 · 목업 `BUILTIN`). */
const BUILTIN: Omit<RelayUserSettingsMsg, 'present'> = {
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
};

function settings(present: boolean, patch: Partial<RelayUserSettingsMsg> = {}): RelayUserSettingsMsg {
  return { ...BUILTIN, present, ...patch };
}

let send: ReturnType<typeof vi.fn>;

function relay(userSettings: RelayUserSettingsMsg | undefined): RelayContextValue {
  return { ...EMPTY_RELAY_VALUE, status: 'ready', userSettings, send } as RelayContextValue;
}

const section = () => document.querySelector('[data-slot="me-lc-defaults"]') as HTMLElement;
const chip = () => section().querySelector('[data-slot="me-lc-defaults-chip"]') as HTMLElement;
const note = () => section().querySelector('[data-slot="me-lc-defaults-note"]') as HTMLElement;
const rowValue = (field: string) =>
  section().querySelector(`[data-lc-field="me-lc-${field}"] [data-slot="lc-row-value"]`)?.textContent;

beforeEach(() => {
  send = vi.fn(() => true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Phase 27 상따 기본설정 표시', () => {
  it('84 미수신 — 「불러오는 중」 칩 · 안내 · 11행 흐림 · 값 버튼 비활성', () => {
    mockRelay = relay(undefined);
    render(<LimitChaserDefaultsSection />);
    expect(within(section()).getByRole('heading', { name: '상따 기본설정' })).toBeInTheDocument();
    expect(chip()).toHaveTextContent('불러오는 중');
    expect(chip()).toHaveAttribute('data-tone', 'loading');
    expect(note()).toHaveTextContent('DMA 세션이 준비되면 서버 설정(84)을 불러와요');
    const body = section().querySelector('[data-slot="me-lc-defaults-rows"]') as HTMLElement;
    expect(body).toHaveAttribute('data-dim', 'true');
    const buttons = within(body).getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(11);
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

  it('묶음 4개 · 11행 순서 · 값 표기(만원 · 회 · 주 · % · 초 · 방법)', () => {
    mockRelay = relay(settings(true));
    render(<LimitChaserDefaultsSection />);
    const groups = Array.from(section().querySelectorAll('[data-slot="me-lc-defaults-group"]')).map(
      (g) => g.textContent,
    );
    expect(groups).toEqual(['매수 금액', '후매수', '매도', '자동매도']);
    const labels = Array.from(section().querySelectorAll('[data-slot="me-lc-defaults-row"]')).map(
      (r) => r.getAttribute('data-label'),
    );
    expect(labels).toEqual([
      '선매수 금액',
      '추가매수 금액',
      '후매수 금액',
      '후매수 최대',
      '후매수 하한잔량',
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
    expect(rowValue('post-buy-max-count')).toBe('3회');
    expect(rowValue('post-buy-floor-qty')).toBe('100,000주');
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
