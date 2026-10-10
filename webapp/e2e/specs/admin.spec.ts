import { test, expect, type Locator, type Page } from '@playwright/test';
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

// UI-REVIEW-2 · 목업 A `.panel` · D-14 「목록은 남는다」 — 데스크톱 시트는 비모달 패널(스크림 없음). 목록의 다른 행을
// 누르면 시트가 닫히지 않고 그 사용자로 바뀐다(모달일 때는 바깥 클릭이 시트를 먼저 닫았다).
test('P29-A3b 데스크톱 비모달 — 오버레이 없음 · 행 사이 이동 (1080)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1080, height: 800 });
  await mockEditApi(page);
  const PARK = 'park.view@example.invalid';

  await page.goto('/admin/users');
  const kimRow = usersRoot(page).locator(`[data-slot="admin-user-row"][data-email="${KIM}"]`);
  const parkRow = usersRoot(page).locator(`[data-slot="admin-user-row"][data-email="${PARK}"]`);
  await expect(kimRow).toBeVisible({ timeout: 30_000 });
  await kimRow.click();

  const sheet = page.getByRole('dialog', { name: KIM });
  await expect(sheet).toBeVisible();
  await expect.poll(async () => {
    const b = (await sheet.boundingBox())!;
    return Math.round(b.x + b.width);
  }).toBe(1080);
  // 스크림 · blur 없음 — 목록은 시트 왼쪽에 흐리지 않게 남는다
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);
  const panel = (await sheet.boundingBox())!;
  // 목록은 패널 밑에 깔리지 않는다 — 시트가 열린 동안 본문이 패널 폭을 비워(AdminPanelPage) 행 전체 · 반영 칩 · 머리
  // 「+ 사용자」 가 다 패널 왼쪽이다(목업 A 「목록이 왼쪽에 남는다」 · 메인 트리 첫 실행에서 행 중심 660 > 패널 640 이었다).
  await expect(usersRoot(page)).toHaveAttribute('data-panel-open', 'true');
  const parkBox = (await parkRow.boundingBox())!;
  expect(parkBox.x + parkBox.width).toBeLessThanOrEqual(panel.x);
  expect(await leavesOverflowing(usersRoot(page), panel.x)).toEqual([]);

  // 다른 행 클릭 → 시트는 열린 채 제목만 그 사용자로 · 선택 표시가 옮겨 간다
  await parkRow.click();
  await expect(page.getByRole('dialog', { name: PARK })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: KIM })).toHaveCount(0);
  await expect(parkRow).toHaveAttribute('data-selected', 'true');
  await expect(kimRow).not.toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath('admin-user-sheet-nonmodal-1080.png') });

  // 닫기는 Esc · × — 닫히면 본문이 비운 폭을 돌려받는다
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(usersRoot(page)).not.toHaveAttribute('data-panel-open', 'true');
  await parkRow.click();
  await page.getByRole('dialog', { name: PARK }).getByRole('button', { name: '닫기' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
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

// UI-REVIEW-3 — 폰(640 미만)은 계좌 버튼 · 역할 세그먼트 칸이 36px 이상(오탭 방지) · 데스크톱은 종전 28px 그대로.
for (const vp of [
  { name: '390', width: 390, height: 844, phone: true },
  { name: '1080', width: 1080, height: 800, phone: false },
] as const) {
  test(`P29-A3c 터치 타깃 — 계좌 버튼 · 역할 세그먼트 높이 (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await mockEditApi(page);

    await page.goto('/admin/users');
    const row = usersRoot(page).locator(`[data-slot="admin-user-row"][data-email="${KIM}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    const sheet = page.getByRole('dialog', { name: KIM });
    await expect(sheet).toBeVisible();

    const height = async (loc: Locator) => Math.round((await loc.boundingBox())!.height);
    const check = async (loc: Locator, desktop: number) => {
      const h = await height(loc);
      if (vp.phone) expect(h).toBeGreaterThanOrEqual(36);
      else expect(h).toBe(desktop);
    };

    // 역할 세그먼트 칸 3개
    for (const r of ['viewer', 'trader', 'admin']) {
      await check(sheet.getByRole('group', { name: '역할' }).getByRole('radio', { name: r }), 28);
    }
    // 계좌 「제거」 · 「+ 계좌 추가」
    const kb = sheet.locator(`[data-slot="admin-account"][data-account="${KIM_KB}"]`);
    await check(kb.getByRole('button', { name: /제거$/ }), 28);
    const add = sheet.getByRole('button', { name: '+ 계좌 추가' });
    await check(add, 28);
    // 추가 폼 「취소」 · 「추가」
    await add.click();
    await check(sheet.getByRole('button', { name: '취소', exact: true }), 28);
    await check(sheet.getByRole('button', { name: '추가', exact: true }), 28);
  });
}

// ── P29-G1 계좌 주문 서버(29-38 G-1 ⑦ · 29-30 채택 admin-control A) ──────────────────────────
// 계좌 줄 「주문 서버」 세그먼트에서 KB121 → PUT 1건 → 재조회 값이 정본 · 폰은 칸 36px 이상(29-31) · 데스크톱 종전 28px.
for (const vp of [
  { name: '390', width: 390, height: 844, phone: true },
  { name: '1080', width: 1080, height: 800, phone: false },
] as const) {
  test(`P29-G1 계좌 주문 서버 고르기 — PUT 1건 · 재조회 값 · 터치 타깃 (${vp.name})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const api = await mockAdminApi(page);

    await page.goto('/admin/users');
    const row = usersRoot(page).locator(`[data-slot="admin-user-row"][data-email="${KIM}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    const sheet = page.getByRole('dialog', { name: KIM });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('data-side', vp.phone ? 'bottom' : 'right');

    const kb = sheet.locator(`[data-slot="admin-account"][data-account="${KIM_KB}"]`);
    const seg = kb.getByRole('group', { name: `KB ${KIM_KB} 주문 서버` });
    await expect(seg.getByRole('radio')).toHaveText(['기본 · KB120', 'KB120', 'KB121']);
    await expect(seg.getByRole('radio', { name: '기본 · KB120', exact: true })).toHaveAttribute('aria-checked', 'true');
    // 교보 계좌는 등록 서버 1대 — 세그먼트 없이 글자만
    const ky = sheet.locator('[data-slot="admin-account"][data-account="9876543201"]');
    await expect(ky.locator('[data-slot="admin-order-server"]')).toHaveText('주문 서버 KYOBO119(기본)');
    await expect(ky.getByRole('group', { name: /주문 서버/ })).toHaveCount(0);

    // 터치 타깃 — 폰 36px 이상 · 데스크톱 28px
    for (const name of ['기본 · KB120', 'KB120', 'KB121']) {
      const h = Math.round((await seg.getByRole('radio', { name, exact: true }).boundingBox())!.height);
      if (vp.phone) expect(h).toBeGreaterThanOrEqual(36);
      else expect(h).toBe(28);
    }

    const getsBefore = api.requests.filter((r) => r.method === 'GET' && r.path === '/users').length;
    await seg.getByRole('radio', { name: 'KB121', exact: true }).click();
    await expect.poll(() => writes(api).length).toBe(1);
    expect(writes(api)[0]).toEqual({
      method: 'PUT',
      path: `/dma-users/kimtr/accounts/KB/${KIM_KB}/order-server`,
      body: { serverKey: 'KB121' },
    });
    // 저장 뒤 재조회 — 컨트롤 값은 재조회 값(KB121)
    await expect
      .poll(() => api.requests.filter((r) => r.method === 'GET' && r.path === '/users').length)
      .toBeGreaterThan(getsBefore);
    await expect(seg.getByRole('radio', { name: 'KB121', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(seg.getByRole('radio', { name: '기본 · KB120', exact: true })).toHaveAttribute('aria-checked', 'false');
    await expect(kb.locator('[data-slot="admin-order-server"]')).toHaveAttribute('data-state', 'idle');
    expect(writes(api)).toHaveLength(1);

    // (가) 안내 문장 — relay 가 옛 서버 활성 전략을 끈다 · 되돌릴 때 클라(OCX) 대사
    await expect(sheet.locator('[data-slot="admin-accounts-note"]')).toContainText('활성 전략(상따 · VI · 자동매도)을 끄고');
    await expect(sheet.locator('[data-slot="admin-accounts-note"]')).toContainText('클라(OCX) 대사');

    // 잘림 — 세그먼트가 시트 밖으로 밀리지 않는다
    const body = sheet.locator('[data-slot="admin-sheet-body"]');
    const bodyBox = (await body.boundingBox())!;
    expect(await leavesOverflowing(body, bodyBox.x + bodyBox.width)).toEqual([]);

    await kb.scrollIntoViewIfNeeded();
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath(`admin-order-server-${vp.name}.png`) });
  });
}

// ── P29-A4 · A5 생성 시트 · DMA 연결 (29-19 · D-16) ─────────────────────────────

const NEW_EMAIL = 'lee.new@example.invalid';
const CREATE_BUSY = '미체결 1건 — 먼저 정리';

interface DmaBody {
  dmaUserId: string;
  account: { broker: 'KB' | 'KYOBO'; accountNo: string; name: string; branchNo: string; traderId: string; priority: number };
  servers: string[];
}

/**
 * relay 를 거친 DMA 생성 · 연결의 목 — 의도를 목 상태에 적고(재조회가 새 계좌 · 등록 서버를 받는다 · 87 스냅샷 전이라 미반영)
 * KB121 만 BUSY 로 돌려준다. POST /users 는 승인 대기에서 그 이메일을 뺀다(이미 가입한 이메일 — D-16).
 */
function applyDma(api: AdminApiMock, email: string, role: 'trader' | 'admin' | null, dma: DmaBody) {
  const users = api.state.users;
  users.pending = users.pending.filter((p) => p.email !== email);
  let user = users.users.find((u) => u.email === email);
  if (!user) {
    user = { email, role: role ?? 'trader', dmaUserId: null, signedUp: true, accountCount: 0, servers: [], accounts: [] };
    users.users.push(user);
  }
  if (role) user.role = role;
  user.dmaUserId = dma.dmaUserId;
  user.accountCount = 1;
  user.servers = dma.servers.map((s) => ({ serverKey: s, tone: 'warn' as const, message: null }));
  user.accounts = [
    {
      ...dma.account,
      servers: dma.servers.map((s) => ({ serverKey: s, tone: 'warn' as const, message: null, state: 'active' as const })),
      serverOnlyOn: [],
    },
  ];
  return dma.servers.map((s) =>
    s === 'KB121' ? { server: s, outcome: 'failed', code: 9, message: CREATE_BUSY } : { server: s, outcome: 'ok' },
  );
}

/** 찍기 전 — 진행 중인 CSS 전환(세그먼트 · 체크 칸 색 · 시트 슬라이드)이 끝날 때까지. 반쯤 칠해진 상태를 결함으로 오독하지 않게. */
async function settled(page: Page) {
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
}

async function mockCreateApi(page: Page): Promise<AdminApiMock> {
  const api: AdminApiMock = await mockAdminApi(page, {
    onRequest: (req) => {
      const body = req.body as { email?: string; role?: 'trader' | 'admin' | 'viewer'; dma?: DmaBody } & Partial<DmaBody>;
      if (req.method === 'POST' && req.path === '/users' && body.dma && body.role !== 'viewer') {
        const results = applyDma(api, String(body.email).trim().toLowerCase(), body.role ?? 'trader', body.dma);
        return { body: { ok: true, relayNotified: true, results } };
      }
      const connect = /^\/users\/([^/]+)\/dma$/.exec(req.path);
      if (req.method === 'POST' && connect) {
        const results = applyDma(api, decodeURIComponent(connect[1]), null, body as DmaBody);
        return { body: { results, relayNotified: true } };
      }
      return undefined;
    },
  });
  return api;
}

test('P29-A4 생성 시트 — trader + DMA + 첫 계좌 한 번에 → 편집 시트 결과 칩 (1080)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1080, height: 800 });
  const api = await mockCreateApi(page);

  await page.goto('/admin/users');
  const root = usersRoot(page);
  await expect(userRows(page)).toHaveCount(4, { timeout: 30_000 });
  await expect(root.locator('[data-slot="admin-pending"]')).toContainText(NEW_EMAIL);

  await root.getByRole('button', { name: '+ 사용자' }).click();
  const sheet = page.getByRole('dialog', { name: '사용자 만들기' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-side', 'right');
  await expect(sheet).toContainText('가입 전이면 사전 등록으로 남고, 이미 가입했으면 승인 대기에서 빠진다.');

  // trader(기본) → 「DMA 연결 · 필수」 그룹
  const role = sheet.getByRole('group', { name: '역할' });
  await expect(role.getByRole('radio', { name: 'trader' })).toHaveAttribute('aria-checked', 'true');
  const group = sheet.locator('[data-slot="admin-dma-connect"]');
  await expect(group).toBeVisible();
  const submit = sheet.locator('[data-slot="admin-user-create-submit"]');
  await expect(submit).toBeDisabled();

  await sheet.getByLabel(/gmail/).fill(NEW_EMAIL);
  await group.getByLabel(/DMA 사용자 id/).fill('leenew');
  await group.getByLabel('비밀번호', { exact: true }).fill('pw-1234');
  await group.getByLabel('비밀번호 확인').fill('pw-1234');
  await group.getByLabel('계좌번호').fill('0012345678');
  await group.getByLabel('지점').fill('00123');
  await group.getByLabel('트레이더').fill('000789');
  await group.getByRole('checkbox', { name: 'KB120' }).click();
  await group.getByRole('checkbox', { name: 'KB121' }).click();
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveText('사용자 + DMA 유저 만들기 · 서버 2대에 반영');
  await expect(group.getByRole('checkbox', { name: 'KB121' })).toHaveAttribute('data-state', 'checked');

  // 잘림 — 생성 시트 본문이 패널 밖으로 밀리지 않는다
  const createBody = sheet.locator('[data-slot="admin-sheet-body"]');
  const createBox = (await createBody.boundingBox())!;
  expect(await leavesOverflowing(createBody, createBox.x + createBox.width)).toEqual([]);
  await settled(page);
  await page.screenshot({ path: testInfo.outputPath('admin-user-create-1080.png') });

  await submit.click();

  // POST 1건 — 정규화 계좌번호 · 레지스트리 순 서버
  const edit = page.getByRole('dialog', { name: NEW_EMAIL });
  await expect(edit).toBeVisible();
  await expect(sheet).toHaveCount(0);
  // 슬라이드 인이 끝난 뒤 잰다 · 찍는다
  await expect.poll(async () => {
    const b = (await edit.boundingBox())!;
    return Math.round(b.x + b.width);
  }).toBe(1080);
  const posts = writes(api);
  expect(posts).toEqual([
    {
      method: 'POST',
      path: '/users',
      body: {
        email: NEW_EMAIL,
        role: 'trader',
        dma: {
          dmaUserId: 'leenew',
          password: 'pw-1234',
          account: { broker: 'KB', accountNo: '12345678', name: '', branchNo: '00123', traderId: '000789', priority: 0 },
          servers: ['KB120', 'KB121'],
        },
      },
    },
  ]);

  // 재조회 — 승인 대기에서 빠지고 사용자 목록에
  expect(api.requests.filter((r) => r.method === 'GET' && r.path === '/users')).toHaveLength(2);
  await expect(root.locator('[data-slot="admin-pending"]')).toHaveCount(0);
  await expect(root.locator(`[data-slot="admin-user-row"][data-email="${NEW_EMAIL}"]`)).toBeVisible();

  // 편집 시트 — 서버별 결과 칩(KB120 반영됨 · KB121 실패 · BUSY 원문)
  const acct = edit.locator('[data-slot="admin-account"][data-account="12345678"]');
  const chip = (key: string) => acct.locator(`[data-slot="admin-server-toggle"][data-server="${key}"] [data-slot="reflect-chip"]`);
  await expect(chip('KB120')).toHaveText('반영됨');
  await expect(chip('KB121')).toHaveText('실패 · BUSY');
  await expect(chip('KB121')).toHaveAttribute('title', CREATE_BUSY);
  await expect(edit.locator('[data-slot="admin-busy-line"]')).toHaveText(
    `KB121 실패 · BUSY: ${CREATE_BUSY} — 정리 뒤 「다시 반영」`,
  );
  await settled(page);
  await page.screenshot({ path: testInfo.outputPath('admin-user-created-sheet-1080.png') });
});

test('P29-A5 viewer 생성 → trader 로 올림 → 편집 시트 DMA 연결 · 생성 시트 바텀시트 (390)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await mockCreateApi(page);

  await page.goto('/admin/users');
  const root = usersRoot(page);
  await expect(userRows(page)).toHaveCount(4, { timeout: 30_000 });

  // 생성 시트 = 폰 바텀시트(거의 전체 높이 · 폭 전체)
  await root.getByRole('button', { name: '+ 사용자' }).click();
  const sheet = page.getByRole('dialog', { name: '사용자 만들기' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-side', 'bottom');
  await expect.poll(async () => {
    const b = (await sheet.boundingBox())!;
    return Math.round(b.y + b.height);
  }).toBe(844);
  const box = (await sheet.boundingBox())!;
  expect(Math.round(box.width)).toBe(390);
  expect(box.height).toBeGreaterThanOrEqual(844 * 0.8);

  // trader(기본) — DMA 그룹 · 교보로 바꾸면 지점 · 트레이더 칸 없음
  const group = sheet.locator('[data-slot="admin-dma-connect"]');
  await expect(group).toBeVisible();
  await expect(group.getByLabel('지점')).toBeVisible();
  await group.getByRole('radio', { name: '교보' }).click();
  await expect(group.getByLabel('지점')).toHaveCount(0);
  await expect(group.getByLabel('트레이더')).toHaveCount(0);
  await expect(group.getByRole('checkbox')).toHaveCount(2);
  await expect(group.getByRole('checkbox', { name: 'KB120' })).toHaveCount(0);
  const body = sheet.locator('[data-slot="admin-sheet-body"]');
  const bodyBox = (await body.boundingBox())!;
  expect(await leavesOverflowing(body, bodyBox.x + bodyBox.width)).toEqual([]);
  await settled(page);
  await page.screenshot({ path: testInfo.outputPath('admin-user-create-390.png') });

  // viewer — 그룹 없음 · 안내(D-21 「테마」) · 버튼 「사용자 만들기」
  await sheet.getByRole('group', { name: '역할' }).getByRole('radio', { name: 'viewer' }).click();
  await expect(group).toHaveCount(0);
  await expect(sheet).toContainText(
    'viewer 는 스캐너 · 뉴스 · 테마만 보고 DMA 연결이 없다. 나중에 trader 로 올리면 편집 시트에서 DMA 를 연결한다.',
  );
  const submit = sheet.locator('[data-slot="admin-user-create-submit"]');
  await expect(submit).toHaveText('사용자 만들기');
  await sheet.getByLabel(/gmail/).fill(NEW_EMAIL);
  await settled(page);
  await page.screenshot({ path: testInfo.outputPath('admin-user-create-viewer-390.png') });
  await submit.click();

  // POST 1건 — dma 없음 → 그 이메일 편집 시트(viewer · 연결 그룹 없음)
  const edit = page.getByRole('dialog', { name: NEW_EMAIL });
  await expect(edit).toBeVisible();
  expect(writes(api)).toEqual([{ method: 'POST', path: '/users', body: { email: NEW_EMAIL, role: 'viewer' } }]);
  await expect(edit).toContainText('DMA 연결 없음');
  await expect(edit.locator('[data-slot="admin-dma-connect"]')).toHaveCount(0);

  // trader 로 올림 → PATCH 1건 → 「DMA 연결」 그룹
  await edit.getByRole('group', { name: '역할' }).getByRole('radio', { name: 'trader' }).click();
  await expect.poll(() => writes(api).length).toBe(2);
  expect(writes(api)[1]).toEqual({ method: 'PATCH', path: `/users/${encodeURIComponent(NEW_EMAIL)}`, body: { role: 'trader' } });
  const connect = edit.locator('[data-slot="admin-dma-connect"]');
  await expect(connect).toBeVisible();
  const connectBtn = edit.locator('[data-slot="admin-dma-connect-submit"]');
  await expect(connectBtn).toBeDisabled();

  await connect.getByRole('radio', { name: '교보' }).click();
  await connect.getByLabel(/DMA 사용자 id/).fill('leenew');
  await connect.getByLabel('비밀번호', { exact: true }).fill('pw-1');
  await connect.getByLabel('비밀번호 확인').fill('pw-1');
  await connect.getByLabel('계좌번호').fill('0098765432');
  await connect.getByRole('checkbox', { name: 'KYOBO119' }).click();
  await expect(connectBtn).toHaveText('DMA 유저 + 첫 계좌 만들기 · 서버 1대에 반영');
  await connectBtn.click();

  // POST /users/:email/dma 1건 → 재조회가 DMA id 를 채워 계좌 줄 · 결과 칩
  await expect.poll(() => writes(api).length).toBe(3);
  expect(writes(api)[2]).toEqual({
    method: 'POST',
    path: `/users/${encodeURIComponent(NEW_EMAIL)}/dma`,
    body: {
      dmaUserId: 'leenew',
      password: 'pw-1',
      account: { broker: 'KYOBO', accountNo: '98765432', name: '', branchNo: '', traderId: '', priority: 0 },
      servers: ['KYOBO119'],
    },
  });
  const acct = edit.locator('[data-slot="admin-account"][data-account="98765432"]');
  await expect(acct).toBeVisible();
  await expect(acct).toContainText('지점 해당 없음 · 트레이더 해당 없음');
  await expect(
    acct.locator('[data-slot="admin-server-toggle"][data-server="KYOBO119"] [data-slot="reflect-chip"]'),
  ).toHaveText('반영됨');
  await expect(edit.locator('[data-slot="admin-dma-connect"]')).toHaveCount(0);
  await expect(edit.locator('[data-slot="admin-password"]')).toContainText('leenew');

  const editBody = edit.locator('[data-slot="admin-sheet-body"]');
  const editBox = (await editBody.boundingBox())!;
  expect(await leavesOverflowing(editBody, editBox.x + editBox.width)).toEqual([]);
  await settled(page);
  await page.screenshot({ path: testInfo.outputPath('admin-user-connected-390.png') });
});
