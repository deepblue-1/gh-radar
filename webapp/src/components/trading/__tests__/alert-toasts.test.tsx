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
    render(<AlertToasts accounts={[]} currentAccountNo="" alerts={[]} onOpen={vi.fn()} onDismiss={vi.fn()} />);
    expect(container()).toHaveAttribute('role', 'status');
    expect(container()).toHaveAttribute('aria-live', 'polite');
    expect(toasts()).toHaveLength(0);
  });

  it('항목마다 data-kind · 제목 · 부제 · count ≥ 2 면 N건 배지', () => {
    render(
      <AlertToasts accounts={[]} currentAccountNo=""
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
      <AlertToasts accounts={[]} currentAccountNo=""
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
    render(<AlertToasts accounts={[]} currentAccountNo="" alerts={[]} onOpen={vi.fn()} onDismiss={vi.fn()} />);
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
    const view = render(<AlertToasts accounts={[]} currentAccountNo="" alerts={[a1]} onOpen={vi.fn()} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    view.rerender(<AlertToasts accounts={[]} currentAccountNo="" alerts={[a1, a2]} onOpen={vi.fn()} onDismiss={onDismiss} />);
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
    render(<AlertToasts accounts={[]} currentAccountNo="" alerts={[alert()]} onOpen={onOpen} onDismiss={onDismiss} />);
    fireEvent.click(within(toasts()[0]).getByRole('button', { name: '알림 닫기' }));
    expect(onDismiss).toHaveBeenCalledWith('wb-alert-1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('본문 클릭 → onOpen(alert)', () => {
    const onOpen = vi.fn();
    const a = alert();
    render(<AlertToasts accounts={[]} currentAccountNo="" alerts={[a]} onOpen={onOpen} onDismiss={vi.fn()} />);
    fireEvent.click(toasts()[0]);
    expect(onOpen).toHaveBeenCalledWith(a);
  });
});

describe('AlertToasts — 타이머', () => {
  it('TTL 6000ms — 5999ms 에는 미호출 · 병합으로 at 이 바뀌면 다시 6000ms', () => {
    const onDismiss = vi.fn();
    const view = render(<AlertToasts accounts={[]} currentAccountNo="" alerts={[alert()]} onOpen={vi.fn()} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_TTL_MS - 1_000);
    });
    view.rerender(<AlertToasts accounts={[]} currentAccountNo="" alerts={[alert({ at: 2_000, count: 2 })]} onOpen={vi.fn()} onDismiss={onDismiss} />);
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
    render(<AlertToasts accounts={[]} currentAccountNo="" alerts={[alert()]} onOpen={vi.fn()} onDismiss={onDismiss} />);
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
    render(<AlertToasts accounts={[]} currentAccountNo="" alerts={[alert()]} onOpen={vi.fn()} onDismiss={onDismiss} />);
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

/* ── Phase 32 D-03 · UI-SPEC S4 — 토스트 계좌 줄 ──────────────────────────────────────── */

describe('P32 토스트 계좌 줄 (D-03 · S4)', () => {
  const A = '1234567801';
  const B = '8765432101';
  const ACCOUNTS = [
    { accountNo: A, name: '김알렉스', serverKey: 'KB120' },
    { accountNo: B, name: '교보 종합', serverKey: 'KYOBO119' },
  ];
  const partOf = (el: Element, part: string) => el.querySelector(`[data-part="${part}"]`) as HTMLElement | null;

  it('계좌 있는 알림 → 제목 바로 아래 둘째 줄 「계좌 {번호 · 상품명 · 서버키}」 · 그 아래 기존 부제', () => {
    render(
      <AlertToasts
        alerts={[alert({ accountNo: B })]}
        onOpen={vi.fn()}
        onDismiss={vi.fn()}
        accounts={ACCOUNTS}
        currentAccountNo={A}
      />,
    );
    const t = toasts()[0];
    const line = partOf(t, 'account')!;
    expect(line).not.toBeNull();
    expect(line.textContent).toContain('계좌 8765432101 · 교보 종합 · KYOBO119');
    const text = partOf(t, 'text')!;
    const kids = Array.from(text.children).filter((c) => c.hasAttribute('data-part'));
    const order = kids.map((c) => c.getAttribute('data-part'));
    expect(order.indexOf('account')).toBeLessThan(order.indexOf('sub'));
    expect(line.className).toContain('text-[11px]');
  });

  it('목록 밖 계좌 → 「계좌 {번호}」 · 「이 계좌 보기」 힌트 없음(전환할 수 없다)', () => {
    render(
      <AlertToasts
        alerts={[alert({ accountNo: '5555000101' })]}
        onOpen={vi.fn()}
        onDismiss={vi.fn()}
        accounts={ACCOUNTS}
        currentAccountNo={A}
      />,
    );
    const t = toasts()[0];
    expect(partOf(t, 'account')!.textContent).toBe('계좌 5555000101');
    expect(partOf(t, 'account-hint')).toBeNull();
  });

  it('돌파 알림(계좌 없음) → 계좌 줄 없음 · 기존 2줄(제목 · 부제) 그대로', () => {
    render(
      <AlertToasts
        alerts={[alert({ kind: 'breakout', accountNo: undefined, label: '', breakout: { changeRate: 21 } })]}
        onOpen={vi.fn()}
        onDismiss={vi.fn()}
        accounts={ACCOUNTS}
        currentAccountNo={A}
      />,
    );
    const t = toasts()[0];
    expect(partOf(t, 'account')).toBeNull();
    expect(partOf(t, 'account-hint')).toBeNull();
    expect(partOf(t, 'sub')).not.toBeNull();
  });

  it('알림 계좌 = 지금 작업대 계좌 → 힌트 없음 · 다르면 「이 계좌 보기 ›」(› 는 aria-hidden)', () => {
    render(
      <AlertToasts
        alerts={[alert({ id: 'x1', accountNo: A }), alert({ id: 'x2', accountNo: B, at: 2_000 })]}
        onOpen={vi.fn()}
        onDismiss={vi.fn()}
        accounts={ACCOUNTS}
        currentAccountNo={A}
      />,
    );
    const [newest, older] = toasts();
    expect(partOf(older, 'account')!.textContent).toContain('계좌 1234567801 · 김알렉스 · KB120');
    expect(partOf(older, 'account-hint')).toBeNull();
    const hint = partOf(newest, 'account-hint')!;
    expect(hint).not.toBeNull();
    expect(hint.textContent).toBe('이 계좌 보기 ›');
    expect(hint.querySelector('[aria-hidden="true"]')?.textContent).toBe('›');
    expect(hint.className).toContain('whitespace-nowrap');
  });

  it('본문 버튼 접근 이름에 계좌 줄 · 힌트 글자가 들어간다(힌트는 별도 버튼이 아니다)', () => {
    const onOpen = vi.fn();
    render(
      <AlertToasts
        alerts={[alert({ accountNo: B })]}
        onOpen={onOpen}
        onDismiss={vi.fn()}
        accounts={ACCOUNTS}
        currentAccountNo={A}
      />,
    );
    const t = toasts()[0];
    const body = within(t).getByRole('button', { name: /계좌 8765432101 · 교보 종합 · KYOBO119\s*이 계좌 보기/ });
    expect(body.getAttribute('data-part')).toBe('text');
    expect(within(t).getAllByRole('button')).toHaveLength(2); // 본문 · ✕ — 힌트 버튼 없음
    fireEvent.click(body);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('지금 계좌와 무관하게 전부 뜬다 — 다른 계좌 알림도 거르지 않는다', () => {
    render(
      <AlertToasts
        alerts={[alert({ id: 'y1', accountNo: B }), alert({ id: 'y2', accountNo: B, at: 3_000, kind: 'reject', msg: '잔고 부족' })]}
        onOpen={vi.fn()}
        onDismiss={vi.fn()}
        accounts={ACCOUNTS}
        currentAccountNo={A}
      />,
    );
    expect(toasts()).toHaveLength(2);
    // 거부 토스트도 계좌 줄을 단다 · 사유 원문은 기존 부제 줄.
    const reject = toasts()[0];
    expect(reject).toHaveAttribute('data-kind', 'reject');
    expect(partOf(reject, 'account')!.textContent).toContain('계좌 8765432101');
    expect(partOf(reject, 'sub')!.textContent).toContain('잔고 부족');
    expect(container()).toHaveAttribute('role', 'status');
  });
});
