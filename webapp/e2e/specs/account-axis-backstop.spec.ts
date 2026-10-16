import { test, expect, type Locator, type Page, type WebSocketRoute } from '@playwright/test';

import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { mockStockApi } from '../fixtures/mock-api';
import { E2E_ISIN, E2E_LONG_NAME_ISIN, withLocalRelay, type LocalRelay } from '../fixtures/relay';
import { accountChips, expectAccount, pickAccount } from '../fixtures/workbench-account';
import { leavesOverflowing, scrollOverflowing } from '../overflow';

/**
 * Phase 32 Plan 10 Task 1 — 계좌 축 **폭 백스톱** (`P32-backstop` · AXIS-01~05).
 *
 * ① 출처 — `.planning/phases/32-account-axis/32-UI-SPEC.md`
 *   「폭 백스톱」 절 · 「폭 백스톱(수정분)」 절 · UI Considerations 의 backstop 행(S1 long-text · S3 overflow ·
 *   S4 long-text · S9 long-text · S13 overflow)과 수정분의 설정 탭 제목 줄(S8′). 수정 절이 무효로 한
 *   S5 overflow · S7 long-text · S8 overflow · S10 long-text 는 표면이 없어 잇지 않는다.
 *
 * ② 최악값 글자 (UI-SPEC 「폭 백스톱」 그대로)
 *   번호 12자 「1234-5678-90」 · 상품명 15자 「종합매매(위탁) 김알렉스」 · 서버키 「KYOBO127」 →
 *   셀렉트 옵션 · 토스트 계좌 줄 「1234-5678-90 · 종합매매(위탁) 김알렉스 · KYOBO127」.
 *   계좌 4개는 로그인 응답이 정한다(번호 · 상품명 최악값 · 상품명은 끝 글자만 달라 사이드바 짧은 라벨이 번호로
 *   떨어지지 않는다 — 같은 상품명 ∧ 같은 서버키면 번호가 된다).
 *
 * ③ ★ 서버키 최악값은 측정 직전 글자를 바꿔 잰다 (32-10 PLAN Flagged assumption)
 *   E2E 하네스의 세션 서버키는 relay env 모드 증권사 이름(`DMA_BROKER` — "KB" | "KYOBO" 만 허용)이라 「KYOBO127」 을
 *   픽스처로 띄울 수 없다. 그래서 화면이 선 뒤 서버키 칩 · 셀렉트 옵션 · 토스트 계좌 줄 글자를 `page.evaluate` 로
 *   최악값으로 바꾸고(**레이아웃만 다시 잰다** — 상태 · 이벤트는 건드리지 않는다) 판정한다. React 는 자기 prop 값이
 *   바뀔 때만 그 글자 노드를 다시 쓰므로 바꾼 글자는 측정 동안 남는다 — 그래도 매 판정 직전에 글자를 단언한다.
 *   단 S13 「새로고침 뒤 선택 칩 scrollIntoView」 는 마운트 시점 동작이라 글자를 바꿀 틈이 없다 — 그 단계만 하네스
 *   서버키("KB")로 재고, 칩 4개 합 폭이 줄 폭의 2배를 넘는다는 것을 먼저 단언해 「밖에 있던 칩」 이 성립함을 보인다.
 *
 * ④ 폭 (뷰포트로 맞춘다)
 *   S1 작업대 상단 줄은 UI-SPEC 「본문 344(폰) · 685 · 830 · 992」 를 **뷰포트** 344 · 685 · 830 · 992 로 잰다.
 *   685 · 830 · 992 는 `webapp/src/styles/globals.css` §2.2b 의 카드 밴드 경계와 같은 값이다 — **경계가 바뀌면 이
 *   spec 의 `TOP_VIEWPORTS` 도 같이 갱신한다.** 폰은 뷰포트 344(본문 < 344 · 더 가혹하다 — unfilled-progress P25-P6 과
 *   같은 최악 폭). /me 는 본문(`me-page`) 334 가 되는 뷰포트 350(셸 `main` 폰 패딩 p-2 — 390 이면 본문 374) · 본문 폭을
 *   먼저 단언한다. 사이드바 240 은 데스크톱(≥ lg) `aside` · 드로어 280 은 시트 폭이 280 이 되는 뷰포트 373
 *   (`DRAWER_280` 주석 — 시트 실제 폭 = 뷰포트 75%). 토스트 「폰 전폭」 은 뷰포트 390.
 *
 * ⑤ 「주문 끊김 · 다시 연결」 (S1 error)
 *   relay 픽스처에는 브라우저를 `failed` 로 만드는 장치가 없다. 그래서 Playwright `page.routeWebSocket` 으로 relay
 *   소켓을 그대로 잇고(`connectToServer` · 프레임 무변경 통과) 준비가 끝난 뒤 **브라우저 쪽만** close 4400 으로 닫는다 —
 *   웹 소켓 훅은 4400(프로토콜 위반)을 재시도 없이 `failed` 로 확정하고(`use-relay-socket.ts`) 작업대는 그 상태에서
 *   주문 알약을 「끊김 · 다시 연결」 로 그린다(`UNRECOVERABLE_STATES`). 계좌 목록은 그대로 남아 셀렉트 최악값과 함께 잰다.
 *
 * ⑥ 판정은 `e2e/overflow.ts` 하나 + 박스 포함 · 줄 수(새 판정식을 만들지 않는다).
 *   32-15 — 상단 줄 계좌 선택이 셀렉트에서 칩 줄(`MeAccountChips`)로 바뀌었다. 칩 줄은 넘치면 **그 줄 안에서** 가로
 *   스크롤하는 영역이다(/me S13 과 같다) — 그래서 칩 줄 박스는 카드 안 · 칩마다 글자 잘림 0 · 칩 한 줄을 보고,
 *   칩 줄 자신의 스크롤 폭(`div[workbench-account]`)과 그 안 잎 좌표는 넘침 판정에서 뺀다. 폰(`wb` < 680)은 칩에서
 *   번호가 빠진 「상품명 · 서버키」 다.
 *
 * ⑦ relay 를 쓰는 spec 규약(`fixtures/relay.ts` ⑥) — serial · beforeAll 1회 · afterAll stop · beforeEach reset.
 *   ★ 실서버 IP · 실계좌 리터럴 없음(D-27) — 계좌번호는 UI-SPEC 의 가짜 최악값이다.
 */

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// 최악값 픽스처 (② · ③)
// ---------------------------------------------------------------------------

