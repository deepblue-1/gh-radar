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
    const pressModK = () =>
      page.evaluate(
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

    /*
      ★ 하이드레이션 경주다 — 한 번만 쏘면 안 된다 (16-17 진단).

      `useCmdKShortcut` 의 `document.addEventListener` 는 **effect** 안에서 선다. 서버가
      보낸 HTML 은 이미 화면에 있으므로 `goto` 직후의 dispatch 는 「리스너가 아직 없는
      document」에 떨어져 **조용히 사라진다** — 재시도가 없으니 그대로 실패다(선행 실패의
      진짜 원인. 16-11 은 「단축키 경로 회귀」로 적었지만 단축키는 멀쩡하고 단위 테스트도
      통과한다). 사용자에게는 존재하지 않는 문제다 — 사람이 페이지를 열자마자 1ms 안에
      ⌘K 를 누르지는 않는다.

      `toPass` 로 「리스너가 설 때까지 다시 쏜다」. 열린 뒤에는 안쪽 단언이 즉시 통과하므로
      토글이 되감기지 않는다(안쪽 여유 3초 = 렌더 1프레임보다 훨씬 크다).
    */
    await expect(async () => {
      await pressModK();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });

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
