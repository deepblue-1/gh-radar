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

/**
 * 오늘 주문 3건 — **접수 2 · 취소 1** (RELAY-02 / D-24).
 *
 * ★ 취소 1건이 이 픽스처의 존재 이유다. 「오늘 낸 주문 전체」를 미체결 목록으로는 담을 수
 *   없다는 것이 이 카드가 별도 표면인 이유인데(me-client 헤더 ⑤ ⓒ), 취소 행이 없으면
 *   그 구조적 결손을 spec 이 통과시켜 버린다.
 */
const TODAY_ORDERS = [
  {
    id: 'ord-a',
    accountNo: E2E_ACCOUNT_NO,
    isin: E2E_ISIN,
    stockCode: '005930',
    exchange: 'KRX',
    market: 'K',
    side: 'B',
    orderType: 'N',
    orgOrderNo: null,
    qty: 10,
    price: 70_000,
    orderNo: '0000900001',
    status: 'accepted',
    resultCode: 0,
    noticeType: 'A',
    message: null,
    filledQty: 0,
    origin: 'manual',
    createdAt: '2026-09-10T00:10:00.000Z',
    updatedAt: '2026-09-10T00:10:00.000Z',
  },
  {
    id: 'ord-b',
    accountNo: ACCOUNT_B,
    isin: E2E_LONG_NAME_ISIN,
    stockCode: '000660',
    exchange: 'NXT',
    market: 'K',
    side: 'S',
    orderType: 'N',
    orgOrderNo: null,
    qty: 3,
    price: 180_000,
    orderNo: '0000900002',
    status: 'accepted',
    resultCode: 0,
    noticeType: 'A',
    message: null,
    filledQty: 0,
    origin: 'limit_chaser',
    createdAt: '2026-09-10T00:20:00.000Z',
    updatedAt: '2026-09-10T00:20:00.000Z',
  },
  {
    id: 'ord-c',
    accountNo: E2E_ACCOUNT_NO,
    isin: E2E_ISIN,
    stockCode: '005930',
    exchange: 'KRX',
    market: 'K',
    side: 'B',
    orderType: 'C',
    orgOrderNo: '0000900001',
    qty: 10,
    price: 70_000,
    orderNo: '0000900003',
    status: 'cancelled',
    resultCode: 0,
    noticeType: 'C',
    message: null,
    filledQty: 0,
    origin: 'manual',
    createdAt: '2026-09-10T00:30:00.000Z',
    updatedAt: '2026-09-10T00:30:00.000Z',
  },
];

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
const todayOrdersCard = (page: Page) => page.locator('[data-slot="today-orders-card"]');
/** 모바일 카드 행만 센다 — 표 행은 같은 정보를 CSS 로 가려 둔 한 벌이다. */
const todayOrderRows = (page: Page) => page.locator('[data-slot="today-order-row"]');
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

