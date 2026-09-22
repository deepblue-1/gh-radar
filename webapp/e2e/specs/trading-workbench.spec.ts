import { test, expect, type Locator, type Page } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';
import {
  DMA_MSG,
  E2E_ACCOUNT_NO,
  E2E_ISIN,
  E2E_LONG_NAME_ISIN,
  withLocalRelay,
  type LocalRelay,
} from '../fixtures/relay';
import { leavesOverflowing, scrollOverflowing } from '../overflow';

/**
 * Phase 18 Plan 13 — `/trading` 단일 작업대 E2E (TRADE-06 · TRADE-09 · D-29).
 *
 * ① 무엇을 증명하는가
 *   이 phase 의 가장 큰 구조적 주장 — 「§2.2b 4밴드의 측정 대상을 **페이지 본문에서 카드로**
 *   옮겼다」 — 은 실브라우저의 실제 폭으로만 증명된다(jsdom 은 컨테이너 쿼리를 평가하지 않는다).
 *   그래서 여기서 카드 컨테이너 폭을 경계 양옆으로 **정확히** 맞추고, CSS 가 실제로 고른 밴드
 *   (카드 본문 호가 칸의 계산 폭)와 폭에서 기대한 밴드가 같은지, 그 폭에서 잘림이 0 인지 본다.
 *   밴드 표와 경계 셋(700 · 830 · 992)의 정본은 `webapp/src/styles/globals.css` §2.2b 다.
 *
 * ② UI-SPEC backstop 5행이 이 파일의 책임이다 (케이스 제목의 근거 ID 로 표시)
 *   E1 overflow(상태줄 wrap·잘림 0) · E6 overflow(카드 4밴드 × 단 수 잘림 0) ·
 *   E6 zero-one-many(펼침/접힘 조합 스택) · E13 overflow(폰 공용 패널) · E15 overflow(더티 바 겹침 0).
 *   여섯째 backstop(E3 error — VI 확인 체크 거부/타임아웃 실기 왕복)은 UAT 몫이다(18-13 SUMMARY).
 *
 * ③ 잘림 판정은 `e2e/overflow.ts` **하나**다 — 새 판정식을 쓰지 않는다(판정이 둘이면 한쪽만 고쳐진다).
 *
 * ④ 왜 serial + 단일 relay 인가
 *   relay wss 는 8090 **고정**이다. 포트·주소의 정본은 `playwright.config.ts`(webServer ·
 *   `NEXT_PUBLIC_RELAY_WS_URL`)와 `fixtures/relay.ts` 이고 이 파일은 포트를 적지 않는다.
 *   파일 **간** 충돌은 config 의 단일 워커가 막는다.
 *
 * ⑤ ★ 실서버에 붙지 않는다 (D-27 / T-15-28)
 *   게이트웨이는 픽스처가 `127.0.0.1` 임의 포트에 띄운 스텁이다. 사내망 주소·실계좌 리터럴 없음.
 */

test.describe.configure({ mode: 'serial' });

const WORKBENCH_URL = '/trading';
const STRATEGY_KEY = `${E2E_ISIN}:${E2E_ACCOUNT_NO}:KRX`;
const FOCUS_URL = `${WORKBENCH_URL}?focus=${encodeURIComponent(STRATEGY_KEY)}`;

const PHONE_VIEWPORT = { width: 390, height: 844 } as const;
const WIDE_VIEWPORT = { width: 1440, height: 1000 } as const;

/** §2.2b 경계 — 정본은 globals.css §2.2b. 여기서는 「폭 → 기대 밴드」 판정에만 쓴다. */
type Band = 'phone' | 'compact' | 'wide' | 'desktop';
function bandOfWidth(width: number): Band {
  if (width < 700) return 'phone';
  if (width < 830) return 'compact';
  if (width < 992) return 'wide';
  return 'desktop';
}

// ---------------------------------------------------------------------------
// 조회구
// ---------------------------------------------------------------------------

