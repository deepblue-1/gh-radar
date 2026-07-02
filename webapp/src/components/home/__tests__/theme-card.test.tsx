/**
 * ThemeCard interaction tests (Phase 13 후속 — 소속 종목 전체 보기 A+B+C).
 *
 * 계약:
 *   A (인라인 확장) — "+N개 종목 더" 버튼 aria-expanded 토글, 나머지 종목 펼침/접기.
 *   B (바텀시트)   — 헤더 테마명 button(aria-haspopup=dialog) 클릭 → 시트 오픈, 전체 종목.
 *   C (종목 → 상세) — 모든 종목 행이 /stocks/{code} 링크.
 *
 * Sheet(Radix Dialog)는 document.body 로 portal → screen 루트 조회.
 */
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { HomeSurgeTheme } from '@gh-radar/shared';

import { ThemeCard } from '../theme-card';

/** top 4 초과(17종목) 테마 — overflow/시트 시나리오. change% 랜덤 순서. */
function makeTheme(): HomeSurgeTheme {
  const stocks = Array.from({ length: 17 }, (_, i) => ({
    code: String(100000 + i).padStart(6, '0'),
    name: `종목${i}`,
    changeRate: 20 + i * 0.5,
  }));
  return {
    name: '2차전지',
    reason: '전기차 수요 회복 기대',
    stocks,
    news: [
      { title: '2차전지 급등 뉴스', url: 'https://example.com/a', source: '연합뉴스' },
    ],
  };
}

/** 근거 뉴스 6건(중복 URL 1건 포함, unique 5) 테마 — 카드 max=4 / 시트 전체 목록 시나리오. */
function makeNewsyTheme(): HomeSurgeTheme {
  return {
    name: '초전도체',
    reason: '상온 초전도 실증 기대',
    stocks: [
      { code: '000001', name: '알파', changeRate: 29.9 },
      { code: '000002', name: '베타', changeRate: 25.1 },
    ],
    news: [
      { title: '뉴스1', url: 'https://n/1', source: '연합뉴스' },
      { title: '뉴스2', url: 'https://n/2', source: '한국경제' },
      { title: '뉴스3', url: 'https://n/3', source: '매일경제' },
      { title: '뉴스1-중복', url: 'https://n/1', source: '연합뉴스' }, // dup URL
      { title: '뉴스4', url: 'https://n/4', source: '서울경제' },
      { title: '뉴스5', url: 'https://n/5', source: '이데일리' },
    ],
  };
}

describe('ThemeCard — 소속 종목 전체 보기', () => {
  it('top 4 종목만 노출하고 나머지는 "+N개 종목 더" 로 숨긴다 (A 초기 상태)', () => {
    render(<ThemeCard theme={makeTheme()} />);

    // 17종목 중 top 4 = 인라인 4개 링크. + 헤더 없음 → 카드 내 링크 4.
    // change% desc 이므로 가장 높은 4개(종목16,15,14,13)가 노출.
    expect(screen.getByText('종목16')).toBeInTheDocument();
    expect(screen.getByText('종목13')).toBeInTheDocument();
    expect(screen.queryByText('종목12')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: '+13개 종목 더' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('A: "+N개 종목 더" 클릭 시 나머지 펼치고 aria-expanded=true, 재클릭 시 접힌다', () => {
    render(<ThemeCard theme={makeTheme()} />);

    const toggle = screen.getByRole('button', { name: '+13개 종목 더' });
    fireEvent.click(toggle);

    expect(screen.getByText('종목12')).toBeInTheDocument();
    expect(screen.getByText('종목0')).toBeInTheDocument();
    const expanded = screen.getByRole('button', { name: '접기' });
    expect(expanded).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(expanded);
    expect(screen.queryByText('종목12')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '+13개 종목 더' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('C: 노출된 모든 종목 행이 /stocks/{code} 링크다', () => {
    render(<ThemeCard theme={makeTheme()} />);

    const link = screen.getByText('종목16').closest('a');
    expect(link).toHaveAttribute('href', '/stocks/100016');
  });

  it('B: 헤더 테마명은 aria-haspopup=dialog 버튼이고 클릭 시 전체 종목 시트가 열린다', () => {
    render(<ThemeCard theme={makeTheme()} />);

    const trigger = screen.getByRole('button', { name: /2차전지/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');

    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog');
    // 시트 내부에서 top4 밖 종목(종목0)도 보인다 → 전체 노출.
    expect(within(dialog).getByText('종목0')).toBeInTheDocument();
    // 시트 내 종목 행도 /stocks 링크.
    expect(within(dialog).getByText('종목0').closest('a')).toHaveAttribute(
      'href',
      '/stocks/100000',
    );
  });

  it('카드 본문 근거 뉴스는 dedup 후 최대 4건 + "전체 보기" 버튼을 노출한다', () => {
    render(<ThemeCard theme={makeNewsyTheme()} />);

    // 카드 본문(시트 밖)에서 뉴스1~4 노출, 5번째(뉴스5)는 max=4 로 미노출.
    expect(screen.getByText('뉴스1')).toBeInTheDocument();
    expect(screen.getByText('뉴스4')).toBeInTheDocument();
    expect(screen.queryByText('뉴스5')).not.toBeInTheDocument();
    // 중복 URL 방어 dedup → "뉴스1-중복" 은 나타나지 않는다.
    expect(screen.queryByText('뉴스1-중복')).not.toBeInTheDocument();

    // unique 5 > 4 → "뉴스 5건 전체 보기" 버튼(시트 오픈 트리거) 노출.
    const more = screen.getByRole('button', { name: '뉴스 5건 전체 보기' });
    expect(more).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(more);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('뉴스5')).toBeInTheDocument();
  });

  it('B: 시트에는 근거 뉴스 전체 목록(2건 초과·dedup 후 5건)을 노출한다', () => {
    render(<ThemeCard theme={makeNewsyTheme()} />);

    const trigger = screen.getByRole('button', { name: /초전도체/ });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');

    // dedup(중복 URL 1건 제거) 후 5건 unique → 시트에 모두 노출(2건 초과).
    expect(within(dialog).getByText('뉴스1')).toBeInTheDocument();
    expect(within(dialog).getByText('뉴스2')).toBeInTheDocument();
    expect(within(dialog).getByText('뉴스3')).toBeInTheDocument();
    expect(within(dialog).getByText('뉴스4')).toBeInTheDocument();
    // 중복 URL 은 시트에서도 dedup.
    expect(within(dialog).queryByText('뉴스1-중복')).not.toBeInTheDocument();
    // 외부 anchor 는 target=_blank rel=noopener (T-13-11).
    const anchor = within(dialog).getByText('뉴스4').closest('a')!;
    expect(anchor).toHaveAttribute('href', 'https://n/4');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('overflow 없는 테마(≤4종목)는 토글 버튼을 렌더하지 않는다', () => {
    const small: HomeSurgeTheme = {
      name: '소형테마',
      reason: null,
      stocks: [
        { code: '000001', name: 'A', changeRate: 25 },
        { code: '000002', name: 'B', changeRate: 22 },
      ],
      news: [],
    };
    render(<ThemeCard theme={small} />);
    expect(screen.queryByText(/종목 더/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '접기' })).not.toBeInTheDocument();
  });
});