const WORST_NO = '1234-5678-90';
const WORST_NAME = '종합매매(위탁) 김알렉스';
const WORST_SERVER = 'KYOBO127';
const WORST_FULL = `${WORST_NO} · ${WORST_NAME} · ${WORST_SERVER}`;

/** 로그인 응답 계좌 4개 — 첫 계좌가 최악값 그 자체 · 나머지는 번호 · 상품명 끝 글자만 다르다(같은 길이). */
const ACCOUNTS = [
  { accountNo: WORST_NO, name: WORST_NAME },
  { accountNo: '1234-5678-91', name: '종합매매(위탁) 박알렉스' },
  { accountNo: '1234-5678-92', name: '종합매매(위탁) 이알렉스' },
  { accountNo: '1234-5678-93', name: '종합매매(위탁) 최알렉스' },
] as const;

/** 계좌별 켜진 전략 1건씩(사이드바 묶음 4개 — S3). 종목은 sidebar-tree spec 과 같은 ISIN. */
const SIDEBAR_ISINS = [E2E_ISIN, E2E_LONG_NAME_ISIN, 'KR7086520004', 'KR7007660006'] as const;

/** S1 뷰포트 — 685 · 830 · 992 = globals.css §2.2b 경계(④). 경계가 바뀌면 같이 고친다. */
const TOP_VIEWPORTS = [344, 685, 830, 992] as const;
const PHONE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1280, height: 900 } as const;
/**
 * /me 「폰 본문 334」 — 앱 셸 `main` 의 폰 패딩(p-2 = 좌우 8)을 빼면 뷰포트 350 = 본문 334 다(390 이면 374 — 실측).
 * 본문 폭을 판정 전에 단언한다(셸 패딩이 바뀌면 여기서 먼저 드러난다).
 */
const ME_PHONE = { width: 350, height: 844 } as const;
const ME_BODY = 334;
/**
 * 드로어 280 — 시트는 `w-[min(280px,85vw)]` 를 받지만 shadcn `data-[side=left]:w-3/4` 가 이겨 실제 폭은 뷰포트의 75% 다
 * (뷰포트 390 이면 293 · 이 phase 밖 기존 동작 — deferred-items 기록). 그래서 드로어가 280 이 되는 뷰포트 373 에서 잰다.
 */
const DRAWER_280 = { width: 373, height: 844 } as const;

// ---------------------------------------------------------------------------
// 조회구 · 측정 헬퍼
// ---------------------------------------------------------------------------

const statusBar = (page: Page) => page.locator('[data-slot="workbench-status-bar"]');
const desktopNav = (page: Page) => page.locator('aside nav[aria-label="주 메뉴"]');
const drawerNav = (page: Page) => page.locator('[data-slot="sheet-content"] nav[aria-label="주 메뉴"]');
const meChips = (page: Page) => page.locator('[data-slot="me-account-chip"]');
const lcDefaults = (page: Page) => page.locator('[data-slot="me-lc-defaults"]');

/** 고른 요소 전부의 글자를 바꾼다(③ — 레이아웃만 다시 잰다). 바꾼 개수를 돌려준다. */
async function setTextAll(scope: Locator, selector: string, text: string): Promise<number> {
  return scope.evaluate(
    (el, [sel, t]) => {
      const els = Array.from(el.querySelectorAll<HTMLElement>(sel));
      for (const e of els) e.textContent = t;
      return els.length;
    },
    [selector, text] as const,
  );
}

/** 문서 · 앱 본문(`main`)의 가로 스크롤 — 넘친 스크롤러 목록(빈 배열 = 가로 스크롤 0). */
async function pageHorizontalScroll(page: Page): Promise<{ who: string; over: number }[]> {
  return page.evaluate(() => {
    const out: { who: string; over: number }[] = [];
    const doc = document.scrollingElement ?? document.documentElement;
    if (doc.scrollWidth - doc.clientWidth > 1) out.push({ who: 'document', over: doc.scrollWidth - doc.clientWidth });
    for (const m of Array.from(document.querySelectorAll('main'))) {
      if (m.scrollWidth - m.clientWidth > 1) out.push({ who: 'main', over: m.scrollWidth - m.clientWidth });
    }
    return out;
  });
}

type Rect = { left: number; right: number; top: number; bottom: number; width: number; height: number };

