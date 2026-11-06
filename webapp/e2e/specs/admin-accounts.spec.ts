import { test, expect, type Locator, type Page } from '@playwright/test';

import {
  ADMIN_LONG_ACCOUNT_NAME,
  ADMIN_MISMATCH_ACCOUNT,
  ADMIN_ORDER_IP,
  ADMIN_ORDER_MAC,
  ADMIN_SHARED_ACCOUNT,
  ADMIN_USERS_FIXTURE_P36,
  mockAdminApi,
  type AdminApiMock,
} from '../fixtures/admin';
import { leavesOverflowing, scrollOverflowing } from '../overflow';

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

// ── 계좌 시트로 옮겨 간 동작 — 주문자 IP/MAC(N-02) · 예수금 · 수수료(N-01) ─────────────────────────

const ALEX_KB = '11122233301';
const SHEET_SELECTOR = '[role="dialog"][data-admin-sheet]';
const SHEET_TAIL = '저장하면 모두 같아져요';
const PAIR_INVALID = 'IP 와 MAC 은 둘 다 적거나 둘 다 비워 주세요';
const RANGE_INVALID = '수수료 · 매도세는 0~1%, 소수 넷째 자리까지예요';
const NOT_LINKED = '사용자에게 연결된 뒤 설정할 수 있어요 — 값은 연결된 사용자의 서버에 저장돼요';

const costsOf = (sheet: Locator) => sheet.locator('[data-slot="account-sheet-costs"]');
const costField = (sheet: Locator, accountNo: string, name: '예수금(원)' | '수수료(%)' | '매도세(%)') =>
  costsOf(sheet).getByRole('textbox', { name: `KB ${accountNo} ${name}`, exact: true });
const costChips = (sheet: Locator) =>
  costsOf(sheet).locator('[data-slot="admin-account-cost-chips"] [data-slot="reflect-chip"]');
const costMismatch = (sheet: Locator) => costsOf(sheet).locator('[data-slot="admin-account-cost-mismatch"]');
const costWrites = (api: AdminApiMock, op: 'budget' | 'fee') => writes(api).filter((r) => r.path.endsWith(`/${op}`));
const ipField = (sheet: Locator) => sheet.getByRole('textbox', { name: '주문자 IP', exact: true });
const macField = (sheet: Locator) => sheet.getByRole('textbox', { name: 'MAC 주소', exact: true });
const userChips = (sheet: Locator, dma: string) =>
  sheet.locator(`[data-slot="account-sheet-user"][data-dma="${dma}"] [data-slot="reflect-chip"]`);

/** 요소 자신의 내용 폭이 상자를 넘는가(입력칸 값 잘림). */
const ownOverflow = (loc: Locator) => loc.evaluate((el) => el.scrollWidth - el.clientWidth);

/** 시트 본문의 잎이 시트 오른쪽을 넘지 않고, 영역 안에서도 스크롤 넘침이 없다. */
async function expectNoClip(page: Page, sheet: Locator, slots: readonly string[]) {
  const body = sheet.locator('[data-slot="admin-sheet-body"]');
  const sheetBox = (await sheet.boundingBox())!;
  expect(await leavesOverflowing(body, sheetBox.x + sheetBox.width)).toEqual([]);
  for (const slot of slots) {
    const area = sheet.locator(`[data-slot="${slot}"]`);
    expect(await area.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await scrollOverflowing(page, `${SHEET_SELECTOR} [data-slot="${slot}"]`)).toEqual([]);
  }
}

