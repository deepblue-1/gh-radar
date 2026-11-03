'use client';

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { TAG_CODE, fmtTickTime } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import {
  MSG_ITEM,
  RAIL_HALF,
  RAIL_NODE,
  buildMsgRows,
  fmtA3Row,
  fmtB6Row,
  fmtOtherRow,
  inversionText,
  itemIdxOf,
  itemKindOf,
  orderShapeLabel,
  ownLineRec,
  ownRailOf,
  slotText,
  tailInversionText,
  tailText,
  type MsgRowsModel,
} from '@/lib/ticks/msg-rows';
import { ownChipOf, ownOrderLineText, type OwnModel, type OwnSel } from '@/lib/ticks/own-model';
import { fmtAmountC, fmtQty } from '@/lib/ticks/tick-format';
import type { TickSession, ViewOrder } from '@/lib/ticks/tick-session';
import { useFixedWindow } from '@/lib/ticks/use-fixed-window';
import type { TickOrderMode } from '@/lib/ticks/use-tick-cursor';
import { cn } from '@/lib/utils';

/**
 * 틱 뷰어 전문 목록 (Phase 37 D-00 ② · 스케치 020 A 행 그룹 + 뒤집힘 3 채택본).
 *
 * ① 전문은 전부 한 행씩(ATMParser 식). 한 주문(연속 A3 + 닫는 B6)은 왼쪽 레일(팀 `--team` · 일반 `--faint`)로 잇고 묶음 안
 *   행 사이 선을 없앤다 · 둘째 조각부터 시각을 흐리게 · 닫는 B6 앞 「닫는 B6」 점선 칩 · 묶음 끝 꼬리 줄(모양 칩은 꼬리에만 —
 *   1조각 주문은 그 행).
 * ② 머리 「수신순 | 거래소순」(기본 거래소순 — 커서 훅의 모드를 그대로 쓴다. 키 이동 단위도 같은 순서다) · 「↕ 다음 역전」.
 *   뒤집힘 3: 먼저 온 닫는 B6 행 seq 주황 ↕ + 꼬리말(수신순 「↕ 9.0ms 먼저 수신」 · 거래소순 「↕ 수신은 9.0ms 먼저」) ·
 *   꼬리 줄에도 같은 말 · 수신순에서만 msg_seq 제자리에 점선 「⋯ 거래소순 자리」 줄(클릭 = 그 B6).
 *   레이아웃 길이가 안 맞는 전문은 「기타」 행(D-19) · 같은 보드 · seq 재수신은 「중복」 칩만(Pitfall 12).
 * ③ 모든 항목이 같은 높이(데스크톱 24px · 폰 22px · 한 줄 말줄임) — `useFixedWindow` 창 가상화. 커서가 바뀌면 그 행이 보이게
 *   스크롤(nearest) · 순서를 바꾸면 가운데로.
 * ④ 행 클릭 = 그 틱 선택 · 꼬리 클릭 = 그 주문 마지막 조각. 선택 틱과 같은 주문 행은 옅은 보라 띠(스케치 019).
 * ⑤ 우리 체결(Phase 38 D-04 · 목업 B): 짝이 붙은 A3 행은 옅은 민트 바탕(`--mine` 6% · 선택 > 우리 > 같은 주문 띠) +
 *   내용 끝 민트 칩 「n/m」(부분 체결만 분모 · 전량이면 「n」) · 추정이면 옆에 점선 「추정」 칩. 계좌 · 주문번호는 그리지 않는다(D-02).
 * ⑥ 우리 줄(Phase 38 D-05 · D-12): 주문 시각 자리 점선 「● 주문 …」 줄 · 짝 A3 를 못 찾은 체결 점선 「◆ 우리 체결 n주 · 짝 전문 없음」
 *   (당일 대기면 「전문 아직 안 옴」) 줄 — 「⋯ 거래소순 자리」 줄 동형(같은 높이 · 점선 상단선 · 옅은 바탕) · 색만 `--mine`.
 *   계좌 끝 4자리 · 주문번호는 주문 줄에만(D-02). 줄 클릭 = 그 줄 선택(`onOwnSelect` · 민트 18%) + 커서 = 그 줄 다음 전문.
 * ⑦ 둘째 레일(Phase 38 D-04 · 목업 B): 목록 맨 앞 14px 칸 — 우리 주문마다 ● 주문 줄 → ◆ 체결 행을 민트 세로선(3px)으로
 *   잇는다(`ownRailOf`) · 추정이 섞인 주문은 점선 · 짝 없음 ◇(대기는 점선 테두리) · 겹치면 선이 겹친다(옆 칸 없음).
 *   38-06: 근거 전문 행 ○(띠 시작 · 구간 근거는 첫 ○ … 끝 ○ 점선) · 앵커 ◌(마디만 · 글자 없음). 근거 행에 칩은 없다(D-10).
 *   기존 팀/일반 3px 레일(①)은 시각 칸 안쪽에 붙는다. 행 높이 24/22 그대로 · 폰도 14px 칸 유지.
 */

