import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 40 — 이 기기 푸시 키 · 기기명(D-12 · D-13).
 *
 *  - 키가 호출마다 바뀌면 → 켤 때마다 서버에 새 행이 쌓이고 로그아웃 정리(D-15)가 엉뚱한 키를 지운다
 *  - 대문자 · 형식 위반 키면 → server 400 · DB CHECK 위반으로 켜기가 늘 실패한다
 *  - 기기명이 틀리면 → PC 목록에서 어느 폰인지 못 알아본다
 */

import {
  PUSH_DEVICE_KEY_STORAGE,
  getOrCreatePushDeviceKey,
  pushDeviceLabel,
  readPushDeviceKey,
} from '../device-key';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('pushDeviceLabel', () => {
  it('Android UA → 「SM-S918N · Android 15」', () => {
    expect(
      pushDeviceLabel(
        'Mozilla/5.0 (Linux; Android 15; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      ),
    ).toBe('SM-S918N · Android 15');
  });

  it('Android WebView UA 의 Build/… 꼬리는 뗀다', () => {
    expect(
      pushDeviceLabel(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
      ),
    ).toBe('Pixel 8 · Android 14');
  });

  it('iPhone UA → 「iPhone · iOS 18.1」(_ → .)', () => {
    expect(
      pushDeviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      ),
    ).toBe('iPhone · iOS 18.1');
  });

  it('모르는 UA → 「알 수 없는 기기」 · 80자에서 자른다', () => {
    expect(pushDeviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('알 수 없는 기기');
    const long = pushDeviceLabel(`Mozilla/5.0 (Linux; Android 15; ${'X'.repeat(200)})`);
    expect(long.length).toBe(80);
  });
});

describe('getOrCreatePushDeviceKey', () => {
  it('두 번 불러도 같은 값 · 소문자 UUID · localStorage 에 저장 · readPushDeviceKey 가 같은 값', () => {
    const a = getOrCreatePushDeviceKey();
    const b = getOrCreatePushDeviceKey();
    expect(a).toBe(b);
    expect(a).toMatch(UUID_RE);
    expect(window.localStorage.getItem(PUSH_DEVICE_KEY_STORAGE)).toBe(a);
    expect(readPushDeviceKey()).toBe(a);
  });

  it('형식이 틀린 저장값은 읽지 않는다', () => {
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, 'AAAAAAAA-1111-4222-8333-444455556666');
    expect(readPushDeviceKey()).not.toBe('AAAAAAAA-1111-4222-8333-444455556666');
  });

  it('localStorage 접근이 throw 여도 값은 돌려준다(같은 탭에서 같은 값)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const a = getOrCreatePushDeviceKey();
    expect(a).toMatch(UUID_RE);
    expect(getOrCreatePushDeviceKey()).toBe(a);
  });
});
