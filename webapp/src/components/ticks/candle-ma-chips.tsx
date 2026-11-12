'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { CandleMaForm } from '@/components/ticks/candle-ma-form';
import { MA_MAX_LINES, maKeyOf, maNameOf, type MaSpec } from '@/lib/ticks/candle-ma';
import { addMaLine, removeMaLine, toggleMaLine, type MaConfig } from '@/lib/ticks/candle-prefs';
import { cn } from '@/lib/utils';

/**
 * 이동평균 칩 줄 + 「＋」 (Phase 42 · D-10 · D-21 · D-22 · UI-SPEC S3 · S4).
 *
 * - 칩 하나 = 켜기 칸(색 줄 8×2 `--ma-n` + 이름 · `aria-pressed`) + × 칸(「{이름} 지우기」)이 붙은 알약.
 *   켜짐 = `--muted` 면 · `--fg` 600 · 색 줄 1 / 꺼짐 = 투명 면 · 안쪽 1px `--border-subtle` · `--muted-fg` 400 · 색 줄 .35.
 *   켜기 칸 = 켜고 끄기(색 번호 그대로) · × = 확인 없이 지움 · 순서 = 더한 순서.
 * - 「＋」 = 더하기 창(`CandleMaForm`)의 trigger. 6개(켜짐 + 꺼짐)면 `aria-disabled` + .4 + `title` — `disabled` 가 아니라서
 *   초점과 `title` 이 남고, 눌러도 창이 열리지 않는다.
 * - 데스크톱 = `inline-flex flex-wrap` 묶음(머리 글자 「이동평균」 → 칩 → 「＋」).
 *   폰 = 칩 줄만 가로 밀기(`overflow-x-auto` · 줄바꿈 없음 · 넘칠 때만 오른쪽 16px 흐림) → 「＋」 오른쪽 고정(D-21).
 * - 저장은 하지 않는다 — 결과 구성을 `onChange` 로 넘기고 결선(42-10)이 `useMaConfig` setter 로 잇는다.
 */

const FULL_TITLE = '이동평균은 6개까지예요 — 하나를 지우면 더할 수 있어요';

/** 색 번호 → 색 줄 클래스(정적 문자열 — Tailwind 가 소스에서 찾는다). */
const MA_BG = [
  '',
  'bg-[var(--ma-1)]',
  'bg-[var(--ma-2)]',
  'bg-[var(--ma-3)]',
  'bg-[var(--ma-4)]',
  'bg-[var(--ma-5)]',
  'bg-[var(--ma-6)]',
] as const;

/** 오른쪽 16px 흐림(넘칠 때만). */
const FADE_MASK = '[mask-image:linear-gradient(to_right,#000_calc(100%-16px),transparent)]';

export interface CandleMaChipsProps {
  config: MaConfig;
  onChange: (cfg: MaConfig) => void;
  /** 측정 폭이 폰인가(차트가 넘긴다). */
  phone: boolean;
}

export function CandleMaChips({ config, onChange, phone }: CandleMaChipsProps) {
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const plusRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef(false);
  const lines = config.lines;
  const full = lines.length >= MA_MAX_LINES;

  // 폰 칩 줄 — 넘칠 때만 흐림 · 막 더한 칩은 끝까지 밀어 보인다(behavior auto = 즉시).
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) {
      setOverflow(false);
      return;
    }
    if (revealRef.current) {
      revealRef.current = false;
      el.scrollLeft = el.scrollWidth;
    }
    // 오른쪽에 가려진 칩이 남아 있을 때만 흐림(끝까지 밀면 걷는다 — 막 더한 칩이 흐려 보이지 않게).
    const measure = () => setOverflow(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
    };
  }, [lines]);

  const onOpenChange = (next: boolean) => {
    if (next && full) return; // 6개면 아무 일 없음
    setOpen(next);
  };

  const onAdd = (spec: MaSpec) => {
    revealRef.current = true;
    onChange(addMaLine(config, spec));
    // 창이 닫힌 뒤 초점은 「＋」(팝오버 · 시트 모두 한 틱 뒤 돌려주지만 여기서 바로 잡는다).
    requestAnimationFrame(() => plusRef.current?.focus());
  };

  const chips = lines.map((l) => {
    const key = maKeyOf(l);
    const name = maNameOf(l);
    return (
      <span
        key={key}
        data-slot="candle-ma-chip"
        data-on={l.on}
        className={cn(
          'inline-flex shrink-0 items-center rounded-full whitespace-nowrap',
          phone ? 'h-8 text-[12px]' : 'h-6 text-[11px]',
          l.on
            ? 'bg-[var(--muted)] font-semibold text-[var(--fg)]'
            : 'bg-transparent font-normal text-[var(--muted-fg)] shadow-[inset_0_0_0_1px_var(--border-subtle)]',
        )}
      >
        <button
          type="button"
          aria-pressed={l.on}
          onClick={() => onChange(toggleMaLine(config, key))}
          className={cn('inline-flex h-full items-center gap-1 rounded-l-full', phone ? 'pl-3 pr-1' : 'pl-2 pr-1')}
        >
          <i
            aria-hidden="true"
            className={cn('inline-block h-0.5 w-2 shrink-0 rounded-[1px]', MA_BG[l.color], !l.on && 'opacity-35')}
          />
          {name}
        </button>
        <button
          type="button"
          aria-label={`${name} 지우기`}
          onClick={() => onChange(removeMaLine(config, key))}
          className={cn(
            'inline-flex h-full items-center justify-center rounded-r-full text-[var(--muted-fg)] hover:text-[var(--fg)]',
            phone ? 'w-7 pr-2' : 'w-5 pr-1',
          )}
        >
          ×
        </button>
      </span>
    );
  });

  const plus = (
    <button
      ref={plusRef}
      type="button"
      data-slot="candle-ma-add"
      aria-label="이동평균 더하기"
      aria-disabled={full ? 'true' : undefined}
      title={full ? FULL_TITLE : undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap text-[var(--fg)]',
        phone ? 'h-8 min-w-8 px-2 text-[12px]' : 'h-6 min-w-6 px-2 text-[11px]',
        open ? 'bg-[var(--raised-2)]' : 'bg-[var(--muted)]',
        full && 'cursor-not-allowed opacity-40',
      )}
    >
      {phone && lines.length === 0 ? '＋ 이동평균' : '＋'}
    </button>
  );
  const form = <CandleMaForm open={open} onOpenChange={onOpenChange} config={config} onAdd={onAdd} trigger={plus} />;

  if (!phone) {
    return (
      <div
        role="group"
        aria-label="이동평균"
        data-slot="candle-ma-chips"
        className="inline-flex flex-wrap items-center gap-1"
      >
        <span className="text-[11px] text-[var(--muted-fg)]">이동평균</span>
        {chips}
        {form}
      </div>
    );
  }

  return (
    <div role="group" aria-label="이동평균" className="flex min-w-0 flex-1 items-center gap-2">
      {lines.length > 0 && (
        <div
          ref={stripRef}
          data-slot="candle-ma-chips"
          data-overflow={overflow || undefined}
          className={cn(
            'flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            overflow && FADE_MASK,
          )}
        >
          {chips}
        </div>
      )}
      {form}
    </div>
  );
}
