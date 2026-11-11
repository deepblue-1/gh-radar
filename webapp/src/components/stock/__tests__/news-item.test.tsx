import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { StockFeedItem } from '@gh-radar/shared';

import { NewsItem } from '../news-item';
import { FeedKindBadge } from '../feed-kind-badge';

/**
 * Phase 41 D-16 · D-20 — 종목 뉴스 목록 한 줄(목업 ① A).
 * - 줄 앞 「공시」/「뉴스」 배지 · 원문 링크가 있는 줄만 새 창 링크 + 「↗」
 * - 링크가 없는 줄(공시 · 네이버에 아직 없는 한투 뉴스)은 제목이 글자 · 「↗」 없음
 * - 자료원 이름은 PC 열 · 폰 보조 줄 둘 다에 항상
 */

function item(over: Partial<StockFeedItem> = {}): StockFeedItem {
  return {
    id: 'naver:11111111-1111-4111-8111-111111111111',
    kind: 'news',
    publishedAt: '2026-11-12T15:16:00.000+09:00',
    title: '가람전자, 280억 규모 검사장비 공급계약 체결',
    source: '한국경제',
    stockCodes: [],
    url: 'https://example.invalid/n1',
    description: null,
    receivedAt: '2026-11-12T15:17:00.000+09:00',
    ...over,
  };
}

const disclosure = item({
  id: 'kis:2026111215153512345',
  kind: 'disclosure',
  publishedAt: '2026-11-12T15:15:35.000+09:00',
  title: '(주)가람전자 단일판매ㆍ공급계약체결',
  source: '코스닥 공시',
  stockCodes: ['012340'],
  url: null,
});

function renderRow(article: StockFeedItem, variant: 'card' | 'full' = 'card') {
  render(
    <ul>
      <NewsItem article={article} variant={variant} />
    </ul>,
  );
  return screen.getByTestId('news-item');
}

describe('FeedKindBadge', () => {
  it('kind 별 「공시」/「뉴스」 글자와 data-kind', () => {
    const { rerender } = render(<FeedKindBadge kind="disclosure" />);
    let badge = document.querySelector('[data-slot="feed-kind-badge"]')!;
    expect(badge).toHaveTextContent('공시');
    expect(badge).toHaveAttribute('data-kind', 'disclosure');

    rerender(<FeedKindBadge kind="news" />);
    badge = document.querySelector('[data-slot="feed-kind-badge"]')!;
    expect(badge).toHaveTextContent('뉴스');
    expect(badge).toHaveAttribute('data-kind', 'news');
  });

  it('size="mini" 는 한 글자 「공」/「뉴」 + aria-label 전체 이름', () => {
    const { rerender } = render(<FeedKindBadge kind="disclosure" size="mini" />);
    let badge = document.querySelector('[data-slot="feed-kind-badge"]')!;
    expect(badge.textContent).toBe('공');
    expect(badge).toHaveAttribute('aria-label', '공시');

    rerender(<FeedKindBadge kind="news" size="mini" />);
    badge = document.querySelector('[data-slot="feed-kind-badge"]')!;
    expect(badge.textContent).toBe('뉴');
    expect(badge).toHaveAttribute('aria-label', '뉴스');
  });
});

describe('NewsItem — 링크 있는 줄', () => {
  it('새 창 링크(noopener noreferrer) · aria-label 「제목 원문 보기 (새 창)」', () => {
    const row = renderRow(item());
    const link = within(row).getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.invalid/n1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute(
      'aria-label',
      '가람전자, 280억 규모 검사장비 공급계약 체결 원문 보기 (새 창)',
    );
    expect(row.querySelector('[data-slot="news-item-nolink"]')).toBeNull();
  });

  it('자료원 칸 · 폰 보조 줄 둘 다 「자료원 ↗」', () => {
    const row = renderRow(item());
    const src = row.querySelector('[data-slot="news-item-src"]')!;
    const sub = row.querySelector('[data-slot="news-item-src-sub"]')!;
    expect(src.textContent).toBe('한국경제 ↗');
    expect(sub.textContent).toBe('한국경제 ↗');
  });
});

describe('NewsItem — 링크 없는 줄(D-20)', () => {
  it('링크 요소 0개 · 제목은 news-item-nolink 글자', () => {
    const row = renderRow(disclosure);
    expect(within(row).queryAllByRole('link')).toHaveLength(0);
    expect(row.querySelector('a')).toBeNull();
    const nolink = row.querySelector('[data-slot="news-item-nolink"]')!;
    expect(nolink).toHaveTextContent('(주)가람전자 단일판매ㆍ공급계약체결');
  });

  it('「↗」 0개 · 자료원 이름은 자료원 칸 · 보조 줄에 그대로', () => {
    const row = renderRow(disclosure);
    expect(row.textContent).not.toContain('↗');
    expect(row.querySelector('[data-slot="news-item-src"]')!.textContent).toBe('코스닥 공시');
    expect(row.querySelector('[data-slot="news-item-src-sub"]')!.textContent).toBe('코스닥 공시');
  });

  it('네이버에 아직 없는 한투 뉴스(kind news · url null)도 링크 없는 줄 · 「뉴스」 배지', () => {
    const row = renderRow(
      item({ id: 'kis:1', title: '[특징주] 가람전자 강세', source: '△△뉴스', url: null }),
      'full',
    );
    expect(row.querySelector('a')).toBeNull();
    expect(row.querySelector('[data-slot="feed-kind-badge"]')).toHaveAttribute('data-kind', 'news');
    expect(row.querySelector('[data-slot="news-item-src-sub"]')!.textContent).toBe('△△뉴스');
  });
});

describe('NewsItem — 배지 · 제목 텍스트', () => {
  it('배지가 제목 앞에 온다(공시 줄은 「공시」)', () => {
    const row = renderRow(disclosure);
    const title = row.querySelector('[data-slot="news-item-nolink"]')!;
    const badge = title.querySelector('[data-slot="feed-kind-badge"]')!;
    expect(badge).toHaveTextContent('공시');
    expect(title.firstElementChild).toBe(badge);
  });

  it('링크 줄도 배지가 링크 안 제목 앞에 온다(뉴스 줄은 「뉴스」)', () => {
    const row = renderRow(item());
    const link = within(row).getByRole('link');
    const badge = link.querySelector('[data-slot="feed-kind-badge"]')!;
    expect(badge).toHaveTextContent('뉴스');
    expect(link.firstElementChild).toBe(badge);
  });

  it('제목은 HTML 로 해석하지 않고 글자 그대로 넣는다', () => {
    const row = renderRow(item({ title: '<b>굵게</b> & 기사', url: null }));
    const nolink = row.querySelector('[data-slot="news-item-nolink"]')!;
    expect(nolink.querySelector('b')).toBeNull();
    expect(nolink.textContent).toContain('<b>굵게</b> & 기사');
  });

  it('time 은 publishedAt 을 dateTime 으로 싣는다', () => {
    const row = renderRow(disclosure);
    expect(row.querySelector('time')).toHaveAttribute('dateTime', disclosure.publishedAt);
  });
});
