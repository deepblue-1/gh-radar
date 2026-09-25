/**
 * 앱 셸 네이티브 Google 로그인 (Phase 21 · D-03).
 *
 * - **왜 네이티브인가:** Google 은 WebView 안의 OAuth 를 `disallowed_userAgent` 로 막는다. 앱(`html.native-app`)의
 *   `/login` 은 `signInWithOAuth` 대신 이 함수를 부른다 — 네이티브 플러그인 `SocialLogin`
 *   (`@capgo/capacitor-social-login@8.5.11`, `mobile/` 에만 설치)이 OS 계정 선택 UI 로 id_token 을 받고,
 *   `supabase.auth.signInWithIdToken` 이 그 토큰으로 **같은 Supabase 쿠키 세션**을 만든다(middleware·로그아웃 무변경).
 *   UA 위장은 하지 않는다.
 * - **nonce 방향:** raw nonce(32바이트 Web Crypto 난수 hex)를 만들고, 플러그인(→ Google)에는 **SHA-256(raw) hex**,
 *   Supabase 에는 **raw** 를 준다. Google 은 받은 값을 id_token 의 `nonce` 클레임에 그대로 싣고, Supabase 는
 *   받은 raw 를 해시해 클레임과 비교한다(auth-js `SignInWithIdTokenCredentials.nonce` 주석 「the hash of this value is
 *   compared to the value in the ID token」). 방향이 뒤집히면 항상 nonce 불일치로 실패한다. 재전송 방지(T-21-07).
 * - **forcePrompt 를 켠다:** iOS 플러그인은 이전 로그인이 있으면 `restorePreviousSignIn` 으로 **nonce 없는 옛 토큰**을
 *   돌려준다(21-RESEARCH Pitfall 6) → 두 번째 로그인부터 Supabase 가 거부한다. 매번 계정 선택을 띄우면 해결되고,
 *   웹의 `prompt=select_account` 와 UX 도 같다(T-21-10).
 * - **의존성 추가 없음:** webapp 에 `@capacitor/core`·플러그인 npm 패키지를 넣지 않는다. 원격 페이지에는 Capacitor
 *   native-bridge 가 `window.Capacitor` 를 주입하므로 `nativePromise('SocialLogin', method, options)` 를 얇게 부른다 —
 *   플러그인 JS 래퍼도 google 경로에서 인자를 그대로 넘기므로 동치다. 창 타입은 이 파일 안 지역 캐스팅(전역 선언 확장 금지).
 * - **명시 scopes 없음:** 플러그인 기본 범위(openid·email·profile)로 충분하고, 명시 scopes 는 Android 에서 추가 Activity
 *   구현을 요구할 수 있다(21-15 SUMMARY 참조).
 * - **보안 출처 전용:** `crypto.subtle` 은 https · `http://localhost` 에서만 존재한다 — LAN IP dev
 *   (`http://192.168.x.x:3100`)에서는 동작하지 않는다(Pitfall 16).
 * - **토큰은 어떤 로그에도 남기지 않는다(T-21-42).** 이 파일은 로그를 쓰지 않고, 호출부도 오류 메시지만 남긴다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from './google-client-ids';

/** `createClient()` 의 반환값이 그대로 들어간다 — 이 함수가 쓰는 표면만 요구한다(테스트 목 주입 용이). */
export type NativeLoginSupabase = { auth: Pick<SupabaseClient['auth'], 'signInWithIdToken'> };

export type NativeLoginErrorKey = 'oauth_denied' | 'auth_failed';

type NativePromise = <T>(plugin: string, method: string, options?: object) => Promise<T>;

/** SocialLogin google `login` 결과 — 정본은 `result.idToken`(최상위 `idToken` 아님). Android 는 accessToken 이 null 일 수 있다. */
type GoogleLoginResponse = {
  result?: {
    idToken?: string | null;
    accessToken?: { token?: string | null } | null;
  } | null;
};

function nativePromise(): NativePromise {
  const cap = (window as unknown as { Capacitor?: { nativePromise?: NativePromise } }).Capacitor;
  if (!cap || typeof cap.nativePromise !== 'function') throw new Error('native_unavailable');
  return cap.nativePromise.bind(cap) as NativePromise;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 암호학적 난수 nonce — 기본 32바이트 → 64자 소문자 hex. */
export function randomNonce(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

/** SHA-256 hex (Web Crypto) — 보안 출처 전용(Pitfall 16). */
export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return toHex(new Uint8Array(digest));
}

const CANCEL_PATTERNS = [/cancel/i, /USER_CANCELLED/, /(^|\D)12501(\D|$)/, /(^|\D)-5(\D|$)/];

/**
 * 네이티브 로그인 실패 → 기존 `/login` 오류 문구 키. 사용자 취소(iOS GIDSignIn 취소 `-5` · Android Credential
 * Manager `USER_CANCELLED`/`12501` · 메시지의 cancel)는 `oauth_denied`, 그 외는 `auth_failed`.
 * 오류 모양은 플랫폼마다 달라 메시지·코드를 모두 문자열로 본다(21-RESEARCH Pattern 7 — 기기 로그로 재확인 대상).
 */
export function classifyNativeLoginError(err: unknown): NativeLoginErrorKey {
  const parts: string[] = [];
  if (typeof err === 'string') parts.push(err);
  else if (err && typeof err === 'object') {
    const { message, code } = err as { message?: unknown; code?: unknown };
    if (message != null) parts.push(String(message));
    if (code != null) parts.push(String(code));
  }
  const text = parts.join(' ');
  return CANCEL_PATTERNS.some((re) => re.test(text)) ? 'oauth_denied' : 'auth_failed';
}

/**
 * 네이티브 계정 선택 → id_token → Supabase 세션. 성공 시 세션 쿠키가 이미 쓰였으므로 호출부가 하드 내비한다.
 * - 플러그인·브리지 실패(취소 포함)는 **reject** — 호출부가 `classifyNativeLoginError` 로 분류한다.
 * - Supabase 검증 실패는 `{ error }` 로 돌려준다.
 */
export async function nativeGoogleSignIn(
  supabase: NativeLoginSupabase,
): Promise<{ error: Error | null }> {
  const call = nativePromise();

  await call('SocialLogin', 'initialize', {
    google: {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iOSClientId: GOOGLE_IOS_CLIENT_ID,
      iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
      mode: 'online',
    },
  });

  const raw = randomNonce();
  const res = await call<GoogleLoginResponse>('SocialLogin', 'login', {
    provider: 'google',
    options: { nonce: await sha256Hex(raw), forcePrompt: true },
  });

  const idToken = res?.result?.idToken;
  if (!idToken) throw new Error('no_id_token');
  const accessToken = res.result?.accessToken?.token;

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    nonce: raw,
    // id_token 에 at_hash 가 있으면 Supabase 가 access_token 을 요구한다 — 있을 때만 넘긴다.
    ...(accessToken ? { access_token: accessToken } : {}),
  });
  return { error: error ?? null };
}