export interface TickMsgListProps {
  session: TickSession;
  cursorRec: number;
  onSelect: (rec: number) => void;
  mode: TickOrderMode;
  onMode: (m: TickOrderMode) => void;
  /** 우리 체결 모델(Phase 38) — 없으면 레일 칸은 비어 있고 우리 줄 · 칩이 없다. */
  own?: OwnModel | null;
  /** 고른 우리 줄(주문 줄 · 짝 없음 줄) — 뷰어가 커서와 맞을 때만 넘긴다(파생). */
  ownSel?: OwnSel | null;
  /** 우리 줄 클릭 — 그 줄과 기준 전문 rec(그 줄 다음 첫 전문). 없으면 행 클릭처럼 `onSelect(rec)`. */
  onOwnSelect?: (sel: OwnSel, rec: number) => void;
  className?: string;
}

const ROW_H_DESKTOP = 24;
const ROW_H_PHONE = 22;
const PHONE_QUERY = '(max-width: 640px)';

/** 폰(≤ 640px) 여부 — 행 높이를 CSS 와 같게 맞추려고만 쓴다. */
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return phone;
}

const MODES: readonly { id: TickOrderMode; label: string }[] = [
  { id: 'recv', label: '수신순' },
  { id: 'exchange', label: '거래소순' },
];

/** 열 — 둘째 레일 14px · 시각 · 종류 · seq · 내용(폰은 µs 생략 · seq 끝 4자리 · 레일 칸 유지). */
const GRID =
  'grid grid-cols-[14px_122px_34px_66px_minmax(0,1fr)] max-[640px]:grid-cols-[14px_84px_30px_42px_minmax(0,1fr)] items-center gap-x-1.5 px-2';

/**
 * 시각 칸 — 앞 간격(6px)까지 왼쪽으로 늘려 그 왼쪽 끝에 팀/일반 3px 레일(`railStyle`)을 붙인다. 글자 자리는 Phase 37 과 같고,
 * 행 높이를 꽉 채워(self-stretch) 묶음 안 레일이 이어진다.
 */
const TIME_CELL = '-ml-1.5 flex min-w-0 items-center self-stretch pl-1.5';

/** 둘째 레일 절반 선(목업 `.rail` — left 5px · 3px). 점선 = 3px 칠 · 3px 빔 반복. */
const RAIL_LINE = 'pointer-events-none absolute left-[5px] h-1/2 w-[3px]';
const RAIL_DASH: CSSProperties = {
  background: 'repeating-linear-gradient(to bottom, var(--mine) 0 3px, transparent 3px 6px)',
};
const RAIL_NODE_NAME: Record<number, string> = {
  [RAIL_NODE.ORDER]: 'order',
  [RAIL_NODE.FILL]: 'fill',
  [RAIL_NODE.NOFILL]: 'nofill',
  [RAIL_NODE.EVIDENCE]: 'evidence',
  [RAIL_NODE.ANCHOR]: 'anchor',
};

/**
 * 둘째 레일 칸 — 위 · 아래 절반 선 + 마디(● 주문 11px 원 · ◆ 체결 9px 45° 채움 · ◇ 짝 없음 9px 45° 빈 · 대기는 점선 테두리 ·
 * ○ 근거 11px 빈 원 · ◌ 앵커 7px `--faint` 빈 원 — 목업 `.rk` · `.rk.anc`).
 */
