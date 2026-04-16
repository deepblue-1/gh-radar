import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { Number as NumberDisplay } from '@/components/ui/number';
import { cn } from '@/lib/utils';
import type { StockWithProximity } from '@/lib/scanner-api';

import { Sparkline, type SparklineDirection } from './sparkline';

/**
 * InfoStockCard — Phase 06.2 Plan 05 Task 2.
 *
 * Scanner / Watchlist 공용 인포그래픽 카드 (`<lg` 모바일/태블릿 전용).
 * UI-SPEC §4.3 레이아웃 계약:
 * - 좌측 9×9 코드 배지 → 중앙 종목명 + `{market} · {code}` → Sparkline →
 *   우측 가격 블록(현재가 + 방향 화살표 + 등락률) → ⭐ 토글 slot (옵션)
 *
 * ⭐ 토글 실제 wire-up 은 Plan 07 에서 주입 — 이 plan 에서는 slot 만 확보해
 * Scanner/Watchlist 가 동일한 컴포넌트를 공유하도록 유지한다.
 *
 * 접근성:
 * - 카드 전체 tap target 은 `<Link aria-label="{name} 상세 보기">` 로 감싸
 *   screen reader 가 "삼성전자 상세 보기" 링크로 읽는다.
 * - 가격/등락률 텍스트에 포함된 방향 화살표 아이콘은 `aria-hidden="true"` —
 *   의미는 sign(+/-) 및 수치로 전달된다.
 * - Sparkline 은 장식 요소 (sparkline.tsx 에서 aria-hidden 처리).
 */

export interface InfoStockCardProps {
  stock: StockWithProximity;
  /**
   * ⭐ 토글 slot 노출 여부. Plan 07 에서 `true` + `watchlistToggleSlot` 함께 전달.
   * Plan 05 단독 렌더 시에는 기본값(`false`) — 슬롯을 생략하여 레이아웃 가드레일 유지.
   */
  showWatchlistToggle?: boolean;
  /** Plan 07 에서 `<WatchlistToggle />` 노드를 전달한다. */
  watchlistToggleSlot?: ReactNode;
}

function directionOf(changeRate: number): SparklineDirection {
  if (changeRate > 0) return 'up';
  if (changeRate < 0) return 'down';
  return 'flat';
}

export function InfoStockCard({
  stock,
  showWatchlistToggle = false,
  watchlistToggleSlot,
}: InfoStockCardProps) {
  const direction = directionOf(stock.changeRate);
  const colorClass =
    direction === 'up'
      ? 'text-[var(--up)]'
      : direction === 'down'
        ? 'text-[var(--down)]'
        : 'text-[var(--flat)]';
  const sign = stock.changeRate > 0 ? '+' : '';
  const DirectionIcon =
    direction === 'up'
      ? ArrowUpRight
      : direction === 'down'
        ? ArrowDownRight
        : Minus;
  const codePrefix = stock.code.slice(0, 3);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:border-[var(--primary)]/40">
      <Link
        href={`/stocks/${stock.code}`}
        aria-label={`${stock.name} 상세 보기`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {/* 좌측 코드 prefix 배지 */}
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--muted)] font-mono text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]"
        >
          {codePrefix}
        </span>

        {/* 중앙 종목명 + 2줄째 market · code */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
            {stock.name}
          </div>
          <div className="mono truncate text-[length:var(--t-caption)] uppercase text-[var(--muted-fg)]">
            {stock.market} · {stock.code}
          </div>
        </div>

        {/* Sparkline — 등락 방향 시각화 */}
        <Sparkline direction={direction} />

        {/* 우측 가격 블록 */}
        <div className="w-24 shrink-0 text-right">
          <div className="mono text-[length:var(--t-sm)] font-semibold tabular-nums text-[var(--fg)]">
            <NumberDisplay value={stock.price} format="price" />
          </div>
          <div
            className={cn(
              'mono inline-flex items-center justify-end gap-0.5 text-[11px] font-semibold tabular-nums',
              colorClass,
            )}
          >
            <DirectionIcon className="size-3" aria-hidden="true" />
            {sign}
            {stock.changeRate.toFixed(2)}%
          </div>
        </div>
      </Link>

      {/* ⭐ 토글 slot — Plan 07 에서 WatchlistToggle 주입 */}
      {showWatchlistToggle && (
        <div
          data-slot="watchlist-toggle"
          className="flex size-9 shrink-0 items-center justify-center"
        >
          {watchlistToggleSlot ?? (
            /* 자리 예약 — Plan 07 wiring 전 placeholder */
            <span aria-hidden="true" className="block size-9" />
          )}
        </div>
      )}
    </div>
  );
}