async function rectOf(loc: Locator): Promise<Rect> {
  const b = await loc.boundingBox();
  expect(b, '요소의 박스를 잴 수 없습니다(렌더되지 않았을 수 있음)').not.toBeNull();
  return { left: b!.x, right: b!.x + b!.width, top: b!.y, bottom: b!.y + b!.height, width: b!.width, height: b!.height };
}

/** `inner` 박스가 `outer` 의 가로 범위 안(1px 여유). */
function expectInside(inner: Rect, outer: Rect, label: string): void {
  expect(inner.left, `${label} — 왼쪽이 밖`).toBeGreaterThanOrEqual(outer.left - 1);
  expect(inner.right, `${label} — 오른쪽이 밖`).toBeLessThanOrEqual(outer.right + 1);
}

/** 슬라이드 인 애니메이션(드로어 Sheet)이 끝나 박스가 멈출 때까지 기다린다 — 움직이는 중에 재면 경계가 엇갈린다. */
async function waitStable(loc: Locator): Promise<void> {
  let prev = '';
  await expect
    .poll(
      async () => {
        const b = await loc.boundingBox();
        const now = b === null ? 'none' : `${b.x.toFixed(1)},${b.width.toFixed(1)}`;
        const same = now === prev && now !== 'none';
        prev = now;
        return same;
      },
      { timeout: 5_000, intervals: [100] },
    )
    .toBe(true);
}

/** 요소 자신의 글자가 자기 상자를 넘지 않는다(잘림 0). */
async function expectNotClipped(loc: Locator, label: string): Promise<void> {
  const over = await loc.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(over, `${label} — 글자가 상자를 넘침(${over}px)`).toBeLessThanOrEqual(1);
}

/** 측정값 기록(SUMMARY 용) — annotation + 콘솔. */
function record(type: string, description: string): void {
  test.info().annotations.push({ type, description });
  console.log(`[${type}] ${description}`);
}

/** /me 현황 탭 준비 — 상태줄 ready + 계좌 칩 4개(me.spec `waitForReady` 와 같은 신호). */
async function waitForMeReady(page: Page): Promise<void> {
  await expect(page.locator('[data-slot="me-status-bar"]')).toHaveAttribute('data-status', 'ready', {
    timeout: 30_000,
  });
  await expect(meChips(page)).toHaveCount(ACCOUNTS.length, { timeout: 30_000 });
}

/** /me 를 폰 본문 334 로 연다 — 본문(`me-page`) 폭을 먼저 단언한다(④). */
async function openMePhone(page: Page): Promise<void> {
  await page.setViewportSize(ME_PHONE);
  await page.goto('/me');
  await waitForMeReady(page);
  const body = await rectOf(page.locator('[data-slot="me-page"]'));
  expect(Math.round(body.width), '/me 폰 본문 폭').toBe(ME_BODY);
}

