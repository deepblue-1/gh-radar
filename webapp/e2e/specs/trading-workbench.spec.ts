import { test, expect, type Locator, type Page } from '@playwright/test';

import { buildDiscussionList, mockDiscussionsApi } from '../fixtures/discussions';
import { mockStockApi } from '../fixtures/mock-api';
import { buildNewsList, mockNewsApi } from '../fixtures/news';
import { mockThemeChips } from '../fixtures/themes';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';
import {
  DMA_MSG,
  E2E_ACCOUNT_NO,
  E2E_ISIN,
  E2E_LONG_NAME_ISIN,
  RELAY_WS_URL,
  pushLimitFeatureFixture,
  readAutoSellCommandRequest,
  readSetLimitChaserRequest,
  readViConfirmRequest,
  readViSetRequest,
  withLocalRelay,
  type LocalRelay,
} from '../fixtures/relay';
import { installNativeApp, nativeMessages } from '../fixtures/native-app';
import { leavesOverflowing, scrollOverflowing } from '../overflow';
import { buildSetVITriggerRespFrame } from '../../../relay/tests/helpers/frames.js';

/**
 * Phase 18 Plan 13 — `/trading` 단일 작업대 E2E (TRADE-06 · TRADE-09 · D-29).
 *
 * ① 무엇을 증명하는가
 *   이 phase 의 가장 큰 구조적 주장 — 「§2.2b 4밴드의 측정 대상을 **페이지 본문에서 카드로**
 *   옮겼다」 — 은 실브라우저의 실제 폭으로만 증명된다(jsdom 은 컨테이너 쿼리를 평가하지 않는다).
 *   그래서 여기서 카드 컨테이너 폭을 경계 양옆으로 **정확히** 맞추고, CSS 가 실제로 고른 밴드
 *   (카드 본문 호가 칸의 계산 폭)와 폭에서 기대한 밴드가 같은지, 그 폭에서 잘림이 0 인지 본다.
 *   밴드 표와 경계 셋(685 · 830 · 992)의 정본은 `webapp/src/styles/globals.css` §2.2b 다.
 *
 * ② UI-SPEC backstop 5행이 이 파일의 책임이다 (케이스 제목의 근거 ID 로 표시)
 *   E1 overflow(상태줄 wrap·잘림 0) · E6 overflow(카드 4밴드 × 단 수 잘림 0) ·
 *   E6 zero-one-many(펼침/접힘 조합 스택) · E13 overflow(폰 공용 패널) · E15 overflow(더티 바 겹침 0).
 *   여섯째 backstop(E3 error — VI 확인 체크 거부/타임아웃 실기 왕복)은 UAT 몫이다(18-13 SUMMARY).
 *
 * ③ 잘림 판정은 `e2e/overflow.ts` **하나**다 — 새 판정식을 쓰지 않는다(판정이 둘이면 한쪽만 고쳐진다).
 *
 * ④ 왜 serial + 단일 relay 인가
 *   relay wss 는 8090 **고정**이다. 포트·주소의 정본은 `playwright.config.ts`(webServer ·
 *   `NEXT_PUBLIC_RELAY_WS_URL`)와 `fixtures/relay.ts` 이고 이 파일은 포트를 적지 않는다.
 *   파일 **간** 충돌은 config 의 단일 워커가 막는다.
 *
 * ⑤ ★ 실서버에 붙지 않는다 (D-27 / T-15-28)
 *   게이트웨이는 픽스처가 `127.0.0.1` 임의 포트에 띄운 스텁이다. 사내망 주소·실계좌 리터럴 없음.
 *
 * ⑥ 케이스 9 이후는 **옛 두 spec 의 이관**이다 (18-13 Task 2)
 *   `trading-limit-chaser.spec.ts`(상따) · `trading-vi.spec.ts`(VI) 는 옛 화면으로 진입했고, 18-12 부터
 *   그 경로는 리다이렉트된다. 두 파일이 잠그던 「진짜 브라우저 → 진짜 relay → 스텁 게이트웨이」 왕복
 *   단언을 작업대의 새 자리(카드 · 카드 헤더 LED · 공용 패널 로그 · VI 두 줄 · VI 발동 표)로 옮겼다.
 *   무엇을 어디로 옮겼고 무엇이 설계상 사라졌는지는 18-13 SUMMARY 의 커버리지 대조표가 정본이다.
 *   ★ 「보냈다」가 아니라 **무엇을 보냈는가**를 본다 — VI 「수정」이 `run` 을 유지하는지는 페이로드
 *     (`readViSetRequest`)로만 확인된다(스텁은 11 에 자동 응답하지 않아 화면으로는 안 보인다).
 *
 * ⑦ 「G-21-R3-10 이전 — …」 케이스는 **옛 호가 탭 e2e(`orderbook` 스펙 파일)의 이관**이다 (Phase 21 21-34 · D-31)
 *   종목상세 호가주문 탭이 사라져 그 spec 을 지웠다. 그 파일에만 있던 검증(인증 → 구독 → 호가 10단 · 토큰 URL
 *   부재 · 체결 테이프 순서 · 폭별 상태줄/시간외종가 배치 · 카드 시간외종가 주문 · 390 미체결 리플로우 ·
 *   비로그인 wss 0 · 회선 단절 → 재접속 배지 + 사다리 유지)을 작업대 카드 기준으로 옮겼다. 테스트별 대조
 *   (이미 있음 / 이전 / 버림)의 정본은 21-34 SUMMARY 다. 회선 단절 케이스는 게이트웨이를 내리므로 파일 맨 끝의
 *   자기 relay describe 에 있다.
 */

test.describe.configure({ mode: 'serial' });

const WORKBENCH_URL = '/trading';
const STRATEGY_KEY = `${E2E_ISIN}:${E2E_ACCOUNT_NO}:KRX`;
const FOCUS_URL = `${WORKBENCH_URL}?focus=${encodeURIComponent(STRATEGY_KEY)}`;

const PHONE_VIEWPORT = { width: 390, height: 844 } as const;
const WIDE_VIEWPORT = { width: 1440, height: 1000 } as const;
/**
 * 갤럭시 폴드 안쪽 화면 세로 — Playwright 프리셋 없음 · 물리 1856×2160 · DPR ≈2.625 환산 · 앱 셸 p-2 램프로
 * wb ≈691 · 1단 카드 lc ≈689 (quick-260923-hfk · quick-260928-q5e).
 */
const FOLD_VIEWPORT = { width: 707, height: 823 } as const;

/** 스텁 호가의 상한가 — 카드 폼 가격 5칸이 이 값으로 시딩된다(실시간 값이 정본). */
const LIVE_UPPER_LIMIT = '127,400';

/** 서버에 등록돼 있는 VI 설정(KRX) — 1,000만원 · 22%. 계좌는 로그인 응답의 계좌와 같아야 한다. */
const VI_CFG = {
  accountNo: E2E_ACCOUNT_NO,
  orderAmountKrw: 10_000_000n,
  checkRate: 22,
  priceType: 'U',
  run: false,
};

/**
 * VI 주문 6건 — 상태를 전부 다르게 둔다(같은 상태만 있으면 배지가 잘못 붙어도 모른다).
 * 마지막 행은 **접수 전**(주문번호 없음)이라 확인 자체가 불가능하다. (옛 trading-vi.spec 그대로)
 */
const VI_ORDERS = [
  { isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '0031245', state: 'Accepted', orderQty: 205, orderPrice: 48_750, triggerPrice: 41_250, basePrice: 33_510, filledQty: 0, confirmed: false, confirmLocked: false },
  { isin: E2E_LONG_NAME_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '0031102', state: 'Accepted', orderQty: 278, orderPrice: 115_700, triggerPrice: 98_400, basePrice: 80_000, filledQty: 120, confirmed: true, confirmLocked: true },
  { isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '0030987', state: 'Filled', orderQty: 76, filledQty: 76, triggerPrice: 126_000, basePrice: 100_000, confirmed: true, confirmLocked: true },
  { isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '0030900', state: 'Cancelled', triggerPrice: 92_300, basePrice: 75_000, confirmLocked: true },
  { isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '0030888', state: 'Rejected', triggerPrice: 61_000, basePrice: 50_000, confirmLocked: true },
  { isin: E2E_LONG_NAME_ISIN, accountNo: E2E_ACCOUNT_NO, orderNo: '', state: 'Pending', triggerPrice: 12_345, basePrice: 10_000 },
] as const;

/** §2.2b 경계 — 정본은 globals.css §2.2b. 여기서는 「폭 → 기대 밴드」 판정에만 쓴다. */
type Band = 'phone' | 'compact' | 'wide' | 'desktop';
/** 카드(`lc`) 첫 경계(폰|컴팩트) — 정본 globals.css §2.2b `LC_COMPACT_MIN_PX`. */
const LC_COMPACT_MIN = 685;
function bandOfWidth(width: number): Band {
  if (width < LC_COMPACT_MIN) return 'phone';
  if (width < 830) return 'compact';
  if (width < 992) return 'wide';
  return 'desktop';
}

// ---------------------------------------------------------------------------
// 조회구
// ---------------------------------------------------------------------------

const statusBar = (page: Page) => page.locator('[data-slot="workbench-status-bar"]');
const grid = (page: Page) => page.locator('[data-slot="card-grid"]');
const cards = (page: Page) => page.locator('[data-slot="strategy-card"]');
const cardSelector = (isin: string) => `[data-slot="strategy-card"][data-key^="${isin}:"]`;
const cardOf = (page: Page, isin: string) => page.locator(cardSelector(isin));
/** 전략 키가 정확히 같은 카드 — 같은 종목 카드가 둘일 때(WR-05) 가른다. */
const cardByKey = (page: Page, key: string) =>
  page.locator(`[data-slot="strategy-card"][data-key="${key}"]`);
/**
 * 그 종목 (첫) 카드의 헤더 토글 — DOM id 는 카드 id(`wb-card-{n}`) 축이라 ISIN 으로 만들 수 없다
 * (WR-05). 헤더 안 `aria-expanded` 를 가진 버튼이 토글 하나뿐이다.
 */
const toggleOf = (page: Page, isin: string) =>
  cardOf(page, isin).first().locator('[data-slot="card-header"] button[aria-expanded]');
const colsSegment = (page: Page) => page.locator('[data-slot="workbench-cols-segment"]');
/**
 * 옛 더티 액션 바 — Phase 20 D-04 로 사라졌다. **부재 단언에만** 쓴다(값 확정 = 즉시 반영).
 * 조회구 상수를 두지 않는 이유: 상수가 있으면 「바가 보인다」 단언이 다시 끼어들기 쉽다.
 */
const DIRTY_BAR_SEL = '[data-slot="dirty-action-bar"]';
const sharedPanels = (page: Page) => page.getByTestId('shared-panels');
/** VI 입력(`vi-krx-amount` 등)은 여전히 입력칸이다 — 상따 행은 아래 `lcRow` 를 쓴다. */
const field = (page: Page, id: string): Locator => page.locator(`#${id}`);
/**
 * Phase 20 상따 설정 행 — 옛 입력 id(`lc-buy-watch-qty` …)가 행 식별자(`data-lc-field`)로 산다
 * (`lc/lc-fields.ts`). 값 글자는 `[data-slot="lc-row-value"]`(「10,000주」 · 「127,400원」).
 */
const lcRow = (page: Page, id: string): Locator => page.locator(`[data-lc-field="${id}"]`);
const lcValue = (page: Page, id: string): Locator =>
  lcRow(page, id).locator('[data-slot="lc-row-value"]');
/** 그룹 스위치 6개 — `role="switch"` · 이름 「○○ 켜기」(A-P2 · Phase 24 선 · 줄 · 후매수 포함). */
const lcSwitch = (scope: Page | Locator, name: string): Locator =>
  scope.getByRole('switch', { name, exact: true });
/**
 * Phase 24 ⑤ — 선매수 · 줄매수 · 후매수 카드는 **기본 접힘**이다(행 영역 `display:none`). 그 카드의 제목줄
 * 접기 버튼이 접혀 있으면 눌러 펼친다(멱등 — 이미 펼쳐져 있으면 누르지 않는다). 접기는 로컬 동작이라
 * `lc.set` 을 보내지 않는다.
 */
async function expandLcGroup(card: Page | Locator, slot: 'pre-buy' | 'extra-buy' | 'post-buy'): Promise<void> {
  const fold = card.locator(`[data-slot="lc-group-${slot}"] [data-slot="lc-group-fold"]`);
  if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
}
/**
 * 행(값 id · 체크 id)을 품은 그룹 카드가 접이식이면 펼친다 — 행을 **누르는** 헬퍼가 먼저 부른다(숨은 행은
 * 누를 수 없다). 값 글자만 읽는 `lcValue` 는 펼치지 않아도 된다(`toHaveText` 는 숨은 요소도 읽는다).
 * 보이지 않는 카드(접힌 작업대 카드)의 같은 행은 건드리지 않는다.
 */
async function showLc(page: Page, id: string): Promise<void> {
  const folds = page
    .locator('section[data-slot^="lc-group-"]')
    .filter({ has: page.locator(`[data-lc-field="${id}"], [id="${id}"]`) })
    .locator('[data-slot="lc-group-fold"]');
  for (const fold of await folds.all()) {
    if (!(await fold.isVisible())) continue;
    if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click();
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
  }
}
/** 인라인 편집(마우스 기기) — (접힌 카드면 펼치고) 행 클릭 → 옛 id 입력이 선다 → 값 → Enter(= 확정 1회 = 전송 1회). */
async function editLc(page: Page, id: string, value: string): Promise<void> {
  await showLc(page, id);
  await lcRow(page, id).click();
  const input = page.locator(`#${id}`);
  await expect(input).toBeVisible();
  await input.fill(value);
  await input.press('Enter');
}
const desktopNav = (page: Page) => page.locator('aside nav[aria-label="주 메뉴"]');
const strategyItems = (page: Page) => desktopNav(page).locator('[data-strategy-key]');
const addBox = (page: Page) =>
  page.locator('[data-slot="stock-add-bar"]').getByPlaceholder('종목 추가 — 종목명 또는 코드');
const viRow = (page: Page, ex: 'KRX' | 'NXT' = 'KRX') =>
  page.locator(`[data-slot="vi-settings-row"][data-exchange="${ex}"]`);
const viTable = (page: Page) => page.locator('[data-slot="vi-trigger-table"] [data-slot="vi-order-table"]');

/** 공용 패널 「전략 로그」 탭을 열고 그 줄들을 돌려준다(작업대는 카드 로그를 여기로 합친다). */
async function logRows(page: Page): Promise<Locator> {
  const tab = sharedPanels(page).getByRole('tab', { name: '전략 로그' });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  return sharedPanels(page).locator('[data-slot="strategy-log-row"]');
}

/** 게이트웨이가 `SetLimitChaserReq(10)` 을 n건 받을 때까지 기다린다 — 에코 주입 전 경주 방지. */
async function waitForSetAtGateway(relay: LocalRelay, count: number): Promise<void> {
  await expect
    .poll(() => relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length, {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(count);
}

/** 종목 추가란에서 키보드만으로 종목을 골라 카드를 만든다(마우스 없음). */
async function addStockByKeyboard(page: Page): Promise<void> {
  await addBox(page).focus();
  await page.keyboard.type('삼성');
  await expect(page.locator('[data-slot="lc-search-option"]').first()).toBeVisible({ timeout: 15_000 });
  await addBox(page).press('Enter');
}

function viSetRequests(relay: LocalRelay) {
  return relay
    .strategyRequests()
    .map((r) => readViSetRequest(r.msgType, r.payload))
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/** 게이트웨이가 받은 `SetLimitChaserReq(10)` 개수 — 「몇 건 나갔나」가 계약인 자리(D-01 · D-02 · D-19 · D-36). */
function lcSetCount(relay: LocalRelay): number {
  return relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
}

/**
 * 부재(0건) 관찰 창 — 자동 끔 유예 LC_FOLD_HIDDEN_DEFER_MS(1.5초 · limit-chaser-form.tsx)의 2배. 창이 유예와 같으면
 * 숨은 인스턴스의 지연 제출이 경계에서 흔들린다(GC-IN-04). 「1건」은 창이 아니라 `waitForSetAtGateway` 사건으로 잰다.
 */
const FOLD_QUIET_MS = 3_000;

/** 게이트웨이가 받은 10 을 디코드한 목록(테스트 시작점 이후 · 송신 순서) — 「무엇을 보냈나」. */
function lcSetRequests(relay: LocalRelay) {
  return relay
    .strategyRequests()
    .map((r) => readSetLimitChaserRequest(r.msgType, r.payload))
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * 받은 10 의 게이트 · 체크를 그대로 되돌리는 60 에코 조각 — 「서버가 받아들였다」를 흉내 낸다. 나머지 값은
 * 호출부가 시드로 채운다(`{ ...seed, ...lcEchoFlagsOf(req) }`).
 */
function lcEchoFlagsOf(req: NonNullable<ReturnType<typeof readSetLimitChaserRequest>>) {
  return {
    buyEnabled: req.buyEnabled,
    preBuyEnabled: req.preBuyEnabled,
    extraBuyEnabled: req.extraBuyEnabled,
    postBuyEnabled: req.postBuyEnabled,
    sellEnabled: req.sellEnabled,
    sellTradeQtyEnabled: req.sellTradeQtyEnabled,
    sellQtyTrackEnabled: req.sellQtyTrackEnabled,
    sellOrderPrice: req.sellOrderPrice,
    sellWatchPrice: req.sellWatchPrice,
    cancelQtyEnabled: req.cancelQtyEnabled,
    cancelTradeEnabled: req.cancelTradeEnabled,
    cancelQtyTrackEnabled: req.cancelQtyTrackEnabled,
  };
}

/** 그룹 카드 제목 옆 상태 문구(`lc-group-status`). */
const lcGroupStatus = (card: Locator, slot: 'buy' | 'pre-buy' | 'extra-buy' | 'post-buy' | 'sell' | 'cancel') =>
  card.locator(`[data-slot="lc-group-${slot}"] [data-slot="lc-group-status"]`);

function viConfirmRequests(relay: LocalRelay) {
  return relay
    .strategyRequests()
    .map((r) => readViConfirmRequest(r.msgType, r.payload))
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/** 61 에코를 지금 밀어 넣는다 — 반영의 유일한 증거다. */
async function pushViEcho(relay: LocalRelay, run: boolean, over: Record<string, unknown> = {}) {
  const sock = await relay.userSocket();
  relay.gateway.sendFrame(sock, buildSetVITriggerRespFrame({ ...VI_CFG, ...over, run }));
}

/**
 * VI 패널(「더보기」)을 연다 — VI 설정 두 줄은 펼침 안에만 보인다. 멱등이다: 이미 열려 있으면 다시
 * 눌러 닫지 않는다.
 */
async function openViPanel(page: Page): Promise<void> {
  const more = page.locator('[data-slot="vi-strip-more"]');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  await expect(page.locator('[data-slot="vi-settings-rows"]')).toBeVisible();
}

/** VI 발동 표를 연다(패널을 펼치면 주문이 있을 때 표가 선다). */
async function openViTable(page: Page): Promise<void> {
  await openViPanel(page);
  await expect(page.locator('[data-slot="vi-trigger-table"]')).toBeVisible();
}

async function waitForReady(page: Page): Promise<void> {
  await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
}

/** 등록 전략 카드를 `?focus=` 로 펼치고 시세(상한가 시딩)가 들어올 때까지 기다린다. */
async function openFocusedCard(page: Page): Promise<void> {
  await page.goto(FOCUS_URL);
  await waitForReady(page);
  await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
  await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('10,000주', { timeout: 15_000 });
}

/**
 * 카드의 **컨테이너 폭**과 CSS 가 실제로 고른 밴드.
 *
 * 컨테이너 쿼리가 재는 것은 카드(`@container/lc`) 요소의 content-box 폭 = `clientWidth` 다
 * (테두리 제외 · 패딩 없음). 밴드는 카드 본문 그리드의 **첫 칸(호가) 계산 폭**으로 판정한다 —
 * 폰 42% · 컴팩트 260 · 와이드 400 · 데스크톱 460(`card-body.tsx`). 클래스 문자열이 아니라
 * 계산된 값이라 CSS 가 안 먹으면 여기서 드러난다.
 */
async function cardMetrics(page: Page, isin: string): Promise<{ width: number; band: Band | string }> {
  return page.evaluate((sel) => {
    const card = document.querySelector<HTMLElement>(sel);
    const body = card?.querySelector<HTMLElement>('[data-slot="card-body"]');
    if (card == null || body == null) return { width: -1, band: '<카드/본문 없음>' };
    const first = parseFloat(getComputedStyle(body).gridTemplateColumns.split(' ')[0]);
    const near = (a: number, b: number) => Math.abs(a - b) < 1;
    const band = near(first, 260)
      ? 'compact'
      : near(first, 400)
        ? 'wide'
        : near(first, 460)
          ? 'desktop'
          : Math.abs(first - body.clientWidth * 0.42) < 2
            ? 'phone'
            : `<알 수 없는 첫 칸 ${first}px / 본문 ${body.clientWidth}px>`;
    return { width: card.clientWidth, band };
  }, cardSelector(isin));
}

/**
 * 카드 컨테이너 폭을 **정확히** `target` 으로 맞춘다 — 1단 격자에서 뷰포트를 조정한다.
 *
 * ★ 뷰포트 → 카드 폭 공식을 추정하지 않는다. 사이드바(≥1024) · 여백 램프(8/16/24) · 스크롤바가
 *   환경마다 몇 px 씩 다르게 먹는다. 재고, 모자란 만큼 뷰포트를 옮기고, 다시 잰다 — 그리고
 *   **맞췄다는 사실 자체를 단언**한다. 계산만 믿으면 엉뚱한 밴드를 재고도 초록이 된다.
 */
async function sizeCardTo(page: Page, isin: string, target: number): Promise<void> {
  let viewport = target + 34;
  for (let i = 0; i < 6; i += 1) {
    await page.setViewportSize({ width: viewport, height: 1000 });
    await expect(cardOf(page, isin).locator('[data-slot="card-body"]')).toBeVisible();
    const { width } = await cardMetrics(page, isin);
    if (width === target) return;
    viewport += target - width;
  }
  const { width } = await cardMetrics(page, isin);
  expect(width, `카드 폭을 ${target} 으로 맞추지 못했다(현재 ${width}, 뷰포트 ${viewport})`).toBe(
    target,
  );
}

/** 카드 1장의 잘림 0 — 두 판정을 **나란히**(overflow.ts 주석). */
/**
 * 카드 안 `scrollOverflowing` — 단, 카드 헤더 종목명(`data-part="name"`)의 말줄임은 뺀다.
 *
 * 종목명은 폰 폭에서 현재가·등락률이 뜨면 말줄임된다 — 사용자 결정 2026-10-01 「수정 필요없음」
 * (Phase 26 deferred wontfix). 그래서 넘침 목록에서 빼되, 대신 말줄임 장치(ellipsis)와 전체 이름을
 * 담은 `title` 이 있는지 본다. 다른 요소의 넘침은 그대로 돌려준다.
 */
async function cardScrollOverflowing(
  page: Page,
  isin: string,
  label: string,
): Promise<{ tag: string; text: string; over: number }[]> {
  const nameEl = cardOf(page, isin).locator('[data-part="name"]');
  const nameText = (await nameEl.count()) > 0 ? ((await nameEl.first().textContent()) ?? '') : null;
  const all = await scrollOverflowing(page, cardSelector(isin));
  const isName = (s: { tag: string; text: string }) => s.tag === 'b' && s.text === nameText?.slice(0, 24);
  if (nameText !== null && all.some(isName)) {
    await expect(nameEl.first(), `${label} — 종목명 말줄임`).toHaveCSS('text-overflow', 'ellipsis');
    expect(await nameEl.first().getAttribute('title'), `${label} — 종목명 title`).toContain(nameText);
  }
  return all.filter((s) => !isName(s));
}

async function expectCardNotClipped(page: Page, isin: string, label: string): Promise<void> {
  const scrolled = await cardScrollOverflowing(page, isin, label);
  expect(scrolled, `${label} — 내용이 상자를 넘친 요소`).toEqual([]);
  const box = await cardOf(page, isin).boundingBox();
  expect(box, `${label} — 카드를 잴 수 없다`).not.toBeNull();
  const pushed = await leavesOverflowing(cardOf(page, isin), box!.x + box!.width);
  expect(pushed, `${label} — 카드 밖으로 밀린 잎 요소`).toEqual([]);
}

/** 단 수를 고른다(와이드 뷰포트에서만 세그먼트가 있다). */
async function pickCols(page: Page, cols: 1 | 2 | 3): Promise<void> {
  await colsSegment(page).getByRole('radio', { name: `${cols}단` }).click();
  await expect(grid(page)).toHaveAttribute('data-cols', String(cols));
}

/** 격자의 **실제** 열 수 — 계산된 `grid-template-columns` 토큰 수. */
async function gridColumnCount(page: Page): Promise<number> {
  return grid(page).evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter((t) => t !== '').length,
  );
}

/** 돌파 스냅샷(78)을 지금 밀어 넣는다. 사용자 세션 소켓을 기다린다(돌파는 사용자 세션 원천 — Phase 26 ⑧). */
async function pushBreakout(relay: LocalRelay, isin: string): Promise<void> {
  const sock = await relay.userSocket();
  relay.gateway.sendRateCrossSnapshot(sock, [
    {
      isin,
      exchange: 'KRX',
      lastPrice: 118_000n,
      changeRate: 20.41,
      thresholdPct: 20,
      basePrice: 98_000n,
    },
  ]);
}

// ===========================================================================

/** relay wss(:8090) 로 나간 소켓 URL 만 모은다 — Next dev 의 HMR 소켓은 제외한다(옛 호가 탭 e2e 이관). */
function trackRelaySockets(page: Page): string[] {
  const urls: string[] = [];
  page.on('websocket', (ws) => {
    if (ws.url().includes(':8090')) urls.push(ws.url());
  });
  return urls;
}

/** 브라우저가 relay 로 보낸 `order.new` 프레임(JSON) — 「무엇을 보냈는가」(시간외종가 `krxSession`)를 본다. */
function captureOrderFrames(page: Page): Record<string, unknown>[] {
  const frames: Record<string, unknown>[] = [];
  page.on('websocket', (ws) => {
    if (!ws.url().includes(':8090')) return;
    ws.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string' || !payload.includes('"order.new"')) return;
      frames.push(JSON.parse(payload) as Record<string, unknown>);
    });
  });
  return frames;
}

/**
 * 브라우저가 relay 로 보낸 구독 제어 프레임(`sub` · `unsub`)만 모은다 — 카드 접기/펼치기의 구독 level
 * 전환이 와이어에 무엇을 남기는지 본다(quick-261001-dyi). 파싱 실패 · 다른 `t` 는 무시한다.
 */
function captureSubFrames(page: Page): Record<string, unknown>[] {
  const frames: Record<string, unknown>[] = [];
  page.on('websocket', (ws) => {
    if (!ws.url().includes(':8090')) return;
    ws.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string') return;
      try {
        const msg = JSON.parse(payload) as Record<string, unknown>;
        if (msg.t === 'sub' || msg.t === 'unsub') frames.push(msg);
      } catch {
        // 구독 제어가 아닌 프레임 — 무시
      }
    });
  });
  return frames;
}

/** 종목상세 「트레이딩」 착지 URL(21-33) — 이관 케이스가 카드를 세우는 경로다. */
const LANDING_URL = `${WORKBENCH_URL}?code=005930`;

/** 착지해 그 종목 카드가 펼쳐질 때까지 기다린다. */
async function landOnCard(page: Page): Promise<Locator> {
  await page.goto(LANDING_URL);
  await waitForReady(page);
  const card = cardOf(page, E2E_ISIN);
  await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
  return card;
}

