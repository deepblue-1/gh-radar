'use client';

import { useEffect, useRef, useState } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { SearchIcon } from 'lucide-react';

import type { StockDetailResponse, TickExchange } from '@gh-radar/shared';

import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { cn } from '@/lib/utils';

/**
 * 틱 전문 뷰어 머리 종목 검색 (Phase 37 D-16 · 진입 목업 A `.srch` + `.sug`).
 *
 * - 전역 검색과 같은 원천(`useDebouncedSearch` 300ms · `GET /api/stocks/search` 응답 = `StockDetailResponse` — isin 포함)을
 *   쓰되, 다이얼로그가 아니라 머리 안 입력 + 아래 제안 목록이다(GlobalSearch 는 prop 이 없어 새 컴포넌트).
 * - 제안 행마다 그 날짜의 준비 상태 칩: 오늘이면 「오늘 · 라이브」 · 그날 그 거래소 격자가 있으면 「격자 있음」 ·
 *   아니면 「변환 필요 · 약 N분」(N = ceil(eta_s[ex] / 60) · 최소 1).
 * - isin 이 없는 종목(ETP 등 — KRX 표준코드 없음)은 흐리고 고를 수 없다(틱 원본 키가 isin 이다).
 * - 늦은 응답(WR-05): `resultsQuery` 가 지금 입력과 다르면 이전 결과를 보이지 않는다.
 * - 「/」 키 = 입력 포커스(입력 칸 밖에서). 표시는 데스크톱만.
 */

export interface TickStockPickerProps {
  date: string | null;
  ex: TickExchange;
  /** 그 날짜 · 그 거래소에 격자가 있는 isin. */
  gridIsins: ReadonlySet<string>;
  isToday: boolean;
  etaS: { KRX: number; NXT: number };
  onSelect: (stock: { isin: string; code: string; name: string }) => void;
}

const TAG = 'ml-auto inline-flex h-[18px] flex-none items-center rounded-[5px] px-1.5 text-[10.5px] font-bold whitespace-nowrap';

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

export function TickStockPicker({ ex, gridIsins, isToday, etaS, onSelect }: TickStockPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, loading, error, resultsQuery } = useDebouncedSearch(query, 300);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const trimmed = query.trim();
  const fresh = resultsQuery === trimmed;
  const shown = fresh ? results : [];
  const etaMin = Math.max(1, Math.ceil(etaS[ex] / 60));

  const select = (s: { isin: string; code: string; name: string }) => {
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
    onSelect(s);
  };

  return (
    <CommandPrimitive
      shouldFilter={false}
      label="종목 검색"
      className="relative w-full sm:w-auto sm:min-w-[280px]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
          inputRef.current?.blur();
        }
      }}
    >
      <div className="flex h-9 items-center gap-2 rounded-[12px] bg-[var(--card)] px-3">
        <SearchIcon aria-hidden="true" className="size-[15px] flex-none text-[var(--muted-fg)]" />
        <CommandPrimitive.Input
          ref={inputRef}
          value={query}
          onValueChange={(v) => {
            setQuery(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder="종목명 · 코드"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--fg)] outline-none placeholder:text-[var(--faint)]"
        />
        <kbd className="hidden rounded-[5px] border border-[var(--border-subtle)] px-[5px] py-px text-[10px] text-[var(--faint)] sm:inline">
          /
        </kbd>
      </div>
      {open && trimmed.length > 0 && (
        <CommandPrimitive.List
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-10 right-0 left-0 z-20 max-h-[320px] overflow-auto rounded-[12px] bg-[var(--card)] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,.25),0_0_0_1px_var(--border-subtle)]"
        >
          {!fresh && loading && <p className="m-0 px-2.5 py-2 text-[12px] text-[var(--muted-fg)]">검색 중…</p>}
          {fresh && error && (
            <p className="m-0 px-2.5 py-2 text-[12px] text-[var(--destructive)]">검색에 실패했어요. 잠시 후 다시 시도해 주세요.</p>
          )}
          {fresh && !error && shown.length === 0 && (
            <CommandPrimitive.Empty className="px-2.5 py-2 text-[12px] text-[var(--muted-fg)]">
              「{trimmed}」 에 해당하는 종목이 없어요
            </CommandPrimitive.Empty>
          )}
          {shown.map((s) => {
            // 훅 타입은 Stock[] 이지만 실제 응답은 StockDetailResponse(isin 포함 — stock-api searchStocks).
            const isin = (s as Partial<StockDetailResponse>).isin ?? null;
            const chip =
              isin === null
                ? null
                : isToday
                  ? { text: '오늘 · 라이브', cls: 'bg-[var(--up-bg)] text-[var(--up)]' }
                  : gridIsins.has(isin)
                    ? { text: '격자 있음', cls: 'bg-[var(--team-bg)] text-[var(--team)]' }
                    : { text: `변환 필요 · 약 ${etaMin}분`, cls: 'bg-[var(--muted)] text-[var(--muted-fg)]' };
            return (
              <CommandPrimitive.Item
                key={s.code}
                value={s.code}
                disabled={isin === null}
                onSelect={() => isin !== null && select({ isin, code: s.code, name: s.name })}
                className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[13px] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-45 data-[selected=true]:bg-[var(--muted)]"
              >
                <b className="font-semibold text-[var(--fg)]">{s.name}</b>
                <small className="text-[11px] text-[var(--muted-fg)]">
                  {s.code} · {s.market === 'KOSPI' ? '코스피' : '코스닥'}
                </small>
                {chip === null ? (
                  <span className={cn(TAG, 'text-[var(--faint)]')}>틱 없음</span>
                ) : (
                  <span className={cn(TAG, chip.cls)}>{chip.text}</span>
                )}
              </CommandPrimitive.Item>
            );
          })}
        </CommandPrimitive.List>
      )}
    </CommandPrimitive>
  );
}
