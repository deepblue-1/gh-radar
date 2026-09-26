import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockDetailTabs } from '../stock-detail-tabs';

/*
  260913-v2e — 탭 전환이 네이티브 `window.history.pushState` 로 바뀌었다(RSC 서버 왕복 제거).

  ★ 회귀 잠금: 탭 전환은 라우터 내비게이션(서버 왕복)으로 되돌아가면 안 된다.
    Phase 21 D-31 부터 탭 셸은 라우터를 **옛 `?tab=orderbook` 딥링크를 /trading 으로 옮길 때만** 쓴다(페이지 밖
    이동). 그래서 목의 라우터 메서드는 전부 스파이이고, 탭 클릭 테스트가 `push`/`replace` 0회를 단언한다
    (`expectNoRouterNav`). 탭 전환 경로에서 라우터를 부르면 그 단언이 실패한다 — 스파이를 지워 「고치지」 마라.

  pushState 스파이는 call-through 다 — 중복 가드가 실시간 `window.location` 을 읽으므로
  no-op 목이면 URL 이 안 바뀌어 가드 검증이 무의미해진다.
*/
let mockSearchParams = new URLSearchParams();
const { mockRouter } = vi.hoisted(() => ({
  mockRouter: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => mockRouter,
}));

function expectNoRouterNav() {
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
}

function renderTabs({ tradable = true }: { tradable?: boolean } = {}) {
  return render(
    <StockDetailTabs
      code="005930"
      tradable={tradable}
      chart={<div>차트 패널</div>}
      info={<div>종목정보 패널</div>}
      news={<div>뉴스토론 패널</div>}
    />,
  );
}

// RTL 의 문자열 name 은 기본이 정확 일치다(`exact` 옵션은 Playwright 전용이라 타입 오류).
function tab(name: string) {
  return screen.getByRole('tab', { name });
}

let pushSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.replaceState(null, '', '/stocks/005930');
  mockSearchParams = new URLSearchParams();
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  pushSpy = vi.spyOn(window.history, 'pushState');
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('StockDetailTabs — pushState 탭 전환 (260913-v2e)', () => {
  it('Test 1 — 클릭 3회 = pushState 3회(쿼리만 쓰는 상대 URL), pathname 유지 · 라우터 0회', async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(tab('종목정보'));
    await user.click(tab('뉴스토론'));
    await user.click(tab('차트'));

    expect(pushSpy).toHaveBeenCalledTimes(3);
    expect(pushSpy).toHaveBeenNthCalledWith(1, null, '', '?tab=info');
    expect(pushSpy).toHaveBeenNthCalledWith(2, null, '', '?tab=news');
    expect(pushSpy).toHaveBeenNthCalledWith(3, null, '', '?tab=chart');
    expect(window.location.pathname).toBe('/stocks/005930');
    expect(window.location.search).toBe('?tab=chart');
    expectNoRouterNav();
  });

  it('Test 1b — 탭은 차트 · 종목정보 · 뉴스토론 3개다 (D-31 — 호가주문 탭 제거)', () => {
    renderTabs();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['차트', '종목정보', '뉴스토론']);
    expect(screen.queryByRole('tab', { name: '호가주문' })).toBeNull();
    expect(screen.queryByTestId('stock-tab-panel-orderbook')).toBeNull();
  });

  it('Test 2 — mousedown → focus 이중 호출(Chrome 순서)에도 기록은 1개 (T3)', () => {
    renderTabs();
    const trigger = tab('종목정보');

    fireEvent.mouseDown(trigger, { button: 0 });
    act(() => {
      trigger.focus();
    });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?tab=info');
  });

  it('Test 3 — 탭 전환 시 탭 바 기준 스크롤({ block: "start" })은 유지된다', async () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const user = userEvent.setup();
    renderTabs();

    await user.click(tab('종목정보'));

    expect(scrollSpy).toHaveBeenCalledWith({ block: 'start' });
  });

  it('Test 5 — 한 번 연 차트·종목정보·뉴스토론 패널은 숨겨질 뿐 남아 있다(재마운트·재조회 없음)', () => {
    const view = renderTabs();
    const panelOf = (text: string) => screen.getByText(text).closest('[role="tabpanel"]');
    // 아직 열지 않은 탭은 마운트하지 않는다(첫 진입 비용 그대로).
    expect(screen.queryByText('뉴스토론 패널')).toBeNull();

    // 차트(기본) → 종목정보 → 뉴스토론 순으로 연다. useSearchParams 목은 URL 을 따라가지 않으므로
    // 활성값 변화를 rerender 로 흉내 낸다.
    mockSearchParams = new URLSearchParams('tab=info');
    view.rerender(
      <StockDetailTabs code="005930" tradable chart={<div>차트 패널</div>} info={<div>종목정보 패널</div>} news={<div>뉴스토론 패널</div>} />,
    );
    mockSearchParams = new URLSearchParams('tab=news');
    view.rerender(
      <StockDetailTabs code="005930" tradable chart={<div>차트 패널</div>} info={<div>종목정보 패널</div>} news={<div>뉴스토론 패널</div>} />,
    );

    expect(panelOf('차트 패널')).toHaveAttribute('data-state', 'inactive');
    expect(panelOf('종목정보 패널')).toHaveAttribute('data-state', 'inactive');
    expect(panelOf('뉴스토론 패널')).toHaveAttribute('data-state', 'active');
  });

  it('Test 6 — 옛 딥링크 `?tab=orderbook` + 매매 가능 → router.replace(/trading?code=) 한 번 · 렌더는 차트 (D-31)', () => {
    mockSearchParams = new URLSearchParams('tab=orderbook');
    window.history.replaceState(null, '', '/stocks/005930?tab=orderbook');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const view = renderTabs();

    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/trading?code=005930');
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(tab('차트')).toHaveAttribute('aria-selected', 'true');

    // 다시 렌더돼도(같은 검색 파라미터) 한 번뿐이다.
    view.rerender(<StockDetailTabs code="005930" tradable chart={<div>차트 패널</div>} info={<div>종목정보 패널</div>} news={<div>뉴스토론 패널</div>} />);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it('Test 6b — 옛 딥링크 `?tab=orderbook` + 매매 불가 → URL 만 ?tab=chart(replaceState) · 이동 없음 (D-31)', () => {
    mockSearchParams = new URLSearchParams('tab=orderbook');
    window.history.replaceState(null, '', '/stocks/005930?tab=orderbook');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    renderTabs({ tradable: false });

    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '?tab=chart');
    expectNoRouterNav();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/stocks/005930');
    expect(window.location.search).toBe('?tab=chart');
    expect(tab('차트')).toHaveAttribute('aria-selected', 'true');
  });

  it('Test 4 — 이미 활성인 탭을 다시 누르면 pushState·스크롤 0회', async () => {
    mockSearchParams = new URLSearchParams('tab=news');
    window.history.replaceState(null, '', '/stocks/005930?tab=news');
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const user = userEvent.setup();
    renderTabs();

    await user.click(tab('뉴스토론'));

    expect(pushSpy).not.toHaveBeenCalled();
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});

describe('StockDetailTabs — 탭 안 전체목록 재클릭 = 요약 (Phase 21 D-29 · T9)', () => {
  it('Test 9 — 전체목록(우리가 쌓은 기록)에서 활성 뉴스토론 탭 재클릭 → history.back 1회 · pushState 0회', async () => {
    mockSearchParams = new URLSearchParams('tab=news&view=news');
    // news-view.ts 의 showAll 이 남기는 표식(history.state) — 우리가 쌓은 기록이다.
    window.history.replaceState({ ghNewsView: '005930' }, '', '/stocks/005930?tab=news&view=news');
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const user = userEvent.setup();
    renderTabs();

    await user.click(tab('뉴스토론'));

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('Test 10 — 딥링크 전체목록(표식 없음)에서 재클릭 → replaceState(?tab=news) 1회 · 페이지 유지', async () => {
    mockSearchParams = new URLSearchParams('tab=news&view=discussions');
    window.history.replaceState(null, '', '/stocks/005930?tab=news&view=discussions');
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const user = userEvent.setup();
    renderTabs();

    await user.click(tab('뉴스토론'));

    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '?tab=news');
    expect(backSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/stocks/005930');
    expect(window.location.search).toBe('?tab=news');
  });

  it('Test 11 — 전체목록에서 다른 탭 클릭은 기존 전환(pushState 1회 · 요약 복귀 호출 없음)', async () => {
    mockSearchParams = new URLSearchParams('tab=news&view=news');
    window.history.replaceState({ ghNewsView: '005930' }, '', '/stocks/005930?tab=news&view=news');
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const user = userEvent.setup();
    renderTabs();

    await user.click(tab('차트'));

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledWith(null, '', '?tab=chart');
    expect(backSpy).not.toHaveBeenCalled();
  });
});

describe('StockDetailTabs — 폰 「트레이딩」 CTA (260924-vj1 · Phase 21 D-30 · G-21-R3-9)', () => {
  it('Test 7 — 매매 가능 종목이면 CTA 는 /trading?code= 링크 「트레이딩」 — 탭 전환(pushState)을 부르지 않는다', async () => {
    const user = userEvent.setup();
    const { container } = renderTabs();

    const bar = container.querySelector('[data-slot="detail-order-cta-bar"]');
    expect(bar).not.toBeNull();
    // 뷰포트 md 이상에서는 숨는다(앱 셸 층 분기 — 넓은 폭은 히어로 알약이 맡는다).
    expect(bar!.className).toContain('md:hidden');

    // TDS BottomCTA = 버튼 xlarge(56 · radius 16) · 탭 트리거 = t5 17 (260925-0pf).
    const cta = screen.getByRole('link', { name: '트레이딩' });
    expect(cta).toHaveAttribute('data-slot', 'detail-order-cta');
    expect(cta).toHaveAttribute('href', '/trading?code=005930');
    expect(cta.className).toContain('h-[56px]');
    expect(cta.className).toContain('rounded-[16px]');
    expect(cta.className).toContain('bg-[var(--up)]');
    expect(tab('차트').className).toContain('text-[17px]');
    expect(screen.queryByRole('button', { name: '주문하기' })).toBeNull();
    expect(container.querySelector('[data-order-cta="true"]')).not.toBeNull();

    // jsdom 은 링크 이동을 하지 않는다 — 단언 대상은 「탭 전환 경로를 타지 않는다」다.
    cta.addEventListener('click', (e) => e.preventDefault());
    await user.click(cta);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('Test 7b — 매매 불가 종목(tradable false)이면 CTA 바 · 링크 · 예약 여백이 없다 (T-21-93)', () => {
    const { container } = renderTabs({ tradable: false });

    expect(container.querySelector('[data-slot="detail-order-cta-bar"]')).toBeNull();
    expect(screen.queryByRole('link', { name: '트레이딩' })).toBeNull();
    expect(container.querySelector('[data-order-cta="true"]')).toBeNull();
  });

  it('Test 8 — CTA 는 모든 탭에서 보인다(D-31 — CTA 를 숨기던 호가주문 탭이 사라졌다)', () => {
    for (const t of ['chart', 'info', 'news']) {
      mockSearchParams = new URLSearchParams(`tab=${t}`);
      const { container, unmount } = renderTabs();
      expect(container.querySelector('[data-slot="detail-order-cta-bar"]')).not.toBeNull();
      expect(container.querySelector('[data-order-cta="true"]')).not.toBeNull();
      unmount();
    }
  });
});

describe('StockDetailTabs — 탭 선택 색 (260925-gy6)', () => {
  it('260925-gy6 — sketch 003-A 탭 선택 = 선택 토큰(글자 --nav-on-fg · 밑줄 --nav-on-line)', () => {
    renderTabs();
    const cls = tab('차트').className;
    expect(cls).toContain('data-[state=active]:text-[var(--nav-on-fg)]');
    expect(cls).toContain('data-[state=active]:border-b-[var(--nav-on-line)]');
  });
});
