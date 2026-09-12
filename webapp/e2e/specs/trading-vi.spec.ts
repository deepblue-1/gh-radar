import { test, expect, type Locator, type Page } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import {
  DMA_MSG,
  E2E_ACCOUNT_NO,
  E2E_ISIN,
  E2E_LONG_NAME_ISIN,
  readViConfirmRequest,
  readViSetRequest,
  withLocalRelay,
  type LocalRelay,
} from '../fixtures/relay';
import { buildSetVITriggerRespFrame } from '../../../relay/tests/helpers/frames.js';

/**
 * Phase 16 Plan 14 Task 3 — VI 자동매수 화면 E2E (TRADE-02 · UI-SPEC B1~B9).
 *
 * ① 무엇을 증명하는가
 *   **진짜 브라우저 → 진짜 relay 프로세스 → 스텁 게이트웨이** 왕복이다. RTL 은
 *   `useRelayContext` 를 스텁으로 갈아끼우고 결선만 본다. 여기서 보는 것은 그 앞단이다 —
 *   「시작」이 정말 `SetVITriggerReq(11)` 로 게이트웨이까지 가는지, **그때 `run` 과 금액이
 *   무엇이었는지**, 확인 체크가 `ConfirmVIOrderReq(33)` 로 나가는지, 1초 틱이 실제로 돌아
 *   20초 경계에서 색이 바뀌는지.
 *
 * ② ★ 「보냈다」가 아니라 **무엇을 보냈는가**를 본다
 *   msg_type 만 세면 「값만 고쳤는데 가동이 꺼진다」를 잡지 못한다. `strategyRequests()` 의
 *   페이로드를 `readViSetRequest` 로 열어 `run` 을 직접 대조한다. 스텁 게이트웨이는 11 에
 *   자동 응답하지 않으므로 화면 상태로는 이 결손이 보이지 않는다.
 *
 * ③ ★ 두 트리가 모두 DOM 에 있다
 *   VI 주문내역도 미체결·잔고도 폭에 따라 CSS 로 갈린다. 조회할 때 트리를 좁히지 않으면
 *   같은 이름의 요소가 2벌이라 strict mode 위반으로 터진다.
 *
 * ④ ★ 시각 포맷은 **브라우저에서만** 드러난다
 *   `toLocaleTimeString("ko-KR", { hour12: false })` 는 Node/jsdom 에서 `00:57:16`,
 *   Chromium 에서 `0시 57분 16초` 다. 단위 테스트로는 영원히 안 잡히므로 여기서 본다.
 *
 * ⑤ 왜 serial + 단일 relay 인가
 *   relay wss 는 8090 **고정**이다(픽스처 상단 ④). `beforeAll` 한 번만 띄우고 파일 내부를
 *   직렬로 고정한다. 파일 **간** 충돌은 `playwright.config.ts` 의 단일 워커가 막는다.
 *
 * ⑥ ★ 실서버에 붙지 않는다 (D-27 / T-15-28)
 *   게이트웨이는 픽스처가 `127.0.0.1` 임의 포트에 띄운 스텁이고, 계좌는 스텁 로그인 응답의
 *   것이다. 사내망 주소·실계좌 리터럴은 이 파일 어디에도 없다(주석에도 적지 않는다).
 */

test.describe.configure({ mode: 'serial' });

const VI_URL = '/trading/vi';

/** UI-SPEC 이 기준으로 삼은 모바일 폭(§반응형 「모바일 390px」). */
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

/** 서버에 등록돼 있는 VI 설정 — 1,000만원 · 22%. 계좌는 로그인 응답의 계좌와 같아야 한다. */
const VI_CFG = {
  accountNo: E2E_ACCOUNT_NO,
  orderAmountKrw: 10_000_000n,
  checkRate: 22,
  priceType: 'U',
  run: false,
};

/**
 * VI 주문 5건 — 상태를 전부 다르게 둔다. 같은 상태만 있으면 배지가 잘못 붙어도
 * 눈치채지 못한다. 마지막 행은 **접수 전**(주문번호 없음)이라 확인 자체가 불가능하다.
 */
