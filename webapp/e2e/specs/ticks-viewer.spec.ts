import { test, expect, type Page } from '@playwright/test';

import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';
import { withLocalRelay, type LocalRelay } from '../fixtures/relay';
import {
  ECO,
  ECO_OWN,
  SAMSUNG,
  SKH,
  TICK_DATE,
  lastSaturday,
  tickGridUrl,
  mockTickApi,
  mockTickLive,
  recentTradingDay,
  tickLiveChunks,
  tickOpenFixture,
} from '../fixtures/ticks';

/**
 * Phase 37 Plan 08 Task 3 — 틱뷰어 진입 실브라우저 E2E (D-03 · D-08 · D-16 · D-18).
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
 * ④ (37-10) 뷰어 본문: 서명 URL(`storage.test`)을 `page.route` 로 가로채 shared 골든 픽스처 `cut1300-krx.ticks.zst`
 *   (에코앤드림 10/16 13:00~13:59 · 11,990 레코드 · 단일 보드 G1 이라 거래소순 = msg_seq 순 · 한 행 = seq +1)를 준다.
 *   실브라우저에서만 보이는 것 — fzstd 스트리밍 해제 · 창 키 처리 · `history.replaceState` 의 URL `t`(Next 15 동기화) ·
 *   새로고침 뒤 같은 시각 · 서명 만료 403 → open 재호출 1회.
 * ⑤ (37-19) 당일: `page.clock.setFixedTime` 으로 「지금」 = 2026-10-16(금) 13:50 KST — 픽스처 날짜가 오늘이 된다(타이머는 진짜 ·
 *   폴링 간격 5초 · 받는 중 2초를 실제로 기다린다). `/api/ticks/live` 는 `mockTickLive`(컷 13시 KRX 를 13:30 에서 나눈 두 덩이)
 *   — `mockTickApi` 뒤에 등록해야 그 라우트가 이긴다(나중 등록 우선). 커서 이동은 키(Shift+←)로 한다(픽셀 클릭 금지).
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

/** 진입 표가 카드(overflow-hidden) 안에 다 들어가는가 — 카드가 잘라 먹으면 문서 가로 스크롤 검사로는 안 잡힌다. */
async function expectEntryTableFits(page: Page, tag: string): Promise<void> {
  const o = await page.evaluate(() => {
    const t = document.querySelector('[data-slot="tick-entry"] table');
    const card = t?.parentElement ?? null;
    return t === null || card === null ? null : { table: t.scrollWidth, card: card.clientWidth };
  });
  expect(o, `${tag} 진입 표`).not.toBeNull();
  expect(o!.table, `${tag} 진입 표 폭 ≤ 카드 폭`).toBeLessThanOrEqual(o!.card);
}

/**
 * 시가 · 고가는 카드 폭 문턱(T_OH) 이상이면 열 · 미만이면 등락률 칸 보조 줄 — 행 i 에서 둘 중 정확히 하나만 보인다
 * (quick 261104-n9h). 어느 쪽인지 돌려준다.
 */
async function expectOhExactlyOne(page: Page, i: number, tag: string): Promise<'col' | 'line'> {
  const row = page.locator('[data-slot="tick-entry-row"]').nth(i);
  const col = await row.locator('[data-slot="tick-entry-open"]').isVisible();
  const high = await row.locator('[data-slot="tick-entry-high"]').isVisible();
  const line = await row.locator('[data-slot="tick-entry-oh-line"]').isVisible();
  expect(col, `${tag} 시가 · 고가 열은 함께 보이거나 함께 숨는다`).toBe(high);
  expect(col !== line, `${tag} 시가 · 고가 = 열 또는 보조 줄 중 정확히 하나`).toBe(true);
  return col ? 'col' : 'line';
}

