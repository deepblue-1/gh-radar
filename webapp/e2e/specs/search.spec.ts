import { test, expect } from '@playwright/test';
import { mockStockApi } from '../fixtures/mock-api';
import { FIXTURE_SAMSUNG, FIXTURE_MASTER_UNIVERSE } from '../fixtures/stocks';

/**
 * Phase 06 Plan 06 — 전역 검색 E2E (SRCH-01/02).
 * 6-06-01: 검색 → 자동완성 → 선택 → /stocks/005930 이동
 */

const modKey = process.platform === 'darwin' ? 'Meta+K' : 'Control+K';

test.describe('Phase 6 — 전역 검색 (SRCH-01/02)', () => {
  test.beforeEach(async ({ page }) => {
    await mockStockApi(page, { searchResults: [FIXTURE_SAMSUNG] });
  });

  test('⌘K 단축키 → 검색 → 선택 → /stocks/005930 이동', async ({ page }) => {
    await page.goto('/scanner');
    // document 레벨 keydown 리스너이므로 body 에 dispatchEvent 로 발화
    // (playwright keyboard.press 는 focused element 가 없으면 document 로 전파되지 않는
    // 경우가 있어, 직접 KeyboardEvent 를 dispatch 하여 useCmdKShortcut 을 트리거)
    const isMac = process.platform === 'darwin';
    await page.evaluate(
      (mac) => {
        const event = new KeyboardEvent('keydown', {
          key: 'k',
          metaKey: mac,
          ctrlKey: !mac,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
      },
      isMac,
    );
    await expect(page.getByRole('dialog')).toBeVisible();

    const input = page
      .getByRole('dialog')
      .getByPlaceholder('종목명 또는 종목코드를 입력하세요');
    await input.fill('삼성');

    // debounce 300ms + fetch — 자동완성 옵션 등장 대기
    const option = page.getByRole('option', { name: /삼성전자/ });
    await expect(option).toBeVisible({ timeout: 3000 });
    await option.click();

    await expect(page).toHaveURL(/\/stocks\/005930$/);
  });

  test('헤더 트리거 클릭으로도 Dialog 오픈', async ({ page }) => {
    await page.goto('/scanner');
    await page.getByLabel('종목 검색 열기').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('빈 결과 카피 노출', async ({ page }) => {
    await mockStockApi(page, { searchResults: [] });
    await page.goto('/scanner');
    // 트리거 클릭으로 안정적 오픈 (단축키 테스트는 위 케이스에서 커버)
    await page.getByLabel('종목 검색 열기').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const input = page
      .getByRole('dialog')
      .getByPlaceholder('종목명 또는 종목코드를 입력하세요');
    await input.fill('xyz');

    await expect(
      page.getByText(/"xyz" 에 해당하는 종목이 없습니다/),
    ).toBeVisible({ timeout: 3000 });
  });
});

/**
 * Phase 06.1 Plan 06 — 마스터 universe 회귀 (SRCH-01).
 * STATE.md:97 "삼성전자 검색 불가" 사유 해결 검증.
 */
test.describe('Phase 06.1 — 마스터 universe 회귀 (SRCH-01)', () => {
  test.beforeEach(async ({ page }) => {
    await mockStockApi(page, { searchResults: FIXTURE_MASTER_UNIVERSE });
  });

  test('"삼성전자" 입력 → 자동완성에 005930 노출 (회귀: STATE.md:97 사유)', async ({
    page,
  }) => {
    await page.goto('/scanner');
    await page.getByLabel('종목 검색 열기').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const input = page
      .getByRole('dialog')
      .getByPlaceholder('종목명 또는 종목코드를 입력하세요');
    await input.fill('삼성전자');
    const option = page.getByRole('option', { name: /삼성전자/ });
    await expect(option).toBeVisible({ timeout: 3000 });
  });

  test('"005930" 코드 직접 입력 → 005930 매치', async ({ page }) => {
    await page.goto('/scanner');
    await page.getByLabel('종목 검색 열기').first().click();
    const input = page
      .getByRole('dialog')
      .getByPlaceholder('종목명 또는 종목코드를 입력하세요');
    await input.fill('005930');
    const option = page.getByRole('option', { name: /005930|삼성전자/ });
    await expect(option).toBeVisible({ timeout: 3000 });
  });
});
