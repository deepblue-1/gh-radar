import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * 18-09 Task 3 — 종목정보 팝업 (D-25 · D-28 · D-30 · E14 · TRADE-09).
 *
 * 잠그는 규칙:
 *   - `code` 가 없으면 열리지 않는다(카드 헤더 ⓘ 비활성과 같은 사실, D-30)
 *   - 제목 = 종목명 + 코드(mono), `DialogTitle`·`DialogDescription` 존재(a11y)
 *   - 탭 3개 「차트」「종목정보」「뉴스·토론」 — 호가주문 탭이 **없다**
 *   - 닫기 ✕ · 배경 클릭 · ESC 세 경로
 *   - 닫으면 내용 언마운트(모달 N개가 쌓이지 않는다) · 포커스는 트리거(ⓘ)로 복귀
 *   - 모달 DOM 은 카드 `<article>` 의 자손이 아니다 — `document.body` 포털(RESEARCH A5 를 기계로 닫는다)
 *   - 차트에 주입되는 색은 oklch 문자열이 아니다(lightweight-charts 거부, Pitfall 9)
 *
 * ★ 스텁 경계 — 탭 본문의 **데이터 섹션**(종목정보·뉴스·토론)은 기존 종목상세 컴포넌트이고
 *   각자의 테스트가 있다. 여기서는 마운트/언마운트만 세도록 스텁으로 바꾼다. 차트는 색 주입을
 *   보기 위해 **실제** 섹션을 쓰고 `lightweight-charts` 만 목으로 바꾼다.
 */

// ── lightweight-charts — 옵션으로 넘어간 색을 모은다 ──
const chartCalls: unknown[] = [];
vi.mock('lightweight-charts', () => {
  const series = {
    applyOptions: vi.fn((o: unknown) => chartCalls.push(o)),
    setData: vi.fn(),
  };
  const priceScale = { applyOptions: vi.fn((o: unknown) => chartCalls.push(o)) };
  const chart = {
    addSeries: vi.fn((_t: unknown, o: unknown) => {
      chartCalls.push(o);
      return series;
    }),
    priceScale: vi.fn(() => priceScale),
    timeScale: vi.fn(() => ({ fitContent: vi.fn(), setVisibleLogicalRange: vi.fn() })),
    applyOptions: vi.fn((o: unknown) => chartCalls.push(o)),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    remove: vi.fn(),
  };
  return {
    createChart: vi.fn((_el: unknown, o: unknown) => {
      chartCalls.push(o);
      return chart;
    }),
    createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn(), detach: vi.fn() })),
    CandlestickSeries: 'CandlestickSeries',
    HistogramSeries: 'HistogramSeries',
  };
});

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));

const fetchDailyOhlcvMock = vi.fn();
vi.mock('@/lib/daily-ohlcv-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/daily-ohlcv-api')>();
  return { ...actual, fetchDailyOhlcv: (...a: unknown[]) => fetchDailyOhlcvMock(...a) };
});

const fetchStockDetailMock = vi.fn();
vi.mock('@/lib/stock-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stock-api')>();
  return { ...actual, fetchStockDetail: (...a: unknown[]) => fetchStockDetailMock(...a) };
});

// ── 데이터 섹션 스텁 — 마운트 수를 센다 ──
const mounts = { news: 0, discussion: 0, limitUp: 0 };
const unmounts = { news: 0 };
function stub(label: string, key?: keyof typeof mounts, showAllLabel?: string) {
  return function Stub({ stockCode, onShowAll }: { stockCode: string; onShowAll?: () => void }) {
    React.useEffect(() => {
      if (key) mounts[key] += 1;
      return () => {
        if (key === 'news') unmounts.news += 1;
      };
    }, []);
    return (
      <section data-testid={`stub-${label}`}>
        {`${label}:${stockCode}`}
        {/* 21-30 섹션 계약 — onShowAll 이 있으면 전체 보기가 버튼이다(없으면 Link). */}
        {showAllLabel && onShowAll && (
          <button type="button" onClick={onShowAll}>
            {showAllLabel}
          </button>
        )}
      </section>
    );
  };
}
/** 21-30 전체목록 스텁 — 목록 자체는 `news-full-list` · `discussion-full-list` 테스트 몫. */
function fullListStub(label: string) {
  return function FullListStub({ code, onBack }: { code: string; onBack?: () => void }) {
    return (
      <section data-testid={`full-${label}`}>
        {onBack && (
          <button type="button" aria-label="요약으로 돌아가기" onClick={onBack}>
            ←
          </button>
        )}
        {`full-${label}:${code}`}
      </section>
    );
  };
}
vi.mock('@/components/stock/news-full-list', () => ({ NewsFullList: fullListStub('news') }));
vi.mock('@/components/stock/discussion-full-list', () => ({
  DiscussionFullList: fullListStub('discussions'),
}));
vi.mock('@/components/stock/stock-news-section', () => ({
  StockNewsSection: stub('news', 'news', '전체 뉴스 보기'),
}));
vi.mock('@/components/stock/stock-discussion-section', () => ({
  StockDiscussionSection: stub('discussion', 'discussion', '전체 토론 보기'),
}));
vi.mock('@/components/stock/stock-limit-up-section', () => ({
  StockLimitUpSection: stub('limit-up', 'limitUp'),
}));
vi.mock('@/components/stock/stock-comovement-section', () => ({
  StockComovementSection: stub('comovement'),
}));
vi.mock('@/components/theme/theme-chips', () => ({ StockThemeChips: stub('themes') }));
vi.mock('@/components/stock/stock-stats-grid', () => ({
  StockStatsGrid: ({ stock }: { stock: { code: string } }) => (
    <section data-testid="stub-stats">{`stats:${stock.code}`}</section>
  ),
}));