test.describe('Phase 18 Plan 13 — /trading 작업대 (로컬 relay + 스텁 게이트웨이)', () => {
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
    await page.setViewportSize(WIDE_VIEWPORT);
    await mockStockApi(page, { searchResults: [FIXTURE_SAMSUNG] });
  });

  test('1. 옛 경로 4개가 실제 네비게이션으로 /trading(전략 키는 ?focus=)에 닿는다 (D-02)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);

    for (const old of ['/trading/limit-chaser', '/trading/limit-chaser/new', '/trading/vi']) {
      await page.goto(old);
      await expect(page, `${old} → /trading`).toHaveURL(/\/trading$/);
    }

    // 동적 세그먼트 → 쿼리. 서버가 decode → encode 왕복하므로 `:` 는 `%3A` 로 온다.
    await page.goto(`/trading/limit-chaser/${encodeURIComponent(STRATEGY_KEY)}`);
    await expect(page).toHaveURL(
      (url) => url.pathname === '/trading' && url.searchParams.get('focus') === STRATEGY_KEY,
    );
    expect(page.url()).toContain(`focus=${encodeURIComponent(STRATEGY_KEY)}`);
    await waitForReady(page);
    // 그 키의 카드가 **펼친 상태**로 선다(마운트 1회 소비).
    await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-key', STRATEGY_KEY);
  });

  test('2. 단 수 세그먼트 1/2/3 — 격자 열 수가 바뀌고 새로고침 후 유지, 폰 밴드에서는 DOM 에 없다 (D-04)', async ({
    page,
  }) => {
    relay.seedLimitChasers([
      { isin: E2E_ISIN, buyEnabled: true },
      { isin: E2E_LONG_NAME_ISIN, buyEnabled: true },
    ]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(2, { timeout: 15_000 });

    for (const cols of [2, 3, 1, 3] as const) {
      await pickCols(page, cols);
      expect(await gridColumnCount(page), `${cols}단을 골랐는데 실제 열 수가 다르다`).toBe(cols);
    }

    // 새로고침해도 마지막 선택(3단)이 남는다 — 저장은 이 기기(localStorage)다.
    await page.reload();
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(grid(page)).toHaveAttribute('data-cols', '3');
    expect(await gridColumnCount(page)).toBe(3);
    await expect(colsSegment(page).getByRole('radio', { name: '3단' })).toBeChecked();

    // 폰 밴드 — 세그먼트가 **DOM 에서** 빠진다(접근성 트리·탭 체인에도 없다). 저장값이 3단이어도 1단.
    await page.setViewportSize(PHONE_VIEWPORT);
    await expect(colsSegment(page)).toHaveCount(0);
    await expect(page.getByRole('radio', { name: '3단' })).toHaveCount(0);
    expect(await gridColumnCount(page)).toBe(1);

    // 다시 넓히면 세그먼트와 저장값이 돌아온다.
    await page.setViewportSize(WIDE_VIEWPORT);
    await expect(colsSegment(page)).toHaveCount(1);
    expect(await gridColumnCount(page)).toBe(3);
  });

  test('3. 돌파 칩 클릭 → 카드 1장(KRX · 스위치 전부 OFF · 기본값) → 그 칩이 「거래중」, 서버 송신 0 (D-07 · TRADE-06)', async ({
    page,
  }) => {
    /*
      ★ 시세 자동 응답을 끈다 — 돌파 행은 실시간 현재가가 임계 −2%p 아래로 내려가면 지워진다
        (`shouldRemoveBreakout`). 스텁 시세(기준가 근처)를 받으면 칩이 이탈로 사라져 클릭할 수
        없다. 시세가 없으면 이탈 판정을 하지 않는다(UI-SPEC E4 error) — 그 규칙을 그대로 쓴다.
    */
    relay.setRespondingExchanges([]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(page.locator('[data-slot="card-grid-empty"]')).toBeVisible();
    await pushBreakout(relay, E2E_ISIN);

    const chip = page.locator('[data-slot="breakout-chip"]').filter({ hasText: '삼성전자' });
    await expect(chip).toHaveCount(1, { timeout: 15_000 });
    await expect(chip).not.toHaveAttribute('data-trading', 'true');

    const setBefore = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await chip.click();

    // 카드 1장 — 키의 거래소는 KRX, 계좌는 상태줄 계좌.
    await expect(cards(page)).toHaveCount(1);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-key', STRATEGY_KEY);
    await expect(card).toHaveAttribute('data-open', 'true');
    await expect(
      card.locator('[data-slot="card-exchange-segment"]').getByRole('radio', { name: 'KRX' }),
    ).toBeChecked();

    // 스위치 7개 전부 OFF(Phase 20 — 매수취소도 스위치 · Phase 24 — 선 · 줄 · 후매수 스위치, 「한방체결 켜기」
    // 없음 · Phase 27 — 자동매도 스위치) · WinForms 기본값(선매수 금액 4,000만원 — Phase 24 D-04 · 매도잔량 10,000 — 이 테스트는 시세 응답을 껐으므로
    // 상장주식수(D-17)를 받지 못해 폴백 그대로) · 더티 바 없음(D-04 — 더티 모델 자체가 없다).
    await expect(card.getByRole('switch')).toHaveCount(7);
    for (const name of ['매수주문 켜기', '선매수 켜기', '줄매수 켜기', '후매수 켜기', '매도주문 켜기', '매수취소 켜기', '자동매도 켜기']) {
      await expect(lcSwitch(card, name)).not.toBeChecked();
    }
    await expect(lcValue(page, 'lc-buy-order-amount')).toHaveText('4,000만원');
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('10,000주');
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);

    // 그 행이 「거래중」으로 바뀐다 — 칩을 다시 눌러도 카드가 늘지 않는다.
    await expect(chip).toHaveAttribute('data-trading', 'true');
    await expect(chip.locator('[data-slot="breakout-chip-trading"]')).toHaveText('거래중');

    // ★ 카드 추가는 서버에 아무것도 보내지 않는다 — 등록은 사용자가 스위치를 켤 때뿐이다(D-07).
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(setBefore);

    // 상태줄은 핵심만 말한다 — 개수는 칩 · 카드 수가 이미 증명했다.
    for (const word of ['돌파', '거래 종목', '임계']) {
      await expect(statusBar(page)).not.toContainText(word);
    }
  });

  test('GC1 돌파 목록은 가장 최신 돌파가 맨 위 — 칩 줄 첫 칩과 표 첫 행이 가장 늦은 돌파 (사용자 결정 2026-09-22 · TRADE-06)', async ({
    page,
  }) => {
    /*
      순서의 정본은 relay `sortRateCrossNewestFirst` 와 웹 리듀서 `sortRateCross` 한 벌이다 — 스트립·표는
      받은 순서를 그대로 그린다(D-14). 여기서는 그 결과가 실브라우저에서 「최신 위」로 보이는지만 본다.
      케이스 3 과 같은 이유로 시세 자동 응답을 끈다(이탈 판정으로 행이 지워지지 않게).
      `pushBreakout` 은 원소 1개 모양이라 쓰지 않고, 같은 `relay.userSocket()` 으로 사용자 세션 소켓을 직접 기다린다.
    */
    relay.setRespondingExchanges([]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);

    const base = { exchange: 'KRX', lastPrice: 118_000n, changeRate: 20.41, thresholdPct: 20, basePrice: 98_000n };
    const sock = await relay.userSocket();
    // 게이트웨이 78 원순서는 오름차순(오래된 것이 먼저)이다 — 화면은 그 반대여야 한다.
    relay.gateway.sendRateCrossSnapshot(sock, [
      { ...base, isin: E2E_ISIN, exchangeTime: '090100000001' },
      { ...base, isin: E2E_LONG_NAME_ISIN, exchangeTime: '090300000003' },
    ]);

    const chips = page.locator('[data-slot="breakout-chip"]');
    await expect(chips).toHaveCount(2, { timeout: 15_000 });
    await expect(chips.first()).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(chips.nth(1)).toContainText('삼성전자');

    // 「더보기」 표도 같은 순서 — 표 첫 데이터 행이 가장 늦은 돌파다.
    await page.locator('[data-slot="breakout-more"]').click();
    const table = page.locator('[data-slot="breakout-table"]');
    await expect(table).toBeVisible();
    const rows = table.locator('[data-slot="breakout-row"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(rows.nth(1)).toContainText('삼성전자');

    // 76 으로 더 늦은(0905) 세 번째 종목 — 맨 위(첫 칩 · 표 첫 행)로 들어온다.
    // SymbolMap 에 없는 ISIN 이라 라벨은 ISIN 원문이다.
    const THIRD_ISIN = 'KR7035720002';
    relay.gateway.sendRateCrossAlert(sock, { ...base, isin: THIRD_ISIN, exchangeTime: '090500000005' });
    await expect(chips).toHaveCount(3, { timeout: 15_000 });
    await expect(chips.first()).toContainText(THIRD_ISIN);
    await expect(rows.first()).toContainText(THIRD_ISIN);
    await expect(chips.nth(1)).toContainText('한국제7호기업인수목적우선주식회사');
  });

  test('GC7 VI 발동 목록은 가장 최신 발동이 맨 앞(칩)·맨 위(표) — 73 신규는 맨 앞, 73 갱신은 자리 유지 (quick-260923-dmb)', async ({
    page,
  }) => {
    /*
      순서의 정본은 웹 리듀서 `sortViOrdersNewestFirst` 한 곳이다(72 교체 · 73 병합 두 갈래). 게이트웨이
      72 는 생성 순(오래된 것 먼저)으로 오고 relay 는 받은 그대로 팬아웃한다 — 화면은 그 반대여야 한다.
      정렬 키는 행마다 고정인 deadline110Ms 라 시각을 명시한다(픽스처 기본값은 한 프레임 안에서 동률).
    */
    relay.seedViTrigger(VI_CFG);
    const t0 = Date.now();
    const A = {
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      orderNo: '0032001',
      state: 'Accepted',
      triggerPrice: 41_250,
      basePrice: 33_510,
      deadline110Ms: BigInt(t0 + 50_000),
      deadline119Ms: BigInt(t0 + 59_000),
    } as const;
    const B = {
      isin: E2E_LONG_NAME_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      orderNo: '0032002',
      state: 'Accepted',
      triggerPrice: 98_400,
      basePrice: 80_000,
      deadline110Ms: BigInt(t0 + 80_000),
      deadline119Ms: BigInt(t0 + 89_000),
    } as const;
    // 오래된 순(게이트웨이 원순서)으로 시드한다.
    relay.seedViOrders([A, B]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);

    const chips = page.locator('[data-slot="vi-chip"]');
    await expect(chips).toHaveCount(2, { timeout: 15_000 });
    await expect(chips.first()).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(chips.nth(1)).toContainText('삼성전자');

    await openViTable(page);
    const rows = viTable(page).locator('[data-slot="vi-order-row"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('한국제7호기업인수목적우선주식회사');
    await expect(rows.nth(1)).toContainText('삼성전자');

    // 73 신규 — 가장 늦은 발동이라 첫 칩 · 표 첫 행으로 들어온다.
    const C = {
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      orderNo: '0032003',
      state: 'Accepted',
      triggerPrice: 55_500,
      basePrice: 45_000,
      deadline110Ms: BigInt(t0 + 105_000),
      deadline119Ms: BigInt(t0 + 114_000),
    } as const;
    await relay.pushViOrderList([C], false);
    await expect(chips).toHaveCount(3, { timeout: 15_000 });
    await expect(chips.first()).toContainText('55,500');
    await expect(rows.first()).toContainText('55,500');

    // 73 갱신(가장 오래된 A 의 확인) — 도착은 가장 늦지만 자리는 끝 그대로다.
    await relay.pushViOrderList([{ ...A, confirmed: true }], false);
    await expect(rows.last().locator('[data-slot="vi-confirm-check"]')).toBeChecked({ timeout: 15_000 });
    await expect(chips.last()).toContainText('41,250');
    await expect(rows.last()).toContainText('41,250');
    await expect(chips.first()).toContainText('55,500');
  });

  test(`4. 카드 컨테이너 ${LC_COMPACT_MIN - 1}/${LC_COMPACT_MIN} · 829/830 · 991/992 — 밴드가 경계에서 바뀌고 각 폭에서 잘림 0 (E6 overflow · §2.2b 이관)`, async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);

    const cases: ReadonlyArray<readonly [number, Band]> = [
      [LC_COMPACT_MIN - 1, 'phone'],
      [LC_COMPACT_MIN, 'compact'],
      [829, 'compact'],
      [830, 'wide'],
      [991, 'wide'],
      [992, 'desktop'],
    ];
    for (const [target, expected] of cases) {
      await sizeCardTo(page, E2E_ISIN, target);
      const { width, band } = await cardMetrics(page, E2E_ISIN);
      expect(width).toBe(target);
      // 폭 → 기대 밴드(§2.2b) 와 CSS 가 실제로 고른 밴드가 같다 — 측정 대상이 카드라는 증거다.
      expect(bandOfWidth(width)).toBe(expected);
      expect(band, `카드 ${width}px — CSS 가 고른 밴드`).toBe(expected);
      await expectCardNotClipped(page, E2E_ISIN, `카드 ${width}px(${expected})`);
    }
  });

  test('4c. 갤럭시 폴드 안쪽 화면 세로(707×823) 1단 — 카드 컴팩트 · 매수/매도 pane 동시 · 3탭 없음 · 세 그룹 펼침/수동주문 덮기 잘림 0 · 2단은 폰 밴드 · lc 첫 경계 잠금 (quick-260928-q5e)', async ({
    page,
  }) => {
    const card = cardOf(page, E2E_ISIN);
    /** 컴팩트 밴드 카드 — 3탭 없음 · 두 pane 동시 · 세 그룹 펼침 잘림 0 · 수동주문 덮기 잘림 0. */
    const expectCompactBothPanes = async (label: string): Promise<void> => {
      await expect(card.getByRole('tablist', { name: '주문 진입' }), `${label} — 「주문 진입」 3탭`).toBeHidden();
      await expect(card.locator('[data-pane="buy"]'), `${label} — 매수 pane`).toBeVisible();
      await expect(card.locator('[data-pane="sell"]'), `${label} — 매도 pane`).toBeVisible();
      for (const slot of ['pre-buy', 'extra-buy', 'post-buy'] as const) await expandLcGroup(card, slot);
      await expectCardNotClipped(page, E2E_ISIN, `${label} · 세 그룹 펼침`);
      await card.getByRole('button', { name: '수동주문', exact: true }).click();
      await expect(card.getByTestId('manual-entry-form')).toBeVisible();
      await expect(card.getByTestId('manual-entry-options')).toBeHidden();
      await expectCardNotClipped(page, E2E_ISIN, `${label} · 수동주문 덮기`);
      await card.getByRole('button', { name: '수동주문 닫기' }).click();
      await expect(card.getByTestId('manual-entry-options')).toBeVisible();
    };

    relay.seedLimitChasers([{ buyEnabled: true }]);
    await page.setViewportSize(FOLD_VIEWPORT);
    await openFocusedCard(page);
    if ((await colsSegment(page).count()) === 1) await pickCols(page, 1);
    expect(await gridColumnCount(page)).toBe(1);

    // 폴드 1단 — 카드는 컴팩트 밴드(좌 호가 260 · 우 매수/매도 2열)다.
    const m = await cardMetrics(page, E2E_ISIN);
    console.log(`[q5e] 폴드 1단 카드 lc = ${m.width}px · band = ${m.band}`);
    test.info().annotations.push({ type: 'q5e 폴드 1단 카드 lc(px)', description: String(m.width) });
    expect(m.width, '폴드 1단 카드 폭 — 컴팩트 경계 위 여유 ≥1px').toBeGreaterThanOrEqual(LC_COMPACT_MIN + 1);
    expect(m.band, `폴드 1단 카드 ${m.width}px — CSS 가 고른 밴드`).toBe('compact');
    await expectCompactBothPanes(`폴드 1단 카드 ${m.width}px`);

    // 폴드 2단 — 카드(≈337)는 폰 밴드(D-12 · hfk 의도). 잘림 검사는 hfk 「남은 것」이라 범위 밖.
    await pickCols(page, 2);
    expect(await gridColumnCount(page)).toBe(2);
    const m2 = await cardMetrics(page, E2E_ISIN);
    expect(m2.band, `폴드 2단 카드 ${m2.width}px — 폰 밴드(D-12 · hfk 의도)`).toBe('phone');
    await expect(card.getByRole('tablist', { name: '주문 진입' })).toBeVisible();
    await pickCols(page, 1);

    // lc 첫 경계 잠금 — 경계 폭에서 컴팩트 · 두 pane · 잘림 0.
    for (const w of [LC_COMPACT_MIN]) {
      await sizeCardTo(page, E2E_ISIN, w);
      const mw = await cardMetrics(page, E2E_ISIN);
      expect(mw.width).toBe(w);
      expect(mw.band, `카드 ${w}px — CSS 가 고른 밴드`).toBe('compact');
      await expectCompactBothPanes(`카드 ${w}px(compact)`);
    }
  });

  test('5. 격자 1/2/3단 × 폰/와이드 — 카드가 정확히 어느 밴드로 가는지 + 잘림 0 (E6 overflow · D-12)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);

    /*
      2·3단 격자에서 카드 안 밀도가 폰 밴드로 떨어지는 것은 사용자가 확인한 **의도된 결과**다(D-12).
      그래서 「잘리지 않는다」만이 아니라 「정확히 이 밴드로 간다」를 함께 박제한다 — 격자 gap
      이나 여백 램프가 바뀌어 카드가 다른 밴드로 옮겨 가면 여기서 드러난다.
      (와이드 뷰포트 1440/1920 — 본문 = 뷰포트 − 사이드바 240 − 여백 48, gap 12, 카드 테두리 2)
    */
    const combos = [
      { viewport: 1440, cols: 1, expected: 'desktop' }, // 1150
      { viewport: 1440, cols: 2, expected: 'phone' }, // 568
      { viewport: 1440, cols: 3, expected: 'phone' }, // 374
      { viewport: 1920, cols: 1, expected: 'desktop' }, // 1630
      { viewport: 1920, cols: 2, expected: 'compact' }, // 808
      { viewport: 1920, cols: 3, expected: 'phone' }, // 534
    ] as const;

    for (const { viewport, cols, expected } of combos) {
      await page.setViewportSize({ width: viewport, height: 1000 });
      await pickCols(page, cols);
      expect(await gridColumnCount(page)).toBe(cols);
      const { width, band } = await cardMetrics(page, E2E_ISIN);
      const label = `뷰포트 ${viewport} × ${cols}단 → 카드 ${width}px`;
      expect(bandOfWidth(width), label).toBe(expected);
      expect(band, label).toBe(expected);
      await expectCardNotClipped(page, E2E_ISIN, label);
    }

    // 폰 뷰포트 — 저장값(3단)과 무관하게 1단이고 카드는 폰 밴드다.
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await gridColumnCount(page)).toBe(1);
      const m = await cardMetrics(page, E2E_ISIN);
      expect(m.band, `뷰포트 ${width} → 카드 ${m.width}px`).toBe('phone');
      await expectCardNotClipped(page, E2E_ISIN, `뷰포트 ${width} → 카드 ${m.width}px`);
    }
  });

  test('6. 펼침 0/1/2+ × 접힘 0/1/N — 접힌 카드는 스택 한 칸, 펼친 카드가 먼저 온다 (E6 zero-one-many · D-09)', async ({
    page,
  }) => {
    relay.seedLimitChasers([
      { isin: E2E_ISIN, buyEnabled: true },
      { isin: E2E_LONG_NAME_ISIN, buyEnabled: true },
      { isin: 'KR7086520004', buyEnabled: true },
    ]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(3, { timeout: 15_000 });
    await pickCols(page, 2);

    /** 격자의 직계 칸 순서 — `open` 은 펼친 카드 칸, `stack(n)` 은 접힌 카드 n장의 스택 칸. */
    const layout = () =>
      grid(page).evaluate((el) =>
        Array.from(el.children).map((child) => {
          const slot = child.getAttribute('data-slot');
          if (slot === 'card-stack') {
            return `stack(${child.querySelectorAll('[data-slot="strategy-card"]').length})`;
          }
          const card = child.querySelector('[data-slot="strategy-card"]');
          return card?.getAttribute('data-open') === 'true' ? 'open' : `?${slot}`;
        }),
      );
    const toggle = (isin: string) => toggleOf(page, isin);

    // 펼침 0 · 접힘 N — 스택 하나가 격자 한 칸을 차지한다.
    expect(await layout()).toEqual(['stack(3)']);

    // 펼침 1 · 접힘 2(N) — 펼친 카드가 먼저, 스택이 **같은 행의 다음 칸**이다(스택 = 한 칸).
    await toggle(E2E_LONG_NAME_ISIN).click();
    expect(await layout()).toEqual(['open', 'stack(2)']);
    const cells = grid(page).locator(':scope > *');
    const openBox = await cells.nth(0).boundingBox();
    const stackBox = await cells.nth(1).boundingBox();
    expect(openBox).not.toBeNull();
    expect(stackBox).not.toBeNull();
    expect(Math.abs(openBox!.y - stackBox!.y)).toBeLessThan(2);
    expect(stackBox!.x).toBeGreaterThan(openBox!.x + openBox!.width - 2);
    // 스택 안 카드의 본문은 **보이지 않는다**(D-11 · WR-02 — 한 번 펼친 본문은 숨김으로 남는다).
    await expect(
      grid(page).locator('[data-slot="card-stack"] [data-slot="card-body"]:visible'),
    ).toHaveCount(0);

    // 펼침 2 · 접힘 1.
    await toggle(E2E_ISIN).click();
    expect(await layout()).toEqual(['open', 'open', 'stack(1)']);
    // quick-260923-p3k — 방금 펼친 카드가 펼친 무리의 **맨 끝**이다(옛 규칙이면 시드 순서대로 E2E 가 앞).
    await expect(cells.nth(0).locator(cardSelector(E2E_LONG_NAME_ISIN))).toHaveCount(1);
    await expect(cells.nth(1).locator(cardSelector(E2E_ISIN))).toHaveCount(1);

    // 펼침 3(2+) · 접힘 0 — 스택 칸 자체가 없다.
    await toggle('KR7086520004').click();
    expect(await layout()).toEqual(['open', 'open', 'open']);
    await expect(grid(page).locator('[data-slot="card-stack"]')).toHaveCount(0);

    // 다시 하나 접으면 스택이 **맨 뒤** 칸으로 돌아온다.
    await toggle(E2E_LONG_NAME_ISIN).click();
    expect(await layout()).toEqual(['open', 'open', 'stack(1)']);
    // 한 번 펼쳤다 접은 카드도 본문은 보이지 않는다(숨김으로 DOM 에 남아 있을 뿐 · WR-02).
    await expect(
      grid(page).locator('[data-slot="card-stack"] [data-slot="card-body"]:visible'),
    ).toHaveCount(0);

    // 2026-09-23 개정 — 방금 접은 카드는 스택의 **맨 앞**이다(스택 안 순서 E2E → LONG).
    await toggle(E2E_ISIN).click();
    expect(await layout()).toEqual(['open', 'stack(2)']);
    const stacked = grid(page).locator('[data-slot="card-stack"] [data-slot="strategy-card"]');
    await expect(stacked.nth(0)).toHaveAttribute('data-key', new RegExp(`^${E2E_ISIN}:`));
    await expect(stacked.nth(1)).toHaveAttribute('data-key', new RegExp(`^${E2E_LONG_NAME_ISIN}:`));
    // 직렬 공유 페이지 — 끝 상태 모양(펼침 2 · 접힘 1)을 이전과 같게 되돌린다.
    await toggle(E2E_ISIN).click();
    expect(await layout()).toEqual(['open', 'open', 'stack(1)']);
  });

  test('7. 폰 밴드 — 인라인 편집 행을 하단 고정 공용 패널 위로 올려 적용 → 10 수신 → 에코 → 행 값 · 패널은 화면 하단 그대로 · 맨 아래까지 스크롤해도 카드 끝이 패널에 묻히지 않는다 (E13 overflow · 옛 E15 더티 바 재정의 · D-04 · D-28)', async ({
    page,
  }) => {
    /*
      옛 7 은 더티 바(카드 하단 자리)와 하단 고정 공용 패널의 겹침 0 을 쟀다. Phase 20 D-04 로 바가 사라졌다 —
      값은 행에서 확정하면 곧장 나간다. 그래서 같은 성질(편집 표면이 패널에 묻히지 않는다 · 패널은 비켜 서지
      않는다 · 카드 끝이 패널 아래로 숨지 않는다)을 **편집 중인 행**으로 다시 잰다.
    */
    await page.setViewportSize(PHONE_VIEWPORT);
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    // 먼저 패널이 **정말 화면 하단에 붙어 있는지** 본다(겹침 0 만 보면 화면 밖 패널도 초록이 된다).
    const viewportH = PHONE_VIEWPORT.height;
    await showLc(page, 'lc-buy-watch-qty');
    const row = lcRow(page, 'lc-buy-watch-qty');
    await row.scrollIntoViewIfNeeded();
    const pinned = await sharedPanels(page).boundingBox();
    expect(pinned).not.toBeNull();
    expect(Math.abs(pinned!.y + pinned!.height - viewportH), '편집 전 — 패널 끝이 화면 하단').toBeLessThanOrEqual(1);

    // 잔량 행을 패널 위 화면 가운데로 올린다(스크롤 주체가 창이든 main 이든 scrollIntoView 가 맞춘다).
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect
      .poll(async () => {
        const r = await row.boundingBox();
        const p = await sharedPanels(page).boundingBox();
        return r !== null && p !== null && r.y + r.height <= p.y;
      }, { message: '잔량 행 아래 끝이 패널 위 끝보다 위' })
      .toBe(true);

    await row.click();
    const input = page.locator('#lc-buy-watch-qty');
    await expect(input).toBeFocused();
    await input.fill('8000');

    // 편집 중인 행과 패널이 세로로 겹치지 않는다 · 패널은 비켜 서지 않고 화면 하단 그대로다.
    const editing = page.locator('[data-lc-field="lc-buy-watch-qty"][data-editing="true"]');
    const editBox = await editing.boundingBox();
    const panel = await sharedPanels(page).boundingBox();
    expect(editBox, '편집 중 행을 잴 수 없다').not.toBeNull();
    expect(panel, '공용 패널을 잴 수 없다').not.toBeNull();
    const overlap =
      Math.min(panel!.y + panel!.height, editBox!.y + editBox!.height) - Math.max(panel!.y, editBox!.y);
    expect(overlap, `편집 행 [${editBox!.y}, ${editBox!.y + editBox!.height}] ∩ 패널 [${panel!.y}, ${panel!.y + panel!.height}]`).toBeLessThanOrEqual(1);
    expect(Math.abs(panel!.y + panel!.height - viewportH), '편집 중 — 패널은 화면 하단 그대로').toBeLessThanOrEqual(1);
    await expect(sharedPanels(page)).not.toHaveAttribute('data-dirty-reserve', 'true');

    await input.press('Enter');
    await waitForSetAtGateway(relay, before + 1);
    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 8_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주', { timeout: 15_000 });
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);

    // ③ 페이지 맨 아래 — 흐름 안 자리(spacer) 덕에 카드 끝이 패널에 묻히지 않는다(옛 단언 그대로).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastCard = await cardOf(page, E2E_ISIN).boundingBox();
    const panelAtEnd = await sharedPanels(page).boundingBox();
    expect(Math.abs(panelAtEnd!.y + panelAtEnd!.height - viewportH), '맨 아래 — 패널은 화면 하단 그대로').toBeLessThanOrEqual(1);
    expect(lastCard!.y + lastCard!.height, '맨 아래 — 카드 끝이 패널에 묻히지 않는다').toBeLessThanOrEqual(panelAtEnd!.y + 1);
  });

  test('G-21-R3-2 앱 공용 패널 숨김 — 앱 390 · 1024 는 패널 · spacer 가 없고 탭바 몫은 82px 로 풀린다, 브라우저 390 · 1280 은 그대로 보인다 (D-25a)', async ({
    page,
  }) => {
    /*
      앱(html.native-app)은 /trading 하단 공용 패널과 흐름 안 자리(spacer)를 CSS 로 숨긴다(폰 · iPad 공통) —
      네이티브 탭바 위에 겹쳐 쌓이던 문제. 브라우저는 종전 그대로다(T-21-89).
      ★ 카드 더티 바 자체는 Phase 20 D-04 이후 렌더되는 곳이 없어(값은 행 확정 = 즉시 전송) UI 로 더티 카드를
        만들 수 없다. 그래서 바 위치 식(innerHeight − inset − 탭바 몫)은 strategy-card.test 가 잠그고, 여기서는
        그 식의 입력인 **프로브 계산값**이 실브라우저에서 14 + 60 + 8 = 82px(안전영역 0)로 풀리는지를 본다.
    */
    relay.seedLimitChasers([{ buyEnabled: true }]);
    const spacer = page.locator('[data-slot="shared-panels-spacer"]');
    const probeBottom = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-slot="native-tabbar-probe"]');
        return el === null ? null : getComputedStyle(el).bottom;
      });

    // ① 브라우저 390 · 1280 — 패널이 보인다(폰은 포털 + spacer).
    await page.setViewportSize(PHONE_VIEWPORT);
    await openFocusedCard(page);
    await expect(sharedPanels(page)).toBeVisible();
    await expect(sharedPanels(page)).toHaveAttribute('data-pinned', 'true');
    await expect(spacer).toHaveCount(1);
    expect(await probeBottom(), '브라우저 — 탭바 몫 0').toBe('0px');
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(sharedPanels(page)).toBeVisible();

    // ② 앱 390 — 패널 · spacer 가 없고, 패널 높이 알림(--wb-bottom-inset)도 0 이다.
    await installNativeApp(page);
    await page.setViewportSize(PHONE_VIEWPORT);
    await openFocusedCard(page);
    await expect(page.locator('html')).toHaveClass(/native-app/);
    await expect(sharedPanels(page)).toBeHidden();
    await expect(spacer).toBeHidden();
    const inset = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--wb-bottom-inset').trim(),
    );
    expect(['', '0px'], `--wb-bottom-inset = ${inset}`).toContain(inset);
    expect(await probeBottom(), '앱 — 탭바 몫 = 14 + 60 + 8').toBe('82px');

    // ③ 앱 1024(iPad) — 넓은 폭(격자 아래 일반 섹션)도 숨긴다.
    await page.setViewportSize({ width: 1024, height: 1366 });
    await expect(cardOf(page, E2E_ISIN)).toBeVisible();
    await expect(sharedPanels(page)).toBeHidden();
    await expect(spacer).toBeHidden();
  });

  test.describe("앱 모드 터치 키패드(D-12a'')", () => {
    test.use({ hasTouch: true });

    test("D-12a'' 앱 키패드 시트 — 값 행 탭 → overlay 열림 신호에 immediate:true · 닫으면 {open:false} (quick-260926-vk9)", async ({
      page,
    }) => {
      /*
        실제 페이지 · 실제 감지 스크립트 · 실제 Provider · 실제 키패드가 네이티브 채널로 내보내는 바이트를 본다.
        수량·가격 칸은 시스템 키보드가 아니라 NumberPadSheet 를 연다 → 그 열림 신호만 immediate:true 를 실어
        네이티브가 탭바를 150ms 대기·페이드 없이 즉시 숨긴다(D-12a''). dev 서버는 StrictMode 라 새로 마운트되는
        마커 effect 가 획득→해제→획득으로 두 번 돌 수 있다 → 열림 신호 개수는 고정하지 않고 **모두** 같은 모양인지 본다.
      */
      relay.seedLimitChasers([{ buyEnabled: true }]);
      await installNativeApp(page);
      await page.setViewportSize(PHONE_VIEWPORT);
      await openFocusedCard(page);
      await expect(page.locator('html')).toHaveClass(/native-app/);

      const overlayPayloads = async () =>
        (await nativeMessages(page)).filter((m) => m.type === 'overlay').map((m) => m.payload);
      const before = (await overlayPayloads()).length;

      await showLc(page, 'lc-buy-watch-qty');
      const row = lcRow(page, 'lc-buy-watch-qty');
      await expect(row).toHaveAttribute('aria-haspopup', 'dialog');
      await row.tap();
      const sheet = page.locator('[data-slot="numpad-sheet"]');
      await expect(sheet).toBeVisible({ timeout: 10_000 });

      const opensSince = async () =>
        (await overlayPayloads()).slice(before).filter((p) => (p as { open?: unknown } | undefined)?.open === true);
      await expect
        .poll(async () => (await opensSince()).length, { message: '키패드 열림 신호가 1개 이상' })
        .toBeGreaterThanOrEqual(1);
      const opens = await opensSince();
      for (const p of opens) expect(p, '열림 신호는 모두 immediate:true').toEqual({ open: true, immediate: true });

      await sheet.getByRole('button', { name: '닫기' }).tap();
      await expect(sheet).toHaveCount(0);
      await expect.poll(async () => (await overlayPayloads()).at(-1)).toEqual({ open: false });
    });
  });

  test('G-21-R3-9 /trading?code= — 그 종목 카드를 보장 · 펼침 · 헤더 토글 포커스, URL 에서 code 가 빠지고 relay 로 나간 전략/주문 프레임 0, 같은 URL 을 다시 열어도 카드 수 그대로 (D-30 · T-21-91)', async ({
    page,
  }) => {
    /*
      종목상세 「트레이딩」 착지. 작업대가 배치 복원 뒤 1회 `fetchStockDetail` → `isPickable` → 카드 보장
      (reveal) 을 하고 `code` 를 지운다. ★ 착지는 화면 상태만 바꾼다 — 전략 등록 · 주문 · 정정 · VI ·
      래치 어떤 명령 프레임도 게이트웨이에 닿지 않는다.
    */
    const COMMAND_TYPES: readonly number[] = [
      DMA_MSG.DirectOrderReq,
      DMA_MSG.SetLimitChaserReq,
      DMA_MSG.SetVITriggerReq,
      DMA_MSG.DisableStrategiesReq,
      DMA_MSG.ConfirmVIOrderReq,
      DMA_MSG.ArmSellLatchReq,
      DMA_MSG.ArmCancelLatchReq,
      38, // 구 ArmBuyLatchReq — 봉인 번호, 게이트웨이에 닿지 않아야 한다
    ];
    const commandsSent = () => relay.requestLog().filter((m) => COMMAND_TYPES.includes(m)).length;
    const landingUrl = `${WORKBENCH_URL}?code=005930`;
    const codeCleared = (url: URL) => url.pathname === '/trading' && !url.searchParams.has('code');

    // ① 카드 없는 종목 — 새 카드가 펼친 채 서고 헤더 토글이 포커스를 받는다.
    await page.goto(landingUrl);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-key', STRATEGY_KEY);
    await expect(card).toHaveAttribute('data-open', 'true');
    await expect(toggleOf(page, E2E_ISIN)).toBeFocused();
    await expect(page).toHaveURL(codeCleared);
    expect(commandsSent(), '착지는 명령 프레임을 보내지 않는다').toBe(0);

    // ② 같은 URL 을 다시 연다 — 복원된 같은 카드를 펼칠 뿐 늘지 않는다.
    await toggleOf(page, E2E_ISIN).click();
    await expect(card).toHaveAttribute('data-open', 'false');
    await page.goto(landingUrl);
    await waitForReady(page);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(toggleOf(page, E2E_ISIN)).toBeFocused();
    await expect(cards(page)).toHaveCount(1);
    await expect(page).toHaveURL(codeCleared);
    expect(commandsSent(), '다시 열어도 명령 프레임 0').toBe(0);
  });

  test('8.상태줄 — 폰 밴드에서 필이 2줄 이상으로 wrap 하고 어느 필도 잘리지 않는다, 와이드도 잘림 0 (E1 overflow)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);

    /** 상태줄 직계 필들이 몇 줄에 걸쳐 있는가(서로 다른 top 의 수). */
    const rowCount = () =>
      statusBar(page).evaluate((el) => {
        const tops = new Set<number>();
        for (const child of Array.from(el.children)) {
          const r = (child as HTMLElement).getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          tops.add(Math.round(r.top));
        }
        return tops.size;
      });
    const expectBarNotClipped = async (label: string) => {
      const scrolled = await scrollOverflowing(page, '[data-slot="workbench-status-bar"]');
      expect(scrolled, `${label} — 상자를 넘친 필`).toEqual([]);
      const box = await statusBar(page).boundingBox();
      expect(box).not.toBeNull();
      const pushed = await leavesOverflowing(statusBar(page), box!.x + box!.width);
      expect(pushed, `${label} — 상태줄 밖으로 밀린 필`).toEqual([]);
    };

    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(WORKBENCH_URL);
      await waitForReady(page);
      await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
      await expect(colsSegment(page)).toHaveCount(0);
      expect(await rowCount(), `뷰포트 ${width} — 상태줄이 wrap 하지 않았다`).toBeGreaterThanOrEqual(2);
      await expectBarNotClipped(`뷰포트 ${width}`);
    }

    await page.setViewportSize(WIDE_VIEWPORT);
    await expect(colsSegment(page)).toHaveCount(1);
    await expectBarNotClipped('뷰포트 1440');
  });
  // =========================================================================
  // 이관 — 옛 trading-limit-chaser.spec (상따 → 작업대 카드)
  // =========================================================================

  test('9. 종목 추가란 — 키보드만으로 종목을 고르면 카드가 서고, 가격 5칸·종목정보 상한·호가 10단이 상한가로 시딩된다 (옛 LC 2·14 · D-08)', async ({
    page,
  }) => {
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);

    // 입력 글꼴은 기기와 무관하게 14px — iOS 확대는 루트 viewport maximum-scale=1 이 막는다(quick-260925-ptw).
    await expect(addBox(page)).toHaveCSS('font-size', '14px');

    await addStockByKeyboard(page);

    // 결과 — 카드가 그 종목으로 선다. 여기까지 와야 「고른 것」이다.
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-key', STRATEGY_KEY);
    await expect(card.locator('[data-slot="card-header"]')).toContainText('삼성전자');
    // 추가한 뒤 입력은 비워진다(상시 입력 — 필드는 남는다).
    await expect(addBox(page)).toHaveValue('');

    for (const id of [
      'lc-buy-watch-price',
      'lc-buy-order-price',
      'lc-sell-watch-price',
      'lc-sell-order-price',
      'lc-sweep-watch-price',
    ]) {
      await expect(lcValue(page, id)).toHaveText(`${LIVE_UPPER_LIMIT}원`, { timeout: 15_000 });
    }
    // 폼과 종목정보 10칸이 **같은 상한가**를 말한다.
    const quoteGrid = card.locator('[data-slot="lc-quote-grid"]');
    await expect(quoteGrid.locator('> *')).toHaveCount(10);
    await expect(quoteGrid).toContainText('상한');
    await expect(quoteGrid).toContainText(LIVE_UPPER_LIMIT);
    // 호가 10단(매도 10 + 매수 10) — 데스크톱 밴드 표 트리에서 보이는 행.
    const ladder = card.locator('[data-slot="orderbook-ladder"][data-variant="chaser"]');
    await expect(ladder.locator('[data-slot="ladder-row"]:visible')).toHaveCount(20);
    await expect(ladder).toContainText('99,000');
  });

  test('10. 스위치 즉시 전송 → 게이트웨이 10 수신 → 60 에코 → 카드 LED · 공용 로그 · 사이드바 (옛 LC 3 · WR-06 · D-05)', async ({
    page,
  }) => {
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await addStockByKeyboard(page);
    await expect(lcValue(page, 'lc-buy-order-price')).toHaveText(`${LIVE_UPPER_LIMIT}원`, {
      timeout: 15_000,
    });

    // 등록 전 — 사이드바 3단에 전략 항목이 없다.
    await expect(strategyItems(page)).toHaveCount(0);

    // ★ Phase 24 R7 · Pitfall 5 — 무장 가드는 그룹별이다. 마스터는 주문가격 · 비교가격(시세)만 보므로 시세가
    //   있으면 켤 수 있고, 수량 0(10만원 / 12.74만 = 0주)은 누르기 전 패널이 아니라 그 그룹을 켜는 순간의
    //   사전 검증 줄이 말한다. 새 전략 기본 금액은 4,000만원(D-04)이라 금액을 10만원으로 내려 수량 0 을 만든다.
    const card = cardOf(page, E2E_ISIN);
    const buySwitch = lcSwitch(card, '매수주문 켜기');
    await expect(buySwitch).toBeEnabled();
    await expect(card.locator('[data-slot="lc-arm-blocked"]')).toHaveCount(0);
    await editLc(page, 'lc-buy-order-amount', '10'); // 10만원 → 0주(로컬 반영 · 전송 0)
    await expect(lcValue(page, 'lc-buy-order-amount')).toHaveText('10만원');
    // 선매수를 켜려 하면 그 카드 사전 검증 줄이 수량 0 을 말한다 — 전송 0 · 스위치 그대로 · 줄바꿈 허용 · 잘림 0.
    const setBeforePrecheck = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await lcSwitch(card, '선매수 켜기').click();
    const precheck = card.locator('[data-slot="lc-group-pre-buy"] [data-slot="lc-group-precheck"]');
    await expect(precheck).toHaveText('금액이 주문가격보다 작아 주문수량이 0주예요 — 금액을 올려 주세요');
    expect(await precheck.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(lcSwitch(card, '선매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(setBeforePrecheck);
    // ★ A-P1 — 미등록 카드의 값 확정은 **로컬 반영**이다(서버 전략이 없어 보낼 곳이 없다). 전송 0.
    const setBeforeAmount = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await editLc(page, 'lc-buy-order-amount', '50'); // 50만원 → 3주
    await expect(lcValue(page, 'lc-buy-order-amount')).toHaveText('50만원');
    await expect(buySwitch).toBeEnabled();
    // 원인 값(금액)이 고쳐지면 사전 검증 줄이 사라진다(미등록 카드 = 로컬 반영 뒤).
    await expect(precheck).toHaveCount(0);
    expect(
      relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length,
      '미등록 카드의 값 확정은 게이트웨이로 나가지 않는다(A-P1)',
    ).toBe(setBeforeAmount);

    await buySwitch.click();
    // ★ 확인 다이얼로그가 없다(D-05) — 그 자리에서 바로 나간다.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await waitForSetAtGateway(relay, 1);

    await relay.pushLimitChaserEcho({ buyEnabled: true });

    // 무장 표기는 카드 헤더의 래치 LED 하나다(D-22). 스텁 기본 매도잔량 기준 → 초록·비클릭(BL-01).
    await expect(
      card.locator('[data-slot="card-header"] [data-slot="latch-led"][data-kind="buy"]'),
    ).toHaveAttribute('data-tone', 'armed', { timeout: 15_000 });
    await expect((await logRows(page)).first()).toContainText('매수주문 무장');
    // 사이드바 3단에 항목이 서고 LED 3점 중 매수가 켜진다.
    await expect(strategyItems(page)).toHaveCount(1);
    await expect(strategyItems(page).first().locator('[data-led="buy"]')).toHaveAttribute(
      'data-tone',
      'armed',
    );
  });

  test('GC3 같은 종목의 KRX·NXT 두 전략 = 카드 두 장, 사이드바 NXT 항목은 NXT 카드를 펼친다 (WR-05 · D-03)', async ({
    page,
  }) => {
    const nxtKey = `${E2E_ISIN}:${E2E_ACCOUNT_NO}:NXT`;
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(0);

    // 같은 종목 · 같은 계좌 · 거래소만 다른 등록 전략 두 건(60 에코).
    await relay.pushLimitChaserEcho({ buyEnabled: true, exchange: 'KRX' });
    await relay.pushLimitChaserEcho({ buyEnabled: true, exchange: 'NXT' });

    // D-03 「카드와 동기」 — 사이드바 두 줄 = 카드 두 장, 각자 자기 키.
    await expect(strategyItems(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(cards(page)).toHaveCount(2);
    await expect(cardByKey(page, STRATEGY_KEY)).toHaveCount(1);
    await expect(cardByKey(page, nxtKey)).toHaveCount(1);
    await expect(cardByKey(page, STRATEGY_KEY)).toHaveAttribute('data-open', 'false');
    await expect(cardByKey(page, nxtKey)).toHaveAttribute('data-open', 'false');

    // 사이드바 NXT 항목 → NXT 카드만 펼쳐진다(같은 종목 KRX 카드가 아니다).
    await desktopNav(page).locator(`[data-strategy-key="${nxtKey}"]`).click();
    await expect(cardByKey(page, nxtKey)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(cardByKey(page, STRATEGY_KEY)).toHaveAttribute('data-open', 'false');

    // UI-SPEC Q-3 — 두 카드는 헤더 종목명 title 로 구분된다(보이는 요소 추가 없음).
    await expect(cardByKey(page, nxtKey).locator('[data-part="name"]')).toHaveAttribute(
      'title',
      `삼성전자 · 계좌 ${E2E_ACCOUNT_NO} · NXT`,
    );

    // quick-260923-pgv — 등록 카드도 세그먼트가 활성 · 충돌(NXT 카드 있음)이면 이 카드는 그대로, 그 카드가 펼쳐진다.
    // NXT 카드를 먼저 접어 둔다 — 펼침이 이미 참이면 충돌 이동을 증명하지 못한다.
    await cardByKey(page, nxtKey).locator('[data-slot="card-header"] button[aria-expanded]').click();
    await expect(cardByKey(page, nxtKey)).toHaveAttribute('data-open', 'false');
    const krxNxtRadio = cardByKey(page, STRATEGY_KEY)
      .locator('[data-slot="card-exchange-segment"]')
      .getByRole('radio', { name: 'NXT' });
    await expect(krxNxtRadio).toBeEnabled();
    await krxNxtRadio.click();
    await expect(cardByKey(page, STRATEGY_KEY)).toHaveCount(1);
    await expect(cardByKey(page, nxtKey)).toHaveAttribute('data-open', 'true');
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByTestId('workbench-exchange-confirm')).toHaveCount(0);
  });

  test('GC4 카드 없는 종목의 미체결을 누르면 그 종목 카드가 붙어 펼쳐지고 수동주문에 원주문 칩이 선다 (WR-04 · D-21)', async ({
    page,
  }) => {
    const orderNo = '0000135802';
    const key = `${E2E_LONG_NAME_ISIN}:${E2E_ACCOUNT_NO}:KRX`;
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(0);

    await relay.pushAccountState({
      unfilled: [
        {
          orderNo,
          isin: E2E_LONG_NAME_ISIN,
          side: 'B',
          price: 10_150,
          orderQty: 30,
          filledQty: 0,
          unfilledQty: 30,
          exchange: 'KRX',
        },
      ],
    });

    const unfilledTab = sharedPanels(page).getByRole('tab', { name: /미체결/ });
    if ((await unfilledTab.getAttribute('aria-selected')) !== 'true') await unfilledTab.click();
    const row = sharedPanels(page)
      .locator('[data-slot="account-embed-unfilled-row"]')
      .filter({ hasText: orderNo });
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    const setBefore = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await row.locator('td').nth(3).click();

    // 받을 카드가 붙는다 — 행의 ISIN · 행의 거래소 · 상태줄 계좌 · 펼침.
    await expect(cards(page)).toHaveCount(1);
    const card = cardByKey(page, key);
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute('data-open', 'true');

    // 카드의 「수동주문」 을 열면 원주문 칩이 그 주문번호를 말한다.
    await card.getByRole('button', { name: '수동주문', exact: true }).click();
    await expect(card.getByTestId('manual-order-selchip')).toBeVisible();
    await expect(card.getByTestId('manual-order-selchip')).toContainText(orderNo);

    // ★ 카드 추가는 화면 상태다 — 서버 전략 생성 송신 0 (T-18-99).
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(setBefore);
  });

  test('GC5 결과 모름 잠금은 카드를 닫았다 다시 열어도 풀리지 않는다 — ✕ 는 확인을 거친다 (GC-WR-03 · D-20)', async ({
    page,
  }) => {
    const directOrders = () => relay.requestLog().filter((m) => m === DMA_MSG.DirectOrderReq).length;
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(0);

    // 종목 추가로 카드 → 수동주문 → 매수 → 확인.
    await addStockByKeyboard(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    let card = cardOf(page, E2E_ISIN);
    await card.getByRole('button', { name: '수동주문', exact: true }).click();
    let form = card.getByTestId('manual-order-form');
    await expect(form).toBeVisible();
    await form.locator(`#mo-price-${E2E_ISIN}`).fill('98000');
    await form.locator(`#mo-qty-${E2E_ISIN}`).fill('10');
    const buy = form.getByTestId('manual-order-buttons').getByRole('button', { name: '매수' });
    await expect(buy).toBeEnabled();
    await buy.click();
    const confirm = page.getByTestId('order-confirm-dialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /매수/ }).click();

    // 스텁 게이트웨이는 주문에 응답하지 않는다 — relay 5초 상한 뒤 「결과 모름」.
    await expect.poll(directOrders, { timeout: 15_000 }).toBe(1);
    await expect(form.getByTestId('manual-order-result')).toHaveAttribute('data-kind', 'unknown', {
      timeout: 15_000,
    });

    // ✕ → 결과 모름 확인 다이얼로그(카드는 아직 남아 있다).
    await card.getByRole('button', { name: /카드 닫기$/ }).click();
    const ask = page.getByTestId('workbench-close-confirm');
    await expect(ask).toBeVisible();
    await expect(ask).toHaveAttribute('data-reason', 'unknown');
    await expect(ask).toContainText('결과를 모르는 주문이 있어요');
    // 본문은 해제 규칙을 사실대로 말한다(18-34 · R3-WR-02 · 사용자 결정 1).
    await expect(ask).toContainText('다른 화면에 다녀와도');
    await expect(ask).toContainText('로그아웃하거나 새로고침하면 풀려요.');
    await expect(ask).not.toContainText('실패');
    await expect(cards(page)).toHaveCount(1);
    await ask.getByRole('button', { name: '카드 닫기', exact: true }).click();
    await expect(cards(page)).toHaveCount(0);

    // 같은 종목을 다시 추가 → 새 카드의 수동주문 4버튼이 잠긴 채 · 잠금 문구.
    await addStockByKeyboard(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    card = cardOf(page, E2E_ISIN);
    await card.getByRole('button', { name: '수동주문', exact: true }).click();
    form = card.getByTestId('manual-order-form');
    await expect(form).toBeVisible();
    const buttons = form.getByTestId('manual-order-buttons').getByRole('button');
    await expect(buttons).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) await expect(buttons.nth(i)).toBeDisabled();
    await expect(form.getByTestId('manual-order-locked')).toHaveText(
      '결과를 모르는 주문이 있어 주문 버튼을 잠갔어요 — 미체결 목록에서 접수 여부를 확인하세요',
    );
    await expect(form).not.toContainText('실패');

    // ★ 같은 주문이 다시 나가지 않았다 — 게이트웨이 주문 1건 · DB 기록 0건(D-01).
    expect(directOrders()).toBe(1);
    expect(relay.orderInserts()).toHaveLength(0);
  });

  test('GC6 결과 모름 잠금은 앱 수명이다 — 다른 화면(/me · 종목상세)에 다녀와 「트레이딩」 착지 카드에서도 잠긴 채, 새로고침에만 풀린다 (R3-WR-02 · 사용자 결정 1 · D-30 · D-31)', async ({
    page,
  }) => {
    const LOCKED_TEXT =
      '결과를 모르는 주문이 있어 주문 버튼을 잠갔어요 — 미체결 목록에서 접수 여부를 확인하세요';
    const directOrders = () => relay.requestLog().filter((m) => m === DMA_MSG.DirectOrderReq).length;
    // 이동 전에 relay(:8090) 소켓을 세기 시작한다 — 수가 1 이면 새로고침이 아니었다(Provider 가 산다).
    const relaySockets: string[] = [];
    page.on('websocket', (ws) => {
      if (ws.url().includes(':8090')) relaySockets.push(ws.url());
    });
    // 작업대 이탈 경고(더티 카드)는 브라우저 confirm 이다 — 수락해도 client-side 이동 그대로다.
    page.on('dialog', (d) => void d.accept());
    // 종목상세가 붙는 API — 오류 상태여도 단언은 성립하지만 소음을 줄인다.
    await mockNewsApi(page, { code: '005930', list: buildNewsList('005930', 3) });
    await mockDiscussionsApi(page, { code: '005930', list: buildDiscussionList('005930', 3) });
    await mockThemeChips(page, []);

    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(0);

    // 종목 추가로 카드 → 수동주문 → 매수 → 확인 → 무응답 → 「결과 모름」.
    await addStockByKeyboard(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    let card = cardOf(page, E2E_ISIN);
    await card.getByRole('button', { name: '수동주문', exact: true }).click();
    let form = card.getByTestId('manual-order-form');
    await expect(form).toBeVisible();
    await form.locator(`#mo-price-${E2E_ISIN}`).fill('98000');
    await form.locator(`#mo-qty-${E2E_ISIN}`).fill('10');
    const buy = form.getByTestId('manual-order-buttons').getByRole('button', { name: '매수' });
    await expect(buy).toBeEnabled();
    await buy.click();
    const confirm = page.getByTestId('order-confirm-dialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /매수/ }).click();
    await expect.poll(directOrders, { timeout: 15_000 }).toBe(1);
    await expect(form.getByTestId('manual-order-result')).toHaveAttribute('data-kind', 'unknown', {
      timeout: 15_000,
    });

    // 사이드바 「My page」 → /me (client-side — relay 소켓은 여전히 1개).
    const nav = page.locator('aside nav[aria-label="주 메뉴"]');
    await nav.getByRole('link', { name: 'My page', exact: true }).click();
    await expect(page).toHaveURL(/\/me(?:\?.*)?$/);
    expect(relaySockets).toHaveLength(1);

    // 사이드바 「트레이딩」 → /trading → 배치 기억으로 카드가 그대로 있다(quick-260923-lyt) →
    // 같은 종목 다시 추가해도 카드는 1장(펼침만) → 잠긴 채.
    await nav.getByRole('link', { name: '트레이딩', exact: true }).click();
    await expect(page).toHaveURL(/\/trading(?:\?.*)?$/);
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(1);
    await addStockByKeyboard(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    card = cardOf(page, E2E_ISIN);
    await card.getByRole('button', { name: '수동주문', exact: true }).click();
    form = card.getByTestId('manual-order-form');
    await expect(form).toBeVisible();
    const cardButtons = form.getByTestId('manual-order-buttons').getByRole('button');
    await expect(cardButtons).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) await expect(cardButtons.nth(i)).toBeDisabled();
    await expect(form.getByTestId('manual-order-locked')).toHaveText(LOCKED_TEXT);
    await expect(form).not.toContainText('실패');

    // ✕ → 결과 모름 다이얼로그 · 새 본문 → 「취소」(카드는 남는다).
    await card.getByRole('button', { name: /카드 닫기$/ }).click();
    const ask = page.getByTestId('workbench-close-confirm');
    await expect(ask).toHaveAttribute('data-reason', 'unknown');
    await expect(ask).toContainText('다른 화면에 다녀와도');
    await expect(ask).toContainText('로그아웃하거나 새로고침하면 풀려요.');
    await ask.getByRole('button', { name: '취소', exact: true }).click();
    await expect(ask).toBeHidden();

    /*
      헤더 「종목 검색 열기」 → 삼성전자 → /stocks/005930 (client-side · 다른 화면) → 히어로 「트레이딩」(D-30)
      → /trading?code= 착지(client-side) → 그 카드 수동주문도 잠긴 채. 옛 「호가주문」 탭 경유는 D-31 로
      사라졌다 — 같은 키(계좌|ISIN|거래소)를 보는 다른 진입로가 착지 카드다.
    */
    await page.getByLabel('종목 검색 열기').first().click();
    const search = page.getByRole('dialog').getByPlaceholder('종목명 또는 종목코드를 입력하세요');
    await search.fill('삼성');
    await page.getByRole('option', { name: /삼성전자/ }).click();
    await expect(page).toHaveURL(/\/stocks\/005930(?:\?.*)?$/);
    await expect(page.getByRole('heading', { level: 1, name: '삼성전자' })).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-slot="detail-trading-button"]').click();
    await expect(page).toHaveURL((url) => url.pathname === '/trading' && !url.searchParams.has('code'), {
      timeout: 30_000,
    });
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    form = card.getByTestId('manual-order-form');
    if (!(await form.isVisible())) await card.getByRole('button', { name: '수동주문', exact: true }).click();
    await expect(form).toBeVisible();
    const landedButtons = form.getByTestId('manual-order-buttons').getByRole('button');
    await expect(landedButtons).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) await expect(landedButtons.nth(i)).toBeDisabled();
    await expect(form.getByTestId('manual-order-locked')).toHaveText(LOCKED_TEXT);
    await expect(form).not.toContainText('실패');
    expect(relaySockets).toHaveLength(1);

    // ★ 같은 주문이 다시 나가지 않았다 — 게이트웨이 주문 1건 · DB 기록 0건(D-01).
    expect(directOrders()).toBe(1);
    expect(relay.orderInserts()).toHaveLength(0);

    // 새로고침 = Provider 재생성 → 잠금 해제(사용자 결정 1 의 해제 규칙). 소켓이 새로 열린다.
    await page.reload();
    await waitForReady(page);
    await expect(cards(page)).toHaveCount(1, { timeout: 15_000 });
    card = cardOf(page, E2E_ISIN);
    if ((await card.getAttribute('data-open')) !== 'true') await toggleOf(page, E2E_ISIN).click();
    await expect(card).toHaveAttribute('data-open', 'true');
    const reloadedForm = card.getByTestId('manual-order-form');
    if (!(await reloadedForm.isVisible())) {
      await card.getByRole('button', { name: '수동주문', exact: true }).click();
    }
    await expect(reloadedForm).toBeVisible();
    await expect(reloadedForm.getByTestId('manual-order-locked')).toHaveCount(0);
    await expect(
      reloadedForm.getByTestId('manual-order-buttons').getByRole('button', { name: '매수' }),
    ).toBeEnabled();
    expect(relaySockets).toHaveLength(2);
    expect(directOrders()).toBe(1);
  });

  test('GC8 주문 체결 통보 → 우상단 토스트(헤더 아래) → 클릭 → 카드 펼침 + 「미체결」 탭 + 헤더 표시 해제 (quick-260923-pgu · 목업 ③A · quick-260928-cs1)', async ({
    page,
  }) => {
    const orderNo = '0000000777';
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    // 알림 live 영역은 알림이 없어도 먼저 서 있어야 낭독된다.
    const toastBox = page.locator('[data-slot="alert-toasts"]');
    await expect(toastBox).toHaveAttribute('role', 'status');
    await expect(toastBox).toHaveAttribute('aria-live', 'polite');

    // 주문번호 색인의 원천 — 계좌 상태의 미체결 행(relay 리듀서가 원시 프레임에서 색인한다).
    await relay.pushAccountState({
      unfilled: [
        {
          orderNo,
          isin: E2E_ISIN,
          side: 'B',
          price: 98_000,
          orderQty: 500,
          filledQty: 0,
          unfilledQty: 500,
          exchange: 'KRX',
        },
      ],
    });

    // 그 종목 카드를 세우고 접는다 — 다른 카드를 보고 있어도 이벤트를 놓치지 않는 상황.
    await addStockByKeyboard(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await toggleOf(page, E2E_ISIN).click();
    await expect(card).toHaveAttribute('data-open', 'false');
    await expect(card).toHaveAttribute('data-alert', 'false');

    await relay.pushOrderResp({
      orderNo,
      noticeType: 'E',
      isin: E2E_ISIN,
      side: 'B',
      price: 98_000,
      quantity: 100,
      exchange: 'KRX',
      requestKind: 'New',
    });

    const toast = page.locator('[data-slot="alert-toast"][data-kind="fill"]');
    await expect(toast).toBeVisible({ timeout: 15_000 });
    await expect(toast).toContainText('체결');
    await expect(toast).toContainText('100/500주');
    await expect(card).toHaveAttribute('data-alert', 'true');
    // 뷰포트 오버레이 — 모든 뷰포트 상단 · 앱 헤더(56) 아래 · ≥700 은 우측 (quick-260928-cs1)
    const box = await toast.boundingBox();
    const vp = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeGreaterThan(vp.width - 40);
    expect(box!.y).toBeGreaterThanOrEqual(56);
    expect(box!.y).toBeLessThan(120);

    await toast.locator('[data-part="text"]').click();
    await expect(card).toHaveAttribute('data-open', 'true');
    await expect(
      card.locator('[data-slot="card-tabs"] [role="tab"][data-state="active"]'),
    ).toContainText('미체결');
    await expect(card).toHaveAttribute('data-alert', 'false');
    await expect(page.locator('[data-slot="alert-toast"]')).toHaveCount(0);
  });

  test('11. 카드 헤더에 LED 4개가 매수·매도·취소·자동 순서로 보이고 라벨이 상태를 말한다 (옛 LC 3b · 17-11 D-22 · Phase 27 D-04)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true, sellEnabled: true, cancelQtyEnabled: true }]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);

    const leds = cardOf(page, E2E_ISIN).locator('[data-slot="card-header"] [data-slot="latch-led"]');
    await expect(leds).toHaveCount(4, { timeout: 15_000 });
    await expect(leds.nth(0)).toHaveAttribute('data-kind', 'buy');
    await expect(leds.nth(1)).toHaveAttribute('data-kind', 'sell');
    await expect(leds.nth(2)).toHaveAttribute('data-kind', 'cancel');
    await expect(leds.nth(3)).toHaveAttribute('data-kind', 'autoSell');
    for (const i of [0, 1, 2, 3]) await expect(leds.nth(i)).toBeVisible();
    // 자동매도 없음 에코 — 「자동」 은 회색 OFF(Phase 27 D-04).
    await expect(leds.nth(3)).toContainText('OFF');
    // 색만이 아니라 보이는 라벨이 상태를 말한다(D-21 · WCAG 1.4.1).
    await expect(leds.nth(1)).toContainText('대기');
    await expect(leds.nth(2)).toContainText('대기');
    await expect(leds.nth(0)).toContainText('감시');
    await expect(leds.nth(0)).not.toContainText('매도잔량');
    await expect(cardOf(page, E2E_ISIN)).not.toContainText('매수 ON');
  });

  test('12. 값 확정 → 게이트웨이 10 즉시 수신(더티 바·「수정」 없음) → 60 에코 → 행 값 · 반영 시각 (옛 LC 4 · D-04 재정의)', async ({
    page,
  }) => {
    /*
      옛 12 는 「값 변경 → 더티 바 → 수정 → 10」 두 단계였다. D-04 로 확정 1회 = 전송 1회가 됐다 —
      같은 왕복(10 수신 → 60 에코 → 화면 값 · 반영 시각)을 한 단계로 다시 잰다. 반영의 유일한 증거는
      여전히 에코다(행 값은 에코 전에는 바뀌지 않는다 · D-06).
    */
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);
    const sets = () => relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    const before = sets();

    await editLc(page, 'lc-buy-watch-qty', '8000');
    await waitForSetAtGateway(relay, before + 1);
    // 확정 한 번 = 전송 한 번 — 재전송 없음(T-16-10). 중간 단계(더티 바 · 「수정」)가 없다.
    expect(sets()).toBe(before + 1);
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);
    await expect(card.getByRole('button', { name: '수정', exact: true })).toHaveCount(0);
    await expect(card.getByRole('button', { name: '되돌리기', exact: true })).toHaveCount(0);

    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 8_000 });

    // 에코 → 행 값 · 상태줄 반영 시각.
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주', { timeout: 15_000 });
    await expect(statusBar(page).getByTestId('stat-applied')).toHaveText(/^반영 \d{2}:\d{2}:\d{2}$/);
    await expect(statusBar(page).getByTestId('stat-applied')).toHaveAttribute('title', '서버 반영 시각');
    expect(sets()).toBe(before + 1);
    // 값 확정은 게이트를 건드리지 않는다 — 매수주문 스위치는 켜진 채다(값만 한 필드 바뀌었다).
    await expect(lcSwitch(card, '매수주문 켜기')).toBeChecked();
  });

  test('GC2 카드를 접었다 펴도 반영된 값이 그대로다 — 재마운트 없음 · 포커스는 헤더 토글 (WR-02 · D-09 · D-12 · D-04 재정의)', async ({
    page,
  }) => {
    /*
      옛 GC2 는 「미전송 값 + 더티 바가 접힘을 견딘다」였다. D-04 로 미전송 값이라는 상태가 사라졌다 —
      남는 성질은 **재마운트 없음**(WR-02)과 접힘·펼침 포커스다. 재마운트 없음은 폼 DOM 노드에 표식을
      달아 두고, 펼친 뒤 **같은 노드**인지로 증명한다(새로 그리면 표식이 없다).
    */
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    await expect(cards(page)).toHaveCount(1);

    const toggle = toggleOf(page, E2E_ISIN);
    const card = cardOf(page, E2E_ISIN);
    const stackCard = grid(page).locator(`[data-slot="card-stack"] ${cardSelector(E2E_ISIN)}`);
    const form = card.locator('[data-slot="limit-chaser-form"]');
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    await editLc(page, 'lc-buy-watch-qty', '8000');
    await waitForSetAtGateway(relay, before + 1);
    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 8_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주', { timeout: 15_000 });
    await form.evaluate((el) => {
      (el as HTMLElement).dataset.e2eMark = 'gc2';
    });

    // 접기 — 카드는 스택으로 가고 본문은 숨김으로 남는다(D-12).
    await toggle.click();
    await expect(card).toHaveAttribute('data-open', 'false');
    await expect(stackCard).toHaveCount(1);
    await expect(lcRow(page, 'lc-buy-watch-qty')).toBeHidden();
    // 포커스는 누른 헤더 토글로 돌아온다(UI-SPEC §접근성).
    await expect(toggle).toBeFocused();

    // 다시 펼치기 — 반영된 값이 그대로이고 폼은 **같은 DOM 노드**다(재마운트 없음 · WR-02).
    await toggle.click();
    await expect(card).toHaveAttribute('data-open', 'true');
    await expect(stackCard).toHaveCount(0);
    await expect(lcRow(page, 'lc-buy-watch-qty')).toBeVisible();
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주');
    await expect(form).toHaveAttribute('data-e2e-mark', 'gc2');
    await expect(toggle).toBeFocused();
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);
    // 접었다 펴는 동안 아무것도 나가지 않았다.
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(before + 1);
  });

  test('GC2b 카드를 접으면 그 키를 price 로, 펼치면 full 로 구독한다 — 브라우저 sub 1건씩 · unsub 0 · 게이트웨이 29 강등 / 28 · 32 승격 (quick-261001-dyi)', async ({
    page,
  }) => {
    /*
      접힌 카드는 헤더(p · cr)만 보이므로 price 로 충분하다. 전환은 새 level 을 먼저 잡고 옛 level 을 놓으므로
      와이어에는 unsub 없이 sub 1건만 나간다. relay 는 강등에 29 만, 승격에 28→29(0)→32 를 업스트림으로 보낸다.
      ★ 사용자 세션 Ready 넛지(29 1건)가 기준선 뒤에 늦게 끼어들 수 있어 29 는 「≥」, 28 · 32 는 정확히 본다
        (넛지는 28 · 32 를 보내지 않는다 — hub 헤더 Pattern 10).
    */
    const subs = captureSubFrames(page);
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);

    const card = cardOf(page, E2E_ISIN);
    const toggle = toggleOf(page, E2E_ISIN);
    const countMsg = (t: number) => relay.requestLog().filter((m) => m === t).length;
    const base = subs.length;
    const keyFrames = () => subs.slice(base).filter((f) => f.isin === E2E_ISIN);
    const quoteReq0 = countMsg(DMA_MSG.GetQuoteReq);
    const subReq0 = countMsg(DMA_MSG.SubscribeQuoteReq);
    const tapeReq0 = countMsg(DMA_MSG.GetTradeTapeReq);

    // 접기 — price 로 강등
    await toggle.click();
    await expect(card).toHaveAttribute('data-open', 'false');
    await expect
      .poll(keyFrames, { timeout: 10_000 })
      .toEqual([{ t: 'sub', isin: E2E_ISIN, ex: 'KRX', lv: 'price' }]);
    await expect
      .poll(() => countMsg(DMA_MSG.SubscribeQuoteReq), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(subReq0 + 1);
    expect(countMsg(DMA_MSG.GetQuoteReq)).toBe(quoteReq0);
    expect(countMsg(DMA_MSG.GetTradeTapeReq)).toBe(tapeReq0);
    // 접힌 헤더 가격은 꺼지지 않는다 — 시세 캐시는 level 변경으로 지워지지 않는다.
    const headerPrice = card.locator('[data-slot="card-header-price"] [data-part="price"]');
    await expect(headerPrice).toHaveText(/\d/);
    await expect(headerPrice).not.toHaveText('—');

    // 펼치기 — full 로 승격(lv 키 없음)
    await toggle.click();
    await expect(card).toHaveAttribute('data-open', 'true');
    await expect
      .poll(keyFrames, { timeout: 10_000 })
      .toEqual([
        { t: 'sub', isin: E2E_ISIN, ex: 'KRX', lv: 'price' },
        { t: 'sub', isin: E2E_ISIN, ex: 'KRX' },
      ]);
    await expect.poll(() => countMsg(DMA_MSG.GetQuoteReq), { timeout: 10_000 }).toBe(quoteReq0 + 1);
    await expect.poll(() => countMsg(DMA_MSG.GetTradeTapeReq), { timeout: 10_000 }).toBe(tapeReq0 + 1);
    await expect(card.locator('[data-slot="orderbook-ladder"]').first()).toContainText('97,900', {
      timeout: 15_000,
    });

    // 전 구간에서 그 키의 해제는 0건이다.
    expect(keyFrames().filter((f) => f.t === 'unsub')).toHaveLength(0);
  });

  test('13. 인라인 편집 중 다른 단말 변경 — 입력 8,000 유지 · Esc 뒤 행 = 에코 「5,000주」 + 공용 로그 「서버 반영 완료」 1줄 · 배너 없음 (옛 LC 5 · D-07 재정의 · 2026-09-29 배너 제거)', async ({
    page,
  }) => {
    /*
      옛 13 은 「에코가 더티를 덮는다」였다. D-07 은 편집 중인 버퍼가 **편집기의 것**이라 에코가 덮지 않는다
      (E4) — 행 값(폼)은 서버를 따르고, 편집을 버리면(Esc) 그 행은 에코 값을 보인다. 알림은 로그 전이 줄 하나뿐이다.
    */
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    // 로그 탭을 편집 전에 연다 — 편집 중에 탭을 누르면 인라인 편집기가 포커스를 잃고 닫힌다.
    const rows = await logRows(page);

    await showLc(page, 'lc-buy-watch-qty');
    await lcRow(page, 'lc-buy-watch-qty').click();
    const input = page.locator('#lc-buy-watch-qty');
    await expect(input).toBeFocused();
    await input.fill('8000');
    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 5_000 });

    await expect(rows.filter({ hasText: '서버 반영 완료' })).toHaveCount(1, { timeout: 15_000 });
    // 편집 중인 입력은 에코가 덮지 않는다 — 사용자가 치던 값이 그대로다.
    await expect(input).toHaveValue(/^8,?000$/);
    await expect(input).toBeFocused();

    // Esc = 편집 버림 → 행은 서버 값(에코).
    await input.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('5,000주');
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);
    // 버린 편집은 나가지 않았다.
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(before);
    await expect(cardOf(page, E2E_ISIN).getByText(/다른 단말/)).toHaveCount(0);
  });

  test('14. 매수·매도 OFF = 삭제 — cfg `D` → 에코 후 사이드바에서 빠지고 폼이 기본값, 삭제 버튼 없음 (옛 LC 6 · D-08)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true, buyWatchQty: 8_000 }]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    await expect(strategyItems(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주', { timeout: 15_000 });
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    await expect(page.getByRole('button', { name: /삭제/ })).toHaveCount(0);
    await lcSwitch(cardOf(page, E2E_ISIN), '매수주문 켜기').click();
    await waitForSetAtGateway(relay, before + 1);

    // 삭제 판정은 스위치가 아니라 서버 에코의 `crud` 다(Pitfall 7).
    await relay.pushLimitChaserEcho({ crud: 'D', buyEnabled: false, buyWatchQty: 8_000 });

    await expect(strategyItems(page)).toHaveCount(0, { timeout: 15_000 });
    // 삭제 뒤 폼은 새 전략 상태다 — 서버 값(8,000)이 아니라 기본값 + 상장주식수 시딩(D-17 · 스텁 상장주식수
    // 5,969,782,550 × 0.3% = 17,909,347 — 서버 전략이 없는 새 폼 인스턴스라 폼당 1회 규칙대로 채운다).
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('17,909,347주');
    await expect((await logRows(page)).filter({ hasText: '전략이 삭제됐어요' })).toHaveCount(1);
  });

  test('15. 서버 통지 몫 가르기 — 종목 없는 Account(VI 몫)는 카드가 아니라 VI 줄에, 상따 거부는 카드 경보·로그 양쪽에 (옛 LC 7·7b · T-16-07 · Pitfall 9)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const cardError = cardOf(page, E2E_ISIN).locator('[data-slot="card-server-error"]');

    // ① 종목 축이 없는 계좌 통지 = VI 몫. 카드가 이걸 그리면 사용자가 멀쩡한 상따를 껐다 켠다.
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: '',
      accountNo: E2E_ACCOUNT_NO,
      message: 'VI 주문금액이 0 입니다',
      kind: '',
    });
    await expect(page.locator('[data-slot="vi-server-error"]')).toContainText('VI 주문금액이 0 입니다', {
      timeout: 15_000,
    });
    await expect(cardError).toHaveCount(0);
    await expect((await logRows(page)).filter({ hasText: 'VI 주문금액이 0 입니다' })).toHaveCount(0);

    // ② 같은 통지에 종목이 붙으면 상따 몫이다.
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      message: '주문 가능 금액이 부족합니다',
      kind: '',
    });
    await expect(cardError).toContainText('주문 가능 금액이 부족합니다', { timeout: 15_000 });

    // ③ 등록 거부 — 카드 경보(role=alert)와 로그 **양쪽**에 남는다(조용한 무시 0).
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'SetLimitChaser',
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      message: '허용되지 않은 거래소입니다',
      kind: '',
    });
    await expect(cardError).toContainText('허용되지 않은 거래소입니다', { timeout: 15_000 });
    await expect(cardError).toHaveAttribute('role', 'alert');
    await expect(cardError.locator('[data-slot="card-server-error-src"]')).toHaveText('[서버]');
    const rejected = (await logRows(page)).filter({ hasText: '허용되지 않은 거래소입니다' });
    await expect(rejected).toHaveCount(1);
    await expect(rejected).toHaveAttribute('data-level', 'error');
  });

  test('16. 상따 설정은 즉시 반영이라 사이드바 이동 때 확인이 뜨지 않는다 — 대조군 + 적용 뒤 「홈」 이동 = 다이얼로그 0 (옛 LC 10 · D-04 재정의)', async ({
    page,
  }) => {
    /*
      옛 16 은 「더티 상태로 떠나면 확인이 뜬다」였다. D-04 로 떠날 때 잃을 미반영 값이 없다 — 값은 확정 즉시
      서버로 갔고 반영은 에코가 증명한다. 그래서 이제 계약은 반대다: 값을 바꾼 뒤에도 이동을 막지 않는다.
      (작업대 이탈 경고 배관 자체는 카드 `dirtyCount` 가 늘 0 이라 스스로 비활성이다 — 20-04.)
    */
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);

    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss(); // 뜨면 「머무른다」 — 그러면 아래 URL 단언이 실패로 드러낸다
    });
    // 대조군 — 아무것도 바꾸지 않았으면 이동이 막히지 않는다.
    await desktopNav(page).getByRole('link', { name: '홈' }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    expect(dialogs).toEqual([]);

    // 값을 확정하고(→ 10 → 에코) 곧장 떠난다 — 확인 없이 이동한다.
    await openFocusedCard(page);
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await editLc(page, 'lc-buy-watch-qty', '8000');
    await waitForSetAtGateway(relay, before + 1);
    await relay.pushLimitChaserEcho({ buyEnabled: true, buyWatchQty: 8_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('8,000주', { timeout: 15_000 });
    await expect(page.locator(DIRTY_BAR_SEL)).toHaveCount(0);
    await desktopNav(page).getByRole('link', { name: '홈' }).click();

    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    expect(dialogs, '즉시 반영 모델에서는 이탈 확인이 없다').toEqual([]);
  });

  test('17. 카드 와이드 밴드(832·880·960) 체결가·체결량 잘림 0 — 데스크톱은 시(時)까지 · 방향 라벨 유지 (옛 LC 13 · T-u58-03)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);
    const three = card.locator('[data-tree="three"]');

    // 수량 5자리 + 상한가(7자) 체결 — 짧은 샘플은 공허한 단언을 만든다.
    // 체결은 quote 연결로만 받는다(Phase 26 · 픽스처 ⑧) — 사용자 세션으로 밀면 relay 가 버린다.
    const sock = await relay.quoteSocket();
    relay.gateway.pushTape(sock, {
      isin: E2E_ISIN,
      exchange: 'KRX',
      snapshot: true,
      entries: [
        { tradeTime: '093015123456', price: 127_400n, qty: 12_345n, cumVolume: 999_966n },
        { tradeTime: '093016123456', price: 98_100n, qty: 54_321n, cumVolume: 1_000_000n },
        { tradeTime: '093017123456', price: 127_400n, qty: 12_345n, cumVolume: 1_000_012n },
      ],
    });

    const fillOverflow = () =>
      three.evaluate((tree) =>
        Array.from(tree.querySelectorAll<HTMLElement>('[data-slot="ladder-fill-cell"]'))
          .filter((c) => c.getClientRects().length > 0 && (c.textContent ?? '').trim() !== '')
          .flatMap((c) => {
            const spans = Array.from(c.querySelectorAll<HTMLElement>(':scope > div > span'));
            return [
              { what: '체결가', el: spans[1] },
              { what: '체결량', el: spans[2] },
            ]
              .filter((x) => x.el !== undefined)
              .map((x) => ({
                what: x.what,
                text: (x.el!.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 16),
                over: x.el!.scrollWidth - x.el!.clientWidth,
              }))
              .filter((x) => x.over > 1);
          }),
      );

    for (const target of [832, 880, 960]) {
      await sizeCardTo(page, E2E_ISIN, target);
      const { band } = await cardMetrics(page, E2E_ISIN);
      expect(band, `카드 ${target} — 와이드 밴드여야 한다`).toBe('wide');
      await expect(three.locator('[data-slot="ladder-fill-cell"]').first()).toContainText('12,345', {
        timeout: 15_000,
      });
      expect(await fillOverflow(), `카드 ${target} — 체결 셀 넘침`).toEqual([]);
    }

    await sizeCardTo(page, E2E_ISIN, 1100);
    expect((await cardMetrics(page, E2E_ISIN)).band).toBe('desktop');
    expect(await fillOverflow(), '카드 1100(데스크톱) — 체결 셀 넘침').toEqual([]);
    await expect(three.locator('[data-slot="ladder-fill-time-hh"]').first()).toBeVisible();
    const firstCell = three.locator('[data-slot="ladder-fill-cell"]').first();
    await expect(firstCell.locator('.sr-only')).toHaveText(/매수|매도/);
    await expect(firstCell.locator('[title]')).toHaveAttribute('title', /매수 체결|매도 체결/);
  });

  test('18. 폰 밴드 카드 — 호가 42% | 옵션 2열 · 「매수|매도|수동」 탭당 한 pane · 모바일 사다리 20행 · compact 테이프 1 · 미체결 긴 이름 잘림 0 (옛 LC 9 · R7)', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);

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

    // 2열 배치는 실측 좌표로 본다 — 클래스 문자열만 보면 CSS 가 안 먹어도 통과한다.
    const ob = await card.locator('[data-slot="card-body-orderbook"]').boundingBox();
    const opt = await card.locator('[data-slot="card-body-options"]').boundingBox();
    expect(ob).not.toBeNull();
    expect(opt).not.toBeNull();
    expect(Math.abs(ob!.y - opt!.y)).toBeLessThan(2);
    expect(opt!.x).toBeGreaterThan(ob!.x + ob!.width - 2);
    const ratio = ob!.width / (ob!.width + opt!.width);
    expect(ratio).toBeGreaterThan(0.38);
    expect(ratio).toBeLessThan(0.46);
    // 그리드 자식 `min-width` 규칙 자체를 잠근다(가로 스크롤이 넘침을 흡수하는 함정).
    const minWidths = await card
      .locator('[data-slot="card-body"]')
      .evaluate((el) => Array.from(el.children).map((c) => getComputedStyle(c).minWidth));
    expect(minWidths).toEqual(['0px', '0px']);

    // 탭 — 활성 pane 하나만 보인다(비활성은 display:none).
    const tablist = card.getByRole('tablist', { name: '주문 진입' });
    await expect(tablist.getByRole('tab')).toHaveCount(3);
    await expect(tablist.getByRole('tab', { name: '매수' })).toHaveAttribute('aria-selected', 'true');
    await expect(card.locator('[data-pane="buy"]')).toBeVisible();
    await expect(card.locator('[data-pane="sell"]')).toBeHidden();
    await tablist.getByRole('tab', { name: '매도' }).click();
    await expect(card.locator('[data-pane="sell"]')).toBeVisible();
    await expect(card.locator('[data-pane="buy"]')).toBeHidden();
    await tablist.getByRole('tab', { name: '수동' }).click();
    await expect(card.getByTestId('manual-entry-form')).toBeVisible();
    await expect(card.getByTestId('manual-entry-options')).toBeHidden();

    // 좁은 폭 호가 = 2줄 행 20개 + 사다리 아래 compact 체결 테이프(보이는 것 1개, 헤더 없음).
    const ladder = card.locator('[data-slot="orderbook-ladder"][data-variant="chaser"]');
    await expect(ladder.locator('[data-slot="ladder-row-mobile"]')).toHaveCount(20);
    await expect(ladder.locator('[data-slot="ladder-row-mobile"] [data-slot="ladder-fill-cell"]')).toHaveCount(0);
    await expect(ladder.locator('[data-slot="trade-tape"][data-compact="true"]:visible')).toHaveCount(1);
    await expect(ladder.locator('[data-slot="trade-tape"][data-compact="true"] thead')).toHaveCount(0);

    // 매수 pane 은 204px 안에 행(라벨 ─ 값 ›)이 들어간다(잎 요소 좌표 판정 · Phase 20 리스트 행).
    await tablist.getByRole('tab', { name: '매수' }).click();
    const pane = card.locator('[data-pane="buy"]');
    const paneBox = await pane.boundingBox();
    expect(paneBox).not.toBeNull();
    expect(await leavesOverflowing(pane, paneBox!.x + paneBox!.width)).toEqual([]);

    /*
      공용 패널(폰 하단 바)을 펼쳐 미체결 긴 이름 행을 본다. 옛 화면의 카드형 행(`account-unfilled-row`)
      대신 작업대는 종목 열이 있는 **가로 스크롤 표**다(18-09 · E13 — 전 종목 한 목록). 그래서 계약은
      「조용한 잘림 0」이다: 긴 이름은 1줄 말줄임 + `title` 에 전문, 표는 스크롤 영역 안에서만 넘친다.
    */
    await sharedPanels(page).getByRole('button', { name: '펼치기 ▴' }).click();
    const rows = sharedPanels(page).locator('[data-slot="account-embed-unfilled-row"]');
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    await expect(rows.first().locator('[data-slot="account-embed-name"]')).toHaveAttribute(
      'title',
      /한국제7호기업인수목적우선주식회사/,
    );
    expect(await scrollOverflowing(page, '[data-testid="shared-panels"]')).toEqual([]);
  });

  test('19. `dma_credentials` 매핑 없음 → 게이트가 작업대 본문 전체를 대체한다 (옛 LC 8 · VI 8 · A14 · B9)', async ({
    page,
  }) => {
    relay.clearDmaCredentials();
    await page.goto(WORKBENCH_URL);

    const gate = page.locator('[data-slot="dma-gate"]');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toHaveAttribute('data-reason', 'unmapped');
    await expect(gate).toContainText('DMA 계정이 연결되지 않았어요');
    await expect(gate).toContainText('트레이딩');
    await expect(page.locator('[data-slot="trading-workbench"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="card-grid"]')).toHaveCount(0);
    await expect(page.locator('#vi-krx-amount')).toHaveCount(0);
    await expect(gate.getByRole('button')).toHaveCount(0);
  });

  // =========================================================================
  // 이관 — 옛 trading-vi.spec (VI 화면 → 작업대 VI 두 줄 · VI 발동 표)
  // =========================================================================

  test('20. VI 중지 상태 진입 — KRX 줄 서버값(1,000만원 · 22%) · 스위치 OFF · 발동 0건 (옛 VI 1 · D-05)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await openViPanel(page);

    await expect(field(page, 'vi-krx-amount')).toHaveValue('1,000', { timeout: 15_000 });
    await expect(field(page, 'vi-krx-rate')).toHaveValue('22');
    await expect(viRow(page)).toHaveAttribute('data-run', 'false');
    await expect(viRow(page).getByRole('switch', { name: 'VI KRX 시작' })).not.toBeChecked();
    // 계좌 비밀번호·종목·주문유형 UI 가 없다(B2).
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    // 더티 0 이면 「수정」이 렌더 자체가 없다(B4).
    await expect(viRow(page).locator('[data-slot="vi-row-fix"]')).toHaveCount(0);
    // VI 브라우저 알림 토글은 기능째 제거됐다(quick-260922-tqr).
    await expect(statusBar(page).locator('[data-slot="workbench-vi-alert-toggle"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="vi-chip"]')).toHaveCount(0);
    // 사이드바 VI 줄은 가동 거래소가 없어 없다.
    await expect(desktopNav(page).locator('[data-sidebar-item="vi"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="vi-trigger-strip"]')).toContainText('오늘 발동된 VI 주문이 없어요');
  });

  test('21. VI 값 변경 → 「수정」 → 11 수신, **run 이 유지되고** 금액은 원 단위 · 거래소는 줄의 것 (옛 VI 2 · D-07 · Pitfall 8)', async ({
    page,
  }) => {
    relay.seedViTrigger({ ...VI_CFG, run: true });
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await openViPanel(page);
    await expect(viRow(page)).toHaveAttribute('data-run', 'true', { timeout: 15_000 });

    await field(page, 'vi-krx-amount').fill('1500');
    const fix = viRow(page).locator('[data-slot="vi-row-fix"]');
    await expect(fix).toHaveText('수정');
    await fix.click();

    await expect.poll(() => viSetRequests(relay).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    // ★ 페이로드를 직접 연다 — 「보냈다」만으로는 run 이 눕혀졌는지 알 수 없다.
    expect(viSetRequests(relay).at(-1)).toMatchObject({
      accountNo: E2E_ACCOUNT_NO,
      orderAmountKrw: 15_000_000, // 화면은 만원, 와이어는 원 — 한 자리가 어긋나면 1만 배 주문이다
      checkRate: 22,
      priceType: 'U',
      run: true,
      exchange: 'KRX',
    });

    await pushViEcho(relay, true, { orderAmountKrw: 15_000_000n });
    await expect(fix).toHaveCount(0, { timeout: 15_000 });
    await expect(field(page, 'vi-krx-amount')).toHaveValue('1,500');
    // 에코 뒤에도 가동이 유지된다 — 「수정」이 run 을 눕히지 않았다.
    await expect(viRow(page)).toHaveAttribute('data-run', 'true');
  });

  test('22. VI 「시작」 확인 — 요약에 현재 폼 금액·상승률 · 기본 포커스 취소 · 확정 시 run=true → 에코로 줄·사이드바가 함께 (옛 VI 3 · S-7 · T-16-10)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await openViPanel(page);
    await expect(field(page, 'vi-krx-amount')).toHaveValue('1,000', { timeout: 15_000 });

    await field(page, 'vi-krx-amount').fill('1500');
    await field(page, 'vi-krx-rate').fill('25');
    await viRow(page).getByRole('switch', { name: 'VI KRX 시작' }).click();

    const dialog = page.getByTestId('vi-start-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('VI 자동매수를 시작할까요?');
    await expect(dialog).toContainText('조건에 맞는 VI 발동 종목을 자동으로 매수해요.');
    const summary = dialog.locator('[data-slot="vi-confirm-summary"]');
    await expect(summary).toContainText('1,500만원');
    await expect(summary).toContainText('25% 이상');
    await expect(summary).toContainText('상한가 · KRX');
    await expect(dialog.locator('[data-slot="vi-confirm-warning"]')).toContainText(
      '시작하면 사람 확인 없이 주문이 나가요. 금액·상승률을 다시 확인해 주세요.',
    );
    // 기본 포커스는 취소 — Enter 연타로 무인 자동매수가 시작되면 안 된다. X 닫기도 없다.
    await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0);

    await dialog.getByRole('button', { name: '시작' }).click();
    await expect.poll(() => viSetRequests(relay).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    expect(viSetRequests(relay).at(-1)).toMatchObject({
      orderAmountKrw: 15_000_000,
      checkRate: 25,
      run: true,
      exchange: 'KRX',
    });
    expect(relay.requestLog()).toContain(DMA_MSG.SetVITriggerReq);

    // 반영의 증거는 에코다 — 줄과 사이드바가 같은 프레임으로 함께 움직인다.
    await pushViEcho(relay, true, { orderAmountKrw: 15_000_000n, checkRate: 25 });
    await expect(viRow(page)).toHaveAttribute('data-run', 'true', { timeout: 15_000 });
    await expect(viRow(page).getByRole('switch', { name: 'VI KRX 중지' })).toBeChecked();
    const sidebarVi = desktopNav(page).locator('[data-sidebar-item="vi"]');
    await expect(sidebarVi.locator('[data-slot="exchange-tag"][data-exchange="KRX"]')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(sidebarVi.locator('[data-slot="exchange-tag"][data-exchange="NXT"]')).toHaveCount(0);
  });

  test('23. VI 「중지」 확인 — 오늘 주문·미체결(유지) 요약 + 경고 · 기본 포커스 닫기 · run=false (옛 VI 4)', async ({
    page,
  }) => {
    relay.seedViTrigger({ ...VI_CFG, run: true });
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await openViPanel(page);
    const sw = viRow(page).getByRole('switch', { name: 'VI KRX 중지' });
    await expect(sw).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-slot="vi-chip"]')).toHaveCount(VI_ORDERS.length, {
      timeout: 15_000,
    });

    await sw.click();
    const dialog = page.getByTestId('vi-stop-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('VI 자동매수를 중지할까요?');
    await expect(dialog).toContainText('새 VI 발동에 더 이상 주문하지 않아요.');
    const summary = dialog.locator('[data-slot="vi-confirm-summary"]');
    await expect(summary).toContainText('6건');
    await expect(summary).toContainText('(유지)');
    await expect(dialog.locator('[data-slot="vi-confirm-warning"]')).toContainText(
      '이미 접수된 주문은 취소되지 않아요.',
    );
    await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();

    await dialog.getByRole('button', { name: '중지' }).click();
    await expect.poll(() => viSetRequests(relay).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    expect(viSetRequests(relay).at(-1)).toMatchObject({ run: false, exchange: 'KRX' });
  });

  test('24. VI 발동 표 6건 — 상태 배지 6종 · 부분체결 파생 · 종목명 역매핑 · 잠긴 행 체크 비활성 · 110초 (옛 VI 5 · E3)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(page.locator('[data-slot="vi-chip"]')).toHaveCount(VI_ORDERS.length, { timeout: 15_000 });
    await openViTable(page);

    const rows = viTable(page).locator('[data-slot="vi-order-row"]');
    await expect(rows).toHaveCount(VI_ORDERS.length);
    // 상태 배지 — 텍스트만으로 6종이 갈린다(WCAG 1.4.1).
    await expect(rows.nth(0)).toContainText('접수');
    await expect(rows.nth(1)).toContainText('부분체결 120/278'); // Accepted ∧ filledQty>0 파생
    await expect(rows.nth(2)).toContainText('체결');
    await expect(rows.nth(3)).toContainText('취소');
    await expect(rows.nth(4)).toContainText('거부');
    await expect(rows.nth(5)).toContainText('접수 전');
    // 종목명은 relay 가 `stocks` 역매핑으로 채운다.
    await expect(rows.nth(0)).toContainText('삼성전자');
    await expect(rows.nth(1)).toContainText('한국제7호기업인수목적우선주식회사');

    // 잠긴 행(confirm_locked)과 접수 전 행은 체크할 수 없다 — 사유가 title 로 붙는다.
    const checks = viTable(page).locator('[data-slot="vi-confirm-check"]');
    await expect(checks.nth(0)).toBeEnabled();
    for (const i of [1, 2, 3, 4, 5]) await expect(checks.nth(i)).toBeDisabled();

    // 11열 — 거래소 열(3)은 KRX|NXT, 110초 열(10)은 살아 있는 행만 진행바, 나머지는 「—」.
    await expect(rows.nth(0).locator('td').nth(3)).toHaveText(/^(KRX|NXT)$/);
    for (const i of [2, 3, 4, 5]) await expect(rows.nth(i).locator('td').nth(10)).toHaveText('—');

    // 펼친 VI 패널에 머리줄 요약·긴 설명문이 없다 — 체크의 의미는 체크박스 이름이 말한다.
    const panel = page.locator('[data-slot="vi-trigger"]');
    await expect(panel).not.toContainText('양 거래소 한 목록');
    await expect(panel).not.toContainText('ConfirmVIOrderReq');
  });

  test('25. VI 확인 체크 → 33 수신(다이얼로그 없이 즉시) → 73 이 정정하면 다시 끌 수 있다 (옛 VI 6 · D-10)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(page.locator('[data-slot="vi-chip"]')).toHaveCount(VI_ORDERS.length, { timeout: 15_000 });
    await openViTable(page);

    const first = viTable(page).locator('[data-slot="vi-confirm-check"]').first();
    await expect(first).not.toBeChecked();
    await first.click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(first).toBeChecked(); // 낙관 반영 — 73 을 기다리지 않는다
    await expect.poll(() => viConfirmRequests(relay).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    expect(viConfirmRequests(relay).at(-1)).toEqual({ orderNo: '0031245', confirmed: true });
    expect(relay.requestLog()).toContain(DMA_MSG.ConfirmVIOrderReq);

    // 서버는 확인 응답을 따로 주지 않고 73 델타로 정정한다 — 그 뒤 잠금이 풀려 다시 끌 수 있다.
    await relay.pushViOrderList([{ ...VI_ORDERS[0], confirmed: true }], false);
    await expect(first).toBeChecked();
    await expect(first).toBeEnabled({ timeout: 15_000 });
    await first.click();
    await expect.poll(() => viConfirmRequests(relay).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    expect(viConfirmRequests(relay).at(-1)).toEqual({ orderNo: '0031245', confirmed: false });
  });

  test('26. VI 110초 데드라인 — 1초 틱이 돌고 20초 경계에서 색·숫자가 바뀐다 (옛 VI 7 · B6 · C4)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    // 주문이 아직 없으므로 표는 없다 — 패널만 펼쳐 두면 아래 72 가 오는 순간 표가 선다.
    await openViPanel(page);

    // 마감을 23초 뒤로 — 1초 틱이 실제로 돌아야만 약 4초 뒤 임박(<20초)으로 넘어간다.
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

    const deadline = viTable(page).locator('[data-slot="vi-deadline"]').first();
    await expect(deadline).toBeVisible({ timeout: 15_000 });
    await expect(deadline).toHaveAttribute('data-hot', 'false');
    const bar = deadline.getByRole('progressbar');
    await expect(bar).toHaveAttribute('aria-label', '110초 자동취소까지 남은 시간');
    const before = Number(await bar.getAttribute('aria-valuenow'));
    expect(before).toBeGreaterThan(20);
    expect(before).toBeLessThanOrEqual(24); // 잔여는 올림 — 23.4초가 24 로 읽힌다

    await expect(deadline).toHaveAttribute('data-hot', 'true', { timeout: 15_000 });
    expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(20);
    const width = await deadline
      .locator('[data-slot="vi-deadline-fill"]')
      .evaluate((el) => (el as HTMLElement).style.width);
    expect(width).toMatch(/^\d+%$/);
  });

  test('27. VI 몫 통지만 VI 줄 아래 경보로 — 상따 거부·relay 자기 거부는 먹지 않는다 (옛 VI 10 · Pitfall 9)', async ({
    page,
  }) => {
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);

    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      message: '주문 가능 금액이 부족합니다',
      kind: '',
    });
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Relay',
      isin: '',
      accountNo: E2E_ACCOUNT_NO,
      message: '요청 형식이 올바르지 않습니다',
      kind: '',
    });
    // 대조군을 먼저 넣고 「아무것도 안 뜬다」를 본다 — 순서가 반대면 「아직」과 「안 그린다」가 섞인다.
    const errorSlot = page.locator('[data-slot="vi-server-error"]');
    await expect(errorSlot).toHaveCount(0);

    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'Account',
      isin: '',
      accountNo: E2E_ACCOUNT_NO,
      message: 'VI 주문금액이 0 입니다',
      kind: '',
    });
    await expect(errorSlot).toContainText('VI 주문금액이 0 입니다', { timeout: 15_000 });
    await expect(errorSlot).toHaveAttribute('role', 'alert');
    await expect(errorSlot.locator('[data-slot="vi-server-error-src"]')).toHaveText('[서버]');
    await expect(errorSlot).not.toContainText('주문 가능 금액이 부족합니다');
    await expect(errorSlot).not.toContainText('요청 형식이 올바르지 않습니다');
  });
  test('28. 폰 밴드 VI 두 줄 · VI/돌파 스트립 · 펼친 표 — 조용한 잘림 0(표는 가로 스크롤), 긴 종목명은 말줄임 + title (옛 VI 9 · R6 · E2/E3/E4 overflow)', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    relay.setRespondingExchanges([]); // 돌파 행이 이탈 판정으로 지워지지 않게(케이스 3 과 같은 이유)
    relay.seedViTrigger({ ...VI_CFG, run: true });
    relay.seedViOrders([...VI_ORDERS]);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await expect(page.locator('[data-slot="vi-chip"]')).toHaveCount(VI_ORDERS.length, { timeout: 15_000 });
    await openViTable(page);
    await expect(viRow(page)).toHaveAttribute('data-run', 'true', { timeout: 15_000 });
    await pushBreakout(relay, E2E_LONG_NAME_ISIN);
    await expect(page.locator('[data-slot="breakout-chip"]')).toHaveCount(1, { timeout: 15_000 });
    await page.locator('[data-slot="breakout-more"]').click();
    await expect(page.locator('[data-slot="breakout-table"]')).toBeVisible();

    // VI 두 줄 — 스크롤 영역이 없는 표면이라 두 판정 모두 0 이어야 한다.
    expect(await scrollOverflowing(page, '[data-slot="vi-settings-rows"]')).toEqual([]);
    const rowsBox = await page.locator('[data-slot="vi-settings-rows"]').boundingBox();
    expect(rowsBox).not.toBeNull();
    expect(
      await leavesOverflowing(page.locator('[data-slot="vi-settings-rows"]'), rowsBox!.x + rowsBox!.width),
    ).toEqual([]);
    // 거래소당 한 줄 — 입력 28 · 스위치 26 이라 한 줄이면 40 미만, 두 줄로 접히면 56 이상이다.
    const krxBox = await viRow(page, 'KRX').boundingBox();
    const nxtBox = await viRow(page, 'NXT').boundingBox();
    expect(krxBox).not.toBeNull();
    expect(nxtBox).not.toBeNull();
    expect(krxBox!.height, 'KRX 줄 높이(한 줄)').toBeLessThan(40);
    expect(nxtBox!.height, 'NXT 줄 높이(한 줄)').toBeLessThan(40);
    // 폰 밴드(본문 <830)는 위아래로 쌓인다.
    expect(nxtBox!.y).toBeGreaterThanOrEqual(krxBox!.y + krxBox!.height);

    /*
      발동 스트립·표 — 칩 줄은 가로 스크롤 한 줄, 표는 가로 스크롤 컨테이너(목업 정본 · E3 overflow),
      긴 이름은 1줄 말줄임(E3 long-text)이 **계약**이다. 같은 판정(scrollOverflowing)을 쓰되, 넘친
      요소가 그 셋 중 하나인지만 가른다 — 계약 밖에서 넘친 요소가 하나라도 있으면 실패한다.
    */
    const flagged = await scrollOverflowing(page, '[data-slot="vi-trigger"]');
    const unexpected = flagged.filter(
      (f) =>
        f.tag !== 'div[vi-chips]' &&
        f.tag !== 'div[table-container]',
    );
    expect(unexpected, '발동 스트립·표 — 스크롤·말줄임 계약 밖에서 넘친 요소').toEqual([]);
    // 칩 줄과 표 컨테이너는 실제로 가로 스크롤이다(넘침이 잘림이 아니라 스크롤이라는 증거).
    for (const sel of ['[data-slot="vi-chips"]', '[data-slot="vi-trigger-table"] [data-slot="table-container"]']) {
      expect(
        await page.locator(sel).evaluate((el) => getComputedStyle(el).overflowX),
        `${sel} 는 가로 스크롤이어야 한다`,
      ).toMatch(/auto|scroll/);
    }

    // 돌파 스트립·표도 같은 계약이다(E4 overflow) — 칩 줄 스크롤 · 표 가로 스크롤 · 말줄임.
    const breakoutFlagged = await scrollOverflowing(page, '[data-slot="breakout"]');
    expect(
      breakoutFlagged.filter((f) => f.tag !== 'div[breakout-chips]' && f.tag !== 'div[table-container]'),
      '돌파 스트립·표 — 스크롤·말줄임 계약 밖에서 넘친 요소',
    ).toEqual([]);

    // 긴 종목명 — 칩·표 셀에서 1줄 말줄임이고 전문은 title 에 있다(E3 long-text).
    const longName = '한국제7호기업인수목적우선주식회사';
    await expect(
      page.locator('[data-slot="vi-chip"] [data-slot="vi-chip-name"]').filter({ hasText: longName }).first(),
    ).toHaveAttribute('title', longName);
    await expect(viTable(page).locator('[data-slot="vi-row-name"]').nth(1)).toHaveAttribute('title', longName);

    // 더티 「수정」 이 붙어도 설정 줄은 넘치지 않는다(자리가 모자라면 줄 안에서 접힌다 — D2).
    await field(page, 'vi-krx-rate').fill('25');
    await expect(viRow(page).locator('[data-slot="vi-row-fix"]')).toBeVisible();
    expect(await scrollOverflowing(page, '[data-slot="vi-settings-rows"]')).toEqual([]);
  });

  test('28b. 와이드 본문(뷰포트 1000 · 본문 ≈968) — VI KRX | NXT 한 줄 나란히 · 상태줄 핵심만 · 펼친 목록 머리줄 없음', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    relay.seedViTrigger(VI_CFG);
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    await openViPanel(page);
    await expect(field(page, 'vi-krx-amount')).toHaveValue('1,000', { timeout: 15_000 });

    // 본문 830 이상 — KRX 와 NXT 가 한 줄에 나란히(2열) 선다.
    const krxBox = await viRow(page, 'KRX').boundingBox();
    const nxtBox = await viRow(page, 'NXT').boundingBox();
    expect(krxBox).not.toBeNull();
    expect(nxtBox).not.toBeNull();
    expect(Math.abs(krxBox!.y - nxtBox!.y), 'KRX · NXT 줄 top 차이').toBeLessThanOrEqual(2);
    expect(krxBox!.height, 'KRX 줄 높이(한 줄)').toBeLessThan(40);
    expect(nxtBox!.height, 'NXT 줄 높이(한 줄)').toBeLessThan(40);
    expect(nxtBox!.x).toBeGreaterThan(krxBox!.x);
    expect(await scrollOverflowing(page, '[data-slot="vi-settings-rows"]')).toEqual([]);

    // 접힌 줄 라벨은 이름뿐이고, 상태줄은 핵심만 말한다.
    await expect(page.getByTestId('vi-strip-label')).toHaveText('VI');
    await expect(page.getByTestId('breakout-strip-label')).toHaveText('돌파');
    for (const word of ['VI 발동', '거래 종목', '임계']) {
      await expect(statusBar(page)).not.toContainText(word);
    }
  });

  /*
    ★ Phase 24 트레이서 — buy3 와이어 한 경로(24-01 · D-12).
      진짜 브라우저 → 진짜 relay → 스텁 게이트웨이 10(바이트 디코드: buy3_schema=1 · 신필드 ·
      buy_watch_side 슬롯 없음 · S→C 슬롯 없음) → 60 에코(후매수 보유중) → 카드 헤더 매수 LED 「보유중」.
      「비교가격」 행은 id(`lc-buy-watch-price`)로만 찾는다 — 24-04 이후에도 접히지 않는 공통 카드에
      남는 행이라 라벨 문구에 기대지 않는다.
      헤더 한 줄(2026-09-23 헤더 밀림 회귀 방지 · UI-SPEC E6 overflow): 「보유중」은 「감시」보다
      한 글자 넓다 — 390 · 1280 에서 LED 칩 3개가 한 줄, ⓘ · ✕ 가 한 줄에 남는다. 카드 폭 760 이상
      (헤더 한 줄 결합 경계 · card-header.tsx)이면 다섯이 모두 같은 줄이다.
  */
  test('P24-1 buy3 와이어 한 경로 — 공통 「비교가격」 확정 → 게이트웨이 10 에 buy3_schema=2(자동 필드 동반) · 신필드 · buy_watch_side 없음 → 후매수 보유중 에코 → 매수 LED 「보유중」 · 헤더 한 줄 (Phase 24 트레이서 · D-12)', async ({
    page,
  }) => {
    const seed = {
      buyEnabled: true,
      sellEnabled: true,
      sellEntryLatched: true,
      cancelQtyEnabled: true,
      postBuyEnabled: true,
      postBuyOrderAmount: 4000,
      postBuyReentry: 3,
      postBuyReboundPct: 30,
      postBuyFloorQty: 100_000,
      postBuyPhase: 1,
    };
    relay.seedLimitChasers([seed]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });

    const buyLed = card.locator('[data-slot="card-header"] [data-slot="latch-led"][data-kind="buy"]');
    await expect(buyLed).toHaveAttribute('data-tone', 'armed', { timeout: 15_000 });
    await expect(buyLed).toContainText('감시');

    // ① 공통 「비교가격」 한 호가 위로 확정 → 10 한 건.
    const watch = lcValue(page, 'lc-buy-watch-price');
    await expect(watch).not.toHaveText('', { timeout: 15_000 });
    const current = Number((await watch.innerText()).replace(/[^0-9]/g, ''));
    expect(current).toBeGreaterThan(0);
    const next = current + 100;
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await editLc(page, 'lc-buy-watch-price', String(next));
    await waitForSetAtGateway(relay, before + 1);

    // ② 게이트웨이가 받은 바이트 — buy3.
    const sets = relay
      .strategyRequests()
      .map((r) => readSetLimitChaserRequest(r.msgType, r.payload))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const last = sets.at(-1)!;
    expect(last.buyWatchPrice).toBe(next);
    // 새 웹은 lc.set 에 postBuyAuto · extraBuyBurstRelease · 자동매도 요청 4필드 + extraBuyAuto 를 항상 싣는다 → relay 가
    // buy3_schema 5 로 파생(quick-261011-0yb · 존재로만 1/2/3/4/5). 4 는 extraBuyAuto 없는 탭, 3 은 자동매도 필드 없는 탭,
    // 2 는 버스트 해제 없는 탭, 1 은 자동 필드 없는 옛 탭 몫.
    expect(last.buy3Schema).toBe(5);
    expect(last.postBuyEnabled).toBe(true);
    expect(last.postBuyReentry).toBe(3);
    expect(last.postBuyReboundPct).toBe(30);
    expect(last.buyWatchSide).toBeNull();
    expect(last.serverOnlySlots).toEqual([]);

    // ③ 후매수 보유중 에코 → 매수 LED 주황 「보유중」 · 클릭 불가(span) · 툴팁 원문.
    await relay.pushLimitChaserEcho({
      ...seed,
      buyWatchPrice: next,
      postBuyPhase: 2,
      postBuyTriggerQty: 330_000,
      postBuyReentryLeft: 2,
    });
    await expect(buyLed).toHaveAttribute('data-tone', 'latent', { timeout: 15_000 });
    await expect(buyLed).toContainText('보유중');
    expect(await buyLed.evaluate((el) => el.tagName)).toBe('SPAN');
    await buyLed.hover();
    await expect(page.getByRole('tooltip')).toContainText(
      '후매수 보유중 — 산 물량이 전부 정리되면 다시 감시(남은 횟수 0 이면 소진)',
      { timeout: 5_000 },
    );
    await page.mouse.move(0, 0);

    // ④ 헤더 한 줄 — 「매수 보유중 · 매도 감시 · 취소 대기」 칩과 ⓘ · ✕.
    const leds = card.locator('[data-slot="card-header"] [data-slot="latch-led"]');
    await expect(leds.nth(1)).toContainText('감시');
    await expect(leds.nth(2)).toContainText('대기');
    for (const viewport of [PHONE_VIEWPORT, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect(buyLed).toContainText('보유중');
      const centerY = async (loc: Locator): Promise<number> => {
        const b = await loc.boundingBox();
        expect(b, `${viewport.width} 박스`).not.toBeNull();
        return b!.y + b!.height / 2;
      };
      const chipYs = [await centerY(leds.nth(0)), await centerY(leds.nth(1)), await centerY(leds.nth(2))];
      const info = card.locator('[data-slot="card-header"]').getByRole('button', { name: '종목정보' });
      const close = card.locator('[data-slot="card-close"]');
      const infoY = await centerY(info);
      const closeY = await centerY(close);
      const spread = (ys: number[]) => Math.max(...ys) - Math.min(...ys);
      expect(spread(chipYs), `${viewport.width} LED 칩 3개 한 줄`).toBeLessThanOrEqual(4);
      expect(Math.abs(infoY - closeY), `${viewport.width} ⓘ · ✕ 한 줄`).toBeLessThanOrEqual(4);
      const cardWidth = await card.evaluate((el) => el.clientWidth);
      if (cardWidth >= 760) {
        expect(spread([...chipYs, infoY, closeY]), `${viewport.width} 카드 ${cardWidth} — 다섯이 한 줄`).toBeLessThanOrEqual(4);
      }
    }
  });

  /*
    Phase 27 트레이서(27-01 · D-04) — 자동매도 와이어 한 경로. 값 행 하나 확정 → 게이트웨이 10 에 buy3_schema 4(quick-261011-0yb 부터 5) ·
    자동매도 요청 4필드(에코 값 그대로) · 에코 전용 148~154 슬롯 없음 · 버스트 해제 동반 → 60 에코 상태 전이 →
    카드 헤더 4번째 LED 「자동」 이 초록 매도중 / 주황 대기 / 회색 OFF 로 선다. 390 · 1280 에서 LED 4칩과 ⓘ · ✕ 가
    헤더 한 줄을 지킨다(D-04 「구현 때 실측」).
  */
  test('P27-1 자동매도 와이어 한 경로 — 값 확정 → 게이트웨이 10 buy3_schema=4(요청 4필드 · 에코 슬롯 없음 · 버스트 동반) → 60 에코 매도중 → 카드 헤더 「자동」 LED 초록 · 헤더 한 줄 (Phase 27 트레이서 · D-04)', async ({
    page,
  }) => {
    const seed = {
      buyEnabled: true,
      sellEnabled: true,
      sellEntryLatched: true,
      cancelQtyEnabled: true,
      extraBuyBurstRelease: true,
      autoSellEnabled: true,
      autoSellStartCond: 2,
      autoSellRatioPct: 10,
      autoSellMethod: 3,
      autoSellState: 0,
    };
    relay.seedLimitChasers([seed]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });

    const autoLed = card.locator('[data-slot="card-header"] [data-slot="latch-led"][data-kind="autoSell"]');
    // 상태 0 — 체크가 켜져 있어도 서버가 아직 대기로 세우지 않았으면 회색(상태가 진실).
    await expect(autoLed).toHaveAttribute('data-tone', 'off', { timeout: 15_000 });
    await expect(autoLed).toContainText('자동');

    // ① 공통 「비교가격」 한 호가 위로 확정 → 10 한 건.
    const watch = lcValue(page, 'lc-buy-watch-price');
    await expect(watch).not.toHaveText('', { timeout: 15_000 });
    const current = Number((await watch.innerText()).replace(/[^0-9]/g, ''));
    expect(current).toBeGreaterThan(0);
    const next = current + 100;
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await editLc(page, 'lc-buy-watch-price', String(next));
    await waitForSetAtGateway(relay, before + 1);

    // ② 게이트웨이가 받은 바이트 — schema 5(+ extraBuyAuto · quick-261011-0yb) · 요청 4필드 · 에코 슬롯 없음 · 버스트 동반.
    const sent = lcSetRequests(relay).at(-1)!;
    expect(sent.buyWatchPrice).toBe(next);
    expect(sent.buy3Schema).toBe(5);
    expect([sent.autoSellEnabled, sent.autoSellStartCond, sent.autoSellRatioPct, sent.autoSellMethod]).toEqual([
      true, 2, 10, 3,
    ]);
    expect(sent.autoSellEchoSlotsEmpty).toBe(true);
    expect(sent.extraBuyBurstRelease).toBe(true);

    // ③ 60 에코 매도중 → 「자동」 LED 초록 「매도중」 · 클릭 불가(span).
    const echo = { ...seed, buyWatchPrice: next, autoSellBasis: 1, autoSellBasisPrice: 13_000, autoSellSoldQty: 6000 };
    await relay.pushLimitChaserEcho({ ...echo, autoSellState: 3 });
    await expect(autoLed).toHaveAttribute('data-tone', 'armed', { timeout: 15_000 });
    await expect(autoLed).toContainText('매도중');
    expect(await autoLed.evaluate((el) => el.tagName)).toBe('SPAN');

    // ④ 에코 대기(1) → 주황 「대기」 · 에코 0 → 회색 OFF.
    await relay.pushLimitChaserEcho({ ...echo, autoSellState: 1 });
    await expect(autoLed).toHaveAttribute('data-tone', 'latent', { timeout: 15_000 });
    await expect(autoLed).toContainText('대기');
    await relay.pushLimitChaserEcho({ ...echo, autoSellState: 0 });
    await expect(autoLed).toHaveAttribute('data-tone', 'off', { timeout: 15_000 });
    await expect(autoLed).toContainText('OFF');

    // ⑤ 헤더 한 줄 — 매도중 상태(가장 긴 라벨)로 되돌리고 390 · 1280 에서 LED 4칩 · ⓘ · ✕ 를 잰다.
    await relay.pushLimitChaserEcho({ ...echo, autoSellState: 3 });
    await expect(autoLed).toContainText('매도중', { timeout: 15_000 });
    const leds = card.locator('[data-slot="card-header"] [data-slot="latch-led"]');
    await expect(leds).toHaveCount(4);
    for (const viewport of [PHONE_VIEWPORT, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect(autoLed).toContainText('매도중');
      const centerY = async (loc: Locator): Promise<number> => {
        const b = await loc.boundingBox();
        expect(b, `${viewport.width} 박스`).not.toBeNull();
        return b!.y + b!.height / 2;
      };
      const chipYs = [
        await centerY(leds.nth(0)),
        await centerY(leds.nth(1)),
        await centerY(leds.nth(2)),
        await centerY(leds.nth(3)),
      ];
      const info = card.locator('[data-slot="card-header"]').getByRole('button', { name: '종목정보' });
      const close = card.locator('[data-slot="card-close"]');
      const infoY = await centerY(info);
      const closeY = await centerY(close);
      const spread = (ys: number[]) => Math.max(...ys) - Math.min(...ys);
      expect(spread(chipYs), `${viewport.width} LED 칩 4개 한 줄`).toBeLessThanOrEqual(4);
      expect(Math.abs(infoY - closeY), `${viewport.width} ⓘ · ✕ 한 줄`).toBeLessThanOrEqual(4);
      const cardWidth = await card.evaluate((el) => el.clientWidth);
      if (cardWidth >= 760) {
        expect(spread([...chipYs, infoY, closeY]), `${viewport.width} 카드 ${cardWidth} — 여섯이 한 줄`).toBeLessThanOrEqual(4);
      }
    }
  });

  test('P28-1 상한가 특징 한 경로 — 85 → relay → 카드 탭 「상한가 · 잠김 43초」 · 누적 행 · 카드 높이 불변 · 자동 전환 없음 (Phase 28 트레이서 · D-01~D-04)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    relay.seedLimitChasers([{ buyEnabled: true }]);
    // 펼친 카드 = FULL 구독(85 는 그 키를 FULL 로 잡은 소켓에만 온다 · 접힌 카드 price 는 받지 않는다).
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);
    const tabsRoot = card.locator('[data-slot="card-tabs"]');
    const tabs = tabsRoot.getByRole('tab');
    const limitTab = tabs.nth(3);
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveText('정보');
    await expect(limitTab).toHaveAccessibleName('상한가');

    // 85 는 quote 관찰자 연결로 민다(픽스처 ⑧). FULL 업스트림 구독이 서기 전 프레임은 relay 가 버리므로(구독 없는 키)
    // 트리거 이름이 바뀔 때까지 같은 프레임을 다시 민다 — 서버도 키당 1초마다 다시 보낸다.
    const sock = await relay.quoteSocket();
    await expect(async () => {
      pushLimitFeatureFixture(relay.gateway, sock, { isin: E2E_ISIN, exchange: 'KRX' });
      await expect(limitTab).toHaveAccessibleName('상한가 · 잠김 43초', { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    // (a) 자동 전환 없음(D-04) — 85 가 와도 활성 탭은 「정보」 그대로.
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(limitTab).toHaveAttribute('aria-selected', 'false');
    // 「잠김 43초」 조각은 --up(선택 알약 밖에서도 · 안에서도 같은 색).
    await expect(limitTab.locator('[data-slot="card-tab-limit-state"] .mono')).toHaveText('잠김 43초');

    // (b) 카드 높이 기록 → 「상한가」 클릭 → 누적 행 3칸 → 카드 높이 전후 같다(D-02) · 탭 본문 스크롤 없음.
    //     quick-261006-ide(WinForms gp8 · f1j) — 누적 행 「매도 6.0억 · 취소 4.6억 · 위험도 35%」(기본 프레임 6.0억/17.3억),
    //     누적 머리 = 잠김 경과 「0:43」(data-elapsed), 상태 줄은 표 title 첫 줄.
    const cardHeight = () => card.evaluate((el) => el.getBoundingClientRect().height);
    const before = await cardHeight();
    await limitTab.click();
    await expect(limitTab).toHaveAttribute('aria-selected', 'true');
    const table = card.locator('[data-slot="lc-limit-feature"]');
    await expect(table).toBeVisible();
    const cells = table.locator('[data-slot="lc-limit-feature-cell"]');
    await expect(cells).toHaveCount(9);
    await expect(cells.nth(0)).toHaveText('매도 6.0억');
    await expect(cells.nth(1)).toHaveText('취소 4.6억');
    await expect(cells.nth(2)).toHaveText('위험도 35%');
    const heads = table.locator('[data-slot="lc-limit-feature-head"]');
    await expect(heads).toHaveText(['0:43', '10초', '창구']);
    await expect(heads.nth(0)).toHaveAttribute('data-elapsed', 'true');
    expect(((await table.getAttribute('title')) ?? '').split('\n')[0]).toBe('잠김 43초째 · 대기 17.3억 · 소진 —');
    // 10초 · 창구 행(28-07) — 기본 프레임 sell 3,700 · buy 6,300 → 「매수 우세 63%」 · 창구 00050 → 「매수 키움증권 +5.2만」.
    await expect(cells.nth(3)).toHaveText('매수 우세 63%');
    await expect(cells.nth(6)).toHaveText('매수 키움증권 +5.2만');
    const after = await cardHeight();
    expect(after, '「상한가」 탭 선택 전후 카드 높이(D-02)').toBe(before);
    const body = card.locator('[data-slot="card-tabs-body"]');
    const { scrollHeight, clientHeight } = await body.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight, '탭 본문 스크롤 없음 — 3행이 공통 고정 높이를 정확히 채운다').toBe(clientHeight);
    await card.screenshot({ path: test.info().outputPath('ide-lc-limit-feature-1280.png') });

    // (c) lock_state 2 프레임 → 트리거 이름 「상한가 · 깨짐」 · 누적 머리 「누적」 · 누적 행은 마지막 잠김 값 ·
    //     위험도 = 6.0억 ÷ 2.1억 = 286%(100% 초과 그대로) · title 첫 줄 「깨짐 · 대기 2.1억 · 매도벽 0.9억+」.
    pushLimitFeatureFixture(relay.gateway, sock, {
      isin: E2E_ISIN,
      exchange: 'KRX',
      lockState: 2,
      lockElapsedS: 0,
      qKrw: 210_000_000n,
      wallKrwVisible: 90_000_000n,
      wallTruncated: true,
    });
    await expect(limitTab).toHaveAccessibleName('상한가 · 깨짐', { timeout: 15_000 });
    await expect(heads).toHaveText(['누적', '10초', '창구']);
    await expect(heads.nth(0)).not.toHaveAttribute('data-elapsed', 'true');
    await expect(cells.nth(0)).toHaveText('매도 6.0억');
    await expect(cells.nth(1)).toHaveText('취소 4.6억');
    await expect(cells.nth(2)).toHaveText('위험도 286%');
    expect(((await table.getAttribute('title')) ?? '').split('\n')[0]).toBe('깨짐 · 대기 2.1억 · 매도벽 0.9억+');
    expect(await cardHeight()).toBe(before);
  });

  test('P28-1b 접었다 펼친 카드 — 얼린 값 없음 · 새 85 로 다시 선다 (D-23 · WR-A01 강등 시 캐시 삭제 · UI-SPEC ①-2 · D-05)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);
    const toggle = toggleOf(page, E2E_ISIN);
    const header = card.locator('[data-slot="card-header"]');
    const limitTab = card.locator('[data-slot="card-tabs"]').getByRole('tab').nth(3);
    const limitState = limitTab.locator('[data-slot="card-tab-limit-state"]');

    // ① 85(lock 1 · 43초) — P28-1 과 같은 재시도(FULL 업스트림 구독 전 프레임은 relay 가 버린다).
    const sock = await relay.quoteSocket();
    await expect(async () => {
      pushLimitFeatureFixture(relay.gateway, sock, { isin: E2E_ISIN, exchange: 'KRX' });
      await expect(limitTab).toHaveAccessibleName('상한가 · 잠김 43초', { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    // ② 접기(price 강등) — 스토어 키가 지워지고 카드는 85 를 쓰지 않는다. 헤더에 「잠김」 칩이 없다(D-05 칩 폐기).
    await toggle.click();
    await expect(card).toHaveAttribute('data-open', 'false');
    await expect(limitState).toHaveCount(0);
    await expect(header).not.toContainText('잠김');

    // ③ 접힌 동안 온 85(50초) — 업스트림이 PRICE 라 실서버는 보내지도 않는다(gh-trade MarketPublisher 85 = full 구독자에게만
    //    Fanout). 목 게이트웨이가 보내더라도 hub 는 PRICE 키의 85 를 버리고, 강등 때 캐시도 지웠다(WR-A01 — 낡은
    //    「잠김 N초째」 를 지금 값처럼 스냅샷으로 내리지 않는다). 접힌 동안 카드에는 어떤 「잠김」 도 없다.
    pushLimitFeatureFixture(relay.gateway, sock, { isin: E2E_ISIN, exchange: 'KRX', lockElapsedS: 50 });
    // 접힌 동안 흘러온 증분이 없음을 볼 여유(시장 배치 100ms 를 넉넉히 넘긴다).
    await page.waitForTimeout(500);
    await expect(limitState).toHaveCount(0);
    await expect(header).not.toContainText('잠김');

    // ④ 펼치기(full 승격) — 얼린 값 없음: 새 85 가 오기 전에는 접미 없는 「상한가」 다(강등 전 43초도, 접힌 동안의 50초도 아님).
    await toggle.click();
    await expect(card).toHaveAttribute('data-open', 'true');
    await page.waitForTimeout(500);
    await expect(limitTab).toHaveAccessibleName('상한가');

    // ⑤ 게이트웨이가 새 85(52초)를 보내면 그 값이 선다 — 실서버는 잠김 중 매초 값이 바뀌어 1초 안에 온다.
    await expect(async () => {
      pushLimitFeatureFixture(relay.gateway, sock, { isin: E2E_ISIN, exchange: 'KRX', lockElapsedS: 52 });
      await expect(limitTab).toHaveAccessibleName('상한가 · 잠김 52초', { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  });

  test('P28-2 9칸 폰 축약 · 높이 · 툴팁 — 카드 lc 폰 밴드 「신규 +1.2만」 · 창구 말줄임 + title · 긴 탭 제목 한 줄 / 넓은 밴드 「잔량 신규 +12,400」 (28-07 · D-02 · D-03 · D-04)', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);
    const bar = card.locator('[data-slot="card-tabs-bar"]');
    const tabs = card.locator('[data-slot="card-tabs"]').getByRole('tab');
    const limitTab = tabs.nth(3);

    // 잠김 63초(긴 탭 제목) · 10초 신규 12,400 · 취소 2,300 · 창구 매수 00005 +12.3만 · 확률 적용(툴팁 꼬리).
    const frame = {
      isin: E2E_ISIN,
      exchange: 'KRX',
      lockState: 1,
      lockElapsedS: 63,
      new10s: 12_400n,
      cancel10s: 2_300n,
      memberBuy: [{ memberNo: '00005', dQty: 123_000n, dValue: 1_599_000_000n, shareBp: 8000 }],
      modelState: 1,
      modelSchemaVersion: 1,
      pBreakBp: 1830,
      pHorizonS: 60,
    };
    const sock = await relay.quoteSocket();
    await expect(async () => {
      pushLimitFeatureFixture(relay.gateway, sock, frame);
      await expect(limitTab).toHaveAccessibleName('상한가 · 잠김 1분 3초', { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    // (a) 긴 탭 제목에도 탭 줄은 한 줄 — 탭 4 + 로그 버튼 2 + 접기 중심선이 같고, 버튼들은 카드 안에 보인다(UI E1 long-text).
    const centers = await bar
      .locator('[role="tab"], [data-slot="card-log-button"], [data-slot="card-tabs-fold"]')
      .evaluateAll((els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return r.top + r.height / 2;
      }));
    expect(centers, '탭 4 + 버튼 2 + 접기').toHaveLength(7);
    expect(Math.max(...centers) - Math.min(...centers), '카드 탭 줄 한 줄(390)').toBeLessThanOrEqual(4);
    const cardBox = (await card.boundingBox())!;
    for (const btn of [
      ...(await bar.locator('[data-slot="card-log-button"]').all()),
      bar.locator('[data-slot="card-tabs-fold"]'),
    ]) {
      await expect(btn).toBeVisible();
      const b = (await btn.boundingBox())!;
      expect(b.x + b.width, '버튼이 카드 오른쪽 밖으로 밀리지 않는다').toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
    }

    // (b) 카드 높이 기록 → 「상한가」 클릭 → 높이 같고 탭 본문 스크롤 없음(D-02).
    const cardHeight = () => card.evaluate((el) => el.getBoundingClientRect().height);
    // 390 첫 렌더 직후 카드 높이가 한 번 더 정착한다(실측 787.5 → 730.5 — 기준 HEAD 에서도 즉시 측정은 실패했다).
    // 같은 값이 250ms 간격 두 번 연속 나올 때까지 기다린 값을 기준으로 삼는다(quick-261006-ide).
    let prevHeight = -1;
    await expect
      .poll(
        async () => {
          const h = await cardHeight();
          const settled = h === prevHeight;
          prevHeight = h;
          return settled;
        },
        { intervals: [250], timeout: 5_000 },
      )
      .toBe(true);
    const before = prevHeight;
    await limitTab.click();
    await expect(limitTab).toHaveAttribute('aria-selected', 'true');
    const table = card.locator('[data-slot="lc-limit-feature"]');
    const cells = table.locator('[data-slot="lc-limit-feature-cell"]');
    await expect(cells).toHaveCount(9);
    expect(await cardHeight(), '「상한가」 탭 선택 전후 카드 높이(390)').toBe(before);
    const body = card.locator('[data-slot="card-tabs-body"]');
    const geo = await body.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(geo.scrollHeight, '탭 본문 스크롤 없음(390)').toBe(geo.clientHeight);

    // (c) 폰 밴드 — 잠김 중 10초 칸 2 · 3 의 **보이는** 글자는 축약형(넓은 span 은 CSS 로 숨김).
    await expect(cells.nth(4)).toHaveText('신규 +1.2만', { useInnerText: true });
    await expect(cells.nth(5)).toHaveText('취소 -2,300', { useInnerText: true });
    await expect(cells.nth(4).locator('[data-band="wide"]')).toBeHidden();
    await expect(cells.nth(4).locator('[data-band="narrow"]')).toBeVisible();

    // (c2) quick-261006-ide — 누적 머리 = 경과 「1:03」 · 머리와 누적 3칸이 칸 안에서 잘리지 않는다(390).
    const heads = table.locator('[data-slot="lc-limit-feature-head"]');
    await expect(heads.nth(0)).toHaveText('1:03');
    await expect(cells.nth(0)).toHaveText('매도 6.0억');
    await expect(cells.nth(1)).toHaveText('취소 4.6억');
    await expect(cells.nth(2)).toHaveText('위험도 35%');
    const unclipped = async (what: string) => {
      for (const el of [heads.nth(0), cells.nth(0), cells.nth(1), cells.nth(2)]) {
        const g = await el.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, text: e.textContent }));
        expect(g.sw, `${what} — 「${g.text}」 이 칸 안에서 잘리지 않는다(390)`).toBeLessThanOrEqual(g.cw);
      }
    };
    await unclipped('잠김 1:03');
    await card.screenshot({ path: test.info().outputPath('ide-lc-limit-feature-390.png') });

    // (d) 창구 칸 1 은 칸 안에서 말줄임(UI E1 overflow) — 전체 문장은 표 title 이 받는다(늘 넓은 밴드 문구).
    await expect(cells.nth(6)).toHaveText('매수 미래에셋증권 +12.3만');
    const clip = await cells.nth(6).evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflow: getComputedStyle(el).textOverflow,
    }));
    expect(clip.overflow).toBe('ellipsis');
    expect(clip.scrollWidth, '창구 칸이 칸 폭을 넘는다 → 말줄임').toBeGreaterThan(clip.clientWidth);
    const title = (await table.getAttribute('title')) ?? '';
    expect(title).toContain('매수 미래에셋증권 +12.3만');
    expect(title).toContain('잔량 신규 +12,400 · 잔량 취소 -2,300');
    expect(title).toMatch(/\n\d{2}:\d{2}:\d{2} 기준 · 깨짐확률은 60초 안$/);
    expect(await cardHeight(), '말줄임 칸이 있어도 카드 높이 그대로').toBe(before);

    // (d2) 1시간 넘는 잠김(3920초) → 누적 머리 「1:05:20」 도 머리 칸에서 잘리지 않는다.
    pushLimitFeatureFixture(relay.gateway, sock, { ...frame, lockElapsedS: 3920 });
    await expect(heads.nth(0)).toHaveText('1:05:20', { timeout: 5_000 });
    await unclipped('잠김 1:05:20');
    expect(await cardHeight(), '1시간 경과 머리에도 카드 높이 그대로').toBe(before);
    await card.screenshot({ path: test.info().outputPath('ide-lc-limit-feature-390-1h.png') });

    // (e) 넓은 밴드(1280) — 같은 칸이 전체 숫자 「잔량 신규 +12,400」 · 「잔량 취소 -2,300」.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(cells.nth(4)).toHaveText('잔량 신규 +12,400', { useInnerText: true });
    await expect(cells.nth(5)).toHaveText('잔량 취소 -2,300', { useInnerText: true });
    await expect(cells.nth(4).locator('[data-band="narrow"]')).toBeHidden();
    const geoWide = await body.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(geoWide.scrollHeight, '탭 본문 스크롤 없음(1280)').toBe(geoWide.clientHeight);
  });

  test('P27-2 자동매도 카드 — 펼침 · 스위치 등록 · 방법 세그먼트 · 칩 대기→감시 · 요약 · 폰 시트 · 범위 가드 (D-01 · D-02 · D-03 · Pitfall 5)', async ({
    page,
  }) => {
    const seed = { buyEnabled: true, autoSellEnabled: false, autoSellStartCond: 2, autoSellRatioPct: 10, autoSellMethod: 3 };
    relay.seedLimitChasers([seed]);
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);
    const group = card.locator('[data-slot="lc-group-auto-sell"]');
    const fold = group.locator('[data-slot="lc-group-fold"]');
    const chip = group.locator('[data-slot="lc-group-status"]');
    const autoLed = card.locator('[data-slot="card-header"] [data-slot="latch-led"][data-kind="autoSell"]');
    const methodSeg = group.getByRole('radiogroup', { name: '자동매도 방법' });

    // ① 매도 pane 세 번째 카드 · 첫 렌더 접힘 · 칩 없음(상태 0) → 제목줄 클릭 = 펼침(전송 0).
    await expect(card.locator('[data-pane="sell"] section[data-slot^="lc-group-"]')).toHaveCount(3);
    await expect(card.locator('[data-pane="sell"] section[data-slot^="lc-group-"]').nth(2)).toHaveAttribute(
      'data-slot',
      'lc-group-auto-sell',
    );
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await expect(chip).toHaveCount(0);
    const base = lcSetCount(relay);
    await fold.click();
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    await expect(methodSeg).toBeVisible();
    expect(lcSetCount(relay), '접기는 lc.set 을 보내지 않는다').toBe(base);

    // ② 스위치 「자동매도 켜기」 = 10 한 건 — autoSellEnabled · buy3_schema 5(+ extraBuyAuto 동반 · quick-261011-0yb).
    await lcSwitch(group, '자동매도 켜기').click();
    await waitForSetAtGateway(relay, base + 1);
    const armed = lcSetRequests(relay).at(-1)!;
    expect(armed.autoSellEnabled).toBe(true);
    expect(armed.buy3Schema).toBe(5);
    expect([armed.autoSellStartCond, armed.autoSellRatioPct, armed.autoSellMethod]).toEqual([2, 10, 3]);

    // ③ 에코 대기(1) → 칩 「대기」 주황 · 헤더 LED 대기.
    const on = { ...seed, autoSellEnabled: true };
    await relay.pushLimitChaserEcho({ ...on, autoSellState: 1 });
    await expect(chip).toHaveText('대기', { timeout: 15_000 });
    await expect(chip).toHaveClass(/--led-latent/);
    await expect(autoLed).toHaveAttribute('data-tone', 'latent');
    await expect(lcSwitch(group, '자동매도 켜기')).toBeChecked();

    // ④ 데스크톱 세그먼트 「매수1호가」 = 10 한 건(autoSellMethod 2) · 에코 전까지 선택은 서버 값 · 에코 뒤 이동.
    const radio = (name: string) => methodSeg.getByRole('radio', { name, exact: true });
    await expect(radio('양쪽')).toHaveAttribute('aria-checked', 'true');
    await radio('매수1호가').click();
    await waitForSetAtGateway(relay, base + 2);
    expect(lcSetRequests(relay).at(-1)!.autoSellMethod).toBe(2);
    await expect(radio('양쪽')).toHaveAttribute('aria-checked', 'true');
    await relay.pushLimitChaserEcho({ ...on, autoSellMethod: 2, autoSellState: 1 });
    await expect(radio('매수1호가')).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
    await expect(radio('양쪽')).toHaveAttribute('aria-checked', 'false');

    // ⑤ 에코 감시(2) · 기준 상한가 13,000 · 누적 0 → 칩 「감시」 초록 · 기준 행 · 누적 「—」.
    const watching = { ...on, autoSellMethod: 2, autoSellState: 2, autoSellBasis: 1, autoSellBasisPrice: 13_000, autoSellSoldQty: 0 };
    await relay.pushLimitChaserEcho(watching);
    await expect(chip).toHaveText('감시', { timeout: 15_000 });
    await expect(chip).toHaveClass(/--led-armed/);
    await expect(autoLed).toHaveAttribute('data-tone', 'armed');
    await expect(group.locator('[data-slot="lc-auto-sell-basis"]')).toHaveText('기준상한가 13,000원');
    await expect(group.locator('[data-slot="lc-auto-sell-sold"]')).toContainText('—');

    // ⑥ 접기 → 요약 줄 5조각(같은 의미어).
    await fold.click();
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    const summary = group.locator('[data-slot="lc-group-summary"]');
    await expect(summary).toBeVisible();
    await expect(summary.locator(':scope > span')).toHaveText(['시작조건2%', '비율10%', '방법매수1호가', '누적—', '기준상한가 13,000원']);

    // ⑦ 폰 390 — 매도 탭 · 방법 행 「방법 ─ 매수1호가 ›」 → 시트 3옵션(양쪽 · 매도1호가 · 매수1호가) · 닫기 = 전송 0.
    await page.setViewportSize(PHONE_VIEWPORT);
    await card.getByRole('tablist', { name: '주문 진입' }).getByRole('tab', { name: '매도' }).click();
    if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click();
    const methodRow = group.locator('button[data-lc-field="lc-auto-sell-method"]');
    await expect(methodRow).toBeVisible();
    await expect(methodSeg).toBeHidden();
    await expect(methodRow.locator('[data-slot="lc-row-value"]')).toHaveText('매수1호가');
    const sentBeforeSheet = lcSetCount(relay);
    await methodRow.click();
    const sheet = page.locator('[data-slot="lc-choice-sheet"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('radio')).toHaveText(['양쪽', '매도1호가', '매수1호가']);
    await expect(sheet.getByRole('radio', { name: '매수1호가' })).toHaveAttribute('aria-checked', 'true');
    await sheet.getByRole('button', { name: '닫기' }).click();
    await expect(sheet).toBeHidden();
    await expect(methodRow).toBeFocused();
    expect(lcSetCount(relay), '시트를 닫기만 하면 전송 0').toBe(sentBeforeSheet);

    // ⑧ 범위 가드 — 옛 에코(꺼짐 · 비율 0 · 방법 0)에서 스위치 → 게이트웨이 10 이 늘지 않고 폼 맨 위 실패 문구.
    await relay.pushLimitChaserEcho({ ...seed, autoSellEnabled: false, autoSellRatioPct: 0, autoSellMethod: 0, autoSellState: 0 });
    await expect(lcSwitch(group, '자동매도 켜기')).not.toBeChecked({ timeout: 15_000 });
    await expect(chip).toHaveCount(0);
    const beforeGuard = lcSetCount(relay);
    await lcSwitch(group, '자동매도 켜기').click();
    await expect(card.locator('[data-slot="lc-submit-error"]')).toContainText('비율 · ');
    await page.waitForTimeout(1_000);
    expect(lcSetCount(relay), '범위 밖 켜기는 relay 에 닿지 않는다(close 4400 방지)').toBe(beforeGuard);
    await expect(lcSwitch(group, '자동매도 켜기')).not.toBeChecked();
  });

  test('P27-3 바로시작 · 중지 — 41 → 60 에코 기대 전이 → 칩 · 버튼 전환 · 54 거부 원문 (D-05~D-09)', async ({ page }) => {
    const seed = {
      buyEnabled: true,
      autoSellEnabled: true,
      autoSellState: 1,
      autoSellRatioPct: 10,
      autoSellMethod: 3,
      autoSellStartCond: 2,
    };
    relay.seedLimitChasers([seed]);
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);
    const group = card.locator('[data-slot="lc-group-auto-sell"]');
    const fold = group.locator('[data-slot="lc-group-fold"]');
    const chip = group.locator('[data-slot="lc-group-status"]');
    const start = group.locator('[data-slot="lc-auto-sell-start"]');
    const stop = group.locator('[data-slot="lc-auto-sell-stop"]');
    const autoLed = card.locator('[data-slot="card-header"] [data-slot="latch-led"][data-kind="autoSell"]');
    /** 게이트웨이가 받은 41 — 순서대로 읽는다(브라우저 → relay → 게이트웨이 바이트). */
    const autoSellCmds = () =>
      relay
        .strategyRequests()
        .filter((r) => r.msgType === DMA_MSG.AutoSellCommandReq)
        .map((r) => readAutoSellCommandRequest(r.payload));

    // ① 접힌 카드에는 버튼이 없다 → 펼치면 마지막 행 · 대기(1) = 바로시작 활성 · 중지 비활성.
    await expect(chip).toHaveText('대기', { timeout: 15_000 });
    await expect(start).toHaveCount(0);
    await fold.click();
    await expect(start).toBeEnabled();
    await expect(stop).toBeDisabled();

    // ② 바로시작 → 칩 「바로시작 전송…」(점선) · 두 버튼 잠금 · 41 action 1 한 건(확인창 없음).
    await start.click();
    await expect(chip).toHaveText('바로시작 전송…');
    await expect(chip).toHaveClass(/border-dashed/);
    await expect(start).toBeDisabled();
    await expect(stop).toBeDisabled();
    await expect.poll(() => autoSellCmds().length, { timeout: 15_000 }).toBe(1);
    expect(autoSellCmds()[0]).toEqual({ isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, exchange: 'KRX', action: 1 });

    // ③ 60 에코 매도중(기대 전이) → 칩 「매도중」 · 중지 활성 · 바로시작 비활성 · 헤더 LED 매도중.
    await relay.pushLimitChaserEcho({ ...seed, autoSellState: 3 });
    await expect(chip).toHaveText('매도중', { timeout: 15_000 });
    await expect(stop).toBeEnabled();
    await expect(start).toBeDisabled();
    await expect(autoLed).toHaveAttribute('data-tone', 'armed');
    await expect(autoLed).toContainText('매도중');

    // ④ 중지 → 41 action 2 → 에코 꺼짐(enabled false · 0) → 칩 없음 · 바로시작 활성.
    await stop.click();
    await expect(chip).toHaveText('중지 전송…');
    await expect.poll(() => autoSellCmds().length, { timeout: 15_000 }).toBe(2);
    expect(autoSellCmds()[1]).toEqual({ isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, exchange: 'KRX', action: 2 });
    await relay.pushLimitChaserEcho({ ...seed, autoSellEnabled: false, autoSellState: 0 });
    await expect(chip).toHaveCount(0, { timeout: 15_000 });
    await expect(start).toBeEnabled();
    await expect(stop).toBeDisabled();

    // ⑤ 거부 — 대기(1)로 되돌리고 바로시작 → 54 ERROR AutoSellCommand 원문 → 로그 · 버튼 재활성 · 「미반영」 없음.
    await relay.pushLimitChaserEcho(seed);
    await expect(chip).toHaveText('대기', { timeout: 15_000 });
    await start.click();
    await expect(chip).toHaveText('바로시작 전송…');
    await expect.poll(() => autoSellCmds().length, { timeout: 15_000 }).toBe(3);
    await relay.pushServerMessage({
      level: 'ERROR',
      source: 'AutoSellCommand',
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      message: '자동매도 바로시작 거부 — 보유수량 0',
      kind: '',
    });
    await expect(chip).toHaveText('대기', { timeout: 15_000 });
    await expect(start).toBeEnabled();
    const rejected = (await logRows(page)).filter({ hasText: '자동매도 바로시작 거부 — 보유수량 0' });
    await expect(rejected).toHaveCount(1);
    await expect(rejected).toContainText('[상따]');
    await expect(rejected).toHaveAttribute('data-level', 'error');
    await page.waitForTimeout(3_500);
    await expect(card.locator('[data-slot="card-unacked"]')).toHaveCount(0);
    expect(autoSellCmds(), '재전송 없음').toHaveLength(3);
  });

  test('P27-4 새 폼 84 시딩 — /me 기본값이 새 카드 첫 등록 cfg 에 실린다 (D-11)', async ({ page }) => {
    await page.goto(WORKBENCH_URL);
    await waitForReady(page);
    // 사용자 세션에 84(서버 저장값)를 민다 — /me 에서 바꾼 기본값이 브로드캐스트로 도착한 모양.
    await relay.pushUserSettings({ present: true, preBuyAmount: 5000, autoSellRatioDefaultPct: 15, autoSellMethodDefault: 1 });

    // 에코 없는 새 종목 카드 — 84 가 카드보다 늦어도 미등록 폼은 손대지 않은 칸을 다시 시딩한다.
    const before = lcSetCount(relay);
    await addStockByKeyboard(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(lcValue(page, 'lc-buy-order-price')).toHaveText(`${LIVE_UPPER_LIMIT}원`, { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-order-amount')).toHaveText('5,000만원', { timeout: 15_000 });
    // 84 기본값 칸(줄매수 금액) — present 이지만 값은 내장값 4,000.
    await expect(lcValue(page, 'lc-extra-buy-amount')).toHaveText('4,000만원');
    const group = card.locator('[data-slot="lc-group-auto-sell"]');
    const fold = group.locator('[data-slot="lc-group-fold"]');
    if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click();
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    await expect(lcValue(page, 'lc-auto-sell-ratio')).toHaveText('15%');
    const methodSeg = group.getByRole('radiogroup', { name: '자동매도 방법' });
    await expect(methodSeg.getByRole('radio', { name: '매도1호가', exact: true })).toHaveAttribute('aria-checked', 'true');
    expect(lcSetCount(relay), '시딩은 전송을 만들지 않는다').toBe(before);

    // 매수 스위치 확정 = 첫 등록 10 한 건 — 시딩된 값이 그대로 실린다.
    await lcSwitch(card, '매수주문 켜기').click();
    await waitForSetAtGateway(relay, before + 1);
    const sent = lcSetRequests(relay).at(-1)!;
    expect(sent.buyEnabled).toBe(true);
    expect(sent.buyOrderAmount).toBe(5000);
    expect(sent.autoSellRatioPct).toBe(15);
    expect(sent.autoSellMethod).toBe(1);
  });

  test('vzy-1 후매수 「자동」 — 체크 → 10 buy3_schema 3 · post_buy_auto · 에코 표시 · 서버 발화 에코로 풀림 · [상따] 사유 줄 (quick-260929-vzy 트레이서)', async ({
    page,
  }) => {
    // 금액 · 반등을 명시한다 — 자동 켜기 사전 검증(P-2)이 붙어도 그대로 통과하게(주문가격 71,000 → 수량 563주 · 매도비율 60).
    const seed = {
      buyEnabled: true,
      sellEnabled: true,
      postBuyEnabled: false,
      postBuyAuto: false,
      postBuyOrderAmount: 4000,
      postBuyReboundPct: 30,
      postBuyReentry: 3,
    };
    relay.seedLimitChasers([seed]);
    await openFocusedCard(page);
    const card = cardOf(page, E2E_ISIN);
    const auto = card.getByRole('checkbox', { name: '후매수 자동', exact: true });
    await expect(auto).toHaveAttribute('aria-checked', 'false');

    // 위치(D-05) — 제목줄 마지막 자식은 스위치 그대로, 체크는 그 바로 앞 형제.
    const order = await card.evaluate((root) => {
      const header = root.querySelector('[data-slot="lc-group-post-buy"] [data-slot="lc-group-header"]');
      const last = header?.lastElementChild ?? null;
      const check = header?.querySelector('[data-slot="lc-group-header-check"]') ?? null;
      return {
        lastRole: last?.getAttribute('role') ?? null,
        checkIsPrevOfSwitch: check !== null && last !== null && check.nextElementSibling === last,
      };
    });
    expect(order.lastRole).toBe('switch');
    expect(order.checkIsPrevOfSwitch).toBe(true);

    // ① 체크 → 10 한 건 — buy3_schema 5(버스트 해제 · 자동매도 요청 4필드 · extraBuyAuto 동반 · Phase 27 · quick-261011-0yb) · post_buy_auto true · 후매수 스위치는 그대로(자동은 서버 몫).
    const base = lcSetCount(relay);
    await auto.click();
    await waitForSetAtGateway(relay, base + 1);
    const sent = lcSetRequests(relay).at(-1)!;
    expect(sent.buy3Schema).toBe(5);
    expect(sent.postBuyAuto).toBe(true);
    expect(sent.postBuyEnabled).toBe(false);

    // ② 에코 postBuyAuto true → 체크 켜짐.
    await relay.pushLimitChaserEcho({ ...seed, postBuyAuto: true });
    await expect(auto).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });

    // ③ 서버 발화 — 54 INFO 사유 줄 + 발화 에코(자동 false · 후매수 · 마스터 켜짐) → 체크 풀림 · 후매수 켜짐 · 로그 한 줄(D-07).
    await relay.pushServerMessage({
      level: 'INFO',
      source: 'LimitChaser',
      isin: E2E_ISIN,
      accountNo: E2E_ACCOUNT_NO,
      message: '후매수 자동 켬 — 잔고 0 · 미체결 없음',
      kind: '',
    });
    await relay.pushLimitChaserEcho({ ...seed, postBuyAuto: false, postBuyEnabled: true, buyEnabled: true });
    await expect(auto).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 });
    await expect(lcSwitch(card, '후매수 켜기')).toBeChecked();
    const reason = (await logRows(page)).filter({ hasText: '후매수 자동 켬 — 잔고 0 · 미체결 없음' });
    await expect(reason).toHaveCount(1, { timeout: 15_000 });
    await expect(reason).toContainText('[상따] 서버 통지');

    // ④ 에코 경로는 제출을 만들지 않는다.
    await page.waitForTimeout(FOLD_QUIET_MS);
    expect(lcSetCount(relay)).toBe(base + 1);
  });

  /*
    ★ Phase 24 (24-08) — 24-04 ~ 24-07 이 단위 테스트로 세운 동작을 **진짜 relay + 스텁 게이트웨이** 위의 실브라우저로
      한 번씩 끝까지 잇는다. 「몇 건 나갔나」는 게이트웨이 10 개수(`lcSetCount`)로, 「무엇을 보냈나」는 디코드
      (`lcSetRequests`)로 본다 — 화면 낙관 표시만으로는 제출 여부를 말할 수 없다.
  */
  test('P24-2 접기 · 요약 줄 — 첫 렌더 세 카드 접힘(행은 DOM 에 있고 숨음) · 요약 줄 3개 · 접기 버튼 = 펼침(전송 0) · 스위치는 접힘 불변 · 에코 뒤에도 펼친 채 (스케치 009 D · R1 · UI-SPEC §2 · §3)', async ({
    page,
  }) => {
    const seed = { buyEnabled: true, sellEnabled: true };
    relay.seedLimitChasers([seed]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('10,000주', { timeout: 15_000 });

    // ① 첫 렌더 — 세 카드 접힘. 행은 언마운트가 아니라 숨김이다(나가 있던 확정 · 편집 보존).
    const fold = (slot: 'pre-buy' | 'extra-buy' | 'post-buy') =>
      card.locator(`[data-slot="lc-group-${slot}"] [data-slot="lc-group-fold"]`);
    for (const slot of ['pre-buy', 'extra-buy', 'post-buy'] as const) {
      await expect(fold(slot)).toHaveAttribute('aria-expanded', 'false');
    }
    await expect(lcRow(page, 'lc-buy-watch-qty')).toHaveCount(1);
    await expect(lcRow(page, 'lc-buy-watch-qty')).toBeHidden();
    // 요약 줄 = 세 그룹 + 자동매도(Phase 27 D-01 — 매도 pane 세 번째 접이식 카드).
    const summaries = card.locator('[data-slot="lc-group-summary"]');
    await expect(summaries).toHaveCount(4);
    for (const s of await summaries.all()) await expect(s).toBeVisible();
    const preSummary = card.locator('[data-slot="lc-group-pre-buy"] [data-slot="lc-group-summary"]');
    await expect(preSummary).toContainText('매도잔량');
    await expect(preSummary).toContainText('10,000주');

    // ② 접기 버튼 = 펼침 · 로컬 동작(전송 0).
    const before = lcSetCount(relay);
    await fold('pre-buy').click();
    await expect(fold('pre-buy')).toHaveAttribute('aria-expanded', 'true');
    await expect(lcRow(page, 'lc-buy-watch-qty')).toBeVisible();
    await expect(preSummary).toBeHidden();
    expect(lcSetCount(relay), '접기는 lc.set 을 보내지 않는다').toBe(before);

    // ③ 스위치는 접기 버튼 밖 형제 — 누르면 제출은 나가도 접힘은 그대로다.
    await lcSwitch(card, '선매수 켜기').click();
    await expect(fold('pre-buy')).toHaveAttribute('aria-expanded', 'true');
    await waitForSetAtGateway(relay, before + 1);
    const sent = lcSetRequests(relay).at(-1)!;
    expect(sent.preBuyEnabled).toBe(true);

    // ④ 에코가 와도 펼친 카드는 펼친 채 · 나머지 두 카드는 접힌 채(접힘은 폼 상태 · 에코가 덮지 않는다).
    await relay.pushLimitChaserEcho({ ...seed, ...lcEchoFlagsOf(sent) });
    await expect(lcSwitch(card, '선매수 켜기')).toBeChecked({ timeout: 15_000 });
    await expect(fold('pre-buy')).toHaveAttribute('aria-expanded', 'true');
    await expect(lcRow(page, 'lc-buy-watch-qty')).toBeVisible();
    await expect(fold('extra-buy')).toHaveAttribute('aria-expanded', 'false');
    await expect(fold('post-buy')).toHaveAttribute('aria-expanded', 'false');
  });

  test('P24-3 D-01 + D-06 — 마스터 OFF 에서 「선매수 켜기」 한 번 = 10 한 건(마스터 · 자동 체크 동반) → 에코 뒤 로그 두 줄(자동 체크 줄이 위) (D-07 · D-08)', async ({
    page,
  }) => {
    // 매도 · 취소 게이트는 꺼져 있고, 매수 가격 · 매도 매수잔량(10) · 취소 매수잔량(25) · 매도비율(60)은 0 이 아니다
    // (스텁 기본값) — 자동 체크 6종이 전부 켜질 수 있는 전략이다.
    const seed = { buyEnabled: false };
    relay.seedLimitChasers([seed]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('10,000주', { timeout: 15_000 });
    await expect(lcSwitch(card, '매수주문 켜기')).not.toBeChecked();
    // 상한가(시세)가 들어와야 자동 체크가 가격을 판정한다(D-20) — 호가 사다리의 상한가 시딩을 기다린다.
    await expect(lcValue(page, 'lc-buy-order-price')).not.toHaveText('', { timeout: 15_000 });

    const before = lcSetCount(relay);
    await lcSwitch(card, '선매수 켜기').click();
    // 확인창 · 토스트 · 매도 탭 이동 없음(D-06).
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await waitForSetAtGateway(relay, before + 1);

    const sent = lcSetRequests(relay).at(-1)!;
    // 자동 · 버스트 해제 · 자동매도 요청 4필드 + extraBuyAuto 동반 → buy3_schema 5 (P24-1 주석 · quick-261011-0yb).
    expect(sent.buy3Schema).toBe(5);
    expect(sent.crud).toBe('C');
    expect(sent.preBuyEnabled).toBe(true);
    expect(sent.buyEnabled, 'D-01 — 마스터 동반').toBe(true);
    expect(sent.sellEnabled, 'D-06 — 매도주문 자동 체크').toBe(true);
    expect(sent.cancelQtyEnabled, 'D-06 — 매수취소 자동 체크').toBe(true);
    expect(sent.sellTradeQtyEnabled, 'D-06 — 매도>체결 자동 체크').toBe(true);
    expect(sent.sellQtyTrackEnabled, 'D-06 — 매도>잔량추적 자동 체크').toBe(true);
    expect(sent.cancelTradeEnabled, 'D-06 — 취소>체결 자동 체크').toBe(true);
    expect(sent.cancelQtyTrackEnabled, 'D-06 — 취소>잔량추적 자동 체크').toBe(true);

    await relay.pushLimitChaserEcho({ ...seed, ...lcEchoFlagsOf(sent) });
    await expect(lcSwitch(card, '매수주문 켜기')).toBeChecked({ timeout: 15_000 });
    await expect(lcSwitch(card, '매도주문 켜기')).toBeChecked();
    await expect(lcSwitch(card, '매수취소 켜기')).toBeChecked();
    const rows = await logRows(page);
    await expect(rows.first()).toContainText('선매수 자동 체크 — 켬: ', { timeout: 15_000 });
    await expect(rows.nth(1)).toContainText('선매수 체크 — 매수주문도 켬');
    // 개수는 에코 뒤 로그 두 줄이 선 다음에 잰다(GC-IN-04) — 클릭이 둘째 10 을 보냈다면 같은 소켓 · 송신 순서라
    // 에코 · 로그보다 먼저 게이트웨이에 도착해 있다.
    expect(lcSetCount(relay), '사람 한 번 = 10 한 건').toBe(before + 1);
  });

  test('P24-4 D-02 전반 · D-02 후반 · D-19 — 마지막 그룹 끔은 마스터 동반 · 서버 접힘 하강 전이는 마스터 OFF 1회 · 재수신 0회 · 삭제 가드 0회 (2026-09-28 정정 · WinForms b066e135 동형)', async ({
    page,
  }) => {
    // 웹 · relay 가 보낸 전략의 실제 에코 모양(WR-06 가드 ⑤ 가 다른 클라 값과 구분한다) — 후매수 수량 = 웹 산출
    // (`floor(4,000만원 / 스텁 주문가격 71,000) = 563`) · 한방 고정 3필드 = 클라 고정값(true · 0 · 0).
    const POST = {
      postBuyOrderAmount: 4000,
      postBuyOrderQty: 563,
      postBuyReentry: 3,
      postBuyReentryLeft: 3,
      postBuyReboundPct: 30,
      postBuyFloorQty: 100_000,
    };
    const SWEEP_FIXED = { sweepRecalcEnabled: true, sweepMinCount: 0, sweepMinRate: 0 };
    // (a) D-02 전반 — 마스터 ON · 후매수만 ON · 매도 ON. 사람이 마지막 그룹(후매수)을 끄면 같은 10 에 마스터도 끈다.
    const seedA = { buyEnabled: true, sellEnabled: true, postBuyEnabled: true, postBuyPhase: 1, ...POST, ...SWEEP_FIXED };
    relay.seedLimitChasers([seedA]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcSwitch(card, '후매수 켜기')).toBeChecked({ timeout: 15_000 });
    const beforeA = lcSetCount(relay);
    await lcSwitch(card, '후매수 켜기').click();
    await waitForSetAtGateway(relay, beforeA + 1);
    const offA = lcSetRequests(relay).at(-1)!;
    expect(offA.postBuyEnabled).toBe(false);
    expect(offA.buyEnabled, 'D-02 전반 — 마지막 그룹 끔 = 마스터 동반 끔').toBe(false);
    expect(offA.sellEnabled).toBe(true);
    expect(offA.crud).toBe('C');

    // (b) D-02 후반 · D-19 — 마스터 ON · 선매수 ON · 매도 ON 이 렌더된 뒤 서버가 세 그룹을 접은 에코를 보낸다.
    const seedB = { buyEnabled: true, sellEnabled: true, preBuyEnabled: true, ...POST, ...SWEEP_FIXED };
    relay.seedLimitChasers([seedB]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcSwitch(card, '선매수 켜기')).toBeChecked({ timeout: 15_000 });
    await expect(lcGroupStatus(card, 'buy')).toHaveText('감시 중');
    const FOLD = { ...seedB, preBuyEnabled: false };
    const beforeB = lcSetCount(relay);
    await relay.pushLimitChaserEcho(FOLD);
    // 하강 전이 1건은 사건으로 기다린다(GC-IN-04) — 「정확히 1건」은 자기 마스터 OFF 에코의 로그 줄 뒤에 잰다.
    await waitForSetAtGateway(relay, beforeB + 1);
    const drop = lcSetRequests(relay).at(-1)!;
    expect(drop.buyEnabled).toBe(false);
    expect(drop.crud).toBe('C');
    expect(drop.sellEnabled, '매도 게이트는 에코 그대로').toBe(true);
    expect([drop.preBuyEnabled, drop.extraBuyEnabled, drop.postBuyEnabled]).toEqual([false, false, false]);

    // 같은 세 그룹 OFF 에코 재수신 — 하강 전이가 아니다(핑퐁 0). 부재는 유예보다 넉넉한 관찰 창으로 잰다.
    await relay.pushLimitChaserEcho(FOLD);
    await page.waitForTimeout(FOLD_QUIET_MS);
    expect(lcSetCount(relay), '같은 상태 재수신 = 추가 10 0건').toBe(beforeB + 1);

    // 그 제출의 마스터 OFF 에코 → 로그 최상단 서버 접힘 문장 · 「다른 단말」 배너 없음.
    await relay.pushLimitChaserEcho({ ...FOLD, ...lcEchoFlagsOf(drop) });
    await expect(lcSwitch(card, '매수주문 켜기')).not.toBeChecked({ timeout: 15_000 });
    const rows = await logRows(page);
    await expect(rows.first()).toContainText('서버가 매수 그룹 해제 — 매수 그룹이 모두 꺼져 매수주문도 끔', {
      timeout: 15_000,
    });
    await page.waitForTimeout(FOLD_QUIET_MS);
    expect(lcSetCount(relay), 'D-02 후반 — 서버 접힘 하강 전이 = 마스터 OFF 정확히 1건 · 자기 마스터 OFF 에코는 트리거가 아니다').toBe(
      beforeB + 1,
    );

    // (c) 삭제 가드 — 매도 · 취소 게이트가 전부 OFF 면 자동 끔은 곧 삭제(crud D)라 보내지 않는다.
    const seedC = { buyEnabled: true, preBuyEnabled: true, ...POST, ...SWEEP_FIXED };
    relay.seedLimitChasers([seedC]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcSwitch(card, '선매수 켜기')).toBeChecked({ timeout: 15_000 });
    const beforeC = lcSetCount(relay);
    await relay.pushLimitChaserEcho({ ...seedC, preBuyEnabled: false });
    await expect(lcSwitch(card, '선매수 켜기')).not.toBeChecked({ timeout: 15_000 });
    await page.waitForTimeout(FOLD_QUIET_MS);
    expect(lcSetCount(relay), '삭제 가드 — 추가 10 0건').toBe(beforeC);
    await expect(lcGroupStatus(card, 'buy')).toHaveText('켜짐 · 켠 매수 없음');
    await expect(lcSwitch(card, '매수주문 켜기')).toBeChecked();
  });

  test('P24-5 사전 검증 — 신필드 0(buy3) 에코에서 줄매수 켜기 = 전송 0 + 「주문금액을 먼저 입력해 주세요」 · 상한가 두꺼운 벽이어도 켜기 = 10 한 건(D-33 ① 폐기)', async ({
    page,
  }) => {
    // (a) 신필드 0(buy3) 에코 — buy3 서버의 신필드 전부 0 전략(UI-SPEC E1 partial 「레거시 에코」 · `buy3Schema` 는 픽스처 기본 1).
    //     줄매수 금액 0 이라 켜는 방향이 막힌다(D-03). 구서버 에코(`buy3Schema 0`)는 읽기 전용이라 P24-10 이 따로 본다.
    // ★ 전송 0 은 고정 대기로 재지 않는다 — 이어지는 허용 확정의 10 이 게이트웨이에 보인 순간 누적 = 앞 기준 + 1(IN-07).
    const zeroNew = { buyEnabled: true };
    relay.seedLimitChasers([zeroNew]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('10,000주', { timeout: 15_000 });
    const extraSwitch = lcSwitch(card, '줄매수 켜기');
    const precheck = card.locator('[data-slot="lc-group-extra-buy"] [data-slot="lc-group-precheck"]');
    const before = lcSetCount(relay);
    await extraSwitch.click();
    await expect(precheck).toHaveText('주문금액을 먼저 입력해 주세요');
    await expect(precheck).toHaveAttribute('role', 'alert');
    await expect(extraSwitch).toHaveAttribute('aria-checked', 'false');

    // 줄매수 금액 확정 → 10 한 건 → 에코 → 사전 검증 줄이 사라진다(원인 값이 고쳐졌다).
    //   그 10 이 보인 순간 누적 = 앞 기준 + 1 — 앞선 켜기 클릭(사전 검증 실패)은 아무것도 보내지 않았다.
    await editLc(page, 'lc-extra-buy-amount', '500');
    await expect
      .poll(() => lcSetRequests(relay).filter((r) => r.extraBuyOrderAmount === 500).length, { timeout: 15_000 })
      .toBe(1);
    expect(lcSetCount(relay), '사전 검증 실패 = 전송 0 · 금액 확정 = 10 한 건').toBe(before + 1);
    expect(lcSetRequests(relay).at(-1)!.extraBuyOrderAmount).toBe(500);
    await relay.pushLimitChaserEcho({ ...zeroNew, extraBuyOrderAmount: 500 });
    await expect(lcValue(page, 'lc-extra-buy-amount')).toHaveText('500만원', { timeout: 15_000 });
    await expect(precheck).toHaveCount(0);

    // (b) D-33 ① 폐기(gh-trade quick-261010-ub8 · quick-261011-0yb) — 비교가격 = 스텁 호가 매수1호가(97,900) · 스텁
    //     매수1잔량 10 ≥ 시드 최소 0(→ 하한 1) = 두꺼운 벽이어도 줄매수 켜기 = 10 한 건 · 차단 로그 줄 0. 서버가 첫
    //     상한가 B6 에서 구간 판정한다.
    const atUpper = { buyEnabled: true, buyWatchPrice: 97_900, extraBuyOrderAmount: 500 };
    relay.seedLimitChasers([atUpper]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-price')).toHaveText('97,900원', { timeout: 15_000 });
    // 호가가 들어온 뒤에 누른다 — 사다리에 97,900 이 보일 때까지(두꺼운 벽 조건이 실제로 선 상태).
    await expect(card.locator('[data-slot="orderbook-ladder"]').first()).toContainText('97,900', { timeout: 15_000 });
    const beforeUpper = lcSetCount(relay);
    await extraSwitch.click();
    await waitForSetAtGateway(relay, beforeUpper + 1);
    expect(lcSetCount(relay), '두꺼운 벽이어도 켜기 = 10 한 건').toBe(beforeUpper + 1);
    const allowed = lcSetRequests(relay).at(-1)!;
    expect(allowed.extraBuyEnabled).toBe(true);
    expect(allowed.buyWatchPrice).toBe(97_900);
    await expect(precheck).toHaveCount(0);
    const rows = await logRows(page);
    await expect(rows.filter({ hasText: '매수1잔량이 최소 미만일 때만' })).toHaveCount(0);
  });

  test('P24-6 후매수 단계 · 발동 override 무배너 — 단계 1 감시 중 → 2 보유중(매수 LED 주황 · 매도 · 취소 「… · 후매수 발동」 · 배너 · 「서버 반영 완료」 없음) → 3 소진(요약 「3회 · 남은 0회」 · 펼치면 안내 원문) (D-11 · D-12 · D-15 · Pitfall 8) (D-38 80%)', async ({
    page,
  }) => {
    // 선매수를 켜 둔다 — 단계 3(후매수 OFF)이 서버 접힘 하강 전이(D-02 후반)를 만들지 않게 이 케이스를 가른다.
    const seed = {
      buyEnabled: true,
      preBuyEnabled: true,
      sellEnabled: true,
      sellEntryLatched: true,
      cancelQtyEnabled: true,
      postBuyEnabled: true,
      postBuyOrderAmount: 4000,
      postBuyReentry: 3,
      postBuyReentryLeft: 3,
      postBuyReboundPct: 30,
      postBuyFloorQty: 100_000,
      postBuyPhase: 1,
      // 사람 값(cfg) — 스텁 기본값과 같다. 재진입 에코 · 사람 값 유지 발동이 되돌려 보내는 값.
      sellWatchQty: 10,
      cancelWatchQty: 25,
    };
    relay.seedLimitChasers([seed]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcGroupStatus(card, 'post-buy')).toHaveText('감시 중', { timeout: 15_000 });
    const buyLed = card.locator('[data-slot="card-header"] [data-slot="latch-led"][data-kind="buy"]');
    await expect(buyLed).toHaveAttribute('data-tone', 'armed');

    // 단계 2 — 서버가 매도 · 취소 값을 override 한다(게이트 ON · 발동잔량 330,000). 서버 귀속이라 배너 · 반영 줄 없음.
    //   D-38 — 서버 override = 발동잔량 × 80%(330,000 → 264,000) · 웹은 에코 값 그대로(계산하지 않는다).
    const before = lcSetCount(relay);
    await relay.pushLimitChaserEcho({
      ...seed,
      postBuyPhase: 2,
      postBuyTriggerQty: 330_000,
      postBuyReentryLeft: 2,
      sellWatchQty: 264_000,
      cancelWatchQty: 264_000,
    });
    await expect(lcGroupStatus(card, 'post-buy')).toHaveText('보유중', { timeout: 15_000 });
    await expect(buyLed).toHaveAttribute('data-tone', 'latent');
    await expect(buyLed).toContainText('보유중');
    await expect(lcGroupStatus(card, 'buy')).toHaveText('보유중');
    await expect(lcGroupStatus(card, 'sell')).toHaveText(/ · 후매수 발동$/);
    await expect(lcGroupStatus(card, 'cancel')).toHaveText(/ · 후매수 발동$/);
    await expect(lcValue(page, 'lc-sell-watch-qty')).toHaveText('264,000주');
    await expect(lcValue(page, 'lc-cancel-watch-qty')).toHaveText('264,000주');

    // 재진입(단계 2 → 1) — 서버가 두 잔량을 cfg(사람 값)로 되돌려 보낸다 · 잔여 2.
    await relay.pushLimitChaserEcho({ ...seed, postBuyPhase: 1, postBuyTriggerQty: 0, postBuyReentryLeft: 2 });
    await expect(lcGroupStatus(card, 'post-buy')).toHaveText('감시 중', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-sell-watch-qty')).toHaveText('10주');
    await expect(lcValue(page, 'lc-cancel-watch-qty')).toHaveText('25주');

    // 두 번째 발동(단계 1 → 2 · 잔여 1) — D-38 사람 값 유지: 잔고가 있어 매도 호가잔량은 사람 값(10) 그대로,
    //   매수 미체결이 없어 취소잔량은 발동잔량 × 80%(264,000). 웹은 두 값을 에코 그대로 보인다.
    await relay.pushLimitChaserEcho({
      ...seed,
      postBuyPhase: 2,
      postBuyTriggerQty: 330_000,
      postBuyReentryLeft: 1,
      cancelWatchQty: 264_000,
    });
    await expect(lcGroupStatus(card, 'post-buy')).toHaveText('보유중', { timeout: 15_000 });
    await expect(lcGroupStatus(card, 'cancel')).toHaveText(/ · 후매수 발동$/);
    await expect(lcValue(page, 'lc-sell-watch-qty')).toHaveText('10주');
    await expect(lcValue(page, 'lc-cancel-watch-qty')).toHaveText('264,000주');

    // 단계 3 — 소진(후매수 OFF · 잔여 0). 접힌 카드는 상태 「소진」 + 요약 「3회 · 남은 0회」, 펼치면 안내 원문.
    await relay.pushLimitChaserEcho({
      ...seed,
      postBuyEnabled: false,
      postBuyPhase: 3,
      postBuyReentryLeft: 0,
      postBuyTriggerQty: 0,
    });
    await expect(lcGroupStatus(card, 'post-buy')).toHaveText('소진', { timeout: 15_000 });
    // 발동 · 재진입 에코의 부재 단언은 단계 3 의 후매수 해제 전이 로그 줄 뒤에 한다(GC-IN-04) — 앞선 에코가 반영 줄을
    // 세웠다면 로그에 남아 이 시점에 잡힌다.
    const rows = await logRows(page);
    await expect(rows.filter({ hasText: '후매수 무장 해제' })).toHaveCount(1, { timeout: 15_000 });
    await expect(rows.filter({ hasText: '서버 반영 완료' })).toHaveCount(0);
    expect(lcSetCount(relay), '서버 단계 에코는 제출을 만들지 않는다').toBe(before);
    const postSummary = card.locator('[data-slot="lc-group-post-buy"] [data-slot="lc-group-summary"]');
    await expect(postSummary).toContainText('3회 · 남은 0회');
    await expect(card.locator('[data-slot="lc-post-buy-exhausted"]')).toHaveCount(0);
    await expandLcGroup(card, 'post-buy');
    await expect(card.locator('[data-slot="lc-post-buy-exhausted"]')).toHaveText(
      '소진 — 「최대」에 횟수를 넣고 다시 켜면 그 값부터 세요',
    );
    await expect(lcValue(page, 'lc-post-buy-reentry')).toHaveText('3회 · 남은 0회');
    await expect(buyLed).not.toHaveAttribute('data-tone', 'latent');
  });

  /*
    ★ Phase 24 (24-08) P24-7 — UI-SPEC 「검증 훅」 폭 불변식 + UI Considerations backstop(E1 overflow · E1 long-text ·
      E3 overflow)을 한 케이스에서 잰다. P20-3 과 다른 점: 판정 범위가 **우측 설정 패널**(`card-body-options`)이다 —
      카드 헤더 `<b>삼성전자</b>` 넘침(deferred-items 기존 실패)은 이 phase 밖이라 이 케이스를 막지 않게 한다.
      · 펼침: 패널 scrollWidth ≤ clientWidth · 잘림 두 판정(`scrollOverflowing` · `leavesOverflowing`) · 행마다 가장
        오른쪽 잎이 행 안쪽 끝 이내 · 말줄임(text-overflow ellipsis · truncate) 0 · 행 44px · 접기 버튼 ≥ 32px.
      · 접힘: 요약 줄이 여러 줄이어도 scrollHeight ≤ clientHeight · kv 가 요약 줄 오른쪽 끝을 넘지 않는다(E3).
      · 흐림: 꺼진 그룹 행의 글자는 누적 opacity 0.45(한 겹 · 0.2025 아님) · 원형 체크 · 스위치 · 접기 버튼 1.
      · 폰 밴드 긴 상태 문구(E1 long-text): 「켜짐 · 켠 매수 없음」 · 「무장 · 대기 · 후매수 발동」은 제목 옆 흐름의
        둘째 줄 · 말줄임 0 · 스위치는 헤더 오른쪽 끝.
  */
  test(`P24-7 폭 최악값 × 본문 344 · ${LC_COMPACT_MIN} · 830 · 992 — 패널 넘침 0 · 라벨 · 값 · 요약 잘림 0 · 말줄임 0 · 행 44 · 접기 버튼 ≥32 · 흐림 한 겹 0.45 · 폰 밴드 긴 상태 문구 둘째 줄 (UI-SPEC 검증 훅 · E1 overflow · E1 long-text · E3 overflow)`, async ({
    page,
  }) => {
    const WORST = {
      buyEnabled: true,
      sellEnabled: true,
      sellEntryLatched: true,
      cancelQtyEnabled: true,
      buyOrderPrice: 1_274_000,
      buyWatchPrice: 1_274_000,
      sweepWatchPrice: 1_274_000,
      sellOrderPrice: 1_274_000,
      sellWatchPrice: 1_274_000,
      buyOrderAmount: 9_999,
      buyWatchQty: 100_000,
      sellWatchQty: 100_000,
      cancelWatchQty: 100_000,
      buyMinTradeQty: 100_000,
      sellMinTradeQty: 100_000,
      sellQtyTrackBaseline: 100_000,
      preBuyEnabled: true,
      buyTradeQtyEnabled: true,
      sweepEnabled: true,
      sweepMinTickCount: 255,
      extraBuyEnabled: true,
      extraBuyOrderAmount: 9_999,
      extraBuyMinQty: 17_700_000,
      extraBuyMaxQty: 177_000_000,
      postBuyEnabled: true,
      postBuyOrderAmount: 9_999,
      postBuyReentry: 3,
      postBuyReentryLeft: 3,
      postBuyPhase: 1,
      postBuyFloorQty: 17_700_000,
      postBuyReboundPct: 100,
      postBuyTriggerQty: 330_000,
      // quick-260929-vzy — 후매수 제목줄 「자동」 체크(켜짐 = 라벨 가장 진한 상태).
      postBuyAuto: true,
      // quick-261011-0yb — 줄매수 제목줄 「자동」 체크도 켜짐(두 제목줄을 같은 단언으로 잰다).
      extraBuyAuto: true,
      // Phase 27 — 자동매도 카드 최악값: 시작조건 의미어(가장 긴 값) · 방법 「매수1호가」 · 칩 「매도중」 · 누적 · 기준 큰 수.
      autoSellEnabled: true,
      autoSellStartCond: 0,
      autoSellRatioPct: 50,
      autoSellMethod: 2,
      autoSellState: 3,
      autoSellSoldQty: 177_000_000,
      autoSellBasis: 2,
      autoSellBasisPrice: 1_274_000,
    };
    relay.seedLimitChasers([WORST]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-order-price')).toHaveText('1,274,000원', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-extra-buy-max-qty')).toHaveText('177,000,000주');
    await expect(lcValue(page, 'lc-extra-buy-min-qty')).toHaveText('17,700,000주');
    await expect(lcValue(page, 'lc-post-buy-reentry')).toHaveText('3회 · 남은 3회');
    await expect(lcValue(page, 'lc-sweep-tick')).toHaveText('255건');

    const OPTIONS_SEL = `${cardSelector(E2E_ISIN)} [data-slot="card-body-options"]`;
    const options = card.locator('[data-slot="card-body-options"]');
    const FOLD_SLOTS = ['pre-buy', 'extra-buy', 'post-buy', 'auto-sell'] as const;
    const setAllFolds = async (expanded: boolean) => {
      for (const slot of FOLD_SLOTS) {
        const fold = card.locator(`[data-slot="lc-group-${slot}"] [data-slot="lc-group-fold"]`);
        // 폰 밴드는 탭당 한 pane — 숨은 pane 의 접기 버튼은 그 탭을 열 때 맞춘다(자동매도 = 매도 pane).
        if (!(await fold.isVisible())) continue;
        if ((await fold.getAttribute('aria-expanded')) !== String(expanded)) await fold.click();
        await expect(fold).toHaveAttribute('aria-expanded', String(expanded));
      }
    };

    /** 펼친 패널 — 넘침 · 행 · 접기 버튼 · 말줄임. 폭 여유(행 안쪽 폭 − 내용 폭)의 최솟값을 돌려준다. */
    const measureExpanded = () =>
      page.evaluate((sel) => {
        const panel = document.querySelector<HTMLElement>(sel)!;
        const vis = (el: Element) => el.getClientRects().length > 0;
        const rows = Array.from(
          panel.querySelectorAll<HTMLElement>(
            '[data-lc-field], [data-slot="lc-check-row"], [data-slot="lc-derived"], [data-slot="lc-post-buy-trigger"], [data-slot="lc-auto-sell-sold"], [data-slot="lc-auto-sell-basis"]',
          ),
        )
          .filter(vis)
          .map((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const inner = r.right - parseFloat(cs.paddingRight);
            let right = r.left;
            for (const leaf of Array.from(el.querySelectorAll<HTMLElement>('*'))) {
              const lr = leaf.getBoundingClientRect();
              if (leaf.getClientRects().length === 0 || lr.width === 0) continue;
              right = Math.max(right, lr.right);
            }
            const kids = Array.from(el.children).filter((c) => c.getClientRects().length > 0);
            const contentW = kids.reduce((sum, c) => {
              const range = document.createRange();
              range.selectNodeContents(c);
              return sum + range.getBoundingClientRect().width;
            }, 0);
            const gap = parseFloat(cs.columnGap) || 0;
            const innerW = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            return {
              what: el.getAttribute('data-lc-field') ?? el.getAttribute('data-slot') ?? '?',
              text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28),
              h: Math.round(r.height * 100) / 100,
              slack: Math.round((inner - right) * 10) / 10,
              free: Math.round((innerW - contentW - gap * Math.max(0, kids.length - 1)) * 10) / 10,
              pieces: kids.length,
            };
          });
        const folds = Array.from(panel.querySelectorAll<HTMLElement>('[data-slot="lc-group-fold"]'))
          .filter(vis)
          .map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);
        const ellipsis = Array.from(panel.querySelectorAll<HTMLElement>('*'))
          .filter(vis)
          .filter(
            (el) =>
              getComputedStyle(el).textOverflow === 'ellipsis' ||
              el.classList.contains('truncate') ||
              el.classList.contains('text-ellipsis'),
          )
          .map((el) => (el.textContent ?? '').slice(0, 24));
        return { over: panel.scrollWidth - panel.clientWidth, right: panel.getBoundingClientRect().right, rows, folds, ellipsis };
      }, OPTIONS_SEL);

    /** 접힌 요약 줄 — 줄 수 · 세로/가로 넘침 · kv 가 요약 줄 오른쪽 끝을 넘는가. */
    const measureSummaries = () =>
      page.evaluate((sel) => {
        const panel = document.querySelector<HTMLElement>(sel)!;
        return Array.from(panel.querySelectorAll<HTMLElement>('[data-slot="lc-group-summary"]'))
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => {
            const box = el.getBoundingClientRect();
            const kvs = Array.from(el.children) as HTMLElement[];
            const tops = new Set(kvs.map((k) => Math.round(k.getBoundingClientRect().top)));
            const section = el.closest('section')!;
            return {
              slot: section.getAttribute('data-slot') ?? '?',
              lines: tops.size,
              overY: el.scrollHeight - el.clientHeight,
              overX: el.scrollWidth - el.clientWidth,
              kvOut: kvs
                .filter((k) => k.getBoundingClientRect().right > box.right + 0.5 || k.scrollWidth > k.clientWidth + 1)
                .map((k) => (k.textContent ?? '').trim()),
              belowCard: Math.round(box.bottom - section.getBoundingClientRect().bottom),
            };
          });
      }, OPTIONS_SEL);

    const minFree: Record<number, { what: string; free: number }> = {};
    const summaryLines: Record<number, string> = {};
    const checkExpanded = async (target: number, label: string) => {
      await page.mouse.move(1, 1);
      const m = await measureExpanded();
      expect(m.over, `${label} — 패널 scrollWidth ≤ clientWidth`).toBeLessThanOrEqual(0);
      expect(await scrollOverflowing(page, OPTIONS_SEL), `${label} — 내용이 상자를 넘친 요소`).toEqual([]);
      expect(await leavesOverflowing(options, m.right), `${label} — 패널 밖으로 밀린 잎 요소`).toEqual([]);
      expect(m.ellipsis, `${label} — 말줄임 0(오발주 불변식)`).toEqual([]);
      expect(m.rows.filter((r) => Math.abs(r.h - 44) > 0.5), `${label} — 44px 이 아닌 행`).toEqual([]);
      expect(m.rows.filter((r) => r.slack < -0.5), `${label} — 행 안쪽 끝을 넘은 잎(잘림)`).toEqual([]);
      const measurable = m.rows.filter((r) => r.pieces >= 2);
      expect(measurable.filter((r) => r.free < -0.5), `${label} — 라벨 + 값이 행 안쪽 폭을 넘는 행`).toEqual([]);
      expect(m.folds.filter((h) => h < 32), `${label} — 접기 버튼 높이 ≥ 32`).toEqual([]);
      if (measurable.length > 0) {
        const worst = measurable.reduce((a, b) => (b.free < a.free ? b : a));
        const prev = minFree[target];
        if (prev === undefined || worst.free < prev.free) {
          minFree[target] = { what: `${worst.what}「${worst.text}」`, free: worst.free };
        }
      }
      return m.rows.map((r) => r.what);
    };
    const checkCollapsed = async (target: number, label: string, count: number) => {
      await setAllFolds(false);
      const sums = await measureSummaries();
      expect(sums, `${label} — 보이는 접힌 요약 줄 ${count}개`).toHaveLength(count);
      for (const s of sums) {
        expect(s.overY, `${label} ${s.slot} — 요약 세로 넘침`).toBeLessThanOrEqual(0);
        expect(s.overX, `${label} ${s.slot} — 요약 가로 넘침`).toBeLessThanOrEqual(0);
        expect(s.kvOut, `${label} ${s.slot} — 요약 kv 잘림`).toEqual([]);
        expect(s.belowCard, `${label} ${s.slot} — 요약이 카드 밖`).toBeLessThanOrEqual(0);
      }
      expect(await scrollOverflowing(page, OPTIONS_SEL), `${label} — 접힘 넘침`).toEqual([]);
      const lines = sums.map((s) => `${s.slot.replace('lc-group-', '')} ${s.lines}줄`).join(' · ');
      // 폰 밴드는 매수 · 매도 pane 을 따로 잰다 — 덮지 않고 잇는다.
      summaryLines[target] = summaryLines[target] === undefined ? lines : `${summaryLines[target]} · ${lines}`;
      await setAllFolds(true);
    };

    /**
     * 제목줄 「자동」(후매수 quick-260929-vzy D-05 · 줄매수 quick-261011-0yb) — 넘침 0 · 「자동」 라벨 잘림 0 · 체크 높이 ≥ 32 ·
     * 스위치가 마지막 자식이고 오른쪽 끝. 넘치면 `GroupHeaderCheck` 쪽(간격 · 패딩 · 라벨)만 고친다 — 스위치 크기 · 위치는
     * 오터치 방어다(Phase 16 D-05).
     */
    const headerChecks: Record<string, string> = {};
    const checkHeaderCheck = async (slot: 'post-buy' | 'extra-buy', word: string, target: number, label: string) => {
      const h = await page.evaluate(([sel, s, w]) => {
        const header = document.querySelector<HTMLElement>(`${sel} [data-slot="lc-group-${s}"] [data-slot="lc-group-header"]`)!;
        const check = header.querySelector<HTMLElement>('[data-slot="lc-group-header-check"]')!;
        const last = header.lastElementChild as HTMLElement;
        const cr = check.getBoundingClientRect();
        const sr = last.getBoundingClientRect();
        const title = Array.from(header.querySelectorAll<HTMLElement>('span')).find((e) => e.textContent === w);
        return {
          titleRects: title?.getClientRects().length ?? -1,
          headerOver: header.scrollWidth - header.clientWidth,
          checkOver: check.scrollWidth - check.clientWidth,
          checkH: Math.round(cr.height * 10) / 10,
          checkW: Math.round(cr.width * 10) / 10,
          lastRole: last.getAttribute('role'),
          switchRight: sr.right,
          checkRight: cr.right,
          headerRight: header.getBoundingClientRect().right,
        };
      }, [OPTIONS_SEL, slot, word] as const);
      expect(h.headerOver, `${label} — ${word} 제목줄 넘침 0`).toBeLessThanOrEqual(0);
      // 제목 낱말이 갈리지 않는다(「후매 / 수」 — 체크가 흐름 폭을 먹으면 break-word 가 낱말 안에서 끊는다).
      expect(h.titleRects, `${label} — 「${word}」 한 덩어리`).toBe(1);
      expect(h.checkOver, `${label} — 「자동」 라벨 잘림 0`).toBeLessThanOrEqual(0);
      expect(h.checkH, `${label} — 「자동」 체크 높이 ≥ 32`).toBeGreaterThanOrEqual(32);
      expect(h.lastRole, `${label} — 스위치가 제목줄 마지막 자식`).toBe('switch');
      expect(h.switchRight, `${label} — 스위치가 체크보다 오른쪽`).toBeGreaterThanOrEqual(h.checkRight);
      expect(h.switchRight, `${label} — 스위치가 제목줄 오른쪽 끝 안`).toBeLessThanOrEqual(h.headerRight + 0.5);
      headerChecks[`${target} ${word}`] = `체크 ${h.checkW}×${h.checkH}`;
    };

    const setsBefore = lcSetCount(relay);
    for (const target of [344, LC_COMPACT_MIN, 830, 992]) {
      await sizeCardTo(page, E2E_ISIN, target);
      const { band } = await cardMetrics(page, E2E_ISIN);
      expect(band, `카드 ${target} — 기대 밴드`).toBe(bandOfWidth(target));
      await setAllFolds(true);
      if (bandOfWidth(target) === 'phone') {
        const tablist = card.getByRole('tablist', { name: '주문 진입' });
        await tablist.getByRole('tab', { name: '매수' }).click();
        await expect(card.locator('[data-pane="buy"]')).toBeVisible();
        const buyRows = await checkExpanded(target, `${target} 매수 pane`);
        expect(buyRows).toContain('lc-post-buy-trigger');
        await checkHeaderCheck('post-buy', '후매수', target, `${target} 매수 pane`);
        await checkHeaderCheck('extra-buy', '줄매수', target, `${target} 매수 pane`);
        await checkCollapsed(target, `${target} 매수 pane`, 3);
        await tablist.getByRole('tab', { name: '매도' }).click();
        await expect(card.locator('[data-pane="sell"]')).toBeVisible();
        await setAllFolds(true);
        const sellRows = await checkExpanded(target, `${target} 매도 pane`);
        expect(sellRows).toEqual(expect.arrayContaining(['lc-derived', 'lc-auto-sell-method', 'lc-auto-sell-basis']));
        await checkCollapsed(target, `${target} 매도 pane`, 1);
        await tablist.getByRole('tab', { name: '매수' }).click();
      } else {
        await expect(card.locator('[data-pane="sell"]')).toBeVisible();
        const rows = await checkExpanded(target, `${target} 2열`);
        expect(rows).toEqual(
          expect.arrayContaining(['lc-post-buy-trigger', 'lc-derived', 'lc-extra-buy-max-qty', 'lc-auto-sell-method', 'lc-auto-sell-basis']),
        );
        await checkHeaderCheck('post-buy', '후매수', target, `${target} 2열`);
        await checkHeaderCheck('extra-buy', '줄매수', target, `${target} 2열`);
        await checkCollapsed(target, `${target} 2열`, 4);
      }
    }
    expect(lcSetCount(relay), '재는 동안 전송 0').toBe(setsBefore);
    test.info().annotations.push({
      type: 'P24-7 행 최소 여유(px)',
      description: Object.entries(minFree)
        .map(([k, v]) => `${k}: ${v.free} (${v.what})`)
        .join(' · '),
    });
    test.info().annotations.push({
      type: 'P24-7 제목줄 「자동」(후매수 · 줄매수)',
      description: Object.entries(headerChecks)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · '),
    });
    test.info().annotations.push({
      type: 'P24-7 접힌 요약 줄 수',
      description: Object.entries(summaryLines)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' / '),
    });

    // ── 흐림 한 겹(UI-SPEC §9 · R10) — 992 두 열 · 선매수 · 줄매수를 서버 에코로 끈다(후매수는 켜 둔다 → 하강 전이 아님).
    await relay.pushLimitChaserEcho({ ...WORST, preBuyEnabled: false, extraBuyEnabled: false });
    await expect(lcSwitch(card, '선매수 켜기')).not.toBeChecked({ timeout: 15_000 });
    await expect(lcSwitch(card, '줄매수 켜기')).not.toBeChecked();
    await setAllFolds(true);
    await page.mouse.move(1, 1);
    const dimOf = (slot: string) =>
      page.evaluate(
        ([sel, s]) => {
          const section = document.querySelector<HTMLElement>(`${sel} [data-slot="lc-group-${s}"]`)!;
          const cum = (el: Element) => {
            let p = 1;
            for (let e: Element | null = el; e !== null; e = e.parentElement) p *= parseFloat(getComputedStyle(e).opacity);
            return Math.round(p * 10_000) / 10_000;
          };
          const vis = (el: Element) => el.getClientRects().length > 0;
          const rows = section.querySelector('[data-slot="lc-group-rows"]')!;
          const texts = Array.from(rows.querySelectorAll('*'))
            .filter(vis)
            .filter((el) => el.closest('.sr-only') === null)
            .filter((el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== ''))
            .map((el) => ({ text: (el.textContent ?? '').trim().slice(0, 20), cum: cum(el) }));
          const own45 = Array.from(rows.querySelectorAll('*')).filter((el) => getComputedStyle(el).opacity === '0.45').length;
          return {
            texts,
            own45,
            circles: Array.from(section.querySelectorAll('[data-slot="lc-check-circle"]')).map(cum),
            switches: Array.from(section.querySelectorAll('[role="switch"]')).map(cum),
            folds: Array.from(section.querySelectorAll('[data-slot="lc-group-fold"]')).map(cum),
          };
        },
        [OPTIONS_SEL, slot] as const,
      );
    for (const slot of ['pre-buy', 'extra-buy']) {
      const d = await dimOf(slot);
      expect(d.texts.length, `${slot} — 흐린 행 글자`).toBeGreaterThan(0);
      expect(
        d.texts.filter((t) => Math.abs(t.cum - 0.45) > 0.005),
        `${slot} — 꺼진 그룹 행 글자의 누적 opacity 는 0.45(한 겹 · 0.2025 아님)`,
      ).toEqual([]);
      expect(d.own45, `${slot} — computed opacity 0.45 요소가 있다`).toBeGreaterThan(0);
      expect(d.switches, `${slot} — 그룹 스위치는 흐리지 않는다`).toEqual([1]);
      expect(d.folds, `${slot} — 접기 버튼은 흐리지 않는다`).toEqual([1]);
      expect(d.circles.filter((c) => c !== 1), `${slot} — 원형 체크는 흐리지 않는다`).toEqual([]);
    }
    const lit = await dimOf('post-buy');
    expect(lit.texts.filter((t) => t.cum !== 1), '켜진 그룹(후매수) 행 글자는 흐리지 않는다').toEqual([]);
    const preCircles = (await dimOf('pre-buy')).circles;
    expect(preCircles.length, '선매수 카드 원형 체크(체결량 · 한방)').toBeGreaterThanOrEqual(2);

    // ── 폰 밴드 긴 상태 문구(E1 long-text) — 제목 옆 흐름의 둘째 줄 · 말줄임 0 · 스위치 헤더 오른쪽 끝.
    const headerOf = (slot: string) =>
      page.evaluate(
        ([sel, s]) => {
          const hdr = document.querySelector<HTMLElement>(`${sel} [data-slot="lc-group-${s}"] [data-slot="lc-group-header"]`)!;
          const status = hdr.querySelector<HTMLElement>('[data-slot="lc-group-status"]')!;
          const flow = status.parentElement!;
          const title = flow.firstElementChild as HTMLElement;
          const sw = hdr.querySelector<HTMLElement>('[role="switch"]')!;
          const hr = hdr.getBoundingClientRect();
          const cs = getComputedStyle(hdr);
          const t = title.getBoundingClientRect();
          const rects = Array.from(status.getClientRects());
          // 상태 글자의 **줄** — inline-block 상자 하나가 아니라 글자 범위의 줄 상자로 센다.
          const range = document.createRange();
          range.selectNodeContents(status);
          const lineTops = new Set(
            Array.from(range.getClientRects())
              .filter((r) => r.width > 0)
              .map((r) => Math.round(r.top)),
          );
          const splitSegments = Array.from(status.querySelectorAll('span'))
            .filter((sp) => new Set(Array.from(sp.getClientRects()).map((r) => Math.round(r.top))).size > 1)
            .map((sp) => sp.textContent);
          return {
            text: status.textContent,
            titleTop: t.top,
            titleBottom: t.bottom,
            statusFirstTop: rects[0]!.top,
            statusLines: lineTops.size,
            splitSegments,
            flowOverX: flow.scrollWidth - flow.clientWidth,
            ellipsis: [status, flow].some((el) => getComputedStyle(el).textOverflow === 'ellipsis'),
            switchRight: Math.round(sw.getBoundingClientRect().right * 10) / 10,
            switchLeft: sw.getBoundingClientRect().left,
            flowRight: flow.getBoundingClientRect().right,
            headerInnerRight: Math.round((hr.right - parseFloat(cs.paddingRight)) * 10) / 10,
            headerH: Math.round(hr.height * 10) / 10,
            statusW: Math.round(rects[0]!.width * 10) / 10,
            flowW: flow.clientWidth,
          };
        },
        [OPTIONS_SEL, slot] as const,
      );
    const expectSecondLine = async (slot: string, text: string) => {
      await expect(lcGroupStatus(card, slot as 'buy')).toHaveText(text, { timeout: 15_000 });
      const h = await headerOf(slot);
      expect(h.statusFirstTop, `${text} — 제목 옆 흐름의 둘째 줄 ${JSON.stringify(h)}`).toBeGreaterThanOrEqual(h.titleBottom - 1);
      // 흐름 폭보다 길면 덩어리 안에서 「 · 」 조각 경계에서만 줄바꿈한다(낱말이 갈리지 않는다).
      expect(h.statusLines, `${text} — 상태 문구 줄 수`).toBeLessThanOrEqual(2);
      expect(h.splitSegments, `${text} — 조각 안에서 줄바꿈 0`).toEqual([]);
      expect(h.flowOverX, `${text} — 흐름 가로 넘침 0`).toBeLessThanOrEqual(0);
      expect(h.ellipsis, `${text} — 말줄임 0`).toBe(false);
      expect(Math.abs(h.switchRight - h.headerInnerRight), `${text} — 스위치는 헤더 오른쪽 끝`).toBeLessThanOrEqual(1);
      expect(h.switchLeft, `${text} — 스위치는 흐름 오른쪽`).toBeGreaterThanOrEqual(h.flowRight - 0.5);
      test.info().annotations.push({ type: `P24-7 폰 밴드 상태 「${text}」`, description: `헤더 ${h.headerH}px · 상태 ${h.statusLines}줄 · 상태 폭 ${h.statusW} / 흐름 폭 ${h.flowW}px` });
    };
    // 「켜짐 · 켠 매수 없음」 — 매도 · 취소 게이트 전부 OFF 인 첫 스냅샷(가드 상태 · 자동 끔이 나가지 않는다).
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await sizeCardTo(page, E2E_ISIN, 344);
    await card.getByRole('tablist', { name: '주문 진입' }).getByRole('tab', { name: '매수' }).click();
    await expectSecondLine('buy', '켜짐 · 켠 매수 없음');
    // 「무장 · 대기 · 후매수 발동」 — 매도 진입 래치 전(대기) · 후매수 보유중.
    relay.seedLimitChasers([
      {
        buyEnabled: true,
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
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await sizeCardTo(page, E2E_ISIN, 344);
    await card.getByRole('tablist', { name: '주문 진입' }).getByRole('tab', { name: '매도' }).click();
    await expectSecondLine('sell', '무장 · 대기 · 후매수 발동');
    expect(await scrollOverflowing(page, OPTIONS_SEL), '344 매도 pane — 긴 상태 문구 넘침').toEqual([]);
  });

  test('P24-8 폰 한 화면 — 390×844 · D-04 기본값 · 후매수 감시 중 · 세 카드 접힘 → 매수 탭(탭 줄 위 ~ 후매수 카드 아래) ≤ 660px (UI-SPEC E1 overflow backstop)', async ({
    page,
  }) => {
    // D-04 기본값 + D-17 시딩값(스텁 상장주식수 5,969,782,550 → 0.3% 17,909,347 · 3% 179,093,476) + 가격 = 상한가.
    relay.seedLimitChasers([
      {
        buyEnabled: true,
        buyOrderPrice: 127_400,
        buyWatchPrice: 127_400,
        sweepWatchPrice: 127_400,
        sellOrderPrice: 127_400,
        sellWatchPrice: 127_400,
        buyOrderAmount: 4000,
        buyWatchQty: 17_909_347,
        buyMinTradeQty: 17_909_347,
        sellMinTradeQty: 17_909_347,
        sellWatchQty: 10,
        sellQtyTrackRatio: 55,
        sellOrderRatio: 100,
        cancelWatchQty: 10,
        sweepMinTickCount: 3,
        extraBuyOrderAmount: 4000,
        extraBuyMinQty: 17_909_347,
        extraBuyMaxQty: 179_093_476,
        postBuyEnabled: true,
        postBuyPhase: 1,
        postBuyOrderAmount: 4000,
        postBuyReentry: 3,
        postBuyReentryLeft: 3,
        postBuyReboundPct: 30,
        postBuyFloorQty: 100_000,
      },
    ]);
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('17,909,347주', { timeout: 15_000 });
    await expect(lcGroupStatus(card, 'post-buy')).toHaveText('감시 중');
    const tablist = card.getByRole('tablist', { name: '주문 진입' });
    await tablist.getByRole('tab', { name: '매수' }).click();
    await expect(card.locator('[data-pane="buy"]')).toBeVisible();
    for (const slot of ['pre-buy', 'extra-buy', 'post-buy'] as const) {
      await expect(card.locator(`[data-slot="lc-group-${slot}"] [data-slot="lc-group-fold"]`)).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    }
    const m = await card.evaluate((root) => {
      const tl = root.querySelector('[role="tablist"][aria-label="주문 진입"]')!.getBoundingClientRect();
      const h = (slot: string) =>
        Math.round(root.querySelector(`[data-pane="buy"] [data-slot="lc-group-${slot}"]`)!.getBoundingClientRect().height);
      const post = root.querySelector('[data-pane="buy"] [data-slot="lc-group-post-buy"]')!.getBoundingClientRect();
      return {
        total: Math.round(post.bottom - tl.top),
        buy: h('buy'),
        pre: h('pre-buy'),
        extra: h('extra-buy'),
        post: h('post-buy'),
        cardWidth: (root as HTMLElement).clientWidth,
      };
    });
    test.info().annotations.push({
      type: 'P24-8 폰 한 화면(px)',
      description: `탭 줄 위 ~ 후매수 카드 아래 ${m.total} (≤ 660) · 매수주문 ${m.buy} · 선매수 ${m.pre} · 줄매수 ${m.extra} · 후매수 ${m.post} · 카드 폭 ${m.cardWidth}`,
    });
    expect(m.total, `매수 탭 한 화면 — ${JSON.stringify(m)}`).toBeLessThanOrEqual(660);
  });

  /*
    ★ 24-10 WR-01(24-VERIFICATION 갭 1) — 선매수를 쓰지 않는 buy3 후매수 전용 전략(에코 선매수 금액 0 · `buy3Schema` 1)이
      첫 마운트에서도, 새로고침 뒤에도 값 확정을 보낸다. 레거시 금액 특례(「서버가 모른다」)는 구서버 에코에서만 걸린다.
      진짜 브라우저 → 진짜 relay → 스텁 게이트웨이 10 수신이 증거다. 스텁 계좌 · ISIN 픽스처 상수만 쓴다.
  */
  test('P24-9 WR-01 — 선매수 금액 0(buy3) 후매수 전용 전략: 첫 마운트 · 새로고침 뒤 값 확정이 게이트웨이 10 에 닿는다 · 「주문금액을 먼저 입력해 주세요」 없음', async ({
    page,
  }) => {
    const AMOUNT_FIRST = '주문금액을 먼저 입력해 주세요';
    // `buy3Schema` 는 픽스처 기본 1(buy3 서버 에코). 후매수 수량 563 = floor(4000 × 10000 / 71,000) — 스텁 주문가격 기준 웹 산출값.
    const seed = {
      buyEnabled: true,
      postBuyEnabled: true,
      sellEnabled: true,
      buyOrderAmount: 0,
      buyOrderQty: 0,
      postBuyOrderAmount: 4000,
      postBuyOrderQty: 563,
      postBuyReentry: 3,
      postBuyReentryLeft: 3,
      postBuyReboundPct: 30,
      postBuyFloorQty: 100_000,
      postBuyPhase: 1,
    };
    relay.seedLimitChasers([seed]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcSwitch(card, '후매수 켜기')).toBeChecked({ timeout: 15_000 });
    // 선매수 금액 0 = 미입력(D-03) — 폼 기본 금액(4,000만원)으로 메우지 않는다.
    await expect(lcValue(page, 'lc-buy-order-amount')).toHaveText('—');

    // (a) 첫 마운트 — 후매수 반등 확정 = 10 정확히 1건.
    const before = lcSetCount(relay);
    await editLc(page, 'lc-post-buy-rebound', '40');
    await waitForSetAtGateway(relay, before + 1);
    const first = lcSetRequests(relay).at(-1)!;
    expect(first.postBuyReboundPct).toBe(40);
    expect(first.buyOrderQty, '선매수 수량은 에코의 0 그대로').toBe(0);
    expect(first.postBuyOrderQty, '후매수 수량 = 웹 산출값(스텁 주문가격 기준)').toBe(563);
    expect(first.postBuyEnabled).toBe(true);
    expect(first.buyEnabled).toBe(true);
    await expect(page.getByText(AMOUNT_FIRST)).toHaveCount(0);

    // 그 확정의 에코 → 행이 40% 로 선다(값 필드는 에코 전까지 서버 값).
    const echoed = { ...seed, postBuyReboundPct: 40 };
    await relay.pushLimitChaserEcho(echoed);
    await expect(lcValue(page, 'lc-post-buy-rebound')).toHaveText('40%', { timeout: 15_000 });
    expect(lcSetCount(relay), '첫 확정 = 10 정확히 1건').toBe(before + 1);

    // (b) 새로고침 — 새로 마운트한 폼에서도 후매수 최소 잔량 확정이 10 한 건 더 나간다.
    relay.seedLimitChasers([echoed]);
    await page.reload();
    await waitForReady(page);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-post-buy-rebound')).toHaveText('40%', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-order-amount')).toHaveText('—');
    const beforeReload = lcSetCount(relay);
    await editLc(page, 'lc-post-buy-floor-qty', '200000');
    await waitForSetAtGateway(relay, beforeReload + 1);
    const second = lcSetRequests(relay).at(-1)!;
    expect(second.postBuyFloorQty).toBe(200_000);
    expect(second.postBuyReboundPct, '새로고침 뒤 cfg 기준값 = 서버 에코').toBe(40);
    expect(second.buyOrderQty).toBe(0);
    expect(second.postBuyEnabled).toBe(true);
    await expect(page.getByText(AMOUNT_FIRST)).toHaveCount(0);
  });

  /*
    ★ 24-12 WR-02(24-VERIFICATION 갭 2) — 구서버 에코(`buy3Schema 0`)는 끄기만 · 매수주문부터다. relay 는 `buy_watch_side`
      슬롯을 싣지 않고(24-03) 구서버는 그 부재를 "0" 으로 읽는다 — 매수가 켜진 채 cfg 를 다시 쓰면 「매수잔량 기준」 전략의
      감시 기준이 조용히 반대 호가로 뒤집힌다. 그래서 구서버에 닿는 웹 cfg 는 늘 매수가 꺼진 cfg 다(시드 `buyWatchSide: '1'`).
      ★ 전송 0 은 고정 대기로 재지 않는다 — 뒤이은 허용 확정의 10 이 게이트웨이에 보인 순간 누적이 정확히 +1 인 것으로
        증명한다(같은 소켓 · 송신 순서라 앞선 시도가 무언가 보냈다면 먼저 도착해 있다).
      진짜 브라우저 → 진짜 relay → 스텁 게이트웨이. 스텁 계좌 · ISIN 픽스처 상수만 쓴다.
  */
  test('P24-10 WR-02 — 구서버 에코(buy3Schema 0): 매수가 켜진 채 매도 끄기 = 전송 0 + 「구서버 전략이라 매수주문부터 꺼 주세요」 · 매수주문 끄기 = 10 한 건(buy_watch_side 슬롯 없음) · 이어서 매도 끄기 = 철거(crud D)', async ({
    page,
  }) => {
    const MASTER_FIRST = '구서버 전략이라 매수주문부터 꺼 주세요';
    const seed = { buy3Schema: 0, buyEnabled: true, sellEnabled: true, buyWatchSide: '1' };
    relay.seedLimitChasers([seed]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    const master = lcSwitch(card, '매수주문 켜기');
    const sell = lcSwitch(card, '매도주문 켜기');
    await expect(master).toBeChecked({ timeout: 15_000 });
    await expect(sell).toBeChecked();
    const submitError = card.locator('[data-slot="lc-submit-error"]');

    // (a) 매수가 켜진 채 매도 끄기 — 막힌다(문장 · 스위치 그대로). 전송 0 은 (b) 의 10 도착 시점 누적으로 증명한다.
    const before = lcSetCount(relay);
    await sell.click();
    await expect(submitError).toHaveText(MASTER_FIRST);
    await expect(sell).toBeChecked();

    // (b) 매수주문 끄기 — 구서버 에코에서도 늘 나간다(T-16-44). 그 10 이 보인 순간 누적 = 앞 기준 + 1.
    await master.click();
    await expect
      .poll(() => lcSetRequests(relay).filter((r) => r.buyEnabled === false).length, { timeout: 15_000 })
      .toBe(1);
    expect(lcSetCount(relay), '매도 끄기 시도 = 전송 0 · 매수주문 끄기 = 10 한 건').toBe(before + 1);
    const off = lcSetRequests(relay).at(-1)!;
    expect(off.buyEnabled).toBe(false);
    expect(off.sellEnabled, '매수주문 끄기는 매도를 건드리지 않는다').toBe(true);
    expect(off.buyWatchSide, 'relay 는 buy_watch_side 슬롯을 싣지 않는다(24-03) — 그래서 매수가 꺼진 cfg 만 보낸다').toBeNull();
    expect(off.crud).toBe('C');

    // (c) 마스터 OFF 에코 → 이제 매도 끄기가 나간다 — 게이트 4종 OFF = 철거(crud D). 완전 해제 경로가 열려 있다.
    await relay.pushLimitChaserEcho({ ...seed, ...lcEchoFlagsOf(off) });
    await expect(master).not.toBeChecked({ timeout: 15_000 });
    await sell.click();
    await expect
      .poll(() => lcSetRequests(relay).filter((r) => r.crud === 'D').length, { timeout: 15_000 })
      .toBe(1);
    expect(lcSetCount(relay), '매도 끄기(마스터 OFF 뒤) = 10 한 건 더').toBe(before + 2);
    const teardown = lcSetRequests(relay).at(-1)!;
    expect(teardown.buyEnabled).toBe(false);
    expect(teardown.sellEnabled).toBe(false);
    expect(teardown.buyWatchSide).toBeNull();
  });

  test('P24-11 WR-02 — 구서버 에코 화면: 매수주문 상태 「구서버 전략 · 끄기만 가능」 · 켜는 스위치 disabled · 「켤 수 없는 이유」 열 한 줄 · 값 확정 = 전송 0 + 문장', async ({
    page,
  }) => {
    const seed = { buy3Schema: 0, buyEnabled: true, sellEnabled: true };
    relay.seedLimitChasers([seed]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });

    // ① 매수주문 카드 상태 — 「켜짐 · 켠 매수 없음」 이 아니라 구서버 한 줄(경고 톤). 매수 LED 는 마스터 기준 「감시」 그대로.
    const buyStatus = lcGroupStatus(card, 'buy');
    await expect(buyStatus).toHaveText('구서버 전략 · 끄기만 가능', { timeout: 15_000 });
    await expect(buyStatus).toHaveClass(/text-\[var\(--destructive\)\]/);
    const buyLed = card.locator('[data-slot="card-header"] [data-slot="latch-led"][data-kind="buy"]');
    await expect(buyLed).toContainText('감시');

    // ② 켜는 방향은 누르기 전에 막힌다 — 꺼진 스위치 넷 `disabled` · 켜진 매수주문 · 매도주문은 끌 수 있다(T-16-44).
    const LEGACY_READ_ONLY = '구서버 전략이라 끄기만 할 수 있어요 — 서버를 확인해 주세요';
    for (const name of ['선매수 켜기', '줄매수 켜기', '후매수 켜기', '매수취소 켜기']) {
      await expect(lcSwitch(card, name), name).toBeDisabled();
    }
    const master = lcSwitch(card, '매수주문 켜기');
    await expect(master).toBeEnabled();
    await expect(master).toBeChecked();
    await expect(lcSwitch(card, '매도주문 켜기')).toBeEnabled();

    // ③ 「켤 수 없는 이유」 — 열마다 구서버 한 줄. 폰 밴드면 「매도」 탭으로 옮겨 매도 열을 본다.
    const blockedIn = (side: 'buy' | 'sell') => card.locator(`[data-pane="${side}"] [data-slot="lc-arm-blocked"]`);
    await expect(blockedIn('buy')).toHaveCount(1);
    await expect(blockedIn('buy').locator('[data-slot="lc-arm-blocked-gates"]')).toHaveText(
      '매수주문 · 선매수 · 줄매수 · 후매수',
    );
    await expect(blockedIn('buy').locator('[data-slot="lc-arm-blocked-text"]')).toHaveText(LEGACY_READ_ONLY);
    const tabs = card.getByRole('tablist', { name: '주문 진입' });
    const phone = await tabs.isVisible();
    if (phone) await tabs.getByRole('tab', { name: '매도' }).click();
    await expect(blockedIn('sell')).toBeVisible();
    await expect(blockedIn('sell')).toHaveCount(1);
    await expect(blockedIn('sell').locator('[data-slot="lc-arm-blocked-gates"]')).toHaveText('매도주문 · 매수취소');
    await expect(blockedIn('sell').locator('[data-slot="lc-arm-blocked-text"]')).toHaveText(LEGACY_READ_ONLY);
    if (phone) await tabs.getByRole('tab', { name: '매수' }).click();

    // ④ 값 행은 비활성이 아니다 — 편집기는 열리고 확정이 문장으로 막힌다(조용히 무반응인 행 없음).
    const before = lcSetCount(relay);
    await editLc(page, 'lc-buy-watch-qty', '9000');
    // 말풍선은 Radix Popover(body 포털)라 카드 밖에 선다 — 페이지에서 찾는다.
    const bubble = page.locator('[data-slot="lc-failure-bubble"][role="alert"]');
    await expect(bubble).toHaveText(LEGACY_READ_ONLY);
    await page.locator('#lc-buy-watch-qty').press('Escape');
    await expect(page.locator('#lc-buy-watch-qty')).toHaveCount(0);

    // ⑤ 매수주문 끄기는 나간다 — 그 10 이 보인 순간 누적 = 기준 + 1(값 확정 시도 = 전송 0 · 고정 대기 없음).
    await master.click();
    await expect
      .poll(() => lcSetRequests(relay).filter((r) => r.buyEnabled === false).length, { timeout: 15_000 })
      .toBe(1);
    expect(lcSetCount(relay), '값 확정 시도 = 전송 0 · 매수주문 끄기 = 10 한 건').toBe(before + 1);
  });

  test('P24-12 D-35 — 마스터 OFF 에서 「줄매수 켜기」 한 번 = 10 한 건(마스터 · 자동 체크 동반) → 에코 뒤 로그 두 줄(「줄매수 자동 체크 — 켬: 」 이 위) (2026-09-28 사용자 지시 · P24-3 대응)', async ({
    page,
  }) => {
    // P24-3 과 같은 출발점 + 줄매수 금액 500(만원) — 스텁 주문가격 71,000 기준 수량 > 0 이라 사전 검증을 지난다.
    // 픽스처 비교가격(71,100) ≠ 스텁 매수1호가(97,900)(상한가 중 켜기 클라 차단은 D-33 ① 폐기로 없다). 매도 · 취소 게이트는 꺼져 있고 매도 매수잔량 ·
    // 취소 매수잔량 · 매도비율은 0 이 아니다(스텁 기본값) — 자동 체크 6종이 전부 켜질 수 있는 전략이다.
    const seed = { buyEnabled: false, extraBuyOrderAmount: 500 };
    relay.seedLimitChasers([seed]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('10,000주', { timeout: 15_000 });
    await expect(lcSwitch(card, '매수주문 켜기')).not.toBeChecked();
    await expect(lcSwitch(card, '매도주문 켜기')).not.toBeChecked();
    await expect(lcSwitch(card, '매수취소 켜기')).not.toBeChecked();
    // 상한가(시세)가 들어와야 자동 체크가 가격을 판정한다(D-20) — 호가 사다리의 상한가 시딩을 기다린다.
    await expect(lcValue(page, 'lc-buy-order-price')).not.toHaveText('', { timeout: 15_000 });

    const before = lcSetCount(relay);
    await lcSwitch(card, '줄매수 켜기').click();
    // 확인창 · 토스트 · 매도 탭 이동 없음(D-06 · D-35).
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // ★ 고정 대기 없음 — 줄매수 켬 10 이 게이트웨이에 보인 순간 누적 = 기준 + 1(사람 한 번 = 한 건).
    await expect
      .poll(() => lcSetRequests(relay).filter((r) => r.extraBuyEnabled === true).length, { timeout: 15_000 })
      .toBe(1);
    expect(lcSetCount(relay), '사람 한 번 = 10 한 건').toBe(before + 1);

    const sent = lcSetRequests(relay).at(-1)!;
    // 자동 · 버스트 해제 · 자동매도 요청 4필드 + extraBuyAuto 동반 → buy3_schema 5 (P24-1 주석 · quick-261011-0yb).
    expect(sent.buy3Schema).toBe(5);
    expect(sent.crud).toBe('C');
    expect(sent.extraBuyEnabled).toBe(true);
    expect(sent.preBuyEnabled, '줄매수만 켰다 — 선매수는 그대로').toBe(false);
    expect(sent.buyEnabled, 'D-01 — 마스터 동반').toBe(true);
    expect(sent.sellEnabled, 'D-35 — 매도주문 자동 체크').toBe(true);
    expect(sent.sellQtyTrackEnabled, 'D-35 — 매도>잔량추적 자동 체크').toBe(true);
    expect(sent.sellTradeQtyEnabled, 'D-35 — 매도>체결 자동 체크').toBe(true);
    expect(sent.cancelQtyEnabled, 'D-35 — 매수취소 자동 체크').toBe(true);
    expect(sent.cancelTradeEnabled, 'D-35 — 취소>체결 자동 체크').toBe(true);
    expect(sent.cancelQtyTrackEnabled, 'D-35 — 취소>잔량추적 자동 체크').toBe(true);

    await relay.pushLimitChaserEcho({ ...seed, ...lcEchoFlagsOf(sent) });
    await expect(lcSwitch(card, '매수주문 켜기')).toBeChecked({ timeout: 15_000 });
    await expect(lcSwitch(card, '줄매수 켜기')).toBeChecked();
    await expect(lcSwitch(card, '매도주문 켜기')).toBeChecked();
    await expect(lcSwitch(card, '매수취소 켜기')).toBeChecked();
    const rows = await logRows(page);
    await expect(rows.first()).toContainText('줄매수 자동 체크 — 켬: ', { timeout: 15_000 });
    await expect(rows.nth(1)).toContainText('줄매수 체크 — 매수주문도 켬');
    // 에코 · 로그 뒤에도 누적은 그대로 — 에코는 자동 체크 제출을 만들지 않는다(D-08).
    expect(lcSetCount(relay), '에코 뒤 추가 전송 0').toBe(before + 1);
  });

  test('P24-13 D-33 ① 폐기 뒤에도 얇은 벽 = 10 한 건 — 매수1호가 == 비교가격 · 매수1잔량(10) < 최소(11)에서 「줄매수 켜기」 = 10 한 건 · 차단 로그 없음 (2026-09-28 · gh-trade k3u · quick-261011-0yb)', async ({
    page,
  }) => {
    // 비교가격 = 스텁 매수1호가(97,900) — 상한가에 붙은 모양. 스텁 매수1잔량 10 < 줄매수 최소 11 = 얇은 벽이라 켜기가 나간다
    // (서버도 「모름」 단계에서 잔량 < 하한이면 「대기」로 전이 — limit-chaser.md §5-2 · k3u). 줄매수 금액 500(만원)이라
    // 사전 검증(금액 · 수량 · D-10 — 최대 0 = 무제한)을 지난다.
    const seed = { buyEnabled: true, buyWatchPrice: 97_900, extraBuyOrderAmount: 500, extraBuyMinQty: 11 };
    relay.seedLimitChasers([seed]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-price')).toHaveText('97,900원', { timeout: 15_000 });
    // 호가가 들어온 뒤에 누른다 — 사다리에 97,900 이 보일 때까지(D-33 ① 폐기 뒤에도 같은 조건을 재현한다).
    await expect(card.locator('[data-slot="orderbook-ladder"]').first()).toContainText('97,900', { timeout: 15_000 });

    const before = lcSetCount(relay);
    await lcSwitch(card, '줄매수 켜기').click();
    // ★ 고정 대기 없음 — 줄매수 켬 10 이 게이트웨이에 도착한 사건 뒤에 개수를 센다.
    await waitForSetAtGateway(relay, before + 1);
    await expect
      .poll(() => lcSetRequests(relay).filter((r) => r.extraBuyEnabled === true).length, { timeout: 15_000 })
      .toBe(1);
    expect(lcSetCount(relay), '얇은 벽 — 사람 한 번 = 10 한 건').toBe(before + 1);
    const sent = lcSetRequests(relay).at(-1)!;
    expect(sent.extraBuyEnabled).toBe(true);
    expect(sent.buyWatchPrice).toBe(97_900);
    expect(sent.extraBuyMinQty).toBe(11);
    const rows = await logRows(page);
    await expect(rows.filter({ hasText: '매수1잔량이 최소 미만일 때만' })).toHaveCount(0);
  });

  /*
    ★ Phase 20 트레이서 — 「호가변경」(Phase 24 D-09 로 선매수 카드 「한방」) 한 행이 **실제 경로 한 줄**을 끝까지 잇는다(20-01).
      진짜 브라우저 → 진짜 relay → 스텁 게이트웨이 10 수신 → 60 에코 → 행 값.
      `openFocusedCard` 를 쓰지 않는다 — 그 헬퍼는 옛 입력 id(`#lc-buy-watch-qty`)를 기다리고,
      20-04 가 옛 입력을 걷어도 이 케이스는 살아남아야 한다. 대신 값 행 자체의 텍스트를 기다린다.
  */
  test('P20-1 인라인 편집 한 행 — 선매수 카드 펼침 → 「한방」 클릭 → 전체 선택 → 5 → Enter → 게이트웨이 10 수신 → 60 에코 → 행 「5건」 (Phase 20 D-04 · D-14 · D-14a · Phase 24 D-09)', async ({
    page,
  }) => {
    relay.seedLimitChasers([{ buyEnabled: true }]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });

    const row = page.locator('[data-lc-field="lc-sweep-tick"]');
    const value = row.locator('[data-slot="lc-row-value"]');
    await expect(value).toHaveText('3건', { timeout: 15_000 });
    // Phase 24 ⑤ — 한방은 선매수 카드(기본 접힘) 안 체크 값 행이다(R6). 펼쳐도 전송은 없다.
    const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
    await expandLcGroup(cardOf(page, E2E_ISIN), 'pre-buy');
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length, '접기는 lc.set 을 보내지 않는다').toBe(before);

    // 행 높이 44 — 편집 전후가 같아야 한다(D-14a · 레이아웃 이동 0).
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.height - 44)).toBeLessThanOrEqual(0.5);

    await row.click();
    const input = page.locator('#lc-sweep-tick');
    await expect(input).toBeFocused();
    // 들어가자마자 값 전체 선택(D-14c) — 첫 입력이 값을 덮는다.
    expect(
      await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, el.value.length]),
    ).toEqual([0, 1, 1]);
    // 체크 값 행의 44px 상자는 행(`lc-check-row`)이다 — 편집 중에도 그대로다.
    const editBox = await page
      .locator('[data-slot="lc-check-row"]:has([data-lc-field="lc-sweep-tick"][data-editing="true"])')
      .boundingBox();
    expect(editBox).not.toBeNull();
    expect(Math.abs(editBox!.height - 44)).toBeLessThanOrEqual(0.5);
    // 안내 문구·「저장」 버튼 없음(D-14a).
    await expect(page.locator('[data-slot="limit-chaser-form"]')).not.toContainText('Enter');
    await expect(page.getByRole('button', { name: '저장' })).toHaveCount(0);

    await page.keyboard.type('5');
    await page.keyboard.press('Enter');
    await waitForSetAtGateway(relay, before + 1);
    // 사용자가 한 번 눌렀으면 정확히 한 번 나간다 — 재전송 없음(T-16-10).
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(before + 1);

    await relay.pushLimitChaserEcho({ buyEnabled: true, sweepMinTickCount: 5 });
    await expect(value).toHaveText('5건', { timeout: 15_000 });
    await expect(page.locator('#lc-sweep-tick')).toHaveCount(0);
  });

  /*
    ★ Phase 20 P20-3 — 폭 불변식 백스톱(UI-SPEC 검증 훅 · UI Considerations E1 overflow · D-20 · D-14a).
      최악값(가격 7자리 1,274,000원 · 수량 100,000주 · 주문금액 9,999만원 · 잔량추적 기준선 100,000주)을
      에코로 심고, 카드 컨테이너를 본문 344 · 685 · 830 · 992 에 **정확히** 맞춰(`sizeCardTo`) 잰다.
      · 잘림 0 — 카드 전체 두 판정(`expectCardNotClipped`) + 우측 패널 scrollWidth ≤ clientWidth +
        **행마다** 가장 오른쪽 잎 요소가 행 안쪽 끝을 넘지 않는다(여유 px 를 주석으로 남긴다).
        폰 밴드 「잔량추적 기준선 | 100,000주」 는 20-04 가 L2 백스톱으로 +0.9px 를 만든 행이다 — 여기가
        그 얇은 여유의 실브라우저 단언이다.
      · 모든 리스트 행 44px(±0.5) · 인라인 편집 중인 행도 44px(레이아웃 이동 0).
      · 폰 밴드는 「매수」「매도」 탭을 각각 눌러 두 pane 을 모두 잰다(비활성 pane 은 display:none).
      · 본문 344 수동주문 — 「예약매수」「예약매도」 48px · 「정정」「취소」 38px 라벨이 잘리지 않는다
        (20-06 이 human_judgment 로 남긴 항목). 예약창(77 open)을 밀어 최악 라벨로 잰다.
      · ≥685 2열 — 매수주문 · 매도주문 두 그룹 헤더 높이가 같다(상태 한 줄). Phase 24 로 매수주문 공통 카드는
        2행(주문가격 · 비교가격)이 되어 「두 그룹 높이 같음」의 근거(같은 행 수)가 사라졌다 — 헤더만 잰다.
      · Phase 24 — 선매수 · 줄매수 · 후매수 카드(기본 접힘)를 펼치고 새 행(선매수 5 · 줄매수 3 · 후매수 4 +
        발동잔량)을 최악값(「177,000,000주」 · 「17,700,000주」 · 「255회 · 남은 255회」 · 「255건」)으로 잰다.
  */
  test(`P20-3 최악값 × 본문 344 · ${LC_COMPACT_MIN} · 830 · 992 — 우측 패널 잘림 0 · 행 44px(편집 전후) · ≥${LC_COMPACT_MIN} 매수주문/매도주문 헤더 높이 동일 (D-20 · UI-SPEC 검증 훅)`, async ({
    page,
  }) => {
    const WORST = {
      buyEnabled: true,
      sellEnabled: true,
      buyOrderPrice: 1_274_000,
      buyWatchPrice: 1_274_000,
      sweepWatchPrice: 1_274_000,
      sellOrderPrice: 1_274_000,
      sellWatchPrice: 1_274_000,
      buyOrderAmount: 9_999,
      buyWatchQty: 100_000,
      sellWatchQty: 100_000,
      cancelWatchQty: 100_000,
      buyMinTradeQty: 100_000,
      sellMinTradeQty: 100_000,
      sellEntryLatched: true,
      sellQtyTrackBaseline: 100_000,
      // Phase 24 — 세 그룹을 켜 흐림 없이(가장 짙은 글자) 최악값을 잰다.
      preBuyEnabled: true,
      buyTradeQtyEnabled: true,
      sweepEnabled: true,
      sweepMinTickCount: 255,
      extraBuyEnabled: true,
      extraBuyOrderAmount: 9_999,
      extraBuyMinQty: 177_000_000,
      extraBuyMaxQty: 177_000_000,
      postBuyEnabled: true,
      postBuyOrderAmount: 9_999,
      postBuyReentry: 255,
      postBuyReentryLeft: 255,
      postBuyPhase: 1,
      postBuyFloorQty: 17_700_000,
      postBuyReboundPct: 100,
      postBuyTriggerQty: 17_700_000,
    };
    relay.seedLimitChasers([WORST]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    const card = cardOf(page, E2E_ISIN);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('100,000주', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-order-price')).toHaveText('1,274,000원');
    await expect(lcValue(page, 'lc-buy-order-amount')).toHaveText('9,999만원');
    // 최악값 시드는 매수·매도 두 게이트가 켜진 상태다 — 흐림(opacity .45) 없이 가장 짙은 글자로 잰다.
    await expect(lcSwitch(card, '매수주문 켜기')).toBeChecked();
    await expect(lcSwitch(card, '매도주문 켜기')).toBeChecked();
    await expect(lcValue(page, 'lc-post-buy-reentry')).toHaveText('255회 · 남은 255회');
    // 세 그룹 카드를 펼친다 — 접힘은 폼 상태라 밴드 · 탭 전환에 풀리지 않는다(R1).
    for (const slot of ['pre-buy', 'extra-buy', 'post-buy'] as const) await expandLcGroup(card, slot);

    /** 보이는 리스트 행 전부 — 값 행 · 체크 행 · 기준선 행 · 발동잔량 행. 높이와 행 안쪽 여유. */
    const measureRows = () =>
      card.evaluate((root) =>
        Array.from(
          root.querySelectorAll<HTMLElement>(
            '[data-lc-field], [data-slot="lc-check-row"], [data-slot="lc-derived"], [data-slot="lc-post-buy-trigger"]',
          ),
        )
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const inner = r.right - parseFloat(cs.paddingRight);
            let right = r.left;
            for (const leaf of Array.from(el.querySelectorAll<HTMLElement>('*'))) {
              const lr = leaf.getBoundingClientRect();
              if (leaf.getClientRects().length === 0 || lr.width === 0) continue;
              right = Math.max(right, lr.right);
            }
            /*
              진짜 여유 = 행 안쪽 폭 − 직계 자식들의 **내용** 폭 합 − 자식 사이 간격. justify-between 이라
              오른쪽 끝 여유(slack)는 들어갈 때 늘 0 이다 — 얼마나 남았는지는 이 값이 말한다.
            */
            const kids = Array.from(el.children).filter((c) => c.getClientRects().length > 0);
            const contentW = kids.reduce((sum, c) => {
              const range = document.createRange();
              range.selectNodeContents(c);
              return sum + range.getBoundingClientRect().width;
            }, 0);
            const gap = parseFloat(cs.columnGap) || 0;
            const innerW = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            return {
              what: el.getAttribute('data-lc-field') ?? el.getAttribute('data-slot') ?? '?',
              text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24),
              h: Math.round(r.height * 100) / 100,
              slack: Math.round((inner - right) * 10) / 10,
              free: Math.round((innerW - contentW - gap * Math.max(0, kids.length - 1)) * 10) / 10,
              pieces: kids.length,
            };
          }),
      );

    const minFree: Record<string, { what: string; free: number }> = {};
    const expectRows = async (label: string, mustInclude: string[]) => {
      const rows = await measureRows();
      const whats = rows.map((r) => r.what);
      for (const w of mustInclude) expect(whats, `${label} — ${w} 행이 보여야 한다`).toContain(w);
      expect(
        rows.filter((r) => Math.abs(r.h - 44) > 0.5),
        `${label} — 44px 이 아닌 행`,
      ).toEqual([]);
      expect(
        rows.filter((r) => r.slack < -0.5),
        `${label} — 행 안쪽 끝을 넘은 잎 요소(잘림)`,
      ).toEqual([]);
      // 여유는 「라벨 ─ 값」 두 조각 이상인 행만 잰다 — 체크 전용 행 ·
      // 체크 행 안의 값 버튼(한 조각)은 늘 0 이라 뺀다. 그 잘림은 위 두 판정이 본다.
      const measurable = rows.filter((r) => r.pieces >= 2);
      expect(
        measurable.filter((r) => r.free < -0.5),
        `${label} — 라벨 + 값이 행 안쪽 폭을 넘는 행`,
      ).toEqual([]);
      const worst = measurable.reduce((a, b) => (b.free < a.free ? b : a));
      const key = label.split(' ')[0]!;
      const prev = minFree[key];
      if (prev === undefined || worst.free < prev.free) {
        minFree[key] = { what: `${worst.what}「${worst.text}」`, free: worst.free };
      }
    };
    const expectOptionsNoScroll = async (label: string) => {
      const over = await card
        .locator('[data-slot="card-body-options"]')
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over, `${label} — 우측 패널 scrollWidth ≤ clientWidth`).toBeLessThanOrEqual(0);
    };
    /** 잔량 행을 인라인 편집으로 연 상태도 44px — 편집 전후 레이아웃 이동 0(D-14a). */
    const expectEditingRow44 = async (label: string) => {
      await showLc(page, 'lc-buy-watch-qty');
      await lcRow(page, 'lc-buy-watch-qty').click();
      const editing = page.locator('[data-lc-field="lc-buy-watch-qty"][data-editing="true"]');
      await expect(page.locator('#lc-buy-watch-qty')).toBeFocused();
      const box = await editing.boundingBox();
      expect(box, `${label} — 편집 중 행을 잴 수 없다`).not.toBeNull();
      expect(Math.abs(box!.height - 44), `${label} — 편집 중 행 높이 ${box!.height}`).toBeLessThanOrEqual(0.5);
      expect(await cardScrollOverflowing(page, E2E_ISIN, label), `${label} — 편집 중 넘침`).toEqual([]);
      await page.locator('#lc-buy-watch-qty').press('Escape');
      await expect(page.locator('#lc-buy-watch-qty')).toHaveCount(0);
    };

    // Phase 24 — 공통 2 · 선매수 5 · 줄매수 3 · 후매수 4 + 발동잔량(감시대상 행은 ⑤ 로 없다).
    const BUY_ROWS = [
      'lc-buy-order-price',
      'lc-buy-watch-price',
      'lc-buy-order-amount',
      'lc-buy-watch-qty',
      'lc-buy-min-trade-qty',
      'lc-sweep-tick',
      'lc-sweep-watch-price',
      'lc-extra-buy-amount',
      'lc-extra-buy-min-qty',
      'lc-extra-buy-max-qty',
      'lc-post-buy-amount',
      'lc-post-buy-reentry',
      'lc-post-buy-floor-qty',
      'lc-post-buy-rebound',
      'lc-post-buy-trigger',
    ];
    const SELL_ROWS = ['lc-sell-order-price', 'lc-sell-watch-qty', 'lc-derived', 'lc-cancel-watch-qty'];
    const setsBefore = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

    for (const target of [344, LC_COMPACT_MIN, 830, 992]) {
      await sizeCardTo(page, E2E_ISIN, target);
      const { band } = await cardMetrics(page, E2E_ISIN);
      expect(band, `카드 ${target} — 기대 밴드`).toBe(bandOfWidth(target));
      const label = `${target} 카드`;

      if (bandOfWidth(target) === 'phone') {
        // 폰 밴드 — 탭당 한 pane. 두 pane 을 각각 편다.
        const tablist = card.getByRole('tablist', { name: '주문 진입' });
        await tablist.getByRole('tab', { name: '매수' }).click();
        await expect(card.locator('[data-pane="buy"]')).toBeVisible();
        await expectCardNotClipped(page, E2E_ISIN, `${label} · 매수 pane`);
        await expectOptionsNoScroll(`${label} · 매수 pane`);
        await expectRows(`${target} 매수 pane`, BUY_ROWS);
        await expectEditingRow44(`${label} · 매수 pane`);

        await tablist.getByRole('tab', { name: '매도' }).click();
        await expect(card.locator('[data-pane="sell"]')).toBeVisible();
        await expectCardNotClipped(page, E2E_ISIN, `${label} · 매도 pane`);
        await expectOptionsNoScroll(`${label} · 매도 pane`);
        await expectRows(`${target} 매도 pane`, SELL_ROWS);
        await expect(card.locator('[data-slot="lc-derived"]')).toContainText('100,000주');

        // 수동주문 — 예약창(77 open)이면 「예약매수」「예약매도」 + 조각 수 상자까지 선다(최악 라벨).
        const sock = await relay.userSocket();
        relay.gateway.sendQueuedWindowState(sock, { open: true, maxPieces: 5 });
        await tablist.getByRole('tab', { name: '수동' }).click();
        const form = card.getByTestId('manual-order-form');
        await expect(form).toBeVisible();
        const buttons = form.getByTestId('manual-order-buttons').getByRole('button');
        await expect(buttons).toHaveCount(4);
        // 폰 밴드는 「예약」이 윗줄 block 이라 접근성 이름이 「예약 매수」로 계산된다(18-07 SideLabel ·
        // deferred-items 기록) — 여기서 재는 것은 라벨 잘림이라 글자만 본다.
        await expect(buttons.nth(0)).toHaveAccessibleName(/^예약\s?매수$/, { timeout: 15_000 });
        await expect(buttons.nth(1)).toHaveAccessibleName(/^예약\s?매도$/);
        const clipped = await form.getByTestId('manual-order-buttons').evaluate((el) =>
          Array.from(el.querySelectorAll<HTMLButtonElement>('button')).map((b) => ({
            text: (b.textContent ?? '').trim(),
            h: Math.round(b.getBoundingClientRect().height),
            overX: b.scrollWidth - b.clientWidth,
            overY: b.scrollHeight - b.clientHeight,
          })),
        );
        expect(clipped.map((b) => b.h), `${label} — 수동주문 버튼 높이 48 · 48 · 38 · 38`).toEqual([48, 48, 38, 38]);
        expect(
          clipped.filter((b) => b.overX > 0 || b.overY > 0),
          `${label} — 수동주문 버튼 라벨 잘림(overflow-hidden 안에서 넘친 글자)`,
        ).toEqual([]);
        await expectCardNotClipped(page, E2E_ISIN, `${label} · 수동 pane`);
        relay.gateway.sendQueuedWindowState(sock, { open: false, maxPieces: 5 });
        await expect(buttons.nth(0)).toHaveAccessibleName('매수', { timeout: 15_000 });
        await tablist.getByRole('tab', { name: '매수' }).click();
      } else {
        // 2열 — 두 pane 이 함께 보인다.
        await expect(card.locator('[data-pane="buy"]')).toBeVisible();
        await expect(card.locator('[data-pane="sell"]')).toBeVisible();
        await expectCardNotClipped(page, E2E_ISIN, label);
        await expectOptionsNoScroll(label);
        await expectRows(`${target} 2열`, [...BUY_ROWS, ...SELL_ROWS]);
        await expectEditingRow44(label);
      }
    }
    // 재는 동안 아무것도 나가지 않았다(편집은 전부 Esc 로 버렸다).
    expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(setsBefore);
    test.info().annotations.push({
      type: 'P20-3 행 최소 여유(px)',
      description: Object.entries(minFree)
        .map(([k, v]) => `${k}: ${v.free} (${v.what})`)
        .join(' · '),
    });

    /*
      ≥685 — 매수주문 · 매도주문 두 그룹 **헤더** 높이가 같다(상태 문구 한 줄). Phase 24 로 매수주문 공통 카드는
      2행이라 「그룹 높이 같음」은 근거(같은 행 수)가 사라져 헤더만 잰다.
    */
    relay.seedLimitChasers([{ ...WORST, sellEntryLatched: false }]);
    await page.goto(FOCUS_URL);
    await waitForReady(page);
    await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
    await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('100,000주', { timeout: 15_000 });
    await expect(card.locator('[data-slot="lc-derived"]')).toHaveCount(0);
    for (const target of [LC_COMPACT_MIN, 830, 992]) {
      await sizeCardTo(page, E2E_ISIN, target);
      // 상태 문구는 한 줄 — 헤더 높이가 두 그룹 같다(둘째 줄로 내려가면 여기서 갈린다).
      const heads = await card
        .locator('[data-slot="lc-group-buy"] [data-slot="lc-group-header"], [data-slot="lc-group-sell"] [data-slot="lc-group-header"]')
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10));
      expect(heads, `카드 ${target} — 두 그룹 헤더`).toHaveLength(2);
      expect(Math.abs(heads[0]! - heads[1]!), `카드 ${target} — 헤더 높이 ${heads.join(' / ')}`).toBeLessThanOrEqual(0.5);
    }
  });

  /*
    ── G-21-R3-10 이전 (Phase 21 21-34 · D-31) ── 옛 호가 탭 e2e 의 고유 검증을 작업대 카드로 옮겼다(머리 ⑦).
    카드는 종목상세 「트레이딩」 착지(`/trading?code=` · 21-33)로 세운다 — 옛 호가 탭 진입과 같은 「종목 하나로
    들어온다」 흐름이다.
  */
  test('G-21-R3-10 이전 — 인증 → 구독 → 카드 호가 10단 · 체결 테이프 최신순, 토큰은 relay URL 에 없다 (옛 orderbook 1 · 2 · T-15-04)', async ({
    page,
  }) => {
    const sockets = trackRelaySockets(page);
    // 폰 밴드 카드 — 모바일 사다리 20행 + compact 테이프(옛 2 가 폰 폭에서 보던 자리).
    await page.setViewportSize(PHONE_VIEWPORT);
    const card = await landOnCard(page);

    const ladder = card.locator('[data-slot="orderbook-ladder"][data-variant="chaser"]');
    const rows = ladder.locator('[data-slot="ladder-row-mobile"]');
    await expect(rows).toHaveCount(20, { timeout: 15_000 });
    await expect(rows.first()).toContainText('99,000'); // 매도 10호가
    await expect(rows.last()).toContainText('97,000'); // 매수 10호가

    // 와이어는 시간 오름차순이고 화면은 최신이 위다 — 뒤집기가 실제로 일어났는지 본다.
    const tape = ladder.locator('[data-slot="trade-tape"][data-compact="true"]:visible tbody tr');
    await expect(tape).toHaveCount(3);
    await expect(tape.first()).toContainText('30:17');
    await expect(tape.last()).toContainText('30:15');

    // T-15-04 — 토큰은 첫 메시지 본문 전용이다. 업그레이드 URL 에 쿼리스트링이 없어야 한다.
    expect(sockets).toContain(RELAY_WS_URL);
    for (const url of sockets) expect(url).not.toContain('?');
  });

  test('G-21-R3-10 이전 — 390 카드 「미체결」 탭은 이 종목 · 이 거래소만 · 7자리 가격/6자리 수량 행도 조용한 잘림 0 · 취소 버튼 그대로 (옛 orderbook 8 · C7/R6)', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    const card = await landOnCard(page);

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
          // ★ 7자리 가격 + 6자리 수량 — 스트레스 케이스(옛 8 그대로 · 카드는 KRX 라 KRX 행으로 둔다).
          orderNo: '0000135801',
          isin: E2E_ISIN,
          side: 'S',
          price: 1_234_567,
          orderQty: 999_999,
          filledQty: 0,
          unfilledQty: 999_999,
          exchange: 'KRX',
        },
        {
          // ★ 같은 종목 · 다른 거래소(NXT) — 카드는 ISIN ∧ 거래소로 자른다(`cardAccountSliceOf`). NXT 카드 몫이다.
          orderNo: '0000135802',
          isin: E2E_ISIN,
          side: 'B',
          price: 97_000,
          orderQty: 5,
          filledQty: 0,
          unfilledQty: 5,
          exchange: 'NXT',
        },
        {
          // ★ 다른 종목 행 — 카드 「미체결」은 **이 종목만**이다. 여기 서면 안 된다.
          orderNo: '0000135999',
          isin: E2E_LONG_NAME_ISIN,
          side: 'B',
          price: 10_000,
          orderQty: 1,
          filledQty: 0,
          unfilledQty: 1,
          exchange: 'KRX',
        },
      ],
      holdings: [{ isin: E2E_ISIN, stockQty: 120, sellableQty: 90, avgPrice: 91_250 }],
    });

    const tabs = card.locator('[data-slot="card-tabs"]');
    await tabs.getByRole('tab', { name: /미체결/ }).click();
    const rows = tabs.locator('[data-slot="account-embed-unfilled-row"]');
    await expect(rows).toHaveCount(2, { timeout: 15_000 });
    await expect(tabs.getByText('0000135999')).toHaveCount(0);
    await expect(tabs.getByText('0000135802')).toHaveCount(0);
    await expect(tabs.getByRole('button', { name: '주문번호 0000135742 취소' })).toBeVisible();
    await expect(tabs.getByRole('button', { name: '주문번호 0000135801 취소' })).toBeVisible();

    // 조용한 잘림 0 — 표는 가로 스크롤 영역 안에서만 넘친다(판정은 `e2e/overflow.ts` 하나).
    expect(await scrollOverflowing(page, `${cardSelector(E2E_ISIN)} [data-slot="card-tabs-body"]`)).toEqual([]);

    await tabs.getByRole('tab', { name: /잔고/ }).click();
    await expect(tabs.locator('[data-slot="account-embed-holding-row"]')).toHaveCount(1, { timeout: 15_000 });
  });

  test('G-21-R3-10 이전 — 시간외종가 G2 창: 상태줄 배지가 390 · 1440 에서 잘림 없이 서고, 카드 주문유형 시간외종가 → 확인 「시간외종가」 → order.new krxSession G2 · 가격 0 → 접수 배너 · REST 0 (옛 orderbook P20-6 ③ · 6 · D-31)', async ({
    page,
  }) => {
    // D-02 — 주문은 wss 단일 경로다. 이 라우트로 한 건이라도 나가면 실패다.
    const restHits: string[] = [];
    await page.route('**/api/orders', async (route) => {
      restHits.push(route.request().method());
      await route.abort();
    });
    const orderFrames = captureOrderFrames(page);
    const directOrders = () => relay.requestLog().filter((m) => m === DMA_MSG.DirectOrderReq).length;

    const card = await landOnCard(page);
    const sock = await relay.userSocket();
    relay.gateway.sendQueuedWindowState(sock, { g2Open: true });
    try {
      const badge = statusBar(page).locator('[data-slot="workbench-window-badge"]');
      await expect(badge).toHaveText('시간외종가 G2 창', { timeout: 15_000 });

      // 폭별 배치 — 작업대 상태줄은 폰에서 wrap 을 허용하되(E1) 어느 폭에서도 잘리지 않는다.
      for (const viewport of [PHONE_VIEWPORT, WIDE_VIEWPORT]) {
        const label = `뷰포트 ${viewport.width}`;
        await page.setViewportSize(viewport);
        await expect(badge, label).toBeVisible();
        const box = await statusBar(page).boundingBox();
        expect(box, label).not.toBeNull();
        expect(await leavesOverflowing(statusBar(page), box!.x + box!.width), label).toEqual([]);
        expect(await scrollOverflowing(page, '[data-slot="workbench-status-bar"]'), label).toEqual([]);
      }

      // 카드 수동주문 — 주문유형 시간외종가(21-33 · 스케치 008 ③ A).
      await card.getByRole('button', { name: '수동주문', exact: true }).click();
      const form = card.getByTestId('manual-order-form');
      await expect(form).toBeVisible();
      const type = form.getByLabel('주문유형');
      await expect(type.locator('option[value="offhours"]')).toBeEnabled();
      await type.selectOption('offhours');
      await expect(form.getByLabel('가격(시간외종가 · 잠김)')).toBeDisabled();
      await form.locator(`#mo-qty-${E2E_ISIN}`).fill('10');
      const buy = form.getByTestId('manual-order-buttons').getByRole('button', { name: '매수' });
      await expect(buy).toBeEnabled();
      await buy.click();

      const dialog = page.getByTestId('order-confirm-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('시간외종가');
      await dialog.getByRole('button', { name: /매수/ }).click();

      // 게이트웨이까지 갔는지 먼저 본다 — 통보를 너무 일찍 주면 relay 가 대기 항목을 등록하기 전이다.
      await expect.poll(directOrders, { timeout: 15_000 }).toBe(1);
      expect(orderFrames).toHaveLength(1);
      expect(orderFrames[0]).toMatchObject({
        t: 'order.new',
        isin: E2E_ISIN,
        exchange: 'KRX',
        side: 'B',
        qty: 10,
        price: 0,
        krxSession: 'G2',
      });

      await relay.pushOrderResp({
        isin: E2E_ISIN,
        side: 'B',
        orderNo: '0000135842',
        noticeType: 'A',
        resultCode: 0,
        message: '정상처리',
        price: 0,
        quantity: 10,
        exchange: 'KRX',
      });
      const result = form.getByTestId('manual-order-result');
      await expect(result).toHaveAttribute('data-kind', 'accepted', { timeout: 15_000 });
      await expect(result).toContainText('주문이 접수됐어요 · 주문번호 0000135842');
      expect(restHits).toEqual([]);
      // D-01 — relay 사용자 세션 경로는 DB 에 쓰지 않는다.
      expect(relay.orderInserts()).toHaveLength(0);
    } finally {
      relay.gateway.sendQueuedWindowState(sock, {});
    }
  });

  /*
    ★ quick-260922-tqr 는 터치 기기 종목 추가란을 16px 로 했지만(iOS Safari 의 16px 미만 포커스 확대 방지),
      quick-260925-ptw 가 확대/축소 자체를 막고(`app/layout.tsx` viewport) 입력 글꼴을 14px(`--t-sm`)
      하나로 정했다 — 사용자 결정 2026-10-01 「수정 필요없음」(Phase 26 deferred wontfix). 현 계약은 터치
      기기에서도 14px 다. iPhone **가로** 폭(844)으로 재는 이유: 폭 브레이크포인트를 넘어도 같아야 한다.
      relay 픽스처가 이 describe 의 beforeAll/beforeEach 에 있어 반드시 안쪽에 둔다.
  */
  test.describe('종목 추가란 글꼴 — 터치 기기 (quick-260925-ptw 계약)', () => {
    test.use({ hasTouch: true, viewport: { width: 844, height: 390 } });

    test('터치 기기 · iPhone 가로 폭 844 에서 종목 추가 입력이 14px 다', async ({ page }) => {
      // 바깥 beforeEach 가 WIDE_VIEWPORT 로 덮으므로 여기서 iPhone 가로 폭으로 되돌린다.
      await page.setViewportSize({ width: 844, height: 390 });
      await page.goto(WORKBENCH_URL);
      await waitForReady(page);
      await expect(addBox(page)).toHaveCSS('font-size', '14px');
    });
  });

  /*
    ★ Phase 20 트레이서 확장(20-03) — **터치 기기**에서 같은 한 행이 키패드 시트로 끝까지 잇는다.
      `hasTouch` 컨텍스트는 `(pointer: coarse)` 가 참이다(RESEARCH Q1 실측) → `useEditMode` = sheet.
      시트 기하(D-13): 폭 min(440, 100vw − 20) 가운데 · 하단 ≥10 · radius 28 · body 포털(카드 밖).
      relay 픽스처가 바깥 describe 의 beforeAll/beforeEach 에 있어 반드시 안쪽에 둔다.
  */
  test.describe('Phase 20 — 터치 기기 시트 (D-12 · D-13)', () => {
    test.use({ hasTouch: true });

    /**
     * 빈 값 디스플레이 — 단위 글자가 캐럿 **옆 같은 줄**에 선다(20-07 시각 확인에서 「원」이 캐럿 위로 뜬
     * 결함을 고쳤다 · 기준선 받침). 캐럿 오른쪽에 있고 세로 중심 차가 8px 미만이다.
     */
    async function expectUnitBesideCaret(sheet: Locator, label: string) {
      const g = await sheet.locator('[data-slot="numpad-display"]').evaluate((out) => {
        const caret = out.querySelector('[data-slot="numpad-value"]')!.nextElementSibling!.getBoundingClientRect();
        const unit = out.lastElementChild!.getBoundingClientRect();
        return {
          dy: Math.abs(caret.top + caret.height / 2 - (unit.top + unit.height / 2)),
          dx: unit.left - caret.right,
        };
      });
      expect(g.dy, `${label} — 단위와 캐럿의 세로 중심 차`).toBeLessThan(8);
      expect(g.dx, `${label} — 단위는 캐럿 오른쪽`).toBeGreaterThanOrEqual(-1);
    }

    /** 등장 애니메이션(250ms slide)이 끝나야 bounding box 가 최종 자리다. */
    async function settledSheet(page: Page) {
      const sheet = page.locator('[data-slot="numpad-sheet"]');
      await expect(sheet).toBeVisible({ timeout: 10_000 });
      await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      return sheet;
    }

    test('P20-2 터치 기기 — 선매수 카드 펼침 → 「한방」 탭 → 시트(뷰포트 390 폭 370 · 768 폭 440 가운데 · radius 28 · 하단 ≥10 · body 직속) → 5 → 「한방 건수 적용」 → 게이트웨이 10 수신 → 60 에코 → 시트 닫힘 · 행 「5건」 · 가로 폰 내부 스크롤', async ({
      page,
    }) => {
      // 바깥 beforeEach 가 WIDE_VIEWPORT 로 덮으므로 여기서 폰 폭으로 되돌린다.
      await page.setViewportSize({ width: 390, height: 844 });
      relay.seedLimitChasers([{ buyEnabled: true }]);
      await page.goto(FOCUS_URL);
      await waitForReady(page);
      await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });

      const row = page.locator('[data-lc-field="lc-sweep-tick"]');
      const value = row.locator('[data-slot="lc-row-value"]');
      await expect(value).toHaveText('3건', { timeout: 15_000 });
      await expect(row).toHaveAttribute('aria-haspopup', 'dialog');
      const before = relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;

      await expandLcGroup(cardOf(page, E2E_ISIN), 'pre-buy');
      await row.tap();
      // 인라인 입력칸은 생기지 않는다 — 터치 기기는 시트다.
      await expect(page.locator('#lc-sweep-tick')).toHaveCount(0);
      const sheet = await settledSheet(page);
      await expect(sheet).toHaveAttribute('role', 'dialog');
      await expect(sheet).toHaveAttribute('aria-modal', 'true');

      // 기하(D-13) — 폰은 좌우 10px 전폭.
      const box = await sheet.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.abs(box!.width - 370)).toBeLessThanOrEqual(1);
      expect(Math.abs(box!.x - 10)).toBeLessThanOrEqual(1);
      const innerHeight = await page.evaluate(() => window.innerHeight);
      expect(innerHeight - (box!.y + box!.height)).toBeGreaterThanOrEqual(10 - 0.5);
      await expect(sheet).toHaveCSS('border-top-left-radius', '28px');
      // body 포털 — 카드(`container-type` 조상) 밖이다.
      expect(await sheet.evaluate((el) => el.closest('[data-slot="strategy-card"]') === null)).toBe(true);

      const pad = sheet.getByRole('group', { name: '숫자 키패드' });
      await pad.getByRole('button', { name: '5', exact: true }).tap();
      await expect(sheet.locator('[data-slot="numpad-value"]')).toHaveText('5');
      await expect(sheet).toHaveAccessibleName('한방 건수');
      await sheet.getByRole('button', { name: '한방 건수 적용' }).tap();

      await waitForSetAtGateway(relay, before + 1);
      // 한 번 눌렀으면 정확히 한 번 — 재전송 없음(T-16-10).
      expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(before + 1);

      await relay.pushLimitChaserEcho({ buyEnabled: true, sweepMinTickCount: 5 });
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 15_000 });
      await expect(value).toHaveText('5건', { timeout: 15_000 });

      // 넓은 터치 화면(768) — 440 가운데. 폭 분기 규칙 없이 min() 한 식이 정한다.
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(row).toBeVisible();
      await row.tap();
      const wide = await settledSheet(page);
      const wideBox = await wide.boundingBox();
      expect(wideBox).not.toBeNull();
      expect(Math.abs(wideBox!.width - 440)).toBeLessThanOrEqual(1);
      expect(Math.abs(wideBox!.x - (768 - 440) / 2)).toBeLessThanOrEqual(1);
      await wide.getByRole('button', { name: '닫기' }).tap();
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 10_000 });

      // 가로 모드 폰(높이 390) — 시트는 max-height calc(100dvh − 20px) 안에서 내부 스크롤되고
      // 「한방 건수 적용」 까지 닿는다(UI Considerations 추가 행 · 시트 높이 backstop).
      await page.setViewportSize({ width: 844, height: 390 });
      await row.tap();
      const land = await settledSheet(page);
      const landBox = await land.boundingBox();
      expect(landBox).not.toBeNull();
      expect(landBox!.height).toBeLessThanOrEqual(390 - 20 + 0.5);
      expect(await land.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const apply = land.getByRole('button', { name: '한방 건수 적용' });
      await apply.scrollIntoViewIfNeeded();
      await expect(apply).toBeInViewport();
      await land.getByRole('button', { name: '닫기' }).tap();
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 10_000 });
      expect(relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length).toBe(before + 1);
    });

    /*
      P20-4 — 원 단위 시트의 칩과 D-15 잠금을 실브라우저로 잇는다. 시드는 매수주문(마스터) 켜짐이다 → 공통
      카드(주문가격)는 마스터 에코를 따르므로(Phase 24 — 그 행 카드의 게이트 에코) 시트에 「감시 중 — 적용하면
      바로 반영돼요」가 선다(D-05 · 추가 확인 없음). 라벨은 D-09 로 「주문가격」이다.
      ★ 칩은 버퍼의 fresh 를 끈다(`applyPadChip`) — 「첫 키가 값을 덮는다」는 시트를 연 직후에만 성립하므로
        키 입력 검증(98150 · 127450)을 칩보다 먼저 한다.
    */
    test('P20-4 매수 주문가격 시트 — 칩 현재가·상한가·±1호가 · D-15 잠금(호가 단위 · 상한가) · 감시 중 안내 · 적용 → 10 → 에코 → 닫힘 (D-12 · D-15 · D-17 · D-05)', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      relay.seedLimitChasers([{ buyEnabled: true }]);
      await page.goto(FOCUS_URL);
      await waitForReady(page);
      await expect(cardOf(page, E2E_ISIN)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });

      const row = lcRow(page, 'lc-buy-order-price');
      await expect(lcValue(page, 'lc-buy-order-price')).toHaveText('71,000원', { timeout: 15_000 });
      await expect(row).toHaveAttribute('aria-haspopup', 'dialog');
      const sets = () => relay.requestLog().filter((m) => m === DMA_MSG.SetLimitChaserReq).length;
      const before = sets();

      await row.tap();
      await expect(page.locator('#lc-buy-order-price')).toHaveCount(0);
      const sheet = await settledSheet(page);
      await expect(sheet).toHaveAccessibleName('주문가격');
      const status = sheet.locator('[data-slot="numpad-status"]');
      const alert = status.getByRole('alert');
      const display = sheet.locator('[data-slot="numpad-value"]');
      const apply = sheet.getByRole('button', { name: '주문가격 적용' });
      const pad = sheet.getByRole('group', { name: '숫자 키패드' });
      const typeKeys = async (digits: string) => {
        for (const d of digits) await pad.getByRole('button', { name: d, exact: true }).tap();
      };
      const chip = (name: string) => sheet.locator('[data-slot="numpad-chips"]').getByRole('button', { name, exact: true });

      // 감시 중 안내(D-05) — 추가 확인은 없고 한 줄뿐이다.
      await expect(status).toHaveText('감시 중 — 적용하면 바로 반영돼요');
      await expect(display).toHaveText('71,000');

      // 첫 키가 값을 덮는다(fresh) → 98,150 은 100원 단위 위반 → 적용 잠금 · 보정 없음(D-15).
      await typeKeys('98150');
      await expect(display).toHaveText('98,150');
      await expect(alert).toHaveText('100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200');
      await expect(apply).toBeDisabled();

      // ⌫ 로 지우고 127450 → 상한가 초과 → 잠금.
      for (let i = 0; i < 5; i += 1) await pad.getByRole('button', { name: '한 글자 지우기' }).tap();
      await expect(display).toHaveText('');
      await expectUnitBesideCaret(sheet, '주문가격 · 다 지운 뒤');
      await typeKeys('127450');
      await expect(display).toHaveText('127,450');
      await expect(alert).toHaveText('상한가 127,400원을 넘을 수 없어요');
      await expect(apply).toBeDisabled();

      // 칩 — 같은 카드 시세(현재가 98,100 · 상한가 127,400)와 한 호가(100원 구간).
      await chip('현재가').tap();
      await expect(display).toHaveText('98,100');
      await expect(alert).toHaveCount(0);
      await chip('상한가').tap();
      await expect(display).toHaveText('127,400');
      await chip('1호가 내리기').tap();
      await expect(display).toHaveText('127,300');
      await chip('1호가 올리기').tap();
      await expect(display).toHaveText('127,400');
      // 서버 값(71,000)과 다른 값을 적용한다 — 127,300 으로 내려 적용해 에코 값과 구분한다.
      await chip('1호가 내리기').tap();
      await expect(display).toHaveText('127,300');
      await expect(status).toHaveText('감시 중 — 적용하면 바로 반영돼요');
      await expect(apply).toBeEnabled();
      expect(sets(), '시트 안의 키·칩은 아무것도 보내지 않는다').toBe(before);

      await apply.tap();
      await waitForSetAtGateway(relay, before + 1);
      // 한 번 눌렀으면 정확히 한 번(T-16-10).
      expect(sets()).toBe(before + 1);
      await relay.pushLimitChaserEcho({ buyEnabled: true, buyOrderPrice: 127_300 });
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 15_000 });
      await expect(lcValue(page, 'lc-buy-order-price')).toHaveText('127,300원', { timeout: 15_000 });
      // 닫히면 연 행으로 포커스가 돌아온다(UI-SPEC 접근성 계약).
      await expect(row).toBeFocused();
    });

    /*
      P20-5 — 수동주문 시트는 **값만 채운다**(D-10 · T-20-09). 시트 「가격 입력」「수량 입력」은 상자 값만
      바꾸고 닫힌다 — 게이트웨이 주문(DirectOrderReq)은 0 이다. 주문이 시작되는 길은 「매수」 → 확인
      다이얼로그 하나뿐이고, 다이얼로그를 취소하면 여전히 0 이다.
    */
    test('P20-5 수동주문 시트는 값만 채운다 — 가격·수량 상자 탭 → 시트 → 「입력」 뒤 주문 0 · 주문은 「매수」 → 확인 다이얼로그로만 (D-10 · T-20-09)', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      relay.seedLimitChasers([{ buyEnabled: true }]);
      await page.goto(FOCUS_URL);
      await waitForReady(page);
      const card = cardOf(page, E2E_ISIN);
      await expect(card).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
      await expect(lcValue(page, 'lc-buy-watch-qty')).toHaveText('10,000주', { timeout: 15_000 });
      const directOrders = () => relay.requestLog().filter((m) => m === DMA_MSG.DirectOrderReq).length;

      await card.getByRole('tablist', { name: '주문 진입' }).getByRole('tab', { name: '수동' }).tap();
      const form = card.getByTestId('manual-order-form');
      await expect(form).toBeVisible();
      // 터치 기기 — 인라인 입력칸이 없고 상자 전체가 시트를 여는 버튼이다.
      await expect(form.locator(`#mo-price-${E2E_ISIN}`)).toHaveCount(0);
      const priceBox = form.getByRole('button', { name: /^가격/ });
      await expect(priceBox).toHaveAttribute('aria-haspopup', 'dialog');

      await priceBox.tap();
      let sheet = await settledSheet(page);
      await expect(sheet).toHaveAccessibleName('가격');
      // 빈 상자로 처음 연 시트 — 단위 「원」이 캐럿 옆 같은 줄이다.
      await expect(sheet.locator('[data-slot="numpad-value"]')).toHaveText('');
      await expectUnitBesideCaret(sheet, '수동주문 가격 · 빈 값');
      await sheet.getByRole('button', { name: '현재가', exact: true }).tap();
      await expect(sheet.locator('[data-slot="numpad-value"]')).toHaveText('98,100');
      await sheet.getByRole('button', { name: '가격 입력' }).tap();
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 10_000 });
      await expect(form.getByRole('button', { name: '가격 98,100원' })).toBeVisible();
      await expect(form.getByRole('button', { name: '가격 98,100원' })).toBeFocused();

      await form.getByRole('button', { name: /^수량/ }).tap();
      sheet = await settledSheet(page);
      await expect(sheet).toHaveAccessibleName('수량');
      await sheet.getByRole('button', { name: '+1,000', exact: true }).tap();
      await expect(sheet.locator('[data-slot="numpad-value"]')).toHaveText('1,000');
      await sheet.getByRole('button', { name: '수량 입력' }).tap();
      await expect(page.locator('[data-slot="numpad-sheet"]')).toHaveCount(0, { timeout: 10_000 });
      await expect(form.getByRole('button', { name: '수량 1,000주' })).toBeVisible();

      // ★ 시트로 채운 것만으로는 아무것도 나가지 않는다 — 확인 다이얼로그도 없다.
      expect(directOrders(), '시트 「입력」은 주문을 보내지 않는다(D-10)').toBe(0);
      await expect(page.getByTestId('order-confirm-dialog')).toHaveCount(0);

      // 주문의 유일한 시작 — 「매수」 → 확인 다이얼로그. 취소하면 여전히 0 이다.
      await form.getByTestId('manual-order-buttons').getByRole('button', { name: '매수', exact: true }).tap();
      const confirm = page.getByTestId('order-confirm-dialog');
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: '취소', exact: true }).tap();
      await expect(confirm).toBeHidden();
      expect(directOrders()).toBe(0);
      expect(relay.orderInserts()).toHaveLength(0);
    });
  });
});

