import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RelayTapeEntry } from '@gh-radar/shared';

import { TradeTape, deriveTapeSides, formatTapeTime } from '../trade-tape';

/**
 * Phase 15 Plan 13 — 체결 테이프 계약 검증.
 *
 * 잠그는 규칙: 최신 상단 · 부호+라벨 병기(색 비의존) · 링버퍼 200 ·
 * "사용자가 스크롤을 내리면 자동 스크롤 정지" · 구분 추정 규칙.
 */

const BASE = 98_000;

function entry(over: Partial<RelayTapeEntry> = {}): RelayTapeEntry {
  return { t: '093015123456', p: 98_100, cs: '2', c: 100, q: 10, cv: 1_000, ...over };
}

/** 최신이 index 0 인 배열을 만든다. cv 는 오래된 것부터 증가한다. */
function tape(prices: number[]): RelayTapeEntry[] {
  return prices.map((p, i) =>
    entry({ p, q: 10 + i, cv: 10_000 - i, t: `0930${String(10 + i).padStart(2, '0')}000000` }),
  );
}

describe('formatTapeTime', () => {
  it('거래소 원문 "HHMMSSuuuuuu" 에서 마이크로초를 절삭한다', () => {
    expect(formatTapeTime('093015123456')).toBe('09:30:15');
    expect(formatTapeTime('093015')).toBe('09:30:15');
    // 형태를 알 수 없으면 원문을 그대로 둔다(임의 해석 금지).
    expect(formatTapeTime('N/A')).toBe('N/A');
  });
});

describe('deriveTapeSides', () => {
  it('① 최우선호가 비교가 1순위 — 매도1 이상이면 매수 체결, 매수1 이하면 매도 체결', () => {
    const entries = [entry({ p: 98_100 }), entry({ p: 97_900 })];
    expect(deriveTapeSides(entries, 98_100, 97_900)).toEqual(['B', 'S']);
  });

  it('② 최우선호가가 없으면 틱 규칙으로 폴백하고 zero-tick 은 직전 판정을 상속한다', () => {
    // 최신 → 과거 순: 98,200 / 98,200 / 98,100 / 98,300
    const entries = [
      entry({ p: 98_200 }),
      entry({ p: 98_200 }),
      entry({ p: 98_100 }),
      entry({ p: 98_300 }),
    ];
    // 가장 오래된 98,300 은 기준이 없어 기본값 B, 98,100 은 하락 → S,
    // 98,200 은 상승 → B, 그 다음 98,200 은 zero-tick → 직전(B) 상속.
    expect(deriveTapeSides(entries)).toEqual(['B', 'B', 'S', 'B']);
  });
});

describe('TradeTape', () => {
  it('③ 최신이 맨 위이고 매수/매도를 부호+라벨로 병기한다 (WCAG 1.4.1)', () => {
    render(
      <TradeTape
        entries={tape([98_200, 97_900])}
        isStale={false}
        basePrice={BASE}
        bestAsk={98_200}
        bestBid={97_900}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1); // 헤더 제외
    expect(rows[0]).toHaveTextContent('98,200');
    expect(screen.getByText('▲ 매수')).toBeInTheDocument();
    expect(screen.getByText('▼ 매도')).toBeInTheDocument();
    expect(screen.getByText('09:30:10')).toBeInTheDocument();
  });

  it('④ 체결이 없으면 빈 상태 문구를 그린다 (UI-SPEC verbatim)', () => {
    render(<TradeTape entries={[]} isStale={false} basePrice={BASE} />);

    expect(screen.getByText('아직 체결이 없어요')).toBeInTheDocument();
    expect(
      screen.getByText('장 시작(09:00) 이후 체결이 발생하면 위에서부터 쌓여요.'),
    ).toBeInTheDocument();
  });

  it('⑤ 링버퍼 상한 200건 — 초과분은 하단부터 잘린다', () => {
    const many = tape(Array.from({ length: 260 }, (_, i) => 98_000 + i));
    render(<TradeTape entries={many} isStale={false} basePrice={BASE} />);

    // 헤더 1행 + 본문 200행.
    expect(screen.getAllByRole('row')).toHaveLength(201);
  });

  it('⑥ 재접속 중(isStale)에도 값을 비우지 않고 opacity 로만 감쇠한다', () => {
    const { container } = render(
      <TradeTape entries={tape([98_200, 97_900])} isStale basePrice={BASE} />,
    );

    const root = container.querySelector('[data-slot="trade-tape"]');
    expect(root).toHaveAttribute('data-stale', 'true');
    expect(root?.className).toContain('opacity-[.55]');
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('⑦ 스크롤을 내리면 자동 스크롤이 멈추고 `새 체결 N건 · 맨 위로` 핀이 뜬다', async () => {
    const user = userEvent.setup();
    const first = tape([98_200, 98_100]);
    const { container, rerender } = render(
      <TradeTape entries={first} isStale={false} basePrice={BASE} />,
    );

    const scroller = container.querySelector('[data-slot="trade-tape"] > div');
    expect(scroller).not.toBeNull();

    // 아직 맨 위 → 핀 없음.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    // 사용자가 아래로 스크롤 → 자동 스크롤 정지.
    fireEvent.scroll(scroller!, { target: { scrollTop: 120 } });

    // 신규 배치 2건 도착.
    const next = [entry({ p: 98_400, cv: 10_002 }), entry({ p: 98_300, cv: 10_001 }), ...first];
    rerender(<TradeTape entries={next} isStale={false} basePrice={BASE} />);

    const pin = await screen.findByRole('button', { name: /새 체결 2건 · 맨 위로/ });
    await user.click(pin);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('⑧ 구분이 추정임을 화면에 밝힌다 (게이트웨이가 매수/매도 플래그를 주지 않는다)', () => {
    render(<TradeTape entries={tape([98_200])} isStale={false} basePrice={BASE} />);
    expect(
      screen.getByText('구분은 최우선호가·직전 체결가 기준 추정이에요'),
    ).toBeInTheDocument();
  });
});
