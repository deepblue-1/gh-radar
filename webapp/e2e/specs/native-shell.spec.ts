import { test, expect, type Page } from '@playwright/test';

import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';
import { mockChatApi } from '../fixtures/chat';
import { installNativeApp, nativeMessages, type CapturedNativeMsg } from '../fixtures/native-app';

/**
 * Phase 21 Plan 05 — 앱 모드 셸 e2e (MOBILE-01j 1부) + 브라우저 모드 회귀.
 *
 * 같은 라우트를 **앱 모드**(`installNativeApp` — 가짜 Capacitor 위에서 실제 감지 스크립트·Provider)와
 * **브라우저 모드**(아무것도 심지 않음)로 렌더해 셸 차이만 단언한다(21-01 불변식 테스트의 첫 절반).
 *
 * 무엇을 증명하는가 / 깨지면 사용자가 겪는 일
 *   1. D-09 — 앱에서는 폭과 무관하게(1280 = iPad 가로) 고정 사이드바가 숨고 햄버거가 보여 드로어로만
 *      연다. 깨지면 네이티브 탭바와 사이드바가 같은 목적지를 두 번 보여 주거나, 앱에서 메뉴를 열 수단이 없다.
 *   2. D-10 — 앱 종목상세는 FAB 대신 히어로의 「AI 분석」 버튼이 같은 ChatSheet 를 연다. 깨지면 FAB 이
 *      네이티브 탭바를 가리거나, 앱에서 AI 진입점이 사라진다.
 *   3. D-11 — 실제 `<head>` 인라인 감지 스크립트가 `html.native-app` 을 붙이고 첫 메시지로 `ready` 를
 *      보낸다. 깨지면 네이티브가 웹 준비를 모르고 스플래시·탭바 동기화가 멈춘다.
 *   4. D-12 — 드로어·챗 시트 열림/닫힘이 `overlay {open}` 으로 나간다. 깨지면 시트 위로 탭바가 남거나
 *      뒤로가기가 시트 대신 페이지를 떠난다.
 *   5. D-06a — `window.__ghTrade.navigate(path)` 가 전체 새로고침 없이 클라 내비로 이동하고 `route` 를
 *      남긴다. 깨지면 탭 전환마다 앱이 다시 부팅되고(relay 소켓 끊김) 탭바 활성 표시가 어긋난다.
 *   6. 브라우저 회귀 — `native-app` 이 없으면 셸은 종전 그대로(≥lg aside · 햄버거 숨김 · FAB 보임 ·
 *      「AI 분석」 숨김 · `__ghTrade` 없음). 깨지면 웹 사용자 화면이 앱 분기에 오염된다.
 *
 * relay 가 필요한 화면(`/trading` 등)은 쓰지 않는다 — 셸 분기만 본다.
 */

const STOCK = FIXTURE_SAMSUNG;
const aside = (page: Page) => page.locator('[data-slot="app-aside"]');
const menuButton = (page: Page) => page.locator('[data-slot="app-menu-button"]');
const aiButton = (page: Page) => page.locator('[data-slot="stock-ai-button"]');
const chatFab = (page: Page) => page.locator('[data-slot="chat-fab"]');

function ofType(msgs: CapturedNativeMsg[], type: string): CapturedNativeMsg[] {
  return msgs.filter((m) => m.type === type);
}

/** 마지막 overlay 메시지의 open 값(없으면 null). */
async function lastOverlayOpen(page: Page): Promise<boolean | null> {
  const overlay = ofType(await nativeMessages(page), 'overlay');
  const last = overlay.at(-1)?.payload as { open?: boolean } | undefined;
  return last?.open ?? null;
}

