---
phase: 21-gh-trade-mobile-app
plan: 12
subsystem: mobile
tags: [android, kotlin, tab-bar, capacitor, webview, junit, vector-drawable, native-bridge]

requires:
  - phase: 21-02
    provides: "MainActivity(BridgeActivity) · GhTradeWebViewClient.onUrlChanged · GhTradeBridge.onNativeMessage · smoke-android.sh"
  - phase: 21-04
    provides: "웹 route/overlay/pull/theme 메시지 · window.__ghTrade.navigate"
  - phase: 21-10
    provides: "iOS TabRoutes 36건 표 · 탭바 수치·동작(오프라인 스킴+호스트 판정 · ready 오버레이 해제)"
provides:
  - "TabRoutes.kt — TabId(HOME·SEARCH·TRADING·AI·ME, path·title) · TabRoutes.normalize/activeTabFor/hidesTabBar (순수 Kotlin)"
  - "TabRoutesTest.kt — iOS tab-routes-check.swift 와 같은 36건 · native:test:android"
  - "GhTradePalette.of(theme) — D-27a hex(다크/라이트)"
  - "GhTradeTabBar(FrameLayout) — onSelect · setActive(TabId?) · apply(palette) · fadeView · 폭 최대 560 onMeasure"
  - "MainActivity — rootLayout · tabBar · currentTheme · currentPath · isOfflinePage · overlayOpen · pullBlocked · updateTabBarVisibility() · selectTab(tab)"
  - "res/drawable/ic_tab_{home,search,trading,ai,me}(_fill).xml"
affects: [21-13, 21-16]

actuals:
  tokens: 10500
  tasks: 3
  commits: 4
plan_head_before: 210681fd2fa7ba553666a88fc1ace37033aad2de

tech-stack:
  added: []
  patterns:
    - "경로표는 android.* 없는 순수 Kotlin + JVM JUnit(testDebugUnitTest) — JUnit XML 을 TAP 로 옮겨 tdd-red-evidence 판정"
    - "인셋 리스너는 탭바 뷰에만 — SystemBars 가 DecorView 에서 다듬은 인셋(웹 CSS 주입값과 같은 값)을 받는다"
    - "IME 감지는 rootLayout 전역 레이아웃 콜백에서 getRootWindowInsets().isVisible(ime()) 읽기(리스너 추가 없음)"
    - "최대 폭은 뷰 onMeasure 에서 자른다(MATCH_PARENT + 좌우 16 + 가운데) — 회전·멀티윈도우 재계산 불필요"

key-files:
  created:
    - mobile/android/app/src/main/java/com/ghtrade/app/TabRoutes.kt
    - mobile/android/app/src/test/java/com/ghtrade/app/TabRoutesTest.kt
    - mobile/android/app/src/main/java/com/ghtrade/app/GhTradePalette.kt
    - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeTabBar.kt
    - mobile/android/app/src/main/res/drawable/ic_tab_home.xml
    - mobile/android/app/src/main/res/drawable/ic_tab_home_fill.xml
    - mobile/android/app/src/main/res/drawable/ic_tab_search.xml
    - mobile/android/app/src/main/res/drawable/ic_tab_search_fill.xml
    - mobile/android/app/src/main/res/drawable/ic_tab_trading.xml
    - mobile/android/app/src/main/res/drawable/ic_tab_trading_fill.xml
    - mobile/android/app/src/main/res/drawable/ic_tab_ai.xml
    - mobile/android/app/src/main/res/drawable/ic_tab_ai_fill.xml
    - mobile/android/app/src/main/res/drawable/ic_tab_me.xml
    - mobile/android/app/src/main/res/drawable/ic_tab_me_fill.xml
  modified:
    - mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
    - mobile/package.json

key-decisions:
  - "탭 아이콘은 weekly-wine 벡터 대신 스케치 004 채택안 심볼(i-home-o/f 등)을 벡터로 옮겼다 — D-27 「목업 게이트를 통과한 채택안만 옮긴다」에 더 맞고, weekly-wine person_fill 의 흰 머리 path 는 tint 시 같은 색으로 덮여 쓸 수 없다"
  - "폭 min(560, 화면 − 32)은 onConfigurationChanged+screenWidthDp 가 아니라 GhTradeTabBar.onMeasure 에서 자른다"
  - "오프라인 판정은 스킴+호스트(21-10 과 같음) · ready 수신 시 overlayOpen=false(T-21-18) — iOS 와 동작 대칭"
  - "탭바는 첫 앱 서버 URL 판정 전까지 GONE 으로 시작 — 콜드 스타트에서 /login 리다이렉트 전에 잠깐 보이는 깜빡임 방지"
  - "theme 메시지는 dark/light 만 currentTheme 에 저장(적용은 21-13) · pull 은 pullBlocked 저장(소비는 21-13)"

