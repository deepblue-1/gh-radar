import { test, expect, type Locator, type Page } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';
import {
  DMA_MSG,
  E2E_ACCOUNT_NO,
  E2E_ISIN,
  E2E_LONG_NAME_ISIN,
  readViConfirmRequest,
  readViSetRequest,
  withLocalRelay,
  type LocalRelay,
} from '../fixtures/relay';
import { leavesOverflowing, scrollOverflowing } from '../overflow';
import { buildSetVITriggerRespFrame } from '../../../relay/tests/helpers/frames.js';

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
 *
 * ⑥ 케이스 9 이후는 **옛 두 spec 의 이관**이다 (18-13 Task 2)
 *   `trading-limit-chaser.spec.ts`(상따) · `trading-vi.spec.ts`(VI) 는 옛 화면으로 진입했고, 18-12 부터
 *   그 경로는 리다이렉트된다. 두 파일이 잠그던 「진짜 브라우저 → 진짜 relay → 스텁 게이트웨이」 왕복
 *   단언을 작업대의 새 자리(카드 · 카드 헤더 LED · 공용 패널 로그 · VI 두 줄 · VI 발동 표)로 옮겼다.
 *   무엇을 어디로 옮겼고 무엇이 설계상 사라졌는지는 18-13 SUMMARY 의 커버리지 대조표가 정본이다.
 *   ★ 「보냈다」가 아니라 **무엇을 보냈는가**를 본다 — VI 「수정」이 `run` 을 유지하는지는 페이로드
 *     (`readViSetRequest`)로만 확인된다(스텁은 11 에 자동 응답하지 않아 화면으로는 안 보인다).
 */

test.describe.configure({ mode: 'serial' });

const WORKBENCH_URL = '/trading';
const STRATEGY_KEY = `${E2E_ISIN}:${E2E_ACCOUNT_NO}:KRX`;
const FOCUS_URL = `${WORKBENCH_URL}?focus=${encodeURIComponent(STRATEGY_KEY)}`;

const PHONE_VIEWPORT = { width: 390, height: 844 } as const;
const WIDE_VIEWPORT = { width: 1440, height: 1000 } as const;

/** 스텁 호가의 상한가 — 카드 폼 가격 5칸이 이 값으로 시딩된다(실시간 값이 정본). */
const LIVE_UPPER_LIMIT = '127,400';

/** 서버에 등록돼 있는 VI 설정(KRX) — 1,000만원 · 22%. 계좌는 로그인 응답의 계좌와 같아야 한다. */
const VI_CFG = {
  accountNo: E2E_ACCOUNT_NO,
  orderAmountKrw: 10_000_000n,
  checkRate: 22,
  priceType: 'U',
  run: false,
};

/**
 * VI 주문 6건 — 상태를 전부 다르게 둔다(같은 상태만 있으면 배지가 잘못 붙어도 모른다).
 * 마지막 행은 **접수 전**(주문번호 없음)이라 확인 자체가 불가능하다. (옛 trading-vi.spec 그대로)
 */
const VI_ORDERS = [
  { isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '0031245', state: 'Accepted', orderQty: 205, orderPrice: 48_750, triggerPrice: 41_250, basePrice: 33_510, filledQty: 0, confirmed: false, confirmLocked: false },
  { isin: E2E_LONG_NAME_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '0031102', state: 'Accepted', orderQty: 278, orderPrice: 115_700, triggerPrice: 98_400, basePrice: 80_000, filledQty: 120, confirmed: true, confirmLocked: true },
  { isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '0030987', state: 'Filled', orderQty: 76, filledQty: 76, triggerPrice: 126_000, basePrice: 100_000, confirmed: true, confirmLocked: true },
  { isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '0030900', state: 'Cancelled', triggerPrice: 92_300, basePrice: 75_000, confirmLocked: true },
  { isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '0030888', state: 'Rejected', triggerPrice: 61_000, basePrice: 50_000, confirmLocked: true },
  { isin: E2E_LONG_NAME_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '', state: 'Pending', triggerPrice: 12_345, basePrice: 10_000 },
] as const;

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
const desktopNav = (page: Page) => page.locator('aside nav[aria-label="주 메뉴"]');
const strategyItems = (page: Page) => desktopNav(page).locator('[data-strategy-key]');
const addBox = (page: Page) =>
  page.locator('[data-slot="stock-add-bar"]').getByPlaceholder('종목 추가 — 종목명 또는 코드');
const viRow = (page: Page, ex: 'KRX' | 'NXT' = 'KRX') =>
  page.locator(`[data-slot="vi-settings-row"][data-exchange="${ex}"]`);
const viTable = (page: Page) => page.locator('[data-slot="vi-trigger-table"] [data-slot="vi-order-table"]');

/** 공용 패널 「전략 로그」 탭을 열고 그 줄들을 돌려준다(작업대는 카드 로그를 여기로 합친다). */
async function logRows(page: Page): Promise<Locator> {
  const tab = sharedPanels(page).getByRole('tab', { name: '전략 로그' });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  return sharedPanels(page).locator('[data-slot="strategy-log-row"]');
}

