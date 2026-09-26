import { test, expect, type Page } from '@playwright/test';

import { mockHomeApi } from '../fixtures/home';
import { installNativeApp } from '../fixtures/native-app';

/**
 * Phase 21 Plan 09 — 브랜드 표시명 · `/me` 계정 카드 e2e (MOBILE-01i · MOBILE-01h).
 *
 * 무엇을 증명하는가:
 *   1. `/` — 문서 title 「GH Trade」 · 헤더 로고 텍스트 · 링크 이름 「GH Trade 홈」(D-21).
 *      로드 뒤 localStorage 키 중 앱 키는 전부 `gh-radar:` 접두이고 `gh-trade:` 키는 없다 —
 *      표시명만 바꿨고 저장 키는 바꾸지 않았다(T-21-21: 사용자 설정 유실 방지).
 *   2. `/me` — 계정 카드(`data-slot="account-card"`)에 테스트 사용자 이메일 · 행동 문구 테마 버튼 두 번 →
 *      `<html>` `dark` 클래스가 켜졌다 원상 복구된다(D-08a). 접근 이름은 목적지를 말한다(D-08b):
 *      다크일 때 「라이트 모드로 전환」 · 라이트일 때 「다크 모드로 전환」.
 *   3. 앱 모드(`installNativeApp`) 390 `/me` — 사이드바 없이 계정 카드가 뷰포트 안에 선다(D-08).
 *   4. 데스크톱 1280 `/me` — 사이드바 토글과 계정 카드 테마 버튼이 같은 아이콘(`data-icon`)·같은
 *      접근 이름을 보이고, 한쪽을 누르면 둘이 함께 바뀐다(D-08b · G-21-N2).
 *
 * ★ 「로그아웃」 버튼은 **누르지 않는다.** 누르면 Supabase 가 storageState 세션을 서버에서
 *   폐기해 이후 spec 이 전부 비로그인으로 깨진다. 여기서는 버튼의 존재·접근 이름만 확인하고,
 *   클릭 → `signOut` 은 단위 테스트(`account-card.test.tsx`)가 잠근다.
 *
 * relay 는 띄우지 않는다 — 계정 카드는 DMA 게이트 화면에서도 보인다(21-09 MeClient 배치).
 */

const accountCard = (page: Page) => page.locator('[data-slot="account-card"]');
/** 테마 버튼 접근 이름 — 행동 문구(D-08b). 정본은 `theme-toggle.tsx` 의 `THEME_SWITCH_LABEL`. */
const THEME_SWITCH_NAME = /모드로 전환$/;
const DARK_CLASS = /(^|\s)dark(\s|$)/;

test.describe('Phase 21 — 브랜드 GH Trade (MOBILE-01i · D-21)', () => {
  test('/ — title · 헤더 로고 · 링크 이름 · 저장 키 접두 불변', async ({ page }) => {
    await mockHomeApi(page);
    await page.goto('/');

    await expect(page).toHaveTitle('GH Trade');
    const banner = page.getByRole('banner');
    const logo = banner.getByRole('link', { name: 'GH Trade 홈' });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveText('GH Trade');
    await expect(banner).not.toContainText('gh-radar');

    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys.filter((k) => k.startsWith('gh-trade:'))).toEqual([]);
    // 앱이 쓰는 키(`gh-` 로 시작)는 전부 옛 접두 그대로다.
    for (const k of keys.filter((k) => k.startsWith('gh-'))) {
      expect(k.startsWith('gh-radar:')).toBe(true);
    }
  });
});

