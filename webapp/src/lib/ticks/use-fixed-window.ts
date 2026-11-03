'use client';

/**
 * useFixedWindow — 모든 항목이 같은 높이인 목록의 창 가상화 (Phase 37 · RESEARCH Pattern 8).
 *
 * ① 항목 높이를 재지 않는다 — `first = floor(scrollTop / rowH)` · 보이는 수 = `ceil(height / rowH)` · 앞뒤 overscan.
 *   위아래는 spacer 높이(padTop · padBottom)로 채운다. 하루 27만 건이어도 DOM 은 ~60행이다.
 * ② scroll 이벤트는 rAF 로 한 프레임에 한 번만 상태에 올린다 · 높이는 ResizeObserver.
 * ③ `scrollToIndex(i, "nearest" | "center")` 는 scrollTop 을 직접 맞추고 상태도 바로 올린다(이벤트를 기다리지 않는다).
 *   `scrollToOffset(px)` 도 같다(R2-IN-30 — 모델 교체 뒤 보던 화면 지키기 · 한 프레임 옛 창으로 빈 spacer 가 보이지 않게).
 */

import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface FixedWindow {
  /** 그릴 첫 · 마지막 항목(포함). 항목이 없으면 first = 0 · last = -1. */
  first: number;
  last: number;
  padTop: number;
  padBottom: number;
  /** 보이는 높이(px · ResizeObserver) — 숨겨진(display:none) 목록은 0. */
  height: number;
  scrollToIndex: (i: number, align?: 'nearest' | 'center') => void;
  /** scrollTop 을 px 로(0 ~ 끝 사이로 자른다) — 상태도 바로 올린다. */
  scrollToOffset: (px: number) => void;
}

export function useFixedWindow({
  count,
  rowH,
  overscan = 10,
  ref,
}: {
  count: number;
  rowH: number;
  overscan?: number;
  ref: RefObject<HTMLElement | null>;
}): FixedWindow {
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setHeight(el.clientHeight);
    setScrollTop(el.scrollTop);
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setScrollTop(el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);

  const scrollToIndex = useCallback(
    (i: number, align: 'nearest' | 'center' = 'nearest') => {
      const el = ref.current;
      if (!el || i < 0 || i >= count) return;
      const h = el.clientHeight;
      const y = i * rowH;
      let next: number;
      if (align === 'center') next = y - h / 2 + rowH / 2;
      else if (y < el.scrollTop) next = y;
      else if (y + rowH > el.scrollTop + h) next = y + rowH - h;
      else return;
      next = Math.max(0, Math.min(next, Math.max(0, count * rowH - h)));
      el.scrollTop = next;
      setScrollTop(next);
    },
    [ref, count, rowH],
  );

  const scrollToOffset = useCallback(
    (px: number) => {
      const el = ref.current;
      if (!el) return;
      const next = Math.max(0, Math.min(px, Math.max(0, count * rowH - el.clientHeight)));
      el.scrollTop = next;
      setScrollTop(next);
    },
    [ref, count, rowH],
  );

  if (count <= 0) return { first: 0, last: -1, padTop: 0, padBottom: 0, height, scrollToIndex, scrollToOffset };
  const top = Math.min(count - 1, Math.max(0, Math.floor(scrollTop / rowH)));
  const visible = Math.max(1, Math.ceil(height / rowH));
  const first = Math.max(0, top - overscan);
  const last = Math.min(count - 1, top + visible + overscan);
  return {
    first,
    last,
    padTop: first * rowH,
    padBottom: (count - 1 - last) * rowH,
    height,
    scrollToIndex,
    scrollToOffset,
  };
}
