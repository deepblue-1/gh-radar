import { test, expect, type Locator, type Page } from '@playwright/test';

import { buildDiscussionList, mockDiscussionsApi } from '../fixtures/discussions';
import { mockStockApi } from '../fixtures/mock-api';
import { buildNewsList, mockNewsApi } from '../fixtures/news';
import { mockThemeChips } from '../fixtures/themes';
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
import { installNativeApp } from '../fixtures/native-app';
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
/** 전략 키가 정확히 같은 카드 — 같은 종목 카드가 둘일 때(WR-05) 가른다. */
const cardByKey = (page: Page, key: string) =>
  page.locator(`[data-slot="strategy-card"][data-key="${key}"]`);
/**
 * 그 종목 (첫) 카드의 헤더 토글 — DOM id 는 카드 id(`wb-card-{n}`) 축이라 ISIN 으로 만들 수 없다
 * (WR-05). 헤더 안 `aria-expanded` 를 가진 버튼이 토글 하나뿐이다.
 */
const toggleOf = (page: Page, isin: string) =>
  cardOf(page, isin).first().locator('[data-slot="card-header"] button[aria-expanded]');
const colsSegment = (page: Page) => page.locator('[data-slot="workbench-cols-segment"]');
/**
 * 옛 더티 액션 바 — Phase 20 D-04 로 사라졌다. **부재 단언에만** 쓴다(값 확정 = 즉시 반영).
 * 조회구 상수를 두지 않는 이유: 상수가 있으면 「바가 보인다」 단언이 다시 끼어들기 쉽다.
 */
const DIRTY_BAR_SEL = '[data-slot="dirty-action-bar"]';
const sharedPanels = (page: Page) => page.getByTestId('shared-panels');
/** VI 입력(`vi-krx-amount` 등)은 여전히 입력칸이다 — 상따 행은 아래 `lcRow` 를 쓴다. */
const field = (page: Page, id: string): Locator => page.locator(`#${id}`);
/**
 * Phase 20 상따 설정 행 — 옛 입력 id(`lc-buy-watch-qty` …)가 행 식별자(`data-lc-field`)로 산다
 * (`lc/lc-fields.ts`). 값 글자는 `[data-slot="lc-row-value"]`(「10,000주」 · 「127,400원」).
 */
const lcRow = (page: Page, id: string): Locator => page.locator(`[data-lc-field="${id}"]`);
const lcValue = (page: Page, id: string): Locator =>
  lcRow(page, id).locator('[data-slot="lc-row-value"]');
/** 그룹 스위치 4개 — `role="switch"` · 이름 「○○ 켜기」(A-P2). */
const lcSwitch = (scope: Page | Locator, name: string): Locator =>
  scope.getByRole('switch', { name, exact: true });
/** 인라인 편집(마우스 기기) — 행 클릭 → 옛 id 입력이 선다 → 값 → Enter(= 확정 1회 = 전송 1회). */
async function editLc(page: Page, id: string, value: string): Promise<void> {
  await lcRow(page, id).click();
  const input = page.locator(`#${id}`);
  await expect(input).toBeVisible();
  await input.fill(value);
  await input.press('Enter');
}
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

/**
 * VI 패널(「더보기」)을 연다 — VI 설정 두 줄은 펼침 안에만 보인다. 멱등이다: 이미 열려 있으면 다시
 * 눌러 닫지 않는다.
 */
async function openViPanel(page: Page): Promise<void> {
  const more = page.locator('[data-slot="vi-strip-more"]');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  await expect(page.locator('[data-slot="vi-settings-rows"]')).toBeVisible();
}

