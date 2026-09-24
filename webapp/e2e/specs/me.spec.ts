import { test, expect, type Locator, type Page } from '@playwright/test';
import { kstDateIso, type JournalOrderRow } from '@gh-radar/shared';

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
import { leavesOverflowing } from '../overflow';
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
 * ★ 모양은 Phase 19 저널 행(`JournalOrderRow`) 이다 — server `GET /api/orders` 가 19-04 부터
 *   이 모양을 돌려준다.
 *
 * Phase 19-08 (B′ · D-07 · D-08) 로 두 계좌에 걸친 9행(화면 6줄)으로 넓혔다:
 *   계좌 A(위탁종합) — 수동 KRX 매수(ord-a) · 그 취소(ord-c) · 로컬 거부(ord-e · 주문번호·수량·가격
 *     모름) · **상따 NXT 매도 조각 체결 4건**(ord-d1~d4 → 한 줄 `#0000900010~0000900013 (4건)`).
 *     묶인 줄이 390px ②줄 줄바꿈의 시험대다 — 주문번호 범위 + 가격 범위 + (4건)이 한 줄에 못 든다.
 *   계좌 B(위탁CMA) — 긴 종목명 행(ord-b · 출처 미상 `origin: null` = 칩 생략 대상, D-08 보충) ·
 *     VI KRX 매수(ord-f).
 *   ★ 가장 최신 행(ord-f)이 **계좌 B** 다 — 첫 등장 순으로 묶으면 B 가 먼저 서므로, 묶음이
 *     relay 계좌 목록 순(A → B)으로 선다는 단언이 헛통과하지 않는다.
 *   ★ NXT 는 ord-d 한 종류뿐이다(태그 1개 단언).
 */
const TODAY = kstDateIso();

/** 계좌 저널 행 한 줄 — 새 B′ 픽스처 행의 공통 기본값. 기존 3행은 원문 그대로 둔다. */
function journalRow(over: Partial<JournalOrderRow> & Pick<JournalOrderRow, 'id'>): JournalOrderRow {
  return {
    tradeDate: TODAY,
    accountNo: E2E_ACCOUNT_NO,
    isin: E2E_ISIN,
    stockCode: '005930',
    exchange: 'KRX',
    board: null,
    side: 'B',
    orderType: 'N',
    orgOrderNo: null,
    qty: 10,
    price: 70_000,
    orderNo: null,
    status: 'accepted',
    resultCode: 0,
    noticeType: 'A',
    message: null,
    filledQty: 0,
    modifiedQty: 0,
    origin: 'manual',
    requester: null,
    requestKind: 'New',
    lastSeq: 1,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    ...over,
  };
}

/** 상따 NXT 매도 조각 체결 4건 — 1초 간격이라 3초 창 안에서 한 줄로 묶인다. */
const MERGED_FILLS: JournalOrderRow[] = [0, 1, 2, 3].map((i) =>
  journalRow({
    id: `ord-d${i + 1}`,
    exchange: 'NXT',
    side: 'S',
    orderNo: `00009000${10 + i}`,
    qty: 10,
    price: 71_000 + i * 100,
    status: 'filled',
    filledQty: 10,
    noticeType: 'E',
    origin: 'limit_chaser',
    lastSeq: 10 + i,
    createdAt: `2026-09-10T00:40:0${i}.000Z`,
    updatedAt: `2026-09-10T00:40:0${i}.000Z`,
  }),
);
/** 묶인 줄의 주문번호 표기 — `mergeOrderNotices` 의 `#첫번호~끝번호`. */
const MERGED_ORDER_NO = '#0000900010~0000900013';
/** 묶음의 첫 통보 시각(00:40:00Z)을 KST 로 읽은 값 — 카드 `KST_TIME` 과 같은 표기. */
const MERGED_AT_KST = '09:40:00';

