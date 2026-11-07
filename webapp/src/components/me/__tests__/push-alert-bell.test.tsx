import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { PushDevice } from '@gh-radar/shared';

/**
 * quick-261107-fbj · 스케치 030 A — 계정 카드 「매매 알림」 종.
 *
 * 각 케이스는 깨졌을 때 사용자가 겪는 일과 짝이다.
 *  - 점 판정이 틀리면 → 앱에서 이 기기 알림이 꺼져 있는데 켜진 줄 안다(다른 기기만 켜진 경우)
 *  - 기기 키를 마운트 때 한 번만 읽으면 → 스위치를 켠 직후에도 점이 안 켜져 「안 켜졌다」 고 다시 누른다
 *  - 폭 · 앱 갈림이 틀리면 → 폰에서 화면 밖으로 넘치는 팝오버가 뜬다
 *  - 하이드레이션 전에 점을 그리면 → 서버 HTML 과 어긋나 경고 · 깜빡임
 */

vi.mock('@/lib/push/push-devices-api', () => ({
  fetchPushDevices: vi.fn(async () => []),
  registerThisPushDevice: vi.fn(),
  disablePushDevice: vi.fn(async () => ({ ok: true })),
  deletePushDevice: vi.fn(async () => ({ ok: true })),
  unregisterThisDeviceBeforeSignOut: vi.fn(async () => {}),
}));

import { renderToString } from 'react-dom/server';

import { fetchPushDevices } from '@/lib/push/push-devices-api';
import { PUSH_DEVICE_KEY_STORAGE } from '@/lib/push/device-key';
import { __resetPushDevicesForTest, updatePushDevicesLocal } from '@/lib/push/use-push-devices';
import { PushAlertBell } from '../push-alert-bell';
import { PUSH_DEVICES_TEXT } from '../push-devices-panel';

const KEY_A = 'aaaaaaaa-2222-4333-8444-555555555555';
const KEY_B = 'bbbbbbbb-2222-4333-8444-555555555555';

function device(over: Partial<PushDevice> = {}): PushDevice {
  return {
    deviceKey: KEY_A,
    platform: 'android',
    label: 'SM-S918N · Android 15',
    enabled: true,
    lastSeenAt: '2026-11-06T00:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

/** 가짜 Capacitor(앱 셸) — push-devices-panel.test 의 최소판. 권한은 granted 로 둔다(패널이 마운트 때 확인한다). */
function installCapacitor() {
  const cap = {
    isPluginAvailable: vi.fn((name: string) => name === 'PushNotifications'),
    nativePromise: vi.fn(async (_plugin: string, method: string) => {
      if (method === 'checkPermissions') return { receive: 'granted' };
      return undefined;
    }),
    addListener: vi.fn(() => ({ remove: vi.fn(async () => {}) })),
  };
  (window as unknown as { Capacitor?: unknown }).Capacitor = cap;
  document.documentElement.classList.add('native-app');
  document.documentElement.setAttribute('data-native-platform', 'android');
}

/** 이 케이스의 뷰포트 폭 — `(min-width: 768px)` 참/거짓. */
function setWide(wide: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === '(min-width: 768px)' ? wide : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;
const bell = () => screen.getByRole('button', { name: PUSH_DEVICES_TEXT.title });
const dot = () => document.querySelector('[data-slot="push-alert-dot"]');

async function mount() {
  render(<PushAlertBell className="size-10" />);
  await act(async () => {});
}

beforeEach(() => {
  window.localStorage.clear();
  __resetPushDevicesForTest();
  vi.mocked(fetchPushDevices).mockReset().mockResolvedValue([]);
  setWide(false);
});

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  document.documentElement.classList.remove('native-app');
  document.documentElement.removeAttribute('data-native-platform');
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('PushAlertBell — 초록 점 판정', () => {
  it('브라우저 · 켜진 기기 0 → 접근 이름 · title 「매매 알림」 · BellOff · 점 없음', async () => {
    vi.mocked(fetchPushDevices).mockResolvedValue([device({ enabled: false })]);
    await mount();
    expect(bell()).toHaveAttribute('title', PUSH_DEVICES_TEXT.title);
    expect(bell().querySelector('svg.lucide-bell-off')).not.toBeNull();
    expect(dot()).toBeNull();
  });

  it('브라우저 · 등록 기기 하나라도 켜짐 → Bell + 점', async () => {
    vi.mocked(fetchPushDevices).mockResolvedValue([
      device({ deviceKey: KEY_A, enabled: false }),
      device({ deviceKey: KEY_B, enabled: true }),
    ]);
    await mount();
    expect(bell().querySelector('svg.lucide-bell')).not.toBeNull();
    expect(bell().querySelector('svg.lucide-bell-off')).toBeNull();
    expect(dot()).not.toBeNull();
  });

  it('앱 · 이 기기 키 행이 켜짐 → 점', async () => {
    installCapacitor();
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY_A);
    vi.mocked(fetchPushDevices).mockResolvedValue([device({ deviceKey: KEY_A, enabled: true })]);
    await mount();
    expect(dot()).not.toBeNull();
  });

  it('앱 · 이 기기 키 행은 꺼짐이고 다른 기기만 켜짐 → 점 없음', async () => {
    installCapacitor();
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY_A);
    vi.mocked(fetchPushDevices).mockResolvedValue([
      device({ deviceKey: KEY_A, enabled: false }),
      device({ deviceKey: KEY_B, enabled: true }),
    ]);
    await mount();
    expect(dot()).toBeNull();
    expect(bell().querySelector('svg.lucide-bell-off')).not.toBeNull();
  });

  it('앱 · 마운트 뒤 기기 키를 처음 만들고 그 행을 저장소에 넣으면 다시 마운트하지 않아도 점이 생긴다(켜기 직후)', async () => {
    installCapacitor();
    await mount();
    expect(dot()).toBeNull();

    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY_A);
    act(() => {
      updatePushDevicesLocal((list) => [device({ deviceKey: KEY_A, enabled: true }), ...list]);
    });
    expect(dot()).not.toBeNull();
  });
});

