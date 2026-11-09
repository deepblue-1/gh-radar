import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JournalOrderRow } from '@gh-radar/shared';

/**
 * Phase 40 — 체결 알림 탭 착지(D-21 · D-24 · SC-1 「탭하면 주문로그」).
 *
 * 깨졌을 때 사용자가 겪는 일:
 *  - 계좌를 못 붙이면 → 주문로그가 시세 이벤트만 보여 「내 체결」 이 안 보인다(Pitfall 9)
 *  - 최근 계좌가 아니라 아무 계좌나 붙이면 → 두 계좌로 같은 종목을 산 날 엉뚱한 계좌 로그가 열린다
 *  - 경로 검증이 약하면 → 조작된 payload 로 외부 주소 · 다른 화면으로 이동한다(T-21-16 동형)
 *  - 주문 읽기 실패 · 지연에 막히면 → 탭해도 아무 화면도 안 열린다
 *  - 지난 날짜 알림(19:59 에 받고 자정 뒤 탭)에서 계좌를 안 찾으면 → 탭해도 그 주문이 안 보인다(리뷰 IN-03)
 */

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

import { resolvePushTapPath } from '../push-tap';
import { startPushSession, TAP_ORDERS_TIMEOUT_MS } from '../push-session';

const TODAY = '2026-11-06';
const ISIN = 'KR7282720005';

function order(over: Partial<JournalOrderRow>): JournalOrderRow {
  return {
    id: 'o1',
    tradeDate: TODAY,
    accountNo: 'A',
    isin: ISIN,
    stockCode: '282720',
    exchange: 'KRX',
    board: null,
    side: 'B',
    orderType: 'N',
    orgOrderNo: null,
    qty: 10,
    price: 1000,
    orderNo: '1',
    filledQty: 0,
    modifiedQty: 0,
    status: 'accepted',
    resultCode: 0,
    noticeType: null,
    message: null,
    origin: null,
    requester: null,
    requestKind: null,
    lastSeq: 1,
    createdAt: '2026-11-06T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:00.000Z',
    ...over,
  };
}

const TWO_ACCOUNTS = [
  order({ id: 'a', accountNo: 'A', updatedAt: '2026-11-06T00:00:00.000Z' }), // KST 09:00
  order({ id: 'b', accountNo: 'B', updatedAt: '2026-11-06T00:05:00.000Z' }), // KST 09:05
];

