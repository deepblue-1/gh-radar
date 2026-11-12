'use client';

import { cn } from '@/lib/utils';

/**
 * 「선 차트 | 봉 차트」 전환 스위치 (Phase 42 · D-02 · D-03 · D-05 · UI-SPEC S1).
 *
 * 두 차트 모두 제목 줄 「타임라인」 바로 뒤에 같은 컴포넌트를 그린다(`titleAddon`). 켜짐 = 중립 선택 면 `--seg-on-*` 600
 * (파랑은 하락 · 매도 방향색으로 읽힌다 — Phase 20 D-02) · 꺼짐 = `--muted-fg` 400 · hover 꺼짐 칸 글자 `--fg`.
 * 권한 분기 없음(D-03 — 틱뷰어 사용자 모두). 브라우저 기억은 42-08.
 */

export type ChartKind = 'line' | 'candle';

const KINDS: readonly { id: ChartKind; label: string }[] = [
  { id: 'line', label: '선 차트' },
  { id: 'candle', label: '봉 차트' },
];

export function ChartKindSwitch({
  value,
  onChange,
  phone,
}: {
  value: ChartKind;
  onChange: (kind: ChartKind) => void;
  phone: boolean;
}) {
  return (
    <div
      data-slot="chart-kind-switch"
      role="group"
      aria-label="차트 종류"
      className="inline-flex rounded-full bg-[var(--muted)] p-0.5"
    >
      {KINDS.map((k) => {
        const on = k.id === value;
        return (
          <button
            key={k.id}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (!on) onChange(k.id);
            }}
            className={cn(
              'rounded-full px-2 whitespace-nowrap',
              phone ? 'h-7 text-[12px]' : 'h-5 text-[11px]',
              on
                ? 'bg-[var(--seg-on-bg)] font-semibold text-[var(--seg-on-fg)] shadow-[var(--seg-on-shadow)]'
                : 'font-normal text-[var(--muted-fg)] hover:text-[var(--fg)]',
            )}
          >
            {k.label}
          </button>
        );
      })}
    </div>
  );
}