test('AC-2 IP/MAC — 불일치 줄 · 짝 검증 · 저장 팬아웃 (1080)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1080, height: 800 });
  const api = await mockAdminApi(page, { users: ADMIN_USERS_FIXTURE_P36 });
  await page.goto('/admin/accounts');

  // ① 불일치 계좌 — 초깃값 = 정본(alexjx · 유효 주문 서버 KB120) 표시 표기 · 다른 자리 한 줄(시트 꼬리)
  let sheet = await openAccountSheet(page, 'KB', ADMIN_MISMATCH_ACCOUNT);
  await expect(ipField(sheet)).toHaveValue('10.41.1.125');
  await expect(macField(sheet)).toHaveValue('1C:FD:08:7D:97:8F');
  const mm = sheet.locator('[data-slot="account-sheet-ipmac-mismatch"]');
  await expect(mm).toHaveCount(1);
  await expect(mm).toHaveAttribute('data-server', 'alexjx · KB121');
  await expect(mm).toHaveText(`alexjx · KB121 값이 달라요(미설정) — ${SHEET_TAIL}`);

  // ② 공유 계좌로 행 전환(비모달 패널) — 모두 미설정 · 빈 칸 · 「저장」 비활성
  sheet = await openAccountSheet(page, 'KB', ADMIN_SHARED_ACCOUNT);
  const ip = ipField(sheet);
  const mac = macField(sheet);
  const save = sheet.getByRole('button', { name: '저장', exact: true });
  await expect(ip).toHaveValue('');
  await expect(mac).toHaveValue('');
  await expect(sheet.locator('[data-slot="account-sheet-ipmac-mismatch"]')).toHaveCount(0);
  await expect(save).toBeDisabled();

  // IP 만 → MAC 칸 aria-invalid · 짝 오류 줄(도움말 대신) · 「저장」 비활성 · 쓰기 0
  await ip.fill('10.41.1.124');
  await expect(mac).toHaveAttribute('aria-invalid', 'true');
  await expect(ip).not.toHaveAttribute('aria-invalid');
  await expect(sheet.locator('[data-slot="account-sheet-ipmac-invalid"]')).toHaveText(PAIR_INVALID);
  await expect(sheet.locator('[data-slot="account-sheet-ipmac-help"]')).toHaveCount(0);
  await expect(save).toBeDisabled();
  expect(writes(api)).toHaveLength(0);

  // MAC 을 소문자 콜론 원문으로 → 「저장」 → PUT 1건(마스터 값 + orderEndpoint 원문)
  await mac.fill('1c:fd:08:7d:97:8e');
  await expect(sheet.locator('[data-slot="account-sheet-ipmac-invalid"]')).toHaveCount(0);
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => writes(api).length).toBe(1);
  expect(writes(api)[0]).toEqual({
    method: 'PUT',
    path: `/accounts/KB/${ADMIN_SHARED_ACCOUNT}`,
    body: {
      name: '공유',
      branchNo: '00123',
      traderId: '000456',
      orderEndpoint: { orderIp: '10.41.1.124', orderMac: '1c:fd:08:7d:97:8e' },
    },
  });

  // 「쓰는 사용자」 의 사용자 · 서버별 결과 칩
  await expect(userChips(sheet, 'alexjx')).toHaveText(['KB120', 'KB121']);
  await expect(userChips(sheet, 'kimtr')).toHaveText(['KB120']);
  for (const dma of ['alexjx', 'kimtr']) {
    for (const chip of await userChips(sheet, dma).all()) await expect(chip).toHaveAttribute('data-tone', 'ok');
  }
  await expect(save).toBeDisabled();

  // 목 상태 — 두 사용자 공유 계좌의 active 서버가 정규화값(87)으로
  const shared = (email: string) =>
    api.state.users.users.find((u) => u.email === email)!.accounts.find((a) => a.accountNo === ADMIN_SHARED_ACCOUNT)!;
  const set = { orderIp: ADMIN_ORDER_IP, orderMac: ADMIN_ORDER_MAC };
  expect(shared('alex@example.invalid').orderEndpoints).toEqual({ KB120: set, KB121: set });
  expect(shared('kim.trader@example.invalid').orderEndpoints).toEqual({ KB120: set });

  // ③ 잘림 — 시트 본문 잎이 시트 안 · IP/MAC 영역 스크롤 넘침 0
  await expectNoClip(page, sheet, ['account-sheet-ipmac']);
  await settled(page);
  await page.screenshot({ path: testInfo.outputPath('admin-account-sheet-ipmac-1080.png') });
});

