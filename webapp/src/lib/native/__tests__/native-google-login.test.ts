import { webcrypto } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

import {
  classifyNativeLoginError,
  nativeGoogleSignIn,
  randomNonce,
  sha256Hex,
  type NativeLoginSupabase,
} from '../native-google-login';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../google-client-ids';

/**
 * Phase 21 Plan 15 Task 1 — 네이티브 Google 로그인 서비스(D-03) 회귀면.
 *
 * 각 케이스는 **깨졌을 때 사용자가 겪는 일**과 1:1 이다.
 *  - nonce 방향(플러그인=SHA-256 해시, Supabase=raw)이 뒤집히면 → 앱 로그인이 항상 `nonce mismatch` 로 실패
 *  - `forcePrompt` 가 빠지면 → iOS 두 번째 로그인부터 nonce 없는 옛 토큰이 돌아와 실패(Pitfall 6)
 *  - `result.idToken` 을 잘못 읽으면 → 성공한 계정 선택 뒤에도 「로그인 실패」
 *  - 취소 분류가 틀리면 → 사용자가 닫았을 뿐인데 「로그인 처리에 실패」라고 겁을 준다
 */

type CapWindow = Window & { Capacitor?: { nativePromise?: Mock } };

const ID_TOKEN = 'eyJ.fake.idtoken';

function installCapacitor(loginResult: unknown): Mock {
  const nativePromise = vi.fn(async (_plugin: string, method: string) => {
    if (method === 'initialize') return {};
    if (method === 'login') return loginResult;
    throw new Error(`unexpected method ${method}`);
  });
  (window as CapWindow).Capacitor = { nativePromise };
  return nativePromise;
}

function makeSupabase(response: { error: Error | null } = { error: null }) {
  const signInWithIdToken = vi.fn<(credentials: Record<string, unknown>) => Promise<unknown>>(
    async () => ({ data: {}, ...response }),
  );
  return {
    supabase: { auth: { signInWithIdToken } } as unknown as NativeLoginSupabase,
    signInWithIdToken,
  };
}

beforeEach(() => {
  // jsdom 은 crypto.subtle 을 주지 않는 경우가 있다 — Node Web Crypto 로 고정.
  vi.stubGlobal('crypto', webcrypto);
});

