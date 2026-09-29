import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

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
