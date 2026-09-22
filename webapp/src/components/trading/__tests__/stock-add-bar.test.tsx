import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Phase 18 Plan 08 Task 2 — 작업대 종목 추가란 (TRADE-06 · D-08 · UI-SPEC E5).
 *
 * 여기서 잠그는 것:
 *   ① 입력 공란이면 「추가」 disabled · 결과 목록 없음
 *   ② 결과의 첫 고를 수 있는 항목이 자동 활성 · ↓/Enter 키보드 왕복
 *   ③ `isin` 없는 종목(ETP 등) · 시장구분 미상 종목은 고를 수 없다(`isPickable` 승격 — 재구현 아님)
 *   ④ 「추가」 → `onAdd(isin, name, code)` 1회 · 카드가 있는 종목은 `onFocusCard`
 *   ⑤ 거래소 토글이 DOM 에 없다 · 긴 종목명은 1줄 ellipsis
 */

const searchMock = vi.fn();
vi.mock('@/lib/stock-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stock-api')>();
  return { ...actual, searchStocks: (...args: unknown[]) => searchMock(...args) };
});

import { STOCK_ADD_PLACEHOLDER, StockAddBar, isPickable } from '../workbench/stock-add-bar';

function row(over: Record<string, unknown> = {}) {
  return {
    code: '086520',
    name: '에코프로',
    market: 'KOSDAQ',
    isin: 'KR7086520004',
    price: 30_000,
    changeAmount: 6_900,
    changeRate: 29.87,
    volume: 100,
    tradeAmount: 100,
    open: 23_100,
    high: 30_000,
    low: 23_000,
    marketCap: 0,
    upperLimit: 30_000,
    lowerLimit: 16_200,
    updatedAt: '2026-09-09T02:00:00Z',
    upperLimitProximity: 100,
    ...over,
  };
}

const ECOPRO = row();
const ECOPRO_BM = row({ code: '247540', name: '에코프로비엠', isin: 'KR7247540008' });
const ETP = row({ code: '0091P0', name: '에코 ETF', isin: null });
const KONEX = row({ code: '000001', name: '코넥스종목', market: 'KONEX', isin: 'KR7000001000' });

function setup(cards: ReadonlySet<string> = new Set()) {
  const onAdd = vi.fn();
  const onFocusCard = vi.fn();
  render(<StockAddBar cards={cards} onAdd={onAdd} onFocusCard={onFocusCard} />);
  return { onAdd, onFocusCard };
}

const input = () => screen.getByPlaceholderText(STOCK_ADD_PLACEHOLDER) as HTMLInputElement;
const addBtn = () => screen.getByRole('button', { name: '추가' });
const options = () => [...document.querySelectorAll<HTMLButtonElement>('[data-slot="lc-search-option"]')];

async function search(rows: unknown[], q = '에코') {
  searchMock.mockResolvedValue(rows);
  fireEvent.change(input(), { target: { value: q } });
  await waitFor(() => expect(options()).toHaveLength(rows.length));
}

beforeEach(() => {
  searchMock.mockReset();
  searchMock.mockResolvedValue([]);
});

describe('StockAddBar — 구성 (D-08)', () => {
  it('검색 입력(UI-SPEC placeholder) + 「추가」 버튼뿐이고 거래소 토글이 없다', () => {
    setup();
    expect(input()).toBeInTheDocument();
    expect(addBtn()).toBeInTheDocument();
    expect(screen.queryByLabelText('거래소')).toBeNull();
    expect(document.querySelector('select')).toBeNull();
    expect(document.querySelector('[data-slot="stock-add-bar"]')!.textContent).not.toMatch(/KRX|NXT/);
  });

  it('입력이 공란이면 「추가」 가 disabled 이고 결과 목록이 없다', () => {
    setup();
    expect(addBtn()).toBeDisabled();
    expect(document.querySelector('[data-slot="lc-search-results"]')).toBeNull();
  });
});