import { StockInfoModal } from '../card/stock-info-modal';
import { CardHeader } from '../card/card-header';

const ROWS = [
  { date: '2026-09-18', open: 400000, high: 415000, low: 398000, close: 410000, volume: 1000, changeAmount: 5000, changeRate: 1.23 },
  { date: '2026-09-21', open: 410000, high: 420000, low: 405000, close: 412000, volume: 1200, changeAmount: 2000, changeRate: 0.49 },
];

/** 카드 1장 — 헤더의 ⓘ 가 팝업을 연다. 모달은 **카드 안에서** 렌더된다(포털 검증용). */
function Card({ code, name = '알테오젠' }: { code: string | null; name?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <article data-slot="strategy-card" className="@container/lc">
      <CardHeader
        name={name}
        code={code}
        exchange="KRX"
        onExchangeChange={vi.fn()}
        price={412000}
        changeRate={1.2}
        ledServer={null}
        onArm={vi.fn()}
        open
        onToggle={vi.fn()}
        toggleId="t-1"
        controlsId="c-1"
        onInfo={() => setOpen(true)}
        onClose={vi.fn()}
      />
      <StockInfoModal code={code} name={name} open={open} onOpenChange={setOpen} />
    </article>
  );
}

async function openFromCard(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', { name: '종목정보' });
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog');
  return { trigger, dialog };
}

beforeEach(() => {
  chartCalls.length = 0;
  mounts.news = 0;
  mounts.discussion = 0;
  mounts.limitUp = 0;
  unmounts.news = 0;
  fetchDailyOhlcvMock.mockReset();
  fetchDailyOhlcvMock.mockResolvedValue(ROWS);
  fetchStockDetailMock.mockReset();
  fetchStockDetailMock.mockResolvedValue({ code: '196170', name: '알테오젠', price: 412000 });
});

