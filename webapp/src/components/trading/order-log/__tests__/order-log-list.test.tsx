import { describe, it, expect, vi } from 'vitest';
import { act, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OrderLogList } from '../order-log-list';
import { FIXTURE_STOCK_NAME, STRATEGY_DAY_BY_NAME, STRATEGY_DAY_GOLDEN } from '@/test-fixtures/strategy-day';

/**
 * Phase 25-01 — 주문로그 목록 F-A 한 줄 (UI-SPEC ②-0 · D-05 · D-09).
 *
 * 잠그는 것: BuyOrder 12451 한 건이 조립기(shared) 평문과 **같은 문장**으로 그려진다(textContent 공백 정규화 =
 * 골든) · 줄 식별 속성 · 구분 칸 색 축(매수 `--up`) · 잘림 보완 `title` = 줄 전체 평문(R11).
 */

const normalize = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

describe('OrderLogList (panel · F-A)', () => {
  const buy = STRATEGY_DAY_BY_NAME.buy12451!;
  const golden = STRATEGY_DAY_GOLDEN.buy12451!.logLine;

  it('BuyOrder 1건 → order-log-line 1줄 · data-kind 3 · data-group 1 · 문장이 골든과 같다', () => {
    const { container } = render(<OrderLogList rows={[buy]} variant="panel" nameOf={() => FIXTURE_STOCK_NAME} />);
    const list = container.querySelector('ol[data-slot="order-log-list"]');
    expect(list?.getAttribute('data-surface')).toBe('panel');
    const lines = container.querySelectorAll('li[data-slot="order-log-line"]');
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.getAttribute('data-kind')).toBe('3');
    expect(line.getAttribute('data-group')).toBe('1');
    expect(normalize(line.textContent)).toBe(golden);
    expect(line.getAttribute('title')).toBe(golden);
  });

  it('구분 칸은 매수 방향 색(--up) · 600', () => {
    const { container } = render(<OrderLogList rows={[buy]} variant="panel" nameOf={() => FIXTURE_STOCK_NAME} />);
    const kind = container.querySelector('[data-slot="order-log-kind"]');
    expect(kind?.textContent).toBe('[선매수]');
    expect(kind?.className).toContain('text-[var(--up)]');
    expect(kind?.className).toContain('font-semibold');
  });

  it('시세 이벤트는 주문번호 칸이 없다', () => {
    const exposed = STRATEGY_DAY_BY_NAME.exposed!;
    const { container } = render(<OrderLogList rows={[exposed]} variant="panel" nameOf={() => FIXTURE_STOCK_NAME} />);
    const line = container.querySelector('li[data-slot="order-log-line"]');
    expect(normalize(line?.textContent ?? '')).toMatch(/^\[09:42:13\.215\]\[[^\]]+\] KRX \| ○○전자/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Phase 25-07 Task 2 — 목록 확장: 172px 스크롤러 · 상태 · 새 줄 강조 · sticky 핀 · 폰 밴드 줄 펼침 (UI-SPEC ②-0)
 * ──────────────────────────────────────────────────────────────────────────── */

describe('OrderLogList — 스크롤러 · title · 강조 (25-07)', () => {
  const rows = [STRATEGY_DAY_BY_NAME.exposed!, STRATEGY_DAY_BY_NAME.buy12451!];
  const nameOf = () => FIXTURE_STOCK_NAME;

  it('panel 스크롤러: order-log-body · tabindex 0 · 이름 「주문로그 목록」 · max-height 172px · 라이브 영역 아님', () => {
    const { container } = render(<OrderLogList rows={rows} variant="panel" nameOf={nameOf} />);
    const body = container.querySelector<HTMLElement>('[data-slot="order-log-body"]')!;
    expect(body).not.toBeNull();
    expect(body.getAttribute('tabindex')).toBe('0');
    expect(body.getAttribute('aria-label')).toBe('주문로그 목록');
    expect(body.style.maxHeight).toBe('172px');
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[data-slot="order-log"]')?.getAttribute('data-surface')).toBe('panel');
  });

  it('비폰 밴드: 줄 title = 줄 전체 평문 · 줄 버튼 없음', () => {
    const { container } = render(<OrderLogList rows={rows} variant="panel" nameOf={nameOf} phoneBand={false} />);
    const lines = container.querySelectorAll('li[data-slot="order-log-line"]');
    expect(lines[1]!.getAttribute('title')).toBe(STRATEGY_DAY_GOLDEN.buy12451!.logLine);
    expect(container.querySelector('li[data-slot="order-log-line"] button')).toBeNull();
  });

  it('newKeys 에 든 줄만 data-new · 빠지면 속성 제거', () => {
    const buyKey = 'KB|ep-25|2';
    const { container, rerender } = render(
      <OrderLogList rows={rows} variant="panel" nameOf={nameOf} newKeys={new Set([buyKey])} />,
    );
    const lines = () => container.querySelectorAll('li[data-slot="order-log-line"]');
    expect(lines()[0]!.hasAttribute('data-new')).toBe(false);
    expect(lines()[1]!.hasAttribute('data-new')).toBe(true);
    rerender(<OrderLogList rows={rows} variant="panel" nameOf={nameOf} newKeys={new Set()} />);
    expect(lines()[1]!.hasAttribute('data-new')).toBe(false);
  });
});

describe('OrderLogList — 상태 (25-07)', () => {
  const nameOf = () => FIXTURE_STOCK_NAME;
  const buy = STRATEGY_DAY_BY_NAME.buy12451!;

  it('loading · 줄 0 → 「불러오는 중…」 · 줄이 있으면 로딩 줄 없음', () => {
    const { container, rerender } = render(<OrderLogList rows={[]} variant="panel" nameOf={nameOf} status="loading" />);
    expect(container.querySelector('[data-slot="order-log-loading"]')?.textContent).toBe('불러오는 중…');
    expect(container.querySelector('[data-slot="order-log-empty"]')).toBeNull();
    rerender(<OrderLogList rows={[buy]} variant="panel" nameOf={nameOf} status="loading" />);
    expect(container.querySelector('[data-slot="order-log-loading"]')).toBeNull();
  });

  it('error → 맨 위 role=status 문구 + 「다시 시도」(onRetry 1회) · 아래 줄 유지', async () => {
    const onRetry = vi.fn();
    const { container } = render(
      <OrderLogList rows={[buy]} variant="panel" nameOf={nameOf} status="error" onRetry={onRetry} />,
    );
    const err = container.querySelector('[data-slot="order-log-error"]')!;
    expect(err.getAttribute('role')).toBe('status');
    expect(err.textContent).toContain('오늘 주문로그를 불러오지 못했어요');
    const body = container.querySelector('[data-slot="order-log-body"]')!;
    expect(body.firstElementChild).toBe(err);
    await userEvent.click(within(err as HTMLElement).getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('li[data-slot="order-log-line"]')).toHaveLength(1);
  });

  it('ready · 줄 0 → 빈 박스 제목 · 본문 / 필터 결과 0 → 제목만 「조건에 맞는 로그가 없어요」', () => {
    const { container, rerender } = render(<OrderLogList rows={[]} variant="panel" nameOf={nameOf} status="ready" />);
    const empty = () => container.querySelector('[data-slot="order-log-empty"]');
    expect(empty()?.textContent).toContain('오늘 주문로그가 없어요');
    expect(empty()?.textContent).toContain('상따 주문과 상한가 노출·진입이 생기면 여기에 쌓여요');
    rerender(<OrderLogList rows={[]} variant="panel" nameOf={nameOf} status="ready" filteredEmpty />);
    expect(normalize(empty()?.textContent ?? '')).toBe('조건에 맞는 로그가 없어요');
  });
});

/** jsdom 은 레이아웃이 없다 — 스크롤러 기하를 심는다(줄 20px · 높이 172). */
function installGeometry(el: HTMLElement, state: { lines: number }) {
  let top = 0;
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 172 });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => state.lines * 20 });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = v;
    },
  });
}

