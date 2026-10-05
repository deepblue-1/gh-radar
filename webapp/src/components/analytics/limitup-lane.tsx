'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  EVENT_BAND_ROW_H,
  estimateLabelWidth,
  layoutEventBand,
  type LaneEntry,
  type LaneLock,
  type LaneMark,
  type LaneMarkKind,
  type LanePoint,
  type LimitupEventTone,
} from '@/lib/limitup-lanes';
import { cn } from '@/lib/utils';

/**
 * 사건 카드 레인 한 줄 (UI-SPEC ④-4 · D-12 · R-6 · R-9 · quick-261005-vk1 D-04/D-05 스케치 011 A — inline SVG · 차트 라이브러리 없음).
 *
 * 구조 = 라벨 띠(`data-slot="limitup-event-band"` · 번호 배지) 위 + 플롯(SVG + HTML 오버레이) 아래 + 시각 눈금.
 * - SVG 는 **선 · 면 · 음영만** 그린다(`viewBox="0 0 100 100"` · `preserveAspectRatio="none"` · 곡선 `vector-effect`
 *   non-scaling 1.5px). SVG 안에 글자 요소가 없다 — 폭에 따라 viewBox 가 늘어나도 글자가 줄거나 커지지 않게(R-9).
 * - **글자와 점 마커는 HTML 오버레이**(`aria-hidden` · 11px 고정). 같은 사실이 사실 문장 목록에 글자로 있으므로 오버레이는
 *   읽지 않는다. SVG 는 `role="img"` + 요약 `aria-label`.
 * - 번호 사건: 띠의 둥근 배지(번호 원 + 「시각 짧은 이름 (· 값)」 — 폰(폭 < 560)은 번호만) → 점선 지시선 → 마커 점. 배지는
 *   `layoutEventBand` 가 최대 3줄에 겹치지 않게 놓고, 넘치면 점 위에 번호만 쓴다. 배지 · 점에 마우스를 올리면 `onHl(n)` —
 *   카드가 같은 번호의 사실 문장을 함께 강조한다(상호 강조).
 * - 색(D-05 — 앱 토큰만 · R-6 이 스케치를 이긴다): 곡선 · 가격선 · 매도벽 곡선 `--fg`(면 `--muted`) · 잠김 음영 `--muted` ·
 *   상한가 선 `--border-subtle` · 탐지율 선 · 기준 10억 선 `--led-latent` · 직전 1분 창 면 `--accent`(캡션 `--accent-fg` —
 *   매수/매도 관례색과 구분되는 파란 면, D-04 사용자 결정) · 마커 점 탐지 `--led-latent` · 깨짐 `--up` · 그 밖 `--fg` ·
 *   번호 원 강조 `--fg` 바탕(글자 `--card`) · 비강조 `--card` 바탕 + `--muted-fg` 테두리 · 큰 매도 ▼ `--down` · 취소 ✕ `--muted-fg` ·
 *   매도벽 소진 점 `--fg` · 미잠김 단일가 면 `--border-subtle`(캡션 `--muted-fg` — 잠김 음영 `--muted` 와 다른 중립 회색 ·
 *   quick-261005-x9o). 초록 상태 토큰 0 · 등장 애니메이션 없음.
 * - 선 라벨: 상한가 · 기준 10억 = 오른쪽 위(선 위 · 오른쪽 정렬) · 탐지율 = 왼쪽 아래(선 아래 · 왼쪽 정렬). 창 캡션 =
 *   음영 왼쪽 아래(오른쪽 끝을 넘으면 오른쪽 정렬로 당긴다) · 단일가 캡션 = 회색 면 왼쪽 아래(창 캡션과 가로로 겹치면 왼쪽 위) —
 *   면 px 폭이 캡션보다 좁으면 그리지 않는다(SVG 요약 aria 「단일가 …」 에는 남는다).
 */

const TONE_BG: Record<LimitupEventTone, string> = {
  detect: 'bg-[var(--led-latent)]',
  break: 'bg-[var(--up)]',
  fg: 'bg-[var(--fg)]',
};
const TONE_BORDER: Record<LimitupEventTone, string> = {
  detect: 'border-[var(--led-latent)]',
  break: 'border-[var(--up)]',
  fg: 'border-[var(--fg)]',
};
const TONE_TEXT: Record<LimitupEventTone, string> = {
  detect: 'text-[var(--led-latent)]',
  break: 'text-[var(--up)]',
  fg: 'text-[var(--fg)]',
};

const GLYPH: Partial<Record<LaneMarkKind, { ch: string; cls: string }>> = {
  sell: { ch: '▼', cls: 'text-[var(--down)]' },
  cancel: { ch: '✕', cls: 'text-[var(--muted-fg)]' },
};

/** 레이아웃 전(측정 0 — jsdom) 폭 가정. */
const FALLBACK_W = 640;
/** 이 폭 미만이면 배지에 번호만(폰). */
const COMPACT_W = 560;
const LABEL_H = 14;
const BADGE_H = 17;
const BADGE_TOP = 3;

