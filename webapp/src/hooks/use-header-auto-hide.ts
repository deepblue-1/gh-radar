'use client';

import { useEffect, useState, type RefObject } from 'react';

import { isNativeApp } from '@/lib/native/native-detect';

/**
 * 스크롤 헤더 숨김 판정 (quick-260930-e30 D2 · 목업 「상단에서만 헤더」).
 *
 * ★ 결정 D2 = **상단에서만 헤더**다. 창이 맨 위(8px 이내)일 때만 헤더를 보이고, 조금이라도 내리면 걷는다.
 *   「위로 스크롤하면 복귀」 방식은 목업 비교 후 사용자가 채택하지 않았다 — 방향 감지를 더하지 마라.
 * ★ 스크롤 주체는 **창(window)** 이다(`lib/tab-scroll-memory.ts` 머리 주석이 정본). 내부 스크롤러를 쓰는
 *   화면은 scrollY 가 0 이라 헤더가 계속 보이는 것이 정상 폴백이다.
 * ★ 적용 범위 = 햄버거가 있는 화면만 — <lg 브라우저 + 앱(`html.native-app`, 폭과 무관하게 햄버거).
 *   lg+ 브라우저는 고정 사이드바가 있어 헤더를 유지한다.
 * ★ 강제 표시 — `forceVisible`(드로어 열림) · 헤더 안 **키보드** 포커스(`:focus-visible`). 마우스·터치 포커스는
 *   제외한다 — 원형 햄버거를 탭해 드로어를 연 뒤 닫히며 포커스가 되돌아와도 헤더가 붙박이지 않게.
 */

/** 이 값 「이내」(≤)의 창 스크롤은 맨 위로 본다. */
export const HEADER_REVEAL_MAX_SCROLL = 8;
/** 햄버거가 보이는 브라우저 폭(<lg) — Tailwind `lg`(1024) 와 같은 경계. */
export const HEADER_AUTO_HIDE_QUERY = '(max-width: 1023.98px)';

export interface HeaderAutoHideOptions {
  /** 햄버거가 있는 화면만 켠다. false 면 항상 보임. */
  enabled: boolean;
  /** 드로어 열림 등 — true 면 보임. */
  forceVisible?: boolean;
}

/** 헤더를 걷어야 하면 `true`. */
export function useHeaderAutoHide(
  headerRef: RefObject<HTMLElement | null>,
  { enabled, forceVisible = false }: HeaderAutoHideOptions,
): boolean {
  const [scrolled, setScrolled] = useState(false);
  const [applies, setApplies] = useState(false);
  const [keyboardInside, setKeyboardInside] = useState(false);

  // 창 스크롤 — 마운트 때 한 번 읽는다(탭 루트 스크롤 복원 착지 대응).
  useEffect(() => {
    if (!enabled) return;
    const onScroll = () => setScrolled(window.scrollY > HEADER_REVEAL_MAX_SCROLL);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled]);

  // 적용 범위 — 좁은 폭(<lg) 또는 앱.
  useEffect(() => {
    if (!enabled) return;
    const mql = window.matchMedia(HEADER_AUTO_HIDE_QUERY);
    const onChange = () => setApplies(mql.matches || isNativeApp());
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [enabled]);

  // 헤더 안 키보드 포커스.
  useEffect(() => {
    const el = headerRef.current;
    if (!enabled || !el) return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      let keyboard = false;
      if (target instanceof Element) {
        try {
          keyboard = target.matches(':focus-visible');
        } catch {
          keyboard = false;
        }
      }
      setKeyboardInside(keyboard);
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (!(next instanceof Node) || !el.contains(next)) setKeyboardInside(false);
    };
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, [enabled, headerRef]);

  return enabled && applies && scrolled && !forceVisible && !keyboardInside;
}