/** /me 탭을 연다(라벨 뒤 숫자가 붙을 수 있어 접두 정규식). */
async function openMeTab(page: Page, label: string, value: string): Promise<void> {
  await page.getByRole('tablist', { name: 'My page 탭' }).getByRole('tab', { name: new RegExp(`^${label}`) }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]tab=${value}(&|$)`));
}

/** 작업대 준비 + 계좌 칩 4개 + 고른 계좌. */
async function openWorkbench(page: Page, accountNo: string): Promise<Locator> {
  await page.goto('/trading');
  await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  const account = statusBar(page).locator('[data-slot="workbench-account"]');
  await expect(accountChips(account)).toHaveCount(ACCOUNTS.length, { timeout: 30_000 });
  await pickAccount(account, accountNo);
  await expectAccount(account, accountNo);
  return account;
}

/** S1 — 상단 줄 계좌 칩 4개의 서버키 부분을 최악값으로(③ · 번호 · 상품명은 픽스처가 이미 최악값). */
async function injectWorstTop(page: Page): Promise<void> {
  const bar = statusBar(page);
  const c = await setTextAll(bar, '[data-slot="workbench-account"] [data-part="server"]', WORST_SERVER);
  expect(c, '칩 안 서버키').toBe(ACCOUNTS.length);
}

/**
 * S1 판정 — 뷰포트 `vw` 에서 상단 줄 항목(셀렉트 · 칩 · 시세 · 주문 묶음 · 세그먼트)이 카드 안 · 잘림 0 · 가로 스크롤 0 ·
 * 세그먼트는 (줄바꿈했든 아니든) 카드 오른쪽 끝(`ml-auto`).
 */
async function expectTopRowFits(page: Page, vw: number, state: 'ready' | 'failed'): Promise<void> {
  await page.setViewportSize({ width: vw, height: 900 });
  const bar = statusBar(page);
  await expect(bar).toBeVisible();
  await expect(bar.locator('[data-slot="workbench-account"] [data-part="server"]')).toHaveText(
    ACCOUNTS.map(() => WORST_SERVER),
  );
  await expect(bar.locator('[data-slot="workbench-account-server"]')).toHaveCount(0);
  if (state === 'failed') {
    await expect(bar.locator('[data-slot="workbench-reconnect"]')).toBeVisible();
    await expect(bar.locator('[data-slot="workbench-dma"]')).toContainText('끊김');
  }
  const label = `S1 ${state} 뷰포트 ${vw}`;
  // 세그먼트 유무 · 칩 번호 유무(32-15 폰 칩)는 작업대 ResizeObserver 판정(`wb` < 680 = 세그먼트를 빼고 칩을 줄인다)이
  // 다음 프레임에 정한다 — 그 판정이 새 폭을 따라잡을 때까지 기다린다(따라잡기 전에 재면 세그먼트를 빼먹고 잰다).
  await expect
    .poll(
      () =>
        bar.evaluate((root) => {
          const wb = root.parentElement?.getBoundingClientRect().width ?? 0;
          const has = root.querySelector('[data-slot="workbench-cols-segment"]') !== null;
          const nos = root.querySelectorAll('[data-slot="workbench-account"] [data-part="no"]').length;
          return has === wb >= 680 && nos === (wb >= 680 ? 4 : 0);
        }),
      { timeout: 5_000, message: `${label} — 세그먼트 · 칩 번호 유무가 본문 폭 판정과 다름` },
    )
    .toBe(true);

  const m = await bar.evaluate((root) => {
    const cs = getComputedStyle(root);
    const r = root.getBoundingClientRect();
    const contentLeft = r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
    const contentRight = r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    const slots = [
      'workbench-account',
      'workbench-quote',
      'workbench-order',
      'workbench-reconnect',
      'workbench-cols-segment',
    ];
    const items = slots
      .map((slot) => {
        const el = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
        if (el === null) return null;
        const b = el.getBoundingClientRect();
        return {
          slot,
          left: b.left,
          right: b.right,
          top: b.top,
          bottom: b.bottom,
          // 칩 줄은 넘치면 줄 안에서 가로 스크롤한다(⑥) — 자기 스크롤 폭은 잘림이 아니다(칩은 아래 `chips` 가 본다).
          over: slot === 'workbench-account' ? 0 : el.scrollWidth - el.clientWidth,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const row = root.querySelector<HTMLElement>('[data-slot="workbench-account"]');
    const chips = Array.from(row?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []).map((c) => ({
      top: Math.round(c.getBoundingClientRect().top),
      over: c.scrollWidth - c.clientWidth,
      parts: Array.from(c.querySelectorAll<HTMLElement>('[data-part]')).map((p) => p.scrollWidth - p.clientWidth),
    }));
    const rowScroll = row === null ? null : { overflowX: getComputedStyle(row).overflowX, over: row.scrollWidth - row.clientWidth };
    // 줄 수 = 세로 중심이 8px 넘게 갈리는 묶음 수(높이가 다른 항목 — 계좌 칩 줄 32 · 알약 · 세그먼트 24 — 은 같은 줄에서 윗변이 다르다).
    const centers = items.map((i) => (i.top + i.bottom) / 2).sort((a, b) => a - b);
    const lines = centers.reduce((n, c, k) => (k > 0 && c - centers[k - 1] > 8 ? n + 1 : n), centers.length > 0 ? 1 : 0);
    return {
      contentLeft,
      contentRight,
      width: r.width,
      items,
      lines,
      chips,
      rowScroll,
      wb: root.parentElement?.getBoundingClientRect().width ?? -1,
    };
  });

  for (const it of m.items) {
    expect(it.left, `${label} — ${it.slot} 왼쪽이 카드 밖`).toBeGreaterThanOrEqual(m.contentLeft - 1);
    expect(it.right, `${label} — ${it.slot} 오른쪽이 카드 밖`).toBeLessThanOrEqual(m.contentRight + 1);
    expect(it.over, `${label} — ${it.slot} 글자 잘림`).toBeLessThanOrEqual(1);
  }
  // 칩 줄(⑥) — 칩 4개 한 줄 · 칩 · 부분 글자 잘림 0 · 넘치면 줄 자신이 가로 스크롤(overflow-x auto).
  expect(m.chips, `${label} — 계좌 칩 수`).toHaveLength(ACCOUNTS.length);
  expect(new Set(m.chips.map((c) => c.top)).size, `${label} — 계좌 칩이 두 줄 이상`).toBe(1);
  for (const [i, c] of m.chips.entries()) {
    expect(c.over, `${label} — 계좌 칩 ${i} 글자 잘림`).toBeLessThanOrEqual(1);
    for (const p of c.parts) expect(p, `${label} — 계좌 칩 ${i} 부분 잘림`).toBeLessThanOrEqual(1);
  }
  if (m.rowScroll !== null && m.rowScroll.over > 1) expect(m.rowScroll.overflowX, `${label} — 칩 줄 스크롤`).toBe('auto');
  const seg = m.items.find((i) => i.slot === 'workbench-cols-segment');
  if (seg !== undefined) {
    // 한 줄이든 다음 줄이든 세그먼트는 그 줄 오른쪽 끝(ml-auto · UI-SPEC S1 「다음 줄 오른쪽 끝」).
    expect(Math.abs(seg.right - m.contentRight), `${label} — 세그먼트가 오른쪽 끝이 아님`).toBeLessThanOrEqual(1.5);
  }
  // 밀린 잎 — 칩 줄 밖 항목만(칩 줄 안 잎은 스크롤 영역 안 좌표라 ⑥ 의 칩 판정이 본다).
  const barRight = (await rectOf(bar)).right;
  for (const slot of ['workbench-quote', 'workbench-order', 'workbench-cols-segment']) {
    const loc = bar.locator(`[data-slot="${slot}"]`);
    if ((await loc.count()) === 0) continue;
    expect(await leavesOverflowing(loc, barRight), `${label} — ${slot} 밀린 잎`).toEqual([]);
  }
  expect(
    (await scrollOverflowing(page, '[data-slot="workbench-status-bar"]')).filter((x) => x.tag !== 'div[workbench-account]'),
    `${label} — 넘친 요소`,
  ).toEqual([]);
  expect(await pageHorizontalScroll(page), `${label} — 페이지 가로 스크롤`).toEqual([]);
  record(
    'P32-backstop-S1',
    `${state} vw=${vw} 본문(wb)=${Math.round(m.wb)} 카드=${Math.round(m.width)} 줄=${m.lines} 세그먼트=${seg === undefined ? '없음(1열 고정)' : '있음'} 칩 줄 scroll=${m.rowScroll?.over ?? 0} 칩=${m.chips.length}${m.wb < 680 ? '(폰 · 번호 없음)' : ''}`,
  );
}

// ===========================================================================

test.describe('Phase 32 — 계좌 축 폭 백스톱 (로컬 relay)', () => {
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
    // 로그인 응답은 reset() 이 되돌리지 않는다 — 매번 최악값 4계좌로 명시한다.
    relay.gateway.respondLoginWithAccounts([...ACCOUNTS]);
    await mockStockApi(page);
    await mockHomeApi(page, { response: HOME_POPULATED });
    // /me 「오늘 주문」 복원 — 빈 목록(칩은 accounts[] 4개만).
    await page.route('**/api/orders', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
  });

  test('P32-backstop S1 작업대 상단 줄 — 뷰포트 344 · 685 · 830 · 992 · 최악값 계좌 칩 4개(KYOBO127 · 폰은 번호 없음) · 「주문 끊김 · 다시 연결」 · 세그먼트 잘림 0 · 가로 스크롤 0 · 넘치면 flex-wrap(세그먼트는 오른쪽 끝)', async ({
    page,
  }) => {
    // ⑤ relay 소켓을 그대로 잇는 라우트 — 나중에 브라우저 쪽만 4400 으로 닫는다.
    const routed: { ws: WebSocketRoute | null } = { ws: null };
    await page.routeWebSocket(/:8090\/ws/, (ws) => {
      routed.ws = ws;
      ws.connectToServer();
    });
    await page.setViewportSize({ width: 992, height: 900 });
    await openWorkbench(page, WORST_NO);
    await injectWorstTop(page);
    for (const vw of TOP_VIEWPORTS) await expectTopRowFits(page, vw, 'ready');

    // 「주문 끊김 · 다시 연결」 — 자동 복구 포기 상태(failed).
    expect(routed.ws, 'relay 소켓 라우트가 잡히지 않음').not.toBeNull();
    await routed.ws!.close({ code: 4400, reason: 'e2e P32-backstop' });
    await expect(statusBar(page)).toHaveAttribute('data-status', 'failed', { timeout: 15_000 });
    // 계좌 목록은 남는다 — 최악값 글자가 그대로인지 판정 함수가 다시 단언한다.
    for (const vw of TOP_VIEWPORTS) await expectTopRowFits(page, vw, 'failed');
  });

  test('P32-backstop S3 사이드바 240 · 드로어 280 — 최악값 상품명 소제목 말줄임 + title · KYOBO127 칩 · LED 3점 잘림 0', async ({
    page,
  }) => {
    relay.seedLimitChasers(
      ACCOUNTS.map((a, i) => ({
        isin: SIDEBAR_ISINS[i],
        accountNo: a.accountNo,
        exchange: 'KRX',
        buyEnabled: true,
        sellEnabled: i % 2 === 0,
      })),
    );

    const check = async (nav: Locator, where: string): Promise<void> => {
      await expect(nav.getByRole('link', { name: '트레이딩', exact: true })).toBeVisible({ timeout: 30_000 });
      const groups = nav.locator('[data-slot="sidebar-account-group"]');
      await expect(groups).toHaveCount(ACCOUNTS.length, { timeout: 15_000 });
      await expect(nav.locator('[data-strategy-key]')).toHaveCount(ACCOUNTS.length, { timeout: 15_000 });
      expect(await setTextAll(nav, '[data-slot="sidebar-account-server"]', WORST_SERVER)).toBe(ACCOUNTS.length);
      const navBox = await rectOf(nav);
      const truncated: boolean[] = [];

      for (let i = 0; i < ACCOUNTS.length; i += 1) {
        const a = ACCOUNTS[i];
        const group = nav.locator(`[data-slot="sidebar-account-group"][data-account-no="${a.accountNo}"]`);
        const heading = group.locator('[data-slot="sidebar-account-heading"]');
        const name = heading.locator('span').first();
        const chip = heading.locator('[data-slot="sidebar-account-server"]');
        const label = `S3 ${where} ${a.accountNo}`;

        // 소제목 = 상품명(짧은 라벨) · title = 전체 라벨(번호 · 상품명 · 서버키).
        await expect(name).toHaveText(a.name);
        await expect(heading).toHaveAttribute('title', new RegExp(`^${a.accountNo} · ${a.name.replace(/[()]/g, '\\$&')} · `));
        // 이름만 말줄임 — truncate(ellipsis) 장치 · 넘치면 그 글자는 title 이 전부 말한다.
        await expect(name).toHaveCSS('text-overflow', 'ellipsis');
        truncated.push(await name.evaluate((el) => el.scrollWidth - el.clientWidth > 1));

        // 서버키 칩 · 소제목 · LED 3점은 사이드바 안 · 칩 글자 잘림 0.
        await expect(chip).toHaveText(WORST_SERVER);
        await expectNotClipped(chip, `${label} 서버키 칩`);
        const chipBox = await rectOf(chip);
        const headingBox = await rectOf(heading);
        expectInside(headingBox, navBox, `${label} 소제목`);
        expectInside(chipBox, headingBox, `${label} 서버키 칩`);
        expect(chipBox.left, `${label} — 칩이 이름과 겹침`).toBeGreaterThanOrEqual((await rectOf(name)).right - 0.5);

        const leds = group.locator('[data-strategy-key] span[role="img"]');
        await expect(leds).toHaveCount(1);
        const ledBox = await rectOf(leds);
        expectInside(ledBox, navBox, `${label} LED 3점`);
        const dots = leds.locator('[data-led]');
        await expect(dots).toHaveCount(3);
        for (let d = 0; d < 3; d += 1) {
          const dot = await rectOf(dots.nth(d));
          expect(dot.width, `${label} LED ${d} 폭`).toBeGreaterThanOrEqual(6.5);
          expectInside(dot, navBox, `${label} LED ${d}`);
        }
      }
      expect(await leavesOverflowing(nav, navBox.right), `S3 ${where} — 밀린 잎`).toEqual([]);
      const side = await nav.evaluate((el) => (el.closest('aside, [data-slot="sheet-content"]') as HTMLElement).getBoundingClientRect().width);
      expect(Math.round(side), `S3 ${where} 사이드바 폭`).toBe(where === '데스크톱' ? 240 : 280);
      record('P32-backstop-S3', `${where} 사이드바=${Math.round(side)} nav=${Math.round(navBox.width)} 이름 말줄임=${truncated.join(',')}`);
    };

    await page.setViewportSize(DESKTOP);
    await page.goto('/trading');
    await check(desktopNav(page), '데스크톱');

    await page.setViewportSize(DRAWER_280);
    await page.goto('/trading');
    await page.getByRole('button', { name: '사이드바 열기' }).click();
    await expect(drawerNav(page)).toBeVisible();
    await waitStable(drawerNav(page));
    await check(drawerNav(page), '드로어');
  });

  test('P32-backstop S4 토스트 계좌 줄 — 폰 전폭 · ≥700 폭 340 · 최악값 계좌 줄 break-keep 두 줄 이내 · 「이 계좌 보기 ›」 잘림 0', async ({
    page,
  }) => {
    const cases = [
      { vw: PHONE, orderNo: '0000000971', where: '폰 390' },
      { vw: DESKTOP, orderNo: '0000000972', where: '≥700 1280' },
    ] as const;
    for (const c of cases) {
      await page.setViewportSize(c.vw);
      // 다른 계좌(B)를 보는 중에 최악값 계좌의 체결 → 계좌 줄 + 「이 계좌 보기 ›」.
      await openWorkbench(page, ACCOUNTS[1].accountNo);
      await relay.pushAccountState({
        accountNo: WORST_NO,
        unfilled: [
          {
            orderNo: c.orderNo,
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
      await relay.pushOrderResp({
        orderNo: c.orderNo,
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
      // 호버 = TTL 정지(측정 중 사라지지 않게).
      await toast.hover();
      const line = toast.locator('[data-part="account"]');
      const labelSpan = line.locator(':scope > span').first();
      const hint = toast.locator('[data-part="account-hint"]');
      await expect(labelSpan).toContainText(`계좌 ${WORST_NO} · ${WORST_NAME}`);
      await expect(hint).toHaveText('이 계좌 보기 ›');
      // ③ 서버키만 하네스 값이다 — 계좌 줄 글자를 최악값 전체로.
      await labelSpan.evaluate((el, t) => {
        el.textContent = t;
      }, `계좌 ${WORST_FULL}`);
      await expect(labelSpan).toHaveText(`계좌 ${WORST_FULL}`);

      const label = `S4 ${c.where}`;
      const toastBox = await rectOf(toast);
      const labelBox = await rectOf(labelSpan);
      const hintBox = await rectOf(hint);
      const lineHeight = await labelSpan.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
      // 두 줄 이내 · 말줄임 없음(전부 보인다) · break-keep.
      expect(Math.round(labelBox.height / lineHeight), `${label} — 계좌 줄 줄 수`).toBeLessThanOrEqual(2);
      await expect(line).toHaveCSS('word-break', 'keep-all');
      await expectNotClipped(labelSpan, `${label} 계좌 줄`);
      // 「이 계좌 보기 ›」 온전 · 토스트 안 · 계좌 글자와 겹치지 않음.
      await expectNotClipped(hint, `${label} 이 계좌 보기`);
      expectInside(hintBox, toastBox, `${label} 이 계좌 보기`);
      expectInside(labelBox, toastBox, `${label} 계좌 줄`);
      expect(hintBox.left, `${label} — 힌트가 계좌 글자와 겹침`).toBeGreaterThanOrEqual(labelBox.right - 0.5);
      expect(await leavesOverflowing(toast, toastBox.right), `${label} — 밀린 잎`).toEqual([]);
      record(
        'P32-backstop-S4',
        `${c.where} 토스트=${Math.round(toastBox.width)} 계좌 줄 ${Math.round(labelBox.height / lineHeight)}줄(높이 ${Math.round(labelBox.height)}) 힌트 폭=${Math.round(hintBox.width)}`,
      );
    }
  });

  test('P32-backstop S9 「이 기기」 카드 — 켜짐 ∧ 차단(AudioContext resume 거부) · 폰 /me 본문에서 「클릭해 활성화」 + 스위치 잘림 0', async ({
    page,
  }) => {
    // 자동재생 차단 재현 — 컨텍스트가 suspended 로 보이고 resume() 이 거부된다(헤드리스 크롬은 기본 자동재생 허용).
    await page.addInitScript(() => {
      const AC = window.AudioContext;
      if (AC === undefined) return;
      Object.defineProperty(AC.prototype, 'state', { configurable: true, get: () => 'suspended' });
      AC.prototype.resume = () => Promise.reject(new DOMException('e2e blocked', 'NotAllowedError'));
    });
    await openMePhone(page);
    await openMeTab(page, '설정', 'settings');

    const card = page.locator('[data-slot="me-device-card"]');
    const sw = card.locator('[data-slot="me-device-tone"]');
    await expect(sw).toBeVisible();
    if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    const activate = card.locator('[data-slot="me-device-tone-activate"]');
    await expect(activate).toHaveText('클릭해 활성화', { timeout: 10_000 });

    const cardBox = await rectOf(card);
    const actBox = await rectOf(activate);
    const swBox = await rectOf(sw);
    const rowLabel = await rectOf(card.locator('label').first());
    await expectNotClipped(activate, 'S9 클릭해 활성화');
    expectInside(actBox, cardBox, 'S9 클릭해 활성화');
    expectInside(swBox, cardBox, 'S9 스위치');
    expectInside(rowLabel, cardBox, 'S9 「돌파 알림음」 라벨');
    // 같은 줄이면 라벨 → 활성화 → 스위치 순 · 겹침 없음. 줄바꿈이면 활성화 묶음이 라벨 아래.
    const oneLine = Math.abs(actBox.top + actBox.height / 2 - (rowLabel.top + rowLabel.height / 2)) <= 4;
    if (oneLine) expect(actBox.left, 'S9 — 활성화가 라벨과 겹침').toBeGreaterThanOrEqual(rowLabel.right - 0.5);
    else expect(actBox.top, 'S9 — 줄바꿈인데 라벨 아래가 아님').toBeGreaterThanOrEqual(rowLabel.bottom - 0.5);
    expect(swBox.left, 'S9 — 스위치가 활성화와 겹침').toBeGreaterThanOrEqual(actBox.right - 0.5);
    expect(await scrollOverflowing(page, '[data-slot="me-device-card"]'), 'S9 — 넘친 요소').toEqual([]);
    expect(await leavesOverflowing(card, cardBox.right), 'S9 — 밀린 잎').toEqual([]);
    expect(await pageHorizontalScroll(page), 'S9 — 페이지 가로 스크롤').toEqual([]);
    record('P32-backstop-S9', `/me 본문 334 카드=${Math.round(cardBox.width)} ${oneLine ? '한 줄' : '줄바꿈'}`);
  });

  test('P32-backstop S13 /me 계좌 칩 줄 — 폰 본문 334 · 계좌 4개(최악값 상품명 · KYOBO127) 가로 스크롤 한 줄 · 칩 글자 잘림 0 · 페이지 가로 스크롤 0 · 마지막 칩 고른 뒤 새로고침하면 보이는 영역 안', async ({
    page,
  }) => {
    await openMePhone(page);
    const row = page.locator('[data-slot="me-account-chips"]');
    expect(await setTextAll(row, '[data-slot="me-account-chip"] [data-part="server"]', WORST_SERVER)).toBe(ACCOUNTS.length);

    const m = await row.evaluate((el) => {
      const chips = Array.from(el.querySelectorAll<HTMLElement>('[data-slot="me-account-chip"]'));
      return {
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        overflowX: getComputedStyle(el).overflowX,
        page: el.closest<HTMLElement>('[data-slot="me-page"]')?.getBoundingClientRect().width ?? -1,
        chips: chips.map((c) => ({
          top: Math.round(c.getBoundingClientRect().top),
          width: c.getBoundingClientRect().width,
          over: c.scrollWidth - c.clientWidth,
          text: c.textContent ?? '',
          parts: Array.from(c.querySelectorAll<HTMLElement>('[data-part]')).map((p) => p.scrollWidth - p.clientWidth),
        })),
      };
    });
    // 한 줄 — 칩 4개의 윗변이 같다.
    expect(new Set(m.chips.map((c) => c.top)).size, 'S13 — 칩이 두 줄 이상').toBe(1);
    // 줄 자체가 가로 스크롤(넘친 칩은 스크롤로 닿는다).
    expect(m.overflowX).toBe('auto');
    expect(m.scrollWidth, 'S13 — 칩 줄이 넘치지 않음(최악값인데 가로 스크롤 증거 없음)').toBeGreaterThan(m.clientWidth);
    for (const [i, c] of m.chips.entries()) {
      expect(c.text, `S13 칩 ${i} 최악값 글자`).toContain(WORST_SERVER);
      expect(c.over, `S13 칩 ${i} 글자 잘림`).toBeLessThanOrEqual(1);
      for (const p of c.parts) expect(p, `S13 칩 ${i} 부분 잘림`).toBeLessThanOrEqual(1);
    }
    expect(await pageHorizontalScroll(page), 'S13 — 페이지 가로 스크롤').toEqual([]);
    record(
      'P32-backstop-S13',
      `/me 본문(me-page)=${Math.round(m.page)} 칩 줄 client=${m.clientWidth} scroll=${m.scrollWidth} 칩 폭=${m.chips.map((c) => Math.round(c.width)).join(',')}`,
    );

    // 마지막 칩을 고르고 새로고침 → 마운트 때 scrollIntoView(inline nearest)로 보이는 영역 안(③ 하네스 서버키).
    const last = ACCOUNTS[ACCOUNTS.length - 1].accountNo;
    await page.locator(`[data-slot="me-account-chip"][data-account-no="${last}"]`).click();
    await expect(page.locator(`[data-slot="me-account-chip"][data-account-no="${last}"]`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.reload();
    await waitForMeReady(page);
    const lastChip = page.locator(`[data-slot="me-account-chip"][data-account-no="${last}"]`);
    await expect(lastChip).toHaveAttribute('aria-checked', 'true');
    const fresh = await row.evaluate((el) => ({ clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, scrollLeft: el.scrollLeft }));
    // 하네스 서버키로도 줄이 2배 이상 넘친다 = 마지막 칩은 스크롤 없이는 밖이다(scrollIntoView 가 할 일이 있다).
    expect(fresh.scrollWidth, 'S13 — 새로고침 뒤 칩 줄이 충분히 넘치지 않음').toBeGreaterThan(fresh.clientWidth * 1.5);
    await expect
      .poll(async () => {
        const rb = await rectOf(row);
        const cb = await rectOf(lastChip);
        return cb.left >= rb.left - 1 && cb.right <= rb.right + 1;
      }, { timeout: 5_000, message: 'S13 — 고른 마지막 칩이 칩 줄 보이는 영역 밖' })
      .toBe(true);
    record('P32-backstop-S13', `새로고침 뒤 scrollLeft=${fresh.scrollLeft} (client=${fresh.clientWidth} scroll=${fresh.scrollWidth})`);
  });

  test('P32-backstop S8′ /me 설정 탭 제목 줄 — 폰 본문 334 · 「상따 기본설정」 + KYOBO127 칩 + 상태 칩 한 줄 또는 상태 칩만 다음 줄 오른쪽 끝', async ({
    page,
  }) => {
    await openMePhone(page);
    await openMeTab(page, '설정', 'settings');
    const section = lcDefaults(page);
    const title = section.locator('#me-lc-defaults-title');
    const server = section.locator('[data-slot="me-lc-defaults-server"]');
    const status = section.locator('[data-slot="me-lc-defaults-chip"]');
    await expect(title).toHaveText('상따 기본설정');
    await expect(server).toBeVisible({ timeout: 15_000 });
    await expect(status).toBeVisible();

    // 「아직 못 받음」(UI-SPEC 최악값 조합) · 가장 긴 상태 칩 글자(「서버 저장값 없음 · 내장 기본값」) 둘 다 잰다.
    for (const chipText of ['아직 못 받음', '서버 저장값 없음 · 내장 기본값']) {
      await server.evaluate((el, t) => {
        el.textContent = t;
      }, WORST_SERVER);
      await status.evaluate((el, t) => {
        el.textContent = t;
      }, chipText);
      await expect(server).toHaveText(WORST_SERVER);
      await expect(status).toHaveText(chipText);
      const label = `S8′ 「${chipText}」`;

      const rowM = await title.evaluate((h) => {
        const row = h.parentElement as HTMLElement;
        const cs = getComputedStyle(row);
        const r = row.getBoundingClientRect();
        return {
          left: r.left + parseFloat(cs.paddingLeft),
          right: r.right - parseFloat(cs.paddingRight),
          width: r.width,
        };
      });
      const t = await rectOf(title);
      const s = await rectOf(server);
      const c = await rectOf(status);
      await expectNotClipped(server, `${label} 서버키 칩`);
      await expectNotClipped(status, `${label} 상태 칩`);
      await expectNotClipped(title, `${label} 제목`);
      // 제목 + 서버키 칩은 늘 한 줄 — 칩은 제목 바로 오른쪽.
      expect(Math.abs(s.top + s.height / 2 - (t.top + t.height / 2)), `${label} — 서버키 칩이 제목 줄이 아님`).toBeLessThanOrEqual(3);
      expect(s.left, `${label} — 서버키 칩이 제목과 겹침`).toBeGreaterThanOrEqual(t.right - 0.5);
      const sameLine = Math.abs(c.top + c.height / 2 - (t.top + t.height / 2)) <= 3;
      if (sameLine) {
        expect(c.left, `${label} — 상태 칩이 서버키 칩과 겹침`).toBeGreaterThanOrEqual(s.right - 0.5);
      } else {
        // 넘치면 상태 칩만 다음 줄.
        expect(c.top, `${label} — 상태 칩이 다음 줄이 아님`).toBeGreaterThanOrEqual(Math.max(t.bottom, s.bottom) - 0.5);
      }
      // 어느 쪽이든 상태 칩은 그 줄 오른쪽 끝(ml-auto) · 줄 안.
      expect(Math.abs(c.right - rowM.right), `${label} — 상태 칩이 오른쪽 끝이 아님`).toBeLessThanOrEqual(1.5);
      expectInside(c, { ...c, left: rowM.left, right: rowM.right }, `${label} 상태 칩`);
      expectInside(s, { ...s, left: rowM.left, right: rowM.right }, `${label} 서버키 칩`);
      expect(await leavesOverflowing(section, (await rectOf(section)).right), `${label} — 밀린 잎`).toEqual([]);
      record('P32-backstop-S8p', `/me 본문 334 제목 줄=${Math.round(rowM.width)} 「${chipText}」 ${sameLine ? '한 줄' : '상태 칩 다음 줄 오른쪽 끝'}`);
    }
    expect(await pageHorizontalScroll(page), 'S8′ — 페이지 가로 스크롤').toEqual([]);
  });
});
