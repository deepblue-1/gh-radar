import { test, expect, type Page } from '@playwright/test';

import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';
import { withLocalRelay, type LocalRelay } from '../fixtures/relay';
import {
  ECO,
  SAMSUNG,
  TICK_DATE,
  lastSaturday,
  tickGridUrl,
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
 * ④ (37-10) 뷰어 본문: 서명 URL(`storage.test`)을 `page.route` 로 가로채 shared 골든 픽스처 `cut1300-krx.ticks.zst`
 *   (에코앤드림 10/16 13:00~13:59 · 11,990 레코드 · 단일 보드 G1 이라 거래소순 = msg_seq 순 · 한 행 = seq +1)를 준다.
 *   실브라우저에서만 보이는 것 — fzstd 스트리밍 해제 · 창 키 처리 · `history.replaceState` 의 URL `t`(Next 15 동기화) ·
 *   새로고침 뒤 같은 시각 · 서명 만료 403 → open 재호출 1회.
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
    // 37-10 — 열리면 서명 URL 격자를 받아 호가 10단까지 그린다(NXT 픽스처 바이트).
    await expect(page.locator('[data-slot="tick-book"]')).toBeVisible({ timeout: 30_000 });
    expect(rec.open).toEqual([`${ECO.isin}/${TICK_DATE}/NXT`]);
    expect(rec.grid).toHaveLength(1);
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

test.describe('틱 전문 뷰어 본문 — 격자 · 키 · 딥링크 (Phase 37 D-00 · D-18)', () => {
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
    // 「주 | 금액」
    await book.getByRole('button', { name: '금액' }).click();
    await expect(book.locator('[data-slot="tick-book-total"]')).toContainText('합산 금액');
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
test.describe('틱 전문 뷰어 전문 목록 — 행 그룹 · 뒤집힘 · 이 주문 (Phase 37 D-00 · D-20)', () => {
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
    const seg = page.getByRole('group', { name: '보기' });
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
