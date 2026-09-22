import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';

import type { TradingCols } from '@/lib/breakout-list';
import {
  CARD_GRID_EMPTY_BODY,
  CARD_GRID_EMPTY_HEADING,
  CardGrid,
  type CardGridItem,
} from '../workbench/card-grid';

/**
 * Phase 18 Plan 11 Task 2 — 카드 격자: 펼침 우선 + 접힘 스택 한 칸 (D-09 · D-28 · E6, TRADE-09).
 *
 * 잠그는 것:
 *   - DOM 순서 = 펼친 카드들 → 스택 한 칸(접힌 카드 전부). 포커스 순서가 곧 DOM 순서다.
 *   - 접힌 카드 0장이면 스택 칸이 없다 · 카드 0장이면 빈 문구 2줄(원문).
 *   - 스택 위 라벨이 없다 · 전환 애니메이션 클래스가 없다(재렌더).
 *   - `cols` 는 `data-cols` + page(`wb`) 컨테이너 클래스로만 반영되고, 700 미만(기본)은 1단이다.
 *   - ✕ 로 카드가 사라지면 포커스가 다음 카드 헤더로, 없으면 검색란으로 간다.
 * ★ 실제 폭 기반 단 수 전환은 jsdom 이 평가하지 않는다 — 클래스/속성까지만 단언하고 18-13
 *   Playwright 로 넘긴다.
 */

type Item = CardGridItem & { name: string };

const card = (isin: string, open: boolean): Item => ({ isin, open, name: isin });

function renderCard(c: Item) {
  return (
    <article data-testid="card" data-isin={c.isin} data-open={c.open ? 'true' : 'false'}>
      <button type="button" id={`strategy-card-${c.isin}-toggle`}>
        {c.name}
      </button>
    </article>
  );
}

const grid = () => document.querySelector('[data-slot="card-grid"]') as HTMLElement | null;
const stack = () => document.querySelector('[data-slot="card-stack"]') as HTMLElement | null;

/** 격자 직계 자식의 구조 — 카드면 ISIN, 스택이면 `stack[…]`. */
function structure(): string[] {
  const g = grid();
  if (g === null) return [];
  return Array.from(g.children).map((el) => {
    if (el.getAttribute('data-slot') === 'card-stack') {
      const inner = Array.from(el.querySelectorAll('[data-testid="card"]')).map((c) =>
        c.getAttribute('data-isin'),
      );
      return `stack[${inner.join(',')}]`;
    }
    return el.querySelector('[data-testid="card"]')?.getAttribute('data-isin') ?? '?';
  });
}

function Harness({ initial, cols = 2 }: { initial: Item[]; cols?: TradingCols }) {
  const [cards, setCards] = useState(initial);
  return (
    <>
      <div data-slot="stock-add-bar">
        <input aria-label="종목 추가 검색" />
      </div>
      <CardGrid
        cards={cards}
        cols={cols}
        fallbackFocusSelector='[data-slot="stock-add-bar"] input'
        renderCard={(c) => (
          <article data-testid="card" data-isin={c.isin}>
            <button
              type="button"
              id={`strategy-card-${c.isin}-toggle`}
              onClick={() =>
                setCards((prev) => prev.map((p) => (p.isin === c.isin ? { ...p, open: !p.open } : p)))
              }
            >
              {c.name}
            </button>
            <button
              type="button"
              aria-label={`${c.name} 카드 닫기`}
              onClick={() => setCards((prev) => prev.filter((p) => p.isin !== c.isin))}
            >
              ✕
            </button>
          </article>
        )}
      />
    </>
  );
}

describe('CardGrid — 펼침 0/1/2+ × 접힘 0/1/N (D-09 · E6 zero-one-many)', () => {
  it('펼친 2 + 접힌 3, 2단 → [A][B][스택(3장)] 이고 스택이 정확히 한 칸이다', () => {
    render(
      <CardGrid
        cards={[card('C1', false), card('A', true), card('C2', false), card('B', true), card('C3', false)]}
        cols={2}
        renderCard={renderCard}
      />,
    );
    expect(structure()).toEqual(['A', 'B', 'stack[C1,C2,C3]']);
    expect(grid()!.children).toHaveLength(3);
  });

  it('펼친 0 + 접힌 N → 스택 한 칸만 있다', () => {
    render(
      <CardGrid cards={[card('C1', false), card('C2', false), card('C3', false)]} cols={3} renderCard={renderCard} />,
    );
    expect(structure()).toEqual(['stack[C1,C2,C3]']);
  });

  it('펼친 0 + 접힌 1 → 스택 한 칸에 1장', () => {
    render(<CardGrid cards={[card('C1', false)]} cols={1} renderCard={renderCard} />);
    expect(structure()).toEqual(['stack[C1]']);
  });

  it('펼친 1 + 접힌 3 → [A][스택] — 「4종목 중 1종목만 펼치면 나머지 3종목이 한 칸」', () => {
    render(
      <CardGrid
        cards={[card('A', true), card('C1', false), card('C2', false), card('C3', false)]}
        cols={2}
        renderCard={renderCard}
      />,
    );
    expect(structure()).toEqual(['A', 'stack[C1,C2,C3]']);
  });

  it('펼친 N + 접힌 0 → 스택 칸이 렌더되지 않는다', () => {
    render(<CardGrid cards={[card('A', true), card('B', true)]} cols={2} renderCard={renderCard} />);
    expect(structure()).toEqual(['A', 'B']);
    expect(stack()).toBeNull();
  });

  it('펼친 1 + 접힌 0 → 카드 한 칸, 스택 없음', () => {
    render(<CardGrid cards={[card('A', true)]} cols={1} renderCard={renderCard} />);
    expect(structure()).toEqual(['A']);
    expect(stack()).toBeNull();
  });
});