describe('StockInfoModal', () => {
  it('① code 가 없으면 열리지 않는다 — ⓘ 가 비활성이고, open 을 강제로 줘도 대화상자가 없다', async () => {
    render(<Card code={null} />);
    expect(screen.getByRole('button', { name: '종목정보' })).toBeDisabled();
    render(<StockInfoModal code={null} name="돌파 유래" open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('② 제목은 종목명 + 코드(mono) 이고 DialogTitle·DialogDescription 이 있다', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    const { dialog } = await openFromCard(user);
    const title = within(dialog).getByRole('heading', { name: /알테오젠/ });
    expect(title).toHaveAttribute('data-slot', 'dialog-title');
    const code = within(title).getByText('196170');
    expect(code.className).toContain('mono');
    expect(dialog).toHaveAttribute('aria-describedby');
    const desc = document.getElementById(dialog.getAttribute('aria-describedby')!);
    expect(desc).not.toBeNull();
    expect(desc).toHaveAttribute('data-slot', 'dialog-description');
  });

  it('③ 탭은 「차트」「종목정보」「뉴스·토론」 셋이고 호가주문 탭이 없다', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    const { dialog } = await openFromCard(user);
    // 팝업 탭 목록으로 좁힌다 — 차트 섹션 안에도 자기 단위·기간 토글이 있다(재사용된 기존 UI).
    const list = within(dialog).getByRole('tablist', { name: '종목정보 팝업 탭' });
    const tabs = within(list).getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['차트', '종목정보', '뉴스·토론']);
    expect(within(dialog).queryByRole('tab', { name: /호가/ })).toBeNull();
    expect(dialog.textContent).not.toContain('호가주문');
  });

  it('③-a 탭 본문은 기존 종목상세 섹션 재사용이다 — 종목정보·뉴스·토론 모두 같은 코드로 붙는다', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    const { dialog } = await openFromCard(user);
    await user.click(within(dialog).getByRole('tab', { name: '종목정보' }));
    expect(await within(dialog).findByTestId('stub-stats')).toHaveTextContent('stats:196170');
    expect(within(dialog).getByTestId('stub-limit-up')).toHaveTextContent('limit-up:196170');
    expect(within(dialog).getByTestId('stub-comovement')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('tab', { name: '뉴스·토론' }));
    expect(within(dialog).getByTestId('stub-news')).toHaveTextContent('news:196170');
    expect(within(dialog).getByTestId('stub-discussion')).toBeInTheDocument();
  });

  it('③-b 탭별 독립 로드 — 종목 상세 조회가 실패해도 이력·동반상승 섹션은 그대로 뜬다', async () => {
    const user = userEvent.setup();
    fetchStockDetailMock.mockRejectedValue(new Error('boom'));
    render(<Card code="196170" />);
    const { dialog } = await openFromCard(user);
    await user.click(within(dialog).getByRole('tab', { name: '종목정보' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(within(dialog).getByTestId('stub-limit-up')).toBeInTheDocument();
    expect(within(dialog).queryByTestId('stub-stats')).toBeNull();
  });

  it('④ ✕ 버튼(aria-label 「닫기」) 으로 닫힌다', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    const { dialog } = await openFromCard(user);
    await user.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('④-a ESC 로 닫힌다', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    await openFromCard(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('④-b 배경(오버레이) 클릭으로 닫힌다', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    await openFromCard(user);
    const overlay = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    await user.pointer({ keys: '[MouseLeft]', target: overlay });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('⑤ 닫으면 내용이 언마운트되고 다시 열면 새로 마운트된다 (모달이 쌓이지 않는다)', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    let { dialog } = await openFromCard(user);
    await user.click(within(dialog).getByRole('tab', { name: '뉴스·토론' }));
    expect(mounts.news).toBe(1);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(unmounts.news).toBe(1);
    expect(screen.queryByTestId('stub-news')).toBeNull();

    ({ dialog } = await openFromCard(user));
    // 다시 열면 기본 탭(차트)부터 — 이전 인스턴스를 되살리지 않는다.
    expect(within(dialog).getByRole('tab', { name: '차트' })).toHaveAttribute('aria-selected', 'true');
    await user.click(within(dialog).getByRole('tab', { name: '뉴스·토론' }));
    expect(mounts.news).toBe(2);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it('⑥ 닫은 뒤 포커스가 트리거(ⓘ)로 돌아온다', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    const { trigger } = await openFromCard(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('⑦ 모달 DOM 은 카드 <article> 의 자손이 아니다 — document.body 포털이다', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    const { dialog } = await openFromCard(user);
    const article = document.querySelector('article[data-slot="strategy-card"]')!;
    expect(article.contains(dialog)).toBe(false);
    expect(dialog.closest('article')).toBeNull();
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('⑨ 크기·안전영역·✕ (G-21-R3-7) — ≥700 고정 높이 · 본문 scrollbar-gutter · 폰 safe-area 패딩 · ✕ 아이콘 32 상자 히트 44 · 첫 포커스 ✕', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    const { dialog } = await openFromCard(user);
    const tokens = (el: Element) => el.className.split(/\s+/);

    // ≥700 — 탭·로딩과 무관한 고정 높이(가변 h-auto · max-h 제거).
    expect(tokens(dialog)).toContain(
      'min-[700px]:h-[min(720px,calc(100dvh-48px-var(--app-safe-top)-var(--app-safe-bottom)))]',
    );
    expect(tokens(dialog)).not.toContain('min-[700px]:h-auto');
    expect(tokens(dialog)).not.toContain('min-[700px]:max-h-[calc(100dvh-48px)]');

    // 본문 — 스크롤바 자리 예약 · 폰 하단 안전영역 · ≥700 종전 pb-3.
    const body = dialog.querySelector('[data-slot="stock-info-modal-body"]') as HTMLElement;
    for (const c of ['[scrollbar-gutter:stable]', 'pb-[calc(12px+var(--app-safe-bottom))]', 'min-[700px]:pb-3']) {
      expect(tokens(body)).toContain(c);
    }

    // 헤더 — 폰 상단 안전영역 · ≥700 종전 pt-2.5.
    const header = dialog.querySelector('[data-slot="dialog-header"]') as HTMLElement;
    for (const c of ['pt-[calc(10px+var(--app-safe-top))]', 'pb-2.5', 'min-[700px]:pt-2.5']) {
      expect(tokens(header)).toContain(c);
    }

    // ✕ — lucide 아이콘 · 글리프 없음 · 32 상자 · 히트 44 · 이름 「닫기」 · 첫 포커스.
    const close = within(dialog).getByRole('button', { name: '닫기' });
    expect(close.textContent).toBe('');
    const svgs = close.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
    for (const c of ['size-8', 'relative', 'after:absolute', 'after:-inset-1.5']) {
      expect(tokens(close)).toContain(c);
    }
    await waitFor(() => expect(close).toHaveFocus());
  });

  it('⑧ 차트에 주입되는 색 값은 oklch 가 아니다 (hex/rgb 만)', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    await openFromCard(user);
    await waitFor(() => expect(chartCalls.length).toBeGreaterThan(0));
    const colors: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') colors.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    chartCalls.forEach(walk);
    expect(colors.some((c) => /^#|^rgba?\(/.test(c))).toBe(true);
    expect(colors.filter((c) => /oklch|var\(--/.test(c))).toEqual([]);
  });
});

describe('StockInfoModal — 팝업 안 전체목록 (D-29 · G-21-R3-8 · T-21-81)', () => {
  async function openNewsTab(user: ReturnType<typeof userEvent.setup>) {
    const { dialog } = await openFromCard(user);
    await user.click(within(dialog).getByRole('tab', { name: '뉴스·토론' }));
    return dialog;
  }
  const historySpies = () => ({
    push: vi.spyOn(window.history, 'pushState'),
    replace: vi.spyOn(window.history, 'replaceState'),
    back: vi.spyOn(window.history, 'back'),
  });
  const expectHistoryUntouched = (spies: ReturnType<typeof historySpies>, href: string) => {
    expect(spies.push).not.toHaveBeenCalled();
    expect(spies.replace).not.toHaveBeenCalled();
    expect(spies.back).not.toHaveBeenCalled();
    expect(window.location.href).toBe(href);
  };

  it('「전체 뉴스 보기」 → 팝업 안 NewsFullList · 요약 섹션은 보이지 않는다', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    const dialog = await openNewsTab(user);
    await user.click(within(dialog).getByRole('button', { name: '전체 뉴스 보기' }));

    expect(within(dialog).getByTestId('full-news')).toHaveTextContent('full-news:196170');
    expect(within(dialog).getByTestId('stub-news')).not.toBeVisible();
    expect(within(dialog).getByTestId('stub-discussion')).not.toBeVisible();
    expect(within(dialog).queryByTestId('full-discussions')).toBeNull();
  });

  it('Escape → 요약으로 돌아오고 팝업은 열려 있다 · 한 번 더 Escape → 팝업이 닫힌다', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    const dialog = await openNewsTab(user);
    await user.click(within(dialog).getByRole('button', { name: '전체 뉴스 보기' }));
    expect(within(dialog).getByTestId('full-news')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).queryByTestId('full-news')).toBeNull();
    expect(within(dialog).getByTestId('stub-news')).toBeVisible();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('전체목록의 「요약으로 돌아가기」 → 요약 · 「전체 토론 보기」 도 같은 규칙(← · Escape)', async () => {
    const user = userEvent.setup();
    render(<Card code="196170" />);
    const dialog = await openNewsTab(user);

    await user.click(within(dialog).getByRole('button', { name: '전체 뉴스 보기' }));
    await user.click(within(dialog).getByRole('button', { name: '요약으로 돌아가기' }));
    expect(within(dialog).queryByTestId('full-news')).toBeNull();
    expect(within(dialog).getByTestId('stub-discussion')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: '전체 토론 보기' }));
    expect(within(dialog).getByTestId('full-discussions')).toHaveTextContent('full-discussions:196170');
    expect(within(dialog).getByTestId('stub-news')).not.toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: '요약으로 돌아가기' }));
    expect(within(dialog).queryByTestId('full-discussions')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: '전체 토론 보기' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).queryByTestId('full-discussions')).toBeNull();
  });

  it('어느 단계에서도 window.history · URL 이 바뀌지 않는다 · 닫았다 다시 열면 요약부터', async () => {
    const user = userEvent.setup();
    const href = window.location.href;
    render(<Card code="196170" />);
    const spies = historySpies();
    const dialog = await openNewsTab(user);
    await user.click(within(dialog).getByRole('button', { name: '전체 뉴스 보기' }));
    await user.click(within(dialog).getByRole('button', { name: '요약으로 돌아가기' }));
    await user.click(within(dialog).getByRole('button', { name: '전체 토론 보기' }));
    await user.keyboard('{Escape}');
    await user.click(within(dialog).getByRole('button', { name: '전체 뉴스 보기' }));
    // 전체목록인 채로 ✕ 로 닫는다 → 다시 열면 요약(전체목록 상태가 남지 않는다).
    await user.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const reopened = await openNewsTab(user);
    expect(within(reopened).queryByTestId('full-news')).toBeNull();
    expect(within(reopened).getByTestId('stub-news')).toBeVisible();
    expectHistoryUntouched(spies, href);
  });
});
