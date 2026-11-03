'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

import { DENSITY_BUCKETS, fmtTickTime } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import type { TickSession } from '@/lib/ticks/tick-session';
import { PLAY_SPEEDS, type TickPlaySpeed } from '@/lib/ticks/use-tick-cursor';
import { cn } from '@/lib/utils';

/**
 * 틱 뷰어 슬라이더 카드 (Phase 37 D-00 ① · 스케치 019 D 「슬라이더 카드」 `.tr`).
 *
 * 한 줄(넘치면 감김): ‹ ▶/⏸ › · 08:00~20:00 트랙 · 속도 칩 1× / 10× / 최대 · 시각 입력 `HH:MM:SS.mmm` + 「점프」 ·
 * (당일이면) 「끝으로」(37-19 가 `showEnd` 를 켠다).
 * ① 트랙 = 5분 거래대금 밀도 막대 144개(√ 정규화 — 급등 몇 칸이 나머지를 눌러 없애지 않게) · VI 시작마다 주황 눈금
 *   (+ 구간 옅은 띠) · 손잡이 = 현재 틱 **수신** 시각의 08:00~20:00 비율(밀도 칸도 수신 시각 기준 — 37-05).
 * ② 트랙 누르기 = 그 시각 이후 첫 틱(`onSeekNs`) · 끌기는 rAF 로 프레임당 한 번만 부른다.
 * ③ 키보드: 트랙은 `role="slider"`(aria-valuetext = 현재 시각) · ← → 는 화면 전체 키 처리(useTickCursor)가 맡는다.
 * ④ 시각 입력: 평소엔 현재 틱 시각을 보이고, 고치는 동안만 초안을 든다. Enter · 「점프」 → `onJump` — 형식이 틀리면
 *   테두리 빨강(aria-invalid) · 커서 그대로.
 */

export interface TickSliderProps {
  session: TickSession;
  rec: number;
  onSeekNs: (ns: bigint) => void;
  onStep: (delta: number) => void;
  playing: boolean;
  onPlay: () => void;
  speed: TickPlaySpeed;
  onSpeed: (s: TickPlaySpeed) => void;
  onJump: (hms: string) => boolean;
  showEnd?: boolean;
  onEnd?: () => void;
  className?: string;
}

/** 08:00~20:00 = 12시간(ms). */
const SPAN_MS = 12 * 3_600_000;
const SPAN_NS = BigInt(SPAN_MS) * 1_000_000n;
const AXIS = ['08', '12', '16', '20'] as const;
const SPEED_LABEL: Record<string, string> = { '1': '1×', '10': '10×', max: '최대' };

const fracOf = (session: TickSession, ns: bigint) =>
  Math.min(1, Math.max(0, Number(ns - session.dayStartNs) / Number(SPAN_NS)));

const IB =
  'inline-flex size-8 flex-none items-center justify-center rounded-[10px] bg-[var(--muted)] text-[var(--fg)] hover:bg-[var(--raised-2)]';

