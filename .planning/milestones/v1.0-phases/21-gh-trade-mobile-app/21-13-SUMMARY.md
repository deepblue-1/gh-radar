---
phase: 21-gh-trade-mobile-app
plan: 13
subsystem: mobile
tags: [android, kotlin, capacitor, webview, swiperefreshlayout, back-navigation, theme, offline, orientation]

requires:
  - phase: 21-02
    provides: "MainActivity(BridgeActivity) · GhTradeWebViewClient(BridgeWebViewClient 상속) · smoke-android.sh"
  - phase: 21-04
    provides: "window.__ghTrade.refresh/back · pull {blocked} · theme {theme} 메시지"
  - phase: 21-11
    provides: "mobile/www/index.html 오프라인 폴백 완성본(?to · ?theme · safeTarget · /icon.svg 도달 탐침)"
  - phase: 21-12
    provides: "rootLayout · tabBar · currentTheme · pullBlocked · overlayOpen · isOfflinePage · selectTab · GhTradePalette"
provides:
  - "ThemeStore (SharedPreferences gh_trade/theme · 기본 light) — load/save"
  - "MainActivity.applyTheme(theme) · showOffline(failedUrl) · handleBack() · swipeRefresh"
  - "GhTradeWebViewClient.onReceivedError — 메인 프레임 + 네트워크 오류 4종만 폴백"
  - "res/values/bools.xml · res/values-sw600dp/bools.xml (is_tablet)"
  - "androidx.swiperefreshlayout:1.2.0 의존성"
affects: [21-16]

actuals:
  tokens: 5500
  tasks: 2
  commits: 2
plan_head_before: 72607d6b0bab4a387da910d0cbdd96a66c587e8e

tech-stack:
  added: ["androidx.swiperefreshlayout:swiperefreshlayout 1.2.0"]
  patterns:
    - "Capacitor 플러그인이 load 중 메인 루퍼에 post 한 작업(SystemBars setStyle)은 load() 끝에서 같은 루퍼에 post 해 뒤에서 덮는다"
    - "server.url 이 있는 Android 셸에서 로컬 폴백은 loadUrl 이 아니라 assets public/index.html 을 loadDataWithBaseURL 로 싣는다"
    - "뒤로가기로 홈에 보낸 직후 한 번 clearHistory — 홈↔하위 경로 왕복 루프 방지"

key-files:
  created:
    - mobile/android/app/src/main/java/com/ghtrade/app/ThemeStore.kt
    - mobile/android/app/src/main/res/values/bools.xml
    - mobile/android/app/src/main/res/values-sw600dp/bools.xml
  modified:
    - mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
    - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt
    - mobile/android/app/build.gradle
    - mobile/android/variables.gradle

key-decisions:
  - "21-13: Android 오프라인 폴백은 assets public/index.html 을 https://localhost/index.html?to=…&theme=… 을 문서 주소로 loadDataWithBaseURL — server.url 이 있으면 Capacitor 로컬 서버가 https://localhost 를 네트워크로 프록시해 loadUrl 은 ERR_CONNECTION_REFUSED"
  - "21-13: Android 테마는 applyTheme 단일 경로(currentTheme private set) · load() 끝에 한 번 더 post 해 SystemBars 의 DEFAULT(OS 다크모드) 스타일을 덮는다"
  - "21-13: 뒤로가기 ③ 홈 이동 뒤 clearHistory 1회 · 로그인/인증 화면에서는 홈 대신 종료 · 웹 back() 이 false 면 네이티브 순서로 이어간다"

patterns-established:
  - "Android 시스템 바는 WindowInsetsControllerCompat 아이콘 명암만 — 창 상태바 색 API 는 쓰지 않는다"

requirements-completed: []  # MOBILE-01 은 Phase 21 여러 플랜 공유 — 형제 플랜 미완이라 표시하지 않음

