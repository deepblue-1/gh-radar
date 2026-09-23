import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  RelayAccountState,
  RelayHolding,
  RelayOrderResultMsg,
  RelayUnfilled,
} from '@gh-radar/shared';

/**
 * 18-09 Task 2 — 작업대 공용 패널 (D-13 · E13 · TRADE-09).
 *
 * 잠그는 규칙:
 *   - 탭 3개 「미체결 (N)」·「잔고 (N)」·「전략 로그」 — 라벨은 숫자형, 단/복수 어휘 분기 없음
 *   - 탭별 빈 문구 3종, 스피너 없음(스냅샷 전 = 빈 문구)
 *   - 미체결 행 클릭 → 상위 `onSelectUnfilled` 1회(재클릭 = null 로 해제)
 *   - 행 취소 실패 → **그 행 아래** 인라인 `role="status"`
 *   - 현재가 미수신 잔고 → 평가손익 「—」
 *   - 로그 메시지 clamp 없음(줄바꿈 허용) · 종목 열 1줄 ellipsis
 *   - 폰 밴드 「접기 ▾」/「펼치기 ▴」 + sticky 바
 *   - 더티 바가 떠 있으면 **여백**으로 비킨다(z-index 로 덮지 않는다)
 *
 * ★ jsdom 은 컨테이너 쿼리를 평가하지 않는다 — 폰/≥700 전환과 **겹침 0 의 실측**은
 *   18-13 Playwright `boundingBox()` 가 맡는다. 여기서는 클래스·인라인 스타일 적용까지만 본다.
 */

const sendOrderMock = vi.fn();
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, sendOrder: sendOrderMock }),
  };
});

import {
  SharedPanels,
  DIRTY_BAR_FALLBACK_PX,
  nextUnfilledSelection,
  type SharedPanelsProps,
} from '../workbench/shared-panels';

const ISIN_A = 'KR7196170005';
const ISIN_B = 'KR7042700005';

function unf(over: Partial<RelayUnfilled> = {}): RelayUnfilled {
  return {
    orderNo: '3407000065',
    orgOrderNo: '',
    isin: ISIN_A,
    side: 'B',
    price: 412_000,
    orderQty: 30,
    filledQty: 0,
    unfilledQty: 30,
    exchange: 'KRX',
    orderTime: '094010',
    queuedStatus: '',
    pendingStatus: '',
    board: '',
    pendingCancelSent: false,
    name: '알테오젠',
    code: '196170',
    ...over,
  };
}

function hold(over: Partial<RelayHolding> = {}): RelayHolding {
  return { isin: ISIN_B, qty: 60, sellableQty: 60, avgPrice: 126_900, name: '한미반도체', ...over };
}

function acct(over: Partial<RelayAccountState> = {}): RelayAccountState {
  return {
    t: 'acct',
    a: '12345678-01',
    snap: true,
    rm: [],
    st: '09:41:52',
    hold: [hold()],
    unf: [unf(), unf({ orderNo: '3407000064', isin: ISIN_B, name: '한미반도체', exchange: 'NXT' })],
    ...over,
  };
}

function props(over: Partial<SharedPanelsProps> = {}): SharedPanelsProps {
  return {
    accountNo: '12345678-01',
    account: acct(),
    status: 'ready',
    logEntries: [],
    selectedOrderNo: null,
    onSelectUnfilled: vi.fn(),
    dirtyBarCount: 0,
    ...over,
  };
}

function panel(): HTMLElement {
  return screen.getByTestId('shared-panels');
}

function result(over: Partial<RelayOrderResultMsg> = {}): RelayOrderResultMsg {
  return {
    t: 'order.result',
    rid: 'rid-1',
    orderNo: '3407000065',
    resultCode: 0,
    message: '정상처리',
    status: 'accepted',
    ...over,
  };
}

beforeEach(() => {
  sendOrderMock.mockReset();
  sendOrderMock.mockResolvedValue(result());
});