/*
  G-21-R3-10 이전 (Phase 21 21-34) — 비로그인은 wss 를 시도조차 하지 않는다 (옛 orderbook 10).
  프로젝트 레벨 storageState 를 비운다(chat.spec.ts 선례). relay 를 띄우지 않는다 — 열면 안 되는 소켓을 센다.
*/
test.describe('G-21-R3-10 이전 — 비로그인 /trading 게이트', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await mockStockApi(page, { searchResults: [FIXTURE_SAMSUNG] });
  });

  test('G-21-R3-10 이전 — 비로그인 /trading?code= 는 로그인 화면으로 보내지고 relay wss 연결을 시도하지 않는다 (옛 orderbook 10)', async ({
    page,
  }) => {
    const sockets = trackRelaySockets(page);
    await page.goto(LANDING_URL);

    // `/trading` 은 공개 경로가 아니다 — middleware 가 /login 으로 돌려보내는 것이 곧 로그인 안내다.
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();
    // 인증 없이 시세 소켓을 열지 않는다 — 열었다면 relay 가 4401 로 끊을 표면을 하나 더 만드는 것이다.
    expect(sockets).toEqual([]);
  });
});

/*
  G-21-R3-10 이전 (Phase 21 21-34) — 회선 단절 (옛 orderbook 9).
  게이트웨이를 통째로 내린다(소켓 파괴 + listen 종료) — 소켓만 끊으면 relay 가 1초 뒤 재접속에 성공해 배지가
  1초짜리 경주가 된다. 내린 게이트웨이는 되살릴 수 없으므로 **자기 relay 를 띄우는 맨 끝 describe** 에 둔다
  (위 describe 의 afterAll 이 8090 을 비운 뒤에 뜬다).
*/
test.describe('G-21-R3-10 이전 — 회선 단절 (자기 relay · 게이트웨이를 내린다)', () => {
  let relay: LocalRelay;

  test.beforeAll(async () => {
    relay = await withLocalRelay();
  });

  test.afterAll(async () => {
    await relay.stop();
  });

  test.beforeEach(async ({ page }) => {
    relay.reset();
    await page.setViewportSize(WIDE_VIEWPORT);
    await mockStockApi(page, { searchResults: [FIXTURE_SAMSUNG] });
  });

  test('G-21-R3-10 이전 — 회선 단절 → 상태줄 「재접속 중」 · 「다시 연결」 없음 · 카드 사다리는 비워지지 않는다 (옛 orderbook 9)', async ({
    page,
  }) => {
    const card = await landOnCard(page);
    const ladderRows = card.locator('[data-slot="orderbook-ladder"][data-variant="chaser"] [data-slot="ladder-row"]:visible');
    await expect(ladderRows).toHaveCount(20, { timeout: 15_000 });
    await expect(ladderRows.first()).toContainText('99,000');

    await relay.gateway.close();

    await expect(statusBar(page)).toHaveAttribute('data-status', 'reconnecting', { timeout: 20_000 });
    // DMA 필이 연결 상태를 말한다 — 문구는 `RELAY_STATE_LABELS` 한 곳. 자동 재연결 중에는 「다시 연결」이 없다.
    await expect(statusBar(page)).toContainText('재접속 중');
    await expect(statusBar(page).getByRole('button', { name: '다시 연결' })).toHaveCount(0);

    // ★ 핵심 — 마지막 값이 남아 있어야 한다. 빈 화면으로 되돌리면 사용자가 문맥을 잃는다.
    await expect(ladderRows).toHaveCount(20);
    await expect(ladderRows.first()).toContainText('99,000');
  });
});

