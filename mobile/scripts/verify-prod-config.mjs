#!/usr/bin/env node
/**
 * GH Trade 운영 설정 검사 (Phase 21 · 21-16 · Pitfall 15 · T-21-01 · T-21-04).
 *
 * 생성 설정(iOS `ios/App/App/capacitor.config.json` · Android `android/app/src/main/assets/capacitor.config.json`)
 * 이 지금 운영값인지 **현재 상태만** 검사한다. 이 스크립트는 스스로 동기화하지 않는다 —
 * dev 동기화(`native:sync:dev` · 스모크 도중 중단)가 남아 있으면 실패해야 의미가 있다.
 *
 * 검사 항목
 *   - server.url === https://trade.jx1.io
 *   - server.cleartext 가 true 아님
 *   - appId === (APP_ID 환경변수 ?? com.ghtrade.app — 21-01 확정 번들 ID)
 *   - server 에 내비게이션 허용 목록(allowNavigation) · 오류 경로(errorPath) 키 없음
 *   - 릴리스 WebView 디버깅 · CapacitorHttp/CapacitorCookies 가 켜져 있지 않음(21-01 금지 키)
 *   - Android 매니페스트(생성 플러그인 매니페스트 · 앱 매니페스트)에 usesCleartextTraffic="true" 없음
 *   - iOS Info.plist 에 NSAllowsArbitraryLoads 없음
 *
 * 통과: 성공 한 줄 · exit 0. 위반: 한 줄씩 `FAIL …` · exit 1.
 * 사용: pnpm --filter @gh-radar/mobile run native:verify-prod
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROD_URL = 'https://trade.jx1.io';
const APP_ID = process.env.APP_ID ?? 'com.ghtrade.app';
const FORBIDDEN_SERVER_KEYS = ['allowNavigation', 'errorPath'];

const GENERATED = [
  { platform: 'ios', path: join(MOBILE_DIR, 'ios/App/App/capacitor.config.json') },
  { platform: 'android', path: join(MOBILE_DIR, 'android/app/src/main/assets/capacitor.config.json') },
];
const ANDROID_MANIFESTS = [
  join(MOBILE_DIR, 'android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml'),
  join(MOBILE_DIR, 'android/app/src/main/AndroidManifest.xml'),
];
const IOS_INFO_PLIST = join(MOBILE_DIR, 'ios/App/App/Info.plist');

const rel = (p) => relative(MOBILE_DIR, p);
const failures = [];
const fail = (msg) => failures.push(msg);

const missing = GENERATED.filter(({ path }) => !existsSync(path));
if (missing.length > 0) {
  for (const { path } of missing) console.error(`FAIL 생성 설정 없음: ${rel(path)}`);
  console.error('먼저 `pnpm --filter @gh-radar/mobile run native:sync` 를 실행하세요');
  process.exit(1);
}

for (const { platform, path } of GENERATED) {
  let config;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`[${platform}] ${rel(path)} JSON 파싱 실패 — ${err.message}`);
    continue;
  }
  const server = config.server ?? {};
  if (server.url !== PROD_URL) {
    fail(`[${platform}] server.url = ${JSON.stringify(server.url)} (기대 ${PROD_URL}) — dev 동기화가 남아 있다`);
  }
  if (server.cleartext === true) {
    fail(`[${platform}] server.cleartext = true — 운영 빌드에 cleartext 허용이 남아 있다`);
  }
  if (config.appId !== APP_ID) {
    fail(`[${platform}] appId = ${JSON.stringify(config.appId)} (기대 ${APP_ID})`);
  }
  for (const key of FORBIDDEN_SERVER_KEYS) {
    if (key in server) fail(`[${platform}] server.${key} 키가 있다 — 추가 금지 키(21-01 · RESEARCH Pattern 9)`);
  }
  for (const scope of ['android', 'ios']) {
    if (config[scope]?.webContentsDebuggingEnabled === true) {
      fail(`[${platform}] ${scope}.webContentsDebuggingEnabled = true — 릴리스 WebView 디버깅 금지(T-21-04)`);
    }
  }
  for (const plugin of ['CapacitorHttp', 'CapacitorCookies']) {
    if (config.plugins?.[plugin]?.enabled === true) {
      fail(`[${platform}] plugins.${plugin}.enabled = true — 켜지 않는다(SSE 스트리밍 · RESEARCH Pattern 9)`);
    }
  }
}

for (const manifest of ANDROID_MANIFESTS) {
  if (!existsSync(manifest)) continue;
  if (/usesCleartextTraffic\s*=\s*"true"/.test(readFileSync(manifest, 'utf8'))) {
    fail(`[android] ${rel(manifest)} 에 usesCleartextTraffic="true" — dev 동기화 흔적(RESEARCH Pattern 9)`);
  }
}

if (existsSync(IOS_INFO_PLIST) && readFileSync(IOS_INFO_PLIST, 'utf8').includes('NSAllowsArbitraryLoads')) {
  fail(`[ios] ${rel(IOS_INFO_PLIST)} 에 NSAllowsArbitraryLoads — ATS 예외 금지(21-01)`);
}

if (failures.length > 0) {
  for (const msg of failures) console.error(`FAIL ${msg}`);
  console.error('운영 설정으로 되돌리려면: pnpm --filter @gh-radar/mobile run native:sync');
  process.exit(1);
}

console.log(`PROD CONFIG OK — ${PROD_URL} · cleartext 없음 · appId ${APP_ID} (ios · android)`);
