'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  LAUNCH_ORDER,
  type LaunchFire,
  type LaunchOrdersResponse,
  type LaunchPieceRow,
  type LimitupDate,
} from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchLaunchOrders } from '@/lib/launch-api';
import {
  DASH,
  brokerMarketLabelOf,
  fireLegLabelOf,
  fmtAcceptTime,
  fmtUs,
  launchHeadCardOf,
  orderTabPiecesOf,
  pieceKeyLabelOf,
  resultToneOf,
  sideLabelOf,
  type LaunchHeadCardModel,
  type LaunchResultCounts,
} from '@/lib/launch-format';
import { dateNavOf } from '@/lib/limitup-report';
import { cn } from '@/lib/utils';

import { LimitupDateNav } from '../analytics/limitup-date-nav';

/**
 * 주문 내역 탭 (Phase 35 · D-12 · D-13 · D-14 · 채택 목업 변형 A).
 *
 * - `LaunchOrdersTab` = 받기 · 상태(accum-report 의 alive effect 꼴). `d` 가 바뀔 때만 다시 받는다 — 세그먼트(16:00 / 09:00:30)
 *   전환은 같은 응답을 다시 거른다(한 응답에 그날 발사가 다 있다).
 * - `LaunchOrdersView` = 순수 렌더. 컨트롤 줄(날짜 알약 · 세그먼트 · 출처 칩) → 머리 카드 4장(LAUNCH_ORDER 순 · 발사 없는
 *   조합은 빈 카드) → 발사 있는 조합만 서버 · 시장별 조각 표.
 * - 폰 390: 카드 1열 · 조각 표는 자기 래퍼(`launch-pieces` · overflow-x-auto) 안에서만 가로 스크롤 · 부모 `min-w-0` 으로
 *   페이지는 넓어지지 않는다(lessons 2026-09-07).
 * - 계좌 · 사용자는 마스킹하지 않는다(D-02 어드민 전용 예외). null 칸은 전부 「—」.
 */

export interface LaunchOrdersTabProps {
  d: LimitupDate | null;
  fire: LaunchFire;
  onGoDate: (d: LimitupDate) => void;
  onFire: (f: LaunchFire) => void;
  onLatest: () => void;
}

type Phase = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; resp: LaunchOrdersResponse };

