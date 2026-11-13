'use client';

import { useMemo } from 'react';

import type { CandleFrame } from '@/lib/ticks/candle-chart';
import { fmtReturnTick, returnPathOf, type ReturnPoint, type ReturnScales } from '@/lib/ticks/candle-returns';

/**
 * 봉 차트 수익률 판 층 (Phase 42 · D-12 ~ D-15 · D-17 · UI-SPEC S6) — 그리기만 한다(계산은 `lib/ticks/candle-returns.ts`).
 *
 * 자리: 가격 판 바로 아래 `[yRa, yRb]`(데스크톱 50 · 폰 36). 아래 → 위(판 클립 안): 0% 선 하나(`--faint` "2 3" · 두 눈금 공유 ·
 * `scales.zeroY`) → 누적 수익률(`--muted-fg` 1.5 · 왼쪽 눈금 · 미실현만 · `px` 0 구간 끊김) → 당일 수익률(`--team` 1.75 · 오른쪽 눈금 ·
 * 패널 「평단 대비 수익률」 과 같은 값 · 팀 첫 매수 전 없음). 클립 밖: 눈금 글자(위 끝 `판 위 + 9` · 아래 끝 `판 아래 − 1` 값 하나씩) ·
 * 판 제목(데스크톱만) · 그날 팀 체결이 하나도 없고(`noTeam` — 아래 판과 같은 하루 기준) 누적도 없으면 판 가운데 「팀 체결 없음」.
 * 팀이 그날 체결했지만 창 안이 팀 첫 매수 전이면 빈 판(0% 선만)이다 — 「팀 체결 없음」 을 쓰지 않는다.
 * 호출부(42-10)는 `day` · `scales` 를 보기 창 안 점으로 만든다(`dayReturnPointsOf` 는 창 밖 커서 rec 점도 넣는다 — 42-02 계약 메모).
 * 선과 오른쪽 눈금 글자가 같은 창 안 점을 쓴다 — 창 밖 커서 점까지 잇는 사선 · 그 점 하나로 눈금만 뜨는 일이 없다.
 */

export interface CandleReturnLayerProps {
  frame: CandleFrame;
  /** 당일 수익률 점 — 눈금을 만든 창 안 점(`dayReturnPointsOf` 에서 창 밖 커서 점을 뺀 것). 선 · 오른쪽 눈금 글자가 같은 점을 쓴다. */
  day: readonly ReturnPoint[];
  /** 그날 팀 체결이 하나도 없다(`session.team.fills.length === 0`) — 빈 상태 글자 기준(아래 판과 같은 하루 판정). */
  noTeam: boolean;
  /** 누적 수익률 점(`cumReturnPointsOf` — 누적 없으면 []). */
  cum: readonly ReturnPoint[];
  /** 두 눈금(`returnScalesOf`). */
  scales: ReturnScales;
  /** 차트 고유 클립 id 접두. */
  clipId: string;
}

const hasValue = (pts: readonly ReturnPoint[]) => pts.some((p) => p.v !== null && Number.isFinite(p.v));

export function CandleReturnLayer({ frame, day, noTeam, cum, scales, clipId }: CandleReturnLayerProps) {
  const { P, L, xr, plotW, phone, x } = frame;
  const hasDay = hasValue(day);
  const yCum = scales.yCum;
  const hasCum = yCum !== null && hasValue(cum);

  const dayD = useMemo(() => (hasDay ? returnPathOf(day, x, scales.yDay) : ''), [hasDay, day, x, scales.yDay]);
  const cumD = useMemo(() => (hasCum && yCum !== null ? returnPathOf(cum, x, yCum) : ''), [hasCum, cum, x, yCum]);

  return (
    <g data-slot="candle-return-layer">
      <defs>
        <clipPath id={`${clipId}-ret`}>
          <rect x={L} y={P.yRa} width={plotW} height={P.yRb - P.yRa} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId}-ret)`}>
        <line
          data-slot="candle-ret-zero"
          x1={L}
          x2={xr}
          y1={scales.zeroY}
          y2={scales.zeroY}
          stroke="var(--faint)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        {cumD !== '' && (
          <path
            data-slot="candle-ret-cum"
            d={cumD}
            fill="none"
            stroke="var(--muted-fg)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}
        {dayD !== '' && (
          <path
            data-slot="candle-ret-day"
            d={dayD}
            fill="none"
            stroke="var(--team)"
            strokeWidth={1.75}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}
      </g>

      {/* 오른쪽 보라 눈금(당일) · 왼쪽 회색 눈금(누적 있을 때만) — 위 끝 · 아래 끝 값 하나씩 */}
      {hasDay && (
        <g data-slot="candle-ret-day-axis" fill="var(--team)" aria-hidden="true">
          <text x={xr + 4} y={P.yRa + 9}>
            {fmtReturnTick(scales.dayTop)}
          </text>
          <text x={xr + 4} y={P.yRb - 1}>
            {fmtReturnTick(scales.dayBottom)}
          </text>
        </g>
      )}
      {hasCum && scales.cumTop !== null && scales.cumBottom !== null && (
        <g data-slot="candle-ret-cum-axis" fill="var(--muted-fg)" aria-hidden="true">
          <text x={L - 4} y={P.yRa + 9} textAnchor="end">
            {fmtReturnTick(scales.cumTop)}
          </text>
          <text x={L - 4} y={P.yRb - 1} textAnchor="end">
            {fmtReturnTick(scales.cumBottom)}
          </text>
        </g>
      )}

      {noTeam && !hasCum && (
        <text
          data-slot="candle-ret-empty"
          x={(L + xr) / 2}
          y={(P.yRa + P.yRb) / 2 + 4}
          textAnchor="middle"
          fill="var(--muted-fg)"
          fontWeight={400}
          aria-hidden="true"
        >
          팀 체결 없음
        </text>
      )}

      {/* 판 제목(데스크톱만 · 폰은 생략 — 스케치 019) */}
      {!phone && (
        <text data-slot="candle-ret-title" x={L + 4} y={P.yRa + 10} fill="var(--team)" fontWeight={600} aria-hidden="true">
          팀 당일 수익률(오른쪽 눈금)
          {hasCum && <tspan fill="var(--muted-fg)">{' · 누적 수익률(미실현 · 왼쪽 눈금)'}</tspan>}
        </text>
      )}
    </g>
  );
}
