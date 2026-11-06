import { test, expect, type Locator, type Page } from '@playwright/test';

import {
  ADMIN_LONG_ACCOUNT_NAME,
  ADMIN_SHARED_ACCOUNT,
  ADMIN_USERS_FIXTURE_P36,
  mockAdminApi,
  type AdminApiMock,
} from '../fixtures/admin';
import { leavesOverflowing } from '../overflow';

/**
 * quick 261106-t8k — 웹 Admin `/admin/accounts`(계좌 메뉴 · 261106-lwu) · 계좌 수정 시트(261106-ntl) E2E.
 *
 * ① 무엇을 증명하는가
 *   RTL 은 `fetchAdminAccounts` 를 목으로 갈아끼우고 컴포넌트만 본다. 여기서 보는 것은 앞단이다 — **진짜 middleware** 가 e2e 계정
 *   (admin 시드)을 `/admin/accounts` 로 통과시키고, 브라우저가 Express 경로(`/api/admin/accounts` · `/api/admin/users`)로 목록 · 시트를
 *   그리는지, 쓰기가 요청 1건 · 바디 그대로 나가는지.
 *
 * ② 목 — `mockAdminApi`(픽스처 머리 주석 ⑦). 계좌 마스터는 사용자 픽스처(`ADMIN_USERS_FIXTURE_P36`)에서 파생한 7행 + 연결 없는 2행
 *   (KB 12345678 · 교보 98765432). 「쓰는 사용자」 는 GET 때 현재 사용자 상태에서 계산된다.
 *
 * ③ 범위 — 목록 스모크(AC-1) + 사용자 카드에서 계좌 시트로 옮겨 간 동작만: 주문자 IP/MAC(AC-2 · N-02) · 예수금 · 수수료(AC-3 · AC-4 ·
 *   N-01). 사용자 화면의 카드 읽기 줄 · 계좌 연결 피커는 admin.spec.ts 몫이다.
 */

const DERIVED_COUNT = 7; // 사용자 픽스처 P36 의 서로 다른 (증권사, 계좌번호) — alex 5 · kim 3 중 공유 1
const ROW_COUNT = DERIVED_COUNT + 2;

const accountsRoot = (page: Page) => page.locator('[data-slot="admin-accounts"]');
const accountRows = (page: Page) => accountsRoot(page).locator('[data-slot="admin-account-row"]');
const accountRow = (page: Page, broker: string, accountNo: string) =>
  accountsRoot(page).locator(`[data-slot="admin-account-row"][data-key="${broker}|${accountNo}"]`);
const sheetOf = (page: Page) => page.locator('[role="dialog"][data-admin-sheet]');

const writes = (api: AdminApiMock) => api.requests.filter((r) => r.method !== 'GET');
const gets = (api: AdminApiMock, path: string) => api.requests.filter((r) => r.method === 'GET' && r.path === path);

/** 실행 중 애니메이션(시트 슬라이드 인 등)이 끝날 때까지. */
async function settled(page: Page) {
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
}

/** 계좌 행을 눌러 수정 시트를 열고 슬라이드 인이 끝날 때까지 기다린다. */
async function openAccountSheet(page: Page, broker: string, accountNo: string): Promise<Locator> {
  const row = accountRow(page, broker, accountNo);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  const sheet = sheetOf(page);
  await expect(sheet.locator('[data-slot="account-sheet"][data-mode="edit"]')).toBeVisible();
  await expect(sheet.locator('[data-slot="account-sheet-account-no"]')).toHaveText(accountNo);
  await settled(page);
  return sheet;
}

