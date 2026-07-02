/**
 * NewsBlock tests (Phase 13 후속 — 근거 뉴스 더 많이 + 전체 목록).
 *
 * 계약:
 *   - max prop 미지정 시 기본 2건.
 *   - max 로 slice (테마 카드 3 / 시트 무제한).
 *   - URL 기준 dedup (과거 스냅샷 방어 — 중복 URL 은 첫 등장만).
 *   - 외부 anchor 는 target=_blank rel=noopener (T-13-11), 출처 verbatim (5원칙 #5).
 */
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { HomeNewsRef } from '@gh-radar/shared';

import { NewsBlock } from '../news-block';

const NEWS: HomeNewsRef[] = [
  { title: '뉴스1', url: 'https://n/1', source: '연합뉴스' },
  { title: '뉴스2', url: 'https://n/2', source: '한국경제' },
  { title: '뉴스1-중복', url: 'https://n/1', source: '연합뉴스' }, // dup URL
  { title: '뉴스3', url: 'https://n/3', source: '매일경제' },
  { title: '뉴스4', url: 'https://n/4', source: '서울경제' },
];

describe('NewsBlock', () => {
  it('max 미지정 시 dedup 후 기본 2건만 노출', () => {
    render(<NewsBlock news={NEWS} showLabel />);
    // dedup 순서: 뉴스1, 뉴스2, 뉴스3, 뉴스4 → 상위 2건.
    expect(screen.getByText('뉴스1')).toBeInTheDocument();
    expect(screen.getByText('뉴스2')).toBeInTheDocument();
    expect(screen.queryByText('뉴스3')).not.toBeInTheDocument();
    expect(screen.queryByText('뉴스1-중복')).not.toBeInTheDocument();
  });

  it('max=3 이면 dedup 후 3건', () => {
    render(<NewsBlock news={NEWS} showLabel max={3} />);
    expect(screen.getByText('뉴스3')).toBeInTheDocument();
    expect(screen.queryByText('뉴스4')).not.toBeInTheDocument();
  });

  it('max 무제한(전체 목록)이면 dedup 후 모든 unique 노출', () => {
    render(<NewsBlock news={NEWS} showLabel max={Number.MAX_SAFE_INTEGER} />);
    expect(screen.getByText('뉴스1')).toBeInTheDocument();
    expect(screen.getByText('뉴스2')).toBeInTheDocument();
    expect(screen.getByText('뉴스3')).toBeInTheDocument();
    expect(screen.getByText('뉴스4')).toBeInTheDocument();
    // 중복 URL 은 여전히 dedup.
    expect(screen.queryByText('뉴스1-중복')).not.toBeInTheDocument();
  });

  it('빈 news → null 렌더', () => {
    const { container } = render(<NewsBlock news={[]} showLabel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('외부 anchor 는 target=_blank rel=noopener + href verbatim (T-13-11·5원칙#5)', () => {
    render(<NewsBlock news={NEWS} showLabel max={1} />);
    const anchor = screen.getByText('뉴스1').closest('a')!;
    expect(anchor).toHaveAttribute('href', 'https://n/1');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
