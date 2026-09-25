'use client';

/**
 * Phase 20 (D-12 · UI-SPEC §7) — 값 편집 방식 판정.
 *
 * 입력 장치로 가른다: 주 포인터가 `(pointer: coarse)`(터치)면 바텀시트 + 자체 키패드,
 * 아니면 행 안 인라인 편집. **폭과 무관**하다.
 *
 * - 하이브리드는 **주 입력 장치**가 정한다 — 트랙패드 달린 아이패드(주 포인터 coarse) = 시트,
 *   터치 노트북(주 포인터 fine) = 인라인. `(any-pointer: fine)` 류를 쓰지 않는 이유가 이것이다:
 *   보조 포인터 하나로 아이패드가 인라인으로 넘어가 버린다.
 * - Playwright 실측(RESEARCH Q1): 기본 컨텍스트는 `(pointer: coarse)=false`,
 *   `{ hasTouch: true }` 컨텍스트는 `true` — e2e 기본 프로젝트는 inline, hasTouch 블록은 sheet.
 * - 서버·하이드레이션 첫 렌더는 inline(`getServerSnapshot` = false)이고 클라이언트 스냅샷으로
 *   재렌더한다. 리스트 행은 두 모드 모두 `<button>` 이라 깜빡임이 없다.
 * - `change` 이벤트를 구독한다(외장 키보드·트랙패드 연결로 주 포인터가 바뀌는 경우).
 *
 * 이 훅은 레이아웃을 정하지 않는다 — 목록 1열/2열 같은 폭 판단은 계속 `@container/lc`
 * (globals.css §2.2b) 몫이다.
 */
import { useSyncExternalStore } from 'react';

export type EditMode = 'sheet' | 'inline';

export const COARSE_POINTER_QUERY = '(pointer: coarse)';

function canMatch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function subscribe(onChange: () => void): () => void {
  if (!canMatch()) return () => {};
  const mql = window.matchMedia(COARSE_POINTER_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return canMatch() && window.matchMedia(COARSE_POINTER_QUERY).matches;
}

/** 서버·하이드레이션 첫 렌더 = inline. */
function getServerSnapshot(): boolean {
  return false;
}

export function useEditMode(): EditMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) ? 'sheet' : 'inline';
}
