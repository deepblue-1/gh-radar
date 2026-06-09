'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Tag } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/**
 * StockThemeChips — UI-SPEC §S3 종목 상세 "이 종목의 테마" 칩 (D-16).
 *
 * theme_stocks 역조회(idx_theme_stocks_code): eq stock_code + is effective_to null +
 * themes!inner(id,name,is_system,owner_id). RLS read_theme_stocks 가 시스템 + 내 테마를
 * **DB 레벨에서 한 번에 필터**(단일 테이블 이점, T-10-07-02) — 타 유저 테마 누출 0.
 *
 * 칩 = 테마명 + 시스템(source 도트) / 내 테마(accent border). 클릭 → /themes/[id].
 * 최대 MAX_VISIBLE 개 + '+N' overflow(popover 전체). 분류 테마 없으면 옅은 안내.
 * PostgREST 1:1 object / 1:N array 방어(watchlist 선례). 에러는 섹션 숨김(조용히 폴백).
 *
 * 모든 색/간격은 globals.css 토큰만 — 신규 토큰/하드코딩 금지.
 */

const MAX_VISIBLE = 6;

interface ThemeChip {
  id: string;
  name: string;
  isSystem: boolean;
}

interface RawThemeRef {
  id: string;
  name: string;
  is_system: boolean;
  owner_id: string | null;
}

interface RawThemeStockRow {
  theme_id: string;
  // PostgREST !inner — 1:1 은 object, 방어적으로 array 도 허용.
  themes: RawThemeRef | RawThemeRef[] | null;
}

function extractTheme(raw: RawThemeStockRow['themes']): RawThemeRef | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

export interface StockThemeChipsProps {
  stockCode: string;
}

/** 단일 칩 렌더 — 시스템(outline + flat 도트) / 내 테마(accent border). */
function Chip({ theme }: { theme: ThemeChip }) {
  return (
    <Link href={`/themes/${theme.id}`} aria-label={`${theme.name} 테마로 이동`}>
      <Badge
        variant="outline"
        className={cn(
          'gap-1.5 hover:border-[var(--primary)]',
          !theme.isSystem &&
            'border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] text-[var(--fg)]',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block size-1.5 rounded-full',
            theme.isSystem ? 'bg-[var(--flat)]' : 'bg-[var(--primary)]',
          )}
        />
        {theme.name}
      </Badge>
    </Link>
  );
}

export function StockThemeChips({ stockCode }: StockThemeChipsProps) {
  const [themes, setThemes] = useState<ThemeChip[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('theme_stocks')
          .select('theme_id, themes!inner ( id, name, is_system, owner_id )')
          .eq('stock_code', stockCode)
          .is('effective_to', null);

        if (cancelled) return;
        if (error || !data) {
          setLoaded(true);
          return;
        }

        const chips: ThemeChip[] = [];
        const seen = new Set<string>();
        for (const row of data as unknown as RawThemeStockRow[]) {
          const t = extractTheme(row.themes);
          if (!t || seen.has(t.id)) continue;
          seen.add(t.id);
          chips.push({ id: t.id, name: t.name, isSystem: t.is_system });
        }
        // 내 테마(accent) 먼저, 그다음 시스템 — 사용자 소유 강조.
        chips.sort((a, b) => Number(a.isSystem) - Number(b.isSystem));
        setThemes(chips);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stockCode]);

  // 로딩 전에는 레이아웃 점프 방지를 위해 아무것도 렌더하지 않음.
  if (!loaded) return null;

  const visible = themes.slice(0, MAX_VISIBLE);
  const overflow = themes.slice(MAX_VISIBLE);

  return (
    <section aria-label="이 종목의 테마" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-[length:var(--t-caption)] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
        <Tag className="size-3.5" aria-hidden="true" />이 종목의 테마
      </h2>
      {themes.length === 0 ? (
        <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]/70">
          분류된 테마 없음
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {visible.map((t) => (
            <Chip key={t.id} theme={t} />
          ))}
          {overflow.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`테마 ${overflow.length}개 더 보기`}
                  className="inline-flex h-5 items-center rounded-full border border-[var(--border)] px-2 text-[11px] font-semibold text-[var(--muted-fg)] hover:text-[var(--fg)]"
                >
                  +{overflow.length}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto max-w-xs">
                <div className="flex flex-wrap gap-2">
                  {overflow.map((t) => (
                    <Chip key={t.id} theme={t} />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </section>
  );
}