const statusBar = (page: Page) => page.locator('[data-slot="workbench-status-bar"]');
const grid = (page: Page) => page.locator('[data-slot="card-grid"]');
const cards = (page: Page) => page.locator('[data-slot="strategy-card"]');
const cardSelector = (isin: string) => `[data-slot="strategy-card"][data-key^="${isin}:"]`;
const cardOf = (page: Page, isin: string) => page.locator(cardSelector(isin));
const colsSegment = (page: Page) => page.locator('[data-slot="workbench-cols-segment"]');
const dirtyBar = (page: Page) => page.locator('[data-slot="dirty-action-bar"]');
const sharedPanels = (page: Page) => page.getByTestId('shared-panels');
const field = (page: Page, id: string): Locator => page.locator(`#${id}`);

async function waitForReady(page: Page): Promise<void> {
  await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
}

/** 등록 전략 카드를 `?focus=` 로 펼치고 시세(상한가 시딩)가 들어올 때까지 기다린다. */
async function openFocusedCard(page: Page): Promise<void> {
  await page.goto(FOCUS_URL);
  await waitForReady(page);
  await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
  await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000', { timeout: 15_000 });
}

/**
 * 카드의 **컨테이너 폭**과 CSS 가 실제로 고른 밴드.
 *
 * 컨테이너 쿼리가 재는 것은 카드(`@container/lc`) 요소의 content-box 폭 = `clientWidth` 다
 * (테두리 제외 · 패딩 없음). 밴드는 카드 본문 그리드의 **첫 칸(호가) 계산 폭**으로 판정한다 —
 * 폰 42% · 컴팩트 260 · 와이드 400 · 데스크톱 460(`card-body.tsx`). 클래스 문자열이 아니라
 * 계산된 값이라 CSS 가 안 먹으면 여기서 드러난다.
 */
async function cardMetrics(page: Page, isin: string): Promise<{ width: number; band: Band | string }> {
  return page.evaluate((sel) => {
    const card = document.querySelector<HTMLElement>(sel);
    const body = card?.querySelector<HTMLElement>('[data-slot="card-body"]');
    if (card == null || body == null) return { width: -1, band: '<카드/본문 없음>' };
    const first = parseFloat(getComputedStyle(body).gridTemplateColumns.split(' ')[0]);
    const near = (a: number, b: number) => Math.abs(a - b) < 1;
    const band = near(first, 260)
      ? 'compact'
      : near(first, 400)
        ? 'wide'
        : near(first, 460)
          ? 'desktop'
          : Math.abs(first - body.clientWidth * 0.42) < 2
            ? 'phone'
            : `<알 수 없는 첫 칸 ${first}px / 본문 ${body.clientWidth}px>`;
    return { width: card.clientWidth, band };
  }, cardSelector(isin));
}

/**
 * 카드 컨테이너 폭을 **정확히** `target` 으로 맞춘다 — 1단 격자에서 뷰포트를 조정한다.
 *
 * ★ 뷰포트 → 카드 폭 공식을 추정하지 않는다. 사이드바(≥1024) · 여백 램프(8/16/24) · 스크롤바가
 *   환경마다 몇 px 씩 다르게 먹는다. 재고, 모자란 만큼 뷰포트를 옮기고, 다시 잰다 — 그리고
 *   **맞췄다는 사실 자체를 단언**한다. 계산만 믿으면 엉뚱한 밴드를 재고도 초록이 된다.
 */
async function sizeCardTo(page: Page, isin: string, target: number): Promise<void> {
  let viewport = target + 34;
  for (let i = 0; i < 6; i += 1) {
    await page.setViewportSize({ width: viewport, height: 1000 });
    await expect(cardOf(page, isin).locator('[data-slot="card-body"]')).toBeVisible();
    const { width } = await cardMetrics(page, isin);
    if (width === target) return;
    viewport += target - width;
  }
  const { width } = await cardMetrics(page, isin);
  expect(width, `카드 폭을 ${target} 으로 맞추지 못했다(현재 ${width}, 뷰포트 ${viewport})`).toBe(
    target,
  );
}

