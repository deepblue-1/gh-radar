'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { fmtTickTime, type TickOpenResponse } from '@gh-radar/shared';

import { fmtQty } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';
import type { TickUrlState } from '@/lib/ticks/tick-url';
import { useTickCursor, type TickCursor } from '@/lib/ticks/use-tick-cursor';
import { cn } from '@/lib/utils';

import { TickBook, type TickBookUnit } from './tick-book';
import { TickAmountCard } from './tick-amount-card';
import { TickChart } from './tick-chart';
import { TickMsgList } from './tick-msg-list';
import { TickOrderCard } from './tick-order-card';
import { TickSlider } from './tick-slider';
import { TickTeamPanel } from './tick-team-panel';

/**
 * 틱 뷰어 본문 (Phase 37 D-00 · 스케치 019 D 「종합 A+B」).
 *
 * ① 배치(위 → 아래): **매집감지 3판 차트**(37-14 · 클릭 = 그 시각 첫 틱 · 원 클릭 = 그 주문 마지막 조각) → **슬라이더 카드** → **HTS 행**(호가 10단 | 전문 목록 · 37-13 |
 *   이 주문 · 거래대금 · 팀 · 37-13/14). 커서(`useTickCursor`)가 이 화면의 정본이고, 현재 틱 시각 · seq 는 `onTick` 으로
 *   머리에 올린다.
 * ② HTS 칸은 `HTS_PANES` 배열 한 곳에서 그린다 — 뒤 플랜이 원소(전문 · 버스트 · 팀)를 더하면 데스크톱 행과 폰 세그먼트가
 *   같이 늘어난다. 데스크톱(> 640px) = 칸을 가로로 나란히 · 폰(≤ 640px) = 「호가 | 전문 | 버스트 · 팀」 세그먼트로 하나씩.
 *   세그먼트 상태는 이 컴포넌트가 든다. 판정은 CSS(뷰포트 640px)라 JS 가 폭을 재지 않는다.
 *   데스크톱 줄은 줄바꿈(flex-wrap)이다 — 호가 300 고정 · 전문 기본 480(남는 폭을 먼저 가져간다) · 오른쪽 열 기본 330.
 *   본문 폭이 모자라면(사이드바 펼친 1280 등) 오른쪽 열이 아래 줄로 내려가 전체 폭을 쓰고, 그때 카드는 두 열로 놓인다.
 *   줄 높이 = 전문 목록 고정 높이 640(오른쪽 열은 최대 640 · 넘치면 그 안에서 스크롤).
 * ③ 당일(`live` · 37-19 · D-06 · D-18): 슬라이더 「끝으로」(`showEnd`) · `t` 없으면 끝 틱에서 연다 · 커서가 끝이면 증분 세션을
 *   따라간다(`useTickCursor` ⑤) · 끝 여부를 `onAtEnd` 로 올린다(훅이 폴링을 멈추고 잇는다) · 과거 틱이면 전문 목록 끝에
 *   「새 틱 n건 · 끝으로」 배지(n = 멈춘 사이 붙은 레코드 · 0 이면 「새 틱 받기 멈춤」). 배지 · 「끝으로」 = 커서 끝 + `onGoEnd`
 *   (즉시 증분 1회).
 */

export interface TickViewerProps {
  session: TickSession;
  urlState: Omit<TickUrlState, 't'>;
  /** 열기 시점의 URL `t` — 열린 뒤 URL 이 바뀌어도 다시 읽지 않는다. */
  initialT: string | null;
  onTick?: (label: { time: string; seq: number | null }) => void;
  /** 열기 응답 `accum`(차트 누적 선 · 팀 패널 누적 — D-09). */
  accum?: TickOpenResponse['accum'];
  /** 당일 화면 — 누적 선 없음(D-09). */
  isToday?: boolean;
  /** 종목 상장주식수(열기 응답 `stock.listing_shares`) — 차트 · 거래대금 카드의 시총 대비. */
  listingShares?: number | null;
  /** 당일 바이트 경로(37-19) — 없으면 과거 격자. */
  live?: TickViewerLive;
}

export interface TickViewerLive {
  /** 커서가 끝이 아닐 때 붙은 레코드 수. */
  newCount: number;
  /** 「끝으로」 · 배지 — 즉시 증분 1회(커서는 뷰어가 끝으로 옮긴다). */
  onGoEnd: () => void;
  /** 커서가 끝 틱인지 바뀔 때마다. */
  onAtEnd: (atEnd: boolean) => void;
}

