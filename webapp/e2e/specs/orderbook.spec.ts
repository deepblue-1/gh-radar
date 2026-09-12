import { test, expect, type Page } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { mockNewsApi, buildNewsList } from '../fixtures/news';
import { mockDiscussionsApi, buildDiscussionList } from '../fixtures/discussions';
import { mockThemeChips } from '../fixtures/themes';
import {
  DMA_MSG,
  E2E_ISIN,
  E2E_LONG_NAME_ISIN,
  RELAY_WS_URL,
  withLocalRelay,
  type LocalRelay,
} from '../fixtures/relay';

/**
 * Phase 15 Plan 14 Task 2 — 호가창 wss 왕복 E2E (RELAY-01 · SC-7 · D-27/D-40).
 *
 * ① 무엇을 증명하는가
 *   **진짜 브라우저 → 진짜 relay 프로세스 → 스텁 게이트웨이** 왕복이다.
 *   인증(첫 메시지) → 상태 프레임 → 구독(`sub`) → `GetQuoteReq` → 호가 스냅샷 →
 *   팬아웃 → 사다리 렌더까지 한 줄로 이어진다. 이 경로는 단위 테스트로 쪼개면
 *   각 조각이 전부 통과하면서도 이어 붙였을 때 안 되는 대표적인 구간이다.
 *
 * ①-b Phase 16 Plan 10 — **주문도 wss 다** (D-02)
 *   `POST /api/orders` 는 더 이상 쓰지 않는다. 폼 제출 → 확인 다이얼로그 →
 *   `{t:"order.new"}` → relay → 스텁 게이트웨이 `DirectOrderReq(2)` → 통보(51) →
 *   `{t:"order.result"}` → 결과 배너까지가 한 줄이다. 그리고 **응답이 없을 때**의
 *   「결과 모름」 규율(S-8)도 같은 경로로 확인한다 — 이건 단위 테스트로 쪼개면
 *   각 조각이 통과하면서도 이어 붙였을 때 「실패」로 렌더되는 대표 구간이다.
 *
 * ② ★ 실서버에 붙지 않는다 (D-27 / T-15-28)
 *   게이트웨이는 픽스처가 `127.0.0.1` 임의 포트에 띄운 스텁이다. KB 사내망 주소는
 *   이 파일과 픽스처 어디에도 없다(acceptance 가 문자열 0건을 검사한다).
 *   주문은 **스텁 게이트웨이로만** 나간다 — 실계좌·실서버로 나가는 경로가 없다.
 *
 * ③ 왜 serial 인가
 *   relay wss 포트는 8090 **고정**이다(`NEXT_PUBLIC_*` 이 빌드 시점 인라인이라 임의
 *   포트를 주입할 수 없다 — 픽스처 상단 ④). `fullyParallel: true` 인 저장소에서
 *   워커 2개가 같은 포트를 잡으면 즉시 EADDRINUSE 다. 그래서 파일 전체를 직렬로 고정하고
 *   relay 를 `beforeAll` 한 번만 띄운다.
 *
 * ④ 상태 오염 제거
 *   매 테스트 `relay.reset()` 이 요청 로그·응답 거래소·자격증명을 기본값으로 되돌린다.
 *   Playwright 는 테스트마다 새 context 를 만들고, 이전 페이지가 닫히면 브라우저 소켓이
 *   끊긴다. relay 는 `SESSION_GRACE_MS=0` 이라 그 시점에 DMA 세션도 반납한다.
 */

test.describe.configure({ mode: 'serial' });

const STOCK_CODE = '005930';
const ORDERBOOK_URL = `/stocks/${STOCK_CODE}?tab=orderbook`;

/** 종목상세가 붙는 모든 API 를 스텁한다 — 이 spec 이 보는 것은 wss 뿐이다. */
async function setupStockDetail(page: Page): Promise<void> {
  await mockStockApi(page);
  await mockNewsApi(page, { code: STOCK_CODE, list: buildNewsList(STOCK_CODE, 3) });
  await mockDiscussionsApi(page, {
    code: STOCK_CODE,
    list: buildDiscussionList(STOCK_CODE, 3),
  });
  await mockThemeChips(page, []);
}

/** relay wss(:8090) 로 나간 소켓 URL 만 모은다 — Next dev 의 HMR 소켓은 제외한다. */
function trackRelaySockets(page: Page): string[] {
  const urls: string[] = [];
  page.on('websocket', (ws) => {
    if (ws.url().includes(':8090')) urls.push(ws.url());
  });
  return urls;
}

