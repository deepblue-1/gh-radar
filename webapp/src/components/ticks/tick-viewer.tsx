'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { fmtTickTime } from '@gh-radar/shared';

import type { TickSession } from '@/lib/ticks/tick-session';
import type { TickUrlState } from '@/lib/ticks/tick-url';
import { useTickCursor, type TickCursor } from '@/lib/ticks/use-tick-cursor';
import { cn } from '@/lib/utils';

import { TickBook, type TickBookUnit } from './tick-book';
import { TickAmountCard } from './tick-amount-card';
import { TickMsgList } from './tick-msg-list';
import { TickOrderCard } from './tick-order-card';
import { TickSlider } from './tick-slider';

/**
 * 틱 뷰어 본문 (Phase 37 D-00 · 스케치 019 D 「종합 A+B」).
 *
 * ① 배치(위 → 아래): (매집 3판 차트 · 37-14) → **슬라이더 카드** → **HTS 행**(호가 10단 | 전문 목록 · 37-13 |
 *   이 주문 · 거래대금 · 팀 · 37-13/14). 커서(`useTickCursor`)가 이 화면의 정본이고, 현재 틱 시각 · seq 는 `onTick` 으로
 *   머리에 올린다.
 * ② HTS 칸은 `HTS_PANES` 배열 한 곳에서 그린다 — 뒤 플랜이 원소(전문 · 버스트 · 팀)를 더하면 데스크톱 행과 폰 세그먼트가
 *   같이 늘어난다. 데스크톱(> 640px) = 칸을 가로로 나란히 · 폰(≤ 640px) = 「호가 | 전문 | 버스트 · 팀」 세그먼트로 하나씩.
 *   세그먼트 상태는 이 컴포넌트가 든다. 판정은 CSS(뷰포트 640px)라 JS 가 폭을 재지 않는다.
 *   데스크톱 줄은 줄바꿈(flex-wrap)이다 — 호가 300 고정 · 전문 기본 480(남는 폭을 먼저 가져간다) · 오른쪽 열 기본 330.
 *   본문 폭이 모자라면(사이드바 펼친 1280 등) 오른쪽 열이 아래 줄로 내려가 전체 폭을 쓰고, 그때 카드는 두 열로 놓인다.
 *   줄 높이 = 전문 목록 고정 높이 640(오른쪽 열은 최대 640 · 넘치면 그 안에서 스크롤).
 * ③ 슬라이더 「끝으로」 는 당일 경로(37-19)가 `showEnd` 를 켠다.
 */

export interface TickViewerProps {
  session: TickSession;
  urlState: Omit<TickUrlState, 't'>;
  /** 열기 시점의 URL `t` — 열린 뒤 URL 이 바뀌어도 다시 읽지 않는다. */
  initialT: string | null;
  onTick?: (label: { time: string; seq: number | null }) => void;
}

/** HTS 칸 렌더 문맥 — 칸마다 같은 세션 · 커서를 본다. */
interface PaneCtx {
  session: TickSession;
  cursor: TickCursor;
  unit: TickBookUnit;
  setUnit: (u: TickBookUnit) => void;
}

interface HtsPane {
  id: string;
  /** 폰 세그먼트 라벨. */
  label: string;
  /** 데스크톱 폭 클래스(행 안 flex 항목). */
  desktop: string;
  render: (c: PaneCtx) => ReactNode;
}

/** HTS 칸 — 37-13(전문 · 버스트) · 37-14(팀)가 원소를 더한다. */
const HTS_PANES: readonly HtsPane[] = [
  {
    id: 'book',
    label: '호가',
    desktop: 'min-[641px]:w-[300px] min-[641px]:flex-none',
    render: ({ session, cursor, unit, setUnit }) => (
      <TickBook session={session} rec={cursor.rec} unit={unit} onUnit={setUnit} className="h-full" />
    ),
  },
  {
    // 전문 목록 — 남는 폭을 먼저 가져간다(flex-grow 999). 높이는 고정(창 가상화 · 호가 10단과 같은 줄 높이).
    id: 'msg',
    label: '전문',
    desktop: 'min-[641px]:flex-[999_1_480px]',
    render: ({ session, cursor }) => (
      <TickMsgList
        session={session}
        cursorRec={cursor.rec}
        onSelect={cursor.jumpToRec}
        mode={cursor.mode}
        onMode={cursor.setMode}
        className="h-[640px] max-[640px]:h-[min(640px,calc(100dvh-240px))] max-[640px]:min-h-[360px]"
      />
    ),
  },
  {
    // 오른쪽 열 — 이 주문 · 거래대금(팀 카드는 37-14). 한 줄이면 330 폭에 세로로 · 아래 줄로 내려가면 두 열.
    id: 'side',
    label: '버스트 · 팀',
    desktop: 'min-[641px]:flex-[1_1_330px] min-[641px]:max-h-[640px] min-[641px]:overflow-auto',
    render: ({ session, cursor }) => (
      <div
        data-slot="tick-side"
        className="grid content-start gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))] max-[640px]:grid-cols-1"
      >
        <TickOrderCard session={session} cursorRec={cursor.rec} onJump={cursor.jumpToRec} />
        <TickAmountCard session={session} cursorRec={cursor.rec} />
      </div>
    ),
  },
];

export function TickViewer({ session, urlState, initialT, onTick }: TickViewerProps) {
  const cursor = useTickCursor(session, { initialT, urlState });
  const { rec } = cursor;
  const [unit, setUnit] = useState<TickBookUnit>('qty');
  const [pane, setPane] = useState<string>(HTS_PANES[0]!.id);

  const time = rec >= 0 ? fmtTickTime(session.index.recvNs[rec]!) : '';
  const seq = rec >= 0 && session.index.seq[rec]! >= 0 ? session.index.seq[rec]! : null;

  useEffect(() => {
    onTick?.({ time, seq });
  }, [onTick, time, seq]);

  const ctx: PaneCtx = { session, cursor, unit, setUnit };

  return (
    <div data-slot="tick-viewer-body" className="flex flex-col gap-3">
      <TickSlider
        session={session}
        rec={rec}
        onSeekNs={cursor.seekNs}
        onStep={cursor.step}
        playing={cursor.playing}
        onPlay={cursor.togglePlay}
        speed={cursor.speed}
        onSpeed={cursor.setSpeed}
        onJump={cursor.jumpTo}
      />

      <div role="group" aria-label="보기" className="min-[641px]:hidden">
        <div className="flex w-full rounded-full bg-[var(--muted)] p-0.5">
          {HTS_PANES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === pane}
              onClick={() => setPane(p.id)}
              className={cn(
                'flex-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
                p.id === pane ? 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]' : 'text-[var(--fg-2)]',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div data-slot="tick-hts" className="flex min-w-0 flex-wrap gap-2.5 max-[640px]:flex-col max-[640px]:flex-nowrap">
        {HTS_PANES.map((p) => (
          <div
            key={p.id}
            data-slot="tick-pane"
            data-pane={p.id}
            className={cn('min-w-0', p.desktop, p.id !== pane && 'max-[640px]:hidden')}
          >
            {p.render(ctx)}
          </div>
        ))}
      </div>
    </div>
  );
}
