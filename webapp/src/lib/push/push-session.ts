/**
 * 앱 세션 푸시 처리 (Phase 40 · D-21 · D-24 · RESEARCH Pattern 6).
 *
 * `NativeBridgeProvider` 가 앱일 때 마운트 effect 에서 한 번 부르고, 돌려받은 함수로 정리한다.
 *
 * - **탭 리스너:** `pushNotificationActionPerformed` 를 세션마다 한 번 붙인다. iOS 냉시작 탭은 플러그인이 이벤트를
 *   retain 했다가 리스너가 붙을 때 넘겨 준다 — 그래서 리스너는 앱 셸 최상단(Provider) 마운트 때 붙인다.
 * - **탭 처리:** payload `data.path` 검증(`parsePushTapPath`) → 날짜가 오늘이고 종목이 있으면 오늘 주문을 읽어
 *   (실패 · `TAP_ORDERS_TIMEOUT_MS` 초과면 빈 목록 — 계좌 없이라도 연다) → `resolvePushTapPath` → `push(path)`.
 *   검증 실패면 주문도 읽지 않고 아무것도 하지 않는다.
 * - 로그에 토큰 · 계좌 · 경로 값을 남기지 않는다(T-19-14 동형).
 */

import { kstDateIso, type JournalOrderRow } from '@gh-radar/shared';

import { isNativeApp } from '@/lib/native/native-detect';
import { fetchTodayOrders } from '@/lib/orders-api';
import { addPushTapListener, isPushPluginAvailable, pushErrorText } from '@/lib/push/native-push';
import { parsePushTapPath, resolvePushTapPath } from '@/lib/push/push-tap';

/** 탭 착지에서 오늘 주문을 기다리는 상한 — 넘으면 계좌 없이 연다. */
export const TAP_ORDERS_TIMEOUT_MS = 3_000;

export interface PushSessionOptions {
  /** 경로 이동(`router.push`). */
  push: (path: string) => void;
  /** 오늘 주문 읽기 — 기본 `fetchTodayOrders`(테스트 주입용). */
  fetchOrders?: () => Promise<JournalOrderRow[]>;
  /** 지금 — 기본 `new Date()`(테스트 주입용). 오늘 = shared `kstDateIso(now())`. */
  now?: () => Date;
}

const NOOP = () => {};

async function ordersWithin(fetchOrders: () => Promise<JournalOrderRow[]>, timeoutMs: number): Promise<JournalOrderRow[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const result = await Promise.race([fetchOrders(), timedOut]);
    if (result === 'timeout') {
      console.warn('[gh-radar] push 탭 — 오늘 주문 읽기 시간 초과 · 계좌 없이 연다');
      return [];
    }
    return result;
  } catch (err) {
    console.warn('[gh-radar] push 탭 — 오늘 주문 읽기 실패 · 계좌 없이 연다', pushErrorText(err));
    return [];
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 앱 세션 푸시 처리 시작 — 앱 · 플러그인 있음일 때만 탭 리스너를 붙인다. 돌려준 함수가 리스너를 뗀다.
 * 브라우저 · 옛 앱(플러그인 없음)은 아무것도 하지 않는다.
 */
export function startPushSession(opts: PushSessionOptions): () => void {
  if (!isNativeApp() || !isPushPluginAvailable()) return NOOP;
  const fetchOrders = opts.fetchOrders ?? fetchTodayOrders;
  const now = opts.now ?? (() => new Date());

  const handleTap = async (data: Record<string, unknown>): Promise<void> => {
    const today = kstDateIso(now());
    const parsed = parsePushTapPath(data, today);
    if (parsed === null) return;
    const orders = parsed.needsOrders ? await ordersWithin(fetchOrders, TAP_ORDERS_TIMEOUT_MS) : [];
    const path = resolvePushTapPath(data, orders, today);
    if (path !== null) opts.push(path);
  };

  const removeTap = addPushTapListener((data) => {
    void handleTap(data);
  });

  // 떼고 난 뒤 끝난 탭 처리도 이동은 한다 — 냉시작 탭(retain)이 개발 모드 이중 마운트 사이에 소비돼도 잃지 않게.
  return removeTap;
}

/** 테스트 전용 — 세션당 1회 플래그를 처음 상태로(Task 3 RED 인터페이스 스텁). */
export function __resetPushSessionForTest(): void {}