describe('resolvePushTapPath', () => {
  it('오늘 · 그 종목 주문 2건 → 가장 최근(updatedAt) 계좌 B 를 붙인 정본 경로(오늘 날짜 생략)', () => {
    const path = resolvePushTapPath(
      { path: `/trading/order-log?stock=${ISIN}&date=${TODAY}` },
      TWO_ACCOUNTS,
      TODAY,
    );
    expect(path).toBe(`/trading/order-log?account=B&stock=${ISIN}`);
  });

  it('주문 순서가 바뀌어도 최근 계좌를 고른다 · 다른 종목 주문은 보지 않는다', () => {
    const orders = [
      order({ id: 'x', isin: 'KR7005930003', accountNo: 'Z', updatedAt: '2026-11-06T05:00:00.000Z' }),
      ...[...TWO_ACCOUNTS].reverse(),
    ];
    expect(resolvePushTapPath({ path: `/trading/order-log?stock=${ISIN}&date=${TODAY}` }, orders, TODAY)).toBe(
      `/trading/order-log?account=B&stock=${ISIN}`,
    );
  });

  it('그 종목 주문이 없으면 계좌 없는 정본 경로', () => {
    expect(resolvePushTapPath({ path: `/trading/order-log?stock=${ISIN}&date=${TODAY}` }, [], TODAY)).toBe(
      `/trading/order-log?stock=${ISIN}`,
    );
  });

  it('IN-03 지난 날짜 → 그 날 주문에서 그 종목의 가장 최근 계좌를 붙인다(날짜는 쿼리에 남는다)', () => {
    const yesterday = [
      order({ id: 'y1', tradeDate: '2026-11-05', accountNo: 'C', updatedAt: '2026-11-05T10:59:00.000Z' }),
      order({ id: 'y2', tradeDate: '2026-11-05', accountNo: 'D', updatedAt: '2026-11-05T09:00:00.000Z' }),
    ];
    expect(
      resolvePushTapPath({ path: `/trading/order-log?stock=${ISIN}&date=2026-11-05` }, yesterday, TODAY),
    ).toBe(`/trading/order-log?account=C&date=2026-11-05&stock=${ISIN}`);
  });

  it('IN-03 지난 날짜인데 주문의 거래일이 다르면(오늘 주문) 계좌 없이 그 날짜', () => {
    expect(
      resolvePushTapPath({ path: `/trading/order-log?stock=${ISIN}&date=2026-11-05` }, TWO_ACCOUNTS, TODAY),
    ).toBe(`/trading/order-log?date=2026-11-05&stock=${ISIN}`);
  });

  it('payload 에 계좌가 실려 와도 쓰지 않는다 — 계좌는 늘 그 날짜 주문에서 정한다', () => {
    expect(
      resolvePushTapPath({ path: `/trading/order-log?account=EVIL&stock=${ISIN}&date=2026-11-05` }, TWO_ACCOUNTS, TODAY),
    ).toBe(`/trading/order-log?date=2026-11-05&stock=${ISIN}`);
  });

  it('stock 이 ISIN 꼴이 아니면 parseOrderLogQuery 교정 결과(전체 종목) — 계좌도 붙이지 않는다', () => {
    expect(resolvePushTapPath({ path: `/trading/order-log?stock=282720&date=${TODAY}` }, TWO_ACCOUNTS, TODAY)).toBe(
      '/trading/order-log',
    );
  });

  it.each([
    ['문자열 아님', 42],
    ['없음', undefined],
    ['프로토콜 상대', '//evil.com/trading/order-log'],
    ['역슬래시 우회', '/\\evil.com'],
    ['외부 URL', 'https://evil.com/trading/order-log'],
    ['다른 화면', '/trading/orders'],
    ['접두만 같은 경로', '/trading/order-log-x?stock=KR7282720005'],
    ['하위 경로', '/trading/order-log/x'],
  ])('%s → null', (_name, path) => {
    expect(resolvePushTapPath({ path }, TWO_ACCOUNTS, TODAY)).toBeNull();
  });
});

/* ── startPushSession 탭 한 길 ─────────────────────────────────────── */

type Listener = { event: string; cb: (data: unknown) => void; remove: ReturnType<typeof vi.fn> };

function installApp(opts: { plugin?: boolean } = {}) {
  const listeners: Listener[] = [];
  const cap = {
    isPluginAvailable: vi.fn(() => opts.plugin !== false),
    nativePromise: vi.fn(async () => ({})),
    addListener: vi.fn((_plugin: string, event: string, cb: (data: unknown) => void) => {
      const l: Listener = { event, cb, remove: vi.fn(async () => {}) };
      listeners.push(l);
      return { remove: l.remove };
    }),
  };
  (window as unknown as { Capacitor?: unknown }).Capacitor = cap;
  document.documentElement.classList.add('native-app');
  document.documentElement.setAttribute('data-native-platform', 'ios');
  const tap = (data: unknown) => {
    for (const l of listeners) if (l.event === 'pushNotificationActionPerformed') l.cb({ notification: { data } });
  };
  return { cap, listeners, tap };
}

/** KST 2026-11-06 10:00. */
const NOW = () => new Date('2026-11-06T01:00:00.000Z');

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  document.documentElement.classList.remove('native-app');
  document.documentElement.removeAttribute('data-native-platform');
  vi.restoreAllMocks();
});

