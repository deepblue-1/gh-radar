import { test, expect, type Page, type Route } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import {
  AXION,
  DUKWOO,
  FP_LIVE_MEMBER,
  FP_OBSERVING_MEMBER,
  FP_ROWS,
  HYUNGJI,
  LIMITUP_DATES,
  LIMITUP_LATEST,
  PREV_PENDING_NAME,
  gridFixtureGz,
  limitupReportFixture,
} from '../fixtures/limitup-report';
import { withLocalRelay, type LocalRelay } from '../fixtures/relay';

/**
 * Phase 28 Plan 13 Task 3 — P28-R1 상한가 보고서 한 장 (D-09 ~ D-12 · UI-SPEC ④ · 「검증 훅」 보고서 · 색 감사).
 *
 * ① 무엇을 증명하는가
 *   진짜 브라우저에서 사이드바 「분석」 → `/analytics/limitup` → 날짜 알약(‹ › · `?d` 정본화) → KPI 4칸 · 제외 한 줄 ·
 *   종목 리스트(첫 행 기본 펼침 → 다른 행 그 자리 펼침 · 한 번에 하나 — quick-261005-vk1) → 연 행의 격자 파일만 로드(서명 URL
 *   목록 날짜당 1회 · gzip 바이트를 브라우저가 `DecompressionStream` 으로 해제 → 레인 SVG) → 창구 지문표(관찰 중 · 더 보기) →
 *   어제 결과(D+1 「—」) · 없는 날짜 CTA · 403 게이트가 한 줄로 이어진다. 단위(RTL)는 jsdom 이라 스크롤 · 실 gzip 해제 ·
 *   라벨 겹침을 못 본다.
 *
 * ② 규약(fixtures/relay.ts ⑥): 파일 내부 직렬 · beforeAll 1회 relay(DMA 매핑 사용자 — 게이트 통과 · 사이드바 「분석」 노출) ·
 *   afterAll stop · beforeEach reset. 보고서 · 서명 URL · 격자 파일은 `page.route` 목이다(server · Storage 는 이 e2e 밖).
 *
 * ③ 픽스처 = 워커 실 export 20261002 3종목(fixtures/limitup-report.ts). 실계좌 · 실서버 리터럴 없음 — 서명 URL 은
 *   `grid.e2e.invalid`(예약 TLD) 가짜 주소다. 폰 390 에서는 레인 오버레이 글자가 서로 겹치지 않는지 실측한다(E8 overflow backstop).
 */

test.describe.configure({ mode: 'serial' });

const GRID_HOST = 'https://grid.e2e.invalid';

interface Recorder {
  reportDs: (string | null)[];
  gridUrlDs: string[];
  /** 「YYYYMMDD/isin」 — 어느 날짜 문서의 요청인지. */
  gridHits: string[];
  mode403: boolean;
}

/**
 * quick-261006-ide(스케치 012-A) — 잠김 요약 칩 회귀용 **합성값**(실 export 아님 — 실 export 20261002 에는 새 키가 없다).
 * 스케치 예시값 그대로: 덕우(깨짐) 9.8억 · 9.2억 · 4% · 40% · — · 25% / 엑시온(유지) 2.3억 · 1.1억 · — · 1% · 6% · 192%.
 */
const LOCK_RISK_SYNTH: Record<string, Record<string, number | null>> = {
  [DUKWOO]: { sell_krw: 980_000_000, cancel_krw: 920_000_000, risk_3s: 0.04, risk_10s: 0.4, risk_60s: null, risk_pre: 0.25 },
  [AXION]: { sell_krw: 230_000_000, cancel_krw: 110_000_000, risk_3s: null, risk_10s: 0.01, risk_60s: 0.06, risk_pre: 1.92 },
};

/** 보고서 응답 day.locks 중 덕우 · 엑시온 잠김 행 전부에 합성 6값을 덧입힌다. */
function withLockRisk<T>(body: T): T {
  const day = (body as { day?: { locks?: Array<Record<string, unknown>> } }).day;
  if (!day?.locks) return body;
  return {
    ...body,
    day: { ...day, locks: day.locks.map((l) => ({ ...l, ...(LOCK_RISK_SYNTH[l.isin as string] ?? {}) })) },
  };
}

