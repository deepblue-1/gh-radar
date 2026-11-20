import { test, expect, type Locator, type Page } from '@playwright/test';

import { mockSettlementApi } from '../fixtures/settlement';

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
});
