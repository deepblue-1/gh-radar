import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { RelayQuote, RelayTapeEntry } from '@gh-radar/shared';

import { OrderbookLadder, ladderPctText } from '../orderbook-ladder';

/**
 * Phase 16 Plan 13 Task 1 — 상따 호가 변형 (`variant="chaser"`, A11/A11a).
 *
 * 여기서 잠그는 것은 「보기 좋은가」가 아니라 **오독으로 이어지는 규칙**이다:
 *   - 마커 슬롯이 **모든 행에** 있고 폭이 고정인가 → 없으면 틱마다 가격이 좌우로 밀린다(T-16-05)
 *   - 등락률 열이 최소폭을 갖는가 → 없으면 `-29.0` ↔ `3.2` 사이에서 가격이 밀린다
 *   - 10px 이 **정확히 2곳**(체결 시각 · 등락률)에만 쓰였는가 (T3)
 *   - 가격이 **클릭 대상이 아닌가** (A11 — 비교가격 자동 채움 폐기)
 *   - 좁은 폭에 최근 체결 열이 **없는가** (A11a)
 *
 * ★ jsdom 은 레이아웃을 계산하지 않는다 — `getBoundingClientRect()` 는 전부 0 이다.
 *   그래서 「폭이 흔들리지 않는다」를 실측 폭으로 단언할 수 없고, **규칙 자체**(인라인
 *   style 로 박힌 고정폭)를 `getComputedStyle` 로 단언한다. 그 규칙이 지워지면 실패한다.
 */

const BASE = 100_000;
const UPPER = 130_000;

function makeQuote(over: Partial<RelayQuote> = {}): RelayQuote {
  // 매도 1~10호가: 100,100 ~ 101,000 / 매수 1~10호가: 99,900 ~ 99,000
  const ap = Array.from({ length: 10 }, (_, i) => 100_100 + i * 100);
  const bp = Array.from({ length: 10 }, (_, i) => 99_900 - i * 100);
  return {
    t: 'q',
    i: 'KR7005930003',
    x: 'KRX',
    snap: true,
    p: 99_900,
    o: 99_000,
    h: 101_000,
    l: 98_500,
    c: -100,
    cs: '5',
    cr: -0.1,
    v: 1_000_000,
    va: 99_000_000_000,
    ap,
    aq: [10, 20, 30, 40, 50, 60, 70, 80, 90, 200],
    bp,
    bq: [15, 25, 35, 45, 55, 65, 75, 85, 95, 100],
    ta: 650,
    tb: 595,
    ul: UPPER,
    ll: 70_000,
    base: BASE,
    viu: 110_000,
    vid: 90_000,
    ls: 5_969_782_550,
    et: '093015123456',
    ...over,
  };
}

/** 최근 체결 10건 — 가격을 전부 다르게 둬 「한 칸 밀림」이 실패 메시지에 보이게 한다. */
function makeTrades(count = 10): RelayTapeEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    t: `09301${i}123456`,
    p: 99_900 - i * 10,
    cs: '5',
    c: -10,
    q: 100 + i,
    cv: 1_000 + i,
  }));
}

function renderChaser(over: Partial<Parameters<typeof OrderbookLadder>[0]> = {}) {
  return render(
    <OrderbookLadder
      quote={makeQuote()}
      depth={10}
      isStale={false}
      basePrice={BASE}
      variant="chaser"
      recentTrades={makeTrades()}
      upperLimit={UPPER}
      {...over}
    />,
  );
}

const desktopTable = () =>
  screen.getByRole('table', {
    name: '호가 10단 (매도 10단계 · 매수 10단계) 및 최근 체결 10건',
  });

