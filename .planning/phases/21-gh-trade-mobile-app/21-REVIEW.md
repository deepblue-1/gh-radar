---
phase: 21-gh-trade-mobile-app
reviewed: 2026-09-26T05:31:28Z
depth: standard
files_reviewed: 135
files_reviewed_list:
  - mobile/.gitignore
  - mobile/README.md
  - mobile/android/.gitignore
  - mobile/android/app/.gitignore
  - mobile/android/app/build.gradle
  - mobile/android/app/capacitor.build.gradle
  - mobile/android/app/proguard-rules.pro
  - mobile/android/app/src/main/AndroidManifest.xml
  - mobile/android/app/src/main/java/com/ghtrade/app/ExternalLinks.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeBridge.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/GhTradePalette.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeTabBar.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/InAppBrowser.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/TabRoutes.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/ThemeStore.kt
  - mobile/android/app/src/main/res/layout/activity_main.xml
  - mobile/android/app/src/main/res/values-night/splash_colors.xml
  - mobile/android/app/src/main/res/values-sw600dp/bools.xml
  - mobile/android/app/src/main/res/values/bools.xml
  - mobile/android/app/src/main/res/values/ic_launcher_background.xml
  - mobile/android/app/src/main/res/values/splash_colors.xml
  - mobile/android/app/src/main/res/values/strings.xml
  - mobile/android/app/src/main/res/values/styles.xml
  - mobile/android/app/src/main/res/xml/file_paths.xml
  - mobile/android/app/src/test/java/com/ghtrade/app/ExternalLinksTest.kt
  - mobile/android/app/src/test/java/com/ghtrade/app/TabRoutesTest.kt
  - mobile/android/build.gradle
  - mobile/android/capacitor.settings.gradle
  - mobile/android/gradle.properties
  - mobile/android/settings.gradle
  - mobile/android/variables.gradle
  - mobile/capacitor.config.ts
  - mobile/ios/.gitignore
  - mobile/ios/App/App.xcodeproj/project.pbxproj
  - mobile/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist
  - mobile/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
  - mobile/ios/App/App/AppDelegate.swift
  - mobile/ios/App/App/Base.lproj/LaunchScreen.storyboard
  - mobile/ios/App/App/Base.lproj/Main.storyboard
  - mobile/ios/App/App/ExternalLinks.swift
  - mobile/ios/App/App/GHTradeBridgeViewController.swift
  - mobile/ios/App/App/GHTradeTabBar.swift
  - mobile/ios/App/App/GHTradeTheme.swift
  - mobile/ios/App/App/Info.plist
  - mobile/ios/App/App/NavigationDelegateProxy.swift
  - mobile/ios/App/App/SceneDelegate.swift
  - mobile/ios/App/App/TabRoutes.swift
  - mobile/ios/App/App/ThemeStore.swift
  - mobile/ios/App/CapApp-SPM/.gitignore
  - mobile/ios/App/CapApp-SPM/Package.swift
  - mobile/ios/App/CapApp-SPM/README.md
  - mobile/ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift
  - mobile/ios/debug.xcconfig
  - mobile/package.json
  - mobile/resources/icon.svg
  - mobile/scripts/check-external-links-ios.sh
  - mobile/scripts/check-sim-entitlements.sh
  - mobile/scripts/check-tab-routes-ios.sh
  - mobile/scripts/external-links-check.swift
  - mobile/scripts/render-resources.mjs
  - mobile/scripts/sharpen-adaptive-icons.sh
  - mobile/scripts/smoke-android.sh
  - mobile/scripts/smoke-ios.sh
  - mobile/scripts/tab-routes-check.swift
  - mobile/scripts/verify-prod-config.mjs
  - mobile/tsconfig.json
  - mobile/www/index.html
  - pnpm-workspace.yaml
  - webapp/e2e/fixtures/native-app.ts
  - webapp/e2e/specs/brand-account.spec.ts
  - webapp/e2e/specs/native-shell.spec.ts
  - webapp/e2e/specs/search-page.spec.ts
  - webapp/e2e/specs/sidebar-tree.spec.ts
  - webapp/e2e/specs/theme-default.spec.ts
  - webapp/src/app/design/_sections/layouts.tsx
  - webapp/src/app/design/page.tsx
  - webapp/src/app/icon.svg
  - webapp/src/app/layout.tsx
  - webapp/src/app/login/__tests__/page.test.tsx
  - webapp/src/app/login/page.tsx
  - webapp/src/app/search/page.tsx
  - webapp/src/components/chat/chat-fab.tsx
  - webapp/src/components/home/home-client.tsx
  - webapp/src/components/layout/__tests__/app-shell-chrome.test.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/layout/__tests__/theme-toggle.test.tsx
  - webapp/src/components/layout/app-header.tsx
  - webapp/src/components/layout/app-shell.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/layout/theme-toggle.tsx
  - webapp/src/components/me/__tests__/account-card.test.tsx
  - webapp/src/components/me/account-card.tsx
  - webapp/src/components/providers/theme-provider.tsx
  - webapp/src/components/scanner/scanner-client.tsx
  - webapp/src/components/search/__tests__/search-page-client.test.tsx
  - webapp/src/components/search/search-page-client.tsx
  - webapp/src/components/stock/__tests__/stock-native-refresh.test.tsx
  - webapp/src/components/stock/stock-detail-client.tsx
  - webapp/src/components/stock/stock-detail-tabs.tsx
  - webapp/src/components/stock/stock-discussion-section.tsx
  - webapp/src/components/stock/stock-hero.tsx
  - webapp/src/components/stock/stock-news-section.tsx
  - webapp/src/components/theme/themes-client.tsx
  - webapp/src/components/trading/__tests__/shared-panels.test.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/lc/number-pad-sheet.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/workbench/alert-toasts.tsx
  - webapp/src/components/trading/workbench/shared-panels.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/ui/dialog.tsx
  - webapp/src/components/ui/sheet.tsx
  - webapp/src/components/watchlist/watchlist-client.tsx
  - webapp/src/lib/__tests__/recent-search.test.ts
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/lib/native/__tests__/google-client-ids.test.ts
  - webapp/src/lib/native/__tests__/native-app-mode.ts
  - webapp/src/lib/native/__tests__/native-bridge-provider.test.tsx
  - webapp/src/lib/native/__tests__/native-detect.test.ts
  - webapp/src/lib/native/__tests__/native-google-login.test.ts
  - webapp/src/lib/native/__tests__/native-overlay.test.tsx
  - webapp/src/lib/native/__tests__/post-native.test.ts
  - webapp/src/lib/native/google-client-ids.ts
  - webapp/src/lib/native/native-bridge-provider.tsx
  - webapp/src/lib/native/native-detect.ts
  - webapp/src/lib/native/native-google-login.ts
  - webapp/src/lib/native/native-overlay-marker.tsx
  - webapp/src/lib/native/post-native.ts
  - webapp/src/lib/native/use-native-refresh.ts
  - webapp/src/lib/recent-search.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/styles/globals.css