describe('startPushSession — 탭 리스너', () => {
  it('앱 · 플러그인 있음 → 탭 리스너 1개 · 탭 → 오늘 주문 → 계좌 붙인 경로로 push · 정리 함수가 리스너를 뗀다', async () => {
    const { listeners, tap } = installApp();
    const push = vi.fn();
    const fetchOrders = vi.fn(async () => TWO_ACCOUNTS);
    const stop = startPushSession({ push, fetchOrders, now: NOW });

    const taps = listeners.filter((l) => l.event === 'pushNotificationActionPerformed');
    expect(taps).toHaveLength(1);

    tap({ path: `/trading/order-log?stock=${ISIN}&date=${TODAY}` });
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith(`/trading/order-log?account=B&stock=${ISIN}`);
    expect(fetchOrders).toHaveBeenCalledTimes(1);
    expect(fetchOrders).toHaveBeenCalledWith(TODAY);

    stop();
    expect(taps[0]!.remove).toHaveBeenCalledTimes(1);
  });

  it('주문 읽기 실패 → 계좌 없이 연다(warn 1줄)', async () => {
    const { tap } = installApp();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const push = vi.fn();
    startPushSession({ push, fetchOrders: async () => Promise.reject(new Error('offline')), now: NOW });

    tap({ path: `/trading/order-log?stock=${ISIN}&date=${TODAY}` });
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/trading/order-log?stock=${ISIN}`));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it(`주문 읽기가 ${TAP_ORDERS_TIMEOUT_MS}ms 를 넘으면 계좌 없이 연다`, async () => {
    vi.useFakeTimers();
    const { tap } = installApp();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const push = vi.fn();
    startPushSession({ push, fetchOrders: () => new Promise(() => {}), now: NOW });

    tap({ path: `/trading/order-log?stock=${ISIN}&date=${TODAY}` });
    await vi.advanceTimersByTimeAsync(TAP_ORDERS_TIMEOUT_MS - 1);
    expect(push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(push).toHaveBeenCalledWith(`/trading/order-log?stock=${ISIN}`);
  });

  it('IN-03 다른 날 탭은 그 날짜 주문을 읽어 계좌를 붙인다 · 검증 실패 탭은 주문도 push 도 0', async () => {
    const { tap } = installApp();
    const push = vi.fn();
    const fetchOrders = vi.fn(async (date: string) =>
      date === '2026-11-05' ? [order({ id: 'y', tradeDate: '2026-11-05', accountNo: 'C' })] : TWO_ACCOUNTS,
    );
    startPushSession({ push, fetchOrders, now: NOW });

    tap({ path: '//evil.com' });
    tap({ path: '/trading/orders' });
    tap({});
    tap({ path: `/trading/order-log?stock=${ISIN}&date=2026-11-05` });
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith(`/trading/order-log?account=C&date=2026-11-05&stock=${ISIN}`);
    expect(fetchOrders).toHaveBeenCalledTimes(1);
    expect(fetchOrders).toHaveBeenCalledWith('2026-11-05');
  });

  it('종목이 없는 탭(전체 종목)은 주문을 읽지 않는다', async () => {
    const { tap } = installApp();
    const push = vi.fn();
    const fetchOrders = vi.fn(async () => TWO_ACCOUNTS);
    startPushSession({ push, fetchOrders, now: NOW });

    tap({ path: '/trading/order-log?date=2026-11-05' });
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith('/trading/order-log?date=2026-11-05');
    expect(fetchOrders).not.toHaveBeenCalled();
  });

  it('브라우저 · 옛 앱(플러그인 없음)은 리스너를 붙이지 않는다', () => {
    const app = installApp({ plugin: false });
    startPushSession({ push: vi.fn(), now: NOW });
    expect(app.cap.addListener).not.toHaveBeenCalled();

    document.documentElement.classList.remove('native-app');
    app.cap.isPluginAvailable.mockReturnValue(true);
    startPushSession({ push: vi.fn(), now: NOW });
    expect(app.cap.addListener).not.toHaveBeenCalled();
  });
});
