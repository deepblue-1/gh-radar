'use client';

/**
 * CardNewsStrip — 상따 카드 종목 줄 아래 뉴스·공시 한 줄 띠 (Phase 41 D-18 · D-20 · 목업 ③ `.nstrip` · gh-trade 상따 1).
 *
 * ① 무엇을 그리는가
 *   띠 = 가장 최근 공시 1건(「공시」 배지 · 시각 · 회사명을 걷은 제목) 「|」 가장 최근 뉴스 1건(「뉴스」 배지 · 시각 · 제목) ·
 *   오른쪽 끝 「N건 ▾」(출처별 상한에 닿았으면 「N건+」). 한 종류만 있으면 그 하나만 · 구분자 없음.
 *   띠를 누르면 바로 아래로 최근 3일 글 전부(`FeedRows band="lc"` · 원 제목)가 펼쳐지고 「▴」 · 다시 누르면 접힌다.
 *   ★ 상따는 「공시 뜨자마자」 판단하는 화면이라 펼친 카드에서 재료가 한 줄로 바로 보여야 한다.
 *
 * ② 상태
 *   · 공급자 밖 → 아무것도 그리지 않는다(작업대가 아닌 자리 · 기존 카드 테스트).
 *   · 공급자 안 · 그 코드 첫 응답 전 → 글자 없는 같은 높이 자리(`data-state="pending"`) — 응답이 오며 카드가 출렁이지 않게.
 *   · 글 0건(수집 전 `collectedAt: null` 포함) → 누를 수 없는 빈 줄 「최근 3일 뉴스·공시 없음」(흐린 색).
 *   · 띠에 보이는 공시 · 뉴스 id 가 새 글이면 띠 전체가 `--new-bg`. 강조 시계는 작업대 공급자의 1초 타이머 하나다
 *     (`useStockFeedIsNew`) — 이 부품이 따로 타이머를 걸지 않는다.
 *
 * ③ 받은 대로 고른다(D-14) — 받은 목록에서 첫 공시 · 첫 뉴스를 고를 뿐 거르기 · 재정렬하지 않는다.
 *   회사명 걷기(`shortDisclosureTitle`)는 띠 표시만이고, 펼친 목록은 원 제목 그대로다.
 *
 * ④ ★ 띠 클릭은 `stopPropagation` — 카드 헤더 토글 규칙 ③(헤더 안 컨트롤은 전파를 막는다)과 같은 이유.
 *   띠가 헤더 밖에 있어도 카드 바깥 어떤 클릭 핸들러로도 번지지 않게 한다.
 *
 * ⑤ ★ 반응형은 카드 폭(`@container/lc`)만 — 뷰포트 브레이크포인트를 쓰지 않는다(globals.css §2.2b · 새 경계 없음).
 *   띠는 어느 폭에서나 한 줄 말줄임이고, 펼친 줄의 자료원 위치(오른쪽 칸 ↔ 제목 아래 줄)만 `FeedRows band="lc"` 의
 *   카드 폭 685 경계가 맡는다(D-20).
 *
 * ⑥ 띠는 펼친 카드에만 보인다 — 접힌 카드 묶음은 지금처럼 한 줄(머리줄)만(Claude 재량 · UAT 확인). 결선은 `strategy-card.tsx`.
 *
 * ⑦ 구분선은 TDS hairline `--border-subtle`(행 구분선 가드 · tds-tokens.test) — 목업의 `--border` 대신.
 */
import { useId, useState, type MouseEvent } from 'react';
import type { StockFeedItem } from '@gh-radar/shared';

import { FeedKindBadge } from '@/components/stock/feed-kind-badge';
import { FeedRows } from '@/components/trading/feed/feed-rows';
import {
  useStockFeedAvailable,
  useStockFeedEntry,
  useStockFeedIsNew,
} from '@/components/trading/feed/stock-feed-context';
import { formatFeedTime } from '@/lib/format-feed-time';
import { cn } from '@/lib/utils';

