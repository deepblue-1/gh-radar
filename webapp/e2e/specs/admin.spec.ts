import { test, expect, type Page } from '@playwright/test';
import type { AdminUsersOverview } from '@gh-radar/shared';

import { ADMIN_BUSY_MESSAGE, ADMIN_USERS_FIXTURE, mockAdminApi, type AdminApiMock } from '../fixtures/admin';
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
 *
 * ④ 편집 시트(P29-A3)는 「필드 1개 = 요청 1건」 을 요청 기록으로 센다(D-15)
 *   역할 · 등록 서버 토글 · 다시 반영이 각각 정확히 1건이고, 응답의 서버별 결과(BUSY message 원문)가 그 자리 칩 · 한 줄로
 *   그려지는지 본다. 「저장」 버튼은 없다.
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

// ── P29-A3 편집 시트 ────────────────────────────────────────────────────────────

const KIM = 'kim.trader@example.invalid';
const KIM_KB = '12345678901';
const SHEET_BUSY = '미체결 2건 — 먼저 정리';

/** kim 의 KB 계좌를 KB120 만 켠 상태로 — KB121 을 「켜는」 조작을 보기 위해. */
function editFixture(): AdminUsersOverview {
  const users = JSON.parse(JSON.stringify(ADMIN_USERS_FIXTURE)) as AdminUsersOverview;
  const kim = users.users.find((u) => u.email === KIM)!;
  kim.servers = kim.servers.filter((c) => c.serverKey !== 'KB121');
  const kb = kim.accounts.find((a) => a.accountNo === KIM_KB)!;
  kb.servers = kb.servers.filter((c) => c.serverKey !== 'KB121');
  return users;
}

/**
 * PUT 계좌 = 의도 저장(D-05) + 서버별 결과 — 목 상태에 의도를 적고(재조회가 켜진 토글을 받는다) KB121 은 BUSY 로 돌려준다.
 * 「다시 반영」 은 기본 처리(그 사용자 서버 전부 ok)로 간다.
 */
async function mockEditApi(page: Page): Promise<AdminApiMock> {
  // onRequest 는 요청 때(=이 줄이 끝난 뒤) 불린다 — 그때 `api` 는 이미 있다.
  const api: AdminApiMock = await mockAdminApi(page, {
    users: editFixture(),
    onRequest: (req) => {
      if (req.method !== 'PUT' || req.path !== '/dma-users/kimtr/accounts') return undefined;
      const body = req.body as { account: { accountNo: string }; servers: string[] };
      const kim = api.state.users.users.find((u) => u.email === KIM)!;
      const acct = kim.accounts.find((a) => a.accountNo === body.account.accountNo)!;
      acct.servers = body.servers.map(
        (s) => acct.servers.find((c) => c.serverKey === s) ?? { serverKey: s, tone: 'warn', message: null, state: 'active' },
      );
      for (const s of body.servers) {
        if (!kim.servers.some((c) => c.serverKey === s)) kim.servers.push({ serverKey: s, tone: 'warn', message: null });
      }
      return {
        body: {
          results: body.servers.map((s) =>
            s === 'KB121' ? { server: s, outcome: 'failed', code: 9, message: SHEET_BUSY } : { server: s, outcome: 'ok' },
          ),
        },
      };
    },
  });
  return api;
}

const writes = (api: AdminApiMock) => api.requests.filter((r) => r.method !== 'GET');

