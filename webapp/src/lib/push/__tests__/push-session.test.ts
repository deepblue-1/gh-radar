import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PushDevice } from '@gh-radar/shared';

/**
 * Phase 40 — 앱 시작 토큰 · 마지막 확인 갱신(D-15 · D-13 「마지막 확인」 · D-14).
 *
 * 깨졌을 때 사용자가 겪는 일:
 *  - 갱신이 없으면 → 토큰이 바뀐 기기(OS 갱신 · 앱 재설치 뒤)에 체결 알림이 안 오고, PC 목록의 마지막 확인이 멈춘다
 *  - 꺼진 기기 · 권한 없는 기기까지 갱신하면 → 끈 기기가 몰래 다시 켜진다(PUT = 켜짐)
 *  - 시작 때 권한을 물으면 → 알림을 켜지도 않은 사람에게 앱을 열 때마다 프롬프트가 뜬다(D-14 「켤 때만 묻는다」)
 *  - Provider 재마운트마다 갱신하면 → 같은 세션에 PUT 이 쌓인다
 *  - 갱신 실패가 throw 하거나 탭 리스너를 떼면 → 오프라인 시작 뒤 알림을 탭해도 주문로그가 안 열린다
 */

vi.mock('@/lib/push/push-devices-api', () => ({
  fetchPushDevices: vi.fn(),
  registerThisPushDevice: vi.fn(),
  handoverThisPushDevice: vi.fn(),
}));

/** supabase 세션 사용자 — null = 로그아웃 상태. */
let sessionUser: string | null = null;
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: sessionUser ? { user: { id: sessionUser } } : null } }),
    },
  }),
}));

import {
  PUSH_DEVICE_KEY_STORAGE,
  PUSH_HANDOVER_PENDING_STORAGE,
  PUSH_HANDOVER_USER_STORAGE,
  pushDeviceLabel,
} from '../device-key';
import { fetchPushDevices, handoverThisPushDevice, registerThisPushDevice } from '../push-devices-api';
import { __resetPushSessionForTest, startPushSession } from '../push-session';
import { __resetPushDevicesForTest, pushDevicesSnapshot } from '../use-push-devices';

const KEY = 'aaaaaaaa-1111-4222-8333-444455556666';
const TOKEN = 'apns-token-0123456789abcdef';

function row(over: Partial<PushDevice> = {}): PushDevice {
  return {
    deviceKey: KEY,
    platform: 'ios',
    label: 'iPhone · iOS 18.1',
    enabled: true,
    lastSeenAt: '2026-11-01T00:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

type Listener = { event: string; cb: (data: unknown) => void; remove: ReturnType<typeof vi.fn> };

function installApp(opts: { permission?: string; register?: 'ok' | 'error' } = {}) {
  const listeners: Listener[] = [];
  const fire = (event: string, data: unknown) => {
    for (const l of listeners) if (l.event === event) l.cb(data);
  };
  const cap = {
    isPluginAvailable: vi.fn(() => true),
    nativePromise: vi.fn(async (_plugin: string, method: string) => {
      if (method === 'checkPermissions') return { receive: opts.permission ?? 'granted' };
      if (method === 'register') {
        queueMicrotask(() => {
          if (opts.register === 'error') fire('registrationError', { error: 'no valid aps-environment' });
          else fire('registration', { value: TOKEN });
        });
        return undefined;
      }
      throw new Error(`unexpected ${method}`);
    }),
    addListener: vi.fn((_plugin: string, event: string, cb: (data: unknown) => void) => {
      const l: Listener = { event, cb, remove: vi.fn(async () => {}) };
      listeners.push(l);
      return { remove: l.remove };
    }),
  };
  (window as unknown as { Capacitor?: unknown }).Capacitor = cap;
  document.documentElement.classList.add('native-app');
  document.documentElement.setAttribute('data-native-platform', 'ios');
  const methods = () => cap.nativePromise.mock.calls.map((c) => c[1]);
  return { cap, listeners, methods };
}

/** 시작 갱신은 비동기다 — 마이크로태스크 · 짧은 타이머가 다 돌 때까지 기다린다. */
async function settle() {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  __resetPushSessionForTest();
  __resetPushDevicesForTest();
  vi.mocked(fetchPushDevices).mockReset();
  vi.mocked(registerThisPushDevice).mockReset();
  vi.mocked(handoverThisPushDevice).mockReset().mockResolvedValue({ ok: true, removed: 0 });
  sessionUser = null;
  vi.mocked(registerThisPushDevice).mockImplementation(async (deviceKey, body) =>
    row({ deviceKey, platform: body.platform, label: body.label, lastSeenAt: '2026-11-07T00:00:00.000Z' }),
  );
  window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY);
});

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  document.documentElement.classList.remove('native-app');
  document.documentElement.removeAttribute('data-native-platform');
  window.localStorage.clear();
  __resetPushDevicesForTest();
  vi.restoreAllMocks();
});