/** 게이트웨이가 `SetLimitChaserReq(10)` 을 n건 받을 때까지 기다린다 — 에코 주입 전 경주 방지. */
async function waitForSetAtGateway(relay: LocalRelay, count: number): Promise<void> {
  await expect
    .poll(() => relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length, {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(count);
}

/** 종목 추가란에서 키보드만으로 종목을 골라 카드를 만든다(마우스 없음). */
async function addStockByKeyboard(page: Page): Promise<void> {
  await addBox(page).focus();
  await page.keyboard.type('삼성');
  await expect(page.locator('[data-slot="lc-search-option"]').first()).toBeVisible({ timeout: 15_000 });
  await addBox(page).press('Enter');
}

function viSetRequests(relay: LocalRelay) {
  return relay
    .strategyRequests()
    .map((r) => readViSetRequest(r.msgType, r.payload))
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

function viConfirmRequests(relay: LocalRelay) {
  return relay
    .strategyRequests()
    .map((r) => readViConfirmRequest(r.msgType, r.payload))
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/** 61 에코를 지금 밀어 넣는다 — 반영의 유일한 증거다. */
async function pushViEcho(relay: LocalRelay, run: boolean, over: Record<string, unknown> = {}) {
  const sock = await relay.gateway.waitForConnection(10_000);
  relay.gateway.sendFrame(sock, buildSetVITriggerRespFrame({ ...VI_CFG, ...over, run }));
}

/** VI 발동 표(「더보기」)를 연다. */
async function openViTable(page: Page): Promise<void> {
  await page.locator('[data-slot="vi-strip-more"]').click();
  await expect(page.locator('[data-slot="vi-trigger-table"]')).toBeVisible();
}

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
  // =========================================================================
  // 이관 — 옛 trading-limit-chaser.spec (상따 → 작업대 카드)
  // =========================================================================

  test('9. 종목 추가란 — 키보드만으로 종목을 고르면 카드가 서고, 가격 5칸·종목정보 상한·호가 10단이 상한가로 시딩된다 (옛 LC 2·14 · D-08)', async ({
    page,
  }) => {
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);

    await addStockByKeyboard(page);

    // 결과 — 카드가 그 종목으로 선다. 여기까지 와야 「고른 것」이다.
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-key', STRATEGY_KEY);
    await expect(card.locator('[data-slot="card-header"]')).toContainText('삼성전자');
    // 추가한 뒤 입력은 비워진다(상시 입력 — 필드는 남는다).
    await expect(addBox(page)).toHaveValue('');

    for (const id of [
      'lc-buy-watch-price',
      'lc-buy-order-price',
      'lc-sell-watch-price',
      'lc-sell-order-price',
      'lc-sweep-watch-price',
    ]) {
      await expect(field(page, id)).toHaveValue(LIVE_UPPER_LIMIT, { timeout: 15_000 });
    }
    // 폼과 종목정보 10칸이 **같은 상한가**를 말한다.
    const quoteGrid = card.locator('[data-slot="lc-quote-grid"]');
    await expect(quoteGrid.locator('> *')).toHaveCount(10);
    await expect(quoteGrid).toContainText('상한');
    await expect(quoteGrid).toContainText(LIVE_UPPER_LIMIT);
    // 호가 10단(매도 10 + 매수 10) — 데스크톱 밴드 표 트리에서 보이는 행.
    const ladder = card.locator('[data-slot="orderbook-ladder"][data-variant="chaser"]');
    await expect(ladder.locator('[data-slot="ladder-row"]:visible')).toHaveCount(20);
    await expect(ladder).toContainText('99,000');
  });

  test('10. 스위치 즉시 전송 → 게이트웨이 10 수신 → 60 에코 → 카드 LED · 공용 로그 · 사이드바 (옛 LC 3 · WR-06 · D-05)', async ({
    page,
  }) => {
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await addStockByKeyboard(page);
    await expect(field(page, 'lc-buy-order-price')).toHaveValue(LIVE_UPPER_LIMIT, { timeout: 15_000 });

    // 등록 전 — 사이드바 3단에 전략 항목이 없다.
    await expect(strategyItems(page)).toHaveCount(0);

    // ★ WR-06 — 발주할 수 없는 전략은 무장되지 않는다(10만원 / 12.74만 = 0주).
    const card = cardOf(page, E2E_ISIN);
    const buySwitch = card.getByRole('switch', { name: '매수주문 켜기' });
    await expect(buySwitch).toBeDisabled();
    await expect(card.locator('[data-slot="lc-arm-blocked"]').first()).toBeVisible();
    await field(page, 'lc-buy-order-amount').fill('50'); // 50만원 → 3주
    await expect(buySwitch).toBeEnabled();

    await buySwitch.click();
    // ★ 확인 다이얼로그가 없다(D-05) — 그 자리에서 바로 나간다.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await waitForSetAtGateway(relay, 1);

    await relay.pushLimitChaserEcho({ buyEnabled: true });

    // 무장 표기는 카드 헤더의 래치 LED 하나다(D-22). 스텁 기본 매도잔량 기준 → 초록·비클릭(BL-01).
    await expect(
      card.locator('[data-slot="card-header"] [data-slot="latch-led"][data-kind="buy"]'),
    ).toHaveAttribute('data-tone', 'armed', { timeout: 15_000 });
    await expect((await logRows(page)).first()).toContainText('매수 무장');
    // 사이드바 3단에 항목이 서고 LED 3점 중 매수가 켜진다.
    await expect(strategyItems(page)).toHaveCount(1);
    await expect(strategyItems(page).first().locator('[data-led="buy"]')).toHaveAttribute(
      'data-tone',
      'armed',
    );
  });

  test('11. 카드 헤더에 래치 LED 3개가 매수·매도·취소 순서로 보이고 라벨이 상태를 말한다 (옛 LC 3b · 17-11 D-22)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true, sellEnabled: true, cancelQtyEnabled: true }]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);

    const leds = cardOf(page, E2E_ISIN).locator('[data-slot="card-header"] [data-slot="latch-led"]');
    await expect(leds).toHaveCount(3, { timeout: 15_000 });
    await expect(leds.nth(0)).toHaveAttribute('data-kind', 'buy');
    await expect(leds.nth(1)).toHaveAttribute('data-kind', 'sell');
    await expect(leds.nth(2)).toHaveAttribute('data-kind', 'cancel');
    for (const i of [0, 1, 2]) await expect(leds.nth(i)).toBeVisible();
    // 색만이 아니라 보이는 라벨이 상태를 말한다(D-21 · WCAG 1.4.1).
    await expect(leds.nth(1)).toContainText('대기');
    await expect(leds.nth(2)).toContainText('대기');
    await expect(leds.nth(0)).toContainText('(매도잔량 기준)');
    await expect(cardOf(page, E2E_ISIN)).not.toContainText('매수 ON');
  });

  test('12. 값 변경 → 더티 바 「1개 미반영」 → 「수정」 → 10 재전송 → 에코 후 바 소멸 · 반영 시각 (옛 LC 4)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    await field(page, 'lc-buy-watch-qty').fill('8000');
    await expect(dirtyBar(page)).toContainText('삼성전자 · 1개 미반영');

    // 작업대에는 AI FAB 이 없다 — 「수정」을 가로챌 것이 없다는 전제 + 바가 실제로 올라와 있다.
    await expect(page.getByRole('button', { name: 'AI' })).toHaveCount(0);
    const submitBox = await dirtyBar(page).getByRole('button', { name: '수정' }).boundingBox();
    expect(submitBox).not.toBeNull();
    expect(submitBox!.width).toBeGreaterThan(0);

    await dirtyBar(page).getByRole('button', { name: '수정' }).click();
    await waitForSetAtGateway(relay, before + 1);
    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 8_000 });

    // 반영의 유일한 증거는 에코다 — 바가 사라지고 상태줄에 시각이 찍힌다.
    await expect(dirtyBar(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(statusBar(page).getByTestId('stat-applied')).toHaveText(/^반영 \d{2}:\d{2}:\d{2}$/);
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('8,000');
  });

  test('13. 다른 단말 변경 — 더티를 덮고 카드 6초 배너(role=status) + 공용 로그 1줄 (옛 LC 5 · D-11)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);

    await field(page, 'lc-buy-watch-qty').fill('8000');
    await expect(dirtyBar(page)).toBeVisible();
    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 5_000 });

    // 서버가 이긴다 — 편집 중 보호·보류가 없다.
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('5,000', { timeout: 15_000 });
    const banner = cardOf(page, E2E_ISIN).locator('[data-slot="card-echo-banner"]');
    await expect(banner).toContainText('다른 단말에서 변경돼 수정하던 값 1개가 서버 값으로 바뀌었어요');
    await expect(banner).toHaveAttribute('role', 'status');
    await expect(dirtyBar(page)).toHaveCount(0);

    // 배너는 6초 뒤 사라지지만 로그는 남는다.
    await expect(banner).toHaveCount(0, { timeout: 15_000 });
    await expect((await logRows(page)).filter({ hasText: '다른 단말에서 변경' })).toHaveCount(1);
  });

  test('14. 매수·매도 OFF = 삭제 — cfg `D` → 에코 후 사이드바에서 빠지고 폼이 기본값, 삭제 버튼 없음 (옛 LC 6 · D-08)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true, buyWatchQty: 8_000 }]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    await expect(strategyItems(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('8,000', { timeout: 15_000 });
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    await expect(page.getByRole('button', { name: /삭제/ })).toHaveCount(0);
    await cardOf(page, E2E_ISIN).getByRole('switch', { name: '매수주문 켜기' }).click();
    await waitForSetAtGateway(relay, before + 1);

    // 삭제 판정은 스위치가 아니라 서버 에코의 `crud` 다(Pitfall 7).
    await relay.pushLimitChaserEcho({ crud: 'D', buyEnabled: false, buyWatchQty: 8_000 });

    await expect(strategyItems(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000');
    await expect((await logRows(page)).filter({ hasText: '전략이 삭제됐어요' })).toHaveCount(1);
  });

  test('15. 서버 통지 몫 가르기 — 종목 없는 Account(VI 몫)는 카드가 아니라 VI 줄에, 상따 거부는 카드 경보·로그 양쪽에 (옛 LC 7·7b · T-16-07 · Pitfall 9)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const cardError = cardOf(page, E2E_ISIN).locator('[data-slot="card-server-error"]');

    // ① 종목 축이 없는 계좌 통지 = VI 몫. 카드가 이걸 그리면 사용자가 멀쩡한 상따를 껐다 켠다.
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: '',
      accountNo: E2E_ACCOUNT_NO,
      message: 'VI 주문금액이 0 입니다',
      kind: '',
    });
    await expect(page.locator('[data-slot="vi-server-error"]')).toContainText('VI 주문금액이 0 입니다', {
      timeout: 15_000,
    });
    await expect(cardError).toHaveCount(0);
    await expect((await logRows(page)).filter({ hasText: 'VI 주문금액이 0 입니다' })).toHaveCount(0);

    // ② 같은 통지에 종목이 붙으면 상따 몫이다.
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      message: '주문 가능 금액이 부족합니다',
      kind: '',
    });
    await expect(cardError).toContainText('주문 가능 금액이 부족합니다', { timeout: 15_000 });

    // ③ 등록 거부 — 카드 경보(role=alert)와 로그 **양쪽**에 남는다(조용한 무시 0).
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'SetLimitChaser',
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      message: '허용되지 않은 거래소입니다',
      kind: '',
    });
    await expect(cardError).toContainText('허용되지 않은 거래소입니다', { timeout: 15_000 });
    await expect(cardError).toHaveAttribute('role', 'alert');
    await expect(cardError.locator('[data-slot="card-server-error-src"]')).toHaveText('[서버]');
    const rejected = (await logRows(page)).filter({ hasText: '허용되지 않은 거래소입니다' });
    await expect(rejected).toHaveCount(1);
    await expect(rejected).toHaveAttribute('data-level', 'error');
  });

  test('16. 더티 상태로 사이드바 다른 항목 클릭 → 확인이 뜨고 머무를 수 있다, 더티 0 이면 묻지 않는다 (옛 LC 10)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);

    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss(); // 「머무른다」
    });
    // 대조군 — 더티가 없으면 이동이 막히지 않는다.
    await desktopNav(page).getByRole('link', { name: '홈' }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    expect(dialogs).toEqual([]);

    await openFocusedCard(page);
    await field(page, 'lc-buy-watch-qty').fill('8000');
    await expect(dirtyBar(page)).toBeVisible();
    await desktopNav(page).getByRole('link', { name: '홈' }).click();

    await expect.poll(() => dialogs.length, { timeout: 15_000 }).toBe(1);
    expect(dialogs[0]).toContain('수정하지 않은 값이 있어요');
    await expect(page).toHaveURL(/\/trading/);
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('8,000');
  });

  test('17. 카드 와이드 밴드(832·880·960) 체결가·체결량 잘림 0 — 데스크톱은 시(時)까지 · 방향 라벨 유지 (옛 LC 13 · T-u58-03)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);
    const three = card.locator('[data-tree="three"]');

    // 수량 5자리 + 상한가(7자) 체결 — 짧은 샘플은 공허한 단언을 만든다.
    const sock = await relay.gateway.waitForConnection(15_000);
    relay.gateway.pushTape(sock, {
      isin: E2E_ISIN,
      exchange: 'KRX',
      snapshot: true,
      entries: [
        { tradeTime: '093015123456', price: 127_400n, qty: 12_345n, cumVolume: 999_966n },
        { tradeTime: '093016123456', price: 98_100n, qty: 54_321n, cumVolume: 1_000_000n },
        { tradeTime: '093017123456', price: 127_400n, qty: 12_345n, cumVolume: 1_000_012n },
      ],
    });

    const fillOverflow = () =>
      three.evaluate((tree) =>
        Array.from(tree.querySelectorAll<HTMLElement>('[data-slot="ladder-fill-cell"]'))
          .filter((c) => c.getClientRects().length > 0 && (c.textContent ?? '').trim() !== '')
          .flatMap((c) => {
            const spans = Array.from(c.querySelectorAll<HTMLElement>(':scope > div > span'));
            return [
              { what: '체결가', el: spans[1] },
              { what: '체결량', el: spans[2] },
            ]
              .filter((x) => x.el !== undefined)
              .map((x) => ({
                what: x.what,
                text: (x.el!.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 16),
                over: x.el!.scrollWidth - x.el!.clientWidth,
              }))
              .filter((x) => x.over > 1);
          }),
      );

    for (const target of [832, 880, 960]) {
      await sizeCardTo(page, E2E_ISIN, target);
      const { band } = await cardMetrics(page, E2E_ISIN);
      expect(band, `카드 ${target} — 와이드 밴드여야 한다`).toBe('wide');
      await expect(three.locator('[data-slot="ladder-fill-cell"]').first()).toContainText('12,345', {
        timeout: 15_000,
      });
      expect(await fillOverflow(), `카드 ${target} — 체결 셀 넘침`).toEqual([]);
    }

    await sizeCardTo(page, E2E_ISIN, 1100);
    expect((await cardMetrics(page, E2E_ISIN)).band).toBe('desktop');
    expect(await fillOverflow(), '카드 1100(데스크톱) — 체결 셀 넘침').toEqual([]);
    await expect(three.locator('[data-slot="ladder-fill-time-hh"]').first()).toBeVisible();
    const firstCell = three.locator('[data-slot="ladder-fill-cell"]').first();
    await expect(firstCell.locator('.sr-only')).toHaveText(/매수|매도/);
    await expect(firstCell.locator('[title]')).toHaveAttribute('title', /매수 체결|매도 체결/);
  });

  test('18. 폰 밴드 카드 — 호가 42% | 옵션 2열 · 「매수|매도|수동」 탭당 한 pane · 모바일 사다리 20행 · compact 테이프 1 · 미체결 긴 이름 잘림 0 (옛 LC 9 · R7)', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);

    await relay.pushAccountState({
      unfilled: [
        {
          orderNo: '0000135801',
          isin: E2E_LONG_NAME_ISIN,
          side: 'S',
          price: 1_234_567,
          orderQty: 999_999,
          filledQty: 0,
          unfilledQty: 999_999,
          exchange: 'NXT',
        },
      ],
      holdings: [{ isin: E2E_ISIN, stockQty: 120, sellableQty: 90, avgPrice: 91_250 }],
    });

    // 2열 배치는 실측 좌표로 본다 — 클래스 문자열만 보면 CSS 가 안 먹어도 통과한다.
    const ob = await card.locator('[data-slot="card-body-orderbook"]').boundingBox();
    const opt = await card.locator('[data-slot="card-body-options"]').boundingBox();
    expect(ob).not.toBeNull();
    expect(opt).not.toBeNull();
    expect(Math.abs(ob!.y - opt!.y)).toBeLessThan(2);
    expect(opt!.x).toBeGreaterThan(ob!.x + ob!.width - 2);
    const ratio = ob!.width / (ob!.width + opt!.width);
    expect(ratio).toBeGreaterThan(0.38);
    expect(ratio).toBeLessThan(0.46);
    // 그리드 자식 `min-width` 규칙 자체를 잠근다(가로 스크롤이 넘침을 흡수하는 함정).
    const minWidths = await card
      .locator('[data-slot="card-body"]')
      .evaluate((el) => Array.from(el.children).map((c) => getComputedStyle(c).minWidth));
    expect(minWidths).toEqual(['0px', '0px']);

    // 탭 — 활성 pane 하나만 보인다(비활성은 display:none).
    const tablist = card.getByRole('tablist', { name: '주문 진입' });
    await expect(tablist.getByRole('tab')).toHaveCount(3);
    await expect(tablist.getByRole('tab', { name: '매수' })).toHaveAttribute('aria-selected', 'true');
    await expect(card.locator('[data-pane="buy"]')).toBeVisible();
    await expect(card.locator('[data-pane="sell"]')).toBeHidden();
    await tablist.getByRole('tab', { name: '매도' }).click();
    await expect(card.locator('[data-pane="sell"]')).toBeVisible();
    await expect(card.locator('[data-pane="buy"]')).toBeHidden();
    await tablist.getByRole('tab', { name: '수동' }).click();
    await expect(card.getByTestId('manual-entry-form')).toBeVisible();
    await expect(card.getByTestId('manual-entry-options')).toBeHidden();

    // 좁은 폭 호가 = 2줄 행 20개 + 사다리 아래 compact 체결 테이프(보이는 것 1개, 헤더 없음).
    const ladder = card.locator('[data-slot="orderbook-ladder"][data-variant="chaser"]');
    await expect(ladder.locator('[data-slot="ladder-row-mobile"]')).toHaveCount(20);
    await expect(ladder.locator('[data-slot="ladder-row-mobile"] [data-slot="ladder-fill-cell"]')).toHaveCount(0);
    await expect(ladder.locator('[data-slot="trade-tape"][data-compact="true"]:visible')).toHaveCount(1);
    await expect(ladder.locator('[data-slot="trade-tape"][data-compact="true"] thead')).toHaveCount(0);

    // 매수 pane 은 204px 안에 라벨 + 입력이 들어간다(잎 요소 좌표 판정).
    await tablist.getByRole('tab', { name: '매수' }).click();
    const pane = card.locator('[data-pane="buy"]');
    const paneBox = await pane.boundingBox();
    expect(paneBox).not.toBeNull();
    expect(await leavesOverflowing(pane, paneBox!.x + paneBox!.width)).toEqual([]);

    /*
      공용 패널(폰 하단 바)을 펼쳐 미체결 긴 이름 행을 본다. 옛 화면의 카드형 행(`account-unfilled-row`)
      대신 작업대는 종목 열이 있는 **가로 스크롤 표**다(18-09 · E13 — 전 종목 한 목록). 그래서 계약은
      「조용한 잘림 0」이다: 긴 이름은 1줄 말줄임 + `title` 에 전문, 표는 스크롤 영역 안에서만 넘친다.
    */
    await sharedPanels(page).getByRole('button', { name: '펼치기 ▴' }).click();
    const rows = sharedPanels(page).locator('[data-slot="account-embed-unfilled-row"]');
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    await expect(rows.first().locator('[data-slot="account-embed-name"]')).toHaveAttribute(
      'title',
      /한국제7호기업인수목적우선주식회사/,
    );
    expect(await scrollOverflowing(page, '[data-testid="shared-panels"]')).toEqual([]);
  });

  test('19. `dma_credentials` 매핑 없음 → 게이트가 작업대 본문 전체를 대체한다 (옛 LC 8 · VI 8 · A14 · B9)', async ({
    page,
  }) => {
    relay.clearDmaCredentials();
    await page.goto(WORKBENCH_URL);

    const gate = page.locator('[data-slot="dma-gate"]');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toHaveAttribute('data-reason', 'unmapped');
    await expect(gate).toContainText('DMA 계정이 연결되지 않았어요');
    await expect(gate).toContainText('트레이딩');
    await expect(page.locator('[data-slot="trading-workbench"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="card-grid"]')).toHaveCount(0);
    await expect(page.locator('#vi-krx-amount')).toHaveCount(0);
    await expect(gate.getByRole('button')).toHaveCount(0);
  });

  // =========================================================================
  // 이관 — 옛 trading-vi.spec (VI 화면 → 작업대 VI 두 줄 · VI 발동 표)
  // =========================================================================

  test('20. VI 중지 상태 진입 — KRX 줄 서버값(1,000만원 · 22%) · 스위치 OFF · 「중지」 · 마감알림은 상태줄 · 발동 0건 (옛 VI 1 · D-05)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);

    await expect(field(page, 'vi-krx-amount')).toHaveValue('1,000', { timeout: 15_000 });
    await expect(field(page, 'vi-krx-rate')).toHaveValue('22');
    await expect(viRow(page)).toHaveAttribute('data-run', 'false');
    await expect(viRow(page)).toContainText('중지');
    await expect(viRow(page).getByRole('switch', { name: 'VI KRX 시작' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // 계좌 비밀번호·종목·주문유형 UI 가 없다(B2).
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    // 더티 0 이면 「수정」이 렌더 자체가 없다(B4).
    await expect(viRow(page).locator('[data-slot="vi-row-fix"]')).toHaveCount(0);
    // 마감알림은 상태줄의 이 기기 전용 토글로 옮겨 왔다(Q-1).
    await expect(statusBar(page).locator('[data-slot="workbench-vi-alert-toggle"]')).toBeVisible();
    await expect(statusBar(page).getByTestId('stat-vi')).toHaveText('VI 발동 0');
    // 사이드바 KRX VI 는 가동이 아니라 배지가 없다.
    await expect(desktopNav(page).locator('[data-sidebar-item="vi-KRX"] [data-slot="strategy-badge"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="vi-trigger-strip"]')).toContainText('오늘 발동된 VI 주문이 없어요');
  });

  test('21. VI 값 변경 → 「수정」 → 11 수신, **run 이 유지되고** 금액은 원 단위 · 거래소는 줄의 것 (옛 VI 2 · D-07 · Pitfall 8)', async ({
    page,
  }) => {
    relay.seedViTrigger({ ...VI_CFG, run: true });
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(viRow(page)).toHaveAttribute('data-run', 'true', { timeout: 15_000 });

    await field(page, 'vi-krx-amount').fill('1500');
    const fix = viRow(page).locator('[data-slot="vi-row-fix"]');
    await expect(fix).toHaveText('수정');
    await fix.click();

    await expect.poll(() => viSetRequests(relay).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    // ★ 페이로드를 직접 연다 — 「보냈다」만으로는 run 이 눕혀졌는지 알 수 없다.
    expect(viSetRequests(relay).at(-1)).toMatchObject({
      accountNo: E2E_ACCOUNT_NO,
      orderAmountKrw: 15_000_000, // 화면은 만원, 와이어는 원 — 한 자리가 어긋나면 1만 배 주문이다
      checkRate: 22,
      priceType: 'U',
      run: true,
      exchange: 'KRX',
    });

    await pushViEcho(relay, true, { orderAmountKrw: 15_000_000n });
    await expect(fix).toHaveCount(0, { timeout: 15_000 });
    await expect(field(page, 'vi-krx-amount')).toHaveValue('1,500');
    // 반영 시각은 `HH:MM:SS` 고정폭이다(로케일 포맷터면 Chromium 에서 「0시 57분」).
    await expect(viRow(page)).toContainText(/서버 반영 \d{2}:\d{2}:\d{2}/);
  });

  test('22. VI 「시작」 확인 — 요약에 현재 폼 금액·상승률 · 기본 포커스 취소 · 확정 시 run=true → 에코로 줄·사이드바가 함께 (옛 VI 3 · S-7 · T-16-10)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(field(page, 'vi-krx-amount')).toHaveValue('1,000', { timeout: 15_000 });

    await field(page, 'vi-krx-amount').fill('1500');
    await field(page, 'vi-krx-rate').fill('25');
    await viRow(page).getByRole('switch', { name: 'VI KRX 시작' }).click();

    const dialog = page.getByTestId('vi-start-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('VI 자동매수를 시작할까요?');
    await expect(dialog).toContainText('조건에 맞는 VI 발동 종목을 자동으로 매수해요.');
    const summary = dialog.locator('[data-slot="vi-confirm-summary"]');
    await expect(summary).toContainText('1,500만원');
    await expect(summary).toContainText('25% 이상');
    await expect(summary).toContainText('상한가 · KRX');
    await expect(dialog.locator('[data-slot="vi-confirm-warning"]')).toContainText(
      '시작하면 사람 확인 없이 주문이 나가요. 금액·상승률을 다시 확인해 주세요.',
    );
    // 기본 포커스는 취소 — Enter 연타로 무인 자동매수가 시작되면 안 된다. X 닫기도 없다.
    await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0);

    await dialog.getByRole('button', { name: '시작' }).click();
    await expect.poll(() => viSetRequests(relay).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    expect(viSetRequests(relay).at(-1)).toMatchObject({
      orderAmountKrw: 15_000_000,
      checkRate: 25,
      run: true,
      exchange: 'KRX',
    });
    expect(relay.requestLog()).toContain(DMA_MSG.SetVITriggerReq);

    // 반영의 증거는 에코다 — 줄과 사이드바가 같은 프레임으로 함께 움직인다.
    await pushViEcho(relay, true, { orderAmountKrw: 15_000_000n, checkRate: 25 });
    await expect(viRow(page)).toHaveAttribute('data-run', 'true', { timeout: 15_000 });
    await expect(viRow(page)).toContainText('가동중');
    await expect(viRow(page).getByRole('switch', { name: 'VI KRX 중지' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(
      desktopNav(page).locator('[data-sidebar-item="vi-KRX"] [data-slot="strategy-badge"]'),
    ).toHaveText('가동');
  });

  test('23. VI 「중지」 확인 — 오늘 주문·미체결(유지) 요약 + 경고 · 기본 포커스 닫기 · run=false (옛 VI 4)', async ({
    page,
  }) => {
    relay.seedViTrigger({ ...VI_CFG, run: true });
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    const sw = viRow(page).getByRole('switch', { name: 'VI KRX 중지' });
    await expect(sw).toBeVisible({ timeout: 15_000 });
    await expect(statusBar(page).getByTestId('stat-vi')).toHaveText(`VI 발동 ${VI_ORDERS.length}`, {
      timeout: 15_000,
    });

    await sw.click();
    const dialog = page.getByTestId('vi-stop-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('VI 자동매수를 중지할까요?');
    await expect(dialog).toContainText('새 VI 발동에 더 이상 주문하지 않아요.');
    const summary = dialog.locator('[data-slot="vi-confirm-summary"]');
    await expect(summary).toContainText('6건');
    await expect(summary).toContainText('(유지)');
    await expect(dialog.locator('[data-slot="vi-confirm-warning"]')).toContainText(
      '이미 접수된 주문은 취소되지 않아요.',
    );
    await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();

    await dialog.getByRole('button', { name: '중지' }).click();
    await expect.poll(() => viSetRequests(relay).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    expect(viSetRequests(relay).at(-1)).toMatchObject({ run: false, exchange: 'KRX' });
  });

  test('24. VI 발동 표 6건 — 상태 배지 6종 · 부분체결 파생 · 종목명 역매핑 · 잠긴 행 체크 비활성 · 110초 · 캡션 (옛 VI 5 · E3)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(page.locator('[data-slot="vi-chip"]')).toHaveCount(VI_ORDERS.length, { timeout: 15_000 });
    await openViTable(page);

    const rows = viTable(page).locator('[data-slot="vi-order-row"]');
    await expect(rows).toHaveCount(VI_ORDERS.length);
    // 상태 배지 — 텍스트만으로 6종이 갈린다(WCAG 1.4.1).
    await expect(rows.nth(0)).toContainText('접수');
    await expect(rows.nth(1)).toContainText('부분체결 120/278'); // Accepted ∧ filledQty>0 파생
    await expect(rows.nth(2)).toContainText('체결');
    await expect(rows.nth(3)).toContainText('취소');
    await expect(rows.nth(4)).toContainText('거부');
    await expect(rows.nth(5)).toContainText('접수 전');
    // 종목명은 relay 가 `stocks` 역매핑으로 채운다.
    await expect(rows.nth(0)).toContainText('삼성전자');
    await expect(rows.nth(1)).toContainText('한국제7호기업인수목적우선주식회사');

    // 잠긴 행(confirm_locked)과 접수 전 행은 체크할 수 없다 — 사유가 title 로 붙는다.
    const checks = viTable(page).locator('[data-slot="vi-confirm-check"]');
    await expect(checks.nth(0)).toBeEnabled();
    for (const i of [1, 2, 3, 4, 5]) await expect(checks.nth(i)).toBeDisabled();

    // 11열 — 거래소 열(3)은 KRX|NXT, 110초 열(10)은 살아 있는 행만 진행바, 나머지는 「—」.
    await expect(rows.nth(0).locator('td').nth(3)).toHaveText(/^(KRX|NXT)$/);
    for (const i of [2, 3, 4, 5]) await expect(rows.nth(i).locator('td').nth(10)).toHaveText('—');

    await expect(page.locator('[data-slot="vi-order-caption"]')).toContainText(
      '확인 체크 = 119초 미확인 취소 면제',
    );
    await expect(page.locator('[data-slot="vi-order-caption"]')).toContainText(
      '110초 미도달 취소는 서버 규칙이라 면제되지 않아요 · 접수 전(주문번호 없음)은 확인할 수 없어요',
    );
  });

  test('25. VI 확인 체크 → 33 수신(다이얼로그 없이 즉시) → 73 이 정정하면 다시 끌 수 있다 (옛 VI 6 · D-10)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(page.locator('[data-slot="vi-chip"]')).toHaveCount(VI_ORDERS.length, { timeout: 15_000 });
    await openViTable(page);

    const first = viTable(page).locator('[data-slot="vi-confirm-check"]').first();
    await expect(first).not.toBeChecked();
    await first.click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(first).toBeChecked(); // 낙관 반영 — 73 을 기다리지 않는다
    await expect.poll(() => viConfirmRequests(relay).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    expect(viConfirmRequests(relay).at(-1)).toEqual({ orderNo: '0031245', confirmed: true });
    expect(relay.requestLog()).toContain(DMA_MSG.ConfirmVIOrderReq);

    // 서버는 확인 응답을 따로 주지 않고 73 델타로 정정한다 — 그 뒤 잠금이 풀려 다시 끌 수 있다.
    await relay.pushViOrderList([{ ...VI_ORDERS[0], confirmed: true }], false);
    await expect(first).toBeChecked();
    await expect(first).toBeEnabled({ timeout: 15_000 });
    await first.click();
    await expect.poll(() => viConfirmRequests(relay).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    expect(viConfirmRequests(relay).at(-1)).toEqual({ orderNo: '0031245', confirmed: false });
  });

  test('26. VI 110초 데드라인 — 1초 틱이 돌고 20초 경계에서 색·숫자가 바뀐다 (옛 VI 7 · B6 · C4)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await openViTable(page);

    // 마감을 23초 뒤로 — 1초 틱이 실제로 돌아야만 약 4초 뒤 임박(<20초)으로 넘어간다.
    await relay.pushViOrderList(
      [
        {
          ...VI_ORDERS[0],
          deadline110Ms: BigInt(Date.now() + 23_000),
          deadline119Ms: BigInt(Date.now() + 32_000),
        },
      ],
      true,
    );

    const deadline = viTable(page).locator('[data-slot="vi-deadline"]').first();
    await expect(deadline).toBeVisible({ timeout: 15_000 });
    await expect(deadline).toHaveAttribute('data-hot', 'false');
    const bar = deadline.getByRole('progressbar');
    await expect(bar).toHaveAttribute('aria-label', '110초 자동취소까지 남은 시간');
    const before = Number(await bar.getAttribute('aria-valuenow'));
    expect(before).toBeGreaterThan(20);
    expect(before).toBeLessThanOrEqual(24); // 잔여는 올림 — 23.4초가 24 로 읽힌다

    await expect(deadline).toHaveAttribute('data-hot', 'true', { timeout: 15_000 });
    expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(20);
    const width = await deadline
      .locator('[data-slot="vi-deadline-fill"]')
      .evaluate((el) => (el as HTMLElement).style.width);
    expect(width).toMatch(/^\d+%$/);
  });

  test('27. VI 몫 통지만 VI 줄 아래 경보로 — 상따 거부·relay 자기 거부는 먹지 않는다 (옛 VI 10 · Pitfall 9)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);

    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      message: '주문 가능 금액이 부족합니다',
      kind: '',
    });
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Relay',
      isin: '',
      accountNo: E2E_ACCOUNT_NO,
      message: '요청 형식이 올바르지 않습니다',
      kind: '',
    });
    // 대조군을 먼저 넣고 「아무것도 안 뜬다」를 본다 — 순서가 반대면 「아직」과 「안 그린다」가 섞인다.
    const errorSlot = page.locator('[data-slot="vi-server-error"]');
    await expect(errorSlot).toHaveCount(0);

    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: '',
      accountNo: E2E_ACCOUNT_NO,
      message: 'VI 주문금액이 0 입니다',
      kind: '',
    });
    await expect(errorSlot).toContainText('VI 주문금액이 0 입니다', { timeout: 15_000 });
    await expect(errorSlot).toHaveAttribute('role', 'alert');
    await expect(errorSlot.locator('[data-slot="vi-server-error-src"]')).toHaveText('[서버]');
    await expect(errorSlot).not.toContainText('주문 가능 금액이 부족합니다');
    await expect(errorSlot).not.toContainText('요청 형식이 올바르지 않습니다');
  });
  test('28. 폰 밴드 VI 두 줄 · VI/돌파 스트립 · 펼친 표 — 조용한 잘림 0(표는 가로 스크롤), 긴 종목명은 말줄임 + title (옛 VI 9 · R6 · E2/E3/E4 overflow)', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    relay.setRespondingExchanges([]); // 돌파 행이 이탈 판정으로 지워지지 않게(케이스 3 과 같은 이유)
    relay.seedViTrigger({ ...VI_CFG, run: true });
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(page.locator('[data-slot="vi-chip"]')).toHaveCount(VI_ORDERS.length, { timeout: 15_000 });
    await openViTable(page);
    await pushBreakout(relay, E2E_LONG_NAME_ISIN);
    await expect(page.locator('[data-slot="breakout-chip"]')).toHaveCount(1, { timeout: 15_000 });
    await page.locator('[data-slot="breakout-more"]').click();
    await expect(page.locator('[data-slot="breakout-table"]')).toBeVisible();

    // VI 두 줄 — 스크롤 영역이 없는 표면이라 두 판정 모두 0 이어야 한다.
    expect(await scrollOverflowing(page, '[data-slot="vi-settings-rows"]')).toEqual([]);
    const rowsBox = await page.locator('[data-slot="vi-settings-rows"]').boundingBox();
    expect(rowsBox).not.toBeNull();
    expect(
      await leavesOverflowing(page.locator('[data-slot="vi-settings-rows"]'), rowsBox!.x + rowsBox!.width),
    ).toEqual([]);

    /*
      발동 스트립·표 — 칩 줄은 가로 스크롤 한 줄, 표는 가로 스크롤 컨테이너(목업 정본 · E3 overflow),
      긴 이름은 1줄 말줄임(E3 long-text)이 **계약**이다. 같은 판정(scrollOverflowing)을 쓰되, 넘친
      요소가 그 셋 중 하나인지만 가른다 — 계약 밖에서 넘친 요소가 하나라도 있으면 실패한다.
    */
    const flagged = await scrollOverflowing(page, '[data-slot="vi-trigger"]');
    const unexpected = flagged.filter(
      (f) =>
        f.tag !== 'div[vi-chips]' &&
        f.tag !== 'div[table-container]',
    );
    expect(unexpected, '발동 스트립·표 — 스크롤·말줄임 계약 밖에서 넘친 요소').toEqual([]);
    // 칩 줄과 표 컨테이너는 실제로 가로 스크롤이다(넘침이 잘림이 아니라 스크롤이라는 증거).
    for (const sel of ['[data-slot="vi-chips"]', '[data-slot="vi-trigger-table"] [data-slot="table-container"]']) {
      expect(
        await page.locator(sel).evaluate((el) => getComputedStyle(el).overflowX),
        `${sel} 는 가로 스크롤이어야 한다`,
      ).toMatch(/auto|scroll/);
    }

    // 돌파 스트립·표도 같은 계약이다(E4 overflow) — 칩 줄 스크롤 · 표 가로 스크롤 · 말줄임.
    const breakoutFlagged = await scrollOverflowing(page, '[data-slot="breakout"]');
    expect(
      breakoutFlagged.filter((f) => f.tag !== 'div[breakout-chips]' && f.tag !== 'div[table-container]'),
      '돌파 스트립·표 — 스크롤·말줄임 계약 밖에서 넘친 요소',
    ).toEqual([]);

    // 긴 종목명 — 칩·표 셀에서 1줄 말줄임이고 전문은 title 에 있다(E3 long-text).
    const longName = '한국제7호기업인수목적우선주식회사';
    await expect(
      page.locator('[data-slot="vi-chip"] [data-slot="vi-chip-name"]').filter({ hasText: longName }).first(),
    ).toHaveAttribute('title', longName);
    await expect(viTable(page).locator('[data-slot="vi-row-name"]').nth(1)).toHaveAttribute('title', longName);
  });
});