test.describe('Phase 21 — /me 계정 카드 A (MOBILE-01h · D-08 · D-08a)', () => {
  test('계정 카드 · 이메일 · 테마 전환 토글 · 로그아웃 버튼 존재(클릭 안 함)', async ({ page }) => {
    await page.goto('/me');

    const card = accountCard(page);
    await expect(card).toBeVisible();
    const email = process.env.E2E_TEST_EMAIL;
    if (email) {
      await expect(card).toContainText(email);
    } else {
      await expect(card).toContainText(/\S+@\S+\.\S+/);
    }

    const html = page.locator('html');
    const themeBtn = card.getByRole('button', { name: THEME_SWITCH_NAME });
    await expect(themeBtn).toBeVisible();
    const wasDark = await html.evaluate((el) => el.classList.contains('dark'));
    // 접근 이름 = 누르면 바뀔 테마(D-08b).
    await expect(themeBtn).toHaveAccessibleName(wasDark ? '라이트 모드로 전환' : '다크 모드로 전환');

    await themeBtn.click();
    if (wasDark) await expect(html).not.toHaveClass(DARK_CLASS);
    else await expect(html).toHaveClass(DARK_CLASS);
    await expect(themeBtn).toHaveAccessibleName(wasDark ? '다크 모드로 전환' : '라이트 모드로 전환');

    // 원상 복구 — 다음 테스트가 같은 테마로 시작하게 한다.
    await themeBtn.click();
    if (wasDark) await expect(html).toHaveClass(DARK_CLASS);
    else await expect(html).not.toHaveClass(DARK_CLASS);

    // ★ 로그아웃은 존재·접근 이름만 확인한다 — 클릭하면 storageState 세션이 폐기된다(파일 머리 주석).
    await expect(card.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  });

  test('앱 모드 390 — 사이드바 없이 계정 카드가 뷰포트 안에 선다', async ({ page }) => {
    await installNativeApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/me');

    await expect(page.locator('html')).toHaveClass(/native-app/);
    await expect(page.locator('[data-slot="app-aside"]')).toBeHidden();

    const card = accountCard(page);
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: THEME_SWITCH_NAME })).toBeInViewport();
    await expect(card.getByRole('button', { name: '로그아웃', exact: true })).toBeInViewport();

    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.height).toBeGreaterThanOrEqual(72);
  });

  test('데스크톱 1280 /me — 사이드바 토글과 계정 카드 테마 버튼이 같은 아이콘·같은 접근 이름(D-08b)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/me');

    const html = page.locator('html');
    const aside = page.locator('[data-slot="app-aside"]');
    await expect(aside).toBeVisible();
    const sideBtn = aside.getByRole('button', { name: THEME_SWITCH_NAME });
    const cardBtn = accountCard(page).getByRole('button', { name: THEME_SWITCH_NAME });
    await expect(sideBtn).toBeVisible();
    await expect(cardBtn).toBeVisible();

    const iconOf = (btn: typeof sideBtn) => btn.locator('svg[data-icon]').getAttribute('data-icon');
    const nameOf = (btn: typeof sideBtn) => btn.getAttribute('aria-label');

    /** 두 버튼이 같은 아이콘 · 같은 접근 이름이고, 그것이 현재 테마의 목적지와 맞는지. */
    const expectSame = async (dark: boolean) => {
      const icon = dark ? 'sun' : 'moon';
      const name = dark ? '라이트 모드로 전환' : '다크 모드로 전환';
      await expect(sideBtn).toHaveAccessibleName(name);
      await expect(cardBtn).toHaveAccessibleName(name);
      await expect(sideBtn.locator('svg[data-icon]')).toHaveAttribute('data-icon', icon);
      await expect(cardBtn.locator('svg[data-icon]')).toHaveAttribute('data-icon', icon);
      expect(await iconOf(sideBtn)).toBe(await iconOf(cardBtn));
      expect(await nameOf(sideBtn)).toBe(await nameOf(cardBtn));
    };

    const wasDark = await html.evaluate((el) => el.classList.contains('dark'));
    await expectSame(wasDark);

    // 사이드바 토글을 누르면 테마가 뒤집히고 두 버튼이 함께 바뀐다.
    await sideBtn.click();
    if (wasDark) await expect(html).not.toHaveClass(DARK_CLASS);
    else await expect(html).toHaveClass(DARK_CLASS);
    await expectSame(!wasDark);

    // 원상 복구 — 다음 테스트가 같은 테마로 시작하게 한다. 로그아웃은 누르지 않는다.
    await sideBtn.click();
    if (wasDark) await expect(html).toHaveClass(DARK_CLASS);
    else await expect(html).not.toHaveClass(DARK_CLASS);
    await expectSame(wasDark);
  });
});