describe('startPushSession — 시작 갱신', () => {
  it('켜진 기기 · 권한 granted → register() 토큰을 같은 키로 PUT 1회 → 목록 다시 읽기', async () => {
    const app = installApp();
    vi.mocked(fetchPushDevices).mockResolvedValue([row()]);
    startPushSession({ push: vi.fn() });
    await settle();

    expect(app.methods()).toContain('register');
    expect(registerThisPushDevice).toHaveBeenCalledTimes(1);
    expect(registerThisPushDevice).toHaveBeenCalledWith(KEY, {
      platform: 'ios',
      token: TOKEN,
      label: pushDeviceLabel(navigator.userAgent),
    });
    // 갱신 전 1회(켜짐 확인) + 갱신 뒤 1회(마지막 확인 반영).
    expect(fetchPushDevices).toHaveBeenCalledTimes(2);
    const putOrder = vi.mocked(registerThisPushDevice).mock.invocationCallOrder[0]!;
    expect(vi.mocked(fetchPushDevices).mock.invocationCallOrder[1]!).toBeGreaterThan(putOrder);
    expect(pushDevicesSnapshot().devices).toEqual([row()]);
  });

  it.each([
    ['이 기기 행이 꺼짐', () => [row({ enabled: false })]],
    ['이 기기 행이 없음(다른 기기만)', () => [row({ deviceKey: 'bbbbbbbb-1111-4222-8333-444455556666' })]],
    ['목록이 빔', () => []],
  ])('%s → register · PUT 0 · 권한을 묻지 않는다', async (_name, devices) => {
    const app = installApp();
    vi.mocked(fetchPushDevices).mockResolvedValue(devices());
    startPushSession({ push: vi.fn() });
    await settle();

    expect(app.methods()).not.toContain('register');
    expect(app.methods()).not.toContain('requestPermissions');
    expect(registerThisPushDevice).not.toHaveBeenCalled();
  });

  it.each(['denied', 'prompt', 'prompt-with-rationale'])('권한 %s → register · PUT 0 · 권한을 묻지 않는다', async (permission) => {
    const app = installApp({ permission });
    vi.mocked(fetchPushDevices).mockResolvedValue([row()]);
    startPushSession({ push: vi.fn() });
    await settle();

    expect(app.methods()).not.toContain('register');
    expect(app.methods()).not.toContain('requestPermissions');
    expect(registerThisPushDevice).not.toHaveBeenCalled();
  });

  it('기기 키가 없으면 → 권한 확인 · 목록 읽기 · PUT 0', async () => {
    window.localStorage.clear();
    const app = installApp();
    vi.mocked(fetchPushDevices).mockResolvedValue([row()]);
    startPushSession({ push: vi.fn() });
    await settle();

    expect(app.methods()).toEqual([]);
    expect(fetchPushDevices).not.toHaveBeenCalled();
    expect(registerThisPushDevice).not.toHaveBeenCalled();
  });

  it('같은 세션에서 두 번 불려도(Provider 재마운트) 갱신은 1회 · 탭 리스너는 세션마다', async () => {
    const app = installApp();
    vi.mocked(fetchPushDevices).mockResolvedValue([row()]);
    const stop1 = startPushSession({ push: vi.fn() });
    stop1();
    startPushSession({ push: vi.fn() });
    await settle();

    expect(registerThisPushDevice).toHaveBeenCalledTimes(1);
    expect(app.listeners.filter((l) => l.event === 'pushNotificationActionPerformed')).toHaveLength(2);
  });

  it('register 실패(registrationError) → warn 1줄(토큰 · 키 없음) · throw 없음 · 탭 리스너는 붙어 있다', async () => {
    const app = installApp({ register: 'error' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fetchPushDevices).mockResolvedValue([row()]);
    startPushSession({ push: vi.fn() });
    await settle();

    expect(registerThisPushDevice).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain(TOKEN);
    const tap = app.listeners.find((l) => l.event === 'pushNotificationActionPerformed');
    expect(tap).toBeDefined();
    expect(tap!.remove).not.toHaveBeenCalled();
  });

  it('PUT 오류 → warn 1줄(토큰 · 키 없음) · throw 없음 · 탭 리스너는 붙어 있다', async () => {
    const app = installApp();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fetchPushDevices).mockResolvedValue([row()]);
    vi.mocked(registerThisPushDevice).mockRejectedValue(new Error('HTTP 500'));
    startPushSession({ push: vi.fn() });
    await settle();

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain(TOKEN);
    const tap = app.listeners.find((l) => l.event === 'pushNotificationActionPerformed');
    expect(tap!.remove).not.toHaveBeenCalled();
  });

  it('브라우저 · 옛 앱은 갱신하지 않는다', async () => {
    const app = installApp();
    app.cap.isPluginAvailable.mockReturnValue(false);
    vi.mocked(fetchPushDevices).mockResolvedValue([row()]);
    startPushSession({ push: vi.fn() });
    document.documentElement.classList.remove('native-app');
    app.cap.isPluginAvailable.mockReturnValue(true);
    startPushSession({ push: vi.fn() });
    await settle();

    expect(app.methods()).toEqual([]);
    expect(fetchPushDevices).not.toHaveBeenCalled();
    expect(registerThisPushDevice).not.toHaveBeenCalled();
  });
});