describe('SharedPanels — 탭 · 빈 상태', () => {
  it('① 탭 3개 라벨이 「미체결 (N)」·「잔고 (N)」·「전략 로그」 이고 기본은 미체결이다', () => {
    render(<SharedPanels {...props()} />);
    const tabs = within(panel()).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['미체결 (2)', '잔고 (1)', '전략 로그']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('② 각 탭 0건이면 그 빈 문구가 뜨고 스피너가 없다 (스냅샷 전 = 빈 문구)', async () => {
    const user = userEvent.setup();
    render(<SharedPanels {...props({ account: null })} />);
    const tabs = within(panel()).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['미체결 (0)', '잔고 (0)', '전략 로그']);

    expect(within(panel()).getByText('미체결 주문이 없어요')).toBeInTheDocument();
    await user.click(tabs[1]!);
    expect(within(panel()).getByText('보유 종목이 없어요')).toBeInTheDocument();
    await user.click(tabs[2]!);
    expect(within(panel()).getByText('아직 기록이 없어요')).toBeInTheDocument();

    expect(panel().querySelector('[role="progressbar"], .animate-spin')).toBeNull();
    expect(panel().textContent).not.toContain('불러오는');
  });

  it('②-a 계좌 축은 단일 계좌 — AccountPanel 임베드(계좌 전용 모드) 한 벌이고 계좌 셀렉터가 없다', () => {
    render(<SharedPanels {...props()} />);
    const embeds = panel().querySelectorAll('[data-testid="account-panel"]');
    expect(embeds).toHaveLength(1);
    expect(embeds[0]).toHaveAttribute('data-mode', 'embed');
    expect(within(panel()).queryByRole('combobox')).toBeNull();
  });
});

describe('SharedPanels — 미체결', () => {
  it('③ 미체결 행을 클릭하면 상위 onSelectUnfilled 가 그 행으로 1회 불린다', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SharedPanels {...props({ onSelectUnfilled: onSelect })} />);
    const row = panel().querySelectorAll('[data-slot="account-embed-unfilled-row"]')[1]!;
    await user.click(row.querySelectorAll('td')[3]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ orderNo: '3407000064', isin: ISIN_B });
  });

  it('③-a 선택된 행을 다시 누르면 null 로 해제를 올린다 (토글은 이 패널 한 곳)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SharedPanels {...props({ onSelectUnfilled: onSelect, selectedOrderNo: '3407000065' })} />,
    );
    const row = panel().querySelectorAll('[data-slot="account-embed-unfilled-row"]')[0]!;
    expect(row).toHaveAttribute('data-selected', 'true');
    await user.click(row.querySelectorAll('td')[3]!);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('③-a2 nextUnfilledSelection — 재선택=해제 토글의 유일 지점 (카드 탭과 공용 · quick-260923-onn)', () => {
    const row = unf();
    expect(nextUnfilledSelection(null, row)).toBe(row);
    expect(nextUnfilledSelection(row.orderNo, row)).toBeNull();
    expect(nextUnfilledSelection('다른번호', row)).toBe(row);
  });

  it('③-b 미체결 열은 종목 · 거래소 · 구분 · 주문가 · 주문/미체결 · 주문No · 취소 순서다', () => {
    render(<SharedPanels {...props()} />);
    const heads = within(panel()).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['종목', '거래소', '구분', '주문가', '주문/미체결', '주문No', '취소']);
    const row = panel().querySelectorAll('[data-slot="account-embed-unfilled-row"]')[0]!;
    expect(row).toHaveAttribute('title', '행을 누르면 수동주문 폼에서 정정·취소할 수 있어요');
    expect(row.textContent).toContain('30 / 30');
  });

  it('③-c 출처 배지는 호출부가 아는 값만 「상따」/「수동」 으로 붙는다', () => {
    render(
      <SharedPanels
        {...props({ originOf: (row) => (row.orderNo === '3407000065' ? '상따' : '수동') })}
      />,
    );
    const badges = Array.from(
      panel().querySelectorAll('[data-slot="account-origin-badge"]'),
    ).map((b) => b.textContent);
    expect(badges).toEqual(['상따', '수동']);
  });

  it('④ 행 취소가 거부되면 그 행 바로 아래 인라인 role="status" 로 고지한다', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(
      result({ status: 'rejected', resultCode: -204, message: '취소할 수량이 없습니다' }),
    );
    render(<SharedPanels {...props()} />);
    await user.click(within(panel()).getByRole('button', { name: '주문번호 3407000064 취소' }));
    await user.click(await screen.findByRole('button', { name: '✕ 주문 취소' }));

    const banner = await screen.findByTestId('cancel-result-rejected');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveTextContent('주문 취소가 거부됐어요 · 취소할 수량이 없습니다');
    // 그 행(두 번째) 바로 다음 줄이다.
    const target = panel().querySelectorAll('[data-slot="account-embed-unfilled-row"]')[1]!;
    const next = target.nextElementSibling!;
    expect(next).toHaveAttribute('data-slot', 'account-embed-cancel-result');
    expect(next).toContainElement(banner);
  });

  it('④-a 결과 모름(timeout)도 그 행 아래 role="status" 이고 「실패」라고 쓰지 않는다', async () => {
    const user = userEvent.setup();
    sendOrderMock.mockResolvedValue(result({ status: 'timeout', resultCode: -1, message: '' }));
    render(<SharedPanels {...props()} />);
    await user.click(within(panel()).getByRole('button', { name: '주문번호 3407000065 취소' }));
    await user.click(await screen.findByRole('button', { name: '✕ 주문 취소' }));
    const banner = await screen.findByTestId('cancel-result-unknown');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner.textContent).not.toContain('실패');
  });

  it('⑦ 종목 열의 긴 이름은 1줄 ellipsis 이고 전문은 title 에 있다', () => {
    const LONG = '아주아주긴종목이름바이오사이언스홀딩스우선주';
    render(<SharedPanels {...props({ account: acct({ unf: [unf({ name: LONG })] }) })} />);
    const name = panel().querySelector('[data-slot="account-embed-name"]')!;
    expect(name.className).toContain('truncate');
    expect(name.className).toContain('min-w-0');
    expect(name).toHaveAttribute('title', LONG);
  });
});

