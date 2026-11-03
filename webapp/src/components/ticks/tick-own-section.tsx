'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { OWN_MATCH_EST_MS, fmtTickTime, formatKstMs } from '@gh-radar/shared';

import {
  ownConditionLineText,
  ownEvidenceText,
  ownOrderGroupLabel,
  type OwnModel,
  type OwnOrderView,
} from '@/lib/ticks/own-model';
import { CARD } from '@/components/layout/page-layout';
import { fmtQty } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';
import { cn } from '@/lib/utils';

/**
 * 「이 주문」 카드 안 우리 주문 조각 (Phase 38 D-07 ①~③ · D-10 · D-11 · D-13 · 목업 B `.sect` · `.ln` · `.lk` · `table.rl2` · `.foot`).
 *
 * ① `TickOwnSection` — 머리 「◆ 우리 주문 #{주문번호}」 + 작게 「{게이트웨이} · 계좌 ···{끝4}」(계좌 구분은 섹션 · 표에서만 — D-02).
 *   줄(점선 위 경계 · 키 왼쪽 · 값 오른쪽): 주문(시각 · 구분 · 방향 · 가격 ×수량) · 조건(`conditionTextOf` 그대로 |
 *   「없음 · 수동 주문 — 주문 시각 위치만」 D-13) · 근거 {종류}(근거 행 수신 시각 + 근거 문구 · 구간이면
 *   「체결 구간 n건 · X주 · HH:MM:SS~HH:MM:SS」 · 「보기 ›」 = 근거 행(구간이면 끝 행)) · 직전 체결(앵커 · 점선 「보기 ›」 ·
 *   근거와 같은 행이면 모델이 −1 로 지워 생략) · 체결(시각 · 우리 n[ / 전체 m] · +ms · 「추정 · 동가 후보 k」 · 짝 없음 · 대기) ·
 *   꼬리말(커서 체결이 부분 · 추정일 때). 「보기 ›」 는 되돌아갈 주문을 기억시킨 뒤 커서를 옮긴다(D-10 알약은 뷰어).
 * ② `TickOwnEvidenceOrders` — 커서가 근거 전문 행이면 「이 전문을 보고 나간 주문 n건」 · 항목 클릭 = 그 주문 줄 선택(D-07 ③).
 *   근거 행 자체에는 칩을 붙이지 않는다(D-10).
 * ③ `TickOwnTable` — 「우리 주문」 표(own 이 있으면 늘) · 캡션 「이 날 n건 · 체결 n건 · 켜진 서버 …」(그날 켜진 서버만 · D-03) ·
 *   열 주문 · 구분 · 수량 · 체결(추정 있으면 「?」) · 근거 · 행 클릭 = 첫 짝 체결 rec(없으면 주문 줄) · 근거 칸 = 근거 rec.
 *   고른 주문 행이 바뀌면 그 행이 보이게 스크롤(nearest — 키 `[` `]` 와 같이 움직인다).
 * ④ `TickOwnTab` — 오른쪽 열 「우리 주문 n」 탭 본문(스케치 026 A · 2026-11-03 UAT — D-07 「카드 안 표」 를 뒤집었다): 카드 하나에
 *   거르기 칩(전체 · 매수 · 매도 · 체결 있음 · 체결 없음) + 표. 「◆ 우리 주문 #…」 섹션은 그대로 「이 주문」 카드 안.
 * 낱말은 shared `strategy-event-text` 정본 그대로 — 근거 문구의 머리 「근거 」 만 키 칸과 겹쳐 뺀다.
 */

const SIDE_TEXT = { buy: '매수', sell: '매도' } as const;
const SIDE_COLOR = { buy: 'text-[var(--up)]', sell: 'text-[var(--down)]' } as const;

const recvTime = (session: TickSession, rec: number): string => fmtTickTime(session.index.recvNs[rec]!);

/** 표 · 목록 시각 — 주문 시각 · 없으면 첫 체결 시각(HH:MM:SS). */
function orderHms(own: OwnModel, o: OwnOrderView): string {
  const ms = o.gwMs ?? (o.fills.length > 0 ? own.fills[o.fills[0]!]!.gwMs : null);
  return ms === null ? '—' : formatKstMs(ms).slice(0, 8);
}

/** 시각차 「+5ms」 · 「−37ms」 — dt = gw − A3 시각 · 짝 창 [−200, +1500]ms 라 음수가 정상 값이다(부호를 늘 붙인다). */
function dtText(dtMs: number): string {
  const dt = Math.round(dtMs);
  return `${dt >= 0 ? '+' : '−'}${Math.abs(dt)}ms`;
}