findings:
  critical: 0
  warning: 5
  info: 8
  total: 13
status: issues_found
---

# Phase 21: 코드 리뷰 보고서

**검토 시각:** 2026-09-26T05:31:28Z
**깊이:** standard
**검토 파일 수:** 135
**상태:** issues_found

## 요약

Phase 21(GH Trade Capacitor Remote-URL 셸) 전체를 검토했다. 범위는 Android·iOS 네이티브 코드, 오프라인 폴백, 빌드·검증 스크립트, 그리고 webapp 의 Phase 21 변경분이다. webapp 변경분은 앱 분기, 네이티브 Google 로그인, `/search`, safe-area, 당겨서 새로고침 등록을 포함한다. 기존 webapp 파일은 `008273c^..HEAD` diff hunk 만 봤다.

잘 된 부분부터 적는다(아래 결함과는 별개다).
- iOS 브리지는 메인 프레임, 문자열 JSON, 화이트리스트 타입, 호스트를 모두 검사한다.
- `evaluateJavaScript` 에는 상수만 들어간다.
- `navigate()` 는 역슬래시와 제어문자까지 막는다.
- nonce 는 raw/hash 방향이 맞다.
- Capacitor `WebViewDelegationHandler`(8.5.2)는 4인자 `decidePolicyFor` 를 구현하지 않는다. 그래서 프록시의 3인자 가로채기가 우회되지 않는다. node_modules 원본으로 확인했다.
- `URLComponents` 는 `&`·`=`·`#` 를 인코딩한다. 남는 `+` 만 코드가 따로 처리한다. swift 로 실제 실행해 확인했다.