describe('SharedPanels — 잔고 · 로그', () => {
  it('⑤ 현재가를 모르는 잔고 행의 평가손익은 「—」 다 (아는 행은 계산한다)', async () => {
    const user = userEvent.setup();
    render(
      <SharedPanels
        {...props({
          account: acct({ hold: [hold(), hold({ isin: ISIN_A, name: '알테오젠', avgPrice: 400_000, qty: 10 })] }),
          priceOf: (isin) => (isin === ISIN_A ? 412_000 : undefined),
        })}
      />,
    );
    await user.click(within(panel()).getByRole('tab', { name: '잔고 (2)' }));
    const heads = within(panel()).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['종목', '수량', '매도가능', '평단', '현재가', '평가손익', '손익률']);
    const pnl = Array.from(panel().querySelectorAll('[data-slot="account-embed-pnl"]'));
    expect(pnl[0]!.textContent).toBe('—');
    expect(pnl[1]!.textContent).toContain('120,000');
  });

  it('⑥ 로그 메시지는 clamp 없이 줄바꿈된다 (min-w-0 + keep-all · truncate/line-clamp 없음)', async () => {
    const user = userEvent.setup();
    const LONG = '등락률 20% 돌파 (29.87% · KRX) — 목록에 추가됐어요 '.repeat(6);
    render(
      <SharedPanels
        {...props({ logEntries: [{ id: '1', at: '09:41:52', text: LONG, who: '씨젠' }] })}
      />,
    );
    await user.click(within(panel()).getByRole('tab', { name: '전략 로그' }));
    const msg = panel().querySelector('[data-slot="strategy-log-msg"]')!;
    expect(msg.textContent).toBe(LONG);
    expect(msg.className).toContain('min-w-0');
    expect(msg.className).toContain('[word-break:keep-all]');
    expect(msg.className).not.toMatch(/truncate|line-clamp|whitespace-nowrap/);
    expect(within(panel()).getByText('씨젠')).toBeInTheDocument();
  });
});

