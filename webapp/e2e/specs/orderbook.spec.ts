import { test, expect, type Page } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { mockNewsApi, buildNewsList } from '../fixtures/news';
import { mockDiscussionsApi, buildDiscussionList } from '../fixtures/discussions';
import { mockThemeChips } from '../fixtures/themes';
import { DMA_MSG, RELAY_WS_URL, withLocalRelay, type LocalRelay } from '../fixtures/relay';

/**
 * Phase 15 Plan 14 Task 2 — 호가창 wss 왕복 E2E (RELAY-01 · SC-7 · D-27/D-40).
 *
 * ① 무엇을 증명하는가
 *   **진짜 브라우저 → 진짜 relay 프로세스 → 스텁 게이트웨이** 왕복이다.
 *   인증(첫 메시지) → 상태 프레임 → 구독(`sub`) → `GetQuoteReq` → 호가 스냅샷 →
 *   팬아웃 → 사다리 렌더까지 한 줄로 이어진다. 이 경로는 단위 테스트로 쪼개면
 *   각 조각이 전부 통과하면서도 이어 붙였을 때 안 되는 대표적인 구간이다.
 *
 * ② ★ 실서버에 붙지 않는다 (D-27 / T-15-28)
 *   게이트웨이는 픽스처가 `127.0.0.1` 임의 포트에 띄운 스텁이다. KB 사내망 주소는
 *   이 파일과 픽스처 어디에도 없다(acceptance 가 문자열 0건을 검사한다).
 *   주문은 **한 건도 내지 않는다** — 이 spec 은 조회 표면만 다룬다.
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

const statusBar = (page: Page) => page.locator('[data-slot="relay-status-bar"]');
const ladder = (page: Page) => page.locator('[data-slot="orderbook-ladder"]');
const priceCells = (page: Page) => ladder(page).locator('tbody th[scope="row"]');
const tapeRows = (page: Page) => page.locator('[data-slot="trade-tape"] tbody tr');

/** 상태가 `ready` 가 될 때까지 기다린다 — relay 부팅 + DMA 로그인 왕복 여유를 준다. */
async function waitForReady(page: Page): Promise<void> {
  await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
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
    // 색 비의존 — 구분은 텍스트로도 읽힌다 (T-15-44).
    await expect(tapeRows(page).first()).toContainText(/▲ 매수|▼ 매도/);
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

  test('6. 회선 단절 → `재접속 중` 배지 + **사다리는 비워지지 않는다**', async ({ page }) => {
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

  test('7. 비로그인은 로그인 화면으로 보내지고 relay wss 연결을 시도하지 않는다', async ({
    page,
  }) => {
    const sockets = trackRelaySockets(page);

    await page.goto(ORDERBOOK_URL);

    /*
      `/stocks/*` 는 공개 경로가 아니다(`lib/supabase/middleware.ts` 의 PUBLIC_EXACT/PREFIXES).
      그래서 "호가주문 탭에 로그인 안내" 가 아니라 **middleware 가 /login 으로 돌려보내는 것**이
      실제 제품 동작이고, 그게 곧 로그인 안내다.
    */
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();

    // 인증 없이 시세 소켓을 열지 않는다 — 열었다면 relay 가 4401 로 끊을 표면을 하나 더 만드는 것이다.
    expect(sockets).toEqual([]);
  });
});