patterns-established:
  - "Android 네이티브 UI 는 템플릿 CoordinatorLayout(rootLayout)에 gravity 로 얹고 WebView 프레임은 건드리지 않는다"

requirements-completed: []  # MOBILE-01 은 Phase 21 여러 플랜 공유 — 형제 플랜 미완이라 표시하지 않음

coverage:
  - id: D1
    description: "D-14 활성 판정 · D-12 ① 경로 숨김 · TabId 순서/경로/제목 36건 JUnit"
    requirement: MOBILE-01
    source: must_have
    status: verified
    evidence: "native:test:android BUILD SUCCESSFUL · TEST-com.ghtrade.app.TabRoutesTest.xml 4 testcase 0 failure"
  - id: D2
    description: "알약 탭바 · 팔레트 · 아이콘 10종 컴파일"
    requirement: MOBILE-01
    source: must_have
    status: verified
    evidence: "native:build:android BUILD SUCCESSFUL"
  - id: D3
    description: "MainActivity 배선 — 인셋(탭바만) · IME · 활성 · 숨김 페이드 · 탭 navigate"
    requirement: MOBILE-01
    source: must_have
    status: verified
    evidence: "native:smoke:android SMOKE OK ready platform=android · 에뮬레이터 시각 시나리오(홈→트레이딩 탭→/stocks 전부 비활성→overlay 숨김/복귀→마이 탭 filled→IME 숨김/복귀)"

duration: 9min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 12: Android 네이티브 플로팅 탭바 Summary

**`MainActivity` 에 Android 알약 탭바를 얹었다. 높이 70 · radius 32 · card 94% 근사 · 1px line 테두리 · elevation 그림자 · 폭은 최대 560이다. 경로 판정은 iOS 와 같은 표를 쓰는 순수 Kotlin `TabRoutes` 이고, JUnit 36건으로 잠갔다. 숨김은 로그인 · 오프라인 · 오버레이 · IME 에서 150ms 지연 후 페이드된다. 탭을 누르면 웹 navigate 훅으로 이동한다. 인셋 리스너는 탭바에만 걸었다.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-25T23:11:51Z
- **Completed:** 2026-09-25T23:20:37Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- `TabRoutes.kt`
  - `TabId` 5탭을 D-06 순서로 두었다. `normalize` · `activeTabFor`(정확 일치) · `hidesTabBar`(`/login` · `/auth` 와 그 하위만)를 구현했다.
  - `android.*` 없이 문자열 연산만 쓴다.
  - `TabRoutesTest` 가 iOS `tab-routes-check.swift` 와 같은 36건을 단언한다(normalize 5 · activeTabFor 20 · hidesTabBar 8 · TabId 3).
- `GhTradePalette` 는 D-27a hex 를 그대로 옮겼다. iOS 와 같은 값이다.
- `GhTradeTabBar`
  - 알약: `GradientDrawable` radius 32 · card α240 · 1px line 테두리 · elevation 8dp(BACKGROUND 외곽선).
  - 항목: 강조 원 46(top 7) · 아이콘 26(top 12) · 라벨 10sp(아이콘 아래 4). 눌림 시 0.55 로 흐려진다. `isSelected` 와 `contentDescription` 을 단다.
  - 페이드: `LinearGradient` 로 bg 0% 에서 시작해 70% 지점부터 92%.
  - 폭 최대 560 은 `onMeasure` 에서 자른다.
- `MainActivity`
  - rootLayout(CoordinatorLayout)에 페이드 120dp 와 탭바 70dp 를 붙였다.
  - 탭바 인셋 리스너가 바닥을 `max(nav − 14, 14)` 로 맞춘다.
  - IME 는 전역 레이아웃 콜백에서 루트 창 인셋을 읽어 감지한다.
  - 메시지 처리:
    - `onUrlChanged` 는 스킴+호스트로 오프라인을 판정한다.
    - `route` 가 경로를 보강한다.
    - `overlay` 가 탭바를 숨기고 보인다.
    - `ready` 에서 오버레이 고착을 푼다.
    - `pull` · `theme` 는 값만 저장한다.
  - 숨김은 150ms 지연 후 200ms 페이드(+8dp)다. 보임은 즉시 200ms 이고, 진행 중인 애니메이션을 먼저 취소한다.
  - `selectTab` 은 `__ghTrade.navigate` 를 호출하고, 오프라인이면 server.url+경로를 `loadUrl` 한다.

## Task Commits

1. **Task 1: TabRoutes + JUnit (TDD)**
   - RED `6137d76`: test(21-12) Android 탭 경로표 JUnit 실패 테스트
   - GREEN `c2c9c28`: feat(21-12) Android TabRoutes 경로표 구현