describe('CardGrid — 빈 상태 (E6 empty)', () => {
  it('카드 0장이면 격자 대신 빈 문구 2줄을 원문으로 그린다', () => {
    render(<CardGrid cards={[]} cols={2} renderCard={renderCard} />);
    expect(grid()).toBeNull();
    const empty = document.querySelector('[data-slot="card-grid-empty"]') as HTMLElement;
    expect(empty).not.toBeNull();
    expect(CARD_GRID_EMPTY_HEADING).toBe('거래할 종목이 없어요');
    expect(CARD_GRID_EMPTY_BODY).toBe('위 검색란에서 종목을 추가하거나, 돌파 목록의 종목을 눌러 시작하세요.');
    expect(screen.getByText(CARD_GRID_EMPTY_HEADING)).toBeTruthy();
    expect(screen.getByText(CARD_GRID_EMPTY_BODY)).toBeTruthy();
    expect(empty.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe('CardGrid — 스택 규율 (D-09)', () => {
  it('스택 위에 라벨이 없다 — 스택의 자식은 카드뿐이다', () => {
    render(
      <CardGrid cards={[card('A', true), card('C1', false), card('C2', false)]} cols={2} renderCard={renderCard} />,
    );
    const s = stack()!;
    expect(s.textContent).toBe('C1C2');
    for (const child of Array.from(s.children)) {
      expect(child.querySelector('[data-testid="card"]') ?? child).toBeTruthy();
      expect(child.textContent === 'C1' || child.textContent === 'C2').toBe(true);
    }
  });

  it('스택 안 카드 사이 간격이 8px(gap-2) 이고 세로(flex-col) 다', () => {
    render(<CardGrid cards={[card('C1', false), card('C2', false)]} cols={2} renderCard={renderCard} />);
    expect(stack()!.className).toContain('flex-col');
    expect(stack()!.className).toContain('gap-2');
  });

  it('헤더 클릭으로 펼침/접힘이 바뀌면 DOM 순서가 재계산되고 애니메이션 클래스가 없다', () => {
    render(<Harness initial={[card('A', true), card('B', false), card('C', false)]} />);
    expect(structure()).toEqual(['A', 'stack[B,C]']);
    fireEvent.click(screen.getByRole('button', { name: 'C' }));
    expect(structure()).toEqual(['A', 'C', 'stack[B]']);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(structure()).toEqual(['C', 'stack[A,B]']);
    const html = grid()!.outerHTML;
    expect(html).not.toMatch(/transition|animate-/);
  });
});

describe('CardGrid — 단 수 (D-04 · D-28)', () => {
  it.each([1, 2, 3] as const)('cols=%i → data-cols 와 page(wb) 컨테이너 클래스', (cols) => {
    render(<CardGrid cards={[card('A', true)]} cols={cols} renderCard={renderCard} />);
    const g = grid()!;
    expect(g.getAttribute('data-cols')).toBe(String(cols));
    // 700 미만(폰 밴드)은 저장값과 무관하게 1단 — 기본 클래스가 1열이다.
    expect(g.className).toContain('grid-cols-[minmax(0,1fr)]');
    if (cols === 1) expect(g.className).not.toMatch(/@min-\[700px\]\/wb:grid-cols/);
    if (cols === 2) expect(g.className).toContain('@min-[700px]/wb:grid-cols-[repeat(2,minmax(0,1fr))]');
    if (cols === 3) expect(g.className).toContain('@min-[700px]/wb:grid-cols-[repeat(3,minmax(0,1fr))]');
    // 뷰포트 브레이크포인트가 섞이지 않는다.
    expect(g.className).not.toMatch(/(^|\s)(sm|md|lg|xl):/);
  });
});

describe('CardGrid — ✕ 뒤 포커스 (UI-SPEC §접근성)', () => {
  it('✕ 로 카드를 지우면 포커스가 다음 카드 헤더로 간다', async () => {
    render(<Harness initial={[card('A', true), card('B', true), card('C', false)]} />);
    const close = screen.getByRole('button', { name: 'A 카드 닫기' });
    close.focus();
    await act(async () => {
      fireEvent.click(close);
    });
    expect(document.activeElement?.id).toBe('strategy-card-B-toggle');
  });

  it('마지막 카드를 지우면 스택 안의 다음 카드, 그것도 없으면 검색란으로 간다', async () => {
    render(<Harness initial={[card('A', true), card('C', false)]} />);
    const closeA = screen.getByRole('button', { name: 'A 카드 닫기' });
    closeA.focus();
    await act(async () => {
      fireEvent.click(closeA);
    });
    expect(document.activeElement?.id).toBe('strategy-card-C-toggle');

    const closeC = screen.getByRole('button', { name: 'C 카드 닫기' });
    closeC.focus();
    await act(async () => {
      fireEvent.click(closeC);
    });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '종목 추가 검색' }));
  });
});

/* ── WR-02 — 접기/펴기·단 수 변경에 마운트 유지 ───────────────────────────── */

const mounts = new Map<string, number>();

/** 내부 상태(카운터)와 마운트 횟수를 가진 스텁 카드 — 재마운트되면 카운터가 0 으로 돌아간다. */
function StatefulCard({ isin, onToggle }: { isin: string; onToggle: (isin: string) => void }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    mounts.set(isin, (mounts.get(isin) ?? 0) + 1);
  }, [isin]);
  return (
    <article data-testid="stateful" data-isin={isin}>
      <button type="button" id={`strategy-card-${isin}-toggle`} onClick={() => onToggle(isin)}>
        {`${isin} 토글`}
      </button>
      <button type="button" onClick={() => setCount((n) => n + 1)}>
        {`${isin} 올리기`}
      </button>
      <span data-part="count">{count}</span>
    </article>
  );
}

