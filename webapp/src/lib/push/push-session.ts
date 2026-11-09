/**
 * 앱 세션 푸시 처리 (Phase 40 · D-21 · D-24 · RESEARCH Pattern 6).
 *
 * `NativeBridgeProvider` 가 앱일 때 마운트 effect 에서 한 번 부르고, 돌려받은 함수로 정리한다.
 *
 * - **탭 리스너:** `pushNotificationActionPerformed` 를 세션마다 한 번 붙인다. iOS 냉시작 탭은 플러그인이 이벤트를
 *   retain 했다가 리스너가 붙을 때 넘겨 준다 — 그래서 리스너는 앱 셸 최상단(Provider) 마운트 때 붙인다.
 * - **탭 처리:** payload `data.path` 검증(`parsePushTapPath`) → 종목이 있으면 그 날짜 주문을 읽어(지난 날짜도 — IN-03 ·
 *   실패 · `TAP_ORDERS_TIMEOUT_MS` 초과면 빈 목록 — 계좌 없이라도 연다) → `resolvePushTapPath` → `push(path)`.
 *   검증 실패면 주문도 읽지 않고 아무것도 하지 않는다.
 * - **시작 갱신(D-15 · D-13 「마지막 확인」):** 앱이 열릴 때 이 기기 키가 있고 · 권한이 이미 granted 이고 · 서버 목록의 이 기기
 *   행이 enabled 면 `register()` 로 받은 토큰을 같은 키로 `POST /:deviceKey/refresh`(리뷰 IN-05 — 갱신 전용) 해 토큰(OS 갱신 ·
 *   재설치로 바뀔 수 있다) · 마지막 확인 시각을 갱신한다. 꺼진 기기 · 행 없음 · 권한 없음이면 아무것도 하지 않는다. 갱신 전용
 *   엔드포인트는 서버가 켜짐을 다시 확인하고 enabled 를 건드리지 않는다 — 목록 확인과 `register()`(최대 10초) 사이에 PC 에서
 *   이 기기를 꺼도 되살리지 않는다(404 → 목록만 다시 읽는다 · 예전 PUT 은 곧 켜짐이었다). 권한은 묻지 않는다(D-14 「켤 때만 묻는다」). 모듈 플래그로 **세션(페이지 로드)당 1회**(Provider 재마운트에도 1회).
 *   탭 리스너와 독립 — 갱신 실패는 `console.warn` 한 줄(토큰 · 키 없음)이고 탭 처리를 막지 않는다.
 * - **로그인 뒤 이 폰 정리(리뷰 WR-07 · D-15):** 앱 로그인은 하드 이동이라 로그인 직후 첫 페이지 로드가 곧 이 시작이다. 지금
 *   사용자가 이 폰에서 정리를 마친 사용자가 아니거나 로그아웃 정리 실패 표시가 있으면(`pushHandoverNeeded`), 권한이 이미
 *   granted 일 때만 묻지 않고 받은 토큰으로 `POST /api/push-devices/handover` 를 불러 이 토큰 · 기기 키를 가진 남의 행
 *   (로그아웃 DELETE 실패 · 세션 만료로 남은 앞 사용자 행)을 서버에서 지운다. 성공하면 기록(`recordPushHandover`), 실패면
 *   다음 실행에서 다시 한다. 권한이 없으면 이 폰에 배너가 뜨지 않으니 기다린다. 사용자 id 는 supabase 세션(쿠키 읽기 ·
 *   왕복 없음) — 로그아웃 상태(/login)면 하지 않는다.
 * - 로그에 토큰 · 계좌 · 경로 값을 남기지 않는다(T-19-14 동형).
 */

import { kstDateIso, type JournalOrderRow } from '@gh-radar/shared';

import { isNativeApp, nativePlatform } from '@/lib/native/native-detect';
import { fetchOrdersOfDate } from '@/lib/orders-api';
import {
  pushDeviceLabel,
  pushHandoverNeeded,
  readPushDeviceKey,
  recordPushHandover,
} from '@/lib/push/device-key';
import {
  addPushTapListener,
  checkPushPermission,
  isPushPluginAvailable,
  pushErrorText,
  registerPushToken,
} from '@/lib/push/native-push';
import { ApiClientError } from '@/lib/api';
import { handoverThisPushDevice, refreshThisPushDeviceToken } from '@/lib/push/push-devices-api';
import { parsePushTapPath, resolvePushTapPath } from '@/lib/push/push-tap';
import {
  PUSH_DEVICES_STALE_MS,
  pushDevicesSnapshot,
  refreshPushDevices,
  updatePushDevicesLocal,
} from '@/lib/push/use-push-devices';
import { createClient } from '@/lib/supabase/client';

/** 탭 착지에서 그 날짜 주문을 기다리는 상한 — 넘으면 계좌 없이 연다. */
export const TAP_ORDERS_TIMEOUT_MS = 3_000;

export interface PushSessionOptions {
  /** 경로 이동(`router.push`). */
  push: (path: string) => void;
  /** 그 날짜(KST `YYYY-MM-DD`) 주문 읽기 — 기본 `fetchOrdersOfDate`(테스트 주입용). */
  fetchOrders?: (date: string) => Promise<JournalOrderRow[]>;
  /** 지금 — 기본 `new Date()`(테스트 주입용). 오늘 = shared `kstDateIso(now())`. */
  now?: () => Date;
  /** 지금 로그인한 사용자 id — 기본 supabase 세션(쿠키 읽기 · 왕복 없음). 로그아웃 상태면 null(테스트 주입용). */
  currentUserId?: () => Promise<string | null>;
}

