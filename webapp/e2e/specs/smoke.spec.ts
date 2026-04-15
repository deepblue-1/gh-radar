import { test, expect } from '@playwright/test';

/**
 * Phase 6 Wave 0 — 실제 E2E spec 은 06-06 에서 작성.
 * 현재는 playwright 하네스 활성 확인 및 `playwright test --list` exit 0 보장용 smoke 1건만 배치.
 */
test('wave-0: playwright harness boots', async () => {
  expect(true).toBe(true);
});