/** 모바일 리플로우 검증 뷰포트 — UI-SPEC 이 기준으로 삼은 폭이다(§반응형 "모바일 390px"). */
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

const statusBar = (page: Page) => page.locator('[data-slot="relay-status-bar"]');
const ladder = (page: Page) => page.locator('[data-slot="orderbook-ladder"]');
const priceCells = (page: Page) => ladder(page).locator('tbody th[scope="row"]');
const tapeRows = (page: Page) => page.locator('[data-slot="trade-tape"] tbody tr');

/** 상태가 `ready` 가 될 때까지 기다린다 — relay 부팅 + DMA 로그인 왕복 여유를 준다. */
async function waitForReady(page: Page): Promise<void> {
  await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
}

/**
 * `POST /api/orders` 감시자. **호출되면 배열에 남는다** — D-02 이후 이 라우트로는
 * 한 건도 나가면 안 된다(라우트 자체는 16-16 에서 지운다).
 */
async function watchRestOrders(page: Page): Promise<string[]> {
  const hits: string[] = [];
  await page.route('**/api/orders', async (route) => {
    hits.push(route.request().method());
    await route.abort();
  });
  return hits;
}

/** 매수 폼을 채워 제출 → 확인 다이얼로그의 실행 버튼까지 누른다. */
async function submitBuyOrder(page: Page, price: string, qty: string): Promise<void> {
  const panel = page.getByTestId('order-panel');
  await panel.getByLabel('가격').fill(price);
  await panel.getByLabel('수량').fill(qty);

  const submit = panel.getByRole('button', { name: '매수 주문' });
  await expect(submit).toBeEnabled();
  await submit.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '매수 주문' }).click();
}