const VI_ORDERS = [
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
    // 부분체결은 **파생**이다 — 서버는 `Accepted` 를 보내고 체결수량만 채운다.
    filledQty: 120,
    confirmed: true,
    // 확인이 잠긴 행 — 체크를 열면 안 된다.
    confirmLocked: true,
  },
  {
    isin: E2E_ISIN,
    accountNo: E2E_ACCOUNT_NO,
    orderNo: '0030987',
    state: 'Filled',
    orderQty: 76,
    filledQty: 76,
    triggerPrice: 126_000,
    basePrice: 100_000,
    confirmed: true,
    confirmLocked: true,
  },
  {
    isin: E2E_ISIN,
    accountNo: E2E_ACCOUNT_NO,
    orderNo: '0030900',
    state: 'Cancelled',
    triggerPrice: 92_300,
    basePrice: 75_000,
    confirmLocked: true,
  },
  {
    isin: E2E_ISIN,
    accountNo: E2E_ACCOUNT_NO,
    orderNo: '0030888',
    state: 'Rejected',
    triggerPrice: 61_000,
    basePrice: 50_000,
    confirmLocked: true,
  },
  {
    isin: E2E_LONG_NAME_ISIN,
    accountNo: E2E_ACCOUNT_NO,
    // ★ 접수 전 = 주문번호 없음. 확인 체크가 열리면 안 된다(서버가 응답 없이 드롭한다).
    orderNo: '',
    state: 'Pending',
    triggerPrice: 12_345,
    basePrice: 10_000,
  },
] as const;

// ---------------------------------------------------------------------------
// 조회구 — 트리를 반드시 좁힌다 (③)
// ---------------------------------------------------------------------------

const page$ = (page: Page) => page.locator('[data-slot="vi-page"]');
const statusBar = (page: Page) => page.locator('[data-slot="vi-status-bar"]');
const runBar = (page: Page) => page.locator('[data-slot="vi-run-bar"]');
const runButton = (page: Page) => page.locator('[data-slot="vi-run-button"]');
const actionBar = (page: Page) => page.locator('[data-slot="dirty-action-bar"]');
const orderTable = (page: Page) => page.locator('[data-slot="vi-order-table"]');
const orderCards = (page: Page) => page.locator('[data-slot="vi-order-cards"]');
const desktopNav = (page: Page) => page.locator('aside nav[aria-label="주 메뉴"]');
const viSidebarBadge = (page: Page) =>
  desktopNav(page).locator('[data-slot="strategy-badge"][data-kind="viRun"]');

/** 폼 입력은 **id 로** 잡는다 — 더티가 되면 라벨에 `● ` 접두가 붙어 접근 이름이 바뀐다. */
const field = (page: Page, id: string): Locator => page.locator(`#${id}`);

/** 상태줄이 `ready` 가 될 때까지 기다린다 (relay 부팅 + DMA 로그인 왕복 여유). */
async function waitForReady(page: Page): Promise<void> {
  await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
}

