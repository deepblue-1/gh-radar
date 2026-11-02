import { test, expect, type Page } from '@playwright/test';

import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';
import { withLocalRelay, type LocalRelay } from '../fixtures/relay';
import {
  ECO,
  SAMSUNG,
  TICK_DATE,
  lastSaturday,
  mockTickApi,
  recentTradingDay,
  tickOpenFixture,
} from '../fixtures/ticks';

/**
 * Phase 37 Plan 08 Task 3 — 틱 전문 뷰어 진입 실브라우저 E2E (D-03 · D-08 · D-16 · D-18).
 *
 * ① 무엇을 증명하는가(1280 데스크톱)
 *   - 진입: `/analytics/ticks?d=20261016` → 그날 격자 목록(목업 A 패널) → 행 클릭 → URL `isin · d · ex` → open 정확히 1회 →
 *     머리(종목명 · 공급 배지) · 본문 자리. 뒤로 = 목록(router.push — D-18).
 *   - 변환: 머리 검색으로 격자 없는 종목 고르기(제안 칩 「변환 필요 · 약 4분」) → convert 정확히 1회 → 「변환 중」 카드 →
 *     실제 5초 폴링에서 grid → 카드가 걷히고 열린다. 단위(RTL)는 가짜 타이머 · jsdom 이라 실제 간격 · cmdk 키보드 ·
 *     라우팅 왕복을 못 본다 — 여기서 실측한다.
 *   - 게이트: `/api/ticks/*` 403 `DMA_UNMAPPED` → 본문 대신 DmaGate 문구(D-08 — 권한은 server RPC).
 *   - 자료 없음: 지난 토요일 → 휴장 카드 → 「최근 거래일로」 → 최근 격자 날짜 목록.
 * ② 규약(accum-report.spec 과 같다): 파일 내부 직렬 · beforeAll 1회 relay(DMA 매핑 사용자) · afterAll stop · beforeEach reset.
 *   틱 API 는 `page.route` 목이다(server · RPC 는 이 e2e 밖 — 37-07 단위 시험).
 * ③ 날짜: 진입은 고정 20261016(격자가 있으면 보관 판정을 타지 않는다). 변환 · 자료 없음은 실행 날짜에서 계산한다
 *   (`recentTradingDay` · `lastSaturday` — 고정 날짜는 90일 뒤 「보관 밖」 카드로 바뀐다).
 */

test.describe.configure({ mode: 'serial' });

const BASE = '/analytics/ticks';
const entryRows = (page: Page) => page.locator('[data-slot="tick-entry-row"]');

async function expectNoHorizontalScroll(page: Page, tag: string): Promise<void> {
  const o = await page.evaluate(() => {
    const se = document.scrollingElement ?? document.documentElement;
    const main = document.querySelector('main');
    return { doc: se.scrollWidth - se.clientWidth, main: main === null ? 0 : main.scrollWidth - main.clientWidth };
  });
  expect(o.doc, `${tag} 문서 가로 스크롤 0`).toBeLessThanOrEqual(0);
  expect(o.main, `${tag} main 가로 스크롤 0`).toBeLessThanOrEqual(0);
}