test.describe('Phase 21 — 앱 모드 셸 (MOBILE-01j)', () => {
  test('1280 홈 — native-app 클래스 · aside 숨김 · 햄버거 보임 · ready 먼저 · route /', async ({
    page,
  }) => {
    await installNativeApp(page, { platform: 'ios' });
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const html = page.locator('html');
    await expect(html).toHaveClass(/(^|\s)native-app(\s|$)/);
    await expect(html).toHaveAttribute('data-native-platform', 'ios');

    // 사이드바 요소는 렌더돼 있지만(드로어와 같은 콘텐츠) 앱에서는 ≥lg 에서도 숨는다.
    await expect(aside(page)).toHaveCount(1);
    await expect(aside(page)).toBeHidden();
    await expect(menuButton(page)).toBeVisible();

    await expect
      .poll(async () => ofType(await nativeMessages(page), 'route').map((m) => m.payload))
      .toContainEqual({ path: '/' });
    const msgs = await nativeMessages(page);
    expect(msgs[0]?.type).toBe('ready');
    expect(msgs[0]?.payload).toMatchObject({ platform: 'ios', nativeApp: true, path: '/' });
  });

  test('1280 햄버거 → 드로어 열림 overlay{open:true} → Escape → 닫힘 overlay{open:false}', async ({
    page,
  }) => {
    await installNativeApp(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await menuButton(page).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    // 드로어 안에 사이드바 콘텐츠가 그대로 들어 있다(같은 목적지 목록).
    await expect(drawer.getByRole('link').first()).toBeVisible();
    await expect.poll(() => lastOverlayOpen(page)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect.poll(() => lastOverlayOpen(page)).toBe(false);
  });

  test('390 종목상세 — FAB 숨김 · 「AI 분석」 보임 → 클릭 → 챗 시트 + overlay{open:true}', async ({
    page,
  }) => {
    await installNativeApp(page);
    await mockStockApi(page, { detailByCode: { [STOCK.code]: STOCK } });
    await mockChatApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/stocks/${STOCK.code}`);

    const button = aiButton(page);
    await expect(button).toBeVisible({ timeout: 10_000 });
    await expect(button).toHaveAccessibleName(`AI 분석 — ${STOCK.name}`);

    // FAB 은 경로 게이트를 통과해 DOM 에 있지만 표시만 숨는다 → 폭 변수도 0px(더티 바 여백 0).
    await expect(chatFab(page)).toHaveCount(1);
    await expect(chatFab(page)).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.style.getPropertyValue('--chat-fab-w')),
      )
      .toBe('0px');

    await button.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('메시지 입력')).toBeVisible();
    await expect.poll(() => lastOverlayOpen(page)).toBe(true);
  });

  test('__ghTrade.navigate("/scanner") — 클라 내비 · route{path:/scanner} · 새로고침 없음', async ({
    page,
  }) => {
    await installNativeApp(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
    await mockStockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.waitForFunction(() => typeof window.__ghTrade?.navigate === 'function');
    await page.evaluate(() => {
      (window as Window & { __marker?: number }).__marker = 1;
    });

    const ok = await page.evaluate(() => window.__ghTrade!.navigate('/scanner'));
    expect(ok).toBe(true);
    await expect(page).toHaveURL(/\/scanner$/);
    await expect
      .poll(async () => ofType(await nativeMessages(page), 'route').map((m) => m.payload))
      .toContainEqual({ path: '/scanner' });
    // 전체 새로고침이었다면 문서가 바뀌어 마커가 사라지고 캡처 배열도 비워졌을 것이다.
    expect(await page.evaluate(() => (window as Window & { __marker?: number }).__marker)).toBe(1);
    expect(ofType(await nativeMessages(page), 'ready')).toHaveLength(1);
  });
});

test.describe('Phase 21 — 브라우저 모드 회귀', () => {
  test('1280 홈 — native-app 없음 · aside 보임 · 햄버거 숨김 · __ghTrade 없음', async ({ page }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const html = page.locator('html');
    await expect(aside(page)).toBeVisible();
    await expect(html).not.toHaveClass(/(^|\s)native-app(\s|$)/);
    await expect(html).not.toHaveAttribute('data-native-platform', /.*/);
    await expect(menuButton(page)).toHaveCount(1);
    await expect(menuButton(page)).toBeHidden();
    expect(await page.evaluate(() => typeof window.__ghTrade)).toBe('undefined');
  });

  test('390 종목상세 — chat-fab 보임 · 「AI 분석」 숨김', async ({ page }) => {
    await mockStockApi(page, { detailByCode: { [STOCK.code]: STOCK } });
    // quick-261009-c43 D-03 — FAB · 「AI 분석」 은 접근 탐침 ok 일 때만 렌더된다(탐침 가로채기 — 없으면 실서버로 나가 숨는다).
    await mockChatApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/stocks/${STOCK.code}`);

    await expect(page.getByRole('heading', { level: 1, name: STOCK.name })).toBeVisible({
      timeout: 10_000,
    });
    await expect(chatFab(page)).toBeVisible();
    await expect(aiButton(page)).toHaveCount(1);
    await expect(aiButton(page)).toBeHidden();
  });
});

/**
 * Phase 21 Plan 06 — safe-area · 네이티브 탭바 여백 (MOBILE-01j 2부 · D-25 · D-27b — 21-20 개정).
 *
 * 무엇을 증명하는가 / 깨지면 사용자가 겪는 일
 *   - 앱에서 네이티브 탭바(높이 60 · 바닥 = 화면 끝에서 max(inset − 14, 14))가 종목상세 「트레이딩」 CTA(D-30 — 옛 「주문하기」 · data-slot 그대로)와
 *     본문 끝을 가리지 않는다. 깨지면 앱에서 주문 진입이 막히거나 마지막 콘텐츠가 탭바 밑에 묻힌다(T-21-30).
 *   - 브라우저는 종전 그대로(CTA 바닥 0 · 하단 20 · 예약 96 · 본문 하단 8). 깨지면 웹 화면이 앱 여백에 오염된다.
 *
 * 수치는 **크롬 안전영역 0** 기준의 식이다(env 0 · SystemBars 주입 없음):
 *   gap    = max(0 − 14, 14)            = 14
 *   offset = gap + 탭바 60 + 여유 8     = 82   → CTA 바 bottom
 *   본문   = 60 + 20 + 18               = 98   → `main` padding-bottom (폰·iPad 공통)
 *   예약   = CTA 바 10 + 56 + 10        = 76   → `[data-order-cta]` padding-bottom (탭바 몫은 본문 98)
 *   ★ 값이 바뀌면 CONTEXT D-27b · globals.css §21 · 네이티브 탭바 상수를 같이 고친다 — 여기만 고치면
 *     웹은 통과하고 실기기에서 탭바가 CTA 를 가린다.
 */
test.describe('Phase 21 — safe-area · 탭바 여백 (D-25 · D-27b)', () => {
  const ctaBar = (page: Page) => page.locator('[data-slot="detail-order-cta-bar"]');
  const orderCtaRoot = (page: Page) => page.locator('[data-order-cta="true"]');

  async function computed(page: Page, selector: string, prop: 'paddingBottom' | 'bottom') {
    return page.evaluate(
      ([sel, p]) => getComputedStyle(document.querySelector(sel)!)[p as 'paddingBottom' | 'bottom'],
      [selector, prop] as const,
    );
  }

  async function viewportMetaAndHeader(page: Page) {
    return page.evaluate(() => ({
      viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
      headerH: document.querySelector('header')!.getBoundingClientRect().height,
    }));
  }

  test('앱 390 홈 — viewport-fit=cover · 헤더 56(안전영역 0) · main 하단 98', async ({ page }) => {
    await installNativeApp(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/(^|\s)native-app(\s|$)/);
    await page.locator('main').first().waitFor();

    const { viewport, headerH } = await viewportMetaAndHeader(page);
    expect(viewport).toContain('viewport-fit=cover');
    expect(headerH).toBe(56);
    expect(await computed(page, 'main', 'paddingBottom')).toBe('98px');
  });

  // debug android-release-apk-no-scroll — Android ≤ 14(비-엣지투엣지) + WebView ≥ 140 에서 SystemBars 가 상태바 높이를
  // `--safe-area-inset-top` 으로 주입해도 헤더가 그만큼 또 비면 안 된다(상태바 아래 빈 띠). 상단은 env() 만 읽는다.
  test('앱 android 390 홈 — 주입 --safe-area-inset-top 41px 를 무시하고 헤더 56(env 0)', async ({ page }) => {
    await installNativeApp(page, { platform: 'android' });
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('main').first().waitFor();
    await page.evaluate(() => document.documentElement.style.setProperty('--safe-area-inset-top', '41px'));

    expect((await viewportMetaAndHeader(page)).headerH).toBe(56);
  });

  test('앱 390 종목상세 — CTA 바 bottom 82(14 + 60 + 8) · 하단 10 · 예약 76', async ({ page }) => {
    await installNativeApp(page);
    await mockStockApi(page, { detailByCode: { [STOCK.code]: STOCK } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/stocks/${STOCK.code}`);

    await expect(ctaBar(page)).toBeVisible({ timeout: 10_000 });
    await expect(orderCtaRoot(page)).toHaveCount(1);
    expect(await computed(page, '[data-slot="detail-order-cta-bar"]', 'bottom')).toBe('82px');
    expect(await computed(page, '[data-slot="detail-order-cta-bar"]', 'paddingBottom')).toBe('10px');
    expect(await computed(page, '[data-order-cta="true"]', 'paddingBottom')).toBe('76px');
    expect(await computed(page, 'main', 'paddingBottom')).toBe('98px');

    // D-30 — 라벨만 「트레이딩」(링크 /trading?code=). 자리·수치는 그대로다.
    await expect(page.locator('[data-slot="detail-order-cta"]')).toHaveText('트레이딩');

    // 탭바 윗변(화면 끝에서 14 + 60 = 74) 위에 CTA 버튼 전체가 선다.
    const box = await page.locator('[data-slot="detail-order-cta"]').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844 - 74);
  });

  test('브라우저 390 종목상세 — CTA bottom 0 · 하단 20 · 예약 96 · main 하단 8 · 헤더 56', async ({
    page,
  }) => {
    await mockStockApi(page, { detailByCode: { [STOCK.code]: STOCK } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/stocks/${STOCK.code}`);

    await expect(ctaBar(page)).toBeVisible({ timeout: 10_000 });
    const { viewport, headerH } = await viewportMetaAndHeader(page);
    expect(viewport).toContain('viewport-fit=cover');
    expect(headerH).toBe(56);
    expect(await computed(page, '[data-slot="detail-order-cta-bar"]', 'bottom')).toBe('0px');
    expect(await computed(page, '[data-slot="detail-order-cta-bar"]', 'paddingBottom')).toBe('20px');
    expect(await computed(page, '[data-order-cta="true"]', 'paddingBottom')).toBe('96px');
    expect(await computed(page, 'main', 'paddingBottom')).toBe('8px');
  });

  test('앱 1280 홈 — main 하단 98(iPad 공통값)', async ({ page }) => {
    await installNativeApp(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/(^|\s)native-app(\s|$)/);
    await page.locator('main').first().waitFor();

    expect(await computed(page, 'main', 'paddingBottom')).toBe('98px');
  });
});

/**
 * debug android-release-apk-no-scroll (2026-09-27) — Android 앱 본문 스크롤 회귀 가드.
 *
 * 무엇을 증명하는가 / 깨지면 사용자가 겪는 일
 *   - Android 앱(`data-native-platform="android"`)에서 본문(`main`) 안에서 시작한 세로 터치 스와이프가 문서를
 *     스크롤한다. 깨지면 **앱 홈에서 위로 쓸어도 아무 반응이 없다**(Galaxy S10e · WebView 153 실기기 보고).
 *   - 원인: Chromium 144+ 는 `overscroll-behavior` 를 넘치지 않는 스크롤 컨테이너에도 적용한다. 옛 전역 규칙
 *     `html.native-app body * { overscroll-behavior-y: contain }` 이 높이 제한 없는 `main`(overflow-auto) ·
 *     overflow-hidden 카드 · truncate 에 걸려 문서로의 체이닝을 끊었다. 규칙은 iOS 전용이다(globals.css).
 *   - 이 e2e 의 Chromium(Playwright 번들 · 144 이상)이 실기기 WebView 와 같은 동작이라 규칙이 Android 로
 *     새면 여기서 빨간불이 난다. (Chromium < 144 로 돌리면 옛 규칙에서도 통과하므로 검증력이 없다.)
 */
test.describe('Phase 21 — Android 앱 본문 스크롤 (Chromium 144+ overscroll-behavior)', () => {
  test('앱 android 390×640 홈 — main 안 터치 스와이프가 문서를 스크롤 · main 체이닝 차단 없음', async ({
    page,
  }) => {
    await installNativeApp(page, { platform: 'android' });
    await mockHomeApi(page, { response: HOME_POPULATED });
    // 높이 640 — 픽스처 홈(테마 1개)이 화면보다 넉넉히 길어 스와이프 거리만큼 스크롤할 여지가 있다.
    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-native-platform', 'android');
    // 스켈레톤이 아니라 실제 카드가 그려져 문서가 화면보다 길어진 뒤에 잰다.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
      .toBeGreaterThan(200);

    const probe = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const r = main.getBoundingClientRect();
      return {
        mainOverscroll: getComputedStyle(main).overscrollBehaviorY,
        x: Math.round(r.left + r.width / 2),
        y: Math.round(Math.min(r.bottom, window.innerHeight) - 250),
      };
    });

    const cdp = await page.context().newCDPSession(page);
    // 손가락이 main 안에서 300px 위로 — 실기기 스와이프와 같은 터치 제스처.
    await cdp.send('Input.synthesizeScrollGesture', {
      x: probe.x,
      y: probe.y,
      yDistance: -300,
      gestureSourceType: 'touch',
      speed: 800,
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    // 원인 층 — Android 에서는 main 에 체이닝 차단이 걸리지 않는다.
    expect(probe.mainOverscroll).toBe('auto');
  });

  test('앱 ios 390 홈 — 내부 스크롤 체이닝 차단 규칙은 iOS 에 그대로(WebKit 은 넘침 없는 컨테이너 무시)', async ({
    page,
  }) => {
    await installNativeApp(page, { platform: 'ios' });
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-native-platform', 'ios');
    await page.locator('main').first().waitFor();

    expect(
      await page.evaluate(() => getComputedStyle(document.querySelector('main')!).overscrollBehaviorY),
    ).toBe('contain');
  });
});
