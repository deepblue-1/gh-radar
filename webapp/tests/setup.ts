import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearQueryCache } from '@/lib/query-cache';

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
afterEach(() => {
  cleanup();
  // 훅 메모리 캐시가 테스트 사이로 새면 두 번째 테스트가 스켈레톤 없이 시작한다.
  clearQueryCache();
  // 작업대 배치 기억(quick-260923-lyt)이 테스트 사이로 새면 다음 테스트가 펼친 채 시작한다.
  if (typeof window !== 'undefined') {
    try {
      for (const k of Object.keys(window.localStorage)) {
        if (k.startsWith('gh-radar:trading-layout:') || k === 'gh-radar:trading-panels') {
          window.localStorage.removeItem(k);
        }
      }
    } catch {
      /* 저장소 없음 */
    }
  }
});

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