출시를 막을 결함(Critical)은 입증하지 못했다. 대신 아래 다섯 가지 Warning 이 있다.
- **로그인 네이티브 분기의 오픈 리다이렉트 우회.** 같은 phase 가 `navigate()` 에서는 막은 역슬래시 우회가 로그인에서는 열려 있다.
- **Android 자동 백업.** WebView 세션 쿠키가 백업 대상에 들어간다. 주문이 가능한 세션이다.
- **Android 브리지 출처 검사.** iOS 보다 약하다(프레임 미검사).
- **Radix Popover 가 오버레이 계수에서 빠짐.** 그래서 Android 뒤로가기 계약(D-26 ①)이 깨진다.
- **`/search` 의 「응답 도착 검색어」 판정 오류.** 늦게 도착한 응답을 현재 검색어의 결과로 오인한다.

## Warnings

### WR-01: 네이티브 로그인 성공 후 `location.replace(safeNext)` — 역슬래시로 오픈 리다이렉트 가드 우회

**파일:** `webapp/src/app/login/page.tsx:49-52`, `webapp/src/app/login/page.tsx:77`

**문제:**
`safeNext` 가드는 두 가지만 검사한다. `/` 로 시작하는지, `//` 로 시작하지 않는지다.

기존에는 이 값을 서버 `/auth/callback` 이 `${origin}${safeNext}` 문자열 결합으로만 썼다. 앞에 origin 이 붙으므로 안전했다.

Phase 21 의 네이티브 분기는 이 값을 **클라이언트에서 그대로** `window.location.replace(safeNext)` 에 넘긴다. WHATWG URL 파서는 특수 스킴에서 `\` 를 `/` 로 읽는다. 그래서 `?next=/%5Cevil.com` 을 넣으면 가드를 통과하고, 실제로는 `//evil.com`, 즉 외부 호스트로 이동한다. 앱에서는 이 이동이 D-28 인앱 브라우저(Custom Tabs / SFSafariViewController)로 열린다. 사용자는 「방금 로그인한 앱이 띄운 페이지」로 받아들이게 된다.

같은 phase 의 `native-bridge-provider.tsx:81-86` `isSafeInternalPath` 는 이 우회를 알고 막는다(`/\evil` · `/\t/evil`). 로그인만 약한 가드가 남았다.

현재 앱 안에는 로그아웃 상태 사용자에게 조작된 같은 호스트 링크를 전달할 경로가 거의 없다(딥링크 없음). 그래서 실제 악용 가능성은 낮고, Critical 이 아니라 Warning 으로 둔다. 다만 코드 결함 자체는 확실하다.

**수정:** 이미 있는 검증을 공유 모듈로 빼서 쓴다. 두 가드는 한 곳에서 정의해야 한다.
```ts
// lib/safe-path.ts (native-bridge-provider 의 isSafeInternalPath 를 이동해 export)
export function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  return !/[\\\u0000-\u001f\u007f]/.test(path);
}
// login/page.tsx
const safeNext = isSafeInternalPath(rawNext) ? rawNext : '/';
```
`auth/callback/route.ts` 도 같은 함수로 맞추면 가드가 셋으로 갈라지지 않는다.

### WR-02: Android `allowBackup="true"` — WebView 세션 쿠키(Supabase refresh token)가 자동 백업·기기 이전 대상

**파일:** `mobile/android/app/src/main/AndroidManifest.xml:5`

**문제:**
템플릿 기본값 `allowBackup="true"` 가 그대로다. 이 상태에서는 Auto Backup(Google Drive)과 기기 간 이전에 앱 데이터 디렉터리가 들어간다. 여기에는 `app_webview/` 의 쿠키 DB 와 `shared_prefs` 가 포함된다.

`MainActivity.onPause` 는 `CookieManager.flush()` 로 세션 쿠키를 일부러 디스크에 남긴다. 그러면 Supabase 세션(refresh token 포함)이 백업본에 실린다. 이 세션은 relay 주문 전송(`sendOrder`)까지 열리는 트레이딩 세션이다. 백업을 복원하거나 계정을 탈취하면 로그인 없이 세션이 이어질 수 있다.

