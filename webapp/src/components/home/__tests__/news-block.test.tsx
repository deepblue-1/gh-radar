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
import { describe, it, expect, vi, afterEach } from 'vitest';
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

describe('NewsBlock — Phase 41 D-19 · D-20 링크 없는 공시 줄 (목업 ④)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const DISC: HomeNewsRef = {
    title: '(주)가람전자 단일판매ㆍ공급계약체결',
    url: null,
    source: '코스닥 공시',
    kind: 'disclosure',
    publishedAt: '2026-07-02T15:15:07.000+09:00',
  };

  it('url null 공시 → <a> 없음 · 「공시」 배지 · 제목 · 「코스닥 공시 · 15:15」 · 「↗」 없음', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-07-02T16:00:00+09:00') });
    const { container } = render(<NewsBlock news={[DISC]} showLabel />);
    const row = container.querySelector('[data-slot="home-news-disclosure"]')!;
    expect(row).not.toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(row.querySelector('[data-slot="feed-kind-badge"]')).toHaveTextContent('공시');
    expect(row).toHaveTextContent('(주)가람전자 단일판매ㆍ공급계약체결');
    expect(screen.getByText('코스닥 공시 · 15:15')).toBeInTheDocument();
    expect(row).not.toHaveTextContent('↗');
  });

  it('다른 날 공시는 「자료원 · MM/DD」', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-07-03T09:00:00+09:00') });
    render(<NewsBlock news={[DISC]} showLabel />);
    expect(screen.getByText('코스닥 공시 · 07/02')).toBeInTheDocument();
  });

  it('url 있는 뉴스(kind 없음 · 옛 스냅샷) → 지금과 같은 외부 링크 · 「↗」 · 배지 없음', () => {
    const { container } = render(
      <NewsBlock news={[{ title: '옛 뉴스', url: 'https://n/old', source: '연합뉴스' }]} showLabel />,
    );
    const anchor = screen.getByText('옛 뉴스').closest('a')!;
    expect(anchor).toHaveAttribute('href', 'https://n/old');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveTextContent('↗');
    expect(container.querySelector('[data-slot="feed-kind-badge"]')).toBeNull();
    expect(container.querySelector('[data-slot="home-news-disclosure"]')).toBeNull();
  });

  it('url null 서로 다른 공시 2건 → 2줄 · 같은 자료원 · 제목 2건 → 1줄', () => {
    const other: HomeNewsRef = { ...DISC, title: '가람전자 유상증자결정' };
    const { container, unmount } = render(<NewsBlock news={[DISC, other]} showLabel max={10} />);
    expect(container.querySelectorAll('[data-slot="home-news-disclosure"]')).toHaveLength(2);
    unmount();
    const { container: c2 } = render(<NewsBlock news={[DISC, { ...DISC }]} showLabel max={10} />);
    expect(c2.querySelectorAll('[data-slot="home-news-disclosure"]')).toHaveLength(1);
  });

  it('링크 없는 한투 뉴스(kind news · url null) → 글자 줄 · 배지 없음 · 자료원 · 시각', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-07-02T16:00:00+09:00') });
    const { container } = render(
      <NewsBlock
        news={[{ title: '전자부품 업종 강세', url: null, source: '이데일리', kind: 'news', publishedAt: '2026-07-02T13:05:00.000+09:00' }]}
        showLabel
      />,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-slot="feed-kind-badge"]')).toBeNull();
    expect(screen.getByText('이데일리 · 13:05')).toBeInTheDocument();
  });
});