coverage:
  - id: D1
    description: "당겨서 새로고침 — SwipeRefreshLayout → __ghTrade.refresh(없으면 reload) · 1초 고정 · 상태바 아래 스피너 · 오버레이/pull blocked/오프라인/문서 스크롤 시 비활성 (D-04 · D-17)"
    requirement: MOBILE-01
    source: must_have
    status: verified
    evidence: "에뮬레이터: 당김 1회 → refresh 훅 1회 · 스피너가 상태바 아래 primary 색 · 2초 뒤 스피너 영역 픽셀 0 · 오버레이 열린 채 당김 → 훅 호출 0"
  - id: D2
    description: "뒤로가기 — onBackPressedDispatcher · 오버레이 back() → goBack → 홈 → 종료 (D-26)"
    requirement: MOBILE-01
    source: must_have
    status: verified
    evidence: "에뮬레이터 API 36.1 KEYCODE_BACK: 오버레이 닫힘(back closed) → /stocks/005930 에서 /trading/ 로 goBack → 히스토리 없는 /trading/ 에서 navigate / → 홈에서 종료(런처가 top). 오프라인 폴백에서 뒤로가기 → 종료"
  - id: D3
    description: "테마 추종·저장·첫 프레임·구성 변경 재적용 (D-23)"
    requirement: MOBILE-01
    source: must_have
    status: verified
    evidence: "웹 theme dark → 배경 #17171c · 밝은 상태바 아이콘 · 탭바 다크 · prefs theme=dark → 재실행 첫 화면 다크 · 웹 light 상태에서 cmd uimode night yes → 배경·상태바 아이콘 라이트 유지"
  - id: D4
    description: "폰 세로 · 태블릿 fullSensor (D-24)"
    requirement: MOBILE-01
    source: must_have
    status: verified
    evidence: "requestedOrientation=SCREEN_ORIENTATION_PORTRAIT · user_rotation 1 강제해도 mDisplayRotation=ROTATION_0. 태블릿은 21-16 UAT"
  - id: D5
    description: "네트워크 오류 전용 오프라인 폴백 + 자동 복구 (D-19)"
    requirement: MOBILE-01
    source: must_have
    status: verified
    evidence: "운영 설정 + 비행기 모드 → 'offline fallback for https://trade.jx1.io/' · 폴백 화면 · 비행기 모드 해제 → trade.jx1.io/login 복귀. dev 서버 정지 → 'offline fallback for http://localhost:3100/' → 재기동 뒤 ready 로 복귀"

duration: 13min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 13: Android 셸 시스템 연동 Summary

**Android 셸에 다섯 가지를 붙였다. SwipeRefreshLayout 당겨서 새로고침(1초 고정), Android 16 에서도 동작하는 디스패처 뒤로가기, 웹 테마 추종·저장(SystemBars 덮어쓰기 방지 포함), 폰 세로·태블릿 전방향, 네트워크 오류에서만 뜨는 오프라인 폴백이다. 폴백은 assets 에서 직접 싣는다.**

## Performance

- **Duration:** 약 13분
- **Started:** 2026-09-25T23:32:24Z
- **Completed:** 2026-09-25T23:45Z
- **Tasks:** 2
- **Files modified:** 7 (신규 3)

## Accomplishments

- **당겨서 새로고침(D-04 · D-17):** WebView 를 부모에서 떼어 같은 index 와 layoutParams 로 `SwipeRefreshLayout` 에 넣었다. 당기면 `__ghTrade.refresh()` 를 부르고, 훅이 없으면 `location.reload()` 를 부른다. 스피너는 1초 뒤 닫힌다. 다음 경우에는 당김이 WebView 로 넘어간다.
  - 문서가 위로 스크롤돼 있음
  - `pullBlocked`
  - `overlayOpen`
  - `isOfflinePage`

  스피너는 루트 창 인셋을 한 번 읽어 상태바 아래로 내렸다. 인셋 리스너는 추가하지 않았다.
- **뒤로가기(D-26):** `onBackPressedDispatcher` 콜백 하나로 처리한다. 순서는 다음과 같다.
  1. 오버레이가 열려 있으면 웹 `back()` 을 부른다. 결과가 `true` 가 아니면 다음 단계로 넘어간다.
  2. `goBack`
  3. 홈이 아니면 홈으로 보내고, 도착하면 `clearHistory` 를 한 번 한다.
  4. 홈이면 종료한다.

  로그인·인증 화면에서는 홈 대신 종료한다. 옛 back 오버라이드는 두지 않았다.
