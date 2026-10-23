import { test, expect, type Locator, type Page, type Route } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import {
  ACCUM_BACKSTOP_DATE,
  ACCUM_LATEST,
  ACCUM_DATES,
  ACCUM_WORST_DETAIL_ISIN,
  ACCUM_WORST_DROP_ISIN,
  ACCUM_WORST_ISIN,
  ACCUM_WORST_NAME,
  CHEONIL,
  HANSUN,
  accumDetailFixtureOf,
  accumKpiWorstFixture,
  accumReportFixture,
  type AccumReportBody,
} from '../fixtures/accum-report';
import { withLocalRelay, type LocalRelay } from '../fixtures/relay';

/**
 * Phase 34 Plan 09 Task 1 — 매집감지 보고서 실브라우저 상세 경로 E2E (D-06 · D-08 · D-14 · RESEARCH A1 · A5).
 *
 * ① 무엇을 증명하는가
 *   진짜 브라우저(1280)에서 `/analytics/accum?d=20261014` → 6행 기본 접힘 → 한선엔지니어링 펼침 → 상세 요청 정확히 1회 →
 *   세 판 SVG → 「정규장」 프리셋 → 차트 위 네이티브 휠 확대(프리셋 셋 다 꺼짐) → 휠 10회 + 끌기 1회(오류 0) → 접고 다시
 *   펼쳐도 요청 1회(캐시) → 다른 행 펼침 = 요청 2. 단위(RTL)는 jsdom 이라 실레이아웃 · `{ passive: false }` 네이티브 휠 ·
 *   Pointer Events 끌기 · 실제 요청 수를 못 본다 — 그래서 여기서 실측한다.
 *
 * ② 규약(fixtures/relay.ts ⑥ · teamflow-report.spec 과 같다): 파일 내부 직렬 · beforeAll 1회 relay(DMA 매핑 사용자 —
 *   게이트 통과) · afterAll stop · beforeEach reset. 보고서 본문은 `page.route` 목이다(server · RPC 는 이 e2e 밖).
 *
 * ③ 목 경로(Pitfall 9): 목록 `pathname === '/api/accum/report'` 과 상세 `pathname.startsWith('/api/accum/report/')` 를
 *   URL 판정 함수로 따로 잡는다 — Playwright glob 의 `*` 는 `/` 를 넘지 않아 `**\/api/accum/report*` 로는 상세가 안 잡힌다.
 *
 * ④ 픽스처 = 워커 실측 20261014 6행(fixtures/accum-report.ts). 20261013 · 최악값 행은 합성이다(그 파일 머리 주석).
 *
 * ⑤ Phase 34 Plan 10 — 폰 390 상세 경로(트레이서) · UI-SPEC 폭 백스톱 6종(A1 · A2 · A3 · A5 · A6 overflow · A6 long-text)
 *   · 빈 상태 2종 · 403 게이트. 백스톱 목록 = `accumReportFixture(20261013, { backstop: true })`(합성 최악값 행 ·
 *   ACCUM_WORST_DETAIL 사이클 3개 7자리 · 06:00 이월 탈락 7자리) — 실측은 jsdom 이 못 보는 실레이아웃(bbox · scrollWidth).
 */

test.describe.configure({ mode: 'serial' });

interface Recorder {
  /** 목록 요청의 `d`(없으면 null). */
  ds: (string | null)[];
  /** 상세 요청 `{date}/{isin}` 순서대로. */
  details: string[];
}

interface MockOpts {
  /** 목록 응답 바꾸기(기본 = `accumReportFixture(d)`). */
  list?: (d: string | null) => AccumReportBody | { access: true; dates: string[]; date: string | null; rows: [] };
  /** 목록을 403 DMA_UNMAPPED 로 막는다. */
  forbid?: boolean;
}