/** 카드 1장의 잘림 0 — 두 판정을 **나란히**(overflow.ts 주석). */
async function expectCardNotClipped(page: Page, isin: string, label: string): Promise<void> {
  const scrolled = await scrollOverflowing(page, cardSelector(isin));
  expect(scrolled, `${label} — 내용이 상자를 넘친 요소`).toEqual([]);
  const box = await cardOf(page, isin).boundingBox();
  expect(box, `${label} — 카드를 잴 수 없다`).not.toBeNull();
  const pushed = await leavesOverflowing(cardOf(page, isin), box!.x + box!.width);
  expect(pushed, `${label} — 카드 밖으로 밀린 잎 요소`).toEqual([]);
}

/** 단 수를 고른다(와이드 뷰포트에서만 세그먼트가 있다). */
async function pickCols(page: Page, cols: 1 | 2 | 3): Promise<void> {
  await colsSegment(page).getByRole('radio', { name: `${cols}단` }).click();
  await expect(grid(page)).toHaveAttribute('data-cols', String(cols));
}

/** 격자의 **실제** 열 수 — 계산된 `grid-template-columns` 토큰 수. */
async function gridColumnCount(page: Page): Promise<number> {
  return grid(page).evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter((t) => t !== '').length,
  );
}

/** 돌파 스냅샷(78)을 지금 밀어 넣는다. 게이트웨이 연결을 기다린다. */
async function pushBreakout(relay: LocalRelay, isin: string): Promise<void> {
  const sock = await relay.gateway.waitForConnection(15_000);
  relay.gateway.sendRateCrossSnapshot(sock, [
    {
      isin,
      exchange: 'KRX',
      lastPrice: 118_000n,
      changeRate: 20.41,
      thresholdPct: 20,
      basePrice: 98_000n,
    },
  ]);
}

// ===========================================================================

