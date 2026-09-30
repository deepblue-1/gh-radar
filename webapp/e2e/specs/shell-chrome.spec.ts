import { test, expect, type Locator, type Page } from '@playwright/test';

import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';
import { installNativeApp } from '../fixtures/native-app';

/**
 * quick-260930-e30 — 셸 크롬 두 결정의 실브라우저 단언 (CONTEXT D1 · D2 · 시각 정본 `mockup.html`).
 *
 * D1 데스크톱 사이드바 레일(240 ↔ 64 · 영속 · 첫 페인트 전 적용 · 드로어/앱 불변)
 * D2 스크롤 헤더 원형 햄버거(<lg 브라우저 · 앱 — 8px 넘게 스크롤하면 헤더를 걷고 유리 원형만)
 *
 * ★ 픽셀로 단언하는 이유: 두 결정의 핵심이 전부 **계산된 레이아웃**(폭 64 · 원 x/y 8 · 잉크 x=24 정렬)이다.
 *   jsdom 은 Tailwind 를 계산하지 않으므로 단위 테스트로는 모양을 증명할 수 없다(단위는 구조·계약만 본다).
 * ★ Playwright 는 sr-only(1×1) 요소를 visible 로 판정한다 — 「라벨이 시각적으로 숨었다」는 폭 ≤ 1,
 *   「보인다」는 폭 > 10 으로 잰다.
 */

const KEY = 'gh-radar:sidebar-collapsed';

const aside = (page: Page): Locator => page.locator('[data-slot="app-aside"]');
const toggle = (page: Page): Locator => page.locator('[data-slot="app-sidebar-toggle"]');
const menuButton = (page: Page): Locator => page.locator('[data-slot="app-menu-button"]');
const desktopNav = (page: Page): Locator => page.locator('aside nav[aria-label="주 메뉴"]');

async function widthOf(loc: Locator): Promise<number> {
  const box = await loc.boundingBox();
  return box ? Math.round(box.width) : -1;
}

/** 토글 svg 와 aside 첫 링크 svg 의 left 차이 — 헤더 잉크 열 == 사이드바 아이콘 열(x=24). */
async function iconColumnDelta(page: Page): Promise<number> {
  const t = await toggle(page).locator('svg').boundingBox();
  const a = await desktopNav(page).locator('a').first().locator('svg').boundingBox();
  if (!t || !a) return Number.POSITIVE_INFINITY;
  return Math.abs(t.x - a.x);
}

test.describe('quick-260930-e30 D1 — 데스크톱 사이드바 레일', () => {
  test.beforeEach(async ({ page }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await mockStockApi(page);
  });

  test('A1 1280 — 토글로 240 ↔ 64 · 본문 +176 · 라벨 sr-only + title · 잉크 열 정렬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const t = toggle(page);
    await expect(t).toBeVisible();
    await expect(t).toHaveAttribute('aria-label', '사이드바 접기');
    await expect(t).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => widthOf(aside(page))).toBe(240);
    expect(await iconColumnDelta(page)).toBeLessThanOrEqual(1);

    const mainBefore = await widthOf(page.locator('main'));
    await t.click();

    await expect.poll(() => widthOf(aside(page))).toBe(64);
    await expect(t).toHaveAttribute('aria-label', '사이드바 펼치기');
    await expect(t).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate((k) => window.localStorage.getItem(k), KEY)).toBe('1');
    await expect
      .poll(async () => (await widthOf(page.locator('main'))) - mainBefore)
      .toBeGreaterThanOrEqual(174);
    expect((await widthOf(page.locator('main'))) - mainBefore).toBeLessThanOrEqual(178);

    const nav = desktopNav(page);
    for (const name of ['홈', '검색', 'AI 애널리스트']) {
      await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(1);
    }
    const home = nav.getByRole('link', { name: '홈', exact: true });
    await expect(home).toHaveAttribute('title', '홈');
    expect(await widthOf(home.locator('span').first())).toBeLessThanOrEqual(1);
    expect(await iconColumnDelta(page)).toBeLessThanOrEqual(1);
  });

  test('A2 첫 프레임부터 64(깜빡임 없음) · 이동 후 유지 · 다시 펼침', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript((k) => window.localStorage.setItem(k, '1'), KEY);
    await page.addInitScript(() => {
      const w = window as unknown as { __asideW: number[] };
      w.__asideW = [];
      const tick = () => {
        const el = document.querySelector('[data-slot="app-aside"]');
        if (el && getComputedStyle(el).position === 'sticky') {
          w.__asideW.push(Math.round(el.getBoundingClientRect().width));
        }
        if (w.__asideW.length < 30) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.goto('/');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __asideW: number[] }).__asideW.length))
      .toBeGreaterThanOrEqual(1);
    const samples = await page.evaluate(() => (window as unknown as { __asideW: number[] }).__asideW);
    expect(samples.length).toBeGreaterThanOrEqual(1);
    expect(samples.every((w) => w === 64), `샘플 ${JSON.stringify(samples)}`).toBe(true);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');

    // 다른 경로로 이동해도 레일 유지.
    await page.goto('/search');
    await expect.poll(() => widthOf(aside(page))).toBe(64);

    // init 스크립트가 매 로드마다 키를 다시 심으므로, 펼침은 이 페이지 안에서만 확인한다.
    await toggle(page).click();
    await expect.poll(() => widthOf(aside(page))).toBe(240);
    expect(await page.evaluate((k) => window.localStorage.getItem(k), KEY)).toBeNull();
  });

  test('A3 390 + 접힘 저장 — 토글 없음 · 드로어 사이드바는 펼친 모양', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((k) => window.localStorage.setItem(k, '1'), KEY);
    await page.goto('/');

    await expect(toggle(page)).toBeHidden();
    await menuButton(page).click();
    const drawer = page.locator('[data-slot="sheet-content"] nav[aria-label="주 메뉴"]');
    const home = drawer.getByRole('link', { name: '홈', exact: true });
    await expect(home).toBeVisible();
    expect(await widthOf(home.locator('span').first())).toBeGreaterThan(10);
  });

  test('A4 앱 1280 — 토글 숨김 · aside 숨김 · 햄버거 보임', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await installNativeApp(page);
    await page.goto('/');

    await expect(menuButton(page)).toBeVisible();
    await expect(toggle(page)).toHaveCount(1);
    await expect(toggle(page)).toBeHidden();
    await expect(aside(page)).toBeHidden();
  });
});
