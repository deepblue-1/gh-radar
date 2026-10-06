import { test, expect, type Locator, type Page } from '@playwright/test';

import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';
import { E2E_ACCOUNT_NO, E2E_ISIN, withLocalRelay, type LocalRelay } from '../fixtures/relay';
import { leavesOverflowing, scrollOverflowing } from '../overflow';
import type { FakeUnfilled } from '../../../relay/tests/helpers/frames.js';

/**
 * Phase 25-09 — 미체결 잔량진행률 **B안 보조행 · 모바일 r3** 실브라우저 증거 (P25-P1 ~ P25-P6).
 *
 * ① 무엇을 증명하는가
 *   가짜 게이트웨이가 83 `QueueProgress` 를 밀면 **진짜 relay**(파서 → hub 계좌 필터 → `unf.progress`) →
 *   브라우저 스토어 → `findQueueProgress` · `progressView` → `UnfilledProgress` 까지 실제 코드로 흘러,
 *   미체결 3표면(마이페이지 기본 표 · 작업대 공용 패널 임베드 · 카드 탭 임베드)과 마이페이지 모바일
 *   카드 r3 에 값 · 색 · 사라짐(D-11~D-13) 규칙대로 서는지 본다. RTL 은 컨텍스트를 스텁으로 갈아끼워
 *   구조만 본다 — 83 → 화면의 조인 문자열 · 계산 색 · 실제 폭 넘침은 여기서만 보인다.
 *
 * ② 백스톱 E8 overflow (UI-SPEC UI Considerations) — P25-P6 이 책임진다
 *   카드 탭 임베드(stockScope · colSpan 5)의 최악 폭(뷰포트 344 · 폰 밴드)에서 보조행이 표 가로
 *   스크롤(`account-embed-scroll`) 안에 들고, 종류명 · % 가 잘리지 않는지 실측한다.
 *
 * ③ relay spec 규약 4줄(픽스처 `fixtures/relay.ts` ⑥ 정본) — serial · beforeAll 1회 · afterAll stop ·
 *   beforeEach reset. 실서버 주소 · 실계좌 리터럴 없음(게이트웨이는 127.0.0.1 스텁 · 계좌는 테스트 값).
 */

test.describe.configure({ mode: 'serial' });

/** 진행률이 붙는 미체결 — 후매수 300주(기획서 하루 흐름 12453). */
const ORDER_WAIT = '12453';
/** 진행률이 없는 미체결 — 대기 여부를 추정하지 않는다(D-11). */
const ORDER_PLAIN = '12452';

const UNF_WAIT: FakeUnfilled = {
  orderNo: ORDER_WAIT,
  isin: E2E_ISIN,
  side: 'B',
  price: 98_000,
  orderQty: 300,
  filledQty: 0,
  unfilledQty: 300,
  exchange: 'KRX',
};
const UNF_PLAIN: FakeUnfilled = { ...UNF_WAIT, orderNo: ORDER_PLAIN, price: 97_900, orderQty: 100, unfilledQty: 100 };

/** 진행률 항목 1건 — 기본은 88%(bp 8800) · 12,000주 · 후매수(group 3). */
function progressItem(over: Partial<{ remainingVolume: number; progressBp: number }> = {}) {
  return {
    accountNo: E2E_ACCOUNT_NO,
    orderNo: ORDER_WAIT,
    group: 3,
    expectedCum: 1_100_000,
    currentCum: 1_088_000,
    remainingVolume: 12_000,
    progressBp: 8800,
    ...over,
  };
}

const PHONE_VIEWPORT = { width: 390, height: 844 } as const;
const DESKTOP_VIEWPORT = { width: 1280, height: 900 } as const;
const WIDE_VIEWPORT = { width: 1440, height: 1000 } as const;
/** 카드 탭 최악 폭 — 뷰포트 344(폰 밴드 · §2.2b 최소 본문). */
const WORST_VIEWPORT = { width: 344, height: 844 } as const;

// ---------------------------------------------------------------------------
// 조회구
// ---------------------------------------------------------------------------

const accountCard = (page: Page) =>
  page.locator(`[data-slot="me-account-card"][data-account-no="${E2E_ACCOUNT_NO}"]`);
