import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * quick-260926-o2u D2 — 공용 PageHeader 계약.
 *
 * ① h1 = 22px/700/-0.02em(검색 페이지 h1 과 같은 규격), 제목 줄 최소 높이 44px(`min-h-11`).
 * ② 루트는 `<header>` 요소가 아니다 — home.spec 잉크 불변식이 `header svg` 를 센다.
 * ③ 뒤로가기(허브 하위 페이지만): history 가 있으면 router.back(), 없으면 `/search` 로.
 *    back 이 없으면 useRouter 를 부르지 않는다(라우터 컨텍스트 없는 HomeClient 테스트 보호).
 */

const back = vi.fn();
const push = vi.fn();
const useRouter = vi.fn(() => ({ back, push }));
vi.mock('next/navigation', () => ({
  useRouter: () => useRouter(),
}));

import { PageHeader } from '../page-header';

beforeEach(() => {
  back.mockReset();
  push.mockReset();
  useRouter.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PageHeader (quick-260926-o2u D2)', () => {
  it('h1 이 22px/700/-0.02em 이고 제목 줄이 min-h-11 — back 없으면 뒤로가기도 useRouter 호출도 없다', () => {
    render(<PageHeader title="상승률 상위" />);
    const h1 = screen.getByRole('heading', { level: 1, name: '상승률 상위' });
    expect(h1.className).toContain('text-[22px]');
    expect(h1.className).toContain('font-bold');
    expect(h1.className).toContain('tracking-[-0.02em]');
    expect(h1.parentElement?.className).toContain('min-h-11');
    expect(screen.queryByRole('button', { name: '뒤로가기' })).toBeNull();
    expect(useRouter).not.toHaveBeenCalled();
  });

  it('루트는 data-slot="page-header" 이고 header 요소가 없다', () => {
    const { container } = render(<PageHeader title="테마" back />);
    expect(container.querySelector('[data-slot="page-header"]')).not.toBeNull();
    expect(container.querySelectorAll('header')).toHaveLength(0);
  });

  it('back + history 2 → 클릭 시 router.back()', () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(2);
    render(<PageHeader title="테마" back />);
    fireEvent.click(screen.getByRole('button', { name: '뒤로가기' }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('back + history 1 → 클릭 시 router.push("/search")', () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    render(<PageHeader title="관심종목" back />);
    fireEvent.click(screen.getByRole('button', { name: '뒤로가기' }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/search');
    expect(back).not.toHaveBeenCalled();
  });

  it('뒤로가기 버튼 — 접근 이름 · type=button · 아이콘 aria-hidden', () => {
    render(<PageHeader title="테마" back />);
    const btn = screen.getByRole('button', { name: '뒤로가기' });
    expect(btn.getAttribute('type')).toBe('button');
    const svg = btn.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
  });

  it('actions 는 ml-auto 영역에, description 은 muted 설명 문단으로 렌더된다', () => {
    render(
      <PageHeader
        title="관심종목"
        actions={<span>15:31 갱신</span>}
        description="설명 문구"
      />,
    );
    const action = screen.getByText('15:31 갱신');
    expect(action.parentElement?.className).toContain('ml-auto');
    const desc = screen.getByText('설명 문구');
    expect(desc.tagName).toBe('P');
    expect(desc.className).toContain('text-[var(--muted-fg)]');
  });
});
