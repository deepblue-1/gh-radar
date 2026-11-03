'use client';

import { useMemo, type ReactNode } from 'react';

import { fmtTickTime } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import {
  fmtDurNs,
  fmtGapNs,
  fmtLeadMs,
  fmtShare,
  orderShapeLabel,
  preBookOf,
  sideOf,
  teamOrderMetaOf,
} from '@/lib/ticks/msg-rows';
import type { OwnModel, OwnSel } from '@/lib/ticks/own-model';
import { fmtAmountC, fmtQty } from '@/lib/ticks/tick-format';
import { recentOrdersOf, type TickSession, type ViewOrder } from '@/lib/ticks/tick-session';
import { cn } from '@/lib/utils';

import { ShapeChip } from './tick-msg-list';
import { TickOwnEvidenceOrders, TickOwnSection } from './tick-own-section';

/**
 * 틱 뷰어 「이 주문」 카드 (Phase 37 D-00 ① · 스케치 019 · 020 오른쪽 열).
 *
 * ① 커서 rec 가 주문(조각 · 닫는 B6)에 속하면 그 주문 — 모양 칩 · 매수/매도 · 조각 · 단 · 수량 · 금액 · 지속(µs/ms) ·
 *   seq 범위 · 닫는 B6 seq(먼저 수신이면 주황 ↕ ms) · 「진행 중」(스트림 끝 열린 주문 · Pitfall 9).
 *   주문 밖 전문이면 「주문 밖 전문」 과 최근 주문 표만.
 * ② 「최근 주문 10건」 — 거래소순으로 커서 이하에서 끝난 주문 최신 먼저(커서가 주문 가운데면 그 주문이 맨 위). 행 클릭 =
 *   그 주문 마지막 조각으로 커서 이동.
 * ③ 팀 주문이면 「직전 팀 주문」(첫 조각 체결시각 간격 µs · 그날 첫 팀 주문이면 그 말 — 스케치 024 C). 모든 주문에
 *   「주문 전 매도비중」(첫 조각 직전 B6 의 매도 ÷ (매도 + 매수) — 총잔량 · 1호 잔량 · 스케치 025 · 2026-11-03 — 어떤 호가
 *   쏠림에서 주문이 나갔는지 확인용).
 * 판정은 세션(shared classifyKrxOrders · NXT 런)이 이미 했다 — 여기서는 보이기만 한다.
 * ③ 우리 주문(Phase 38 D-07): 배치 = 본문 → 「◆ 우리 주문 #…」 섹션(커서가 우리 체결 A3 행이거나 우리 줄이 골라졌을 때 ·
 *   주문이 둘이면 둘) 또는 근거 역참조 「이 전문을 보고 나간 주문 n건」(커서가 근거 전문 행일 때) → 「최근 주문」 표(37 그대로).
 *   그날 전체 「우리 주문」 표는 오른쪽 열 「우리 주문 n」 탭으로 옮겼다(스케치 026 A · 2026-11-03 UAT · `TickOwnTab`).
 */

export interface TickOrderCardProps {
  session: TickSession;
  cursorRec: number;
  onJump: (rec: number) => void;
  /** 우리 체결 모델(Phase 38) — 없으면 우리 섹션 · 표가 없다(Phase 37 카드 그대로). */
  own?: OwnModel | null;
  /** 고른 우리 줄(주문 줄 · 짝 없음 줄 — 뷰어 파생). 있으면 그 주문 섹션을 보인다. */
  ownSel?: OwnSel | null;
  /** 우리 섹션 · 표의 「보기 ›」 · 행 클릭 — 커서 이동. 없으면 `onJump`. */
  onOwnJump?: (rec: number) => void;
  /** 「보기 ›」 로 떠날 때 되돌아갈 주문 id(D-10 알약). */
  onOwnBack?: (orderId: number) => void;
  /** 그 주문 줄 선택(근거 역참조 항목 · 짝 체결 없는 표 행) — 뷰어가 주문 줄 자리를 안다. */
  onOwnOrder?: (orderId: number) => void;
  className?: string;
}

