import { test, expect, type Page } from '@playwright/test';

import { ADMIN_BUSY_MESSAGE, mockAdminApi } from '../fixtures/admin';
import { leavesOverflowing } from '../overflow';

/**
 * Phase 29 — 웹 Admin `/admin/users` E2E (ADMIN-09 · D-13 · D-14 · 목업 A).
 *
 * ① 무엇을 증명하는가
 *   RTL 은 `fetchAdminUsers` 를 목으로 갈아끼우고 행 구조만 본다. 여기서 보는 것은 앞단이다 — **진짜 middleware**
 *   가 e2e 계정(admin 시드 · 29-07)을 `/admin/users` 로 통과시키고, 브라우저가 Express 경로(`/api/admin/*`)로
 *   목록을 받아 목업 A 의 행 · 칩을 그리는지. 화면 데이터는 `mockAdminApi`(page.route 목)다.
 *
 * ② 두 폭(390 · 1080)을 다 본다
 *   칩이 많은 행(서버 4대)이 폰 폭에서 줄바꿈으로 들어가는지 — 잎 좌표가 카드 오른쪽을 넘지 않는지까지 잰다.
 */

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1080', width: 1080, height: 800 },
] as const;

const usersRoot = (page: Page) => page.locator('[data-slot="admin-users"]');
const userRows = (page: Page) => usersRoot(page).locator('[data-slot="admin-user-row"]');

for (const vp of VIEWPORTS) {
  test(`P29-A1 사용자 목록 — 행 · DMA 연결 · 반영 칩 · 서버에만 있음 (${vp.name})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const api = await mockAdminApi(page);

    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/users$/);

    const root = usersRoot(page);
    await expect(root.getByRole('heading', { level: 1, name: '사용자' })).toBeVisible({ timeout: 30_000 });
    await expect(userRows(page)).toHaveCount(4, { timeout: 15_000 });
    expect(api.requests.filter((r) => r.method === 'GET' && r.path === '/users')).toHaveLength(1);

    // DMA 없는 viewer — 「DMA 연결 없음」 · 계좌 수 없음
    const park = root.locator('[data-email="park.view@example.invalid"]');
    await expect(park).toContainText('DMA 연결 없음');
    await expect(park).not.toContainText('계좌');

    // BUSY 실패 칩 — 「KB121 · 실패 · BUSY」 + 서버 message 원문 툴팁
    const kim = root.locator('[data-email="kim.trader@example.invalid"]');
    await expect(kim).toContainText('DMA kimtr');
    await expect(kim).toContainText('· 계좌 2');
    const busy = kim.locator('[data-slot="reflect-chip"][data-tone="err"]');
    await expect(busy).toHaveText('KB121 · 실패 · BUSY');
    await expect(busy).toHaveAttribute('title', ADMIN_BUSY_MESSAGE);
    // 반영됨 칩은 키만
    await expect(kim.locator('[data-slot="reflect-chip"][data-server="KB120"]')).toHaveText('KB120');

    // 「서버에만 있음」 행 — 웹 유저 없음 · 편집 진입 없음
    const only = root.locator('[data-server-only="true"]');
    await expect(only).toHaveCount(1);
    await expect(only).toContainText('smok95');
    await expect(only).toContainText('웹 유저 없음');
    await expect(only).toHaveAttribute('aria-disabled', 'true');
    await expect(only.locator('[data-slot="reflect-chip"]')).toHaveText('KYOBO119 · 서버에만 있음');

    // 목업 하단 안내 2문장
    await expect(root).toContainText('사전 등록: 「+ 사용자」 로 gmail 만 먼저 넣어 두면 가입 즉시 열린다.');
    await expect(root).toContainText('「서버에만 있음」 행은 편집 불가 — 보기만.');

    // 잘림 — 칩이 많은 행이 카드 오른쪽 밖으로 밀리지 않는다
    const card = root.locator('[data-slot="admin-users-list"] ul').first();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(await leavesOverflowing(card, box!.x + box!.width)).toEqual([]);

    await page.screenshot({ path: testInfo.outputPath(`admin-users-${vp.name}.png`), fullPage: true });
  });
}