/** 띠 높이 — 줄 수 × 20 + 6 · 번호 사건이 없으면 0. */
export function eventBandHeight(rows: number): number {
  return rows > 0 ? 6 + rows * EVENT_BAND_ROW_H : 0;
}

function Glyph({ m }: { m: LaneMark }) {
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
      className="pointer-events-auto absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--fg)]"
    />
  );
}

function NumberDisc({ n, emph }: { n: number; emph: boolean }) {
  return (
    <span
      className={cn(
        'mono ml-[2px] inline-flex size-[14px] shrink-0 items-center justify-center rounded-full text-[10px] leading-none font-bold',
        // 비강조 = 카드 바탕 + --muted-fg 테두리 — 두 테마 모두 글자 대비를 지킨다(회색 위 어두운 글자 금지).
        emph
          ? 'bg-[var(--fg)] text-[var(--card)]'
          : 'bg-[var(--card)] text-[var(--fg)] shadow-[inset_0_0_0_1px_var(--muted-fg)]',
      )}
    >
      {n}
    </span>
  );
}

export function LimitupLane({
  lane,
  plotHeight,
  ariaLabel,
  hl = null,
  onHl,
}: {
  lane: LaneEntry | LaneLock;
  /** 플롯(SVG) 높이 — 띠 · 눈금은 따로 붙는다. */
  plotHeight: number;
  ariaLabel: string;
  /** 강조 중인 사건 번호(카드가 사실 문장과 나눠 쓴다). */
  hl?: number | null;
  onHl?: (n: number | null) => void;
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
  const compact = w < COMPACT_W;

  const band = useMemo(() => {
    const items = lane.points.map((p) => ({ n: p.n, xPx: (p.x / 100) * w, text: compact ? '' : p.bandLabel }));
    const { rows, placed } = layoutEventBand(items, w);
    const byN = new Map(placed.map((p) => [p.n, p]));
    return { rows, byN };
  }, [lane, w, compact]);
  const bandH = eventBandHeight(band.rows);

  const lineLabels = useMemo(
    () =>
      lane.lines.map((l) => {
        const yPx = (l.y / 100) * plotHeight;
        const top =
          l.place === 'right-above'
            ? Math.max(0, yPx - LABEL_H - 1)
            : Math.min(plotHeight - LABEL_H, yPx + 2);
        return { ...l, top };
      }),
    [lane, plotHeight],
  );

  const captions = useMemo(
    () =>
      lane.windows.map((win) => {
        const cw = estimateLabelWidth(win.caption) + 4; // px-0.5 좌우 여백
        let left = (win.x / 100) * w + 3;
        if (left + cw > w) left = Math.max(0, w - cw);
        return { ...win, left, cw };
      }),
    [lane, w],
  );

  // 미잠김 단일가 캡션 — 회색 면 왼쪽 아래(단일가 동안 잔량이 쌓여 곡선은 위쪽에 있다) · 같은 줄의 창 캡션과 가로로
  // 겹치면 왼쪽 위로 올린다 · 면이 캡션보다 좁으면 생략(요약 aria 에는 남는다).
  const auctionCaptions = useMemo(() => {
    if (lane.kind !== 'lock') return [];
    return lane.auctions.flatMap((a, i) => {
      const cw = estimateLabelWidth(a.caption) + 4; // px-0.5 좌우 여백
      if ((a.w / 100) * w < cw) return [];
      let left = (a.x / 100) * w + 3;
      if (left + cw > w) left = Math.max(0, w - cw);
      const clash = captions.some((c) => left < c.left + c.cw + 4 && c.left < left + cw + 4);
      return [{ ...a, left, i, pos: clash ? ({ top: 2 } as const) : ({ bottom: 2 } as const) }];
    });
  }, [lane, w, captions]);

  const enter = (n: number) => () => onHl?.(n);
  const leave = () => onHl?.(null);

  const point = (p: LanePoint) => {
    const placed = band.byN.get(p.n);
    const on = hl === p.n;
    const xPx = (p.x / 100) * w;
    const yPx = (p.y / 100) * plotHeight;
    const badgeBottom = placed && placed.row >= 0 ? BADGE_TOP + placed.row * EVENT_BAND_ROW_H + BADGE_H : null;
    return (
      <span key={p.n} className="contents">
        {badgeBottom !== null && (
          <span
            data-slot="limitup-leader"
            style={{ left: xPx, top: badgeBottom - bandH, height: Math.max(0, yPx - (badgeBottom - bandH)) }}
            className={cn(
              'absolute w-0 border-l border-dashed',
              TONE_BORDER[p.tone],
              on ? 'opacity-90' : 'opacity-35',
            )}
          />
        )}
        <span
          data-slot="limitup-point"
          data-event-n={p.n}
          data-hl={on ? 'true' : undefined}
          style={{ left: xPx, top: yPx }}
          onMouseEnter={enter(p.n)}
          onMouseLeave={leave}
          className={cn(
            'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_1.5px_var(--card)]',
            TONE_BG[p.tone],
            p.emph ? 'size-2.5' : 'size-2',
            on && 'scale-150 ring-2 ring-[var(--fg)] ring-offset-1 ring-offset-[var(--card)]',
          )}
        />
        {placed && placed.row < 0 && (
          <span
            data-slot="limitup-point-n"
            style={{ left: xPx, top: yPx - 15 }}
            className={cn(
              'mono absolute -translate-x-1/2 rounded-[3px] bg-[color-mix(in_oklab,var(--card)_78%,transparent)] px-0.5 text-[10px] leading-none font-bold',
              TONE_TEXT[p.tone],
            )}
          >
            {p.n}
          </span>
        )}
      </span>
    );
  };

  return (
    <div data-slot="limitup-lane" data-kind={lane.kind} className="w-full">
      <div ref={boxRef} className="relative w-full" style={{ height: bandH + plotHeight }}>
        <div
          aria-hidden="true"
          data-slot="limitup-event-band"
          className="absolute inset-x-0 top-0"
          style={{ height: bandH }}
        >
          {lane.points.map((p) => {
            const placed = band.byN.get(p.n);
            if (!placed || placed.row < 0) return null;
            const on = hl === p.n;
            return (
              <span
                key={p.n}
                data-label={`event-${p.n}`}
                data-event-n={p.n}
                data-emph={p.emph ? 'true' : undefined}
                data-hl={on ? 'true' : undefined}
                title={p.bandLabel}
                onMouseEnter={enter(p.n)}
                onMouseLeave={leave}
                style={{ left: placed.left, top: BADGE_TOP + placed.row * EVENT_BAND_ROW_H, width: placed.width }}
                className={cn(
                  'absolute flex h-[17px] items-center gap-1 overflow-hidden rounded-full text-[11px] leading-none whitespace-nowrap',
                  on ? 'bg-[color-mix(in_oklab,var(--muted-fg)_30%,var(--muted))]' : 'bg-[var(--muted)]',
                )}
              >
                <NumberDisc n={p.n} emph={p.emph} />
                {!compact && (
                  <span className={cn(p.emph ? 'font-semibold text-[var(--fg)]' : 'text-[var(--fg-2)]')}>
                    {p.bandLabel}
                  </span>
                )}
              </span>
            );
          })}
        </div>

        <div className="absolute inset-x-0" style={{ top: bandH, height: plotHeight }}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel}
            className="absolute inset-0 block h-full w-full overflow-visible"
          >
            {lane.kind === 'lock' &&
              lane.auctions.map((s, i) => (
                <rect
                  key={`a${i}`}
                  data-slot="limitup-auction"
                  x={s.x}
                  y={0}
                  width={s.w}
                  height={100}
                  fill="var(--border-subtle)"
                />
              ))}
            {lane.kind === 'lock' &&
              lane.shades.map((s, i) => (
                <rect key={`s${i}`} x={s.x} y={0} width={s.w} height={100} fill="var(--muted)" />
              ))}
            {lane.windows.map((s, i) => (
              <rect key={`w${i}`} data-slot="limitup-window" x={s.x} y={0} width={s.w} height={100} fill="var(--accent)" />
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
            {lineLabels.map((l) => (
              <span
                key={l.kind}
                data-label={`line-${l.kind}`}
                style={
                  l.place === 'right-above' ? { right: 0, top: l.top } : { left: 0, top: l.top }
                }
                className={cn(
                  // 곡선 · 마커 위에서도 읽히게 반투명 카드 면을 깐다.
                  'absolute rounded-[2px] bg-[color-mix(in_oklab,var(--card)_78%,transparent)] px-0.5 text-[11px] leading-[14px] whitespace-nowrap',
                  l.kind === 'upper' ? 'text-[var(--muted-fg)]' : 'text-[var(--led-latent)]',
                )}
              >
                {l.label}
              </span>
            ))}
            {captions.map((c, i) => (
              <span
                key={i}
                data-label={`window-${i}`}
                style={{ left: c.left, bottom: 2 }}
                className="absolute rounded-[2px] bg-[color-mix(in_oklab,var(--card)_78%,transparent)] px-0.5 text-[11px] leading-[14px] whitespace-nowrap text-[var(--accent-fg)]"
              >
                {c.caption}
              </span>
            ))}
            {auctionCaptions.map((c) => (
              <span
                key={`a${c.i}`}
                data-label={`auction-${c.i}`}
                style={{ left: c.left, ...c.pos }}
                className="absolute rounded-[2px] bg-[color-mix(in_oklab,var(--card)_78%,transparent)] px-0.5 text-[11px] leading-[14px] whitespace-nowrap text-[var(--muted-fg)]"
              >
                {c.caption}
              </span>
            ))}
            {lane.marks.map((m, i) => (
              <Glyph key={i} m={m} />
            ))}
            {lane.points.map(point)}
          </div>
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