async function sessionUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  return session?.user.id ?? null;
}

const NOOP = () => {};

/** 이 페이지 로드에서 시작 갱신을 이미 시작했는가 — 세션당 1회. */
let startupRefreshStarted = false;

/**
 * 시작 한 번 — ① 로그인 뒤 이 폰 정리(WR-07 · 필요할 때만) ② 켜진 기기 토큰 갱신(IN-05 갱신 전용) → 목록 다시 읽기.
 * 둘 다 권한 granted 일 때만(묻지 않는다) · 토큰은 한 번만 받는다. throw 하지 않는다 — 실패는 각자 warn 한 줄(토큰 · 키 없음).
 */
async function startupDeviceWork(currentUserId: () => Promise<string | null>): Promise<void> {
  const platform = nativePlatform();
  if (!platform) return;
  const deviceKey = readPushDeviceKey();

  let userId: string | null = null;
  try {
    userId = await currentUserId();
  } catch (err) {
    console.warn('[gh-radar] push 시작 — 세션 읽기 실패 · 로그인 정리는 다음 실행에', pushErrorText(err));
  }
  const needHandover = userId !== null && pushHandoverNeeded(userId);
  if (!deviceKey && !needHandover) return;
  // 묻지 않고 지금 상태만 본다(D-14).
  if ((await checkPushPermission()) !== 'granted') return;

  let mineEnabled = false;
  if (deviceKey) {
    const { loadedAt } = pushDevicesSnapshot();
    if (loadedAt === null || Date.now() - loadedAt > PUSH_DEVICES_STALE_MS) await refreshPushDevices();
    mineEnabled = pushDevicesSnapshot().devices.some((d) => d.deviceKey === deviceKey && d.enabled);
  }
  if (!needHandover && !mineEnabled) return;

  let token: string;
  try {
    token = await registerPushToken();
  } catch (err) {
    console.warn('[gh-radar] push 시작 갱신 실패 — 탭 처리는 계속', pushErrorText(err));
    return;
  }

  if (needHandover && userId !== null) {
    try {
      await handoverThisPushDevice({ token, deviceKey });
      recordPushHandover(userId);
    } catch (err) {
      console.warn('[gh-radar] push 로그인 정리 실패 — 다음 실행에서 다시', pushErrorText(err));
    }
  }

  if (!mineEnabled || !deviceKey) return;
  try {
    const device = await refreshThisPushDeviceToken(deviceKey, {
      platform,
      token,
      label: pushDeviceLabel(navigator.userAgent),
    });
    updatePushDevicesLocal((list) => list.map((d) => (d.deviceKey === device.deviceKey ? device : d)));
    void refreshPushDevices();
  } catch (err) {
    // 404 = 그사이 이 기기가 꺼졌거나 지워졌다(PC 에서) — 정상. 되살리지 않고 목록만 다시 읽는다.
    if (err instanceof ApiClientError && err.status === 404) {
      void refreshPushDevices();
      return;
    }
    console.warn('[gh-radar] push 시작 갱신 실패 — 탭 처리는 계속', pushErrorText(err));
  }
}

async function ordersWithin(fetchOrders: () => Promise<JournalOrderRow[]>, timeoutMs: number): Promise<JournalOrderRow[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const result = await Promise.race([fetchOrders(), timedOut]);
    if (result === 'timeout') {
      console.warn('[gh-radar] push 탭 — 주문 읽기 시간 초과 · 계좌 없이 연다');
      return [];
    }
    return result;
  } catch (err) {
    console.warn('[gh-radar] push 탭 — 주문 읽기 실패 · 계좌 없이 연다', pushErrorText(err));
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
  const fetchOrders = opts.fetchOrders ?? fetchOrdersOfDate;
  const now = opts.now ?? (() => new Date());
  const currentUserId = opts.currentUserId ?? sessionUserId;

  const handleTap = async (data: Record<string, unknown>): Promise<void> => {
    const today = kstDateIso(now());
    const parsed = parsePushTapPath(data, today);
    if (parsed === null) return;
    const orders = parsed.needsOrders
      ? await ordersWithin(() => fetchOrders(parsed.query.date), TAP_ORDERS_TIMEOUT_MS)
      : [];
    const path = resolvePushTapPath(data, orders, today);
    if (path !== null) opts.push(path);
  };

  const removeTap = addPushTapListener((data) => {
    void handleTap(data);
  });

  // 시작 갱신 — 리스너를 먼저 붙인 뒤 비동기로(실패해도 탭은 이미 받는다).
  if (!startupRefreshStarted) {
    startupRefreshStarted = true;
    void startupDeviceWork(currentUserId);
  }

  // 떼고 난 뒤 끝난 탭 처리도 이동은 한다 — 냉시작 탭(retain)이 개발 모드 이중 마운트 사이에 소비돼도 잃지 않게.
  return removeTap;
}

/** 테스트 전용 — 세션당 1회 플래그를 처음 상태로. */
export function __resetPushSessionForTest(): void {
  startupRefreshStarted = false;
}