/** 「가격 ×수량」 — 0 이하 · 없음은 생략(가짜 0 금지). 둘 다 없으면 null. */
function pxQtyText(o: OwnOrderView): string | null {
  const parts = [
    o.px !== null && o.px > 0 ? fmtQty(o.px) : null,
    o.qty !== null && o.qty > 0 ? `×${fmtQty(o.qty)}` : null,
  ].filter((s) => s !== null);
  return parts.length > 0 ? parts.join(' ') : null;
}

/** 구분 + 방향(방향만 색) — 「선매수 매수」. */
function GroupSide({ o }: { o: OwnOrderView }) {
  const group = ownOrderGroupLabel(o);
  return (
    <>
      {group}
      {group && o.side ? ' ' : null}
      {o.side ? <span className={cn('font-semibold', SIDE_COLOR[o.side])}>{SIDE_TEXT[o.side]}</span> : null}
    </>
  );
}

/** 줄 — 목업 `.ln`(11.5px · 점선 위 경계 · 첫 줄은 경계 없음). */
function Ln({ k, slot, children }: { k: string; slot: string; children: ReactNode }) {
  return (
    <div
      data-slot="tick-own-line"
      data-k={slot}
      className="flex justify-between gap-2 border-t border-dashed border-[var(--border-subtle)] py-1 text-[11.5px] first-of-type:border-t-0"
    >
      <span className="flex-none text-[var(--muted-fg)]">{k}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

/** 「보기 ›」 버튼 — 목업 `.lk`(민트 바탕) · ghost 는 점선 테두리(`.lk.ghost`). 행 클릭으로 번지지 않는다. */
function OwnLink({
  ghost = false,
  to,
  onClick,
  children = '보기 ›',
}: {
  ghost?: boolean;
  to: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      data-slot="tick-own-jump"
      data-to={to}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'ml-1 inline-flex items-center rounded-[6px] px-[7px] py-[2px] align-baseline text-[10.5px] font-bold whitespace-nowrap text-[var(--mine-fg)]',
        ghost ? 'border border-dashed border-[var(--mine)] bg-transparent' : 'bg-[var(--mine-bg)]',
      )}
    >
      {children}
    </button>
  );
}

/** 꼬리말 — 목업 `.foot`(10.5px · `--faint`). */
function Foot({ children }: { children: ReactNode }) {
  return (
    <p data-slot="tick-own-foot" className="m-0 mt-2 text-[10.5px] leading-normal text-[var(--faint)]">
      {children}
    </p>
  );
}

export interface TickOwnSectionProps {
  session: TickSession;
  own: OwnModel;
  /** 보일 우리 주문 id. */
  orderId: number;
  /** 커서 rec — 꼬리말(커서 체결이 부분 · 추정)에만 쓴다. */
  cursorRec?: number;
  /** 커서 이동(근거 · 직전 체결 「보기 ›」). */
  onJump?: (rec: number) => void;
  /** 「보기 ›」 로 떠날 때 되돌아갈 주문 id 를 기억시킨다(D-10 알약). */
  onBack?: (orderId: number) => void;
}

