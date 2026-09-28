import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, within } from '@testing-library/react';

import { AlertToasts } from '../workbench/alert-toasts';
import {
  TOAST_LEAVE_MS,
  TOAST_TTL_MS,
  TOAST_TTL_PHONE_MS,
  type TradingAlert,
} from '@/lib/trading-alerts';

/**
 * quick-260923-pgu Task 2 — 작업대 토스트 스택 (목업 ③A · 결정 갱신 D-36/D-27).
 *
 * 잠그는 것: `role="status"` · `aria-live="polite"` 컨테이너(항상 존재) · 종류 표식 · 묶음 배지 ·
 * ✕ 는 닫기만 · 본문 클릭은 열기 · TTL 6초(폰 4초) · 호버 정지 · 이탈 2.5초 · 병합 시 TTL 재시작.
 * quick-260928-cs1 — 상단 앵커(헤더 아래) · 최신 우선(DOM 첫째) · 재정렬로 TTL 비재시작.
 */

function alert(over: Partial<TradingAlert> = {}): TradingAlert {
  return {
    id: 'wb-alert-1',
    kind: 'fill',
    at: 1_000,
    firstAt: 1_000,
    isin: 'KR7042700005',
    exchange: 'KRX',
    accountNo: '37728502101',
    name: '한미반도체',
    side: 'B',
    price: 128_500,
    qty: 100,
    filledQty: 100,
    orderQty: 500,
    orderNo: '123',
    count: 1,
    label: '매수',
    ...over,
  };
}

const container = () => document.querySelector('[data-slot="alert-toasts"]') as HTMLElement;
const toasts = () => Array.from(document.querySelectorAll('[data-slot="alert-toast"]')) as HTMLElement[];

const realMatchMedia = window.matchMedia;
function phone(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches && query.includes('max-width: 699px'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.useFakeTimers();
  phone(false);
});

afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = realMatchMedia;
});

describe('AlertToasts — 마크업', () => {
  it('비어 있어도 role=status · aria-live=polite 컨테이너가 선다', () => {
    render(<AlertToasts alerts={[]} onOpen={vi.fn()} onDismiss={vi.fn()} />);
    expect(container()).toHaveAttribute('role', 'status');
    expect(container()).toHaveAttribute('aria-live', 'polite');
    expect(toasts()).toHaveLength(0);
  });

  it('항목마다 data-kind · 제목 · 부제 · count ≥ 2 면 N건 배지', () => {
    render(
      <AlertToasts
        alerts={[
          alert({ count: 3, filledQty: 300 }),
          alert({ id: 'wb-alert-2', kind: 'reject', label: '매수', msg: '주문가능금액 초과', name: '에코프로' }),
        ]}
        onOpen={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const [reject, fill] = toasts();
    expect(fill).toHaveAttribute('data-kind', 'fill');
    expect(fill.textContent).toContain('한미반도체');
    expect(fill.textContent).toContain('체결');
    expect(fill.textContent).toContain('매수 300/500주 · 128,500원 · KRX');
    expect(within(fill).getByText('3건')).toBeInTheDocument();
    expect(reject).toHaveAttribute('data-kind', 'reject');
    expect(reject.textContent).toContain('에코프로 주문 거부');
    expect(reject.textContent).toContain('주문가능금액 초과');
    expect(reject.textContent).not.toContain('건');
  });
});

describe('AlertToasts — 배치', () => {
  it('가장 최근 알림(배열 끝)이 DOM 첫째 — 앵커에 가장 가까운 맨 위', () => {
    render(
      <AlertToasts
        alerts={[
          alert({ id: 'wb-alert-1', at: 1_000 }),
          alert({ id: 'wb-alert-2', at: 2_000, kind: 'reject', msg: '주문가능금액 초과', name: '에코프로' }),
        ]}
        onOpen={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const [first, second] = toasts();
    expect(first).toHaveAttribute('data-kind', 'reject');
    expect(first.textContent).toContain('에코프로');
    expect(second).toHaveAttribute('data-kind', 'fill');
    expect(second.textContent).toContain('한미반도체');
  });

  it('컨테이너는 헤더 아래 상단 앵커 한 식만 — bottom 앵커 0 · 폰 top 변형 0', () => {
    render(<AlertToasts alerts={[]} onOpen={vi.fn()} onDismiss={vi.fn()} />);
    const tokens = container().className.split(/\s+/).filter(Boolean);
    expect(tokens.filter((t) => /(^|:)bottom-/.test(t))).toEqual([]);
    expect(tokens.filter((t) => t.startsWith('max-[699px]:top-'))).toEqual([]);
    for (const t of [
      'top-[calc(3.5rem+8px+var(--app-safe-top))]',
      'right-3',
      'w-[min(340px,calc(100%-24px))]',
      'max-[699px]:left-3',
      'max-[699px]:w-auto',
    ]) {
      expect(tokens).toContain(t);
    }
  });

  it('새 알림이 맨 위로 와도 기존 토스트는 재마운트되지 않는다 — TTL 이 다시 시작하지 않음', () => {
    const onDismiss = vi.fn();
    const a1 = alert({ id: 'wb-alert-1', at: 1_000 });
    const a2 = alert({ id: 'wb-alert-2', at: 2_000, name: '에코프로' });
    const view = render(<AlertToasts alerts={[a1]} onOpen={vi.fn()} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    view.rerender(<AlertToasts alerts={[a1, a2]} onOpen={vi.fn()} onDismiss={onDismiss} />);
    expect(toasts()[0].textContent).toContain('에코프로');
    act(() => {
      vi.advanceTimersByTime(TOAST_TTL_MS - 3_000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('wb-alert-1');
  });
});

describe('AlertToasts — 조작', () => {
  it('✕ 는 onDismiss 만 · onOpen 호출 0', () => {
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(<AlertToasts alerts={[alert()]} onOpen={onOpen} onDismiss={onDismiss} />);
    fireEvent.click(within(toasts()[0]).getByRole('button', { name: '알림 닫기' }));
    expect(onDismiss).toHaveBeenCalledWith('wb-alert-1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('본문 클릭 → onOpen(alert)', () => {
    const onOpen = vi.fn();
    const a = alert();
    render(<AlertToasts alerts={[a]} onOpen={onOpen} onDismiss={vi.fn()} />);
    fireEvent.click(toasts()[0]);
    expect(onOpen).toHaveBeenCalledWith(a);
  });
});

describe('AlertToasts — 타이머', () => {
  it('TTL 6000ms — 5999ms 에는 미호출 · 병합으로 at 이 바뀌면 다시 6000ms', () => {
    const onDismiss = vi.fn();
    const view = render(<AlertToasts alerts={[alert()]} onOpen={vi.fn()} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_TTL_MS - 1_000);
    });
    view.rerender(<AlertToasts alerts={[alert({ at: 2_000, count: 2 })]} onOpen={vi.fn()} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_TTL_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledWith('wb-alert-1');
  });

  it('호버 중에는 10초가 지나도 안 닫히고, 떠나면 2500ms 뒤 닫힌다', () => {
    const onDismiss = vi.fn();
    render(<AlertToasts alerts={[alert()]} onOpen={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.mouseEnter(toasts()[0]);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(toasts()[0]);
    act(() => {
      vi.advanceTimersByTime(TOAST_LEAVE_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledWith('wb-alert-1');
  });

  it('폰(max-width: 699px) 은 TTL 4000ms', () => {
    phone(true);
    const onDismiss = vi.fn();
    render(<AlertToasts alerts={[alert()]} onOpen={vi.fn()} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_TTL_PHONE_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