async function installAccumMocks(page: Page, opts: MockOpts = {}): Promise<Recorder> {
  const rec: Recorder = { ds: [], details: [] };
  await page.route(
    (url) => url.pathname === '/api/accum/report',
    async (route: Route) => {
      const d = new URL(route.request().url()).searchParams.get('d');
      rec.ds.push(d);
      if (opts.forbid) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'DMA_UNMAPPED', message: 'DMA 매핑 없음' } }),
        });
        return;
      }
      const body = opts.list ? opts.list(d) : accumReportFixture(d);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    },
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/accum/report/'),
    async (route: Route) => {
      const rest = new URL(route.request().url()).pathname.slice('/api/accum/report/'.length);
      const [date = '', isin = ''] = rest.split('/').map(decodeURIComponent);
      rec.details.push(`${date}/${isin}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(accumDetailFixtureOf(date, isin)),
      });
    },
  );
  return rec;
}

const BASE = '/analytics/accum';
const rows = (page: Page) => page.locator('[data-slot="accum-list"] button[data-isin]');
const rowOf = (page: Page, isin: string) => page.locator(`[data-slot="accum-list"] button[data-isin="${isin}"]`);
const detailOf = (page: Page, isin: string) => page.locator(`#ac-${isin}`);
const slot = (page: Page, isin: string, name: string) => page.locator(`#ac-${isin} [data-slot="${name}"]`);

/** 「HH:MM ~ HH:MM」 → 분 폭. */
function spanMinutes(text: string): number {
  const m = /^(\d{2}):(\d{2}) ~ (\d{2}):(\d{2})$/.exec(text.trim());
  if (m === null) throw new Error(`창 범위 형식 아님: ${text}`);
  const [, h0, m0, h1, m1] = m.map(Number) as [number, number, number, number, number];
  return h1 * 60 + m1 - (h0 * 60 + m0);
}

async function presetsAllOff(page: Page, isin: string): Promise<void> {
  const presets = slot(page, isin, 'accum-presets');
  for (const label of ['전체', '정규장', '마지막 2시간']) {
    await expect(presets.getByRole('button', { name: label, exact: true }), `${label} 꺼짐`).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  }
}

/** 차트 svg 가운데 좌표(뷰포트) — 화면 안으로 스크롤한 뒤 잰다. */
async function chartCenter(svg: Locator): Promise<{ x: number; y: number; w: number }> {
  await svg.scrollIntoViewIfNeeded();
  const b = await svg.boundingBox();
  if (b === null) throw new Error('차트 svg 박스 없음');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width };
}

/** 백스톱 목록(20261013 · 합성 최악값 3행 + 실측 6행). */
const backstopList = (d: string | null) =>
  accumReportFixture(d, { backstop: d === null || d === ACCUM_BACKSTOP_DATE });

/** 가로 넘침 — 문서 스크롤 · 앱 셸 `main`(overflow-auto) 둘 다(teamflow-report.spec 와 같은 판정). */
async function expectNoHorizontalScroll(page: Page, tag: string): Promise<void> {
  const o = await page.evaluate(() => {
    const se = document.scrollingElement ?? document.documentElement;
    const main = document.querySelector('main');
    return {
      doc: se.scrollWidth - se.clientWidth,
      main: main === null ? 0 : main.scrollWidth - main.clientWidth,
    };
  });
  expect(o.doc, `${tag} 문서 가로 스크롤 0(scrollWidth <= clientWidth)`).toBeLessThanOrEqual(0);
  expect(o.main, `${tag} main 가로 스크롤 0`).toBeLessThanOrEqual(0);
}

/** 차트 svg 가 측정 폭과 1:1 이 될 때까지(첫 페인트 폴백 640 → 측정 뒤 다시 그림). */
async function expectOneToOne(svg: Locator, tag: string): Promise<void> {
  await expect
    .poll(
      () =>
        svg.evaluate((el) => {
          const vb = (el as SVGSVGElement).viewBox.baseVal.width;
          return Math.abs(vb - el.getBoundingClientRect().width);
        }),
      { message: `${tag} viewBox 폭 = 렌더 폭(1:1)`, timeout: 5_000 },
    )
    .toBeLessThanOrEqual(1);
}

type VBox = { top: number; bottom: number; left: number; right: number };

async function boxOf(loc: Locator, tag: string): Promise<VBox> {
  const b = await loc.boundingBox();
  if (b === null) throw new Error(`${tag} 박스 없음`);
  return { top: b.y, bottom: b.y + b.height, left: b.x, right: b.x + b.width };
}

/** 세로 구간 겹침 길이(> 0 = 같은 줄). */
const vOverlap = (a: VBox, b: VBox) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

/** 시각 눈금 글자(y = ACCUM_CHART.TICK_Y 465) — 「9」 「10」 … 또는 「HH:MM」. */
async function tickLabelsOf(svg: Locator): Promise<{ text: string; x: number }[]> {
  return svg.locator('text[y="465"]').evaluateAll((els) =>
    els.map((e) => ({ text: e.textContent ?? '', x: Number(e.getAttribute('x')) })),
  );
}

/** 두 상자 겹침(넓이 > 0) — 경계가 맞닿는 것은 겹침 아님. */
const boxesOverlap = (a: VBox, b: VBox) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;

/** SVG `<text>` 의 getBBox(사용자 좌표 = 1:1 이면 CSS px) — 글자 · 슬롯 이름과 함께. */
type TextBox = VBox & { text: string; slot: string | null };
async function textBoxesOf(svg: Locator, selector: string): Promise<TextBox[]> {
  return svg.locator(selector).evaluateAll((els) =>
    els.map((e) => {
      const b = (e as SVGTextElement).getBBox();
      return {
        text: e.textContent ?? '',
        slot: e.getAttribute('data-slot'),
        left: b.x,
        right: b.x + b.width,
        top: b.y,
        bottom: b.y + b.height,
      };
    }),
  );
}

/** 그림 영역 [L, W − 56] — L = 가격 축 글자 기준점(x = L − 6) + 6 · W = viewBox 폭. */
async function plotAreaOf(svg: Locator): Promise<{ L: number; R: number; W: number }> {
  return svg.evaluate((el) => {
    const W = (el as SVGSVGElement).viewBox.baseVal.width;
    const t = el.querySelector('[data-slot="accum-px-axis"] text');
    const L = Number(t?.getAttribute('x')) + 6;
    return { L, R: W - 56, W };
  });
}

const VIEWPORTS = [
  { tag: '390', width: 390, height: 844 },
  { tag: '1280', width: 1280, height: 900 },
] as const;

test.describe('Phase 34 Plan 09 — 매집감지 상세 실브라우저 경로 (로컬 relay)', () => {
  let relay: LocalRelay;

  test.beforeAll(async () => {
    relay = await withLocalRelay();
  });

  test.afterAll(async () => {
    await relay.stop();
  });

  test.beforeEach(async ({ page }) => {
    relay.reset();
    await mockStockApi(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
  });

  test('P34-AC1 1280 — 목록 → 펼침 → 상세 1회 → 프리셋 · 휠 · 끌기 → 재펼침 캐시', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const rec = await installAccumMocks(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });

    await page.goto(`${BASE}?d=${ACCUM_LATEST}`);

    // ① 6행 · 전부 접힘 · 머리 칩.
    await expect(rows(page)).toHaveCount(6, { timeout: 30_000 });
    expect(await rows(page).evaluateAll((els) => els.every((e) => e.getAttribute('aria-expanded') === 'false'))).toBe(
      true,
    );
    await expect(page.locator('[data-slot="accum-detail"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="accum-source"]')).toHaveText('KYOBO119 판정 기준 · 20:30 적재');
    expect(rec.ds).toContain(ACCUM_LATEST);
    expect(rec.details).toHaveLength(0);

    // ② 한선엔지니어링 펼침 → 상세 요청 1 · 세 판 SVG · 기본 창 「09:00 ~ 20:00」.
    const hansun = rowOf(page, HANSUN);
    await hansun.click();
    await expect(hansun).toHaveAttribute('aria-expanded', 'true');
    await expect(detailOf(page, HANSUN)).toBeVisible();
    const svg = slot(page, HANSUN, 'accum-chart');
    await expect(svg).toBeVisible({ timeout: 15_000 });
    expect(rec.details).toEqual([`${ACCUM_LATEST}/${HANSUN}`]);
    await expect(svg.getByText('순매수 누적', { exact: true })).toBeVisible();
    await expect(svg.getByText('10분 팀 매수 / 매도', { exact: true })).toBeVisible();
    const range = slot(page, HANSUN, 'accum-view-range');
    await expect(range).toHaveText('09:00 ~ 20:00');
    const presets = slot(page, HANSUN, 'accum-presets');
    await expect(presets.getByRole('button', { name: '전체', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // ③ 「정규장」 → 「09:00 ~ 15:30」 · 그 버튼만 켜짐.
    const reg = presets.getByRole('button', { name: '정규장', exact: true });
    await reg.click();
    await expect(range).toHaveText('09:00 ~ 15:30');
    await expect(reg).toHaveAttribute('aria-pressed', 'true');
    await expect(presets.getByRole('button', { name: '전체', exact: true })).toHaveAttribute('aria-pressed', 'false');

    // ④ 차트 가운데 휠(deltaY −) → 창 폭이 6.5h 보다 짧아지고 프리셋 셋 다 꺼진다.
    const c = await chartCenter(svg);
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => spanMinutes(await range.innerText()), { timeout: 5_000 }).toBeLessThan(390);
    await presetsAllOff(page, HANSUN);

    // ⑤ 한선엔지니어링급 행(price 3,648 · orders 501 · day_cum_net 6,513)에서 휠 10회 + 끌기 1회 — 오류 없이 창이 바뀐다(A1).
    const beforeWheel = await range.innerText();
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -120);
    }
    await expect.poll(() => range.innerText(), { timeout: 5_000 }).not.toBe(beforeWheel);
    const beforeDrag = await range.innerText();
    const c2 = await chartCenter(svg);
    await page.mouse.move(c2.x, c2.y);
    await page.mouse.down();
    await page.mouse.move(c2.x - 60, c2.y, { steps: 4 });
    await page.mouse.move(c2.x - 120, c2.y, { steps: 4 });
    await page.mouse.up();
    await expect.poll(() => range.innerText(), { timeout: 5_000 }).not.toBe(beforeDrag);
    await presetsAllOff(page, HANSUN);
    expect(errors, '휠 · 끌기 중 페이지 오류 0').toEqual([]);
    await page.screenshot({ path: test.info().outputPath('accum-detail-1280.png'), fullPage: true });

    // ⑥ 접기 → 다시 펼치기 → 상세 요청 그대로 1 · 창은 「전체」 로 돌아오고 판정 기준은 다시 접힘.
    await hansun.click();
    await expect(page.locator('[data-slot="accum-detail"]')).toHaveCount(0);
    await expect(hansun).toHaveAttribute('aria-expanded', 'false');
    await hansun.click();
    await expect(svg).toBeVisible();
    await expect(range).toHaveText('09:00 ~ 20:00');
    expect(rec.details).toHaveLength(1);
    const rules = slot(page, HANSUN, 'accum-rules').getByRole('button', { name: '판정 기준' });
    await expect(rules).toHaveAttribute('aria-expanded', 'false');

    // ⑦ 천일고속 펼침 → 한선 상세 사라짐 · 상세 요청 2.
    await rowOf(page, CHEONIL).click();
    await expect(detailOf(page, CHEONIL)).toBeVisible();
    await expect(detailOf(page, HANSUN)).toHaveCount(0);
    await expect(slot(page, CHEONIL, 'accum-chart')).toBeVisible({ timeout: 15_000 });
    expect(rec.details).toEqual([`${ACCUM_LATEST}/${HANSUN}`, `${ACCUM_LATEST}/${CHEONIL}`]);
    expect(errors, '경로 전체 페이지 오류 0').toEqual([]);
  });

  test('P34-AC1b 1280 — 마우스 툴팁(gh-trade 동형): 원 위 = 주문 2줄 + 고리 · 10분 판 = 칸 · 상자는 차트 안 · 떠나면 사라짐', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installAccumMocks(page);
    await page.goto(`${BASE}?d=${ACCUM_LATEST}`);
    await expect(rows(page)).toHaveCount(6, { timeout: 30_000 });
    await rowOf(page, HANSUN).click();
    const svg = slot(page, HANSUN, 'accum-chart');
    await expect(svg).toBeVisible({ timeout: 15_000 });
    const wrap = slot(page, HANSUN, 'accum-chart-wrap');
    const tip = slot(page, HANSUN, 'accum-chart-tip');

    // 가장 큰 원(맨 앞 — 큰 원 먼저 그린다) 중심으로
    const circle = svg.locator('[data-slot="accum-price-layer"] > circle').first();
    const cb = (await circle.boundingBox())!;
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await expect(tip).toBeVisible();
    await expect(tip.locator('> div')).toHaveCount(2);
    await expect(tip.locator('> div').first()).toHaveText(/^\d\d:\d\d:\d\d 팀 (매수|매도) [\d,]+주 · [\d.,]+억 @[\d,]+ · \d+조각/);
    await expect(tip.locator('> div').nth(1)).toHaveText(/순매수 누적 [+−]?[\d.,]+억/);
    await expect(svg.locator('[data-slot="accum-order-hover"]')).toHaveCount(1);
    const wb = (await wrap.boundingBox())!;
    const tb = (await tip.boundingBox())!;
    expect(tb.x).toBeGreaterThanOrEqual(wb.x - 1);
    expect(tb.x + tb.width).toBeLessThanOrEqual(wb.x + wb.width + 1);
    await page.screenshot({ path: test.info().outputPath('accum-tip-order.png') });

    // 10분 판 — 막대 칸 가운데
    const bar = svg.locator('[data-slot="accum-bucket"] rect').first();
    await bar.scrollIntoViewIfNeeded();
    const bb = (await bar.boundingBox())!;
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await expect(tip).toHaveText(/^\d\d:\d0~\d\d:\d0 · 팀 매수 [\d.,]+억 \/ 매도 [\d.,]+억 \/ 순 [+−]?[\d.,]+억$/);
    await expect(svg.locator('[data-slot="accum-order-hover"]')).toHaveCount(0);

    // 차트 밖으로 나가면 사라진다
    const wb2 = (await wrap.boundingBox())!;
    await page.mouse.move(wb2.x + wb2.width / 2, wb2.y - 40);
    await expect(tip).toHaveCount(0);
  });
});