/** 주문 복원 라우트로 실제로 나간 HTTP 메서드. 핸들러는 기록만 하고 단언은 케이스가 한다. */
const ordersRequestMethods: string[] = [];

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
    /*
      「오늘 주문」 복원 라우트(`GET /api/orders`, bare array).
      ★ 단언은 핸들러 **밖**에서 한다 — 핸들러 안에서 expect 가 던지면 라우트가 영영
        fulfill 되지 않아 실패가 아니라 **타임아웃**으로 나타나고, 원인이 가려진다.
        여기서는 메서드를 기록만 하고 케이스에서 대조한다(D-02: 이 경로로 주문은 나가지 않는다).
    */
    ordersRequestMethods.length = 0;
    await page.route('**/api/orders', async (route) => {
      ordersRequestMethods.push(route.request().method());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TODAY_ORDERS),
      });
    });
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

    /*
      ★ 오늘 주문 카드 (RELAY-02 / D-24) — **D-20 의 v1 유예를 명시적으로 되돌렸다.**
        이 자리에 있던 「주문 이력 표는 v1 미포함」 부재 단언을 존재 단언으로 바꿨다
        (quick-260910-jce). me-client 헤더 ⑤ 도 같은 커밋에서 다시 썼다 — 파일과 spec 이
        서로 다른 말을 하는 상태를 남기지 않는다.
    */
    const ordersCard = todayOrdersCard(page);
    await expect(ordersCard).toBeVisible();
    await expect(todayOrderRows(page)).toHaveCount(3, { timeout: 15_000 });
    // 취소된 주문은 미체결 목록에 없다 — 이 표면만이 그 행을 담는다.
    await expect(ordersCard).toContainText('0000900003');
    await expect(ordersCard).toContainText('취소');
    /*
      ★ 종목명 (quick-260910-kql) — **라벨용 라우트 스텁이 없는 것이 정상이다.**
        `useIsinLabels` 는 `useRelayContext()` 밖을 보지 않는다 — 이름 때문에 나가는
        REST·Supabase 호출이 **존재하지 않는다**(T-16-02). 이름은 relay 가 `acct` 프레임에
        실어 보내고, 그 이름의 원천은 이미 스텁된 `/rest/v1/stocks`(`E2E_STOCK_ROWS`)를
        relay 의 `SymbolMap` 이 푼 값이다. 여기서 없는 스텁을 찾지 말 것.
      ★ 이름과 코드를 **함께** 단언한다 — 이름만 보면 식별자가 사라진 회귀를 통과시킨다.
    */
    await expect(ordersCard).toContainText('삼성전자', { timeout: 15_000 });
    await expect(ordersCard).toContainText('005930');
    await expect(ordersCard).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(ordersCard).toContainText('000660');
    // 이 경로로는 **읽기만** 나간다 (D-02 — 주문 접수는 wss 단일 경로다).
    expect(ordersRequestMethods.length).toBeGreaterThan(0);
    expect([...new Set(ordersRequestMethods)]).toEqual(['GET']);

    // 세로 순서 고정 (D-20 + jce): 상태줄 → 전략 현황 → 계좌 A → 계좌 B → 오늘 주문.
    const ys = await Promise.all(
      [statusBar, strategyCard(page), cardA, cardB, ordersCard].map(
        async (l) => (await boxOf(l)).y,
      ),
    );
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    expect(ys[2]).toBeLessThan(ys[3]);
    expect(ys[3]).toBeLessThan(ys[4]);
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

  test('8. 모바일 390 — 미체결·잔고가 `.rlist` 카드 행이 되고 전략 행이 2줄이다', async ({
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
      전략 행은 **2줄 flex-col** 이다(C2 · 260911-w5h). r1 = 종목명 + 상태 배지 + 화살표,
      r2(`strategy-row-meta`) = `{코드} · {거래소} · {계좌번호}`. 계좌번호가 첫 줄에 남으면
      그 줄이 종목명을 잘라먹는다.
      ★ 옛 구조(`flex-wrap` + `order:9` + `w-full`)에서는 계좌번호 `<span>` **자신**이
        전폭이었다. 2줄 구조에서 계좌번호는 둘째 **줄 안의 한 조각**이므로, 전폭을 재는
        대상을 조각에서 **줄 자체**(`strategy-row-meta`)로 옮긴다.
      ★ `nameBox`/`badgeBox` 비교는 **그대로 남긴다** — 폭이 좁으면 규율이 없어도 자연
        wrap 으로 내려가 「둘째 줄」 단언이 헛통과하므로(변이 실측), 배지 **뒤**(=아래)에
        온다는 사실이 그 헛통과를 막는다.
      ★ 인덱스 1 을 쓰는 이유: `strategy-badge` 를 `.last()` 로 짚으므로 그 행에 상태
        배지가 **하나라도** 있어야 한다. 거래소 배지가 빠지면서 배지 0개 행이 생길 수
        있는데, 이 fixture 의 2번째 전략은 「매도대기」 배지를 갖는다(아래 단언이 그것을
        먼저 확인한다).
    */
    const row = strategyRows(page).nth(1);
    const meta = row.locator('[data-slot="strategy-row-meta"]');
    const account = row.locator('[data-slot="strategy-row-account"]');
    await expect(row.locator('[data-slot="strategy-badge"]')).not.toHaveCount(0);
    const rowBox = await boxOf(row);
    const nameBox = await boxOf(row.locator('span').first());
    const badgeBox = await boxOf(row.locator('[data-slot="strategy-badge"]').last());
    const accountBox = await boxOf(account);
    const metaBox = await boxOf(meta);

    // 둘째 줄로 내려간다.
    expect(accountBox.y).toBeGreaterThan(nameBox.y);
    expect(accountBox.y).toBeGreaterThan(badgeBox.y);
    // 그 줄이 행 폭의 대부분을 차지한다.
    expect(metaBox.width).toBeGreaterThan(rowBox.width * 0.8);

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

    /*
      「오늘 주문」 카드도 **같은 자**로 잰다 (quick-260910-kql). 위에서 `ACCOUNT_B_STATE` 를
      밀었으므로 `E2E_LONG_NAME_ISIN` 의 긴 종목명이 `ord-b` 행에 실제로 렌더된다 —
      스트레스 데이터의 존재 이유가 그것이다. 행이 아니라 **잎**을 재는 것이 핵심이다
      (위 헤더 ④): 행은 `overflow-hidden` 이라 폭·`scrollWidth` 가 조용하다.
      대상 행은 주문번호로 좁힌다 — `nth(0)` 은 정렬이 바뀌면 애먼 행을 잰다.
    */
    const orderList = page.locator('[data-slot="today-orders-list"]');
    const longOrderRow = todayOrderRows(page).filter({ hasText: '0000900002' });
    await expect(longOrderRow).toHaveCount(1, { timeout: 15_000 });
    // 이름이 실제로 실렸는지 먼저 본다 — 안 실리면 잘림 단언이 헛통과한다.
    await expect(longOrderRow).toContainText('한국제7호기업인수목적우선주식회사');
    const orderListRight = (await boxOf(orderList)).right;
    const orderOverflowing = await longOrderRow.evaluate(
      (el, right) =>
        Array.from(el.querySelectorAll<HTMLElement>('*'))
          .map((child) => ({
            text: (child.textContent ?? '').slice(0, 24),
            // 1px 은 소수점 레이아웃 반올림 여유다(위 블록과 같은 값).
            over: Math.round(child.getBoundingClientRect().right - right),
          }))
          .filter((item) => item.over > 1),
      orderListRight,
    );
    expect(orderOverflowing).toEqual([]);
  });
});