const TODAY_ORDERS: JournalOrderRow[] = [
  {
    id: 'ord-a',
    tradeDate: TODAY,
    accountNo: E2E_ACCOUNT_NO,
    isin: E2E_ISIN,
    stockCode: '005930',
    exchange: 'KRX',
    board: null,
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
    modifiedQty: 0,
    origin: 'manual',
    requester: null,
    requestKind: 'New',
    lastSeq: 1,
    createdAt: '2026-09-10T00:10:00.000Z',
    updatedAt: '2026-09-10T00:10:00.000Z',
  },
  {
    id: 'ord-b',
    tradeDate: TODAY,
    accountNo: ACCOUNT_B,
    isin: E2E_LONG_NAME_ISIN,
    stockCode: '000660',
    exchange: 'KRX',
    board: null,
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
    modifiedQty: 0,
    origin: null,
    requester: null,
    requestKind: 'New',
    lastSeq: 2,
    createdAt: '2026-09-10T00:20:00.000Z',
    updatedAt: '2026-09-10T00:20:00.000Z',
  },
  {
    id: 'ord-c',
    tradeDate: TODAY,
    accountNo: E2E_ACCOUNT_NO,
    isin: E2E_ISIN,
    stockCode: '005930',
    exchange: 'KRX',
    board: null,
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
    modifiedQty: 0,
    origin: 'manual',
    requester: null,
    requestKind: 'Cancel',
    lastSeq: 3,
    createdAt: '2026-09-10T00:30:00.000Z',
    updatedAt: '2026-09-10T00:30:00.000Z',
  },
  // 로컬 거부 — 게이트웨이까지 못 가 주문번호·수량·가격을 모른다(D-08: 「—」).
  journalRow({
    id: 'ord-e',
    qty: null,
    price: null,
    status: 'rejected',
    noticeType: 'R',
    resultCode: 804,
    lastSeq: 4,
    createdAt: '2026-09-10T00:35:00.000Z',
    updatedAt: '2026-09-10T00:35:00.000Z',
  }),
  ...MERGED_FILLS,
  // 계좌 B 의 VI 매수 — 가장 최신 행이다(위 ★).
  journalRow({
    id: 'ord-f',
    accountNo: ACCOUNT_B,
    isin: UNKNOWN_ISIN,
    stockCode: '035720',
    orderNo: '0000900020',
    qty: 7,
    price: 52_300,
    origin: 'vi',
    lastSeq: 20,
    createdAt: '2026-09-10T00:50:00.000Z',
    updatedAt: '2026-09-10T00:50:00.000Z',
  }),
];

