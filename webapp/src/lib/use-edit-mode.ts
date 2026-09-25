'use client';

// RED 스텁 — 시그니처만. GREEN 에서 교체한다.
export type EditMode = 'sheet' | 'inline';
export const COARSE_POINTER_QUERY = '(pointer: coarse)';
export function useEditMode(): EditMode {
  return 'inline';
}