export function TickOwnSection({ session, own, orderId, cursorRec = -1, onJump, onBack }: TickOwnSectionProps) {
  const o = own.orders[orderId];
  if (!o) return null;
  const last4 = o.accountNo.length > 0 ? `···${o.accountNo.slice(-4)}` : '';
  const pxQty = pxQtyText(o);
  const go = (rec: number) => {
    onBack?.(o.id);
    onJump?.(rec);
  };

  // 근거 줄 값
  let evidence: string | null = null;
  if (o.evidenceRec >= 0) {
    const ev = o.evidence;
    if (ev.kind === 'range') {
      evidence = `체결 구간 ${fmtQty(ev.n)}건 · ${fmtQty(ev.qty)}주 · ${recvTime(session, o.evidenceFirstRec).slice(0, 8)}~${recvTime(session, o.evidenceRec).slice(0, 8)}`;
    } else {
      const body = (ownEvidenceText(o) ?? '').replace(/^근거 /, '');
      evidence = body !== '' ? `${recvTime(session, o.evidenceRec)} · ${body}` : recvTime(session, o.evidenceRec);
    }
  }

  // 직전 체결(앵커) — A3 가격 ×수량
  let anchor: string | null = null;
  if (o.anchorRec >= 0) {
    const j = session.a3Of[o.anchorRec] ?? -1;
    const pq = j >= 0 ? ` · ${fmtQty(session.a3.px[j]!)} ×${fmtQty(session.a3.qty[j]!)}` : '';
    anchor = `${recvTime(session, o.anchorRec)}${pq}`;
  }

  // 꼬리말 — 커서 A3 에 붙은 이 주문 체결(부분 · 추정)
  const here = o.fills.map((fid) => own.fills[fid]!).filter((f) => f.rec >= 0 && f.rec === cursorRec);
  const hereOur = here.reduce((n, f) => n + f.qty, 0);
  const hereTotal = here.length > 0 ? here[0]!.total : 0;
  const hereEst = here.find((f) => f.est) ?? null;

  return (
    <div data-slot="tick-own-section" data-order={o.id} className="mt-3 border-t border-[var(--border-subtle)] pt-2.5">
      <h4 className="m-0 mb-1.5 flex flex-wrap items-baseline gap-1.5 text-[11px] font-bold text-[var(--mine-fg)]">
        <span>◆ 우리 주문 #{o.orderNo !== '' ? o.orderNo : '—'}</span>
        <small className="text-[11px] font-medium text-[var(--muted-fg)]">
          {o.gateway}
          {last4 !== '' ? ` · 계좌 ${last4}` : ''}
        </small>
      </h4>
      <Ln k="주문" slot="order">
        {o.gwMs !== null ? <span className="mono">{formatKstMs(o.gwMs)}</span> : null}
        {o.gwMs !== null && (ownOrderGroupLabel(o) || o.side) ? ' · ' : null}
        <GroupSide o={o} />
        {pxQty !== null ? (
          <>
            {' '}
            <b className="mono font-semibold">{pxQty}</b>
          </>
        ) : null}
      </Ln>
      <Ln k="조건" slot="cond">
        {o.event && o.event.cond_metric > 0 ? (
          <b className="font-semibold">{ownConditionLineText(o)}</b>
        ) : (
          <span className="text-[var(--muted-fg)]">{ownConditionLineText(o)}</span>
        )}
      </Ln>
      {o.evidenceLabel !== null && evidence !== null && (
        <Ln k={`근거 ${o.evidenceLabel}`} slot="evidence">
          <span className="mono">{evidence}</span>
          <OwnLink to="evidence" onClick={() => go(o.evidenceRec)} />
        </Ln>
      )}
      {anchor !== null && (
        <Ln k="직전 체결" slot="anchor">
          <span className="mono text-[var(--muted-fg)]">{anchor}</span>
          <OwnLink ghost to="anchor" onClick={() => go(o.anchorRec)} />
        </Ln>
      )}
      <Ln k="체결" slot="fills">
        {o.fills.length === 0 ? (
          <span className="text-[var(--muted-fg)]">없음</span>
        ) : (
          o.fills.map((fid) => {
            const f = own.fills[fid]!;
            const matched = f.state === 'matched';
            return (
              <span key={fid} data-slot="tick-own-fill" className="mono block">
                {matched ? recvTime(session, f.rec) : formatKstMs(f.gwMs)} <b className="font-semibold">{fmtQty(f.qty)}</b>
                {matched ? (
                  <>
                    {f.qty !== f.total ? (
                      <span className="text-[var(--muted-fg)]">{` / 전체 ${fmtQty(f.total)}`}</span>
                    ) : null}
                    <span className="text-[var(--muted-fg)]">{` ${dtText(f.dtMs)}`}</span>
                    {f.est ? (
                      <span
                        data-slot="tick-own-est"
                        className="ml-1 inline-flex h-4 items-center rounded-[4px] border border-dashed border-[var(--mine)] px-1 text-[10px] font-bold text-[var(--mine-fg)]"
                      >
                        추정 · 동가 후보 {f.candidates}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-[var(--muted-fg)]">
                    {f.state === 'pending' ? ' 전문 아직 안 옴' : ' 짝 전문 없음'}
                  </span>
                )}
              </span>
            );
          })
        )}
      </Ln>
      {here.length > 0 && hereOur < hereTotal && (
        <Foot>
          {`이 A3 ${fmtQty(hereTotal)}주 중 ${fmtQty(hereOur)}주가 우리 체결이다(A3 = 공격 주문 × 가격 단 합산). 같은 가격 · 남은 수량 ≥ 체결 수량 · 시각차 [−200, +1500]ms 중 가장 가까운 A3.`}
        </Foot>
      )}
      {hereEst !== null && (
        <Foot>
          {`${OWN_MATCH_EST_MS}ms 안에 같은 가격 후보 A3 가 ${fmtQty(hereEst.candidates)}개 — 가장 가까운 것을 골랐지만 다른 쪽일 수 있다.`}
        </Foot>
      )}
    </div>
  );
}

export interface TickOwnEvidenceOrdersProps {
  own: OwnModel;
  /** 이 근거 전문을 보고 나간 주문 id 들(`ordersOfEvidenceRec`). */
  orderIds: readonly number[];
  /** 항목 클릭 — 그 주문 줄 선택. */
  onOrder?: (orderId: number) => void;
}

/** 근거 역참조 목록(D-07 ③) — 「이 전문을 보고 나간 주문 n건」. */
export function TickOwnEvidenceOrders({ own, orderIds, onOrder }: TickOwnEvidenceOrdersProps) {
  return (
    <div data-slot="tick-own-evidence-orders" className="mt-3 border-t border-[var(--border-subtle)] pt-2.5">
      <h4 className="m-0 mb-1 text-[11px] font-bold text-[var(--mine-fg)]">
        이 전문을 보고 나간 주문 {fmtQty(orderIds.length)}건
      </h4>
      <ul className="m-0 list-none p-0">
        {orderIds.map((id) => {
          const o = own.orders[id];
          if (!o) return null;
          const pxQty = pxQtyText(o);
          return (
            <li key={id}>
              <button
                type="button"
                data-slot="tick-own-evidence-order"
                data-order={id}
                onClick={() => onOrder?.(id)}
                className="flex w-full items-baseline gap-1.5 border-t border-dashed border-[var(--border-subtle)] py-1 text-left text-[11.5px] first:border-t-0 hover:bg-[color-mix(in_oklab,var(--mine)_7%,transparent)]"
              >
                <span className="mono flex-none text-[var(--muted-fg)]">{orderHms(own, o)}</span>
                <span className="min-w-0 truncate">
                  <GroupSide o={o} />
                  {pxQty !== null ? <b className="mono ml-1 font-semibold">{pxQty}</b> : null}
                  {o.evidenceLabel !== null ? (
                    <span className="text-[var(--muted-fg)]">{` · 근거 ${o.evidenceLabel}`}</span>
                  ) : null}
                </span>
                <span className="mono ml-auto flex-none text-[10.5px] text-[var(--mine-fg)]">
                  #{o.orderNo !== '' ? o.orderNo : '—'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface TickOwnTableProps {
  own: OwnModel;
  /** 선택 표시할 주문 id 들(섹션에 보인 주문). */
  selected: readonly number[];
  /** 행 클릭 — 첫 짝 체결 rec 로. */
  onJump?: (rec: number) => void;
  /** 행 클릭인데 짝 체결이 없을 때 — 그 주문 줄 선택. */
  onOrder?: (orderId: number) => void;
  /** 근거 칸 「보기」 로 떠날 때 되돌아갈 주문 id. */
  onBack?: (orderId: number) => void;
  /** 거르기(④ 탭 칩) — 없으면 전체. */
  filter?: OwnTableFilter;
}

/** 「우리 주문」 표 거르기 — 탭 칩. */
export type OwnTableFilter = 'all' | 'buy' | 'sell' | 'filled' | 'nofill';

const OWN_FILTERS: readonly { key: OwnTableFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'buy', label: '매수' },
  { key: 'sell', label: '매도' },
  { key: 'filled', label: '체결 있음' },
  { key: 'nofill', label: '체결 없음' },
];

const TH = 'border-b border-[var(--border-subtle)] px-1 py-[3px] font-semibold';

/** 「우리 주문」 표(D-07 ② · D-03) — own 이 있으면 늘 · 주문 0 이면 캡션만. */
export function TickOwnTable({ own, selected, onJump, onOrder, onBack, filter = 'all' }: TickOwnTableProps) {
  const servers = own.servers.length > 0 ? own.servers.join(' · ') : '없음';
  const body = useRef<HTMLTableSectionElement>(null);
  const firstSel = selected[0] ?? -1;
  useEffect(() => {
    if (firstSel < 0) return;
    const tr = body.current?.querySelector(`[data-order="${firstSel}"]`);
    // jsdom 에는 scrollIntoView 가 없다
    if (tr instanceof HTMLElement && typeof tr.scrollIntoView === 'function') tr.scrollIntoView({ block: 'nearest' });
  }, [firstSel]);
  const shown = own.orders.filter((o) => {
    if (filter === 'buy') return o.side === 'buy';
    if (filter === 'sell') return o.side === 'sell';
    if (filter === 'filled' || filter === 'nofill') {
      const any = o.fills.some((fid) => own.fills[fid]!.qty > 0);
      return filter === 'filled' ? any : !any;
    }
    return true;
  });
  return (
    <div data-slot="tick-own-table" className="mt-3">
      <h3 className="m-0 flex flex-wrap items-baseline gap-1.5 text-[11px] font-semibold text-[var(--mine-fg)]">
        <span>우리 주문</span>
        <small data-slot="tick-own-table-caption" className="text-[11px] font-medium text-[var(--muted-fg)]">
          {`이 날 ${fmtQty(own.orders.length)}건 · 체결 ${fmtQty(own.fills.length)}건 · 켜진 서버 ${servers}`}
        </small>
      </h3>
      {own.orders.length > 0 && (
        <table className="mt-1 w-full border-collapse text-[11px]">
          <thead>
            <tr className="text-[10px] font-semibold text-[var(--muted-fg)]">
              <th className={cn(TH, 'text-left')}>주문</th>
              <th className={cn(TH, 'text-left')}>구분</th>
              <th className={cn(TH, 'text-right')}>수량</th>
              <th className={cn(TH, 'text-right')}>체결</th>
              <th className={cn(TH, 'text-right')}>근거</th>
            </tr>
          </thead>
          <tbody ref={body}>
            {shown.map((o) => {
              let filled = 0;
              let est = false;
              let firstRec = -1;
              for (const fid of o.fills) {
                const f = own.fills[fid]!;
                filled += f.qty;
                if (f.est) est = true;
                if (firstRec < 0 && f.rec >= 0) firstRec = f.rec;
              }
              const sel = selected.includes(o.id);
              return (
                <tr
                  key={o.id}
                  data-slot="tick-own-table-row"
                  data-order={o.id}
                  aria-selected={sel}
                  onClick={() => (firstRec >= 0 ? onJump?.(firstRec) : onOrder?.(o.id))}
                  className={cn(
                    'h-6 cursor-pointer border-t border-[var(--border-subtle)] whitespace-nowrap',
                    sel
                      ? 'bg-[color-mix(in_oklab,var(--mine)_12%,transparent)]'
                      : 'hover:bg-[color-mix(in_oklab,var(--muted)_70%,transparent)]',
                  )}
                >
                  <td className="mono px-1 text-left">{orderHms(own, o)}</td>
                  <td className="px-1 text-left">
                    <GroupSide o={o} />
                  </td>
                  <td className="mono px-1 text-right">{o.qty !== null && o.qty > 0 ? fmtQty(o.qty) : '—'}</td>
                  <td className="mono px-1 text-right">
                    {fmtQty(filled)}
                    {est ? <span className="ml-0.5 font-bold text-[var(--mine-fg)]">?</span> : null}
                  </td>
                  <td className="px-1 text-right">
                    {o.evidenceLabel !== null && o.evidenceRec >= 0 ? (
                      <button
                        type="button"
                        data-slot="tick-own-jump"
                        data-to="evidence"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBack?.(o.id);
                          onJump?.(o.evidenceRec);
                        }}
                        className="font-semibold text-[var(--mine-fg)] underline decoration-dotted underline-offset-2"
                      >
                        {o.evidenceLabel}
                      </button>
                    ) : (
                      <span className="text-[var(--muted-fg)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export interface TickOwnTabProps extends Omit<TickOwnTableProps, 'filter'> {
  className?: string;
}

/** 오른쪽 열 「우리 주문」 탭 본문(④) — 거르기 칩 + 표. 칩 상태는 탭이 들고 있는 동안 유지된다. */
export function TickOwnTab({ className, ...table }: TickOwnTabProps) {
  const [filter, setFilter] = useState<OwnTableFilter>('all');
  return (
    <section data-slot="tick-own-tab" aria-label="우리 주문" className={cn(CARD, 'min-w-0 px-3 pt-0.5 pb-3', className)}>
      {table.own.orders.length > 0 && (
        <div role="group" aria-label="우리 주문 거르기" className="mt-2.5 flex flex-wrap gap-1">
          {OWN_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              data-slot="tick-own-filter"
              data-filter={f.key}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'h-[22px] rounded-full border px-2 text-[11px] whitespace-nowrap transition-colors',
                filter === f.key
                  ? 'border-[var(--mine)] bg-[var(--mine-bg)] font-semibold text-[var(--mine-fg)]'
                  : 'border-[var(--border-subtle)] text-[var(--muted-fg)] hover:text-[var(--fg)]',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <TickOwnTable {...table} filter={filter} />
    </section>
  );
}
