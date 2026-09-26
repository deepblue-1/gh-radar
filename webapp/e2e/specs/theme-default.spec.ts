import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
 *   - 오프라인 폴백(`mobile/www/index.html` · D-19)도 `?theme=light` 가 아니면 다크다 — 네이티브는 항상
 *     현재 테마를 넘기지만, 값이 없거나 모르면 웹·네이티브와 같은 기본(다크)으로 떨어진다.
 *   - `<meta name="theme-color">` 는 OS 다크모드가 아니라 **앱 테마**를 따른다(IN-06) — 기본 `#17171c`
 *     (OS 라이트에서도) · 라이트 저장값이면 `#ffffff`.
 *
 * ② 깨지면 사용자가 겪는 일
 *   - 새 사용자가 라이트로 시작한다(G-21-N1 재발) · 앱 첫 프레임(다크 창)과 웹 첫 페인트(라이트)가
 *     어긋나 흰 번쩍임이 생긴다.
 *   - 라이트를 고른 사용자가 어느 날 다크로 바뀐다(사용자 선택 무결성 위반).
 *   - OS 가 라이트인 브라우저 사용자가 기본 다크 화면 위에 흰 브라우저 크롬(주소창·상태바)을 본다(IN-06).
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

const THEME_COLOR_META = 'meta[name="theme-color"]';

test.describe('theme-color 메타 = 앱 테마(IN-06)', () => {
  test.describe('OS 라이트 에뮬레이트', () => {
    test.use({ colorScheme: 'light' });

    test('저장값 없음 → 메타 하나 · #17171c(OS 라이트여도 앱 기본 다크)', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();
      const meta = page.locator(THEME_COLOR_META);
      await expect(meta).toHaveCount(1);
      await expect(meta).toHaveAttribute('content', '#17171c');
    });

    test('저장값 light → #ffffff', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('theme', 'light');
      });
      await page.goto('/login');
      await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();
      const meta = page.locator(THEME_COLOR_META);
      await expect(meta).toHaveCount(1);
      await expect(meta).toHaveAttribute('content', '#ffffff');
    });
  });

  test('저장값 없음 · OS 다크 에뮬레이트 → #17171c', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();
    const meta = page.locator(THEME_COLOR_META);
    await expect(meta).toHaveCount(1);
    await expect(meta).toHaveAttribute('content', '#17171c');
  });
});

// 저장소 루트 — fixtures/relay.ts 와 같은 방식(e2e/specs → webapp → 루트).
const REPO_ROOT = path.resolve(__dirname, '../../..');
const FALLBACK_URL = pathToFileURL(path.join(REPO_ROOT, 'mobile/www/index.html')).href;

test.describe('오프라인 폴백 기본 다크 (D-19 · D-23a)', () => {
  // 폴백 페이지의 5초 도달 탐침이 복귀(location.replace)로 페이지를 떠나지 않게 오프라인으로 연다.
  test.beforeEach(async ({ page }) => {
    await page.context().setOffline(true);
  });

  const cases: { query: string; dark: boolean; label: string }[] = [
    { query: '', dark: true, label: '쿼리 없음 → 다크(기본)' },
    { query: '?theme=light', dark: false, label: '?theme=light → 라이트' },
    { query: '?theme=dark', dark: true, label: '?theme=dark → 다크' },
    { query: '?theme=bogus', dark: true, label: '?theme=bogus(모르는 값) → 다크(기본)' },
  ];

  for (const c of cases) {
    test(c.label, async ({ page }) => {
      await page.goto(FALLBACK_URL + c.query);
      await expect(page.getByText('인터넷 연결을 확인해주세요')).toBeVisible();
      const html = page.locator('html');
      if (c.dark) await expect(html).toHaveClass(DARK_CLASS);
      else await expect(html).not.toHaveClass(DARK_CLASS);
    });
  }
});