function StatefulHarness({ initial }: { initial: Item[] }) {
  const [cards, setCards] = useState(initial);
  const [cols, setCols] = useState<TradingCols>(1);
  const toggle = (isin: string) =>
    setCards((prev) => prev.map((p) => (p.isin === isin ? { ...p, open: !p.open } : p)));
  return (
    <>
      <button type="button" onClick={() => setCols((c) => ((c % 3) + 1) as TradingCols)}>
        단 수
      </button>
      <CardGrid
        cards={cards}
        cols={cols}
        renderCard={(c) => <StatefulCard isin={c.isin} onToggle={toggle} />}
      />
    </>
  );
}

const statefulOf = (isin: string) =>
  document.querySelector(`[data-testid="stateful"][data-isin="${isin}"]`) as HTMLElement;
const countOf = (isin: string) => statefulOf(isin).querySelector('[data-part="count"]')?.textContent;

describe('CardGrid — WR-02 — 접기/펴기·단 수 변경에 마운트 유지', () => {
  beforeEach(() => mounts.clear());

  it('펼친 카드의 상태를 올리고 접어도 같은 인스턴스 · 상태 유지 · 마운트 1회 (스택으로 이동)', () => {
    render(<StatefulHarness initial={[card('A', true), card('B', true)]} />);
    const before = statefulOf('A');
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: 'A 올리기' }));
    expect(countOf('A')).toBe('3');

    fireEvent.click(screen.getByRole('button', { name: 'A 토글' }));
    // 레이아웃은 D-09 그대로 — A 가 스택으로 갔다.
    const s = stack()!;
    expect(s).not.toBeNull();
    expect(s.contains(statefulOf('A'))).toBe(true);
    expect(statefulOf('A')).toBe(before);
    expect(countOf('A')).toBe('3');
    expect(mounts.get('A')).toBe(1);
  });

  it('다시 펼쳐도 같은 인스턴스 · 상태 유지 · 마운트 1회 (격자 칸으로 복귀)', () => {
    render(<StatefulHarness initial={[card('A', true), card('B', true)]} />);
    const before = statefulOf('A');
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: 'A 올리기' }));
    fireEvent.click(screen.getByRole('button', { name: 'A 토글' }));
    fireEvent.click(screen.getByRole('button', { name: 'A 토글' }));
    expect(stack()).toBeNull();
    const cell = statefulOf('A').closest('[data-slot="card-cell"]') as HTMLElement;
    expect(cell.parentElement).toBe(grid());
    expect(statefulOf('A')).toBe(before);
    expect(countOf('A')).toBe('3');
    expect(mounts.get('A')).toBe(1);
    expect(mounts.get('B')).toBe(1);
  });

  it('cols 1 → 2 → 3 재렌더에도 모든 카드가 마운트 1회', () => {
    render(<StatefulHarness initial={[card('A', true), card('B', false), card('C', true)]} />);
    fireEvent.click(screen.getByRole('button', { name: '단 수' }));
    expect(grid()!.getAttribute('data-cols')).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: '단 수' }));
    expect(grid()!.getAttribute('data-cols')).toBe('3');
    for (const isin of ['A', 'B', 'C']) expect(mounts.get(isin)).toBe(1);
  });
});
