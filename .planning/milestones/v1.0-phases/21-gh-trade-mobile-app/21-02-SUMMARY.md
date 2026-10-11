---
phase: 21-gh-trade-mobile-app
plan: 02
subsystem: mobile
tags: [capacitor, android, kotlin, bridgeactivity, bridgewebviewclient, javascriptinterface, emulator, smoke]

requires:
  - phase: 21-01
    provides: "@gh-radar/mobile 패키지 · capacitor.config.ts(appId com.ghtrade.app · server.url 운영 기본 · CAP_SERVER_URL dev) · 웹 NATIVE_DETECT_SCRIPT(window.GhTradeBridge 로 ready 송신)"
provides:
  - "Android 프로젝트 mobile/android (Capacitor 8.5.2 템플릿 · applicationId/namespace com.ghtrade.app · app_name GH Trade · min 24 / compile·target 36)"
  - "MainActivity : BridgeActivity (Kotlin) — load() 에서 super 뒤 GhTradeWebViewClient 설치 · GhTradeBridge JS 인터페이스 · serverHost() · onUrlChanged(url) · onNativeMessage(type, payload)"
  - "GhTradeWebViewClient : BridgeWebViewClient — onPageFinished · doUpdateVisitedHistory → onUrlChanged"
  - "GhTradeBridge — @JavascriptInterface postMessage(json) · UI 스레드 · 호스트 검사 · 타입 화이트리스트"
  - "mobile/scripts/smoke-android.sh + native:smoke:android — 「SMOKE OK ready platform=android」"
affects: [21-12, 21-13, 21-14, 21-15, 21-16]

actuals:
  tokens: 12600
  tasks: 2
  commits: 2
plan_head_before: b8c588b5f99a2a513ff0b362a9345f56fadbd78f

tech-stack:
  added: ["org.jetbrains.kotlin:kotlin-gradle-plugin 2.2.21 (buildscript classpath)", "Android Gradle Plugin 8.13.0 · Gradle 8.14.3 (Capacitor 템플릿)"]
  patterns:
    - "Android 확장은 load() 에서 super.load() 뒤 · WebView 클라이언트는 BridgeWebViewClient 상속본을 bridge.setWebViewClient 로(통째 교체 금지)"
    - "JS 인터페이스 수신은 runOnUiThread 로 넘긴 뒤 현재 WebView URL 호스트 == server.url 호스트 · JSON · 타입 화이트리스트 순으로 거른다"
    - "Android dev 스모크 = adb reverse tcp:3100 + CAP_SERVER_URL=http://localhost:3100 sync, EXIT trap 으로 운영 sync"

