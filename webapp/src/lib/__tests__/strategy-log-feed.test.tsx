import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { RelayLimitChaser, RelayServerMsg } from '@gh-radar/shared';

import { EMPTY_RELAY_VALUE, RelayContext, type RelayContextValue } from '@/lib/relay-provider';
import type { RelayServerMessageEntry } from '@/lib/use-relay-socket';
import {
  diffLimitChasers,
  StrategyLogFeedProvider,
  useStrategyLogFeed,
} from '@/lib/strategy-log-feed';

/**
 * Phase 21 Plan 32 Task 2 — 전 종목 전략 로그 공급자 (D-25a · G-21-R3-2).
 *
 * 잠그는 것:
 *   - `diffLimitChasers` 는 작업대 카드와 **같은 순수 함수**(`strategyLogLine` · `isRuntimeOnlyEcho`)로
 *     문장을 짓는다 — 등록 1줄 · 내용 같은 에코 0줄 · 카운터만 다른 에코 0줄 · 빠진 키는 삭제 1줄.
 *   - 공급자는 relay 컨텍스트에서 **파생만** 한다 — 같은 통지는 한 번 · 전부 정지 null→값이면 1줄 ·
 *     최신이 index 0 · 200 줄 상한.
 */

const ACCOUNT = '37728502101';
const ISIN_A = 'KR7086520004';
const ISIN_B = 'KR7247540008';

function chaser(isin: string, over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  const exchange = over.exchange ?? 'KRX';
  return {
    isin,
    accountNo: ACCOUNT,
    market: 'K',
    exchange,
    crud: 'C',
    key: `${isin}:${ACCOUNT}:${exchange}`,
    buyOrderPrice: 130_000,
    buyOrderQty: 1,
    buyWatchPrice: 130_000,
    buyWatchQty: 10_000,
    buyMinTradeQty: 30_000,
    buyWatchSide: '1',
    buyTradeQtyEnabled: false,
    buyEnabled: true,
    buyOrderAmount: 10,
    sellOrderPrice: 130_000,
    sellOrderQty: 0,
    sellWatchPrice: 130_000,
    sellWatchQty: 10,
    sellMinTradeQty: 30_000,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
    sellQtyTrackBaseline: 0,
    sellEntryLatched: false,
    sweepWatchPrice: 130_000,
    sweepEnabled: false,
    sweepMinTickCount: 3,
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    cancelQtyEnabled: false,
    cancelWatchQty: 10,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
    cancelQtyTrackBaseline: 0,
    cancelEntryLatched: false,
    buyEntryLatched: false,
    ...over,
  };
}

function msg(m: string, over: Partial<RelayServerMsg> = {}): RelayServerMessageEntry {
  return {
    t: 'msg',
    lv: 'INFO',
    m,
    i: ISIN_A,
    a: ACCOUNT,
    src: 'LimitChaser',
    receivedAt: '10:00:00',
    ...over,
  } as RelayServerMessageEntry;
}

const mapOf = (...items: RelayLimitChaser[]) => new Map(items.map((i) => [i.key, i]));

describe('diffLimitChasers — 작업대와 같은 문장 (순수)', () => {
  it('처음 보는 전략 = 등록 줄 1개', () => {
    const a = chaser(ISIN_A);
    const lines = diffLimitChasers(new Map(), [a]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ key: a.key, isin: ISIN_A, exchange: 'KRX' });
    expect(lines[0].text).toBe('전략이 등록됐어요 · 매수 무장');
  });

  it('내용이 같은 새 객체 = 0줄 · 런타임 카운터만 다른 에코도 0줄', () => {
    const a = chaser(ISIN_A);
    expect(diffLimitChasers(mapOf(a), [{ ...a }])).toEqual([]);
    expect(diffLimitChasers(mapOf(a), [{ ...a, sellOrderQty: 7, sellQtyTrackBaseline: 3 }])).toEqual([]);
  });

  it('직전에만 있던 키 = 삭제 줄 1개', () => {
    const a = chaser(ISIN_A);
    const b = chaser(ISIN_B);
    const lines = diffLimitChasers(mapOf(a, b), [a]);
    expect(lines).toHaveLength(1);
    expect(lines[0].key).toBe(b.key);
    expect(lines[0].text).toMatch(/^전략이 삭제됐어요/);
  });

  it('무장 해제는 「발주」라고 쓰지 않는다 — 이 화면은 발주 맥락을 모른다(T-21-88)', () => {
    const a = chaser(ISIN_A);
    const lines = diffLimitChasers(mapOf(a), [{ ...a, buyEnabled: false }]);
    expect(lines.map((l) => l.text)).toEqual(['매수 무장 해제']);
  });
});

