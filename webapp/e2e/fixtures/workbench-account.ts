import { expect, type Locator } from '@playwright/test';

/**
 * 작업대 상단 줄 계좌 칩 줄 조회구 (32-15 — 네이티브 셀렉트 → `MeAccountChips` radiogroup).
 *
 * `account` 는 `[data-slot="workbench-account"]`(칩 줄 루트 · radiogroup 「계좌」)다. 옛 셀렉트 조작
 * (`option` 개수 · `selectOption` · `toHaveValue`)을 칩 조작으로 옮긴 세 줄이다 — spec 마다 복사하지 않게 여기 둔다.
 */

/** 칩 전부(계좌 수 대기 — 옛 `account.locator('option')`). */
export const accountChips = (account: Locator): Locator => account.locator('[role="radio"]');

/** 그 번호의 칩. */
export const accountChip = (account: Locator, accountNo: string): Locator =>
  account.locator(`[role="radio"][data-account-no="${accountNo}"]`);

/** 그 계좌를 고른다(옛 `selectOption`). 클릭이라 포커스가 그 칩으로 간다. */
export const pickAccount = (account: Locator, accountNo: string): Promise<void> =>
  accountChip(account, accountNo).click();

/** 고른 계좌가 그 번호다(옛 `toHaveValue`). */
export const expectAccount = (account: Locator, accountNo: string, options?: { timeout?: number }): Promise<void> =>
  expect(accountChip(account, accountNo)).toHaveAttribute('aria-checked', 'true', options);