export function LaunchOrdersTab({ d, fire, onGoDate, onFire, onLatest }: LaunchOrdersTabProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [dates, setDates] = useState<readonly LimitupDate[]>([]);

  useEffect(() => {
    let alive = true;
    setPhase({ kind: 'loading' });
    fetchLaunchOrders(d ?? undefined).then(
      (resp) => {
        if (!alive) return;
        setDates(resp.dates);
        setPhase({ kind: 'ready', resp });
      },
      () => {
        if (alive) setPhase({ kind: 'error' });
      },
    );
    return () => {
      alive = false;
    };
  }, [d, attempt]);

  return (
    <LaunchOrdersView
      status={phase.kind}
      resp={phase.kind === 'ready' ? phase.resp : null}
      dates={dates}
      d={d}
      fire={fire}
      onGoDate={onGoDate}
      onFire={onFire}
      onLatest={onLatest}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 순수 렌더
// ─────────────────────────────────────────────────────────────────────────────

export interface LaunchOrdersViewProps {
  resp: LaunchOrdersResponse | null;
  fire: LaunchFire;
  d: LimitupDate | null;
  onGoDate: (d: LimitupDate) => void;
  onFire: (f: LaunchFire) => void;
  onLatest: () => void;
  /** 기본 'ready'(resp 가 있으면). */
  status?: Phase['kind'];
  /** 마지막으로 받은 날짜 목록 — 로딩 중에도 ‹ › 를 판정한다(기본 resp.dates). */
  dates?: readonly LimitupDate[];
  onRetry?: () => void;
}

const FIRE_SEGMENTS: readonly { value: LaunchFire; label: string; loaded: string }[] = [
  { value: 'q16', label: '16:00 예약', loaded: '16:00:01' },
  { value: 'n0930', label: '09:00:30 개장차익', loaded: '09:00:31' },
];

export function LaunchOrdersView({
  resp,
  fire,
  d,
  onGoDate,
  onFire,
  onLatest,
  status = 'ready',
  dates,
  onRetry,
}: LaunchOrdersViewProps) {
  const shown: LimitupDate | null = d ?? resp?.date ?? null;
  const nav = dateNavOf(resp?.dates ?? dates ?? [], shown);
  const seg = FIRE_SEGMENTS.find((s) => s.value === fire) ?? FIRE_SEGMENTS[0]!;

  const pieces = useMemo(() => (resp === null ? [] : orderTabPiecesOf(resp.pieces, fire)), [resp, fire]);
  const groups = useMemo(() => groupsOf(pieces), [pieces]);
  const cards = useMemo(
    () =>
      LAUNCH_ORDER.map(([gateway, market]) => ({
        gateway,
        market,
        model:
          resp === null ? null : launchHeadCardOf({ gateway, market, fire, pieces: resp.pieces, heads: resp.heads }),
      })),
    [resp, fire],
  );

  const ready = status === 'ready' && resp !== null;
  const noHistory = ready && resp.dates.length === 0;
  const emptyDay = ready && !noHistory && resp.pieces.length === 0 && resp.heads.length === 0;

  return (
    <div data-slot="launch-orders" className="flex min-w-0 flex-col gap-3.5">
      <div data-slot="launch-controls" className="flex min-w-0 flex-wrap items-center gap-2.5">
        <LimitupDateNav date={shown} prev={nav.prev} next={nav.next} onGo={onGoDate} />
        <LaunchFireSeg fire={fire} onFire={onFire} />
        <span
          data-slot="launch-source"
          className="ml-auto inline-flex items-center rounded-[6px] bg-[var(--muted)] px-2 py-0.5 text-[11.5px] whitespace-nowrap text-[var(--muted-fg)]"
        >
          KB120 · KYOBO119 저널 80 · {seg.loaded} 적재
        </span>
      </div>

      {status === 'loading' && <CardsSkeleton />}

      {status === 'error' && (
        <div
          data-slot="launch-error"
          role="alert"
          className={cn(CARD, 'flex flex-col items-center gap-2 px-4 py-12 text-center')}
        >
          <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">
            발사 기록을 불러오지 못했어요
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-8 text-[length:var(--t-caption)] font-semibold text-[var(--accent-fg)] hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {noHistory && <EmptyBox title="아직 적재된 발사가 없어요 · 첫 적재는 16:00:01" />}

      {emptyDay && (
        <EmptyBox title="이 날은 발사가 없어요">
          <Button className="mt-2" onClick={onLatest}>
            최신 보기
          </Button>
        </EmptyBox>
      )}

      {ready && !noHistory && !emptyDay && (
        <>
          <div data-slot="launch-head-cards" className="grid min-w-0 grid-cols-1 gap-2.5 md:grid-cols-2">
            {cards.map((c) => (
              <LaunchHeadCard key={`${c.gateway}|${c.market}`} gateway={c.gateway} market={c.market} model={c.model} />
            ))}
          </div>
          {groups.map((g) => (
            <section
              key={g.key}
              data-slot="launch-group"
              data-gateway={g.gateway}
              data-market={g.market}
              className="flex min-w-0 flex-col gap-2"
            >
              <h2 className="flex items-baseline gap-2 px-1 text-[14px] font-bold text-[var(--fg)]">
                {brokerMarketLabelOf(g.gateway, g.market)}
                <small className="text-[12px] font-medium text-[var(--muted-fg)]">{g.pieces.length}조각 · wire 순</small>
              </h2>
              <div
                data-slot="launch-pieces"
                className={cn(CARD, 'min-w-0 overflow-x-auto ring-1 ring-[var(--border-subtle)] ring-inset dark:ring-0')}
              >
                <PiecesTable pieces={g.pieces} fire={fire} />
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 발사 기준 세그먼트 — 주문 내역 · 경계 지도 두 탭이 같은 꼴 · 같은 `?fire` 키
// ─────────────────────────────────────────────────────────────────────────────

export function LaunchFireSeg({ fire, onFire }: { fire: LaunchFire; onFire: (f: LaunchFire) => void }) {
  return (
    <div
      data-slot="launch-fire-seg"
      role="group"
      aria-label="발사 기준"
      className="inline-flex gap-0.5 rounded-[10px] bg-[var(--muted)] p-[3px]"
    >
      {FIRE_SEGMENTS.map((s) => {
        const on = s.value === fire;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={on}
            data-fire={s.value}
            onClick={() => !on && onFire(s.value)}
            className={cn(
              'min-h-8 rounded-[8px] px-3 text-[13px] font-semibold whitespace-nowrap',
              on
                ? 'bg-[var(--seg-on-bg)] text-[var(--seg-on-fg)] shadow-[var(--seg-on-shadow)]'
                : 'text-[var(--muted-fg)] hover:text-[var(--fg)]',
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 머리 카드
// ─────────────────────────────────────────────────────────────────────────────

export interface LaunchHeadCardProps {
  gateway: string;
  market: string;
  model: LaunchHeadCardModel | null;
}

const CARD_FACE = cn(CARD, 'flex min-w-0 flex-col gap-1.5 px-3.5 py-3 ring-1 ring-[var(--border-subtle)] ring-inset dark:ring-0');

export function LaunchHeadCard({ gateway, market, model }: LaunchHeadCardProps) {
  const title = brokerMarketLabelOf(gateway, market);
  if (model === null) {
    return (
      <div
        data-slot="launch-head-card"
        data-gateway={gateway}
        data-market={market}
        data-empty="true"
        className={cn(CARD_FACE, 'min-h-24 items-center justify-center text-[13px] text-[var(--muted-fg)]')}
      >
        {title} · 이 날 발사 없음
      </div>
    );
  }
  return (
    <div data-slot="launch-head-card" data-gateway={gateway} data-market={market} className={CARD_FACE}>
      <div className="flex items-baseline gap-2 text-[14px] font-bold text-[var(--fg)]">
        {model.title}
        <small className="text-[12px] font-medium text-[var(--muted-fg)]">
          {model.count}조각 · {model.fire === 'q16' ? 'Q16' : 'N·A'}
        </small>
      </div>
      <CardRow label="결과">
        <Counts counts={model.counts} badLabel={model.badLabel} />
      </CardRow>
      <CardRow label="오프셋 (발사 기준)">{model.offset}</CardRow>
      {model.fire === 'q16' ? (
        <>
          <CardRow label="경계">{model.gate}</CardRow>
          <CardRow label={model.learnLabel}>{model.learn}</CardRow>
        </>
      ) : (
        <>
          <CardRow label="재전송">{model.retries}회</CardRow>
          <CardRow label="다음 오프셋">{model.next}</CardRow>
        </>
      )}
    </div>
  );
}

function CardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px] text-[var(--muted-fg)]">
      <span className="shrink-0">{label}</span>
      <b className="min-w-0 text-right font-semibold tabular-nums break-keep text-[var(--fg)]">{children}</b>
    </div>
  );
}

function Counts({ counts, badLabel }: { counts: LaunchResultCounts; badLabel: string }) {
  return (
    <span data-slot="launch-counts" className="inline-flex flex-wrap justify-end gap-x-1.5 font-semibold">
      <span className="text-[var(--launch-ok)]">접수 {counts.ok}</span>
      <span className="text-[var(--launch-bad)]">
        {badLabel} {counts.bad}
      </span>
      <span className="text-[var(--launch-other)]">기타 {counts.other}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 조각 표
// ─────────────────────────────────────────────────────────────────────────────

interface PieceGroup {
  key: string;
  gateway: string;
  market: string;
  pieces: LaunchPieceRow[];
}

/** 정렬된 탭 조각 → (서버, 시장) 묶음 — 순서는 입력 그대로(LAUNCH_ORDER 먼저 · 모르는 조합은 뒤). */
function groupsOf(pieces: readonly LaunchPieceRow[]): PieceGroup[] {
  const out: PieceGroup[] = [];
  for (const p of pieces) {
    const key = `${p.gateway}|${p.market}`;
    const last = out[out.length - 1];
    if (last !== undefined && last.key === key) last.pieces.push(p);
    else out.push({ key, gateway: p.gateway, market: p.market, pieces: [p] });
  }
  return out;
}

const NUM = new Intl.NumberFormat('ko-KR');
const int = (v: number | null): string => (v === null ? DASH : NUM.format(v));
const text = (v: string | null): string => (v === null || v === '' ? DASH : v);

const TH = 'bg-[var(--band)] px-2.5 py-2 text-left text-[11.5px] font-semibold text-[var(--muted-fg)]';
const TD = 'border-t border-[var(--border-subtle)] px-2.5 py-2';
const NUMERIC = 'text-right tabular-nums';
const DIM = 'text-[var(--muted-fg)]';

const PILL_TONE = {
  ok: 'bg-[var(--launch-ok-bg)] text-[var(--launch-ok)]',
  bad: 'bg-[var(--launch-bad-bg)] text-[var(--launch-bad)]',
  other: 'bg-[var(--muted)] text-[var(--launch-other)]',
} as const;

function ResultPill({ result }: { result: string }) {
  const tone = resultToneOf(result);
  return (
    <span
      data-slot="launch-result"
      data-tone={tone}
      className={cn('inline-flex h-5 items-center rounded-full px-[7px] text-[11.5px] font-bold', PILL_TONE[tone])}
    >
      {result}
    </span>
  );
}

function PiecesTable({ pieces, fire }: { pieces: readonly LaunchPieceRow[]; fire: LaunchFire }) {
  const q16 = fire === 'q16';
  return (
    <table className="w-full min-w-max border-collapse text-[12.5px] whitespace-nowrap">
      <thead>
        <tr>
          <th className={cn(TH, 'text-right')}>wire</th>
          <th className={TH}>{q16 ? '예약 · 조각 · 라운드' : '키 · idx'}</th>
          {!q16 && <th className={TH}>발사</th>}
          <th className={cn(TH, 'text-right')}>송신 µs</th>
          <th className={TH}>결과</th>
          {!q16 && <th className={cn(TH, 'text-right')}>재전송</th>}
          <th className={TH}>{q16 ? '접수 시각' : '응답 시각'}</th>
          <th className={TH}>종목</th>
          <th className={TH}>구분</th>
          <th className={cn(TH, 'text-right')}>가격</th>
          <th className={cn(TH, 'text-right')}>수량/체결</th>
          <th className={TH}>계좌</th>
          <th className={TH}>사용자</th>
          <th className={TH}>주문번호</th>
        </tr>
      </thead>
      <tbody>
        {pieces.map((p) => {
          const side = sideLabelOf(p.side);
          return (
            <tr key={`${p.profile}|${p.fire_exchange}|${p.fire_base}|${p.wire}`} data-slot="launch-piece-row">
              <td className={cn(TD, NUMERIC)}>{p.wire}</td>
              <td className={cn(TD, DIM)}>{pieceKeyLabelOf(p)}</td>
              {!q16 && <td className={cn(TD, DIM)}>{fireLegLabelOf(p)}</td>}
              <td className={cn(TD, NUMERIC)}>{fmtUs(p.sent_rel_us)}</td>
              <td className={TD}>
                <ResultPill result={p.result} />
              </td>
              {!q16 && <td className={cn(TD, NUMERIC)}>{p.retry ? p.retry : DASH}</td>}
              <td className={cn(TD, DIM, 'tabular-nums')}>{fmtAcceptTime(p.accept_time)}</td>
              <td className={TD}>
                {p.stock_name === null && p.stock_code === null ? (
                  <span className={DIM}>{text(p.isin)}</span>
                ) : (
                  <>
                    <b className="font-semibold text-[var(--fg)]">{text(p.stock_name)}</b>{' '}
                    <span className={DIM}>{text(p.stock_code)}</span>
                  </>
                )}
              </td>
              <td
                className={cn(
                  TD,
                  side.tone === 'up' && 'font-semibold text-[var(--up)]',
                  side.tone === 'down' && 'font-semibold text-[var(--down)]',
                  side.tone === null && DIM,
                )}
              >
                {side.label}
              </td>
              <td className={cn(TD, NUMERIC)}>{int(p.price)}</td>
              <td className={cn(TD, NUMERIC)}>
                {p.qty === null && p.filled_qty === null ? DASH : `${int(p.qty)}/${int(p.filled_qty)}`}
              </td>
              <td className={cn(TD, DIM, 'tabular-nums')}>{text(p.account)}</td>
              <td className={cn(TD, DIM)}>{text(p.dma_user_id)}</td>
              <td className={cn(TD, DIM, 'tabular-nums')}>{text(p.order_no)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 로딩 · 빈 상태
// ─────────────────────────────────────────────────────────────────────────────

function CardsSkeleton() {
  return (
    <div
      data-slot="launch-loading"
      aria-busy="true"
      aria-label="불러오는 중"
      className="grid grid-cols-1 gap-2.5 md:grid-cols-2"
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={CARD_FACE}>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function EmptyBox({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div data-slot="launch-empty" className={cn(CARD, 'flex flex-col items-center gap-1 px-4 py-12 text-center')}>
      <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">{title}</p>
      {children}
    </div>
  );
}
