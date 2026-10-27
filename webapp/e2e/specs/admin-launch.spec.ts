import { test, expect, type Page } from '@playwright/test';

import { mockLaunchApi } from '../fixtures/launch';

/**
 * Phase 35 (35-06) — 웹 Admin `/admin/launch` 주문 내역 탭 E2E (LAUNCH-06 · D-11 ~ D-14 · 채택 목업 변형 A).
 *
 * ① 무엇을 증명하는가
 *   진짜 middleware 가 e2e 계정(admin 시드)을 `/admin/launch` 로 통과시키고, 브라우저가 Express 경로
 *   (`/api/admin/launch/orders`)로 하루치 발사를 받아 머리 카드 4장(LAUNCH_ORDER 순) → 서버 · 시장별 조각 표를 그리는지.
 *   화면 데이터는 `mockLaunchApi`(`**\/api/admin/launch/**` 전용 page.route — `mockAdminApi` 를 쓰지 않는다)다.
 *
 * ② 쿼리 = 진실 원본 · 요청 수
 *   첫 진입은 orders 요청 1건(d 없음 — server 가 최신을 정한다). 날짜 알약 ‹ 는 `?d=` 를 push 하고 그 날 요청 1건.
 *
 * ③ 픽스처 = gh-trade 첨부 pieces.json(10/12~10/26 16:00 Q16). 10/26 KB 코스닥 머리 · wire 0 주문 속성은 합성(가짜 계좌).
 */

const MINUS = '−';

const root = (page: Page) => page.locator('[data-slot="admin-launch"]');
const cards = (page: Page) => root(page).locator('[data-slot="launch-head-card"]');
const card = (page: Page, gateway: string, market: string) =>
  root(page).locator(`[data-slot="launch-head-card"][data-gateway="${gateway}"][data-market="${market}"]`);
const group = (page: Page, gateway: string, market: string) =>
  root(page).locator(`[data-slot="launch-group"][data-gateway="${gateway}"][data-market="${market}"]`);

async function open(page: Page, url = '/admin/launch'): Promise<void> {
  await page.goto(url);
  await expect(root(page).getByRole('heading', { level: 1, name: '발사' })).toBeVisible({ timeout: 30_000 });
}

test.describe('어드민 발사 · 주문 내역', () => {
  test('P35-L1 1280 — 16:00 머리 카드 4장 · 빈 카드 · 조각 표 18행 · 날짜 이동 요청 1건', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page);

    await expect(root(page).getByRole('tab', { name: '주문 내역' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-slot="limitup-date"]')).toHaveText('10/26 (월)');
    await expect(root(page).locator('[data-slot="launch-fire-seg"] button[aria-pressed="true"]')).toHaveText('16:00 예약');
    await expect(root(page).locator('[data-slot="launch-source"]')).toHaveText('KB120 · KYOBO119 저널 80 · 16:00:01 적재');

    // 카드 4 · LAUNCH_ORDER 순
    await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });
    const order = await cards(page).evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-gateway')}|${el.getAttribute('data-market')}`),
    );
    expect(order).toEqual(['KB120|Q', 'KB120|K', 'KYOBO119|Q', 'KYOBO119|K']);
    await expect(card(page, 'KB120', 'K')).toHaveText('KB 코스피 · 이 날 발사 없음');
    await expect(card(page, 'KYOBO119', 'K')).toHaveText('교보 코스피 · 이 날 발사 없음');

    const kbq = card(page, 'KB120', 'Q');
    await expect(kbq).toContainText('18조각');
    await expect(kbq).toContainText(`${MINUS}337`);
    await expect(kbq).toContainText(`${MINUS}146 → ${MINUS}151`);
    await expect(kbq).toContainText('접수 16');
    await expect(kbq).toContainText('기타 2');

    // 조각 표 — 발사 있는 조합만(KB 코스닥 · 교보 코스닥)
    await expect(root(page).locator('[data-slot="launch-group"]')).toHaveCount(2);
    const rows = group(page, 'KB120', 'Q').locator('tbody tr');
    await expect(rows).toHaveCount(18);
    const first = rows.first();
    await expect(first).toContainText('삼성전자');
    await expect(first).toContainText('1234567801');
    await expect(first).toContainText('15:59:59.999');
    await expect(first).toContainText('Q153015001 · j0 · R—');
    await expect(first).toContainText(`${MINUS}332`);
    await expect(first.locator('[data-slot="launch-result"]')).toHaveAttribute('data-tone', 'ok');
    await expect(rows.nth(1)).toContainText('—');

    await page.waitForTimeout(500);
    expect(api.orders().map((r) => r.query)).toEqual([{}]);

    // ‹ → 10/23 push · 요청 1건
    await root(page).getByRole('button', { name: '이전 보고서' }).click();
    await expect(page).toHaveURL(/\/admin\/launch\?d=20261023$/);
    await expect(page.locator('[data-slot="limitup-date"]')).toHaveText('10/23 (금)');
    await expect(group(page, 'KYOBO119', 'K').locator('tbody tr')).toHaveCount(6);
    await page.waitForTimeout(500);
    expect(api.orders().filter((r) => r.query.d === '20261023')).toHaveLength(1);
    expect(api.orders()).toHaveLength(2);

    await page.screenshot({ path: test.info().outputPath('launch-orders-1280.png'), fullPage: true });
  });
});
