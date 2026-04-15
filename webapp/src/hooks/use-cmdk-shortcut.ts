'use client';
import { useEffect } from 'react';

/**
 * useCmdKShortcut — document keydown 에 mod+k 단축키 등록.
 * - metaKey (Mac Cmd) OR ctrlKey (Win/Linux) + k
 * - event.preventDefault() 로 OS 기본 단축키 억제 (Pitfall 6)
 * - document 에 바인딩 (input focus 중에도 발화, Pitfall 4)
 */
export function useCmdKShortcut(toggle: () => void): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggle]);
}
