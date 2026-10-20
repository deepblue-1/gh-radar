'use client';

import { Component, Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { AccumDetailResponse, AccumDetailRow, AccumReportPayload, TeamflowPnl } from '@gh-radar/shared';

import { DmaGate, type DmaGateReason } from '@/components/trading/dma-gate';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api';
import { fetchAccumDetail, readAccumDetailCache } from '@/lib/accum-api';
import { useChartView } from '@/hooks/use-chart-view';
import { dayBoundsOf, fmtViewRange, lastTradeMsOf, type ChartPreset } from '@/lib/accum-chart';
import {
  ACCUM_LOAD_HM,
  ACCUM_RULE_LINES,
  ACCUM_RULE_SOURCE,
  cycleRowsOf,
  detailKpisOf,
  payloadOf,
  thresholdPartsOf,
} from '@/lib/accum-report';
import { fmtYmdShort } from '@/lib/limitup-report';
import { TONE_TEXT, fmtEok, fmtPnl, isNum, pnlOf, toneOf } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

import { AccumChart } from './accum-chart';
import { AccumCycleTable } from './accum-cycle-table';
import { TeamflowToggle } from './teamflow-toggle';

/**
 * 매집감지 펼친 상세 셸 (Phase 34 · UI-SPEC A4 상세 셸 · A5 KPI 줄 · D-06 · D-18 · D-19).
 *
 * - 루트 `section#ac-{isin}` · `aria-labelledby` = 행 버튼 id(`labelledBy` — 부모 DayGrid 가 `accumRowButtonId` 로 준다 ·
 *   import 순환을 피하려 prop 으로 받는다) · 열린 행 바로 아래에만 마운트된다(접으면 언마운트).
 * - **지연 로드(D-06):** 마운트 때 `fetchAccumDetail(date, isin)`. 캐시(`accum-detail:{date}:{isin}` · 30분 · 행 있는 응답만)에 있으면 첫 렌더부터
 *   그 값으로 그린다(재펼침 = 요청 0 · 스켈레톤 깜빡임 없음). 언마운트 뒤 도착한 응답은 setState 하지 않는다(캐시에만 남는다).
 * - 상태: 로딩 = 실제 배치 높이 스켈레톤(KPI 줄 → 범례 → 프리셋 → 차트 472 · 사이 8px) + sr 전용 「상세 불러오는 중…」 /
 *   실패 = 「상세를 불러오지 못했어요」 + 「다시 시도」(재요청 · 실패는 캐시하지 않는다) / 401 · 403 · `{access:false}` = 상세 자리
 *   `DmaGate`(페이지 전체는 그대로) / `row: null` = 「이 종목 상세를 찾지 못했어요」(재시도 없음) / 준비 = 차트 블록.
 * - 차트 블록 `flex flex-col gap-2` = KPI 줄 → 범례(8 · 견본 span aria-hidden) → 프리셋 줄(「전체 · 정규장 · 마지막 2시간」
 *   `aria-pressed` + 창 범위 「HH:MM ~ HH:MM」) → 차트(창 = `useChartView`) → 캡션(34-07 · A5 · D-14 · D-18).
 *   `price.idx` 가 비면(또는 payload 없음) 범례 ~ 캡션 대신 한 줄 「그날 체결 자료 없음」 — KPI 줄은 남는다.
 * - 준비 본문 순서(D-19 · 블록 사이 16px = 루트 `gap-4`): 차트 블록 → 사이클 표(`cycles.length >= 2` 만 · 기본 펼침 · D-20) →
 *   팀 당일 손익 줄(`accum-pnl` · D-21 · pnl null = 「팀 체결 없음」) → 「판정 기준」 접힘(`accum-rules` · 기본 접힘 · 닫히면
 *   언마운트 · D-22) → 상세 맨 끝 출처 칩(`accum-detail-source` · 머리 칩과 같은 모양 · kind 16 과 join 하지 않는다).
 *   가격 자료가 없어도 사이클 표 · 손익 · 판정 기준 · 출처 칩은 그대로다. 상세 안에서 `<i>` 를 쓰지 않는다(33-05 결정).
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'gate'; reason: DmaGateReason }
  | { kind: 'missing' }
  | { kind: 'ready'; row: AccumDetailRow };

function phaseOf(resp: AccumDetailResponse): Phase {
  if (!resp.access) return { kind: 'gate', reason: 'unmapped' };
  return resp.row === null ? { kind: 'missing' } : { kind: 'ready', row: resp.row };
}

/** 캐시에 있으면 첫 렌더부터 그 값 — 재펼침에 스켈레톤이 번쩍이지 않게. */
function initialPhase(date: string, isin: string): Phase {
  const hit = readAccumDetailCache(date, isin);
  return hit === undefined ? { kind: 'loading' } : phaseOf(hit);
}

export function AccumDetail({ date, isin, labelledBy }: { date: string; isin: string; labelledBy: string }) {
  const [phase, setPhase] = useState<Phase>(() => initialPhase(date, isin));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchAccumDetail(date, isin).then(
      (resp) => {
        if (alive) setPhase(phaseOf(resp));
      },
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          setPhase({ kind: 'gate', reason: err.status === 401 ? 'unauthenticated' : 'unmapped' });
          return;
        }
        setPhase({ kind: 'error' });
      },
    );
    return () => {
      alive = false;
    };
  }, [date, isin, attempt]);

  const retry = () => {
    setPhase({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  return (
    <section
      id={`ac-${isin}`}
      aria-labelledby={labelledBy}
      data-slot="accum-detail"
      className="flex flex-col gap-4 px-2 pt-1 pb-6"
    >
      {phase.kind === 'loading' && (
        <div data-slot="accum-detail-skeleton" className="flex flex-col gap-2">
          <p role="status" aria-live="polite" className="sr-only">
            상세 불러오는 중…
          </p>
          <Skeleton className="h-[18px] w-2/3" />
          <div className={LEGEND_ROW}>
            {LEGEND.map((l) => (
              <Skeleton key={l.label} className="h-[18px]" style={{ width: `${l.label.length * 12 + 14}px` }} />
            ))}
          </div>
          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <Skeleton key={p.name} className="h-8 w-16 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-[472px] w-full rounded-[var(--r)]" />
        </div>
      )}

      {phase.kind === 'error' && (
        <div role="alert" className="flex flex-col items-center gap-1 py-8 text-center">
          <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">상세를 불러오지 못했어요</p>
          <button
            type="button"
            onClick={retry}
            className="min-h-8 text-[length:var(--t-caption)] font-semibold text-[var(--accent-fg)] hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {phase.kind === 'gate' && <DmaGate reason={phase.reason} surface="매집감지 보고서" />}

      {phase.kind === 'missing' && (
        <div data-slot="accum-detail-missing" className="flex flex-col items-center gap-1 py-8 text-center">
          <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">
            이 종목 상세를 찾지 못했어요
          </p>
          <p className="text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)]">
            보고서가 다시 올라왔을 수 있어요. 페이지를 새로고침해 주세요
          </p>
        </div>
      )}

      {phase.kind === 'ready' && (
        <DetailBoundary>
          <ReadyBody row={phase.row} />
        </DetailBoundary>
      )}
    </section>
  );
}

/**
 * 준비 본문 렌더 예외를 상세 자리에서 멈춘다(34 WR-05) — 없으면 `app/error.tsx` 가 페이지 전체(목록 포함)를 바꾼다.
 * payload 는 검증 없는 export 원문이라 `payloadOf` 가 못 거른 모양이 남을 수 있다. 같은 자료라 다시 그려도 같으므로 재시도 없음.
 * 행을 접으면 상세가 언마운트되어 경계도 같이 초기화된다.
 */
class DetailBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(err: unknown): void {
    console.error('accum detail render failed', err);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" data-slot="accum-detail-crash" className="flex flex-col items-center gap-1 py-8 text-center">
        <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">상세를 불러오지 못했어요</p>
      </div>
    );
  }
}

/** 준비 상태 본문(D-19) — 차트 블록 → (사이클 표 · 2개↑) → 손익 줄 → 판정 기준 → 출처 칩. */
function ReadyBody({ row }: { row: AccumDetailRow }) {
  const cycles = cycleRowsOf(row);
  return (
    <>
      <div data-slot="accum-chart-block" className="flex flex-col gap-2">
        <div
          data-slot="accum-kline"
          className="flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--t-caption)]"
        >
          {detailKpisOf(row).map((k) => (
            <span key={k.label} data-slot="accum-kline-item" className="inline-flex items-baseline gap-1 whitespace-nowrap">
              <span className="text-[var(--muted-fg)]">{k.label}</span>
              <span className={cn('mono font-semibold', k.tone ? TONE_TEXT[k.tone] : 'text-[var(--fg)]')}>{k.text}</span>
            </span>
          ))}
        </div>
        <ReadyChart row={row} />
      </div>
      {cycles.length >= 2 && <AccumCycleTable rows={cycles} count={cycles.length} />}
      <PnlLine pnl={pnlOf(row.payload)} />
      <div data-slot="accum-rules">
        <TeamflowToggle label="판정 기준" tone="muted">
          <ul className="m-0 list-disc space-y-1 pl-4 text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)]">
            <li>
              {thresholdPartsOf(row).map((p, i) =>
                p.num ? (
                  <span key={i} className="mono whitespace-nowrap text-[var(--fg-2)]">
                    {p.text}
                  </span>
                ) : (
                  <Fragment key={i}>{p.text}</Fragment>
                ),
              )}
            </li>
            {ACCUM_RULE_LINES.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[length:var(--t-caption)] text-[var(--muted-fg)]">{ACCUM_RULE_SOURCE}</p>
        </TeamflowToggle>
      </div>
      <span
        data-slot="accum-detail-source"
        className="inline-flex items-center self-start rounded-[var(--r-sm)] bg-[var(--muted)] px-2 py-0.5 text-[length:var(--t-caption)] whitespace-nowrap text-[var(--muted-fg)]"
      >
        KYOBO119 판정 기준 · {fmtYmdShort(row.date)} {ACCUM_LOAD_HM} 적재
      </span>
    </>
  );
}

const SUBHEAD = 'm-0 text-[length:var(--t-sm)] font-semibold text-[var(--fg)]';
const PNL_CAPTION =
  '그날 하루 팀 주문 기준(등록 전 · 상한가 가격 포함) · 출처 모를 매도(전날 이전 보유분 추정)는 손익 제외';

const fmtShares = (n: number | null | undefined) => (isNum(n) ? `${n.toLocaleString('ko-KR')}주` : '—');

/** 손익 줄 항목 — 라벨 `--muted-fg` + 값 `mono`(기본 `--fg-2`) · teamflow-pnl 문법. */
function PnlItem({ label, tone, children }: { label: string; tone?: string; children: string }) {
  return (
    <span data-slot="accum-pnl-item" className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[var(--muted-fg)]">{label}</span>
      <span className={cn('mono', tone ?? 'text-[var(--fg-2)]')}>{children}</span>
    </span>
  );
}

/**
 * 팀 당일 손익 줄(D-21 · UI-SPEC A8) — teamflow-pnl 동형(면 상자 없음): 소제목 + 합계(억 2자리 · 수익률 · 부호 색) →
 * 항목 4(실현 · 평가 · 보유 · 출처 모를 매도 — D-21 라벨 · UI-SPEC Discretion 2) → 캡션. pnl null = 소제목 + 「팀 체결 없음」 만.
 */
function PnlLine({ pnl }: { pnl: TeamflowPnl | null }) {
  return (
    <section data-slot="accum-pnl" className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className={SUBHEAD}>팀 당일 손익</h3>
        {pnl === null ? (
          <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">팀 체결 없음</span>
        ) : (
          <span
            data-slot="accum-pnl-total"
            className={cn('mono text-[length:var(--t-sm)] font-semibold', TONE_TEXT[toneOf(pnl.total_val, 2)])}
          >
            {fmtPnl(pnl)}
          </span>
        )}
      </div>
      {pnl !== null && (
        <>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--t-caption)]">
            <PnlItem label="실현" tone={TONE_TEXT[toneOf(pnl.realized_val, 2)]}>
              {fmtEok(pnl.realized_val, { signed: true, digits: 2 })}
            </PnlItem>
            <PnlItem label="평가" tone={TONE_TEXT[toneOf(pnl.unrealized_val, 2)]}>
              {fmtEok(pnl.unrealized_val, { signed: true, digits: 2 })}
            </PnlItem>
            <PnlItem label="보유">{fmtShares(pnl.end_qty)}</PnlItem>
            <PnlItem label="출처 모를 매도">{fmtShares(pnl.unknown_sell_qty)}</PnlItem>
          </div>
          <p className="m-0 mt-1 text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)]">{PNL_CAPTION}</p>
        </>
      )}
    </section>
  );
}

const PRESETS: readonly { name: ChartPreset; label: string }[] = [
  { name: 'full', label: '전체' },
  { name: 'reg', label: '정규장' },
  { name: 'last2h', label: '마지막 2시간' },
];

const CAPTION =
  '원 = 1천만원 이상 팀 주문 + 사이클마다 첫 팀 매수(크기 = 금액) · 15:30~16:00 은 체결 없음(정상) · 휠·두 손가락 = 확대/축소 · 끌기 = 이동';

/** 범례 줄 배치 — 로딩 스켈레톤도 같은 줄바꿈으로 높이를 잡는다(34 UI 리뷰). */
const LEGEND_ROW = 'flex flex-wrap gap-x-3 gap-y-1';

/** 범례 견본(UI-SPEC A5) — 상세 안에서 `<i>` 를 쓰지 않는다(33-05 결정). */
const DOT = 'inline-block size-2.5 rounded-full';
const HLINE = 'inline-block h-0.5 w-2.5 rounded-full';
const VLINE = 'inline-block h-2.5 w-0.5';
const LEGEND: readonly { label: string; swatch: string }[] = [
  { label: '가격(10초)', swatch: `${HLINE} bg-[var(--fg-2)]` },
  { label: '팀 매수', swatch: `${DOT} bg-[var(--up)] opacity-70` },
  { label: '팀 매도', swatch: `${DOT} bg-[var(--down)] opacity-70` },
  { label: '팀매수 시작', swatch: `${DOT} border-2 border-[var(--fg)] bg-[var(--up)]` },
  { label: '순매수 누적', swatch: `${HLINE} bg-[var(--team)]` },
  { label: '등록', swatch: `${VLINE} bg-[var(--team)]` },
  { label: '청산·종료', swatch: 'inline-block h-2.5 w-0 border-l-2 border-dashed border-[var(--muted-fg)]' },
  { label: '등록 전', swatch: 'inline-block size-2.5 border border-[var(--border-subtle)] bg-[var(--accum-shade)]' },
];

/** KPI 줄 아래 차트 블록 나머지 — 가격 자료가 없거나 payload 모양이 어긋나면(`payloadOf` · WR-05) 한 줄 대체. */
function ReadyChart({ row }: { row: AccumDetailRow }) {
  const payload = payloadOf(row);
  if (payload === null || payload.price.idx.length === 0) {
    return (
      <p data-slot="accum-no-price" className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
        그날 체결 자료 없음
      </p>
    );
  }
  return <ChartBody row={row} payload={payload} />;
}

function ChartBody({ row, payload }: { row: AccumDetailRow; payload: AccumReportPayload }) {
  const t0ms = payload.price.t0_ms;
  const bounds = useMemo(() => dayBoundsOf(t0ms), [t0ms]);
  const lastTradeMs = lastTradeMsOf(payload.price);
  const ctl = useChartView({ bounds, lastTradeMs });
  const noTeam = payload.day_cum_net.t_ms.length === 0;

  return (
    <>
      <div
        data-slot="accum-legend"
        className={cn(LEGEND_ROW, 'text-[length:var(--t-caption)] text-[var(--muted-fg)]')}
      >
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1 whitespace-nowrap">
            <span aria-hidden="true" className={l.swatch} />
            {l.label}
          </span>
        ))}
      </div>
      <div data-slot="accum-presets" className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => {
          const on = ctl.preset === p.name;
          return (
            <button
              key={p.name}
              type="button"
              aria-pressed={on}
              disabled={p.name === 'last2h' && lastTradeMs === null}
              onClick={() => ctl.setPreset(p.name)}
              className={cn(
                'min-h-8 rounded-full px-3 text-[length:var(--t-caption)] font-semibold disabled:cursor-not-allowed disabled:opacity-50',
                on
                  ? 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]'
                  : 'bg-[var(--muted)] text-[var(--fg-2)] hover:bg-[var(--raised-2)]',
              )}
            >
              {p.label}
            </button>
          );
        })}
        <span
          data-slot="accum-view-range"
          className="mono ml-auto text-[length:var(--t-caption)] text-[var(--muted-fg)]"
        >
          {fmtViewRange(ctl.view)}
        </span>
      </div>
      <AccumChart row={row} payload={payload} view={ctl.view} ctl={ctl} />
      <p data-slot="accum-caption" className="text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)]">
        {noTeam ? `팀 체결 없음 · ${CAPTION}` : CAPTION}
      </p>
    </>
  );
}