test.describe('틱뷰어 진입 (Phase 37 D-16)', () => {
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
    // 등락률순(종가 기준) — 에코앤드림 KRX(+27.9%) · NXT(+13.6%) · SK하이닉스(−0.2%)
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
    // 37-10 — 열리면 서명 URL 격자를 받아 호가 10단까지 그린다(NXT 픽스처 바이트).
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    expect(rec.open).toEqual([`${ECO.isin}/${TICK_DATE}/NXT`]);
    expect(rec.grid).toHaveLength(1);
    expect(rec.convert).toHaveLength(0);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${BASE}\\?d=${TICK_DATE}$`));
    await expect(entryRows(page)).toHaveCount(3);
    // 머리 ‹ 목록으로(2026-11-03) — 같은 날짜 · 거래소 목록으로(딥링크로 들어와도 동작)
    await entryRows(page).nth(1).click();
    await expect(header.getByRole('heading')).toContainText(ECO.name);
    await header.getByRole('button', { name: '목록으로' }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE}\\?d=${TICK_DATE}(&ex=NXT)?$`));
    await expect(entryRows(page)).toHaveCount(3);
    await expect(header.locator('[data-slot="tick-back"]')).toHaveCount(0);
  });

  test('진입 — 팀 열 · 정렬 · 폰 한 줄(quick 261103-j4d)', async ({ page }) => {
    await mockTickApi(page);
    await page.goto(`${BASE}?d=${TICK_DATE}`);
    await expect(page.getByRole('heading', { name: '10/16 격자 종목' })).toBeVisible({ timeout: 30_000 });
    await expect(entryRows(page)).toHaveCount(3);

    const teamCells = (i: number) =>
      ['tick-entry-day-net', 'tick-entry-cum', 'tick-entry-pnl'].map((s) => entryRows(page).nth(i).locator(`[data-slot="${s}"]`));
    // 1280 — 등락률순 0행 = 에코앤드림 KRX · 3칸
    for (const [cell, want] of teamCells(0).map((c, k) => [c, ['−3.12억', '+45.2억', '+1.84억'][k]!] as const)) {
      await expect(cell).toBeVisible();
      await expect(cell).toHaveText(want);
    }
    // SK하이닉스(팀 체결 없음 · 매집감지 미등록) — 「—」 셋
    for (const cell of teamCells(2)) await expect(cell).toHaveText('—');
    await expect(entryRows(page).nth(0).locator('[data-slot="tick-entry-team-line"]')).toBeHidden();
    // 시가 · 고가 열(quick 261104-n9h) — 1280 카드 폭은 문턱 이상이라 열 · 보조 줄 숨김 · NXT 시가 「—」
    const row0 = entryRows(page).nth(0);
    await expect(row0.locator('[data-slot="tick-entry-rate"] b')).toHaveText('+27.9%');
    await expect(row0.locator('[data-slot="tick-entry-open"]')).toBeVisible();
    await expect(row0.locator('[data-slot="tick-entry-open"]')).toHaveText('+3.1%');
    await expect(row0.locator('[data-slot="tick-entry-high"]')).toHaveText('+29.9%');
    await expect(row0.locator('[data-slot="tick-entry-oh-line"]')).toBeHidden();
    await expect(entryRows(page).nth(1).locator('[data-slot="tick-entry-open"]')).toHaveText('—');
    await expectEntryTableFits(page, '진입 팀 열 1280');

    // 순매수순 — NXT(+8,900만) 가 맨 위 · 손익순 — KRX(+1.84억) 맨 위 · 값 없는 SK하이닉스는 맨 뒤
    await page.getByRole('button', { name: '순매수순' }).click();
    await expect(entryRows(page).nth(0)).toHaveAttribute('data-ex', 'NXT');
    await expect(entryRows(page).nth(2)).toHaveAttribute('data-isin', SKH.isin);
    await page.getByRole('button', { name: '손익순' }).click();
    await expect(entryRows(page).nth(0)).toHaveAttribute('data-ex', 'KRX');
    await expect(entryRows(page).nth(0)).toHaveAttribute('data-isin', ECO.isin);
    await expect(entryRows(page).nth(2)).toHaveAttribute('data-isin', SKH.isin);
    await expectNoHorizontalScroll(page, '진입 팀 열 1280');

    // 1024 · 700 · 640 — 3열 그대로(sm 이상) · 가로 넘침 0 · 시가 · 고가는 열 또는 보조 줄 중 하나
    for (const w of [1024, 700, 640]) {
      await page.setViewportSize({ width: w, height: 800 });
      await expect(teamCells(0)[0]!).toBeVisible();
      await expectNoHorizontalScroll(page, `진입 팀 열 ${w}`);
      await expectEntryTableFits(page, `진입 팀 열 ${w}`);
      await expectOhExactlyOne(page, 0, `진입 ${w}`);
    }

    // 390 — 3열 숨김 · 이름 밑 한 줄
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(teamCells(0)[0]!).toBeHidden();
    const line = entryRows(page).nth(0).locator('[data-slot="tick-entry-team-line"]');
    await expect(line).toBeVisible();
    await expect(line).toHaveText('순매수 −3.12억 · 누적 +45.2억 · 손익 +1.84억');
    // 시가 · 고가 칸 숨김 · 등락률 칸 보조 두 줄
    await expect(entryRows(page).nth(0).locator('[data-slot="tick-entry-open"]')).toBeHidden();
    await expect(entryRows(page).nth(0).locator('[data-slot="tick-entry-high"]')).toBeHidden();
    const oh = entryRows(page).nth(0).locator('[data-slot="tick-entry-oh-line"]');
    await expect(oh).toBeVisible();
    await expect(oh).toContainText('시 +3.1%');
    await expect(oh).toContainText('고 +29.9%');
    await expectNoHorizontalScroll(page, '진입 팀 열 390');
    await expectEntryTableFits(page, '진입 팀 열 390');
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

  test('게이트 — /api/ticks 403 → DmaGate 「틱뷰어는 …」', async ({ page }) => {
    await mockTickApi(page, { forbid: true });
    await page.goto(`${BASE}?d=${TICK_DATE}`);
    const gate = page.locator('[data-slot="dma-gate"]');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toContainText('틱뷰어는 증권사 계정이 연결된 사용자만 이용할 수 있어요.');
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

test.describe('틱뷰어 본문 — 격자 · 키 · 딥링크 (Phase 37 D-00 · D-18)', () => {
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

  const OPEN_URL = `${BASE}?isin=${ECO.isin}&d=${TICK_DATE}`;
  const current = (page: Page) => page.locator('[data-slot="tick-current"]');
  /** 머리 「HH:MM:SS.mmm · #seq」 → { time, seq }. */
  async function tickOf(page: Page): Promise<{ time: string; seq: number }> {
    const text = (await current(page).textContent()) ?? '';
    const m = /^(\d{2}:\d{2}:\d{2}\.\d{3}) · #(\d+)$/.exec(text.trim());
    expect(m, `머리 틱 라벨 형식: ${text}`).not.toBeNull();
    return { time: m![1]!, seq: Number(m![2]) };
  }
  const tParam = (page: Page) => new URL(page.url()).searchParams.get('t');

  test('열기 — 서명 URL 격자 → 호가 10단 · 머리 시각 13:…', async ({ page }) => {
    const rec = await mockTickApi(page);
    await page.goto(OPEN_URL);
    const book = page.locator('[data-slot="tick-book"]');
    await expect(book).toBeVisible({ timeout: 30_000 });
    await expect(current(page)).toHaveText(/^13:\d{2}:\d{2}\.\d{3} · #\d+$/);
    expect(rec.grid).toEqual([tickGridUrl({ isin: ECO.isin, d: TICK_DATE, ex: 'KRX' })]);
    expect(rec.open).toHaveLength(1);
    // 컷 13시 픽스처의 첫 틱은 A3(seq 70637)이고 첫 B6(70638)보다 먼저 온다 —
    // 그 앞에 B6 가 없으니 열기 직후 호가는 「호가 없음」 이 맞다.
    await expect(book.locator('[data-slot="tick-book-empty"]')).toBeVisible();
    await expect(page.locator('[data-slot="tick-density-bar"]')).toHaveCount(144);
    await expectNoHorizontalScroll(page, '뷰어 1280');
    // 열기만으로는 URL 에 t 를 쓰지 않는다
    expect(tParam(page)).toBeNull();
    // 한 틱 다음(첫 B6) → 호가 20행 + 바닥 줄
    await book.locator('h2').click();
    await page.keyboard.press('ArrowRight');
    await expect(book.locator('[data-slot="tick-book-row"]')).toHaveCount(20);
    // 「주 | 금액」 — 기본 금액(2026-11-03) · 주로 바꾸면 총잔량
    await expect(book.getByRole('button', { name: '금액' })).toHaveAttribute('aria-pressed', 'true');
    await expect(book.locator('[data-slot="tick-book-total"]')).toContainText('합산 금액');
    await book.getByRole('button', { name: '주', exact: true }).click();
    await expect(book.locator('[data-slot="tick-book-total"]')).toContainText('총잔량');
    await expectNoHorizontalScroll(page, '뷰어 1280 호가');
  });

  test('키 — → 세 번 → URL t 갱신 · history.length 그대로 · Shift+→ 10행', async ({ page }) => {
    await mockTickApi(page);
    await page.goto(OPEN_URL);
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    // 포커스를 본문으로(입력창에 있으면 키를 가로채지 않는 것이 계약이다)
    await page.locator('[data-slot="tick-book"] h2').click();
    const before = await tickOf(page);
    const histBefore = await page.evaluate(() => history.length);

    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await tickOf(page)).seq).toBe(before.seq + 3);
    const after3 = await tickOf(page);
    await expect.poll(() => tParam(page)).toBe(after3.time);
    expect(await page.evaluate(() => history.length)).toBe(histBefore);

    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => (await tickOf(page)).seq).toBe(before.seq + 13);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await tickOf(page)).seq).toBe(before.seq + 12);
    const now = await tickOf(page);
    await expect.poll(() => tParam(page)).toBe(now.time);
    expect(await page.evaluate(() => history.length)).toBe(histBefore);
  });

  test('재생 중(최대 속도) ‹ 목록으로 → 이동이 버려지지 않는다 · URL 에 isin 없음 · 목록 화면(WR-60)', async ({ page }) => {
    await mockTickApi(page);
    await page.goto(OPEN_URL);
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    const slider = page.locator('[data-slot="tick-slider"]');
    await slider.getByRole('group', { name: '재생 속도' }).getByRole('button', { name: '최대' }).click();
    await slider.getByRole('button', { name: '재생' }).click();
    // 커서가 움직이며 URL t 를 쓰고 있다(250ms 스로틀 replaceState)
    await expect.poll(() => tParam(page)).not.toBeNull();
    await page.locator('[data-slot="tick-header"]').getByRole('button', { name: '목록으로' }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE}\\?d=${TICK_DATE}$`));
    await expect(entryRows(page).first()).toBeVisible();
    await expect(page.locator('[data-slot="tick-book"]')).toHaveCount(0);
  });

  /** 최대 속도 재생을 켜고 커서가 URL t 를 쓰기 시작할 때까지 기다린다. */
  async function playMax(page: Page): Promise<void> {
    const slider = page.locator('[data-slot="tick-slider"]');
    await slider.getByRole('group', { name: '재생 속도' }).getByRole('button', { name: '최대' }).click();
    await slider.getByRole('button', { name: '재생' }).click();
    await expect.poll(() => tParam(page)).not.toBeNull();
  }

  test('재생 중(최대 속도) 사이드바 「홈」 링크 → 이동이 버려지지 않는다 · 홈 화면 · URL 이 다시 뷰어로 바뀌지 않는다(R2-WR-30)', async ({
    page,
  }) => {
    await mockTickApi(page);
    await page.goto(OPEN_URL);
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    await playMax(page);
    await page.getByRole('link', { name: '홈', exact: true }).first().click();
    await expect(page).toHaveURL((u) => u.pathname === '/' && u.search === '');
    await expect(page.getByRole('heading', { name: '주도 테마' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-slot="tick-book"]')).toHaveCount(0);
    // 내려가던 뷰어의 늦은 쓰기가 새 항목을 덮지 않는다(250ms 스로틀의 몇 배를 기다린다)
    await page.waitForTimeout(1_000);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('재생 중(최대 속도) 브라우저 뒤로 → 목록 · history.length 그대로 · 목록 항목이 뷰어 URL 로 덮이지 않는다(R2-WR-30)', async ({
    page,
  }) => {
    await mockTickApi(page);
    await page.goto(`${BASE}?d=${TICK_DATE}`);
    await expect(entryRows(page)).toHaveCount(3, { timeout: 30_000 });
    await entryRows(page).nth(0).click(); // 에코앤드림 KRX — push(목록 항목 위에 뷰어 항목)
    await expect(page).toHaveURL(new RegExp(`${BASE}\\?isin=${ECO.isin}&d=${TICK_DATE}$`));
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    await playMax(page);
    const histBefore = await page.evaluate(() => history.length);

    await page.goBack();
    const LIST_RE = new RegExp(`${BASE}\\?d=${TICK_DATE}$`);
    await expect(page).toHaveURL(LIST_RE);
    await expect(entryRows(page)).toHaveCount(3);
    await expect(page.locator('[data-slot="tick-book"]')).toHaveCount(0);
    await page.waitForTimeout(1_000);
    await expect(page).toHaveURL(LIST_RE);
    await expect(page.locator('[data-slot="tick-book"]')).toHaveCount(0);
    expect(await page.evaluate(() => history.length)).toBe(histBefore);

    // 두 항목이 모두 살아 있다 — 앞으로 = 뷰어(재생하던 자리 t) · 다시 뒤로 = 목록
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${BASE}\\?isin=${ECO.isin}&d=${TICK_DATE}(&t=[^&]+)?(&k=\\d+)?$`));
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    await page.goBack();
    await expect(page).toHaveURL(LIST_RE);
    await expect(entryRows(page)).toHaveCount(3);
  });

  test('딥링크 — t=13:30:00.000 → 그 시각 이후 첫 틱 · 새로고침해도 같은 시각', async ({ page }) => {
    const rec = await mockTickApi(page);
    await page.goto(`${OPEN_URL}&t=13:30:00.000`);
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    const first = await tickOf(page);
    expect(first.time >= '13:30:00.000').toBe(true);
    expect(first.time < '13:31:00.000').toBe(true);

    // 한 틱 옮겨 URL t 를 그 틱 시각으로 → 새로고침 → 같은 시각
    await page.locator('[data-slot="tick-book"] h2').click();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await tickOf(page)).seq).toBe(first.seq + 1);
    const moved = await tickOf(page);
    await expect.poll(() => tParam(page)).toBe(moved.time);
    await page.reload();
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await tickOf(page)).time).toBe(moved.time);
    // 같은 ms 안 버스트 조각이어도 같은 틱(seq)으로 돌아온다 — URL k(WR-65)
    expect((await tickOf(page)).seq).toBe(moved.seq);
    expect(rec.open.length).toBe(2); // 처음 + 새로고침 — 틱 이동으로 다시 열지 않는다
  });

  test('점프 — 시각 입력 13:45:00 + Enter → 그 시각 이후 첫 틱 · 잘못된 형식은 빨간 테두리', async ({ page }) => {
    await mockTickApi(page);
    await page.goto(OPEN_URL);
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    const input = page.getByRole('textbox', { name: '틱 시각' });
    await input.fill('13:45:00');
    await input.press('Enter');
    await expect.poll(async () => (await tickOf(page)).time.slice(0, 5)).toBe('13:45');
    const t = await tickOf(page);
    expect(t.time >= '13:45:00.000').toBe(true);
    await expect.poll(() => tParam(page)).toBe(t.time);

    await input.fill('25:99');
    await input.press('Enter');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect((await tickOf(page)).seq).toBe(t.seq);
  });

  test('만료 — 첫 격자 요청 403 → open 재호출 1회 → 새 URL 로 열림', async ({ page }) => {
    const rec = await mockTickApi(page, { expireFirstGrid: true });
    await page.goto(OPEN_URL);
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    const q = { isin: ECO.isin, d: TICK_DATE, ex: 'KRX' as const };
    expect(rec.grid).toEqual([tickGridUrl(q, 1), tickGridUrl(q, 2)]);
    expect(rec.open).toEqual([`${ECO.isin}/${TICK_DATE}/KRX`, `${ECO.isin}/${TICK_DATE}/KRX`]);
  });
});