/** 마이페이지 기본 표(≥1280) — 미체결 섹션의 표 트리만. */
const meTable = (page: Page) => accountCard(page).locator('[data-testid="account-unfilled"] [data-slot="table"]');
const progressRows = (scope: Locator) => scope.locator('tr[data-slot="unfilled-progress-row"]');
const unfilledTableRow = (scope: Locator, orderNo: string) =>
  scope.locator('tr').filter({ has: scope.page().getByRole('button', { name: `주문번호 ${orderNo} 취소` }) });
const sharedPanels = (page: Page) => page.getByTestId('shared-panels');
const statusBar = (page: Page) => page.locator('[data-slot="workbench-status-bar"]');
const cardOf = (page: Page) => page.locator(`[data-slot="strategy-card"][data-key^="${E2E_ISIN}:"]`);

/** 요소의 계산 배경색과 **같은 문서에서** 토큰을 칠한 임시 요소의 계산 배경색. */
async function fillMatchesToken(fill: Locator, token: string): Promise<{ actual: string; expected: string }> {
  return fill.evaluate((el, t) => {
    const probe = document.createElement('div');
    probe.style.background = `var(${t})`;
    el.parentElement!.appendChild(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { actual: getComputedStyle(el).backgroundColor, expected };
  }, token);
}

test.describe('Phase 25-09 — 미체결 진행률 B안 (로컬 relay · 가짜 게이트웨이 83)', () => {
  let relay: LocalRelay;

  test.beforeAll(async () => {
    relay = await withLocalRelay();
  });

  test.afterAll(async () => {
    // 남기면 Playwright 가 종료하지 못하고 매달린다 (T-15-46).
    await relay.stop();
  });

  test.beforeEach(async ({ page }) => {
    relay.reset();
    relay.seedDmaCredential();
    await mockStockApi(page, { searchResults: [FIXTURE_SAMSUNG] });
    await mockHomeApi(page, { response: HOME_POPULATED });
    // 오늘 주문 복원 — 이 spec 은 미체결만 본다(빈 목록).
    await page.route('**/api/orders', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
  });

  /** 마이페이지 진입 → 계좌 카드 → 미체결 2건 · 진행률 1건 주입. */
  async function openMe(page: Page, viewport: { width: number; height: number }, unfilled: FakeUnfilled[] = [UNF_WAIT, UNF_PLAIN]) {
    await page.setViewportSize(viewport);
    await page.goto('/me?tab=accounts');
    await expect(accountCard(page)).toHaveCount(1, { timeout: 30_000 });
    await relay.pushAccountState({ unfilled });
    await relay.pushQueueProgress({ isin: E2E_ISIN, exchange: 'KRX', items: [progressItem()] });
  }

  test('P25-P1 /me 1280 — 보조행 「후매수 · 12,000주」 · 88% · progressbar 속성 4종 · 채움 계산 색 --primary', async ({
    page,
  }) => {
    await openMe(page, DESKTOP_VIEWPORT);
    const table = meTable(page);
    const rows = progressRows(table);
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    const sub = rows.first();
    await expect(sub.locator('td')).toHaveAttribute('colspan', '7');

    // 자리 — 12453 미체결 행 **바로 뒤** · 12452 뒤에는 없다(D-11).
    const next = await unfilledTableRow(table, ORDER_WAIT).evaluate(
      (tr) => tr.nextElementSibling?.getAttribute('data-slot') ?? null,
    );
    expect(next).toBe('unfilled-progress-row');
    const nextPlain = await unfilledTableRow(table, ORDER_PLAIN).evaluate(
      (tr) => tr.nextElementSibling?.getAttribute('data-slot') ?? null,
    );
    expect(nextPlain).not.toBe('unfilled-progress-row');

    const line = sub.locator('[data-slot="unfilled-progress"]');
    await expect(line).toHaveAttribute('data-variant', 'row');
    await expect(line).toContainText('후매수·12,000주');
    await expect(line).toContainText('88%');
    await expect(line).not.toHaveAttribute('data-near', 'true');

    const bar = sub.getByRole('progressbar', { name: '체결예상까지 진행률' });
    await expect(bar).toHaveAttribute('aria-valuenow', '88');
    await expect(bar).toHaveAttribute('aria-valuemin', '0');
    await expect(bar).toHaveAttribute('aria-valuemax', '100');
    await expect(bar).toHaveAttribute('aria-valuetext', '후매수 · 12,000주, 88%');
    expect((await bar.boundingBox())!.width).toBeCloseTo(140, 0);

    const fill = sub.locator('[data-slot="unfilled-progress-fill"]');
    const color = await fillMatchesToken(fill, '--primary');
    expect(color.actual).toBe(color.expected);

    // 셀 기하 — 높이 auto · 위 0 · 아래 8px(층 없는 `.tbl-wrap tbody td` 를 이겼다) · 한 줄.
    const cell = await sub.locator('td').evaluate((td) => {
      const cs = getComputedStyle(td);
      return { pt: cs.paddingTop, pb: cs.paddingBottom, h: td.getBoundingClientRect().height, ws: cs.whiteSpace };
    });
    expect(cell.pt).toBe('0px');
    expect(cell.pb).toBe('8px');
    expect(cell.h).toBeLessThan(36);
    expect(cell.ws).toBe('nowrap');
  });

  test('P25-P2 bp 9000 → data-near true · 채움 --up / remaining −5 · bp 10050 → 「후매수 · 0주」 100% (D-12)', async ({ page }) => {
    await openMe(page, DESKTOP_VIEWPORT);
    const sub = progressRows(meTable(page)).first();
    await expect(sub).toBeVisible({ timeout: 15_000 });

    await relay.pushQueueProgress({ isin: E2E_ISIN, exchange: 'KRX', items: [progressItem({ progressBp: 9000, remainingVolume: 3_000 })] });
    const line = sub.locator('[data-slot="unfilled-progress"]');
    await expect(line).toHaveAttribute('data-near', 'true');
    await expect(line).toContainText('90%');
    const up = await fillMatchesToken(sub.locator('[data-slot="unfilled-progress-fill"]'), '--up');
    expect(up.actual).toBe(up.expected);

    await relay.pushQueueProgress({ isin: E2E_ISIN, exchange: 'KRX', items: [progressItem({ progressBp: 10_050, remainingVolume: -5 })] });
    await expect(line).toContainText('후매수·0주');
    await expect(line).toContainText('100%');
    await expect(sub.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    await expect(line).toHaveAttribute('data-near', 'true');
  });

  test('P25-P3 items [] → 보조행만 사라지고 미체결 행 유지 / 미체결에서 12453 제거 → 둘 다 없음 (D-13)', async ({ page }) => {
    await openMe(page, DESKTOP_VIEWPORT);
    const table = meTable(page);
    await expect(progressRows(table)).toHaveCount(1, { timeout: 15_000 });

    await relay.pushQueueProgress({ isin: E2E_ISIN, exchange: 'KRX', items: [] });
    await expect(progressRows(table)).toHaveCount(0);
    await expect(unfilledTableRow(table, ORDER_WAIT)).toHaveCount(1);

    // 진행률을 되살린 뒤 미체결 행 자체를 뺀다(빠진 스냅샷 드롭 대비 — 조인 대상이 없으면 함께 없다).
    await relay.pushQueueProgress({ isin: E2E_ISIN, exchange: 'KRX', items: [progressItem()] });
    await expect(progressRows(table)).toHaveCount(1);
    await relay.pushAccountState({ unfilled: [UNF_PLAIN] });
    await expect(unfilledTableRow(table, ORDER_WAIT)).toHaveCount(0);
    await expect(progressRows(table)).toHaveCount(0);
    await expect(accountCard(page).locator('[data-slot="unfilled-progress"]')).toHaveCount(0);
  });

  test('P25-P4 /me 390 — r3 unfilled-progress 가 account-unfilled-note 보다 DOM 앞 · 막대만 신축(다른 조각 잘림 0)', async ({
    page,
  }) => {
    await openMe(page, PHONE_VIEWPORT, [
      { ...UNF_WAIT, pendingStatus: '증권사 보관 · 09:00 처리' },
      { ...UNF_PLAIN, pendingStatus: '증권사 보관 · 09:00 처리' },
    ]);
    const cards = accountCard(page).locator('[data-slot="account-unfilled-row"]');
    await expect(cards).toHaveCount(2, { timeout: 15_000 });
    const card = cards.filter({ has: page.getByRole('button', { name: `주문번호 ${ORDER_WAIT} 취소` }) });
    const r3 = card.locator('[data-slot="unfilled-progress"]');
    await expect(r3).toBeVisible({ timeout: 15_000 });
    await expect(r3).toHaveAttribute('data-variant', 'compact');
    await expect(r3).toHaveText('후매수·12,000주88%');

    const order = await card.evaluate((el) => {
      const p = el.querySelector('[data-slot="unfilled-progress"]')!;
      const note = el.querySelector('[data-slot="account-unfilled-note"]')!;
      const r2 = el.querySelector('[data-slot="account-unfilled-r2"]')!;
      return {
        progressBeforeNote: Boolean(p.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING),
        r2Next: r2.nextElementSibling?.getAttribute('data-slot') ?? null,
      };
    });
    expect(order).toEqual({ progressBeforeNote: true, r2Next: 'unfilled-progress' });

    // 진행률 없는 카드는 StatusNotes 가 r3 자리 그대로.
    const plain = cards.filter({ has: page.getByRole('button', { name: `주문번호 ${ORDER_PLAIN} 취소` }) });
    await expect(plain.locator('[data-slot="unfilled-progress"]')).toHaveCount(0);

    // 막대만 신축 — 조각 셋은 자기 상자 안(scrollWidth ≤ clientWidth) · 카드 밖으로 밀린 잎 0.
    const pieces = await r3.evaluate((el) =>
      Array.from(el.children).map((c) => ({
        slot: c.getAttribute('data-slot') ?? c.textContent ?? '',
        over: (c as HTMLElement).scrollWidth - (c as HTMLElement).clientWidth,
        width: c.getBoundingClientRect().width,
      })),
    );
    for (const p of pieces) expect(p.over, `${p.slot} 조각이 잘렸다`).toBeLessThanOrEqual(1);
    const bar = pieces.find((p) => p.slot === 'unfilled-progress-bar')!;
    expect(bar.width).toBeGreaterThan(40);
    const cardBox = (await card.boundingBox())!;
    expect(await leavesOverflowing(r3, cardBox.x + cardBox.width)).toEqual([]);
  });

  test('P25-P5 /trading 공용 패널 미체결 임베드 — 보조행 colSpan 7 · 미체결 행 바로 뒤', async ({ page }) => {
    await page.setViewportSize(WIDE_VIEWPORT);
    await page.goto('/trading');
    await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    await relay.pushAccountState({ unfilled: [UNF_WAIT, UNF_PLAIN] });
    await relay.pushQueueProgress({ isin: E2E_ISIN, exchange: 'KRX', items: [progressItem()] });

    const tab = sharedPanels(page).getByRole('tab', { name: /미체결/ });
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
    const rows = progressRows(sharedPanels(page));
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    await expect(rows.first().locator('td')).toHaveAttribute('colspan', '7');
    const prev = await rows.first().evaluate((tr) => ({
      slot: tr.previousElementSibling?.getAttribute('data-slot') ?? null,
      text: tr.previousElementSibling?.textContent ?? '',
    }));
    expect(prev.slot).toBe('account-embed-unfilled-row');
    expect(prev.text).toContain(ORDER_WAIT);
    await expect(rows.first().locator('[data-slot="unfilled-progress"]')).toContainText(
      '후매수·12,000주',
    );
  });

  test('P25-P6 카드 탭 미체결(stockScope) — colSpan 5 · 최악 폭(뷰포트 344)에서 보조행이 가로 스크롤 안 · 종류명 · % 잘림 0 (백스톱 E8 overflow)', async ({
    page,
  }) => {
    await page.setViewportSize(WORST_VIEWPORT);
    await page.goto('/trading?code=005930');
    await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    const card = cardOf(page);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await relay.pushAccountState({ unfilled: [UNF_WAIT, UNF_PLAIN] });
    await relay.pushQueueProgress({ isin: E2E_ISIN, exchange: 'KRX', items: [progressItem()] });

    const tabs = card.locator('[data-slot="card-tabs"]');
    await tabs.getByRole('tab', { name: /미체결/ }).click();
    const rows = progressRows(tabs);
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    const sub = rows.first();
    await expect(sub.locator('td')).toHaveAttribute('colspan', '5');

    const m = await sub.evaluate((tr) => {
      const embedScroll = tr.closest<HTMLElement>('[data-slot="account-embed-scroll"]');
      /*
        실제로 가로 스크롤하는 상자는 `account-embed-scroll` 안쪽의 표 래퍼(`Table` 의 `.tbl-wrap` ·
        `overflow-x:auto`)다 — 바깥 래퍼는 안쪽 상자 폭만큼만 넓다. 그래서 **가장 가까운 가로 스크롤
        조상**의 콘텐츠 좌표로 잰다(바깥 `account-embed-scroll` 안에 있다는 것은 따로 본다).
      */
      let scroller: HTMLElement | null = tr.parentElement;
      while (scroller !== null && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX)) {
        scroller = scroller.parentElement;
      }
      const kind = tr.querySelector<HTMLElement>('[data-slot="unfilled-progress-kind"]')!;
      const line = tr.querySelector<HTMLElement>('[data-slot="unfilled-progress"]')!;
      const pct = line.lastElementChild as HTMLElement;
      if (embedScroll === null || scroller === null || !embedScroll.contains(scroller)) return null;
      const s = scroller.getBoundingClientRect();
      // 스크롤 콘텐츠 좌표(스크롤 위치와 무관) — 왼쪽 0 · 오른쪽 scrollWidth 안에 들어야 한다.
      const inContent = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return { left: r.left - s.left + scroller.scrollLeft, right: r.right - s.left + scroller.scrollLeft };
      };
      // 끝까지 스크롤하면 % 가 보이는가 — 스크롤 뒤 % 오른쪽이 스크롤러 오른쪽 안이어야 한다.
      scroller.scrollLeft = scroller.scrollWidth;
      const pctVisibleAtEnd =
        pct.getBoundingClientRect().right <= scroller.getBoundingClientRect().right + 1;
      scroller.scrollLeft = 0;
      return {
        pctVisibleAtEnd,
        scroller: scroller.getAttribute('data-slot'),
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
        kind: { ...inContent(kind), text: kind.textContent, over: kind.scrollWidth - kind.clientWidth },
        pct: { ...inContent(pct), text: pct.textContent, over: pct.scrollWidth - pct.clientWidth },
        lineWraps: line.getBoundingClientRect().height > 24,
      };
    });
    expect(m, '보조행이 account-embed-scroll 안에 있어야 한다').not.toBeNull();
    const { scrollWidth, kind, pct, lineWraps } = m!;
    expect(kind.text).toBe('후매수');
    expect(pct.text).toBe('88%');
    expect(kind.left).toBeGreaterThanOrEqual(-1);
    expect(kind.right).toBeLessThanOrEqual(scrollWidth + 1);
    expect(pct.left).toBeGreaterThanOrEqual(-1);
    expect(pct.right).toBeLessThanOrEqual(scrollWidth + 1);
    expect(kind.over).toBeLessThanOrEqual(1);
    expect(pct.over).toBeLessThanOrEqual(1);
    expect(lineWraps, '보조행은 한 줄(nowrap)이다').toBe(false);
    expect(m!.pctVisibleAtEnd, '끝까지 가로 스크롤하면 % 가 보여야 한다').toBe(true);
    // 보조행이 표 폭을 넓히지 않는다 — 넓히면 표 전체가 가로 스크롤돼 「취소」 가 화면 밖으로 밀린다.
    expect(scrollWidth, '보조행 때문에 표가 가로 스크롤되면 안 된다').toBeLessThanOrEqual(m!.clientWidth + 1);
    const cancel = tabs.getByRole('button', { name: `주문번호 ${ORDER_WAIT} 취소` });
    const cancelBox = (await cancel.boundingBox())!;
    const scrollBox = (await tabs.locator('[data-slot="table-container"]').boundingBox())!;
    expect(cancelBox.x + cancelBox.width, '「취소」 가 표 보이는 폭 안에 있어야 한다').toBeLessThanOrEqual(
      scrollBox.x + scrollBox.width + 1,
    );
    // 카드 탭 본문 — 넘침은 스크롤 영역 안에서만(판정은 overflow.ts 하나).
    expect(
      await scrollOverflowing(page, `[data-slot="strategy-card"][data-key^="${E2E_ISIN}:"] [data-slot="card-tabs-body"]`),
    ).toEqual([]);
    // 실측 기록용(SUMMARY) — 스크롤러 폭 · 콘텐츠 폭 · % 오른쪽 끝.
    test.info().annotations.push({
      type: 'E8-overflow-backstop',
      description: `viewport=344 scroller=${m!.scroller} clientWidth=${m!.clientWidth} scrollWidth=${scrollWidth} kind=[${Math.round(kind.left)},${Math.round(kind.right)}] pct=[${Math.round(pct.left)},${Math.round(pct.right)}]`,
    });
    console.log(
      `[P25-P6] viewport=344 scroller=${m!.scroller} clientWidth=${m!.clientWidth} scrollWidth=${scrollWidth} kind=[${Math.round(kind.left)},${Math.round(kind.right)}] pct=[${Math.round(pct.left)},${Math.round(pct.right)}]`,
    );
  });
});
