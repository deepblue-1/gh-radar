import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';

import type { TradingCols } from '@/lib/breakout-list';
import { InlineValueEditor } from '../lc/inline-value-editor';
import { LcSheetShell } from '../lc/number-pad-sheet';
import { FailureBubble } from '../lc/setting-group';
import {
  CARD_GRID_ACCOUNT_EMPTY_HEADING,
  CARD_GRID_EMPTY_BODY,
  CARD_GRID_EMPTY_HEADING,
  CardGrid,
  cardGridAccountEmptyBody,
  type CardGridItem,
} from '../workbench/card-grid';

/**
 * Phase 18 Plan 11 Task 2 — 카드 격자: 펼침 우선 + 접힘 스택 한 칸 (D-09 · D-28 · E6, TRADE-09).
 *
 * 잠그는 것:
 *   - DOM 순서 = 펼친 카드들 → 스택 한 칸(접힌 카드 전부). 포커스 순서가 곧 DOM 순서다.
 *   - 접힌 카드 0장이면 스택 칸이 없다 · 카드 0장이면 빈 문구 2줄(원문).
 *   - 스택 위 라벨이 없다 · 전환 애니메이션 클래스가 없다(재렌더).
 *   - `cols` 는 `data-cols` + page(`wb`) 컨테이너 클래스로만 반영되고, 680 미만(기본)은 1단이다.
 *   - ✕ 로 카드가 사라지면 포커스가 다음 카드 헤더로, 없으면 검색란으로 간다.
 * ★ 실제 폭 기반 단 수 전환은 jsdom 이 평가하지 않는다 — 클래스/속성까지만 단언하고 18-13
 *   Playwright 로 넘긴다.
 */

type Item = CardGridItem & { name: string };

/** 카드 id 는 기본으로 ISIN 과 같다 — 같은 ISIN 두 장은 `id` 를 따로 준다(WR-05). */
const card = (isin: string, open: boolean, id: string = isin): Item => ({ id, isin, open, name: id });

function renderCard(c: Item) {
  return (
    <article data-testid="card" data-isin={c.id} data-open={c.open ? 'true' : 'false'}>
      <button type="button" id={`strategy-card-${c.id}-toggle`}>
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
          <article data-testid="card" data-isin={c.id}>
            <button
              type="button"
              id={`strategy-card-${c.id}-toggle`}
              onClick={() =>
                setCards((prev) => prev.map((p) => (p.id === c.id ? { ...p, open: !p.open } : p)))
              }
            >
              {c.name}
            </button>
            <button
              type="button"
              aria-label={`${c.name} 카드 닫기`}
              onClick={() => setCards((prev) => prev.filter((p) => p.id !== c.id))}
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
    // 680 미만(격자 1열 고정)은 저장값과 무관하게 1단 — 기본 클래스가 1열이다.
    expect(g.className).toContain('grid-cols-[minmax(0,1fr)]');
    if (cols === 1) expect(g.className).not.toMatch(/@min-\[680px\]\/wb:grid-cols/);
    if (cols === 2) expect(g.className).toContain('@min-[680px]/wb:grid-cols-[repeat(2,minmax(0,1fr))]');
    if (cols === 3) expect(g.className).toContain('@min-[680px]/wb:grid-cols-[repeat(3,minmax(0,1fr))]');
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
  const toggle = (id: string) =>
    setCards((prev) => prev.map((p) => (p.id === id ? { ...p, open: !p.open } : p)));
  return (
    <>
      <button type="button" onClick={() => setCols((c) => ((c % 3) + 1) as TradingCols)}>
        단 수
      </button>
      <CardGrid
        cards={cards}
        cols={cols}
        renderCard={(c) => <StatefulCard isin={c.id} onToggle={toggle} />}
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

  it('같은 isin 두 장(id 다름)이 둘 다 그려지고 호스트를 공유하지 않는다 — 한쪽을 접어도 다른 쪽은 그대로 (WR-05)', () => {
    render(
      <StatefulHarness
        initial={[card('KR7086520004', true, 'wb-card-1'), card('KR7086520004', true, 'wb-card-2')]}
      />,
    );
    const hosts = document.querySelectorAll('[data-slot="card-host"]');
    expect(hosts).toHaveLength(2);
    const a = statefulOf('wb-card-1');
    const b = statefulOf('wb-card-2');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a.parentElement).not.toBe(b.parentElement);

    fireEvent.click(screen.getByRole('button', { name: 'wb-card-1 올리기' }));
    fireEvent.click(screen.getByRole('button', { name: 'wb-card-1 토글' }));
    expect(stack()!.contains(statefulOf('wb-card-1'))).toBe(true);
    expect(stack()!.contains(statefulOf('wb-card-2'))).toBe(false);
    expect(statefulOf('wb-card-1')).toBe(a);
    expect(countOf('wb-card-1')).toBe('1');
    expect(countOf('wb-card-2')).toBe('0');
    expect(mounts.get('wb-card-1')).toBe(1);
    expect(mounts.get('wb-card-2')).toBe(1);
  });
});