describe('SharedPanels — 폰 sticky · 더티 바 레이어', () => {
  it('⑧ 폰 밴드 접이식 — 「펼치기 ▴」 ↔ 「접기 ▾」 토글이고 sticky 바다', async () => {
    const user = userEvent.setup();
    render(<SharedPanels {...props()} />);
    const root = panel();
    expect(root.className).toContain('sticky');
    expect(root.className).toContain('bottom-0');
    expect(root.className).toContain('z-20');
    // ≥700 은 일반 섹션이다(컨테이너 wb 기준 — 뷰포트 분기 아님).
    expect(root.className).toContain('@min-[700px]/wb:static');

    const toggle = within(root).getByRole('button', { name: '펼치기 ▴' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.className).toContain('@min-[700px]/wb:hidden');
    await user.click(toggle);
    const again = within(root).getByRole('button', { name: '접기 ▾' });
    expect(again).toHaveAttribute('aria-expanded', 'true');
    await user.click(again);
    expect(within(root).getByRole('button', { name: '펼치기 ▴' })).toBeInTheDocument();
  });

  it('⑨ 더티 바가 떠 있으면 그 높이만큼 비킨다 — z-index 가 아니라 bottom·margin 여백이다', () => {
    const { rerender } = render(<SharedPanels {...props({ dirtyBarCount: 0 })} />);
    expect(panel().style.bottom).toBe('');
    expect(panel().style.marginBottom).toBe('');

    rerender(<SharedPanels {...props({ dirtyBarCount: 1 })} />);
    // jsdom 에는 실제 바가 없으므로 보수적 기본값으로 비킨다.
    expect(panel().style.bottom).toBe(`${DIRTY_BAR_FALLBACK_PX}px`);
    expect(panel().style.marginBottom).toBe(`${DIRTY_BAR_FALLBACK_PX}px`);
    expect(panel()).toHaveAttribute('data-dirty-reserve', 'true');
    expect(panel().className).not.toMatch(/\bz-(4[1-9]|[5-9]\d)\b|z-\[/);
  });

  /*
    ⑩ ★ 18-13 Playwright 실측 — 폰 밴드의 `sticky bottom-0` 은 **한 번도 붙지 않았다.**
      앱 셸 `main` 이 `overflow-auto` 라 sticky 의 스크롤 컨테이너가 되는데, 정작 스크롤하는 것은
      창(window)이고 `main` 은 높이 제한이 없어 스크롤하지 않는다. 그래서 패널은 페이지 끝 일반
      흐름에 놓였고, 펼친 채 중간에서 더티를 만들면 더티 바가 패널을 82px 덮었다(E13 · E15).
      `wb` 컨테이너는 layout containment 라 그 안의 `fixed` 는 뷰포트가 아니라 `wb` 에 붙는다 —
      더티 바와 같은 이유로 **`document.body` 포털 + `fixed`** 로 붙이고, 일반 흐름에는 같은 높이의
      자리(spacer)를 남겨 페이지 끝 콘텐츠가 패널 밑에 묻히지 않게 한다.
  */
  it('⑩ 폰 밴드(phoneBand)면 패널이 body 포털 `fixed bottom-0 z-20` 이고 흐름에는 자리(spacer)만 남는다', () => {
    const { container } = render(<SharedPanels {...props({ phoneBand: true })} />);
    const root = panel();
    expect(root.parentElement).toBe(document.body);
    expect(container.contains(root)).toBe(false);
    expect(root.className).toMatch(/\bfixed\b/);
    expect(root.className).toContain('bottom-0');
    expect(root.className).toContain('z-20');
    expect(root.className).not.toMatch(/\bsticky\b/);
    const spacer = container.querySelector('[data-slot="shared-panels-spacer"]');
    expect(spacer).not.toBeNull();
    expect(spacer).toHaveAttribute('aria-hidden', 'true');
  });

  it('⑩-a 폰 밴드 + 더티 바 — 패널은 바 높이만큼 위에 서고, 자리(spacer)도 그만큼 늘어난다(z-index 아님)', () => {
    const { container } = render(
      <SharedPanels {...props({ phoneBand: true, dirtyBarCount: 1 })} />,
    );
    expect(panel().style.bottom).toBe(`${DIRTY_BAR_FALLBACK_PX}px`);
    expect(panel()).toHaveAttribute('data-dirty-reserve', 'true');
    expect(panel().className).not.toMatch(/\bz-(4[1-9]|[5-9]\d)\b|z-\[/);
    const spacer = container.querySelector<HTMLElement>('[data-slot="shared-panels-spacer"]');
    // jsdom 의 패널 실측 높이는 0 — 자리 = 패널 높이 + 바 예약.
    expect(spacer!.style.height).toBe(`${DIRTY_BAR_FALLBACK_PX}px`);
  });

  it('⑩-b 폰 밴드가 아니면(≥700 · 판정 전) 포털·자리 없이 흐름 안의 일반 섹션이다', () => {
    for (const phoneBand of [false, null, undefined]) {
      const { container, unmount } = render(<SharedPanels {...props({ phoneBand })} />);
      expect(container.contains(panel())).toBe(true);
      expect(container.querySelector('[data-slot="shared-panels-spacer"]')).toBeNull();
      expect(panel().className).toContain('@min-[700px]/wb:static');
      unmount();
    }
  });

  it('⑨-a 실제 더티 바가 DOM 에 있으면 그 실측 높이만큼 비킨다', () => {
    const bar = document.createElement('div');
    bar.setAttribute('data-slot', 'dirty-action-bar');
    Object.defineProperty(bar, 'offsetHeight', { value: 96, configurable: true });
    document.body.appendChild(bar);
    try {
      render(<SharedPanels {...props({ dirtyBarCount: 1 })} />);
      expect(panel().style.bottom).toBe('96px');
    } finally {
      bar.remove();
    }
  });

  /*
    ⑨-b ★ GC-IN-01 · R1 IN-03 — 바 **수**가 바뀌면 다시 잰다. 효과가 「떠 있는가」 불리언만 보면 바
      하나가 떠 있는 동안 나타난 더 높은 두 번째 바를 모른 채 첫 바 높이로 비켜서, 공용 패널(미체결
      취소 버튼)이 새 바에 가린다.
  */
  it('⑨-b 더티 바 수가 늘면 다시 잰다 — 더 높은 두 번째 바(140)가 뜨면 140 으로 비킨다 · 0 이면 비킴 없음', () => {
    const mk = (h: number) => {
      const el = document.createElement('div');
      el.setAttribute('data-slot', 'dirty-action-bar');
      Object.defineProperty(el, 'offsetHeight', { value: h, configurable: true });
      document.body.appendChild(el);
      return el;
    };
    const first = mk(96);
    let second: HTMLElement | null = null;
    try {
      const { rerender } = render(<SharedPanels {...props({ dirtyBarCount: 1 })} />);
      expect(panel().style.bottom).toBe('96px');

      second = mk(140);
      rerender(<SharedPanels {...props({ dirtyBarCount: 2 })} />);
      expect(panel().style.bottom).toBe('140px');
      expect(panel().style.marginBottom).toBe('140px');

      first.remove();
      second.remove();
      rerender(<SharedPanels {...props({ dirtyBarCount: 0 })} />);
      expect(panel().style.bottom).toBe('');
      expect(panel()).not.toHaveAttribute('data-dirty-reserve', 'true');
    } finally {
      first.remove();
      second?.remove();
    }
  });
});