test.describe('틱 전문 뷰어 진입 (Phase 37 D-16)', () => {
  let relay: LocalRelay;

  test.beforeAll(async () => {
    relay = await withLocalRelay();
  });

  test.afterAll(async () => {
    await relay.stop();
  });

  test.beforeEach(async ({ page }) => {
    relay.reset();
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockStockApi(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
  });

  test('진입 — 그날 격자 목록 → 행 클릭 → URL isin/d/ex · open 1회 · 머리 · 뒤로 = 목록', async ({ page }) => {
    const rec = await mockTickApi(page);
    await page.goto(`${BASE}?d=${TICK_DATE}`);

    await expect(page.getByRole('heading', { name: '10/16 격자 종목' })).toBeVisible({ timeout: 30_000 });
    await expect(entryRows(page)).toHaveCount(3);
    // 등락률순 — 에코앤드림 KRX(+29.9%) · NXT(+15.6%) · SK하이닉스(+1.8%)
    await expect(entryRows(page).nth(0)).toHaveAttribute('data-ex', 'KRX');
    await expect(entryRows(page).nth(1)).toHaveAttribute('data-ex', 'NXT');
    await expect(entryRows(page).nth(0)).toContainText('매집감지');
    await expect(entryRows(page).nth(1).locator('[data-chip="nxt"]')).toBeVisible();
    await expect(page.getByText('목록에 없는 종목은 위 검색으로 — 그 종목만 변환해서 열어요(약 4분)')).toBeVisible();
    await expectNoHorizontalScroll(page, '진입 1280');

    await entryRows(page).nth(1).click();
    await expect(page).toHaveURL(new RegExp(`${BASE}\\?isin=${ECO.isin}&d=${TICK_DATE}&ex=NXT$`));
    const header = page.locator('[data-slot="tick-header"]');
    await expect(header.getByRole('heading')).toContainText(ECO.name);
    await expect(header.locator('[data-slot="tick-supply"]')).toHaveText('과거 격자 · GCS 원본');
    await expect(header.getByRole('button', { name: 'NXT' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-slot="tick-body"]')).toContainText('레코드 48,210건');
    expect(rec.open).toEqual([`${ECO.isin}/${TICK_DATE}/NXT`]);
    expect(rec.convert).toHaveLength(0);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${BASE}\\?d=${TICK_DATE}$`));
    await expect(entryRows(page)).toHaveCount(3);
  });

  test('변환 — 검색으로 격자 없는 종목 → convert 1회 → 「변환 중」 → 5초 폴링에서 grid → 열림', async ({ page }) => {
    const d = recentTradingDay();
    const rec = await mockTickApi(page, {
      open: (q, n) => tickOpenFixture(n === 1 ? 'none' : n === 2 ? 'request' : 'grid', q),
    });
    await page.goto(`${BASE}?d=${d}`);
    await expect(page.getByText('이 날짜 격자 종목이 없어요')).toBeVisible({ timeout: 30_000 });

    const input = page.getByRole('combobox');
    await input.fill('삼성');
    const option = page.getByRole('option', { name: /삼성전자/ });
    await expect(option).toContainText('변환 필요 · 약 4분');
    await input.press('Enter');

    await expect(page).toHaveURL(new RegExp(`${BASE}\\?isin=${SAMSUNG.isin}&d=${d}$`));
    const card = page.locator('[data-slot="tick-state"][data-variant="converting"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('삼성전자');
    await expect(card).toContainText('약 4분 · 끝나면 자동으로 열려요');
    await expect(card.getByRole('progressbar')).toBeVisible();
    expect(rec.convert).toEqual([{ isin: SAMSUNG.isin, d, ex: 'KRX' }]);

    // 실제 5초 간격 — open 2회째(running) · 3회째(grid) → 자동으로 열린다.
    await expect(page.locator('[data-slot="tick-body"]')).toBeVisible({ timeout: 15_000 });
    await expect(card).toHaveCount(0);
    expect(rec.convert).toHaveLength(1);
    expect(rec.open.filter((k) => k === `${SAMSUNG.isin}/${d}/KRX`).length).toBe(3);
  });

  test('게이트 — /api/ticks 403 → DmaGate 「틱 전문 뷰어는 …」', async ({ page }) => {
    await mockTickApi(page, { forbid: true });
    await page.goto(`${BASE}?d=${TICK_DATE}`);
    const gate = page.locator('[data-slot="dma-gate"]');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toContainText('틱 전문 뷰어는 증권사 계정이 연결된 사용자만 이용할 수 있어요.');
    await expect(page.locator('[data-slot="tick-entry"]')).toHaveCount(0);
  });

  test('자료 없음 — 토요일 → 휴장 카드 → 「최근 거래일로」 → 최근 격자 날짜', async ({ page }) => {
    const sat = lastSaturday();
    await mockTickApi(page);
    await page.goto(`${BASE}?d=${sat}`);
    const card = page.locator('[data-slot="tick-state"][data-variant="nodata"]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('자료가 없어요');
    await expect(card).toContainText('거래일이 아니에요');
    await card.getByRole('button', { name: '최근 거래일로' }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE}\\?d=${TICK_DATE}$`));
    await expect(entryRows(page)).toHaveCount(3);
  });
});