describe('StockAddBar — Phase 16 종목검색 승계 (quick 60)', () => {
  it('결과의 첫 항목이 자동 활성화되고 「추가」 가 활성이다', async () => {
    setup();
    await search([ECOPRO, ECOPRO_BM]);
    await waitFor(() => expect(options()[0]).toHaveAttribute('aria-selected', 'true'));
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0]!.id);
    expect(addBtn()).toBeEnabled();
  });

  it('↓ 로 다음 항목을 활성화하고 Enter 로 확정한다', async () => {
    const { onAdd } = setup();
    await search([ECOPRO, ECOPRO_BM]);
    await waitFor(() => expect(options()[0]).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('KR7247540008', '에코프로비엠', '247540');
  });

  it('isin 이 없는 종목은 고를 수 없다 — 활성화되지 않고 비활성 옵션이다', async () => {
    const { onAdd } = setup();
    await search([ETP, ECOPRO]);
    const [etp, eco] = options();
    expect(etp).toBeDisabled();
    expect(etp).toHaveAttribute('aria-disabled', 'true');
    // 첫 **고를 수 있는** 항목이 활성이다 — ETP 를 건너뛴다
    await waitFor(() => expect(eco).toHaveAttribute('aria-selected', 'true'));
    expect(etp).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(etp!);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('isin 뿐인 종목만 있으면 「추가」 는 비활성 그대로다', async () => {
    setup();
    await search([ETP]);
    expect(addBtn()).toBeDisabled();
  });

  it('시장구분을 알 수 없는 종목도 같은 취급이다(고를 수 없음) — 판정은 승격된 isPickable 하나다', async () => {
    setup();
    await search([KONEX]);
    expect(options()[0]).toBeDisabled();
    expect(isPickable(KONEX as never)).toBe(false);
    expect(isPickable(ETP as never)).toBe(false);
    expect(isPickable(ECOPRO as never)).toBe(true);
  });
});

describe('StockAddBar — 추가 · 기존 카드 (D-07/D-08)', () => {
  it('「추가」 → onAdd(isin, name, code) 1회, 그 뒤 입력이 비워진다', async () => {
    const { onAdd, onFocusCard } = setup();
    await search([ECOPRO]);
    await waitFor(() => expect(addBtn()).toBeEnabled());
    fireEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('KR7086520004', '에코프로', '086520');
    expect(onFocusCard).not.toHaveBeenCalled();
    expect(input().value).toBe('');
    expect(addBtn()).toBeDisabled();
  });

  it('결과 항목 클릭도 같은 경로다 — onAdd 1회', async () => {
    const { onAdd } = setup();
    await search([ECOPRO]);
    fireEvent.click(options()[0]!);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('이미 카드가 있는 종목을 고르면 onAdd 대신 onFocusCard(isin) 이 불린다', async () => {
    const { onAdd, onFocusCard } = setup(new Set(['KR7086520004']));
    await search([ECOPRO]);
    await waitFor(() => expect(addBtn()).toBeEnabled());
    fireEvent.click(addBtn());
    expect(onFocusCard).toHaveBeenCalledTimes(1);
    expect(onFocusCard).toHaveBeenCalledWith('KR7086520004');
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe('StockAddBar — 긴 텍스트 (E5 long-text)', () => {
  it('결과 항목의 긴 종목명은 1줄 ellipsis(truncate)다', async () => {
    setup();
    const long = row({ name: '아주아주긴이름을가진가상의종목주식회사우선주전환상환', code: '999990', isin: 'KR7999990009' });
    await search([long]);
    const name = screen.getByText('아주아주긴이름을가진가상의종목주식회사우선주전환상환');
    expect(name.className).toContain('truncate');
    expect(name.className).toContain('min-w-0');
  });
});

/* ── Task 3 — E5 상태 커버리지 마감 ─────────────────────────────────── */

describe('StockAddBar — E5 empty/loading/error: Phase 16 기존 처리 그대로', () => {
  it('검색 결과 0건은 기존 컴포넌트 문구 「검색 결과가 없어요」 이고 「추가」 는 비활성이다', async () => {
    setup();
    searchMock.mockResolvedValue([]);
    fireEvent.change(input(), { target: { value: '없는종목' } });
    await waitFor(() => expect(screen.getByText('검색 결과가 없어요')).toBeInTheDocument());
    expect(options()).toHaveLength(0);
    expect(addBtn()).toBeDisabled();
  });

  it('검색 중에는 기존 문구 「검색 중이에요…」 뿐이다 — 새 로딩 표면(스피너·스켈레톤)이 없다', async () => {
    setup();
    searchMock.mockReturnValue(new Promise(() => {}));
    fireEvent.change(input(), { target: { value: '에코' } });
    await waitFor(() => expect(screen.getByText('검색 중이에요…')).toBeInTheDocument());
    const bar = document.querySelector('[data-slot="stock-add-bar"]')!;
    expect(bar.querySelector('[role="progressbar"], [class*="animate-"], [class*="skeleton"]')).toBeNull();
    expect(addBtn()).toBeDisabled();
  });

  it('검색 API 실패는 기존 처리 그대로 — 결과 0건 문구로 수렴하고 throw 하지 않는다', async () => {
    setup();
    searchMock.mockRejectedValue(new Error('500'));
    fireEvent.change(input(), { target: { value: '에코' } });
    await waitFor(() => expect(screen.getByText('검색 결과가 없어요')).toBeInTheDocument());
    expect(addBtn()).toBeDisabled();
  });

  it('Esc 는 질의를 비워 결과 목록을 닫는다(상시 입력 — 필드 자체는 남는다)', async () => {
    setup();
    await search([ECOPRO]);
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input().value).toBe('');
    expect(document.querySelector('[data-slot="lc-search-results"]')).toBeNull();
    expect(input()).toBeInTheDocument();
  });
});

describe('StockAddBar — E5 long-text: 입력값은 네이티브 가로 스크롤', () => {
  it('입력은 줄바꿈하지 않는 네이티브 input 이고 폭이 줄어들 수 있다(min-w-0)', () => {
    setup();
    const el = input();
    expect(el.tagName).toBe('INPUT');
    expect(el.className).toContain('min-w-0');
    fireEvent.change(el, { target: { value: '가'.repeat(80) } });
    expect(el.value).toHaveLength(80);
  });
});

/*
  18-13 이관 — 옛 상따 화면 헤더 검색(`limit-chaser-client.test.tsx` ⑯ · ⑱)이 잠그던 키보드·ARIA·
  고를 수 없는 행 규율. 그 검색 필드(`StockSearchField`)는 18-08 부터 이 종목 추가란과 **같은 컴포넌트**
  였고, 옛 화면이 사라지면서 이 파일이 유일한 소비처 테스트가 됐다. 트리거 왕복(종목명 버튼 → 검색 →
  재선택)은 옛 헤더 카드 고유 UI 라 함께 사라졌다(D-08 — 종목 선택은 이 추가란 하나).
*/
describe('StockAddBar — 옛 헤더 검색 규율 이관 (⑯ · ⑱)', () => {
  const activeOption = () => {
    const id = input().getAttribute('aria-activedescendant');
    return id ? (document.getElementById(id) as HTMLButtonElement | null) : null;
  };

  it('↓/↑ 가 활성 항목을 오르내리고 `aria-activedescendant` 가 그 옵션 id 와 정확히 맞는다', async () => {
    setup();
    await search([ECOPRO, ECOPRO_BM]);
    await waitFor(() => expect(activeOption()).toBe(options()[0]));
    expect(options()[1]).toHaveAttribute('aria-selected', 'false');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(activeOption()).toBe(options()[1]);
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(activeOption()).toBe(options()[0]);
  });

  it('↓ 는 목록 **중간의** 고를 수 없는 행도 건너뛴다 — 활성인데 Enter 가 먹통인 행이 없다 (T-u58-01)', async () => {
    setup();
    await search([KONEX, ECOPRO, ETP, ECOPRO_BM]);
    await waitFor(() => expect(activeOption()).toBe(options()[1]));
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(activeOption()).toBe(options()[3]);
    for (const i of [0, 2]) {
      expect(options()[i]).toHaveAttribute('aria-disabled', 'true');
      expect(options()[i]).toHaveAttribute('aria-selected', 'false');
    }
  });

  it('KONEX·시장 미상·ISIN 없음 행에는 「주문 불가」 사유 배지가 붙는다 — 회색으로만 두지 않는다 (WR-03)', async () => {
    setup();
    await search([ECOPRO, KONEX, row({ code: '000002', name: '시장미상', market: null }), ETP]);
    const [ok, konex, unknown, etp] = options();
    expect(ok!.querySelector('[data-slot="lc-search-unorderable"]')).toBeNull();
    for (const el of [konex, unknown, etp]) {
      expect(el).toBeDisabled();
      expect(el!.querySelector('[data-slot="lc-search-unorderable"]')?.textContent).toBe('주문 불가');
    }
  });

  it('고를 수 있는 행이 하나도 없으면 ↓ 로도 활성이 생기지 않고 Enter 가 조용하다', async () => {
    const { onAdd } = setup();
    await search([KONEX, ETP]);
    expect(input().getAttribute('aria-activedescendant')).toBeNull();
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(input().getAttribute('aria-activedescendant')).toBeNull();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('★ 목록이 갱신되면 활성이 새 목록의 첫 행으로 다시 계산된다 — 이전 종목을 이어받지 않는다', async () => {
    const { onAdd } = setup();
    await search([ECOPRO, ECOPRO_BM]);
    await waitFor(() => expect(activeOption()).toBe(options()[0]));
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(activeOption()).toBe(options()[1]);

    await search([row({ code: '005930', name: '삼성전자', isin: 'KR7005930003', market: 'KOSPI' })], '삼성');
    await waitFor(() => expect(activeOption()).toBe(options()[0]));
    expect(options()[0]).toHaveTextContent('삼성전자');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('KR7005930003', '삼성전자', '005930');
  });

  it('Enter 는 활성 항목을 정확히 1회 고르고 기본 동작(폼 제출)을 막는다', async () => {
    const { onAdd } = setup();
    await search([ECOPRO_BM]);
    await waitFor(() => expect(activeOption()).toBe(options()[0]));
    const enter = createEvent.keyDown(input(), { key: 'Enter', bubbles: true, cancelable: true });
    fireEvent(input(), enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('ARIA 조합 — 목록이 없을 때는 `aria-controls` 를 걸지 않고, 뜨면 listbox id 를 가리킨다 (T-u58-06)', async () => {
    setup();
    expect(input()).toHaveAttribute('role', 'combobox');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input().getAttribute('aria-controls')).toBeNull();

    await search([ECOPRO]);
    const list = document.querySelector('[data-slot="lc-search-results"]')!;
    expect(list).toHaveAttribute('role', 'listbox');
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(list.id).not.toBe('');
    expect(input().getAttribute('aria-controls')).toBe(list.id);
    // 옵션 role 은 `<li>` 가 아니라 버튼이 갖는다 — axe `nested-interactive` 회피.
    expect(options()[0]).toHaveAttribute('role', 'option');
    expect(options()[0]!.closest('li')).toHaveAttribute('role', 'presentation');
  });
});