key-files:
  created:
    - mobile/android/ (cap add android 템플릿 — build.gradle · variables.gradle · settings.gradle · capacitor.settings.gradle · app/build.gradle · AndroidManifest.xml · res/** · gradle wrapper)
    - mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
    - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt
    - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeBridge.kt
    - mobile/scripts/smoke-android.sh
  modified:
    - mobile/package.json

key-decisions:
  - "Kotlin Gradle plugin 2.2.21 그대로 사용(1.9.22 폴백 불필요) · jvmTarget '21' (capacitor.build.gradle compileOptions Java 21 과 동일) — kotlinOptions DSL 이 AGP 8.13 에서 오류 없이 동작"
  - "템플릿 MainActivity.java 삭제 → Kotlin MainActivity. kotlin-stdlib 명시 선언 없음(KGP 자동)"
  - "브리지 출처 검사는 host 비교(bridge.config.serverUrl ?: bridge.appUrl) — iOS 21-01 과 같은 기준"
  - "dev 스모크는 에뮬레이터를 스크립트가 끄지 않는다(iOS 스모크가 시뮬레이터를 두는 것과 동일) — 이미 떠 있는 기기는 재사용"

patterns-established:
  - "Android 새 Kotlin 파일은 app/src/main/java/com/ghtrade/app/ 에 두기만 하면 된다(iOS pbxproj 같은 수동 등록 불필요)"
  - "logcat 태그 GHTrade — ready 는 Log.i, 그 외 타입·url 은 Log.d"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "Android 셸 빌드 — cap add android · Kotlin MainActivity/GhTradeWebViewClient/GhTradeBridge 가 assembleDebug 로 컴파일"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:build:android → BUILD SUCCESSFUL in 26s (Kotlin e: 0)"
        status: pass
      - kind: other
        ref: "Task 1 acceptance_criteria grep/test 10건 (Java MainActivity 부재 · 클라이언트 교체/가로채기/HTTP 오류/옛 뒤로가기 0 · storePassword 0 등)"
        status: pass
    human_judgment: false
  - id: D2
    description: "확장 슬라이스 end-to-end — 에뮬레이터 GH Trade 셸이 dev 웹(:3100)을 로드하고 웹의 ready 가 GhTradeBridge 로 도착해 logcat GHTrade 에 기록, 종료 시 운영 URL 재sync"
    requirement: MOBILE-01
    verification:
      - kind: integration
        ref: "pnpm --filter @gh-radar/mobile run native:smoke:android → SMOKE OK ready platform=android (2회: PID 27919 · 28453)"
        status: pass
      - kind: other
        ref: "node -e … android/app/src/main/assets/capacitor.config.json server.url === https://trade.jx1.io (cleartext false · cordova 플러그인 매니페스트 usesCleartextTraffic 없음)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 02: GH Trade Android 셸 Summary

**Capacitor 8.5.2 Android 셸(`com.ghtrade.app`)에서 Kotlin `MainActivity : BridgeActivity` 가 `BridgeWebViewClient` 상속본과 `GhTradeBridge` JS 인터페이스를 설치했다. API 36.1 에뮬레이터에서 dev 웹 `/login` 을 로드하면 웹이 보낸 `ready` 가 logcat `GHTrade` 에 `ready platform=android nativeApp=true` 로 찍힌다(KGP 2.2.21 · jvmTarget 21).**

## Performance

- **Duration:** 4 min (실행분 — 컨텍스트 읽기 제외)
- **Started:** 2026-09-25T15:18:30Z
- **Completed:** 2026-09-25T15:22:33Z (KST 2026-09-26 00:22)
- **Tasks:** 2
- **Files modified:** 57 (템플릿 생성물 53 + Kotlin 3 중 포함 · 스모크 스크립트 · package.json)

## Accomplishments

- **Android 확장 슬라이스 통과:** `native:smoke:android` 「SMOKE OK ready platform=android」 2회(서로 다른 PID). 스크린샷에서 dev 웹 `/login` 이 셸 안에 렌더됨을 확인했다. iOS 21-01 과 같은 채널 규약(`{type,payload}` JSON)이 Android 에서도 성립한다.
- Kotlin 3파일: WebView 클라이언트를 **상속 + `bridge.setWebViewClient`** 로 설치했다(Pitfall 4 — 로컬 에셋 가로채기·HTTP 오류 콜백 미오버라이드). 옛 back 콜백과 DecorView 인셋 리스너는 없다(Pitfall 5·8).
- `GhTradeBridge.postMessage` — 메서드 1개. UI 스레드 전환 → 현재 URL 호스트 == server.url 호스트 → JSON 파싱 → 화이트리스트(`ready`·`route`·`theme`·`overlay`·`pull`) 순으로 거른다(T-21-03 · T-21-02).
- 스모크 종료 뒤 생성 설정이 `https://trade.jx1.io` · `cleartext:false` 로 복원됐고, cordova 플러그인 매니페스트에 `usesCleartextTraffic` 이 없다(Pitfall 15 · T-21-01).
- release 서명 설정은 이식하지 않았다(`storePassword` 0 · T-21-14).

## Task Commits

1. **Task 1: `cap add android` + Kotlin MainActivity·GhTradeWebViewClient·GhTradeBridge** — `666ed1a` (feat)
2. **Task 2: 에뮬레이터 스모크 — ready 수신 · 운영 sync 복원** — `3810915` (test)

**Plan metadata:** (이 SUMMARY 커밋)

## Files Created/Modified

- `mobile/android/**` — `cap add android` 템플릿. 수정한 곳: `build.gradle`(KGP 2.2.21 classpath) · `app/build.gradle`(`kotlin-android` · `kotlinOptions { jvmTarget = '21' }`). 템플릿 `MainActivity.java` 는 삭제했다. `strings.xml`(`GH Trade`)·`variables.gradle`(min 24 · 36/36)·`AndroidManifest.xml`(`configChanges` 에 `uiMode|orientation|screenSize` 있음)는 템플릿값 그대로다.
- `mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt` — `BridgeActivity` 서브클래스 · `serverHost()` · `onUrlChanged` · `onNativeMessage` · 태그 `GHTrade`
- `mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt` — `BridgeWebViewClient(bridge)` 상속 · `onPageFinished` / `doUpdateVisitedHistory` → `onUrlChanged`
- `mobile/android/app/src/main/java/com/ghtrade/app/GhTradeBridge.kt` — `@JavascriptInterface postMessage`
- `mobile/scripts/smoke-android.sh` — (a)~(i) 플랜 순서 그대로, 실행 권한 있음
- `mobile/package.json` — `native:smoke:android` (다른 키 무변경)

## Decisions Made

| 항목 | 확정값 | 근거 |
|---|---|---|
| **KGP 버전** | `2.2.21` (폴백 1.9.22 불필요) | 첫 `assembleDebug` BUILD SUCCESSFUL, Kotlin 경고·오류 없음(RESEARCH A1 해소) |
| **jvmTarget** | `'21'` | `app/capacitor.build.gradle` 의 `compileOptions` 가 `JavaVersion.VERSION_21` |
| 호스트 기준 | `bridge.config.serverUrl ?: bridge.appUrl` 의 host | iOS `bridge.config.serverURL.host` 와 대칭 |
| 에뮬레이터 수명 | 스크립트는 띄우기만 하고 끄지 않는다 | iOS 스모크 동작과 대칭 · 재실행 시 부팅 생략 |

## Deviations from Plan

### Minor

**1. MainActivity 에 `private val handler = Handler(Looper.getMainLooper())` 를 두지 않음**
- **Found during:** Task 1 ③
- **Issue:** UI 스레드 전환은 ⑤ 지시대로 `GhTradeBridge` 가 `host.runOnUiThread` 로 한다. 그래서 이 플랜에서는 `handler` 를 쓰는 곳이 없다(미사용 private 필드 경고).
- **Fix:** 넣지 않았다. 지연 실행이 필요한 21-12·21-13 이 필요할 때 더한다.
- **Committed in:** 666ed1a

**2. 스모크 스크립트 소소한 보강**
- `ANDROID_HOME/platform-tools` 를 PATH 앞에 둔다(셸 PATH 에 adb 가 없어도 동작).
- 부팅 대기 타임아웃 시 `SMOKE FAIL` 로 끝낸다.
- `assembleDebug -q` 로 판정 줄이 빌드 로그에 묻히지 않게 했다(21-01 iOS `-quiet` 와 같은 이유).
- **Committed in:** 3810915

---

**Total deviations:** 2 minor (범위 변화 없음). **Impact:** 없음.

## Issues Encountered

- `gsd-tools query git.base-branch --is-protected master` 가 `true` 를 돌려준다. 오케스트레이터가 순차 실행(isolation none · main tree · master 커밋)을 명시했고 21-01 도 master 에 커밋했으므로 그대로 진행했다. push 는 하지 않았다(21-16 게이트).
- 실행 중 띄운 webapp dev 서버(:3100)와 에뮬레이터는 모두 종료했다(`adb devices` 비어 있음 · :3100 LISTEN 0).

## Known Stubs

없음. `onUrlChanged`(로그만) · `route`/`theme`/`overlay`/`pull`(debug 로그만)은 21-12·21-13 이 채우기로 계획된 분할이다. 이 플랜의 목표(ready 수신)를 막지 않는다.

## User Setup Required

없음.

## Next Phase Readiness

- 21-12(탭바 · `TabRoutes` · `TabRoutesTest`)는 `MainActivity.onUrlChanged` · `onNativeMessage("route"…)` 위에 붙는다. 21-13(뒤로가기 `onBackPressedDispatcher` · 오프라인 `onReceivedError` · 테마 · 당겨서 새로고침)은 `GhTradeWebViewClient` 와 `load()` 위에 붙는다.
- Pitfall 16: 로그인·relay 까지 확인하려면 스모크에 `adb reverse tcp:8080` · `tcp:8090` 을 더해야 할 수 있다(이 플랜은 ready 만 확인하므로 3100 만).
- 스크린샷상 상태바 영역이 풀블리드가 아니다(웹이 상태바 아래에서 시작). 인셋·풀블리드는 21-06·21-13 범위다.

## Self-Check: PASSED

- 파일 5개 FOUND (MainActivity.kt · GhTradeWebViewClient.kt · GhTradeBridge.kt · smoke-android.sh · app/build.gradle) · MainActivity.java 부재 확인
- 커밋 FOUND: 666ed1a · 3810915 (`git rev-list --count b8c588b..HEAD` = 2)
- 검증: native:build:android BUILD SUCCESSFUL · native:smoke:android SMOKE OK ×2 · 운영 URL 복원 node 검사 exit 0 · Task 1·2 acceptance 전부 PASS

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*
