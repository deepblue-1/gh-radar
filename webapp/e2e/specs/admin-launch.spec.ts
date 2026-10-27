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
 * ③ 픽스처 = gh-trade 첨부 pieces.json(10/12~10/26 16:00 Q16) + 첨부 로그 10/26 09:00:30 N 10줄. 10/26 KB 코스닥 Q16 머리 ·
 *   wire 0 주문 속성 · A 두 다리 · N 머리는 합성(가짜 계좌).
 *
 * ④ 폭(D-14) — 1280 카드 2열 · 390 카드 1열(x 같음) · 조각 표는 자기 래퍼 안에서만 가로 스크롤 · 페이지(문서 · 앱 셸 main)
 *   가로 스크롤 0.
 *
 * ⑤ 빈 상태 — 이력 0 · 행 없는 ?d(「최신 보기」 → d 없는 주소) · 형식 오류 ?d(replace 로 d 만 지움 · 다른 키 보존).
 */

const MINUS = '\u2212';

/** 가로 넘침 — 문서 스크롤 · 앱 셸 `main`(overflow-auto) 둘 다(teamflow-report.spec 판정식). */
async function horizontalOverflow(page: Page): Promise<{ doc: number; main: number }> {
  return page.evaluate(() => {
    const se = document.scrollingElement ?? document.documentElement;
    const main = document.querySelector('main');
    return {
      doc: se.scrollWidth - se.clientWidth,
      main: main === null ? 0 : main.scrollWidth - main.clientWidth,
    };
  });
}

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
    // 1280 = 카드 2열(첫 줄 두 장 y 같음 · x 다름)
    const b0 = (await cards(page).nth(0).boundingBox())!;
    const b1 = (await cards(page).nth(1).boundingBox())!;
    expect(Math.round(b0.y)).toBe(Math.round(b1.y));
    expect(b1.x).toBeGreaterThan(b0.x + 100);

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

  test('P35-L2 1280 — 09:00:30 개장차익 · 두 다리 · 발사 · 재전송 열 · 고정 다음 오프셋 · 다시 받지 않음', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page);
    await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });
    await page.waitForTimeout(500);
    const before = api.orders().length;

    await root(page).getByRole('button', { name: '09:00:30 개장차익' }).click();
    await expect(page).toHaveURL(/\/admin\/launch\?fire=n0930$/);
    await expect(root(page).locator('[data-slot="launch-fire-seg"] button[aria-pressed="true"]')).toHaveText('09:00:30 개장차익');
    await expect(root(page).locator('[data-slot="launch-source"]')).toHaveText('KB120 · KYOBO119 저널 80 · 09:00:31 적재');

    const kbq = group(page, 'KB120', 'Q');
    await expect(kbq.getByRole('columnheader', { name: '발사' })).toBeVisible();
    await expect(kbq.getByRole('columnheader', { name: '재전송' })).toBeVisible();
    const rows = kbq.locator('tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText('A 09:00:27 KRX→');
    await expect(rows.nth(0)).toContainText('매수');
    await expect(rows.nth(1)).toContainText('A NXT');
    await expect(rows.nth(1)).toContainText('매도');
    await expect(rows.nth(2)).toContainText('N NXT');
    await expect(rows.nth(2)).toContainText('09:00:30.092');
    await expect(rows.nth(2)).toContainText(`${MINUS}20,148`);
    await expect(group(page, 'KB120', 'K').locator('tbody tr').first()).toContainText('09:00:30.046');

    const kbqCard = card(page, 'KB120', 'Q');
    await expect(kbqCard).toContainText('5조각 · N·A');
    await expect(kbqCard).toContainText(`고정 ${MINUS}245µs`);
    await expect(kbqCard).toContainText('4회');
    await expect(kbqCard).toContainText('거부 4');
    await expect(card(page, 'KB120', 'K')).toContainText('2조각 · N·A');
    await expect(card(page, 'KYOBO119', 'Q')).toContainText(`고정 ${MINUS}200µs`);

    await page.waitForTimeout(500);
    expect(api.orders(), '세그먼트 전환은 다시 받지 않는다').toHaveLength(before);
    await page.screenshot({ path: test.info().outputPath('launch-orders-n0930-1280.png'), fullPage: true });
  });

  test('P35-L3 390 — 카드 1열 · 조각 표만 가로 스크롤 · 페이지 가로 스크롤 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockLaunchApi(page);
    await open(page);
    await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });

    const xs = await cards(page).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
    expect(new Set(xs).size, `카드 x ${xs.join(',')}`).toBe(1);

    const wrap = root(page).locator('[data-slot="launch-pieces"]').first();
    const fit = await wrap.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(fit.sw, '조각 표 래퍼 안 가로 스크롤').toBeGreaterThan(fit.cw);

    const o = await horizontalOverflow(page);
    expect(o.doc, '문서 가로 넘침 0').toBeLessThanOrEqual(0);
    expect(o.main, 'main 가로 넘침 0').toBeLessThanOrEqual(0);

    await root(page).getByRole('button', { name: '09:00:30 개장차익' }).click();
    await expect(group(page, 'KB120', 'Q').locator('tbody tr')).toHaveCount(5);
    const o2 = await horizontalOverflow(page);
    expect(o2.doc, '09:00:30 문서 가로 넘침 0').toBeLessThanOrEqual(0);
    expect(o2.main, '09:00:30 main 가로 넘침 0').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('launch-orders-390.png'), fullPage: true });
  });

  test('P35-L4 빈 상태 — 이력 0', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockLaunchApi(page, { ordersEmpty: true });
    await open(page);
    await expect(root(page).locator('[data-slot="launch-empty"]')).toHaveText('아직 적재된 발사가 없어요 · 첫 적재는 16:00:01', {
      timeout: 15_000,
    });
    await expect(cards(page)).toHaveCount(0);
  });

  test('P35-L5 행 없는 ?d → 「이 날은 발사가 없어요」 → 최신 보기 → d 없는 주소', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page, '/admin/launch?d=20261024&fire=n0930');
    const empty = root(page).locator('[data-slot="launch-empty"]');
    await expect(empty).toContainText('이 날은 발사가 없어요', { timeout: 15_000 });
    expect(api.orders().every((r) => r.query.d === '20261024')).toBe(true);
    await empty.getByRole('button', { name: '최신 보기' }).click();
    await expect(page).toHaveURL(/\/admin\/launch\?fire=n0930$/);
    await expect(cards(page)).toHaveCount(4);
  });

  test('P35-L6 형식 오류 ?d → replace 로 d 만 지운다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page, '/admin/launch?d=2026-10-12&fire=n0930');
    await expect(page).toHaveURL(/\/admin\/launch\?fire=n0930$/);
    await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });
    expect(api.orders().every((r) => r.query.d === undefined)).toBe(true);
  });
});
