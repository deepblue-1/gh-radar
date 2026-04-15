import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Phase 6 Wave 0 — vitest global setup.
 * - RTL cleanup after each test
 * - matchMedia / ResizeObserver / scrollIntoView polyfill (cmdk CommandDialog 요구)
 */
afterEach(() => cleanup());

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    // @ts-expect-error — jsdom polyfill
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error — jsdom polyfill
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