/** 게이트웨이가 `DirectOrderReq(2)` 를 받을 때까지 기다린다 — 통보 주입 전 경주 방지. */
async function waitForOrderAtGateway(relay: LocalRelay): Promise<void> {
  await expect
    .poll(() => relay.requestLog().filter((m) => m === DMA_MSG.DirectOrderReq).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
}

// ===========================================================================
// 로그인 + `dma_credentials` 매핑 있음 — 연결 경로
// ===========================================================================

test.describe('Phase 15 Plan 14 — 호가창 wss 왕복 (로컬 relay + 스텁 게이트웨이)', () => {
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
    await setupStockDetail(page);
  });

  test('1. 인증 → 구독 → 호가 10단 렌더 (wss 왕복 · 토큰은 URL 에 없다)', async ({ page }) => {
    const sockets = trackRelaySockets(page);

    await page.goto(ORDERBOOK_URL);
    await waitForReady(page);

    // 상태 배지 — 계좌 수는 스텁 게이트웨이의 LoginResp 계좌 1건에서 온다.
    await expect(statusBar(page).getByText('실시간 · 계좌 1개')).toBeVisible();

    // 스텁이 밀어 넣은 호가 10단이 그대로 그려진다.
    await expect(priceCells(page)).toHaveCount(20);
    await expect(priceCells(page).first()).toContainText('99,000'); // 매도 10호가
    await expect(priceCells(page).last()).toContainText('97,000'); // 매수 10호가
    await expect(ladder(page)).toContainText('550'); // 총잔량

    // T-15-04 — 토큰은 첫 메시지 본문 전용이다. 업그레이드 URL 에 쿼리스트링이 없어야 한다.
    expect(sockets).toContain(RELAY_WS_URL);
    for (const url of sockets) expect(url).not.toContain('?');
  });

  test('2. 체결 테이프 3건이 최신순으로 쌓인다', async ({ page }) => {
    await page.goto(ORDERBOOK_URL);
    await waitForReady(page);

    await expect(tapeRows(page)).toHaveCount(3);
    // 와이어는 시간 오름차순이고 화면은 최신이 위다 — 뒤집기가 실제로 일어났는지 본다.
    await expect(tapeRows(page).first()).toContainText('09:30:17');
    await expect(tapeRows(page).last()).toContainText('09:30:15');
    // 색 비의존 — `구분` 열은 없앴지만(수량 색이 대신한다) 수량 셀의 sr-only 로 읽힌다.
    await expect(tapeRows(page).first().locator('td').nth(2).locator('.sr-only')).toHaveText(
      /매수|매도/,
    );
  });

  test('3. 거래소 KRX→NXT 전환 → unsub/sub 왕복 후 NXT 호가가 렌더된다', async ({ page }) => {
    await page.goto(ORDERBOOK_URL);
    await waitForReady(page);
    await expect(priceCells(page).first()).toContainText('99,000');

    // Radix ToggleGroup(type="single") 은 항목에 role="radio" 를 강제한다 — 접근 가능한
    // 이름으로 잡아 role 구현 세부에 매이지 않는다.
    await page.getByLabel('NXT 호가').click();

    // NXT 픽스처는 KRX 보다 1,000원 위다 — 숫자가 바뀌면 재구독이 실제로 일어난 것이다.
    await expect(priceCells(page).first()).toContainText('100,000', { timeout: 15_000 });
    await expect(page.getByText('이 종목은 NXT 호가가 없어요')).toHaveCount(0);

    // 게이트웨이가 본 요청으로 구독 왕복을 확인한다(28 스냅샷 요청 · 29 구독 on/off).
    const log = relay.requestLog();
    expect(log.filter((m) => m === DMA_MSG.GetQuoteReq).length).toBeGreaterThanOrEqual(2);
    expect(log.filter((m) => m === DMA_MSG.SubscribeQuoteReq).length).toBeGreaterThanOrEqual(2);
  });

  test('4. NXT 호가가 없는 종목 → 전용 빈 상태 (D3)', async ({ page }) => {
    // 스텁이 KRX 에만 응답하게 만든다 = 그 종목에 NXT 호가가 없는 상황.
    relay.setRespondingExchanges(['KRX']);

    await page.goto(ORDERBOOK_URL);
    await waitForReady(page);
    await expect(priceCells(page)).toHaveCount(20);

    await page.getByLabel('NXT 호가').click();

    await expect(page.getByText('이 종목은 NXT 호가가 없어요')).toBeVisible({ timeout: 15_000 });
    // 재접속 안내가 아니라 **빈 호가**로 안내해야 한다 — 연결은 멀쩡하다.
    await expect(statusBar(page)).toHaveAttribute('data-status', 'ready');
  });

  test('5. `dma_credentials` 매핑 없음 → 권한 없음 게이트, 다른 탭은 그대로 (D-12 · T-15-21)', async ({
    page,
  }) => {
    relay.clearDmaCredentials();

    await page.goto(ORDERBOOK_URL);

    const gate = page.getByTestId('orderbook-access-gate');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toContainText('실시간 호가·주문 권한이 없어요');
    await expect(gate).toContainText('이 종목의 차트·뉴스·종목토론방은 그대로 이용할 수 있어요.');

    // 사다리·주문 진입점은 아예 렌더되지 않는다.
    await expect(ladder(page)).toHaveCount(0);
    await expect(page.getByTestId('order-panel')).toHaveCount(0);
    // 섹션 자체는 사라지지 않는다 (UI-SPEC C1).
    await expect(page.getByTestId('stock-orderbook-section')).toBeVisible();

    // 다른 탭은 영향을 받지 않는다.
    await page.goto(`/stocks/${STOCK_CODE}?tab=chart`);
    await expect(page.getByTestId('stock-daily-chart-section')).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // Phase 16 Plan 10 — 주문 wss 왕복 (D-02 / S-8) · 모바일 리플로우 (C7)
  // -------------------------------------------------------------------------

  test('6. 주문 제출 → wss → 통보(51) → **접수** 배너 (REST 라우트는 한 번도 안 탄다)', async ({
    page,
  }) => {
    const restHits = await watchRestOrders(page);

    await page.goto(ORDERBOOK_URL);
    await waitForReady(page);

    await submitBuyOrder(page, '98000', '10');

    // 통보를 주기 **전에** 게이트웨이까지 갔는지 확인한다 — 이 대기가 없으면 relay 가
    // 대기 항목을 등록하기 전에 통보가 도착해 "가끔 실패하는 E2E" 가 된다.
    await waitForOrderAtGateway(relay);

    await relay.pushOrderResp({
      isin: E2E_ISIN,
      side: 'B',
      orderNo: '0000135842',
      noticeType: 'A',
      resultCode: 0,
      message: '정상처리',
      price: 98_000,
      quantity: 10,
      exchange: 'KRX',
    });

    await expect(page.getByTestId('order-result-accepted')).toContainText(
      '주문이 접수됐어요 · 주문번호 0000135842',
    );

    // ★ D-02 — 주문은 wss 단일 경로다. REST 로 한 건이라도 나가면 두 경로가 같은 행을 다툰다.
    expect(restHits).toEqual([]);
    // 감사 기록(D-03)이 게이트웨이 송신 **전에** 남는다 — 없으면 「나갔는지 모르는 주문」이다.
    expect(relay.orderInserts()).toHaveLength(1);
    expect(relay.orderInserts()[0]).toMatchObject({
      isin: E2E_ISIN,
      // relay 가 `stocks` 로 푼 값이다. 브라우저는 단축코드·시장을 보내지 않는다(D-28).
      stock_code: STOCK_CODE,
      market: 'K',
      side: 'B',
      order_type: 'N',
      qty: 10,
      price: 98_000,
    });
  });

  test('7. 통보가 오지 않으면 **「실패」가 아니라 「결과 모름」** 이고 제출은 잠긴 채다 (S-8)', async ({
    page,
  }) => {
    await page.goto(ORDERBOOK_URL);
    await waitForReady(page);

    await submitBuyOrder(page, '98000', '10');
    await waitForOrderAtGateway(relay);
    // 통보를 **주지 않는다.** relay 의 5초 상한이 지나면 `{status:"timeout"}` 이 온다.

    const panel = page.getByTestId('order-panel');
    const unknown = page.getByTestId('order-result-unknown');
    await expect(unknown).toBeVisible({ timeout: 15_000 });
    await expect(unknown).toContainText('접수 응답이 늦어지고 있어요');
    await expect(unknown).toContainText(
      '주문이 이미 나갔을 수 있어요. 미체결 목록에서 접수 여부를 확인한 뒤 다시 주문해 주세요.',
    );
    // 거부와 같은 톤을 쓰지 않는다 — 경보가 아니라 상태다.
    await expect(unknown).toHaveAttribute('role', 'status');
    // ★ 패널 어디에도 "실패"라고 쓰지 않는다. 그 한 단어가 중복 체결을 부른다.
    await expect(panel).not.toContainText('실패');
    // ★ 재주문 경로를 열지 않는다. 이 버튼이 다시 열리면 그 자리에서 중복 체결이 난다.
    await expect(panel.getByRole('button', { name: '매수 주문' })).toBeDisabled();
  });

  test('8. 390px 에서 미체결·잔고가 `.rlist` 2줄 카드 행으로 리플로우되고 잘림이 0이다 (C7/R6)', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(ORDERBOOK_URL);
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
          // ★ 이름이 긴 종목 + 7자리 가격 + 6자리 수량. 「종목명만 신축」 규율이 빠지면
          //   이 행에서 주문번호·취소 버튼이 컨테이너 밖으로 밀려난다(스트레스 케이스).
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

    const unfilledRows = page.locator('[data-slot="account-unfilled-row"]');
    await expect(unfilledRows).toHaveCount(2);
    await expect(unfilledRows.first()).toBeVisible();
    await expect(page.locator('[data-slot="account-holding-row"]')).toHaveCount(1);

    // 표는 이 폭에서 **보이지 않는다** — 콘텐츠 최소폭이 가용폭을 넘기 때문이다.
    await expect(
      page.getByTestId('account-unfilled').locator('[data-slot="table"]'),
    ).toBeHidden();

    /*
      ★ 잘림 진단은 **문서 스크롤폭이 아니라 요소 실측 폭**이다 (tasks/lessons.md).

        더 정확히는 **행의 폭도 아니다.** 행은 블록이라 넘쳐도 폭이 컨테이너와 같고,
        `.rlist` 의 `overflow-hidden` 이 넘침을 삼켜 `scrollWidth` 마저 조용하다.
        실제로 「종목명만 신축」 규율을 지운 변이가 그 두 단언을 **통과했다**(실측).
        유일하게 무는 단언은 **행 안의 잎 요소들이 컨테이너 오른쪽 끝을 넘지 않는가** 다 —
        `getBoundingClientRect` 는 ancestor 의 클리핑에 영향받지 않으므로 밀려난 요소의
        진짜 좌표가 그대로 나온다.
    */
    const list = page.locator('[data-slot="account-unfilled-list"]');
    const listBox = await list.boundingBox();
    expect(listBox).not.toBeNull();
    const listRight = listBox!.x + listBox!.width;

    for (const row of await unfilledRows.all()) {
      const overflowing = await row.evaluate(
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
      // 실패 메시지에 **무엇이 얼마나** 밀려났는지 남는다 — 「어딘가 잘렸다」로 끝나지 않게.
      expect(overflowing).toEqual([]);
    }

    // 종목명만 줄어든다 — 취소 버튼·수량은 밀려나지 않고 그대로 눌린다.
    await expect(
      unfilledRows.first().getByRole('button', { name: '주문번호 0000135742 취소' }),
    ).toBeVisible();
    /*
      ★ 260912-ok2 — **문구가 바뀐 자리다. 화면이 정본이고 단언을 옮긴다.**
        옛 단언은 `30/50` 이라는 붙여쓴 문자열을 요구했는데, 260911-w5h 가 카드 2번째 줄을
        「미체결 {잔량} / {주문량}주」로 다시 쓰면서 그 형태는 화면에서 사라졌다.
        잠그던 것(「30 중 50 이 **둘 다** 보인다」 = 잔량만 보여 주문량을 잃지 않는다)은
        그대로이므로, 같은 의도를 현재 문구로 다시 쓴다. 지웠으면 다음에 주문량이 조용히
        빠져도 아무도 모른다.
    */
    await expect(unfilledRows.first()).toContainText('미체결 30 / 50주');
  });

  test('9. 회선 단절 → `재접속 중` 배지 + **사다리는 비워지지 않는다**', async ({ page }) => {
    await page.goto(ORDERBOOK_URL);
    await waitForReady(page);
    await expect(priceCells(page)).toHaveCount(20);

    /*
      게이트웨이를 통째로 내린다(소켓 파괴 + listen 종료). 소켓만 끊으면 relay 가 1초 뒤
      재접속에 성공해 `ready` 로 돌아가므로, 배지가 `재접속 중` 인 창이 1초짜리 경주가 된다.
      listen 까지 내리면 재접속이 계속 실패해 상태가 안정적으로 `reconnecting` 에 머문다.
      **이 테스트가 마지막인 이유**이기도 하다 — 이후 테스트는 게이트웨이를 못 쓴다.
    */
    await relay.gateway.close();

    await expect(statusBar(page)).toHaveAttribute('data-status', 'reconnecting', {
      timeout: 20_000,
    });
    await expect(statusBar(page).getByText(/재접속 중 \d+\/10/)).toBeVisible();
    /*
      본문은 정적 문구 + 회차·다음 시도 안내다. **보조 줄은 단언하지 않는다** — relay 가
      `{t:"state"}.msg` 로 실제 단절 사유를 실어 보내면 UI 는 정적 보조 문구 대신 그것을
      보여주는 것이 계약이다(D-36). 정적 문구를 단언하면 그 계약과 정면으로 어긋난다.
    */
    await expect(statusBar(page).getByText(/연결이 끊겨 다시 연결하는 중이에요/)).toBeVisible();

    // ★ 핵심 — 마지막 값이 남아 있어야 한다. 빈 화면으로 되돌리면 사용자가 문맥을 잃는다.
    await expect(priceCells(page)).toHaveCount(20);
    await expect(priceCells(page).first()).toContainText('99,000');
  });
});

// ===========================================================================
// 비로그인 — wss 를 시도조차 하지 않는다
// ===========================================================================

test.describe('Phase 15 Plan 14 — 비로그인 호가창 게이트', () => {
  // 프로젝트 레벨 storageState 를 비운다(chat.spec.ts 선례). `clearCookies()` 는 이중 방어 —
  // 워커 재사용 시 누수되는 쿠키까지 제거한다.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await setupStockDetail(page);
  });

  test('10. 비로그인은 로그인 화면으로 보내지고 relay wss 연결을 시도하지 않는다', async ({
    page,
  }) => {
    const sockets = trackRelaySockets(page);

    await page.goto(ORDERBOOK_URL);

    /*
      `/stocks/*` 는 공개 경로가 아니다(`lib/supabase/middleware.ts` 의 PUBLIC_PREFIXES).
      그래서 "호가주문 탭에 로그인 안내" 가 아니라 **middleware 가 /login 으로 돌려보내는 것**이
      실제 제품 동작이고, 그게 곧 로그인 안내다.
    */
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();

    // 인증 없이 시세 소켓을 열지 않는다 — 열었다면 relay 가 4401 로 끊을 표면을 하나 더 만드는 것이다.
    expect(sockets).toEqual([]);
  });
});
