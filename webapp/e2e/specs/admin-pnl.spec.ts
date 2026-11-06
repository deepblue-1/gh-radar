import { test, expect, type Locator, type Page } from '@playwright/test';

import { mockPnlApi, PNL_HUGE_LABEL } from '../fixtures/pnl';

/**
 * Phase 36 (36-08) — 웹 Admin `/admin/pnl` 일자별 매매손익 E2E (D-17 ① · D-18 · UI-SPEC ⑤a · 채택 목업 ⑤ A 안).
 *
 * ① 진짜 middleware 가 e2e 계정(admin 시드)을 `/admin/pnl` 로 통과시키고, 브라우저가 Express 경로(`/api/admin/pnl`)로
 *   묶음 × 일자 × 종목을 받아 그리는지. 화면 데이터는 `mockPnlApi`(`/api/pnl` · `/api/admin/pnl` 전용 page.route)다.
 * ② 묶음은 계좌별 하나(2026-11-06 계정별 제거) · 쿼리 = 진실 원본 — `?range=7|30|90|month` · `?key=` · 잘못된 값 ·
 *   옛 `?group` 은 그 키만 지운다(router.replace).
 * ③ 폭 — lg 1024 7열 머리 · 조 단위 매수 「123,456,789만」 칸(104px) 비잘림(UI E2 백스톱) · 폰 390 기간 줄 ·
 *   페이지(문서 · 앱 셸 main) 가로 스크롤 0.
 */

async function horizontalOverflow(page: Page): Promise<{ doc: number; main: number }> {
  return page.evaluate(() => {
    const se = document.scrollingElement ?? document.documentElement;
    const main = document.querySelector('main');
    return { doc: se.scrollWidth - se.clientWidth, main: main === null ? 0 : main.scrollWidth - main.clientWidth };
  });
}

async function clipOf(locator: Locator): Promise<{ scroll: number; client: number }> {
  return locator.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
}

const root = (page: Page) => page.locator('[data-slot="admin-pnl"]');
const heads = (page: Page) => root(page).locator('[data-slot="pnl-group-head"]');
const titles = (page: Page) => heads(page).locator('[data-slot="pnl-group-title"]');

async function open(page: Page, url = '/admin/pnl'): Promise<void> {
  await page.goto(url);
  await expect(root(page).getByRole('heading', { level: 1, name: '매매손익' })).toBeVisible({ timeout: 30_000 });
}

test.describe('어드민 매매손익', () => {
  test('P36-AP1 ⑥ lg 1024 계좌별 — 요청 group=account · range=30 · 배지 「KB」 「교보」 · 부제 · 행 전부 닫힘 · 7열 머리 · 매수 칸 「123,456,789만」 비잘림', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    const api = await mockPnlApi(page);
    await open(page);

    await expect(page).toHaveTitle('매매손익 · Admin');
    await expect(root(page).getByRole('group', { name: '묶음' })).toHaveCount(0);
    await expect(heads(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(heads(page).locator('[data-slot="pnl-broker-badge"]')).toHaveText(['KB', '교보']);
    await expect(titles(page)).toHaveText(['37728502101', '10279758101']);
    await expect(heads(page).nth(0).locator('[data-slot="pnl-group-sub"]')).toHaveText('ezmesya · kim01 · 위탁');
    await expect(root(page).getByText('미상')).toHaveCount(0);
    expect(api.requests.filter((r) => r.path === '/api/admin/pnl').map((r) => r.query)).toEqual([
      { group: 'account', range: '30' },
    ]);

    // 7열 머리 · 일자 행은 전부 닫힘.
    await expect(root(page).locator('[data-slot="pnl-col-head"]').first()).toBeVisible();
    await expect(root(page).locator('button[aria-expanded="true"]')).toHaveCount(0);
    const buy = root(page).locator('[data-slot="pnl-group"]').first().locator('[data-slot="pnl-day-buy"]').first();
    await expect(buy).toHaveText(PNL_HUGE_LABEL);
    const cell = await clipOf(buy);
    expect(cell.scroll).toBeLessThanOrEqual(cell.client);
    const sumBuy = await clipOf(root(page).locator('[data-slot="pnl-summary-buy"]').first());
    expect(sumBuy.scroll).toBeLessThanOrEqual(sumBuy.client);
    expect(await horizontalOverflow(page)).toEqual({ doc: 0, main: 0 });
  });

  test('P36-AP2 ⑦ 계좌 칩 「교보 10279758101」 → 주소 ?key= · 그 계좌만 · 제목은 「매매손익 · Admin」 유지', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockPnlApi(page);
    await open(page);
    await expect(heads(page)).toHaveCount(2, { timeout: 15_000 });

    await root(page).getByRole('radiogroup', { name: '계좌' }).getByRole('radio', { name: '교보 10279758101' }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/admin/pnl' && url.searchParams.get('key') === '10279758101');
    await expect(titles(page)).toHaveText(['10279758101']);
    // router.replace 가 서버 메타데이터를 다시 적용해도 문서 제목이 루트 「GH Trade」 로 돌아가지 않는다.
    await expect(page).toHaveTitle('매매손익 · Admin');
  });

  test('P36-AP3 ⑧ 옛 주소 ?group=user&key=ezmesya&range=x → group · 계정 key · range 지워지고 30일 · 계좌별', async ({ page }) => {
    const api = await mockPnlApi(page);
    await open(page, '/admin/pnl?group=user&key=ezmesya&range=x');
    await expect(page).toHaveURL((url) => url.pathname === '/admin/pnl' && url.search === '', { timeout: 15_000 });
    await expect(root(page).getByRole('group', { name: '기간' }).getByRole('button', { name: '30일' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(heads(page)).toHaveCount(2, { timeout: 15_000 });
    expect(api.requests.every((r) => r.query.range === '30' && r.query.group === 'account')).toBe(true);
  });

  test('P36-AP4 ⑨ 폰 390 — 일자 행 2줄 · 칩 · 기간 줄 화면 안 · 가로 스크롤 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPnlApi(page);
    await open(page);
    await expect(heads(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(root(page).locator('[data-slot="pnl-col-head"]').first()).toBeHidden();
    const line = root(page).locator('[data-slot="pnl-day-phone-line"]').first();
    await expect(line).toBeVisible();
    const c = await clipOf(line);
    expect(c.scroll).toBeLessThanOrEqual(c.client);
    const period = await root(page).getByRole('group', { name: '기간' }).boundingBox();
    expect(period).not.toBeNull();
    expect(period!.x + period!.width).toBeLessThanOrEqual(390);
    expect(await horizontalOverflow(page)).toEqual({ doc: 0, main: 0 });
  });

  test('P36-AP5 ⑩ 조회 실패(500) → 「매매손익을 불러오지 못했어요」 + 「다시 시도」 → 재요청 → 묶음', async ({ page }) => {
    const api = await mockPnlApi(page, {
      admin: (_query, nth) =>
        nth === 0 ? { status: 500, body: { error: { code: 'DB_ERROR', message: 'boom' } } } : undefined,
    });
    await open(page);
    const alert = root(page).getByRole('alert');
    await expect(alert).toContainText('매매손익을 불러오지 못했어요', { timeout: 15_000 });
    await alert.getByRole('button', { name: '다시 시도' }).click();
    await expect(heads(page)).toHaveCount(2, { timeout: 15_000 });
    expect(api.requests.filter((r) => r.path === '/api/admin/pnl')).toHaveLength(2);
  });
});
