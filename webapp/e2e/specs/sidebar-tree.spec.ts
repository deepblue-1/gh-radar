import { test, expect, type Locator, type Page } from '@playwright/test';

import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';
import { withLocalRelay, type LocalRelay } from '../fixtures/relay';

/**
 * Phase 16 Plan 11 Task 3 — 사이드바 트리 E2E (NAV-01 · D-15~D-19 · UI-SPEC N1~N7).
 *
 * ① 무엇을 증명하는가
 *   RTL 은 `useRelayContext` 를 스텁으로 갈아끼우고 트리 **구조**만 본다. 여기서 보는 것은
 *   그 앞단이다 — **진짜 브라우저가 진짜 relay 에 붙어 상태 프레임을 받고** 나서야 트레이딩
 *   그룹이 뜨는지, 매핑을 끄면 정말 DOM 에서 사라지는지, 3단 링크의 인코딩된 키로 라우팅이
 *   실제로 되는지다. 조건부 숨김은 값 하나가 아니라 **연결 왕복의 결과**라서 단위로 쪼개면
 *   각 조각이 통과하면서 이어 붙였을 때 안 되는 대표 구간이다.
 *
 * ② 왜 serial + 단일 relay 인가
 *   relay wss 는 8090 **고정**이다(픽스처 상단 ④). `beforeAll` 한 번만 띄우고 파일 내부를
 *   직렬로 고정한다. 파일 **간** 충돌은 `playwright.config.ts` 의 단일 워커가 막는다.
 *
 * ③ 미렌더 vs 숨김
 *   케이스 2·3 은 `toHaveCount(0)` 으로 **DOM 에 없음**을 단언한다. `toBeHidden` 이면
 *   `display:none` 인 채로 마크업이 남아도 통과해 버리는데, D-19 가 요구한 것은 「렌더하지
 *   않는다」다(숨긴 마크업은 devtools 로 그대로 읽힌다).
 *   ⚠️ 그래도 이것은 **권한 장치가 아니다** — 실제 차단은 relay `unauthorized` 와 라우트
 *   게이트다(T-16-04). 여기서 세는 것은 오진입 표면의 크기다.
 *
 * ④ 데스크톱 aside 와 모바일 drawer 는 **다른 노드**다
 *   `AppShell` 은 사이드바를 `aside`(lg 이상) 와 `Sheet`(열렸을 때만) 두 곳에 렌더한다.
 *   조회할 때 트리를 좁히지 않으면 drawer 가 열린 순간 `nav[aria-label="주 메뉴"]` 가
 *   2벌이 되어 strict mode 위반으로 터진다.
 */

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// 픽스처 — 전략 3건
// ---------------------------------------------------------------------------

/**
 * 상따 전략 3건. **긴 종목명이 붙을 수 있는 ISIN** 을 쓰고 매수/매도 무장 조합을 셋 다
 * 다르게 둔다 — 원 아이콘이 항목마다 같은 그림이면 라벨이 잘못 붙어도 눈치채지 못한다.
 */
const CHASERS = [
  { isin: 'KR7086520004', accountNo: '1234567801', exchange: 'KRX', buyEnabled: true, sellEnabled: false },
  { isin: 'KR7005930003', accountNo: '1234567801', exchange: 'NXT', buyEnabled: false, sellEnabled: true },
  { isin: 'KR7007660006', accountNo: '1234567801', exchange: 'KRX', buyEnabled: true, sellEnabled: true },
] as const;

/** relay 가 파생시키는 전략 키 — `LimitChaser::MakeKey` 와 같은 조립이다. */
const keyOf = (c: (typeof CHASERS)[number]) =>
  `${c.isin}:${c.accountNo}:${c.exchange}`;

/** 1단·2단 항목 8개(3단 전략 목록 제외). 순서까지 계약이다. */
const TREE_LABELS = [
  '홈',
  '상승률 상위',
  '테마',
  '관심종목',
  '상따',
  'VI',
  'My page',
  'AI 애널리스트',
];

// ---------------------------------------------------------------------------
// 조회구 — 트리를 반드시 좁힌다 (위 ④)
// ---------------------------------------------------------------------------

const desktopNav = (page: Page): Locator =>
  page.locator('aside nav[aria-label="주 메뉴"]');

const drawerNav = (page: Page): Locator =>
  page.locator('[data-slot="sheet-content"] nav[aria-label="주 메뉴"]');

/** 3단 전략 항목. `data-strategy-key` 는 사이드바가 붙이는 표식이다. */
const strategyItems = (nav: Locator): Locator => nav.locator('[data-strategy-key]');

/**
 * 트레이딩 그룹이 뜰 때까지 기다린다 = **relay 가 `ready` 를 줬다**는 뜻이다.
 * 사이드바에는 상태 배지가 없으므로 이 등장 자체가 동기화 지점이다.
 */