/** HTS 칸 렌더 문맥 — 칸마다 같은 세션 · 커서를 본다. */
interface PaneCtx {
  session: TickSession;
  cursor: TickCursor;
  unit: TickBookUnit;
  setUnit: (u: TickBookUnit) => void;
  accum: TickOpenResponse['accum'];
  isToday: boolean;
  listingShares: number | null;
  /** 당일 과거 틱 배지(전문 목록 끝) — 끝이면 null. */
  badge: ReactNode;
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
    render: ({ session, cursor, badge }) => (
      <div className="relative">
        <TickMsgList
          session={session}
          cursorRec={cursor.rec}
          onSelect={cursor.jumpToRec}
          mode={cursor.mode}
          onMode={cursor.setMode}
          className="h-[640px] max-[640px]:h-[min(640px,calc(100dvh-240px))] max-[640px]:min-h-[360px]"
        />
        {badge}
      </div>
    ),
  },
  {
    // 오른쪽 열 — 이 주문 · 거래대금 · 팀 거래정보(37-14). 한 줄이면 330 폭에 세로로 · 아래 줄로 내려가면 두 열.
    id: 'side',
    label: '버스트 · 팀',
    desktop: 'min-[641px]:flex-[1_1_330px] min-[641px]:max-h-[640px] min-[641px]:overflow-auto',
    render: ({ session, cursor, accum, isToday, listingShares }) => (
      <div
        data-slot="tick-side"
        className="grid content-start gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))] max-[640px]:grid-cols-1"
      >
        <TickOrderCard session={session} cursorRec={cursor.rec} onJump={cursor.jumpToRec} />
        <TickAmountCard session={session} cursorRec={cursor.rec} listingShares={listingShares} />
        <TickTeamPanel session={session} cursorRec={cursor.rec} accum={accum} isToday={isToday} />
      </div>
    ),
  },
];

export function TickViewer({
  session,
  urlState,
  initialT,
  onTick,
  accum = null,
  isToday = false,
  listingShares = null,
  live,
}: TickViewerProps) {
  const cursor = useTickCursor(session, { initialT, urlState, live: live !== undefined });
  const { rec, atEnd } = cursor;
  const [unit, setUnit] = useState<TickBookUnit>('qty');
  const [pane, setPane] = useState<string>(HTS_PANES[0]!.id);

  const time = rec >= 0 ? fmtTickTime(session.index.recvNs[rec]!) : '';
  const seq = rec >= 0 && session.index.seq[rec]! >= 0 ? session.index.seq[rec]! : null;

  useEffect(() => {
    onTick?.({ time, seq });
  }, [onTick, time, seq]);

  const onAtEnd = live?.onAtEnd;
  useEffect(() => {
    onAtEnd?.(atEnd);
  }, [onAtEnd, atEnd]);

  const onGoEnd = live?.onGoEnd;
  const cursorGoEnd = cursor.goEnd;
  const goEnd = useCallback(() => {
    cursorGoEnd();
    onGoEnd?.();
  }, [cursorGoEnd, onGoEnd]);

  const badge =
    live !== undefined && !atEnd ? (
      <button
        type="button"
        data-slot="tick-live-badge"
        onClick={goEnd}
        title="과거 틱을 보는 동안 새 틱 받기를 멈췄어요"
        className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[var(--up)] px-3 py-1 text-[11.5px] font-semibold whitespace-nowrap text-white shadow-md"
      >
        {live.newCount > 0 ? `새 틱 ${fmtQty(live.newCount)}건 · 끝으로` : '새 틱 받기 멈춤 · 끝으로'}
      </button>
    ) : null;

  const ctx: PaneCtx = { session, cursor, unit, setUnit, accum, isToday, listingShares, badge };

  return (
    <div data-slot="tick-viewer-body" className="flex flex-col gap-3">
      <TickChart
        session={session}
        accum={accum}
        isToday={isToday}
        listingShares={listingShares}
        cursorRec={rec}
        onSeekMs={(ms) => cursor.seekNs(BigInt(Math.round(ms)) * 1_000_000n)}
        onJumpRec={cursor.jumpToRec}
      />

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
        showEnd={live !== undefined}
        onEnd={goEnd}
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
