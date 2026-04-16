import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';

// NOTE: `@testing-library/jest-dom/vitest` 진입점은 monorepo root 의 vitest@4
// (hoisted) 를 resolve 하여 webapp 의 vitest@2 `expect` 와 분리된 인스턴스에
// 매처가 적용된다 (`Invalid Chai property: toBeInTheDocument` 원인).
// 로컬 `expect` 를 명시 import 후 `/matchers` 를 extend 하여 webapp 의 vitest
// 인스턴스에 매처를 주입한다.
expect.extend(matchers);

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
