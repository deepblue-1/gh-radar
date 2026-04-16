'use client';

import { Star } from 'lucide-react';

import {
  MOCK_STOCKS,
  changeColorToken,
  formatPercent,
  formatPrice,
  formatValue,
} from './_data';

function StarButton() {
  return (
    <button
      type="button"
      aria-label="관심종목 해제"
      className="flex size-9 items-center justify-center rounded-md text-[var(--primary)] transition hover:bg-[color-mix(in_oklch,var(--primary)_14%,transparent)]"
    >
      <Star className="size-4 fill-[var(--primary)] text-[var(--primary)]" aria-hidden="true" />
    </button>
  );
}

function MarketBadge({ market }: { market: 'KOSPI' | 'KOSDAQ' }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium ${
        market === 'KOSPI'
          ? 'bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[var(--primary)]'
          : 'bg-[color-mix(in_oklch,var(--destructive)_14%,transparent)] text-[var(--destructive)]'
      }`}
    >
      {market}
    </span>
  );
}

function PageHeader({ updatedAt = '14:22:07 KST' }: { updatedAt?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <div>
        <h3 className="text-lg font-semibold leading-tight">관심종목</h3>
        <p className="text-xs text-[var(--muted-fg)] leading-normal">
          저장한 종목의 시세를 1분마다 갱신합니다
        </p>
      </div>
      <span className="font-mono text-xs text-[var(--muted-fg)]">
        최근 갱신 {updatedAt}
      </span>
    </div>
  );
}

export function WatchlistBaselineUiSpec() {
  return (
    <div>
      <PageHeader />
      <div className="overflow-hidden rounded-md border border-[var(--border)]">
        <div className="grid grid-cols-[1fr_80px_60px_96px_80px_120px_36px] items-center gap-2 border-b border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-medium text-[var(--muted-fg)]">
          <span>종목명</span>
          <span>코드</span>
          <span>마켓</span>
          <span className="text-right">현재가</span>
          <span className="text-right">등락률</span>
          <span className="text-right">거래대금</span>
          <span />
        </div>
        {MOCK_STOCKS.slice(0, 5).map((s) => (
          <div
            key={s.code}
            className="grid grid-cols-[1fr_80px_60px_96px_80px_120px_36px] items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-sm last:border-0 hover:bg-[var(--muted)]/40"
          >
            <span className="truncate font-medium">{s.name}</span>
            <span className="font-mono text-xs text-[var(--muted-fg)]">{s.code}</span>
            <MarketBadge market={s.market} />
            <span className="text-right font-mono tabular-nums">{formatPrice(s.price)}</span>
            <span
              className="text-right font-mono font-semibold tabular-nums"
              style={{ color: changeColorToken(s.change) }}
            >
              {formatPercent(s.change)}
            </span>
            <span className="text-right font-mono text-xs text-[var(--muted-fg)] tabular-nums">
              {formatValue(s.value)}
            </span>
            <StarButton />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WatchlistBaselineSlim() {
  return (
    <div>
      <PageHeader />
      <div className="overflow-hidden rounded-md border border-[var(--border)]">
        <div className="grid grid-cols-[1fr_96px_80px_120px_36px] items-center gap-2 border-b border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-medium text-[var(--muted-fg)]">
          <span>종목</span>
          <span className="text-right">현재가</span>
          <span className="text-right">등락률</span>
          <span className="text-right">거래대금</span>
          <span />
        </div>
        {MOCK_STOCKS.slice(0, 5).map((s) => (
          <div
            key={s.code}
            className="grid grid-cols-[1fr_96px_80px_120px_36px] items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-sm last:border-0 hover:bg-[var(--muted)]/40"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium leading-tight">{s.name}</span>
              <span className="flex items-center gap-1.5 text-[10px]">
                <span className="font-mono text-[var(--muted-fg)]">{s.code}</span>
                <MarketBadge market={s.market} />
              </span>
            </div>
            <span className="text-right font-mono tabular-nums">{formatPrice(s.price)}</span>
            <span
              className="text-right font-mono font-semibold tabular-nums"
              style={{ color: changeColorToken(s.change) }}
            >
              {formatPercent(s.change)}
            </span>
            <span className="text-right font-mono text-xs text-[var(--muted-fg)] tabular-nums">
              {formatValue(s.value)}
            </span>
            <StarButton />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WatchlistBaselineCardGrid() {
  return (
    <div>
      <PageHeader />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MOCK_STOCKS.slice(0, 4).map((s) => (
          <div
            key={s.code}
            className="relative flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--card)] p-3 hover:border-[var(--primary)]/40"
          >
            <div className="absolute right-2 top-2">
              <StarButton />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm font-semibold">{s.name}</span>
              <MarketBadge market={s.market} />
            </div>
            <span className="font-mono text-[11px] text-[var(--muted-fg)]">{s.code}</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-base font-semibold tabular-nums">
                {formatPrice(s.price)}
              </span>
              <span
                className="font-mono text-sm font-semibold tabular-nums"
                style={{ color: changeColorToken(s.change) }}
              >
                {formatPercent(s.change)}
              </span>
            </div>
            <span className="font-mono text-[11px] text-[var(--muted-fg)] tabular-nums">
              거래대금 {formatValue(s.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
