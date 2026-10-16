import { test, expect, type Page, type Route } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import {
  CHEONIL,
  DONGYANG,
  HANSUN,
  TEAMFLOW_DATES,
  TEAMFLOW_LATEST,
  WORST_ISIN,
  WORST_NAME,
  teamflowE2EFixture,
} from '../fixtures/teamflow-report';
import { withLocalRelay, type LocalRelay } from '../fixtures/relay';

/**
 * Phase 33 Plan 04 Task 2 — 팀 매집 목록 E2E (TEAM-02 · TEAM-03 · UI-SPEC T1 · T2 · T3 · 폭 백스톱).
 *
 * ① 무엇을 증명하는가
 *   진짜 브라우저에서 사이드바 「분석 › 팀 매집」 → `/analytics/teamflow` → KPI 4칸 · 최소치 캡션 → 34행(team_net_val 큰 순 ·
 *   기본 전부 접힘) → 한 번에 하나 펼침(그 행 바로 다음 형제 · 위쪽 상세가 접혀도 연 행이 앱 머리 아래) · 1280 xl 7열 /
 *   390 카드형 · 날짜 알약(‹ › · `?d` 정본화 · 행 없는 날 빈 상태) · 403 게이트가 이어진다. 단위(RTL)는 jsdom 이라
 *   그리드 배치 · 폭 · 줄바꿈 · 스크롤 보정을 못 본다 — 그래서 UI-SPEC 백스톱 T1 · T2 · T3 을 여기서 실측한다.
 *
 * ② 규약(fixtures/relay.ts ⑥ · limitup-report.spec 과 같다): 파일 내부 직렬 · beforeAll 1회 relay(DMA 매핑 사용자 —
 *   게이트 통과 · 사이드바 「분석」 노출) · afterAll stop · beforeEach reset. 보고서 본문은 `page.route` 목이다(server ·
 *   RPC 는 이 e2e 밖 — 실제 권한은 server 403 이 막고, 여기서는 403 응답이 DmaGate 로 바뀌는지만 본다).
 *
 * ③ 픽스처 = 워커 실 export 20261014 34행(fixtures/teamflow-report.ts). 20261013 · `WORST_ROW` 는 합성이다(그 파일 머리 주석).
 */

test.describe.configure({ mode: 'serial' });

interface Recorder {
  /** 보고서 요청의 `d`(없으면 null). */
  ds: (string | null)[];
  mode403: boolean;
}