**수정:** 백업을 끄거나, 최소한 WebView·prefs 를 백업에서 뺀다.
```xml
<application
    android:allowBackup="false"
    android:dataExtractionRules="@xml/data_extraction_rules"
    android:fullBackupContent="false" ...>
```
`data_extraction_rules.xml` 을 쓴다면 `cloud-backup` 과 `device-transfer` 양쪽에서 `<exclude domain="root" path="app_webview/"/>` 로 제외한다.

### WR-03: Android JS 브리지가 모든 프레임의 호출을 받는다 — 출처 판정이 최상위 URL 호스트뿐(iOS 와 불일치)

**파일:** `mobile/android/app/src/main/java/com/ghtrade/app/GhTradeBridge.kt:24-27`, 대조 `mobile/ios/App/App/GHTradeBridgeViewController.swift:109,117-122`

**문제:**
`addJavascriptInterface` 는 페이지 안의 모든 프레임(서드파티 iframe 포함)에 `GhTradeBridge` 를 노출한다.

`handle()` 은 호출 프레임을 보지 않는다. 대신 **최상위 WebView URL** 의 호스트만 `serverHost()` 와 비교한다. 그 결과 최상위 문서가 `trade.jx1.io` 이기만 하면 어떤 하위 프레임도 `overlay`·`theme`·`route`·`pull` 을 보낼 수 있다. 예를 들어 탭바를 영구히 숨기거나, 테마를 바꾸고 `ThemeStore` 에 저장시키거나, 당김을 막을 수 있다.

iOS 는 `message.frameInfo.isMainFrame` 으로 이 경로를 막는다. 두 플랫폼이 같은 위협 모델(T-21-03)에서 다르게 동작한다.

두 플랫폼 모두 호스트만 비교하고 스킴·포트는 보지 않는다. dev 에서는 `http://localhost:3100` 과 오프라인 페이지(`https://localhost` · `capacitor://localhost`)가 같은 출처로 판정된다.

현재 webapp 에 iframe 이 없어 당장 영향은 표시 상태 교란에 그친다. 그래도 방어 계약이 문서(주석)와 다르다.

**수정:** `androidx.webkit` 의 `WebViewCompat.addWebMessageListener` 로 바꾼다. 허용 출처를 규칙으로 지정하고(`setOf("https://trade.jx1.io")` + dev 출처), 콜백의 `isMainFrame` 을 검사한다.
```kotlin
WebViewCompat.addWebMessageListener(wv, "GhTradeBridge", setOf(serverOrigin)) { _, msg, origin, isMainFrame, _ ->
    if (!isMainFrame) return@addWebMessageListener
    handle(msg.data ?: return@addWebMessageListener)
}
```
웹 송신부는 인터페이스 이름이 같고 `postMessage(string)` 시그니처도 같아서 그대로 쓸 수 있다. iOS 쪽도 `frameInfo.securityOrigin` 의 `protocol`/`host`/`port` 로 출처 전체를 비교하도록 맞춘다.

### WR-04: Radix Popover 가 오버레이 참조계수에 없다 — Android 뒤로가기가 팝오버 대신 페이지를 떠난다(D-26 ① 위반)

**파일:** `webapp/src/lib/native/native-bridge-provider.tsx:177-183` · `webapp/src/lib/native/native-overlay-marker.tsx:22-26`. 마커는 `components/ui/dialog.tsx:71` · `components/ui/sheet.tsx:96` · `components/trading/lc/number-pad-sheet.tsx:260` 에만 있다.

**문제:**
`back()` 은 `overlayCountRef.current <= 0` 이면 `false` 를 돌려준다. 그러면 네이티브가 WebView 히스토리를 뒤로 간다.

그런데 `NativeOverlayMarker` 는 Dialog·Sheet·NumberPadSheet Content 에만 들어가 있다. `components/ui/popover.tsx` 를 쓰는 표면은 계수에 잡히지 않는다. 해당 표면은 `scanner/scanner-filters.tsx`(상승률 상위 필터), `theme/theme-chips.tsx`, `trading/lc/setting-group.tsx`(상따 설정), `layout/user-section.tsx` 다.

그래서 팝오버가 열린 상태에서 Android 하드웨어·제스처 뒤로가기를 누르면 팝오버가 닫히지 않고 화면이 이전 페이지로 이동한다. 상따 설정 편집 중이면 편집 맥락을 잃는다. 팝오버가 열린 동안 네이티브 탭바도 숨지 않는다(D-12 ③).

