'use client';

import { useMemo } from 'react';

import type { TickOpenResponse } from '@gh-radar/shared';

import type { CandleFrame } from '@/lib/ticks/candle-chart';
import {
  bucketMaxOfModel,
  cumNetRangeOf,
  cumPointsOf,
  cumStairsOf,
  dayNetRangeOf,
  marketCapOf,
  teamBucketsOf,
  teamDayStairsOf,
  yOfNet,
  type TurnoverPaths,
} from '@/lib/ticks/tick-chart';
import { pct1 } from '@/lib/ticks/tick-chart-tip';
import { fmtAmountC } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';

/**
 * 봉 차트 아래 세 판 층 (Phase 42 · D-07 · D-19 · UI-SPEC S7) — 순매수(70) · 10분(40) · 누적 거래대금(50)(폰 50 · 28 · 36).
 *
 * 선 차트(`tick-chart.tsx`)의 ②③④ 판과 **같은 함수**(`yOfNet` · `teamDayStairsOf` · `cumStairsOf` · `teamBucketsOf` ·
 * `turnoverPathsOf`)에 `CandlePanels`(`frame.P` — `TickPanels` 와 같은 키)를 넘겨 새 y 에서 그대로 그린다(`lib/ticks/tick-chart.ts`
 * 수정 0 · D-01). 넷째 판 경로(`turnoverPathsOf`)만은 호출부가 한 번 메모해 `tv` 로 넘긴다(값 점과 같은 결과 · 마우스 재렌더 무관).
 * 모양 · 색 · 굵기 · dasharray · 축 글자 · 판 제목 · 「팀 체결 없음」 은 선 차트 그대로이고 data-slot 만 `candle-` 접두.
 * 그림은 `[yRb, y4b]` 클립 안(수익률 판 아래부터), 축 · 제목 · 빈 상태 글자는 클립 밖. 당일 화면은 누적(pos_net)을 그리지 않는다(37 D-09).
 */

export interface CandleLowerLayersProps {
  frame: CandleFrame;
  session: TickSession;
  /** 틱 열기 응답 누적(pos_net — 과거 · 등록 종목만). */
  accum?: TickOpenResponse['accum'];
  isToday: boolean;
  /** 상장주식수 — 있으면 누적 거래대금 왼쪽 축 = 시총 대비 %. */
  listingShares: number | null;
  /** 넷째 판 경로 `turnoverPathsOf(turnoverSeriesOf(session), view, x, P, plotW, endMs)` — 호출부가 메모해 넘긴다(값 점과 공유). */
  tv: TurnoverPaths;
  /** 차트 고유 클립 id 접두. */
  clipId: string;
}

