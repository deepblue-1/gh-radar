import { test, expect, type Locator, type Page } from '@playwright/test';
import { kstDateIso, type JournalOrderRow } from '@gh-radar/shared';

import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';
import {
  DMA_MSG,
  E2E_ACCOUNT_NO,
  E2E_ISIN,
  E2E_LONG_NAME_ISIN,
  readSetUserSettingsRequest,
  readViSetRequest,
  withLocalRelay,
  type LocalRelay,
} from '../fixtures/relay';
import { buildSetVITriggerRespFrame } from '../../../relay/tests/helpers/frames.js';
import { leavesOverflowing } from '../overflow';
import {
  BUNDLE_ORDER_NOS,
  BUNDLE_ROWS,
  ROW_12451,
  ROW_12453,
  ROW_MANUAL,
  TIMELINE_BY_ANCHOR,
  orderRow,
} from '@/test-fixtures/order-timeline';

/**
 * Phase 16 Plan 15 Task 3 — My page E2E (MYPAGE-01 · UI-SPEC C1~C7 · D-09/D-19/D-20/D-21).
 *
 * ① 무엇을 증명하는가
 *   RTL 은 `useRelayContext` 를 스텁으로 갈아끼우고 카드 **구조**만 본다. 여기서 보는 것은
 *   그 앞단이다 — **진짜 브라우저가 진짜 relay 에 붙어** 전략 스냅샷과 계좌 상태를 받고
 *   나서야 화면이 서는지, 탭 위 계좌 칩(Phase 32 D-20)을 고르면 현황이 그 계좌로 바뀌는지, 60/61 에코로
 *   배지가 꺼지는지다. 이 경로는 단위로 쪼개면 각 조각이 통과하면서 이어 붙였을 때 안 되는 대표 구간이다.
 *   (끄기 E2E 는 /me 「이 계좌 끄기」 와 함께 32-06 `P32-disable` 이 잇는다 — Phase 32 D-27.)
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
 * ④ 잘림 단언은 **잎이 아니라 섹션 박스**를 잰다 (R4)
 *   `.rlist` 카드 행에서는 `overflow-hidden` 이 넘침을 삼켜 행 폭·`scrollWidth` 가 조용해서
 *   잎 요소의 `right` 를 대조해야 한다(16-10 실측). 데스크톱은 본문 900 폭이라 계좌 카드가
 *   `stack`(미체결 위 · 잔고 아래)이다(quick-260926-o2u) — 2열이면 칸마다 표 영역이 약 419px 로
 *   두 표의 최소폭(439 · 444)보다 좁아 가로 스크롤됐다. 그래서 여기서는 미체결/잔고 **섹션
 *   박스**와 그 안의 스크롤 컨테이너(`.tbl-wrap`)가 카드 오른쪽 끝을 넘지 않는지, 그리고
 *   표가 가로 스크롤 없이 들어가는지를 잰다.
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
 *   ★ 가장 최신 행(ord-f)이 **계좌 B** 다 — Phase 32 D-23 부터 주문 탭은 고른 계좌의 평탄 목록이라
 *     (계좌 묶음 없음) 계좌별 줄 수는 `linesOfAccount` 로 픽스처에서 센다(숫자 하드코딩 금지).
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

/** Phase 32 D-23 — 주문 탭은 고른 계좌의 행만 그린다. 그 계좌의 행(묶기 전). */
const rowsOfAccount = (rows: readonly JournalOrderRow[], acct: string): JournalOrderRow[] =>
  rows.filter((r) => r.accountNo === acct);
/** 그 계좌의 화면 줄 수 = 행 수 − (그 계좌에 든 조각 체결 수 − 1) — 조각 체결(MERGED_FILLS)은 한 줄로 접힌다. */
const linesOfAccount = (rows: readonly JournalOrderRow[], acct: string): number => {
  const mine = rowsOfAccount(rows, acct);
  const fills = mine.filter((r) => MERGED_FILLS.some((m) => m.id === r.id)).length;
  return mine.length - Math.max(0, fills - 1);
};

/**
 * Phase 25 25-08 — 오늘 주문 행 펼침(P25-E) 전용 목록. 기존 `TODAY_ORDERS` 건수 단언(9행 · 6줄)을 흔들지 않게
 * P25-E 케이스만 `**\/api/orders` 를 이 목록으로 덮어쓴다(라우트는 나중에 건 것이 이긴다).
 *
 * 전부 계좌 A · 거래일 = 실행일 KST 오늘. 행 · 타임라인 값은 `@/test-fixtures/order-timeline`(기획서 하루 흐름 ·
 * 채택 목업 EV_12451 · EV_12453 · EV_SELL)과 같다.
 *   12451 선매수(체결) · 12453 후매수(대기 중 취소) · 조각 매도 7건 12461~12467(한 줄 묶음) · 수동 12470(통보만) ·
 *   방향 미상 12490(「주문」 · 응답 0건) · 접수 불명(−2 · 주문번호 없음) · KB 거부 R(New)(주문번호 없음 · 방향 참고).
 */
const onToday = (row: JournalOrderRow): JournalOrderRow => ({ ...row, tradeDate: TODAY });
const P25_UNKNOWN_SIDE = orderRow({
  id: 'ord-12490',
  orderNo: '12490',
  side: null,
  lastSeq: 40,
  createdAt: '2026-09-29T02:20:00.000Z',
  updatedAt: '2026-09-29T02:20:00.000Z',
});
const P25_RECEIPT_UNKNOWN = orderRow({
  id: 'ord-rej-2',
  orderNo: null,
  status: 'rejected',
  noticeType: 'R',
  resultCode: -2,
  lastSeq: 41,
  createdAt: '2026-09-29T02:30:00.000Z',
  updatedAt: '2026-09-29T02:30:00.000Z',
});
const P25_REJECT_NEW = orderRow({
  id: 'ord-rej-new',
  orderNo: null,
  status: 'rejected',
  noticeType: 'R',
  requestKind: 'New',
  resultCode: 1,
  lastSeq: 42,
  createdAt: '2026-09-29T02:40:00.000Z',
  updatedAt: '2026-09-29T02:40:00.000Z',
});
const P25_ORDERS: JournalOrderRow[] = [
  ROW_12451,
  ROW_12453,
  ...BUNDLE_ROWS,
  ROW_MANUAL,
  P25_UNKNOWN_SIDE,
  P25_RECEIPT_UNKNOWN,
  P25_REJECT_NEW,
].map(onToday);
/** 조각 매도 묶음 줄의 주문번호 표기. */
const P25_BUNDLE_NO = '#12461~12467';

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
/** Phase 32 D-20 — /me 탭 위 계좌 칩(radiogroup 「My page 계좌」). */
const accountChips = (page: Page) => page.locator('[data-slot="me-account-chip"]');
const accountChip = (page: Page, accountNo: string) =>
  page.locator(`[data-slot="me-account-chip"][data-account-no="${accountNo}"]`);

/** 전략 목록이 그려질 때까지 기다린다 = relay 가 `lc.snap` 을 줬다는 동기화 지점이다. */
async function waitForStrategies(page: Page, count: number): Promise<void> {
  await expect(strategyRows(page)).toHaveCount(count, { timeout: 30_000 });
}

/**
 * 잔고 탭에 고른 계좌 카드 **1벌**이 설 때까지 기다린다 = relay 세션이 `ready` 이고 그 칩이 골라졌다는 뜻이다
 * (Phase 32 D-22 — 계좌마다 세로로 반복하던 카드는 고른 계좌 한 벌로 바뀌었다).
 */
