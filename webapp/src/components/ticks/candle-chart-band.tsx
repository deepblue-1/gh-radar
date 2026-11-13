import type { CandleBand } from '@/lib/ticks/candle-readout';
import { pct1, pct2 } from '@/lib/ticks/tick-chart-tip';
import { fmtAmountC, fmtQty, fmtRet, fmtSignedAmountC } from '@/lib/ticks/tick-format';
import { kstHm } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

import { Head, Kv, Rest, Row } from './tick-chart-band';

/**
 * Phase 42 봉 차트 값 띠 A(D-20 · UI-SPEC S8) — 제목 줄 바로 아래 · 높이 고정 4칸(봉 | 당일 팀 | 10분 | 누적).
 * 마우스 = 그 시각 · 떼면 현재 틱(첫 칸 머리 글자 `--fg`). 값은 `candleBandAt`(lib/ticks/candle-readout.ts).
 *
 * - 높이는 값 · 상태 · 이동평균 개수와 무관하게 같다: 데스크톱 88(위아래 5 + 머리 14 + 4줄 × 16) · 폰 137(첫 행 84 + 둘째 행 52 + 경계 1).
 * - 글자 크기 · 굵기는 선 차트 띠 부품(`Head` · `Row` · `Kv` · `Rest`)을 그대로 쓴다 — 새 크기 없음(UI-SPEC Typography).
 * - 셋째 「10분」 · 넷째 「누적」 칸은 `tick-chart-band.tsx` 마크업을 같은 클래스로 복제(함수로 떼어져 있지 않다).
 * - 둘째 칸 수익률 글자는 팀 거래정보 패널과 같은 함수 `fmtRet`(`lib/ticks/tick-format.ts` — 패널과 비트까지 같은 글자 · SC-4).
 * - 마우스 이동마다 낭독이 넘치므로 `aria-live` 는 달지 않는다(선 차트와 같음).
 */

/** 값 띠 높이(px) — 차트 카드 배치가 쓴다. */
export const CANDLE_BAND_H = { desktop: 88, phone: 137 } as const;

const DASH = '—';
const INT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

const sgnCls = (v: number) => (v > 0 ? 'text-[var(--up)]' : v < 0 ? 'text-[var(--down)]' : 'text-[var(--muted-fg)]');
const retCls = (v: number | null) => (v === null ? undefined : sgnCls(v));

export interface CandleChartBandProps {
  /** 그 시각 값 — 커서가 없으면 null(같은 칸 · 같은 높이에 「—」). */
  band: CandleBand | null;
  /** 마우스 · 터치가 없음 = 현재 틱. */
  live: boolean;
  phone: boolean;
}