describe('OrderbookLadder — 상따 변형', () => {
  it('① 매도 10 + 매수 10 = 20행 + 「체결」 헤더 행을 그린다', () => {
    const { container } = renderChaser();

    expect(container.querySelectorAll('[data-slot="ladder-row"]')).toHaveLength(20);
    expect(container.querySelectorAll('[data-slot="ladder-fill-head"]')).toHaveLength(1);
    expect(within(desktopTable()).getByText('체결')).toBeInTheDocument();
    // 색 비의존 — 단계 라벨은 데스크톱·모바일 두 트리에 각각 있다.
    expect(screen.getAllByText(/매도 10호가/)).toHaveLength(2);
    expect(screen.getAllByText(/매수 1호가/)).toHaveLength(2);
  });

  it('② ★ 마커 슬롯이 **모든 행에** 있고 폭이 16px 로 고정이다 (T-16-05 레이아웃 shift 0)', () => {
    const { container } = renderChaser();

    const slots = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-marker"]'),
    );
    // 데스크톱 20행 + 모바일 20행 = 40개. 마커가 없는 행도 슬롯을 갖는다.
    expect(slots).toHaveLength(40);
    const empty = slots.filter((s) => s.dataset.marker === 'none');
    expect(empty.length).toBeGreaterThan(0);

    // ★ 마커 유무와 **무관하게** 같은 폭이다 — 그래서 가격이 좌우로 밀리지 않는다.
    for (const slot of slots) {
      expect(getComputedStyle(slot).width).toBe('16px');
      expect(getComputedStyle(slot).height).toBe('16px');
    }
  });

  it('③ 상한가 행에 「상」, 최근 체결가 행에 도트, 나머지는 빈 슬롯이다', () => {
    // 상한가를 매도 3호가(100,300)에 맞춰 사다리 안에 들어오게 한다.
    const { container } = renderChaser({ upperLimit: 100_300 });

    expect(screen.getAllByRole('img', { name: '상한가' })).toHaveLength(2); // 두 트리
    // 최근 체결가(99,900) = 매수 1호가 행.
    expect(screen.getAllByRole('img', { name: '최근 체결가' })).toHaveLength(2);

    const kinds = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-marker"]'),
    ).map((s) => s.dataset.marker);
    expect(kinds.filter((k) => k === 'upper')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'trade')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'none')).toHaveLength(36);
  });

  it('③b ★ 상한가 == 최근 체결가면 「상」이 이긴다 (상한가 도달의 순간을 도트로 덮지 않는다)', () => {
    // 상한가에 닿는 순간 = 최근 체결가 == 상한가. 이 화면이 존재하는 이유가 바로 그 순간인데,
    // 마커 우선순위가 뒤집히면 그때만 「상」이 사라지고 도트가 뜬다.
    const { container } = renderChaser({
      upperLimit: 99_900,
      recentTrades: [{ t: '093010123456', p: 99_900, cs: '2', c: 100, q: 100, cv: 1_000 }],
    });

    expect(screen.getAllByRole('img', { name: '상한가' })).toHaveLength(2);
    expect(screen.queryAllByRole('img', { name: '최근 체결가' })).toHaveLength(0);
    const kinds = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-marker"]'),
    ).map((s) => s.dataset.marker);
    expect(kinds.filter((k) => k === 'upper')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'trade')).toHaveLength(0);
  });

  it('④ 등락률 — 소수 1자리 · `%` 없음 · 양수 부호 없음 · min-width 40px', () => {
    expect(ladderPctText(129_000, 100_000)).toBe('29.0');
    expect(ladderPctText(97_000, 100_000)).toBe('-3.0');
    expect(ladderPctText(100_000, 100_000)).toBe('0.0');
    // 기준가를 모르면 0.0 을 지어내지 않는다.
    expect(ladderPctText(100_000, 0)).toBe('');

    const { container } = renderChaser();
    const pcts = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="ladder-pct"]'));
    expect(pcts).toHaveLength(40);
    for (const el of pcts) {
      expect(getComputedStyle(el).minWidth).toBe('40px');
      expect(el.textContent).not.toContain('%');
      expect(el.textContent).not.toContain('+');
    }
    // 매도 10호가(101,000) 는 기준가 대비 +1.0%.
    expect(within(desktopTable()).getAllByText('1.0').length).toBeGreaterThan(0);
  });

  it('⑤ 최근 체결 10건이 매수 10단과 1:1 로 정렬되고 방향은 수량 색 + sr-only 로 읽힌다', () => {
    renderChaser();

    const cells = within(desktopTable())
      .getAllByRole('row')
      .flatMap((r) => Array.from(r.querySelectorAll('[data-slot="ladder-fill-cell"]')));
    expect(cells).toHaveLength(10);

    // 첫 매수행 = 최신 체결. 시각·가격·수량이 그 순서로 들어간다.
    expect(cells[0].textContent).toContain('09:30:10');
    expect(cells[0].textContent).toContain('99,900');
    expect(cells[0].textContent).toContain('100');
    // 색 비의존 — 방향은 sr-only 텍스트와 `title` 두 곳에서 읽힌다.
    expect(cells[0].querySelector('.sr-only')?.textContent).toMatch(/매수|매도/);
    expect(cells[0].querySelector('[title]')?.getAttribute('title')).toMatch(/매수 체결|매도 체결/);
  });

  it('⑥ 체결이 없으면 셀을 비운다 (없는 체결을 지어내지 않는다)', () => {
    const { container } = renderChaser({ recentTrades: [] });

    const cells = Array.from(container.querySelectorAll('[data-slot="ladder-fill-cell"]'));
    expect(cells).toHaveLength(10);
    for (const cell of cells) expect(cell.textContent).toBe('');
  });

  it('⑦ ★ 가격은 클릭 대상이 아니다 — 클릭 핸들러도 roving tabindex 도 없다 (A11)', () => {
    const onPriceClick = vi.fn();
    const { container } = renderChaser({ onPriceClick });

    // 표 자체가 tab stop 이 아니다(표준 변형은 `tabindex="0"` 이다).
    expect(desktopTable()).not.toHaveAttribute('tabindex');

    /*
      ★ 「tabindex 가 하나도 없다」가 **아니다**(16-17 정정).

      금지 대상은 **가격 행·셀의 roving tabindex** 다. 반면 좁은 폭 트리의 스크롤
      박스(`ladder-scroll`)는 400px 안에 20행을 담고 그 안에 포커스 가능한 자식이
      하나도 없으므로, 박스 자신이 tab stop 이 **아니면** 키보드만 쓰는 사용자가
      매수 10단에 닿을 방법이 사라진다 — WCAG 2.1.1 위반이고 axe
      `scrollable-region-focusable`(serious)이 실제로 잡았다(16-17 a11y 확장).

      그래서 계약은 「0개」가 아니라 「**스크롤 박스 정확히 1개**」다. 행에 하나라도
      붙으면 아래 두 단언 중 뒤엣것이 깨진다.
    */
    const tabbables = Array.from(container.querySelectorAll('[tabindex]'));
    expect(tabbables).toHaveLength(1);
    expect(tabbables[0]).toHaveAttribute('data-slot', 'ladder-scroll');
    expect(tabbables[0]).toHaveAttribute('tabindex', '0');
    expect(
      container.querySelectorAll('[data-slot="ladder-row-mobile"][tabindex]'),
    ).toHaveLength(0);

    // 클릭해도 아무 일도 일어나지 않는다.
    screen.getAllByText('101,000')[0].click();
    expect(onPriceClick).not.toHaveBeenCalled();
  });

  it('⑧ 좁은 폭 트리에는 최근 체결 열이 없다 (A11a — 모바일 미렌더)', () => {
    const { container } = renderChaser();

    const mobileRows = container.querySelectorAll('[data-slot="ladder-row-mobile"]');
    expect(mobileRows).toHaveLength(20);
    for (const row of Array.from(mobileRows)) {
      expect(row.querySelector('[data-slot="ladder-fill-cell"]')).toBeNull();
    }
    // 모바일 사다리는 400px 독립 스크롤을 갖는다(R7).
    expect(container.querySelector('[data-slot="ladder-scroll"]')).not.toBeNull();
    // 모바일 aria-label 은 「최근 체결」을 말하지 않는다.
    expect(
      screen.getByRole('list', { name: '호가 10단 (매도 10단계 · 매수 10단계)' }),
    ).toBeInTheDocument();
  });

  it('⑨ 범례 — 데스크톱은 「체결 수량」 포함, 좁은 폭은 제외', () => {
    const { container } = renderChaser();

    const legends = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-legend"]'),
    );
    expect(legends).toHaveLength(2);
    expect(legends[0].textContent).toContain('최근 체결가');
    expect(legends[0].textContent).toContain('상한가');
    expect(legends[0].textContent).toContain('체결 수량');
    expect(legends[1].textContent).toContain('상한가');
    expect(legends[1].textContent).not.toContain('체결 수량');
  });

  it('⑩ 호가가 없으면 빈 상태, 재접속 중에는 값을 유지하고 감쇠한다', () => {
    const { container: empty } = renderChaser({ quote: null });
    expect(screen.getByText('호가 정보가 없어요')).toBeInTheDocument();
    expect(empty.querySelector('[data-slot="ladder-row"]')).toBeNull();

    const { container } = renderChaser({ isStale: true });
    const root = container.querySelector('[data-slot="orderbook-ladder"]');
    expect(root).toHaveAttribute('data-stale', 'true');
    // 값은 그대로 남는다 — 비우면 문맥을 잃는다.
    expect(container.querySelectorAll('[data-slot="ladder-row"]')).toHaveLength(20);
  });

  it('⑪ ★ 10px 은 **정확히 2곳**(체결 시각 · 등락률)에만 쓰인다 (T3)', () => {
    const { container } = renderChaser();

    const tenPx = Array.from(container.querySelectorAll<HTMLElement>('[class*="text-[10px]"]'));
    expect(tenPx.length).toBeGreaterThan(0);
    for (const el of tenPx) {
      const isPct = el.dataset.slot === 'ladder-pct';
      const isFillTime = el.closest('[data-slot="ladder-fill-cell"]') !== null;
      expect(isPct || isFillTime).toBe(true);
    }
    // 등락률 40 + 체결 시각 10 = 50 — 이 둘 말고는 없다.
    expect(tenPx).toHaveLength(50);
  });
});
