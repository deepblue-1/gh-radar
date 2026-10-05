'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  layoutLaneLabels,
  type LaneEntry,
  type LaneLabelItem,
  type LaneLock,
  type LaneMark,
  type LaneMarkKind,
} from '@/lib/limitup-lanes';
import { cn } from '@/lib/utils';

/**
 * 사건 카드 레인 한 줄 (UI-SPEC ④-4 · D-12 · R-6 · R-9 — inline SVG · 차트 라이브러리 없음).
 *
 * - SVG 는 **선 · 면 · 음영만** 그린다(`viewBox="0 0 100 100"` · `preserveAspectRatio="none"` · 곡선 `vector-effect`
 *   non-scaling 1.5px). SVG 안에 글자 요소가 없다 — 폭에 따라 viewBox 가 늘어나도 글자가 줄거나 커지지 않게(R-9).
 * - **글자와 점 마커는 HTML 오버레이**(`aria-hidden` · 11px 고정 · x = 시각 % 위치). 같은 사실이 사실 문장 목록에 글자로
 *   있으므로 오버레이는 읽지 않는다. SVG 는 `role="img"` + 요약 `aria-label`.
 * - 색(R-6 이 목업을 이긴다): 곡선 · 가격선 · 매도벽 곡선 `--fg`(면 `--muted`) · 잠김 음영 `--muted` · 상한가 선
 *   `--border-subtle` · 25% 점선 · 기준선 · 25% 도달 점 `--led-latent` · 깨짐 ● 과 그 라벨 `--up` · 큰 매도 ▼ `--down` ·
 *   취소 ✕ `--muted-fg` · 첫 체결 · 최대 점 · 매도벽 소진 `--fg`. 초록 상태 토큰 0 · 등장 애니메이션 없음.
 * - 라벨은 `layoutLaneLabels` 가 14px 줄 칸에 겹치지 않게 놓는다(들어가지 않으면 버리고 마커 `title` 로만 남긴다 — E8 overflow).
 */

const DOT: Partial<Record<LaneMarkKind, string>> = {
  reach25: 'bg-[var(--led-latent)]',
  wallClear: 'bg-[var(--fg)]',
  firstUpper: 'bg-[var(--fg)]',
  max: 'bg-[var(--fg)]',
  break: 'bg-[var(--up)]',
};

const GLYPH: Partial<Record<LaneMarkKind, { ch: string; cls: string }>> = {
  sell: { ch: '▼', cls: 'text-[var(--down)]' },
  cancel: { ch: '✕', cls: 'text-[var(--muted-fg)]' },
};

/** 라벨 우선순위 — 선 라벨 → 깨짐 → 최대 → 큰 매도 → 취소 → 진입 마커. 앞에 둔 것이 자리를 먼저 잡는다. */
const LABEL_ORDER: LaneMarkKind[] = ['break', 'max', 'firstUpper', 'reach25', 'wallClear', 'sell', 'cancel'];

/** 레이아웃 전(측정 0 — jsdom) 폭 가정. */
const FALLBACK_W = 640;

function Marker({ m }: { m: LaneMark }) {
  const glyph = GLYPH[m.kind];
  const style = { left: `${m.x}%`, top: `${m.y}%` };
  if (glyph) {
    return (
      <span
        data-mark={m.kind}
        title={m.title}
        style={style}
        className={cn(
          'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 text-[11px] leading-none',
          glyph.cls,
        )}
      >
        {glyph.ch}
      </span>
    );
  }
  return (
    <span
      data-mark={m.kind}
      title={m.title}
      style={style}
      className={cn(
        'pointer-events-auto absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
        DOT[m.kind],
      )}
    />
  );
}

export function LimitupLane({
  lane,
  height,
  ariaLabel,
}: {
  lane: LaneEntry | LaneLock;
  height: number;
  ariaLabel: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = width > 0 ? width : FALLBACK_W;

  const labels = useMemo(() => {
    const items: (LaneLabelItem & { tone: string })[] = [];
    for (const l of lane.lines) {
      items.push({
        id: `line-${l.kind}`,
        text: l.label,
        xPct: l.kind === 'upper' ? 100 : 0,
        yPct: l.y,
        align: l.kind === 'upper' ? 'end' : 'start',
        tone: l.kind === 'upper' ? 'text-[var(--muted-fg)]' : 'text-[var(--led-latent)]',
      });
    }
    const marks = lane.marks
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.label !== null)
      .sort((a, b) => LABEL_ORDER.indexOf(a.m.kind) - LABEL_ORDER.indexOf(b.m.kind) || a.i - b.i);
    for (const { m, i } of marks) {
      items.push({
        id: `mark-${i}`,
        text: m.label!,
        xPct: m.x,
        yPct: m.y,
        align: 'auto',
        tone: m.kind === 'break' ? 'text-[var(--up)]' : 'text-[var(--muted-fg)]',
      });
    }
    const placed = new Map(layoutLaneLabels(items, w, height).map((p) => [p.id, p]));
    return items.flatMap((it) => {
      const p = placed.get(it.id);
      return p ? [{ ...it, ...p }] : [];
    });
  }, [lane, w, height]);

  return (
    <div data-slot="limitup-lane" data-kind={lane.kind} className="w-full">
      <div ref={boxRef} className="relative w-full" style={{ height }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel}
          className="absolute inset-0 block h-full w-full overflow-visible"
        >
          {lane.kind === 'lock' &&
            lane.shades.map((s, i) => (
              <rect key={i} x={s.x} y={0} width={s.w} height={100} fill="var(--muted)" />
            ))}
          {lane.kind === 'entry' && lane.wallArea !== '' && (
            <path d={lane.wallArea} fill="var(--muted)" stroke="none" />
          )}
          {lane.lines.map((l) => (
            <line
              key={l.kind}
              x1={0}
              x2={100}
              y1={l.y}
              y2={l.y}
              stroke={l.kind === 'upper' ? 'var(--border-subtle)' : 'var(--led-latent)'}
              strokeWidth={1}
              strokeDasharray={l.kind === 'upper' ? '3 3' : '2 4'}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {(lane.kind === 'entry' ? [lane.pricePath, lane.wallPath] : [lane.path])
            .filter((d) => d !== '')
            .map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="var(--fg)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
        </svg>
        <div aria-hidden="true" data-slot="limitup-lane-overlay" className="pointer-events-none absolute inset-0">
          {lane.marks.map((m, i) => (
            <Marker key={i} m={m} />
          ))}
          {labels.map((l) => (
            <span
              key={l.id}
              data-label={l.id}
              style={{ left: l.left, top: l.top, width: l.width }}
              className={cn(
                'absolute text-[11px] leading-[14px] whitespace-nowrap [text-shadow:0_0_2px_var(--card),0_0_2px_var(--card)]',
                l.tone,
              )}
            >
              {l.text}
            </span>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="relative mt-1 h-4 text-[11px] leading-4 text-[var(--muted-fg)]">
        {lane.ticks.map((t, i) => (
          <span
            key={i}
            style={{ left: `${t.x}%` }}
            className={cn(
              'mono absolute top-0',
              i === 0 ? '' : i === lane.ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
            )}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
