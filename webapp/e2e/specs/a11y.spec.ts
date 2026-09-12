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

test.describe('Phase 16 Plan 17 — 신규 3표면 접근성 (상따 · VI · My page)', () => {
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

  // ─────────────────────────────────────────────────────────────────────────
  test('/trading/limit-chaser/new — 위반 0 + 사이드바 트리 · 스위치 3종 · 호가 비포커스', async ({
    page,
  }) => {
    await page.goto('/trading/limit-chaser/new');
    await expect(page.locator('[data-slot="lc-status-bar"]')).toHaveAttribute(
      'data-status',
      'ready',
      { timeout: 30_000 },
    );
    // 사이드바 3단이 설 때까지 기다린다 = `lc.snap` 이 도착했다는 동기화 지점이다.
    await expect(navTree(page).locator('[data-strategy-key]')).toHaveCount(2, {
      timeout: 15_000,
    });

    const blocking = await scanSurface(page);
    expect(
      blocking,
      `critical/serious 위반 ${blocking.length}건\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);

    // ① 사이드바 = `<nav aria-label="주 메뉴">` 하나 + 현재 경로만 `aria-current="page"`.
    await expect(navTree(page)).toHaveCount(1);
    const current = navTree(page).locator('[data-nav-item][aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText('상따');

    // ② 원 아이콘 묶음 — 라벨은 **묶음에만** 1개. 개별 원은 `aria-hidden` 이다.
    const item = navTree(page).locator('[data-strategy-key]').first();
    const group = item.locator('[role="img"]');
    await expect(group).toHaveCount(1);
    await expect(group).toHaveAttribute('aria-label', '매수 켜짐 · 매도 꺼짐');
    await expect(group).toHaveAttribute('title', '매수 켜짐 · 매도 꺼짐');
    // 항목 안에서 이름을 만드는 요소는 그 묶음 하나뿐이다(중복 낭독 방지).
    await expect(item.locator('[aria-label]')).toHaveCount(1);
    await expect(item.locator('[data-io]')).toHaveCount(2);
    await expect(item.locator('[data-io][aria-hidden="true"]')).toHaveCount(2);
    // 두 번째 항목은 조합이 반대다 — 라벨이 고정 문자열이 아니라 값에서 온다는 증거다.
    await expect(
      navTree(page).locator('[data-strategy-key]').nth(1).locator('[role="img"]'),
    ).toHaveAttribute('aria-label', '매수 꺼짐 · 매도 켜짐');

    // ③ 스위치 3종 — 시각 라벨이 없으므로 `aria-label` 이 유일한 이름이다.
    for (const name of ['매수주문 켜기', '매도주문 켜기', '한방체결 켜기']) {
      await expect(page.getByRole('switch', { name, exact: true })).toHaveCount(1);
    }

    // ④ 상태줄은 `aria-live="polite"` — 포커스를 뺏지 않고 갱신을 알린다.
    await expect(page.locator('[data-slot="lc-status-bar"]')).toHaveAttribute(
      'aria-live',
      'polite',
    );

    // ⑤ ★ 호가 사다리는 **포커스 대상이 아니다**(§키보드 접근성). 가격 클릭·비교가격 자동
    //    채움이 없어졌으므로 roving tabindex 도 두지 않는다 — 탭 순서에 호가 셀이 0개다.
    await expect(
      page.locator('[data-slot="orderbook-ladder"][data-variant="chaser"]'),
    ).toHaveCount(1);
    expect(
      await tabbablesIn(page, '[data-slot="orderbook-ladder"][data-variant="chaser"]'),
    ).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  test('/trading/limit-chaser (모바일 390) — 탭 2종 · 비활성 pane 비가시 · 액션 바 `role="status"`', async ({
    page,
  }) => {
    await page.setViewportSize(A11Y_MOBILE_VIEWPORT);
    await page.goto(
      `/trading/limit-chaser/${encodeURIComponent(`${E2E_ISIN}:${E2E_ACCOUNT_NO}:KRX`)}`,
    );
    await expect(page.locator('[data-slot="lc-status-bar"]')).toHaveAttribute(
      'data-status',
      'ready',
      { timeout: 30_000 },
    );
    await expect(page.locator('#lc-buy-watch-qty')).toHaveValue('10,000', { timeout: 15_000 });

    const blocking = await scanSurface(page);
    expect(
      blocking,
      `critical/serious 위반 ${blocking.length}건\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);

    // ⑥ 모바일 탭 — `role="tablist"` + `aria-selected` + 비활성 pane 은 보이지 않는다.
    const tablist = page.locator('[data-slot="limit-chaser-form"] [role="tablist"]');
    await expect(tablist).toHaveAttribute('aria-label', '주문 설정');
    await expect(tablist.getByRole('tab')).toHaveCount(2);
    await expect(page.getByRole('tab', { name: '매수' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: '매도' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    /*
      ★ 260912-k2x — 숨김이 DOM **속성**에서 **CSS 클래스**로 옮겨졌으므로 단언도
        가시성으로 옮긴다. **성질은 같다** — `toBeHidden()` 은 `display:none` 을 그대로
        잡고(Playwright 의 가시성 판정이 계산된 스타일을 본다), `display:none` 은 접근성
        트리에서도 빠지므로 「안 보이는 폼을 스크린리더가 읽지 않는다」는 계약이 그대로다.
        판정 기준이 뷰포트가 아니라 본문 폭이 된 이유는 `styles/globals.css` §2.2b 에 있다.
      ★ 여기서 `hidden` **속성**으로 되돌리면 같은 파일의 `[hidden]{display:none!important}`
        (globals.css) 가 `@min-[700px]/lc:block` 을 이겨, 컴팩트 이상에서 두 pane 을 나란히
        세울 수 없게 된다. 단언을 맞추려고 화면을 되돌리는 자리가 정확히 여기다.
      ★ 두 pane 은 각각 **한 요소**로 해석돼야 한다(폼이 여러 벌 렌더되면 `toBeHidden()` 이
        개수 단언과 다른 방식으로 실패한다). 그 사실을 먼저 센다.
    */
    await expect(page.locator('[data-pane="buy"]')).toHaveCount(1);
    await expect(page.locator('[data-pane="sell"]')).toHaveCount(1);
    await expect(page.locator('[data-pane="buy"]')).toBeVisible();
    await expect(page.locator('[data-pane="sell"]')).toBeHidden();
    // 숨김은 곧 **탭 순서 제외**다. 숨김이 시각 효과로만 남으면 여기서 깨진다.
    expect(await tabbablesIn(page, '[data-pane="sell"]')).toEqual([]);
    expect((await tabbablesIn(page, '[data-pane="buy"]')).length).toBeGreaterThan(0);

    // 탭을 바꾸면 가시성도 반대로 간다 — 한쪽만 거는 구현을 잡는다.
    await page.getByRole('tab', { name: '매도' }).click();
    await expect(page.locator('[data-pane="buy"]')).toBeHidden();
    await expect(page.locator('[data-pane="sell"]')).toBeVisible();
    // 탭 순서도 함께 뒤집힌다 — 가시성만 뒤집히고 포커스가 남는 구현을 잡는다.
    expect(await tabbablesIn(page, '[data-pane="buy"]')).toEqual([]);
    expect((await tabbablesIn(page, '[data-pane="sell"]')).length).toBeGreaterThan(0);

    /*
      ⑤-b ★ 모바일 호가는 **340px** 안에서 20행을 스크롤한다. 「사다리는 포커스 대상이
        아니다」가 금지한 것은 **호가 셀(행)의 roving tabindex** 이지 스크롤 영역이
        아니다 — 영역이 포커스를 못 받으면 키보드만 쓰는 사용자는 매수 10단에 영원히
        닿지 못한다(WCAG 2.1.1 · axe `scrollable-region-focusable`).

        ★ 260911-w5h — 사다리 아래 **compact 체결 테이프**가 들어오면서 같은 조건의 스크롤
          영역이 하나 더 생겼다(`tape-scroll`, 200px 상한). 둘 다 안에 상시 포커스 가능한
          자식이 없다. 그래서 탭으로 닿는 것은 **그 두 스크롤 영역뿐**이다 — 0 도 아니고
          행 수만큼도 아니다. 순서는 DOM 순서(사다리 → 테이프)를 따른다.
    */
    const ladderTabbables = await tabbablesIn(
      page,
      '[data-slot="orderbook-ladder"][data-variant="chaser"]',
    );
    expect(ladderTabbables).toEqual(['div[ladder-scroll]', 'div[tape-scroll]']);
    await expect(
      page.locator('[data-slot="ladder-scroll"]:visible'),
    ).toHaveAttribute('tabindex', '0');
    // 행에는 tabindex 가 없다 — 여기 하나라도 붙으면 위 목록이 늘어난다.
    await expect(
      page.locator('[data-slot="orderbook-ladder"][data-variant="chaser"] li[tabindex]'),
    ).toHaveCount(0);

    // ⑦ 더티 액션 바 — `role="status"` + `aria-live="polite"`. **포커스를 빼앗지 않는다.**
    await page.getByRole('tab', { name: '매수' }).click();
    await page.locator('#lc-buy-watch-qty').fill('8000');
    const bar = page.locator('[data-slot="dirty-action-bar"]');
    await expect(bar).toHaveAttribute('role', 'status');
    await expect(bar).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#lc-buy-watch-qty')).toBeFocused();
  });

  // ─────────────────────────────────────────────────────────────────────────
  test('/trading/vi — 위반 0 + 데드라인 `progressbar` · `confirm_locked` 탭 제외 · 실패 `role="alert"`', async ({
    page,
  }) => {
    await page.goto('/trading/vi');
    await expect(page.locator('[data-slot="vi-status-bar"]')).toHaveAttribute(
      'data-status',
      'ready',
      { timeout: 30_000 },
    );
    await expect(
      page.locator('[data-slot="vi-order-table"] [data-slot="vi-order-row"]'),
    ).toHaveCount(3, { timeout: 15_000 });

    const blocking = await scanSurface(page);
    expect(
      blocking,
      `critical/serious 위반 ${blocking.length}건\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);

    // ⑧ 상태줄 `aria-live="polite"`.
    await expect(page.locator('[data-slot="vi-status-bar"]')).toHaveAttribute(
      'aria-live',
      'polite',
    );

    // ⑨ ★ `confirm_locked` · 접수 전(주문번호 없음) 행의 확인 체크는 **탭에서 빠진다**.
    //    3행 중 열리는 것은 1행뿐이다. 이 체크는 119초 자동취소 면제라 되돌릴 수 없다.
    const checks = page.locator('[data-slot="vi-order-table"]').getByRole('checkbox');
    await expect(checks).toHaveCount(3);
    await expect(checks.nth(0)).toBeEnabled();
    await expect(checks.nth(1)).toBeDisabled();
    await expect(checks.nth(1)).toHaveAttribute('aria-disabled', 'true');
    await expect(checks.nth(2)).toBeDisabled();
    const tabbableChecks = (await tabbablesIn(page, '[data-slot="vi-order-table"]')).filter((d) =>
      d.startsWith('button[checkbox]'),
    );
    expect(tabbableChecks).toHaveLength(1);

    // ⑩ 데드라인 진행바 — `role="progressbar"` + `aria-valuenow/min/max`.
    //    (카드 트리는 ≥1280 에서 숨지만 속성을 만드는 조각은 표와 공유한다.)
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
    const progress = page.locator('[data-slot="vi-order-cards"] [role="progressbar"]').first();
    await expect(progress).toHaveAttribute('aria-label', '110초 자동취소까지 남은 시간', {
      timeout: 15_000,
    });
    await expect(progress).toHaveAttribute('aria-valuemin', '0');
    await expect(progress).toHaveAttribute('aria-valuemax', '110');
    const valueNow = Number(await progress.getAttribute('aria-valuenow'));
    expect(valueNow).toBeGreaterThan(0);
    expect(valueNow).toBeLessThanOrEqual(110);

    // ⑪ 반영 실패는 `role="alert"` — 상태(`status`)가 아니라 경보다.
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

    // 경보가 뜬 상태도 위반 0 이어야 한다 — 실패 표시는 대비비가 깨지는 대표 자리다.
    const afterAlert = await scanSurface(page);
    expect(
      afterAlert,
      `critical/serious 위반 ${afterAlert.length}건\n${JSON.stringify(afterAlert, null, 2)}`,
    ).toEqual([]);
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