describe('startPushSession — 로그인 뒤 이 폰 정리 (리뷰 WR-07 · D-15)', () => {
  const U2 = '00000000-0000-4000-8000-000000004102';

  it('정리를 마친 적 없는 사용자 · 권한 granted · 이 기기 행 꺼짐 → register 1 · handover {token, 키} 1 · 기록 · PUT 0', async () => {
    sessionUser = U2;
    const app = installApp();
    vi.mocked(fetchPushDevices).mockResolvedValue([row({ enabled: false })]);
    startPushSession({ push: vi.fn() });
    await settle();

    expect(app.methods().filter((m) => m === 'register')).toHaveLength(1);
    expect(app.methods()).not.toContain('requestPermissions');
    expect(handoverThisPushDevice).toHaveBeenCalledTimes(1);
    expect(handoverThisPushDevice).toHaveBeenCalledWith({ token: TOKEN, deviceKey: KEY });
    expect(registerThisPushDevice).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PUSH_HANDOVER_USER_STORAGE)).toBe(U2);
  });

  it('이미 정리한 같은 사용자 · 실패 표시 없음 → handover 0', async () => {
    sessionUser = U2;
    window.localStorage.setItem(PUSH_HANDOVER_USER_STORAGE, U2);
    const app = installApp();
    vi.mocked(fetchPushDevices).mockResolvedValue([row({ enabled: false })]);
    startPushSession({ push: vi.fn() });
    await settle();

    expect(handoverThisPushDevice).not.toHaveBeenCalled();
    expect(app.methods()).not.toContain('register');
  });

  it('로그아웃 정리 실패 표시 · 키 버림 · 같은 사용자 → handover {token, deviceKey: null} · 표시 지움 · 목록 읽기 0', async () => {
    sessionUser = U2;
    window.localStorage.clear();
    window.localStorage.setItem(PUSH_HANDOVER_USER_STORAGE, U2);
    window.localStorage.setItem(PUSH_HANDOVER_PENDING_STORAGE, '1');
    installApp();
    startPushSession({ push: vi.fn() });
    await settle();

    expect(handoverThisPushDevice).toHaveBeenCalledWith({ token: TOKEN, deviceKey: null });
    expect(fetchPushDevices).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PUSH_HANDOVER_PENDING_STORAGE)).toBeNull();
  });

  it('켜진 기기 + 정리 필요 → 토큰은 한 번만 받고 handover · PUT 둘 다', async () => {
    sessionUser = U2;
    const app = installApp();
    vi.mocked(fetchPushDevices).mockResolvedValue([row()]);
    startPushSession({ push: vi.fn() });
    await settle();

    expect(app.methods().filter((m) => m === 'register')).toHaveLength(1);
    expect(handoverThisPushDevice).toHaveBeenCalledTimes(1);
    expect(registerThisPushDevice).toHaveBeenCalledTimes(1);
  });

  it.each(['denied', 'prompt'])('권한 %s → register · handover 0 · 기록 안 남김(권한이 생기면 다음 실행에서)', async (permission) => {
    sessionUser = U2;
    const app = installApp({ permission });
    vi.mocked(fetchPushDevices).mockResolvedValue([]);
    startPushSession({ push: vi.fn() });
    await settle();

    expect(app.methods()).not.toContain('register');
    expect(app.methods()).not.toContain('requestPermissions');
    expect(handoverThisPushDevice).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PUSH_HANDOVER_USER_STORAGE)).toBeNull();
  });

  it('handover 실패 → warn 1줄(토큰 · 키 없음) · 기록 안 남김 · 켜진 기기 PUT 은 계속', async () => {
    sessionUser = U2;
    installApp();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fetchPushDevices).mockResolvedValue([row()]);
    vi.mocked(handoverThisPushDevice).mockRejectedValue(new Error('HTTP 500'));
    startPushSession({ push: vi.fn() });
    await settle();

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain(TOKEN);
    expect(window.localStorage.getItem(PUSH_HANDOVER_USER_STORAGE)).toBeNull();
    expect(registerThisPushDevice).toHaveBeenCalledTimes(1);
  });

  it('로그아웃 상태(세션 없음 · /login) → handover 0', async () => {
    sessionUser = null;
    window.localStorage.setItem(PUSH_HANDOVER_PENDING_STORAGE, '1');
    installApp();
    vi.mocked(fetchPushDevices).mockResolvedValue([row({ enabled: false })]);
    startPushSession({ push: vi.fn() });
    await settle();

    expect(handoverThisPushDevice).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PUSH_HANDOVER_PENDING_STORAGE)).toBe('1');
  });
});
