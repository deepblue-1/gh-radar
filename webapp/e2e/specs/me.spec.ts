import { test, expect, type Locator, type Page } from '@playwright/test';

import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';
import {
  DMA_MSG,
  E2E_ACCOUNT_NO,
  E2E_ISIN,
  E2E_LONG_NAME_ISIN,
  withLocalRelay,
  type LocalRelay,
} from '../fixtures/relay';
import { buildSetVITriggerRespFrame } from '../../../relay/tests/helpers/frames.js';

/**
 * Phase 16 Plan 15 Task 3 — My page E2E (MYPAGE-01 · UI-SPEC C1~C7 · D-09/D-19/D-20/D-21).
 *
 * ① 무엇을 증명하는가
 *   RTL 은 `useRelayContext` 를 스텁으로 갈아끼우고 카드 **구조**만 본다. 여기서 보는 것은
 *   그 앞단이다 — **진짜 브라우저가 진짜 relay 에 붙어** 전략 스냅샷과 계좌 상태를 받고
 *   나서야 화면이 서는지, 「전체 비활성화」가 정말 게이트웨이까지 `DisableStrategiesReq(14)`
 *   로 나가는지, 그 뒤 60/61 에코로 배지가 꺼지는지다. 이 경로는 단위로 쪼개면 각 조각이
 *   통과하면서 이어 붙였을 때 안 되는 대표 구간이다.
 *
 * ② ★ 계좌가 2개다 — 이 spec 의 존재 이유 절반이 여기 있다 (D-21)
 *   relay 는 계좌마다 `acct` 프레임을 한 벌씩 내려보낸다. 브라우저가 그중 마지막 한 건만
 *   들고 있으면 계좌 A 카드가 「미체결 없음」이라고 **거짓말**한다. 케이스 1 이 두 카드에
 *   각자의 주문번호가 들어 있는지 본다 — 단위 테스트는 이 결손을 못 잡는다(스텁이 이미
 *   맵을 들고 있기 때문이다).
 *
 * ③ 왜 serial + 단일 relay 인가
 *   relay wss 는 8090 **고정**이다(픽스처 상단 ④). `beforeAll` 한 번만 띄우고 파일 내부를
 *   직렬로 고정한다. 파일 **간** 충돌은 `playwright.config.ts` 의 단일 워커가 막는다.
 *
 * ④ 잘림 단언은 **잎이 아니라 그리드 자식**을 잰다 (R4)
 *   `.rlist` 카드 행에서는 `overflow-hidden` 이 넘침을 삼켜 행 폭·`scrollWidth` 가 조용해서
 *   잎 요소의 `right` 를 대조해야 한다(16-10 실측). 데스크톱 2열의 고장 모양은 다르다 —
 *   `min-width:0` 이 빠지면 **그리드 자식이 표의 콘텐츠 최소폭만큼 부풀어** 카드 밖으로
 *   밀려난다. 그래서 여기서는 미체결/잔고 **섹션 박스**와 그 안의 스크롤 컨테이너
 *   (`.tbl-wrap`)가 카드 오른쪽 끝을 넘지 않는지를 잰다. 표 자체의 가로 스크롤은
 *   설계된 동작이므로 위반이 아니다.
 */

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

/** 두 번째 계좌. 로그인 응답의 계좌 목록과 계좌 상태 프레임이 같은 값을 써야 한다. */
const ACCOUNT_B = '1234567802';

const ACCOUNTS = [
  { accountNo: E2E_ACCOUNT_NO, name: '위탁종합' },
  { accountNo: ACCOUNT_B, name: '위탁CMA' },
];

/** 이름이 풀리지 않는 ISIN — `stocks` 스텁에 없다. 종목명 폴백(ISIN 표기)을 태운다. */
const UNKNOWN_ISIN = 'KR7035720002';

/**
 * 상따 전략 3건. 계좌를 **둘로 갈라** 두고 무장 조합도 다르게 둔다 — 전부 같으면 계좌·
 * 배지가 잘못 붙어도 눈치채지 못한다.
 */
