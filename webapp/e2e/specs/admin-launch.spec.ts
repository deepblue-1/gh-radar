import { test, expect, type Page } from '@playwright/test';

import { launchPlanFixture, mockLaunchApi } from '../fixtures/launch';

/**
 * Phase 35 (35-06) — 웹 Admin `/admin/launch` 주문 내역 탭 E2E (LAUNCH-06 · D-11 ~ D-14 · 채택 목업 변형 A).
 *
 * ① 무엇을 증명하는가
 *   진짜 middleware 가 e2e 계정(admin 시드)을 `/admin/launch` 로 통과시키고, 브라우저가 Express 경로
 *   (`/api/admin/launch/orders`)로 하루치 발사를 받아 머리 카드 4장(LAUNCH_ORDER 순) → 서버 · 시장별 조각 표를 그리는지.
 *   화면 데이터는 `mockLaunchApi`(`**\/api/admin/launch/**` 전용 page.route — `mockAdminApi` 를 쓰지 않는다)다.
 *
 * ② 쿼리 = 진실 원본 · 요청 수
 *   첫 진입은 orders 요청 1건(d 없음 — server 가 최신을 정한다). 날짜 알약 ‹ 는 `?d=` 를 push 하고 그 날 요청 1건.
 *
 * ③ 픽스처 = gh-trade 첨부 pieces.json(10/12~10/26 16:00 Q16) + 첨부 로그 10/26 09:00:30 N 10줄. 10/26 KB 코스닥 Q16 머리 ·
 *   wire 0 주문 속성 · A 두 다리 · N 머리는 합성(가짜 계좌).
 *
 * ④ 폭(D-14) — 1280 카드 2열 · 390 카드 1열(x 같음) · 조각 표는 자기 래퍼 안에서만 가로 스크롤 · 페이지(문서 · 앱 셸 main)
 *   가로 스크롤 0.
 *
 * ⑤ 빈 상태 — 이력 0 · 행 없는 ?d(「최신 보기」 → d 없는 주소) · 형식 오류 ?d(replace 로 d 만 지움 · 다른 키 보존).
 *
 * ⑥ 경계 지도 탭(35-08 · `?tab=map` · D-15 ~ D-18) — 첨부 pieces.json 「전체」 + 첨부 NEXT 픽스처로 KB 코스닥 요약 카드가
 *   10일 · −347 · −322 · −337 이고 4패널 점 합이 196(첨부 지도와 같은 값). 칩 · 세그먼트 하나 = map 요청 1건.
 *
 * ⑦ 발사 계획 읽기(35-14 · D-24 · D-25 · D-29 · D-35) — 지도 탭 진입 때 GET /plan 1건(칩 · 세그먼트로 다시 부르지 않는다).
 *   서버 ok = 패널 줄 「3조각 …」 + 조각마다 점선 · 서버 실패 = 「서버 연결 안 됨 · 마지막 발사 값」(머리 값) ·
 *   404(배포 전) = 계획 기능 숨김(35-08 그대로). 계획 값은 합성(`launchPlanFixture`).
 *
 * ⑧ 발사 계획 고치기(35-15 · D-24 ~ D-28 · D-34) — 패널 「계획 고치기」 → 편집 칸 → 「저장」 = PUT 1건 → 결과 줄 · 줄 · 점선이
 *   응답 plan 값으로(지도 · 계획 재요청 0). 순서 · 범위 오류는 저장 전에 칸에서 막고, 서버 거부(code 1) · 연결 실패는 정해진
 *   문형. 저장 응답은 `savePlan` 목(기본 = 바디 값 ok · 합성).
 */

const MINUS = '\u2212';

/** 가로 넘침 — 문서 스크롤 · 앱 셸 `main`(overflow-auto) 둘 다(teamflow-report.spec 판정식). */
async function horizontalOverflow(page: Page): Promise<{ doc: number; main: number }> {
  return page.evaluate(() => {
    const se = document.scrollingElement ?? document.documentElement;
    const main = document.querySelector('main');
    return {
      doc: se.scrollWidth - se.clientWidth,
      main: main === null ? 0 : main.scrollWidth - main.clientWidth,
    };
  });
}

