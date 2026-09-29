import { test, expect, type Locator, type Page } from '@playwright/test';

import { kstDateIso, type StrategyEventRow } from '@gh-radar/shared';

import { mockStockApi } from '../fixtures/mock-api';
import { installNativeApp } from '../fixtures/native-app';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';
import {
  E2E_ACCOUNT_NO,
  E2E_ISIN,
  E2E_LONG_NAME_ISIN,
  withLocalRelay,
  type FakeStrategyEventInput,
  type LocalRelay,
} from '../fixtures/relay';
import {
  FIXTURE_TRADE_DATE,
  STRATEGY_BRANCH_ROWS,
  STRATEGY_DAY_BY_NAME,
  STRATEGY_DAY_ROWS,
} from '@/test-fixtures/strategy-day';

/**
 * Phase 25-07 — 작업대 공용 패널 「주문로그」 탭 브라우저 종단 (D-05~D-08 · UI-SPEC ②-0 · ②-1).
 *
 * ① 무엇을 증명하는가
 *   진짜 브라우저 → 진짜 relay(관찰자 켜짐 · `withLocalRelay({ observer: true })`) → 스텁 게이트웨이 관찰자 소켓에
 *   저널 배치(80) 전략 이벤트 → relay 전략 기록기 → 스텁 `dma_strategy_apply` → `journal.events` → 웹 스토어 → 공용 패널
 *   주문로그 탭 F-A 한 줄. 하루치 복원(`GET /api/strategy-events`)은 `page.route` 목이다(server 는 이 e2e 밖).
 *
 * ② 픽스처 = 기획서 하루 흐름 한 벌(`@/test-fixtures/strategy-day`). 날짜만 이 실행의 KST 오늘로 옮긴다 — 피드는 오늘
 *   푸시만 받는다(D-07). 시각(HH:MM:SS.mmm)은 그대로다.
 *
 * ③ 규약(fixtures/relay.ts ⑥): 파일 내부 직렬 · beforeAll 1회 relay · afterAll stop · beforeEach reset.
 *   ★ 실서버 IP · 실계좌 리터럴 없음 — 게이트웨이는 127.0.0.1 스텁, 관찰자 비밀은 테스트 전용 값(T-25-32).
 *   ★ 전략 seq 는 픽스처가 스펙 수명 동안 조밀하게 다시 매긴다(relay 기록기 연속성 — fixtures/relay.ts ⑦).
 *
 * ④ Phase 25-10 — 카드 탭 「주문로그」(P25-7) · 창 분리 페이지 `/trading/order-log`(P25-8) · 백스톱 실측(P25-9 —
 *   폰 밴드 공용 패널 탭 줄 한 줄 · 카드 탭 줄이 카드 폭을 밀지 않음 · 카드 주문로그 본문 고정 높이 · 자동 따라감).
 */

test.describe.configure({ mode: 'serial' });

let relay: LocalRelay;

const WORKBENCH_URL = '/trading';
const WIDE_VIEWPORT = { width: 1280, height: 900 } as const;
const PHONE_VIEWPORT = { width: 390, height: 844 } as const;
/** relay 매핑 · dma_credentials 시드의 게이트웨이 사용자 — 주문 이벤트의 주문자(적재 입력에만 있다). */
const GATEWAY_USER = 'e2e-dma-user';

const TODAY = kstDateIso();
const DAY_SHIFT_MS = Date.parse(`${TODAY}T00:00:00+09:00`) - Date.parse(`${FIXTURE_TRADE_DATE}T00:00:00+09:00`);

/** 픽스처 행 → 오늘 날짜 행(시각 유지). */
function today(row: StrategyEventRow, over: Partial<StrategyEventRow> = {}): StrategyEventRow {
  return { ...row, tradeDate: TODAY, gwTimeMs: row.gwTimeMs + DAY_SHIFT_MS, ...over };
}

/** 공개 행 → 게이트웨이 와이어 입력(주문자 복원 · 공개 전용 칸 제거). seq 는 픽스처가 다시 매긴다. */
function wire(row: StrategyEventRow): FakeStrategyEventInput {
  const { gateway: _gateway, journalEpoch: _epoch, stockCode: _stockCode, ...rest } = row;
  void _gateway;
  void _epoch;
  void _stockCode;
  return { ...rest, dmaUserId: row.accountNo === '' ? '' : GATEWAY_USER };
}

