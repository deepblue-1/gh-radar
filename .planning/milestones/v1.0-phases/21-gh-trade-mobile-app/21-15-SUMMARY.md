---
phase: 21-gh-trade-mobile-app
plan: 15
subsystem: auth
tags: [capacitor, google-sign-in, supabase, signInWithIdToken, nonce, web-crypto, credential-manager, googlesignin-ios, spm]

requires:
  - phase: 21-01
    provides: "mobile/ 패키지 · capacitor.config.ts · @capgo/capacitor-social-login@8.5.11 승인 · SwiftPM 키체인 우회"
  - phase: 21-03
    provides: "google-client-ids.ts (WEB · IOS · ANDROID · IOS_URL_SCHEME) · Supabase Authorized Client IDs · Skip nonce OFF"
  - phase: 21-09
    provides: "/login 제목 「GH Trade에 로그인」"
  - phase: 21-11
    provides: "iOS 셸(SceneDelegate · GHTradeBridgeViewController)"
  - phase: 21-13
    provides: "Android 셸(MainActivity · smoke-android.sh)"
provides:
  - "webapp/src/lib/native/native-google-login.ts — nativeGoogleSignIn · randomNonce · sha256Hex · classifyNativeLoginError · NativeLoginSupabase · NativeLoginErrorKey"
  - "/login 앱 분기(isNativeApp → 네이티브 id_token 로그인 → location.replace(safeNext)) · 진행 중 disabled/aria-busy"
  - "mobile/: @capgo/capacitor-social-login 8.5.11 설치 · SocialLogin providers google 만 · iOS CFBundleURLTypes(역순 iOS 클라이언트 ID)"
  - "iOS SPM: GoogleSignIn-iOS 9.2.0 · AppAuth 2.1.0 · GTMAppAuth 5.0.0 · GTMSessionFetcher 3.5.0 · AppCheck 11.3.2 · GoogleUtilities 8.1.3 · Promises 2.4.1 (Package.resolved)"
affects: [21-16]

actuals:
  tokens: 8900
  tasks: 3
  commits: 6
plan_head_before: ca3b570149862c52efd509e59b8c1179147ad5bc

tech-stack:
  added: ["@capgo/capacitor-social-login 8.5.11 (mobile/ 전용)", "GoogleSignIn-iOS 9.2.0 (SPM, 전이)", "androidx.credentials (Android, 플러그인 전이)"]
  patterns:
    - "웹에서 네이티브 플러그인 호출은 npm 패키지 없이 window.Capacitor.nativePromise(plugin, method, options) 지역 캐스팅 래퍼"
    - "nonce: raw 는 Supabase, SHA-256(raw) hex 는 플러그인(→ Google id_token nonce 클레임)"
    - "서비스 함수는 좁은 구조 타입(NativeLoginSupabase = auth.signInWithIdToken 만)을 받아 createClient() 와 테스트 목을 모두 수용"
    - "WebView 런타임 검증: adb forward webview_devtools_remote_<pid> → CDP Runtime.evaluate 로 버튼 클릭·nativePromise 래핑 계측"

key-files:
  created:
    - webapp/src/lib/native/native-google-login.ts
    - webapp/src/lib/native/__tests__/native-google-login.test.ts
    - webapp/src/app/login/__tests__/page.test.tsx
  modified:
    - webapp/src/app/login/page.tsx
    - mobile/package.json
    - pnpm-lock.yaml
    - mobile/capacitor.config.ts
    - mobile/ios/App/App/Info.plist
    - mobile/ios/App/CapApp-SPM/Package.swift
    - mobile/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
    - mobile/android/capacitor.settings.gradle
    - mobile/android/app/capacitor.build.gradle