describe('OrderLogList — sticky 핀 (25-07 · R1)', () => {
  const nameOf = () => FIXTURE_STOCK_NAME;
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...STRATEGY_DAY_BY_NAME.exposed!, seq: 1000 + i }));

  it('올려 보는 중 3줄 → 핀 「새 로그 3 · 맨 아래로 ↓」 · 클릭 → 맨 아래 · 핀 사라짐 · 포커스 스크롤러', async () => {
    const geo = { lines: 12 };
    const { container, rerender } = render(<OrderLogList rows={many(12)} variant="panel" nameOf={nameOf} />);
    const body = container.querySelector<HTMLElement>('[data-slot="order-log-body"]')!;
    installGeometry(body, geo);
    expect(container.querySelector('[data-slot="order-log-pin"]')).toBeNull();
    act(() => {
      body.scrollTop = 0;
      body.dispatchEvent(new Event('scroll'));
    });
    geo.lines = 15;
    rerender(<OrderLogList rows={many(15)} variant="panel" nameOf={nameOf} />);
    const pin = container.querySelector<HTMLButtonElement>('button[data-slot="order-log-pin"]');
    expect(pin?.textContent).toBe('새 로그 3 · 맨 아래로 ↓');
    expect(body.scrollTop).toBe(0);
    await userEvent.click(pin!);
    expect(body.scrollTop).toBe(15 * 20);
    expect(container.querySelector('[data-slot="order-log-pin"]')).toBeNull();
    expect(document.activeElement).toBe(body);
  });

  it('card 변형은 핀이 없다(showPin 기본 false)', () => {
    const geo = { lines: 12 };
    const { container, rerender } = render(<OrderLogList rows={many(12)} variant="card" nameOf={nameOf} />);
    const body = container.querySelector<HTMLElement>('[data-slot="order-log-body"]')!;
    installGeometry(body, geo);
    act(() => {
      body.scrollTop = 0;
      body.dispatchEvent(new Event('scroll'));
    });
    geo.lines = 15;
    rerender(<OrderLogList rows={many(15)} variant="card" nameOf={nameOf} />);
    expect(container.querySelector('[data-slot="order-log-pin"]')).toBeNull();
  });
});

