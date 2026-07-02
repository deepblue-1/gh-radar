import { test, expect } from '@playwright/test';

import { mockHomeApi, HOME_POPULATED, HOME_EMPTY } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';

/**
 * Phase 13 Plan 05 — 홈(`/`) 승격 E2E (HOME-01).
 *
 * VALIDATION:
 *   - `/` 가 홈("오늘의 급등 테마")을 렌더(더 이상 /scanner 로 302 리다이렉트하지 않음).
 *   - 날짜 네비(이전/다음/오늘) + 시점 pill 행 렌더.
 *   - 급등 없는 날 empty-state("오늘은 +20% 급등 종목이 없습니다" + "스캐너로 이동").
 *   - 사이드바 홈 nav item 이 `/` 에서 active(aria-current="page").
 *   - REGRESSION(T-13-12): /scanner 직접 접근 시 스캐너 UI 정상 렌더.
 *
 * 데이터(급등)는 날마다 변동하므로 `/api/home` 을 결정론 mock 으로 고정(themes.spec 동형).
 * populated/empty 두 응답을 명시 주입해 라이브 데이터 부재로 하드 실패하지 않도록 한다.
 * storageState(로그인)는 config chromium project 가 자동 주입 — 단 `/` 는 비로그인도 공개.
 */

test.describe('Phase 13 — 홈 승격 (HOME-01)', () => {
  test('/ — 홈 렌더(타이틀 + 테마/개별 급등 카드) + 홈 nav active', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.goto('/');

    // 타이틀(카피 계약).
    await expect(
      page.getByRole('heading', { name: '오늘의 급등 테마', level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // populated: 주도 테마 섹션 + 테마명 + 개별 급등 섹션 렌더 (empty-tolerant OR 아님 —
    // populated mock 을 명시 주입했으므로 카드가 반드시 나온다).
    await expect(
      page.getByRole('heading', { name: '주도 테마' }),
    ).toBeVisible();
    await expect(page.getByText('AI 반도체').first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '개별 급등' }),
    ).toBeVisible();
    await expect(page.getByText('카카오').first()).toBeVisible();

    // 사이드바 홈 nav — `/` 에서 active(aria-current="page"). 데스크톱 뷰포트(>=lg)에서
    // aside 사이드바가 노출된다(app-shell hidden lg:block).
    const homeNav = page
      .getByRole('link', { name: '홈', exact: true })
      .first();
    await expect(homeNav).toBeVisible();
    await expect(homeNav).toHaveAttribute('aria-current', 'page');
  });

  test('/ — 날짜/시점 네비(이전 날짜·다음 날짜·오늘 + 시점 pill) 렌더', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: '오늘의 급등 테마', level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // 날짜 네비 — 이전/다음 아이콘 버튼 + "오늘" reset.
    await expect(page.getByRole('button', { name: '이전 날짜' })).toBeVisible();
    await expect(page.getByRole('button', { name: '다음 날짜' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '오늘', exact: true }),
    ).toBeVisible();

    // 시점 pill 행 — populated 는 슬롯 2개(14:30 / 15:30 · 마감) 렌더. data-dependent
    // 하지 않도록 마감 슬롯 카피로 존재만 확인(mock 이 15:30 슬롯 보장).
    await expect(page.getByText(/15:30 · 마감/)).toBeVisible();
  });

  test('/ — 급등 없는 날 empty-state("+20% 급등 종목이 없습니다" + 스캐너로 이동 CTA)', async ({
    page,
  }) => {
    // empty 응답 명시 주입 — snapshot=null → HomeEmpty.
    await mockHomeApi(page, { response: HOME_EMPTY });
    await page.goto('/');

    await expect(
      page.getByText('오늘은 +20% 급등 종목이 없습니다'),
    ).toBeVisible({ timeout: 10_000 });

    // "스캐너로 이동" CTA → /scanner Link.
    const cta = page.getByRole('link', { name: '스캐너로 이동' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/scanner');
  });

  test('A(인라인 확장) — "+N개 종목 더" 클릭 시 숨겨진 종목 노출(aria-expanded), "접기" 토글', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: '오늘의 급등 테마', level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // 6종목 → top4 노출, overflow 2 → "+2개 종목 더" 토글(초기 접힘).
    const toggle = page.getByRole('button', { name: '+2개 종목 더' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // 접힌 상태: overflow 종목(가온칩스)은 카드 본문에 없음.
    await expect(page.getByRole('link', { name: /가온칩스/ })).toHaveCount(0);

    // 클릭 → 펼침(aria-expanded=true) + overflow 종목 노출.
    await toggle.click();
    const expanded = page.getByRole('button', { name: '접기' });
    await expect(expanded).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('link', { name: /가온칩스/ })).toBeVisible();

    // 재클릭 → 접힘.
    await expanded.click();
    await expect(
      page.getByRole('button', { name: '+2개 종목 더' }),
    ).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('link', { name: /가온칩스/ })).toHaveCount(0);
  });

  test('B(바텀시트) — 테마명 트리거 클릭 시 dialog 오픈 + 전체 소속 종목 + 근거 뉴스 목록(2건 초과)', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: '오늘의 급등 테마', level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // 테마명 트리거 = aria-haspopup="dialog" 버튼.
    const trigger = page.getByRole('button', { name: /AI 반도체/ });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // 전체 소속 종목(overflow 포함, 접힘 없이) 노출 — 종목 행은 /stocks/{code} href 로 특정.
    // (뉴스 제목 anchor 에도 "SK하이닉스" 가 있어 name 매칭은 strict-mode 충돌 → href 로 구분.)
    await expect(dialog.locator('a[href="/stocks/000660"]')).toBeVisible(); // SK하이닉스
    await expect(dialog.locator('a[href="/stocks/399720"]')).toBeVisible(); // 가온칩스(overflow)
    await expect(dialog.locator('a[href="/stocks/394280"]')).toBeVisible(); // 오픈엣지테크놀로지(overflow)

    // 근거 뉴스 목록(dedup 후 3건 unique — 2건 초과). 중복 URL 기사는 미노출.
    await expect(
      dialog.getByText('HBM 공급 부족 심화… 관련주 강세', { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText('SK하이닉스, HBM4 양산 계획 앞당겨'),
    ).toBeVisible();
    await expect(
      dialog.getByText('반도체 장비주 일제히 급등… 수주 기대감'),
    ).toBeVisible();
    await expect(
      dialog.getByText('HBM 공급 부족 심화… 관련주 강세 (중복)'),
    ).toHaveCount(0);
  });

  test('C(종목 → 상세) — 종목 행이 /stocks/{code} 링크이고 클릭 시 이동한다', async ({
    page,
  }) => {
    await mockHomeApi(page, { response: HOME_POPULATED });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: '오늘의 급등 테마', level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // 종목 상세 링크 존재(a[href^="/stocks/"]).
    const stockLink = page.locator('a[href^="/stocks/"]').first();
    await expect(stockLink).toBeVisible();

    // SK하이닉스(000660) 행 → /stocks/000660.
    const hynixLink = page.getByRole('link', { name: /SK하이닉스/ }).first();
    await expect(hynixLink).toHaveAttribute('href', '/stocks/000660');

    // 클릭 시 상세로 이동.
    await hynixLink.click();
    await expect(page).toHaveURL(/\/stocks\/000660$/);
  });

  test('REGRESSION(T-13-12) — /scanner 직접 접근 시 스캐너 UI 정상 렌더', async ({
    page,
  }) => {
    // 스캐너 페이지 진입 시 백엔드 부재로 인한 폴링 실패 차단(빈 배열 mock).
    await mockStockApi(page);
    await page.goto('/scanner');

    // / 가 더 이상 /scanner 로 302 리다이렉트하지 않음 → /scanner 는 직접 접근으로만 도달.
    // 스캐너 UI(⌘K 검색 트리거 = AppShell nav)가 렌더되면 회귀 없음으로 판정.
    await expect(page).toHaveURL(/\/scanner$/);
    await expect(
      page.getByLabel('종목 검색 열기').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