const CHASERS = [
  {
    isin: E2E_ISIN,
    accountNo: E2E_ACCOUNT_NO,
    exchange: 'KRX',
    buyEnabled: true,
    sellEnabled: false,
  },
  {
    isin: E2E_LONG_NAME_ISIN,
    accountNo: ACCOUNT_B,
    exchange: 'NXT',
    buyEnabled: false,
    sellEnabled: true,
  },
  {
    isin: UNKNOWN_ISIN,
    accountNo: E2E_ACCOUNT_NO,
    exchange: 'KRX',
    buyEnabled: true,
    sellEnabled: true,
  },
] as const;

/** relay 가 파생시키는 전략 키 — `LimitChaser::MakeKey` 와 같은 조립이다. */
const keyOf = (c: (typeof CHASERS)[number]) => `${c.isin}:${c.accountNo}:${c.exchange}`;

const VI_CFG = {
  accountNo: E2E_ACCOUNT_NO,
  orderAmountKrw: 10_000_000n,
  checkRate: 22,
  priceType: 'U',
  run: true,
};

/** 계좌 A 의 미체결·잔고. 주문번호가 카드 귀속의 증거다. */
const ACCOUNT_A_STATE = {
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

/**
 * 계좌 B 의 미체결·잔고 — **스트레스 데이터**다. 긴 종목명 + 7자리 가격 + 6자리 수량이라
 * 「종목명만 신축」·`min-width:0` 규율이 빠지면 이 계좌에서 먼저 넘친다.
 */
const ACCOUNT_B_STATE = {
  accountNo: ACCOUNT_B,
  unfilled: [
    {
      orderNo: '0000135801',
      isin: E2E_LONG_NAME_ISIN,
      side: 'S',
      price: 1_234_567,
      orderQty: 999_999,
      filledQty: 0,
      unfilledQty: 999_999,
      exchange: 'NXT',
    },
  ],
  holdings: [
    { isin: E2E_LONG_NAME_ISIN, stockQty: 999_999, sellableQty: 999_999, avgPrice: 1_234_567 },
  ],
};

/** UI-SPEC 이 기준으로 삼은 모바일 폭(§반응형 "모바일 390px"). */
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

// ---------------------------------------------------------------------------
// 조회구 — 트리를 반드시 좁힌다 (표/카드 두 벌 + 계좌 카드 N벌)
// ---------------------------------------------------------------------------

const page$ = (page: Page) => page.locator('[data-slot="me-page"]');
const strategyCard = (page: Page) => page.locator('[data-slot="strategy-status-card"]');
const strategyRows = (page: Page) => page.locator('[data-slot="strategy-row"]');
const accountCards = (page: Page) => page.locator('[data-slot="me-account-card"]');
const accountCard = (page: Page, accountNo: string) =>
  page.locator(`[data-slot="me-account-card"][data-account-no="${accountNo}"]`);
const desktopNav = (page: Page) => page.locator('aside nav[aria-label="주 메뉴"]');
const disableAllButton = (page: Page) =>
  strategyCard(page).getByRole('button', { name: '전체 비활성화' });

/** 전략 목록이 그려질 때까지 기다린다 = relay 가 `lc.snap` 을 줬다는 동기화 지점이다. */
async function waitForStrategies(page: Page, count: number): Promise<void> {
  await expect(strategyRows(page)).toHaveCount(count, { timeout: 30_000 });
}

/** 계좌 목록이 설 때까지 기다린다 = relay 세션이 `ready` 라는 뜻이다. */
async function waitForAccounts(page: Page, count: number): Promise<void> {
  await expect(accountCards(page)).toHaveCount(count, { timeout: 30_000 });
}

/** 요소의 실측 박스. 없으면 실패시킨다 — null 을 0 으로 뭉개면 단언이 헛돈다. */
async function boxOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; right: number }> {
  const box = await locator.boundingBox();
  expect(box, '요소의 박스를 잴 수 없습니다(렌더되지 않았을 수 있음)').not.toBeNull();
  return { x: box!.x, y: box!.y, width: box!.width, right: box!.x + box!.width };
}

/** 그리드 자식의 **계산된** `min-width`. R4 의 `min-width:0` 필수 규칙을 런타임에서 본다. */
async function computedMinWidth(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).minWidth);
}

// ===========================================================================

