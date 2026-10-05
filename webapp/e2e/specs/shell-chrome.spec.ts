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
const header = (page: Page): Locator => page.locator('[data-slot="app-header"]');
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
    for (const name of ['홈', '검색']) {
      await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(1);
    }
    // 이 spec 은 로컬 relay 없는 로그인 사용자(tradingVisible 거짓) — 「AI 애널리스트」 는 분석 하위(트레이딩 권한자
    // 전용 · quick-261005-vk1 D-01)라 레일에도 없다. 권한자의 레일 아이콘은 단위 테스트(app-sidebar)가 잠근다.
    await expect(nav.getByRole('link', { name: 'AI 애널리스트', exact: true })).toHaveCount(0);
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

// ===========================================================================

/**
 * 창 스크롤 300 을 만든다. 홈 픽스처 본문은 폭·로딩 시점에 따라 창 높이보다 짧을 수 있어(390x640 에서 여유 0~257
 * 실측), main 끝에 2000px 스페이서를 붙여 **창**이 스크롤 주체가 되게 한다 — 판정 대상은 본문 내용이 아니라 창
 * scrollY 다. 가드 — 그래도 300 을 못 내려가면 D2 단언이 전부 헛돈다. 원인을 메시지로 박는다.
 */
async function scrollTo300(page: Page): Promise<void> {
  await expect(page.locator('main')).toBeVisible();
  await expect(header(page)).toBeVisible();
  const addSpacer = () =>
    page.evaluate(() => {
      const main = document.querySelector('main');
      if (main && !main.querySelector('[data-e2e-spacer]')) {
        const spacer = document.createElement('div');
        spacer.setAttribute('data-e2e-spacer', '');
        spacer.style.height = '2000px';
        main.appendChild(spacer);
      }
      return document.documentElement.scrollHeight - window.innerHeight;
    });
  // 하이드레이션·로딩 교체로 스페이서가 떨어져 나갈 수 있어 붙을 때까지 다시 붙인다.
  await expect.poll(addSpacer).toBeGreaterThanOrEqual(300);
  const room = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(room, `페이지가 짧아 창 스크롤 300 을 만들 수 없다(여유 ${room}px) — 픽스처/뷰포트 확인`).toBeGreaterThanOrEqual(300);
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(300);
}

test.describe('quick-260930-e30 D2 — 스크롤 헤더 원형 햄버거', () => {
  test.beforeEach(async ({ page }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await mockStockApi(page);
  });

  test('B1 390 — 맨 위 헤더 · 300 스크롤이면 원형 햄버거만(좌·상 8 · 44 · 50%) · 클릭 통과 · 맨 위 복귀', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto('/');

    const hdr = header(page);
    const logo = page.getByRole('link', { name: 'GH Trade 홈' });
    await expect(hdr).not.toHaveAttribute('data-scroll-hidden');
    expect(await logo.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    const logoBox = await logo.boundingBox();
    expect(logoBox).not.toBeNull();

    await scrollTo300(page);
    await expect(hdr).toHaveAttribute('data-scroll-hidden', 'true');

    const btn = menuButton(page);
    await expect.poll(async () => (await btn.boundingBox())?.x).toBeCloseTo(8, 0);
    const box = (await btn.boundingBox())!;
    expect(Math.abs(box.x - 8)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y - 8)).toBeLessThanOrEqual(1);
    expect(Math.round(box.width)).toBe(44);
    expect(Math.round(box.height)).toBe(44);

    const style = await btn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, pe: cs.pointerEvents, shadow: cs.boxShadow };
    });
    expect(style.radius).toBe('50%');
    expect(style.bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(style.bg).not.toBe('transparent');
    expect(style.shadow).not.toBe('none');
    expect(style.pe).toBe('auto');
    expect(await hdr.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(await logo.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

    // 로고가 있던 자리를 누르면 헤더가 아니라 그 아래 본문이 잡힌다(클릭 통과).
    const cx = logoBox!.x + logoBox!.width / 2;
    const cy = logoBox!.y + logoBox!.height / 2;
    const insideHeader = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        const h = document.querySelector('[data-slot="app-header"]');
        return el != null && h != null && h.contains(el);
      },
      [cx, cy] as const,
    );
    expect(insideHeader).toBe(false);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(hdr).not.toHaveAttribute('data-scroll-hidden');
  });

  test('B2 390 — 스크롤 중 햄버거 → 드로어 열림 동안 헤더 강제 표시 · 닫고 포커스 빠지면 다시 숨김', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto('/');
    await scrollTo300(page);
    const hdr = header(page);
    await expect(hdr).toHaveAttribute('data-scroll-hidden', 'true');

    await menuButton(page).click();
    await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible();
    await expect(hdr).not.toHaveAttribute('data-scroll-hidden');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(hdr).toHaveAttribute('data-scroll-hidden', 'true');
  });

  test('B3 390 — 스크롤 중 Tab 으로 헤더에 들어가면 헤더가 돌아온다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto('/');
    await scrollTo300(page);
    const hdr = header(page);
    await expect(hdr).toHaveAttribute('data-scroll-hidden', 'true');

    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => {
        const h = document.querySelector('[data-slot="app-header"]');
        return h != null && h.contains(document.activeElement);
      }),
    ).toBe(true);
    await expect(hdr).not.toHaveAttribute('data-scroll-hidden');
  });

  test('B4 1280 브라우저 — 스크롤해도 헤더 유지', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await scrollTo300(page);
    await page.waitForTimeout(400);
    await expect(header(page)).not.toHaveAttribute('data-scroll-hidden');
    const bg = await page.locator('[data-part="header-bg"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform, translate: cs.translate };
    });
    expect(bg.transform).toBe('none');
    expect(bg.translate).toBe('none');
  });

  test('B5 앱 1280 — 스크롤 300 이면 숨김 · 원형 x = 헤더 padding-left(24)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await installNativeApp(page);
    await page.goto('/');
    await scrollTo300(page);

    const hdr = header(page);
    await expect(hdr).toHaveAttribute('data-scroll-hidden', 'true');
    const btn = menuButton(page);
    await expect(btn).toBeVisible();
    const pad = await hdr.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(pad).toBe(24);
    const box = (await btn.boundingBox())!;
    expect(Math.abs(box.x - pad)).toBeLessThanOrEqual(1);
  });

  /*
    ★ Tailwind v4 `motion-reduce:transition-none` 는 `transition-property: none` 이다(duration 은 250ms 로 남는다).
      「전환 없음」은 속성이 none 인 것으로 판정한다 — duration 이 0 이 아니어도 전환할 속성이 없다.
  */
  test('B6 390 — 전환 있음 · reduced-motion 이면 전환 없음', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto('/');
    const transition = () =>
      menuButton(page).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { property: cs.transitionProperty, duration: cs.transitionDuration };
      });

    const normal = await transition();
    expect(normal.property).not.toBe('none');
    expect(normal.duration.split(',').some((d) => d.trim() !== '0s')).toBe(true);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(async () => (await transition()).property).toBe('none');
    for (const sel of ['[data-part="header-bg"]']) {
      expect(
        await page.locator(sel).evaluate((el) => getComputedStyle(el).transitionProperty),
      ).toBe('none');
    }
    expect(
      await page
        .getByRole('link', { name: 'GH Trade 홈' })
        .evaluate((el) => getComputedStyle(el).transitionProperty),
    ).toBe('none');
  });
});
