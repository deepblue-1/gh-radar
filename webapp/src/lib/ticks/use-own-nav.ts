'use client';

/**
 * useOwnNav — 제목 줄 「◆ 우리 k/n · 주문 m ‹ ›」 알약 · 키 `[` `]` (Phase 38 D-09).
 *
 * ① 탐색 대상 = 조건 근거 행(○ · 구간이면 첫 · 끝) ∪ 「● 주문」 줄 ∪ 우리 체결 A3 행 ∪ 짝 없음 · 대기 줄 — 전문 목록 항목
 *   자리(`MsgRowsModel` · 현재 정렬 순열) 오름차순(UAT 2026-11-03 — 체결만이 아니라 주문 · 근거도 밟는다).
 *   같은 자리에 겹친 대상(한 A3 의 체결 여럿 · 근거이자 체결인 행)은 한 자리. `ownNavOf` 가 만든다.
 * ② 현재 자리 = 고른 우리 줄(짝 없음 줄 · 주문 줄)이 있으면 그 줄 자리 · 아니면 커서 rec 의 행 자리.
 *   k = 현재 자리 이하 대상 수 · ‹ = 현재 자리보다 앞 마지막 대상 · › = 뒤 첫 대상(없으면 null — 버튼 비활성).
 * ③ 이동 — 대상이 전문 행(체결 A3 · 근거)이면 커서를 그 rec 로 · 주문 줄 · 짝 없음 줄이면 그 줄 선택(`pickLine`) + 기준 전문
 *   (`ownLineRec`).
 * ④ 키 `[` 이전 · `]` 다음 — 입력칸 포커스 · Ctrl/Meta/Alt · 이미 처리된 이벤트는 가로채지 않는다(`useTickCursor` 가드와 같은 순서).
 *   기존 `←` `→` · `Space` · 차트 `+ − 0` 과 겹치지 않는다.
 * ⑤ 반환 객체는 k · n · 주문 수 · 앞뒤 있음 여부가 바뀔 때만 새로 만든다 — prev/next 는 최신 값을 ref 로 보는 고정 함수라
 *   뷰어가 이 객체를 페이지로 올려도(`onOwn`) 렌더마다 갱신이 돌지 않는다. own 이 없거나 (n 0 ∧ 주문 0) 이면 null(알약 없음).
 * URL 은 건드리지 않는다(D-02 — 커서 `t` 는 `useTickCursor` 기존 규칙).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { MSG_ITEM, itemIdxOf, itemKindOf, ownLineRec, type MsgRowsModel } from './msg-rows';
import type { OwnModel, OwnSel } from './own-model';
import { isTypingTarget } from './use-tick-cursor';

export interface OwnNavState {
  /** 현재 자리 이하 대상 수(처음 대상 앞이면 0). */
  k: number;
  /** 탐색 대상 수(근거 · 주문 줄 · 체결 · 짝 없음 줄). */
  n: number;
  /** 그날 우리 주문 수. */
  orders: number;
  prev: (() => void) | null;
  next: (() => void) | null;
}

const EMPTY = new Int32Array(0);

/** 탐색 대상 항목 자리 — 오름차순 · 중복 없음(머리 주석 ①). */
export function ownNavOf(rows: MsgRowsModel, own: OwnModel): Int32Array {
  const out: number[] = [];
  const atRec = (rec: number) => {
    const p = rec >= 0 ? (rows.posOfRec[rec] ?? -1) : -1;
    if (p >= 0) out.push(p);
  };
  for (const f of own.fills) {
    const p = f.rec >= 0 ? (rows.posOfRec[f.rec] ?? -1) : (rows.ownPosOfFill[f.id] ?? -1);
    if (p >= 0) out.push(p);
  }
  for (const o of own.orders) {
    const p = rows.ownPosOfOrder[o.id] ?? -1;
    if (p >= 0) out.push(p);
    atRec(o.evidenceRec);
    if (o.evidenceFirstRec !== o.evidenceRec) atRec(o.evidenceFirstRec);
  }
  const sorted = Int32Array.from(out).sort();
  let m = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i] !== sorted[i - 1]) sorted[m++] = sorted[i]!;
  }
  return sorted.slice(0, m);
}

