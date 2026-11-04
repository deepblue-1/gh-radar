import type { ReactNode } from 'react';

import { pct1, pct2, type TickBand } from '@/lib/ticks/tick-chart-tip';
import { fmtAmountC, fmtQty, fmtSignedAmountC } from '@/lib/ticks/tick-format';
import { cn } from '@/lib/utils';

/**
 * 틱뷰어 타임라인 고정 띠 B(스케치 028 ① · 2026-11-04 채택) — 카드 머리 바로 아래 · 차트 위 높이 고정 4칸
 * (가격 | 당일 팀 | 10분 | 누적). 마우스가 그림 영역 위면 그 시각 값, 벗어나면 현재 틱 값(첫 칸 제목 「현재 틱」).
 *
 * 높이는 값 · 상태 · 폭과 무관하게 같다(데스크톱 58 한 줄 · 폰 2×2 각 52) — 마우스를 움직여도 차트가 흔들리지 않는 것이 요점.
 * 넘치는 값은 칸 안에서 잘린다. 마우스 이동마다 낭독이 넘치므로 aria-live 는 달지 않는다.
 */

const INT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

const sgnCls = (v: number) => (v > 0 ? 'text-[var(--up)]' : v < 0 ? 'text-[var(--down)]' : 'text-[var(--muted-fg)]');

function Head({ color, children, em }: { color: string; children: ReactNode; em?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-[5px] text-[10.5px] font-bold whitespace-nowrap text-[var(--muted-fg)]">
      <i aria-hidden="true" className="inline-block size-[7px] shrink-0 rounded-[2px]" style={{ background: color }} />
      {children}
      {em !== undefined && <span className="mono ml-auto truncate font-normal">{em}</span>}
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 flex min-w-0 gap-x-2.5 overflow-hidden whitespace-nowrap">{children}</div>;
}

/** 라벨 + 값 한 쌍(라벨 10.5px --muted-fg · 값 mono 11px). */
function Kv({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <span className="truncate">
      {label !== undefined && <span className="mr-[3px] text-[10.5px] text-[var(--muted-fg)]">{label}</span>}
      <b className={cn('mono text-[11px] font-semibold', className)}>{children}</b>
    </span>
  );
}

const Rest = ({ children }: { children: ReactNode }) => (
  <span className="truncate text-[var(--muted-fg)]">{children}</span>
);

export interface TickChartBandProps {
  /** 그 시각 값 — 커서가 없으면 null(같은 칸 · 같은 높이에 「—」). */
  band: TickBand | null;
  /** 마우스 · 터치가 없음 = 현재 틱. */
  live: boolean;
  phone: boolean;
}

export function TickChartBand({ band, live, phone }: TickChartBandProps) {
  const cell = (i: number) =>
    cn(
      'min-w-0 overflow-hidden border-[var(--border-subtle)]',
      phone ? 'px-3 py-[3px]' : 'px-3 py-[5px]',
      i > 0 && 'border-l',
      phone && i === 2 && 'border-l-0',
      phone && i >= 2 && 'border-t',
    );
  const b = band;

  return (
    <div
      data-slot="tick-chart-band"
      data-live={live ? '1' : undefined}
      data-dims={phone ? 'phone' : 'desktop'}
      className={cn(
        'grid border-b border-[var(--border-subtle)] text-[11.5px] leading-[14px] tabular-nums',
        phone ? 'h-[105px] grid-cols-2 grid-rows-[52px_52px]' : 'h-[58px] grid-cols-[1.05fr_1.6fr_1.15fr_1.3fr]',
      )}
    >
      {/* 가격 */}
      <div data-slot="tick-band-cell" data-cell="price" className={cell(0)}>
        <Head color="var(--fg-2)" em={b?.clock}>
          {live ? <span className="font-bold text-[var(--fg)]">현재 틱</span> : '가격'}
        </Head>
        <Row>
          {b === null || b.px === null ? (
            <Rest>—</Rest>
          ) : (
            <>
              <Kv className="text-[12px] text-[var(--fg)]">{INT.format(b.px)}</Kv>
              {b.chgPct !== null && <Kv className={sgnCls(b.chgPct)}>{pct2(b.chgPct)}</Kv>}
            </>
          )}
        </Row>
        {b !== null && (
          <Row>
            <Kv label="평단">{b.avg !== null ? INT.format(Math.round(b.avg)) : '—'}</Kv>
            {b.avgDiffPct !== null && <Kv className={sgnCls(b.avgDiffPct)}>{pct2(b.avgDiffPct)}</Kv>}
          </Row>
        )}
      </div>

      {/* 당일 팀 */}
      <div data-slot="tick-band-cell" data-cell="team" className={cell(1)}>
        <Head color="var(--team)">당일 팀</Head>
        <Row>
          {b === null ? (
            <Rest>—</Rest>
          ) : !b.hasTeam ? (
            <Rest>팀 체결 없음</Rest>
          ) : (
            <>
              <Kv label="순" className="text-[var(--team)]">
                {fmtSignedAmountC(b.dayNet)}
              </Kv>
              <Kv label="매수" className="text-[var(--up)]">
                {fmtAmountC(b.dayBuy)}
              </Kv>
              <Kv label="매도" className="text-[var(--down)]">
                {fmtAmountC(b.daySell)}
              </Kv>
            </>
          )}
        </Row>
        {b !== null && b.hasCum && (
          <Row>
            <Kv label="누적(이월 포함)">{b.cum === null ? '—' : fmtSignedAmountC(b.cum)}</Kv>
          </Row>
        )}
      </div>

      {/* 10분 */}
      <div data-slot="tick-band-cell" data-cell="slot" className={cell(2)}>
        <Head color="var(--faint)" em={b?.slotLabel}>
          10분
        </Head>
        {b === null ? (
          <Row>
            <Rest>—</Rest>
          </Row>
        ) : b.slotBuy > 0 || b.slotSell > 0 ? (
          <>
            <Row>
              <Kv label="매수" className="text-[var(--up)]">
                {fmtAmountC(b.slotBuy)}
              </Kv>
              <Kv label="매도" className="text-[var(--down)]">
                {fmtAmountC(b.slotSell)}
              </Kv>
            </Row>
            <Row>
              <Kv label="순" className={sgnCls(b.slotBuy - b.slotSell)}>
                {fmtSignedAmountC(b.slotBuy - b.slotSell)}
              </Kv>
            </Row>
          </>
        ) : (
          <Row>
            <Rest>팀 체결 없음</Rest>
          </Row>
        )}
      </div>

      {/* 누적 */}
      <div data-slot="tick-band-cell" data-cell="turnover" className={cell(3)}>
        <Head color="var(--faint)">누적</Head>
        {b === null || b.tv === null ? (
          <Row>
            <Rest>—</Rest>
          </Row>
        ) : (
          <>
            <Row>
              <Kv label="거래대금">{fmtAmountC(b.tv)}</Kv>
              {b.capRatio !== null && <Kv label="시총">{pct1(b.capRatio)}</Kv>}
            </Row>
            <Row>
              <Kv label="팀" className="text-[var(--team)]">
                {pct1(b.share ?? 0)}
              </Kv>
              <Kv label="거래량">{`${fmtQty(b.vol ?? 0)}주`}</Kv>
            </Row>
          </>
        )}
      </div>
    </div>
  );
}