async function waitForAccountCard(page: Page, accountNo: string): Promise<void> {
  await expect(accountCards(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(accountCards(page)).toHaveAttribute('data-account-no', accountNo, { timeout: 30_000 });
}

/*
  quick-261006-pey D-1 — /me 는 계정 카드 아래 4탭(현황 · 잔고 · 주문 · 설정)이다. 표면이 탭 안으로 옮겨졌으므로
  계좌 카드 · 오늘 주문 · 상따 기본설정 단언은 **그 탭을 연 뒤**에 한다. 숨은 패널(한 번 연 탭 · display:none)은
  박스가 없으므로 boxOf · leavesOverflowing · 스크린샷은 그 표면의 탭이 활성일 때만 쓴다.
*/
const meTabList = (page: Page) => page.getByRole('tablist', { name: 'My page 탭' });
/** 라벨 뒤에 숫자(잔고 N · 주문 N)가 붙으므로 접두 정규식으로 찾는다. */
const meTab = (page: Page, label: string) =>
  meTabList(page).getByRole('tab', { name: new RegExp(`^${label}`) });
/** 탭 라벨 숫자(0 이거나 미방문이면 없다). */
const meTabCount = (page: Page, label: string) => meTab(page, label).locator('[data-slot="me-tab-count"]');

/** 탭을 누르고 URL(`?tab=`) · 선택 상태가 바뀔 때까지 기다린다. */
async function openMeTab(page: Page, label: string, value: string): Promise<void> {
  await meTab(page, label).click();
  await expect(page).toHaveURL(new RegExp(`[?&]tab=${value}(&|$)`));
  await expect(meTab(page, label)).toHaveAttribute('aria-selected', 'true');
}

/**
 * relay 준비 동기점 — 상태줄 ready + 계좌 칩 n개. 상태줄은 현황 탭 안이라 **현황 탭에서만** 쓴다.
 * (옛 계좌 카드 대기가 맡던 「relay 준비」 역할 — 계좌 카드는 이제 잔고 탭에 있다.)
 * Phase 32 — 「계좌 N개」 칸이 사라져 칩 수로 준비를 잰다(칩 줄은 `accounts[]` 수신 뒤에만 선다).
 */
async function waitForReady(page: Page, count: number): Promise<void> {
  const bar = page.locator('[data-slot="me-status-bar"]');
  await expect(bar).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(accountChips(page)).toHaveCount(count, { timeout: 30_000 });
}

/** 요소의 실측 박스. 없으면 실패시킨다 — null 을 0 으로 뭉개면 단언이 헛돈다. */
async function boxOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; right: number }> {
  const box = await locator.boundingBox();
  expect(box, '요소의 박스를 잴 수 없습니다(렌더되지 않았을 수 있음)').not.toBeNull();
  return { x: box!.x, y: box!.y, width: box!.width, right: box!.x + box!.width };
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
    // 14 처리(적용 · 60 에코 · 65)는 P32-disable 만 켠다 — `reset()` 이 되돌리지 않으므로 매번 끈다(기록만 하는 종전 스텁).
    relay.gateway.handleDisableStrategies(null);
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

  test('P32-chips 탭 위 계좌 칩 — 두 계좌 칩 · 기본 첫 칩 · B 를 고르면 현황 전략 1행 · A 로 돌아오면 2행 · 새로고침 뒤 B 유지 · 작업대 기억 키 불변 (D-20 · D-21)', async ({
    page,
  }) => {
    await page.goto('/me');
    // 칩 줄 — `accounts[]` 순(A → B) · 기본 = 첫 칩(기억값 없음).
    await expect(page.getByRole('radiogroup', { name: 'My page 계좌' })).toBeVisible({ timeout: 30_000 });
    await expect(accountChips(page)).toHaveCount(2, { timeout: 30_000 });
    await expect(accountChips(page).nth(0)).toHaveAttribute('data-account-no', E2E_ACCOUNT_NO);
    await expect(accountChips(page).nth(1)).toHaveAttribute('data-account-no', ACCOUNT_B);
    await expect(accountChip(page, E2E_ACCOUNT_NO)).toHaveAttribute('aria-checked', 'true');
    await expect(accountChip(page, ACCOUNT_B)).toHaveAttribute('aria-checked', 'false');

    // 현황 탭 = 고른 계좌(A)의 켜진 전략만 — 2행. B 의 전략은 그리지 않는다.
    await waitForStrategies(page, 2);
    await expect(strategyCard(page)).not.toContainText('한국제7호기업인수목적우선주식회사');

    // B 칩 → 전략 1행(B 의 NXT 전략).
    await accountChip(page, ACCOUNT_B).click();
    await expect(accountChip(page, ACCOUNT_B)).toHaveAttribute('aria-checked', 'true');
    await waitForStrategies(page, 1);
    await expect(strategyRows(page).nth(0)).toContainText('한국제7호기업인수목적우선주식회사', { timeout: 15_000 });

    // 새로고침 — 기기별 기억값이 B 를 다시 고른다.
    await page.reload();
    await expect(accountChips(page)).toHaveCount(2, { timeout: 30_000 });
    await expect(accountChip(page, ACCOUNT_B)).toHaveAttribute('aria-checked', 'true');
    await waitForStrategies(page, 1);

    // 저장 키 — /me 키는 B · 작업대 계좌칸 키는 쓰지 않는다(D-20 「작업대와 따로」).
    const keys = await page.evaluate(() => {
      const out: { me: string | null; trading: string | null } = { me: null, trading: null };
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i) ?? '';
        if (k.startsWith('gh-radar:me-account:')) out.me = window.localStorage.getItem(k);
        if (k.startsWith('gh-radar:trading-account:')) out.trading = window.localStorage.getItem(k);
      }
      return out;
    });
    expect(keys.me).not.toBeNull();
    expect(JSON.parse(keys.me!)).toEqual({ v: 1, accountNo: ACCOUNT_B });
    expect(keys.trading).toBeNull();

    // A 로 돌아오면 2행.
    await accountChip(page, E2E_ACCOUNT_NO).click();
    await expect(accountChip(page, E2E_ACCOUNT_NO)).toHaveAttribute('aria-checked', 'true');
    await waitForStrategies(page, 2);
  });

  test('P32-status 현황 = 고른 계좌 — 상태줄 「상따 N건 · VI」 고른 계좌 기준 · 「계좌 N개」 없음 · VI 행은 등록 계좌에만 · 빈 상태 문구 (D-21)', async ({
    page,
  }) => {
    const statusBar = page.locator('[data-slot="me-status-bar"]');
    const viRow = strategyCard(page).locator('[data-slot="vi-status-row"]');
    const accountEmpty = strategyCard(page).locator('[data-slot="strategy-account-empty"]');

    await page.goto('/me');
    await waitForReady(page, 2);

    // A — VI 등록 계좌(VI_CFG.accountNo = A) · 켜진 전략 2.
    await waitForStrategies(page, 2);
    await expect(statusBar).toContainText('상따 2건');
    await expect(statusBar).toContainText('VI 가동');
    await expect(statusBar).not.toContainText('계좌');
    await expect(viRow).toHaveCount(1);
    await expect(viRow).toContainText('가동');
    await expect(accountEmpty).toHaveCount(0);

    // B — VI 는 A 등록이라 B 에는 VI 행이 없다 · 상태줄 「VI 중지」.
    await accountChip(page, ACCOUNT_B).click();
    await waitForStrategies(page, 1);
    await expect(statusBar).toContainText('상따 1건');
    await expect(statusBar).toContainText('VI 중지');
    await expect(viRow).toHaveCount(0);
    await expect(accountEmpty).toHaveCount(0);

    // B 의 전략이 에코로 꺼지면 — 전략 0 ∧ VI 행 없음 → 「이 계좌에 등록된 전략 없음」.
    await relay.pushLimitChaserEcho({ ...CHASERS[1], buyEnabled: false, sellEnabled: false });
    await expect(accountEmpty).toHaveText('이 계좌에 등록된 전략 없음', { timeout: 15_000 });
    await expect(strategyRows(page)).toHaveCount(0);
    await expect(statusBar).toContainText('상따 0건');
    // 끄기 UI 는 「이 계좌 끄기」 하나뿐(D-27) — 끌 것이 없으면 disabled.
    await expect(strategyCard(page).getByRole('button')).toHaveCount(1);
    await expect(strategyCard(page).getByRole('button', { name: `이 계좌 끄기 — ${ACCOUNT_B}` })).toBeDisabled();

    // A 로 돌아오면 다시 2행 + VI 행.
    await accountChip(page, E2E_ACCOUNT_NO).click();
    await waitForStrategies(page, 2);
    await expect(viRow).toHaveCount(1);
  });

  test('P32-disable 이 계좌 끄기 — 확인 → 게이트웨이 14 가 고른 계좌 키만 · 그 계좌 VI 11 run:false · 대기 잠금 → 완료 신호로 해제 · 그 계좌 전략이 현황 · 사이드바에서 빠지고 다른 계좌 칩의 전략은 그대로 (D-09 · D-21 · S5′)', async ({
    page,
  }) => {
    // 스텁이 14 를 서버처럼 처리한다 — 그 키의 상따 게이트를 내리고 60 에코 → 65.
    relay.gateway.handleDisableStrategies({ apply: true, respond65: true });
    const countOf = (msgType: number) => relay.requestLog().filter((t) => t === msgType).length;
    const killRow = strategyCard(page).locator('[data-slot="strategy-disable-account"]');
    const sidebarStrategies = desktopNav(page).locator('[data-strategy-key]');

    await page.goto('/me');
    await waitForReady(page, 2);
    await waitForStrategies(page, 2);
    // 사이드바 3단은 전 계좌(A 2 · B 1)다.
    await expect(sidebarStrategies).toHaveCount(3, { timeout: 15_000 });

    // kill 줄 — 안내 + 「이 계좌 끄기」 한 줄뿐(D-27).
    await expect(killRow).toContainText(
      '이 계좌의 상따 전략과 VI 자동매수를 한 번에 끕니다. 이미 나간 주문은 취소되지 않아요.',
    );
    const killButton = strategyCard(page).getByRole('button', { name: `이 계좌 끄기 — ${E2E_ACCOUNT_NO}` });
    await expect(killButton).toBeEnabled();
    await killButton.click();

    const dialog = page.getByTestId('strategy-disable-account-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('이 계좌의 전략을 비활성화할까요?');
    await expect(dialog).toContainText('상따 2건과 VI 자동매수가 한 번에 꺼져요.');
    await expect(dialog).toContainText(`${E2E_ACCOUNT_NO} · 위탁종합`);
    // 기본 포커스는 닫기 — Enter 한 번에 꺼지면 안 된다.
    await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();
    await dialog.getByRole('button', { name: '이 계좌 끄기' }).click();

    // 대기 잠금 — 그 계좌 버튼이 잠긴다(완료 신호 전).
    await expect(killRow).toHaveAttribute('data-pending', 'true');
    await expect(killButton).toBeDisabled();

    // 14 는 A 의 켜진 두 키만 건별로 — B 의 키 · 빈 키(전부 정지)는 없다. 스텁 시드로 무엇이 꺼졌는지 본다.
    await expect.poll(() => countOf(DMA_MSG.DisableStrategiesReq), { timeout: 15_000 }).toBe(2);
    await expect(strategyRows(page)).toHaveCount(0, { timeout: 15_000 });
    const seed = relay.gateway.limitChaserSeed();
    const seedOf = (accountNo: string) => seed.filter((c) => c.accountNo === accountNo);
    expect(seedOf(E2E_ACCOUNT_NO)).toHaveLength(2);
    for (const c of seedOf(E2E_ACCOUNT_NO)) {
      expect(c.buyEnabled).toBe(false);
      expect(c.sellEnabled).toBe(false);
    }
    expect(seedOf(ACCOUNT_B)[0]?.sellEnabled).toBe(true);
    // Pitfall 1 — 스위치 off(lc.set 10)로 끄지 않는다(서버가 등록을 지운다).
    expect(relay.requestLog()).not.toContain(DMA_MSG.SetLimitChaserReq);

    // 그 계좌 VI(가동) — 11 run:false 1건. 서버처럼 61 에코를 돌려준다 → relay 가 완료 1건을 낸다.
    await expect.poll(() => countOf(DMA_MSG.SetVITriggerReq), { timeout: 15_000 }).toBe(1);
    const viReq = relay
      .strategyRequests()
      .map((r) => readViSetRequest(r.msgType, r.payload))
      .find((r) => r !== null);
    expect(viReq).toMatchObject({ accountNo: E2E_ACCOUNT_NO, run: false });
    const sock = await relay.userSocket();
    relay.gateway.sendFrame(sock, buildSetVITriggerRespFrame({ ...VI_CFG, run: false }));

    // 완료 신호로 대기가 풀린다(8초 백스톱 문구 없음) — 끌 것이 없어 버튼은 비활성으로 남는다.
    await expect(killRow).not.toHaveAttribute('data-pending', 'true', { timeout: 7_000 });
    await expect(strategyCard(page).locator('[data-slot="strategy-disable-account-error"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="vi-status-summary"]')).toHaveText('—', { timeout: 15_000 });
    await expect(killButton).toBeDisabled();

    // 사이드바 — 그 계좌 전략은 빠지고 B 전략만 남는다(서버에는 등록이 남아 있다).
    await expect(sidebarStrategies).toHaveCount(1, { timeout: 15_000 });
    await expect(sidebarStrategies.nth(0)).toHaveAttribute('data-strategy-key', keyOf(CHASERS[1]));

    // 다른 계좌(B) 칩 — 그 계좌 전략은 그대로 켜져 있고 그 계좌 버튼은 누를 수 있다.
    await accountChip(page, ACCOUNT_B).click();
    await waitForStrategies(page, 1);
    await expect(strategyRows(page).nth(0)).toContainText('한국제7호기업인수목적우선주식회사', { timeout: 15_000 });
    await expect(strategyCard(page).getByRole('button', { name: `이 계좌 끄기 — ${ACCOUNT_B}` })).toBeEnabled();
    expect(countOf(DMA_MSG.DisableStrategiesReq)).toBe(2);
  });

  test('P32-orders 주문 탭 = 고른 계좌 평탄 목록 — 그룹 소제목 없음 · 「주문 N」 · 「N건」 = 고른 계좌 · B 칩 → B 행만 · 다른 계좌 안내 빈 상태 (D-23 · Pitfall 10)', async ({
    page,
  }) => {
    /** 계좌 목록 밖 계좌 — 오늘 주문 복원 행에만 있다(RESEARCH Pitfall 10). */
    const OUTSIDE_ACCOUNT = '9999999901';
    const rowsOf = rowsOfAccount;
    const linesOf = linesOfAccount;
    const card = todayOrdersCard(page);
    const header = card.locator('h2 + span');

    await page.goto('/me');
    await waitForReady(page, 2);
    await openMeTab(page, '주문', 'orders');

    // A(기본 칩) — A 행만 평탄하게 · 계좌 묶음 0 · 머리 「N건」 · 탭 라벨 「주문 N」 = A 건수.
    const aCount = rowsOf(TODAY_ORDERS, E2E_ACCOUNT_NO).length;
    await expect(todayOrderRows(page)).toHaveCount(linesOf(TODAY_ORDERS, E2E_ACCOUNT_NO), { timeout: 15_000 });
    await expect(card.getByTestId('today-orders-flat')).toHaveCount(1);
    await expect(card.locator('[data-slot="today-orders-group"]')).toHaveCount(0);
    await expect(header).toHaveText(`${aCount}건`);
    await expect(meTabCount(page, '주문')).toHaveText(String(aCount));
    // 취소 행(0000900003)은 A 의 것 — A 에서만 보인다.
    await expect(card).toContainText('0000900003');
    await expect(card).not.toContainText('0000900002');

    // B 칩 → B 행만.
    const bCount = rowsOf(TODAY_ORDERS, ACCOUNT_B).length;
    await accountChip(page, ACCOUNT_B).click();
    await expect(accountChip(page, ACCOUNT_B)).toHaveAttribute('aria-checked', 'true');
    await expect(todayOrderRows(page)).toHaveCount(linesOf(TODAY_ORDERS, ACCOUNT_B));
    await expect(header).toHaveText(`${bCount}건`);
    await expect(meTabCount(page, '주문')).toHaveText(String(bCount));
    await expect(card).toContainText('0000900002');
    await expect(card).not.toContainText('0000900003');

    /*
      다른 계좌 안내 + 목록 밖 계좌 — 복원을 「A 행 + 목록 밖 계좌 1행」 으로 덮는다(나중에 건 라우트가 이긴다).
      새로고침해도 기억값 B 가 서므로 B 는 0건 ∧ 다른 계좌 ≥ 1건이다.
    */
    const outsideRow = journalRow({
      id: 'ord-x',
      accountNo: OUTSIDE_ACCOUNT,
      orderNo: '0000900030',
      lastSeq: 30,
      createdAt: '2026-09-10T00:55:00.000Z',
      updatedAt: '2026-09-10T00:55:00.000Z',
    });
    const restored = [outsideRow, ...rowsOf(TODAY_ORDERS, E2E_ACCOUNT_NO)];
    await page.route('**/api/orders', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(restored) });
    });
    await page.reload();
    await expect(accountChip(page, ACCOUNT_B)).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    const emptyAccount = card.getByTestId('today-orders-empty-account');
    await expect(emptyAccount).toContainText('이 계좌의 오늘 주문이 없어요', { timeout: 15_000 });
    await expect(emptyAccount).toContainText(
      `다른 계좌에 오늘 주문 ${restored.length}건이 있어요 · 위에서 계좌를 바꿔 보세요`,
    );
    await expect(todayOrderRows(page)).toHaveCount(0);
    await expect(meTabCount(page, '주문')).toHaveCount(0);

    // 목록 밖 계좌가 칩 목록 맨 뒤에 번호만으로 선다 — 고르면 그 행이 보인다(기록된 주문을 숨기지 않는다).
    await expect(accountChips(page)).toHaveCount(3);
    await expect(accountChips(page).nth(2)).toHaveAttribute('data-account-no', OUTSIDE_ACCOUNT);
    await accountChip(page, OUTSIDE_ACCOUNT).click();
    await expect(todayOrderRows(page)).toHaveCount(1);
    await expect(card).toContainText('0000900030');
    await expect(header).toHaveText('1건');
  });

  test('P32-balance 잔고 탭 = 고른 계좌 한 벌 — 머리 없음 · 「잔고 N」 · B 칩 전환 (D-22)', async ({ page }) => {
    /** B 에 미체결 2건 — A(1건) · 합(3건)과 갈라져 라벨이 고른 계좌 수인지 가린다. */
    const bState = {
      ...ACCOUNT_B_STATE,
      unfilled: [
        ...ACCOUNT_B_STATE.unfilled,
        { ...ACCOUNT_B_STATE.unfilled[0], orderNo: '0000135802', exchange: 'KRX' },
      ],
    };
    await page.goto('/me');
    await waitForReady(page, 2);
    await relay.pushAccountState(ACCOUNT_A_STATE);
    await relay.pushAccountState(bState);

    // 라벨 = 고른 계좌(기본 A) 미체결 수 — relay 컨텍스트에서 오므로 탭을 열기 전에도 선다.
    await expect(meTabCount(page, '잔고')).toHaveText(String(ACCOUNT_A_STATE.unfilled.length), {
      timeout: 15_000,
    });

    await openMeTab(page, '잔고', 'accounts');
    await waitForAccountCard(page, E2E_ACCOUNT_NO);
    const card = accountCards(page);
    // 머리 줄(「계좌 · 번호 · 상품명」) 없음 — 계좌는 탭 위 칩이 말한다 · 세로 반복 없음.
    await expect(card.getByTestId('account-panel-account-no')).toHaveCount(0);
    await expect(card.getByTestId('account-panel-account-name')).toHaveCount(0);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('0000135742', { timeout: 15_000 });
    await expect(card).not.toContainText('0000135801');

    // B 칩 → B 카드 한 벌 · 라벨 = B 미체결 수.
    await accountChip(page, ACCOUNT_B).click();
    await waitForAccountCard(page, ACCOUNT_B);
    await expect(card).toContainText('0000135801', { timeout: 15_000 });
    await expect(card).toContainText('0000135802');
    await expect(card).not.toContainText('0000135742');
    await expect(meTabCount(page, '잔고')).toHaveText(String(bState.unfilled.length));

    // A 로 돌아오면 A.
    await accountChip(page, E2E_ACCOUNT_NO).click();
    await waitForAccountCard(page, E2E_ACCOUNT_NO);
    await expect(card).toContainText('0000135742');
    await expect(meTabCount(page, '잔고')).toHaveText(String(ACCOUNT_A_STATE.unfilled.length));
  });

  test('1. 전략 3 · 계좌 2 — 고른 계좌의 전략 행이 배지·거래소를 보여주고 잔고 · 주문 탭이 고른 계좌를 따른다', async ({
    page,
  }) => {
    await page.goto('/me');
    // 기본 칩 = 첫 계좌(A) — 현황은 A 의 전략 2건만(Phase 32 D-21).
    await waitForStrategies(page, 2);
    await waitForReady(page, 2);

    // 계좌 상태는 **계좌마다 한 프레임씩** 온다.
    await relay.pushAccountState(ACCOUNT_A_STATE);
    await relay.pushAccountState(ACCOUNT_B_STATE);

    // --- 전략 행 (C2) ---
    const first = strategyRows(page).nth(0);
    // 종목명·단축코드는 relay 역매핑(잔고·미체결)에서만 온다 — 계좌 상태 도착 후에 채워진다.
    await expect(first).toContainText('삼성전자', { timeout: 15_000 });
    await expect(first).toContainText('005930');
    await expect(first).toContainText('KRX');
    // 2줄째에 계좌번호는 없다 — 계좌는 탭 위 칩이 말한다(Phase 32 D-21).
    await expect(first).not.toContainText(E2E_ACCOUNT_NO);
    await expect(first).toContainText('매수ON');

    // 이름을 못 푸는 ISIN 은 그대로 보여준다 — 지어내지 않는다.
    await expect(strategyRows(page).nth(1)).toContainText(UNKNOWN_ISIN);

    // --- 상태줄 (C1) — 고른 계좌(A) 기준 · 「계좌 N개」 없음 ---
    const statusBar = page.locator('[data-slot="me-status-bar"]');
    await expect(statusBar).toHaveAttribute('data-status', 'ready');
    await expect(statusBar).toContainText('상따 2건');
    await expect(statusBar).toContainText('VI 가동');
    await expect(statusBar).not.toContainText('계좌');

    // B 칩 → B 의 전략 1행(NXT 매도대기).
    await accountChip(page, ACCOUNT_B).click();
    await waitForStrategies(page, 1);
    const onlyB = strategyRows(page).nth(0);
    await expect(onlyB).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(onlyB).toContainText('NXT');
    await expect(onlyB).not.toContainText(ACCOUNT_B);
    await expect(onlyB).toContainText('매도대기');

    // --- 계좌 카드 (C5 · Phase 32 D-22) — 잔고 탭 = 고른 계좌(지금 B) 한 벌 ---
    await openMeTab(page, '잔고', 'accounts');
    await waitForAccountCard(page, ACCOUNT_B);
    const card = accountCards(page);

    /*
      ★ 고른 계좌의 **자기 주문만** 들어 있어야 한다. 브라우저가 마지막 `acct` 프레임 하나만
        들고 있으면 여기서 고른 계좌가 「미체결 주문이 없어요」가 되거나 남의 주문을 보인다(=거짓말).
    */
    await expect(card).toContainText('0000135801', { timeout: 15_000 });
    await expect(card).not.toContainText('0000135742');
    await accountChip(page, E2E_ACCOUNT_NO).click();
    await waitForAccountCard(page, E2E_ACCOUNT_NO);
    await expect(card).toContainText('0000135742', { timeout: 15_000 });
    await expect(card).not.toContainText('0000135801');

    // ★ 패널 안 계좌 셀렉터는 없다 — 계좌 선택은 탭 위 칩(button) 한 곳이다(D-20).
    await expect(page$(page).locator('select')).toHaveCount(0);

    /*
      ★ 오늘 주문 카드 (RELAY-02 / D-24) — **D-20 의 v1 유예를 명시적으로 되돌렸다.**
        이 자리에 있던 「주문 이력 표는 v1 미포함」 부재 단언을 존재 단언으로 바꿨다
        (quick-260910-jce). me-client 헤더 ⑤ 도 같은 커밋에서 다시 썼다 — 파일과 spec 이
        서로 다른 말을 하는 상태를 남기지 않는다. 주문 탭(quick-261006-pey D-1).
    */
    await openMeTab(page, '주문', 'orders');
    const ordersCard = todayOrdersCard(page);
    await expect(ordersCard).toBeVisible();
    // 고른 계좌(A)의 주문만 — 줄 수는 픽스처에서 센다(Phase 32 D-23).
    await expect(todayOrderRows(page)).toHaveCount(linesOfAccount(TODAY_ORDERS, E2E_ACCOUNT_NO), {
      timeout: 15_000,
    });
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
    // 긴 종목명 행(ord-b)은 B 의 주문이다 — B 칩을 고르면 선다.
    await accountChip(page, ACCOUNT_B).click();
    await expect(todayOrderRows(page)).toHaveCount(linesOfAccount(TODAY_ORDERS, ACCOUNT_B));
    await expect(ordersCard).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(ordersCard).toContainText('000660');
    // 이 경로로는 **읽기만** 나간다 (D-02 — 주문 접수는 wss 단일 경로다).
    expect(ordersRequestMethods.length).toBeGreaterThan(0);
    expect([...new Set(ordersRequestMethods)]).toEqual(['GET']);

    /*
      세로 순서 → 탭 순서 승계(quick-261006-pey D-1): 옛 「상태줄 → 전략 현황 → 계좌 A → 계좌 B → 오늘 주문」 은
      탭 순서 현황(상태줄 · 전략) → 잔고(고른 계좌 한 벌 · 위에서 단언) → 주문 → 설정으로 잇는다.
    */
    const tabNames = (await meTabList(page).getByRole('tab').allTextContents()).map((t) =>
      t.replace(/\d+$/, ''),
    );
    expect(tabNames).toEqual(['현황', '잔고', '주문', '설정']);
  });

  test('2. 전략 행 클릭 → 인코딩된 키로 /trading?focus= 로 이동하고 그 카드가 펼쳐진다 (Phase 18 D-02)', async ({
    page,
  }) => {
    await page.goto('/me');
    await waitForStrategies(page, 2);

    // 대상은 B 의 NXT 전략 — 칩으로 B 를 고르면 그 계좌의 유일한 행이다(Phase 32 D-21).
    const target = CHASERS[1];
    await accountChip(page, ACCOUNT_B).click();
    await waitForStrategies(page, 1);
    await strategyRows(page).nth(0).click();

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

  test('3. 전략 0 · VI 중지 — 빈 문구 · 「이 계좌 끄기」 disabled', async ({ page }) => {
    relay.seedLimitChasers([]);
    relay.seedViTrigger(null);

    await page.goto('/me');
    await waitForReady(page, 2);

    // 고른 계좌(A)에 전략 · VI 가 없다 — 점선 한 줄(Phase 32 D-21 · S5′).
    await expect(strategyCard(page).locator('[data-slot="strategy-account-empty"]')).toHaveText(
      '이 계좌에 등록된 전략 없음',
      { timeout: 30_000 },
    );
    await expect(strategyRows(page)).toHaveCount(0);
    await expect(strategyCard(page).locator('[data-slot="vi-status-row"]')).toHaveCount(0);
    // 끌 것이 없다 — 「이 계좌 끄기」 하나뿐이고 disabled(D-27 · S5′).
    await expect(strategyCard(page).getByRole('button')).toHaveCount(1);
    await expect(
      strategyCard(page).getByRole('button', { name: `이 계좌 끄기 — ${E2E_ACCOUNT_NO}` }),
    ).toBeDisabled();
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
    // 게이트 분기에는 탭이 없다(quick-261006-pey D-1).
    await expect(meTabList(page)).toHaveCount(0);
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

  test('7. 데스크톱 1280 — 계좌 카드 안 미체결 위 · 잔고 아래(stack)이고 표가 가로 스크롤 없이 들어간다 (quick-260926-o2u)', async ({
    page,
  }) => {
    await page.goto('/me');
    await waitForReady(page, 2);
    // 스트레스 데이터가 실린 계좌 B 가 잘림의 시험대다 — 잔고 탭은 고른 계좌 한 벌이라 B 칩을 고른다(D-22).
    await relay.pushAccountState(ACCOUNT_B_STATE);
    await accountChip(page, ACCOUNT_B).click();
    await openMeTab(page, '잔고', 'accounts');
    await waitForAccountCard(page, ACCOUNT_B);

    const card = accountCard(page, ACCOUNT_B);
    const unfilled = card.getByTestId('account-unfilled');
    const holdings = card.getByTestId('account-holdings');
    await expect(unfilled.locator('[data-slot="table"]')).toBeVisible({ timeout: 15_000 });

    const cardBox = await boxOf(card);
    const unfilledBox = await boxOf(unfilled);
    const holdingsBox = await boxOf(holdings);

    // stack — 미체결 위 · 잔고 아래, 같은 왼쪽 선(본문 900 폭 · quick-260926-o2u).
    const unfilledH = (await unfilled.boundingBox())!.height;
    expect(holdingsBox.y).toBeGreaterThanOrEqual(unfilledBox.y + unfilledH - 1);
    expect(Math.abs(holdingsBox.x - unfilledBox.x)).toBeLessThanOrEqual(1);

    /*
      ★ 두 표 모두 가로 스크롤 없이 들어간다 — 2열이던 때는 칸마다 표 영역이 약 419px 라
        최소폭(미체결 439 · 잔고 444)보다 좁아 스크롤됐다. 섹션마다 첫 표 컨테이너를 잰다.
    */
    for (const section of [unfilled, holdings]) {
      const m = await section
        .locator('[data-slot="table-container"]')
        .first()
        .evaluate((el) => ({ scrollW: el.scrollWidth, clientW: el.clientWidth }));
      expect(m.scrollW).toBeLessThanOrEqual(m.clientW + 1);
    }

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
    // 기본 칩 = A — 현황은 A 의 전략 2건(Phase 32 D-21).
    await waitForStrategies(page, 2);
    await waitForReady(page, 2);
    await relay.pushAccountState(ACCOUNT_B_STATE);

    // quick-261006-pey D-1 — 탭 순서대로 잰다: 현황(전략 행) → 잔고(계좌 카드) → 주문(오늘 주문).
    /*
      전략 행은 **2줄 flex-col** 이다(C2 · 260911-w5h). r1 = 종목명 + 상태 배지 + 화살표,
      r2(`strategy-row-meta`) = `{코드} · {거래소}` — 계좌번호는 없다(Phase 32 D-21 · 계좌는 탭 위 칩이 말한다).
      ★ 전폭을 재는 대상은 **줄 자체**(`strategy-row-meta`)다.
      ★ `nameBox`/`badgeBox` 비교는 **그대로 남긴다** — 폭이 좁으면 규율이 없어도 자연
        wrap 으로 내려가 「둘째 줄」 단언이 헛통과하므로(변이 실측), 배지 **뒤**(=아래)에
        온다는 사실이 그 헛통과를 막는다.
      ★ 인덱스 1 을 쓰는 이유: `strategy-badge` 를 `.last()` 로 짚으므로 그 행에 상태
        배지가 **하나라도** 있어야 한다. 기본 칩 A 의 2번째 전략은 매수 · 매도가 모두 켜져 배지를 갖는다
        (아래 단언이 그것을 먼저 확인한다).
    */
    const row = strategyRows(page).nth(1);
    const meta = row.locator('[data-slot="strategy-row-meta"]');
    await expect(row.locator('[data-slot="strategy-badge"]')).not.toHaveCount(0);
    // 2줄째에 계좌번호가 없다(있던 단언 반전 — Phase 32 D-21).
    await expect(row.locator('[data-slot="strategy-row-account"]')).toHaveCount(0);
    await expect(meta).not.toContainText(E2E_ACCOUNT_NO);
    const rowBox = await boxOf(row);
    const nameBox = await boxOf(row.locator('span').first());
    const badgeBox = await boxOf(row.locator('[data-slot="strategy-badge"]').last());
    const metaBox = await boxOf(meta);

    // 둘째 줄로 내려간다.
    expect(metaBox.y).toBeGreaterThan(nameBox.y);
    expect(metaBox.y).toBeGreaterThan(badgeBox.y);
    // 그 줄이 행 폭의 대부분을 차지한다.
    expect(metaBox.width).toBeGreaterThan(rowBox.width * 0.8);

    // 스트레스 데이터가 실린 B — 잔고 · 주문 탭은 고른 계좌 한 벌이라 B 칩을 고른다(D-22 · D-23).
    await accountChip(page, ACCOUNT_B).click();
    await openMeTab(page, '잔고', 'accounts');
    await waitForAccountCard(page, ACCOUNT_B);
    const card = accountCard(page, ACCOUNT_B);
    await expect(card.locator('[data-slot="account-unfilled-row"]')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(card.locator('[data-slot="account-holding-row"]')).toHaveCount(1);
    // 표는 이 폭에서 보이지 않는다 — 콘텐츠 최소폭이 가용폭을 넘기 때문이다.
    await expect(card.getByTestId('account-unfilled').locator('[data-slot="table"]')).toBeHidden();

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
    await openMeTab(page, '주문', 'orders');
    const longOrderRow = todayOrderRows(page).filter({ hasText: '0000900002' });
    // 고른 계좌(B)의 평탄 목록 하나다(Phase 32 D-23) — 그래도 그 행이 든 목록으로 좁혀 잰다.
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

  test('9. 데스크톱 1280: 고른 계좌 평탄 · 출처 열 · NXT 태그 (Phase 32 D-23)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/me');
    await waitForReady(page, 2);
    await openMeTab(page, '주문', 'orders');

    // 계좌별 줄 수 헬퍼가 픽스처 전체 줄 수와 맞는다(헬퍼 자체가 헛돌지 않게).
    expect(
      linesOfAccount(TODAY_ORDERS, E2E_ACCOUNT_NO) + linesOfAccount(TODAY_ORDERS, ACCOUNT_B),
    ).toBe(TODAY_ORDER_LINES);

    const card = todayOrdersCard(page);
    const tableRows = card.locator('[data-slot="today-order-table-row"]');
    const linesA = linesOfAccount(TODAY_ORDERS, E2E_ACCOUNT_NO);
    // 고른 계좌(기본 A) 평탄 — 계좌 묶음 · 소제목(계좌 · 번호 · 상품명) 없음.
    await expect(tableRows).toHaveCount(linesA, { timeout: 15_000 });
    await expect(card.getByTestId('today-orders-flat')).toHaveCount(1);
    await expect(card.locator('[data-slot="today-orders-group"]')).toHaveCount(0);
    await expect(card).not.toContainText('위탁종합');
    // 헤더 「N건」 은 고른 계좌의 묶기 전 행 수다.
    await expect(card.locator('h2 + span')).toHaveText(
      `${rowsOfAccount(TODAY_ORDERS, E2E_ACCOUNT_NO).length}건`,
    );

    // 이 폭에서는 표다 — 표 하나, 「출처」 열이 구분 바로 뒤.
    await expect(card.locator('[data-slot="today-order-row"]').first()).toBeHidden();
    const heads = await card.locator('th').allTextContents();
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

    // NXT 태그 — NXT 행(묶인 상따 매도 · A) 하나에만, 종목 칸 안에.
    const nxtTags = tableRows.locator('[data-slot="exchange-tag"]');
    await expect(nxtTags).toHaveCount(1);
    await expect(nxtTags).toHaveAttribute('data-exchange', 'NXT');
    const mergedRow = tableRows.filter({ hasText: MERGED_ORDER_NO });
    await expect(mergedRow.locator('[data-slot="exchange-tag"]')).toHaveCount(1);
    await expect(mergedRow.locator('[data-slot="today-order-origin"]')).toHaveText('상따');

    // 출처 칩 — A 의 줄은 전부 출처를 안다(수동 · 상따).
    await expect(
      tableRows.filter({ hasText: '0000900001' }).locator('[data-slot="today-order-origin"]'),
    ).toHaveText('수동');
    await expect(tableRows.locator('[data-slot="today-order-origin"]')).toHaveCount(linesA);

    // 「· 수동」 꼬리는 없다 — 칩이 말한다(D-08).
    await expect(card).not.toContainText('· 수동');

    // 로컬 거부 줄(A) — 주문번호 · 수량 · 가격 자리가 「—」.
    const rejected = tableRows.filter({ hasText: '거부' });
    await expect(rejected).toHaveCount(1);
    const cells = (await rejected.locator('td').allTextContents()).map((t) => t.trim());
    expect([cells[4], cells[5], cells[7]]).toEqual(['—', '—', '—']);

    // B 칩 → B 의 줄 — 출처 미상(ord-b)은 칩이 없고(D-08 보충 · T-19-30) VI 는 「VI」 · NXT 없음.
    await accountChip(page, ACCOUNT_B).click();
    const linesB = linesOfAccount(TODAY_ORDERS, ACCOUNT_B);
    await expect(tableRows).toHaveCount(linesB);
    await expect(card.locator('h2 + span')).toHaveText(`${rowsOfAccount(TODAY_ORDERS, ACCOUNT_B).length}건`);
    await expect(
      tableRows.filter({ hasText: '0000900002' }).locator('[data-slot="today-order-origin"]'),
    ).toHaveCount(0);
    await expect(
      tableRows.filter({ hasText: '0000900020' }).locator('[data-slot="today-order-origin"]'),
    ).toHaveText('VI');
    await expect(tableRows.locator('[data-slot="today-order-origin"]')).toHaveCount(linesB - 1);
    await expect(tableRows.locator('[data-slot="exchange-tag"]')).toHaveCount(0);
    await expect(card.locator('[data-slot="today-orders-group"]')).toHaveCount(0);
  });

  test('10. 폰 390: 고른 계좌 평탄 · 묶인 행 ②줄 줄바꿈 · 주문번호 비잘림 (Phase 32 D-23)', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/me');
    await waitForReady(page, 2);
    // 종목명을 실어 ①줄도 실제 길이로 만든다(삼성전자 · 긴 종목명).
    await relay.pushAccountState(ACCOUNT_A_STATE);
    await relay.pushAccountState(ACCOUNT_B_STATE);
    await openMeTab(page, '주문', 'orders');

    const card = todayOrdersCard(page);
    // 고른 계좌(기본 A) 평탄 — 묶인 상따 매도 줄은 A 의 것이다.
    await expect(todayOrderRows(page)).toHaveCount(linesOfAccount(TODAY_ORDERS, E2E_ACCOUNT_NO), {
      timeout: 15_000,
    });
    await expect(card.locator('[data-slot="today-orders-group"]')).toHaveCount(0);
    await expect(card).toContainText('삼성전자', { timeout: 15_000 });

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

    // 테스트 8 과 같은 자 — **모든 행**의 잎이 자기 목록 밖으로 밀려나지 않는다. B(긴 종목명)도 칩을 바꿔 잰다.
    const expectNoOverflow = async () => {
      const rows = await todayOrderRows(page).all();
      for (const row of rows) {
        const ownList = row.locator('xpath=ancestor::*[@data-slot="today-orders-list"][1]');
        const right = (await boxOf(ownList)).right;
        expect(await leavesOverflowing(row, right)).toEqual([]);
      }
    };
    await expectNoOverflow();
    await accountChip(page, ACCOUNT_B).click();
    await expect(todayOrderRows(page)).toHaveCount(linesOfAccount(TODAY_ORDERS, ACCOUNT_B));
    await expect(card).toContainText('한국제7호기업인수목적우선주식회사', { timeout: 15_000 });
    await expectNoOverflow();
  });

  test('11. 폰 390 — 잔고·미체결 행을 누르면 /trading 에서 그 종목 카드가 펼쳐진다 · 취소 버튼은 이동하지 않는다 (2026-09-27)', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/me');
    await waitForStrategies(page, 2);
    await waitForReady(page, 2);
    await relay.pushAccountState(ACCOUNT_A_STATE);
    await openMeTab(page, '잔고', 'accounts');
    // 기본 칩 A 한 벌(Phase 32 D-22).
    await waitForAccountCard(page, E2E_ACCOUNT_NO);

    const card = accountCard(page, E2E_ACCOUNT_NO);
    const unfilledRow = card.locator('[data-slot="account-unfilled-row"]').first();
    await expect(unfilledRow).toBeVisible({ timeout: 15_000 });

    // 취소 버튼은 행 링크 위에 있다 — 누르면 확인 다이얼로그만 열리고 이동하지 않는다.
    await unfilledRow.getByRole('button', { name: /취소/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/me');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // 잔고 행은 종목명이 아니라 **행 오른쪽 빈 곳**을 눌러도 이동한다(행 전체가 링크).
    const holdingRow = card.locator('[data-slot="account-holding-row"]').first();
    await holdingRow.scrollIntoViewIfNeeded();
    const box = await boxOf(holdingRow);
    await page.mouse.click(box.right - 12, box.y + 10);

    await expect(page).toHaveURL((url) => url.pathname === '/trading', { timeout: 15_000 });
    await expect(
      page.locator(`[data-slot="strategy-card"][data-key^="${E2E_ISIN}:"][data-open="true"]`).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
  // =========================================================================
  // Phase 25 25-08 — 오늘 주문 행 펼침 (D-01 ~ D-04 · 결정 8-A · UI-SPEC 검증 훅 「오늘 주문」)
  // =========================================================================

  /** 펼침 조회 목 — URL 의 id · orderNos 로 픽스처 타임라인을 돌려주고 요청을 센다. */
  interface EventsMock {
    urls: string[];
    /** 다음 응답을 이 상태 코드로(한 번). */
    failNext: boolean;
    /** 다음 응답을 이만큼 늦춘다(한 번 · ms). */
    delayNext: number;
  }

  async function mockP25(page: Page): Promise<EventsMock> {
    const mock: EventsMock = { urls: [], failNext: false, delayNext: 0 };
    await page.route('**/api/orders', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(P25_ORDERS),
      });
    });
    await page.route('**/api/orders/*/events**', async (route) => {
      const url = new URL(route.request().url());
      mock.urls.push(url.pathname + url.search);
      const id = decodeURIComponent(url.pathname.split('/').at(-2) ?? '');
      if (mock.delayNext > 0) {
        const ms = mock.delayNext;
        mock.delayNext = 0;
        await new Promise((r) => setTimeout(r, ms));
      }
      if (mock.failNext) {
        mock.failNext = false;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL', message: 'boom' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TIMELINE_BY_ANCHOR[id] ?? []),
      });
    });
    return mock;
  }

  const p25TableRow = (page: Page, text: string) =>
    todayOrdersCard(page).locator('[data-slot="today-order-table-row"]').filter({ hasText: text });
  const p25CardRow = (page: Page, text: string) => todayOrderRows(page).filter({ hasText: text });

  async function openP25(page: Page, viewport: { width: number; height: number }): Promise<void> {
    await page.setViewportSize(viewport);
    await page.goto('/me');
    await waitForReady(page, 2);
    await openMeTab(page, '주문', 'orders');
    await expect(todayOrdersCard(page).locator('h2 + span')).toHaveText(`${P25_ORDERS.length}건`, {
      timeout: 15_000,
    });
  }

  test('P25-E1 1280 — 12451 행 클릭 → aria-expanded true · 상세 colSpan 8 · 같은 ms 두 줄 통보 먼저 · 요청 1회', async ({
    page,
  }) => {
    const mock = await mockP25(page);
    await openP25(page, { width: 1280, height: 900 });

    const row = p25TableRow(page, '12451');
    await expect(row).toHaveCount(1);
    const button = row.locator('button[data-slot="today-order-expand"]');
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    // 행 어디든 — 종목 칸을 누른다(버튼 밖).
    await row.locator('td').nth(1).click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');

    const detail = row.locator('xpath=following-sibling::tr[1]');
    await expect(detail).toHaveAttribute('data-slot', 'today-order-detail');
    const cell = detail.locator('td');
    await expect(cell).toHaveAttribute('colspan', '8');
    await expect(button).toHaveAttribute('aria-controls', (await cell.getAttribute('id'))!);

    const items = detail.locator('[data-slot="order-timeline-item"]');
    await expect(items).toHaveCount(6);
    expect(await items.evaluateAll((els) => els.map((el) => el.getAttribute('data-source')))).toEqual([
      'strategy',
      'journal',
      'strategy',
      'journal',
      'strategy',
      'journal',
    ]);
    // 같은 ms 09:45:07.415 — 통보(체결) 먼저, 상따(첫 체결) 다음.
    await expect(items.nth(3)).toContainText('09:45:07.415');
    await expect(items.nth(3)).toContainText('체결 매수 100주 @12,350 (누적 100/300)');
    await expect(items.nth(4)).toContainText('09:45:07.415');
    await expect(items.nth(4)).toContainText('첫 체결');
    await expect(items.nth(5)).toContainText('전량 체결 200주 @12,350 (누적 300/300)');

    // 상세 셀 — 높이 auto · 위 2 / 아래 10 · 배경 없음(층 없는 .tbl-wrap 규칙을 `!` 가 이겼는가 실측).
    const css = await cell.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        pt: cs.paddingTop,
        pb: cs.paddingBottom,
        ws: cs.whiteSpace,
        bg: cs.backgroundColor,
        h: el.getBoundingClientRect().height,
      };
    });
    expect(css.pt).toBe('2px');
    expect(css.pb).toBe('10px');
    expect(css.ws).toBe('normal');
    expect(css.h).toBeGreaterThan(6 * 16);
    // 열린 행 셀 배경은 primary 6% — 투명이 아니다.
    const openBg = await row.locator('td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(openBg).not.toBe('rgba(0, 0, 0, 0)');

    // 실측 스크린샷(열린 행 + 상세).
    await todayOrdersCard(page).screenshot({ path: test.info().outputPath('p25-e1-1280-expand.png') });

    // 요청은 1회(StrictMode 이중 마운트 · 두 배치 중복 없음).
    await page.waitForTimeout(600);
    expect(mock.urls).toEqual([`/api/orders/${ROW_12451.id}/events?orderNos=12451`]);
  });

  test('P25-E2 1280 — 두 행 동시 펼침 · 다시 클릭 닫힘', async ({ page }) => {
    await mockP25(page);
    await openP25(page, { width: 1280, height: 900 });

    const a = p25TableRow(page, '12451');
    const b = p25TableRow(page, '12453');
    await a.locator('td').nth(2).click();
    await b.locator('td').nth(2).click();
    const details = todayOrdersCard(page).locator('tr[data-slot="today-order-detail"]');
    await expect(details).toHaveCount(2);
    await expect(a.locator('button[data-slot="today-order-expand"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(b.locator('button[data-slot="today-order-expand"]')).toHaveAttribute('aria-expanded', 'true');
    // 12453 — 취소 확인(새 번호 12460)이 원주문 타임라인에 선다.
    await expect(b.locator('xpath=following-sibling::tr[1]')).toContainText('취소 확인 잔량 300주');

    // 버튼으로 닫아도 한 번만 토글된다(행 클릭과 이중 토글 없음).
    await a.locator('button[data-slot="today-order-expand"]').click();
    await expect(a.locator('button[data-slot="today-order-expand"]')).toHaveAttribute('aria-expanded', 'false');
    await expect(details).toHaveCount(1);
    await b.locator('td').nth(4).click();
    await expect(details).toHaveCount(0);
  });

  test('P25-E3 묶음 행 → 한 타임라인 · 줄마다 #주문번호 · 요청 URL 에 orderNos 7개', async ({ page }) => {
    const mock = await mockP25(page);
    await openP25(page, { width: 1280, height: 900 });

    const row = p25TableRow(page, P25_BUNDLE_NO);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('(7건)');
    await row.locator('td').nth(1).click();

    const items = row.locator('xpath=following-sibling::tr[1]').locator('[data-slot="order-timeline-item"]');
    await expect(items.first()).toBeVisible();
    const texts = await items.allTextContents();
    expect(texts.length).toBeGreaterThan(14);
    for (const text of texts) expect(text).toMatch(/#1246[1-7]$/);
    await expect(items.filter({ hasText: '(누적 120/600)' })).toHaveCount(1);
    await expect(items.filter({ hasText: '(누적 600/600)' })).toHaveCount(1);
    await row
      .locator('xpath=following-sibling::tr[1]')
      .screenshot({ path: test.info().outputPath('p25-e3-1280-bundle.png') });

    await expect.poll(() => mock.urls.length).toBe(1);
    const url = new URL(`http://x${mock.urls[0]}`);
    expect(url.pathname).toBe(`/api/orders/${BUNDLE_ROWS[0]!.id}/events`);
    expect(url.searchParams.get('orderNos')?.split(',')).toEqual([...BUNDLE_ORDER_NOS]);
  });

  test('P25-E4 주문번호 없는 거부 행 → expand 버튼 · aria-expanded 부재 · 클릭 뒤 today-order-detail 0', async ({
    page,
  }) => {
    const mock = await mockP25(page);
    await openP25(page, { width: 1280, height: 900 });

    for (const text of ['접수 불명', '거부']) {
      const row = p25TableRow(page, text).first();
      await expect(row).toBeVisible();
      await expect(row.locator('button[data-slot="today-order-expand"]')).toHaveCount(0);
      await expect(row.locator('[aria-expanded]')).toHaveCount(0);
      // ▶ 자리는 남는다(시각 열 정렬) — 보이지 않을 뿐.
      await expect(row.locator('td').first().locator('[aria-hidden="true"]')).toHaveCSS('visibility', 'hidden');
      await expect(row).toHaveCSS('cursor', 'auto');
      await row.locator('td').nth(1).click();
    }
    await expect(todayOrdersCard(page).locator('[data-slot="today-order-detail"]')).toHaveCount(0);
    expect(mock.urls).toEqual([]);
  });

  test('P25-E5 로딩(1초 지연 → 「불러오는 중…」) · 실패(500 → 「이벤트를 불러오지 못했어요」 → 다시 시도 → 성공)', async ({
    page,
  }) => {
    const mock = await mockP25(page);
    await openP25(page, { width: 1280, height: 900 });

    // 로딩 — 처음 펼침 조회 중 한 줄 + aria-busy.
    mock.delayNext = 1_000;
    const slow = p25TableRow(page, '12453');
    await slow.locator('td').nth(1).click();
    const slowDetail = slow.locator('xpath=following-sibling::tr[1]');
    await expect(slowDetail.locator('[data-slot="order-timeline-loading"]')).toHaveText('불러오는 중…');
    await expect(slowDetail.locator('[aria-busy="true"]')).toHaveCount(1);
    await expect(slowDetail.locator('[data-slot="order-timeline-item"]')).toHaveCount(5, { timeout: 5_000 });
    await expect(slowDetail.locator('[data-slot="order-timeline-loading"]')).toHaveCount(0);

    // 실패 → 다시 시도 → 성공(수동 주문 — 통보 줄만 · 빈 문구 없음).
    mock.failNext = true;
    const manual = p25TableRow(page, '12470');
    await manual.locator('td').nth(1).click();
    const manualDetail = manual.locator('xpath=following-sibling::tr[1]');
    const error = manualDetail.locator('[data-slot="order-timeline-error"]');
    await expect(error).toContainText('이벤트를 불러오지 못했어요');
    await expect(error).toHaveAttribute('role', 'status');
    const before = mock.urls.length;
    await error.getByRole('button', { name: '다시 시도' }).click();
    const items = manualDetail.locator('[data-slot="order-timeline-item"]');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveAttribute('data-source', 'journal');
    await expect(items.first()).toContainText('접수 매수 10주 @12,400');
    await expect(manualDetail.locator('[data-slot="order-timeline-empty"]')).toHaveCount(0);
    await expect(error).toHaveCount(0);
    expect(mock.urls.length).toBe(before + 1);

    // 응답 0건(방향 미상 12490 — 픽스처에 타임라인 없음) → 0건 한 줄.
    const empty = p25TableRow(page, '12490');
    await empty.locator('td').nth(1).click();
    await expect(
      empty.locator('xpath=following-sibling::tr[1]').locator('[data-slot="order-timeline-empty"]'),
    ).toHaveText('주문 기록 없음');
  });

  test('P25-E6 390 카드 행 — 펼침 · 가장 긴 상따 「주문」 줄이 줄바꿈으로 전부 보이고 시각 칸 78px (백스톱 E2 overflow)', async ({
    page,
  }) => {
    const mock = await mockP25(page);
    await openP25(page, MOBILE_VIEWPORT);

    const card = p25CardRow(page, '12451');
    await expect(card).toHaveCount(1);
    await card.click();
    await expect(card.locator('button[data-slot="today-order-expand"]')).toHaveAttribute('aria-expanded', 'true');
    const detail = card.locator('div[data-slot="today-order-detail"]');
    await expect(detail).toHaveCSS('border-top-style', 'dashed');
    const items = detail.locator('[data-slot="order-timeline-item"]');
    await expect(items).toHaveCount(6);

    // 가장 긴 줄 = 상따 「주문」(조건 · 근거 · 상한가 매수잔량 · 가격×수량 · 접수 · 누적).
    const longest = items.first();
    await expect(longest).toHaveAttribute('data-source', 'strategy');
    await expect(longest).toContainText('주문 선매수 · 조건');
    await expect(longest).toContainText('누적 861,800');

    const list = page
      .locator('[data-slot="today-orders-list"]')
      .filter({ has: page.locator('[data-slot="today-order-row"]', { hasText: '12451' }) });
    const listRight = (await boxOf(list)).right;
    // 넘침 0 — li 안 어떤 잎도 목록 오른쪽 밖으로 밀리지 않는다(줄바꿈으로 전부 보인다).
    expect(await leavesOverflowing(longest, listRight)).toEqual([]);
    // 줄바꿈이 실제로 일어났다(한 줄 11px × 1.5 보다 훨씬 높다) — 헛통과 방지.
    const liHeight = (await longest.boundingBox())!.height;
    expect(liHeight).toBeGreaterThan(16.5 * 2.5);
    // 시각 칸은 78px 그대로 — 밀리지 않는다.
    for (const time of await detail.locator('[data-slot="order-timeline-time"]').all()) {
      expect(Math.round((await time.boundingBox())!.width)).toBe(78);
    }
    // 백스톱 실측 스크린샷(E2 overflow).
    await detail.screenshot({ path: test.info().outputPath('p25-e6-390-expand.png') });

    // 본문 안 클릭은 닫지 않는다 · 보이는 배치(카드 행)에서만 조회 1회.
    await longest.click();
    await expect(card.locator('button[data-slot="today-order-expand"]')).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(600);
    expect(mock.urls).toHaveLength(1);
  });

  test('P25-E7 별건 3 — 방향 미상 「주문」 data-side none · −2 「접수 불명」 data-tone muted · R(New) data-side-ref true', async ({
    page,
  }) => {
    await mockP25(page);
    await openP25(page, { width: 1280, height: 900 });

    const unknownSide = p25TableRow(page, '12490').locator('[data-slot="today-order-side"]');
    await expect(unknownSide).toHaveAttribute('data-side', 'none');
    await expect(unknownSide).toHaveText('주문');

    const receipt = p25TableRow(page, '접수 불명').locator('[data-slot="today-order-status"]');
    await expect(receipt).toHaveText('접수 불명');
    await expect(receipt).toHaveAttribute('data-tone', 'muted');

    const rejectNew = todayOrdersCard(page)
      .locator('[data-slot="today-order-table-row"]')
      .filter({ has: page.locator('[data-slot="today-order-status"]', { hasText: /^거부$/ }) });
    await expect(rejectNew).toHaveCount(1);
    await expect(rejectNew.locator('[data-slot="today-order-side"]')).toHaveAttribute('data-side-ref', 'true');
  });
  /* ───────────────────────── Phase 27 (27-06) — /me 상따 기본설정 (42/84) ───────────────────────── */

  const lcDefaults = (page: Page) => page.locator('[data-slot="me-lc-defaults"]');
  const lcDefaultsChip = (page: Page) => page.locator('[data-slot="me-lc-defaults-chip"]');
  const lcDefaultsRow = (page: Page, field: string) =>
    page.locator(`[data-slot="me-lc-defaults-row"][data-field="me-lc-${field}"]`);
  /** 게이트웨이가 받은 42 본문 전량(송신 순서). */
  const setUserSettingsRequests = () =>
    relay
      .strategyRequests()
      .map((r) => readSetUserSettingsRequest(r.payload))
      .filter((r): r is NonNullable<typeof r> => r !== null);
  /**
   * 84 픽스처 — 새 gh-trade 의 84 는 후매수 최소 금액(만원 · `postBuyFloorAmount`)을 싣는다(Phase 31 D-13). 금액이 실린 84 여야
   * 섹션이 편집 · 저장 가능 상태가 된다(구 relay 모양 = 「불러오는 중」 · UI-SPEC /me 표).
   */
  const LC84 = { present: true, postBuyFloorAmount: 84 } as const;
  /**
   * 42 의 12값 기대 — 서버 내장 기본값(fixture `buildUserSettingsFrame` 기본 = fbs 주석) + 84 의 후매수 최소 금액(LC84).
   * 봉인 `postBuyFloorQty` 는 웹이 늘 0 을 싣는다(Phase 31 · gh-trade Phase 32 D-08 — 84 의 100,000 을 되싣지 않는다).
   * 선매수 2필드: 픽스처 84 는 두 슬롯 없음(구 서버 모양) → relay 0/false → 웹 42 가 늘 싣는다(quick-261012-u04).
   */
  const USER_SETTINGS_BUILTIN = {
    preBuyAmount: 4000,
    addBuyAmount: 4000,
    postBuyAmount: 4000,
    postBuyMaxCount: 3,
    postBuyFloorQty: 0,
    postBuyReboundPct: 30,
    sellQtyTrackRatio: 55,
    autoSellPeriodSec: 3,
    auctionSellRatioPct: 20,
    autoSellRatioDefaultPct: 10,
    autoSellMethodDefault: 3,
    postBuyFloorAmount: LC84.postBuyFloorAmount,
    preBuyWatchAmount: 0,
    preBuyAutoAddBuy: false,
  } as const;

  test('P27-M1 상따 기본설정 — 84 표시 → 행 확정 42(캐시 + 1칸) → 84 플래시 · 거부 원문 (D-12 · D-13 · 261006-pey D-2)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/me');
    await waitForReady(page, 2);
    await openMeTab(page, '설정', 'settings');

    // 84 를 아직 못 받았다 — 지어낸 기본값 없이 「불러오는 중」 · 행 흐림.
    await expect(lcDefaultsChip(page)).toHaveText('불러오는 중');
    await expect(lcDefaults(page).locator('[data-slot="me-lc-defaults-rows"]')).toHaveAttribute('data-dim', 'true');

    /*
      quick-261006-pey D-2 — 옛 D-10 위치(상태줄 아래 · 전략 현황 위)는 「설정」 탭으로 대체됐다. 여기서는 S1 격자를
      잰다: 설정 탭에서 상태줄은 보이지 않고, 묶음 카드 5장이 본문 900(≥700)에서 2열이다.
      quick-261012-u04 B′ 열 고정 — 왼쪽 열 매수 금액 · 선매수 · 후매수(위→아래) / 오른쪽 열 매도 · 자동매도(위→아래).
    */
    await expect(page.locator('[data-slot="me-status-bar"]')).toBeHidden();
    const groupCards = lcDefaults(page).locator('[data-slot="me-lc-defaults-group-card"]');
    await expect(groupCards).toHaveCount(5);
    const cardBoxes = [];
    for (let i = 0; i < 5; i++) cardBoxes.push(await boxOf(groupCards.nth(i)));
    const [buyBox, preBox, postBox, sellBox, autoBox] = cardBoxes;
    // 왼쪽 열 — 같은 x · 위→아래.
    expect(Math.abs(preBox.x - buyBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(postBox.x - buyBox.x)).toBeLessThanOrEqual(1);
    expect(preBox.y).toBeGreaterThan(buyBox.y);
    expect(postBox.y).toBeGreaterThan(preBox.y);
    // 오른쪽 열 — x 가 더 크고 위→아래 · 매도 카드 top ≈ 매수 금액 카드 top.
    expect(sellBox.x).toBeGreaterThan(buyBox.x + 1);
    expect(Math.abs(autoBox.x - sellBox.x)).toBeLessThanOrEqual(1);
    expect(autoBox.y).toBeGreaterThan(sellBox.y);
    expect(Math.abs(sellBox.y - buyBox.y)).toBeLessThanOrEqual(2);
    for (let i = 0; i < 5; i++) {
      const groupCard = groupCards.nth(i);
      expect(await leavesOverflowing(groupCard, (await boxOf(groupCard)).right)).toEqual([]);
    }

    await relay.pushUserSettings({ ...LC84, autoSellPeriodSec: 3 });
    await expect(lcDefaultsChip(page)).toHaveText('서버 저장값', { timeout: 15_000 });
    const period = lcDefaultsRow(page, 'auto-sell-period-sec');
    await expect(period.locator('[data-slot="lc-row-value"]')).toHaveText('3초');
    // 84 가 와도 42 를 저절로 보내지 않는다(인박스 Q2).
    expect(setUserSettingsRequests()).toHaveLength(0);

    // 데스크톱 1280 인라인 — 매도 주기 5 Enter → 42 1건(84 캐시 11값 + 주기 5 · present 미적재).
    await period.locator('button[data-lc-field="me-lc-auto-sell-period-sec"]').click();
    const input = page.locator('input#me-lc-auto-sell-period-sec');
    await expect(input).toBeFocused();
    await input.fill('5');
    await input.press('Enter');
    await expect.poll(() => setUserSettingsRequests().length, { timeout: 15_000 }).toBe(1);
    expect(setUserSettingsRequests()[0]).toEqual({
      ...USER_SETTINGS_BUILTIN,
      autoSellPeriodSec: 5,
      presentSlotEmpty: true,
    });

    // 서버 브로드캐스트 84 → 행 「5초」 + 초록 플래시.
    await relay.pushUserSettings({ ...LC84, autoSellPeriodSec: 5 });
    await expect(period).toHaveAttribute('data-flash', 'ok', { timeout: 15_000 });
    await expect(period.locator('[data-slot="lc-row-value"]')).toHaveText('5초');
    await expect(period).not.toHaveAttribute('data-flash', 'ok', { timeout: 5_000 });

    // 다시 확정 → 비행 중 서버 거부(54 SetUserSettings) → 섹션 아래 원문 · 행 값은 84(5초) 그대로.
    await period.locator('button[data-lc-field="me-lc-auto-sell-period-sec"]').click();
    await input.fill('9');
    await input.press('Enter');
    await expect.poll(() => setUserSettingsRequests().length, { timeout: 15_000 }).toBe(2);
    expect(setUserSettingsRequests()[1]).toMatchObject({ autoSellPeriodSec: 9, presentSlotEmpty: true });
    const rejectText = '매도 주기는 1~60초여야 합니다(받은 값 99)';
    await relay.pushServerMessage({ level: 'ERROR', source: 'SetUserSettings', message: rejectText, isin: '' });
    await expect(lcDefaults(page).locator('[data-slot="me-lc-defaults-reject"]')).toHaveText(rejectText, {
      timeout: 15_000,
    });
    await expect(period.locator('[data-slot="lc-row-value"]')).toHaveText('5초');
    await expect(period).toHaveAttribute('data-failed', 'true');
    // 재전송 없음.
    await page.waitForTimeout(500);
    expect(setUserSettingsRequests()).toHaveLength(2);

    // 1280 — 섹션 안 잎 요소가 카드 오른쪽 밖으로 밀리지 않는다.
    expect(await leavesOverflowing(lcDefaults(page), (await boxOf(lcDefaults(page))).right)).toEqual([]);
    // 사람 확인용(목업 S1 대조) — 1280 설정 탭 2열 카드.
    await page.screenshot({ path: 'test-results/me-settings-1280.png', fullPage: true });
  });

  /*
    Phase 31 /me 「후매수 최소」(D-13 · AMT-03 · SC3) — 옛 봉인 주(하한잔량) 행 자리를 만원 행이 교체했다(교체이지 추가가 아니다).
    84 금액 84 → 행 「84만원」 → 300 확정 → 42 의 post_buy_floor_amount 300 · post_buy_floor_qty 0(봉인) · 나머지 10값은 84
    그대로 · present 슬롯 없음 → 84 브로드캐스트 뒤 「300만원」.
  */
  test('P31-5 /me 후매수 최소 — 84 postBuyFloorAmount 84 → 「84만원」 → 300 확정 → 42 post_buy_floor_amount 300 · post_buy_floor_qty 0 · 나머지 10값 84 그대로 → 84 뒤 「300만원」 (D-13 · AMT-03 · SC3)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/me');
    await waitForReady(page, 2);
    await openMeTab(page, '설정', 'settings');
    await relay.pushUserSettings({ ...LC84, postBuyMaxCount: 5, sellQtyTrackRatio: 60 });
    await expect(lcDefaultsChip(page)).toHaveText('서버 저장값', { timeout: 15_000 });

    // 「후매수」 묶음 — 옛 봉인 주 행(하한잔량)은 없고 「후매수 최소」 만원 행이 그 자리에 있다.
    await expect(lcDefaults(page).getByText('후매수 하한잔량')).toHaveCount(0);
    const floor = lcDefaultsRow(page, 'post-buy-floor-amount');
    await expect(floor).toHaveCount(1);
    await expect(floor).toContainText('후매수 최소');
    await expect(floor.locator('[data-slot="lc-row-value"]')).toHaveText('84만원');
    const button = floor.locator('button[data-lc-field="me-lc-post-buy-floor-amount"]');
    await expect(button).toHaveAccessibleName('후매수 최소 84만원');
    expect(setUserSettingsRequests()).toHaveLength(0);

    // 데스크톱 인라인 — 300 Enter → 42 한 건(84 캐시 10값 + 후매수 최소 300 · 봉인 주 0 · present 미적재).
    await button.click();
    const input = page.locator('input#me-lc-post-buy-floor-amount');
    await expect(input).toBeFocused();
    await input.fill('300');
    await input.press('Enter');
    await expect.poll(() => setUserSettingsRequests().length, { timeout: 15_000 }).toBe(1);
    expect(setUserSettingsRequests()[0]).toEqual({
      ...USER_SETTINGS_BUILTIN,
      postBuyMaxCount: 5,
      sellQtyTrackRatio: 60,
      postBuyFloorAmount: 300,
      postBuyFloorQty: 0,
      presentSlotEmpty: true,
    });

    // 서버 브로드캐스트 84(300) → 행 「300만원」 + 초록 플래시.
    await relay.pushUserSettings({ ...LC84, postBuyMaxCount: 5, sellQtyTrackRatio: 60, postBuyFloorAmount: 300 });
    await expect(floor).toHaveAttribute('data-flash', 'ok', { timeout: 15_000 });
    await expect(floor.locator('[data-slot="lc-row-value"]')).toHaveText('300만원');
    expect(setUserSettingsRequests(), '84 는 42 를 다시 만들지 않는다').toHaveLength(1);
  });

  test.describe('P27-M1 폰 390 — 터치 키패드 시트', () => {
    test.use({ hasTouch: true, viewport: MOBILE_VIEWPORT });

    test('P27-M1 폰 390 — 시트 61 → 적용 비활성 · 「1~60초 사이여야 해요」 · 전송 0 · 잘림 없음', async ({ page }) => {
      await page.goto('/me');
      await waitForReady(page, 2);
      await openMeTab(page, '설정', 'settings');
      await relay.pushUserSettings({ present: false });
      await expect(lcDefaultsChip(page)).toHaveText('서버 저장값 없음 · 내장 기본값', { timeout: 15_000 });
      await expect(lcDefaults(page).locator('[data-slot="me-lc-defaults-note"]')).toHaveText(
        '아직 저장한 적이 없어요 · 저장하면 이 사용자(DMA 계정)의 모든 화면에 적용돼요',
      );
      // 390 — 섹션 잎 요소 잘림 0.
      expect(await leavesOverflowing(lcDefaults(page), (await boxOf(lcDefaults(page))).right)).toEqual([]);
      // 261006-pey D-2 — 폰은 1열: 카드 5장이 같은 왼쪽 선에서 아래로 쌓인다
      // (u04 B′ — 매수 금액 → 선매수 → 후매수 → 매도 → 자동매도).
      const groupCards = lcDefaults(page).locator('[data-slot="me-lc-defaults-group-card"]');
      await expect(groupCards).toHaveCount(5);
      await expect(groupCards.nth(1)).toHaveAttribute('aria-label', '선매수');
      await expect(groupCards.nth(3)).toHaveAttribute('aria-label', '매도');
      const boxes = [];
      for (let i = 0; i < 5; i++) boxes.push(await boxOf(groupCards.nth(i)));
      for (let i = 1; i < 5; i++) {
        expect(Math.abs(boxes[i].x - boxes[0].x)).toBeLessThanOrEqual(1);
        expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y);
      }

      await lcDefaultsRow(page, 'auto-sell-period-sec').locator('button[data-lc-field]').first().click();
      const sheet = page.locator('[data-slot="numpad-sheet"]');
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText('1~60초');
      const keypad = sheet.getByRole('group', { name: '숫자 키패드' });
      await keypad.getByRole('button', { name: '6', exact: true }).click();
      await keypad.getByRole('button', { name: '1', exact: true }).click();
      await expect(sheet.locator('[data-slot="numpad-confirm"]')).toBeDisabled();
      await expect(sheet.locator('[data-slot="numpad-status"]')).toHaveText('1~60초 사이여야 해요');
      await sheet.getByRole('button', { name: '닫기' }).click();
      await page.waitForTimeout(300);
      expect(setUserSettingsRequests()).toHaveLength(0);
    });
  });

  /* ───────────────────────── quick-261006-pey D-1 — /me 4탭 메커니즘(실브라우저) ───────────────────────── */

  test('PEY-1 기본은 현황 — 열지 않은 탭은 마운트되지 않고 오늘 주문 조회도 0회다', async ({ page }) => {
    await page.goto('/me');
    await waitForReady(page, 2);

    const names = (await meTabList(page).getByRole('tab').allTextContents()).map((t) => t.replace(/\d+$/, ''));
    expect(names).toEqual(['현황', '잔고', '주문', '설정']);
    await expect(meTab(page, '현황')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-slot="me-status-bar"]')).toBeVisible();
    await expect(strategyCard(page)).toBeVisible();

    // 미방문 탭의 표면은 DOM 에 없다(숨김이 아니라 비마운트).
    await expect(accountCards(page)).toHaveCount(0);
    await expect(todayOrdersCard(page)).toHaveCount(0);
    await expect(page.locator('[data-slot="me-lc-defaults"]')).toHaveCount(0);

    // 주문 탭을 열지 않았으니 GET /api/orders 도 없다(T-16-02 — 조회 횟수 무증가).
    await page.waitForTimeout(500);
    expect(ordersRequestMethods).toHaveLength(0);
    await expect(meTabCount(page, '주문')).toHaveCount(0);
  });

  test('PEY-2 전환 · 라벨 숫자 — 잔고 = 고른 계좌 미체결 · 주문 = 헤더 「N건」(고른 계좌) · 재방문은 다시 조회하지 않는다', async ({
    page,
  }) => {
    await page.goto('/me');
    await waitForReady(page, 2);
    await relay.pushAccountState(ACCOUNT_A_STATE);
    await relay.pushAccountState(ACCOUNT_B_STATE);

    // 잔고 라벨 숫자는 relay 컨텍스트에서 온다 — 탭을 열기 전에도 선다 · 고른 계좌(기본 A)의 미체결 수(D-22).
    await expect(meTabCount(page, '잔고')).toHaveText(String(ACCOUNT_A_STATE.unfilled.length), {
      timeout: 15_000,
    });

    await openMeTab(page, '잔고', 'accounts');
    await waitForAccountCard(page, E2E_ACCOUNT_NO);

    // 주문 라벨 = 고른 계좌의 헤더 「N건」(D-23).
    const aOrders = rowsOfAccount(TODAY_ORDERS, E2E_ACCOUNT_NO).length;
    await openMeTab(page, '주문', 'orders');
    const header = todayOrdersCard(page).locator('h2 + span');
    await expect(header).toHaveText(`${aOrders}건`, { timeout: 15_000 });
    await expect(meTabCount(page, '주문')).toHaveText(String(aOrders));
    expect(ordersRequestMethods.length).toBeGreaterThan(0);
    const n = ordersRequestMethods.length;

    // 한 번 연 탭은 숨김으로 유지된다 — 다시 열어도 마운트 조회가 다시 나가지 않는다.
    await openMeTab(page, '현황', 'status');
    await openMeTab(page, '주문', 'orders');
    await expect(header).toBeVisible();
    await page.waitForTimeout(500);
    expect(ordersRequestMethods).toHaveLength(n);
  });

  test('PEY-3 딥링크 — ?tab=settings 는 설정으로 바로 · 화이트리스트 밖은 현황 · ?tab=orders 는 주문', async ({
    page,
  }) => {
    await page.goto('/me?tab=settings');
    await expect(meTab(page, '설정')).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
    await expect(page.locator('[data-slot="me-lc-defaults"]')).toBeVisible();
    // 현황 탭은 열지 않았다 — 상태줄은 마운트조차 되지 않는다.
    await expect(page.locator('[data-slot="me-status-bar"]')).toHaveCount(0);

    await page.goto('/me?tab=zzz');
    await expect(meTab(page, '현황')).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
    await expect(page.locator('[data-slot="me-status-bar"]')).toBeVisible();

    await page.goto('/me?tab=orders');
    await expect(meTab(page, '주문')).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
    await expect(todayOrdersCard(page)).toBeVisible();
  });

  test('PEY-4 뒤로가기 — 한 번에 이전 탭 하나씩(클릭당 기록 1개)', async ({ page }) => {
    await page.goto('/me');
    await waitForReady(page, 2);
    await openMeTab(page, '잔고', 'accounts');
    await openMeTab(page, '주문', 'orders');

    await page.goBack();
    await expect(page).toHaveURL(/[?&]tab=accounts(&|$)/);
    await expect(meTab(page, '잔고')).toHaveAttribute('aria-selected', 'true');
    await expect(accountCards(page).first()).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === '/me' && !url.searchParams.has('tab'));
    await expect(meTab(page, '현황')).toHaveAttribute('aria-selected', 'true');
  });

  test('PEY-5 폰 390 스크린샷 + K-1 sticky 관찰(단언 없음)', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/me');
    await waitForReady(page, 2);
    await relay.pushAccountState(ACCOUNT_A_STATE);
    await relay.pushAccountState(ACCOUNT_B_STATE);
    await expect(meTabCount(page, '잔고')).toBeVisible({ timeout: 15_000 });
    // 주문 라벨 숫자도 보이게 한 번 열었다가 현황으로 돌아온다(한 번 연 탭은 유지 — 숫자가 남는다).
    await openMeTab(page, '주문', 'orders');
    await expect(meTabCount(page, '주문')).toBeVisible({ timeout: 15_000 });
    await openMeTab(page, '현황', 'status');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: 'test-results/me-tabs-390.png', fullPage: true });

    /*
      K-1 — AppShell `<main>` 이 overflow-auto 인데 실제 스크롤 주체는 창이라 sticky 가 실효 없을 수 있다.
      값은 기록만 한다(고칠지는 사용자 결정). sticky 가 먹으면 top ≈ 0(앱 셸 상단 바 아래), 안 먹으면 음수.
    */
    await openMeTab(page, '설정', 'settings');
    const top = await page.evaluate(() => {
      const bar = () =>
        document.querySelector('[role="tablist"][aria-label="My page 탭"]')?.parentElement?.getBoundingClientRect().top ??
        null;
      window.scrollTo({ top: 0, behavior: 'instant' });
      const atTop = bar();
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      return {
        atTop,
        atEnd: bar(),
        scrollY: window.scrollY,
        mainScrollTop: document.querySelector('main')?.scrollTop ?? null,
      };
    });
    // sticky 가 먹으면 atEnd ≈ 앱 셸 상단 바 아래로 고정, 안 먹으면 atEnd ≈ atTop − scrollY(같이 스크롤됨).
    const note = `[PEY-K1] tabbar top=${top.atEnd} (scroll 0 에서 ${top.atTop}) scrollY=${top.scrollY} main.scrollTop=${top.mainScrollTop}`;
    test.info().annotations.push({ type: 'PEY-K1', description: note });
    console.log(note);
  });
});
