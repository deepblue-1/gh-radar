import { describe, it, expect } from 'vitest';

import {
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_URL_SCHEME,
} from '../google-client-ids';

/**
 * Phase 21 Plan 03 Task 3 — 네이티브 Google 로그인 공개 식별자(D-03) 회귀면.
 *
 * 각 케이스는 **깨졌을 때 사용자가 겪는 일**과 1:1 이다.
 *
 *  1. 형식            → 깨지면 SocialLogin initialize 가 잘못된 클라이언트로 뜨거나 Supabase 가 aud 를 거부한다
 *  2. 공백·개행 없음  → 깨지면 id_token aud 비교가 한 글자 차이로 실패한다(Vercel env 개행 사고와 같은 유형)
 *  3. 세 값이 서로 다름 → 깨지면 플랫폼 클라이언트를 복사·붙여넣기 실수로 겹쳐 적은 것 — 한 플랫폼 로그인이 막힌다
 *  4. iOS URL scheme 역순 → 깨지면 iOS 에서 Google 로그인 후 앱으로 돌아오지 못한다(Info.plist 콜백 불일치)
 */

const CLIENT_ID_RE = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

const ALL = {
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
} as const;

describe('google-client-ids', () => {
  it.each(Object.entries(ALL))('%s 가 GCP OAuth 클라이언트 ID 형식이다', (_name, value) => {
    expect(value).toMatch(CLIENT_ID_RE);
  });

  it.each(Object.entries({ ...ALL, GOOGLE_IOS_URL_SCHEME }))(
    '%s 에 앞뒤 공백·개행이 없다',
    (_name, value) => {
      expect(value).toBe(value.trim());
      expect(value).not.toMatch(/\s/);
    },
  );

  it('웹·iOS·Android 세 값이 서로 다르다', () => {
    expect(new Set(Object.values(ALL)).size).toBe(3);
  });

  it('세 값이 같은 GCP 프로젝트 번호(1023658565518)를 쓴다', () => {
    for (const v of Object.values(ALL)) {
      expect(v.split('-')[0]).toBe('1023658565518');
    }
  });

  it('GOOGLE_IOS_URL_SCHEME 은 iOS 클라이언트 ID 의 `.` 토큰을 뒤집어 이은 값이다', () => {
    const reversed = GOOGLE_IOS_CLIENT_ID.split('.').reverse().join('.');
    expect(GOOGLE_IOS_URL_SCHEME).toBe(reversed);
    expect(GOOGLE_IOS_URL_SCHEME.startsWith('com.googleusercontent.apps.')).toBe(true);
  });
});
