'use client';

import type { ReactNode } from 'react';

import { CandleMaChips } from '@/components/ticks/candle-ma-chips';
import { CandleUnitMenu } from '@/components/ticks/candle-unit-menu';
import type { CandleUnit } from '@/lib/ticks/candle-chart';
import type { CandleUnitPref, MaConfig } from '@/lib/ticks/candle-prefs';

/**
 * 봉 차트 제목 줄 (Phase 42 · D-05 · D-21 · UI-SPEC S4).
 *
 * - 데스크톱 = 한 줄 `flex-wrap`(선 차트 제목 줄 클래스 상속): 「타임라인」 → 스위치 → 봉 단위 버튼 → [「이동평균」 + 칩 + 「＋」]
 *   → 우리 범례(`ownLegend`) → `ml-auto` [창 폭 글자 + 확대 버튼 5개]. 칩이 많아 넘치면 우리 범례 · 확대 묶음이 다음 줄로.
 *   선 차트의 긴 범례 글자 · 누적 범례는 두지 않는다(판 제목 SVG · 카드 아래 캡션이 맡는다).
 * - 폰 = 칩 수와 무관하게 언제나 두 줄(D-21 · 채택 목업 B): 첫 줄 「타임라인」 → 스위치 → `ml-auto` 확대 버튼 5개
 *   (창 폭 글자는 숨김 — 아래 시각 눈금이 창을 말한다 · 360 에서 넘치면 확대 묶음만 다음 줄) / 둘째 줄 봉 단위 버튼 → 칩 줄(가로 밀기) → 「＋」.
 *   우리 범례는 폰 제목 줄에 두지 않는다(카드 아래 줄로 옮김 — 결선 42-10).
 * - 확대 버튼 이름은 선 차트와 같다(「확대」 · 「축소」 · 「전체」 · 「1분」 · 「10초」) — 같은 이름으로 찾는 조작 · 테스트가 두 차트에서 같게 돈다.
 * - `phone` 은 측정 폭(차트가 넘긴다). 상태 · 저장은 받지 않는다 — 값과 콜백만(결선 42-10).
 */

export interface CandleChartTitleProps {
  /** 측정 폭이 폰인가. */
  phone: boolean;
  /** 「선 차트 | 봉 차트」 스위치 노드(뷰어의 `titleAddon(phone)`). */
  kindSwitch: ReactNode;
  unitPref: CandleUnitPref;
  currentUnit: CandleUnit;
  onUnit: (unit: CandleUnitPref) => void;
  ma: MaConfig;
  onMa: (cfg: MaConfig) => void;
  /** 우리 범례(「◆ 우리 체결 · ○ 조건 근거」)를 그릴까 — 데스크톱만. */
  ownLegend: boolean;
  /** 창 폭 글자(「2.0시간」) — 데스크톱만. */
  spanLabel: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFull: () => void;
  onMinute: () => void;
  onTenSec: () => void;
}

/** 선 차트(`tick-chart.tsx`) 확대 버튼 `btn` 문자열 그대로. */
const BTN_DESKTOP =
  'rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--fg-2)] hover:bg-[var(--muted)] focus-visible:bg-[var(--muted)]';
/** 폰 터치 — 높이 32 · 최소 폭 28 · 사이 0. */
const BTN_PHONE =
  'h-8 min-w-7 px-1 rounded-full text-[12px] font-semibold text-[var(--fg-2)] hover:bg-[var(--muted)] focus-visible:bg-[var(--muted)]';

function ZoomButtons({ p, cls }: { p: CandleChartTitleProps; cls: string }) {
  return (
    <>
      <button type="button" className={cls} aria-label="확대" title="확대 (+)" onClick={p.onZoomIn}>
        ＋
      </button>
      <button type="button" className={cls} aria-label="축소" title="축소 (−)" onClick={p.onZoomOut}>
        －
      </button>
      <button type="button" className={cls} title="하루 전체 (0)" onClick={p.onFull}>
        전체
      </button>
      <button type="button" className={cls} onClick={p.onMinute}>
        1분
      </button>
      <button type="button" className={cls} onClick={p.onTenSec}>
        10초
      </button>
    </>
  );
}

const TITLE_H2 = <h2 className="m-0 text-[12.5px] font-bold text-[var(--fg)]">타임라인</h2>;

export function CandleChartTitle(p: CandleChartTitleProps) {
  if (p.phone) {
    return (
      <div
        data-slot="candle-chart-title"
        data-dims="phone"
        className="grid gap-y-1 border-b border-[var(--border-subtle)] px-3 py-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          {TITLE_H2}
          {p.kindSwitch}
          <span className="ml-auto flex items-center">
            <ZoomButtons p={p} cls={BTN_PHONE} />
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <CandleUnitMenu value={p.unitPref} current={p.currentUnit} onChange={p.onUnit} phone className="shrink-0" />
          <CandleMaChips config={p.ma} onChange={p.onMa} phone />
        </div>
      </div>
    );
  }

  return (
    <div
      data-slot="candle-chart-title"
      data-dims="desktop"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--border-subtle)] px-3 py-[7px]"
    >
      {TITLE_H2}
      {p.kindSwitch}
      <CandleUnitMenu value={p.unitPref} current={p.currentUnit} onChange={p.onUnit} phone={false} />
      <CandleMaChips config={p.ma} onChange={p.onMa} phone={false} />
      {p.ownLegend && (
        // 우리 범례(선 차트와 같은 마크업) — ◆ = 45° 돌린 채운 작은 정사각 · ○ = 테두리 원 · 민트
        <span data-slot="candle-chart-own-legend" className="flex items-center gap-2 text-[11px] text-[var(--mine-fg)]">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <i aria-hidden="true" className="inline-block size-[7px] rotate-45 rounded-[1px] bg-[var(--mine)]" />
            우리 체결
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <i aria-hidden="true" className="inline-block size-2 rounded-full border-[1.5px] border-[var(--mine)]" />
            조건 근거
          </span>
        </span>
      )}
      <span className="ml-auto flex items-center gap-0.5">
        <span data-slot="candle-chart-span" className="mono px-1.5 text-[11px] text-[var(--muted-fg)]">
          {p.spanLabel}
        </span>
        <ZoomButtons p={p} cls={BTN_DESKTOP} />
      </span>
    </div>
  );
}
