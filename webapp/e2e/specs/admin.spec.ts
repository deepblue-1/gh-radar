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
 *
 * ③ 승인(P29-A2)은 「요청 1건 + 재조회 결과」 로 본다
 *   목 API 가 메모리 상태를 바꾸므로, 화면이 재조회로 받은 목록에서 승인 대기 행이 사용자 목록으로 옮겨졌는지가
 *   곧 「POST → 재조회」 왕복의 증거다. 사이드바 Admin 그룹은 e2e 계정이 admin 시드(29-07)라 실 RPC 로 보인다.
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

test('P29-A2 승인 대기 → 역할 선택 승인 → 사용자 목록으로 · 사이드바 Admin 그룹 (1080)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1080, height: 800 });
  const api = await mockAdminApi(page);

  await page.goto('/admin/users');
  const root = usersRoot(page);
  const pending = root.locator('[data-slot="admin-pending"]');
  await expect(pending).toBeVisible({ timeout: 30_000 });
  await expect(pending.getByRole('heading', { name: '승인 대기' })).toBeVisible();
  await expect(pending.locator('[data-slot="admin-pending-count"]')).toHaveText('1');

  const row = pending.locator('[data-slot="admin-pending-row"]');
  await expect(row).toContainText('lee.new@example.invalid');
  await expect(row.locator('[data-slot="admin-pending-chip"]')).toHaveText('승인 대기');
  await expect(row).toContainText(/오늘 \d{2}:\d{2} 가입/);

  // 사이드바 — Admin 제목 + 사용자(활성) · 서버 (데스크톱 aside)
  const nav = page.locator('aside nav[aria-label="주 메뉴"]');
  await expect(nav.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute('href', '/admin/users');
  await expect(nav.getByRole('link', { name: '사용자', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: '서버', exact: true })).toHaveAttribute('href', '/admin/servers');

  await page.screenshot({ path: testInfo.outputPath('admin-users-pending-1080.png'), fullPage: true });

  // 「승인」 → 역할 세그먼트(기본 선택 없음) → trader
  await row.getByRole('button', { name: '승인' }).click();
  const seg = row.getByRole('group', { name: '역할' });
  await expect(seg.getByRole('radio')).toHaveText(['viewer', 'trader', 'admin']);
  await expect(seg.getByRole('radio', { checked: true })).toHaveCount(0);
  expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  await seg.getByRole('radio', { name: 'trader' }).click();

  // POST 1건 · 재조회 → 그 이메일이 사용자 목록에 · 승인 대기 섹션 사라짐
  await expect(root.locator('[data-email="lee.new@example.invalid"][data-slot="admin-user-row"]')).toBeVisible();
  await expect(pending).toHaveCount(0);
  const posts = api.requests.filter((r) => r.method === 'POST');
  expect(posts).toEqual([{ method: 'POST', path: '/users', body: { email: 'lee.new@example.invalid', role: 'trader' } }]);
  expect(api.requests.filter((r) => r.method === 'GET' && r.path === '/users')).toHaveLength(2);
  await expect(userRows(page)).toHaveCount(5);
  await expect(
    root.locator('[data-email="lee.new@example.invalid"] [data-slot="admin-role-chip"]'),
  ).toHaveText('trader');
});