function OwnRailCell({ half, node, pending }: { half: number; node: number; pending: boolean }) {
  return (
    <span
      data-slot="tick-own-rail"
      data-node={RAIL_NODE_NAME[node]}
      aria-hidden
      className="relative self-stretch"
    >
      {(half & (RAIL_HALF.TOP | RAIL_HALF.TOP_DASH)) !== 0 && (
        <span
          className={cn(RAIL_LINE, 'top-0', half & RAIL_HALF.TOP && 'bg-[var(--mine)]')}
          style={half & RAIL_HALF.TOP ? undefined : RAIL_DASH}
        />
      )}
      {(half & (RAIL_HALF.BOT | RAIL_HALF.BOT_DASH)) !== 0 && (
        <span
          className={cn(RAIL_LINE, 'bottom-0', half & RAIL_HALF.BOT && 'bg-[var(--mine)]')}
          style={half & RAIL_HALF.BOT ? undefined : RAIL_DASH}
        />
      )}
      {node === RAIL_NODE.ORDER && (
        <span className="pointer-events-none absolute top-1/2 left-px -mt-[5.5px] size-[11px] rounded-full border-2 border-[var(--mine)] bg-[var(--mine)]" />
      )}
      {node === RAIL_NODE.FILL && (
        <span className="pointer-events-none absolute top-1/2 left-[2px] -mt-[4.5px] size-[9px] rotate-45 rounded-[2px] bg-[var(--mine)]" />
      )}
      {node === RAIL_NODE.NOFILL && (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 left-[2px] -mt-[4.5px] size-[9px] rotate-45 rounded-[2px] border-2 border-[var(--mine)] bg-[var(--card)]',
            pending && 'border-dashed',
          )}
        />
      )}
      {node === RAIL_NODE.EVIDENCE && (
        <span className="pointer-events-none absolute top-1/2 left-px -mt-[5.5px] size-[11px] rounded-full border-2 border-[var(--mine)] bg-[var(--card)]" />
      )}
      {node === RAIL_NODE.ANCHOR && (
        <span className="pointer-events-none absolute top-1/2 left-[3px] -mt-[3.5px] size-[7px] rounded-full border-2 border-[var(--faint)] bg-[var(--card)]" />
      )}
    </span>
  );
}

const TAG_LABEL: Record<number, string> = {
  [TAG_CODE.A3]: 'A3',
  [TAG_CODE.B6]: 'B6',
  [TAG_CODE.R8]: 'R8',
  [TAG_CODE.B9]: 'B9',
  [TAG_CODE.C3]: 'C3',
  [TAG_CODE.A0]: 'A0',
  [TAG_CODE.OTHER]: '기타',
};

const TAG_BADGE: Record<number, string> = {
  [TAG_CODE.A3]: 'bg-[var(--muted)] text-[var(--fg)]',
  [TAG_CODE.B6]: 'border-[var(--border-subtle)] text-[var(--muted-fg)]',
  [TAG_CODE.B9]: 'bg-[var(--team-bg)] text-[var(--team)]',
  [TAG_CODE.R8]: 'bg-[var(--vi-bg)] text-[var(--vi)]',
  [TAG_CODE.C3]: 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]',
  [TAG_CODE.A0]: 'bg-[var(--muted)] text-[var(--muted-fg)]',
  [TAG_CODE.OTHER]: 'bg-[var(--muted)] text-[var(--muted-fg)]',
};

const CHIP = 'ml-1.5 inline-flex h-4 flex-none items-center rounded-[4px] px-[5px] align-middle text-[9.5px] font-bold';

export function ShapeChip({ order, className }: { order: ViewOrder; className?: string }) {
  const auction = order.kind === '단일가';
  return (
    <span
      data-slot="tick-shape-chip"
      className={cn(
        CHIP,
        auction
          ? 'bg-[var(--vi-bg)] text-[var(--vi)]'
          : order.team
            ? 'bg-[var(--team-bg)] text-[var(--team)]'
            : 'bg-[var(--muted)] text-[var(--muted-fg)]',
        className,
      )}
    >
      {orderShapeLabel(order)}
    </span>
  );
}

