import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { PushDevice } from '@gh-radar/shared';

/**
 * Phase 40 D-12 · D-13 · D-14 — 「매매 알림」 패널(quick-261107-fbj — 계정 카드 종이 여는 시트/팝오버 본문 · 스케치 030 A).
 *
 * 각 케이스는 깨졌을 때 사용자가 겪는 일과 짝이다.
 *  - `registration` 리스너가 `register()` 보다 늦게 붙으면 → iOS 는 토큰 이벤트를 놓쳐 스위치가 10초 뒤 실패로 돌아간다
 *  - 권한 prompt 에서 request 를 건너뛰면 → 켜도 알림이 오지 않는다(D-14)
 *  - Android 채널을 안 만들면 → 알림이 「Miscellaneous」 로 가 사용자가 못 알아본다(Pitfall 13)
 *  - PUT 인자가 틀리면 → 서버 400 · 다른 기기 행을 덮는다
 *  - 「받을 계좌」(quick-261109-dz1 · 스케치 031 A): relay 계좌가 없는데 섹션이 뜨면 → 빈 소제목 · 쓸데없는 서버 호출 /
 *    같은 번호가 서버별로 두 줄이면 → 한쪽만 끈 줄 알고 헷갈린다 / 스위치가 응답을 기다리면 → 눌러도 반응이 없어 보인다 /
 *    실패해도 되돌리지 않으면 → 꺼진 줄 알았는데 알림이 계속 온다 / 마운트마다 다시 읽으면 → 열 때마다 서버 호출
 */

vi.mock('@/lib/push/push-devices-api', () => ({
  fetchPushDevices: vi.fn(async () => []),
  registerThisPushDevice: vi.fn(),
  disablePushDevice: vi.fn(async () => ({ ok: true })),
  deletePushDevice: vi.fn(async () => ({ ok: true })),
  unregisterThisDeviceBeforeSignOut: vi.fn(async () => {}),
  fetchPushAccountMutes: vi.fn(async () => []),
  setPushAccountEnabled: vi.fn(async () => ({ ok: true })),
}));

let mockRelay: RelayContextValue;
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return { ...actual, useRelayContext: () => mockRelay };
});

import { renderToString } from 'react-dom/server';

import {
  deletePushDevice,
  disablePushDevice,
  fetchPushAccountMutes,
  fetchPushDevices,
  registerThisPushDevice,
  setPushAccountEnabled,
} from '@/lib/push/push-devices-api';
import { EMPTY_RELAY_VALUE, type RelayContextValue } from '@/lib/relay-provider';
import {
  __resetPushAccountMutesForTest,
  pushAccountMutesSnapshot,
  refreshPushAccountMutes,
} from '@/lib/push/use-push-account-mutes';
import { PUSH_DEVICE_KEY_STORAGE } from '@/lib/push/device-key';
import {
  __resetPushDevicesForTest,
  pushDevicesSnapshot,
  refreshPushDevices,
} from '@/lib/push/use-push-devices';
import { PUSH_DEVICES_TEXT, PushDevicesPanel } from '../push-devices-panel';

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

/** 가짜 서버 — PUT 이 행을 켜짐으로 저장하면 뒤따르는 목록 읽기도 그 행을 돌려준다. */
function serverRegisters() {
  vi.mocked(registerThisPushDevice).mockImplementation(async (deviceKey, body) => {
    const saved = device({ deviceKey, platform: body.platform, label: body.label, enabled: true });
    vi.mocked(fetchPushDevices).mockResolvedValue([saved]);
    return saved;
  });
}