**수정:** `PopoverContent` 에도 같은 마커를 넣는다. Radix DismissableLayer 는 Escape 로 가장 위 레이어만 닫으므로 `back()` 은 수정할 필요가 없다.
```tsx
// components/ui/popover.tsx — PopoverPrimitive.Content 첫 자식
<NativeOverlayMarker />
```
팝오버 때문에 탭바를 숨기고 싶지 않다면 참조계수를 「back 대상」과 「탭바 숨김」 두 종류로 나눈다.

### WR-05: `/search` 의 `settledQuery` 가 응답의 검색어가 아니라 「응답 도착 시점의 입력값」을 기록한다

**파일:** `webapp/src/components/search/search-page-client.tsx:85-93`, `:137-141`

**문제:**
`useDebouncedSearch` 는 진행 중인 요청을 **다음 디바운스 타이머가 발화할 때** 취소한다(`use-debounced-search.ts:35-36`). 이 때문에 다음 순서가 가능하다.

1. 「삼」 요청이 진행 중이다.
2. 사용자가 「삼성」을 입력한다.
3. 300ms 타이머가 발화하기 전에 「삼」 응답이 도착해 `loading=false` 가 된다.

이때 effect 는 `setSettledQuery(trimmedRef.current)` 로 **현재 입력 「삼성」** 을 기록한다. 그 결과 `pending=false` 가 된다. 이 창(≤300ms) 동안 두 가지가 잘못된다.

- 「삼」의 결과가 「삼성」의 결과처럼 보인다. 「삼」 결과가 비었으면 `"삼성" 에 해당하는 종목이 없습니다` 가 뜬다. 이 번쩍임은 코드가 막으려던 바로 그 현상이다.
- Enter(`handleSubmit`)를 누르면 이전 검색어의 첫 결과로 `/stocks/{code}` 에 이동하고, 최근 검색에도 저장된다.

**수정:** 결과가 어느 검색어의 것인지 훅이 함께 돌려주게 한다.
```ts
// use-debounced-search.ts
const [resultsQuery, setResultsQuery] = useState('');
// then/catch 에서 setResultsQuery(trimmed) (요청 시점 값)
return { results, loading, error, resultsQuery };
// search-page-client.tsx
const pending = typing && trimmed !== resultsQuery;
```

## Info

### IN-01: Android `pullBlocked` 가 새 문서에서 초기화되지 않는다

**파일:** `mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt:340-350`, `:360`

**문제:**
전체 로드(새로고침 fallback `location.reload()` · 오프라인 복귀) 직전 마지막 `pull` 값이 `blocked=true` 였다고 하자. 그러면 새 문서에서 첫 `touchstart` 신호가 도착하기 전까지 `pullBlocked` 가 true 로 남는다. 이 때문에 새 문서의 첫 당김이 무시될 수 있다.

`ready` 에서 `overlayOpen` 을 푸는 것과 같은 이유(T-21-18)가 여기에도 해당한다.

**수정:** `"ready"` 분기에서 `pullBlocked = false` 도 함께 설정한다.

### IN-02: 운영 오프라인 폴백의 복귀 허용 출처에 dev 출처가 들어 있다

**파일:** `mobile/www/index.html:94`

**문제:**
`ALLOWED_ORIGINS` 에 `'http://localhost:3100'` 이 들어 있고, 이 목록이 운영 번들에도 그대로 실린다. `to` 는 네이티브만 넣는 값이라 실제 위험은 낮다. 다만 T-21-06 허용 목록의 의도(운영 호스트만 허용)와 어긋난다.

**수정:** 두 가지 중 하나를 택한다.
- `cap sync` 전에 `CAP_SERVER_URL` 로 생성되는 파일 하나에 허용 출처를 굽는다.
- `location.origin` 이 `https://localhost`·`capacitor://localhost` 이고 `?dev=1` 일 때만 localhost 를 허용한다.

### IN-03: Android 오프라인 폴백에서의 뒤로가기 — 세션 도중 오프라인 전환 시 루프 가능성(재현 확인 필요)

**파일:** `mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt:248-257`

**문제:**
21-13 UAT 는 「첫 실행 오프라인 → 뒤로가기 = 종료」만 확인했다.