/* ── Phase 32 D-01 — 계좌 스코프 숨김 = 주차(언마운트 아님) ───────────────── */

const parking = () => document.querySelector('[data-slot="card-parking"]') as HTMLElement | null;

/** 숨김 집합을 바깥에서 바꾸는 하네스 — 카드 안 상태(카운터 · 입력값)가 왕복 뒤에도 그대로인지 본다. */
function ScopeHarness({ initial, hidden: initialHidden }: { initial: Item[]; hidden: string[] }) {
  const [cards, setCards] = useState(initial);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(initialHidden));
  return (
    <>
      <div data-slot="stock-add-bar">
        <input aria-label="종목 추가 검색" />
      </div>
      <button type="button" onClick={() => setHidden(new Set())}>
        전부 보기
      </button>
      <button type="button" onClick={() => setHidden(new Set(initial.map((c) => c.id).filter((id) => id !== 'A')))}>
        A 만 보기
      </button>
      <button type="button" onClick={() => setHidden(new Set(['A']))}>
        A 숨기기
      </button>
      <CardGrid
        cards={cards}
        hiddenIds={hidden}
        cols={2}
        fallbackFocusSelector='[data-slot="stock-add-bar"] input'
        renderCard={(c) => (
          <div>
            <StatefulCard isin={c.id} onToggle={() => {}} />
            <input aria-label={`${c.id} 값`} defaultValue="" />
            <button
              type="button"
              aria-label={`${c.id} 카드 닫기`}
              onClick={() => setCards((prev) => prev.filter((p) => p.id !== c.id))}
            >
              ✕
            </button>
          </div>
        )}
      />
    </>
  );
}

