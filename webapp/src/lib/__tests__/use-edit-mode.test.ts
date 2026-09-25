/**
 * Phase 20 (D-12 · UI-SPEC §7) — 편집 방식 판정 훅.
 * `(pointer: coarse)` 가 참이면 시트, 아니면 인라인. 서버·하이드레이션 첫 렌더는 인라인.
 */
import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { COARSE_POINTER_QUERY, useEditMode } from '../use-edit-mode';
import { emitPointerChange, mockPointer, restoreMatchMedia } from './match-media';

afterEach(restoreMatchMedia);

function Probe() {
  return createElement('span', null, useEditMode());
}

describe('useEditMode — 입력 장치로 편집 방식을 가른다', () => {
  it('판정식은 주 포인터 (pointer: coarse) 다', () => {
    expect(COARSE_POINTER_QUERY).toBe('(pointer: coarse)');
  });

  it('기본 jsdom(폴리필 matches:false) 은 inline', () => {
    const { result } = renderHook(() => useEditMode());
    expect(result.current).toBe('inline');
  });

  it('주 포인터가 coarse 면 sheet', () => {
    mockPointer(true);
    const { result } = renderHook(() => useEditMode());
    expect(result.current).toBe('sheet');
  });

  it('change 이벤트를 구독한다 — coarse → fine 이면 같은 컴포넌트가 inline 으로 재렌더', () => {
    mockPointer(true);
    const { result } = renderHook(() => useEditMode());
    expect(result.current).toBe('sheet');
    act(() => emitPointerChange(false));
    expect(result.current).toBe('inline');
    act(() => emitPointerChange(true));
    expect(result.current).toBe('sheet');
  });

  it('window.matchMedia 가 없으면 inline(throw 없음)', () => {
    const saved = window.matchMedia;
    // @ts-expect-error — 부재 가드 검증
    delete window.matchMedia;
    try {
      const { result } = renderHook(() => useEditMode());
      expect(result.current).toBe('inline');
    } finally {
      window.matchMedia = saved;
    }
  });

  it('서버 렌더(renderToString)는 coarse 기기에서도 inline', () => {
    mockPointer(true);
    expect(renderToString(createElement(Probe))).toBe('<span>inline</span>');
  });

  it('restoreMatchMedia 뒤에는 다시 inline — 누수 없음(Pitfall 7)', () => {
    mockPointer(true);
    restoreMatchMedia();
    const { result } = renderHook(() => useEditMode());
    expect(result.current).toBe('inline');
  });
});