2. **Task 2: 팔레트 · 알약 탭바 · 아이콘 10종**: `c4ee325`
3. **Task 3: MainActivity 배선**: `4da5d78`

**Plan metadata:** 이 SUMMARY 커밋

## Files Created/Modified

- `mobile/android/app/src/main/java/com/ghtrade/app/TabRoutes.kt`: D-14 · D-12 ① 경로표(순수 Kotlin)
- `mobile/android/app/src/test/java/com/ghtrade/app/TabRoutesTest.kt`: 36건 JUnit
- `mobile/android/app/src/main/java/com/ghtrade/app/GhTradePalette.kt`: D-27a 팔레트
- `mobile/android/app/src/main/java/com/ghtrade/app/GhTradeTabBar.kt`: 알약 탭바 · 항목 · 페이드
- `mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt`: 탭바 배선
- `mobile/android/app/src/main/res/drawable/ic_tab_*.xml`: 벡터 10개
- `mobile/package.json`: `native:test:android`

## Decisions Made

frontmatter 의 `key-decisions` 를 참조한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED 에 컴파일되는 스텁 포함(INVALID_RED 회피)**
- **Found during:** Task 1
- **Issue:** `TabRoutes.kt` 가 없으면 Kotlin 컴파일이 실패한다. 이는 INVALID_RED 다.
- **Fix:** 빈 값을 돌려주는 스텁을 RED 커밋에 넣었다. JUnit XML 을 TAP 모양으로 바꿔 `check tdd-red-evidence` 에 넘겼다. 결과는 `RED_EVIDENCE_OK` 였다(target `activeTabFor` · 3/4 실패).
- **Committed in:** 6137d76

**2. [Rule 1 - Bug] 아이콘 원형을 스케치 채택안으로 교체**
- **Found during:** Task 2
- **Issue:** weekly-wine `ic_tab_person_fill` 은 머리를 흰 path 로 그린다. 코드 tint 를 걸면 머리까지 같은 색이 되어 원이 꽉 찬 덩어리가 된다. 또 D-27 은 목업 게이트를 통과한 채택안만 옮기라고 한다.
- **Fix:** 스케치 004 의 `i-*-o` / `i-*-f` 심볼 10개를 24dp 벡터로 옮겼다. 원은 arc 로, me_fill 의 구멍은 nonZero 역방향 subpath 로 만들었다.
- **Committed in:** c4ee325

**3. [Rule 1 - Bug] 오프라인 판정을 스킴+호스트로(21-10 과 같음)**
- **Found during:** Task 3
- **Issue:** 플랜대로 호스트만 비교하면 dev 에서 `http://localhost:3100` 과 로컬 페이지 `https://localhost` 가 겹친다.
- **Fix:** `uri.host == server.host && uri.scheme == server.scheme` 일 때만 앱 서버 문서로 본다.
- **Committed in:** 4da5d78

**4. [Rule 2 - Critical] `ready` 수신 시 `overlayOpen = false`(T-21-18, iOS 와 대칭)**
- **Found during:** Task 3
- **Issue:** 오버레이가 열린 채 전체 문서 로드가 일어나면 닫힘 신호가 오지 않는다. 그러면 탭바가 영구히 숨는다.
- **Committed in:** 4da5d78

**5. [Rule 1 - Bug] 폭 계산 위치 · 시작 상태**
- **Found during:** Task 3
- **Issue:**
  - `screenWidthDp` 로 계산하면 `onConfigurationChanged` 가 필요하다. 멀티윈도우 폭도 틀린다.
  - VISIBLE 로 시작하면 콜드 스타트에서 `/login` 리다이렉트 전에 탭바가 깜빡인다.
- **Fix:**
  - `GhTradeTabBar.onMeasure` 에서 560 으로 자른다. 레이아웃은 MATCH_PARENT + 좌우 16 + 가운데다.
  - 첫 URL 판정 전까지 GONE 으로 둔다.
- **Committed in:** 4da5d78 (`GhTradeTabBar.kt` 도 이 커밋에 포함)

---

**Total deviations:** 5건을 자동 수정했다(blocking 1 · bug 3 · critical 1). **Impact:** 플랜 인터페이스(`TabId` · `TabRoutes` · `GhTradePalette` · `GhTradeTabBar` · MainActivity 상태/함수)는 그대로다. `rootLayout` · `tabBar` 는 공개 getter 로 두었다(21-13 소비).

## Issues Encountered