describe('OrderLogList — 폰 밴드 줄 펼침 (25-07 · 결정 2-A)', () => {
  const rows = [STRATEGY_DAY_BY_NAME.exposed!, STRATEGY_DAY_BY_NAME.buy12451!];
  const nameOf = () => FIXTURE_STOCK_NAME;

  it('줄 내용이 aria-expanded 버튼 · 클릭 → true + data-open · 다시 클릭 → 접힘 · title 없음', async () => {
    const { container } = render(<OrderLogList rows={rows} variant="panel" nameOf={nameOf} phoneBand />);
    const line = container.querySelectorAll<HTMLElement>('li[data-slot="order-log-line"]')[1]!;
    expect(line.hasAttribute('title')).toBe(false);
    const btn = within(line).getByRole('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(line.hasAttribute('data-open')).toBe(true);
    // 다른 줄은 그대로(여러 줄 동시 펼침 허용 · 한 줄만 바뀜)
    expect(container.querySelectorAll('li[data-open]')).toHaveLength(1);
    await userEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(line.hasAttribute('data-open')).toBe(false);
  });

  it('resetKey 가 바뀌면 전부 접힌다', async () => {
    const { container, rerender } = render(
      <OrderLogList rows={rows} variant="panel" nameOf={nameOf} phoneBand resetKey="a" />,
    );
    for (const btn of container.querySelectorAll<HTMLButtonElement>('li[data-slot="order-log-line"] button')) {
      await userEvent.click(btn);
    }
    expect(container.querySelectorAll('li[data-open]')).toHaveLength(2);
    rerender(<OrderLogList rows={rows} variant="panel" nameOf={nameOf} phoneBand resetKey="b" />);
    expect(container.querySelectorAll('li[data-open]')).toHaveLength(0);
  });

  it('폰 밴드 판정 전(null)은 비폰 규칙 — 버튼 없음 · title 있음', () => {
    const { container } = render(<OrderLogList rows={rows} variant="panel" nameOf={nameOf} phoneBand={null} />);
    expect(container.querySelector('li[data-slot="order-log-line"] button')).toBeNull();
    expect(container.querySelector('li[data-slot="order-log-line"]')?.hasAttribute('title')).toBe(true);
  });
});