test.describe('Phase 18 Plan 13 — /trading 작업대 (로컬 relay + 스텁 게이트웨이)', () => {
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
    await page.setViewportSize(WIDE_VIEWPORT);
    await mockStockApi(page, { searchResults: [FIXTURE_SAMSUNG] });
  });

  test('1. 옛 경로 4개가 실제 네비게이션으로 /trading(전략 키는 ?focus=)에 닿는다 (D-02)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);

    for (const old of ['/trading/limit-chaser', '/trading/limit-chaser/new', '/trading/vi']) {
      await page.goto(old);
      await expect(page, `${old} → /trading`).toHaveURL(/\/trading$/);
    }

    // 동적 세그먼트 → 쿼리. 서버가 decode → encode 왕복하므로 `:` 는 `%3A` 로 온다.
    await page.goto(`/trading/limit-chaser/${encodeURIComponent(STRATEGY_KEY)}`);
    await expect(page).toHaveURL(
      (url) => url.pathname === '/trading' && url.searchParams.get('focus') === STRATEGY_KEY,
    );
    expect(page.url()).toContain(`focus=${encodeURIComponent(STRATEGY_KEY)}`);
    await waitForReady(page);
    // 그 키의 카드가 **펼친 상태**로 선다(마운트 1회 소비).
    await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-key', STRATEGY_KEY);
  });

  test('2. 단 수 세그먼트 1/2/3 — 격자 열 수가 바뀌고 새로고침 후 유지, 폰 밴드에서는 DOM 에 없다 (D-04)', async ({
    page,
  }) => {
    relay.seedLimitChasers([
      { isin: E2E_ISIN, buyEnabled: true },
      { isin: E2E_LONG_NAME_ISIN, buyEnabled: true },
    ]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(2, { timeout: 15_000 });

    for (const cols of [2, 3, 1, 3] as const) {
      await pickCols(page, cols);
      expect(await gridColumnCount(page), `${cols}단을 골랐는데 실제 열 수가 다르다`).toBe(cols);
    }

    // 새로고침해도 마지막 선택(3단)이 남는다 — 저장은 이 기기(localStorage)다.
    await page.reload();
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(grid(page)).toHaveAttribute('data-cols', '3');
    expect(await gridColumnCount(page)).toBe(3);
    await expect(colsSegment(page).getByRole('radio', { name: '3단' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // 폰 밴드 — 세그먼트가 **DOM 에서** 빠진다(접근성 트리·탭 체인에도 없다). 저장값이 3단이어도 1단.
    await page.setViewportSize(PHONE_VIEWPORT);
    await expect(colsSegment(page)).toHaveCount(0);
    await expect(page.getByRole('radio', { name: '3단' })).toHaveCount(0);
    expect(await gridColumnCount(page)).toBe(1);

    // 다시 넓히면 세그먼트와 저장값이 돌아온다.
    await page.setViewportSize(WIDE_VIEWPORT);
    await expect(colsSegment(page)).toHaveCount(1);
    expect(await gridColumnCount(page)).toBe(3);
  });

  test('3. 돌파 칩 클릭 → 카드 1장(KRX · 스위치 전부 OFF · 기본값) → 그 칩이 「거래중」, 서버 송신 0 (D-07 · TRADE-06)', async ({
    page,
  }) => {
    /*
      ★ 시세 자동 응답을 끈다 — 돌파 행은 실시간 현재가가 임계 −2%p 아래로 내려가면 지워진다
        (`shouldRemoveBreakout`). 스텁 시세(기준가 근처)를 받으면 칩이 이탈로 사라져 클릭할 수
        없다. 시세가 없으면 이탈 판정을 하지 않는다(UI-SPEC E4 error) — 그 규칙을 그대로 쓴다.
    */
    relay.setRespondingExchanges([]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(page.locator('[data-slot="card-grid-empty"]')).toBeVisible();
    await pushBreakout(relay, E2E_ISIN);

    const chip = page.locator('[data-slot="breakout-chip"]').filter({ hasText: '삼성전자' });
    await expect(chip).toHaveCount(1, { timeout: 15_000 });
    await expect(chip).not.toHaveAttribute('data-trading', 'true');
    await expect(statusBar(page).getByTestId('stat-breakout')).toContainText('1');

    const setBefore = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await chip.click();

    // 카드 1장 — 키의 거래소는 KRX, 계좌는 상태줄 계좌.
    await expect(cards(page)).toHaveCount(1);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-key', STRATEGY_KEY);
    await expect(card).toHaveAttribute('data-open', 'true');
    await expect(
      card.locator('[data-slot="card-exchange-segment"]').getByRole('radio', { name: 'KRX' }),
    ).toHaveAttribute('aria-checked', 'true');

    // 스위치 전부 OFF · WinForms 기본값(주문금액 10만원 · 감시잔량 10,000) · 더티 바 없음.
    for (const name of ['매수주문 켜기', '매도주문 켜기', '한방체결 켜기']) {
      await expect(card.getByRole('switch', { name, exact: true })).toHaveAttribute(
        'aria-checked',
        'false',
      );
    }
    await expect(field(page, 'lc-buy-order-amount')).toHaveValue('10');
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000');
    await expect(dirtyBar(page)).toHaveCount(0);

    // 그 행이 「거래중」으로 바뀐다 — 칩을 다시 눌러도 카드가 늘지 않는다.
    await expect(chip).toHaveAttribute('data-trading', 'true');
    await expect(chip.locator('[data-slot="breakout-chip-trading"]')).toHaveText('거래중');
    await expect(statusBar(page).getByTestId('stat-cards')).toContainText('1');

    // ★ 카드 추가는 서버에 아무것도 보내지 않는다 — 등록은 사용자가 스위치를 켤 때뿐이다(D-07).
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(setBefore);
  });

  test('4. 카드 컨테이너 699/700 · 829/830 · 991/992 — 밴드가 경계에서 바뀌고 각 폭에서 잘림 0 (E6 overflow · §2.2b 이관)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);

    for (const [target, expected] of [
      [699, 'phone'],
      [700, 'compact'],
      [829, 'compact'],
      [830, 'wide'],
      [991, 'wide'],
      [992, 'desktop'],
    ] as const) {
      await sizeCardTo(page, E2E_ISIN, target);
      const { width, band } = await cardMetrics(page, E2E_ISIN);
      expect(width).toBe(target);
      // 폭 → 기대 밴드(§2.2b) 와 CSS 가 실제로 고른 밴드가 같다 — 측정 대상이 카드라는 증거다.
      expect(bandOfWidth(width)).toBe(expected);
      expect(band, `카드 ${width}px — CSS 가 고른 밴드`).toBe(expected);
      await expectCardNotClipped(page, E2E_ISIN, `카드 ${width}px(${expected})`);
    }
  });

  test('5. 격자 1/2/3단 × 폰/와이드 — 카드가 정확히 어느 밴드로 가는지 + 잘림 0 (E6 overflow · D-12)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);

    /*
      2·3단 격자에서 카드 안 밀도가 폰 밴드로 떨어지는 것은 사용자가 확인한 **의도된 결과**다(D-12).
      그래서 「잘리지 않는다」만이 아니라 「정확히 이 밴드로 간다」를 함께 박제한다 — 격자 gap
      이나 여백 램프가 바뀌어 카드가 다른 밴드로 옮겨 가면 여기서 드러난다.
      (와이드 뷰포트 1440/1920 — 본문 = 뷰포트 − 사이드바 240 − 여백 48, gap 12, 카드 테두리 2)
    */
    const combos = [
      { viewport: 1440, cols: 1, expected: 'desktop' }, // 1150
      { viewport: 1440, cols: 2, expected: 'phone' }, // 568
      { viewport: 1440, cols: 3, expected: 'phone' }, // 374
      { viewport: 1920, cols: 1, expected: 'desktop' }, // 1630
      { viewport: 1920, cols: 2, expected: 'compact' }, // 808
      { viewport: 1920, cols: 3, expected: 'phone' }, // 534
    ] as const;

    for (const { viewport, cols, expected } of combos) {
      await page.setViewportSize({ width: viewport, height: 1000 });
      await pickCols(page, cols);
      expect(await gridColumnCount(page)).toBe(cols);
      const { width, band } = await cardMetrics(page, E2E_ISIN);
      const label = `뷰포트 ${viewport} × ${cols}단 → 카드 ${width}px`;
      expect(bandOfWidth(width), label).toBe(expected);
      expect(band, label).toBe(expected);
      await expectCardNotClipped(page, E2E_ISIN, label);
    }

    // 폰 뷰포트 — 저장값(3단)과 무관하게 1단이고 카드는 폰 밴드다.
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await gridColumnCount(page)).toBe(1);
      const m = await cardMetrics(page, E2E_ISIN);
      expect(m.band, `뷰포트 ${width} → 카드 ${m.width}px`).toBe('phone');
      await expectCardNotClipped(page, E2E_ISIN, `뷰포트 ${width} → 카드 ${m.width}px`);
    }
  });

  test('6. 펼침 0/1/2+ × 접힘 0/1/N — 접힌 카드는 스택 한 칸, 펼친 카드가 먼저 온다 (E6 zero-one-many · D-09)', async ({
    page,
  }) => {
    relay.seedLimitChasers([
      { isin: E2E_ISIN, buyEnabled: true },
      { isin: E2E_LONG_NAME_ISIN, buyEnabled: true },
      { isin: 'KR7086520004', buyEnabled: true },
    ]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(3, { timeout: 15_000 });
    await pickCols(page, 2);

    /** 격자의 직계 칸 순서 — `open` 은 펼친 카드 칸, `stack(n)` 은 접힌 카드 n장의 스택 칸. */
    const layout = () =>
      grid(page).evaluate((el) =>
        Array.from(el.children).map((child) => {
          const slot = child.getAttribute('data-slot');
          if (slot === 'card-stack') {
            return `stack(${child.querySelectorAll('[data-slot="strategy-card"]').length})`;
          }
          const card = child.querySelector('[data-slot="strategy-card"]');
          return card?.getAttribute('data-open') === 'true' ? 'open' : `?${slot}`;
        }),
      );
    const toggle = (isin: string) => page.locator(`#strategy-card-${isin}-toggle`);

    // 펼침 0 · 접힘 N — 스택 하나가 격자 한 칸을 차지한다.
    expect(await layout()).toEqual(['stack(3)']);

    // 펼침 1 · 접힘 2(N) — 펼친 카드가 먼저, 스택이 **같은 행의 다음 칸**이다(스택 = 한 칸).
    await toggle(E2E_LONG_NAME_ISIN).click();
    expect(await layout()).toEqual(['open', 'stack(2)']);
    const cells = grid(page).locator(':scope > *');
    const openBox = await cells.nth(0).boundingBox();
    const stackBox = await cells.nth(1).boundingBox();
    expect(openBox).not.toBeNull();
    expect(stackBox).not.toBeNull();
    expect(Math.abs(openBox!.y - stackBox!.y)).toBeLessThan(2);
    expect(stackBox!.x).toBeGreaterThan(openBox!.x + openBox!.width - 2);
    // 스택 안 카드는 헤더만 — 본문이 DOM 에 없다(D-11).
    await expect(
      grid(page).locator('[data-slot="card-stack"] [data-slot="card-body"]'),
    ).toHaveCount(0);

    // 펼침 2 · 접힘 1.
    await toggle(E2E_ISIN).click();
    expect(await layout()).toEqual(['open', 'open', 'stack(1)']);

    // 펼침 3(2+) · 접힘 0 — 스택 칸 자체가 없다.
    await toggle('KR7086520004').click();
    expect(await layout()).toEqual(['open', 'open', 'open']);
    await expect(grid(page).locator('[data-slot="card-stack"]')).toHaveCount(0);

    // 다시 하나 접으면 스택이 **맨 뒤** 칸으로 돌아온다.
    await toggle(E2E_LONG_NAME_ISIN).click();
    expect(await layout()).toEqual(['open', 'open', 'stack(1)']);
  });

  test('7. 폰 밴드 더티 바(z-40)와 하단 고정 공용 패널(z-20)의 boundingBox 가 겹치지 않는다 — 접힘·펼침·맨 아래 (E15 · E13 overflow · D-28)', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);

    /*
      ★ 먼저 패널이 **정말 화면 하단에 붙어 있는지** 본다. 겹침 0 만 보면, 패널이 화면 밖(페이지 끝
        일반 흐름)에 있어도 초록이 된다 — 18-13 이 처음 돌렸을 때 실제로 그랬다(앱 셸 `main` 이
        sticky 컨테이너라 sticky 가 한 번도 붙지 않았다 · shared-panels.tsx ⑤-b).
    */
    const viewportH = PHONE_VIEWPORT.height;
    await field(page, 'lc-buy-watch-qty').scrollIntoViewIfNeeded();
    const pinned = await sharedPanels(page).boundingBox();
    expect(pinned).not.toBeNull();
    expect(Math.abs(pinned!.y + pinned!.height - viewportH), '더티 전 — 패널 끝이 화면 하단').toBeLessThanOrEqual(1);

    await field(page, 'lc-buy-watch-qty').fill('8000');
    await expect(dirtyBar(page)).toBeVisible();
    await expect(sharedPanels(page)).toHaveAttribute('data-dirty-reserve', 'true');

    /**
     * 두 상자가 세로로 겹치지 않는다 — 패널은 바 **위**에서 멈춰야 한다(여백으로 비킴).
     * ★ z-index 로 덮는 해법이면 두 상자는 여전히 겹친다 — 그래서 겹침 자체를 잰다.
     */
    const expectNoOverlap = async (label: string) => {
      const bar = await dirtyBar(page).boundingBox();
      const panel = await sharedPanels(page).boundingBox();
      expect(bar, `${label} — 더티 바를 잴 수 없다`).not.toBeNull();
      expect(panel, `${label} — 공용 패널을 잴 수 없다`).not.toBeNull();
      const panelBottom = panel!.y + panel!.height;
      const barBottom = bar!.y + bar!.height;
      const overlap = Math.min(panelBottom, barBottom) - Math.max(panel!.y, bar!.y);
      expect(overlap, `${label} — 패널 [${panel!.y}, ${panelBottom}] ∩ 바 [${bar!.y}, ${barBottom}]`).toBeLessThanOrEqual(1);
    };

    /** 패널이 바 **바로 위**에 붙어 있다(화면 밖으로 밀려나 겹침을 피한 것이 아니다). */
    const expectPinnedAboveBar = async (label: string) => {
      const bar = await dirtyBar(page).boundingBox();
      const panel = await sharedPanels(page).boundingBox();
      expect(Math.abs(panel!.y + panel!.height - bar!.y), `${label} — 패널 끝 = 바 위`).toBeLessThanOrEqual(1);
      expect(panel!.y, `${label} — 패널이 화면 안`).toBeGreaterThanOrEqual(0);
    };

    // ① 접힘(기본) — 화면 하단 바 위에 붙어 있다.
    await field(page, 'lc-buy-watch-qty').scrollIntoViewIfNeeded();
    await expectNoOverlap('접힘');
    await expectPinnedAboveBar('접힘');

    // ② 펼침 — 본문(최대 40vh)이 올라와도 바 위에서 멈춘다.
    await sharedPanels(page).getByRole('button', { name: '펼치기 ▴' }).click();
    await expect(sharedPanels(page).getByRole('button', { name: '접기 ▾' })).toBeVisible();
    await expectNoOverlap('펼침');
    await expectPinnedAboveBar('펼침');

    // ③ 페이지 맨 아래까지 스크롤 — 흐름 안 자리(spacer) 덕에 마지막 콘텐츠도 패널 위에 온다.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expectNoOverlap('맨 아래');
    await expectPinnedAboveBar('맨 아래');
    const lastCard = await cardOf(page, E2E_ISIN).boundingBox();
    const panelAtEnd = await sharedPanels(page).boundingBox();
    expect(lastCard!.y + lastCard!.height, '맨 아래 — 카드 끝이 패널에 묻히지 않는다').toBeLessThanOrEqual(panelAtEnd!.y + 1);

    // 더티가 사라지면 예약도 사라진다(패널이 원래 자리로).
    await dirtyBar(page).getByRole('button', { name: '되돌리기' }).click();
    await expect(dirtyBar(page)).toHaveCount(0);
    await expect(sharedPanels(page)).not.toHaveAttribute('data-dirty-reserve', 'true');
  });

  test('8. 상태줄 — 폰 밴드에서 필이 2줄 이상으로 wrap 하고 어느 필도 잘리지 않는다, 와이드도 잘림 0 (E1 overflow)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);

    /** 상태줄 직계 필들이 몇 줄에 걸쳐 있는가(서로 다른 top 의 수). */
    const rowCount = () =>
      statusBar(page).evaluate((el) => {
        const tops = new Set<number>();
        for (const child of Array.from(el.children)) {
          const r = (child as HTMLElement).getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          tops.add(Math.round(r.top));
        }
        return tops.size;
      });
    const expectBarNotClipped = async (label: string) => {
      const scrolled = await scrollOverflowing(page, '[data-slot="workbench-status-bar"]');
      expect(scrolled, `${label} — 상자를 넘친 필`).toEqual([]);
      const box = await statusBar(page).boundingBox();
      expect(box).not.toBeNull();
      const pushed = await leavesOverflowing(statusBar(page), box!.x + box!.width);
      expect(pushed, `${label} — 상태줄 밖으로 밀린 필`).toEqual([]);
    };

    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(WORKBENCH_URL);
      await waitForReady(page);
      await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
      await expect(colsSegment(page)).toHaveCount(0);
      expect(await rowCount(), `뷰포트 ${width} — 상태줄이 wrap 하지 않았다`).toBeGreaterThanOrEqual(2);
      await expectBarNotClipped(`뷰포트 ${width}`);
    }

    await page.setViewportSize(WIDE_VIEWPORT);
    await expect(colsSegment(page)).toHaveCount(1);
    await expectBarNotClipped('뷰포트 1440');
  });
});
