import { test, expect, type Locator, type Page } from '@playwright/test';

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

/** 시트 · 다이얼로그 열림 애니메이션이 끝날 때까지 — 스크린샷이 미끄러지는 중간을 찍지 않게. */
async function settled(loc: Locator): Promise<void> {
  await loc.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
}

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

// ── P29-S2 시세 주 서버 전환 실패 복귀 · 사용 토글 확인 · 편집/추가 시트 ─────────────────

const QUOTE_FAIL = '새 서버 로그인 실패 — KB120 으로 되돌림';

test('P29-S2 시세 주 서버 전환 실패 복귀 · 사용 토글 확인 (1080)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1080, height: 800 });
  // relay 409 를 손으로 풀어 「전환 중」 을 본다 — 응답 전 상태를 단언한 뒤 실패를 돌려준다.
  let releaseQuote!: () => void;
  const quoteHeld = new Promise<void>((resolve) => {
    releaseQuote = resolve;
  });
  const api = await mockAdminApi(page, {
    onRequest: async (req) => {
      if (req.method === 'PUT' && req.path.endsWith('/quote-primary')) {
        await quoteHeld;
        return { status: 409, body: { error: { code: 'QUOTE_SWITCH_FAILED', message: QUOTE_FAIL } } };
      }
      return undefined;
    },
  });

  await page.goto('/admin/servers');
  const root = serversRoot(page);
  await expect(root.locator('[data-slot="server-card"]')).toHaveCount(4, { timeout: 30_000 });

  // 주문/시세 서버는 끌 수 없다
  await expect(page.getByRole('switch', { name: 'KB120 사용' })).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'KYOBO119 사용' })).toBeDisabled();

  // ── 시세 주 서버 KB120 → KYOBO119 — 응답 전 「전환 중」 · 시세 라디오 전부 잠김
  await card(page, 'KYOBO119').locator('[data-slot="server-quote-radio"]').click();
  await expect(card(page, 'KYOBO119').locator('[data-slot="server-switching"]')).toHaveText('전환 중');
  for (const key of ['KB120', 'KB121', 'KYOBO119', 'KYOBO127']) {
    await expect(page.getByRole('radio', { name: `${key} 시세 주 서버` })).toBeDisabled();
  }
  await page.screenshot({ path: testInfo.outputPath('admin-servers-switching-1080.png'), fullPage: true });

  // relay 409 → 라디오는 KB120 으로 · KYOBO119 카드에 relay message 원문 한 줄 · 칩은 그대로
  releaseQuote();
  await expect(card(page, 'KYOBO119').locator('[data-slot="server-card-error"]')).toHaveText(QUOTE_FAIL);
  await expect(page.getByRole('radio', { name: 'KB120 시세 주 서버' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'KYOBO119 시세 주 서버' })).not.toBeChecked();
  await expect(root.locator('[data-slot="server-switching"]')).toHaveCount(0);
  await expect(roleChip(page, 'KB120', 'quote')).toBeVisible();
  await expect(roleChip(page, 'KYOBO119', 'quote')).toHaveCount(0);
  expect(api.requests.filter((r) => r.method === 'PUT')).toEqual([
    { method: 'PUT', path: '/servers/KYOBO119/quote-primary', body: null },
  ]);
  await page.screenshot({ path: testInfo.outputPath('admin-servers-quote-failed-1080.png'), fullPage: true });

  // ── 사용 토글 — 유저 2명인 KB121 끄기 → 확인 다이얼로그 → 취소 0건
  const kb121 = page.getByRole('switch', { name: 'KB121 사용' });
  await kb121.click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('운영 중 서버에 유저 2명 — 끄면 저널 · admin 연결을 내린다');
  await settled(dlg);
  await page.screenshot({ path: testInfo.outputPath('admin-servers-off-confirm-1080.png') });
  await dlg.getByRole('button', { name: '취소' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('[data-slot="server-sheet"]')).toHaveCount(0);
  expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);
  await expect(kb121).toBeChecked();

  // 다시 → 「끄기」 → PATCH 1건 → 재조회 → 꺼짐 · 라디오 비활성
  await kb121.click();
  await page.getByRole('alertdialog').getByRole('button', { name: '끄기' }).click();
  await expect(kb121).not.toBeChecked();
  await expect(page.getByRole('radio', { name: 'KB121 주문 서버' })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'KB121 시세 주 서버' })).toBeDisabled();
  expect(api.requests.filter((r) => r.method === 'PATCH')).toEqual([
    { method: 'PATCH', path: '/servers/KB121', body: { enabled: false } },
  ]);
  await expect(page.locator('[data-slot="server-sheet"]')).toHaveCount(0);
});