/** 화면 줄 수 — 조각 체결 4건이 한 줄로 접혀 9행이 6줄이 된다. */
const TODAY_ORDER_LINES = 6;

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
    await expect(todayOrderRows(page)).toHaveCount(TODAY_ORDER_LINES, { timeout: 15_000 });
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

  test('2. 전략 행 클릭 → 인코딩된 키로 /trading?focus= 로 이동하고 그 카드가 펼쳐진다 (Phase 18 D-02)', async ({
    page,
  }) => {
    await page.goto('/me');
    await waitForStrategies(page, 3);

    const target = CHASERS[1];
    await strategyRows(page).nth(1).click();

    /*
      ★ Phase 18 — 옛 편집 화면(`/trading/limit-chaser/{key}`)은 작업대로 합쳐졌다. 링크 헬퍼
        (`limitChaserHref`)는 이름 그대로 본문만 `/trading?focus=` 가 됐고, 카드 구조 단언(1번)은
        그대로다 — 바뀐 것은 **링크 대상**뿐이다.
    */
    await expect(page).toHaveURL(
      (url) => url.pathname === '/trading' && url.searchParams.get('focus') === keyOf(target),
    );
    expect(page.url()).toContain(`focus=${encodeURIComponent(keyOf(target))}`);
    // My page 본문은 사라진다 — 같은 탭에서 라우팅이 실제로 일어났다.
    await expect(page$(page)).toHaveCount(0);

    /*
      키가 왕복했다는 증거: 작업대에서 **그 키의 카드**가 펼쳐진다(세 조각이 전부 풀려야 등록 키와
      맞는다). 활성 표시는 사이드바 「트레이딩」 제목 하나다(18-12 — 3단 항목은 aria-current 없음).
    */
    await expect(
      page.locator(`[data-slot="strategy-card"][data-key="${keyOf(target)}"]`),
    ).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(desktopNav(page).getByRole('link', { name: '트레이딩' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(desktopNav(page).locator('[data-strategy-key][aria-current]')).toHaveCount(0);
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

    /*
      사이드바 3단 매수 LED 가 켜져 있는 상태에서 출발한다.
      ★ Phase 18(18-12) — 원 아이콘 2개(`data-io`)는 LED 3점(`data-led` · `latchLedStateOf` 판정)으로
        바뀌었다. 「같은 상태의 다른 표면」이라는 단언의 의도는 그대로이고 조회구만 옮긴다.
    */
    const buyDots = desktopNav(page).locator('[data-strategy-key] [data-led="buy"]');
    await expect(buyDots).toHaveCount(3);
    await expect(buyDots.nth(0)).not.toHaveAttribute('data-tone', 'off');

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

    // 사이드바 3단에서는 빠진다 — 매수·매도가 둘 다 OFF 인 전략은 사이드바에 싣지 않는다
    // (사용자 결정 2026-09-23). 목록(아래)·서버에는 남아 있다.
    await expect(buyDots).toHaveCount(0);

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
    const longOrderRow = todayOrderRows(page).filter({ hasText: '0000900002' });
    // B′(19-08) 부터 목록이 계좌마다 한 벌이다 — 그 행이 든 목록으로 좁힌다.
    const orderList = page
      .locator('[data-slot="today-orders-list"]')
      .filter({ has: page.locator('[data-slot="today-order-row"]', { hasText: '0000900002' }) });
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
  /*
    ── B′ (Phase 19-08 · D-07 · D-08) ────────────────────────────────────────────
    ※ 「기록 지연」 배지(D-04 (a))는 e2e 대상이 아니다 — 로컬 relay 의 관찰자는 비밀(DMA_OBSERVER_SECRET)
      미주입이라 disabled 이고, disabled 는 `journal.state` 프레임을 내지 않는다(19-07). 표식의 정본은
      단위 테스트 `today-orders-card.test.tsx` ⑫ 다.
  */

  test('9. B′ — 데스크톱 1280: 계좌 순 묶음 · 출처 열 · NXT 태그', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/me');
    await waitForAccounts(page, 2);

    const card = todayOrdersCard(page);
    const groups = card.locator('[data-slot="today-orders-group"]');
    await expect(groups).toHaveCount(2, { timeout: 15_000 });
    // relay 계좌 목록 순(A → B) — 가장 최신 행이 B 인데도 A 가 먼저 선다.
    await expect
      .poll(() => groups.evaluateAll((els) => els.map((el) => el.getAttribute('data-account'))))
      .toEqual([E2E_ACCOUNT_NO, ACCOUNT_B]);

    // 각 묶음 머리 — 계좌 · 번호 전체 · 상품명 · 그 계좌의 묶기 전 행 수.
    const [groupA, groupB] = [groups.nth(0), groups.nth(1)];
    await expect(groupA.locator('[data-slot="today-orders-group-account-no"]')).toHaveText(
      E2E_ACCOUNT_NO,
    );
    await expect(groupB.locator('[data-slot="today-orders-group-account-no"]')).toHaveText(
      ACCOUNT_B,
    );
    await expect(groupA).toContainText('위탁종합');
    await expect(groupA).toContainText('7건');
    await expect(groupB).toContainText('위탁CMA');
    await expect(groupB).toContainText('2건');
    // 헤더 「N건」 은 묶기 전 전체 행 수다.
    await expect(card.locator('h2 + span')).toHaveText(`${TODAY_ORDERS.length}건`);

    // 이 폭에서는 표다 — 묶음마다 표 하나, 「출처」 열이 구분 바로 뒤.
    const tableRows = card.locator('[data-slot="today-order-table-row"]');
    await expect(tableRows).toHaveCount(TODAY_ORDER_LINES);
    await expect(card.locator('[data-slot="today-order-row"]').first()).toBeHidden();
    for (const group of [groupA, groupB]) {
      const heads = await group.locator('th').allTextContents();
      expect(heads.map((h) => h.trim())).toEqual([
        '시각',
        '종목',
        '구분',
        '출처',
        '수량',
        '가격',
        '상태',
        '주문번호',
      ]);
    }

    // NXT 태그 — NXT 행(묶인 상따 매도) 하나에만, 종목 칸 안에.
    const nxtTags = tableRows.locator('[data-slot="exchange-tag"]');
    await expect(nxtTags).toHaveCount(1);
    await expect(nxtTags).toHaveAttribute('data-exchange', 'NXT');
    const mergedRow = tableRows.filter({ hasText: MERGED_ORDER_NO });
    await expect(mergedRow.locator('[data-slot="exchange-tag"]')).toHaveCount(1);
    await expect(mergedRow.locator('[data-slot="today-order-origin"]')).toHaveText('상따');

    // 출처 칩 — 아는 행마다 하나, 미상(ord-b)은 없다(D-08 보충 · T-19-30).
    await expect(
      tableRows.filter({ hasText: '0000900002' }).locator('[data-slot="today-order-origin"]'),
    ).toHaveCount(0);
    await expect(
      tableRows.filter({ hasText: '0000900020' }).locator('[data-slot="today-order-origin"]'),
    ).toHaveText('VI');
    await expect(
      tableRows.filter({ hasText: '0000900001' }).locator('[data-slot="today-order-origin"]'),
    ).toHaveText('수동');
    await expect(tableRows.locator('[data-slot="today-order-origin"]')).toHaveCount(
      TODAY_ORDER_LINES - 1,
    );

    // 「· 수동」 꼬리는 없다 — 칩이 말한다(D-08).
    await expect(card).not.toContainText('· 수동');

    // 로컬 거부 줄 — 주문번호 · 수량 · 가격 자리가 「—」.
    const rejected = tableRows.filter({ hasText: '거부' });
    await expect(rejected).toHaveCount(1);
    const cells = (await rejected.locator('td').allTextContents()).map((t) => t.trim());
    expect([cells[4], cells[5], cells[7]]).toEqual(['—', '—', '—']);
  });

  test('10. B′ — 폰 390: 묶인 행 ②줄 줄바꿈 · 주문번호 비잘림', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/me');
    await waitForAccounts(page, 2);
    // 종목명을 실어 ①줄도 실제 길이로 만든다(삼성전자 · 긴 종목명).
    await relay.pushAccountState(ACCOUNT_A_STATE);
    await relay.pushAccountState(ACCOUNT_B_STATE);

    const card = todayOrdersCard(page);
    await expect(card.locator('[data-slot="today-orders-group"]')).toHaveCount(2, {
      timeout: 15_000,
    });
    await expect(todayOrderRows(page)).toHaveCount(TODAY_ORDER_LINES);
    await expect(card).toContainText('한국제7호기업인수목적우선주식회사', { timeout: 15_000 });

    const mergedRow = todayOrderRows(page).filter({ hasText: MERGED_ORDER_NO });
    await expect(mergedRow).toHaveCount(1);
    const list = page
      .locator('[data-slot="today-orders-list"]')
      .filter({ has: page.locator('[data-slot="today-order-row"]', { hasText: MERGED_ORDER_NO }) });
    const listRight = (await boxOf(list)).right;

    // 주문번호 잎이 목록 오른쪽 끝을 넘지 않는다(잘림 0).
    const orderNo = mergedRow.getByText(MERGED_ORDER_NO, { exact: true });
    const timeLeaf = mergedRow.getByText(MERGED_AT_KST, { exact: true });
    const orderNoBox = await boxOf(orderNo);
    const timeBox = await boxOf(timeLeaf);
    expect(Math.round(orderNoBox.right - listRight)).toBeLessThanOrEqual(1);

    /*
      ②줄이 한 줄보다 크면 주문번호가 **내려갔다**. 이 픽스처(주문번호 범위 + 가격 범위 + (4건))는
      390px 에서 한 줄에 들지 않도록 잡았다 — 줄바꿈이 일어나지 않으면 이 단언 자체가 헛돈다.
    */
    const line2 = mergedRow.locator(':scope > div').nth(1);
    const line2Height = (await line2.boundingBox())!.height;
    const timeHeight = (await timeLeaf.boundingBox())!.height;
    expect(line2Height).toBeGreaterThan(timeHeight * 1.5);
    expect(orderNoBox.y).toBeGreaterThan(timeBox.y);

    // 테스트 8 과 같은 자 — **모든 행**의 잎이 자기 목록 밖으로 밀려나지 않는다.
    const rows = await todayOrderRows(page).all();
    for (const row of rows) {
      const ownList = row.locator('xpath=ancestor::*[@data-slot="today-orders-list"][1]');
      const right = (await boxOf(ownList)).right;
      expect(await leavesOverflowing(row, right)).toEqual([]);
    }
  });
});