describe('P32 계좌 스코프 숨김 주차 (D-01 · Pattern 2)', () => {
  beforeEach(() => mounts.clear());

  it('숨긴 카드는 hidden 주차 노드(card-parking) 안에 있고 격자 · 스택에는 없다', () => {
    render(
      <CardGrid
        cards={[card('A', true), card('B', true), card('C', false)]}
        hiddenIds={new Set(['B', 'C'])}
        cols={2}
        renderCard={renderCard}
      />,
    );
    expect(structure()).toEqual(['A']);
    const park = parking()!;
    expect(park).not.toBeNull();
    expect(park.hidden).toBe(true);
    const parked = Array.from(park.querySelectorAll('[data-testid="card"]')).map((c) => c.getAttribute('data-isin'));
    expect(parked).toEqual(['B', 'C']);
    expect(stack()).toBeNull();
  });

  it('숨김 → 보임 왕복에도 언마운트되지 않는다 — 카드 안 카운터 · 입력값 그대로 · 마운트 1회', () => {
    render(<ScopeHarness initial={[card('A', true), card('B', true)]} hidden={[]} />);
    const before = document.querySelector('[data-isin="A"][data-testid="stateful"]');
    for (let i = 0; i < 2; i += 1) fireEvent.click(screen.getByRole('button', { name: 'A 올리기' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'A 값' }), { target: { value: '8000' } });

    fireEvent.click(screen.getByRole('button', { name: 'A 숨기기' }));
    expect(parking()!.contains(statefulOf('A'))).toBe(true);
    expect(structure()).not.toContain('A');

    fireEvent.click(screen.getByRole('button', { name: '전부 보기' }));
    expect(parking()).toBeNull();
    expect(grid()!.contains(statefulOf('A'))).toBe(true);
    expect(document.querySelector('[data-isin="A"][data-testid="stateful"]')).toBe(before);
    expect(countOf('A')).toBe('2');
    expect((screen.getByRole('textbox', { name: 'A 값' }) as HTMLInputElement).value).toBe('8000');
    expect(mounts.get('A')).toBe(1);
  });

  it('호스트 수 = 전수 카드 — 숨긴 카드의 호스트를 치우지 않는다', () => {
    render(
      <CardGrid
        cards={[card('A', true), card('B', false), card('C', true)]}
        hiddenIds={new Set(['B', 'C'])}
        cols={2}
        renderCard={renderCard}
      />,
    );
    expect(document.querySelectorAll('[data-slot="card-host"]')).toHaveLength(3);
  });

  it('보이는 카드 0 ∧ 숨은 2 → 계좌 빈 상태 「…다른 계좌 카드 2장은…」 · 숨은 카드는 마운트 유지', () => {
    render(
      <CardGrid
        cards={[card('B', true), card('C', false)]}
        hiddenIds={new Set(['B', 'C'])}
        cols={2}
        renderCard={renderCard}
      />,
    );
    expect(grid()).toBeNull();
    expect(CARD_GRID_ACCOUNT_EMPTY_HEADING).toBe('이 계좌에 거래할 종목이 없어요');
    expect(cardGridAccountEmptyBody(2)).toBe(
      '위 검색란에서 종목을 추가하면 이 계좌로 열려요 · 다른 계좌 카드 2장은 계좌를 바꾸면 보여요',
    );
    const empty = document.querySelector('[data-slot="card-grid-empty"]') as HTMLElement;
    expect(empty).not.toBeNull();
    expect(screen.getByText(CARD_GRID_ACCOUNT_EMPTY_HEADING)).toBeTruthy();
    expect(screen.getByText(cardGridAccountEmptyBody(2))).toBeTruthy();
    expect(screen.queryByText(CARD_GRID_EMPTY_HEADING)).toBeNull();
    expect(parking()!.querySelectorAll('[data-testid="card"]')).toHaveLength(2);
  });

  it('전 카드 0 → 종전 빈 문구(계좌 문구 아님) · 주차 노드 없음', () => {
    render(<CardGrid cards={[]} hiddenIds={new Set(['gone'])} cols={2} renderCard={renderCard} />);
    expect(screen.getByText(CARD_GRID_EMPTY_HEADING)).toBeTruthy();
    expect(screen.getByText(CARD_GRID_EMPTY_BODY)).toBeTruthy();
    expect(screen.queryByText(CARD_GRID_ACCOUNT_EMPTY_HEADING)).toBeNull();
    expect(parking()).toBeNull();
  });

  it('✕ 뒤 포커스는 보이는 다음 카드로 — 사이의 숨은 카드로 가지 않고, 보이는 카드가 없으면 검색란', async () => {
    // A · B(숨김) · C — A 를 닫으면 B 를 건너뛰고 C.
    render(<ScopeHarness initial={[card('A', true), card('B', true), card('C', true)]} hidden={['B']} />);
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
    // 남은 카드는 숨은 B 뿐 — 포커스는 검색란.
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '종목 추가 검색' }));
  });

  it('숨기기만으로는 포커스를 옮기지 않는다 — 사라짐(✕)이 아니다', async () => {
    render(<ScopeHarness initial={[card('A', true), card('B', true)]} hidden={[]} />);
    const btn = screen.getByRole('button', { name: 'A 숨기기' });
    btn.focus();
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(document.activeElement).toBe(btn);
  });
});

/* ── Phase 32 D-01 · S2 — 계좌 전환 때 숨는 카드의 시트 · 인라인 편집 · 말풍선 닫기 ──────────── */

/**
 * 넘버패드 시트 · 인라인 편집 · 실패 말풍선을 든 스텁 카드 — 셋 다 body 포털(시트 · 말풍선)이거나 포커스를 쥔
 * 입력이라 호스트를 주차해도 화면에 남는다. 카드 안 카운터(더티 값 대역)는 숨김 동안 그대로여야 한다.
 */