const byName = (name: string): StrategyEventRow => {
  const row = STRATEGY_DAY_BY_NAME[name];
  if (row === undefined) throw new Error(`픽스처 ${name} 없음`);
  return today(row);
};

/** 복원 목 — 하루치 bare array. 요청 수를 센다(재조회 규율 확인). */
async function mockRestore(page: Page, rows: readonly StrategyEventRow[]): Promise<{ count: () => number }> {
  let n = 0;
  await page.route('**/api/strategy-events*', async (route) => {
    n += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
  return { count: () => n };
}

const statusBar = (page: Page) => page.locator('[data-slot="workbench-status-bar"]');
const sharedPanels = (page: Page) => page.getByTestId('shared-panels');
const orderLogTab = (page: Page) => sharedPanels(page).getByRole('tab', { name: /^주문로그/ });
const lines = (page: Page) => sharedPanels(page).locator('li[data-slot="order-log-line"]');
const body = (page: Page) => sharedPanels(page).locator('[data-slot="order-log-body"]');

async function openWorkbench(page: Page): Promise<void> {
  await page.goto(WORKBENCH_URL);
  await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
}

async function openOrderLogTab(page: Page): Promise<void> {
  const tab = orderLogTab(page);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

const normalize = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

async function scrollGeometry(loc: Locator) {
  return loc.evaluate((el) => ({ top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight }));
}

test.describe('주문로그 탭 — 관찰자 켠 로컬 relay', () => {
  test.beforeAll(async () => {
    relay = await withLocalRelay({ observer: true });
  });

  test.afterAll(async () => {
    await relay.stop();
  });

  test.beforeEach(async ({ page }) => {
    relay.reset();
    await page.setViewportSize(WIDE_VIEWPORT);
    await mockStockApi(page, { searchResults: [FIXTURE_SAMSUNG] });
  });

  test('P25-1 브라우저 종단 — 복원(상한가노출) + 게이트웨이 80 BuyOrder → 공용 패널 주문로그 탭 F-A 두 줄', async ({
    page,
  }) => {
    const restore = await mockRestore(page, [byName('exposed')]);
    await openWorkbench(page);
    await openOrderLogTab(page);
    await expect(lines(page)).toHaveCount(1);

    await relay.pushStrategyEvents([wire(byName('buy12451'))]);

    await expect(lines(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(lines(page).nth(0)).toHaveText(/^\[09:42:13\.215\]\[상한가노출\] KRX \| .+ \| 매도잔량 185,400 \| 누적 620,000$/);
    await expect(lines(page).nth(1)).toHaveText(
      /^\[09:45:02\.861\]\[12451\]\[선매수\] KRX \| .+ \| 주문 · 조건 매도잔량≤50,000 \/ 실측 38,200 · .+ \| 누적 861,800$/,
    );
    await expect(lines(page).nth(1)).toHaveAttribute('data-kind', '3');
    await expect(lines(page).nth(1)).toHaveAttribute('data-group', '1');
    // 푸시로 온 줄만 새 줄 강조(3초 뒤 제거)
    expect(await lines(page).nth(0).getAttribute('data-new')).toBeNull();
    await expect(lines(page).nth(1)).toHaveAttribute('data-new', '');
    await expect.poll(() => lines(page).nth(1).getAttribute('data-new'), { timeout: 6_000 }).toBeNull();
    // 폴링 없음 — 마운트 1회 + (마운트 때 relay 가 아직 ready 가 아니었으면) 첫 ready 1회(WR-05 — 복원 ~ 인증 사이 누락 메우기).
    // 위 강조 제거 대기(최대 6초) 동안 첫 ready 는 이미 지났다 — 그 뒤로 더 늘지 않는다.
    expect(restore.count()).toBeGreaterThanOrEqual(1);
    expect(restore.count()).toBeLessThanOrEqual(2);
  });

  test('P25-2 새 로그 배지 — 미체결 탭 활성 중 푸시 3 → 「주문로그 (3)」 · 탭 열면 괄호 없음', async ({ page }) => {
    await mockRestore(page, []);
    await openWorkbench(page);
    await expect(sharedPanels(page).getByRole('tab', { name: /^미체결/ })).toHaveAttribute('aria-selected', 'true');

    await relay.pushStrategyEvents([wire(byName('exposed')), wire(byName('buy12451')), wire(byName('queued12451'))]);

    const tab = sharedPanels(page).getByRole('tab', { name: '주문로그, 새 로그 3건' });
    await expect(tab).toHaveText('주문로그 (3)', { timeout: 15_000 });
    await tab.click();
    await expect(orderLogTab(page)).toHaveText('주문로그');
    await expect(sharedPanels(page).locator('[data-slot="order-log-unseen"]')).toHaveCount(0);
    await expect(lines(page)).toHaveCount(3);
  });

  test('P25-3 스크롤 고정 — 줄 12개 복원 · 위로 올린 뒤 푸시 3 → 위치 불변 + 핀 · 핀 클릭 → 맨 아래 · 핀 부재', async ({
    page,
  }) => {
    const restored = STRATEGY_DAY_ROWS.slice(0, 12).map((r) => today(r));
    await mockRestore(page, restored);
    await openWorkbench(page);
    await openOrderLogTab(page);
    await expect(lines(page)).toHaveCount(12);

    const scroller = body(page);
    // 처음 마운트 = 맨 아래
    await expect.poll(async () => {
      const g = await scrollGeometry(scroller);
      return g.height - g.top - g.client;
    }).toBeLessThanOrEqual(24);
    const before = await scrollGeometry(scroller);
    expect(before.height, '12줄이 172px 스크롤러를 넘쳐야 스크롤 고정을 잴 수 있다').toBeGreaterThan(before.client);

    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect.poll(async () => (await scrollGeometry(scroller)).top).toBe(0);

    const last = today(STRATEGY_DAY_ROWS[13]!);
    await relay.pushStrategyEvents([
      wire(today(STRATEGY_DAY_ROWS[12]!)),
      wire(last),
      wire({ ...last, gwTimeMs: last.gwTimeMs + 1_000 }),
    ]);

    const pin = sharedPanels(page).locator('button[data-slot="order-log-pin"]');
    await expect(pin).toHaveText('새 로그 3 · 맨 아래로 ↓', { timeout: 15_000 });
    await expect(lines(page)).toHaveCount(15);
    expect((await scrollGeometry(scroller)).top).toBe(0);

    await pin.click();
    await expect
      .poll(async () => {
        const g = await scrollGeometry(scroller);
        return g.top + g.client >= g.height - 24;
      })
      .toBe(true);
    await expect(pin).toHaveCount(0);
  });

  test('P25-4 구분 「시세」 → 시세 줄만 · 칩 data-on · 건수 일치', async ({ page }) => {
    const rows = STRATEGY_DAY_ROWS.map((r) => today(r));
    await mockRestore(page, rows);
    await openWorkbench(page);
    await openOrderLogTab(page);
    await expect(lines(page)).toHaveCount(rows.length);
    const count = sharedPanels(page).locator('[data-slot="order-log-count"]');
    await expect(count).toHaveText(`${rows.length}건`);

    const kind = sharedPanels(page).getByRole('combobox', { name: '구분' });
    await kind.selectOption('market');
    const market = rows.filter((r) => r.kind === 1 || r.kind === 2).length;
    await expect(lines(page)).toHaveCount(market);
    for (const k of await lines(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))) {
      expect(['1', '2']).toContain(k);
    }
    await expect(count).toHaveText(`${market}건`);
    await expect(sharedPanels(page).locator('label[data-on]')).toHaveCount(1);
    await expect(sharedPanels(page).locator('label[data-on]')).toContainText('구분');
  });

  test('P25-5 폰 밴드(390) 줄 탭 → aria-expanded true · white-space normal / 1280 → 줄 버튼 부재 · title 전체 평문', async ({
    page,
  }) => {
    await mockRestore(page, [byName('exposed'), byName('buy12451')]);

    // 1280 — 비폰 밴드
    await openWorkbench(page);
    await openOrderLogTab(page);
    await expect(lines(page)).toHaveCount(2);
    await expect(lines(page).locator('button')).toHaveCount(0);
    const buyLine = lines(page).nth(1);
    const title = await buyLine.getAttribute('title');
    expect(title).toMatch(/^\[09:45:02\.861\]\[12451\]\[선매수\] KRX \| /);
    expect(title).toBe(normalize(await buyLine.textContent()));

    // 390 — 폰 밴드(작업대 wb < 700 · 공용 패널 하단 접이식)
    await page.setViewportSize(PHONE_VIEWPORT);
    await expect(sharedPanels(page)).toHaveAttribute('data-pinned', 'true');
    const unfold = sharedPanels(page).getByRole('button', { name: '펼치기 ▴' });
    if (await unfold.isVisible()) await unfold.click();
    await openOrderLogTab(page);
    const phoneLine = lines(page).nth(1);
    const toggle = phoneLine.getByRole('button');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(await phoneLine.getAttribute('title')).toBeNull();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(phoneLine).toHaveAttribute('data-open', '');
    expect(await phoneLine.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('normal');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('P25-6 sharedTab orderlog — 새로고침해도 주문로그 탭이 열린 채 복원된다', async ({ page }) => {
    await mockRestore(page, [byName('exposed')]);
    await openWorkbench(page);
    await openOrderLogTab(page);
    await expect(lines(page)).toHaveCount(1);

    await page.reload();
    await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    await expect(orderLogTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(lines(page)).toHaveCount(1);
  });

  // ===========================================================================
  // Phase 25-10 — 카드 탭 · 창 분리 · 백스톱
  // ===========================================================================

  const FOCUS_URL = '/trading?code=005930';
  const cardOf = (page: Page) => page.locator(`[data-slot="strategy-card"][data-key^="${E2E_ISIN}:"]`);
  const cardTabs = (page: Page) => cardOf(page).locator('[data-slot="card-tabs"]');
  const cardLines = (page: Page) => cardTabs(page).locator('li[data-slot="order-log-line"]');
  const cardOrderLogBody = (page: Page) =>
    cardTabs(page).locator('[data-slot="order-log"][data-surface="card"] [data-slot="order-log-body"]');

  /** 카드 범위 = 카드 계좌 주문 + 이 종목 · KRX(시세 포함). */
  const inCardScope = (r: StrategyEventRow) =>
    r.isin === E2E_ISIN && r.exchange === 'KRX' && (r.kind === 1 || r.kind === 2 || r.accountNo === E2E_ACCOUNT_NO);

  async function openFocusCard(page: Page): Promise<void> {
    await page.goto(FOCUS_URL);
    await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    await expect(cardOf(page)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
  }

  async function openCardOrderLog(page: Page): Promise<void> {
    const tab = cardTabs(page).getByRole('tab', { name: /^주문로그/ });
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    // 카드 탭이 접힌 채(저장된 선호) 마운트됐으면 편다.
    const fold = cardTabs(page).locator('[data-slot="card-tabs-fold"]');
    if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
    await expect(cardTabs(page).locator('[data-slot="card-tabs-body"]')).toBeVisible();
  }

  test('P25-7 카드 탭 — 「전략로그」(값 log) · 「주문로그」 필터줄 · 핀 부재 · 다른 종목 · 거래소 줄 0 · 푸시 1건 → 맨 아래 따라감', async ({
    page,
  }) => {
    const otherStock = today(STRATEGY_DAY_BY_NAME.buy12452!, { isin: E2E_LONG_NAME_ISIN, stockCode: '000660', seq: 9001 });
    const nxtMarket = today(STRATEGY_BRANCH_ROWS.exposedOpen!);
    await mockRestore(page, [byName('exposed'), byName('buy12451'), nxtMarket, otherStock]);
    await openFocusCard(page);

    // 탭 줄 — 5개 순서 · 값 log 트리거의 라벨이 「전략로그」
    const tabIds = await cardTabs(page)
      .getByRole('tab')
      .evaluateAll((els) => els.map((e) => ({ v: e.id.replace(/^.*-trigger-/, ''), t: (e.textContent ?? '').trim() })));
    expect(tabIds.map((x) => x.v)).toEqual(['info', 'unfilled', 'holdings', 'orderlog', 'log']);
    expect(tabIds.find((x) => x.v === 'log')!.t).toMatch(/^전략로그/);

    await openCardOrderLog(page);
    await expect(cardTabs(page).locator('[data-slot="order-log"][data-surface="card"]')).toHaveCount(1);
    await expect(cardTabs(page).locator('[data-slot="order-log-filters"]')).toHaveCount(0);
    await expect(cardLines(page)).toHaveCount(2);
    await expect(cardLines(page).nth(0)).toHaveText(/^09:42:13\.215 상한가노출 매도잔량 185,400 \| 누적 620,000$/);
    await expect(cardLines(page).nth(1)).toHaveText(/^09:45:02\.861 #12451 선매수 주문 · 조건 매도잔량≤50,000 .+ \| 누적 861,800$/);
    // 거래소 · 종목 칸이 없다 — title(F-A 전체 평문)에만 있다.
    await expect(cardLines(page).nth(1)).toHaveAttribute('title', /^\[09:45:02\.861\]\[12451\]\[선매수\] KRX \| /);
    await expect(cardTabs(page).locator('[data-slot="order-log-pin"]')).toHaveCount(0);

    await relay.pushStrategyEvents([wire(byName('queued12451'))]);
    await expect(cardLines(page)).toHaveCount(3, { timeout: 15_000 });
    await expect(cardLines(page).nth(2)).toHaveText(/^09:45:02\.880 #12451 선매수 대기 · /);
    await expect
      .poll(async () => {
        const g = await scrollGeometry(cardOrderLogBody(page));
        return g.top + g.client >= g.height - 24;
      })
      .toBe(true);
    await expect(cardTabs(page).locator('[data-slot="order-log-pin"]')).toHaveCount(0);
    await cardOf(page).screenshot({ path: test.info().outputPath('p25-7-card-orderlog-1280.png') });
  });

  /** 창 분리 복원 목 — 날짜별 응답 · 요청 URL 기록(날짜 이동마다 1회 확인). */
  async function mockWindowRestore(
    page: Page,
    todayRows: readonly StrategyEventRow[],
  ): Promise<{ urls: string[] }> {
    const urls: string[] = [];
    await page.route('**/api/strategy-events*', async (route) => {
      const url = new URL(route.request().url());
      urls.push(url.pathname + url.search);
      const past = url.searchParams.get('date');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(past === null || past === TODAY ? todayRows : []),
      });
    });
    return { urls };
  }

  const win = (page: Page) => page.locator('main[data-slot="order-log-window"]');
  const winLines = (page: Page) => win(page).locator('li[data-slot="order-log-line"]');

  test('P25-8 창 분리 — 앱 셸 · 사이드바 부재 · 오늘 › disabled · ‹ → URL date 하루 전 + 조회 1회 · 과거일 푸시 무시 · 핀 부재 · 0건 문구 / 앱 셸에선 창 분리 버튼 비표시', async ({
    page,
  }) => {
    const restore = await mockWindowRestore(page, [byName('exposed'), byName('buy12451')]);
    await page.goto(`/trading/order-log?account=${E2E_ACCOUNT_NO}`);
    await expect(win(page)).toBeVisible({ timeout: 30_000 });
    await expect(winLines(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(page).toHaveTitle(`주문로그 · ${TODAY}`);
    await expect(page.locator('[data-slot="app-aside"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="app-menu-button"]')).toHaveCount(0);
    await expect(win(page).locator('[data-slot="order-log-popout"]')).toHaveCount(0);
    await expect(win(page).locator('[data-slot="order-log-date-next"]')).toBeDisabled();
    await expect(win(page).locator('[data-slot="order-log-date-today"]')).toHaveAttribute('aria-current', 'date');
    // 마운트 조회 1회 + 첫 ready 1회(WR-05) — 창 분리는 새 wss 를 열어 마운트 때 relay 가 ready 가 아니다.
    await expect.poll(() => [...restore.urls], { timeout: 15_000 }).toEqual(['/api/strategy-events', '/api/strategy-events']);
    await page.screenshot({ path: test.info().outputPath('p25-8-window-today-1280.png') });

    // ‹ 이전 날 — URL · 조회 1회 · 과거일 문구
    const yesterday = new Date(Date.parse(`${TODAY}T12:00:00+09:00`) - 86_400_000).toISOString().slice(0, 10);
    await win(page).getByRole('button', { name: '이전 날' }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]date=${yesterday}(&|$)`));
    await expect(page).toHaveURL(new RegExp(`[?&]account=${E2E_ACCOUNT_NO}(&|$)`));
    await expect(win(page).locator('[data-slot="order-log-date"]')).toHaveText(new RegExp(`^${yesterday} \\(.\\)$`));
    await expect(win(page).locator('[data-slot="order-log-empty"]')).toContainText('이 날은 주문로그가 없어요');
    await expect(win(page).locator('[data-slot="order-log-empty"]')).toContainText(
      '주말·휴장일이거나 주문·상한가 이벤트가 없던 날이에요',
    );
    expect(restore.urls).toEqual(['/api/strategy-events', '/api/strategy-events', `/api/strategy-events?date=${yesterday}`]);
    await expect(page).toHaveTitle(`주문로그 · ${yesterday}`);
    await page.screenshot({ path: test.info().outputPath('p25-8-window-past-1280.png') });
    await expect(win(page).locator('[data-slot="order-log-date-today"]')).not.toHaveAttribute('aria-current', 'date');
    await expect(win(page).locator('[data-slot="order-log-date-next"]')).toBeEnabled();

    // 과거일 — 오늘 푸시가 와도 줄 0 · 핀 없음. 오늘로 돌아오면 같은 푸시가 보인다(푸시가 실제로 왔다는 대조군).
    await relay.pushStrategyEvents([wire(byName('queued12451'))]);
    await page.waitForTimeout(1_500);
    await expect(winLines(page)).toHaveCount(0);
    await expect(win(page).locator('[data-slot="order-log-pin"]')).toHaveCount(0);
    await win(page).locator('[data-slot="order-log-date-today"]').click();
    await expect(page).not.toHaveURL(/[?&]date=/);
    await expect(winLines(page)).toHaveCount(3, { timeout: 15_000 });
    expect(restore.urls).toHaveLength(4);

    // 앱 셸 — 작업대의 창 분리 버튼은 보이지 않는다(T-25-42).
    const native = await page.context().newPage();
    await installNativeApp(native);
    await mockStockApi(native, { searchResults: [FIXTURE_SAMSUNG] });
    await mockRestore(native, []);
    await native.goto(WORKBENCH_URL);
    await expect(native.locator('[data-slot="workbench-status-bar"]')).toHaveAttribute('data-status', 'ready', {
      timeout: 30_000,
    });
    await expect(native.locator('[data-slot="order-log-popout"]')).toBeHidden();
    await native.close();
  });

  test('P25-9 백스톱 — 폰 밴드(390) 공용 패널 탭 4개 + 접기 한 줄 · 카드 탭 줄이 카드 폭을 밀지 않음 / 카드 주문로그 12줄 → 카드 높이 불변 · ≈3줄 · 새 줄 따라감', async ({
    page,
  }) => {
    const restored = STRATEGY_DAY_ROWS.map((r) => today(r)).filter(inCardScope);
    const extra = Array.from({ length: Math.max(0, 12 - restored.length) }, (_, i) =>
      today(STRATEGY_DAY_BY_NAME.exposed!, { seq: 9100 + i, gwTimeMs: restored.at(-1)!.gwTimeMs + (i + 1) * 1_000 }),
    );
    const rows = [...restored, ...extra].slice(0, 12);
    await mockRestore(page, rows);
    await page.setViewportSize(PHONE_VIEWPORT);
    await openFocusCard(page);

    // ── E5 overflow — 공용 패널 탭 줄(폰 밴드)
    const bar = sharedPanels(page).getByRole('tablist', { name: '공용 패널' });
    const tabTops = await bar.getByRole('tab').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    const foldBtn = sharedPanels(page).getByRole('button', { name: /^(펼치기 ▴|접기 ▾)$/ });
    const foldTop = (await foldBtn.boundingBox())!.y;
    expect(tabTops).toHaveLength(4);
    const tops = [...tabTops, foldTop];
    const ySpread = Math.max(...tops) - Math.min(...tops);
    expect(ySpread, '공용 패널 탭 4개 + 접기가 한 줄').toBeLessThanOrEqual(4);

    // ── E5 overflow — 카드 탭 줄(탭 5개)이 카드 폭을 밀지 않는다
    const cardW0 = (await cardOf(page).boundingBox())!.width;
    const cardTabList = cardTabs(page).getByRole('tablist', { name: '카드 탭' });
    const tl = await cardTabList.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    // 격자 부모는 `display:contents` 래퍼일 수 있다 — 작업대 루트(`wb`) 폭과 비교한다.
    const gridW = await page.locator('[data-slot="trading-workbench"]').evaluate((el) => el.clientWidth);
    expect(cardW0, '카드가 작업대 폭을 넘지 않는다').toBeLessThanOrEqual(gridW + 1);
    expect(cardW0, '카드가 뷰포트를 넘지 않는다').toBeLessThanOrEqual(PHONE_VIEWPORT.width);

    // ── E6 overflow — 카드 주문로그 본문(12줄): 카드 높이 불변 · ≈3줄 · 따라감
    await cardTabs(page).getByRole('tab', { name: /^정보/ }).click();
    const fold = cardTabs(page).locator('[data-slot="card-tabs-fold"]');
    if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
    const tabsH0 = (await cardTabs(page).boundingBox())!.height;
    await openCardOrderLog(page);
    await expect(cardLines(page)).toHaveCount(12);
    const tabsH1 = (await cardTabs(page).boundingBox())!.height;
    expect(Math.abs(tabsH1 - tabsH0), '탭을 바꿔도 카드 탭 높이 불변').toBeLessThanOrEqual(1);
    const cardW1 = (await cardOf(page).boundingBox())!.width;
    expect(Math.abs(cardW1 - cardW0), '주문로그 탭이 카드 폭을 밀지 않는다').toBeLessThanOrEqual(1);

    const scroller = cardOrderLogBody(page);
    const lineH = await cardLines(page).first().evaluate((el) => el.getBoundingClientRect().height);
    const g0 = await scrollGeometry(scroller);
    // 보이는 줄 = (스크롤러 높이 − 목록 위아래 패딩) ÷ 줄 높이 — 패딩(3px×2)은 줄이 아니다.
    const listPadY = await cardTabs(page)
      .locator('ol[data-slot="order-log-list"]')
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom));
    const visibleLines = (g0.client - listPadY) / lineH;
    expect(visibleLines, '보이는 줄 ≈3').toBeGreaterThanOrEqual(2);
    expect(visibleLines, '보이는 줄 ≈3').toBeLessThanOrEqual(4);
    await expect.poll(async () => {
      const g = await scrollGeometry(scroller);
      return g.height - g.top - g.client;
    }).toBeLessThanOrEqual(24);

    const last = rows.at(-1)!;
    await relay.pushStrategyEvents([wire({ ...last, seq: 9200, gwTimeMs: last.gwTimeMs + 5_000 })]);
    await expect(cardLines(page)).toHaveCount(13, { timeout: 15_000 });
    await expect
      .poll(async () => {
        const g = await scrollGeometry(scroller);
        return g.top + g.client >= g.height - 24;
      })
      .toBe(true);
    const tabsH2 = (await cardTabs(page).boundingBox())!.height;
    expect(Math.abs(tabsH2 - tabsH0), '새 줄이 와도 카드 탭 높이 불변').toBeLessThanOrEqual(1);

    await page.screenshot({ path: test.info().outputPath('p25-9-card-orderlog-390.png'), fullPage: true });
    const note = `viewport=390 sharedTabs ySpread=${ySpread.toFixed(1)} · cardTabList scrollWidth=${tl.sw} clientWidth=${tl.cw} · card width=${cardW0.toFixed(1)}/${cardW1.toFixed(1)} wb=${gridW} · card-tabs height ${tabsH0.toFixed(1)}/${tabsH1.toFixed(1)}/${tabsH2.toFixed(1)} · scroller client=${g0.client} padY=${listPadY} lineH=${lineH.toFixed(1)} visible≈${visibleLines.toFixed(2)}`;
    test.info().annotations.push({ type: 'P25-9-backstop', description: note });
    console.log(`[P25-9] ${note}`);
  });
});
