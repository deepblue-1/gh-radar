'use client';

/**
 * useStickToBottom — 목록 **자체 스크롤러**의 맨 아래 고정 (Phase 25-07 · UI-SPEC ②-0 「스크롤 고정」 · R1).
 *
 * ① 스크롤 주인은 목록 스크롤러다 — 페이지(`main`)가 아니다 (RESEARCH Pitfall 11)
 *   앱 셸 `main` 은 `overflow-auto` 라 페이지 스크롤로는 「맨 아래」 를 판정할 수 없다. 공용 패널 172px ·
 *   카드 탭 본문 · 창 분리 뷰포트 높이 스크롤러가 각자 이 훅을 쓴다.
 *
 * ② 「맨 아래」 = `scrollHeight − scrollTop − clientHeight ≤ thresholdPx`(기본 24 — 줄 1개 ≈ 18.7px 보다 조금 커서
 *   반 줄 어긋남에 핀이 깜빡이지 않는다 · R1). 판정은 **스크롤 이벤트 시점**의 값을 기억한다 — 새 줄이 그려진
 *   뒤에 재면 늘어난 높이 때문에 늘 「맨 아래 아님」 이 된다.
 *
 * ③ 줄 수가 늘면(layout effect — 페인트 전)
 *   맨 아래였으면 즉시 `scrollTop = scrollHeight`(부드러운 스크롤 아님), 올려 보는 중이면 위치를 지키고 증가분을
 *   `pending` 에 누적한다(핀 「새 로그 N」). 줄 수 **감소**(스토어 상한 트림 · 필터 축소)는 무시한다.
 *
 * ④ 사용자가 직접 맨 아래까지 내리거나 `scrollToBottom()` 을 부르면 pending 0. `resetKey` 가 바뀌면(마운트 ·
 *   필터 변경 · 날짜 이동) 맨 아래로 · pending 0. `scrollToBottom(smooth)` 는 reduced-motion 이면 즉시.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface UseStickToBottomOptions {
  /** 맨 아래 판정 여유(px). */
  thresholdPx?: number;
  /** 바뀌면 맨 아래로 · pending 0 (필터 · 날짜). */
  resetKey?: unknown;
}

export interface StickToBottom<T extends HTMLElement> {
  ref: RefObject<T | null>;
  atBottom: boolean;
  /** 올려 보는 중 도착한 줄 수. */
  pending: number;
  scrollToBottom: (smooth?: boolean) => void;
}

function distanceToBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function useStickToBottom<T extends HTMLElement>(
  itemCount: number,
  { thresholdPx = 24, resetKey }: UseStickToBottomOptions = {},
): StickToBottom<T> {
  const ref = useRef<T | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const [pending, setPending] = useState(0);
  const prevCountRef = useRef(itemCount);

  const markBottom = useCallback((bottom: boolean) => {
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    if (bottom) setPending(0);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const onScroll = () => markBottom(distanceToBottom(el) <= thresholdPx);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [thresholdPx, markBottom]);

  // ③ 줄 수 증가 — 따라감 또는 누적. (아래 resetKey 효과보다 먼저 선언 — 같은 커밋이면 reset 이 이긴다.)
  useLayoutEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = itemCount;
    const delta = itemCount - prev;
    if (delta <= 0) return;
    const el = ref.current;
    if (el === null) return;
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    else setPending((n) => n + delta);
  }, [itemCount]);

  // ④ 마운트 · 필터 변경 · 날짜 이동 — 맨 아래로.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
    markBottom(true);
  }, [resetKey, markBottom]);

  const scrollToBottom = useCallback(
    (smooth = true) => {
      const el = ref.current;
      if (el === null) return;
      const behavior: ScrollBehavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
      if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior });
      else el.scrollTop = el.scrollHeight;
      markBottom(true);
    },
    [markBottom],
  );

  return { ref, atBottom, pending, scrollToBottom };
}
