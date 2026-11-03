'use client';

import type { ReactNode } from 'react';

import { fmtTickTime, formatKstMs } from '@gh-radar/shared';

import { ownConditionLineText, ownEvidenceText, ownOrderGroupLabel, type OwnModel } from '@/lib/ticks/own-model';
import { fmtQty } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';
import { cn } from '@/lib/utils';

/**
 * 「이 주문」 카드 안 우리 주문 섹션 (Phase 38 D-07 ① · D-10 · D-11 · D-13 · 목업 B `.sect` · `.ln` · `.lk`).
 *
 * ① 머리 「◆ 우리 주문 #{주문번호}」 + 작게 「{게이트웨이} · 계좌 ···{끝4}」 — 계좌 구분은 섹션 · 표에서만(D-02).
 * ② 줄(점선 위 경계 · 키 왼쪽 · 값 오른쪽): 주문(시각 · 구분 · 방향 · 가격 ×수량) · 조건(`conditionTextOf` 그대로 |
 *   「없음 · 수동 주문 — 주문 시각 위치만」 D-13) · 근거 {종류}(근거 행 수신 시각 + 근거 문구 · 구간이면
 *   「체결 구간 n건 · X주 · HH:MM:SS~HH:MM:SS」 · 「보기 ›」 = 근거 행(구간이면 끝 행) + 되돌아가기 기억).
 * 낱말은 shared `strategy-event-text` 정본 그대로 — 근거 문구의 머리 「근거 」 만 키 칸과 겹쳐 뺀다.
 */

export interface TickOwnSectionProps {
  session: TickSession;
  own: OwnModel;
  /** 보일 우리 주문 id. */
  orderId: number;
  /** 커서 이동(근거 · 직전 체결 「보기 ›」). */
  onJump?: (rec: number) => void;
  /** 「보기 ›」 로 떠날 때 되돌아갈 주문 id 를 기억시킨다(D-10 알약). */
  onBack?: (orderId: number) => void;
}

const SIDE_TEXT = { buy: '매수', sell: '매도' } as const;
const SIDE_COLOR = { buy: 'text-[var(--up)]', sell: 'text-[var(--down)]' } as const;

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

/** 「보기 ›」 버튼 — 목업 `.lk`(민트 바탕) · ghost 는 점선 테두리(`.lk.ghost`). */
export function OwnLink({
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

const recvTime = (session: TickSession, rec: number): string => fmtTickTime(session.index.recvNs[rec]!);

export function TickOwnSection({ session, own, orderId, onJump, onBack }: TickOwnSectionProps) {
  const o = own.orders[orderId];
  if (!o) return null;
  const last4 = o.accountNo.length > 0 ? `···${o.accountNo.slice(-4)}` : '';
  const group = ownOrderGroupLabel(o);
  const go = (rec: number) => {
    onBack?.(o.id);
    onJump?.(rec);
  };

  // 근거 줄 값
  let evidence: ReactNode = null;
  if (o.evidenceRec >= 0) {
    const ev = o.evidence;
    let text: string;
    if (ev.kind === 'range') {
      text = `체결 구간 ${fmtQty(ev.n)}건 · ${fmtQty(ev.qty)}주 · ${recvTime(session, o.evidenceFirstRec).slice(0, 8)}~${recvTime(session, o.evidenceRec).slice(0, 8)}`;
    } else {
      const body = (ownEvidenceText(o) ?? '').replace(/^근거 /, '');
      text = body !== '' ? `${recvTime(session, o.evidenceRec)} · ${body}` : recvTime(session, o.evidenceRec);
    }
    evidence = (
      <>
        <span className="mono">{text}</span>
        <OwnLink to="evidence" onClick={() => go(o.evidenceRec)} />
      </>
    );
  }

  return (
    <div
      data-slot="tick-own-section"
      data-order={o.id}
      className="mt-3 border-t border-[var(--border-subtle)] pt-2.5"
    >
      <h4 className="m-0 mb-1.5 flex flex-wrap items-baseline gap-1.5 text-[11px] font-bold text-[var(--mine-fg)]">
        <span>◆ 우리 주문 #{o.orderNo !== '' ? o.orderNo : '—'}</span>
        <small className="text-[11px] font-medium text-[var(--muted-fg)]">
          {o.gateway}
          {last4 !== '' ? ` · 계좌 ${last4}` : ''}
        </small>
      </h4>
      <Ln k="주문" slot="order">
        {o.gwMs !== null ? <span className="mono">{formatKstMs(o.gwMs)}</span> : null}
        {o.gwMs !== null && (group || o.side || o.px !== null || o.qty !== null) ? ' · ' : null}
        {group ? `${group} ` : null}
        {o.side ? <span className={cn('font-semibold', SIDE_COLOR[o.side])}>{SIDE_TEXT[o.side]}</span> : null}
        {(o.px !== null && o.px > 0) || (o.qty !== null && o.qty > 0) ? (
          <b className="mono ml-1 font-semibold">
            {[o.px !== null && o.px > 0 ? fmtQty(o.px) : null, o.qty !== null && o.qty > 0 ? `×${fmtQty(o.qty)}` : null]
              .filter((s) => s !== null)
              .join(' ')}
          </b>
        ) : null}
        {o.gwMs === null && !group && !o.side && o.px === null && o.qty === null ? (
          <span className="text-[var(--muted-fg)]">—</span>
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
          {evidence}
        </Ln>
      )}
    </div>
  );
}
