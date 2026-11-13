'use client';

import { useMemo } from 'react';

import { fmtTickTime, memberTableAt, type TickOpenResponse } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { teamKpiAt } from '@/lib/ticks/team-model';
import { cumPointsOf, msOfNs } from '@/lib/ticks/tick-chart';
import { MINUS, fmtAmountC, fmtQty, fmtRet, fmtSignedAmountC } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';
import { cn } from '@/lib/utils';

/**
 * 틱 뷰어 「팀 거래정보」 패널 (Phase 37 D-10 · D-11 · D-12 · D-13 · 스케치 019 오른쪽 열 셋째 카드).
 *
 * ① KPI(D-10) — A3 평균단가법을 **선택 틱까지**(`teamKpiAt` = shared `fillsUpTo` + `pnlAt`): 당일 팀 순매수(금액 · 수량) ·
 *   누적(이월 포함 · pos_net 있을 때만 — 커서 시각 이하 마지막 점 · D-09) · 당일 평단(잔량 0 이면 「—」) · 평단 대비 수익률
 *   (`(실현 + 미실현) ÷ 매수 금액` = TeamPnl.ret · 부호 색) · 실현/미실현 작은 글자. 단일가 제외 · 상한가 가격 포함.
 * ② 5창구 표(D-11) — 선택 틱 시점(수신순) 마지막 B9 그대로(`memberTableAt`). 상위 5 밖은 「—」 · 배분 · 추정 없음.
 *   캡션 「B9 HH:MM:SS 기준 · ≈1분 해상도」 — 위 KPI(틱마다)와 해상도가 다르다는 것을 보인다.
 * ③ 캡션(D-12) 「우리 체결 포함 · 호가 걸어 둔 팀 주문 미포함(최소치)」 · NXT 면 「NXT 런 규칙(한 가격 2조각 이상) · KRX 와 합산
 *   안 함」(D-13).
 */

export interface TickTeamPanelProps {
  session: TickSession;
  cursorRec: number;
  /** 열기 응답 `accum`(pos_net — 누적 칸 · D-09). */
  accum?: TickOpenResponse['accum'];
  /** 당일 화면 — 누적 칸 없음(D-09). */
  isToday?: boolean;
  className?: string;
}

const DASH = '—';
const INT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

/** 부호 색 — 양수 --up · 음수 --down · 0 --flat. */
function signColor(v: number | null): string {
  if (v === null || v === 0) return 'text-[var(--flat)]';
  return v > 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
}

/** 부호 붙인 수량(+ / −). */
function signedQty(v: number): string {
  if (v === 0) return '0';
  return v > 0 ? `+${fmtQty(v)}` : `${MINUS}${fmtQty(-v)}`;
}

function Kpi({ label, value, sub, slot, color }: { label: string; value: string; sub?: string; slot: string; color?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] text-[var(--muted-fg)]">{label}</dt>
      <dd data-slot={slot} className={cn('mono m-0 truncate text-[13px] font-semibold', color ?? 'text-[var(--fg)]')}>
        {value}
      </dd>
      {sub !== undefined && (
        <dd data-slot={`${slot}-sub`} className="mono m-0 truncate text-[10.5px] text-[var(--muted-fg)]">
          {sub}
        </dd>
      )}
    </div>
  );
}

