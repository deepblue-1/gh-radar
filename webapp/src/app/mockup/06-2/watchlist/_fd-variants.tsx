'use client';

import { ArrowDownRight, ArrowUpRight, Pin, Star } from 'lucide-react';

import {
  MOCK_STOCKS,
  changeColorToken,
  formatPercent,
  formatPrice,
  formatValue,
} from './_data';

function Sparkline({ change }: { change: number }) {
  const up = change > 0;
  const down = change < 0;
  const color = up ? 'var(--up)' : down ? 'var(--down)' : 'var(--flat)';
  const path = up
    ? 'M0 20 L10 16 L20 18 L30 12 L40 8 L50 10 L60 4'
    : down
    ? 'M0 4 L10 8 L20 6 L30 12 L40 16 L50 14 L60 20'
    : 'M0 12 L10 11 L20 13 L30 12 L40 12 L50 13 L60 12';
  return (
    <svg viewBox="0 0 60 24" width={60} height={24} aria-hidden="true">
      <path d={path} stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function WatchlistFdInfographic() {
  const updated = '14:22:07';
  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div className="flex items-baseline gap-3">
          <h3 className="text-xl font-semibold tracking-tight">관심종목</h3>
          <span className="font-mono text-[11px] text-[var(--muted-fg)]">
            {MOCK_STOCKS.length}/50
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--up)] opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-[var(--up)]" />
          </span>
          <span className="font-mono text-[11px] text-[var(--muted-fg)]">LIVE · {updated}</span>
        </div>
      </div>
      <div className="space-y-2">
        {MOCK_STOCKS.slice(0, 5).map((s) => (
          <div
            key={s.code}
            className="group flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 hover:border-[var(--primary)]/40"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--muted)] font-mono text-[11px] font-semibold">
                {s.code.slice(0, 3)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <p className="font-mono text-[10px] uppercase text-[var(--muted-fg)]">
                  {s.market} · {s.code}
                </p>
              </div>
            </div>
            <Sparkline change={s.change} />
            <div className="w-24 text-right">
              <p className="font-mono text-sm font-semibold tabular-nums">
                {formatPrice(s.price)}
              </p>
              <p
                className="flex items-center justify-end gap-0.5 font-mono text-[11px] font-semibold tabular-nums"
                style={{ color: changeColorToken(s.change) }}
              >
                {s.change > 0 ? (
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                ) : s.change < 0 ? (
                  <ArrowDownRight className="size-3" aria-hidden="true" />
                ) : null}
                {formatPercent(s.change)}
              </p>
            </div>
            <button
              type="button"
              aria-label="관심종목 해제"
              className="rounded-md p-1.5 text-[var(--primary)] transition hover:bg-[color-mix(in_oklch,var(--primary)_14%,transparent)]"
            >
              <Star className="size-4 fill-[var(--primary)]" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WatchlistFdEditorial() {
  return (
    <div>
      <div className="mb-5 border-b border-[var(--fg)] pb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted-fg)]">
          Personal Radar
        </p>
        <div className="flex items-baseline justify-between">
          <h3 className="text-2xl font-semibold tracking-tight">관심종목</h3>
          <span className="font-mono text-xs text-[var(--muted-fg)]">14:22:07 KST</span>
        </div>
      </div>
      <ol className="flex flex-col">
        {MOCK_STOCKS.slice(0, 5).map((s, idx) => (
          <li
            key={s.code}
            className="grid grid-cols-[28px_1fr_auto] items-baseline gap-3 border-b border-[var(--border)] py-3 last:border-0"
          >
            <span className="font-mono text-xs text-[var(--muted-fg)]">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold leading-tight">{s.name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-[var(--muted-fg)]">
                {s.market} · {s.code} · 거래대금 {formatValue(s.value)}
              </p>
            </div>
            <div className="flex items-baseline gap-3 text-right">
              <span className="font-mono text-sm tabular-nums">{formatPrice(s.price)}</span>
              <span
                className="w-16 text-right font-mono text-sm font-semibold tabular-nums"
                style={{ color: changeColorToken(s.change) }}
              >
                {formatPercent(s.change)}
              </span>
              <button
                type="button"
                aria-label="해제"
                className="text-[var(--primary)] transition hover:opacity-70"
              >
                <Star className="size-4 fill-[var(--primary)]" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function WatchlistFdDenseTerminal() {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[color-mix(in_oklch,var(--fg)_8%,var(--bg))] p-3 font-mono">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--muted-fg)]">
        <span>watchlist $ stream --interval 60s</span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-[var(--up)]" />
          OPEN 14:22:07
        </span>
      </div>
      <div className="grid grid-cols-[18px_1fr_56px_60px_64px_56px_24px] items-center gap-1.5 border-b border-[var(--border)] py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-fg)]">
        <span>
          <Pin className="size-3" aria-hidden="true" />
        </span>
        <span>sym</span>
        <span className="text-right">px</span>
        <span className="text-right">chg</span>
        <span className="text-right">val</span>
        <span className="text-right">code</span>
        <span />
      </div>
      {MOCK_STOCKS.slice(0, 6).map((s) => (
        <div
          key={s.code}
          className="grid grid-cols-[18px_1fr_56px_60px_64px_56px_24px] items-center gap-1.5 border-b border-[var(--border)]/50 py-1 text-xs last:border-0 hover:bg-[var(--muted)]/30"
        >
          <Star className="size-3 fill-[var(--primary)] text-[var(--primary)]" aria-hidden="true" />
          <span className="truncate text-[13px]">{s.name}</span>
          <span className="text-right tabular-nums">{formatPrice(s.price)}</span>
          <span
            className="text-right font-semibold tabular-nums"
            style={{ color: changeColorToken(s.change) }}
          >
            {formatPercent(s.change)}
          </span>
          <span className="text-right text-[var(--muted-fg)] tabular-nums">{formatValue(s.value)}</span>
          <span className="text-right text-[10px] text-[var(--muted-fg)]">{s.code}</span>
          <button
            type="button"
            aria-label="해제"
            className="text-[var(--muted-fg)] transition hover:text-[var(--destructive)]"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