test.describe('Phase 34 Plan 10 — 폰 390 · 폭 백스톱 · 빈 상태 · 게이트 (로컬 relay)', () => {
  let relay: LocalRelay;

  test.beforeAll(async () => {
    relay = await withLocalRelay();
  });

  test.afterAll(async () => {
    await relay.stop();
  });

  test.beforeEach(async ({ page }) => {
    relay.reset();
    await mockStockApi(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
  });

  test.describe('폰 390', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('P34-AC2 390 — 목록 3줄 카드 → 다중 사이클 펼침 → 차트 1:1 · 2시간 눈금 → 사이클 표 내부 가로 스크롤 → 페이지 가로 스크롤 0', async ({
      page,
    }) => {
      const rec = await installAccumMocks(page, { list: backstopList });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

      await page.goto(`${BASE}?d=${ACCUM_BACKSTOP_DATE}`);
      await expect(rows(page)).toHaveCount(9, { timeout: 30_000 });
      await expect(page.locator('[data-slot="accum-list-head"]')).toBeHidden();

      // ① 목록 행(합성 최악값) — 1줄 [종목 … 결과 태그 · 셰브론] / 2줄 배지 묶음(+ 사유 줄) / 3줄 메타.
      const worst = rowOf(page, ACCUM_WORST_ISIN);
      const name = await boxOf(worst.locator('span[title]').first(), '종목명');
      const tag = await boxOf(worst.locator('[data-slot="accum-tag"]'), '결과 태그');
      const chev = await boxOf(worst.locator('[data-slot="accum-row-chevron"]'), '셰브론');
      const badges = await boxOf(worst.locator('[data-slot="accum-badges"]'), '배지 묶음');
      const reason = await boxOf(worst.locator('[data-slot="accum-reason"]'), '사유 줄');
      const meta = await boxOf(worst.locator('[data-slot="accum-pos"]'), '메타(팀 순매수)');
      expect(vOverlap(name, tag), '1줄 종목명 ↔ 결과 태그 같은 줄').toBeGreaterThan(0);
      expect(vOverlap(name, chev), '1줄 종목명 ↔ 셰브론 같은 줄').toBeGreaterThan(0);
      expect(badges.top, '2줄 배지 묶음 = 종목 줄 아래').toBeGreaterThanOrEqual(Math.max(tag.bottom, chev.bottom) - 1);
      expect(reason.top, '사유 줄 = 배지 묶음 아래').toBeGreaterThanOrEqual(badges.bottom - 1);
      expect(meta.top, '3줄 메타 = 배지 · 사유 아래').toBeGreaterThanOrEqual(reason.bottom - 1);
      await expectNoHorizontalScroll(page, '390 목록');

      // ② 다중 사이클(합성 7자리 · 사이클 3) 펼침 → 상세 1회 · 차트 svg 1:1 · 시각 눈금 2시간 간격.
      const row = rowOf(page, ACCUM_WORST_DETAIL_ISIN);
      await row.click();
      await expect(row).toHaveAttribute('aria-expanded', 'true');
      const svg = slot(page, ACCUM_WORST_DETAIL_ISIN, 'accum-chart');
      await expect(svg).toBeVisible({ timeout: 15_000 });
      expect(rec.details).toEqual([`${ACCUM_BACKSTOP_DATE}/${ACCUM_WORST_DETAIL_ISIN}`]);
      await expectOneToOne(svg, '390 차트');
      const vbW = await svg.evaluate((el) => (el as SVGSVGElement).viewBox.baseVal.width);
      expect(vbW, '폰 390 차트 W ≈ 310(본문 358 − 카드 32 − 상세 16)').toBeGreaterThan(290);
      expect(vbW).toBeLessThan(330);
      await expect(slot(page, ACCUM_WORST_DETAIL_ISIN, 'accum-view-range')).toHaveText('09:00 ~ 20:00');
      const ticks = await tickLabelsOf(svg);
      const hours = ticks.map((t) => {
        expect(t.text, `눈금 「${t.text}」 = 정시`).toMatch(/^\d{1,2}$/);
        return Number(t.text);
      });
      expect(hours.length, '눈금 3개 이상').toBeGreaterThanOrEqual(3);
      for (let i = 1; i < hours.length; i++) {
        expect(hours[i]! - hours[i - 1]!, `눈금 간격 2시간(${hours.join(' · ')})`).toBe(2);
      }
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]!.x - ticks[i - 1]!.x, '눈금 간격 ≥ 28px').toBeGreaterThanOrEqual(28);
      }

      // ③ 사이클 표(3행) — 표 래퍼 안에서만 가로 스크롤.
      const cycles = slot(page, ACCUM_WORST_DETAIL_ISIN, 'accum-cycles');
      await cycles.scrollIntoViewIfNeeded();
      await expect(cycles.locator('tbody tr')).toHaveCount(3);
      const wrap = cycles.locator('[data-slot="table-container"]');
      const sc = await wrap.evaluate((el) => ({
        sw: el.scrollWidth,
        cw: el.clientWidth,
        ox: getComputedStyle(el).overflowX,
      }));
      expect(sc.ox, '표 래퍼 overflow-x auto').toBe('auto');
      expect(sc.sw, '표 안 가로 스크롤(scrollWidth > clientWidth)').toBeGreaterThan(sc.cw);
      const cyclesBox = await boxOf(cycles, '사이클 표');
      expect(cyclesBox.right, '사이클 표 섹션 = 뷰포트 안').toBeLessThanOrEqual(390);

      // ④ 페이지 가로 스크롤 0(document.scrollingElement.scrollWidth <= clientWidth).
      await expectNoHorizontalScroll(page, '390 상세');
      expect(errors, '페이지 오류 0').toEqual([]);
      await page.screenshot({ path: test.info().outputPath('accum-detail-390.png'), fullPage: true });
    });
  });

  // ─── 폭 백스톱 6종(UI-SPEC UI Considerations · 390 · 1280) ───
  for (const vp of VIEWPORTS) {
    test(`P34-AC-B1 백스톱 A1 overflow — 머리(h1 · 알약 · 출처 칩 · 설명) ${vp.tag}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await installAccumMocks(page, { list: backstopList });
      await page.goto(`${BASE}?d=${ACCUM_BACKSTOP_DATE}`);
      await expect(rows(page)).toHaveCount(9, { timeout: 30_000 });
      const report = await boxOf(page.locator('[data-slot="accum-report"]'), '보고서 루트');
      const h1 = await boxOf(page.getByRole('heading', { level: 1, name: '매집감지 보고서' }), 'h1');
      const pill = await boxOf(page.locator('[data-slot="limitup-date"]'), '날짜 알약');
      const chipLoc = page.locator('[data-slot="accum-source"]');
      const chip = await boxOf(chipLoc, '출처 칩');
      const desc = chipLoc.locator('xpath=..');
      const descBox = await boxOf(desc, '설명');
      for (const [n, b] of [
        ['h1', h1],
        ['알약', pill],
        ['칩', chip],
        ['설명', descBox],
      ] as const) {
        expect(b.left, `${vp.tag} ${n} 왼쪽 = 보고서 안`).toBeGreaterThanOrEqual(report.left - 0.5);
        expect(b.right, `${vp.tag} ${n} 오른쪽 = 보고서 안`).toBeLessThanOrEqual(report.right + 0.5);
      }
      expect(boxesOverlap(h1, pill), `${vp.tag} h1 ↔ 알약 겹침 0`).toBe(false);
      expect(chip.left, `${vp.tag} 칩 = 설명 안(왼쪽)`).toBeGreaterThanOrEqual(descBox.left - 0.5);
      expect(chip.right, `${vp.tag} 칩 = 설명 안(오른쪽)`).toBeLessThanOrEqual(descBox.right + 0.5);
      const chipFit = await chipLoc.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(chipFit.sw, `${vp.tag} 칩 글자 잘림 0`).toBeLessThanOrEqual(chipFit.cw);
      await expect(chipLoc).toHaveText('KYOBO119 판정 기준 · 20:30 적재');
      expect(await desc.evaluate((el) => getComputedStyle(el).wordBreak), `${vp.tag} 설명 break-keep`).toBe('keep-all');
      await expectNoHorizontalScroll(page, `${vp.tag} 머리`);
    });

    test(`P34-AC-B2 백스톱 A2 overflow — KPI 최악값(청산 12 · 탈락 10 · 만료 10 · −1,234.5억) ${vp.tag}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await installAccumMocks(page, { list: () => accumKpiWorstFixture() });
      await page.goto(`${BASE}?d=${ACCUM_BACKSTOP_DATE}`);
      const ended = page.locator('[data-kpi="종료"]');
      await expect(ended.locator('dd')).toContainText('청산 12 · 탈락 10 · 만료 10', { timeout: 30_000 });
      const tile = await boxOf(ended, '종료 칸');
      const value = await boxOf(ended.locator('dd > span').nth(0), '종료 값');
      const sub = await boxOf(ended.locator('dd > span').nth(1), '종료 보조');
      if (vp.width < 768) {
        expect(sub.top, `${vp.tag} 보조 글자 = 값 아래 줄`).toBeGreaterThanOrEqual(value.bottom - 4);
      }
      for (const [n, b] of [
        ['값', value],
        ['보조', sub],
      ] as const) {
        expect(b.left, `${vp.tag} 종료 ${n} = 칸 안(왼쪽)`).toBeGreaterThanOrEqual(tile.left);
        expect(b.right, `${vp.tag} 종료 ${n} = 칸 안(오른쪽 · p-3)`).toBeLessThanOrEqual(tile.right - 12 + 0.5);
      }
      const sumTile = page.locator('[data-kpi="팀 순매수 합(등록 후)"]');
      await expect(sumTile.locator('dd')).toHaveText('−1,234.5억');
      const sumBox = await boxOf(sumTile, '합 칸');
      const sumVal = await boxOf(sumTile.locator('dd > span').first(), '합 값');
      expect(sumVal.right, `${vp.tag} −1,234.5억 칸 안`).toBeLessThanOrEqual(sumBox.right - 12 + 0.5);
      for (const label of ['등록 종목', '장 마감 보유', '종료', '팀 순매수 합(등록 후)']) {
        const fit = await page
          .locator(`[data-kpi="${label}"] dd`)
          .evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        expect(fit.sw, `${vp.tag} 「${label}」 dd 잘림 0`).toBeLessThanOrEqual(fit.cw);
      }
      await expectNoHorizontalScroll(page, `${vp.tag} KPI`);
      await page.locator('[data-slot="accum-kpis"]').screenshot({ path: test.info().outputPath(`accum-kpi-worst-${vp.tag}.png`) });
    });

    test(`P34-AC-B3 백스톱 A3 long-text — 15자 종목명 · 상한가 태그 · 배지 3 · 사유 줄 · 평단/등록가 ${vp.tag}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await installAccumMocks(page, { list: backstopList });
      await page.goto(`${BASE}?d=${ACCUM_BACKSTOP_DATE}`);
      await expect(rows(page)).toHaveCount(9, { timeout: 30_000 });
      const row = rowOf(page, ACCUM_WORST_ISIN);
      const nameLoc = row.locator(`span[title="${ACCUM_WORST_NAME}"]`);
      await expect(nameLoc).toHaveText(ACCUM_WORST_NAME);
      const rowBox = await boxOf(row, '행');
      const name = await boxOf(nameLoc, '종목명');
      const tagLoc = row.locator('[data-slot="accum-tag"]');
      await expect(tagLoc).toHaveText('상한가 +29.9%');
      const tag = await boxOf(tagLoc, '결과 태그');
      const chev = await boxOf(row.locator('[data-slot="accum-row-chevron"]'), '셰브론');
      expect(vOverlap(name, tag), `${vp.tag} 종목명 ↔ 태그 한 줄`).toBeGreaterThan(0);
      expect(vOverlap(name, chev), `${vp.tag} 종목명 ↔ 셰브론 한 줄`).toBeGreaterThan(0);
      expect(boxesOverlap(name, tag), `${vp.tag} 종목명 ↔ 태그 겹침 0`).toBe(false);
      expect(boxesOverlap(tag, chev), `${vp.tag} 태그 ↔ 셰브론 겹침 0`).toBe(false);
      expect(chev.right, `${vp.tag} 셰브론 = 행 안`).toBeLessThanOrEqual(rowBox.right);
      const tagFit = await tagLoc.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(tagFit.sw, `${vp.tag} 태그 잘림 0`).toBeLessThanOrEqual(tagFit.cw);
      const nameFit = await nameLoc.evaluate((el) => ({
        clipped: el.scrollWidth > el.clientWidth,
        overflow: getComputedStyle(el).textOverflow,
      }));
      if (nameFit.clipped) expect(nameFit.overflow, `${vp.tag} 종목명 잘리면 말줄임`).toBe('ellipsis');

      // 배지 3개 + 사유 줄 — 서로 겹침 0 · 사유 줄은 배지 아래.
      const badgeLocs = row.locator('[data-slot="accum-badges"] > span');
      await expect(badgeLocs).toHaveText(['종료', '이월 D+5', '사이클 3']);
      const badges: VBox[] = [];
      for (let i = 0; i < 3; i++) badges.push(await boxOf(badgeLocs.nth(i), `배지 ${i}`));
      const reasonLoc = row.locator('[data-slot="accum-reason"]');
      await expect(reasonLoc).toHaveText('이월 탈락(복원 안 됨) · 08:41');
      const reason = await boxOf(reasonLoc, '사유 줄');
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) expect(boxesOverlap(badges[i]!, badges[j]!), `${vp.tag} 배지 ${i}↔${j} 겹침 0`).toBe(false);
        expect(boxesOverlap(badges[i]!, reason), `${vp.tag} 배지 ${i} ↔ 사유 줄 겹침 0`).toBe(false);
      }
      expect(reason.top, `${vp.tag} 사유 줄 = 배지 아래`).toBeGreaterThanOrEqual(Math.max(...badges.map((b) => b.bottom)) - 1);
      const reasonFit = await reasonLoc.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(reasonFit.sw, `${vp.tag} 사유 줄 잘림 0`).toBeLessThanOrEqual(reasonFit.cw);
      if (vp.width >= 1280) {
        // xl 7열 — 상태 칸 사유 줄 한 줄(whitespace-nowrap) · 결과 칸과 겹침 0 · 평단/등록가 아랫줄 truncate + title.
        expect(reason.bottom - reason.top, '1280 사유 줄 한 줄').toBeLessThan(20);
        expect(reason.right, '1280 사유 줄 ↔ 결과 칸 겹침 0').toBeLessThanOrEqual(tag.left);
        const avgLoc = row.locator('[data-slot="accum-avg"]');
        await expect(avgLoc).toBeVisible();
        await expect(avgLoc).toHaveAttribute('title', '평단 200,407 · 등록가 205,500');
        const avg = await avgLoc.evaluate((el) => ({
          clipped: el.scrollWidth > el.clientWidth,
          overflow: getComputedStyle(el).textOverflow,
          ws: getComputedStyle(el).whiteSpace,
        }));
        if (avg.clipped) expect(avg.overflow, '1280 평단/등록가 잘리면 말줄임').toBe('ellipsis');
        const avgBox = await boxOf(avgLoc, '평단/등록가');
        const day = await boxOf(row.locator('[data-slot="accum-day"]'), '하루 순매수');
        expect(avgBox.right, '1280 평단/등록가 ↔ 하루 순매수 칸 겹침 0').toBeLessThanOrEqual(day.left);
      } else {
        await expect(row.locator('[data-slot="accum-avg"]')).toBeHidden();
      }
      await expectNoHorizontalScroll(page, `${vp.tag} 목록 최악값`);
      await row.screenshot({ path: test.info().outputPath(`accum-row-worst-${vp.tag}.png`) });
    });

    test(`P34-AC-B4 백스톱 A5 overflow — 프리셋 3 + 창 범위 flex-wrap · 버튼 높이 ≥ 32 ${vp.tag}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await installAccumMocks(page, { list: backstopList });
      await page.goto(`${BASE}?d=${ACCUM_BACKSTOP_DATE}`);
      await rowOf(page, ACCUM_WORST_DETAIL_ISIN).click();
      const presets = slot(page, ACCUM_WORST_DETAIL_ISIN, 'accum-presets');
      await expect(presets).toBeVisible({ timeout: 15_000 });
      const detail = await boxOf(detailOf(page, ACCUM_WORST_DETAIL_ISIN), '상세');
      const parts: { n: string; b: VBox }[] = [];
      for (const label of ['전체', '정규장', '마지막 2시간']) {
        const btn = presets.getByRole('button', { name: label, exact: true });
        const b = await boxOf(btn, label);
        expect(b.bottom - b.top, `${vp.tag} 「${label}」 높이 ≥ 32`).toBeGreaterThanOrEqual(32);
        const fit = await btn.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        expect(fit.sw, `${vp.tag} 「${label}」 글자 잘림 0`).toBeLessThanOrEqual(fit.cw);
        parts.push({ n: label, b });
      }
      parts.push({ n: '창 범위', b: await boxOf(slot(page, ACCUM_WORST_DETAIL_ISIN, 'accum-view-range'), '창 범위') });
      for (let i = 0; i < parts.length; i++) {
        expect(parts[i]!.b.right, `${vp.tag} ${parts[i]!.n} = 상세 안`).toBeLessThanOrEqual(detail.right);
        for (let j = i + 1; j < parts.length; j++) {
          expect(boxesOverlap(parts[i]!.b, parts[j]!.b), `${vp.tag} ${parts[i]!.n} ↔ ${parts[j]!.n} 겹침 0`).toBe(false);
        }
      }
      await expectNoHorizontalScroll(page, `${vp.tag} 프리셋 줄`);
    });

    test(`P34-AC-B5 백스톱 A6 overflow — 사이클 3 · 짧은 사이클 · 전체 창 라벨 겹침 0 · 그림 영역 안 · 눈금 ≥ 28px ${vp.tag}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await installAccumMocks(page, { list: backstopList });
      await page.goto(`${BASE}?d=${ACCUM_BACKSTOP_DATE}`);
      await rowOf(page, ACCUM_WORST_DETAIL_ISIN).click();
      const svg = slot(page, ACCUM_WORST_DETAIL_ISIN, 'accum-chart');
      await expect(svg).toBeVisible({ timeout: 15_000 });
      await expectOneToOne(svg, `${vp.tag} 차트`);
      await expect(slot(page, ACCUM_WORST_DETAIL_ISIN, 'accum-view-range')).toHaveText('09:00 ~ 20:00');
      const { L, R } = await plotAreaOf(svg);
      expect(L, `${vp.tag} 7자리 → 왼쪽 축 60`).toBe(60);

      // 세로선 5개(등록 3 · 종료 2)와 그 <title> 은 라벨이 생략돼도 남는다.
      await expect(svg.locator('[data-slot="accum-cycle-line"]')).toHaveCount(5);
      await expect(svg.locator('[data-slot="accum-cycle-line"] > title')).toHaveText([
        /^사이클 1 등록 09:05:00$/,
        /^사이클 1 청산 09:15:00$/,
        /^사이클 2 등록 09:20:00$/,
        /^사이클 2 청산 09:30:00$/,
        /^사이클 3 등록 13:00:00$/,
      ]);
      const labels = await textBoxesOf(svg, '[data-slot="accum-cycle-label"]');
      expect(labels.length, `${vp.tag} 라벨 1개 이상`).toBeGreaterThan(0);
      expect(labels.length).toBeLessThanOrEqual(5);
      const rowsY = new Set(labels.map((l) => Math.round(l.top)));
      expect(rowsY.size, `${vp.tag} 라벨 줄 ≤ 3`).toBeLessThanOrEqual(3);
      for (const l of labels) {
        expect(l.left, `${vp.tag} 「${l.text}」 왼쪽 ≥ L`).toBeGreaterThanOrEqual(L - 0.5);
        expect(l.right, `${vp.tag} 「${l.text}」 오른쪽 ≤ W − 56`).toBeLessThanOrEqual(R + 0.5);
      }
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          expect(boxesOverlap(labels[i]!, labels[j]!), `${vp.tag} 「${labels[i]!.text}」 ↔ 「${labels[j]!.text}」 겹침 0`).toBe(
            false,
          );
        }
      }
      const ticks = await tickLabelsOf(svg);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]!.x - ticks[i - 1]!.x, `${vp.tag} 눈금 간격 ≥ 28px`).toBeGreaterThanOrEqual(28);
      }
      if (vp.width < 768) {
        expect(ticks.map((t) => t.text), '폰 전체 창 = 2시간 눈금').toEqual(['10', '12', '14', '16', '18', '20']);
      }
      // 축 글자(가격 왼쪽 · 누적 오른쪽)끼리 겹침 0.
      for (const sel of ['[data-slot="accum-px-axis"] text', '[data-slot="accum-cum-axis"] text']) {
        const ax = await textBoxesOf(svg, sel);
        for (let i = 0; i < ax.length; i++) {
          for (let j = i + 1; j < ax.length; j++) {
            expect(boxesOverlap(ax[i]!, ax[j]!), `${vp.tag} 축 「${ax[i]!.text}」 ↔ 「${ax[j]!.text}」 겹침 0`).toBe(false);
          }
        }
      }
      await svg.screenshot({ path: test.info().outputPath(`accum-chart-worst-${vp.tag}.png`) });
    });

    test(`P34-AC-B6 백스톱 A6 long-text — 7자리 가격 축 · 「이월 탈락(복원 안 됨) 06:00」 그림 영역 안 ${vp.tag}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await installAccumMocks(page, { list: backstopList });
      await page.goto(`${BASE}?d=${ACCUM_BACKSTOP_DATE}`);
      await rowOf(page, ACCUM_WORST_DROP_ISIN).click();
      const svg = slot(page, ACCUM_WORST_DROP_ISIN, 'accum-chart');
      await expect(svg).toBeVisible({ timeout: 15_000 });
      await expectOneToOne(svg, `${vp.tag} 차트`);
      const { L, R } = await plotAreaOf(svg);
      expect(L, `${vp.tag} 7자리 → 왼쪽 축 60`).toBe(60);
      const px = await textBoxesOf(svg, '[data-slot="accum-px-axis"] text');
      expect(px.some((t) => /^\d,\d{3},\d{3}$/.test(t.text)), `${vp.tag} 7자리 가격 글자 있음`).toBe(true);
      for (const t of px) {
        expect(t.left, `${vp.tag} 가격 축 「${t.text}」 왼쪽 ≥ 0`).toBeGreaterThanOrEqual(0);
        expect(t.right, `${vp.tag} 가격 축 「${t.text}」 ≤ L`).toBeLessThanOrEqual(L);
      }
      const labels = await textBoxesOf(svg, '[data-slot="accum-cycle-label"]');
      const drop = labels.find((l) => l.text === '이월 탈락(복원 안 됨) 06:00');
      expect(drop, `${vp.tag} 종료 라벨 「이월 탈락(복원 안 됨) 06:00」 있음`).toBeDefined();
      expect(drop!.left, `${vp.tag} 종료 라벨 왼쪽 ≥ L`).toBeGreaterThanOrEqual(L - 0.5);
      expect(drop!.right, `${vp.tag} 종료 라벨 오른쪽 ≤ W − 56`).toBeLessThanOrEqual(R + 0.5);
      const carry = await textBoxesOf(svg, '[data-slot="accum-carry-line"]');
      expect(carry.map((c) => c.text)).toEqual(['이월 D+3 · 10/08 14:12 등록']);
      expect(boxesOverlap(carry[0]!, drop!), `${vp.tag} 이월 줄 ↔ 종료 라벨 겹침 0`).toBe(false);
      expect(carry[0]!.right, `${vp.tag} 이월 줄 오른쪽 ≤ W − 56`).toBeLessThanOrEqual(R + 0.5);
      await svg.screenshot({ path: test.info().outputPath(`accum-chart-drop-${vp.tag}.png`) });
    });
  }

  // ─── 빈 상태 2종 · 403 게이트 ───
  test('P34-AC-E1 빈 상태 — 적재 이력 0 「아직 올라온 매집감지 보고서가 없어요」', async ({ page }) => {
    await installAccumMocks(page, { list: () => ({ access: true, dates: [], date: null, rows: [] }) });
    await page.goto(BASE);
    const empty = page.locator('[data-slot="accum-empty"]');
    await expect(empty).toBeVisible({ timeout: 30_000 });
    await expect(empty).toContainText('아직 올라온 매집감지 보고서가 없어요');
    await expect(empty).toContainText('첫 보고서는 평일 밤 20:30쯤 올라와요');
    await expect(page.locator('[data-kpi]')).toHaveCount(0);
    await expect(page.locator('[data-slot="accum-list"]')).toHaveCount(0);
  });

  test('P34-AC-E2 빈 상태 — 행 없는 날 ?d=20261012 → 「최신 보고서 보기」 → ?d=20261014', async ({ page }) => {
    const rec = await installAccumMocks(page);
    await page.goto(`${BASE}?d=20261012`);
    const empty = page.locator('[data-slot="accum-empty"]');
    await expect(empty).toBeVisible({ timeout: 30_000 });
    await expect(empty).toContainText('이 날은 매집감지 데이터가 없어요');
    await expect(empty).toContainText('최신 보고서는 10/14예요');
    await expect(page.locator('[data-kpi]')).toHaveCount(0);
    await empty.getByRole('button', { name: '최신 보고서 보기' }).click();
    await expect(page).toHaveURL((u) => u.searchParams.get('d') === ACCUM_DATES[0]);
    await expect(rows(page)).toHaveCount(6, { timeout: 30_000 });
    expect(rec.ds).toEqual(expect.arrayContaining(['20261012', ACCUM_DATES[0]]));
  });

  test('P34-AC-G1 403 게이트 — 목록 DMA_UNMAPPED → DmaGate 「매집감지 보고서는 …」', async ({ page }) => {
    const rec = await installAccumMocks(page, { forbid: true });
    await page.goto(BASE);
    const gate = page.locator('[data-slot="dma-gate"]');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toContainText(
      '매집감지 보고서는 증권사 계정이 연결된 사용자만 이용할 수 있어요. 관리자에게 연결을 요청하세요.',
    );
    await expect(page.locator('[data-slot="accum-list"]')).toHaveCount(0);
    await expect(page.locator('[data-kpi]')).toHaveCount(0);
    expect(rec.ds.length).toBeGreaterThan(0);
    expect(rec.details).toHaveLength(0);
  });
});