- **쿠키:** `onPause` 에서 `CookieManager.flush()` 를 부른다.
- **테마(D-23):** `ThemeStore` 는 `gh_trade`/`theme` 에 저장한다. `applyTheme` 한 곳에서 다음을 바꾸고 저장까지 한다.
  - 상태바·내비바 아이콘 명암
  - DecorView·WebView 배경(#ffffff / #17171c)
  - 탭바
  - 스피너 색

  `load()` 에서 저장값을 칠한다. 이어서 SystemBars 가 post 해 둔 DEFAULT 스타일 뒤에 한 번 더 칠한다. `onConfigurationChanged` 에서는 super 뒤에 재적용한다. OS 다크모드는 보지 않는다.
- **방향(D-24):** `is_tablet` bools 로 `onCreate` 의 `super` 전에 `PORTRAIT` 와 `FULL_SENSOR` 중 하나를 고른다.
- **오프라인(D-19):** 메인 프레임에서 `ERROR_HOST_LOOKUP · CONNECT · IO · TIMEOUT` 이 나면 `showOffline` 을 부른다. 다른 코드는 debug 로그만 남긴다. HTTP 오류 콜백과 요청 가로채기는 오버라이드하지 않았다.

## Task Commits

1. **Task 1: 당겨서 새로고침 · 뒤로가기 · 쿠키 flush** — `afe26e2` (feat)
2. **Task 2: 테마 · 방향 · 오프라인 폴백** — `1a2ee11` (feat)

## Files Created/Modified

- `mobile/android/app/src/main/java/com/ghtrade/app/ThemeStore.kt`: SharedPreferences 테마 저장소
- `mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt`: 새로고침 · 뒤로가기 · 테마 · 방향 · 폴백 · 쿠키
- `mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt`: `onReceivedError` 네트워크 오류 필터
- `mobile/android/app/src/main/res/values/bools.xml`, `mobile/android/app/src/main/res/values-sw600dp/bools.xml`: `is_tablet`
- `mobile/android/app/build.gradle`, `mobile/android/variables.gradle`: swiperefreshlayout 1.2.0

## Verification

- `native:build:android` → BUILD SUCCESSFUL. Task 1 뒤, Task 2 뒤, 마지막 운영 sync 뒤에 각각 돌렸다.
- `native:test:android` → BUILD SUCCESSFUL. TabRoutesTest 4 testcase, 실패 0.
- `native:smoke:android` → `SMOKE OK ready platform=android`. 두 번 돌렸다.
- 마지막 생성 설정은 `https://trade.jx1.io` · `cleartext: false` 다. `usesCleartextTraffic` 은 0건이다.
- acceptance grep 은 두 Task 모두 통과했다.
  - `override fun onBackPressed()` 0건
  - `statusBarColor` 0건
  - `onReceivedHttpError|shouldInterceptRequest` 0건
- 에뮬레이터 확인은 coverage D1~D5 에 적었다.
  - 저장소 밖 임시 정적 페이지(:3101)를 `CAP_SERVER_URL` 로 잠깐 sync 해서 확인했다.
  - 운영 URL 에서는 비행기 모드로, dev 서버에서는 서버를 멈춰서 폴백을 확인했다.
- `mobile/www/index.html` 은 바꾸지 않았다. iOS 재빌드는 해당 없다.

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `loadUrl("https://localhost/index.html…")` 가 ERR_CONNECTION_REFUSED**
- **Found during:** Task 2 에뮬레이터 비행기 모드 확인
- **Issue:** server.url 이 있으면 Capacitor `WebViewLocalServer` 는 `https://localhost` 요청을 에셋으로 응답하지 않고 실제 네트워크로 프록시한다. `isMainUrl` 은 serverUrl 이 null 일 때만 참이다. 로컬 응답 예외는 `server.errorPath` 와 정확히 일치하는 URL 뿐인데, errorPath 는 D-19 에 따라 쓰지 않는다. 그래서 폴백 대신 Chromium 오류 화면이 떴다. RESEARCH 의 「로컬 에셋 서버 = https://localhost」는 server.url 이 없는 경우의 사실이었다.
- **Fix:** cap sync 가 복사한 `assets/public/index.html` 을 읽는다. 같은 `https://localhost/index.html?to=…&theme=…` 를 base·history URL 로 두고 `loadDataWithBaseURL` 로 싣는다. 페이지의 `location.search` 와 출처 판정, `isOfflinePage` 판정은 모두 그대로 동작한다. `shouldInterceptRequest` 는 여전히 오버라이드하지 않는다.
- **Files modified:** MainActivity.kt
- **Commit:** 1a2ee11

**2. [Rule 1 - Bug] 첫 프레임 테마를 SystemBars 가 덮어씀**
- **Found during:** Task 2 구현 중 SystemBars 8.5.2 소스 확인
- **Issue:** `SystemBars.initSystemBars` 는 `setStyle(DEFAULT)` 를 메인 루퍼에 post 한다. 이 호출은 OS 다크모드 기준으로 아이콘 명암을 정하고 DecorView 배경을 windowBackground 로 바꾼다. 그래서 `load()` 안에서 한 번 칠한 테마가 곧바로 덮인다.
- **Fix:** `load()` 끝에서 `Handler(mainLooper).post { applyTheme(currentTheme) }` 로 한 번 더 칠한다. 같은 루퍼는 FIFO 라 우리 post 가 뒤에 돈다. OS 라이트 상태에서 저장값 dark 로 재실행하면 밝은 아이콘이 나오는 것을 확인했다.
- **Commit:** 1a2ee11

**3. [Rule 1 - Bug] 뒤로가기 홈↔하위 경로 루프**
- **Found during:** Task 1
- **Issue:** 플랜 순서를 그대로 따르면 루프가 생긴다. 히스토리가 없는 하위 경로에서 뒤로가기를 누르면 navigate('/') 가 pushState 로 항목을 추가한다. 홈에서 다시 뒤로가기를 누르면 `canGoBack` 이라 하위 경로로 돌아간다. 이 과정이 반복되어 앱이 종료되지 않는다.
- **Fix:** ③ 에서 홈에 도착하면 `clearHistory()` 를 한 번 한다(weekly-wine `pendingHistoryClear` 와 같은 방식). 로그인·인증 화면(`TabRoutes.hidesTabBar`)은 홈으로 보내도 미들웨어가 로그인으로 되돌리므로 종료한다. 에뮬레이터에서 /trading → 홈 → 종료를 확인했다.
- **Commit:** afe26e2

**4. [Rule 2 - Critical] 웹 `back()` 이 false 면 네이티브 순서로 이어감**
- **Issue:** 플랜은 오버레이 상태에서 `back()` 을 부르고 곧바로 return 하게 되어 있다. 이러면 오버레이 신호가 고착된 경우 뒤로가기가 먹지 않는다. 21-04 계약은 「열린 게 없으면 false → 네이티브가 처리」다.
- **Fix:** `evaluateJavascript` 결과가 `"true"` 가 아니면 `navigateBack` 을 부른다.
- **Commit:** afe26e2

**5. [Rule 1 - Bug] `showOffline` 가드를 `isOfflinePage` 대신 폴백 URL 자신으로**
- **Issue:** 플랜은 「이미 오프라인 페이지면 무동작」이다. 그런데 폴백 페이지에서 복귀하다 실패하면 그때 `isOfflinePage` 가 true 다. 그러면 Chromium 오류 화면이 남는다.
- **Fix:** 실패 URL 이 `https://localhost/` 로 시작할 때만 무시한다. 복귀는 도달 탐침이 성공한 뒤에만 일어나므로 빠른 루프는 생기지 않는다.
- **Commit:** 1a2ee11

**6. [Rule 1 - Bug] 스피너 시작 위치**
- **Issue:** 플랜의 `setProgressViewOffset(false, top, …)` 을 쓰면 스피너가 상태바 바로 아래에서 갑자기 나타난다.
- **Fix:** start 를 기본값처럼 −지름(40dp)만큼 올려 `top − 40dp` 로 두었다. end 는 `top + 64dp` 다. 회전 등 구성 변경 때 다시 계산한다.
- **Commit:** afe26e2 · 1a2ee11

---

**Total deviations:** 6건 자동 수정(bug 5 · critical 1). 플랜 인터페이스(`ThemeStore` · `applyTheme` · `showOffline` · `handleBack`)는 그대로다. `currentTheme` 는 `private set` 으로 좁혔다(외부 대입 0건).

## Issues Encountered

- 운영 웹(trade.jx1.io)에는 아직 phase-21 웹 변경이 배포되지 않았다(push 는 21-16). 그래서 비행기 모드에서 복귀한 뒤 `ready` 로그는 나오지 않았다. 대신 CDP 로 URL 이 `https://trade.jx1.io/login?next=%2F` 로 돌아온 것을 확인했다.
- 재실행 직후 스플래시는 여전히 OS 다크모드를 따른다(21-14 values-night). 테마 저장값은 WebView 가 붙은 첫 프레임부터 적용된다.

## Known Stubs

없음.

## Next Phase Readiness

- 21-16 UAT 항목:
  - 실기기 당김 감도와 A13 내부 스크롤 타이밍
  - 제스처 내비·3버튼 뒤로가기
  - 태블릿 회전
  - 앱 사용 중 네트워크가 끊겼을 때 뒤로가기 동작
  - 운영 웹 배포 뒤 테마 메시지 연동
- 이번에 띄운 것(dev 서버 :3100 · 정적 서버 :3101 · 에뮬레이터)은 모두 종료했다. adb forward/reverse 도 제거했다. 에뮬레이터 설정(비행기 모드 off · uimode night no · 회전 자동)은 원래대로 돌려놓았다. 생성 설정은 운영 URL 이다.

## Self-Check: PASSED
