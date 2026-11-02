'use client';

import { useEffect, useState } from 'react';

import { fmtTickTime } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import type { TickSession } from '@/lib/ticks/tick-session';
import type { TickUrlState } from '@/lib/ticks/tick-url';
import { useTickCursor } from '@/lib/ticks/use-tick-cursor';
import { cn } from '@/lib/utils';

import { TickBook, type TickBookUnit } from './tick-book';

/**
 * 틱 뷰어 본문 (Phase 37 D-00 · 스케치 019 D).
 *
 * 위에서 아래로: (차트 자리 · 37-14) → 시각 입력 → HTS 행(호가 10단 | 전문 목록 · 37-13 | 이 주문 · 거래대금 · 팀 · 37-13/14).
 * 커서(`useTickCursor`)가 이 화면의 정본이고, 현재 틱 시각 · seq 는 `onTick` 으로 머리에 올린다.
 */

export interface TickViewerProps {
  session: TickSession;
  urlState: Omit<TickUrlState, 't'>;
  /** 열기 시점의 URL `t` — 열린 뒤 URL 이 바뀌어도 다시 읽지 않는다. */
  initialT: string | null;
  onTick?: (label: { time: string; seq: number | null }) => void;
}

export function TickViewer({ session, urlState, initialT, onTick }: TickViewerProps) {
  const cursor = useTickCursor(session, { initialT, urlState });
  const { rec } = cursor;
  const [unit, setUnit] = useState<TickBookUnit>('qty');
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const time = rec >= 0 ? fmtTickTime(session.index.recvNs[rec]!) : '';
  const seq = rec >= 0 && session.index.seq[rec]! >= 0 ? session.index.seq[rec]! : null;

  useEffect(() => {
    onTick?.({ time, seq });
  }, [onTick, time, seq]);

  const jump = () => {
    if (draft === null) return;
    if (cursor.jumpTo(draft)) {
      setDraft(null);
      setInvalid(false);
    } else setInvalid(true);
  };

  return (
    <div data-slot="tick-viewer-body" className="flex flex-col gap-3">
      <div className={cn(CARD, 'flex flex-wrap items-center gap-2.5 px-4 py-2.5')}>
        <input
          aria-label="틱 시각"
          aria-invalid={invalid || undefined}
          placeholder="13:05:07.123"
          value={draft ?? time}
          onFocus={() => setDraft((d) => d ?? time)}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') jump();
          }}
          className={cn(
            'mono h-8 w-[118px] rounded-[10px] border bg-[var(--bg)] px-2.5 text-[12.5px] text-[var(--fg)]',
            invalid ? 'border-[var(--destructive)]' : 'border-[var(--border-subtle)]',
          )}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={jump}
          className="h-8 rounded-[10px] bg-[var(--muted)] px-3 text-[12px] font-semibold text-[var(--fg)]"
        >
          점프
        </button>
      </div>
      <div data-slot="tick-hts" className="flex min-w-0 gap-2.5">
        <TickBook session={session} rec={rec} unit={unit} onUnit={setUnit} className="w-[300px] flex-none" />
      </div>
    </div>
  );
}