/** VI 발동 표를 연다(패널을 펼치면 주문이 있을 때 표가 선다). */
async function openViTable(page: Page): Promise<void> {
  await openViPanel(page);
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
  await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('10,000주', { timeout: 15_000 });
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
    await expect(colsSegment(page).getByRole('radio', { name: '3단' })).toBeChecked();

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

    const setBefore = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await chip.click();

    // 카드 1장 — 키의 거래소는 KRX, 계좌는 상태줄 계좌.
    await expect(cards(page)).toHaveCount(1);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-key', STRATEGY_KEY);
    await expect(card).toHaveAttribute('data-open', 'true');
    await expect(
      card.locator('[data-slot="card-exchange-segment"]').getByRole('radio', { name: 'KRX' }),
    ).toBeChecked();

    // 스위치 4개 전부 OFF(Phase 20 — 매수취소도 스위치) · WinForms 기본값(주문금액 10만원 ·
    // 감시잔량 10,000) · 더티 바 없음(D-04 — 더티 모델 자체가 없다).
    for (const name of ['매수주문 켜기', '매도주문 켜기', '한방체결 켜기', '매수취소 켜기']) {
      await expect(lcSwitch(card, name)).not.toBeChecked();
    }
    await expect(lcValue(page, 'lc-buy-order-amount')).toHaveText('10만원');
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('10,000주');
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);

    // 그 행이 「거래중」으로 바뀐다 — 칩을 다시 눌러도 카드가 늘지 않는다.
    await expect(chip).toHaveAttribute('data-trading', 'true');
    await expect(chip.locator('[data-slot="breakout-chip-trading"]')).toHaveText('거래중');

    // ★ 카드 추가는 서버에 아무것도 보내지 않는다 — 등록은 사용자가 스위치를 켤 때뿐이다(D-07).
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(setBefore);

    // 상태줄은 핵심만 말한다 — 개수는 칩 · 카드 수가 이미 증명했다.
    for (const word of ['돌파', '거래 종목', '임계']) {
      await expect(statusBar(page)).not.toContainText(word);
    }
  });

  test('GC1 돌파 목록은 가장 최신 돌파가 맨 위 — 칩 줄 첫 칩과 표 첫 행이 가장 늦은 돌파 (사용자 결정 2026-09-22 · TRADE-06)', async ({
    page,
  }) => {
    /*
      순서의 정본은 relay `sortRateCrossNewestFirst` 와 웹 리듀서 `sortRateCross` 한 벌이다 — 스트립·표는
      받은 순서를 그대로 그린다(D-14). 여기서는 그 결과가 실브라우저에서 「최신 위」로 보이는지만 본다.
      케이스 3 과 같은 이유로 시세 자동 응답을 끈다(이탈 판정으로 행이 지워지지 않게).
      `pushBreakout` 은 원소 1개 모양이라 쓰지 않고, 같은 `waitForConnection` 규율로 소켓을 직접 기다린다.
    */
    relay.setRespondingExchanges([]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);

    const base = { exchange: 'KRX', lastPrice: 118_000n, changeRate: 20.41, thresholdPct: 20, basePrice: 98_000n };
    const sock = await relay.gateway.waitForConnection(15_000);
    // 게이트웨이 78 원순서는 오름차순(오래된 것이 먼저)이다 — 화면은 그 반대여야 한다.
    relay.gateway.sendRateCrossSnapshot(sock, [
      { ...base, isin: E2E_ISIN, exchangeTime: '090100000001' },
      { ...base, isin: E2E_LONG_NAME_ISIN, exchangeTime: '090300000003' },
    ]);

    const chips = page.locator('[data-slot="breakout-chip"]');
    await expect(chips).toHaveCount(2, { timeout: 15_000 });
    await expect(chips.first()).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(chips.nth(1)).toContainText('삼성전자');

    // 「더보기」 표도 같은 순서 — 표 첫 데이터 행이 가장 늦은 돌파다.
    await page.locator('[data-slot="breakout-more"]').click();
    const table = page.locator('[data-slot="breakout-table"]');
    await expect(table).toBeVisible();
    const rows = table.locator('[data-slot="breakout-row"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(rows.nth(1)).toContainText('삼성전자');

    // 76 으로 더 늦은(0905) 세 번째 종목 — 맨 위(첫 칩 · 표 첫 행)로 들어온다.
    // SymbolMap 에 없는 ISIN 이라 라벨은 ISIN 원문이다.
    const THIRD_ISIN = 'KR7035720002';
    relay.gateway.sendRateCrossAlert(sock, { ...base, isin: THIRD_ISIN, exchangeTime: '090500000005' });
    await expect(chips).toHaveCount(3, { timeout: 15_000 });
    await expect(chips.first()).toContainText(THIRD_ISIN);
    await expect(rows.first()).toContainText(THIRD_ISIN);
    await expect(chips.nth(1)).toContainText('한국제7호기업인수목적우선주식회사');
  });

  test('GC7 VI 발동 목록은 가장 최신 발동이 맨 앞(칩)·맨 위(표) — 73 신규는 맨 앞, 73 갱신은 자리 유지 (quick-260923-dmb)', async ({
    page,
  }) => {
    /*
      순서의 정본은 웹 리듀서 `sortViOrdersNewestFirst` 한 곳이다(72 교체 · 73 병합 두 갈래). 게이트웨이
      72 는 생성 순(오래된 것 먼저)으로 오고 relay 는 받은 그대로 팬아웃한다 — 화면은 그 반대여야 한다.
      정렬 키는 행마다 고정인 deadline110Ms 라 시각을 명시한다(픽스처 기본값은 한 프레임 안에서 동률).
    */
    relay.seedViTrigger(VI_CFG);
    const t0 = Date.now();
    const A = {
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      orderNo: '0032001',
      state: 'Accepted',
      triggerPrice: 41_250,
      basePrice: 33_510,
      deadline110Ms: BigInt(t0 + 50_000),
      deadline119Ms: BigInt(t0 + 59_000),
    } as const;
    const B = {
      isin: E2E_LONG_NAME_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      orderNo: '0032002',
      state: 'Accepted',
      triggerPrice: 98_400,
      basePrice: 80_000,
      deadline110Ms: BigInt(t0 + 80_000),
      deadline119Ms: BigInt(t0 + 89_000),
    } as const;
    // 오래된 순(게이트웨이 원순서)으로 시드한다.
    relay.seedViOrders([A, B]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);

    const chips = page.locator('[data-slot="vi-chip"]');
    await expect(chips).toHaveCount(2, { timeout: 15_000 });
    await expect(chips.first()).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(chips.nth(1)).toContainText('삼성전자');

    await openViTable(page);
    const rows = viTable(page).locator('[data-slot="vi-order-row"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(rows.nth(1)).toContainText('삼성전자');

    // 73 신규 — 가장 늦은 발동이라 첫 칩 · 표 첫 행으로 들어온다.
    const C = {
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      orderNo: '0032003',
      state: 'Accepted',
      triggerPrice: 55_500,
      basePrice: 45_000,
      deadline110Ms: BigInt(t0 + 105_000),
      deadline119Ms: BigInt(t0 + 114_000),
    } as const;
    await relay.pushViOrderList([C], false);
    await expect(chips).toHaveCount(3, { timeout: 15_000 });
    await expect(chips.first()).toContainText('55,500');
    await expect(rows.first()).toContainText('55,500');

    // 73 갱신(가장 오래된 A 의 확인) — 도착은 가장 늦지만 자리는 끝 그대로다.
    await relay.pushViOrderList([{ ...A, confirmed: true }], false);
    await expect(rows.last().locator('[data-slot="vi-confirm-check"]')).toBeChecked({ timeout: 15_000 });
    await expect(chips.last()).toContainText('41,250');
    await expect(rows.last()).toContainText('41,250');
    await expect(chips.first()).toContainText('55,500');
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
    const toggle = (isin: string) => toggleOf(page, isin);

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
    // 스택 안 카드의 본문은 **보이지 않는다**(D-11 · WR-02 — 한 번 펼친 본문은 숨김으로 남는다).
    await expect(
      grid(page).locator('[data-slot="card-stack"] [data-slot="card-body"]:visible'),
    ).toHaveCount(0);

    // 펼침 2 · 접힘 1.
    await toggle(E2E_ISIN).click();
    expect(await layout()).toEqual(['open', 'open', 'stack(1)']);
    // quick-260923-p3k — 방금 펼친 카드가 펼친 무리의 **맨 끝**이다(옛 규칙이면 시드 순서대로 E2E 가 앞).
    await expect(cells.nth(0).locator(cardSelector(E2E_LONG_NAME_ISIN))).toHaveCount(1);
    await expect(cells.nth(1).locator(cardSelector(E2E_ISIN))).toHaveCount(1);

    // 펼침 3(2+) · 접힘 0 — 스택 칸 자체가 없다.
    await toggle('KR7086520004').click();
    expect(await layout()).toEqual(['open', 'open', 'open']);
    await expect(grid(page).locator('[data-slot="card-stack"]')).toHaveCount(0);

    // 다시 하나 접으면 스택이 **맨 뒤** 칸으로 돌아온다.
    await toggle(E2E_LONG_NAME_ISIN).click();
    expect(await layout()).toEqual(['open', 'open', 'stack(1)']);
    // 한 번 펼쳤다 접은 카드도 본문은 보이지 않는다(숨김으로 DOM 에 남아 있을 뿐 · WR-02).
    await expect(
      grid(page).locator('[data-slot="card-stack"] [data-slot="card-body"]:visible'),
    ).toHaveCount(0);

    // 2026-09-23 개정 — 방금 접은 카드는 스택의 **맨 앞**이다(스택 안 순서 E2E → LONG).
    await toggle(E2E_ISIN).click();
    expect(await layout()).toEqual(['open', 'stack(2)']);
    const stacked = grid(page).locator('[data-slot="card-stack"] [data-slot="strategy-card"]');
    await expect(stacked.nth(0)).toHaveAttribute('data-key', new RegExp(`^${E2E_ISIN}:`));
    await expect(stacked.nth(1)).toHaveAttribute('data-key', new RegExp(`^${E2E_LONG_NAME_ISIN}:`));
    // 직렬 공유 페이지 — 끝 상태 모양(펼침 2 · 접힘 1)을 이전과 같게 되돌린다.
    await toggle(E2E_ISIN).click();
    expect(await layout()).toEqual(['open', 'open', 'stack(1)']);
  });

  test('7. 폰 밴드 — 인라인 편집 행을 하단 고정 공용 패널 위로 올려 적용 → 10 수신 → 에코 → 행 값 · 패널은 화면 하단 그대로 · 맨 아래까지 스크롤해도 카드 끝이 패널에 묻히지 않는다 (E13 overflow · 옛 E15 더티 바 재정의 · D-04 · D-28)', async ({
    page,
  }) => {
    /*
      옛 7 은 더티 바(카드 하단 자리)와 하단 고정 공용 패널의 겹침 0 을 쟀다. Phase 20 D-04 로 바가 사라졌다 —
      값은 행에서 확정하면 곧장 나간다. 그래서 같은 성질(편집 표면이 패널에 묻히지 않는다 · 패널은 비켜 서지
      않는다 · 카드 끝이 패널 아래로 숨지 않는다)을 **편집 중인 행**으로 다시 잰다.
    */
    await page.setViewportSize(PHONE_VIEWPORT);
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    // 먼저 패널이 **정말 화면 하단에 붙어 있는지** 본다(겹침 0 만 보면 화면 밖 패널도 초록이 된다).
    const viewportH = PHONE_VIEWPORT.height;
    const row = lcRow(page, 'lc-buy-watch-qty');
    await row.scrollIntoViewIfNeeded();
    const pinned = await sharedPanels(page).boundingBox();
    expect(pinned).not.toBeNull();
    expect(Math.abs(pinned!.y + pinned!.height - viewportH), '편집 전 — 패널 끝이 화면 하단').toBeLessThanOrEqual(1);

    // 잔량 행을 패널 위 화면 가운데로 올린다(스크롤 주체가 창이든 main 이든 scrollIntoView 가 맞춘다).
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect
      .poll(async () => {
        const r = await row.boundingBox();
        const p = await sharedPanels(page).boundingBox();
        return r !== null && p !== null && r.y + r.height <= p.y;
      }, { message: '잔량 행 아래 끝이 패널 위 끝보다 위' })
      .toBe(true);

    await row.click();
    const input = page.locator('#lc-buy-watch-qty');
    await expect(input).toBeFocused();
    await input.fill('8000');

    // 편집 중인 행과 패널이 세로로 겹치지 않는다 · 패널은 비켜 서지 않고 화면 하단 그대로다.
    const editing = page.locator('[data-lc-field="lc-buy-watch-qty"][data-editing="true"]');
    const editBox = await editing.boundingBox();
    const panel = await sharedPanels(page).boundingBox();
    expect(editBox, '편집 중 행을 잴 수 없다').not.toBeNull();
    expect(panel, '공용 패널을 잴 수 없다').not.toBeNull();
    const overlap =
      Math.min(panel!.y + panel!.height, editBox!.y + editBox!.height) - Math.max(panel!.y, editBox!.y);
    expect(overlap, `편집 행 [${editBox!.y}, ${editBox!.y + editBox!.height}] ∩ 패널 [${panel!.y}, ${panel!.y + panel!.height}]`).toBeLessThanOrEqual(1);
    expect(Math.abs(panel!.y + panel!.height - viewportH), '편집 중 — 패널은 화면 하단 그대로').toBeLessThanOrEqual(1);
    await expect(sharedPanels(page)).not.toHaveAttribute('data-dirty-reserve', 'true');

    await input.press('Enter');
    await waitForSetAtGateway(relay, before + 1);
    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 8_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주', { timeout: 15_000 });
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);

    // ③ 페이지 맨 아래 — 흐름 안 자리(spacer) 덕에 카드 끝이 패널에 묻히지 않는다(옛 단언 그대로).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastCard = await cardOf(page, E2E_ISIN).boundingBox();
    const panelAtEnd = await sharedPanels(page).boundingBox();
    expect(Math.abs(panelAtEnd!.y + panelAtEnd!.height - viewportH), '맨 아래 — 패널은 화면 하단 그대로').toBeLessThanOrEqual(1);
    expect(lastCard!.y + lastCard!.height, '맨 아래 — 카드 끝이 패널에 묻히지 않는다').toBeLessThanOrEqual(panelAtEnd!.y + 1);
  });

  test('G-21-R3-2 앱 공용 패널 숨김 — 앱 390 · 1024 는 패널 · spacer 가 없고 탭바 몫은 82px 로 풀린다, 브라우저 390 · 1280 은 그대로 보인다 (D-25a)', async ({
    page,
  }) => {
    /*
      앱(html.native-app)은 /trading 하단 공용 패널과 흐름 안 자리(spacer)를 CSS 로 숨긴다(폰 · iPad 공통) —
      네이티브 탭바 위에 겹쳐 쌓이던 문제. 브라우저는 종전 그대로다(T-21-89).
      ★ 카드 더티 바 자체는 Phase 20 D-04 이후 렌더되는 곳이 없어(값은 행 확정 = 즉시 전송) UI 로 더티 카드를
        만들 수 없다. 그래서 바 위치 식(innerHeight − inset − 탭바 몫)은 strategy-card.test 가 잠그고, 여기서는
        그 식의 입력인 **프로브 계산값**이 실브라우저에서 14 + 60 + 8 = 82px(안전영역 0)로 풀리는지를 본다.
    */
    relay.seedLimitChasers([{ buyEnabled: true }]);
    const spacer = page.locator('[data-slot="shared-panels-spacer"]');
    const probeBottom = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-slot="native-tabbar-probe"]');
        return el === null ? null : getComputedStyle(el).bottom;
      });

    // ① 브라우저 390 · 1280 — 패널이 보인다(폰은 포털 + spacer).
    await page.setViewportSize(PHONE_VIEWPORT);
    await openFocusedCard(page);
    await expect(sharedPanels(page)).toBeVisible();
    await expect(sharedPanels(page)).toHaveAttribute('data-pinned', 'true');
    await expect(spacer).toHaveCount(1);
    expect(await probeBottom(), '브라우저 — 탭바 몫 0').toBe('0px');
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(sharedPanels(page)).toBeVisible();

    // ② 앱 390 — 패널 · spacer 가 없고, 패널 높이 알림(--wb-bottom-inset)도 0 이다.
    await installNativeApp(page);
    await page.setViewportSize(PHONE_VIEWPORT);
    await openFocusedCard(page);
    await expect(page.locator('html')).toHaveClass(/native-app/);
    await expect(sharedPanels(page)).toBeHidden();
    await expect(spacer).toBeHidden();
    const inset = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--wb-bottom-inset').trim(),
    );
    expect(['', '0px'], `--wb-bottom-inset = ${inset}`).toContain(inset);
    expect(await probeBottom(), '앱 — 탭바 몫 = 14 + 60 + 8').toBe('82px');

    // ③ 앱 1024(iPad) — 넓은 폭(격자 아래 일반 섹션)도 숨긴다.
    await page.setViewportSize({ width: 1024, height: 1366 });
    await expect(cardOf(page, E2E_ISIN)).toBeVisible();
    await expect(sharedPanels(page)).toBeHidden();
    await expect(spacer).toBeHidden();
  });

  test('G-21-R3-9 /trading?code= — 그 종목 카드를 보장 · 펼침 · 헤더 토글 포커스, URL 에서 code 가 빠지고 relay 로 나간 전략/주문 프레임 0, 같은 URL 을 다시 열어도 카드 수 그대로 (D-30 · T-21-91)', async ({
    page,
  }) => {
    /*
      종목상세 「트레이딩」 착지. 작업대가 배치 복원 뒤 1회 `fetchStockDetail` → `isPickable` → 카드 보장
      (reveal) 을 하고 `code` 를 지운다. ★ 착지는 화면 상태만 바꾼다 — 전략 등록 · 주문 · 정정 · VI ·
      래치 어떤 명령 프레임도 게이트웨이에 닿지 않는다.
    */
    const COMMAND_TYPES: readonly number[] = [
      DMA_MSG.DirectOrderReq,
      DMA_MSG.SetLimitChaserReq,
      DMA_MSG.SetVITriggerReq,
      DMA_MSG.DisableStrategiesReq,
      DMA_MSG.ConfirmVIOrderReq,
      DMA_MSG.ArmSellLatchReq,
      DMA_MSG.ArmCancelLatchReq,
      DMA_MSG.ArmBuyLatchReq,
    ];
    const commandsSent = () => relay.requestLog().filter((m) => COMMAND_TYPES.includes(m)).length;
    const landingUrl = `${WORKBENCH_URL}?code=005930`;
    const codeCleared = (url: URL) => url.pathname === '/trading' && !url.searchParams.has('code');

    // ① 카드 없는 종목 — 새 카드가 펼친 채 서고 헤더 토글이 포커스를 받는다.
    await page.goto(landingUrl);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-key', STRATEGY_KEY);
    await expect(card).toHaveAttribute('data-open', 'true');
    await expect(toggleOf(page, E2E_ISIN)).toBeFocused();
    await expect(page).toHaveURL(codeCleared);
    expect(commandsSent(), '착지는 명령 프레임을 보내지 않는다').toBe(0);

    // ② 같은 URL 을 다시 연다 — 복원된 같은 카드를 펼칠 뿐 늘지 않는다.
    await toggleOf(page, E2E_ISIN).click();
    await expect(card).toHaveAttribute('data-open', 'false');
    await page.goto(landingUrl);
    await waitForReady(page);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(toggleOf(page, E2E_ISIN)).toBeFocused();
    await expect(cards(page)).toHaveCount(1);
    await expect(page).toHaveURL(codeCleared);
    expect(commandsSent(), '다시 열어도 명령 프레임 0').toBe(0);
  });

  test('8.상태줄 — 폰 밴드에서 필이 2줄 이상으로 wrap 하고 어느 필도 잘리지 않는다, 와이드도 잘림 0 (E1 overflow)', async ({
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

    // 입력 글꼴은 기기와 무관하게 14px — iOS 확대는 루트 viewport maximum-scale=1 이 막는다(quick-260925-ptw).
    await expect(addBox(page)).toHaveCSS('font-size', '14px');

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
      await expect(lcValue(page, id)).toHaveText(`${LIVE_UPPER_LIMIT}원`, { timeout: 15_000 });
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
    await expect(lcValue(page, 'lc-buy-order-price')).toHaveText(`${LIVE_UPPER_LIMIT}원`, {
      timeout: 15_000,
    });

    // 등록 전 — 사이드바 3단에 전략 항목이 없다.
    await expect(strategyItems(page)).toHaveCount(0);

    // ★ WR-06 — 발주할 수 없는 전략은 무장되지 않는다(10만원 / 12.74만 = 0주).
    const card = cardOf(page, E2E_ISIN);
    const buySwitch = lcSwitch(card, '매수주문 켜기');
    await expect(buySwitch).toBeDisabled();
    await expect(card.locator('[data-slot="lc-arm-blocked"]').first()).toBeVisible();
    // ★ A-P1 — 미등록 카드의 값 확정은 **로컬 반영**이다(서버 전략이 없어 보낼 곳이 없다). 전송 0.
    const setBeforeAmount = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await editLc(page, 'lc-buy-order-amount', '50'); // 50만원 → 3주
    await expect(lcValue(page, 'lc-buy-order-amount')).toHaveText('50만원');
    await expect(buySwitch).toBeEnabled();
    expect(
      relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length,
      '미등록 카드의 값 확정은 게이트웨이로 나가지 않는다(A-P1)',
    ).toBe(setBeforeAmount);

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

  test('GC3 같은 종목의 KRX·NXT 두 전략 = 카드 두 장, 사이드바 NXT 항목은 NXT 카드를 펼친다 (WR-05 · D-03)', async ({
    page,
  }) => {
    const nxtKey = `${E2E_ISIN}:${E2E_ACCOUNT_NO}:NXT`;
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(0);

    // 같은 종목 · 같은 계좌 · 거래소만 다른 등록 전략 두 건(60 에코).
    await relay.pushLimitChaserEcho({ buyEnabled: true, exchange: 'KRX' });
    await relay.pushLimitChaserEcho({ buyEnabled: true, exchange: 'NXT' });

    // D-03 「카드와 동기」 — 사이드바 두 줄 = 카드 두 장, 각자 자기 키.
    await expect(strategyItems(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(cards(page)).toHaveCount(2);
    await expect(cardByKey(page, STRATEGY_KEY)).toHaveCount(1);
    await expect(cardByKey(page, nxtKey)).toHaveCount(1);
    await expect(cardByKey(page, STRATEGY_KEY)).toHaveAttribute('data-open', 'false');
    await expect(cardByKey(page, nxtKey)).toHaveAttribute('data-open', 'false');

    // 사이드바 NXT 항목 → NXT 카드만 펼쳐진다(같은 종목 KRX 카드가 아니다).
    await desktopNav(page).locator(`[data-strategy-key="${nxtKey}"]`).click();
    await expect(cardByKey(page, nxtKey)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(cardByKey(page, STRATEGY_KEY)).toHaveAttribute('data-open', 'false');

    // UI-SPEC Q-3 — 두 카드는 헤더 종목명 title 로 구분된다(보이는 요소 추가 없음).
    await expect(cardByKey(page, nxtKey).locator('[data-part="name"]')).toHaveAttribute(
      'title',
      `삼성전자 · 계좌 ${E2E_ACCOUNT_NO} · NXT`,
    );

    // quick-260923-pgv — 등록 카드도 세그먼트가 활성 · 충돌(NXT 카드 있음)이면 이 카드는 그대로, 그 카드가 펼쳐진다.
    // NXT 카드를 먼저 접어 둔다 — 펼침이 이미 참이면 충돌 이동을 증명하지 못한다.
    await cardByKey(page, nxtKey).locator('[data-slot="card-header"] button[aria-expanded]').click();
    await expect(cardByKey(page, nxtKey)).toHaveAttribute('data-open', 'false');
    const krxNxtRadio = cardByKey(page, STRATEGY_KEY)
      .locator('[data-slot="card-exchange-segment"]')
      .getByRole('radio', { name: 'NXT' });
    await expect(krxNxtRadio).toBeEnabled();
    await krxNxtRadio.click();
    await expect(cardByKey(page, STRATEGY_KEY)).toHaveCount(1);
    await expect(cardByKey(page, nxtKey)).toHaveAttribute('data-open', 'true');
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByTestId('workbench-exchange-confirm')).toHaveCount(0);
  });

  test('GC4 카드 없는 종목의 미체결을 누르면 그 종목 카드가 붙어 펼쳐지고 수동주문에 원주문 칩이 선다 (WR-04 · D-21)', async ({
    page,
  }) => {
    const orderNo = '0000135802';
    const key = `${E2E_LONG_NAME_ISIN}:${E2E_ACCOUNT_NO}:KRX`;
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(0);

    await relay.pushAccountState({
      unfilled: [
        {
          orderNo,
          isin: E2E_LONG_NAME_ISIN,
          side: 'B',
          price: 10_150,
          orderQty: 30,
          filledQty: 0,
          unfilledQty: 30,
          exchange: 'KRX',
        },
      ],
    });

    const unfilledTab = sharedPanels(page).getByRole('tab', { name: /미체결/ });
    if ((await unfilledTab.getAttribute('aria-selected')) !== 'true') await unfilledTab.click();
    const row = sharedPanels(page)
      .locator('[data-slot="account-embed-unfilled-row"]')
      .filter({ hasText: orderNo });
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    const setBefore = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await row.locator('td').nth(3).click();

    // 받을 카드가 붙는다 — 행의 ISIN · 행의 거래소 · 상태줄 계좌 · 펼침.
    await expect(cards(page)).toHaveCount(1);
    const card = cardByKey(page, key);
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute('data-open', 'true');

    // 카드의 「수동주문」 을 열면 원주문 칩이 그 주문번호를 말한다.
    await card.getByRole('button', { name: '수동주문', exact: true }).click();
    await expect(card.getByTestId('manual-order-selchip')).toBeVisible();
    await expect(card.getByTestId('manual-order-selchip')).toContainText(orderNo);

    // ★ 카드 추가는 화면 상태다 — 서버 전략 생성 송신 0 (T-18-99).
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(setBefore);
  });

  test('GC5 결과 모름 잠금은 카드를 닫았다 다시 열어도 풀리지 않는다 — ✕ 는 확인을 거친다 (GC-WR-03 · D-20)', async ({
    page,
  }) => {
    const directOrders = () => relay.requestLog().filter((m) => m === DMA_MSG.DirectOrderReq).length;
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(0);

    // 종목 추가로 카드 → 수동주문 → 매수 → 확인.
    await addStockByKeyboard(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    let card = cardOf(page, E2E_ISIN);
    await card.getByRole('button', { name: '수동주문', exact: true }).click();
    let form = card.getByTestId('manual-order-form');
    await expect(form).toBeVisible();
    await form.locator(`#mo-price-${E2E_ISIN}`).fill('98000');
    await form.locator(`#mo-qty-${E2E_ISIN}`).fill('10');
    const buy = form.getByTestId('manual-order-buttons').getByRole('button', { name: '매수' });
    await expect(buy).toBeEnabled();
    await buy.click();
    const confirm = page.getByTestId('order-confirm-dialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /매수/ }).click();

    // 스텁 게이트웨이는 주문에 응답하지 않는다 — relay 5초 상한 뒤 「결과 모름」.
    await expect.poll(directOrders, { timeout: 15_000 }).toBe(1);
    await expect(form.getByTestId('manual-order-result')).toHaveAttribute('data-kind', 'unknown', {
      timeout: 15_000,
    });

    // ✕ → 결과 모름 확인 다이얼로그(카드는 아직 남아 있다).
    await card.getByRole('button', { name: /카드 닫기$/ }).click();
    const ask = page.getByTestId('workbench-close-confirm');
    await expect(ask).toBeVisible();
    await expect(ask).toHaveAttribute('data-reason', 'unknown');
    await expect(ask).toContainText('결과를 모르는 주문이 있어요');
    // 본문은 해제 규칙을 사실대로 말한다(18-34 · R3-WR-02 · 사용자 결정 1).
    await expect(ask).toContainText('다른 화면에 다녀와도');
    await expect(ask).toContainText('로그아웃하거나 새로고침하면 풀려요.');
    await expect(ask).not.toContainText('실패');
    await expect(cards(page)).toHaveCount(1);
    await ask.getByRole('button', { name: '카드 닫기', exact: true }).click();
    await expect(cards(page)).toHaveCount(0);

    // 같은 종목을 다시 추가 → 새 카드의 수동주문 4버튼이 잠긴 채 · 잠금 문구.
    await addStockByKeyboard(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    card = cardOf(page, E2E_ISIN);
    await card.getByRole('button', { name: '수동주문', exact: true }).click();
    form = card.getByTestId('manual-order-form');
    await expect(form).toBeVisible();
    const buttons = form.getByTestId('manual-order-buttons').getByRole('button');
    await expect(buttons).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) await expect(buttons.nth(i)).toBeDisabled();
    await expect(form.getByTestId('manual-order-locked')).toHaveText(
      '결과를 모르는 주문이 있어 주문 버튼을 잠갔어요 — 미체결 목록에서 접수 여부를 확인하세요',
    );
    await expect(form).not.toContainText('실패');

    // ★ 같은 주문이 다시 나가지 않았다 — 게이트웨이 주문 1건 · DB 기록 0건(D-01).
    expect(directOrders()).toBe(1);
    expect(relay.orderInserts()).toHaveLength(0);
  });

  test('GC6 결과 모름 잠금은 앱 수명이다 — 다른 화면에 다녀와도 · 호가 탭에서도 잠긴 채, 새로고침에만 풀린다 (R3-WR-02 · 사용자 결정 1)', async ({
    page,
  }) => {
    const LOCKED_TEXT =
      '결과를 모르는 주문이 있어 주문 버튼을 잠갔어요 — 미체결 목록에서 접수 여부를 확인하세요';
    const directOrders = () => relay.requestLog().filter((m) => m === DMA_MSG.DirectOrderReq).length;
    // 이동 전에 relay(:8090) 소켓을 세기 시작한다 — 수가 1 이면 새로고침이 아니었다(Provider 가 산다).
    const relaySockets: string[] = [];
    page.on('websocket', (ws) => {
      if (ws.url().includes(':8090')) relaySockets.push(ws.url());
    });
    // 작업대 이탈 경고(더티 카드)는 브라우저 confirm 이다 — 수락해도 client-side 이동 그대로다.
    page.on('dialog', (d) => void d.accept());
    // 종목상세가 붙는 API — 오류 상태여도 단언은 성립하지만 소음을 줄인다(orderbook.spec 형식).
    await mockNewsApi(page, { code: '005930', list: buildNewsList('005930', 3) });
    await mockDiscussionsApi(page, { code: '005930', list: buildDiscussionList('005930', 3) });
    await mockThemeChips(page, []);

    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(0);

    // 종목 추가로 카드 → 수동주문 → 매수 → 확인 → 무응답 → 「결과 모름」.
    await addStockByKeyboard(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    let card = cardOf(page, E2E_ISIN);
    await card.getByRole('button', { name: '수동주문', exact: true }).click();
    let form = card.getByTestId('manual-order-form');
    await expect(form).toBeVisible();
    await form.locator(`#mo-price-${E2E_ISIN}`).fill('98000');
    await form.locator(`#mo-qty-${E2E_ISIN}`).fill('10');
    const buy = form.getByTestId('manual-order-buttons').getByRole('button', { name: '매수' });
    await expect(buy).toBeEnabled();
    await buy.click();
    const confirm = page.getByTestId('order-confirm-dialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /매수/ }).click();
    await expect.poll(directOrders, { timeout: 15_000 }).toBe(1);
    await expect(form.getByTestId('manual-order-result')).toHaveAttribute('data-kind', 'unknown', {
      timeout: 15_000,
    });

    // 사이드바 「My page」 → /me (client-side — relay 소켓은 여전히 1개).
    const nav = page.locator('aside nav[aria-label="주 메뉴"]');
    await nav.getByRole('link', { name: 'My page', exact: true }).click();
    await expect(page).toHaveURL(/\/me(?:\?.*)?$/);
    expect(relaySockets).toHaveLength(1);

    // 사이드바 「트레이딩」 → /trading → 배치 기억으로 카드가 그대로 있다(quick-260923-lyt) →
    // 같은 종목 다시 추가해도 카드는 1장(펼침만) → 잠긴 채.
    await nav.getByRole('link', { name: '트레이딩', exact: true }).click();
    await expect(page).toHaveURL(/\/trading(?:\?.*)?$/);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(1);
    await addStockByKeyboard(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    card = cardOf(page, E2E_ISIN);
    await card.getByRole('button', { name: '수동주문', exact: true }).click();
    form = card.getByTestId('manual-order-form');
    await expect(form).toBeVisible();
    const cardButtons = form.getByTestId('manual-order-buttons').getByRole('button');
    await expect(cardButtons).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) await expect(cardButtons.nth(i)).toBeDisabled();
    await expect(form.getByTestId('manual-order-locked')).toHaveText(LOCKED_TEXT);
    await expect(form).not.toContainText('실패');

    // ✕ → 결과 모름 다이얼로그 · 새 본문 → 「취소」(카드는 남는다).
    await card.getByRole('button', { name: /카드 닫기$/ }).click();
    const ask = page.getByTestId('workbench-close-confirm');
    await expect(ask).toHaveAttribute('data-reason', 'unknown');
    await expect(ask).toContainText('다른 화면에 다녀와도');
    await expect(ask).toContainText('로그아웃하거나 새로고침하면 풀려요.');
    await ask.getByRole('button', { name: '취소', exact: true }).click();
    await expect(ask).toBeHidden();

    // 헤더 「종목 검색 열기」 → 삼성전자 → /stocks/005930 (client-side) → 「호가주문」 탭.
    await page.getByLabel('종목 검색 열기').first().click();
    const search = page.getByRole('dialog').getByPlaceholder('종목명 또는 종목코드를 입력하세요');
    await search.fill('삼성');
    await page.getByRole('option', { name: /삼성전자/ }).click();
    await expect(page).toHaveURL(/\/stocks\/005930(?:\?.*)?$/);
    await page.getByRole('tab', { name: '호가주문' }).click();
    const obStatus = page.locator('[data-slot="orderbook-status-bar"]');
    await expect(obStatus).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    const obForm = page.getByTestId('manual-order-form');
    if (!(await obForm.isVisible())) {
      await page.locator('[data-slot="manual-entry"]').getByRole('button', { name: '수동주문' }).click();
    }
    await expect(obForm).toBeVisible();
    const obButtons = obForm.getByTestId('manual-order-buttons').getByRole('button');
    await expect(obButtons).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) await expect(obButtons.nth(i)).toBeDisabled();
    await expect(obForm.getByTestId('manual-order-locked')).toHaveText(LOCKED_TEXT);
    await expect(obForm).not.toContainText('실패');
    expect(relaySockets).toHaveLength(1);

    // ★ 같은 주문이 다시 나가지 않았다 — 게이트웨이 주문 1건 · DB 기록 0건(D-01).
    expect(directOrders()).toBe(1);
    expect(relay.orderInserts()).toHaveLength(0);

    // 새로고침 = Provider 재생성 → 잠금 해제(사용자 결정 1 의 해제 규칙). 소켓이 새로 열린다.
    await page.reload();
    await expect(obStatus).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    const reloadedForm = page.getByTestId('manual-order-form');
    if (!(await reloadedForm.isVisible())) {
      await page.locator('[data-slot="manual-entry"]').getByRole('button', { name: '수동주문' }).click();
    }
    await expect(reloadedForm).toBeVisible();
    await expect(reloadedForm.getByTestId('manual-order-locked')).toHaveCount(0);
    await expect(
      reloadedForm.getByTestId('manual-order-buttons').getByRole('button', { name: '매수' }),
    ).toBeEnabled();
    expect(relaySockets).toHaveLength(2);
    expect(directOrders()).toBe(1);
  });

  test('GC8 주문 체결 통보 → 우하단 토스트 → 클릭 → 카드 펼침 + 「미체결」 탭 + 헤더 표시 해제 (quick-260923-pgu · 목업 ③A)', async ({
    page,
  }) => {
    const orderNo = '0000000777';
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    // 알림 live 영역은 알림이 없어도 먼저 서 있어야 낭독된다.
    const toastBox = page.locator('[data-slot="alert-toasts"]');
    await expect(toastBox).toHaveAttribute('role', 'status');
    await expect(toastBox).toHaveAttribute('aria-live', 'polite');

    // 주문번호 색인의 원천 — 계좌 상태의 미체결 행(relay 리듀서가 원시 프레임에서 색인한다).
    await relay.pushAccountState({
      unfilled: [
        {
          orderNo,
          isin: E2E_ISIN,
          side: 'B',
          price: 98_000,
          orderQty: 500,
          filledQty: 0,
          unfilledQty: 500,
          exchange: 'KRX',
        },
      ],
    });

    // 그 종목 카드를 세우고 접는다 — 다른 카드를 보고 있어도 이벤트를 놓치지 않는 상황.
    await addStockByKeyboard(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await toggleOf(page, E2E_ISIN).click();
    await expect(card).toHaveAttribute('data-open', 'false');
    await expect(card).toHaveAttribute('data-alert', 'false');

    await relay.pushOrderResp({
      orderNo,
      noticeType: 'E',
      isin: E2E_ISIN,
      side: 'B',
      price: 98_000,
      quantity: 100,
      exchange: 'KRX',
      requestKind: 'New',
    });

    const toast = page.locator('[data-slot="alert-toast"][data-kind="fill"]');
    await expect(toast).toBeVisible({ timeout: 15_000 });
    await expect(toast).toContainText('체결');
    await expect(toast).toContainText('100/500주');
    await expect(card).toHaveAttribute('data-alert', 'true');
    // 뷰포트 오버레이 — 데스크톱은 우하단.
    const box = await toast.boundingBox();
    const vp = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeGreaterThan(vp.width - 40);
    expect(box!.y + box!.height).toBeGreaterThan(vp.height - 40);

    await toast.locator('[data-part="text"]').click();
    await expect(card).toHaveAttribute('data-open', 'true');
    await expect(
      card.locator('[data-slot="card-tabs"] [role="tab"][data-state="active"]'),
    ).toContainText('미체결');
    await expect(card).toHaveAttribute('data-alert', 'false');
    await expect(page.locator('[data-slot="alert-toast"]')).toHaveCount(0);
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
    await expect(leds.nth(0)).toContainText('감시');
    await expect(leds.nth(0)).not.toContainText('매도잔량');
    await expect(cardOf(page, E2E_ISIN)).not.toContainText('매수 ON');
  });

  test('12. 값 확정 → 게이트웨이 10 즉시 수신(더티 바·「수정」 없음) → 60 에코 → 행 값 · 반영 시각 (옛 LC 4 · D-04 재정의)', async ({
    page,
  }) => {
    /*
      옛 12 는 「값 변경 → 더티 바 → 수정 → 10」 두 단계였다. D-04 로 확정 1회 = 전송 1회가 됐다 —
      같은 왕복(10 수신 → 60 에코 → 화면 값 · 반영 시각)을 한 단계로 다시 잰다. 반영의 유일한 증거는
      여전히 에코다(행 값은 에코 전에는 바뀌지 않는다 · D-06).
    */
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);
    const sets = () => relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    const before = sets();

    await editLc(page, 'lc-buy-watch-qty', '8000');
    await waitForSetAtGateway(relay, before + 1);
    // 확정 한 번 = 전송 한 번 — 재전송 없음(T-16-10). 중간 단계(더티 바 · 「수정」)가 없다.
    expect(sets()).toBe(before + 1);
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);
    await expect(card.getByRole('button', { name: '수정', exact: true })).toHaveCount(0);
    await expect(card.getByRole('button', { name: '되돌리기', exact: true })).toHaveCount(0);

    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 8_000 });

    // 에코 → 행 값 · 상태줄 반영 시각.
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주', { timeout: 15_000 });
    await expect(statusBar(page).getByTestId('stat-applied')).toHaveText(/^반영 \d{2}:\d{2}:\d{2}$/);
    await expect(statusBar(page).getByTestId('stat-applied')).toHaveAttribute('title', '서버 반영 시각');
    expect(sets()).toBe(before + 1);
    // 값 확정은 게이트를 건드리지 않는다 — 매수주문 스위치는 켜진 채다(값만 한 필드 바뀌었다).
    await expect(lcSwitch(card, '매수주문 켜기')).toBeChecked();
  });

  test('GC2 카드를 접었다 펴도 반영된 값이 그대로다 — 재마운트 없음 · 포커스는 헤더 토글 (WR-02 · D-09 · D-12 · D-04 재정의)', async ({
    page,
  }) => {
    /*
      옛 GC2 는 「미전송 값 + 더티 바가 접힘을 견딘다」였다. D-04 로 미전송 값이라는 상태가 사라졌다 —
      남는 성질은 **재마운트 없음**(WR-02)과 접힘·펼침 포커스다. 재마운트 없음은 폼 DOM 노드에 표식을
      달아 두고, 펼친 뒤 **같은 노드**인지로 증명한다(새로 그리면 표식이 없다).
    */
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    await expect(cards(page)).toHaveCount(1);

    const toggle = toggleOf(page, E2E_ISIN);
    const card = cardOf(page, E2E_ISIN);
    const stackCard = grid(page).locator(`[data-slot="card-stack"] ${cardSelector(E2E_ISIN)}`);
    const form = card.locator('[data-slot="limit-chaser-form"]');
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    await editLc(page, 'lc-buy-watch-qty', '8000');
    await waitForSetAtGateway(relay, before + 1);
    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 8_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주', { timeout: 15_000 });
    await form.evaluate((el) => {
      (el as HTMLElement).dataset.e2eMark = 'gc2';
    });

    // 접기 — 카드는 스택으로 가고 본문은 숨김으로 남는다(D-12).
    await toggle.click();
    await expect(card).toHaveAttribute('data-open', 'false');
    await expect(stackCard).toHaveCount(1);
    await expect(lcRow(page, 'lc-buy-watch-qty')).toBeHidden();
    // 포커스는 누른 헤더 토글로 돌아온다(UI-SPEC §접근성).
    await expect(toggle).toBeFocused();

    // 다시 펼치기 — 반영된 값이 그대로이고 폼은 **같은 DOM 노드**다(재마운트 없음 · WR-02).
    await toggle.click();
    await expect(card).toHaveAttribute('data-open', 'true');
    await expect(stackCard).toHaveCount(0);
    await expect(lcRow(page, 'lc-buy-watch-qty')).toBeVisible();
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주');
    await expect(form).toHaveAttribute('data-e2e-mark', 'gc2');
    await expect(toggle).toBeFocused();
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);
    // 접었다 펴는 동안 아무것도 나가지 않았다.
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(before + 1);
  });

  test('13. 인라인 편집 중 다른 단말 변경 — 입력 8,000 유지 · Esc 뒤 행 = 에코 「5,000주」 + 카드 6초 배너(role=status) 「다른 단말에서 변경됐어요 · 서버 값으로 맞췄어요」 + 공용 로그 1줄 (옛 LC 5 · D-07 재정의)', async ({
    page,
  }) => {
    /*
      옛 13 은 「에코가 더티를 덮는다」였다. D-07 은 편집 중인 버퍼가 **편집기의 것**이라 에코가 덮지 않는다
      (E4) — 행 값(폼)은 서버를 따르고, 편집을 버리면(Esc) 그 행은 에코 값을 보인다. 배너·로그 규율은 그대로다.
    */
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    await lcRow(page, 'lc-buy-watch-qty').click();
    const input = page.locator('#lc-buy-watch-qty');
    await expect(input).toBeFocused();
    await input.fill('8000');
    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 5_000 });

    const banner = cardOf(page, E2E_ISIN).locator('[data-slot="card-echo-banner"]');
    await expect(banner).toContainText('다른 단말에서 변경됐어요 · 서버 값으로 맞췄어요', { timeout: 15_000 });
    await expect(banner).toHaveAttribute('role', 'status');
    // 편집 중인 입력은 에코가 덮지 않는다 — 사용자가 치던 값이 그대로다.
    await expect(input).toHaveValue(/^8,?000$/);
    await expect(input).toBeFocused();

    // Esc = 편집 버림 → 행은 서버 값(에코).
    await input.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('5,000주');
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);
    // 버린 편집은 나가지 않았다.
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(before);

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
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주', { timeout: 15_000 });
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    await expect(page.getByRole('button', { name: /삭제/ })).toHaveCount(0);
    await lcSwitch(cardOf(page, E2E_ISIN), '매수주문 켜기').click();
    await waitForSetAtGateway(relay, before + 1);

    // 삭제 판정은 스위치가 아니라 서버 에코의 `crud` 다(Pitfall 7).
    await relay.pushLimitChaserEcho({ crud: 'D', buyEnabled: false, buyWatchQty: 8_000 });

    await expect(strategyItems(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('10,000주');
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

  test('16. 상따 설정은 즉시 반영이라 사이드바 이동 때 확인이 뜨지 않는다 — 대조군 + 적용 뒤 「홈」 이동 = 다이얼로그 0 (옛 LC 10 · D-04 재정의)', async ({
    page,
  }) => {
    /*
      옛 16 은 「더티 상태로 떠나면 확인이 뜬다」였다. D-04 로 떠날 때 잃을 미반영 값이 없다 — 값은 확정 즉시
      서버로 갔고 반영은 에코가 증명한다. 그래서 이제 계약은 반대다: 값을 바꾼 뒤에도 이동을 막지 않는다.
      (작업대 이탈 경고 배관 자체는 카드 `dirtyCount` 가 늘 0 이라 스스로 비활성이다 — 20-04.)
    */
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);

    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss(); // 뜨면 「머무른다」 — 그러면 아래 URL 단언이 실패로 드러낸다
    });
    // 대조군 — 아무것도 바꾸지 않았으면 이동이 막히지 않는다.
    await desktopNav(page).getByRole('link', { name: '홈' }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    expect(dialogs).toEqual([]);

    // 값을 확정하고(→ 10 → 에코) 곧장 떠난다 — 확인 없이 이동한다.
    await openFocusedCard(page);
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await editLc(page, 'lc-buy-watch-qty', '8000');
    await waitForSetAtGateway(relay, before + 1);
    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 8_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주', { timeout: 15_000 });
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);
    await desktopNav(page).getByRole('link', { name: '홈' }).click();

    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    expect(dialogs, '즉시 반영 모델에서는 이탈 확인이 없다').toEqual([]);
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

    // 매수 pane 은 204px 안에 행(라벨 ─ 값 ›)이 들어간다(잎 요소 좌표 판정 · Phase 20 리스트 행).
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

  test('20. VI 중지 상태 진입 — KRX 줄 서버값(1,000만원 · 22%) · 스위치 OFF · 발동 0건 (옛 VI 1 · D-05)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await openViPanel(page);

    await expect(field(page, 'vi-krx-amount')).toHaveValue('1,000', { timeout: 15_000 });
    await expect(field(page, 'vi-krx-rate')).toHaveValue('22');
    await expect(viRow(page)).toHaveAttribute('data-run', 'false');
    await expect(viRow(page).getByRole('switch', { name: 'VI KRX 시작' })).not.toBeChecked();
    // 계좌 비밀번호·종목·주문유형 UI 가 없다(B2).
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    // 더티 0 이면 「수정」이 렌더 자체가 없다(B4).
    await expect(viRow(page).locator('[data-slot="vi-row-fix"]')).toHaveCount(0);
    // VI 브라우저 알림 토글은 기능째 제거됐다(quick-260922-tqr).
    await expect(statusBar(page).locator('[data-slot="workbench-vi-alert-toggle"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="vi-chip"]')).toHaveCount(0);
    // 사이드바 VI 줄은 가동 거래소가 없어 없다.
    await expect(desktopNav(page).locator('[data-sidebar-item="vi"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="vi-trigger-strip"]')).toContainText('오늘 발동된 VI 주문이 없어요');
  });

  test('21. VI 값 변경 → 「수정」 → 11 수신, **run 이 유지되고** 금액은 원 단위 · 거래소는 줄의 것 (옛 VI 2 · D-07 · Pitfall 8)', async ({
    page,
  }) => {
    relay.seedViTrigger({ ...VI_CFG, run: true });
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await openViPanel(page);
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
    // 에코 뒤에도 가동이 유지된다 — 「수정」이 run 을 눕히지 않았다.
    await expect(viRow(page)).toHaveAttribute('data-run', 'true');
  });

  test('22. VI 「시작」 확인 — 요약에 현재 폼 금액·상승률 · 기본 포커스 취소 · 확정 시 run=true → 에코로 줄·사이드바가 함께 (옛 VI 3 · S-7 · T-16-10)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await openViPanel(page);
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
    await expect(viRow(page).getByRole('switch', { name: 'VI KRX 중지' })).toBeChecked();
    const sidebarVi = desktopNav(page).locator('[data-sidebar-item="vi"]');
    await expect(sidebarVi.locator('[data-slot="exchange-tag"][data-exchange="KRX"]')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(sidebarVi.locator('[data-slot="exchange-tag"][data-exchange="NXT"]')).toHaveCount(0);
  });

  test('23. VI 「중지」 확인 — 오늘 주문·미체결(유지) 요약 + 경고 · 기본 포커스 닫기 · run=false (옛 VI 4)', async ({
    page,
  }) => {
    relay.seedViTrigger({ ...VI_CFG, run: true });
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await openViPanel(page);
    const sw = viRow(page).getByRole('switch', { name: 'VI KRX 중지' });
    await expect(sw).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-slot="vi-chip"]')).toHaveCount(VI_ORDERS.length, {
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

  test('24. VI 발동 표 6건 — 상태 배지 6종 · 부분체결 파생 · 종목명 역매핑 · 잠긴 행 체크 비활성 · 110초 (옛 VI 5 · E3)', async ({
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

    // 펼친 VI 패널에 머리줄 요약·긴 설명문이 없다 — 체크의 의미는 체크박스 이름이 말한다.
    const panel = page.locator('[data-slot="vi-trigger"]');
    await expect(panel).not.toContainText('양 거래소 한 목록');
    await expect(panel).not.toContainText('ConfirmVIOrderReq');
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
    // 주문이 아직 없으므로 표는 없다 — 패널만 펼쳐 두면 아래 72 가 오는 순간 표가 선다.
    await openViPanel(page);

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
    await expect(viRow(page)).toHaveAttribute('data-run', 'true', { timeout: 15_000 });
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
    // 거래소당 한 줄 — 입력 28 · 스위치 26 이라 한 줄이면 40 미만, 두 줄로 접히면 56 이상이다.
    const krxBox = await viRow(page, 'KRX').boundingBox();
    const nxtBox = await viRow(page, 'NXT').boundingBox();
    expect(krxBox).not.toBeNull();
    expect(nxtBox).not.toBeNull();
    expect(krxBox!.height, 'KRX 줄 높이(한 줄)').toBeLessThan(40);
    expect(nxtBox!.height, 'NXT 줄 높이(한 줄)').toBeLessThan(40);
    // 폰 밴드(본문 <830)는 위아래로 쌓인다.
    expect(nxtBox!.y).toBeGreaterThanOrEqual(krxBox!.y + krxBox!.height);

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

    // 더티 「수정」 이 붙어도 설정 줄은 넘치지 않는다(자리가 모자라면 줄 안에서 접힌다 — D2).
    await field(page, 'vi-krx-rate').fill('25');
    await expect(viRow(page).locator('[data-slot="vi-row-fix"]')).toBeVisible();
    expect(await scrollOverflowing(page, '[data-slot="vi-settings-rows"]')).toEqual([]);
  });

  test('28b. 와이드 본문(뷰포트 1000 · 본문 ≈968) — VI KRX | NXT 한 줄 나란히 · 상태줄 핵심만 · 펼친 목록 머리줄 없음', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await openViPanel(page);
    await expect(field(page, 'vi-krx-amount')).toHaveValue('1,000', { timeout: 15_000 });

    // 본문 830 이상 — KRX 와 NXT 가 한 줄에 나란히(2열) 선다.
    const krxBox = await viRow(page, 'KRX').boundingBox();
    const nxtBox = await viRow(page, 'NXT').boundingBox();
    expect(krxBox).not.toBeNull();
    expect(nxtBox).not.toBeNull();
    expect(Math.abs(krxBox!.y - nxtBox!.y), 'KRX · NXT 줄 top 차이').toBeLessThanOrEqual(2);
    expect(krxBox!.height, 'KRX 줄 높이(한 줄)').toBeLessThan(40);
    expect(nxtBox!.height, 'NXT 줄 높이(한 줄)').toBeLessThan(40);
    expect(nxtBox!.x).toBeGreaterThan(krxBox!.x);
    expect(await scrollOverflowing(page, '[data-slot="vi-settings-rows"]')).toEqual([]);

    // 접힌 줄 라벨은 이름뿐이고, 상태줄은 핵심만 말한다.
    await expect(page.getByTestId('vi-strip-label')).toHaveText('VI');
    await expect(page.getByTestId('breakout-strip-label')).toHaveText('돌파');
    for (const word of ['VI 발동', '거래 종목', '임계']) {
      await expect(statusBar(page)).not.toContainText(word);
    }
  });

  /*
    ★ Phase 20 트레이서 — 「호가변경」 한 행이 **실제 경로 한 줄**을 끝까지 잇는다(20-01).
      진짜 브라우저 → 진짜 relay → 스텁 게이트웨이 10 수신 → 60 에코 → 행 값.
      `openFocusedCard` 를 쓰지 않는다 — 그 헬퍼는 옛 입력 id(`#lc-buy-watch-qty`)를 기다리고,
      20-04 가 옛 입력을 걷어도 이 케이스는 살아남아야 한다. 대신 값 행 자체의 텍스트를 기다린다.
  */
  test('P20-1 인라인 편집 한 행 — 「호가변경」 클릭 → 전체 선택 → 5 → Enter → 게이트웨이 10 수신 → 60 에코 → 행 「5건」 (Phase 20 D-04 · D-14 · D-14a)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });

    const row = page.locator('[data-lc-field="lc-sweep-tick"]');
    const value = row.locator('[data-slot="lc-row-value"]');
    await expect(value).toHaveText('3건', { timeout: 15_000 });
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    // 행 높이 44 — 편집 전후가 같아야 한다(D-14a · 레이아웃 이동 0).
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.height - 44)).toBeLessThanOrEqual(0.5);

    await row.click();
    const input = page.locator('#lc-sweep-tick');
    await expect(input).toBeFocused();
    // 들어가자마자 값 전체 선택(D-14c) — 첫 입력이 값을 덮는다.
    expect(
      await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, el.value.length]),
    ).toEqual([0, 1, 1]);
    const editBox = await page.locator('[data-lc-field="lc-sweep-tick"][data-editing="true"]').boundingBox();
    expect(editBox).not.toBeNull();
    expect(Math.abs(editBox!.height - 44)).toBeLessThanOrEqual(0.5);
    // 안내 문구·「저장」 버튼 없음(D-14a).
    await expect(page.locator('[data-slot="limit-chaser-form"]')).not.toContainText('Enter');
    await expect(page.getByRole('button', { name: '저장' })).toHaveCount(0);

    await page.keyboard.type('5');
    await page.keyboard.press('Enter');
    await waitForSetAtGateway(relay, before + 1);
    // 사용자가 한 번 눌렀으면 정확히 한 번 나간다 — 재전송 없음(T-16-10).
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(before + 1);

    await relay.pushLimitChaserEcho({ buyEnabled: true, sweepMinTickCount: 5 });
    await expect(value).toHaveText('5건', { timeout: 15_000 });
    await expect(page.locator('#lc-sweep-tick')).toHaveCount(0);
  });

  /*
    ★ Phase 20 P20-3 — 폭 불변식 백스톱(UI-SPEC 검증 훅 · UI Considerations E1 overflow · D-20 · D-14a).
      최악값(가격 7자리 1,274,000원 · 수량 100,000주 · 주문금액 9,999만원 · 잔량추적 기준선 100,000주)을
      에코로 심고, 카드 컨테이너를 본문 344 · 700 · 830 · 992 에 **정확히** 맞춰(`sizeCardTo`) 잰다.
      · 잘림 0 — 카드 전체 두 판정(`expectCardNotClipped`) + 우측 패널 scrollWidth ≤ clientWidth +
        **행마다** 가장 오른쪽 잎 요소가 행 안쪽 끝을 넘지 않는다(여유 px 를 주석으로 남긴다).
        폰 밴드 「잔량추적 기준선 | 100,000주」 는 20-04 가 L2 백스톱으로 +0.9px 를 만든 행이다 — 여기가
        그 얇은 여유의 실브라우저 단언이다.
      · 모든 리스트 행 44px(±0.5) · 인라인 편집 중인 행도 44px(레이아웃 이동 0).
      · 폰 밴드는 「매수」「매도」 탭을 각각 눌러 두 pane 을 모두 잰다(비활성 pane 은 display:none).
      · 본문 344 수동주문 — 「예약매수」「예약매도」 48px · 「정정」「취소」 38px 라벨이 잘리지 않는다
        (20-06 이 human_judgment 로 남긴 항목). 예약창(77 open)을 밀어 최악 라벨로 잰다.
      · ≥700 2열 — 기준선 행이 없으면 매수주문 · 매도주문 그룹 높이가 같다(행 44 · 상태 한 줄).
  */
  test('P20-3 최악값 × 본문 344 · 700 · 830 · 992 — 우측 패널 잘림 0 · 행 44px(편집 전후) · ≥700 매수주문/매도주문 그룹 높이 동일 (D-20 · UI-SPEC 검증 훅)', async ({
    page,
  }) => {
    const WORST = {
      buyEnabled: true,
      sellEnabled: true,
      buyOrderPrice: 1_274_000,
      buyWatchPrice: 1_274_000,
      sweepWatchPrice: 1_274_000,
      sellOrderPrice: 1_274_000,
      sellWatchPrice: 1_274_000,
      buyOrderAmount: 9_999,
      buyWatchQty: 100_000,
      sellWatchQty: 100_000,
      cancelWatchQty: 100_000,
      buyMinTradeQty: 100_000,
      sellMinTradeQty: 100_000,
      sellEntryLatched: true,
      sellQtyTrackBaseline: 100_000,
    };
    relay.seedLimitChasers([WORST]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('100,000주', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-order-price')).toHaveText('1,274,000원');
    await expect(lcValue(page, 'lc-buy-order-amount')).toHaveText('9,999만원');
    // 최악값 시드는 매수·매도 두 게이트가 켜진 상태다 — 흐림(opacity .45) 없이 가장 짙은 글자로 잰다.
    await expect(lcSwitch(card, '매수주문 켜기')).toBeChecked();
    await expect(lcSwitch(card, '매도주문 켜기')).toBeChecked();

    /** 보이는 리스트 행 전부 — 값 행 · 체크 행 · 감시대상 행 · 기준선 행. 높이와 행 안쪽 여유. */
    const measureRows = () =>
      card.evaluate((root) =>
        Array.from(
          root.querySelectorAll<HTMLElement>(
            '[data-lc-field], [data-slot="lc-check-row"], [data-slot="lc-watch-row"], [data-slot="lc-derived"]',
          ),
        )
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const inner = r.right - parseFloat(cs.paddingRight);
            let right = r.left;
            for (const leaf of Array.from(el.querySelectorAll<HTMLElement>('*'))) {
              const lr = leaf.getBoundingClientRect();
              if (leaf.getClientRects().length === 0 || lr.width === 0) continue;
              right = Math.max(right, lr.right);
            }
            /*
              진짜 여유 = 행 안쪽 폭 − 직계 자식들의 **내용** 폭 합 − 자식 사이 간격. justify-between 이라
              오른쪽 끝 여유(slack)는 들어갈 때 늘 0 이다 — 얼마나 남았는지는 이 값이 말한다.
            */
            const kids = Array.from(el.children).filter((c) => c.getClientRects().length > 0);
            const contentW = kids.reduce((sum, c) => {
              const range = document.createRange();
              range.selectNodeContents(c);
              return sum + range.getBoundingClientRect().width;
            }, 0);
            const gap = parseFloat(cs.columnGap) || 0;
            const innerW = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            return {
              what: el.getAttribute('data-lc-field') ?? el.getAttribute('data-slot') ?? '?',
              text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24),
              h: Math.round(r.height * 100) / 100,
              slack: Math.round((inner - right) * 10) / 10,
              free: Math.round((innerW - contentW - gap * Math.max(0, kids.length - 1)) * 10) / 10,
              pieces: kids.length,
            };
          }),
      );

    const minFree: Record<string, { what: string; free: number }> = {};
    const expectRows = async (label: string, mustInclude: string[]) => {
      const rows = await measureRows();
      const whats = rows.map((r) => r.what);
      for (const w of mustInclude) expect(whats, `${label} — ${w} 행이 보여야 한다`).toContain(w);
      expect(
        rows.filter((r) => Math.abs(r.h - 44) > 0.5),
        `${label} — 44px 이 아닌 행`,
      ).toEqual([]);
      expect(
        rows.filter((r) => r.slack < -0.5),
        `${label} — 행 안쪽 끝을 넘은 잎 요소(잘림)`,
      ).toEqual([]);
      // 여유는 「라벨 ─ 값」 두 조각 이상인 행만 잰다 — 감시대상(풀폭 토글 · D-02a) · 체크 전용 행 ·
      // 체크 행 안의 값 버튼(한 조각)은 늘 0 이라 뺀다. 그 잘림은 위 두 판정이 본다.
      const measurable = rows.filter((r) => r.pieces >= 2);
      expect(
        measurable.filter((r) => r.free < -0.5),
        `${label} — 라벨 + 값이 행 안쪽 폭을 넘는 행`,
      ).toEqual([]);
      const worst = measurable.reduce((a, b) => (b.free < a.free ? b : a));
      const key = label.split(' ')[0]!;
      const prev = minFree[key];
      if (prev === undefined || worst.free < prev.free) {
        minFree[key] = { what: `${worst.what}「${worst.text}」`, free: worst.free };
      }
    };
    const expectOptionsNoScroll = async (label: string) => {
      const over = await card
        .locator('[data-slot="card-body-options"]')
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over, `${label} — 우측 패널 scrollWidth ≤ clientWidth`).toBeLessThanOrEqual(0);
    };
    /** 잔량 행을 인라인 편집으로 연 상태도 44px — 편집 전후 레이아웃 이동 0(D-14a). */
    const expectEditingRow44 = async (label: string) => {
      await lcRow(page, 'lc-buy-watch-qty').click();
      const editing = page.locator('[data-lc-field="lc-buy-watch-qty"][data-editing="true"]');
      await expect(page.locator('#lc-buy-watch-qty')).toBeFocused();
      const box = await editing.boundingBox();
      expect(box, `${label} — 편집 중 행을 잴 수 없다`).not.toBeNull();
      expect(Math.abs(box!.height - 44), `${label} — 편집 중 행 높이 ${box!.height}`).toBeLessThanOrEqual(0.5);
      expect(await scrollOverflowing(page, cardSelector(E2E_ISIN)), `${label} — 편집 중 넘침`).toEqual([]);
      await page.locator('#lc-buy-watch-qty').press('Escape');
      await expect(page.locator('#lc-buy-watch-qty')).toHaveCount(0);
    };

    const BUY_ROWS = ['lc-buy-order-price', 'lc-buy-order-amount', 'lc-buy-watch-qty', 'lc-watch-row', 'lc-sweep-watch-price'];
    const SELL_ROWS = ['lc-sell-order-price', 'lc-sell-watch-qty', 'lc-derived', 'lc-cancel-watch-qty'];
    const setsBefore = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    for (const target of [344, 700, 830, 992]) {
      await sizeCardTo(page, E2E_ISIN, target);
      const { band } = await cardMetrics(page, E2E_ISIN);
      expect(band, `카드 ${target} — 기대 밴드`).toBe(bandOfWidth(target));
      const label = `${target} 카드`;

      if (target < 700) {
        // 폰 밴드 — 탭당 한 pane. 두 pane 을 각각 편다.
        const tablist = card.getByRole('tablist', { name: '주문 진입' });
        await tablist.getByRole('tab', { name: '매수' }).click();
        await expect(card.locator('[data-pane="buy"]')).toBeVisible();
        await expectCardNotClipped(page, E2E_ISIN, `${label} · 매수 pane`);
        await expectOptionsNoScroll(`${label} · 매수 pane`);
        await expectRows(`${target} 매수 pane`, BUY_ROWS);
        await expectEditingRow44(`${label} · 매수 pane`);

        await tablist.getByRole('tab', { name: '매도' }).click();
        await expect(card.locator('[data-pane="sell"]')).toBeVisible();
        await expectCardNotClipped(page, E2E_ISIN, `${label} · 매도 pane`);
        await expectOptionsNoScroll(`${label} · 매도 pane`);
        await expectRows(`${target} 매도 pane`, SELL_ROWS);
        await expect(card.locator('[data-slot="lc-derived"]')).toContainText('100,000주');

        // 수동주문 — 예약창(77 open)이면 「예약매수」「예약매도」 + 조각 수 상자까지 선다(최악 라벨).
        const sock = await relay.gateway.waitForConnection(15_000);
        relay.gateway.sendQueuedWindowState(sock, { open: true, maxPieces: 5 });
        await tablist.getByRole('tab', { name: '수동' }).click();
        const form = card.getByTestId('manual-order-form');
        await expect(form).toBeVisible();
        const buttons = form.getByTestId('manual-order-buttons').getByRole('button');
        await expect(buttons).toHaveCount(4);
        // 폰 밴드는 「예약」이 윗줄 block 이라 접근성 이름이 「예약 매수」로 계산된다(18-07 SideLabel ·
        // deferred-items 기록) — 여기서 재는 것은 라벨 잘림이라 글자만 본다.
        await expect(buttons.nth(0)).toHaveAccessibleName(/^예약\s?매수$/, { timeout: 15_000 });
        await expect(buttons.nth(1)).toHaveAccessibleName(/^예약\s?매도$/);
        const clipped = await form.getByTestId('manual-order-buttons').evaluate((el) =>
          Array.from(el.querySelectorAll<HTMLButtonElement>('button')).map((b) => ({
            text: (b.textContent ?? '').trim(),
            h: Math.round(b.getBoundingClientRect().height),
            overX: b.scrollWidth - b.clientWidth,
            overY: b.scrollHeight - b.clientHeight,
          })),
        );
        expect(clipped.map((b) => b.h), `${label} — 수동주문 버튼 높이 48 · 48 · 38 · 38`).toEqual([48, 48, 38, 38]);
        expect(
          clipped.filter((b) => b.overX > 0 || b.overY > 0),
          `${label} — 수동주문 버튼 라벨 잘림(overflow-hidden 안에서 넘친 글자)`,
        ).toEqual([]);
        await expectCardNotClipped(page, E2E_ISIN, `${label} · 수동 pane`);
        relay.gateway.sendQueuedWindowState(sock, { open: false, maxPieces: 5 });
        await expect(buttons.nth(0)).toHaveAccessibleName('매수', { timeout: 15_000 });
        await tablist.getByRole('tab', { name: '매수' }).click();
      } else {
        // 2열 — 두 pane 이 함께 보인다.
        await expect(card.locator('[data-pane="buy"]')).toBeVisible();
        await expect(card.locator('[data-pane="sell"]')).toBeVisible();
        await expectCardNotClipped(page, E2E_ISIN, label);
        await expectOptionsNoScroll(label);
        await expectRows(`${target} 2열`, [...BUY_ROWS, ...SELL_ROWS]);
        await expectEditingRow44(label);
      }
    }
    // 재는 동안 아무것도 나가지 않았다(편집은 전부 Esc 로 버렸다).
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(setsBefore);
    test.info().annotations.push({
      type: 'P20-3 행 최소 여유(px)',
      description: Object.entries(minFree)
        .map(([k, v]) => `${k}: ${v.free} (${v.what})`)
        .join(' · '),
    });

    // ≥700 — 기준선 행이 없으면(매도 진입 미래치) 매수주문 · 매도주문 그룹 높이가 같다.
    relay.seedLimitChasers([{ ...WORST, sellEntryLatched: false }]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('100,000주', { timeout: 15_000 });
    await expect(card.locator('[data-slot="lc-derived"]')).toHaveCount(0);
    for (const target of [700, 830, 992]) {
      await sizeCardTo(page, E2E_ISIN, target);
      const buyH = await card.locator('[data-slot="lc-group-buy"]').evaluate((el) => el.getBoundingClientRect().height);
      const sellH = await card.locator('[data-slot="lc-group-sell"]').evaluate((el) => el.getBoundingClientRect().height);
      expect(Math.abs(buyH - sellH), `카드 ${target} — 매수주문 ${buyH} vs 매도주문 ${sellH}`).toBeLessThanOrEqual(0.5);
      // 상태 문구는 한 줄 — 헤더 높이가 두 그룹 같다(둘째 줄로 내려가면 여기서 갈린다).
      const heads = await card
        .locator('[data-slot="lc-group-buy"] [data-slot="lc-group-header"], [data-slot="lc-group-sell"] [data-slot="lc-group-header"]')
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10));
      expect(heads, `카드 ${target} — 두 그룹 헤더`).toHaveLength(2);
      expect(Math.abs(heads[0]! - heads[1]!), `카드 ${target} — 헤더 높이 ${heads.join(' / ')}`).toBeLessThanOrEqual(0.5);
    }
  });

  /*
    ★ quick-260922-tqr — iOS Safari 는 16px 미만 입력에 포커스하면 확대하고 되돌리지 않는다.
      종목 추가란은 터치 기기에서 16px 다. iPhone **가로** 폭(844)으로 재는 이유: 폭 브레이크포인트
      (`sm`·`md`)를 넘는 폭에서도 16px 여야 가로 모드에서 다시 확대되지 않는다.
      relay 픽스처가 이 describe 의 beforeAll/beforeEach 에 있어 반드시 안쪽에 둔다.
  */
  test.describe('종목 추가란 글꼴 — 터치 기기 (quick-260922-tqr)', () => {
    test.use({ hasTouch: true, viewport: { width: 844, height: 390 } });

    test('터치 기기 · iPhone 가로 폭 844 에서 종목 추가 입력이 16px 다', async ({ page }) => {
      // 바깥 beforeEach 가 WIDE_VIEWPORT 로 덮으므로 여기서 iPhone 가로 폭으로 되돌린다.
      await page.setViewportSize({ width: 844, height: 390 });
      await page.goto(WORKBENCH_URL);
      await waitForReady(page);
      await expect(addBox(page)).toHaveCSS('font-size', '16px');
    });
  });

  /*
    ★ Phase 20 트레이서 확장(20-03) — **터치 기기**에서 같은 한 행이 키패드 시트로 끝까지 잇는다.
      `hasTouch` 컨텍스트는 `(pointer: coarse)` 가 참이다(RESEARCH Q1 실측) → `useEditMode` = sheet.
      시트 기하(D-13): 폭 min(440, 100vw − 20) 가운데 · 하단 ≥10 · radius 28 · body 포털(카드 밖).
      relay 픽스처가 바깥 describe 의 beforeAll/beforeEach 에 있어 반드시 안쪽에 둔다.
  */
  test.describe('Phase 20 — 터치 기기 시트 (D-12 · D-13)', () => {
    test.use({ hasTouch: true });

    /**
     * 빈 값 디스플레이 — 단위 글자가 캐럿 **옆 같은 줄**에 선다(20-07 시각 확인에서 「원」이 캐럿 위로 뜬
     * 결함을 고쳤다 · 기준선 받침). 캐럿 오른쪽에 있고 세로 중심 차가 8px 미만이다.
     */
    async function expectUnitBesideCaret(sheet: Locator, label: string) {
      const g = await sheet.locator('[data-slot="numpad-display"]').evaluate((out) => {
        const caret = out.querySelector('[data-slot="numpad-value"]')!.nextElementSibling!.getBoundingClientRect();
        const unit = out.lastElementChild!.getBoundingClientRect();
        return {
          dy: Math.abs(caret.top + caret.height / 2 - (unit.top + unit.height / 2)),
          dx: unit.left - caret.right,
        };
      });
      expect(g.dy, `${label} — 단위와 캐럿의 세로 중심 차`).toBeLessThan(8);
      expect(g.dx, `${label} — 단위는 캐럿 오른쪽`).toBeGreaterThanOrEqual(-1);
    }

    /** 등장 애니메이션(250ms slide)이 끝나야 bounding box 가 최종 자리다. */
    async function settledSheet(page: Page) {
      const sheet = page.locator('[data-slot="numpad-sheet"]');
      await expect(sheet).toBeVisible({ timeout: 10_000 });
      await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      return sheet;
    }

    test('P20-2 터치 기기 — 「호가변경」 탭 → 시트(뷰포트 390 폭 370 · 768 폭 440 가운데 · radius 28 · 하단 ≥10 · body 직속) → 5 → 「호가변경 적용」 → 게이트웨이 10 수신 → 60 에코 → 시트 닫힘 · 행 「5건」 · 가로 폰 내부 스크롤', async ({
      page,
    }) => {
      // 바깥 beforeEach 가 WIDE_VIEWPORT 로 덮으므로 여기서 폰 폭으로 되돌린다.
      await page.setViewportSize({ width: 390, height: 844 });
      relay.seedLimitChasers([{ buyEnabled: true }]);
      await page.goto(FOCUS_URL);
      await waitForReady(page);
      await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });

      const row = page.locator('[data-lc-field="lc-sweep-tick"]');
      const value = row.locator('[data-slot="lc-row-value"]');
      await expect(value).toHaveText('3건', { timeout: 15_000 });
      await expect(row).toHaveAttribute('aria-haspopup', 'dialog');
      const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

      await row.tap();
      // 인라인 입력칸은 생기지 않는다 — 터치 기기는 시트다.
      await expect(page.locator('#lc-sweep-tick')).toHaveCount(0);
      const sheet = await settledSheet(page);
      await expect(sheet).toHaveAttribute('role', 'dialog');
      await expect(sheet).toHaveAttribute('aria-modal', 'true');

      // 기하(D-13) — 폰은 좌우 10px 전폭.
      const box = await sheet.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.abs(box!.width - 370)).toBeLessThanOrEqual(1);
      expect(Math.abs(box!.x - 10)).toBeLessThanOrEqual(1);
      const innerHeight = await page.evaluate(() => window.innerHeight);
      expect(innerHeight - (box!.y + box!.height)).toBeGreaterThanOrEqual(10 - 0.5);
      await expect(sheet).toHaveCSS('border-top-left-radius', '28px');
      // body 포털 — 카드(`container-type` 조상) 밖이다.
      expect(await sheet.evaluate((el) => el.closest('[data-slot="strategy-card"]') === null)).toBe(true);

      const pad = sheet.getByRole('group', { name: '숫자 키패드' });
      await pad.getByRole('button', { name: '5', exact: true }).tap();
      await expect(sheet.locator('[data-slot="numpad-value"]')).toHaveText('5');
      await sheet.getByRole('button', { name: '호가변경 적용' }).tap();

      await waitForSetAtGateway(relay, before + 1);
      // 한 번 눌렀으면 정확히 한 번 — 재전송 없음(T-16-10).
      expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(before + 1);

      await relay.pushLimitChaserEcho({ buyEnabled: true, sweepMinTickCount: 5 });
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 15_000 });
      await expect(value).toHaveText('5건', { timeout: 15_000 });

      // 넓은 터치 화면(768) — 440 가운데. 폭 분기 규칙 없이 min() 한 식이 정한다.
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(row).toBeVisible();
      await row.tap();
      const wide = await settledSheet(page);
      const wideBox = await wide.boundingBox();
      expect(wideBox).not.toBeNull();
      expect(Math.abs(wideBox!.width - 440)).toBeLessThanOrEqual(1);
      expect(Math.abs(wideBox!.x - (768 - 440) / 2)).toBeLessThanOrEqual(1);
      await wide.getByRole('button', { name: '닫기' }).tap();
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 10_000 });

      // 가로 모드 폰(높이 390) — 시트는 max-height calc(100dvh − 20px) 안에서 내부 스크롤되고
      // 「호가변경 적용」 까지 닿는다(UI Considerations 추가 행 · 시트 높이 backstop).
      await page.setViewportSize({ width: 844, height: 390 });
      await row.tap();
      const land = await settledSheet(page);
      const landBox = await land.boundingBox();
      expect(landBox).not.toBeNull();
      expect(landBox!.height).toBeLessThanOrEqual(390 - 20 + 0.5);
      expect(await land.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const apply = land.getByRole('button', { name: '호가변경 적용' });
      await apply.scrollIntoViewIfNeeded();
      await expect(apply).toBeInViewport();
      await land.getByRole('button', { name: '닫기' }).tap();
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 10_000 });
      expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(before + 1);
    });

    /*
      P20-4 — 원 단위 시트의 칩과 D-15 잠금을 실브라우저로 잇는다. 시드는 매수주문 켜짐 + 기본 매도잔량
      기준이라 매수주문 상태가 「감시 중」이다 → 가격 섹션(매수가격)은 그 상태를 따르므로(`statusKey`)
      시트에 「감시 중 — 적용하면 바로 반영돼요」가 선다(D-05 · 추가 확인 없음).
      ★ 칩은 버퍼의 fresh 를 끈다(`applyPadChip`) — 「첫 키가 값을 덮는다」는 시트를 연 직후에만 성립하므로
        키 입력 검증(98150 · 127450)을 칩보다 먼저 한다.
    */
    test('P20-4 매수가격 시트 — 칩 현재가·상한가·±1호가 · D-15 잠금(호가 단위 · 상한가) · 감시 중 안내 · 적용 → 10 → 에코 → 닫힘 (D-12 · D-15 · D-17 · D-05)', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      relay.seedLimitChasers([{ buyEnabled: true }]);
      await page.goto(FOCUS_URL);
      await waitForReady(page);
      await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });

      const row = lcRow(page, 'lc-buy-order-price');
      await expect(lcValue(page, 'lc-buy-order-price')).toHaveText('71,000원', { timeout: 15_000 });
      await expect(row).toHaveAttribute('aria-haspopup', 'dialog');
      const sets = () => relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
      const before = sets();

      await row.tap();
      await expect(page.locator('#lc-buy-order-price')).toHaveCount(0);
      const sheet = await settledSheet(page);
      await expect(sheet).toHaveAccessibleName('매수가격');
      const status = sheet.locator('[data-slot="numpad-status"]');
      const alert = status.getByRole('alert');
      const display = sheet.locator('[data-slot="numpad-value"]');
      const apply = sheet.getByRole('button', { name: '매수가격 적용' });
      const pad = sheet.getByRole('group', { name: '숫자 키패드' });
      const typeKeys = async (digits: string) => {
        for (const d of digits) await pad.getByRole('button', { name: d, exact: true }).tap();
      };
      const chip = (name: string) => sheet.locator('[data-slot="numpad-chips"]').getByRole('button', { name, exact: true });

      // 감시 중 안내(D-05) — 추가 확인은 없고 한 줄뿐이다.
      await expect(status).toHaveText('감시 중 — 적용하면 바로 반영돼요');
      await expect(display).toHaveText('71,000');

      // 첫 키가 값을 덮는다(fresh) → 98,150 은 100원 단위 위반 → 적용 잠금 · 보정 없음(D-15).
      await typeKeys('98150');
      await expect(display).toHaveText('98,150');
      await expect(alert).toHaveText('100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200');
      await expect(apply).toBeDisabled();

      // ⌫ 로 지우고 127450 → 상한가 초과 → 잠금.
      for (let i = 0; i < 5; i += 1) await pad.getByRole('button', { name: '한 글자 지우기' }).tap();
      await expect(display).toHaveText('');
      await expectUnitBesideCaret(sheet, '매수가격 · 다 지운 뒤');
      await typeKeys('127450');
      await expect(display).toHaveText('127,450');
      await expect(alert).toHaveText('상한가 127,400원을 넘을 수 없어요');
      await expect(apply).toBeDisabled();

      // 칩 — 같은 카드 시세(현재가 98,100 · 상한가 127,400)와 한 호가(100원 구간).
      await chip('현재가').tap();
      await expect(display).toHaveText('98,100');
      await expect(alert).toHaveCount(0);
      await chip('상한가').tap();
      await expect(display).toHaveText('127,400');
      await chip('1호가 내리기').tap();
      await expect(display).toHaveText('127,300');
      await chip('1호가 올리기').tap();
      await expect(display).toHaveText('127,400');
      // 서버 값(71,000)과 다른 값을 적용한다 — 127,300 으로 내려 적용해 에코 값과 구분한다.
      await chip('1호가 내리기').tap();
      await expect(display).toHaveText('127,300');
      await expect(status).toHaveText('감시 중 — 적용하면 바로 반영돼요');
      await expect(apply).toBeEnabled();
      expect(sets(), '시트 안의 키·칩은 아무것도 보내지 않는다').toBe(before);

      await apply.tap();
      await waitForSetAtGateway(relay, before + 1);
      // 한 번 눌렀으면 정확히 한 번(T-16-10).
      expect(sets()).toBe(before + 1);
      await relay.pushLimitChaserEcho({ buyEnabled: true, buyOrderPrice: 127_300 });
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 15_000 });
      await expect(lcValue(page, 'lc-buy-order-price')).toHaveText('127,300원', { timeout: 15_000 });
      // 닫히면 연 행으로 포커스가 돌아온다(UI-SPEC 접근성 계약).
      await expect(row).toBeFocused();
    });

    /*
      P20-5 — 수동주문 시트는 **값만 채운다**(D-10 · T-20-09). 시트 「가격 입력」「수량 입력」은 상자 값만
      바꾸고 닫힌다 — 게이트웨이 주문(DirectOrderReq)은 0 이다. 주문이 시작되는 길은 「매수」 → 확인
      다이얼로그 하나뿐이고, 다이얼로그를 취소하면 여전히 0 이다.
    */
    test('P20-5 수동주문 시트는 값만 채운다 — 가격·수량 상자 탭 → 시트 → 「입력」 뒤 주문 0 · 주문은 「매수」 → 확인 다이얼로그로만 (D-10 · T-20-09)', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      relay.seedLimitChasers([{ buyEnabled: true }]);
      await page.goto(FOCUS_URL);
      await waitForReady(page);
      const card = cardOf(page, E2E_ISIN);
      await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
      await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('10,000주', { timeout: 15_000 });
      const directOrders = () => relay.requestLog().filter((m) => m === DMA_MSG.DirectOrderReq).length;

      await card.getByRole('tablist', { name: '주문 진입' }).getByRole('tab', { name: '수동' }).tap();
      const form = card.getByTestId('manual-order-form');
      await expect(form).toBeVisible();
      // 터치 기기 — 인라인 입력칸이 없고 상자 전체가 시트를 여는 버튼이다.
      await expect(form.locator(`#mo-price-${E2E_ISIN}`)).toHaveCount(0);
      const priceBox = form.getByRole('button', { name: /^가격/ });
      await expect(priceBox).toHaveAttribute('aria-haspopup', 'dialog');

      await priceBox.tap();
      let sheet = await settledSheet(page);
      await expect(sheet).toHaveAccessibleName('가격');
      // 빈 상자로 처음 연 시트 — 단위 「원」이 캐럿 옆 같은 줄이다.
      await expect(sheet.locator('[data-slot="numpad-value"]')).toHaveText('');
      await expectUnitBesideCaret(sheet, '수동주문 가격 · 빈 값');
      await sheet.getByRole('button', { name: '현재가', exact: true }).tap();
      await expect(sheet.locator('[data-slot="numpad-value"]')).toHaveText('98,100');
      await sheet.getByRole('button', { name: '가격 입력' }).tap();
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 10_000 });
      await expect(form.getByRole('button', { name: '가격 98,100원' })).toBeVisible();
      await expect(form.getByRole('button', { name: '가격 98,100원' })).toBeFocused();

      await form.getByRole('button', { name: /^수량/ }).tap();
      sheet = await settledSheet(page);
      await expect(sheet).toHaveAccessibleName('수량');
      await sheet.getByRole('button', { name: '+1,000', exact: true }).tap();
      await expect(sheet.locator('[data-slot="numpad-value"]')).toHaveText('1,000');
      await sheet.getByRole('button', { name: '수량 입력' }).tap();
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 10_000 });
      await expect(form.getByRole('button', { name: '수량 1,000주' })).toBeVisible();

      // ★ 시트로 채운 것만으로는 아무것도 나가지 않는다 — 확인 다이얼로그도 없다.
      expect(directOrders(), '시트 「입력」은 주문을 보내지 않는다(D-10)').toBe(0);
      await expect(page.getByTestId('order-confirm-dialog')).toHaveCount(0);

      // 주문의 유일한 시작 — 「매수」 → 확인 다이얼로그. 취소하면 여전히 0 이다.
      await form.getByTestId('manual-order-buttons').getByRole('button', { name: '매수', exact: true }).tap();
      const confirm = page.getByTestId('order-confirm-dialog');
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: '취소', exact: true }).tap();
      await expect(confirm).toBeHidden();
      expect(directOrders()).toBe(0);
      expect(relay.orderInserts()).toHaveLength(0);
    });
  });
});