/** 첫 자리 ≥ x 의 색인(lower bound). */
function lowerBound(a: Int32Array, x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 현재 자리 — 고른 우리 줄이 있으면 그 줄 · 아니면 커서 행(머리 주석 ②). */
function currentPosOf(rows: MsgRowsModel, cursorRec: number, ownSel: OwnSel | null): number {
  if (ownSel !== null) {
    const p = ownSel.kind === 'fill' ? (rows.ownPosOfFill[ownSel.id] ?? -1) : (rows.ownPosOfOrder[ownSel.id] ?? -1);
    if (p >= 0) return p;
  }
  return cursorRec >= 0 && cursorRec < rows.posOfRec.length ? rows.posOfRec[cursorRec]! : -1;
}

export interface UseOwnNavArgs {
  rows: MsgRowsModel;
  own: OwnModel | null;
  cursorRec: number;
  ownSel: OwnSel | null;
  jumpToRec: (rec: number) => void;
  /** 짝 없음 줄 선택 — (줄, 기준 rec). 뷰어의 `onOwnSelect`. */
  pickLine: (sel: OwnSel, rec: number) => void;
}

export function useOwnNav({ rows, own, cursorRec, ownSel, jumpToRec, pickLine }: UseOwnNavArgs): OwnNavState | null {
  const targets = useMemo(() => (own ? ownNavOf(rows, own) : EMPTY), [rows, own]);
  const cur = currentPosOf(rows, cursorRec, ownSel);
  const lb = lowerBound(targets, cur);
  const ub = lb < targets.length && targets[lb] === cur ? lb + 1 : lb;
  const prevPos = lb > 0 ? targets[lb - 1]! : -1;
  const nextPos = ub < targets.length ? targets[ub]! : -1;

  const go = useCallback(
    (pos: number) => {
      const it = rows.items[pos];
      if (it === undefined) return;
      const kind = itemKindOf(it);
      if (kind === MSG_ITEM.ROW) {
        jumpToRec(itemIdxOf(it));
      } else if (kind === MSG_ITEM.NOFILL || kind === MSG_ITEM.ORDER) {
        const at = ownLineRec(rows, pos);
        if (at >= 0) pickLine({ kind: kind === MSG_ITEM.ORDER ? 'order' : 'fill', id: itemIdxOf(it) }, at);
      }
    },
    [rows, jumpToRec, pickLine],
  );

  // 최신 값 — 고정 함수 prev/next · 창 keydown 이 본다(머리 주석 ⑤).
  const latest = useRef({ prevPos, nextPos, go, on: own !== null });
  useEffect(() => {
    latest.current = { prevPos, nextPos, go, on: own !== null };
  });
  const goPrev = useCallback(() => {
    const s = latest.current;
    if (s.prevPos >= 0) s.go(s.prevPos);
  }, []);
  const goNext = useCallback(() => {
    const s = latest.current;
    if (s.nextPos >= 0) s.go(s.nextPos);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' && e.key !== ']') return;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const s = latest.current;
      if (!s.on) return;
      const pos = e.key === '[' ? s.prevPos : s.nextPos;
      if (pos < 0) return;
      e.preventDefault();
      s.go(pos);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const n = targets.length;
  const orders = own?.orders.length ?? 0;
  const hasOwn = own !== null;
  const hasPrev = prevPos >= 0;
  const hasNext = nextPos >= 0;
  return useMemo(
    () =>
      !hasOwn || (n === 0 && orders === 0)
        ? null
        : { k: ub, n, orders, prev: hasPrev ? goPrev : null, next: hasNext ? goNext : null },
    [hasOwn, n, orders, ub, hasPrev, hasNext, goPrev, goNext],
  );
}