async function installLimitupMocks(page: Page, opts: { lockRisk?: boolean } = {}): Promise<Recorder> {
  const rec: Recorder = { reportDs: [], gridUrlDs: [], gridHits: [], mode403: false };
  await page.route('**/api/limitup/report*', async (route: Route) => {
    const d = new URL(route.request().url()).searchParams.get('d');
    rec.reportDs.push(d);
    if (rec.mode403) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'DMA_UNMAPPED', message: 'DMA 매핑 없음' } }),
      });
      return;
    }
    const body =
      d === null
        ? limitupReportFixture()
        : LIMITUP_DATES.includes(d)
          ? limitupReportFixture({ date: d })
          : { access: true, dates: LIMITUP_DATES, date: d, loaded: false };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(opts.lockRisk ? withLockRisk(body) : body),
    });
  });
  await page.route('**/api/limitup/grid-urls*', async (route: Route) => {
    const d = new URL(route.request().url()).searchParams.get('d') ?? '';
    rec.gridUrlDs.push(d);
    const urls = Object.fromEntries(
      [DUKWOO, AXION, HYUNGJI].map((i) => [i, `${GRID_HOST}/limitup-grid/grid/${d}/${i}.json.gz?token=e2e`]),
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ date: d, expiresIn: 600, urls }),
    });
  });
  await page.route(`${GRID_HOST}/**`, async (route: Route) => {
    const m = /\/grid\/(\d{8})\/([A-Z0-9]{12})\.json\.gz/.exec(route.request().url());
    const isin = m?.[2] ?? '';
    rec.gridHits.push(`${m?.[1] ?? ''}/${isin}`);
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/gzip', 'access-control-allow-origin': '*' },
      body: gridFixtureGz(isin),
    });
  });
  return rec;
}

const pill = (page: Page) => page.locator('[data-slot="limitup-date"]');
const kpi = (page: Page, label: string) => page.locator(`[data-kpi="${label}"] dd`);
const gridRows = (page: Page) => page.locator('[data-slot="limitup-grid-rows"] button[data-isin]');
const cardOf = (page: Page, isin: string) => page.locator(`#ev-${isin}`);

/**
 * 폰 · 데스크톱 공통 (d)(e) — KPI 4칸 · 제외 한 줄 · 리스트 행 순서(미도달 없음) · 결과 태그 · 첫 행 기본 펼침 ·
 * 다른 행 클릭 → 그 자리 펼침(한 번에 하나) · 재클릭 닫힘 (quick-261005-vk1 D-02 · D-03).
 */
async function assertKpiListAndExpand(page: Page): Promise<void> {
  await expect(kpi(page, '상한가 도달')).toHaveText('2', { timeout: 30_000 });
  await expect(kpi(page, '종가까지 유지')).toHaveText('1');
  await expect(kpi(page, '깨짐')).toHaveText('1');
  await expect(kpi(page, '어제 D+1')).toHaveText('+2.5%');
  await expect(page.locator('[data-kpi]')).toHaveCount(4);
  await expect(page.locator('[data-slot="limitup-excluded"]')).toHaveText(
    '상한가에 닿지 않은 1종목(형지글로벌)은 목록에서 뺐어요',
  );

  await expect(gridRows(page)).toHaveCount(2);
  expect(await gridRows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-isin')))).toEqual([
    DUKWOO,
    AXION,
  ]);
  await expect(gridRows(page).nth(0).locator('[data-tag="깨짐"]')).toHaveCount(1);
  await expect(gridRows(page).nth(1).locator('[data-tag="유지"]')).toHaveCount(1);
  await expect(page.locator(`[data-isin="${HYUNGJI}"]`)).toHaveCount(0);

  // 첫 행 기본 펼침 — 사건 카드가 그 행 바로 아래.
  const dukwooRow = page.getByRole('button', { name: '덕우전자 263600 — 사건 카드' });
  const axionRow = page.getByRole('button', { name: '엑시온그룹 069920 — 사건 카드' });
  // 잠김 최대 잔량 = q_max 사실 최대 — 픽스처 summary q_max_krw(하루 최대 36.0억 · 22.8억 · 단일가 포함)가 아니다(quick-261005-x9o).
  await expect(dukwooRow).toHaveAccessibleDescription(/잠김 최대 27\.6억/);
  await expect(axionRow).toHaveAccessibleDescription(/잠김 최대 6\.9억/);
  await expect(dukwooRow).toHaveAttribute('aria-expanded', 'true');
  await expect(dukwooRow).toHaveAttribute('aria-controls', `ev-${DUKWOO}`);
  await expect(axionRow).toHaveAttribute('aria-expanded', 'false');
  await expect(cardOf(page, DUKWOO)).toBeVisible();
  expect(
    await dukwooRow.evaluate((b, id) => b.nextElementSibling?.id === id, `ev-${DUKWOO}`),
  ).toBe(true);
  await expect(page.locator('[data-slot="limitup-event-card"]')).toHaveCount(1);

  // 다른 행 → 그 행만 열림(그 자리) · 같은 행 다시 → 전부 닫힘 · 첫 행 다시 열기.
  await axionRow.click();
  await expect(cardOf(page, AXION)).toBeVisible();
  await expect(cardOf(page, DUKWOO)).toHaveCount(0);
  await expect(axionRow).toHaveAttribute('aria-expanded', 'true');
  expect(await axionRow.evaluate((b, id) => b.nextElementSibling?.id === id, `ev-${AXION}`)).toBe(true);
  // 위쪽 카드가 접히며 머리 위로 밀려난 행은 되돌린다 — 연 행이 화면 안(앱 머리 아래)에 있다.
  await expect.poll(async () => (await axionRow.boundingBox())?.y ?? -1, { timeout: 5_000 }).toBeGreaterThan(40);
  await axionRow.click();
  await expect(page.locator('[data-slot="limitup-event-card"]')).toHaveCount(0);
  await dukwooRow.click();
  await expect(cardOf(page, DUKWOO)).toBeVisible();
  await expect(dukwooRow).toBeFocused();
}

