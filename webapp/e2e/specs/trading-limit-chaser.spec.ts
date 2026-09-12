import { test, expect, type Locator, type Page } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';
import {
  DMA_MSG,
  E2E_ACCOUNT_NO,
  E2E_ISIN,
  E2E_LONG_NAME_ISIN,
  withLocalRelay,
  type LocalRelay,
} from '../fixtures/relay';

/**
 * Phase 16 Plan 13 Task 3 — 상따 전략 화면 E2E (TRADE-01 · UI-SPEC A1~A14).
 *
 * ① 무엇을 증명하는가
 *   **진짜 브라우저 → 진짜 relay 프로세스 → 스텁 게이트웨이** 왕복이다. RTL 은
 *   `useRelayContext` 를 스텁으로 갈아끼우고 결선만 본다. 여기서 보는 것은 그 앞단이다 —
 *   스위치를 켜면 정말 `SetLimitChaserReq(10)` 이 게이트웨이까지 가는지, 60 에코가 폼과
 *   사이드바를 동시에 움직이는지, **에코가 오지 않을 때** 화면이 무엇을 말하는지.
 *   이 구간은 단위로 쪼개면 각 조각이 통과하면서도 이어 붙였을 때 안 되는 대표 구간이다.
 *
 * ② 왜 serial + 단일 relay 인가
 *   relay wss 는 8090 **고정**이다(픽스처 상단 ④). `beforeAll` 한 번만 띄우고 파일 내부를
 *   직렬로 고정한다. 파일 **간** 충돌은 `playwright.config.ts` 의 단일 워커가 막는다.
 *
 * ③ ★ 실서버에 붙지 않는다 (D-27 / T-15-28)
 *   게이트웨이는 픽스처가 `127.0.0.1` 임의 포트에 띄운 스텁이고, 계좌는 스텁 로그인 응답의
 *   것이다. 사내망 주소·실계좌 리터럴은 이 파일 어디에도 없다(주석에도 적지 않는다).
 *
 * ④ 데스크톱·모바일 두 트리가 **모두 DOM 에 있다**
 *   호가 사다리도 미체결·잔고도 폭에 따라 CSS 로 갈린다. 조회할 때 트리를 좁히지 않으면
 *   같은 이름의 요소가 2벌이 되어 strict mode 위반으로 터진다. 아래 조회구가 전부
 *   `data-slot` 으로 트리를 못박는 이유다.
 */

test.describe.configure({ mode: 'serial' });

const NEW_URL = '/trading/limit-chaser/new';
const STRATEGY_KEY = `${E2E_ISIN}:${E2E_ACCOUNT_NO}:KRX`;
const EDIT_URL = `/trading/limit-chaser/${encodeURIComponent(STRATEGY_KEY)}`;

/** UI-SPEC 이 기준으로 삼은 모바일 폭(§반응형 「모바일 390px」). */
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

/** 스텁 호가의 상한가 — 종목 선택 시딩이 이 값으로 채워진다(실시간 값이 REST 보다 이긴다). */
const LIVE_UPPER_LIMIT = '127,400';

// ---------------------------------------------------------------------------
// 조회구 — 트리를 반드시 좁힌다 (위 ④)
// ---------------------------------------------------------------------------

const page$ = (page: Page) => page.locator('[data-slot="limit-chaser-page"]');
const statusBar = (page: Page) => page.locator('[data-slot="lc-status-bar"]');
const ladder = (page: Page) => page.locator('[data-slot="orderbook-ladder"][data-variant="chaser"]');
const actionBar = (page: Page) => page.locator('[data-slot="dirty-action-bar"]');
const logRows = (page: Page) => page.locator('[data-slot="strategy-log-row"]');
const banner = (page: Page) => page.locator('[data-slot="lc-echo-banner"]');
const buyPane = (page: Page) => page.locator('[data-pane="buy"]');
const sellPane = (page: Page) => page.locator('[data-pane="sell"]');
const desktopNav = (page: Page) => page.locator('aside nav[aria-label="주 메뉴"]');
const strategyItems = (page: Page) => desktopNav(page).locator('[data-strategy-key]');

/** 폼 입력은 **id 로** 잡는다 — 더티가 되면 라벨에 `● ` 접두가 붙어 접근 이름이 바뀐다. */
const field = (page: Page, id: string): Locator => page.locator(`#${id}`);

