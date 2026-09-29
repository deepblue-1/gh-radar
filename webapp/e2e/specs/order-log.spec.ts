import { test, expect, type Locator, type Page } from '@playwright/test';

import { kstDateIso, type StrategyEventRow } from '@gh-radar/shared';

import { mockStockApi } from '../fixtures/mock-api';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';
import { withLocalRelay, type FakeStrategyEventInput, type LocalRelay } from '../fixtures/relay';
import { FIXTURE_TRADE_DATE, STRATEGY_DAY_BY_NAME, STRATEGY_DAY_ROWS } from '@/test-fixtures/strategy-day';

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
    // 폴링 없음 — 마운트 1회
    expect(restore.count()).toBe(1);
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
});
