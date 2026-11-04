import type { ReactNode } from 'react';

import { kstClock } from '@/lib/limitup-report';
import { fmtRangeDur, pct1, pct2, type TickRangeSum } from '@/lib/ticks/tick-chart-tip';
import { fmtAmountC, fmtSignedAmountC } from '@/lib/ticks/tick-format';
import { cn } from '@/lib/utils';

/**
 * 틱뷰어 타임라인 구간 결과 줄(스케치 028 ③ · 목업 `.rng` · 2026-11-04 채택) — 데스크톱 Shift+끌기로 고른 구간의
 * 팀 매수 · 매도(건수) · 순매수 + 구간 거래대금 · 팀 비중 · 가격 첫 → 끝. 차트 **아래**에만 붙어서 손을 떼도 차트가 밀리지 않는다.
 * 기준은 팀 체결 조각 수신 시각(10분 막대 · 넷째 판과 같은 수 — `tickRangeSumOf`).
 */

const INT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

const sgnCls = (v: number) => (v > 0 ? 'text-[var(--up)]' : v < 0 ? 'text-[var(--down)]' : 'text-[var(--muted-fg)]');

export interface TickChartRangeProps {
  sum: TickRangeSum;
  /** 끄는 중 — 「끄는 중…」(지우기 버튼 대신). */
  dragging: boolean;
  onClear: () => void;
}

function Big({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-[var(--muted)] px-2.5 py-1.5">
      <dt className="text-[10.5px] text-[var(--muted-fg)]">{label}</dt>
      <dd className={cn('mono m-0 truncate text-[16px] leading-[1.25] font-semibold', className)}>{children}</dd>
    </div>
  );
}

export function TickChartRange({ sum: r, dragging, onClear }: TickChartRangeProps) {
  return (
    <div data-slot="tick-chart-range" className="border-t border-[var(--border-subtle)] px-3 pt-2 pb-2.5 tabular-nums">
      <div className="flex items-baseline gap-2 text-[12px]">
        <b className="font-bold">
          구간 {kstClock(r.t0)} ~ {kstClock(r.t1)}
        </b>
        <small className="mono text-[11px] text-[var(--muted-fg)]">{fmtRangeDur(r.t1 - r.t0)}</small>
        {dragging ? (
          <small className="ml-auto text-[11px] text-[var(--primary)]">끄는 중…</small>
        ) : (
          <button
            type="button"
            data-slot="tick-chart-range-clear"
            className="ml-auto rounded-full bg-[var(--muted)] px-[9px] py-0.5 text-[11px] text-[var(--fg-2)] hover:bg-[var(--border-subtle)]"
            onClick={onClear}
          >
            ✕ 지우기 (Esc)
          </button>
        )}
      </div>
      <dl className="m-0 mt-1.5 grid grid-cols-3 gap-2">
        <Big label="팀 매수" className="text-[var(--up)]">
          {fmtAmountC(r.buy)}
          <small className="ml-1 text-[11px] font-normal text-[var(--muted-fg)]">{r.nBuy}건</small>
        </Big>
        <Big label="팀 매도" className="text-[var(--down)]">
          {fmtAmountC(r.sell)}
          <small className="ml-1 text-[11px] font-normal text-[var(--muted-fg)]">{r.nSell}건</small>
        </Big>
        <Big label="팀 순매수" className={sgnCls(r.net)}>
          {fmtSignedAmountC(r.net)}
        </Big>
      </dl>
      <div className="mt-1.5 text-[11px] text-[var(--muted-fg)]">
        구간 거래대금 <b className="mono font-semibold text-[var(--fg-2)]">{fmtAmountC(r.tv)}</b>
        {r.share !== null && (
          <>
            {' · 팀 비중 '}
            <b className="mono font-semibold text-[var(--team)]">{pct1(r.share)}</b>
          </>
        )}
        {r.px0 !== null && r.px1 !== null && (
          <>
            {' · 가격 '}
            <b className="mono font-semibold text-[var(--fg-2)]">
              {INT.format(r.px0)} → {INT.format(r.px1)}
            </b>
            {r.chgPct !== null && (
              <>
                {' ('}
                <span className={sgnCls(r.chgPct)}>{pct2(r.chgPct)}</span>
                {')'}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
