import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { PushDevice } from '@gh-radar/shared';

/**
 * Phase 40 D-12 · D-13 · D-14 — /me 설정 탭 「알림 받는 기기」 카드.
 *
 * 각 케이스는 깨졌을 때 사용자가 겪는 일과 짝이다.
 *  - `registration` 리스너가 `register()` 보다 늦게 붙으면 → iOS 는 토큰 이벤트를 놓쳐 스위치가 10초 뒤 실패로 돌아간다
 *  - 권한 prompt 에서 request 를 건너뛰면 → 켜도 알림이 오지 않는다(D-14)
 *  - Android 채널을 안 만들면 → 알림이 「Miscellaneous」 로 가 사용자가 못 알아본다(Pitfall 13)
 *  - PUT 인자가 틀리면 → 서버 400 · 다른 기기 행을 덮는다
 */

vi.mock('@/lib/push/push-devices-api', () => ({
  fetchPushDevices: vi.fn(async () => []),
  registerThisPushDevice: vi.fn(),
  disablePushDevice: vi.fn(async () => ({ ok: true })),
  deletePushDevice: vi.fn(async () => ({ ok: true })),
  unregisterThisDeviceBeforeSignOut: vi.fn(async () => {}),
}));

import { fetchPushDevices, registerThisPushDevice } from '@/lib/push/push-devices-api';
import { PUSH_DEVICE_KEY_STORAGE } from '@/lib/push/device-key';
import { PUSH_DEVICES_TEXT, PushDevicesCard } from '../push-devices-card';

const TOKEN = 'fcm-token-abcdefghijklmnop';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 15; SM-S918N Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Listener = { event: string; cb: (data: unknown) => void };
type FakeCap = {
  calls: string[];
  listeners: Listener[];
  permission: { check: string; request: string };
};

function installCapacitor(opts: { platform: 'ios' | 'android'; check?: string; request?: string; plugin?: boolean }) {
  const state: FakeCap = {
    calls: [],
    listeners: [],
    permission: { check: opts.check ?? 'prompt', request: opts.request ?? 'granted' },
  };
  const cap = {
    isPluginAvailable: vi.fn((name: string) => (opts.plugin ?? true) && name === 'PushNotifications'),
    nativePromise: vi.fn(async (plugin: string, method: string) => {
      state.calls.push(`${plugin}.${method}`);
      if (method === 'checkPermissions') return { receive: state.permission.check };
      if (method === 'requestPermissions') return { receive: state.permission.request };
      if (method === 'createChannel') return undefined;
      if (method === 'register') {
        // 네이티브는 register 뒤 registration 을 한 번 쏜다 — 그때 붙어 있는 리스너만 받는다(iOS retain 없음).
        queueMicrotask(() => {
          for (const l of state.listeners) if (l.event === 'registration') l.cb({ value: TOKEN });
        });
        return undefined;
      }
      throw new Error(`unexpected ${plugin}.${method}`);
    }),
    addListener: vi.fn((plugin: string, event: string, cb: (data: unknown) => void) => {
      state.calls.push(`addListener:${plugin}.${event}`);
      const l = { event, cb };
      state.listeners.push(l);
      return {
        remove: vi.fn(async () => {
          state.listeners = state.listeners.filter((x) => x !== l);
        }),
      };
    }),
  };
  (window as unknown as { Capacitor?: unknown }).Capacitor = cap;
  document.documentElement.classList.add('native-app');
  document.documentElement.setAttribute('data-native-platform', opts.platform);
  return { state, cap };
}

