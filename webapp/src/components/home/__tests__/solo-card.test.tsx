/**
 * SoloCard 링크 테스트 — 개별 급등 카드 종목상세 이동.
 *
 * 계약:
 *   - 카드 전체가 /stocks/{code} 링크 (stretched-link 오버레이, aria-label 접근성명).
 *   - 내부 뉴스 외부 anchor 는 중첩 <a> 없이 독립 유지 (target=_blank rel=noopener).
 */
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
