import { homeNewsRefKey, type HomeNewsRef } from '@gh-radar/shared';

import { FeedKindBadge } from '@/components/stock/feed-kind-badge';
import { formatFeedTime } from '@/lib/format-feed-time';

/**
 * NewsBlock — 근거 뉴스 블록 (13-UI-SPEC §Component Inventory · news).
 *
 * 상단 `--border-subtle` 구분선 + (테마 카드만) "근거 뉴스" label(caption 800) +
 * 뉴스 아이템 1~2건. 링크 있는 줄 = 외부 anchor:
 *   `--flat` dot + [제목 14/400 / 출처 12 muted + ↗].
 * hover → 제목 `--primary`.
 *
 * Phase 41 D-19 · D-20 (목업 ④): 홈 AI 재료에 공시 · 한투 뉴스가 들어와 링크 없는 줄이 생긴다 —
 *   링크 없는 줄은 anchor 가 아닌 글자(`data-slot="home-news-disclosure"`) · 「↗」 없음 · 아래 줄 「자료원 · HH:MM」.
 *   공시는 제목 앞에 「공시」 배지(링크가 있어도). 중복 제거 키는 shared `homeNewsRefKey`(워커 dedupe 와 같다).
 *
 * 5원칙 #5 (출처 표기) + Claude 환각 방지: title/url/source 를 **verbatim** 표시(변형 없음).
 * T-13-11 (reverse tabnabbing): 모든 anchor 에 target="_blank" rel="noopener noreferrer".
 */
export interface NewsBlockProps {
  /** 대표 뉴스 (verbatim). `homeNewsRefKey` 기준 dedup 후 max 건 표시. */
  news: HomeNewsRef[];
  /** "근거 뉴스" label 표시 여부 (테마 카드=true, 개별 급등=false). */
  showLabel: boolean;
  /**
   * 최대 노출 건수 (dedup 후). 기본 2.
   * 테마 카드 본문 = 3, 시트 전체 목록 = Number.MAX_SAFE_INTEGER.
   */
  max?: number;
}

const DEFAULT_MAX_NEWS = 2;

/** `homeNewsRefKey` 기준 dedup — 첫 등장 유지, 순서 안정 (과거 스냅샷 방어 · 링크 없는 공시끼리 뭉치지 않음). */
function dedupeNews(news: HomeNewsRef[]): HomeNewsRef[] {
  const seen = new Set<string>();
  const out: HomeNewsRef[] = [];
  for (const item of news) {
    const key = homeNewsRefKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const DOT = (
  <span aria-hidden="true" className="mt-[8px] size-[5px] shrink-0 rounded-full bg-[var(--muted-fg)]" />
);

/** 링크 없는 줄의 아래 줄 — 「자료원 · HH:MM」(같은 KST 날이면 HH:MM, 다른 날이면 MM/DD · 공시도 분까지). */
function sourceLine(item: HomeNewsRef): string {
  if (!item.publishedAt) return item.source;
  return `${item.source} · ${formatFeedTime(item.publishedAt, 'news')}`;
}

export function NewsBlock({ news, showLabel, max = DEFAULT_MAX_NEWS }: NewsBlockProps) {
  if (!news || news.length === 0) return null;

  const items = dedupeNews(news).slice(0, max);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-[6px] border-t border-[var(--border-subtle)] pt-[var(--s-3)]">
      {showLabel && (
        <span className="text-[length:var(--t-caption)] font-extrabold tracking-[0.02em] text-[var(--muted-fg)]">
          근거 뉴스
        </span>
      )}
      {items.map((item, i) => {
        const key = `${homeNewsRefKey(item)}-${i}`;
        const badge =
          item.kind === 'disclosure' ? <FeedKindBadge kind="disclosure" className="mr-1.5 align-[1px]" /> : null;
        if (item.url) {
          return (
            <a
              key={key}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2 text-[var(--fg)] no-underline"
            >
              {DOT}
              <span className="flex min-w-0 flex-col">
                <span className="text-[length:var(--t-sm)] font-normal group-hover:text-[var(--primary)]">
                  {badge}
                  {item.title}
                </span>
                <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                  {item.source} <span className="opacity-60">↗</span>
                </span>
              </span>
            </a>
          );
        }
        return (
          <div key={key} data-slot="home-news-disclosure" className="flex items-start gap-2 text-[var(--fg)]">
            {DOT}
            <span className="flex min-w-0 flex-col">
              <span className="text-[length:var(--t-sm)] font-normal">
                {badge}
                {item.title}
              </span>
              <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">{sourceLine(item)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