key-decisions:
  - "21-15: Android MainActivity 는 건드리지 않는다 — 플러그인 GoogleProvider.java 는 mode OFFLINE 또는 명시 scopes 일 때만 ModifiedMainActivityForSocialLoginPlugin 구현을 요구한다(online · scopes 없음 구성은 해당 없음, 소스 L439·L477 확인)"
  - "21-15: iOS 는 Info.plist CFBundleURLTypes(google · GOOGLE_IOS_URL_SCHEME) 만 추가 — AppDelegate/SceneDelegate URL 핸들러 추가 없음(README 의 GIDSignIn.handle(url) 예시는 Facebook+Google 결합용이고, GoogleSignIn 9 는 ASWebAuthenticationSession 으로 콜백을 스스로 받는다). 실제 계정 로그인은 21-16 UAT 에서 재확인"
  - "21-15: 로그인 성공 뒤에는 pending 을 풀지 않는다(플랜 코드의 finally setPending(false) 대신 실패 경로에서만 해제) — 페이지가 떠나는 동안 재탭으로 계정 선택 시트가 다시 뜨지 않게"
  - "21-15: 취소 분류 패턴 12501 · -5 는 숫자 경계로 매칭(/(^|\\D)-5(\\D|$)/) — -50 같은 다른 코드 오탐 방지. Android 실측 취소 모양 = code USER_CANCELLED · message 'Google Sign-In cancelled by user'"

patterns-established:
  - "앱 전용 인증 경로는 발급만 곁에 붙이고(add-alongside) 세션 정본(Supabase 쿠키)·middleware·로그아웃은 무변경"

requirements-completed: []

