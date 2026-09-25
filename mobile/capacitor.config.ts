/**
 * GH Trade 네이티브 셸 설정 (Phase 21).
 *
 * D-01 Remote-URL 셸 — 앱은 운영 웹(`https://trade.jx1.io`)을 WebView 로 로드한다.
 * static export·로컬 번들은 없다. `webDir`(`www/`)에는 오프라인 폴백 `index.html` 만 둔다
 * (iOS 는 webDir/index.html 이 없으면 로드 자체가 치명 오류다).
 *
 * `CAP_SERVER_URL` 은 **dev 전용**이다(`native:sync:dev` = `http://localhost:3100`).
 * `cap sync` 는 이 값을 생성 설정(ios/App/App/capacitor.config.json · android assets)에 굽는다 —
 * dev sync 뒤 기기용 빌드 전에는 반드시 env 없이 `native:sync` 로 되돌린다(Pitfall 15).
 *
 * 이 파일에는 Capacitor 기본값을 바꾸는 보안 관련 키를 추가하지 않는다 — 앱 호스트만 내비게이션
 * 허용 · 릴리스 WebView 디버깅 off · fetch/SSE 는 WebView 표준 경로(21-01 threat model V14).
 */
import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL ?? 'https://trade.jx1.io';

const config: CapacitorConfig = {
  appId: 'com.ghtrade.app',
  appName: 'GH Trade',
  webDir: 'www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
  },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    // D-03 네이티브 Google 로그인(21-15) — google 만 켠다(노출 플러그인 최소 · T-21-15). 플러그인의
    // `capacitor:sync:before` 훅이 이 값으로 자기 Package.swift·gradle.properties 에서 꺼진 provider SDK 를 뺀다.
    SocialLogin: {
      providers: { google: true, facebook: false, apple: false, twitter: false },
    },
  },
};

export default config;