const root = (page: Page) => page.locator('[data-slot="admin-launch"]');
const cards = (page: Page) => root(page).locator('[data-slot="launch-head-card"]');
const card = (page: Page, gateway: string, market: string) =>
  root(page).locator(`[data-slot="launch-head-card"][data-gateway="${gateway}"][data-market="${market}"]`);
const group = (page: Page, gateway: string, market: string) =>
  root(page).locator(`[data-slot="launch-group"][data-gateway="${gateway}"][data-market="${market}"]`);

async function open(page: Page, url = '/admin/launch'): Promise<void> {
  await page.goto(url);
  await expect(root(page).getByRole('heading', { level: 1, name: '발사' })).toBeVisible({ timeout: 30_000 });
}

test.describe('어드민 발사 · 주문 내역', () => {
  test('P35-L1 1280 — 16:00 머리 카드 4장 · 빈 카드 · 조각 표 18행 · 날짜 이동 요청 1건', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page);

    await expect(root(page).getByRole('tab', { name: '주문 내역' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-slot="limitup-date"]')).toHaveText('10/26 (월)');
    await expect(root(page).locator('[data-slot="launch-fire-seg"] button[aria-pressed="true"]')).toHaveText('16:00 예약');
    await expect(root(page).locator('[data-slot="launch-source"]')).toHaveText('KB120 · KYOBO119 저널 80 · 16:00:01 적재');

    // 카드 4 · LAUNCH_ORDER 순
    await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });
    const order = await cards(page).evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-gateway')}|${el.getAttribute('data-market')}`),
    );
    expect(order).toEqual(['KB120|Q', 'KB120|K', 'KYOBO119|Q', 'KYOBO119|K']);
    await expect(card(page, 'KB120', 'K')).toHaveText('KB 코스피 · 이 날 발사 없음');
    await expect(card(page, 'KYOBO119', 'K')).toHaveText('교보 코스피 · 이 날 발사 없음');
    // 1280 = 카드 2열(첫 줄 두 장 y 같음 · x 다름)
    const b0 = (await cards(page).nth(0).boundingBox())!;
    const b1 = (await cards(page).nth(1).boundingBox())!;
    expect(Math.round(b0.y)).toBe(Math.round(b1.y));
    expect(b1.x).toBeGreaterThan(b0.x + 100);

    const kbq = card(page, 'KB120', 'Q');
    await expect(kbq).toContainText('18조각');
    await expect(kbq).toContainText(`${MINUS}337`);
    await expect(kbq).toContainText(`${MINUS}146 → ${MINUS}151`);
    await expect(kbq).toContainText('접수 16');
    await expect(kbq).toContainText('기타 2');

    // 조각 표 — 발사 있는 조합만(KB 코스닥 · 교보 코스닥)
    await expect(root(page).locator('[data-slot="launch-group"]')).toHaveCount(2);
    const rows = group(page, 'KB120', 'Q').locator('tbody tr');
    await expect(rows).toHaveCount(18);
    const first = rows.first();
    await expect(first).toContainText('삼성전자');
    await expect(first).toContainText('1234567801');
    await expect(first).toContainText('15:59:59.999');
    await expect(first).toContainText('Q153015001 · j0 · R—');
    await expect(first).toContainText(`${MINUS}332`);
    await expect(first.locator('[data-slot="launch-result"]')).toHaveAttribute('data-tone', 'ok');
    await expect(rows.nth(1)).toContainText('—');

    await page.waitForTimeout(500);
    expect(api.orders().map((r) => r.query)).toEqual([{}]);

    // ‹ → 10/23 push · 요청 1건
    await root(page).getByRole('button', { name: '이전 보고서' }).click();
    await expect(page).toHaveURL(/\/admin\/launch\?d=20261023$/);
    await expect(page.locator('[data-slot="limitup-date"]')).toHaveText('10/23 (금)');
    await expect(group(page, 'KYOBO119', 'K').locator('tbody tr')).toHaveCount(6);
    await page.waitForTimeout(500);
    expect(api.orders().filter((r) => r.query.d === '20261023')).toHaveLength(1);
    expect(api.orders()).toHaveLength(2);

    await page.screenshot({ path: test.info().outputPath('launch-orders-1280.png'), fullPage: true });
  });

  test('P35-L2 1280 — 09:00:30 개장차익 · 두 다리 · 발사 · 재전송 열 · 고정 다음 오프셋 · 다시 받지 않음', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page);
    await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });
    await page.waitForTimeout(500);
    const before = api.orders().length;

    await root(page).getByRole('button', { name: '09:00:30 개장차익' }).click();
    await expect(page).toHaveURL(/\/admin\/launch\?fire=n0930$/);
    await expect(root(page).locator('[data-slot="launch-fire-seg"] button[aria-pressed="true"]')).toHaveText('09:00:30 개장차익');
    await expect(root(page).locator('[data-slot="launch-source"]')).toHaveText('KB120 · KYOBO119 저널 80 · 09:00:31 적재');

    const kbq = group(page, 'KB120', 'Q');
    await expect(kbq.getByRole('columnheader', { name: '발사' })).toBeVisible();
    await expect(kbq.getByRole('columnheader', { name: '재전송' })).toBeVisible();
    const rows = kbq.locator('tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText('A 09:00:27 KRX→');
    await expect(rows.nth(0)).toContainText('매수');
    await expect(rows.nth(1)).toContainText('A NXT');
    await expect(rows.nth(1)).toContainText('매도');
    await expect(rows.nth(2)).toContainText('N NXT');
    await expect(rows.nth(2)).toContainText('09:00:30.092');
    await expect(rows.nth(2)).toContainText(`${MINUS}20,148`);
    await expect(group(page, 'KB120', 'K').locator('tbody tr').first()).toContainText('09:00:30.046');

    const kbqCard = card(page, 'KB120', 'Q');
    await expect(kbqCard).toContainText('5조각 · N·A');
    await expect(kbqCard).toContainText(`고정 ${MINUS}245µs`);
    await expect(kbqCard).toContainText('4회');
    await expect(kbqCard).toContainText('거부 4');
    await expect(card(page, 'KB120', 'K')).toContainText('2조각 · N·A');
    await expect(card(page, 'KYOBO119', 'Q')).toContainText(`고정 ${MINUS}200µs`);

    await page.waitForTimeout(500);
    expect(api.orders(), '세그먼트 전환은 다시 받지 않는다').toHaveLength(before);
    await page.screenshot({ path: test.info().outputPath('launch-orders-n0930-1280.png'), fullPage: true });
  });

  test('P35-L3 390 — 카드 1열 · 조각 표만 가로 스크롤 · 페이지 가로 스크롤 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockLaunchApi(page);
    await open(page);
    await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });

    const xs = await cards(page).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
    expect(new Set(xs).size, `카드 x ${xs.join(',')}`).toBe(1);

    const wrap = root(page).locator('[data-slot="launch-pieces"]').first();
    const fit = await wrap.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(fit.sw, '조각 표 래퍼 안 가로 스크롤').toBeGreaterThan(fit.cw);

    const o = await horizontalOverflow(page);
    expect(o.doc, '문서 가로 넘침 0').toBeLessThanOrEqual(0);
    expect(o.main, 'main 가로 넘침 0').toBeLessThanOrEqual(0);

    await root(page).getByRole('button', { name: '09:00:30 개장차익' }).click();
    await expect(group(page, 'KB120', 'Q').locator('tbody tr')).toHaveCount(5);
    const o2 = await horizontalOverflow(page);
    expect(o2.doc, '09:00:30 문서 가로 넘침 0').toBeLessThanOrEqual(0);
    expect(o2.main, '09:00:30 main 가로 넘침 0').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('launch-orders-390.png'), fullPage: true });
  });

  test('P35-L4 빈 상태 — 이력 0', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockLaunchApi(page, { ordersEmpty: true });
    await open(page);
    await expect(root(page).locator('[data-slot="launch-empty"]')).toHaveText('아직 적재된 발사가 없어요 · 첫 적재는 16:00:01', {
      timeout: 15_000,
    });
    await expect(cards(page)).toHaveCount(0);
  });

  test('P35-L5 행 없는 ?d → 「이 날은 발사가 없어요」 → 최신 보기 → d 없는 주소', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page, '/admin/launch?d=20261024&fire=n0930');
    const empty = root(page).locator('[data-slot="launch-empty"]');
    await expect(empty).toContainText('이 날은 발사가 없어요', { timeout: 15_000 });
    expect(api.orders().every((r) => r.query.d === '20261024')).toBe(true);
    await empty.getByRole('button', { name: '최신 보기' }).click();
    await expect(page).toHaveURL(/\/admin\/launch\?fire=n0930$/);
    await expect(cards(page)).toHaveCount(4);
  });

  test('P35-L6 형식 오류 ?d → replace 로 d 만 지운다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page, '/admin/launch?d=2026-10-12&fire=n0930');
    await expect(page).toHaveURL(/\/admin\/launch\?fire=n0930$/);
    await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });
    expect(api.orders().every((r) => r.query.d === undefined)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 경계 지도 탭 (35-08)
// ─────────────────────────────────────────────────────────────────────────────

const panels = (page: Page) => root(page).locator('[data-slot="launch-panel"]');
const panel = (page: Page, gateway: string, market: string) =>
  root(page).locator(`[data-slot="launch-panel"][data-gateway="${gateway}"][data-market="${market}"]`);
const kpi = (page: Page, gateway: string, market: string) =>
  root(page).locator(`[data-slot="launch-kpi"][data-gateway="${gateway}"][data-market="${market}"]`);
const rangeText = (page: Page) => root(page).locator('[data-slot="launch-range-text"]');

test.describe('어드민 발사 · 경계 지도', () => {
  test('P35-M1 1280 — ?tab=map&range=all · 요청 1건 · 범위 글 · 4패널 순서 · 점 196 · KB 코스닥 카드 · 패널 머리', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page, '/admin/launch?tab=map&range=all');

    await expect(root(page).getByRole('tab', { name: '경계 지도' })).toHaveAttribute('aria-selected', 'true');
    await expect(panels(page)).toHaveCount(4, { timeout: 15_000 });
    await expect(rangeText(page)).toHaveText('10/12 ~ 10/26 · 11거래일');
    await expect(root(page).locator('[data-slot="launch-range"] button[aria-pressed="true"]')).toHaveText('전체');

    const order = await panels(page).evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-gateway')}|${el.getAttribute('data-market')}`),
    );
    expect(order).toEqual(['KB120|Q', 'KB120|K', 'KYOBO119|Q', 'KYOBO119|K']);

    const dots = await root(page).locator('[data-slot="launch-chart"] circle').count();
    expect(dots, '4패널 점 합 = 첨부 조각 196').toBe(196);

    // 점에 마우스를 대면 즉시 µs 툴팁(사용자 UAT 2026-10-27)
    const kbPanel = panel(page, 'KB120', 'Q');
    await kbPanel.locator('rect[data-slot="launch-dot-hit"]').first().hover();
    const tip = kbPanel.locator('[data-slot="launch-dot-tip"]');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/^[−+]?[\d,]+µs/);

    const kb = kpi(page, 'KB120', 'Q');
    await expect(kb).toContainText('KB 코스닥 · 10일');
    await expect(kb.locator('[data-kpi="min-accept"]')).toHaveText(`${MINUS}347µs`);
    await expect(kb.locator('[data-kpi="max-reject"]')).toHaveText(`${MINUS}322µs`);
    await expect(kb.locator('[data-kpi="next"]')).toHaveText(`${MINUS}337µs`);
    await expect(panel(page, 'KB120', 'Q').locator('[data-slot="launch-panel-stats"]')).toHaveText(
      '경계 잡힌 날 4 · 전부 접수 5 · 전부 거부 1',
    );

    await page.waitForTimeout(500);
    expect(api.maps().map((r) => r.query)).toEqual([{ fire: 'q16', range: 'all' }]);
    expect(api.orders(), '지도 탭 진입은 주문 내역을 받지 않는다').toHaveLength(0);
    await page.screenshot({ path: test.info().outputPath('launch-map-1280.png'), fullPage: true });
  });

  test('P35-M2 1280 — 기본 10d → 20일 → 전체(요청 1건씩) · 09:00:30 합패널 마름모 · 주문 내역 탭으로 fire 보존', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page, '/admin/launch?tab=map');
    await expect(panels(page)).toHaveCount(4, { timeout: 15_000 });
    await expect(rangeText(page)).toHaveText('10/13 ~ 10/26 · 10거래일');
    await expect(root(page).locator('[data-slot="launch-range"] button[aria-pressed="true"]')).toHaveText('최근 10일');
    await page.waitForTimeout(500);
    expect(api.maps().map((r) => r.query)).toEqual([{ fire: 'q16', range: '10d' }]);

    const params = () => Object.fromEntries(new URL(page.url()).searchParams.entries());

    await root(page).getByRole('button', { name: '20일' }).click();
    await expect(page).toHaveURL(/range=20d/);
    expect(params()).toEqual({ tab: 'map', range: '20d' });
    await expect(rangeText(page)).toHaveText('10/12 ~ 10/26 · 11거래일');
    await page.waitForTimeout(300);
    expect(api.maps()).toHaveLength(2);

    await root(page).getByRole('button', { name: '전체' }).click();
    await expect(page).toHaveURL(/range=all/);
    await expect(root(page).locator('[data-slot="launch-range"] button[aria-pressed="true"]')).toHaveText('전체');
    await page.waitForTimeout(300);
    expect(api.maps()).toHaveLength(3);

    await root(page).getByRole('button', { name: '09:00:30 개장차익' }).click();
    await expect(page).toHaveURL(/fire=n0930/);
    expect(params()).toEqual({ tab: 'map', range: 'all', fire: 'n0930' });
    await expect(rangeText(page)).toHaveText('10/26 · 1거래일');
    await page.waitForTimeout(300);
    expect(api.maps()).toHaveLength(4);
    expect(api.maps()[3]!.query).toEqual({ fire: 'n0930', range: 'all' });

    await expect(panel(page, 'KB120', 'Q').locator('[data-slot="launch-chart"] path[data-shape="diamond"]')).toHaveCount(1);
    const legend = root(page).locator('[data-slot="launch-legend"]');
    await expect(legend).toContainText('마름모 = A 매도 · 동그라미 = N 매수');
    await expect(legend).toContainText('구분 없음(백필)');
    await expect(kpi(page, 'KB120', 'Q').locator('[data-kpi="next"]')).toHaveText(`${MINUS}245µs`);
    await expect(kpi(page, 'KYOBO119', 'Q').locator('[data-kpi="next"]')).toHaveText(`${MINUS}200µs`);
    await expect(root(page).locator('[data-slot="launch-foot"]')).toHaveText(
      'N 오프셋은 고정값 — 선은 최신 N 머리 값 · 재전송은 첫 발만 점 · 횟수는 툴팁',
    );
    await page.screenshot({ path: test.info().outputPath('launch-map-n0930-1280.png'), fullPage: true });

    await root(page).getByRole('tab', { name: '주문 내역' }).click();
    await expect(page).toHaveURL(/tab=orders/);
    expect(params()).toEqual({ tab: 'orders', range: 'all', fire: 'n0930' });
    await expect(root(page).locator('[data-slot="launch-fire-seg"] button[aria-pressed="true"]')).toHaveText('09:00:30 개장차익');
    await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });
  });

  test('P35-M3 390 — SVG 640 고정 · 패널 래퍼 가로 스크롤 · 요약 카드 2열 · 페이지 가로 스크롤 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockLaunchApi(page);
    await open(page, '/admin/launch?tab=map&range=all');
    await expect(panels(page)).toHaveCount(4, { timeout: 15_000 });

    const charts = root(page).locator('[data-slot="launch-chart"]');
    await expect(charts).toHaveCount(4);
    const fits = await charts.evaluateAll((els) =>
      els.map((el) => {
        const wrap = el.parentElement!;
        return { w: el.getAttribute('width'), sw: wrap.scrollWidth, cw: wrap.clientWidth };
      }),
    );
    for (const f of fits) {
      expect(f.w, 'SVG 폭 640 고정').toBe('640');
      expect(f.sw, '패널 래퍼 안 가로 스크롤').toBeGreaterThan(f.cw);
    }

    const k = root(page).locator('[data-slot="launch-kpi"]');
    const b0 = (await k.nth(0).boundingBox())!;
    const b1 = (await k.nth(1).boundingBox())!;
    const b2 = (await k.nth(2).boundingBox())!;
    expect(Math.round(b0.y), '1·2번째 카드 같은 줄').toBe(Math.round(b1.y));
    expect(b2.y, '3번째 카드 아래 줄').toBeGreaterThan(b0.y + b0.height - 1);

    const o = await horizontalOverflow(page);
    expect(o.doc, '문서 가로 넘침 0').toBeLessThanOrEqual(0);
    expect(o.main, 'main 가로 넘침 0').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('launch-map-390.png'), fullPage: true });

    await root(page).getByRole('button', { name: '09:00:30 개장차익' }).click();
    await expect(panel(page, 'KB120', 'Q').locator('path[data-shape="diamond"]')).toHaveCount(1, { timeout: 15_000 });
    const o2 = await horizontalOverflow(page);
    expect(o2.doc, '09:00:30 문서 가로 넘침 0').toBeLessThanOrEqual(0);
    expect(o2.main, '09:00:30 main 가로 넘침 0').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('launch-map-n0930-390.png'), fullPage: true });
  });

  test('P35-M4 빈 상태 — map days [] → 「아직 적재된 발사가 없어요」', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockLaunchApi(page, { map: () => ({ days: [], heads: [], pieces: [] }) });
    await open(page, '/admin/launch?tab=map');
    await expect(root(page).locator('[data-slot="launch-empty"]')).toHaveText('아직 적재된 발사가 없어요 · 첫 적재는 16:00:01', {
      timeout: 15_000,
    });
    await expect(panels(page)).toHaveCount(0);
    await expect(root(page).locator('[data-slot="launch-kpis"]')).toHaveCount(0);
  });

  test('P35-M5 잘못된 ?range → replace 로 range 만 지운다(기본 10d)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page, '/admin/launch?tab=map&range=30d&fire=n0930');
    await expect(page).toHaveURL(/\/admin\/launch\?tab=map&fire=n0930$/);
    await expect(panels(page)).toHaveCount(4, { timeout: 15_000 });
    await page.waitForTimeout(300);
    expect(api.maps().every((r) => r.query.range === '10d')).toBe(true);
  });
});

