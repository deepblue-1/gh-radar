'use client';

/**
 * 당겨서 새로고침 훅 등록 (Phase 21 · D-04).
 *
 * 페이지·섹션이 「네이티브 당김 = 무엇을 다시 읽을지」를 여기로 등록한다. 마운트 때 한 번 등록하고
 * 언마운트 때 해제한다 — 떠난 페이지의 재조회는 불리지 않는다. `fn` identity 가 렌더마다 바뀌어도
 * 재등록하지 않고 호출 시점의 최신 `fn` 을 부른다. `fn` 이 null/undefined 면 호출돼도 아무것도 안 한다.
 *
 * 앱이 아니면(Provider 가 `window.__ghTrade` 를 설치하지 않으므로) 등록만 되고 불리지 않는다.
 */

import { useEffect, useRef } from 'react';

import { useNativeBridge, type NativeRefreshFn } from './native-bridge-provider';

export function useNativeRefresh(fn: NativeRefreshFn | null | undefined): void {
  const { registerRefresh } = useNativeBridge();
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => registerRefresh(() => fnRef.current?.()), [registerRefresh]);
}