/** 게이트웨이가 받은 VI 설정 요청 전량 (②). */
function viSetRequests(relay: LocalRelay) {
  return relay
    .strategyRequests()
    .map((r) => readViSetRequest(r.msgType, r.payload))
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/** 게이트웨이가 받은 VI 확인 요청 전량 (②). */
function viConfirmRequests(relay: LocalRelay) {
  return relay
    .strategyRequests()
    .map((r) => readViConfirmRequest(r.msgType, r.payload))
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/** 61 에코를 지금 밀어 넣는다 — 반영의 유일한 증거다. */
async function pushViEcho(relay: LocalRelay, run: boolean, over: Record<string, unknown> = {}) {
  const sock = await relay.gateway.waitForConnection(10_000);
  relay.gateway.sendFrame(sock, buildSetVITriggerRespFrame({ ...VI_CFG, ...over, run }));
}

/** 행 안의 **잎 요소**가 컨테이너 오른쪽 끝을 넘는지 — 잘림 진단의 유일한 방법이다. */
async function overflowingLeaves(container: Locator, rowSelector: string) {
  const box = await container.boundingBox();
  expect(box, '컨테이너 박스를 잴 수 없습니다').not.toBeNull();
  const right = box!.x + box!.width;
  const out: { text: string; over: number }[] = [];
  for (const row of await container.locator(rowSelector).all()) {
    const over = await row.evaluate(
      (el, edge) =>
        Array.from(el.querySelectorAll<HTMLElement>('*'))
          .map((child) => ({
            text: (child.textContent ?? '').slice(0, 24),
            // 1px = 반올림 여유. `getBoundingClientRect` 는 ancestor 클리핑에
            // 영향받지 않아 밀려난 **진짜** 좌표가 나온다.
            over: Math.round(child.getBoundingClientRect().right - edge),
          }))
          .filter((item) => item.over > 1),
      right,
    );
    out.push(...over);
  }
  return out;
}

// ===========================================================================

test.describe('Phase 16 Plan 14 — VI 자동매수 화면 (로컬 relay + 스텁 게이트웨이)', () => {
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
    // 전략 시드는 **연결 전에** 심는다 — relay 는 로그인 직후 21/34 를 물어본다.
    relay.seedViTrigger(VI_CFG);
    await mockStockApi(page);
  });

  test('1. 중지 상태 진입 — 설정 4행 + 고정 캡션 + 「시작」 버튼, 액션 바 없음', async ({
    page,
  }) => {
    await page.goto(VI_URL);
    await waitForReady(page);

    // 16-11 자리표시가 걷혔다.
    await expect(page.locator('[data-slot="surface-placeholder"]')).toHaveCount(0);
    await expect(page$(page)).toBeVisible();

    // B2 — 라벨 4행. 서버값이 그대로 채워진다(1,000만원 · 22%).
    await expect(page.locator('#vi-account')).toHaveValue(E2E_ACCOUNT_NO);
    await expect(field(page, 'vi-amount')).toHaveValue('1,000');
    await expect(field(page, 'vi-check-rate')).toHaveValue('22');
    await expect(page.getByRole('switch', { name: 'VI 마감 알림' })).toBeVisible();
    await expect(page.getByText('세션당 1건 · KRX · 주문가 = 상한가')).toBeVisible();

    // ★ 계좌 비밀번호·종목 검색·주문유형 UI 가 없다(B2).
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    // B3 — 중지 상태의 램프·문장·버튼.
    await expect(runBar(page)).toHaveAttribute('data-run', 'false');
    await expect(runBar(page)).toContainText('중지됨');
    await expect(runBar(page)).toContainText('「시작」을 누르면 확인 후 서버에 등록돼요');
    await expect(runButton(page)).toHaveText('시작');

    // B1 — 상태줄. 사이드바 VI 항목은 「중지」 배지다.
    await expect(statusBar(page)).toContainText('VI 중지');
    await expect(statusBar(page)).toContainText('오늘 VI 주문 0건');
    await expect(viSidebarBadge(page)).toHaveCount(0);
    await expect(
      desktopNav(page).locator('[data-slot="strategy-badge"][data-kind="viStop"]'),
    ).toBeVisible();

    // ★ 더티 0 이면 액션 바는 **렌더 자체가 없다**(B4). 숨김이 아니다.
    await expect(actionBar(page)).toHaveCount(0);

    // B5 — 주문 0건이면 빈 상태 문구다.
    await expect(page.locator('[data-slot="vi-order-empty"]')).toContainText(
      '오늘 발동된 VI 주문이 없어요',
    );
  });

  test('2. 값 변경 → 액션 바 → 「수정」 → 11 수신, **run 이 유지된다** (D-07)', async ({
    page,
  }) => {
    relay.seedViTrigger({ ...VI_CFG, run: true });
    await page.goto(VI_URL);
    await waitForReady(page);
    await expect(runBar(page)).toHaveAttribute('data-run', 'true', { timeout: 15_000 });

    await field(page, 'vi-amount').fill('1500');
    await expect(actionBar(page)).toContainText('변경한 값 1개가 아직 서버에 반영되지 않았어요');
    await expect(actionBar(page)).toContainText('가동 상태(run)는 그대로 유지돼요');

    /*
      ★ 1차 CTA 가 AI 채팅 FAB 과 겹치지 않는다. 예전에는 둘 다 `fixed … bottom … z-40` 이라
        겹치면 DOM 뒤인 FAB 이 포인터를 가로채 「수정」이 아예 눌리지 않았다(16-13 실측).
        VI 화면도 같은 바를 쓰므로 같은 결함이었다.
        quick-260912-mvo Q-01 이후 FAB 은 종목상세 본문에서만 렌더되어 `/trading/*` 에는
        존재하지 않는다 — 좌표 비교의 전제가 사라졌으므로 **부재 단언**으로 다시 쓴다.
        바가 레이아웃에서 통째로 빠져도 초록이 되지 않게, 「수정」의 박스가 실재함을 함께 잠근다.
    */
    await expect(page.getByRole('button', { name: 'AI' })).toHaveCount(0);
    const submitBox = await actionBar(page).getByRole('button', { name: '수정' }).boundingBox();
    expect(submitBox).not.toBeNull();
    expect(submitBox!.width).toBeGreaterThan(0);

    await actionBar(page).getByRole('button', { name: '수정' }).click();

    await expect
      .poll(() => viSetRequests(relay).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);

    // ★ ② — 페이로드를 직접 연다. 「보냈다」만으로는 `run` 이 눕혀졌는지 알 수 없다.
    const sent = viSetRequests(relay).at(-1)!;
    expect(sent).toMatchObject({
      accountNo: E2E_ACCOUNT_NO,
      // 화면은 만원, 와이어는 원. 한 자리가 어긋나면 1만 배 주문이다.
      orderAmountKrw: 15_000_000,
      checkRate: 22,
      priceType: 'U',
      // ★ 값 수정이 가동 상태를 건드리지 않는다.
      run: true,
    });

    // 에코가 오면 액션 바가 사라지고 상태줄에 시각이 찍힌다.
    await pushViEcho(relay, true, { orderAmountKrw: 15_000_000n });
    await expect(actionBar(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(field(page, 'vi-amount')).toHaveValue('1,500');

    /*
      ★ ④ 시각은 `HH:MM:SS` 고정폭이다. `toLocaleTimeString('ko-KR')` 이면 Chromium 에서
        `0시 57분 16초` 가 되어 `.mono` 계약이 깨진다 — 이 결손은 브라우저에서만 보인다.
    */
    const clock = await statusBar(page).locator('.mono').last().innerText();
    expect(clock).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  test('3. 「시작」 확인 다이얼로그 — 요약에 금액·상승률, 기본 포커스 취소, 확정 시 run=true', async ({
    page,
  }) => {
    await page.goto(VI_URL);
    await waitForReady(page);
    await expect(runButton(page)).toHaveText('시작');

    // 시작 전에 값을 바꾼다 — 다이얼로그는 **현재 폼 값**을 보여 줘야 한다.
    await field(page, 'vi-amount').fill('1500');
    await field(page, 'vi-check-rate').fill('25');
    await runButton(page).click();

    const dialog = page.getByTestId('vi-start-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('VI 자동매수를 시작할까요?');
    await expect(dialog).toContainText('조건에 맞는 VI 발동 종목을 자동으로 매수해요.');
    // ★ 무엇이 얼마로 나가는지 모른 채 시작하게 두지 않는다(T-16-10).
    await expect(dialog.locator('[data-slot="vi-confirm-summary"]')).toContainText('1,500만원');
    await expect(dialog.locator('[data-slot="vi-confirm-summary"]')).toContainText('25% 이상');
    await expect(dialog.locator('[data-slot="vi-confirm-summary"]')).toContainText('상한가 · KRX');
    await expect(dialog.locator('[data-slot="vi-confirm-warning"]')).toContainText(
      '시작하면 사람 확인 없이 주문이 나가요. 금액·상승률을 다시 확인해 주세요.',
    );

    // ★ 기본 포커스는 취소다 — Enter 연타 한 번에 무인 자동매수가 시작되면 안 된다(S-7).
    await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused();
    // 실행 버튼 옆에 또 다른 클릭 타깃(X 닫기)을 두지 않는다.
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0);

    await dialog.getByRole('button', { name: '시작' }).click();

    await expect
      .poll(() => viSetRequests(relay).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
    expect(viSetRequests(relay).at(-1)).toMatchObject({
      orderAmountKrw: 15_000_000,
      checkRate: 25,
      run: true,
    });
    expect(relay.requestLog()).toContain(DMA_MSG.SetVITriggerReq);

    // 반영의 증거는 **에코**다 — 상태줄과 사이드바가 같은 프레임으로 함께 움직인다.
    await pushViEcho(relay, true, { orderAmountKrw: 15_000_000n, checkRate: 25 });
    await expect(runBar(page)).toHaveAttribute('data-run', 'true', { timeout: 15_000 });
    await expect(runBar(page)).toContainText('자동매매 가동 중');
    await expect(runBar(page)).toContainText('다른 단말에서도 같은 상태예요');
    await expect(statusBar(page)).toContainText('VI 가동');
    await expect(viSidebarBadge(page)).toHaveText('가동');
    await expect(runButton(page)).toHaveText('중지');
  });

  test('4. 「중지」 확인 다이얼로그 — 경고 문구 + 기본 포커스 닫기 + run=false', async ({
    page,
  }) => {
    relay.seedViTrigger({ ...VI_CFG, run: true });
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(VI_URL);
    await waitForReady(page);
    await expect(runButton(page)).toHaveText('중지', { timeout: 15_000 });

    await runButton(page).click();
    const dialog = page.getByTestId('vi-stop-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('VI 자동매수를 중지할까요?');
    await expect(dialog).toContainText('새 VI 발동에 더 이상 주문하지 않아요.');
    await expect(dialog.locator('[data-slot="vi-confirm-summary"]')).toContainText('6건');
    // ★ 중지해도 **미체결은 유지된다**는 사실을 요약과 경고가 함께 말한다.
    await expect(dialog.locator('[data-slot="vi-confirm-summary"]')).toContainText('(유지)');
    await expect(dialog.locator('[data-slot="vi-confirm-warning"]')).toContainText(
      '이미 접수된 주문은 취소되지 않아요. 미체결은 아래 표에서 개별 취소해 주세요.',
    );
    await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();

    await dialog.getByRole('button', { name: '중지' }).click();
    await expect
      .poll(() => viSetRequests(relay).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
    expect(viSetRequests(relay).at(-1)).toMatchObject({ run: false });
  });

  test('5. VI 주문 6건 — 상태 배지 6종 + 부분체결 파생 + 잠긴 행 비활성', async ({ page }) => {
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(VI_URL);
    await waitForReady(page);

    const rows = orderTable(page).locator('[data-slot="vi-order-row"]');
    await expect(rows).toHaveCount(VI_ORDERS.length, { timeout: 15_000 });
    await expect(statusBar(page)).toContainText('오늘 VI 주문 6건');

    // 상태 배지 — 텍스트만으로 6종이 갈린다(색 없이도 읽힌다, WCAG 1.4.1).
    await expect(rows.nth(0)).toContainText('접수');
    // ★ 부분체결은 서버 상태가 아니라 `Accepted ∧ filledQty>0` 파생이다.
    await expect(rows.nth(1)).toContainText('부분체결 120/278');
    await expect(rows.nth(2)).toContainText('체결');
    await expect(rows.nth(3)).toContainText('취소');
    await expect(rows.nth(4)).toContainText('거부');
    await expect(rows.nth(5)).toContainText('접수 전');

    // 종목명은 relay 가 `stocks` 역매핑으로 채운다.
    await expect(rows.nth(0)).toContainText('삼성전자');
    await expect(rows.nth(1)).toContainText('한국제7호기업인수목적우선주식회사');

    // ★ 잠긴 행(confirm_locked)과 접수 전 행은 체크할 수 없다.
    const checks = orderTable(page).getByRole('checkbox');
    await expect(checks.nth(0)).toBeEnabled();
    for (const i of [1, 2, 3, 4, 5]) {
      await expect(checks.nth(i)).toBeDisabled();
      await expect(checks.nth(i)).toHaveAttribute('aria-disabled', 'true');
    }

    // ④ 시각 열이 `HH:MM:SS` 고정폭이다(로케일 포맷터면 한글 조사가 섞인다).
    const clock = await rows.nth(0).locator('td').nth(1).innerText();
    expect(clock).toMatch(/^\d{2}:\d{2}:\d{2}$/);

    // 9열 표의 `110초` 열 — 살아 있는 행만 숫자, 나머지는 `—`(빈 칸으로 두지 않는다).
    await expect(rows.nth(0).locator('td').nth(8)).toHaveText(/^\d+초$/);
    for (const i of [2, 3, 4, 5]) {
      await expect(rows.nth(i).locator('td').nth(8)).toHaveText('—');
    }

    // 캡션·하단 고지가 UI-SPEC 원문 그대로다.
    await expect(page.locator('[data-slot="vi-order-list"]')).toContainText(
      '확인 체크 = 119초 미확인 취소 면제',
    );
    await expect(page.locator('[data-slot="vi-order-tip"]')).toHaveText(
      '110초 미도달 취소는 서버 규칙이라 면제되지 않아요 · 접수 전(주문번호 없음)은 확인할 수 없어요',
    );
  });

  test('6. 확인 체크 → 33 수신 (다이얼로그 없이 즉시) → 73 이 정정한다 (D-10)', async ({
    page,
  }) => {
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(VI_URL);
    await waitForReady(page);
    await expect(orderTable(page).locator('[data-slot="vi-order-row"]')).toHaveCount(
      VI_ORDERS.length,
      { timeout: 15_000 },
    );

    const first = orderTable(page).getByRole('checkbox').first();
    await expect(first).toHaveAttribute('data-state', 'unchecked');
    await first.click();

    // ★ 확인 체크는 확인 다이얼로그를 거치지 않는다(D-10).
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // 낙관 반영이 즉시 보인다 — 73 을 기다리지 않는다.
    await expect(first).toHaveAttribute('data-state', 'checked');

    await expect
      .poll(() => viConfirmRequests(relay).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
    expect(viConfirmRequests(relay).at(-1)).toEqual({ orderNo: '0031245', confirmed: true });
    expect(relay.requestLog()).toContain(DMA_MSG.ConfirmVIOrderReq);

    // 서버는 확인 응답을 따로 주지 않고 **73 델타**로 정정한다.
    await relay.pushViOrderList([{ ...VI_ORDERS[0], confirmed: true }], false);
    await expect(first).toHaveAttribute('data-state', 'checked');
    // 정정이 왔으므로 다시 끌 수 있다(전송 중 잠금이 풀렸다).
    await first.click();
    await expect
      .poll(() => viConfirmRequests(relay).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);
    expect(viConfirmRequests(relay).at(-1)).toEqual({ orderNo: '0031245', confirmed: false });
  });

  test('7. 데드라인 — 1초 틱이 돌고 20초 경계에서 색·문구가 바뀐다 (B6 · C4)', async ({
    page,
  }) => {
    /*
      ★ **390px 에서 본다.** 진행바는 채택 목업대로 카드 트리에만 있다 — 데스크톱 9열 표의
        `110초` 열은 숫자만이고(바를 넣으면 9열이 992px 를 넘는다), 그 카드 트리는 ≥1280 에서
        `display:none` 이라 `toBeVisible()` 이 통과하지 않는다. 색 2단계(`data-hot`)는 두
        트리가 **같은 조각**을 쓰므로 여기서 둘 다 확인한다.
    */
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(VI_URL);
    await waitForReady(page);

    /*
      마감을 23초 뒤로 잡는다. 진입 시점에는 여유(≥20초)이고, 실제로 1초 틱이 돌아야만
      4초쯤 뒤에 임박(<20초)으로 넘어간다 — **틱이 멈춰 있으면 이 테스트가 끝나지 않는다.**
    */
    await relay.pushViOrderList(
      [
        {
          ...VI_ORDERS[0],
          deadline110Ms: BigInt(Date.now() + 23_000),
          deadline119Ms: BigInt(Date.now() + 32_000),
        },
      ],
      true,
    );

    const deadline = orderCards(page).locator('[data-slot="vi-deadline"]').first();
    await expect(deadline).toBeVisible({ timeout: 15_000 });
    await expect(deadline).toHaveAttribute('data-hot', 'false');
    await expect(deadline).toContainText('미확인 → 119초 취소');

    const bar = orderCards(page).getByRole('progressbar').first();
    const before = Number(await bar.getAttribute('aria-valuenow'));
    expect(before).toBeGreaterThan(20);
    // 상한은 24 다 — 잔여는 **올림**이라 23.4초가 24 로 읽힌다(마지막 1초를 0 으로 접지 않는다).
    expect(before).toBeLessThanOrEqual(24);

    // ★ 경계를 넘는다 — 색·숫자가 함께 바뀐다.
    await expect(deadline).toHaveAttribute('data-hot', 'true', { timeout: 15_000 });
    const after = Number(await bar.getAttribute('aria-valuenow'));
    expect(after).toBeLessThan(20);
    // 진행바 폭이 잔여에 비례한다(전이가 없으므로 계산값이 곧 표시값이다).
    const width = await bar
      .locator('[data-slot="vi-deadline-fill"]')
      .evaluate((el) => (el as HTMLElement).style.width);
    expect(width).toMatch(/^\d+%$/);

    // 데스크톱 표 트리(지금은 숨어 있다)에도 **같은 단계**가 걸린다 — 조각을 공유한다는 증거다.
    const tableDeadline = orderTable(page).locator('[data-slot="vi-deadline"]').first();
    await expect(tableDeadline).toBeHidden();
    await expect(tableDeadline).toHaveAttribute('data-hot', 'true');
    // 표 쪽은 숫자만 그린다(목업 정본) — 문구는 카드에만 있다.
    await expect(tableDeadline).toHaveText(/^\d+초$/);
  });

  test('8. `dma_credentials` 매핑 없음 → 게이트가 본문 전체를 대체한다 (B9)', async ({
    page,
  }) => {
    relay.clearDmaCredentials();

    await page.goto(VI_URL);

    const gate = page.locator('[data-slot="dma-gate"]');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toHaveAttribute('data-reason', 'unmapped');
    await expect(gate).toContainText('DMA 계정이 연결되지 않았어요');
    // 조사 처리 — 「VI 자동매수는」이지 「VI 자동매수은」이 아니다.
    await expect(gate).toContainText('VI 자동매수는 증권사 계정이 연결된');
    // 본문이 통째로 사라진다 — 게이트 옆에 설정 폼이 같이 보이면 안 된다.
    await expect(page$(page)).toHaveCount(0);
    await expect(page.locator('#vi-amount')).toHaveCount(0);
    // 매핑 없음에는 행동 버튼이 없다 — 사용자가 스스로 풀 수 있는 상태가 아니다.
    await expect(gate.getByRole('button')).toHaveCount(0);
  });

  test('10. VI 몫 통지만 그린다 — 상따 거부·relay 자기 거부를 먹지 않는다 (Pitfall 9)', async ({
    page,
  }) => {
    await page.goto(VI_URL);
    await waitForReady(page);

    // ① 상따 몫(종목이 붙은 계좌 통지) — VI 화면이 이걸 그리면 사용자가 멀쩡한 VI 를 껐다 켠다.
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      message: '주문 가능 금액이 부족합니다',
      kind: '',
    });
    // ② relay 자신의 요청 거부 — 이것도 VI 통지가 아니다.
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Relay',
      isin: '',
      accountNo: E2E_ACCOUNT_NO,
      message: '요청 형식이 올바르지 않습니다',
      kind: '',
    });

    // ★ 대조군을 먼저 넣어 두고 「아무것도 안 뜬다」를 확인한다 — 순서가 반대면
    //   「아직 안 왔다」와 「안 그린다」가 구분되지 않는다.
    await expect(page.locator('[data-slot="vi-server-error"]')).toHaveCount(0);

    // ③ VI 몫 — 종목 축이 없는 계좌 통지다.
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: '',
      accountNo: E2E_ACCOUNT_NO,
      message: 'VI 주문금액이 0 입니다',
      kind: '',
    });

    const errorSlot = page.locator('[data-slot="vi-server-error"]');
    await expect(errorSlot).toContainText('VI 주문금액이 0 입니다', { timeout: 15_000 });
    await expect(errorSlot).toHaveAttribute('role', 'alert');
    // 앞의 둘은 끝까지 흡수되지 않는다.
    await expect(errorSlot).not.toContainText('주문 가능 금액이 부족합니다');
    await expect(errorSlot).not.toContainText('요청 형식이 올바르지 않습니다');
  });

  test('11. ≥1280 — [설정 420 | 미체결→잔고 556] + 주문내역 전폭, 거래소 필터·전체 취소 (R3 · B7)', async ({
    page,
  }) => {
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(VI_URL);
    await waitForReady(page);

    await relay.pushAccountState({
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
        {
          orderNo: '0000135801',
          isin: E2E_LONG_NAME_ISIN,
          side: 'B',
          price: 1_234_567,
          orderQty: 10,
          filledQty: 0,
          unfilledQty: 10,
          exchange: 'NXT',
        },
      ],
      holdings: [{ isin: E2E_ISIN, stockQty: 120, sellableQty: 90, avgPrice: 91_250 }],
    });
    const unfilledRows = page.locator('[data-slot="account-unfilled-list"] [data-slot="account-unfilled-row"]');
    await expect(unfilledRows).toHaveCount(2, { timeout: 15_000 });

    /*
      ★ 레이아웃은 **실측 좌표**로 본다. 클래스 문자열만 보면 CSS 가 안 먹어도 통과한다.
        설정과 계좌 카드가 나란히(같은 y) 있고, 주문내역은 그 아래 전폭이다.
    */
    const settings = await page.locator('[data-slot="vi-settings-card"]').boundingBox();
    const accountsBox = await page.locator('[data-slot="vi-accounts"]').boundingBox();
    const listBox = await page.locator('[data-slot="vi-order-list"]').boundingBox();
    expect(settings).not.toBeNull();
    expect(accountsBox).not.toBeNull();
    expect(listBox).not.toBeNull();
    expect(Math.abs(settings!.y - accountsBox!.y)).toBeLessThan(8);
    expect(accountsBox!.x).toBeGreaterThan(settings!.x + settings!.width - 8);
    expect(Math.round(settings!.width)).toBe(420);
    // 주문내역은 두 컬럼을 합친 폭으로 아래에 온다(9열 표가 556px 에서는 잘린다).
    expect(listBox!.y).toBeGreaterThan(accountsBox!.y);
    expect(listBox!.width).toBeGreaterThan(accountsBox!.width + settings!.width - 8);

    /*
      ★ 미체결 → 잔고가 **세로 스택**이다(R3). `stack` 이 빠지면 계좌 패널이 ≥1280 에서
        자기 안에서 2열로 쪼개져 한 칸이 270px 이 된다.
    */
    const unf = await page.locator('[data-testid="account-unfilled"]').boundingBox();
    const hold = await page.locator('[data-testid="account-holdings"]').boundingBox();
    expect(unf).not.toBeNull();
    expect(hold).not.toBeNull();
    expect(hold!.y).toBeGreaterThan(unf!.y + unf!.height - 8);
    expect(Math.abs(hold!.x - unf!.x)).toBeLessThan(2);

    // B7 — 거래소 필터가 넘기는 행을 줄인다.
    const filter = page.locator('[data-slot="vi-exchange-filter"]');
    await expect(filter).toBeVisible();
    await filter.getByRole('button', { name: 'NXT' }).click();
    await expect(unfilledRows).toHaveCount(1);
    await expect(unfilledRows.first()).toContainText('0000135801');
    await filter.getByRole('button', { name: '전체' }).click();
    await expect(unfilledRows).toHaveCount(2);

    // B7 — 「전체 취소」도 확인 다이얼로그를 거치고 기본 포커스는 닫기다.
    await page.locator('[data-slot="vi-cancel-all"]').click();
    const dialog = page.getByTestId('vi-cancel-all-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('미체결 주문을 전부 취소할까요?');
    await expect(dialog).toContainText('2건이 한 번에 취소돼요.');
    await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();
    await dialog.getByRole('button', { name: '닫기' }).click();
    await expect(dialog).toBeHidden();

    // 미체결 행에 출처 태그 `VI` 가 붙는다(UI-SPEC §미체결 출처 태그).
    await expect(unfilledRows.first()).toContainText('VI');
  });

  test('9. 390px — 카드 행 + 세로 순서(주문내역이 미체결보다 위) + 잘림 0 (R6)', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(VI_URL);
    await waitForReady(page);
    await expect(orderCards(page).locator('[data-slot="vi-order-row"]')).toHaveCount(
      VI_ORDERS.length,
      { timeout: 15_000 },
    );

    // 미체결·잔고에 **긴 종목명 + 큰 숫자**를 심는다 — 짧은 값만으로는 잘림 단언이 공허해진다.
    await relay.pushAccountState({
      unfilled: [
        {
          orderNo: '0000135801',
          isin: E2E_LONG_NAME_ISIN,
          side: 'B',
          price: 1_234_567,
          orderQty: 999_999,
          filledQty: 0,
          unfilledQty: 999_999,
          exchange: 'NXT',
        },
      ],
      holdings: [{ isin: E2E_ISIN, stockQty: 120, sellableQty: 90, avgPrice: 91_250 }],
    });
    await expect(page.locator('[data-slot="account-unfilled-row"]')).toHaveCount(1, {
      timeout: 15_000,
    });

    // ★ 모바일 세로 순서(①): 설정 → VI 주문내역 → 미체결·잔고.
    const settingsBox = await page.locator('[data-slot="vi-settings-card"]').boundingBox();
    const listBox = await page.locator('[data-slot="vi-order-list"]').boundingBox();
    const accountsBox = await page.locator('[data-slot="vi-accounts"]').boundingBox();
    expect(settingsBox).not.toBeNull();
    expect(listBox).not.toBeNull();
    expect(accountsBox).not.toBeNull();
    expect(settingsBox!.y).toBeLessThan(listBox!.y);
    expect(listBox!.y).toBeLessThan(accountsBox!.y);

    // 좁은 폭에서는 **표를 쓰지 않는다**(R6). 카드 트리만 보인다.
    await expect(orderCards(page)).toBeVisible();
    await expect(orderTable(page)).toBeHidden();

    /*
      ★ 그리드 자식의 `min-width` **규칙 자체**를 잠근다. 실측 폭으로는 못 잡는다 —
        표 컨테이너의 가로 스크롤이 넘침을 흡수해 `min-width:auto` 로 되돌려도 아무것도
        넘치지 않는 것처럼 보인다(16-13 실측 함정).
    */
    const minWidths = await page
      .locator('[data-slot="vi-body-grid"]')
      .evaluate((el) => Array.from(el.children).map((c) => getComputedStyle(c).minWidth));
    expect(minWidths).toEqual(['0px', '0px', '0px']);

    // ★ 잘림 진단은 행 폭이 아니라 **행 안의 잎 요소 좌표**다.
    expect(await overflowingLeaves(orderCards(page), '[data-slot="vi-order-row"]')).toEqual([]);
    expect(
      await overflowingLeaves(
        page.locator('[data-slot="account-unfilled-list"]'),
        '[data-slot="account-unfilled-row"]',
      ),
    ).toEqual([]);
  });
});