/**
 * (37-13) 전문 목록 ↔ 커서 ↔ 호가 · 수신순 토글 · 다음 역전 · 오른쪽 열 카드 · 폰 탭.
 * 컷 13시 KRX 픽스처는 다조각 역전 84(오라클 inverted 84/182)를 가진다 — 「↕ 다음 역전」 · 점선 자리가 반드시 있다.
 */
test.describe('틱뷰어 전문 목록 — 행 그룹 · 뒤집힘 · 이 주문 (Phase 37 D-00 · D-20)', () => {
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

  const OPEN_URL = `${BASE}?isin=${ECO.isin}&d=${TICK_DATE}`;
  const msg = (page: Page) => page.locator('[data-slot="tick-msg"]');
  const selectedRow = (page: Page) => msg(page).locator('[data-slot="tick-msg-row"][aria-selected="true"]');
  async function curSeq(page: Page): Promise<number> {
    const text = (await page.locator('[data-slot="tick-current"]').textContent()) ?? '';
    const m = / · #(\d+)$/.exec(text.trim());
    expect(m, `머리 틱 라벨: ${text}`).not.toBeNull();
    return Number(m![1]);
  }
  const fmt = (n: number) => n.toLocaleString('ko-KR');

  test('목록 — 행 클릭 → 머리 seq · 호가 기준 seq · 이 주문 카드가 그 틱으로', async ({ page }) => {
    await mockTickApi(page);
    await page.goto(OPEN_URL);
    await expect(msg(page)).toBeVisible({ timeout: 30_000 });
    await expect(msg(page)).toHaveAttribute('data-mode', 'exchange');
    // 가상화 — 1.2만 행이어도 DOM 행은 ~60 이하
    expect(await msg(page).locator('[data-slot="tick-msg-row"]').count()).toBeLessThan(80);
    await expect(selectedRow(page)).toHaveCount(1);

    const b6 = msg(page).locator('[data-slot="tick-msg-row"][data-tag="B6"]').nth(3);
    const seq = Number(await b6.getAttribute('data-seq'));
    await b6.click();
    await expect.poll(() => curSeq(page)).toBe(seq);
    await expect(selectedRow(page)).toHaveAttribute('data-seq', String(seq));
    await expect(page.locator('[data-slot="tick-book-meta"]')).toContainText(`호가 기준 seq ${fmt(seq)}`);
    await expect(page.locator('[data-slot="tick-order-card"]')).toBeVisible();
    await expect(page.locator('[data-slot="tick-amount-value"]')).toBeVisible();

    // 꼬리 줄 — 2조각 이상 주문이 화면 안에 있으면 「┗ n조각」
    const tail = msg(page).locator('[data-slot="tick-msg-tail"]').first();
    if ((await tail.count()) > 0) await expect(tail).toContainText(/┗ \d+조각 \d+단/);
    await expectNoHorizontalScroll(page, '전문 목록 1280');
  });

  test('↕ 다음 역전 → 먼저 온 B6 · 수신순 토글 → 같은 틱 · 점선 거래소순 자리 → 클릭 = 그 B6', async ({ page }) => {
    await mockTickApi(page);
    await page.goto(OPEN_URL);
    await expect(msg(page)).toBeVisible({ timeout: 30_000 });

    await msg(page).getByRole('button', { name: '↕ 다음 역전' }).click();
    const sel = selectedRow(page);
    await expect(sel).toHaveAttribute('data-tag', 'B6');
    await expect(sel.locator('[data-slot="tick-msg-inv-mark"]')).toHaveCount(1);
    await expect(sel).toContainText('↕ 수신은');
    const invSeq = Number(await sel.getAttribute('data-seq'));
    await expect.poll(() => curSeq(page)).toBe(invSeq);

    await msg(page).getByRole('button', { name: '수신순' }).click();
    await expect(msg(page)).toHaveAttribute('data-mode', 'recv');
    await expect.poll(() => curSeq(page)).toBe(invSeq);
    await expect(selectedRow(page)).toContainText('먼저 수신');
    // 그 B6 의 msg_seq 제자리(아래쪽) 점선 줄
    const invRec = (await selectedRow(page).getAttribute('data-rec'))!;
    const slot = msg(page).locator(`[data-slot="tick-msg-slot"][data-rec="${invRec}"]`);
    await expect(slot).toBeVisible();
    await expect(slot).toContainText('거래소순 자리');

    // 한 틱 옮긴 뒤(수신순 다음 행) 점선 자리 클릭 = 그 B6 로 돌아온다
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => curSeq(page)).not.toBe(invSeq);
    await slot.click();
    await expect(selectedRow(page)).toHaveAttribute('data-rec', invRec);
    await expect.poll(() => curSeq(page)).toBe(invSeq);

    // 거래소순으로 돌아가면 점선 자리는 없다
    await msg(page).getByRole('button', { name: '거래소순' }).click();
    await expect(msg(page).locator('[data-slot="tick-msg-slot"]')).toHaveCount(0);
  });

  test('폰 390 — 세그먼트 「호가 | 전문 | 버스트 · 팀」 · 가로 넘침 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockTickApi(page);
    await page.goto(OPEN_URL);
    const seg = page.getByRole('group', { name: '보기', exact: true });
    await expect(seg).toBeVisible({ timeout: 30_000 });
    await expect(seg.getByRole('button')).toHaveText(['호가', '전문', '버스트 · 팀']);

    await seg.getByRole('button', { name: '전문', exact: true }).click();
    await expect(msg(page)).toBeVisible();
    await expect(page.locator('[data-slot="tick-book"]')).toBeHidden();
    await expectNoHorizontalScroll(page, '폰 전문');

    await seg.getByRole('button', { name: '버스트 · 팀' }).click();
    await expect(page.locator('[data-slot="tick-order-card"]')).toBeVisible();
    await expect(msg(page)).toBeHidden();
    await expectNoHorizontalScroll(page, '폰 버스트');
  });
});