function relay(over: Partial<RelayContextValue> = {}): RelayContextValue {
  return { ...EMPTY_RELAY_VALUE, status: 'ready', ...over } as RelayContextValue;
}

function Rows() {
  const entries = useStrategyLogFeed();
  return (
    <ol>
      {entries.map((e) => (
        <li key={e.id} data-testid="row" data-level={e.level ?? 'info'}>
          {e.who ?? ''}|{e.text}
        </li>
      ))}
    </ol>
  );
}

function view(value: RelayContextValue): ReactNode {
  return (
    <RelayContext.Provider value={value}>
      <StrategyLogFeedProvider>
        <Rows />
      </StrategyLogFeedProvider>
    </RelayContext.Provider>
  );
}

const rows = () => screen.queryAllByTestId('row').map((r) => r.textContent);

describe('StrategyLogFeedProvider — relay 컨텍스트에서 파생만', () => {
  it('Provider 밖이면 빈 배열', () => {
    render(<Rows />);
    expect(rows()).toEqual([]);
  });

  it('전략 전이는 종목명(NXT 꼬리 포함)과 함께 최신이 맨 위로 쌓인다', () => {
    const a = chaser(ISIN_A, { name: '에코프로', exchange: 'NXT' });
    const { rerender } = render(view(relay({ limitChasers: [a] })));
    expect(rows()).toEqual(['에코프로 · NXT|전략이 등록됐어요 · 매수 무장']);
    rerender(view(relay({ limitChasers: [{ ...a, sellEnabled: true }] })));
    expect(rows()).toEqual([
      '에코프로 · NXT|매도 무장 — 대기 (지지벽 미관측)',
      '에코프로 · NXT|전략이 등록됐어요 · 매수 무장',
    ]);
  });

  it('같은 통지 항목은 한 번만 — 새 항목만 앞에 쌓인다 · 상따 몫만(VI 통지는 VI 줄 몫)', () => {
    const m1 = msg('매수 1주문 접수', { src: 'LimitChaser' });
    const vi = msg('VI 발동', { src: 'VITrigger' });
    const { rerender } = render(view(relay({ messages: [m1] })));
    rerender(view(relay({ messages: [m1] })));
    expect(rows()).toHaveLength(1);
    const m2 = msg('주문가능금액 부족', { lv: 'ERROR', src: 'SetLimitChaser' });
    rerender(view(relay({ messages: [m2, vi, m1] })));
    expect(rows()).toEqual([
      `${ISIN_A}|[상따] 서버가 거부했어요 — 주문가능금액 부족`,
      `${ISIN_A}|[상따] 서버 통지 — 매수 1주문 접수`,
    ]);
    expect(screen.getAllByTestId('row')[0]).toHaveAttribute('data-level', 'error');
  });

  it('전부 정지 null → 값 = 일괄 비활성화 줄 1개 (같은 값 재렌더는 0줄)', () => {
    const { rerender } = render(view(relay({ strategiesDisabled: null })));
    const disabled = { t: 'strategies.disabled' } as unknown as RelayContextValue['strategiesDisabled'];
    rerender(view(relay({ strategiesDisabled: disabled })));
    rerender(view(relay({ strategiesDisabled: disabled })));
    expect(rows()).toEqual(['|전부 정지가 반영됐어요 · 서버가 모든 전략을 비활성화했어요']);
  });

  it('최대 200 줄 — 오래된 줄부터 버린다', () => {
    const many = Array.from({ length: 205 }, (_, i) => msg(`통지 ${i}`));
    render(view(relay({ messages: many })));
    const r = rows();
    expect(r).toHaveLength(200);
    // messages 는 최신이 index 0 — 가장 최신(통지 0)이 맨 위, 가장 오래된 5줄(200~204)이 잘린다.
    expect(r[0]).toContain('통지 0');
    expect(r.some((t) => t?.includes('통지 204'))).toBe(false);
  });
});