for (const vp of VIEWPORTS) {
  test(`P29-S2 서버 편집 · 추가 시트 — 폼 제출 1건 · 새 서버는 꺼짐 (${vp.name})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const api = await mockAdminApi(page);

    await page.goto('/admin/servers');
    const root = serversRoot(page);
    await expect(root.locator('[data-slot="server-card"]')).toHaveCount(4, { timeout: 30_000 });

    // 카드 탭 → 편집 시트(키 · 증권사 읽기 전용) → 포트 수정 → 「저장」 1건
    await card(page, 'KB121').locator('[data-slot="server-addr"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'KB121' })).toBeVisible();
    await expect(dialog.locator('[data-slot="server-sheet-key"]')).toHaveText('KB121');
    await expect(dialog.getByRole('textbox', { name: '키' })).toHaveCount(0);
    await dialog.getByRole('textbox', { name: '포트' }).fill('9101');
    await settled(dialog);
    await page.screenshot({ path: testInfo.outputPath(`admin-server-sheet-edit-${vp.name}.png`) });
    await dialog.getByRole('button', { name: '저장' }).click();
    await expect(page.locator('[data-slot="server-sheet"]')).toHaveCount(0);
    await expect(card(page, 'KB121').locator('[data-slot="server-addr"]')).toHaveText('192.0.2.121:9101');
    expect(api.requests.filter((r) => r.method === 'PATCH')).toEqual([
      { method: 'PATCH', path: '/servers/KB121', body: { host: '192.0.2.121', port: 9101 } },
    ]);

    // 「+ 서버」 → 추가 시트 — 잘못된 값은 칸 오류 + 비활성
    await root.getByRole('button', { name: '+ 서버' }).click();
    const create = page.getByRole('dialog');
    await expect(create.getByRole('heading', { name: '서버 추가' })).toBeVisible();
    await create.getByRole('textbox', { name: '키' }).fill('KX1');
    await create.getByRole('textbox', { name: '주소' }).fill('192.0.2.122');
    await create.getByRole('textbox', { name: '포트' }).fill('70000');
    await expect(create.locator('[data-slot="server-sheet-error-key"]')).toBeVisible();
    await expect(create.locator('[data-slot="server-sheet-error-port"]')).toBeVisible();
    await expect(create.getByRole('button', { name: '추가' })).toBeDisabled();
    await settled(create);
    await page.screenshot({ path: testInfo.outputPath(`admin-server-sheet-create-invalid-${vp.name}.png`) });

    await create.getByRole('textbox', { name: '키' }).fill('KB122');
    await create.getByRole('textbox', { name: '포트' }).fill('9100');
    await create.getByRole('button', { name: '추가' }).click();
    await expect(page.locator('[data-slot="server-sheet"]')).toHaveCount(0);
    expect(api.requests.filter((r) => r.method === 'POST')).toEqual([
      { method: 'POST', path: '/servers', body: { key: 'KB122', broker: 'KB', host: '192.0.2.122', port: 9100 } },
    ]);

    // 새 서버 카드 — 사용 꺼짐 · 상태 모름 · 라디오 비활성
    await expect(root.locator('[data-slot="server-card"]')).toHaveCount(5);
    await expect(root).toContainText('레지스트리 5대 · 주문/시세 서버');
    await expect(page.getByRole('switch', { name: 'KB122 사용' })).not.toBeChecked();
    await expect(card(page, 'KB122').locator('[data-axis="unknown"]')).toHaveText('상태 모름');
    await expect(page.getByRole('radio', { name: 'KB122 주문 서버' })).toBeDisabled();
  });
}