test('P29-A3 편집 시트 — 필드별 즉시 저장 · 결과 칩 (1080 우측 패널)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1080, height: 800 });
  const api = await mockEditApi(page);

  await page.goto('/admin/users');
  const row = usersRoot(page).locator(`[data-slot="admin-user-row"][data-email="${KIM}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();

  // 우측 패널 440 · 목록은 왼쪽에 남는다
  const sheet = page.getByRole('dialog', { name: KIM });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-side', 'right');
  // 슬라이드 인이 끝난 뒤 잰다
  await expect.poll(async () => {
    const b = (await sheet.boundingBox())!;
    return Math.round(b.x + b.width);
  }).toBe(1080);
  const panel = (await sheet.boundingBox())!;
  expect(Math.round(panel.width)).toBe(440);
  expect(Math.round(panel.x + panel.width)).toBe(1080);
  const rowBox = (await row.boundingBox())!;
  expect(rowBox.x).toBeLessThan(panel.x);
  await expect(row).toHaveAttribute('data-selected', 'true');

  // 「저장」 버튼 없음 — 하단은 둘뿐
  await expect(sheet.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
  await expect(sheet.locator('[data-slot="admin-sheet-footer"] button')).toHaveText(['사용자 삭제', '다시 반영']);

  // ① 역할 viewer → PATCH 1건 · 플래시 · 칩
  await sheet.getByRole('group', { name: '역할' }).getByRole('radio', { name: 'viewer' }).click();
  await expect(sheet.locator('[data-slot="admin-role-chip"]')).toHaveText('viewer');
  await expect.poll(() => writes(api).length).toBe(1);
  expect(writes(api)[0]).toEqual({ method: 'PATCH', path: `/users/${encodeURIComponent(KIM)}`, body: { role: 'viewer' } });
  await expect(sheet.locator('[data-slot="admin-field-role"]')).toHaveAttribute('data-state', 'idle');

  // ② KB121 켬 → PUT 1건(계좌 + 서버 집합) → 「KB121 · 실패 · BUSY」 칩 · message 원문 title · 한 줄
  const kb = sheet.locator(`[data-slot="admin-account"][data-account="${KIM_KB}"]`);
  await kb.getByRole('checkbox', { name: 'KB121' }).click();
  await expect.poll(() => writes(api).length).toBe(2);
  expect(writes(api)[1]).toMatchObject({
    method: 'PUT',
    path: '/dma-users/kimtr/accounts',
    body: { account: { broker: 'KB', accountNo: KIM_KB }, servers: ['KB120', 'KB121'] },
  });
  const pill = kb.locator('[data-slot="admin-server-toggle"][data-server="KB121"]');
  const busy = pill.locator('[data-slot="reflect-chip"]');
  await expect(busy).toHaveText('실패 · BUSY');
  await expect(busy).toHaveAttribute('data-tone', 'err');
  await expect(busy).toHaveAttribute('title', SHEET_BUSY);
  await expect(pill).toHaveText(/KB121\s*실패 · BUSY/);
  await expect(sheet.locator('[data-slot="admin-busy-line"]')).toHaveText(
    `KB121 실패 · BUSY: ${SHEET_BUSY} — 정리 뒤 「다시 반영」`,
  );
  // 의도는 저장됐다 — 재조회 뒤에도 토글은 켜진 채(D-05)
  await expect.poll(() => api.requests.filter((r) => r.method === 'GET' && r.path === '/users').length).toBe(3);
  await expect(kb.getByRole('checkbox', { name: 'KB121' })).toHaveAttribute('aria-checked', 'true');

  await page.screenshot({ path: testInfo.outputPath('admin-user-sheet-1080.png') });

  // ③ 「다시 반영」 → POST 1건 → KB121 반영됨 · BUSY 줄 사라짐
  await sheet.getByRole('button', { name: '다시 반영' }).click();
  await expect.poll(() => writes(api).length).toBe(3);
  expect(writes(api)[2]).toEqual({ method: 'POST', path: '/dma-users/kimtr/reconcile', body: null });
  await expect(busy).toHaveText('반영됨');
  await expect(sheet.locator('[data-slot="admin-busy-line"]')).toHaveCount(0);

  // 잘림 — 계좌 줄(알약 · 칩)이 패널 밖으로 밀리지 않는다
  const body = sheet.locator('[data-slot="admin-sheet-body"]');
  const bodyBox = (await body.boundingBox())!;
  expect(await leavesOverflowing(body, bodyBox.x + bodyBox.width)).toEqual([]);
});

test('P29-A3 편집 시트 — 폰 바텀시트 · 역할 즉시 저장 1건 (390)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await mockEditApi(page);

  await page.goto('/admin/users');
  const row = usersRoot(page).locator(`[data-slot="admin-user-row"][data-email="${KIM}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();

  const sheet = page.getByRole('dialog', { name: KIM });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-side', 'bottom');
  // 슬라이드 인이 끝난 뒤 잰다
  await expect.poll(async () => {
    const b = (await sheet.boundingBox())!;
    return Math.round(b.y + b.height);
  }).toBe(844);
  const box = (await sheet.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(844 * 0.8);
  expect(Math.round(box.width)).toBe(390);
  // 목록은 시트 아래로 가려진다 — 행이 시트 영역 안에 있다
  const rowBox = (await row.boundingBox())!;
  expect(rowBox.y).toBeGreaterThanOrEqual(box.y - rowBox.height);

  await sheet.getByRole('group', { name: '역할' }).getByRole('radio', { name: 'admin' }).click();
  await expect(sheet.locator('[data-slot="admin-role-chip"]')).toHaveText('admin');
  await expect.poll(() => writes(api).length).toBe(1);
  expect(writes(api)[0]).toEqual({ method: 'PATCH', path: `/users/${encodeURIComponent(KIM)}`, body: { role: 'admin' } });
  await expect(sheet.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
  await expect(sheet.locator('[data-slot="admin-field-role"]')).toHaveAttribute('data-state', 'idle');

  const body = sheet.locator('[data-slot="admin-sheet-body"]');
  const bodyBox = (await body.boundingBox())!;
  expect(await leavesOverflowing(body, bodyBox.x + bodyBox.width)).toEqual([]);

  await page.screenshot({ path: testInfo.outputPath('admin-user-sheet-390.png') });
});