export function CandleLowerLayers({ frame, session, accum, isToday, listingShares, tv, clipId }: CandleLowerLayersProps) {
  const { P, L, xr, plotW, phone, view, x, bounds, endMs } = frame;
  const team = session.team;
  const noTeam = team.fills.length === 0;

  // 선 차트 383 ~ 413행 파생 계산 그대로 — 판 경계만 CandlePanels
  const m = useMemo(() => {
    const cumPts = cumPointsOf(accum, isToday);
    const hasCum = cumPts.length > 0;
    const dayRange = dayNetRangeOf(team);
    const yN = yOfNet(dayRange, P);
    const cumRange = cumNetRangeOf(cumPts);
    const yC = yOfNet(cumRange, P);
    const mcap = marketCapOf(session.basePx, listingShares);
    return {
      hasCum,
      dayRange,
      cumRange,
      zeroY: yN(0),
      dayD: teamDayStairsOf(team, x, yN, bounds.T0, endMs),
      dayBuyD: teamDayStairsOf(team, x, yN, bounds.T0, endMs, (st) => st.buy),
      daySellD: teamDayStairsOf(team, x, yN, bounds.T0, endMs, (st) => -st.sell),
      cumD: hasCum ? cumStairsOf(cumPts, x, yC, bounds.T0, bounds.T2000) : '',
      bars: teamBucketsOf(team, view, x, bounds.T0, P),
      bucketMax: bucketMaxOfModel(team),
      mcap,
    };
  }, [session, team, accum, isToday, listingShares, view, x, P, bounds.T0, bounds.T2000, endMs]);

  const { hasCum, dayRange, cumRange, zeroY, dayD, dayBuyD, daySellD, cumD, bars, bucketMax, mcap } = m;
  const fmtVal = (v: number) => (mcap === null ? fmtAmountC(v) : pct1(v / mcap));
  const midX = (L + xr) / 2;

  return (
    <g data-slot="candle-lower-layers">
      <defs>
        <clipPath id={`${clipId}-low`}>
          <rect x={L} y={P.yRb} width={plotW} height={P.y4b - P.yRb} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId}-low)`}>
        {/* ② 당일 팀 순매수 판 — 0선 · 누적 회색(아래) · 매수 누적 · 거울 매도 누적 · 당일 보라(맨 위) */}
        {!noTeam && (
          <line
            data-slot="candle-net-zero"
            x1={L}
            x2={xr}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--faint)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        )}
        {cumD !== '' && (
          <path
            data-slot="candle-cum-path"
            d={cumD}
            fill="none"
            stroke="var(--muted-fg)"
            strokeWidth={1}
            strokeOpacity={0.7}
            pointerEvents="none"
          />
        )}
        {!noTeam && dayBuyD !== '' && (
          <path
            data-slot="candle-day-buy-path"
            d={dayBuyD}
            fill="none"
            stroke="var(--up)"
            strokeWidth={1.15}
            strokeOpacity={0.85}
            pointerEvents="none"
          />
        )}
        {!noTeam && daySellD !== '' && (
          <path
            data-slot="candle-day-sell-path"
            d={daySellD}
            fill="none"
            stroke="var(--down)"
            strokeWidth={1.15}
            strokeOpacity={0.85}
            pointerEvents="none"
          />
        )}
        {dayD !== '' && (
          <path data-slot="candle-day-path" d={dayD} fill="none" stroke="var(--team)" strokeWidth={1.75} pointerEvents="none" />
        )}

        {/* ③ 10분 팀 매수/매도 막대 쌍 */}
        {bars.map((b) => (
          <g key={b.slot} data-slot="candle-bucket">
            {b.buy && <rect x={b.buy.x} y={b.buy.y} width={b.buy.w} height={b.buy.h} fill="var(--up)" fillOpacity={0.7} />}
            {b.sell && <rect x={b.sell.x} y={b.sell.y} width={b.sell.w} height={b.sell.h} fill="var(--down)" fillOpacity={0.7} />}
          </g>
        ))}

        {/* ④ 누적 거래대금 영역 · 누적 팀 비중 선 */}
        {tv.area !== '' && (
          <path data-slot="candle-turnover-area" d={tv.area} fill="var(--faint)" fillOpacity={0.45} pointerEvents="none" />
        )}
        {tv.share !== '' && (
          <path
            data-slot="candle-team-share-path"
            d={tv.share}
            fill="none"
            stroke="var(--team)"
            strokeWidth={1.75}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}
      </g>

      {/* ② 오른쪽 보라 축(당일 · 하루 범위) · 왼쪽 회색 축(누적 · pos_net 있을 때만) */}
      {!noTeam && (
        <g data-slot="candle-day-axis" fill="var(--team)" aria-hidden="true">
          <text x={xr + 4} y={P.y2a + 9}>
            {fmtAmountC(dayRange.max)}
          </text>
          {dayRange.min !== dayRange.max && (
            <text x={xr + 4} y={P.y2b - 1}>
              {fmtAmountC(dayRange.min)}
            </text>
          )}
        </g>
      )}
      {hasCum && (
        <g data-slot="candle-cum-axis" fill="var(--muted-fg)" aria-hidden="true">
          <text x={L - 4} y={P.y2a + 9} textAnchor="end">
            {fmtAmountC(cumRange.max)}
          </text>
          {cumRange.min !== cumRange.max && (
            <text x={L - 4} y={P.y2b - 1} textAnchor="end">
              {fmtAmountC(cumRange.min)}
            </text>
          )}
        </g>
      )}
      {bucketMax > 0 && (
        <text data-slot="candle-bucket-max" x={xr + 4} y={P.y3a + 9} fill="var(--muted-fg)" aria-hidden="true">
          {fmtAmountC(bucketMax)}
        </text>
      )}
      {tv.area !== '' && (
        <g data-slot="candle-turnover-axis" fill="var(--muted-fg)" aria-hidden="true">
          <text x={L - 4} y={P.y4a + 9} textAnchor="end">
            {fmtVal(tv.valHi)}
          </text>
          <text x={L - 4} y={P.y4b - 1} textAnchor="end">
            {fmtVal(tv.valLo)}
          </text>
        </g>
      )}
      {tv.share !== '' && (
        <g data-slot="candle-share-axis" fill="var(--team)" aria-hidden="true">
          <text x={xr + 4} y={P.y4a + 9}>
            {Math.round(tv.shareTop * 100)}%
          </text>
          <text x={xr + 4} y={P.y4b - 1}>
            0%
          </text>
        </g>
      )}
      {noTeam && (
        <g data-slot="candle-lower-empty" fill="var(--muted-fg)" aria-hidden="true">
          <text x={midX} y={(P.y2a + P.y2b) / 2 + 4} textAnchor="middle">
            팀 체결 없음
          </text>
          <text x={midX} y={(P.y3a + P.y3b) / 2 + 4} textAnchor="middle">
            팀 체결 없음
          </text>
        </g>
      )}

      {/* 판 제목(데스크톱만 · 폰은 생략 — 스케치 019) */}
      {!phone && (
        <g data-slot="candle-lower-title" fontWeight={600} aria-hidden="true">
          <text x={L + 4} y={P.y2a + 10} fill="var(--team)">
            당일 팀 순매수
            <tspan fill="var(--fg-2)" fontWeight={400}>
              {' · '}
              <tspan fill="var(--up)">매수</tspan>
              {' · '}
              <tspan fill="var(--down)">매도(0선 아래)</tspan> 누적 · 오른쪽 축
            </tspan>
            {hasCum && (
              <tspan fill="var(--muted-fg)" fontWeight={400}>
                {' '}
                · 누적(이월 포함 · 왼쪽 회색 축)
              </tspan>
            )}
          </text>
          <text x={L + 4} y={P.y3a + 10} fill="var(--fg-2)">
            10분 팀 매수 / 매도
          </text>
          <text x={L + 4} y={P.y4a + 10} fill="var(--fg-2)">
            누적 거래대금{mcap !== null ? '(왼쪽 축 = 시총 대비)' : ''} ·{' '}
            <tspan fill="var(--team)">누적 팀 비중(오른쪽 축)</tspan>
          </text>
        </g>
      )}
    </g>
  );
}