/*
  Phase 26 D-01 · D-04 — 배지 2축(26-13 채택안 안 B). 시세 전용 공유 연결만 끊는다 — 사용자 DMA 세션은 그대로다.
  quote 로그인 자동 응답을 끄고(무응답) quote 소켓을 강제 종료하면 relay 는 재접속 · 로그인 타임아웃을 반복하고
  3초 디바운스 뒤 `quote.state` down 을 보낸다. 자동 응답을 되켜면 다음 재시도에서 live 로 돌아온다.
  자기 relay 를 띄운다 — 실패해도 quote 로그인 무응답 상태가 다른 describe 로 새지 않게(끝에서 되돌리기도 한다).
*/
test.describe('Phase 26 D-01 · D-04 — 시세 · 주문 배지 2축 (자기 relay · quote 연결만 끊는다)', () => {
  let relay: LocalRelay;

  test.beforeAll(async () => {
    relay = await withLocalRelay();
  });

  test.afterAll(async () => {
    await relay.stop();
  });

  test.beforeEach(async ({ page }) => {
    relay.reset();
    await page.setViewportSize(WIDE_VIEWPORT);
    await mockStockApi(page, { searchResults: [FIXTURE_SAMSUNG] });
  });

  test('Phase 26 D-01 · D-04 — 시세 끊김은 시세 필만 적색 · 호가 숫자 불변 · 복구 뒤 live', async ({ page }) => {
    test.setTimeout(90_000);
    const quotePill = page.locator('[data-slot="workbench-quote"]');
    const orderPill = page.locator('[data-slot="workbench-dma"]');
    /** 셀 하나의 실효 불투명도 — 자기부터 문서 루트까지 opacity 의 곱(조상 흐림까지 잡는다). */
    const effectiveOpacity = (loc: Locator) =>
      loc.evaluate((el) => {
        let o = 1;
        for (let n: Element | null = el; n !== null; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        return o;
      });

    const card = await landOnCard(page);
    const ladderRows = card.locator('[data-slot="orderbook-ladder"][data-variant="chaser"] [data-slot="ladder-row"]:visible');
    await expect(ladderRows).toHaveCount(20, { timeout: 15_000 });
    await expect(ladderRows.first()).toContainText('99,000');

    // 평상시 — 「● 시세」 · 「● 주문」. 보이는 상태어가 없다(안 B).
    await expect(quotePill).toHaveAttribute('data-tone', 'ok', { timeout: 15_000 });
    await expect(quotePill).toHaveAttribute('aria-live', 'polite');
    await expect(quotePill.locator('b')).toHaveCount(0);
    await expect(orderPill.locator('b')).toHaveCount(0);
    const opacityBefore = await effectiveOpacity(ladderRows.first());

    try {
      // quote 연결만 끊는다 — 로그인 무응답으로 재접속이 성공하지 못하게 한다.
      relay.gateway.respondQuoteLogin(null);
      relay.gateway.hardClose(await relay.quoteSocket());

      // 3초 디바운스 뒤 시세 필만 적색 — 끊긴 시각(KST)과 「멈춤」.
      await expect(quotePill).toHaveAttribute('data-tone', 'down', { timeout: 15_000 });
      await expect(quotePill).toHaveText(/^시세 \d{2}:\d{2}:\d{2}~ 멈춤$/);
      // 주문 필은 사용자 DMA 세션 상태를 따로 말한다 — 여전히 ready · 상태어 없음.
      await expect(statusBar(page)).toHaveAttribute('data-status', 'ready');
      await expect(orderPill.locator('b')).toHaveCount(0);
      await expect(orderPill.locator('[data-tone]')).toHaveAttribute('data-tone', 'ok');

      // ★ D-04 — 호가 숫자는 흐리지도 비우지도 않는다.
      await expect(ladderRows).toHaveCount(20);
      await expect(ladderRows.first()).toContainText('99,000');
      expect(await effectiveOpacity(ladderRows.first())).toBe(opacityBefore);
    } finally {
      // 되돌린다 — 다음 로그인 재시도가 성공한다(로그인 타임아웃 5초 + 재접속 지연).
      relay.gateway.respondQuoteLogin({ success: true });
    }

    await expect(quotePill).toHaveAttribute('data-tone', 'ok', { timeout: 30_000 });
    await expect(quotePill.locator('b')).toHaveCount(0);
    await expect(statusBar(page)).toHaveAttribute('data-status', 'ready');
    await expect(ladderRows.first()).toContainText('99,000');
  });
});