세션 도중 링크 이동이 네트워크 오류로 끝나면 히스토리는 `[A, 오프라인]` 이 된다. 이 상태에서 `canGoBack()` 은 true 다. 뒤로가기로 A 를 재로드하다 실패하면 `showOffline` 이 다시 뜨고, 사용자가 뒤로가기로 빠져나오지 못하는 루프가 생길 수 있다.

**수정:** 에뮬레이터에서 확인한다. 순서는 「앱 사용 중 비행기 모드 → 링크 탭 → 폴백 → 뒤로가기 반복」이다. 루프가 재현되면 `isOfflinePage` 일 때 `navigateBack` 을 `finish()`(또는 `goBackOrForward(-2)`)로 분기한다.

### IN-04: 주석 수치 불일치 — 본문 예약 108 vs 실제 98

**파일:** `webapp/src/components/stock/stock-detail-tabs.tsx:217`

**문제:** 주석에는 「탭바 몫은 본문 108 이 따로 진다」라고 적혀 있다. 정본 `globals.css` §21 의 `--native-body-reserve` 는 98 이다(D-27b).

**수정:** 주석을 98 로 고친다.

### IN-05: `mobile/README.md` 명령표가 실제 스크립트와 다르다

**파일:** `mobile/README.md:40`(표 전체)

**문제:**
- `native:test:android` 는 실제로 `TabRoutesTest` 와 `ExternalLinksTest` 를 둘 다 돌리는데, 표에는 `TabRoutesTest` 만 적혀 있다.
- `native:check-external-links:ios` 행이 표에 없다.

**수정:** 표에 두 항목을 반영한다.

### IN-06: `viewport.themeColor` 가 OS 다크모드를 따르고 옛 다크 배경색을 쓴다

**파일:** `webapp/src/app/layout.tsx:47-50`

**문제:**
Phase 21 은 두 가지를 바꿨다. OS 다크모드를 보지 않게 했고(D-23 · `enableSystem=false`), 기본 테마를 dark `#17171c` 로 했다(D-23a).

그런데 `themeColor` 는 여전히 `prefers-color-scheme` 미디어로 `#ffffff`/`#0a0a0a` 를 고른다. OS 가 라이트인 브라우저 사용자는 기본 다크 화면 위에 흰 브라우저 크롬을 보게 된다. 다크의 hex 도 새 토큰 `#17171c` 와 다르다.

**수정:** 미디어 분기를 없앤다. 대신 `#17171c` 단일값을 쓰거나, 클라이언트에서 `resolvedTheme` 에 맞춰 `<meta name="theme-color">` 를 갱신한다.

### IN-07: 최근 검색 `code` 형식을 검증하지 않는다

**파일:** `webapp/src/lib/recent-search.ts:24-35`, 사용처 `webapp/src/components/search/search-page-client.tsx:289`

**문제:**
`sanitize` 는 `code` 가 문자열인지만 본다. 그래서 `../me`·`x?y` 같은 값도 `href={`/stocks/${code}`}` 로 들어간다. 같은 출처 안의 경로 조작일 뿐이라 영향은 작다. 다만 파일 주석의 「조작된 값 방어(T-21-32)」보다 방어 범위가 좁다.

**수정:** `sanitize` 에서 종목 코드 형식(`/^[0-9A-Z]{6}$/`)이 아니면 버린다.

### IN-08: 스모크 스크립트가 기기를 지정하지 않는다

**파일:** `mobile/scripts/smoke-ios.sh:47-52`, `mobile/scripts/smoke-android.sh:58-71`

**문제:**
- iOS 는 `xcrun simctl ... booted` 를 쓴다. 다른 시뮬레이터가 이미 부팅돼 있으면 `DEVICE` 가 아닌 기기에 설치될 수 있고, 여러 대면 실패한다.
- Android 는 `adb` 를 `-s` 없이 부른다. 기기가 2대 이상 연결돼 있으면 모든 명령이 실패한다.

**수정:** iOS 는 `simctl list` 에서 `DEVICE` 의 UDID 를 구해 `booted` 대신 쓴다. Android 는 `ANDROID_SERIAL` 을 받아 `adb -s` 로 넘긴다.

---

_검토: 2026-09-26T05:31:28Z_
_리뷰어: Claude (gsd-code-reviewer)_
_깊이: standard_
