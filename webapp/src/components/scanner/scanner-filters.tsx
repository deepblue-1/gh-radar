'use client';

import { useCallback } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import type { Market, ScannerState } from '@/lib/scanner-query';
import { formatKstTime } from '@/lib/scanner-time';
import { cn } from '@/lib/utils';

export interface ScannerFiltersProps {
  state: ScannerState;
  onChange: (next: ScannerState) => void;
  lastUpdatedAt?: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const MARKET_LABELS: Record<Market, string> = {
  ALL: '전체',
  KOSPI: 'KOSPI',
  KOSDAQ: 'KOSDAQ',
};

/**
 * Scanner 필터 바.
 * - 마켓 chip (KOSPI/KOSDAQ/ALL) + 타임스탬프 + 새로고침
 * - 등락률 필터는 제거됨 — top_movers 전체 종목이 그대로 노출된다
 * - URL 동기화는 부모(ScannerClient) 가 담당
 */
export function ScannerFilters({
  state,
  onChange,
  lastUpdatedAt,
  onRefresh,
  isRefreshing,
}: ScannerFiltersProps) {
  const handleMarketChange = useCallback(
    (value: string) => {
      // ToggleGroup type=single 은 같은 값 재클릭 시 빈 문자열 반환 — 무시
      if (!value) return;
      if (value !== state.market) {
        onChange({ ...state, market: value as Market });
      }
    },
    [state, onChange],
  );

  const refreshButton = (
    <Button
      type="button"
      variant="ghost"
      onClick={onRefresh}
      disabled={isRefreshing}
      aria-label="스캐너 데이터 새로고침"
      title="새로고침"
      className="size-8 shrink-0 p-0"
    >
      <RefreshCw
        aria-hidden="true"
        className={cn('size-4', isRefreshing && 'animate-spin')}
      />
    </Button>
  );

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
      <div className="flex items-center gap-2">
      {/* 마켓 chip */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-8 px-3 text-sm font-semibold flex-1 sm:flex-none justify-between sm:justify-center"
            aria-label={`마켓 ${MARKET_LABELS[state.market]} 변경`}
          >
            마켓: {MARKET_LABELS[state.market]}
            <ChevronDown aria-hidden="true" className="size-4 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60" align="start">
          <div className="flex flex-col gap-2">
            <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
              마켓
            </p>
            <ToggleGroup
              type="single"
              value={state.market}
              onValueChange={handleMarketChange}
              variant="outline"
              spacing={0}
              aria-label="마켓 선택"
            >
              <ToggleGroupItem value="ALL">전체</ToggleGroupItem>
              <ToggleGroupItem value="KOSPI">KOSPI</ToggleGroupItem>
              <ToggleGroupItem value="KOSDAQ">KOSDAQ</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </PopoverContent>
      </Popover>

      </div>

      <div className="flex items-center justify-end gap-2 sm:ml-auto sm:justify-start">
        {lastUpdatedAt !== undefined && (
          <span className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            {formatKstTime(lastUpdatedAt)}
          </span>
        )}
        {refreshButton}
      </div>
    </div>
  );
}
