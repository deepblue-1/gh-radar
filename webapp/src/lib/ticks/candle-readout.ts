import type { TickOpenResponse } from '@gh-radar/shared';

import type { PricePoint } from '@/lib/accum-chart';

import { candleIdxAt, type CandleUnit, type Candles } from './candle-chart';
import type { CandleMaValue, MaStatus } from './candle-ma';
import { cumAvgAt } from './candle-returns';
import { teamKpiAt } from './team-model';
import { tickBandAt, type TickBand, type TickBandSource } from './tick-chart-tip';
import type { TickSession } from './tick-session';

/**
 * Phase 42 — 봉 차트 값 띠(A 4칸 · D-20) 값과 카드 아래 캡션 글자(D-17 · UI-SPEC S8 · S9).
 *
 * - 첫 칸 「봉」: 시각 t 가 든 봉(`candleIdxAt`)의 시 · 고 · 저 · 종 · 거래대금 · 기준가 대비 등락률 + 켜진 이동평균의 그 봉 값.
 * - 둘째 칸 「평단 · 수익률」 은 **패널과 같은 `teamKpiAt` 쌍**(Q3 · D-14 · SC-4) — 현재 틱일 때 띠 수익률 글자 = 팀 거래정보 패널.
 *   가격 판 당일 평단 점점선(`teamAvgPathOf`)과는 드물게 다를 수 있다(RESEARCH Pitfall 7 — 같은 수신 시각 여러 rec 의 자르기 순서).
 * - 둘째 칸 「누적 평단 · 누적 수익률」(D-15): 그 시각 누적 평단(`cumAvgAt`) · (그 시각 가격 − 누적 평단) ÷ 누적 평단(미실현만).
 * - 1줄 팀 · 누적(이월 포함) · 셋째 「10분」 · 넷째 「누적」 칸은 선 차트 띠 `tickBandAt` 그대로(같은 값 · 정의 복제 없음).
 */

/** 값 띠 입력 — 세션(팀 KPI) · 그 단위 봉 · 켜진 이동평균(칩 순서) · 누적 평단 점 · 선 차트 띠 입력. */
export interface CandleBandSrc {
  session: TickSession;
  candles: Candles;
  ma: readonly CandleMaValue[];
  cumAvg: readonly PricePoint[];
  tick: TickBandSource;
}

/** 값 띠 한 시각의 값 — 모르는 값은 null(띠에는 「—」). 비율(ret · cumRet)은 0.032 = +3.2%. */
export interface CandleBand {
  /** 선 차트 띠 값(1줄 팀 · 누적(이월 포함) · 셋째 · 넷째 칸). */
  tick: TickBand;
  unit: CandleUnit;
  /** 그 시각이 든 봉 — 빈 분 · 첫 봉 앞 · 마지막 봉 뒤면 null. chgPct = 기준가 대비 %(기준가 없으면 null). */
  candle: { start: number; o: number; h: number; l: number; c: number; amt: number; chgPct: number | null } | null;
  /** 켜진 이동평균(칩 순서) — v = 그 봉 값(봉 없음 · 값 없음 → null). */
  ma: { key: string; name: string; color: number; v: number | null }[];
  /** 팀 평단 · 수익률 = `teamKpiAt(team, session, rec)` 의 `avgPx` · `pnl.ret`(rec −1 · 첫 매수 전 → null). */
  avgPx: number | null;
  ret: number | null;
  /** 누적 평단 점이 있나(없으면 넷째 줄 비움). */
  hasCumAvg: boolean;
  cumAvg: number | null;
  cumRet: number | null;
}

/** 값 띠 값 — 시각 t(마우스 = 그 시각 · 떼면 현재 틱) · rec(팀 KPI 를 자를 커서 rec · 없으면 −1). */
export function candleBandAt(src: CandleBandSrc, t: number, rec: number): CandleBand {
  const { session, candles: cs, ma, cumAvg, tick: tickSrc } = src;
  const tick = tickBandAt(tickSrc, t);

  const i = candleIdxAt(cs, t);
  const basePx = tickSrc.basePx;
  const candle =
    i < 0
      ? null
      : {
          start: cs.t0[i]!,
          o: cs.o[i]!,
          h: cs.h[i]!,
          l: cs.l[i]!,
          c: cs.c[i]!,
          amt: cs.amt[i]!,
          chgPct: basePx !== null && basePx > 0 ? ((cs.c[i]! - basePx) / basePx) * 100 : null,
        };
  const maOut = ma.map((m) => {
    const v = i < 0 ? Number.NaN : (m.values[i] ?? Number.NaN);
    return { key: m.key, name: m.name, color: m.color, v: Number.isFinite(v) ? v : null };
  });

  const kpi = teamKpiAt(session.team, session, rec);

  const hasCumAvg = cumAvg.length > 0;
  const ca = hasCumAvg ? cumAvgAt(cumAvg, t) : null;
  const cumRet = ca !== null && tick.px !== null ? (tick.px - ca) / ca : null;

  return {
    tick,
    unit: cs.unit,
    candle,
    ma: maOut,
    avgPx: kpi.avgPx,
    ret: kpi.pnl?.ret ?? null,
    hasCumAvg,
    cumAvg: ca,
    cumRet,
  };
}

/** 캡션 입력 — 열기 응답 accum · 당일 화면 · pos_net 점 있음 · NXT 화면 · 칩 순서 선 상태(꺼진 선 제외는 호출부 몫). */
export interface CandleCaptionInput {
  accum: TickOpenResponse['accum'] | null | undefined;
  isToday: boolean;
  hasCum: boolean;
  nxt: boolean;
  ma: readonly { name: string; status: MaStatus }[];
}

/** 일별 종가 실패 안내 — 일 선이 여럿이어도 한 번(UI-SPEC Copywriting Error state). */
const DAY_FETCH_ERROR = '일 이동평균 — 일별 종가를 불러오지 못했어요(화면을 다시 열면 다시 불러와요)';

/**
 * 카드 아래 캡션 글자(UI-SPEC S9 문구 정본) — 순서 = 누적 캡션 → 선을 못 그림 안내(입력 순서).
 * 당일 화면은 누적 캡션이 없다 · `loading` · `ok` 선은 안내가 없다(받는 동안 「모자라」 가 잘못 뜨지 않게 — E6 플래너 가정).
 */
export function candleCaptionOf(input: CandleCaptionInput): string[] {
  const out: string[] = [];
  if (!input.isToday) {
    if (input.accum === null || input.accum === undefined) out.push('누적 자료 없음(매집감지 미등록)');
    else if (!input.hasCum) out.push('누적 자료 없음(매집감지 포지션 없음)');
    else out.push(`누적 = 매집감지 보고서 값 · 우리 체결 제외${input.nxt ? ' · KRX+NXT 합산' : ''}`);
  }
  let dayErr = false;
  for (const m of input.ma) {
    if (m.status === 'short-days') out.push(`${m.name} — 지난 거래일 종가가 모자라 그리지 않아요`);
    else if (m.status === 'short-bars') out.push(`${m.name} — 이 봉 단위로는 봉이 모자라 그리지 않아요`);
    else if (m.status === 'error' && !dayErr) {
      dayErr = true;
      out.push(DAY_FETCH_ERROR);
    }
  }
  return out;
}