beforeEach(() => {
  window.localStorage.clear();
  __resetPushDevicesForTest();
  __resetPushAccountMutesForTest();
  mockRelay = EMPTY_RELAY_VALUE;
  vi.mocked(fetchPushAccountMutes).mockReset().mockResolvedValue([]);
  vi.mocked(setPushAccountEnabled).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(fetchPushDevices).mockReset().mockResolvedValue([]);
  vi.mocked(registerThisPushDevice).mockReset();
  vi.mocked(disablePushDevice).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(deletePushDevice).mockReset().mockResolvedValue({ ok: true });
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID_UA);
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  delete (window as unknown as { webkit?: unknown }).webkit;
  document.documentElement.classList.remove('native-app');
  document.documentElement.removeAttribute('data-native-platform');
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('PushDevicesPanel — 앱 안 「이 기기 매매 알림」 켜기 (D-12 · D-14)', () => {
  it('권한 prompt → request granted → (android) 채널 → registration 리스너가 register 보다 먼저 → PUT → 켜짐', async () => {
    const { state } = installCapacitor({ platform: 'android', check: 'prompt', request: 'granted' });
    serverRegisters();

    render(<PushDevicesPanel />);
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
    serverRegisters();

    render(<PushDevicesPanel />);
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

    render(<PushDevicesPanel />);
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

    render(<PushDevicesPanel />);
    await act(async () => {});
    expect(thisSwitch()).toHaveAttribute('aria-checked', 'true');
  });
});

const KEY_A = 'aaaaaaaa-1111-4222-8333-444455556666';
const KEY_B = 'bbbbbbbb-1111-4222-8333-444455556666';
const rows = () => Array.from(document.querySelectorAll('[data-slot="me-push-device"]')) as HTMLElement[];
const rowOf = (label: string) => rows().find((r) => r.textContent?.includes(label)) ?? null;

describe('PushDevicesPanel — PC 기기 목록 · 끄기 · 지우기 (D-13)', () => {
  it('PC: 웹 캡션 · 기기명 · 플랫폼 낱말 · 「마지막 확인 11/06 09:00」(KST) · 켜짐/꺼짐 · 스위치 없음', async () => {
    vi.mocked(fetchPushDevices).mockResolvedValue([
      device({ deviceKey: KEY_A, label: 'SM-S918N · Android 15', platform: 'android', enabled: true, lastSeenAt: '2026-11-06T00:00:00.000Z' }),
      device({ deviceKey: KEY_B, label: 'iPhone · iOS 18.1', platform: 'ios', enabled: false, lastSeenAt: '2026-11-05T14:05:00.000Z' }),
    ]);
    render(<PushDevicesPanel />);
    await act(async () => {});

    expect(screen.getByText(PUSH_DEVICES_TEXT.captionWeb)).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(rows()).toHaveLength(2);
    const a = rowOf('SM-S918N · Android 15')!;
    expect(a.textContent).toContain(PUSH_DEVICES_TEXT.platformAndroid);
    expect(a.textContent).toContain(`${PUSH_DEVICES_TEXT.lastSeen} 11/06 09:00`);
    expect(a.textContent).toContain(PUSH_DEVICES_TEXT.on);
    const b = rowOf('iPhone · iOS 18.1')!;
    expect(b.textContent).toContain(PUSH_DEVICES_TEXT.platformIos);
    expect(b.textContent).toContain(`${PUSH_DEVICES_TEXT.lastSeen} 11/05 23:05`);
    expect(b.textContent).toContain(PUSH_DEVICES_TEXT.off);
    // 꺼진 기기에는 「끄기」 가 없다.
    expect(b.querySelector('[data-slot="me-push-device-off"]')).toBeNull();
  });

  it('PC: 켜진 기기 「끄기」 → PATCH → 「꺼짐」 · 끄기 버튼 사라짐 · 목록 다시 읽기', async () => {
    vi.mocked(fetchPushDevices).mockResolvedValue([device({ deviceKey: KEY_A, enabled: true })]);
    render(<PushDevicesPanel />);
    await act(async () => {});
    vi.mocked(fetchPushDevices).mockResolvedValue([device({ deviceKey: KEY_A, enabled: false })]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: PUSH_DEVICES_TEXT.turnOff }));
    });
    await act(async () => {});

    expect(disablePushDevice).toHaveBeenCalledWith(KEY_A);
    const row = rows()[0]!;
    expect(row.textContent).toContain(PUSH_DEVICES_TEXT.off);
    expect(row.querySelector('[data-slot="me-push-device-off"]')).toBeNull();
    expect(fetchPushDevices).toHaveBeenCalledTimes(2);
  });

  it('PC: 「지우기」 첫 클릭 → 「한 번 더 누르면 지워요」(DELETE 없음) · 5초 뒤 원래대로', async () => {
    vi.mocked(fetchPushDevices).mockResolvedValue([device({ deviceKey: KEY_A })]);
    render(<PushDevicesPanel />);
    await act(async () => {});

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: PUSH_DEVICES_TEXT.remove }));
    });
    expect(screen.getByRole('button', { name: PUSH_DEVICES_TEXT.confirmRemove })).toBeTruthy();
    expect(deletePushDevice).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByRole('button', { name: PUSH_DEVICES_TEXT.remove })).toBeTruthy();
    expect(screen.queryByRole('button', { name: PUSH_DEVICES_TEXT.confirmRemove })).toBeNull();
  });

  it('PC: 「지우기」 두 번 → DELETE → 줄 사라짐 → 0개면 「등록된 기기가 없어요」', async () => {
    vi.mocked(fetchPushDevices).mockResolvedValue([device({ deviceKey: KEY_A })]);
    render(<PushDevicesPanel />);
    await act(async () => {});
    vi.mocked(fetchPushDevices).mockResolvedValue([]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: PUSH_DEVICES_TEXT.remove }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: PUSH_DEVICES_TEXT.confirmRemove }));
    });
    await act(async () => {});

    expect(deletePushDevice).toHaveBeenCalledWith(KEY_A);
    expect(rows()).toHaveLength(0);
    expect(screen.getByText(PUSH_DEVICES_TEXT.empty)).toBeTruthy();
  });

  it('PC: 기기 0 → 「등록된 기기가 없어요」 · 스위치 없음', async () => {
    render(<PushDevicesPanel />);
    await act(async () => {});
    expect(screen.getByText(PUSH_DEVICES_TEXT.empty)).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('PushDevicesPanel — 앱 안 목록 · 거부 · 옛 앱 · 끄기 (D-13 · D-14 · Pitfall 11)', () => {
  it('앱: 이 기기 스위치 아래에 다른 기기만 이어진다(이 기기 키 행은 목록에서 뺀다)', async () => {
    installCapacitor({ platform: 'android', check: 'granted' });
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY_A);
    vi.mocked(fetchPushDevices).mockResolvedValue([
      device({ deviceKey: KEY_A, label: '이 폰', enabled: true }),
      device({ deviceKey: KEY_B, label: '다른 폰', platform: 'ios', enabled: true }),
    ]);
    render(<PushDevicesPanel />);
    await act(async () => {});

    expect(thisSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(rows()).toHaveLength(1);
    expect(rowOf('다른 폰')).not.toBeNull();
    expect(rowOf('이 폰')).toBeNull();
    // 목업 `.np-sec` — 앱에서 다른 기기가 있으면 목록 위 소제목.
    expect(screen.getByText(PUSH_DEVICES_TEXT.otherDevices)).toBeTruthy();
  });

  it('권한 request 결과 denied → 꺼짐 · 거부 안내 · 「설정 열기」 → openSettings 송신', async () => {
    const { state } = installCapacitor({ platform: 'ios', check: 'prompt', request: 'denied' });
    const postMessage = vi.fn();
    (window as unknown as { webkit?: unknown }).webkit = { messageHandlers: { ghTrade: { postMessage } } };
    render(<PushDevicesPanel />);
    await act(async () => {});

    await act(async () => {
      fireEvent.click(thisSwitch());
    });
    await act(async () => {});

    expect(thisSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(PUSH_DEVICES_TEXT.denied)).toBeTruthy();
    expect(state.calls).not.toContain('PushNotifications.register');
    expect(registerThisPushDevice).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: PUSH_DEVICES_TEXT.openSettings }));
    });
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'openSettings' }));
  });

  it('마운트 때 이미 denied → 거부 안내 · 송신 채널이 없으면(false) 「설정 열기」 를 숨기고 문구만', async () => {
    installCapacitor({ platform: 'android', check: 'denied' });
    render(<PushDevicesPanel />);
    await act(async () => {});

    expect(screen.getByText(PUSH_DEVICES_TEXT.denied)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: PUSH_DEVICES_TEXT.openSettings }));
    });
    expect(screen.queryByRole('button', { name: PUSH_DEVICES_TEXT.openSettings })).toBeNull();
    expect(screen.getByText(PUSH_DEVICES_TEXT.denied)).toBeTruthy();
  });

  it('옛 앱(플러그인 없음) → 스위치 disabled · 「앱을 업데이트하면 켤 수 있어요」 · 플러그인 호출 0', async () => {
    const { state } = installCapacitor({ platform: 'android', plugin: false });
    render(<PushDevicesPanel />);
    await act(async () => {});

    expect(thisSwitch()).toBeDisabled();
    expect(screen.getByText(PUSH_DEVICES_TEXT.updateNeeded)).toBeTruthy();
    expect(state.calls.filter((c) => c.startsWith('PushNotifications.'))).toEqual([]);
  });

  it('켜진 스위치 끄기 → PATCH → 꺼짐 · 네이티브 등록 해제는 하지 않는다', async () => {
    const { state } = installCapacitor({ platform: 'android', check: 'granted' });
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY_A);
    vi.mocked(fetchPushDevices).mockResolvedValue([device({ deviceKey: KEY_A, enabled: true })]);
    render(<PushDevicesPanel />);
    await act(async () => {});
    vi.mocked(fetchPushDevices).mockResolvedValue([device({ deviceKey: KEY_A, enabled: false })]);

    await act(async () => {
      fireEvent.click(thisSwitch());
    });
    await act(async () => {});

    expect(disablePushDevice).toHaveBeenCalledWith(KEY_A);
    expect(thisSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(state.calls).not.toContain('PushNotifications.unregister');
    expect(state.calls).not.toContain('PushNotifications.register');
  });

  it('하이드레이션 — 서버 HTML(마운트 전)에는 캡션 · 스위치 켜짐 · 기기 줄이 없다', async () => {
    installCapacitor({ platform: 'android', check: 'granted' });
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY_A);
    vi.mocked(fetchPushDevices).mockResolvedValue([
      device({ deviceKey: KEY_A, enabled: true }),
      device({ deviceKey: KEY_B, enabled: true }),
    ]);
    await refreshPushDevices();
    expect(pushDevicesSnapshot().devices).toHaveLength(2);

    const html = renderToString(<PushDevicesPanel />);
    expect(html).toContain('data-slot="me-push-devices-panel"');
    expect(html).not.toContain(PUSH_DEVICES_TEXT.captionApp);
    expect(html).not.toContain(PUSH_DEVICES_TEXT.captionWeb);
    expect(html).not.toContain('aria-checked="true"');
    expect(html).not.toContain('data-slot="me-push-device"');
  });
});

