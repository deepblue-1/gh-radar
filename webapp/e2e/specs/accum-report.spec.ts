import { test, expect, type Locator, type Page, type Route } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { ACCUM_LATEST, CHEONIL, HANSUN, accumDetailFixtureOf, accumReportFixture } from '../fixtures/accum-report';
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
 *   34-10 이 이 파일에 폭 백스톱 케이스를 더한다.
 */

test.describe.configure({ mode: 'serial' });

interface Recorder {
  /** 목록 요청의 `d`(없으면 null). */
  ds: (string | null)[];
  /** 상세 요청 `{date}/{isin}` 순서대로. */
  details: string[];
}

async function installAccumMocks(page: Page): Promise<Recorder> {
  const rec: Recorder = { ds: [], details: [] };
  await page.route(
    (url) => url.pathname === '/api/accum/report',
    async (route: Route) => {
      const d = new URL(route.request().url()).searchParams.get('d');
      rec.ds.push(d);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accumReportFixture(d)) });
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
});
