import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCmdKShortcut } from './use-cmdk-shortcut';

describe('useCmdKShortcut', () => {
  let toggle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toggle = vi.fn();
  });

  it('metaKey + k 시 toggle 호출 (Mac)', () => {
    renderHook(() => useCmdKShortcut(toggle));
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true }),
    );
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('ctrlKey + k 시 toggle 호출 (Win/Linux)', () => {
    renderHook(() => useCmdKShortcut(toggle));
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true }),
    );
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('metaKey + j 는 toggle 미호출', () => {
    renderHook(() => useCmdKShortcut(toggle));
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'j', metaKey: true, cancelable: true }),
    );
    expect(toggle).not.toHaveBeenCalled();
  });

  it('modifier 없이 k 만 누르면 toggle 미호출', () => {
    renderHook(() => useCmdKShortcut(toggle));
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', cancelable: true }),
    );
    expect(toggle).not.toHaveBeenCalled();
  });

  it('mod+k 발화 시 event.preventDefault() 호출', () => {
    renderHook(() => useCmdKShortcut(toggle));
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('unmount 후 keydown → toggle 미호출 (listener 해제)', () => {
    const { unmount } = renderHook(() => useCmdKShortcut(toggle));
    unmount();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true }),
    );
    expect(toggle).not.toHaveBeenCalled();
  });
});