describe('usePushDevices 저장소 (40-11 이 읽는다)', () => {
  it('refreshPushDevices 는 진행 중 요청을 공유한다 · 끝나면 snapshot 에 목록 · loadedAt', async () => {
    let resolve!: (v: PushDevice[]) => void;
    vi.mocked(fetchPushDevices).mockImplementation(() => new Promise((r) => (resolve = r)));
    const p1 = refreshPushDevices();
    const p2 = refreshPushDevices();
    expect(fetchPushDevices).toHaveBeenCalledTimes(1);
    resolve([device({ deviceKey: KEY_A })]);
    await Promise.all([p1, p2]);
    const snap = pushDevicesSnapshot();
    expect(snap.devices.map((d) => d.deviceKey)).toEqual([KEY_A]);
    expect(snap.loadedAt).not.toBeNull();
  });

  it('패널 마운트 — 60초 안에 읽은 목록이 있으면 다시 읽지 않는다', async () => {
    vi.mocked(fetchPushDevices).mockResolvedValue([device({ deviceKey: KEY_A })]);
    await refreshPushDevices();
    expect(fetchPushDevices).toHaveBeenCalledTimes(1);
    render(<PushDevicesPanel />);
    await act(async () => {});
    expect(fetchPushDevices).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(1);
  });
});