coverage:
  - id: D1
    description: "네이티브 id_token 로그인 서비스 — nonce raw↔SHA-256 방향 · forcePrompt · result.idToken · access_token 조건부 · 취소/실패 분류"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/native/__tests__/native-google-login.test.ts (22 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/login 앱 분기 — 앱은 네이티브 로그인 → location.replace(safeNext), 브라우저는 종전 OAuth · //evil.com → / · 문구 · 진행 중 비활성"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/app/login/__tests__/page.test.tsx (9 tests)"
        status: pass
      - kind: e2e
        ref: "playwright e2e/specs/auth-guards.spec.ts auth-session.spec.ts brand-account.spec.ts (19 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "mobile/ 플러그인 설치·설정 · iOS URL scheme · 양 플랫폼 빌드"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:build:ios → BUILD SUCCEEDED"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:build:android → BUILD SUCCESSFUL"
        status: pass
    human_judgment: false
  - id: D4
    description: "실제 Google 계정으로 첫 로그인 · 재로그인 · 로그아웃 후 재로그인 → Supabase 세션 생성(iOS · Android)"
    requirement: MOBILE-01
    verification:
      - kind: automated_ui
        ref: "Android 에뮬레이터 CDP 구동: 버튼 → initialize/login(forcePrompt · nonceSet=true) → Credential Manager 시트 표시 → 뒤로가기 취소 → oauth_denied 문구"
        status: pass
    human_judgment: true
    rationale: "실제 계정 선택·id_token 발급·Supabase aud/nonce 검증은 사용자 Google 계정이 필요하다 — 21-16 UAT"

duration: 11min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 15: 네이티브 Google 로그인 (D-03) Summary

**앱의 「Google로 로그인」이 `window.Capacitor.nativePromise('SocialLogin', …)` 로 네이티브 계정 선택을 띄우고, SHA-256 해시 nonce 로 받은 id_token 을 raw nonce 와 함께 `supabase.auth.signInWithIdToken` 에 넘겨 기존 Supabase 쿠키 세션을 만든다. 브라우저는 종전 OAuth 그대로이고, 두 플랫폼 빌드와 Android 실기동 시트 호출까지 확인했다.**

## Performance

- **Duration:** 약 11분 (빌드·에뮬레이터 구동 포함)
- **Started:** 2026-09-25T23:48:36Z
- **Completed:** 2026-09-26T00:00Z
- **Tasks:** 3/3
- **Files modified:** 13 (생성 3 · 수정 10)

## Accomplishments

- `native-google-login.ts`: `randomNonce`(getRandomValues 32바이트 hex) · `sha256Hex`(crypto.subtle) · `classifyNativeLoginError` · `nativeGoogleSignIn` — initialize `{ webClientId: WEB, iOSClientId: IOS, iOSServerClientId: WEB, mode: 'online' }` → login `{ provider: 'google', options: { nonce: SHA256(raw), forcePrompt: true } }` → `signInWithIdToken({ provider, token: result.idToken, nonce: raw, access_token? })`. webapp 의존성 추가 0, 토큰 로그 0.
- `/login`: `isNativeApp()` 이면 네이티브 경로 → 성공 시 `window.location.replace(safeNext)`, 취소 → `oauth_denied`, 그 외/`{ error }` → `auth_failed`(기존 문구). 진행 중 `disabled`·`aria-busy`. 브라우저 경로(`signInWithOAuth` + `prompt=select_account`)는 그대로.
- `mobile/`: `@capgo/capacitor-social-login` 8.5.11 exact · `SocialLogin.providers` google 만 true(sync 훅이 플러그인 Package.swift/gradle.properties 에서 Facebook·Alamofire 를 뺐다) · Info.plist `CFBundleURLTypes`(`google` / `com.googleusercontent.apps.1023658565518-ch3hgiuq8kqk5r33c3e4er92uvkmdgrj`) · cap sync 생성물 커밋.

## Task Commits

1. **Task 1: native-google-login 서비스** — `ef122d2` (test, RED) → `0585d28` (feat, GREEN)
2. **Task 2: /login 앱 분기** — `b4141e4` (test, RED) → `4c2e585` (feat, GREEN)
3. **Task 3: 플러그인 설치·설정·빌드** — `7f725ec` (feat)

`commits: 6` 은 `rev-list ca3b570..HEAD` 실측이다. 이 중 `94e40a3 fix(quick-260926-bwu)` 는 **다른 세션의 커밋**이 실행 도중 master 에 들어온 것이고, 이 플랜의 커밋은 5개다.

## Android · iOS 추가 요건 확인 결과 (플랜 output 요구)

- **Android:** `MainActivity.kt` 무변경. 플러그인 `GoogleProvider.java` 는 `mode == OFFLINE`(L439) 또는 `scopes` 명시(L477)일 때만 `ModifiedMainActivityForSocialLoginPlugin` 구현을 요구한다. 이번 구성은 online + scopes 없음이라 해당 없음(Task 1 에서 scopes 를 뺀 이유). 병합 매니페스트에 Credential Manager 전이 권한 `USE_CREDENTIALS` · `USE_BIOMETRIC` · `USE_FINGERPRINT` 가 추가됐다(AD_ID 없음). `usesCleartextTraffic` 없음, 생성 설정은 `https://trade.jx1.io` · `cleartext: false`.
- **iOS:** 추가한 것은 Info.plist `CFBundleURLTypes` 하나다. README 의 Google iOS 절은 initialize 만 요구하고, AppDelegate `GIDSignIn.handle(url)` 예시는 Facebook+Google 결합 섹션이다. 템플릿 `SceneDelegate` 는 이미 `SceneDelegateProxy` 로 openURL 을 넘긴다. Privacy manifest(ITMS-91056) 섹션은 스토어 제출 때 볼 항목이라 Deferred. 빌드 산출물 `App.app` 에 `GoogleSignIn_GoogleSignIn.bundle` · `AppAuth` · `GTMAppAuth` 번들과 `SocialLoginPlugin` 심볼이 링크된 것을 확인했다.

## 런타임 검증 (가능한 범위)

- **Android 에뮬레이터(Medium_Phone_API_36.1, dev URL):** smoke `SMOKE OK ready platform=android` 뒤 WebView DevTools(CDP)로 `/login` 버튼을 클릭했다.
  - `html.native-app` · `isSecureContext: true` · `crypto.subtle` 존재 확인.
  - 호출 순서 실측: `initialize`(클라이언트 ID 3개 · online) → `login { provider: 'google', options: { nonce: <64hex>, forcePrompt: true } }`.
  - logcat `GoogleProvider: Google login request: … forcePrompt=true nonceSet=true` → `CredentialChooserActivity`(Google 로그인 시트) 표시. 진행 중 버튼 `disabled`.
  - 뒤로가기 취소 → 플러그인 reject `{ code: 'USER_CANCELLED', message: 'Google Sign-In cancelled by user' }` → 화면 alert 「Google 로그인을 취소하셨습니다. 계속하려면 다시 시도해주세요.」, 버튼 다시 활성. 취소 분류가 실제 오류 모양과 맞는다.
  - logcat 의 debug 서명 SHA-1 = `83:1A:3B:99:1C:37:45:00:D4:6B:90:AC:49:CC:14:F0:F0:12:C3:D3`. 21-03 Android 클라이언트 등록값과 같아야 한다(UAT 에서 `[28444]` 가 나면 이것부터 대조).
- **iOS 시뮬레이터(iPhone 17, dev URL):** `SMOKE OK ready platform=ios` 로 플러그인 링크 상태에서 기동을 확인했다. 시뮬레이터 WebView 원격 클릭 도구가 없어 버튼 → GIDSignIn 시트 확인은 21-16 UAT 에 넘긴다.
- 두 스모크 모두 종료 시 운영 URL 로 재 sync 됐다(iOS/Android 생성 설정 `https://trade.jx1.io` · `cleartext: false` 재확인). 띄운 에뮬레이터·시뮬레이터·dev 서버(:3100)는 모두 종료했다.

## Verification

- `vitest --run src/lib/native/__tests__/native-google-login.test.ts` → 22 passed
- `vitest --run src/app/login/__tests__/page.test.tsx src/lib/native` → 7 files / 78 passed
- webapp 전체 단위: 120 files / 2259 passed · 1 skipped
- `pnpm --filter @gh-radar/webapp run typecheck` → 통과 · eslint(변경 파일) 0 problems
- Playwright `auth-guards` · `auth-session` · `brand-account` → 19 passed (브라우저 로그인 회귀 없음)
- `native:build:ios` → `** BUILD SUCCEEDED **` · `native:build:android` → `BUILD SUCCESSFUL`
- Acceptance grep: `forcePrompt: true` 1 · `crypto.subtle.digest('SHA-256'` 1 · `getRandomValues` 1 · `signInWithIdToken` ≥1 · console 토큰 로그 0 · webapp `@capacitor/`·`@capgo/` 의존성 0 · `/login` `isNativeApp()` 1 · `nativeGoogleSignIn(createClient())` 1 · `window.location.replace(safeNext)` 1 · `signInWithOAuth` ≥1 · `disabled={pending}` 1 · mobile 버전 8.5.11 · `SocialLogin` ≥1 · `google: true` 1 · plist `com.googleusercontent.apps.` 있음 · 금지 키 0 · `Package.swift` capgo ≥1 — 전부 PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 성공 뒤 버튼 재활성 방지**
- **Found during:** Task 2
- **Issue:** 플랜 코드의 `finally { setPending(false) }` 는 `location.replace` 직후 버튼을 다시 켠다. 페이지가 떠나는 동안 재탭하면 계정 선택 시트가 다시 뜨고 nonce 가 엇갈린다.
- **Fix:** 실패 경로(`{ error }` · catch)에서만 `setPending(false)` 를 부른다. 테스트에 「성공 뒤에도 disabled」 단언을 추가했다.
- **Files modified:** webapp/src/app/login/page.tsx, webapp/src/app/login/__tests__/page.test.tsx
- **Commit:** 4c2e585

**2. [Rule 1 - Bug] 주석이 acceptance grep 을 2줄로 만드는 문제**
- **Found during:** Task 1
- **Issue:** 머리 주석에 `getRandomValues` · `forcePrompt: true` 문자열이 있어 「정확히 1줄」 기준이 깨졌다.
- **Fix:** 주석 표현만 바꿨다(「Web Crypto 난수」 · 「forcePrompt 를 켠다」).
- **Commit:** 0585d28

**3. [Rule 3 - Blocking] 서비스 테스트 목 타입이 typecheck 에서 실패**
- **Found during:** Task 2 verify(typecheck)
- **Issue:** 인자 없는 `vi.fn(async () => …)` 라 `mock.calls[0][0]` 이 빈 튜플 타입이다(TS2493).
- **Fix:** `vi.fn<(credentials: Record<string, unknown>) => Promise<unknown>>` 로 명시했다.
- **Commit:** 4c2e585

**4. [Rule 2 - Correctness] 취소 코드 숫자 경계 매칭**
- **Found during:** Task 1
- **Issue:** `-5` · `12501` 을 단순 부분일치하면 `-50` 같은 다른 오류 코드도 「취소」로 오분류된다.
- **Fix:** `/(^|\D)-5(\D|$)/` · `/(^|\D)12501(\D|$)/` 로 바꿨다. 플랜 behavior 케이스는 모두 통과한다.
- **Commit:** 0585d28

**Total deviations:** 4 auto-fixed (Rule 1 ×2 · Rule 2 ×1 · Rule 3 ×1). **Impact:** 모두 플랜 계약 안의 품질 보강이고 범위 확장은 없다.

## Issues Encountered

- iOS SPM: `swift package resolve --disable-keychain` 로 GoogleSignIn 등 새 패키지 캐시를 먼저 채웠다(21-01 키체인 행 우회, 15초). 그 뒤 xcodebuild 가 캐시에서 해석해 멈추지 않았다. 부산물 `CapApp-SPM/.build` · `Package.resolved` 는 삭제해 커밋하지 않았다(앱 워크스페이스 `Package.resolved` 만 커밋).
- 플러그인 `capacitor:sync:before` 훅은 pnpm 저장소 안 자기 `Package.swift`·`gradle.properties` 를 고쳐 쓴다(21-01 에서 인지한 동작). 새 클론·`pnpm install` 뒤에는 빌드 전 `cap sync` 가 필요하고, `native:build:*` 스크립트가 이미 sync 를 먼저 돌린다.

## User Setup Required

없음 — 21-03 에서 GCP OAuth 클라이언트 3개와 Supabase Client IDs 등록이 끝났다. 21-16 UAT 에서 실제 계정 로그인으로 확인한다.

## UAT 로 넘기는 항목 (21-16)

1. iOS 시뮬레이터: 「Google로 로그인」 → GIDSignIn 시트 → 계정 선택 → `/` 또는 `?next` 로 이동 · 로그인 상태
2. Android 에뮬레이터: 같은 흐름. Credential Manager 계정 선택 → 세션. `[28444]` 이면 debug SHA-1(위 값)·패키지명을 GCP Android 클라이언트와 대조
3. 재로그인(forcePrompt — iOS 옛 토큰 복원 문제 Pitfall 6 회귀 확인) · 로그아웃 후 재로그인
4. 취소 → 「Google 로그인을 취소하셨습니다…」(Android 는 이번에 실측 통과, iOS 는 GIDSignIn 취소 코드 `-5` 모양 확인)
5. 운영 URL 로 쓰려면 웹 push(21-16 게이트) 뒤 확인 — 현재 `https://trade.jx1.io` 에는 이 웹 변경이 아직 없다

## Next Phase Readiness

- 21-16(운영 설정 검사 · README · UAT · push) 준비 완료. 이 플랜은 push 하지 않았다.

## Self-Check: PASSED

- FOUND: webapp/src/lib/native/native-google-login.ts · webapp/src/lib/native/__tests__/native-google-login.test.ts · webapp/src/app/login/__tests__/page.test.tsx
- FOUND commits: ef122d2 · 0585d28 · b4141e4 · 4c2e585 · 7f725ec