test.describe('틱뷰어 3판 차트 · 팀 거래정보 (Phase 37 D-00 ① · D-09 ~ D-12 · 37-14)', () => {
  let relay: LocalRelay;

  test.beforeAll(async () => {
    relay = await withLocalRelay();
  });

  test.afterAll(async () => {
    await relay.stop();
  });

  test.beforeEach(async ({ page }) => {
    relay.reset();
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockStockApi(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
  });

  const OPEN_URL = `${BASE}?isin=${ECO.isin}&d=${TICK_DATE}`;
  const chart = (page: Page) => page.locator('[data-slot="tick-chart"]');
  const svg = (page: Page) => page.locator('[data-slot="tick-chart-svg"]');
  const span = (page: Page) => page.locator('[data-slot="tick-chart-span"]');
  const curTime = async (page: Page) =>
    ((await page.locator('[data-slot="tick-current"]').textContent()) ?? '').trim().slice(0, 12);
  /** 하루 전체 창 08:00~20:00 · 그림 영역 [L, W − 52] · L = 52(가격 < 100만) — 시각(시간 단위 08시 기준) → svg 안 x. */
  async function xAt(page: Page, hoursFrom0800: number): Promise<number> {
    const box = (await svg(page).boundingBox())!;
    const L = 52;
    return L + (box.width - L - 52) * (hoursFrom0800 / 12);
  }

  test('차트 — 클릭 → 그 시각 이후 첫 틱(머리 시각 이동) · 데스크톱 307 · 누적 범례 · 가로 넘침 0', async ({ page }) => {
    await mockTickApi(page);
    await page.goto(OPEN_URL);
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    await expect(svg(page)).toHaveAttribute('data-dims', 'desktop');
    await expect(svg(page)).toHaveAttribute('height', '307');
    // 픽스처 accum = null → 누적 자료 없음(D-09)
    await expect(chart(page).locator('[data-slot="tick-chart-legend"]')).toHaveText('누적 자료 없음(매집감지 미등록)');
    await expect(span(page)).toHaveText('하루 전체');
    // 넷째 판(스케치 022 A) — 누적 거래대금 영역 · 왼쪽 축 = 시총 대비 %(상장주식수 있음)
    await expect(chart(page).locator('[data-slot="tick-turnover-area"]')).toHaveCount(1);
    await expect(chart(page).locator('[data-slot="tick-turnover-axis"]')).toContainText('%');

    // 13:24 = 08시 + 5.4h · y 200 = 10분 막대 판(원 · 커서 선을 피해 시각 클릭)
    await svg(page).click({ position: { x: await xAt(page, 5.4), y: 200 } });
    await expect.poll(() => curTime(page)).toMatch(/^13:2\d:/);
    await expect(page.locator('[data-slot="tick-chart-cursor"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="tick-chart-cursor-label"]')).toContainText(/^13:2\d:\d\d$/);
    await expectNoHorizontalScroll(page, '차트 1280');
  });

  test('차트 — 휠 확대 10회 오류 0 · 「10초」 버튼 = 커서 중심 10초 창 · 0 키 = 하루 전체', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockTickApi(page);
    await page.goto(OPEN_URL);
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });

    const box = (await svg(page).boundingBox())!;
    await page.mouse.move(box.x + (await xAt(page, 5.5)), box.y + 60);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -240);
    await expect(span(page)).not.toHaveText('하루 전체');

    await chart(page).getByRole('button', { name: '10초', exact: true }).click();
    await expect(span(page)).toHaveText('10초');
    // 커서 중심 창 — 커서 선 · 라벨이 보인다
    await expect(page.locator('[data-slot="tick-chart-cursor"]')).toHaveCount(1);

    await chart(page).getByRole('button', { name: '1분', exact: true }).click();
    await expect(span(page)).toHaveText('1분');
    await page.locator('[data-slot="tick-chart-wrap"]').focus();
    await page.keyboard.press('0');
    await expect(span(page)).toHaveText('하루 전체');
    expect(errors, '페이지 오류 0').toEqual([]);
  });

  test('팀 거래정보 — 캡션(최소치 · ≈1분 해상도) · 틱 이동 시 KPI 가 따라 바뀐다', async ({ page }) => {
    await mockTickApi(page);
    await page.goto(OPEN_URL);
    const panel = page.locator('[data-slot="tick-team-panel"]');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toContainText('우리 체결 포함 · 호가 걸어 둔 팀 주문 미포함(최소치)');
    await expect(panel).toContainText('≈1분 해상도');
    await expect(panel).not.toContainText('NXT 런 규칙');

    // 13:45 — 컷 13시 픽스처(13:00~13:48)의 팀 주문이 쌓인 뒤. 차트 픽셀 클릭은 판 폭에 따라 흔들려 딥링크로 옮긴다
    // (차트 클릭 이동 자체는 위 「차트 클릭」 절이 잠근다).
    await page.goto(`${OPEN_URL}&t=13:45:00.000`);
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => curTime(page)).toMatch(/^13:4[5-8]:/);
    await expect(panel.locator('[data-slot="tick-team-day-net"]')).not.toHaveText('—');
    await expect(panel.locator('[data-slot="tick-team-avg"]')).toBeVisible();
    await expectNoHorizontalScroll(page, '팀 패널 1280');
  });
});

