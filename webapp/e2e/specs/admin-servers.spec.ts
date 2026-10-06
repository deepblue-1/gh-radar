import { test, expect, type Page } from '@playwright/test';

import { mockAdminApi } from '../fixtures/admin';
import { leavesOverflowing } from '../overflow';

/**
 * Phase 29 (29-18) — 웹 Admin `/admin/servers` E2E (ADMIN-10 · D-10 · D-11 · D-17 · 목업 A).
 *
 * ① 무엇을 증명하는가
 *   진짜 middleware 가 e2e 계정(admin 시드 · 29-07)을 `/admin/servers` 로 통과시키고, 브라우저가 Express 경로
 *   (`/api/admin/servers*`)로 카드를 받아 목업 A 의 증권사 그룹 카드를 그리는지. 화면 데이터는 `mockAdminApi`
 *   (page.route 목 · 29-15)다. 이 spec 은 픽스처 파일을 고치지 않고, 필요한 응답만 `onRequest` 로 덮는다.
 *
 * ② 라디오 1번 = 요청 1건(P29-S1)
 *   「주문 서버」 라디오를 누르면 `PUT /servers/:key/order-server` 가 정확히 1건이고, 목 상태가 바뀐 재조회가
 *   「주문 서버」 칩을 그 카드로 옮긴다 — 이것이 「PUT → 재조회」 왕복의 증거다.
 *
 * ③ 폭 — 폰 390 은 카드 1열, 데스크톱 1080 은 2열(앱 셸 레벨 뷰포트 브레이크포인트). 칩이 카드 밖으로 밀리지 않는다.
 *
 * 주소는 픽스처의 TEST-NET(RFC 5737)뿐이다(D-27 — 실서버 주소 금지).
 */

const VIEWPORTS = [
  { name: '390', width: 390, height: 844, columns: 1 },
  { name: '1080', width: 1080, height: 800, columns: 2 },
] as const;

const serversRoot = (page: Page) => page.locator('[data-slot="admin-servers"]');
const card = (page: Page, key: string) => serversRoot(page).locator(`[data-slot="server-card"][data-key="${key}"]`);
const roleChip = (page: Page, key: string, role: 'order' | 'quote') =>
  card(page, key).locator(`[data-slot="server-role-chip"][data-role="${role}"]`);

for (const vp of VIEWPORTS) {
  test(`P29-S1 주문 서버 즉시 전환 — 증권사 그룹 카드 · PUT 1건 · 칩 이동 (${vp.name})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const api = await mockAdminApi(page);

    await page.goto('/admin/servers');
    await expect(page).toHaveURL(/\/admin\/servers$/);

    const root = serversRoot(page);
    await expect(root.getByRole('heading', { level: 1, name: '서버' })).toBeVisible({ timeout: 30_000 });
    await expect(root.locator('[data-slot="server-card"]')).toHaveCount(4, { timeout: 15_000 });
    expect(api.requests.filter((r) => r.method === 'GET' && r.path === '/servers')).toHaveLength(1);
    await expect(root).toContainText('레지스트리 4대 · 주문/시세 서버');

    // 섹션 순 · 섹션 문장
    const groups = root.locator('[data-slot="admin-servers-group"]');
    await expect(groups.locator('h2')).toHaveText(['KB', '교보']);
    await expect(groups.nth(0)).toContainText('주문 서버는 증권사 안에서 1대');

    // 상태 칩 — KYOBO127 은 픽스처상 끊김
    await expect(card(page, 'KYOBO127').locator('[data-axis="conn"]')).toHaveText('연결 끊김');
    await expect(card(page, 'KB120').locator('[data-axis="users"]')).toHaveText('유저 3');

    // 역할 칩 — KB120(주문 · 시세) · KYOBO119(주문)
    await expect(roleChip(page, 'KB120', 'order')).toHaveText('주문 서버');
    await expect(roleChip(page, 'KB120', 'quote')).toHaveText('시세 주 서버');
    await expect(roleChip(page, 'KYOBO119', 'order')).toBeVisible();
    await expect(roleChip(page, 'KB121', 'order')).toHaveCount(0);

    // 열 수 — 같은 증권사 카드 2장의 위치
    const a = await card(page, 'KB120').boundingBox();
    const b = await card(page, 'KB121').boundingBox();
    expect(a && b).toBeTruthy();
    if (vp.columns === 1) {
      expect(Math.abs(a!.x - b!.x)).toBeLessThan(1);
      expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
    } else {
      expect(Math.abs(a!.y - b!.y)).toBeLessThan(1);
      expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);
    }

    // 잘림 — 칩 · 라디오가 카드 오른쪽 밖으로 밀리지 않는다
    for (const key of ['KB120', 'KB121', 'KYOBO119', 'KYOBO127']) {
      const box = await card(page, key).boundingBox();
      expect(await leavesOverflowing(card(page, key), box!.x + box!.width)).toEqual([]);
    }

    await page.screenshot({ path: testInfo.outputPath(`admin-servers-${vp.name}.png`), fullPage: true });

    // KB121 「주문 서버」 라디오 → PUT 1건 → 재조회 → 칩이 KB121 로 · 교보는 그대로
    await card(page, 'KB121').locator('[data-slot="server-order-radio"]').click();
    await expect(roleChip(page, 'KB121', 'order')).toHaveText('주문 서버');
    await expect(roleChip(page, 'KB120', 'order')).toHaveCount(0);
    await expect(roleChip(page, 'KB120', 'quote')).toBeVisible();
    await expect(roleChip(page, 'KYOBO119', 'order')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'KB121 주문 서버' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'KB120 주문 서버' })).not.toBeChecked();

    const puts = api.requests.filter((r) => r.method === 'PUT');
    expect(puts).toEqual([{ method: 'PUT', path: '/servers/KB121/order-server', body: null }]);
    expect(api.requests.filter((r) => r.method === 'GET' && r.path === '/servers')).toHaveLength(2);
    await expect(root.locator('[data-slot="server-card-error"]')).toHaveCount(0);
  });
}