function railStyle(order: ViewOrder | null, sel: boolean): CSSProperties | undefined {
  if (order && order.pieces >= 2) return { boxShadow: `inset 3px 0 0 var(${order.team ? '--team' : '--faint'})` };
  if (sel) return { boxShadow: 'inset 3px 0 0 var(--fg)' };
  return undefined;
}

const DIR_COLOR = { 1: 'text-[var(--up)]', 0: 'text-[var(--flat)]', [-1]: 'text-[var(--down)]' } as const;
const SIDE_COLOR = { buy: 'text-[var(--up)]', sell: 'text-[var(--down)]', auction: 'text-[var(--muted-fg)]' } as const;

function contentOf(session: TickSession, rec: number, order: ViewOrder | null, mode: TickOrderMode): ReactNode {
  const tag = session.index.tag[rec];
  if (tag === TAG_CODE.A3) {
    const a = fmtA3Row(session, rec);
    if (a) {
      const sign = a.side === 'buy' ? '+' : a.side === 'sell' ? '−' : '';
      return (
        <>
          <b className={cn('mono font-semibold', DIR_COLOR[a.dir])}>{fmtQty(a.px)}</b>{' '}
          <span className={cn('mono font-semibold', SIDE_COLOR[a.side])}>
            {sign}
            {fmtQty(a.qty)}
          </span>
          <span className="mono text-[var(--muted-fg)]"> ({fmtAmountC(a.amount)})</span>{' '}
          <span className="text-[var(--muted-fg)]">
            {a.side === 'buy' ? '매수' : a.side === 'sell' ? '매도' : '단일가'}
            {a.zz && a.side !== 'auction' ? ' · 0/0' : ''}
          </span>
          {order && order.pieces < 2 && <ShapeChip order={order} />}
        </>
      );
    }
  }
  if (tag === TAG_CODE.B6) {
    const b = fmtB6Row(session, rec);
    if (b) {
      const closing = order !== null && order.pieces >= 2 && order.closingB6Rec === rec;
      const inv = session.inversionOfB6.get(rec);
      return (
        <>
          {closing && (
            <span
              data-slot="tick-msg-closing"
              className="mr-1.5 inline-flex h-4 items-center rounded-[4px] border border-dashed border-[var(--border-subtle)] px-[5px] align-middle text-[9.5px] font-bold text-[var(--muted-fg)]"
            >
              닫는 B6
            </span>
          )}
          <span className="mono text-[var(--fg)]">{b.text}</span>
          {inv && (
            <span data-slot="tick-msg-inv" className="ml-1.5 text-[10px] font-semibold text-[var(--vi)]">
              {inversionText(mode, inv.leadNs)}
            </span>
          )}
        </>
      );
    }
  }
  const other = fmtOtherRow(session, rec);
  const tone =
    session.index.ok[rec] !== 1
      ? 'text-[var(--muted-fg)]'
      : tag === TAG_CODE.R8
        ? 'font-semibold text-[var(--vi)]'
        : tag === TAG_CODE.B9
          ? 'text-[var(--fg-2)]'
          : 'text-[var(--muted-fg)]';
  return <span className={tone}>{other || TAG_LABEL[tag ?? TAG_CODE.OTHER]}</span>;
}

interface RowProps {
  session: TickSession;
  model: MsgRowsModel;
  item: number;
  pos: number;
  /** 직전 항목이 같은 주문 묶음인가(레일 이어짐 · 선 없음). */
  joined: boolean;
  sel: boolean;
  band: boolean;
  phone: boolean;
  onSelect: (rec: number) => void;
  /** 우리 체결 칩(ROW 만 · 원시값 — memo 유지) — 우리 수량 · 그 A3 수량 · 추정. ownOur 0 = 칩 없음. */
  ownOur?: number;
  ownTotal?: number;
  ownEst?: boolean;
  /** 우리 모델 — ORDER · NOFILL 줄만 읽는다. */
  own: OwnModel | null;
  /** 둘째 레일(원시값 — memo 유지) — `RAIL_HALF` 비트 · `RAIL_NODE`. */
  railHalf: number;
  railNode: number;
  /** 이 우리 줄이 골라졌나(ORDER · NOFILL 만). */
  ownSelected: boolean;
  onOwnSelect?: (sel: OwnSel, rec: number) => void;
}