test.describe('틱뷰어 당일 — 하루치 → 증분 · 새 틱 배지 · 끝으로 · 미결선 (Phase 37 D-05 · D-06 · D-18 · D-22 · 37-19)', () => {
  let relay: LocalRelay;

  test.beforeAll(async () => {
    relay = await withLocalRelay();
  });

  test.afterAll(async () => {
    await relay.stop();
  });

  test.beforeEach(async ({ page }) => {
    relay.reset();
    await page.setViewportSize({ width: 1280, height: 900 });
    // 「지금」 = 픽스처 날짜 13:50 KST(장중) — 오늘 경로를 탄다. 타이머는 진짜로 흐른다.
    await page.clock.setFixedTime(new Date('2026-10-16T13:50:00+09:00'));
    await mockStockApi(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
  });

  const TODAY_URL = `${BASE}?isin=${ECO.isin}&d=${TICK_DATE}`;
  const current = (page: Page) => page.locator('[data-slot="tick-current"]');
  const curTime = async (page: Page) => ((await current(page).textContent()) ?? '').trim().slice(0, 12);
  /** 오늘 열기 = 격자 · 요청 없음(당일 경로 대상). */
  const openNone = (q: { isin: string; d: string; ex: 'KRX' | 'NXT' }) => tickOpenFixture('none', q);

  test('당일 — 받는 중 카드(대기 2건) → 끝 틱 · 자동 갱신 없음 · 「최신 받기」 = 증분 1회 · 과거 틱이면 커서 제자리 + 「새 틱」 배지 · 끝으로', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await mockTickApi(page, { open: openNone, today: { live: true, date: TICK_DATE } });
    const live = await mockTickLive(page, { chunks: tickLiveChunks(['13:30:00']), queued: true, queue: 2 });
    await page.goto(TODAY_URL);

    // ① 받는 중 카드 — release 전까지 queued(대기 2건) · 2초마다 offset 0 이어 받기
    const card = page.locator('[data-slot="tick-state"][data-variant="live-loading"]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('하루치 받는 중');
    await expect(card).toContainText('대기 2건');
    expect(live.calls[0]).toEqual({ epoch: null, offset: 0 });

    // ② 풀어 주면 다음 이어 받기(2초)에 하루치 → 뷰어 · 끝 틱(13:30 직전) · 공급 배지 「당일」
    live.release();
    await expect(page.locator('[data-slot="tick-body"][data-supply="live"]')).toBeVisible({ timeout: 15_000 });
    // 하루치 요청은 전부 offset 0(queued 는 바이트 없음 · Offset-End 0) · 두 번째부터 epoch 를 싣는다
    expect(live.calls.every((c) => c.offset === 0)).toBe(true);
    expect(live.calls.slice(1).every((c) => c.epoch === 'e2e-epoch-1')).toBe(true);
    await expect.poll(() => curTime(page)).toMatch(/^13:(2\d|30):/);
    const dayEnd = await curTime(page);
    expect(dayEnd < '13:30:00.000').toBe(true);
    await expect(page.locator('[data-slot="tick-supply"]')).toHaveAttribute('data-supply', 'live');
    await expect(page.getByRole('button', { name: '끝으로', exact: true })).toBeVisible();

    // ③ 새 틱 공개 → 자동으로는 가져가지 않는다(2026-11-03 — 자동 갱신 없음)
    live.publish();
    const n0 = live.calls.length;
    await page.waitForTimeout(7_000); // 옛 폴링 주기(5초)보다 길게
    expect(live.calls.length, '버튼 전 증분 요청 0').toBe(n0);
    expect(await curTime(page)).toBe(dayEnd);

    // ④ 과거 틱(Shift+← 두 번 = 20행 뒤로) → 「최신 받기」 → 증분 1회 · 커서 제자리 · 「새 틱 n건」 배지
    const refresh = page.locator('[data-slot="tick-live-refresh"]');
    await page.locator('[data-slot="tick-book"] h2').click();
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    const badge = page.locator('[data-slot="tick-live-badge"]');
    await expect(badge).toHaveCount(0);
    const back = await curTime(page);
    await refresh.click();
    await expect.poll(() => live.calls.length, { timeout: 5_000 }).toBe(n0 + 1);
    expect(live.calls.at(-1)!.offset).toBeGreaterThan(0);
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('새 틱');
    expect(await curTime(page)).toBe(back);

    // ⑤ 배지 클릭(= 끝으로) → 요청 없이 새 끝 틱(13:48) · 배지 사라짐
    await badge.click();
    await expect(badge).toHaveCount(0);
    await expect.poll(() => curTime(page)).toMatch(/^13:4[5-8]:/);
    expect(live.calls.length).toBe(n0 + 1);
    await expect(refresh).toHaveText('최신 받기');
    await expectNoHorizontalScroll(page, '당일 1280');
  });

  test('오늘 목록 — 매집감지 팀 3칸 · ≈ 추정 손익 · 시가 · 고가 · 넘침 0(quick 261104-n9h)', async ({ page }) => {
    await mockTickApi(page, { today: { live: true, date: TICK_DATE } });
    await page.goto(BASE);
    await expect(page.getByRole('heading', { name: '오늘 종목' })).toBeVisible({ timeout: 30_000 });
    await expect(entryRows(page)).toHaveCount(2);

    // 1280 — 등락률순(현재가) 0행 = 에코앤드림(+22.1%) · 1행 = SK하이닉스(+16.0% · 옛 RPC 모양)
    const eco = entryRows(page).nth(0);
    const skh = entryRows(page).nth(1);
    await expect(eco).toHaveAttribute('data-isin', ECO.isin);
    await expect(skh).toHaveAttribute('data-isin', SKH.isin);
    await expect(eco.locator('[data-slot="tick-entry-rate"] b')).toHaveText('+22.1%');
    await expect(eco.locator('[data-slot="tick-entry-open"]')).toHaveText('+3.0%');
    await expect(eco.locator('[data-slot="tick-entry-high"]')).toHaveText('+29.9%');
    await expect(eco.locator('[data-slot="tick-entry-day-net"]')).toHaveText('+4.50억');
    await expect(eco.locator('[data-slot="tick-entry-cum"]')).toHaveText('+45.2억');
    const pnl = eco.locator('[data-slot="tick-entry-pnl"]');
    await expect(pnl).toHaveText('≈+1.50억');
    await expect(pnl).toHaveAttribute('title', /추정/);
    for (const s of ['tick-entry-day-net', 'tick-entry-cum', 'tick-entry-pnl', 'tick-entry-open']) {
      await expect(skh.locator(`[data-slot="${s}"]`)).toHaveText('—');
    }
    await expectNoHorizontalScroll(page, '오늘 목록 1280');
    await expectEntryTableFits(page, '오늘 목록 1280');

    for (const w of [1024, 700, 640]) {
      await page.setViewportSize({ width: w, height: 800 });
      await expect(eco.locator('[data-slot="tick-entry-day-net"]')).toBeVisible();
      await expectNoHorizontalScroll(page, `오늘 목록 ${w}`);
      await expectEntryTableFits(page, `오늘 목록 ${w}`);
      await expectOhExactlyOne(page, 0, `오늘 목록 ${w}`);
    }

    // 390 — 폰 한 줄 · 보조 줄
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(eco.locator('[data-slot="tick-entry-team-line"]')).toHaveText('순매수 +4.50억 · 누적 +45.2억 · 손익 ≈+1.50억');
    const oh = eco.locator('[data-slot="tick-entry-oh-line"]');
    await expect(oh).toBeVisible();
    await expect(oh).toContainText('시 +3.0%');
    await expect(oh).toContainText('고 +29.9%');
    await expectNoHorizontalScroll(page, '오늘 목록 390');
    await expectEntryTableFits(page, '오늘 목록 390');
  });

  test('미결선 — today live=false → 오늘 종목 열기 → 「당일 자료 준비 중」 · /api/ticks/live 요청 0', async ({ page }) => {
    await mockTickApi(page, { open: openNone, today: { live: false, date: TICK_DATE } });
    const live = await mockTickLive(page, { chunks: tickLiveChunks(['13:30:00']) });
    await page.goto(TODAY_URL);
    const card = page.locator('[data-slot="tick-state"][data-variant="live-unavailable"]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('당일 자료 준비 중');
    await page.waitForTimeout(3_000);
    expect(live.calls, '미결선이면 당일 요청 0').toEqual([]);
  });
});

/**
 * (38-09) 우리 주문 · 체결 — `/api/ticks/own` 목(`tickOwnFixture` · 값은 컷 13시 KRX 격자에서 유도 — fixtures `ECO_OWN` 주석)으로
 * 에코앤드림 10/16 KRX 를 열어 칩 · 주문 줄 · 짝 없음 줄 · 둘째 레일 · 제목 줄 알약 · `]` · 카드 섹션 · 표 · 「보기 ›」 · 되돌아가기를
 * 한 흐름으로 잠근다(SC-2 · SC-3 · D-04 · D-05 · D-07 · D-09 · D-10 · D-12). own 실패 내성(Pitfall 5) · 당일 「최신 받기」 1회 = own 1회
 * (SC-4 · 공식 API 기준 3) · 폰 390 레일 · 세그먼트(D-04 · D-07 ④)도 여기서 본다. 37 절은 기본 목이 같은 own 을 주므로 우리 층이
 * 켜진 화면에서 돈다(둘째 레일 열 추가 회귀).
 */
test.describe('틱뷰어 우리 주문 · 체결 (Phase 38)', () => {
  let relay: LocalRelay;

  test.beforeAll(async () => {
    relay = await withLocalRelay();
  });

  test.afterAll(async () => {
    await relay.stop();
  });

  test.beforeEach(async ({ page }) => {
    relay.reset();
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockStockApi(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
  });

  const OPEN_URL = `${BASE}?isin=${ECO.isin}&d=${TICK_DATE}`;
  const msg = (page: Page) => page.locator('[data-slot="tick-msg"]');
  const selectedRow = (page: Page) => msg(page).locator('[data-slot="tick-msg-row"][aria-selected="true"]');
  const nav = (page: Page) => page.locator('[data-slot="tick-own-nav"]');
  async function curSeq(page: Page): Promise<number> {
    const text = (await page.locator('[data-slot="tick-current"]').textContent()) ?? '';
    const m = / · #(\d+)$/.exec(text.trim());
    return m ? Number(m[1]) : -1;
  }
  const fmt = (n: number) => n.toLocaleString('ko-KR');

  test('과거 — 칩 · 주문 줄 · 짝 없음 · 레일 · 알약 · ] · 카드 · 표 · 보기 › · 되돌아가기', async ({ page }) => {
    const rec = await mockTickApi(page);
    await page.goto(OPEN_URL);
    await expect(msg(page)).toBeVisible({ timeout: 30_000 });
    // 열 때 우리 체결 조회 정확히 1회
    await expect(nav(page)).toBeVisible();
    expect(rec.own).toEqual([`${ECO.isin}/${TICK_DATE}/KRX`]);
    await expect(nav(page)).toContainText('· 주문 3');

    // 13:30 으로 점프 → 우리 대상 앞(k 0) · 대상(UAT) = 근거 B6 → 주문 1 줄 → (a) → 주문 2 줄 → (b) → 주문 3 줄 → 짝 없음 줄
    const input = page.getByRole('textbox', { name: '틱 시각' });
    await input.fill('13:30:00');
    await input.press('Enter');
    await expect.poll(async () => ((await page.locator('[data-slot="tick-current"]').textContent()) ?? '').slice(0, 5)).toBe('13:30');
    await page.locator('[data-slot="tick-book"] h2').click();
    await expect(nav(page)).toContainText('◆ 우리 0/7 · 주문 3');
    await page.keyboard.press(']');
    await expect.poll(() => curSeq(page)).toBe(ECO_OWN.evidence.seq);
    await expect(nav(page)).toContainText('◆ 우리 1/7 · 주문 3');
    await page.keyboard.press(']');
    await expect(msg(page).locator('[data-slot="tick-own-order"][aria-selected="true"]')).toContainText(
      `#${ECO_OWN.a.orderNo}`,
    );
    await expect(nav(page)).toContainText('◆ 우리 2/7 · 주문 3');
    await page.keyboard.press(']');
    await expect.poll(() => curSeq(page)).toBe(ECO_OWN.a.seq);
    await expect(selectedRow(page)).toHaveAttribute('data-seq', String(ECO_OWN.a.seq));
    await expect(nav(page)).toContainText('◆ 우리 3/7 · 주문 3');
    // 행 칩 「우리/전체」 · 레일 ◆
    await expect(selectedRow(page).locator('[data-slot="tick-own-chip"]')).toHaveText(
      `${fmt(ECO_OWN.a.our)}/${fmt(ECO_OWN.a.total)}`,
    );
    await expect(selectedRow(page).locator('[data-slot="tick-own-rail"]')).toHaveAttribute('data-node', 'fill');
    // 주문 1 줄(● · 근거 호가 ↑) · 근거 B6 행 ○ · 직전 체결 ◌ — 같은 화면 안
    const order1 = msg(page).locator('[data-slot="tick-own-order"]', { hasText: `#${ECO_OWN.a.orderNo}` });
    await expect(order1).toContainText('● 주문 선매수 매수 10,340 ×500');
    await expect(order1).toContainText('근거 호가 ↑');
    await expect(order1).toContainText('KB120 ···0001');
    await expect(order1.locator('[data-slot="tick-own-rail"]')).toHaveAttribute('data-node', 'order');
    const evRow = msg(page).locator(`[data-slot="tick-msg-row"][data-seq="${ECO_OWN.evidence.seq}"]`);
    await expect(evRow.locator('[data-slot="tick-own-rail"]')).toHaveAttribute('data-node', 'evidence');
    const anchorRow = msg(page).locator(`[data-slot="tick-msg-row"][data-seq="${ECO_OWN.anchor.seq}"]`);
    await expect(anchorRow.locator('[data-slot="tick-own-rail"]')).toHaveAttribute('data-node', 'anchor');

    // 카드 「◆ 우리 주문 #…」 섹션(첫 탭) · 그날 「우리 주문」 표는 둘째 탭(스케치 026 A)
    const sideTab = (k: 'this' | 'own') => page.locator(`[data-slot="tick-side-tab"][data-tab="${k}"]`);
    await expect(sideTab('this')).toHaveAttribute('aria-selected', 'true');
    await expect(sideTab('own')).toContainText('우리 주문3');
    await expect(page.locator('[data-slot="tick-own-table"]')).toHaveCount(0);
    const section = page.locator('[data-slot="tick-own-section"]');
    await expect(section).toHaveCount(1);
    await expect(section).toContainText(`◆ 우리 주문 #${ECO_OWN.a.orderNo}`);
    await expect(section).toContainText('KB120 · 계좌 ···0001');
    await expect(section.locator('[data-k="fills"]')).toContainText(`${fmt(ECO_OWN.a.our)} / 전체 ${fmt(ECO_OWN.a.total)}`);
    await sideTab('own').click();
    await expect(page.locator('[data-slot="tick-order-card"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="tick-own-table-caption"]')).toHaveText(
      '이 날 3건 · 체결 3건 · 켜진 서버 KB120 · KYOBO119',
    );
    await expect(page.locator('[data-slot="tick-own-table-row"]')).toHaveCount(3);
    await expect(page.locator(`[data-slot="tick-own-table-row"][aria-selected="true"]`)).toHaveCount(1);
    // 거르기 — 매도 0 · 체결 있음 3(짝 없음도 체결)
    await page.locator('[data-slot="tick-own-filter"][data-filter="sell"]').click();
    await expect(page.locator('[data-slot="tick-own-table-row"]')).toHaveCount(0);
    await page.locator('[data-slot="tick-own-filter"][data-filter="all"]').click();
    // 행 클릭 = 그 주문 첫 체결 행으로 · 탭은 그대로
    await page.locator('[data-slot="tick-own-table-row"]').nth(1).click();
    await expect.poll(() => curSeq(page)).toBe(ECO_OWN.b.seq);
    await expect(sideTab('own')).toHaveAttribute('aria-selected', 'true');
    // 첫 탭으로 돌아와 (a) 로 · 섹션 이어서
    await sideTab('this').click();
    await page.locator('[data-slot="tick-own-table-row"]').first().waitFor({ state: 'detached' });
    const input2 = page.getByRole('textbox', { name: '틱 시각' });
    await input2.fill('13:30:00');
    await input2.press('Enter');
    await page.locator('[data-slot="tick-book"] h2').click();
    await page.keyboard.press(']');
    await page.keyboard.press(']');
    await page.keyboard.press(']');
    await expect.poll(() => curSeq(page)).toBe(ECO_OWN.a.seq);
    await expect(section).toHaveCount(1);

    // 「보기 ›」(근거) → 커서 = 근거 B6 · 되돌아가기 알약 → 누르면 주문 줄로 · 사라짐
    await section.locator('[data-slot="tick-own-jump"][data-to="evidence"]').click();
    await expect.poll(() => curSeq(page)).toBe(ECO_OWN.evidence.seq);
    await expect(selectedRow(page)).toHaveAttribute('data-tag', 'B6');
    const back = page.locator('[data-slot="tick-own-back"]');
    await expect(back).toHaveText(`‹ 주문 #${ECO_OWN.a.orderNo} 로`);
    await back.click();
    await expect(back).toHaveCount(0);
    await expect(msg(page).locator('[data-slot="tick-own-order"][aria-selected="true"]')).toContainText(
      `#${ECO_OWN.a.orderNo}`,
    );

    // 주문 1 줄 선택에서 ] → (a) · ] → 주문 2 줄 · ] → (b)(전량 — 분모 없음) · ] → 주문 3 줄 · ] → 짝 없음 줄 · 끝이면 › 비활성
    await expect(nav(page)).toContainText('◆ 우리 2/7');
    await page.keyboard.press(']');
    await expect.poll(() => curSeq(page)).toBe(ECO_OWN.a.seq);
    await page.keyboard.press(']');
    await expect(msg(page).locator('[data-slot="tick-own-order"][aria-selected="true"]')).toContainText(
      `#${ECO_OWN.b.orderNo}`,
    );
    await page.keyboard.press(']');
    await expect.poll(() => curSeq(page)).toBe(ECO_OWN.b.seq);
    await expect(nav(page)).toContainText('◆ 우리 5/7');
    await expect(selectedRow(page).locator('[data-slot="tick-own-chip"]')).toHaveText(fmt(ECO_OWN.b.qty));
    const order2 = msg(page).locator('[data-slot="tick-own-order"]', { hasText: `#${ECO_OWN.b.orderNo}` });
    await expect(order2).toContainText('조건 없음 · 수동 주문');
    await page.keyboard.press(']');
    await expect(msg(page).locator('[data-slot="tick-own-order"][aria-selected="true"]')).toContainText(
      `#${ECO_OWN.c.orderNo}`,
    );
    await expect(nav(page)).toContainText('◆ 우리 6/7');
    await page.keyboard.press(']');
    const nofill = msg(page).locator('[data-slot="tick-own-nofill"][aria-selected="true"]');
    await expect(nofill).toContainText(`◆ 우리 체결 ${fmt(ECO_OWN.c.qty)}주 · 짝 전문 없음`);
    await expect(nofill.locator('[data-slot="tick-own-rail"]')).toHaveAttribute('data-node', 'nofill');
    await expect(nav(page)).toContainText('◆ 우리 7/7');
    await expect(nav(page).getByRole('button', { name: '다음 우리 근거 · 주문 · 체결' })).toBeDisabled();
    // 짝 없음 주문(보조 주문 행 · limit_chaser) 줄도 있다
    await expect(msg(page).locator('[data-slot="tick-own-order"]', { hasText: `#${ECO_OWN.c.orderNo}` })).toBeVisible();

    // 탐색 · 카드 이동으로 다시 부르지 않는다
    expect(rec.own).toHaveLength(1);
    await expectNoHorizontalScroll(page, '우리 주문 1280');
  });

  // Pitfall 5 — own 이 실패해도 뷰어(호가 · 전문 목록 · 차트)는 그대로 · 우리 층과 오류 카드만 없다.
  async function expectOwnFailTolerant(page: Page, fail: { status: number }): Promise<void> {
    const rec = await mockTickApi(page, { own: () => fail });
    await page.goto(OPEN_URL);
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    await expect(msg(page)).toBeVisible();
    await expect(page.locator('[data-slot="tick-chart-svg"]')).toBeVisible();
    await expect.poll(() => rec.own.length).toBe(1);
    // 실패 응답이 반영될 시간을 준 뒤(재시도 없음) 우리 층 전부 0
    await page.waitForTimeout(1_000);
    expect(rec.own).toHaveLength(1);
    await expect(nav(page)).toHaveCount(0);
    await expect(page.locator('[data-slot="tick-own-chip"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="tick-own-order"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="tick-own-rail"][data-node]')).toHaveCount(0);
    await expect(page.locator('[data-slot="tick-own-table"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="tick-side-tabs"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="tick-state"]')).toHaveCount(0);
    // 37 동작 그대로 — 행 클릭 → 커서 · 이 주문 카드
    const b6 = msg(page).locator('[data-slot="tick-msg-row"][data-tag="B6"]').nth(3);
    const seq = Number(await b6.getAttribute('data-seq'));
    await b6.click();
    await expect.poll(() => curSeq(page)).toBe(seq);
    await expect(page.locator('[data-slot="tick-order-card"]')).toBeVisible();
  }

  test('실패 내성 — own 500 → 뷰어 그대로 · 우리 층 · 오류 카드 0', async ({ page }) => {
    await expectOwnFailTolerant(page, { status: 500 });
  });

  test('실패 내성 — own 404(목이 모르는 경로와 같음) → 뷰어 그대로 · 우리 층 · 오류 카드 0', async ({ page }) => {
    await expectOwnFailTolerant(page, { status: 404 });
  });

  test('당일 — 「↻ 최신 받기」 1회 = live 증분 1 + own 1 · 6초 기다려도 own 추가 0', async ({ page }) => {
    test.setTimeout(90_000);
    // 「지금」 = 픽스처 날짜 13:50 KST(장중) — 당일 경로(37 당일 절과 같은 꼴). 타이머는 진짜로 흐른다.
    await page.clock.setFixedTime(new Date('2026-10-16T13:50:00+09:00'));
    const rec = await mockTickApi(page, {
      open: (q) => tickOpenFixture('none', q),
      today: { live: true, date: TICK_DATE },
    });
    const live = await mockTickLive(page, { chunks: tickLiveChunks(['13:30:00']) });
    await page.goto(OPEN_URL);
    await expect(page.locator('[data-slot="tick-body"][data-supply="live"]')).toBeVisible({ timeout: 30_000 });
    // 끝 틱이 열린 뒤 우리 체결 조회 1회(당일 뷰어 마운트)
    await expect(nav(page)).toBeVisible();
    expect(rec.own).toEqual([`${ECO.isin}/${TICK_DATE}/KRX`]);
    const n0 = live.calls.length;

    live.publish();
    await page.locator('[data-slot="tick-live-refresh"]').click();
    await expect.poll(() => live.calls.length, { timeout: 5_000 }).toBe(n0 + 1);
    await expect.poll(() => rec.own.length, { timeout: 5_000 }).toBe(2);

    // 자동 갱신 없음 — 6초 동안 own · live 추가 0
    await page.waitForTimeout(6_000);
    expect(rec.own, '버튼 1회 = own 1회 · 타이머 없음').toHaveLength(2);
    expect(live.calls.length).toBe(n0 + 1);
    await expect(nav(page)).toContainText('· 주문 3');
  });

  test('폰 390 — 「전문」 둘째 레일 14px 칸 · 넘침 0 · 「버스트 · 팀」 우리 주문 표 · 1280 넘침 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockTickApi(page);
    await page.goto(`${OPEN_URL}&t=13:33:29.000`);
    const seg = page.getByRole('group', { name: '보기', exact: true });
    await expect(seg).toBeVisible({ timeout: 30_000 });

    await seg.getByRole('button', { name: '전문', exact: true }).click();
    await expect(msg(page)).toBeVisible();
    const rail = msg(page).locator('[data-slot="tick-own-rail"]').first();
    await expect(rail).toBeVisible();
    const w = (await rail.boundingBox())!.width;
    expect(Math.round(w), '둘째 레일 칸 14px').toBe(14);
    // 13:33:29 근처 — 주문 줄 ● · 근거 ○ 마디가 폰 목록에도 있다
    await expect(msg(page).locator('[data-slot="tick-own-order"]').first()).toBeVisible();
    await expect(msg(page).locator('[data-slot="tick-own-rail"][data-node="evidence"]')).toHaveCount(1);
    await expectNoHorizontalScroll(page, '폰 전문 우리 층');

    await seg.getByRole('button', { name: '버스트 · 팀' }).click();
    await page.locator('[data-slot="tick-side-tab"][data-tab="own"]').click();
    await expect(page.locator('[data-slot="tick-own-table"]')).toBeVisible();
    await expect(page.locator('[data-slot="tick-own-table-caption"]')).toHaveText(
      '이 날 3건 · 체결 3건 · 켜진 서버 KB120 · KYOBO119',
    );
    await expectNoHorizontalScroll(page, '폰 버스트 우리 표');

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(msg(page)).toBeVisible();
    await expectNoHorizontalScroll(page, '데스크톱 1280 우리 층');
  });
});