test.describe('Phase 16 Plan 15 — My page (로컬 relay)', () => {
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
    /*
      계좌 2개는 **로그인 응답**이 정한다 — relay 는 그 목록을 전부 선언하고 서버 목록과
      대조한 뒤에야 `ready` 로 간다. `reset()` 은 로그인 응답을 되돌리지 않으므로 매번
      명시한다(다음 테스트가 남은 계좌를 보고 통과하지 않게).
    */
    relay.gateway.respondLoginWithAccounts(ACCOUNTS);
    // 전략 시드는 **연결 전에** 심는다 — relay 는 로그인 직후 24/21 을 물어본다.
    relay.seedLimitChasers([...CHASERS]);
    relay.seedViTrigger(VI_CFG);
    await mockStockApi(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
  });

  test('1. 전략 3 · 계좌 2 — 전략 행이 배지·거래소·계좌번호 전체를 보여주고 계좌 카드가 세로로 반복된다', async ({
    page,
  }) => {
    await page.goto('/me');
    await waitForStrategies(page, 3);
    await waitForAccounts(page, 2);

    // 계좌 상태는 **계좌마다 한 프레임씩** 온다.
    await relay.pushAccountState(ACCOUNT_A_STATE);
    await relay.pushAccountState(ACCOUNT_B_STATE);

    // --- 전략 행 (C2) ---
    const first = strategyRows(page).nth(0);
    // 종목명·단축코드는 relay 역매핑(잔고·미체결)에서만 온다 — 계좌 상태 도착 후에 채워진다.
    await expect(first).toContainText('삼성전자', { timeout: 15_000 });
    await expect(first).toContainText('005930');
    await expect(first).toContainText('KRX');
    // ★ 계좌번호는 마스킹 없이 전체 (D2 · S-5).
    await expect(first).toContainText(E2E_ACCOUNT_NO);
    await expect(first).toContainText('매수ON');

    const second = strategyRows(page).nth(1);
    await expect(second).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(second).toContainText('NXT');
    await expect(second).toContainText(ACCOUNT_B);
    await expect(second).toContainText('매도대기');

    // 이름을 못 푸는 ISIN 은 그대로 보여준다 — 지어내지 않는다.
    await expect(strategyRows(page).nth(2)).toContainText(UNKNOWN_ISIN);

    // --- 상태줄 (C1) ---
    const statusBar = page.locator('[data-slot="me-status-bar"]');
    await expect(statusBar).toHaveAttribute('data-status', 'ready');
    await expect(statusBar).toContainText('상따 3건');
    await expect(statusBar).toContainText('계좌 2개');
    await expect(statusBar).toContainText('VI 가동');

    // --- 계좌 카드 (C5 · D-21) ---
    const cardA = accountCard(page, E2E_ACCOUNT_NO);
    const cardB = accountCard(page, ACCOUNT_B);
    await expect(cardA).toContainText('위탁종합');
    await expect(cardB).toContainText('위탁CMA');

    /*
      ★ 계좌마다 **자기 주문**이 들어 있어야 한다. 브라우저가 마지막 `acct` 프레임 하나만
        들고 있으면 여기서 계좌 A 가 「미체결 주문이 없어요」가 된다(=거짓말).
    */
    await expect(cardA).toContainText('0000135742', { timeout: 15_000 });
    await expect(cardA).not.toContainText('0000135801');
    await expect(cardB).toContainText('0000135801');
    await expect(cardB).not.toContainText('0000135742');

    // ★ 계좌 선택 UI 가 없다 (D-21) — 세로 반복이 계좌 구분이다.
    await expect(page$(page).locator('select')).toHaveCount(0);

    // 세로 순서 고정 (D-20): 상태줄 → 전략 현황 → 계좌 A → 계좌 B.
    const ys = await Promise.all(
      [statusBar, strategyCard(page), cardA, cardB].map(async (l) => (await boxOf(l)).y),
    );
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    expect(ys[2]).toBeLessThan(ys[3]);

    // 오늘 주문 이력 표는 v1 미포함(D-20 deferred).
    await expect(page$(page)).not.toContainText('주문 이력');
  });

  test('2. 전략 행 클릭 → 인코딩된 키로 편집 화면으로 이동한다', async ({ page }) => {
    await page.goto('/me');
    await waitForStrategies(page, 3);

    const target = CHASERS[1];
    const expected = `/trading/limit-chaser/${encodeURIComponent(keyOf(target))}`;
    await strategyRows(page).nth(1).click();

    await expect(page).toHaveURL(
      new RegExp(`${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    );
    // My page 본문은 사라진다 — 같은 탭에서 라우팅이 실제로 일어났다.
    await expect(page$(page)).toHaveCount(0);

    /*
      키가 왕복했다는 **화면 밖 증거**: 사이드바 3단에서 그 전략만 활성 표시가 된다.
      편집 폼의 내용은 16-13 소관이라 여기서 단언하지 않는다 — 그 문구를 잠그면 폼이
      들어오는 순간 이 spec 이 애먼 이유로 깨진다.
    */
    await expect(
      desktopNav(page).locator(`[data-strategy-key="${keyOf(target)}"]`),
    ).toHaveAttribute('aria-current', 'page', { timeout: 15_000 });
  });

  test('3. 전략 0 · VI 중지 — 빈 문구 + 「전체 비활성화」 disabled', async ({ page }) => {
    relay.seedLimitChasers([]);
    relay.seedViTrigger(null);

    await page.goto('/me');
    await waitForAccounts(page, 2);

    await expect(strategyCard(page)).toContainText('등록된 상따 전략이 없어요', {
      timeout: 30_000,
    });
    await expect(strategyCard(page)).toContainText(
      '트레이딩 › 상따에서 종목을 고르면 여기에 표시돼요.',
    );
    await expect(strategyRows(page)).toHaveCount(0);
    // 끌 것이 없으면 누를 수 없다 — 반드시 실패하는 버튼을 열어 두지 않는다.
    await expect(disableAllButton(page)).toBeDisabled();
  });

  test('4. 전체 비활성화 — 확인 → msg_type 14 → 60/61 에코로 배지가 꺼진다 (D-09)', async ({
    page,
  }) => {
    await page.goto('/me');
    await waitForStrategies(page, 3);
    await waitForAccounts(page, 2);

    // 사이드바 원 아이콘이 켜져 있는 상태에서 출발한다 (매수 ON 2건).
    const buyDots = desktopNav(page).locator('[data-strategy-key] [data-io="buy"]');
    await expect(buyDots).toHaveCount(3);
    await expect(buyDots.nth(0)).toHaveAttribute('data-on', 'true');

    await disableAllButton(page).click();
    const dialog = page.getByTestId('strategy-disable-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('전략을 전부 비활성화할까요?');
    await expect(dialog).toContainText('상따 3건과 VI 자동매수가 한 번에 꺼져요.');
    await expect(dialog).toContainText(
      '이미 접수된 주문은 취소되지 않아요. 미체결은 아래 표에서 개별 취소해 주세요.',
    );
    // ★ 기본 포커스는 닫기다 — Enter 한 번에 전부 꺼지면 안 된다.
    await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();

    await dialog.getByRole('button', { name: '전체 비활성화' }).click();

    // ★ 게이트웨이까지 실제로 `DisableStrategiesReq(14)` 가 나갔다.
    await expect
      .poll(() => relay.requestLog().includes(DMA_MSG.DisableStrategiesReq), {
        timeout: 15_000,
      })
      .toBe(true);

    /*
      상태는 **60/61 에코로만** 갱신된다(65 는 완료 신호일 뿐 — T-16-07). 서버가 그렇게
      하듯 키별 에코를 먼저 흘린다.
    */
    for (const c of CHASERS) {
      await relay.pushLimitChaserEcho({ ...c, buyEnabled: false, sellEnabled: false });
    }
    const sock = await relay.gateway.waitForConnection(10_000);
    relay.gateway.sendFrame(sock, buildSetVITriggerRespFrame({ ...VI_CFG, run: false }));

    // 카드 요약·VI 행이 꺼진 상태로 바뀐다.
    await expect(strategyCard(page)).toContainText('상따 3 · VI 중지', { timeout: 15_000 });
    await expect(strategyRows(page).nth(0)).not.toContainText('매수ON');
    await expect(strategyRows(page).nth(1)).not.toContainText('매도대기');
    await expect(page.locator('[data-slot="vi-status-summary"]')).toHaveText('—');

    // 사이드바 3단 원 아이콘도 속빔으로 바뀐다(같은 상태의 다른 표면).
    for (let i = 0; i < 3; i += 1) {
      await expect(buyDots.nth(i)).toHaveAttribute('data-on', 'false');
    }

    // 목록 자체는 남는다 — 전체 비활성화는 **삭제가 아니다**.
    await expect(strategyRows(page)).toHaveCount(3);
  });

  test('5. 매핑 없음 — DMA 게이트가 본문을 대체한다 (C6 · T-16-04)', async ({ page }) => {
    relay.clearDmaCredentials();

    await page.goto('/me');
    const gate = page.locator('[data-slot="dma-gate"]');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toHaveAttribute('data-reason', 'unmapped');
    await expect(gate).toContainText('DMA 계정이 연결되지 않았어요');
    await expect(gate).toContainText('전략·잔고·미체결은 증권사 계정이 연결된');
    // 본문이 **대체**된다 — 전략 카드·계좌 카드가 같이 보이지 않는다.
    await expect(page$(page)).toHaveCount(0);
    await expect(accountCards(page)).toHaveCount(0);
  });

  test('6. 비로그인은 middleware 가 막고, 로그인 사용자의 첫 페인트에는 로그인 게이트가 없다', async ({
    browser,
    page,
  }) => {
    /*
      「비로그인 → 로그인 게이트」는 화면에 도달하지 않는다 — middleware 가 먼저
      `/login?next=/me` 로 돌려보낸다(D-10). 도달하지 않는 상태를 단언하면 그것이 곧
      가짜 테스트이므로, **실제 계약**인 리다이렉트를 본다.
    */
    const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guest.newPage();
    await guestPage.goto('/me');
    await expect(guestPage).toHaveURL(/\/login\?next=%2Fme$/);
    await guest.close();

    /*
      반대편 — 로그인 사용자의 **첫 페인트**에 게이트가 섞이면 안 된다.
      `AuthProvider` 는 세션을 읽기 전 `user: null` 이라, 그 순간을 「비로그인」으로 읽으면
      서버가 그린 HTML 에 「로그인이 필요해요」가 통째로 들어간다. 렌더 뒤 단언은 이미
      사라진 뒤라 아무것도 잡지 못하므로 **서버 응답 본문**을 직접 본다(경주 없음).
    */
    const html = await (await page.request.get('/me')).text();
    expect(html).not.toContain('로그인이 필요해요');
    expect(html).toContain('data-slot="me-page"');
  });

  test('7. 데스크톱 1280 — 계좌 카드 내부가 2열이고 카드 밖으로 밀려나는 요소가 없다 (R4)', async ({
    page,
  }) => {
    await page.goto('/me');
    await waitForAccounts(page, 2);
    // 스트레스 데이터가 실린 계좌 B 가 잘림의 시험대다.
    await relay.pushAccountState(ACCOUNT_B_STATE);

    const card = accountCard(page, ACCOUNT_B);
    const unfilled = card.getByTestId('account-unfilled');
    const holdings = card.getByTestId('account-holdings');
    await expect(unfilled.locator('[data-slot="table"]')).toBeVisible({ timeout: 15_000 });

    const cardBox = await boxOf(card);
    const unfilledBox = await boxOf(unfilled);
    const holdingsBox = await boxOf(holdings);

    // 2열 — 같은 행에 나란히 선다(≥1280px, 477/477).
    expect(Math.abs(unfilledBox.y - holdingsBox.y)).toBeLessThanOrEqual(1);
    expect(holdingsBox.x).toBeGreaterThan(unfilledBox.x);

    /*
      ★ `.acct-grid > * { min-width: 0 }` **필수 규칙**을 계산된 값으로 확인한다
        (UI-SPEC R4 · `tasks/lessons.md`). 클래스 문자열이 아니라 computed style 을 보는
        이유는 그것이 실제로 레이아웃을 정하는 값이기 때문이다.
      ※ 지금 마크업에서는 표 컨테이너의 `overflow-x:auto` 가 콘텐츠 최소폭 전파를 막아
        이 값을 지워도 당장은 넘치지 않는다(변이 실측). 그래도 규칙을 명시적으로 잠근다 —
        표를 감싸는 방식이 바뀌는 순간 이 값이 유일한 방어선이 된다.
    */
    expect(await computedMinWidth(unfilled)).toBe('0px');
    expect(await computedMinWidth(holdings)).toBe('0px');

    /*
      ★ 잘림 0. `min-width:0` 이 빠지면 그리드 자식이 표의 콘텐츠 최소폭만큼 부풀어
        카드(`overflow-hidden`) 밖으로 밀려난다 — 스크롤이 아니라 **조용한 잘림**이다.
        `getBoundingClientRect` 는 조상 클리핑에 영향받지 않으므로 밀려난 좌표가 그대로 나온다.
    */
    const overflow = [
      ['미체결 섹션', unfilledBox.right],
      ['잔고 섹션', holdingsBox.right],
    ]
      .map(([label, right]) => ({ label, over: Math.round((right as number) - cardBox.right) }))
      .filter((item) => item.over > 1);
    expect(overflow).toEqual([]);

    // 표의 스크롤 컨테이너도 자기 섹션 안에 들어간다(가로 스크롤은 설계된 동작이다).
    const wrapRight = await boxOf(unfilled.locator('[data-slot="table-container"]').first());
    expect(Math.round(wrapRight.right - unfilledBox.right)).toBeLessThanOrEqual(1);
  });

  test('8. 모바일 390 — 미체결·잔고가 `.rlist` 카드 행이 되고 전략 행 계좌번호가 둘째 줄로 내려간다', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/me');
    await waitForStrategies(page, 3);
    await waitForAccounts(page, 2);
    await relay.pushAccountState(ACCOUNT_B_STATE);

    const card = accountCard(page, ACCOUNT_B);
    await expect(card.locator('[data-slot="account-unfilled-row"]')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(card.locator('[data-slot="account-holding-row"]')).toHaveCount(1);
    // 표는 이 폭에서 보이지 않는다 — 콘텐츠 최소폭이 가용폭을 넘기 때문이다.
    await expect(card.getByTestId('account-unfilled').locator('[data-slot="table"]')).toBeHidden();

    /*
      전략 행은 wrap 되고 계좌번호가 **둘째 줄 전폭**으로 내려간다(C2 · order 9).
      같은 줄에 남으면 첫 줄이 종목명을 잘라먹는다.
    */
    const row = strategyRows(page).nth(1);
    const account = row.locator('[data-slot="strategy-row-account"]');
    const rowBox = await boxOf(row);
    const nameBox = await boxOf(row.locator('span').first());
    const badgeBox = await boxOf(row.locator('[data-slot="strategy-badge"]').last());
    const accountBox = await boxOf(account);

    // 둘째 줄로 내려간다.
    expect(accountBox.y).toBeGreaterThan(nameBox.y);
    /*
      ★ 「둘째 줄」만으로는 부족하다 — 폭이 좁으면 규율이 없어도 자연 wrap 으로 내려가서
        단언이 헛통과한다(변이 실측). `order:9` + 전폭이 만드는 두 가지를 함께 본다:
        배지 **뒤**(=아래)에 오고, 줄 전체를 차지한다.
    */
    expect(accountBox.y).toBeGreaterThan(badgeBox.y);
    expect(accountBox.width).toBeGreaterThan(rowBox.width * 0.8);

    // `.rlist` 행의 잎 요소가 목록 밖으로 밀려나지 않는다 (16-10 실측 규율).
    const list = card.locator('[data-slot="account-unfilled-list"]');
    const listRight = (await boxOf(list)).right;
    const overflowing = await card
      .locator('[data-slot="account-unfilled-row"]')
      .first()
      .evaluate(
        (el, right) =>
          Array.from(el.querySelectorAll<HTMLElement>('*'))
            .map((child) => ({
              text: (child.textContent ?? '').slice(0, 24),
              // 1px 은 소수점 레이아웃 반올림 여유다.
              over: Math.round(child.getBoundingClientRect().right - right),
            }))
            .filter((item) => item.over > 1),
        listRight,
      );
    expect(overflowing).toEqual([]);
  });
});
