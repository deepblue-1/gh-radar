import { test, expect, type Locator, type Page } from '@playwright/test';

import { compareStrategyEventAsc, kstDateIso, type StrategyEventRow } from '@gh-radar/shared';

import { mockStockApi } from '../fixtures/mock-api';
import { scrollOverflowing } from '../overflow';
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
  STRATEGY_AUTO_SELL_GOLDEN,
  STRATEGY_AUTO_SELL_ROWS,
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
 * ④ Phase 25-10 — 카드 주문로그(P25-7) · 창 분리 페이지 `/trading/order-log`(P25-8) · 백스톱 실측(P25-9).
 *   quick-260930-lq5 — 카드 로그는 탭이 아니라 탭 줄 버튼 + 한 종목 팝업이다(P25-7 · P25-7b 1280/390 × 라이트/다크
 *   스크린샷 · P25-9 폰 밴드 탭 줄 한 줄 · 팝업 전체 화면 맨 아래 · 새 줄 따라감).
 *
 * ⑤ Phase 27-08 — 「자동매도」 구분 칩(P27-O1 · D-14). 자동매도 행은 `STRATEGY_AUTO_SELL_ROWS`, 줄 텍스트 기대값은
 *   `STRATEGY_AUTO_SELL_GOLDEN` 한 벌을 읽는다(문자열 두 벌 금지 — 종목명 칸만 실제 표시 이름으로 느슨하게).
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
  const logButton = (page: Page, kind: '주문로그' | '로그') =>
    cardTabs(page).locator(`[data-slot="card-tabs-bar"] [data-slot="card-log-button"][data-log="${kind}"]`);
  const dialog = (page: Page) => page.getByRole('dialog');
  const popupRows = (page: Page) => dialog(page).locator('tr[data-slot="card-log-row"]');
  const popupPhoneRows = (page: Page) => dialog(page).locator('li[data-slot="card-log-phone-row"]');
  const popupBody = (page: Page) => dialog(page).locator('[data-slot="card-log-body"]');

  /** 카드 범위 = 카드 계좌 주문 + 이 종목 · KRX(시세 포함). */
  const inCardScope = (r: StrategyEventRow) =>
    r.isin === E2E_ISIN && r.exchange === 'KRX' && (r.kind === 1 || r.kind === 2 || r.accountNo === E2E_ACCOUNT_NO);

  async function openFocusCard(page: Page): Promise<void> {
    await page.goto(FOCUS_URL);
    await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    await expect(cardOf(page)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
  }

  /** 카드 탭 줄 버튼 → 팝업. 줄 로케이터는 표(≥640) `tr` · 폰 `li`. */
  async function openCardLog(page: Page, kind: '주문로그' | '로그' = '주문로그'): Promise<void> {
    await logButton(page, kind).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toHaveAccessibleName(new RegExp(kind));
  }

  async function closeCardLog(page: Page): Promise<void> {
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  }

  const atBottom = async (loc: Locator) => {
    const g = await scrollGeometry(loc);
    return g.top + g.client >= g.height - 24;
  };

  test('P25-7 카드 주문로그 팝업 — 탭 3 + 버튼 2 · 제목 종목명 · 거래소만 · 범위 2행 · 푸시 따라감 · 닫힌 동안 배지', async ({
    page,
  }) => {
    const otherStock = today(STRATEGY_DAY_BY_NAME.buy12452!, { isin: E2E_LONG_NAME_ISIN, stockCode: '000660', seq: 9001 });
    const nxtMarket = today(STRATEGY_BRANCH_ROWS.exposedOpen!);
    await mockRestore(page, [byName('exposed'), byName('buy12451'), nxtMarket, otherStock]);
    await openFocusCard(page);

    // 탭 줄 — 탭 3개(주문로그 · 전략로그 탭 없음) + 버튼 2개
    const tabIds = await cardTabs(page)
      .getByRole('tab')
      .evaluateAll((els) => els.map((e) => e.id.replace(/^.*-trigger-/, '')));
    expect(tabIds).toEqual(['info', 'unfilled', 'holdings']);
    await expect(logButton(page, '주문로그')).toBeVisible();
    await expect(logButton(page, '로그')).toBeVisible();

    await openCardLog(page);
    await expect(dialog(page)).toHaveAccessibleName(/삼성전자/);
    await expect(dialog(page)).toHaveAccessibleName(/KRX/);
    const dlgText = (await dialog(page).textContent()) ?? '';
    expect(dlgText).not.toContain(E2E_ISIN);
    expect(dlgText).not.toContain(E2E_ACCOUNT_NO);
    await expect(dialog(page).locator('thead th')).toHaveText(['시각', '주문번호', '구분', '행위', '내용', '누적']);

    // 범위 — NXT 시세 · 다른 종목 제외 · 오름차순
    await expect(popupRows(page)).toHaveCount(2);
    await expect(popupRows(page).nth(0).locator('td')).toHaveText(['09:42:13.215', '', '상한가노출', '', '매도잔량 185,400', '620,000']);
    const r1 = popupRows(page).nth(1).locator('td');
    await expect(r1.nth(1)).toHaveText('2451');
    await expect(r1.nth(2)).toHaveText('선매수');
    await expect(r1.nth(3)).toHaveText('주문');
    await expect(r1.nth(4)).toHaveText(/^조건 매도잔량≤50,000/);
    await expect(r1.nth(5)).toHaveText('861,800');

    // 열린 동안 푸시 → 3행 · 맨 아래
    await relay.pushStrategyEvents([wire(byName('queued12451'))]);
    await expect(popupRows(page)).toHaveCount(3, { timeout: 15_000 });
    await expect(popupRows(page).nth(2)).toHaveAttribute('data-new', '');
    await expect.poll(() => atBottom(popupBody(page))).toBe(true);
    await dialog(page).screenshot({ path: test.info().outputPath('p25-7-card-orderlog-popup-1280.png') });

    // 닫힌 동안 푸시 1 → 배지 1 · 열면 배지 없음
    await closeCardLog(page);
    await expect(logButton(page, '주문로그').locator('[data-slot="card-log-badge"]')).toHaveCount(0);
    await relay.pushStrategyEvents([wire(byName('fill12451'))]);
    await expect(logButton(page, '주문로그').locator('[data-slot="card-log-badge"]')).toHaveText('1', { timeout: 15_000 });
    await expect(logButton(page, '주문로그')).toHaveAccessibleName('주문로그, 새 로그 1건');
    await openCardLog(page);
    await expect(popupRows(page)).toHaveCount(4);
    await expect(logButton(page, '주문로그').locator('[data-slot="card-log-badge"]')).toHaveCount(0);
  });

  test('P25-7b 카드 로그 팝업 실 UI — 1280 · 390 × 라이트 · 다크 스크린샷 8장 · 1280 가운데 ≤880 · 390 전체 화면 · 두 줄 행 · 가로 넘침 0', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await mockRestore(page, STRATEGY_DAY_ROWS.map((r) => today(r)).filter(inCardScope));
    const notes: string[] = [];
    for (const vp of [WIDE_VIEWPORT, PHONE_VIEWPORT]) {
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize(vp);
        await page.goto(FOCUS_URL);
        await page.evaluate((t) => localStorage.setItem('theme', t), theme);
        await page.reload();
        await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`));
        await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
        await expect(cardOf(page)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
        // 전략로그가 비지 않게 — 서버 통지(오류) 2건. 카드 로그는 메모리라 새로고침마다 다시 민다.
        for (const message of ['주문 가능 금액이 부족합니다', '허용되지 않은 거래소입니다 — 설정을 확인한 뒤 다시 켜 주세요']) {
          await relay.pushServerMessage({
            level: 'ERROR',
            source: 'SetLimitChaser',
            isin: E2E_ISIN,
            accountNo: E2E_ACCOUNT_NO,
            message,
            kind: '',
          });
        }
        await expect(cardOf(page).locator('[data-slot="card-server-error"]')).toContainText('허용되지 않은 거래소입니다', {
          timeout: 15_000,
        });

        for (const kind of ['주문로그', '로그'] as const) {
          await openCardLog(page, kind);
          // 열림 애니메이션(zoom-in 100ms)이 끝난 상자로 잰다.
          await expect.poll(async () => (await dialog(page).boundingBox())!.width, { timeout: 5_000 }).toBeGreaterThan(0);
          await page.waitForTimeout(250);
          const box = (await dialog(page).boundingBox())!;
          if (kind === '로그') {
            // 서버 오류 줄은 data-level="error"(옅은 빨강 배경 + 빨강 글자 · D4).
            const errRows = dialog(page).locator('[data-slot="card-log-row"][data-level="error"], [data-slot="card-log-phone-row"][data-level="error"]');
            await expect(errRows.filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
          }
          if (vp.width === 1280) {
            expect(box.width, `${kind} 1280 폭 ≤ 880`).toBeLessThanOrEqual(881);
            expect(box.height, `${kind} 1280 높이 ≈ 80vh`).toBeGreaterThanOrEqual(vp.height * 0.75);
            await expect(dialog(page).locator('table[data-slot="card-log-table"]')).toBeVisible();
            await expect(dialog(page).locator('thead th').first()).toBeVisible();
            await expect(popupPhoneRows(page).first()).toBeHidden();
          } else {
            expect(Math.abs(box.x), `${kind} 390 전체 화면 x`).toBeLessThanOrEqual(1);
            expect(Math.abs(box.y), `${kind} 390 전체 화면 y`).toBeLessThanOrEqual(1);
            expect(Math.abs(box.width - vp.width), `${kind} 390 전체 화면 폭`).toBeLessThanOrEqual(1);
            expect(Math.abs(box.height - vp.height), `${kind} 390 전체 화면 높이`).toBeLessThanOrEqual(1);
            await expect(dialog(page).locator('table[data-slot="card-log-table"]')).toBeHidden();
            await expect(popupPhoneRows(page).first()).toBeVisible();
          }
          // 본문만 스크롤 — 다이얼로그 자체는 넘치지 않고, 본문은 가로로 넘치지 않는다.
          const dlgOverflow = await dialog(page).evaluate((el) => el.scrollHeight - el.clientHeight);
          expect(dlgOverflow, `${kind} 다이얼로그 자체 세로 넘침 0`).toBeLessThanOrEqual(1);
          const bodyX = await popupBody(page).evaluate((el) => el.scrollWidth - el.clientWidth);
          expect(bodyX, `${kind} 본문 가로 넘침 0`).toBeLessThanOrEqual(0);
          expect(await scrollOverflowing(page, '[role="dialog"]'), `${kind} 머리 넘침 0`).toEqual([]);
          await expect.poll(() => atBottom(popupBody(page))).toBe(true);
          const slug = kind === '주문로그' ? 'orderlog' : 'stratlog';
          await page.screenshot({ path: test.info().outputPath(`lq5-${slug}-${vp.width}-${theme}.png`) });
          notes.push(`${slug}-${vp.width}-${theme} box=${box.width.toFixed(0)}x${box.height.toFixed(0)}`);
          await closeCardLog(page);
          // 닫으면 포커스가 버튼으로 돌아온다.
          await expect(logButton(page, kind)).toBeFocused();
        }
        if (theme === 'light') {
          await cardOf(page).screenshot({ path: test.info().outputPath(`lq5-card-${vp.width}-${theme}.png`) });
        }
      }
    }
    test.info().annotations.push({ type: 'lq5-shots', description: notes.join(' | ') });
    console.log(`[lq5] ${notes.join(' | ')}`);
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

  test('P25-9 백스톱 — 폰 밴드(390) 공용 패널 탭 4개 + 접기 한 줄 · 카드 탭 줄(탭 3 + 버튼 2 + 접기) 한 줄 · 카드 폭 불변 / 카드 주문로그 12줄 → 팝업 전체 화면 맨 아래 · 새 줄 따라감', async ({
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

    // ── E5 overflow — 카드 탭 줄(탭 3 + 버튼 2 + 접기)이 한 줄이고 카드 폭을 밀지 않는다
    const cardW0 = (await cardOf(page).boundingBox())!.width;
    const cardBar = cardTabs(page).locator('[data-slot="card-tabs-bar"]');
    const centers = await cardBar
      .locator('[role="tab"], [data-slot="card-log-button"], [data-slot="card-tabs-fold"]')
      .evaluateAll((els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return r.top + r.height / 2;
      }));
    expect(centers, '탭 3 + 버튼 2 + 접기').toHaveLength(6);
    const cardSpread = Math.max(...centers) - Math.min(...centers);
    expect(cardSpread, '카드 탭 줄 한 줄').toBeLessThanOrEqual(4);
    const cardBarOver = await cardBar.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(cardBarOver, '카드 탭 줄 가로 넘침 0').toBeLessThanOrEqual(0);
    const gridW = await page.locator('[data-slot="trading-workbench"]').evaluate((el) => el.clientWidth);
    expect(cardW0, '카드가 작업대 폭을 넘지 않는다').toBeLessThanOrEqual(gridW + 1);
    expect(cardW0, '카드가 뷰포트를 넘지 않는다').toBeLessThanOrEqual(PHONE_VIEWPORT.width);

    // ── E6 — 카드 주문로그 12줄 → 팝업(전체 화면) 열자마자 맨 아래 · 새 줄 따라감
    await openCardLog(page);
    await expect(popupPhoneRows(page)).toHaveCount(12);
    const scroller = popupBody(page);
    const g0 = await scrollGeometry(scroller);
    await expect.poll(() => atBottom(scroller)).toBe(true);

    const last = rows.at(-1)!;
    await relay.pushStrategyEvents([wire({ ...last, seq: 9200, gwTimeMs: last.gwTimeMs + 5_000 })]);
    await expect(popupPhoneRows(page)).toHaveCount(13, { timeout: 15_000 });
    await expect.poll(() => atBottom(scroller)).toBe(true);
    await closeCardLog(page);
    const cardW1 = (await cardOf(page).boundingBox())!.width;
    expect(Math.abs(cardW1 - cardW0), '팝업이 카드 폭을 밀지 않는다').toBeLessThanOrEqual(1);

    const note = `viewport=390 sharedTabs ySpread=${ySpread.toFixed(1)} · cardBar centers spread=${cardSpread.toFixed(1)} over=${cardBarOver} · card width=${cardW0.toFixed(1)}/${cardW1.toFixed(1)} wb=${gridW} · popup scroller client=${g0.client} height=${g0.height}`;
    test.info().annotations.push({ type: 'P25-9-backstop', description: note });
    console.log(`[P25-9] ${note}`);
  });

  // ===========================================================================
  // Phase 27-08 — 「자동매도」 구분 칩 (D-14)
  // ===========================================================================

  /** 골든 F-A 한 줄 → 정규식. 종목명 칸(픽스처 「○○전자」)만 실제 표시 이름을 받는다. */
  const goldenLine = (name: string): RegExp => {
    const g = STRATEGY_AUTO_SELL_GOLDEN[name];
    if (g === undefined) throw new Error(`골든 ${name} 없음`);
    const esc = g.logLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${esc.replace('○○전자', '.+')}$`);
  };

  /** 줄 묶음의 세로 가운데 퍼짐(한 줄 판정 · P25-9 와 같은 잣대). */
  const centerSpread = async (loc: Locator): Promise<number> => {
    const cs = await loc.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return r.top + r.height / 2;
      }),
    );
    expect(cs.length).toBeGreaterThan(1);
    return Math.max(...cs) - Math.min(...cs);
  };

  test('P27-O1 주문로그 「자동매도」 칩 — 복원 + 저널 푸시 · 카드 팝업 · 창 분리 kind=auto · 칩 줄 한 줄 (D-14)', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const PUSHED = 'asStateDone'; // kind 13 — 칩이 켜진 채 저널(80)로 온다
    const autoRow = (name: string): StrategyEventRow => today(STRATEGY_AUTO_SELL_ROWS[name]!);
    const autoNames = Object.keys(STRATEGY_AUTO_SELL_ROWS);
    const restored = [
      ...STRATEGY_DAY_ROWS.map((r) => today(r)),
      ...autoNames.filter((n) => n !== PUSHED).map(autoRow),
    ];
    await mockRestore(page, restored);

    /** 이름 붙은 group 9 줄 — 화면 순서(오름차순). */
    const g9Sorted = (names: readonly string[]) =>
      names
        .map((n) => ({ n, r: autoRow(n) }))
        .filter(({ r }) => r.group === 9)
        .sort((a, b) => compareStrategyEventAsc(a.r, b.r));
    const restoredG9 = g9Sorted(autoNames.filter((n) => n !== PUSHED));
    expect(restoredG9.length, 'WR-05 group 5 줄 하나만 빠진다').toBe(autoNames.length - 2);
    expect(restored.filter((r) => r.group === 9)).toHaveLength(restoredG9.length);

    // ── ① 공용 패널 주문로그 탭(1280) — 「자동매도」 칩 → group 9 줄만 · 골든 문장
    await openWorkbench(page);
    await openOrderLogTab(page);
    await expect(lines(page)).toHaveCount(restored.length);
    const kind = sharedPanels(page).getByRole('combobox', { name: '구분' });
    const kindLabels = await kind.locator('option').allTextContents();
    expect(kindLabels.indexOf('자동매도'), '「자동매도」 는 「매도」 바로 뒤').toBe(kindLabels.indexOf('매도') + 1);
    expect(kindLabels).toEqual(expect.arrayContaining(['수동', 'VI', '시세']));
    await kind.selectOption({ label: '자동매도' });
    await expect(kind).toHaveValue('auto');
    await expect(sharedPanels(page).locator('label[data-on]')).toHaveCount(1);
    await expect(sharedPanels(page).locator('label[data-on]')).toContainText('구분');
    const count = sharedPanels(page).locator('[data-slot="order-log-count"]');
    await expect(lines(page)).toHaveCount(restoredG9.length);
    await expect(count).toHaveText(`${restoredG9.length}건`);
    for (const [i, { n }] of restoredG9.entries()) {
      await expect(lines(page).nth(i), n).toHaveText(goldenLine(n));
      await expect(lines(page).nth(i), n).toHaveAttribute('data-group', '9');
    }

    // ── ② 칩이 켜진 채 관찰자 저널(80)로 kind 13 자동매도 줄 → 새 줄이 붙는다(제자리 · 오름차순)
    await relay.pushStrategyEvents([wire(autoRow(PUSHED))]);
    const allG9 = g9Sorted(autoNames);
    await expect(lines(page)).toHaveCount(allG9.length, { timeout: 15_000 });
    await expect(count).toHaveText(`${allG9.length}건`);
    for (const [i, { n }] of allG9.entries()) await expect(lines(page).nth(i), n).toHaveText(goldenLine(n));
    const pushedAt = allG9.findIndex(({ n }) => n === PUSHED);
    await expect(lines(page).nth(pushedAt)).toHaveAttribute('data-kind', '13');
    await expect(lines(page).nth(pushedAt)).toHaveAttribute('data-new', '');

    // WR-05 — group 5 로 뒤바뀌어 온 자동매도 줄은 서버 group 대로 「매도」 에 있다(「자동매도」 와 겹치지 않는다)
    await kind.selectOption({ label: '매도' });
    await expect(lines(page).filter({ hasText: goldenLine('asWr05AutoSellInGroup5') })).toHaveCount(1);
    await expect(sharedPanels(page).locator('li[data-slot="order-log-line"][data-group="9"]')).toHaveCount(0);
    await kind.selectOption({ label: '자동매도' });

    // 칩 줄 한 줄 — 1280 · 390 (「자동매도」 가 켜진 상태 = 가장 긴 값)
    const filterBar = sharedPanels(page).locator('[data-slot="order-log-filters"]');
    const filterItems = filterBar.locator(':scope > *');
    const tabSpread1280 = await centerSpread(filterItems);
    expect(tabSpread1280, '1280 탭 칩 줄 한 줄').toBeLessThanOrEqual(4);

    await page.setViewportSize(PHONE_VIEWPORT);
    await expect(sharedPanels(page)).toHaveAttribute('data-pinned', 'true');
    const unfold = sharedPanels(page).getByRole('button', { name: '펼치기 ▴' });
    if (await unfold.isVisible()) await unfold.click();
    await openOrderLogTab(page);
    if ((await kind.inputValue()) !== 'auto') await kind.selectOption({ label: '자동매도' });
    await expect(lines(page)).toHaveCount(allG9.length);
    const tabSpread390 = await centerSpread(filterItems);
    expect(tabSpread390, '390 탭 칩 줄 한 줄').toBeLessThanOrEqual(4);
    expect(await filterBar.evaluate((el) => el.scrollWidth - el.clientWidth), '390 탭 칩 줄 가로 넘침 0').toBeLessThanOrEqual(0);

    // ── ③ 카드 주문로그 팝업(1280) — 「자동매도」 = group 9 · 「매도」 = 매도 색에서 group 9 를 뺀 것
    await page.setViewportSize(WIDE_VIEWPORT);
    await openFocusCard(page);
    const cardG9 = restored.filter((r) => inCardScope(r) && r.group === 9).length;
    expect(cardG9).toBeGreaterThan(0);
    await openCardLog(page);
    const seg = dialog(page).getByRole('group', { name: '구분' });
    await expect(seg.getByRole('button')).toHaveText(['전체', '매수', '매도', '자동매도', '시세']);
    const segSpread1280 = await centerSpread(seg.getByRole('button'));
    expect(segSpread1280, '1280 팝업 칩 줄 한 줄').toBeLessThanOrEqual(4);
    await seg.getByRole('button', { name: '자동매도', exact: true }).click();
    await expect(seg.getByRole('button', { name: '자동매도', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(popupRows(page)).toHaveCount(cardG9);
    await expect(popupRows(page).locator('td:nth-child(3)')).toHaveText(Array<string>(cardG9).fill('자동매도'));
    await expect(dialog(page).locator('[data-slot="card-log-count"]')).toHaveText(`${cardG9}건`);

    await seg.getByRole('button', { name: '매도', exact: true }).click();
    const sellBadges = await popupRows(page).locator('td:nth-child(3)').allTextContents();
    expect(sellBadges.length).toBeGreaterThan(0);
    expect(sellBadges, '팝업 「매도」 에 자동매도 줄 없음').not.toContain('자동매도');
    expect(sellBadges, 'WR-05 group 5 줄은 「매도」 에').toContain('체결매도');

    // 창 분리 — 「자동매도」 → kind=auto (window.open 을 가로채 URL 만 받는다)
    await seg.getByRole('button', { name: '자동매도', exact: true }).click();
    await page.evaluate(() => {
      const w = window as unknown as { __opened: string[] };
      w.__opened = [];
      window.open = ((url?: string | URL) => {
        w.__opened.push(String(url));
        return null;
      }) as typeof window.open;
    });
    await dialog(page).getByRole('button', { name: '주문로그 새 창으로 열기' }).click();
    const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
    expect(opened).toHaveLength(1);
    const popoutUrl = new URL(opened[0]!, 'http://x');
    expect(popoutUrl.pathname).toBe('/trading/order-log');
    expect(popoutUrl.searchParams.get('kind')).toBe('auto');
    expect(popoutUrl.searchParams.get('stock')).toBe(E2E_ISIN);
    expect(popoutUrl.searchParams.get('ex')).toBe('KRX');
    await closeCardLog(page);

    // ── ④ 카드 팝업(390 · 전체 화면) — 「자동매도」 칩 줄 한 줄
    await page.setViewportSize(PHONE_VIEWPORT);
    await openCardLog(page);
    const segSpread390 = await centerSpread(seg.getByRole('button'));
    expect(segSpread390, '390 팝업 칩 줄 한 줄').toBeLessThanOrEqual(4);
    const segRow = seg.locator('xpath=..');
    expect(await segRow.evaluate((el) => el.scrollWidth - el.clientWidth), '390 팝업 칩 줄 가로 넘침 0').toBeLessThanOrEqual(0);
    await seg.getByRole('button', { name: '자동매도', exact: true }).click();
    await expect(popupPhoneRows(page)).toHaveCount(cardG9);
    await closeCardLog(page);

    // ── ⑤ 창 분리 페이지 — 같은 URL 로 열면 「자동매도」 가 이어진다
    await page.setViewportSize(WIDE_VIEWPORT);
    await page.goto(popoutUrl.pathname + popoutUrl.search);
    await expect(win(page)).toBeVisible({ timeout: 30_000 });
    await expect(win(page).getByRole('combobox', { name: '구분' })).toHaveValue('auto');
    await expect(winLines(page)).toHaveCount(cardG9, { timeout: 15_000 });
    for (const g of await winLines(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-group')))) expect(g).toBe('9');

    const note = `tab spread 1280=${tabSpread1280.toFixed(1)} 390=${tabSpread390.toFixed(1)} · popup seg spread 1280=${segSpread1280.toFixed(1)} 390=${segSpread390.toFixed(1)} · tab g9=${allG9.length} card g9=${cardG9}`;
    test.info().annotations.push({ type: 'P27-O1', description: note });
    console.log(`[P27-O1] ${note}`);
  });
});
