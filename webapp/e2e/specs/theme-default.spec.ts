import { test, expect, type Page } from '@playwright/test';

import { installNativeApp, nativeMessages } from '../fixtures/native-app';

/**
 * Phase 21 Plan 18 — 저장된 테마가 없을 때의 기본 테마 = 다크 (G-21-N1 · D-23a).
 *
 * ① 무엇을 증명하는가
 *   - 저장값이 없는 새 방문자는 **첫 페인트부터** 다크다 — next-themes 인라인 스크립트가 문서 파싱 중
 *     `<html class="dark">` 를 붙인다(하이드레이션 뒤 라이트 → 다크 전환이 아니다).
 *   - 기본값은 저장되지 않는다 — `localStorage.theme` 은 사용자가 토글할 때만 생긴다.
 *   - 라이트를 저장한 사용자는 라이트 그대로다(저장값 우선 · T-21-49).
 *   - 앱 첫 실행(저장값 없음) 웹은 네이티브에 `theme {theme:'dark'}` 를 보낸다 — 네이티브 ThemeStore
 *     저장값이 웹과 같은 다크로 시작한다(D-23 동기화).
 *
 * ② 깨지면 사용자가 겪는 일
 *   - 새 사용자가 라이트로 시작한다(G-21-N1 재발) · 앱 첫 프레임(다크 창)과 웹 첫 페인트(라이트)가
 *     어긋나 흰 번쩍임이 생긴다.
 *   - 라이트를 고른 사용자가 어느 날 다크로 바뀐다(사용자 선택 무결성 위반).
 *
 * 파일 레벨 `storageState` 비우기 — 쿠키·localStorage 가 없는 새 방문자(auth-guards.spec.ts 선례:
 * describe 레벨 override 는 워커 재사용에서 프로젝트 storageState 와 경합한다).
 */

test.use({ storageState: { cookies: [], origins: [] } });

declare global {
  interface Window {
    /** DOMContentLoaded 시점(하이드레이션 전 인라인 스크립트 결과)의 `<html>` className. */
    __firstHtmlClass?: string;
  }
}

const DARK_CLASS = /(^|\s)dark(\s|$)/;

/** 문서마다 DOMContentLoaded 에 한 번 `<html>` 클래스를 기록한다 — 첫 페인트 판정용. */
async function recordFirstHtmlClass(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        window.__firstHtmlClass = document.documentElement.className;
      },
      { once: true },
    );
  });
}

test.describe('기본 테마 다크 — 저장값 없음/있음 (G-21-N1 · D-23a)', () => {
  test('저장값 없음 → /login 첫 페인트부터 다크 · 기본값은 저장되지 않는다', async ({ page }) => {
    await recordFirstHtmlClass(page);
    await page.goto('/login');

    await expect(page.locator('html')).toHaveClass(DARK_CLASS);
    const first = await page.evaluate(() => window.__firstHtmlClass);
    expect(first, 'DOMContentLoaded 시점에 이미 dark 여야 한다(첫 페인트)').toMatch(DARK_CLASS);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
  });

  test('저장값 light 는 유지 — 기본값이 사용자 선택을 덮지 않는다', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'light');
    });
    await recordFirstHtmlClass(page);
    await page.goto('/login');

    // 하이드레이션까지 기다린 뒤에도 dark 가 붙지 않아야 한다.
    await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(DARK_CLASS);
    const first = await page.evaluate(() => window.__firstHtmlClass);
    expect(first ?? '').not.toMatch(DARK_CLASS);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
  });

  test('앱 첫 실행(저장값 없음) → 네이티브에 theme {theme:"dark"} 송신', async ({ page }) => {
    await installNativeApp(page);
    await page.goto('/login');

    await expect
      .poll(async () => (await nativeMessages(page)).filter((m) => m.type === 'theme').length)
      .toBeGreaterThan(0);
    const themes = (await nativeMessages(page)).filter((m) => m.type === 'theme');
    expect(themes[0]!.payload).toEqual({ theme: 'dark' });
  });
});
