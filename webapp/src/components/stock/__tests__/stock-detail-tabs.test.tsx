import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockDetailTabs } from '../stock-detail-tabs';

/*
  260913-v2e — 탭 전환이 네이티브 `window.history.pushState` 로 바뀌었다(RSC 서버 왕복 제거).

  ★ 회귀 잠금: 아래 `next/navigation` 목은 **검색 파라미터 훅 하나만** 내보낸다.
    탭 셸이 라우터 훅을 다시 부르면 vitest 가 "No export defined on mock" 로 이 파일의
    모든 테스트를 실패시킨다 — 라우터 내비게이션(서버 왕복)으로 되돌아가는 것을 막는 장치다.
    목에 라우터 훅을 추가해 이 실패를 "고치지" 마라.

  pushState 스파이는 call-through 다 — 중복 가드가 실시간 `window.location` 을 읽으므로
  no-op 목이면 URL 이 안 바뀌어 가드 검증이 무의미해진다.
*/
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

function renderTabs() {
  return render(
    <StockDetailTabs
      code="005930"
      chart={<div>차트 패널</div>}
      orderbook={<div>호가주문 패널</div>}
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
  pushSpy = vi.spyOn(window.history, 'pushState');
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('StockDetailTabs — pushState 탭 전환 (260913-v2e)', () => {
  it('Test 1 — 클릭 3회 = pushState 3회(쿼리만 쓰는 상대 URL), pathname 유지', async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(tab('호가주문'));
    await user.click(tab('종목정보'));
    await user.click(tab('뉴스토론'));

    expect(pushSpy).toHaveBeenCalledTimes(3);
    expect(pushSpy).toHaveBeenNthCalledWith(1, null, '', '?tab=orderbook');
    expect(pushSpy).toHaveBeenNthCalledWith(2, null, '', '?tab=info');
    expect(pushSpy).toHaveBeenNthCalledWith(3, null, '', '?tab=news');
    expect(window.location.pathname).toBe('/stocks/005930');
    expect(window.location.search).toBe('?tab=news');
  });

  it('Test 2 — mousedown → focus 이중 호출(Chrome 순서)에도 기록은 1개 (T3)', () => {
    renderTabs();
    const trigger = tab('호가주문');

    fireEvent.mouseDown(trigger, { button: 0 });
    act(() => {
      trigger.focus();
    });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?tab=orderbook');
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

    // 차트(기본) → 종목정보 → 뉴스토론 순으로 연다. useSearchParams 목은 URL 을 따라가지 않으므로
    // 활성값 변화를 rerender 로 흉내 낸다.
    mockSearchParams = new URLSearchParams('tab=info');
    view.rerender(
      <StockDetailTabs code="005930" chart={<div>차트 패널</div>} orderbook={<div>호가주문 패널</div>} info={<div>종목정보 패널</div>} news={<div>뉴스토론 패널</div>} />,
    );
    mockSearchParams = new URLSearchParams('tab=news');
    view.rerender(
      <StockDetailTabs code="005930" chart={<div>차트 패널</div>} orderbook={<div>호가주문 패널</div>} info={<div>종목정보 패널</div>} news={<div>뉴스토론 패널</div>} />,
    );

    expect(panelOf('차트 패널')).toHaveAttribute('data-state', 'inactive');
    expect(panelOf('종목정보 패널')).toHaveAttribute('data-state', 'inactive');
    expect(panelOf('뉴스토론 패널')).toHaveAttribute('data-state', 'active');
    // 아직 열지 않은 호가주문은 마운트하지 않는다.
    expect(screen.queryByText('호가주문 패널')).toBeNull();
  });

  it('Test 6 — 호가주문은 떠나면 언마운트된다(실시간 구독을 탭 밖에서 붙잡지 않음)', () => {
    mockSearchParams = new URLSearchParams('tab=orderbook');
    const view = renderTabs();
    expect(screen.getByText('호가주문 패널')).toBeInTheDocument();

    mockSearchParams = new URLSearchParams('tab=chart');
    view.rerender(
      <StockDetailTabs code="005930" chart={<div>차트 패널</div>} orderbook={<div>호가주문 패널</div>} info={<div>종목정보 패널</div>} news={<div>뉴스토론 패널</div>} />,
    );
    expect(screen.queryByText('호가주문 패널')).toBeNull();
    expect(screen.getByText('차트 패널')).toBeInTheDocument();
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

describe('StockDetailTabs — 폰 「주문하기」 CTA (260924-vj1)', () => {
  it('Test 7 — 호가주문 외 탭에서 CTA 가 보이고, 누르면 기존 탭 전환 경로로 호가주문 1회 push', async () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const user = userEvent.setup();
    const { container } = renderTabs();

    const bar = container.querySelector('[data-slot="detail-order-cta-bar"]');
    expect(bar).not.toBeNull();
    // 뷰포트 md 이상에서는 숨는다(앱 셸 층 분기).
    expect(bar!.className).toContain('md:hidden');

    await user.click(screen.getByRole('button', { name: '주문하기' }));

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledWith(null, '', '?tab=orderbook');
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'start' });
  });

  it('Test 8 — 호가주문 탭에서는 CTA 가 언마운트된다(더티 액션 바와 동시 노출 없음)', () => {
    mockSearchParams = new URLSearchParams('tab=orderbook');
    const { container } = renderTabs();

    expect(container.querySelector('[data-slot="detail-order-cta-bar"]')).toBeNull();
    expect(screen.queryByRole('button', { name: '주문하기' })).toBeNull();
  });
});
