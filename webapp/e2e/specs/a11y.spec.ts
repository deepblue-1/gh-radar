import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockStockApi } from '../fixtures/mock-api';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';
import {
  E2E_ACCOUNT_NO,
  E2E_ISIN,
  E2E_LONG_NAME_ISIN,
  withLocalRelay,
  type LocalRelay,
} from '../fixtures/relay';
import { kstDateIso, type StrategyEventRow } from '@gh-radar/shared';
import { FIXTURE_TRADE_DATE, STRATEGY_DAY_ROWS } from '@/test-fixtures/strategy-day';
import { ROW_12451, TIMELINE_BY_ANCHOR } from '@/test-fixtures/order-timeline';

/**
 * Phase 06 Plan 06 — axe 접근성 자동 검증 (SRCH-01/02/03).
 * 6-06-03: 상세 페이지 / ⌘K Dialog 열린 상태 / 404 페이지 각각 critical·serious 위반 0.
 *
 * WCAG 2.1 A + AA 태그만 검사 (wcag2a, wcag2aa). best-practice 는 제외.
 *
 * 알려진 디자인 시스템 레벨 이슈 (Phase 3 범위 밖, 후속 개선 deferred):
 *  - `color-contrast`: primary Button `--primary` 토큰 (#49a9ff) vs 흰색 텍스트 = 2.23:1 (<4.5)
 *  - `aria-required-children`: cmdk CommandList 빈 상태 `role=listbox` 에 option 자식 없음
 *
 * 위 두 규칙은 회귀 방지를 유지하되, 디자인 토큰/라이브러리 레벨이므로 별도 티켓으로 분리.
 * 신규 위반은 반드시 잡도록 rule 필터로 제외만 하고 나머지는 엄격 검사한다.
 */

/*
  ★ 파일 내부 직렬 — Phase 16 이 이 파일에 relay 기반 표면을 들여왔기 때문이다.
    relay wss 는 **고정 8090** 이라(fixtures/relay.ts ④) 같은 파일 안에서 병렬로 돌면
    즉시 EADDRINUSE 다. 파일 **간** 충돌은 `playwright.config.ts` 의 단일 워커가 막는다 —
    두 장치가 같이 있어야 성립한다(fixtures/relay.ts ⑥).
*/
test.describe.configure({ mode: 'serial' });

const DEFERRED_RULES = new Set([
  // Phase 3 디자인 토큰 후속 개선 (primary Button 대비비)
  'color-contrast',
  // cmdk CommandList 빈 상태 — 라이브러리 레벨 (cmdk 1.1.x)
  'aria-required-children',
]);

function blockingViolations(
  results: Awaited<ReturnType<AxeBuilder['analyze']>>,
) {
  return results.violations.filter(
    (v) =>
      (v.impact === 'critical' || v.impact === 'serious') &&
      !DEFERRED_RULES.has(v.id),
  );
}

