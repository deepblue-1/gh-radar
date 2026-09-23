/**
 * SoloCard 링크 테스트 — 개별 급등 카드 종목상세 이동.
 *
 * 계약:
 *   - 카드 전체가 /stocks/{code} 링크 (stretched-link 오버레이, aria-label 접근성명).
 *   - 내부 뉴스 외부 anchor 는 중첩 <a> 없이 독립 유지 (target=_blank rel=noopener).
 *   - 헤더 등락% 오른쪽 '{종목명} 급등이유 복사' 아이콘 버튼 (quick-260923-cre):
 *     '{종목명} {+x.x%}' + reason(있을 때만) 을 복사. reason 없어도 버튼은 있다.
 *     버튼은 오버레이 Link 의 형제(자손 아님) + wrapper z-20 → 클릭해도 상세로 이동하지 않는다.
 */
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { HomeSurgeSingle } from '@gh-radar/shared';

import { SoloCard } from '../solo-card';

function makeSingle(): HomeSurgeSingle {
  return {
    code: '005930',
    name: '삼성전자',
    changeRate: 21.3,
    reason: '반도체 업황 회복 기대',
    news: [
      { title: '삼성전자 급등 뉴스', url: 'https://example.com/a', source: '연합뉴스' },
    ],
  };
}

describe('SoloCard — 종목상세 링크', () => {
  it('카드가 /stocks/{code} 링크이고 aria-label 로 종목명을 노출한다', () => {
    render(<SoloCard single={makeSingle()} />);

    const link = screen.getByRole('link', { name: '삼성전자 종목 상세 보기' });
    expect(link).toHaveAttribute('href', '/stocks/005930');
  });

  it('article 에 isolate 로 내부 z-index 를 격리한다 (헤더 z-10 위로 누수 방지)', () => {
    render(<SoloCard single={makeSingle()} />);

    const article = screen
      .getByRole('link', { name: '삼성전자 종목 상세 보기' })
      .closest('article');
    expect(article?.className).toContain('isolate');
  });

  it('내부 뉴스 anchor 는 외부 링크로 독립 유지된다 (중첩 <a> 아님)', () => {
    render(<SoloCard single={makeSingle()} />);

    const news = screen.getByText('삼성전자 급등 뉴스').closest('a')!;
    expect(news).toHaveAttribute('href', 'https://example.com/a');
    expect(news).toHaveAttribute('target', '_blank');
    expect(news).toHaveAttribute('rel', 'noopener noreferrer');
    // 뉴스 anchor 는 종목상세 링크와 다른 별개 anchor.
    expect(news).not.toHaveAttribute('href', '/stocks/005930');
  });
});

describe('SoloCard — 급등이유 복사 (quick-260923-cre)', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    vi.restoreAllMocks();
  });

  it("'{종목명} {+x.x%}' + reason 한 줄을 복사하고 '복사됨' 을 띄운다", async () => {
    render(<SoloCard single={makeSingle()} />);

    fireEvent.click(screen.getByRole('button', { name: '삼성전자 급등이유 복사' }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('삼성전자 +21.3%\n반도체 업황 회복 기대');
    expect(await screen.findByText('복사됨')).toBeInTheDocument();
  });

  it('reason 이 없어도 버튼이 있고 한 줄만 복사한다 (D-05)', () => {
    render(<SoloCard single={{ ...makeSingle(), reason: null }} />);

    fireEvent.click(screen.getByRole('button', { name: '삼성전자 급등이유 복사' }));

    expect(writeText).toHaveBeenCalledWith('삼성전자 +21.3%');
  });

  it('버튼은 오버레이 링크의 자손이 아니고 z-20 으로 위에 있다 — 클릭해도 이동 없음 (D-06)', () => {
    render(<SoloCard single={makeSingle()} />);

    const link = screen.getByRole('link', { name: '삼성전자 종목 상세 보기' });
    const button = screen.getByRole('button', { name: '삼성전자 급등이유 복사' });

    expect(link).not.toContainElement(button);
    expect(button.parentElement?.className).toContain('z-20');
    expect(link.closest('article')).toContainElement(button);

    const before = window.location.href;
    fireEvent.click(button);
    expect(window.location.href).toBe(before);
  });
});