/** 우리 줄(주문 · 짝 없음) — 「⋯ 거래소순 자리」 줄 동형 · 색만 `--mine`. */
const OWN_LINE =
  'h-6 max-[640px]:h-[22px] cursor-pointer overflow-hidden whitespace-nowrap border-t border-dashed border-t-[color-mix(in_oklab,var(--mine)_60%,transparent)] bg-[color-mix(in_oklab,var(--mine)_7%,transparent)] text-[10.5px] text-[var(--mine-fg)]';

/** 짝 없는 · 대기 체결 줄 문구(D-12 · Pitfall 4). */
function ownNoFillText(qty: number, pending: boolean): string {
  return `◆ 우리 체결 ${fmtQty(qty)}주 · ${pending ? '전문 아직 안 옴' : '짝 전문 없음'}`;
}

const BADGE =
  'inline-flex h-[17px] items-center rounded-[4px] border border-transparent px-[5px] align-middle text-[9.5px] font-bold';

function seqText(seq: number, phone: boolean): string {
  if (seq < 0) return '—';
  return phone ? `…${String(seq).slice(-4)}` : fmtQty(seq);
}

const MsgRow = memo(function MsgRow({
  session,
  model,
  item,
  pos,
  joined,
  sel,
  band,
  phone,
  onSelect,
  ownOur = 0,
  ownTotal = 0,
  ownEst = false,
  own,
  railHalf,
  railNode,
  ownSelected,
  onOwnSelect,
}: RowProps) {
  const kind = itemKindOf(item);
  const idx = itemIdxOf(item);
  const { mode } = model;
  const ours = kind === MSG_ITEM.ROW && ownOur > 0;
  const pending = kind === MSG_ITEM.NOFILL && own !== null && own.fills[idx]?.state === 'pending';
  const rail = <OwnRailCell half={railHalf} node={railNode} pending={pending} />;
  const rowCls = cn(
    GRID,
    'h-6 max-[640px]:h-[22px] cursor-pointer overflow-hidden whitespace-nowrap border-t text-[11.5px]',
    joined ? 'border-t-transparent' : 'border-[var(--border-subtle)]',
    sel
      ? 'bg-[color-mix(in_oklab,var(--fg)_12%,transparent)]'
      : ours
        ? 'bg-[color-mix(in_oklab,var(--mine)_6%,transparent)]'
        : band
          ? 'bg-[color-mix(in_oklab,var(--team)_8%,transparent)]'
          : 'hover:bg-[color-mix(in_oklab,var(--muted)_70%,transparent)]',
  );

  if (kind === MSG_ITEM.TAIL) {
    const order = session.orders[idx]!;
    const last = order.recs[order.recs.length - 1]!;
    const inv = order.closingB6Rec === null ? undefined : session.inversionOfB6.get(order.closingB6Rec);
    return (
      <div
        role="option"
        aria-selected={false}
        data-slot="tick-msg-tail"
        data-order={idx}
        data-pos={pos}
        onClick={() => onSelect(last)}
        className={cn(
          rowCls,
          'grid-cols-[14px_minmax(0,1fr)] max-[640px]:grid-cols-[14px_minmax(0,1fr)] text-[10.5px] text-[var(--muted-fg)]',
        )}
      >
        {rail}
        {/* 꼬리 글자는 시각 글자보다 14px 안쪽(Phase 37 과 같은 들여쓰기) · 레일은 시각 칸과 같은 자리 */}
        <span className={cn(TIME_CELL, 'pl-5')} style={railStyle(order, false)}>
          <span className="min-w-0 truncate">
            <span className="mono">{tailText(order)}</span>
            <ShapeChip order={order} className="ml-1" />
            {order.open && <span className={cn(CHIP, 'ml-1 bg-[var(--vi-bg)] text-[var(--vi)]')}>진행 중</span>}
            {inv && <span className="ml-1 font-semibold text-[var(--vi)]">{tailInversionText(mode, inv.leadNs)}</span>}
          </span>
        </span>
      </div>
    );
  }

  if (kind === MSG_ITEM.SLOT) {
    // 수신순에서만 — 먼저 온 B6 의 msg_seq 제자리(점선 · 주황). 클릭 = 그 B6 선택.
    const b6 = idx;
    const oid = session.orderOfRec[b6]!;
    const order = oid >= 0 ? session.orders[oid]! : null;
    return (
      <div
        role="option"
        aria-selected={false}
        data-slot="tick-msg-slot"
        data-rec={b6}
        data-pos={pos}
        onClick={() => onSelect(b6)}
        className={cn(
          GRID,
          'h-6 max-[640px]:h-[22px] cursor-pointer overflow-hidden whitespace-nowrap border-t border-dashed border-t-[color-mix(in_oklab,var(--vi)_60%,transparent)] bg-[color-mix(in_oklab,var(--vi)_6%,transparent)] text-[10.5px] text-[var(--vi)]',
        )}
      >
        {rail}
        <span className={TIME_CELL} style={railStyle(order, false)}>
          <span className="mono">⋯</span>
        </span>
        <span>
          <span className={cn(BADGE, TAG_BADGE[TAG_CODE.B6], 'opacity-60')}>B6</span>
        </span>
        <span className="mono truncate">{seqText(session.index.seq[b6]!, phone)}</span>
        <span className="min-w-0 truncate">{slotText(session, model, b6)}</span>
      </div>
    );
  }

  if ((kind === MSG_ITEM.ORDER || kind === MSG_ITEM.NOFILL) && own !== null) {
    // 우리 줄 — 주문 시각 「● 주문 …」 · 짝 없는 체결 「◆ 우리 체결 n주 · 짝 전문 없음」. 클릭 = 그 줄 다음 전문.
    const isOrder = kind === MSG_ITEM.ORDER;
    const o = isOrder ? own.orders[idx]! : null;
    const f = isOrder ? null : own.fills[idx]!;
    const gwMs = isOrder ? o!.gwMs! : f!.gwMs;
    const text = isOrder ? ownOrderLineText(o!) : ownNoFillText(f!.qty, f!.state === 'pending');
    return (
      <div
        role="option"
        aria-selected={ownSelected}
        data-slot={isOrder ? 'tick-own-order' : 'tick-own-nofill'}
        data-own-id={idx}
        data-pending={pending ? '1' : undefined}
        data-pos={pos}
        onClick={() => {
          const rec = ownLineRec(model, pos);
          if (rec < 0) return;
          if (onOwnSelect) onOwnSelect({ kind: isOrder ? 'order' : 'fill', id: idx }, rec);
          else onSelect(rec);
        }}
        title={text}
        className={cn(GRID, OWN_LINE, ownSelected && 'bg-[color-mix(in_oklab,var(--mine)_18%,transparent)]')}
      >
        {rail}
        <span className={TIME_CELL}>
          <span className="mono font-semibold">{fmtTickTime(BigInt(gwMs) * 1_000_000n)}</span>
        </span>
        <span>
          <span className={cn(BADGE, 'border-[var(--mine)] text-[var(--mine-fg)]')}>{isOrder ? '주문' : '체결'}</span>
        </span>
        <span className="mono">—</span>
        <span className="min-w-0 truncate">{text}</span>
      </div>
    );
  }

  const rec = idx;
  const { index } = session;
  const ok = index.ok[rec] === 1;
  const tag = ok ? index.tag[rec]! : TAG_CODE.OTHER;
  const oid = session.orderOfRec[rec]!;
  const order = oid >= 0 ? session.orders[oid]! : null;
  const recvNs = index.recvNs[rec]!;
  const us = String(Number((recvNs / 1000n) % 1000n)).padStart(3, '0');
  const seq = index.seq[rec]!;
  const dimTime = joined && tag === TAG_CODE.A3 && order !== null && order.pieces >= 2;
  const inverted = session.inversionOfB6.has(rec);
  return (
    <div
      role="option"
      aria-selected={sel}
      data-slot="tick-msg-row"
      data-rec={rec}
      data-tag={TAG_LABEL[tag]}
      data-seq={seq >= 0 ? seq : undefined}
      data-pos={pos}
      data-own={ours ? '1' : undefined}
      onClick={() => onSelect(rec)}
      className={rowCls}
    >
      {rail}
      <span className={TIME_CELL} style={railStyle(order, sel)}>
        <span className={cn('mono text-[11px]', dimTime ? 'text-[var(--muted-fg)]' : 'text-[var(--fg)]')}>
          {fmtTickTime(recvNs)}
          {!phone && <span className="text-[var(--muted-fg)]"> {us}</span>}
        </span>
      </span>
      <span>
        <span className={cn(BADGE, TAG_BADGE[tag])}>{TAG_LABEL[tag]}</span>
      </span>
      <span className={cn('mono truncate text-[10.5px]', inverted ? 'font-bold text-[var(--vi)]' : 'text-[var(--muted-fg)]')}>
        {seqText(seq, phone)}
        {inverted && (
          <span data-slot="tick-msg-inv-mark" className="ml-0.5">
            ↕
          </span>
        )}
      </span>
      <span className="min-w-0 truncate">
        {contentOf(session, rec, order, mode)}
        {session.duplicates[rec] === 1 && (
          <span data-slot="tick-msg-dup" className={cn(CHIP, 'bg-[var(--muted)] text-[var(--muted-fg)]')}>
            중복
          </span>
        )}
        {ours && (
          <span data-slot="tick-own-chip" className={cn(CHIP, 'bg-[var(--mine-bg)] text-[var(--mine-fg)]')}>
            {ownOur < ownTotal ? `${fmtQty(ownOur)}/${fmtQty(ownTotal)}` : fmtQty(ownOur)}
          </span>
        )}
        {ours && ownEst && (
          <span
            data-slot="tick-own-est"
            className={cn(CHIP, 'ml-1 border border-dashed border-[var(--mine)] bg-transparent text-[var(--mine-fg)]')}
          >
            추정
          </span>
        )}
      </span>
    </div>
  );
});