export function CandleChartBand({ band, live, phone }: CandleChartBandProps) {
  const cell = (i: number) =>
    cn(
      'min-w-0 overflow-hidden border-[var(--border-subtle)]',
      phone ? 'px-3 py-[3px]' : 'px-3 py-[5px]',
      i > 0 && 'border-l',
      phone && i === 2 && 'border-l-0',
      phone && i >= 2 && 'border-t',
    );
  const b = band;
  const k = b?.candle ?? null;
  const t = b?.tick ?? null;
  const headLabel = b === null ? '봉' : k === null ? `${b.unit}분봉` : `${b.unit}분봉 ${kstHm(k.start)}`;

  return (
    <div
      data-slot="candle-chart-band"
      data-live={live ? '1' : undefined}
      data-dims={phone ? 'phone' : 'desktop'}
      className={cn(
        'grid border-b border-[var(--border-subtle)] text-[11.5px] leading-[14px] tabular-nums',
        phone ? 'h-[137px] grid-cols-2 grid-rows-[84px_52px]' : 'h-[88px] grid-cols-[1.5fr_1.6fr_1fr_1.1fr]',
      )}
    >
      {/* 봉 */}
      <div data-slot="candle-band-cell" data-cell="candle" className={cell(0)}>
        <Head color="var(--fg-2)" em={t?.clock}>
          <span data-slot="candle-band-head" className={cn('truncate', live && 'text-[var(--fg)]')}>
            {headLabel}
          </span>
        </Head>
        <Row>
          {k === null ? (
            <Rest>{DASH}</Rest>
          ) : (
            <>
              <Kv className="text-[12px] text-[var(--fg)]">{INT.format(k.c)}</Kv>
              {k.chgPct !== null && <Kv className={sgnCls(k.chgPct)}>{pct2(k.chgPct)}</Kv>}
              <Kv label="거래대금">{fmtAmountC(k.amt)}</Kv>
            </>
          )}
        </Row>
        {b !== null && k !== null && (
          <>
            <Row>
              <Kv label="시">{INT.format(k.o)}</Kv>
              <Kv label="고">{INT.format(k.h)}</Kv>
              <Kv label="저">{INT.format(k.l)}</Kv>
            </Row>
            {b.ma.length > 0 && (
              <div
                data-slot="candle-band-ma"
                className="mt-0.5 flex h-8 min-w-0 flex-wrap content-start gap-x-2.5 gap-y-0.5 overflow-hidden whitespace-nowrap"
              >
                {b.ma.map((m) => {
                  const val = m.v === null ? DASH : INT.format(m.v);
                  return (
                    <span
                      key={m.key}
                      data-slot="candle-band-ma-item"
                      title={phone ? m.name : undefined}
                      aria-label={phone ? `${m.name} ${val}` : undefined}
                      className="inline-flex min-w-0 items-center gap-[3px]"
                    >
                      <i
                        aria-hidden="true"
                        className="inline-block h-[2px] w-2.5 shrink-0 rounded-full"
                        style={{ background: `var(--ma-${m.color})` }}
                      />
                      <Kv label={phone ? undefined : m.name}>{val}</Kv>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* 당일 팀 */}
      <div data-slot="candle-band-cell" data-cell="team" className={cell(1)}>
        <Head color="var(--team)">당일 팀</Head>
        <Row>
          {b === null || t === null ? (
            <Rest>{DASH}</Rest>
          ) : !t.hasTeam ? (
            <Rest>팀 체결 없음</Rest>
          ) : (
            <>
              <Kv label="순" className="text-[var(--team)]">
                {fmtSignedAmountC(t.dayNet)}
              </Kv>
              <Kv label="매수" className="text-[var(--up)]">
                {fmtAmountC(t.dayBuy)}
              </Kv>
              <Kv label="매도" className="text-[var(--down)]">
                {fmtAmountC(t.daySell)}
              </Kv>
            </>
          )}
        </Row>
        {b !== null && t !== null && (
          <>
            <Row>
              <Kv label="평단">{b.avgPx !== null ? INT.format(Math.round(b.avgPx)) : DASH}</Kv>
              <Kv label="수익률" className={retCls(b.ret)}>
                <span data-slot="candle-band-ret">{fmtRet(b.ret)}</span>
              </Kv>
            </Row>
            {t.hasCum && (
              <Row>
                <Kv label="누적(이월 포함)">{t.cum === null ? DASH : fmtSignedAmountC(t.cum)}</Kv>
              </Row>
            )}
            {b.hasCumAvg && (
              <Row>
                <Kv label="누적 평단">{b.cumAvg !== null ? INT.format(Math.round(b.cumAvg)) : DASH}</Kv>
                <Kv label="누적 수익률" className={retCls(b.cumRet)}>
                  {fmtRet(b.cumRet)}
                </Kv>
              </Row>
            )}
          </>
        )}
      </div>

      {/* 10분 — tick-chart-band.tsx 와 같은 마크업 · 같은 클래스 */}
      <div data-slot="candle-band-cell" data-cell="slot" className={cell(2)}>
        <Head color="var(--faint)" em={t?.slotLabel}>
          10분
        </Head>
        {t === null ? (
          <Row>
            <Rest>—</Rest>
          </Row>
        ) : t.slotBuy > 0 || t.slotSell > 0 ? (
          <>
            <Row>
              <Kv label="매수" className="text-[var(--up)]">
                {fmtAmountC(t.slotBuy)}
              </Kv>
              <Kv label="매도" className="text-[var(--down)]">
                {fmtAmountC(t.slotSell)}
              </Kv>
            </Row>
            <Row>
              <Kv label="순" className={sgnCls(t.slotBuy - t.slotSell)}>
                {fmtSignedAmountC(t.slotBuy - t.slotSell)}
              </Kv>
            </Row>
          </>
        ) : (
          <Row>
            <Rest>팀 체결 없음</Rest>
          </Row>
        )}
      </div>

      {/* 누적 — tick-chart-band.tsx 와 같은 마크업 · 같은 클래스 */}
      <div data-slot="candle-band-cell" data-cell="turnover" className={cell(3)}>
        <Head color="var(--faint)">누적</Head>
        {t === null || t.tv === null ? (
          <Row>
            <Rest>—</Rest>
          </Row>
        ) : (
          <>
            <Row>
              <Kv label="거래대금">{fmtAmountC(t.tv)}</Kv>
              {t.capRatio !== null && <Kv label="시총">{pct1(t.capRatio)}</Kv>}
            </Row>
            <Row>
              <Kv label="팀" className="text-[var(--team)]">
                {pct1(t.share ?? 0)}
              </Kv>
              <Kv label="거래량">{`${fmtQty(t.vol ?? 0)}주`}</Kv>
            </Row>
          </>
        )}
      </div>
    </div>
  );
}
