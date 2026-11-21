import { test, expect, type Locator, type Page } from '@playwright/test';

import { SETTLEMENT_NOW, mockSettlementApi } from '../fixtures/settlement';

/**
 * Phase 44 (44-12) — 웹 Admin `/admin/settlement` 어드민 정산 E2E.
 *
 * ① 진짜 middleware 가 e2e 계정(admin 시드)을 `/admin/settlement` 로 통과시키고, 브라우저가 Express 경로
 *   (`/api/admin/settlement`)로 받은 응답을 그리는지. 화면 데이터는 `mockSettlementApi`(정산 경로 전용 page.route)다 —
 *   운영 relay · DB · 실제 계좌번호는 쓰지 않는다.
 * ② 검산 숫자(D-01 · 규칙 1 ~ 6) — 검산 픽스처로 첫 화면에 정산 전 수익 · 명의 대 몫 · 계좌이체 차액이 정해진 글자 그대로 나온다.
 * ③ 폭 — 뷰포트 360 · 390 · 1024 · 1440 에서 문서 · 앱 셸 `main` 가로 넘침 0 · 큰 숫자 · 계좌 표 값 칸 · 「…원이면 맞음」 ·
 *   머리 두 버튼이 잘리지 않는다(UI E1 · E2 · E3 · E4 · E6 · E8 overflow 의 자동 부분 — 사람 눈 확인은 44-13 · UAT 에 남는다).
 * ④ 흐름 — 정산 확정(D-16 · D-17 · D-27) · 거래 기록(D-10 · D-27) · 사람-묶음 막기(D-29)의 요청 바디와 화면 흐름.
 *
 * 사람 카드 큰 숫자(`totalKrw` vs `stakeKrw` — 44-06 열린 질문)는 값을 잠그지 않는다(잘림만 본다).
 */

async function horizontalOverflow(page: Page): Promise<{ doc: number; main: number }> {
  return page.evaluate(() => {
    const se = document.scrollingElement ?? document.documentElement;
    const main = document.querySelector('main');
    return { doc: se.scrollWidth - se.clientWidth, main: main === null ? 0 : main.scrollWidth - main.clientWidth };
  });
}

async function clipOf(locator: Locator): Promise<{ scroll: number; client: number }> {
  return locator.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
}

async function expectNotClipped(locator: Locator, what: string): Promise<void> {
  const c = await clipOf(locator);
  expect(c.client, `${what} — 폭 0(측정 대상이 그려지지 않음)`).toBeGreaterThan(0);
  expect(c.scroll, `${what} — scrollWidth ${c.scroll} > clientWidth ${c.client}`).toBeLessThanOrEqual(c.client);
}

const root = (page: Page) => page.locator('[data-slot="admin-settlement"]');
const ledgerHead = (page: Page) => root(page).locator('[data-slot="settlement-ledger-create"]');
const settleHead = (page: Page) => root(page).locator('[data-slot="settlement-settle-create"]');
const activity = (page: Page) => root(page).locator('[data-slot="settlement-activity"]');
const segment = (page: Page, name: string) => activity(page).getByRole('radio', { name, exact: true });
const pools = (page: Page) => root(page).locator('[data-slot="settlement-open-pools"]');
const nameVs = (page: Page) => root(page).locator('[data-slot="settlement-name-vs"]');
const sheetOf = (page: Page) => page.locator('[role="dialog"][data-admin-sheet]');
const pillGroup = (scope: Locator, label: string) => scope.getByRole('radiogroup', { name: label, exact: true });
const pill = (scope: Locator, group: string, name: string) =>
  pillGroup(scope, group).getByRole('radio', { name, exact: true });

/** 실행 중 애니메이션(시트 슬라이드 인 · 아웃)이 끝날 때까지. */
async function settled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length))
    .toBe(0);
}

/** 머리 버튼으로 시트를 열고 제목 · 슬라이드 인 끝까지 기다린다. */
async function openSheet(page: Page, head: Locator, title: string): Promise<Locator> {
  await head.click();
  const sheet = sheetOf(page);
  await expect(sheet.locator('[data-slot="sheet-title"]')).toHaveText(title);
  await settled(page);
  return sheet;
}