function device(over: Partial<PushDevice> = {}): PushDevice {
  return {
    deviceKey: '11111111-2222-4333-8444-555555555555',
    platform: 'android',
    label: 'SM-S918N · Android 15',
    enabled: true,
    lastSeenAt: '2026-11-06T00:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

const thisSwitch = () => screen.getByRole('switch', { name: PUSH_DEVICES_TEXT.thisDevice });

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(fetchPushDevices).mockReset().mockResolvedValue([]);
  vi.mocked(registerThisPushDevice).mockReset();
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID_UA);
});

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  document.documentElement.classList.remove('native-app');
  document.documentElement.removeAttribute('data-native-platform');
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('PushDevicesCard — 앱 안 「이 기기 체결 알림」 켜기 (D-12 · D-14)', () => {
  it('권한 prompt → request granted → (android) 채널 → registration 리스너가 register 보다 먼저 → PUT → 켜짐', async () => {
    const { state } = installCapacitor({ platform: 'android', check: 'prompt', request: 'granted' });
    vi.mocked(registerThisPushDevice).mockImplementation(async (deviceKey, body) =>
      device({ deviceKey, platform: body.platform, label: body.label, enabled: true }),
    );

    render(<PushDevicesCard />);
    await act(async () => {});
    expect(screen.getByText(PUSH_DEVICES_TEXT.captionApp)).toBeTruthy();
    expect(thisSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(thisSwitch().getAttribute('data-slot')).toBe('me-push-this-device');

    await act(async () => {
      fireEvent.click(thisSwitch());
    });
    await act(async () => {});

    const calls = state.calls;
    const req = calls.indexOf('PushNotifications.requestPermissions');
    const channel = calls.indexOf('PushNotifications.createChannel');
    const listen = calls.indexOf('addListener:PushNotifications.registration');
    const register = calls.indexOf('PushNotifications.register');
    expect(req).toBeGreaterThanOrEqual(0);
    expect(channel).toBeGreaterThan(req);
    expect(listen).toBeGreaterThan(channel);
    expect(register).toBeGreaterThan(listen);
    expect(calls.indexOf('addListener:PushNotifications.registrationError')).toBeLessThan(register);

    expect(registerThisPushDevice).toHaveBeenCalledTimes(1);
    const [key, body] = vi.mocked(registerThisPushDevice).mock.calls[0]!;
    expect(key).toMatch(UUID_RE);
    expect(window.localStorage.getItem(PUSH_DEVICE_KEY_STORAGE)).toBe(key);
    expect(body).toEqual({ platform: 'android', token: TOKEN, label: 'SM-S918N · Android 15' });

    expect(thisSwitch()).toHaveAttribute('aria-checked', 'true');
    // 끝난 뒤 두 리스너는 떨어졌다.
    expect(state.listeners).toHaveLength(0);
  });

  it('iOS 는 채널을 만들지 않는다 · 이미 granted 면 다시 묻지 않는다', async () => {
    const { state } = installCapacitor({ platform: 'ios', check: 'granted' });
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    );
    vi.mocked(registerThisPushDevice).mockImplementation(async (deviceKey, body) =>
      device({ deviceKey, platform: body.platform, label: body.label }),
    );

    render(<PushDevicesCard />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(thisSwitch());
    });
    await act(async () => {});

    expect(state.calls).not.toContain('PushNotifications.requestPermissions');
    expect(state.calls).not.toContain('PushNotifications.createChannel');
    expect(vi.mocked(registerThisPushDevice).mock.calls[0]![1]).toEqual({
      platform: 'ios',
      token: TOKEN,
      label: 'iPhone · iOS 18.1',
    });
    expect(thisSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('PUT 실패 → 꺼짐 + 「켜지 못했어요」(role=status)', async () => {
    installCapacitor({ platform: 'android', check: 'granted' });
    vi.mocked(registerThisPushDevice).mockRejectedValue(new Error('HTTP_500'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<PushDevicesCard />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(thisSwitch());
    });
    await act(async () => {});

    expect(thisSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('status').textContent).toBe(PUSH_DEVICES_TEXT.failed);
  });

  it('서버 목록에 이 기기 키 행이 켜져 있으면 마운트 뒤 켜짐', async () => {
    installCapacitor({ platform: 'android', check: 'granted' });
    const key = '0a0b0c0d-1111-4222-8333-444455556666';
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, key);
    vi.mocked(fetchPushDevices).mockResolvedValue([device({ deviceKey: key, enabled: true })]);

    render(<PushDevicesCard />);
    await act(async () => {});
    expect(thisSwitch()).toHaveAttribute('aria-checked', 'true');
  });
});
