import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { RelayQuote, RelayTapeEntry } from '@gh-radar/shared';

import { OrderbookLadder, ladderPctText, ladderPctTextSigned } from '../orderbook-ladder';

/**
 * Phase 16 Plan 13 Task 1 — 상따 호가 변형 (`variant="chaser"`, A11/A11a).
 *
 * 여기서 잠그는 것은 「보기 좋은가」가 아니라 **오독으로 이어지는 규칙**이다:
 *   - (데스크톱) 마커 슬롯이 **모든 행에** 있고 폭이 고정인가 → 없으면 틱마다 가격이 좌우로
 *     밀린다(T-16-05)
 *   - (데스크톱) 등락률 열이 최소폭을 갖는가 → 없으면 `-29.0` ↔ `3.2` 사이에서 가격이 밀린다
 *   - 10px 허용처를 벗어난 표면이 없는가 (T3)
 *   - 가격이 **클릭 대상이 아닌가** (A11 — 비교가격 자동 채움 폐기)
 *   - 좁은 폭에 최근 체결 **열**이 없고 그 대신 compact 테이프가 있는가 (A11a · 260911-w5h)
 *
 * ★ 260911-w5h — **데스크톱과 좁은 폭이 갈렸다.** 좁은 폭은 마커 슬롯·범례·등락률 최소폭을
 *   버리고 배경/굵기/부호·%/스크롤 박스로 다시 짰다. 그래서 예전에 「두 트리 합계」로 세던
 *   단언들이 전부 **데스크톱 기준**으로 다시 세어졌고, 그와 짝을 이루는 「모바일은 0개」
 *   단언이 함께 들어왔다 — 그 쌍이 「모바일만 바꿨다」의 유일한 증거다.
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

  it('② ★ 마커 슬롯은 **데스크톱 20행 전부**에 있고 폭이 16px 로 고정이다 (T-16-05)', () => {
    const { container } = renderChaser();

    const slots = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-marker"]'),
    );
    /*
      ★ 260911-w5h — 좁은 폭에서 마커 슬롯을 **없앴다**(회수한 16px 이 가격 글꼴로 갔다).
        그래서 합계가 40 → 20 이다. T-16-05(마커 유무로 가격이 밀리지 않는다)는 **데스크톱
        계약으로 남는다** — 좁은 폭은 애초에 밀릴 슬롯이 없다.
    */
    expect(slots).toHaveLength(20);
    expect(
      container.querySelectorAll('[data-slot="ladder-row-mobile"] [data-slot="ladder-marker"]'),
    ).toHaveLength(0);
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

    // 마커는 이제 데스크톱 트리에만 있다 — 각각 1개다.
    expect(screen.getAllByRole('img', { name: '상한가' })).toHaveLength(1);
    // 최근 체결가(99,900) = 매수 1호가 행.
    expect(screen.getAllByRole('img', { name: '최근 체결가' })).toHaveLength(1);

    const kinds = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-marker"]'),
    ).map((s) => s.dataset.marker);
    expect(kinds.filter((k) => k === 'upper')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'trade')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'none')).toHaveLength(18);
  });

  it('③b ★ 상한가 == 최근 체결가면 「상」이 이긴다 (상한가 도달의 순간을 도트로 덮지 않는다)', () => {
    // 상한가에 닿는 순간 = 최근 체결가 == 상한가. 이 화면이 존재하는 이유가 바로 그 순간인데,
    // 마커 우선순위가 뒤집히면 그때만 「상」이 사라지고 도트가 뜬다.
    const { container } = renderChaser({
      upperLimit: 99_900,
      recentTrades: [{ t: '093010123456', p: 99_900, cs: '2', c: 100, q: 100, cv: 1_000 }],
    });

    expect(screen.getAllByRole('img', { name: '상한가' })).toHaveLength(1);
    expect(screen.queryAllByRole('img', { name: '최근 체결가' })).toHaveLength(0);
    const kinds = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-marker"]'),
    ).map((s) => s.dataset.marker);
    expect(kinds.filter((k) => k === 'upper')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'trade')).toHaveLength(0);
    // 좁은 폭도 같은 우선순위다 — 상한가 배경이 이기고 최근 체결 굵기가 그 행에 겹치지 않는다.
    const upperRow = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-row-mobile"]'),
    ).find((el) => el.className.includes('var(--up)_8%'))!;
    expect(upperRow).toBeDefined();
    expect(upperRow.textContent).toContain('상한가');
    expect(upperRow.textContent).not.toContain('최근 체결가');
  });

  it('④ 데스크톱 등락률 — 소수 1자리 · `%` 없음 · 양수 부호 없음 · min-width 40px (불변)', () => {
    // ★ `ladderPctText` 의 반환값은 **한 글자도 바뀌지 않았다** — 데스크톱과 좁은 폭이
    //   다른 숫자를 말할 자리를 만들지 않기 위해 좁은 폭 함수가 이 결과를 꾸미기만 한다.
    expect(ladderPctText(129_000, 100_000)).toBe('29.0');
    expect(ladderPctText(97_000, 100_000)).toBe('-3.0');
    expect(ladderPctText(100_000, 100_000)).toBe('0.0');
    // 기준가를 모르면 0.0 을 지어내지 않는다.
    expect(ladderPctText(100_000, 0)).toBe('');

    const { container } = renderChaser();
    const pcts = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-slot="ladder-price-cell"] [data-slot="ladder-pct"]',
      ),
    );
    expect(pcts).toHaveLength(20);
    for (const el of pcts) {
      expect(getComputedStyle(el).minWidth).toBe('40px');
      expect(el.textContent).not.toContain('%');
      expect(el.textContent).not.toContain('+');
    }
    // 매도 10호가(101,000) 는 기준가 대비 +1.0%.
    expect(within(desktopTable()).getAllByText('1.0').length).toBeGreaterThan(0);
  });

  it('④b 좁은 폭 등락률 — 부호 + `%` + 방향색, 최소폭 없음 (260911-w5h)', () => {
    // ★ 보합에는 부호를 붙이지 않는다 — `+0.0%` 는 「조금 올랐다」로 읽힌다.
    expect(ladderPctTextSigned(129_000, 100_000)).toBe('+29.0%');
    expect(ladderPctTextSigned(97_000, 100_000)).toBe('-3.0%');
    expect(ladderPctTextSigned(100_000, 100_000)).toBe('0.0%');
    expect(ladderPctTextSigned(100_000, 0)).toBe('');

    /*
      ★ **기준가보다 낮은 호가를 반드시 포함시킨다.** 전부 상승인 데이터만 쓰면 방향색
        단언을 무력화해도 초록이다. 기준가 100,000 · 매수 10호가 99,000 이라 아래쪽이 있다.
    */
    const { container } = renderChaser();
    const pcts = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-slot="ladder-row-mobile"] [data-slot="ladder-pct"]',
      ),
    );
    expect(pcts).toHaveLength(20);
    for (const el of pcts) {
      // 최소폭 인라인 style 이 없다 — 가격 아래 줄이라 폭을 다툴 상대가 없다.
      expect(el.getAttribute('style')).toBeNull();
      expect(el.textContent).toContain('%');
    }
    const up = pcts.filter((el) => el.className.includes('text-[var(--up)]'));
    const down = pcts.filter((el) => el.className.includes('text-[var(--down)]'));
    expect(up.length).toBeGreaterThan(0);
    expect(down.length).toBeGreaterThan(0);
    for (const el of up) expect(el.textContent!.startsWith('+')).toBe(true);
    for (const el of down) expect(el.textContent!.startsWith('-')).toBe(true);
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
      박스(`ladder-scroll`)는 340px 안에 20행을 담고 그 안에 포커스 가능한 자식이
      하나도 없으므로, 박스 자신이 tab stop 이 **아니면** 키보드만 쓰는 사용자가
      매수 10단에 닿을 방법이 사라진다 — WCAG 2.1.1 위반이고 axe
      `scrollable-region-focusable`(serious)이 실제로 잡았다(16-17 a11y 확장).

      ★ 260911-w5h — 사다리 아래 **compact 체결 테이프**가 들어오면서 같은 조건의 스크롤
        영역이 하나 더 생겼다(`tape-scroll`, `max-h-[200px]`). 그래서 계약은 「1개」가
        아니라 「**스크롤 영역 정확히 2개, 그리고 행에는 0개**」다:
          · `ladder-scroll` — 340px 박스 안의 호가 20행
          · `tape-scroll`   — 200px 박스 안의 체결 목록
        둘 다 안에 상시 포커스 가능한 자식이 없다. 행에 하나라도 붙으면 마지막 단언이 깨진다.
    */
    const tabbables = Array.from(container.querySelectorAll('[tabindex]'));
    expect(tabbables).toHaveLength(2);
    expect(tabbables.map((el) => el.getAttribute('data-slot'))).toEqual([
      'ladder-scroll',
      'tape-scroll',
    ]);
    for (const el of tabbables) expect(el).toHaveAttribute('tabindex', '0');
    expect(
      container.querySelectorAll('[data-slot="ladder-row-mobile"][tabindex]'),
    ).toHaveLength(0);

    // 클릭해도 아무 일도 일어나지 않는다.
    screen.getAllByText('101,000')[0].click();
    expect(onPriceClick).not.toHaveBeenCalled();
  });

  it('⑧ 좁은 폭에는 체결 **열**이 없고, 그 대신 아래 compact 테이프가 있다 (260911-w5h)', () => {
    const { container } = renderChaser();

    const mobileRows = container.querySelectorAll('[data-slot="ladder-row-mobile"]');
    expect(mobileRows).toHaveLength(20);
    for (const row of Array.from(mobileRows)) {
      expect(row.querySelector('[data-slot="ladder-fill-cell"]')).toBeNull();
    }
    // 모바일 사다리는 독립 스크롤을 갖는다(R7).
    expect(container.querySelector('[data-slot="ladder-scroll"]')).not.toBeNull();
    // 모바일 aria-label 은 「최근 체결」을 말하지 않는다.
    expect(
      screen.getByRole('list', { name: '호가 10단 (매도 10단계 · 매수 10단계)' }),
    ).toBeInTheDocument();

    /*
      ★ 데스크톱의 체결 **열**을 좁은 폭에서는 **아래 테이프**가 대신한다. 데이터 원천은
        같은 `recentTrades` 하나이고 새 조회 경로가 없다.
    */
    const tapes = container.querySelectorAll('[data-slot="trade-tape"][data-compact="true"]');
    expect(tapes).toHaveLength(1);
    expect(tapes[0]!.querySelector('thead')).toBeNull(); // 컬럼헤더도 제목행도 없다
    // 데스크톱 트리에는 테이프가 없다 — 거기엔 체결 열이 이미 있다.
    expect(desktopTable().querySelector('[data-slot="trade-tape"]')).toBeNull();
    // 사다리와 테이프 사이 가로선 하나.
    expect(container.querySelectorAll('hr')).toHaveLength(1);
  });

  it('⑨ 범례는 **데스크톱에만** 있다 — 좁은 폭에는 설명할 마커가 없다 (260911-w5h)', () => {
    const { container } = renderChaser();

    const legends = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-legend"]'),
    );
    /*
      ★ 좁은 폭 범례를 없앤 이유는 그 두 항목(최근 체결가 도트 · 상한가 배지)이 마커 슬롯과
        함께 사라졌기 때문이다 — 남겨 두면 **없는 것을 설명하는 줄**이 된다. 그 역할은
        행마다 붙는 `sr-only` 두 줄이 이어받았다(아래 케이스가 잠근다).
    */
    expect(legends).toHaveLength(1);
    expect(legends[0].textContent).toContain('최근 체결가');
    expect(legends[0].textContent).toContain('상한가');
    expect(legends[0].textContent).toContain('체결 수량');
    expect(
      container.querySelectorAll('.min-\\[1280px\\]\\:hidden [data-slot="ladder-legend"]'),
    ).toHaveLength(0);
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

  it('⑪ ★ 10px 허용처를 벗어난 표면이 이 컴포넌트에 없다 (T3 · 260911-w5h)', () => {
    const { container } = renderChaser();

    const tenPx = Array.from(container.querySelectorAll<HTMLElement>('[class*="text-[10px]"]'));
    expect(tenPx.length).toBeGreaterThan(0);
    for (const el of tenPx) {
      const isPct = el.dataset.slot === 'ladder-pct';
      const isFillTime = el.closest('[data-slot="ladder-fill-cell"]') !== null;
      // ⓓ — compact 테이프의 셀 3종(사용자 승인 260911-w5h).
      const isCompactTape = el.closest('[data-slot="trade-tape"]') !== null;
      expect(isPct || isFillTime || isCompactTape).toBe(true);
    }
    // 등락률 40(데스크톱 20 + 모바일 20) + 체결 시각 10 + compact 테이프 행 10 = 60.
    expect(tenPx).toHaveLength(60);

    /*
      ★ **9px 예외는 정확히 1곳**(좁은 폭 사다리의 잔량) — 20행이므로 20개다.
        하나라도 늘면 그 자리가 새 예외이고, 예외가 둘이 되는 순간 규칙이 사라진다.
    */
    const ninePx = Array.from(container.querySelectorAll<HTMLElement>('[class*="text-[9px]"]'));
    expect(ninePx).toHaveLength(20);
    for (const el of ninePx) {
      expect(el.closest('[data-slot="ladder-row-mobile"]')).not.toBeNull();
    }
  });

  /*
    260911-w5h — **좁은 폭 사다리 전면 정리**.

    390px 에서 사다리가 좌측 마커 슬롯에 16px 을 뺏기고, 등락률에 부호·`%` 가 없어 방향을
    색으로만 말했으며, 체결내역이 아예 없었다. 마커를 걷는 대신 **상한가 = 행 배경 /
    최근 체결가 = 굵기**로 옮기고 둘 다 `sr-only` 로도 읽히게 했다.
  */
  it('⑫ 좁은 폭 — 340px 박스 · 34px 행 · 20행 · outline 0', () => {
    const { container } = renderChaser();

    const box = container.querySelector<HTMLElement>('[data-slot="ladder-scroll"]')!;
    // 340 = 34 × 10. 「10행 높이 박스 안에서 10단 전부 스크롤」이 확정 규칙이다.
    expect(box.className).toContain('h-[340px]');
    expect(box.className).toContain('overflow-y-auto');

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-row-mobile"]'),
    );
    expect(rows).toHaveLength(20);
    for (const row of rows) {
      expect(row.className).toContain('h-[34px]');
      // 현재가 행 outline 을 걷었다 — 최근 체결가 굵기가 그 역할을 대신한다.
      expect(row.className).not.toContain('outline');
    }
  });

  it('⑬ 상한가는 행 배경 + `sr-only`, 최근 체결가는 굵기 + `sr-only` 로 읽힌다 (WCAG 1.4.1)', () => {
    // 상한가를 매도 3호가(100,300)에 두고, 최근 체결가는 매수 1호가(99,900)에 둔다.
    const { container } = renderChaser({ upperLimit: 100_300 });
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-row-mobile"]'),
    );

    const upperRows = rows.filter((r) => r.className.includes('var(--up)_8%'));
    expect(upperRows).toHaveLength(1);
    expect(upperRows[0]!.textContent).toContain('100,300');
    // ★ 색만으로 말하지 않는다 — 제거된 `MarkerSlot` 의 `aria-label` 과 **같은 말**이다.
    expect(upperRows[0]!.querySelector('.sr-only ~ .sr-only')?.textContent).toContain('상한가');

    const boldRows = rows.filter(
      (r) => r.querySelector('b')?.className.includes('font-extrabold') === true,
    );
    expect(boldRows).toHaveLength(1);
    expect(boldRows[0]!.textContent).toContain('99,900');
    expect(boldRows[0]!.textContent).toContain('최근 체결가');
    // 나머지 행은 전부 보통 굵기다 — 굵기가 「여기」를 말하는 유일한 축이기 때문이다.
    for (const r of rows) {
      if (r === boldRows[0]) continue;
      expect(r.querySelector('b')!.className).toContain('font-medium');
    }
  });

  it('⑭ 매수 1호가 행에만 경계선이 있다 — 매도1/매수1 사이를 가르는 선이다', () => {
    const { container } = renderChaser();
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-row-mobile"]'),
    );

    const bordered = rows.filter((r) => r.className.includes('border-t'));
    expect(bordered).toHaveLength(1);
    // 11번째 행(매도 10 다음) = 매수 1호가.
    expect(rows.indexOf(bordered[0]!)).toBe(10);
    expect(bordered[0]!.textContent).toContain('매수 1호가');
  });

  it('⑮ 좁은 폭 치수 — 가격 13px · 잔량 9px muted', () => {
    const { container } = renderChaser();
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="ladder-row-mobile"]'),
    );

    for (const row of rows) {
      expect(row.querySelector('b')!.className).toContain('text-[13px]');
      const qty = row.querySelector<HTMLElement>('[class*="text-[9px]"]')!;
      expect(qty.className).toContain('text-[var(--muted-fg)]');
    }
  });

  /*
    ★ **데스크톱 불변 잠금** — 이것이 「모바일만 바꿨다」의 유일한 증거다.
      위 케이스들이 좁은 폭을 통째로 다시 썼으므로, 같은 커밋이 데스크톱 표를 건드리지
      않았다는 사실은 **여기서만** 증명된다.
  */
  it('⑯ ★ 데스크톱 표 불변 — 20행 + 체결 헤더 1 + 체결 셀 10 + 마커 20', () => {
    const { container } = renderChaser();

    expect(container.querySelectorAll('[data-slot="ladder-row"]')).toHaveLength(20);
    expect(container.querySelectorAll('[data-slot="ladder-fill-head"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="ladder-fill-cell"]')).toHaveLength(10);
    expect(container.querySelectorAll('[data-slot="ladder-marker"]')).toHaveLength(20);
    // 데스크톱 등락률은 여전히 `%` 없는 값 + 40px 최소폭이다.
    const deskPcts = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-slot="ladder-price-cell"] [data-slot="ladder-pct"]',
      ),
    );
    expect(deskPcts).toHaveLength(20);
    for (const el of deskPcts) expect(el.textContent).not.toContain('%');
  });
});