/** 상태줄이 `ready` 가 될 때까지 기다린다 (relay 부팅 + DMA 로그인 왕복 여유). */
async function waitForReady(page: Page): Promise<void> {
  await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
}

/** 게이트웨이가 `SetLimitChaserReq(10)` 을 n건 받을 때까지 기다린다 — 에코 주입 전 경주 방지. */
async function waitForSetAtGateway(relay: LocalRelay, count: number): Promise<void> {
  await expect
    .poll(
      () => relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length,
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(count);
}

/**
 * 검색으로 종목을 고른다. 고르면 구독이 서고 실시간 상한가로 다시 시딩된다.
 *
 * ★ 조회를 **상단 카드로 좁힌다.** 앱 헤더에도 「종목 검색 열기」 버튼이 2개(데스크톱/모바일)
 *   있어서 `getByLabel('종목 검색')` 은 부분 일치로 셋을 다 잡는다.
 */
async function pickStock(page: Page): Promise<void> {
  await page.locator('[data-slot="lc-stock-card"]').getByRole('searchbox').fill('삼성');
  const option = page.locator('[data-slot="lc-search-option"]').first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}

// ===========================================================================

test.describe('Phase 16 Plan 13 — 상따 전략 화면 (로컬 relay + 스텁 게이트웨이)', () => {
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
    await mockStockApi(page, { searchResults: [FIXTURE_SAMSUNG] });
  });

  test('1. 빈 폼 진입 — 제목(부제 없음) + WinForms 기본값 + 액션 바 미렌더', async ({ page }) => {
    await page.goto(NEW_URL);
    await waitForReady(page);

    await expect(page.getByRole('heading', { name: '상따', exact: true })).toBeVisible();
    // 신규 진입 안내 부제는 걷어냈다(quick 260911-tuk).
    await expect(
      page.getByText('종목을 고르면 아래 값이 상한가 기준으로 채워져요'),
    ).toHaveCount(0);

    // 기본값 — `LimitChaserForm.cs` 상수 이식분이다(주문금액 10만원 · 감시잔량 10,000).
    await expect(field(page, 'lc-buy-order-amount')).toHaveValue('10');
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000');

    // 게이트 3종 전부 OFF.
    for (const name of ['매수주문 켜기', '매도주문 켜기', '한방체결 켜기']) {
      await expect(page.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false');
    }

    // ★ 더티 0 이면 액션 바는 **렌더 자체가 없다**(A10). 숨김이 아니다.
    await expect(actionBar(page)).toHaveCount(0);
    // 가격 칩 행은 **행 자체를 없앴다**(260912-gyz) — 종목 유무와 무관하게 DOM 에 없다.
    await expect(page.locator('[data-slot="lc-price-chips"]')).toHaveCount(0);
    // 인라인 검색이 상단 카드 안에 있다(헤더의 전역 검색과 다른 컨트롤이다).
    await expect(page.locator('[data-slot="lc-stock-card"]').getByRole('searchbox')).toBeVisible();
    // 16-11 자리표시가 걷혔다.
    await expect(page.locator('[data-slot="surface-placeholder"]')).toHaveCount(0);
    await expect(page$(page)).toBeVisible();
  });

  test('2. 종목 선택 → 가격 5칸이 상한가로 시딩되고 호가 카드가 뜬다', async ({ page }) => {
    await page.goto(NEW_URL);
    await waitForReady(page);
    await pickStock(page);

    // 실시간 호가가 도착하면 그 상한가가 정본이다 — 폼과 **헤더 8칸**이 같은 숫자를 말해야 한다.
    for (const id of [
      'lc-buy-watch-price',
      'lc-buy-order-price',
      'lc-sell-watch-price',
      'lc-sell-order-price',
      'lc-sweep-watch-price',
    ]) {
      await expect(field(page, id)).toHaveValue(LIVE_UPPER_LIMIT, { timeout: 15_000 });
    }
    /*
      ★ 증거를 **살아 있는 표면으로 옮겼다** (260912-gyz). 옛 단언은 칩 행이 「상한가
        {값}」을 담기를 요구했는데, 260911-w5h 가 상한가 칩을 걷은 시점부터 이미 거짓이었고
        이번에 칩 행 자체가 사라졌다. 의도(폼과 화면이 **같은 상한가**를 말한다)는 그대로
        두고 그 증거를 헤더 종목정보 8칸으로 옮긴다 — 지웠으면 다음에 시딩이 깨져도 아무도
        모른다.
    */
    await expect(page.locator('[data-slot="lc-price-chips"]')).toHaveCount(0);
    const quoteGrid = page.locator('[data-slot="lc-quote-grid"]');
    await expect(quoteGrid).toContainText('상한');
    await expect(quoteGrid).toContainText(LIVE_UPPER_LIMIT);

    // 호가 10단이 실제로 그려진다(매도 10 + 매수 10).
    await expect(ladder(page).locator('[data-slot="ladder-row"]')).toHaveCount(20);
    await expect(ladder(page)).toContainText('99,000'); // 매도 10호가
  });

  test('3. 스위치 즉시 전송 → 게이트웨이 10 수신 → 60 에코 → 배지·로그·사이드바', async ({
    page,
  }) => {
    await page.goto(NEW_URL);
    await waitForReady(page);
    await pickStock(page);
    await expect(field(page, 'lc-buy-order-price')).toHaveValue(LIVE_UPPER_LIMIT, {
      timeout: 15_000,
    });

    // 등록 전에는 사이드바 3단이 비어 있다.
    await expect(strategyItems(page)).toHaveCount(0);

    /*
      ★ WR-06 — 발주할 수 없는 전략은 무장되지 않는다.
        기본 주문금액 10만원으로 127,400원 종목을 사면 `floor(10만 / 12.74만) = 0주` 다.
        0주 발주는 「켜졌는데 아무 일도 안 하는」 전략이므로 스위치가 잠기고 이유가 뜬다.
        금액을 올리면 그때 켤 수 있게 된다 — 이 왕복 자체가 회귀 잠금이다.
    */
    const buySwitch = page.getByRole('switch', { name: '매수주문 켜기' });
    await expect(buySwitch).toBeDisabled();
    await expect(page.locator('[data-slot="lc-arm-blocked"]').first()).toBeVisible();

    await field(page, 'lc-buy-order-amount').fill('50'); // 50만원 → 3주
    await expect(buySwitch).toBeEnabled();

    await buySwitch.click();

    // ★ 확인 다이얼로그가 없다(D-05) — 그 자리에서 바로 나간다.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await waitForSetAtGateway(relay, 1);

    await relay.pushLimitChaserEcho({ buyEnabled: true });

    await expect(statusBar(page)).toContainText('매수 ON', { timeout: 15_000 });
    await expect(logRows(page).first()).toContainText('매수 무장');
    // 사이드바 3단에 항목이 서고 원 아이콘이 매수만 채워진다.
    await expect(strategyItems(page)).toHaveCount(1);
    await expect(strategyItems(page).first().getByRole('img')).toHaveAttribute(
      'aria-label',
      '매수 켜짐 · 매도 꺼짐',
    );
  });

  test('4. 값 변경 → 액션 바 「1개」 → 「수정」 → 10 재전송 → 에코 후 액션 바 소멸', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await page.goto(EDIT_URL);
    await waitForReady(page);
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000', { timeout: 15_000 });

    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    await field(page, 'lc-buy-watch-qty').fill('8000');
    await expect(actionBar(page)).toContainText('변경한 값 1개가 아직 서버에 반영되지 않았어요');

    /*
      ★ 1차 CTA 가 AI 채팅 FAB 과 **겹치지 않는다.**
        둘 다 `fixed … bottom … z-40` 이라 겹치면 DOM 뒤인 FAB 이 포인터 이벤트를 가로채
        「수정」이 아예 눌리지 않는다(실측 결함 — 이 케이스가 처음 잡았다). 클릭 성공만으로는
        회귀 원인이 「타이밍」으로 오독되므로 좌표로 직접 못박는다.
    */
    const fabBox = await page.getByRole('button', { name: 'AI' }).boundingBox();
    const submitBox = await actionBar(page).getByRole('button', { name: '수정' }).boundingBox();
    expect(fabBox).not.toBeNull();
    expect(submitBox).not.toBeNull();
    expect(submitBox!.x + submitBox!.width).toBeLessThanOrEqual(fabBox!.x);

    await actionBar(page).getByRole('button', { name: '수정' }).click();
    await waitForSetAtGateway(relay, before + 1);

    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 8_000 });

    // 반영의 유일한 증거는 에코다 — 액션 바가 사라지고 상태줄에 시각이 찍힌다.
    await expect(actionBar(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(statusBar(page)).toContainText(/반영 \d{1,2}:\d{2}:\d{2}/);
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('8,000');
  });

  test('5. 다른 단말 변경 — 더티를 덮고 6초 배너 + 로그 1줄 (D-11)', async ({ page }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await page.goto(EDIT_URL);
    await waitForReady(page);
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000', { timeout: 15_000 });

    // 사용자가 고치는 중(= 더티)인데 **보내지는 않았다**.
    await field(page, 'lc-buy-watch-qty').fill('8000');
    await expect(actionBar(page)).toBeVisible();

    // 다른 단말이 바로 그 필드를 또 다른 값으로 바꾼다.
    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 5_000 });

    // 서버가 이긴다 — 편집 중 보호·보류가 없다.
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('5,000', { timeout: 15_000 });
    await expect(banner(page)).toContainText('다른 단말에서 변경돼 수정하던 값 1개가 서버 값으로 바뀌었어요');
    await expect(banner(page)).toHaveAttribute('role', 'status');
    await expect(actionBar(page)).toHaveCount(0);

    // 배너는 6초 뒤 사라지지만 **로그는 남는다** — 「아까 뭐라고 떴었지」의 유일한 답이다.
    await expect(banner(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(logRows(page).filter({ hasText: '다른 단말에서 변경' })).toHaveCount(1);
  });

  test('6. 매수·매도 OFF = 삭제 — cfg 가 `D` 로 나가고 에코 후 목록·폼이 비워진다 (D-08)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true, buyWatchQty: 8_000 }]);
    await page.goto(EDIT_URL);
    await waitForReady(page);
    await expect(strategyItems(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('8,000');

    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    // 마지막으로 켜져 있던 게이트를 끈다 = 삭제 의사다. **삭제 버튼은 존재하지 않는다.**
    await expect(page.getByRole('button', { name: /삭제/ })).toHaveCount(0);
    await page.getByRole('switch', { name: '매수주문 켜기' }).click();
    await waitForSetAtGateway(relay, before + 1);

    // 삭제 판정은 스위치가 아니라 **서버 에코의 `crud`** 다 (Pitfall 7).
    await relay.pushLimitChaserEcho({ crud: 'D', buyEnabled: false, buyWatchQty: 8_000 });

    await expect(strategyItems(page)).toHaveCount(0, { timeout: 15_000 });
    // 폼이 신규 기본값으로 돌아간다 — 값만 지우면 더티 기준선이 남는다.
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000');
    await expect(logRows(page).filter({ hasText: '전략이 삭제됐어요' })).toHaveCount(1);
  });

  test('7. 서버 거부(ServerMessage ERROR)가 상태줄과 로그 **양쪽**에 남는다 (T-16-07)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await page.goto(EDIT_URL);
    await waitForReady(page);
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000', { timeout: 15_000 });

    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'SetLimitChaser',
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      message: '허용되지 않은 거래소입니다',
      kind: '',
    });

    // ★ 조용한 무시 0 — 두 곳 다에 남아야 한다.
    const bar = page.locator('[data-slot="lc-server-error"]');
    await expect(bar).toContainText('허용되지 않은 거래소입니다', { timeout: 15_000 });
    await expect(bar).toHaveAttribute('role', 'alert');
    await expect(logRows(page).filter({ hasText: '허용되지 않은 거래소입니다' })).toHaveCount(1);
    await expect(
      logRows(page).filter({ hasText: '허용되지 않은 거래소입니다' }),
    ).toHaveAttribute('data-level', 'error');
  });

  test('7b. 종목 없는 Account 통지(= VI 몫)는 상따 화면이 먹지 않는다 (Pitfall 9)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await page.goto(EDIT_URL);
    await waitForReady(page);
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000', { timeout: 15_000 });

    // 종목 축이 없는 계좌 통지 — VI 자동매수 거부다.
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: '',
      accountNo: E2E_ACCOUNT_NO,
      message: 'VI 주문금액이 0 입니다',
      kind: '',
    });
    // 상따 화면이 이걸 그리면 사용자가 멀쩡한 상따 전략을 껐다 켠다 = 두 번째 발주.
    await expect(page.locator('[data-slot="lc-server-error"]')).toHaveCount(0);
    await expect(logRows(page).filter({ hasText: 'VI 주문금액이 0 입니다' })).toHaveCount(0);

    // 대조군 — 같은 통지에 종목만 붙으면 상따 몫이라 표시된다.
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      message: '주문 가능 금액이 부족합니다',
      kind: '',
    });
    await expect(page.locator('[data-slot="lc-server-error"]')).toContainText(
      '주문 가능 금액이 부족합니다',
      { timeout: 15_000 },
    );
  });

  test('8. `dma_credentials` 매핑 없음 → 게이트가 본문 전체를 대체한다 (A14)', async ({ page }) => {
    relay.clearDmaCredentials();

    await page.goto(NEW_URL);

    const gate = page.locator('[data-slot="dma-gate"]');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toContainText('DMA 계정이 연결되지 않았어요');
    // 본문이 통째로 사라진다 — 게이트 옆에 폼이 같이 보이면 안 된다.
    await expect(page$(page)).toHaveCount(0);
    await expect(ladder(page)).toHaveCount(0);
    // 매핑 없음에는 행동 버튼이 없다 — 사용자가 스스로 풀 수 있는 상태가 아니다.
    await expect(gate.getByRole('button')).toHaveCount(0);
  });

  test('9. 390px — 호가 42% | 설정 58% 2열, 탭당 한 pane, 잘림 0 (R7)', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await page.goto(EDIT_URL);
    await waitForReady(page);
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000', { timeout: 15_000 });

    // 미체결·잔고에 **긴 종목명**을 심는다 — 짧은 이름만으로는 잘림 단언이 공허해진다.
    await relay.pushAccountState({
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
      holdings: [{ isin: E2E_ISIN, stockQty: 120, sellableQty: 90, avgPrice: 91_250 }],
    });

    /*
      ★ 2열 배치는 **실측 좌표**로 확인한다. 클래스 문자열만 보면 CSS 가 안 먹어도 통과한다.
        호가 컬럼과 설정 컬럼의 y 가 같으면 나란히 있는 것이고, 세로로 쌓였으면 다르다.
    */
    const ladderBox = await page.locator('[data-slot="lc-orderbook-card"]').boundingBox();
    const formBox = await page.locator('[data-slot="limit-chaser-form"]').boundingBox();
    expect(ladderBox).not.toBeNull();
    expect(formBox).not.toBeNull();
    expect(Math.abs(ladderBox!.y - formBox!.y)).toBeLessThan(8);
    expect(formBox!.x).toBeGreaterThan(ladderBox!.x + ladderBox!.width - 8);
    // 호가 42% — 두 컬럼 폭 비율이 목업 계약대로다(gap 8 여유 ±4%).
    const ratio = ladderBox!.width / (ladderBox!.width + formBox!.width + 8);
    expect(ratio).toBeGreaterThan(0.38);
    expect(ratio).toBeLessThan(0.46);

    /*
      ★ 그리드 자식의 `min-width` **규칙 자체**를 잠근다. 실측 폭으로는 못 잡는다 —
        표 컨테이너의 가로 스크롤이 넘침을 흡수해 `min-width:auto` 로 되돌려도 아무것도
        넘치지 않는 것처럼 보인다(실측으로 확인한 함정).
    */
    const minWidths = await page.locator('[data-slot="lc-body-grid"]').evaluate((el) =>
      Array.from(el.children).map((child) => getComputedStyle(child).minWidth),
    );
    expect(minWidths).toEqual(['0px', '0px']);

    /*
      탭 — 활성 pane 하나만 보인다. 비활성은 `display:none` 이라 접근성 트리에서도 빠진다.
      ★ 260912-k2x — 숨김이 DOM **속성**에서 **CSS 클래스**로 옮겨졌으므로 단언도
        가시성으로 옮긴다. **성질은 같다** — `toBeHidden()` 은 `display:none` 을 그대로
        잡는다(Playwright 의 가시성 판정이 계산된 스타일을 본다). 판정 기준이 본문 폭이 된
        이유는 `styles/globals.css` §2.2b 에 있다.
    */
    await expect(buyPane(page)).toBeVisible();
    await expect(sellPane(page)).toBeHidden();
    await page.getByRole('tab', { name: '매도' }).click();
    await expect(sellPane(page)).toBeVisible();
    await expect(buyPane(page)).toBeHidden();

    /*
      좁은 폭 호가는 **2줄 행 · 340px 박스 스크롤**이고, 데스크톱의 최근 체결 **열** 대신
      사다리 아래 **compact 체결 테이프**가 온다(A11a · 260911-w5h).
      행 수는 여전히 20 이다 — 10단 전부를 스크롤로 본다(`depth` 는 10 그대로다).
    */
    await expect(ladder(page).locator('[data-slot="ladder-row-mobile"]')).toHaveCount(20);
    await expect(
      ladder(page).locator('[data-slot="ladder-row-mobile"] [data-slot="ladder-fill-cell"]'),
    ).toHaveCount(0);
    await expect(
      ladder(page).locator('[data-slot="trade-tape"][data-compact="true"]'),
    ).toHaveCount(1);
    // 제목행도 컬럼헤더도 없다 — 140px 칼럼에서 3칸 헤더는 순 소음이다.
    await expect(
      ladder(page).locator('[data-slot="trade-tape"][data-compact="true"] thead'),
    ).toHaveCount(0);

    /*
      ★ 잘림 진단은 문서 스크롤폭도, 행의 폭도 아니다 — **행 안의 잎 요소 좌표**다.
        행은 블록이라 넘쳐도 폭이 컨테이너와 같고 `overflow-hidden` 이 넘침을 삼킨다.
        `getBoundingClientRect` 는 ancestor 클리핑에 영향받지 않아 밀려난 진짜 좌표가 나온다.
    */
    const list = page.locator('[data-slot="account-unfilled-list"]');
    const listBox = await list.boundingBox();
    expect(listBox).not.toBeNull();
    const listRight = listBox!.x + listBox!.width;
    for (const row of await page.locator('[data-slot="account-unfilled-row"]').all()) {
      const overflowing = await row.evaluate(
        (el, right) =>
          Array.from(el.querySelectorAll<HTMLElement>('*'))
            .map((child) => ({
              text: (child.textContent ?? '').slice(0, 24),
              over: Math.round(child.getBoundingClientRect().right - right), // 1px = 반올림 여유
            }))
            .filter((item) => item.over > 1),
        listRight,
      );
      expect(overflowing).toEqual([]);
    }

    // 폼 컬럼도 같은 기준으로 본다 — 라벨 60px + 입력이 204px 안에 들어가야 한다.
    // ★ 먼저 매수 탭으로 돌아온다. 숨은 pane 은 `boundingBox()` 가 null 이라 측정 자체가 안 된다.
    await page.getByRole('tab', { name: '매수' }).click();
    await expect(buyPane(page)).toBeVisible();
    const paneBox = await buyPane(page).boundingBox();
    expect(paneBox).not.toBeNull();
    const paneRight = paneBox!.x + paneBox!.width;
    const formOverflow = await buyPane(page).evaluate(
      (el, right) =>
        Array.from(el.querySelectorAll<HTMLElement>('*'))
          .map((child) => ({
            text: (child.textContent ?? '').slice(0, 24),
            over: Math.round(child.getBoundingClientRect().right - right),
          }))
          .filter((item) => item.over > 1),
      paneRight,
    );
    expect(formOverflow).toEqual([]);
  });

  test('10. 더티 상태로 사이드바 다른 항목 클릭 → 확인 UI 가 뜨고 머무를 수 있다', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await page.goto(EDIT_URL);
    await waitForReady(page);
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000', { timeout: 15_000 });

    // 더티가 없을 때는 이동이 막히지 않는다 — 그 대조군이 없으면 「항상 물어보는 화면」과
    // 구분되지 않는다.
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss(); // 「머무른다」
    });
    await desktopNav(page).getByRole('link', { name: '홈' }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    expect(dialogs).toEqual([]);

    // 이제 더티를 만들고 같은 조작을 한다.
    await page.goto(EDIT_URL);
    await waitForReady(page);
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('10,000', { timeout: 15_000 });
    await field(page, 'lc-buy-watch-qty').fill('8000');
    await expect(actionBar(page)).toBeVisible();

    await desktopNav(page).getByRole('link', { name: '홈' }).click();

    await expect.poll(() => dialogs.length, { timeout: 15_000 }).toBe(1);
    expect(dialogs[0]).toContain('수정하지 않은 값이 있어요');
    // 「머무른다」를 골랐으므로 이 화면에 그대로 있고 고치던 값도 남아 있다.
    await expect(page$(page)).toBeVisible();
    await expect(field(page, 'lc-buy-watch-qty')).toHaveValue('8,000');
  });
});