- **시각 확인:** 로그인 전에는 모든 경로가 `/login` 으로 리다이렉트된다. 그래서 스모크 스크린샷에서는 탭바가 (정상적으로) 숨는다. 탭바는 저장소 밖 임시 정적 페이지로 확인했다. 스크래치 디렉터리에서 `python3 -m http.server 3101` 로 띄웠다. 이 페이지에는 `__ghTrade.navigate` = pushState + `route` 를 넣었고, overlay 버튼과 input 을 두었다. 앱은 `CAP_SERVER_URL=http://localhost:3101` 로 임시 sync 하고 `adb reverse` 로 연결했다. 확인한 흐름은 다음과 같다.
  - 홈이 활성이다(원 + filled house).
  - 트레이딩 탭을 누르면 navigate 훅이 불리고 트레이딩이 활성이 된다.
  - `/stocks/005930` 에서는 5탭이 모두 비활성이다.
  - overlay open 이면 탭바와 페이드가 숨는다. 4초 뒤 close 되면 다시 보인다.
  - 마이 탭을 누르면 마이가 활성이 된다(filled 원형 아이콘).
  - IME 가 보이면 숨고, back 을 누르면 다시 보인다.
  - 알약 테두리는 (229,232,235) = line 이다. 뒤 텍스트 투과는 ≈251/255 로 사실상 불투명이다. 페이드는 탭바 아래 행을 거의 지운다.
- **IME 확인:** 에뮬레이터는 하드웨어 키보드 모드라 소프트 키보드가 뜨지 않았다. 그래서 `show_ime_with_hard_keyboard` 를 잠시 1로 켰다. 이때 IME 는 Gboard 플로팅 툴바로 떴고, 이 상태로 확인한 뒤 0 으로 되돌렸다.
- **이 에뮬레이터의 인셋:** SystemBars 가 non-passthrough 모드로 돈다(DecorView 가 시스템 바만큼 패딩되고, CSS 인셋 주입은 0). 그래서 탭바가 받는 인셋도 0 이다. 탭바는 콘텐츠 바닥에서 14dp, 화면 끝에서 ≈38dp 에 선다. 웹 `--native-tabbar-offset` 식과 같은 입력이라 서로 어긋나지 않는다. passthrough(WebView ≥ fix 버전 + viewport-fit=cover) 기기에서는 화면 끝 max(nav − 14, 14)가 된다. 제스처 · 3버튼 내비별 여백은 21-16 UAT 에서 본다.
- **복원:** 확인이 끝난 뒤 운영 URL 로 다시 sync 했다(`https://trade.jx1.io` · `cleartext:false` · `usesCleartextTraffic` 없음). 그다음 다시 빌드하고 JUnit 을 재실행했다. 띄웠던 dev 서버(:3100) · 임시 정적 서버(:3101) · 에뮬레이터는 모두 종료했다.
- **다크 팔레트:** 적용 배선은 21-13 이 한다. 이 플랜에서는 `GhTradePalette.of("dark")` 값만 넣었고, 시각 확인은 21-13 · 21-16 에서 한다.

## Known Stubs

없음. `theme` · `pull` 메시지는 값만 저장한다. 적용과 소비는 21-13 의 계획된 범위다.

## User Setup Required

None.

## Next Phase Readiness

- **21-13:** 다음을 이어 붙이면 된다.
  - `currentTheme` 저장값을 복원하고 `tabBar.apply(GhTradePalette.of(...))` 로 적용한다.
  - `rootLayout` 기준으로 WebView 를 SwipeRefreshLayout 으로 감싼다. 탭바와 페이드는 rootLayout 의 자식이라 영향이 없다.
  - `pullBlocked` · `isOfflinePage` 를 새로고침 가능 여부에 쓴다.
  - 오프라인 폴백을 연결한다.
- **21-16 UAT:** 확인할 항목은 다음과 같다.
  - 94% 근사의 시각
  - 제스처 · 3버튼 내비 여백
  - 실제 소프트 키보드
  - 다크
  - 태블릿 560
  - 실제 웹 navigate(relay 소켓 유지)
- push 는 하지 않았다(21-16 게이트).

## TDD Gate Compliance

Task 1 은 RED `6137d76`(test, RED_EVIDENCE_OK) 다음에 GREEN `c2c9c28`(feat) 순서다. REFACTOR 는 없다.

## Self-Check: PASSED

- **파일 FOUND:** TabRoutes.kt · TabRoutesTest.kt · GhTradePalette.kt · GhTradeTabBar.kt · ic_tab_* 10개
- **커밋 FOUND:** 6137d76 · c2c9c28 · c4ee325 · 4da5d78 (`git rev-list --count 210681f..HEAD` = 4)
- **검증:**
  - native:test:android BUILD SUCCESSFUL(4 testcase · 0 failure)
  - native:build:android BUILD SUCCESSFUL
  - SMOKE OK ready platform=android
  - acceptance grep 전부 통과. DecorView · 루트 · WebView 인셋 리스너는 0건이다.

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*