function EditingCard({ id, onSave }: { id: string; onSave: (v: number) => void }) {
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState(0);
  const returnRef = { current: null as HTMLElement | null };
  return (
    <article data-testid="editing" data-isin={id}>
      <button type="button" onClick={() => setCount((n) => n + 1)}>{`${id} 올리기`}</button>
      <span data-part="count">{count}</span>
      <button type="button" onClick={() => setSheet(true)}>{`${id} 시트`}</button>
      <button type="button" onClick={() => setEditing(true)}>{`${id} 편집`}</button>
      <LcSheetShell
        open={sheet}
        slot="numpad-sheet"
        overlaySlot="numpad-overlay"
        title="한방"
        description="설명"
        returnFocusRef={returnRef}
        onClose={() => setSheet(false)}
      >
        <p>패드</p>
      </LcSheetShell>
      {editing && (
        <InlineValueEditor
          id={`${id}-inline`}
          label={`${id} 인라인`}
          unit="주"
          initialValue={5}
          onSave={(v) => {
            onSave(v);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onDismiss={() => setEditing(false)}
        />
      )}
      <FailureBubble open text={`${id} 반영 실패`}>
        <span>행</span>
      </FailureBubble>
    </article>
  );
}

function EditingHarness({ onSave }: { onSave: (v: number) => void }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  return (
    <>
      <button type="button" onClick={() => setHidden(new Set(['A']))}>
        A 숨기기
      </button>
      <button type="button" onClick={() => setHidden(new Set())}>
        전부 보기
      </button>
      <CardGrid
        cards={[card('A', true), card('B', true)]}
        hiddenIds={hidden}
        cols={2}
        renderCard={(c) => <EditingCard id={c.id} onSave={onSave} />}
      />
    </>
  );
}

describe('P32 계좌 전환 때 숨는 카드의 편집 UI 닫기 (D-01 · S2 · useCardInScope)', () => {
  const editingCountOf = (id: string) =>
    document.querySelector(`[data-testid="editing"][data-isin="${id}"] [data-part="count"]`)?.textContent;
  const sheets = () => document.querySelectorAll('[data-slot="numpad-sheet"]');
  const bubbles = () =>
    Array.from(document.querySelectorAll('[data-slot="lc-failure-bubble"]')).map((b) => b.textContent);

  it('열린 넘버패드 시트가 닫히고 카드 상태(카운터)는 그대로 — 다시 보여도 시트는 닫힌 채', async () => {
    render(<EditingHarness onSave={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'A 올리기' }));
    fireEvent.click(screen.getByRole('button', { name: 'A 시트' }));
    expect(sheets()).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'A 숨기기', hidden: true }));
    });
    expect(sheets()).toHaveLength(0);
    expect(editingCountOf('A')).toBe('1');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '전부 보기' }));
    });
    expect(sheets()).toHaveLength(0);
    expect(editingCountOf('A')).toBe('1');
  });

  it('인라인 편집이 취소 경로로 닫힌다 — 확정 전송(onSave) 없음 · 다시 보여도 편집은 닫힌 채', async () => {
    // 인라인 편집은 포커스를 쥔 하나뿐이다(다른 편집기를 열면 이탈 = 저장) — A 하나만 연다.
    const onSave = vi.fn();
    render(<EditingHarness onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'A 편집' }));
    const input = screen.getByRole('textbox', { name: 'A 인라인' });
    fireEvent.change(input, { target: { value: '9' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'A 숨기기' }));
    });
    expect(screen.queryByRole('textbox', { name: 'A 인라인', hidden: true })).toBeNull();
    // 숨김이 만든 늦은 포커스 이탈도 저장으로 새지 않는다.
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '전부 보기' }));
    });
    expect(screen.queryByRole('textbox', { name: 'A 인라인' })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('카드 실패 말풍선(body 포털)은 숨은 동안 닫히고 다시 보이면 돌아온다 — 문구 상태는 카드가 든다', async () => {
    render(<EditingHarness onSave={() => {}} />);
    expect(bubbles().sort()).toEqual(['A 반영 실패', 'B 반영 실패']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'A 숨기기' }));
    });
    expect(bubbles()).toEqual(['B 반영 실패']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '전부 보기' }));
    });
    expect(bubbles().sort()).toEqual(['A 반영 실패', 'B 반영 실패']);
  });
});
