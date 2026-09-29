'use client';

/**
 * useStickToBottom — 목록 **자체 스크롤러**의 맨 아래 고정 (Phase 25-07 · UI-SPEC ②-0 「스크롤 고정」 · R1).
 *
 * ① 스크롤 주인은 목록 스크롤러다 — 페이지(`main`)가 아니다 (RESEARCH Pitfall 11)
 *   앱 셸 `main` 은 `overflow-auto` 라 페이지 스크롤로는 「맨 아래」 를 판정할 수 없다. 공용 패널 172px ·
 *   카드 탭 본문 · 창 분리 뷰포트 높이 스크롤러가 각자 이 훅을 쓴다.
 *
 * ② 「맨 아래」 = `scrollHeight − scrollTop − clientHeight ≤ thresholdPx`(기본 24 — 줄 1개 ≈ 18.7px 보다 조금 커서
 *   반 줄 어긋남에 핀이 깜빡이지 않는다 · R1). 새 줄이 그려진 **뒤**에 재면 늘어난 높이 때문에 늘 「맨 아래 아님」 이라,
 *   직전 커밋의 `scrollHeight` 를 기억해 두고 **삽입 전 거리** = 지금 거리 − 늘어난 높이 로 판정한다.
 *   스크롤 이벤트 시점 값에 기대지 않는다 — 스크롤 이벤트는 다음 프레임에 비동기로 오므로, 사용자가 막 올린 그 프레임에
 *   푸시가 먼저 도착하면 「아직 맨 아래」 로 읽혀 끌려 내려간다(e2e P25-3 에서 실측한 경주).
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
  const [pending, setPending] = useState(0);
  const prevCountRef = useRef(itemCount);
  /** 직전 커밋(또는 스크롤) 시점의 scrollHeight — 삽입 전 거리 계산의 기준(②). */
  const lastHeightRef = useRef(0);

  const markBottom = useCallback((bottom: boolean) => {
    setAtBottom(bottom);
    if (bottom) setPending(0);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const onScroll = () => {
      lastHeightRef.current = el.scrollHeight;
      markBottom(distanceToBottom(el) <= thresholdPx);
    };
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
    const grown = el.scrollHeight - lastHeightRef.current;
    const wasAtBottom = distanceToBottom(el) - Math.max(0, grown) <= thresholdPx;
    if (wasAtBottom) el.scrollTop = el.scrollHeight;
    else setPending((n) => n + delta);
  }, [itemCount, thresholdPx]);

  // ④ 마운트 · 필터 변경 · 날짜 이동 — 맨 아래로.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
    markBottom(true);
  }, [resetKey, markBottom]);

  // 매 커밋 뒤 높이 기록 — 줄 · 핀 · 상태 줄 등 무엇이 높이를 바꿨든 다음 판정의 기준선이 된다(마지막에 선언).
  useLayoutEffect(() => {
    const el = ref.current;
    if (el !== null) lastHeightRef.current = el.scrollHeight;
  });

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