export function TickSlider({
  session,
  rec,
  onSeekNs,
  onStep,
  playing,
  onPlay,
  speed,
  onSpeed,
  onJump,
  showEnd = false,
  onEnd,
  className,
}: TickSliderProps) {
  const recvNs = rec >= 0 ? session.index.recvNs[rec]! : session.dayStartNs;
  const time = rec >= 0 ? fmtTickTime(recvNs) : '';
  const frac = fracOf(session, recvNs);

  // 밀도 막대 — √ 정규화(0 칸은 높이 0).
  const max = Math.max(0, ...session.density);
  const rootMax = Math.sqrt(max);

  // 끌기 — rAF 스로틀.
  const drag = useRef<{ x: number; raf: number } | null>(null);
  const nsAt = (el: HTMLElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    const f = r.width > 0 ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0;
    return session.dayStartNs + BigInt(Math.round(f * SPAN_MS)) * 1_000_000n;
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== undefined && e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, raf: 0 };
    onSeekNs(nsAt(e.currentTarget, e.clientX));
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d === null) return;
    d.x = e.clientX;
    if (d.raf !== 0) return;
    const el = e.currentTarget;
    d.raf = requestAnimationFrame(() => {
      const cur = drag.current;
      if (cur === null) return;
      cur.raf = 0;
      onSeekNs(nsAt(el, cur.x));
    });
  };
  const onUp = () => {
    if (drag.current !== null && drag.current.raf !== 0) cancelAnimationFrame(drag.current.raf);
    drag.current = null;
  };
  useEffect(
    () => () => {
      if (drag.current !== null && drag.current.raf !== 0) cancelAnimationFrame(drag.current.raf);
    },
    [],
  );

  // 시각 입력 — 고치는 동안만 초안.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const jump = () => {
    const v = draft ?? time;
    if (onJump(v)) {
      setDraft(null);
      setInvalid(false);
    } else setInvalid(true);
  };

  return (
    <section
      data-slot="tick-slider"
      aria-label="틱 이동"
      className={cn(CARD, 'flex flex-wrap items-center gap-x-2.5 gap-y-2 px-4 py-2.5 max-[640px]:px-3', className)}
    >
      <div className="flex flex-none items-center gap-1.5">
        <button type="button" aria-label="이전 틱" onClick={() => onStep(-1)} className={IB}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={playing ? '정지' : '재생'}
          aria-pressed={playing}
          onClick={onPlay}
          className={cn(IB, playing && 'bg-[var(--primary)] text-[var(--primary-fg)] hover:bg-[var(--primary)]')}
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </button>
        <button type="button" aria-label="다음 틱" onClick={() => onStep(1)} className={IB}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="틱 시각 슬라이더"
        aria-valuemin={0}
        aria-valuemax={720}
        aria-valuenow={Math.round(frac * 720)}
        aria-valuetext={time}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative h-[38px] min-w-0 flex-[1_1_260px] cursor-pointer touch-none select-none outline-none focus-visible:rounded-[6px] focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 flex justify-between text-[9.5px] leading-none text-[var(--faint)]"
        >
          {AXIS.map((h) => (
            <span key={h} className="mono">
              {h}
            </span>
          ))}
        </div>
        {session.vi.map((v, i) => {
          const a = fracOf(session, v.startNs);
          const b = v.endNs === null ? a : fracOf(session, v.endNs);
          return (
            <i
              key={`band${i}`}
              aria-hidden
              data-slot="tick-vi-span"
              style={{ left: `${a * 100}%`, width: `${Math.max(0, b - a) * 100}%` }}
              className="pointer-events-none absolute top-[12px] bottom-[9px] bg-[var(--vi-bg)]"
            />
          );
        })}
        <svg
          aria-hidden
          viewBox={`0 0 ${DENSITY_BUCKETS} 100`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 top-[12px] h-[17px] w-full"
        >
          {Array.from(session.density, (v, k) => {
            const h = rootMax > 0 && v > 0 ? (Math.sqrt(v) / rootMax) * 100 : 0;
            return (
              <rect
                key={k}
                data-slot="tick-density-bar"
                x={k + 0.1}
                y={100 - h}
                width={0.8}
                height={h}
                className="fill-[var(--muted-fg)] opacity-45"
              />
            );
          })}
        </svg>
        {session.vi.map((v, i) => (
          <i
            key={`mark${i}`}
            aria-hidden
            data-slot="tick-vi-mark"
            title={`VI ${fmtTickTime(v.startNs)}`}
            style={{ left: `${fracOf(session, v.startNs) * 100}%` }}
            className="pointer-events-none absolute top-[10px] bottom-[6px] w-[2px] -translate-x-1/2 rounded-[1px] bg-[var(--vi)]"
          />
        ))}
        <i
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-[6px] h-[3px] rounded-[2px] bg-[var(--raised-2)]"
        />
        <i
          aria-hidden
          data-slot="tick-slider-thumb"
          style={{ left: `${frac * 100}%` }}
          className="pointer-events-none absolute bottom-[0.5px] size-3.5 -translate-x-1/2 rounded-full bg-[var(--fg)] shadow-[0_0_0_3px_var(--card)]"
        />
      </div>

      <div role="group" aria-label="재생 속도" className="inline-flex flex-none rounded-full bg-[var(--muted)] p-0.5">
        {PLAY_SPEEDS.map((s) => (
          <button
            key={String(s)}
            type="button"
            aria-pressed={s === speed}
            onClick={() => s !== speed && onSpeed(s)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
              s === speed ? 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]' : 'text-[var(--fg-2)]',
            )}
          >
            {SPEED_LABEL[String(s)]}
          </button>
        ))}
      </div>

      <div className="flex flex-none items-center gap-1.5">
        <input
          aria-label="틱 시각"
          aria-invalid={invalid || undefined}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="13:05:07.123"
          value={draft ?? time}
          onFocus={() => setDraft((d) => d ?? time)}
          onBlur={() => {
            if (!invalid) setDraft(null);
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              jump();
            } else if (e.key === 'Escape') {
              setDraft(null);
              setInvalid(false);
              e.currentTarget.blur();
            }
          }}
          className={cn(
            'mono h-8 w-[118px] rounded-[10px] border bg-[var(--bg)] px-2.5 text-[12.5px] text-[var(--fg)] outline-none focus:border-[var(--primary)]',
            invalid ? 'border-[var(--destructive)] focus:border-[var(--destructive)]' : 'border-[var(--border-subtle)]',
          )}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={jump}
          className="h-8 rounded-[10px] bg-[var(--muted)] px-3 text-[12px] font-semibold whitespace-nowrap text-[var(--fg)] hover:bg-[var(--raised-2)]"
        >
          점프
        </button>
        {showEnd && (
          <button
            type="button"
            onClick={onEnd}
            className="h-8 rounded-[10px] bg-[var(--muted)] px-3 text-[12px] font-semibold whitespace-nowrap text-[var(--fg)] hover:bg-[var(--raised-2)]"
          >
            끝으로
          </button>
        )}
      </div>
      <span className="text-[10.5px] whitespace-nowrap text-[var(--faint)] max-[640px]:hidden">
        ← → 1틱 · Shift 10틱 · Shift+[ ] 팀 주문 · Space 재생
      </span>
    </section>
  );
}