const planBar = (page: Page, gateway: string, market: string) =>
  panel(page, gateway, market).locator('[data-slot="launch-plan-bar"]');

test.describe('어드민 발사 · 발사 계획(읽기)', () => {
  test('P35-P1 1280 — 서버 ok · KB 코스닥 줄 「3조각」 · 점선 3 · KPI −350 · 마지막 변경 · 변경 이력 2 · /plan 1건', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page, { plan: launchPlanFixture });
    await open(page, '/admin/launch?tab=map&range=all');
    await expect(panels(page)).toHaveCount(4, { timeout: 15_000 });

    const kbq = panel(page, 'KB120', 'Q');
    await expect(kbq.locator('[data-slot="launch-plan-line"]')).toHaveText(
      `3조각 ${MINUS}350 · ${MINUS}345 · ${MINUS}325µs`,
      { timeout: 15_000 },
    );
    await expect(kbq.locator('[data-slot="launch-next"]')).toHaveCount(3);
    await expect(kpi(page, 'KB120', 'Q').locator('[data-kpi="next"]')).toHaveText(`${MINUS}350µs`);
    await expect(kbq.locator('[data-slot="launch-plan-last"]')).toContainText('admin@example.com');
    await expect(root(page).locator('[data-slot="launch-legend"]')).toContainText('다음 발사 계획(조각마다 점선)');

    const fold = kbq.locator('[data-slot="launch-plan-history-fold"]');
    await expect(fold.locator('summary')).toHaveText('변경 이력 2');
    await fold.locator('summary').click();
    const rows = fold.locator('[data-slot="launch-plan-history"] tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toBeVisible();
    await expect(rows.nth(0).locator('[data-slot="launch-plan-outcome"]')).toHaveText('저장됨');
    await expect(rows.nth(1).locator('[data-slot="launch-plan-outcome"]')).toHaveText('실패');
    await expect(rows.nth(1).locator('[data-slot="launch-plan-outcome"]')).toHaveAttribute(
      'title',
      '조각 시각 순서가 맞지 않아요',
    );
    // 이력이 없는 패널엔 접힘이 없다
    await expect(panel(page, 'KB120', 'K').locator('[data-slot="launch-plan-history-fold"]')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('launch-plan-read-1280.png'), fullPage: true });

    await page.waitForTimeout(300);
    expect(api.planGets()).toHaveLength(1);
    expect(api.maps()).toHaveLength(1);

    await root(page).getByRole('button', { name: '20일' }).click();
    await expect(page).toHaveURL(/range=20d/);
    await expect(root(page).locator('[data-slot="launch-range"] button[aria-pressed="true"]')).toHaveText('20일');
    await page.waitForTimeout(300);
    expect(api.maps()).toHaveLength(2);

    await root(page).getByRole('button', { name: '전체' }).click();
    await expect(page).toHaveURL(/range=all/);
    await expect(root(page).locator('[data-slot="launch-range"] button[aria-pressed="true"]')).toHaveText('전체');
    await page.waitForTimeout(300);
    expect(api.maps()).toHaveLength(3);
    expect(api.planGets(), '범위 칩은 계획을 다시 부르지 않는다').toHaveLength(1);
    await expect(kbq.locator('[data-slot="launch-plan-line"]')).toHaveText(`3조각 ${MINUS}350 · ${MINUS}345 · ${MINUS}325µs`);
  });

  test('P35-P2 ① 서버 실패 → 4패널 대신 값(머리) · 점선 각 1 · KPI −337', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockLaunchApi(page, {
      plan: () => ({
        servers: {
          KB120: { status: 'offline', message: 'relay 응답이 없어요' },
          KYOBO119: { status: 'failed', code: 1, message: '거부' },
        },
        changes: [],
      }),
    });
    await open(page, '/admin/launch?tab=map&range=all');
    await expect(panels(page)).toHaveCount(4, { timeout: 15_000 });

    for (const [g, m] of [
      ['KB120', 'Q'],
      ['KB120', 'K'],
      ['KYOBO119', 'Q'],
      ['KYOBO119', 'K'],
    ] as const) {
      await expect(planBar(page, g, m).locator('[data-slot="launch-plan-line"]')).toContainText(
        '서버 연결 안 됨 · 마지막 발사 값',
        { timeout: 15_000 },
      );
      await expect(panel(page, g, m).locator('[data-slot="launch-next"]')).toHaveCount(1);
    }
    await expect(planBar(page, 'KB120', 'Q').locator('[data-slot="launch-plan-line"]')).toHaveText(
      `서버 연결 안 됨 · 마지막 발사 값 ${MINUS}337µs`,
    );
    await expect(kpi(page, 'KB120', 'Q').locator('[data-kpi="next"]')).toHaveText(`${MINUS}337µs`);
  });

  test('P35-P2 ② /plan 404(배포 전) → 계획 기능 숨김 · 35-08 그대로(KPI −337 · 점선 1)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page);
    await open(page, '/admin/launch?tab=map&range=all');
    await expect(panels(page)).toHaveCount(4, { timeout: 15_000 });
    await expect(kpi(page, 'KB120', 'Q').locator('[data-kpi="next"]')).toHaveText(`${MINUS}337µs`);
    await expect.poll(() => api.planGets().length).toBe(1);
    await page.waitForTimeout(500);
    await expect(root(page).locator('[data-slot="launch-plan-bar"]')).toHaveCount(0);
    await expect(panel(page, 'KB120', 'Q').locator('[data-slot="launch-next"]')).toHaveCount(1);
    await expect(root(page).locator('[data-slot="launch-legend"]')).toContainText('다음 발사의 첫 조각');
  });
});