afterEach(() => {
  delete (window as CapWindow).Capacitor;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('randomNonce', () => {
  it('기본 32바이트 → 64자 소문자 hex · 호출마다 다르다', () => {
    const a = randomNonce();
    const b = randomNonce();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('바이트 수 인자를 따른다', () => {
    expect(randomNonce(16)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('sha256Hex', () => {
  it("'abc' → FIPS 180-2 표준 벡터", async () => {
    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('nativeGoogleSignIn', () => {
  it('initialize → login(해시 nonce · forcePrompt) → signInWithIdToken(raw nonce) 순서와 인자', async () => {
    const nativePromise = installCapacitor({ provider: 'google', result: { idToken: ID_TOKEN } });
    const { supabase, signInWithIdToken } = makeSupabase();

    const res = await nativeGoogleSignIn(supabase);
    expect(res).toEqual({ error: null });

    expect(nativePromise).toHaveBeenCalledTimes(2);
    expect(nativePromise.mock.calls[0]).toEqual([
      'SocialLogin',
      'initialize',
      {
        google: {
          webClientId: GOOGLE_WEB_CLIENT_ID,
          iOSClientId: GOOGLE_IOS_CLIENT_ID,
          iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
          mode: 'online',
        },
      },
    ]);

    const [plugin, method, loginOpts] = nativePromise.mock.calls[1] as [
      string,
      string,
      { provider: string; options: Record<string, unknown> },
    ];
    expect(plugin).toBe('SocialLogin');
    expect(method).toBe('login');
    expect(loginOpts.provider).toBe('google');
    // 명시 scopes 는 넣지 않는다(플러그인 기본 openid·email·profile) — 옵션 키는 정확히 두 개.
    expect(Object.keys(loginOpts.options).sort()).toEqual(['forcePrompt', 'nonce']);
    expect(loginOpts.options.forcePrompt).toBe(true);
    const hashed = loginOpts.options.nonce as string;
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);

    expect(signInWithIdToken).toHaveBeenCalledTimes(1);
    const args = signInWithIdToken.mock.calls[0]![0];
    expect(args).toEqual({ provider: 'google', token: ID_TOKEN, nonce: expect.any(String) });
    const raw = args.nonce as string;
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(raw).not.toBe(hashed);
    await expect(sha256Hex(raw)).resolves.toBe(hashed);
  });

  it('accessToken.token 이 있으면 access_token 도 넘긴다(at_hash 대비)', async () => {
    installCapacitor({ result: { idToken: ID_TOKEN, accessToken: { token: 'ya29.access' } } });
    const { supabase, signInWithIdToken } = makeSupabase();
    await nativeGoogleSignIn(supabase);
    expect(signInWithIdToken.mock.calls[0]![0]).toMatchObject({ access_token: 'ya29.access' });
  });

  it('accessToken 이 null 이면 access_token 키 자체가 없다', async () => {
    installCapacitor({ result: { idToken: ID_TOKEN, accessToken: null } });
    const { supabase, signInWithIdToken } = makeSupabase();
    await nativeGoogleSignIn(supabase);
    expect(signInWithIdToken.mock.calls[0]![0]).not.toHaveProperty('access_token');
  });

  it('result.idToken 이 없으면 no_id_token 으로 reject · Supabase 호출 0', async () => {
    // 최상위 idToken 은 읽지 않는다 — 정본은 result.idToken(플러그인 README).
    installCapacitor({ idToken: ID_TOKEN, result: { idToken: null } });
    const { supabase, signInWithIdToken } = makeSupabase();
    await expect(nativeGoogleSignIn(supabase)).rejects.toThrow('no_id_token');
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it('signInWithIdToken 의 { error } 를 그대로 돌려준다', async () => {
    installCapacitor({ result: { idToken: ID_TOKEN } });
    const err = new Error('Nonces mismatch');
    const { supabase } = makeSupabase({ error: err });
    await expect(nativeGoogleSignIn(supabase)).resolves.toEqual({ error: err });
  });

  it('window.Capacitor.nativePromise 가 없으면 native_unavailable 로 reject', async () => {
    const { supabase, signInWithIdToken } = makeSupabase();
    await expect(nativeGoogleSignIn(supabase)).rejects.toThrow('native_unavailable');
    (window as CapWindow).Capacitor = {};
    await expect(nativeGoogleSignIn(supabase)).rejects.toThrow('native_unavailable');
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it('플러그인 login reject 는 그대로 전파된다(취소 분류는 호출부)', async () => {
    const nativePromise = vi.fn(async (_p: string, method: string) => {
      if (method === 'initialize') return {};
      throw Object.assign(new Error('The user canceled the sign-in flow.'), { code: '-5' });
    });
    (window as CapWindow).Capacitor = { nativePromise };
    const { supabase, signInWithIdToken } = makeSupabase();
    await expect(nativeGoogleSignIn(supabase)).rejects.toThrow(/canceled/);
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });
});

describe('classifyNativeLoginError', () => {
  it.each([
    ['iOS GIDSignIn 취소 메시지', new Error('The user canceled the sign-in flow.')],
    ['대소문자 무관 Cancel', new Error('Login Cancelled by user')],
    ['Android USER_CANCELLED 코드', Object.assign(new Error('failed'), { code: 'USER_CANCELLED' })],
    ['Android 12501', new Error('12501: ')],
    ['iOS GIDSignIn -5 코드', Object.assign(new Error('error'), { code: '-5' })],
    ['문자열 reject', 'user cancelled'],
    ['평범 객체', { message: 'x', code: 'USER_CANCELLED' }],
  ])('%s → oauth_denied', (_label, err) => {
    expect(classifyNativeLoginError(err)).toBe('oauth_denied');
  });

  it.each([
    ['no_id_token', new Error('no_id_token')],
    ['native_unavailable', new Error('native_unavailable')],
    ['네트워크', new Error('Network error')],
    ['null', null],
    ['undefined', undefined],
  ])('%s → auth_failed', (_label, err) => {
    expect(classifyNativeLoginError(err)).toBe('auth_failed');
  });
});
