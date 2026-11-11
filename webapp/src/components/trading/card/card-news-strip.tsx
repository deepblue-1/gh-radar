'use client';

/** RED 스텁 — 41-07 T1 GREEN 에서 실제 구현으로 바뀐다. */

export const CARD_NEWS_EMPTY_TEXT = '최근 3일 뉴스·공시 없음';

export function shortDisclosureTitle(title: string, _stockName: string): string {
  return title;
}

export interface CardNewsStripProps {
  code: string;
  stockName: string;
}

export function CardNewsStrip(_props: CardNewsStripProps) {
  return null;
}