/** 섹션에 보일 우리 주문 — 고른 우리 줄의 주문 · 아니면 커서 A3 rec 에 붙은 우리 체결의 주문들(첫 등장 순 · 중복 없음). */
export function ownOrdersAt(own: OwnModel, cursorRec: number, ownSel: OwnSel | null): number[] {
  if (ownSel !== null) {
    const id = ownSel.kind === 'order' ? ownSel.id : (own.fills[ownSel.id]?.order ?? -1);
    return id >= 0 ? [id] : [];
  }
  const out: number[] = [];
  for (const fid of own.fillsOfRec.get(cursorRec) ?? []) {
    const id = own.fills[fid]!.order;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

const SIDE_TEXT = { buy: '매수', sell: '매도', auction: '단일가' } as const;
const SIDE_COLOR = {
  buy: 'text-[var(--up)]',
  sell: 'text-[var(--down)]',
  auction: 'text-[var(--muted-fg)]',
} as const;

const KIND_DETAIL: Partial<Record<ViewOrder['kind'], string>> = {
  자전거래방지: '자전거래방지',
  '0/0 단독': '0/0 단독',
  '0/0 스윕 끝': '0/0 스윕 끝',
  NXT팀: '한 가격 2조각 이상',
};

function lastRecOf(o: ViewOrder): number {
  return o.recs[o.recs.length - 1]!;
}

function Kv({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] text-[var(--muted-fg)]">{k}</div>
      <div className="mono truncate text-[15px] leading-tight font-bold text-[var(--fg)]">{children}</div>
    </div>
  );
}

function Small({ children }: { children: ReactNode }) {
  return <small className="ml-0.5 text-[11px] font-medium text-[var(--muted-fg)]">{children}</small>;
}

function durNode(ns: bigint) {
  const t = fmtDurNs(ns);
  const m = /^([\d.]+)(µs|ms|s)$/.exec(t);
  if (!m) return t;
  return (
    <>
      {m[1]}
      <Small>{m[2]}</Small>
    </>
  );
}

export function TickOrderCard({
  session,
  cursorRec,
  onJump,
  own = null,
  ownSel = null,
  onOwnJump,
  onOwnBack,
  onOwnOrder,
  className,
}: TickOrderCardProps) {
  const ownIds = own !== null ? ownOrdersAt(own, cursorRec, ownSel) : [];
  // 근거 역참조 — 섹션이 없을 때(우리 체결 행 · 우리 줄이 아닐 때)만
  const evidenceOf = own !== null && ownIds.length === 0 ? own.ordersOfEvidenceRec.get(cursorRec) : undefined;
  const ownJump = onOwnJump ?? onJump;
  const oid = cursorRec >= 0 ? session.orderOfRec[cursorRec]! : -1;
  const order = oid >= 0 ? session.orders[oid]! : null;
  const recent = useMemo(() => recentOrdersOf(session, cursorRec, 10), [session, cursorRec]);
  const nxt = session.scope === 'nxt';

  let body: ReactNode;
  if (order === null) {
    body = (
      <p data-slot="tick-order-none" className="m-0 py-3 text-center text-[12px] text-[var(--muted-fg)]">
        주문 밖 전문
      </p>
    );
  } else {
    const side = sideOf(order.bs);
    const inv = order.closingB6Rec === null ? undefined : session.inversionOfB6.get(order.closingB6Rec);
    const detail = KIND_DETAIL[order.kind];
    const meta = order.team ? teamOrderMetaOf(session, order.id) : null;
    const pre = preBookOf(session, order);
    body = (
      <div data-slot="tick-order-this" data-order={order.id}>
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold">
          <ShapeChip order={order} className="ml-0 h-[18px] text-[10.5px]" />
          {detail && <span className="text-[11px] font-medium text-[var(--muted-fg)]">{detail}</span>}
          <span className={SIDE_COLOR[side]}>{SIDE_TEXT[side]}</span>
          {order.open && (
            <span
              data-slot="tick-order-open"
              className="inline-flex h-[18px] items-center rounded-[4px] bg-[var(--vi-bg)] px-[5px] text-[10.5px] font-bold text-[var(--vi)]"
            >
              진행 중
            </span>
          )}
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
          <Kv k="조각 · 단">
            {order.pieces}조각<Small>{order.nPx}단</Small>
          </Kv>
          <Kv k="수량">
            {fmtQty(order.qty)}
            <Small>주</Small>
          </Kv>
          <Kv k="금액">{fmtAmountC(order.val)}</Kv>
          <Kv k="지속">{durNode(order.lastNs - order.firstNs)}</Kv>
        </div>
        <dl data-slot="tick-order-meta" className="mono m-0 mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          {meta !== null && (
            <>
              <dt className="font-sans text-[11px] text-[var(--muted-fg)]">직전 팀 주문</dt>
              <dd data-slot="tick-order-gap" className="m-0 font-semibold text-[var(--team)]">
                {meta.gapNs === null ? '그날 첫 팀 주문' : fmtGapNs(meta.gapNs)}
              </dd>
            </>
          )}
          <dt className="font-sans text-[11px] text-[var(--muted-fg)]">주문 전 매도비중</dt>
          <dd data-slot="tick-order-prebook" className="m-0 text-[var(--fg)]">
            {pre.bookRec < 0 ? (
              '—'
            ) : (
              <>
                <span className="font-sans text-[11px] text-[var(--muted-fg)]">총잔량</span> <b>{fmtShare(pre.totalShare)}</b> ·{' '}
                <span className="font-sans text-[11px] text-[var(--muted-fg)]">1호</span> <b>{fmtShare(pre.l1Share)}</b>
              </>
            )}
          </dd>
        </dl>
        <p data-slot="tick-order-seq" className="mono m-0 mt-2 text-[11px] leading-normal text-[var(--muted-fg)]">
          seq {fmtQty(order.firstSeq)}
          {order.pieces > 1 ? `~${fmtQty(order.lastSeq)}` : ''} ·{' '}
          {order.closingB6Rec === null
            ? '닫는 B6 아직 없음'
            : `닫는 B6 ${fmtQty(session.index.seq[order.closingB6Rec]!)}`}
          {inv && (
            <span data-slot="tick-order-inv" className="ml-1.5 font-semibold text-[var(--vi)]">
              ↕ 닫는 B6 가 마지막 조각보다 {fmtLeadMs(inv.leadNs)} 먼저 수신
            </span>
          )}
        </p>
      </div>
    );
  }

  return (
    <section
      data-slot="tick-order-card"
      aria-label="이 주문"
      className={cn(CARD, 'flex min-w-0 flex-col overflow-hidden', className)}
    >
      <div className="flex flex-none items-baseline gap-2 border-b border-[var(--border-subtle)] px-3 py-[9px]">
        <h2 className="m-0 text-[12.5px] font-bold text-[var(--fg)]">이 주문</h2>
        <small className="truncate text-[11px] text-[var(--muted-fg)]">
          {nxt ? 'NXT 런 · msg_seq +1 묶기' : '체결 버스트 · msg_seq +1 묶기'}
        </small>
      </div>
      <div className="px-3 pt-2.5 pb-3">
        {body}
        {own !== null &&
          ownIds.map((id) => (
            <TickOwnSection
              key={id}
              session={session}
              own={own}
              orderId={id}
              cursorRec={cursorRec}
              onJump={ownJump}
              onBack={onOwnBack}
            />
          ))}
        {own !== null && evidenceOf !== undefined && evidenceOf.length > 0 && (
          <TickOwnEvidenceOrders own={own} orderIds={evidenceOf} onOrder={onOwnOrder} />
        )}
        <h3 className="m-0 mt-3 text-[11px] font-semibold text-[var(--muted-fg)]">최근 주문 {recent.length}건</h3>
        {recent.length === 0 ? (
          <p className="m-0 py-2 text-[11.5px] text-[var(--muted-fg)]">아직 체결 주문 없음</p>
        ) : (
          <table data-slot="tick-order-recent" className="mt-1 w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-[10px] font-semibold text-[var(--muted-fg)]">
                <th className="border-b border-[var(--border-subtle)] px-1 py-[3px] text-left font-semibold">시각</th>
                <th className="border-b border-[var(--border-subtle)] px-1 py-[3px] text-right font-semibold">구분</th>
                <th className="border-b border-[var(--border-subtle)] px-1 py-[3px] text-right font-semibold">조각</th>
                <th className="border-b border-[var(--border-subtle)] px-1 py-[3px] text-right font-semibold">수량</th>
                <th className="border-b border-[var(--border-subtle)] px-1 py-[3px] text-right font-semibold">금액</th>
                <th className="border-b border-[var(--border-subtle)] px-1 py-[3px] text-right font-semibold">모양</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => {
                const side = sideOf(o.bs);
                const inverted = o.closingB6Rec !== null && session.inversionOfB6.has(o.closingB6Rec);
                return (
                  <tr
                    key={o.id}
                    data-slot="tick-order-recent-row"
                    data-order={o.id}
                    aria-selected={order?.id === o.id}
                    onClick={() => onJump(lastRecOf(o))}
                    style={o.team ? { boxShadow: 'inset 2px 0 0 var(--team)' } : undefined}
                    className={cn(
                      'h-6 cursor-pointer border-t border-[var(--border-subtle)] whitespace-nowrap',
                      order?.id === o.id
                        ? 'bg-[color-mix(in_oklab,var(--fg)_10%,transparent)]'
                        : 'hover:bg-[color-mix(in_oklab,var(--muted)_70%,transparent)]',
                    )}
                  >
                    <td className="mono px-1 text-left">{fmtTickTime(o.firstNs)}</td>
                    <td className={cn('px-1 text-right font-semibold', SIDE_COLOR[side])}>{SIDE_TEXT[side]}</td>
                    <td className="mono px-1 text-right">
                      {o.pieces}
                      {inverted && <span className="ml-px font-semibold text-[var(--vi)]">↕</span>}
                    </td>
                    <td className="mono px-1 text-right">{fmtQty(o.qty)}</td>
                    <td className="mono px-1 text-right">{fmtAmountC(o.val)}</td>
                    <td className="px-1 text-right">
                      <span
                        className={cn(
                          'text-[10px] font-bold',
                          o.kind === '단일가'
                            ? 'text-[var(--vi)]'
                            : o.team
                              ? 'text-[var(--team)]'
                              : 'text-[var(--muted-fg)]',
                        )}
                      >
                        {orderShapeLabel(o)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