async function open(page: Page): Promise<void> {
  await page.goto('/admin/settlement');
  await expect(root(page).getByRole('heading', { level: 1, name: '정산' })).toBeVisible({ timeout: 30_000 });
  // 첫 불러오기 끝 — 세 사람 카드 · 머리 버튼 활성.
  await expect(root(page).locator('[data-slot="settlement-person"]')).toHaveCount(3, { timeout: 15_000 });
  await expect(settleHead(page)).toBeEnabled();
}

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

test.describe('어드민 정산', () => {
  test('P44-E1 1440 — 검산 숫자 · 예수금 기준 줄 · 활동 카드 기본 「계좌 거래」 9줄 · 사이드바 「정산」 활성', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const api = await mockSettlementApi(page);
    await open(page);

    await expect(page).toHaveTitle('정산 · Admin');
    expect(api.requests.filter((r) => r.method === 'GET').length).toBeGreaterThanOrEqual(1);

    // ③ 정산 전 수익 — 현중 · 근형 +10억 4,900만 · 쥬니 −2,800만.
    await expect(pools(page).locator('[data-slot="settlement-pool"][data-pool="p1"] [data-slot="settlement-pool-value"]')).toHaveText(
      '+10억 4,900만',
    );
    await expect(pools(page).locator('[data-slot="settlement-pool"][data-pool="p2"] [data-slot="settlement-pool-value"]')).toHaveText(
      '−2,800만',
    );
    await expect(pools(page).locator('[data-slot="settlement-budget-basis"]')).toHaveText(
      '예수금은 현금 + 보유 종목 매입금액 기준이에요(평가금액 아님)',
    );

    // ④ 명의 대 몫 — 김현중 몫 · 정근형 몫 9억 2,450만(2회) · 심쥬니 몫 7,200만 · 「김현중 → 정근형 5,950만원이면 맞음」.
    await expect(nameVs(page)).toContainText('그중 김현중 몫 9억 2,450만 · 심쥬니 몫 7,200만');
    await expect(nameVs(page)).toContainText('정근형 몫은 9억 2,450만');
    const nameVsText = (await nameVs(page).textContent()) ?? '';
    expect(nameVsText.match(/9억 2,450만/g) ?? []).toHaveLength(2);
    await expect(nameVs(page).locator('[data-slot="settlement-name-zero-amt"]')).toHaveText('김현중 → 정근형 5,950만원이면 맞음');

    // ⑤ 현중 ↔ 근형 계좌이체 — 차액.
    await expect(root(page).locator('[data-slot="settlement-transfer"]')).toContainText('정근형이 3억 더 보냄');

    // ⑥ 활동 카드 — 기본 「계좌 거래」 · 시드 9줄 · 펼친 줄 없음.
    await expect(segment(page, '계좌 거래')).toHaveAttribute('aria-checked', 'true');
    await expect(activity(page).locator('[data-slot="settlement-ledger-item"]')).toHaveCount(9);

    // ⑪ 사이드바 — Admin 하위 「정산」 활성.
    const nav = page.locator('aside nav[aria-label="주 메뉴"]');
    await expect(nav.getByRole('link', { name: '정산', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  for (const vp of VIEWPORTS) {
    test(`P44-E2 ${vp.width} — 가로 넘침 0 · 큰 숫자 · 계좌 표 값 칸 · 「…원이면 맞음」 · 머리 두 버튼 비잘림`, async ({ page }) => {
      await page.setViewportSize(vp);
      await mockSettlementApi(page);
      await open(page);
      await expect(pools(page).locator('[data-slot="settlement-pool-value"]').first()).toHaveText('+10억 4,900만');

      // 문서 · 앱 셸 main 가로 스크롤 0.
      expect(await horizontalOverflow(page)).toEqual({ doc: 0, main: 0 });

      // ② 「내 수익 몫」 큰 숫자 3개 — 값은 잠그지 않고(44-06 열린 질문) 잘림만.
      const bigs = root(page).locator('[data-slot="settlement-person-big"]');
      await expect(bigs).toHaveCount(3);
      for (let i = 0; i < 3; i++) await expectNotClipped(bigs.nth(i), `사람 카드 ${i} 큰 숫자`);

      // ③ 계좌 표 최악 줄 KB 정근형의 수익 칸 「+10억 6,500만」 — 줄 래퍼는 display: contents 라 칸(4번째 span)을 잰다.
      const kbG = pools(page).locator('[data-slot="settlement-pool"][data-pool="p1"] [data-slot="settlement-acc-row"][data-acc="kbG"]');
      const profitCell = kbG.locator(':scope > span').nth(3);
      await expect(profitCell).toHaveText('+10억 6,500만');
      await expectNotClipped(profitCell, '계좌 표 KB 정근형 수익 칸');
      const cellBox = await profitCell.boundingBox();
      const cardBox = await pools(page).boundingBox();
      expect(cellBox).not.toBeNull();
      expect(cardBox).not.toBeNull();
      expect(cellBox!.x + cellBox!.width, '계좌 표 수익 칸이 카드 오른쪽 밖으로 밀림').toBeLessThanOrEqual(
        cardBox!.x + cardBox!.width + 0.5,
      );

      // ④ 「김현중 → 정근형 5,950만원이면 맞음」.
      const zero = nameVs(page).locator('[data-slot="settlement-name-zero-amt"]');
      await expect(zero).toHaveText('김현중 → 정근형 5,950만원이면 맞음');
      await expectNotClipped(zero, '「…원이면 맞음」');

      // ① 머리 두 버튼.
      await expect(ledgerHead(page)).toHaveText('거래 기록');
      await expect(settleHead(page)).toHaveText('정산하기');
      await expectNotClipped(ledgerHead(page), '머리 「거래 기록」');
      await expectNotClipped(settleHead(page), '머리 「정산하기」');
      const a = await ledgerHead(page).boundingBox();
      const b = await settleHead(page).boundingBox();
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(b!.x + b!.width, '「정산하기」 가 뷰포트 오른쪽 밖').toBeLessThanOrEqual(vp.width);
      if (vp.width === 360) {
        // 두 버튼이 겹치지 않는다(같은 줄이면 왼쪽 버튼 끝 ≤ 오른쪽 버튼 시작 · 다른 줄이면 세로로 떨어져 있다).
        const sameRow = Math.abs(a!.y - b!.y) < Math.min(a!.height, b!.height);
        if (sameRow) expect(a!.x + a!.width, '머리 두 버튼 겹침').toBeLessThanOrEqual(b!.x);
        else expect(a!.y + a!.height <= b!.y || b!.y + b!.height <= a!.y, '머리 두 버튼 겹침').toBe(true);
      }
    });
  }

  test('P44-F1 1440 — 「정산하기」 → 김현중 「바로 출금」 → 「정산 확정」: 요청 바디 · 시트 닫힘 · 「정산 기록」 새 줄 펼침', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const api = await mockSettlementApi(page);
    await open(page);
    const getsBefore = api.requests.filter((r) => r.method === 'GET').length;

    const sheet = await openSheet(page, settleHead(page), '정산하기');
    // 열 때 다시 읽기(D-16) — GET 한 번 더.
    await expect.poll(() => api.requests.filter((r) => r.method === 'GET').length).toBeGreaterThan(getsBefore);
    await expect(sheet.locator('[data-slot="settle-profit-value"]')).toHaveText('+10억 4,900만');

    const out = sheet.locator('[data-slot="settle-split-row"][data-person="H"] [data-slot="settle-out"]');
    await expect(out).toHaveAttribute('aria-pressed', 'false');
    await out.click();
    await expect(out).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.locator('[data-slot="settle-out-accounts"]')).toContainText('뺄 계좌 — 김현중 교보 김현중');

    await sheet.locator('[data-slot="settle-sheet-confirm"]').click();
    const settles = () => api.requests.filter((r) => r.method === 'POST' && new URL(r.url).pathname.endsWith('/api/admin/settlement/settles'));
    await expect.poll(() => settles().length).toBe(1);
    // 브라우저가 계산한 수익 · 몫은 보내지 않는다(D-16) — 바디는 이 다섯 칸뿐.
    expect(settles()[0]!.body).toEqual({ pool: 'p1', outs: ['H'], memo: '', reflect: true, expectPrev: null });

    // 시트 닫힘 · 「정산 기록」 · 새 정산 줄(id 1) 펼침 · 「확정한 순간의 계좌」 · 「그날 출금」.
    await expect(sheetOf(page)).toHaveCount(0);
    await expect(segment(page, '정산 기록')).toHaveAttribute('aria-checked', 'true');
    const item = activity(page).locator('[data-slot="settlement-settle-item"][data-id="1"]');
    await expect(item.locator('[data-slot="settlement-settle-row"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(item.getByText('확정한 순간의 계좌', { exact: true })).toBeVisible();
    await expect(item.getByText('그날 출금', { exact: true })).toBeVisible();
  });

  test('P44-F2 390 — 「거래 기록」 → 출자 · 김현중 · KB 김현중 · 1만원 → 「저장」: 요청 바디 · 시트 닫힘', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // 시트의 「오늘」 = 응답 now 와 브라우저 시계 중 늦은 날짜(WR-01) — 브라우저 시계를 응답 now 에 고정한다(타이머는 진짜).
    await page.clock.setFixedTime(new Date(SETTLEMENT_NOW));
    const api = await mockSettlementApi(page);
    await open(page);

    const sheet = await openSheet(page, ledgerHead(page), '거래 기록');
    // 칸 순서(D-27) — 무슨 거래 → 넣은 사람 → 받은 계좌 → 금액 → 날짜.
    await pill(sheet, '무슨 거래', '출자').click();
    await expect(pill(sheet, '무슨 거래', '출자')).toHaveAttribute('aria-checked', 'true');
    await pill(sheet, '넣은 사람', '김현중').click();
    await pill(sheet, '받은 계좌', 'KB 김현중').click();
    await expect(pill(sheet, '넣은 사람', '김현중')).toHaveAttribute('aria-checked', 'true');
    await expect(pill(sheet, '받은 계좌', 'KB 김현중')).toHaveAttribute('aria-checked', 'true');
    await sheet.locator('[data-slot="ledger-amount"]').fill('1');
    await expect(sheet.locator('[data-slot="ledger-amount"]')).toHaveValue('1');
    // 날짜 기본 = 시트를 연 순간의 KST 오늘(응답 now 와 같은 날로 고정).
    await expect(sheet.locator('[data-slot="ledger-date"]')).toHaveValue('2026-11-20');

    await sheet.locator('[data-slot="ledger-save"]').click();
    const posts = () => api.requests.filter((r) => r.method === 'POST' && new URL(r.url).pathname.endsWith('/api/admin/settlement/ledger'));
    await expect.poll(() => posts().length).toBe(1);
    // 만원 1 → amountKrw 10000(원) · 오늘 날짜라 예수금 반영 스위치 기본 켜짐(D-10 · D-11).
    expect(posts()[0]!.body).toMatchObject({
      txDate: '2026-11-20',
      kind: 'contribute',
      who: 'H',
      toAcc: 'kbH',
      amountKrw: 10000,
      reflect: true,
    });
    await expect(sheetOf(page)).toHaveCount(0);
  });

  test('P44-F3 출자 + 받은 계좌 「KB 정근형」 → 「심쥬니」 알약 aria-disabled(D-29)', async ({ page }) => {
    await mockSettlementApi(page);
    await open(page);

    const sheet = await openSheet(page, ledgerHead(page), '거래 기록');
    await pill(sheet, '무슨 거래', '출자').click();
    await pill(sheet, '받은 계좌', 'KB 정근형').click();
    await expect(pill(sheet, '받은 계좌', 'KB 정근형')).toHaveAttribute('aria-checked', 'true');
    // 현중 · 근형 묶음 계좌 — 그 묶음 비율에 없는 심쥬니는 막힌다 · 두 사람은 열려 있다.
    await expect(pill(sheet, '넣은 사람', '심쥬니')).toHaveAttribute('aria-disabled', 'true');
    await expect(pill(sheet, '넣은 사람', '김현중')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(pill(sheet, '넣은 사람', '정근형')).not.toHaveAttribute('aria-disabled', 'true');
  });
});