export function TickTeamPanel({ session, cursorRec, accum = null, isToday = false, className }: TickTeamPanelProps) {
  const kpi = teamKpiAt(session.team, session, cursorRec);
  const cumPts = useMemo(() => cumPointsOf(accum, isToday), [accum, isToday]);
  const cursorMs = cursorRec >= 0 ? msOfNs(session.index.recvNs[cursorRec]!) : null;

  // 누적 — 커서 시각 이하 마지막 pos_net 점(점이 시각순이라 뒤에서 찾는다)
  let cum: number | null = null;
  if (cumPts.length > 0 && cursorMs !== null) {
    for (let i = cumPts.length - 1; i >= 0; i--) {
      if (cumPts[i]!.t <= cursorMs) {
        cum = cumPts[i]!.net;
        break;
      }
    }
  }

  const b9Rec = cursorRec >= 0 ? session.lastB9[session.recvPos[cursorRec]!]! : -1;
  const table = useMemo(() => memberTableAt(session.buf, session.index, b9Rec), [session, b9Rec]);

  const { pnl } = kpi;
  const ret = pnl?.ret ?? null;
  const nxt = session.ex === 'NXT';

  return (
    <section
      data-slot="tick-team-panel"
      aria-label="팀 거래정보"
      className={cn(CARD, 'flex min-w-0 flex-col overflow-hidden', className)}
    >
      <div className="flex flex-none items-baseline gap-2 border-b border-[var(--border-subtle)] px-3 py-[9px]">
        <h2 className="m-0 text-[12.5px] font-bold text-[var(--fg)]">팀 거래정보</h2>
        <small className="truncate text-[11px] text-[var(--muted-fg)]">선택 틱까지 · 평균단가법</small>
      </div>

      <div className="px-3 pt-2.5 pb-3">
        <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2">
          <Kpi
            label="당일 팀 순매수"
            slot="tick-team-day-net"
            value={kpi.k === 0 ? DASH : fmtSignedAmountC(kpi.dayNetVal)}
            sub={kpi.k === 0 ? undefined : `${signedQty(kpi.dayNetQty)}주`}
            color={kpi.k === 0 ? undefined : signColor(kpi.dayNetVal)}
          />
          {cumPts.length > 0 ? (
            <Kpi
              label="누적(이월 포함)"
              slot="tick-team-cum"
              value={cum === null ? DASH : fmtSignedAmountC(cum)}
              color={signColor(cum)}
            />
          ) : (
            <Kpi label="누적" slot="tick-team-cum-none" value={DASH} sub={isToday ? '당일 — 누적 선 없음' : '매집감지 미등록'} />
          )}
          <Kpi
            label="당일 평단"
            slot="tick-team-avg"
            value={kpi.avgPx === null ? DASH : `${INT.format(Math.round(kpi.avgPx))}원`}
            sub={pnl === null ? undefined : `잔량 ${fmtQty(pnl.end_qty)}주`}
          />
          <Kpi
            label="평단 대비 수익률"
            slot="tick-team-ret"
            value={fmtRet(ret)}
            color={signColor(ret)}
            sub={
              pnl === null
                ? undefined
                : `실현 ${fmtSignedAmountC(pnl.realized_val)} · 미실현 ${fmtSignedAmountC(pnl.unrealized_val)}`
            }
          />
        </dl>

        {table !== null && (
          <table data-slot="tick-team-members" className="mt-3 w-full table-fixed border-collapse text-[11.5px]">
            <caption className="sr-only">팀 5창구 거래원(마지막 B9)</caption>
            <thead>
              <tr className="text-[10.5px] text-[var(--muted-fg)]">
                <th scope="col" className="w-[44px] py-1 text-left font-medium">
                  창구
                </th>
                <th scope="col" className="py-1 text-right font-medium text-[var(--up)]">
                  매수
                </th>
                <th scope="col" className="py-1 text-right font-medium text-[var(--up)]">
                  금액
                </th>
                <th scope="col" className="py-1 text-right font-medium text-[var(--down)]">
                  매도
                </th>
                <th scope="col" className="py-1 text-right font-medium text-[var(--down)]">
                  금액
                </th>
              </tr>
            </thead>
            <tbody className="mono">
              {table.rows.map((r) => (
                <tr key={r.member} data-member={r.member} className="border-t border-[var(--border-subtle)]">
                  <th scope="row" className="py-1 text-left font-semibold text-[var(--fg)]">
                    {r.label}
                  </th>
                  <td className="truncate py-1 text-right">{r.buy === null ? DASH : fmtQty(r.buy.qty)}</td>
                  <td className="truncate py-1 text-right">{r.buy === null ? DASH : fmtAmountC(r.buy.value)}</td>
                  <td className="truncate py-1 text-right">{r.sell === null ? DASH : fmtQty(r.sell.qty)}</td>
                  <td className="truncate py-1 text-right">{r.sell === null ? DASH : fmtAmountC(r.sell.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {table === null && (
          <p data-slot="tick-team-members-empty" className="m-0 py-2 text-center text-[12px] text-[var(--muted-fg)]">
            아직 B9 없음
          </p>
        )}

        <div data-slot="tick-team-caption" className="mt-2 space-y-0.5 text-[10.5px] leading-snug text-[var(--muted-fg)]">
          <p className="m-0">
            {table === null ? 'B9 없음' : `B9 ${fmtTickTime(table.recvNs).slice(0, 8)} 기준`} · ≈1분 해상도
          </p>
          <p className="m-0">우리 체결 포함 · 호가 걸어 둔 팀 주문 미포함(최소치)</p>
          {nxt && <p className="m-0">NXT 런 규칙(한 가격 2조각 이상) · KRX 와 합산 안 함</p>}
        </div>
      </div>
    </section>
  );
}