test('AC-3 예수금 · 수수료 — 표시 · 다름 줄 · 저장 팬아웃 · 범위 밖 · 연결 0명 잠금 (1080)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1080, height: 800 });
  const api = await mockAdminApi(page, { users: ADMIN_USERS_FIXTURE_P36 });
  await page.goto('/admin/accounts');

  // ① alex KB 위탁 — 정본(alexjx · KB120) 값 · alexjx · KB121 다름 두 줄(시트 꼬리) · 쉬는 칩 「<DMA id> · <서버>」
  let sheet = await openAccountSheet(page, 'KB', ALEX_KB);
  const budget = costField(sheet, ALEX_KB, '예수금(원)');
  const fee = costField(sheet, ALEX_KB, '수수료(%)');
  const tax = costField(sheet, ALEX_KB, '매도세(%)');
  await expect(budget).toHaveValue('100,000,000');
  await expect(fee).toHaveValue('0.01');
  await expect(tax).toHaveValue('0.2');
  await expect(costMismatch(sheet)).toHaveText([
    `alexjx · KB121 은 50,000,000원 — ${SHEET_TAIL}`,
    `alexjx · KB121 은 0.05% · 0.2% — ${SHEET_TAIL}`,
  ]);
  await expect(costChips(sheet)).toHaveText(['alexjx · KB120', 'alexjx · KB121']);

  // ② 예수금 120000000 Enter → PUT 1건(원) → 칩 ok → 재조회로 예수금 다름 줄이 사라지고 비용률 줄만
  await budget.click();
  await budget.fill('120000000');
  await expect(budget).toHaveValue('120,000,000');
  await budget.press('Enter');
  await expect.poll(() => costWrites(api, 'budget').length).toBe(1);
  expect(costWrites(api, 'budget')[0]).toEqual({
    method: 'PUT',
    path: `/accounts/KB/${ALEX_KB}/budget`,
    body: { budgetKrw: 120_000_000 },
  });
  await expect(costChips(sheet)).toHaveText(['alexjx · KB120', 'alexjx · KB121']);
  for (const chip of await costChips(sheet).all()) await expect(chip).toHaveAttribute('data-tone', 'ok');
  await expect(costMismatch(sheet)).toHaveText([`alexjx · KB121 은 0.05% · 0.2% — ${SHEET_TAIL}`]);

  // ③ 수수료 1.5 Enter → aria-invalid · 범위 줄 · fee 요청 0 → 0.05 Enter → PUT 1건(ppm) → 다름 줄 0
  await fee.click();
  await fee.fill('1.5');
  await fee.press('Enter');
  await expect(fee).toHaveAttribute('aria-invalid', 'true');
  await expect(costsOf(sheet).locator('[data-slot="admin-account-cost-invalid"]')).toHaveText(RANGE_INVALID);
  expect(costWrites(api, 'fee')).toHaveLength(0);
  await fee.fill('0.05');
  await expect(fee).not.toHaveAttribute('aria-invalid');
  await expect(costsOf(sheet).locator('[data-slot="admin-account-cost-invalid"]')).toHaveCount(0);
  await fee.press('Enter');
  await expect.poll(() => costWrites(api, 'fee').length).toBe(1);
  expect(costWrites(api, 'fee')[0]).toEqual({
    method: 'PUT',
    path: `/accounts/KB/${ALEX_KB}/fee`,
    body: { feePpm: 500, sellTaxPpm: 2000 },
  });
  await expect(costMismatch(sheet)).toHaveCount(0);
  await expectNoClip(page, sheet, ['account-sheet-costs']);
  await settled(page);
  await page.screenshot({ path: testInfo.outputPath('admin-account-sheet-costs-1080.png') });

  // ④ 연결 없는 KB 12345678 로 전환 → 세 칸 · IP/MAC 칸 잠금 + 안내 · 비용 요청 수 그대로
  sheet = await openAccountSheet(page, 'KB', '12345678');
  for (const name of ['예수금(원)', '수수료(%)', '매도세(%)'] as const) {
    await expect(costField(sheet, '12345678', name)).toBeDisabled();
  }
  await expect(sheet.locator('[data-slot="account-sheet-costs-not-linked"]')).toHaveText(NOT_LINKED);
  await expect(ipField(sheet)).toBeDisabled();
  await expect(macField(sheet)).toBeDisabled();
  await expect(sheet.locator('[data-slot="account-sheet-ipmac-not-linked"]')).toHaveText(NOT_LINKED);
  expect(costWrites(api, 'budget')).toHaveLength(1);
  expect(costWrites(api, 'fee')).toHaveLength(1);
});

test('AC-4 폰 390 — 계좌 시트 예수금 · IP/MAC 가로 잘림 0', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await mockAdminApi(page, { users: ADMIN_USERS_FIXTURE_P36 });
  await page.goto('/admin/accounts');

  const sheet = await openAccountSheet(page, 'KB', ALEX_KB);
  await expect(sheet).toHaveAttribute('data-side', 'bottom');
  await expect(ipField(sheet)).toHaveValue('10.41.1.124');
  await costsOf(sheet).scrollIntoViewIfNeeded();
  await expectNoClip(page, sheet, ['account-sheet-ipmac', 'account-sheet-costs']);

  // 13자리 원 상한 값이 예수금 칸 안에 들어간다(저장하지 않는다 — Enter · 포커스 이탈 없음)
  const budget = costField(sheet, ALEX_KB, '예수금(원)');
  await budget.click();
  await budget.fill('9999999999999');
  await expect(budget).toHaveValue('9,999,999,999,999');
  expect(await ownOverflow(budget)).toBeLessThanOrEqual(0);
  expect(writes(api)).toHaveLength(0);

  await settled(page);
  await page.screenshot({ path: testInfo.outputPath('admin-account-sheet-390.png') });
});
