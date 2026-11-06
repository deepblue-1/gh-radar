import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 40 — 푸시 플러그인 래퍼 · 로그아웃 정리(D-14 · D-15).
 *
 * 깨졌을 때 사용자가 겪는 일:
 *  - 토큰 이벤트 리스너를 떼지 않으면 → 다시 켤 때마다 리스너가 쌓여 이전 시도 콜백이 새 결과를 가로챈다
 *  - 시간 초과가 없으면 → 토큰이 안 오는 기기(서명 · entitlement 문제)에서 스위치가 영영 돈다
 *  - 로그아웃 정리가 throw 하거나 3초 넘게 기다리면 → 오프라인에서 로그아웃 버튼이 먹통이 된다
 *  - 로그아웃 정리가 빠지면 → 같은 폰에 다른 계정이 로그인해도 앞 사람 체결이 간다(D-15)
 */

vi.mock('@/lib/auth-fetch', () => ({ authFetch: vi.fn() }));

import { ApiClientError } from '@/lib/api';
import { authFetch } from '@/lib/auth-fetch';
import { PUSH_DEVICE_KEY_STORAGE } from '../device-key';
import { checkPushPermission, registerPushToken } from '../native-push';
import { unregisterThisDeviceBeforeSignOut } from '../push-devices-api';

type Listener = { event: string; cb: (data: unknown) => void; remove: ReturnType<typeof vi.fn> };

function installCapacitor(register: (fire: (event: string, data: unknown) => void) => Promise<unknown> | unknown) {
  const listeners: Listener[] = [];
  const fire = (event: string, data: unknown) => {
    for (const l of listeners) if (l.event === event) l.cb(data);
  };
  const cap = {
    isPluginAvailable: vi.fn(() => true),
    nativePromise: vi.fn(async (_plugin: string, method: string) => {
      if (method === 'register') return register(fire);
      if (method === 'checkPermissions') return { receive: 'denied' };
      throw new Error(`unexpected ${method}`);
    }),
    addListener: vi.fn((_plugin: string, event: string, cb: (data: unknown) => void) => {
      const l: Listener = { event, cb, remove: vi.fn(async () => {}) };
      listeners.push(l);
      return { remove: l.remove };
    }),
  };
  (window as unknown as { Capacitor?: unknown }).Capacitor = cap;
  return { cap, listeners };
}

const KEY = 'aaaaaaaa-1111-4222-8333-444455556666';

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(authFetch).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  document.documentElement.classList.remove('native-app');
  document.documentElement.removeAttribute('data-native-platform');
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('registerPushToken', () => {
  it('registration value 로 resolve · 리스너 2개(registration · registrationError)를 뗀다', async () => {
    const { listeners } = installCapacitor((fire) => {
      queueMicrotask(() => fire('registration', { value: 'apns-token-0123456789abcdef' }));
    });
    await expect(registerPushToken()).resolves.toBe('apns-token-0123456789abcdef');
    expect(listeners.map((l) => l.event)).toEqual(['registration', 'registrationError']);
    const removed = listeners.reduce((n, l) => n + l.remove.mock.calls.length, 0);
    expect(removed).toBe(2);
  });

  it('registrationError → reject · 리스너를 뗀다', async () => {
    const { listeners } = installCapacitor((fire) => {
      queueMicrotask(() => fire('registrationError', { error: 'no valid aps-environment' }));
    });
    await expect(registerPushToken()).rejects.toThrow(/push_register_error/);
    expect(listeners.every((l) => l.remove.mock.calls.length === 1)).toBe(true);
  });

  it('10초 안에 토큰이 안 오면 reject push_register_timeout · 리스너를 뗀다', async () => {
    vi.useFakeTimers();
    const { listeners } = installCapacitor(() => undefined);
    const p = registerPushToken();
    const assertion = expect(p).rejects.toThrow('push_register_timeout');
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(listeners.every((l) => l.remove.mock.calls.length === 1)).toBe(true);
  });

  it('브리지 없음 → reject native_unavailable', async () => {
    await expect(registerPushToken()).rejects.toThrow('native_unavailable');
  });
});

describe('checkPushPermission', () => {
  it('window.Capacitor 없음 → unavailable', async () => {
    await expect(checkPushPermission()).resolves.toBe('unavailable');
  });

  it("{receive:'denied'} → denied", async () => {
    installCapacitor(() => undefined);
    await expect(checkPushPermission()).resolves.toBe('denied');
  });
});

function asNativeApp() {
  document.documentElement.classList.add('native-app');
  document.documentElement.setAttribute('data-native-platform', 'android');
}

describe('unregisterThisDeviceBeforeSignOut (D-15)', () => {
  it('네이티브 아님 → 서버 호출 0', async () => {
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY);
    await unregisterThisDeviceBeforeSignOut();
    expect(authFetch).not.toHaveBeenCalled();
  });

  it('앱이지만 기기 키 없음 → 서버 호출 0', async () => {
    asNativeApp();
    await unregisterThisDeviceBeforeSignOut();
    expect(authFetch).not.toHaveBeenCalled();
  });

  it('앱 · 기기 키 있음 → DELETE /api/push-devices/:key', async () => {
    asNativeApp();
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY);
    vi.mocked(authFetch).mockResolvedValue({ ok: true });
    await unregisterThisDeviceBeforeSignOut();
    expect(authFetch).toHaveBeenCalledTimes(1);
    const [path, init] = vi.mocked(authFetch).mock.calls[0]!;
    expect(path).toBe(`/api/push-devices/${KEY}`);
    expect(init).toMatchObject({ method: 'DELETE' });
  });

  it('3초 안에 안 끝나면 포기하고 resolve · warn 1줄(키 없음)', async () => {
    vi.useFakeTimers();
    asNativeApp();
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY);
    vi.mocked(authFetch).mockImplementation(() => new Promise(() => {}));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let done = false;
    const p = unregisterThisDeviceBeforeSignOut().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
  });

  it('DELETE 실패여도 throw 하지 않는다 · 404 는 정상 끝(warn 없음)', async () => {
    asNativeApp();
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.mocked(authFetch).mockRejectedValueOnce(
      new ApiClientError({ code: 'NOT_FOUND', message: 'not found', status: 404 }),
    );
    await expect(unregisterThisDeviceBeforeSignOut()).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();

    vi.mocked(authFetch).mockRejectedValueOnce(
      new ApiClientError({ code: 'NETWORK_ERROR', message: 'offline', status: 0 }),
    );
    await expect(unregisterThisDeviceBeforeSignOut()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
  });
});