describe('PushDevicesPanel — 받을 계좌 (quick-261109-dz1 · 스케치 031 A · D-06 · D-07 · D-10)', () => {
  const ACCOUNTS = [
    { accountNo: '12345678-01', name: '위탁종합', serverKey: 'KB120' },
    { accountNo: '87654321-01', name: '단기', serverKey: 'KB120' },
    { accountNo: '12345678-01', name: '위탁종합', serverKey: 'KB121' },
  ];
  const withAccounts = (accounts: RelayContextValue['accounts']) => {
    mockRelay = { ...EMPTY_RELAY_VALUE, accounts };
  };
  const accountRows = () =>
    Array.from(document.querySelectorAll('[data-slot="me-push-account"]')) as HTMLElement[];
  const accountSwitch = (name: string) => screen.getByRole('switch', { name: `${name} ${PUSH_DEVICES_TEXT.accountSwitchSuffix}` });
  const MAIN = '위탁종합 12345678-01 KB120';
  const SHORT = '단기 87654321-01 KB120';
  const before = (a: Element, b: Element) =>
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  it('relay 계좌 0 → 「받을 계좌」 없음 · 끈 계좌 읽기 0', async () => {
    render(<PushDevicesPanel />);
    await act(async () => {});
    expect(screen.queryByText(PUSH_DEVICES_TEXT.accountsHeading)).toBeNull();
    expect(fetchPushAccountMutes).not.toHaveBeenCalled();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('PC 웹: 소제목 · 같은 번호 한 줄 · 상품명 / 「번호 · 서버키」 · 끈 계좌 스위치 꺼짐 · 끝 안내 · 기기 목록보다 앞', async () => {
    withAccounts(ACCOUNTS);
    vi.mocked(fetchPushAccountMutes).mockResolvedValue(['87654321-01']);
    vi.mocked(fetchPushDevices).mockResolvedValue([device({ deviceKey: KEY_A, label: '내 폰' })]);
    render(<PushDevicesPanel />);
    await act(async () => {});

    const heading = screen.getByText(PUSH_DEVICES_TEXT.accountsHeading);
    expect(accountRows()).toHaveLength(2);
    const main = accountRows()[0];
    expect(main.textContent).toContain('위탁종합');
    expect(main.textContent).toContain('12345678-01 · KB120');
    expect(accountSwitch(MAIN)).toHaveAttribute('aria-checked', 'true');
    expect(accountSwitch(SHORT)).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(PUSH_DEVICES_TEXT.accountsFoot)).toBeTruthy();
    // PC 웹에서도 켜고 끌 수 있다.
    expect(accountSwitch(MAIN)).not.toBeDisabled();
    const list = document.querySelector('[data-slot="me-push-device-list"]')!;
    expect(before(heading, list)).toBe(true);
    // 웹: 계좌 줄과 기기 줄이 섞여 보이지 않게 기기 소제목.
    const devHeading = screen.getByText(PUSH_DEVICES_TEXT.devices);
    expect(before(heading, devHeading) && before(devHeading, list)).toBe(true);
    expect(fetchPushAccountMutes).toHaveBeenCalledTimes(1);
  });

  it('상품명이 빈 계좌 → 첫 줄이 번호', async () => {
    withAccounts([{ accountNo: '5555-0001', name: '', serverKey: 'KYOBO119' }]);
    render(<PushDevicesPanel />);
    await act(async () => {});
    const row = accountRows()[0];
    const lines = Array.from(row.querySelectorAll('span')).map((s) => s.textContent);
    expect(lines[0]).toBe('5555-0001');
    expect(lines[1]).toBe('KYOBO119');
  });

  it('켜진 계좌 스위치 → 응답 전에 바로 꺼짐 · PUT(번호, false) 1회 · 응답 뒤에도 꺼짐 · 저장소에 그 번호', async () => {
    withAccounts(ACCOUNTS);
    render(<PushDevicesPanel />);
    await act(async () => {});
    let resolve!: (v: { ok: true }) => void;
    vi.mocked(setPushAccountEnabled).mockImplementation(() => new Promise((r) => (resolve = r)));

    await act(async () => {
      fireEvent.click(accountSwitch(MAIN));
    });
    expect(accountSwitch(MAIN)).toHaveAttribute('aria-checked', 'false');
    expect(setPushAccountEnabled).toHaveBeenCalledTimes(1);
    expect(setPushAccountEnabled).toHaveBeenCalledWith('12345678-01', false);

    await act(async () => {
      resolve({ ok: true });
    });
    expect(accountSwitch(MAIN)).toHaveAttribute('aria-checked', 'false');
    expect(pushAccountMutesSnapshot().muted).toContain('12345678-01');
    expect(screen.queryByText(PUSH_DEVICES_TEXT.actionFailed)).toBeNull();
  });

  it('PUT 실패 → 원래(켜짐)로 · 「처리하지 못했어요」(role=status)', async () => {
    withAccounts(ACCOUNTS);
    render(<PushDevicesPanel />);
    await act(async () => {});
    let reject!: (e: unknown) => void;
    vi.mocked(setPushAccountEnabled).mockImplementation(() => new Promise((_, rj) => (reject = rj)));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await act(async () => {
      fireEvent.click(accountSwitch(MAIN));
    });
    expect(accountSwitch(MAIN)).toHaveAttribute('aria-checked', 'false');
    await act(async () => {
      reject(new Error('boom'));
    });
    expect(accountSwitch(MAIN)).toHaveAttribute('aria-checked', 'true');
    const status = screen.getByText(PUSH_DEVICES_TEXT.actionFailed);
    expect(status.getAttribute('role')).toBe('status');
    expect(pushAccountMutesSnapshot().muted).not.toContain('12345678-01');
  });

  it('끈 목록 첫 읽기 전에는 스위치 disabled · 읽기 실패면 「받을 계좌 설정을 읽지 못했어요」', async () => {
    withAccounts(ACCOUNTS);
    let reject!: (e: unknown) => void;
    vi.mocked(fetchPushAccountMutes).mockImplementation(() => new Promise((_, rj) => (reject = rj)));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<PushDevicesPanel />);
    await act(async () => {});
    expect(accountSwitch(MAIN)).toBeDisabled();
    expect(accountSwitch(SHORT)).toBeDisabled();

    await act(async () => {
      reject(new Error('boom'));
    });
    expect(screen.getByText(PUSH_DEVICES_TEXT.accountsLoadFailed)).toBeTruthy();
    expect(accountSwitch(MAIN)).toBeDisabled();
  });

  it('앱: 「이 기기 매매 알림」 → 「받을 계좌」 → 「다른 기기」 순서', async () => {
    installCapacitor({ platform: 'android', check: 'granted' });
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY_A);
    withAccounts(ACCOUNTS);
    vi.mocked(fetchPushDevices).mockResolvedValue([
      device({ deviceKey: KEY_A, label: '이 폰', enabled: true }),
      device({ deviceKey: KEY_B, label: '다른 폰', platform: 'ios', enabled: true }),
    ]);
    render(<PushDevicesPanel />);
    await act(async () => {});

    const accounts = screen.getByText(PUSH_DEVICES_TEXT.accountsHeading);
    const others = screen.getByText(PUSH_DEVICES_TEXT.otherDevices);
    expect(before(thisSwitch(), accounts)).toBe(true);
    expect(before(accounts, others)).toBe(true);
    // 앱에서는 「다른 기기」 소제목이 이미 있다 — 웹 「기기」 소제목은 없다.
    expect(screen.queryByText(PUSH_DEVICES_TEXT.devices)).toBeNull();
  });

  it('60초 안에 읽은 끈 목록이 있으면 재마운트 때 다시 읽지 않는다', async () => {
    withAccounts(ACCOUNTS);
    vi.mocked(fetchPushAccountMutes).mockResolvedValue(['87654321-01']);
    await refreshPushAccountMutes();
    expect(fetchPushAccountMutes).toHaveBeenCalledTimes(1);
    const { unmount } = render(<PushDevicesPanel />);
    await act(async () => {});
    unmount();
    render(<PushDevicesPanel />);
    await act(async () => {});
    expect(fetchPushAccountMutes).toHaveBeenCalledTimes(1);
    expect(accountSwitch(SHORT)).toHaveAttribute('aria-checked', 'false');
  });
});