async function installTeamflowMocks(page: Page, opts: { worst?: boolean } = {}): Promise<Recorder> {
  const rec: Recorder = { ds: [], mode403: false };
  await page.route('**/api/teamflow/report*', async (route: Route) => {
    const d = new URL(route.request().url()).searchParams.get('d');
    rec.ds.push(d);
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
        ? teamflowE2EFixture({ worst: opts.worst })
        : TEAMFLOW_DATES.includes(d)
          ? teamflowE2EFixture({ date: d, worst: opts.worst })
          : { access: true, dates: TEAMFLOW_DATES, date: d, rows: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return rec;
}

const BASE = '/analytics/teamflow';
const kpi = (page: Page, label: string) => page.locator(`[data-kpi="${label}"] dd`);
const rows = (page: Page) => page.locator('[data-slot="teamflow-list"] button[data-isin]');
const detailOf = (page: Page, isin: string) => page.locator(`#tf-${isin}`);
const pill = (page: Page) => page.locator('[data-slot="limitup-date"]');
const rowOf = (page: Page, isin: string) => page.locator(`[data-slot="teamflow-list"] button[data-isin="${isin}"]`);

/** 가로 넘침 — 문서 스크롤 · 앱 셸 `main`(overflow-auto — 넘치면 여기서 가로 스크롤이 생긴다) 둘 다 본다. */
async function horizontalOverflow(page: Page): Promise<{ doc: number; main: number }> {
  return page.evaluate(() => {
    const se = document.scrollingElement ?? document.documentElement;
    const main = document.querySelector('main');
    return {
      doc: se.scrollWidth - window.innerWidth,
      main: main === null ? 0 : main.scrollWidth - main.clientWidth,
    };
  });
}

async function expectNoHorizontalScroll(page: Page, tag: string): Promise<void> {
  const o = await horizontalOverflow(page);
  expect(o.doc, `${tag} 문서 가로 넘침 0`).toBeLessThanOrEqual(0);
  expect(o.main, `${tag} main 가로 넘침 0`).toBeLessThanOrEqual(0);
}

test.describe('Phase 33 Plan 04 — 팀 매집 목록 (로컬 relay)', () => {
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

  test('P33-TF1 1280 — 사이드바 → 목록 → KPI → 기본 접힘 → 한 번에 하나', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const rec = await installTeamflowMocks(page);

    // 사이드바 「분석 › 팀 매집」 → /analytics/teamflow · 하위 「팀 매집」 만 켜진다.
    await page.goto('/');
    const nav = page.locator('aside nav[aria-label="주 메뉴"]');
    const link = nav.getByRole('link', { name: '팀 매집', exact: true });
    await expect(link).toBeVisible({ timeout: 30_000 });
    await link.click();
    await expect(page).toHaveURL((u) => u.pathname === BASE && u.search === '');
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: '상한가 보고서', exact: true })).not.toHaveAttribute('aria-current');

    // KPI 4칸 → 최소치 캡션.
    await expect(kpi(page, '탐지 종목')).toHaveText('34', { timeout: 30_000 });
    await expect(kpi(page, '팀 순매수 종목')).toHaveText('9');
    await expect(kpi(page, '상한가 도달')).toHaveText('9');
    await expect(kpi(page, '팀 순매수 합')).toHaveText('−26.3억');
    await expect(page.locator('[data-kpi]')).toHaveCount(4);
    await expect(
      page.getByText('탐지 = 20%↑ 또는 상한가 체결 종목 · 팀 수치는 들어와서 친 체결만 센 최소치예요', { exact: true }),
    ).toBeVisible();
    expect(rec.ds).toContain(null);

    // 34행 · 첫 행 한선엔지니어링 · 전부 접힘 · xl 열 머리 보임.
    await expect(rows(page)).toHaveCount(34);
    await expect(rows(page).first()).toHaveAttribute('data-isin', HANSUN);
    expect(await rows(page).evaluateAll((els) => els.every((e) => e.getAttribute('aria-expanded') === 'false'))).toBe(
      true,
    );
    await expect(page.locator('[data-slot="teamflow-detail"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="teamflow-list-head"]')).toBeVisible();

    // 천일고속 → 그 행 바로 다음 형제로 상세.
    const cheonil = page.getByRole('button', { name: '천일고속 000650 — 팀 매집 상세' });
    const dongyang = page.getByRole('button', { name: '동양고속 084670 — 팀 매집 상세' });
    await cheonil.click();
    await expect(detailOf(page, CHEONIL)).toBeVisible();
    await expect(cheonil).toHaveAttribute('aria-expanded', 'true');
    await expect(cheonil).toHaveAttribute('aria-controls', `tf-${CHEONIL}`);
    expect(await cheonil.evaluate((b, id) => b.nextElementSibling?.id === id, `tf-${CHEONIL}`)).toBe(true);

    // 동양고속 → 천일고속 상세 사라짐(한 번에 하나) · 연 행은 앱 머리 아래(점프 보정).
    await dongyang.click();
    await expect(detailOf(page, DONGYANG)).toBeVisible();
    await expect(detailOf(page, CHEONIL)).toHaveCount(0);
    await expect(page.locator('[data-slot="teamflow-detail"]')).toHaveCount(1);
    expect(await dongyang.evaluate((b, id) => b.nextElementSibling?.id === id, `tf-${DONGYANG}`)).toBe(true);
    await expect.poll(async () => (await dongyang.boundingBox())?.y ?? -1, { timeout: 5_000 }).toBeGreaterThan(40);

    // 같은 행 다시 → 전부 접힘.
    await dongyang.click();
    await expect(page.locator('[data-slot="teamflow-detail"]')).toHaveCount(0);
    await expect(dongyang).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: test.info().outputPath('teamflow-list-1280.png'), fullPage: true });
  });

  test('P33-TF2 390 — 카드형(열 머리 숨김 · 메타 줄 · 셰브론 · 미니막대 전폭)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTeamflowMocks(page);
    await page.goto(BASE);
    await expect(rows(page)).toHaveCount(34, { timeout: 30_000 });

    await expect(page.locator('[data-slot="teamflow-list-head"]')).toBeHidden();
    const first = rows(page).first();
    for (const label of ['팀 순매수', '20% 아래', '매수 중 팀']) {
      await expect(first.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(first.locator('[data-slot="teamflow-row-chevron"]')).toBeVisible();

    // 미니막대 = 행 폭의 90% 이상(2줄 전폭).
    const ratio = await first.evaluate((btn) => {
      const strip = btn.querySelector('[data-slot="teamflow-strip"]')!.getBoundingClientRect();
      return strip.width / btn.getBoundingClientRect().width;
    });
    expect(ratio).toBeGreaterThanOrEqual(0.9);

    await expectNoHorizontalScroll(page, '390');
    await page.screenshot({ path: test.info().outputPath('teamflow-list-390.png'), fullPage: true });
  });

  test('P33-TF3 날짜 알약 · ?d 정본화 · 행 없는 날', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const rec = await installTeamflowMocks(page);
    await page.goto(BASE);

    // 최신 = 10/14 · › disabled · ‹ → 20261013.
    await expect(pill(page)).toHaveText('10/14 (수)', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: '다음 보고서' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '이전 보고서' })).toBeEnabled();
    await page.getByRole('button', { name: '이전 보고서' }).click();
    await expect(page).toHaveURL((u) => u.pathname === BASE && u.searchParams.get('d') === '20261013');
    await expect(pill(page)).toHaveText('10/13 (화)');
    await expect.poll(() => rec.ds.includes('20261013')).toBe(true);
    await expect(page.getByRole('button', { name: '다음 보고서' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '이전 보고서' })).toBeDisabled();

    // 형식 오류 → 쿼리 없는 최신으로 replace.
    await page.goto(`${BASE}?d=2026`);
    await expect(page).toHaveURL((u) => u.pathname === BASE && u.search === '');
    await expect(pill(page)).toHaveText('10/14 (수)', { timeout: 30_000 });

    // 행 없는 날 → 빈 상태 + 「최신 보고서 보기」 → ?d=20261014.
    await page.goto(`${BASE}?d=20261010`);
    const empty = page.locator('[data-slot="teamflow-empty"]');
    await expect(empty.getByText('이 날은 팀 매집 데이터가 없어요', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(empty).toContainText('최신 보고서는 10/14예요');
    await expect(page.locator('[data-kpi]')).toHaveCount(0);
    await expect(page.locator('[data-slot="teamflow-list"]')).toHaveCount(0);
    await empty.getByRole('button', { name: '최신 보고서 보기' }).click();
    await expect(page).toHaveURL((u) => u.searchParams.get('d') === TEAMFLOW_LATEST);
    await expect(kpi(page, '탐지 종목')).toHaveText('34', { timeout: 30_000 });
  });

  test('P33-TF4 403 게이트 — 서버 DMA_UNMAPPED → DmaGate 「팀 매집은」', async ({ page }) => {
    const rec = await installTeamflowMocks(page);
    rec.mode403 = true;
    await page.goto(BASE);
    const gate = page.locator('[data-slot="dma-gate"]');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toContainText('팀 매집은 증권사 계정이 연결된 사용자만 이용할 수 있어요');
    await expect(page.locator('[data-slot="teamflow-list"]')).toHaveCount(0);
    await expect(page.locator('[data-kpi]')).toHaveCount(0);
    expect(rec.ds.length).toBeGreaterThan(0);
  });

  test('P33-TF-B1 머리 설명 · 알약 폭 — 390 · 1280 (백스톱 T1)', async ({ page }) => {
    await installTeamflowMocks(page);
    for (const vp of [
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto(BASE);
      await expect(kpi(page, '탐지 종목')).toHaveText('34', { timeout: 30_000 });

      const desc = page.locator('[data-slot="page-header"] p');
      await expect(desc).toContainText('팀 = 교보 · 한국 · 유진 · 신한 · NH');
      const d = await desc.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { sw: el.scrollWidth, cw: el.clientWidth, wordBreak: cs.wordBreak, overflow: cs.textOverflow, ws: cs.whiteSpace };
      });
      expect(d.sw, `${vp.width} 머리 설명 잘림 0`).toBeLessThanOrEqual(d.cw);
      expect(d.overflow, `${vp.width} 머리 설명 말줄임 없음`).not.toBe('ellipsis');
      expect(d.ws, `${vp.width} 머리 설명 줄바꿈 허용`).not.toBe('nowrap');
      expect(d.wordBreak, `${vp.width} 머리 설명 break-keep`).toBe('keep-all');

      const p = await pill(page).evaluate((el) => {
        const nav = el.closest('[data-slot="limitup-date-nav"]')!.getBoundingClientRect();
        return { sw: el.scrollWidth, cw: el.clientWidth, left: nav.left, right: nav.right, vw: window.innerWidth };
      });
      expect(p.sw, `${vp.width} 알약 글자 잘림 0`).toBeLessThanOrEqual(p.cw);
      expect(p.left, `${vp.width} 알약 왼쪽 끝이 뷰포트 안`).toBeGreaterThanOrEqual(0);
      expect(p.right, `${vp.width} 알약 오른쪽 끝이 뷰포트 안`).toBeLessThanOrEqual(p.vw);

      await expectNoHorizontalScroll(page, String(vp.width));
      await page.locator('[data-slot="page-header"]').screenshot({
        path: test.info().outputPath(`teamflow-header-${vp.width}.png`),
      });
    }
  });

  test('P33-TF-B2 KPI 최악값 — 폰 2열 「팀 순매수 합」 −1,234.5억 잘림 0 (백스톱 T2)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTeamflowMocks(page, { worst: true });
    await page.goto(BASE);
    const sum = kpi(page, '팀 순매수 합');
    await expect(sum).toHaveText('−1,234.5억', { timeout: 30_000 });
    const fit = await sum.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(fit.sw).toBeLessThanOrEqual(fit.cw);
    await expectNoHorizontalScroll(page, '390 worst');
    await page.locator('[data-slot="teamflow-kpis"]').screenshot({ path: test.info().outputPath('teamflow-kpi-worst-390.png') });
  });

  test('P33-TF-B3 행 최악값 — 15자 종목명 + 「상한가 15:19」 + 셰브론 한 줄 · 20%~상한 칸 (백스톱 T3)', async ({ page }) => {
    await installTeamflowMocks(page, { worst: true });
    for (const vp of [
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto(BASE);
      const row = rowOf(page, WORST_ISIN);
      await expect(row).toBeVisible({ timeout: 30_000 });

      const name = row.locator(`span[title="${WORST_NAME}"]`);
      await expect(name).toHaveText(WORST_NAME);
      const tag = row.locator('[data-slot="teamflow-tag"]');
      await expect(tag).toHaveText('상한가 15:19');
      const chevron = row.locator('[data-slot="teamflow-row-chevron"]');
      await expect(chevron).toBeVisible();

      const m = await row.evaluate((btn, nameText) => {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height };
        };
        const nameEl = [...btn.querySelectorAll('span[title]')].find((e) => e.getAttribute('title') === nameText)!;
        const tagEl = btn.querySelector('[data-slot="teamflow-tag"]')!;
        const chevEl = btn.querySelector('[data-slot="teamflow-row-chevron"]')!;
        const lh = Number.parseFloat(getComputedStyle(nameEl).lineHeight) || 20;
        return {
          name: box(nameEl),
          nameLh: lh,
          nameClipped: nameEl.scrollWidth > nameEl.clientWidth,
          nameEllipsis: getComputedStyle(nameEl).textOverflow,
          tag: box(tagEl),
          tagFit: tagEl.scrollWidth <= tagEl.clientWidth,
          chev: box(chevEl),
          strip: box(btn.querySelector('[data-slot="teamflow-strip"]')!),
          btn: box(btn),
        };
      }, WORST_NAME);
      const tagLine = `${vp.width}`;
      // 이름은 한 줄(줄바꿈 없음) — 넘치면 말줄임 + title(전문).
      expect(m.name.h, `${tagLine} 이름 한 줄`).toBeLessThan(m.nameLh * 1.5);
      if (m.nameClipped) expect(m.nameEllipsis, `${tagLine} 이름 말줄임`).toBe('ellipsis');
      // 태그는 잘리지 않는다(이름만 말줄임).
      expect(m.tagFit, `${tagLine} 태그 잘림 0`).toBe(true);
      /*
        한 줄 — 종목 칸은 이름 + 「코드 · 시장」 두 줄 묶음이고 행 그리드가 items-center 라 태그 · 셰브론은 그 묶음의 가운데에
        선다(이름 top 과는 ≈ 10px 차). 그래서 「top 8px 안」 대신: 태그 · 셰브론 top 은 서로 8px 안 · 둘 다 이름 줄과 세로로
        겹친다 · (카드형 390) 셋 다 미니막대(다음 줄) 위. xl 은 미니막대가 같은 줄 6열이라 마지막 항목을 보지 않는다.
      */
      const overlap = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) =>
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      expect(Math.abs(m.tag.top - m.chev.top), `${tagLine} 태그 · 셰브론 같은 줄`).toBeLessThanOrEqual(8);
      expect(overlap(m.name, m.tag), `${tagLine} 이름 줄 ↔ 태그 세로 겹침`).toBeGreaterThan(0);
      expect(overlap(m.name, m.chev), `${tagLine} 이름 줄 ↔ 셰브론 세로 겹침`).toBeGreaterThan(0);
      if (vp.width < 1280) {
        for (const [k, b] of [['이름', m.name], ['태그', m.tag], ['셰브론', m.chev]] as const) {
          expect(b.bottom, `${tagLine} ${k} 은 미니막대 줄 위`).toBeLessThanOrEqual(m.strip.top + 0.5);
        }
      }
      // 순서 · 겹침 0 · 셰브론은 행 안.
      expect(m.name.right, `${tagLine} 이름 → 태그 겹침 0`).toBeLessThanOrEqual(m.tag.left + 0.5);
      expect(m.chev.right, `${tagLine} 셰브론 행 안`).toBeLessThanOrEqual(m.btn.right + 0.5);
      expect(m.chev.left, `${tagLine} 태그 → 셰브론 겹침 0`).toBeGreaterThanOrEqual(m.tag.right - 0.5);

      if (vp.width === 1280) {
        const above = row.locator('[data-slot="teamflow-above20"]');
        await expect(above).toBeVisible();
        await expect(above).toHaveText('−1,234.5억');
        const a = await above.evaluate((el) => ({
          sw: el.scrollWidth,
          cw: el.clientWidth,
          title: el.getAttribute('title'),
          text: el.textContent,
        }));
        expect(a.sw <= a.cw || a.title === a.text, '1280 20%~상한 칸 잘림 0 또는 truncate + title').toBe(true);
        await expect(row.getByText('20%~상한', { exact: true })).toBeVisible();
      }
      await expectNoHorizontalScroll(page, `${vp.width} worst`);
      await row.screenshot({ path: test.info().outputPath(`teamflow-row-worst-${vp.width}.png`) });
    }
  });
});