test.describe('Phase 28 Plan 13 — 상한가 보고서 (로컬 relay)', () => {
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

  test('P28-R1 상한가 보고서 한 장', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const rec = await installLimitupMocks(page);

    // (a) 사이드바 「분석」 → /analytics/limitup · 하위 「상한가 보고서」 가 aria-current="page"(2026-10-06 — 하위가 켠다).
    await page.goto('/trading');
    const nav = page.locator('aside nav[aria-label="주 메뉴"]');
    const analytics = nav.getByRole('link', { name: '분석', exact: true });
    await expect(analytics).toBeVisible({ timeout: 30_000 });
    await analytics.click();
    await expect(page).toHaveURL((u) => u.pathname === '/analytics/limitup' && u.search === '');
    await expect(nav.getByRole('link', { name: '상한가 보고서', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: '분석', exact: true })).not.toHaveAttribute('aria-current');

    // (b) 날짜 알약 = 최신 · › disabled · ‹ → 이전 적재 날짜(?d=).
    await expect(pill(page)).toHaveText('10/02 (금)', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: '다음 보고서' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '이전 보고서' })).toBeEnabled();
    await page.getByRole('button', { name: '이전 보고서' }).click();
    await expect(page).toHaveURL((u) => u.searchParams.get('d') === '20261001');
    await expect(pill(page)).toHaveText('10/01 (목)');
    await expect(page.getByRole('button', { name: '다음 보고서' })).toBeEnabled();

    // (c) ?d=bad 직접 진입 → URL 정본화(쿼리 없음) · 최신 날짜. 새 문서라 격자 모듈 캐시도 새로 시작한다 —
    //     (f) 의 「날짜당 1회」 는 이 문서 수명 안에서 센다.
    rec.gridUrlDs.length = 0;
    rec.gridHits.length = 0;
    await page.goto('/analytics/limitup?d=bad');
    await expect(page).toHaveURL((u) => u.pathname === '/analytics/limitup' && u.search === '');
    await expect(pill(page)).toHaveText('10/02 (금)', { timeout: 30_000 });

    // (d)(e) — 끝에 덕우전자가 다시 열려 있다.
    await assertKpiListAndExpand(page);

    // (d') 열 머리 「잠김 최대 잔량」 이 자기 열 안에 들어간다(nowrap 넘침 0 — quick-261005-x9o).
    const lockMaxHead = page
      .locator('[data-slot="limitup-day-grid"] div[aria-hidden="true"] > span')
      .filter({ hasText: /^잠김 최대 잔량$/ });
    await expect(lockMaxHead).toHaveCount(1);
    expect(await lockMaxHead.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);

    // (f) 그 카드의 레인 2 SVG(gzip 해제) · grid-urls 는 그 날짜 1회 · 격자 파일은 연 행만(형지글로벌 없음 · 같은 격자 두 번 안 받음).
    const lockSvg = cardOf(page, DUKWOO).getByRole('img', {
      name: /^덕우전자 잠김 구간 잔량 — 최대 27\.5억 09:06:02, 깨짐 09:06:12, 단일가 09:04:01~09:06:01$/,
    });
    await expect(lockSvg).toBeVisible({ timeout: 15_000 });
    // 미잠김 단일가 회색 면 1개 · 캡션 「단일가」(quick-261005-x9o)
    await expect(cardOf(page, DUKWOO).locator('rect[data-slot="limitup-auction"]')).toHaveCount(1);
    await expect(cardOf(page, DUKWOO).locator('[data-label="auction-0"]')).toHaveText('단일가');
    await expect(cardOf(page, DUKWOO).getByRole('img', { name: /^덕우전자 상한가 도달까지 / })).toBeVisible();

    // (f') 스케치 011 A — 한 줄 요약 · 레인 띠 번호 배지 ≥ 3 · 사실 문장은 시각 접두 없이 시작 · 번호 ↔ 사실 줄 호버 강조.
    const dk = cardOf(page, DUKWOO);
    await expect(dk.locator('[data-slot="limitup-story"]')).toContainText('10.1초 만에 깨짐(5,720원)');
    expect(await dk.locator('[data-slot="limitup-event-band"] [data-event-n]').count()).toBeGreaterThanOrEqual(3);
    const firstFact = (await dk.locator('[data-slot="limitup-fact-text"]').first().textContent()) ?? '';
    expect(firstFact.startsWith('등락률 20% 첫 도달')).toBe(true);
    await dk.locator('[data-slot="limitup-facts"] li[data-event-n="3"]').hover();
    await expect(dk.locator('[data-slot="limitup-event-band"] [data-event-n="3"]')).toHaveAttribute('data-hl', 'true');
    await page.mouse.move(0, 0);
    // quick-261006-ide — 실 export 10/02 에는 locks 새 키가 없다 → 잠김 요약 칩 · 캡션 0.
    await expect(dk.locator('[data-slot="limitup-lock-risk"]')).toHaveCount(0);
    await expect(dk.locator('[data-slot="limitup-lock-risk-caption"]')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/limitup-report-1280.png', fullPage: true });
    expect(rec.gridUrlDs.filter((d) => d === LIMITUP_LATEST)).toHaveLength(1);
    // 앞 문서(‹ 로 연 10/01)의 늦은 요청이 섞일 수 있어 이 문서의 날짜로 거른다.
    const hits = rec.gridHits.filter((h) => h.startsWith(`${LIMITUP_LATEST}/`)).map((h) => h.slice(9));
    expect(hits.every((h) => h === DUKWOO || h === AXION)).toBe(true); // 연 행만
    expect(hits).not.toContain(HYUNGJI);
    expect(new Set(hits).size).toBe(hits.length); // 같은 격자를 두 번 받지 않는다(다시 연 덕우전자 포함)
    expect(hits).toContain(DUKWOO);

    // 색 감사(UI-SPEC 검증 훅) — 보고서 SVG 의 stroke/fill 허용 집합 · 초록 상태 토큰 0 · SVG 안 글자 요소 0.
    const audit = await page.locator('[data-slot="limitup-report"]').evaluate((root) => {
      const allowed = new Set([
        'var(--fg)',
        'var(--muted)',
        'var(--led-latent)',
        'var(--border-subtle)',
        'var(--accent)', // 직전 1분 창 면(D-04)
        'none',
      ]);
      const bad: string[] = [];
      for (const el of root.querySelectorAll('svg *')) {
        for (const a of ['stroke', 'fill']) {
          const v = el.getAttribute(a);
          if (v !== null && !allowed.has(v)) bad.push(`${el.tagName}[${a}=${v}]`);
        }
      }
      return {
        bad,
        text: root.querySelectorAll('svg text, svg tspan, svg foreignObject').length,
        armed: root.innerHTML.includes('led-armed'),
      };
    });
    expect(audit).toEqual({ bad: [], text: 0, armed: false });

    // (g) 지문표 — n 3 창구 「관찰 중」 · 상위 20 → 「창구 3개 더 보기」 → 전부.
    const fp = page.getByRole('region', { name: '창구 지문표' });
    await fp.scrollIntoViewIfNeeded();
    await expect(fp.locator(`tr[data-member="${FP_OBSERVING_MEMBER}"]`)).toContainText('관찰 중');
    await expect(fp.locator(`tr[data-member="${FP_LIVE_MEMBER}"]`)).not.toContainText('관찰 중');
    await expect(fp.locator('tbody tr')).toHaveCount(20);
    await fp.getByRole('button', { name: `창구 ${FP_ROWS - 20}개 더 보기` }).click();
    await expect(fp.locator('tbody tr')).toHaveCount(FP_ROWS);

    // (h) 어제 결과 — D+1 미도착 행 「—」.
    const yd = page.getByRole('region', { name: '어제 결과' });
    await expect(yd).toContainText('10/01 잠김 → 다음 날 시가');
    const pending = yd.locator('tbody tr', { hasText: PREV_PENDING_NAME }).locator('td');
    await expect(pending.nth(2)).toHaveText('—');
    await expect(pending.nth(3)).toHaveText('—');
    await expect(yd.locator('tbody tr', { hasText: '어제상한종목' }).locator('td').nth(3)).toHaveText('+2.5%');

    // (i) 없는 날짜 → 빈 상태 + 「최신 보고서 보기」 → 최신.
    await page.goto('/analytics/limitup?d=20261003');
    await expect(page.getByText('이 날 보고서가 아직 없어요')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: '최신 보고서 보기' }).click();
    await expect(page).toHaveURL((u) => u.searchParams.get('d') === LIMITUP_LATEST);
    await expect(kpi(page, '상한가 도달')).toHaveText('2', { timeout: 30_000 });

    // (j) server 403 DMA_UNMAPPED → DmaGate 「상한가 보고서」.
    rec.mode403 = true;
    await page.goto('/analytics/limitup');
    const gate = page.locator('[data-slot="dma-gate"]');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toContainText('상한가 보고서는 증권사 계정이 연결된 사용자만 이용할 수 있어요');
    expect(rec.reportDs.length).toBeGreaterThan(0);
  });

  test('P28-R1b 폰 390 — 2단 카드형 리스트 · 행 아래 펼침 · 레인 오버레이 글자 겹침 0 (E8 overflow backstop)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installLimitupMocks(page);
    await page.goto('/analytics/limitup');
    await assertKpiListAndExpand(page);

    const card = cardOf(page, DUKWOO);
    await expect(card.locator('svg[role="img"]')).toHaveCount(2, { timeout: 15_000 });
    // 한 열 배치 — 레인 열과 사실 문장 열이 위아래로 선다.
    const lanes = await card.locator('[data-slot="limitup-lane-entry"]').boundingBox();
    const factsBox = await card.locator('[data-slot="limitup-facts"]').boundingBox();
    expect(factsBox!.y).toBeGreaterThan(lanes!.y + lanes!.height - 1);

    // 레인마다 오버레이 글자끼리 겹치지 않고 레인 폭 안에 있다.
    const report = await card.locator('[data-slot="limitup-lane"]').evaluateAll((lanesEl) =>
      lanesEl.map((lane) => {
        const box = lane.getBoundingClientRect();
        const rects = [...lane.querySelectorAll('[data-label]')].map((l) => {
          const r = l.getBoundingClientRect();
          return { t: l.textContent, l: r.left, r: r.right, t0: r.top, b: r.bottom };
        });
        const hits: string[] = [];
        for (let i = 0; i < rects.length; i += 1)
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i]!;
            const b = rects[j]!;
            if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t0 < b.b - 0.5 && b.t0 < a.b - 0.5) hits.push(`${a.t} × ${b.t}`);
          }
        const outside = rects.filter((r) => r.l < box.left - 0.5 || r.r > box.right + 0.5).map((r) => r.t);
        return { n: rects.length, hits, outside };
      }),
    );
    expect(report.length).toBe(2);
    for (const r of report) {
      expect(r.n).toBeGreaterThan(0);
      expect(r.hits).toEqual([]);
      expect(r.outside).toEqual([]);
    }
    // 페이지 자체는 가로로 넘치지 않는다(표 래퍼만 가로 스크롤).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: 'test-results/limitup-report-390.png', fullPage: true });
  });

  test('P28-R1c 잠김 구간 요약 칩(스케치 012-A · quick-261006-ide) — 1280 · 390 · 덕우 깨짐 3초 전 · 엑시온 끝 3초 전 192% · 넘침 0', async ({
    page,
  }) => {
    await installLimitupMocks(page, { lockRisk: true });
    for (const vp of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto('/analytics/limitup');
      const dk = cardOf(page, DUKWOO);
      await expect(dk).toBeVisible({ timeout: 30_000 });

      // 덕우(깨짐 · 잠김 1개 → 줄 머리 없음).
      const area = dk.locator('[data-slot="limitup-lock-risk"]');
      await expect(area).toHaveCount(1);
      await expect(area.locator('[data-slot="limitup-lock-risk-row"]')).toHaveCount(1);
      const chip = (kind: string) => area.locator(`[data-slot="limitup-lock-risk-chip"][data-kind="${kind}"]`);
      await expect(chip('sell')).toHaveText(/누적 매도\s*9\.8억/);
      await expect(chip('cancel')).toHaveText(/취소\s*9\.2억/);
      await expect(chip('risk')).toContainText('깨짐 3초 전 25%');
      await expect(chip('risk')).toContainText('+60초 —');
      await expect(dk.locator('[data-slot="limitup-lock-risk-caption"]')).toHaveCount(1);
      await expect(dk.locator('[data-slot="limitup-lock-risk-caption"]')).toHaveText(
        '위험도 = 그 시점까지 누적 매도 ÷ 그 시점 대기 금액 · 100% 를 넘을 수 있다',
      );
      // 칩 줄은 레인 제목 아래 · 차트(레인 또는 로딩 자리) 위.
      const laneLock = dk.locator('[data-slot="limitup-lane-lock"]');
      const head = (await laneLock.locator('h3').boundingBox())!;
      const areaBox = (await area.boundingBox())!;
      await expect(laneLock.locator('[data-slot="limitup-lane"], [data-slot="limitup-lane-slot"]').first()).toBeVisible();
      const plot = (await laneLock.locator('[data-slot="limitup-lane"], [data-slot="limitup-lane-slot"]').first().boundingBox())!;
      expect(areaBox.y, `${vp.width} 칩 줄이 레인 제목 아래`).toBeGreaterThanOrEqual(head.y + head.height - 1);
      expect(areaBox.y + areaBox.height, `${vp.width} 칩 줄이 차트 위`).toBeLessThanOrEqual(plot.y + 1);

      // 넘침 0 — 카드 · 칩마다 오른쪽 끝이 카드 안 · 문서 가로 넘침 없음.
      const fit = await dk.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const chips = [...el.querySelectorAll('[data-slot="limitup-lock-risk-chip"]')].map((c) => {
          const r = c.getBoundingClientRect();
          return { t: c.textContent, right: r.right };
        });
        return { sw: el.scrollWidth, cw: el.clientWidth, right: box.right, out: chips.filter((c) => c.right > box.right + 0.5) };
      });
      expect(fit.sw, `${vp.width} 카드 가로 넘침 0`).toBeLessThanOrEqual(fit.cw);
      expect(fit.out, `${vp.width} 칩 오른쪽 끝이 카드 안`).toEqual([]);
      const docOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(docOverflow, `${vp.width} 문서 가로 넘침 0`).toBeLessThanOrEqual(0);
      await laneLock.screenshot({ path: test.info().outputPath(`ide-limitup-lock-risk-${vp.width}.png`) });

      // 엑시온(유지 · 잠김 1개 — 실 export 픽스처 lock_id 2 하나뿐이라 「잠김 N」 머리 없음).
      await page.getByRole('button', { name: '엑시온그룹 069920 — 사건 카드' }).click();
      const ax = cardOf(page, AXION);
      await expect(ax).toBeVisible();
      const axArea = ax.locator('[data-slot="limitup-lock-risk"]');
      await expect(axArea.locator('[data-slot="limitup-lock-risk-row"]')).toHaveCount(1);
      await expect(axArea).toContainText('끝 3초 전 192%');
      await expect(axArea).not.toContainText('깨짐 3초 전');
      await expect(axArea).not.toContainText('잠김 2');
      await expect(ax.locator('[data-slot="limitup-lock-risk-caption"]')).toHaveCount(1);
      const axFit = await ax.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(axFit, `${vp.width} 엑시온 카드 가로 넘침 0`).toBeLessThanOrEqual(0);
      if (vp.width === 390) {
        await ax.locator('[data-slot="limitup-lane-lock"]').screenshot({
          path: test.info().outputPath('ide-limitup-lock-risk-390-axion.png'),
        });
      }
    }
  });
});
