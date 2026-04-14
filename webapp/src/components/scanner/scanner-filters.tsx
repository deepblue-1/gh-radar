'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import type { Market, ScannerState } from '@/lib/scanner-query';
import {
  SCANNER_MAX_RATE,
  SCANNER_MIN_RATE,
} from '@/lib/scanner-query';
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

const SLIDER_DEBOUNCE_MS = 250;

/**
 * Scanner 필터 바 (UI-SPEC §Wireframes §1).
 * - chip bar + popover(Slider 10~29% · ToggleGroup KOSPI/KOSDAQ/ALL)
 * - Slider: 로컬 state 로 즉시 chip 갱신, 250ms debounce 후 onChange (Pitfall 2)
 * - 타임스탬프 `최근 갱신 HH:MM:SS KST` (SCAN-06)
 * - 새로고침 버튼: isRefreshing 시 disabled + RefreshCw spin (T-5-03 연타 방지)
 * - URL 동기화는 부모(ScannerClient) 가 담당
 */
export function ScannerFilters({
  state,
  onChange,
  lastUpdatedAt,
  onRefresh,
  isRefreshing,
}: ScannerFiltersProps) {
  const [localMin, setLocalMin] = useState(state.min);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 외부 state.min 변화(URL replace) 가 로컬보다 우선 — sync
  useEffect(() => {
    setLocalMin(state.min);
  }, [state.min]);

  const handleSliderChange = useCallback(
    (values: number[]) => {
      const next = values[0] ?? state.min;
      setLocalMin(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (next !== state.min) {
          onChange({ ...state, min: next });
        }
      }, SLIDER_DEBOUNCE_MS);
    },
    [state, onChange],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

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
      {/* 등락률 chip */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="mono h-8 px-3 text-sm font-semibold flex-1 sm:flex-none justify-between sm:justify-center"
            aria-label={`최소 등락률 ${localMin}% 조정`}
          >
            등락률 ≥ {localMin}%
            <ChevronDown aria-hidden="true" className="size-4 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="scanner-min-rate"
                className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]"
              >
                최소 등락률
              </label>
              <span className="mono text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
                {localMin}%
              </span>
            </div>
            <Slider
              id="scanner-min-rate"
              min={SCANNER_MIN_RATE}
              max={SCANNER_MAX_RATE}
              step={1}
              value={[localMin]}
              onValueChange={handleSliderChange}
              aria-label="최소 등락률"
            />
            <div className="flex justify-between text-[length:var(--t-caption)] text-[var(--muted-fg)] mono">
              <span>{SCANNER_MIN_RATE}%</span>
              <span>{SCANNER_MAX_RATE}%</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>

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