describe('PushAlertBell — 시트 / 팝오버 갈림', () => {
  it('데스크톱 브라우저(≥768) → 종에 붙은 팝오버 안에 제목 「매매 알림」 · 패널', async () => {
    setWide(true);
    await mount();
    await act(async () => {
      fireEvent.click(bell());
    });
    const pop = document.querySelector('[data-slot="popover-content"]');
    expect(pop).not.toBeNull();
    expect(pop!.querySelector('[data-slot="me-push-devices-panel"]')).not.toBeNull();
    expect(pop!.textContent).toContain(PUSH_DEVICES_TEXT.title);
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('폰 폭(<768) 브라우저 → 바텀 시트 안에 패널', async () => {
    setWide(false);
    await mount();
    await act(async () => {
      fireEvent.click(bell());
    });
    const sheet = document.querySelector('[data-slot="sheet-content"][data-side="bottom"]');
    expect(sheet).not.toBeNull();
    expect(sheet!.querySelector('[data-slot="me-push-devices-panel"]')).not.toBeNull();
    expect(screen.getByRole('dialog', { name: PUSH_DEVICES_TEXT.title })).toBeTruthy();
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  });

  it('앱은 넓은 폭이어도 바텀 시트', async () => {
    installCapacitor();
    setWide(true);
    await mount();
    await act(async () => {
      fireEvent.click(bell());
    });
    expect(document.querySelector('[data-slot="sheet-content"][data-side="bottom"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  });

  it('시트 · 팝오버를 열어도 Radix 제목/설명 경고(console.error · console.warn)가 나지 않는다', async () => {
    const err = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    setWide(false);
    await mount();
    await act(async () => {
      fireEvent.click(bell());
    });
    expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
    const radixMsg = (calls: unknown[][]) =>
      calls.filter((c) => /DialogTitle|DialogContent|Description|aria-describedby/.test(String(c[0])));
    expect(radixMsg(err.mock.calls)).toEqual([]);
    expect(radixMsg(warn.mock.calls)).toEqual([]);
  });
});

describe('PushAlertBell — 하이드레이션', () => {
  it('서버 HTML 에는 점이 없다(켜진 기기가 저장소에 있어도)', () => {
    act(() => {
      updatePushDevicesLocal(() => [device({ enabled: true })]);
    });
    const html = renderToString(<PushAlertBell className="size-10" />);
    expect(html).not.toContain('data-slot="push-alert-dot"');
    expect(html).toContain(`aria-label="${PUSH_DEVICES_TEXT.title}"`);
  });
});