test.describe('Phase 6 — 접근성 (axe)', () => {
  test('/stocks/005930 — critical/serious 위반 0', async ({ page }) => {
    await mockStockApi(page);
    await page.goto('/stocks/005930');
    await page.getByRole('heading', { name: '삼성전자' }).waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = blockingViolations(results);
    expect(
      blocking,
      `critical/serious 위반 ${blocking.length}건\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);
  });

  test('⌘K Dialog 열린 상태 — critical/serious 위반 0', async ({ page }) => {
    await mockStockApi(page);
    await page.goto('/scanner');
    await page.getByLabel('종목 검색 열기').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = blockingViolations(results);
    expect(
      blocking,
      `critical/serious 위반 ${blocking.length}건\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);
  });

  test('/stocks/INVALID (not-found) — critical/serious 위반 0', async ({
    page,
  }) => {
    await mockStockApi(page, { detailStatusByCode: { INVALID: 404 } });
    await page.goto('/stocks/INVALID');
    await page
      .getByRole('heading', { name: '종목을 찾을 수 없습니다' })
      .waitFor({ timeout: 10_000 });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = blockingViolations(results);
    expect(
      blocking,
      `critical/serious 위반 ${blocking.length}건\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);
  });

  /**
   * Phase 06.2 Plan 08 Task 3.3 — UserSection 팝오버 a11y (D6).
   * VALIDATION.md D6: ESC 로 닫힘 + 바깥 클릭 닫힘 + axe 위반 0.
   */
  test('UserSection 팝오버 — critical/serious 위반 0 + ESC 닫힘', async ({
    page,
  }) => {
    await mockStockApi(page);
    await page.goto('/scanner');
    // 트리거 클릭으로 팝오버 오픈
    const trigger = page
      .getByRole('button', { name: /E2E Tester|사용자/ })
      .first();
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // axe 팝오버 내부만 검사 (role=dialog)
    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = blockingViolations(results);
    expect(
      blocking,
      `critical/serious 위반 ${blocking.length}건\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);

    // ESC 로 닫힘
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Phase 16 Plan 17 Task 1 — 신규 3표면 접근성
   (TRADE-01 · TRADE-02 · NAV-01 · MYPAGE-01 / 16-UI-SPEC §접근성 라벨 · §키보드 접근성)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ① 왜 axe 만으로 끝내지 않는가
 *   axe 는 **마크업이 규격을 어겼는지**만 본다. UI-SPEC 이 못박은 것들 — 「원 아이콘
 *   묶음의 라벨은 정확히 1개」, 「호가 사다리는 탭 순서에서 빠진다」, 「`confirm_locked`
 *   행의 체크는 탭으로 닿지 않는다」 — 은 전부 **규격상 합법**이다. 개별 원마다
 *   `aria-label` 을 달아도 axe 는 통과하고 스크린리더만 같은 문장을 두 번 읽는다.
 *   그래서 위반 0 **과 함께** 7개 계약을 명시 단언으로 잠근다.
 *
 * ② 왜 relay 가 필요한가
 *   세 표면은 relay 세션이 `ready` 가 되기 전에는 게이트 화면(`dma-gate`)이거나 스켈레톤
 *   이다. 그 상태에 axe 를 돌리면 **검사할 DOM 이 없어서 통과한다** — 아무것도 증명하지
 *   못하는 green 이다. 실제 프레임이 도착한 뒤의 화면을 본다.
 *
 * ③ serial 규약의 정본은 `fixtures/relay.ts` ⑥ 이다(파일 상단에서 이미 적용).
 *
 * ④ ★ 실서버에 붙지 않는다 (D-27 / T-15-28) — 게이트웨이는 `127.0.0.1` 스텁이고 계좌는
 *   스텁 로그인 응답의 것이다. 사내망 주소·실계좌 리터럴은 이 파일 어디에도 없다.
 */

/** 상따 전략 2건 — 무장 조합을 **반대로** 둔다. 라벨이 값에서 온다는 것을 잡는 장치다. */
const A11Y_CHASERS = [
  {
    isin: E2E_ISIN,
    accountNo: E2E_ACCOUNT_NO,
    exchange: 'KRX',
    buyEnabled: true,
    sellEnabled: false,
  },
  {
    isin: E2E_LONG_NAME_ISIN,
    accountNo: E2E_ACCOUNT_NO,
    exchange: 'NXT',
    buyEnabled: false,
    sellEnabled: true,
  },
] as const;

const A11Y_VI_CFG = {
  accountNo: E2E_ACCOUNT_NO,
  orderAmountKrw: 10_000_000n,
  checkRate: 22,
  priceType: 'U',
  run: true,
};

/**
 * VI 주문 3건 — **확인 체크가 열리는 행이 정확히 1건**이 되게 짠다.
 * 셋 다 잠기면 「탭에서 빠진다」가 공허해지고, 셋 다 열리면 잠금 규칙을 지워도 통과한다.
 */
const A11Y_VI_ORDERS = [
  {
    isin: E2E_ISIN,
    accountNo: E2E_ACCOUNT_NO,
    orderNo: '0031245',
    state: 'Accepted',
    orderQty: 205,
    orderPrice: 48_750,
    triggerPrice: 41_250,
    basePrice: 33_510,
    filledQty: 0,
    confirmed: false,
    confirmLocked: false,
  },
  {
    isin: E2E_LONG_NAME_ISIN,
    accountNo: E2E_ACCOUNT_NO,
    orderNo: '0031102',
    state: 'Accepted',
    orderQty: 278,
    orderPrice: 115_700,
    triggerPrice: 98_400,
    basePrice: 80_000,
    filledQty: 120,
    confirmed: true,
    // 서버 계산값(119초 경과). 이 행의 체크는 탭으로 닿으면 안 된다.
    confirmLocked: true,
  },
  {
    isin: E2E_ISIN,
    accountNo: E2E_ACCOUNT_NO,
    // 접수 전 = 주문번호 없음 → 확인을 보내도 서버가 응답 없이 드롭한다.
    orderNo: '',
    state: 'Pending',
    triggerPrice: 12_345,
    basePrice: 10_000,
  },
] as const;

/** My page 계좌 카드가 서려면 계좌 상태 프레임이 필요하다(미체결·잔고가 카드 본문이다). */
const A11Y_ACCOUNT_STATE = {
  accountNo: E2E_ACCOUNT_NO,
  unfilled: [
    {
      orderNo: '0000135742',
      isin: E2E_ISIN,
      side: 'B',
      price: 98_000,
      orderQty: 50,
      filledQty: 20,
      unfilledQty: 30,
      exchange: 'KRX',
    },
  ],
  holdings: [{ isin: E2E_ISIN, stockQty: 120, sellableQty: 90, avgPrice: 91_250 }],
};

/** UI-SPEC 이 기준으로 삼은 모바일 폭(§반응형 「모바일 390px」). */
const A11Y_MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

const navTree = (page: Page) => page.locator('aside nav[aria-label="주 메뉴"]');

/**
 * 표면 **전체** axe. `.exclude` 를 쓰지 않는다 — 세 표면은 전부 AppShell 안에 있고
 * 사이드바가 이 phase 의 산출물이라 검사 대상의 일부다.
 */
async function scanSurface(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return blockingViolations(results);
}

/**
 * 컨테이너 안에서 **탭으로 닿는** 요소 목록(DOM 순서).
 *
 * 「포커스 대상이 아니다」를 단언하는 유일한 방법이다. `toBeDisabled()` 만 보면
 * `tabindex="-1"` 로 뺀 경우를 놓치고, `tabIndex` 만 보면 `disabled` 로 뺀 경우를 놓친다.
 * `hidden` 서브트리·`display:none`·`visibility:hidden` 도 함께 제외한다 — 비활성 pane 이
 * 「눈에만 안 보이는」 상태로 남으면 탭이 유령 폼으로 빠진다.
 */
async function tabbablesIn(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (root === null) return [`<컨테이너 없음: ${sel}>`];
    const FOCUSABLE =
      'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]';
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((el) => {
        if (el.hasAttribute('disabled')) return false;
        const ti = el.getAttribute('tabindex');
        if (ti !== null && Number(ti) < 0) return false;
        if (el.closest('[hidden]') !== null) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden') return false;
        // `offsetParent === null` 은 `display:none` 계열이다(`fixed` 는 예외).
        return el.offsetParent !== null || cs.position === 'fixed';
      })
      .map((el) => {
        /*
          기술자는 `data-slot` + `aria-label` 로만 만든다. **textContent 를 섞지 않는다** —
          스크롤 박스처럼 자식 텍스트를 통째로 물고 있는 요소가 있어서, 텍스트를 넣으면
          호가 값이 바뀔 때마다 기대값이 흔들려 단언이 「가끔 실패」가 된다.
        */
        const slot = el.getAttribute('data-slot');
        const label = el.getAttribute('aria-label');
        return (
          el.tagName.toLowerCase() +
          (slot === null ? '' : `[${slot}]`) +
          (label === null ? '' : `:${label}`)
        );
      });
  }, selector);
}

/** 펼친 상따 카드 한 장(포커스 URL 로 연 카드) — Phase 24 axe 스캔 범위. */
const LC_OPEN_CARD = '[data-slot="strategy-card"][data-open="true"]';
const LC_FOCUS_URL = `/trading?focus=${encodeURIComponent(`${E2E_ISIN}:${E2E_ACCOUNT_NO}:KRX`)}`;

/**
 * 펼친 카드의 컨테이너 폭(clientWidth)을 정확히 `target` 으로 — 재고, 모자란 만큼 뷰포트를 옮긴다.
 * 본문 폭은 뷰포트가 아니라 카드 컨테이너 폭이다(§2.2b — 경계 숫자는 globals.css 가 정본).
 */
async function sizeOpenCardTo(page: Page, target: number): Promise<void> {
  const card = page.locator(LC_OPEN_CARD);
  let viewport = target + 34;
  for (let i = 0; i < 6; i += 1) {
    await page.setViewportSize({ width: viewport, height: 1000 });
    await expect(card.locator('[data-slot="card-body"]')).toBeVisible();
    const width = await card.evaluate((el) => el.clientWidth);
    if (width === target) return;
    viewport += target - width;
  }
  expect(await card.evaluate((el) => el.clientWidth), `카드 폭 ${target}`).toBe(target);
}

/**
 * 선매수 · 추가매수 · 후매수 · 자동매도(Phase 27) 네 카드를 모두 접거나 모두 펼친다(접기는 로컬 동작 — 전송 0).
 * 폰 밴드는 탭당 한 pane 이라 숨은 pane 의 접기 버튼은 건너뛴다.
 */
async function setLcFolds(page: Page, expanded: boolean): Promise<void> {
  const folds = page.locator(LC_OPEN_CARD).locator('[data-slot="lc-group-fold"]');
  await expect(folds).toHaveCount(4);
  for (const f of await folds.all()) {
    if (!(await f.isVisible())) continue;
    if ((await f.getAttribute('aria-expanded')) !== String(expanded)) await f.click();
    await expect(f).toHaveAttribute('aria-expanded', String(expanded));
  }
}

/** 테마를 `localStorage.theme` 로 고정해 포커스 URL 을 다시 열고, 작업대 준비 · 카드 한 장까지 기다린다. */
async function openLcCardInTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.goto(LC_FOCUS_URL);
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`));
  await expect(page.locator('[data-slot="workbench-status-bar"]')).toHaveAttribute('data-status', 'ready', {
    timeout: 30_000,
  });
  await expect(page.locator(LC_OPEN_CARD)).toHaveCount(1, { timeout: 15_000 });
}

/** 폰 밴드(본문 < 685 · 정본 globals.css §2.2b)의 바깥 탭 「매수」/「매도」. */
async function pickLcTab(page: Page, name: '매수' | '매도'): Promise<void> {
  await page.locator(LC_OPEN_CARD).getByRole('tablist', { name: '주문 진입' }).getByRole('tab', { name }).click();
}

test.describe('Phase 16 Plan 17 · Phase 18 — 트레이딩 작업대 · My page 접근성', () => {
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
    // 전략 시드는 **연결 전에** 심는다 — relay 는 로그인 직후 24/21/34 를 물어본다.
    relay.seedLimitChasers([...A11Y_CHASERS]);
    relay.seedViTrigger(A11Y_VI_CFG);
    relay.seedViOrders([...A11Y_VI_ORDERS]);
    await mockStockApi(page, { searchResults: [FIXTURE_SAMSUNG] });
  });

  /*
    ★ Phase 18 (18-13) — 옛 3표면 중 상따·VI 두 화면은 `/trading` 작업대 하나로 합쳐졌다(D-01).
      옛 세 케이스(상따 신규 · 상따 모바일 · VI)가 잠그던 계약을 작업대의 새 자리로 옮긴다 —
      사이드바 LED 묶음 라벨 1개 · 스위치 3종 이름 · 호가 비포커스 · 검색 결선 · 폰 탭/pane · 더티 바
      status · VI 확인 체크 탭 제외 · 데드라인 progressbar · 거부 경보. 판정(axe 위반 0)은 그대로다.
  */
  // ─────────────────────────────────────────────────────────────────────────
  test('/trading — 위반 0(세 그룹 카드 접힘 · 펼침 각각) + 사이드바 제목 활성 · LED 묶음 라벨 1개 · 스위치 6종(role=switch) · 값 버튼 설명 · 호가 비포커스 · 검색 결선', async ({
    page,
  }) => {
    await page.goto(`/trading?focus=${encodeURIComponent(`${E2E_ISIN}:${E2E_ACCOUNT_NO}:KRX`)}`);
    await expect(page.locator('[data-slot="workbench-status-bar"]')).toHaveAttribute(
      'data-status',
      'ready',
      { timeout: 30_000 },
    );
    // 사이드바 3단이 설 때까지 기다린다 = `lc.snap` 이 도착했다는 동기화 지점이다.
    await expect(navTree(page).locator('[data-strategy-key]')).toHaveCount(2, { timeout: 15_000 });
    const openCard = page.locator('[data-slot="strategy-card"][data-open="true"]');
    await expect(openCard).toHaveCount(1, { timeout: 15_000 });

    // Phase 24 ⑤ — 선매수 · 추가매수 · 후매수 카드는 기본 접힘이다(Phase 27 자동매도 카드도). 접힌 상태를 먼저 스캔한다.
    const folds = openCard.locator('[data-slot="lc-group-fold"]');
    await expect(folds).toHaveCount(4);
    for (const f of await folds.all()) await expect(f).toHaveAttribute('aria-expanded', 'false');
    const blocking = await scanSurface(page);
    expect(
      blocking,
      `접힌 상태 critical/serious 위반 ${blocking.length}건\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);
    // 세 카드를 펼친 상태도 스캔한다 — 행 · 체크 · 발동잔량 · (흐린 행) 전부가 접근성 트리에 들어온다.
    for (const f of await folds.all()) await f.click();
    for (const f of await folds.all()) await expect(f).toHaveAttribute('aria-expanded', 'true');
    const expandedScan = await scanSurface(page);
    expect(
      expandedScan,
      `펼친 상태 critical/serious 위반 ${expandedScan.length}건\n${JSON.stringify(expandedScan, null, 2)}`,
    ).toEqual([]);

    // ① 사이드바 = `<nav aria-label="주 메뉴">` 하나 + 활성은 「트레이딩」 제목 하나(18-12).
    await expect(navTree(page)).toHaveCount(1);
    const current = navTree(page).locator('[data-nav-item][aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText('트레이딩');

    // ② LED 3점 묶음 — 라벨은 **묶음에만** 1개(`role="img"`), 개별 점은 `aria-hidden`.
    const item = navTree(page).locator('[data-strategy-key]').first();
    const group = item.locator('[role="img"]');
    await expect(group).toHaveCount(1);
    const label = await group.getAttribute('aria-label');
    expect(label).toMatch(/^매수 .+ · 매도 .+ · 취소 .+$/);
    await expect(group).toHaveAttribute('title', label!);
    await expect(item.locator('[aria-label]')).toHaveCount(1);
    await expect(item.locator('[data-led]')).toHaveCount(3);
    await expect(item.locator('[data-led][aria-hidden="true"]')).toHaveCount(3);
    // 두 번째 항목은 조합이 반대다 — 라벨이 고정 문자열이 아니라 값에서 온다는 증거다.
    const second = await navTree(page)
      .locator('[data-strategy-key]')
      .nth(1)
      .locator('[role="img"]')
      .getAttribute('aria-label');
    expect(second).not.toBe(label);

    // ③ 그룹 스위치 7종 — Phase 20 부터 `role="switch"`(Radix Switch) · 매수취소도 스위치다(D-21) · Phase 24 로
    //    선 · 추가 · 후매수 스위치가 서고 한방은 선매수 카드 안 체크가 됐다 · Phase 27 자동매도 스위치. 시각 라벨이 없으므로
    //    `aria-label` 이 유일한 이름이다(펼친 카드 1장).
    await expect(openCard.getByRole('switch')).toHaveCount(7);
    for (const name of ['매수주문 켜기', '선매수 켜기', '추가매수 켜기', '후매수 켜기', '매도주문 켜기', '매수취소 켜기', '자동매도 켜기']) {
      await expect(openCard.getByRole('switch', { name, exact: true })).toHaveCount(1);
    }
    // ③-b 같은 라벨 두 벌(D-09) — 「비교가격」 값 버튼은 이름 접두(매수 · 매도)로 갈리고, 설명은 카드 제목 +
    //      상태 문구다(R10 — 흐린 행의 비시각 경로).
    await expect(openCard.locator('[data-lc-field="lc-buy-watch-price"]')).toHaveAccessibleName(/^매수 비교가격 /);
    await expect(openCard.locator('[data-lc-field="lc-sell-watch-price"]')).toHaveAccessibleName(/^매도 비교가격 /);
    await expect(openCard.locator('[data-lc-field="lc-buy-watch-price"]')).toHaveAccessibleDescription(/^매수주문 /);
    await expect(openCard.locator('[data-lc-field="lc-sell-watch-price"]')).toHaveAccessibleDescription(/^매도주문 /);

    // ④ 상태줄 DMA 필은 `aria-live="polite"` — 포커스를 뺏지 않고 갱신을 알린다.
    await expect(page.locator('[data-slot="workbench-dma"]')).toHaveAttribute('aria-live', 'polite');

    // ⑤ ★ 호가 사다리는 **포커스 대상이 아니다** — 데스크톱 밴드 카드에서 탭 순서에 호가 셀 0개.
    const ladderSel =
      '[data-slot="strategy-card"][data-open="true"] [data-slot="orderbook-ladder"][data-variant="chaser"]';
    await expect(page.locator(ladderSel)).toHaveCount(1);
    expect(await tabbablesIn(page, ladderSel)).toEqual([]);

    /*
      ⑥ ★ 검색 결과가 뜬 상태를 따로 스캔한다 — 질의 전에는 `listbox`·`option` 이 DOM 에 없어서
        새 ARIA 조합을 한 번도 보지 못한다. 옛 헤더 검색과 같은 `StockSearchField` 가 종목 추가란에 있다.
    */
    const searchBox = page
      .locator('[data-slot="stock-add-bar"]')
      .getByPlaceholder('종목 추가 — 종목명 또는 코드');
    await expect(searchBox).toHaveAttribute('aria-expanded', 'false');
    await searchBox.fill('삼성');
    await expect(page.locator('[data-slot="lc-search-option"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(searchBox).toHaveAttribute('aria-expanded', 'true');
    const listId = await searchBox.getAttribute('aria-controls');
    expect(listId).not.toBeNull();
    await expect(page.locator(`#${listId}`)).toHaveAttribute('role', 'listbox');
    const activeId = await searchBox.getAttribute('aria-activedescendant');
    expect(activeId).not.toBeNull();
    await expect(page.locator(`#${activeId}`)).toHaveAttribute('role', 'option');

    const withList = await scanSurface(page);
    expect(
      withList,
      `검색 결과 열린 상태 critical/serious 위반 ${withList.length}건\n${JSON.stringify(withList, null, 2)}`,
    ).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  /*
    ★ Phase 24 (24-08) — 상따 매수 카드 axe 매트릭스(UI-SPEC 검증 훅): 본문 344 · 992 × 라이트 · 다크 × 세 카드
      접힘 · 펼침 = 8 스캔. 시드는 흐린 그룹(추가매수 OFF) · 「보유중」(후매수 단계 2) · 「… · 후매수 발동」 꼬리가
      한 카드에 함께 서게 짠다. 판정은 파일 공통(`blockingViolations` — 알려진 대비 예외 `color-contrast` 는 기존
      목록 규칙 그대로). 스캔 범위는 펼친 카드 한 장이다(상따 카드 표면 · 사이드바는 위 케이스가 본다).
      본문 폭은 뷰포트가 아니라 카드 컨테이너 폭으로 맞춘다(§2.2b — 경계 숫자는 globals.css 가 정본).
  */
  test('/trading 상따 매수 카드 axe 매트릭스 — 본문 344 · 992 × 라이트 · 다크 × 세 카드 접힘 · 펼침 critical/serious 0 (Phase 24 · UI-SPEC 검증 훅)', async ({
    page,
  }) => {
    relay.seedLimitChasers([
      {
        isin: E2E_ISIN,
        accountNo: E2E_ACCOUNT_NO,
        exchange: 'KRX',
        buyEnabled: true,
        preBuyEnabled: true,
        sellEnabled: true,
        cancelQtyEnabled: true,
        postBuyEnabled: true,
        postBuyPhase: 2,
        postBuyOrderAmount: 4000,
        postBuyReentry: 3,
        postBuyReentryLeft: 2,
        postBuyReboundPct: 30,
        postBuyFloorQty: 100_000,
        postBuyTriggerQty: 330_000,
      },
    ]);
    const CARD = LC_OPEN_CARD;
    const card = page.locator(CARD);

    const failures: string[] = [];
    let scans = 0;
    for (const theme of ['light', 'dark'] as const) {
      await openLcCardInTheme(page, theme);
      await expect(
        card.locator('[data-slot="lc-group-post-buy"] [data-slot="lc-group-status"]'),
      ).toHaveText('보유중', { timeout: 15_000 });
      for (const target of [344, 992]) {
        await sizeOpenCardTo(page, target);
        if (target < 685) await pickLcTab(page, '매수');
        for (const expanded of [false, true]) {
          await setLcFolds(page, expanded);
          const results = await new AxeBuilder({ page }).include(CARD).withTags(['wcag2a', 'wcag2aa']).analyze();
          const blocking = blockingViolations(results);
          scans += 1;
          if (blocking.length > 0) {
            failures.push(
              `${theme} · 본문 ${target} · ${expanded ? '펼침' : '접힘'} — ${JSON.stringify(
                blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
              )}`,
            );
          }
        }
      }
    }
    expect(scans, '매트릭스 8 스캔').toBe(8);
    expect(failures, 'critical/serious 위반').toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  /*
    ★ Phase 24 WR-02 (24-13) — 구서버 에코(`buy3Schema 0`) 상따 카드: 매수주문 상태 「구서버 전략 · 끄기만 가능」
      (`--destructive`) · 꺼진 스위치 넷 `disabled` · 열마다 「켤 수 없는 이유」 구서버 한 줄이 한 카드에 선다.
      본문 344 · 992 × 라이트 · 다크 = 4 스캔(세 카드 접힘 — 기본). 판정 · 폭 · 테마 헬퍼는 위 매트릭스와 같다.
  */
  test('/trading 상따 구서버 에코 카드 axe — 본문 344 · 992 × 라이트 · 다크 critical/serious 0 (Phase 24 WR-02)', async ({
    page,
  }) => {
    relay.seedLimitChasers([
      { isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, exchange: 'KRX', buy3Schema: 0, buyEnabled: true, sellEnabled: true },
    ]);
    const card = page.locator(LC_OPEN_CARD);

    const failures: string[] = [];
    let scans = 0;
    for (const theme of ['light', 'dark'] as const) {
      await openLcCardInTheme(page, theme);
      await expect(card.locator('[data-slot="lc-group-buy"] [data-slot="lc-group-status"]')).toHaveText(
        '구서버 전략 · 끄기만 가능',
        { timeout: 15_000 },
      );
      for (const target of [344, 992]) {
        await sizeOpenCardTo(page, target);
        if (target < 685) await pickLcTab(page, '매수');
        await setLcFolds(page, false);
        await expect(card.locator('[data-pane="buy"] [data-slot="lc-arm-blocked"]')).toBeVisible();
        const results = await new AxeBuilder({ page }).include(LC_OPEN_CARD).withTags(['wcag2a', 'wcag2aa']).analyze();
        const blocking = blockingViolations(results);
        scans += 1;
        if (blocking.length > 0) {
          failures.push(
            `${theme} · 본문 ${target} — ${JSON.stringify(
              blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
            )}`,
          );
        }
      }
    }
    expect(scans, '구서버 에코 4 스캔').toBe(4);
    expect(failures, 'critical/serious 위반').toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  test('/trading (모바일 390) — 카드 탭 3종 · 비활성 pane 비가시·탭 제외 · 사다리 스크롤 영역 · 인라인 편집 중 입력 이름·포커스', async ({
    page,
  }) => {
    await page.setViewportSize(A11Y_MOBILE_VIEWPORT);
    await page.goto(`/trading?focus=${encodeURIComponent(`${E2E_ISIN}:${E2E_ACCOUNT_NO}:KRX`)}`);
    await expect(page.locator('[data-slot="workbench-status-bar"]')).toHaveAttribute(
      'data-status',
      'ready',
      { timeout: 30_000 },
    );
    await expect(
      page.locator('[data-lc-field="lc-buy-watch-qty"] [data-slot="lc-row-value"]'),
    ).toHaveText('10,000주', { timeout: 15_000 });

    const blocking = await scanSurface(page);
    expect(
      blocking,
      `critical/serious 위반 ${blocking.length}건\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);

    // ⑥ 폰 밴드 탭 — 「매수 | 매도 | 수동」 `role="tablist"` + `aria-selected`.
    const card = page.locator('[data-slot="strategy-card"][data-open="true"]');
    const tablist = card.getByRole('tablist', { name: '주문 진입' });
    await expect(tablist.getByRole('tab')).toHaveCount(3);
    await expect(tablist.getByRole('tab', { name: '매수' })).toHaveAttribute('aria-selected', 'true');
    await expect(tablist.getByRole('tab', { name: '매도' })).toHaveAttribute('aria-selected', 'false');
    // 두 pane 은 각각 한 요소이고, 숨김은 곧 탭 순서 제외다.
    await expect(page.locator('[data-pane="buy"]')).toHaveCount(1);
    await expect(page.locator('[data-pane="sell"]')).toHaveCount(1);
    await expect(page.locator('[data-pane="buy"]')).toBeVisible();
    await expect(page.locator('[data-pane="sell"]')).toBeHidden();
    expect(await tabbablesIn(page, '[data-pane="sell"]')).toEqual([]);
    expect((await tabbablesIn(page, '[data-pane="buy"]')).length).toBeGreaterThan(0);
    await tablist.getByRole('tab', { name: '매도' }).click();
    await expect(page.locator('[data-pane="buy"]')).toBeHidden();
    await expect(page.locator('[data-pane="sell"]')).toBeVisible();
    expect(await tabbablesIn(page, '[data-pane="buy"]')).toEqual([]);
    expect((await tabbablesIn(page, '[data-pane="sell"]')).length).toBeGreaterThan(0);

    /*
      ⑤-b 좁은 폭 호가는 박스 안에서 20행을 스크롤한다 — 금지된 것은 행의 roving tabindex 이지 스크롤
        영역이 아니다(WCAG 2.1.1 · axe `scrollable-region-focusable`). 탭으로 닿는 것은 사다리 스크롤과
        compact 체결 테이프 스크롤 두 영역뿐이다.
    */
    const ladderSel =
      '[data-slot="strategy-card"][data-open="true"] [data-slot="orderbook-ladder"][data-variant="chaser"]';
    expect(await tabbablesIn(page, ladderSel)).toEqual(['div[ladder-scroll]', 'div[tape-scroll]']);
    await expect(page.locator(`${ladderSel} li[tabindex]`)).toHaveCount(0);

    /*
      ⑦ 인라인 편집 중(옛 「더티 바 role=status」 재정의 · Phase 20 D-04) — 더티 바는 사라졌고 편집 표면은
        행 자체다. 마우스 기기에서 행을 누르면 그 자리에 입력이 서고, 입력은 라벨 「매도잔량」(Phase 24 D-09 · 선매수
        카드 — 기본 접힘이라 먼저 펼친다)을 이름으로 가지며
        포커스를 유지한다(값을 쳐도 뺏기지 않는다). 편집 중인 상태도 위반 0 이다.
    */
    await tablist.getByRole('tab', { name: '매수' }).click();
    await card.locator('[data-slot="lc-group-pre-buy"] [data-slot="lc-group-fold"]').click();
    await page.locator('[data-lc-field="lc-buy-watch-qty"]').click();
    const input = page.locator('#lc-buy-watch-qty');
    await expect(input).toBeFocused();
    await expect(input).toHaveAccessibleName('매도잔량');
    await input.fill('8000');
    await expect(input).toBeFocused();
    await expect(page.locator('[data-slot="dirty-action-bar"]')).toHaveCount(0);

    const editing = await scanSurface(page);
    expect(editing, `인라인 편집 중 위반 ${editing.length}건\n${JSON.stringify(editing, null, 2)}`).toEqual([]);
    // 편집을 버린다(Esc) — 아무것도 나가지 않고 행으로 포커스가 돌아온다.
    await input.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(page.locator('[data-lc-field="lc-buy-watch-qty"]')).toBeFocused();
  });

  /*
    ★ Phase 20 (20-07) — 터치 기기 키패드 시트가 열린 상태의 접근성. `hasTouch` 컨텍스트는
      `(pointer: coarse)` 가 참이라 행이 시트를 연다(D-12). 계약(UI-SPEC 접근성): Radix Dialog ·
      `role="dialog"` · `aria-modal="true"` · 이름 = 제목 · 열린 동안 포커스는 시트 안 · 닫으면 **연 행으로**
      포커스 복귀. relay 픽스처가 이 describe 의 beforeAll/beforeEach 에 있어 반드시 안쪽에 둔다.
  */
  test.describe('Phase 20 — 터치 기기 시트', () => {
    test.use({ hasTouch: true });

    test('/trading 시트 열린 상태 — role=dialog · aria-modal · 이름 = 제목 · axe critical/serious 0 · 닫으면 연 행으로 포커스 복귀', async ({
      page,
    }) => {
      await page.setViewportSize(A11Y_MOBILE_VIEWPORT);
      await page.goto(`/trading?focus=${encodeURIComponent(`${E2E_ISIN}:${E2E_ACCOUNT_NO}:KRX`)}`);
      await expect(page.locator('[data-slot="workbench-status-bar"]')).toHaveAttribute(
        'data-status',
        'ready',
        { timeout: 30_000 },
      );
      const row = page.locator('[data-lc-field="lc-buy-watch-qty"]');
      await expect(row.locator('[data-slot="lc-row-value"]')).toHaveText('10,000주', { timeout: 15_000 });
      await expect(row).toHaveAttribute('aria-haspopup', 'dialog');

      // Phase 24 ⑤ — 선매수 카드는 기본 접힘이다(접기는 로컬 동작 · 전송 0).
      await page
        .locator('[data-slot="strategy-card"][data-open="true"] [data-slot="lc-group-pre-buy"] [data-slot="lc-group-fold"]')
        .tap();
      await row.tap();
      const sheet = page.locator('[data-slot="numpad-sheet"]');
      await expect(sheet).toBeVisible({ timeout: 10_000 });
      await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      await expect(sheet).toHaveAttribute('role', 'dialog');
      await expect(sheet).toHaveAttribute('aria-modal', 'true');
      await expect(sheet).toHaveAccessibleName('선매수 매도잔량');
      await expect(sheet).toHaveAccessibleDescription('비교가격의 매도잔량이 이 값 이하로 줄면 선매수를 넣어요');
      // 열린 동안 포커스는 시트 안이다(초기 포커스 = 콘텐츠 컨테이너).
      expect(
        await page.evaluate(() => document.activeElement?.closest('[data-slot="numpad-sheet"]') != null),
      ).toBe(true);
      await expect(sheet.getByRole('group', { name: '숫자 키패드' })).toBeVisible();

      const open = await scanSurface(page);
      expect(open, `시트 열린 상태 위반 ${open.length}건\n${JSON.stringify(open, null, 2)}`).toEqual([]);

      await sheet.getByRole('button', { name: '닫기' }).tap();
      await expect(sheet).toHaveCount(0, { timeout: 10_000 });
      await expect(row).toBeFocused();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  test('/trading VI — 위반 0 + 발동 표 `confirm_locked` 탭 제외 · 데드라인 `progressbar` · 거부 `role="alert"`', async ({
    page,
  }) => {
    await page.goto('/trading');
    await expect(page.locator('[data-slot="workbench-status-bar"]')).toHaveAttribute(
      'data-status',
      'ready',
      { timeout: 30_000 },
    );
    await expect(page.locator('[data-slot="vi-chip"]')).toHaveCount(3, { timeout: 15_000 });
    await page.locator('[data-slot="vi-strip-more"]').click();
    const tableSel = '[data-slot="vi-trigger-table"] [data-slot="vi-order-table"]';
    await expect(page.locator(`${tableSel} [data-slot="vi-order-row"]`)).toHaveCount(3);

    const blocking = await scanSurface(page);
    expect(
      blocking,
      `critical/serious 위반 ${blocking.length}건\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);

    // ⑨ ★ `confirm_locked` · 접수 전 행의 확인 체크는 **탭에서 빠진다** — 3행 중 열리는 것은 1행.
    const checks = page.locator(`${tableSel} [data-slot="vi-confirm-check"]`);
    await expect(checks).toHaveCount(3);
    await expect(checks.nth(0)).toBeEnabled();
    await expect(checks.nth(1)).toBeDisabled();
    await expect(checks.nth(2)).toBeDisabled();
    // 잠긴 사유는 title 과 aria-describedby 두 길로 말한다(마우스 없는 사용자에게 title 은 안 읽힌다).
    await expect(checks.nth(1)).toHaveAttribute('aria-describedby', /.+/);
    const tabbableChecks = (await tabbablesIn(page, tableSel)).filter((d) =>
      d.startsWith('input[vi-confirm-check]'),
    );
    expect(tabbableChecks).toHaveLength(1);

    // ⑩ 데드라인 진행바 — `role="progressbar"` + `aria-valuenow/min/max`.
    await relay.pushViOrderList(
      [
        {
          ...A11Y_VI_ORDERS[0],
          deadline110Ms: BigInt(Date.now() + 60_000),
          deadline119Ms: BigInt(Date.now() + 69_000),
        },
      ],
      true,
    );
    const progress = page.locator(`${tableSel} [role="progressbar"]`).first();
    await expect(progress).toHaveAttribute('aria-label', '110초 자동취소까지 남은 시간', {
      timeout: 15_000,
    });
    await expect(progress).toHaveAttribute('aria-valuemin', '0');
    await expect(progress).toHaveAttribute('aria-valuemax', '110');
    const valueNow = Number(await progress.getAttribute('aria-valuenow'));
    expect(valueNow).toBeGreaterThan(0);
    expect(valueNow).toBeLessThanOrEqual(110);

    // ⑪ 반영 실패는 `role="alert"` — 상태가 아니라 경보다(VI 두 줄 아래).
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: '',
      accountNo: E2E_ACCOUNT_NO,
      message: 'VI 주문금액이 0 입니다',
      kind: '',
    });
    const alert = page.locator('[data-slot="vi-server-error"]');
    await expect(alert).toContainText('VI 주문금액이 0 입니다', { timeout: 15_000 });
    await expect(alert).toHaveAttribute('role', 'alert');

    // 경보가 뜬 상태도 위반 0 — 실패 표시는 대비비가 깨지는 대표 자리다.
    const afterAlert = await scanSurface(page);
    expect(
      afterAlert,
      `critical/serious 위반 ${afterAlert.length}건\n${JSON.stringify(afterAlert, null, 2)}`,
    ).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  /*
    ★ Phase 25-10 — 새 표면 전체 axe 매트릭스(UI-SPEC 「접근성 계약」 · 검증 훅).
      표면 5: 공용 패널 주문로그 · 카드 주문로그 · 창 분리 `/trading/order-log` · 오늘 주문 행 펼침 · 미체결 진행률 보조행
      × 폭 2 × 라이트 · 다크 = 20 스캔. 폭 344 = 본문을 정확히 344 로 맞춘다(작업대 · 마이페이지는 앱 셸 안 본문
      `trading-workbench` · `me-page` clientWidth, 창 분리는 셸이 없어 뷰포트 = 본문). 폭 1280 = 뷰포트 1280(실측 본문:
      작업대 992 · 마이페이지 900(max-width) · 창 분리 1280 — annotation `P25-axe-widths`). 복원은 `page.route` 목(하루치 전략 이벤트 · 오늘 주문 ·
      펼침 이벤트), 진행률은 `pushQueueProgress`. 판정 · 예외는 이 파일 `DEFERRED_RULES` 그대로(새 예외 없음 —
      `--faint` 보조 글자 대비는 기존 `color-contrast` 이연 규칙과 같게 다룬다).
  */
  test('Phase 25 axe 매트릭스 — 공용 패널 주문로그 · 카드 로그 팝업 · 창 분리 · 오늘 주문 펼침 · 진행률 보조행 × 본문 344 · 1280 × 라이트 · 다크 critical/serious 0', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const TODAY = kstDateIso();
    const shift = Date.parse(`${TODAY}T00:00:00+09:00`) - Date.parse(`${FIXTURE_TRADE_DATE}T00:00:00+09:00`);
    const dayRows: StrategyEventRow[] = STRATEGY_DAY_ROWS.map((r) => ({ ...r, tradeDate: TODAY, gwTimeMs: r.gwTimeMs + shift }));
    await page.route('**/api/strategy-events*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dayRows) }),
    );
    await page.route('**/api/orders', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ ...ROW_12451, tradeDate: TODAY }]),
      }),
    );
    await page.route('**/api/orders/*/events**', (route) => {
      const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TIMELINE_BY_ANCHOR[id] ?? []),
      });
    });

    const failures: string[] = [];
    const widths: string[] = [];
    let scans = 0;
    const scan = async (label: string, include: string) => {
      await expect(page.locator(include).first()).toBeVisible();
      const results = await new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa']).analyze();
      const blocking = blockingViolations(results);
      scans += 1;
      if (blocking.length > 0) {
        failures.push(
          `${label} — ${JSON.stringify(blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })))}`,
        );
      }
    };
    /** 테마를 `localStorage.theme` 로 고정해 연다. */
    const gotoThemed = async (url: string, theme: 'light' | 'dark') => {
      await page.goto(url);
      await page.evaluate((t) => localStorage.setItem('theme', t), theme);
      await page.reload();
      await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`));
    };
    /** 앱 셸 안 본문(`sel` clientWidth)을 정확히 `target` 으로 — 모자란 만큼 뷰포트를 옮긴다. */
    const sizeBodyTo = async (sel: string, target: number) => {
      let viewport = target <= 700 ? target + 16 : target;
      for (let i = 0; i < 6; i += 1) {
        await page.setViewportSize({ width: viewport, height: 900 });
        const width = await page.locator(sel).evaluate((el) => el.clientWidth);
        if (target > 700 || width === target) return width;
        viewport += target - width;
      }
      return page.locator(sel).evaluate((el) => el.clientWidth);
    };
    const UNF_WAIT = {
      orderNo: '12453',
      isin: E2E_ISIN,
      side: 'B' as const,
      price: 98_000,
      orderQty: 300,
      filledQty: 0,
      unfilledQty: 300,
      exchange: 'KRX' as const,
    };
    const PROGRESS = {
      accountNo: E2E_ACCOUNT_NO,
      orderNo: '12453',
      group: 3,
      expectedCum: 1_100_000,
      currentCum: 1_088_000,
      remainingVolume: 12_000,
      progressBp: 8800,
    };

    for (const theme of ['light', 'dark'] as const) {
      for (const target of [344, 1280]) {
        const tag = `${theme} · 본문 ${target}`;

        // ── A. 작업대 — 공용 패널 주문로그 · 진행률 보조행 · 카드 로그 팝업(quick-260930-lq5)
        await page.setViewportSize({ width: target <= 700 ? target + 16 : target, height: 900 });
        await gotoThemed(LC_FOCUS_URL, theme);
        await expect(page.locator('[data-slot="workbench-status-bar"]')).toHaveAttribute('data-status', 'ready', {
          timeout: 30_000,
        });
        await expect(page.locator(LC_OPEN_CARD)).toHaveCount(1, { timeout: 15_000 });
        const wbWidth = await sizeBodyTo('[data-slot="trading-workbench"]', target);
        widths.push(`${tag} wb=${wbWidth}`);
        await relay.pushAccountState({ unfilled: [UNF_WAIT] });
        await relay.pushQueueProgress({ isin: E2E_ISIN, exchange: 'KRX', items: [PROGRESS] });

        const panels = page.getByTestId('shared-panels');
        const unfold = panels.getByRole('button', { name: '펼치기 ▴' });
        if (await unfold.isVisible()) await unfold.click();
        await panels.getByRole('tab', { name: /^주문로그/ }).click();
        await expect(panels.locator('li[data-slot="order-log-line"]').first()).toBeVisible({ timeout: 15_000 });
        await scan(`${tag} · 공용 패널 주문로그`, '[data-testid="shared-panels"]');

        await panels.getByRole('tab', { name: /^미체결/ }).click();
        await expect(panels.locator('[data-slot="unfilled-progress"]').first()).toBeVisible({ timeout: 15_000 });
        await scan(`${tag} · 진행률 보조행`, '[data-testid="shared-panels"]');

        const cardBar = page.locator(`${LC_OPEN_CARD} [data-slot="card-tabs-bar"]`);
        await cardBar.locator('[data-slot="card-log-button"][data-log="주문로그"]').click();
        await expect(page.locator('[role="dialog"] [data-slot="card-log-row"], [role="dialog"] [data-slot="card-log-phone-row"]').filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
        await scan(`${tag} · 카드 주문로그 팝업`, '[role="dialog"]');
        await page.keyboard.press('Escape');
        await expect(page.locator('[role="dialog"]')).toHaveCount(0);
        await cardBar.locator('[data-slot="card-log-button"][data-log="로그"]').click();
        await scan(`${tag} · 카드 전략로그 팝업`, '[role="dialog"]');
        await page.keyboard.press('Escape');
        await expect(page.locator('[role="dialog"]')).toHaveCount(0);

        // ── B. 마이페이지 — 오늘 주문 행 펼침
        await gotoThemed('/me', theme);
        await expect(page.locator('[data-slot="me-status-bar"]')).toHaveAttribute('data-status', 'ready', {
          timeout: 30_000,
        });
        const meWidth = await sizeBodyTo('[data-slot="me-page"]', target);
        widths.push(`${tag} me=${meWidth}`);
        const expand = page.locator('[data-slot="today-orders-card"] button[data-slot="today-order-expand"]:visible').first();
        await expect(expand).toBeVisible({ timeout: 15_000 });
        await expand.click();
        await expect(expand).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('[data-slot="today-order-detail"]:visible li').first()).toBeVisible({ timeout: 15_000 });
        await scan(`${tag} · 오늘 주문 펼침`, '[data-slot="today-orders-card"]');

        // ── C. 창 분리 — 셸 없음(뷰포트 = 본문)
        await page.setViewportSize({ width: target, height: 900 });
        await gotoThemed(`/trading/order-log?account=${E2E_ACCOUNT_NO}`, theme);
        await expect(page.locator('main[data-slot="order-log-window"] li[data-slot="order-log-line"]').first()).toBeVisible({
          timeout: 30_000,
        });
        widths.push(`${tag} window=${await page.locator('main[data-slot="order-log-window"]').evaluate((el) => el.clientWidth)}`);
        await scan(`${tag} · 창 분리`, 'main[data-slot="order-log-window"]');
      }
    }
    test.info().annotations.push({ type: 'P25-axe-widths', description: widths.join(' | ') });
    console.log(`[P25-axe] scans=${scans} widths: ${widths.join(' | ')}`);
    expect(scans, '매트릭스 24 스캔(표면 6 × 본문 2 × 테마 2)').toBe(24);
    expect(failures, 'critical/serious 위반').toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  test('/me — 위반 0 + 사이드바 `aria-current` · 상태줄 `aria-live`', async ({ page }) => {
    await page.goto('/me');
    await expect(page.locator('[data-slot="me-status-bar"]')).toHaveAttribute(
      'data-status',
      'ready',
      { timeout: 30_000 },
    );
    await expect(page.locator('[data-slot="strategy-row"]')).toHaveCount(2, { timeout: 15_000 });
    // 계좌 카드 본문(미체결·잔고)이 서야 검사 대상이 실제 화면이 된다.
    await relay.pushAccountState(A11Y_ACCOUNT_STATE);
    await expect(page.locator('[data-slot="me-account-card"]')).toHaveCount(1, {
      timeout: 15_000,
    });

    const blocking = await scanSurface(page);
    expect(
      blocking,
      `critical/serious 위반 ${blocking.length}건\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);

    // 사이드바 활성 항목은 My page 하나뿐이다.
    const current = navTree(page).locator('[data-nav-item][aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText('My page');

    await expect(page.locator('[data-slot="me-status-bar"]')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });
});