/** 항목 k 가 직전 항목과 같은 주문 묶음(2조각 이상)인가. */
function joinedAt(session: TickSession, model: MsgRowsModel, k: number): boolean {
  if (k <= 0) return false;
  const orderAt = (item: number): number => {
    const kind = itemKindOf(item);
    const idx = itemIdxOf(item);
    if (kind === MSG_ITEM.TAIL) return idx;
    // 우리 줄은 전문 묶음 밖 — 묶음 한가운데에 오지 않게 buildMsgRows 가 꼬리 뒤로 민다(Pitfall 3)
    if (kind === MSG_ITEM.ORDER || kind === MSG_ITEM.NOFILL) return -1;
    return session.orderOfRec[idx]!;
  };
  const a = orderAt(model.items[k]!);
  if (a < 0 || session.orders[a]!.pieces < 2) return false;
  return orderAt(model.items[k - 1]!) === a;
}

export function TickMsgList({
  session,
  cursorRec,
  onSelect,
  mode,
  onMode,
  own = null,
  ownSel = null,
  onOwnSelect,
  className,
}: TickMsgListProps) {
  const model = useMemo(() => buildMsgRows(session, mode, own), [session, mode, own]);
  const rail = useMemo(() => ownRailOf(model, own), [model, own]);
  const ownSelPos =
    ownSel === null
      ? -1
      : ownSel.kind === 'order'
        ? (model.ownPosOfOrder[ownSel.id] ?? -1)
        : (model.ownPosOfFill[ownSel.id] ?? -1);
  const phone = useIsPhone();
  const rowH = phone ? ROW_H_PHONE : ROW_H_DESKTOP;
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = model.items.length;
  const win = useFixedWindow({ count, rowH, ref: scrollRef });
  const { scrollToIndex } = win;

  const selPos = cursorRec >= 0 ? model.posOfRec[cursorRec]! : -1;
  const selOrder = cursorRec >= 0 ? session.orderOfRec[cursorRec]! : -1;

  // 커서가 바뀌면 그 행이 보이게 — 순서를 바꾼 직후(모델이 바뀜)는 가운데로.
  const lastModel = useRef<MsgRowsModel | null>(null);
  useEffect(() => {
    if (selPos < 0) return;
    const changed = lastModel.current !== model;
    lastModel.current = model;
    scrollToIndex(selPos, changed ? 'center' : 'nearest');
  }, [selPos, model, scrollToIndex]);

  const rows: ReactNode[] = [];
  for (let k = win.first; k <= win.last; k++) {
    const item = model.items[k]!;
    const kind = itemKindOf(item);
    const idx = itemIdxOf(item);
    const oid =
      kind === MSG_ITEM.TAIL
        ? idx
        : kind === MSG_ITEM.ORDER || kind === MSG_ITEM.NOFILL
          ? -1
          : session.orderOfRec[idx]!;
    const chip = own !== null && kind === MSG_ITEM.ROW ? ownChipOf(own, idx) : null;
    rows.push(
      <MsgRow
        key={item}
        session={session}
        model={model}
        item={item}
        pos={k}
        joined={joinedAt(session, model, k)}
        sel={k === selPos}
        band={selOrder >= 0 && oid === selOrder}
        phone={phone}
        onSelect={onSelect}
        ownOur={chip?.our}
        ownTotal={chip?.total}
        ownEst={chip?.est}
        own={own}
        railHalf={rail.half[k] ?? 0}
        railNode={rail.node[k] ?? 0}
        ownSelected={k === ownSelPos}
        onOwnSelect={onOwnSelect}
      />,
    );
  }

  const nextInv = model.nextInversionFrom(selPos);
  const multi = useMemo(() => session.orders.reduce((n, o) => n + (o.pieces >= 2 ? 1 : 0), 0), [session]);

  return (
    <section
      data-slot="tick-msg"
      data-mode={mode}
      aria-label="전문 목록"
      className={cn(CARD, 'flex min-h-0 min-w-0 flex-col overflow-hidden', className)}
    >
      <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--border-subtle)] px-3 py-[7px]">
        <h2 className="m-0 text-[12.5px] font-bold text-[var(--fg)]">전문</h2>
        <small data-slot="tick-msg-meta" className="truncate text-[11px] text-[var(--muted-fg)] max-[640px]:hidden">
          {fmtQty(session.index.n)}건 · 주문 {fmtQty(multi)}묶음 · 역전 {fmtQty(session.inversions.length)}
        </small>
        <span className="ml-auto inline-flex flex-none items-center gap-1.5">
          <button
            type="button"
            data-slot="tick-msg-next-inv"
            disabled={nextInv < 0}
            onClick={() => nextInv >= 0 && onSelect(itemIdxOf(model.items[nextInv]!))}
            className="inline-flex h-[22px] items-center rounded-[7px] bg-[var(--vi-bg)] px-2 text-[10.5px] font-semibold text-[var(--vi)] disabled:opacity-40"
          >
            ↕ 다음 역전
          </button>
          <span role="group" aria-label="전문 순서" className="inline-flex rounded-full bg-[var(--muted)] p-0.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={m.id === mode}
                onClick={() => m.id !== mode && onMode(m.id)}
                className={cn(
                  'rounded-full px-[9px] py-[3px] text-[11px] font-semibold',
                  m.id === mode ? 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]' : 'text-[var(--fg-2)]',
                )}
              >
                {m.label}
              </button>
            ))}
          </span>
        </span>
      </div>
      <div
        className={cn(
          GRID,
          'h-6 flex-none bg-[var(--muted)] text-[10.5px] font-semibold whitespace-nowrap text-[var(--muted-fg)]',
        )}
      >
        <span aria-hidden />
        <span>수신 시각</span>
        <span>종류</span>
        <span>seq</span>
        <span>내용</span>
      </div>
      <div
        ref={scrollRef}
        role="listbox"
        aria-label="전문"
        data-slot="tick-msg-scroll"
        className="min-h-0 flex-1 overflow-auto [overflow-anchor:none]"
      >
        <div style={{ height: win.padTop }} aria-hidden />
        {rows}
        <div style={{ height: win.padBottom }} aria-hidden />
      </div>
    </section>
  );
}