export const CARD_NEWS_EMPTY_TEXT = '최근 3일 뉴스·공시 없음';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 공시 제목 앞의 회사명을 걷는다 — 「(주)가람전자 단일판매…」 → 「단일판매…」. 띠 표시 전용.
 * 이름 앞 「(주)」 · 「주식회사」 와 이름 뒤 「(주)」 까지 함께 걷고, 이름 뒤에는 공백이 있어야 한다(「가람전자우」 는 그대로).
 * 이름이 제목 맨 앞에 없으면 원 제목 그대로 · 이름의 정규식 특수문자는 문자 그대로 다룬다.
 */
export function shortDisclosureTitle(title: string, stockName: string): string {
  const name = stockName.trim();
  if (name === '') return title;
  const re = new RegExp(`^(?:\\(주\\)\\s*|주식회사\\s*)?${escapeRegExp(name)}(?:\\(주\\))?\\s+`);
  const short = title.replace(re, '');
  return short === '' ? title : short;
}

export interface CardNewsStripProps {
  code: string;
  /** 카드 표시 이름 — 공시 제목 앞 회사명을 걷는 데 쓴다. */
  stockName: string;
}

/** 띠 상자 — 띠 · 빈 줄 · 첫 응답 전 자리가 같은 높이를 쓴다(카드 출렁임 방지). */
const STRIP_BOX =
  'flex min-h-[30px] w-full min-w-0 items-center gap-1.5 border-y border-[var(--border-subtle)] px-3 py-[5px] text-[12.5px]';

function StripPart({ item, title, now }: { item: StockFeedItem; title: string; now: Date }) {
  return (
    <>
      <FeedKindBadge kind={item.kind} />
      <time dateTime={item.publishedAt} className="mono flex-none text-[11px] text-[var(--muted-fg)]">
        {formatFeedTime(item.publishedAt, item.kind, now)}
      </time>
      <span title={item.title} className="min-w-0 flex-[0_1_auto] truncate text-[var(--fg)]">
        {title}
      </span>
    </>
  );
}

export function CardNewsStrip({ code, stockName }: CardNewsStripProps) {
  const available = useStockFeedAvailable();
  const entry = useStockFeedEntry(code);
  const isNew = useStockFeedIsNew();
  const [open, setOpen] = useState(false);
  const openId = useId();

  if (!available) return null;
  if (entry === undefined) {
    return <div data-slot="card-news-strip" data-state="pending" aria-hidden="true" className={STRIP_BOX} />;
  }
  if (entry.items.length === 0) {
    return (
      <div data-slot="card-news-strip" data-state="empty" className={cn(STRIP_BOX, 'text-[var(--faint)]')}>
        {CARD_NEWS_EMPTY_TEXT}
      </div>
    );
  }

  const disc = entry.items.find((it) => it.kind === 'disclosure');
  const news = entry.items.find((it) => it.kind === 'news');
  const fresh = (disc !== undefined && isNew(disc.id)) || (news !== undefined && isNew(news.id));
  const now = new Date();
  const count = `${entry.count}건${entry.truncated ? '+' : ''} ${open ? '▴' : '▾'}`;

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        type="button"
        data-slot="card-news-strip"
        data-state={open ? 'open' : 'closed'}
        data-new={fresh ? 'true' : undefined}
        aria-expanded={open}
        aria-controls={open ? openId : undefined}
        onClick={handleClick}
        className={cn(STRIP_BOX, 'cursor-pointer text-left', fresh && 'bg-[var(--new-bg)]')}
      >
        {disc !== undefined && <StripPart item={disc} title={shortDisclosureTitle(disc.title, stockName)} now={now} />}
        {disc !== undefined && news !== undefined && (
          <span aria-hidden="true" className="flex-none text-[var(--faint)]">
            |
          </span>
        )}
        {news !== undefined && <StripPart item={news} title={news.title} now={now} />}
        <span className="ml-auto flex-none pl-1.5 text-[11.5px] whitespace-nowrap text-[var(--primary)]">{count}</span>
      </button>
      {open && (
        <div
          id={openId}
          data-slot="card-news-open"
          className="min-w-0 border-b border-[var(--border-subtle)] px-3 pt-0.5 pb-1.5"
        >
          <FeedRows items={entry.items} band="lc" />
        </div>
      )}
    </>
  );
}