test('AC-1 계좌 목록 · 등록 · 삭제 잠금 (1080)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1080, height: 800 });
  const api = await mockAdminApi(page, { users: ADMIN_USERS_FIXTURE_P36 });
  expect(api.state.accounts).toHaveLength(ROW_COUNT);

  await page.goto('/admin/accounts');
  await expect(page).toHaveURL(/\/admin\/accounts$/);
  const root = accountsRoot(page);
  await expect(root.getByRole('heading', { level: 1, name: '계좌' })).toBeVisible({ timeout: 30_000 });
  await expect(accountRows(page)).toHaveCount(ROW_COUNT, { timeout: 15_000 });
  await expect(root.locator('[data-slot="admin-accounts-count"]')).toHaveText(String(ROW_COUNT));
  expect(gets(api, '/accounts')).toHaveLength(1);

  // 공유 계좌 — 쓰는 사용자 칩 alexjx · kimtr(DMA id 오름차순)
  const shared = accountRow(page, 'KB', ADMIN_SHARED_ACCOUNT);
  await expect(shared.locator('[data-slot="admin-account-user-chip"]')).toHaveText(['alexjx', 'kimtr']);
  await expect(shared.locator('[data-slot="admin-account-no-users"]')).toHaveCount(0);

  // 연결 없는 계좌 — 점선 「연결 없음」 · 이름 없음
  const unlinked = accountRow(page, 'KB', '12345678');
  await expect(unlinked.locator('[data-slot="admin-account-no-users"]')).toHaveText('연결 없음');
  await expect(unlinked.locator('[data-slot="admin-account-user-chip"]')).toHaveCount(0);
  await expect(unlinked).toContainText('이름 없음');
  // 교보 — 지점 · 트레이더 해당 없음
  await expect(accountRow(page, 'KYOBO', '98765432').locator('[data-slot="admin-account-branch"]')).toHaveText(
    '지점 · 트레이더 해당 없음',
  );

  // 목록 가로 넘침 0 — 40자 이름 계좌 포함
  await expect(root.getByText(ADMIN_LONG_ACCOUNT_NAME, { exact: true })).toBeVisible();
  const list = root.locator('[data-slot="admin-accounts-list"] ul').first();
  const listBox = (await list.boundingBox())!;
  expect(await leavesOverflowing(list, listBox.x + listBox.width)).toEqual([]);

  // 증권사 세그먼트 「교보」 → 3행
  await root.getByRole('radio', { name: /^교보/ }).click();
  await expect(accountRows(page)).toHaveCount(3);
  await root.getByRole('radio', { name: /^전체/ }).click();
  await expect(accountRows(page)).toHaveCount(ROW_COUNT);

  // 「+ 계좌」 → 등록 시트 → POST 1건(계좌번호는 정규화값 — 앞 0 제거) → 재조회로 새 행 · 「연결 없음」
  await root.getByRole('button', { name: '+ 계좌', exact: true }).click();
  const sheet = sheetOf(page);
  const form = sheet.locator('[data-slot="account-sheet"][data-mode="create"]');
  await expect(form).toBeVisible();
  await settled(page);
  const submit = sheet.getByRole('button', { name: '등록', exact: true });
  await expect(submit).toBeDisabled();
  await form.getByLabel('계좌번호', { exact: true }).fill('0099887766');
  await form.getByLabel('계좌명', { exact: true }).fill('신규');
  await form.getByLabel('지점', { exact: true }).fill('00123');
  await form.getByLabel('트레이더', { exact: true }).fill('000789');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => writes(api).length).toBe(1);
  expect(writes(api)[0]).toEqual({
    method: 'POST',
    path: '/accounts',
    body: { broker: 'KB', accountNo: '99887766', name: '신규', branchNo: '00123', traderId: '000789' },
  });
  await expect(form).toHaveCount(0);
  await expect(accountRows(page)).toHaveCount(ROW_COUNT + 1);
  const created = accountRow(page, 'KB', '99887766');
  await expect(created).toContainText('신규');
  await expect(created.locator('[data-slot="admin-account-no-users"]')).toHaveText('연결 없음');
  expect(gets(api, '/accounts')).toHaveLength(2);

  // 연결된 계좌의 수정 시트 — 「삭제」 잠금 + 안내 문장 · DELETE 요청 0
  const edit = await openAccountSheet(page, 'KB', ADMIN_SHARED_ACCOUNT);
  const del = edit.locator('[data-slot="account-sheet-delete"]');
  await expect(del.locator('[data-slot="account-sheet-delete-locked"]')).toHaveText(
    '연결된 사용자가 있어 삭제할 수 없어요 — 「사용자」 에서 먼저 연결을 해제하세요',
  );
  await expect(del.getByRole('button', { name: '삭제', exact: true })).toBeDisabled();
  expect(api.requests.filter((r) => r.method === 'DELETE')).toHaveLength(0);

  await page.screenshot({ path: testInfo.outputPath('admin-accounts-1080.png'), fullPage: true });
});