async function waitForTradingGroup(nav: Locator): Promise<void> {
  await expect(nav.getByText('트레이딩', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

// ===========================================================================

test.describe('Phase 16 Plan 11 — 사이드바 트리 (로컬 relay)', () => {
  let relay: LocalRelay;

  test.beforeAll(async () => {
    relay = await withLocalRelay();
  });

  test.afterAll(async () => {
    // 남기면 Playwright 가 종료하지 못하고 매달린다 (T-15-46).
    await relay.stop();
  });

  test.beforeEach(async ({ page }) => {
    relay.reset();
    // 전략 시드는 **연결 전에** 심어야 한다 — relay 는 로그인 직후 24 를 물어본다.
    relay.seedLimitChasers([...CHASERS]);
    await mockStockApi(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
  });

  test('1. 매핑 있음 — 트리 8항목 + 3단 전략 3건, 항목 클릭 시 인코딩된 키로 이동', async ({
    page,
  }) => {
    await page.goto('/trading/vi');
    const nav = desktopNav(page);
    await waitForTradingGroup(nav);

    // 1·2단 8항목이 **순서까지** 계약대로다.
    for (const label of TREE_LABELS) {
      await expect(
        nav.getByRole('link', { name: label, exact: false }).first(),
      ).toBeVisible();
    }
    // 그룹 소제목 2개는 링크가 아니다 — 링크 총수가 8 + 전략 3 이어야 한다.
    await expect(nav.getByRole('link')).toHaveCount(TREE_LABELS.length + CHASERS.length);

    // 3단 전략 3건.
    await expect(strategyItems(nav)).toHaveCount(3);

    // 원 아이콘 묶음의 라벨이 항목마다 무장 조합을 따라간다.
    await expect(
      strategyItems(nav).nth(0).getByRole('img'),
    ).toHaveAttribute('aria-label', '매수 켜짐 · 매도 꺼짐');
    await expect(
      strategyItems(nav).nth(1).getByRole('img'),
    ).toHaveAttribute('aria-label', '매수 꺼짐 · 매도 켜짐');
    await expect(
      strategyItems(nav).nth(2).getByRole('img'),
    ).toHaveAttribute('aria-label', '매수 켜짐 · 매도 켜짐');

    // 클릭 → 인코딩된 키 경로. `:` 가 `%3A` 로 나가야 세그먼트가 깨지지 않는다.
    const expected = `/trading/limit-chaser/${encodeURIComponent(keyOf(CHASERS[1]))}`;
    await strategyItems(nav).nth(1).click();
    await expect(page).toHaveURL(new RegExp(`${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    // 편집 화면이 실제로 그 키를 풀어서 보여준다(디코드 왕복).
    await expect(page.getByText(keyOf(CHASERS[1]))).toBeVisible({ timeout: 15_000 });
  });

  test('2. 매핑 없음 — 트레이딩 그룹·My page 가 DOM 에 없다 (미렌더)', async ({ page }) => {
    relay.clearDmaCredentials();

    await page.goto('/trading/vi');
    const nav = desktopNav(page);

    // 게이트 등장 = relay 가 `unauthorized` 를 확정했다는 동기화 지점이다.
    await expect(page.locator('[data-slot="dma-gate"]')).toBeVisible({ timeout: 30_000 });

    await expect(nav.getByText('트레이딩', { exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'My page' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: '상따' })).toHaveCount(0);
    await expect(strategyItems(nav)).toHaveCount(0);

    // 공개 항목은 그대로다.
    await expect(nav.getByRole('link', { name: '홈' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '상승률 상위' })).toBeVisible();
  });

  test('2b. 매핑 없음 — 3라우트 직접 진입이 전부 게이트로 막힌다 (T-16-04)', async ({
    page,
  }) => {
    relay.clearDmaCredentials();

    /*
      사이드바 숨김은 **권한이 아니다.** 메뉴에서 사라져도 주소창으로는 들어올 수 있으므로
      라우트마다 게이트가 서는지 직접 확인한다. 이 검증이 `auth-guards.spec.ts` 가 아니라
      여기 있는 이유는, 「매핑 없음」이 relay wss 왕복의 결과라 로컬 relay 가 필요하고
      그 파일은 쿠키 없는 context 를 파일 전체에 강제하기 때문이다.
    */
    for (const path of ['/trading/limit-chaser/new', '/trading/vi', '/me']) {
      await page.goto(path);
      const gate = page.locator('[data-slot="dma-gate"]');
      await expect(gate).toBeVisible({ timeout: 30_000 });
      await expect(gate).toContainText('DMA 계정이 연결되지 않았어요');
      await expect(gate).toContainText(
        '연결이 필요하면 관리자에게 문의해 주세요.',
      );
      await expect(gate).toContainText('차트·뉴스·종목토론방은 그대로 이용할 수 있어요.');
      // 매핑 없음에는 행동 버튼이 없다 — 사용자가 스스로 풀 수 있는 상태가 아니다.
      await expect(gate.getByRole('button')).toHaveCount(0);
      await expect(gate.getByRole('link')).toHaveCount(0);
      // 게이트가 **본문 전체를 대체**한다(A14) — 자리표시 본문이 같이 보이지 않는다.
      await expect(page.locator('[data-slot="surface-placeholder"]')).toHaveCount(0);
    }
  });

  test('3. 비로그인 — 사이드바가 있는 경로에 도달하지 못한다 (홈도 로그인 벽 뒤다)', async ({
    browser,
  }) => {
    /*
      quick 260911-tuk 으로 홈(`/`)이 로그인 필수 표면이 되면서 **사이드바를 그리는 공개
      경로가 하나도 남지 않았다.** 예전 이 케이스는 `/` 에서 트리를 열어 「비로그인이면
      트레이딩·My page 가 미렌더」를 봤지만, 지금 그 화면은 도달 자체가 불가능하다 —
      도달하지 않는 상태를 단언하면 그것이 곧 가짜 테스트다(me.spec.ts 의 같은 판단).

      그래서 여기서는 **실제 계약**인 리다이렉트와 「사이드바 없음」을 본다. 트리 자체의
      비로그인 미렌더 계약은 컴포넌트 단위 테스트가 잠근다
      (`src/components/layout/__tests__/app-sidebar.test.tsx` ③-a).
    */
    // 프로젝트 storageState 는 로그인 상태다. 파일/describe 레벨 `test.use` 는 워커 재사용
    // 환경에서 경합이 관찰됐으므로(auth-guards.spec.ts 주석) **빈 context 를 직접 만든다**.
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto('/');
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
    await expect(desktopNav(page)).toHaveCount(0);

    await context.close();
  });

  test('4. 모바일 390 — drawer 가 같은 트리를 쓰고, 3단 링크는 닫고 소제목은 닫지 않는다', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/trading/vi');

    // 데스크톱 aside 는 `hidden` 이라 이 폭에서는 보이지 않는다.
    await expect(desktopNav(page)).toBeHidden();

    const openDrawer = async () => {
      await page.getByRole('button', { name: '사이드바 열기' }).click();
      await expect(drawerNav(page)).toBeVisible();
    };

    await openDrawer();
    const nav = drawerNav(page);
    await waitForTradingGroup(nav);

    // 같은 트리다 — 1·2단 8항목 + 전략 3건.
    await expect(nav.getByRole('link')).toHaveCount(TREE_LABELS.length + CHASERS.length);
    await expect(strategyItems(nav)).toHaveCount(3);

    /*
      그룹 소제목 클릭으로는 닫히지 않는다(링크가 아니므로 자동 닫힘 순회에 걸리지 않는다).

      ★ `toBeVisible()` 로 단언하지 않는다 — Radix 는 닫힐 때 **exit 애니메이션 동안**
        노드를 남기므로, 닫혔는데도 잠깐 「보이는」 상태가 되어 단언이 헛통과한다
        (소제목을 버튼으로 바꾼 변이 실험에서 실제로 이 지점이 통과하고 **다음 줄이
        30초 타임아웃**으로 터졌다). `data-state` 는 클릭 즉시 `closed` 로 바뀌므로
        애니메이션과 무관하게 정확하다.
    */
    const sheet = page.locator('[data-slot="sheet-content"]');
    await nav.getByText('트레이딩', { exact: true }).click();
    await expect(sheet).toHaveAttribute('data-state', 'open');
    await nav.getByText('종목검색', { exact: true }).click();
    await expect(sheet).toHaveAttribute('data-state', 'open');

    // 3단 링크 클릭 → drawer 가 닫히고 이동한다.
    await strategyItems(nav).nth(0).click();
    await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
    await expect(page).toHaveURL(
      new RegExp(encodeURIComponent(keyOf(CHASERS[0])).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  });

  test('5. `/scanner` 링크 라벨은 「상승률 상위」이고 URL 은 그대로다 (D-15)', async ({
    page,
  }) => {
    await page.goto('/trading/vi');
    const nav = desktopNav(page);
    const link = nav.getByRole('link', { name: '상승률 상위' });

    await expect(link).toBeVisible({ timeout: 15_000 });
    await expect(link).toHaveAttribute('href', '/scanner');

    await link.click();
    await expect(page).toHaveURL(/\/scanner$/);
    // 이동한 화면의 제목도 같은 라벨을 쓴다(표면 간 문구 통일).
    await expect(
      page.getByRole('heading', { name: '상승률 상위', level: 1 }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