const editor = (page: Page, gateway: string, market: string) =>
  panel(page, gateway, market).locator('[data-slot="launch-plan-editor"]');
const editToggle = (page: Page, gateway: string, market: string) =>
  panel(page, gateway, market).locator('[data-slot="launch-plan-edit-toggle"]');

test.describe('어드민 발사 · 발사 계획(고치기)', () => {
  test('P35-P3 1280 — KB 코스닥 「계획 고치기」 → 2번 −340 → 저장 → PUT 1건 · 결과 줄 · 줄 갱신 · 재요청 0', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = await mockLaunchApi(page, { plan: launchPlanFixture });
    await open(page, '/admin/launch?tab=map&range=all');
    await expect(panels(page)).toHaveCount(4, { timeout: 15_000 });
    const kbq = panel(page, 'KB120', 'Q');
    await expect(kbq.locator('[data-slot="launch-plan-line"]')).toHaveText(`3조각 ${MINUS}350 · ${MINUS}345 · ${MINUS}325µs`, {
      timeout: 15_000,
    });
    await page.waitForTimeout(300);
    const mapsBefore = api.maps().length;
    const getsBefore = api.planGets().length;

    await expect(editToggle(page, 'KB120', 'Q')).toHaveText('계획 고치기');
    await editToggle(page, 'KB120', 'Q').click();
    await expect(editToggle(page, 'KB120', 'Q')).toHaveText('닫기');
    const ed = editor(page, 'KB120', 'Q');
    await expect(ed).toBeVisible();
    await expect(ed.locator('[data-slot="launch-plan-input"]')).toHaveCount(3);
    const save = ed.locator('[data-slot="launch-plan-save"]');
    await expect(save, '서버 값과 같으면 저장 비활성').toBeDisabled();

    await ed.getByLabel('2번 조각 시각(µs)').fill('-340');
    await expect(save).toBeEnabled();
    await save.click();

    await expect(ed.locator('[data-slot="launch-plan-result"]')).toContainText(/저장됨 · \d\d:\d\d · 다음 16:00 발사부터/, {
      timeout: 15_000,
    });
    await expect(ed.locator('[data-slot="reflect-chip"]')).toHaveText('KB120');
    expect(api.planPuts()).toHaveLength(1);
    expect(api.planPuts()[0]!.path).toBe('/plan/KB120/q16/Q');
    expect(api.planPuts()[0]!.body).toEqual({ offsets_us: [-350, -340, -325] });

    await expect(kbq.locator('[data-slot="launch-plan-line"]')).toHaveText(`3조각 ${MINUS}350 · ${MINUS}340 · ${MINUS}325µs`);
    await expect(kbq.locator('[data-slot="launch-next"]')).toHaveCount(3);
    await expect(kbq.locator('[data-slot="launch-next"][data-idx="1"] title')).toHaveText(`다음 발사 계획 2번 ${MINUS}340µs`);
    await expect(kbq.locator('[data-slot="launch-plan-history-fold"] summary')).toHaveText('변경 이력 3');
    await expect(save, '저장 뒤 = 서버 값 → 저장 비활성').toBeDisabled();
    await page.screenshot({ path: test.info().outputPath('launch-plan-save-1280.png'), fullPage: true });

    await page.waitForTimeout(300);
    expect(api.maps(), '지도 재요청 없음').toHaveLength(mapsBefore);
    expect(api.planGets(), '계획 재요청 없음').toHaveLength(getsBefore);
  });
});
